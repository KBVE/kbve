using Unity.Entities;
using Unity.Mathematics;
using UnityEngine;

namespace KBVE.MMExtensions.Orchestrator.DOTS
{
    /// <summary>
    /// Component for 2D sprite rendering data
    /// </summary>
    public struct Sprite2DRenderer : IComponentData
    {
        public int SpriteID; // Index into sprite atlas or sprite array
        public float2 Size; // Width and height of sprite
        public float4 Color; // Tint color (RGBA)
        public int SortingLayer; // For 2D sorting
        public int SortingOrder; // Order within layer
        public bool FlipX;
        public bool FlipY;

        public static Sprite2DRenderer CreateDefault()
        {
            return new Sprite2DRenderer
            {
                SpriteID = 0,
                Size = new float2(1f, 1f),
                Color = new float4(1f, 1f, 1f, 1f),
                SortingLayer = 0,
                SortingOrder = 0,
                FlipX = false,
                FlipY = false
            };
        }
    }

    /// <summary>
    /// Component for sprite animation
    /// </summary>
    public struct SpriteAnimation : IComponentData
    {
        public int CurrentFrame;
        public int StartFrame;
        public int EndFrame;
        public float FrameRate;
        public float Timer;
        public bool IsLooping;
        public bool IsPlaying;

        public static SpriteAnimation CreateDefault()
        {
            return new SpriteAnimation
            {
                CurrentFrame = 0,
                StartFrame = 0,
                EndFrame = 0,
                FrameRate = 12f,
                Timer = 0f,
                IsLooping = true,
                IsPlaying = false
            };
        }
    }

    /// <summary>
    /// Shared component for sprite batch rendering
    /// Entities with same SpriteSheet will be batched together
    /// </summary>
    public struct SpriteSheet : ISharedComponentData, System.IEquatable<SpriteSheet>
    {
        public int TextureID; // Reference to texture/atlas
        public int MaterialID; // Reference to material

        public bool Equals(SpriteSheet other)
        {
            return TextureID == other.TextureID && MaterialID == other.MaterialID;
        }

        public override int GetHashCode()
        {
            return TextureID * 397 ^ MaterialID;
        }
    }

    /// <summary>
    /// Component to mark entities that need sprite rendering
    /// </summary>
    public struct SpriteRenderTag : IComponentData
    {
    }

    /// <summary>
    /// Buffer for sprite instance data used in batch rendering
    /// </summary>
    [InternalBufferCapacity(0)]
    public struct SpriteInstanceData : IBufferElementData
    {
        public float4x4 Matrix; // Transform matrix
        public float4 UV; // UV coordinates for sprite in atlas
        public float4 Color; // Instance color
    }
}