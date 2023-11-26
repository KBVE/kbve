use crate::wh::{ ERR_MSG, WizardResponse };

use axum::{ response::Json };


pub fn datawarehouse_hashmap_get_error_message(
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

pub fn print_and_get_datawarehouse_error_message(
	key: &str,
	args: &[&str]
) -> String {
	let error_message = datawarehouse_hashmap_get_error_message(key, args);
	println!("{}", error_message);
	error_message
}

pub fn cast_error_spell(key: &str, args: &[&str]) -> WizardResponse {
    let message = datawarehouse_hashmap_get_error_message(key, args);
    WizardResponse {
        data: "error".to_string(),
        message,
    }
}

pub fn cast_error_spell_json(key: &str, args: &[&str]) -> Json<WizardResponse> {
    let response = cast_error_spell(key, args);
    Json(response)
}

pub fn shadowless_error(
	key: &str,
	args: &[&str]
) -> String {
    datawarehouse_hashmap_get_error_message(key, args)
}