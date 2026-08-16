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
## Nothing answered at all, with wording to show.
signal unreachable(reason: String)
## Something answered, but not with a protocol this build can read.
signal unreadable(reason: String)

const TIMEOUT := 6.0

## Nothing answered.
const NO_ANSWER := -1
## Answered, but said nothing this build could read a protocol out of.
const UNREADABLE := -2

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


## The protocol in an answer, or `NO_ANSWER` / `UNREADABLE` saying which way it failed.
##
## A host that answers something this cannot read is never guessed at: a wrong protocol
## shown confidently is worse than none, because it is the number the player would be
## told to trust.
##
## The two failures are kept apart because they mean opposite things to whoever is about
## to press play. Nothing answering means there is no server to join. A 200 without a
## protocol in it means the server is up and almost certainly joinable — it is just older
## than the health payload this build expects, which is the ordinary state of things
## between a merge and the next deploy.
static func read_health(result: int, code: int, body: PackedByteArray) -> int:
	if result != HTTPRequest.RESULT_SUCCESS:
		return NO_ANSWER
	if code != 200:
		return NO_ANSWER
	var parsed: Variant = JSON.parse_string(body.get_string_from_utf8())
	if typeof(parsed) != TYPE_DICTIONARY or not parsed.has("protocol"):
		return UNREADABLE
	var protocol := int(parsed["protocol"])
	return protocol if protocol > 0 else UNREADABLE


func _on_completed(result: int, code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
	var protocol := read_health(result, code, body)
	if protocol > 0:
		answered.emit(protocol)
	elif protocol == UNREADABLE:
		unreadable.emit("no protocol in health")
	elif result != HTTPRequest.RESULT_SUCCESS:
		unreachable.emit("no answer (%d)" % result)
	else:
		unreachable.emit("http %d" % code)
