-- Companion test fixtures for 20260912120000_mail_outbound_hardening.
-- Run via: ./test-migration.sh 20260912120000_mail_outbound_hardening

-- SEED

DELETE FROM auth.users
 WHERE id IN ('b0000000-0000-4000-8000-000000000001',
              'b0000000-0000-4000-8000-000000000002');

INSERT INTO auth.users (id)
VALUES
    ('b0000000-0000-4000-8000-000000000001'),
    ('b0000000-0000-4000-8000-000000000002');

INSERT INTO profile.username (user_id, username)
VALUES
    ('b0000000-0000-4000-8000-000000000001', 'mailtest-alice'),
    ('b0000000-0000-4000-8000-000000000002', 'mailtest-bob');

INSERT INTO mail.messages (user_id, via, direction, from_addr, subject, body)
VALUES
    ('b0000000-0000-4000-8000-000000000001', 'smtp', 'in', 'Friend@Example.com', 'hello', 'first contact');

-- ASSERT_AFTER_UP

DO $$
DECLARE
    alice  constant uuid := 'b0000000-0000-4000-8000-000000000001';
    bob    constant uuid := 'b0000000-0000-4000-8000-000000000002';
    r      jsonb;
    row_id uuid;
    stored mail.messages%ROWTYPE;
    i      integer;
BEGIN
    -- reply-only: unknown recipient refused, prior sender allowed
    r := public.herbmail_outbound_prepare(alice, 'stranger@example.com', 's', 'b');
    IF r ->> 'reason' IS DISTINCT FROM 'not_a_reply' THEN
        RAISE EXCEPTION 'fail: stranger should be not_a_reply, got %', r;
    END IF;

    r := public.herbmail_outbound_prepare(alice, 'friend@example.com@evil.example', 's', 'b');
    IF r ->> 'reason' IS DISTINCT FROM 'bad_recipient' THEN
        RAISE EXCEPTION 'fail: multi-@ recipient should be bad_recipient, got %', r;
    END IF;

    r := public.herbmail_outbound_prepare(alice, 'mailtest-alice@herbmail.com', 's', 'b');
    IF r ->> 'reason' IS DISTINCT FROM 'self' THEN
        RAISE EXCEPTION 'fail: self send should be refused, got %', r;
    END IF;

    r := public.herbmail_outbound_prepare(alice, 'friend@example.com', 's', '   ');
    IF r ->> 'reason' IS DISTINCT FROM 'empty_body' THEN
        RAISE EXCEPTION 'fail: blank body should be empty_body, got %', r;
    END IF;

    r := public.herbmail_outbound_prepare(
        alice, '  FRIEND@example.com ', E'Re: hi\r\nBcc: victim@example.com', 'thanks', 'not-a-message-id');
    IF (r ->> 'ok')::boolean IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'fail: reply to prior sender should be ok, got %', r;
    END IF;
    IF r ->> 'from' <> 'mailtest-alice@herbmail.com' OR r ->> 'to' <> 'friend@example.com' THEN
        RAISE EXCEPTION 'fail: from/to not normalised: %', r;
    END IF;
    row_id := (r ->> 'id')::uuid;
    SELECT * INTO stored FROM mail.messages WHERE id = row_id;
    IF stored.direction <> 'out' OR stored.status <> 'queued' THEN
        RAISE EXCEPTION 'fail: outbound row should be queued/out';
    END IF;
    IF stored.subject ~ '[\r\n]' THEN
        RAISE EXCEPTION 'fail: CR/LF survived in subject: %', stored.subject;
    END IF;
    IF stored.in_reply_to IS NOT NULL THEN
        RAISE EXCEPTION 'fail: malformed In-Reply-To should be dropped, got %', stored.in_reply_to;
    END IF;

    -- mark: sent once, second mark is a no-op, message id must be <token>
    IF NOT public.herbmail_outbound_mark(row_id, 'sent', 'garbage id') THEN
        RAISE EXCEPTION 'fail: first mark should update the queued row';
    END IF;
    SELECT * INTO stored FROM mail.messages WHERE id = row_id;
    IF stored.status <> 'sent' OR stored.sent_at IS NULL OR stored.message_id IS NOT NULL THEN
        RAISE EXCEPTION 'fail: mark sent left row in wrong state (% % %)', stored.status, stored.sent_at, stored.message_id;
    END IF;
    IF public.herbmail_outbound_mark(row_id, 'failed', NULL, 'late') THEN
        RAISE EXCEPTION 'fail: a sent row must not be re-marked';
    END IF;

    -- well-formed In-Reply-To is kept
    r := public.herbmail_outbound_prepare(alice, 'friend@example.com', 's', 'b', ' <abc@example.com> ');
    SELECT * INTO stored FROM mail.messages WHERE id = (r ->> 'id')::uuid;
    IF stored.in_reply_to <> '<abc@example.com>' THEN
        RAISE EXCEPTION 'fail: In-Reply-To not kept: %', stored.in_reply_to;
    END IF;

    -- cap: 2 used so far; fill to the cap, then one more is refused
    FOR i IN 1 .. mail.outbound_daily_cap() - 2 LOOP
        r := public.herbmail_outbound_prepare(alice, 'friend@example.com', 's', 'b');
        IF (r ->> 'ok')::boolean IS DISTINCT FROM true THEN
            RAISE EXCEPTION 'fail: send % under the cap refused: %', i, r;
        END IF;
    END LOOP;
    r := public.herbmail_outbound_prepare(alice, 'friend@example.com', 's', 'b');
    IF r ->> 'reason' IS DISTINCT FROM 'daily_cap' THEN
        RAISE EXCEPTION 'fail: send past the cap should be daily_cap, got %', r;
    END IF;

    -- ingest: whole-address recipient match, sender linked only on spf=pass
    r := public.stalwart_ingest('someone@example.com',
                                ARRAY['mailtest-bob@herbmail.com@evil.example', 'mailtest-bob@herbmail.com']);
    IF jsonb_array_length(r -> 'accepted') <> 1 OR jsonb_array_length(r -> 'rejected') <> 1 THEN
        RAISE EXCEPTION 'fail: ingest should accept one and reject one, got %', r;
    END IF;

    r := public.stalwart_ingest('mailtest-alice@herbmail.com', ARRAY['mailtest-bob@herbmail.com'], 'unverified', 'b',
                                '[]'::jsonb);
    SELECT * INTO stored FROM mail.messages
     WHERE user_id = bob AND direction = 'in' AND from_addr = 'mailtest-alice@herbmail.com'
       AND subject = 'unverified';
    IF stored.from_user_id IS NOT NULL THEN
        RAISE EXCEPTION 'fail: unverified herbmail sender must not be linked to a profile';
    END IF;

    r := public.stalwart_ingest('mailtest-alice@herbmail.com', ARRAY['mailtest-bob@herbmail.com'], E'verified\nx', 'b',
                                '[["Authentication-Results", "mail.herbmail.com; spf=pass smtp.mailfrom=mailtest-alice@herbmail.com"]]'::jsonb);
    SELECT * INTO stored FROM mail.messages
     WHERE user_id = bob AND direction = 'in' AND from_addr = 'mailtest-alice@herbmail.com'
       AND subject = 'verified x';
    IF stored.from_user_id IS DISTINCT FROM alice THEN
        RAISE EXCEPTION 'fail: spf=pass herbmail sender should link to alice';
    END IF;
    IF stored.subject ~ '[\r\n]' THEN
        RAISE EXCEPTION 'fail: ingest subject kept a newline';
    END IF;

    -- privileges
    IF has_function_privilege('anon', 'public.herbmail_outbound_prepare(uuid, text, text, text, text)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.herbmail_outbound_mark(uuid, text, text, text)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.stalwart_ingest(text, text[], text, text, jsonb)', 'EXECUTE')
       OR has_function_privilege('anon', 'mail.outbound_daily_cap()', 'EXECUTE') THEN
        RAISE EXCEPTION 'fail: anon/authenticated can execute a mail RPC';
    END IF;
END;
$$;

-- ASSERT_AFTER_DOWN

DO $$
BEGIN
    IF to_regprocedure('public.herbmail_outbound_prepare(uuid, text, text, text, text)') IS NULL
       OR to_regprocedure('public.stalwart_ingest(text, text[], text, text, jsonb)') IS NULL THEN
        RAISE EXCEPTION 'fail: rollback must leave the previous function bodies in place';
    END IF;
    IF has_function_privilege('anon', 'public.herbmail_outbound_prepare(uuid, text, text, text, text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'fail: rollback must not open herbmail_outbound_prepare to anon';
    END IF;
END;
$$;
