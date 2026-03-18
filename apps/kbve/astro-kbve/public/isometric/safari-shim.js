/* global GPURenderPassEncoder, GPUComputePassEncoder */
/**
 * safari-shim.js — Safari WebGPU compatibility fixes for wgpu 27.x + winit 0.30.x
 *
 * Must be loaded as a plain <script> (not type="module") BEFORE the WASM module.
 *
 * Bug 1 — setBindGroup SharedArrayBuffer rejection (wgpu 27.x + Safari)
 * -----------------------------------------------------------------------
 * The WASM binary is compiled with +atomics / --shared-memory, so the WASM heap
 * is a SharedArrayBuffer. wgpu creates Uint32Array *views* into that shared heap
 * and passes them to GPURenderPassEncoder/GPUComputePassEncoder.setBindGroup() as
 * the dynamicOffsetsData argument. Safari's WebGPU enforces the spec and rejects
 * SharedArrayBuffer-backed TypedArrays here; Chrome is lenient.
 * Fix: intercept setBindGroup and copy any SharedArrayBuffer-backed view into a
 * fresh ArrayBuffer-backed Uint32Array before forwarding to the native method.
 *
 * Bug 2 — winit RefCell re-entrant borrow (winit 0.30.x + Safari)
 * -----------------------------------------------------------------------
 * Safari fires resize/orientationchange events synchronously inside
 * requestAnimationFrame callbacks, causing winit's web event-loop runner to
 * re-borrow an already-borrowed RefCell and panic.
 * Fix: on Safari only, defer resize/orientationchange listeners via setTimeout(0)
 * so they always arrive between frames, never re-entrantly.
 */
(function () {
	function patchSetBindGroup(proto) {
		if (!proto || typeof proto.setBindGroup !== 'function') return;
		var orig = proto.setBindGroup;
		proto.setBindGroup = function (index, bg, offsets, start, len) {
			if (
				offsets instanceof Uint32Array &&
				offsets.buffer instanceof SharedArrayBuffer
			) {
				var s = start !== undefined ? start : 0;
				var l = len !== undefined ? len : offsets.length;
				var copy = new Uint32Array(l);
				copy.set(offsets.subarray(s, s + l));
				return orig.call(this, index, bg, copy, 0, l);
			}
			return orig.call(this, index, bg, offsets, start, len);
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
})();
