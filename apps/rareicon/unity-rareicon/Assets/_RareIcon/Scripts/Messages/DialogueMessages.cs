using Unity.Entities;

namespace RareIcon
{
    /// <summary>Which renderer handles a <see cref="DialogueNode"/> — pauses game time and takes over the screen (VN) or floats an ambient emoji above the speaker (Bubble).</summary>
    public enum DialogueMode : byte
    {
        Bubble = 0,
        VN     = 1,
    }

    /// <summary>Preset emoji set for speech bubbles. Renderers map this byte to a glyph. Keeping it enum-bounded means bubble payloads stay blittable and we control what's in the set.</summary>
    public enum BubbleEmoji : byte
    {
        None     = 0,
        Wave     = 1,
        Alert    = 2,
        Sword    = 3,
        Food     = 4,
        Sleep    = 5,
        Question = 6,
        Heart    = 7,
        Skull    = 8,
        Coin     = 9,
    }

    /// <summary>Start a dialogue tree. Speaker may be <see cref="Entity.Null"/> for narrator-driven trees (tutorial, intro crawl).</summary>
    public readonly struct DialogueStartMessage
    {
        public readonly ushort TreeId;
        public readonly Entity Speaker;
        public DialogueStartMessage(ushort treeId, Entity speaker = default)
        {
            TreeId  = treeId;
            Speaker = speaker;
        }
    }

    /// <summary>Advance the active dialogue tree to the next node. Published by VN click/space/enter when the current node has no choices.</summary>
    public readonly struct DialogueAdvanceMessage { }

    /// <summary>Player picked choice <paramref name="Index"/> on the active node. Index is 0-based.</summary>
    public readonly struct DialogueChoiceMessage
    {
        public readonly int Index;
        public DialogueChoiceMessage(int index) => Index = index;
    }

    /// <summary>Player asked to abort the active tree (X button on the VN panel). Distinct from <see cref="DialogueAdvanceMessage"/> because choice nodes block advance — cancel skips straight to End regardless of the current node's choice state. Controller emits <see cref="DialogueEndedMessage"/> as the post-cancel signal so downstream listeners stay agnostic to how the tree closed.</summary>
    public readonly struct DialogueCancelMessage { }

    /// <summary>Active tree finished (reached a terminal node or was cancelled). Sent once per tree run.</summary>
    public readonly struct DialogueEndedMessage
    {
        public readonly ushort TreeId;
        public DialogueEndedMessage(ushort treeId) => TreeId = treeId;
    }

    /// <summary>Fire an ambient speech bubble above an entity. Non-blocking — game keeps ticking. <paramref name="Duration"/> of 0 uses the renderer's default.</summary>
    public readonly struct SpeechBubbleMessage
    {
        public readonly Entity Speaker;
        public readonly BubbleEmoji Emoji;
        public readonly float Duration;
        public SpeechBubbleMessage(Entity speaker, BubbleEmoji emoji, float duration = 0f)
        {
            Speaker  = speaker;
            Emoji    = emoji;
            Duration = duration;
        }
    }
}
