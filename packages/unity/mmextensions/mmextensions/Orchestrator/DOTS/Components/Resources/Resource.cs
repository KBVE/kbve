using Unity.Entities;
using System;
using System.Runtime.CompilerServices;
using Unity.Collections;


namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    public enum ResourceType : byte
    {
        None = 0,
        Wood = 1,
        Stone = 2,
        Metal = 3,
        Food = 4
    }

    [Flags]
    public enum ResourceFlags : byte
    {
        None = 0,
        IsHarvestable = 1 << 0,
        IsDepleted = 1 << 1,
    }

    public struct Resource : IComponentData
    {
        public FixedBytes16 templateUlid;
        public ResourceType type;
        public ResourceFlags flags;
        public ushort amount;
        public ushort maxAmount;
        public ushort harvestYield;

        public float harvestTime;
    }

    public struct ResourceID : IComponentData
    {
        public FixedBytes16 instanceUlid;
    }

    public static class ResourceExtensions
    {

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static bool IsDepleted(this Resource resource)
        {
            return (resource.flags & ResourceFlags.IsDepleted) != 0;
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static void SetDepleted(ref this Resource resource, bool value)
        {
            if (value)
                resource.flags |= ResourceFlags.IsDepleted;
            else
                resource.flags &= ~ResourceFlags.IsDepleted;
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static bool IsHarvestable(this Resource resource)
        {

            return (resource.flags & ResourceFlags.IsHarvestable) != 0
                    && resource.amount > 0
                    && !resource.IsDepleted();
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static bool GetHarvestableFlag(this Resource resource)
        {
            return (resource.flags & ResourceFlags.IsHarvestable) != 0;
        }

        [MethodImpl(MethodImplOptions.AggressiveInlining)]
        public static void SetHarvestableFlag(ref this Resource resource, bool value)
        {
            if (value)
                resource.flags |= ResourceFlags.IsHarvestable;
            else
                resource.flags &= ~ResourceFlags.IsHarvestable;
        }
    }
}