from __future__ import annotations

from enum import Enum
from typing import Optional, Dict, Any
from pydantic import BaseModel, Field
import discord


class StatusState(Enum):
    """Bot status state enumeration with emoji, color, image URL, and display name"""
    OFFLINE = ("🔴", discord.Color.red(), "https://octodex.github.com/images/deckfailcat.png", "Offline")
    PENDING = ("🟡", discord.Color.orange(), "https://octodex.github.com/images/octobiwan.jpg", "Pending")
    STARTING = ("🟡", discord.Color.orange(), "https://octodex.github.com/images/dunetocat.png", "Starting...")
    STOPPING = ("🟠", discord.Color.orange(), "https://octodex.github.com/images/dunetocat.png", "Stopping...")
    ONLINE = ("🟢", discord.Color.green(), "https://octodex.github.com/images/megacat-2.png", "Online & Ready")
    GREEN = ("🟢", discord.Color.green(), "https://octodex.github.com/images/megacat-2.png", "Online & Ready")
    INITIALIZING = ("🟡", discord.Color.yellow(), "https://octodex.github.com/images/universetocat.png", "Initializing")
    ERROR = ("⚠️", discord.Color.dark_red(), "https://octodex.github.com/images/dunetocat.png", "Error")
    UNKNOWN = ("❓", discord.Color.greyple(), "https://octodex.github.com/images/dunetocat.png", "Unknown")

    def __init__(self, emoji: str, color: discord.Color, image_url: str, display_name: str):
        self.emoji = emoji
        self.color = color
        self.image_url = image_url
        self.display_name = display_name


class BotStatusModel(BaseModel):
    """Pydantic model for bot status management with health metrics"""
    
    # Bot status fields
    state: StatusState = Field(default=StatusState.UNKNOWN, description="Current bot status state")
    initialized: bool = Field(default=False, description="Whether bot is initialized")
    is_ready: bool = Field(default=False, description="Whether bot is ready")
    is_starting: bool = Field(default=False, description="Whether bot is currently starting")
    is_stopping: bool = Field(default=False, description="Whether bot is currently stopping")
    is_closed: bool = Field(default=True, description="Whether bot connection is closed")
    guild_count: int = Field(default=0, description="Number of guilds bot is connected to")
    shard_count: int = Field(default=0, description="Number of shards in use")
    current_shard: Optional[int] = Field(default=None, description="Current shard ID for manual sharding")
    shard_info: Dict[str, Any] = Field(default_factory=dict, description="Per-shard information")
    custom_message: Optional[str] = Field(default=None, description="Custom status message")
    
    # Health metrics fields
    memory_usage_mb: float = Field(default=0.0, description="Memory usage in MB")
    memory_percent: float = Field(default=0.0, description="Memory usage as percentage")
    cpu_percent: float = Field(default=0.0, description="CPU usage percentage")
    uptime_seconds: int = Field(default=0, description="Process uptime in seconds")
    uptime_formatted: str = Field(default="0:00:00", description="Formatted uptime string")
    thread_count: int = Field(default=0, description="Number of threads")
    system_memory_total_gb: float = Field(default=0.0, description="Total system memory in GB")
    system_memory_used_percent: float = Field(default=0.0, description="System memory usage percentage")
    health_status: str = Field(default="UNKNOWN", description="Overall health status")
    pid: int = Field(default=0, description="Process ID")
    
    @classmethod
    def from_status_dict(cls, status_dict: dict, health_data: Optional[dict] = None) -> 'BotStatusModel':
        """Create BotStatusModel from status dictionary with optional health data"""
        # Determine state based on status flags
        if status_dict.get('is_starting', False):
            state = StatusState.STARTING
        elif status_dict.get('is_stopping', False):
            state = StatusState.STOPPING
        elif status_dict.get('is_ready', False):
            state = StatusState.ONLINE
        elif status_dict.get('initialized', False) and not status_dict.get('is_closed', True):
            state = StatusState.INITIALIZING
        elif not status_dict.get('initialized', False) or status_dict.get('is_closed', True):
            state = StatusState.OFFLINE
        else:
            state = StatusState.UNKNOWN
        
        # Base model data
        model_data = {
            'state': state,
            'initialized': status_dict.get('initialized', False),
            'is_ready': status_dict.get('is_ready', False),
            'is_starting': status_dict.get('is_starting', False),
            'is_stopping': status_dict.get('is_stopping', False),
            'is_closed': status_dict.get('is_closed', True),
            'guild_count': status_dict.get('guild_count', 0),
            'shard_count': status_dict.get('shard_count', 0),
            'current_shard': status_dict.get('current_shard'),
            'shard_info': status_dict.get('shard_info', {}),
            'custom_message': status_dict.get('custom_message')
        }
        
        # Add health data if provided
        if health_data:
            memory_info = health_data.get('memory', {})
            cpu_info = health_data.get('cpu', {})
            process_info = health_data.get('process', {})
            
            model_data.update({
                'memory_usage_mb': memory_info.get('process_memory_mb', 0.0),
                'memory_percent': memory_info.get('process_memory_percent', 0.0),
                'cpu_percent': cpu_info.get('process_cpu_percent', 0.0),
                'uptime_seconds': process_info.get('uptime_seconds', 0),
                'uptime_formatted': process_info.get('uptime_formatted', '0:00:00'),
                'thread_count': process_info.get('thread_count', 0),
                'system_memory_total_gb': memory_info.get('system_memory_total_gb', 0.0),
                'system_memory_used_percent': memory_info.get('system_memory_used_percent', 0.0),
                'health_status': health_data.get('health_status', 'UNKNOWN'),
                'pid': process_info.get('pid', 0)
            })
            
        return cls(**model_data)
    
    def get_status_description(self) -> str:
        """Get detailed status description"""
        if self.custom_message:
            return self.custom_message
        return self.state.display_name
    
    def get_emoji(self) -> str:
        """Get emoji for current state"""
        return self.state.emoji
    
    def get_color(self) -> discord.Color:
        """Get Discord color for current state"""
        return self.state.color
    
    def get_image_url(self) -> str:
        """Get image URL for current state"""
        return self.state.image_url
    
    def get_health_based_color(self) -> discord.Color:
        """Get color based on health status, overriding normal state color if unhealthy"""
        if self.health_status == "CRITICAL":
            return discord.Color.red()
        elif self.health_status == "WARNING":
            return discord.Color.orange()
        elif self.health_status == "HEALTHY":
            return self.state.color
        else:
            return self.state.color
    
    def get_memory_bar(self, width: int = 10) -> str:
        """Get a visual memory usage bar"""
        if self.memory_percent <= 0:
            return "▱" * width
        
        filled = int((self.memory_percent / 100) * width)
        filled = min(filled, width)
        
        # Choose bar character based on usage level
        if self.memory_percent > 90:
            bar_char = "🟥"
        elif self.memory_percent > 70:
            bar_char = "🟧"
        else:
            bar_char = "🟩"
            
        empty_char = "⬜"
        
        return bar_char * filled + empty_char * (width - filled)
    
    model_config = {
        "json_encoders": {
            discord.Color: lambda v: v.value
        }
    }