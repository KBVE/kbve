class_name OAuthLoopback
extends Node

## One-shot loopback listener for a browser OAuth redirect.
##
## The game has no browser and Supabase's password grant is behind hCaptcha, so
## the only sign-in a client like this can complete is the one a real browser
## does on the player's behalf: open the provider in their default browser, and
## catch the redirect on a socket bound to localhost.
##
## PKCE is what makes that safe to do without a client secret. We send the hash
## of a secret we generated (`code_challenge`); the code that comes back is
## worthless to anyone who cannot also present the original (`code_verifier`),
## which never leaves this process.
##
## Binds `127.0.0.1` explicitly, not `0.0.0.0` — the redirect is from a browser
## on this machine, and a listener on every interface is an invitation from the
## rest of the network.

## Long enough to find the tab, log in, and approve; short enough that a
## forgotten window does not leave a socket open for the session.
const TIMEOUT_SECONDS := 180.0

## RFC 7636 puts the verifier between 43 and 128 characters. 32 random bytes is
## 43 base64url characters — the shortest length that is still 256 bits.
const VERIFIER_BYTES := 32

signal finished(answer: Dictionary)

var _server: TCPServer
var _peer: StreamPeerTCP
var _elapsed := 0.0
var _done := false


func _ready() -> void:
	# Nothing to poll until someone is waiting for a code.
	set_process(false)


## A fresh code verifier: base64url, unpadded, cryptographically random.
static func new_verifier() -> String:
	return _b64url(Crypto.new().generate_random_bytes(VERIFIER_BYTES))


## The challenge derived from a verifier — SHA-256, base64url. What is sent to
## the provider; the verifier itself is only ever sent back to GoTrue.
static func challenge_for(verifier: String) -> String:
	var ctx := HashingContext.new()
	ctx.start(HashingContext.HASH_SHA256)
	ctx.update(verifier.to_utf8_buffer())
	return _b64url(ctx.finish())


static func _b64url(bytes: PackedByteArray) -> String:
	return (
		Marshalls.raw_to_base64(bytes)
		.replace("+", "-")
		.replace("/", "_")
		.rstrip("=")
	)


## Binds an ephemeral port on localhost and returns it, or 0 if nothing was
## free. The port is part of the redirect URL, so it has to be known before the
## browser is opened.
func listen() -> int:
	_server = TCPServer.new()
	if _server.listen(0, "127.0.0.1") != OK:
		_server = null
		return 0
	return _server.get_local_port()


## Resolves once the browser comes back: `{"code": "..."}`, or `{"error": "..."}`
## for a refusal, a timeout, or a request that carried neither.
func wait_for_code() -> Dictionary:
	if _server == null:
		return {"error": "No local port was available for sign-in."}
	set_process(true)
	return await finished


func _process(delta: float) -> void:
	# Cancelled from outside — `close()` is callable at any time, including
	# between this frame's poll and the next.
	if _done or _server == null:
		return
	_elapsed += delta
	if _elapsed > TIMEOUT_SECONDS:
		_finish({"error": "Sign-in timed out."})
		return

	if _peer == null:
		if not _server.is_connection_available():
			return
		_peer = _server.take_connection()
		return

	_peer.poll()
	if _peer.get_status() != StreamPeerTCP.STATUS_CONNECTED:
		_finish({"error": "The browser closed before signing in."})
		return
	var available := _peer.get_available_bytes()
	if available <= 0:
		return

	# Only the request line matters, and it arrives in the first packet — the
	# code is in the URL, so nothing here needs to read a body.
	var request := _peer.get_utf8_string(available)
	var answer := parse_request(request)
	_reply(answer)
	_finish(answer)


## Pulls the result out of an HTTP request line. Static and total: this parses
## whatever a browser (or anything else on localhost) sends at the port.
static func parse_request(request: String) -> Dictionary:
	var line := request.split("\r\n")[0]
	var parts := line.split(" ")
	if parts.size() < 2:
		return {"error": "Sign-in sent something unreadable."}
	var query := parts[1].split("?", true, 1)
	if query.size() < 2:
		return {"error": "Sign-in came back without a code."}

	var fields := {}
	for pair in query[1].split("&"):
		var kv := pair.split("=", true, 1)
		if kv.size() == 2:
			fields[kv[0]] = kv[1].uri_decode()

	if fields.has("code"):
		return {"code": fields["code"]}
	# The provider's own words when a player presses Cancel on its consent page.
	if fields.has("error_description"):
		return {"error": String(fields["error_description"]).replace("+", " ")}
	if fields.has("error"):
		return {"error": String(fields["error"]).replace("+", " ")}
	return {"error": "Sign-in came back without a code."}


## The page the player is left looking at. Plain and self-contained: this is
## served from a socket that is about to close, so it can load nothing.
func _reply(answer: Dictionary) -> void:
	var message := (
		"You are signed in. Close this tab and return to the game."
		if answer.has("code")
		else "Sign-in did not complete. Close this tab and try again."
	)
	var body := (
		"<!doctype html><meta charset=utf-8><title>Friendslop</title>"
		+ "<body style=\"font:16px system-ui;padding:3rem;text-align:center\">"
		+ "<p>%s</p>" % message
	)
	var head := (
		"HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\n"
		+ "Content-Length: %d\r\nConnection: close\r\n\r\n" % body.to_utf8_buffer().size()
	)
	_peer.put_data((head + body).to_utf8_buffer())


func _finish(answer: Dictionary) -> void:
	_done = true
	set_process(false)
	close()
	finished.emit(answer)


## Idempotent: called on the way out of every path, including cancellation.
func close() -> void:
	if _peer:
		_peer.disconnect_from_host()
		_peer = null
	if _server:
		_server.stop()
		_server = null


func _exit_tree() -> void:
	close()
