import os
import tempfile
import textwrap
import pytest
from validate_foods import validate_dir


GOOD = textwrap.dedent("""
    [food]
    id = "Food_Test"
    name = "Test Food"
    description = "A test food."
    icon = "/Game/Pal/Texture/ItemIcon/T_itemicon_Food_Salada"
    stack_size = 50
    rank = 1

    [recipe]
    work_amount = 200
    workbench_tier = 1
    output_count = 1
    ingredients = [{ id = "Carrot", count = 2 }]

    [effect]
    satiety = 80
    sanity = 10
    status_effect = "WorkSpeed"
    magnitude = 0.1
    duration = 600
""")


def _write(d, name, content):
    p = os.path.join(d, name)
    with open(p, "w") as f:
        f.write(content)
    return p


def test_valid_food_passes():
    with tempfile.TemporaryDirectory() as d:
        _write(d, "test.toml", GOOD)
        foods = validate_dir(d)
        assert len(foods) == 1
        assert foods[0]["food"]["id"] == "Food_Test"


def test_missing_required_field_fails():
    with tempfile.TemporaryDirectory() as d:
        bad = GOOD.replace('name = "Test Food"\n', "")
        _write(d, "bad.toml", bad)
        with pytest.raises(ValueError, match="name"):
            validate_dir(d)


def test_empty_ingredients_fails():
    with tempfile.TemporaryDirectory() as d:
        bad = GOOD.replace('ingredients = [{ id = "Carrot", count = 2 }]', "ingredients = []")
        _write(d, "bad.toml", bad)
        with pytest.raises(ValueError, match="ingredient"):
            validate_dir(d)


def test_small_negative_float_fails():
    with tempfile.TemporaryDirectory() as d:
        bad = GOOD.replace("satiety = 80", "satiety = -0.5")
        _write(d, "bad.toml", bad)
        with pytest.raises(ValueError, match="satiety"):
            validate_dir(d)


def test_non_numeric_field_fails():
    with tempfile.TemporaryDirectory() as d:
        bad = GOOD.replace("stack_size = 50", 'stack_size = "lots"')
        _write(d, "bad.toml", bad)
        with pytest.raises(ValueError, match="stack_size"):
            validate_dir(d)


def test_duplicate_ids_fail():
    with tempfile.TemporaryDirectory() as d:
        _write(d, "a.toml", GOOD)
        _write(d, "b.toml", GOOD)
        with pytest.raises(ValueError, match="duplicate"):
            validate_dir(d)
