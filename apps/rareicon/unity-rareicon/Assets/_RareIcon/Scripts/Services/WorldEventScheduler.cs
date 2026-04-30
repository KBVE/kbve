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
                new EventConfig
                {
                    Kind         = WorldEventKind.WanderingHero,
                    MinFromBoot  = 7f * 60f,
                    Cooldown     = 12f * 60f,
                    ProbPerCheck = 0.03f,
                },
                new EventConfig
                {
                    Kind         = WorldEventKind.MerchantCaravan,
                    MinFromBoot  = 4f * 60f,
                    Cooldown     = 7f * 60f,
                    ProbPerCheck = 0.06f,
                },
                new EventConfig
                {
                    Kind         = WorldEventKind.WolfPack,
                    MinFromBoot  = 3f * 60f,
                    Cooldown     = 5f * 60f,
                    ProbPerCheck = 0.10f,
                },
                new EventConfig
                {
                    Kind         = WorldEventKind.BanditRaidMini,
                    MinFromBoot  = 6f * 60f,
                    Cooldown     = 4f * 60f,
                    ProbPerCheck = 0.10f,
                },
                new EventConfig
                {
                    Kind         = WorldEventKind.FallingStar,
                    MinFromBoot  = 8f * 60f,
                    Cooldown     = 15f * 60f,
                    ProbPerCheck = 0.02f,
                },
                new EventConfig
                {
                    Kind         = WorldEventKind.BountifulHarvest,
                    MinFromBoot  = 12f * 60f,
                    Cooldown     = 18f * 60f,
                    ProbPerCheck = 0.025f,
                },
                new EventConfig
                {
                    Kind         = WorldEventKind.Earthquake,
                    MinFromBoot  = 10f * 60f,
                    Cooldown     = 14f * 60f,
                    ProbPerCheck = 0.025f,
                },
                new EventConfig
                {
                    Kind         = WorldEventKind.TreasureCache,
                    MinFromBoot  = 9f * 60f,
                    Cooldown     = 18f * 60f,
                    ProbPerCheck = 0.02f,
                },
                new EventConfig
                {
                    Kind         = WorldEventKind.SagesBlessing,
                    MinFromBoot  = 15f * 60f,
                    Cooldown     = 20f * 60f,
                    ProbPerCheck = 0.02f,
                },
                new EventConfig
                {
                    Kind         = WorldEventKind.GoblinCaveStir,
                    MinFromBoot  = 18f * 60f,
                    Cooldown     = 25f * 60f,
                    ProbPerCheck = 0.015f,
                },
                new EventConfig
                {
                    Kind         = WorldEventKind.LostCaravan,
                    MinFromBoot  = 11f * 60f,
                    Cooldown     = 16f * 60f,
                    ProbPerCheck = 0.025f,
                },
                new EventConfig
                {
                    Kind         = WorldEventKind.Migration,
                    MinFromBoot  = 8f * 60f,
                    Cooldown     = 14f * 60f,
                    ProbPerCheck = 0.03f,
                },
                new EventConfig
                {
                    Kind         = WorldEventKind.MysteriousStranger,
                    MinFromBoot  = 13f * 60f,
                    Cooldown     = 18f * 60f,
                    ProbPerCheck = 0.025f,
                },
                new EventConfig
                {
                    Kind         = WorldEventKind.PlagueOutbreak,
                    MinFromBoot  = 16f * 60f,
                    Cooldown     = 20f * 60f,
                    ProbPerCheck = 0.02f,
                },
                new EventConfig
                {
                    Kind         = WorldEventKind.CrowOmen,
                    MinFromBoot  = 14f * 60f,
                    Cooldown     = 18f * 60f,
                    ProbPerCheck = 0.025f,
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
