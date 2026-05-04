using Unity.Collections;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>Side-entity carrier emitted by Burst-side systems that want to publish a <see cref="ToastMessage"/> without taking a managed dependency. <see cref="ToastBridgeSystem"/> drains these every frame, publishes, and destroys the carrier. Text is a <see cref="FixedString128Bytes"/> so the payload stays Burst-safe; reuse a localised key + lookup if the toast text needs to live in another language.</summary>
    public struct PendingToast : IComponentData
    {
        public byte Kind;
        public FixedString128Bytes Text;
    }
}
