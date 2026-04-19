using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>
    /// Immutable per-frame mouse snapshot. Produced by IMouseStateSource,
    /// consumed by managed UI (via R3) and the ECS sync system.
    /// </summary>
    public readonly struct MouseSnapshot
    {
        public readonly float2 ScreenPos;
        public readonly float2 WorldPos;
        public readonly int2 HexCoord;
        public readonly bool HexChanged;
        public readonly bool OverUI;
        public readonly bool LeftPressedThisFrame;
        public readonly bool LeftReleasedThisFrame;

        public MouseSnapshot(
            float2 screenPos,
            float2 worldPos,
            int2 hexCoord,
            bool hexChanged,
            bool overUI,
            bool leftPressedThisFrame,
            bool leftReleasedThisFrame)
        {
            ScreenPos = screenPos;
            WorldPos = worldPos;
            HexCoord = hexCoord;
            HexChanged = hexChanged;
            OverUI = overUI;
            LeftPressedThisFrame = leftPressedThisFrame;
            LeftReleasedThisFrame = leftReleasedThisFrame;
        }

        public static MouseSnapshot Empty => new(
            float2.zero,
            float2.zero,
            new int2(int.MinValue, int.MinValue),
            false, false, false, false);
    }
}
