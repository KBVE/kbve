"""What a foliage card does to its own vertices: it bends, and it goes away.

Both are world position offset, which is why they are one module and one
connection rather than two -- a material has a single WPO pin, and the fade has
to be able to take the sway down with it. A clump shrunk to nothing that is
still swinging flickers a pixel where it used to be.

They are separable in the other direction, though, and that is the reason this
is not simply part of the material builder. A plant fixed to masonry does not
sway: ivy is held to a wall by its own rootlets along every inch of its stem,
and a leaf of it moves about as much as the brick does. It still has to fade,
because everything does. So the sway is optional and the fade is not.
"""

import os
import sys

import unreal

# The editor runs this as a loose file, not as part of a package: the commandlet
# is handed a path and there is no kbve.unreal.editor around it by then, so a
# relative import raises before the script does anything at all. Putting this
# file's own directory on the path is what allows an editor script to be more
# than one file -- which is why the ones beside it each carry their own copy of
# everything they need.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from material_graph import MEL, expr, link  # noqa: E402


def connect(mat, spec, *, lifted, scatter, pivot):
    """Build the offset and put it on the material's WPO pin.

    Takes the three things it cannot derive for itself: how far up its own clump
    a vertex sits, this instance's random, and the clump's pivot.
    """
    swaying = spec.get("wind", True)

    world = expr(mat, unreal.MaterialExpressionWorldPosition, -1400, 800)
    world.set_editor_property(
        "world_position_shader_offset",
        unreal.WorldPositionIncludedOffsets.WPT_EXCLUDE_ALL_SHADER_OFFSETS,
    )

    if swaying:
        # Wind. Three things have to be true or a field of this reads as a chorus
        # line rather than as weather.
        #
        # It travels across the ground in both axes: phased on world X alone, every
        # clump sharing an X moves in lockstep, and a row of grass dances together.
        #
        # Each clump has its own offset into the wave, from the per-instance random
        # the instanced component already provides -- without it, neighbours a
        # centimetre apart are in perfect step, which nothing in a field ever is.
        #
        # And the amplitude is small against the clump. Nine units on a clump forty
        # five tall is a fifth of its own height, which is not a breeze.

        wavelength = spec.get("wind_wavelength", 0.0025)

        # Which way the weather is going, read from the shared collection rather than
        # built in here. A material carrying its own copy cannot be told the wind has
        # turned, and two materials each carrying one eventually disagree about which
        # way it was going in the first place.
        collection = spec.get("wind_collection")

        def wind(name, y):
            node = expr(mat, unreal.MaterialExpressionCollectionParameter, -1500, y)
            node.set_editor_property("collection", collection)
            node.set_editor_property("parameter_name", name)
            return node

        heading3 = wind("WindTravelDirection", 900)

        # The gust travels along the wind rather than across each axis separately.
        # Phasing on X and Y independently makes a chequerwork whose fronts run at
        # whatever angle the two wavelengths happen to give; projecting the ground
        # position onto the wind direction makes the fronts square to it, so what
        # crosses the field is a gust going one way and not a pattern.
        ground = expr(mat, unreal.MaterialExpressionComponentMask, -1200, 800)
        ground.set_editor_property("r", True)
        ground.set_editor_property("g", True)
        ground.set_editor_property("b", False)
        ground.set_editor_property("a", False)
        link(world, "", ground, "")

        heading = expr(mat, unreal.MaterialExpressionComponentMask, -1350, 900)
        heading.set_editor_property("r", True)
        heading.set_editor_property("g", True)
        heading.set_editor_property("b", False)
        heading.set_editor_property("a", False)
        link(heading3, "", heading, "")

        downwind = expr(mat, unreal.MaterialExpressionDotProduct, -1000, 850)
        link(ground, "", downwind, "A")
        link(heading, "", downwind, "B")

        stretch = expr(mat, unreal.MaterialExpressionConstant, -1000, 960)
        stretch.set_editor_property("r", wavelength)
        phase = expr(mat, unreal.MaterialExpressionMultiply, -800, 900)
        link(downwind, "", phase, "A")
        link(stretch, "", phase, "B")

        time = expr(mat, unreal.MaterialExpressionTime, -1200, 1200)
        speed = wind("WindSpeed", 1400)
        advance = expr(mat, unreal.MaterialExpressionMultiply, -1000, 1300)
        link(time, "", advance, "A")
        link(speed, "", advance, "B")

        # A nudge out of step with the neighbours, not a random place in the cycle.
        # A full turn of per-instance offset decorrelates the field completely: one
        # clump leans while the one beside it stands up, which is not wind, it is
        # each plant having its own private weather. A fraction of a turn keeps the
        # gust legible and still stops the field moving as one rigid sheet.
        turn = expr(mat, unreal.MaterialExpressionConstant, -1200, 1700)
        turn.set_editor_property("r", 6.2831853 * spec.get("wind_scatter", 0.12))
        stagger = expr(mat, unreal.MaterialExpressionMultiply, -1000, 1600)
        link(scatter, "", stagger, "A")
        link(turn, "", stagger, "B")

        moving = expr(mat, unreal.MaterialExpressionAdd, -800, 1300)
        link(advance, "", moving, "A")
        link(stagger, "", moving, "B")

        argument = expr(mat, unreal.MaterialExpressionAdd, -600, 1100)
        link(phase, "", argument, "A")
        link(moving, "", argument, "B")

        # The input pin is unnamed. Naming it "Input" -- which is what the property
        # is called -- connects nothing, and the material then fails to compile with
        # "Missing Sine input" long after the script has reported success.
        swing = expr(mat, unreal.MaterialExpressionSine, -400, 1100)
        link(argument, "", swing, "")

        # Gusts, not oscillation. A sine spends half its cycle negative, and a
        # negative displacement leans the blade into the wind -- so half the field is
        # always bending upwind, which is the thing that reads as wobble rather than
        # weather. Folded to nought-and-one the grass only ever leans downwind, and
        # what varies is how hard it is pushed.
        wave = expr(mat, unreal.MaterialExpressionLinearInterpolate, -250, 1060)
        wave.set_editor_property("const_a", spec.get("wind_lull", 0.15))
        wave.set_editor_property("const_b", 1.0)
        link(swing, "", wave, "Alpha")

        # Bent like a cantilever rather than sheared like a stack of cards.
        #
        # Weighting the sway by height directly is a straight line from a still root
        # to a moving tip, which puts real travel into the lower third of the blade
        # -- and a plant whose base swings is a plant that is not rooted in anything.
        # Raising it concentrates the movement at the top, where a blade actually
        # gives, and stiffens the bottom towards nothing.
        bend_curve = expr(mat, unreal.MaterialExpressionPower, -250, 1140)
        link(lifted, "", bend_curve, "Base")
        bend_curve.set_editor_property("const_exponent", spec.get("wind_stiffness", 2.4))

        weighted = expr(mat, unreal.MaterialExpressionMultiply, -200, 1100)
        link(wave, "", weighted, "A")
        link(bend_curve, "", weighted, "B")

        # Every clump pushed the same way, because they are all standing in the same
        # wind. The strength varies with the gust above; the heading does not.
        # How far this particular plant gives stays here -- a blade of grass and a
        # branch answer the same weather by different amounts -- but it is scaled by
        # the collection's strength, which is what a gust front turns up for
        # everything at once.
        reach = expr(mat, unreal.MaterialExpressionConstant, -500, 1460)
        reach.set_editor_property("r", spec.get("wind_amplitude", 2.2))
        amplitude = expr(mat, unreal.MaterialExpressionMultiply, -350, 1420)
        link(reach, "", amplitude, "A")
        link(wind("WindStrength", 1520), "", amplitude, "B")

        # Masked to three channels: a collection parameter reads back as a float4,
        # and a four-channel offset added to a three-channel world position is not a
        # broadened type, it is a material that will not compile.
        heading_xyz = expr(mat, unreal.MaterialExpressionComponentMask, -350, 1360)
        heading_xyz.set_editor_property("r", True)
        heading_xyz.set_editor_property("g", True)
        heading_xyz.set_editor_property("b", True)
        heading_xyz.set_editor_property("a", False)
        link(heading3, "", heading_xyz, "")

        sway = expr(mat, unreal.MaterialExpressionMultiply, -200, 1400)
        link(heading_xyz, "", sway, "A")
        link(amplitude, "", sway, "B")
        offset = expr(mat, unreal.MaterialExpressionMultiply, 0, 1200)
        link(weighted, "", offset, "A")
        link(sway, "", offset, "B")

    # Clumps shrink into their own pivot as they go away, each starting at its
    # own distance.
    #
    # A cull distance alone is a line in the world that things wink out of
    # crossing, and every clump crosses it at the same range -- so what the eye
    # catches is not one clump disappearing but a ring of them doing it at once.
    # Collapsing to the pivot spreads that disappearance over hundreds of units,
    # and the per-instance random spreads the ring itself into a band, so nothing
    # shares its moment with a neighbour.
    #
    # Distance is measured to the pivot rather than to the vertex: the pivot is
    # constant over a clump, so the whole thing shrinks together instead of its
    # far half leading its near half.
    camera = expr(mat, unreal.MaterialExpressionCameraPositionWS, -1400, 1900)
    span = expr(mat, unreal.MaterialExpressionDistance, -1200, 1950)
    link(camera, "", span, "A")
    link(pivot, "", span, "B")

    stagger_amount = spec.get("fade_stagger", 0.45)
    spread = expr(mat, unreal.MaterialExpressionConstant, -1400, 2100)
    spread.set_editor_property("r", stagger_amount)
    jitter = expr(mat, unreal.MaterialExpressionMultiply, -1200, 2100)
    link(scatter, "", jitter, "A")
    link(spread, "", jitter, "B")

    base_start = expr(mat, unreal.MaterialExpressionConstant, -1400, 2200)
    base_start.set_editor_property("r", 1.0 - stagger_amount * 0.5)
    scaled_start = expr(mat, unreal.MaterialExpressionAdd, -1000, 2150)
    link(jitter, "", scaled_start, "A")
    link(base_start, "", scaled_start, "B")

    begin = expr(mat, unreal.MaterialExpressionConstant, -1000, 2250)
    begin.set_editor_property("r", spec.get("fade_start", 2400.0))
    start = expr(mat, unreal.MaterialExpressionMultiply, -800, 2200)
    link(scaled_start, "", start, "A")
    link(begin, "", start, "B")

    past = expr(mat, unreal.MaterialExpressionSubtract, -600, 1950)
    link(span, "", past, "A")
    link(start, "", past, "B")

    reach = expr(mat, unreal.MaterialExpressionConstant, -600, 2100)
    reach.set_editor_property("r", 1.0 / max(spec.get("fade_range", 900.0), 1.0))
    ramp = expr(mat, unreal.MaterialExpressionMultiply, -400, 1950)
    link(past, "", ramp, "A")
    link(reach, "", ramp, "B")

    gone = expr(mat, unreal.MaterialExpressionClamp, -200, 1950)
    link(ramp, "", gone, "")

    to_pivot = expr(mat, unreal.MaterialExpressionSubtract, -1000, 1800)
    link(pivot, "", to_pivot, "A")
    link(world, "", to_pivot, "B")
    collapse = expr(mat, unreal.MaterialExpressionMultiply, 0, 1700)
    link(to_pivot, "", collapse, "A")
    link(gone, "", collapse, "B")

    if swaying:
        # The wind goes with it, or a clump shrunk to nothing still swings its
        # vanished self about and flickers a pixel where it used to be.
        standing = expr(mat, unreal.MaterialExpressionOneMinus, -200, 1750)
        link(gone, "", standing, "")
        settled = expr(mat, unreal.MaterialExpressionMultiply, 0, 1400)
        link(offset, "", settled, "A")
        link(standing, "", settled, "B")

        total = expr(mat, unreal.MaterialExpressionAdd, 200, 1500)
        link(settled, "", total, "A")
        link(collapse, "", total, "B")
    else:
        total = collapse

    MEL.connect_material_property(total, "", unreal.MaterialProperty.MP_WORLD_POSITION_OFFSET)
