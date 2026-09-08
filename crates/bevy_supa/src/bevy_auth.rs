//! Bevy integration for the GoTrue auth client — gated on
//! `feature = "bevy"` + `feature = "auth"`.
//!
//! [`SupabaseClient`] is callback-driven, and its callbacks fire off the Bevy
//! schedule: on a worker thread natively, on the browser's microtask queue on
//! wasm. This module is the bridge. Every call parks its outcome on a channel,
//! and one drain system turns the queue into [`AuthEvent`] messages, so game
//! code observes auth the same way it observes any other message and never
//! touches a mutex from a system.
//!
//! [`SupabaseClient`] already commits the session to its own state inside those
//! callbacks, so [`SupabaseAuth::session`] is authoritative the moment the
//! event lands.
//!
//! # Example
//!
//! ```ignore
//! use bevy::prelude::*;
//! use bevy_supa::{AuthEvent, SupaAuthPlugin, SupabaseAuth};
//!
//! App::new()
//!     .add_plugins(SupaAuthPlugin::new(url, anon_key).with_auto_refresh())
//!     .add_systems(Update, on_auth)
//!     .run();
//!
//! fn on_auth(mut events: MessageReader<AuthEvent>, auth: Res<SupabaseAuth>) {
//!     for event in events.read() {
//!         if let AuthEvent::SignedIn(session) = event {
//!             info!("welcome {:?}", session.user.email);
//!         }
//!         let _ = auth.is_authenticated();
//!     }
//! }
//! ```

use std::sync::Mutex;
use std::sync::mpsc::{self, Receiver, Sender};

use bevy::prelude::*;

use crate::supabase::{Session, SupabaseClient, SupabaseConfig};

/// Outcome of an auth call, delivered on the Bevy schedule.
///
/// Errors arrive as strings rather than `SupabaseError` so the message stays
/// `Clone` — a message is read by every reader, and the error enum carries
/// non-cloneable transport detail.
#[derive(Message, Debug, Clone)]
pub enum AuthEvent {
    SignedIn(Session),
    Refreshed(Session),
    SignedOut,
    Failed(String),
}

/// The auth client plus the queue its callbacks land on.
///
/// Held as `Res<SupabaseAuth>`, not `ResMut`: the client is internally
/// `Arc`-shared and the receiver sits behind a mutex, so the sign-in methods
/// take `&self` and any system can start a call without contending for
/// exclusive world access.
#[derive(Resource)]
pub struct SupabaseAuth {
    client: SupabaseClient,
    tx: Sender<AuthEvent>,
    rx: Mutex<Receiver<AuthEvent>>,
}

impl SupabaseAuth {
    pub fn new(client: SupabaseClient) -> Self {
        let (tx, rx) = mpsc::channel();
        Self {
            client,
            tx,
            rx: Mutex::new(rx),
        }
    }

    /// The underlying client, for edge-function calls and direct state reads.
    pub fn client(&self) -> &SupabaseClient {
        &self.client
    }

    pub fn session(&self) -> Option<Session> {
        self.client.get_session()
    }

    pub fn access_token(&self) -> Option<String> {
        self.client.access_token()
    }

    pub fn is_authenticated(&self) -> bool {
        self.client.is_authenticated()
    }

    /// True while any auth call is in flight. Guard repeat submissions with
    /// this — a login button that ignores it will fire one request per frame.
    pub fn is_loading(&self) -> bool {
        self.client.is_loading()
    }

    pub fn sign_in_with_password(&self, email: &str, password: &str) {
        let tx = self.tx.clone();
        self.client
            .sign_in_with_password(email, password, move |result| {
                let _ = tx.send(match result {
                    Ok(session) => AuthEvent::SignedIn(session),
                    Err(err) => AuthEvent::Failed(err.to_string()),
                });
            });
    }

    /// URL to send the player to for a provider login. The provider redirects
    /// back to `redirect_to`, whose full URL is then handed to
    /// [`Self::complete_oauth`].
    pub fn authorize_url(&self, provider: &str, redirect_to: &str) -> String {
        self.client.authorize_url(provider, redirect_to)
    }

    pub fn complete_oauth(&self, callback_url: &str) {
        let tx = self.tx.clone();
        self.client.complete_oauth(callback_url, move |result| {
            let _ = tx.send(match result {
                Ok(session) => AuthEvent::SignedIn(session),
                Err(err) => AuthEvent::Failed(err.to_string()),
            });
        });
    }

    pub fn sign_out(&self) {
        let tx = self.tx.clone();
        self.client.sign_out(move |result| {
            let _ = tx.send(match result {
                Ok(()) => AuthEvent::SignedOut,
                Err(err) => AuthEvent::Failed(err.to_string()),
            });
        });
    }

    pub fn refresh_session(&self) {
        let tx = self.tx.clone();
        self.client.refresh_session(move |result| {
            let _ = tx.send(match result {
                Ok(session) => AuthEvent::Refreshed(session),
                Err(err) => AuthEvent::Failed(err.to_string()),
            });
        });
    }
}

/// Installs [`SupabaseAuth`], the [`AuthEvent`] message, and the drain system.
pub struct SupaAuthPlugin {
    config: SupabaseConfig,
    auto_refresh: bool,
}

impl SupaAuthPlugin {
    pub fn new(url: impl Into<String>, anon_key: impl Into<String>) -> Self {
        Self {
            config: SupabaseConfig::new(url, anon_key),
            auto_refresh: false,
        }
    }

    pub fn from_config(config: SupabaseConfig) -> Self {
        Self {
            config,
            auto_refresh: false,
        }
    }

    /// Refresh the session automatically once it is inside
    /// [`Session::is_expired`]'s one-minute window.
    ///
    /// Off by default: a game that drives its own login screen usually wants
    /// to decide when a token renewal is allowed to fire.
    pub fn with_auto_refresh(mut self) -> Self {
        self.auto_refresh = true;
        self
    }
}

impl Plugin for SupaAuthPlugin {
    fn build(&self, app: &mut App) {
        app.insert_resource(SupabaseAuth::new(SupabaseClient::from_config(
            self.config.clone(),
        )))
        .add_message::<AuthEvent>()
        .add_systems(Update, drain_auth_queue);

        if self.auto_refresh {
            app.add_systems(Update, auto_refresh_session.before(drain_auth_queue));
        }
    }
}

/// Moves completed callbacks onto the message bus.
///
/// `try_recv` in a loop rather than one per frame: a sign-in and an
/// edge-function retry can complete in the same tick, and holding one back
/// would report it a frame late.
fn drain_auth_queue(auth: Res<SupabaseAuth>, mut writer: MessageWriter<AuthEvent>) {
    let rx = auth.rx.lock().expect("auth queue mutex poisoned");
    while let Ok(event) = rx.try_recv() {
        writer.write(event);
    }
}

/// Renews a session that is about to lapse.
///
/// Gated on `is_loading` so it cannot stack refreshes: the check runs every
/// frame, and the expiry window stays open until the response lands, so
/// without this the system would fire a fresh request every tick for the
/// duration of the round trip.
fn auto_refresh_session(auth: Res<SupabaseAuth>) {
    if auth.is_loading() {
        return;
    }
    if let Some(session) = auth.session()
        && session.is_expired()
    {
        auth.refresh_session();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::supabase::SupabaseUser;

    fn test_session(expires_at: Option<u64>) -> Session {
        Session {
            access_token: "access".to_string(),
            refresh_token: "refresh".to_string(),
            token_type: "bearer".to_string(),
            expires_in: 3600,
            expires_at,
            user: SupabaseUser::default(),
        }
    }

    fn test_auth() -> SupabaseAuth {
        SupabaseAuth::new(SupabaseClient::new("https://example.supabase.co", "anon"))
    }

    #[test]
    fn drains_queued_events_into_messages() {
        let mut app = App::new();
        let auth = test_auth();
        auth.tx.send(AuthEvent::SignedOut).unwrap();
        auth.tx
            .send(AuthEvent::Failed("bad grant".to_string()))
            .unwrap();

        app.insert_resource(auth)
            .add_message::<AuthEvent>()
            .add_systems(Update, drain_auth_queue);
        app.update();

        let messages = app.world().resource::<Messages<AuthEvent>>();
        let mut cursor = messages.get_cursor();
        let drained: Vec<_> = cursor.read(messages).cloned().collect();
        assert_eq!(drained.len(), 2);
        assert!(matches!(drained[0], AuthEvent::SignedOut));
        assert!(matches!(drained[1], AuthEvent::Failed(_)));
    }

    #[test]
    fn drain_is_a_noop_on_an_empty_queue() {
        let mut app = App::new();
        app.insert_resource(test_auth())
            .add_message::<AuthEvent>()
            .add_systems(Update, drain_auth_queue);
        app.update();

        let messages = app.world().resource::<Messages<AuthEvent>>();
        assert_eq!(messages.len(), 0);
    }

    #[test]
    fn session_accessors_track_the_client() {
        let auth = test_auth();
        assert!(!auth.is_authenticated());
        assert!(auth.access_token().is_none());

        auth.client().set_session(test_session(None));
        assert!(auth.is_authenticated());
        assert_eq!(auth.access_token().as_deref(), Some("access"));
    }

    #[test]
    fn auto_refresh_skips_a_session_that_is_not_expiring() {
        let auth = test_auth();
        auth.client().set_session(test_session(Some(u64::MAX)));

        let mut app = App::new();
        app.insert_resource(auth)
            .add_systems(Update, auto_refresh_session);
        app.update();

        // No request was started, so nothing is in flight.
        assert!(!app.world().resource::<SupabaseAuth>().is_loading());
    }

    #[test]
    fn auto_refresh_skips_when_signed_out() {
        let mut app = App::new();
        app.insert_resource(test_auth())
            .add_systems(Update, auto_refresh_session);
        app.update();

        assert!(!app.world().resource::<SupabaseAuth>().is_loading());
    }
}
