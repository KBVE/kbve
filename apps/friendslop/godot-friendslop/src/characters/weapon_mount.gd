extends SkeletonModifier3D

## Holds a weapon in a character's hand, and puts the other hand on it when the weapon
## takes two.

const TwoBoneIK := preload("res://src/characters/two_bone_ik.gd")
const WeaponProxy := preload("res://src/items/weapon_proxy.gd")

const ARMS := {
	&"RightHand": {"upper": &"RightUpperArm", "lower": &"RightLowerArm", "hand": &"RightHand",
		"index": &"RightIndexProximal", "little": &"RightLittleProximal",
		"middle": &"RightMiddleProximal", "tip": &"RightMiddleDistal"},
	&"LeftHand": {"upper": &"LeftUpperArm", "lower": &"LeftLowerArm", "hand": &"LeftHand",
		"index": &"LeftIndexProximal", "little": &"LeftLittleProximal",
		"middle": &"LeftMiddleProximal", "tip": &"LeftMiddleDistal"},
}

## Seats the grip in the palm, and is measured off the rig rather than set.
@export var palm := Transform3D.IDENTITY
## Which hand carries it.
@export var main_hand: StringName = &"RightHand"
## Where the weapon is anchored.
@export_enum("carry", "hand") var anchor := "carry"
@export var carry_bone: StringName = &"UpperChest"
## Left at identity it is derived from the rig's own arm length, so the weapon sits at a
## fraction of the reach it has rather than at a distance that only suits one
## character's proportions.
@export var carry := Transform3D.IDENTITY
## How firmly the off hand is pulled onto the second grip.
@export_range(0.0, 1.0) var off_hand_grip := 1.0

var weapon: Node3D
var _grip := Transform3D.IDENTITY
var _off_grip := Transform3D.IDENTITY
var _two_handed := false
## Resolved once, since these come off the rest pose and cannot change after.
var _seat := Transform3D.IDENTITY
var _carry := Transform3D.IDENTITY
var _seated := false


## Hangs a weapon scene off the hand.
func equip(scene: PackedScene) -> void:
	_hold(scene.instantiate() as Node3D if scene else null)


## Same, with one of the stand-ins rather than a scene.
func equip_proxy(kind: String) -> void:
	_hold(WeaponProxy.make(kind))


func _hold(node: Node3D) -> void:
	if weapon:
		weapon.queue_free()
		weapon = null
	_two_handed = false
	if node == null:
		return
	weapon = node
	add_child(weapon)

	var main := weapon.get_node_or_null("Grip_Main") as Node3D
	var off := weapon.get_node_or_null("Grip_Off") as Node3D
	_grip = main.transform if main else Transform3D.IDENTITY
	if off:
		_off_grip = off.transform
		_two_handed = true
	if main == null:
		push_warning("weapon_mount: %s has no Grip_Main, holding it by its origin"
				% weapon.name)


## Where a closed fist holds a haft, in the hand bone's own frame.
func _measure_palm(skeleton: Skeleton3D, arm: Dictionary) -> Transform3D:
	var index := skeleton.find_bone(arm.index)
	var little := skeleton.find_bone(arm.little)
	var middle := skeleton.find_bone(arm.middle)
	var tip := skeleton.find_bone(arm.tip)
	var hand := skeleton.find_bone(arm.hand)
	if index < 0 or little < 0 or middle < 0 or tip < 0 or hand < 0:
		push_warning("weapon_mount: %s has no finger bones, holding at the wrist" % arm.hand)
		return Transform3D.IDENTITY

	var at_index := skeleton.get_bone_global_rest(index).origin
	var at_little := skeleton.get_bone_global_rest(little).origin
	var at_middle := skeleton.get_bone_global_rest(middle).origin
	var haft := at_index - at_little
	var fingers := skeleton.get_bone_global_rest(tip).origin - at_middle
	if haft.length_squared() < 0.000001 or fingers.length_squared() < 0.000001:
		return Transform3D.IDENTITY
	var y := haft.normalized()
	var z := fingers - y * fingers.dot(y)
	if z.length_squared() < 0.000001:
		return Transform3D.IDENTITY
	z = z.normalized()
	var grip := Transform3D(Basis(y.cross(z), y, z), (at_index + at_little + at_middle) / 3.0)
	return skeleton.get_bone_global_rest(hand).affine_inverse() * grip


func _process_modification() -> void:
	var skeleton := get_skeleton()
	if skeleton == null or weapon == null:
		return
	var arm: Dictionary = ARMS.get(main_hand, ARMS[&"RightHand"])
	var hand := skeleton.find_bone(arm.hand)
	if hand < 0:
		return
	if not _seated:
		_seated = true
		_seat = palm if palm != Transform3D.IDENTITY else _measure_palm(skeleton, arm)
		_carry = carry if carry != Transform3D.IDENTITY else _measure_carry(skeleton, arm)

	var to_world := skeleton.global_transform
	var other: Dictionary = ARMS[&"LeftHand"] if main_hand == &"RightHand" else ARMS[&"RightHand"]

	if anchor == "hand":
		var held := to_world * skeleton.get_bone_global_pose(hand) * _seat * _grip.affine_inverse()
		weapon.global_transform = held
		if _two_handed and off_hand_grip > 0.001:
			_reach(skeleton, other, (held * _off_grip).origin, off_hand_grip)
		return

	var chest := skeleton.find_bone(carry_bone)
	if chest < 0:
		return
	var borne := to_world * skeleton.get_bone_global_pose(chest) * _carry
	weapon.global_transform = borne
	_reach(skeleton, arm, (borne * _grip).origin, 1.0)
	if _two_handed and off_hand_grip > 0.001:
		_reach(skeleton, other, (borne * _off_grip).origin, off_hand_grip)


func _reach(skeleton: Skeleton3D, arm: Dictionary, goal: Vector3, amount: float) -> void:
	TwoBoneIK.solve(skeleton, skeleton.find_bone(arm.upper), skeleton.find_bone(arm.lower),
			skeleton.find_bone(arm.hand), goal, amount)


## A weapon held ready, placed off the arm it is held with rather than off numbers that
## suit one character's build.
func _measure_carry(skeleton: Skeleton3D, arm: Dictionary) -> Transform3D:
	var upper := skeleton.find_bone(arm.upper)
	var lower := skeleton.find_bone(arm.lower)
	var hand := skeleton.find_bone(arm.hand)
	var chest := skeleton.find_bone(carry_bone)
	if upper < 0 or lower < 0 or hand < 0 or chest < 0:
		return Transform3D.IDENTITY
	var at_upper := skeleton.get_bone_global_rest(upper).origin
	var at_lower := skeleton.get_bone_global_rest(lower).origin
	var reach := at_upper.distance_to(at_lower) \
			+ at_lower.distance_to(skeleton.get_bone_global_rest(hand).origin)

	var side := 1.0 if main_hand == &"RightHand" else -1.0
	var chest_rest := skeleton.get_bone_global_rest(chest)
	var front := Vector3(reach * 0.16 * side, -reach * 0.12, reach * 0.52)
	return Transform3D(Basis(), chest_rest.basis.inverse() * front)
