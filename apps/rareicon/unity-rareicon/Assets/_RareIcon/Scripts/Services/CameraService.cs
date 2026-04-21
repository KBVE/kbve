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

        EntityQuery _controlledQuery;
        bool _queryReady;
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
                if (!_queryReady)
                {
                    _controlledQuery = world.EntityManager.CreateEntityQuery(ComponentType.ReadOnly<ControlledUnitTag>());
                    _queryReady = true;
                }
                if (_controlledQuery.TryGetSingletonEntity<ControlledUnitTag>(out var e))
                    controlled = e;
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
            if (Time.time < _nextUnitMoveTime) return;
            var keyboard = Keyboard.current;
            if (keyboard == null) return;

            int dQ = 0, dR = 0;
            if (keyboard.wKey.isPressed || keyboard.upArrowKey.isPressed)    dR += 1;
            if (keyboard.sKey.isPressed || keyboard.downArrowKey.isPressed)  dR -= 1;
            if (keyboard.dKey.isPressed || keyboard.rightArrowKey.isPressed) dQ += 1;
            if (keyboard.aKey.isPressed || keyboard.leftArrowKey.isPressed)  dQ -= 1;
            if (dQ == 0 && dR == 0) return;

            var em = world.EntityManager;
            if (!em.HasComponent<UnitMovement>(controlled)) return;
            var movement = em.GetComponentData<UnitMovement>(controlled);
            var target = new int2(movement.CurrentHex.x + dQ, movement.CurrentHex.y + dR);

            if (_movePublisher == null)
            {
                try { _movePublisher = GlobalMessagePipe.GetPublisher<ControlledUnitMoveMessage>(); }
                catch { return; }
            }

            _movePublisher.Publish(new ControlledUnitMoveMessage(target.x, target.y));
            _nextUnitMoveTime = Time.time + UnitMoveCooldown;
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
