using Unity.Collections;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Burst-friendly lookups over <see cref="CityIndexSingleton"/>. <see cref="TryNearestCity"/> picks the city with the smallest hex distance to a target — optionally filtered by faction (pass <see cref="CityRouterOps.AnyFaction"/> for "any"). Callers that intend to deposit / withdraw items pair this with <see cref="GetBank"/> via the appropriate <c>BufferLookup</c> on each ledger type. Keep this struct-friendly so <see cref="ISystem"/> Burst paths can use it without leaving Burst.</summary>
    public static class CityRouterOps
    {
        /// <summary>Sentinel byte for "match any faction". Distinct from <see cref="FactionType.Neutral"/> (= 0) which is a real faction. Pass this when the caller doesn't care who owns the receiving city.</summary>
        public const byte AnyFaction = 255;

        /// <summary>Find the nearest <see cref="CityIndexEntry"/> to <paramref name="hex"/>. <paramref name="preferFaction"/> filters by Building.OwnerFaction; pass <see cref="AnyFaction"/> to match any. Returns false if no city matches.</summary>
        public static bool TryNearestCity(
            in NativeList<CityIndexEntry> entries,
            int2 hex,
            byte preferFaction,
            out CityIndexEntry result)
        {
            result = default;
            if (!entries.IsCreated || entries.Length == 0) return false;

            int  bestDist = int.MaxValue;
            int  bestIdx  = -1;
            for (int i = 0; i < entries.Length; i++)
            {
                var e = entries[i];
                if (preferFaction != CityRouterOps.AnyFaction && e.Faction != preferFaction) continue;
                int d = HexDistance(hex, e.RootHex);
                if (d < bestDist) { bestDist = d; bestIdx = i; }
            }
            if (bestIdx < 0) return false;
            result = entries[bestIdx];
            return true;
        }

        static int HexDistance(int2 a, int2 b)
        {
            int dx = b.x - a.x;
            int dy = b.y - a.y;
            int dz = -dx - dy;
            return (math.abs(dx) + math.abs(dy) + math.abs(dz)) / 2;
        }
    }

    /// <summary>Managed convenience layer over <see cref="CityRouterOps"/>. Used by VContainer services + SystemBase callers that aren't Burst-bound. Hides the CityIndex singleton lookup behind a single static call so adding a second city later doesn't ripple through every UI / tribute / shrine site.</summary>
    public static class CityRouter
    {
        public static bool TryNearestCity(
            EntityManager em, int2 hex, byte preferFaction,
            out Entity city, out byte hasCapitalLedger, out byte hasCityLedger)
        {
            city = Entity.Null;
            hasCapitalLedger = 0;
            hasCityLedger = 0;
            using var q = em.CreateEntityQuery(ComponentType.ReadOnly<CityIndexSingleton>());
            if (q.CalculateEntityCount() == 0) return false;
            var idx = q.GetSingleton<CityIndexSingleton>();
            if (!CityRouterOps.TryNearestCity(idx.Entries, hex, preferFaction, out var entry))
                return false;
            city = entry.Entity;
            hasCapitalLedger = entry.HasCapitalLedger;
            hasCityLedger = entry.HasCityLedger;
            return true;
        }

        /// <summary>Resolves the city's bank buffer reinterpreted as <see cref="BankLedgerBase"/>. Falls back to default if neither ledger type is attached. Capital → <see cref="CapitalLedger"/>; Player-founded city / CityState → <see cref="CityLedger"/>.</summary>
        public static DynamicBuffer<BankLedgerBase> GetBank(EntityManager em, Entity city)
        {
            if (em.HasBuffer<CapitalLedger>(city))
                return em.GetBuffer<CapitalLedger>(city).Reinterpret<BankLedgerBase>();
            if (em.HasBuffer<CityLedger>(city))
                return em.GetBuffer<CityLedger>(city).Reinterpret<BankLedgerBase>();
            return default;
        }

        /// <summary>Convenience: pick the nearest player-faction city + return its bank in one call. Returns false if the lookup fails or the city has no ledger.</summary>
        public static bool TryGetNearestPlayerBank(
            EntityManager em, int2 hex,
            out Entity city, out DynamicBuffer<BankLedgerBase> bank)
        {
            bank = default;
            if (!TryNearestCity(em, hex, FactionType.Player, out city, out _, out _))
                return false;
            bank = GetBank(em, city);
            return bank.IsCreated;
        }
    }
}
