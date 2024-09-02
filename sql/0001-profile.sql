-- Create a table for public profiles

create table profiles (
    id uuid references auth.users on delete cascade not null primary key,
    updated_at timestamp with time zone,
    username text unique,
    avatar_url text,
    website text,
    -- Constraints for username
    constraint username_length check (char_length(username) >= 5)
    constraint username_format check (username ~ '^[A-Za-z0-9_-]+$')

);

alter table profiles
    enable row level security;

create policy "Public profiles are viewable by everyone." on profiles
    for select using (true);

create policy "Users can insert their own profile." on profiles
    for insert with check (auth.uid() = id);

create policy "Users can update own profile." on profiles
    for update using (auth.uid() = id);

--- Create a table for public ledgers

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
            not (new.raw_user_meta_data->>'username' ~ '^[A-Za-z0-9_-]+$') then
                raise exception 'Invalid username: must be at least 5 characters long and can only contain letters, numbers, underscores, and hyphens.';
            end if;

            -- Insert into profiles table
            begin
                insert into public.profiles (id, username, avatar_url)
                values (
                new.id,
                new.raw_user_meta_data->>'username',
                coalesce(new.raw_user_meta_data->>'avatar_url', 'https://kbve.com/asset/guest.png')
                );
            exception when unique_violation then
                raise exception 'Username % already exists.', new.raw_user_meta_data->>'username';
            end;

            -- Insert into ledger table
            insert into public.ledger (id)
                values (
                    new.id
                );

            return new;
        end;
    $$ language plpgsql security definer;

-- trigger the function every time a user is created
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute procedure public.handle_new_user();
