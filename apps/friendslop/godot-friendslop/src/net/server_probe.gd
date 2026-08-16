class_name ServerProbe
extends Node

## Asks a host what it speaks, over plain HTTP, before anyone tries to join it.
##
## The join gate turns a mismatched client away with a bare `protocol n != m` after the
## player has already pressed play and waited for a socket. `/healthz` is the only path a
## deployed host exposes besides the socket itself, so it is the only place that answer
## can be had in advance.

## The protocol the host answered, or 0 while nothing has.
signal answered(protocol: int)
## Nothing was reachable, with wording to show.
signal unreachable(reason: String)

const TIMEOUT := 6.0

var _request: HTTPRequest


func _ready() -> void:
	_request = HTTPRequest.new()
	_request.timeout = TIMEOUT
	add_child(_request)
	_request.request_completed.connect(_on_completed)


## The health endpoint beside a `ws://`/`wss://` socket URL. Same host and scheme family,
## since a host reached over TLS serves its health over TLS too.
static func health_url(socket_url: String) -> String:
	var url := socket_url.strip_edges()
	if url.begins_with("wss://"):
		url = "https://" + url.substr(6)
	elif url.begins_with("ws://"):
		url = "http://" + url.substr(5)
	var cut := url.rfind("/")
	if cut > url.find("://") + 2:
		url = url.substr(0, cut)
	return url.rstrip("/") + "/healthz"


func probe(socket_url: String) -> void:
	if _request == null:
		return
	var err := _request.request(health_url(socket_url))
	if err != OK:
		unreachable.emit("probe failed (%d)" % err)


## A host that answers something this cannot read is reported unreachable rather than
## guessed at: a wrong protocol shown confidently is worse than none, because it is the
## number the player would be told to trust.
func _on_completed(result: int, code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
	if result != HTTPRequest.RESULT_SUCCESS:
		unreachable.emit("no answer (%d)" % result)
		return
	if code != 200:
		unreachable.emit("http %d" % code)
		return
	var parsed: Variant = JSON.parse_string(body.get_string_from_utf8())
	if typeof(parsed) != TYPE_DICTIONARY or not parsed.has("protocol"):
		unreachable.emit("unreadable health")
		return
	answered.emit(int(parsed["protocol"]))
