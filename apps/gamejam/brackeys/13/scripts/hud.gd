extends Control

@onready var score_label = $Panel/Menu/Label
@onready var name_label = $Panel/Menu/StarshipName
@onready var stone_label = $Panel/Menu/Stone
@onready var metal_label = $Panel/Menu/Metal
@onready var gems_label = $Panel/Menu/Gems
@onready var gold_label = $Panel/Menu/Gold

var resource_labels = {}

func _ready():
	resource_labels = {
		"gold": gold_label,
		"stone": stone_label,
		"metal": metal_label,
		"gems": gems_label
	}
	
	call_deferred("_update_starship_name")
	call_deferred("_update_starship_resources")
	Global.connect("resource_changed", Callable(self, "_on_resource_changed"))
	update_score(0)

func update_score(new_score):
	if score_label:
		score_label.text = "Score: %d" % new_score
	else:
		push_warning("Score label not found!")

func _update_starship_resources():
	for resource in Global.resources_list:
		var amount = Global.get_resource(resource)
		if resource_labels.has(resource) and resource_labels[resource]:
			resource_labels[resource].text = "%s: %d" % [resource.capitalize(), amount]

func _on_resource_changed(resource_name: String, new_value: int):
		if resource_labels.has(resource_name) and resource_labels[resource_name]:
			resource_labels[resource_name].text = "%s: %d" % [resource_name.capitalize(), new_value]

func _update_starship_name():
	var starship_name = Global.get_starship_data("name")
	if name_label:
		if starship_name:
			name_label.text = "Starship: " + starship_name
		else:
			name_label.text = "Starship: Unknown"
	else:
		push_warning("Starship name label not found!")
