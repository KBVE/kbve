using Unity.Entities;

namespace RareIcon
{
    /// <summary>Per-building profession reservations. "This Capital requires at least N Guards at all times." Dispatcher aggregates these globally and adds a strong score bonus for under-reserved roles, so reserved slots fill before free-scoring roles even with no active threat.</summary>
    public struct ReservedRoles : IComponentData
    {
        public byte Lumberjack;
        public byte Miner;
        public byte Guard;
        public byte Looter;
        public byte Farmer;
        public byte Builder;
        public byte Chef;
        public byte Hunter;
        public byte Blacksmith;
        public byte Craftsman;
        public byte Medic;

        public byte Get(byte kind) => kind switch
        {
            ProfessionKind.Lumberjack => Lumberjack,
            ProfessionKind.Miner      => Miner,
            ProfessionKind.Guard      => Guard,
            ProfessionKind.Looter     => Looter,
            ProfessionKind.Farmer     => Farmer,
            ProfessionKind.Builder    => Builder,
            ProfessionKind.Chef       => Chef,
            ProfessionKind.Hunter     => Hunter,
            ProfessionKind.Blacksmith => Blacksmith,
            ProfessionKind.Craftsman  => Craftsman,
            ProfessionKind.Medic      => Medic,
            _                         => (byte)0,
        };
    }
}
