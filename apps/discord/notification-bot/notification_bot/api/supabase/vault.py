"""
Vault module for managing secrets in Supabase
"""
import json
from typing import Optional, Literal, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field, UUID4
from .supabase_service import supabase_conn
from notification_bot.utils.logger import logger

# Pydantic Models for Vault Operations
class VaultSecretResponse(BaseModel):
    """Model for vault secret response from Edge Function"""
    id: UUID4
    name: str
    description: Optional[str] = None
    decrypted_secret: str
    created_at: datetime
    updated_at: datetime

class VaultGetRequest(BaseModel):
    """Model for getting a vault secret"""
    command: Literal["get"] = "get"
    secret_id: UUID4

class VaultSetRequest(BaseModel):
    """Model for setting a vault secret"""
    command: Literal["set"] = "set"
    secret_name: str = Field(..., pattern=r"^(system|service|config)/[a-zA-Z0-9_-]+$")
    secret_value: str = Field(..., min_length=1, max_length=8000)
    secret_description: Optional[str] = Field(None, max_length=500)

class VaultOperationResponse(BaseModel):
    """Generic response model for vault operations"""
    success: bool
    data: Optional[Dict[str, Any]] = None
    error: Optional[str] = None

class VaultManager:
    """Optimized manager class for vault operations"""
    
    def __init__(self, supabase_service=None):
        self._supabase = supabase_service or supabase_conn
    
    async def get_vault_secret(self, secret_id: str) -> VaultOperationResponse:
        """
        Get a vault secret by ID using the vault-reader Edge Function
        
        Args:
            secret_id: UUID of the secret to retrieve
            
        Returns:
            VaultOperationResponse with the secret data or error
        """
        try:
            client = self._supabase.init_supabase_client()
            
            # Create the request using Pydantic model
            request = VaultGetRequest(secret_id=secret_id)
            
            # Call the vault-reader Edge Function
            result = client.functions.invoke(
                "vault-reader",
                invoke_options={
                    "body": request.model_dump(mode='json')
                }
            )
            
            # Handle the response
            if result:
                # Decode bytes response if needed
                if isinstance(result, bytes):
                    secret_data = json.loads(result.decode('utf-8'))
                elif hasattr(result, 'data') and isinstance(result.data, bytes):
                    secret_data = json.loads(result.data.decode('utf-8'))
                elif hasattr(result, 'data'):
                    secret_data = result.data
                else:
                    secret_data = result
                
                # Parse into our model
                if secret_data:
                    if 'error' in secret_data:
                        return VaultOperationResponse(
                            success=False,
                            error=secret_data['error']
                        )
                    
                    secret = VaultSecretResponse(**secret_data)
                    return VaultOperationResponse(
                        success=True,
                        data=secret.model_dump()
                    )
            
            return VaultOperationResponse(
                success=False,
                error="No data returned from vault"
            )
            
        except Exception as e:
            logger.error(f"Error fetching vault secret: {e}")
            return VaultOperationResponse(
                success=False,
                error=str(e)
            )
    
    async def set_vault_secret(
        self, 
        secret_name: str, 
        secret_value: str, 
        secret_description: Optional[str] = None
    ) -> VaultOperationResponse:
        """
        Set/create a vault secret using the vault-reader Edge Function
        
        Args:
            secret_name: Name of the secret (must start with system/, service/, or config/)
            secret_value: The secret value to store
            secret_description: Optional description of the secret
            
        Returns:
            VaultOperationResponse with the new secret ID or error
        """
        try:
            client = self._supabase.init_supabase_client()
            
            # Create the request using Pydantic model
            request = VaultSetRequest(
                secret_name=secret_name,
                secret_value=secret_value,
                secret_description=secret_description
            )
            
            # Call the vault-reader Edge Function
            result = client.functions.invoke(
                "vault-reader",
                invoke_options={
                    "body": request.model_dump(mode='json')
                }
            )
            
            # Handle the response
            if result:
                # Decode bytes response if needed
                if isinstance(result, bytes):
                    response_data = json.loads(result.decode('utf-8'))
                elif hasattr(result, 'data') and isinstance(result.data, bytes):
                    response_data = json.loads(result.data.decode('utf-8'))
                elif hasattr(result, 'data'):
                    response_data = result.data
                else:
                    response_data = result
                
                if response_data:
                    if 'error' in response_data:
                        return VaultOperationResponse(
                            success=False,
                            error=response_data['error']
                        )
                    
                    return VaultOperationResponse(
                        success=True,
                        data=response_data
                    )
            
            return VaultOperationResponse(
                success=False,
                error="No data returned from vault"
            )
            
        except Exception as e:
            logger.error(f"Error setting vault secret: {e}")
            return VaultOperationResponse(
                success=False,
                error=str(e)
            )

# Global vault manager instance
vault_manager = VaultManager()