using Unity.Entities;

namespace RareIcon
{
    /// <summary>Unit currently in the player's drag-select group. Cleared on new drag-start, refilled by SelectionSystem on drag-end. Bulk move orders (SelectionMoveMessage) iterate every entity carrying this tag.</summary>
    public struct SelectedTag : IComponentData { }
}
