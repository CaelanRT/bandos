const { randomUUID } = require('node:crypto');
const { withMutation, checkVersion, canonicalJson, lockRows } = require('../utils/mutation');
const { enqueueNotification } = require('../utils/notification-outbox');
const db = require('../db');
const { prepareSlots } = require('../utils/lineup-slots');
const HttpError = require('../utils/http-error');
const { EventScheduleError, normalizeDatabaseTime, validateEventSchedule } = require('../utils/event-schedule');

const serializeDate = value => value instanceof Date ? value.toISOString().slice(0, 10) : value;
const serializeTimestamp = value => value instanceof Date ? value.toISOString() : value;

function editableEventFields(row) {
  return {
    name: row.name, type: row.type, date: serializeDate(row.event_date),
    startTime: normalizeDatabaseTime(row.start_time), endTime: normalizeDatabaseTime(row.end_time),
    timezone: row.timezone, location: row.location, description: row.description,
    hideFromUninvited: row.hide_from_uninvited,
  };
}

function mapEvent(row) {
  return {
    eventId: row.event_id, bandId: row.band_id, version: row.version,
    ...editableEventFields(row), startsAt: serializeTimestamp(row.starts_at), endsAt: serializeTimestamp(row.ends_at),
    createdByUserId: row.created_by_user_id, isActive: row.is_active,
    createdAt: serializeTimestamp(row.created_at), updatedAt: serializeTimestamp(row.updated_at),
  };
}

async function currentSlots(client, eventId) {
  return (await client.query(`SELECT s.*, row_to_json(i) AS invitation FROM event_slots s
    LEFT JOIN event_invitations i ON i.slot_id=s.slot_id AND i.retired_at IS NULL
    WHERE s.event_id=$1 AND s.retired_at IS NULL ORDER BY s.position`, [eventId])).rows;
}

async function eventDetail(client, row, actor, now) {
  const membership = (await client.query(`SELECT ub.role FROM user_bands ub JOIN bands b USING (band_id)
    WHERE ub.band_id=$1 AND ub.user_id=$2 AND b.is_active=true`,
    [row.band_id, actor])).rows[0];
  const slots = await currentSlots(client, row.event_id);
  const own = slots.find(s => s.invitation?.user_id === actor)?.invitation;
  const leader = membership?.role === 'leader';
  if (!row.is_active || !membership || (row.hide_from_uninvited && !leader && !own)) {
    throw new HttpError(404, 'EVENT_NOT_FOUND', 'Event not found');
  }
  return { ...mapEvent(row), slots: slots.map(s => {
    const i = s.invitation;
    return { slotId: s.slot_id, templateSlotId: s.template_slot_id, instrumentId: s.instrument_id,
      instrumentName: s.instrument_name, label: s.label, position: s.position,
      invitation: i ? { invitationId: i.invitation_id, userId: i.user_id, username: i.username,
        firstName: i.first_name, lastName: i.last_name, status: i.status, respondedAt: i.responded_at ? new Date(i.responded_at).toISOString() : null,
        ...(leader || i.user_id === actor ? { declineReason: i.decline_reason } : {}) } : null };
  }), myInvitationId: own?.invitation_id ?? null, canManage: leader,
  canRespond: Boolean(own && +new Date(row.starts_at) > now) };
}

function invalid(field, message) {
  throw new HttpError(400, 'VALIDATION_ERROR', 'Invalid request body', [{ field, message }]);
}

function slotIntent(s) {
  return { slotId: s.slot_id, templateSlotId: s.template_slot_id, instrumentId: s.instrument_id,
    label: s.label, userId: s.invitation?.user_id ?? null };
}

async function recordInvitationHistory(client, invitationId, actor, kind, status, reason = null) {
  await client.query(`INSERT INTO invitation_history (invitation_id,actor_user_id,kind,status,decline_reason)
    VALUES ($1,$2,$3,$4,$5)`, [invitationId, actor, kind, status, reason]);
}

async function saveEvent(req, res, creating) {
  const bandId = req.band.bandId;
  const actor = req.session.userId;
  const eventId = req.event?.event_id;
  const clock = () => (req.app.locals.sessionClock || Date.now)();
  let event, before, fields, schedule, slots, changed, detailChanged, timeChanged;
  const response = await withMutation(req, {
    discover: async client => ({
      users: req.body.slots?.filter(s => s.userId !== null).map(s => s.userId) || [],
      bands: [bandId], events: creating ? [] : [eventId],
    }),
    authorize: async (client, locked) => {
      const band = locked.bands[0];
      const membership = (await client.query('SELECT role FROM user_bands WHERE band_id=$1 AND user_id=$2', [bandId, actor])).rows[0];
      if (!band?.is_active || !membership) throw new HttpError(404, 'BAND_NOT_FOUND', 'Band not found');
      if (membership.role !== 'leader' || band.owner_user_id !== actor) throw new HttpError(403, 'LEADER_REQUIRED', 'Band leader access required');
      if (!creating) {
        event = locked.events.find(e => e.event_id === eventId && e.band_id === bandId && e.is_active);
        if (!event) throw new HttpError(404, 'EVENT_NOT_FOUND', 'Event not found');
      }
    },
    authorizeReplay: async (client, prior) => {
      if (creating) {
        const [saved] = await lockRows(client, 'events', [prior.response_body.data.event.eventId]);
        if (!saved?.is_active || saved.band_id !== bandId) throw new HttpError(404, 'EVENT_NOT_FOUND', 'Event not found');
      }
    },
    validate: async (client, locked) => {
      // Evaluate the stored boundary before the proposed schedule or version.
      if (!creating && +event.starts_at <= clock()) throw new HttpError(409, 'EVENT_STARTED', 'Events cannot be edited after they have started');
      checkVersion(creating ? locked.bands[0].version : event.version,
        creating ? req.body.templateVersion : req.body.expectedVersion, creating ? 'templateVersion' : 'expectedVersion');
      before = creating ? [] : await currentSlots(client, eventId);
      fields = creating ? {} : editableEventFields(event);
      for (const key of ['name', 'type', 'date', 'startTime', 'endTime', 'timezone', 'location', 'description', 'hideFromUninvited']) {
        if (req.body[key] !== undefined) fields[key] = req.body[key];
      }
      try { schedule = validateEventSchedule(fields, { now: new Date(clock()) }); }
      catch (error) {
        if (!(error instanceof EventScheduleError)) throw error;
        invalid(error.field, error.message);
      }
      slots = req.body.slots === undefined ? null : await prepareSlots(client, bandId, req.body.slots, before, creating);
      timeChanged = !creating && (['date', 'startTime', 'endTime'].some(key => fields[key] !== editableEventFields(event)[key])
        || +schedule.startInstant !== +event.starts_at || +schedule.endInstant !== +event.ends_at);
      detailChanged = creating || timeChanged || canonicalJson(fields) !== canonicalJson(editableEventFields(event));
      changed = detailChanged || (slots !== null && canonicalJson(before.map(slotIntent)) !== canonicalJson(slots.map(s => ({
        slotId: s.slotId ?? null, templateSlotId: s.templateSlotId, instrumentId: s.instrumentId, label: s.label, userId: s.userId,
      }))));
    },
    work: async client => {
      if (changed) {
        const values = [fields.name, fields.type, fields.date, fields.startTime, fields.endTime, fields.timezone,
          fields.location, fields.description, fields.hideFromUninvited, schedule.startInstant, schedule.endInstant];
        event = creating ? (await client.query(`INSERT INTO events
          (name,type,event_date,start_time,end_time,timezone,location,description,hide_from_uninvited,starts_at,ends_at,band_id,created_by_user_id)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`, [...values, bandId, actor])).rows[0]
          : (await client.query(`UPDATE events SET name=$1,type=$2,event_date=$3,start_time=$4,end_time=$5,timezone=$6,
            location=$7,description=$8,hide_from_uninvited=$9,starts_at=$10,ends_at=$11,version=version+1,updated_at=now()
            WHERE event_id=$12 RETURNING *`, [...values, eventId])).rows[0];
        const transitionId = randomUUID();
        const notify = (invitation, kind, category) => enqueueNotification(client, {
          transitionId, kind, category, recipientIdentity: `user:${invitation.user_id}`, recipientUserId: invitation.user_id,
          payload: { subject: kind === 'event_invitation' ? 'New bandOS event invitation' : kind === 'event_removal' ? 'bandOS invitation removed' : 'bandOS event updated',
            text: `${fields.name}\n${fields.date} ${fields.startTime}–${fields.endTime} (${fields.timezone})\n${fields.location}`,
            path: `/bands/${bandId}/events/${event.event_id}` },
        });
        const retainedIds = new Set(slots === null ? before.map(s => s.invitation?.invitation_id)
          : slots.filter(s => s.retained).map(s => s.old.invitation.invitation_id));
        for (const old of before) {
          if (old.invitation && !retainedIds.has(old.invitation.invitation_id)) {
            const replacement = slots?.some(s => s.slotId === old.slot_id && s.userId !== null);
            await client.query(`UPDATE event_invitations SET retired_at=$2,retirement_cause=$3 WHERE invitation_id=$1`,
              [old.invitation.invitation_id, new Date(clock()), replacement ? 'replaced' : 'removed']);
            await notify(old.invitation, 'event_removal', 'removalsAndCancellations');
          } else if (old.invitation && detailChanged && old.invitation.status !== 'declined') {
            if (timeChanged && old.invitation.status === 'accepted') {
              await client.query(`UPDATE event_invitations SET status='pending',responded_at=NULL,decline_reason=NULL
                WHERE invitation_id=$1`, [old.invitation.invitation_id]);
              await recordInvitationHistory(client, old.invitation.invitation_id, actor, 'reconfirmation', 'pending');
            }
            await notify(old.invitation, 'event_update', 'eventUpdates');
          }
        }
        if (slots !== null) {
          // Release position uniqueness before reordering; retired snapshots remain stored.
          await client.query('UPDATE event_slots SET retired_at=$2 WHERE event_id=$1 AND retired_at IS NULL', [event.event_id, new Date(clock())]);
          for (const [position, s] of slots.entries()) {
            const args = [s.instrumentId, s.instrumentName, s.label, position];
            const saved = s.slotId ? (await client.query(`UPDATE event_slots SET instrument_id=$1,instrument_name=$2,
              label=$3,position=$4,retired_at=NULL WHERE slot_id=$5 RETURNING *`, [...args, s.slotId])).rows[0]
              : (await client.query(`INSERT INTO event_slots (instrument_id,instrument_name,label,position,event_id,band_id,template_slot_id)
                VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [...args, event.event_id, bandId, s.templateSlotId])).rows[0];
            if (s.userId !== null && !s.retained) {
              const invitation = (await client.query(`INSERT INTO event_invitations
                (event_id,band_id,slot_id,user_id,username,first_name,last_name,instrument_id,instrument_name,slot_label)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
              [event.event_id, bandId, saved.slot_id, s.userId, s.user.username, s.user.first_name, s.user.last_name,
                s.instrumentId, s.instrumentName, s.label])).rows[0];
              await notify(invitation, 'event_invitation', 'invitations');
            }
          }
        }
      }
      return { status: creating ? 201 : 200, body: { data: { event: await eventDetail(client, event, actor, clock()) } } };
    },
  });
  return res.status(response.status).json(response.body);
}

const createEvent = (req, res) => saveEvent(req, res, true);
const updateEvent = (req, res) => saveEvent(req, res, false);

async function respondToInvitation(req, res) {
  const bandId = req.band.bandId, eventId = req.event.event_id;
  const invitationId = req.params.invitationId, actor = req.session.userId;
  const clock = () => (req.app.locals.sessionClock || Date.now)();
  let event, invitation, isLeader;
  const response = await withMutation(req, {
    discover: async () => ({ bands: [bandId], events: [eventId], event_invitations: [invitationId] }),
    authorize: async (client, locked) => {
      const band = locked.bands[0];
      const member = (await client.query('SELECT role FROM user_bands WHERE band_id=$1 AND user_id=$2', [bandId, actor])).rows[0];
      isLeader = member?.role === 'leader' && band?.owner_user_id === actor;
      event = locked.events.find(e => e.event_id === eventId && e.band_id === bandId && e.is_active);
      invitation = locked.event_invitations.find(i => i.invitation_id === invitationId && i.event_id === eventId
        && i.band_id === bandId && i.user_id === actor && !i.retired_at);
      if (!band?.is_active || !member || !event || !invitation) {
        throw new HttpError(404, 'INVITATION_NOT_FOUND', 'Invitation not found');
      }
    },
    authorizeReplay: async (client, prior) => {
      // Replays retain the committed data, subject to the actor's current privacy permissions.
      const saved = prior.response_body.data.event;
      saved.canManage = isLeader;
      saved.canRespond = +event.starts_at > clock();
      if (!isLeader) for (const slot of saved.slots) {
        if (slot.invitation && slot.invitation.userId !== actor) delete slot.invitation.declineReason;
      }
    },
    validate: async () => {
      if (+event.starts_at <= clock()) throw new HttpError(409, 'EVENT_STARTED', 'Responses cannot change after the event has started');
      checkVersion(event.version, req.body.expectedVersion);
    },
    work: async client => {
      const { status, declineReason } = req.body;
      const statusChanged = status !== invitation.status;
      if (statusChanged || declineReason !== invitation.decline_reason) {
        await client.query(`UPDATE event_invitations SET status=$2,decline_reason=$3,
          responded_at=CASE WHEN $4 THEN $5 ELSE responded_at END WHERE invitation_id=$1`,
        [invitationId, status, declineReason, statusChanged, new Date(clock())]);
        await recordInvitationHistory(client, invitationId, actor, statusChanged ? 'response' : 'reason_changed', status, declineReason);
        event = (await client.query(`UPDATE events SET version=version+1,updated_at=now() WHERE event_id=$1 RETURNING *`, [eventId])).rows[0];
        if (statusChanged) await enqueueNotification(client, {
          transitionId: randomUUID(), kind: 'invitation_response', category: 'invitationResponses',
          recipientIdentity: `leader:${bandId}`, recipientBandId: bandId,
          payload: { subject: 'bandOS invitation response', text: `${invitation.username} ${status} the invitation to ${event.name}.`,
            path: `/bands/${bandId}/events/${eventId}` },
        });
      }
      return { status: 200, body: { data: { event: await eventDetail(client, event, actor, clock()) } } };
    },
  });
  return res.status(response.status).json(response.body);
}

async function listEvents(req, res) {
  const result = await db.query(`SELECT e.* FROM events e WHERE e.band_id=$1 AND e.is_active=true
    AND EXISTS (SELECT 1 FROM user_bands ub JOIN bands b USING (band_id)
      WHERE ub.band_id=e.band_id AND ub.user_id=$2 AND b.is_active=true)
    AND (e.hide_from_uninvited=false OR EXISTS (SELECT 1 FROM user_bands WHERE band_id=e.band_id AND user_id=$2 AND role='leader')
      OR EXISTS (SELECT 1 FROM event_invitations WHERE event_id=e.event_id AND user_id=$2 AND retired_at IS NULL))
    ORDER BY CASE WHEN starts_at > $3 THEN 0 ELSE 1 END,
      CASE WHEN starts_at > $3 THEN starts_at END ASC,
      CASE WHEN starts_at <= $3 THEN starts_at END DESC,event_id`,
  [req.band.bandId, req.session.userId, new Date((req.app.locals.sessionClock || Date.now)())]);
  const events = [];
  for (const row of result.rows) events.push(await eventDetail(db, row, req.session.userId, (req.app.locals.sessionClock || Date.now)()));
  return res.json({ data: { events } });
}

async function getEvent(req, res) {
  return res.json({ data: { event: await eventDetail(db, req.event, req.session.userId, (req.app.locals.sessionClock || Date.now)()) } });
}

async function deleteEvent(req, res) {
  const bandId = req.band.bandId, eventId = req.params.eventId, actor = req.session.userId;
  let event, now;
  const response = await withMutation(req, {
    discover: async () => ({ bands: [bandId], events: [eventId] }),
    authorize: async (client, locked) => {
      const band = locked.bands[0];
      const member = (await client.query('SELECT role FROM user_bands WHERE band_id=$1 AND user_id=$2', [bandId, actor])).rows[0];
      if (!band?.is_active || !member) throw new HttpError(404, 'BAND_NOT_FOUND', 'Band not found');
      if (member.role !== 'leader' || band.owner_user_id !== actor) throw new HttpError(403, 'LEADER_REQUIRED', 'Band leader access required');
      event = locked.events.find(e => e.event_id === eventId && e.band_id === bandId);
      if (!event) throw new HttpError(404, 'EVENT_NOT_FOUND', 'Event not found');
    },
    validate: async () => {
      if (!event.is_active) throw new HttpError(404, 'EVENT_NOT_FOUND', 'Event not found');
      checkVersion(event.version, req.body.expectedVersion);
      now = new Date((req.app.locals.sessionClock || Date.now)());
    },
    work: async client => {
      const invitations = (await client.query(`UPDATE event_invitations SET retired_at=$2,retirement_cause='cancelled'
        WHERE event_id=$1 AND retired_at IS NULL RETURNING *`, [eventId, now])).rows;
      await client.query(`UPDATE events SET is_active=false,version=version+1,updated_at=$2 WHERE event_id=$1`, [eventId, now]);
      if (+event.starts_at > +now) {
        const transitionId = randomUUID();
        for (const invitation of invitations) {
          if (invitation.status === 'declined') continue;
          const current = await client.query('SELECT 1 FROM user_bands WHERE band_id=$1 AND user_id=$2', [bandId, invitation.user_id]);
          if (!current.rowCount) continue;
          await enqueueNotification(client, {
            transitionId, kind: 'event_cancellation', category: 'removalsAndCancellations',
            recipientIdentity: `user:${invitation.user_id}`, recipientUserId: invitation.user_id,
            payload: { subject: 'bandOS event cancelled',
              text: `${event.name}\n${serializeDate(event.event_date)} ${normalizeDatabaseTime(event.start_time)}–${normalizeDatabaseTime(event.end_time)} (${event.timezone})\n${event.location}` },
          });
        }
      }
      return { status: 200, body: { data: { message: 'Event deleted' } } };
    },
  });
  return res.status(response.status).json(response.body);
}

module.exports = { createEvent, listEvents, getEvent, updateEvent, deleteEvent, respondToInvitation, mapEvent };
