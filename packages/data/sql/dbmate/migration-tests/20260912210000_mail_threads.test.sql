-- Companion test fixtures for 20260912210000_mail_threads.
-- Run via: ./test-migration.sh 20260912210000_mail_threads

-- SEED

DELETE FROM mail.messages
 WHERE user_id IN ('b0000000-0000-4000-8000-000000000021',
                   'b0000000-0000-4000-8000-000000000022');

INSERT INTO auth.users (id)
VALUES
    ('b0000000-0000-4000-8000-000000000021'),
    ('b0000000-0000-4000-8000-000000000022')
ON CONFLICT (id) DO NOTHING;

INSERT INTO profile.username (user_id, username)
VALUES
    ('b0000000-0000-4000-8000-000000000021', 'threadtest-erin'),
    ('b0000000-0000-4000-8000-000000000022', 'threadtest-frank')
ON CONFLICT (user_id) DO UPDATE SET username = EXCLUDED.username;

-- A three-message conversation seeded out of order, so the backfill cannot
-- pass by accident of insertion order.
INSERT INTO mail.messages (id, user_id, via, direction, from_addr, to_addr, subject, body, message_id, in_reply_to, received_at)
VALUES
    ('c0000000-0000-4000-8000-000000000002',
     'b0000000-0000-4000-8000-000000000021', 'smtp', 'in', 'friend@example.com', 'erin@herbmail.com',
     'Re: hello', 'second', '<t2@example.com>', '<t1@example.com>', now() - interval '2 hours'),

    ('c0000000-0000-4000-8000-000000000001',
     'b0000000-0000-4000-8000-000000000021', 'smtp', 'in', 'friend@example.com', 'erin@herbmail.com',
     'hello', 'first', '<t1@example.com>', NULL, now() - interval '3 hours'),

    ('c0000000-0000-4000-8000-000000000003',
     'b0000000-0000-4000-8000-000000000021', 'smtp', 'out', 'erin@herbmail.com', 'friend@example.com',
     'Re: hello', 'third', '<t3@herbmail.com>', '<t2@example.com>', now() - interval '1 hour');

-- An unrelated single message, and a reply whose parent never arrived here.
INSERT INTO mail.messages (id, user_id, via, direction, from_addr, to_addr, subject, body, message_id, in_reply_to, received_at)
VALUES
    ('c0000000-0000-4000-8000-000000000004',
     'b0000000-0000-4000-8000-000000000021', 'smtp', 'in', 'other@example.com', 'erin@herbmail.com',
     'standalone', 'alone', '<t4@example.com>', NULL, now() - interval '30 minutes'),

    ('c0000000-0000-4000-8000-000000000005',
     'b0000000-0000-4000-8000-000000000021', 'smtp', 'in', 'ghost@example.com', 'erin@herbmail.com',
     'Re: never seen', 'orphan', '<t5@example.com>', '<missing@example.com>', now() - interval '20 minutes');

-- Frank's mailbox reuses the SAME rfc message id as Erin's root. Threading is
-- per mailbox, so this must never join Erin's thread.
INSERT INTO mail.messages (id, user_id, via, direction, from_addr, to_addr, subject, body, message_id, in_reply_to, received_at)
VALUES
    ('c0000000-0000-4000-8000-000000000006',
     'b0000000-0000-4000-8000-000000000022', 'smtp', 'in', 'friend@example.com', 'frank@herbmail.com',
     'hello', 'franks copy', '<t1@example.com>', NULL, now() - interval '3 hours');

-- ASSERT_AFTER_UP

DO $$
DECLARE
    erin  constant uuid := 'b0000000-0000-4000-8000-000000000021';
    frank constant uuid := 'b0000000-0000-4000-8000-000000000022';
    root  constant uuid := 'c0000000-0000-4000-8000-000000000001';
    n     integer;
    r     jsonb;
    tid   uuid;
BEGIN
    -- Backfill: the whole chain roots on the first message, regardless of the
    -- order the rows were inserted in.
    SELECT count(DISTINCT thread_id) INTO n
      FROM mail.messages
     WHERE user_id = erin
       AND id IN ('c0000000-0000-4000-8000-000000000001',
                  'c0000000-0000-4000-8000-000000000002',
                  'c0000000-0000-4000-8000-000000000003');
    IF n <> 1 THEN
        RAISE EXCEPTION 'fail: chain split across % threads, expected 1', n;
    END IF;

    SELECT thread_id INTO tid FROM mail.messages WHERE id = root;
    IF tid <> root THEN
        RAISE EXCEPTION 'fail: chain rooted on %, expected %', tid, root;
    END IF;

    -- A reply whose parent is absent roots on itself rather than vanishing.
    SELECT thread_id INTO tid
      FROM mail.messages WHERE id = 'c0000000-0000-4000-8000-000000000005';
    IF tid <> 'c0000000-0000-4000-8000-000000000005' THEN
        RAISE EXCEPTION 'fail: orphan reply rooted on %, expected itself', tid;
    END IF;

    -- Same rfc message id in another mailbox must not be joined.
    SELECT thread_id INTO tid
      FROM mail.messages WHERE id = 'c0000000-0000-4000-8000-000000000006';
    IF tid = root THEN
        RAISE EXCEPTION 'fail: threading crossed mailboxes';
    END IF;
    IF tid <> 'c0000000-0000-4000-8000-000000000006' THEN
        RAISE EXCEPTION 'fail: franks message rooted on %, expected itself', tid;
    END IF;

    -- Trigger: a new reply inherits the thread without the API supplying it.
    INSERT INTO mail.messages (id, user_id, via, direction, from_addr, to_addr, subject, body, message_id, in_reply_to, received_at)
    VALUES ('c0000000-0000-4000-8000-000000000007',
            erin, 'smtp', 'out', 'erin@herbmail.com', 'friend@example.com',
            'Re: hello', 'fourth', '<t7@herbmail.com>', '<t3@herbmail.com>', now());
    -- now() is the transaction timestamp, so every row inserted in this block
    -- shares it; distinct offsets below keep the ordering assertions meaningful.

    SELECT thread_id INTO tid
      FROM mail.messages WHERE id = 'c0000000-0000-4000-8000-000000000007';
    IF tid <> root THEN
        RAISE EXCEPTION 'fail: trigger put new reply on %, expected %', tid, root;
    END IF;

    -- A brand new conversation gets its own thread.
    INSERT INTO mail.messages (id, user_id, via, direction, from_addr, to_addr, subject, body, message_id, received_at)
    VALUES ('c0000000-0000-4000-8000-000000000008',
            erin, 'smtp', 'in', 'stranger@example.com', 'erin@herbmail.com',
            'brand new', 'hi', '<t8@example.com>', now() - interval '10 minutes');

    SELECT thread_id INTO tid
      FROM mail.messages WHERE id = 'c0000000-0000-4000-8000-000000000008';
    IF tid <> 'c0000000-0000-4000-8000-000000000008' THEN
        RAISE EXCEPTION 'fail: new conversation rooted on %, expected itself', tid;
    END IF;

    -- herbmail_thread_list: one row per conversation, not per message.
    r := public.herbmail_thread_list(erin, 50, NULL, NULL, NULL);
    IF jsonb_array_length(r) <> 4 THEN
        RAISE EXCEPTION 'fail: thread_list returned % threads, expected 4 (%)',
            jsonb_array_length(r), r;
    END IF;

    -- Newest activity first: the reply just inserted is the most recent.
    IF (r -> 0 ->> 'thread_id')::uuid <> root THEN
        RAISE EXCEPTION 'fail: thread_list ordered %, expected % first',
            r -> 0 ->> 'thread_id', root;
    END IF;

    IF (r -> 0 ->> 'message_count')::int <> 4 THEN
        RAISE EXCEPTION 'fail: thread message_count = %, expected 4',
            r -> 0 ->> 'message_count';
    END IF;

    -- Participants collapse to the distinct addresses in the conversation.
    IF NOT (r -> 0 -> 'participants' @> '["friend@example.com"]'::jsonb
            AND r -> 0 -> 'participants' @> '["erin@herbmail.com"]'::jsonb) THEN
        RAISE EXCEPTION 'fail: participants missing an address: %',
            r -> 0 -> 'participants';
    END IF;

    -- Frank sees only his own single thread.
    r := public.herbmail_thread_list(frank, 50, NULL, NULL, NULL);
    IF jsonb_array_length(r) <> 1 THEN
        RAISE EXCEPTION 'fail: frank sees % threads, expected 1', jsonb_array_length(r);
    END IF;

    -- herbmail_thread_get: full transcript, oldest first.
    r := public.herbmail_thread_get(erin, root, 100);
    IF jsonb_array_length(r -> 'messages') <> 4 THEN
        RAISE EXCEPTION 'fail: thread_get returned % messages, expected 4',
            jsonb_array_length(r -> 'messages');
    END IF;
    IF (r -> 'messages' -> 0 ->> 'id')::uuid <> root THEN
        RAISE EXCEPTION 'fail: thread_get did not start at the root, got %',
            r -> 'messages' -> 0 ->> 'id';
    END IF;
    IF (r -> 'messages' -> 3 ->> 'body') <> 'fourth' THEN
        RAISE EXCEPTION 'fail: thread_get last message body = %, expected fourth',
            r -> 'messages' -> 3 ->> 'body';
    END IF;

    -- Another user's thread id must not be readable.
    r := public.herbmail_thread_get(frank, root, 100);
    IF r IS NOT NULL THEN
        RAISE EXCEPTION 'fail: frank read erins thread';
    END IF;
END $$;

-- ASSERT_AFTER_DOWN

DO $$
DECLARE
    erin constant uuid := 'b0000000-0000-4000-8000-000000000021';
    n    integer;
BEGIN
    SELECT count(*) INTO n
      FROM information_schema.columns
     WHERE table_schema = 'mail'
       AND table_name = 'messages'
       AND column_name = 'thread_id';
    IF n <> 0 THEN
        RAISE EXCEPTION 'fail: thread_id column survived rollback';
    END IF;

    SELECT count(*) INTO n
      FROM pg_proc p
      JOIN pg_namespace ns ON ns.oid = p.pronamespace
     WHERE ns.nspname = 'public'
       AND p.proname IN ('herbmail_thread_list', 'herbmail_thread_get');
    IF n <> 0 THEN
        RAISE EXCEPTION 'fail: % thread function(s) survived rollback', n;
    END IF;

    -- The messages themselves are user data and must outlive the rollback.
    SELECT count(*) INTO n FROM mail.messages WHERE user_id = erin;
    IF n < 5 THEN
        RAISE EXCEPTION 'fail: rollback destroyed messages, % left', n;
    END IF;
END $$;
