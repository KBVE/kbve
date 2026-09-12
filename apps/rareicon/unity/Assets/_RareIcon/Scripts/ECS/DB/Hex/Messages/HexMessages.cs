using Unity.Entities;
using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Main-thread MessagePipe event emitted once per applied hex index mutation. Managed subscribers (UI panels, minimap, audio cues, chunk save pipelines) react here instead of polling <see cref="HexDBSingleton"/>.</summary>
    public readonly struct HexChangedMessage
    {
        public readonly HexEventKind Kind;
        public readonly int2         Coord;
        public readonly Entity       Entity;

        public HexChangedMessage(HexEventKind kind, int2 coord, Entity entity)
        {
            Kind = kind; Coord = coord; Entity = entity;
        }
    }
}
