class_name Movement
extends RefCounted

const TILE_SIZE = 32
const MOVE_SPEED = 80.0

static func get_world_position(grid_pos: Vector2i) -> Vector2:
	return Vector2(
		grid_pos.x * TILE_SIZE + TILE_SIZE / 2,
		grid_pos.y * TILE_SIZE + TILE_SIZE / 2
	)

static func get_grid_position(world_pos: Vector2) -> Vector2i:
	return Vector2i(
		int(world_pos.x / TILE_SIZE),
		int(world_pos.y / TILE_SIZE)
	)

static func is_valid_move(from: Vector2i, to: Vector2i) -> bool:
	return World.is_valid_position(to.x, to.y)

class MoveComponent:
	signal movement_started(entity: Node2D, from: Vector2i, to: Vector2i)
	signal movement_finished(entity: Node2D, at: Vector2i)
	
	var entity: Node2D
	var current_grid_pos: Vector2i
	var target_grid_pos: Vector2i
	var target_world_pos: Vector2
	var is_moving: bool = false
	var move_queue: Array[Vector2i] = []
	
	func _init(entity_node: Node2D, start_pos: Vector2i):
		entity = entity_node
		current_grid_pos = start_pos
		target_grid_pos = start_pos
		target_world_pos = Movement.get_world_position(start_pos)
		entity.position = target_world_pos
	
	func move_to(grid_pos: Vector2i, immediate: bool = false):
		if not Movement.is_valid_move(current_grid_pos, grid_pos):
			return false
		
		if immediate:
			var start_pos = current_grid_pos
			
			move_queue.clear()
			
			if is_moving:
				start_pos = current_grid_pos
			
			target_grid_pos = grid_pos
			target_world_pos = Movement.get_world_position(grid_pos)
			is_moving = true
			
			movement_started.emit(entity, start_pos, target_grid_pos)
			return true
		else:
			if is_moving:
				var current_pos = Movement.get_grid_position(entity.position)
				move_queue.clear()
				target_grid_pos = grid_pos
				target_world_pos = Movement.get_world_position(grid_pos)
				
				movement_started.emit(entity, current_pos, target_grid_pos)
				return true
			else:
				var start_pos = current_grid_pos
				target_grid_pos = grid_pos
				target_world_pos = Movement.get_world_position(grid_pos)
				is_moving = true
				
				movement_started.emit(entity, start_pos, target_grid_pos)
				return true
	
	func process_movement(delta: float):
		if not is_moving:
			return
		
		var distance = entity.position.distance_to(target_world_pos)
		if distance < 2.0:
			entity.position = target_world_pos
			current_grid_pos = target_grid_pos
			is_moving = false
			
			movement_finished.emit(entity, current_grid_pos)
			
			if move_queue.size() > 0:
				var next_target = move_queue.pop_front()
				move_to(next_target, false)
		else:
			var direction = (target_world_pos - entity.position).normalized()
			entity.position += direction * MOVE_SPEED * delta
	
	func get_current_position() -> Vector2i:
		if is_moving:
			return Movement.get_grid_position(entity.position)
		else:
			return current_grid_pos
	
	func get_target_position() -> Vector2i:
		return target_grid_pos
	
	func is_currently_moving() -> bool:
		return is_moving
	
	func cancel_movement():
		if is_moving:
			move_queue.clear()
			is_moving = false
			current_grid_pos = Movement.get_grid_position(entity.position)