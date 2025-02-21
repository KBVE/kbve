extends Control

@onready var coordinates_label = $Panel/Menu/Nav/Label
@onready var name_label = $Panel/Menu/Nav/StarshipName

# Resources

@onready var gold_label = $Panel/Menu/ResourceBar/GoldBox/GoldLabel
@onready var stone_label = $Panel/Menu/ResourceBar/StoneBox/StoneLabel
@onready var metal_label = $Panel/Menu/ResourceBar/MetalBox/MetalLabel
@onready var gems_label = $Panel/Menu/ResourceBar/GemsBox/GemsLabel

@onready var gold_icon = $Panel/Menu/ResourceBar/GoldBox/GoldIcon
@onready var stone_icon = $Panel/Menu/ResourceBar/StoneBox/StoneIcon
@onready var metal_icon = $Panel/Menu/ResourceBar/MetalBox/MetalIcon
@onready var gems_icon = $Panel/Menu/ResourceBar/GemsBox/GemsIcon


var resource_labels = {}
var resource_icons = {}


func _ready():
	resource_labels = {
		"gold": gold_label,
		"stone": stone_label,
		"metal": metal_label,
		"gems": gems_label
	}

	resource_icons = {
		"gold": gold_icon,
		"stone": stone_icon,
		"metal": metal_icon,
		"gems": gems_icon
	}
	
	call_deferred("_update_starship_name")
	call_deferred("_update_starship_resources")
	Global.connect("resource_changed", Callable(self, "_on_resource_changed"))
	Global.connect("starship_data_changed", Callable(self, "_update_starship_data"))
	update_coordinates(Global.get_starship_coordinates())

func update_coordinates(coords: Vector2):
	if coordinates_label:
		coordinates_label.text = "Coords X: %d, Y: %d" % [coords.x, coords.y]
	else:
		push_warning("Coordinates label not found!")

func _update_starship_data(data_name: String, value):
	if data_name == "coordinates":
		update_coordinates(value)

func _update_starship_resources():
	for resource in Global.resources_list:
		var amount = Global.get_resource(resource)
		if resource_labels.has(resource) and resource_labels[resource]:
			#resource_labels[resource].text = "%s: %d" % [resource.capitalize(), amount]
			resource_labels[resource].text = "%d" % [amount]

func _on_resource_changed(resource_name: String, new_value: int):
		if resource_labels.has(resource_name) and resource_labels[resource_name]:
			#resource_labels[resource_name].text = "%s: %d" % [resource_name.capitalize(), new_value]
			resource_labels[resource_name].text = "%d" % [new_value]

func _update_starship_name():
	var starship_name = Global.get_starship_data("name")
	if name_label:
		if starship_name:
			name_label.text = "Starship: " + starship_name
		else:
			name_label.text = "Starship: Unknown"
	else:
		push_warning("Starship name label not found!")
