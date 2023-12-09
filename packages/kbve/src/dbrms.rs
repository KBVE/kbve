use std::collections::HashMap;
use std::sync::{ Arc, OnceLock };
use std::str::FromStr;

use crate::schema::{ auth, profile, users, apikey, n8n, appwrite, globals };
use dashmap::DashMap;
