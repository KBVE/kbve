extends Node

## The first scene the process draws, and the only cheap one.
##
## `main.tscn` used to be the main scene, so the process had to build the whole
## world -- QTerrain, every material, every shader -- before it could present a
## frame, and the player watched the engine splash for the duration. The title
## is no cheaper: it runs the same terrain and the same materials on purpose.
##
## This scene is a bare Node. It costs nothing to reach, which means the window
## is live almost immediately, and everything expensive after it loads behind a
## LoadingScreen that can actually draw.

const TITLE_SCENE := "res://scenes/title.tscn"
const WORLD_SCENE := "res://scenes/main.tscn"

## Skips the title on the way to the world. Iterating on the world through the
## title screen means two loads and a click per run, so `--world` puts F5 back
## where a world-facing change wants it. Running `main.tscn` directly (F6) is
## unaffected either way -- this scene is not in that path.
const WORLD_ARG := "--world"


func _ready() -> void:
	var target := WORLD_SCENE if OS.get_cmdline_user_args().has(WORLD_ARG) else TITLE_SCENE
	var what := "world" if target == WORLD_SCENE else "Friendslop"
	LoadingScreen.swap(get_tree(), target, what)
