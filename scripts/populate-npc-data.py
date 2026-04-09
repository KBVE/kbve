#!/usr/bin/env python3
"""
Populate NPC MDX files with loot tables, abilities, and faction assignments.

Maps the hardcoded game data from content.rs / proto_bridge.rs into the
NPC MDX frontmatter so the proto-driven code paths activate.

Run from repo root:
    python3 scripts/populate-npc-data.py
"""

import re
from pathlib import Path

NPC_DIR = Path("apps/kbve/astro-kbve/src/content/docs/npcdb")

# ── Level → loot table mapping (mirrors loot_table_for_level) ──────────

LOOT_TABLES = {
    "slime": {
        "entries": [
            {"item_ref": "potion", "drop_rate": 0.30,
                "min_quantity": 1, "max_quantity": 1},
            {"item_ref": "rations", "drop_rate": 0.18,
                "min_quantity": 1, "max_quantity": 1},
            {"item_ref": "vitality-potion", "drop_rate": 0.06,
                "min_quantity": 1, "max_quantity": 1},
            {"item_ref": "whetstone", "drop_rate": 0.06,
                "min_quantity": 1, "max_quantity": 1},
        ],
        "max_drops": 1,
        "gold_min": 3,
        "gold_max": 8,
        "xp_reward": 15,
    },
    "skeleton": {
        "entries": [
            {"item_ref": "bandage", "drop_rate": 0.27,
                "min_quantity": 1, "max_quantity": 1},
            {"item_ref": "bomb", "drop_rate": 0.13,
                "min_quantity": 1, "max_quantity": 1},
            {"item_ref": "fire-flask", "drop_rate": 0.13,
                "min_quantity": 1, "max_quantity": 1},
            {"item_ref": "iron-skin-potion", "drop_rate": 0.07,
                "min_quantity": 1, "max_quantity": 1},
            {"item_ref": "trap-kit", "drop_rate": 0.07,
                "min_quantity": 1, "max_quantity": 1},
            {"item_ref": "whetstone", "drop_rate": 0.13,
                "min_quantity": 1, "max_quantity": 1},
        ],
        "max_drops": 1,
        "gold_min": 5,
        "gold_max": 12,
        "xp_reward": 30,
    },
    "wraith": {
        "entries": [
            {"item_ref": "ward", "drop_rate": 0.25,
                "min_quantity": 1, "max_quantity": 1},
            {"item_ref": "bomb", "drop_rate": 0.25,
                "min_quantity": 1, "max_quantity": 1},
            {"item_ref": "campfire-kit", "drop_rate": 0.08,
                "min_quantity": 1, "max_quantity": 1},
            {"item_ref": "rage-draught", "drop_rate": 0.08,
                "min_quantity": 1, "max_quantity": 1},
            {"item_ref": "phoenix-feather", "drop_rate": 0.08,
                "min_quantity": 1, "max_quantity": 1},
            {"item_ref": "antidote", "drop_rate": 0.17,
                "min_quantity": 1, "max_quantity": 1},
            {"item_ref": "smoke-bomb", "drop_rate": 0.08,
                "min_quantity": 1, "max_quantity": 1},
        ],
        "max_drops": 2,
        "gold_min": 8,
        "gold_max": 18,
        "xp_reward": 50,
    },
    "boss": {
        "entries": [
            {"item_ref": "ward", "drop_rate": 0.30,
                "min_quantity": 1, "max_quantity": 1},
            {"item_ref": "potion", "drop_rate": 0.45,
                "min_quantity": 1, "max_quantity": 2},
            {"item_ref": "bomb", "drop_rate": 0.30,
                "min_quantity": 1, "max_quantity": 1},
            {"item_ref": "teleport-rune", "drop_rate": 0.15,
                "min_quantity": 1, "max_quantity": 1},
            {"item_ref": "campfire-kit", "drop_rate": 0.15,
                "min_quantity": 1, "max_quantity": 1},
            {"item_ref": "phoenix-feather", "drop_rate": 0.15,
                "min_quantity": 1, "max_quantity": 1},
            {"item_ref": "elixir", "drop_rate": 0.15,
                "min_quantity": 1, "max_quantity": 1},
            {"item_ref": "smoke-bomb", "drop_rate": 0.15,
                "min_quantity": 1, "max_quantity": 1},
        ],
        "max_drops": 2,
        "gold_min": 15,
        "gold_max": 30,
        "xp_reward": 100,
    },
}

LEVEL_TO_TABLE = {1: "slime", 2: "skeleton", 3: "wraith", 5: "boss"}

# ── NPC abilities (from legacy_initial_intent) ─────────────────────────

NPC_ABILITIES = {
    "glass-slime": [{"id": "attack", "name": "Engulf", "damage": 5}],
    "crystal-bat": [{"id": "attack", "name": "Screech", "damage": 4}],
    "mushroom-sprite": [{"id": "attack", "name": "Spore Burst", "damage": 4}],
    "dust-mite": [{"id": "attack", "name": "Gnaw", "damage": 6}],
    "cave-spider": [{"id": "poison", "name": "Venomous Bite", "damage": 3, "cooldown_turns": 2}],
    "crumbling-statue": [{"id": "defend", "name": "Stone Shell", "damage": 3}],
    "skeleton-guard": [{"id": "defend", "name": "Shield Wall", "damage": 5}],
    "bone-archer": [{"id": "attack", "name": "Bone Arrow", "damage": 7}],
    "cursed-knight": [{"id": "defend", "name": "Cursed Shield", "damage": 5}],
    "fire-imp": [{"id": "attack", "name": "Fireball", "damage": 8}],
    "shade-stalker": [{"id": "attack", "name": "Shadow Strike", "damage": 8}],
    "fungal-brute": [{"id": "heavy-attack", "name": "Fungal Slam", "damage": 10}],
    "ember-wisp": [{"id": "burn", "name": "Ignite", "damage": 4, "cooldown_turns": 3}],
    "shadow-wraith": [{"id": "heavy-attack", "name": "Death Scythe", "damage": 12}],
    "phantom-knight": [{"id": "charge", "name": "Phantom Charge"}],
    "void-walker": [{"id": "heavy-attack", "name": "Void Rend", "damage": 10}],
    "stone-sentinel": [{"id": "attack", "name": "Stone Fist", "damage": 6}],
    "glass-assassin": [{"id": "attack", "name": "Crystal Blade", "damage": 10}],
    "venomfang-lurker": [{"id": "poison", "name": "Fang Strike", "damage": 6, "cooldown_turns": 3}],
    "crystal-golem": [{"id": "charge", "name": "Crystal Charge"}],
    "glass-golem": [{"id": "charge", "name": "Glass Rampage"}],
    "corrupted-warden": [{"id": "charge", "name": "Warden's Fury"}],
    "the-shattered-king": [{"id": "aoe-attack", "name": "Shatter Wave", "damage": 8}],
}

# ── Faction assignments ────────────────────────────────────────────────

NPC_FACTIONS = {
    # Crystal Order — crystal/glass entities
    "glass-slime": "crystal-order",
    "crystal-bat": "crystal-order",
    "crystal-golem": "crystal-order",
    "glass-golem": "crystal-order",
    "glass-assassin": "crystal-order",
    "crumbling-statue": "crystal-order",
    # Shadow Court — shadow/stealth enemies
    "shadow-wraith": "shadow-court",
    "shade-stalker": "shadow-court",
    "phantom-knight": "shadow-court",
    "void-walker": "shadow-court",
    "the-shattered-king": "shadow-court",
    # Deep Wardens — dungeon guardians
    "skeleton-guard": "deep-wardens",
    "bone-archer": "deep-wardens",
    "cursed-knight": "deep-wardens",
    "stone-sentinel": "deep-wardens",
    "corrupted-warden": "deep-wardens",
    # Unaligned — nature/wild creatures
    # cave-spider, dust-mite, mushroom-sprite, fire-imp, fungal-brute,
    # ember-wisp, venomfang-lurker — no faction
}


def format_loot_yaml(loot, indent=0):
    """Format a loot table as YAML."""
    prefix = "    " * indent
    lines = [f"{prefix}loot:"]
    lines.append(f"{prefix}    entries:")
    for entry in loot["entries"]:
        lines.append(f"{prefix}        - item_ref: '{entry['item_ref']}'")
        lines.append(f"{prefix}          drop_rate: {entry['drop_rate']}")
        lines.append(
            f"{prefix}          min_quantity: {entry['min_quantity']}")
        lines.append(
            f"{prefix}          max_quantity: {entry['max_quantity']}")
    lines.append(f"{prefix}    max_drops: {loot['max_drops']}")
    lines.append(f"{prefix}    gold_min: {loot['gold_min']}")
    lines.append(f"{prefix}    gold_max: {loot['gold_max']}")
    lines.append(f"{prefix}    xp_reward: {loot['xp_reward']}")
    return "\n".join(lines)


def format_abilities_yaml(abilities, indent=0):
    """Format abilities as YAML."""
    prefix = "    " * indent
    lines = [f"{prefix}abilities:"]
    for ab in abilities:
        lines.append(f"{prefix}    - id: '{ab['id']}'")
        lines.append(f"{prefix}      name: '{ab['name']}'")
        if "damage" in ab:
            lines.append(f"{prefix}      damage: {ab['damage']}")
        if "cooldown_turns" in ab:
            lines.append(
                f"{prefix}      cooldown_turns: {ab['cooldown_turns']}")
    return "\n".join(lines)


def format_faction_yaml(faction_id, indent=0):
    """Format faction as YAML."""
    prefix = "    " * indent
    return f"{prefix}faction:\n{prefix}    faction_id: '{faction_id}'"


def process_npc(mdx_path):
    """Add loot, abilities, and faction to an NPC MDX file."""
    content = mdx_path.read_text()

    # Extract ref from frontmatter
    ref_match = re.search(r"^ref:\s*'([^']+)'", content, re.MULTILINE)
    if not ref_match:
        return False
    npc_ref = ref_match.group(1)

    # Extract level
    level_match = re.search(r"^level:\s*(\d+)", content, re.MULTILINE)
    if not level_match:
        return False
    level = int(level_match.group(1))

    # Skip non-combat NPCs (level 0 or ambient creatures)
    if npc_ref in ("green-toad", "meadow-firefly", "woodland-butterfly"):
        return False

    # Check if already has loot data
    if "loot:" in content and "entries:" in content:
        return False

    # Build new YAML blocks
    new_blocks = []

    # Loot table
    table_key = LEVEL_TO_TABLE.get(level)
    if table_key and table_key in LOOT_TABLES:
        new_blocks.append(format_loot_yaml(LOOT_TABLES[table_key]))

    # Abilities
    if npc_ref in NPC_ABILITIES:
        new_blocks.append(format_abilities_yaml(NPC_ABILITIES[npc_ref]))

    # Faction
    if npc_ref in NPC_FACTIONS:
        new_blocks.append(format_faction_yaml(NPC_FACTIONS[npc_ref]))

    if not new_blocks:
        return False

    # Insert before the closing --- of frontmatter
    # Find the second --- (end of frontmatter)
    parts = content.split("---", 2)
    if len(parts) < 3:
        return False

    # Insert new blocks at end of frontmatter
    frontmatter = parts[1].rstrip()
    new_yaml = "\n".join(new_blocks)
    new_content = f"---{frontmatter}\n{new_yaml}\n---{parts[2]}"

    mdx_path.write_text(new_content)
    return True


def main():
    count = 0
    for mdx_file in sorted(NPC_DIR.glob("*.mdx")):
        if mdx_file.name == "index.mdx":
            continue
        if process_npc(mdx_file):
            print(f"  Updated: {mdx_file.name}")
            count += 1
        else:
            print(f"  Skipped: {mdx_file.name}")
    print(f"\nPopulated {count} NPC files.")


if __name__ == "__main__":
    main()
