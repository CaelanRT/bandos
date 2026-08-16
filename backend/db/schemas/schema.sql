-- creating enum types
CREATE TYPE plan_type AS ENUM ('free', 'paid');
CREATE TYPE role_type AS ENUM ('leader', 'member');

-- creating tables
CREATE TABLE users (
        user_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        username VARCHAR(50) NOT NULL,
        first_name VARCHAR(50) NOT NULL,
        last_name VARCHAR(50) NOT NULL,
        email VARCHAR(254) NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
	plan plan_type NOT NULL DEFAULT 'free',
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX users_username_lower_unique ON users (LOWER(username));
CREATE UNIQUE INDEX users_email_lower_unique ON users (LOWER(email));

CREATE TABLE bands (
	band_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
	name VARCHAR(50) NOT NULL,
	is_active BOOLEAN DEFAULT true,
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

CREATE INDEX user_bands_user_id_idx ON user_bands (user_id);
CREATE INDEX user_bands_band_id_idx ON user_bands (band_id);
