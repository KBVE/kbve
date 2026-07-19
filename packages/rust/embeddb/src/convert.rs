use crate::{EmbedError, EmbedValue, Result};

pub trait FromEmbedValue: Sized {
    fn from_embed_value(v: Option<&EmbedValue>) -> Result<Self>;
}

fn absent(expected: &str) -> EmbedError {
    EmbedError::Other(format!("expected {expected}, column absent"))
}

fn mismatch(expected: &str, got: &EmbedValue) -> EmbedError {
    EmbedError::Other(format!("expected {expected}, got {got:?}"))
}

impl FromEmbedValue for i64 {
    fn from_embed_value(v: Option<&EmbedValue>) -> Result<Self> {
        match v {
            Some(EmbedValue::Int(n)) => Ok(*n),
            Some(other) => Err(mismatch("i64", other)),
            None => Err(absent("i64")),
        }
    }
}

impl FromEmbedValue for f64 {
    fn from_embed_value(v: Option<&EmbedValue>) -> Result<Self> {
        match v {
            Some(EmbedValue::Float(n)) => Ok(*n),
            Some(other) => Err(mismatch("f64", other)),
            None => Err(absent("f64")),
        }
    }
}

impl FromEmbedValue for String {
    fn from_embed_value(v: Option<&EmbedValue>) -> Result<Self> {
        match v {
            Some(EmbedValue::Text(s)) => Ok(s.clone()),
            Some(other) => Err(mismatch("String", other)),
            None => Err(absent("String")),
        }
    }
}

impl FromEmbedValue for bool {
    fn from_embed_value(v: Option<&EmbedValue>) -> Result<Self> {
        match v {
            Some(EmbedValue::Bool(b)) => Ok(*b),
            Some(other) => Err(mismatch("bool", other)),
            None => Err(absent("bool")),
        }
    }
}

impl FromEmbedValue for i128 {
    fn from_embed_value(v: Option<&EmbedValue>) -> Result<Self> {
        match v {
            Some(EmbedValue::HugeInt(n)) => Ok(*n),
            Some(EmbedValue::Int(n)) => Ok(*n as i128),
            Some(other) => Err(mismatch("i128", other)),
            None => Err(absent("i128")),
        }
    }
}

impl FromEmbedValue for Vec<u8> {
    fn from_embed_value(v: Option<&EmbedValue>) -> Result<Self> {
        match v {
            Some(EmbedValue::Blob(b)) => Ok(b.clone()),
            Some(other) => Err(mismatch("Vec<u8>", other)),
            None => Err(absent("Vec<u8>")),
        }
    }
}

impl<T: FromEmbedValue> FromEmbedValue for Option<T> {
    fn from_embed_value(v: Option<&EmbedValue>) -> Result<Self> {
        match v {
            None | Some(EmbedValue::Null) => Ok(None),
            some => Ok(Some(T::from_embed_value(some)?)),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scalar_conversions() {
        assert_eq!(i64::from_embed_value(Some(&EmbedValue::Int(5))).unwrap(), 5);
        assert_eq!(String::from_embed_value(Some(&EmbedValue::Text("x".into()))).unwrap(), "x");
        assert!(bool::from_embed_value(Some(&EmbedValue::Int(1))).is_err());
    }

    #[test]
    fn option_handles_null_and_absent() {
        assert_eq!(Option::<i64>::from_embed_value(None).unwrap(), None);
        assert_eq!(Option::<i64>::from_embed_value(Some(&EmbedValue::Null)).unwrap(), None);
        assert_eq!(Option::<i64>::from_embed_value(Some(&EmbedValue::Int(7))).unwrap(), Some(7));
    }

    #[test]
    fn missing_non_option_errors() {
        assert!(i64::from_embed_value(None).is_err());
    }
}
