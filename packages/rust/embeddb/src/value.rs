#[derive(Debug, Clone, PartialEq)]
pub enum EmbedValue {
    Null,
    Int(i64),
    Float(f64),
    Text(String),
    Blob(Vec<u8>),
    Bool(bool),
    HugeInt(i128),
    Timestamp(i64),
    Date(i32),
    Time(i64),
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
    pub fn as_bool(&self, idx: usize) -> Option<bool> {
        match self.0.get(idx) { Some(EmbedValue::Bool(v)) => Some(*v), _ => None }
    }
    pub fn as_i128(&self, idx: usize) -> Option<i128> {
        match self.0.get(idx) { Some(EmbedValue::HugeInt(v)) => Some(*v), _ => None }
    }
    pub fn as_timestamp(&self, idx: usize) -> Option<i64> {
        match self.0.get(idx) { Some(EmbedValue::Timestamp(v)) => Some(*v), _ => None }
    }
    pub fn as_date(&self, idx: usize) -> Option<i32> {
        match self.0.get(idx) { Some(EmbedValue::Date(v)) => Some(*v), _ => None }
    }
    pub fn as_time(&self, idx: usize) -> Option<i64> {
        match self.0.get(idx) { Some(EmbedValue::Time(v)) => Some(*v), _ => None }
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

    #[test]
    fn new_variant_accessors() {
        let r = EmbedRow(vec![
            EmbedValue::Bool(true),
            EmbedValue::HugeInt(170141183460469231731687303715884105727),
            EmbedValue::Timestamp(1_600_000_000_000_000),
            EmbedValue::Date(19000),
            EmbedValue::Time(3_600_000_000),
        ]);
        assert_eq!(r.as_bool(0), Some(true));
        assert_eq!(r.as_i128(1), Some(170141183460469231731687303715884105727));
        assert_eq!(r.as_timestamp(2), Some(1_600_000_000_000_000));
        assert_eq!(r.as_date(3), Some(19000));
        assert_eq!(r.as_time(4), Some(3_600_000_000));
        assert_eq!(r.as_bool(1), None);
    }
}
