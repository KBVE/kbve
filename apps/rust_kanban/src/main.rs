use axum::{
  extract::ws::{ WebSocket, WebSocketUpgrade, Message },
  routing::{ get, post },
  response::IntoResponse,
  Router,
};
use axum::http::StatusCode;

use axum::{ extract::State, Json };
use axum::http::header;
use axum::http::HeaderValue;

use futures::{ sink::SinkExt, stream::StreamExt };
use serde::{ Deserialize, Serialize };
use serde_json::json;
use std::{ sync::Arc, collections::HashMap, net::SocketAddr };
use tokio::sync::broadcast;
use tower_http::{ services::ServeDir, cors::CorsLayer, trace::TraceLayer };
use tracing_subscriber::{ layer::SubscriberExt, util::SubscriberInitExt };
use aws_sdk_dynamodb::{ Client, types::AttributeValue };
use serde_dynamo::{ to_item, from_item };
use tokio::net::{ TcpListener };

#[derive(Clone)]
struct AppState {
  dynamo_client: Arc<Client>,
  tx: broadcast::Sender<String>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct KanbanBoard {
  pub todo: Vec<KanbanItem>,
  pub in_progress: Vec<KanbanItem>,
  pub done: Vec<KanbanItem>,
  pub unassigned: Vec<KanbanItem>, // New field for unassigned items
  pub metadata: Option<KanbanMetadata>, // Optional metadata for the board
  pub actions: Vec<KanbanAction>, // List of actions performed on the board
}

#[derive(Serialize, Deserialize, Debug)]
pub struct KanbanMetadata {
  pub board_id: String, // Unique ID for the board
  pub owner: Option<String>, // Owner's ID or name
  pub created_at: Option<String>, // ISO 8601 timestamp
  pub updated_at: Option<String>, // ISO 8601 timestamp
}

#[derive(Serialize, Deserialize, Debug)]
pub struct KanbanItem {
  pub id: String, // Unique identifier for the item
  pub container: String, // The board/container this item belongs to
  pub notes: Vec<KanbanNote>, // New field for notes
  pub priority: Option<u8>, // Optional priority (1 = high, 5 = low)
}

#[derive(Serialize, Deserialize, Debug)]
pub struct KanbanNote {
  pub note_id: String, // Unique identifier for the note
  pub content: String, // The note's content
  pub created_at: Option<String>, // Timestamp for when the note was created
}

#[derive(Serialize, Deserialize, Debug)]
pub struct KanbanAction {
  pub action_id: String, // Unique identifier for the action
  pub item_id: Option<String>, // The item ID this action is related to (optional for board-wide actions)
  pub action_type: String, // The type of action, e.g., "move", "delete", "create"
  pub performed_by: Option<String>, // The user who performed the action
  pub timestamp: String, // ISO 8601 timestamp for when the action occurred
  pub details: Option<String>, // Optional details about the action
}

impl KanbanItem {
  pub fn validate(&self) -> Result<(), String> {
    if self.id.trim().is_empty() {
      return Err("Item ID cannot be empty".to_string());
    }
    if self.container.trim().is_empty() {
      return Err("Container cannot be empty".to_string());
    }
    Ok(())
  }
}

impl KanbanAction {
  pub fn validate(&self) -> Result<(), String> {
    if self.action_id.trim().is_empty() {
      return Err("Action ID cannot be empty".into());
    }
    if self.timestamp.trim().is_empty() {
      return Err("Timestamp cannot be empty".into());
    }
    Ok(())
  }
}

#[cfg(feature = "jemalloc")]
mod allocator {
  #[cfg(not(target_env = "msvc"))]
  use tikv_jemallocator::Jemalloc;
  #[cfg(not(target_env = "msvc"))]
  #[global_allocator]
  static GLOBAL: Jemalloc = Jemalloc;
}

#[tokio::main]
async fn main() {
  // Initialize tracing
  tracing_subscriber
    ::registry()
    .with(tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "debug".into()))
    .with(tracing_subscriber::fmt::layer())
    .init();

  // AWS DynamoDB Client
  let config = aws_config::load_from_env().await;
  let dynamo_client = Arc::new(Client::new(&config));

  // Broadcast channel for WebSocket
  let (tx, _) = broadcast::channel(100);

  // Shared application state
  let state = AppState {
    dynamo_client,
    tx,
  };

  // CORS layer
  let cors = CorsLayer::new()
    .allow_origin([
      "https://kbve.com".parse::<HeaderValue>().unwrap(), // Main domain
      "https://kanban.kbve.com".parse::<HeaderValue>().unwrap(), // Subdomain
      "https://websocketking.com".parse::<HeaderValue>().unwrap(), // Websocket King Test
      "http://localhost".parse::<HeaderValue>().unwrap(), // Localhost for development
      "http://127.0.0.1".parse::<HeaderValue>().unwrap(), // Localhost alternative
    ])
    .allow_methods(tower_http::cors::Any)
    .allow_headers(
      vec![
        header::CONTENT_TYPE
        // Add other headers as needed
      ]
    );

  // Router setup
  let app = Router::new()
    .route("/api/get_board", post(get_board))
    .route("/api/save_board", post(save_board_handler))
    .route("/api/delete_board", post(delete_board_handler))
    .route("/api/add_item", post(add_item_handler))
    .route("/api/delete_item", post(delete_item_handler))
    .route("/ws", get(websocket_handler))
    .fallback_service(ServeDir::new("build").append_index_html_on_directories(true))
    .with_state(state)
    .layer(cors)
    .layer(TraceLayer::new_for_http());

  // Run the server
  let listener = TcpListener::bind("0.0.0.0:3000").await.unwrap();
  tracing::debug!("listening on {}", listener.local_addr().unwrap());
  axum::serve(listener, app.into_make_service_with_connect_info::<SocketAddr>()).await.unwrap();
}

// RESTful API: Fetch board from DynamoDB
async fn get_board(
  State(state): State<AppState>,
  Json(payload): Json<HashMap<String, String>>
) -> impl IntoResponse {
  // Extract board_id from the request payload
  let board_id = match payload.get("board_id") {
    Some(id) => id,
    None => {
      let error_response = json!({ "error": "Missing 'board_id' in request payload" });
      return (StatusCode::BAD_REQUEST, Json(error_response)).into_response();
    }
  };

  // Fetch the board from DynamoDB
  match fetch_board(&state.dynamo_client, board_id).await {
    Ok(board) => {
      tracing::debug!("Successfully fetched board: {:?}", board);
      Json(board).into_response()
    }
    Err(e) => {
      tracing::error!("Failed to fetch board: {}", e);
      let error_response = json!({ "error": "Failed to fetch board data" });
      (StatusCode::INTERNAL_SERVER_ERROR, Json(error_response)).into_response()
    }
  }
}

// RESTful API: Save board to DynamoDB
async fn save_board_handler(
  State(state): State<AppState>,
  Json(payload): Json<HashMap<String, serde_json::Value>>
) -> Result<Json<&'static str>, impl IntoResponse> {
  let board_id = payload
    .get("board_id")
    .and_then(|v| v.as_str())
    .ok_or_else(|| {
      tracing::error!("Missing or invalid 'board_id' in the payload");
      (StatusCode::BAD_REQUEST, "Missing or invalid 'board_id'")
    })?;

  // Validate and deserialize fields
  let todo = payload
    .get("todo")
    .and_then(|v| serde_json::from_value(v.clone()).ok())
    .unwrap_or_else(|| {
      tracing::warn!("'todo' field missing or invalid, defaulting to empty");
      vec![]
    });

  let in_progress = payload
    .get("in_progress")
    .and_then(|v| serde_json::from_value(v.clone()).ok())
    .unwrap_or_else(|| {
      tracing::warn!("'in_progress' field missing or invalid, defaulting to empty");
      vec![]
    });

  let done = payload
    .get("done")
    .and_then(|v| serde_json::from_value(v.clone()).ok())
    .unwrap_or_else(|| {
      tracing::warn!("'done' field missing or invalid, defaulting to empty");
      vec![]
    });

  let unassigned = payload
    .get("unassigned")
    .and_then(|v| serde_json::from_value(v.clone()).ok())
    .unwrap_or_else(|| {
      tracing::warn!("'unassigned' field missing or invalid, defaulting to empty");
      vec![]
    });

  let metadata = payload.get("metadata").and_then(|v| serde_json::from_value(v.clone()).ok());

  let actions = payload
    .get("actions")
    .and_then(|v| serde_json::from_value(v.clone()).ok())
    .unwrap_or_else(|| {
      tracing::warn!("'actions' field missing or invalid, defaulting to empty");
      vec![]
    });

  let board = KanbanBoard {
    todo,
    in_progress,
    done,
    unassigned,
    metadata,
    actions,
  };

  match save_board(&state.dynamo_client, board_id, board).await {
    Ok(_) => Ok(Json("Board saved successfully")),
    Err(e) => {
      tracing::error!("Failed to save board: {}", e);
      Err((StatusCode::INTERNAL_SERVER_ERROR, "Failed to save board"))
    }
  }
}

pub async fn save_board(client: &Client, board_id: &str, board: KanbanBoard) -> Result<(), String> {
  // Annotate the type for `item`
  let item: HashMap<String, AttributeValue> = to_item(board).map_err(|e| {
    tracing::error!("Failed to serialize board: {}", e);
    e.to_string()
  })?;

  // Add the partition key to the item
  let mut item_with_key = item;
  item_with_key.insert("board_id".to_string(), AttributeValue::S(board_id.to_string()));

  tracing::debug!("Final item for PutItem: {:?}", item_with_key);

  // Execute the PutItem request
  client
    .put_item()
    .table_name("KanbanBoards")
    .set_item(Some(item_with_key))
    .send().await
    .map_err(|e| {
      tracing::error!("PutItem request failed: {:?}", e);
      e.to_string()
    })?;

  Ok(())
}

async fn fetch_board(client: &Client, board_id: &str) -> Result<KanbanBoard, String> {
  let result = client
    .get_item()
    .table_name("KanbanBoards")
    .key("board_id", AttributeValue::S(board_id.to_string()))
    .send().await
    .map_err(|e| {
      tracing::error!("Failed to fetch item from DynamoDB: {:?}", e);
      e.to_string()
    })?;

  let item = result.item.ok_or("Board not found")?;

  let board: KanbanBoard = from_item(item).map_err(|e| {
    tracing::error!("Failed to deserialize board: {}", e);
    e.to_string()
  })?;

  // Ensure all fields are present
  Ok(KanbanBoard {
    todo: board.todo,
    in_progress: board.in_progress,
    done: board.done,
    unassigned: board.unassigned, // Already a Vec<KanbanItem>, no need for unwrap_or_else
    metadata: board.metadata,
    actions: board.actions, // Already a Vec<KanbanAction>, no need for unwrap_or_else
  })
}
//  Websockets
//TODO: Websockets

// WebSocket Handler
async fn websocket_handler(
  ws: WebSocketUpgrade,
  State(state): State<AppState>
) -> impl IntoResponse {
  ws.on_upgrade(move |socket| handle_socket(socket, state))
}

async fn handle_socket(mut socket: WebSocket, state: AppState) {
  let mut rx = state.tx.subscribe();

  while let Some(Ok(msg)) = socket.next().await {
    if let Message::Text(text) = msg {
      if text == "fetch_board" {
        let board_id = "example-board-id";
        if let Ok(board) = fetch_board(&state.dynamo_client, board_id).await {
          let _ = socket.send(Message::Text(serde_json::to_string(&board).unwrap())).await;
        }
      } else {
        tracing::info!("Unknown WebSocket message: {}", text);
      }
    }
  }
}

//  TODO: Delete

async fn delete_board_handler(
  State(state): State<AppState>,
  Json(payload): Json<HashMap<String, String>>
) -> impl IntoResponse {
  let board_id = match payload.get("board_id") {
    Some(id) => id,
    None => {
      let error_response = json!({"error": "Missing 'board_id' in request payload"});
      return (StatusCode::BAD_REQUEST, Json(error_response)).into_response();
    }
  };

  match delete_board(&state.dynamo_client, board_id).await {
    Ok(_) => Json(json!({"message": "Board deleted successfully"})).into_response(),
    Err(e) => {
      tracing::error!("Failed to delete board: {}", e);
      let error_response = json!({"error": "Failed to delete board"});
      (StatusCode::INTERNAL_SERVER_ERROR, Json(error_response)).into_response()
    }
  }
}

pub async fn delete_board(client: &Client, board_id: &str) -> Result<(), String> {
  client
    .delete_item()
    .table_name("KanbanBoards")
    .key("board_id", AttributeValue::S(board_id.to_string()))
    .send().await
    .map_err(|e| {
      tracing::error!("DeleteItem request failed: {:?}", e);
      e.to_string()
    })?;
  Ok(())
}

//  TODO: Add Item handler

async fn add_item(dynamo_client: &Client, board_id: &str, item: KanbanItem) -> Result<(), String> {
  // Fetch the board from DynamoDB
  let mut board = fetch_board(dynamo_client, board_id).await.map_err(|e|
    format!("Failed to fetch board: {}", e)
  )?;

  // Add the item to the "todo" column; adjust as needed
  board.todo.push(item);

  // Save the updated board back to DynamoDB
  save_board(dynamo_client, board_id, board).await.map_err(|e|
    format!("Failed to save board: {}", e)
  )?;

  Ok(())
}

async fn add_item_handler(
  State(state): State<AppState>,
  Json(payload): Json<HashMap<String, serde_json::Value>>
) -> impl IntoResponse {
  // Extract the board_id and item details
  let board_id = match payload.get("board_id").and_then(|v| v.as_str()) {
    Some(id) => id,
    None => {
      return (
        StatusCode::BAD_REQUEST,
        Json(json!({"error": "Missing or invalid 'board_id'"})),
      ).into_response();
    }
  };

  let item: KanbanItem = match
    payload.get("item").and_then(|v| serde_json::from_value(v.clone()).ok())
  {
    Some(item) => item,
    None => {
      return (
        StatusCode::BAD_REQUEST,
        Json(json!({"error": "Invalid or missing 'item'"})),
      ).into_response();
    }
  };

  // Validate the item
  if let Err(err) = item.validate() {
    return (StatusCode::BAD_REQUEST, Json(json!({"error": err}))).into_response();
  }

  // Call the add_item function
  match add_item(&state.dynamo_client, board_id, item).await {
    Ok(_) => Json(json!({"message": "Item added successfully"})).into_response(),
    Err(err) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": err}))).into_response(),
  }
}


//  TODO: Delete Item Handler

async fn delete_item(
  dynamo_client: &Client,
  board_id: &str,
  item_id: &str,
) -> Result<(), String> {
  // Fetch the board from DynamoDB
  let mut board = fetch_board(dynamo_client, board_id)
      .await
      .map_err(|e| format!("Failed to fetch board: {}", e))?;

  // Remove the item from all columns
  let mut found = false;
  for column in [&mut board.todo, &mut board.in_progress, &mut board.done, &mut board.unassigned]
  {
      if let Some(pos) = column.iter().position(|item| item.id == item_id) {
          column.remove(pos);
          found = true;
          break;
      }
  }

  // If the item was not found, return an error
  if !found {
      return Err(format!("Item with id '{}' not found on board '{}'", item_id, board_id));
  }

  // Save the updated board back to DynamoDB
  save_board(dynamo_client, board_id, board)
      .await
      .map_err(|e| format!("Failed to save board: {}", e))?;

  Ok(())
}

async fn delete_item_handler(
  State(state): State<AppState>,
  Json(payload): Json<HashMap<String, String>>,
) -> impl IntoResponse {
  // Extract the board_id and item_id
  let board_id = match payload.get("board_id") {
      Some(id) => id,
      None => {
          return (
              StatusCode::BAD_REQUEST,
              Json(json!({"error": "Missing or invalid 'board_id'"})),
          )
              .into_response();
      }
  };

  let item_id = match payload.get("item_id") {
      Some(id) => id,
      None => {
          return (
              StatusCode::BAD_REQUEST,
              Json(json!({"error": "Missing or invalid 'item_id'"})),
          )
              .into_response();
      }
  };

  // Call the delete_item function
  match delete_item(&state.dynamo_client, board_id, item_id).await {
      Ok(_) => Json(json!({"message": "Item deleted successfully"})).into_response(),
      Err(err) => (
          StatusCode::INTERNAL_SERVER_ERROR,
          Json(json!({"error": err})),
      )
          .into_response(),
  }
}
