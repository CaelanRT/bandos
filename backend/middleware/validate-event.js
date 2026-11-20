const { z } = require('zod');
const HttpError = require('../utils/http-error');
const { idSchema, versionSchema, validateBody } = require('./validate-mutation');
const {
  isValidCalendarDate,
  isValidIanaTimezone,
  isValidRequestTime,
} = require('../utils/event-schedule');

const nameSchema = z.string().trim().min(1).max(100);
const typeSchema = z.enum(['rehearsal', 'performance']);
const dateSchema = z.string().refine(isValidCalendarDate, 'Invalid calendar date');
const timeSchema = z.string().refine(isValidRequestTime, 'Time must use HH:mm');
const timezoneSchema = z.string().trim().max(255).refine(
  isValidIanaTimezone,
  'Invalid IANA timezone',
);
const locationSchema = z.string().trim().min(1).max(255);
const descriptionSchema = z
  .union([z.string().trim().max(2000), z.null()])
  .transform((value) => (value === null || value === '' ? null : value));

const eventFields = {
  name: nameSchema,
  type: typeSchema,
  date: dateSchema,
  startTime: timeSchema,
  endTime: timeSchema,
  timezone: timezoneSchema,
  location: locationSchema,
  description: descriptionSchema,
};

const slotSchema = z.strictObject({
  slotId: idSchema.optional(),
  clientKey: z.uuid().optional(),
  templateSlotId: idSchema.nullable().optional(),
  instrumentId: idSchema,
  label: z.string().trim().min(1).max(50),
  userId: idSchema.nullable(),
}).refine(slot => Boolean(slot.slotId) !== Boolean(slot.clientKey), {
  message: 'Use slotId for an existing slot or clientKey for a new slot',
});
const slotsSchema = z.array(slotSchema).min(1).max(50);

// Schedule checks run against merged, locked data using the server clock.
const createEventSchema = z.strictObject({
  ...eventFields,
  description: descriptionSchema.optional().transform(value => value ?? null),
  templateVersion: versionSchema,
  hideFromUninvited: z.boolean(),
  slots: slotsSchema,
});

const updateEventSchema = z.strictObject({
  ...Object.fromEntries(Object.entries(eventFields).map(([key, schema]) => [key, schema.optional()])),
  expectedVersion: versionSchema,
  hideFromUninvited: z.boolean().optional(),
  slots: slotsSchema.optional(),
});

const eventIdSchema = z
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

function validateEventId(req, res, next) {
  const result = eventIdSchema.safeParse(req.params.eventId);

  if (!result.success) {
    return next(new HttpError(
      400,
      'VALIDATION_ERROR',
      'Invalid event ID',
      validationDetails(result.error, 'eventId'),
    ));
  }

  req.params.eventId = result.data;
  return next();
}

const validateCreateEvent = validateBody(createEventSchema);
const validateUpdateEvent = validateBody(updateEventSchema);

module.exports = {
  createEventSchema,
  updateEventSchema,
  validateCreateEvent,
  validateUpdateEvent,
  validateEventId,
};
