using Unity.Entities;

namespace RareIcon
{
    public struct DeliveryRecord
    {
        public LedgerKey Source;
        public LedgerKey Dest;
        public Entity    Requester;
        public int       Granted;
        public byte      Intent;
    }
}
