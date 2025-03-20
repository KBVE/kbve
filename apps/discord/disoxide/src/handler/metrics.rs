use axum::{
    extract::State,
    http::{Request, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
    body::Body,
};
use tokio::time::Instant;
use crate::entity::state::SharedState;

// ==================== Metrics ========= //
pub async fn metrics(State(state): State<SharedState>) -> impl IntoResponse {

    let (get_count, get_sum, set_count, set_sum) = state.get_metrics();
    let avg_get = if get_count > 0 { (get_sum as f64) / (get_count as f64) } else { 0.0 };
    let avg_set = if set_count > 0 { (set_sum as f64) / (set_count as f64) } else { 0.0 };
  
    let response = format!(
      "# HELP get_key_duration_microseconds Time taken to execute get_key (µs)\n\
         # TYPE get_key_duration_microseconds gauge\n\
         get_key_duration_microseconds {}\n\
         # HELP set_key_duration_microseconds Time taken to execute set_key (µs)\n\
         # TYPE set_key_duration_microseconds gauge\n\
         set_key_duration_microseconds {}\n\
         # HELP api_requests_total Total API requests\n\
         # TYPE api_requests_total counter\n\
         api_requests_total{{method=\"GET\"}} {}\n\
         api_requests_total{{method=\"POST\"}} {}\n",
      avg_get,
      avg_set,
      get_count,
      set_count
    );
  
    Response::builder()
      .status(StatusCode::OK)
      .header("Content-Type", "text/plain")
      .body(Body::from(response))
      .unwrap()
  }
  
pub async fn track_execution_time(
    State(state): State<SharedState>,
    req: Request<Body>,
    next: Next
  ) -> Response {
    let start = Instant::now();
    let method = req.method().to_string();
  
    let response = next.run(req).await;
    let elapsed = start.elapsed().as_micros() as u64;
  
    state.record_metrics(&method, elapsed);
  
    response
  }
  