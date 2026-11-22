const { randomUUID } = require('node:crypto');
const db = require('../db');
const HttpError = require('../utils/http-error');
const { withMutation, checkVersion, canonicalJson, lockRows } = require('../utils/mutation');
const { prepareSlots } = require('../utils/lineup-slots');
const { enqueueNotification } = require('../utils/notification-outbox');
const { EventScheduleError, validateEventSchedule, normalizeDatabaseTime } = require('../utils/event-schedule');

const timestamp = value => value instanceof Date ? value.toISOString() : value;
const date = value => value instanceof Date ? value.toISOString().slice(0, 10) : value;
const notFound = () => new HttpError(404, 'POLL_NOT_FOUND', 'Poll not found');
function invalid(field, message) {
  throw new HttpError(400, 'VALIDATION_ERROR', 'Invalid request body', [{ field, message }]);
}
function pollFields(row) {
  return { name: row.name, location: row.location, description: row.description,
    timezone: row.timezone, hideFromUninvited: row.hide_from_uninvited };
}
function optionFields(row) {
  return { date: date(row.option_date), startTime: normalizeDatabaseTime(row.start_time),
    endTime: normalizeDatabaseTime(row.end_time) };
}
async function currentOptions(client, pollId) {
  return (await client.query(`SELECT o.*,r.option_date,r.start_time,r.end_time,r.starts_at,r.ends_at
    FROM poll_options o JOIN poll_option_revisions r ON r.option_id=o.option_id AND r.revision=o.current_revision
    WHERE o.poll_id=$1 AND o.deleted_at IS NULL ORDER BY o.position`, [pollId])).rows;
}
async function currentSlots(client, pollId) {
  // Match the event lineup validator's assignment shape without coupling it to storage tables.
  return (await client.query(`SELECT s.*,row_to_json(a) AS invitation FROM poll_slots s
    LEFT JOIN poll_assignments a ON a.slot_id=s.slot_id AND a.retired_at IS NULL
    WHERE s.poll_id=$1 AND s.retired_at IS NULL ORDER BY s.position`, [pollId])).rows;
}
async function pollAccess(client, row, actor) {
  if (!row) throw notFound();
  const member = (await client.query(`SELECT ub.role FROM user_bands ub JOIN bands b USING (band_id)
    WHERE ub.band_id=$1 AND ub.user_id=$2 AND b.is_active=true`, [row.band_id, actor])).rows[0];
  const own = (await client.query(`SELECT 1 FROM poll_assignments
    WHERE poll_id=$1 AND user_id=$2 AND retired_at IS NULL`, [row.poll_id, actor])).rowCount > 0;
  const leader = member?.role === 'leader';
  if (!member || (row.hide_from_uninvited && !leader && !own)) throw notFound();
  return { leader, own };
}
async function pollDetail(client, row, actor) {
  const { leader, own } = await pollAccess(client, row, actor);
  const slots = await currentSlots(client, row.poll_id);
  const options = await currentOptions(client, row.poll_id);
  const responses = [];
  for (const slot of slots) {
    const assignment = slot.invitation;
    if (!assignment) continue;
    const vote = (await client.query('SELECT version FROM poll_vote_rows WHERE assignment_id=$1', [assignment.assignment_id])).rows[0];
    const cells = (await client.query(`SELECT c.* FROM poll_vote_cells c JOIN poll_options o
      ON o.option_id=c.option_id AND o.current_revision=c.option_revision AND o.deleted_at IS NULL
      WHERE c.assignment_id=$1 ORDER BY o.position`, [assignment.assignment_id])).rows;
    responses.push({ userId: assignment.user_id, voteVersion: vote?.version ?? 0,
      answers: cells.map(c => ({ optionId: c.option_id, optionRevision: c.option_revision, answer: c.answer })),
      needsResponse: cells.length !== options.length });
  }
  return { pollId: row.poll_id, bandId: row.band_id, version: row.version, ...pollFields(row), state: row.state,
    slots: slots.map(s => ({ slotId: s.slot_id, templateSlotId: s.template_slot_id, instrumentId: s.instrument_id,
      instrumentName: s.instrument_name, label: s.label, position: s.position,
      musician: s.invitation ? { userId: s.invitation.user_id, username: s.invitation.username,
        firstName: s.invitation.first_name, lastName: s.invitation.last_name } : null })),
    options: options.map(o => ({ optionId: o.option_id, revision: o.current_revision, ...optionFields(o),
      startsAt: timestamp(o.starts_at), endsAt: timestamp(o.ends_at) })), responses,
    finalizedEventId: row.finalized_event_id, createdAt: timestamp(row.created_at), updatedAt: timestamp(row.updated_at),
    canManage: leader, canVote: own && row.state === 'open' };
}

function slotIntent(s) {
  return { slotId: s.slot_id, templateSlotId: s.template_slot_id, instrumentId: s.instrument_id,
    label: s.label, userId: s.invitation?.user_id ?? null };
}
function prepareOptions(supplied, before, timezone, now) {
  const seenIds = new Set(), seenKeys = new Set(), ranges = new Set();
  return supplied.map((value, index) => {
    const field = `options.${index}`;
    const old = before.find(o => o.option_id === value.optionId);
    if (value.optionId && (!old || seenIds.has(value.optionId))) invalid(`${field}.optionId`, 'Unknown or duplicate poll option');
    if (value.clientKey && seenKeys.has(value.clientKey)) invalid(`${field}.clientKey`, 'Duplicate client key');
    seenIds.add(value.optionId);
    seenKeys.add(value.clientKey);
    let schedule;
    try { schedule = validateEventSchedule({ ...value, timezone }, { requireFuture: false }); }
    catch (error) {
      if (!(error instanceof EventScheduleError)) throw error;
      invalid(error.field === 'timezone' ? 'timezone' : `${field}.${error.field}`, error.message);
    }
    const changed = !old || ['date', 'startTime', 'endTime'].some(key => value[key] !== optionFields(old)[key])
      || +schedule.startInstant !== +old.starts_at || +schedule.endInstant !== +old.ends_at;
    if (changed && +schedule.startInstant <= now) invalid(`${field}.startTime`, 'Poll option start must be in the future');
    const range = `${+schedule.startInstant}/${+schedule.endInstant}`;
    if (ranges.has(range)) invalid('options', 'Duplicate resolved date/time range');
    ranges.add(range);
    return { ...value, old, changed, ...schedule };
  });
}

async function savePoll(req, res, creating) {
  const bandId = req.band.bandId, pollId = req.params.pollId, actor = req.session.userId;
  let poll, fields, beforeSlots, beforeOptions, slots, options, changed, optionsChanged, now;
  const response = await withMutation(req, {
    discover: async () => ({ users: req.body.slots?.filter(s => s.userId !== null).map(s => s.userId) || [],
      bands: [bandId], polls: creating ? [] : [pollId] }),
    authorize: async (client, locked) => {
      const band = locked.bands[0];
      const member = (await client.query('SELECT role FROM user_bands WHERE band_id=$1 AND user_id=$2', [bandId, actor])).rows[0];
      if (!band?.is_active || !member) throw new HttpError(404, 'BAND_NOT_FOUND', 'Band not found');
      if (!creating) {
        poll = locked.polls.find(p => p.poll_id === pollId && p.band_id === bandId);
        await pollAccess(client, poll, actor);
      }
      if (member.role !== 'leader' || band.owner_user_id !== actor) throw new HttpError(403, 'LEADER_REQUIRED', 'Band leader access required');
    },
    authorizeReplay: async (client, prior) => {
      if (creating) {
        const [saved] = await lockRows(client, 'polls', [prior.response_body.data.poll.pollId]);
        if (!saved || saved.band_id !== bandId) throw notFound();
        await pollAccess(client, saved, actor);
      }
    },
    validate: async (client, locked) => {
      now = (req.app.locals.sessionClock || Date.now)();
      if (!creating && poll.state !== 'open') throw new HttpError(409, 'POLL_CLOSED', 'Poll composition is closed');
      checkVersion(creating ? locked.bands[0].version : poll.version,
        creating ? req.body.templateVersion : req.body.expectedVersion, creating ? 'templateVersion' : 'expectedVersion');
      fields = creating ? {} : pollFields(poll);
      for (const key of ['name', 'location', 'description', 'timezone', 'hideFromUninvited']) {
        if (req.body[key] !== undefined) fields[key] = req.body[key];
      }
      beforeSlots = creating ? [] : await currentSlots(client, pollId);
      beforeOptions = creating ? [] : await currentOptions(client, pollId);
      slots = req.body.slots === undefined ? null : await prepareSlots(client, bandId, req.body.slots, beforeSlots, creating);
      if (creating && !slots.some(s => s.userId !== null)) invalid('slots', 'Select at least one musician');
      const supplied = req.body.options ?? beforeOptions.map(o => ({ optionId: o.option_id, ...optionFields(o) }));
      options = prepareOptions(supplied, beforeOptions, fields.timezone, now);
      optionsChanged = options.some(o => o.changed) || options.length !== beforeOptions.length
        || beforeOptions.some(o => !options.some(value => value.optionId === o.option_id));
      changed = creating || optionsChanged || canonicalJson(fields) !== canonicalJson(pollFields(poll))
        || canonicalJson(options.map(o => o.optionId ?? null)) !== canonicalJson(beforeOptions.map(o => o.option_id))
        || (slots !== null && canonicalJson(beforeSlots.map(slotIntent)) !== canonicalJson(slots.map(s => ({
          slotId: s.slotId ?? null, templateSlotId: s.templateSlotId, instrumentId: s.instrumentId, label: s.label, userId: s.userId,
        }))));
    },
    work: async client => {
      if (changed) {
        const values = [fields.name, fields.location, fields.description, fields.timezone, fields.hideFromUninvited];
        poll = creating ? (await client.query(`INSERT INTO polls
          (name,location,description,timezone,hide_from_uninvited,band_id,created_by_user_id)
          VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [...values, bandId, actor])).rows[0]
          : (await client.query(`UPDATE polls SET name=$1,location=$2,description=$3,timezone=$4,hide_from_uninvited=$5,
            version=version+1,updated_at=now() WHERE poll_id=$6 RETURNING *`, [...values, pollId])).rows[0];
        const transitionId = randomUUID();
        const notify = (assignment, kind, category) => enqueueNotification(client, {
          transitionId, kind, category, recipientIdentity: `assignment:${assignment.assignment_id}`, recipientUserId: assignment.user_id,
          payload: { subject: kind === 'poll_invitation' ? 'New bandOS rehearsal poll' : kind === 'poll_removal' ? 'bandOS poll invitation removed' : 'bandOS poll updated',
            text: `${fields.name}\n${fields.location}\nTimezone: ${fields.timezone}`, path: `/bands/${bandId}/polls/${poll.poll_id}` },
        });
        const retainedIds = new Set(slots === null ? beforeSlots.map(s => s.invitation?.assignment_id)
          : slots.filter(s => s.retained).map(s => s.old.invitation.assignment_id));
        for (const old of beforeSlots) {
          if (old.invitation && !retainedIds.has(old.invitation.assignment_id)) {
            const replacement = slots?.some(s => s.slotId === old.slot_id && s.userId !== null);
            await client.query(`UPDATE poll_assignments SET retired_at=$2,retirement_cause=$3 WHERE assignment_id=$1`,
              [old.invitation.assignment_id, new Date(now), replacement ? 'replaced' : 'removed']);
            await notify(old.invitation, 'poll_removal', 'removalsAndCancellations');
          } else if (old.invitation && optionsChanged) await notify(old.invitation, 'poll_update', 'pollUpdates');
        }
        if (slots !== null) {
          await client.query('UPDATE poll_slots SET retired_at=$2 WHERE poll_id=$1 AND retired_at IS NULL', [poll.poll_id, new Date(now)]);
          for (const [position, s] of slots.entries()) {
            const args = [s.instrumentId, s.instrumentName, s.label, position];
            const saved = s.slotId ? (await client.query(`UPDATE poll_slots SET instrument_id=$1,instrument_name=$2,label=$3,
              position=$4,retired_at=NULL WHERE slot_id=$5 RETURNING *`, [...args, s.slotId])).rows[0]
              : (await client.query(`INSERT INTO poll_slots (instrument_id,instrument_name,label,position,poll_id,band_id,template_slot_id)
                VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [...args, poll.poll_id, bandId, s.templateSlotId])).rows[0];
            if (s.userId !== null && !s.retained) {
              const assignment = (await client.query(`INSERT INTO poll_assignments
                (poll_id,band_id,slot_id,user_id,username,first_name,last_name,instrument_id,instrument_name,slot_label)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`, [poll.poll_id, bandId, saved.slot_id, s.userId,
                s.user.username, s.user.first_name, s.user.last_name, s.instrumentId, s.instrumentName, s.label])).rows[0];
              await notify(assignment, 'poll_invitation', 'invitations');
            }
          }
        }
        // Release positions before reordering, keeping deleted options/revisions as history.
        await client.query('UPDATE poll_options SET deleted_at=$2 WHERE poll_id=$1 AND deleted_at IS NULL', [poll.poll_id, new Date(now)]);
        for (const [position, o] of options.entries()) {
          const revision = o.old ? o.old.current_revision + Number(o.changed) : 1;
          const saved = o.optionId ? (await client.query(`UPDATE poll_options SET position=$2,deleted_at=NULL,current_revision=$3
            WHERE option_id=$1 RETURNING *`, [o.optionId, position, revision])).rows[0]
            : (await client.query('INSERT INTO poll_options (poll_id,position) VALUES ($1,$2) RETURNING *', [poll.poll_id, position])).rows[0];
          if (o.changed) await client.query(`INSERT INTO poll_option_revisions
            (option_id,poll_id,revision,option_date,start_time,end_time,timezone,starts_at,ends_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [saved.option_id, poll.poll_id, revision, o.date,
            o.startTime, o.endTime, fields.timezone, o.startInstant, o.endInstant]);
        }
      }
      return { status: creating ? 201 : 200, body: { data: { poll: await pollDetail(client, poll, actor) } } };
    },
  });
  return res.status(response.status).json(response.body);
}

async function listPolls(req, res) {
  const rows = (await db.query(`SELECT p.* FROM polls p WHERE p.band_id=$1
    AND EXISTS (SELECT 1 FROM user_bands ub JOIN bands b USING (band_id)
      WHERE ub.band_id=p.band_id AND ub.user_id=$2 AND b.is_active=true)
    AND (p.hide_from_uninvited=false OR EXISTS (SELECT 1 FROM user_bands WHERE band_id=p.band_id AND user_id=$2 AND role='leader')
      OR EXISTS (SELECT 1 FROM poll_assignments WHERE poll_id=p.poll_id AND user_id=$2 AND retired_at IS NULL))
    ORDER BY p.updated_at DESC,p.poll_id`, [req.band.bandId, req.session.userId])).rows;
  return res.json({ data: { polls: rows.map(p => ({ pollId: p.poll_id, name: p.name, state: p.state,
    hideFromUninvited: p.hide_from_uninvited, finalizedEventId: p.finalized_event_id, updatedAt: timestamp(p.updated_at) })) } });
}
async function getPoll(req, res) {
  const row = (await db.query('SELECT * FROM polls WHERE poll_id=$1 AND band_id=$2', [req.params.pollId, req.band.bandId])).rows[0];
  return res.json({ data: { poll: await pollDetail(db, row, req.session.userId) } });
}

async function saveAvailability(req, res) {
  const bandId = req.band.bandId, pollId = req.params.pollId, actor = req.session.userId;
  let poll, assignment, vote, answers, access;
  const response = await withMutation(req, {
    discover: async () => ({ bands: [bandId], polls: [pollId] }),
    authorize: async (client, locked) => {
      poll = locked.polls.find(p => p.poll_id === pollId && p.band_id === bandId);
      access = await pollAccess(client, poll, actor);
      if (!access.own) throw notFound();
      // Composition/lifecycle writers share the poll lock. Discover the current
      // generation beneath it, then lock the assignment and its optional row.
      assignment = (await client.query(`SELECT * FROM poll_assignments
        WHERE poll_id=$1 AND user_id=$2 AND retired_at IS NULL FOR UPDATE`, [pollId, actor])).rows[0];
      vote = (await lockRows(client, 'poll_vote_rows', [assignment.assignment_id]))[0];
    },
    authorizeReplay: async (client, prior) => {
      const saved = prior.response_body.data.poll;
      saved.canManage = access.leader;
      saved.canVote = poll.state === 'open';
    },
    validate: async client => {
      if (poll.state !== 'open') throw new HttpError(409, 'POLL_CLOSED', 'Poll is closed');
      checkVersion(poll.version, req.body.expectedVersion);
      checkVersion(vote?.version ?? 0, req.body.expectedVoteVersion, 'expectedVoteVersion');
      const options = await currentOptions(client, pollId);
      const supplied = new Map(req.body.answers.map(a => [a.optionId, a]));
      if (req.body.answers.length !== options.length || supplied.size !== options.length
        || options.some(o => supplied.get(o.option_id)?.optionRevision !== o.current_revision)) {
        invalid('answers', 'Supply exactly one answer for every current option and revision');
      }
      answers = options.map(o => supplied.get(o.option_id));
    },
    work: async client => {
      const before = (await client.query(`SELECT c.option_id AS "optionId",c.option_revision AS "optionRevision",c.answer
        FROM poll_vote_cells c JOIN poll_options o ON o.option_id=c.option_id
          AND o.current_revision=c.option_revision AND o.deleted_at IS NULL
        WHERE c.assignment_id=$1 ORDER BY o.position`, [assignment.assignment_id])).rows;
      if (canonicalJson(before) !== canonicalJson(answers)) {
        await client.query(`INSERT INTO poll_vote_rows (assignment_id,poll_id) VALUES ($1,$2)
          ON CONFLICT (assignment_id) DO UPDATE SET version=poll_vote_rows.version+1,updated_at=now()`,
        [assignment.assignment_id, pollId]);
        for (const a of answers) await client.query(`INSERT INTO poll_vote_cells
          (assignment_id,poll_id,option_id,option_revision,answer) VALUES ($1,$2,$3,$4,$5)
          ON CONFLICT (assignment_id,option_id,option_revision) DO UPDATE SET answer=EXCLUDED.answer`,
        [assignment.assignment_id, pollId, a.optionId, a.optionRevision, a.answer]);
        await enqueueNotification(client, {
          transitionId: randomUUID(), kind: 'poll_response', category: 'pollResponses',
          recipientIdentity: `leader:${bandId}`, recipientBandId: bandId,
          payload: { subject: 'bandOS poll availability',
            text: `${assignment.username} saved availability for ${poll.name}: ${answers.filter(a => a.answer === 'yes').length} Yes, ${answers.filter(a => a.answer === 'no').length} No.`,
            path: `/bands/${bandId}/polls/${pollId}` },
        });
      }
      return { status: 200, body: { data: { poll: await pollDetail(client, poll, actor) } } };
    },
  });
  return res.status(response.status).json(response.body);
}
module.exports = { createPoll: (req, res) => savePoll(req, res, true), updatePoll: (req, res) => savePoll(req, res, false), listPolls, getPoll, saveAvailability };
