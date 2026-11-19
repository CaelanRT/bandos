const { z } = require('zod');
const HttpError = require('../utils/http-error');

const idSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const routeIdSchema = z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(idSchema);
const versionSchema = idSchema;
const voteVersionSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const idempotencyKeySchema = z.uuid();

function validationDetails(error, fallback = 'body') {
  return error.issues.flatMap(issue => issue.code === 'unrecognized_keys'
    ? issue.keys.map(key => ({ field: [...issue.path, key].join('.'), message: 'Unknown field' }))
    : [{ field: issue.path.join('.') || fallback, message: issue.message }]);
}

function parse(schema, value, field = 'body') {
  const result = schema.safeParse(value);
  if (!result.success) throw new HttpError(400, 'VALIDATION_ERROR', 'Invalid request body', validationDetails(result.error, field));
  return result.data;
}

// Call with a strictObject schema on new/changed routes. Retain the parsed JSON
// intent before trimming/defaults so a changed submitted body cannot reuse a key.
function validateBody(schema) {
  return (req, res, next) => {
    try {
      req.mutationBody = req.body;
      req.body = parse(schema, req.body);
      next();
    } catch (error) { next(error); }
  };
}

function validateRouteId(field) {
  return (req, res, next) => {
    try {
      req.params[field] = parse(routeIdSchema, req.params[field], field);
      next();
    } catch (error) { next(error); }
  };
}

module.exports = { idSchema, routeIdSchema, versionSchema, voteVersionSchema, idempotencyKeySchema, parse, validationDetails, validateBody, validateRouteId };
