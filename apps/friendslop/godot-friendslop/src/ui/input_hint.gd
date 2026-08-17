class_name InputHint
extends RefCounted


const PAD := {
	JOY_BUTTON_A: "A",
	JOY_BUTTON_B: "B",
	JOY_BUTTON_X: "X",
	JOY_BUTTON_Y: "Y",
	JOY_BUTTON_LEFT_SHOULDER: "LB",
	JOY_BUTTON_RIGHT_SHOULDER: "RB",
}


static func label(action: StringName, fallback := "") -> String:
	if not InputMap.has_action(action):
		return fallback
	var events := InputMap.action_get_events(action)
	for event: InputEvent in events:
		var key := event as InputEventKey
		if key == null:
			continue
		var named := _key_label(key)
		if named != "":
			return named
	for event: InputEvent in events:
		var pad := event as InputEventJoypadButton
		if pad != null and PAD.has(pad.button_index):
			return PAD[pad.button_index]
	return fallback


static func _key_label(key: InputEventKey) -> String:
	if key.physical_keycode != 0:
		var mapped := DisplayServer.keyboard_get_label_from_physical(key.physical_keycode)
		return OS.get_keycode_string(mapped if mapped != 0 else key.physical_keycode)
	if key.keycode != 0:
		return OS.get_keycode_string(key.keycode)
	return ""
