extends Node

## Who the player currently is, for as long as the process lives.
##
## Guest is a first-class mode, not a fallback: the server names guests itself
## (`Anon-XXXX`), so signing in as one needs no credentials, no network round
## trip, and no stored token. Everything an account would add — a token, a
## claimed username — is exposed here as an empty value in guest mode, so a
## caller never has to ask which mode it is in before wiring a join.
##
## Accounts are Supabase GoTrue, the same issuer the rest of the ecosystem uses:
## `sign_in` exchanges an email and password for an access token carrying a
## `kbve_username` claim, stamped by the Custom Access Token hook. The token is
## what the game server verifies — the username read out of it here is for
## drawing on this screen before the join, and the server's answer wins.
##
## Nothing is written to disk. A refresh token on a shared machine is a login,
## and the cost of typing a password again is smaller than the cost of leaving
## one lying in `user://`.

signal changed

enum Mode {
	## No one has chosen yet — the state the title screen opens in.
	SIGNED_OUT,
	GUEST,
	ACCOUNT,
}

const SUPABASE_URL := "https://supabase.kbve.com"

## Public by design — it identifies the project, it does not authorize anything.
## The same key ships in the website bundle.
const ANON_KEY := "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzU1NDAzMjAwLCJleHAiOjE5MTMxNjk2MDB9.oietJI22ZytbghFywvdYMSJp7rcsBdBYbcciJxeGWrg"

const TIMEOUT_SECONDS := 15.0

## Refresh this far before the token actually expires, so a join that takes a
## moment to travel does not arrive holding something that just went stale.
const REFRESH_MARGIN_SECONDS := 60

var _mode: Mode = Mode.SIGNED_OUT
var _token := ""
var _refresh_token := ""
var _expires_at := 0
var _username := ""
var _error := ""


func mode() -> Mode:
	return _mode


func is_signed_in() -> bool:
	return _mode != Mode.SIGNED_OUT


func is_guest() -> bool:
	return _mode == Mode.GUEST


## Why the last sign-in failed, in words a player can act on. Empty after a
## successful one.
func last_error() -> String:
	return _error


## Immediate and infallible. The name arrives from the server on join, so there
## is nothing to wait for here.
func sign_in_as_guest() -> void:
	_mode = Mode.GUEST
	_token = ""
	_refresh_token = ""
	_expires_at = 0
	_username = ""
	_error = ""
	changed.emit()


## Exchanges credentials for a token. Await it — this is a network round trip.
##
## Returns `OK`, or an error with [`last_error`](last_error) set to something
## worth showing. The password is never stored, here or anywhere else.
func sign_in(email: String, password: String) -> Error:
	if email.strip_edges().is_empty() or password.is_empty():
		_error = "Enter an email and password."
		return ERR_INVALID_PARAMETER

	var answer := await _post("/auth/v1/token?grant_type=password", {
		"email": email.strip_edges(),
		"password": password,
	})
	return _adopt_answer(answer)


## Renews the access token from the refresh token obtained at sign-in. No-op for
## guests and for a token with life left in it.
func refresh_if_stale() -> Error:
	if _mode != Mode.ACCOUNT or _refresh_token.is_empty():
		return OK
	if _expires_at == 0 or Time.get_unix_time_from_system() < _expires_at - REFRESH_MARGIN_SECONDS:
		return OK

	var answer := await _post("/auth/v1/token?grant_type=refresh_token", {
		"refresh_token": _refresh_token,
	})
	if answer.get("code", 0) != 200:
		# The refresh token is spent or revoked; this is a sign-out, not a retry.
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
	changed.emit()


## Supabase access token, or "" for a guest. This is what the game server
## verifies before it will hand out a name.
func access_token() -> String:
	return _token


## Username from the token's claims — for this screen only. The server reads the
## same claim out of the same token and its answer is the one that counts.
func requested_name() -> String:
	return _username


## Adopts a signed-in account directly. The seam an OAuth flow lands on: whatever
## obtains the token hands it here, and the rest of the game reads it the same
## way it reads a password sign-in.
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
	changed.emit()


## Reads the `kbve_username` claim out of a token without verifying it — the
## signature is the server's business, and a name drawn on this machine's own
## screen is not a security boundary. Empty when the claim is missing.
static func username_in(token: String) -> String:
	var parts := token.split(".")
	if parts.size() < 2:
		return ""
	var payload := parts[1]
	# JWTs are base64url with the padding stripped; Godot's decoder wants
	# neither of those things.
	payload = payload.replace("-", "+").replace("_", "/")
	while payload.length() % 4 != 0:
		payload += "="
	var raw := Marshalls.base64_to_utf8(payload)
	var claims = JSON.parse_string(raw)
	if typeof(claims) != TYPE_DICTIONARY:
		return ""
	var name: String = claims.get("kbve_username", "")
	if name.is_empty():
		var meta = claims.get("user_metadata", {})
		if typeof(meta) == TYPE_DICTIONARY:
			name = meta.get("username", "")
	return name


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


## GoTrue spells its failures several ways depending on the endpoint and the
## version; a player only needs the sentence.
##
## The captcha case gets its own: hCaptcha is enabled on the password grant, and
## a game client has no browser to solve one in, so "request disallowed" is not
## something the player can fix by retyping anything.
static func _message_in(body: Dictionary, code: int) -> String:
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
