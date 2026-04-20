using Unity.Burst;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>Converts accumulated SkillXP into Skills level increments once XP crosses XPPerLevel; hits cap at Skills.SkillCap and stops accumulating further.</summary>
    [BurstCompile]
    [UpdateInGroup(typeof(SimulationSystemGroup))]
    public partial struct SkillProgressionSystem : ISystem
    {
        public const ushort XPPerLevel = 100;

        [BurstCompile] public void OnCreate(ref SystemState state) { }
        [BurstCompile] public void OnDestroy(ref SystemState state) { }

        [BurstCompile]
        public void OnUpdate(ref SystemState state)
        {
            new LevelUpJob().ScheduleParallel();
        }
    }

    [BurstCompile]
    public partial struct LevelUpJob : IJobEntity
    {
        void Execute(ref Skills skills, ref SkillXP xp)
        {
            Roll(ref skills, ref xp, SkillKind.Foraging);
            Roll(ref skills, ref xp, SkillKind.Lumberjack);
            Roll(ref skills, ref xp, SkillKind.Mining);
            Roll(ref skills, ref xp, SkillKind.Combat);
            Roll(ref skills, ref xp, SkillKind.Scavenging);
            Roll(ref skills, ref xp, SkillKind.Husbandry);
        }

        static void Roll(ref Skills skills, ref SkillXP xp, byte kind)
        {
            byte level = skills.Get(kind);
            if (level >= Skills.SkillCap)
            {
                if (xp.Get(kind) != 0) xp.Set(kind, 0);
                return;
            }

            ushort cur = xp.Get(kind);
            while (cur >= SkillProgressionSystem.XPPerLevel && level < Skills.SkillCap)
            {
                cur = (ushort)(cur - SkillProgressionSystem.XPPerLevel);
                level += 1;
            }
            skills.Set(kind, level);
            xp.Set(kind, cur);
        }
    }
}
