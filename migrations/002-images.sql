CREATE TABLE IF NOT EXISTS blueprint_chat_attachments (
  id uuid PRIMARY KEY,
  sender_id uuid NOT NULL,
  request_id uuid NOT NULL,
  content_type text NOT NULL CHECK (content_type IN ('image/jpeg','image/png','image/webp')),
  original_size integer NOT NULL CHECK (original_size BETWEEN 1 AND 5242880),
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','validating','ready','attached','deleting')),
  width integer,
  height integer,
  size integer,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  validation_started timestamptz,
  UNIQUE (sender_id, request_id)
);
-- statement
ALTER TABLE blueprint_chat_messages ADD COLUMN IF NOT EXISTS attachment_id uuid UNIQUE REFERENCES blueprint_chat_attachments(id);
-- statement
ALTER TABLE blueprint_chat_messages DROP CONSTRAINT IF EXISTS blueprint_chat_messages_body_check;
-- statement
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'blueprint_chat_body_or_image') THEN
    ALTER TABLE blueprint_chat_messages ADD CONSTRAINT blueprint_chat_body_or_image CHECK (
      octet_length(body) <= 2000 AND (btrim(body) <> '' OR attachment_id IS NOT NULL));
  END IF;
END $$;
-- statement
CREATE INDEX IF NOT EXISTS blueprint_chat_attachment_expiry ON blueprint_chat_attachments(created_at);
-- statement
CREATE OR REPLACE FUNCTION blueprint_chat_put_image(expected text, sender uuid, nickname text, message text, request uuid, image uuid)
RETURNS SETOF blueprint_chat_messages LANGUAGE plpgsql AS $$
DECLARE existing blueprint_chat_messages;
BEGIN
  PERFORM blueprint_chat_assert_environment(expected);
  PERFORM pg_advisory_xact_lock(148296241, 1);
  SELECT * INTO existing FROM blueprint_chat_messages WHERE sender_id = sender AND request_id = request;
  IF FOUND THEN
    IF existing.body <> message OR existing.attachment_id IS DISTINCT FROM image OR existing.created_at <= clock_timestamp() - interval '30 days' THEN
      RAISE EXCEPTION 'Idempotency conflict' USING ERRCODE = 'P0002';
    END IF;
    RETURN NEXT existing;
  ELSE
    IF image IS NOT NULL THEN
      UPDATE blueprint_chat_attachments SET state = 'attached' WHERE id = image AND sender_id = sender AND state = 'ready' AND created_at > now() - interval '1 hour';
      IF NOT FOUND THEN RAISE EXCEPTION 'Invalid attachment' USING ERRCODE = 'P0002'; END IF;
    END IF;
    RETURN QUERY INSERT INTO blueprint_chat_messages(sender_id,display_name,body,request_id,attachment_id)
      VALUES(sender,nickname,message,request,image) RETURNING *;
  END IF;
END;
$$;
