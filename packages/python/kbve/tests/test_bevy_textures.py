"""Tests for kbve.bevy.textures map discovery."""

from kbve.bevy.textures import KINDS, find_map


def write(directory, *names):
    for name in names:
        (directory / name).write_bytes(b"")


# ── colourway selection ──────────────────────────────────────────────


def test_primary_colourway_beats_the_numbered_ones(tmp_path):
    """`2` sorts before `B`, so plain ordering picks the wrong file.

    This is not hypothetical: the first run of the converter took
    `T_Knight_2_BaseColor` for the primary and reported success, because a
    second colourway is a perfectly valid texture and nothing downstream
    notices it is the wrong one.
    """
    write(
        tmp_path,
        "T_Knight_BaseColor.png",
        "T_Knight_2_BaseColor.png",
        "T_Knight_3_BaseColor.png",
    )
    assert find_map(tmp_path, "basecolor").name == "T_Knight_BaseColor.png"


def test_variant_two_is_the_second_colourway(tmp_path):
    write(tmp_path, "T_Knight_BaseColor.png", "T_Knight_2_BaseColor.png")
    assert find_map(tmp_path, "basecolor", variant=2).name == "T_Knight_2_BaseColor.png"


def test_a_variant_that_does_not_exist_is_not_a_wrong_one(tmp_path):
    write(tmp_path, "T_Knight_BaseColor.png")
    assert find_map(tmp_path, "basecolor", variant=3) is None


# ── map kinds ────────────────────────────────────────────────────────


def test_normal_prefers_the_opengl_convention(tmp_path):
    """A pack shipping both conventions must not have one guessed for it.

    bevy samples green-up; picking the DirectX map inverts every lit surface.
    """
    write(tmp_path, "ground_normal_dx_1k.png", "ground_normal_gl_1k.png")
    assert find_map(tmp_path, "normal").name == "ground_normal_gl_1k.png"


def test_orm_is_found_by_its_quaternius_name(tmp_path):
    write(tmp_path, "T_Knight_ORM.png")
    assert find_map(tmp_path, "orm").name == "T_Knight_ORM.png"


def test_a_missing_map_is_none_rather_than_a_guess(tmp_path):
    write(tmp_path, "T_Knight_BaseColor.png")
    assert find_map(tmp_path, "orm") is None


# ── encoding rules ───────────────────────────────────────────────────


def test_only_base_colour_is_srgb():
    """Everything else is a measurement, and reading it through the transfer
    function bends the lighting that samples it."""
    assert KINDS["basecolor"]["srgb"] is True
    assert not any(KINDS[k]["srgb"] for k in KINDS if k != "basecolor")


def test_base_colour_is_the_only_etc1s_map():
    """ETC1S reconstructs chroma from a shared palette, which is fine for a
    colour and destroys a direction vector."""
    assert KINDS["basecolor"]["uastc"] is False
    assert all(KINDS[k]["uastc"] for k in KINDS if k != "basecolor")
