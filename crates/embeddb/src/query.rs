use crate::EmbedValue;

#[derive(Debug, Clone, PartialEq)]
pub struct QueryResult {
    pub columns: Vec<String>,
    pub rows: Vec<crate::EmbedRow>,
}

impl QueryResult {
    pub fn column_index(&self, name: &str) -> Option<usize> {
        self.columns.iter().position(|c| c == name)
    }

    pub fn get(&self, row: usize, column: &str) -> Option<&EmbedValue> {
        let idx = self.column_index(column)?;
        self.rows.get(row)?.get(idx)
    }

    pub fn len(&self) -> usize {
        self.rows.len()
    }

    pub fn is_empty(&self) -> bool {
        self.rows.is_empty()
    }
}

pub trait FromEmbedRow: Sized {
    fn from_row(row: &crate::EmbedRow, columns: &[String]) -> crate::Result<Self>;
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{EmbedRow, EmbedValue};

    fn sample() -> QueryResult {
        QueryResult {
            columns: vec!["id".into(), "name".into()],
            rows: vec![
                EmbedRow(vec![EmbedValue::Int(1), EmbedValue::Text("a".into())]),
                EmbedRow(vec![EmbedValue::Int(2), EmbedValue::Text("b".into())]),
            ],
        }
    }

    #[test]
    fn column_index_found_and_missing() {
        let q = sample();
        assert_eq!(q.column_index("id"), Some(0));
        assert_eq!(q.column_index("name"), Some(1));
        assert_eq!(q.column_index("nope"), None);
    }

    #[test]
    fn get_by_row_and_column() {
        let q = sample();
        assert_eq!(q.get(0, "id"), Some(&EmbedValue::Int(1)));
        assert_eq!(q.get(1, "name"), Some(&EmbedValue::Text("b".into())));
    }

    #[test]
    fn get_missing_column_is_none() {
        assert_eq!(sample().get(0, "missing"), None);
    }

    #[test]
    fn get_row_out_of_range_is_none() {
        assert_eq!(sample().get(9, "id"), None);
    }

    #[test]
    fn len_and_is_empty() {
        let q = sample();
        assert_eq!(q.len(), 2);
        assert!(!q.is_empty());
    }

    #[test]
    fn empty_result_reports_empty() {
        let q = QueryResult {
            columns: vec!["id".into()],
            rows: vec![],
        };
        assert_eq!(q.len(), 0);
        assert!(q.is_empty());
        assert_eq!(q.get(0, "id"), None);
        assert_eq!(q.column_index("id"), Some(0));
    }

    #[test]
    fn duplicate_column_names_pick_first_index() {
        let q = QueryResult {
            columns: vec!["x".into(), "x".into()],
            rows: vec![EmbedRow(vec![EmbedValue::Int(10), EmbedValue::Int(20)])],
        };
        assert_eq!(q.column_index("x"), Some(0));
        assert_eq!(q.get(0, "x"), Some(&EmbedValue::Int(10)));
    }

    #[test]
    fn query_result_clone_and_eq() {
        let q = sample();
        assert_eq!(q.clone(), q);
    }

    #[test]
    fn from_embed_row_custom_impl() {
        struct Named(String);
        impl FromEmbedRow for Named {
            fn from_row(row: &crate::EmbedRow, columns: &[String]) -> crate::Result<Self> {
                let idx = columns
                    .iter()
                    .position(|c| c == "name")
                    .ok_or_else(|| crate::EmbedError::Other("no name".into()))?;
                let s = row
                    .as_str(idx)
                    .ok_or_else(|| crate::EmbedError::Other("not text".into()))?;
                Ok(Named(s.to_string()))
            }
        }
        let q = sample();
        let n = Named::from_row(&q.rows[1], &q.columns).unwrap();
        assert_eq!(n.0, "b");
        let cols = vec!["id".to_string()];
        assert!(Named::from_row(&q.rows[0], &cols).is_err());
    }
}
