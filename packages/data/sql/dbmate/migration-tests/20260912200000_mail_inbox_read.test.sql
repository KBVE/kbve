-- Companion test fixtures for 20260912200000_mail_inbox_read.
-- Run via: ./test-migration.sh 20260912200000_mail_inbox_read

-- SEED

DELETE FROM mail.messages
 WHERE user_id IN ('b0000000-0000-4000-8000-000000000011',
                   'b0000000-0000-4000-8000-000000000012');

INSERT INTO auth.users (id)
VALUES
    ('b0000000-0000-4000-8000-000000000011'),
    ('b0000000-0000-4000-8000-000000000012')
ON CONFLICT (id) DO NOTHING;

INSERT INTO profile.username (user_id, username)
VALUES
    ('b0000000-0000-4000-8000-000000000011', 'mailtest-carol'),
    ('b0000000-0000-4000-8000-000000000012', 'mailtest-dave')
ON CONFLICT (user_id) DO UPDATE SET username = EXCLUDED.username;

INSERT INTO mail.messages (user_id, via, direction, from_addr, subject, body, received_at)
VALUES
    ('b0000000-0000-4000-8000-000000000011', 'smtp', 'in', 'friend@example.com', 'one',   'first',  now() - interval '3 hours'),
    ('b0000000-0000-4000-8000-000000000011', 'smtp', 'in', 'friend@example.com', 'two',   'second', now() - interval '2 hours'),
    ('b0000000-0000-4000-8000-000000000011', 'smtp', 'in', 'other@example.com',  'three', NULL,     now() - interval '1 hour'),
    ('b0000000-0000-4000-8000-000000000012', 'smtp', 'in', 'friend@example.com', 'dave',  'daves',  now());

INSERT INTO mail.messages (user_id, via, direction, from_addr, from_user_id, to_addr, subject, body, status, received_at)
VALUES
    ('b0000000-0000-4000-8000-000000000011', 'smtp', 'out', 'mailtest-carol@herbmail.com',
     'b0000000-0000-4000-8000-000000000011', 'friend@example.com', 'reply', 'thanks', 'sent', now() - interval '30 minutes');

-- ASSERT_AFTER_UP

DO $$
DECLARE
    carol constant uuid := 'b0000000-0000-4000-8000-000000000011';
    dave  constant uuid := 'b0000000-0000-4000-8000-000000000012';
    r     jsonb;
    first_id uuid;
BEGIN
    -- listing is scoped to the caller's user id, newest first
    r := public.herbmail_inbox_list(carol);
    IF jsonb_array_length(r) <> 4 THEN
        RAISE EXCEPTION 'fail: carol should see 4 rows, got %', r;
    END IF;
    IF r -> 0 ->> 'direction' <> 'out' OR r -> 0 ->> 'subject' <> 'reply' THEN
        RAISE EXCEPTION 'fail: newest row first, got %', r -> 0;
    END IF;
    IF r -> 1 ->> 'subject' <> 'three' OR (r -> 1 ->> 'has_body')::boolean THEN
        RAISE EXCEPTION 'fail: null body must report has_body=false, got %', r -> 1;
    END IF;
    IF r -> 0 ? 'body' OR r -> 0 ? 'from_user_id' THEN
        RAISE EXCEPTION 'fail: listing must not carry bodies or user ids';
    END IF;
    IF r -> 0 ->> 'from_username' <> 'mailtest-carol' OR r -> 1 ? 'from_user_id' THEN
        RAISE EXCEPTION 'fail: sender exposed as username only, got %', r -> 0;
    END IF;

    -- dave never sees carol's mail, and vice versa
    r := public.herbmail_inbox_list(dave);
    IF jsonb_array_length(r) <> 1 OR r -> 0 ->> 'subject' <> 'dave' THEN
        RAISE EXCEPTION 'fail: dave should see only his row, got %', r;
    END IF;

    -- limit clamps to [1, 200]; before paginates on received_at
    r := public.herbmail_inbox_list(carol, 0);
    IF jsonb_array_length(r) <> 1 THEN
        RAISE EXCEPTION 'fail: limit 0 should clamp to 1, got %', jsonb_array_length(r);
    END IF;
    r := public.herbmail_inbox_list(carol, 50, now() - interval '90 minutes', '00000000-0000-0000-0000-000000000000');
    IF jsonb_array_length(r) <> 2 OR r -> 0 ->> 'subject' <> 'two' THEN
        RAISE EXCEPTION 'fail: before cursor should leave the two oldest, got %', r;
    END IF;
    -- half a cursor fails closed: nothing, never "everything"
    r := public.herbmail_inbox_list(carol, 50, now() - interval '90 minutes', NULL);
    IF jsonb_array_length(r) <> 0 THEN
        RAISE EXCEPTION 'fail: partial cursor should yield no rows, got %', jsonb_array_length(r);
    END IF;
    -- ties on received_at page by id, no row skipped or repeated
    UPDATE mail.messages SET received_at = now() - interval '5 hours'
     WHERE user_id = carol AND direction = 'in';
    r := public.herbmail_inbox_list(carol, 2, NULL, NULL, 'in');
    IF jsonb_array_length(r) <> 2 THEN
        RAISE EXCEPTION 'fail: direction filter + limit, got %', r;
    END IF;
    r := public.herbmail_inbox_list(carol, 2, (r -> 1 ->> 'received_at')::timestamptz, (r -> 1 ->> 'id')::uuid, 'in');
    IF jsonb_array_length(r) <> 1 THEN
        RAISE EXCEPTION 'fail: tie-break page should hold the last row, got %', r;
    END IF;
    r := public.herbmail_inbox_list(carol, 50, NULL, NULL, 'out');
    IF jsonb_array_length(r) <> 1 OR r -> 0 ->> 'direction' <> 'out' THEN
        RAISE EXCEPTION 'fail: out filter, got %', r;
    END IF;

    -- null user id yields an empty list, never a scan of everyone
    r := public.herbmail_inbox_list(NULL);
    IF r <> '[]'::jsonb THEN
        RAISE EXCEPTION 'fail: null user should get [], got %', r;
    END IF;

    -- single message carries body + headers, only for its owner
    SELECT m.id INTO first_id FROM mail.messages AS m
     WHERE m.user_id = carol AND m.subject = 'one';
    r := public.herbmail_message_get(carol, first_id);
    IF r ->> 'body' <> 'first' OR jsonb_typeof(r -> 'headers') <> 'array'
       OR (r ->> 'body_truncated')::boolean OR r ? 'from_user_id' THEN
        RAISE EXCEPTION 'fail: owner get should return body + headers, no user ids, got %', r;
    END IF;
    UPDATE mail.messages SET body = repeat('x', 1048576 + 10) WHERE id = first_id;
    r := public.herbmail_message_get(carol, first_id);
    IF NOT (r ->> 'body_truncated')::boolean OR octet_length(r ->> 'body') <> 1048576 THEN
        RAISE EXCEPTION 'fail: body should be capped at 1 MiB with the flag set';
    END IF;
    UPDATE mail.messages SET body = 'first' WHERE id = first_id;
    r := public.herbmail_message_get(dave, first_id);
    IF r IS NOT NULL THEN
        RAISE EXCEPTION 'fail: dave must not read carol''s message, got %', r;
    END IF;

    -- stats: address derived from username, cap from mail.outbound_daily_cap
    r := public.herbmail_mailbox_stats(carol);
    IF r ->> 'address' <> 'mailtest-carol@herbmail.com'
       OR (r ->> 'inbound')::int <> 3
       OR (r ->> 'outbound')::int <> 1
       OR (r ->> 'sent_24h')::int <> 1
       OR (r ->> 'daily_cap')::int <> mail.outbound_daily_cap() THEN
        RAISE EXCEPTION 'fail: unexpected stats %', r;
    END IF;
    r := public.herbmail_mailbox_stats(NULL);
    IF r IS NOT NULL THEN
        RAISE EXCEPTION 'fail: null user stats should be null, got %', r;
    END IF;

    -- privileges: service_role only
    IF has_function_privilege('anon', 'public.herbmail_inbox_list(uuid, integer, timestamptz, uuid, text)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.herbmail_message_get(uuid, uuid)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.herbmail_mailbox_stats(uuid)', 'EXECUTE') THEN
        RAISE EXCEPTION 'fail: anon/authenticated must not execute inbox read RPCs';
    END IF;
    IF NOT has_function_privilege('service_role', 'public.herbmail_inbox_list(uuid, integer, timestamptz, uuid, text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'fail: service_role must execute herbmail_inbox_list';
    END IF;
END;
$$;

-- ASSERT_AFTER_DOWN

DO $$
BEGIN
    IF to_regprocedure('public.herbmail_inbox_list(uuid, integer, timestamptz, uuid, text)') IS NOT NULL
       OR to_regprocedure('public.herbmail_message_get(uuid, uuid)') IS NOT NULL
       OR to_regprocedure('public.herbmail_mailbox_stats(uuid)') IS NOT NULL THEN
        RAISE EXCEPTION 'fail: inbox read RPCs should be dropped on down';
    END IF;
    IF (SELECT count(*) FROM mail.messages
         WHERE user_id = 'b0000000-0000-4000-8000-000000000011') <> 4 THEN
        RAISE EXCEPTION 'fail: rollback must not touch message rows';
    END IF;
    IF to_regclass('mail.messages_user_received_idx') IS NULL
       OR to_regclass('mail.messages_user_received_id_idx') IS NOT NULL THEN
        RAISE EXCEPTION 'fail: down must restore the original index';
    END IF;
END;
$$;
