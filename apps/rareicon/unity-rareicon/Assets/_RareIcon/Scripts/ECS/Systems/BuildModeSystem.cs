using Unity.Entities;

namespace RareIcon
{
    /// <summary>
    /// ECS-side bridge: copies BuildModeController's current target into
    /// the BuildMode singleton each frame. No input logic lives here —
    /// keyboard/button toggles are owned by BuildModeController on the
    /// managed side. This system only mirrors state so ECS jobs can
    /// read it via SystemAPI.GetSingleton without touching managed code.
    ///
    /// Mirrors the MouseStateSystem / MouseStateBridge pattern so all
    /// UI↔ECS bridges look identical.
    /// </summary>
    [UpdateInGroup(typeof(InitializationSystemGroup))]
    public partial struct BuildModeSystem : ISystem
    {
        public void OnCreate(ref SystemState state)
        {
            state.EntityManager.CreateSingleton(new BuildMode
            {
                Target = BuildTarget.None,
            });
        }

        public void OnUpdate(ref SystemState state)
        {
            var src = BuildModeBridge.Source;
            byte target = src == null ? BuildTarget.None : src.Target.CurrentValue;
            SystemAPI.SetSingleton(new BuildMode { Target = target });
        }
    }
}
