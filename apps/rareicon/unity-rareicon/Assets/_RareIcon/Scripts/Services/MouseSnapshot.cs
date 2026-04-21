using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Immutable per-frame mouse snapshot. Produced by IMouseStateSource, consumed by managed UI (via R3) and the ECS sync system.</summary>
    public readonly struct MouseSnapshot
    {
        public readonly float2 ScreenPos;
        public readonly float2 WorldPos;
        public readonly int2 HexCoord;
        public readonly bool HexChanged;
        public readonly bool OverUI;
        public readonly bool LeftPressedThisFrame;
        public readonly bool LeftReleasedThisFrame;

        public readonly bool IsDragging;
        public readonly bool DragStartedThisFrame;
        public readonly bool DragEndedThisFrame;
        public readonly float2 PressScreenPos;
        public readonly float2 PressWorldPos;

        public MouseSnapshot(
            float2 screenPos,
            float2 worldPos,
            int2 hexCoord,
            bool hexChanged,
            bool overUI,
            bool leftPressedThisFrame,
            bool leftReleasedThisFrame,
            bool isDragging,
            bool dragStartedThisFrame,
            bool dragEndedThisFrame,
            float2 pressScreenPos,
            float2 pressWorldPos)
        {
            ScreenPos = screenPos;
            WorldPos = worldPos;
            HexCoord = hexCoord;
            HexChanged = hexChanged;
            OverUI = overUI;
            LeftPressedThisFrame = leftPressedThisFrame;
            LeftReleasedThisFrame = leftReleasedThisFrame;
            IsDragging = isDragging;
            DragStartedThisFrame = dragStartedThisFrame;
            DragEndedThisFrame = dragEndedThisFrame;
            PressScreenPos = pressScreenPos;
            PressWorldPos = pressWorldPos;
        }

        public static MouseSnapshot Empty => new(
            float2.zero,
            float2.zero,
            new int2(int.MinValue, int.MinValue),
            false, false, false, false,
            false, false, false,
            float2.zero, float2.zero);
    }
}
