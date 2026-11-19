# Fresh v2 storage

`schemas/schema.sql` initializes a fresh PostgreSQL 15+ database. It is not a
migration and must not be applied over an existing schema. No v1 backfill or
compatibility layer is included. V2 controllers and session enforcement are
implemented by subsequent tickets; the schema alone does not enable the v2 API.

Run the isolated integrity checks from `backend/`:

```sh
docker run --detach --rm --name bandos-v2-storage-test \
  -e POSTGRES_USER=bandos_test -e POSTGRES_PASSWORD=disposable \
  -e POSTGRES_DB=postgres -p 127.0.0.1:55439:5432 postgres:16
docker exec bandos-v2-storage-test pg_isready -U bandos_test
TEST_PG_ADMIN_URL=postgres://bandos_test:disposable@127.0.0.1:55439/postgres \
  node --test test/relational-storage.integration.test.js
docker stop bandos-v2-storage-test
```

Wait for `pg_isready` to report readiness before running tests. The runner requires
an explicit admin URL with database-creation permission, creates a randomly named
database, loads the schema, then drops only that database. It does not load `.env`,
reset a shared database, or modify existing application data. PostgreSQL 15+ is
needed for column-specific `ON DELETE SET NULL` on snapshot provenance links.

Ownership uses deferred membership and active/verified-account foreign keys plus
a deferred role consistency check. Creation and transfer must update the owner and
membership roles in one transaction. Application transactions should lock affected
users and then bands in ascending ID order, as specified by the v2 contract.

Removing a template slot nulls event/poll provenance and removes its default
mapping. Retire event/poll slots and assignments instead of deleting them; snapshots,
response history, option revisions and votes are retained. Current poll reads must
join unretired assignments to current undeleted option revisions. A returning
musician receives a new assignment ID and starts with no vote row (wire version 0).

Sessions retain the existing `connect-pg-simple` JSON store. Ticket BE-V2-02 owns
populating and enforcing generation, access and activity/deadline facts. Later
mutation/delivery tickets own request sanitization, token encryption, expiry,
lease/retry transitions, and clearing encrypted mail payloads at terminal delivery.
Keys and raw account tokens must never be stored in ordinary JSON payloads.
