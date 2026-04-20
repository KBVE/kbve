using Unity.Entities;
using Unity.Mathematics;
using UnityEngine;

namespace RareIcon
{
    /// <summary>Ticks the WorldClock singleton and publishes ambient tint + sun altitude as global shader uniforms.</summary>
    [UpdateInGroup(typeof(InitializationSystemGroup))]
    public partial class WorldClockSystem : SystemBase
    {
        static readonly int AmbientId    = Shader.PropertyToID("_WorldAmbient");
        static readonly int DayTId       = Shader.PropertyToID("_WorldDayT");
        static readonly int SunAngleId   = Shader.PropertyToID("_WorldSunAngle");

        static readonly Color DayTint   = new Color(1.00f, 0.98f, 0.92f, 1f);
        static readonly Color NightTint = new Color(0.22f, 0.28f, 0.45f, 1f);
        static readonly Color DuskTint  = new Color(0.85f, 0.55f, 0.40f, 1f);

        protected override void OnCreate()
        {
            var e = EntityManager.CreateEntity(typeof(WorldClock));
            EntityManager.SetComponentData(e, new WorldClock
            {
                TurnIndex    = 0,
                TurnElapsed  = 0f,
                AbsSeconds   = 0f,
                SunAltitude  = 0f,
                MoonAltitude = 0f,
                DayT         = 1f,
                IsDay        = true,
            });
        }

        protected override void OnUpdate()
        {
            var e = SystemAPI.GetSingletonEntity<WorldClock>();
            var clock = EntityManager.GetComponentData<WorldClock>(e);

            clock.TurnElapsed += SystemAPI.Time.DeltaTime;
            while (clock.TurnElapsed >= WorldClock.TurnDuration)
            {
                clock.TurnElapsed -= WorldClock.TurnDuration;
                clock.TurnIndex++;
            }
            clock.AbsSeconds = clock.TurnIndex * WorldClock.TurnDuration + clock.TurnElapsed;
            clock.IsDay      = (clock.TurnIndex & 1u) == 0u;

            float phase = clock.TurnElapsed / WorldClock.TurnDuration;
            float alt   = math.sin(phase * math.PI);
            clock.SunAltitude  = clock.IsDay ? alt : 0f;
            clock.MoonAltitude = clock.IsDay ? 0f : alt;
            clock.DayT = clock.IsDay ? alt : 0f;

            EntityManager.SetComponentData(e, clock);

            Color ambient;
            if (clock.IsDay)
                ambient = Color.Lerp(DuskTint, DayTint, clock.SunAltitude);
            else
                ambient = Color.Lerp(DuskTint, NightTint, 0.3f + 0.7f * clock.MoonAltitude);

            Shader.SetGlobalColor(AmbientId, ambient);
            Shader.SetGlobalFloat(DayTId, clock.DayT);
            Shader.SetGlobalFloat(SunAngleId, phase * 180f);
        }
    }
}
