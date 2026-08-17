class_name ServerProbe
extends Node


signal answered(protocol: int)
signal unreachable(reason: String)
signal unreadable(reason: String)

const TIMEOUT := 6.0

const NO_ANSWER := -1
const UNREADABLE := -2

var _request: HTTPRequest


func _ready() -> void:
	_request = HTTPRequest.new()
	_request.timeout = TIMEOUT
	add_child(_request)
	_request.request_completed.connect(_on_completed)


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
