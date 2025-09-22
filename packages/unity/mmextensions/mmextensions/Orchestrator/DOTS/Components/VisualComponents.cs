using Unity.Entities;
using Unity.Mathematics;
using Unity.Collections;
using UnityEngine;
/*

                 ."-,.__
                 `.     `.  ,
              .--'  .._,'"-' `.
             .    .'         `'
             `.   /          ,'
               `  '--.   ,-"'
                `"`   |  \
                   -. \, |
                    `--Y.'      ___.
                         \     L._, \
               _.,        `.   <  <\                _
             ,' '           `, `.   | \            ( `
          ../, `.            `  |    .\`.           \ \_
         ,' ,..  .           _.,'    ||\l            )  '".
        , ,'   \           ,'.-.`-._,'  |           .  _._`.
      ,' /      \ \        `' ' `--/   | \          / /   ..\
    .'  /        \ .         |\__ - _ ,'` `        / /     `.`.
    |  '          ..         `-...-"  |  `-'      / /        . `.
    | /           |L__           |    |          / /          `. `.
   , /            .   .          |    |         / /             ` `
  / /          ,. ,`._ `-_       |    |  _   ,-' /               ` \
 / .           \"`_/. `-_ \_,.  ,'    +-' `-'  _,        ..,-.    \`.
.  '         .-f    ,'   `    '.       \__.---'     _   .'   '     \ \
' /          `.'    l     .' /          \..      ,_|/   `.  ,'`     L`
|'      _.-""` `.    \ _,'  `            \ `.___`.'"`-.  , |   |    | \
||    ,'      `. `.   '       _,...._        `  |    `/ '  |   '     .|
||  ,'          `. ;.,.---' ,'       `.   `.. `-'  .-' /_ .'    ;_   ||
|| '              V      / /           `   | `   ,'   ,' '.    !  `. ||
||/            _,-------7 '              . |  `-'    l         /    `||
. |          ,' .-   ,' ||               | .-.        `.      .'     ||
 `'        ,'    `".'    |               |    `.        '. -.'       `'
          /      ,'      |               |,'    \-.._,.'/'
          .     /        .               .       \    .''
        .`.    |         `.             /         :_,'.'
          \ `...\   _     ,'-.        .'         /_.-'
           `-.__ `,  `'   .  _.>----''.  _  __  /
                .'        /"'          |  "'   '_
               /_|.-'\ ,".             '.'`__'-( \
                 / ,"'"\,'               `/  `-.|" mh

*/
// WARNING: Components marked with [Obsolete] in this file are scheduled for deletion in a future update.
// VisualEventData is not actively used - CombatVisualsSystem uses CombatEventBuffer instead.
// TODO: Remove obsolete components after confirming no external dependencies.

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    /// <summary>
    /// Component for visual effects requests
    /// </summary>
    [System.Obsolete("VisualEventData is not currently used. CombatVisualsSystem uses CombatEventBuffer instead for visual effects processing.")]
    public struct VisualEventData : IComponentData
    {
        public VisualEventType EventType;
        public float3 Position;
        public float3 Direction;
        public float Scale;
        public Color32 Color;
        public float Duration;
        public float StartTime;
        public int EffectIndex; // Index into effect prefab array

        public static VisualEventData CreateHitEffect(in float3 position, in float3 hitDirection)
        {
            return new VisualEventData
            {
                EventType = VisualEventType.Hit,
                Position = position,
                Direction = hitDirection,
                Scale = 1f,
                Color = new Color32(255, 255, 255, 255),
                Duration = 0.5f,
                StartTime = 0f,
                EffectIndex = 0
            };
        }

        public static VisualEventData CreateDeathEffect(in float3 position)
        {
            return new VisualEventData
            {
                EventType = VisualEventType.Death,
                Position = position,
                Direction = float3.zero,
                Scale = 2f,
                Color = new Color32(255, 0, 0, 255),
                Duration = 2f,
                StartTime = 0f,
                EffectIndex = 0
            };
        }
    }

    /// <summary>
    /// Component for health bar display
    /// </summary>
    public struct HealthBarData : IComponentData
    {
        public bool IsVisible;
        public float VisibilityTimer;
        public float BarWidth;
        public float BarHeight;
        public float3 WorldOffset;
        public Color32 BarColor;
        public Color32 BackgroundColor;
        public bool ShowText;
        public HealthBarStyle Style;

        public static HealthBarData CreateDefault()
        {
            return new HealthBarData
            {
                IsVisible = false,
                VisibilityTimer = 0f,
                BarWidth = 1f,
                BarHeight = 0.1f,
                WorldOffset = new float3(0, 2f, 0),
                BarColor = new Color32(0, 255, 0, 255),
                BackgroundColor = new Color32(50, 50, 50, 128),
                ShowText = false,
                Style = HealthBarStyle.Simple
            };
        }

        public static HealthBarData CreateBossBar()
        {
            return new HealthBarData
            {
                IsVisible = true,
                VisibilityTimer = float.MaxValue,
                BarWidth = 3f,
                BarHeight = 0.3f,
                WorldOffset = new float3(0, 3f, 0),
                BarColor = new Color32(255, 50, 50, 255),
                BackgroundColor = new Color32(20, 20, 20, 255),
                ShowText = true,
                Style = HealthBarStyle.Segmented
            };
        }
    }

    /// <summary>
    /// Request component for floating damage numbers
    /// </summary>
    public struct DamageNumberRequest : IComponentData
    {
        public float Damage;
        public float3 WorldPosition;
        public DamageNumberType Type;
        public Color32 TextColor;
        public float FontSize;
        public float3 Velocity;
        public float Lifetime;
        public float CreationTime;

        public static DamageNumberRequest CreateNormal(float damage, in float3 position)
        {
            return new DamageNumberRequest
            {
                Damage = damage,
                WorldPosition = position,
                Type = DamageNumberType.Normal,
                TextColor = new Color32(255, 255, 255, 255),
                FontSize = 24f,
                Velocity = new float3(0, 2f, 0),
                Lifetime = 1f,
                CreationTime = 0f
            };
        }

        public static DamageNumberRequest CreateCritical(float damage, in float3 position)
        {
            return new DamageNumberRequest
            {
                Damage = damage,
                WorldPosition = position,
                Type = DamageNumberType.Critical,
                TextColor = new Color32(255, 200, 0, 255),
                FontSize = 32f,
                Velocity = new float3(0, 3f, 0),
                Lifetime = 1.5f,
                CreationTime = 0f
            };
        }

        public static DamageNumberRequest CreateHeal(float amount, in float3 position)
        {
            return new DamageNumberRequest
            {
                Damage = amount,
                WorldPosition = position,
                Type = DamageNumberType.Heal,
                TextColor = new Color32(0, 255, 0, 255),
                FontSize = 24f,
                Velocity = new float3(0, 1.5f, 0),
                Lifetime = 1f,
                CreationTime = 0f
            };
        }
    }

    /// <summary>
    /// Component for death visual effects
    /// </summary>
    public struct DeathEffectData : IComponentData
    {
        public DeathEffectType EffectType;
        public float Duration;
        public float Progress; // 0-1
        public Color32 DissolveColor;
        public float DissolveSpeed;
        public bool SpawnParticles;
        public bool PlaySound;
        public int SoundIndex;

        public static DeathEffectData CreateDissolve()
        {
            return new DeathEffectData
            {
                EffectType = DeathEffectType.Dissolve,
                Duration = 1.5f,
                Progress = 0f,
                DissolveColor = new Color32(255, 100, 0, 255),
                DissolveSpeed = 1f,
                SpawnParticles = true,
                PlaySound = true,
                SoundIndex = 0
            };
        }

        public static DeathEffectData CreateExplode()
        {
            return new DeathEffectData
            {
                EffectType = DeathEffectType.Explode,
                Duration = 0.5f,
                Progress = 0f,
                DissolveColor = new Color32(255, 255, 255, 255),
                DissolveSpeed = 0f,
                SpawnParticles = true,
                PlaySound = true,
                SoundIndex = 1
            };
        }
    }

    /// <summary>
    /// Buffer for animation events
    /// </summary>
    [InternalBufferCapacity(4)]
    public struct AnimationEventBuffer : IBufferElementData
    {
        public AnimationEventType EventType;
        public int AnimationHash;
        public float NormalizedTime;
        public float Speed;
        public bool TriggerOnce;
        public bool HasTriggered;

        public static AnimationEventBuffer CreateTrigger(AnimationEventType type, int hash)
        {
            return new AnimationEventBuffer
            {
                EventType = type,
                AnimationHash = hash,
                NormalizedTime = 0f,
                Speed = 1f,
                TriggerOnce = true,
                HasTriggered = false
            };
        }
    }

    /// <summary>
    /// Component for animation state
    /// </summary>
    public struct AnimationState : IComponentData
    {
        public int CurrentStateHash;
        public int PreviousStateHash;
        public float StateTimer;
        public float TransitionDuration;
        public float TransitionProgress;
        public AnimationLayer Layer;
        public bool IsTransitioning;

        // Animation state identifiers using bitwise values for simplicity
        // Much easier to manage than hash codes
        public const int IdleHash = 0;      // 0000
        public const int MoveHash = 1;      // 0001
        public const int AttackHash = 2;    // 0010
        public const int HitHash = 4;       // 0100
        public const int DeathHash = 8;     // 1000

        // Can also combine states if needed using bitwise OR
        // e.g., const int AttackWhileMoving = MoveHash | AttackHash;

        public void TransitionTo(int newStateHash, float duration = 0.25f)
        {
            if (CurrentStateHash == newStateHash) return;

            PreviousStateHash = CurrentStateHash;
            CurrentStateHash = newStateHash;
            TransitionDuration = duration;
            TransitionProgress = 0f;
            IsTransitioning = true;
            StateTimer = 0f;
        }
    }

    /// <summary>
    /// Component for screen effects (shake, flash, etc)
    /// </summary>
    public struct ScreenEffectRequest : IComponentData
    {
        public ScreenEffectType Type;
        public float Intensity;
        public float Duration;
        public float Frequency;
        public Color32 FlashColor;
        public float StartTime;

        public static ScreenEffectRequest CreateShake(float intensity, float duration)
        {
            return new ScreenEffectRequest
            {
                Type = ScreenEffectType.Shake,
                Intensity = intensity,
                Duration = duration,
                Frequency = 10f,
                FlashColor = new Color32(0, 0, 0, 0),
                StartTime = 0f
            };
        }

        public static ScreenEffectRequest CreateFlash(Color32 color, float duration)
        {
            return new ScreenEffectRequest
            {
                Type = ScreenEffectType.Flash,
                Intensity = 1f,
                Duration = duration,
                Frequency = 0f,
                FlashColor = color,
                StartTime = 0f
            };
        }
    }

    /// <summary>
    /// Component for UI overlay elements (boss health, wave info, etc)
    /// </summary>
    public struct UIOverlayData : IComponentData
    {
        public UIOverlayType Type;
        public FixedString64Bytes Title;
        public FixedString128Bytes Description;
        public float Value; // 0-1 for progress bars
        public float MaxValue;
        public bool IsVisible;
        public float FadeTimer;

        public static UIOverlayData CreateBossHealth(string name, float health, float maxHealth)
        {
            // Use FixedString formatting for Burst compatibility
            var healthText = new FixedString128Bytes();
            healthText.Append("Health: ");
            healthText.Append((int)health);
            healthText.Append("/");
            healthText.Append((int)maxHealth);

            return new UIOverlayData
            {
                Type = UIOverlayType.BossHealth,
                Title = new FixedString64Bytes(name),
                Description = healthText,
                Value = health,
                MaxValue = maxHealth,
                IsVisible = true,
                FadeTimer = 0f
            };
        }
    }

    // Enums for visual system

    public enum VisualEventType : byte
    {
        Hit,
        Critical,
        Block,
        Dodge,
        Death,
        Spawn,
        LevelUp,
        Heal,
        Buff,
        Debuff
    }

    public enum HealthBarStyle : byte
    {
        Simple,
        Segmented,
        Gradient,
        Animated
    }

    public enum DamageNumberType : byte
    {
        Normal,
        Critical,
        Heal,
        Shield,
        Miss,
        Immune
    }

    public enum DeathEffectType : byte
    {
        None,
        Dissolve,
        Explode,
        Fade,
        Ragdoll,
        Vaporize
    }

    public enum AnimationEventType : byte
    {
        Attack,
        FootStep,
        VoiceLine,
        Effect,
        Sound
    }

    public enum AnimationLayer : byte
    {
        Base,
        Upper,
        Lower,
        Additive
    }

    public enum ScreenEffectType : byte
    {
        None,
        Shake,
        Flash,
        ChromaticAberration,
        RadialBlur,
        Vignette
    }

    public enum UIOverlayType : byte
    {
        BossHealth,
        WaveProgress,
        ObjectiveText,
        Warning,
        Tutorial
    }
}