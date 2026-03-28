use crate::WebTransportError;
use aeronet_io::Session;
use aeronet_io::connection::{LocalAddr, PeerAddr};
use aeronet_webtransport::server::{
    ServerConfig, SessionRequest, SessionResponse, WebTransportServer, WebTransportServerClient,
};
use aeronet_webtransport::wtransport::Identity;
use bevy_app::{App, Plugin};
use bevy_ecs::prelude::*;
use core::time::Duration;
use lightyear_aeronet::server::ServerAeronetPlugin;
use lightyear_aeronet::{AeronetLinkOf, AeronetPlugin};
use lightyear_link::prelude::LinkOf;
use lightyear_link::server::Server;
use lightyear_link::{Link, LinkStart, Linked, Linking};
use tracing::info;

/// Default QUIC keep-alive interval (seconds).
const DEFAULT_KEEP_ALIVE_SECS: u64 = 4;

/// Default QUIC max idle timeout (seconds).
const DEFAULT_MAX_IDLE_TIMEOUT_SECS: u64 = 30;

/// Allows using [`WebTransportServer`].
pub struct WebTransportServerPlugin;

impl Plugin for WebTransportServerPlugin {
    fn build(&self, app: &mut App) {
        if !app.is_plugin_added::<AeronetPlugin>() {
            app.add_plugins(AeronetPlugin);
        }
        if !app.is_plugin_added::<ServerAeronetPlugin>() {
            app.add_plugins(ServerAeronetPlugin);
        }
        app.add_plugins(aeronet_webtransport::server::WebTransportServerPlugin);

        app.add_observer(Self::link);
        app.add_observer(Self::on_session_request);
        app.add_observer(Self::on_connection);
    }
}

/// WebTransport server implementation which listens for client connections,
/// and coordinates messaging between multiple clients.
///
/// Use [`WebTransportServer::open`] to start opening a server.
///
/// The [`LocalAddr`] component must be inserted to specify the server_addr.
///
/// When a client attempts to connect, the server will trigger a
/// [`SessionRequest`]. Your app **must** observe this, and use
/// [`SessionRequest::respond`] to set how the server should respond to this
/// connection attempt.
#[derive(Debug, Component)]
#[require(Server)]
pub struct WebTransportServerIo {
    pub certificate: Identity,
    /// QUIC keep-alive interval. `None` disables keep-alive pings.
    /// Default: 4 seconds.
    pub keep_alive_interval: Option<Duration>,
    /// QUIC max idle timeout. `None` means no timeout.
    /// Default: 30 seconds.
    pub max_idle_timeout: Option<Duration>,
}

impl WebTransportServerIo {
    /// Create a new server IO with the given certificate and default QUIC timeouts.
    pub fn new(certificate: Identity) -> Self {
        Self {
            certificate,
            keep_alive_interval: Some(Duration::from_secs(DEFAULT_KEEP_ALIVE_SECS)),
            max_idle_timeout: Some(Duration::from_secs(DEFAULT_MAX_IDLE_TIMEOUT_SECS)),
        }
    }

    /// Override QUIC keep-alive interval.
    pub fn with_keep_alive(mut self, interval: Option<Duration>) -> Self {
        self.keep_alive_interval = interval;
        self
    }

    /// Override QUIC max idle timeout.
    pub fn with_max_idle_timeout(mut self, timeout: Option<Duration>) -> Self {
        self.max_idle_timeout = timeout;
        self
    }
}

impl WebTransportServerPlugin {
    fn link(
        trigger: On<LinkStart>,
        query: Query<
            (Entity, &WebTransportServerIo, Option<&LocalAddr>),
            (Without<Linking>, Without<Linked>),
        >,
        mut commands: Commands,
    ) -> Result {
        if let Ok((entity, io, local_addr)) = query.get(trigger.entity) {
            let server_addr = local_addr.ok_or(WebTransportError::LocalAddrMissing)?.0;
            let certificate = io.certificate.clone_identity();
            let keep_alive = io.keep_alive_interval;
            let idle_timeout = io.max_idle_timeout;
            commands.queue(move |world: &mut World| {
                let config = ServerConfig::builder()
                    .with_bind_address(server_addr)
                    .with_identity(certificate)
                    .keep_alive_interval(keep_alive)
                    .max_idle_timeout(idle_timeout)
                    .expect("should be a valid idle timeout")
                    .build();
                info!(
                    "Server WebTransport starting at {} (keep_alive={:?}, idle_timeout={:?})",
                    server_addr, keep_alive, idle_timeout
                );
                let child = world.spawn((AeronetLinkOf(entity), Name::from("WebTransportServer")));
                WebTransportServer::open(config).apply(child);
            });
        }
        Ok(())
    }

    fn on_session_request(mut request: On<SessionRequest>) {
        request.respond(SessionResponse::Accepted);
    }

    fn on_connection(
        trigger: On<Add, Session>,
        query: Query<&AeronetLinkOf>,
        child_query: Query<(&ChildOf, &PeerAddr), With<WebTransportServerClient>>,
        mut commands: Commands,
    ) {
        if let Ok((child_of, peer_addr)) = child_query.get(trigger.entity)
            && let Ok(server_link) = query.get(child_of.parent())
        {
            let link_entity = commands
                .spawn((
                    LinkOf {
                        server: server_link.0,
                    },
                    Link::new(None),
                    PeerAddr(peer_addr.0),
                ))
                .id();
            commands.entity(trigger.entity).insert((
                AeronetLinkOf(link_entity),
                Name::from("WebTransportClientOf"),
            ));
        }
    }
}
