use axum::{
  extract::ws::{ WebSocket, WebSocketUpgrade, Message },
  routing::{ get, post },
  response::IntoResponse,
  Router,
  Json,
  State,
};
use serde::{ Deserialize, Serialize };
use std::{ sync::Arc, collections::HashMap, net::SocketAddr };
use tokio::sync::broadcast;
use tower_http::{ services::ServeDir, cors::CorsLayer, trace::TraceLayer };
use tracing_subscriber::{ layer::SubscriberExt, util::SubscriberInitExt };
use aws_sdk_dynamodb::{ Client, types::AttributeValue };
use serde_dynamo::{ to_item, from_item };

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
}

#[derive(Serialize, Deserialize, Debug)]
pub struct KanbanItem {
  pub id: String,
  pub container: String,
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
    .allow_origin(tower_http::cors::Any)
    .allow_methods(tower_http::cors::Any);

  // Router setup
  let app = Router::new()
    .route("/api/get_board", post(get_board))
    .route("/api/save_board", post(save_board_handler))
    .route("/ws", get(websocket_handler))
    .nest_service("/", ServeDir::new("build").append_index_html_on_directories(true))
    .with_state(state)
    .layer(cors)
    .layer(TraceLayer::new_for_http());

  // Run the server
  let addr = SocketAddr::from(([0, 0, 0, 0], 3000));
  tracing::info!("Listening on {}", addr);
  axum::Server::bind(&addr).serve(app.into_make_service()).await.unwrap();
}

// RESTful API: Fetch board from DynamoDB
async fn get_board(
  State(state): State<AppState>,
  Json(payload): Json<HashMap<String, String>>
) -> impl IntoResponse {
  let board_id = payload.get("board_id").unwrap();
  match fetch_board(&state.dynamo_client, board_id).await {
    Ok(board) => Json(board),
    Err(e) => {
      tracing::error!("Failed to fetch board: {}", e);
      Json(KanbanBoard {
        todo: vec![],
        in_progress: vec![],
        done: vec![],
      })
    }
  }
}

// RESTful API: Save board to DynamoDB
//  TODO: Fixture.
async fn save_board_handler(
  State(state): State<AppState>,
  Json(payload): Json<KanbanBoard>
) -> impl IntoResponse {
  let board_id = "example-board-id";
  match save_board(&state.dynamo_client, board_id, payload).await {
    Ok(_) => Json("Board saved successfully"),
    Err(e) => {
      tracing::error!("Failed to save board: {}", e);
      Json("Failed to save board")
    }
  }
}

pub async fn save_board(client: &Client, board_id: &str, board: KanbanBoard) -> Result<(), String> {
  let item = to_item(board).map_err(|e| e.to_string())?;

  client
    .put_item()
    .table_name("KanbanBoards")
    .item("board_id", AttributeValue::S(board_id.to_string()))
    .set_item(Some(item))
    .send().await
    .map_err(|e| e.to_string())?;

  Ok(())
}

async fn fetch_board(client: &Client, board_id: &str) -> Result<KanbanBoard, String> {
  let result = client
    .get_item()
    .table_name("KanbanBoards")
    .key("board_id", board_id.into())
    .send().await
    .map_err(|e| e.to_string())?;
  let item = result.item.ok_or("Board not found")?;
  let board: KanbanBoard = from_item(item).map_err(|e| e.to_string())?;
  Ok(board)
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
