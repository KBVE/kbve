using Unity.Entities;

namespace RareIcon
{
    /// <summary>Mirrors BuildModeController.Target into the <see cref="BuildMode"/> singleton for ECS-side reads.</summary>
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
