extends Node

## Who the player currently is, for as long as the process lives.
##
## Guest is a first-class mode, not a fallback: the server names guests itself
## (`Anon-XXXX`), so signing in as one needs no credentials, no network round
## trip, and no stored token. Everything an account would add — a token, a
## claimed username — is exposed here as an empty value in guest mode, so a
## caller never has to ask which mode it is in before wiring a join.
##
## Supabase slots in behind `sign_in`. The rest of the ecosystem already issues
## GoTrue tokens at supabase.kbve.com and stamps a `kbve_username` claim via the
## Custom Access Token hook, so what lands here is a token to hold and refresh —
## not a second identity system. Until that is wired, `sign_in` reports
## `ERR_UNAVAILABLE` rather than pretending.

signal changed

enum Mode {
	## No one has chosen yet — the state the title screen opens in.
	SIGNED_OUT,
	GUEST,
	ACCOUNT,
}

var _mode: Mode = Mode.SIGNED_OUT
var _token := ""
var _username := ""


func mode() -> Mode:
	return _mode


func is_signed_in() -> bool:
	return _mode != Mode.SIGNED_OUT


func is_guest() -> bool:
	return _mode == Mode.GUEST


## Immediate and infallible. The name arrives from the server on join, so there
## is nothing to wait for here.
func sign_in_as_guest() -> void:
	_mode = Mode.GUEST
	_token = ""
	_username = ""
	changed.emit()


## Not implemented yet — see the note at the top. Returns an error rather than
## failing silently so a caller cannot mistake "no account layer" for "wrong
## password".
func sign_in(_email: String, _password: String) -> Error:
	push_warning("AuthSession.sign_in: Supabase login is not wired yet")
	return ERR_UNAVAILABLE


func sign_out() -> void:
	_mode = Mode.SIGNED_OUT
	_token = ""
	_username = ""
	changed.emit()


## Supabase access token, or "" for a guest. What the server will verify once
## `SessionMsg::Join` carries one.
func access_token() -> String:
	return _token


## The name to *ask* the server for on join. Empty for guests — which is the
## whole of guest mode, since the server answers with an `Anon-XXXX` of its own
## and a client-chosen name would only be a suggestion anyway.
func requested_name() -> String:
	return _username


## Adopts a signed-in account. Separate from `sign_in` so the Supabase flow can
## land in a later change without this file's callers moving: whatever obtains
## the token hands it here, and the rest of the game reads it the same way.
func adopt_account(token: String, username: String) -> void:
	if token.is_empty():
		push_error("AuthSession.adopt_account: refusing an empty token")
		return
	_mode = Mode.ACCOUNT
	_token = token
	_username = username
	changed.emit()
