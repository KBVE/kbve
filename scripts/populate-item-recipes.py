#!/usr/bin/env python3
"""
Populate item MDX files with crafting recipes.

Adds `recipes` frontmatter to craftable items using ingredients that already
exist in the itemdb. Recipes span 4 skill lines: alchemy, cooking, smithing, crafting.

Run from repo root:
    python3 scripts/populate-item-recipes.py
"""

from pathlib import Path

ITEM_DIR = Path("apps/kbve/astro-kbve/src/content/docs/itemdb")

# ── Recipe definitions ─────────────────────────────────────────────────
# Key = output item ref (MDX filename without .mdx)
# Each recipe: skill, skill_level, xp_reward, ingredients [(ref, amount)], output_quantity

RECIPES = {
    # ── Alchemy (potions from herbs + fungi) ───────────────────────────
    "potion": {
        "skill": "alchemy",
        "skill_level": 1,
        "xp_reward": 15,
        "output_quantity": 1,
        "ingredients": [
            ("wildflower", 2),
            ("porcini", 1),
        ],
    },
    "antidote": {
        "skill": "alchemy",
        "skill_level": 5,
        "xp_reward": 25,
        "output_quantity": 1,
        "ingredients": [
            ("lavender", 2),
            ("chanterelle", 1),
        ],
    },
    "vitality-potion": {
        "skill": "alchemy",
        "skill_level": 10,
        "xp_reward": 35,
        "output_quantity": 1,
        "ingredients": [
            ("rose", 2),
            ("porcini", 2),
        ],
    },
    "iron-skin-potion": {
        "skill": "alchemy",
        "skill_level": 15,
        "xp_reward": 45,
        "output_quantity": 1,
        "ingredients": [
            ("allium", 2),
            ("iron-ore", 1),
        ],
    },
    "rage-draught": {
        "skill": "alchemy",
        "skill_level": 20,
        "xp_reward": 55,
        "output_quantity": 1,
        "ingredients": [
            ("fly-agaric", 2),
            ("sunflower", 1),
        ],
    },
    "elixir": {
        "skill": "alchemy",
        "skill_level": 30,
        "xp_reward": 80,
        "output_quantity": 1,
        "ingredients": [
            ("crystal-ore", 1),
            ("rose", 3),
            ("chanterelle", 2),
        ],
    },

    # ── Cooking (food from raw ingredients) ────────────────────────────
    "rations": {
        "skill": "cooking",
        "skill_level": 1,
        "xp_reward": 10,
        "output_quantity": 2,
        "ingredients": [
            ("porcini", 2),
            ("wildflower", 1),
        ],
    },
    "garlic-bread": {
        "skill": "cooking",
        "skill_level": 5,
        "xp_reward": 20,
        "output_quantity": 1,
        "ingredients": [
            ("allium", 2),
            ("butter", 1),
        ],
    },
    "lobster-soup": {
        "skill": "cooking",
        "skill_level": 20,
        "xp_reward": 50,
        "output_quantity": 1,
        "ingredients": [
            ("lobster", 1),
            ("butter", 1),
            ("allium", 1),
        ],
    },
    "spicy-ramen": {
        "skill": "cooking",
        "skill_level": 10,
        "xp_reward": 30,
        "output_quantity": 1,
        "ingredients": [
            ("salmon", 1),
            ("allium", 1),
        ],
    },
    "fried-fish-taco": {
        "skill": "cooking",
        "skill_level": 15,
        "xp_reward": 40,
        "output_quantity": 2,
        "ingredients": [
            ("salmon", 2),
            ("butter", 1),
        ],
    },

    # ── Smithing (gear from ores) ──────────────────────────────────────
    "rusty-sword": {
        "skill": "smithing",
        "skill_level": 1,
        "xp_reward": 20,
        "output_quantity": 1,
        "ingredients": [
            ("copper-ore", 3),
            ("log", 1),
        ],
    },
    "iron-mace": {
        "skill": "smithing",
        "skill_level": 15,
        "xp_reward": 40,
        "output_quantity": 1,
        "ingredients": [
            ("iron-ore", 3),
            ("log", 1),
        ],
    },
    "chain-mail": {
        "skill": "smithing",
        "skill_level": 15,
        "xp_reward": 45,
        "output_quantity": 1,
        "ingredients": [
            ("iron-ore", 4),
            ("copper-ore", 2),
        ],
    },
    "leather-vest": {
        "skill": "smithing",
        "skill_level": 1,
        "xp_reward": 15,
        "output_quantity": 1,
        "ingredients": [
            ("bone", 2),
            ("log", 2),
        ],
    },

    # ── Crafting (utility items from mixed materials) ──────────────────
    "bomb": {
        "skill": "crafting",
        "skill_level": 5,
        "xp_reward": 20,
        "output_quantity": 1,
        "ingredients": [
            ("copper-ore", 1),
            ("fly-agaric", 1),
        ],
    },
    "fire-flask": {
        "skill": "crafting",
        "skill_level": 10,
        "xp_reward": 25,
        "output_quantity": 1,
        "ingredients": [
            ("copper-ore", 1),
            ("ember-wisp", 1) if False else ("sunflower", 2),
        ],
    },
    "campfire-kit": {
        "skill": "crafting",
        "skill_level": 1,
        "xp_reward": 10,
        "output_quantity": 1,
        "ingredients": [
            ("log", 3),
            ("stone", 1),
        ],
    },
    "trap-kit": {
        "skill": "crafting",
        "skill_level": 10,
        "xp_reward": 25,
        "output_quantity": 1,
        "ingredients": [
            ("iron-ore", 2),
            ("log", 1),
        ],
    },
    "whetstone": {
        "skill": "crafting",
        "skill_level": 5,
        "xp_reward": 15,
        "output_quantity": 1,
        "ingredients": [
            ("stone", 2),
            ("copper-ore", 1),
        ],
    },
    "bandage": {
        "skill": "crafting",
        "skill_level": 1,
        "xp_reward": 8,
        "output_quantity": 2,
        "ingredients": [
            ("wildflower", 1),
            ("log", 1),
        ],
    },
    "ward": {
        "skill": "crafting",
        "skill_level": 15,
        "xp_reward": 35,
        "output_quantity": 1,
        "ingredients": [
            ("crystal-ore", 1),
            ("lavender", 2),
        ],
    },
    "smoke-bomb": {
        "skill": "crafting",
        "skill_level": 20,
        "xp_reward": 40,
        "output_quantity": 1,
        "ingredients": [
            ("fly-agaric", 2),
            ("copper-ore", 1),
        ],
    },
}


def format_recipe_yaml(recipe):
    """Format a recipe as YAML frontmatter."""
    lines = ["recipes:"]
    lines.append(f"    - skill: '{recipe['skill']}'")
    lines.append(f"      skill_level: {recipe['skill_level']}")
    lines.append(f"      xp_reward: {recipe['xp_reward']}")
    lines.append(f"      output_quantity: {recipe['output_quantity']}")
    lines.append("      ingredients:")
    for ref, amount in recipe["ingredients"]:
        lines.append(f"          - item_ref: '{ref}'")
        lines.append(f"            amount: {amount}")
    return "\n".join(lines)


def process_item(mdx_path, recipe):
    """Add a crafting recipe to an item MDX file."""
    content = mdx_path.read_text()

    # Skip if already has recipes
    if "recipes:" in content:
        return False

    # Insert before closing --- of frontmatter
    parts = content.split("---", 2)
    if len(parts) < 3:
        return False

    frontmatter = parts[1].rstrip()
    recipe_yaml = format_recipe_yaml(recipe)
    new_content = f"---{frontmatter}\n{recipe_yaml}\n---{parts[2]}"

    mdx_path.write_text(new_content)
    return True


def main():
    count = 0
    for item_ref, recipe in sorted(RECIPES.items()):
        mdx_path = ITEM_DIR / f"{item_ref}.mdx"
        if not mdx_path.exists():
            print(f"  Missing: {item_ref}.mdx")
            continue
        if process_item(mdx_path, recipe):
            print(
                f"  Updated: {item_ref}.mdx ({recipe['skill']} L{recipe['skill_level']})")
            count += 1
        else:
            print(f"  Skipped: {item_ref}.mdx (already has recipes)")
    print(f"\nPopulated {count} item files with crafting recipes.")
    print("\nRecipe breakdown:")
    skills = {}
    for r in RECIPES.values():
        s = r["skill"]
        skills[s] = skills.get(s, 0) + 1
    for s, c in sorted(skills.items()):
        print(f"  {s}: {c} recipes")


if __name__ == "__main__":
    main()
