extends Node

# Supabase GoTrue client (KBVE: supabase.kbve.com).
#
# Anon key + URL are public — same values the Astro auth bridge embeds. The
# only secret here is the user's email/password, pulled from OS env so we
# never commit credentials to the repo.

const SUPABASE_URL := "https://supabase.kbve.com"
const SUPABASE_ANON_KEY := "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzU1NDAzMjAwLCJleHAiOjE5MTMxNjk2MDB9.oietJI22ZytbghFywvdYMSJp7rcsBdBYbcciJxeGWrg"

signal sign_in_succeeded(access_token: String, kbve_username: String)
signal sign_in_failed(reason: String)

var _http: HTTPRequest = null
var _pending_username: String = ""

func _ready() -> void:
	_http = HTTPRequest.new()
	_http.timeout = 15.0
	add_child(_http)
	_http.request_completed.connect(_on_request_completed)

func sign_in_with_password(email: String, password: String, username_hint: String = "", captcha_token: String = "") -> void:
	if email.is_empty() or password.is_empty():
		sign_in_failed.emit("missing credentials")
		return
	_pending_username = username_hint
	var url := "%s/auth/v1/token?grant_type=password" % SUPABASE_URL
	var headers := PackedStringArray([
		"apikey: %s" % SUPABASE_ANON_KEY,
		"Authorization: Bearer %s" % SUPABASE_ANON_KEY,
		"Content-Type: application/json",
	])
	# KBVE GoTrue enforces hcaptcha — pass a token via `captcha_token` once
	# the in-game captcha flow lands. Bot/headless callers will get
	# HTTP 500 "captcha verification process failed" without one.
	var payload: Dictionary = {"email": email, "password": password}
	if not captcha_token.is_empty():
		payload["gotrue_meta_security"] = {"captcha_token": captcha_token}
	var body := JSON.stringify(payload)
	print("[supabase] POST %s" % url)
	var err: int = _http.request(url, headers, HTTPClient.METHOD_POST, body)
	if err != OK:
		sign_in_failed.emit("HTTPRequest.request error code %d" % err)

func _on_request_completed(result: int, response_code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
	print("[supabase] response result=%d http=%d bytes=%d" % [result, response_code, body.size()])
	if result != HTTPRequest.RESULT_SUCCESS:
		sign_in_failed.emit("transport result=%d" % result)
		return
	var text: String = body.get_string_from_utf8()
	var parsed: Variant = JSON.parse_string(text)
	if typeof(parsed) != TYPE_DICTIONARY:
		sign_in_failed.emit("non-JSON response (HTTP %d)" % response_code)
		return
	var dict: Dictionary = parsed
	if response_code != 200:
		var msg: String = String(dict.get("error_description", dict.get("msg", "HTTP %d" % response_code)))
		sign_in_failed.emit(msg)
		return
	var access_token: String = String(dict.get("access_token", ""))
	if access_token.is_empty():
		sign_in_failed.emit("response missing access_token")
		return
	# Prefer the kbve_username injected by the GoTrue Custom Access Token hook;
	# fall back to the hint (or empty, letting the server decide).
	var username: String = _decode_kbve_username(access_token)
	if username.is_empty():
		username = _pending_username
	sign_in_succeeded.emit(access_token, username)

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
