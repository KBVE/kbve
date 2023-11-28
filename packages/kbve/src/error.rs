use crate::wh::{ ERR_MSG, WizardResponse, STATIC_RESPONSES };

use axum::{ response::Json };

//	The dynamic string function is only for test casing, swapping of the dynamic variable will be done client-side.
pub fn datawarehouse_dynamic_string_get_error_message(
	key: &str,
	args: &[&str]
) -> String {
	match ERR_MSG.get(key) {
		Some(template) => {
			let mut formatted_message = template.to_string();
			for arg in args {
				formatted_message = formatted_message.replacen("{}", arg, 1);
			}
			formatted_message
		}
		None => "Unknown error".to_string(),
	}
}

pub fn error_casting(key: &str) -> Json<WizardResponse> {
	match STATIC_RESPONSES.get(key) {
		Some(response) => response.clone(),
        None => Json(WizardResponse {
            data: "error".to_string(),
            message: "Unknown error".to_string(),
        })
	}
}
