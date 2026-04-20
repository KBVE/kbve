using Unity.Entities;

namespace RareIcon
{
    /// <summary>Singleton day/night clock — 180s per turn, even turns = day, odd = night. AbsSeconds is the monotonic value used for decay + persistence.</summary>
    // TODO(rust-ffi): mirror AbsSeconds + TurnIndex into Rust every frame so server-side decay math (arrow rot, decal expiry, buff tick) uses the same clock as the client.
    public struct WorldClock : IComponentData
    {
        public const float TurnDuration = 180f;

        public uint  TurnIndex;
        public float TurnElapsed;
        public float AbsSeconds;
        public float SunAltitude;
        public float MoonAltitude;
        public float DayT;
        public bool  IsDay;
    }
}
