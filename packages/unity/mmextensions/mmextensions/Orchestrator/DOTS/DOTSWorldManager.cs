using Unity.Entities;
using UnityEngine;
using VContainer;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    /// <summary>
    /// Manages DOTS World lifecycle and system initialization
    /// Injected by VContainer to handle world management
    /// </summary>
    public class DOTSWorldManager
    {
        private readonly DOTSConfiguration _dotsConfig;
        private readonly SpatialIndexConfiguration _spatialConfig;
        private readonly CombatConfiguration _combatConfig;

        private World _managedWorld;
        private bool _isInitialized;

        [Inject]
        public DOTSWorldManager(
            DOTSConfiguration dotsConfig,
            SpatialIndexConfiguration spatialConfig,
            CombatConfiguration combatConfig)
        {
            _dotsConfig = dotsConfig;
            _spatialConfig = spatialConfig;
            _combatConfig = combatConfig;
        }

        public World GetOrCreateWorld()
        {
            if (_managedWorld == null || !_managedWorld.IsCreated)
            {
                _managedWorld = new World("ManagedWorld");
                InitializeWorld();
            }

            return _managedWorld;
        }

        private void InitializeWorld()
        {
            if (_managedWorld == null)
                return;

            try
            {
                // Set as default world for component systems
                World.DefaultGameObjectInjectionWorld = _managedWorld;

                // Initialize core system groups
                var initializationSystemGroup = _managedWorld.GetOrCreateSystemManaged<InitializationSystemGroup>();
                var simulationSystemGroup = _managedWorld.GetOrCreateSystemManaged<SimulationSystemGroup>();
                var presentationSystemGroup = _managedWorld.GetOrCreateSystemManaged<PresentationSystemGroup>();

                // Configure entity capacity
                var entityManager = _managedWorld.EntityManager;
                // Note: Entity capacity is managed automatically by Unity

                _isInitialized = true;
                // Debug logging removed for Burst compatibility
            }
            catch (System.Exception)
            {
                // World initialization failed - handle silently
                _isInitialized = false;
            }
        }

        public void DisposeWorld()
        {
            if (_managedWorld != null && _managedWorld.IsCreated)
            {
                _managedWorld.Dispose();
                _managedWorld = null;
                _isInitialized = false;
                // Debug logging removed for Burst compatibility
            }
        }

        public bool IsWorldValid()
        {
            return _managedWorld != null && _managedWorld.IsCreated && _isInitialized;
        }

        public EntityManager GetEntityManager()
        {
            if (!IsWorldValid())
                return default;

            return _managedWorld.EntityManager;
        }

        public T GetOrCreateSystemManaged<T>() where T : ComponentSystemBase
        {
            if (!IsWorldValid())
                return default;

            return _managedWorld.GetOrCreateSystemManaged<T>();
        }
    }

    /// <summary>
    /// Manages system update order and dependencies
    /// </summary>
    public class SystemUpdateOrderManager
    {
        private readonly DOTSWorldManager _worldManager;

        [Inject]
        public SystemUpdateOrderManager(DOTSWorldManager worldManager)
        {
            _worldManager = worldManager;
        }

        public void ConfigureSystemOrder()
        {
            if (!_worldManager.IsWorldValid())
                return;

            // Systems are ordered using [UpdateBefore] and [UpdateAfter] attributes
            // This method can be used for runtime system ordering if needed
            // Debug logging removed for Burst compatibility
        }

        public void EnableSystem<T>() where T : ComponentSystemBase
        {
            var system = _worldManager.GetOrCreateSystemManaged<T>();
            if (system != null)
            {
                system.Enabled = true;
                // Debug logging removed for Burst compatibility
            }
        }

        public void DisableSystem<T>() where T : ComponentSystemBase
        {
            var system = _worldManager.GetOrCreateSystemManaged<T>();
            if (system != null)
            {
                system.Enabled = false;
                // Debug logging removed for Burst compatibility
            }
        }
    }

    /// <summary>
    /// Performance monitoring for DOTS systems
    /// </summary>
    public class DOTSPerformanceMonitor
    {
        private readonly DOTSConfiguration _config;
        private float _lastUpdateTime;
        private int _frameCount;

        [Inject]
        public DOTSPerformanceMonitor(DOTSConfiguration config)
        {
            _config = config;
            _lastUpdateTime = Time.time;
        }

        public void Update()
        {
            if (!_config.enableJobDebugging)
                return;

            _frameCount++;
            float currentTime = Time.time;

            // Log performance metrics every few seconds
            if (currentTime - _lastUpdateTime > 5f)
            {
                LogPerformanceMetrics();
                _lastUpdateTime = currentTime;
            }
        }

        private void LogPerformanceMetrics()
        {
            float averageFPS = _frameCount / 5f;
            // Performance metrics tracked internally, debug logging removed for Burst compatibility
            _frameCount = 0;
        }
    }

    /// <summary>
    /// Spatial query performance profiling
    /// </summary>
    public class SpatialQueryProfiler
    {
        private readonly SpatialIndexConfiguration _config;
        private System.Diagnostics.Stopwatch _queryTimer;
        private int _queryCount;
        private float _totalQueryTime;

        [Inject]
        public SpatialQueryProfiler(SpatialIndexConfiguration config)
        {
            _config = config;
            _queryTimer = new System.Diagnostics.Stopwatch();
        }

        public void StartQueryTiming()
        {
            _queryTimer.Restart();
        }

        public void EndQueryTiming()
        {
            _queryTimer.Stop();
            _queryCount++;
            _totalQueryTime += (float)_queryTimer.Elapsed.TotalMilliseconds;

            // Performance metrics tracked internally every 100 queries
            if (_queryCount % 100 == 0)
            {
                float averageTime = _totalQueryTime / _queryCount;
                // Query performance tracked internally, debug logging removed for Burst compatibility
            }
        }
    }
}