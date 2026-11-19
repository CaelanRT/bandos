# Transactional mutations (BE-V2-03)

`utils/mutation.js` supplies the foundation for the endpoint-owning v2 tickets.
Existing v1 handlers still use `withSessionMutation`; this ticket does not enable
their later v2 payloads, transitions, or notification delivery.

On a new/changed route, use `validateBody(z.strictObject({...}))` and
`validateRouteId(name)` from `middleware/validate-mutation.js`. Body IDs are JSON
numbers; route IDs are strict positive decimal strings. Both must be safe integers.
Use `versionSchema` for aggregate versions and `voteVersionSchema` for vote rows
(an absent row is version zero). Text schemas trim names/text, never passwords.
The validator preserves the original parsed JSON intent in `req.mutationBody`.

Controllers call `withMutation(req, { discover, authorize, validate, work })`, then
send its `{status, body}` after the promise resolves. The UUID `Idempotency-Key`
is required. The scope is actor, method, concrete path (without query), and key.
JSON object key order is canonicalized; array order and submitted values matter.
Only a SHA-256 digest of the request is persisted, never its body.

- `discover(client)` reads all affected lock candidates before locks. It returns
  arrays keyed by `users`, `bands`, `events`, `polls`, `event_invitations`,
  `poll_assignments`, `poll_vote_rows`. The helper includes the actor and locks
  each group in this order, with sorted, deduplicated IDs. Resource types use a
  fixed events-before-polls order. Rediscover on each transaction retry; recheck
  the discovered set under locks and reject/retry if domain membership changed.
- `authorize(client, locked, user)` must check current membership, ownership,
  visibility, and scoped IDs using the locked state. It runs before replay.
  Include every lock needed to keep those facts stable until commit. Never use
  a role cached in middleware as the final decision. Account generation,
  activity deadlines and verified access are checked by the helper. Restricted
  account flows can explicitly opt into `allowRestricted: true`.
- `validate(client, locked, user)` checks expected versions, eligibility, current
  time and other action boundaries for a new intent. Use `checkVersion` (with
  field `expectedVoteVersion` for a vote row). This callback runs after replay
  lookup, so the original successful result wins over a now-stale version.
- `work(client, locked, user)` performs domain/version/history/outbox writes and
  returns a public `{status, body}` success response. All callbacks must use the
  provided client. No external provider calls or HTTP responses inside them.
  Return only explicitly serialized public data; the helper also strips
  credential-bearing fields recursively before sending/storing the response.

Use `applyChange(before, after, write)` on normalized domain projections.
Only its `write` callback increments the affected aggregate version and writes
domain/history/outbox effects. A no-op returns success with unchanged versions
and no mail; it can still record its success for replay. Independent vote writes
increment their row version, not the poll composition version.

The actor lock serializes concurrent identical requests: a waiting request sees
the committed result or executes after rollback. It may wait for the first
transaction rather than return `REQUEST_IN_PROGRESS`. Replay rechecks access but
does not rerun the action's version/time validation. Session deadlines are checked
again just before commit. PostgreSQL deadlock/serialization errors retry at most
twice, repeating discovery, authorization and validation with the same intent.
Other failures roll back without a replayable success. A lost HTTP response after
commit is recovered with the original key/body.

Successful response records expire after seven days. `pruneIdempotency(client)`
removes only expired replay records; callers can invoke it from housekeeping.
No scheduler is introduced here. Domain histories and terminal resources remain.
Later endpoint tickets must enforce their own uniqueness and terminal-state
invariants even after the replay record is gone. Deletion authorization must
allow an authorized actor's repeat terminal action without granting former
members access to privileged stored data.

Verification uses an explicit disposable admin URL and creates/drops only a
randomly named test database:

```sh
TEST_PG_ADMIN_URL=postgres://bandos_test:disposable@127.0.0.1:55443/postgres \
  node --test test/mutation-concurrency.integration.test.js test/mutation-validation.test.js
```
