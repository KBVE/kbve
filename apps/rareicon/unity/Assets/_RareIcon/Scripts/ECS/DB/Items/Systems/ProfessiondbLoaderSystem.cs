using Unity.Entities;

namespace RareIcon
{
    [UpdateInGroup(typeof(InitializationSystemGroup), OrderFirst = true)]
    public partial class ProfessiondbLoaderSystem : SystemBase
    {
        protected override void OnCreate()
        {
            Enabled = true;
        }

        protected override void OnUpdate()
        {
            Enabled = false;
            ProfessiondbCache.EnsureLoaded();
        }
    }
}
