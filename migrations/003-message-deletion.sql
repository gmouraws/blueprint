-- Retain content-free tombstones until normal expiry to fence send retries.
ALTER TABLE blueprint_chat_messages ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
-- statement
ALTER TABLE blueprint_chat_messages DROP CONSTRAINT IF EXISTS blueprint_chat_body_or_image;
-- statement
ALTER TABLE blueprint_chat_messages ADD CONSTRAINT blueprint_chat_body_or_image CHECK (
  (deleted_at IS NOT NULL AND body = '' AND attachment_id IS NULL) OR
  (deleted_at IS NULL AND octet_length(body) <= 2000 AND (btrim(body) <> '' OR attachment_id IS NOT NULL)));
-- statement
CREATE TABLE IF NOT EXISTS blueprint_chat_deletions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  message_id bigint NOT NULL,
  kind text NOT NULL CHECK (kind IN ('message','image')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
-- statement
CREATE INDEX IF NOT EXISTS blueprint_chat_deletion_expiry ON blueprint_chat_deletions(created_at);
-- statement
CREATE OR REPLACE FUNCTION blueprint_chat_delete(expected text, sender uuid, message bigint, target text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE existing blueprint_chat_messages; kind text;
BEGIN
  PERFORM blueprint_chat_assert_environment(expected);
  IF target NOT IN ('message','image') THEN RAISE EXCEPTION 'Invalid deletion' USING ERRCODE = 'P0003'; END IF;
  -- Use the message-write lock so mutation cursors cannot skip a late commit.
  PERFORM pg_advisory_xact_lock(148296241, 1);
  SELECT * INTO existing FROM blueprint_chat_messages WHERE id = message FOR UPDATE;
  IF NOT FOUND OR existing.sender_id <> sender OR existing.created_at <= now() - interval '30 days' THEN
    RAISE EXCEPTION 'Content unavailable' USING ERRCODE = 'P0003';
  END IF;
  IF existing.deleted_at IS NOT NULL THEN RETURN 'message'; END IF;
  IF target = 'image' AND existing.attachment_id IS NULL THEN RETURN 'image'; END IF;
  kind := CASE WHEN target = 'message' OR btrim(existing.body) = '' THEN 'message' ELSE 'image' END;
  IF existing.attachment_id IS NOT NULL THEN
    UPDATE blueprint_chat_attachments SET state = 'deleting' WHERE id = existing.attachment_id;
  END IF;
  UPDATE blueprint_chat_messages SET attachment_id = NULL,
    body = CASE WHEN kind = 'message' THEN '' ELSE body END,
    deleted_at = CASE WHEN kind = 'message' THEN clock_timestamp() ELSE NULL END
    WHERE id = message;
  INSERT INTO blueprint_chat_deletions(message_id,kind) VALUES(message,kind);
  RETURN kind;
END;
$$;
