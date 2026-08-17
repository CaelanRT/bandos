const { z } = require('zod');
const HttpError = require('../utils/http-error');

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

const validateCreateBand = validateBody(bandNameSchema);
const validateUpdateBand = validateBody(bandNameSchema);
const validateAddBandMember = validateBody(addMemberSchema);

module.exports = {
  validateCreateBand,
  validateUpdateBand,
  validateAddBandMember,
  validateBandId,
};
