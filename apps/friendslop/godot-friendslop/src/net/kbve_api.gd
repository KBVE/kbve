class_name KbveApi
extends Node


signal wallet(credits: int, khash: int)
signal wallet_failed(reason: String)
signal username_set(username: String)
signal username_failed(reason: String)

const BASE_URL := "https://kbve.com"
const WALLET_PATH := "/api/v1/wallet/me/balance"
const USERNAME_PATH := "/api/v1/profile/username"
const TIMEOUT := 10.0

var _request: HTTPRequest
var _username_request: HTTPRequest
var _claimed := ""
var _fetching_wallet := false


func _ready() -> void:
	_request = HTTPRequest.new()
	_request.timeout = TIMEOUT
	add_child(_request)
	_request.request_completed.connect(_on_wallet)

	_username_request = HTTPRequest.new()
	_username_request.timeout = TIMEOUT
	add_child(_username_request)
	_username_request.request_completed.connect(_on_username)


func fetch_wallet(token: String) -> void:
	if _request == null or _fetching_wallet:
		return
	if token.is_empty():
		wallet_failed.emit(I18n.t("api.not_signed_in"))
		return
	var headers := PackedStringArray([
		"Authorization: Bearer " + token,
		"Accept: application/json",
	])
	var err := _request.request(BASE_URL + WALLET_PATH, headers)
	if err != OK:
		wallet_failed.emit(I18n.t("api.request_failed", {"code": err}))
		return
	_fetching_wallet = true


func _on_wallet(result: int, code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
	_fetching_wallet = false
	if result != HTTPRequest.RESULT_SUCCESS:
		wallet_failed.emit(I18n.t("api.no_answer", {"code": result}))
		return
	if code == 401 or code == 403:
		wallet_failed.emit(I18n.t("api.session_expired"))
		return
	if code != 200:
		wallet_failed.emit(I18n.t("api.http_error", {"code": code}))
		return
	var parsed: Variant = JSON.parse_string(body.get_string_from_utf8())
	if typeof(parsed) != TYPE_DICTIONARY:
		wallet_failed.emit(I18n.t("api.unreadable_balance"))
		return
	if not parsed.has("credits") or not parsed.has("khash"):
		wallet_failed.emit(I18n.t("api.unreadable_balance"))
		return
	wallet.emit(int(parsed["credits"]), int(parsed["khash"]))


func set_username(token: String, username: String) -> void:
	if _username_request == null:
		return
	if token.is_empty():
		username_failed.emit(I18n.t("api.not_signed_in"))
		return
	_claimed = username
	var headers := PackedStringArray([
		"Authorization: Bearer " + token,
		"Content-Type: application/json",
		"Accept: application/json",
	])
	var body := JSON.stringify({"username": username})
	var err := _username_request.request(BASE_URL + USERNAME_PATH, headers, HTTPClient.METHOD_POST, body)
	if err != OK:
		username_failed.emit(I18n.t("api.request_failed", {"code": err}))


func _on_username(result: int, code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
	if result != HTTPRequest.RESULT_SUCCESS:
		username_failed.emit(I18n.t("api.no_answer", {"code": result}))
		return
	var parsed: Variant = JSON.parse_string(body.get_string_from_utf8())
	if code == 200 or code == 201:
		var taken := _claimed
		if typeof(parsed) == TYPE_DICTIONARY and parsed.has("username"):
			taken = str(parsed["username"])
		username_set.emit(taken)
		return
	if typeof(parsed) == TYPE_DICTIONARY:
		for key in ["error", "message", "detail"]:
			var said: String = str(parsed.get(key, ""))
			if not said.is_empty():
				username_failed.emit(said)
				return
	if code == 409:
		username_failed.emit(I18n.t("username.taken"))
		return
	username_failed.emit(I18n.t("api.http_error", {"code": code}))
