using Unity.Collections;
using Unity.Entities;

namespace RareIcon
{
    /// <summary>Generic Burst-friendly display payload. Producers ([BurstCompile] ISystems specific to each surface — lobby member, HUD label, inspector body, tooltip, toast row) compose the final localized text into <see cref="Line"/> and bump <see cref="Version"/> only when the bytes change. Main-thread bridges change-gate on <see cref="Version"/>, do a single <c>ToString()</c> at the UIToolkit boundary, and assign to <see cref="UnityEngine.UIElements.Label.text"/>. <see cref="FixedString128Bytes"/> covers most one-line UI text (125 UTF-8 bytes); long-form bodies (dialogue, multi-line tooltips) get a future <c>LocalizedDisplayLong</c> sibling backed by FS512.</summary>
    public struct LocalizedDisplay : IComponentData
    {
        /// <summary>Final composed text in UTF-8 bytes. Producers write; readers ToString() exactly once at the Label boundary. Empty until the first producer pass populates it.</summary>
        public FixedString128Bytes Line;

        /// <summary>Bumped every time <see cref="Line"/> changes. Main-thread bridges store last-seen version per entity and skip reads when stale; identical version = identical bytes, no UI re-bind needed.</summary>
        public uint Version;
    }
}
