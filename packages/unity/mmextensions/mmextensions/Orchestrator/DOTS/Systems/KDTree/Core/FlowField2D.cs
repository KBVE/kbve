using System;
using Unity.Collections;
using Unity.Mathematics;
using Unity.Entities;
using Unity.Burst;
using Unity.Jobs;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    /// <summary>
    /// Cell data for 2D flow field pathfinding
    /// </summary>
    public struct FlowFieldCell
    {
        public float2 FlowDirection;    // Normalized direction vector
        public float Cost;              // Movement cost (0 = blocked, 1+ = passable)
        public float DistanceToGoal;    // Distance to goal for pathfinding
        public bool IsBlocked;          // Whether this cell is passable

        public static FlowFieldCell Blocked => new FlowFieldCell
        {
            Cost = 0,
            IsBlocked = true,
            FlowDirection = float2.zero,
            DistanceToGoal = float.MaxValue
        };

        public static FlowFieldCell Empty => new FlowFieldCell
        {
            Cost = 1,
            IsBlocked = false,
            FlowDirection = float2.zero,
            DistanceToGoal = float.MaxValue
        };
    }

    /// <summary>
    /// 2D Flow Field for efficient pathfinding in grid-based environments.
    /// Perfect for RTS-style games with multiple units moving to the same destination.
    /// </summary>
    [BurstCompile]
    public struct FlowField2D : IDisposable
    {
        private NativeArray<FlowFieldCell> _cells;
        private int2 _gridSize;
        private float2 _worldSize;
        private float2 _worldOrigin;
        private float _cellSize;
        private bool _isCreated;

        public FlowField2D(int2 gridSize, float2 worldSize, float2 worldOrigin, Allocator allocator = Allocator.Persistent)
        {
            _gridSize = gridSize;
            _worldSize = worldSize;
            _worldOrigin = worldOrigin;
            _cellSize = math.min(worldSize.x / gridSize.x, worldSize.y / gridSize.y);
            _isCreated = true;

            var totalCells = gridSize.x * gridSize.y;
            _cells = new NativeArray<FlowFieldCell>(totalCells, allocator);

            // Initialize with empty cells
            for (int i = 0; i < totalCells; i++)
            {
                _cells[i] = FlowFieldCell.Empty;
            }
        }

        public bool IsCreated => _isCreated;
        public int2 GridSize => _gridSize;
        public float CellSize => _cellSize;
        public float2 WorldSize => _worldSize;
        public float2 WorldOrigin => _worldOrigin;

        /// <summary>
        /// Convert world position to grid coordinates
        /// </summary>
        public int2 WorldToGrid(float2 worldPos)
        {
            var localPos = worldPos - _worldOrigin;
            return new int2(
                (int)(localPos.x / _cellSize),
                (int)(localPos.y / _cellSize)
            );
        }

        /// <summary>
        /// Convert grid coordinates to world position (center of cell)
        /// </summary>
        public float2 GridToWorld(int2 gridPos)
        {
            return _worldOrigin + new float2(
                (gridPos.x + 0.5f) * _cellSize,
                (gridPos.y + 0.5f) * _cellSize
            );
        }

        /// <summary>
        /// Check if grid coordinates are valid
        /// </summary>
        public bool IsValidGridPos(int2 gridPos)
        {
            return gridPos.x >= 0 && gridPos.x < _gridSize.x &&
                   gridPos.y >= 0 && gridPos.y < _gridSize.y;
        }

        /// <summary>
        /// Get cell index from grid coordinates
        /// </summary>
        public int GetCellIndex(int2 gridPos)
        {
            return gridPos.y * _gridSize.x + gridPos.x;
        }

        /// <summary>
        /// Get grid coordinates from cell index
        /// </summary>
        public int2 GetGridPos(int index)
        {
            return new int2(index % _gridSize.x, index / _gridSize.x);
        }

        /// <summary>
        /// Set a cell as blocked or unblocked
        /// </summary>
        public void SetCell(int2 gridPos, bool isBlocked, float cost = 1f)
        {
            if (!IsValidGridPos(gridPos)) return;

            var index = GetCellIndex(gridPos);
            var cell = _cells[index];
            cell.IsBlocked = isBlocked;
            cell.Cost = isBlocked ? 0 : cost;
            if (isBlocked)
            {
                cell.FlowDirection = float2.zero;
                cell.DistanceToGoal = float.MaxValue;
            }
            _cells[index] = cell;
        }

        /// <summary>
        /// Set multiple cells as blocked (useful for placing structures)
        /// </summary>
        public void SetCellsBlocked(int2 startGrid, int2 endGrid, bool isBlocked)
        {
            var min = math.min(startGrid, endGrid);
            var max = math.max(startGrid, endGrid);

            for (int y = min.y; y <= max.y; y++)
            {
                for (int x = min.x; x <= max.x; x++)
                {
                    SetCell(new int2(x, y), isBlocked);
                }
            }
        }

        /// <summary>
        /// Get cell data at grid position
        /// </summary>
        public FlowFieldCell GetCell(int2 gridPos)
        {
            if (!IsValidGridPos(gridPos)) return FlowFieldCell.Blocked;
            return _cells[GetCellIndex(gridPos)];
        }

        /// <summary>
        /// Generate flow field towards a goal position using Dijkstra's algorithm
        /// </summary>
        public void GenerateFlowField(float2 goalWorldPos)
        {
            var goalGrid = WorldToGrid(goalWorldPos);
            if (!IsValidGridPos(goalGrid)) return;

            // Reset all distances
            for (int i = 0; i < _cells.Length; i++)
            {
                var cell = _cells[i];
                cell.DistanceToGoal = float.MaxValue;
                cell.FlowDirection = float2.zero;
                _cells[i] = cell;
            }

            // Use priority queue for Dijkstra's algorithm
            var openSet = new NativePriorityHeap<GridDistance>(1024, Allocator.Temp);
            var visited = new NativeArray<bool>(_cells.Length, Allocator.Temp);

            // Start with goal
            var goalIndex = GetCellIndex(goalGrid);
            var goalCell = _cells[goalIndex];
            goalCell.DistanceToGoal = 0;
            _cells[goalIndex] = goalCell;

            openSet.Push(new GridDistance { GridPos = goalGrid, Distance = 0 });

            while (!openSet.IsEmpty)
            {
                var current = openSet.Pop();
                var currentIndex = GetCellIndex(current.GridPos);

                if (visited[currentIndex]) continue;
                visited[currentIndex] = true;

                // Check all 8 neighbors (including diagonals)
                for (int dy = -1; dy <= 1; dy++)
                {
                    for (int dx = -1; dx <= 1; dx++)
                    {
                        if (dx == 0 && dy == 0) continue;

                        var neighborPos = current.GridPos + new int2(dx, dy);
                        if (!IsValidGridPos(neighborPos)) continue;

                        var neighborIndex = GetCellIndex(neighborPos);
                        if (visited[neighborIndex]) continue;

                        var neighborCell = _cells[neighborIndex];
                        if (neighborCell.IsBlocked) continue;

                        // Calculate distance (diagonal movement costs more)
                        var isDiagonal = dx != 0 && dy != 0;
                        var movementCost = isDiagonal ? 1.414f : 1f; // sqrt(2) for diagonal
                        var newDistance = current.Distance + movementCost * neighborCell.Cost;

                        if (newDistance < neighborCell.DistanceToGoal)
                        {
                            neighborCell.DistanceToGoal = newDistance;
                            _cells[neighborIndex] = neighborCell;

                            if (!openSet.IsFull)
                            {
                                openSet.Push(new GridDistance { GridPos = neighborPos, Distance = newDistance });
                            }
                        }
                    }
                }
            }

            // Generate flow directions based on distances
            GenerateFlowDirections();

            openSet.Dispose();
            visited.Dispose();
        }

        /// <summary>
        /// Generate flow directions for each cell based on distance to goal
        /// </summary>
        private void GenerateFlowDirections()
        {
            for (int y = 0; y < _gridSize.y; y++)
            {
                for (int x = 0; x < _gridSize.x; x++)
                {
                    var gridPos = new int2(x, y);
                    var index = GetCellIndex(gridPos);
                    var cell = _cells[index];

                    if (cell.IsBlocked || cell.DistanceToGoal == float.MaxValue)
                        continue;

                    var bestDirection = float2.zero;
                    var bestDistance = cell.DistanceToGoal;

                    // Find neighbor with smallest distance
                    for (int dy = -1; dy <= 1; dy++)
                    {
                        for (int dx = -1; dx <= 1; dx++)
                        {
                            if (dx == 0 && dy == 0) continue;

                            var neighborPos = gridPos + new int2(dx, dy);
                            if (!IsValidGridPos(neighborPos)) continue;

                            var neighborCell = GetCell(neighborPos);
                            if (neighborCell.IsBlocked) continue;

                            if (neighborCell.DistanceToGoal < bestDistance)
                            {
                                bestDistance = neighborCell.DistanceToGoal;
                                bestDirection = math.normalize(new float2(dx, dy));
                            }
                        }
                    }

                    cell.FlowDirection = bestDirection;
                    _cells[index] = cell;
                }
            }
        }

        /// <summary>
        /// Get flow direction at world position
        /// </summary>
        public float2 GetFlowDirection(float2 worldPos)
        {
            var gridPos = WorldToGrid(worldPos);
            var cell = GetCell(gridPos);
            return cell.FlowDirection;
        }

        /// <summary>
        /// Get interpolated flow direction using bilinear interpolation
        /// </summary>
        public float2 GetSmoothFlowDirection(float2 worldPos)
        {
            var localPos = worldPos - _worldOrigin;
            var gridPosF = localPos / _cellSize;
            var gridPos = new int2((int)math.floor(gridPosF.x), (int)math.floor(gridPosF.y));

            // Get fractional part for interpolation
            var frac = gridPosF - gridPos;

            // Sample 4 corner cells
            var flow00 = GetCell(gridPos + new int2(0, 0)).FlowDirection;
            var flow10 = GetCell(gridPos + new int2(1, 0)).FlowDirection;
            var flow01 = GetCell(gridPos + new int2(0, 1)).FlowDirection;
            var flow11 = GetCell(gridPos + new int2(1, 1)).FlowDirection;

            // Bilinear interpolation
            var flow0 = math.lerp(flow00, flow10, frac.x);
            var flow1 = math.lerp(flow01, flow11, frac.x);
            var finalFlow = math.lerp(flow0, flow1, frac.y);

            return math.normalize(finalFlow);
        }

        /// <summary>
        /// Clear all cells and reset to empty state
        /// </summary>
        public void Clear()
        {
            for (int i = 0; i < _cells.Length; i++)
            {
                _cells[i] = FlowFieldCell.Empty;
            }
        }

        /// <summary>
        /// Check if there's a valid path from start to goal
        /// </summary>
        public bool HasPath(float2 startWorldPos, float2 goalWorldPos)
        {
            var startGrid = WorldToGrid(startWorldPos);
            var goalGrid = WorldToGrid(goalWorldPos);

            if (!IsValidGridPos(startGrid) || !IsValidGridPos(goalGrid))
                return false;

            var startCell = GetCell(startGrid);
            var goalCell = GetCell(goalGrid);

            return !startCell.IsBlocked && !goalCell.IsBlocked &&
                   startCell.DistanceToGoal != float.MaxValue;
        }

        public void Dispose()
        {
            if (_isCreated && _cells.IsCreated)
            {
                _cells.Dispose();
                _isCreated = false;
            }
        }

        /// <summary>
        /// Helper struct for Dijkstra's algorithm priority queue
        /// </summary>
        private struct GridDistance : IComparable<GridDistance>
        {
            public int2 GridPos;
            public float Distance;

            public int CompareTo(GridDistance other)
            {
                return Distance.CompareTo(other.Distance);
            }
        }
    }

    /// <summary>
    /// Job for generating flow fields in parallel
    /// </summary>
    [BurstCompile]
    public struct GenerateFlowFieldJob : IJob
    {
        public FlowField2D FlowField;
        public float2 GoalPosition;

        public void Execute()
        {
            FlowField.GenerateFlowField(GoalPosition);
        }
    }
}