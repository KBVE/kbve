using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>
    /// Test harness — periodically fires an arrow from world origin so
    /// we can validate the HexProjectile shader + spawn + tick pipeline
    /// without needing combat AI wired up. Cycles through the 4 cardinal
    /// facings and every ArrowMod on repeat, so a short watch shows
    /// plain / poison / fire / ice / curse / obsidian arrows flying in
    /// each direction.
    ///
    /// Delete or comment out once real ranged units are online.
    /// </summary>
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    [UpdateBefore(typeof(ProjectileSpawnSystem))]
    public partial class ProjectileTestFireSystem : SystemBase
    {
        const float FireInterval = 0.5f;    // seconds between shots
        const float ProjSpeed    = 2.5f;    // world units / sec
        const float ProjLifetime = 3.0f;    // seconds before auto-despawn

        float _timer;
        int _cycle;

        protected override void OnUpdate()
        {
            _timer -= SystemAPI.Time.DeltaTime;
            if (_timer > 0f) return;
            _timer = FireInterval;

            // Cycle facing every shot so we see all 4 directions; step
            // the mod once per full facing loop so each modifier gets
            // ~4 visible shots before moving on.
            byte facing = (byte)(_cycle % 4);
            byte mod    = (byte)((_cycle / 4) % 6);  // None..Obsidian
            _cycle++;

            float2 vel;
            switch (facing)
            {
                case UnitFacing.East:  vel = new float2( ProjSpeed, 0f);        break;
                case UnitFacing.North: vel = new float2(0f,          ProjSpeed); break;
                case UnitFacing.West:  vel = new float2(-ProjSpeed,  0f);        break;
                default:               vel = new float2(0f,         -ProjSpeed); break;
            }

            var em = EntityManager;
            var req = em.CreateEntity();
            em.AddComponentData(req, new SpawnProjectileRequest
            {
                Type         = ProjectileType.Arrow,
                Mod          = mod,
                Facing       = facing,
                OwnerFaction = 0,
                Position     = float2.zero,
                Velocity     = vel,
                Lifetime     = ProjLifetime,
                Damage       = 10f,
            });
        }
    }
}
