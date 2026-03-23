use tonic::{Request, Response, Status};
use tracing::info;

use crate::proto::rows::character_persistence_server::{
    CharacterPersistence, CharacterPersistenceServer,
};
use crate::proto::rows::global_data_service_server::{GlobalDataService, GlobalDataServiceServer};
use crate::proto::rows::instance_management_server::{
    InstanceManagement, InstanceManagementServer,
};
use crate::proto::rows::public_api_server::{PublicApi, PublicApiServer};
use crate::proto::rows::*;

// ──────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────

#[derive(Debug, Default)]
pub struct PublicApiService;

#[tonic::async_trait]
impl PublicApi for PublicApiService {
    async fn login(&self, req: Request<LoginRequest>) -> Result<Response<LoginResponse>, Status> {
        info!("Login request for: {}", req.get_ref().email);
        Err(Status::unimplemented("Login not yet implemented"))
    }

    async fn register(
        &self,
        req: Request<RegisterRequest>,
    ) -> Result<Response<RegisterResponse>, Status> {
        info!("Register request for: {}", req.get_ref().email);
        Err(Status::unimplemented("Register not yet implemented"))
    }

    async fn get_characters(
        &self,
        _req: Request<GetCharactersRequest>,
    ) -> Result<Response<GetCharactersResponse>, Status> {
        Err(Status::unimplemented("GetCharacters not yet implemented"))
    }

    async fn create_character(
        &self,
        _req: Request<CreateCharacterRequest>,
    ) -> Result<Response<CreateCharacterResponse>, Status> {
        Err(Status::unimplemented("CreateCharacter not yet implemented"))
    }

    async fn remove_character(
        &self,
        _req: Request<RemoveCharacterRequest>,
    ) -> Result<Response<RemoveCharacterResponse>, Status> {
        Err(Status::unimplemented("RemoveCharacter not yet implemented"))
    }

    async fn get_server_to_connect_to(
        &self,
        _req: Request<GetServerToConnectToRequest>,
    ) -> Result<Response<GetServerToConnectToResponse>, Status> {
        Err(Status::unimplemented(
            "GetServerToConnectTo not yet implemented",
        ))
    }

    async fn get_all_characters(
        &self,
        _req: Request<GetAllCharactersRequest>,
    ) -> Result<Response<GetAllCharactersResponse>, Status> {
        Err(Status::unimplemented(
            "GetAllCharacters not yet implemented",
        ))
    }
}

// ──────────────────────────────────────────────
// Instance Management
// ──────────────────────────────────────────────

#[derive(Debug, Default)]
pub struct InstanceManagementService;

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
        _req: Request<SetZoneInstanceStatusRequest>,
    ) -> Result<Response<SetZoneInstanceStatusResponse>, Status> {
        Err(Status::unimplemented(
            "SetZoneInstanceStatus not yet implemented",
        ))
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

#[derive(Debug, Default)]
pub struct CharacterPersistenceService;

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
        _req: Request<UpdatePositionRequest>,
    ) -> Result<Response<UpdatePositionResponse>, Status> {
        Err(Status::unimplemented("UpdatePosition not yet implemented"))
    }

    async fn update_stats(
        &self,
        _req: Request<UpdateStatsRequest>,
    ) -> Result<Response<UpdateStatsResponse>, Status> {
        Err(Status::unimplemented("UpdateStats not yet implemented"))
    }

    async fn player_logout(
        &self,
        _req: Request<PlayerLogoutRequest>,
    ) -> Result<Response<PlayerLogoutResponse>, Status> {
        Err(Status::unimplemented("PlayerLogout not yet implemented"))
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

#[derive(Debug, Default)]
pub struct GlobalDataServiceImpl;

#[tonic::async_trait]
impl GlobalDataService for GlobalDataServiceImpl {
    async fn get_global_data(
        &self,
        _req: Request<GetGlobalDataRequest>,
    ) -> Result<Response<GetGlobalDataResponse>, Status> {
        Err(Status::unimplemented("GetGlobalData not yet implemented"))
    }

    async fn set_global_data(
        &self,
        _req: Request<SetGlobalDataRequest>,
    ) -> Result<Response<SetGlobalDataResponse>, Status> {
        Err(Status::unimplemented("SetGlobalData not yet implemented"))
    }
}

// ──────────────────────────────────────────────
// Router — combines all gRPC services
// ──────────────────────────────────────────────

pub fn router() -> tonic::service::Routes {
    tonic::service::Routes::new(PublicApiServer::new(PublicApiService))
        .add_service(InstanceManagementServer::new(InstanceManagementService))
        .add_service(CharacterPersistenceServer::new(CharacterPersistenceService))
        .add_service(GlobalDataServiceServer::new(GlobalDataServiceImpl))
}
