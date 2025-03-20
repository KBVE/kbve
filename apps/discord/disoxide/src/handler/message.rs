use axum::{ response::IntoResponse, Json };

pub async fn get_user() -> impl IntoResponse {
  let user = crate::proto::disoxide::UserData {
    id: 1,
    username: "kbve".to_string(),
    active: true,
  };
  Json(user)
}

pub async fn get_message() -> impl IntoResponse {
  let message = crate::proto::disoxide::ChatMessage {
    id: 1,
    sender: "kbve".to_string(),
    content: "Hello from Axum!".to_string(),
    timestamp: 1700000000,
  };
  Json(message)
}
