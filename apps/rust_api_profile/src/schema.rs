// @generated automatically by Diesel CLI.

pub mod sql_types {
    #[derive(diesel::query_builder::QueryId, diesel::sql_types::SqlType)]
    #[diesel(mysql_type(name = "Enum"))]
    pub struct AuthStatusEnum;

    #[derive(diesel::query_builder::QueryId, diesel::sql_types::SqlType)]
    #[diesel(mysql_type(name = "Enum"))]
    pub struct UsersRoleEnum;
}

diesel::table! {
    apikey (id) {
        id -> Unsigned<Bigint>,
        uuid -> Nullable<Integer>,
        permissions -> Nullable<Json>,
        #[max_length = 256]
        keyhash -> Nullable<Varchar>,
        #[max_length = 256]
        label -> Nullable<Varchar>,
    }
}

diesel::table! {
    appwrite (id) {
        id -> Unsigned<Bigint>,
        uuid -> Nullable<Integer>,
        #[max_length = 256]
        appwrite_endpoint -> Nullable<Varchar>,
        #[max_length = 256]
        appwrite_projectid -> Nullable<Varchar>,
        #[max_length = 256]
        apppwrite_api_key -> Nullable<Varchar>,
        #[max_length = 64]
        version -> Nullable<Varchar>,
        createdAt -> Timestamp,
    }
}

diesel::table! {
    use diesel::sql_types::*;
    use super::sql_types::AuthStatusEnum;

    auth (id) {
        id -> Unsigned<Bigint>,
        uuid -> Nullable<Integer>,
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
        #[max_length = 9]
        status -> Nullable<AuthStatusEnum>,
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
        uuid -> Nullable<Integer>,
        #[max_length = 256]
        webhook -> Nullable<Varchar>,
        permissions -> Nullable<Json>,
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
        uuid -> Nullable<Integer>,
    }
}

diesel::table! {
    use diesel::sql_types::*;
    use super::sql_types::UsersRoleEnum;

    users (id) {
        id -> Unsigned<Bigint>,
        #[max_length = 256]
        username -> Nullable<Varchar>,
        reputation -> Nullable<Integer>,
        exp -> Nullable<Integer>,
        #[max_length = 5]
        role -> Nullable<UsersRoleEnum>,
        createdAt -> Timestamp,
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
