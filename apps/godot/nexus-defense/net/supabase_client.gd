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

# Loopback OAuth flow, mirrored from
# apps/kbve/isometric/src-tauri/src/game/title_screen.rs — hits GoTrue's
# `/auth/v1/authorize` directly with `redirect_to` pointed at our local
# TCPServer. The supabase project must whitelist `http://127.0.0.1` /
# `http://localhost` in its Additional Redirect URLs for this to land.
const OAUTH_AUTHORIZE_URL := "%s/auth/v1/authorize" % SUPABASE_URL
const OAUTH_LISTENER_TIMEOUT_SEC := 180
const OAUTH_PEER_READ_TIMEOUT_MS := 5000

signal session_ready(access_token: String, kbve_username: String)
signal session_failed(reason: String)

var _http: HTTPRequest = null
var _pending_kind: String = ""
var _pending_username: String = ""

var _oauth_server: TCPServer = null
var _oauth_port: int = 0
var _oauth_pending_username: String = ""
var _oauth_deadline_ms: int = 0
var _oauth_peers: Array = []

func _ready() -> void:
	_http = HTTPRequest.new()
	_http.timeout = 15.0
	add_child(_http)
	_http.request_completed.connect(_on_request_completed)
	set_process(false)

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

## Start the localhost OAuth dance: bind a TCPServer on a free port, open the
## kbve.com bridge in the system browser pointed at our loopback callback, and
## emit session_ready / session_failed once the token round-trips back. Mirrors
## apps/kbve/isometric/src-tauri/src/auth.rs.
##
## `provider` is the slug the bridge forwards to GoTrue's
## `/auth/v1/authorize?provider=…` ("github", "discord", "twitch", ...).
func sign_in_with_oauth(provider: String, username_hint: String = "") -> void:
	if provider.strip_edges().is_empty():
		session_failed.emit("oauth provider missing")
		return
	if _oauth_server != null:
		session_failed.emit("oauth listener already running")
		return
	var server := TCPServer.new()
	var bind_err: int = server.listen(0, "127.0.0.1")
	if bind_err != OK:
		session_failed.emit("oauth listener bind failed (err=%d)" % bind_err)
		return
	_oauth_server = server
	_oauth_port = server.get_local_port()
	_oauth_pending_username = username_hint
	_oauth_deadline_ms = Time.get_ticks_msec() + OAUTH_LISTENER_TIMEOUT_SEC * 1000
	set_process(true)
	var redirect: String = _oauth_redirect_url()
	var url: String = "%s?provider=%s&redirect_to=%s" % [
		OAUTH_AUTHORIZE_URL,
		provider.uri_encode(),
		redirect.uri_encode(),
	]
	print("[supabase] oauth listener bound to %s — opening %s" % [redirect, url])
	OS.shell_open(url)

func _oauth_redirect_url() -> String:
	return "http://127.0.0.1:%d/auth/callback" % _oauth_port

func _process(_dt: float) -> void:
	if _oauth_server == null:
		set_process(false)
		return
	if Time.get_ticks_msec() > _oauth_deadline_ms:
		print("[supabase] oauth listener timed out after %ds" % OAUTH_LISTENER_TIMEOUT_SEC)
		_close_oauth_listener()
		session_failed.emit("oauth timeout")
		return
	while _oauth_server.is_connection_available():
		var peer: StreamPeerTCP = _oauth_server.take_connection()
		if peer != null:
			_oauth_peers.append({"peer": peer, "buf": PackedByteArray(), "deadline_ms": Time.get_ticks_msec() + OAUTH_PEER_READ_TIMEOUT_MS})
	var still_open: Array = []
	for entry in _oauth_peers:
		var peer: StreamPeerTCP = entry["peer"]
		peer.poll()
		var status: int = peer.get_status()
		if status == StreamPeerTCP.STATUS_ERROR or status == StreamPeerTCP.STATUS_NONE:
			peer.disconnect_from_host()
			continue
		var available: int = peer.get_available_bytes()
		if available > 0:
			var read_result: Array = peer.get_data(available)
			if read_result.size() == 2 and read_result[0] == OK:
				(entry["buf"] as PackedByteArray).append_array(read_result[1])
		var raw: PackedByteArray = entry["buf"]
		if _request_is_complete(raw):
			_serve_oauth_peer(peer, raw)
			peer.disconnect_from_host()
			continue
		if Time.get_ticks_msec() > int(entry["deadline_ms"]):
			peer.disconnect_from_host()
			continue
		still_open.append(entry)
	_oauth_peers = still_open

func _request_is_complete(buf: PackedByteArray) -> bool:
	if buf.size() < 4:
		return false
	# Detect end-of-headers (\r\n\r\n). Body-less GET is enough for our flow.
	for i in range(buf.size() - 3):
		if buf[i] == 13 and buf[i + 1] == 10 and buf[i + 2] == 13 and buf[i + 3] == 10:
			return true
	return false

func _serve_oauth_peer(peer: StreamPeerTCP, raw: PackedByteArray) -> void:
	var req: String = raw.get_string_from_utf8()
	var token: String = _extract_query_access_token(req)
	var body: String = _SUCCESS_HTML if not token.is_empty() else _FRAGMENT_BOUNCE_HTML
	var bytes: PackedByteArray = body.to_utf8_buffer()
	var response: String = "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: %d\r\nConnection: close\r\n\r\n" % bytes.size()
	peer.put_data(response.to_utf8_buffer())
	peer.put_data(bytes)
	if token.is_empty():
		return
	print("[supabase] oauth callback token received (len=%d)" % token.length())
	_close_oauth_listener()
	# The bridge only sends the access_token in the URL hash, so we don't get a
	# refresh_token via this flow. Persist what we have; the next sign-in will
	# fall through to a fresh OAuth round when the cached access expires.
	_save_session(token, "", _decode_username_with_fallback(token), 3600)
	var username: String = _decode_username_with_fallback(token)
	session_ready.emit(token, username)

func _decode_username_with_fallback(jwt: String) -> String:
	var decoded: String = _decode_kbve_username(jwt)
	if not decoded.is_empty():
		return decoded
	return _oauth_pending_username

func _extract_query_access_token(req: String) -> String:
	var first_line: String = req.get_slice("\r\n", 0)
	var parts: PackedStringArray = first_line.split(" ")
	if parts.size() < 2:
		return ""
	var target: String = parts[1]
	var q_idx: int = target.find("?")
	if q_idx < 0:
		return ""
	var query: String = target.substr(q_idx + 1)
	for pair in query.split("&"):
		var eq_idx: int = (pair as String).find("=")
		if eq_idx < 0:
			continue
		var key: String = (pair as String).substr(0, eq_idx)
		if key != "access_token":
			continue
		var value: String = (pair as String).substr(eq_idx + 1)
		return value.uri_decode()
	return ""

func _close_oauth_listener() -> void:
	if _oauth_server != null:
		_oauth_server.stop()
	_oauth_server = null
	_oauth_port = 0
	_oauth_pending_username = ""
	_oauth_deadline_ms = 0
	for entry in _oauth_peers:
		var peer: StreamPeerTCP = entry["peer"]
		peer.disconnect_from_host()
	_oauth_peers.clear()
	set_process(false)

const _SUCCESS_HTML := "<!doctype html><html><head><meta charset=\"utf-8\"><title>KBVE Nexus Defense — Signed in</title><style>body{font-family:-apple-system,Inter,sans-serif;background:#0a0a14;color:#e8eaed;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}.card{text-align:center;padding:32px 48px;border:1px solid #1f2230;border-radius:8px;background:#0f1018;max-width:420px}h1{margin:0 0 10px;font-size:20px;color:#7ec97e}p{margin:0 0 6px;color:#a9adb8;font-size:14px}small{color:#5a5f6b;font-size:11px;display:block;margin-top:18px}a{color:#7ab8ff;text-decoration:none}a:hover{text-decoration:underline}</style></head><body><div class=\"card\"><h1>Signed in</h1><p>Token delivered to Nexus Defense. Switch back to the game — the main menu should now show your KBVE username.</p><small>You can close this tab.</small></div></body></html>"

const _FRAGMENT_BOUNCE_HTML := "<!doctype html><html><head><meta charset=\"utf-8\"><title>KBVE Nexus Defense — Signing in...</title><style>body{font-family:-apple-system,Inter,sans-serif;background:#0a0a14;color:#e8eaed;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}.card{text-align:center;padding:32px 48px;border:1px solid #1f2230;border-radius:8px;background:#0f1018}h1{margin:0 0 8px;font-size:18px}p{margin:0;color:#8a8f9c;font-size:13px}</style></head><body><div class=\"card\"><h1>Signing in...</h1><p>One moment, finishing up.</p></div><script>(function(){var hash=window.location.hash.replace(/^#/,'');if(!hash){document.querySelector('.card h1').textContent='Sign in failed';document.querySelector('.card p').textContent='No access token in the callback.';return;}var params=new URLSearchParams(hash);var token=params.get('access_token');if(!token){document.querySelector('.card h1').textContent='Sign in failed';document.querySelector('.card p').textContent='No access token in the callback.';return;}window.location.replace(window.location.pathname+'?access_token='+encodeURIComponent(token));})();</script></body></html>"

func clear_session() -> void:
	var path: String = _session_path()
	if FileAccess.file_exists(path):
		DirAccess.remove_absolute(path)

func has_cached_session() -> bool:
	var cached: Dictionary = _load_session()
	if cached.is_empty():
		return false
	var refresh: String = String(cached.get("refresh_token", ""))
	if not refresh.is_empty():
		return true
	var now: int = int(Time.get_unix_time_from_system())
	var exp: int = int(cached.get("expires_at", 0))
	return exp - ACCESS_EXP_SKEW_SEC > now

func cached_username() -> String:
	var cached: Dictionary = _load_session()
	return String(cached.get("kbve_username", ""))

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
