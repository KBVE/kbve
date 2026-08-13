extends Node

## The first scene the process draws, and the only cheap one.

const TITLE_SCENE := "res://scenes/title.tscn"
const WORLD_SCENE := "res://scenes/main.tscn"

## Skips the title on the way to the world.
const WORLD_ARG := "--world"


func _ready() -> void:
	var target := WORLD_SCENE if OS.get_cmdline_user_args().has(WORLD_ARG) else TITLE_SCENE
	var what := "world" if target == WORLD_SCENE else "Friendslop"
	LoadingScreen.swap(get_tree(), target, what)
