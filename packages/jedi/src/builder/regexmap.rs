//	use crossbeam::atomic::AtomicCell;
use dashmap::DashMap;
use regex::Regex;
use std::sync::{Arc, RwLock};


#[derive(Debug)]
pub enum RegexBuilderError {
    InvalidRegex(String),
    PatternNotFound(String),
}

struct RegexEntry {
    regex: RwLock<Option<Arc<Regex>>>,
}

impl RegexEntry {
    fn new() -> Self {
        Self {
            regex: RwLock::new(None),
        }
    }

    fn initialize(&self, pattern: &str) {
        let compiled = Arc::new(Regex::new(pattern).expect("Invalid regex pattern"));
        let mut regex_lock = self.regex.write().unwrap();
        *regex_lock = Some(compiled);
    }

    fn is_match(&self, text: &str) -> Option<bool> {
        let regex_lock = self.regex.read().unwrap();
        regex_lock.as_ref().map(|regex| regex.is_match(text))
    }
}

pub struct RegexBuilder {
    patterns: DashMap<String, Arc<RegexEntry>>,
}

impl RegexBuilder {
    pub fn new() -> Self {
        RegexBuilder {
            patterns: DashMap::new(),
        }
    }

    pub fn add_pattern(&self, name: &str, pattern: &str) {
        let entry = Arc::new(RegexEntry::new());
        entry.initialize(pattern);
        self.patterns.insert(name.to_string(), entry);
    }

    pub fn validate(&self, name: &str, text: &str) -> Result<(), RegexBuilderError> {
        if let Some(entry) = self.patterns.get(name) {
            match entry.is_match(text) {
                Some(true) => Ok(()),
                Some(false) => Err(RegexBuilderError::PatternNotFound(name.to_string())),
                None => Err(RegexBuilderError::InvalidRegex(name.to_string())),
            }
        } else {
            Err(RegexBuilderError::PatternNotFound(name.to_string()))
        }
    }

	pub fn bootup(&self) {
        let patterns = vec![
            ("email".to_string(), r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$".to_string()),
            ("phone".to_string(), r"^\+?[0-9]{10,15}$".to_string()),
        ];

        for (name, pattern) in patterns {
            self.add_pattern(&name, &pattern);
        }
    }
}
