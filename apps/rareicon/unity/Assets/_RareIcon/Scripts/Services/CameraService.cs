using MessagePipe;
using R3;
using Unity.Entities;
using Unity.Mathematics;
using Unity.Transforms;
using UnityEngine;
using UnityEngine.InputSystem;
using VContainer.Unity;

namespace RareIcon
{
    /// <summary>Camera controller + possession bridge. Free mode: WASD moves the camera. Possession mode (detected by ControlledUnitTag): WASD publishes ControlledUnitMoveMessage against the possessed unit, camera smoothly follows.</summary>
    public class CameraService : ITickable
    {
        public const float MinZoom             = 3f;
        public const float MaxZoom             = 50f;
        public const float ZoomSpeed           = 3f;
        public const float MoveSpeed           = 15f;
        public const float PossessedZoom       = 6f;
        public const float FollowLerpPerSecond = 8f;
        public const float UnitMoveCooldown    = 0.15f;

        Camera _camera;
        Transform _transform;

        readonly ReactiveProperty<float> _zoom = new(12f);
        public ReadOnlyReactiveProperty<float> Zoom => _zoom;

        readonly ReactiveProperty<int2> _hoveredHex = new(new int2(int.MinValue, int.MinValue));
        public ReadOnlyReactiveProperty<int2> HoveredHex => _hoveredHex;

        readonly ReactiveProperty<float2> _worldMousePos = new(float2.zero);
        public ReadOnlyReactiveProperty<float2> WorldMousePos => _worldMousePos;

        Entity _lastControlled = Entity.Null;
        float _nextUnitMoveTime;
        IPublisher<ControlledUnitMoveMessage> _movePublisher;

        public Camera Camera
        {
            get { if (_camera == null) Refresh(); return _camera; }
        }

        public Transform Transform
        {
            get { if (_transform == null) Refresh(); return _transform; }
        }

        public void Refresh()
        {
            _camera = Camera.main;
            _transform = _camera != null ? _camera.transform : null;
            if (_camera != null && _camera.orthographic)
                _camera.orthographicSize = _zoom.Value;
        }

        public void Tick()
        {
            if (_camera == null)
            {
                Refresh();
                if (_camera == null) return;
            }

            var world = World.DefaultGameObjectInjectionWorld;
            Entity controlled = Entity.Null;
            if (world != null && world.IsCreated)
            {
                controlled = CharacterOrchestrator.Current(world.EntityManager, ControllerId.Local);
            }

            if (controlled != _lastControlled)
            {
                if (controlled != Entity.Null && world != null)
                {
                    var em = world.EntityManager;
                    if (em.HasComponent<LocalTransform>(controlled))
                    {
                        var p = em.GetComponentData<LocalTransform>(controlled).Position;
                        JumpTo(new float2(p.x, p.y));
                        SetZoom(PossessedZoom);
                    }
                }
                _lastControlled = controlled;
            }

            if (controlled != Entity.Null && world != null)
            {
                var em = world.EntityManager;
                if (em.HasComponent<LocalTransform>(controlled))
                {
                    var p = em.GetComponentData<LocalTransform>(controlled).Position;
                    SmoothFollow(new float2(p.x, p.y));
                }
                HandleUnitMovement(world, controlled);
            }
            else
            {
                HandleMovement();
            }

            HandleZoom();
            UpdateMouseWorldPos();
        }

        void UpdateMouseWorldPos()
        {
            var mouse = Mouse.current;
            if (mouse == null) return;
            var screenPos = mouse.position.ReadValue();
            var worldPos = _camera.ScreenToWorldPoint(new Vector3(screenPos.x, screenPos.y, 0));
            _worldMousePos.Value = new float2(worldPos.x, worldPos.y);
        }

        public void SetHoveredHex(int2 hexCoord)
        {
            if (!hexCoord.Equals(_hoveredHex.Value))
                _hoveredHex.Value = hexCoord;
        }

        public void JumpTo(float2 worldPos)
        {
            if (_transform == null) { Refresh(); if (_transform == null) return; }
            var p = _transform.position;
            p.x = worldPos.x;
            p.y = worldPos.y;
            _transform.position = p;
        }

        public void SetZoom(float value)
        {
            float clamped = Mathf.Clamp(value, MinZoom, MaxZoom);
            if (Mathf.Approximately(clamped, _zoom.Value)) return;
            _zoom.Value = clamped;
            if (_camera != null) _camera.orthographicSize = clamped;
        }

        void SmoothFollow(float2 target)
        {
            if (_transform == null) return;
            float t = Mathf.Clamp01(Time.deltaTime * FollowLerpPerSecond);
            var p = _transform.position;
            p.x = Mathf.Lerp(p.x, target.x, t);
            p.y = Mathf.Lerp(p.y, target.y, t);
            _transform.position = p;
        }

        void HandleMovement()
        {
            var keyboard = Keyboard.current;
            if (keyboard == null) return;

            float h = 0f, v = 0f;
            if (keyboard.wKey.isPressed || keyboard.upArrowKey.isPressed) v += 1f;
            if (keyboard.sKey.isPressed || keyboard.downArrowKey.isPressed) v -= 1f;
            if (keyboard.aKey.isPressed || keyboard.leftArrowKey.isPressed) h -= 1f;
            if (keyboard.dKey.isPressed || keyboard.rightArrowKey.isPressed) h += 1f;

            if (Mathf.Abs(h) < 0.001f && Mathf.Abs(v) < 0.001f) return;

            float speed = MoveSpeed * (_zoom.Value / 12f) * Time.deltaTime;
            var pos = _transform.position;
            pos.x += h * speed;
            pos.y += v * speed;
            _transform.position = pos;
        }

        void HandleUnitMovement(World world, Entity controlled)
        {
            var keyboard = Keyboard.current;
            if (keyboard == null) return;

            float2 dir = float2.zero;
            if (keyboard.wKey.isPressed || keyboard.upArrowKey.isPressed)    dir.y += 1f;
            if (keyboard.sKey.isPressed || keyboard.downArrowKey.isPressed)  dir.y -= 1f;
            if (keyboard.dKey.isPressed || keyboard.rightArrowKey.isPressed) dir.x += 1f;
            if (keyboard.aKey.isPressed || keyboard.leftArrowKey.isPressed)  dir.x -= 1f;

            var em = world.EntityManager;
            if (!em.HasComponent<LocalTransform>(controlled)) return;
            if (!em.HasComponent<UnitMovement>(controlled)) return;
            if (em.HasComponent<ShelteredInside>(controlled)) return;

            var movement = em.GetComponentData<UnitMovement>(controlled);

            if (math.lengthsq(dir) < 1e-4f)
            {
                if (!movement.TargetHex.Equals(movement.CurrentHex))
                {
                    movement.TargetHex = movement.CurrentHex;
                    em.SetComponentData(controlled, movement);
                }
                if (em.HasComponent<UnitMovingVisual>(controlled))
                    em.SetComponentData(controlled, new UnitMovingVisual { Value = 0f });
                return;
            }

            dir = math.normalize(dir);
            float speed = movement.MoveSpeed * 1.6f;
            var transform = em.GetComponentData<LocalTransform>(controlled);
            float3 next = transform.Position + new float3(dir.x * speed * Time.deltaTime,
                                                          dir.y * speed * Time.deltaTime,
                                                          0f);

            var nowHex = HexMeshUtil.WorldToHex(next.x, next.y, HexMeshHexSize);

            transform.Position = next;
            em.SetComponentData(controlled, transform);

            movement.CurrentHex = nowHex;
            movement.TargetHex  = nowHex;
            movement.Facing     = FacingFromDir(dir);
            em.SetComponentData(controlled, movement);

            if (em.HasComponent<UnitFacingVisual>(controlled))
                em.SetComponentData(controlled, new UnitFacingVisual { Value = (float)movement.Facing });
            if (em.HasComponent<UnitMovingVisual>(controlled))
                em.SetComponentData(controlled, new UnitMovingVisual { Value = 1f });

            if (em.HasComponent<MovementGoal>(controlled))
            {
                var goal = em.GetComponentData<MovementGoal>(controlled);
                if (goal.Priority <= GoalPriority.Order)
                    em.SetComponentData(controlled, new MovementGoal { Kind = GoalKind.None, Priority = GoalPriority.None, TargetHex = nowHex });
            }
        }

        const float HexMeshHexSize = 0.25f;

        static byte FacingFromDir(float2 dir)
        {
            float ax = math.abs(dir.x);
            float ay = math.abs(dir.y);
            if (ax >= ay) return dir.x >= 0f ? UnitFacing.East : UnitFacing.West;
            return dir.y >= 0f ? UnitFacing.North : UnitFacing.South;
        }

        void HandleZoom()
        {
            var mouse = Mouse.current;
            if (mouse == null) return;

            float scroll = mouse.scroll.ReadValue().y / 120f;
            if (Mathf.Abs(scroll) < 0.001f) return;

            float newZoom = Mathf.Clamp(_zoom.Value - scroll * ZoomSpeed, MinZoom, MaxZoom);
            if (Mathf.Approximately(newZoom, _zoom.Value)) return;

            _zoom.Value = newZoom;
            _camera.orthographicSize = newZoom;
        }
    }
}
