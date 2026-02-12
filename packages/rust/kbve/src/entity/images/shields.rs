use axum::{
    extract::Query,
    response::{Response, IntoResponse},
    http::{StatusCode, header},
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


pub async fn svg_handler(Query(params): Query<TextParams>) -> impl IntoResponse {

    let sanitized_text = clean(&params.text);

    let default_bg_l = "#800080";
    let default_bg_m = "#FFA500";
    let default_bg_r = "#FFC0CB";

    let sanitized_bg_l = params.bg_l.as_ref().map_or(default_bg_l.to_string(), |color| clean(color));
    let sanitized_bg_m = params.bg_m.as_ref().map_or(default_bg_m.to_string(), |color| clean(color));
    let sanitized_bg_r = params.bg_r.as_ref().map_or(default_bg_r.to_string(), |color| clean(color));



    let svg_data = format!(
        "<svg width=\"468\" height=\"60\" xmlns=\"http://www.w3.org/2000/svg\">
        <defs>
            <linearGradient id=\"grad1\" x1=\"0%\" y1=\"0%\" x2=\"100%\" y2=\"0%\">
                <stop offset=\"0%\" style=\"stop-color:{};stop-opacity:1\" />
                <stop offset=\"50%\" style=\"stop-color:{};stop-opacity:1\" />
                <stop offset=\"100%\" style=\"stop-color:{};stop-opacity:1\" />
            </linearGradient>
        </defs>
        <rect width=\"100%\" height=\"100%\" fill=\"url(#grad1)\" />
        <rect x=\"1\" y=\"1\" width=\"466\" height=\"58\" fill=\"none\" stroke=\"black\" stroke-width=\"2\"/>
        <text x=\"10\" y=\"30\" font-family=\"Verdana\" font-size=\"20\" fill=\"blue\">{}</text>
        <!-- Add a grey box in the bottom left corner -->
        <rect x=\"0\" y=\"45\" width=\"80\" height=\"15\" fill=\"black\" />
        <text x=\"10\" y=\"57\" font-family=\"Verdana\" font-size=\"12\" fill=\"white\">Open Ads</text>
     </svg>", 
         sanitized_bg_l, sanitized_bg_m, sanitized_bg_r, sanitized_text
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