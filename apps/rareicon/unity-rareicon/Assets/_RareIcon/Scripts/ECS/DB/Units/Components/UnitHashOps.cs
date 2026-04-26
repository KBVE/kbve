using Unity.Burst;
using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    [BurstCompile]
    public static class UnitHashOps
    {
        [BurstCompile]
        public static uint Spread(in Entity e)
        {
            unchecked
            {
                uint h = (uint)e.Index   * 0xCC9E2D51u;
                h ^= (uint)e.Version * 0x1B873593u;
                h ^= h >> 16;
                h *= 0x85EBCA6Bu;
                h ^= h >> 13;
                h *= 0xC2B2AE35u;
                h ^= h >> 16;
                return h;
            }
        }

        [BurstCompile]
        public static uint Spread(uint seed)
        {
            unchecked
            {
                uint h = seed * 0xCC9E2D51u;
                h ^= h >> 16;
                h *= 0x85EBCA6Bu;
                h ^= h >> 13;
                h *= 0xC2B2AE35u;
                h ^= h >> 16;
                return h;
            }
        }

        [BurstCompile]
        public static uint HexHash(int2 hex)
        {
            unchecked
            {
                uint h = (uint)hex.x * 0xCC9E2D51u;
                h ^= (uint)hex.y * 0x1B873593u;
                h ^= h >> 16;
                h *= 0x85EBCA6Bu;
                h ^= h >> 13;
                h *= 0xC2B2AE35u;
                h ^= h >> 16;
                return h;
            }
        }
    }
}
