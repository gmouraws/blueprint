-- Better Auth 1.7 core schema. Existing sender UUIDs are deliberately NOT backfilled.
CREATE TABLE IF NOT EXISTS blueprint_user (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, email text UNIQUE NOT NULL CHECK (email = lower(email)),
 "emailVerified" boolean NOT NULL DEFAULT false, image text,
 "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(),
 role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner','member')),
 status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
 preferences jsonb NOT NULL DEFAULT '{}', preference_version integer NOT NULL DEFAULT 0,
 avatar_id uuid
);
-- statement
CREATE TABLE IF NOT EXISTS blueprint_invitation (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text NOT NULL CHECK(email = lower(email)), role text NOT NULL DEFAULT 'member' CHECK(role IN ('owner','member')),
 created_by uuid REFERENCES blueprint_user(id), created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL,
 revoked_at timestamptz, accepted_at timestamptz, accepted_by uuid,
 CHECK (expires_at > created_at)
);
CREATE INDEX IF NOT EXISTS blueprint_invitation_email ON blueprint_invitation(email);
-- statement
CREATE TABLE IF NOT EXISTS blueprint_session (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), token text UNIQUE NOT NULL, "userId" uuid NOT NULL REFERENCES blueprint_user(id) ON DELETE CASCADE,
 "expiresAt" timestamptz NOT NULL, "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now(),
 "ipAddress" text, "userAgent" text, revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS blueprint_session_user ON blueprint_session("userId");
-- statement
CREATE TABLE IF NOT EXISTS blueprint_account (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "userId" uuid NOT NULL REFERENCES blueprint_user(id) ON DELETE CASCADE,
 "accountId" text NOT NULL, "providerId" text NOT NULL, "accessToken" text, "refreshToken" text, "idToken" text,
 "accessTokenExpiresAt" timestamptz, "refreshTokenExpiresAt" timestamptz, scope text, password text,
 "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS blueprint_account_user ON blueprint_account("userId");
-- statement
CREATE TABLE IF NOT EXISTS blueprint_verification (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), identifier text NOT NULL, value text NOT NULL,
 "expiresAt" timestamptz NOT NULL, "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS blueprint_verification_identifier ON blueprint_verification(identifier);
-- statement
CREATE TABLE IF NOT EXISTS blueprint_media_lease (
 identity text PRIMARY KEY, user_id uuid NOT NULL REFERENCES blueprint_user(id), session_id uuid NOT NULL REFERENCES blueprint_session(id),
 room text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), revoked_at timestamptz, cleaned_at timestamptz
);
-- statement
CREATE TABLE IF NOT EXISTS blueprint_avatar (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES blueprint_user(id), created_at timestamptz NOT NULL DEFAULT now(),
 state text NOT NULL CHECK(state IN ('pending','active','deleting'))
);
-- statement
ALTER TABLE blueprint_chat_messages ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES blueprint_user(id);
ALTER TABLE blueprint_chat_attachments ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES blueprint_user(id);
-- statement
CREATE OR REPLACE FUNCTION blueprint_claim_invitation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE invitation blueprint_invitation;
BEGIN
 -- The same lock serializes owner actions/bootstrap and signup, including OTP auto-signup.
 PERFORM pg_advisory_xact_lock(148296241, 4);
 SELECT * INTO invitation FROM blueprint_invitation WHERE email = lower(NEW.email)
  AND revoked_at IS NULL AND accepted_at IS NULL AND expires_at > now()
  ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Invitation required' USING ERRCODE = 'P0004'; END IF;
 NEW.role := invitation.role; NEW.status := 'active'; NEW.email := lower(NEW.email);
 UPDATE blueprint_invitation SET accepted_at = now(), accepted_by = NEW.id WHERE id = invitation.id;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS blueprint_invitation_guard ON blueprint_user;
CREATE TRIGGER blueprint_invitation_guard BEFORE INSERT ON blueprint_user FOR EACH ROW EXECUTE FUNCTION blueprint_claim_invitation();
-- statement
CREATE OR REPLACE FUNCTION blueprint_session_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM 1 FROM blueprint_user WHERE id = NEW."userId" AND status = 'active' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Inactive member' USING ERRCODE = 'P0004'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS blueprint_active_session ON blueprint_session;
CREATE TRIGGER blueprint_active_session BEFORE INSERT ON blueprint_session FOR EACH ROW EXECUTE FUNCTION blueprint_session_guard();
-- statement
CREATE OR REPLACE FUNCTION blueprint_owner_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(148296241, 4);
 IF OLD.role = 'owner' AND OLD.status = 'active' AND (TG_OP = 'DELETE' OR NEW.role <> 'owner' OR NEW.status <> 'active')
 AND NOT EXISTS(SELECT 1 FROM blueprint_user WHERE id <> OLD.id AND role = 'owner' AND status = 'active') THEN
 RAISE EXCEPTION 'Sole owner protected' USING ERRCODE = 'P0004'; END IF;
 IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS blueprint_owner_guard ON blueprint_user;
CREATE TRIGGER blueprint_owner_guard BEFORE UPDATE OF role, status ON blueprint_user FOR EACH ROW EXECUTE FUNCTION blueprint_owner_guard();
DROP TRIGGER IF EXISTS blueprint_owner_delete_guard ON blueprint_user;
CREATE TRIGGER blueprint_owner_delete_guard BEFORE DELETE ON blueprint_user FOR EACH ROW EXECUTE FUNCTION blueprint_owner_guard();
-- statement
CREATE OR REPLACE FUNCTION blueprint_new_ownership() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 -- New writes use account UUIDs. Rows predating this trigger remain NULL/legacy.
 SELECT id INTO NEW.user_id FROM blueprint_user WHERE id = NEW.sender_id AND status = 'active';
 IF NEW.user_id IS NULL THEN RAISE EXCEPTION 'Account required' USING ERRCODE = 'P0004'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS blueprint_message_owner ON blueprint_chat_messages;
CREATE TRIGGER blueprint_message_owner BEFORE INSERT ON blueprint_chat_messages FOR EACH ROW EXECUTE FUNCTION blueprint_new_ownership();
DROP TRIGGER IF EXISTS blueprint_attachment_owner ON blueprint_chat_attachments;
CREATE TRIGGER blueprint_attachment_owner BEFORE INSERT ON blueprint_chat_attachments FOR EACH ROW EXECUTE FUNCTION blueprint_new_ownership();

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
  IF NOT FOUND OR existing.sender_id <> sender OR existing.user_id IS DISTINCT FROM sender OR existing.created_at <= now() - interval '30 days' THEN
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
