-- Extensions Check
CREATE EXTENSION IF NOT EXISTS moddatetime SCHEMA extensions;

-- Create a table for public user_profiles
CREATE TABLE IF NOT EXISTS user_profiles (
    id uuid REFERENCES auth.users ON DELETE CASCADE NOT NULL PRIMARY KEY,
    updated_at TIMESTAMP WITH TIME ZONE,
    username TEXT UNIQUE,
    avatar_url TEXT,

    -- Constraints for username
    CONSTRAINT username_length CHECK (char_length(username) >= 5 AND char_length(username) <= 24),
    CONSTRAINT username_format CHECK (username ~ '^[A-Za-z0-9_-]+$'),
    CONSTRAINT avatar_url_length CHECK (char_length(avatar_url) <= 128),
    CONSTRAINT avatar_url_format CHECK (avatar_url ~ '^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([/\w .-]*)*\/?$')
);

alter table user_profiles
    enable row level security;

create policy "Public user_profiles are viewable by everyone." on user_profiles
    for select using (true);

create policy "Users can insert their own profile." on user_profiles
    for insert with check (auth.uid() = id);

create policy "Users can update own profile." on user_profiles
    for update using (auth.uid() = id);

create trigger handle_user_profiles_update
    before update on user_profiles
    for each row
    execute procedure moddatetime(updated_at);

-- inserts a row into public users
create function public.handle_new_user()
    returns trigger as $$
        begin

             -- Validate the username
            if new.raw_user_meta_data->>'username' is null or 
               char_length(new.raw_user_meta_data->>'username') < 5 or 
               char_length(new.raw_user_meta_data->>'username') > 24 or 
               not (new.raw_user_meta_data->>'username' ~ '^[A-Za-z0-9_-]+$') then
                raise exception 'invalid_username';
            end if;

            -- Validate the avatar_url (if applicable)
            if new.raw_user_meta_data->>'avatar_url' is not null and
               (char_length(new.raw_user_meta_data->>'avatar_url') > 128 or
                not (new.raw_user_meta_data->>'avatar_url' ~ '^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([/\w .-]*)*\/?$')) then
                raise exception 'invalid_avatar';
            end if;

         
            -- Insert into user_profiles table
            begin
                insert into public.user_profiles (id, username, avatar_url)
                values (
                    new.id,
                    new.raw_user_meta_data->>'username',
                    coalesce(new.raw_user_meta_data->>'avatar_url', 'https://kbve.com/asset/guest.png'),
                );
            exception when unique_violation then
                raise exception 'username_taken';
            end;

            return new;
        end;
    $$ language plpgsql security definer;

-- trigger the function every time a user is created
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute procedure public.handle_new_user();
