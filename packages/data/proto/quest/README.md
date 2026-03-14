# Quest Proto — Universal Branching Quest Graph

A data-driven, branching quest system proto for multi-game use, supporting staged progression, prerequisites, timed availability, NPC/dialogue integration, player choice, outcome-driven narrative flow, and world-state flags.

## File

- **`questdb.proto`** — complete quest schema with registry

## Architecture

The quest system operates as a **narrative quest graph** with these layers:

1. **Core definition** — identity, category, tags, visual
2. **Progression model** — ordered steps with objectives, triggers, chain membership
3. **World integration** — NPC linkage (giver/turn-in), zone refs, party size
4. **Rules and gating** — prerequisites, class/faction/item/flag restrictions, time windows
5. **Narrative and branching** — choices with consequences, multiple outcomes, world-state flags
6. **Dialogue hooks** — references into NPC dialogue trees at quest transition points

## Integration Points

| System | How Quests Are Referenced |
|--------|-------------------------|
| NPC proto | `quest_refs`, `prerequisite_quest_refs`, `NPC_TYPE_QUEST_GIVER`, `DialogueTree` |
| Item proto | `quest_requirement`, `ITEM_TYPE_QUEST`, `source_type: "quest"` |
| astro-kbve | MDX frontmatter via `IQuestSchema`, served at `/api/questdb.json` |
| discordsh | Story events and room choices (implicit objectives, no formal quest system yet) |
| isometric | Not yet integrated |

## Enums

| Enum | Values | Purpose |
|------|--------|---------|
| `QuestCategory` | 8 types | main, side, daily, event, challenge, tutorial, bounty, guild |
| `ObjectiveType` | 9 types | collect, kill, visit, interact, escort, defend, craft, explore, custom |
| `QuestStatus` | 7 states | Runtime tracking: locked → available → active → complete → turned_in → failed → abandoned |
| `ChoiceConsequenceType` | 13 types | advance, fail, branch, give/take item, reputation, spawn, teleport, unlock, set/clear flag, NPC disposition |
| `FailurePolicy` | 4 modes | permanent, retry step, retry quest, soft-fail |
| `RewardPolicy` | 3 modes | individual, shared (split), leader-only |

## Sub-messages

### Objectives & Steps

- **`QuestObjective`** — type, target refs, required amount, optional/hidden flags, zone restriction, sequential ordering
- **`QuestStep`** — one stage in quest progression with objectives, choices, step rewards, dialogue hooks, failure policy, per-step timeout, and behavior flags (parallel, auto_complete, hidden, skippable)
- **`QuestChoice`** — dialogue option with consequence type, class/item restrictions, outcome selection, flag setting, and dialogue node jump

### Branching & Outcomes

- **`QuestOutcome`** — a possible ending with its own rewards, chain continuation, consequence flags, ending type (good/neutral/evil/secret), and canonical flag
- **`QuestDialogueHooks`** — references into NPC dialogue trees at accept/in-progress/complete/turn-in/fail/abandon transition points
- **`RepeatRewards`** — first-time vs subsequent completion reward variants

### Prerequisites & Time

- **`QuestPrerequisite`** — level, completed quests, faction, items, class, custom trigger
- **`QuestTimeLimits`** — time limit, availability window (ISO 8601), repeatable cooldown, daily reset hour

### Rewards

- **`QuestRewards`** — items, currency, XP, arbitrary stat bonuses (`map<string, double>`), achievement meta, unlock refs, reputation
- **`QuestItemReward`** — item ref + amount
- **`AchievementMeta`** — platform achievement integration (Steam) with progress tracking

### Extensibility

- **`QuestExtension`** — namespaced key-value pairs for game-specific data
- **`QuestChain`** — groups ordered quests into a storyline with chain-completion bonus rewards

## Quest Message Fields (by section)

```
Identity:        id, slug, title, description, lore
Classification:  category, tags
Visual:          icon, img, marker_icon
Prerequisites:   prerequisites { level, quests, faction, items, class, trigger }
Behavior:        hidden, repeatable, auto_accept, auto_complete, shareable,
                 abandonable, tracked
Time:            time_limits { time_limit, available_after/until, cooldown, daily_reset }
Steps:           steps[] { id, title, description, speaker, objectives[], choices[],
                           next_step, step_rewards, triggers, parallel, auto_complete,
                           hidden, skippable, failure_policy, step_timeout, dialogue_hooks }
Outcomes:        outcomes[] { id, description, rewards, next_quest_ref, flags, ending_type }
Chain:           next_quest_ref, chain_ref
NPC linkage:     giver_npc_refs[], turn_in_npc_refs[]
Location:        zone_refs[], recommended_level, recommended_party_size
Rewards:         rewards { items, currency, xp, bonuses, achievement, unlocks, reputation }
Repeat rewards:  repeat_rewards { first_time, repeat }
Reward policy:   reward_policy (individual / shared / leader)
Failure:         failure_policy (permanent / retry_step / retry_quest / soft_fail)
Dialogue:        dialogue_hooks { accept, in_progress, complete, turn_in, fail, abandon }
World state:     required_flags[], blocked_by_flags[]
Triggers:        triggers[]
Extensions:      extensions[]
Metadata:        credits, drafted
```

## Registry

`QuestRegistry` contains:
- `repeated Quest quests` — all quest definitions
- `repeated QuestChain chains` — quest chain / storyline groupings

## Design Decisions

- **Quest graph, not quest record**: Quests support non-linear flow via `QuestOutcome`, branching `QuestChoice`, and world-state flags that gate availability.
- **Steps with independent failure**: Each `QuestStep` can have its own `FailurePolicy` and timeout, so a timed escort step can soft-fail without killing the entire quest.
- **Dialogue is owned by NPCs**: Quest proto only stores `QuestDialogueHooks` — references to entry points in the NPC's `DialogueTree`. Content lives in `npcdb.proto`.
- **Outcomes drive divergence**: Multiple `QuestOutcome` entries allow different rewards, chain continuations, and world-state consequences per ending. A quest with no outcomes uses the single `rewards` field.
- **World-state flags**: `required_flags` and `blocked_by_flags` on quests, plus `set_flags` on choices, enable quests to react to prior player decisions across the entire game.
- **Reward policies**: Party quests specify whether rewards are individual, shared, or leader-only. Repeatable quests can give different rewards on first vs subsequent completions.
- **QuestStatus is runtime-only**: The enum exists for game clients to track progress but is NOT stored in the definition proto.
- **Triggers are string expressions**: Format is game-specific (e.g. `"player:level:5"`, `"area:kitchen-zone"`). Keeps the proto agnostic to game engine.

## Related

- NPC proto: [`../npc/`](../npc/) (quest_refs, giver NPCs, DialogueTree)
- Item proto: [`../item/`](../item/) (quest requirements, quest items)
- Common types: [`../kbve/common.proto`](../kbve/common.proto)
- Astro-kbve quest schema: `apps/kbve/astro-kbve/src/data/schema/IQuestSchema.ts`
- Astro-kbve quest content: `apps/kbve/astro-kbve/src/content/docs/questdb/`
