"""
Health monitoring provider
"""
from dishka import Provider, Scope, provide
from ..utils.health_monitor import HealthMonitor


class HealthProvider(Provider):
    """Optimized provider for health monitoring services"""
    
    @provide(scope=Scope.APP)
    def health_monitor(self) -> HealthMonitor:
        from ..utils.health_monitor import health_monitor
        return health_monitor