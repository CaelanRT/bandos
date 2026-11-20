const HttpError = require('./http-error');

function invalid(field, message) {
  throw new HttpError(400, 'VALIDATION_ERROR', 'Invalid request body', [{ field, message }]);
}

// Validate the entire replacement before touching invitations or the outbox.
async function prepareSlots(client, bandId, supplied, before, creating) {
  const instruments = (await client.query('SELECT * FROM instruments WHERE band_id=$1', [bandId])).rows;
  const templates = (await client.query('SELECT slot_id FROM template_slots WHERE band_id=$1', [bandId])).rows;
  const seenIds = new Set(), seenKeys = new Set(), seenUsers = new Set();
  const slots = [];
  for (const [index, value] of supplied.entries()) {
    const field = `slots.${index}`;
    const old = before.find(s => s.slot_id === value.slotId);
    if (value.slotId && (creating || !old || seenIds.has(value.slotId))) invalid(`${field}.slotId`, 'Unknown or duplicate lineup slot');
    if (value.clientKey && seenKeys.has(value.clientKey)) invalid(`${field}.clientKey`, 'Duplicate client key');
    seenIds.add(value.slotId);
    seenKeys.add(value.clientKey);
    const templateId = value.templateSlotId === undefined ? old?.template_slot_id ?? null : value.templateSlotId;
    if (old && templateId !== old.template_slot_id) invalid(`${field}.templateSlotId`, 'Slot provenance cannot be changed');
    if (templateId !== null && !templates.some(t => t.slot_id === templateId)) invalid(`${field}.templateSlotId`, 'Unknown band template slot');
    const instrument = instruments.find(i => i.instrument_id === value.instrumentId);
    if (!instrument) invalid(`${field}.instrumentId`, 'Unknown band instrument');
    const retained = old?.invitation && old.invitation.user_id === value.userId && old.instrument_id === value.instrumentId;
    let user;
    if (value.userId !== null) {
      if (seenUsers.has(value.userId)) invalid(`${field}.userId`, 'A musician can occupy only one slot');
      seenUsers.add(value.userId);
      user = (await client.query(`SELECT u.* FROM users u JOIN user_bands ub USING (user_id)
        WHERE ub.band_id=$1 AND u.user_id=$2 AND u.is_active=true`, [bandId, value.userId])).rows[0];
      if (!user) invalid(`${field}.userId`, 'Musician must be an active current band member');
      if (!retained && !(await client.query(`SELECT 1 FROM member_instruments
        WHERE band_id=$1 AND user_id=$2 AND instrument_id=$3`, [bandId, value.userId, value.instrumentId])).rowCount) {
        invalid(`${field}.userId`, 'Musician is not eligible for this instrument');
      }
    }
    slots.push({ ...value, templateSlotId: templateId, instrumentName: old?.instrument_id === value.instrumentId
      ? old.instrument_name : instrument.name, old, retained: Boolean(retained), user });
  }
  return slots;
}


module.exports = { prepareSlots };
