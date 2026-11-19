const { createHash } = require('node:crypto');
const db = require('../db');
const HttpError = require('./http-error');
const { loadAccount, checkSession, boundCookie } = require('./account-session');
const { idSchema, versionSchema, voteVersionSchema, idempotencyKeySchema, parse } = require('../middleware/validate-mutation');

// JSON object order is irrelevant; array order and every submitted value matter.
function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  const json = JSON.stringify(value);
  if (json === undefined) throw new TypeError('Mutation intent must be JSON');
  return json;
}

function requestHash(body) {
  return createHash('sha256').update(canonicalJson(body)).digest();
}

// Public serializers remain authoritative. This guard prevents credential-bearing
// fields accidentally reaching either the first response or its persisted replay.
function publicResponse(body) {
  return JSON.parse(JSON.stringify(body, (key, value) =>
    /password|token|secret|cookie|authorization|session_generation/i.test(key) ? undefined : value));
}

const lockTables = {
  users: 'user_id', bands: 'band_id', events: 'event_id', polls: 'poll_id',
  event_invitations: 'invitation_id', poll_assignments: 'assignment_id', poll_vote_rows: 'assignment_id',
};

// Candidates must be discovered before calling this, never by acquiring a later
// lock then going back for a user. Callers recheck candidates/authorization after.
async function lockRows(client, table, ids) {
  const column = lockTables[table];
  if (!column) throw new TypeError('Unsupported mutation lock table');
  const ordered = [...new Set(ids.map(id => parse(idSchema, id, column)))].sort((a, b) => a - b);
  if (!ordered.length) return [];
  return (await client.query(`SELECT * FROM ${table} WHERE ${column} = ANY($1::bigint[]) ORDER BY ${column} FOR UPDATE`, [ordered])).rows;
}

function checkVersion(actual, expected, field = 'expectedVersion') {
  parse(field === 'expectedVoteVersion' ? voteVersionSchema : versionSchema, expected, field);
  if (actual !== expected) throw new HttpError(409, 'STALE_VERSION', 'Resource has changed; reload before saving');
}

// before/after must be normalized domain projections, excluding version/timestamps.
// Keep the version update and all domain/outbox writes inside the changed branch.
async function applyChange(before, after, write) {
  if (canonicalJson(before) === canonicalJson(after)) return false;
  await write();
  return true;
}

async function pruneIdempotency(client = db) {
  // No cascade or history tables: expiry never erases domain evidence.
  return client.query('DELETE FROM api_idempotency WHERE expires_at <= clock_timestamp()');
}

// Each callback uses this transaction's client. discover runs on EVERY attempt;
// authorize rechecks current access under locks, including on a replay. validate
// owns version/time/eligibility checks for a NEW action, and runs before work.
async function withMutation(req, { discover = async () => ({}), authorize, validate, work, allowRestricted = false }) {
  if (typeof authorize !== 'function' || typeof validate !== 'function' || typeof work !== 'function') {
    throw new TypeError('Mutation requires authorize, validate and work callbacks');
  }
  const key = parse(idempotencyKeySchema, req.get('Idempotency-Key'), 'Idempotency-Key').toLowerCase();
  const hash = requestHash(req.mutationBody ?? req.body);
  const method = req.method;
  const path = `${req.baseUrl || ''}${req.path}`;
  const actor = req.session?.userId;
  for (let attempt = 0; ; attempt++) {
    const client = await db.pool.connect();
    let committed = false;
    try {
      await client.query('BEGIN');
      await loadAccount(req, client);
      const candidates = await discover(client);
      const locked = {};
      for (const table of Object.keys(lockTables)) {
        const ids = candidates[table] || [];
        locked[table] = await lockRows(client, table, table === 'users' ? [...ids, actor] : ids);
      }
      const user = locked.users.find(row => row.user_id === actor);
      checkSession(req, user);
      if (!allowRestricted && !user.email_verified_at) {
        throw new HttpError(403, 'EMAIL_VERIFICATION_REQUIRED', 'Email verification required');
      }
      await authorize(client, locked, user);
      // The actor lock serializes concurrent requests, including identical keys.
      // A waiter either sees the committed replay or executes after rollback.
      const scope = [actor, method, path, key];
      const prior = (await client.query(`SELECT * FROM api_idempotency
        WHERE actor_user_id=$1 AND method=$2 AND path=$3 AND idempotency_key=$4
          AND expires_at > clock_timestamp()`, scope)).rows[0];
      let response;
      if (prior) {
        if (!prior.request_hash.equals(hash)) throw new HttpError(409, 'IDEMPOTENCY_KEY_REUSED', 'Idempotency key was used for a different request');
        response = { status: prior.response_status, body: prior.response_body };
      } else {
        await validate(client, locked, user);
        const result = await work(client, locked, user);
        if (!Number.isInteger(result.status) || result.status < 200 || result.status > 299) {
          throw new TypeError('Only successful mutation results can be committed');
        }
        response = { status: result.status, body: publicResponse(result.body) };
        await client.query(`DELETE FROM api_idempotency WHERE actor_user_id=$1 AND method=$2 AND path=$3 AND idempotency_key=$4`, scope);
        await client.query(`INSERT INTO api_idempotency (actor_user_id,method,path,idempotency_key,request_hash,response_status,response_body)
          VALUES ($1,$2,$3,$4,$5,$6,$7)`, [...scope, hash, response.status, response.body]);
      }
      // Generation is protected by the account lock; deadlines use current time.
      checkSession(req, user);
      await client.query('COMMIT');
      committed = true;
      req.session.lastActivityAt = new Date((req.app.locals.sessionClock || Date.now)()).toISOString();
      boundCookie(req);
      return response;
    } catch (error) {
      if (!committed) await client.query('ROLLBACK');
      if (!committed && ['40P01', '40001'].includes(error.code) && attempt < 2) continue;
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = { canonicalJson, requestHash, publicResponse, lockRows, checkVersion, applyChange, pruneIdempotency, withMutation };
