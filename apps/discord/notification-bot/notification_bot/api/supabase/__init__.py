"""
Supabase package for managing database operations, vault secrets, distributed coordination, and user management
"""
from .supabase_service import (
    supabase_conn,
    get_supabase_client,
    QueryResult,
    SupabaseService
)
from .vault import (
    vault_manager,
    VaultOperationResponse,
    VaultSecretResponse,
    VaultGetRequest,
    VaultSetRequest
)
from .tracker import (
    tracker_manager,
    ShardAssignment,
    ShardAssignmentResult
)
from .users import (
    user_manager,
    UserProvider,
    UserProviderCreate,
    UserProfile,
    UserAllProviders,
    SyncResult
)

__all__ = [
    # Service instances  
    'supabase_conn',
    'vault_manager',
    'tracker_manager',
    'user_manager',
    
    # Services
    'SupabaseService',
    
    # Functions
    'get_supabase_client',
    
    # Models
    'QueryResult',
    'VaultOperationResponse',
    'VaultSecretResponse',
    'VaultGetRequest',
    'VaultSetRequest',
    'ShardAssignment',
    'ShardAssignmentResult',
    'UserProvider',
    'UserProviderCreate',
    'UserProfile',
    'UserAllProviders',
    'SyncResult'
]