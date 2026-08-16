class_name KbveApi
extends Node

## Reads the signed-in player's account from the KBVE API.

## Balance arrived.
signal wallet(credits: int, khash: int)
## Nothing could be read, with wording to show.
signal wallet_failed(reason: String)
## The handle is now theirs.
signal username_set(username: String)
## It is not, with wording to show.
signal username_failed(reason: String)

const BASE_URL := "https://kbve.com"
const WALLET_PATH := "/api/v1/wallet/me/balance"
const USERNAME_PATH := "/api/v1/profile/username"
const TIMEOUT := 10.0

var _request: HTTPRequest
var _username_request: HTTPRequest
var _claimed := ""


func _ready() -> void:
	_request = HTTPRequest.new()
	_request.timeout = TIMEOUT
	add_child(_request)
	_request.request_completed.connect(_on_wallet)

	# Its own request node, so a balance still in flight cannot cancel a claim or be
	# mistaken for its answer.
	_username_request = HTTPRequest.new()
	_username_request.timeout = TIMEOUT
	add_child(_username_request)
	_username_request.request_completed.connect(_on_username)


## Asks for the balance behind `token`. A guest has no token and no balance, so nothing
## is sent rather than a call being made that can only come back unauthorized.
func fetch_wallet(token: String) -> void:
	if _request == null:
		return
	if token.is_empty():
		wallet_failed.emit("not signed in")
		return
	var headers := PackedStringArray([
		"Authorization: Bearer " + token,
		"Accept: application/json",
	])
	var err := _request.request(BASE_URL + WALLET_PATH, headers)
	if err != OK:
		wallet_failed.emit("request failed (%d)" % err)


## Anything unreadable is reported rather than shown as zero. A balance of nothing is a
## number a player would act on, and it is not the same claim as "could not be read".
func _on_wallet(result: int, code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
	if result != HTTPRequest.RESULT_SUCCESS:
		wallet_failed.emit("no answer (%d)" % result)
		return
	if code == 401 or code == 403:
		wallet_failed.emit("session expired")
		return
	if code != 200:
		wallet_failed.emit("http %d" % code)
		return
	var parsed: Variant = JSON.parse_string(body.get_string_from_utf8())
	if typeof(parsed) != TYPE_DICTIONARY:
		wallet_failed.emit("unreadable balance")
		return
	if not parsed.has("credits") or not parsed.has("khash"):
		wallet_failed.emit("unreadable balance")
		return
	wallet.emit(int(parsed["credits"]), int(parsed["khash"]))


## Claims `username` for whoever holds `token`.
##
## The caller must refresh the session afterwards. The handle lands in the account's
## `kbve_username` claim, and the token already in hand was minted before it existed — so
## until it is traded in, the client is holding proof of an account that still looks
## nameless.
func set_username(token: String, username: String) -> void:
	if _username_request == null:
		return
	if token.is_empty():
		username_failed.emit("not signed in")
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
		username_failed.emit("request failed (%d)" % err)


## A refused name is reported in the server's own words where it has any: "already taken"
## is something the player can act on, where a status code is not.
func _on_username(result: int, code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
	if result != HTTPRequest.RESULT_SUCCESS:
		username_failed.emit("no answer (%d)" % result)
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
	username_failed.emit("http %d" % code)
