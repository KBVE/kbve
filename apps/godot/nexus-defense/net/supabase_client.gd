extends Node

# Supabase GoTrue client (KBVE: supabase.kbve.com).
#
# Anon key + URL are public — same values the Astro auth bridge embeds.
# Credentials come from OS env; refresh tokens persist to user_data_dir so
# reconnects can skip the password round-trip (and the captcha gate).

const SUPABASE_URL := "https://supabase.kbve.com"
const SUPABASE_ANON_KEY := "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzU1NDAzMjAwLCJleHAiOjE5MTMxNjk2MDB9.oietJI22ZytbghFywvdYMSJp7rcsBdBYbcciJxeGWrg"
const SESSION_FILENAME := "session.json"
const ACCESS_EXP_SKEW_SEC := 30

signal session_ready(access_token: String, kbve_username: String)
signal session_failed(reason: String)

var _http: HTTPRequest = null
var _pending_kind: String = ""
var _pending_username: String = ""

func _ready() -> void:
	_http = HTTPRequest.new()
	_http.timeout = 15.0
	add_child(_http)
	_http.request_completed.connect(_on_request_completed)

# -----------------------------------------------------------------------------
# Public API
# -----------------------------------------------------------------------------

## Try cached -> refresh -> sign_in. Always emits one of session_ready /
## session_failed so callers can chain a single connect().
func resume_or_sign_in(email: String, password: String, username_hint: String = "", captcha_token: String = "") -> void:
	var cached: Dictionary = _load_session()
	if not cached.is_empty():
		var now: int = int(Time.get_unix_time_from_system())
		var exp: int = int(cached.get("expires_at", 0))
		if exp - ACCESS_EXP_SKEW_SEC > now:
			print("[supabase] reusing cached access_token (exp in %d s)" % (exp - now))
			var token: String = String(cached.get("access_token", ""))
			var uname: String = String(cached.get("kbve_username", username_hint))
			session_ready.emit(token, uname)
			return
		var refresh: String = String(cached.get("refresh_token", ""))
		if not refresh.is_empty():
			print("[supabase] cached token expired; refreshing")
			refresh_session(refresh, username_hint)
			return
	if not email.is_empty() and not password.is_empty():
		sign_in_with_password(email, password, username_hint, captcha_token)
	else:
		session_failed.emit("no cached session and no credentials provided")

func sign_in_with_password(email: String, password: String, username_hint: String = "", captcha_token: String = "") -> void:
	if email.is_empty() or password.is_empty():
		session_failed.emit("missing credentials")
		return
	if _pending_kind != "":
		session_failed.emit("auth call already in flight")
		return
	_pending_kind = "sign_in"
	_pending_username = username_hint
	var url := "%s/auth/v1/token?grant_type=password" % SUPABASE_URL
	# KBVE GoTrue enforces hcaptcha — pass a token via `captcha_token` once
	# the in-game captcha flow lands. Bot/headless callers will get
	# HTTP 500 "captcha verification process failed" without one.
	var payload: Dictionary = {"email": email, "password": password}
	if not captcha_token.is_empty():
		payload["gotrue_meta_security"] = {"captcha_token": captcha_token}
	_post_token(url, payload)

func refresh_session(refresh_token: String, username_hint: String = "") -> void:
	if refresh_token.is_empty():
		session_failed.emit("missing refresh_token")
		return
	if _pending_kind != "":
		session_failed.emit("auth call already in flight")
		return
	_pending_kind = "refresh"
	_pending_username = username_hint
	var url := "%s/auth/v1/token?grant_type=refresh_token" % SUPABASE_URL
	_post_token(url, {"refresh_token": refresh_token})

func clear_session() -> void:
	var path: String = _session_path()
	if FileAccess.file_exists(path):
		DirAccess.remove_absolute(path)

# -----------------------------------------------------------------------------
# Internals
# -----------------------------------------------------------------------------

func _post_token(url: String, payload: Dictionary) -> void:
	var headers := PackedStringArray([
		"apikey: %s" % SUPABASE_ANON_KEY,
		"Authorization: Bearer %s" % SUPABASE_ANON_KEY,
		"Content-Type: application/json",
	])
	var body := JSON.stringify(payload)
	print("[supabase] POST %s (%s)" % [url, _pending_kind])
	var err: int = _http.request(url, headers, HTTPClient.METHOD_POST, body)
	if err != OK:
		var k := _pending_kind
		_pending_kind = ""
		session_failed.emit("HTTPRequest.request error code %d (%s)" % [err, k])

func _on_request_completed(result: int, response_code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
	var kind: String = _pending_kind
	_pending_kind = ""
	print("[supabase] response kind=%s result=%d http=%d bytes=%d" % [kind, result, response_code, body.size()])
	if result != HTTPRequest.RESULT_SUCCESS:
		session_failed.emit("transport result=%d" % result)
		return
	var text: String = body.get_string_from_utf8()
	var parsed: Variant = JSON.parse_string(text)
	if typeof(parsed) != TYPE_DICTIONARY:
		session_failed.emit("non-JSON response (HTTP %d)" % response_code)
		return
	var dict: Dictionary = parsed
	if response_code != 200:
		var msg: String = String(dict.get("error_description", dict.get("msg", "HTTP %d" % response_code)))
		# Refresh failure usually means token revoked — clear cache so the
		# next boot falls through to password sign-in.
		if kind == "refresh":
			clear_session()
		session_failed.emit(msg)
		return
	var access_token: String = String(dict.get("access_token", ""))
	if access_token.is_empty():
		session_failed.emit("response missing access_token")
		return
	var refresh_token: String = String(dict.get("refresh_token", ""))
	var expires_in: int = int(dict.get("expires_in", 3600))
	# Prefer the kbve_username injected by the GoTrue Custom Access Token hook;
	# fall back to the hint (or 'guest', so the server doesn't see empty).
	var username: String = _decode_kbve_username(access_token)
	if username.is_empty():
		username = _pending_username
	_save_session(access_token, refresh_token, username, expires_in)
	session_ready.emit(access_token, username)

func _decode_kbve_username(jwt: String) -> String:
	var parts: PackedStringArray = jwt.split(".")
	if parts.size() < 2:
		return ""
	var payload_b64: String = parts[1]
	# JWT uses base64url without padding — convert + pad.
	payload_b64 = payload_b64.replace("-", "+").replace("_", "/")
	var pad: int = (4 - payload_b64.length() % 4) % 4
	for _i in range(pad):
		payload_b64 += "="
	var raw: PackedByteArray = Marshalls.base64_to_raw(payload_b64)
	var json: Variant = JSON.parse_string(raw.get_string_from_utf8())
	if typeof(json) != TYPE_DICTIONARY:
		return ""
	return String(json.get("kbve_username", ""))

func _session_path() -> String:
	return OS.get_user_data_dir() + "/" + SESSION_FILENAME

func _save_session(access_token: String, refresh_token: String, username: String, expires_in: int) -> void:
	var now: int = int(Time.get_unix_time_from_system())
	var payload: Dictionary = {
		"access_token": access_token,
		"refresh_token": refresh_token,
		"kbve_username": username,
		"expires_at": now + expires_in,
		"saved_at": now,
	}
	var path: String = _session_path()
	var f: FileAccess = FileAccess.open(path, FileAccess.WRITE)
	if f == null:
		push_warning("[supabase] cannot write session to %s" % path)
		return
	f.store_string(JSON.stringify(payload))
	f.close()
	print("[supabase] session persisted to %s" % path)

func _load_session() -> Dictionary:
	var path: String = _session_path()
	if not FileAccess.file_exists(path):
		return {}
	var f: FileAccess = FileAccess.open(path, FileAccess.READ)
	if f == null:
		return {}
	var text: String = f.get_as_text()
	f.close()
	var parsed: Variant = JSON.parse_string(text)
	if typeof(parsed) != TYPE_DICTIONARY:
		return {}
	return parsed
