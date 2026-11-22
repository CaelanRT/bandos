const { randomUUID } = require('node:crypto');
const { enqueueNotification } = require('./notification-outbox');

// Caller holds the affected user locks and band lock. All event/poll mutations
// share the band lock, so discover these rows here without missing a new save.
async function lockParticipation(client, bandId, now) {
  const events = (await client.query(`SELECT * FROM events
    WHERE band_id=$1 AND is_active=true AND starts_at>$2 ORDER BY event_id FOR UPDATE`, [bandId, now])).rows;
  const polls = (await client.query(`SELECT * FROM polls
    WHERE band_id=$1 AND state='open' ORDER BY poll_id FOR UPDATE`, [bandId])).rows;
  return { events, polls };
}

async function notify(client, resource, assignment, kind) {
  await enqueueNotification(client, {
    transitionId: randomUUID(), kind, category: 'removalsAndCancellations',
    recipientIdentity: `user:${assignment.user_id}`, recipientUserId: assignment.user_id,
    payload: { subject: `bandOS ${kind.replaceAll('_', ' ')}`,
      text: `${resource.name}\n${resource.location}\nTimezone: ${resource.timezone}` },
  });
}

// Also used by account deactivation. Keep historical rows and default mappings;
// applicability is recomputed from current membership by the band serializer.
async function removeMembership(client, bandId, userId, now, cause = 'member_removed') {
  const { events, polls } = await lockParticipation(client, bandId, now);
  for (const event of events) {
    const invitations = (await client.query(`UPDATE event_invitations SET retired_at=$3,retirement_cause=$4
      WHERE event_id=$1 AND user_id=$2 AND retired_at IS NULL RETURNING *`, [event.event_id, userId, now, cause])).rows;
    if (!invitations.length) continue;
    await client.query('UPDATE events SET version=version+1,updated_at=$2 WHERE event_id=$1', [event.event_id, now]);
    for (const invitation of invitations) await notify(client, event, invitation, 'event_removal');
  }
  for (const poll of polls) {
    const assignments = (await client.query(`UPDATE poll_assignments SET retired_at=$3,retirement_cause=$4
      WHERE poll_id=$1 AND user_id=$2 AND retired_at IS NULL RETURNING *`, [poll.poll_id, userId, now, cause])).rows;
    if (!assignments.length) continue;
    await client.query('UPDATE polls SET version=version+1,updated_at=$2 WHERE poll_id=$1', [poll.poll_id, now]);
    // Votes remain attached to the retired generation and disappear from active reads.
    for (const assignment of assignments) await notify(client, poll, assignment, 'poll_removal');
  }
  await client.query('DELETE FROM user_bands WHERE band_id=$1 AND user_id=$2', [bandId, userId]);
  await client.query('UPDATE bands SET version=version+1 WHERE band_id=$1', [bandId]);
}

async function cancelBandParticipation(client, bandId, now) {
  const { events, polls } = await lockParticipation(client, bandId, now);
  for (const event of events) {
    const invitations = (await client.query(`UPDATE event_invitations SET retired_at=$2,retirement_cause='cancelled'
      WHERE event_id=$1 AND retired_at IS NULL RETURNING *`, [event.event_id, now])).rows;
    await client.query('UPDATE events SET is_active=false,version=version+1,updated_at=$2 WHERE event_id=$1', [event.event_id, now]);
    for (const invitation of invitations) {
      if (invitation.status === 'declined') continue;
      const current = await client.query('SELECT 1 FROM user_bands WHERE band_id=$1 AND user_id=$2', [bandId, invitation.user_id]);
      if (current.rowCount) await notify(client, event, invitation, 'event_cancellation');
    }
  }
  for (const poll of polls) {
    const assignments = (await client.query('SELECT * FROM poll_assignments WHERE poll_id=$1 AND retired_at IS NULL', [poll.poll_id])).rows;
    for (const assignment of assignments) await notify(client, poll, assignment, 'poll_cancellation');
    // As with explicit poll cancellation, retain the complete closing snapshot.
    await client.query(`UPDATE polls SET state='cancelled',closed_at=$2,version=version+1,updated_at=$2
      WHERE poll_id=$1`, [poll.poll_id, now]);
  }
}

module.exports = { removeMembership, cancelBandParticipation };
