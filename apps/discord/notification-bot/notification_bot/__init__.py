from .api import (
    CORS,
    supabase_conn,
    get_supabase_client,
    VaultSecretResponse,
    VaultOperationResponse,
    discord_bot,
    DiscordBotSingleton
)
from .utils.dependencies import lifespan