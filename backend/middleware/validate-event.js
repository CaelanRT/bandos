const { z } = require('zod');
const HttpError = require('../utils/http-error');
const {
  EventScheduleError,
  isValidCalendarDate,
  isValidIanaTimezone,
  isValidRequestTime,
  validateEventSchedule,
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

const createEventSchema = z
  .strictObject({
    ...eventFields,
    description: descriptionSchema.optional().transform((value) => value ?? null),
  })
  .superRefine((event, context) => {
    try {
      validateEventSchedule(event);
    } catch (error) {
      if (!(error instanceof EventScheduleError)) throw error;
      context.addIssue({
        code: 'custom',
        path: [error.field],
        message: error.message,
      });
    }
  });

const updateEventSchema = z
  .strictObject({
    name: nameSchema.optional(),
    type: typeSchema.optional(),
    date: dateSchema.optional(),
    startTime: timeSchema.optional(),
    endTime: timeSchema.optional(),
    timezone: timezoneSchema.optional(),
    location: locationSchema.optional(),
    description: descriptionSchema.optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: 'At least one event field is required',
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

function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      return next(new HttpError(
        400,
        'VALIDATION_ERROR',
        'Invalid request body',
        validationDetails(result.error, 'body'),
      ));
    }

    req.body = result.data;
    return next();
  };
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
