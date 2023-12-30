// @generated automatically by Diesel CLI.

diesel::table! {
    apikey (ulid) {
        #[max_length = 256]
        permissions -> Varchar,
        #[max_length = 256]
        keyhash -> Varchar,
        #[max_length = 256]
        label -> Varchar,
        #[max_length = 16]
        ulid -> Binary,
        #[max_length = 16]
        userid -> Binary,
    }
}

diesel::table! {
    appwrite (ulid) {
        #[max_length = 256]
        appwrite_endpoint -> Varchar,
        #[max_length = 256]
        appwrite_projectid -> Varchar,
        #[max_length = 256]
        appwrite_api_key -> Varchar,
        #[max_length = 64]
        version -> Varchar,
        created_at -> Timestamp,
        #[max_length = 16]
        ulid -> Binary,
        #[max_length = 16]
        userid -> Binary,
    }
}

diesel::table! {
    auth (ulid) {
        #[max_length = 256]
        email -> Varchar,
        #[max_length = 256]
        hash -> Varchar,
        #[max_length = 256]
        salt -> Varchar,
        #[max_length = 256]
        password_reset_token -> Varchar,
        password_reset_expiry -> Timestamp,
        #[max_length = 256]
        verification_token -> Varchar,
        verification_expiry -> Timestamp,
        status -> Integer,
        last_login_at -> Timestamp,
        failed_login_attempts -> Integer,
        lockout_until -> Timestamp,
        #[max_length = 256]
        two_factor_secret -> Varchar,
        recovery_codes -> Text,
        #[max_length = 16]
        ulid -> Binary,
        #[max_length = 16]
        userid -> Binary,
    }
}

diesel::table! {
    globals (id) {
        id -> Unsigned<Bigint>,
        #[max_length = 255]
        key -> Varchar,
        #[max_length = 255]
        value -> Varchar,
    }
}

diesel::table! {
    n8n (ulid) {
        #[max_length = 256]
        webhook -> Varchar,
        #[max_length = 256]
        permissions -> Varchar,
        #[max_length = 256]
        keyhash -> Varchar,
        #[max_length = 256]
        label -> Varchar,
        #[max_length = 16]
        ulid -> Binary,
        #[max_length = 16]
        userid -> Binary,
    }
}

diesel::table! {
    profile (ulid) {
        #[max_length = 256]
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
        ulid -> Binary,
        #[max_length = 16]
        userid -> Binary,
    }
}

diesel::table! {
    settings (ulid) {
        #[max_length = 255]
        key -> Varchar,
        #[max_length = 255]
        value -> Varchar,
        #[max_length = 16]
        ulid -> Binary,
        #[max_length = 16]
        userid -> Binary,
    }
}

diesel::table! {
    users (ulid) {
        #[max_length = 256]
        username -> Varchar,
        role -> Integer,
        reputation -> Integer,
        exp -> Integer,
        created_at -> Timestamp,
        #[max_length = 16]
        ulid -> Binary,
    }
}

diesel::joinable!(apikey -> users (userid));
diesel::joinable!(appwrite -> users (userid));
diesel::joinable!(auth -> users (userid));
diesel::joinable!(n8n -> users (userid));
diesel::joinable!(profile -> users (userid));
diesel::joinable!(settings -> users (userid));

diesel::allow_tables_to_appear_in_same_query!(
    apikey,
    appwrite,
    auth,
    globals,
    n8n,
    profile,
    settings,
    users,
);
