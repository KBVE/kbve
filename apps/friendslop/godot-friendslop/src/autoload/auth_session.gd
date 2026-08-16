class_name AuthSession
extends Node

## Who the player currently is, for as long as the process lives.

signal changed

enum Mode {
	## No one has chosen yet — the state the title screen opens in.
	SIGNED_OUT,
	GUEST,
	ACCOUNT,
}

const SUPABASE_URL := "https://supabase.kbve.com"

## Public by design — it identifies the project, it does not authorize anything.
const ANON_KEY := "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzU1NDAzMjAwLCJleHAiOjE5MTMxNjk2MDB9.oietJI22ZytbghFywvdYMSJp7rcsBdBYbcciJxeGWrg"

const TIMEOUT_SECONDS := 15.0

## Providers offered on the title.
const PROVIDERS := ["discord", "github", "twitch"]

## Refresh this far before the token actually expires, so a join that takes a moment to
## travel does not arrive holding something that just went stale.
const REFRESH_MARGIN_SECONDS := 60

## Where the session is kept between runs.
const STORE_PATH := "user://session.cfg"

var _mode: Mode = Mode.SIGNED_OUT
var _token := ""
var _refresh_token := ""
var _expires_at := 0
var _username := ""
var _error := ""


func _ready() -> void:
	_restore()


func mode() -> Mode:
	return _mode


func is_signed_in() -> bool:
	return _mode != Mode.SIGNED_OUT


func is_guest() -> bool:
	return _mode == Mode.GUEST


## Why the last sign-in failed, in words a player can act on.
func last_error() -> String:
	return _error


## Immediate and infallible.
func sign_in_as_guest() -> void:
	_mode = Mode.GUEST
	_token = ""
	_refresh_token = ""
	_expires_at = 0
	_username = ""
	_error = ""
	changed.emit()


## Exchanges credentials for a token.
func sign_in(email: String, password: String) -> Error:
	if email.strip_edges().is_empty() or password.is_empty():
		_error = "Enter an email and password."
		return ERR_INVALID_PARAMETER

	var answer := await _post("/auth/v1/token?grant_type=password", {
		"email": email.strip_edges(),
		"password": password,
	})
	return _adopt_answer(answer)


## Signs in through the player's browser: opens the provider, catches the redirect on a
## loopback socket, and exchanges the code for a token.
func sign_in_with_provider(provider: String) -> Error:
	if not PROVIDERS.has(provider):
		_error = "Unknown sign-in provider."
		return ERR_INVALID_PARAMETER

	var loopback := OAuthLoopback.new()
	add_child(loopback)
	var port := loopback.listen()
	if port == 0:
		loopback.queue_free()
		_error = "No local port was available for sign-in."
		return ERR_CANT_CREATE

	var verifier := OAuthLoopback.new_verifier()
	OS.shell_open(authorize_url(provider, port, verifier))

	var answer: Dictionary = await loopback.wait_for_code()
	loopback.queue_free()
	if answer.has("error"):
		_error = answer["error"]
		return ERR_UNAUTHORIZED

	return _adopt_answer(await _post("/auth/v1/token?grant_type=pkce", {
		"auth_code": answer["code"],
		"code_verifier": verifier,
	}))


## The URL the browser is sent to.
static func authorize_url(provider: String, port: int, verifier: String) -> String:
	var redirect := "http://127.0.0.1:%d/callback" % port
	return "%s/auth/v1/authorize?provider=%s&redirect_to=%s&code_challenge=%s&code_challenge_method=s256" % [
		SUPABASE_URL,
		provider.uri_encode(),
		redirect.uri_encode(),
		OAuthLoopback.challenge_for(verifier).uri_encode(),
	]


## Renews the access token from the refresh token obtained at sign-in.
func refresh_if_stale() -> Error:
	if _mode != Mode.ACCOUNT or _refresh_token.is_empty():
		return OK
	if _expires_at == 0 or Time.get_unix_time_from_system() < _expires_at - REFRESH_MARGIN_SECONDS:
		return OK
	return await _refresh()


## Trades the refresh token for a new access token, whatever the clock says. Split from
## the staleness check because a session picked up from disk has no expiry to compare
## against — it has only the refresh token, and has to spend it to learn anything.
func _refresh() -> Error:
	var answer := await _post("/auth/v1/token?grant_type=refresh_token", {
		"refresh_token": _refresh_token,
	})
	if answer.get("code", 0) != 200:
		sign_out()
		_error = "Session expired — sign in again."
		return ERR_UNAUTHORIZED
	return _adopt_answer(answer)


func sign_out() -> void:
	_mode = Mode.SIGNED_OUT
	_token = ""
	_refresh_token = ""
	_expires_at = 0
	_username = ""
	_error = ""
	_forget()
	changed.emit()


## Keeps the account across runs so signing in is something a player does once rather
## than every launch.
##
## This writes the refresh token to disk in the clear. Godot's `user://` is a plain
## directory with no OS keychain behind it, so anyone with read access to the machine's
## profile can take the file and mint access tokens until it is revoked. That is the same
## exposure every "stay signed in" checkbox carries and it is why only the refresh token
## and the account's own display fields are kept — never a password.
func _save() -> void:
	if _mode != Mode.ACCOUNT or _refresh_token.is_empty():
		return
	var store := ConfigFile.new()
	store.set_value("session", "refresh_token", _refresh_token)
	store.set_value("session", "username", _username)
	if store.save(STORE_PATH) != OK:
		push_warning("[auth] could not write %s; the session will not survive a restart" % STORE_PATH)


func _forget() -> void:
	if FileAccess.file_exists(STORE_PATH):
		DirAccess.remove_absolute(ProjectSettings.globalize_path(STORE_PATH))


## Picks the session back up. Only the refresh token is stored, so the access token is
## always minted fresh at launch and a revoked session simply fails to come back rather
## than appearing to work until its first call.
func _restore() -> void:
	var store := ConfigFile.new()
	if store.load(STORE_PATH) != OK:
		return
	var refresh: String = str(store.get_value("session", "refresh_token", ""))
	if refresh.is_empty():
		return
	_mode = Mode.ACCOUNT
	_refresh_token = refresh
	_username = str(store.get_value("session", "username", ""))
	_expires_at = 0
	if await _refresh() != OK:
		_forget()
	changed.emit()


## Supabase access token, or "" for a guest.
func access_token() -> String:
	return _token


## Username from the token's claims — for this screen only.
func requested_name() -> String:
	return _username


## Adopts a signed-in account directly.
func adopt_account(token: String, username: String, refresh_token := "", expires_at := 0) -> void:
	if token.is_empty():
		push_error("AuthSession.adopt_account: refusing an empty token")
		return
	_mode = Mode.ACCOUNT
	_token = token
	_refresh_token = refresh_token
	_expires_at = expires_at
	_username = username if not username.is_empty() else username_in(token)
	_error = ""
	_save()
	changed.emit()


## Reads a token's claims without verifying it — the signature is the server's business,
## and nothing drawn on this machine's own screen is a security boundary.
static func claims_in(token: String) -> Dictionary:
	var parts := token.split(".")
	if parts.size() < 2:
		return {}
	var payload := parts[1]
	payload = payload.replace("-", "+").replace("_", "/")
	while payload.length() % 4 != 0:
		payload += "="
	var raw := Marshalls.base64_to_utf8(payload)
	var claims: Variant = JSON.parse_string(raw)
	return claims if typeof(claims) == TYPE_DICTIONARY else {}


static func username_in(token: String) -> String:
	var claims := claims_in(token)
	var name: String = claims.get("kbve_username", "")
	if name.is_empty():
		var meta: Variant = claims.get("user_metadata", {})
		if typeof(meta) == TYPE_DICTIONARY:
			name = meta.get("username", "")
	return name


## The account's own id, which is the `sub` claim every Supabase token carries.
func user_id() -> String:
	return claims_in(_token).get("sub", "")


## Where the provider keeps the player's picture. OAuth writes it into the token's own
## metadata, so there is no call to make for it.
func avatar_url() -> String:
	var meta: Variant = claims_in(_token).get("user_metadata", {})
	if typeof(meta) != TYPE_DICTIONARY:
		return ""
	for key in ["avatar_url", "picture"]:
		var url: String = str(meta.get(key, ""))
		if url.begins_with("https://"):
			return url
	return ""


func _adopt_answer(answer: Dictionary) -> Error:
	var code: int = answer.get("code", 0)
	var body: Dictionary = answer.get("body", {})

	if code == 0:
		_error = answer.get("error", "Could not reach the sign-in server.")
		return ERR_CANT_CONNECT
	if code != 200:
		_error = _message_in(body, code)
		return ERR_UNAUTHORIZED

	var token: String = body.get("access_token", "")
	if token.is_empty():
		_error = "Sign-in server returned no token."
		return ERR_INVALID_DATA

	var expires_at: int = int(body.get("expires_at", 0))
	if expires_at == 0:
		expires_at = int(Time.get_unix_time_from_system()) + int(body.get("expires_in", 3600))
	adopt_account(token, username_in(token), body.get("refresh_token", ""), expires_at)
	return OK


## GoTrue spells its failures several ways depending on the endpoint and the version; a
## player only needs the sentence.
static func _message_in(body: Dictionary, code: int) -> String:
	if String(body.get("error_code", "")).begins_with("flow_state"):
		return "Sign-in expired before it finished — try again."
	for key in ["error_description", "msg", "message", "error"]:
		var value = body.get(key, "")
		if typeof(value) == TYPE_STRING and not value.is_empty():
			if value.contains("captcha"):
				return "Sign-in from the game is not available yet — play as a guest."
			return value
	return "Sign-in failed (%d)." % code


func _post(path: String, payload: Dictionary) -> Dictionary:
	var request := HTTPRequest.new()
	request.timeout = TIMEOUT_SECONDS
	add_child(request)

	var headers := PackedStringArray([
		"apikey: " + ANON_KEY,
		"Authorization: Bearer " + ANON_KEY,
		"Content-Type: application/json",
	])
	var err := request.request(
		SUPABASE_URL + path, headers, HTTPClient.METHOD_POST, JSON.stringify(payload)
	)
	if err != OK:
		request.queue_free()
		return {"code": 0, "error": "Could not start the request (%d)." % err}

	var answer: Array = await request.request_completed
	request.queue_free()

	var result: int = answer[0]
	var code: int = answer[1]
	var raw := (answer[3] as PackedByteArray).get_string_from_utf8()
	if result != HTTPRequest.RESULT_SUCCESS:
		return {"code": 0, "error": "Could not reach the sign-in server."}

	var parsed = JSON.parse_string(raw)
	return {
		"code": code,
		"body": parsed if typeof(parsed) == TYPE_DICTIONARY else {},
	}
