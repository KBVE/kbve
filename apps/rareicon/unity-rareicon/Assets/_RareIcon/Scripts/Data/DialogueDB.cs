using System.Collections.Generic;

namespace RareIcon
{
    /// <summary>Tree ID constants. Keep in sync with <see cref="DialogueDB"/> entries.</summary>
    public static class DialogueTreeId
    {
        public const ushort None                = 0;
        public const ushort HelloWorld          = 1;
        public const ushort WelcomeKing         = 2;
        public const ushort BanditTaunt         = 10;
        public const ushort FirstContactBandit  = 11;
        public const ushort FirstContactZombie  = 12;
        public const ushort LostGoblinBand      = 20;
        public const ushort RaiderSwarmWarning  = 21;
        public const ushort MerchantCaravan     = 22;
        public const ushort MysteriousStranger  = 23;
    }

    /// <summary>One branch from a node. <see cref="NextNodeId"/> of 0 ends the tree.</summary>
    public sealed class DialogueChoice
    {
        public string TextKey;
        public ushort NextNodeId;
    }

    /// <summary>A single dialogue beat. Either ambient (Bubble + emoji) or interactive (VN with optional choices). <see cref="NextNodeId"/> is the auto-advance target when <see cref="Choices"/> is null/empty. 0 = terminal.</summary>
    public sealed class DialogueNode
    {
        public ushort Id;
        public DialogueMode Mode;
        public string SpeakerNameKey;
        public string TextKey;
        public ushort NextNodeId;
        public DialogueChoice[] Choices;
        public BubbleEmoji Emoji;
        public float BubbleDuration;
    }

    /// <summary>A full dialogue tree. <see cref="EntryNodeId"/> names the first node visited.</summary>
    public sealed class DialogueTree
    {
        public ushort Id;
        public ushort EntryNodeId;
        public DialogueNode[] Nodes;

        public DialogueNode Find(ushort id)
        {
            if (Nodes == null) return null;
            for (int i = 0; i < Nodes.Length; i++)
                if (Nodes[i].Id == id) return Nodes[i];
            return null;
        }
    }

    /// <summary>Source of truth for dialogue trees. Same static-factory pattern as <see cref="NPCDB"/> / <see cref="ItemDB"/>. Text lives in <see cref="LocaleService"/> via the Nodes' TextKey / SpeakerNameKey — this table only holds structure.</summary>
    public static class DialogueDB
    {
        static Dictionary<ushort, DialogueTree> _byId;

        public static DialogueTree Get(ushort id)
        {
            EnsureInit();
            return _byId.TryGetValue(id, out var t) ? t : null;
        }

        static void EnsureInit()
        {
            if (_byId != null) return;
            _byId = new Dictionary<ushort, DialogueTree>();

            Add(new DialogueTree
            {
                Id = DialogueTreeId.HelloWorld,
                EntryNodeId = 1,
                Nodes = new[]
                {
                    new DialogueNode
                    {
                        Id             = 1,
                        Mode           = DialogueMode.VN,
                        SpeakerNameKey = "dialogue.hello.speaker",
                        TextKey        = "dialogue.hello.line0",
                        NextNodeId     = 2,
                    },
                    new DialogueNode
                    {
                        Id             = 2,
                        Mode           = DialogueMode.VN,
                        SpeakerNameKey = "dialogue.hello.speaker",
                        TextKey        = "dialogue.hello.line1",
                        Choices = new[]
                        {
                            new DialogueChoice { TextKey = "dialogue.hello.choice_yes",   NextNodeId = 3 },
                            new DialogueChoice { TextKey = "dialogue.hello.choice_no",    NextNodeId = 4 },
                            new DialogueChoice { TextKey = "dialogue.hello.choice_maybe", NextNodeId = 0 },
                        },
                    },
                    new DialogueNode
                    {
                        Id             = 3,
                        Mode           = DialogueMode.VN,
                        SpeakerNameKey = "dialogue.hello.speaker",
                        TextKey        = "dialogue.hello.line_yes",
                        NextNodeId     = 0,
                    },
                    new DialogueNode
                    {
                        Id             = 4,
                        Mode           = DialogueMode.VN,
                        SpeakerNameKey = "dialogue.hello.speaker",
                        TextKey        = "dialogue.hello.line_no",
                        NextNodeId     = 0,
                    },
                },
            });

            Add(new DialogueTree
            {
                Id = DialogueTreeId.WelcomeKing,
                EntryNodeId = 1,
                Nodes = new[]
                {
                    new DialogueNode
                    {
                        Id             = 1,
                        Mode           = DialogueMode.VN,
                        SpeakerNameKey = "creature.king",
                        TextKey        = "dialogue.welcome.line0",
                        NextNodeId     = 2,
                    },
                    new DialogueNode
                    {
                        Id             = 2,
                        Mode           = DialogueMode.VN,
                        SpeakerNameKey = "creature.king",
                        TextKey        = "dialogue.welcome.line1",
                        NextNodeId     = 0,
                    },
                },
            });

            Add(new DialogueTree
            {
                Id = DialogueTreeId.BanditTaunt,
                EntryNodeId = 1,
                Nodes = new[]
                {
                    new DialogueNode
                    {
                        Id             = 1,
                        Mode           = DialogueMode.Bubble,
                        Emoji          = BubbleEmoji.Sword,
                        BubbleDuration = 2.5f,
                        NextNodeId     = 0,
                    },
                },
            });

            Add(new DialogueTree
            {
                Id = DialogueTreeId.FirstContactBandit,
                EntryNodeId = 1,
                Nodes = new[]
                {
                    new DialogueNode
                    {
                        Id             = 1,
                        Mode           = DialogueMode.VN,
                        SpeakerNameKey = "creature.bandit",
                        TextKey        = "dialogue.first_contact.bandit.line0",
                        NextNodeId     = 2,
                    },
                    new DialogueNode
                    {
                        Id             = 2,
                        Mode           = DialogueMode.VN,
                        SpeakerNameKey = "creature.bandit",
                        TextKey        = "dialogue.first_contact.bandit.line1",
                        NextNodeId     = 0,
                    },
                },
            });

            Add(new DialogueTree
            {
                Id = DialogueTreeId.LostGoblinBand,
                EntryNodeId = 1,
                Nodes = new[]
                {
                    new DialogueNode
                    {
                        Id             = 1,
                        Mode           = DialogueMode.VN,
                        SpeakerNameKey = "dialogue.lost_goblins.speaker",
                        TextKey        = "dialogue.lost_goblins.line0",
                        NextNodeId     = 2,
                    },
                    new DialogueNode
                    {
                        Id             = 2,
                        Mode           = DialogueMode.VN,
                        SpeakerNameKey = "dialogue.lost_goblins.speaker",
                        TextKey        = "dialogue.lost_goblins.line1",
                        Choices = new[]
                        {
                            new DialogueChoice { TextKey = "dialogue.lost_goblins.choice_accept", NextNodeId = 3 },
                            new DialogueChoice { TextKey = "dialogue.lost_goblins.choice_refuse", NextNodeId = 4 },
                        },
                    },
                    new DialogueNode
                    {
                        Id             = 3,
                        Mode           = DialogueMode.VN,
                        SpeakerNameKey = "dialogue.lost_goblins.speaker",
                        TextKey        = "dialogue.lost_goblins.line_accept",
                        NextNodeId     = 0,
                    },
                    new DialogueNode
                    {
                        Id             = 4,
                        Mode           = DialogueMode.VN,
                        SpeakerNameKey = "dialogue.lost_goblins.speaker",
                        TextKey        = "dialogue.lost_goblins.line_refuse",
                        NextNodeId     = 0,
                    },
                },
            });

            Add(new DialogueTree
            {
                Id = DialogueTreeId.MerchantCaravan,
                EntryNodeId = 1,
                Nodes = new[]
                {
                    new DialogueNode
                    {
                        Id             = 1,
                        Mode           = DialogueMode.VN,
                        SpeakerNameKey = "dialogue.merchant.speaker",
                        TextKey        = "dialogue.merchant.line0",
                        NextNodeId     = 2,
                    },
                    new DialogueNode
                    {
                        Id             = 2,
                        Mode           = DialogueMode.VN,
                        SpeakerNameKey = "dialogue.merchant.speaker",
                        TextKey        = "dialogue.merchant.line_offer",
                        Choices = new[]
                        {
                            new DialogueChoice { TextKey = "dialogue.merchant.choice_accept", NextNodeId = 3 },
                            new DialogueChoice { TextKey = "dialogue.merchant.choice_refuse", NextNodeId = 4 },
                        },
                    },
                    new DialogueNode
                    {
                        Id             = 3,
                        Mode           = DialogueMode.VN,
                        SpeakerNameKey = "dialogue.merchant.speaker",
                        TextKey        = "dialogue.merchant.line_accept",
                        NextNodeId     = 0,
                    },
                    new DialogueNode
                    {
                        Id             = 4,
                        Mode           = DialogueMode.VN,
                        SpeakerNameKey = "dialogue.merchant.speaker",
                        TextKey        = "dialogue.merchant.line_refuse",
                        NextNodeId     = 0,
                    },
                },
            });

            Add(new DialogueTree
            {
                Id = DialogueTreeId.MysteriousStranger,
                EntryNodeId = 1,
                Nodes = new[]
                {
                    new DialogueNode
                    {
                        Id             = 1,
                        Mode           = DialogueMode.VN,
                        SpeakerNameKey = "dialogue.stranger.speaker",
                        TextKey        = "dialogue.stranger.line0",
                        NextNodeId     = 2,
                    },
                    new DialogueNode
                    {
                        Id             = 2,
                        Mode           = DialogueMode.VN,
                        SpeakerNameKey = "dialogue.stranger.speaker",
                        TextKey        = "dialogue.stranger.line_offer",
                        Choices = new[]
                        {
                            new DialogueChoice { TextKey = "dialogue.stranger.choice_gold",    NextNodeId = 3 },
                            new DialogueChoice { TextKey = "dialogue.stranger.choice_blessing", NextNodeId = 4 },
                            new DialogueChoice { TextKey = "dialogue.stranger.choice_refuse",  NextNodeId = 5 },
                        },
                    },
                    new DialogueNode
                    {
                        Id             = 3,
                        Mode           = DialogueMode.VN,
                        SpeakerNameKey = "dialogue.stranger.speaker",
                        TextKey        = "dialogue.stranger.line_gold",
                        NextNodeId     = 0,
                    },
                    new DialogueNode
                    {
                        Id             = 4,
                        Mode           = DialogueMode.VN,
                        SpeakerNameKey = "dialogue.stranger.speaker",
                        TextKey        = "dialogue.stranger.line_blessing",
                        NextNodeId     = 0,
                    },
                    new DialogueNode
                    {
                        Id             = 5,
                        Mode           = DialogueMode.VN,
                        SpeakerNameKey = "dialogue.stranger.speaker",
                        TextKey        = "dialogue.stranger.line_refuse",
                        NextNodeId     = 0,
                    },
                },
            });

            Add(new DialogueTree
            {
                Id = DialogueTreeId.RaiderSwarmWarning,
                EntryNodeId = 1,
                Nodes = new[]
                {
                    new DialogueNode
                    {
                        Id             = 1,
                        Mode           = DialogueMode.VN,
                        SpeakerNameKey = "dialogue.raider_swarm.speaker",
                        TextKey        = "dialogue.raider_swarm.line0",
                        NextNodeId     = 2,
                    },
                    new DialogueNode
                    {
                        Id             = 2,
                        Mode           = DialogueMode.VN,
                        SpeakerNameKey = "dialogue.raider_swarm.speaker",
                        TextKey        = "dialogue.raider_swarm.line1",
                        NextNodeId     = 0,
                    },
                },
            });

            Add(new DialogueTree
            {
                Id = DialogueTreeId.FirstContactZombie,
                EntryNodeId = 1,
                Nodes = new[]
                {
                    new DialogueNode
                    {
                        Id             = 1,
                        Mode           = DialogueMode.VN,
                        SpeakerNameKey = "creature.zombie",
                        TextKey        = "dialogue.first_contact.zombie.line0",
                        NextNodeId     = 2,
                    },
                    new DialogueNode
                    {
                        Id             = 2,
                        Mode           = DialogueMode.VN,
                        SpeakerNameKey = "creature.zombie",
                        TextKey        = "dialogue.first_contact.zombie.line1",
                        NextNodeId     = 0,
                    },
                },
            });
        }

        static void Add(DialogueTree tree) => _byId[tree.Id] = tree;
    }
}
