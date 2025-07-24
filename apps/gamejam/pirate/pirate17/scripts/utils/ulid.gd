class_name ULID
extends RefCounted

static func generate() -> String:
	var timestamp = Time.get_unix_time_from_system()
	var random_part = ""
	
	var chars = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
	
	for i in range(16):
		random_part += chars[randi() % chars.length()]
	
	var time_part = ""
	var time_val = int(timestamp * 1000)
	
	for i in range(10):
		time_part = chars[time_val % 32] + time_part
		time_val = int(time_val / 32)
	
	return time_part + random_part
