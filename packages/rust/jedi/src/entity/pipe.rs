use async_trait::async_trait;
use serde::Serialize;
use flexbuffers::FlexbufferSerializer;
use crate::error::JediError;
use std::future::Future;

pub enum OutputFormat {
  Binary,
  Json,
}

pub enum PipeResult<T> {
  Ok(T),
  Skip,
  Err(JediError),
}

#[async_trait]
pub trait Pipe: Sized + Send {
  fn pipe<F, T>(self, f: F) -> T where F: FnOnce(Self) -> T;

  fn pipe_if<F>(self, cond: bool, f: F) -> Self where F: FnOnce(Self) -> Self;

  fn tap<F>(self, f: F) -> Self where F: FnOnce(&Self);

  fn pipe_ok<T, E, F>(self, f: F) -> Result<T, E>
    where Self: Into<Result<T, E>>, F: FnOnce(T) -> Result<T, E>;

  fn pipe_result<T, E, F>(self, f: F) -> Result<T, E> where F: FnOnce(Self) -> Result<T, E>;

  fn pipe_try_map<T, E, U, F>(self, f: F) -> Result<U, E>
    where Self: Into<Result<T, E>>, F: FnOnce(T) -> U;

  fn pipe_serialize(self, format: OutputFormat) -> Result<Vec<u8>, JediError> where Self: Serialize;

  fn pipe_trace_result<T, E>(self) -> Result<T, E>
  where
      Self: Into<Result<T, E>>,
      T: std::fmt::Debug,
      E: std::fmt::Debug;

  async fn pipe_async<Fut, F, T>(self, f: F) -> T
    where F: FnOnce(Self) -> Fut + Send, Fut: Future<Output = T> + Send;

  async fn pipe_if_async<Fut, F>(self, cond: bool, f: F) -> Self
    where F: FnOnce(Self) -> Fut + Send, Fut: Future<Output = Self> + Send;

  async fn tap_async<Fut, F>(self, f: F) -> Self
    where F: FnOnce(&Self) -> Fut + Send, Fut: Future<Output = ()> + Send;

  async fn pipe_ok_async<OkType, E, Fut, F>(self, f: F) -> Result<OkType, E>
    where
      Self: Into<Result<OkType, E>> + Send,
      OkType: Send,
      E: Send,
      F: FnOnce(OkType) -> Fut + Send,
      Fut: Future<Output = Result<OkType, E>> + Send;

}

#[async_trait]
impl<T: Serialize + Send + Sync + 'static> Pipe for T {
  fn pipe<F, R>(self, f: F) -> R where F: FnOnce(Self) -> R {
    f(self)
  }

  fn pipe_if<F>(self, cond: bool, f: F) -> Self where F: FnOnce(Self) -> Self {
    if cond { f(self) } else { self }
  }

  fn tap<F>(self, f: F) -> Self where F: FnOnce(&Self) {
    f(&self);
    self
  }

  fn pipe_ok<U, E, F>(self, f: F) -> Result<U, E>
    where Self: Into<Result<U, E>>, F: FnOnce(U) -> Result<U, E>
  {
    self.into().and_then(f)
  }

  fn pipe_result<R, E, F>(self, f: F) -> Result<R, E> where F: FnOnce(Self) -> Result<R, E> {
    f(self)
  }

  fn pipe_try_map<Inner, E, Out, F>(self, f: F) -> Result<Out, E>
    where Self: Into<Result<Inner, E>>, F: FnOnce(Inner) -> Out
  {
    self.into().map(f)
  }

  fn pipe_serialize(self, format: OutputFormat) -> Result<Vec<u8>, JediError> {
    match format {
      OutputFormat::Binary => {
        let mut ser = FlexbufferSerializer::new();
        self.serialize(&mut ser).map_err(|e| JediError::Parse(format!("Flexbuffer error: {e}")))?;
        Ok(ser.take_buffer())
      }
      OutputFormat::Json => {
        serde_json::to_vec(&self).map_err(|e| JediError::Parse(format!("JSON error: {e}")))
      }
    }
  }

  fn pipe_trace_result<R, E>(self) -> Result<R, E>
    where
        Self: Into<Result<R, E>>,
        R: std::fmt::Debug,
        E: std::fmt::Debug,
    {
        match self.into() {
            Ok(val) => {
                tracing::debug!(?val, "pipe_ok");
                Ok(val)
            }
            Err(err) => {
                tracing::error!(?err, "pipe_err");
                Err(err)
            }
        }
    }

  async fn pipe_async<Fut, F, R>(self, f: F) -> R
    where F: FnOnce(Self) -> Fut + Send, Fut: Future<Output = R> + Send
  {
    f(self).await
  }

  async fn pipe_if_async<Fut, F>(self, cond: bool, f: F) -> Self
    where F: FnOnce(Self) -> Fut + Send, Fut: Future<Output = Self> + Send
  {
    if cond { f(self).await } else { self }
  }

  async fn tap_async<Fut, F>(self, f: F) -> Self
    where F: FnOnce(&Self) -> Fut + Send, Fut: Future<Output = ()> + Send
  {
    f(&self).await;
    self
  }

  async fn pipe_ok_async<OkType, E, Fut, F>(self, f: F) -> Result<OkType, E>
  where
      Self: Into<Result<OkType, E>> + Send,
      OkType: Send,
      E: Send,
      F: FnOnce(OkType) -> Fut + Send,
      Fut: Future<Output = Result<OkType, E>> + Send,
  {
      match self.into() {
          Ok(val) => f(val).await,
          Err(err) => Err(err),
      }
  }
}
