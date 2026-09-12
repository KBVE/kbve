-- Companion test fixtures for 20260912220000_mail_threads_hardening.
-- Run via: ./test-migration.sh 20260912220000_mail_threads_hardening

-- SEED

DELETE FROM mail.messages
 WHERE user_id IN ('b0000000-0000-4000-8000-000000000031',
                   'b0000000-0000-4000-8000-000000000032');

INSERT INTO auth.users (id)
VALUES
    ('b0000000-0000-4000-8000-000000000031'),
    ('b0000000-0000-4000-8000-000000000032')
ON CONFLICT (id) DO NOTHING;

INSERT INTO profile.username (user_id, username)
VALUES
    ('b0000000-0000-4000-8000-000000000031', 'hardtest-gina'),
    ('b0000000-0000-4000-8000-000000000032', 'hardtest-hank')
ON CONFLICT (user_id) DO UPDATE SET username = EXCLUDED.username;

-- Gina owns a conversation. Hank's mailbox is where the graft is attempted.
INSERT INTO mail.messages (id, user_id, via, direction, from_addr, to_addr, subject, body, message_id, received_at)
VALUES
    ('d0000000-0000-4000-8000-000000000001',
     'b0000000-0000-4000-8000-000000000031', 'smtp', 'in', 'friend@example.com', 'gina@herbmail.com',
     'ginas thread', 'hers', '<g1@example.com>', now() - interval '2 hours'),

    ('d0000000-0000-4000-8000-000000000002',
     'b0000000-0000-4000-8000-000000000032', 'smtp', 'in', 'friend@example.com', 'hank@herbmail.com',
     'hanks thread', 'his', '<h1@example.com>', now() - interval '2 hours');

-- ASSERT_AFTER_UP

DO $$
DECLARE
    gina constant uuid := 'b0000000-0000-4000-8000-000000000031';
    hank constant uuid := 'b0000000-0000-4000-8000-000000000032';
    gina_thread constant uuid := 'd0000000-0000-4000-8000-000000000001';
    acl  text;
    tid  uuid;
    r    jsonb;
BEGIN
    -- 1. The trigger function is no longer executable by PUBLIC.
    SELECT coalesce(array_to_string(p.proacl, ','), 'DEFAULT')
      INTO acl
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'mail' AND p.proname = 'assign_thread';

    IF acl = 'DEFAULT' THEN
        RAISE EXCEPTION 'fail: assign_thread still has default PUBLIC execute';
    END IF;
    IF acl LIKE '%=X/%' AND acl LIKE '=X/%' THEN
        RAISE EXCEPTION 'fail: assign_thread still grants PUBLIC: %', acl;
    END IF;

    -- 2. A thread_id belonging to another mailbox is refused and the message
    --    starts its own thread instead of joining Gina's.
    INSERT INTO mail.messages (id, user_id, via, direction, from_addr, to_addr, subject, body, message_id, thread_id, received_at)
    VALUES ('d0000000-0000-4000-8000-00000000000a',
            hank, 'smtp', 'in', 'attacker@evil.com', 'hank@herbmail.com',
            'grafted', 'payload', '<graft@evil.com>', gina_thread, now());

    SELECT thread_id INTO tid
      FROM mail.messages WHERE id = 'd0000000-0000-4000-8000-00000000000a';

    IF tid = gina_thread THEN
        RAISE EXCEPTION 'fail: foreign thread_id was accepted, message grafted into another mailbox thread';
    END IF;
    IF tid <> 'd0000000-0000-4000-8000-00000000000a' THEN
        RAISE EXCEPTION 'fail: rejected graft rooted on %, expected itself', tid;
    END IF;

    -- 3. A thread_id the mailbox DOES own is still honoured, so the guard has
    --    not broken legitimate supply.
    INSERT INTO mail.messages (id, user_id, via, direction, from_addr, to_addr, subject, body, message_id, thread_id, received_at)
    VALUES ('d0000000-0000-4000-8000-00000000000b',
            hank, 'smtp', 'in', 'friend@example.com', 'hank@herbmail.com',
            'own thread', 'mine', '<h2@example.com>',
            'd0000000-0000-4000-8000-000000000002', now());

    SELECT thread_id INTO tid
      FROM mail.messages WHERE id = 'd0000000-0000-4000-8000-00000000000b';
    IF tid <> 'd0000000-0000-4000-8000-000000000002' THEN
        RAISE EXCEPTION 'fail: own thread_id was rejected, got %', tid;
    END IF;

    -- 4. Gina's conversation is untouched by the attempt.
    r := public.herbmail_thread_get(gina, gina_thread, 100);
    IF jsonb_array_length(r -> 'messages') <> 1 THEN
        RAISE EXCEPTION 'fail: ginas thread now has % messages, expected 1',
            jsonb_array_length(r -> 'messages');
    END IF;

    -- 5. The list hands back raw body for the caller to decode, not a regexp
    --    snippet of MIME.
    INSERT INTO mail.messages (id, user_id, via, direction, from_addr, to_addr, subject, body, message_id, received_at)
    VALUES ('d0000000-0000-4000-8000-00000000000c',
            gina, 'smtp', 'in', 'friend@example.com', 'gina@herbmail.com',
            'mime', E'Content-Type: text/plain; charset=utf-8\nContent-Transfer-Encoding: base64\n\naGVsbG8=',
            '<g9@example.com>', now() + interval '1 hour');

    r := public.herbmail_thread_list(gina, 50, NULL, NULL, NULL);

    IF r -> 0 ? 'last_snippet' THEN
        RAISE EXCEPTION 'fail: last_snippet still present';
    END IF;
    IF NOT (r -> 0 ? 'last_body') THEN
        RAISE EXCEPTION 'fail: last_body missing from thread_list';
    END IF;
    IF (r -> 0 ->> 'last_body') NOT LIKE '%aGVsbG8=%' THEN
        RAISE EXCEPTION 'fail: last_body is not the raw body: %',
            r -> 0 ->> 'last_body';
    END IF;

    -- Hank still sees only his own threads: the graft attempt plus his own.
    r := public.herbmail_thread_list(hank, 50, NULL, NULL, NULL);
    IF jsonb_array_length(r) <> 2 THEN
        RAISE EXCEPTION 'fail: hank sees % threads, expected 2', jsonb_array_length(r);
    END IF;
END $$;

-- ASSERT_AFTER_DOWN

DO $$
DECLARE
    hank constant uuid := 'b0000000-0000-4000-8000-000000000032';
    n    integer;
BEGIN
    -- The prior migration's thread surface is still in place after rolling
    -- this one back; only the hardening is reverted.
    SELECT count(*) INTO n
      FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
     WHERE ns.nspname = 'mail' AND p.proname = 'assign_thread';
    IF n <> 1 THEN
        RAISE EXCEPTION 'fail: assign_thread missing after rollback';
    END IF;

    SELECT count(*) INTO n FROM mail.messages WHERE user_id = hank;
    IF n < 3 THEN
        RAISE EXCEPTION 'fail: rollback destroyed messages, % left', n;
    END IF;
END $$;
