//!         [SPELLBOOK]
//?         Collection of all the v2 Macros

#[macro_export]
macro_rules! spellbook_create_jwt {
	($ulid:expr, $email:expr, $username:expr, $secret:expr, $hours:expr) => {
		{

		use jsonwebtoken::{encode, EncodingKey, Header};

        let now = chrono::Utc::now();
        let exp = now + chrono::Duration::minutes($hours * 60);

        let jwt_token = encode(
            &Header::default(),
            &crate::runes::TokenRune {
                ulid: $ulid.to_string(),
                email: $email.to_string(),
                username: $username.to_string(),
                iat: now.timestamp() as usize,
                exp: exp.timestamp() as usize,
            },
            &EncodingKey::from_secret($secret.as_bytes()),
        ).unwrap(); 

		jwt_token
		}
	};
}

#[macro_export]
macro_rules! spellbook_create_cookie {
	($name:expr, $token:expr, $duration:expr) => {
		axum_extra::extract::cookie::Cookie::build($name, $token)
			.path("/")
			.max_age(time::Duration::hours($duration))
			.same_site(axum_extra::extract::cookie::SameSite::Lax)
			.http_only(true)
			.finish()
	};
}

#[macro_export]
macro_rules! spellbook_get_global {
	($key:expr, $err:expr) => {
        match crate::runes::GLOBAL.get() {
            Some(global_map) => match global_map.get($key) {
                Some(value) => Ok(value.value().clone()), // Assuming you want to clone the value
                None => Err($err),
            },
            None => Err("invalid_global_map"),
        }
	};
}

// The `spellbook_error` macro is designed for use in Axum-based web applications.
// It simplifies the creation of HTTP error responses. When invoked, it creates
// an Axum response with a specified HTTP status code and a JSON body containing 
// an error message. Additionally, it sets a custom header "x-kbve-shield" with 
// the error message as its value. This macro is useful for consistently handling 
// error responses throughout your web application.

#[macro_export]
 macro_rules! spellbook_error {
     // The macro takes two parameters: `$status` for the HTTP status code, and `$error` for the error message.
     ($status:expr, $error:expr) => {{
         // Creates a JSON body with the provided error message.
         let response_body = axum::Json(serde_json::json!({ "error": $error }));

         // Constructs an Axum response using the specified status code and the JSON body.
         let mut response: axum::response::Response = ($status, response_body).into_response();

         // Inserts a custom header "x-kbve-shield" into the response. The value of this header is the error message.
         // `expect` is used here to handle any potential error while converting the error message into a header value.
         response.headers_mut().insert(
             axum::http::header::HeaderName::from_static("x-kbve-shield"),
             axum::http::HeaderValue::from_str($error).expect("Invalid header value"),
         );

         // Returns the modified response.
         response
     }};
}


// #[macro_export]
// macro_rules! spellbook_get_pool {
// 	($pool:expr) => {
//         match $pool.get() {
//             Ok(conn) => conn,
//             Err(_) => return Err("pool_fail"),
//         }
// 	};
// }

/** 
	This macro is a utility for working with database connection pools.
	It tries to retrieve a connection from the provided pool.
	If successful, the connection is returned for further use.
	If there's an error in obtaining a connection, it handles the error by immediately returning an HTTP response with an appropriate error message and status code. This macro ensures a uniform way of handling database pool errors across different parts of an Axum application.
**/

// The `spellbook_pool` macro is defined using Rust's macro_rules! system.
// This macro is designed to simplify the process of obtaining a database connection from a connection pool.
#[macro_export]
macro_rules! spellbook_pool {
	// The macro takes a single argument, `$pool`, which represents the connection pool.
	($pool:expr) => {
        // Attempt to get a database connection from the pool.
        match $pool.get() {
            // If successful, the obtained connection (`conn`) is returned for use.
            Ok(conn) => conn,

            // If there's an error (e.g., the pool is exhausted or connection failed),
            // the macro returns an HTTP response indicating an internal server error.
            // This return statement is designed to exit from the calling function.
            Err(_) => return (
                // Sets the HTTP status code to UNAUTHORIZED (401).
                // Although the error is from the database, the response indicates a more general server error.
                axum::http::StatusCode::UNAUTHORIZED,

                // The body of the response is a JSON object with an error message.
                axum::Json(serde_json::json!({"error": "db_error"})),

                // Converts the tuple into an Axum response type.
            ).into_response(),
        }
	};
}

#[macro_export]
macro_rules! spellbook_pool_conn {
	($pool:expr) => {
        match $pool.get() {
            Ok(conn) => conn,
            Err(_) => return Err("Failed to get a connection from the pool!"),
        }
	};
}


#[macro_export]
macro_rules! spellbook_complete {
	($spell:expr) => {
        return (axum::http::StatusCode::OK, axum::Json(serde_json::json!({"data": $spell}))).into_response()
	};
}

#[macro_export]
macro_rules! spellbook_username {
	($username:expr) => {
        match crate::utility::sanitize_username($username) {
            Ok(username) => username,
            Err(e) => return (axum::http::StatusCode::UNAUTHORIZED, axum::Json(serde_json::json!({"error": format!("{}",e)}))).into_response()
        }
	};
}

#[macro_export]
macro_rules! spellbook_ulid {
	($ulid:expr) => {
        match crate::utility::sanitizie_ulid($ulid) {
            Ok(ulid) => ulid,
            Err(e) => return (axum::http::StatusCode::UNAUTHORIZED, axum::Json(serde_json::json!({"error": format!("{}",e)}))).into_response()
        }
	};
}

#[macro_export]
macro_rules! spellbook_email {
	($email:expr) => {
        match crate::utility::sanitize_email($email) {
            Ok(email) => email,
            Err(e) => return (axum::http::StatusCode::UNAUTHORIZED, axum::Json(serde_json::json!({"error": format!("{}",e)}))).into_response()
        }
	};
}

#[macro_export]
macro_rules! spellbook_generate_ulid_bytes {
    () => {
        {
            // Call the generate_ulid_as_bytes function
            crate::utility::generate_ulid_as_bytes()
        }
    };
}

#[macro_export]
macro_rules! spellbook_generate_ulid_string {
    () => {
        {
            // Call the generate_ulid_as_string function
            crate::utility::generate_ulid_as_string()
        }
    };
}


/**

In the spellbook_sanitize_fields macro:
	- It takes any struct ($struct) and a list of fields within that struct.
	- For each field, if it is an Option<String> and currently has a value (Some), that value is sanitized using the crate::utility::sanitize_string_limit function.
	- The macro is designed to be reusable for any struct with fields that need sanitizing and can handle multiple fields at once.
	- This macro simplifies the process of sanitizing multiple fields in a struct, ensuring that each specified field is sanitized if it contains a value. 
	It reduces code repetition and improves readability by abstracting the common pattern of sanitizing multiple optional fields.
**/

// This is a macro definition using Rust's macro_rules! system.
// It is designed to generalize the process of sanitizing fields in a struct.
#[macro_export]
macro_rules! spellbook_sanitize_fields {
	// The macro takes two types of input:
	// 1. $struct:expr, which represents the struct instance whose fields need sanitizing.
	// 2. $($field:ident),+, which is a variadic list of field identifiers that need to be sanitized.
	($struct:expr, $($field:ident),+) => {
        $(
            // This loop iterates over each field specified in the macro invocation.
            if let Some(ref mut value) = $struct.$field {
                // If the field ($field) is Some (i.e., it's not None), then the field's value is sanitized.
                // `*value` dereferences the Option to get a mutable reference to the contained String.
                // `crate::utility::sanitize_string_limit` is called to sanitize the value.
                // This could include operations like trimming, removing special characters, etc.
                *value = crate::utility::sanitize_string_limit(value);
            }
        )+
	};
}


///     !   [Hazardous]
///     ?	Macro -> Hazardous_Booleans

#[macro_export]
macro_rules! spellbook_hazardous_boolean_exist_via_ulid {
	(
		$func_name:ident,
		$table:ident,
		$column:ident,
		$param:ident,
		$param_type:ty
	) => {
        pub async fn $func_name(
            $param: $param_type,
            pool: Arc<Pool>
        ) -> Result<bool, &'static str> {
            let mut conn = spellbook_pool_conn!(pool);

            match $table::table
                .filter($table::$column.eq($param))
                .select($table::ulid)
                .first::<Vec<u8>>(&mut conn)
            {
                Ok(_) => Ok(true),
                Err(diesel::NotFound) => Ok(false),
                Err(_) => Err("db_error"),
            }
        }
	};
}

///     ?       Macro -> Hazardous Task Fetch

#[macro_export]
macro_rules! spellbook_hazardous_task_fetch {
	(
		$func_name:ident,
		$table:ident,
		$column:ident,
		$param:ident,
		$param_type:ty,
		$return_type:ty
	) => {
		pub async fn $func_name(
			$param: $param_type,
			pool: Arc<Pool>
		) -> Result<$return_type, &'static str> {
			let mut conn = spellbook_pool_conn!(pool);

			match $table::table
				.filter($table::$param.eq($param))
				.select($table::$column)
				.first::<$return_type>(&mut conn)
				{
					Ok(data) => Ok(data),
					Err(diesel::NotFound) => Err("db_error"),
					Err(_) => Err("db_error"),
				}

		}
	};
}