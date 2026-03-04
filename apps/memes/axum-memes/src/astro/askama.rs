use askama::Template;
use axum::{
    http::StatusCode,
    response::{Html, IntoResponse, Response},
};

#[derive(Template)]
#[template(path = "askama/index.html")]
pub struct AstroTemplate<'a> {
    pub content: &'a str,
    pub path: &'a str,
    pub title: &'a str,
    pub description: &'a str,
    pub canonical_url: &'a str,
    pub og_image: &'a str,
}

impl<'a> AstroTemplate<'a> {
    pub fn new(
        content: &'a str,
        path: &'a str,
        title: &'a str,
        description: &'a str,
        canonical_url: &'a str,
        og_image: &'a str,
    ) -> Self {
        Self {
            content,
            path,
            title,
            description,
            canonical_url,
            og_image,
        }
    }
}

pub struct TemplateResponse<T: Template>(pub T);

impl<T: Template> IntoResponse for TemplateResponse<T> {
    fn into_response(self) -> Response {
        match self.0.render() {
            Ok(html) => Html(html).into_response(),
            Err(err) => {
                tracing::error!(error = %err, "template rendering failed");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "Failed to render template",
                )
                    .into_response()
            }
        }
    }
}

#[derive(Template)]
#[template(path = "askama/meme.html")]
pub struct MemeTemplate {
    pub meme_id: String,
    pub title: String,
    pub description: String,
    pub canonical_url: String,
    pub og_image: String,
    pub og_width: i32,
    pub og_height: i32,
    pub asset_url: String,
    pub format_label: String,
    pub width: i32,
    pub height: i32,
    pub author_name: String,
    pub tags: Vec<String>,
}

#[derive(Template)]
#[template(path = "askama/meme_not_found.html")]
pub struct MemeNotFoundTemplate;

pub async fn fallback_handler() -> Response {
    let template = AstroTemplate::new(
        "<h1>Page Not Found</h1><p>The requested page does not exist.</p>",
        "/404",
        "404 - Not Found",
        "Page not found",
        "https://meme.sh/404",
        "",
    );
    (StatusCode::NOT_FOUND, TemplateResponse(template)).into_response()
}
