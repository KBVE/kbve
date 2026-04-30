using System;
using MessagePipe;
using UnityEngine;
using VContainer.Unity;

namespace RareIcon
{
    /// <summary>Random-event scheduler. Ticks every <see cref="CheckIntervalSecs"/> seconds while the player is in <see cref="AppInterfaceState.World"/>; for each registered event past its cooldown, rolls a per-check probability against <see cref="System.Random"/> and publishes a <see cref="WorldEventTriggeredMessage"/> on hit. Cadence is decoupled from frame rate via accumulated <see cref="Time.deltaTime"/>; cooldowns survive pause + dialogue (game time, not real time, drives the next-fire). Events themselves carry no payload — the handler pulls everything (dialogue tree, spawn count, target hex) from a static table keyed off <see cref="WorldEventKind"/>.</summary>
    public sealed class WorldEventScheduler : ITickable, IDisposable
    {
        const float CheckIntervalSecs = 5f;

        readonly AppStateController _appState;
        readonly IPublisher<WorldEventTriggeredMessage> _eventPub;

        readonly System.Random _rng = new();
        float _accum;
        float _gameTime;

        readonly EventConfig[] _events;
        readonly float[]       _nextEarliest;

        struct EventConfig
        {
            public byte  Kind;
            public float MinFromBoot;
            public float Cooldown;
            public float ProbPerCheck;
        }

        public WorldEventScheduler(
            AppStateController appState,
            IPublisher<WorldEventTriggeredMessage> eventPub)
        {
            _appState = appState;
            _eventPub = eventPub;

            _events = new EventConfig[]
            {
                new EventConfig
                {
                    Kind         = WorldEventKind.LostGoblinBand,
                    MinFromBoot  = 5f * 60f,
                    Cooldown     = 8f * 60f,
                    ProbPerCheck = 0.05f,
                },
                new EventConfig
                {
                    Kind         = WorldEventKind.RaiderSwarm,
                    MinFromBoot  = 10f * 60f,
                    Cooldown     = 6f * 60f,
                    ProbPerCheck = 0.08f,
                },
            };
            _nextEarliest = new float[_events.Length];
        }

        public void Tick()
        {
            if (_appState == null) return;
            if (_appState.Current.CurrentValue != AppInterfaceState.World) return;

            float dt = Time.deltaTime;
            _gameTime += dt;
            _accum    += dt;
            if (_accum < CheckIntervalSecs) return;
            _accum = 0f;

            for (int i = 0; i < _events.Length; i++)
            {
                var cfg = _events[i];
                if (_gameTime < cfg.MinFromBoot) continue;
                if (_gameTime < _nextEarliest[i]) continue;
                if (_rng.NextDouble() >= cfg.ProbPerCheck) continue;

                _nextEarliest[i] = _gameTime + cfg.Cooldown;
                _eventPub.Publish(new WorldEventTriggeredMessage(cfg.Kind));
                Debug.Log($"[WorldEventScheduler] fired {cfg.Kind} at t={_gameTime:F0}s; next earliest t={_nextEarliest[i]:F0}s");
            }
        }

        public void Dispose() { }
    }
}
