using Unity.Burst;
using Unity.Collections;
using Unity.Entities;
using Unity.Jobs;
using Unity.Mathematics;
using Unity.Transforms;

namespace KBVE.MMExtensions.Orchestrator.DOTS.Systems
{
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    [UpdateBefore(typeof(ZombieMovementSystem))]
    public partial class FlowFieldGenerationSystem : SystemBase
    {
        private EntityQuery _flowFieldRequestQuery;
        private NativeHashMap<int, Entity> _sectorFlowFieldCache;
        private NativeQueue<FlowFieldRequest> _pendingRequests;

        protected override void OnCreate()
        {
            _flowFieldRequestQuery = GetEntityQuery(typeof(FlowFieldRequest));
            _sectorFlowFieldCache = new NativeHashMap<int, Entity>(100, Allocator.Persistent);
            _pendingRequests = new NativeQueue<FlowFieldRequest>(Allocator.Persistent);
        }

        protected override void OnDestroy()
        {
            if (_sectorFlowFieldCache.IsCreated) _sectorFlowFieldCache.Dispose();
            if (_pendingRequests.IsCreated) _pendingRequests.Dispose();
        }

        protected override void OnUpdate()
        {
            var ecb = new EntityCommandBuffer(Allocator.TempJob);
            var currentTime = (float)SystemAPI.Time.ElapsedTime;

            if (!SystemAPI.TryGetSingleton<PathfindingConfig>(out var config))
            {
                config = PathfindingConfig.Default;
            }

            var requests = _flowFieldRequestQuery.ToComponentDataArray<FlowFieldRequest>(Allocator.Temp);
            foreach (var request in requests)
            {
                if (request.generateImmediate)
                {
                    GenerateFlowFieldImmediate(request, ecb, currentTime);
                }
                else
                {
                    _pendingRequests.Enqueue(request);
                }
            }
            requests.Dispose();

            int processCount = math.min(5, _pendingRequests.Count);
            for (int i = 0; i < processCount; i++)
            {
                if (_pendingRequests.TryDequeue(out var request))
                {
                    GenerateFlowFieldJob(request, ecb, currentTime);
                }
            }

            EvictOldFlowFields(currentTime, config.cacheEvictionTime, ecb);

            ecb.Playback(EntityManager);
            ecb.Dispose();
        }

        private void GenerateFlowFieldImmediate(FlowFieldRequest request, EntityCommandBuffer ecb, float currentTime)
        {
            int cacheKey = GetCacheKey(request.sectorIndex, request.targetCell);

            if (_sectorFlowFieldCache.TryGetValue(cacheKey, out Entity cachedEntity))
            {
                if (EntityManager.HasComponent<FlowFieldCache>(cachedEntity))
                {
                    var cache = EntityManager.GetComponentData<FlowFieldCache>(cachedEntity);
                    cache.lastAccessTime = currentTime;
                    cache.accessCount++;
                    EntityManager.SetComponentData(cachedEntity, cache);

                    SystemAPI.GetSingleton<PathfindingStats>().RecordCacheHit();
                    return;
                }
            }

            var flowFieldEntity = ecb.CreateEntity();
            var flowField = new FlowFieldCache
            {
                sectorIndex = request.sectorIndex,
                targetCell = request.targetCell,
                lastAccessTime = currentTime,
                accessCount = 1
            };
            ecb.AddComponent(flowFieldEntity, flowField);

            var buffer = ecb.AddBuffer<FlowFieldDirection>(flowFieldEntity);
            GenerateFlowField(request.sectorIndex, request.targetCell, ref buffer);

            _sectorFlowFieldCache[cacheKey] = flowFieldEntity;
        }

        private void GenerateFlowFieldJob(FlowFieldRequest request, EntityCommandBuffer ecb, float currentTime)
        {
            // For now, just call immediate generation for all requests
            // TODO: Implement proper job-based generation if needed for performance
            GenerateFlowFieldImmediate(request, ecb, currentTime);
        }

        private void GenerateFlowField(int sectorIndex, int2 targetCell, ref DynamicBuffer<FlowFieldDirection> buffer)
        {
            int gridSize = 50;
            buffer.ResizeUninitialized(gridSize * gridSize);

            var costs = new NativeArray<float>(gridSize * gridSize, Allocator.Temp);
            var toProcess = new NativeQueue<int2>(Allocator.Temp);

            for (int i = 0; i < costs.Length; i++)
            {
                costs[i] = float.MaxValue;
                buffer[i] = new FlowFieldDirection { direction = 0 };
            }

            int targetIndex = targetCell.y * gridSize + targetCell.x;
            costs[targetIndex] = 0;
            toProcess.Enqueue(targetCell);

            while (toProcess.Count > 0)
            {
                var current = toProcess.Dequeue();
                ProcessCell(current, gridSize, costs, buffer, toProcess);
            }

            costs.Dispose();
            toProcess.Dispose();
        }

        private void ProcessCell(int2 current, int gridSize, NativeArray<float> costs,
                                 DynamicBuffer<FlowFieldDirection> buffer, NativeQueue<int2> toProcess)
        {
            int currentIndex = current.y * gridSize + current.x;
            float currentCost = costs[currentIndex];

            for (int dx = -1; dx <= 1; dx++)
            {
                for (int dy = -1; dy <= 1; dy++)
                {
                    if (dx == 0 && dy == 0) continue;

                    int2 neighbor = current + new int2(dx, dy);
                    if (neighbor.x < 0 || neighbor.x >= gridSize ||
                        neighbor.y < 0 || neighbor.y >= gridSize)
                        continue;

                    int neighborIndex = neighbor.y * gridSize + neighbor.x;
                    float moveCost = (dx != 0 && dy != 0) ? 1.414f : 1f;
                    float newCost = currentCost + moveCost;

                    if (newCost < costs[neighborIndex])
                    {
                        costs[neighborIndex] = newCost;
                        toProcess.Enqueue(neighbor);

                        float3 direction = math.normalize(new float3(-dx, -dy, 0));
                        buffer[neighborIndex] = new FlowFieldDirection
                        {
                            direction = FlowFieldDirection.EncodeDirection(direction)
                        };
                    }
                }
            }
        }

        private void EvictOldFlowFields(float currentTime, float evictionTime, EntityCommandBuffer ecb)
        {
            var entitiesToRemove = new NativeList<int>(Allocator.Temp);

            foreach (var kvp in _sectorFlowFieldCache)
            {
                if (EntityManager.Exists(kvp.Value) && EntityManager.HasComponent<FlowFieldCache>(kvp.Value))
                {
                    var cache = EntityManager.GetComponentData<FlowFieldCache>(kvp.Value);
                    if (currentTime - cache.lastAccessTime > evictionTime)
                    {
                        ecb.DestroyEntity(kvp.Value);
                        entitiesToRemove.Add(kvp.Key);
                    }
                }
            }

            for (int i = 0; i < entitiesToRemove.Length; i++)
            {
                _sectorFlowFieldCache.Remove(entitiesToRemove[i]);
            }

            entitiesToRemove.Dispose();
        }

        private int GetCacheKey(int sectorIndex, int2 targetCell)
        {
            return (sectorIndex << 16) | (targetCell.y << 8) | targetCell.x;
        }
    }
}