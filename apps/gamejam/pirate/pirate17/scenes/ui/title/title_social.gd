extends Control

@onready var youtube_button = $SocialContainer/SocialButtons/YouTubeButton
@onready var twitch_button = $SocialContainer/SocialButtons/TwitchButton
@onready var discord_button = $SocialContainer/SocialButtons/DiscordButton
@onready var github_button = $SocialContainer/SocialButtons/GitHubButton
@onready var website_button = $SocialContainer/SocialButtons/WebsiteButton

var button_tweens: Dictionary = {}

func _ready():
	var buttons = [youtube_button, twitch_button, discord_button, github_button, website_button]
	
	for button in buttons:
		if button:
			button.pressed.connect(_get_button_callback(button))
			button.mouse_entered.connect(_on_button_hover_start.bind(button))
			button.mouse_exited.connect(_on_button_hover_end.bind(button))

func _get_button_callback(button: Button) -> Callable:
	if button == youtube_button:
		return _on_youtube_pressed
	elif button == twitch_button:
		return _on_twitch_pressed
	elif button == discord_button:
		return _on_discord_pressed
	elif button == github_button:
		return _on_github_pressed
	elif button == website_button:
		return _on_website_pressed
	else:
		return func(): pass

func _on_button_hover_start(button: Button):
	if button_tweens.has(button):
		button_tweens[button].kill()
	
	var tween = create_tween()
	button_tweens[button] = tween
	tween.set_loops()
	tween.set_parallel(true)
	
	var shimmer_tween = tween.tween_method(
		func(alpha: float): button.modulate = Color(button.modulate.r, button.modulate.g, button.modulate.b, alpha),
		1.0,
		0.6,
		0.8
	)
	shimmer_tween.set_ease(Tween.EASE_IN_OUT)
	shimmer_tween.set_trans(Tween.TRANS_SINE)
	
	var shimmer_reverse = tween.tween_method(
		func(alpha: float): button.modulate = Color(button.modulate.r, button.modulate.g, button.modulate.b, alpha),
		0.6,
		1.0,
		0.8
	)
	shimmer_reverse.set_ease(Tween.EASE_IN_OUT)
	shimmer_reverse.set_trans(Tween.TRANS_SINE)
	shimmer_reverse.set_delay(0.8)
	
	var color_tween = tween.tween_method(
		func(color_val: float):
			var current_alpha = button.modulate.a
			var r = lerp(1.0, 1.2, color_val)
			var g = lerp(1.0, 1.1, color_val)
			var b = lerp(1.0, 0.8, color_val)
			button.modulate = Color(r, g, b, current_alpha),
		0.0,
		1.0,
		1.2
	)
	color_tween.set_ease(Tween.EASE_IN_OUT)
	color_tween.set_trans(Tween.TRANS_CUBIC)
	
	var color_reverse = tween.tween_method(
		func(color_val: float):
			var current_alpha = button.modulate.a
			var r = lerp(1.2, 1.0, color_val)
			var g = lerp(1.1, 1.0, color_val)
			var b = lerp(0.8, 1.0, color_val)
			button.modulate = Color(r, g, b, current_alpha),
		0.0,
		1.0,
		1.2
	)
	color_reverse.set_ease(Tween.EASE_IN_OUT)
	color_reverse.set_trans(Tween.TRANS_CUBIC)
	color_reverse.set_delay(1.2)

func _on_button_hover_end(button: Button):
	if button_tweens.has(button):
		button_tweens[button].kill()
		button_tweens.erase(button)
	
	var reset_tween = create_tween()
	reset_tween.tween_property(button, "modulate", Color.WHITE, 0.3)

func open_url(url: String):
	# Play confirm sound effect
	var music_player = get_node_or_null("/root/MusicPlayerAutoload")
	if music_player:
		music_player.play_sfx("confirm")
	
	if OS.has_feature("web"):
		JavaScriptBridge.eval("window.open('" + url + "', '_blank');")
	else:
		OS.shell_open(url)

func _on_youtube_pressed():
	open_url("https://youtube.com/@kbve")

func _on_twitch_pressed():
	open_url("https://twitch.tv/kbve")

func _on_discord_pressed():
	open_url("https://kbve.com/discord/")

func _on_github_pressed():
	open_url("https://github.com/KBVE/kbve")

func _on_website_pressed():
	open_url("https://kbve.com")
