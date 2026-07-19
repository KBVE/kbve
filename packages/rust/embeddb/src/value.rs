#[derive(Debug, Clone, PartialEq)]
pub enum EmbedValue {
    Null,
    Int(i64),
    Float(f64),
    Text(String),
    Blob(Vec<u8>),
}

#[derive(Debug, Clone, PartialEq)]
pub struct EmbedRow(pub Vec<EmbedValue>);

impl EmbedRow {
    pub fn get(&self, idx: usize) -> Option<&EmbedValue> {
        self.0.get(idx)
    }
    pub fn as_i64(&self, idx: usize) -> Option<i64> {
        match self.0.get(idx) {
            Some(EmbedValue::Int(v)) => Some(*v),
            _ => None,
        }
    }
    pub fn as_f64(&self, idx: usize) -> Option<f64> {
        match self.0.get(idx) {
            Some(EmbedValue::Float(v)) => Some(*v),
            _ => None,
        }
    }
    pub fn as_str(&self, idx: usize) -> Option<&str> {
        match self.0.get(idx) {
            Some(EmbedValue::Text(v)) => Some(v.as_str()),
            _ => None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn row_accessors() {
        let r = EmbedRow(vec![EmbedValue::Int(7), EmbedValue::Text("hi".into()), EmbedValue::Null]);
        assert_eq!(r.as_i64(0), Some(7));
        assert_eq!(r.as_str(1), Some("hi"));
        assert_eq!(r.get(2), Some(&EmbedValue::Null));
        assert_eq!(r.as_i64(1), None);
        assert_eq!(r.get(9), None);
    }
}
