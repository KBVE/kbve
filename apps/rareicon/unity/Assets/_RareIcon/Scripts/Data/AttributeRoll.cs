using Unity.Mathematics;

namespace RareIcon
{
    /// <summary>Rolls per-character attributes from an NPCDef base, ±20% deterministic from rng byte lanes.
    /// Base 0 stays 0; otherwise clamped to [1, 255]. Pure + deterministic so spawn and rehydrate agree.</summary>
    public static class AttributeRoll
    {
        public static UnitAttributes Roll(in NPCDef def, uint rng) => new UnitAttributes
        {
            Strength  = Scale(def.Strength,  (byte)(rng         & 0xFF)),
            Agility   = Scale(def.Agility,   (byte)((rng >> 8)  & 0xFF)),
            Intellect = Scale(def.Intellect, (byte)((rng >> 16) & 0xFF)),
            Will      = Scale(def.Will,      (byte)((rng >> 24) & 0xFF)),
        };

        static byte Scale(byte b, byte noise)
        {
            if (b == 0) return 0;
            float spread = 0.8f + noise / 255f * 0.4f;   // [0.8, 1.2]
            int v = (int)math.round(b * spread);
            return (byte)math.clamp(v, 1, 255);
        }
    }
}
