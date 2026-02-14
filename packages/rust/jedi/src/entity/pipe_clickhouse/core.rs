use crate::error::JediError;
use crate::proto::jedi::{MessageKind, JediEnvelope, PayloadFormat};
use crate::entity::pipe::Pipe;
use crate::entity::envelope::{try_unwrap_payload, wrap_hybrid};
use crate::state::temple::TempleState;

use super::clickhouse_types::*;

macro_rules! match_ch_handlers {
    ($kind:expr, $env:expr, $ctx:expr, $fmt:expr) => {{
        if MessageKind::ch_select($kind) {
            handle_ch_select($env, $ctx, $fmt).await
        } else if MessageKind::ch_insert($kind) {
            handle_ch_insert($env, $ctx, $fmt).await
        } else if MessageKind::ch_ddl($kind) {
            handle_ch_ddl($env, $ctx, $fmt).await
        } else {
            Err(JediError::Internal("Unsupported ClickHouse operation".into()))
        }
    }};
}

pub async fn pipe_clickhouse(env: JediEnvelope, ctx: &TempleState) -> Result<JediEnvelope, JediError> {
    env.pipe_async(|e| async move {
        let format = PayloadFormat::try_from(e.format).map_err(|_|
            JediError::Internal("Invalid PayloadFormat".into())
        )?;

        let kind = e.kind;
        if !MessageKind::try_from_valid(kind) {
            tracing::warn!("Unhandled or invalid MessageKind in ClickHouse handler: {}", kind);
        }

        match format {
            PayloadFormat::Flex | PayloadFormat::Json => {
                match_ch_handlers!(kind.into(), &e, ctx, format)
            }
            _ => Err(JediError::Internal("Unsupported PayloadFormat".into())),
        }
    }).await
}

async fn handle_ch_select(
    env: &JediEnvelope,
    ctx: &TempleState,
    format: PayloadFormat,
) -> Result<JediEnvelope, JediError> {
    let input = try_unwrap_payload::<ClickHouseQueryInput>(env)?;
    let config = ctx.clickhouse_config.as_ref()
        .ok_or_else(|| JediError::Internal("ClickHouse not configured".into()))?;

    let rows = config.execute_select(&input.query).await?;
    let result = ClickHouseQueryResult {
        count: rows.len(),
        rows,
    };

    Ok(wrap_hybrid(
        MessageKind::Clickhouse as i32 | MessageKind::Read as i32,
        format,
        &result,
        Some(env.metadata.clone()),
    ))
}

async fn handle_ch_insert(
    env: &JediEnvelope,
    ctx: &TempleState,
    format: PayloadFormat,
) -> Result<JediEnvelope, JediError> {
    let input = try_unwrap_payload::<ClickHouseInsertInput>(env)?;
    let config = ctx.clickhouse_config.as_ref()
        .ok_or_else(|| JediError::Internal("ClickHouse not configured".into()))?;

    config.execute_insert(&input.table, &input.rows).await?;

    let result = ClickHouseDDLResult {
        success: true,
        statement: format!("INSERT INTO {} ({} rows)", input.table, input.rows.len()),
    };

    Ok(wrap_hybrid(
        MessageKind::Clickhouse as i32 | MessageKind::Add as i32,
        format,
        &result,
        Some(env.metadata.clone()),
    ))
}

async fn handle_ch_ddl(
    env: &JediEnvelope,
    ctx: &TempleState,
    format: PayloadFormat,
) -> Result<JediEnvelope, JediError> {
    let input = try_unwrap_payload::<ClickHouseDDLInput>(env)?;
    let client = ctx.clickhouse_client.as_ref()
        .ok_or_else(|| JediError::Internal("ClickHouse client not configured".into()))?;

    client
        .query(&input.statement)
        .execute()
        .await?;

    let result = ClickHouseDDLResult {
        success: true,
        statement: input.statement,
    };

    Ok(wrap_hybrid(
        MessageKind::Clickhouse as i32 | MessageKind::Action as i32 | MessageKind::Set as i32,
        format,
        &result,
        Some(env.metadata.clone()),
    ))
}
