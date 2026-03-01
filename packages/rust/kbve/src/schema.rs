// @generated automatically by Diesel CLI.

diesel::table! {
    apikey (id) {
        id -> Int8,
        #[max_length = 16]
        ulid -> Bytea,
        #[max_length = 16]
        userid -> Bytea,
        #[max_length = 255]
        permissions -> Varchar,
        #[max_length = 255]
        keyhash -> Varchar,
        #[max_length = 255]
        label -> Varchar,
    }
}

diesel::table! {
    appwrite (id) {
        id -> Int8,
        #[max_length = 16]
        ulid -> Bytea,
        #[max_length = 16]
        userid -> Bytea,
        #[max_length = 255]
        appwrite_endpoint -> Varchar,
        #[max_length = 255]
        appwrite_projectid -> Varchar,
        #[max_length = 255]
        appwrite_api_key -> Varchar,
        #[max_length = 64]
        version -> Varchar,
        created_at -> Timestamp,
    }
}

diesel::table! {
    auth (id) {
        id -> Int8,
        #[max_length = 16]
        ulid -> Bytea,
        #[max_length = 16]
        userid -> Bytea,
        #[max_length = 255]
        email -> Varchar,
        #[max_length = 255]
        hash -> Varchar,
        #[max_length = 255]
        salt -> Varchar,
        #[max_length = 255]
        password_reset_token -> Varchar,
        password_reset_expiry -> Timestamp,
        #[max_length = 255]
        verification_token -> Varchar,
        verification_expiry -> Timestamp,
        status -> Integer,
        last_login_at -> Timestamp,
        failed_login_attempts -> Integer,
        lockout_until -> Timestamp,
        #[max_length = 255]
        two_factor_secret -> Varchar,
        recovery_codes -> Text,
    }
}

diesel::table! {
    characters (id) {
        id -> Int8,
        #[max_length = 16]
        cid -> Bytea,
        #[max_length = 16]
        userid -> Bytea,
        hp -> Integer,
        mp -> Integer,
        ep -> Integer,
        health -> Integer,
        mana -> Integer,
        energy -> Integer,
        armour -> Integer,
        agility -> Integer,
        strength -> Integer,
        intelligence -> Integer,
        #[max_length = 255]
        name -> Varchar,
        #[max_length = 255]
        description -> Varchar,
        experience -> Integer,
        reputation -> Integer,
        faith -> Integer,
    }
}

diesel::table! {
    globals (id) {
        id -> Int8,
        #[max_length = 255]
        key -> Varchar,
        #[max_length = 255]
        value -> Varchar,
    }
}

diesel::table! {
    invoice (id) {
        id -> Int8,
        #[max_length = 16]
        ulid -> Bytea,
        #[max_length = 16]
        userid -> Bytea,
        items -> Jsonb,
        paid -> Float8,
        total -> Float8,
        balance -> Float8,
        #[max_length = 255]
        external -> Varchar,
        due -> Int8,
        visibility -> Integer,
        status -> Integer,
    }
}

diesel::table! {
    n8n (id) {
        id -> Int8,
        #[max_length = 16]
        ulid -> Bytea,
        #[max_length = 16]
        userid -> Bytea,
        #[max_length = 255]
        webhook -> Varchar,
        #[max_length = 255]
        permissions -> Varchar,
        #[max_length = 255]
        keyhash -> Varchar,
        #[max_length = 255]
        label -> Varchar,
    }
}

diesel::table! {
    profile (id) {
        id -> Int8,
        #[max_length = 16]
        ulid -> Bytea,
        #[max_length = 255]
        name -> Varchar,
        #[max_length = 64]
        bio -> Varchar,
        #[max_length = 64]
        unsplash -> Varchar,
        #[max_length = 64]
        github -> Varchar,
        #[max_length = 64]
        instagram -> Varchar,
        #[max_length = 64]
        discord -> Varchar,
        #[max_length = 16]
        userid -> Bytea,
    }
}

diesel::table! {
    settings (id) {
        id -> Int8,
        #[max_length = 16]
        ulid -> Bytea,
        #[max_length = 16]
        userid -> Bytea,
        #[max_length = 255]
        key -> Varchar,
        #[max_length = 255]
        value -> Varchar,
    }
}

diesel::table! {
    users (id) {
        id -> Int8,
        #[max_length = 16]
        userid -> Bytea,
        #[max_length = 255]
        username -> Varchar,
        role -> Integer,
        reputation -> Integer,
        exp -> Integer,
        created_at -> Timestamp,
    }
}

diesel::allow_tables_to_appear_in_same_query!(
    apikey, appwrite, auth, characters, globals, invoice, n8n, profile, settings, users,
);
