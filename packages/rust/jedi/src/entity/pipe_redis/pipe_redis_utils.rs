use std::borrow::Cow;
use crate::error::JediError;

pub fn extract_redis_bytes(value: fred::types::Value) -> Result<bytes::Bytes, JediError> {
  value.into_bytes().ok_or_else(|| JediError::Internal("Expected Redis Bytes but got None".into()))
}

pub fn to_utf8_cow<'a>(bytes: &'a [u8]) -> Cow<'a, str> {
  match std::str::from_utf8(bytes) {
    Ok(s) => Cow::Borrowed(s),
    Err(_) => Cow::Owned(String::from_utf8_lossy(bytes).into_owned()),
  }
}
