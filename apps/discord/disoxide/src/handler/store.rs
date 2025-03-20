use std::{ borrow::Cow, sync::Arc };

use axum::{ body::Bytes, extract::{ Path, State }, http::StatusCode, response::IntoResponse, Json };
use tokio::time::Instant;
use serde::Serialize;

use crate::{ entity::state::SharedState, proto::store::StoreValue, handler::error::AppError };

#[derive(Serialize)]
struct MessageResponse {
  message: &'static str,
}

pub async fn set_key(
  Path(key): Path<String>,
  State(state): State<SharedState>,
  Json(payload): Json<StoreValue>
) -> Result<impl IntoResponse, AppError> {
  let state_clone = Arc::clone(&state.store);
  let key_clone = key.clone();
  let value_bytes = Bytes::from(payload.value);
  let expires_at = Instant::now() + crate::entity::helper::TTL_DURATION;

  tokio::spawn(async move {
    let db = state_clone.write().await;
    let store = db.store.pin_owned();
    store.insert(key_clone, (value_bytes, expires_at));
  });

  Ok((StatusCode::ACCEPTED, Json(MessageResponse { message: "Key storage in progress" })))
}

pub async fn get_key(
  Path(key): Path<String>,
  State(state): State<SharedState>
) -> Result<Json<crate::entity::helper::CowKeyValueResponse<'static>>, AppError> {
  let db = state.store.read().await;
  let store = db.store.pin();

  match store.get(&key) {
    Some((value, _)) => {
      let cow_value: Cow<'static, str> = match std::str::from_utf8(value) {
        Ok(valid_str) => Cow::Owned(valid_str.to_owned()),
        Err(_) => Cow::Owned(String::from_utf8_lossy(value).into_owned()),
      };

      Ok(Json(crate::entity::helper::CowKeyValueResponse { value: cow_value }))
    }
    None => {
      tracing::error!("Key '{}' not found", key);
      Err(AppError::NotFound)
    }
  }
}

pub async fn list_keys(State(state): State<SharedState>) -> Result<Json<Vec<String>>, AppError> {
    match state.store.read().await.store.pin().keys().cloned().collect::<Vec<String>>() {
        keys if !keys.is_empty() => Ok(Json(keys)),
        _ => {
            tracing::error!("Failed to retrieve keys or store is empty.");
            Err(AppError::NotFound)
        }
    }
}

pub async fn clear_store(State(mut state): State<SharedState>) -> Result<impl IntoResponse, AppError> {
    let mut store = state.store.write().await; 
    store.replace_store();

    Ok((StatusCode::OK, Json(MessageResponse { message: "Key storage in progress" })))
}
