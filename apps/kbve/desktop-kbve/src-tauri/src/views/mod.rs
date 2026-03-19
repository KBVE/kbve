mod command;
mod emitter;
mod handle;
mod manager;
mod view;

// Concrete view implementations
mod general;

pub use command::{ViewCommand, ViewSnapshot, ViewStatus};
pub use manager::ViewManager;

// Re-exported for use by concrete view implementations and future consumers.
#[allow(unused_imports)]
pub use handle::ViewHandle;
#[allow(unused_imports)]
pub use view::ViewActor;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ViewError {
    pub message: String,
}

impl std::fmt::Display for ViewError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.message)
    }
}

impl std::error::Error for ViewError {}

impl From<String> for ViewError {
    fn from(message: String) -> Self {
        Self { message }
    }
}

/// Register all concrete view actors with the manager.
pub fn register_all(manager: &ViewManager) {
    manager.register(general::GeneralViewActor::new());
}
