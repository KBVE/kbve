

-- Createa table for user settings

create table user_settings (
    id uuid references auth.users on delete cascade not null primary key,
    settings jsonb not null default '{}',
    
    -- Constraints for settings
    constraint settings_valid check (
        jsonb_typeof(settings) = 'object' and 
        octet_length(settings::text) <= 10000
    )
);

alter table user_settings
    enable row level security;

create policy "User can view own settings" on user_settings
    for select using (auth.uid() = id);

create policy "User can update own settings" on user_settings
    for update using (auth.uid() = id);

create policy "User can insert own settings" on user_settings
    for insert with check (auth.uid() = id);

-- Create a table for public ledgers

create table ledger (
    id uuid references auth.users on delete cascade not null primary key,
    khash int default 100000 not null,
    credits int default 100 not null,
    status int default 0 not null,

    -- Constraints for ledger
    constraint chk_khash_minimum check (khash >= 100),
    constraint chk_credits_minimum check (credits >= 100),
    constraint chk_coupon_non_negative check (coupon >= 0)
);

alter table ledger
    enable row level security;

create policy "Public ledgers are viewable by everyone." on ledger
    for select using (true);

-- inserts a row into public users
create function public.handle_new_user()
    returns trigger as $$
        begin
             -- Validate the username
            if new.raw_user_meta_data->>'username' is null or 
               char_length(new.raw_user_meta_data->>'username') < 5 or 
               char_length(new.raw_user_meta_data->>'username') > 24 or 
               not (new.raw_user_meta_data->>'username' ~ '^[A-Za-z0-9_-]+$') then
                raise exception 'Invalid username: must be between 5 and 24 characters long and can only contain letters, numbers, underscores, and hyphens.';
            end if;

            -- Validate the avatar_url and website (if applicable)
            if new.raw_user_meta_data->>'avatar_url' is not null and
               (char_length(new.raw_user_meta_data->>'avatar_url') > 32 or
                not (new.raw_user_meta_data->>'avatar_url' ~ '^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([/\w .-]*)*\/?$')) then
                raise exception 'Invalid avatar URL: must be a valid URL with a maximum length of 32 characters.';
            end if;

            if new.raw_user_meta_data->>'website' is not null and
               (char_length(new.raw_user_meta_data->>'website') > 32 or
                not (new.raw_user_meta_data->>'website' ~ '^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([/\w .-]*)*\/?$')) then
                raise exception 'Invalid website URL: must be a valid URL with a maximum length of 32 characters.';
            end if;

            -- Insert into profiles table
            begin
                insert into public.profiles (id, username, avatar_url, website)
                values (
                    new.id,
                    new.raw_user_meta_data->>'username',
                    coalesce(new.raw_user_meta_data->>'avatar_url', 'https://kbve.com/asset/guest.png'),
                    new.raw_user_meta_data->>'website'
                );
            exception when unique_violation then
                raise exception 'Username % already exists.', new.raw_user_meta_data->>'username';
            end;

            -- Insert into ledger table
            insert into public.ledger (id)
            values (
                new.id
            );

            -- Insert into user_settings table
            insert into public.user_settings (id, settings)
            values (
                new.id,
                '{}'::jsonb
            );

            return new;
        end;
    $$ language plpgsql security definer;

-- trigger the function every time a user is created
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute procedure public.handle_new_user();
