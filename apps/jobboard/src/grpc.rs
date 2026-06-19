//! gRPC membership service. Shares the vetting logic in `crate::membership` with
//! the REST handlers; identity comes from the `authorization` request metadata
//! (the same Supabase bearer REST uses), so one contract serves both transports.

use crate::auth;
use crate::error::ApiError;
use crate::membership;
use crate::proto::jobboard::membership_service_server::{
    MembershipService, MembershipServiceServer,
};
use crate::proto::jobboard::{
    Ack, DecideMembershipRequest, GetMembershipRequest, MembershipApplicationView,
    SubmitApplicationInput,
};
use crate::state::AppState;
use std::sync::Arc;
use tonic::{Request, Response, Status};
use uuid::Uuid;

pub struct MembershipSvc {
    pub app: Arc<AppState>,
}

pub fn server(app: Arc<AppState>) -> MembershipServiceServer<MembershipSvc> {
    MembershipServiceServer::new(MembershipSvc { app })
}

fn status_from(e: ApiError) -> Status {
    match e {
        ApiError::NotFound(m) => Status::not_found(m),
        ApiError::Unauthorized(m) => Status::unauthenticated(m),
        ApiError::Forbidden(m) => Status::permission_denied(m),
        ApiError::BadRequest(m) => Status::invalid_argument(m),
        ApiError::Conflict(m) => Status::already_exists(m),
        ApiError::Unprocessable(m) => Status::failed_precondition(m),
        ApiError::Database(_) | ApiError::Internal(_) => Status::internal("internal error"),
    }
}

impl MembershipSvc {
    async fn user<T>(&self, request: &Request<T>) -> Result<auth::AuthUser, Status> {
        let token = request
            .metadata()
            .get("authorization")
            .and_then(|v| v.to_str().ok())
            .and_then(|v| {
                v.strip_prefix("Bearer ")
                    .or_else(|| v.strip_prefix("bearer "))
            })
            .map(str::trim)
            .filter(|t| !t.is_empty())
            .ok_or_else(|| Status::unauthenticated("missing bearer token"))?;
        auth::authenticate(&self.app, token)
            .await
            .map_err(status_from)
    }
}

#[tonic::async_trait]
impl MembershipService for MembershipSvc {
    async fn submit_membership(
        &self,
        request: Request<SubmitApplicationInput>,
    ) -> Result<Response<MembershipApplicationView>, Status> {
        let user = self.user(&request).await?;
        let input = request.into_inner();
        let view = membership::submit(&self.app, user.user_id, input)
            .await
            .map_err(status_from)?;
        Ok(Response::new(view))
    }

    async fn decide_membership(
        &self,
        request: Request<DecideMembershipRequest>,
    ) -> Result<Response<Ack>, Status> {
        let user = self.user(&request).await?;
        let req = request.into_inner();
        let app_id = Uuid::parse_str(&req.application_id)
            .map_err(|_| Status::invalid_argument("application_id must be a ULID/uuid"))?;
        let input = req
            .input
            .ok_or_else(|| Status::invalid_argument("input is required"))?;
        let new_status = membership::decide(&self.app, user.user_id, app_id, input)
            .await
            .map_err(status_from)?;
        Ok(Response::new(Ack {
            success: true,
            message: format!("status={new_status}"),
        }))
    }

    async fn get_my_membership(
        &self,
        request: Request<GetMembershipRequest>,
    ) -> Result<Response<MembershipApplicationView>, Status> {
        let user = self.user(&request).await?;
        let view = membership::get_mine(&self.app, user.user_id)
            .await
            .map_err(status_from)?
            .ok_or_else(|| Status::not_found("no membership application"))?;
        Ok(Response::new(view))
    }
}
