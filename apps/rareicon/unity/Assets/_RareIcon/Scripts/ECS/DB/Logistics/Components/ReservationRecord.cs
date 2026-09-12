using Unity.Entities;

namespace RareIcon
{
    public struct ReservationRecord
    {
        public Entity Requester;
        public Entity Dest;
        public int    Amount;
        public byte   Priority;
        public byte   Intent;
        public uint   Tick;
    }
}
