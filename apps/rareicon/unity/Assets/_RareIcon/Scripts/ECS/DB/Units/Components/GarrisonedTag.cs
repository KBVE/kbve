using Unity.Entities;

namespace RareIcon
{
    public struct GarrisonedTag : IComponentData, IEnableableComponent
    {
        public Entity Host;
    }
}
