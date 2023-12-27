// @generated automatically by Diesel CLI.

diesel::table! {
    _17d3847c_10a2_591e_bba4_02a5eeb15ae7_20231226221108_vrepl (ulid) {
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
        #[max_length = 16]
        ulid -> Binary,
        #[max_length = 16]
        userid -> Binary,
    }
}

diesel::table! {
    _1ddc9f62_cb84_50e3_9696_e6f4a2b42da1_20231226220145_vrepl (id) {
        id -> Unsigned<Bigint>,
        #[max_length = 256]
        username -> Varchar,
        role -> Integer,
        reputation -> Integer,
        exp -> Integer,
        created_at -> Timestamp,
    }
}

diesel::table! {
    _3800e931_e26b_5a0f_9414_7ed61ae9bc42_20231226221113_vrepl (ulid) {
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
        #[max_length = 16]
        ulid -> Binary,
        #[max_length = 16]
        userid -> Binary,
    }
}

diesel::table! {
    _44a364d5_312d_5c7f_8e6f_5aa7df45d875_20231226221053_vrepl (ulid) {
        id -> Unsigned<Bigint>,
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

diesel::table! {
    _77f38182_0cd4_5c4a_ba4e_c5c414f4edc9_20231226220211_vrepl (id) {
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
    _7893afc4_0fa3_5b61_9539_11502a637fb3_20231226220154_vrepl (id) {
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
    _91715809_c3be_5d63_9866_309a8d2d274f_20231226221058_vrepl (ulid) {
        id -> Unsigned<Bigint>,
        uuid -> Unsigned<Bigint>,
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
    _94eb9628_84eb_5d09_bb48_49f5e8ba6def_20231226220218_vrepl (id) {
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
    _9c88512c_9e47_5f6c_9566_b59f1ae89746_20231226221103_vrepl (ulid) {
        id -> Unsigned<Bigint>,
        uuid -> Unsigned<Bigint>,
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
    _9f206e1c_6425_5d10_beef_2a4047e6cbf3_20231226220235_vrepl (id) {
        id -> Unsigned<Bigint>,
        uuid -> Unsigned<Bigint>,
        #[max_length = 255]
        key -> Varchar,
        #[max_length = 255]
        value -> Varchar,
    }
}

diesel::table! {
    _d1cd2b71_0120_5d2d_b8a5_3c0ae44c5c5c_20231226221123_vrepl (ulid) {
        id -> Unsigned<Bigint>,
        uuid -> Unsigned<Bigint>,
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
    _e64c12b3_6d8f_5263_8eb6_f83a6aa4db71_20231226221118_vrepl (ulid) {
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
        #[max_length = 16]
        ulid -> Binary,
        #[max_length = 16]
        userid -> Binary,
    }
}

diesel::table! {
    _e875b290_67f6_5d86_9623_bfa5e4d3315e_20231226220203_vrepl (id) {
        id -> Unsigned<Bigint>,
        uuid -> Unsigned<Bigint>,
        #[max_length = 256]
        appwrite_endpoint -> Varchar,
        #[max_length = 256]
        appwrite_projectid -> Varchar,
        #[max_length = 256]
        appwrite_api_key -> Varchar,
        #[max_length = 64]
        version -> Varchar,
        created_at -> Timestamp,
    }
}

diesel::table! {
    _ece0baa2_00a8_5708_ba18_4732de0ea7ce_20231226220226_vrepl (id) {
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

diesel::joinable!(_17d3847c_10a2_591e_bba4_02a5eeb15ae7_20231226221108_vrepl -> users (userid));
diesel::joinable!(_3800e931_e26b_5a0f_9414_7ed61ae9bc42_20231226221113_vrepl -> users (userid));
diesel::joinable!(_91715809_c3be_5d63_9866_309a8d2d274f_20231226221058_vrepl -> users (userid));
diesel::joinable!(_9c88512c_9e47_5f6c_9566_b59f1ae89746_20231226221103_vrepl -> users (userid));
diesel::joinable!(_d1cd2b71_0120_5d2d_b8a5_3c0ae44c5c5c_20231226221123_vrepl -> users (userid));
diesel::joinable!(_e64c12b3_6d8f_5263_8eb6_f83a6aa4db71_20231226221118_vrepl -> users (userid));
diesel::joinable!(apikey -> users (userid));
diesel::joinable!(appwrite -> users (userid));
diesel::joinable!(auth -> users (userid));
diesel::joinable!(n8n -> users (userid));
diesel::joinable!(profile -> users (userid));
diesel::joinable!(settings -> users (userid));

diesel::allow_tables_to_appear_in_same_query!(
    _17d3847c_10a2_591e_bba4_02a5eeb15ae7_20231226221108_vrepl,
    _1ddc9f62_cb84_50e3_9696_e6f4a2b42da1_20231226220145_vrepl,
    _3800e931_e26b_5a0f_9414_7ed61ae9bc42_20231226221113_vrepl,
    _44a364d5_312d_5c7f_8e6f_5aa7df45d875_20231226221053_vrepl,
    _77f38182_0cd4_5c4a_ba4e_c5c414f4edc9_20231226220211_vrepl,
    _7893afc4_0fa3_5b61_9539_11502a637fb3_20231226220154_vrepl,
    _91715809_c3be_5d63_9866_309a8d2d274f_20231226221058_vrepl,
    _94eb9628_84eb_5d09_bb48_49f5e8ba6def_20231226220218_vrepl,
    _9c88512c_9e47_5f6c_9566_b59f1ae89746_20231226221103_vrepl,
    _9f206e1c_6425_5d10_beef_2a4047e6cbf3_20231226220235_vrepl,
    _d1cd2b71_0120_5d2d_b8a5_3c0ae44c5c5c_20231226221123_vrepl,
    _e64c12b3_6d8f_5263_8eb6_f83a6aa4db71_20231226221118_vrepl,
    _e875b290_67f6_5d86_9623_bfa5e4d3315e_20231226220203_vrepl,
    _ece0baa2_00a8_5708_ba18_4732de0ea7ce_20231226220226_vrepl,
    apikey,
    appwrite,
    auth,
    globals,
    n8n,
    profile,
    settings,
    users,
);
