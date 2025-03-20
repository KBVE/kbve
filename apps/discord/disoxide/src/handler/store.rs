use std::{borrow::Cow, sync::Arc};

use axum::{body::Bytes, extract::{Path, State}, http::StatusCode, response::IntoResponse, Json};
use tokio::time::Instant;

use crate::{entity::state::SharedState, proto::store::StoreValue};


pub async fn set_key(
    Path(key): Path<String>,
    State(state): State<SharedState>,
    Json(payload): Json<StoreValue>
  ) -> impl IntoResponse {
    let state_clone = Arc::clone(&state.store);
    let key_clone = key.clone();
    let value_bytes = Bytes::from(payload.value);
    let expires_at = Instant::now() + crate::entity::helper::TTL_DURATION;
  
    tokio::spawn(async move {
      let db = state_clone.write().await;
      let store = db.store.pin_owned();
      store.insert(key_clone, (value_bytes, expires_at));
    });
  
    (StatusCode::ACCEPTED, "Key storage in progress")
  }
  
  pub async fn get_key(
    Path(key): Path<String>,
    State(state): State<SharedState>
  ) -> impl IntoResponse + Send {
    let db = state.store.read().await;
    let store = db.store.pin();
  
    match store.get(&key) {
      Some((value, _)) => {
        let cow_value = std::str
          ::from_utf8(value)
          .map(Cow::Borrowed)
          .unwrap_or_else(|_| Cow::Owned(String::from_utf8_lossy(value).into_owned()));
  
        Json(crate::entity::helper::CowKeyValueResponse { value: cow_value }).into_response()
      }
      None => StatusCode::NOT_FOUND.into_response(),
    }
  }
  
  pub async fn list_keys(State(state): State<SharedState>) -> Json<Vec<String>> {
    let db = state.store.read().await; 
    let store = db.store.pin(); 
    Json(store.keys().cloned().collect()) 
  }
  
  pub async fn clear_store(State(state): State<SharedState>) -> impl IntoResponse {
    let db = state.store.write().await; 
    let store = db.store.pin(); 
    store.clear();
  
    (StatusCode::OK, "Store cleared")
  }