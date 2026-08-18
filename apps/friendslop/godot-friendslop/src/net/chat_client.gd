class_name ChatClient
extends Node

## Game chat over the KBVE gateway's `/gamechat` socket.
##
## Accounts only. The gateway validates the JWT on upgrade and derives the nick from it,
## so a guest has nothing to present and is never connected rather than being connected
## anonymously.

signal message(kind: String, sender: String, content: String)
signal state_changed(connected: bool)
signal failed(reason: String)

const HOST := "wss://chat.kbve.com/gamechat"
const GAME := "friendslop"
const CHANNEL := "#general"
const PLATFORM := "friendslop"

## Gateway ceiling is 64 KiB a frame; this is a chat line, not a payload.
const MAX_CONTENT := 400
const RECONNECT_SECONDS := 5.0
const MAX_BACKOFF := 60.0
## A handshake that never reaches STATE_OPEN is the gateway spelling a refusal in HTTP
## rather than a link that dropped, so retrying it forever just repeats the refusal at
## the engine's own log level. The gateway answers 400 to a game key it does not carry.
const MAX_HANDSHAKE_FAILURES := 3

var _socket: WebSocketPeer
var _connected := false
var _retry := 0.0
var _backoff := RECONNECT_SECONDS
var _want := false
var _opened := false
var _handshake_failures := 0


func _ready() -> void:
	set_process(false)
	Auth.changed.connect(_on_auth_changed)


func is_connected_to_chat() -> bool:
	return _connected


## Opens the socket if there is an account to open it with. Safe to call repeatedly.
func start() -> void:
	_want = true
	if not Auth.is_signed_in():
		failed.emit("chat.signin_required")
		return
	_open()


func stop() -> void:
	_want = false
	set_process(false)
	_close()


func send_chat(text: String) -> bool:
	var body := text.strip_edges()
	if body.is_empty() or not _connected:
		return false
	if body.length() > MAX_CONTENT:
		body = body.substr(0, MAX_CONTENT)
	var frame := {
		"kind": "chat",
		"sender": Auth.username_in(Auth.access_token()),
		"platform": PLATFORM,
		"channel": CHANNEL,
		"content": body,
	}
	return _socket.send_text(JSON.stringify(frame)) == OK


func _on_auth_changed() -> void:
	if not _want:
		return
	if Auth.is_signed_in():
		if not _connected:
			_open()
	else:
		_close()


func _open() -> void:
	_close()
	var token := Auth.access_token()
	if token.is_empty():
		failed.emit("chat.signin_required")
		return
	_socket = WebSocketPeer.new()
	_opened = false
	var url := "%s?game=%s&token=%s" % [HOST, GAME, token.uri_encode()]
	if _socket.connect_to_url(url) != OK:
		_socket = null
		failed.emit("chat.unreachable")
		_arm_retry()
		return
	set_process(true)


func _close() -> void:
	if _socket:
		_socket.close()
		_socket = null
	if _connected:
		_connected = false
		state_changed.emit(false)


func _arm_retry() -> void:
	_retry = _backoff
	_backoff = minf(_backoff * 2.0, MAX_BACKOFF)
	set_process(true)


func _process(delta: float) -> void:
	if _socket == null:
		if not _want:
			set_process(false)
			return
		_retry -= delta
		if _retry <= 0.0:
			_open()
		return

	_socket.poll()
	match _socket.get_ready_state():
		WebSocketPeer.STATE_OPEN:
			if not _connected:
				_connected = true
				_opened = true
				_handshake_failures = 0
				_backoff = RECONNECT_SECONDS
				state_changed.emit(true)
			while _socket.get_available_packet_count() > 0:
				_read(_socket.get_packet().get_string_from_utf8())
		WebSocketPeer.STATE_CLOSED:
			var code := _socket.get_close_code()
			_socket = null
			if _connected:
				_connected = false
				state_changed.emit(false)
			## 1008 is the gateway refusing the token rather than the link dropping, and
			## retrying a rejected token just repeats the rejection.
			if code == 1008 or not Auth.is_signed_in():
				failed.emit("chat.signin_required")
				_want = false
				set_process(false)
				return
			if not _opened:
				_handshake_failures += 1
				if _handshake_failures >= MAX_HANDSHAKE_FAILURES:
					failed.emit("chat.unavailable")
					_want = false
					set_process(false)
					return
			_arm_retry()


func _read(text: String) -> void:
	var parsed: Variant = JSON.parse_string(text)
	if typeof(parsed) != TYPE_DICTIONARY:
		return
	var frame: Dictionary = parsed
	var content := str(frame.get("content", ""))
	if content.is_empty():
		return
	message.emit(str(frame.get("kind", "chat")), str(frame.get("sender", "")), content)
