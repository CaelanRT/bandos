const { z } = require('zod');
const { idSchema, versionSchema, voteVersionSchema, validateBody } = require('./validate-mutation');
const { eventFields, slotsSchema } = require('./validate-event');

const { name, location, description, timezone, date, startTime, endTime } = eventFields;
const fields = { name, location, description, timezone, hideFromUninvited: z.boolean() };
const optionSchema = z.strictObject({
  optionId: idSchema.optional(), clientKey: z.uuid().optional(), date, startTime, endTime,
}).refine(option => Boolean(option.optionId) !== Boolean(option.clientKey), {
  message: 'Use optionId for an existing option or clientKey for a new option',
});
const optionsSchema = z.array(optionSchema).min(1).max(30);

module.exports = {
  validateAvailability: validateBody(z.strictObject({
    expectedVersion: versionSchema, expectedVoteVersion: voteVersionSchema,
    answers: z.array(z.strictObject({
      optionId: idSchema, optionRevision: versionSchema, answer: z.enum(['yes', 'no']),
    })).min(1).max(30),
  })),
  validateCreatePoll: validateBody(z.strictObject({
    ...fields, description: description.optional().transform(value => value ?? null),
    templateVersion: versionSchema, slots: slotsSchema, options: optionsSchema,
  })),
  validateUpdatePoll: validateBody(z.strictObject({
    ...Object.fromEntries(Object.entries(fields).map(([key, schema]) => [key, schema.optional()])),
    expectedVersion: versionSchema, slots: slotsSchema.optional(), options: optionsSchema.optional(),
  })),
};
