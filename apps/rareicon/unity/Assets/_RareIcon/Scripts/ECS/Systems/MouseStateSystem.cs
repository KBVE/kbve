using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>
    /// ECS-side bridge: copies the managed MouseSnapshot into the MouseState
    /// singleton each frame. No input/camera/UI logic lives here — those are
    /// owned by MouseStateSource and IUiPointerBlocker.
    /// </summary>
    [WorldSystemFilter(WorldSystemFilterFlags.LocalSimulation | WorldSystemFilterFlags.ClientSimulation | WorldSystemFilterFlags.ThinClientSimulation)]
    [UpdateInGroup(typeof(InitializationSystemGroup))]
    public partial struct MouseStateSystem : ISystem
    {
        public void OnCreate(ref SystemState state)
        {
            state.EntityManager.CreateSingleton(new MouseState
            {
                WorldPos = float2.zero,
                HexCoord = new int2(int.MinValue, int.MinValue),
                Changed = false,
                OverUI = false,
                LeftPressedThisFrame = false,
                LeftReleasedThisFrame = false,
                IsDragging = false,
                DragEndedThisFrame = false,
            });
        }

        public void OnUpdate(ref SystemState state)
        {
            var src = MouseStateBridge.Source;
            if (src == null) return;
            var snap = src.Value;

            SystemAPI.SetSingleton(new MouseState
            {
                WorldPos = snap.WorldPos,
                HexCoord = snap.HexCoord,
                Changed = snap.HexChanged,
                OverUI = snap.OverUI,
                LeftPressedThisFrame = snap.LeftPressedThisFrame,
                LeftReleasedThisFrame = snap.LeftReleasedThisFrame,
                IsDragging = snap.IsDragging,
                DragEndedThisFrame = snap.DragEndedThisFrame,
            });
        }
    }
}
