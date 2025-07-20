@tool
extends EditorPlugin

const ItemDownloaderDock = preload("res://addons/item_downloader/item_downloader_dock.gd")

func _enter_tree():
	# Add the custom dock to the editor
	add_control_to_dock(DOCK_SLOT_LEFT_UL, ItemDownloaderDock.new())

func _exit_tree():
	# Clean up
	pass