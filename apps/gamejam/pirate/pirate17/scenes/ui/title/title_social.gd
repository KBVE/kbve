extends Control

@onready var youtube_button = $SocialContainer/SocialButtons/YouTubeButton
@onready var twitch_button = $SocialContainer/SocialButtons/TwitchButton
@onready var discord_button = $SocialContainer/SocialButtons/DiscordButton
@onready var github_button = $SocialContainer/SocialButtons/GitHubButton
@onready var website_button = $SocialContainer/SocialButtons/WebsiteButton

func _ready():
	if youtube_button:
		youtube_button.pressed.connect(_on_youtube_pressed)
	if twitch_button:
		twitch_button.pressed.connect(_on_twitch_pressed)
	if discord_button:
		discord_button.pressed.connect(_on_discord_pressed)
	if github_button:
		github_button.pressed.connect(_on_github_pressed)
	if website_button:
		website_button.pressed.connect(_on_website_pressed)

func open_url(url: String):
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