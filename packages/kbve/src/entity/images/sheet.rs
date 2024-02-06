use axum::{
	extract::Query,
	response::{ Response, IntoResponse },
	http::{ StatusCode, header },
	routing::get,
	Router,
	body::Body,
	async_trait,
};

use serde::Deserialize;
use std::collections::HashMap;
use ammonia::clean;

#[derive(Deserialize)]
pub struct TextParams {
	pub text: String,
	pub bg_l: Option<String>,
	pub bg_m: Option<String>,
	pub bg_r: Option<String>,
}

pub async fn sheet_controller(Query(
	params,
): Query<TextParams>) -> impl IntoResponse {
	let sanitized_text = clean(&params.text);

	//    let default_bg_l = "#800080";
	//    let default_bg_m = "#FFA500";
	//    let default_bg_r = "#FFC0CB";

	let default_bg_l = "#000000";
	let default_bg_m = "#000000";
	let default_bg_r = "#000000";

	let _sanitized_bg_l = params.bg_l
		.as_ref()
		.map_or(default_bg_l.to_string(), |color| clean(color));
	let _sanitized_bg_m = params.bg_m
		.as_ref()
		.map_or(default_bg_m.to_string(), |color| clean(color));
	let _sanitized_bg_r = params.bg_r
		.as_ref()
		.map_or(default_bg_r.to_string(), |color| clean(color));

	let svg_data = format!(
		"<svg width=\"1080\" height=\"1080\" xmlns=\"http://www.w3.org/2000/svg\">
        <defs>
            <linearGradient id=\"grad1\" x1=\"0%\" y1=\"0%\" x2=\"100%\" y2=\"0%\">
                <stop offset=\"0%\" style=\"stop-color:{};stop-opacity:1\" />
                <stop offset=\"50%\" style=\"stop-color:{};stop-opacity:1\" />
                <stop offset=\"100%\" style=\"stop-color:{};stop-opacity:1\" />
            </linearGradient>
        </defs>
        <rect width=\"100%\" height=\"100%\" fill=\"url(#grad1)\" />
        <rect x=\"1\" y=\"1\" width=\"1078\" height=\"1078\" fill=\"none\" stroke=\"pink\" stroke-width=\"5\"/>
        <text x=\"10\" y=\"30\" font-family=\"Verdana\" font-size=\"20\" fill=\"white\">{}</text>
        <image href=\"https://rawcdn.githack.com/KBVE/kbve/fd71bc73e739d29847ac9e99690445611d05c705/apps/kbve.com/public/assets/img/sheet/frame.png\" x=\"0\" y=\"0\" width=\"1080\" height=\"1080\"/>
        <!-- Add a grey box in the bottom left corner -->
        <rect x=\"0\" y=\"1063\" width=\"100\" height=\"15\" fill=\"black\" />
        <!-- Missle Hits -->
        <text x=\"340\" y=\"277\" font-family=\"Verdana\" font-size=\"12\" fill=\"white\">X Line 1 yjq</text>
        <text x=\"340\" y=\"302\" font-family=\"Verdana\" font-size=\"12\" fill=\"white\">X Line 2 yjq</text>
        <text x=\"340\" y=\"330\" font-family=\"Verdana\" font-size=\"12\" fill=\"white\">X Line 3 yjq</text>
        <text x=\"340\" y=\"355\" font-family=\"Verdana\" font-size=\"12\" fill=\"white\">X Line 4 yjq</text>
        <text x=\"340\" y=\"382\" font-family=\"Verdana\" font-size=\"12\" fill=\"white\">X Line 5 yjq</text>
        <text x=\"340\" y=\"408\" font-family=\"Verdana\" font-size=\"12\" fill=\"white\">X Line 6 yjq</text>
        <text x=\"340\" y=\"430\" font-family=\"Verdana\" font-size=\"12\" fill=\"white\">X Line 7 yjq</text>
        <text x=\"340\" y=\"459\" font-family=\"Verdana\" font-size=\"12\" fill=\"white\">X Line 8 yjq</text>
        <text x=\"340\" y=\"482\" font-family=\"Verdana\" font-size=\"12\" fill=\"white\">X Line 9 yjq</text>
        <!-- War with IWalk : Weapons of Mass Construction -->
        
        <text x=\"340\" y=\"505\" font-family=\"Verdana\" font-size=\"8\" fill=\"white\">
            <tspan x=\"340\">X Line 10 - Mass </tspan>
            <tspan x=\"340\" dy=\"1.5em\">X Line 10 - Slot 2 - Image</tspan>
            <tspan x=\"340\" dy=\"1.5em\">X Line 10 - Slot 3 - of</tspan>
            <tspan x=\"340\" dy=\"1.5em\">X Line 10 - Slot 4 - Constr</tspan>
            <tspan x=\"340\" dy=\"1.5em\">X Line 10 - Slot 5 - Uction </tspan>
        </text>
           
        <text x=\"340\" y=\"580\" font-family=\"Verdana\" font-size=\"9\" fill=\"white\">
            <tspan x=\"340\">X Line 11 - Slot 1 - Image</tspan>
            <tspan x=\"340\" dy=\"1.5em\">X Line 11 - Slot 2 M</tspan>
            <tspan x=\"340\" dy=\"1.5em\">X Line 11 - Slot 3 E</tspan>
            <tspan x=\"340\" dy=\"1.5em\">X Line 11 - Slot 4 M</tspan>
            <tspan x=\"340\" dy=\"1.5em\">X Line 11 - Slot 5 E</tspan>
        </text>
        
        <!-- Nam because gud musik, minus the ptsd, but the lsd -->
        <text x=\"340\" y=\"658\" font-family=\"Verdana\" font-size=\"12\" fill=\"white\">X Line 12 yjq</text>
        <text x=\"340\" y=\"683\" font-family=\"Verdana\" font-size=\"12\" fill=\"white\">X Line 13 yjq</text>
        <text x=\"340\" y=\"708\" font-family=\"Verdana\" font-size=\"12\" fill=\"white\">X Line 14 yjq</text>
        <text x=\"10\" y=\"1075\" font-family=\"Verdana\" font-size=\"12\" fill=\"white\">Open Ads</text>
     </svg>
     ",
		_sanitized_bg_l,
		_sanitized_bg_m,
		_sanitized_bg_r,
		sanitized_text
	);

	let svg_body = Body::from(svg_data);

	// Create a response with the SVG data and correct headers
	let response = Response::builder()
		.status(StatusCode::OK)
		.header(header::CONTENT_TYPE, "image/svg+xml")
		.body(svg_body)
		.unwrap();

	response
}
