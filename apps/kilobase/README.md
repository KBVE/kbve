---

---

## KiloBase

This is a custom extension to be built and added into a supabase-based docker image.

There is no major purpose for this application other than testing the ability to create a custom postgres.

Libraries that will be required for this setup:

```shell

sudo apt-get install postgresql-server-dev-15 libclang-dev build-essential libreadline-dev zlib1g-dev flex bison libxml2-dev libxslt-dev libssl-dev libxml2-utils xsltproc ccache pkg-config

```

## Examples

Here are the pgrx extractions from the jedi library integrations.

```rust

#[pg_extern(immutable, parallel_safe)]
fn pgrx_extract_email(email: &str) -> &str {
  match extract_email_from_regex_zero_copy(email) {
    Ok(result) => result,
    Err(err_msg) => {
      ereport!(PgLogLevel::ERROR, PgSqlErrorCode::ERRCODE_INTERNAL_ERROR, &format!("{}", err_msg));
      ""
    }
  }
}

#[pg_extern(immutable, parallel_safe)]
fn pgrx_extract_github_username(url: &str) -> &str {
  match extract_github_username_from_regex_zero_copy(url) {
    Ok(result) => result,
    Err(err_msg) => {
      ereport!(PgLogLevel::ERROR, PgSqlErrorCode::ERRCODE_INTERNAL_ERROR, &format!("{}", err_msg));
      ""
    }
  }
}

```

Then here we go, some example of the test functions.

```rust

//  TODO: Unit Tests

#[cfg(any(test, feature = "pg_test"))]
#[pg_schema]
mod tests {
  use pgrx::prelude::*;

  #[pg_test]
  fn test_hello_kilobase() {
    assert_eq!(
      "Hello, kilobase, this is an example query that is being called from rust!",
      crate::hello_kilobase()
    );
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

```