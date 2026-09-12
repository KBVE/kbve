using Unity.Collections;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>Owns the <see cref="CharacterOrchestratorSingleton"/> lifecycle. Allocates the registry containers in <see cref="OnCreate"/>, prunes stale entries each tick (entity destroyed mid-session = drop it from Active + History), disposes containers in <see cref="OnDestroy"/>. Stays in <see cref="InitializationSystemGroup"/> so possess writes from <see cref="PossessSystem"/> in <see cref="BehaviorSystemGroup"/> see a clean registry every frame.</summary>
    [WorldSystemFilter(WorldSystemFilterFlags.LocalSimulation | WorldSystemFilterFlags.ClientSimulation | WorldSystemFilterFlags.ThinClientSimulation)]
    [UpdateInGroup(typeof(InitializationSystemGroup))]
    public partial struct CharacterOrchestratorDomainSystem : ISystem
    {
        const int PruneCadenceFrames = 30;

        EntityQuery _controlledQuery;
        int _frameCounter;

        public void OnCreate(ref SystemState state)
        {
            var reg = new CharacterOrchestratorSingleton
            {
                Active  = new NativeHashMap<byte, Entity>(8, Allocator.Persistent),
                History = new NativeList<HistoryEntry>(CharacterOrchestratorSingleton.HistoryCap, Allocator.Persistent),
            };
            var singleton = state.EntityManager.CreateEntity(typeof(CharacterOrchestratorSingleton));
            state.EntityManager.SetName(singleton, "CharacterOrchestrator");
            state.EntityManager.SetComponentData(singleton, reg);

            _controlledQuery = new EntityQueryBuilder(Allocator.Temp)
                .WithAll<ControlledUnitTag>()
                .Build(ref state);
        }

        public void OnUpdate(ref SystemState state)
        {

            _frameCounter++;
            bool prune = _frameCounter >= PruneCadenceFrames;

            ref var reg = ref SystemAPI.GetSingletonRW<CharacterOrchestratorSingleton>().ValueRW;
            if (!reg.Active.IsCreated) return;

            if (!reg.Active.ContainsKey(ControllerId.Local))
            {
                using var arr = _controlledQuery.ToEntityArray(Allocator.Temp);
                if (arr.Length > 0) reg.Active[ControllerId.Local] = arr[0];
            }

            if (!prune) return;
            _frameCounter = 0;

            var em = state.EntityManager;

            using (var keys = reg.Active.GetKeyArray(Allocator.Temp))
            {
                for (int i = 0; i < keys.Length; i++)
                {
                    var key = keys[i];
                    var ent = reg.Active[key];
                    if (!em.Exists(ent) || !em.HasComponent<ControlledUnitTag>(ent))
                        reg.Active.Remove(key);
                }
            }

            for (int i = reg.History.Length - 1; i >= 0; i--)
            {
                if (!em.Exists(reg.History[i].Entity))
                    reg.History.RemoveAt(i);
            }
        }

        public void OnDestroy(ref SystemState state)
        {
            if (!SystemAPI.HasSingleton<CharacterOrchestratorSingleton>()) return;
            var reg = SystemAPI.GetSingleton<CharacterOrchestratorSingleton>();
            if (reg.Active.IsCreated)  reg.Active.Dispose();
            if (reg.History.IsCreated) reg.History.Dispose();
        }
    }

    /// <summary>Static helper API for the character-orchestrator registry. All call sites (click router, camera, HUD, save-slot service, Possess system) route through here so the registry contract has one entry point — no raw container access. Entity validity is the caller's responsibility on the way in; the domain system prunes destroyed entities each tick on the way out. Caches the resolved singleton entity in a static field so repeat calls (camera tick, highlight pulse, click router) skip the per-call <c>CreateEntityQuery</c> allocation; the cache self-invalidates if the entity ever fails the existence check (e.g. world reset / multi-world swap).</summary>
        public static class CharacterOrchestrator
    {
        static Entity _cachedSingleton = Entity.Null;

        /// <summary>Cached singleton lookup. Re-finds via <c>CreateEntityQuery</c> only when the cached entity is null, dead, or living in a different world. <see cref="Possess"/> + co. write-back through this so the same path serves reads and writes.</summary>
        static bool TryGetRegistry(EntityManager em, out Entity singleton, out CharacterOrchestratorSingleton reg)
        {
            if (_cachedSingleton != Entity.Null
                && em.Exists(_cachedSingleton)
                && em.HasComponent<CharacterOrchestratorSingleton>(_cachedSingleton))
            {
                singleton = _cachedSingleton;
                reg = em.GetComponentData<CharacterOrchestratorSingleton>(singleton);
                return true;
            }

            using var q = em.CreateEntityQuery(ComponentType.ReadOnly<CharacterOrchestratorSingleton>());
            if (q.CalculateEntityCount() == 0)
            {
                _cachedSingleton = Entity.Null;
                singleton = Entity.Null;
                reg = default;
                return false;
            }
            singleton = q.GetSingletonEntity();
            _cachedSingleton = singleton;
            reg = em.GetComponentData<CharacterOrchestratorSingleton>(singleton);
            return true;
        }

        /// <summary>Adopt <paramref name="entity"/> as the currently-controlled unit for <paramref name="controllerId"/>. Drops the previous holder's <see cref="ControlledUnitTag"/> + clears its Order goal, pushes the previous unit onto the swap-back history, then tags the new unit. Idempotent — calling with the already-controlled entity is a no-op.</summary>
        public static void Possess(EntityManager em, byte controllerId, Entity entity)
        {
            if (entity == Entity.Null || !em.Exists(entity)) return;
            if (!TryGetRegistry(em, out var singleton, out var reg)) return;

            if (reg.Active.TryGetValue(controllerId, out var prev) && prev == entity) return;

            if (prev != Entity.Null && em.Exists(prev))
            {
                if (em.HasComponent<ControlledUnitTag>(prev))
                    em.RemoveComponent<ControlledUnitTag>(prev);

                if (em.HasComponent<MovementGoal>(prev))
                {
                    var g = em.GetComponentData<MovementGoal>(prev);
                    if (g.Priority == GoalPriority.Order)
                        em.SetComponentData(prev, default(MovementGoal));
                }

                PushHistory(ref reg, controllerId, prev);
            }

            if (!em.HasComponent<ControlledUnitTag>(entity))
                em.AddComponent<ControlledUnitTag>(entity);

            reg.Active[controllerId] = entity;
            em.SetComponentData(singleton, reg);
        }

        /// <summary>Drops the active possession for <paramref name="controllerId"/>. Removes <see cref="ControlledUnitTag"/> from the held unit and pushes it onto history so a SwapBack can restore. No-op if no possession exists.</summary>
        public static void Release(EntityManager em, byte controllerId)
        {
            if (!TryGetRegistry(em, out var singleton, out var reg)) return;
            if (!reg.Active.TryGetValue(controllerId, out var prev)) return;

            if (em.Exists(prev) && em.HasComponent<ControlledUnitTag>(prev))
                em.RemoveComponent<ControlledUnitTag>(prev);

            PushHistory(ref reg, controllerId, prev);
            reg.Active.Remove(controllerId);
            em.SetComponentData(singleton, reg);
        }

        /// <summary>Pop the most-recent history entry for <paramref name="controllerId"/> and possess it. Returns false if history is empty or the popped entity no longer exists.</summary>
        public static bool SwapBack(EntityManager em, byte controllerId)
        {
            if (!TryGetRegistry(em, out var singleton, out var reg)) return false;

            for (int i = reg.History.Length - 1; i >= 0; i--)
            {
                var h = reg.History[i];
                if (h.ControllerId != controllerId) continue;
                reg.History.RemoveAt(i);
                em.SetComponentData(singleton, reg);
                if (!em.Exists(h.Entity)) return false;
                Possess(em, controllerId, h.Entity);
                return true;
            }
            return false;
        }

        /// <summary>Currently-possessed entity for <paramref name="controllerId"/>, or <see cref="Entity.Null"/> if no possession is active.</summary>
        public static Entity Current(EntityManager em, byte controllerId = ControllerId.Local)
        {
            if (!TryGetRegistry(em, out _, out var reg)) return Entity.Null;
            return reg.Active.TryGetValue(controllerId, out var e) ? e : Entity.Null;
        }

        static void PushHistory(ref CharacterOrchestratorSingleton reg, byte controllerId, Entity entity)
        {
            if (entity == Entity.Null) return;

            for (int i = reg.History.Length - 1; i >= 0; i--)
            {
                if (reg.History[i].ControllerId == controllerId && reg.History[i].Entity == entity)
                    reg.History.RemoveAt(i);
            }

            reg.History.Add(new HistoryEntry { ControllerId = controllerId, Entity = entity });

            int controllerCount = 0;
            for (int i = reg.History.Length - 1; i >= 0; i--)
            {
                if (reg.History[i].ControllerId != controllerId) continue;
                controllerCount++;
                if (controllerCount > CharacterOrchestratorSingleton.HistoryCap)
                    reg.History.RemoveAt(i);
            }
        }
    }
}
