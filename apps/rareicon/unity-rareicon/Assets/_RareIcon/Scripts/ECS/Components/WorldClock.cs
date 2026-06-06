using Unity.Entities;

namespace RareIcon
{
    /// <summary>Singleton day/night clock — 180s per turn, even turns = day, odd = night. AbsSeconds is the monotonic value used for decay + persistence.</summary>

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
