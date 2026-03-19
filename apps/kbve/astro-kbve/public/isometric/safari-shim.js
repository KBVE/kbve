/* global GPURenderPassEncoder, GPUComputePassEncoder */
/**
 * safari-shim.js — Safari WebGPU compatibility fixes for wgpu 27.x + winit 0.30.x
 *
 * Must be loaded as a plain <script> (not type="module") BEFORE the WASM module.
 *
 * Bug 1 — setBindGroup cross-realm Uint32Array rejection (wgpu 27.x + Safari)
 * -----------------------------------------------------------------------
 * wgpu creates Uint32Array views from the WASM heap and passes them to
 * GPURenderPassEncoder/GPUComputePassEncoder.setBindGroup() as dynamicOffsetsData.
 * Safari's native setBindGroup does an instanceof Uint32Array check which fails
 * for cross-realm typed arrays (created inside the WASM module context).
 * This affects both SharedArrayBuffer-backed (release --shared-memory) and regular
 * ArrayBuffer-backed (debug) builds.
 * Fix: intercept setBindGroup and always copy any typed-array-like third argument
 * into a fresh local-realm Uint32Array before forwarding to the native method.
 *
 * Bug 2 — winit RefCell re-entrant borrow (winit 0.30.x + Safari)
 * -----------------------------------------------------------------------
 * Safari fires resize/orientationchange events synchronously inside
 * requestAnimationFrame callbacks, causing winit's web event-loop runner to
 * re-borrow an already-borrowed RefCell and panic.
 * Fix: on Safari only, defer resize/orientationchange listeners via setTimeout(0)
 * so they always arrive between frames, never re-entrantly.
 *
 * Bug 3 — SharedArrayBuffer Uint8Array view RangeError (Safari + WASM shared memory)
 * -----------------------------------------------------------------------
 * When WASM uses --shared-memory, linear memory is backed by a SharedArrayBuffer.
 * Safari can throw "RangeError: Length out of range of buffer" when constructing
 * `new Uint8Array(sharedArrayBuffer, offset, length)` during concurrent memory
 * growth (memory.grow() changes byteLength while another thread reads it).
 * This hits wasm-bindgen glue functions like __wbg_new_with_byte_offset_and_length
 * during WebSocket receive in lightyear netcode.
 * Fix: Proxy the Uint8Array constructor (Safari only) to catch the RangeError and
 * copy the requested slice into a plain ArrayBuffer-backed Uint8Array on failure.
 */
(function () {
	function patchSetBindGroup(proto) {
		if (!proto || typeof proto.setBindGroup !== 'function') return;
		var orig = proto.setBindGroup;
		proto.setBindGroup = function () {
			var args = arguments;
			var offsets = args[2];
			if (
				offsets &&
				typeof offsets.length === 'number' &&
				offsets.buffer
			) {
				// Copy into a fresh local-realm Uint32Array backed by a plain
				// ArrayBuffer. Covers cross-realm typed arrays AND same-realm
				// Uint32Arrays backed by SharedArrayBuffer (WASM shared memory).
				var start = args[3] !== undefined ? args[3] : 0;
				var len = args[4] !== undefined ? args[4] : offsets.length;
				var copy = new Uint32Array(len);
				for (var i = 0; i < len; i++) copy[i] = offsets[start + i];
				return orig.call(this, args[0], args[1], copy, 0, len);
			}
			// 2-arg form: setBindGroup(index, bindGroup) — no offsets.
			// Pass exactly the args we received to avoid Safari interpreting
			// trailing undefined values as the 5-arg overload.
			if (args.length <= 2) {
				return orig.call(this, args[0], args[1]);
			}
			return orig.call(this, args[0], args[1], offsets, args[3], args[4]);
		};
	}

	patchSetBindGroup(
		typeof GPURenderPassEncoder !== 'undefined'
			? GPURenderPassEncoder.prototype
			: null,
	);
	patchSetBindGroup(
		typeof GPUComputePassEncoder !== 'undefined'
			? GPUComputePassEncoder.prototype
			: null,
	);

	if (/^((?!chrome|android).)*safari/i.test(navigator.userAgent)) {
		var origAEL = EventTarget.prototype.addEventListener;
		var DEFER = { resize: true, orientationchange: true };
		EventTarget.prototype.addEventListener = function (
			type,
			listener,
			options,
		) {
			if (DEFER[type] && typeof listener === 'function') {
				var deferred = function (evt) {
					setTimeout(function () {
						listener(evt);
					}, 0);
				};
				return origAEL.call(this, type, deferred, options);
			}
			return origAEL.call(this, type, listener, options);
		};
	}

	// Bug 3 fix — Safari + SharedArrayBuffer: `new Uint8Array(sab, offset, len)`
	// can throw RangeError during concurrent WASM memory growth because Safari
	// reads a stale byteLength. We Proxy the Uint8Array constructor (Safari only)
	// to catch the RangeError and copy from shared memory into a plain ArrayBuffer.
	// The Proxy preserves instanceof, static methods, and prototype identity.
	if (
		/^((?!chrome|android).)*safari/i.test(navigator.userAgent) &&
		typeof SharedArrayBuffer !== 'undefined'
	) {
		var OrigUint8Array = Uint8Array;

		globalThis.Uint8Array = new Proxy(OrigUint8Array, {
			construct: function (target, args) {
				try {
					// Omit newTarget to avoid Safari Proxy-as-new.target issues.
					return Reflect.construct(target, args);
				} catch (e) {
					// Safari can throw RangeError when creating a typed array
					// view into WASM shared memory during concurrent growth.
					// Don't check the buffer type — instanceof and duck-typing
					// both fail for cross-realm / WASM-internal buffers.
					// Any 3-arg RangeError on Safari is safe to recover via copy.
					if (
						e instanceof RangeError &&
						args.length >= 3 &&
						args[0]
					) {
						var buf = args[0];
						var off = args[1] >>> 0;
						var len = args[2] >>> 0;
						try {
							var fullView = new OrigUint8Array(buf);
							var copy = new OrigUint8Array(len);
							for (var i = 0; i < len; i++)
								copy[i] = fullView[off + i];
							console.warn(
								'[safari-shim] Uint8Array RangeError recovered: offset=' +
									off +
									' len=' +
									len +
									' bufLen=' +
									buf.byteLength,
							);
							return copy;
						} catch (_inner) {
							// Full-view also failed — rethrow the original.
							throw e;
						}
					}
					throw e;
				}
			},
			apply: function (target, thisArg, args) {
				return Reflect.apply(target, thisArg, args);
			},
		});
	}
})();
