// @generated automatically by Diesel CLI.

diesel::table! {
    apikey (id) {
        id -> Unsigned<Bigint>,
        uuid -> Unsigned<Bigint>,
        #[max_length = 256]
        permissions -> Nullable<Varchar>,
        #[max_length = 256]
        keyhash -> Nullable<Varchar>,
        #[max_length = 256]
        label -> Nullable<Varchar>,
    }
}

diesel::table! {
    appwrite (id) {
        id -> Unsigned<Bigint>,
        uuid -> Unsigned<Bigint>,
        #[max_length = 256]
        appwrite_endpoint -> Nullable<Varchar>,
        #[max_length = 256]
        appwrite_projectid -> Nullable<Varchar>,
        #[max_length = 256]
        apppwrite_api_key -> Nullable<Varchar>,
        #[max_length = 64]
        version -> Nullable<Varchar>,
        created_at -> Timestamp,
    }
}

diesel::table! {
    auth (id) {
        id -> Unsigned<Bigint>,
        uuid -> Unsigned<Bigint>,
        #[max_length = 256]
        email -> Nullable<Varchar>,
        #[max_length = 256]
        hash -> Varchar,
        #[max_length = 256]
        salt -> Varchar,
        #[max_length = 256]
        password_reset_token -> Nullable<Varchar>,
        password_reset_expiry -> Nullable<Timestamp>,
        #[max_length = 256]
        verification_token -> Nullable<Varchar>,
        verification_expiry -> Nullable<Timestamp>,
        status -> Nullable<Integer>,
        last_login_at -> Nullable<Timestamp>,
        failed_login_attempts -> Nullable<Integer>,
        lockout_until -> Nullable<Timestamp>,
        #[max_length = 256]
        two_factor_secret -> Nullable<Varchar>,
        recovery_codes -> Nullable<Text>,
    }
}

diesel::table! {
    n8n (id) {
        id -> Unsigned<Bigint>,
        uuid -> Unsigned<Bigint>,
        #[max_length = 256]
        webhook -> Nullable<Varchar>,
        #[max_length = 256]
        permissions -> Nullable<Varchar>,
        #[max_length = 256]
        keyhash -> Nullable<Varchar>,
        #[max_length = 256]
        label -> Nullable<Varchar>,
    }
}

diesel::table! {
    profile (id) {
        id -> Unsigned<Bigint>,
        #[max_length = 256]
        name -> Nullable<Varchar>,
        #[max_length = 64]
        bio -> Nullable<Varchar>,
        #[max_length = 64]
        unsplash -> Nullable<Varchar>,
        #[max_length = 64]
        github -> Nullable<Varchar>,
        #[max_length = 64]
        instagram -> Nullable<Varchar>,
        #[max_length = 64]
        discord -> Nullable<Varchar>,
        uuid -> Unsigned<Bigint>,
    }
}

diesel::table! {
    users (id) {
        id -> Unsigned<Bigint>,
        #[max_length = 256]
        username -> Nullable<Varchar>,
        role -> Nullable<Integer>,
        reputation -> Nullable<Integer>,
        exp -> Nullable<Integer>,
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
