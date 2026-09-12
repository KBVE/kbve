namespace RareIcon
{
    /// <summary>Blittable objective descriptor mirrored from <see cref="QuestDef"/> into the domain singleton's NativeHashMap so Burst systems can read it without touching managed code.</summary>
    public struct QuestObjectiveRuntime
    {
        public byte   Kind;
        public ushort TargetId;
        public uint   TargetCount;
    }

    /// <summary>Blittable quest descriptor for Burst consumers. Fixed 4-objective layout so the whole struct stays trivially copyable; extra slots carry Kind == QuestObjectiveKind.None and are skipped by the evaluator.</summary>
    public struct QuestDefRuntime
    {
        public const int MaxObjectives = 4;

        public ushort Id;
        public ushort RewardItemId;
        public ushort RewardItemCount;
        public ushort NextQuestId;
        public uint   GiverNpcRefHash;
        public byte   InnTierMin;
        public byte   Category;
        public QuestObjectiveRuntime Obj0;
        public QuestObjectiveRuntime Obj1;
        public QuestObjectiveRuntime Obj2;
        public QuestObjectiveRuntime Obj3;

        public QuestObjectiveRuntime GetObjective(int i) => i switch
        {
            0 => Obj0,
            1 => Obj1,
            2 => Obj2,
            _ => Obj3,
        };
    }
}
