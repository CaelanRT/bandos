const { z } = require('zod');
const HttpError = require('../utils/http-error');
const { idSchema, versionSchema, validateBody: validateMutationBody } = require('./validate-mutation');

const bandNameSchema = z.strictObject({
  name: z.string().trim().min(1).max(50),
});

const addMemberSchema = z.strictObject({
  username: z.string().trim().min(3).max(50),
});

const bandIdSchema = z
  .string()
  .regex(/^[1-9]\d*$/)
  .transform(Number)
  .refine(Number.isSafeInteger);

function validationDetails(error, fallbackField) {
  return error.issues.map((issue) => ({
    field: issue.path.join('.') || fallbackField,
    message: issue.message,
  }));
}

function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      return next(
        new HttpError(
          400,
          'VALIDATION_ERROR',
          'Invalid request body',
          validationDetails(result.error, 'body'),
        ),
      );
    }

    req.body = result.data;
    return next();
  };
}

function validateBandId(req, res, next) {
  const result = bandIdSchema.safeParse(req.params.bandId);

  if (!result.success) {
    return next(
      new HttpError(
        400,
        'VALIDATION_ERROR',
        'Invalid band ID',
        validationDetails(result.error, 'bandId'),
      ),
    );
  }

  req.params.bandId = result.data;
  return next();
}

const text = z.string().trim().min(1).max(50);
const creationSlot = z.strictObject({
  instrumentId: idSchema.optional(), instrumentName: text.optional(), label: text,
}).refine(slot => (slot.instrumentId !== undefined) !== (slot.instrumentName !== undefined), {
  message: 'Provide either instrumentId or instrumentName', path: ['instrumentId'],
});
const uniqueIds = z.array(idSchema).refine(ids => new Set(ids).size === ids.length, 'Duplicate instrument IDs');
const validateCreateBand = validateMutationBody(z.strictObject({
  name: text, instrumentation: z.array(creationSlot).min(1).max(50), leaderInstrumentIds: uniqueIds.optional(),
}));
const validateUpdateBand = validateMutationBody(bandNameSchema.extend({ expectedVersion: versionSchema }));
const validateAddInstrument = validateMutationBody(z.strictObject({ name: text, expectedVersion: versionSchema }));
const validateInstrumentation = validateMutationBody(z.strictObject({
  expectedVersion: versionSchema,
  slots: z.array(z.strictObject({ slotId: idSchema.optional(), instrumentId: idSchema, label: text })).min(1).max(50)
    .refine(slots => {
      const ids = slots.flatMap(slot => slot.slotId === undefined ? [] : [slot.slotId]);
      return new Set(ids).size === ids.length;
    }, 'Duplicate slot IDs'),
}));
const validateAddBandMember = validateBody(addMemberSchema);

module.exports = {
  validateAddInstrument,
  validateInstrumentation,
  validateCreateBand,
  validateUpdateBand,
  validateAddBandMember,
  validateBandId,
};
