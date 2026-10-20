-- Apply once to each isolated database; bind its environment separately.
CREATE TABLE IF NOT EXISTS blueprint_chat_environment (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  environment text NOT NULL CHECK (environment IN ('development', 'preview', 'production')),
  schema_version integer NOT NULL CHECK (schema_version = 1)
);

-- statement
CREATE TABLE IF NOT EXISTS blueprint_chat_messages (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  channel text NOT NULL DEFAULT 'geral' CHECK (channel = 'geral'),
  sender_id uuid NOT NULL,
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 2 AND 24),
  body text NOT NULL CHECK (octet_length(body) BETWEEN 1 AND 2000 AND btrim(body) <> ''),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  request_id uuid NOT NULL,
  UNIQUE (sender_id, request_id)
);
-- statement
CREATE INDEX IF NOT EXISTS blueprint_chat_expiry ON blueprint_chat_messages (created_at);

-- statement
CREATE OR REPLACE FUNCTION blueprint_chat_assert_environment(expected text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM blueprint_chat_environment WHERE environment = expected AND schema_version = 1) THEN
    RAISE EXCEPTION 'Chat environment mismatch' USING ERRCODE = 'P0001';
  END IF;
END;
$$;

-- statement
CREATE OR REPLACE FUNCTION blueprint_chat_put(expected text, sender uuid, nickname text, message text, request uuid)
RETURNS SETOF blueprint_chat_messages LANGUAGE plpgsql AS $$
DECLARE existing blueprint_chat_messages;
BEGIN
  PERFORM blueprint_chat_assert_environment(expected);
  -- Serialize allocation and commit, so incremental ID cursors cannot skip a late commit.
  PERFORM pg_advisory_xact_lock(148296241, 1);
  SELECT * INTO existing FROM blueprint_chat_messages WHERE sender_id = sender AND request_id = request;
  IF FOUND THEN
    IF existing.body <> message OR existing.created_at <= clock_timestamp() - interval '30 days' THEN
      RAISE EXCEPTION 'Idempotency conflict' USING ERRCODE = 'P0002';
    END IF;
    RETURN NEXT existing;
  ELSE
    RETURN QUERY INSERT INTO blueprint_chat_messages (sender_id, display_name, body, request_id)
      VALUES (sender, nickname, message, request) RETURNING *;
  END IF;
END;
$$;
