using RareIcon.Native;
using Unity.Collections;
using Unity.Entities;
using VContainer;

namespace RareIcon
{
    /// <summary>Tears down a finished run so the title screen sees a clean slate. Called by <see cref="AppStateController.ReturnToMainMenu"/> when leaving World / InTile / GameOver. Stops the Rust-side empire ticker, clears the proto snapshot cache, sweeps gameplay-tagged entities from the ECS world, resets <see cref="WorldGenSession"/>, and bumps <see cref="UnitSpawnSystem.RespawnGeneration"/> so the next world load re-runs the initial spawn pass.
    ///
    /// Singletons owned by domain ECS systems (CombatDB, BuildingsDB, HexDB, LogisticsDB, etc) survive the sweep — those systems re-fill their containers when the next run streams. Static caches (NpcdbCache, ItemDB, ItemDBCache) survive too because they're proto data, not run state.
    /// </summary>
    public sealed class WorldResetService
    {
        readonly WorldGenSession _session;

        [Inject]
        public WorldResetService(WorldGenSession session)
        {
            _session = session;
        }

        public void Reset()
        {
            StopRustEmpireTicker();
            EmpireSnapshotCache.ConsumeIncoming();
            DestroyGameplayEntities();
            WorldGenSession.MarkWorldEnded();
            _session.ResetForNewRun();
            UnitSpawnSystem.RespawnGeneration++;
        }

        static void StopRustEmpireTicker()
        {
            try
            {
                Uniti.uniti_empire_async_stop();
                Uniti.uniti_empire_reset();
            }
            catch
            {

            }
        }

        static void DestroyGameplayEntities()
        {
            var world = GameplayWorld.Resolve();
            if (world == null || !world.IsCreated) return;
            var em = world.EntityManager;

            var desc = new EntityQueryDesc
            {
                Any = new[]
                {
                    ComponentType.ReadOnly<Unit>(),
                    ComponentType.ReadOnly<Building>(),
                    ComponentType.ReadOnly<HexTileTag>(),
                    ComponentType.ReadOnly<BiomeType>(),
                    ComponentType.ReadOnly<PendingToast>(),
                    ComponentType.ReadOnly<GameOverSignal>(),
                    ComponentType.ReadOnly<GroundArrow>(),
                    ComponentType.ReadOnly<DeadTag>(),
                },
            };

            using var query = em.CreateEntityQuery(desc);
            if (query.IsEmpty) return;
            em.DestroyEntity(query);
        }
    }
}
