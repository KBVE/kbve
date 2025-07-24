class_name RegenerationManager
extends Node

# Registry of entities with regeneration
var regen_entities: Array[Node] = []

# Regeneration config
var regen_timer: Timer
var regen_interval: float = 5.0  # Check every 5 seconds

func _ready():
	setup_regen_timer()

func setup_regen_timer():
	"""Setup the main regeneration timer"""
	regen_timer = Timer.new()
	regen_timer.wait_time = regen_interval
	regen_timer.timeout.connect(_on_regen_tick)
	regen_timer.autostart = true
	add_child(regen_timer)
	print("RegenerationManager initialized with ", regen_interval, "s interval")

func register_entity(entity: Node):
	"""Register an entity for regeneration"""
	if entity not in regen_entities:
		regen_entities.append(entity)
		print("Registered entity for regeneration: ", entity.name)

func unregister_entity(entity: Node):
	"""Unregister an entity from regeneration"""
	if entity in regen_entities:
		regen_entities.erase(entity)
		print("Unregistered entity from regeneration: ", entity.name)

func _on_regen_tick():
	"""Process regeneration for all registered entities"""
	# Clean up invalid entities
	for i in range(regen_entities.size() - 1, -1, -1):
		var entity = regen_entities[i]
		if not entity or not is_instance_valid(entity):
			regen_entities.remove_at(i)
	
	# Process regeneration for valid entities
	for entity in regen_entities:
		process_entity_regeneration(entity)

func process_entity_regeneration(entity: Node):
	"""Process regeneration for a specific entity"""
	if not entity.has_method("regenerate"):
		return
	
	# Call the entity's regenerate method
	entity.regenerate()

func get_stats() -> Dictionary:
	"""Get regeneration manager statistics"""
	return {
		"registered_entities": regen_entities.size(),
		"regen_interval": regen_interval
	}