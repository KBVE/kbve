-- migrate:up
-- ============================================================
-- STALWART: READ profile.username FOR RECIPIENT VALIDATION
--
-- Stalwart validates every RCPT TO against a directory before the
-- DATA stage, and the data-stage hook only sees the address the
-- directory resolved to. A catch-all address rewrites the envelope
-- to the catch-all account, so the hook can no longer map
-- $username@herbmail.com to a profile. Instead the herbmail.com
-- domain uses an SQL directory whose recipient query reads
-- profile.username through the stalwart role, so real usernames are
-- accepted unrewritten and everything else is refused at RCPT.
--
-- Depends on: 20260807120000_stalwart_role_schema (role),
--             profile.username (profile schema).
-- ============================================================

GRANT USAGE ON SCHEMA profile TO stalwart;
GRANT SELECT ON TABLE profile.username TO stalwart;

-- migrate:down

REVOKE SELECT ON TABLE profile.username FROM stalwart;
REVOKE USAGE ON SCHEMA profile FROM stalwart;
