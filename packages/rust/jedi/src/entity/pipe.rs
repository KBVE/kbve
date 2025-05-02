use serde::Serialize;
use flexbuffers::FlexbufferSerializer;
use crate::error::JediError;

pub enum OutputFormat {
  Binary,
  Json,
}

pub trait Pipe: Sized {
    fn pipe<F, T>(self, f: F) -> T
    where
      F: FnOnce(Self) -> T,
    {
      f(self)
    }
  
    fn pipe_if<F>(self, cond: bool, f: F) -> Self
    where
      F: FnOnce(Self) -> Self,
    {
      if cond { f(self) } else { self }
    }
  
    fn tap<F>(self, f: F) -> Self
    where
      F: FnOnce(&Self),
    {
      f(&self);
      self
    }
  
    fn pipe_ok<T, E, F>(self, f: F) -> Result<T, E>
    where
      Self: Into<Result<T, E>>,
      F: FnOnce(T) -> Result<T, E>,
    {
      self.into().and_then(f)
    }

    fn pipe_serialize(self, format: OutputFormat) -> Result<Vec<u8>, JediError>
    where
        Self: Serialize,
    {
        match format {
            OutputFormat::Binary => {
                let mut ser = FlexbufferSerializer::new();
                self.serialize(&mut ser)
                    .map_err(|e| JediError::Parse(format!("Flexbuffer error: {e}")))?;
                Ok(ser.take_buffer())
            }
            OutputFormat::Json => {
                serde_json::to_vec(&self)
                    .map_err(|e| JediError::Parse(format!("JSON error: {e}")))
            }
        }
    }
  }
  
  impl<T> Pipe for T {}
  