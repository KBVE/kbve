use askama::Template;
use axum::{
    http::StatusCode,
    response::{Html, IntoResponse, Response},
};

pub struct TemplateResponse<T: Template>(pub T);

impl<T: Template> IntoResponse for TemplateResponse<T> {
    fn into_response(self) -> Response {
        match self.0.render() {
            Ok(html) => Html(html).into_response(),
            Err(err) => {
                tracing::error!("Template rendering error: {}", err);
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "Template rendering error",
                )
                    .into_response()
            }
        }
    }
}
