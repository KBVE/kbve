using Unity.Entities;

namespace RareIcon
{
    /// <summary>Copies managed <see cref="PauseService"/> state into the <see cref="PauseState"/> singleton so Burst jobs can read it. SystemBase because it crosses the managed boundary; O(1) per frame.</summary>
    [UpdateInGroup(typeof(InitializationSystemGroup))]
    public partial class PauseStateMirrorSystem : SystemBase
    {
        protected override void OnCreate()
        {
            EntityManager.CreateSingleton(new PauseState());
        }

        protected override void OnUpdate()
        {
            var src = PauseBridge.Source;
            if (src == null) return;
            SystemAPI.SetSingleton(new PauseState
            {
                IsPaused  = src.IsPaused ? (byte)1 : (byte)0,
                TopReason = (byte)src.TopReason,
            });
        }
    }
}
