import glob
import os
import sys
import tomllib


_REQUIRED = {
    "food": ["id", "name", "description", "icon", "stack_size"],
    "recipe": ["work_amount", "workbench_tier", "output_count", "ingredients"],
    "effect": ["satiety", "sanity", "status_effect", "magnitude", "duration"],
}


def _num(path, field, value):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{path}: {field} must be a number, got {value!r}")
    return value


def _check_one(path, data):
    for section, keys in _REQUIRED.items():
        if section not in data:
            raise ValueError(f"{path}: missing section [{section}]")
        for key in keys:
            if key not in data[section]:
                raise ValueError(f"{path}: missing {section}.{key}")

    food = data["food"]
    if not str(food["id"]).startswith("Food_"):
        raise ValueError(f"{path}: food.id must start with 'Food_'")
    if _num(path, "food.stack_size", food["stack_size"]) <= 0:
        raise ValueError(f"{path}: food.stack_size must be > 0")

    recipe = data["recipe"]
    if _num(path, "recipe.work_amount", recipe["work_amount"]) <= 0:
        raise ValueError(f"{path}: recipe.work_amount must be > 0")
    if _num(path, "recipe.output_count", recipe["output_count"]) <= 0:
        raise ValueError(f"{path}: recipe.output_count must be > 0")
    ingredients = recipe["ingredients"]
    if not ingredients:
        raise ValueError(f"{path}: recipe.ingredients must have at least one ingredient")
    for ing in ingredients:
        if "id" not in ing or "count" not in ing:
            raise ValueError(f"{path}: each ingredient needs id and count")
        if _num(path, "ingredient count", ing["count"]) <= 0:
            raise ValueError(f"{path}: ingredient count must be > 0")

    effect = data["effect"]
    for numeric in ("satiety", "sanity", "duration"):
        if _num(path, f"effect.{numeric}", effect[numeric]) < 0:
            raise ValueError(f"{path}: effect.{numeric} must be >= 0")


def validate_dir(foods_dir):
    foods = []
    seen = set()
    for path in sorted(glob.glob(os.path.join(foods_dir, "*.toml"))):
        with open(path, "rb") as f:
            data = tomllib.load(f)
        _check_one(path, data)
        fid = data["food"]["id"]
        if fid in seen:
            raise ValueError(f"{path}: duplicate food.id '{fid}'")
        seen.add(fid)
        foods.append(data)
    return foods


if __name__ == "__main__":
    d = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), "..", "foods")
    result = validate_dir(d)
    print(f"OK: {len(result)} food(s) validated")
