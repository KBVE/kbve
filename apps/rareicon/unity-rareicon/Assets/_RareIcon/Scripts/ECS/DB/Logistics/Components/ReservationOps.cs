using Unity.Entities;

namespace RareIcon
{
    /// <summary>Factory helpers for constructing LedgerKey + ReservationRecord pairs per intent. Keeps producer sites concise and the priority/tick discipline consistent.</summary>
    public static class ReservationOps
    {
        public const byte DefaultPriority = 128;

        public static LedgerKey Key(Entity bank, ushort itemId)
            => new LedgerKey { Bank = bank, ItemId = itemId };

        public static ReservationRecord Produce(Entity bank, int amount, uint tick, byte priority = DefaultPriority)
            => new ReservationRecord
            {
                Requester = bank,
                Dest      = bank,
                Amount    = amount,
                Priority  = priority,
                Intent    = (byte)ReservationIntent.Produce,
                Tick      = tick,
            };

        public static ReservationRecord Consume(Entity bank, int amount, uint tick, byte priority = DefaultPriority)
            => new ReservationRecord
            {
                Requester = bank,
                Dest      = Entity.Null,
                Amount    = amount,
                Priority  = priority,
                Intent    = (byte)ReservationIntent.Consume,
                Tick      = tick,
            };

        public static ReservationRecord Surplus(Entity source, Entity dest, int amount, uint tick, byte priority = DefaultPriority)
            => new ReservationRecord
            {
                Requester = source,
                Dest      = dest,
                Amount    = amount,
                Priority  = priority,
                Intent    = (byte)ReservationIntent.Surplus,
                Tick      = tick,
            };

        public static ReservationRecord Pickup(Entity requester, int amount, uint tick, byte priority = DefaultPriority)
            => new ReservationRecord
            {
                Requester = requester,
                Dest      = Entity.Null,
                Amount    = amount,
                Priority  = priority,
                Intent    = (byte)ReservationIntent.Pickup,
                Tick      = tick,
            };

        public static ReservationRecord Refill(Entity requester, int amount, uint tick, byte priority = DefaultPriority)
            => new ReservationRecord
            {
                Requester = requester,
                Dest      = Entity.Null,
                Amount    = amount,
                Priority  = priority,
                Intent    = (byte)ReservationIntent.Refill,
                Tick      = tick,
            };

        public static ReservationRecord Deposit(Entity requester, int amount, uint tick, byte priority = DefaultPriority)
            => new ReservationRecord
            {
                Requester = requester,
                Dest      = Entity.Null,
                Amount    = amount,
                Priority  = priority,
                Intent    = (byte)ReservationIntent.Deposit,
                Tick      = tick,
            };
    }
}
