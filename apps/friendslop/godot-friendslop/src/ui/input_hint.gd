class_name InputHint
extends RefCounted

## What to press, read off the binding rather than written into a string.
##
## A prompt that says E because somebody typed E is wrong the moment the key is rebound,
## and wrong on a keyboard whose layout puts that letter somewhere else.

## Pad faces, which have no name the engine will give out.
const PAD := {
	JOY_BUTTON_A: "A",
	JOY_BUTTON_B: "B",
	JOY_BUTTON_X: "X",
	JOY_BUTTON_Y: "Y",
	JOY_BUTTON_LEFT_SHOULDER: "LB",
	JOY_BUTTON_RIGHT_SHOULDER: "RB",
}


## The key bound to `action`, in the layout the player is actually typing on. Falls back to
## a pad face when nothing on the keyboard is bound, and to `fallback` when nothing is.
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


## Physical bindings are stored by position, so the label comes from the layout: the key
## where QWERTY keeps E is not the letter E everywhere.
static func _key_label(key: InputEventKey) -> String:
	if key.physical_keycode != 0:
		var mapped := DisplayServer.keyboard_get_label_from_physical(key.physical_keycode)
		return OS.get_keycode_string(mapped if mapped != 0 else key.physical_keycode)
	if key.keycode != 0:
		return OS.get_keycode_string(key.keycode)
	return ""
