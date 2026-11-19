const { z } = require('zod');
const db = require('../db');
const { withSessionMutation } = require('./account-session');
const { checkVersion } = require('./mutation');
const { versionSchema } = require('../middleware/validate-mutation');

const preferenceColumns = {
  enabled: 'enabled', invitations: 'invitations', eventUpdates: 'event_updates',
  removalsAndCancellations: 'removals_and_cancellations', invitationResponses: 'invitation_responses',
  pollUpdates: 'poll_updates', pollResponses: 'poll_responses',
};
const preferenceSchema = z.strictObject({ expectedVersion: versionSchema,
  ...Object.fromEntries(Object.keys(preferenceColumns).map(key => [key, z.boolean()])),
});
function preferences(row) {
  return { version: row?.version ?? 1, ...Object.fromEntries(Object.entries(preferenceColumns)
    .map(([key, column]) => [key, row?.[column] ?? true])) };
}
async function getPreferences(req, res) {
  const row = (await db.query('SELECT * FROM notification_preferences WHERE user_id=$1', [req.session.userId])).rows[0];
  res.json({ data: { preferences: preferences(row) } });
}
async function putPreferences(req, res) {
  const body = await withSessionMutation(req, async client => {
    await client.query('INSERT INTO notification_preferences (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [req.session.userId]);
    let row = (await client.query('SELECT * FROM notification_preferences WHERE user_id=$1 FOR UPDATE', [req.session.userId])).rows[0];
    checkVersion(row.version, req.body.expectedVersion);
    const entries = Object.entries(preferenceColumns);
    if (entries.some(([key, column]) => req.body[key] !== row[column])) {
      row = (await client.query(`UPDATE notification_preferences SET version=version+1,
        ${entries.map(([, column], i) => `${column}=$${i + 2}`).join(',')}
        WHERE user_id=$1 RETURNING *`, [req.session.userId, ...entries.map(([key]) => req.body[key])])).rows[0];
    }
    return { data: { preferences: preferences(row) } };
  });
  res.json(body);
}
module.exports = { preferenceColumns, preferenceSchema, preferences, getPreferences, putPreferences };
