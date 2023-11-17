// @generated automatically by Diesel CLI.

diesel::table! {
    apikey (id) {
        id -> Unsigned<Bigint>,
        uuid -> Unsigned<Bigint>,
        #[max_length = 256]
        permissions -> Varchar,
        #[max_length = 256]
        keyhash -> Varchar,
        #[max_length = 256]
        label -> Varchar,
    }
}

diesel::table! {
    appwrite (id) {
        id -> Unsigned<Bigint>,
        uuid -> Unsigned<Bigint>,
        #[max_length = 256]
        appwrite_endpoint -> Varchar,
        #[max_length = 256]
        appwrite_projectid -> Varchar,
        #[max_length = 256]
        apppwrite_api_key -> Varchar,
        #[max_length = 64]
        version -> Varchar,
        created_at -> Timestamp,
    }
}

diesel::table! {
    auth (id) {
        id -> Unsigned<Bigint>,
        uuid -> Unsigned<Bigint>,
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
    }
}

diesel::table! {
    n8n (id) {
        id -> Unsigned<Bigint>,
        uuid -> Unsigned<Bigint>,
        #[max_length = 256]
        webhook -> Varchar,
        #[max_length = 256]
        permissions -> Varchar,
        #[max_length = 256]
        keyhash -> Varchar,
        #[max_length = 256]
        label -> Varchar,
    }
}

diesel::table! {
    profile (id) {
        id -> Unsigned<Bigint>,
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
        uuid -> Unsigned<Bigint>,
    }
}

diesel::table! {
    users (id) {
        id -> Unsigned<Bigint>,
        #[max_length = 256]
        username -> Varchar,
        role -> Integer,
        reputation -> Integer,
        exp -> Integer,
        created_at -> Timestamp,
    }
}

diesel::allow_tables_to_appear_in_same_query!(
    apikey,
    appwrite,
    auth,
    n8n,
    profile,
    users,
);
