use std::sync::Arc;
use tonic::{Request, Response, Status};
use tracing::info;
use uuid::Uuid;

use crate::convert::to_proto_characters;
use crate::proto::rows::character_persistence_server::{
    CharacterPersistence, CharacterPersistenceServer,
};
use crate::proto::rows::global_data_service_server::{GlobalDataService, GlobalDataServiceServer};
use crate::proto::rows::instance_management_server::{
    InstanceManagement, InstanceManagementServer,
};
use crate::proto::rows::public_api_server::{PublicApi, PublicApiServer};
use crate::proto::rows::*;
use crate::service::OWSService;

#[allow(clippy::result_large_err)]
fn parse_session(s: &str) -> Result<Uuid, Status> {
    Uuid::parse_str(s).map_err(|_| Status::invalid_argument("Invalid session GUID"))
}

fn to_status(e: crate::error::RowsError) -> Status {
    e.into_tonic()
}

/// Pulls a Supabase token out of the gRPC `authorization: Bearer <jwt>` metadata entry.
fn bearer_from_meta<T>(req: &Request<T>) -> Option<String> {
    let raw = req.metadata().get("authorization")?.to_str().ok()?.trim();
    let token = raw
        .strip_prefix("Bearer ")
        .or_else(|| raw.strip_prefix("bearer "))?
        .trim();
    if token.is_empty() {
        None
    } else {
        Some(token.to_string())
    }
}

/// Optional `x-user-session: <uuid>` metadata entry, the gRPC equivalent of the REST session GUID.
fn session_from_meta<T>(req: &Request<T>) -> Option<Uuid> {
    req.metadata()
        .get("x-user-session")?
        .to_str()
        .ok()?
        .trim()
        .parse()
        .ok()
}

/// Optional `x-service-key: <key>` metadata entry for trusted server-to-server callers (e.g. the UE
/// dedicated server), validated against `SUPABASE_SERVICE_KEY_HASH`.
fn service_key_from_meta<T>(req: &Request<T>) -> Option<String> {
    let key = req.metadata().get("x-service-key")?.to_str().ok()?.trim();
    if key.is_empty() {
        None
    } else {
        Some(key.to_string())
    }
}

/// Enforces a valid `x-service-key` for trusted server-to-server RPCs — the gRPC equivalent of the
/// REST `require_service_key` gate. Without this, InstanceManagement / CharacterPersistence-write /
/// GlobalData-write methods would be callable unauthenticated. Player/tenant RPCs use
/// `confirm_login_parts` (bearer/session) instead.
#[allow(clippy::result_large_err)]
fn require_service_key<T>(svc: &OWSService, req: &Request<T>) -> Result<(), Status> {
    let cfg = &svc.state().supabase;
    if !cfg.service_key_enabled() {
        return Err(Status::unauthenticated(
            "service key auth is not configured on this server",
        ));
    }
    let key = service_key_from_meta(req)
        .ok_or_else(|| Status::unauthenticated("x-service-key metadata required"))?;
    crate::supabase::validate_service_key(&key, cfg)
        .map_err(|_| Status::unauthenticated("invalid service key"))?;
    Ok(())
}

pub struct PublicApiService {
    svc: Arc<OWSService>,
}

#[tonic::async_trait]
impl PublicApi for PublicApiService {
    /// DEPRECATED: legacy OWS local email/password login. Prefer Supabase auth (bearer metadata on
    /// the protected RPCs); retained for backwards compatibility and slated for removal.
    async fn login(&self, req: Request<LoginRequest>) -> Result<Response<LoginResponse>, Status> {
        let r = req.get_ref();
        let result = self
            .svc
            .login(&r.email, &r.password)
            .await
            .map_err(to_status)?;
        Ok(Response::new(LoginResponse {
            success: result.authenticated,
            user_session_guid: result
                .user_session_guid
                .map(|u| u.to_string())
                .unwrap_or_default(),
            error: if result.error_message.is_empty() {
                None
            } else {
                Some(result.error_message)
            },
        }))
    }

    /// DEPRECATED: legacy OWS local account creation. Accounts now originate in Supabase and are
    /// provisioned on first external login; retained for backwards compatibility, slated for removal.
    async fn register(
        &self,
        req: Request<RegisterRequest>,
    ) -> Result<Response<RegisterResponse>, Status> {
        let r = req.get_ref();
        use argon2::{
            Argon2, PasswordHasher,
            password_hash::{SaltString, rand_core::OsRng},
        };
        let salt = SaltString::generate(&mut OsRng);
        let hash = Argon2::default()
            .hash_password(r.password.as_bytes(), &salt)
            .map_err(|e| Status::internal(format!("Hash error: {e}")))?
            .to_string();

        self.svc
            .register(&r.email, &hash, &r.first_name, &r.last_name)
            .await
            .map_err(to_status)?;
        Ok(Response::new(RegisterResponse {
            success: true,
            error: None,
        }))
    }

    async fn get_characters(
        &self,
        req: Request<GetCharactersRequest>,
    ) -> Result<Response<GetCharactersResponse>, Status> {
        let session_guid = parse_session(&req.get_ref().user_session_guid)?;
        let guid = self.svc.state().config.customer_guid;
        let chars = self
            .svc
            .get_all_characters(session_guid, guid)
            .await
            .map_err(to_status)?;
        Ok(Response::new(GetCharactersResponse {
            characters: to_proto_characters(&chars),
        }))
    }

    async fn create_character(
        &self,
        req: Request<CreateCharacterRequest>,
    ) -> Result<Response<CreateCharacterResponse>, Status> {
        let r = req.get_ref();
        let session_guid = parse_session(&r.user_session_guid)?;
        let guid = self.svc.state().config.customer_guid;
        self.svc
            .create_character(session_guid, guid, &r.character_name, &r.class_name)
            .await
            .map_err(to_status)?;
        info!(character = %r.character_name, "gRPC CreateCharacter");
        Ok(Response::new(CreateCharacterResponse {
            success: true,
            error: None,
        }))
    }

    async fn remove_character(
        &self,
        req: Request<RemoveCharacterRequest>,
    ) -> Result<Response<RemoveCharacterResponse>, Status> {
        let r = req.get_ref();
        let guid = self.svc.state().config.customer_guid;
        self.svc
            .remove_character(guid, &r.character_name)
            .await
            .map_err(to_status)?;
        Ok(Response::new(RemoveCharacterResponse {
            success: true,
            error: None,
        }))
    }

    async fn get_server_to_connect_to(
        &self,
        req: Request<GetServerToConnectToRequest>,
    ) -> Result<Response<GetServerToConnectToResponse>, Status> {
        let caller = self
            .svc
            .confirm_login_parts(
                bearer_from_meta(&req),
                session_from_meta(&req),
                service_key_from_meta(&req),
            )
            .await
            .map_err(to_status)?;
        let r = req.get_ref();
        let guid = self.svc.state().config.customer_guid;
        let result = self
            .svc
            .get_server_to_connect_to(guid, caller, &r.character_name, &r.character_name)
            .await
            .map_err(to_status)?;
        if !result.success {
            return Ok(Response::new(GetServerToConnectToResponse {
                server_ip: String::new(),
                port: 0,
                error: Some(result.error_message),
            }));
        }
        Ok(Response::new(GetServerToConnectToResponse {
            server_ip: result.server_ip,
            port: result.port,
            error: None,
        }))
    }

    async fn get_all_characters(
        &self,
        req: Request<GetAllCharactersRequest>,
    ) -> Result<Response<GetAllCharactersResponse>, Status> {
        let session_guid = parse_session(&req.get_ref().user_session_guid)?;
        let guid = self.svc.state().config.customer_guid;
        let chars = self
            .svc
            .get_all_characters(session_guid, guid)
            .await
            .map_err(to_status)?;
        Ok(Response::new(GetAllCharactersResponse {
            characters: to_proto_characters(&chars),
        }))
    }
}

pub struct InstanceManagementService {
    svc: Arc<OWSService>,
}

#[tonic::async_trait]
impl InstanceManagement for InstanceManagementService {
    async fn register_launcher(
        &self,
        req: Request<RegisterLauncherRequest>,
    ) -> Result<Response<RegisterLauncherResponse>, Status> {
        require_service_key(&self.svc, &req)?;
        let r = req.get_ref();
        let guid = self.svc.state().config.customer_guid;
        let world_server_id = self
            .svc
            .register_launcher(
                guid,
                &r.launcher_guid,
                &r.server_ip,
                r.max_number_of_instances,
                &r.internal_server_ip,
                r.starting_instance_port,
            )
            .await
            .map_err(to_status)?;
        Ok(Response::new(RegisterLauncherResponse {
            success: world_server_id >= 0,
            world_server_id,
            error: None,
        }))
    }

    async fn start_instance_launcher(
        &self,
        req: Request<StartInstanceLauncherRequest>,
    ) -> Result<Response<StartInstanceLauncherResponse>, Status> {
        require_service_key(&self.svc, &req)?;
        // The dedicated server is its own launcher in the ROWS topology: it
        // registers, then spins up its own zone instances. Ack the start.
        tracing::info!(
            world_server_id = req.get_ref().world_server_id,
            "StartInstanceLauncher ack"
        );
        Ok(Response::new(StartInstanceLauncherResponse {
            success: true,
        }))
    }

    async fn shut_down_instance_launcher(
        &self,
        req: Request<ShutDownInstanceLauncherRequest>,
    ) -> Result<Response<ShutDownInstanceLauncherResponse>, Status> {
        require_service_key(&self.svc, &req)?;
        let r = req.get_ref();
        let guid = self.svc.state().config.customer_guid;
        self.svc
            .shut_down_launcher(guid, r.world_server_id)
            .await
            .map_err(to_status)?;
        Ok(Response::new(ShutDownInstanceLauncherResponse {
            success: true,
        }))
    }

    async fn get_zone_instances_for_world_server(
        &self,
        req: Request<GetZoneInstancesRequest>,
    ) -> Result<Response<GetZoneInstancesResponse>, Status> {
        let r = req.get_ref();
        let guid = self.svc.state().config.customer_guid;
        let instances = self
            .svc
            .get_zone_instances(guid, r.world_server_id)
            .await
            .map_err(to_status)?;
        tracing::debug!(count = instances.len(), "GetZoneInstancesForWorldServer");
        Ok(Response::new(GetZoneInstancesResponse { success: true }))
    }

    async fn set_zone_instance_status(
        &self,
        req: Request<SetZoneInstanceStatusRequest>,
    ) -> Result<Response<SetZoneInstanceStatusResponse>, Status> {
        require_service_key(&self.svc, &req)?;
        let r = req.get_ref();
        let guid = self.svc.state().config.customer_guid;
        self.svc
            .set_zone_status(guid, r.zone_instance_id, r.instance_status)
            .await
            .map_err(to_status)?;
        Ok(Response::new(SetZoneInstanceStatusResponse {
            success: true,
        }))
    }

    async fn spin_up_instance(
        &self,
        req: Request<SpinUpInstanceRequest>,
    ) -> Result<Response<SpinUpInstanceResponse>, Status> {
        require_service_key(&self.svc, &req)?;
        let r = req.get_ref();
        let guid = self.svc.state().config.customer_guid;
        self.svc
            .spin_up_server_instance(
                guid,
                r.world_server_id,
                r.zone_instance_id,
                &r.zone_name,
                r.port,
            )
            .await
            .map_err(to_status)?;
        Ok(Response::new(SpinUpInstanceResponse {
            success: true,
            error: None,
        }))
    }

    async fn shut_down_instance(
        &self,
        req: Request<ShutDownInstanceRequest>,
    ) -> Result<Response<ShutDownInstanceResponse>, Status> {
        require_service_key(&self.svc, &req)?;
        let r = req.get_ref();
        let guid = self.svc.state().config.customer_guid;
        self.svc
            .shut_down_server_instance(guid, r.zone_instance_id)
            .await
            .map_err(to_status)?;
        Ok(Response::new(ShutDownInstanceResponse { success: true }))
    }

    async fn update_number_of_players(
        &self,
        req: Request<UpdateNumberOfPlayersRequest>,
    ) -> Result<Response<UpdateNumberOfPlayersResponse>, Status> {
        require_service_key(&self.svc, &req)?;
        let r = req.get_ref();
        let guid = self.svc.state().config.customer_guid;
        self.svc
            .update_number_of_players(guid, r.zone_instance_id, r.number_of_players)
            .await
            .map_err(to_status)?;
        Ok(Response::new(UpdateNumberOfPlayersResponse {
            success: true,
        }))
    }
}

pub struct CharacterPersistenceService {
    svc: Arc<OWSService>,
}

#[tonic::async_trait]
impl CharacterPersistence for CharacterPersistenceService {
    async fn get_by_name(
        &self,
        req: Request<GetCharacterByNameRequest>,
    ) -> Result<Response<crate::proto::ows::Character>, Status> {
        let r = req.get_ref();
        let guid = self.svc.state().config.customer_guid;
        let ch = self
            .svc
            .get_character_by_name(guid, &r.character_name)
            .await
            .map_err(to_status)?;
        Ok(Response::new(crate::proto::ows::Character::from(&ch)))
    }

    async fn update_position(
        &self,
        req: Request<UpdatePositionRequest>,
    ) -> Result<Response<UpdatePositionResponse>, Status> {
        require_service_key(&self.svc, &req)?;
        let r = req.get_ref();
        let guid = self.svc.state().config.customer_guid;
        self.svc
            .update_position(guid, &r.character_name, r.x, r.y, r.z, r.rx, r.ry, r.rz)
            .await
            .map_err(to_status)?;
        Ok(Response::new(UpdatePositionResponse { success: true }))
    }

    async fn update_stats(
        &self,
        req: Request<UpdateStatsRequest>,
    ) -> Result<Response<UpdateStatsResponse>, Status> {
        require_service_key(&self.svc, &req)?;
        let r = req.get_ref();
        let guid = self.svc.state().config.customer_guid;
        self.svc
            .update_stats(guid, &r.character_name, &r.update_stats_json)
            .await
            .map_err(to_status)?;
        Ok(Response::new(UpdateStatsResponse { success: true }))
    }

    async fn player_logout(
        &self,
        req: Request<PlayerLogoutRequest>,
    ) -> Result<Response<PlayerLogoutResponse>, Status> {
        require_service_key(&self.svc, &req)?;
        let r = req.get_ref();
        let session_guid = parse_session(&r.user_session_guid)?;
        self.svc.logout(session_guid).await.map_err(to_status)?;
        let guid = self.svc.state().config.customer_guid;
        self.svc
            .player_logout(guid, &r.character_name)
            .await
            .map_err(to_status)?;
        info!(character = %r.character_name, "gRPC PlayerLogout");
        Ok(Response::new(PlayerLogoutResponse { success: true }))
    }

    async fn join_map(
        &self,
        req: Request<JoinMapRequest>,
    ) -> Result<Response<JoinMapResponse>, Status> {
        let caller = self
            .svc
            .confirm_login_parts(
                bearer_from_meta(&req),
                session_from_meta(&req),
                service_key_from_meta(&req),
            )
            .await
            .map_err(to_status)?;
        let r = req.get_ref();
        let guid = self.svc.state().config.customer_guid;
        let result = self
            .svc
            .get_server_to_connect_to(guid, caller, &r.character_name, &r.zone_name)
            .await
            .map_err(to_status)?;
        Ok(Response::new(JoinMapResponse {
            success: result.success,
            server_ip: result.server_ip,
            port: result.port,
            error: if result.error_message.is_empty() {
                None
            } else {
                Some(result.error_message)
            },
        }))
    }

    async fn leave_map(
        &self,
        req: Request<LeaveMapRequest>,
    ) -> Result<Response<LeaveMapResponse>, Status> {
        require_service_key(&self.svc, &req)?;
        let r = req.get_ref();
        let guid = self.svc.state().config.customer_guid;
        self.svc
            .player_logout(guid, &r.character_name)
            .await
            .map_err(to_status)?;
        Ok(Response::new(LeaveMapResponse { success: true }))
    }
}

pub struct GlobalDataServiceImpl {
    svc: Arc<OWSService>,
}

#[tonic::async_trait]
impl GlobalDataService for GlobalDataServiceImpl {
    async fn get_global_data(
        &self,
        req: Request<GetGlobalDataRequest>,
    ) -> Result<Response<GetGlobalDataResponse>, Status> {
        let r = req.get_ref();
        let guid = self.svc.state().config.customer_guid;
        let data = self
            .svc
            .get_global_data(guid, &r.global_data_key)
            .await
            .map_err(to_status)?;
        Ok(Response::new(GetGlobalDataResponse {
            global_data_value: data.and_then(|d| d.global_data_value),
        }))
    }

    async fn set_global_data(
        &self,
        req: Request<SetGlobalDataRequest>,
    ) -> Result<Response<SetGlobalDataResponse>, Status> {
        require_service_key(&self.svc, &req)?;
        let r = req.get_ref();
        let guid = self.svc.state().config.customer_guid;
        self.svc
            .set_global_data(guid, &r.global_data_key, &r.global_data_value)
            .await
            .map_err(to_status)?;
        Ok(Response::new(SetGlobalDataResponse { success: true }))
    }
}

use crate::proto::rows::game_server_health_server::{GameServerHealth, GameServerHealthServer};
use crate::proto::rows::{ServerCommand, ServerHeartbeat};
use tokio_stream::wrappers::ReceiverStream;

pub struct GameServerHealthService {
    svc: Arc<OWSService>,
}

#[tonic::async_trait]
impl GameServerHealth for GameServerHealthService {
    type HealthStreamStream = ReceiverStream<Result<ServerCommand, Status>>;

    async fn health_stream(
        &self,
        request: Request<tonic::Streaming<ServerHeartbeat>>,
    ) -> Result<Response<Self::HealthStreamStream>, Status> {
        let mut stream = request.into_inner();
        let svc = self.svc.clone();
        let (tx, rx) = tokio::sync::mpsc::channel(32);

        tokio::spawn(async move {
            let guid = svc.state().config.customer_guid;

            while let Ok(Some(heartbeat)) = stream.message().await {
                tracing::debug!(
                    zone = heartbeat.zone_instance_id,
                    players = heartbeat.number_of_players,
                    cpu = heartbeat.cpu_usage,
                    mem = heartbeat.memory_usage_mb,
                    "Heartbeat received"
                );

                if let Err(e) = svc
                    .update_number_of_players(
                        guid,
                        heartbeat.zone_instance_id,
                        heartbeat.number_of_players,
                    )
                    .await
                {
                    tracing::warn!(error = %e, "Failed to update player count from heartbeat");
                }

                let cmd = ServerCommand {
                    command: "ack".to_string(),
                    payload: String::new(),
                };
                if tx.send(Ok(cmd)).await.is_err() {
                    break;
                }
            }

            tracing::info!("Game server health stream ended");
        });

        Ok(Response::new(ReceiverStream::new(rx)))
    }
}

pub fn router(svc: Arc<OWSService>) -> tonic::service::Routes {
    tonic::service::Routes::new(PublicApiServer::new(PublicApiService { svc: svc.clone() }))
        .add_service(InstanceManagementServer::new(InstanceManagementService {
            svc: svc.clone(),
        }))
        .add_service(CharacterPersistenceServer::new(
            CharacterPersistenceService { svc: svc.clone() },
        ))
        .add_service(GlobalDataServiceServer::new(GlobalDataServiceImpl {
            svc: svc.clone(),
        }))
        .add_service(GameServerHealthServer::new(GameServerHealthService { svc }))
}
