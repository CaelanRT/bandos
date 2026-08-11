CREATE TABLE users (
        user_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        username VARCHAR(50) NOT NULL,
        first_name VARCHAR(50) NOT NULL,
        last_name VARCHAR(50) NOT NULL,
        email VARCHAR(50) NOT NULL,
        password VARCHAR(51) NOT NULL,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE bands (
	band_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
	name VARCHAR(50) NOT NULL,
	is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE user_bands (
	user_bands_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
	role membership_type NOT NULL,
	user_id INTEGER,
	band_id INTEGER,
	CONSTRAINT fk_users_table FOREIGN KEY (user_id) REFERENCES users(user_id),
	CONSTRAINT fk_bands_talbe FOREIGN KEY (band_id) REFERENCES bands(band_id)
);

CREATE OR REPLACE FUNCTION fn_band_leader_count (p_user_id INT)
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
	leader_count INT;
BEGIN
	SELECT count(*)
	INTO leader_count
	FROM user_bands
	WHERE user_id = p_user_id AND role = 'leader';

	RETURN leader_count;
END;
$$;
