BEGIN;
-- Insert into user_cards for existing users in user_profiles that do not have a user_card yet
INSERT INTO public.user_cards (id, bio, socials, style)
SELECT 
    id,
    NULL,         -- Default bio value, can be adjusted as needed
    NULL,         -- Default socials value, can be adjusted as needed
    NULL          -- Default style value, can be adjusted as needed
FROM public.user_profiles
WHERE id NOT IN (SELECT id FROM public.user_cards);
COMMIT;