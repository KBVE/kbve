use crate::proto::jedi::MessageKind;
use crate::error::JediError;
use crate::proto::jedi::{MessageKind as Mk, JediEnvelope};
use crate::entity::envelope::{ try_unwrap_flex, wrap_flex};
use crate::state::temple::TempleState;
use bytes::Bytes;
use fred::prelude::*;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;