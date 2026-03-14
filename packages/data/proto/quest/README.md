# Quest Proto — Universal Quest Database

Single source of truth for quest definitions across all KBVE games (astro-kbve questdb, discordsh dungeon events, isometric).

## File

- **`questdb.proto`** — complete quest schema with registry

## Existing Integration Points

| System | How Quests Are Referenced |
|--------|-------------------------|
| NPC proto | `quest_refs`, `prerequisite_quest_refs`, `NPC_TYPE_QUEST_GIVER` |
| Item proto | `quest_requirement`, `ITEM_TYPE_QUEST`, `source_type: "quest"` |
| astro-kbve | MDX frontmatter via `IQuestSchema`, served at `/api/questdb.json` |
| discordsh | Story events and room choices (implicit objectives, no formal quest system yet) |
| isometric | Not yet integrated |

## Enums

| Enum | Values | Purpose |
|------|--------|---------|
| `QuestCategory` | 8 types | main, side, daily, event, challenge, tutorial, bounty, guild |
| `ObjectiveType` | 9 types | collect, kill, visit, interact, escort, defend, craft, explore, custom |
| `QuestStatus` | 7 states | Runtime tracking: locked → available → active → complete → turned_in |
| `ChoiceConsequenceType` | 10 types | What happens when player picks a dialogue choice |

## Sub-messages

### Objectives & Steps

- **`QuestObjective`** — type, target refs, required amount, optional/hidden flags, zone restriction, sequential ordering
- **`QuestStep`** — one stage in quest progression with title, dialogue, speaker NPC, objectives, branching choices, intermediate rewards, and start/complete triggers
- **`QuestChoice`** — dialogue option with consequence type, class/item restrictions, and step override for branching

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
Steps:           steps[] { id, title, dialogue, speaker, objectives[], choices[],
                           next_step, step_rewards, triggers }
Chain:           next_quest_ref, chain_ref
NPC linkage:     giver_npc_refs[], turn_in_npc_refs[]
Location:        zone_refs[], recommended_level, recommended_party_size
Rewards:         rewards { items, currency, xp, bonuses, achievement, unlocks, reputation }
Triggers:        triggers[]
Extensions:      extensions[]
Metadata:        credits, drafted
```

## Registry

`QuestRegistry` contains:
- `repeated Quest quests` — all quest definitions
- `repeated QuestChain chains` — quest chain / storyline groupings

## Design Decisions

- **Steps vs flat objectives**: Quests use ordered `QuestStep` messages so multi-stage quests (talk → collect → return) are first-class, not hacked via triggers.
- **Choices with consequences**: `QuestChoice` supports branching, class-gated options, and consequence types (advance, fail, branch, give/take items, reputation, spawn enemies).
- **QuestStatus is runtime-only**: The enum exists for game clients to track progress but is NOT stored in the definition proto — quest definitions are static data.
- **Triggers are string expressions**: Format is game-specific (e.g. `"player:level:5"`, `"area:kitchen-zone"`, `"npc:killed:glass-slime"`). Keeps the proto agnostic to game engine.

## Related

- NPC proto: [`../npc/`](../npc/) (quest_refs, giver NPCs)
- Item proto: [`../item/`](../item/) (quest requirements, quest items)
- Common types: [`../kbve/common.proto`](../kbve/common.proto)
- Astro-kbve quest schema: `apps/kbve/astro-kbve/src/data/schema/IQuestSchema.ts`
- Astro-kbve quest content: `apps/kbve/astro-kbve/src/content/docs/questdb/`
