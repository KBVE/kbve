use pgrx::prelude::*;
use jedi::lazyregex::{extract_email_from_regex_zero_copy, extract_github_username_from_regex_zero_copy};
::pgrx::pg_module_magic!();

#[pg_extern]
fn hello_kilobase() -> &'static str {
    "Hello, kilobase, this is an example query that is being called from rust!"
}

#[pg_extern]
fn bust_selling_propane() -> &'static str {
    "Bust is selling the best propane"
}

#[pg_extern(immutable, parallel_safe)]
fn pgrx_extract_email(email: &str) -> &str {
    match extract_email_from_regex_zero_copy(email) {
        Ok(result) => result,
        Err(err_msg) => {
            ereport!(
                PgLogLevel::ERROR,
                PgSqlErrorCode::ERRCODE_INTERNAL_ERROR,
                &format!("{}", err_msg)
            );
            ""
        }
    }
}

#[pg_extern(immutable, parallel_safe)]
fn pgrx_extract_github_username(url: &str) -> &str {
    match extract_github_username_from_regex_zero_copy(url) {
        Ok(result) => result,
        Err(err_msg) => {
            ereport!(
                PgLogLevel::ERROR,
                PgSqlErrorCode::ERRCODE_INTERNAL_ERROR,
                &format!("{}", err_msg)
            );
            ""
        }
    }
}

#[cfg(any(test, feature = "pg_test"))]
#[pg_schema]
mod tests {
    use pgrx::prelude::*;

    #[pg_test]
    fn test_hello_kilobase() {
        assert_eq!("Hello, kilobase, this is an example query that is being called from rust!", crate::hello_kilobase());
    }

}

/// This module is required by `cargo pgrx test` invocations.
/// It must be visible at the root of your extension crate.
#[cfg(test)]
pub mod pg_test {
    pub fn setup(_options: Vec<&str>) {
        // perform one-off initialization when the pg_test framework starts
    }

    #[must_use]
    pub fn postgresql_conf_options() -> Vec<&'static str> {
        // return any postgresql.conf settings that are required for your tests
        vec![]
    }
}
