extends CharacterBody2D

func _ready():
	var hitbox = get_node_or_null("HitBox")
	if hitbox:
		hitbox.area_entered.connect(_on_hitbox_area_entered)
		print("🚢 PlayerCharacter: Connected HitBox signals")

func _on_hitbox_area_entered(area: Area2D):
	"""Called when projectiles hit the player's hitbox"""
	print("🎯 PLAYER CHARACTER HITBOX HIT by area: ", area.name)
	
	var projectile = area.get_parent()
	if projectile and projectile.has_method("hit_entity"):
		print("🎯 Projectile found: ", projectile.name, " calling hit_entity")
		projectile.hit_entity(self)
	elif projectile and "damage" in projectile:
		print("🎯 Direct damage from: ", projectile.name, " damage: ", projectile.damage)
		take_damage(projectile.damage)

func take_damage(damage: int):
	"""Forward damage to the Player autoload"""
	print("🚢 PlayerCharacter forwarding damage to Player autoload")
	if Player:
		Player.take_damage(damage)
	else:
		print("❌ Player autoload not found!")