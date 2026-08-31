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
            Some(EmbedValue::Int(n)) => Ok(*n as f64),
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
            Some(EmbedValue::Int(0)) => Ok(false),
            Some(EmbedValue::Int(1)) => Ok(true),
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
        assert_eq!(
            String::from_embed_value(Some(&EmbedValue::Text("x".into()))).unwrap(),
            "x"
        );
        assert!(bool::from_embed_value(Some(&EmbedValue::Text("true".into()))).is_err());
    }

    #[test]
    fn option_handles_null_and_absent() {
        assert_eq!(Option::<i64>::from_embed_value(None).unwrap(), None);
        assert_eq!(
            Option::<i64>::from_embed_value(Some(&EmbedValue::Null)).unwrap(),
            None
        );
        assert_eq!(
            Option::<i64>::from_embed_value(Some(&EmbedValue::Int(7))).unwrap(),
            Some(7)
        );
    }

    #[test]
    fn missing_non_option_errors() {
        assert!(i64::from_embed_value(None).is_err());
    }

    #[test]
    fn f64_accepts_int_and_float() {
        assert_eq!(
            f64::from_embed_value(Some(&EmbedValue::Int(4))).unwrap(),
            4.0
        );
        assert_eq!(
            f64::from_embed_value(Some(&EmbedValue::Float(2.5))).unwrap(),
            2.5
        );
    }

    #[test]
    fn bool_accepts_sqlite_integer_encoding() {
        assert!(bool::from_embed_value(Some(&EmbedValue::Bool(true))).unwrap());
        assert!(!bool::from_embed_value(Some(&EmbedValue::Bool(false))).unwrap());
        assert!(bool::from_embed_value(Some(&EmbedValue::Int(1))).unwrap());
        assert!(!bool::from_embed_value(Some(&EmbedValue::Int(0))).unwrap());
        assert!(bool::from_embed_value(Some(&EmbedValue::Int(2))).is_err());
        assert!(bool::from_embed_value(None).is_err());
    }

    #[test]
    fn i128_accepts_hugeint_and_int() {
        assert_eq!(
            i128::from_embed_value(Some(&EmbedValue::HugeInt(9))).unwrap(),
            9
        );
        assert_eq!(
            i128::from_embed_value(Some(&EmbedValue::Int(9))).unwrap(),
            9
        );
        assert!(i128::from_embed_value(Some(&EmbedValue::Text("9".into()))).is_err());
        assert!(i128::from_embed_value(None).is_err());
    }

    #[test]
    fn blob_converts_and_rejects_other_types() {
        let bytes = vec![1_u8, 2, 3];
        assert_eq!(
            Vec::<u8>::from_embed_value(Some(&EmbedValue::Blob(bytes.clone()))).unwrap(),
            bytes
        );
        assert!(Vec::<u8>::from_embed_value(Some(&EmbedValue::Int(1))).is_err());
        assert!(Vec::<u8>::from_embed_value(None).is_err());
    }

    #[test]
    fn string_rejects_other_types_and_absent() {
        assert!(String::from_embed_value(Some(&EmbedValue::Int(1))).is_err());
        assert!(String::from_embed_value(None).is_err());
    }

    #[test]
    fn i64_and_f64_reject_wrong_types() {
        assert!(i64::from_embed_value(Some(&EmbedValue::Text("x".into()))).is_err());
        assert!(f64::from_embed_value(Some(&EmbedValue::Text("x".into()))).is_err());
        assert!(f64::from_embed_value(None).is_err());
    }

    #[test]
    fn option_propagates_inner_conversion_error() {
        assert!(Option::<i64>::from_embed_value(Some(&EmbedValue::Text("x".into()))).is_err());
        assert_eq!(
            Option::<String>::from_embed_value(Some(&EmbedValue::Text("x".into()))).unwrap(),
            Some("x".to_string())
        );
    }

    #[test]
    fn error_messages_name_the_expected_type() {
        let err = i64::from_embed_value(Some(&EmbedValue::Text("x".into()))).unwrap_err();
        let msg = err.to_string();
        assert!(msg.contains("i64"));
        assert!(msg.contains("Text"));
        let absent = String::from_embed_value(None).unwrap_err().to_string();
        assert!(absent.contains("String"));
        assert!(absent.contains("absent"));
    }
}
