extends Node2D

const FIRE_STATE_NONE = 0
const FIRE_STATE_BURNING = 1 << 0
const FIRE_STATE_SMOLDERING = 1 << 1
const FIRE_STATE_EXTINGUISHED = 1 << 2
const FIRE_STATE_SPREADING = 1 << 3
const FIRE_STATE_HELICOPTER = 1 << 29
const FIRE_STATE_RAIN = 1 << 30
const FIRE_STATE_DEBUG = 1 << 31


var map_type := "":
	set(val):
		map_type = val
		baseHP = Data.maps[val]["baseHp"]
		baseMaxHp = Data.maps[val]["baseHp"]
		gold = Data.maps[val]["startingGold"]
		$PathSpawner.map_type = val

var gameOver := false
var baseMaxHp := 20.0
var baseHP := baseMaxHp
var gold := 100:
	set(value):
		gold = value
		Globals.goldChanged.emit(value)

func _ready():
	Globals.turretsNode = $Turrets
	Globals.projectilesNode = $Projectiles
	Globals.currentMap = self

func get_base_damage(damage):
	if gameOver:
		return
	baseHP -= damage
	Globals.baseHpChanged.emit(baseHP, baseMaxHp)
	if baseHP <= 0:
		gameOver = true
		var gameOverPanelScene := preload("res://Scenes/ui/gameOver/game_over_panel.tscn")
		var gameOverPanel := gameOverPanelScene.instantiate()
		Globals.hud.add_child(gameOverPanel)
