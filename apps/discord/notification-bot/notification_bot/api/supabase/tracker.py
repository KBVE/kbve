"""
Tracker module for managing distributed shard coordination
"""
import os
from typing import Optional, Dict, Any, List
from datetime import datetime
from pydantic import BaseModel, Field
from .supabase_service import supabase_conn
from notification_bot.utils.logger import logger

# Import VERSION from constants
try:
    from .constants import VERSION
except ImportError:
    VERSION = "1.4"  # fallback

# Log the version on module load
logger.info(f"Tracker module loaded with VERSION: {VERSION}")

# Pydantic Models for Tracker Operations
class ShardAssignment(BaseModel):
    """Model for shard assignment data"""
    id: str
    instance_id: str
    cluster_name: str
    shard_id: int
    total_shards: int
    status: str = Field(default='active', pattern='^(active|inactive|error|starting|stopping)$')
    last_heartbeat: datetime
    created_at: datetime
    updated_at: datetime
    hostname: Optional[str] = None
    pod_ip: Optional[str] = None
    node_name: Optional[str] = None
    namespace: str = 'discord'
    guild_count: int = 0
    latency_ms: float = 0.0
    memory_usage_mb: Optional[float] = None
    cpu_usage_percent: Optional[float] = None
    bot_version: Optional[str] = None
    deployment_version: Optional[str] = None

class ShardAssignmentResult(BaseModel):
    """Result from shard assignment operation"""
    instance_id: str
    cluster_name: str
    assigned_shard_id: int
    total_shards: int
    assignment_strategy: str
    is_new_assignment: bool

class TrackerManager:
    """Optimized manager class for tracker/cluster coordination operations"""
    
    def __init__(self, supabase_service=None):
        self._supabase = supabase_service or supabase_conn
    
    async def get_shard_assignment(
        self, 
        instance_id: str, 
        cluster_name: str,
        total_shards: int = 2
    ) -> Optional[Dict[str, Any]]:
        """
        Get or create shard assignment for this instance
        
        Args:
            instance_id: Unique identifier for this bot instance
            cluster_name: Name of the cluster
            total_shards: Total number of shards to distribute
            
        Returns:
            Dictionary with shard_id and total_shards, or None if failed
        """
        try:
            client = self._supabase.init_supabase_client()
            
            # Always use the upsert function - it handles all cases properly
            logger.info(f"Getting shard assignment for instance {instance_id} in cluster {cluster_name}")
            
            try:
                # Check for existing assignment first
                existing_check = (
                    client.schema('tracker')
                    .table('cluster_management')
                    .select('*')
                    .eq('instance_id', instance_id)
                    .eq('cluster_name', cluster_name)
                    .execute()
                )
                
                if existing_check.data:
                    # Update existing assignment
                    assignment = existing_check.data[0]
                    logger.info(f"Found existing assignment for {instance_id}: shard {assignment['shard_id']}")
                    
                    update_result = (
                        client.schema('tracker')
                        .table('cluster_management')
                        .update({
                            'last_heartbeat': 'now()',
                            'status': 'active',
                            'hostname': os.getenv('HOSTNAME', instance_id),
                            'pod_ip': os.getenv('POD_IP'),
                            'node_name': os.getenv('NODE_NAME'),
                            'total_shards': total_shards,
                            'bot_version': str(VERSION),
                            'deployment_version': os.getenv('DEPLOYMENT_VERSION', str(VERSION))
                        })
                        .eq('instance_id', instance_id)
                        .eq('cluster_name', cluster_name)
                        .execute()
                    )
                    
                    return {
                        'shard_id': assignment['shard_id'],
                        'total_shards': total_shards
                    }
                else:
                    # No existing assignment - assign shard 0 for now (simplified logic)
                    logger.info(f"Creating new assignment for {instance_id}")
                    
                    try:
                        insert_result = (
                            client.schema('tracker')
                            .table('cluster_management')
                            .insert({
                                'instance_id': instance_id,
                                'cluster_name': cluster_name,
                                'shard_id': 0,  # Simplified: always assign shard 0
                                'total_shards': total_shards,
                                'status': 'active',
                                'last_heartbeat': 'now()',
                                'hostname': os.getenv('HOSTNAME', instance_id),
                                'pod_ip': os.getenv('POD_IP'),
                                'node_name': os.getenv('NODE_NAME'),
                                'namespace': os.getenv('NAMESPACE', 'discord'),
                                'bot_version': str(VERSION),
                                'deployment_version': os.getenv('DEPLOYMENT_VERSION', str(VERSION))
                            })
                            .execute()
                        )
                        
                        logger.info(f"Created new assignment for {instance_id}: shard 0")
                        return {
                            'shard_id': 0,
                            'total_shards': total_shards
                        }
                        
                    except Exception as insert_error:
                        if 'duplicate key value violates unique constraint' in str(insert_error):
                            logger.warning("Shard 0 already assigned, taking it over")
                            # Take over existing shard 0
                            takeover_result = (
                                client.schema('tracker')
                                .table('cluster_management')
                                .update({
                                    'instance_id': instance_id,
                                    'last_heartbeat': 'now()',
                                    'status': 'active',
                                    'hostname': os.getenv('HOSTNAME', instance_id),
                                    'total_shards': total_shards
                                })
                                .eq('cluster_name', cluster_name)
                                .eq('shard_id', 0)
                                .execute()
                            )
                            
                            if takeover_result.data:
                                logger.info("Successfully took over shard 0")
                                return {
                                    'shard_id': 0,
                                    'total_shards': total_shards
                                }
                        
                        raise insert_error
                
            except Exception as e:
                error_str = str(e)
                if 'duplicate key value violates unique constraint' in error_str and 'cluster_management_cluster_name_shard_id_key' in error_str:
                    logger.warning(f"Shard conflict detected, attempting to take over existing assignment: {e}")
                    
                    # Try to take over the existing shard assignment
                    try:
                        # Get the shard ID from the error message
                        import re
                        match = re.search(r'shard_id\)=\([^,]+,\s*(\d+)\)', error_str)
                        if match:
                            shard_id = int(match.group(1))
                            logger.info(f"Taking over shard {shard_id} from previous assignment")
                            
                            # Update the existing record to this instance
                            takeover_result = (
                                client.schema('tracker')
                                .table('cluster_management')
                                .update({
                                    'instance_id': instance_id,
                                    'last_heartbeat': 'now()',
                                    'status': 'active',
                                    'hostname': os.getenv('HOSTNAME', instance_id),
                                    'pod_ip': os.getenv('POD_IP'),
                                    'node_name': os.getenv('NODE_NAME'),
                                    'namespace': os.getenv('NAMESPACE', 'discord'),
                                    'bot_version': str(VERSION),
                                    'deployment_version': os.getenv('DEPLOYMENT_VERSION', str(VERSION)),
                                    'total_shards': total_shards
                                })
                                .eq('cluster_name', cluster_name)
                                .eq('shard_id', shard_id)
                                .execute()
                            )
                            
                            if takeover_result.data:
                                logger.info(f"Successfully took over shard {shard_id}")
                                return {
                                    'shard_id': shard_id,
                                    'total_shards': total_shards
                                }
                            else:
                                logger.error("Failed to take over shard assignment")
                                return None
                                
                    except Exception as takeover_error:
                        logger.error(f"Failed to take over shard: {takeover_error}")
                        return None
                else:
                    logger.error(f"Failed to call upsert_instance_assignment: {e}")
                    import traceback
                    logger.error(f"Traceback: {traceback.format_exc()}")
                    return None
            
            assignment_info = upsert_data[0] if upsert_data else None
            
            if assignment_info:
                assignment_type = "new" if assignment_info['is_new_assignment'] else "existing"
                logger.info(
                    f"Got {assignment_type} shard assignment: "
                    f"shard {assignment_info['assigned_shard_id']}/{assignment_info['total_shards']} "
                    f"via {assignment_info['assignment_strategy']}"
                )
                
                return {
                    'shard_id': assignment_info['assigned_shard_id'],
                    'total_shards': assignment_info['total_shards']
                }
            else:
                logger.error("No assignment data returned from upsert function")
                return None
                
        except Exception as e:
            logger.error(f"Error in shard coordination: {e}")
            import traceback
            logger.error(f"Traceback: {traceback.format_exc()}")
            return None
    
    async def update_heartbeat(
        self,
        instance_id: str,
        cluster_name: str,
        guild_count: Optional[int] = None,
        latency_ms: Optional[float] = None
    ) -> bool:
        """
        Update heartbeat for this shard assignment with optional performance metrics
        
        Args:
            instance_id: Unique identifier for this bot instance
            cluster_name: Name of the cluster
            guild_count: Number of guilds this shard is handling
            latency_ms: Current latency in milliseconds
            
        Returns:
            True if update successful, False otherwise
        """
        try:
            client = self._supabase.init_supabase_client()
            
            bot_version = str(VERSION)
            deployment_version = os.getenv('DEPLOYMENT_VERSION', str(VERSION))
            
            update_data = {
                'last_heartbeat': 'now()',
                'status': 'active',
                'hostname': os.getenv('HOSTNAME', instance_id),
                'pod_ip': os.getenv('POD_IP'),
                'node_name': os.getenv('NODE_NAME'),
                'bot_version': bot_version,
                'deployment_version': deployment_version
            }
            
            logger.debug(f"Updating heartbeat with bot_version: {bot_version}, deployment_version: {deployment_version}")
            
            if guild_count is not None:
                update_data['guild_count'] = guild_count
            if latency_ms is not None:
                update_data['latency_ms'] = latency_ms
            
            try:
                result = (
                    client.schema('tracker')
                    .table('cluster_management')
                    .update(update_data)
                    .eq('instance_id', instance_id)
                    .eq('cluster_name', cluster_name)
                    .execute()
                )
                
                if hasattr(result, 'error') and result.error:
                    logger.warning(f"Failed to update shard heartbeat: {result.error}")
                    return False
                else:
                    logger.debug(
                        f"Updated heartbeat for {instance_id}: "
                        f"guilds={guild_count}, latency={latency_ms}ms"
                    )
                    return True
            except Exception as e:
                logger.warning(f"Failed to update heartbeat: {e}")
                return False
                
        except Exception as e:
            logger.warning(f"Error updating shard heartbeat: {e}")
            return False
    
    async def cleanup_shard_assignment(
        self,
        instance_id: str,
        cluster_name: str
    ) -> bool:
        """
        Mark this instance's shard assignment as inactive
        
        Args:
            instance_id: Unique identifier for this bot instance
            cluster_name: Name of the cluster
            
        Returns:
            True if cleanup successful, False otherwise
        """
        try:
            client = self._supabase.init_supabase_client()
            
            update_data = {
                'status': 'inactive',
                'last_heartbeat': 'now()'
            }
            
            try:
                result = (
                    client.schema('tracker')
                    .table('cluster_management')
                    .update(update_data)
                    .eq('instance_id', instance_id)
                    .eq('cluster_name', cluster_name)
                    .execute()
                )
                
                if hasattr(result, 'error') and result.error:
                    logger.warning(f"Failed to cleanup shard assignment: {result.error}")
                    return False
                else:
                    logger.info(f"Marked shard assignment as inactive for {instance_id}")
                    return True
            except Exception as e:
                logger.warning(f"Failed to cleanup shard assignment: {e}")
                return False
                
        except Exception as e:
            logger.warning(f"Error cleaning up shard assignment: {e}")
            return False
    
    async def get_cluster_status(self, cluster_name: str) -> List[Dict[str, Any]]:
        """
        Get status of all shards in a cluster
        
        Args:
            cluster_name: Name of the cluster to query
            
        Returns:
            List of shard assignment dictionaries
        """
        try:
            client = self._supabase.init_supabase_client()
            
            result = (
                client.schema('tracker')
                .table('cluster_management')
                .select('*')
                .eq('cluster_name', cluster_name)
                .eq('status', 'active')
                .order('shard_id', desc=False)
                .execute()
            )
            
            if hasattr(result, 'error') and result.error:
                logger.error(f"Failed to get cluster status: {result.error}")
                return []
            
            return result.data if result.data else []
            
        except Exception as e:
            logger.error(f"Error getting cluster status: {e}")
            return []

# Global tracker manager instance
tracker_manager = TrackerManager()