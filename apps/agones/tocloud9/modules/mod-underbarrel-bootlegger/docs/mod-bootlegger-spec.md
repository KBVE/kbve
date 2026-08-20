# mod-bootlegger — Build Specification (v2)

**A ground-up services-NPC module for AzerothCore (3.3.5a).**
Replaces the reference module `noisiver/mod-assistant`, which is cited only as an example of what **not** to do. Working name `mod-bootlegger`; the string `Bootleg`/`bootlegger` is a mechanical rename token (classes `Bootleg*`, script `npc_bootlegger`, config prefix `Bootleg.`) if the owner picks a different name.

> **Clean-room rule.** Do **not** copy, paste, or transliterate code, strings, or data from the reference module. Build from this spec's behavior contract only. Nothing is carried over.

---

## 1. Purpose & scope

A single goblin gossip NPC placed in major cities offering three paid, gold-sink convenience services. No item vending. No chat commands. Server-authoritative and exploit-resistant. Compiles on stock AzerothCore master **and** `liyunfan1223/mod-playerbots` (now GPLv2, aligned with AC).

### In scope
1. **Utilities** — flag the character for name / appearance / race / faction change via at-login flags.
2. **Professions** — raise a profession one tier at a time, sequentially, paying each tier's price (§6.2, the headline behavior).
3. **Instance reset** — reset saved heroic dungeons and raids, solo or group.

### Out of scope (removed vs. reference)
- All item sales and the entire `npc_vendor` surface.
- Flight-path unlocking (deleted, not ported).
- Any chat-command interface — NPC gossip only, by design.
- The bash scripts (`include.sh`, `conf/conf.sh.dist`).
- Any global `item_template` mutation.

---

## 2. Target environment & compatibility

- **Game version:** WotLK 3.3.5a.
- **Language standard:** **hard-target `-std=c++14`** (the owner's core currently only builds at 14). Write forward-compatible so it also builds under 17. **Avoid C++17-only features:** `std::string_view`, structured bindings, `if constexpr`, inline variables, `std::optional`, fold expressions. Use `char const*`/`std::string` in place of `string_view`.
- **Cores:** must build on stock `azerothcore/azerothcore-wotlk` master and `liyunfan1223/mod-playerbots`.
  - **No playerbot-only symbols** anywhere in `src/`. Only stock AC APIs: `Player`, `Creature`, `ChatHandler`, `ScriptedGossip`, `sInstanceSaveMgr`, `sConfigMgr`, `WorldSession`. A grep for playerbot identifiers must return nothing.
  - The one fork-sensitive spot is group iteration (§6.3).
- Warnings-clean under the core's flags.

### 2.1 Dev-environment resources (available to the build agent at runtime)
The agent runs inside the owner's dev tree and may use these to resolve real values instead of guessing. (These are **not** available when authoring the spec — only at build time.)
- **World DB DSN:** environment variable `MOD_UAC_WORLD_DATABASE_INFO`, AzerothCore format `host;port;user;pass;dbname`. Parse it and connect with a MySQL client to query/derive entry ids, GUIDs, and the goblin display id (see §9). Treat the password as a secret — never echo it or write it into committed files.
- **Client data:** `mod-bootlegger/data/client-data-v19.zip` (v19 DBCs). Contains `SkillLineAbility.dbc`, `SkillLine.dbc`, and `Spell.dbc` — the source of truth for the profession rank-spell map if §6.2 needs it. Extract and read these rather than hand-entering ids.
- **Neighboring sources:** other AzerothCore module sources and the server tree are on the same filesystem — use them to confirm current API signatures (`Player::SetSkill`, `learnSpell`, `sInstanceSaveMgr` calls, gossip helpers) against the actual core the module links to, instead of relying on memory.

**Rule:** anything the agent can derive from the DB or DBCs at build time, it must derive — not guess. Values that get baked into committed SQL (chosen entry, GUID block, display id) must be written as literals with a comment noting how they were derived.

---

## 3. Licensing note (non-blocking)

Core is GPLv2; the linked binary is a derivative and inherits GPLv2 copyleft **on distribution only**. A private, non-distributed server triggers no source-sharing obligation, and GPLv2 has no network clause. Original files may carry the owner's chosen SPDX header; the combined work still answers to GPLv2. Engineering note, not legal advice.

---

## 4. Directory layout

```
mod-bootlegger/
├── CMakeLists.txt
├── LICENSE
├── README.md
├── conf/
│   └── mod_bootlegger.conf.dist
├── data/
│   └── sql/
│       ├── db-world/
│       │   └── mod_bootlegger.sql              # idempotent install (auto-applied)
│       └── uninstall/
│           └── mod_bootlegger_uninstall.sql    # manual teardown
└── src/
    ├── BootlegConfig.h / .cpp                  # singleton config, gold→copper at load
    ├── BootlegService.h                        # abstract service contract
    ├── BootlegRegistry.h / .cpp                # owns service instances, routing
    ├── services/
    │   ├── UtilitiesService.h / .cpp
    │   ├── ProfessionsService.h / .cpp
    │   └── InstanceResetService.h / .cpp
    ├── BootlegGossip.h / .cpp                  # CreatureScript: gossip hooks
    ├── BootlegWorldScript.h / .cpp             # WorldScript: OnAfterConfigLoad
    └── mod_bootlegger.cpp                       # Addmod_bootleggerScripts()
```

---

## 5. Domain model

### 5.1 Config singleton (`BootlegConfig`)
- Meyers singleton (`static BootlegConfig& instance()`).
- `Load()` called from the WorldScript's `OnAfterConfigLoad(bool reload)` — re-reads on `.reload config`.
- **Gold→copper conversion happens once, at load.** All runtime money is stored/compared in copper. `GoldToCopper(gold) = gold * 10000u` with overflow guard (clamp gold at 21474, log if exceeded).
- Holds master enable, per-service enables, per-tier enables/costs, per-utility costs, instance costs, optional gates. No feature reads `sConfigMgr` at runtime.

### 5.2 Service contract (`BootlegService`) — illustrative, C++14-clean
```cpp
class BootlegService {
public:
    virtual ~BootlegService() = default;

    virtual char const* Key()       const = 0;   // "utilities" / "professions" / "instances"
    virtual uint32 ActionBase()     const = 0;   // start of this service's action block (§5.4)
    virtual bool IsEnabled()        const = 0;   // from BootlegConfig
    virtual bool IsAvailable(Player* player) const = 0;   // server-side eligibility for root entry

    virtual void AddRootEntry(Player* player) const = 0;  // draw root line (only if enabled+available)

    virtual bool OwnsAction(uint32 action) const;         // default: base <= action < base+BLOCK_SIZE
    virtual bool HandleAction(Player* player, Creature* creature, uint32 action) = 0;  // true = redraw root
};
```

### 5.3 Purchase primitive (single choke point for all gold charges)
```cpp
// validate -> funds -> charge -> grant, in this order, everywhere.
static bool Purchase(Player* player, uint32 costCopper,
                     std::function<bool()> const& stillEligible,
                     std::function<void()> const& grant) {
    if (!stillEligible())                    { return false; }        // never trust the client
    if (!player->HasEnoughMoney(costCopper)) {
        // AMENDED (owner-approved): native client feedback, not a chat message.
        player->SendBuyError(BUY_ERR_NOT_ENOUGHT_MONEY, 0, 0, 0);
        return false;
    }
    player->ModifyMoney(-int32(costCopper));
    grant();
    return true;
}
```
**Invariant:** the only `ModifyMoney(-x)` call site in the module is inside `Purchase`. Grants never precede the charge.

### 5.4 Action-ID allocation (Option A — fixed contiguous blocks)
```
ROOT_REFRESH     = 1
BLOCK_SIZE       = 100
UTILITIES_BASE   = 1000        // 1000..1099
PROFESSIONS_BASE = 1100        // 1100..1199
INSTANCES_BASE   = 1200        // 1200..1299
```
Each service owns `[BASE, BASE+BLOCK_SIZE)`; the dispatcher routes by range. `GOSSIP_SENDER_MAIN` only; reject any other sender.

### 5.5 Registration (normal multi-class)
```cpp
void Addmod_bootleggerScripts() {
    new BootlegWorldScript();     // loads BootlegConfig
    new BootlegCreatureScript();  // gossip
}
```
Shared state lives in the config singleton — no multiple-inheritance fusion. The registry holds the three service instances.

---

## 6. Service specifications

### 6.1 Utilities
- **Enable:** `Bootleg.Utilities.Enable` + master enable.
- **Sub-options & costs:**
  | Option | At-login flag | Cost key |
  |---|---|---|
  | Name change | `AT_LOGIN_RENAME` | `Bootleg.Utilities.NameChange.Cost` |
  | Appearance | `AT_LOGIN_CUSTOMIZE` | `Bootleg.Utilities.Customize.Cost` |
  | Race change | `AT_LOGIN_CHANGE_RACE` | `Bootleg.Utilities.RaceChange.Cost` |
  | Faction change | `AT_LOGIN_CHANGE_FACTION` | `Bootleg.Utilities.FactionChange.Cost` |
- **Eligibility (re-checked in `stillEligible`):** the player must not already have any of the four at-login flags pending. If any is set → message, no charge.
- **Grant:** `player->SetAtLoginFlag(flag)`, then instruct the player to relog. Charge precedes set (via `Purchase`).
- **Display:** cost shown on the gossip line with a confirm popup.

### 6.2 Professions — sequential tier purchase (HEADLINE)

**Tier ladder:**
| Tier | Rank/step | Max skill |
|---|---|---|
| Apprentice | 1 | 75 |
| Journeyman | 2 | 150 |
| Expert | 3 | 225 |
| Artisan | 4 | 300 |
| Master | 5 | 375 |
| Grand Master | 6 | 450 |

**Rule:** raise a profession **exactly one tier per purchase**, charging that tier's price each time. No skipping to a higher tier; proximity to a cap gives no discount (full tier price even 10 points from cap). To reach Artisan from below Expert you pay Expert, then Artisan.

**14 professions in one data table** (walked by both menu build and grant — no parallel switches):
```cpp
struct Profession { uint32 skillId; char const* name; };
static constexpr Profession kProfessions[] = {
    { SKILL_FIRST_AID, "First Aid" }, { SKILL_BLACKSMITHING, "Blacksmithing" },
    { SKILL_LEATHERWORKING, "Leatherworking" }, { SKILL_ALCHEMY, "Alchemy" },
    { SKILL_HERBALISM, "Herbalism" }, { SKILL_COOKING, "Cooking" },
    { SKILL_MINING, "Mining" }, { SKILL_TAILORING, "Tailoring" },
    { SKILL_ENGINEERING, "Engineering" }, { SKILL_ENCHANTING, "Enchanting" },
    { SKILL_FISHING, "Fishing" }, { SKILL_SKINNING, "Skinning" },
    { SKILL_INSCRIPTION, "Inscription" }, { SKILL_JEWELCRAFTING, "Jewelcrafting" },
};
```

**Menu construction:** for each profession the player has (`HasSkill`), compute `currentMax = GetPureMaxSkillValue(skill)` and `nextTier = smallest threshold > currentMax`. Offer the line iff `nextTier` exists, that tier is enabled, and (optional) the player meets its `RequiredLevel`. Cost = next tier's cost. Label e.g. `"Advance Blacksmithing to Expert"`. Root "Professions" entry is available iff at least one profession has a purchasable next tier.

**Grant path (server-authoritative, anti-skip):**
- The client action encodes only *which profession* (offset in the block), **never the tier**.
- On click, re-derive `currentMax`/`nextTier` from live state and advance **only** to `nextTier`. Skipping is impossible even with a crafted packet.
- `stillEligible` = has skill, `nextTier` exists & enabled, (optional) level ok, `currentMax` still `< nextTier`.

**Cap-raise mechanic — AMENDED (owner-approved after in-game testing):**
- The original `SetSkill`-only path proved insufficient: it raised the numbers but
  trainers still offered the same tier (rank recognition keys off the **rank
  spell**, not the raw skill values), and it filled the value to the **new** cap
  (1/75 → 150/150) instead of the intended 75/150.
- **Implemented grant path:**
  1. `player->learnSpell(rankSpellId, false)` — the trainer rank spell
     (e.g. "Journeyman Tailor"). The core's `SpellLearnSkill` path raises the
     cap natively, trainers recognize the new rank, and it persists across relog.
  2. `player->SetSkill(skill, nextTierRank, filledValue, nextTierMax)` where
     `filledValue = max(currentValue, previousCap)` — tops the value up **to the
     old cap only** (1/75 buying Journeyman → 75/150), never lowers.
- **Rank spell map:** `(skillId, tier) → rankSpellId` lives in
  `BootlegProfessionData.cpp`, derived from the world DB `spell_ranks` chains
  (ranks 2–6 of each profession's rank-1 spell), not guessed. The
  `trainer_spell` rows are teach-wrappers, not the rank spells themselves.
- After any grant, redraw root so the next tier becomes purchasable on the following click (naturally enforcing one tier per transaction).

### 6.3 Instance reset
- **Enable:** `Bootleg.Instances.Enable`; sub-toggles `.Heroic.Enable`, `.Raid.Enable`.
- **Costs:** `Bootleg.Instances.Heroic.Cost`, `Bootleg.Instances.Raid.Cost`.
- **Scope:** **bulk reset** — one purchase clears **all** saved instances of the chosen type (heroic dungeons or raids), not per-instance selection.
- **Root available when:** the player has ≥1 saved instance of an enabled type, from scanning `sInstanceSaveMgr->PlayerGetBoundInstances` across `MAX_DIFFICULTY` (raid, or non-raid dungeon at heroic difficulty).
- **Menu:**
  - **Solo:** heroic/raid lines go straight to a confirm popup → reset (one click after confirm).
  - **Grouped:** heroic/raid open a submenu with "Just me" and "My whole group". **Do not offer "My whole group" when not in a group** (crafted packet → no-op, no charge).
- **Grant:**
  - Solo: unbind the player's saves of the chosen type; charge once via `Purchase`.
  - Group: charge the initiator once, then unbind **only members who have matching saves** (members without saves are skipped; no extra charge).
  - **Playerbots guard (the one fork-sensitive spot):** iterate `group->DoForAllMembers` with **stock-AC-safe checks only** (`member && member->GetSession() && member->IsInWorld()`). No playerbot symbols. On playerbots forks, bot saves may also be reset — harmless per spec.
- `stillEligible` = type still enabled and a matching save still present (solo: initiator; group: initiator still has a matching save at charge time).

---

## 7. Gossip UX flow

- **`OnGossipHello`:** clear menu; for each service, if `IsEnabled() && IsAvailable(player)` → `AddRootEntry(player)`; send menu.
- **`OnGossipSelect`:** reject non-`GOSSIP_SENDER_MAIN`; `ROOT_REFRESH` redraws root; else find owning service by action range → `HandleAction`; redraw root if it returns true; always `return true`.
- Submenus end with a "Back" line mapped to `ROOT_REFRESH`.
- **`HandleAction` return contract:** `true` = redraw root (window stays open). A service that calls `CloseGossipMenuFor` must return `false` or the window reopens. Professions redraw root after a grant (next tier immediately visible); utilities and instance reset close the window.
- **Pricing display (AMENDED, owner-approved — implemented in `BootlegGossipUtil`):** every paid line appends the cost inline as colored amounts plus coin-icon textures (`|cff…` + `|TInterface\MoneyFrame\UI-*Icon:12|t`); amounts render dim gold (`C8A800`) when affordable and soft red (`CC3333`) when not. Base labels are never modified.
- **Hybrid confirm (AMENDED, owner-approved):** the confirm popup (with `BoxMoney`) is attached **only when the player can afford the item**. Unaffordable items are plain gossip lines; the click reaches `Purchase`, which fails the funds check and sends the native `SendBuyError(BUY_ERR_NOT_ENOUGHT_MONEY)`. (Gossip strings cannot change fonts; only color/texture escapes are available — do not attempt NumberFont parity server-side.)

---

## 8. Config schema (`conf/mod_bootlegger.conf.dist`)

AC-standard formatting: header banner, one commented block per key, costs stated in **gold**. Only kept features. Illustrative values (placeholders — owner to tune):
```
[worldserver]

# Bootleg.Enable — master switch. Default 1.
Bootleg.Enable = 1

# ---- Utilities ----
Bootleg.Utilities.Enable = 1
Bootleg.Utilities.NameChange.Cost    = 10     # gold
Bootleg.Utilities.Customize.Cost     = 50
Bootleg.Utilities.RaceChange.Cost    = 500
Bootleg.Utilities.FactionChange.Cost = 1000

# ---- Professions (per-tier enable + cost in gold) ----
Bootleg.Professions.Enable = 1
Bootleg.Professions.Journeyman.Enable  = 1
Bootleg.Professions.Journeyman.Cost    = 100
Bootleg.Professions.Expert.Enable      = 1
Bootleg.Professions.Expert.Cost        = 250
Bootleg.Professions.Artisan.Enable     = 1
Bootleg.Professions.Artisan.Cost       = 750
Bootleg.Professions.Master.Enable      = 0
Bootleg.Professions.Master.Cost        = 1250
Bootleg.Professions.GrandMaster.Enable = 0
Bootleg.Professions.GrandMaster.Cost   = 2500
# Optional per-tier level gate; 0 = none.
Bootleg.Professions.<Tier>.RequiredLevel = 0

# ---- Instance reset ----
Bootleg.Instances.Enable        = 1
Bootleg.Instances.Heroic.Enable = 1
Bootleg.Instances.Heroic.Cost   = 10
Bootleg.Instances.Raid.Enable   = 1
Bootleg.Instances.Raid.Cost     = 100
```
(Apprentice has no purchase row — the ladder starts at Journeyman.)

---

## 9. SQL

**Entry / model / GUID are DB-derived, not hardcoded guesses.** `2685` is **not** the new NPC's entry — it is the **model donor**: the new NPC borrows creature 2685's goblin display id but gets its **own fresh `creature_template` entry**. Before writing the SQL, the agent queries the world DB (via `MOD_UAC_WORLD_DATABASE_INFO`, §2.1):
```sql
-- Goblin display id to borrow from creature 2685 (modern AC schema)
SELECT CreatureDisplayID FROM creature_template_model WHERE CreatureID = 2685 ORDER BY Idx LIMIT 1;
-- Pick a free template entry (owner's current MAX is ~3460603; the high band is sparse).
SELECT MAX(entry) FROM creature_template;
-- Confirm a candidate entry is unused before using it:
SELECT COUNT(*) FROM creature_template WHERE entry = @CANDIDATE_ENTRY;
-- Pick a free, contiguous spawn-GUID block (one per city):
SELECT MAX(guid) FROM creature;
```
The chosen entry, display id, and GUID base are then written into the SQL as **literals with a comment** recording how they were derived (per §2.1). Recommended: entry = a verified-free value above the current max or in a documented custom band; GUID base = `MAX(guid)` rounded up to a clean block with headroom for 10 spawns.

**Install (`data/sql/db-world/mod_bootlegger.sql`) — idempotent, auto-applied:**
- Variables at top: `SET @ENTRY := <derived>;`, `SET @MODEL := <2685's display id>;`, `SET @GUID := <derived base>;`.
- One `creature_template` row on `@ENTRY` — `npcflag = 1` (gossip only, **not** a vendor), `ScriptName = 'npc_bootlegger'`, name/subname per §9.1.
- One `creature_template_model` row: `(@ENTRY, 0, @MODEL, 1, 1)`.
- One `creature` spawn **per target city** (§9.2), GUIDs `@GUID` … `@GUID+9`.
- DELETE-before-INSERT keyed on `@ENTRY` and the `@GUID`…`@GUID+9` range → safe re-runs.
- **No** `npc_vendor`, **no** `item_template`. Entry 2685's own row is **read only** — never modified.

**Uninstall (`data/sql/uninstall/mod_bootlegger_uninstall.sql`) — manual:** deletes the `creature` spawns and the `creature_template`/`creature_template_model` rows for `@ENTRY` / `@GUID` range. Never touches 2685.

### 9.1 NPC persona (goblin)
- **Name:** `Fizzik Underbarrel`  **Subname:** `<Bootleg Services>`
- **Greeting (gossip menu text):** *"Psst — over here, friend. You didn't hear it from me, but ol' Fizzik can sort out just about any little... inconvenience. For the right price, 'course. Whaddya need?"*

### 9.2 Spawns
Ten spawns at `@GUID` … `@GUID+9`, `@GUID` derived from `SELECT MAX(guid) FROM creature;` (§9). Coordinates are **PLACEHOLDERS near each city's default spawn** — owner replaces with real positions (`.gps` in-game, or lifted from an existing city trainer's `creature` row) before commit.

| Offset | City | Map |
|---|---|---|
| @GUID+0 | Stormwind | 0 |
| @GUID+1 | Ironforge | 0 |
| @GUID+2 | Undercity | 0 |
| @GUID+3 | Silvermoon | 530 |
| @GUID+4 | Exodar | 530 |
| @GUID+5 | Orgrimmar | 1 |
| @GUID+6 | Thunder Bluff | 1 |
| @GUID+7 | Darnassus | 1 |
| @GUID+8 | Dalaran | 571 |
| @GUID+9 | Shattrath | 530 |

(Map ids: Eastern Kingdoms 0, Kalimdor 1, Outland 530, Northrend 571.)

---

## 10. Build (`CMakeLists.txt`)

**AMENDED (owner-approved):** a stub `CMakeLists.txt` is acceptable — AzerothCore's parent module glob collects `src/**/*.cpp` (including `src/services/`), verified building on the deploy server. Do not add per-module build logic without a concrete need. Must build under `MODULES=static` at `-std=c++14`.

---

## 11. Strings & localization

- **No `#define "literal"` string macros.** Use `static char const* const` constants grouped in one header (`BootlegStrings.h`), or route text through `acore_string`/broadcast-text (v2). **v1: constants header only** for gossip labels, system messages, and confirm popup text. All user-facing copy in one place.
- **Greeting text:** stored in world DB as an `npc_text` row (`@TEXT_ID`); referenced by `SendGossipMenuFor`. Greeting copy lives in SQL (§9.1); runtime strings in `BootlegStrings.h`.
- **Confirm popup:** bootlegger-flavored text (not the reference module's generic line), passed to `AddGossipItemFor(..., popupText, popupMoney, ...)`.

---

## 12. Resolved decisions & pre-commit operator TODOs

All prior open decisions are resolved. Items split by who resolves them.

### 12.1 Owner Q&A (locked)

| Topic | Decision |
|---|---|
| Phase 0 SQL | Derived `@ENTRY` (not 2685); `@MODEL` from creature **2685** display id; single Stormwind spawn until Phase 5 adds all cities |
| Instance reset scope | Bulk reset per type (§6.3) |
| Solo instance UX | Confirm popup → reset in one step (no solo submenu) |
| Group reset | Reset only members with matching saves; initiator charged once |
| Group menu | Hide "My whole group" when not grouped |
| Playerbots iteration | Stock session/world checks only; no fork symbols |
| Professions | Existing skills only (`HasSkill`); no learn-from-scratch |
| Profession cap raise | Primary `SetSkill` path; pivot at runtime if persistence fails (§6.2) — no dual-path config |
| Utilities eligibility | Match reference (pending at-login flag blocks all four) |
| Master disable (`Bootleg.Enable = 0`) | NPC spawns; gossip shows greeting only, no service entries |
| Strings v1 | `BootlegStrings.h` constants; greeting in `npc_text` SQL |
| Confirm text | Bootlegger-flavored (see `BootlegStrings.h`) |
| Spawn coords (Phases 0–4) | Placeholder coords OK; owner replaces before final commit |
| Builds | Dev tree is reference-only; maintainer builds on deploy/test server |
| Insufficient funds UX | Native `SendBuyError(BUY_ERR_NOT_ENOUGHT_MONEY)`, no chat message |
| Price display | Inline coin icons + affordance colors in gossip labels (§7) |
| Confirm popup | Hybrid: popup only when affordable; unaffordable → immediate buy error (§7) |
| Post-purchase menu | Utilities/instances close the window; professions redraw root (§7) |
| CMakeLists | Stub relying on the parent module glob is acceptable (§10) |

### 12.2 Agent auto-derives at build time

**Agent auto-derives at build time (from DB/DBCs per §2.1 — must be derived, not guessed):**
- **Template entry** — query for a free `creature_template` entry; bake as a commented literal.
- **Goblin display id** — read from creature 2685 via `creature_template_model`; bake as `@MODEL`.
- **Spawn GUID block** — derive `@GUID` from `MAX(guid)`; bake with headroom for 10 spawns.
- **Professions raise** — implement §6.2 `SetSkill` cap-raise; run the persistence check; if the cap doesn't persist, build the rank-spell map by extracting `SkillLineAbility.dbc`/`Spell.dbc` from `client-data-v19.zip` and cross-checking `trainer`/`trainer_spell` (never invent ids).

### 12.3 Owner data-fills before commit

- **Spawn coordinates** — replace §9.2 placeholders with real in-game positions.
- **Costs / level gates** — tune the §8 placeholders.

---

## 13. Correctness & security invariants (must hold; directly checkable)

1. Only `ModifyMoney` call site is inside `Purchase`.
2. Charge precedes grant everywhere.
3. `HasEnoughMoney` gate on every charging path; insufficient → native client buy error, no state change.
4. Eligibility re-validated on the grant path from live state (professions re-derive next tier; utilities re-check in-progress flag; instance reset re-checks saves+enable).
5. Professions advance exactly one tier per transaction; tier never taken from the client.
6. Non-`GOSSIP_SENDER_MAIN` rejected; each service handles only its own action block.
7. No fork-only symbols; `src/` builds on stock AC; grep for playerbot identifiers returns nothing.
8. All runtime money in copper; gold→copper once at load with overflow guard.
9. Install SQL idempotent; uninstall fully removes the DB footprint.
10. `.reload config` re-populates config with no restart.
11. Builds warnings-clean at `-std=c++14`; no C++17-only features present.

---

## 14. Phased build plan (each phase: build → review-bugbot → evaluate → fix → loop until clean)

Do not advance until the current phase's bugbot pass is clean.

**Phase 0 — Scaffold.** Layout, `CMakeLists.txt`, empty WorldScript + CreatureScript registered via `Addmod_bootleggerScripts()`, `BootlegConfig` loading master enable, minimal SQL: derived `@ENTRY`, `@MODEL` from creature **2685**, one Stormwind spawn, `npc_text` greeting — NPC opens gossip (empty service menu).
*Accept:* builds `-std=c++14` `MODULES=static` warnings-clean on stock AC (on deploy server); both scripts register; `.reload config` works; NPC spawns and opens gossip; no playerbot symbols; no string `#define`s.

**Phase 1 — Domain core.** `BootlegService`, `BootlegRegistry`, `Purchase`, action-block scheme, full `BootlegConfig` (all keys, gold→copper + overflow guard).
*Accept:* `Purchase` sole `ModifyMoney` site; validate→funds→charge→grant order; config in copper; registry routes by range with sender check.

**Phase 2 — Utilities.** Four at-login options.
*Accept:* in-progress flag re-checked on grant; cost shown; charge-then-set; insufficient-funds no-ops with message; disabled hides root entry.

**Phase 3 — Professions.** Data table, sequential next-tier logic, cap-raise per §6.2 (+ persistence check / fallback).
*Accept:* next tier derived server-side, never from client; Apprentice→Grand Master requires 5 distinct charges; disabled tiers block progression; correct per-tier cost; single table (no parallel switches); level gate honored if set.

**Phase 4 — Instance reset.** Solo + group, playerbot-safe iteration.
*Accept:* root hidden with no matching saves; heroic/raid filtering correct; group charges initiator once; group iteration compiles on stock AC and skips non-players; re-check on grant.

**Phase 5 — SQL, conf.dist, strings, docs.** Idempotent install with city spawns + goblin persona, uninstall, AC-standard conf (kept features, gold, comments), string constants/localization, README (entry/GUID range, install/uninstall, config reference, compatibility, license).
*Accept:* install re-runnable; `npcflag = 1`; no `npc_vendor`/`item_template`; uninstall removes all rows; conf keys ↔ code 1:1; no string `#define`s.

**Phase 6 — Integration & invariant audit.** Full build + §13 checklist + §15 matrix (on deploy/test server).
*Accept:* all §13 invariants pass; builds on both stock AC and mod-playerbots at `-std=c++14`; matrix green.

---

## 15. Test matrix (Phase 6; re-run relevant rows each phase)

Per service/sub-action:
| Condition | Expected |
|---|---|
| Sufficient funds, eligible | Charged once; benefit applied; menu refreshes |
| Insufficient funds | Message; no charge; no benefit |
| Service/tier disabled | Option hidden; crafted action rejected on grant |
| Ineligible (no flag room / no next tier / no saves) | Option hidden; grant re-checks and no-ops |
| Crafted/replayed packet (skip tier, wrong sender, foreign action) | Rejected; no state change |

Professions:
| Scenario | Expected |
|---|---|
| Apprentice → Grand Master, all tiers enabled | 5 separate charges (J,E,A,M,GM) |
| Buy Grand Master while at Expert | Only Artisan offered; GM unreachable until intermediates bought |
| 10 points below cap | Full next-tier price (no proration) |
| Cap persistence (post-relog) | Raised tier persists (verifies §6.2 mechanic) |

Instance reset:
| Scenario | Expected |
|---|---|
| Group with playerbots, group reset | Compiles/runs on both cores; initiator charged once; real members reset; bots skipped/harmless |
| Solo, only raid saves, heroic disabled | Only raid offered |

---

## 16. Definition of done
All §13 invariants hold; §15 matrix green; warnings-clean `-std=c++14` build on stock AzerothCore master **and** `mod-playerbots/azerothcore-wotlk`; idempotent install / clean uninstall; config ↔ code key-for-key; nothing carried from the reference module.
