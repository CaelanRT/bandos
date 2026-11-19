-- creating enum types
CREATE TYPE plan_type AS ENUM ('free', 'paid');
CREATE TYPE role_type AS ENUM ('leader', 'member');
CREATE TYPE event_type AS ENUM ('rehearsal', 'performance');

-- creating tables
CREATE TABLE users (
        user_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        username VARCHAR(50) NOT NULL,
        first_name VARCHAR(50) NOT NULL,
        last_name VARCHAR(50) NOT NULL,
        email VARCHAR(254) NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        email_verified_at TIMESTAMPTZ,
        email_is_verified BOOLEAN GENERATED ALWAYS AS (email_verified_at IS NOT NULL) STORED,
        pending_email VARCHAR(254),
        version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
        session_generation INTEGER NOT NULL DEFAULT 1 CHECK (session_generation > 0),
	plan plan_type NOT NULL DEFAULT 'free',
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE users ADD UNIQUE (user_id, is_active, email_is_verified);

CREATE UNIQUE INDEX users_username_lower_unique ON users (LOWER(username));
CREATE UNIQUE INDEX users_email_lower_unique ON users (LOWER(email));

CREATE TABLE bands (
    -- NULL on inactive bands disables the active-owner foreign key.
    owner_requires_active BOOLEAN GENERATED ALWAYS AS
        (CASE WHEN is_active THEN true ELSE NULL END) STORED,
    owner_requires_verified BOOLEAN GENERATED ALWAYS AS
        (CASE WHEN is_active THEN true ELSE NULL END) STORED,
    owner_user_id INTEGER NOT NULL REFERENCES users(user_id),
    active_owner_user_id INTEGER GENERATED ALWAYS AS
        (CASE WHEN is_active THEN owner_user_id ELSE NULL END) STORED,
    version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
	band_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
	name VARCHAR(50) NOT NULL,
	is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- PostgreSQL-backed express-session storage.
CREATE TABLE "session" (
        sid VARCHAR NOT NULL PRIMARY KEY,
        sess JSON NOT NULL,
        expire TIMESTAMP(6) NOT NULL
);

CREATE INDEX session_expire_idx ON "session" (expire);

CREATE TABLE user_bands (
	user_bands_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
	role role_type NOT NULL,
	user_id INTEGER NOT NULL,
	band_id INTEGER NOT NULL,
	CONSTRAINT user_bands_user_band_unique UNIQUE (user_id, band_id),
	CONSTRAINT fk_user_bands_user FOREIGN KEY (user_id)
		REFERENCES users(user_id) ON DELETE RESTRICT,
	CONSTRAINT fk_user_bands_band FOREIGN KEY (band_id)
		REFERENCES bands(band_id) ON DELETE RESTRICT
);

-- Declarative deferred FK protects against concurrent owner deactivation too.
ALTER TABLE bands ADD CONSTRAINT bands_active_verified_owner_fk
    FOREIGN KEY (owner_user_id, owner_requires_active, owner_requires_verified)
    REFERENCES users(user_id, is_active, email_is_verified)
    DEFERRABLE INITIALLY DEFERRED;

-- Deferred so membership insertion and ownership transfers can be atomic.
ALTER TABLE bands ADD CONSTRAINT bands_owner_membership_fk
    FOREIGN KEY (active_owner_user_id, band_id) REFERENCES user_bands(user_id, band_id)
    DEFERRABLE INITIALLY DEFERRED;

-- Roles remain for existing query conventions; owner_user_id is authoritative.
-- Locking the band serializes membership/role checks. The foreign keys above
-- enforce owner membership and account state, including concurrent changes.
CREATE FUNCTION check_band_owner(target_band_id INTEGER) RETURNS VOID
LANGUAGE plpgsql AS $$
DECLARE b bands%ROWTYPE;
BEGIN
    SELECT * INTO b FROM bands WHERE band_id = target_band_id FOR UPDATE;
    IF NOT FOUND OR NOT b.is_active THEN RETURN; END IF;
    IF NOT EXISTS (
        SELECT 1 FROM user_bands WHERE band_id = b.band_id
        AND user_id = b.owner_user_id AND role = 'leader'
    ) OR EXISTS (
        SELECT 1 FROM user_bands WHERE band_id = b.band_id
        AND user_id <> b.owner_user_id AND role = 'leader'
    ) THEN
        RAISE EXCEPTION 'Active band requires one active verified member-owner'
            USING ERRCODE = '23514', CONSTRAINT = 'bands_owner_consistency';
    END IF;
END;
$$;

CREATE FUNCTION enforce_band_owner() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP <> 'INSERT' THEN PERFORM check_band_owner(OLD.band_id); END IF;
    IF TG_OP <> 'DELETE' THEN PERFORM check_band_owner(NEW.band_id); END IF;
    RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER bands_owner_check AFTER INSERT OR UPDATE ON bands
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_band_owner();
CREATE CONSTRAINT TRIGGER membership_owner_check AFTER INSERT OR UPDATE OR DELETE ON user_bands
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION enforce_band_owner();

CREATE INDEX user_bands_user_id_idx ON user_bands (user_id);
CREATE INDEX user_bands_band_id_idx ON user_bands (band_id);

CREATE TABLE events (
    version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
    hide_from_uninvited BOOLEAN NOT NULL DEFAULT false,
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    CHECK (ends_at > starts_at),
	event_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
	band_id INTEGER NOT NULL,
	created_by_user_id INTEGER NOT NULL,
	name VARCHAR(100) NOT NULL,
	type event_type NOT NULL,
	event_date DATE NOT NULL,
	start_time TIME NOT NULL,
	end_time TIME NOT NULL,
	timezone VARCHAR(255) NOT NULL,
	location VARCHAR(255) NOT NULL,
	description VARCHAR(2000),
	is_active BOOLEAN NOT NULL DEFAULT true,
	created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
	CONSTRAINT events_end_after_start CHECK (end_time > start_time),
	CONSTRAINT fk_events_band FOREIGN KEY (band_id)
		REFERENCES bands(band_id) ON DELETE RESTRICT,
	CONSTRAINT fk_events_creator FOREIGN KEY (created_by_user_id)
		REFERENCES users(user_id) ON DELETE RESTRICT
);

CREATE INDEX events_band_active_schedule_idx
	ON events (band_id, is_active, starts_at, event_id);

ALTER TABLE events ADD UNIQUE (event_id, band_id);

-- Authentication facts live in the existing store's sess JSON, keeping
-- connect-pg-simple's INSERT/UPDATE contract. Ticket 02 populates/enforces:
-- userId, sessionGeneration, authenticatedAt, lastActivityAt, access and origin.
COMMENT ON COLUMN "session".sess IS
    'Server session: userId, sessionGeneration, authenticatedAt, lastActivityAt, access, registrationOrigin';

CREATE TABLE starter_instruments (
    instrument_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(50) NOT NULL CHECK (length(trim(name)) > 0)
);
CREATE UNIQUE INDEX starter_instruments_name_unique ON starter_instruments (lower(name));
INSERT INTO starter_instruments (name) VALUES
    ('Vocals'), ('Guitar'), ('Bass'), ('Drums'), ('Keyboards'), ('Piano'),
    ('Percussion'), ('Saxophone'), ('Trumpet'), ('Trombone'), ('Violin'), ('Cello');

CREATE TABLE instruments (
    instrument_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    band_id INTEGER NOT NULL REFERENCES bands(band_id),
    starter_instrument_id INTEGER REFERENCES starter_instruments(instrument_id),
    name VARCHAR(50) NOT NULL CHECK (length(trim(name)) > 0),
    UNIQUE (instrument_id, band_id)
);
CREATE UNIQUE INDEX instruments_band_name_unique ON instruments (band_id, lower(name));

CREATE TABLE member_instruments (
    band_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    instrument_id INTEGER NOT NULL,
    PRIMARY KEY (band_id, user_id, instrument_id),
    FOREIGN KEY (user_id, band_id) REFERENCES user_bands(user_id, band_id) ON DELETE CASCADE,
    FOREIGN KEY (instrument_id, band_id) REFERENCES instruments(instrument_id, band_id)
);

CREATE TABLE template_slots (
    slot_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    band_id INTEGER NOT NULL REFERENCES bands(band_id),
    instrument_id INTEGER NOT NULL,
    label VARCHAR(50) NOT NULL CHECK (length(trim(label)) > 0),
    position INTEGER NOT NULL CHECK (position BETWEEN 0 AND 49),
    UNIQUE (slot_id, band_id),
    UNIQUE (band_id, position) DEFERRABLE INITIALLY DEFERRED,
    FOREIGN KEY (instrument_id, band_id) REFERENCES instruments(instrument_id, band_id)
);

CREATE TABLE default_lineups (
    band_id INTEGER PRIMARY KEY REFERENCES bands(band_id),
    version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0)
);
CREATE TABLE default_assignments (
    band_id INTEGER NOT NULL REFERENCES default_lineups(band_id) ON DELETE CASCADE,
    slot_id INTEGER NOT NULL,
    -- A removed member remains a repairable default, never a membership FK.
    user_id INTEGER NOT NULL REFERENCES users(user_id),
    PRIMARY KEY (band_id, slot_id),
    UNIQUE (band_id, user_id),
    FOREIGN KEY (slot_id, band_id) REFERENCES template_slots(slot_id, band_id) ON DELETE CASCADE
);

CREATE TABLE event_slots (
    slot_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event_id INTEGER NOT NULL,
    band_id INTEGER NOT NULL,
    template_slot_id INTEGER,
    instrument_id INTEGER NOT NULL,
    instrument_name VARCHAR(50) NOT NULL,
    label VARCHAR(50) NOT NULL CHECK (length(trim(label)) > 0),
    position INTEGER NOT NULL CHECK (position BETWEEN 0 AND 49),
    retired_at TIMESTAMPTZ,
    UNIQUE (slot_id, event_id),
    FOREIGN KEY (event_id, band_id) REFERENCES events(event_id, band_id),
    FOREIGN KEY (instrument_id, band_id) REFERENCES instruments(instrument_id, band_id),
    FOREIGN KEY (template_slot_id, band_id) REFERENCES template_slots(slot_id, band_id)
        ON DELETE SET NULL (template_slot_id)
);
CREATE UNIQUE INDEX event_slots_current_position ON event_slots (event_id, position) WHERE retired_at IS NULL;

CREATE TABLE event_invitations (
    band_id INTEGER NOT NULL,
    invitation_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event_id INTEGER NOT NULL REFERENCES events(event_id),
    slot_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL REFERENCES users(user_id),
    username VARCHAR(50) NOT NULL,
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,
    -- Instrument facts belong to the invitation too: a slot's instrument may change.
    instrument_id INTEGER NOT NULL,
    instrument_name VARCHAR(50) NOT NULL,
    slot_label VARCHAR(50) NOT NULL,
    issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
    responded_at TIMESTAMPTZ,
    decline_reason VARCHAR(1000),
    retired_at TIMESTAMPTZ,
    retirement_cause TEXT CHECK (retirement_cause IN ('removed', 'replaced', 'member_removed', 'account_deactivated', 'cancelled')),
    CHECK (decline_reason IS NULL OR status = 'declined'),
    CHECK ((retired_at IS NULL) = (retirement_cause IS NULL)),
    FOREIGN KEY (slot_id, event_id) REFERENCES event_slots(slot_id, event_id),
    FOREIGN KEY (event_id, band_id) REFERENCES events(event_id, band_id),
    FOREIGN KEY (instrument_id, band_id) REFERENCES instruments(instrument_id, band_id)
);
CREATE UNIQUE INDEX invitations_current_slot ON event_invitations (slot_id) WHERE retired_at IS NULL;
CREATE UNIQUE INDEX invitations_current_musician ON event_invitations (event_id, user_id) WHERE retired_at IS NULL;
CREATE INDEX invitations_user_schedule ON event_invitations (user_id, event_id) WHERE retired_at IS NULL;

CREATE TABLE invitation_history (
    history_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    invitation_id INTEGER NOT NULL REFERENCES event_invitations(invitation_id),
    actor_user_id INTEGER NOT NULL REFERENCES users(user_id),
    kind TEXT NOT NULL CHECK (kind IN ('response', 'reason_changed', 'reconfirmation')),
    status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'declined')),
    decline_reason VARCHAR(1000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE polls (
    poll_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    band_id INTEGER NOT NULL REFERENCES bands(band_id),
    created_by_user_id INTEGER NOT NULL REFERENCES users(user_id),
    version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
    name VARCHAR(100) NOT NULL,
    location VARCHAR(255) NOT NULL,
    description VARCHAR(2000),
    timezone VARCHAR(255) NOT NULL,
    hide_from_uninvited BOOLEAN NOT NULL DEFAULT false,
    state TEXT NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'finalized', 'cancelled')),
    closed_at TIMESTAMPTZ,
    finalized_event_id INTEGER UNIQUE,
    finalized_option_id INTEGER,
    finalized_option_revision INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (poll_id, band_id),
    CHECK ((state = 'open') = (closed_at IS NULL)),
    CHECK ((state = 'finalized') = (finalized_event_id IS NOT NULL)),
    CHECK ((state = 'finalized') = (finalized_option_id IS NOT NULL)),
    CHECK ((state = 'finalized') = (finalized_option_revision IS NOT NULL)),
    FOREIGN KEY (finalized_event_id, band_id) REFERENCES events(event_id, band_id)
);

CREATE TABLE poll_slots (
    slot_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    poll_id INTEGER NOT NULL,
    band_id INTEGER NOT NULL,
    template_slot_id INTEGER,
    instrument_id INTEGER NOT NULL,
    instrument_name VARCHAR(50) NOT NULL,
    label VARCHAR(50) NOT NULL CHECK (length(trim(label)) > 0),
    position INTEGER NOT NULL CHECK (position BETWEEN 0 AND 49),
    retired_at TIMESTAMPTZ,
    UNIQUE (slot_id, poll_id),
    FOREIGN KEY (poll_id, band_id) REFERENCES polls(poll_id, band_id),
    FOREIGN KEY (instrument_id, band_id) REFERENCES instruments(instrument_id, band_id),
    FOREIGN KEY (template_slot_id, band_id) REFERENCES template_slots(slot_id, band_id)
        ON DELETE SET NULL (template_slot_id)
);
CREATE UNIQUE INDEX poll_slots_current_position ON poll_slots (poll_id, position) WHERE retired_at IS NULL;

CREATE TABLE poll_assignments (
    band_id INTEGER NOT NULL,
    assignment_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    poll_id INTEGER NOT NULL REFERENCES polls(poll_id),
    slot_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL REFERENCES users(user_id),
    username VARCHAR(50) NOT NULL,
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,
    instrument_id INTEGER NOT NULL,
    instrument_name VARCHAR(50) NOT NULL,
    slot_label VARCHAR(50) NOT NULL,
    issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    retired_at TIMESTAMPTZ,
    retirement_cause TEXT CHECK (retirement_cause IN ('removed', 'replaced', 'member_removed', 'account_deactivated')),
    CHECK ((retired_at IS NULL) = (retirement_cause IS NULL)),
    UNIQUE (assignment_id, poll_id),
    FOREIGN KEY (slot_id, poll_id) REFERENCES poll_slots(slot_id, poll_id),
    FOREIGN KEY (poll_id, band_id) REFERENCES polls(poll_id, band_id),
    FOREIGN KEY (instrument_id, band_id) REFERENCES instruments(instrument_id, band_id)
);
CREATE UNIQUE INDEX poll_assignments_current_slot ON poll_assignments (slot_id) WHERE retired_at IS NULL;
CREATE UNIQUE INDEX poll_assignments_current_musician ON poll_assignments (poll_id, user_id) WHERE retired_at IS NULL;

-- Logical option identity plus immutable revisions retains prior vote evidence.
CREATE TABLE poll_options (
    option_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    poll_id INTEGER NOT NULL REFERENCES polls(poll_id),
    current_revision INTEGER NOT NULL DEFAULT 1 CHECK (current_revision > 0),
    position INTEGER NOT NULL CHECK (position BETWEEN 0 AND 29),
    deleted_at TIMESTAMPTZ,
    UNIQUE (option_id, poll_id)
);
CREATE UNIQUE INDEX poll_options_current_position ON poll_options (poll_id, position) WHERE deleted_at IS NULL;
CREATE TABLE poll_option_revisions (
    option_id INTEGER NOT NULL,
    poll_id INTEGER NOT NULL,
    revision INTEGER NOT NULL CHECK (revision > 0),
    option_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL CHECK (end_time > start_time),
    timezone VARCHAR(255) NOT NULL,
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL CHECK (ends_at > starts_at),
    PRIMARY KEY (option_id, revision),
    UNIQUE (option_id, revision, poll_id),
    FOREIGN KEY (option_id, poll_id) REFERENCES poll_options(option_id, poll_id)
);
ALTER TABLE poll_options ADD CONSTRAINT poll_options_current_revision_fk
    FOREIGN KEY (option_id, current_revision) REFERENCES poll_option_revisions(option_id, revision)
    DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE polls ADD CONSTRAINT polls_finalized_option_fk
    FOREIGN KEY (finalized_option_id, finalized_option_revision, poll_id)
    REFERENCES poll_option_revisions(option_id, revision, poll_id);
CREATE INDEX poll_revisions_schedule ON poll_option_revisions (starts_at, option_id);

CREATE TABLE poll_vote_rows (
    assignment_id INTEGER PRIMARY KEY,
    poll_id INTEGER NOT NULL,
    version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (assignment_id, poll_id),
    FOREIGN KEY (assignment_id, poll_id) REFERENCES poll_assignments(assignment_id, poll_id)
);
CREATE TABLE poll_vote_cells (
    assignment_id INTEGER NOT NULL,
    poll_id INTEGER NOT NULL,
    option_id INTEGER NOT NULL,
    option_revision INTEGER NOT NULL,
    answer TEXT NOT NULL CHECK (answer IN ('yes', 'no')),
    PRIMARY KEY (assignment_id, option_id, option_revision),
    FOREIGN KEY (assignment_id, poll_id) REFERENCES poll_vote_rows(assignment_id, poll_id),
    FOREIGN KEY (option_id, option_revision, poll_id) REFERENCES poll_option_revisions(option_id, revision, poll_id)
);

CREATE TABLE notification_preferences (
    user_id INTEGER PRIMARY KEY REFERENCES users(user_id),
    version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
    enabled BOOLEAN NOT NULL DEFAULT true,
    invitations BOOLEAN NOT NULL DEFAULT true,
    event_updates BOOLEAN NOT NULL DEFAULT true,
    removals_and_cancellations BOOLEAN NOT NULL DEFAULT true,
    invitation_responses BOOLEAN NOT NULL DEFAULT true,
    poll_updates BOOLEAN NOT NULL DEFAULT true,
    poll_responses BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE account_tokens (
    token_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(user_id),
    purpose TEXT NOT NULL CHECK (purpose IN ('registration_verification', 'password_reset', 'email_change')),
    token_digest BYTEA NOT NULL UNIQUE CHECK (octet_length(token_digest) = 32),
    target_email VARCHAR(254),
    issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL CHECK (expires_at > issued_at),
    consumed_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    CHECK (purpose <> 'email_change' OR target_email IS NOT NULL)
);
CREATE INDEX account_tokens_expiry ON account_tokens (expires_at);
CREATE INDEX account_tokens_user_purpose ON account_tokens (user_id, purpose);

CREATE TABLE api_idempotency (
    record_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    actor_user_id INTEGER NOT NULL REFERENCES users(user_id),
    method TEXT NOT NULL CHECK (method IN ('POST', 'PUT', 'PATCH', 'DELETE')),
    path TEXT NOT NULL,
    idempotency_key UUID NOT NULL,
    request_hash BYTEA NOT NULL CHECK (octet_length(request_hash) = 32),
    response_status INTEGER NOT NULL CHECK (response_status BETWEEN 200 AND 299),
    response_body JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
    CHECK (expires_at >= created_at + interval '7 days'),
    UNIQUE (actor_user_id, method, path, idempotency_key)
);
CREATE INDEX api_idempotency_expiry ON api_idempotency (expires_at);

CREATE TABLE email_outbox (
    notification_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    transition_id UUID NOT NULL,
    kind TEXT NOT NULL,
    recipient_identity TEXT NOT NULL,
    category TEXT CHECK (category IN ('invitations', 'eventUpdates', 'removalsAndCancellations', 'invitationResponses', 'pollUpdates', 'pollResponses')),
    security_purpose TEXT CHECK (security_purpose IN ('registration_verification', 'password_reset', 'email_change', 'email_change_notice', 'password_changed')),
    recipient_selector TEXT NOT NULL CHECK (recipient_selector IN ('user', 'current_leader', 'security_address')),
    recipient_user_id INTEGER REFERENCES users(user_id),
    recipient_band_id INTEGER REFERENCES bands(band_id),
    security_recipient_address VARCHAR(254),
    token_id INTEGER REFERENCES account_tokens(token_id) ON DELETE SET NULL,
    template_version INTEGER NOT NULL CHECK (template_version > 0),
    payload JSONB NOT NULL,
    -- Authenticated ciphertext includes nonce/tag; keys remain application-owned.
    encrypted_security_payload BYTEA,
    security_payload_expires_at TIMESTAMPTZ,
    state TEXT NOT NULL DEFAULT 'queued' CHECK (state IN ('queued', 'sending', 'sent', 'suppressed', 'retryable', 'failed', 'delivery_unknown')),
    lease_owner TEXT,
    lease_expires_at TIMESTAMPTZ,
    attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    first_attempt_at TIMESTAMPTZ,
    last_attempt_at TIMESTAMPTZ,
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    provider_key TEXT UNIQUE,
    provider_id TEXT,
    request_fingerprint BYTEA,
    frozen_recipient_address VARCHAR(254),
    frozen_payload JSONB,
    last_error_class TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    sent_at TIMESTAMPTZ,
    UNIQUE (transition_id, kind, recipient_identity),
    CHECK ((category IS NULL) <> (security_purpose IS NULL)),
    CHECK ((encrypted_security_payload IS NULL) = (security_payload_expires_at IS NULL)),
    CHECK (encrypted_security_payload IS NULL OR security_purpose IS NOT NULL),
    CHECK (state NOT IN ('sent', 'suppressed', 'failed', 'delivery_unknown') OR encrypted_security_payload IS NULL),
    CHECK ((lease_owner IS NULL) = (lease_expires_at IS NULL)),
    CHECK (state <> 'sending' OR lease_expires_at IS NOT NULL),
    CHECK (recipient_selector <> 'user' OR recipient_user_id IS NOT NULL),
    CHECK (recipient_selector <> 'current_leader' OR recipient_band_id IS NOT NULL),
    CHECK (recipient_selector <> 'security_address' OR security_recipient_address IS NOT NULL)
);
CREATE INDEX email_outbox_due ON email_outbox (next_attempt_at, notification_id) WHERE state IN ('queued', 'retryable');
CREATE INDEX email_outbox_abandoned_leases ON email_outbox (lease_expires_at) WHERE state = 'sending';
