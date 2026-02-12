use axum::{
	extract::{ Query, Path },
	response::{ Response, IntoResponse },
	http::{ StatusCode, header, HeaderMap },
	routing::get,
	Router,
	body::Body,
	async_trait,
};

use axum::Extension;

use std::sync::Arc;

use serde::Deserialize;

use serde_json::json;

use std::collections::HashMap;

use ammonia::clean;

use crate::db::{ Pool };

use crate::response::{ GenericResponse, HeaderResponse };

use crate::entity::{ hazardous_blocking_character_viewer_from_name };

use crate::models::{ Character };

use jedi::builder::ValidatorBuilder;

#[derive(Deserialize)]
pub struct TextParams {
	pub text: String,
}

#[derive(Deserialize)]
pub struct PathParams {
    pub character: String,
}


pub async fn sheet_controller(
	Extension(pool): Extension<Arc<Pool>>,
    Path(params): Path<PathParams>
) -> impl IntoResponse {
	let validation_result = ValidatorBuilder::<String, String>
		::new()
		.clean_or_fail()
		.username()
		.validate(params.character.clone());

	let sanitized_text = match validation_result {
		Ok(sanitized_text) => sanitized_text,
		Err(validation_errors) => {
			let error_body =
				json!({
                "error": "Validation failed",
                "details": validation_errors
            }).to_string();

			let response = Response::builder()
				.status(StatusCode::BAD_REQUEST)
				.header(header::CONTENT_TYPE, "application/json")
				.body(Body::from(error_body))
				.unwrap();
			return response.into_response();
		}
	};

	let character_data = match
		hazardous_blocking_character_viewer_from_name(
			sanitized_text.clone(),
			pool
		).await
	{
		Ok(character) => character,
		Err(error_msg) => {
			let error_body =
				json!({
                "error": "Character was not found",
                "details": error_msg
            }).to_string();

			let response = Response::builder()
				.status(StatusCode::BAD_REQUEST)
				.header(header::CONTENT_TYPE, "application/json")
				.body(Body::from(error_body))
				.unwrap();
			return response.into_response();
		}
	};

	let _sanitized_bg_l = "#000000";
	let _sanitized_bg_m = "#000000";
	let _sanitized_bg_r = "#000000";

	let svg_template =
		r#"<svg width="1080" height="1080" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" style="stop-color:{bg_color_1};stop-opacity:1" />
                <stop offset="50%" style="stop-color:{bg_color_2};stop-opacity:1" />
                <stop offset="100%" style="stop-color:{bg_color_3};stop-opacity:1" />
            </linearGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#grad1)" />
        <rect x="1" y="1" width="1078" height="1078" fill="none" stroke="black" stroke-width="2"/>
        <text x="10" y="30" font-family="Verdana" font-size="20" fill="white">{character_name}</text>
        <image href="https://rawcdn.githack.com/KBVE/kbve/fd71bc73e739d29847ac9e99690445611d05c705/apps/kbve.com/public/assets/img/sheet/frame.png" x="0" y="0" width="1080" height="1080"/>
        <!-- Add a grey box in the bottom left corner -->
        <rect x="0" y="1063" width="100" height="15" fill="black" />
        <!-- Missle Hits -->
        <text x="340" y="277" font-family="Verdana" font-size="12" fill="white">Name: {character_name}</text>
        <text x="340" y="302" font-family="Verdana" font-size="12" fill="white">HP: {character_hp}</text>
        <text x="340" y="330" font-family="Verdana" font-size="12" fill="white">MP: {character_mp}</text>
        <text x="340" y="355" font-family="Verdana" font-size="12" fill="white">EP: {character_ep}</text>
        <text x="340" y="382" font-family="Verdana" font-size="12" fill="white">Current Health: {character_health}</text>
        <text x="340" y="408" font-family="Verdana" font-size="12" fill="white">Current Mana: {character_mana}</text>
        <text x="340" y="430" font-family="Verdana" font-size="12" fill="white">Current Energy: {character_energy}</text>
        <text x="340" y="459" font-family="Verdana" font-size="12" fill="white">X Line 8 yjq</text>
        <text x="340" y="482" font-family="Verdana" font-size="12" fill="white">X Line 9 yjq</text>
        <!-- War with IWalk : Weapons of Mass Construction -->
        
        <text x="340" y="505" font-family="Verdana" font-size="8" fill="white">
            <tspan x="340">Character Core Stats</tspan>
            <tspan x="340" dy="1.5em">Armor : {character_armour}</tspan>
            <tspan x="340" dy="1.5em">Agility : {character_agility}</tspan>
            <tspan x="340" dy="1.5em">Strength : {character_strength}</tspan>
            <tspan x="340" dy="1.5em">Intelligence : {character_intelligence}</tspan>
        </text>
           
        <text x="340" y="580" font-family="Verdana" font-size="9" fill="white">
            <tspan x="340">Merit</tspan>
            <tspan x="340" dy="1.5em">Experience: {character_experience}</tspan>
            <tspan x="340" dy="1.5em">Reputation: {character_reputation}</tspan>
            <tspan x="340" dy="1.5em">Faith: {character_faith}</tspan>
            <tspan x="340" dy="1.5em">X Line 11 - Slot 5 E</tspan>
        </text>
        
        <!-- Nam because gud musik, minus the ptsd, but the lsd -->
        <text x="340" y="658" font-family="Verdana" font-size="12" fill="white">{character_description}</text>
        <text x="340" y="683" font-family="Verdana" font-size="12" fill="white">X Line 13 yjq</text>
        <text x="340" y="708" font-family="Verdana" font-size="12" fill="white">X Line 14 yjq</text>
        <text x="10" y="1075" font-family="Verdana" font-size="12" fill="white">Open Ads</text>
     </svg>
     "#;

	let svg_data = svg_template
		.replace("{bg_color_1}", &_sanitized_bg_l)
		.replace("{bg_color_2}", &_sanitized_bg_m)
		.replace("{bg_color_3}", &_sanitized_bg_r)
		.replace("{character_name}", &character_data.name)
		.replace("{character_hp}", &character_data.hp.to_string())
		.replace("{character_mp}", &character_data.mp.to_string())
		.replace("{character_ep}", &character_data.ep.to_string())
		.replace("{character_health}", &character_data.health.to_string())
		.replace("{character_mana}", &character_data.mana.to_string())
		.replace("{character_energy}", &character_data.energy.to_string())
		.replace("{character_armour}", &character_data.armour.to_string())
		.replace("{character_agility}", &character_data.agility.to_string())
		.replace("{character_strength}", &character_data.strength.to_string())
		.replace(
			"{character_intelligence}",
			&character_data.intelligence.to_string()
		)
		.replace(
			"{character_reputation}",
			&character_data.reputation.to_string()
		)
		.replace(
			"{character_experience}",
			&character_data.experience.to_string()
		)
		.replace("{character_faith}", &character_data.faith.to_string())
        .replace("{character_description}", &character_data.description)
        
        ;

	let svg_body = Body::from(svg_data);

	let response = Response::builder()
		.status(StatusCode::OK)
		.header(header::CONTENT_TYPE, "image/svg+xml")
		.body(svg_body)
		.unwrap();

	response.into_response()
}
