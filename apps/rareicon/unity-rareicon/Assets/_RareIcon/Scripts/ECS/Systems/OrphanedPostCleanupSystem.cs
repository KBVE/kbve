using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Strips orphaned <see cref="GarrisonPost"/> + <see cref="BanditHome"/> off units when the building they were tied to gets destroyed. Without this pass, garrisoned soldiers freeze on the (now empty) tile and bandit laborers chore-loop toward a dead camp — both look like "stuck" units. Fires a Capital-fall toast when the player's seat is the destroyed building. Reads the prior-frame <c>BuildingDestroyedReadBuffer</c> swapped into place by <see cref="CombatDomainSystem"/>; runs in BehaviorSystemGroup after that swap so the destroyed records are guaranteed visible.</summary>
    [WorldSystemFilter(WorldSystemFilterFlags.LocalSimulation | WorldSystemFilterFlags.ClientSimulation | WorldSystemFilterFlags.ThinClientSimulation)]
    [UpdateInGroup(typeof(BehaviorSystemGroup))]
    [UpdateAfter(typeof(CombatDomainSystem))]
    public partial struct OrphanedPostCleanupSystem : ISystem
    {
        public void OnCreate(ref SystemState state)
        {
            state.RequireForUpdate<CombatDBSingleton>();
        }

        public void OnDestroy(ref SystemState state) { }

        public void OnUpdate(ref SystemState state)
        {
            var db = SystemAPI.GetSingleton<CombatDBSingleton>();
            if (!db.BuildingDestroyedReadBuffer.IsCreated) return;
            int destroyedCount = db.BuildingDestroyedReadBuffer.Length;
            if (destroyedCount == 0) return;

            var destroyedHexes  = new NativeHashSet<int2>(destroyedCount * 7, Allocator.TempJob);
            var destroyedEnts   = new NativeHashSet<Entity>(destroyedCount, Allocator.TempJob);
            bool capitalFell    = false;

            for (int i = 0; i < destroyedCount; i++)
            {
                var rec = db.BuildingDestroyedReadBuffer[i];
                destroyedEnts.Add(rec.Entity);
                destroyedHexes.Add(rec.RootHex);
                if (rec.BuildingType == BuildingType.Capital)
                {
                    capitalFell = true;
                    destroyedHexes.Add(rec.RootHex + new int2( 1,  0));
                    destroyedHexes.Add(rec.RootHex + new int2(-1,  0));
                    destroyedHexes.Add(rec.RootHex + new int2( 0,  1));
                    destroyedHexes.Add(rec.RootHex + new int2( 0, -1));
                    destroyedHexes.Add(rec.RootHex + new int2( 1, -1));
                    destroyedHexes.Add(rec.RootHex + new int2(-1,  1));
                }
            }

            var ecb = SystemAPI.GetSingleton<EndSimulationEntityCommandBufferSystem.Singleton>()
                               .CreateCommandBuffer(state.WorldUnmanaged).AsParallelWriter();

            state.Dependency = new GarrisonOrphanJob
            {
                DestroyedHexes = destroyedHexes,
                Ecb            = ecb,
            }.ScheduleParallel(state.Dependency);

            state.Dependency = new BanditHomeOrphanJob
            {
                DestroyedEnts = destroyedEnts,
                Ecb           = ecb,
            }.ScheduleParallel(state.Dependency);

            if (capitalFell)
            {

                var mainEcb = SystemAPI.GetSingleton<EndSimulationEntityCommandBufferSystem.Singleton>()
                                       .CreateCommandBuffer(state.WorldUnmanaged);

                var toastCarrier = mainEcb.CreateEntity();
                mainEcb.AddComponent(toastCarrier, new PendingToast
                {
                    Kind = (byte)ToastKind.Error,
                    Text = "The Capital has fallen — the run ends here.",
                });

                var signalCarrier = mainEcb.CreateEntity();
                mainEcb.AddComponent<GameOverSignal>(signalCarrier);
            }

            state.Dependency = destroyedHexes.Dispose(state.Dependency);
            state.Dependency = destroyedEnts.Dispose(state.Dependency);
        }
    }

    [BurstCompile]
    public partial struct GarrisonOrphanJob : IJobEntity
    {
        [Unity.Collections.ReadOnly] public NativeHashSet<int2> DestroyedHexes;
        public EntityCommandBuffer.ParallelWriter Ecb;

        void Execute(Entity entity, [ChunkIndexInQuery] int chunkIdx, in GarrisonPost post)
        {
            if (!DestroyedHexes.Contains(post.Hex)) return;
            Ecb.RemoveComponent<GarrisonPost>(chunkIdx, entity);
        }
    }

    [BurstCompile]
    public partial struct BanditHomeOrphanJob : IJobEntity
    {
        [Unity.Collections.ReadOnly] public NativeHashSet<Entity> DestroyedEnts;
        public EntityCommandBuffer.ParallelWriter Ecb;

        void Execute(Entity entity, [ChunkIndexInQuery] int chunkIdx, in BanditHome home)
        {
            if (!DestroyedEnts.Contains(home.Camp)) return;
            Ecb.RemoveComponent<BanditHome>(chunkIdx, entity);
            Ecb.RemoveComponent<BanditChore>(chunkIdx, entity);
        }
    }
}
