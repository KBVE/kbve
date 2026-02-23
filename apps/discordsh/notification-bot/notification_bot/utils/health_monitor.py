from __future__ import annotations

import os
import time
import psutil
import asyncio
from typing import Dict, Any, Optional
from datetime import datetime, timedelta


class HealthMonitor:
    """System and process health monitoring utility using psutil with caching"""

    def __init__(self, cache_duration_seconds: int = 300):  # 5 minutes default
        self._process = psutil.Process(os.getpid())
        self._start_time = time.time()
        self._cache_duration = cache_duration_seconds
        self._cached_health_data: Optional[Dict[str, Any]] = None
        self._last_update_time: float = 0
        self._update_lock = asyncio.Lock()
        self._background_task: Optional[asyncio.Task] = None

    def get_memory_info(self) -> Dict[str, Any]:
        """Get detailed memory information"""
        try:
            # Process memory info
            memory_info = self._process.memory_info()
            memory_percent = self._process.memory_percent()

            # System memory info
            system_memory = psutil.virtual_memory()

            return {
                "process_memory_mb": round(memory_info.rss / 1024 / 1024, 2),
                "process_memory_percent": round(memory_percent, 2),
                "system_memory_total_gb": round(system_memory.total / 1024 / 1024 / 1024, 2),
                "system_memory_available_gb": round(system_memory.available / 1024 / 1024 / 1024, 2),
                "system_memory_used_percent": round(system_memory.percent, 2)
            }
        except Exception as e:
            return {"error": f"Failed to get memory info: {str(e)}"}

    def get_cpu_info(self) -> Dict[str, Any]:
        """Get CPU usage information"""
        try:
            # Process CPU usage (non-blocking - use cached value)
            process_cpu = self._process.cpu_percent(interval=None)

            # System CPU usage (non-blocking - use cached value)
            system_cpu = psutil.cpu_percent(interval=None)
            cpu_count = psutil.cpu_count()

            return {
                "process_cpu_percent": round(process_cpu, 2),
                "system_cpu_percent": round(system_cpu, 2),
                "cpu_count": cpu_count
            }
        except Exception as e:
            return {"error": f"Failed to get CPU info: {str(e)}"}

    def get_process_info(self) -> Dict[str, Any]:
        """Get process-specific information"""
        try:
            # Process info
            pid = self._process.pid
            threads = self._process.num_threads()
            uptime_seconds = int(time.time() - self._start_time)

            # Format uptime
            uptime_delta = timedelta(seconds=uptime_seconds)
            uptime_str = str(uptime_delta)

            return {
                "pid": pid,
                "thread_count": threads,
                "uptime_seconds": uptime_seconds,
                "uptime_formatted": uptime_str
            }
        except Exception as e:
            return {"error": f"Failed to get process info: {str(e)}"}

    def get_health_assessment(self, memory_percent: float, cpu_percent: float) -> str:
        """Assess overall health based on resource usage"""
        # Define thresholds
        if memory_percent > 90 or cpu_percent > 90:
            return "CRITICAL"
        elif memory_percent > 70 or cpu_percent > 70:
            return "WARNING"
        else:
            return "HEALTHY"

    def _is_cache_valid(self) -> bool:
        """Check if cached data is still valid"""
        if self._cached_health_data is None:
            return False
        return (time.time() - self._last_update_time) < self._cache_duration

    def _collect_health_data(self) -> Dict[str, Any]:
        """Collect fresh health data (internal method)"""
        timestamp = datetime.now().isoformat()

        try:
            # Get individual components with fallbacks
            memory_info = self.get_memory_info()
            cpu_info = self.get_cpu_info()
            process_info = self.get_process_info()

            # Handle individual component errors
            if "error" in memory_info:
                memory_info = {
                    "process_memory_mb": 0.0,
                    "process_memory_percent": 0.0,
                    "system_memory_total_gb": 0.0,
                    "system_memory_available_gb": 0.0,
                    "system_memory_used_percent": 0.0
                }

            if "error" in cpu_info:
                cpu_info = {
                    "process_cpu_percent": 0.0,
                    "system_cpu_percent": 0.0,
                    "cpu_count": 1
                }

            if "error" in process_info:
                process_info = {
                    "pid": 0,
                    "thread_count": 0,
                    "uptime_seconds": 0,
                    "uptime_formatted": "0:00:00"
                }

            # Determine health status
            memory_percent = memory_info.get("process_memory_percent", 0)
            cpu_percent = cpu_info.get("process_cpu_percent", 0)
            health_status = self.get_health_assessment(memory_percent, cpu_percent)

            return {
                "timestamp": timestamp,
                "health_status": health_status,
                "memory": memory_info,
                "cpu": cpu_info,
                "process": process_info,
                "cache_age_seconds": 0  # Fresh data
            }
        except Exception as e:
            # Complete fallback if everything fails
            return {
                "timestamp": timestamp,
                "health_status": "ERROR",
                "memory": {
                    "process_memory_mb": 0.0,
                    "process_memory_percent": 0.0,
                    "system_memory_total_gb": 0.0,
                    "system_memory_available_gb": 0.0,
                    "system_memory_used_percent": 0.0
                },
                "cpu": {
                    "process_cpu_percent": 0.0,
                    "system_cpu_percent": 0.0,
                    "cpu_count": 1
                },
                "process": {
                    "pid": 0,
                    "thread_count": 0,
                    "uptime_seconds": 0,
                    "uptime_formatted": "0:00:00"
                },
                "error": f"Health check failed: {str(e)}",
                "cache_age_seconds": 0
            }

    async def start_background_monitoring(self):
        """Start background task to periodically update health data"""
        if self._background_task is not None:
            return  # Already running

        self._background_task = asyncio.create_task(self._background_update_loop())

    async def stop_background_monitoring(self):
        """Stop background monitoring task"""
        if self._background_task is not None:
            self._background_task.cancel()
            try:
                await self._background_task
            except asyncio.CancelledError:
                pass
            self._background_task = None

    async def _background_update_loop(self):
        """Background loop to update health data every cache_duration seconds"""
        while True:
            try:
                await self._update_health_data()
                await asyncio.sleep(self._cache_duration)
            except asyncio.CancelledError:
                break
            except Exception as e:
                import logging
                logging.error(f"Background health monitoring error: {e}")
                await asyncio.sleep(60)  # Wait 1 minute before retrying on error

    async def _update_health_data(self):
        """Update cached health data (thread-safe)"""
        async with self._update_lock:
            # Run the blocking psutil calls in a thread pool
            loop = asyncio.get_event_loop()
            health_data = await loop.run_in_executor(None, self._collect_health_data)

            self._cached_health_data = health_data
            self._last_update_time = time.time()

    def get_comprehensive_health(self) -> Dict[str, Any]:
        """Get comprehensive health report using cached data"""
        # Return cached data if valid
        if self._is_cache_valid():
            cached_data = self._cached_health_data.copy()
            # Update cache age
            cache_age = int(time.time() - self._last_update_time)
            cached_data["cache_age_seconds"] = cache_age
            return cached_data

        # If no valid cache, collect fresh data synchronously (fallback)
        # This should rarely happen if background monitoring is running
        try:
            fresh_data = self._collect_health_data()
            self._cached_health_data = fresh_data
            self._last_update_time = time.time()
            return fresh_data
        except Exception as e:
            # Ultimate fallback
            return {
                "timestamp": datetime.now().isoformat(),
                "health_status": "ERROR",
                "memory": {
                    "process_memory_mb": 0.0,
                    "process_memory_percent": 0.0,
                    "system_memory_total_gb": 0.0,
                    "system_memory_available_gb": 0.0,
                    "system_memory_used_percent": 0.0
                },
                "cpu": {
                    "process_cpu_percent": 0.0,
                    "system_cpu_percent": 0.0,
                    "cpu_count": 1
                },
                "process": {
                    "pid": 0,
                    "thread_count": 0,
                    "uptime_seconds": 0,
                    "uptime_formatted": "0:00:00"
                },
                "error": f"Health monitoring unavailable: {str(e)}",
                "cache_age_seconds": -1
            }

    async def force_refresh(self):
        """Force refresh of health data (useful for manual refresh button)"""
        await self._update_health_data()


# Global health monitor instance
health_monitor = HealthMonitor()
