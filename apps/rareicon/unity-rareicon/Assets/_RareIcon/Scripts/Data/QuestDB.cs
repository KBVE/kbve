using System.Collections.Generic;
using Unity.Collections;

namespace RareIcon
{
    /// <summary>Quest tree ID constants. Keep in sync with <see cref="QuestDB"/> entries.</summary>
    public static class QuestId
    {
        public const ushort None             = 0;
        public const ushort FoundingOrder    = 1;   // Tutorial: plant the Capital.
        public const ushort FirstHarvest     = 2;   // Stockpile 20 WoodLog.
        public const ushort SurviveFirstWeek = 3;   // Live through 14 turns.
        public const ushort ThinBanditHerd   = 4;   // Kill 3 bandits.
    }

    /// <summary>One objective slot inside a <see cref="QuestDef"/>.</summary>
    public readonly struct QuestObjectiveDef
    {
        public readonly byte   Kind;
        public readonly ushort TargetId;
        public readonly uint   TargetCount;
        public QuestObjectiveDef(byte kind, ushort targetId, uint targetCount)
        {
            Kind        = kind;
            TargetId    = targetId;
            TargetCount = targetCount;
        }
    }

    /// <summary>Static quest definition. Text lives in <see cref="LocaleService"/> under NameKey / DescriptionKey; reward pays into Capital on completion; NextQuestId auto-chains the next quest.</summary>
    public sealed class QuestDef
    {
        public const int MaxObjectives = QuestDefRuntime.MaxObjectives;

        public ushort Id;
        public string NameKey;
        public string DescriptionKey;
        public QuestObjectiveDef[] Objectives;
        public ushort RewardItemId;
        public ushort RewardItemCount;
        public ushort NextQuestId;
    }

    /// <summary>Source of truth for quest structure. Mirrors into <see cref="QuestDBSingleton"/>.Defs as <see cref="QuestDefRuntime"/> at domain boot.</summary>
    public static class QuestDB
    {
        static Dictionary<ushort, QuestDef> _byId;

        public static QuestDef Get(ushort id)
        {
            EnsureInit();
            return _byId.TryGetValue(id, out var q) ? q : null;
        }

        /// <summary>Mirrors every managed <see cref="QuestDef"/> into the Burst-readable <see cref="QuestDefRuntime"/> hash map. Called once by <see cref="QuestsDomainSystem"/>.OnCreate.</summary>
        public static void PopulateRuntime(ref NativeHashMap<ushort, QuestDefRuntime> into)
        {
            EnsureInit();
            foreach (var kv in _byId)
                into[kv.Key] = ToRuntime(kv.Value);
        }

        static QuestDefRuntime ToRuntime(QuestDef d)
        {
            var rt = new QuestDefRuntime
            {
                Id              = d.Id,
                RewardItemId    = d.RewardItemId,
                RewardItemCount = d.RewardItemCount,
                NextQuestId     = d.NextQuestId,
            };
            int n = d.Objectives?.Length ?? 0;
            if (n > 0) rt.Obj0 = ToObjRuntime(d.Objectives[0]);
            if (n > 1) rt.Obj1 = ToObjRuntime(d.Objectives[1]);
            if (n > 2) rt.Obj2 = ToObjRuntime(d.Objectives[2]);
            if (n > 3) rt.Obj3 = ToObjRuntime(d.Objectives[3]);
            return rt;
        }

        static QuestObjectiveRuntime ToObjRuntime(QuestObjectiveDef o) => new QuestObjectiveRuntime
        {
            Kind        = o.Kind,
            TargetId    = o.TargetId,
            TargetCount = o.TargetCount,
        };

        static void EnsureInit()
        {
            if (_byId != null) return;
            _byId = new Dictionary<ushort, QuestDef>();

            Add(new QuestDef
            {
                Id              = QuestId.FoundingOrder,
                NameKey         = "quest.founding_order.name",
                DescriptionKey  = "quest.founding_order.desc",
                Objectives = new[]
                {
                    new QuestObjectiveDef(QuestObjectiveKind.BuildBuilding, BuildingType.Capital, 1),
                },
                RewardItemId    = (ushort)ItemId.Coin,
                RewardItemCount = 50,
                NextQuestId     = QuestId.FirstHarvest,
            });

            Add(new QuestDef
            {
                Id              = QuestId.FirstHarvest,
                NameKey         = "quest.first_harvest.name",
                DescriptionKey  = "quest.first_harvest.desc",
                Objectives = new[]
                {
                    new QuestObjectiveDef(QuestObjectiveKind.CollectItem, (ushort)ItemId.WoodLog, 20),
                },
                RewardItemId    = (ushort)ItemId.Timber,
                RewardItemCount = 1,
                NextQuestId     = QuestId.SurviveFirstWeek,
            });

            Add(new QuestDef
            {
                Id              = QuestId.SurviveFirstWeek,
                NameKey         = "quest.survive_first_week.name",
                DescriptionKey  = "quest.survive_first_week.desc",
                Objectives = new[]
                {
                    new QuestObjectiveDef(QuestObjectiveKind.SurviveTurns, 0, 14),
                },
                RewardItemId    = (ushort)ItemId.GoldBar,
                RewardItemCount = 1,
                NextQuestId     = QuestId.ThinBanditHerd,
            });

            Add(new QuestDef
            {
                Id              = QuestId.ThinBanditHerd,
                NameKey         = "quest.thin_bandit_herd.name",
                DescriptionKey  = "quest.thin_bandit_herd.desc",
                Objectives = new[]
                {
                    new QuestObjectiveDef(QuestObjectiveKind.KillUnitType, UnitType.Bandit, 3),
                },
                RewardItemId    = (ushort)ItemId.MedKit,
                RewardItemCount = 3,
                NextQuestId     = QuestId.None,
            });
        }

        static void Add(QuestDef q) => _byId[q.Id] = q;
    }
}
