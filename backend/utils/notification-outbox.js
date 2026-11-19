const { randomUUID, createHash } = require('node:crypto');
const { z } = require('zod');
const { preferenceColumns } = require('./notification-preferences');
const { encrypt, decrypt, render, contentSchema, serializeMail } = require('./notification-mail');

const MINUTE = 60000;
const RETRY_OFFSETS = [0, MINUTE, 5 * MINUTE, 30 * MINUTE, 120 * MINUTE, 360 * MINUTE, 720 * MINUTE];
// Leave time for the bounded provider request before the 23h hard boundary.
const SAFE_WINDOW = 23 * 60 * MINUTE - 10000;
const TERMINAL = ['sent', 'suppressed', 'failed', 'delivery_unknown'];
const effectSchema = z.strictObject({
  transitionId: z.uuid(), kind: z.string().min(1).max(100), recipientIdentity: z.string().min(1).max(254),
  category: z.enum(Object.keys(preferenceColumns).filter(key => key !== 'enabled')).optional(),
  securityPurpose: z.enum(['registration_verification', 'password_reset', 'email_change', 'email_change_notice', 'password_changed']).optional(),
  recipientUserId: z.number().int().positive().optional(), recipientBandId: z.number().int().positive().optional(),
  securityAddress: z.email().optional(), tokenId: z.number().int().positive().optional(),
  payload: contentSchema, token: z.string().min(1).optional(), tokenExpiresAt: z.date().optional(),
}).superRefine((value, context) => {
  if (Boolean(value.category) === Boolean(value.securityPurpose)
    || (value.category && (Boolean(value.recipientUserId) === Boolean(value.recipientBandId) || value.securityAddress || value.tokenId || value.token))
    || (value.securityPurpose && (!value.securityAddress || !value.recipientUserId || value.recipientBandId))
    || (Boolean(value.token) !== Boolean(value.tokenId))
    || (Boolean(value.token) !== Boolean(value.tokenExpiresAt))
    || (value.tokenId && !['registration_verification', 'password_reset', 'email_change'].includes(value.securityPurpose))) {
    context.addIssue({ code: 'custom', message: 'Invalid notification recipient or security token' });
  }
});

// Caller MUST pass its domain transaction client. No provider work happens here.
async function enqueueNotification(client, effect, encryptionKey) {
  const value = effectSchema.parse(effect);
  const secret = value.token ? encrypt({ token: value.token }, encryptionKey) : null;
  const selector = value.securityPurpose ? 'security_address' : value.recipientBandId ? 'current_leader' : 'user';
  return (await client.query(`INSERT INTO email_outbox
    (transition_id,kind,recipient_identity,category,security_purpose,recipient_selector,recipient_user_id,recipient_band_id,
     security_recipient_address,token_id,template_version,payload,encrypted_security_payload,security_payload_expires_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,1,$11,$12,$13)
    ON CONFLICT (transition_id,kind,recipient_identity) DO NOTHING RETURNING notification_id`,
  [value.transitionId, value.kind, value.recipientIdentity, value.category ?? null, value.securityPurpose ?? null, selector,
    value.recipientUserId ?? null, value.recipientBandId ?? null, value.securityAddress ?? null, value.tokenId ?? null,
    value.payload, secret, value.tokenExpiresAt ?? null])).rows[0]?.notification_id;
}

function createDispatcher({ pool, adapter, origin, from, encryptionKey, clock = Date.now, random = Math.random }) {
  async function finish(client, row, state, errorClass = null, providerId = null, next = null) {
    const terminal = TERMINAL.includes(state);
    await client.query(`UPDATE email_outbox SET state=$3,last_error_class=$4,provider_id=COALESCE($5,provider_id),
      next_attempt_at=COALESCE($6,next_attempt_at),lease_owner=NULL,lease_expires_at=NULL,
      sent_at=CASE WHEN $3='sent' THEN $7 ELSE sent_at END,
      encrypted_security_payload=CASE WHEN $8 THEN NULL ELSE encrypted_security_payload END,
      security_payload_expires_at=CASE WHEN $8 THEN NULL ELSE security_payload_expires_at END,
      frozen_payload=CASE WHEN $8 AND security_purpose IS NOT NULL THEN NULL ELSE frozen_payload END
      WHERE notification_id=$1 AND lease_owner=$2`,
    [row.notification_id, row.lease_owner, state, errorClass, providerId, next, new Date(clock()), terminal]);
  }

  async function claim() {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const now = clock();
      const row = (await client.query(`SELECT * FROM email_outbox WHERE
        (state IN ('queued','retryable') AND (next_attempt_at <= $1 OR security_payload_expires_at <= $1))
        OR (state='sending' AND lease_expires_at <= $1 AND (next_attempt_at <= $1 OR security_payload_expires_at <= $1))
        ORDER BY next_attempt_at,notification_id LIMIT 1 FOR UPDATE SKIP LOCKED`, [new Date(now)])).rows[0];
      if (!row) { await client.query('COMMIT'); return null; }
      row.lease_owner = randomUUID();
      await client.query(`UPDATE email_outbox SET lease_owner=$2,lease_expires_at=$3 WHERE notification_id=$1`,
        [row.notification_id, row.lease_owner, new Date(now + MINUTE)]);
      if (row.first_attempt_at && (now >= +row.first_attempt_at + SAFE_WINDOW || row.attempt_count >= RETRY_OFFSETS.length)) {
        await finish(client, row, 'delivery_unknown', 'safe_retry_exhausted');
      } else if (row.security_payload_expires_at && now >= +row.security_payload_expires_at) {
        await finish(client, row, row.first_attempt_at ? 'delivery_unknown' : 'suppressed', 'security_expired');
      } else {
        try {
          if (!row.first_attempt_at) {
            const user = (await client.query(`SELECT u.*,p.enabled,p.${Object.values(preferenceColumns).filter(c => c !== 'enabled').join(',p.')}
              FROM users u LEFT JOIN notification_preferences p ON p.user_id=u.user_id
              WHERE u.user_id = ${row.recipient_selector === 'current_leader'
    ? '(SELECT owner_user_id FROM bands WHERE band_id=$1 AND is_active=true)' : '$1'}`,
            [row.recipient_selector === 'current_leader' ? row.recipient_band_id : row.recipient_user_id])).rows[0];
            let obsolete = Boolean(row.encrypted_security_payload && !row.token_id);
            if (row.token_id) {
              const token = (await client.query('SELECT * FROM account_tokens WHERE token_id=$1', [row.token_id])).rows[0];
              const target = row.security_purpose === 'email_change' ? user?.pending_email : user?.email;
              obsolete = !token || token.user_id !== user?.user_id || token.purpose !== row.security_purpose
                || token.consumed_at || token.revoked_at || now >= +token.expires_at
                || (row.security_purpose === 'registration_verification' && user?.email_verified_at)
                || target !== row.security_recipient_address
                || (token.target_email && token.target_email !== row.security_recipient_address);
            }
            if (!user?.is_active || obsolete || (row.category
              && (user.enabled === false || user[preferenceColumns[row.category]] === false))) {
              await finish(client, row, 'suppressed', obsolete ? 'security_obsolete' : 'recipient_suppressed');
              await client.query('COMMIT');
              return { handled: true };
            }
            if (row.template_version !== 1) throw new Error('Unsupported template');
            const secret = row.encrypted_security_payload ? decrypt(row.encrypted_security_payload, encryptionKey) : {};
            const address = row.security_purpose ? row.security_recipient_address : user.email;
            const payload = render(row.payload, { origin, from, address, token: secret.token });
            row.frozen_payload = row.security_purpose ? { encrypted: true } : payload;
            row.encrypted_security_payload = row.security_purpose ? encrypt({ request: payload }, encryptionKey) : null;
            // Notices without a raw token still encrypt their frozen security request.
            row.security_payload_expires_at ||= row.security_purpose ? new Date(now + SAFE_WINDOW) : null;
            row.provider_key = `bandos-notification/${row.notification_id}`;
            row.first_attempt_at = new Date(now);
            row.request_fingerprint = createHash('sha256').update(serializeMail(payload)).digest();
            await client.query(`UPDATE email_outbox SET frozen_recipient_address=$2,frozen_payload=$3,provider_key=$4,
              first_attempt_at=$5,request_fingerprint=$6,encrypted_security_payload=$7,security_payload_expires_at=$8
              WHERE notification_id=$1`, [row.notification_id, address, row.frozen_payload, row.provider_key,
              row.first_attempt_at, row.request_fingerprint, row.encrypted_security_payload, row.security_payload_expires_at]);
          }
          // A recovered lease always uses the previously frozen request/key.
          row.request = row.security_purpose ? decrypt(row.encrypted_security_payload, encryptionKey).request : row.frozen_payload;
          row.attempt_count++;
          const offset = RETRY_OFFSETS[row.attempt_count];
          row.next_attempt_at = new Date(offset === undefined ? now + MINUTE
            : Math.max(now + MINUTE, +row.first_attempt_at + offset + Math.floor(random() * Math.min(offset * 0.1, MINUTE))));
          await client.query(`UPDATE email_outbox SET state='sending',attempt_count=$2,last_attempt_at=$3,next_attempt_at=$4
            WHERE notification_id=$1`, [row.notification_id, row.attempt_count, new Date(now), row.next_attempt_at]);
          await client.query('COMMIT');
          return row;
        } catch (error) {
          // Only local rendering/crypto/validation failures are terminal here.
          // Database errors must roll back so the effect remains recoverable.
          if (error.code && /^[0-9A-Z]{5}$/.test(error.code)) throw error;
          await finish(client, row, row.first_attempt_at ? 'delivery_unknown' : 'failed', 'invalid_payload');
        }
      }
      await client.query('COMMIT');
      return { handled: true };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }

  async function dispatchOne() {
    const row = await claim();
    if (!row) return false;
    if (row.handled) return true;
    if (clock() >= +row.first_attempt_at + SAFE_WINDOW
      || (row.security_payload_expires_at && clock() >= +row.security_payload_expires_at)) {
      await finish(pool, row, 'delivery_unknown', 'dispatch_window_expired');
      return true;
    }
    let result;
    try { result = await adapter.send(row.request, row.provider_key); }
    catch { result = { status: 'transient' }; }
    if (result?.status === 'accepted') {
      await finish(pool, row, 'sent', null, result.id);
    } else if (result?.status === 'permanent') {
      await finish(pool, row, 'failed', 'provider_validation');
    } else {
      const next = new Date(Math.max(+row.next_attempt_at, Number.isFinite(result?.retryAt) ? result.retryAt : 0));
      if (+next >= +row.first_attempt_at + SAFE_WINDOW || row.attempt_count >= RETRY_OFFSETS.length) {
        await finish(pool, row, 'delivery_unknown', 'safe_retry_exhausted');
      } else {
        await finish(pool, row, 'retryable', 'provider_transient', null, next);
      }
    }
    return true;
  }
  let timer;
  let running;
  let stopped = false;
  function start() {
    async function tick() {
      if (stopped) return;
      running = (async () => {
        // Bound work per tick; one request in flight per process.
        for (let count = 0; count < 10 && !stopped; count++) if (!await dispatchOne()) break;
      })();
      try { await running; } catch { console.error('Notification dispatcher unavailable'); }
      if (!stopped) { timer = setTimeout(tick, 1000); timer.unref(); }
    }
    tick();
  }
  async function stop() { stopped = true; clearTimeout(timer); await running; }
  return { dispatchOne, start, stop };
}
module.exports = { enqueueNotification, createDispatcher, RETRY_OFFSETS, SAFE_WINDOW };
