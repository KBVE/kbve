use std::sync::Arc;
use tonic::{Request, Response, Status};
use tracing::{error, info};
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
use crate::repo::*;
use crate::state::AppState;

// ──────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────

pub struct PublicApiService {
    state: Arc<AppState>,
}

#[tonic::async_trait]
impl PublicApi for PublicApiService {
    async fn login(&self, req: Request<LoginRequest>) -> Result<Response<LoginResponse>, Status> {
        let r = req.get_ref();
        info!(email = %r.email, "gRPC Login");
        let repo = UsersRepo(&self.state.db);

        match repo.login(&r.email, &r.password).await {
            Ok(result) => Ok(Response::new(LoginResponse {
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
            })),
            Err(e) => {
                error!(error = %e, "gRPC Login failed");
                Err(e.into_tonic())
            }
        }
    }

    async fn register(
        &self,
        req: Request<RegisterRequest>,
    ) -> Result<Response<RegisterResponse>, Status> {
        let r = req.get_ref();
        info!(email = %r.email, "gRPC Register");

        use argon2::{
            Argon2, PasswordHasher,
            password_hash::{SaltString, rand_core::OsRng},
        };
        let salt = SaltString::generate(&mut OsRng);
        let hash = Argon2::default()
            .hash_password(r.password.as_bytes(), &salt)
            .map_err(|e| Status::internal(format!("Hash error: {e}")))?
            .to_string();

        let repo = UsersRepo(&self.state.db);
        match repo
            .register(
                self.state.config.customer_guid,
                &r.email,
                &hash,
                &r.first_name,
                &r.last_name,
            )
            .await
        {
            Ok(_) => Ok(Response::new(RegisterResponse {
                success: true,
                error: None,
            })),
            Err(e) => {
                error!(error = %e, "gRPC Register failed");
                Err(e.into_tonic())
            }
        }
    }

    async fn get_characters(
        &self,
        req: Request<GetCharactersRequest>,
    ) -> Result<Response<GetCharactersResponse>, Status> {
        let r = req.get_ref();
        let session_guid = Uuid::parse_str(&r.user_session_guid)
            .map_err(|_| Status::invalid_argument("Invalid session GUID"))?;

        let repo = UsersRepo(&self.state.db);
        let session = repo
            .get_session(session_guid)
            .await
            .map_err(|e| e.into_tonic())?
            .ok_or_else(|| Status::not_found("Session not found"))?;

        let user_guid = session
            .user_guid
            .ok_or_else(|| Status::not_found("No user in session"))?;

        let chars = repo
            .get_all_characters(self.state.config.customer_guid, user_guid)
            .await
            .map_err(|e| e.into_tonic())?;

        Ok(Response::new(GetCharactersResponse {
            characters: to_proto_characters(&chars),
        }))
    }

    async fn create_character(
        &self,
        req: Request<CreateCharacterRequest>,
    ) -> Result<Response<CreateCharacterResponse>, Status> {
        let r = req.get_ref();
        let session_guid = Uuid::parse_str(&r.user_session_guid)
            .map_err(|_| Status::invalid_argument("Invalid session GUID"))?;

        let users = UsersRepo(&self.state.db);
        let session = users
            .get_session(session_guid)
            .await
            .map_err(|e| e.into_tonic())?
            .ok_or_else(|| Status::not_found("Session not found"))?;

        let user_guid = session
            .user_guid
            .ok_or_else(|| Status::not_found("No user in session"))?;

        let chars = CharsRepo(&self.state.db);
        chars
            .create_character(
                self.state.config.customer_guid,
                user_guid,
                &r.character_name,
                &r.class_name,
            )
            .await
            .map_err(|e| e.into_tonic())?;

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
        let chars = CharsRepo(&self.state.db);
        chars
            .remove_character(self.state.config.customer_guid, &r.character_name)
            .await
            .map_err(|e| e.into_tonic())?;

        info!(character = %r.character_name, "gRPC RemoveCharacter");
        Ok(Response::new(RemoveCharacterResponse {
            success: true,
            error: None,
        }))
    }

    async fn get_server_to_connect_to(
        &self,
        req: Request<GetServerToConnectToRequest>,
    ) -> Result<Response<GetServerToConnectToResponse>, Status> {
        let r = req.get_ref();
        let repo = InstanceRepo(&self.state.db);
        let result = repo
            .join_map_by_char_name(
                self.state.config.customer_guid,
                &r.character_name,
                &r.character_name, // zone_name from zone_id lookup — simplified
            )
            .await
            .map_err(|e| e.into_tonic())?;

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
        let r = req.get_ref();
        let session_guid = Uuid::parse_str(&r.user_session_guid)
            .map_err(|_| Status::invalid_argument("Invalid session GUID"))?;

        let repo = UsersRepo(&self.state.db);
        let session = repo
            .get_session(session_guid)
            .await
            .map_err(|e| e.into_tonic())?
            .ok_or_else(|| Status::not_found("Session not found"))?;

        let user_guid = session
            .user_guid
            .ok_or_else(|| Status::not_found("No user in session"))?;

        let chars = repo
            .get_all_characters(self.state.config.customer_guid, user_guid)
            .await
            .map_err(|e| e.into_tonic())?;

        Ok(Response::new(GetAllCharactersResponse {
            characters: to_proto_characters(&chars),
        }))
    }
}

// ──────────────────────────────────────────────
// Instance Management
// ──────────────────────────────────────────────

pub struct InstanceManagementService {
    state: Arc<AppState>,
}

#[tonic::async_trait]
impl InstanceManagement for InstanceManagementService {
    async fn register_launcher(
        &self,
        _req: Request<RegisterLauncherRequest>,
    ) -> Result<Response<RegisterLauncherResponse>, Status> {
        Err(Status::unimplemented(
            "RegisterLauncher not yet implemented",
        ))
    }

    async fn start_instance_launcher(
        &self,
        _req: Request<StartInstanceLauncherRequest>,
    ) -> Result<Response<StartInstanceLauncherResponse>, Status> {
        Err(Status::unimplemented(
            "StartInstanceLauncher not yet implemented",
        ))
    }

    async fn shut_down_instance_launcher(
        &self,
        _req: Request<ShutDownInstanceLauncherRequest>,
    ) -> Result<Response<ShutDownInstanceLauncherResponse>, Status> {
        Err(Status::unimplemented(
            "ShutDownInstanceLauncher not yet implemented",
        ))
    }

    async fn get_zone_instances_for_world_server(
        &self,
        _req: Request<GetZoneInstancesRequest>,
    ) -> Result<Response<GetZoneInstancesResponse>, Status> {
        Err(Status::unimplemented(
            "GetZoneInstancesForWorldServer not yet implemented",
        ))
    }

    async fn set_zone_instance_status(
        &self,
        req: Request<SetZoneInstanceStatusRequest>,
    ) -> Result<Response<SetZoneInstanceStatusResponse>, Status> {
        let r = req.get_ref();
        let repo = InstanceRepo(&self.state.db);
        repo.set_zone_status(
            self.state.config.customer_guid,
            r.zone_instance_id,
            r.instance_status,
        )
        .await
        .map_err(|e| e.into_tonic())?;

        Ok(Response::new(SetZoneInstanceStatusResponse {
            success: true,
        }))
    }

    async fn spin_up_instance(
        &self,
        _req: Request<SpinUpInstanceRequest>,
    ) -> Result<Response<SpinUpInstanceResponse>, Status> {
        Err(Status::unimplemented("SpinUpInstance not yet implemented"))
    }

    async fn shut_down_instance(
        &self,
        _req: Request<ShutDownInstanceRequest>,
    ) -> Result<Response<ShutDownInstanceResponse>, Status> {
        Err(Status::unimplemented(
            "ShutDownInstance not yet implemented",
        ))
    }
}

// ──────────────────────────────────────────────
// Character Persistence
// ──────────────────────────────────────────────

pub struct CharacterPersistenceService {
    state: Arc<AppState>,
}

#[tonic::async_trait]
impl CharacterPersistence for CharacterPersistenceService {
    async fn get_by_name(
        &self,
        _req: Request<GetCharacterByNameRequest>,
    ) -> Result<Response<crate::proto::ows::Character>, Status> {
        Err(Status::unimplemented("GetByName not yet implemented"))
    }

    async fn update_position(
        &self,
        req: Request<UpdatePositionRequest>,
    ) -> Result<Response<UpdatePositionResponse>, Status> {
        let r = req.get_ref();
        let repo = CharsRepo(&self.state.db);
        repo.update_position(
            self.state.config.customer_guid,
            &r.character_name,
            r.x,
            r.y,
            r.z,
            r.rx,
            r.ry,
            r.rz,
        )
        .await
        .map_err(|e| e.into_tonic())?;

        Ok(Response::new(UpdatePositionResponse { success: true }))
    }

    async fn update_stats(
        &self,
        _req: Request<UpdateStatsRequest>,
    ) -> Result<Response<UpdateStatsResponse>, Status> {
        Err(Status::unimplemented("UpdateStats not yet implemented"))
    }

    async fn player_logout(
        &self,
        req: Request<PlayerLogoutRequest>,
    ) -> Result<Response<PlayerLogoutResponse>, Status> {
        let r = req.get_ref();
        let session_guid = Uuid::parse_str(&r.user_session_guid)
            .map_err(|_| Status::invalid_argument("Invalid session GUID"))?;

        let repo = UsersRepo(&self.state.db);
        repo.logout(session_guid)
            .await
            .map_err(|e| e.into_tonic())?;

        info!(character = %r.character_name, "gRPC PlayerLogout");
        Ok(Response::new(PlayerLogoutResponse { success: true }))
    }

    async fn join_map(
        &self,
        _req: Request<JoinMapRequest>,
    ) -> Result<Response<JoinMapResponse>, Status> {
        Err(Status::unimplemented("JoinMap not yet implemented"))
    }

    async fn leave_map(
        &self,
        _req: Request<LeaveMapRequest>,
    ) -> Result<Response<LeaveMapResponse>, Status> {
        Err(Status::unimplemented("LeaveMap not yet implemented"))
    }
}

// ──────────────────────────────────────────────
// Global Data
// ──────────────────────────────────────────────

pub struct GlobalDataServiceImpl {
    state: Arc<AppState>,
}

#[tonic::async_trait]
impl GlobalDataService for GlobalDataServiceImpl {
    async fn get_global_data(
        &self,
        req: Request<GetGlobalDataRequest>,
    ) -> Result<Response<GetGlobalDataResponse>, Status> {
        let r = req.get_ref();
        let repo = GlobalDataRepo(&self.state.db);

        let data = repo
            .get(self.state.config.customer_guid, &r.global_data_key)
            .await
            .map_err(|e| e.into_tonic())?;

        Ok(Response::new(GetGlobalDataResponse {
            global_data_value: data.and_then(|d| d.global_data_value),
        }))
    }

    async fn set_global_data(
        &self,
        req: Request<SetGlobalDataRequest>,
    ) -> Result<Response<SetGlobalDataResponse>, Status> {
        let r = req.get_ref();
        let repo = GlobalDataRepo(&self.state.db);

        repo.set(
            self.state.config.customer_guid,
            &r.global_data_key,
            &r.global_data_value,
        )
        .await
        .map_err(|e| e.into_tonic())?;

        Ok(Response::new(SetGlobalDataResponse { success: true }))
    }
}

// ──────────────────────────────────────────────
// Router — combines all gRPC services with shared state
// ──────────────────────────────────────────────

pub fn router(
    state: Arc<AppState>,
    _svc: Arc<crate::service::OWSService>,
) -> tonic::service::Routes {
    tonic::service::Routes::new(PublicApiServer::new(PublicApiService {
        state: state.clone(),
    }))
    .add_service(InstanceManagementServer::new(InstanceManagementService {
        state: state.clone(),
    }))
    .add_service(CharacterPersistenceServer::new(
        CharacterPersistenceService {
            state: state.clone(),
        },
    ))
    .add_service(GlobalDataServiceServer::new(GlobalDataServiceImpl {
        state,
    }))
}
