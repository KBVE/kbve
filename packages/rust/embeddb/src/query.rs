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
