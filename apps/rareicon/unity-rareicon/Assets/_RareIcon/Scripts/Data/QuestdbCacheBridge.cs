using KBVE.Proto.Quest;
using Unity.Collections;

namespace RareIcon
{
    /// <summary>Bridges <see cref="QuestdbCache"/> (managed Google.Protobuf accessor) into the Burst-readable <see cref="QuestDefRuntime"/> map. Called once by <see cref="QuestsDomainSystem"/>.OnCreate after the hardcoded QuestDB is mirrored, so proto-authored quests overlay on top without clobbering the tutorial range. Pulls inn_tier_min from QuestPrerequisite + giver_npc_refs[0] FNV hash so the QuestBoardRefreshSystem can filter offers per Inn tier.</summary>
    public static class QuestdbCacheBridge
    {
        public static void PopulateRuntime(ref NativeHashMap<ushort, QuestDefRuntime> into)
        {
            if (!QuestdbCache.IsLoaded) return;
            foreach (var kv in QuestdbCache.ById)
            {
                ushort id = kv.Key;
                Quest q = kv.Value;
                into[id] = ToRuntime(id, q);
            }
        }

        static QuestDefRuntime ToRuntime(ushort id, Quest q)
        {
            byte innTier = 0;
            if (q.Prerequisites != null && q.Prerequisites.HasInnTierMin)
                innTier = (byte)q.Prerequisites.InnTierMin;

            uint giverHash = 0u;
            if (q.GiverNpcRefs != null && q.GiverNpcRefs.Count > 0)
                giverHash = QuestdbCache.FnvHash32(q.GiverNpcRefs[0]);

            ushort rewardItem = 0;
            ushort rewardCount = 0;
            if (q.Rewards != null && q.Rewards.Items != null && q.Rewards.Items.Count > 0)
            {
                var first = q.Rewards.Items[0];
                if (!string.IsNullOrEmpty(first.ItemRef) &&
                    System.Enum.TryParse<ItemId>(first.ItemRef, true, out var parsed))
                {
                    rewardItem  = (ushort)parsed;
                    rewardCount = (ushort)System.Math.Clamp(first.Amount, 0, ushort.MaxValue);
                }
            }

            return new QuestDefRuntime
            {
                Id              = id,
                RewardItemId    = rewardItem,
                RewardItemCount = rewardCount,
                NextQuestId     = 0,
                GiverNpcRefHash = giverHash,
                InnTierMin      = innTier,
                Category        = (byte)q.Category,
                Obj0 = default,
                Obj1 = default,
                Obj2 = default,
                Obj3 = default,
            };
        }
    }
}
