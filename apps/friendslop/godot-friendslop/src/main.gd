extends Node3D

const HIDE_TARGETS := {
	"post": "PostFX",
	"ravens": "Ravens",
	"hud": "DebugHud",
}


func _ready() -> void:
	for key in OS.get_environment("Q_HIDE").split(",", false):
		var target: String = HIDE_TARGETS.get(key.strip_edges(), "")
		if target.is_empty():
			continue
		var node := get_node_or_null(NodePath(target))
		if node:
			node.set("visible", false)
