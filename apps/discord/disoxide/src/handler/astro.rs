use askama::Template;
use axum::{http::StatusCode, response::{Html, IntoResponse}};
use crate::entity::state::SharedState;
use axum::extract::Path;

#[derive(Template)]
#[template(path = "../dist/askama/index.html")]
pub struct AstroTemplate<'a> {
    content: &'a str,
    path: &'a str,
}

impl<'a> AstroTemplate<'a> {
    pub fn new(content: &'a str, path: &'a str) -> Self {
        Self { content, path }
    }
}

fn render_template<T: Template>(template: T) -> Result<Html<String>, StatusCode> {
    template
        .render()
        .map(Html)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

async fn get_content(state: &SharedState, path: &str) -> String {
    format!("Content for path: {}", path)
}

pub async fn home_handler(state: axum::extract::State<SharedState>) -> Result<Html<String>, StatusCode> {
    let template = AstroTemplate::new("Hello from Astro + Rust!", "/askama");
    template
        .render()
        .map(Html)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

pub async fn catch_all_handler(
    state: axum::extract::State<SharedState>,
    Path(path): Path<String>,
) -> impl IntoResponse {
    let template_path = if path.is_empty() { "index" } else { &path };
    let content = get_content(&state, template_path).await;

    match template_path {
        _ => {
            #[derive(Template)]
            #[template(path = "../dist/askama/index.html")]
            struct DynamicTemplate<'a> { content: &'a str, path: &'a str }
            let template = DynamicTemplate { content: &content, path: template_path };
            render_template(template)
        }
    }
}

pub fn astro_router() -> axum::Router<SharedState> {
    axum::Router::new()
        .route("/askama", axum::routing::get(home_handler))
        .route("/{*wildcard}", axum::routing::get(catch_all_handler))
}

