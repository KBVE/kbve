"""Scripts that run inside Unreal's embedded Python, not host-side.

Every module here imports `unreal`, which only exists inside a running editor,
so nothing in this package imports them at module scope. They are handed to
UnrealEditor-Cmd by absolute path (see kbve.unreal.commandlet) and read their
per-game values from the JSON file named by KBVE_UNREAL_CONFIG.

That split is the point: the logic is the same for every KBVE Unreal game, the
values are not, and the values belong in the game's repository where they show
up in a diff.
"""
