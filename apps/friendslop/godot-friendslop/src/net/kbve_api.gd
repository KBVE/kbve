class_name KbveApi
extends Node

## Reads the signed-in player's account from the KBVE API.

## Balance arrived.
signal wallet(credits: int, khash: int)
## Nothing could be read, with wording to show.
signal wallet_failed(reason: String)

const BASE_URL := "https://kbve.com"
const WALLET_PATH := "/api/v1/wallet/me/balance"
const TIMEOUT := 10.0

var _request: HTTPRequest


func _ready() -> void:
	_request = HTTPRequest.new()
	_request.timeout = TIMEOUT
	add_child(_request)
	_request.request_completed.connect(_on_wallet)


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
