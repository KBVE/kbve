var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) =>
	key in obj
		? __defProp(obj, key, {
				enumerable: true,
				configurable: true,
				writable: true,
				value,
			})
		: (obj[key] = value);
var __publicField = (obj, key, value) =>
	__defNormalProp(obj, typeof key !== 'symbol' ? key + '' : key, value);
(function () {
	const c = document.createElement('link').relList;
	if (c && c.supports && c.supports('modulepreload')) return;
	for (const o of document.querySelectorAll('link[rel="modulepreload"]'))
		f(o);
	new MutationObserver((o) => {
		for (const g of o)
			if (g.type === 'childList')
				for (const w of g.addedNodes)
					w.tagName === 'LINK' && w.rel === 'modulepreload' && f(w);
	}).observe(document, { childList: true, subtree: true });
	function r(o) {
		const g = {};
		return (
			o.integrity && (g.integrity = o.integrity),
			o.referrerPolicy && (g.referrerPolicy = o.referrerPolicy),
			o.crossOrigin === 'use-credentials'
				? (g.credentials = 'include')
				: o.crossOrigin === 'anonymous'
					? (g.credentials = 'omit')
					: (g.credentials = 'same-origin'),
			g
		);
	}
	function f(o) {
		if (o.ep) return;
		o.ep = true;
		const g = r(o);
		fetch(o.href, g);
	}
})();
const scriptRel = 'modulepreload',
	assetsURL = function (a) {
		return '/isometric/' + a;
	},
	seen = {},
	__vitePreload = function (c, r, f) {
		let o = Promise.resolve();
		if (r && r.length > 0) {
			let w = function (p) {
				return Promise.all(
					p.map((N) =>
						Promise.resolve(N).then(
							(C) => ({ status: 'fulfilled', value: C }),
							(C) => ({ status: 'rejected', reason: C }),
						),
					),
				);
			};
			document.getElementsByTagName('link');
			const T = document.querySelector('meta[property=csp-nonce]'),
				S =
					(T == null ? void 0 : T.nonce) ||
					(T == null ? void 0 : T.getAttribute('nonce'));
			o = w(
				r.map((p) => {
					if (((p = assetsURL(p)), p in seen)) return;
					seen[p] = true;
					const N = p.endsWith('.css'),
						C = N ? '[rel="stylesheet"]' : '';
					if (document.querySelector(`link[href="${p}"]${C}`)) return;
					const I = document.createElement('link');
					if (
						((I.rel = N ? 'stylesheet' : scriptRel),
						N || (I.as = 'script'),
						(I.crossOrigin = ''),
						(I.href = p),
						S && I.setAttribute('nonce', S),
						document.head.appendChild(I),
						N)
					)
						return new Promise((ze, De) => {
							I.addEventListener('load', ze),
								I.addEventListener('error', () =>
									De(
										new Error(
											`Unable to preload CSS for ${p}`,
										),
									),
								);
						});
				}),
			);
		}
		function g(w) {
			const T = new Event('vite:preloadError', { cancelable: true });
			if (((T.payload = w), window.dispatchEvent(T), !T.defaultPrevented))
				throw w;
		}
		return o.then((w) => {
			for (const T of w || []) T.status === 'rejected' && g(T.reason);
			return c().catch(g);
		});
	};
function getDefaultExportFromCjs(a) {
	return a &&
		a.__esModule &&
		Object.prototype.hasOwnProperty.call(a, 'default')
		? a.default
		: a;
}
var jsxRuntime = { exports: {} },
	reactJsxRuntime_production = {};
/**
 * @license React
 * react-jsx-runtime.production.js
 *
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
var hasRequiredReactJsxRuntime_production;
function requireReactJsxRuntime_production() {
	if (hasRequiredReactJsxRuntime_production)
		return reactJsxRuntime_production;
	hasRequiredReactJsxRuntime_production = 1;
	var a = Symbol.for('react.transitional.element'),
		c = Symbol.for('react.fragment');
	function r(f, o, g) {
		var w = null;
		if (
			(g !== void 0 && (w = '' + g),
			o.key !== void 0 && (w = '' + o.key),
			'key' in o)
		) {
			g = {};
			for (var T in o) T !== 'key' && (g[T] = o[T]);
		} else g = o;
		return (
			(o = g.ref),
			{
				$$typeof: a,
				type: f,
				key: w,
				ref: o !== void 0 ? o : null,
				props: g,
			}
		);
	}
	return (
		(reactJsxRuntime_production.Fragment = c),
		(reactJsxRuntime_production.jsx = r),
		(reactJsxRuntime_production.jsxs = r),
		reactJsxRuntime_production
	);
}
var hasRequiredJsxRuntime;
function requireJsxRuntime() {
	return (
		hasRequiredJsxRuntime ||
			((hasRequiredJsxRuntime = 1),
			(jsxRuntime.exports = requireReactJsxRuntime_production())),
		jsxRuntime.exports
	);
}
var jsxRuntimeExports = requireJsxRuntime(),
	react = { exports: {} },
	react_production = {};
/**
 * @license React
 * react.production.js
 *
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
var hasRequiredReact_production;
function requireReact_production() {
	if (hasRequiredReact_production) return react_production;
	hasRequiredReact_production = 1;
	var a = Symbol.for('react.transitional.element'),
		c = Symbol.for('react.portal'),
		r = Symbol.for('react.fragment'),
		f = Symbol.for('react.strict_mode'),
		o = Symbol.for('react.profiler'),
		g = Symbol.for('react.consumer'),
		w = Symbol.for('react.context'),
		T = Symbol.for('react.forward_ref'),
		S = Symbol.for('react.suspense'),
		p = Symbol.for('react.memo'),
		N = Symbol.for('react.lazy'),
		C = Symbol.for('react.activity'),
		I = Symbol.iterator;
	function ze(m) {
		return m === null || typeof m != 'object'
			? null
			: ((m = (I && m[I]) || m['@@iterator']),
				typeof m == 'function' ? m : null);
	}
	var De = {
			isMounted: function () {
				return false;
			},
			enqueueForceUpdate: function () {},
			enqueueReplaceState: function () {},
			enqueueSetState: function () {},
		},
		Ce = Object.assign,
		xt = {};
	function Ke(m, D, z) {
		(this.props = m),
			(this.context = D),
			(this.refs = xt),
			(this.updater = z || De);
	}
	(Ke.prototype.isReactComponent = {}),
		(Ke.prototype.setState = function (m, D) {
			if (typeof m != 'object' && typeof m != 'function' && m != null)
				throw Error(
					'takes an object of state variables to update or a function which returns an object of state variables.',
				);
			this.updater.enqueueSetState(this, m, D, 'setState');
		}),
		(Ke.prototype.forceUpdate = function (m) {
			this.updater.enqueueForceUpdate(this, m, 'forceUpdate');
		});
	function Zt() {}
	Zt.prototype = Ke.prototype;
	function Re(m, D, z) {
		(this.props = m),
			(this.context = D),
			(this.refs = xt),
			(this.updater = z || De);
	}
	var at = (Re.prototype = new Zt());
	(at.constructor = Re),
		Ce(at, Ke.prototype),
		(at.isPureReactComponent = true);
	var pt = Array.isArray;
	function Ne() {}
	var J = { H: null, A: null, T: null, S: null },
		Be = Object.prototype.hasOwnProperty;
	function yt(m, D, z) {
		var U = z.ref;
		return {
			$$typeof: a,
			type: m,
			key: D,
			ref: U !== void 0 ? U : null,
			props: z,
		};
	}
	function Gn(m, D) {
		return yt(m.type, D, m.props);
	}
	function jt(m) {
		return typeof m == 'object' && m !== null && m.$$typeof === a;
	}
	function Ge(m) {
		var D = { '=': '=0', ':': '=2' };
		return (
			'$' +
			m.replace(/[=:]/g, function (z) {
				return D[z];
			})
		);
	}
	var pn = /\/+/g;
	function Et(m, D) {
		return typeof m == 'object' && m !== null && m.key != null
			? Ge('' + m.key)
			: D.toString(36);
	}
	function gt(m) {
		switch (m.status) {
			case 'fulfilled':
				return m.value;
			case 'rejected':
				throw m.reason;
			default:
				switch (
					(typeof m.status == 'string'
						? m.then(Ne, Ne)
						: ((m.status = 'pending'),
							m.then(
								function (D) {
									m.status === 'pending' &&
										((m.status = 'fulfilled'),
										(m.value = D));
								},
								function (D) {
									m.status === 'pending' &&
										((m.status = 'rejected'),
										(m.reason = D));
								},
							)),
					m.status)
				) {
					case 'fulfilled':
						return m.value;
					case 'rejected':
						throw m.reason;
				}
		}
		throw m;
	}
	function E(m, D, z, U, V) {
		var Q = typeof m;
		(Q === 'undefined' || Q === 'boolean') && (m = null);
		var te = false;
		if (m === null) te = true;
		else
			switch (Q) {
				case 'bigint':
				case 'string':
				case 'number':
					te = true;
					break;
				case 'object':
					switch (m.$$typeof) {
						case a:
						case c:
							te = true;
							break;
						case N:
							return (
								(te = m._init), E(te(m._payload), D, z, U, V)
							);
					}
			}
		if (te)
			return (
				(V = V(m)),
				(te = U === '' ? '.' + Et(m, 0) : U),
				pt(V)
					? ((z = ''),
						te != null && (z = te.replace(pn, '$&/') + '/'),
						E(V, D, z, '', function (va) {
							return va;
						}))
					: V != null &&
						(jt(V) &&
							(V = Gn(
								V,
								z +
									(V.key == null || (m && m.key === V.key)
										? ''
										: ('' + V.key).replace(pn, '$&/') +
											'/') +
									te,
							)),
						D.push(V)),
				1
			);
		te = 0;
		var He = U === '' ? '.' : U + ':';
		if (pt(m))
			for (var de = 0; de < m.length; de++)
				(U = m[de]), (Q = He + Et(U, de)), (te += E(U, D, z, Q, V));
		else if (((de = ze(m)), typeof de == 'function'))
			for (m = de.call(m), de = 0; !(U = m.next()).done; )
				(U = U.value), (Q = He + Et(U, de++)), (te += E(U, D, z, Q, V));
		else if (Q === 'object') {
			if (typeof m.then == 'function') return E(gt(m), D, z, U, V);
			throw (
				((D = String(m)),
				Error(
					'Objects are not valid as a React child (found: ' +
						(D === '[object Object]'
							? 'object with keys {' +
								Object.keys(m).join(', ') +
								'}'
							: D) +
						'). If you meant to render a collection of children, use an array instead.',
				))
			);
		}
		return te;
	}
	function R(m, D, z) {
		if (m == null) return m;
		var U = [],
			V = 0;
		return (
			E(m, U, '', '', function (Q) {
				return D.call(z, Q, V++);
			}),
			U
		);
	}
	function L(m) {
		if (m._status === -1) {
			var D = m._result;
			(D = D()),
				D.then(
					function (z) {
						(m._status === 0 || m._status === -1) &&
							((m._status = 1), (m._result = z));
					},
					function (z) {
						(m._status === 0 || m._status === -1) &&
							((m._status = 2), (m._result = z));
					},
				),
				m._status === -1 && ((m._status = 0), (m._result = D));
		}
		if (m._status === 1) return m._result.default;
		throw m._result;
	}
	var ce =
			typeof reportError == 'function'
				? reportError
				: function (m) {
						if (
							typeof window == 'object' &&
							typeof window.ErrorEvent == 'function'
						) {
							var D = new window.ErrorEvent('error', {
								bubbles: true,
								cancelable: true,
								message:
									typeof m == 'object' &&
									m !== null &&
									typeof m.message == 'string'
										? String(m.message)
										: String(m),
								error: m,
							});
							if (!window.dispatchEvent(D)) return;
						} else if (
							typeof process == 'object' &&
							typeof process.emit == 'function'
						) {
							process.emit('uncaughtException', m);
							return;
						}
						console.error(m);
					},
		re = {
			map: R,
			forEach: function (m, D, z) {
				R(
					m,
					function () {
						D.apply(this, arguments);
					},
					z,
				);
			},
			count: function (m) {
				var D = 0;
				return (
					R(m, function () {
						D++;
					}),
					D
				);
			},
			toArray: function (m) {
				return (
					R(m, function (D) {
						return D;
					}) || []
				);
			},
			only: function (m) {
				if (!jt(m))
					throw Error(
						'React.Children.only expected to receive a single React element child.',
					);
				return m;
			},
		};
	return (
		(react_production.Activity = C),
		(react_production.Children = re),
		(react_production.Component = Ke),
		(react_production.Fragment = r),
		(react_production.Profiler = o),
		(react_production.PureComponent = Re),
		(react_production.StrictMode = f),
		(react_production.Suspense = S),
		(react_production.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE =
			J),
		(react_production.__COMPILER_RUNTIME = {
			__proto__: null,
			c: function (m) {
				return J.H.useMemoCache(m);
			},
		}),
		(react_production.cache = function (m) {
			return function () {
				return m.apply(null, arguments);
			};
		}),
		(react_production.cacheSignal = function () {
			return null;
		}),
		(react_production.cloneElement = function (m, D, z) {
			if (m == null)
				throw Error(
					'The argument must be a React element, but you passed ' +
						m +
						'.',
				);
			var U = Ce({}, m.props),
				V = m.key;
			if (D != null)
				for (Q in (D.key !== void 0 && (V = '' + D.key), D))
					!Be.call(D, Q) ||
						Q === 'key' ||
						Q === '__self' ||
						Q === '__source' ||
						(Q === 'ref' && D.ref === void 0) ||
						(U[Q] = D[Q]);
			var Q = arguments.length - 2;
			if (Q === 1) U.children = z;
			else if (1 < Q) {
				for (var te = Array(Q), He = 0; He < Q; He++)
					te[He] = arguments[He + 2];
				U.children = te;
			}
			return yt(m.type, V, U);
		}),
		(react_production.createContext = function (m) {
			return (
				(m = {
					$$typeof: w,
					_currentValue: m,
					_currentValue2: m,
					_threadCount: 0,
					Provider: null,
					Consumer: null,
				}),
				(m.Provider = m),
				(m.Consumer = { $$typeof: g, _context: m }),
				m
			);
		}),
		(react_production.createElement = function (m, D, z) {
			var U,
				V = {},
				Q = null;
			if (D != null)
				for (U in (D.key !== void 0 && (Q = '' + D.key), D))
					Be.call(D, U) &&
						U !== 'key' &&
						U !== '__self' &&
						U !== '__source' &&
						(V[U] = D[U]);
			var te = arguments.length - 2;
			if (te === 1) V.children = z;
			else if (1 < te) {
				for (var He = Array(te), de = 0; de < te; de++)
					He[de] = arguments[de + 2];
				V.children = He;
			}
			if (m && m.defaultProps)
				for (U in ((te = m.defaultProps), te))
					V[U] === void 0 && (V[U] = te[U]);
			return yt(m, Q, V);
		}),
		(react_production.createRef = function () {
			return { current: null };
		}),
		(react_production.forwardRef = function (m) {
			return { $$typeof: T, render: m };
		}),
		(react_production.isValidElement = jt),
		(react_production.lazy = function (m) {
			return {
				$$typeof: N,
				_payload: { _status: -1, _result: m },
				_init: L,
			};
		}),
		(react_production.memo = function (m, D) {
			return { $$typeof: p, type: m, compare: D === void 0 ? null : D };
		}),
		(react_production.startTransition = function (m) {
			var D = J.T,
				z = {};
			J.T = z;
			try {
				var U = m(),
					V = J.S;
				V !== null && V(z, U),
					typeof U == 'object' &&
						U !== null &&
						typeof U.then == 'function' &&
						U.then(Ne, ce);
			} catch (Q) {
				ce(Q);
			} finally {
				D !== null && z.types !== null && (D.types = z.types),
					(J.T = D);
			}
		}),
		(react_production.unstable_useCacheRefresh = function () {
			return J.H.useCacheRefresh();
		}),
		(react_production.use = function (m) {
			return J.H.use(m);
		}),
		(react_production.useActionState = function (m, D, z) {
			return J.H.useActionState(m, D, z);
		}),
		(react_production.useCallback = function (m, D) {
			return J.H.useCallback(m, D);
		}),
		(react_production.useContext = function (m) {
			return J.H.useContext(m);
		}),
		(react_production.useDebugValue = function () {}),
		(react_production.useDeferredValue = function (m, D) {
			return J.H.useDeferredValue(m, D);
		}),
		(react_production.useEffect = function (m, D) {
			return J.H.useEffect(m, D);
		}),
		(react_production.useEffectEvent = function (m) {
			return J.H.useEffectEvent(m);
		}),
		(react_production.useId = function () {
			return J.H.useId();
		}),
		(react_production.useImperativeHandle = function (m, D, z) {
			return J.H.useImperativeHandle(m, D, z);
		}),
		(react_production.useInsertionEffect = function (m, D) {
			return J.H.useInsertionEffect(m, D);
		}),
		(react_production.useLayoutEffect = function (m, D) {
			return J.H.useLayoutEffect(m, D);
		}),
		(react_production.useMemo = function (m, D) {
			return J.H.useMemo(m, D);
		}),
		(react_production.useOptimistic = function (m, D) {
			return J.H.useOptimistic(m, D);
		}),
		(react_production.useReducer = function (m, D, z) {
			return J.H.useReducer(m, D, z);
		}),
		(react_production.useRef = function (m) {
			return J.H.useRef(m);
		}),
		(react_production.useState = function (m) {
			return J.H.useState(m);
		}),
		(react_production.useSyncExternalStore = function (m, D, z) {
			return J.H.useSyncExternalStore(m, D, z);
		}),
		(react_production.useTransition = function () {
			return J.H.useTransition();
		}),
		(react_production.version = '19.2.4'),
		react_production
	);
}
var hasRequiredReact;
function requireReact() {
	return (
		hasRequiredReact ||
			((hasRequiredReact = 1),
			(react.exports = requireReact_production())),
		react.exports
	);
}
var reactExports = requireReact();
const React = getDefaultExportFromCjs(reactExports);
var client = { exports: {} },
	reactDomClient_production = {},
	scheduler = { exports: {} },
	scheduler_production = {};
/**
 * @license React
 * scheduler.production.js
 *
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
var hasRequiredScheduler_production;
function requireScheduler_production() {
	return (
		hasRequiredScheduler_production ||
			((hasRequiredScheduler_production = 1),
			(function (a) {
				function c(E, R) {
					var L = E.length;
					E.push(R);
					e: for (; 0 < L; ) {
						var ce = (L - 1) >>> 1,
							re = E[ce];
						if (0 < o(re, R)) (E[ce] = R), (E[L] = re), (L = ce);
						else break e;
					}
				}
				function r(E) {
					return E.length === 0 ? null : E[0];
				}
				function f(E) {
					if (E.length === 0) return null;
					var R = E[0],
						L = E.pop();
					if (L !== R) {
						E[0] = L;
						e: for (
							var ce = 0, re = E.length, m = re >>> 1;
							ce < m;

						) {
							var D = 2 * (ce + 1) - 1,
								z = E[D],
								U = D + 1,
								V = E[U];
							if (0 > o(z, L))
								U < re && 0 > o(V, z)
									? ((E[ce] = V), (E[U] = L), (ce = U))
									: ((E[ce] = z), (E[D] = L), (ce = D));
							else if (U < re && 0 > o(V, L))
								(E[ce] = V), (E[U] = L), (ce = U);
							else break e;
						}
					}
					return R;
				}
				function o(E, R) {
					var L = E.sortIndex - R.sortIndex;
					return L !== 0 ? L : E.id - R.id;
				}
				if (
					((a.unstable_now = void 0),
					typeof performance == 'object' &&
						typeof performance.now == 'function')
				) {
					var g = performance;
					a.unstable_now = function () {
						return g.now();
					};
				} else {
					var w = Date,
						T = w.now();
					a.unstable_now = function () {
						return w.now() - T;
					};
				}
				var S = [],
					p = [],
					N = 1,
					C = null,
					I = 3,
					ze = false,
					De = false,
					Ce = false,
					xt = false,
					Ke = typeof setTimeout == 'function' ? setTimeout : null,
					Zt =
						typeof clearTimeout == 'function' ? clearTimeout : null,
					Re = typeof setImmediate < 'u' ? setImmediate : null;
				function at(E) {
					for (var R = r(p); R !== null; ) {
						if (R.callback === null) f(p);
						else if (R.startTime <= E)
							f(p), (R.sortIndex = R.expirationTime), c(S, R);
						else break;
						R = r(p);
					}
				}
				function pt(E) {
					if (((Ce = false), at(E), !De))
						if (r(S) !== null)
							(De = true), Ne || ((Ne = true), Ge());
						else {
							var R = r(p);
							R !== null && gt(pt, R.startTime - E);
						}
				}
				var Ne = false,
					J = -1,
					Be = 5,
					yt = -1;
				function Gn() {
					return xt ? true : !(a.unstable_now() - yt < Be);
				}
				function jt() {
					if (((xt = false), Ne)) {
						var E = a.unstable_now();
						yt = E;
						var R = true;
						try {
							e: {
								(De = false),
									Ce && ((Ce = false), Zt(J), (J = -1)),
									(ze = true);
								var L = I;
								try {
									t: {
										for (
											at(E), C = r(S);
											C !== null &&
											!(C.expirationTime > E && Gn());

										) {
											var ce = C.callback;
											if (typeof ce == 'function') {
												(C.callback = null),
													(I = C.priorityLevel);
												var re = ce(
													C.expirationTime <= E,
												);
												if (
													((E = a.unstable_now()),
													typeof re == 'function')
												) {
													(C.callback = re),
														at(E),
														(R = true);
													break t;
												}
												C === r(S) && f(S), at(E);
											} else f(S);
											C = r(S);
										}
										if (C !== null) R = true;
										else {
											var m = r(p);
											m !== null &&
												gt(pt, m.startTime - E),
												(R = false);
										}
									}
									break e;
								} finally {
									(C = null), (I = L), (ze = false);
								}
								R = void 0;
							}
						} finally {
							R ? Ge() : (Ne = false);
						}
					}
				}
				var Ge;
				if (typeof Re == 'function')
					Ge = function () {
						Re(jt);
					};
				else if (typeof MessageChannel < 'u') {
					var pn = new MessageChannel(),
						Et = pn.port2;
					(pn.port1.onmessage = jt),
						(Ge = function () {
							Et.postMessage(null);
						});
				} else
					Ge = function () {
						Ke(jt, 0);
					};
				function gt(E, R) {
					J = Ke(function () {
						E(a.unstable_now());
					}, R);
				}
				(a.unstable_IdlePriority = 5),
					(a.unstable_ImmediatePriority = 1),
					(a.unstable_LowPriority = 4),
					(a.unstable_NormalPriority = 3),
					(a.unstable_Profiling = null),
					(a.unstable_UserBlockingPriority = 2),
					(a.unstable_cancelCallback = function (E) {
						E.callback = null;
					}),
					(a.unstable_forceFrameRate = function (E) {
						0 > E || 125 < E
							? console.error(
									'forceFrameRate takes a positive int between 0 and 125, forcing frame rates higher than 125 fps is not supported',
								)
							: (Be = 0 < E ? Math.floor(1e3 / E) : 5);
					}),
					(a.unstable_getCurrentPriorityLevel = function () {
						return I;
					}),
					(a.unstable_next = function (E) {
						switch (I) {
							case 1:
							case 2:
							case 3:
								var R = 3;
								break;
							default:
								R = I;
						}
						var L = I;
						I = R;
						try {
							return E();
						} finally {
							I = L;
						}
					}),
					(a.unstable_requestPaint = function () {
						xt = true;
					}),
					(a.unstable_runWithPriority = function (E, R) {
						switch (E) {
							case 1:
							case 2:
							case 3:
							case 4:
							case 5:
								break;
							default:
								E = 3;
						}
						var L = I;
						I = E;
						try {
							return R();
						} finally {
							I = L;
						}
					}),
					(a.unstable_scheduleCallback = function (E, R, L) {
						var ce = a.unstable_now();
						switch (
							(typeof L == 'object' && L !== null
								? ((L = L.delay),
									(L =
										typeof L == 'number' && 0 < L
											? ce + L
											: ce))
								: (L = ce),
							E)
						) {
							case 1:
								var re = -1;
								break;
							case 2:
								re = 250;
								break;
							case 5:
								re = 1073741823;
								break;
							case 4:
								re = 1e4;
								break;
							default:
								re = 5e3;
						}
						return (
							(re = L + re),
							(E = {
								id: N++,
								callback: R,
								priorityLevel: E,
								startTime: L,
								expirationTime: re,
								sortIndex: -1,
							}),
							L > ce
								? ((E.sortIndex = L),
									c(p, E),
									r(S) === null &&
										E === r(p) &&
										(Ce ? (Zt(J), (J = -1)) : (Ce = true),
										gt(pt, L - ce)))
								: ((E.sortIndex = re),
									c(S, E),
									De ||
										ze ||
										((De = true),
										Ne || ((Ne = true), Ge()))),
							E
						);
					}),
					(a.unstable_shouldYield = Gn),
					(a.unstable_wrapCallback = function (E) {
						var R = I;
						return function () {
							var L = I;
							I = R;
							try {
								return E.apply(this, arguments);
							} finally {
								I = L;
							}
						};
					});
			})(scheduler_production)),
		scheduler_production
	);
}
var hasRequiredScheduler;
function requireScheduler() {
	return (
		hasRequiredScheduler ||
			((hasRequiredScheduler = 1),
			(scheduler.exports = requireScheduler_production())),
		scheduler.exports
	);
}
var reactDom = { exports: {} },
	reactDom_production = {};
/**
 * @license React
 * react-dom.production.js
 *
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
var hasRequiredReactDom_production;
function requireReactDom_production() {
	if (hasRequiredReactDom_production) return reactDom_production;
	hasRequiredReactDom_production = 1;
	var a = requireReact();
	function c(S) {
		var p = 'https://react.dev/errors/' + S;
		if (1 < arguments.length) {
			p += '?args[]=' + encodeURIComponent(arguments[1]);
			for (var N = 2; N < arguments.length; N++)
				p += '&args[]=' + encodeURIComponent(arguments[N]);
		}
		return (
			'Minified React error #' +
			S +
			'; visit ' +
			p +
			' for the full message or use the non-minified dev environment for full errors and additional helpful warnings.'
		);
	}
	function r() {}
	var f = {
			d: {
				f: r,
				r: function () {
					throw Error(c(522));
				},
				D: r,
				C: r,
				L: r,
				m: r,
				X: r,
				S: r,
				M: r,
			},
			p: 0,
			findDOMNode: null,
		},
		o = Symbol.for('react.portal');
	function g(S, p, N) {
		var C =
			3 < arguments.length && arguments[3] !== void 0
				? arguments[3]
				: null;
		return {
			$$typeof: o,
			key: C == null ? null : '' + C,
			children: S,
			containerInfo: p,
			implementation: N,
		};
	}
	var w = a.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
	function T(S, p) {
		if (S === 'font') return '';
		if (typeof p == 'string') return p === 'use-credentials' ? p : '';
	}
	return (
		(reactDom_production.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE =
			f),
		(reactDom_production.createPortal = function (S, p) {
			var N =
				2 < arguments.length && arguments[2] !== void 0
					? arguments[2]
					: null;
			if (
				!p ||
				(p.nodeType !== 1 && p.nodeType !== 9 && p.nodeType !== 11)
			)
				throw Error(c(299));
			return g(S, p, null, N);
		}),
		(reactDom_production.flushSync = function (S) {
			var p = w.T,
				N = f.p;
			try {
				if (((w.T = null), (f.p = 2), S)) return S();
			} finally {
				(w.T = p), (f.p = N), f.d.f();
			}
		}),
		(reactDom_production.preconnect = function (S, p) {
			typeof S == 'string' &&
				(p
					? ((p = p.crossOrigin),
						(p =
							typeof p == 'string'
								? p === 'use-credentials'
									? p
									: ''
								: void 0))
					: (p = null),
				f.d.C(S, p));
		}),
		(reactDom_production.prefetchDNS = function (S) {
			typeof S == 'string' && f.d.D(S);
		}),
		(reactDom_production.preinit = function (S, p) {
			if (typeof S == 'string' && p && typeof p.as == 'string') {
				var N = p.as,
					C = T(N, p.crossOrigin),
					I = typeof p.integrity == 'string' ? p.integrity : void 0,
					ze =
						typeof p.fetchPriority == 'string'
							? p.fetchPriority
							: void 0;
				N === 'style'
					? f.d.S(
							S,
							typeof p.precedence == 'string'
								? p.precedence
								: void 0,
							{ crossOrigin: C, integrity: I, fetchPriority: ze },
						)
					: N === 'script' &&
						f.d.X(S, {
							crossOrigin: C,
							integrity: I,
							fetchPriority: ze,
							nonce:
								typeof p.nonce == 'string' ? p.nonce : void 0,
						});
			}
		}),
		(reactDom_production.preinitModule = function (S, p) {
			if (typeof S == 'string')
				if (typeof p == 'object' && p !== null) {
					if (p.as == null || p.as === 'script') {
						var N = T(p.as, p.crossOrigin);
						f.d.M(S, {
							crossOrigin: N,
							integrity:
								typeof p.integrity == 'string'
									? p.integrity
									: void 0,
							nonce:
								typeof p.nonce == 'string' ? p.nonce : void 0,
						});
					}
				} else p == null && f.d.M(S);
		}),
		(reactDom_production.preload = function (S, p) {
			if (
				typeof S == 'string' &&
				typeof p == 'object' &&
				p !== null &&
				typeof p.as == 'string'
			) {
				var N = p.as,
					C = T(N, p.crossOrigin);
				f.d.L(S, N, {
					crossOrigin: C,
					integrity:
						typeof p.integrity == 'string' ? p.integrity : void 0,
					nonce: typeof p.nonce == 'string' ? p.nonce : void 0,
					type: typeof p.type == 'string' ? p.type : void 0,
					fetchPriority:
						typeof p.fetchPriority == 'string'
							? p.fetchPriority
							: void 0,
					referrerPolicy:
						typeof p.referrerPolicy == 'string'
							? p.referrerPolicy
							: void 0,
					imageSrcSet:
						typeof p.imageSrcSet == 'string'
							? p.imageSrcSet
							: void 0,
					imageSizes:
						typeof p.imageSizes == 'string' ? p.imageSizes : void 0,
					media: typeof p.media == 'string' ? p.media : void 0,
				});
			}
		}),
		(reactDom_production.preloadModule = function (S, p) {
			if (typeof S == 'string')
				if (p) {
					var N = T(p.as, p.crossOrigin);
					f.d.m(S, {
						as:
							typeof p.as == 'string' && p.as !== 'script'
								? p.as
								: void 0,
						crossOrigin: N,
						integrity:
							typeof p.integrity == 'string'
								? p.integrity
								: void 0,
					});
				} else f.d.m(S);
		}),
		(reactDom_production.requestFormReset = function (S) {
			f.d.r(S);
		}),
		(reactDom_production.unstable_batchedUpdates = function (S, p) {
			return S(p);
		}),
		(reactDom_production.useFormState = function (S, p, N) {
			return w.H.useFormState(S, p, N);
		}),
		(reactDom_production.useFormStatus = function () {
			return w.H.useHostTransitionStatus();
		}),
		(reactDom_production.version = '19.2.4'),
		reactDom_production
	);
}
var hasRequiredReactDom;
function requireReactDom() {
	if (hasRequiredReactDom) return reactDom.exports;
	hasRequiredReactDom = 1;
	function a() {
		if (
			!(
				typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ > 'u' ||
				typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE != 'function'
			)
		)
			try {
				__REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(a);
			} catch (c) {
				console.error(c);
			}
	}
	return (
		a(), (reactDom.exports = requireReactDom_production()), reactDom.exports
	);
}
/**
 * @license React
 * react-dom-client.production.js
 *
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
var hasRequiredReactDomClient_production;
function requireReactDomClient_production() {
	if (hasRequiredReactDomClient_production) return reactDomClient_production;
	hasRequiredReactDomClient_production = 1;
	var a = requireScheduler(),
		c = requireReact(),
		r = requireReactDom();
	function f(e) {
		var t = 'https://react.dev/errors/' + e;
		if (1 < arguments.length) {
			t += '?args[]=' + encodeURIComponent(arguments[1]);
			for (var n = 2; n < arguments.length; n++)
				t += '&args[]=' + encodeURIComponent(arguments[n]);
		}
		return (
			'Minified React error #' +
			e +
			'; visit ' +
			t +
			' for the full message or use the non-minified dev environment for full errors and additional helpful warnings.'
		);
	}
	function o(e) {
		return !(
			!e ||
			(e.nodeType !== 1 && e.nodeType !== 9 && e.nodeType !== 11)
		);
	}
	function g(e) {
		var t = e,
			n = e;
		if (e.alternate) for (; t.return; ) t = t.return;
		else {
			e = t;
			do
				(t = e),
					(t.flags & 4098) !== 0 && (n = t.return),
					(e = t.return);
			while (e);
		}
		return t.tag === 3 ? n : null;
	}
	function w(e) {
		if (e.tag === 13) {
			var t = e.memoizedState;
			if (
				(t === null &&
					((e = e.alternate), e !== null && (t = e.memoizedState)),
				t !== null)
			)
				return t.dehydrated;
		}
		return null;
	}
	function T(e) {
		if (e.tag === 31) {
			var t = e.memoizedState;
			if (
				(t === null &&
					((e = e.alternate), e !== null && (t = e.memoizedState)),
				t !== null)
			)
				return t.dehydrated;
		}
		return null;
	}
	function S(e) {
		if (g(e) !== e) throw Error(f(188));
	}
	function p(e) {
		var t = e.alternate;
		if (!t) {
			if (((t = g(e)), t === null)) throw Error(f(188));
			return t !== e ? null : e;
		}
		for (var n = e, u = t; ; ) {
			var l = n.return;
			if (l === null) break;
			var i = l.alternate;
			if (i === null) {
				if (((u = l.return), u !== null)) {
					n = u;
					continue;
				}
				break;
			}
			if (l.child === i.child) {
				for (i = l.child; i; ) {
					if (i === n) return S(l), e;
					if (i === u) return S(l), t;
					i = i.sibling;
				}
				throw Error(f(188));
			}
			if (n.return !== u.return) (n = l), (u = i);
			else {
				for (var _ = false, b = l.child; b; ) {
					if (b === n) {
						(_ = true), (n = l), (u = i);
						break;
					}
					if (b === u) {
						(_ = true), (u = l), (n = i);
						break;
					}
					b = b.sibling;
				}
				if (!_) {
					for (b = i.child; b; ) {
						if (b === n) {
							(_ = true), (n = i), (u = l);
							break;
						}
						if (b === u) {
							(_ = true), (u = i), (n = l);
							break;
						}
						b = b.sibling;
					}
					if (!_) throw Error(f(189));
				}
			}
			if (n.alternate !== u) throw Error(f(190));
		}
		if (n.tag !== 3) throw Error(f(188));
		return n.stateNode.current === n ? e : t;
	}
	function N(e) {
		var t = e.tag;
		if (t === 5 || t === 26 || t === 27 || t === 6) return e;
		for (e = e.child; e !== null; ) {
			if (((t = N(e)), t !== null)) return t;
			e = e.sibling;
		}
		return null;
	}
	var C = Object.assign,
		I = Symbol.for('react.element'),
		ze = Symbol.for('react.transitional.element'),
		De = Symbol.for('react.portal'),
		Ce = Symbol.for('react.fragment'),
		xt = Symbol.for('react.strict_mode'),
		Ke = Symbol.for('react.profiler'),
		Zt = Symbol.for('react.consumer'),
		Re = Symbol.for('react.context'),
		at = Symbol.for('react.forward_ref'),
		pt = Symbol.for('react.suspense'),
		Ne = Symbol.for('react.suspense_list'),
		J = Symbol.for('react.memo'),
		Be = Symbol.for('react.lazy'),
		yt = Symbol.for('react.activity'),
		Gn = Symbol.for('react.memo_cache_sentinel'),
		jt = Symbol.iterator;
	function Ge(e) {
		return e === null || typeof e != 'object'
			? null
			: ((e = (jt && e[jt]) || e['@@iterator']),
				typeof e == 'function' ? e : null);
	}
	var pn = Symbol.for('react.client.reference');
	function Et(e) {
		if (e == null) return null;
		if (typeof e == 'function')
			return e.$$typeof === pn ? null : e.displayName || e.name || null;
		if (typeof e == 'string') return e;
		switch (e) {
			case Ce:
				return 'Fragment';
			case Ke:
				return 'Profiler';
			case xt:
				return 'StrictMode';
			case pt:
				return 'Suspense';
			case Ne:
				return 'SuspenseList';
			case yt:
				return 'Activity';
		}
		if (typeof e == 'object')
			switch (e.$$typeof) {
				case De:
					return 'Portal';
				case Re:
					return e.displayName || 'Context';
				case Zt:
					return (e._context.displayName || 'Context') + '.Consumer';
				case at:
					var t = e.render;
					return (
						(e = e.displayName),
						e ||
							((e = t.displayName || t.name || ''),
							(e =
								e !== ''
									? 'ForwardRef(' + e + ')'
									: 'ForwardRef')),
						e
					);
				case J:
					return (
						(t = e.displayName || null),
						t !== null ? t : Et(e.type) || 'Memo'
					);
				case Be:
					(t = e._payload), (e = e._init);
					try {
						return Et(e(t));
					} catch {}
			}
		return null;
	}
	var gt = Array.isArray,
		E = c.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE,
		R = r.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE,
		L = { pending: false, data: null, method: null, action: null },
		ce = [],
		re = -1;
	function m(e) {
		return { current: e };
	}
	function D(e) {
		0 > re || ((e.current = ce[re]), (ce[re] = null), re--);
	}
	function z(e, t) {
		re++, (ce[re] = e.current), (e.current = t);
	}
	var U = m(null),
		V = m(null),
		Q = m(null),
		te = m(null);
	function He(e, t) {
		switch ((z(Q, t), z(V, e), z(U, null), t.nodeType)) {
			case 9:
			case 11:
				e = (e = t.documentElement) && (e = e.namespaceURI) ? So(e) : 0;
				break;
			default:
				if (((e = t.tagName), (t = t.namespaceURI)))
					(t = So(t)), (e = xo(t, e));
				else
					switch (e) {
						case 'svg':
							e = 1;
							break;
						case 'math':
							e = 2;
							break;
						default:
							e = 0;
					}
		}
		D(U), z(U, e);
	}
	function de() {
		D(U), D(V), D(Q);
	}
	function va(e) {
		e.memoizedState !== null && z(te, e);
		var t = U.current,
			n = xo(t, e.type);
		t !== n && (z(V, e), z(U, n));
	}
	function mc(e) {
		V.current === e && (D(U), D(V)),
			te.current === e && (D(te), (bc._currentValue = L));
	}
	var Hu, $i;
	function yn(e) {
		if (Hu === void 0)
			try {
				throw Error();
			} catch (n) {
				var t = n.stack.trim().match(/\n( *(at )?)/);
				(Hu = (t && t[1]) || ''),
					($i =
						-1 <
						n.stack.indexOf(`
    at`)
							? ' (<anonymous>)'
							: -1 < n.stack.indexOf('@')
								? '@unknown:0:0'
								: '');
			}
		return (
			`
` +
			Hu +
			e +
			$i
		);
	}
	var Uu = false;
	function Nu(e, t) {
		if (!e || Uu) return '';
		Uu = true;
		var n = Error.prepareStackTrace;
		Error.prepareStackTrace = void 0;
		try {
			var u = {
				DetermineComponentFrameRoot: function () {
					try {
						if (t) {
							var M = function () {
								throw Error();
							};
							if (
								(Object.defineProperty(M.prototype, 'props', {
									set: function () {
										throw Error();
									},
								}),
								typeof Reflect == 'object' && Reflect.construct)
							) {
								try {
									Reflect.construct(M, []);
								} catch (v) {
									var h = v;
								}
								Reflect.construct(e, [], M);
							} else {
								try {
									M.call();
								} catch (v) {
									h = v;
								}
								e.call(M.prototype);
							}
						} else {
							try {
								throw Error();
							} catch (v) {
								h = v;
							}
							(M = e()) &&
								typeof M.catch == 'function' &&
								M.catch(function () {});
						}
					} catch (v) {
						if (v && h && typeof v.stack == 'string')
							return [v.stack, h.stack];
					}
					return [null, null];
				},
			};
			u.DetermineComponentFrameRoot.displayName =
				'DetermineComponentFrameRoot';
			var l = Object.getOwnPropertyDescriptor(
				u.DetermineComponentFrameRoot,
				'name',
			);
			l &&
				l.configurable &&
				Object.defineProperty(u.DetermineComponentFrameRoot, 'name', {
					value: 'DetermineComponentFrameRoot',
				});
			var i = u.DetermineComponentFrameRoot(),
				_ = i[0],
				b = i[1];
			if (_ && b) {
				var s = _.split(`
`),
					j = b.split(`
`);
				for (
					l = u = 0;
					u < s.length &&
					!s[u].includes('DetermineComponentFrameRoot');

				)
					u++;
				for (
					;
					l < j.length &&
					!j[l].includes('DetermineComponentFrameRoot');

				)
					l++;
				if (u === s.length || l === j.length)
					for (
						u = s.length - 1, l = j.length - 1;
						1 <= u && 0 <= l && s[u] !== j[l];

					)
						l--;
				for (; 1 <= u && 0 <= l; u--, l--)
					if (s[u] !== j[l]) {
						if (u !== 1 || l !== 1)
							do
								if ((u--, l--, 0 > l || s[u] !== j[l])) {
									var x =
										`
` + s[u].replace(' at new ', ' at ');
									return (
										e.displayName &&
											x.includes('<anonymous>') &&
											(x = x.replace(
												'<anonymous>',
												e.displayName,
											)),
										x
									);
								}
							while (1 <= u && 0 <= l);
						break;
					}
			}
		} finally {
			(Uu = false), (Error.prepareStackTrace = n);
		}
		return (n = e ? e.displayName || e.name : '') ? yn(n) : '';
	}
	function tb(e, t) {
		switch (e.tag) {
			case 26:
			case 27:
			case 5:
				return yn(e.type);
			case 16:
				return yn('Lazy');
			case 13:
				return e.child !== t && t !== null
					? yn('Suspense Fallback')
					: yn('Suspense');
			case 19:
				return yn('SuspenseList');
			case 0:
			case 15:
				return Nu(e.type, false);
			case 11:
				return Nu(e.type.render, false);
			case 1:
				return Nu(e.type, true);
			case 31:
				return yn('Activity');
			default:
				return '';
		}
	}
	function Pi(e) {
		try {
			var t = '',
				n = null;
			do (t += tb(e, n)), (n = e), (e = e.return);
			while (e);
			return t;
		} catch (u) {
			return (
				`
Error generating stack: ` +
				u.message +
				`
` +
				u.stack
			);
		}
	}
	var Bu = Object.prototype.hasOwnProperty,
		Gu = a.unstable_scheduleCallback,
		qu = a.unstable_cancelCallback,
		nb = a.unstable_shouldYield,
		ab = a.unstable_requestPaint,
		We = a.unstable_now,
		cb = a.unstable_getCurrentPriorityLevel,
		er = a.unstable_ImmediatePriority,
		tr = a.unstable_UserBlockingPriority,
		Oc = a.unstable_NormalPriority,
		ub = a.unstable_LowPriority,
		nr = a.unstable_IdlePriority,
		lb = a.log,
		ib = a.unstable_setDisableYieldValue,
		Sa = null,
		Fe = null;
	function Kt(e) {
		if (
			(typeof lb == 'function' && ib(e),
			Fe && typeof Fe.setStrictMode == 'function')
		)
			try {
				Fe.setStrictMode(Sa, e);
			} catch {}
	}
	var Je = Math.clz32 ? Math.clz32 : _b,
		rb = Math.log,
		fb = Math.LN2;
	function _b(e) {
		return (e >>>= 0), e === 0 ? 32 : (31 - ((rb(e) / fb) | 0)) | 0;
	}
	var pc = 256,
		yc = 262144,
		jc = 4194304;
	function jn(e) {
		var t = e & 42;
		if (t !== 0) return t;
		switch (e & -e) {
			case 1:
				return 1;
			case 2:
				return 2;
			case 4:
				return 4;
			case 8:
				return 8;
			case 16:
				return 16;
			case 32:
				return 32;
			case 64:
				return 64;
			case 128:
				return 128;
			case 256:
			case 512:
			case 1024:
			case 2048:
			case 4096:
			case 8192:
			case 16384:
			case 32768:
			case 65536:
			case 131072:
				return e & 261888;
			case 262144:
			case 524288:
			case 1048576:
			case 2097152:
				return e & 3932160;
			case 4194304:
			case 8388608:
			case 16777216:
			case 33554432:
				return e & 62914560;
			case 67108864:
				return 67108864;
			case 134217728:
				return 134217728;
			case 268435456:
				return 268435456;
			case 536870912:
				return 536870912;
			case 1073741824:
				return 0;
			default:
				return e;
		}
	}
	function hc(e, t, n) {
		var u = e.pendingLanes;
		if (u === 0) return 0;
		var l = 0,
			i = e.suspendedLanes,
			_ = e.pingedLanes;
		e = e.warmLanes;
		var b = u & 134217727;
		return (
			b !== 0
				? ((u = b & ~i),
					u !== 0
						? (l = jn(u))
						: ((_ &= b),
							_ !== 0
								? (l = jn(_))
								: n || ((n = b & ~e), n !== 0 && (l = jn(n)))))
				: ((b = u & ~i),
					b !== 0
						? (l = jn(b))
						: _ !== 0
							? (l = jn(_))
							: n || ((n = u & ~e), n !== 0 && (l = jn(n)))),
			l === 0
				? 0
				: t !== 0 &&
					  t !== l &&
					  (t & i) === 0 &&
					  ((i = l & -l),
					  (n = t & -t),
					  i >= n || (i === 32 && (n & 4194048) !== 0))
					? t
					: l
		);
	}
	function xa(e, t) {
		return (
			(e.pendingLanes & ~(e.suspendedLanes & ~e.pingedLanes) & t) === 0
		);
	}
	function ob(e, t) {
		switch (e) {
			case 1:
			case 2:
			case 4:
			case 8:
			case 64:
				return t + 250;
			case 16:
			case 32:
			case 128:
			case 256:
			case 512:
			case 1024:
			case 2048:
			case 4096:
			case 8192:
			case 16384:
			case 32768:
			case 65536:
			case 131072:
			case 262144:
			case 524288:
			case 1048576:
			case 2097152:
				return t + 5e3;
			case 4194304:
			case 8388608:
			case 16777216:
			case 33554432:
				return -1;
			case 67108864:
			case 134217728:
			case 268435456:
			case 536870912:
			case 1073741824:
				return -1;
			default:
				return -1;
		}
	}
	function ar() {
		var e = jc;
		return (jc <<= 1), (jc & 62914560) === 0 && (jc = 4194304), e;
	}
	function Lu(e) {
		for (var t = [], n = 0; 31 > n; n++) t.push(e);
		return t;
	}
	function Ea(e, t) {
		(e.pendingLanes |= t),
			t !== 268435456 &&
				((e.suspendedLanes = 0),
				(e.pingedLanes = 0),
				(e.warmLanes = 0));
	}
	function bb(e, t, n, u, l, i) {
		var _ = e.pendingLanes;
		(e.pendingLanes = n),
			(e.suspendedLanes = 0),
			(e.pingedLanes = 0),
			(e.warmLanes = 0),
			(e.expiredLanes &= n),
			(e.entangledLanes &= n),
			(e.errorRecoveryDisabledLanes &= n),
			(e.shellSuspendCounter = 0);
		var b = e.entanglements,
			s = e.expirationTimes,
			j = e.hiddenUpdates;
		for (n = _ & ~n; 0 < n; ) {
			var x = 31 - Je(n),
				M = 1 << x;
			(b[x] = 0), (s[x] = -1);
			var h = j[x];
			if (h !== null)
				for (j[x] = null, x = 0; x < h.length; x++) {
					var v = h[x];
					v !== null && (v.lane &= -536870913);
				}
			n &= ~M;
		}
		u !== 0 && cr(e, u, 0),
			i !== 0 &&
				l === 0 &&
				e.tag !== 0 &&
				(e.suspendedLanes |= i & ~(_ & ~t));
	}
	function cr(e, t, n) {
		(e.pendingLanes |= t), (e.suspendedLanes &= ~t);
		var u = 31 - Je(t);
		(e.entangledLanes |= t),
			(e.entanglements[u] =
				e.entanglements[u] | 1073741824 | (n & 261930));
	}
	function ur(e, t) {
		var n = (e.entangledLanes |= t);
		for (e = e.entanglements; n; ) {
			var u = 31 - Je(n),
				l = 1 << u;
			(l & t) | (e[u] & t) && (e[u] |= t), (n &= ~l);
		}
	}
	function lr(e, t) {
		var n = t & -t;
		return (
			(n = (n & 42) !== 0 ? 1 : Vu(n)),
			(n & (e.suspendedLanes | t)) !== 0 ? 0 : n
		);
	}
	function Vu(e) {
		switch (e) {
			case 2:
				e = 1;
				break;
			case 8:
				e = 4;
				break;
			case 32:
				e = 16;
				break;
			case 256:
			case 512:
			case 1024:
			case 2048:
			case 4096:
			case 8192:
			case 16384:
			case 32768:
			case 65536:
			case 131072:
			case 262144:
			case 524288:
			case 1048576:
			case 2097152:
			case 4194304:
			case 8388608:
			case 16777216:
			case 33554432:
				e = 128;
				break;
			case 268435456:
				e = 134217728;
				break;
			default:
				e = 0;
		}
		return e;
	}
	function Yu(e) {
		return (
			(e &= -e),
			2 < e ? (8 < e ? ((e & 134217727) !== 0 ? 32 : 268435456) : 8) : 2
		);
	}
	function ir() {
		var e = R.p;
		return e !== 0
			? e
			: ((e = window.event), e === void 0 ? 32 : Fo(e.type));
	}
	function rr(e, t) {
		var n = R.p;
		try {
			return (R.p = e), t();
		} finally {
			R.p = n;
		}
	}
	var Wt = Math.random().toString(36).slice(2),
		xe = '__reactFiber$' + Wt,
		qe = '__reactProps$' + Wt,
		qn = '__reactContainer$' + Wt,
		Xu = '__reactEvents$' + Wt,
		sb = '__reactListeners$' + Wt,
		gb = '__reactHandles$' + Wt,
		fr = '__reactResources$' + Wt,
		Aa = '__reactMarker$' + Wt;
	function Qu(e) {
		delete e[xe], delete e[qe], delete e[Xu], delete e[sb], delete e[gb];
	}
	function Ln(e) {
		var t = e[xe];
		if (t) return t;
		for (var n = e.parentNode; n; ) {
			if ((t = n[qn] || n[xe])) {
				if (
					((n = t.alternate),
					t.child !== null || (n !== null && n.child !== null))
				)
					for (e = zo(e); e !== null; ) {
						if ((n = e[xe])) return n;
						e = zo(e);
					}
				return t;
			}
			(e = n), (n = e.parentNode);
		}
		return null;
	}
	function Vn(e) {
		if ((e = e[xe] || e[qn])) {
			var t = e.tag;
			if (
				t === 5 ||
				t === 6 ||
				t === 13 ||
				t === 31 ||
				t === 26 ||
				t === 27 ||
				t === 3
			)
				return e;
		}
		return null;
	}
	function Ta(e) {
		var t = e.tag;
		if (t === 5 || t === 26 || t === 27 || t === 6) return e.stateNode;
		throw Error(f(33));
	}
	function Yn(e) {
		var t = e[fr];
		return (
			t ||
				(t = e[fr] =
					{
						hoistableStyles: /* @__PURE__ */ new Map(),
						hoistableScripts: /* @__PURE__ */ new Map(),
					}),
			t
		);
	}
	function ve(e) {
		e[Aa] = true;
	}
	var _r = /* @__PURE__ */ new Set(),
		or = {};
	function hn(e, t) {
		Xn(e, t), Xn(e + 'Capture', t);
	}
	function Xn(e, t) {
		for (or[e] = t, e = 0; e < t.length; e++) _r.add(t[e]);
	}
	var db = RegExp(
			'^[:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD][:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040]*$',
		),
		br = {},
		sr = {};
	function mb(e) {
		return Bu.call(sr, e)
			? true
			: Bu.call(br, e)
				? false
				: db.test(e)
					? (sr[e] = true)
					: ((br[e] = true), false);
	}
	function wc(e, t, n) {
		if (mb(t))
			if (n === null) e.removeAttribute(t);
			else {
				switch (typeof n) {
					case 'undefined':
					case 'function':
					case 'symbol':
						e.removeAttribute(t);
						return;
					case 'boolean':
						var u = t.toLowerCase().slice(0, 5);
						if (u !== 'data-' && u !== 'aria-') {
							e.removeAttribute(t);
							return;
						}
				}
				e.setAttribute(t, '' + n);
			}
	}
	function vc(e, t, n) {
		if (n === null) e.removeAttribute(t);
		else {
			switch (typeof n) {
				case 'undefined':
				case 'function':
				case 'symbol':
				case 'boolean':
					e.removeAttribute(t);
					return;
			}
			e.setAttribute(t, '' + n);
		}
	}
	function At(e, t, n, u) {
		if (u === null) e.removeAttribute(n);
		else {
			switch (typeof u) {
				case 'undefined':
				case 'function':
				case 'symbol':
				case 'boolean':
					e.removeAttribute(n);
					return;
			}
			e.setAttributeNS(t, n, '' + u);
		}
	}
	function ct(e) {
		switch (typeof e) {
			case 'bigint':
			case 'boolean':
			case 'number':
			case 'string':
			case 'undefined':
				return e;
			case 'object':
				return e;
			default:
				return '';
		}
	}
	function gr(e) {
		var t = e.type;
		return (
			(e = e.nodeName) &&
			e.toLowerCase() === 'input' &&
			(t === 'checkbox' || t === 'radio')
		);
	}
	function Ob(e, t, n) {
		var u = Object.getOwnPropertyDescriptor(e.constructor.prototype, t);
		if (
			!e.hasOwnProperty(t) &&
			typeof u < 'u' &&
			typeof u.get == 'function' &&
			typeof u.set == 'function'
		) {
			var l = u.get,
				i = u.set;
			return (
				Object.defineProperty(e, t, {
					configurable: true,
					get: function () {
						return l.call(this);
					},
					set: function (_) {
						(n = '' + _), i.call(this, _);
					},
				}),
				Object.defineProperty(e, t, { enumerable: u.enumerable }),
				{
					getValue: function () {
						return n;
					},
					setValue: function (_) {
						n = '' + _;
					},
					stopTracking: function () {
						(e._valueTracker = null), delete e[t];
					},
				}
			);
		}
	}
	function Zu(e) {
		if (!e._valueTracker) {
			var t = gr(e) ? 'checked' : 'value';
			e._valueTracker = Ob(e, t, '' + e[t]);
		}
	}
	function dr(e) {
		if (!e) return false;
		var t = e._valueTracker;
		if (!t) return true;
		var n = t.getValue(),
			u = '';
		return (
			e && (u = gr(e) ? (e.checked ? 'true' : 'false') : e.value),
			(e = u),
			e !== n ? (t.setValue(e), true) : false
		);
	}
	function Sc(e) {
		if (
			((e = e || (typeof document < 'u' ? document : void 0)),
			typeof e > 'u')
		)
			return null;
		try {
			return e.activeElement || e.body;
		} catch {
			return e.body;
		}
	}
	var pb = /[\n"\\]/g;
	function ut(e) {
		return e.replace(pb, function (t) {
			return '\\' + t.charCodeAt(0).toString(16) + ' ';
		});
	}
	function Ku(e, t, n, u, l, i, _, b) {
		(e.name = ''),
			_ != null &&
			typeof _ != 'function' &&
			typeof _ != 'symbol' &&
			typeof _ != 'boolean'
				? (e.type = _)
				: e.removeAttribute('type'),
			t != null
				? _ === 'number'
					? ((t === 0 && e.value === '') || e.value != t) &&
						(e.value = '' + ct(t))
					: e.value !== '' + ct(t) && (e.value = '' + ct(t))
				: (_ !== 'submit' && _ !== 'reset') ||
					e.removeAttribute('value'),
			t != null
				? Wu(e, _, ct(t))
				: n != null
					? Wu(e, _, ct(n))
					: u != null && e.removeAttribute('value'),
			l == null && i != null && (e.defaultChecked = !!i),
			l != null &&
				(e.checked =
					l && typeof l != 'function' && typeof l != 'symbol'),
			b != null &&
			typeof b != 'function' &&
			typeof b != 'symbol' &&
			typeof b != 'boolean'
				? (e.name = '' + ct(b))
				: e.removeAttribute('name');
	}
	function mr(e, t, n, u, l, i, _, b) {
		if (
			(i != null &&
				typeof i != 'function' &&
				typeof i != 'symbol' &&
				typeof i != 'boolean' &&
				(e.type = i),
			t != null || n != null)
		) {
			if (!((i !== 'submit' && i !== 'reset') || t != null)) {
				Zu(e);
				return;
			}
			(n = n != null ? '' + ct(n) : ''),
				(t = t != null ? '' + ct(t) : n),
				b || t === e.value || (e.value = t),
				(e.defaultValue = t);
		}
		(u = u ?? l),
			(u = typeof u != 'function' && typeof u != 'symbol' && !!u),
			(e.checked = b ? e.checked : !!u),
			(e.defaultChecked = !!u),
			_ != null &&
				typeof _ != 'function' &&
				typeof _ != 'symbol' &&
				typeof _ != 'boolean' &&
				(e.name = _),
			Zu(e);
	}
	function Wu(e, t, n) {
		(t === 'number' && Sc(e.ownerDocument) === e) ||
			e.defaultValue === '' + n ||
			(e.defaultValue = '' + n);
	}
	function Qn(e, t, n, u) {
		if (((e = e.options), t)) {
			t = {};
			for (var l = 0; l < n.length; l++) t['$' + n[l]] = true;
			for (n = 0; n < e.length; n++)
				(l = t.hasOwnProperty('$' + e[n].value)),
					e[n].selected !== l && (e[n].selected = l),
					l && u && (e[n].defaultSelected = true);
		} else {
			for (n = '' + ct(n), t = null, l = 0; l < e.length; l++) {
				if (e[l].value === n) {
					(e[l].selected = true), u && (e[l].defaultSelected = true);
					return;
				}
				t !== null || e[l].disabled || (t = e[l]);
			}
			t !== null && (t.selected = true);
		}
	}
	function Or(e, t, n) {
		if (
			t != null &&
			((t = '' + ct(t)), t !== e.value && (e.value = t), n == null)
		) {
			e.defaultValue !== t && (e.defaultValue = t);
			return;
		}
		e.defaultValue = n != null ? '' + ct(n) : '';
	}
	function pr(e, t, n, u) {
		if (t == null) {
			if (u != null) {
				if (n != null) throw Error(f(92));
				if (gt(u)) {
					if (1 < u.length) throw Error(f(93));
					u = u[0];
				}
				n = u;
			}
			n == null && (n = ''), (t = n);
		}
		(n = ct(t)),
			(e.defaultValue = n),
			(u = e.textContent),
			u === n && u !== '' && u !== null && (e.value = u),
			Zu(e);
	}
	function Zn(e, t) {
		if (t) {
			var n = e.firstChild;
			if (n && n === e.lastChild && n.nodeType === 3) {
				n.nodeValue = t;
				return;
			}
		}
		e.textContent = t;
	}
	var yb = new Set(
		'animationIterationCount aspectRatio borderImageOutset borderImageSlice borderImageWidth boxFlex boxFlexGroup boxOrdinalGroup columnCount columns flex flexGrow flexPositive flexShrink flexNegative flexOrder gridArea gridRow gridRowEnd gridRowSpan gridRowStart gridColumn gridColumnEnd gridColumnSpan gridColumnStart fontWeight lineClamp lineHeight opacity order orphans scale tabSize widows zIndex zoom fillOpacity floodOpacity stopOpacity strokeDasharray strokeDashoffset strokeMiterlimit strokeOpacity strokeWidth MozAnimationIterationCount MozBoxFlex MozBoxFlexGroup MozLineClamp msAnimationIterationCount msFlex msZoom msFlexGrow msFlexNegative msFlexOrder msFlexPositive msFlexShrink msGridColumn msGridColumnSpan msGridRow msGridRowSpan WebkitAnimationIterationCount WebkitBoxFlex WebKitBoxFlexGroup WebkitBoxOrdinalGroup WebkitColumnCount WebkitColumns WebkitFlex WebkitFlexGrow WebkitFlexPositive WebkitFlexShrink WebkitLineClamp'.split(
			' ',
		),
	);
	function yr(e, t, n) {
		var u = t.indexOf('--') === 0;
		n == null || typeof n == 'boolean' || n === ''
			? u
				? e.setProperty(t, '')
				: t === 'float'
					? (e.cssFloat = '')
					: (e[t] = '')
			: u
				? e.setProperty(t, n)
				: typeof n != 'number' || n === 0 || yb.has(t)
					? t === 'float'
						? (e.cssFloat = n)
						: (e[t] = ('' + n).trim())
					: (e[t] = n + 'px');
	}
	function jr(e, t, n) {
		if (t != null && typeof t != 'object') throw Error(f(62));
		if (((e = e.style), n != null)) {
			for (var u in n)
				!n.hasOwnProperty(u) ||
					(t != null && t.hasOwnProperty(u)) ||
					(u.indexOf('--') === 0
						? e.setProperty(u, '')
						: u === 'float'
							? (e.cssFloat = '')
							: (e[u] = ''));
			for (var l in t)
				(u = t[l]), t.hasOwnProperty(l) && n[l] !== u && yr(e, l, u);
		} else for (var i in t) t.hasOwnProperty(i) && yr(e, i, t[i]);
	}
	function Fu(e) {
		if (e.indexOf('-') === -1) return false;
		switch (e) {
			case 'annotation-xml':
			case 'color-profile':
			case 'font-face':
			case 'font-face-src':
			case 'font-face-uri':
			case 'font-face-format':
			case 'font-face-name':
			case 'missing-glyph':
				return false;
			default:
				return true;
		}
	}
	var jb = /* @__PURE__ */ new Map([
			['acceptCharset', 'accept-charset'],
			['htmlFor', 'for'],
			['httpEquiv', 'http-equiv'],
			['crossOrigin', 'crossorigin'],
			['accentHeight', 'accent-height'],
			['alignmentBaseline', 'alignment-baseline'],
			['arabicForm', 'arabic-form'],
			['baselineShift', 'baseline-shift'],
			['capHeight', 'cap-height'],
			['clipPath', 'clip-path'],
			['clipRule', 'clip-rule'],
			['colorInterpolation', 'color-interpolation'],
			['colorInterpolationFilters', 'color-interpolation-filters'],
			['colorProfile', 'color-profile'],
			['colorRendering', 'color-rendering'],
			['dominantBaseline', 'dominant-baseline'],
			['enableBackground', 'enable-background'],
			['fillOpacity', 'fill-opacity'],
			['fillRule', 'fill-rule'],
			['floodColor', 'flood-color'],
			['floodOpacity', 'flood-opacity'],
			['fontFamily', 'font-family'],
			['fontSize', 'font-size'],
			['fontSizeAdjust', 'font-size-adjust'],
			['fontStretch', 'font-stretch'],
			['fontStyle', 'font-style'],
			['fontVariant', 'font-variant'],
			['fontWeight', 'font-weight'],
			['glyphName', 'glyph-name'],
			['glyphOrientationHorizontal', 'glyph-orientation-horizontal'],
			['glyphOrientationVertical', 'glyph-orientation-vertical'],
			['horizAdvX', 'horiz-adv-x'],
			['horizOriginX', 'horiz-origin-x'],
			['imageRendering', 'image-rendering'],
			['letterSpacing', 'letter-spacing'],
			['lightingColor', 'lighting-color'],
			['markerEnd', 'marker-end'],
			['markerMid', 'marker-mid'],
			['markerStart', 'marker-start'],
			['overlinePosition', 'overline-position'],
			['overlineThickness', 'overline-thickness'],
			['paintOrder', 'paint-order'],
			['panose-1', 'panose-1'],
			['pointerEvents', 'pointer-events'],
			['renderingIntent', 'rendering-intent'],
			['shapeRendering', 'shape-rendering'],
			['stopColor', 'stop-color'],
			['stopOpacity', 'stop-opacity'],
			['strikethroughPosition', 'strikethrough-position'],
			['strikethroughThickness', 'strikethrough-thickness'],
			['strokeDasharray', 'stroke-dasharray'],
			['strokeDashoffset', 'stroke-dashoffset'],
			['strokeLinecap', 'stroke-linecap'],
			['strokeLinejoin', 'stroke-linejoin'],
			['strokeMiterlimit', 'stroke-miterlimit'],
			['strokeOpacity', 'stroke-opacity'],
			['strokeWidth', 'stroke-width'],
			['textAnchor', 'text-anchor'],
			['textDecoration', 'text-decoration'],
			['textRendering', 'text-rendering'],
			['transformOrigin', 'transform-origin'],
			['underlinePosition', 'underline-position'],
			['underlineThickness', 'underline-thickness'],
			['unicodeBidi', 'unicode-bidi'],
			['unicodeRange', 'unicode-range'],
			['unitsPerEm', 'units-per-em'],
			['vAlphabetic', 'v-alphabetic'],
			['vHanging', 'v-hanging'],
			['vIdeographic', 'v-ideographic'],
			['vMathematical', 'v-mathematical'],
			['vectorEffect', 'vector-effect'],
			['vertAdvY', 'vert-adv-y'],
			['vertOriginX', 'vert-origin-x'],
			['vertOriginY', 'vert-origin-y'],
			['wordSpacing', 'word-spacing'],
			['writingMode', 'writing-mode'],
			['xmlnsXlink', 'xmlns:xlink'],
			['xHeight', 'x-height'],
		]),
		hb =
			/^[\u0000-\u001F ]*j[\r\n\t]*a[\r\n\t]*v[\r\n\t]*a[\r\n\t]*s[\r\n\t]*c[\r\n\t]*r[\r\n\t]*i[\r\n\t]*p[\r\n\t]*t[\r\n\t]*:/i;
	function xc(e) {
		return hb.test('' + e)
			? "javascript:throw new Error('React has blocked a javascript: URL as a security precaution.')"
			: e;
	}
	function Tt() {}
	var Ju = null;
	function ku(e) {
		return (
			(e = e.target || e.srcElement || window),
			e.correspondingUseElement && (e = e.correspondingUseElement),
			e.nodeType === 3 ? e.parentNode : e
		);
	}
	var Kn = null,
		Wn = null;
	function hr(e) {
		var t = Vn(e);
		if (t && (e = t.stateNode)) {
			var n = e[qe] || null;
			e: switch (((e = t.stateNode), t.type)) {
				case 'input':
					if (
						(Ku(
							e,
							n.value,
							n.defaultValue,
							n.defaultValue,
							n.checked,
							n.defaultChecked,
							n.type,
							n.name,
						),
						(t = n.name),
						n.type === 'radio' && t != null)
					) {
						for (n = e; n.parentNode; ) n = n.parentNode;
						for (
							n = n.querySelectorAll(
								'input[name="' +
									ut('' + t) +
									'"][type="radio"]',
							),
								t = 0;
							t < n.length;
							t++
						) {
							var u = n[t];
							if (u !== e && u.form === e.form) {
								var l = u[qe] || null;
								if (!l) throw Error(f(90));
								Ku(
									u,
									l.value,
									l.defaultValue,
									l.defaultValue,
									l.checked,
									l.defaultChecked,
									l.type,
									l.name,
								);
							}
						}
						for (t = 0; t < n.length; t++)
							(u = n[t]), u.form === e.form && dr(u);
					}
					break e;
				case 'textarea':
					Or(e, n.value, n.defaultValue);
					break e;
				case 'select':
					(t = n.value), t != null && Qn(e, !!n.multiple, t, false);
			}
		}
	}
	var Iu = false;
	function wr(e, t, n) {
		if (Iu) return e(t, n);
		Iu = true;
		try {
			var u = e(t);
			return u;
		} finally {
			if (
				((Iu = false),
				(Kn !== null || Wn !== null) &&
					(bu(),
					Kn && ((t = Kn), (e = Wn), (Wn = Kn = null), hr(t), e)))
			)
				for (t = 0; t < e.length; t++) hr(e[t]);
		}
	}
	function Ma(e, t) {
		var n = e.stateNode;
		if (n === null) return null;
		var u = n[qe] || null;
		if (u === null) return null;
		n = u[t];
		e: switch (t) {
			case 'onClick':
			case 'onClickCapture':
			case 'onDoubleClick':
			case 'onDoubleClickCapture':
			case 'onMouseDown':
			case 'onMouseDownCapture':
			case 'onMouseMove':
			case 'onMouseMoveCapture':
			case 'onMouseUp':
			case 'onMouseUpCapture':
			case 'onMouseEnter':
				(u = !u.disabled) ||
					((e = e.type),
					(u = !(
						e === 'button' ||
						e === 'input' ||
						e === 'select' ||
						e === 'textarea'
					))),
					(e = !u);
				break e;
			default:
				e = false;
		}
		if (e) return null;
		if (n && typeof n != 'function') throw Error(f(231, t, typeof n));
		return n;
	}
	var Mt = !(
			typeof window > 'u' ||
			typeof window.document > 'u' ||
			typeof window.document.createElement > 'u'
		),
		$u = false;
	if (Mt)
		try {
			var Da = {};
			Object.defineProperty(Da, 'passive', {
				get: function () {
					$u = true;
				},
			}),
				window.addEventListener('test', Da, Da),
				window.removeEventListener('test', Da, Da);
		} catch {
			$u = false;
		}
	var Ft = null,
		Pu = null,
		Ec = null;
	function vr() {
		if (Ec) return Ec;
		var e,
			t = Pu,
			n = t.length,
			u,
			l = 'value' in Ft ? Ft.value : Ft.textContent,
			i = l.length;
		for (e = 0; e < n && t[e] === l[e]; e++);
		var _ = n - e;
		for (u = 1; u <= _ && t[n - u] === l[i - u]; u++);
		return (Ec = l.slice(e, 1 < u ? 1 - u : void 0));
	}
	function Ac(e) {
		var t = e.keyCode;
		return (
			'charCode' in e
				? ((e = e.charCode), e === 0 && t === 13 && (e = 13))
				: (e = t),
			e === 10 && (e = 13),
			32 <= e || e === 13 ? e : 0
		);
	}
	function Tc() {
		return true;
	}
	function Sr() {
		return false;
	}
	function Le(e) {
		function t(n, u, l, i, _) {
			(this._reactName = n),
				(this._targetInst = l),
				(this.type = u),
				(this.nativeEvent = i),
				(this.target = _),
				(this.currentTarget = null);
			for (var b in e)
				e.hasOwnProperty(b) &&
					((n = e[b]), (this[b] = n ? n(i) : i[b]));
			return (
				(this.isDefaultPrevented = (
					i.defaultPrevented != null
						? i.defaultPrevented
						: i.returnValue === false
				)
					? Tc
					: Sr),
				(this.isPropagationStopped = Sr),
				this
			);
		}
		return (
			C(t.prototype, {
				preventDefault: function () {
					this.defaultPrevented = true;
					var n = this.nativeEvent;
					n &&
						(n.preventDefault
							? n.preventDefault()
							: typeof n.returnValue != 'unknown' &&
								(n.returnValue = false),
						(this.isDefaultPrevented = Tc));
				},
				stopPropagation: function () {
					var n = this.nativeEvent;
					n &&
						(n.stopPropagation
							? n.stopPropagation()
							: typeof n.cancelBubble != 'unknown' &&
								(n.cancelBubble = true),
						(this.isPropagationStopped = Tc));
				},
				persist: function () {},
				isPersistent: Tc,
			}),
			t
		);
	}
	var wn = {
			eventPhase: 0,
			bubbles: 0,
			cancelable: 0,
			timeStamp: function (e) {
				return e.timeStamp || Date.now();
			},
			defaultPrevented: 0,
			isTrusted: 0,
		},
		Mc = Le(wn),
		Ra = C({}, wn, { view: 0, detail: 0 }),
		wb = Le(Ra),
		el,
		tl,
		za,
		Dc = C({}, Ra, {
			screenX: 0,
			screenY: 0,
			clientX: 0,
			clientY: 0,
			pageX: 0,
			pageY: 0,
			ctrlKey: 0,
			shiftKey: 0,
			altKey: 0,
			metaKey: 0,
			getModifierState: al,
			button: 0,
			buttons: 0,
			relatedTarget: function (e) {
				return e.relatedTarget === void 0
					? e.fromElement === e.srcElement
						? e.toElement
						: e.fromElement
					: e.relatedTarget;
			},
			movementX: function (e) {
				return 'movementX' in e
					? e.movementX
					: (e !== za &&
							(za && e.type === 'mousemove'
								? ((el = e.screenX - za.screenX),
									(tl = e.screenY - za.screenY))
								: (tl = el = 0),
							(za = e)),
						el);
			},
			movementY: function (e) {
				return 'movementY' in e ? e.movementY : tl;
			},
		}),
		xr = Le(Dc),
		vb = C({}, Dc, { dataTransfer: 0 }),
		Sb = Le(vb),
		xb = C({}, Ra, { relatedTarget: 0 }),
		nl = Le(xb),
		Eb = C({}, wn, { animationName: 0, elapsedTime: 0, pseudoElement: 0 }),
		Ab = Le(Eb),
		Tb = C({}, wn, {
			clipboardData: function (e) {
				return 'clipboardData' in e
					? e.clipboardData
					: window.clipboardData;
			},
		}),
		Mb = Le(Tb),
		Db = C({}, wn, { data: 0 }),
		Er = Le(Db),
		Rb = {
			Esc: 'Escape',
			Spacebar: ' ',
			Left: 'ArrowLeft',
			Up: 'ArrowUp',
			Right: 'ArrowRight',
			Down: 'ArrowDown',
			Del: 'Delete',
			Win: 'OS',
			Menu: 'ContextMenu',
			Apps: 'ContextMenu',
			Scroll: 'ScrollLock',
			MozPrintableKey: 'Unidentified',
		},
		zb = {
			8: 'Backspace',
			9: 'Tab',
			12: 'Clear',
			13: 'Enter',
			16: 'Shift',
			17: 'Control',
			18: 'Alt',
			19: 'Pause',
			20: 'CapsLock',
			27: 'Escape',
			32: ' ',
			33: 'PageUp',
			34: 'PageDown',
			35: 'End',
			36: 'Home',
			37: 'ArrowLeft',
			38: 'ArrowUp',
			39: 'ArrowRight',
			40: 'ArrowDown',
			45: 'Insert',
			46: 'Delete',
			112: 'F1',
			113: 'F2',
			114: 'F3',
			115: 'F4',
			116: 'F5',
			117: 'F6',
			118: 'F7',
			119: 'F8',
			120: 'F9',
			121: 'F10',
			122: 'F11',
			123: 'F12',
			144: 'NumLock',
			145: 'ScrollLock',
			224: 'Meta',
		},
		Cb = {
			Alt: 'altKey',
			Control: 'ctrlKey',
			Meta: 'metaKey',
			Shift: 'shiftKey',
		};
	function Hb(e) {
		var t = this.nativeEvent;
		return t.getModifierState
			? t.getModifierState(e)
			: (e = Cb[e])
				? !!t[e]
				: false;
	}
	function al() {
		return Hb;
	}
	var Ub = C({}, Ra, {
			key: function (e) {
				if (e.key) {
					var t = Rb[e.key] || e.key;
					if (t !== 'Unidentified') return t;
				}
				return e.type === 'keypress'
					? ((e = Ac(e)), e === 13 ? 'Enter' : String.fromCharCode(e))
					: e.type === 'keydown' || e.type === 'keyup'
						? zb[e.keyCode] || 'Unidentified'
						: '';
			},
			code: 0,
			location: 0,
			ctrlKey: 0,
			shiftKey: 0,
			altKey: 0,
			metaKey: 0,
			repeat: 0,
			locale: 0,
			getModifierState: al,
			charCode: function (e) {
				return e.type === 'keypress' ? Ac(e) : 0;
			},
			keyCode: function (e) {
				return e.type === 'keydown' || e.type === 'keyup'
					? e.keyCode
					: 0;
			},
			which: function (e) {
				return e.type === 'keypress'
					? Ac(e)
					: e.type === 'keydown' || e.type === 'keyup'
						? e.keyCode
						: 0;
			},
		}),
		Nb = Le(Ub),
		Bb = C({}, Dc, {
			pointerId: 0,
			width: 0,
			height: 0,
			pressure: 0,
			tangentialPressure: 0,
			tiltX: 0,
			tiltY: 0,
			twist: 0,
			pointerType: 0,
			isPrimary: 0,
		}),
		Ar = Le(Bb),
		Gb = C({}, Ra, {
			touches: 0,
			targetTouches: 0,
			changedTouches: 0,
			altKey: 0,
			metaKey: 0,
			ctrlKey: 0,
			shiftKey: 0,
			getModifierState: al,
		}),
		qb = Le(Gb),
		Lb = C({}, wn, { propertyName: 0, elapsedTime: 0, pseudoElement: 0 }),
		Vb = Le(Lb),
		Yb = C({}, Dc, {
			deltaX: function (e) {
				return 'deltaX' in e
					? e.deltaX
					: 'wheelDeltaX' in e
						? -e.wheelDeltaX
						: 0;
			},
			deltaY: function (e) {
				return 'deltaY' in e
					? e.deltaY
					: 'wheelDeltaY' in e
						? -e.wheelDeltaY
						: 'wheelDelta' in e
							? -e.wheelDelta
							: 0;
			},
			deltaZ: 0,
			deltaMode: 0,
		}),
		Xb = Le(Yb),
		Qb = C({}, wn, { newState: 0, oldState: 0 }),
		Zb = Le(Qb),
		Kb = [9, 13, 27, 32],
		cl = Mt && 'CompositionEvent' in window,
		Ca = null;
	Mt && 'documentMode' in document && (Ca = document.documentMode);
	var Wb = Mt && 'TextEvent' in window && !Ca,
		Tr = Mt && (!cl || (Ca && 8 < Ca && 11 >= Ca)),
		Mr = ' ',
		Dr = false;
	function Rr(e, t) {
		switch (e) {
			case 'keyup':
				return Kb.indexOf(t.keyCode) !== -1;
			case 'keydown':
				return t.keyCode !== 229;
			case 'keypress':
			case 'mousedown':
			case 'focusout':
				return true;
			default:
				return false;
		}
	}
	function zr(e) {
		return (
			(e = e.detail), typeof e == 'object' && 'data' in e ? e.data : null
		);
	}
	var Fn = false;
	function Fb(e, t) {
		switch (e) {
			case 'compositionend':
				return zr(t);
			case 'keypress':
				return t.which !== 32 ? null : ((Dr = true), Mr);
			case 'textInput':
				return (e = t.data), e === Mr && Dr ? null : e;
			default:
				return null;
		}
	}
	function Jb(e, t) {
		if (Fn)
			return e === 'compositionend' || (!cl && Rr(e, t))
				? ((e = vr()), (Ec = Pu = Ft = null), (Fn = false), e)
				: null;
		switch (e) {
			case 'paste':
				return null;
			case 'keypress':
				if (
					!(t.ctrlKey || t.altKey || t.metaKey) ||
					(t.ctrlKey && t.altKey)
				) {
					if (t.char && 1 < t.char.length) return t.char;
					if (t.which) return String.fromCharCode(t.which);
				}
				return null;
			case 'compositionend':
				return Tr && t.locale !== 'ko' ? null : t.data;
			default:
				return null;
		}
	}
	var kb = {
		color: true,
		date: true,
		datetime: true,
		'datetime-local': true,
		email: true,
		month: true,
		number: true,
		password: true,
		range: true,
		search: true,
		tel: true,
		text: true,
		time: true,
		url: true,
		week: true,
	};
	function Cr(e) {
		var t = e && e.nodeName && e.nodeName.toLowerCase();
		return t === 'input' ? !!kb[e.type] : t === 'textarea';
	}
	function Hr(e, t, n, u) {
		Kn ? (Wn ? Wn.push(u) : (Wn = [u])) : (Kn = u),
			(t = yu(t, 'onChange')),
			0 < t.length &&
				((n = new Mc('onChange', 'change', null, n, u)),
				e.push({ event: n, listeners: t }));
	}
	var Ha = null,
		Ua = null;
	function Ib(e) {
		po(e, 0);
	}
	function Rc(e) {
		var t = Ta(e);
		if (dr(t)) return e;
	}
	function Ur(e, t) {
		if (e === 'change') return t;
	}
	var Nr = false;
	if (Mt) {
		var ul;
		if (Mt) {
			var ll = 'oninput' in document;
			if (!ll) {
				var Br = document.createElement('div');
				Br.setAttribute('oninput', 'return;'),
					(ll = typeof Br.oninput == 'function');
			}
			ul = ll;
		} else ul = false;
		Nr = ul && (!document.documentMode || 9 < document.documentMode);
	}
	function Gr() {
		Ha && (Ha.detachEvent('onpropertychange', qr), (Ua = Ha = null));
	}
	function qr(e) {
		if (e.propertyName === 'value' && Rc(Ua)) {
			var t = [];
			Hr(t, Ua, e, ku(e)), wr(Ib, t);
		}
	}
	function $b(e, t, n) {
		e === 'focusin'
			? (Gr(), (Ha = t), (Ua = n), Ha.attachEvent('onpropertychange', qr))
			: e === 'focusout' && Gr();
	}
	function Pb(e) {
		if (e === 'selectionchange' || e === 'keyup' || e === 'keydown')
			return Rc(Ua);
	}
	function es(e, t) {
		if (e === 'click') return Rc(t);
	}
	function ts(e, t) {
		if (e === 'input' || e === 'change') return Rc(t);
	}
	function ns(e, t) {
		return (
			(e === t && (e !== 0 || 1 / e === 1 / t)) || (e !== e && t !== t)
		);
	}
	var ke = typeof Object.is == 'function' ? Object.is : ns;
	function Na(e, t) {
		if (ke(e, t)) return true;
		if (
			typeof e != 'object' ||
			e === null ||
			typeof t != 'object' ||
			t === null
		)
			return false;
		var n = Object.keys(e),
			u = Object.keys(t);
		if (n.length !== u.length) return false;
		for (u = 0; u < n.length; u++) {
			var l = n[u];
			if (!Bu.call(t, l) || !ke(e[l], t[l])) return false;
		}
		return true;
	}
	function Lr(e) {
		for (; e && e.firstChild; ) e = e.firstChild;
		return e;
	}
	function Vr(e, t) {
		var n = Lr(e);
		e = 0;
		for (var u; n; ) {
			if (n.nodeType === 3) {
				if (((u = e + n.textContent.length), e <= t && u >= t))
					return { node: n, offset: t - e };
				e = u;
			}
			e: {
				for (; n; ) {
					if (n.nextSibling) {
						n = n.nextSibling;
						break e;
					}
					n = n.parentNode;
				}
				n = void 0;
			}
			n = Lr(n);
		}
	}
	function Yr(e, t) {
		return e && t
			? e === t
				? true
				: e && e.nodeType === 3
					? false
					: t && t.nodeType === 3
						? Yr(e, t.parentNode)
						: 'contains' in e
							? e.contains(t)
							: e.compareDocumentPosition
								? !!(e.compareDocumentPosition(t) & 16)
								: false
			: false;
	}
	function Xr(e) {
		e =
			e != null &&
			e.ownerDocument != null &&
			e.ownerDocument.defaultView != null
				? e.ownerDocument.defaultView
				: window;
		for (var t = Sc(e.document); t instanceof e.HTMLIFrameElement; ) {
			try {
				var n = typeof t.contentWindow.location.href == 'string';
			} catch {
				n = false;
			}
			if (n) e = t.contentWindow;
			else break;
			t = Sc(e.document);
		}
		return t;
	}
	function il(e) {
		var t = e && e.nodeName && e.nodeName.toLowerCase();
		return (
			t &&
			((t === 'input' &&
				(e.type === 'text' ||
					e.type === 'search' ||
					e.type === 'tel' ||
					e.type === 'url' ||
					e.type === 'password')) ||
				t === 'textarea' ||
				e.contentEditable === 'true')
		);
	}
	var as = Mt && 'documentMode' in document && 11 >= document.documentMode,
		Jn = null,
		rl = null,
		Ba = null,
		fl = false;
	function Qr(e, t, n) {
		var u =
			n.window === n
				? n.document
				: n.nodeType === 9
					? n
					: n.ownerDocument;
		fl ||
			Jn == null ||
			Jn !== Sc(u) ||
			((u = Jn),
			'selectionStart' in u && il(u)
				? (u = { start: u.selectionStart, end: u.selectionEnd })
				: ((u = (
						(u.ownerDocument && u.ownerDocument.defaultView) ||
						window
					).getSelection()),
					(u = {
						anchorNode: u.anchorNode,
						anchorOffset: u.anchorOffset,
						focusNode: u.focusNode,
						focusOffset: u.focusOffset,
					})),
			(Ba && Na(Ba, u)) ||
				((Ba = u),
				(u = yu(rl, 'onSelect')),
				0 < u.length &&
					((t = new Mc('onSelect', 'select', null, t, n)),
					e.push({ event: t, listeners: u }),
					(t.target = Jn))));
	}
	function vn(e, t) {
		var n = {};
		return (
			(n[e.toLowerCase()] = t.toLowerCase()),
			(n['Webkit' + e] = 'webkit' + t),
			(n['Moz' + e] = 'moz' + t),
			n
		);
	}
	var kn = {
			animationend: vn('Animation', 'AnimationEnd'),
			animationiteration: vn('Animation', 'AnimationIteration'),
			animationstart: vn('Animation', 'AnimationStart'),
			transitionrun: vn('Transition', 'TransitionRun'),
			transitionstart: vn('Transition', 'TransitionStart'),
			transitioncancel: vn('Transition', 'TransitionCancel'),
			transitionend: vn('Transition', 'TransitionEnd'),
		},
		_l = {},
		Zr = {};
	Mt &&
		((Zr = document.createElement('div').style),
		'AnimationEvent' in window ||
			(delete kn.animationend.animation,
			delete kn.animationiteration.animation,
			delete kn.animationstart.animation),
		'TransitionEvent' in window || delete kn.transitionend.transition);
	function Sn(e) {
		if (_l[e]) return _l[e];
		if (!kn[e]) return e;
		var t = kn[e],
			n;
		for (n in t) if (t.hasOwnProperty(n) && n in Zr) return (_l[e] = t[n]);
		return e;
	}
	var Kr = Sn('animationend'),
		Wr = Sn('animationiteration'),
		Fr = Sn('animationstart'),
		cs = Sn('transitionrun'),
		us = Sn('transitionstart'),
		ls = Sn('transitioncancel'),
		Jr = Sn('transitionend'),
		kr = /* @__PURE__ */ new Map(),
		ol =
			'abort auxClick beforeToggle cancel canPlay canPlayThrough click close contextMenu copy cut drag dragEnd dragEnter dragExit dragLeave dragOver dragStart drop durationChange emptied encrypted ended error gotPointerCapture input invalid keyDown keyPress keyUp load loadedData loadedMetadata loadStart lostPointerCapture mouseDown mouseMove mouseOut mouseOver mouseUp paste pause play playing pointerCancel pointerDown pointerMove pointerOut pointerOver pointerUp progress rateChange reset resize seeked seeking stalled submit suspend timeUpdate touchCancel touchEnd touchStart volumeChange scroll toggle touchMove waiting wheel'.split(
				' ',
			);
	ol.push('scrollEnd');
	function dt(e, t) {
		kr.set(e, t), hn(t, [e]);
	}
	var zc =
			typeof reportError == 'function'
				? reportError
				: function (e) {
						if (
							typeof window == 'object' &&
							typeof window.ErrorEvent == 'function'
						) {
							var t = new window.ErrorEvent('error', {
								bubbles: true,
								cancelable: true,
								message:
									typeof e == 'object' &&
									e !== null &&
									typeof e.message == 'string'
										? String(e.message)
										: String(e),
								error: e,
							});
							if (!window.dispatchEvent(t)) return;
						} else if (
							typeof process == 'object' &&
							typeof process.emit == 'function'
						) {
							process.emit('uncaughtException', e);
							return;
						}
						console.error(e);
					},
		lt = [],
		In = 0,
		bl = 0;
	function Cc() {
		for (var e = In, t = (bl = In = 0); t < e; ) {
			var n = lt[t];
			lt[t++] = null;
			var u = lt[t];
			lt[t++] = null;
			var l = lt[t];
			lt[t++] = null;
			var i = lt[t];
			if (((lt[t++] = null), u !== null && l !== null)) {
				var _ = u.pending;
				_ === null ? (l.next = l) : ((l.next = _.next), (_.next = l)),
					(u.pending = l);
			}
			i !== 0 && Ir(n, l, i);
		}
	}
	function Hc(e, t, n, u) {
		(lt[In++] = e),
			(lt[In++] = t),
			(lt[In++] = n),
			(lt[In++] = u),
			(bl |= u),
			(e.lanes |= u),
			(e = e.alternate),
			e !== null && (e.lanes |= u);
	}
	function sl(e, t, n, u) {
		return Hc(e, t, n, u), Uc(e);
	}
	function xn(e, t) {
		return Hc(e, null, null, t), Uc(e);
	}
	function Ir(e, t, n) {
		e.lanes |= n;
		var u = e.alternate;
		u !== null && (u.lanes |= n);
		for (var l = false, i = e.return; i !== null; )
			(i.childLanes |= n),
				(u = i.alternate),
				u !== null && (u.childLanes |= n),
				i.tag === 22 &&
					((e = i.stateNode),
					e === null || e._visibility & 1 || (l = true)),
				(e = i),
				(i = i.return);
		return e.tag === 3
			? ((i = e.stateNode),
				l &&
					t !== null &&
					((l = 31 - Je(n)),
					(e = i.hiddenUpdates),
					(u = e[l]),
					u === null ? (e[l] = [t]) : u.push(t),
					(t.lane = n | 536870912)),
				i)
			: null;
	}
	function Uc(e) {
		if (50 < uc) throw ((uc = 0), (wi = null), Error(f(185)));
		for (var t = e.return; t !== null; ) (e = t), (t = e.return);
		return e.tag === 3 ? e.stateNode : null;
	}
	var $n = {};
	function is(e, t, n, u) {
		(this.tag = e),
			(this.key = n),
			(this.sibling =
				this.child =
				this.return =
				this.stateNode =
				this.type =
				this.elementType =
					null),
			(this.index = 0),
			(this.refCleanup = this.ref = null),
			(this.pendingProps = t),
			(this.dependencies =
				this.memoizedState =
				this.updateQueue =
				this.memoizedProps =
					null),
			(this.mode = u),
			(this.subtreeFlags = this.flags = 0),
			(this.deletions = null),
			(this.childLanes = this.lanes = 0),
			(this.alternate = null);
	}
	function Ie(e, t, n, u) {
		return new is(e, t, n, u);
	}
	function gl(e) {
		return (e = e.prototype), !(!e || !e.isReactComponent);
	}
	function Dt(e, t) {
		var n = e.alternate;
		return (
			n === null
				? ((n = Ie(e.tag, t, e.key, e.mode)),
					(n.elementType = e.elementType),
					(n.type = e.type),
					(n.stateNode = e.stateNode),
					(n.alternate = e),
					(e.alternate = n))
				: ((n.pendingProps = t),
					(n.type = e.type),
					(n.flags = 0),
					(n.subtreeFlags = 0),
					(n.deletions = null)),
			(n.flags = e.flags & 65011712),
			(n.childLanes = e.childLanes),
			(n.lanes = e.lanes),
			(n.child = e.child),
			(n.memoizedProps = e.memoizedProps),
			(n.memoizedState = e.memoizedState),
			(n.updateQueue = e.updateQueue),
			(t = e.dependencies),
			(n.dependencies =
				t === null
					? null
					: { lanes: t.lanes, firstContext: t.firstContext }),
			(n.sibling = e.sibling),
			(n.index = e.index),
			(n.ref = e.ref),
			(n.refCleanup = e.refCleanup),
			n
		);
	}
	function $r(e, t) {
		e.flags &= 65011714;
		var n = e.alternate;
		return (
			n === null
				? ((e.childLanes = 0),
					(e.lanes = t),
					(e.child = null),
					(e.subtreeFlags = 0),
					(e.memoizedProps = null),
					(e.memoizedState = null),
					(e.updateQueue = null),
					(e.dependencies = null),
					(e.stateNode = null))
				: ((e.childLanes = n.childLanes),
					(e.lanes = n.lanes),
					(e.child = n.child),
					(e.subtreeFlags = 0),
					(e.deletions = null),
					(e.memoizedProps = n.memoizedProps),
					(e.memoizedState = n.memoizedState),
					(e.updateQueue = n.updateQueue),
					(e.type = n.type),
					(t = n.dependencies),
					(e.dependencies =
						t === null
							? null
							: {
									lanes: t.lanes,
									firstContext: t.firstContext,
								})),
			e
		);
	}
	function Nc(e, t, n, u, l, i) {
		var _ = 0;
		if (((u = e), typeof e == 'function')) gl(e) && (_ = 1);
		else if (typeof e == 'string')
			_ = bg(e, n, U.current)
				? 26
				: e === 'html' || e === 'head' || e === 'body'
					? 27
					: 5;
		else
			e: switch (e) {
				case yt:
					return (
						(e = Ie(31, n, t, l)),
						(e.elementType = yt),
						(e.lanes = i),
						e
					);
				case Ce:
					return En(n.children, l, i, t);
				case xt:
					(_ = 8), (l |= 24);
					break;
				case Ke:
					return (
						(e = Ie(12, n, t, l | 2)),
						(e.elementType = Ke),
						(e.lanes = i),
						e
					);
				case pt:
					return (
						(e = Ie(13, n, t, l)),
						(e.elementType = pt),
						(e.lanes = i),
						e
					);
				case Ne:
					return (
						(e = Ie(19, n, t, l)),
						(e.elementType = Ne),
						(e.lanes = i),
						e
					);
				default:
					if (typeof e == 'object' && e !== null)
						switch (e.$$typeof) {
							case Re:
								_ = 10;
								break e;
							case Zt:
								_ = 9;
								break e;
							case at:
								_ = 11;
								break e;
							case J:
								_ = 14;
								break e;
							case Be:
								(_ = 16), (u = null);
								break e;
						}
					(_ = 29),
						(n = Error(f(130, e === null ? 'null' : typeof e, ''))),
						(u = null);
			}
		return (
			(t = Ie(_, n, t, l)),
			(t.elementType = e),
			(t.type = u),
			(t.lanes = i),
			t
		);
	}
	function En(e, t, n, u) {
		return (e = Ie(7, e, u, t)), (e.lanes = n), e;
	}
	function dl(e, t, n) {
		return (e = Ie(6, e, null, t)), (e.lanes = n), e;
	}
	function Pr(e) {
		var t = Ie(18, null, null, 0);
		return (t.stateNode = e), t;
	}
	function ml(e, t, n) {
		return (
			(t = Ie(4, e.children !== null ? e.children : [], e.key, t)),
			(t.lanes = n),
			(t.stateNode = {
				containerInfo: e.containerInfo,
				pendingChildren: null,
				implementation: e.implementation,
			}),
			t
		);
	}
	var ef = /* @__PURE__ */ new WeakMap();
	function it(e, t) {
		if (typeof e == 'object' && e !== null) {
			var n = ef.get(e);
			return n !== void 0
				? n
				: ((t = { value: e, source: t, stack: Pi(t) }),
					ef.set(e, t),
					t);
		}
		return { value: e, source: t, stack: Pi(t) };
	}
	var Pn = [],
		ea = 0,
		Bc = null,
		Ga = 0,
		rt = [],
		ft = 0,
		Jt = null,
		ht = 1,
		wt = '';
	function Rt(e, t) {
		(Pn[ea++] = Ga), (Pn[ea++] = Bc), (Bc = e), (Ga = t);
	}
	function tf(e, t, n) {
		(rt[ft++] = ht), (rt[ft++] = wt), (rt[ft++] = Jt), (Jt = e);
		var u = ht;
		e = wt;
		var l = 32 - Je(u) - 1;
		(u &= ~(1 << l)), (n += 1);
		var i = 32 - Je(t) + l;
		if (30 < i) {
			var _ = l - (l % 5);
			(i = (u & ((1 << _) - 1)).toString(32)),
				(u >>= _),
				(l -= _),
				(ht = (1 << (32 - Je(t) + l)) | (n << l) | u),
				(wt = i + e);
		} else (ht = (1 << i) | (n << l) | u), (wt = e);
	}
	function Ol(e) {
		e.return !== null && (Rt(e, 1), tf(e, 1, 0));
	}
	function pl(e) {
		for (; e === Bc; )
			(Bc = Pn[--ea]), (Pn[ea] = null), (Ga = Pn[--ea]), (Pn[ea] = null);
		for (; e === Jt; )
			(Jt = rt[--ft]),
				(rt[ft] = null),
				(wt = rt[--ft]),
				(rt[ft] = null),
				(ht = rt[--ft]),
				(rt[ft] = null);
	}
	function nf(e, t) {
		(rt[ft++] = ht),
			(rt[ft++] = wt),
			(rt[ft++] = Jt),
			(ht = t.id),
			(wt = t.overflow),
			(Jt = e);
	}
	var Ee = null,
		_e = null,
		k = false,
		kt = null,
		_t = false,
		yl = Error(f(519));
	function It(e) {
		var t = Error(
			f(
				418,
				1 < arguments.length && arguments[1] !== void 0 && arguments[1]
					? 'text'
					: 'HTML',
				'',
			),
		);
		throw (qa(it(t, e)), yl);
	}
	function af(e) {
		var t = e.stateNode,
			n = e.type,
			u = e.memoizedProps;
		switch (((t[xe] = e), (t[qe] = u), n)) {
			case 'dialog':
				K('cancel', t), K('close', t);
				break;
			case 'iframe':
			case 'object':
			case 'embed':
				K('load', t);
				break;
			case 'video':
			case 'audio':
				for (n = 0; n < ic.length; n++) K(ic[n], t);
				break;
			case 'source':
				K('error', t);
				break;
			case 'img':
			case 'image':
			case 'link':
				K('error', t), K('load', t);
				break;
			case 'details':
				K('toggle', t);
				break;
			case 'input':
				K('invalid', t),
					mr(
						t,
						u.value,
						u.defaultValue,
						u.checked,
						u.defaultChecked,
						u.type,
						u.name,
						true,
					);
				break;
			case 'select':
				K('invalid', t);
				break;
			case 'textarea':
				K('invalid', t), pr(t, u.value, u.defaultValue, u.children);
		}
		(n = u.children),
			(typeof n != 'string' &&
				typeof n != 'number' &&
				typeof n != 'bigint') ||
			t.textContent === '' + n ||
			u.suppressHydrationWarning === true ||
			wo(t.textContent, n)
				? (u.popover != null && (K('beforetoggle', t), K('toggle', t)),
					u.onScroll != null && K('scroll', t),
					u.onScrollEnd != null && K('scrollend', t),
					u.onClick != null && (t.onclick = Tt),
					(t = true))
				: (t = false),
			t || It(e, true);
	}
	function cf(e) {
		for (Ee = e.return; Ee; )
			switch (Ee.tag) {
				case 5:
				case 31:
				case 13:
					_t = false;
					return;
				case 27:
				case 3:
					_t = true;
					return;
				default:
					Ee = Ee.return;
			}
	}
	function ta(e) {
		if (e !== Ee) return false;
		if (!k) return cf(e), (k = true), false;
		var t = e.tag,
			n;
		if (
			((n = t !== 3 && t !== 27) &&
				((n = t === 5) &&
					((n = e.type),
					(n =
						!(n !== 'form' && n !== 'button') ||
						Bi(e.type, e.memoizedProps))),
				(n = !n)),
			n && _e && It(e),
			cf(e),
			t === 13)
		) {
			if (
				((e = e.memoizedState),
				(e = e !== null ? e.dehydrated : null),
				!e)
			)
				throw Error(f(317));
			_e = Ro(e);
		} else if (t === 31) {
			if (
				((e = e.memoizedState),
				(e = e !== null ? e.dehydrated : null),
				!e)
			)
				throw Error(f(317));
			_e = Ro(e);
		} else
			t === 27
				? ((t = _e),
					bn(e.type) ? ((e = Yi), (Yi = null), (_e = e)) : (_e = t))
				: (_e = Ee ? bt(e.stateNode.nextSibling) : null);
		return true;
	}
	function An() {
		(_e = Ee = null), (k = false);
	}
	function jl() {
		var e = kt;
		return (
			e !== null &&
				(Qe === null ? (Qe = e) : Qe.push.apply(Qe, e), (kt = null)),
			e
		);
	}
	function qa(e) {
		kt === null ? (kt = [e]) : kt.push(e);
	}
	var hl = m(null),
		Tn = null,
		zt = null;
	function $t(e, t, n) {
		z(hl, t._currentValue), (t._currentValue = n);
	}
	function Ct(e) {
		(e._currentValue = hl.current), D(hl);
	}
	function wl(e, t, n) {
		for (; e !== null; ) {
			var u = e.alternate;
			if (
				((e.childLanes & t) !== t
					? ((e.childLanes |= t), u !== null && (u.childLanes |= t))
					: u !== null &&
						(u.childLanes & t) !== t &&
						(u.childLanes |= t),
				e === n)
			)
				break;
			e = e.return;
		}
	}
	function vl(e, t, n, u) {
		var l = e.child;
		for (l !== null && (l.return = e); l !== null; ) {
			var i = l.dependencies;
			if (i !== null) {
				var _ = l.child;
				i = i.firstContext;
				e: for (; i !== null; ) {
					var b = i;
					i = l;
					for (var s = 0; s < t.length; s++)
						if (b.context === t[s]) {
							(i.lanes |= n),
								(b = i.alternate),
								b !== null && (b.lanes |= n),
								wl(i.return, n, e),
								u || (_ = null);
							break e;
						}
					i = b.next;
				}
			} else if (l.tag === 18) {
				if (((_ = l.return), _ === null)) throw Error(f(341));
				(_.lanes |= n),
					(i = _.alternate),
					i !== null && (i.lanes |= n),
					wl(_, n, e),
					(_ = null);
			} else _ = l.child;
			if (_ !== null) _.return = l;
			else
				for (_ = l; _ !== null; ) {
					if (_ === e) {
						_ = null;
						break;
					}
					if (((l = _.sibling), l !== null)) {
						(l.return = _.return), (_ = l);
						break;
					}
					_ = _.return;
				}
			l = _;
		}
	}
	function na(e, t, n, u) {
		e = null;
		for (var l = t, i = false; l !== null; ) {
			if (!i) {
				if ((l.flags & 524288) !== 0) i = true;
				else if ((l.flags & 262144) !== 0) break;
			}
			if (l.tag === 10) {
				var _ = l.alternate;
				if (_ === null) throw Error(f(387));
				if (((_ = _.memoizedProps), _ !== null)) {
					var b = l.type;
					ke(l.pendingProps.value, _.value) ||
						(e !== null ? e.push(b) : (e = [b]));
				}
			} else if (l === te.current) {
				if (((_ = l.alternate), _ === null)) throw Error(f(387));
				_.memoizedState.memoizedState !==
					l.memoizedState.memoizedState &&
					(e !== null ? e.push(bc) : (e = [bc]));
			}
			l = l.return;
		}
		e !== null && vl(t, e, n, u), (t.flags |= 262144);
	}
	function Gc(e) {
		for (e = e.firstContext; e !== null; ) {
			if (!ke(e.context._currentValue, e.memoizedValue)) return true;
			e = e.next;
		}
		return false;
	}
	function Mn(e) {
		(Tn = e),
			(zt = null),
			(e = e.dependencies),
			e !== null && (e.firstContext = null);
	}
	function Ae(e) {
		return uf(Tn, e);
	}
	function qc(e, t) {
		return Tn === null && Mn(e), uf(e, t);
	}
	function uf(e, t) {
		var n = t._currentValue;
		if (((t = { context: t, memoizedValue: n, next: null }), zt === null)) {
			if (e === null) throw Error(f(308));
			(zt = t),
				(e.dependencies = { lanes: 0, firstContext: t }),
				(e.flags |= 524288);
		} else zt = zt.next = t;
		return n;
	}
	var rs =
			typeof AbortController < 'u'
				? AbortController
				: function () {
						var e = [],
							t = (this.signal = {
								aborted: false,
								addEventListener: function (n, u) {
									e.push(u);
								},
							});
						this.abort = function () {
							(t.aborted = true),
								e.forEach(function (n) {
									return n();
								});
						};
					},
		fs = a.unstable_scheduleCallback,
		_s = a.unstable_NormalPriority,
		pe = {
			$$typeof: Re,
			Consumer: null,
			Provider: null,
			_currentValue: null,
			_currentValue2: null,
			_threadCount: 0,
		};
	function Sl() {
		return {
			controller: new rs(),
			data: /* @__PURE__ */ new Map(),
			refCount: 0,
		};
	}
	function La(e) {
		e.refCount--,
			e.refCount === 0 &&
				fs(_s, function () {
					e.controller.abort();
				});
	}
	var Va = null,
		xl = 0,
		aa = 0,
		ca = null;
	function os(e, t) {
		if (Va === null) {
			var n = (Va = []);
			(xl = 0),
				(aa = Ti()),
				(ca = {
					status: 'pending',
					value: void 0,
					then: function (u) {
						n.push(u);
					},
				});
		}
		return xl++, t.then(lf, lf), t;
	}
	function lf() {
		if (--xl === 0 && Va !== null) {
			ca !== null && (ca.status = 'fulfilled');
			var e = Va;
			(Va = null), (aa = 0), (ca = null);
			for (var t = 0; t < e.length; t++) (0, e[t])();
		}
	}
	function bs(e, t) {
		var n = [],
			u = {
				status: 'pending',
				value: null,
				reason: null,
				then: function (l) {
					n.push(l);
				},
			};
		return (
			e.then(
				function () {
					(u.status = 'fulfilled'), (u.value = t);
					for (var l = 0; l < n.length; l++) (0, n[l])(t);
				},
				function (l) {
					for (
						u.status = 'rejected', u.reason = l, l = 0;
						l < n.length;
						l++
					)
						(0, n[l])(void 0);
				},
			),
			u
		);
	}
	var rf = E.S;
	E.S = function (e, t) {
		(Z_ = We()),
			typeof t == 'object' &&
				t !== null &&
				typeof t.then == 'function' &&
				os(e, t),
			rf !== null && rf(e, t);
	};
	var Dn = m(null);
	function El() {
		var e = Dn.current;
		return e !== null ? e : fe.pooledCache;
	}
	function Lc(e, t) {
		t === null ? z(Dn, Dn.current) : z(Dn, t.pool);
	}
	function ff() {
		var e = El();
		return e === null ? null : { parent: pe._currentValue, pool: e };
	}
	var ua = Error(f(460)),
		Al = Error(f(474)),
		Vc = Error(f(542)),
		Yc = { then: function () {} };
	function _f(e) {
		return (e = e.status), e === 'fulfilled' || e === 'rejected';
	}
	function of(e, t, n) {
		switch (
			((n = e[n]),
			n === void 0 ? e.push(t) : n !== t && (t.then(Tt, Tt), (t = n)),
			t.status)
		) {
			case 'fulfilled':
				return t.value;
			case 'rejected':
				throw ((e = t.reason), sf(e), e);
			default:
				if (typeof t.status == 'string') t.then(Tt, Tt);
				else {
					if (((e = fe), e !== null && 100 < e.shellSuspendCounter))
						throw Error(f(482));
					(e = t),
						(e.status = 'pending'),
						e.then(
							function (u) {
								if (t.status === 'pending') {
									var l = t;
									(l.status = 'fulfilled'), (l.value = u);
								}
							},
							function (u) {
								if (t.status === 'pending') {
									var l = t;
									(l.status = 'rejected'), (l.reason = u);
								}
							},
						);
				}
				switch (t.status) {
					case 'fulfilled':
						return t.value;
					case 'rejected':
						throw ((e = t.reason), sf(e), e);
				}
				throw ((zn = t), ua);
		}
	}
	function Rn(e) {
		try {
			var t = e._init;
			return t(e._payload);
		} catch (n) {
			throw n !== null &&
				typeof n == 'object' &&
				typeof n.then == 'function'
				? ((zn = n), ua)
				: n;
		}
	}
	var zn = null;
	function bf() {
		if (zn === null) throw Error(f(459));
		var e = zn;
		return (zn = null), e;
	}
	function sf(e) {
		if (e === ua || e === Vc) throw Error(f(483));
	}
	var la = null,
		Ya = 0;
	function Xc(e) {
		var t = Ya;
		return (Ya += 1), la === null && (la = []), of(la, e, t);
	}
	function Xa(e, t) {
		(t = t.props.ref), (e.ref = t !== void 0 ? t : null);
	}
	function Qc(e, t) {
		throw t.$$typeof === I
			? Error(f(525))
			: ((e = Object.prototype.toString.call(t)),
				Error(
					f(
						31,
						e === '[object Object]'
							? 'object with keys {' +
									Object.keys(t).join(', ') +
									'}'
							: e,
					),
				));
	}
	function gf(e) {
		function t(O, d) {
			if (e) {
				var y = O.deletions;
				y === null ? ((O.deletions = [d]), (O.flags |= 16)) : y.push(d);
			}
		}
		function n(O, d) {
			if (!e) return null;
			for (; d !== null; ) t(O, d), (d = d.sibling);
			return null;
		}
		function u(O) {
			for (var d = /* @__PURE__ */ new Map(); O !== null; )
				O.key !== null ? d.set(O.key, O) : d.set(O.index, O),
					(O = O.sibling);
			return d;
		}
		function l(O, d) {
			return (O = Dt(O, d)), (O.index = 0), (O.sibling = null), O;
		}
		function i(O, d, y) {
			return (
				(O.index = y),
				e
					? ((y = O.alternate),
						y !== null
							? ((y = y.index),
								y < d ? ((O.flags |= 67108866), d) : y)
							: ((O.flags |= 67108866), d))
					: ((O.flags |= 1048576), d)
			);
		}
		function _(O) {
			return e && O.alternate === null && (O.flags |= 67108866), O;
		}
		function b(O, d, y, A) {
			return d === null || d.tag !== 6
				? ((d = dl(y, O.mode, A)), (d.return = O), d)
				: ((d = l(d, y)), (d.return = O), d);
		}
		function s(O, d, y, A) {
			var G = y.type;
			return G === Ce
				? x(O, d, y.props.children, A, y.key)
				: d !== null &&
					  (d.elementType === G ||
							(typeof G == 'object' &&
								G !== null &&
								G.$$typeof === Be &&
								Rn(G) === d.type))
					? ((d = l(d, y.props)), Xa(d, y), (d.return = O), d)
					: ((d = Nc(y.type, y.key, y.props, null, O.mode, A)),
						Xa(d, y),
						(d.return = O),
						d);
		}
		function j(O, d, y, A) {
			return d === null ||
				d.tag !== 4 ||
				d.stateNode.containerInfo !== y.containerInfo ||
				d.stateNode.implementation !== y.implementation
				? ((d = ml(y, O.mode, A)), (d.return = O), d)
				: ((d = l(d, y.children || [])), (d.return = O), d);
		}
		function x(O, d, y, A, G) {
			return d === null || d.tag !== 7
				? ((d = En(y, O.mode, A, G)), (d.return = O), d)
				: ((d = l(d, y)), (d.return = O), d);
		}
		function M(O, d, y) {
			if (
				(typeof d == 'string' && d !== '') ||
				typeof d == 'number' ||
				typeof d == 'bigint'
			)
				return (d = dl('' + d, O.mode, y)), (d.return = O), d;
			if (typeof d == 'object' && d !== null) {
				switch (d.$$typeof) {
					case ze:
						return (
							(y = Nc(d.type, d.key, d.props, null, O.mode, y)),
							Xa(y, d),
							(y.return = O),
							y
						);
					case De:
						return (d = ml(d, O.mode, y)), (d.return = O), d;
					case Be:
						return (d = Rn(d)), M(O, d, y);
				}
				if (gt(d) || Ge(d))
					return (d = En(d, O.mode, y, null)), (d.return = O), d;
				if (typeof d.then == 'function') return M(O, Xc(d), y);
				if (d.$$typeof === Re) return M(O, qc(O, d), y);
				Qc(O, d);
			}
			return null;
		}
		function h(O, d, y, A) {
			var G = d !== null ? d.key : null;
			if (
				(typeof y == 'string' && y !== '') ||
				typeof y == 'number' ||
				typeof y == 'bigint'
			)
				return G !== null ? null : b(O, d, '' + y, A);
			if (typeof y == 'object' && y !== null) {
				switch (y.$$typeof) {
					case ze:
						return y.key === G ? s(O, d, y, A) : null;
					case De:
						return y.key === G ? j(O, d, y, A) : null;
					case Be:
						return (y = Rn(y)), h(O, d, y, A);
				}
				if (gt(y) || Ge(y))
					return G !== null ? null : x(O, d, y, A, null);
				if (typeof y.then == 'function') return h(O, d, Xc(y), A);
				if (y.$$typeof === Re) return h(O, d, qc(O, y), A);
				Qc(O, y);
			}
			return null;
		}
		function v(O, d, y, A, G) {
			if (
				(typeof A == 'string' && A !== '') ||
				typeof A == 'number' ||
				typeof A == 'bigint'
			)
				return (O = O.get(y) || null), b(d, O, '' + A, G);
			if (typeof A == 'object' && A !== null) {
				switch (A.$$typeof) {
					case ze:
						return (
							(O = O.get(A.key === null ? y : A.key) || null),
							s(d, O, A, G)
						);
					case De:
						return (
							(O = O.get(A.key === null ? y : A.key) || null),
							j(d, O, A, G)
						);
					case Be:
						return (A = Rn(A)), v(O, d, y, A, G);
				}
				if (gt(A) || Ge(A))
					return (O = O.get(y) || null), x(d, O, A, G, null);
				if (typeof A.then == 'function') return v(O, d, y, Xc(A), G);
				if (A.$$typeof === Re) return v(O, d, y, qc(d, A), G);
				Qc(d, A);
			}
			return null;
		}
		function H(O, d, y, A) {
			for (
				var G = null, $ = null, B = d, X = (d = 0), F = null;
				B !== null && X < y.length;
				X++
			) {
				B.index > X ? ((F = B), (B = null)) : (F = B.sibling);
				var P = h(O, B, y[X], A);
				if (P === null) {
					B === null && (B = F);
					break;
				}
				e && B && P.alternate === null && t(O, B),
					(d = i(P, d, X)),
					$ === null ? (G = P) : ($.sibling = P),
					($ = P),
					(B = F);
			}
			if (X === y.length) return n(O, B), k && Rt(O, X), G;
			if (B === null) {
				for (; X < y.length; X++)
					(B = M(O, y[X], A)),
						B !== null &&
							((d = i(B, d, X)),
							$ === null ? (G = B) : ($.sibling = B),
							($ = B));
				return k && Rt(O, X), G;
			}
			for (B = u(B); X < y.length; X++)
				(F = v(B, O, X, y[X], A)),
					F !== null &&
						(e &&
							F.alternate !== null &&
							B.delete(F.key === null ? X : F.key),
						(d = i(F, d, X)),
						$ === null ? (G = F) : ($.sibling = F),
						($ = F));
			return (
				e &&
					B.forEach(function (On) {
						return t(O, On);
					}),
				k && Rt(O, X),
				G
			);
		}
		function q(O, d, y, A) {
			if (y == null) throw Error(f(151));
			for (
				var G = null,
					$ = null,
					B = d,
					X = (d = 0),
					F = null,
					P = y.next();
				B !== null && !P.done;
				X++, P = y.next()
			) {
				B.index > X ? ((F = B), (B = null)) : (F = B.sibling);
				var On = h(O, B, P.value, A);
				if (On === null) {
					B === null && (B = F);
					break;
				}
				e && B && On.alternate === null && t(O, B),
					(d = i(On, d, X)),
					$ === null ? (G = On) : ($.sibling = On),
					($ = On),
					(B = F);
			}
			if (P.done) return n(O, B), k && Rt(O, X), G;
			if (B === null) {
				for (; !P.done; X++, P = y.next())
					(P = M(O, P.value, A)),
						P !== null &&
							((d = i(P, d, X)),
							$ === null ? (G = P) : ($.sibling = P),
							($ = P));
				return k && Rt(O, X), G;
			}
			for (B = u(B); !P.done; X++, P = y.next())
				(P = v(B, O, X, P.value, A)),
					P !== null &&
						(e &&
							P.alternate !== null &&
							B.delete(P.key === null ? X : P.key),
						(d = i(P, d, X)),
						$ === null ? (G = P) : ($.sibling = P),
						($ = P));
			return (
				e &&
					B.forEach(function (vg) {
						return t(O, vg);
					}),
				k && Rt(O, X),
				G
			);
		}
		function ie(O, d, y, A) {
			if (
				(typeof y == 'object' &&
					y !== null &&
					y.type === Ce &&
					y.key === null &&
					(y = y.props.children),
				typeof y == 'object' && y !== null)
			) {
				switch (y.$$typeof) {
					case ze:
						e: {
							for (var G = y.key; d !== null; ) {
								if (d.key === G) {
									if (((G = y.type), G === Ce)) {
										if (d.tag === 7) {
											n(O, d.sibling),
												(A = l(d, y.props.children)),
												(A.return = O),
												(O = A);
											break e;
										}
									} else if (
										d.elementType === G ||
										(typeof G == 'object' &&
											G !== null &&
											G.$$typeof === Be &&
											Rn(G) === d.type)
									) {
										n(O, d.sibling),
											(A = l(d, y.props)),
											Xa(A, y),
											(A.return = O),
											(O = A);
										break e;
									}
									n(O, d);
									break;
								} else t(O, d);
								d = d.sibling;
							}
							y.type === Ce
								? ((A = En(y.props.children, O.mode, A, y.key)),
									(A.return = O),
									(O = A))
								: ((A = Nc(
										y.type,
										y.key,
										y.props,
										null,
										O.mode,
										A,
									)),
									Xa(A, y),
									(A.return = O),
									(O = A));
						}
						return _(O);
					case De:
						e: {
							for (G = y.key; d !== null; ) {
								if (d.key === G)
									if (
										d.tag === 4 &&
										d.stateNode.containerInfo ===
											y.containerInfo &&
										d.stateNode.implementation ===
											y.implementation
									) {
										n(O, d.sibling),
											(A = l(d, y.children || [])),
											(A.return = O),
											(O = A);
										break e;
									} else {
										n(O, d);
										break;
									}
								else t(O, d);
								d = d.sibling;
							}
							(A = ml(y, O.mode, A)), (A.return = O), (O = A);
						}
						return _(O);
					case Be:
						return (y = Rn(y)), ie(O, d, y, A);
				}
				if (gt(y)) return H(O, d, y, A);
				if (Ge(y)) {
					if (((G = Ge(y)), typeof G != 'function'))
						throw Error(f(150));
					return (y = G.call(y)), q(O, d, y, A);
				}
				if (typeof y.then == 'function') return ie(O, d, Xc(y), A);
				if (y.$$typeof === Re) return ie(O, d, qc(O, y), A);
				Qc(O, y);
			}
			return (typeof y == 'string' && y !== '') ||
				typeof y == 'number' ||
				typeof y == 'bigint'
				? ((y = '' + y),
					d !== null && d.tag === 6
						? (n(O, d.sibling),
							(A = l(d, y)),
							(A.return = O),
							(O = A))
						: (n(O, d),
							(A = dl(y, O.mode, A)),
							(A.return = O),
							(O = A)),
					_(O))
				: n(O, d);
		}
		return function (O, d, y, A) {
			try {
				Ya = 0;
				var G = ie(O, d, y, A);
				return (la = null), G;
			} catch (B) {
				if (B === ua || B === Vc) throw B;
				var $ = Ie(29, B, null, O.mode);
				return ($.lanes = A), ($.return = O), $;
			} finally {
			}
		};
	}
	var Cn = gf(true),
		df = gf(false),
		Pt = false;
	function Tl(e) {
		e.updateQueue = {
			baseState: e.memoizedState,
			firstBaseUpdate: null,
			lastBaseUpdate: null,
			shared: { pending: null, lanes: 0, hiddenCallbacks: null },
			callbacks: null,
		};
	}
	function Ml(e, t) {
		(e = e.updateQueue),
			t.updateQueue === e &&
				(t.updateQueue = {
					baseState: e.baseState,
					firstBaseUpdate: e.firstBaseUpdate,
					lastBaseUpdate: e.lastBaseUpdate,
					shared: e.shared,
					callbacks: null,
				});
	}
	function en(e) {
		return { lane: e, tag: 0, payload: null, callback: null, next: null };
	}
	function tn(e, t, n) {
		var u = e.updateQueue;
		if (u === null) return null;
		if (((u = u.shared), (ee & 2) !== 0)) {
			var l = u.pending;
			return (
				l === null ? (t.next = t) : ((t.next = l.next), (l.next = t)),
				(u.pending = t),
				(t = Uc(e)),
				Ir(e, null, n),
				t
			);
		}
		return Hc(e, u, t, n), Uc(e);
	}
	function Qa(e, t, n) {
		if (
			((t = t.updateQueue),
			t !== null && ((t = t.shared), (n & 4194048) !== 0))
		) {
			var u = t.lanes;
			(u &= e.pendingLanes), (n |= u), (t.lanes = n), ur(e, n);
		}
	}
	function Dl(e, t) {
		var n = e.updateQueue,
			u = e.alternate;
		if (u !== null && ((u = u.updateQueue), n === u)) {
			var l = null,
				i = null;
			if (((n = n.firstBaseUpdate), n !== null)) {
				do {
					var _ = {
						lane: n.lane,
						tag: n.tag,
						payload: n.payload,
						callback: null,
						next: null,
					};
					i === null ? (l = i = _) : (i = i.next = _), (n = n.next);
				} while (n !== null);
				i === null ? (l = i = t) : (i = i.next = t);
			} else l = i = t;
			(n = {
				baseState: u.baseState,
				firstBaseUpdate: l,
				lastBaseUpdate: i,
				shared: u.shared,
				callbacks: u.callbacks,
			}),
				(e.updateQueue = n);
			return;
		}
		(e = n.lastBaseUpdate),
			e === null ? (n.firstBaseUpdate = t) : (e.next = t),
			(n.lastBaseUpdate = t);
	}
	var Rl = false;
	function Za() {
		if (Rl) {
			var e = ca;
			if (e !== null) throw e;
		}
	}
	function Ka(e, t, n, u) {
		Rl = false;
		var l = e.updateQueue;
		Pt = false;
		var i = l.firstBaseUpdate,
			_ = l.lastBaseUpdate,
			b = l.shared.pending;
		if (b !== null) {
			l.shared.pending = null;
			var s = b,
				j = s.next;
			(s.next = null), _ === null ? (i = j) : (_.next = j), (_ = s);
			var x = e.alternate;
			x !== null &&
				((x = x.updateQueue),
				(b = x.lastBaseUpdate),
				b !== _ &&
					(b === null ? (x.firstBaseUpdate = j) : (b.next = j),
					(x.lastBaseUpdate = s)));
		}
		if (i !== null) {
			var M = l.baseState;
			(_ = 0), (x = j = s = null), (b = i);
			do {
				var h = b.lane & -536870913,
					v = h !== b.lane;
				if (v ? (W & h) === h : (u & h) === h) {
					h !== 0 && h === aa && (Rl = true),
						x !== null &&
							(x = x.next =
								{
									lane: 0,
									tag: b.tag,
									payload: b.payload,
									callback: null,
									next: null,
								});
					e: {
						var H = e,
							q = b;
						h = t;
						var ie = n;
						switch (q.tag) {
							case 1:
								if (((H = q.payload), typeof H == 'function')) {
									M = H.call(ie, M, h);
									break e;
								}
								M = H;
								break e;
							case 3:
								H.flags = (H.flags & -65537) | 128;
							case 0:
								if (
									((H = q.payload),
									(h =
										typeof H == 'function'
											? H.call(ie, M, h)
											: H),
									h == null)
								)
									break e;
								M = C({}, M, h);
								break e;
							case 2:
								Pt = true;
						}
					}
					(h = b.callback),
						h !== null &&
							((e.flags |= 64),
							v && (e.flags |= 8192),
							(v = l.callbacks),
							v === null ? (l.callbacks = [h]) : v.push(h));
				} else
					(v = {
						lane: h,
						tag: b.tag,
						payload: b.payload,
						callback: b.callback,
						next: null,
					}),
						x === null ? ((j = x = v), (s = M)) : (x = x.next = v),
						(_ |= h);
				if (((b = b.next), b === null)) {
					if (((b = l.shared.pending), b === null)) break;
					(v = b),
						(b = v.next),
						(v.next = null),
						(l.lastBaseUpdate = v),
						(l.shared.pending = null);
				}
			} while (true);
			x === null && (s = M),
				(l.baseState = s),
				(l.firstBaseUpdate = j),
				(l.lastBaseUpdate = x),
				i === null && (l.shared.lanes = 0),
				(ln |= _),
				(e.lanes = _),
				(e.memoizedState = M);
		}
	}
	function mf(e, t) {
		if (typeof e != 'function') throw Error(f(191, e));
		e.call(t);
	}
	function Of(e, t) {
		var n = e.callbacks;
		if (n !== null)
			for (e.callbacks = null, e = 0; e < n.length; e++) mf(n[e], t);
	}
	var ia = m(null),
		Zc = m(0);
	function pf(e, t) {
		(e = Yt), z(Zc, e), z(ia, t), (Yt = e | t.baseLanes);
	}
	function zl() {
		z(Zc, Yt), z(ia, ia.current);
	}
	function Cl() {
		(Yt = Zc.current), D(ia), D(Zc);
	}
	var $e = m(null),
		ot = null;
	function nn(e) {
		var t = e.alternate;
		z(me, me.current & 1),
			z($e, e),
			ot === null &&
				(t === null ||
					ia.current !== null ||
					t.memoizedState !== null) &&
				(ot = e);
	}
	function Hl(e) {
		z(me, me.current), z($e, e), ot === null && (ot = e);
	}
	function yf(e) {
		e.tag === 22
			? (z(me, me.current), z($e, e), ot === null && (ot = e))
			: an();
	}
	function an() {
		z(me, me.current), z($e, $e.current);
	}
	function Pe(e) {
		D($e), ot === e && (ot = null), D(me);
	}
	var me = m(0);
	function Kc(e) {
		for (var t = e; t !== null; ) {
			if (t.tag === 13) {
				var n = t.memoizedState;
				if (
					n !== null &&
					((n = n.dehydrated), n === null || Li(n) || Vi(n))
				)
					return t;
			} else if (
				t.tag === 19 &&
				(t.memoizedProps.revealOrder === 'forwards' ||
					t.memoizedProps.revealOrder === 'backwards' ||
					t.memoizedProps.revealOrder ===
						'unstable_legacy-backwards' ||
					t.memoizedProps.revealOrder === 'together')
			) {
				if ((t.flags & 128) !== 0) return t;
			} else if (t.child !== null) {
				(t.child.return = t), (t = t.child);
				continue;
			}
			if (t === e) break;
			for (; t.sibling === null; ) {
				if (t.return === null || t.return === e) return null;
				t = t.return;
			}
			(t.sibling.return = t.return), (t = t.sibling);
		}
		return null;
	}
	var Ht = 0,
		Y = null,
		ue = null,
		ye = null,
		Wc = false,
		ra = false,
		Hn = false,
		Fc = 0,
		Wa = 0,
		fa = null,
		ss = 0;
	function se() {
		throw Error(f(321));
	}
	function Ul(e, t) {
		if (t === null) return false;
		for (var n = 0; n < t.length && n < e.length; n++)
			if (!ke(e[n], t[n])) return false;
		return true;
	}
	function Nl(e, t, n, u, l, i) {
		return (
			(Ht = i),
			(Y = t),
			(t.memoizedState = null),
			(t.updateQueue = null),
			(t.lanes = 0),
			(E.H = e === null || e.memoizedState === null ? n_ : Il),
			(Hn = false),
			(i = n(u, l)),
			(Hn = false),
			ra && (i = hf(t, n, u, l)),
			jf(e),
			i
		);
	}
	function jf(e) {
		E.H = ka;
		var t = ue !== null && ue.next !== null;
		if (
			((Ht = 0),
			(ye = ue = Y = null),
			(Wc = false),
			(Wa = 0),
			(fa = null),
			t)
		)
			throw Error(f(300));
		e === null ||
			je ||
			((e = e.dependencies), e !== null && Gc(e) && (je = true));
	}
	function hf(e, t, n, u) {
		Y = e;
		var l = 0;
		do {
			if ((ra && (fa = null), (Wa = 0), (ra = false), 25 <= l))
				throw Error(f(301));
			if (((l += 1), (ye = ue = null), e.updateQueue != null)) {
				var i = e.updateQueue;
				(i.lastEffect = null),
					(i.events = null),
					(i.stores = null),
					i.memoCache != null && (i.memoCache.index = 0);
			}
			(E.H = a_), (i = t(n, u));
		} while (ra);
		return i;
	}
	function gs() {
		var e = E.H,
			t = e.useState()[0];
		return (
			(t = typeof t.then == 'function' ? Fa(t) : t),
			(e = e.useState()[0]),
			(ue !== null ? ue.memoizedState : null) !== e && (Y.flags |= 1024),
			t
		);
	}
	function Bl() {
		var e = Fc !== 0;
		return (Fc = 0), e;
	}
	function Gl(e, t, n) {
		(t.updateQueue = e.updateQueue), (t.flags &= -2053), (e.lanes &= ~n);
	}
	function ql(e) {
		if (Wc) {
			for (e = e.memoizedState; e !== null; ) {
				var t = e.queue;
				t !== null && (t.pending = null), (e = e.next);
			}
			Wc = false;
		}
		(Ht = 0),
			(ye = ue = Y = null),
			(ra = false),
			(Wa = Fc = 0),
			(fa = null);
	}
	function Ue() {
		var e = {
			memoizedState: null,
			baseState: null,
			baseQueue: null,
			queue: null,
			next: null,
		};
		return (
			ye === null ? (Y.memoizedState = ye = e) : (ye = ye.next = e), ye
		);
	}
	function Oe() {
		if (ue === null) {
			var e = Y.alternate;
			e = e !== null ? e.memoizedState : null;
		} else e = ue.next;
		var t = ye === null ? Y.memoizedState : ye.next;
		if (t !== null) (ye = t), (ue = e);
		else {
			if (e === null)
				throw Y.alternate === null ? Error(f(467)) : Error(f(310));
			(ue = e),
				(e = {
					memoizedState: ue.memoizedState,
					baseState: ue.baseState,
					baseQueue: ue.baseQueue,
					queue: ue.queue,
					next: null,
				}),
				ye === null ? (Y.memoizedState = ye = e) : (ye = ye.next = e);
		}
		return ye;
	}
	function Jc() {
		return {
			lastEffect: null,
			events: null,
			stores: null,
			memoCache: null,
		};
	}
	function Fa(e) {
		var t = Wa;
		return (
			(Wa += 1),
			fa === null && (fa = []),
			(e = of(fa, e, t)),
			(t = Y),
			(ye === null ? t.memoizedState : ye.next) === null &&
				((t = t.alternate),
				(E.H = t === null || t.memoizedState === null ? n_ : Il)),
			e
		);
	}
	function kc(e) {
		if (e !== null && typeof e == 'object') {
			if (typeof e.then == 'function') return Fa(e);
			if (e.$$typeof === Re) return Ae(e);
		}
		throw Error(f(438, String(e)));
	}
	function Ll(e) {
		var t = null,
			n = Y.updateQueue;
		if ((n !== null && (t = n.memoCache), t == null)) {
			var u = Y.alternate;
			u !== null &&
				((u = u.updateQueue),
				u !== null &&
					((u = u.memoCache),
					u != null &&
						(t = {
							data: u.data.map(function (l) {
								return l.slice();
							}),
							index: 0,
						})));
		}
		if (
			(t == null && (t = { data: [], index: 0 }),
			n === null && ((n = Jc()), (Y.updateQueue = n)),
			(n.memoCache = t),
			(n = t.data[t.index]),
			n === void 0)
		)
			for (n = t.data[t.index] = Array(e), u = 0; u < e; u++) n[u] = Gn;
		return t.index++, n;
	}
	function Ut(e, t) {
		return typeof t == 'function' ? t(e) : t;
	}
	function Ic(e) {
		var t = Oe();
		return Vl(t, ue, e);
	}
	function Vl(e, t, n) {
		var u = e.queue;
		if (u === null) throw Error(f(311));
		u.lastRenderedReducer = n;
		var l = e.baseQueue,
			i = u.pending;
		if (i !== null) {
			if (l !== null) {
				var _ = l.next;
				(l.next = i.next), (i.next = _);
			}
			(t.baseQueue = l = i), (u.pending = null);
		}
		if (((i = e.baseState), l === null)) e.memoizedState = i;
		else {
			t = l.next;
			var b = (_ = null),
				s = null,
				j = t,
				x = false;
			do {
				var M = j.lane & -536870913;
				if (M !== j.lane ? (W & M) === M : (Ht & M) === M) {
					var h = j.revertLane;
					if (h === 0)
						s !== null &&
							(s = s.next =
								{
									lane: 0,
									revertLane: 0,
									gesture: null,
									action: j.action,
									hasEagerState: j.hasEagerState,
									eagerState: j.eagerState,
									next: null,
								}),
							M === aa && (x = true);
					else if ((Ht & h) === h) {
						(j = j.next), h === aa && (x = true);
						continue;
					} else
						(M = {
							lane: 0,
							revertLane: j.revertLane,
							gesture: null,
							action: j.action,
							hasEagerState: j.hasEagerState,
							eagerState: j.eagerState,
							next: null,
						}),
							s === null
								? ((b = s = M), (_ = i))
								: (s = s.next = M),
							(Y.lanes |= h),
							(ln |= h);
					(M = j.action),
						Hn && n(i, M),
						(i = j.hasEagerState ? j.eagerState : n(i, M));
				} else
					(h = {
						lane: M,
						revertLane: j.revertLane,
						gesture: j.gesture,
						action: j.action,
						hasEagerState: j.hasEagerState,
						eagerState: j.eagerState,
						next: null,
					}),
						s === null ? ((b = s = h), (_ = i)) : (s = s.next = h),
						(Y.lanes |= M),
						(ln |= M);
				j = j.next;
			} while (j !== null && j !== t);
			if (
				(s === null ? (_ = i) : (s.next = b),
				!ke(i, e.memoizedState) &&
					((je = true), x && ((n = ca), n !== null)))
			)
				throw n;
			(e.memoizedState = i),
				(e.baseState = _),
				(e.baseQueue = s),
				(u.lastRenderedState = i);
		}
		return l === null && (u.lanes = 0), [e.memoizedState, u.dispatch];
	}
	function Yl(e) {
		var t = Oe(),
			n = t.queue;
		if (n === null) throw Error(f(311));
		n.lastRenderedReducer = e;
		var u = n.dispatch,
			l = n.pending,
			i = t.memoizedState;
		if (l !== null) {
			n.pending = null;
			var _ = (l = l.next);
			do (i = e(i, _.action)), (_ = _.next);
			while (_ !== l);
			ke(i, t.memoizedState) || (je = true),
				(t.memoizedState = i),
				t.baseQueue === null && (t.baseState = i),
				(n.lastRenderedState = i);
		}
		return [i, u];
	}
	function wf(e, t, n) {
		var u = Y,
			l = Oe(),
			i = k;
		if (i) {
			if (n === void 0) throw Error(f(407));
			n = n();
		} else n = t();
		var _ = !ke((ue || l).memoizedState, n);
		if (
			(_ && ((l.memoizedState = n), (je = true)),
			(l = l.queue),
			Zl(xf.bind(null, u, l, e), [e]),
			l.getSnapshot !== t ||
				_ ||
				(ye !== null && ye.memoizedState.tag & 1))
		) {
			if (
				((u.flags |= 2048),
				_a(9, { destroy: void 0 }, Sf.bind(null, u, l, n, t), null),
				fe === null)
			)
				throw Error(f(349));
			i || (Ht & 127) !== 0 || vf(u, t, n);
		}
		return n;
	}
	function vf(e, t, n) {
		(e.flags |= 16384),
			(e = { getSnapshot: t, value: n }),
			(t = Y.updateQueue),
			t === null
				? ((t = Jc()), (Y.updateQueue = t), (t.stores = [e]))
				: ((n = t.stores), n === null ? (t.stores = [e]) : n.push(e));
	}
	function Sf(e, t, n, u) {
		(t.value = n), (t.getSnapshot = u), Ef(t) && Af(e);
	}
	function xf(e, t, n) {
		return n(function () {
			Ef(t) && Af(e);
		});
	}
	function Ef(e) {
		var t = e.getSnapshot;
		e = e.value;
		try {
			var n = t();
			return !ke(e, n);
		} catch {
			return true;
		}
	}
	function Af(e) {
		var t = xn(e, 2);
		t !== null && Ze(t, e, 2);
	}
	function Xl(e) {
		var t = Ue();
		if (typeof e == 'function') {
			var n = e;
			if (((e = n()), Hn)) {
				Kt(true);
				try {
					n();
				} finally {
					Kt(false);
				}
			}
		}
		return (
			(t.memoizedState = t.baseState = e),
			(t.queue = {
				pending: null,
				lanes: 0,
				dispatch: null,
				lastRenderedReducer: Ut,
				lastRenderedState: e,
			}),
			t
		);
	}
	function Tf(e, t, n, u) {
		return (e.baseState = n), Vl(e, ue, typeof u == 'function' ? u : Ut);
	}
	function ds(e, t, n, u, l) {
		if (eu(e)) throw Error(f(485));
		if (((e = t.action), e !== null)) {
			var i = {
				payload: l,
				action: e,
				next: null,
				isTransition: true,
				status: 'pending',
				value: null,
				reason: null,
				listeners: [],
				then: function (_) {
					i.listeners.push(_);
				},
			};
			E.T !== null ? n(true) : (i.isTransition = false),
				u(i),
				(n = t.pending),
				n === null
					? ((i.next = t.pending = i), Mf(t, i))
					: ((i.next = n.next), (t.pending = n.next = i));
		}
	}
	function Mf(e, t) {
		var n = t.action,
			u = t.payload,
			l = e.state;
		if (t.isTransition) {
			var i = E.T,
				_ = {};
			E.T = _;
			try {
				var b = n(l, u),
					s = E.S;
				s !== null && s(_, b), Df(e, t, b);
			} catch (j) {
				Ql(e, t, j);
			} finally {
				i !== null && _.types !== null && (i.types = _.types),
					(E.T = i);
			}
		} else
			try {
				(i = n(l, u)), Df(e, t, i);
			} catch (j) {
				Ql(e, t, j);
			}
	}
	function Df(e, t, n) {
		n !== null && typeof n == 'object' && typeof n.then == 'function'
			? n.then(
					function (u) {
						Rf(e, t, u);
					},
					function (u) {
						return Ql(e, t, u);
					},
				)
			: Rf(e, t, n);
	}
	function Rf(e, t, n) {
		(t.status = 'fulfilled'),
			(t.value = n),
			zf(t),
			(e.state = n),
			(t = e.pending),
			t !== null &&
				((n = t.next),
				n === t
					? (e.pending = null)
					: ((n = n.next), (t.next = n), Mf(e, n)));
	}
	function Ql(e, t, n) {
		var u = e.pending;
		if (((e.pending = null), u !== null)) {
			u = u.next;
			do (t.status = 'rejected'), (t.reason = n), zf(t), (t = t.next);
			while (t !== u);
		}
		e.action = null;
	}
	function zf(e) {
		e = e.listeners;
		for (var t = 0; t < e.length; t++) (0, e[t])();
	}
	function Cf(e, t) {
		return t;
	}
	function Hf(e, t) {
		if (k) {
			var n = fe.formState;
			if (n !== null) {
				e: {
					var u = Y;
					if (k) {
						if (_e) {
							t: {
								for (var l = _e, i = _t; l.nodeType !== 8; ) {
									if (!i) {
										l = null;
										break t;
									}
									if (((l = bt(l.nextSibling)), l === null)) {
										l = null;
										break t;
									}
								}
								(i = l.data),
									(l = i === 'F!' || i === 'F' ? l : null);
							}
							if (l) {
								(_e = bt(l.nextSibling)), (u = l.data === 'F!');
								break e;
							}
						}
						It(u);
					}
					u = false;
				}
				u && (t = n[0]);
			}
		}
		return (
			(n = Ue()),
			(n.memoizedState = n.baseState = t),
			(u = {
				pending: null,
				lanes: 0,
				dispatch: null,
				lastRenderedReducer: Cf,
				lastRenderedState: t,
			}),
			(n.queue = u),
			(n = Pf.bind(null, Y, u)),
			(u.dispatch = n),
			(u = Xl(false)),
			(i = kl.bind(null, Y, false, u.queue)),
			(u = Ue()),
			(l = { state: t, dispatch: null, action: e, pending: null }),
			(u.queue = l),
			(n = ds.bind(null, Y, l, i, n)),
			(l.dispatch = n),
			(u.memoizedState = e),
			[t, n, false]
		);
	}
	function Uf(e) {
		var t = Oe();
		return Nf(t, ue, e);
	}
	function Nf(e, t, n) {
		if (
			((t = Vl(e, t, Cf)[0]),
			(e = Ic(Ut)[0]),
			typeof t == 'object' && t !== null && typeof t.then == 'function')
		)
			try {
				var u = Fa(t);
			} catch (_) {
				throw _ === ua ? Vc : _;
			}
		else u = t;
		t = Oe();
		var l = t.queue,
			i = l.dispatch;
		return (
			n !== t.memoizedState &&
				((Y.flags |= 2048),
				_a(9, { destroy: void 0 }, ms.bind(null, l, n), null)),
			[u, i, e]
		);
	}
	function ms(e, t) {
		e.action = t;
	}
	function Bf(e) {
		var t = Oe(),
			n = ue;
		if (n !== null) return Nf(t, n, e);
		Oe(), (t = t.memoizedState), (n = Oe());
		var u = n.queue.dispatch;
		return (n.memoizedState = e), [t, u, false];
	}
	function _a(e, t, n, u) {
		return (
			(e = { tag: e, create: n, deps: u, inst: t, next: null }),
			(t = Y.updateQueue),
			t === null && ((t = Jc()), (Y.updateQueue = t)),
			(n = t.lastEffect),
			n === null
				? (t.lastEffect = e.next = e)
				: ((u = n.next),
					(n.next = e),
					(e.next = u),
					(t.lastEffect = e)),
			e
		);
	}
	function Gf() {
		return Oe().memoizedState;
	}
	function $c(e, t, n, u) {
		var l = Ue();
		(Y.flags |= e),
			(l.memoizedState = _a(
				1 | t,
				{ destroy: void 0 },
				n,
				u === void 0 ? null : u,
			));
	}
	function Pc(e, t, n, u) {
		var l = Oe();
		u = u === void 0 ? null : u;
		var i = l.memoizedState.inst;
		ue !== null && u !== null && Ul(u, ue.memoizedState.deps)
			? (l.memoizedState = _a(t, i, n, u))
			: ((Y.flags |= e), (l.memoizedState = _a(1 | t, i, n, u)));
	}
	function qf(e, t) {
		$c(8390656, 8, e, t);
	}
	function Zl(e, t) {
		Pc(2048, 8, e, t);
	}
	function Os(e) {
		Y.flags |= 4;
		var t = Y.updateQueue;
		if (t === null) (t = Jc()), (Y.updateQueue = t), (t.events = [e]);
		else {
			var n = t.events;
			n === null ? (t.events = [e]) : n.push(e);
		}
	}
	function Lf(e) {
		var t = Oe().memoizedState;
		return (
			Os({ ref: t, nextImpl: e }),
			function () {
				if ((ee & 2) !== 0) throw Error(f(440));
				return t.impl.apply(void 0, arguments);
			}
		);
	}
	function Vf(e, t) {
		return Pc(4, 2, e, t);
	}
	function Yf(e, t) {
		return Pc(4, 4, e, t);
	}
	function Xf(e, t) {
		if (typeof t == 'function') {
			e = e();
			var n = t(e);
			return function () {
				typeof n == 'function' ? n() : t(null);
			};
		}
		if (t != null)
			return (
				(e = e()),
				(t.current = e),
				function () {
					t.current = null;
				}
			);
	}
	function Qf(e, t, n) {
		(n = n != null ? n.concat([e]) : null),
			Pc(4, 4, Xf.bind(null, t, e), n);
	}
	function Kl() {}
	function Zf(e, t) {
		var n = Oe();
		t = t === void 0 ? null : t;
		var u = n.memoizedState;
		return t !== null && Ul(t, u[1])
			? u[0]
			: ((n.memoizedState = [e, t]), e);
	}
	function Kf(e, t) {
		var n = Oe();
		t = t === void 0 ? null : t;
		var u = n.memoizedState;
		if (t !== null && Ul(t, u[1])) return u[0];
		if (((u = e()), Hn)) {
			Kt(true);
			try {
				e();
			} finally {
				Kt(false);
			}
		}
		return (n.memoizedState = [u, t]), u;
	}
	function Wl(e, t, n) {
		return n === void 0 || ((Ht & 1073741824) !== 0 && (W & 261930) === 0)
			? (e.memoizedState = t)
			: ((e.memoizedState = n), (e = W_()), (Y.lanes |= e), (ln |= e), n);
	}
	function Wf(e, t, n, u) {
		return ke(n, t)
			? n
			: ia.current !== null
				? ((e = Wl(e, n, u)), ke(e, t) || (je = true), e)
				: (Ht & 42) === 0 ||
					  ((Ht & 1073741824) !== 0 && (W & 261930) === 0)
					? ((je = true), (e.memoizedState = n))
					: ((e = W_()), (Y.lanes |= e), (ln |= e), t);
	}
	function Ff(e, t, n, u, l) {
		var i = R.p;
		R.p = i !== 0 && 8 > i ? i : 8;
		var _ = E.T,
			b = {};
		(E.T = b), kl(e, false, t, n);
		try {
			var s = l(),
				j = E.S;
			if (
				(j !== null && j(b, s),
				s !== null &&
					typeof s == 'object' &&
					typeof s.then == 'function')
			) {
				var x = bs(s, u);
				Ja(e, t, x, nt(e));
			} else Ja(e, t, u, nt(e));
		} catch (M) {
			Ja(
				e,
				t,
				{ then: function () {}, status: 'rejected', reason: M },
				nt(),
			);
		} finally {
			(R.p = i),
				_ !== null && b.types !== null && (_.types = b.types),
				(E.T = _);
		}
	}
	function ps() {}
	function Fl(e, t, n, u) {
		if (e.tag !== 5) throw Error(f(476));
		var l = Jf(e).queue;
		Ff(
			e,
			l,
			t,
			L,
			n === null
				? ps
				: function () {
						return kf(e), n(u);
					},
		);
	}
	function Jf(e) {
		var t = e.memoizedState;
		if (t !== null) return t;
		t = {
			memoizedState: L,
			baseState: L,
			baseQueue: null,
			queue: {
				pending: null,
				lanes: 0,
				dispatch: null,
				lastRenderedReducer: Ut,
				lastRenderedState: L,
			},
			next: null,
		};
		var n = {};
		return (
			(t.next = {
				memoizedState: n,
				baseState: n,
				baseQueue: null,
				queue: {
					pending: null,
					lanes: 0,
					dispatch: null,
					lastRenderedReducer: Ut,
					lastRenderedState: n,
				},
				next: null,
			}),
			(e.memoizedState = t),
			(e = e.alternate),
			e !== null && (e.memoizedState = t),
			t
		);
	}
	function kf(e) {
		var t = Jf(e);
		t.next === null && (t = e.alternate.memoizedState),
			Ja(e, t.next.queue, {}, nt());
	}
	function Jl() {
		return Ae(bc);
	}
	function If() {
		return Oe().memoizedState;
	}
	function $f() {
		return Oe().memoizedState;
	}
	function ys(e) {
		for (var t = e.return; t !== null; ) {
			switch (t.tag) {
				case 24:
				case 3:
					var n = nt();
					e = en(n);
					var u = tn(t, e, n);
					u !== null && (Ze(u, t, n), Qa(u, t, n)),
						(t = { cache: Sl() }),
						(e.payload = t);
					return;
			}
			t = t.return;
		}
	}
	function js(e, t, n) {
		var u = nt();
		(n = {
			lane: u,
			revertLane: 0,
			gesture: null,
			action: n,
			hasEagerState: false,
			eagerState: null,
			next: null,
		}),
			eu(e)
				? e_(t, n)
				: ((n = sl(e, t, n, u)),
					n !== null && (Ze(n, e, u), t_(n, t, u)));
	}
	function Pf(e, t, n) {
		var u = nt();
		Ja(e, t, n, u);
	}
	function Ja(e, t, n, u) {
		var l = {
			lane: u,
			revertLane: 0,
			gesture: null,
			action: n,
			hasEagerState: false,
			eagerState: null,
			next: null,
		};
		if (eu(e)) e_(t, l);
		else {
			var i = e.alternate;
			if (
				e.lanes === 0 &&
				(i === null || i.lanes === 0) &&
				((i = t.lastRenderedReducer), i !== null)
			)
				try {
					var _ = t.lastRenderedState,
						b = i(_, n);
					if (
						((l.hasEagerState = true), (l.eagerState = b), ke(b, _))
					)
						return Hc(e, t, l, 0), fe === null && Cc(), false;
				} catch {
				} finally {
				}
			if (((n = sl(e, t, l, u)), n !== null))
				return Ze(n, e, u), t_(n, t, u), true;
		}
		return false;
	}
	function kl(e, t, n, u) {
		if (
			((u = {
				lane: 2,
				revertLane: Ti(),
				gesture: null,
				action: u,
				hasEagerState: false,
				eagerState: null,
				next: null,
			}),
			eu(e))
		) {
			if (t) throw Error(f(479));
		} else (t = sl(e, n, u, 2)), t !== null && Ze(t, e, 2);
	}
	function eu(e) {
		var t = e.alternate;
		return e === Y || (t !== null && t === Y);
	}
	function e_(e, t) {
		ra = Wc = true;
		var n = e.pending;
		n === null ? (t.next = t) : ((t.next = n.next), (n.next = t)),
			(e.pending = t);
	}
	function t_(e, t, n) {
		if ((n & 4194048) !== 0) {
			var u = t.lanes;
			(u &= e.pendingLanes), (n |= u), (t.lanes = n), ur(e, n);
		}
	}
	var ka = {
		readContext: Ae,
		use: kc,
		useCallback: se,
		useContext: se,
		useEffect: se,
		useImperativeHandle: se,
		useLayoutEffect: se,
		useInsertionEffect: se,
		useMemo: se,
		useReducer: se,
		useRef: se,
		useState: se,
		useDebugValue: se,
		useDeferredValue: se,
		useTransition: se,
		useSyncExternalStore: se,
		useId: se,
		useHostTransitionStatus: se,
		useFormState: se,
		useActionState: se,
		useOptimistic: se,
		useMemoCache: se,
		useCacheRefresh: se,
	};
	ka.useEffectEvent = se;
	var n_ = {
			readContext: Ae,
			use: kc,
			useCallback: function (e, t) {
				return (Ue().memoizedState = [e, t === void 0 ? null : t]), e;
			},
			useContext: Ae,
			useEffect: qf,
			useImperativeHandle: function (e, t, n) {
				(n = n != null ? n.concat([e]) : null),
					$c(4194308, 4, Xf.bind(null, t, e), n);
			},
			useLayoutEffect: function (e, t) {
				return $c(4194308, 4, e, t);
			},
			useInsertionEffect: function (e, t) {
				$c(4, 2, e, t);
			},
			useMemo: function (e, t) {
				var n = Ue();
				t = t === void 0 ? null : t;
				var u = e();
				if (Hn) {
					Kt(true);
					try {
						e();
					} finally {
						Kt(false);
					}
				}
				return (n.memoizedState = [u, t]), u;
			},
			useReducer: function (e, t, n) {
				var u = Ue();
				if (n !== void 0) {
					var l = n(t);
					if (Hn) {
						Kt(true);
						try {
							n(t);
						} finally {
							Kt(false);
						}
					}
				} else l = t;
				return (
					(u.memoizedState = u.baseState = l),
					(e = {
						pending: null,
						lanes: 0,
						dispatch: null,
						lastRenderedReducer: e,
						lastRenderedState: l,
					}),
					(u.queue = e),
					(e = e.dispatch = js.bind(null, Y, e)),
					[u.memoizedState, e]
				);
			},
			useRef: function (e) {
				var t = Ue();
				return (e = { current: e }), (t.memoizedState = e);
			},
			useState: function (e) {
				e = Xl(e);
				var t = e.queue,
					n = Pf.bind(null, Y, t);
				return (t.dispatch = n), [e.memoizedState, n];
			},
			useDebugValue: Kl,
			useDeferredValue: function (e, t) {
				var n = Ue();
				return Wl(n, e, t);
			},
			useTransition: function () {
				var e = Xl(false);
				return (
					(e = Ff.bind(null, Y, e.queue, true, false)),
					(Ue().memoizedState = e),
					[false, e]
				);
			},
			useSyncExternalStore: function (e, t, n) {
				var u = Y,
					l = Ue();
				if (k) {
					if (n === void 0) throw Error(f(407));
					n = n();
				} else {
					if (((n = t()), fe === null)) throw Error(f(349));
					(W & 127) !== 0 || vf(u, t, n);
				}
				l.memoizedState = n;
				var i = { value: n, getSnapshot: t };
				return (
					(l.queue = i),
					qf(xf.bind(null, u, i, e), [e]),
					(u.flags |= 2048),
					_a(9, { destroy: void 0 }, Sf.bind(null, u, i, n, t), null),
					n
				);
			},
			useId: function () {
				var e = Ue(),
					t = fe.identifierPrefix;
				if (k) {
					var n = wt,
						u = ht;
					(n = (u & ~(1 << (32 - Je(u) - 1))).toString(32) + n),
						(t = '_' + t + 'R_' + n),
						(n = Fc++),
						0 < n && (t += 'H' + n.toString(32)),
						(t += '_');
				} else (n = ss++), (t = '_' + t + 'r_' + n.toString(32) + '_');
				return (e.memoizedState = t);
			},
			useHostTransitionStatus: Jl,
			useFormState: Hf,
			useActionState: Hf,
			useOptimistic: function (e) {
				var t = Ue();
				t.memoizedState = t.baseState = e;
				var n = {
					pending: null,
					lanes: 0,
					dispatch: null,
					lastRenderedReducer: null,
					lastRenderedState: null,
				};
				return (
					(t.queue = n),
					(t = kl.bind(null, Y, true, n)),
					(n.dispatch = t),
					[e, t]
				);
			},
			useMemoCache: Ll,
			useCacheRefresh: function () {
				return (Ue().memoizedState = ys.bind(null, Y));
			},
			useEffectEvent: function (e) {
				var t = Ue(),
					n = { impl: e };
				return (
					(t.memoizedState = n),
					function () {
						if ((ee & 2) !== 0) throw Error(f(440));
						return n.impl.apply(void 0, arguments);
					}
				);
			},
		},
		Il = {
			readContext: Ae,
			use: kc,
			useCallback: Zf,
			useContext: Ae,
			useEffect: Zl,
			useImperativeHandle: Qf,
			useInsertionEffect: Vf,
			useLayoutEffect: Yf,
			useMemo: Kf,
			useReducer: Ic,
			useRef: Gf,
			useState: function () {
				return Ic(Ut);
			},
			useDebugValue: Kl,
			useDeferredValue: function (e, t) {
				var n = Oe();
				return Wf(n, ue.memoizedState, e, t);
			},
			useTransition: function () {
				var e = Ic(Ut)[0],
					t = Oe().memoizedState;
				return [typeof e == 'boolean' ? e : Fa(e), t];
			},
			useSyncExternalStore: wf,
			useId: If,
			useHostTransitionStatus: Jl,
			useFormState: Uf,
			useActionState: Uf,
			useOptimistic: function (e, t) {
				var n = Oe();
				return Tf(n, ue, e, t);
			},
			useMemoCache: Ll,
			useCacheRefresh: $f,
		};
	Il.useEffectEvent = Lf;
	var a_ = {
		readContext: Ae,
		use: kc,
		useCallback: Zf,
		useContext: Ae,
		useEffect: Zl,
		useImperativeHandle: Qf,
		useInsertionEffect: Vf,
		useLayoutEffect: Yf,
		useMemo: Kf,
		useReducer: Yl,
		useRef: Gf,
		useState: function () {
			return Yl(Ut);
		},
		useDebugValue: Kl,
		useDeferredValue: function (e, t) {
			var n = Oe();
			return ue === null ? Wl(n, e, t) : Wf(n, ue.memoizedState, e, t);
		},
		useTransition: function () {
			var e = Yl(Ut)[0],
				t = Oe().memoizedState;
			return [typeof e == 'boolean' ? e : Fa(e), t];
		},
		useSyncExternalStore: wf,
		useId: If,
		useHostTransitionStatus: Jl,
		useFormState: Bf,
		useActionState: Bf,
		useOptimistic: function (e, t) {
			var n = Oe();
			return ue !== null
				? Tf(n, ue, e, t)
				: ((n.baseState = e), [e, n.queue.dispatch]);
		},
		useMemoCache: Ll,
		useCacheRefresh: $f,
	};
	a_.useEffectEvent = Lf;
	function $l(e, t, n, u) {
		(t = e.memoizedState),
			(n = n(u, t)),
			(n = n == null ? t : C({}, t, n)),
			(e.memoizedState = n),
			e.lanes === 0 && (e.updateQueue.baseState = n);
	}
	var Pl = {
		enqueueSetState: function (e, t, n) {
			e = e._reactInternals;
			var u = nt(),
				l = en(u);
			(l.payload = t),
				n != null && (l.callback = n),
				(t = tn(e, l, u)),
				t !== null && (Ze(t, e, u), Qa(t, e, u));
		},
		enqueueReplaceState: function (e, t, n) {
			e = e._reactInternals;
			var u = nt(),
				l = en(u);
			(l.tag = 1),
				(l.payload = t),
				n != null && (l.callback = n),
				(t = tn(e, l, u)),
				t !== null && (Ze(t, e, u), Qa(t, e, u));
		},
		enqueueForceUpdate: function (e, t) {
			e = e._reactInternals;
			var n = nt(),
				u = en(n);
			(u.tag = 2),
				t != null && (u.callback = t),
				(t = tn(e, u, n)),
				t !== null && (Ze(t, e, n), Qa(t, e, n));
		},
	};
	function c_(e, t, n, u, l, i, _) {
		return (
			(e = e.stateNode),
			typeof e.shouldComponentUpdate == 'function'
				? e.shouldComponentUpdate(u, i, _)
				: t.prototype && t.prototype.isPureReactComponent
					? !Na(n, u) || !Na(l, i)
					: true
		);
	}
	function u_(e, t, n, u) {
		(e = t.state),
			typeof t.componentWillReceiveProps == 'function' &&
				t.componentWillReceiveProps(n, u),
			typeof t.UNSAFE_componentWillReceiveProps == 'function' &&
				t.UNSAFE_componentWillReceiveProps(n, u),
			t.state !== e && Pl.enqueueReplaceState(t, t.state, null);
	}
	function Un(e, t) {
		var n = t;
		if ('ref' in t) {
			n = {};
			for (var u in t) u !== 'ref' && (n[u] = t[u]);
		}
		if ((e = e.defaultProps)) {
			n === t && (n = C({}, n));
			for (var l in e) n[l] === void 0 && (n[l] = e[l]);
		}
		return n;
	}
	function l_(e) {
		zc(e);
	}
	function i_(e) {
		console.error(e);
	}
	function r_(e) {
		zc(e);
	}
	function tu(e, t) {
		try {
			var n = e.onUncaughtError;
			n(t.value, { componentStack: t.stack });
		} catch (u) {
			setTimeout(function () {
				throw u;
			});
		}
	}
	function f_(e, t, n) {
		try {
			var u = e.onCaughtError;
			u(n.value, {
				componentStack: n.stack,
				errorBoundary: t.tag === 1 ? t.stateNode : null,
			});
		} catch (l) {
			setTimeout(function () {
				throw l;
			});
		}
	}
	function ei(e, t, n) {
		return (
			(n = en(n)),
			(n.tag = 3),
			(n.payload = { element: null }),
			(n.callback = function () {
				tu(e, t);
			}),
			n
		);
	}
	function __(e) {
		return (e = en(e)), (e.tag = 3), e;
	}
	function o_(e, t, n, u) {
		var l = n.type.getDerivedStateFromError;
		if (typeof l == 'function') {
			var i = u.value;
			(e.payload = function () {
				return l(i);
			}),
				(e.callback = function () {
					f_(t, n, u);
				});
		}
		var _ = n.stateNode;
		_ !== null &&
			typeof _.componentDidCatch == 'function' &&
			(e.callback = function () {
				f_(t, n, u),
					typeof l != 'function' &&
						(rn === null
							? (rn = /* @__PURE__ */ new Set([this]))
							: rn.add(this));
				var b = u.stack;
				this.componentDidCatch(u.value, {
					componentStack: b !== null ? b : '',
				});
			});
	}
	function hs(e, t, n, u, l) {
		if (
			((n.flags |= 32768),
			u !== null && typeof u == 'object' && typeof u.then == 'function')
		) {
			if (
				((t = n.alternate),
				t !== null && na(t, n, l, true),
				(n = $e.current),
				n !== null)
			) {
				switch (n.tag) {
					case 31:
					case 13:
						return (
							ot === null
								? su()
								: n.alternate === null && ge === 0 && (ge = 3),
							(n.flags &= -257),
							(n.flags |= 65536),
							(n.lanes = l),
							u === Yc
								? (n.flags |= 16384)
								: ((t = n.updateQueue),
									t === null
										? (n.updateQueue =
												/* @__PURE__ */ new Set([u]))
										: t.add(u),
									xi(e, u, l)),
							false
						);
					case 22:
						return (
							(n.flags |= 65536),
							u === Yc
								? (n.flags |= 16384)
								: ((t = n.updateQueue),
									t === null
										? ((t = {
												transitions: null,
												markerInstances: null,
												retryQueue:
													/* @__PURE__ */ new Set([
														u,
													]),
											}),
											(n.updateQueue = t))
										: ((n = t.retryQueue),
											n === null
												? (t.retryQueue =
														/* @__PURE__ */ new Set(
															[u],
														))
												: n.add(u)),
									xi(e, u, l)),
							false
						);
				}
				throw Error(f(435, n.tag));
			}
			return xi(e, u, l), su(), false;
		}
		if (k)
			return (
				(t = $e.current),
				t !== null
					? ((t.flags & 65536) === 0 && (t.flags |= 256),
						(t.flags |= 65536),
						(t.lanes = l),
						u !== yl &&
							((e = Error(f(422), { cause: u })), qa(it(e, n))))
					: (u !== yl &&
							((t = Error(f(423), { cause: u })), qa(it(t, n))),
						(e = e.current.alternate),
						(e.flags |= 65536),
						(l &= -l),
						(e.lanes |= l),
						(u = it(u, n)),
						(l = ei(e.stateNode, u, l)),
						Dl(e, l),
						ge !== 4 && (ge = 2)),
				false
			);
		var i = Error(f(520), { cause: u });
		if (
			((i = it(i, n)),
			cc === null ? (cc = [i]) : cc.push(i),
			ge !== 4 && (ge = 2),
			t === null)
		)
			return true;
		(u = it(u, n)), (n = t);
		do {
			switch (n.tag) {
				case 3:
					return (
						(n.flags |= 65536),
						(e = l & -l),
						(n.lanes |= e),
						(e = ei(n.stateNode, u, e)),
						Dl(n, e),
						false
					);
				case 1:
					if (
						((t = n.type),
						(i = n.stateNode),
						(n.flags & 128) === 0 &&
							(typeof t.getDerivedStateFromError == 'function' ||
								(i !== null &&
									typeof i.componentDidCatch == 'function' &&
									(rn === null || !rn.has(i)))))
					)
						return (
							(n.flags |= 65536),
							(l &= -l),
							(n.lanes |= l),
							(l = __(l)),
							o_(l, e, n, u),
							Dl(n, l),
							false
						);
			}
			n = n.return;
		} while (n !== null);
		return false;
	}
	var ti = Error(f(461)),
		je = false;
	function Te(e, t, n, u) {
		t.child = e === null ? df(t, null, n, u) : Cn(t, e.child, n, u);
	}
	function b_(e, t, n, u, l) {
		n = n.render;
		var i = t.ref;
		if ('ref' in u) {
			var _ = {};
			for (var b in u) b !== 'ref' && (_[b] = u[b]);
		} else _ = u;
		return (
			Mn(t),
			(u = Nl(e, t, n, _, i, l)),
			(b = Bl()),
			e !== null && !je
				? (Gl(e, t, l), Nt(e, t, l))
				: (k && b && Ol(t), (t.flags |= 1), Te(e, t, u, l), t.child)
		);
	}
	function s_(e, t, n, u, l) {
		if (e === null) {
			var i = n.type;
			return typeof i == 'function' &&
				!gl(i) &&
				i.defaultProps === void 0 &&
				n.compare === null
				? ((t.tag = 15), (t.type = i), g_(e, t, i, u, l))
				: ((e = Nc(n.type, null, u, t, t.mode, l)),
					(e.ref = t.ref),
					(e.return = t),
					(t.child = e));
		}
		if (((i = e.child), !fi(e, l))) {
			var _ = i.memoizedProps;
			if (
				((n = n.compare),
				(n = n !== null ? n : Na),
				n(_, u) && e.ref === t.ref)
			)
				return Nt(e, t, l);
		}
		return (
			(t.flags |= 1),
			(e = Dt(i, u)),
			(e.ref = t.ref),
			(e.return = t),
			(t.child = e)
		);
	}
	function g_(e, t, n, u, l) {
		if (e !== null) {
			var i = e.memoizedProps;
			if (Na(i, u) && e.ref === t.ref)
				if (((je = false), (t.pendingProps = u = i), fi(e, l)))
					(e.flags & 131072) !== 0 && (je = true);
				else return (t.lanes = e.lanes), Nt(e, t, l);
		}
		return ni(e, t, n, u, l);
	}
	function d_(e, t, n, u) {
		var l = u.children,
			i = e !== null ? e.memoizedState : null;
		if (
			(e === null &&
				t.stateNode === null &&
				(t.stateNode = {
					_visibility: 1,
					_pendingMarkers: null,
					_retryCache: null,
					_transitions: null,
				}),
			u.mode === 'hidden')
		) {
			if ((t.flags & 128) !== 0) {
				if (((i = i !== null ? i.baseLanes | n : n), e !== null)) {
					for (u = t.child = e.child, l = 0; u !== null; )
						(l = l | u.lanes | u.childLanes), (u = u.sibling);
					u = l & ~i;
				} else (u = 0), (t.child = null);
				return m_(e, t, i, n, u);
			}
			if ((n & 536870912) !== 0)
				(t.memoizedState = { baseLanes: 0, cachePool: null }),
					e !== null && Lc(t, i !== null ? i.cachePool : null),
					i !== null ? pf(t, i) : zl(),
					yf(t);
			else
				return (
					(u = t.lanes = 536870912),
					m_(e, t, i !== null ? i.baseLanes | n : n, n, u)
				);
		} else
			i !== null
				? (Lc(t, i.cachePool), pf(t, i), an(), (t.memoizedState = null))
				: (e !== null && Lc(t, null), zl(), an());
		return Te(e, t, l, n), t.child;
	}
	function Ia(e, t) {
		return (
			(e !== null && e.tag === 22) ||
				t.stateNode !== null ||
				(t.stateNode = {
					_visibility: 1,
					_pendingMarkers: null,
					_retryCache: null,
					_transitions: null,
				}),
			t.sibling
		);
	}
	function m_(e, t, n, u, l) {
		var i = El();
		return (
			(i = i === null ? null : { parent: pe._currentValue, pool: i }),
			(t.memoizedState = { baseLanes: n, cachePool: i }),
			e !== null && Lc(t, null),
			zl(),
			yf(t),
			e !== null && na(e, t, u, true),
			(t.childLanes = l),
			null
		);
	}
	function nu(e, t) {
		return (
			(t = cu({ mode: t.mode, children: t.children }, e.mode)),
			(t.ref = e.ref),
			(e.child = t),
			(t.return = e),
			t
		);
	}
	function O_(e, t, n) {
		return (
			Cn(t, e.child, null, n),
			(e = nu(t, t.pendingProps)),
			(e.flags |= 2),
			Pe(t),
			(t.memoizedState = null),
			e
		);
	}
	function ws(e, t, n) {
		var u = t.pendingProps,
			l = (t.flags & 128) !== 0;
		if (((t.flags &= -129), e === null)) {
			if (k) {
				if (u.mode === 'hidden')
					return (e = nu(t, u)), (t.lanes = 536870912), Ia(null, e);
				if (
					(Hl(t),
					(e = _e)
						? ((e = Do(e, _t)),
							(e = e !== null && e.data === '&' ? e : null),
							e !== null &&
								((t.memoizedState = {
									dehydrated: e,
									treeContext:
										Jt !== null
											? { id: ht, overflow: wt }
											: null,
									retryLane: 536870912,
									hydrationErrors: null,
								}),
								(n = Pr(e)),
								(n.return = t),
								(t.child = n),
								(Ee = t),
								(_e = null)))
						: (e = null),
					e === null)
				)
					throw It(t);
				return (t.lanes = 536870912), null;
			}
			return nu(t, u);
		}
		var i = e.memoizedState;
		if (i !== null) {
			var _ = i.dehydrated;
			if ((Hl(t), l))
				if (t.flags & 256) (t.flags &= -257), (t = O_(e, t, n));
				else if (t.memoizedState !== null)
					(t.child = e.child), (t.flags |= 128), (t = null);
				else throw Error(f(558));
			else if (
				(je || na(e, t, n, false),
				(l = (n & e.childLanes) !== 0),
				je || l)
			) {
				if (
					((u = fe),
					u !== null &&
						((_ = lr(u, n)), _ !== 0 && _ !== i.retryLane))
				)
					throw ((i.retryLane = _), xn(e, _), Ze(u, e, _), ti);
				su(), (t = O_(e, t, n));
			} else
				(e = i.treeContext),
					(_e = bt(_.nextSibling)),
					(Ee = t),
					(k = true),
					(kt = null),
					(_t = false),
					e !== null && nf(t, e),
					(t = nu(t, u)),
					(t.flags |= 4096);
			return t;
		}
		return (
			(e = Dt(e.child, { mode: u.mode, children: u.children })),
			(e.ref = t.ref),
			(t.child = e),
			(e.return = t),
			e
		);
	}
	function au(e, t) {
		var n = t.ref;
		if (n === null) e !== null && e.ref !== null && (t.flags |= 4194816);
		else {
			if (typeof n != 'function' && typeof n != 'object')
				throw Error(f(284));
			(e === null || e.ref !== n) && (t.flags |= 4194816);
		}
	}
	function ni(e, t, n, u, l) {
		return (
			Mn(t),
			(n = Nl(e, t, n, u, void 0, l)),
			(u = Bl()),
			e !== null && !je
				? (Gl(e, t, l), Nt(e, t, l))
				: (k && u && Ol(t), (t.flags |= 1), Te(e, t, n, l), t.child)
		);
	}
	function p_(e, t, n, u, l, i) {
		return (
			Mn(t),
			(t.updateQueue = null),
			(n = hf(t, u, n, l)),
			jf(e),
			(u = Bl()),
			e !== null && !je
				? (Gl(e, t, i), Nt(e, t, i))
				: (k && u && Ol(t), (t.flags |= 1), Te(e, t, n, i), t.child)
		);
	}
	function y_(e, t, n, u, l) {
		if ((Mn(t), t.stateNode === null)) {
			var i = $n,
				_ = n.contextType;
			typeof _ == 'object' && _ !== null && (i = Ae(_)),
				(i = new n(u, i)),
				(t.memoizedState =
					i.state !== null && i.state !== void 0 ? i.state : null),
				(i.updater = Pl),
				(t.stateNode = i),
				(i._reactInternals = t),
				(i = t.stateNode),
				(i.props = u),
				(i.state = t.memoizedState),
				(i.refs = {}),
				Tl(t),
				(_ = n.contextType),
				(i.context = typeof _ == 'object' && _ !== null ? Ae(_) : $n),
				(i.state = t.memoizedState),
				(_ = n.getDerivedStateFromProps),
				typeof _ == 'function' &&
					($l(t, n, _, u), (i.state = t.memoizedState)),
				typeof n.getDerivedStateFromProps == 'function' ||
					typeof i.getSnapshotBeforeUpdate == 'function' ||
					(typeof i.UNSAFE_componentWillMount != 'function' &&
						typeof i.componentWillMount != 'function') ||
					((_ = i.state),
					typeof i.componentWillMount == 'function' &&
						i.componentWillMount(),
					typeof i.UNSAFE_componentWillMount == 'function' &&
						i.UNSAFE_componentWillMount(),
					_ !== i.state && Pl.enqueueReplaceState(i, i.state, null),
					Ka(t, u, i, l),
					Za(),
					(i.state = t.memoizedState)),
				typeof i.componentDidMount == 'function' &&
					(t.flags |= 4194308),
				(u = true);
		} else if (e === null) {
			i = t.stateNode;
			var b = t.memoizedProps,
				s = Un(n, b);
			i.props = s;
			var j = i.context,
				x = n.contextType;
			(_ = $n), typeof x == 'object' && x !== null && (_ = Ae(x));
			var M = n.getDerivedStateFromProps;
			(x =
				typeof M == 'function' ||
				typeof i.getSnapshotBeforeUpdate == 'function'),
				(b = t.pendingProps !== b),
				x ||
					(typeof i.UNSAFE_componentWillReceiveProps != 'function' &&
						typeof i.componentWillReceiveProps != 'function') ||
					((b || j !== _) && u_(t, i, u, _)),
				(Pt = false);
			var h = t.memoizedState;
			(i.state = h),
				Ka(t, u, i, l),
				Za(),
				(j = t.memoizedState),
				b || h !== j || Pt
					? (typeof M == 'function' &&
							($l(t, n, M, u), (j = t.memoizedState)),
						(s = Pt || c_(t, n, s, u, h, j, _))
							? (x ||
									(typeof i.UNSAFE_componentWillMount !=
										'function' &&
										typeof i.componentWillMount !=
											'function') ||
									(typeof i.componentWillMount ==
										'function' && i.componentWillMount(),
									typeof i.UNSAFE_componentWillMount ==
										'function' &&
										i.UNSAFE_componentWillMount()),
								typeof i.componentDidMount == 'function' &&
									(t.flags |= 4194308))
							: (typeof i.componentDidMount == 'function' &&
									(t.flags |= 4194308),
								(t.memoizedProps = u),
								(t.memoizedState = j)),
						(i.props = u),
						(i.state = j),
						(i.context = _),
						(u = s))
					: (typeof i.componentDidMount == 'function' &&
							(t.flags |= 4194308),
						(u = false));
		} else {
			(i = t.stateNode),
				Ml(e, t),
				(_ = t.memoizedProps),
				(x = Un(n, _)),
				(i.props = x),
				(M = t.pendingProps),
				(h = i.context),
				(j = n.contextType),
				(s = $n),
				typeof j == 'object' && j !== null && (s = Ae(j)),
				(b = n.getDerivedStateFromProps),
				(j =
					typeof b == 'function' ||
					typeof i.getSnapshotBeforeUpdate == 'function') ||
					(typeof i.UNSAFE_componentWillReceiveProps != 'function' &&
						typeof i.componentWillReceiveProps != 'function') ||
					((_ !== M || h !== s) && u_(t, i, u, s)),
				(Pt = false),
				(h = t.memoizedState),
				(i.state = h),
				Ka(t, u, i, l),
				Za();
			var v = t.memoizedState;
			_ !== M ||
			h !== v ||
			Pt ||
			(e !== null && e.dependencies !== null && Gc(e.dependencies))
				? (typeof b == 'function' &&
						($l(t, n, b, u), (v = t.memoizedState)),
					(x =
						Pt ||
						c_(t, n, x, u, h, v, s) ||
						(e !== null &&
							e.dependencies !== null &&
							Gc(e.dependencies)))
						? (j ||
								(typeof i.UNSAFE_componentWillUpdate !=
									'function' &&
									typeof i.componentWillUpdate !=
										'function') ||
								(typeof i.componentWillUpdate == 'function' &&
									i.componentWillUpdate(u, v, s),
								typeof i.UNSAFE_componentWillUpdate ==
									'function' &&
									i.UNSAFE_componentWillUpdate(u, v, s)),
							typeof i.componentDidUpdate == 'function' &&
								(t.flags |= 4),
							typeof i.getSnapshotBeforeUpdate == 'function' &&
								(t.flags |= 1024))
						: (typeof i.componentDidUpdate != 'function' ||
								(_ === e.memoizedProps &&
									h === e.memoizedState) ||
								(t.flags |= 4),
							typeof i.getSnapshotBeforeUpdate != 'function' ||
								(_ === e.memoizedProps &&
									h === e.memoizedState) ||
								(t.flags |= 1024),
							(t.memoizedProps = u),
							(t.memoizedState = v)),
					(i.props = u),
					(i.state = v),
					(i.context = s),
					(u = x))
				: (typeof i.componentDidUpdate != 'function' ||
						(_ === e.memoizedProps && h === e.memoizedState) ||
						(t.flags |= 4),
					typeof i.getSnapshotBeforeUpdate != 'function' ||
						(_ === e.memoizedProps && h === e.memoizedState) ||
						(t.flags |= 1024),
					(u = false));
		}
		return (
			(i = u),
			au(e, t),
			(u = (t.flags & 128) !== 0),
			i || u
				? ((i = t.stateNode),
					(n =
						u && typeof n.getDerivedStateFromError != 'function'
							? null
							: i.render()),
					(t.flags |= 1),
					e !== null && u
						? ((t.child = Cn(t, e.child, null, l)),
							(t.child = Cn(t, null, n, l)))
						: Te(e, t, n, l),
					(t.memoizedState = i.state),
					(e = t.child))
				: (e = Nt(e, t, l)),
			e
		);
	}
	function j_(e, t, n, u) {
		return An(), (t.flags |= 256), Te(e, t, n, u), t.child;
	}
	var ai = {
		dehydrated: null,
		treeContext: null,
		retryLane: 0,
		hydrationErrors: null,
	};
	function ci(e) {
		return { baseLanes: e, cachePool: ff() };
	}
	function ui(e, t, n) {
		return (e = e !== null ? e.childLanes & ~n : 0), t && (e |= tt), e;
	}
	function h_(e, t, n) {
		var u = t.pendingProps,
			l = false,
			i = (t.flags & 128) !== 0,
			_;
		if (
			((_ = i) ||
				(_ =
					e !== null && e.memoizedState === null
						? false
						: (me.current & 2) !== 0),
			_ && ((l = true), (t.flags &= -129)),
			(_ = (t.flags & 32) !== 0),
			(t.flags &= -33),
			e === null)
		) {
			if (k) {
				if (
					(l ? nn(t) : an(),
					(e = _e)
						? ((e = Do(e, _t)),
							(e = e !== null && e.data !== '&' ? e : null),
							e !== null &&
								((t.memoizedState = {
									dehydrated: e,
									treeContext:
										Jt !== null
											? { id: ht, overflow: wt }
											: null,
									retryLane: 536870912,
									hydrationErrors: null,
								}),
								(n = Pr(e)),
								(n.return = t),
								(t.child = n),
								(Ee = t),
								(_e = null)))
						: (e = null),
					e === null)
				)
					throw It(t);
				return Vi(e) ? (t.lanes = 32) : (t.lanes = 536870912), null;
			}
			var b = u.children;
			return (
				(u = u.fallback),
				l
					? (an(),
						(l = t.mode),
						(b = cu({ mode: 'hidden', children: b }, l)),
						(u = En(u, l, n, null)),
						(b.return = t),
						(u.return = t),
						(b.sibling = u),
						(t.child = b),
						(u = t.child),
						(u.memoizedState = ci(n)),
						(u.childLanes = ui(e, _, n)),
						(t.memoizedState = ai),
						Ia(null, u))
					: (nn(t), li(t, b))
			);
		}
		var s = e.memoizedState;
		if (s !== null && ((b = s.dehydrated), b !== null)) {
			if (i)
				t.flags & 256
					? (nn(t), (t.flags &= -257), (t = ii(e, t, n)))
					: t.memoizedState !== null
						? (an(),
							(t.child = e.child),
							(t.flags |= 128),
							(t = null))
						: (an(),
							(b = u.fallback),
							(l = t.mode),
							(u = cu(
								{ mode: 'visible', children: u.children },
								l,
							)),
							(b = En(b, l, n, null)),
							(b.flags |= 2),
							(u.return = t),
							(b.return = t),
							(u.sibling = b),
							(t.child = u),
							Cn(t, e.child, null, n),
							(u = t.child),
							(u.memoizedState = ci(n)),
							(u.childLanes = ui(e, _, n)),
							(t.memoizedState = ai),
							(t = Ia(null, u)));
			else if ((nn(t), Vi(b))) {
				if (((_ = b.nextSibling && b.nextSibling.dataset), _))
					var j = _.dgst;
				(_ = j),
					(u = Error(f(419))),
					(u.stack = ''),
					(u.digest = _),
					qa({ value: u, source: null, stack: null }),
					(t = ii(e, t, n));
			} else if (
				(je || na(e, t, n, false),
				(_ = (n & e.childLanes) !== 0),
				je || _)
			) {
				if (
					((_ = fe),
					_ !== null &&
						((u = lr(_, n)), u !== 0 && u !== s.retryLane))
				)
					throw ((s.retryLane = u), xn(e, u), Ze(_, e, u), ti);
				Li(b) || su(), (t = ii(e, t, n));
			} else
				Li(b)
					? ((t.flags |= 192), (t.child = e.child), (t = null))
					: ((e = s.treeContext),
						(_e = bt(b.nextSibling)),
						(Ee = t),
						(k = true),
						(kt = null),
						(_t = false),
						e !== null && nf(t, e),
						(t = li(t, u.children)),
						(t.flags |= 4096));
			return t;
		}
		return l
			? (an(),
				(b = u.fallback),
				(l = t.mode),
				(s = e.child),
				(j = s.sibling),
				(u = Dt(s, { mode: 'hidden', children: u.children })),
				(u.subtreeFlags = s.subtreeFlags & 65011712),
				j !== null
					? (b = Dt(j, b))
					: ((b = En(b, l, n, null)), (b.flags |= 2)),
				(b.return = t),
				(u.return = t),
				(u.sibling = b),
				(t.child = u),
				Ia(null, u),
				(u = t.child),
				(b = e.child.memoizedState),
				b === null
					? (b = ci(n))
					: ((l = b.cachePool),
						l !== null
							? ((s = pe._currentValue),
								(l =
									l.parent !== s
										? { parent: s, pool: s }
										: l))
							: (l = ff()),
						(b = { baseLanes: b.baseLanes | n, cachePool: l })),
				(u.memoizedState = b),
				(u.childLanes = ui(e, _, n)),
				(t.memoizedState = ai),
				Ia(e.child, u))
			: (nn(t),
				(n = e.child),
				(e = n.sibling),
				(n = Dt(n, { mode: 'visible', children: u.children })),
				(n.return = t),
				(n.sibling = null),
				e !== null &&
					((_ = t.deletions),
					_ === null
						? ((t.deletions = [e]), (t.flags |= 16))
						: _.push(e)),
				(t.child = n),
				(t.memoizedState = null),
				n);
	}
	function li(e, t) {
		return (
			(t = cu({ mode: 'visible', children: t }, e.mode)),
			(t.return = e),
			(e.child = t)
		);
	}
	function cu(e, t) {
		return (e = Ie(22, e, null, t)), (e.lanes = 0), e;
	}
	function ii(e, t, n) {
		return (
			Cn(t, e.child, null, n),
			(e = li(t, t.pendingProps.children)),
			(e.flags |= 2),
			(t.memoizedState = null),
			e
		);
	}
	function w_(e, t, n) {
		e.lanes |= t;
		var u = e.alternate;
		u !== null && (u.lanes |= t), wl(e.return, t, n);
	}
	function ri(e, t, n, u, l, i) {
		var _ = e.memoizedState;
		_ === null
			? (e.memoizedState = {
					isBackwards: t,
					rendering: null,
					renderingStartTime: 0,
					last: u,
					tail: n,
					tailMode: l,
					treeForkCount: i,
				})
			: ((_.isBackwards = t),
				(_.rendering = null),
				(_.renderingStartTime = 0),
				(_.last = u),
				(_.tail = n),
				(_.tailMode = l),
				(_.treeForkCount = i));
	}
	function v_(e, t, n) {
		var u = t.pendingProps,
			l = u.revealOrder,
			i = u.tail;
		u = u.children;
		var _ = me.current,
			b = (_ & 2) !== 0;
		if (
			(b ? ((_ = (_ & 1) | 2), (t.flags |= 128)) : (_ &= 1),
			z(me, _),
			Te(e, t, u, n),
			(u = k ? Ga : 0),
			!b && e !== null && (e.flags & 128) !== 0)
		)
			e: for (e = t.child; e !== null; ) {
				if (e.tag === 13) e.memoizedState !== null && w_(e, n, t);
				else if (e.tag === 19) w_(e, n, t);
				else if (e.child !== null) {
					(e.child.return = e), (e = e.child);
					continue;
				}
				if (e === t) break e;
				for (; e.sibling === null; ) {
					if (e.return === null || e.return === t) break e;
					e = e.return;
				}
				(e.sibling.return = e.return), (e = e.sibling);
			}
		switch (l) {
			case 'forwards':
				for (n = t.child, l = null; n !== null; )
					(e = n.alternate),
						e !== null && Kc(e) === null && (l = n),
						(n = n.sibling);
				(n = l),
					n === null
						? ((l = t.child), (t.child = null))
						: ((l = n.sibling), (n.sibling = null)),
					ri(t, false, l, n, i, u);
				break;
			case 'backwards':
			case 'unstable_legacy-backwards':
				for (n = null, l = t.child, t.child = null; l !== null; ) {
					if (((e = l.alternate), e !== null && Kc(e) === null)) {
						t.child = l;
						break;
					}
					(e = l.sibling), (l.sibling = n), (n = l), (l = e);
				}
				ri(t, true, n, null, i, u);
				break;
			case 'together':
				ri(t, false, null, null, void 0, u);
				break;
			default:
				t.memoizedState = null;
		}
		return t.child;
	}
	function Nt(e, t, n) {
		if (
			(e !== null && (t.dependencies = e.dependencies),
			(ln |= t.lanes),
			(n & t.childLanes) === 0)
		)
			if (e !== null) {
				if ((na(e, t, n, false), (n & t.childLanes) === 0)) return null;
			} else return null;
		if (e !== null && t.child !== e.child) throw Error(f(153));
		if (t.child !== null) {
			for (
				e = t.child,
					n = Dt(e, e.pendingProps),
					t.child = n,
					n.return = t;
				e.sibling !== null;

			)
				(e = e.sibling),
					(n = n.sibling = Dt(e, e.pendingProps)),
					(n.return = t);
			n.sibling = null;
		}
		return t.child;
	}
	function fi(e, t) {
		return (e.lanes & t) !== 0
			? true
			: ((e = e.dependencies), !!(e !== null && Gc(e)));
	}
	function vs(e, t, n) {
		switch (t.tag) {
			case 3:
				He(t, t.stateNode.containerInfo),
					$t(t, pe, e.memoizedState.cache),
					An();
				break;
			case 27:
			case 5:
				va(t);
				break;
			case 4:
				He(t, t.stateNode.containerInfo);
				break;
			case 10:
				$t(t, t.type, t.memoizedProps.value);
				break;
			case 31:
				if (t.memoizedState !== null)
					return (t.flags |= 128), Hl(t), null;
				break;
			case 13:
				var u = t.memoizedState;
				if (u !== null)
					return u.dehydrated !== null
						? (nn(t), (t.flags |= 128), null)
						: (n & t.child.childLanes) !== 0
							? h_(e, t, n)
							: (nn(t),
								(e = Nt(e, t, n)),
								e !== null ? e.sibling : null);
				nn(t);
				break;
			case 19:
				var l = (e.flags & 128) !== 0;
				if (
					((u = (n & t.childLanes) !== 0),
					u || (na(e, t, n, false), (u = (n & t.childLanes) !== 0)),
					l)
				) {
					if (u) return v_(e, t, n);
					t.flags |= 128;
				}
				if (
					((l = t.memoizedState),
					l !== null &&
						((l.rendering = null),
						(l.tail = null),
						(l.lastEffect = null)),
					z(me, me.current),
					u)
				)
					break;
				return null;
			case 22:
				return (t.lanes = 0), d_(e, t, n, t.pendingProps);
			case 24:
				$t(t, pe, e.memoizedState.cache);
		}
		return Nt(e, t, n);
	}
	function S_(e, t, n) {
		if (e !== null)
			if (e.memoizedProps !== t.pendingProps) je = true;
			else {
				if (!fi(e, n) && (t.flags & 128) === 0)
					return (je = false), vs(e, t, n);
				je = (e.flags & 131072) !== 0;
			}
		else (je = false), k && (t.flags & 1048576) !== 0 && tf(t, Ga, t.index);
		switch (((t.lanes = 0), t.tag)) {
			case 16:
				e: {
					var u = t.pendingProps;
					if (
						((e = Rn(t.elementType)),
						(t.type = e),
						typeof e == 'function')
					)
						gl(e)
							? ((u = Un(e, u)),
								(t.tag = 1),
								(t = y_(null, t, e, u, n)))
							: ((t.tag = 0), (t = ni(null, t, e, u, n)));
					else {
						if (e != null) {
							var l = e.$$typeof;
							if (l === at) {
								(t.tag = 11), (t = b_(null, t, e, u, n));
								break e;
							} else if (l === J) {
								(t.tag = 14), (t = s_(null, t, e, u, n));
								break e;
							}
						}
						throw ((t = Et(e) || e), Error(f(306, t, '')));
					}
				}
				return t;
			case 0:
				return ni(e, t, t.type, t.pendingProps, n);
			case 1:
				return (
					(u = t.type), (l = Un(u, t.pendingProps)), y_(e, t, u, l, n)
				);
			case 3:
				e: {
					if ((He(t, t.stateNode.containerInfo), e === null))
						throw Error(f(387));
					u = t.pendingProps;
					var i = t.memoizedState;
					(l = i.element), Ml(e, t), Ka(t, u, null, n);
					var _ = t.memoizedState;
					if (
						((u = _.cache),
						$t(t, pe, u),
						u !== i.cache && vl(t, [pe], n, true),
						Za(),
						(u = _.element),
						i.isDehydrated)
					)
						if (
							((i = {
								element: u,
								isDehydrated: false,
								cache: _.cache,
							}),
							(t.updateQueue.baseState = i),
							(t.memoizedState = i),
							t.flags & 256)
						) {
							t = j_(e, t, u, n);
							break e;
						} else if (u !== l) {
							(l = it(Error(f(424)), t)),
								qa(l),
								(t = j_(e, t, u, n));
							break e;
						} else {
							switch (
								((e = t.stateNode.containerInfo), e.nodeType)
							) {
								case 9:
									e = e.body;
									break;
								default:
									e =
										e.nodeName === 'HTML'
											? e.ownerDocument.body
											: e;
							}
							for (
								_e = bt(e.firstChild),
									Ee = t,
									k = true,
									kt = null,
									_t = true,
									n = df(t, null, u, n),
									t.child = n;
								n;

							)
								(n.flags = (n.flags & -3) | 4096),
									(n = n.sibling);
						}
					else {
						if ((An(), u === l)) {
							t = Nt(e, t, n);
							break e;
						}
						Te(e, t, u, n);
					}
					t = t.child;
				}
				return t;
			case 26:
				return (
					au(e, t),
					e === null
						? (n = No(t.type, null, t.pendingProps, null))
							? (t.memoizedState = n)
							: k ||
								((n = t.type),
								(e = t.pendingProps),
								(u = ju(Q.current).createElement(n)),
								(u[xe] = t),
								(u[qe] = e),
								Me(u, n, e),
								ve(u),
								(t.stateNode = u))
						: (t.memoizedState = No(
								t.type,
								e.memoizedProps,
								t.pendingProps,
								e.memoizedState,
							)),
					null
				);
			case 27:
				return (
					va(t),
					e === null &&
						k &&
						((u = t.stateNode =
							Co(t.type, t.pendingProps, Q.current)),
						(Ee = t),
						(_t = true),
						(l = _e),
						bn(t.type)
							? ((Yi = l), (_e = bt(u.firstChild)))
							: (_e = l)),
					Te(e, t, t.pendingProps.children, n),
					au(e, t),
					e === null && (t.flags |= 4194304),
					t.child
				);
			case 5:
				return (
					e === null &&
						k &&
						((l = u = _e) &&
							((u = Ps(u, t.type, t.pendingProps, _t)),
							u !== null
								? ((t.stateNode = u),
									(Ee = t),
									(_e = bt(u.firstChild)),
									(_t = false),
									(l = true))
								: (l = false)),
						l || It(t)),
					va(t),
					(l = t.type),
					(i = t.pendingProps),
					(_ = e !== null ? e.memoizedProps : null),
					(u = i.children),
					Bi(l, i)
						? (u = null)
						: _ !== null && Bi(l, _) && (t.flags |= 32),
					t.memoizedState !== null &&
						((l = Nl(e, t, gs, null, null, n)),
						(bc._currentValue = l)),
					au(e, t),
					Te(e, t, u, n),
					t.child
				);
			case 6:
				return (
					e === null &&
						k &&
						((e = n = _e) &&
							((n = eg(n, t.pendingProps, _t)),
							n !== null
								? ((t.stateNode = n),
									(Ee = t),
									(_e = null),
									(e = true))
								: (e = false)),
						e || It(t)),
					null
				);
			case 13:
				return h_(e, t, n);
			case 4:
				return (
					He(t, t.stateNode.containerInfo),
					(u = t.pendingProps),
					e === null ? (t.child = Cn(t, null, u, n)) : Te(e, t, u, n),
					t.child
				);
			case 11:
				return b_(e, t, t.type, t.pendingProps, n);
			case 7:
				return Te(e, t, t.pendingProps, n), t.child;
			case 8:
				return Te(e, t, t.pendingProps.children, n), t.child;
			case 12:
				return Te(e, t, t.pendingProps.children, n), t.child;
			case 10:
				return (
					(u = t.pendingProps),
					$t(t, t.type, u.value),
					Te(e, t, u.children, n),
					t.child
				);
			case 9:
				return (
					(l = t.type._context),
					(u = t.pendingProps.children),
					Mn(t),
					(l = Ae(l)),
					(u = u(l)),
					(t.flags |= 1),
					Te(e, t, u, n),
					t.child
				);
			case 14:
				return s_(e, t, t.type, t.pendingProps, n);
			case 15:
				return g_(e, t, t.type, t.pendingProps, n);
			case 19:
				return v_(e, t, n);
			case 31:
				return ws(e, t, n);
			case 22:
				return d_(e, t, n, t.pendingProps);
			case 24:
				return (
					Mn(t),
					(u = Ae(pe)),
					e === null
						? ((l = El()),
							l === null &&
								((l = fe),
								(i = Sl()),
								(l.pooledCache = i),
								i.refCount++,
								i !== null && (l.pooledCacheLanes |= n),
								(l = i)),
							(t.memoizedState = { parent: u, cache: l }),
							Tl(t),
							$t(t, pe, l))
						: ((e.lanes & n) !== 0 &&
								(Ml(e, t), Ka(t, null, null, n), Za()),
							(l = e.memoizedState),
							(i = t.memoizedState),
							l.parent !== u
								? ((l = { parent: u, cache: u }),
									(t.memoizedState = l),
									t.lanes === 0 &&
										(t.memoizedState =
											t.updateQueue.baseState =
												l),
									$t(t, pe, u))
								: ((u = i.cache),
									$t(t, pe, u),
									u !== l.cache && vl(t, [pe], n, true))),
					Te(e, t, t.pendingProps.children, n),
					t.child
				);
			case 29:
				throw t.pendingProps;
		}
		throw Error(f(156, t.tag));
	}
	function Bt(e) {
		e.flags |= 4;
	}
	function _i(e, t, n, u, l) {
		if (((t = (e.mode & 32) !== 0) && (t = false), t)) {
			if (((e.flags |= 16777216), (l & 335544128) === l))
				if (e.stateNode.complete) e.flags |= 8192;
				else if (I_()) e.flags |= 8192;
				else throw ((zn = Yc), Al);
		} else e.flags &= -16777217;
	}
	function x_(e, t) {
		if (t.type !== 'stylesheet' || (t.state.loading & 4) !== 0)
			e.flags &= -16777217;
		else if (((e.flags |= 16777216), !Vo(t)))
			if (I_()) e.flags |= 8192;
			else throw ((zn = Yc), Al);
	}
	function uu(e, t) {
		t !== null && (e.flags |= 4),
			e.flags & 16384 &&
				((t = e.tag !== 22 ? ar() : 536870912),
				(e.lanes |= t),
				(ga |= t));
	}
	function $a(e, t) {
		if (!k)
			switch (e.tailMode) {
				case 'hidden':
					t = e.tail;
					for (var n = null; t !== null; )
						t.alternate !== null && (n = t), (t = t.sibling);
					n === null ? (e.tail = null) : (n.sibling = null);
					break;
				case 'collapsed':
					n = e.tail;
					for (var u = null; n !== null; )
						n.alternate !== null && (u = n), (n = n.sibling);
					u === null
						? t || e.tail === null
							? (e.tail = null)
							: (e.tail.sibling = null)
						: (u.sibling = null);
			}
	}
	function oe(e) {
		var t = e.alternate !== null && e.alternate.child === e.child,
			n = 0,
			u = 0;
		if (t)
			for (var l = e.child; l !== null; )
				(n |= l.lanes | l.childLanes),
					(u |= l.subtreeFlags & 65011712),
					(u |= l.flags & 65011712),
					(l.return = e),
					(l = l.sibling);
		else
			for (l = e.child; l !== null; )
				(n |= l.lanes | l.childLanes),
					(u |= l.subtreeFlags),
					(u |= l.flags),
					(l.return = e),
					(l = l.sibling);
		return (e.subtreeFlags |= u), (e.childLanes = n), t;
	}
	function Ss(e, t, n) {
		var u = t.pendingProps;
		switch ((pl(t), t.tag)) {
			case 16:
			case 15:
			case 0:
			case 11:
			case 7:
			case 8:
			case 12:
			case 9:
			case 14:
				return oe(t), null;
			case 1:
				return oe(t), null;
			case 3:
				return (
					(n = t.stateNode),
					(u = null),
					e !== null && (u = e.memoizedState.cache),
					t.memoizedState.cache !== u && (t.flags |= 2048),
					Ct(pe),
					de(),
					n.pendingContext &&
						((n.context = n.pendingContext),
						(n.pendingContext = null)),
					(e === null || e.child === null) &&
						(ta(t)
							? Bt(t)
							: e === null ||
								(e.memoizedState.isDehydrated &&
									(t.flags & 256) === 0) ||
								((t.flags |= 1024), jl())),
					oe(t),
					null
				);
			case 26:
				var l = t.type,
					i = t.memoizedState;
				return (
					e === null
						? (Bt(t),
							i !== null
								? (oe(t), x_(t, i))
								: (oe(t), _i(t, l, null, u, n)))
						: i
							? i !== e.memoizedState
								? (Bt(t), oe(t), x_(t, i))
								: (oe(t), (t.flags &= -16777217))
							: ((e = e.memoizedProps),
								e !== u && Bt(t),
								oe(t),
								_i(t, l, e, u, n)),
					null
				);
			case 27:
				if (
					(mc(t),
					(n = Q.current),
					(l = t.type),
					e !== null && t.stateNode != null)
				)
					e.memoizedProps !== u && Bt(t);
				else {
					if (!u) {
						if (t.stateNode === null) throw Error(f(166));
						return oe(t), null;
					}
					(e = U.current),
						ta(t)
							? af(t)
							: ((e = Co(l, u, n)), (t.stateNode = e), Bt(t));
				}
				return oe(t), null;
			case 5:
				if ((mc(t), (l = t.type), e !== null && t.stateNode != null))
					e.memoizedProps !== u && Bt(t);
				else {
					if (!u) {
						if (t.stateNode === null) throw Error(f(166));
						return oe(t), null;
					}
					if (((i = U.current), ta(t))) af(t);
					else {
						var _ = ju(Q.current);
						switch (i) {
							case 1:
								i = _.createElementNS(
									'http://www.w3.org/2000/svg',
									l,
								);
								break;
							case 2:
								i = _.createElementNS(
									'http://www.w3.org/1998/Math/MathML',
									l,
								);
								break;
							default:
								switch (l) {
									case 'svg':
										i = _.createElementNS(
											'http://www.w3.org/2000/svg',
											l,
										);
										break;
									case 'math':
										i = _.createElementNS(
											'http://www.w3.org/1998/Math/MathML',
											l,
										);
										break;
									case 'script':
										(i = _.createElement('div')),
											(i.innerHTML =
												'<script><\/script>'),
											(i = i.removeChild(i.firstChild));
										break;
									case 'select':
										(i =
											typeof u.is == 'string'
												? _.createElement('select', {
														is: u.is,
													})
												: _.createElement('select')),
											u.multiple
												? (i.multiple = true)
												: u.size && (i.size = u.size);
										break;
									default:
										i =
											typeof u.is == 'string'
												? _.createElement(l, {
														is: u.is,
													})
												: _.createElement(l);
								}
						}
						(i[xe] = t), (i[qe] = u);
						e: for (_ = t.child; _ !== null; ) {
							if (_.tag === 5 || _.tag === 6)
								i.appendChild(_.stateNode);
							else if (
								_.tag !== 4 &&
								_.tag !== 27 &&
								_.child !== null
							) {
								(_.child.return = _), (_ = _.child);
								continue;
							}
							if (_ === t) break e;
							for (; _.sibling === null; ) {
								if (_.return === null || _.return === t)
									break e;
								_ = _.return;
							}
							(_.sibling.return = _.return), (_ = _.sibling);
						}
						t.stateNode = i;
						e: switch ((Me(i, l, u), l)) {
							case 'button':
							case 'input':
							case 'select':
							case 'textarea':
								u = !!u.autoFocus;
								break e;
							case 'img':
								u = true;
								break e;
							default:
								u = false;
						}
						u && Bt(t);
					}
				}
				return (
					oe(t),
					_i(
						t,
						t.type,
						e === null ? null : e.memoizedProps,
						t.pendingProps,
						n,
					),
					null
				);
			case 6:
				if (e && t.stateNode != null) e.memoizedProps !== u && Bt(t);
				else {
					if (typeof u != 'string' && t.stateNode === null)
						throw Error(f(166));
					if (((e = Q.current), ta(t))) {
						if (
							((e = t.stateNode),
							(n = t.memoizedProps),
							(u = null),
							(l = Ee),
							l !== null)
						)
							switch (l.tag) {
								case 27:
								case 5:
									u = l.memoizedProps;
							}
						(e[xe] = t),
							(e = !!(
								e.nodeValue === n ||
								(u !== null &&
									u.suppressHydrationWarning === true) ||
								wo(e.nodeValue, n)
							)),
							e || It(t, true);
					} else
						(e = ju(e).createTextNode(u)),
							(e[xe] = t),
							(t.stateNode = e);
				}
				return oe(t), null;
			case 31:
				if (
					((n = t.memoizedState),
					e === null || e.memoizedState !== null)
				) {
					if (((u = ta(t)), n !== null)) {
						if (e === null) {
							if (!u) throw Error(f(318));
							if (
								((e = t.memoizedState),
								(e = e !== null ? e.dehydrated : null),
								!e)
							)
								throw Error(f(557));
							e[xe] = t;
						} else
							An(),
								(t.flags & 128) === 0 &&
									(t.memoizedState = null),
								(t.flags |= 4);
						oe(t), (e = false);
					} else
						(n = jl()),
							e !== null &&
								e.memoizedState !== null &&
								(e.memoizedState.hydrationErrors = n),
							(e = true);
					if (!e) return t.flags & 256 ? (Pe(t), t) : (Pe(t), null);
					if ((t.flags & 128) !== 0) throw Error(f(558));
				}
				return oe(t), null;
			case 13:
				if (
					((u = t.memoizedState),
					e === null ||
						(e.memoizedState !== null &&
							e.memoizedState.dehydrated !== null))
				) {
					if (((l = ta(t)), u !== null && u.dehydrated !== null)) {
						if (e === null) {
							if (!l) throw Error(f(318));
							if (
								((l = t.memoizedState),
								(l = l !== null ? l.dehydrated : null),
								!l)
							)
								throw Error(f(317));
							l[xe] = t;
						} else
							An(),
								(t.flags & 128) === 0 &&
									(t.memoizedState = null),
								(t.flags |= 4);
						oe(t), (l = false);
					} else
						(l = jl()),
							e !== null &&
								e.memoizedState !== null &&
								(e.memoizedState.hydrationErrors = l),
							(l = true);
					if (!l) return t.flags & 256 ? (Pe(t), t) : (Pe(t), null);
				}
				return (
					Pe(t),
					(t.flags & 128) !== 0
						? ((t.lanes = n), t)
						: ((n = u !== null),
							(e = e !== null && e.memoizedState !== null),
							n &&
								((u = t.child),
								(l = null),
								u.alternate !== null &&
									u.alternate.memoizedState !== null &&
									u.alternate.memoizedState.cachePool !==
										null &&
									(l =
										u.alternate.memoizedState.cachePool
											.pool),
								(i = null),
								u.memoizedState !== null &&
									u.memoizedState.cachePool !== null &&
									(i = u.memoizedState.cachePool.pool),
								i !== l && (u.flags |= 2048)),
							n !== e && n && (t.child.flags |= 8192),
							uu(t, t.updateQueue),
							oe(t),
							null)
				);
			case 4:
				return (
					de(),
					e === null && zi(t.stateNode.containerInfo),
					oe(t),
					null
				);
			case 10:
				return Ct(t.type), oe(t), null;
			case 19:
				if ((D(me), (u = t.memoizedState), u === null))
					return oe(t), null;
				if (
					((l = (t.flags & 128) !== 0), (i = u.rendering), i === null)
				)
					if (l) $a(u, false);
					else {
						if (ge !== 0 || (e !== null && (e.flags & 128) !== 0))
							for (e = t.child; e !== null; ) {
								if (((i = Kc(e)), i !== null)) {
									for (
										t.flags |= 128,
											$a(u, false),
											e = i.updateQueue,
											t.updateQueue = e,
											uu(t, e),
											t.subtreeFlags = 0,
											e = n,
											n = t.child;
										n !== null;

									)
										$r(n, e), (n = n.sibling);
									return (
										z(me, (me.current & 1) | 2),
										k && Rt(t, u.treeForkCount),
										t.child
									);
								}
								e = e.sibling;
							}
						u.tail !== null &&
							We() > _u &&
							((t.flags |= 128),
							(l = true),
							$a(u, false),
							(t.lanes = 4194304));
					}
				else {
					if (!l)
						if (((e = Kc(i)), e !== null)) {
							if (
								((t.flags |= 128),
								(l = true),
								(e = e.updateQueue),
								(t.updateQueue = e),
								uu(t, e),
								$a(u, true),
								u.tail === null &&
									u.tailMode === 'hidden' &&
									!i.alternate &&
									!k)
							)
								return oe(t), null;
						} else
							2 * We() - u.renderingStartTime > _u &&
								n !== 536870912 &&
								((t.flags |= 128),
								(l = true),
								$a(u, false),
								(t.lanes = 4194304));
					u.isBackwards
						? ((i.sibling = t.child), (t.child = i))
						: ((e = u.last),
							e !== null ? (e.sibling = i) : (t.child = i),
							(u.last = i));
				}
				return u.tail !== null
					? ((e = u.tail),
						(u.rendering = e),
						(u.tail = e.sibling),
						(u.renderingStartTime = We()),
						(e.sibling = null),
						(n = me.current),
						z(me, l ? (n & 1) | 2 : n & 1),
						k && Rt(t, u.treeForkCount),
						e)
					: (oe(t), null);
			case 22:
			case 23:
				return (
					Pe(t),
					Cl(),
					(u = t.memoizedState !== null),
					e !== null
						? (e.memoizedState !== null) !== u && (t.flags |= 8192)
						: u && (t.flags |= 8192),
					u
						? (n & 536870912) !== 0 &&
							(t.flags & 128) === 0 &&
							(oe(t), t.subtreeFlags & 6 && (t.flags |= 8192))
						: oe(t),
					(n = t.updateQueue),
					n !== null && uu(t, n.retryQueue),
					(n = null),
					e !== null &&
						e.memoizedState !== null &&
						e.memoizedState.cachePool !== null &&
						(n = e.memoizedState.cachePool.pool),
					(u = null),
					t.memoizedState !== null &&
						t.memoizedState.cachePool !== null &&
						(u = t.memoizedState.cachePool.pool),
					u !== n && (t.flags |= 2048),
					e !== null && D(Dn),
					null
				);
			case 24:
				return (
					(n = null),
					e !== null && (n = e.memoizedState.cache),
					t.memoizedState.cache !== n && (t.flags |= 2048),
					Ct(pe),
					oe(t),
					null
				);
			case 25:
				return null;
			case 30:
				return null;
		}
		throw Error(f(156, t.tag));
	}
	function xs(e, t) {
		switch ((pl(t), t.tag)) {
			case 1:
				return (
					(e = t.flags),
					e & 65536 ? ((t.flags = (e & -65537) | 128), t) : null
				);
			case 3:
				return (
					Ct(pe),
					de(),
					(e = t.flags),
					(e & 65536) !== 0 && (e & 128) === 0
						? ((t.flags = (e & -65537) | 128), t)
						: null
				);
			case 26:
			case 27:
			case 5:
				return mc(t), null;
			case 31:
				if (t.memoizedState !== null) {
					if ((Pe(t), t.alternate === null)) throw Error(f(340));
					An();
				}
				return (
					(e = t.flags),
					e & 65536 ? ((t.flags = (e & -65537) | 128), t) : null
				);
			case 13:
				if (
					(Pe(t),
					(e = t.memoizedState),
					e !== null && e.dehydrated !== null)
				) {
					if (t.alternate === null) throw Error(f(340));
					An();
				}
				return (
					(e = t.flags),
					e & 65536 ? ((t.flags = (e & -65537) | 128), t) : null
				);
			case 19:
				return D(me), null;
			case 4:
				return de(), null;
			case 10:
				return Ct(t.type), null;
			case 22:
			case 23:
				return (
					Pe(t),
					Cl(),
					e !== null && D(Dn),
					(e = t.flags),
					e & 65536 ? ((t.flags = (e & -65537) | 128), t) : null
				);
			case 24:
				return Ct(pe), null;
			case 25:
				return null;
			default:
				return null;
		}
	}
	function E_(e, t) {
		switch ((pl(t), t.tag)) {
			case 3:
				Ct(pe), de();
				break;
			case 26:
			case 27:
			case 5:
				mc(t);
				break;
			case 4:
				de();
				break;
			case 31:
				t.memoizedState !== null && Pe(t);
				break;
			case 13:
				Pe(t);
				break;
			case 19:
				D(me);
				break;
			case 10:
				Ct(t.type);
				break;
			case 22:
			case 23:
				Pe(t), Cl(), e !== null && D(Dn);
				break;
			case 24:
				Ct(pe);
		}
	}
	function Pa(e, t) {
		try {
			var n = t.updateQueue,
				u = n !== null ? n.lastEffect : null;
			if (u !== null) {
				var l = u.next;
				n = l;
				do {
					if ((n.tag & e) === e) {
						u = void 0;
						var i = n.create,
							_ = n.inst;
						(u = i()), (_.destroy = u);
					}
					n = n.next;
				} while (n !== l);
			}
		} catch (b) {
			ae(t, t.return, b);
		}
	}
	function cn(e, t, n) {
		try {
			var u = t.updateQueue,
				l = u !== null ? u.lastEffect : null;
			if (l !== null) {
				var i = l.next;
				u = i;
				do {
					if ((u.tag & e) === e) {
						var _ = u.inst,
							b = _.destroy;
						if (b !== void 0) {
							(_.destroy = void 0), (l = t);
							var s = n,
								j = b;
							try {
								j();
							} catch (x) {
								ae(l, s, x);
							}
						}
					}
					u = u.next;
				} while (u !== i);
			}
		} catch (x) {
			ae(t, t.return, x);
		}
	}
	function A_(e) {
		var t = e.updateQueue;
		if (t !== null) {
			var n = e.stateNode;
			try {
				Of(t, n);
			} catch (u) {
				ae(e, e.return, u);
			}
		}
	}
	function T_(e, t, n) {
		(n.props = Un(e.type, e.memoizedProps)), (n.state = e.memoizedState);
		try {
			n.componentWillUnmount();
		} catch (u) {
			ae(e, t, u);
		}
	}
	function ec(e, t) {
		try {
			var n = e.ref;
			if (n !== null) {
				switch (e.tag) {
					case 26:
					case 27:
					case 5:
						var u = e.stateNode;
						break;
					case 30:
						u = e.stateNode;
						break;
					default:
						u = e.stateNode;
				}
				typeof n == 'function'
					? (e.refCleanup = n(u))
					: (n.current = u);
			}
		} catch (l) {
			ae(e, t, l);
		}
	}
	function vt(e, t) {
		var n = e.ref,
			u = e.refCleanup;
		if (n !== null)
			if (typeof u == 'function')
				try {
					u();
				} catch (l) {
					ae(e, t, l);
				} finally {
					(e.refCleanup = null),
						(e = e.alternate),
						e != null && (e.refCleanup = null);
				}
			else if (typeof n == 'function')
				try {
					n(null);
				} catch (l) {
					ae(e, t, l);
				}
			else n.current = null;
	}
	function M_(e) {
		var t = e.type,
			n = e.memoizedProps,
			u = e.stateNode;
		try {
			e: switch (t) {
				case 'button':
				case 'input':
				case 'select':
				case 'textarea':
					n.autoFocus && u.focus();
					break e;
				case 'img':
					n.src ? (u.src = n.src) : n.srcSet && (u.srcset = n.srcSet);
			}
		} catch (l) {
			ae(e, e.return, l);
		}
	}
	function oi(e, t, n) {
		try {
			var u = e.stateNode;
			Ws(u, e.type, n, t), (u[qe] = t);
		} catch (l) {
			ae(e, e.return, l);
		}
	}
	function D_(e) {
		return (
			e.tag === 5 ||
			e.tag === 3 ||
			e.tag === 26 ||
			(e.tag === 27 && bn(e.type)) ||
			e.tag === 4
		);
	}
	function bi(e) {
		e: for (;;) {
			for (; e.sibling === null; ) {
				if (e.return === null || D_(e.return)) return null;
				e = e.return;
			}
			for (
				e.sibling.return = e.return, e = e.sibling;
				e.tag !== 5 && e.tag !== 6 && e.tag !== 18;

			) {
				if (
					(e.tag === 27 && bn(e.type)) ||
					e.flags & 2 ||
					e.child === null ||
					e.tag === 4
				)
					continue e;
				(e.child.return = e), (e = e.child);
			}
			if (!(e.flags & 2)) return e.stateNode;
		}
	}
	function si(e, t, n) {
		var u = e.tag;
		if (u === 5 || u === 6)
			(e = e.stateNode),
				t
					? (n.nodeType === 9
							? n.body
							: n.nodeName === 'HTML'
								? n.ownerDocument.body
								: n
						).insertBefore(e, t)
					: ((t =
							n.nodeType === 9
								? n.body
								: n.nodeName === 'HTML'
									? n.ownerDocument.body
									: n),
						t.appendChild(e),
						(n = n._reactRootContainer),
						n != null || t.onclick !== null || (t.onclick = Tt));
		else if (
			u !== 4 &&
			(u === 27 && bn(e.type) && ((n = e.stateNode), (t = null)),
			(e = e.child),
			e !== null)
		)
			for (si(e, t, n), e = e.sibling; e !== null; )
				si(e, t, n), (e = e.sibling);
	}
	function lu(e, t, n) {
		var u = e.tag;
		if (u === 5 || u === 6)
			(e = e.stateNode), t ? n.insertBefore(e, t) : n.appendChild(e);
		else if (
			u !== 4 &&
			(u === 27 && bn(e.type) && (n = e.stateNode),
			(e = e.child),
			e !== null)
		)
			for (lu(e, t, n), e = e.sibling; e !== null; )
				lu(e, t, n), (e = e.sibling);
	}
	function R_(e) {
		var t = e.stateNode,
			n = e.memoizedProps;
		try {
			for (var u = e.type, l = t.attributes; l.length; )
				t.removeAttributeNode(l[0]);
			Me(t, u, n), (t[xe] = e), (t[qe] = n);
		} catch (i) {
			ae(e, e.return, i);
		}
	}
	var Gt = false,
		he = false,
		gi = false,
		z_ = typeof WeakSet == 'function' ? WeakSet : Set,
		Se = null;
	function Es(e, t) {
		if (((e = e.containerInfo), (Ui = Au), (e = Xr(e)), il(e))) {
			if ('selectionStart' in e)
				var n = { start: e.selectionStart, end: e.selectionEnd };
			else
				e: {
					n = ((n = e.ownerDocument) && n.defaultView) || window;
					var u = n.getSelection && n.getSelection();
					if (u && u.rangeCount !== 0) {
						n = u.anchorNode;
						var l = u.anchorOffset,
							i = u.focusNode;
						u = u.focusOffset;
						try {
							n.nodeType, i.nodeType;
						} catch {
							n = null;
							break e;
						}
						var _ = 0,
							b = -1,
							s = -1,
							j = 0,
							x = 0,
							M = e,
							h = null;
						t: for (;;) {
							for (
								var v;
								M !== n ||
									(l !== 0 && M.nodeType !== 3) ||
									(b = _ + l),
									M !== i ||
										(u !== 0 && M.nodeType !== 3) ||
										(s = _ + u),
									M.nodeType === 3 &&
										(_ += M.nodeValue.length),
									(v = M.firstChild) !== null;

							)
								(h = M), (M = v);
							for (;;) {
								if (M === e) break t;
								if (
									(h === n && ++j === l && (b = _),
									h === i && ++x === u && (s = _),
									(v = M.nextSibling) !== null)
								)
									break;
								(M = h), (h = M.parentNode);
							}
							M = v;
						}
						n = b === -1 || s === -1 ? null : { start: b, end: s };
					} else n = null;
				}
			n = n || { start: 0, end: 0 };
		} else n = null;
		for (
			Ni = { focusedElem: e, selectionRange: n }, Au = false, Se = t;
			Se !== null;

		)
			if (
				((t = Se),
				(e = t.child),
				(t.subtreeFlags & 1028) !== 0 && e !== null)
			)
				(e.return = t), (Se = e);
			else
				for (; Se !== null; ) {
					switch (
						((t = Se), (i = t.alternate), (e = t.flags), t.tag)
					) {
						case 0:
							if (
								(e & 4) !== 0 &&
								((e = t.updateQueue),
								(e = e !== null ? e.events : null),
								e !== null)
							)
								for (n = 0; n < e.length; n++)
									(l = e[n]), (l.ref.impl = l.nextImpl);
							break;
						case 11:
						case 15:
							break;
						case 1:
							if ((e & 1024) !== 0 && i !== null) {
								(e = void 0),
									(n = t),
									(l = i.memoizedProps),
									(i = i.memoizedState),
									(u = n.stateNode);
								try {
									var H = Un(n.type, l);
									(e = u.getSnapshotBeforeUpdate(H, i)),
										(u.__reactInternalSnapshotBeforeUpdate =
											e);
								} catch (q) {
									ae(n, n.return, q);
								}
							}
							break;
						case 3:
							if ((e & 1024) !== 0) {
								if (
									((e = t.stateNode.containerInfo),
									(n = e.nodeType),
									n === 9)
								)
									qi(e);
								else if (n === 1)
									switch (e.nodeName) {
										case 'HEAD':
										case 'HTML':
										case 'BODY':
											qi(e);
											break;
										default:
											e.textContent = '';
									}
							}
							break;
						case 5:
						case 26:
						case 27:
						case 6:
						case 4:
						case 17:
							break;
						default:
							if ((e & 1024) !== 0) throw Error(f(163));
					}
					if (((e = t.sibling), e !== null)) {
						(e.return = t.return), (Se = e);
						break;
					}
					Se = t.return;
				}
	}
	function C_(e, t, n) {
		var u = n.flags;
		switch (n.tag) {
			case 0:
			case 11:
			case 15:
				Lt(e, n), u & 4 && Pa(5, n);
				break;
			case 1:
				if ((Lt(e, n), u & 4))
					if (((e = n.stateNode), t === null))
						try {
							e.componentDidMount();
						} catch (_) {
							ae(n, n.return, _);
						}
					else {
						var l = Un(n.type, t.memoizedProps);
						t = t.memoizedState;
						try {
							e.componentDidUpdate(
								l,
								t,
								e.__reactInternalSnapshotBeforeUpdate,
							);
						} catch (_) {
							ae(n, n.return, _);
						}
					}
				u & 64 && A_(n), u & 512 && ec(n, n.return);
				break;
			case 3:
				if ((Lt(e, n), u & 64 && ((e = n.updateQueue), e !== null))) {
					if (((t = null), n.child !== null))
						switch (n.child.tag) {
							case 27:
							case 5:
								t = n.child.stateNode;
								break;
							case 1:
								t = n.child.stateNode;
						}
					try {
						Of(e, t);
					} catch (_) {
						ae(n, n.return, _);
					}
				}
				break;
			case 27:
				t === null && u & 4 && R_(n);
			case 26:
			case 5:
				Lt(e, n),
					t === null && u & 4 && M_(n),
					u & 512 && ec(n, n.return);
				break;
			case 12:
				Lt(e, n);
				break;
			case 31:
				Lt(e, n), u & 4 && N_(e, n);
				break;
			case 13:
				Lt(e, n),
					u & 4 && B_(e, n),
					u & 64 &&
						((e = n.memoizedState),
						e !== null &&
							((e = e.dehydrated),
							e !== null && ((n = Us.bind(null, n)), tg(e, n))));
				break;
			case 22:
				if (((u = n.memoizedState !== null || Gt), !u)) {
					(t = (t !== null && t.memoizedState !== null) || he),
						(l = Gt);
					var i = he;
					(Gt = u),
						(he = t) && !i
							? Vt(e, n, (n.subtreeFlags & 8772) !== 0)
							: Lt(e, n),
						(Gt = l),
						(he = i);
				}
				break;
			case 30:
				break;
			default:
				Lt(e, n);
		}
	}
	function H_(e) {
		var t = e.alternate;
		t !== null && ((e.alternate = null), H_(t)),
			(e.child = null),
			(e.deletions = null),
			(e.sibling = null),
			e.tag === 5 && ((t = e.stateNode), t !== null && Qu(t)),
			(e.stateNode = null),
			(e.return = null),
			(e.dependencies = null),
			(e.memoizedProps = null),
			(e.memoizedState = null),
			(e.pendingProps = null),
			(e.stateNode = null),
			(e.updateQueue = null);
	}
	var be = null,
		Ve = false;
	function qt(e, t, n) {
		for (n = n.child; n !== null; ) U_(e, t, n), (n = n.sibling);
	}
	function U_(e, t, n) {
		if (Fe && typeof Fe.onCommitFiberUnmount == 'function')
			try {
				Fe.onCommitFiberUnmount(Sa, n);
			} catch {}
		switch (n.tag) {
			case 26:
				he || vt(n, t),
					qt(e, t, n),
					n.memoizedState
						? n.memoizedState.count--
						: n.stateNode &&
							((n = n.stateNode), n.parentNode.removeChild(n));
				break;
			case 27:
				he || vt(n, t);
				var u = be,
					l = Ve;
				bn(n.type) && ((be = n.stateNode), (Ve = false)),
					qt(e, t, n),
					fc(n.stateNode),
					(be = u),
					(Ve = l);
				break;
			case 5:
				he || vt(n, t);
			case 6:
				if (
					((u = be),
					(l = Ve),
					(be = null),
					qt(e, t, n),
					(be = u),
					(Ve = l),
					be !== null)
				)
					if (Ve)
						try {
							(be.nodeType === 9
								? be.body
								: be.nodeName === 'HTML'
									? be.ownerDocument.body
									: be
							).removeChild(n.stateNode);
						} catch (i) {
							ae(n, t, i);
						}
					else
						try {
							be.removeChild(n.stateNode);
						} catch (i) {
							ae(n, t, i);
						}
				break;
			case 18:
				be !== null &&
					(Ve
						? ((e = be),
							To(
								e.nodeType === 9
									? e.body
									: e.nodeName === 'HTML'
										? e.ownerDocument.body
										: e,
								n.stateNode,
							),
							wa(e))
						: To(be, n.stateNode));
				break;
			case 4:
				(u = be),
					(l = Ve),
					(be = n.stateNode.containerInfo),
					(Ve = true),
					qt(e, t, n),
					(be = u),
					(Ve = l);
				break;
			case 0:
			case 11:
			case 14:
			case 15:
				cn(2, n, t), he || cn(4, n, t), qt(e, t, n);
				break;
			case 1:
				he ||
					(vt(n, t),
					(u = n.stateNode),
					typeof u.componentWillUnmount == 'function' && T_(n, t, u)),
					qt(e, t, n);
				break;
			case 21:
				qt(e, t, n);
				break;
			case 22:
				(he = (u = he) || n.memoizedState !== null),
					qt(e, t, n),
					(he = u);
				break;
			default:
				qt(e, t, n);
		}
	}
	function N_(e, t) {
		if (
			t.memoizedState === null &&
			((e = t.alternate),
			e !== null && ((e = e.memoizedState), e !== null))
		) {
			e = e.dehydrated;
			try {
				wa(e);
			} catch (n) {
				ae(t, t.return, n);
			}
		}
	}
	function B_(e, t) {
		if (
			t.memoizedState === null &&
			((e = t.alternate),
			e !== null &&
				((e = e.memoizedState),
				e !== null && ((e = e.dehydrated), e !== null)))
		)
			try {
				wa(e);
			} catch (n) {
				ae(t, t.return, n);
			}
	}
	function As(e) {
		switch (e.tag) {
			case 31:
			case 13:
			case 19:
				var t = e.stateNode;
				return t === null && (t = e.stateNode = new z_()), t;
			case 22:
				return (
					(e = e.stateNode),
					(t = e._retryCache),
					t === null && (t = e._retryCache = new z_()),
					t
				);
			default:
				throw Error(f(435, e.tag));
		}
	}
	function iu(e, t) {
		var n = As(e);
		t.forEach(function (u) {
			if (!n.has(u)) {
				n.add(u);
				var l = Ns.bind(null, e, u);
				u.then(l, l);
			}
		});
	}
	function Ye(e, t) {
		var n = t.deletions;
		if (n !== null)
			for (var u = 0; u < n.length; u++) {
				var l = n[u],
					i = e,
					_ = t,
					b = _;
				e: for (; b !== null; ) {
					switch (b.tag) {
						case 27:
							if (bn(b.type)) {
								(be = b.stateNode), (Ve = false);
								break e;
							}
							break;
						case 5:
							(be = b.stateNode), (Ve = false);
							break e;
						case 3:
						case 4:
							(be = b.stateNode.containerInfo), (Ve = true);
							break e;
					}
					b = b.return;
				}
				if (be === null) throw Error(f(160));
				U_(i, _, l),
					(be = null),
					(Ve = false),
					(i = l.alternate),
					i !== null && (i.return = null),
					(l.return = null);
			}
		if (t.subtreeFlags & 13886)
			for (t = t.child; t !== null; ) G_(t, e), (t = t.sibling);
	}
	var mt = null;
	function G_(e, t) {
		var n = e.alternate,
			u = e.flags;
		switch (e.tag) {
			case 0:
			case 11:
			case 14:
			case 15:
				Ye(t, e),
					Xe(e),
					u & 4 && (cn(3, e, e.return), Pa(3, e), cn(5, e, e.return));
				break;
			case 1:
				Ye(t, e),
					Xe(e),
					u & 512 && (he || n === null || vt(n, n.return)),
					u & 64 &&
						Gt &&
						((e = e.updateQueue),
						e !== null &&
							((u = e.callbacks),
							u !== null &&
								((n = e.shared.hiddenCallbacks),
								(e.shared.hiddenCallbacks =
									n === null ? u : n.concat(u)))));
				break;
			case 26:
				var l = mt;
				if (
					(Ye(t, e),
					Xe(e),
					u & 512 && (he || n === null || vt(n, n.return)),
					u & 4)
				) {
					var i = n !== null ? n.memoizedState : null;
					if (((u = e.memoizedState), n === null))
						if (u === null)
							if (e.stateNode === null) {
								e: {
									(u = e.type),
										(n = e.memoizedProps),
										(l = l.ownerDocument || l);
									t: switch (u) {
										case 'title':
											(i =
												l.getElementsByTagName(
													'title',
												)[0]),
												(!i ||
													i[Aa] ||
													i[xe] ||
													i.namespaceURI ===
														'http://www.w3.org/2000/svg' ||
													i.hasAttribute(
														'itemprop',
													)) &&
													((i = l.createElement(u)),
													l.head.insertBefore(
														i,
														l.querySelector(
															'head > title',
														),
													)),
												Me(i, u, n),
												(i[xe] = e),
												ve(i),
												(u = i);
											break e;
										case 'link':
											var _ = qo('link', 'href', l).get(
												u + (n.href || ''),
											);
											if (_) {
												for (
													var b = 0;
													b < _.length;
													b++
												)
													if (
														((i = _[b]),
														i.getAttribute(
															'href',
														) ===
															(n.href == null ||
															n.href === ''
																? null
																: n.href) &&
															i.getAttribute(
																'rel',
															) ===
																(n.rel == null
																	? null
																	: n.rel) &&
															i.getAttribute(
																'title',
															) ===
																(n.title == null
																	? null
																	: n.title) &&
															i.getAttribute(
																'crossorigin',
															) ===
																(n.crossOrigin ==
																null
																	? null
																	: n.crossOrigin))
													) {
														_.splice(b, 1);
														break t;
													}
											}
											(i = l.createElement(u)),
												Me(i, u, n),
												l.head.appendChild(i);
											break;
										case 'meta':
											if (
												(_ = qo(
													'meta',
													'content',
													l,
												).get(u + (n.content || '')))
											) {
												for (b = 0; b < _.length; b++)
													if (
														((i = _[b]),
														i.getAttribute(
															'content',
														) ===
															(n.content == null
																? null
																: '' +
																	n.content) &&
															i.getAttribute(
																'name',
															) ===
																(n.name == null
																	? null
																	: n.name) &&
															i.getAttribute(
																'property',
															) ===
																(n.property ==
																null
																	? null
																	: n.property) &&
															i.getAttribute(
																'http-equiv',
															) ===
																(n.httpEquiv ==
																null
																	? null
																	: n.httpEquiv) &&
															i.getAttribute(
																'charset',
															) ===
																(n.charSet ==
																null
																	? null
																	: n.charSet))
													) {
														_.splice(b, 1);
														break t;
													}
											}
											(i = l.createElement(u)),
												Me(i, u, n),
												l.head.appendChild(i);
											break;
										default:
											throw Error(f(468, u));
									}
									(i[xe] = e), ve(i), (u = i);
								}
								e.stateNode = u;
							} else Lo(l, e.type, e.stateNode);
						else e.stateNode = Go(l, u, e.memoizedProps);
					else
						i !== u
							? (i === null
									? n.stateNode !== null &&
										((n = n.stateNode),
										n.parentNode.removeChild(n))
									: i.count--,
								u === null
									? Lo(l, e.type, e.stateNode)
									: Go(l, u, e.memoizedProps))
							: u === null &&
								e.stateNode !== null &&
								oi(e, e.memoizedProps, n.memoizedProps);
				}
				break;
			case 27:
				Ye(t, e),
					Xe(e),
					u & 512 && (he || n === null || vt(n, n.return)),
					n !== null &&
						u & 4 &&
						oi(e, e.memoizedProps, n.memoizedProps);
				break;
			case 5:
				if (
					(Ye(t, e),
					Xe(e),
					u & 512 && (he || n === null || vt(n, n.return)),
					e.flags & 32)
				) {
					l = e.stateNode;
					try {
						Zn(l, '');
					} catch (H) {
						ae(e, e.return, H);
					}
				}
				u & 4 &&
					e.stateNode != null &&
					((l = e.memoizedProps),
					oi(e, l, n !== null ? n.memoizedProps : l)),
					u & 1024 && (gi = true);
				break;
			case 6:
				if ((Ye(t, e), Xe(e), u & 4)) {
					if (e.stateNode === null) throw Error(f(162));
					(u = e.memoizedProps), (n = e.stateNode);
					try {
						n.nodeValue = u;
					} catch (H) {
						ae(e, e.return, H);
					}
				}
				break;
			case 3:
				if (
					((vu = null),
					(l = mt),
					(mt = hu(t.containerInfo)),
					Ye(t, e),
					(mt = l),
					Xe(e),
					u & 4 && n !== null && n.memoizedState.isDehydrated)
				)
					try {
						wa(t.containerInfo);
					} catch (H) {
						ae(e, e.return, H);
					}
				gi && ((gi = false), q_(e));
				break;
			case 4:
				(u = mt),
					(mt = hu(e.stateNode.containerInfo)),
					Ye(t, e),
					Xe(e),
					(mt = u);
				break;
			case 12:
				Ye(t, e), Xe(e);
				break;
			case 31:
				Ye(t, e),
					Xe(e),
					u & 4 &&
						((u = e.updateQueue),
						u !== null && ((e.updateQueue = null), iu(e, u)));
				break;
			case 13:
				Ye(t, e),
					Xe(e),
					e.child.flags & 8192 &&
						(e.memoizedState !== null) !=
							(n !== null && n.memoizedState !== null) &&
						(fu = We()),
					u & 4 &&
						((u = e.updateQueue),
						u !== null && ((e.updateQueue = null), iu(e, u)));
				break;
			case 22:
				l = e.memoizedState !== null;
				var s = n !== null && n.memoizedState !== null,
					j = Gt,
					x = he;
				if (
					((Gt = j || l),
					(he = x || s),
					Ye(t, e),
					(he = x),
					(Gt = j),
					Xe(e),
					u & 8192)
				)
					e: for (
						t = e.stateNode,
							t._visibility = l
								? t._visibility & -2
								: t._visibility | 1,
							l && (n === null || s || Gt || he || Nn(e)),
							n = null,
							t = e;
						;

					) {
						if (t.tag === 5 || t.tag === 26) {
							if (n === null) {
								s = n = t;
								try {
									if (((i = s.stateNode), l))
										(_ = i.style),
											typeof _.setProperty == 'function'
												? _.setProperty(
														'display',
														'none',
														'important',
													)
												: (_.display = 'none');
									else {
										b = s.stateNode;
										var M = s.memoizedProps.style,
											h =
												M != null &&
												M.hasOwnProperty('display')
													? M.display
													: null;
										b.style.display =
											h == null || typeof h == 'boolean'
												? ''
												: ('' + h).trim();
									}
								} catch (H) {
									ae(s, s.return, H);
								}
							}
						} else if (t.tag === 6) {
							if (n === null) {
								s = t;
								try {
									s.stateNode.nodeValue = l
										? ''
										: s.memoizedProps;
								} catch (H) {
									ae(s, s.return, H);
								}
							}
						} else if (t.tag === 18) {
							if (n === null) {
								s = t;
								try {
									var v = s.stateNode;
									l ? Mo(v, true) : Mo(s.stateNode, false);
								} catch (H) {
									ae(s, s.return, H);
								}
							}
						} else if (
							((t.tag !== 22 && t.tag !== 23) ||
								t.memoizedState === null ||
								t === e) &&
							t.child !== null
						) {
							(t.child.return = t), (t = t.child);
							continue;
						}
						if (t === e) break e;
						for (; t.sibling === null; ) {
							if (t.return === null || t.return === e) break e;
							n === t && (n = null), (t = t.return);
						}
						n === t && (n = null),
							(t.sibling.return = t.return),
							(t = t.sibling);
					}
				u & 4 &&
					((u = e.updateQueue),
					u !== null &&
						((n = u.retryQueue),
						n !== null && ((u.retryQueue = null), iu(e, n))));
				break;
			case 19:
				Ye(t, e),
					Xe(e),
					u & 4 &&
						((u = e.updateQueue),
						u !== null && ((e.updateQueue = null), iu(e, u)));
				break;
			case 30:
				break;
			case 21:
				break;
			default:
				Ye(t, e), Xe(e);
		}
	}
	function Xe(e) {
		var t = e.flags;
		if (t & 2) {
			try {
				for (var n, u = e.return; u !== null; ) {
					if (D_(u)) {
						n = u;
						break;
					}
					u = u.return;
				}
				if (n == null) throw Error(f(160));
				switch (n.tag) {
					case 27:
						var l = n.stateNode,
							i = bi(e);
						lu(e, i, l);
						break;
					case 5:
						var _ = n.stateNode;
						n.flags & 32 && (Zn(_, ''), (n.flags &= -33));
						var b = bi(e);
						lu(e, b, _);
						break;
					case 3:
					case 4:
						var s = n.stateNode.containerInfo,
							j = bi(e);
						si(e, j, s);
						break;
					default:
						throw Error(f(161));
				}
			} catch (x) {
				ae(e, e.return, x);
			}
			e.flags &= -3;
		}
		t & 4096 && (e.flags &= -4097);
	}
	function q_(e) {
		if (e.subtreeFlags & 1024)
			for (e = e.child; e !== null; ) {
				var t = e;
				q_(t),
					t.tag === 5 && t.flags & 1024 && t.stateNode.reset(),
					(e = e.sibling);
			}
	}
	function Lt(e, t) {
		if (t.subtreeFlags & 8772)
			for (t = t.child; t !== null; )
				C_(e, t.alternate, t), (t = t.sibling);
	}
	function Nn(e) {
		for (e = e.child; e !== null; ) {
			var t = e;
			switch (t.tag) {
				case 0:
				case 11:
				case 14:
				case 15:
					cn(4, t, t.return), Nn(t);
					break;
				case 1:
					vt(t, t.return);
					var n = t.stateNode;
					typeof n.componentWillUnmount == 'function' &&
						T_(t, t.return, n),
						Nn(t);
					break;
				case 27:
					fc(t.stateNode);
				case 26:
				case 5:
					vt(t, t.return), Nn(t);
					break;
				case 22:
					t.memoizedState === null && Nn(t);
					break;
				case 30:
					Nn(t);
					break;
				default:
					Nn(t);
			}
			e = e.sibling;
		}
	}
	function Vt(e, t, n) {
		for (
			n = n && (t.subtreeFlags & 8772) !== 0, t = t.child;
			t !== null;

		) {
			var u = t.alternate,
				l = e,
				i = t,
				_ = i.flags;
			switch (i.tag) {
				case 0:
				case 11:
				case 15:
					Vt(l, i, n), Pa(4, i);
					break;
				case 1:
					if (
						(Vt(l, i, n),
						(u = i),
						(l = u.stateNode),
						typeof l.componentDidMount == 'function')
					)
						try {
							l.componentDidMount();
						} catch (j) {
							ae(u, u.return, j);
						}
					if (((u = i), (l = u.updateQueue), l !== null)) {
						var b = u.stateNode;
						try {
							var s = l.shared.hiddenCallbacks;
							if (s !== null)
								for (
									l.shared.hiddenCallbacks = null, l = 0;
									l < s.length;
									l++
								)
									mf(s[l], b);
						} catch (j) {
							ae(u, u.return, j);
						}
					}
					n && _ & 64 && A_(i), ec(i, i.return);
					break;
				case 27:
					R_(i);
				case 26:
				case 5:
					Vt(l, i, n),
						n && u === null && _ & 4 && M_(i),
						ec(i, i.return);
					break;
				case 12:
					Vt(l, i, n);
					break;
				case 31:
					Vt(l, i, n), n && _ & 4 && N_(l, i);
					break;
				case 13:
					Vt(l, i, n), n && _ & 4 && B_(l, i);
					break;
				case 22:
					i.memoizedState === null && Vt(l, i, n), ec(i, i.return);
					break;
				case 30:
					break;
				default:
					Vt(l, i, n);
			}
			t = t.sibling;
		}
	}
	function di(e, t) {
		var n = null;
		e !== null &&
			e.memoizedState !== null &&
			e.memoizedState.cachePool !== null &&
			(n = e.memoizedState.cachePool.pool),
			(e = null),
			t.memoizedState !== null &&
				t.memoizedState.cachePool !== null &&
				(e = t.memoizedState.cachePool.pool),
			e !== n && (e != null && e.refCount++, n != null && La(n));
	}
	function mi(e, t) {
		(e = null),
			t.alternate !== null && (e = t.alternate.memoizedState.cache),
			(t = t.memoizedState.cache),
			t !== e && (t.refCount++, e != null && La(e));
	}
	function Ot(e, t, n, u) {
		if (t.subtreeFlags & 10256)
			for (t = t.child; t !== null; ) L_(e, t, n, u), (t = t.sibling);
	}
	function L_(e, t, n, u) {
		var l = t.flags;
		switch (t.tag) {
			case 0:
			case 11:
			case 15:
				Ot(e, t, n, u), l & 2048 && Pa(9, t);
				break;
			case 1:
				Ot(e, t, n, u);
				break;
			case 3:
				Ot(e, t, n, u),
					l & 2048 &&
						((e = null),
						t.alternate !== null &&
							(e = t.alternate.memoizedState.cache),
						(t = t.memoizedState.cache),
						t !== e && (t.refCount++, e != null && La(e)));
				break;
			case 12:
				if (l & 2048) {
					Ot(e, t, n, u), (e = t.stateNode);
					try {
						var i = t.memoizedProps,
							_ = i.id,
							b = i.onPostCommit;
						typeof b == 'function' &&
							b(
								_,
								t.alternate === null ? 'mount' : 'update',
								e.passiveEffectDuration,
								-0,
							);
					} catch (s) {
						ae(t, t.return, s);
					}
				} else Ot(e, t, n, u);
				break;
			case 31:
				Ot(e, t, n, u);
				break;
			case 13:
				Ot(e, t, n, u);
				break;
			case 23:
				break;
			case 22:
				(i = t.stateNode),
					(_ = t.alternate),
					t.memoizedState !== null
						? i._visibility & 2
							? Ot(e, t, n, u)
							: tc(e, t)
						: i._visibility & 2
							? Ot(e, t, n, u)
							: ((i._visibility |= 2),
								oa(
									e,
									t,
									n,
									u,
									(t.subtreeFlags & 10256) !== 0 || false,
								)),
					l & 2048 && di(_, t);
				break;
			case 24:
				Ot(e, t, n, u), l & 2048 && mi(t.alternate, t);
				break;
			default:
				Ot(e, t, n, u);
		}
	}
	function oa(e, t, n, u, l) {
		for (
			l = l && ((t.subtreeFlags & 10256) !== 0 || false), t = t.child;
			t !== null;

		) {
			var i = e,
				_ = t,
				b = n,
				s = u,
				j = _.flags;
			switch (_.tag) {
				case 0:
				case 11:
				case 15:
					oa(i, _, b, s, l), Pa(8, _);
					break;
				case 23:
					break;
				case 22:
					var x = _.stateNode;
					_.memoizedState !== null
						? x._visibility & 2
							? oa(i, _, b, s, l)
							: tc(i, _)
						: ((x._visibility |= 2), oa(i, _, b, s, l)),
						l && j & 2048 && di(_.alternate, _);
					break;
				case 24:
					oa(i, _, b, s, l), l && j & 2048 && mi(_.alternate, _);
					break;
				default:
					oa(i, _, b, s, l);
			}
			t = t.sibling;
		}
	}
	function tc(e, t) {
		if (t.subtreeFlags & 10256)
			for (t = t.child; t !== null; ) {
				var n = e,
					u = t,
					l = u.flags;
				switch (u.tag) {
					case 22:
						tc(n, u), l & 2048 && di(u.alternate, u);
						break;
					case 24:
						tc(n, u), l & 2048 && mi(u.alternate, u);
						break;
					default:
						tc(n, u);
				}
				t = t.sibling;
			}
	}
	var nc = 8192;
	function ba(e, t, n) {
		if (e.subtreeFlags & nc)
			for (e = e.child; e !== null; ) V_(e, t, n), (e = e.sibling);
	}
	function V_(e, t, n) {
		switch (e.tag) {
			case 26:
				ba(e, t, n),
					e.flags & nc &&
						e.memoizedState !== null &&
						sg(n, mt, e.memoizedState, e.memoizedProps);
				break;
			case 5:
				ba(e, t, n);
				break;
			case 3:
			case 4:
				var u = mt;
				(mt = hu(e.stateNode.containerInfo)), ba(e, t, n), (mt = u);
				break;
			case 22:
				e.memoizedState === null &&
					((u = e.alternate),
					u !== null && u.memoizedState !== null
						? ((u = nc), (nc = 16777216), ba(e, t, n), (nc = u))
						: ba(e, t, n));
				break;
			default:
				ba(e, t, n);
		}
	}
	function Y_(e) {
		var t = e.alternate;
		if (t !== null && ((e = t.child), e !== null)) {
			t.child = null;
			do (t = e.sibling), (e.sibling = null), (e = t);
			while (e !== null);
		}
	}
	function ac(e) {
		var t = e.deletions;
		if ((e.flags & 16) !== 0) {
			if (t !== null)
				for (var n = 0; n < t.length; n++) {
					var u = t[n];
					(Se = u), Q_(u, e);
				}
			Y_(e);
		}
		if (e.subtreeFlags & 10256)
			for (e = e.child; e !== null; ) X_(e), (e = e.sibling);
	}
	function X_(e) {
		switch (e.tag) {
			case 0:
			case 11:
			case 15:
				ac(e), e.flags & 2048 && cn(9, e, e.return);
				break;
			case 3:
				ac(e);
				break;
			case 12:
				ac(e);
				break;
			case 22:
				var t = e.stateNode;
				e.memoizedState !== null &&
				t._visibility & 2 &&
				(e.return === null || e.return.tag !== 13)
					? ((t._visibility &= -3), ru(e))
					: ac(e);
				break;
			default:
				ac(e);
		}
	}
	function ru(e) {
		var t = e.deletions;
		if ((e.flags & 16) !== 0) {
			if (t !== null)
				for (var n = 0; n < t.length; n++) {
					var u = t[n];
					(Se = u), Q_(u, e);
				}
			Y_(e);
		}
		for (e = e.child; e !== null; ) {
			switch (((t = e), t.tag)) {
				case 0:
				case 11:
				case 15:
					cn(8, t, t.return), ru(t);
					break;
				case 22:
					(n = t.stateNode),
						n._visibility & 2 && ((n._visibility &= -3), ru(t));
					break;
				default:
					ru(t);
			}
			e = e.sibling;
		}
	}
	function Q_(e, t) {
		for (; Se !== null; ) {
			var n = Se;
			switch (n.tag) {
				case 0:
				case 11:
				case 15:
					cn(8, n, t);
					break;
				case 23:
				case 22:
					if (
						n.memoizedState !== null &&
						n.memoizedState.cachePool !== null
					) {
						var u = n.memoizedState.cachePool.pool;
						u != null && u.refCount++;
					}
					break;
				case 24:
					La(n.memoizedState.cache);
			}
			if (((u = n.child), u !== null)) (u.return = n), (Se = u);
			else
				e: for (n = e; Se !== null; ) {
					u = Se;
					var l = u.sibling,
						i = u.return;
					if ((H_(u), u === n)) {
						Se = null;
						break e;
					}
					if (l !== null) {
						(l.return = i), (Se = l);
						break e;
					}
					Se = i;
				}
		}
	}
	var Ts = {
			getCacheForType: function (e) {
				var t = Ae(pe),
					n = t.data.get(e);
				return n === void 0 && ((n = e()), t.data.set(e, n)), n;
			},
			cacheSignal: function () {
				return Ae(pe).controller.signal;
			},
		},
		Ms = typeof WeakMap == 'function' ? WeakMap : Map,
		ee = 0,
		fe = null,
		Z = null,
		W = 0,
		ne = 0,
		et = null,
		un = false,
		sa = false,
		Oi = false,
		Yt = 0,
		ge = 0,
		ln = 0,
		Bn = 0,
		pi = 0,
		tt = 0,
		ga = 0,
		cc = null,
		Qe = null,
		yi = false,
		fu = 0,
		Z_ = 0,
		_u = 1 / 0,
		ou = null,
		rn = null,
		we = 0,
		fn = null,
		da = null,
		Xt = 0,
		ji = 0,
		hi = null,
		K_ = null,
		uc = 0,
		wi = null;
	function nt() {
		return (ee & 2) !== 0 && W !== 0 ? W & -W : E.T !== null ? Ti() : ir();
	}
	function W_() {
		if (tt === 0)
			if ((W & 536870912) === 0 || k) {
				var e = yc;
				(yc <<= 1), (yc & 3932160) === 0 && (yc = 262144), (tt = e);
			} else tt = 536870912;
		return (e = $e.current), e !== null && (e.flags |= 32), tt;
	}
	function Ze(e, t, n) {
		((e === fe && (ne === 2 || ne === 9)) ||
			e.cancelPendingCommit !== null) &&
			(ma(e, 0), _n(e, W, tt, false)),
			Ea(e, n),
			((ee & 2) === 0 || e !== fe) &&
				(e === fe &&
					((ee & 2) === 0 && (Bn |= n),
					ge === 4 && _n(e, W, tt, false)),
				St(e));
	}
	function F_(e, t, n) {
		if ((ee & 6) !== 0) throw Error(f(327));
		var u =
				(!n && (t & 127) === 0 && (t & e.expiredLanes) === 0) ||
				xa(e, t),
			l = u ? zs(e, t) : Si(e, t, true),
			i = u;
		do {
			if (l === 0) {
				sa && !u && _n(e, t, 0, false);
				break;
			} else {
				if (((n = e.current.alternate), i && !Ds(n))) {
					(l = Si(e, t, false)), (i = false);
					continue;
				}
				if (l === 2) {
					if (((i = t), e.errorRecoveryDisabledLanes & i)) var _ = 0;
					else
						(_ = e.pendingLanes & -536870913),
							(_ = _ !== 0 ? _ : _ & 536870912 ? 536870912 : 0);
					if (_ !== 0) {
						t = _;
						e: {
							var b = e;
							l = cc;
							var s = b.current.memoizedState.isDehydrated;
							if (
								(s && (ma(b, _).flags |= 256),
								(_ = Si(b, _, false)),
								_ !== 2)
							) {
								if (Oi && !s) {
									(b.errorRecoveryDisabledLanes |= i),
										(Bn |= i),
										(l = 4);
									break e;
								}
								(i = Qe),
									(Qe = l),
									i !== null &&
										(Qe === null
											? (Qe = i)
											: Qe.push.apply(Qe, i));
							}
							l = _;
						}
						if (((i = false), l !== 2)) continue;
					}
				}
				if (l === 1) {
					ma(e, 0), _n(e, t, 0, true);
					break;
				}
				e: {
					switch (((u = e), (i = l), i)) {
						case 0:
						case 1:
							throw Error(f(345));
						case 4:
							if ((t & 4194048) !== t) break;
						case 6:
							_n(u, t, tt, !un);
							break e;
						case 2:
							Qe = null;
							break;
						case 3:
						case 5:
							break;
						default:
							throw Error(f(329));
					}
					if (
						(t & 62914560) === t &&
						((l = fu + 300 - We()), 10 < l)
					) {
						if ((_n(u, t, tt, !un), hc(u, 0, true) !== 0)) break e;
						(Xt = t),
							(u.timeoutHandle = Eo(
								J_.bind(
									null,
									u,
									n,
									Qe,
									ou,
									yi,
									t,
									tt,
									Bn,
									ga,
									un,
									i,
									'Throttled',
									-0,
									0,
								),
								l,
							));
						break e;
					}
					J_(u, n, Qe, ou, yi, t, tt, Bn, ga, un, i, null, -0, 0);
				}
			}
			break;
		} while (true);
		St(e);
	}
	function J_(e, t, n, u, l, i, _, b, s, j, x, M, h, v) {
		if (
			((e.timeoutHandle = -1),
			(M = t.subtreeFlags),
			M & 8192 || (M & 16785408) === 16785408)
		) {
			(M = {
				stylesheets: null,
				count: 0,
				imgCount: 0,
				imgBytes: 0,
				suspenseyImages: [],
				waitingForImages: true,
				waitingForViewTransition: false,
				unsuspend: Tt,
			}),
				V_(t, i, M);
			var H =
				(i & 62914560) === i
					? fu - We()
					: (i & 4194048) === i
						? Z_ - We()
						: 0;
			if (((H = gg(M, H)), H !== null)) {
				(Xt = i),
					(e.cancelPendingCommit = H(
						ao.bind(
							null,
							e,
							t,
							i,
							n,
							u,
							l,
							_,
							b,
							s,
							x,
							M,
							null,
							h,
							v,
						),
					)),
					_n(e, i, _, !j);
				return;
			}
		}
		ao(e, t, i, n, u, l, _, b, s);
	}
	function Ds(e) {
		for (var t = e; ; ) {
			var n = t.tag;
			if (
				(n === 0 || n === 11 || n === 15) &&
				t.flags & 16384 &&
				((n = t.updateQueue),
				n !== null && ((n = n.stores), n !== null))
			)
				for (var u = 0; u < n.length; u++) {
					var l = n[u],
						i = l.getSnapshot;
					l = l.value;
					try {
						if (!ke(i(), l)) return false;
					} catch {
						return false;
					}
				}
			if (((n = t.child), t.subtreeFlags & 16384 && n !== null))
				(n.return = t), (t = n);
			else {
				if (t === e) break;
				for (; t.sibling === null; ) {
					if (t.return === null || t.return === e) return true;
					t = t.return;
				}
				(t.sibling.return = t.return), (t = t.sibling);
			}
		}
		return true;
	}
	function _n(e, t, n, u) {
		(t &= ~pi),
			(t &= ~Bn),
			(e.suspendedLanes |= t),
			(e.pingedLanes &= ~t),
			u && (e.warmLanes |= t),
			(u = e.expirationTimes);
		for (var l = t; 0 < l; ) {
			var i = 31 - Je(l),
				_ = 1 << i;
			(u[i] = -1), (l &= ~_);
		}
		n !== 0 && cr(e, n, t);
	}
	function bu() {
		return (ee & 6) === 0 ? (lc(0), false) : true;
	}
	function vi() {
		if (Z !== null) {
			if (ne === 0) var e = Z.return;
			else
				(e = Z),
					(zt = Tn = null),
					ql(e),
					(la = null),
					(Ya = 0),
					(e = Z);
			for (; e !== null; ) E_(e.alternate, e), (e = e.return);
			Z = null;
		}
	}
	function ma(e, t) {
		var n = e.timeoutHandle;
		n !== -1 && ((e.timeoutHandle = -1), ks(n)),
			(n = e.cancelPendingCommit),
			n !== null && ((e.cancelPendingCommit = null), n()),
			(Xt = 0),
			vi(),
			(fe = e),
			(Z = n = Dt(e.current, null)),
			(W = t),
			(ne = 0),
			(et = null),
			(un = false),
			(sa = xa(e, t)),
			(Oi = false),
			(ga = tt = pi = Bn = ln = ge = 0),
			(Qe = cc = null),
			(yi = false),
			(t & 8) !== 0 && (t |= t & 32);
		var u = e.entangledLanes;
		if (u !== 0)
			for (e = e.entanglements, u &= t; 0 < u; ) {
				var l = 31 - Je(u),
					i = 1 << l;
				(t |= e[l]), (u &= ~i);
			}
		return (Yt = t), Cc(), n;
	}
	function k_(e, t) {
		(Y = null),
			(E.H = ka),
			t === ua || t === Vc
				? ((t = bf()), (ne = 3))
				: t === Al
					? ((t = bf()), (ne = 4))
					: (ne =
							t === ti
								? 8
								: t !== null &&
									  typeof t == 'object' &&
									  typeof t.then == 'function'
									? 6
									: 1),
			(et = t),
			Z === null && ((ge = 1), tu(e, it(t, e.current)));
	}
	function I_() {
		var e = $e.current;
		return e === null
			? true
			: (W & 4194048) === W
				? ot === null
				: (W & 62914560) === W || (W & 536870912) !== 0
					? e === ot
					: false;
	}
	function $_() {
		var e = E.H;
		return (E.H = ka), e === null ? ka : e;
	}
	function P_() {
		var e = E.A;
		return (E.A = Ts), e;
	}
	function su() {
		(ge = 4),
			un || ((W & 4194048) !== W && $e.current !== null) || (sa = true),
			((ln & 134217727) === 0 && (Bn & 134217727) === 0) ||
				fe === null ||
				_n(fe, W, tt, false);
	}
	function Si(e, t, n) {
		var u = ee;
		ee |= 2;
		var l = $_(),
			i = P_();
		(fe !== e || W !== t) && ((ou = null), ma(e, t)), (t = false);
		var _ = ge;
		e: do
			try {
				if (ne !== 0 && Z !== null) {
					var b = Z,
						s = et;
					switch (ne) {
						case 8:
							vi(), (_ = 6);
							break e;
						case 3:
						case 2:
						case 9:
						case 6:
							$e.current === null && (t = true);
							var j = ne;
							if (
								((ne = 0), (et = null), Oa(e, b, s, j), n && sa)
							) {
								_ = 0;
								break e;
							}
							break;
						default:
							(j = ne), (ne = 0), (et = null), Oa(e, b, s, j);
					}
				}
				Rs(), (_ = ge);
				break;
			} catch (x) {
				k_(e, x);
			}
		while (true);
		return (
			t && e.shellSuspendCounter++,
			(zt = Tn = null),
			(ee = u),
			(E.H = l),
			(E.A = i),
			Z === null && ((fe = null), (W = 0), Cc()),
			_
		);
	}
	function Rs() {
		for (; Z !== null; ) eo(Z);
	}
	function zs(e, t) {
		var n = ee;
		ee |= 2;
		var u = $_(),
			l = P_();
		fe !== e || W !== t
			? ((ou = null), (_u = We() + 500), ma(e, t))
			: (sa = xa(e, t));
		e: do
			try {
				if (ne !== 0 && Z !== null) {
					t = Z;
					var i = et;
					t: switch (ne) {
						case 1:
							(ne = 0), (et = null), Oa(e, t, i, 1);
							break;
						case 2:
						case 9:
							if (_f(i)) {
								(ne = 0), (et = null), to(t);
								break;
							}
							(t = function () {
								(ne !== 2 && ne !== 9) || fe !== e || (ne = 7),
									St(e);
							}),
								i.then(t, t);
							break e;
						case 3:
							ne = 7;
							break e;
						case 4:
							ne = 5;
							break e;
						case 7:
							_f(i)
								? ((ne = 0), (et = null), to(t))
								: ((ne = 0), (et = null), Oa(e, t, i, 7));
							break;
						case 5:
							var _ = null;
							switch (Z.tag) {
								case 26:
									_ = Z.memoizedState;
								case 5:
								case 27:
									var b = Z;
									if (_ ? Vo(_) : b.stateNode.complete) {
										(ne = 0), (et = null);
										var s = b.sibling;
										if (s !== null) Z = s;
										else {
											var j = b.return;
											j !== null
												? ((Z = j), gu(j))
												: (Z = null);
										}
										break t;
									}
							}
							(ne = 0), (et = null), Oa(e, t, i, 5);
							break;
						case 6:
							(ne = 0), (et = null), Oa(e, t, i, 6);
							break;
						case 8:
							vi(), (ge = 6);
							break e;
						default:
							throw Error(f(462));
					}
				}
				Cs();
				break;
			} catch (x) {
				k_(e, x);
			}
		while (true);
		return (
			(zt = Tn = null),
			(E.H = u),
			(E.A = l),
			(ee = n),
			Z !== null ? 0 : ((fe = null), (W = 0), Cc(), ge)
		);
	}
	function Cs() {
		for (; Z !== null && !nb(); ) eo(Z);
	}
	function eo(e) {
		var t = S_(e.alternate, e, Yt);
		(e.memoizedProps = e.pendingProps), t === null ? gu(e) : (Z = t);
	}
	function to(e) {
		var t = e,
			n = t.alternate;
		switch (t.tag) {
			case 15:
			case 0:
				t = p_(n, t, t.pendingProps, t.type, void 0, W);
				break;
			case 11:
				t = p_(n, t, t.pendingProps, t.type.render, t.ref, W);
				break;
			case 5:
				ql(t);
			default:
				E_(n, t), (t = Z = $r(t, Yt)), (t = S_(n, t, Yt));
		}
		(e.memoizedProps = e.pendingProps), t === null ? gu(e) : (Z = t);
	}
	function Oa(e, t, n, u) {
		(zt = Tn = null), ql(t), (la = null), (Ya = 0);
		var l = t.return;
		try {
			if (hs(e, l, t, n, W)) {
				(ge = 1), tu(e, it(n, e.current)), (Z = null);
				return;
			}
		} catch (i) {
			if (l !== null) throw ((Z = l), i);
			(ge = 1), tu(e, it(n, e.current)), (Z = null);
			return;
		}
		t.flags & 32768
			? (k || u === 1
					? (e = true)
					: sa || (W & 536870912) !== 0
						? (e = false)
						: ((un = e = true),
							(u === 2 || u === 9 || u === 3 || u === 6) &&
								((u = $e.current),
								u !== null &&
									u.tag === 13 &&
									(u.flags |= 16384))),
				no(t, e))
			: gu(t);
	}
	function gu(e) {
		var t = e;
		do {
			if ((t.flags & 32768) !== 0) {
				no(t, un);
				return;
			}
			e = t.return;
			var n = Ss(t.alternate, t, Yt);
			if (n !== null) {
				Z = n;
				return;
			}
			if (((t = t.sibling), t !== null)) {
				Z = t;
				return;
			}
			Z = t = e;
		} while (t !== null);
		ge === 0 && (ge = 5);
	}
	function no(e, t) {
		do {
			var n = xs(e.alternate, e);
			if (n !== null) {
				(n.flags &= 32767), (Z = n);
				return;
			}
			if (
				((n = e.return),
				n !== null &&
					((n.flags |= 32768),
					(n.subtreeFlags = 0),
					(n.deletions = null)),
				!t && ((e = e.sibling), e !== null))
			) {
				Z = e;
				return;
			}
			Z = e = n;
		} while (e !== null);
		(ge = 6), (Z = null);
	}
	function ao(e, t, n, u, l, i, _, b, s) {
		e.cancelPendingCommit = null;
		do du();
		while (we !== 0);
		if ((ee & 6) !== 0) throw Error(f(327));
		if (t !== null) {
			if (t === e.current) throw Error(f(177));
			if (
				((i = t.lanes | t.childLanes),
				(i |= bl),
				bb(e, n, i, _, b, s),
				e === fe && ((Z = fe = null), (W = 0)),
				(da = t),
				(fn = e),
				(Xt = n),
				(ji = i),
				(hi = l),
				(K_ = u),
				(t.subtreeFlags & 10256) !== 0 || (t.flags & 10256) !== 0
					? ((e.callbackNode = null),
						(e.callbackPriority = 0),
						Bs(Oc, function () {
							return ro(), null;
						}))
					: ((e.callbackNode = null), (e.callbackPriority = 0)),
				(u = (t.flags & 13878) !== 0),
				(t.subtreeFlags & 13878) !== 0 || u)
			) {
				(u = E.T),
					(E.T = null),
					(l = R.p),
					(R.p = 2),
					(_ = ee),
					(ee |= 4);
				try {
					Es(e, t, n);
				} finally {
					(ee = _), (R.p = l), (E.T = u);
				}
			}
			(we = 1), co(), uo(), lo();
		}
	}
	function co() {
		if (we === 1) {
			we = 0;
			var e = fn,
				t = da,
				n = (t.flags & 13878) !== 0;
			if ((t.subtreeFlags & 13878) !== 0 || n) {
				(n = E.T), (E.T = null);
				var u = R.p;
				R.p = 2;
				var l = ee;
				ee |= 4;
				try {
					G_(t, e);
					var i = Ni,
						_ = Xr(e.containerInfo),
						b = i.focusedElem,
						s = i.selectionRange;
					if (
						_ !== b &&
						b &&
						b.ownerDocument &&
						Yr(b.ownerDocument.documentElement, b)
					) {
						if (s !== null && il(b)) {
							var j = s.start,
								x = s.end;
							if (
								(x === void 0 && (x = j), 'selectionStart' in b)
							)
								(b.selectionStart = j),
									(b.selectionEnd = Math.min(
										x,
										b.value.length,
									));
							else {
								var M = b.ownerDocument || document,
									h = (M && M.defaultView) || window;
								if (h.getSelection) {
									var v = h.getSelection(),
										H = b.textContent.length,
										q = Math.min(s.start, H),
										ie =
											s.end === void 0
												? q
												: Math.min(s.end, H);
									!v.extend &&
										q > ie &&
										((_ = ie), (ie = q), (q = _));
									var O = Vr(b, q),
										d = Vr(b, ie);
									if (
										O &&
										d &&
										(v.rangeCount !== 1 ||
											v.anchorNode !== O.node ||
											v.anchorOffset !== O.offset ||
											v.focusNode !== d.node ||
											v.focusOffset !== d.offset)
									) {
										var y = M.createRange();
										y.setStart(O.node, O.offset),
											v.removeAllRanges(),
											q > ie
												? (v.addRange(y),
													v.extend(d.node, d.offset))
												: (y.setEnd(d.node, d.offset),
													v.addRange(y));
									}
								}
							}
						}
						for (M = [], v = b; (v = v.parentNode); )
							v.nodeType === 1 &&
								M.push({
									element: v,
									left: v.scrollLeft,
									top: v.scrollTop,
								});
						for (
							typeof b.focus == 'function' && b.focus(), b = 0;
							b < M.length;
							b++
						) {
							var A = M[b];
							(A.element.scrollLeft = A.left),
								(A.element.scrollTop = A.top);
						}
					}
					(Au = !!Ui), (Ni = Ui = null);
				} finally {
					(ee = l), (R.p = u), (E.T = n);
				}
			}
			(e.current = t), (we = 2);
		}
	}
	function uo() {
		if (we === 2) {
			we = 0;
			var e = fn,
				t = da,
				n = (t.flags & 8772) !== 0;
			if ((t.subtreeFlags & 8772) !== 0 || n) {
				(n = E.T), (E.T = null);
				var u = R.p;
				R.p = 2;
				var l = ee;
				ee |= 4;
				try {
					C_(e, t.alternate, t);
				} finally {
					(ee = l), (R.p = u), (E.T = n);
				}
			}
			we = 3;
		}
	}
	function lo() {
		if (we === 4 || we === 3) {
			(we = 0), ab();
			var e = fn,
				t = da,
				n = Xt,
				u = K_;
			(t.subtreeFlags & 10256) !== 0 || (t.flags & 10256) !== 0
				? (we = 5)
				: ((we = 0), (da = fn = null), io(e, e.pendingLanes));
			var l = e.pendingLanes;
			if (
				(l === 0 && (rn = null),
				Yu(n),
				(t = t.stateNode),
				Fe && typeof Fe.onCommitFiberRoot == 'function')
			)
				try {
					Fe.onCommitFiberRoot(
						Sa,
						t,
						void 0,
						(t.current.flags & 128) === 128,
					);
				} catch {}
			if (u !== null) {
				(t = E.T), (l = R.p), (R.p = 2), (E.T = null);
				try {
					for (
						var i = e.onRecoverableError, _ = 0;
						_ < u.length;
						_++
					) {
						var b = u[_];
						i(b.value, { componentStack: b.stack });
					}
				} finally {
					(E.T = t), (R.p = l);
				}
			}
			(Xt & 3) !== 0 && du(),
				St(e),
				(l = e.pendingLanes),
				(n & 261930) !== 0 && (l & 42) !== 0
					? e === wi
						? uc++
						: ((uc = 0), (wi = e))
					: (uc = 0),
				lc(0);
		}
	}
	function io(e, t) {
		(e.pooledCacheLanes &= t) === 0 &&
			((t = e.pooledCache), t != null && ((e.pooledCache = null), La(t)));
	}
	function du() {
		return co(), uo(), lo(), ro();
	}
	function ro() {
		if (we !== 5) return false;
		var e = fn,
			t = ji;
		ji = 0;
		var n = Yu(Xt),
			u = E.T,
			l = R.p;
		try {
			(R.p = 32 > n ? 32 : n), (E.T = null), (n = hi), (hi = null);
			var i = fn,
				_ = Xt;
			if (((we = 0), (da = fn = null), (Xt = 0), (ee & 6) !== 0))
				throw Error(f(331));
			var b = ee;
			if (
				((ee |= 4),
				X_(i.current),
				L_(i, i.current, _, n),
				(ee = b),
				lc(0, false),
				Fe && typeof Fe.onPostCommitFiberRoot == 'function')
			)
				try {
					Fe.onPostCommitFiberRoot(Sa, i);
				} catch {}
			return true;
		} finally {
			(R.p = l), (E.T = u), io(e, t);
		}
	}
	function fo(e, t, n) {
		(t = it(n, t)),
			(t = ei(e.stateNode, t, 2)),
			(e = tn(e, t, 2)),
			e !== null && (Ea(e, 2), St(e));
	}
	function ae(e, t, n) {
		if (e.tag === 3) fo(e, e, n);
		else
			for (; t !== null; ) {
				if (t.tag === 3) {
					fo(t, e, n);
					break;
				} else if (t.tag === 1) {
					var u = t.stateNode;
					if (
						typeof t.type.getDerivedStateFromError == 'function' ||
						(typeof u.componentDidCatch == 'function' &&
							(rn === null || !rn.has(u)))
					) {
						(e = it(n, e)),
							(n = __(2)),
							(u = tn(t, n, 2)),
							u !== null && (o_(n, u, t, e), Ea(u, 2), St(u));
						break;
					}
				}
				t = t.return;
			}
	}
	function xi(e, t, n) {
		var u = e.pingCache;
		if (u === null) {
			u = e.pingCache = new Ms();
			var l = /* @__PURE__ */ new Set();
			u.set(t, l);
		} else
			(l = u.get(t)),
				l === void 0 && ((l = /* @__PURE__ */ new Set()), u.set(t, l));
		l.has(n) ||
			((Oi = true), l.add(n), (e = Hs.bind(null, e, t, n)), t.then(e, e));
	}
	function Hs(e, t, n) {
		var u = e.pingCache;
		u !== null && u.delete(t),
			(e.pingedLanes |= e.suspendedLanes & n),
			(e.warmLanes &= ~n),
			fe === e &&
				(W & n) === n &&
				(ge === 4 ||
				(ge === 3 && (W & 62914560) === W && 300 > We() - fu)
					? (ee & 2) === 0 && ma(e, 0)
					: (pi |= n),
				ga === W && (ga = 0)),
			St(e);
	}
	function _o(e, t) {
		t === 0 && (t = ar()), (e = xn(e, t)), e !== null && (Ea(e, t), St(e));
	}
	function Us(e) {
		var t = e.memoizedState,
			n = 0;
		t !== null && (n = t.retryLane), _o(e, n);
	}
	function Ns(e, t) {
		var n = 0;
		switch (e.tag) {
			case 31:
			case 13:
				var u = e.stateNode,
					l = e.memoizedState;
				l !== null && (n = l.retryLane);
				break;
			case 19:
				u = e.stateNode;
				break;
			case 22:
				u = e.stateNode._retryCache;
				break;
			default:
				throw Error(f(314));
		}
		u !== null && u.delete(t), _o(e, n);
	}
	function Bs(e, t) {
		return Gu(e, t);
	}
	var mu = null,
		pa = null,
		Ei = false,
		Ou = false,
		Ai = false,
		on = 0;
	function St(e) {
		e !== pa &&
			e.next === null &&
			(pa === null ? (mu = pa = e) : (pa = pa.next = e)),
			(Ou = true),
			Ei || ((Ei = true), qs());
	}
	function lc(e, t) {
		if (!Ai && Ou) {
			Ai = true;
			do
				for (var n = false, u = mu; u !== null; ) {
					if (e !== 0) {
						var l = u.pendingLanes;
						if (l === 0) var i = 0;
						else {
							var _ = u.suspendedLanes,
								b = u.pingedLanes;
							(i = (1 << (31 - Je(42 | e) + 1)) - 1),
								(i &= l & ~(_ & ~b)),
								(i =
									i & 201326741
										? (i & 201326741) | 1
										: i
											? i | 2
											: 0);
						}
						i !== 0 && ((n = true), go(u, i));
					} else
						(i = W),
							(i = hc(
								u,
								u === fe ? i : 0,
								u.cancelPendingCommit !== null ||
									u.timeoutHandle !== -1,
							)),
							(i & 3) === 0 || xa(u, i) || ((n = true), go(u, i));
					u = u.next;
				}
			while (n);
			Ai = false;
		}
	}
	function Gs() {
		oo();
	}
	function oo() {
		Ou = Ei = false;
		var e = 0;
		on !== 0 && Js() && (e = on);
		for (var t = We(), n = null, u = mu; u !== null; ) {
			var l = u.next,
				i = bo(u, t);
			i === 0
				? ((u.next = null),
					n === null ? (mu = l) : (n.next = l),
					l === null && (pa = n))
				: ((n = u), (e !== 0 || (i & 3) !== 0) && (Ou = true)),
				(u = l);
		}
		(we !== 0 && we !== 5) || lc(e), on !== 0 && (on = 0);
	}
	function bo(e, t) {
		for (
			var n = e.suspendedLanes,
				u = e.pingedLanes,
				l = e.expirationTimes,
				i = e.pendingLanes & -62914561;
			0 < i;

		) {
			var _ = 31 - Je(i),
				b = 1 << _,
				s = l[_];
			s === -1
				? ((b & n) === 0 || (b & u) !== 0) && (l[_] = ob(b, t))
				: s <= t && (e.expiredLanes |= b),
				(i &= ~b);
		}
		if (
			((t = fe),
			(n = W),
			(n = hc(
				e,
				e === t ? n : 0,
				e.cancelPendingCommit !== null || e.timeoutHandle !== -1,
			)),
			(u = e.callbackNode),
			n === 0 ||
				(e === t && (ne === 2 || ne === 9)) ||
				e.cancelPendingCommit !== null)
		)
			return (
				u !== null && u !== null && qu(u),
				(e.callbackNode = null),
				(e.callbackPriority = 0)
			);
		if ((n & 3) === 0 || xa(e, n)) {
			if (((t = n & -n), t === e.callbackPriority)) return t;
			switch ((u !== null && qu(u), Yu(n))) {
				case 2:
				case 8:
					n = tr;
					break;
				case 32:
					n = Oc;
					break;
				case 268435456:
					n = nr;
					break;
				default:
					n = Oc;
			}
			return (
				(u = so.bind(null, e)),
				(n = Gu(n, u)),
				(e.callbackPriority = t),
				(e.callbackNode = n),
				t
			);
		}
		return (
			u !== null && u !== null && qu(u),
			(e.callbackPriority = 2),
			(e.callbackNode = null),
			2
		);
	}
	function so(e, t) {
		if (we !== 0 && we !== 5)
			return (e.callbackNode = null), (e.callbackPriority = 0), null;
		var n = e.callbackNode;
		if (du() && e.callbackNode !== n) return null;
		var u = W;
		return (
			(u = hc(
				e,
				e === fe ? u : 0,
				e.cancelPendingCommit !== null || e.timeoutHandle !== -1,
			)),
			u === 0
				? null
				: (F_(e, u, t),
					bo(e, We()),
					e.callbackNode != null && e.callbackNode === n
						? so.bind(null, e)
						: null)
		);
	}
	function go(e, t) {
		if (du()) return null;
		F_(e, t, true);
	}
	function qs() {
		Is(function () {
			(ee & 6) !== 0 ? Gu(er, Gs) : oo();
		});
	}
	function Ti() {
		if (on === 0) {
			var e = aa;
			e === 0 &&
				((e = pc), (pc <<= 1), (pc & 261888) === 0 && (pc = 256)),
				(on = e);
		}
		return on;
	}
	function mo(e) {
		return e == null || typeof e == 'symbol' || typeof e == 'boolean'
			? null
			: typeof e == 'function'
				? e
				: xc('' + e);
	}
	function Oo(e, t) {
		var n = t.ownerDocument.createElement('input');
		return (
			(n.name = t.name),
			(n.value = t.value),
			e.id && n.setAttribute('form', e.id),
			t.parentNode.insertBefore(n, t),
			(e = new FormData(e)),
			n.parentNode.removeChild(n),
			e
		);
	}
	function Ls(e, t, n, u, l) {
		if (t === 'submit' && n && n.stateNode === l) {
			var i = mo((l[qe] || null).action),
				_ = u.submitter;
			_ &&
				((t = (t = _[qe] || null)
					? mo(t.formAction)
					: _.getAttribute('formAction')),
				t !== null && ((i = t), (_ = null)));
			var b = new Mc('action', 'action', null, u, l);
			e.push({
				event: b,
				listeners: [
					{
						instance: null,
						listener: function () {
							if (u.defaultPrevented) {
								if (on !== 0) {
									var s = _ ? Oo(l, _) : new FormData(l);
									Fl(
										n,
										{
											pending: true,
											data: s,
											method: l.method,
											action: i,
										},
										null,
										s,
									);
								}
							} else
								typeof i == 'function' &&
									(b.preventDefault(),
									(s = _ ? Oo(l, _) : new FormData(l)),
									Fl(
										n,
										{
											pending: true,
											data: s,
											method: l.method,
											action: i,
										},
										i,
										s,
									));
						},
						currentTarget: l,
					},
				],
			});
		}
	}
	for (var Mi = 0; Mi < ol.length; Mi++) {
		var Di = ol[Mi],
			Vs = Di.toLowerCase(),
			Ys = Di[0].toUpperCase() + Di.slice(1);
		dt(Vs, 'on' + Ys);
	}
	dt(Kr, 'onAnimationEnd'),
		dt(Wr, 'onAnimationIteration'),
		dt(Fr, 'onAnimationStart'),
		dt('dblclick', 'onDoubleClick'),
		dt('focusin', 'onFocus'),
		dt('focusout', 'onBlur'),
		dt(cs, 'onTransitionRun'),
		dt(us, 'onTransitionStart'),
		dt(ls, 'onTransitionCancel'),
		dt(Jr, 'onTransitionEnd'),
		Xn('onMouseEnter', ['mouseout', 'mouseover']),
		Xn('onMouseLeave', ['mouseout', 'mouseover']),
		Xn('onPointerEnter', ['pointerout', 'pointerover']),
		Xn('onPointerLeave', ['pointerout', 'pointerover']),
		hn(
			'onChange',
			'change click focusin focusout input keydown keyup selectionchange'.split(
				' ',
			),
		),
		hn(
			'onSelect',
			'focusout contextmenu dragend focusin keydown keyup mousedown mouseup selectionchange'.split(
				' ',
			),
		),
		hn('onBeforeInput', [
			'compositionend',
			'keypress',
			'textInput',
			'paste',
		]),
		hn(
			'onCompositionEnd',
			'compositionend focusout keydown keypress keyup mousedown'.split(
				' ',
			),
		),
		hn(
			'onCompositionStart',
			'compositionstart focusout keydown keypress keyup mousedown'.split(
				' ',
			),
		),
		hn(
			'onCompositionUpdate',
			'compositionupdate focusout keydown keypress keyup mousedown'.split(
				' ',
			),
		);
	var ic =
			'abort canplay canplaythrough durationchange emptied encrypted ended error loadeddata loadedmetadata loadstart pause play playing progress ratechange resize seeked seeking stalled suspend timeupdate volumechange waiting'.split(
				' ',
			),
		Xs = new Set(
			'beforetoggle cancel close invalid load scroll scrollend toggle'
				.split(' ')
				.concat(ic),
		);
	function po(e, t) {
		t = (t & 4) !== 0;
		for (var n = 0; n < e.length; n++) {
			var u = e[n],
				l = u.event;
			u = u.listeners;
			e: {
				var i = void 0;
				if (t)
					for (var _ = u.length - 1; 0 <= _; _--) {
						var b = u[_],
							s = b.instance,
							j = b.currentTarget;
						if (
							((b = b.listener),
							s !== i && l.isPropagationStopped())
						)
							break e;
						(i = b), (l.currentTarget = j);
						try {
							i(l);
						} catch (x) {
							zc(x);
						}
						(l.currentTarget = null), (i = s);
					}
				else
					for (_ = 0; _ < u.length; _++) {
						if (
							((b = u[_]),
							(s = b.instance),
							(j = b.currentTarget),
							(b = b.listener),
							s !== i && l.isPropagationStopped())
						)
							break e;
						(i = b), (l.currentTarget = j);
						try {
							i(l);
						} catch (x) {
							zc(x);
						}
						(l.currentTarget = null), (i = s);
					}
			}
		}
	}
	function K(e, t) {
		var n = t[Xu];
		n === void 0 && (n = t[Xu] = /* @__PURE__ */ new Set());
		var u = e + '__bubble';
		n.has(u) || (yo(t, e, 2, false), n.add(u));
	}
	function Ri(e, t, n) {
		var u = 0;
		t && (u |= 4), yo(n, e, u, t);
	}
	var pu = '_reactListening' + Math.random().toString(36).slice(2);
	function zi(e) {
		if (!e[pu]) {
			(e[pu] = true),
				_r.forEach(function (n) {
					n !== 'selectionchange' &&
						(Xs.has(n) || Ri(n, false, e), Ri(n, true, e));
				});
			var t = e.nodeType === 9 ? e : e.ownerDocument;
			t === null ||
				t[pu] ||
				((t[pu] = true), Ri('selectionchange', false, t));
		}
	}
	function yo(e, t, n, u) {
		switch (Fo(t)) {
			case 2:
				var l = Og;
				break;
			case 8:
				l = pg;
				break;
			default:
				l = Wi;
		}
		(n = l.bind(null, t, n, e)),
			(l = void 0),
			!$u ||
				(t !== 'touchstart' && t !== 'touchmove' && t !== 'wheel') ||
				(l = true),
			u
				? l !== void 0
					? e.addEventListener(t, n, { capture: true, passive: l })
					: e.addEventListener(t, n, true)
				: l !== void 0
					? e.addEventListener(t, n, { passive: l })
					: e.addEventListener(t, n, false);
	}
	function Ci(e, t, n, u, l) {
		var i = u;
		if ((t & 1) === 0 && (t & 2) === 0 && u !== null)
			e: for (;;) {
				if (u === null) return;
				var _ = u.tag;
				if (_ === 3 || _ === 4) {
					var b = u.stateNode.containerInfo;
					if (b === l) break;
					if (_ === 4)
						for (_ = u.return; _ !== null; ) {
							var s = _.tag;
							if (
								(s === 3 || s === 4) &&
								_.stateNode.containerInfo === l
							)
								return;
							_ = _.return;
						}
					for (; b !== null; ) {
						if (((_ = Ln(b)), _ === null)) return;
						if (
							((s = _.tag),
							s === 5 || s === 6 || s === 26 || s === 27)
						) {
							u = i = _;
							continue e;
						}
						b = b.parentNode;
					}
				}
				u = u.return;
			}
		wr(function () {
			var j = i,
				x = ku(n),
				M = [];
			e: {
				var h = kr.get(e);
				if (h !== void 0) {
					var v = Mc,
						H = e;
					switch (e) {
						case 'keypress':
							if (Ac(n) === 0) break e;
						case 'keydown':
						case 'keyup':
							v = Nb;
							break;
						case 'focusin':
							(H = 'focus'), (v = nl);
							break;
						case 'focusout':
							(H = 'blur'), (v = nl);
							break;
						case 'beforeblur':
						case 'afterblur':
							v = nl;
							break;
						case 'click':
							if (n.button === 2) break e;
						case 'auxclick':
						case 'dblclick':
						case 'mousedown':
						case 'mousemove':
						case 'mouseup':
						case 'mouseout':
						case 'mouseover':
						case 'contextmenu':
							v = xr;
							break;
						case 'drag':
						case 'dragend':
						case 'dragenter':
						case 'dragexit':
						case 'dragleave':
						case 'dragover':
						case 'dragstart':
						case 'drop':
							v = Sb;
							break;
						case 'touchcancel':
						case 'touchend':
						case 'touchmove':
						case 'touchstart':
							v = qb;
							break;
						case Kr:
						case Wr:
						case Fr:
							v = Ab;
							break;
						case Jr:
							v = Vb;
							break;
						case 'scroll':
						case 'scrollend':
							v = wb;
							break;
						case 'wheel':
							v = Xb;
							break;
						case 'copy':
						case 'cut':
						case 'paste':
							v = Mb;
							break;
						case 'gotpointercapture':
						case 'lostpointercapture':
						case 'pointercancel':
						case 'pointerdown':
						case 'pointermove':
						case 'pointerout':
						case 'pointerover':
						case 'pointerup':
							v = Ar;
							break;
						case 'toggle':
						case 'beforetoggle':
							v = Zb;
					}
					var q = (t & 4) !== 0,
						ie = !q && (e === 'scroll' || e === 'scrollend'),
						O = q ? (h !== null ? h + 'Capture' : null) : h;
					q = [];
					for (var d = j, y; d !== null; ) {
						var A = d;
						if (
							((y = A.stateNode),
							(A = A.tag),
							(A !== 5 && A !== 26 && A !== 27) ||
								y === null ||
								O === null ||
								((A = Ma(d, O)),
								A != null && q.push(rc(d, A, y))),
							ie)
						)
							break;
						d = d.return;
					}
					0 < q.length &&
						((h = new v(h, H, null, n, x)),
						M.push({ event: h, listeners: q }));
				}
			}
			if ((t & 7) === 0) {
				e: {
					if (
						((h = e === 'mouseover' || e === 'pointerover'),
						(v = e === 'mouseout' || e === 'pointerout'),
						h &&
							n !== Ju &&
							(H = n.relatedTarget || n.fromElement) &&
							(Ln(H) || H[qn]))
					)
						break e;
					if (
						(v || h) &&
						((h =
							x.window === x
								? x
								: (h = x.ownerDocument)
									? h.defaultView || h.parentWindow
									: window),
						v
							? ((H = n.relatedTarget || n.toElement),
								(v = j),
								(H = H ? Ln(H) : null),
								H !== null &&
									((ie = g(H)),
									(q = H.tag),
									H !== ie ||
										(q !== 5 && q !== 27 && q !== 6)) &&
									(H = null))
							: ((v = null), (H = j)),
						v !== H)
					) {
						if (
							((q = xr),
							(A = 'onMouseLeave'),
							(O = 'onMouseEnter'),
							(d = 'mouse'),
							(e === 'pointerout' || e === 'pointerover') &&
								((q = Ar),
								(A = 'onPointerLeave'),
								(O = 'onPointerEnter'),
								(d = 'pointer')),
							(ie = v == null ? h : Ta(v)),
							(y = H == null ? h : Ta(H)),
							(h = new q(A, d + 'leave', v, n, x)),
							(h.target = ie),
							(h.relatedTarget = y),
							(A = null),
							Ln(x) === j &&
								((q = new q(O, d + 'enter', H, n, x)),
								(q.target = y),
								(q.relatedTarget = ie),
								(A = q)),
							(ie = A),
							v && H)
						)
							t: {
								for (
									q = Qs, O = v, d = H, y = 0, A = O;
									A;
									A = q(A)
								)
									y++;
								A = 0;
								for (var G = d; G; G = q(G)) A++;
								for (; 0 < y - A; ) (O = q(O)), y--;
								for (; 0 < A - y; ) (d = q(d)), A--;
								for (; y--; ) {
									if (
										O === d ||
										(d !== null && O === d.alternate)
									) {
										q = O;
										break t;
									}
									(O = q(O)), (d = q(d));
								}
								q = null;
							}
						else q = null;
						v !== null && jo(M, h, v, q, false),
							H !== null && ie !== null && jo(M, ie, H, q, true);
					}
				}
				e: {
					if (
						((h = j ? Ta(j) : window),
						(v = h.nodeName && h.nodeName.toLowerCase()),
						v === 'select' || (v === 'input' && h.type === 'file'))
					)
						var $ = Ur;
					else if (Cr(h))
						if (Nr) $ = ts;
						else {
							$ = Pb;
							var B = $b;
						}
					else
						(v = h.nodeName),
							!v ||
							v.toLowerCase() !== 'input' ||
							(h.type !== 'checkbox' && h.type !== 'radio')
								? j && Fu(j.elementType) && ($ = Ur)
								: ($ = es);
					if ($ && ($ = $(e, j))) {
						Hr(M, $, n, x);
						break e;
					}
					B && B(e, h, j),
						e === 'focusout' &&
							j &&
							h.type === 'number' &&
							j.memoizedProps.value != null &&
							Wu(h, 'number', h.value);
				}
				switch (((B = j ? Ta(j) : window), e)) {
					case 'focusin':
						(Cr(B) || B.contentEditable === 'true') &&
							((Jn = B), (rl = j), (Ba = null));
						break;
					case 'focusout':
						Ba = rl = Jn = null;
						break;
					case 'mousedown':
						fl = true;
						break;
					case 'contextmenu':
					case 'mouseup':
					case 'dragend':
						(fl = false), Qr(M, n, x);
						break;
					case 'selectionchange':
						if (as) break;
					case 'keydown':
					case 'keyup':
						Qr(M, n, x);
				}
				var X;
				if (cl)
					e: {
						switch (e) {
							case 'compositionstart':
								var F = 'onCompositionStart';
								break e;
							case 'compositionend':
								F = 'onCompositionEnd';
								break e;
							case 'compositionupdate':
								F = 'onCompositionUpdate';
								break e;
						}
						F = void 0;
					}
				else
					Fn
						? Rr(e, n) && (F = 'onCompositionEnd')
						: e === 'keydown' &&
							n.keyCode === 229 &&
							(F = 'onCompositionStart');
				F &&
					(Tr &&
						n.locale !== 'ko' &&
						(Fn || F !== 'onCompositionStart'
							? F === 'onCompositionEnd' && Fn && (X = vr())
							: ((Ft = x),
								(Pu =
									'value' in Ft ? Ft.value : Ft.textContent),
								(Fn = true))),
					(B = yu(j, F)),
					0 < B.length &&
						((F = new Er(F, e, null, n, x)),
						M.push({ event: F, listeners: B }),
						X
							? (F.data = X)
							: ((X = zr(n)), X !== null && (F.data = X)))),
					(X = Wb ? Fb(e, n) : Jb(e, n)) &&
						((F = yu(j, 'onBeforeInput')),
						0 < F.length &&
							((B = new Er(
								'onBeforeInput',
								'beforeinput',
								null,
								n,
								x,
							)),
							M.push({ event: B, listeners: F }),
							(B.data = X))),
					Ls(M, e, j, n, x);
			}
			po(M, t);
		});
	}
	function rc(e, t, n) {
		return { instance: e, listener: t, currentTarget: n };
	}
	function yu(e, t) {
		for (var n = t + 'Capture', u = []; e !== null; ) {
			var l = e,
				i = l.stateNode;
			if (
				((l = l.tag),
				(l !== 5 && l !== 26 && l !== 27) ||
					i === null ||
					((l = Ma(e, n)),
					l != null && u.unshift(rc(e, l, i)),
					(l = Ma(e, t)),
					l != null && u.push(rc(e, l, i))),
				e.tag === 3)
			)
				return u;
			e = e.return;
		}
		return [];
	}
	function Qs(e) {
		if (e === null) return null;
		do e = e.return;
		while (e && e.tag !== 5 && e.tag !== 27);
		return e || null;
	}
	function jo(e, t, n, u, l) {
		for (var i = t._reactName, _ = []; n !== null && n !== u; ) {
			var b = n,
				s = b.alternate,
				j = b.stateNode;
			if (((b = b.tag), s !== null && s === u)) break;
			(b !== 5 && b !== 26 && b !== 27) ||
				j === null ||
				((s = j),
				l
					? ((j = Ma(n, i)), j != null && _.unshift(rc(n, j, s)))
					: l || ((j = Ma(n, i)), j != null && _.push(rc(n, j, s)))),
				(n = n.return);
		}
		_.length !== 0 && e.push({ event: t, listeners: _ });
	}
	var Zs = /\r\n?/g,
		Ks = /\u0000|\uFFFD/g;
	function ho(e) {
		return (typeof e == 'string' ? e : '' + e)
			.replace(
				Zs,
				`
`,
			)
			.replace(Ks, '');
	}
	function wo(e, t) {
		return (t = ho(t)), ho(e) === t;
	}
	function le(e, t, n, u, l, i) {
		switch (n) {
			case 'children':
				typeof u == 'string'
					? t === 'body' || (t === 'textarea' && u === '') || Zn(e, u)
					: (typeof u == 'number' || typeof u == 'bigint') &&
						t !== 'body' &&
						Zn(e, '' + u);
				break;
			case 'className':
				vc(e, 'class', u);
				break;
			case 'tabIndex':
				vc(e, 'tabindex', u);
				break;
			case 'dir':
			case 'role':
			case 'viewBox':
			case 'width':
			case 'height':
				vc(e, n, u);
				break;
			case 'style':
				jr(e, u, i);
				break;
			case 'data':
				if (t !== 'object') {
					vc(e, 'data', u);
					break;
				}
			case 'src':
			case 'href':
				if (u === '' && (t !== 'a' || n !== 'href')) {
					e.removeAttribute(n);
					break;
				}
				if (
					u == null ||
					typeof u == 'function' ||
					typeof u == 'symbol' ||
					typeof u == 'boolean'
				) {
					e.removeAttribute(n);
					break;
				}
				(u = xc('' + u)), e.setAttribute(n, u);
				break;
			case 'action':
			case 'formAction':
				if (typeof u == 'function') {
					e.setAttribute(
						n,
						"javascript:throw new Error('A React form was unexpectedly submitted. If you called form.submit() manually, consider using form.requestSubmit() instead. If you\\'re trying to use event.stopPropagation() in a submit event handler, consider also calling event.preventDefault().')",
					);
					break;
				} else
					typeof i == 'function' &&
						(n === 'formAction'
							? (t !== 'input' &&
									le(e, t, 'name', l.name, l, null),
								le(e, t, 'formEncType', l.formEncType, l, null),
								le(e, t, 'formMethod', l.formMethod, l, null),
								le(e, t, 'formTarget', l.formTarget, l, null))
							: (le(e, t, 'encType', l.encType, l, null),
								le(e, t, 'method', l.method, l, null),
								le(e, t, 'target', l.target, l, null)));
				if (
					u == null ||
					typeof u == 'symbol' ||
					typeof u == 'boolean'
				) {
					e.removeAttribute(n);
					break;
				}
				(u = xc('' + u)), e.setAttribute(n, u);
				break;
			case 'onClick':
				u != null && (e.onclick = Tt);
				break;
			case 'onScroll':
				u != null && K('scroll', e);
				break;
			case 'onScrollEnd':
				u != null && K('scrollend', e);
				break;
			case 'dangerouslySetInnerHTML':
				if (u != null) {
					if (typeof u != 'object' || !('__html' in u))
						throw Error(f(61));
					if (((n = u.__html), n != null)) {
						if (l.children != null) throw Error(f(60));
						e.innerHTML = n;
					}
				}
				break;
			case 'multiple':
				e.multiple =
					u && typeof u != 'function' && typeof u != 'symbol';
				break;
			case 'muted':
				e.muted = u && typeof u != 'function' && typeof u != 'symbol';
				break;
			case 'suppressContentEditableWarning':
			case 'suppressHydrationWarning':
			case 'defaultValue':
			case 'defaultChecked':
			case 'innerHTML':
			case 'ref':
				break;
			case 'autoFocus':
				break;
			case 'xlinkHref':
				if (
					u == null ||
					typeof u == 'function' ||
					typeof u == 'boolean' ||
					typeof u == 'symbol'
				) {
					e.removeAttribute('xlink:href');
					break;
				}
				(n = xc('' + u)),
					e.setAttributeNS(
						'http://www.w3.org/1999/xlink',
						'xlink:href',
						n,
					);
				break;
			case 'contentEditable':
			case 'spellCheck':
			case 'draggable':
			case 'value':
			case 'autoReverse':
			case 'externalResourcesRequired':
			case 'focusable':
			case 'preserveAlpha':
				u != null && typeof u != 'function' && typeof u != 'symbol'
					? e.setAttribute(n, '' + u)
					: e.removeAttribute(n);
				break;
			case 'inert':
			case 'allowFullScreen':
			case 'async':
			case 'autoPlay':
			case 'controls':
			case 'default':
			case 'defer':
			case 'disabled':
			case 'disablePictureInPicture':
			case 'disableRemotePlayback':
			case 'formNoValidate':
			case 'hidden':
			case 'loop':
			case 'noModule':
			case 'noValidate':
			case 'open':
			case 'playsInline':
			case 'readOnly':
			case 'required':
			case 'reversed':
			case 'scoped':
			case 'seamless':
			case 'itemScope':
				u && typeof u != 'function' && typeof u != 'symbol'
					? e.setAttribute(n, '')
					: e.removeAttribute(n);
				break;
			case 'capture':
			case 'download':
				u === true
					? e.setAttribute(n, '')
					: u !== false &&
						  u != null &&
						  typeof u != 'function' &&
						  typeof u != 'symbol'
						? e.setAttribute(n, u)
						: e.removeAttribute(n);
				break;
			case 'cols':
			case 'rows':
			case 'size':
			case 'span':
				u != null &&
				typeof u != 'function' &&
				typeof u != 'symbol' &&
				!isNaN(u) &&
				1 <= u
					? e.setAttribute(n, u)
					: e.removeAttribute(n);
				break;
			case 'rowSpan':
			case 'start':
				u == null ||
				typeof u == 'function' ||
				typeof u == 'symbol' ||
				isNaN(u)
					? e.removeAttribute(n)
					: e.setAttribute(n, u);
				break;
			case 'popover':
				K('beforetoggle', e), K('toggle', e), wc(e, 'popover', u);
				break;
			case 'xlinkActuate':
				At(e, 'http://www.w3.org/1999/xlink', 'xlink:actuate', u);
				break;
			case 'xlinkArcrole':
				At(e, 'http://www.w3.org/1999/xlink', 'xlink:arcrole', u);
				break;
			case 'xlinkRole':
				At(e, 'http://www.w3.org/1999/xlink', 'xlink:role', u);
				break;
			case 'xlinkShow':
				At(e, 'http://www.w3.org/1999/xlink', 'xlink:show', u);
				break;
			case 'xlinkTitle':
				At(e, 'http://www.w3.org/1999/xlink', 'xlink:title', u);
				break;
			case 'xlinkType':
				At(e, 'http://www.w3.org/1999/xlink', 'xlink:type', u);
				break;
			case 'xmlBase':
				At(e, 'http://www.w3.org/XML/1998/namespace', 'xml:base', u);
				break;
			case 'xmlLang':
				At(e, 'http://www.w3.org/XML/1998/namespace', 'xml:lang', u);
				break;
			case 'xmlSpace':
				At(e, 'http://www.w3.org/XML/1998/namespace', 'xml:space', u);
				break;
			case 'is':
				wc(e, 'is', u);
				break;
			case 'innerText':
			case 'textContent':
				break;
			default:
				(!(2 < n.length) ||
					(n[0] !== 'o' && n[0] !== 'O') ||
					(n[1] !== 'n' && n[1] !== 'N')) &&
					((n = jb.get(n) || n), wc(e, n, u));
		}
	}
	function Hi(e, t, n, u, l, i) {
		switch (n) {
			case 'style':
				jr(e, u, i);
				break;
			case 'dangerouslySetInnerHTML':
				if (u != null) {
					if (typeof u != 'object' || !('__html' in u))
						throw Error(f(61));
					if (((n = u.__html), n != null)) {
						if (l.children != null) throw Error(f(60));
						e.innerHTML = n;
					}
				}
				break;
			case 'children':
				typeof u == 'string'
					? Zn(e, u)
					: (typeof u == 'number' || typeof u == 'bigint') &&
						Zn(e, '' + u);
				break;
			case 'onScroll':
				u != null && K('scroll', e);
				break;
			case 'onScrollEnd':
				u != null && K('scrollend', e);
				break;
			case 'onClick':
				u != null && (e.onclick = Tt);
				break;
			case 'suppressContentEditableWarning':
			case 'suppressHydrationWarning':
			case 'innerHTML':
			case 'ref':
				break;
			case 'innerText':
			case 'textContent':
				break;
			default:
				if (!or.hasOwnProperty(n))
					e: {
						if (
							n[0] === 'o' &&
							n[1] === 'n' &&
							((l = n.endsWith('Capture')),
							(t = n.slice(2, l ? n.length - 7 : void 0)),
							(i = e[qe] || null),
							(i = i != null ? i[n] : null),
							typeof i == 'function' &&
								e.removeEventListener(t, i, l),
							typeof u == 'function')
						) {
							typeof i != 'function' &&
								i !== null &&
								(n in e
									? (e[n] = null)
									: e.hasAttribute(n) &&
										e.removeAttribute(n)),
								e.addEventListener(t, u, l);
							break e;
						}
						n in e
							? (e[n] = u)
							: u === true
								? e.setAttribute(n, '')
								: wc(e, n, u);
					}
		}
	}
	function Me(e, t, n) {
		switch (t) {
			case 'div':
			case 'span':
			case 'svg':
			case 'path':
			case 'a':
			case 'g':
			case 'p':
			case 'li':
				break;
			case 'img':
				K('error', e), K('load', e);
				var u = false,
					l = false,
					i;
				for (i in n)
					if (n.hasOwnProperty(i)) {
						var _ = n[i];
						if (_ != null)
							switch (i) {
								case 'src':
									u = true;
									break;
								case 'srcSet':
									l = true;
									break;
								case 'children':
								case 'dangerouslySetInnerHTML':
									throw Error(f(137, t));
								default:
									le(e, t, i, _, n, null);
							}
					}
				l && le(e, t, 'srcSet', n.srcSet, n, null),
					u && le(e, t, 'src', n.src, n, null);
				return;
			case 'input':
				K('invalid', e);
				var b = (i = _ = l = null),
					s = null,
					j = null;
				for (u in n)
					if (n.hasOwnProperty(u)) {
						var x = n[u];
						if (x != null)
							switch (u) {
								case 'name':
									l = x;
									break;
								case 'type':
									_ = x;
									break;
								case 'checked':
									s = x;
									break;
								case 'defaultChecked':
									j = x;
									break;
								case 'value':
									i = x;
									break;
								case 'defaultValue':
									b = x;
									break;
								case 'children':
								case 'dangerouslySetInnerHTML':
									if (x != null) throw Error(f(137, t));
									break;
								default:
									le(e, t, u, x, n, null);
							}
					}
				mr(e, i, b, s, j, _, l, false);
				return;
			case 'select':
				K('invalid', e), (u = _ = i = null);
				for (l in n)
					if (n.hasOwnProperty(l) && ((b = n[l]), b != null))
						switch (l) {
							case 'value':
								i = b;
								break;
							case 'defaultValue':
								_ = b;
								break;
							case 'multiple':
								u = b;
							default:
								le(e, t, l, b, n, null);
						}
				(t = i),
					(n = _),
					(e.multiple = !!u),
					t != null
						? Qn(e, !!u, t, false)
						: n != null && Qn(e, !!u, n, true);
				return;
			case 'textarea':
				K('invalid', e), (i = l = u = null);
				for (_ in n)
					if (n.hasOwnProperty(_) && ((b = n[_]), b != null))
						switch (_) {
							case 'value':
								u = b;
								break;
							case 'defaultValue':
								l = b;
								break;
							case 'children':
								i = b;
								break;
							case 'dangerouslySetInnerHTML':
								if (b != null) throw Error(f(91));
								break;
							default:
								le(e, t, _, b, n, null);
						}
				pr(e, u, l, i);
				return;
			case 'option':
				for (s in n)
					if (n.hasOwnProperty(s) && ((u = n[s]), u != null))
						switch (s) {
							case 'selected':
								e.selected =
									u &&
									typeof u != 'function' &&
									typeof u != 'symbol';
								break;
							default:
								le(e, t, s, u, n, null);
						}
				return;
			case 'dialog':
				K('beforetoggle', e),
					K('toggle', e),
					K('cancel', e),
					K('close', e);
				break;
			case 'iframe':
			case 'object':
				K('load', e);
				break;
			case 'video':
			case 'audio':
				for (u = 0; u < ic.length; u++) K(ic[u], e);
				break;
			case 'image':
				K('error', e), K('load', e);
				break;
			case 'details':
				K('toggle', e);
				break;
			case 'embed':
			case 'source':
			case 'link':
				K('error', e), K('load', e);
			case 'area':
			case 'base':
			case 'br':
			case 'col':
			case 'hr':
			case 'keygen':
			case 'meta':
			case 'param':
			case 'track':
			case 'wbr':
			case 'menuitem':
				for (j in n)
					if (n.hasOwnProperty(j) && ((u = n[j]), u != null))
						switch (j) {
							case 'children':
							case 'dangerouslySetInnerHTML':
								throw Error(f(137, t));
							default:
								le(e, t, j, u, n, null);
						}
				return;
			default:
				if (Fu(t)) {
					for (x in n)
						n.hasOwnProperty(x) &&
							((u = n[x]),
							u !== void 0 && Hi(e, t, x, u, n, void 0));
					return;
				}
		}
		for (b in n)
			n.hasOwnProperty(b) &&
				((u = n[b]), u != null && le(e, t, b, u, n, null));
	}
	function Ws(e, t, n, u) {
		switch (t) {
			case 'div':
			case 'span':
			case 'svg':
			case 'path':
			case 'a':
			case 'g':
			case 'p':
			case 'li':
				break;
			case 'input':
				var l = null,
					i = null,
					_ = null,
					b = null,
					s = null,
					j = null,
					x = null;
				for (v in n) {
					var M = n[v];
					if (n.hasOwnProperty(v) && M != null)
						switch (v) {
							case 'checked':
								break;
							case 'value':
								break;
							case 'defaultValue':
								s = M;
							default:
								u.hasOwnProperty(v) || le(e, t, v, null, u, M);
						}
				}
				for (var h in u) {
					var v = u[h];
					if (
						((M = n[h]),
						u.hasOwnProperty(h) && (v != null || M != null))
					)
						switch (h) {
							case 'type':
								i = v;
								break;
							case 'name':
								l = v;
								break;
							case 'checked':
								j = v;
								break;
							case 'defaultChecked':
								x = v;
								break;
							case 'value':
								_ = v;
								break;
							case 'defaultValue':
								b = v;
								break;
							case 'children':
							case 'dangerouslySetInnerHTML':
								if (v != null) throw Error(f(137, t));
								break;
							default:
								v !== M && le(e, t, h, v, u, M);
						}
				}
				Ku(e, _, b, s, j, x, i, l);
				return;
			case 'select':
				v = _ = b = h = null;
				for (i in n)
					if (((s = n[i]), n.hasOwnProperty(i) && s != null))
						switch (i) {
							case 'value':
								break;
							case 'multiple':
								v = s;
							default:
								u.hasOwnProperty(i) || le(e, t, i, null, u, s);
						}
				for (l in u)
					if (
						((i = u[l]),
						(s = n[l]),
						u.hasOwnProperty(l) && (i != null || s != null))
					)
						switch (l) {
							case 'value':
								h = i;
								break;
							case 'defaultValue':
								b = i;
								break;
							case 'multiple':
								_ = i;
							default:
								i !== s && le(e, t, l, i, u, s);
						}
				(t = b),
					(n = _),
					(u = v),
					h != null
						? Qn(e, !!n, h, false)
						: !!u != !!n &&
							(t != null
								? Qn(e, !!n, t, true)
								: Qn(e, !!n, n ? [] : '', false));
				return;
			case 'textarea':
				v = h = null;
				for (b in n)
					if (
						((l = n[b]),
						n.hasOwnProperty(b) &&
							l != null &&
							!u.hasOwnProperty(b))
					)
						switch (b) {
							case 'value':
								break;
							case 'children':
								break;
							default:
								le(e, t, b, null, u, l);
						}
				for (_ in u)
					if (
						((l = u[_]),
						(i = n[_]),
						u.hasOwnProperty(_) && (l != null || i != null))
					)
						switch (_) {
							case 'value':
								h = l;
								break;
							case 'defaultValue':
								v = l;
								break;
							case 'children':
								break;
							case 'dangerouslySetInnerHTML':
								if (l != null) throw Error(f(91));
								break;
							default:
								l !== i && le(e, t, _, l, u, i);
						}
				Or(e, h, v);
				return;
			case 'option':
				for (var H in n)
					if (
						((h = n[H]),
						n.hasOwnProperty(H) &&
							h != null &&
							!u.hasOwnProperty(H))
					)
						switch (H) {
							case 'selected':
								e.selected = false;
								break;
							default:
								le(e, t, H, null, u, h);
						}
				for (s in u)
					if (
						((h = u[s]),
						(v = n[s]),
						u.hasOwnProperty(s) &&
							h !== v &&
							(h != null || v != null))
					)
						switch (s) {
							case 'selected':
								e.selected =
									h &&
									typeof h != 'function' &&
									typeof h != 'symbol';
								break;
							default:
								le(e, t, s, h, u, v);
						}
				return;
			case 'img':
			case 'link':
			case 'area':
			case 'base':
			case 'br':
			case 'col':
			case 'embed':
			case 'hr':
			case 'keygen':
			case 'meta':
			case 'param':
			case 'source':
			case 'track':
			case 'wbr':
			case 'menuitem':
				for (var q in n)
					(h = n[q]),
						n.hasOwnProperty(q) &&
							h != null &&
							!u.hasOwnProperty(q) &&
							le(e, t, q, null, u, h);
				for (j in u)
					if (
						((h = u[j]),
						(v = n[j]),
						u.hasOwnProperty(j) &&
							h !== v &&
							(h != null || v != null))
					)
						switch (j) {
							case 'children':
							case 'dangerouslySetInnerHTML':
								if (h != null) throw Error(f(137, t));
								break;
							default:
								le(e, t, j, h, u, v);
						}
				return;
			default:
				if (Fu(t)) {
					for (var ie in n)
						(h = n[ie]),
							n.hasOwnProperty(ie) &&
								h !== void 0 &&
								!u.hasOwnProperty(ie) &&
								Hi(e, t, ie, void 0, u, h);
					for (x in u)
						(h = u[x]),
							(v = n[x]),
							!u.hasOwnProperty(x) ||
								h === v ||
								(h === void 0 && v === void 0) ||
								Hi(e, t, x, h, u, v);
					return;
				}
		}
		for (var O in n)
			(h = n[O]),
				n.hasOwnProperty(O) &&
					h != null &&
					!u.hasOwnProperty(O) &&
					le(e, t, O, null, u, h);
		for (M in u)
			(h = u[M]),
				(v = n[M]),
				!u.hasOwnProperty(M) ||
					h === v ||
					(h == null && v == null) ||
					le(e, t, M, h, u, v);
	}
	function vo(e) {
		switch (e) {
			case 'css':
			case 'script':
			case 'font':
			case 'img':
			case 'image':
			case 'input':
			case 'link':
				return true;
			default:
				return false;
		}
	}
	function Fs() {
		if (typeof performance.getEntriesByType == 'function') {
			for (
				var e = 0,
					t = 0,
					n = performance.getEntriesByType('resource'),
					u = 0;
				u < n.length;
				u++
			) {
				var l = n[u],
					i = l.transferSize,
					_ = l.initiatorType,
					b = l.duration;
				if (i && b && vo(_)) {
					for (_ = 0, b = l.responseEnd, u += 1; u < n.length; u++) {
						var s = n[u],
							j = s.startTime;
						if (j > b) break;
						var x = s.transferSize,
							M = s.initiatorType;
						x &&
							vo(M) &&
							((s = s.responseEnd),
							(_ += x * (s < b ? 1 : (b - j) / (s - j))));
					}
					if (
						(--u,
						(t += (8 * (i + _)) / (l.duration / 1e3)),
						e++,
						10 < e)
					)
						break;
				}
			}
			if (0 < e) return t / e / 1e6;
		}
		return navigator.connection &&
			((e = navigator.connection.downlink), typeof e == 'number')
			? e
			: 5;
	}
	var Ui = null,
		Ni = null;
	function ju(e) {
		return e.nodeType === 9 ? e : e.ownerDocument;
	}
	function So(e) {
		switch (e) {
			case 'http://www.w3.org/2000/svg':
				return 1;
			case 'http://www.w3.org/1998/Math/MathML':
				return 2;
			default:
				return 0;
		}
	}
	function xo(e, t) {
		if (e === 0)
			switch (t) {
				case 'svg':
					return 1;
				case 'math':
					return 2;
				default:
					return 0;
			}
		return e === 1 && t === 'foreignObject' ? 0 : e;
	}
	function Bi(e, t) {
		return (
			e === 'textarea' ||
			e === 'noscript' ||
			typeof t.children == 'string' ||
			typeof t.children == 'number' ||
			typeof t.children == 'bigint' ||
			(typeof t.dangerouslySetInnerHTML == 'object' &&
				t.dangerouslySetInnerHTML !== null &&
				t.dangerouslySetInnerHTML.__html != null)
		);
	}
	var Gi = null;
	function Js() {
		var e = window.event;
		return e && e.type === 'popstate'
			? e === Gi
				? false
				: ((Gi = e), true)
			: ((Gi = null), false);
	}
	var Eo = typeof setTimeout == 'function' ? setTimeout : void 0,
		ks = typeof clearTimeout == 'function' ? clearTimeout : void 0,
		Ao = typeof Promise == 'function' ? Promise : void 0,
		Is =
			typeof queueMicrotask == 'function'
				? queueMicrotask
				: typeof Ao < 'u'
					? function (e) {
							return Ao.resolve(null).then(e).catch($s);
						}
					: Eo;
	function $s(e) {
		setTimeout(function () {
			throw e;
		});
	}
	function bn(e) {
		return e === 'head';
	}
	function To(e, t) {
		var n = t,
			u = 0;
		do {
			var l = n.nextSibling;
			if ((e.removeChild(n), l && l.nodeType === 8))
				if (((n = l.data), n === '/$' || n === '/&')) {
					if (u === 0) {
						e.removeChild(l), wa(t);
						return;
					}
					u--;
				} else if (
					n === '$' ||
					n === '$?' ||
					n === '$~' ||
					n === '$!' ||
					n === '&'
				)
					u++;
				else if (n === 'html') fc(e.ownerDocument.documentElement);
				else if (n === 'head') {
					(n = e.ownerDocument.head), fc(n);
					for (var i = n.firstChild; i; ) {
						var _ = i.nextSibling,
							b = i.nodeName;
						i[Aa] ||
							b === 'SCRIPT' ||
							b === 'STYLE' ||
							(b === 'LINK' &&
								i.rel.toLowerCase() === 'stylesheet') ||
							n.removeChild(i),
							(i = _);
					}
				} else n === 'body' && fc(e.ownerDocument.body);
			n = l;
		} while (n);
		wa(t);
	}
	function Mo(e, t) {
		var n = e;
		e = 0;
		do {
			var u = n.nextSibling;
			if (
				(n.nodeType === 1
					? t
						? ((n._stashedDisplay = n.style.display),
							(n.style.display = 'none'))
						: ((n.style.display = n._stashedDisplay || ''),
							n.getAttribute('style') === '' &&
								n.removeAttribute('style'))
					: n.nodeType === 3 &&
						(t
							? ((n._stashedText = n.nodeValue),
								(n.nodeValue = ''))
							: (n.nodeValue = n._stashedText || '')),
				u && u.nodeType === 8)
			)
				if (((n = u.data), n === '/$')) {
					if (e === 0) break;
					e--;
				} else
					(n !== '$' && n !== '$?' && n !== '$~' && n !== '$!') ||
						e++;
			n = u;
		} while (n);
	}
	function qi(e) {
		var t = e.firstChild;
		for (t && t.nodeType === 10 && (t = t.nextSibling); t; ) {
			var n = t;
			switch (((t = t.nextSibling), n.nodeName)) {
				case 'HTML':
				case 'HEAD':
				case 'BODY':
					qi(n), Qu(n);
					continue;
				case 'SCRIPT':
				case 'STYLE':
					continue;
				case 'LINK':
					if (n.rel.toLowerCase() === 'stylesheet') continue;
			}
			e.removeChild(n);
		}
	}
	function Ps(e, t, n, u) {
		for (; e.nodeType === 1; ) {
			var l = n;
			if (e.nodeName.toLowerCase() !== t.toLowerCase()) {
				if (!u && (e.nodeName !== 'INPUT' || e.type !== 'hidden'))
					break;
			} else if (u) {
				if (!e[Aa])
					switch (t) {
						case 'meta':
							if (!e.hasAttribute('itemprop')) break;
							return e;
						case 'link':
							if (
								((i = e.getAttribute('rel')),
								i === 'stylesheet' &&
									e.hasAttribute('data-precedence'))
							)
								break;
							if (
								i !== l.rel ||
								e.getAttribute('href') !==
									(l.href == null || l.href === ''
										? null
										: l.href) ||
								e.getAttribute('crossorigin') !==
									(l.crossOrigin == null
										? null
										: l.crossOrigin) ||
								e.getAttribute('title') !==
									(l.title == null ? null : l.title)
							)
								break;
							return e;
						case 'style':
							if (e.hasAttribute('data-precedence')) break;
							return e;
						case 'script':
							if (
								((i = e.getAttribute('src')),
								(i !== (l.src == null ? null : l.src) ||
									e.getAttribute('type') !==
										(l.type == null ? null : l.type) ||
									e.getAttribute('crossorigin') !==
										(l.crossOrigin == null
											? null
											: l.crossOrigin)) &&
									i &&
									e.hasAttribute('async') &&
									!e.hasAttribute('itemprop'))
							)
								break;
							return e;
						default:
							return e;
					}
			} else if (t === 'input' && e.type === 'hidden') {
				var i = l.name == null ? null : '' + l.name;
				if (l.type === 'hidden' && e.getAttribute('name') === i)
					return e;
			} else return e;
			if (((e = bt(e.nextSibling)), e === null)) break;
		}
		return null;
	}
	function eg(e, t, n) {
		if (t === '') return null;
		for (; e.nodeType !== 3; )
			if (
				((e.nodeType !== 1 ||
					e.nodeName !== 'INPUT' ||
					e.type !== 'hidden') &&
					!n) ||
				((e = bt(e.nextSibling)), e === null)
			)
				return null;
		return e;
	}
	function Do(e, t) {
		for (; e.nodeType !== 8; )
			if (
				((e.nodeType !== 1 ||
					e.nodeName !== 'INPUT' ||
					e.type !== 'hidden') &&
					!t) ||
				((e = bt(e.nextSibling)), e === null)
			)
				return null;
		return e;
	}
	function Li(e) {
		return e.data === '$?' || e.data === '$~';
	}
	function Vi(e) {
		return (
			e.data === '$!' ||
			(e.data === '$?' && e.ownerDocument.readyState !== 'loading')
		);
	}
	function tg(e, t) {
		var n = e.ownerDocument;
		if (e.data === '$~') e._reactRetry = t;
		else if (e.data !== '$?' || n.readyState !== 'loading') t();
		else {
			var u = function () {
				t(), n.removeEventListener('DOMContentLoaded', u);
			};
			n.addEventListener('DOMContentLoaded', u), (e._reactRetry = u);
		}
	}
	function bt(e) {
		for (; e != null; e = e.nextSibling) {
			var t = e.nodeType;
			if (t === 1 || t === 3) break;
			if (t === 8) {
				if (
					((t = e.data),
					t === '$' ||
						t === '$!' ||
						t === '$?' ||
						t === '$~' ||
						t === '&' ||
						t === 'F!' ||
						t === 'F')
				)
					break;
				if (t === '/$' || t === '/&') return null;
			}
		}
		return e;
	}
	var Yi = null;
	function Ro(e) {
		e = e.nextSibling;
		for (var t = 0; e; ) {
			if (e.nodeType === 8) {
				var n = e.data;
				if (n === '/$' || n === '/&') {
					if (t === 0) return bt(e.nextSibling);
					t--;
				} else
					(n !== '$' &&
						n !== '$!' &&
						n !== '$?' &&
						n !== '$~' &&
						n !== '&') ||
						t++;
			}
			e = e.nextSibling;
		}
		return null;
	}
	function zo(e) {
		e = e.previousSibling;
		for (var t = 0; e; ) {
			if (e.nodeType === 8) {
				var n = e.data;
				if (
					n === '$' ||
					n === '$!' ||
					n === '$?' ||
					n === '$~' ||
					n === '&'
				) {
					if (t === 0) return e;
					t--;
				} else (n !== '/$' && n !== '/&') || t++;
			}
			e = e.previousSibling;
		}
		return null;
	}
	function Co(e, t, n) {
		switch (((t = ju(n)), e)) {
			case 'html':
				if (((e = t.documentElement), !e)) throw Error(f(452));
				return e;
			case 'head':
				if (((e = t.head), !e)) throw Error(f(453));
				return e;
			case 'body':
				if (((e = t.body), !e)) throw Error(f(454));
				return e;
			default:
				throw Error(f(451));
		}
	}
	function fc(e) {
		for (var t = e.attributes; t.length; ) e.removeAttributeNode(t[0]);
		Qu(e);
	}
	var st = /* @__PURE__ */ new Map(),
		Ho = /* @__PURE__ */ new Set();
	function hu(e) {
		return typeof e.getRootNode == 'function'
			? e.getRootNode()
			: e.nodeType === 9
				? e
				: e.ownerDocument;
	}
	var Qt = R.d;
	R.d = { f: ng, r: ag, D: cg, C: ug, L: lg, m: ig, X: fg, S: rg, M: _g };
	function ng() {
		var e = Qt.f(),
			t = bu();
		return e || t;
	}
	function ag(e) {
		var t = Vn(e);
		t !== null && t.tag === 5 && t.type === 'form' ? kf(t) : Qt.r(e);
	}
	var ya = typeof document > 'u' ? null : document;
	function Uo(e, t, n) {
		var u = ya;
		if (u && typeof t == 'string' && t) {
			var l = ut(t);
			(l = 'link[rel="' + e + '"][href="' + l + '"]'),
				typeof n == 'string' && (l += '[crossorigin="' + n + '"]'),
				Ho.has(l) ||
					(Ho.add(l),
					(e = { rel: e, crossOrigin: n, href: t }),
					u.querySelector(l) === null &&
						((t = u.createElement('link')),
						Me(t, 'link', e),
						ve(t),
						u.head.appendChild(t)));
		}
	}
	function cg(e) {
		Qt.D(e), Uo('dns-prefetch', e, null);
	}
	function ug(e, t) {
		Qt.C(e, t), Uo('preconnect', e, t);
	}
	function lg(e, t, n) {
		Qt.L(e, t, n);
		var u = ya;
		if (u && e && t) {
			var l = 'link[rel="preload"][as="' + ut(t) + '"]';
			t === 'image' && n && n.imageSrcSet
				? ((l += '[imagesrcset="' + ut(n.imageSrcSet) + '"]'),
					typeof n.imageSizes == 'string' &&
						(l += '[imagesizes="' + ut(n.imageSizes) + '"]'))
				: (l += '[href="' + ut(e) + '"]');
			var i = l;
			switch (t) {
				case 'style':
					i = ja(e);
					break;
				case 'script':
					i = ha(e);
			}
			st.has(i) ||
				((e = C(
					{
						rel: 'preload',
						href: t === 'image' && n && n.imageSrcSet ? void 0 : e,
						as: t,
					},
					n,
				)),
				st.set(i, e),
				u.querySelector(l) !== null ||
					(t === 'style' && u.querySelector(_c(i))) ||
					(t === 'script' && u.querySelector(oc(i))) ||
					((t = u.createElement('link')),
					Me(t, 'link', e),
					ve(t),
					u.head.appendChild(t)));
		}
	}
	function ig(e, t) {
		Qt.m(e, t);
		var n = ya;
		if (n && e) {
			var u = t && typeof t.as == 'string' ? t.as : 'script',
				l =
					'link[rel="modulepreload"][as="' +
					ut(u) +
					'"][href="' +
					ut(e) +
					'"]',
				i = l;
			switch (u) {
				case 'audioworklet':
				case 'paintworklet':
				case 'serviceworker':
				case 'sharedworker':
				case 'worker':
				case 'script':
					i = ha(e);
			}
			if (
				!st.has(i) &&
				((e = C({ rel: 'modulepreload', href: e }, t)),
				st.set(i, e),
				n.querySelector(l) === null)
			) {
				switch (u) {
					case 'audioworklet':
					case 'paintworklet':
					case 'serviceworker':
					case 'sharedworker':
					case 'worker':
					case 'script':
						if (n.querySelector(oc(i))) return;
				}
				(u = n.createElement('link')),
					Me(u, 'link', e),
					ve(u),
					n.head.appendChild(u);
			}
		}
	}
	function rg(e, t, n) {
		Qt.S(e, t, n);
		var u = ya;
		if (u && e) {
			var l = Yn(u).hoistableStyles,
				i = ja(e);
			t = t || 'default';
			var _ = l.get(i);
			if (!_) {
				var b = { loading: 0, preload: null };
				if ((_ = u.querySelector(_c(i)))) b.loading = 5;
				else {
					(e = C(
						{ rel: 'stylesheet', href: e, 'data-precedence': t },
						n,
					)),
						(n = st.get(i)) && Xi(e, n);
					var s = (_ = u.createElement('link'));
					ve(s),
						Me(s, 'link', e),
						(s._p = new Promise(function (j, x) {
							(s.onload = j), (s.onerror = x);
						})),
						s.addEventListener('load', function () {
							b.loading |= 1;
						}),
						s.addEventListener('error', function () {
							b.loading |= 2;
						}),
						(b.loading |= 4),
						wu(_, t, u);
				}
				(_ = { type: 'stylesheet', instance: _, count: 1, state: b }),
					l.set(i, _);
			}
		}
	}
	function fg(e, t) {
		Qt.X(e, t);
		var n = ya;
		if (n && e) {
			var u = Yn(n).hoistableScripts,
				l = ha(e),
				i = u.get(l);
			i ||
				((i = n.querySelector(oc(l))),
				i ||
					((e = C({ src: e, async: true }, t)),
					(t = st.get(l)) && Qi(e, t),
					(i = n.createElement('script')),
					ve(i),
					Me(i, 'link', e),
					n.head.appendChild(i)),
				(i = { type: 'script', instance: i, count: 1, state: null }),
				u.set(l, i));
		}
	}
	function _g(e, t) {
		Qt.M(e, t);
		var n = ya;
		if (n && e) {
			var u = Yn(n).hoistableScripts,
				l = ha(e),
				i = u.get(l);
			i ||
				((i = n.querySelector(oc(l))),
				i ||
					((e = C({ src: e, async: true, type: 'module' }, t)),
					(t = st.get(l)) && Qi(e, t),
					(i = n.createElement('script')),
					ve(i),
					Me(i, 'link', e),
					n.head.appendChild(i)),
				(i = { type: 'script', instance: i, count: 1, state: null }),
				u.set(l, i));
		}
	}
	function No(e, t, n, u) {
		var l = (l = Q.current) ? hu(l) : null;
		if (!l) throw Error(f(446));
		switch (e) {
			case 'meta':
			case 'title':
				return null;
			case 'style':
				return typeof n.precedence == 'string' &&
					typeof n.href == 'string'
					? ((t = ja(n.href)),
						(n = Yn(l).hoistableStyles),
						(u = n.get(t)),
						u ||
							((u = {
								type: 'style',
								instance: null,
								count: 0,
								state: null,
							}),
							n.set(t, u)),
						u)
					: { type: 'void', instance: null, count: 0, state: null };
			case 'link':
				if (
					n.rel === 'stylesheet' &&
					typeof n.href == 'string' &&
					typeof n.precedence == 'string'
				) {
					e = ja(n.href);
					var i = Yn(l).hoistableStyles,
						_ = i.get(e);
					if (
						(_ ||
							((l = l.ownerDocument || l),
							(_ = {
								type: 'stylesheet',
								instance: null,
								count: 0,
								state: { loading: 0, preload: null },
							}),
							i.set(e, _),
							(i = l.querySelector(_c(e))) &&
								!i._p &&
								((_.instance = i), (_.state.loading = 5)),
							st.has(e) ||
								((n = {
									rel: 'preload',
									as: 'style',
									href: n.href,
									crossOrigin: n.crossOrigin,
									integrity: n.integrity,
									media: n.media,
									hrefLang: n.hrefLang,
									referrerPolicy: n.referrerPolicy,
								}),
								st.set(e, n),
								i || og(l, e, n, _.state))),
						t && u === null)
					)
						throw Error(f(528, ''));
					return _;
				}
				if (t && u !== null) throw Error(f(529, ''));
				return null;
			case 'script':
				return (
					(t = n.async),
					(n = n.src),
					typeof n == 'string' &&
					t &&
					typeof t != 'function' &&
					typeof t != 'symbol'
						? ((t = ha(n)),
							(n = Yn(l).hoistableScripts),
							(u = n.get(t)),
							u ||
								((u = {
									type: 'script',
									instance: null,
									count: 0,
									state: null,
								}),
								n.set(t, u)),
							u)
						: {
								type: 'void',
								instance: null,
								count: 0,
								state: null,
							}
				);
			default:
				throw Error(f(444, e));
		}
	}
	function ja(e) {
		return 'href="' + ut(e) + '"';
	}
	function _c(e) {
		return 'link[rel="stylesheet"][' + e + ']';
	}
	function Bo(e) {
		return C({}, e, { 'data-precedence': e.precedence, precedence: null });
	}
	function og(e, t, n, u) {
		e.querySelector('link[rel="preload"][as="style"][' + t + ']')
			? (u.loading = 1)
			: ((t = e.createElement('link')),
				(u.preload = t),
				t.addEventListener('load', function () {
					return (u.loading |= 1);
				}),
				t.addEventListener('error', function () {
					return (u.loading |= 2);
				}),
				Me(t, 'link', n),
				ve(t),
				e.head.appendChild(t));
	}
	function ha(e) {
		return '[src="' + ut(e) + '"]';
	}
	function oc(e) {
		return 'script[async]' + e;
	}
	function Go(e, t, n) {
		if ((t.count++, t.instance === null))
			switch (t.type) {
				case 'style':
					var u = e.querySelector(
						'style[data-href~="' + ut(n.href) + '"]',
					);
					if (u) return (t.instance = u), ve(u), u;
					var l = C({}, n, {
						'data-href': n.href,
						'data-precedence': n.precedence,
						href: null,
						precedence: null,
					});
					return (
						(u = (e.ownerDocument || e).createElement('style')),
						ve(u),
						Me(u, 'style', l),
						wu(u, n.precedence, e),
						(t.instance = u)
					);
				case 'stylesheet':
					l = ja(n.href);
					var i = e.querySelector(_c(l));
					if (i)
						return (
							(t.state.loading |= 4), (t.instance = i), ve(i), i
						);
					(u = Bo(n)),
						(l = st.get(l)) && Xi(u, l),
						(i = (e.ownerDocument || e).createElement('link')),
						ve(i);
					var _ = i;
					return (
						(_._p = new Promise(function (b, s) {
							(_.onload = b), (_.onerror = s);
						})),
						Me(i, 'link', u),
						(t.state.loading |= 4),
						wu(i, n.precedence, e),
						(t.instance = i)
					);
				case 'script':
					return (
						(i = ha(n.src)),
						(l = e.querySelector(oc(i)))
							? ((t.instance = l), ve(l), l)
							: ((u = n),
								(l = st.get(i)) && ((u = C({}, n)), Qi(u, l)),
								(e = e.ownerDocument || e),
								(l = e.createElement('script')),
								ve(l),
								Me(l, 'link', u),
								e.head.appendChild(l),
								(t.instance = l))
					);
				case 'void':
					return null;
				default:
					throw Error(f(443, t.type));
			}
		else
			t.type === 'stylesheet' &&
				(t.state.loading & 4) === 0 &&
				((u = t.instance),
				(t.state.loading |= 4),
				wu(u, n.precedence, e));
		return t.instance;
	}
	function wu(e, t, n) {
		for (
			var u = n.querySelectorAll(
					'link[rel="stylesheet"][data-precedence],style[data-precedence]',
				),
				l = u.length ? u[u.length - 1] : null,
				i = l,
				_ = 0;
			_ < u.length;
			_++
		) {
			var b = u[_];
			if (b.dataset.precedence === t) i = b;
			else if (i !== l) break;
		}
		i
			? i.parentNode.insertBefore(e, i.nextSibling)
			: ((t = n.nodeType === 9 ? n.head : n),
				t.insertBefore(e, t.firstChild));
	}
	function Xi(e, t) {
		e.crossOrigin == null && (e.crossOrigin = t.crossOrigin),
			e.referrerPolicy == null && (e.referrerPolicy = t.referrerPolicy),
			e.title == null && (e.title = t.title);
	}
	function Qi(e, t) {
		e.crossOrigin == null && (e.crossOrigin = t.crossOrigin),
			e.referrerPolicy == null && (e.referrerPolicy = t.referrerPolicy),
			e.integrity == null && (e.integrity = t.integrity);
	}
	var vu = null;
	function qo(e, t, n) {
		if (vu === null) {
			var u = /* @__PURE__ */ new Map(),
				l = (vu = /* @__PURE__ */ new Map());
			l.set(n, u);
		} else
			(l = vu),
				(u = l.get(n)),
				u || ((u = /* @__PURE__ */ new Map()), l.set(n, u));
		if (u.has(e)) return u;
		for (
			u.set(e, null), n = n.getElementsByTagName(e), l = 0;
			l < n.length;
			l++
		) {
			var i = n[l];
			if (
				!(
					i[Aa] ||
					i[xe] ||
					(e === 'link' && i.getAttribute('rel') === 'stylesheet')
				) &&
				i.namespaceURI !== 'http://www.w3.org/2000/svg'
			) {
				var _ = i.getAttribute(t) || '';
				_ = e + _;
				var b = u.get(_);
				b ? b.push(i) : u.set(_, [i]);
			}
		}
		return u;
	}
	function Lo(e, t, n) {
		(e = e.ownerDocument || e),
			e.head.insertBefore(
				n,
				t === 'title' ? e.querySelector('head > title') : null,
			);
	}
	function bg(e, t, n) {
		if (n === 1 || t.itemProp != null) return false;
		switch (e) {
			case 'meta':
			case 'title':
				return true;
			case 'style':
				if (
					typeof t.precedence != 'string' ||
					typeof t.href != 'string' ||
					t.href === ''
				)
					break;
				return true;
			case 'link':
				if (
					typeof t.rel != 'string' ||
					typeof t.href != 'string' ||
					t.href === '' ||
					t.onLoad ||
					t.onError
				)
					break;
				switch (t.rel) {
					case 'stylesheet':
						return (
							(e = t.disabled),
							typeof t.precedence == 'string' && e == null
						);
					default:
						return true;
				}
			case 'script':
				if (
					t.async &&
					typeof t.async != 'function' &&
					typeof t.async != 'symbol' &&
					!t.onLoad &&
					!t.onError &&
					t.src &&
					typeof t.src == 'string'
				)
					return true;
		}
		return false;
	}
	function Vo(e) {
		return !(e.type === 'stylesheet' && (e.state.loading & 3) === 0);
	}
	function sg(e, t, n, u) {
		if (
			n.type === 'stylesheet' &&
			(typeof u.media != 'string' ||
				matchMedia(u.media).matches !== false) &&
			(n.state.loading & 4) === 0
		) {
			if (n.instance === null) {
				var l = ja(u.href),
					i = t.querySelector(_c(l));
				if (i) {
					(t = i._p),
						t !== null &&
							typeof t == 'object' &&
							typeof t.then == 'function' &&
							(e.count++, (e = Su.bind(e)), t.then(e, e)),
						(n.state.loading |= 4),
						(n.instance = i),
						ve(i);
					return;
				}
				(i = t.ownerDocument || t),
					(u = Bo(u)),
					(l = st.get(l)) && Xi(u, l),
					(i = i.createElement('link')),
					ve(i);
				var _ = i;
				(_._p = new Promise(function (b, s) {
					(_.onload = b), (_.onerror = s);
				})),
					Me(i, 'link', u),
					(n.instance = i);
			}
			e.stylesheets === null &&
				(e.stylesheets = /* @__PURE__ */ new Map()),
				e.stylesheets.set(n, t),
				(t = n.state.preload) &&
					(n.state.loading & 3) === 0 &&
					(e.count++,
					(n = Su.bind(e)),
					t.addEventListener('load', n),
					t.addEventListener('error', n));
		}
	}
	var Zi = 0;
	function gg(e, t) {
		return (
			e.stylesheets && e.count === 0 && Eu(e, e.stylesheets),
			0 < e.count || 0 < e.imgCount
				? function (n) {
						var u = setTimeout(function () {
							if (
								(e.stylesheets && Eu(e, e.stylesheets),
								e.unsuspend)
							) {
								var i = e.unsuspend;
								(e.unsuspend = null), i();
							}
						}, 6e4 + t);
						0 < e.imgBytes && Zi === 0 && (Zi = 62500 * Fs());
						var l = setTimeout(
							function () {
								if (
									((e.waitingForImages = false),
									e.count === 0 &&
										(e.stylesheets && Eu(e, e.stylesheets),
										e.unsuspend))
								) {
									var i = e.unsuspend;
									(e.unsuspend = null), i();
								}
							},
							(e.imgBytes > Zi ? 50 : 800) + t,
						);
						return (
							(e.unsuspend = n),
							function () {
								(e.unsuspend = null),
									clearTimeout(u),
									clearTimeout(l);
							}
						);
					}
				: null
		);
	}
	function Su() {
		if (
			(this.count--,
			this.count === 0 && (this.imgCount === 0 || !this.waitingForImages))
		) {
			if (this.stylesheets) Eu(this, this.stylesheets);
			else if (this.unsuspend) {
				var e = this.unsuspend;
				(this.unsuspend = null), e();
			}
		}
	}
	var xu = null;
	function Eu(e, t) {
		(e.stylesheets = null),
			e.unsuspend !== null &&
				(e.count++,
				(xu = /* @__PURE__ */ new Map()),
				t.forEach(dg, e),
				(xu = null),
				Su.call(e));
	}
	function dg(e, t) {
		if (!(t.state.loading & 4)) {
			var n = xu.get(e);
			if (n) var u = n.get(null);
			else {
				(n = /* @__PURE__ */ new Map()), xu.set(e, n);
				for (
					var l = e.querySelectorAll(
							'link[data-precedence],style[data-precedence]',
						),
						i = 0;
					i < l.length;
					i++
				) {
					var _ = l[i];
					(_.nodeName === 'LINK' ||
						_.getAttribute('media') !== 'not all') &&
						(n.set(_.dataset.precedence, _), (u = _));
				}
				u && n.set(null, u);
			}
			(l = t.instance),
				(_ = l.getAttribute('data-precedence')),
				(i = n.get(_) || u),
				i === u && n.set(null, l),
				n.set(_, l),
				this.count++,
				(u = Su.bind(this)),
				l.addEventListener('load', u),
				l.addEventListener('error', u),
				i
					? i.parentNode.insertBefore(l, i.nextSibling)
					: ((e = e.nodeType === 9 ? e.head : e),
						e.insertBefore(l, e.firstChild)),
				(t.state.loading |= 4);
		}
	}
	var bc = {
		$$typeof: Re,
		Provider: null,
		Consumer: null,
		_currentValue: L,
		_currentValue2: L,
		_threadCount: 0,
	};
	function mg(e, t, n, u, l, i, _, b, s) {
		(this.tag = 1),
			(this.containerInfo = e),
			(this.pingCache = this.current = this.pendingChildren = null),
			(this.timeoutHandle = -1),
			(this.callbackNode =
				this.next =
				this.pendingContext =
				this.context =
				this.cancelPendingCommit =
					null),
			(this.callbackPriority = 0),
			(this.expirationTimes = Lu(-1)),
			(this.entangledLanes =
				this.shellSuspendCounter =
				this.errorRecoveryDisabledLanes =
				this.expiredLanes =
				this.warmLanes =
				this.pingedLanes =
				this.suspendedLanes =
				this.pendingLanes =
					0),
			(this.entanglements = Lu(0)),
			(this.hiddenUpdates = Lu(null)),
			(this.identifierPrefix = u),
			(this.onUncaughtError = l),
			(this.onCaughtError = i),
			(this.onRecoverableError = _),
			(this.pooledCache = null),
			(this.pooledCacheLanes = 0),
			(this.formState = s),
			(this.incompleteTransitions = /* @__PURE__ */ new Map());
	}
	function Yo(e, t, n, u, l, i, _, b, s, j, x, M) {
		return (
			(e = new mg(e, t, n, _, s, j, x, M, b)),
			(t = 1),
			i === true && (t |= 24),
			(i = Ie(3, null, null, t)),
			(e.current = i),
			(i.stateNode = e),
			(t = Sl()),
			t.refCount++,
			(e.pooledCache = t),
			t.refCount++,
			(i.memoizedState = { element: u, isDehydrated: n, cache: t }),
			Tl(i),
			e
		);
	}
	function Xo(e) {
		return e ? ((e = $n), e) : $n;
	}
	function Qo(e, t, n, u, l, i) {
		(l = Xo(l)),
			u.context === null ? (u.context = l) : (u.pendingContext = l),
			(u = en(t)),
			(u.payload = { element: n }),
			(i = i === void 0 ? null : i),
			i !== null && (u.callback = i),
			(n = tn(e, u, t)),
			n !== null && (Ze(n, e, t), Qa(n, e, t));
	}
	function Zo(e, t) {
		if (((e = e.memoizedState), e !== null && e.dehydrated !== null)) {
			var n = e.retryLane;
			e.retryLane = n !== 0 && n < t ? n : t;
		}
	}
	function Ki(e, t) {
		Zo(e, t), (e = e.alternate) && Zo(e, t);
	}
	function Ko(e) {
		if (e.tag === 13 || e.tag === 31) {
			var t = xn(e, 67108864);
			t !== null && Ze(t, e, 67108864), Ki(e, 67108864);
		}
	}
	function Wo(e) {
		if (e.tag === 13 || e.tag === 31) {
			var t = nt();
			t = Vu(t);
			var n = xn(e, t);
			n !== null && Ze(n, e, t), Ki(e, t);
		}
	}
	var Au = true;
	function Og(e, t, n, u) {
		var l = E.T;
		E.T = null;
		var i = R.p;
		try {
			(R.p = 2), Wi(e, t, n, u);
		} finally {
			(R.p = i), (E.T = l);
		}
	}
	function pg(e, t, n, u) {
		var l = E.T;
		E.T = null;
		var i = R.p;
		try {
			(R.p = 8), Wi(e, t, n, u);
		} finally {
			(R.p = i), (E.T = l);
		}
	}
	function Wi(e, t, n, u) {
		if (Au) {
			var l = Fi(u);
			if (l === null) Ci(e, t, u, Tu, n), Jo(e, u);
			else if (jg(l, e, t, n, u)) u.stopPropagation();
			else if ((Jo(e, u), t & 4 && -1 < yg.indexOf(e))) {
				for (; l !== null; ) {
					var i = Vn(l);
					if (i !== null)
						switch (i.tag) {
							case 3:
								if (
									((i = i.stateNode),
									i.current.memoizedState.isDehydrated)
								) {
									var _ = jn(i.pendingLanes);
									if (_ !== 0) {
										var b = i;
										for (
											b.pendingLanes |= 2,
												b.entangledLanes |= 2;
											_;

										) {
											var s = 1 << (31 - Je(_));
											(b.entanglements[1] |= s),
												(_ &= ~s);
										}
										St(i),
											(ee & 6) === 0 &&
												((_u = We() + 500), lc(0));
									}
								}
								break;
							case 31:
							case 13:
								(b = xn(i, 2)),
									b !== null && Ze(b, i, 2),
									bu(),
									Ki(i, 2);
						}
					if (
						((i = Fi(u)), i === null && Ci(e, t, u, Tu, n), i === l)
					)
						break;
					l = i;
				}
				l !== null && u.stopPropagation();
			} else Ci(e, t, u, null, n);
		}
	}
	function Fi(e) {
		return (e = ku(e)), Ji(e);
	}
	var Tu = null;
	function Ji(e) {
		if (((Tu = null), (e = Ln(e)), e !== null)) {
			var t = g(e);
			if (t === null) e = null;
			else {
				var n = t.tag;
				if (n === 13) {
					if (((e = w(t)), e !== null)) return e;
					e = null;
				} else if (n === 31) {
					if (((e = T(t)), e !== null)) return e;
					e = null;
				} else if (n === 3) {
					if (t.stateNode.current.memoizedState.isDehydrated)
						return t.tag === 3 ? t.stateNode.containerInfo : null;
					e = null;
				} else t !== e && (e = null);
			}
		}
		return (Tu = e), null;
	}
	function Fo(e) {
		switch (e) {
			case 'beforetoggle':
			case 'cancel':
			case 'click':
			case 'close':
			case 'contextmenu':
			case 'copy':
			case 'cut':
			case 'auxclick':
			case 'dblclick':
			case 'dragend':
			case 'dragstart':
			case 'drop':
			case 'focusin':
			case 'focusout':
			case 'input':
			case 'invalid':
			case 'keydown':
			case 'keypress':
			case 'keyup':
			case 'mousedown':
			case 'mouseup':
			case 'paste':
			case 'pause':
			case 'play':
			case 'pointercancel':
			case 'pointerdown':
			case 'pointerup':
			case 'ratechange':
			case 'reset':
			case 'resize':
			case 'seeked':
			case 'submit':
			case 'toggle':
			case 'touchcancel':
			case 'touchend':
			case 'touchstart':
			case 'volumechange':
			case 'change':
			case 'selectionchange':
			case 'textInput':
			case 'compositionstart':
			case 'compositionend':
			case 'compositionupdate':
			case 'beforeblur':
			case 'afterblur':
			case 'beforeinput':
			case 'blur':
			case 'fullscreenchange':
			case 'focus':
			case 'hashchange':
			case 'popstate':
			case 'select':
			case 'selectstart':
				return 2;
			case 'drag':
			case 'dragenter':
			case 'dragexit':
			case 'dragleave':
			case 'dragover':
			case 'mousemove':
			case 'mouseout':
			case 'mouseover':
			case 'pointermove':
			case 'pointerout':
			case 'pointerover':
			case 'scroll':
			case 'touchmove':
			case 'wheel':
			case 'mouseenter':
			case 'mouseleave':
			case 'pointerenter':
			case 'pointerleave':
				return 8;
			case 'message':
				switch (cb()) {
					case er:
						return 2;
					case tr:
						return 8;
					case Oc:
					case ub:
						return 32;
					case nr:
						return 268435456;
					default:
						return 32;
				}
			default:
				return 32;
		}
	}
	var ki = false,
		sn = null,
		gn = null,
		dn = null,
		sc = /* @__PURE__ */ new Map(),
		gc = /* @__PURE__ */ new Map(),
		mn = [],
		yg =
			'mousedown mouseup touchcancel touchend touchstart auxclick dblclick pointercancel pointerdown pointerup dragend dragstart drop compositionend compositionstart keydown keypress keyup input textInput copy cut paste click change contextmenu reset'.split(
				' ',
			);
	function Jo(e, t) {
		switch (e) {
			case 'focusin':
			case 'focusout':
				sn = null;
				break;
			case 'dragenter':
			case 'dragleave':
				gn = null;
				break;
			case 'mouseover':
			case 'mouseout':
				dn = null;
				break;
			case 'pointerover':
			case 'pointerout':
				sc.delete(t.pointerId);
				break;
			case 'gotpointercapture':
			case 'lostpointercapture':
				gc.delete(t.pointerId);
		}
	}
	function dc(e, t, n, u, l, i) {
		return e === null || e.nativeEvent !== i
			? ((e = {
					blockedOn: t,
					domEventName: n,
					eventSystemFlags: u,
					nativeEvent: i,
					targetContainers: [l],
				}),
				t !== null && ((t = Vn(t)), t !== null && Ko(t)),
				e)
			: ((e.eventSystemFlags |= u),
				(t = e.targetContainers),
				l !== null && t.indexOf(l) === -1 && t.push(l),
				e);
	}
	function jg(e, t, n, u, l) {
		switch (t) {
			case 'focusin':
				return (sn = dc(sn, e, t, n, u, l)), true;
			case 'dragenter':
				return (gn = dc(gn, e, t, n, u, l)), true;
			case 'mouseover':
				return (dn = dc(dn, e, t, n, u, l)), true;
			case 'pointerover':
				var i = l.pointerId;
				return sc.set(i, dc(sc.get(i) || null, e, t, n, u, l)), true;
			case 'gotpointercapture':
				return (
					(i = l.pointerId),
					gc.set(i, dc(gc.get(i) || null, e, t, n, u, l)),
					true
				);
		}
		return false;
	}
	function ko(e) {
		var t = Ln(e.target);
		if (t !== null) {
			var n = g(t);
			if (n !== null) {
				if (((t = n.tag), t === 13)) {
					if (((t = w(n)), t !== null)) {
						(e.blockedOn = t),
							rr(e.priority, function () {
								Wo(n);
							});
						return;
					}
				} else if (t === 31) {
					if (((t = T(n)), t !== null)) {
						(e.blockedOn = t),
							rr(e.priority, function () {
								Wo(n);
							});
						return;
					}
				} else if (
					t === 3 &&
					n.stateNode.current.memoizedState.isDehydrated
				) {
					e.blockedOn =
						n.tag === 3 ? n.stateNode.containerInfo : null;
					return;
				}
			}
		}
		e.blockedOn = null;
	}
	function Mu(e) {
		if (e.blockedOn !== null) return false;
		for (var t = e.targetContainers; 0 < t.length; ) {
			var n = Fi(e.nativeEvent);
			if (n === null) {
				n = e.nativeEvent;
				var u = new n.constructor(n.type, n);
				(Ju = u), n.target.dispatchEvent(u), (Ju = null);
			} else
				return (
					(t = Vn(n)), t !== null && Ko(t), (e.blockedOn = n), false
				);
			t.shift();
		}
		return true;
	}
	function Io(e, t, n) {
		Mu(e) && n.delete(t);
	}
	function hg() {
		(ki = false),
			sn !== null && Mu(sn) && (sn = null),
			gn !== null && Mu(gn) && (gn = null),
			dn !== null && Mu(dn) && (dn = null),
			sc.forEach(Io),
			gc.forEach(Io);
	}
	function Du(e, t) {
		e.blockedOn === t &&
			((e.blockedOn = null),
			ki ||
				((ki = true),
				a.unstable_scheduleCallback(a.unstable_NormalPriority, hg)));
	}
	var Ru = null;
	function $o(e) {
		Ru !== e &&
			((Ru = e),
			a.unstable_scheduleCallback(a.unstable_NormalPriority, function () {
				Ru === e && (Ru = null);
				for (var t = 0; t < e.length; t += 3) {
					var n = e[t],
						u = e[t + 1],
						l = e[t + 2];
					if (typeof u != 'function') {
						if (Ji(u || n) === null) continue;
						break;
					}
					var i = Vn(n);
					i !== null &&
						(e.splice(t, 3),
						(t -= 3),
						Fl(
							i,
							{
								pending: true,
								data: l,
								method: n.method,
								action: u,
							},
							u,
							l,
						));
				}
			}));
	}
	function wa(e) {
		function t(s) {
			return Du(s, e);
		}
		sn !== null && Du(sn, e),
			gn !== null && Du(gn, e),
			dn !== null && Du(dn, e),
			sc.forEach(t),
			gc.forEach(t);
		for (var n = 0; n < mn.length; n++) {
			var u = mn[n];
			u.blockedOn === e && (u.blockedOn = null);
		}
		for (; 0 < mn.length && ((n = mn[0]), n.blockedOn === null); )
			ko(n), n.blockedOn === null && mn.shift();
		if (((n = (e.ownerDocument || e).$$reactFormReplay), n != null))
			for (u = 0; u < n.length; u += 3) {
				var l = n[u],
					i = n[u + 1],
					_ = l[qe] || null;
				if (typeof i == 'function') _ || $o(n);
				else if (_) {
					var b = null;
					if (i && i.hasAttribute('formAction')) {
						if (((l = i), (_ = i[qe] || null))) b = _.formAction;
						else if (Ji(l) !== null) continue;
					} else b = _.action;
					typeof b == 'function'
						? (n[u + 1] = b)
						: (n.splice(u, 3), (u -= 3)),
						$o(n);
				}
			}
	}
	function Po() {
		function e(i) {
			i.canIntercept &&
				i.info === 'react-transition' &&
				i.intercept({
					handler: function () {
						return new Promise(function (_) {
							return (l = _);
						});
					},
					focusReset: 'manual',
					scroll: 'manual',
				});
		}
		function t() {
			l !== null && (l(), (l = null)), u || setTimeout(n, 20);
		}
		function n() {
			if (!u && !navigation.transition) {
				var i = navigation.currentEntry;
				i &&
					i.url != null &&
					navigation.navigate(i.url, {
						state: i.getState(),
						info: 'react-transition',
						history: 'replace',
					});
			}
		}
		if (typeof navigation == 'object') {
			var u = false,
				l = null;
			return (
				navigation.addEventListener('navigate', e),
				navigation.addEventListener('navigatesuccess', t),
				navigation.addEventListener('navigateerror', t),
				setTimeout(n, 100),
				function () {
					(u = true),
						navigation.removeEventListener('navigate', e),
						navigation.removeEventListener('navigatesuccess', t),
						navigation.removeEventListener('navigateerror', t),
						l !== null && (l(), (l = null));
				}
			);
		}
	}
	function Ii(e) {
		this._internalRoot = e;
	}
	(zu.prototype.render = Ii.prototype.render =
		function (e) {
			var t = this._internalRoot;
			if (t === null) throw Error(f(409));
			var n = t.current,
				u = nt();
			Qo(n, u, e, t, null, null);
		}),
		(zu.prototype.unmount = Ii.prototype.unmount =
			function () {
				var e = this._internalRoot;
				if (e !== null) {
					this._internalRoot = null;
					var t = e.containerInfo;
					Qo(e.current, 2, null, e, null, null), bu(), (t[qn] = null);
				}
			});
	function zu(e) {
		this._internalRoot = e;
	}
	zu.prototype.unstable_scheduleHydration = function (e) {
		if (e) {
			var t = ir();
			e = { blockedOn: null, target: e, priority: t };
			for (
				var n = 0;
				n < mn.length && t !== 0 && t < mn[n].priority;
				n++
			);
			mn.splice(n, 0, e), n === 0 && ko(e);
		}
	};
	var eb = c.version;
	if (eb !== '19.2.4') throw Error(f(527, eb, '19.2.4'));
	R.findDOMNode = function (e) {
		var t = e._reactInternals;
		if (t === void 0)
			throw typeof e.render == 'function'
				? Error(f(188))
				: ((e = Object.keys(e).join(',')), Error(f(268, e)));
		return (
			(e = p(t)),
			(e = e !== null ? N(e) : null),
			(e = e === null ? null : e.stateNode),
			e
		);
	};
	var wg = {
		bundleType: 0,
		version: '19.2.4',
		rendererPackageName: 'react-dom',
		currentDispatcherRef: E,
		reconcilerVersion: '19.2.4',
	};
	if (typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ < 'u') {
		var Cu = __REACT_DEVTOOLS_GLOBAL_HOOK__;
		if (!Cu.isDisabled && Cu.supportsFiber)
			try {
				(Sa = Cu.inject(wg)), (Fe = Cu);
			} catch {}
	}
	return (
		(reactDomClient_production.createRoot = function (e, t) {
			if (!o(e)) throw Error(f(299));
			var n = false,
				u = '',
				l = l_,
				i = i_,
				_ = r_;
			return (
				t != null &&
					(t.unstable_strictMode === true && (n = true),
					t.identifierPrefix !== void 0 && (u = t.identifierPrefix),
					t.onUncaughtError !== void 0 && (l = t.onUncaughtError),
					t.onCaughtError !== void 0 && (i = t.onCaughtError),
					t.onRecoverableError !== void 0 &&
						(_ = t.onRecoverableError)),
				(t = Yo(e, 1, false, null, null, n, u, null, l, i, _, Po)),
				(e[qn] = t.current),
				zi(e),
				new Ii(t)
			);
		}),
		(reactDomClient_production.hydrateRoot = function (e, t, n) {
			if (!o(e)) throw Error(f(299));
			var u = false,
				l = '',
				i = l_,
				_ = i_,
				b = r_,
				s = null;
			return (
				n != null &&
					(n.unstable_strictMode === true && (u = true),
					n.identifierPrefix !== void 0 && (l = n.identifierPrefix),
					n.onUncaughtError !== void 0 && (i = n.onUncaughtError),
					n.onCaughtError !== void 0 && (_ = n.onCaughtError),
					n.onRecoverableError !== void 0 &&
						(b = n.onRecoverableError),
					n.formState !== void 0 && (s = n.formState)),
				(t = Yo(e, 1, true, t, n ?? null, u, l, s, i, _, b, Po)),
				(t.context = Xo(null)),
				(n = t.current),
				(u = nt()),
				(u = Vu(u)),
				(l = en(u)),
				(l.callback = null),
				tn(n, l, u),
				(n = u),
				(t.current.lanes = n),
				Ea(t, n),
				St(t),
				(e[qn] = t.current),
				zi(e),
				new zu(t)
			);
		}),
		(reactDomClient_production.version = '19.2.4'),
		reactDomClient_production
	);
}
var hasRequiredClient;
function requireClient() {
	if (hasRequiredClient) return client.exports;
	hasRequiredClient = 1;
	function a() {
		if (
			!(
				typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ > 'u' ||
				typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE != 'function'
			)
		)
			try {
				__REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(a);
			} catch (c) {
				console.error(c);
			}
	}
	return (
		a(),
		(client.exports = requireReactDomClient_production()),
		client.exports
	);
}
var clientExports = requireClient();
const ReactDOM = getDefaultExportFromCjs(clientExports);
class EventBus {
	constructor() {
		__publicField(this, 'listeners', /* @__PURE__ */ new Map());
	}
	on(c, r) {
		this.listeners.has(c) ||
			this.listeners.set(c, /* @__PURE__ */ new Set());
		const f = this.listeners.get(c),
			o = r;
		return (
			f.add(o),
			() => {
				f.delete(o);
			}
		);
	}
	once(c, r) {
		const f = this.on(c, (o) => {
			f(), r(o);
		});
		return f;
	}
	emit(c, ...r) {
		const f = this.listeners.get(c);
		if (f) {
			const o = r[0];
			f.forEach((g) => g(o));
		}
	}
	off(c) {
		this.listeners.delete(c);
	}
}
const gameEvents = new EventBus(),
	DEFAULT_TOAST_CONFIG = { maxVisible: 5 },
	SEVERITY_DURATIONS = {
		info: 3e3,
		success: 3e3,
		warning: 5e3,
		error: 6e3,
		loot: 4e3,
	},
	SEVERITY_BORDER_COLORS = {
		info: 'border-l-toast-info',
		success: 'border-l-toast-success',
		warning: 'border-l-toast-warning',
		error: 'border-l-toast-error',
		loot: 'border-l-toast-loot',
	};
function toastReducer(a, c) {
	switch (c.type) {
		case 'ADD': {
			let r = [...a.toasts, c.toast];
			return (
				r.length > DEFAULT_TOAST_CONFIG.maxVisible &&
					(r = r.map((f, o) =>
						o === 0 && !f.exiting ? { ...f, exiting: true } : f,
					)),
				{ toasts: r }
			);
		}
		case 'MARK_EXITING':
			return {
				toasts: a.toasts.map((r) =>
					r.id === c.id ? { ...r, exiting: true } : r,
				),
			};
		case 'REMOVE':
			return { toasts: a.toasts.filter((r) => r.id !== c.id) };
		case 'CLEAR':
			return { toasts: a.toasts.map((r) => ({ ...r, exiting: true })) };
	}
}
const ToastStateContext = reactExports.createContext({ toasts: [] }),
	ToastDispatchContext = reactExports.createContext(() => {});
function ToastProvider({ children: a }) {
	const [c, r] = reactExports.useReducer(toastReducer, { toasts: [] });
	return (
		reactExports.useEffect(() => {
			const f = gameEvents.on(
					'toast:show',
					({ message: w, severity: T, duration: S }) => {
						r({
							type: 'ADD',
							toast: {
								id: crypto.randomUUID(),
								message: w,
								severity: T,
								duration: S ?? SEVERITY_DURATIONS[T],
								createdAt: Date.now(),
								exiting: false,
							},
						});
					},
				),
				o = gameEvents.on('toast:dismiss', ({ id: w }) => {
					r({ type: 'MARK_EXITING', id: w });
				}),
				g = gameEvents.on('toast:clear', () => {
					r({ type: 'CLEAR' });
				});
			return () => {
				f(), o(), g();
			};
		}, []),
		jsxRuntimeExports.jsx(ToastStateContext, {
			value: c,
			children: jsxRuntimeExports.jsx(ToastDispatchContext, {
				value: r,
				children: a,
			}),
		})
	);
}
const initialState$1 = { stack: [], isOpen: false };
function modalReducer(a, c) {
	var _a;
	switch (c.type) {
		case 'OPEN':
			return { stack: [...a.stack, c.modal], isOpen: true };
		case 'CLOSE': {
			const r = a.stack[a.stack.length - 1],
				f = a.stack.slice(0, -1);
			return (
				(_a = r == null ? void 0 : r.onClose) == null
					? void 0
					: _a.call(r),
				{ stack: f, isOpen: f.length > 0 }
			);
		}
		case 'CLOSE_ALL':
			return (
				a.stack.forEach((r) => {
					var _a2;
					return (_a2 = r.onClose) == null ? void 0 : _a2.call(r);
				}),
				initialState$1
			);
	}
}
const ModalStateContext = reactExports.createContext(initialState$1),
	ModalDispatchContext = reactExports.createContext(() => {});
function ModalProvider({ children: a }) {
	const [c, r] = reactExports.useReducer(modalReducer, initialState$1);
	return (
		reactExports.useEffect(() => {
			const f = gameEvents.on(
					'modal:open',
					({ id: g, title: w, content: T, size: S, onClose: p }) => {
						r({
							type: 'OPEN',
							modal: {
								id: g ?? crypto.randomUUID(),
								title: w,
								content: T,
								onClose: p,
								closeOnOverlayClick: true,
								closeOnEscape: true,
								size: S ?? 'md',
							},
						});
					},
				),
				o = gameEvents.on('modal:close', () => {
					r({ type: 'CLOSE' });
				});
			return () => {
				f(), o();
			};
		}, []),
		jsxRuntimeExports.jsx(ModalStateContext, {
			value: c,
			children: jsxRuntimeExports.jsx(ModalDispatchContext, {
				value: r,
				children: a,
			}),
		})
	);
}
const initialState = { isOpen: false, activeCategory: 'general' };
function menuReducer(a, c) {
	switch (c.type) {
		case 'TOGGLE':
			return { ...a, isOpen: !a.isOpen };
		case 'OPEN':
			return { ...a, isOpen: true };
		case 'CLOSE':
			return { ...a, isOpen: false, activeCategory: 'general' };
		case 'SET_CATEGORY':
			return { ...a, activeCategory: c.category };
	}
}
const MenuStateContext = reactExports.createContext(initialState),
	MenuDispatchContext = reactExports.createContext(() => {});
function MenuProvider({ children: a }) {
	const [c, r] = reactExports.useReducer(menuReducer, initialState);
	return (
		reactExports.useEffect(() => {
			const f = gameEvents.on('menu:toggle', () => {
					r({ type: 'TOGGLE' });
				}),
				o = gameEvents.on('menu:open', () => {
					r({ type: 'OPEN' });
				}),
				g = gameEvents.on('menu:close', () => {
					r({ type: 'CLOSE' });
				});
			return () => {
				f(), o(), g();
			};
		}, []),
		jsxRuntimeExports.jsx(MenuStateContext, {
			value: c,
			children: jsxRuntimeExports.jsx(MenuDispatchContext, {
				value: r,
				children: a,
			}),
		})
	);
}
var reactDomExports = requireReactDom();
const portalCache = /* @__PURE__ */ new Map(),
	Z_INDEX = { 'toast-root': '100', 'modal-root': '90', 'menu-root': '80' };
function getPortalRoot(a) {
	let c = portalCache.get(a);
	return (
		(!c || !document.body.contains(c)) &&
			((c = document.createElement('div')),
			(c.id = a),
			(c.style.position = 'fixed'),
			(c.style.inset = '0'),
			(c.style.pointerEvents = 'none'),
			(c.style.zIndex = Z_INDEX[a] ?? '50'),
			document.body.appendChild(c),
			portalCache.set(a, c)),
		c
	);
}
function ToastItem({ toast: a, onDismiss: c }) {
	reactExports.useEffect(() => {
		if (a.duration <= 0 || a.exiting) return;
		const f = setTimeout(() => c(a.id), a.duration);
		return () => clearTimeout(f);
	}, [a.id, a.duration, a.exiting, c]);
	const r = SEVERITY_BORDER_COLORS[a.severity];
	return jsxRuntimeExports.jsxs('div', {
		className: `
				pointer-events-auto mb-2 px-3 py-2 md:px-4 md:py-3 min-w-[180px] md:min-w-[260px] max-w-[280px] md:max-w-[380px]
				bg-panel shadow-toast
				border-2 border-panel-border border-l-4 ${r}
				${a.exiting ? 'animate-toast-out' : 'animate-toast-in'}
				flex items-start gap-2
			`,
		onAnimationEnd: () => {
			a.exiting && c(a.id);
		},
		children: [
			jsxRuntimeExports.jsx('span', {
				className: 'text-[8px] md:text-xs leading-relaxed flex-1',
				children: a.message,
			}),
			jsxRuntimeExports.jsx('button', {
				onClick: () => c(a.id),
				className:
					'text-text-muted hover:text-text text-[8px] md:text-xs leading-none mt-0.5 cursor-pointer',
				children: '\u2715',
			}),
		],
	});
}
function ToastContainer() {
	const { toasts: a } = reactExports.useContext(ToastStateContext),
		c = reactExports.useContext(ToastDispatchContext),
		r = reactExports.useCallback(
			(f) => {
				var _a;
				((_a = a.find((g) => g.id === f)) == null ? void 0 : _a.exiting)
					? c({ type: 'REMOVE', id: f })
					: c({ type: 'MARK_EXITING', id: f });
			},
			[a, c],
		);
	return a.length === 0
		? null
		: reactDomExports.createPortal(
				jsxRuntimeExports.jsx('div', {
					className:
						'fixed top-14 right-4 flex flex-col items-end pointer-events-none',
					children: a.map((f) =>
						jsxRuntimeExports.jsx(
							ToastItem,
							{ toast: f, onDismiss: r },
							f.id,
						),
					),
				}),
				getPortalRoot('toast-root'),
			);
}
const MODAL_SIZE_CLASSES = {
	xs: 'max-w-xs',
	sm: 'max-w-sm',
	md: 'max-w-md',
	lg: 'max-w-lg',
};
function ModalOverlay() {
	const { stack: a, isOpen: c } = reactExports.useContext(ModalStateContext),
		r = reactExports.useContext(ModalDispatchContext);
	if (!c || a.length === 0) return null;
	const f = a[a.length - 1],
		o = MODAL_SIZE_CLASSES[f.size ?? 'md'];
	return reactDomExports.createPortal(
		jsxRuntimeExports.jsx('div', {
			className:
				'fixed inset-0 bg-overlay flex items-center justify-center pointer-events-auto',
			onClick: () => {
				f.closeOnOverlayClick !== false && r({ type: 'CLOSE' });
			},
			children: jsxRuntimeExports.jsx('div', {
				className: `
					${o} mx-4
					border-[3px] border-panel-border
					shadow-[0_0_0_1px_#1a1008,0_6px_20px_rgba(0,0,0,0.8)]
					animate-modal-in
				`,
				onClick: (g) => g.stopPropagation(),
				children: jsxRuntimeExports.jsxs('div', {
					className: 'border-2 border-[#1a1008]',
					children: [
						jsxRuntimeExports.jsxs('div', {
							className:
								'flex items-center justify-between px-3 py-2 md:px-4 md:py-3 bg-[#1e1408] border-b border-[#5a4a2a]',
							children: [
								jsxRuntimeExports.jsx('h2', {
									className:
										'text-[10px] md:text-sm text-[#c8a832]',
									children: f.title,
								}),
								jsxRuntimeExports.jsx('button', {
									onClick: () => r({ type: 'CLOSE' }),
									className: `w-5 h-5 md:w-7 md:h-7 flex items-center justify-center
								bg-[#3d2b14] border border-[#5a4a2a]
								text-text-muted hover:text-[#c8a832] hover:border-panel-border
								text-[8px] md:text-xs leading-none cursor-pointer transition-colors`,
									children: '\u2715',
								}),
							],
						}),
						jsxRuntimeExports.jsx('div', {
							className:
								'p-3 md:p-4 bg-panel-inner text-[8px] md:text-xs',
							children: f.content,
						}),
					],
				}),
			}),
		}),
		getPortalRoot('modal-root'),
	);
}
const CATEGORIES = [
	{ key: 'general', label: 'General' },
	{ key: 'audio', label: 'Audio' },
	{ key: 'video', label: 'Video' },
	{ key: 'controls', label: 'Controls' },
];
function SettingsContent({ category: a }) {
	switch (a) {
		case 'general':
			return jsxRuntimeExports.jsxs('div', {
				className: 'space-y-3',
				children: [
					jsxRuntimeExports.jsx('h3', {
						className: 'text-[9px] mb-2',
						children: 'General Settings',
					}),
					jsxRuntimeExports.jsx('div', {
						className: 'text-[8px] text-text-muted',
						children: 'Game settings will be added here.',
					}),
				],
			});
		case 'audio':
			return jsxRuntimeExports.jsxs('div', {
				className: 'space-y-3',
				children: [
					jsxRuntimeExports.jsx('h3', {
						className: 'text-[9px] mb-2',
						children: 'Audio Settings',
					}),
					jsxRuntimeExports.jsx('div', {
						className: 'text-[8px] text-text-muted',
						children: 'Volume controls will be added here.',
					}),
				],
			});
		case 'video':
			return jsxRuntimeExports.jsxs('div', {
				className: 'space-y-3',
				children: [
					jsxRuntimeExports.jsx('h3', {
						className: 'text-[9px] mb-2',
						children: 'Video Settings',
					}),
					jsxRuntimeExports.jsx('div', {
						className: 'text-[8px] text-text-muted',
						children:
							'Resolution and display options will be added here.',
					}),
				],
			});
		case 'controls':
			return jsxRuntimeExports.jsxs('div', {
				className: 'space-y-3',
				children: [
					jsxRuntimeExports.jsx('h3', {
						className: 'text-[9px] mb-2',
						children: 'Controls',
					}),
					jsxRuntimeExports.jsxs('div', {
						className: 'text-[8px] text-text-muted space-y-1',
						children: [
							jsxRuntimeExports.jsx('div', {
								children: 'W / A / S / D \u2014 Move',
							}),
							jsxRuntimeExports.jsx('div', {
								children: 'Space \u2014 Jump',
							}),
							jsxRuntimeExports.jsx('div', {
								children: 'Escape \u2014 Toggle Menu',
							}),
						],
					}),
				],
			});
	}
}
function PauseMenu() {
	const { isOpen: a, activeCategory: c } =
			reactExports.useContext(MenuStateContext),
		r = reactExports.useContext(MenuDispatchContext);
	return a
		? reactDomExports.createPortal(
				jsxRuntimeExports.jsx('div', {
					className:
						'fixed inset-0 bg-overlay flex items-center justify-center pointer-events-auto',
					children: jsxRuntimeExports.jsxs('div', {
						className:
							'bg-panel border-2 border-panel-border shadow-panel w-full max-w-lg mx-4 animate-modal-in',
						children: [
							jsxRuntimeExports.jsxs('div', {
								className:
									'flex items-center justify-between px-3 py-2 border-b-2 border-panel-border bg-panel-inner',
								children: [
									jsxRuntimeExports.jsx('h2', {
										className: 'text-[10px]',
										children: 'Settings',
									}),
									jsxRuntimeExports.jsx('button', {
										onClick: () => r({ type: 'CLOSE' }),
										className:
											'text-text-muted hover:text-text text-[10px] leading-none cursor-pointer',
										children: '\u2715',
									}),
								],
							}),
							jsxRuntimeExports.jsxs('div', {
								className: 'flex min-h-[240px]',
								children: [
									jsxRuntimeExports.jsx('div', {
										className:
											'w-32 border-r-2 border-panel-border p-2 flex flex-col gap-1 bg-panel-inner',
										children: CATEGORIES.map(
											({ key: f, label: o }) =>
												jsxRuntimeExports.jsx(
													'button',
													{
														onClick: () =>
															r({
																type: 'SET_CATEGORY',
																category: f,
															}),
														className: `
									text-left text-[8px] px-3 py-1.5 cursor-pointer transition-colors
									${c === f ? 'bg-btn text-text' : 'text-text-muted hover:text-text hover:bg-btn/30'}
								`,
														children: o,
													},
													f,
												),
										),
									}),
									jsxRuntimeExports.jsx('div', {
										className: 'flex-1 p-4 bg-panel-inner',
										children: jsxRuntimeExports.jsx(
											SettingsContent,
											{ category: c },
										),
									}),
								],
							}),
							jsxRuntimeExports.jsx('div', {
								className:
									'flex justify-end px-3 py-2 border-t-2 border-panel-border bg-panel-inner',
								children: jsxRuntimeExports.jsx('button', {
									onClick: () => r({ type: 'CLOSE' }),
									className:
										'px-4 py-1.5 text-[8px] bg-btn border border-btn-border hover:bg-btn-hover cursor-pointer transition-colors text-text',
									children: 'Resume',
								}),
							}),
						],
					}),
				}),
				getPortalRoot('menu-root'),
			)
		: null;
}
function useKeyboard(a, c, r = true) {
	reactExports.useEffect(() => {
		if (!r) return;
		const f = (o) => {
			o.key === a && (o.preventDefault(), c());
		};
		return (
			window.addEventListener('keydown', f),
			() => window.removeEventListener('keydown', f)
		);
	}, [a, c, r]);
}
function focusCanvas() {
	var _a;
	(_a = document.getElementById('bevy-canvas')) == null ? void 0 : _a.focus();
}
function KeyboardRouter() {
	const a = reactExports.useContext(ModalStateContext),
		c = reactExports.useContext(ModalDispatchContext),
		r = reactExports.useContext(MenuStateContext),
		f = reactExports.useContext(MenuDispatchContext),
		o = reactExports.useRef(false),
		g = a.isOpen || r.isOpen;
	reactExports.useEffect(() => {
		o.current && !g && focusCanvas(), (o.current = g);
	}, [g]);
	const w = reactExports.useCallback(() => {
		a.isOpen
			? c({ type: 'CLOSE' })
			: r.isOpen
				? f({ type: 'CLOSE' })
				: f({ type: 'OPEN' });
	}, [a.isOpen, r.isOpen, c, f]);
	return useKeyboard('Escape', w), null;
}
function GameUIProvider({ children: a }) {
	return jsxRuntimeExports.jsx(ToastProvider, {
		children: jsxRuntimeExports.jsx(ModalProvider, {
			children: jsxRuntimeExports.jsxs(MenuProvider, {
				children: [
					jsxRuntimeExports.jsx(KeyboardRouter, {}),
					a,
					jsxRuntimeExports.jsx(ToastContainer, {}),
					jsxRuntimeExports.jsx(ModalOverlay, {}),
					jsxRuntimeExports.jsx(PauseMenu, {}),
				],
			}),
		}),
	});
}
function get_fps() {
	return wasm.get_fps() >>> 0;
}
function get_player_state_json() {
	let a, c;
	try {
		const o = wasm.__wbindgen_add_to_stack_pointer(-16);
		wasm.get_player_state_json(o);
		var r = getDataViewMemory0().getInt32(o + 0, true),
			f = getDataViewMemory0().getInt32(o + 4, true);
		return (a = r), (c = f), getStringFromWasm0(r, f);
	} finally {
		wasm.__wbindgen_add_to_stack_pointer(16),
			wasm.__wbindgen_export4(a, c, 1);
	}
}
function get_selected_object_json() {
	try {
		const r = wasm.__wbindgen_add_to_stack_pointer(-16);
		wasm.get_selected_object_json(r);
		var a = getDataViewMemory0().getInt32(r + 0, true),
			c = getDataViewMemory0().getInt32(r + 4, true);
		let f;
		return (
			a !== 0 &&
				((f = getStringFromWasm0(a, c).slice()),
				wasm.__wbindgen_export4(a, c * 1, 1)),
			f
		);
	} finally {
		wasm.__wbindgen_add_to_stack_pointer(16);
	}
}
function __wbg_get_imports() {
	const import0 = {
		__proto__: null,
		__wbg_Window_1535697a053fe988: function (a) {
			const c = getObject(a).Window;
			return addHeapObject(c);
		},
		__wbg_Window_c7f91e3f80ae0a0e: function (a) {
			const c = getObject(a).Window;
			return addHeapObject(c);
		},
		__wbg_Window_e0df001eddf1d3fa: function (a) {
			const c = getObject(a).Window;
			return addHeapObject(c);
		},
		__wbg_WorkerGlobalScope_b9ad7f2d34707e2e: function (a) {
			const c = getObject(a).WorkerGlobalScope;
			return addHeapObject(c);
		},
		__wbg_WorkerGlobalScope_d731e9136c6c49a0: function (a) {
			const c = getObject(a).WorkerGlobalScope;
			return addHeapObject(c);
		},
		__wbg___wbindgen_boolean_get_c0f3f60bac5a78d1: function (a) {
			const c = getObject(a),
				r = typeof c == 'boolean' ? c : void 0;
			return isLikeNone(r) ? 16777215 : r ? 1 : 0;
		},
		__wbg___wbindgen_debug_string_5398f5bb970e0daa: function (a, c) {
			const r = debugString(getObject(c)),
				f = passStringToWasm0(
					r,
					wasm.__wbindgen_export,
					wasm.__wbindgen_export2,
				),
				o = WASM_VECTOR_LEN;
			getDataViewMemory0().setInt32(a + 4, o, true),
				getDataViewMemory0().setInt32(a + 0, f, true);
		},
		__wbg___wbindgen_is_function_3c846841762788c1: function (a) {
			return typeof getObject(a) == 'function';
		},
		__wbg___wbindgen_is_null_0b605fc6b167c56f: function (a) {
			return getObject(a) === null;
		},
		__wbg___wbindgen_is_object_781bc9f159099513: function (a) {
			const c = getObject(a);
			return typeof c == 'object' && c !== null;
		},
		__wbg___wbindgen_is_undefined_52709e72fb9f179c: function (a) {
			return getObject(a) === void 0;
		},
		__wbg___wbindgen_number_get_34bb9d9dcfa21373: function (a, c) {
			const r = getObject(c),
				f = typeof r == 'number' ? r : void 0;
			getDataViewMemory0().setFloat64(a + 8, isLikeNone(f) ? 0 : f, true),
				getDataViewMemory0().setInt32(a + 0, !isLikeNone(f), true);
		},
		__wbg___wbindgen_string_get_395e606bd0ee4427: function (a, c) {
			const r = getObject(c),
				f = typeof r == 'string' ? r : void 0;
			var o = isLikeNone(f)
					? 0
					: passStringToWasm0(
							f,
							wasm.__wbindgen_export,
							wasm.__wbindgen_export2,
						),
				g = WASM_VECTOR_LEN;
			getDataViewMemory0().setInt32(a + 4, g, true),
				getDataViewMemory0().setInt32(a + 0, o, true);
		},
		__wbg___wbindgen_throw_6ddd609b62940d55: function (a, c) {
			throw new Error(getStringFromWasm0(a, c));
		},
		__wbg__wbg_cb_unref_6b5b6b8576d35cb1: function (a) {
			getObject(a)._wbg_cb_unref();
		},
		__wbg_abort_5ef96933660780b7: function (a) {
			getObject(a).abort();
		},
		__wbg_activeElement_c2981ba623ac16d9: function (a) {
			const c = getObject(a).activeElement;
			return isLikeNone(c) ? 0 : addHeapObject(c);
		},
		__wbg_activeTexture_11610c2c57e26cfa: function (a, c) {
			getObject(a).activeTexture(c >>> 0);
		},
		__wbg_activeTexture_66fa8cafd3610ddb: function (a, c) {
			getObject(a).activeTexture(c >>> 0);
		},
		__wbg_addEventListener_2d985aa8a656f6dc: function () {
			return handleError(function (a, c, r, f) {
				getObject(a).addEventListener(
					getStringFromWasm0(c, r),
					getObject(f),
				);
			}, arguments);
		},
		__wbg_addListener_af610a227738fed8: function () {
			return handleError(function (a, c) {
				getObject(a).addListener(getObject(c));
			}, arguments);
		},
		__wbg_altKey_7f2c3a24bf5420ae: function (a) {
			return getObject(a).altKey;
		},
		__wbg_altKey_a8e58d65866de029: function (a) {
			return getObject(a).altKey;
		},
		__wbg_animate_8f41e2f47c7d04ab: function (a, c, r) {
			const f = getObject(a).animate(getObject(c), getObject(r));
			return addHeapObject(f);
		},
		__wbg_appendChild_8cb157b6ec5612a6: function () {
			return handleError(function (a, c) {
				const r = getObject(a).appendChild(getObject(c));
				return addHeapObject(r);
			}, arguments);
		},
		__wbg_arrayBuffer_eb8e9ca620af2a19: function () {
			return handleError(function (a) {
				const c = getObject(a).arrayBuffer();
				return addHeapObject(c);
			}, arguments);
		},
		__wbg_attachShader_6426e8576a115345: function (a, c, r) {
			getObject(a).attachShader(getObject(c), getObject(r));
		},
		__wbg_attachShader_e557f37438249ff7: function (a, c, r) {
			getObject(a).attachShader(getObject(c), getObject(r));
		},
		__wbg_axes_4ba58f8779c5d176: function (a) {
			const c = getObject(a).axes;
			return addHeapObject(c);
		},
		__wbg_beginComputePass_d7b46482cf2ed824: function (a, c) {
			const r = getObject(a).beginComputePass(getObject(c));
			return addHeapObject(r);
		},
		__wbg_beginQuery_ac2ef47e00ec594a: function (a, c, r) {
			getObject(a).beginQuery(c >>> 0, getObject(r));
		},
		__wbg_beginRenderPass_373f34636d157c43: function () {
			return handleError(function (a, c) {
				const r = getObject(a).beginRenderPass(getObject(c));
				return addHeapObject(r);
			}, arguments);
		},
		__wbg_bindAttribLocation_1d976e3bcc954adb: function (a, c, r, f, o) {
			getObject(a).bindAttribLocation(
				getObject(c),
				r >>> 0,
				getStringFromWasm0(f, o),
			);
		},
		__wbg_bindAttribLocation_8791402cc151e914: function (a, c, r, f, o) {
			getObject(a).bindAttribLocation(
				getObject(c),
				r >>> 0,
				getStringFromWasm0(f, o),
			);
		},
		__wbg_bindBufferRange_469c3643c2099003: function (a, c, r, f, o, g) {
			getObject(a).bindBufferRange(c >>> 0, r >>> 0, getObject(f), o, g);
		},
		__wbg_bindBuffer_142694a9732bc098: function (a, c, r) {
			getObject(a).bindBuffer(c >>> 0, getObject(r));
		},
		__wbg_bindBuffer_d2a4f6cfb33336fb: function (a, c, r) {
			getObject(a).bindBuffer(c >>> 0, getObject(r));
		},
		__wbg_bindFramebuffer_4643a12ca1c72776: function (a, c, r) {
			getObject(a).bindFramebuffer(c >>> 0, getObject(r));
		},
		__wbg_bindFramebuffer_fdc7c38f1c700e64: function (a, c, r) {
			getObject(a).bindFramebuffer(c >>> 0, getObject(r));
		},
		__wbg_bindRenderbuffer_91db2fc67c1f0115: function (a, c, r) {
			getObject(a).bindRenderbuffer(c >>> 0, getObject(r));
		},
		__wbg_bindRenderbuffer_e6cfc20b6ebcf605: function (a, c, r) {
			getObject(a).bindRenderbuffer(c >>> 0, getObject(r));
		},
		__wbg_bindSampler_be3a05e88cecae98: function (a, c, r) {
			getObject(a).bindSampler(c >>> 0, getObject(r));
		},
		__wbg_bindTexture_6a0892cd752b41d9: function (a, c, r) {
			getObject(a).bindTexture(c >>> 0, getObject(r));
		},
		__wbg_bindTexture_6e7e157d0aabe457: function (a, c, r) {
			getObject(a).bindTexture(c >>> 0, getObject(r));
		},
		__wbg_bindVertexArrayOES_082b0791772327fa: function (a, c) {
			getObject(a).bindVertexArrayOES(getObject(c));
		},
		__wbg_bindVertexArray_c307251f3ff61930: function (a, c) {
			getObject(a).bindVertexArray(getObject(c));
		},
		__wbg_blendColor_b4c7d8333af4876d: function (a, c, r, f, o) {
			getObject(a).blendColor(c, r, f, o);
		},
		__wbg_blendColor_c2771aead110c867: function (a, c, r, f, o) {
			getObject(a).blendColor(c, r, f, o);
		},
		__wbg_blendEquationSeparate_b08aba1c715cb265: function (a, c, r) {
			getObject(a).blendEquationSeparate(c >>> 0, r >>> 0);
		},
		__wbg_blendEquationSeparate_f16ada84ba672878: function (a, c, r) {
			getObject(a).blendEquationSeparate(c >>> 0, r >>> 0);
		},
		__wbg_blendEquation_46367a891604b604: function (a, c) {
			getObject(a).blendEquation(c >>> 0);
		},
		__wbg_blendEquation_c353d94b097007e5: function (a, c) {
			getObject(a).blendEquation(c >>> 0);
		},
		__wbg_blendFuncSeparate_6aae138b81d75b47: function (a, c, r, f, o) {
			getObject(a).blendFuncSeparate(c >>> 0, r >>> 0, f >>> 0, o >>> 0);
		},
		__wbg_blendFuncSeparate_8c91c200b1a72e4b: function (a, c, r, f, o) {
			getObject(a).blendFuncSeparate(c >>> 0, r >>> 0, f >>> 0, o >>> 0);
		},
		__wbg_blendFunc_2e98c5f57736e5f3: function (a, c, r) {
			getObject(a).blendFunc(c >>> 0, r >>> 0);
		},
		__wbg_blendFunc_4ce0991003a9468e: function (a, c, r) {
			getObject(a).blendFunc(c >>> 0, r >>> 0);
		},
		__wbg_blitFramebuffer_c1a68feaca974c87: function (
			a,
			c,
			r,
			f,
			o,
			g,
			w,
			T,
			S,
			p,
			N,
		) {
			getObject(a).blitFramebuffer(
				c,
				r,
				f,
				o,
				g,
				w,
				T,
				S,
				p >>> 0,
				N >>> 0,
			);
		},
		__wbg_blockSize_5871fe73cc8dcba0: function (a) {
			return getObject(a).blockSize;
		},
		__wbg_body_5eb99e7257e5ae34: function (a) {
			const c = getObject(a).body;
			return isLikeNone(c) ? 0 : addHeapObject(c);
		},
		__wbg_brand_3bc196a43eceb8af: function (a, c) {
			const r = getObject(c).brand,
				f = passStringToWasm0(
					r,
					wasm.__wbindgen_export,
					wasm.__wbindgen_export2,
				),
				o = WASM_VECTOR_LEN;
			getDataViewMemory0().setInt32(a + 4, o, true),
				getDataViewMemory0().setInt32(a + 0, f, true);
		},
		__wbg_brands_b7dcf262485c3e7c: function (a) {
			const c = getObject(a).brands;
			return addHeapObject(c);
		},
		__wbg_bufferData_730b629ba3f6824f: function (a, c, r, f) {
			getObject(a).bufferData(c >>> 0, r, f >>> 0);
		},
		__wbg_bufferData_d20232e3d5dcdc62: function (a, c, r, f) {
			getObject(a).bufferData(c >>> 0, getObject(r), f >>> 0);
		},
		__wbg_bufferData_d3bd8c69ff4b7254: function (a, c, r, f) {
			getObject(a).bufferData(c >>> 0, getObject(r), f >>> 0);
		},
		__wbg_bufferData_fb2d946faa09a60b: function (a, c, r, f) {
			getObject(a).bufferData(c >>> 0, r, f >>> 0);
		},
		__wbg_bufferSubData_3fcefd4648de39b5: function (a, c, r, f) {
			getObject(a).bufferSubData(c >>> 0, r, getObject(f));
		},
		__wbg_bufferSubData_7b112eb88657e7c0: function (a, c, r, f) {
			getObject(a).bufferSubData(c >>> 0, r, getObject(f));
		},
		__wbg_buffer_60b8043cd926067d: function (a) {
			const c = getObject(a).buffer;
			return addHeapObject(c);
		},
		__wbg_button_bdc91677bd7bbf58: function (a) {
			return getObject(a).button;
		},
		__wbg_buttons_a18e71d5dcec8ba9: function (a) {
			return getObject(a).buttons;
		},
		__wbg_buttons_ed0c8b1fa9af7a25: function (a) {
			const c = getObject(a).buttons;
			return addHeapObject(c);
		},
		__wbg_cancelAnimationFrame_43fad84647f46036: function () {
			return handleError(function (a, c) {
				getObject(a).cancelAnimationFrame(c);
			}, arguments);
		},
		__wbg_cancelIdleCallback_d3eb47e732dd4bcd: function (a, c) {
			getObject(a).cancelIdleCallback(c >>> 0);
		},
		__wbg_cancel_65f38182e2eeac5c: function (a) {
			getObject(a).cancel();
		},
		__wbg_catch_d7ed0375ab6532a5: function (a, c) {
			const r = getObject(a).catch(getObject(c));
			return addHeapObject(r);
		},
		__wbg_clearBuffer_0439daeb4579be77: function (a, c, r) {
			getObject(a).clearBuffer(getObject(c), r);
		},
		__wbg_clearBuffer_3de757fe2da3e161: function (a, c, r, f) {
			getObject(a).clearBuffer(getObject(c), r, f);
		},
		__wbg_clearBufferfv_7bc3e789059fd29b: function (a, c, r, f, o) {
			getObject(a).clearBufferfv(c >>> 0, r, getArrayF32FromWasm0(f, o));
		},
		__wbg_clearBufferiv_050b376a7480ef9c: function (a, c, r, f, o) {
			getObject(a).clearBufferiv(c >>> 0, r, getArrayI32FromWasm0(f, o));
		},
		__wbg_clearBufferuiv_d75635e80261ea93: function (a, c, r, f, o) {
			getObject(a).clearBufferuiv(c >>> 0, r, getArrayU32FromWasm0(f, o));
		},
		__wbg_clearDepth_0fb1b5aba2ff2d63: function (a, c) {
			getObject(a).clearDepth(c);
		},
		__wbg_clearDepth_3ff5ef5e5fad4016: function (a, c) {
			getObject(a).clearDepth(c);
		},
		__wbg_clearStencil_0e5924dc2f0fa2b7: function (a, c) {
			getObject(a).clearStencil(c);
		},
		__wbg_clearStencil_4505636e726114d0: function (a, c) {
			getObject(a).clearStencil(c);
		},
		__wbg_clearTimeout_fdfb5a1468af1a97: function (a, c) {
			getObject(a).clearTimeout(c);
		},
		__wbg_clear_3d6ad4729e206aac: function (a, c) {
			getObject(a).clear(c >>> 0);
		},
		__wbg_clear_5a0606f7c62ad39a: function (a, c) {
			getObject(a).clear(c >>> 0);
		},
		__wbg_clientWaitSync_5402aac488fc18bb: function (a, c, r, f) {
			return getObject(a).clientWaitSync(getObject(c), r >>> 0, f >>> 0);
		},
		__wbg_close_87218c1c5fa30509: function () {
			return handleError(function (a) {
				const c = getObject(a).close();
				return addHeapObject(c);
			}, arguments);
		},
		__wbg_close_ab55423854e61546: function (a) {
			getObject(a).close();
		},
		__wbg_code_3c69123dcbcf263d: function (a, c) {
			const r = getObject(c).code,
				f = passStringToWasm0(
					r,
					wasm.__wbindgen_export,
					wasm.__wbindgen_export2,
				),
				o = WASM_VECTOR_LEN;
			getDataViewMemory0().setInt32(a + 4, o, true),
				getDataViewMemory0().setInt32(a + 0, f, true);
		},
		__wbg_colorMask_b053114f7da42448: function (a, c, r, f, o) {
			getObject(a).colorMask(c !== 0, r !== 0, f !== 0, o !== 0);
		},
		__wbg_colorMask_b47840e05b5f8181: function (a, c, r, f, o) {
			getObject(a).colorMask(c !== 0, r !== 0, f !== 0, o !== 0);
		},
		__wbg_compileShader_623a1051cf49494b: function (a, c) {
			getObject(a).compileShader(getObject(c));
		},
		__wbg_compileShader_7ca66245c2798601: function (a, c) {
			getObject(a).compileShader(getObject(c));
		},
		__wbg_compressedTexSubImage2D_593058a6f5aca176: function (
			a,
			c,
			r,
			f,
			o,
			g,
			w,
			T,
			S,
		) {
			getObject(a).compressedTexSubImage2D(
				c >>> 0,
				r,
				f,
				o,
				g,
				w,
				T >>> 0,
				getObject(S),
			);
		},
		__wbg_compressedTexSubImage2D_aab12b65159c282e: function (
			a,
			c,
			r,
			f,
			o,
			g,
			w,
			T,
			S,
		) {
			getObject(a).compressedTexSubImage2D(
				c >>> 0,
				r,
				f,
				o,
				g,
				w,
				T >>> 0,
				getObject(S),
			);
		},
		__wbg_compressedTexSubImage2D_f3c4ae95ef9d2420: function (
			a,
			c,
			r,
			f,
			o,
			g,
			w,
			T,
			S,
			p,
		) {
			getObject(a).compressedTexSubImage2D(
				c >>> 0,
				r,
				f,
				o,
				g,
				w,
				T >>> 0,
				S,
				p,
			);
		},
		__wbg_compressedTexSubImage3D_77a6ab77487aa211: function (
			a,
			c,
			r,
			f,
			o,
			g,
			w,
			T,
			S,
			p,
			N,
			C,
		) {
			getObject(a).compressedTexSubImage3D(
				c >>> 0,
				r,
				f,
				o,
				g,
				w,
				T,
				S,
				p >>> 0,
				N,
				C,
			);
		},
		__wbg_compressedTexSubImage3D_95f64742aae944b8: function (
			a,
			c,
			r,
			f,
			o,
			g,
			w,
			T,
			S,
			p,
			N,
		) {
			getObject(a).compressedTexSubImage3D(
				c >>> 0,
				r,
				f,
				o,
				g,
				w,
				T,
				S,
				p >>> 0,
				getObject(N),
			);
		},
		__wbg_configure_b39d6ec9527208fd: function () {
			return handleError(function (a, c) {
				getObject(a).configure(getObject(c));
			}, arguments);
		},
		__wbg_connect_3ca85e8e3b8d9828: function () {
			return handleError(function (a, c) {
				const r = getObject(a).connect(getObject(c));
				return addHeapObject(r);
			}, arguments);
		},
		__wbg_connected_8628961b3a47d6ce: function (a) {
			return getObject(a).connected;
		},
		__wbg_contains_6b23671a193f58e5: function (a, c) {
			return getObject(a).contains(getObject(c));
		},
		__wbg_contentRect_7047bba46353f683: function (a) {
			const c = getObject(a).contentRect;
			return addHeapObject(c);
		},
		__wbg_copyBufferSubData_aaeed526e555f0d1: function (a, c, r, f, o, g) {
			getObject(a).copyBufferSubData(c >>> 0, r >>> 0, f, o, g);
		},
		__wbg_copyBufferToBuffer_293ca0a0d09a2280: function () {
			return handleError(function (a, c, r, f, o) {
				getObject(a).copyBufferToBuffer(
					getObject(c),
					r,
					getObject(f),
					o,
				);
			}, arguments);
		},
		__wbg_copyBufferToBuffer_321eb0198eb9c268: function () {
			return handleError(function (a, c, r, f, o, g) {
				getObject(a).copyBufferToBuffer(
					getObject(c),
					r,
					getObject(f),
					o,
					g,
				);
			}, arguments);
		},
		__wbg_copyTexSubImage2D_08a10bcd45b88038: function (
			a,
			c,
			r,
			f,
			o,
			g,
			w,
			T,
			S,
		) {
			getObject(a).copyTexSubImage2D(c >>> 0, r, f, o, g, w, T, S);
		},
		__wbg_copyTexSubImage2D_b9a10d000c616b3e: function (
			a,
			c,
			r,
			f,
			o,
			g,
			w,
			T,
			S,
		) {
			getObject(a).copyTexSubImage2D(c >>> 0, r, f, o, g, w, T, S);
		},
		__wbg_copyTexSubImage3D_7fcdf7c85bc308a5: function (
			a,
			c,
			r,
			f,
			o,
			g,
			w,
			T,
			S,
			p,
		) {
			getObject(a).copyTexSubImage3D(c >>> 0, r, f, o, g, w, T, S, p);
		},
		__wbg_copyTextureToBuffer_f5501895b13306e1: function () {
			return handleError(function (a, c, r, f) {
				getObject(a).copyTextureToBuffer(
					getObject(c),
					getObject(r),
					getObject(f),
				);
			}, arguments);
		},
		__wbg_copyTextureToTexture_facf8ecdb9559cb0: function () {
			return handleError(function (a, c, r, f) {
				getObject(a).copyTextureToTexture(
					getObject(c),
					getObject(r),
					getObject(f),
				);
			}, arguments);
		},
		__wbg_copyToChannel_0fa00b3f5955d456: function () {
			return handleError(function (a, c, r, f) {
				getObject(a).copyToChannel(getArrayF32FromWasm0(c, r), f);
			}, arguments);
		},
		__wbg_createBindGroupLayout_f5bb5a31b2ac11bf: function () {
			return handleError(function (a, c) {
				const r = getObject(a).createBindGroupLayout(getObject(c));
				return addHeapObject(r);
			}, arguments);
		},
		__wbg_createBindGroup_2290306cfa413c74: function (a, c) {
			const r = getObject(a).createBindGroup(getObject(c));
			return addHeapObject(r);
		},
		__wbg_createBufferSource_7102af74fcd1a840: function () {
			return handleError(function (a) {
				const c = getObject(a).createBufferSource();
				return addHeapObject(c);
			}, arguments);
		},
		__wbg_createBuffer_1aa34315dc9585a2: function (a) {
			const c = getObject(a).createBuffer();
			return isLikeNone(c) ? 0 : addHeapObject(c);
		},
		__wbg_createBuffer_8e47b88217a98607: function (a) {
			const c = getObject(a).createBuffer();
			return isLikeNone(c) ? 0 : addHeapObject(c);
		},
		__wbg_createBuffer_e2b25dd1471f92f7: function () {
			return handleError(function (a, c) {
				const r = getObject(a).createBuffer(getObject(c));
				return addHeapObject(r);
			}, arguments);
		},
		__wbg_createBuffer_ed2bd7b52878b3fa: function () {
			return handleError(function (a, c, r, f) {
				const o = getObject(a).createBuffer(c >>> 0, r >>> 0, f);
				return addHeapObject(o);
			}, arguments);
		},
		__wbg_createCommandEncoder_80578730e7314357: function (a, c) {
			const r = getObject(a).createCommandEncoder(getObject(c));
			return addHeapObject(r);
		},
		__wbg_createComputePipeline_78a3fff4e7d451a8: function (a, c) {
			const r = getObject(a).createComputePipeline(getObject(c));
			return addHeapObject(r);
		},
		__wbg_createElement_9b0aab265c549ded: function () {
			return handleError(function (a, c, r) {
				const f = getObject(a).createElement(getStringFromWasm0(c, r));
				return addHeapObject(f);
			}, arguments);
		},
		__wbg_createFramebuffer_911d55689ff8358e: function (a) {
			const c = getObject(a).createFramebuffer();
			return isLikeNone(c) ? 0 : addHeapObject(c);
		},
		__wbg_createFramebuffer_97d39363cdd9242a: function (a) {
			const c = getObject(a).createFramebuffer();
			return isLikeNone(c) ? 0 : addHeapObject(c);
		},
		__wbg_createImageBitmap_46791779dcbfb789: function () {
			return handleError(function (a, c, r) {
				const f = getObject(a).createImageBitmap(
					getObject(c),
					getObject(r),
				);
				return addHeapObject(f);
			}, arguments);
		},
		__wbg_createObjectURL_f141426bcc1f70aa: function () {
			return handleError(function (a, c) {
				const r = URL.createObjectURL(getObject(c)),
					f = passStringToWasm0(
						r,
						wasm.__wbindgen_export,
						wasm.__wbindgen_export2,
					),
					o = WASM_VECTOR_LEN;
				getDataViewMemory0().setInt32(a + 4, o, true),
					getDataViewMemory0().setInt32(a + 0, f, true);
			}, arguments);
		},
		__wbg_createPipelineLayout_0ef251301bed0c34: function (a, c) {
			const r = getObject(a).createPipelineLayout(getObject(c));
			return addHeapObject(r);
		},
		__wbg_createProgram_1fa32901e4db13cd: function (a) {
			const c = getObject(a).createProgram();
			return isLikeNone(c) ? 0 : addHeapObject(c);
		},
		__wbg_createProgram_8eb14525e7fcffb8: function (a) {
			const c = getObject(a).createProgram();
			return isLikeNone(c) ? 0 : addHeapObject(c);
		},
		__wbg_createQuerySet_9ae406d6d86026f6: function () {
			return handleError(function (a, c) {
				const r = getObject(a).createQuerySet(getObject(c));
				return addHeapObject(r);
			}, arguments);
		},
		__wbg_createQuery_0f754c13ae341f39: function (a) {
			const c = getObject(a).createQuery();
			return isLikeNone(c) ? 0 : addHeapObject(c);
		},
		__wbg_createRenderPipeline_f9f8aa23f50f8a9c: function () {
			return handleError(function (a, c) {
				const r = getObject(a).createRenderPipeline(getObject(c));
				return addHeapObject(r);
			}, arguments);
		},
		__wbg_createRenderbuffer_69fb8c438e70e494: function (a) {
			const c = getObject(a).createRenderbuffer();
			return isLikeNone(c) ? 0 : addHeapObject(c);
		},
		__wbg_createRenderbuffer_8847d6a81975caee: function (a) {
			const c = getObject(a).createRenderbuffer();
			return isLikeNone(c) ? 0 : addHeapObject(c);
		},
		__wbg_createSampler_27c37a8245da51a4: function (a, c) {
			const r = getObject(a).createSampler(getObject(c));
			return addHeapObject(r);
		},
		__wbg_createSampler_7bed7d46769be9a7: function (a) {
			const c = getObject(a).createSampler();
			return isLikeNone(c) ? 0 : addHeapObject(c);
		},
		__wbg_createShaderModule_eb21a131dfb0d4dc: function (a, c) {
			const r = getObject(a).createShaderModule(getObject(c));
			return addHeapObject(r);
		},
		__wbg_createShader_9ffc9dc1832608d7: function (a, c) {
			const r = getObject(a).createShader(c >>> 0);
			return isLikeNone(r) ? 0 : addHeapObject(r);
		},
		__wbg_createShader_a00913b8c6489e6b: function (a, c) {
			const r = getObject(a).createShader(c >>> 0);
			return isLikeNone(r) ? 0 : addHeapObject(r);
		},
		__wbg_createTexture_284160f981e0075f: function () {
			return handleError(function (a, c) {
				const r = getObject(a).createTexture(getObject(c));
				return addHeapObject(r);
			}, arguments);
		},
		__wbg_createTexture_9b1b4f40cab0097b: function (a) {
			const c = getObject(a).createTexture();
			return isLikeNone(c) ? 0 : addHeapObject(c);
		},
		__wbg_createTexture_ceb367c3528574ec: function (a) {
			const c = getObject(a).createTexture();
			return isLikeNone(c) ? 0 : addHeapObject(c);
		},
		__wbg_createVertexArrayOES_1b30eca82fb89274: function (a) {
			const c = getObject(a).createVertexArrayOES();
			return isLikeNone(c) ? 0 : addHeapObject(c);
		},
		__wbg_createVertexArray_420460898dc8d838: function (a) {
			const c = getObject(a).createVertexArray();
			return isLikeNone(c) ? 0 : addHeapObject(c);
		},
		__wbg_createView_b09749798973b0f5: function () {
			return handleError(function (a, c) {
				const r = getObject(a).createView(getObject(c));
				return addHeapObject(r);
			}, arguments);
		},
		__wbg_ctrlKey_6f8a95d15c098679: function (a) {
			return getObject(a).ctrlKey;
		},
		__wbg_ctrlKey_a41da599a72ee93d: function (a) {
			return getObject(a).ctrlKey;
		},
		__wbg_cullFace_2c9f57c2f90cbe70: function (a, c) {
			getObject(a).cullFace(c >>> 0);
		},
		__wbg_cullFace_d759515c1199276c: function (a, c) {
			getObject(a).cullFace(c >>> 0);
		},
		__wbg_currentTime_5f6bbe3d7b1a6fbf: function (a) {
			return getObject(a).currentTime;
		},
		__wbg_debug_271c16e6de0bc226: function (a, c, r, f) {
			console.debug(
				getObject(a),
				getObject(c),
				getObject(r),
				getObject(f),
			);
		},
		__wbg_decode_b645e759f92c7fe0: function (a) {
			const c = getObject(a).decode();
			return addHeapObject(c);
		},
		__wbg_deleteBuffer_a2f8244b249c356e: function (a, c) {
			getObject(a).deleteBuffer(getObject(c));
		},
		__wbg_deleteBuffer_b053c58b4ed1ab1c: function (a, c) {
			getObject(a).deleteBuffer(getObject(c));
		},
		__wbg_deleteFramebuffer_1af8b97d40962089: function (a, c) {
			getObject(a).deleteFramebuffer(getObject(c));
		},
		__wbg_deleteFramebuffer_badadfcd45ef5e64: function (a, c) {
			getObject(a).deleteFramebuffer(getObject(c));
		},
		__wbg_deleteProgram_cb8f79d5c1e84863: function (a, c) {
			getObject(a).deleteProgram(getObject(c));
		},
		__wbg_deleteProgram_fc1d8d77ef7e154d: function (a, c) {
			getObject(a).deleteProgram(getObject(c));
		},
		__wbg_deleteQuery_9420681ec3d643ef: function (a, c) {
			getObject(a).deleteQuery(getObject(c));
		},
		__wbg_deleteRenderbuffer_401ffe15b179c343: function (a, c) {
			getObject(a).deleteRenderbuffer(getObject(c));
		},
		__wbg_deleteRenderbuffer_b030660bf2e9fc95: function (a, c) {
			getObject(a).deleteRenderbuffer(getObject(c));
		},
		__wbg_deleteSampler_8111fd44b061bdd1: function (a, c) {
			getObject(a).deleteSampler(getObject(c));
		},
		__wbg_deleteShader_5b6992b5e5894d44: function (a, c) {
			getObject(a).deleteShader(getObject(c));
		},
		__wbg_deleteShader_a8e5ccb432053dbe: function (a, c) {
			getObject(a).deleteShader(getObject(c));
		},
		__wbg_deleteSync_deeb154f55e59a7d: function (a, c) {
			getObject(a).deleteSync(getObject(c));
		},
		__wbg_deleteTexture_00ecab74f7bddf91: function (a, c) {
			getObject(a).deleteTexture(getObject(c));
		},
		__wbg_deleteTexture_d8b1d278731e0c9f: function (a, c) {
			getObject(a).deleteTexture(getObject(c));
		},
		__wbg_deleteVertexArrayOES_9da21e3515bf556e: function (a, c) {
			getObject(a).deleteVertexArrayOES(getObject(c));
		},
		__wbg_deleteVertexArray_5a75f4855c2881df: function (a, c) {
			getObject(a).deleteVertexArray(getObject(c));
		},
		__wbg_deltaMode_e239727f16c7ad68: function (a) {
			return getObject(a).deltaMode;
		},
		__wbg_deltaX_74ad854454fab779: function (a) {
			return getObject(a).deltaX;
		},
		__wbg_deltaY_c6ccae416e166d01: function (a) {
			return getObject(a).deltaY;
		},
		__wbg_depthFunc_0376ef69458b01d8: function (a, c) {
			getObject(a).depthFunc(c >>> 0);
		},
		__wbg_depthFunc_befeae10cb29920d: function (a, c) {
			getObject(a).depthFunc(c >>> 0);
		},
		__wbg_depthMask_c6c1b0d88ade6c84: function (a, c) {
			getObject(a).depthMask(c !== 0);
		},
		__wbg_depthMask_fd5bc408415b9cd3: function (a, c) {
			getObject(a).depthMask(c !== 0);
		},
		__wbg_depthRange_b42d493a2b9258aa: function (a, c, r) {
			getObject(a).depthRange(c, r);
		},
		__wbg_depthRange_ebba8110d3fe0332: function (a, c, r) {
			getObject(a).depthRange(c, r);
		},
		__wbg_destination_d1f70fe081ff0932: function (a) {
			const c = getObject(a).destination;
			return addHeapObject(c);
		},
		__wbg_destroy_ebf527bbd86ae58b: function (a) {
			getObject(a).destroy();
		},
		__wbg_devicePixelContentBoxSize_82a5f309b4b96a31: function (a) {
			const c = getObject(a).devicePixelContentBoxSize;
			return addHeapObject(c);
		},
		__wbg_devicePixelRatio_c36a5fab28da634e: function (a) {
			return getObject(a).devicePixelRatio;
		},
		__wbg_disableVertexAttribArray_124a165b099b763b: function (a, c) {
			getObject(a).disableVertexAttribArray(c >>> 0);
		},
		__wbg_disableVertexAttribArray_c4f42277355986c0: function (a, c) {
			getObject(a).disableVertexAttribArray(c >>> 0);
		},
		__wbg_disable_62ec2189c50a0db7: function (a, c) {
			getObject(a).disable(c >>> 0);
		},
		__wbg_disable_7731e2f3362ef1c5: function (a, c) {
			getObject(a).disable(c >>> 0);
		},
		__wbg_disconnect_09ddbc78942a2057: function (a) {
			getObject(a).disconnect();
		},
		__wbg_disconnect_21257e7fa524a113: function (a) {
			getObject(a).disconnect();
		},
		__wbg_dispatchWorkgroupsIndirect_31170e3ef9951e18: function (a, c, r) {
			getObject(a).dispatchWorkgroupsIndirect(getObject(c), r);
		},
		__wbg_dispatchWorkgroups_88dfc3f2209b9d74: function (a, c, r, f) {
			getObject(a).dispatchWorkgroups(c >>> 0, r >>> 0, f >>> 0);
		},
		__wbg_document_c0320cd4183c6d9b: function (a) {
			const c = getObject(a).document;
			return isLikeNone(c) ? 0 : addHeapObject(c);
		},
		__wbg_drawArraysInstancedANGLE_20ee4b8f67503b54: function (
			a,
			c,
			r,
			f,
			o,
		) {
			getObject(a).drawArraysInstancedANGLE(c >>> 0, r, f, o);
		},
		__wbg_drawArraysInstanced_13e40fca13079ade: function (a, c, r, f, o) {
			getObject(a).drawArraysInstanced(c >>> 0, r, f, o);
		},
		__wbg_drawArrays_13005ccff75e4210: function (a, c, r, f) {
			getObject(a).drawArrays(c >>> 0, r, f);
		},
		__wbg_drawArrays_c20dedf441392005: function (a, c, r, f) {
			getObject(a).drawArrays(c >>> 0, r, f);
		},
		__wbg_drawBuffersWEBGL_5f9efe378355889a: function (a, c) {
			getObject(a).drawBuffersWEBGL(getObject(c));
		},
		__wbg_drawBuffers_823c4881ba82dc9c: function (a, c) {
			getObject(a).drawBuffers(getObject(c));
		},
		__wbg_drawElementsInstancedANGLE_e9170c6414853487: function (
			a,
			c,
			r,
			f,
			o,
			g,
		) {
			getObject(a).drawElementsInstancedANGLE(c >>> 0, r, f >>> 0, o, g);
		},
		__wbg_drawElementsInstanced_2e549060a77ba831: function (
			a,
			c,
			r,
			f,
			o,
			g,
		) {
			getObject(a).drawElementsInstanced(c >>> 0, r, f >>> 0, o, g);
		},
		__wbg_drawIndexedIndirect_1be586f18fe50ecf: function (a, c, r) {
			getObject(a).drawIndexedIndirect(getObject(c), r);
		},
		__wbg_drawIndexed_a60a41b2b0ffdadf: function (a, c, r, f, o, g) {
			getObject(a).drawIndexed(c >>> 0, r >>> 0, f >>> 0, o, g >>> 0);
		},
		__wbg_drawIndirect_74b596a2ff39cd46: function (a, c, r) {
			getObject(a).drawIndirect(getObject(c), r);
		},
		__wbg_draw_bcc050d6677121b5: function (a, c, r, f, o) {
			getObject(a).draw(c >>> 0, r >>> 0, f >>> 0, o >>> 0);
		},
		__wbg_enableVertexAttribArray_60dadea3a00e104a: function (a, c) {
			getObject(a).enableVertexAttribArray(c >>> 0);
		},
		__wbg_enableVertexAttribArray_626e8d2d9d1fdff9: function (a, c) {
			getObject(a).enableVertexAttribArray(c >>> 0);
		},
		__wbg_enable_3728894fa8c1d348: function (a, c) {
			getObject(a).enable(c >>> 0);
		},
		__wbg_enable_91dff7f43064bb54: function (a, c) {
			getObject(a).enable(c >>> 0);
		},
		__wbg_endQuery_48241eaef2e96940: function (a, c) {
			getObject(a).endQuery(c >>> 0);
		},
		__wbg_end_05c67c1822b40952: function (a) {
			getObject(a).end();
		},
		__wbg_end_c269ebd826210ed1: function (a) {
			getObject(a).end();
		},
		__wbg_error_1eece6b0039034ce: function (a, c, r, f) {
			console.error(
				getObject(a),
				getObject(c),
				getObject(r),
				getObject(f),
			);
		},
		__wbg_error_a6fa202b58aa1cd3: function (a, c) {
			let r, f;
			try {
				(r = a), (f = c), console.error(getStringFromWasm0(a, c));
			} finally {
				wasm.__wbindgen_export4(r, f, 1);
			}
		},
		__wbg_error_cfce0f619500de52: function (a, c) {
			console.error(getObject(a), getObject(c));
		},
		__wbg_eval_c311194bb27c7836: function () {
			return handleError(function (arg0, arg1) {
				const ret = eval(getStringFromWasm0(arg0, arg1));
				return addHeapObject(ret);
			}, arguments);
		},
		__wbg_exec_203e2096c69172ee: function (a, c, r) {
			const f = getObject(a).exec(getStringFromWasm0(c, r));
			return isLikeNone(f) ? 0 : addHeapObject(f);
		},
		__wbg_exitFullscreen_446223b7026ea4a9: function (a) {
			getObject(a).exitFullscreen();
		},
		__wbg_exitPointerLock_3c4e763915172704: function (a) {
			getObject(a).exitPointerLock();
		},
		__wbg_features_a239101d9dc0c094: function (a) {
			const c = getObject(a).features;
			return addHeapObject(c);
		},
		__wbg_features_cb4af4c41720c5e5: function (a) {
			const c = getObject(a).features;
			return addHeapObject(c);
		},
		__wbg_fenceSync_460953d9ad5fd31a: function (a, c, r) {
			const f = getObject(a).fenceSync(c >>> 0, r >>> 0);
			return isLikeNone(f) ? 0 : addHeapObject(f);
		},
		__wbg_fetch_7b84bc2cce4c9b65: function (a, c, r) {
			const f = getObject(a).fetch(getStringFromWasm0(c, r));
			return addHeapObject(f);
		},
		__wbg_fetch_e261f234f8b50660: function (a, c, r) {
			const f = getObject(a).fetch(getStringFromWasm0(c, r));
			return addHeapObject(f);
		},
		__wbg_finish_073e2bc456a4b625: function (a) {
			const c = getObject(a).finish();
			return addHeapObject(c);
		},
		__wbg_finish_e43b1b48427f2db0: function (a, c) {
			const r = getObject(a).finish(getObject(c));
			return addHeapObject(r);
		},
		__wbg_flush_049a445c404024c2: function (a) {
			getObject(a).flush();
		},
		__wbg_flush_c7dd5b1ae1447448: function (a) {
			getObject(a).flush();
		},
		__wbg_focus_885197ce680db9e0: function () {
			return handleError(function (a) {
				getObject(a).focus();
			}, arguments);
		},
		__wbg_framebufferRenderbuffer_7a2be23309166ad3: function (
			a,
			c,
			r,
			f,
			o,
		) {
			getObject(a).framebufferRenderbuffer(
				c >>> 0,
				r >>> 0,
				f >>> 0,
				getObject(o),
			);
		},
		__wbg_framebufferRenderbuffer_d8c1d0b985bd3c51: function (
			a,
			c,
			r,
			f,
			o,
		) {
			getObject(a).framebufferRenderbuffer(
				c >>> 0,
				r >>> 0,
				f >>> 0,
				getObject(o),
			);
		},
		__wbg_framebufferTexture2D_bf4d47f4027a3682: function (
			a,
			c,
			r,
			f,
			o,
			g,
		) {
			getObject(a).framebufferTexture2D(
				c >>> 0,
				r >>> 0,
				f >>> 0,
				getObject(o),
				g,
			);
		},
		__wbg_framebufferTexture2D_e2f7d82e6707010e: function (
			a,
			c,
			r,
			f,
			o,
			g,
		) {
			getObject(a).framebufferTexture2D(
				c >>> 0,
				r >>> 0,
				f >>> 0,
				getObject(o),
				g,
			);
		},
		__wbg_framebufferTextureLayer_01d5b9516636ccae: function (
			a,
			c,
			r,
			f,
			o,
			g,
		) {
			getObject(a).framebufferTextureLayer(
				c >>> 0,
				r >>> 0,
				getObject(f),
				o,
				g,
			);
		},
		__wbg_framebufferTextureMultiviewOVR_336ea10e261ec5f6: function (
			a,
			c,
			r,
			f,
			o,
			g,
			w,
		) {
			getObject(a).framebufferTextureMultiviewOVR(
				c >>> 0,
				r >>> 0,
				getObject(f),
				o,
				g,
				w,
			);
		},
		__wbg_frontFace_1537b8c3fc174f05: function (a, c) {
			getObject(a).frontFace(c >>> 0);
		},
		__wbg_frontFace_57081a0312eb822e: function (a, c) {
			getObject(a).frontFace(c >>> 0);
		},
		__wbg_fullscreenElement_8068aa5be9c86543: function (a) {
			const c = getObject(a).fullscreenElement;
			return isLikeNone(c) ? 0 : addHeapObject(c);
		},
		__wbg_getBoundingClientRect_b236f2e393fd0e7a: function (a) {
			const c = getObject(a).getBoundingClientRect();
			return addHeapObject(c);
		},
		__wbg_getBufferSubData_cbabbb87d4c5c57d: function (a, c, r, f) {
			getObject(a).getBufferSubData(c >>> 0, r, getObject(f));
		},
		__wbg_getCoalescedEvents_08e25b227866a984: function (a) {
			const c = getObject(a).getCoalescedEvents();
			return addHeapObject(c);
		},
		__wbg_getCoalescedEvents_3e003f63d9ebbc05: function (a) {
			const c = getObject(a).getCoalescedEvents;
			return addHeapObject(c);
		},
		__wbg_getComputedStyle_b12e52450a4be72c: function () {
			return handleError(function (a, c) {
				const r = getObject(a).getComputedStyle(getObject(c));
				return isLikeNone(r) ? 0 : addHeapObject(r);
			}, arguments);
		},
		__wbg_getContext_07270456453ee7f5: function () {
			return handleError(function (a, c, r, f) {
				const o = getObject(a).getContext(
					getStringFromWasm0(c, r),
					getObject(f),
				);
				return isLikeNone(o) ? 0 : addHeapObject(o);
			}, arguments);
		},
		__wbg_getContext_794490fe04be926a: function () {
			return handleError(function (a, c, r, f) {
				const o = getObject(a).getContext(
					getStringFromWasm0(c, r),
					getObject(f),
				);
				return isLikeNone(o) ? 0 : addHeapObject(o);
			}, arguments);
		},
		__wbg_getContext_a9236f98f1f7fe7c: function () {
			return handleError(function (a, c, r) {
				const f = getObject(a).getContext(getStringFromWasm0(c, r));
				return isLikeNone(f) ? 0 : addHeapObject(f);
			}, arguments);
		},
		__wbg_getContext_f04bf8f22dcb2d53: function () {
			return handleError(function (a, c, r) {
				const f = getObject(a).getContext(getStringFromWasm0(c, r));
				return isLikeNone(f) ? 0 : addHeapObject(f);
			}, arguments);
		},
		__wbg_getCurrentTexture_7edbea16b438c9fc: function () {
			return handleError(function (a) {
				const c = getObject(a).getCurrentTexture();
				return addHeapObject(c);
			}, arguments);
		},
		__wbg_getExtension_0b8543b0c6b3068d: function () {
			return handleError(function (a, c, r) {
				const f = getObject(a).getExtension(getStringFromWasm0(c, r));
				return isLikeNone(f) ? 0 : addHeapObject(f);
			}, arguments);
		},
		__wbg_getGamepads_b179bcbe36d157bd: function () {
			return handleError(function (a) {
				const c = getObject(a).getGamepads();
				return addHeapObject(c);
			}, arguments);
		},
		__wbg_getIndexedParameter_338c7c91cbabcf3e: function () {
			return handleError(function (a, c, r) {
				const f = getObject(a).getIndexedParameter(c >>> 0, r >>> 0);
				return addHeapObject(f);
			}, arguments);
		},
		__wbg_getMappedRange_191c0084744858f0: function () {
			return handleError(function (a, c, r) {
				const f = getObject(a).getMappedRange(c, r);
				return addHeapObject(f);
			}, arguments);
		},
		__wbg_getOwnPropertyDescriptor_afeb931addada534: function (a, c) {
			const r = Object.getOwnPropertyDescriptor(
				getObject(a),
				getObject(c),
			);
			return addHeapObject(r);
		},
		__wbg_getParameter_b1431cfde390c2fc: function () {
			return handleError(function (a, c) {
				const r = getObject(a).getParameter(c >>> 0);
				return addHeapObject(r);
			}, arguments);
		},
		__wbg_getParameter_e634fa73b5e25287: function () {
			return handleError(function (a, c) {
				const r = getObject(a).getParameter(c >>> 0);
				return addHeapObject(r);
			}, arguments);
		},
		__wbg_getPreferredCanvasFormat_56e30944cc798353: function (a) {
			const c = getObject(a).getPreferredCanvasFormat();
			return (__wbindgen_enum_GpuTextureFormat.indexOf(c) + 1 || 96) - 1;
		},
		__wbg_getProgramInfoLog_50443ddea7475f57: function (a, c, r) {
			const f = getObject(c).getProgramInfoLog(getObject(r));
			var o = isLikeNone(f)
					? 0
					: passStringToWasm0(
							f,
							wasm.__wbindgen_export,
							wasm.__wbindgen_export2,
						),
				g = WASM_VECTOR_LEN;
			getDataViewMemory0().setInt32(a + 4, g, true),
				getDataViewMemory0().setInt32(a + 0, o, true);
		},
		__wbg_getProgramInfoLog_e03efa51473d657e: function (a, c, r) {
			const f = getObject(c).getProgramInfoLog(getObject(r));
			var o = isLikeNone(f)
					? 0
					: passStringToWasm0(
							f,
							wasm.__wbindgen_export,
							wasm.__wbindgen_export2,
						),
				g = WASM_VECTOR_LEN;
			getDataViewMemory0().setInt32(a + 4, g, true),
				getDataViewMemory0().setInt32(a + 0, o, true);
		},
		__wbg_getProgramParameter_46e2d49878b56edd: function (a, c, r) {
			const f = getObject(a).getProgramParameter(getObject(c), r >>> 0);
			return addHeapObject(f);
		},
		__wbg_getProgramParameter_7d3bd54ec02de007: function (a, c, r) {
			const f = getObject(a).getProgramParameter(getObject(c), r >>> 0);
			return addHeapObject(f);
		},
		__wbg_getPropertyValue_d2181532557839cf: function () {
			return handleError(function (a, c, r, f) {
				const o = getObject(c).getPropertyValue(
						getStringFromWasm0(r, f),
					),
					g = passStringToWasm0(
						o,
						wasm.__wbindgen_export,
						wasm.__wbindgen_export2,
					),
					w = WASM_VECTOR_LEN;
				getDataViewMemory0().setInt32(a + 4, w, true),
					getDataViewMemory0().setInt32(a + 0, g, true);
			}, arguments);
		},
		__wbg_getQueryParameter_5a3a2bd77e5f56bb: function (a, c, r) {
			const f = getObject(a).getQueryParameter(getObject(c), r >>> 0);
			return addHeapObject(f);
		},
		__wbg_getRandomValues_a1cf2e70b003a59d: function () {
			return handleError(function (a, c) {
				globalThis.crypto.getRandomValues(getArrayU8FromWasm0(a, c));
			}, arguments);
		},
		__wbg_getShaderInfoLog_22f9e8c90a52f38d: function (a, c, r) {
			const f = getObject(c).getShaderInfoLog(getObject(r));
			var o = isLikeNone(f)
					? 0
					: passStringToWasm0(
							f,
							wasm.__wbindgen_export,
							wasm.__wbindgen_export2,
						),
				g = WASM_VECTOR_LEN;
			getDataViewMemory0().setInt32(a + 4, g, true),
				getDataViewMemory0().setInt32(a + 0, o, true);
		},
		__wbg_getShaderInfoLog_40c6a4ae67d82dde: function (a, c, r) {
			const f = getObject(c).getShaderInfoLog(getObject(r));
			var o = isLikeNone(f)
					? 0
					: passStringToWasm0(
							f,
							wasm.__wbindgen_export,
							wasm.__wbindgen_export2,
						),
				g = WASM_VECTOR_LEN;
			getDataViewMemory0().setInt32(a + 4, g, true),
				getDataViewMemory0().setInt32(a + 0, o, true);
		},
		__wbg_getShaderParameter_46f64f7ca5d534db: function (a, c, r) {
			const f = getObject(a).getShaderParameter(getObject(c), r >>> 0);
			return addHeapObject(f);
		},
		__wbg_getShaderParameter_82c275299b111f1b: function (a, c, r) {
			const f = getObject(a).getShaderParameter(getObject(c), r >>> 0);
			return addHeapObject(f);
		},
		__wbg_getSupportedExtensions_a799751b74c3a674: function (a) {
			const c = getObject(a).getSupportedExtensions();
			return isLikeNone(c) ? 0 : addHeapObject(c);
		},
		__wbg_getSupportedProfiles_e089393bebafd3b0: function (a) {
			const c = getObject(a).getSupportedProfiles();
			return isLikeNone(c) ? 0 : addHeapObject(c);
		},
		__wbg_getSyncParameter_fbf70c60f5e3b271: function (a, c, r) {
			const f = getObject(a).getSyncParameter(getObject(c), r >>> 0);
			return addHeapObject(f);
		},
		__wbg_getUniformBlockIndex_e483a4d166df9c2a: function (a, c, r, f) {
			return getObject(a).getUniformBlockIndex(
				getObject(c),
				getStringFromWasm0(r, f),
			);
		},
		__wbg_getUniformLocation_5eb08673afa04eee: function (a, c, r, f) {
			const o = getObject(a).getUniformLocation(
				getObject(c),
				getStringFromWasm0(r, f),
			);
			return isLikeNone(o) ? 0 : addHeapObject(o);
		},
		__wbg_getUniformLocation_90cdff44c2fceeb9: function (a, c, r, f) {
			const o = getObject(a).getUniformLocation(
				getObject(c),
				getStringFromWasm0(r, f),
			);
			return isLikeNone(o) ? 0 : addHeapObject(o);
		},
		__wbg_get_a8ee5c45dabc1b3b: function (a, c) {
			const r = getObject(a)[c >>> 0];
			return addHeapObject(r);
		},
		__wbg_get_c7546417fb0bec10: function (a, c) {
			const r = getObject(a)[c >>> 0];
			return isLikeNone(r) ? 0 : addHeapObject(r);
		},
		__wbg_get_unchecked_329cfe50afab7352: function (a, c) {
			const r = getObject(a)[c >>> 0];
			return addHeapObject(r);
		},
		__wbg_gpu_7c0927abcc96dd45: function (a) {
			const c = getObject(a).gpu;
			return addHeapObject(c);
		},
		__wbg_has_926ef2ff40b308cf: function () {
			return handleError(function (a, c) {
				return Reflect.has(getObject(a), getObject(c));
			}, arguments);
		},
		__wbg_has_abf74d2b4f3e578e: function (a, c, r) {
			return getObject(a).has(getStringFromWasm0(c, r));
		},
		__wbg_height_8c06cb597de53887: function (a) {
			return getObject(a).height;
		},
		__wbg_id_26bc2771d7af1b86: function (a, c) {
			const r = getObject(c).id,
				f = passStringToWasm0(
					r,
					wasm.__wbindgen_export,
					wasm.__wbindgen_export2,
				),
				o = WASM_VECTOR_LEN;
			getDataViewMemory0().setInt32(a + 4, o, true),
				getDataViewMemory0().setInt32(a + 0, f, true);
		},
		__wbg_includes_9f81335525be01f9: function (a, c, r) {
			return getObject(a).includes(getObject(c), r);
		},
		__wbg_index_4cc30c8b16093fd3: function (a) {
			return getObject(a).index;
		},
		__wbg_info_0194681687b5ab04: function (a, c, r, f) {
			console.info(
				getObject(a),
				getObject(c),
				getObject(r),
				getObject(f),
			);
		},
		__wbg_inlineSize_bc956acca480b3d7: function (a) {
			return getObject(a).inlineSize;
		},
		__wbg_instanceof_DomException_2bdcf7791a2d7d09: function (a) {
			let c;
			try {
				c = getObject(a) instanceof DOMException;
			} catch {
				c = false;
			}
			return c;
		},
		__wbg_instanceof_GpuAdapter_5e451ad6596e2784: function (a) {
			let c;
			try {
				c = getObject(a) instanceof GPUAdapter;
			} catch {
				c = false;
			}
			return c;
		},
		__wbg_instanceof_GpuCanvasContext_f70ee27f49f4f884: function (a) {
			let c;
			try {
				c = getObject(a) instanceof GPUCanvasContext;
			} catch {
				c = false;
			}
			return c;
		},
		__wbg_instanceof_GpuOutOfMemoryError_d312fd1714771dbd: function (a) {
			let c;
			try {
				c = getObject(a) instanceof GPUOutOfMemoryError;
			} catch {
				c = false;
			}
			return c;
		},
		__wbg_instanceof_GpuValidationError_eb3c494ad7b55611: function (a) {
			let c;
			try {
				c = getObject(a) instanceof GPUValidationError;
			} catch {
				c = false;
			}
			return c;
		},
		__wbg_instanceof_HtmlCanvasElement_26125339f936be50: function (a) {
			let c;
			try {
				c = getObject(a) instanceof HTMLCanvasElement;
			} catch {
				c = false;
			}
			return c;
		},
		__wbg_instanceof_Object_be1962063fcc0c9f: function (a) {
			let c;
			try {
				c = getObject(a) instanceof Object;
			} catch {
				c = false;
			}
			return c;
		},
		__wbg_instanceof_Response_9b4d9fd451e051b1: function (a) {
			let c;
			try {
				c = getObject(a) instanceof Response;
			} catch {
				c = false;
			}
			return c;
		},
		__wbg_instanceof_WebGl2RenderingContext_349f232f715e6bc2: function (a) {
			let c;
			try {
				c = getObject(a) instanceof WebGL2RenderingContext;
			} catch {
				c = false;
			}
			return c;
		},
		__wbg_instanceof_Window_23e677d2c6843922: function (a) {
			let c;
			try {
				c = getObject(a) instanceof Window;
			} catch {
				c = false;
			}
			return c;
		},
		__wbg_invalidateFramebuffer_df9574509a402d4f: function () {
			return handleError(function (a, c, r) {
				getObject(a).invalidateFramebuffer(c >>> 0, getObject(r));
			}, arguments);
		},
		__wbg_isIntersecting_b3e74fb0cf75f7d1: function (a) {
			return getObject(a).isIntersecting;
		},
		__wbg_isSecureContext_b78081a385656549: function (a) {
			return getObject(a).isSecureContext;
		},
		__wbg_is_a166b9958c2438ad: function (a, c) {
			return Object.is(getObject(a), getObject(c));
		},
		__wbg_key_99eb0f0a1000963d: function (a, c) {
			const r = getObject(c).key,
				f = passStringToWasm0(
					r,
					wasm.__wbindgen_export,
					wasm.__wbindgen_export2,
				),
				o = WASM_VECTOR_LEN;
			getDataViewMemory0().setInt32(a + 4, o, true),
				getDataViewMemory0().setInt32(a + 0, f, true);
		},
		__wbg_label_0abc44bf8d3a3e99: function (a, c) {
			const r = getObject(c).label,
				f = passStringToWasm0(
					r,
					wasm.__wbindgen_export,
					wasm.__wbindgen_export2,
				),
				o = WASM_VECTOR_LEN;
			getDataViewMemory0().setInt32(a + 4, o, true),
				getDataViewMemory0().setInt32(a + 0, f, true);
		},
		__wbg_length_b3416cf66a5452c8: function (a) {
			return getObject(a).length;
		},
		__wbg_length_ea16607d7b61445b: function (a) {
			return getObject(a).length;
		},
		__wbg_limits_764638d29dec49d4: function (a) {
			const c = getObject(a).limits;
			return addHeapObject(c);
		},
		__wbg_limits_ea7aa423b3575ea6: function (a) {
			const c = getObject(a).limits;
			return addHeapObject(c);
		},
		__wbg_linkProgram_b969f67969a850b5: function (a, c) {
			getObject(a).linkProgram(getObject(c));
		},
		__wbg_linkProgram_e626a3e7d78e1738: function (a, c) {
			getObject(a).linkProgram(getObject(c));
		},
		__wbg_location_cb6f3af6ad563d81: function (a) {
			return getObject(a).location;
		},
		__wbg_log_0c201ade58bb55e1: function (a, c, r, f, o, g, w, T) {
			let S, p;
			try {
				(S = a),
					(p = c),
					console.log(
						getStringFromWasm0(a, c),
						getStringFromWasm0(r, f),
						getStringFromWasm0(o, g),
						getStringFromWasm0(w, T),
					);
			} finally {
				wasm.__wbindgen_export4(S, p, 1);
			}
		},
		__wbg_log_70972330cfc941dd: function (a, c, r, f) {
			console.log(getObject(a), getObject(c), getObject(r), getObject(f));
		},
		__wbg_log_ce2c4456b290c5e7: function (a, c) {
			let r, f;
			try {
				(r = a), (f = c), console.log(getStringFromWasm0(a, c));
			} finally {
				wasm.__wbindgen_export4(r, f, 1);
			}
		},
		__wbg_mapAsync_1be2f9e8f464f69e: function (a, c, r, f) {
			const o = getObject(a).mapAsync(c >>> 0, r, f);
			return addHeapObject(o);
		},
		__wbg_mapping_c0470f8cd55cefc3: function (a) {
			const c = getObject(a).mapping;
			return (__wbindgen_enum_GamepadMappingType.indexOf(c) + 1 || 3) - 1;
		},
		__wbg_mark_b4d943f3bc2d2404: function (a, c) {
			performance.mark(getStringFromWasm0(a, c));
		},
		__wbg_matchMedia_b27489ec503ba2a5: function () {
			return handleError(function (a, c, r) {
				const f = getObject(a).matchMedia(getStringFromWasm0(c, r));
				return isLikeNone(f) ? 0 : addHeapObject(f);
			}, arguments);
		},
		__wbg_matches_d58caa45a0ef29a3: function (a) {
			return getObject(a).matches;
		},
		__wbg_maxBindGroups_c439abd1498fc924: function (a) {
			return getObject(a).maxBindGroups;
		},
		__wbg_maxBindingsPerBindGroup_186292f383c7b982: function (a) {
			return getObject(a).maxBindingsPerBindGroup;
		},
		__wbg_maxBufferSize_87b76aa2842d0e8e: function (a) {
			return getObject(a).maxBufferSize;
		},
		__wbg_maxChannelCount_8cba596bef7c2947: function (a) {
			return getObject(a).maxChannelCount;
		},
		__wbg_maxColorAttachmentBytesPerSample_2ba81ae1e2742413: function (a) {
			return getObject(a).maxColorAttachmentBytesPerSample;
		},
		__wbg_maxColorAttachments_1ec5191521ef0d22: function (a) {
			return getObject(a).maxColorAttachments;
		},
		__wbg_maxComputeInvocationsPerWorkgroup_ee67a82206d412d2: function (a) {
			return getObject(a).maxComputeInvocationsPerWorkgroup;
		},
		__wbg_maxComputeWorkgroupSizeX_0b2b16b802f85a14: function (a) {
			return getObject(a).maxComputeWorkgroupSizeX;
		},
		__wbg_maxComputeWorkgroupSizeY_00d8aeba9472fdb2: function (a) {
			return getObject(a).maxComputeWorkgroupSizeY;
		},
		__wbg_maxComputeWorkgroupSizeZ_351fd9dab4c07321: function (a) {
			return getObject(a).maxComputeWorkgroupSizeZ;
		},
		__wbg_maxComputeWorkgroupStorageSize_881d2b675868eb68: function (a) {
			return getObject(a).maxComputeWorkgroupStorageSize;
		},
		__wbg_maxComputeWorkgroupsPerDimension_21c223eca6bd6d6b: function (a) {
			return getObject(a).maxComputeWorkgroupsPerDimension;
		},
		__wbg_maxDynamicStorageBuffersPerPipelineLayout_7155d3f7a514a157:
			function (a) {
				return getObject(a).maxDynamicStorageBuffersPerPipelineLayout;
			},
		__wbg_maxDynamicUniformBuffersPerPipelineLayout_76dee9028eaa5322:
			function (a) {
				return getObject(a).maxDynamicUniformBuffersPerPipelineLayout;
			},
		__wbg_maxSampledTexturesPerShaderStage_78d018dcd0b999c8: function (a) {
			return getObject(a).maxSampledTexturesPerShaderStage;
		},
		__wbg_maxSamplersPerShaderStage_0e3ad4d70194a7c2: function (a) {
			return getObject(a).maxSamplersPerShaderStage;
		},
		__wbg_maxStorageBufferBindingSize_30a1e5c0b8fcd992: function (a) {
			return getObject(a).maxStorageBufferBindingSize;
		},
		__wbg_maxStorageBuffersPerShaderStage_d77703e9a0d5960e: function (a) {
			return getObject(a).maxStorageBuffersPerShaderStage;
		},
		__wbg_maxStorageTexturesPerShaderStage_c09e7daf1141067e: function (a) {
			return getObject(a).maxStorageTexturesPerShaderStage;
		},
		__wbg_maxTextureArrayLayers_44d8badedb4e5245: function (a) {
			return getObject(a).maxTextureArrayLayers;
		},
		__wbg_maxTextureDimension1D_6d1ff8e56b9cf824: function (a) {
			return getObject(a).maxTextureDimension1D;
		},
		__wbg_maxTextureDimension2D_5ef5830837d92b7c: function (a) {
			return getObject(a).maxTextureDimension2D;
		},
		__wbg_maxTextureDimension3D_cfdebbf2b20068cd: function (a) {
			return getObject(a).maxTextureDimension3D;
		},
		__wbg_maxUniformBufferBindingSize_63dc0c714d2fcebe: function (a) {
			return getObject(a).maxUniformBufferBindingSize;
		},
		__wbg_maxUniformBuffersPerShaderStage_a52382f8a7dfc816: function (a) {
			return getObject(a).maxUniformBuffersPerShaderStage;
		},
		__wbg_maxVertexAttributes_4c83ac8c1d442e1c: function (a) {
			return getObject(a).maxVertexAttributes;
		},
		__wbg_maxVertexBufferArrayStride_955879053ec672f8: function (a) {
			return getObject(a).maxVertexBufferArrayStride;
		},
		__wbg_maxVertexBuffers_0bb014e62f100c6c: function (a) {
			return getObject(a).maxVertexBuffers;
		},
		__wbg_measure_84362959e621a2c1: function () {
			return handleError(function (a, c, r, f) {
				let o, g, w, T;
				try {
					(o = a),
						(g = c),
						(w = r),
						(T = f),
						performance.measure(
							getStringFromWasm0(a, c),
							getStringFromWasm0(r, f),
						);
				} finally {
					wasm.__wbindgen_export4(o, g, 1),
						wasm.__wbindgen_export4(w, T, 1);
				}
			}, arguments);
		},
		__wbg_media_91e147d0112e864c: function (a, c) {
			const r = getObject(c).media,
				f = passStringToWasm0(
					r,
					wasm.__wbindgen_export,
					wasm.__wbindgen_export2,
				),
				o = WASM_VECTOR_LEN;
			getDataViewMemory0().setInt32(a + 4, o, true),
				getDataViewMemory0().setInt32(a + 0, f, true);
		},
		__wbg_message_206e22ac85ff4937: function (a, c) {
			const r = getObject(c).message,
				f = passStringToWasm0(
					r,
					wasm.__wbindgen_export,
					wasm.__wbindgen_export2,
				),
				o = WASM_VECTOR_LEN;
			getDataViewMemory0().setInt32(a + 4, o, true),
				getDataViewMemory0().setInt32(a + 0, f, true);
		},
		__wbg_message_e959edc81e4b6cb7: function (a, c) {
			const r = getObject(c).message,
				f = passStringToWasm0(
					r,
					wasm.__wbindgen_export,
					wasm.__wbindgen_export2,
				),
				o = WASM_VECTOR_LEN;
			getDataViewMemory0().setInt32(a + 4, o, true),
				getDataViewMemory0().setInt32(a + 0, f, true);
		},
		__wbg_metaKey_04074c2a59c1806c: function (a) {
			return getObject(a).metaKey;
		},
		__wbg_metaKey_09c90f191df1276b: function (a) {
			return getObject(a).metaKey;
		},
		__wbg_minStorageBufferOffsetAlignment_6ed09762e603ac3a: function (a) {
			return getObject(a).minStorageBufferOffsetAlignment;
		},
		__wbg_minUniformBufferOffsetAlignment_02579f79815cf83c: function (a) {
			return getObject(a).minUniformBufferOffsetAlignment;
		},
		__wbg_movementX_36b3256d18bcf681: function (a) {
			return getObject(a).movementX;
		},
		__wbg_movementY_004a98ec08b8f584: function (a) {
			return getObject(a).movementY;
		},
		__wbg_navigator_583ffd4fc14c0f7a: function (a) {
			const c = getObject(a).navigator;
			return addHeapObject(c);
		},
		__wbg_navigator_9cebf56f28aa719b: function (a) {
			const c = getObject(a).navigator;
			return addHeapObject(c);
		},
		__wbg_new_0b637bad3d58f611: function () {
			return handleError(function () {
				const a = new Image();
				return addHeapObject(a);
			}, arguments);
		},
		__wbg_new_227d7c05414eb861: function () {
			const a = new Error();
			return addHeapObject(a);
		},
		__wbg_new_3acd383af1655b5f: function () {
			return handleError(function (a, c) {
				const r = new Worker(getStringFromWasm0(a, c));
				return addHeapObject(r);
			}, arguments);
		},
		__wbg_new_42398a42abc5b110: function () {
			return handleError(function (a) {
				const c = new IntersectionObserver(getObject(a));
				return addHeapObject(c);
			}, arguments);
		},
		__wbg_new_5f486cdf45a04d78: function (a) {
			const c = new Uint8Array(getObject(a));
			return addHeapObject(c);
		},
		__wbg_new_a70fbab9066b301f: function () {
			const a = new Array();
			return addHeapObject(a);
		},
		__wbg_new_aad8cb4adc774d03: function (a, c, r, f) {
			const o = new RegExp(
				getStringFromWasm0(a, c),
				getStringFromWasm0(r, f),
			);
			return addHeapObject(o);
		},
		__wbg_new_ab79df5bd7c26067: function () {
			const a = new Object();
			return addHeapObject(a);
		},
		__wbg_new_c518c60af666645b: function () {
			return handleError(function () {
				const a = new AbortController();
				return addHeapObject(a);
			}, arguments);
		},
		__wbg_new_de704db0001dadc8: function () {
			return handleError(function (a) {
				const c = new ResizeObserver(getObject(a));
				return addHeapObject(c);
			}, arguments);
		},
		__wbg_new_f7708ba82c4c12f6: function () {
			return handleError(function () {
				const a = new MessageChannel();
				return addHeapObject(a);
			}, arguments);
		},
		__wbg_new_from_slice_22da9388ac046e50: function (a, c) {
			const r = new Uint8Array(getArrayU8FromWasm0(a, c));
			return addHeapObject(r);
		},
		__wbg_new_typed_bccac67128ed885a: function () {
			const a = new Array();
			return addHeapObject(a);
		},
		__wbg_new_with_byte_offset_and_length_b2ec5bf7b2f35743: function (
			a,
			c,
			r,
		) {
			const f = new Uint8Array(getObject(a), c >>> 0, r >>> 0);
			return addHeapObject(f);
		},
		__wbg_new_with_context_options_c1249ea1a7ddc84f: function () {
			return handleError(function (a) {
				const c = new lAudioContext(getObject(a));
				return addHeapObject(c);
			}, arguments);
		},
		__wbg_new_with_str_sequence_and_options_a037535f6e1edba0: function () {
			return handleError(function (a, c) {
				const r = new Blob(getObject(a), getObject(c));
				return addHeapObject(r);
			}, arguments);
		},
		__wbg_new_with_u8_clamped_array_f0ba3283326efdd8: function () {
			return handleError(function (a, c, r) {
				const f = new ImageData(
					getClampedArrayU8FromWasm0(a, c),
					r >>> 0,
				);
				return addHeapObject(f);
			}, arguments);
		},
		__wbg_now_16f0c993d5dd6c27: function () {
			return Date.now();
		},
		__wbg_now_e7c6795a7f81e10f: function (a) {
			return getObject(a).now();
		},
		__wbg_observe_571954223f11dad1: function (a, c, r) {
			getObject(a).observe(getObject(c), getObject(r));
		},
		__wbg_observe_a829ffd9907f84b1: function (a, c) {
			getObject(a).observe(getObject(c));
		},
		__wbg_observe_e1a1f270d8431b29: function (a, c) {
			getObject(a).observe(getObject(c));
		},
		__wbg_of_8bf7ed3eca00ea43: function (a) {
			const c = Array.of(getObject(a));
			return addHeapObject(c);
		},
		__wbg_of_d6376e3774c51f89: function (a, c) {
			const r = Array.of(getObject(a), getObject(c));
			return addHeapObject(r);
		},
		__wbg_offsetX_a9bf2ea7f0575ac9: function (a) {
			return getObject(a).offsetX;
		},
		__wbg_offsetY_10e5433a1bbd4c01: function (a) {
			return getObject(a).offsetY;
		},
		__wbg_onSubmittedWorkDone_7d532ba1f20a64b3: function (a) {
			const c = getObject(a).onSubmittedWorkDone();
			return addHeapObject(c);
		},
		__wbg_performance_3fcf6e32a7e1ed0a: function (a) {
			const c = getObject(a).performance;
			return addHeapObject(c);
		},
		__wbg_persisted_8366757621586c61: function (a) {
			return getObject(a).persisted;
		},
		__wbg_pixelStorei_2a2385ed59538d48: function (a, c, r) {
			getObject(a).pixelStorei(c >>> 0, r);
		},
		__wbg_pixelStorei_2a3c5b85cf37caba: function (a, c, r) {
			getObject(a).pixelStorei(c >>> 0, r);
		},
		__wbg_play_3997a1be51d27925: function (a) {
			getObject(a).play();
		},
		__wbg_pointerId_85ff21be7b52f43e: function (a) {
			return getObject(a).pointerId;
		},
		__wbg_pointerType_02525bef1df5f79c: function (a, c) {
			const r = getObject(c).pointerType,
				f = passStringToWasm0(
					r,
					wasm.__wbindgen_export,
					wasm.__wbindgen_export2,
				),
				o = WASM_VECTOR_LEN;
			getDataViewMemory0().setInt32(a + 4, o, true),
				getDataViewMemory0().setInt32(a + 0, f, true);
		},
		__wbg_polygonOffset_17cb85e417bf9db7: function (a, c, r) {
			getObject(a).polygonOffset(c, r);
		},
		__wbg_polygonOffset_cc6bec2f9f4a18f7: function (a, c, r) {
			getObject(a).polygonOffset(c, r);
		},
		__wbg_popErrorScope_560bfe3f43f543e7: function (a) {
			const c = getObject(a).popErrorScope();
			return addHeapObject(c);
		},
		__wbg_port1_869a7ef90538dbdf: function (a) {
			const c = getObject(a).port1;
			return addHeapObject(c);
		},
		__wbg_port2_947a51b8ba00adc9: function (a) {
			const c = getObject(a).port2;
			return addHeapObject(c);
		},
		__wbg_postMessage_5ed5275983f7dad2: function () {
			return handleError(function (a, c, r) {
				getObject(a).postMessage(getObject(c), getObject(r));
			}, arguments);
		},
		__wbg_postMessage_c89a8b5edbf59ad0: function () {
			return handleError(function (a, c) {
				getObject(a).postMessage(getObject(c));
			}, arguments);
		},
		__wbg_postTask_e2439afddcdfbb55: function (a, c, r) {
			const f = getObject(a).postTask(getObject(c), getObject(r));
			return addHeapObject(f);
		},
		__wbg_pressed_04111050e054a5e8: function (a) {
			return getObject(a).pressed;
		},
		__wbg_pressure_8a4698697b9bba06: function (a) {
			return getObject(a).pressure;
		},
		__wbg_preventDefault_25a229bfe5c510f8: function (a) {
			getObject(a).preventDefault();
		},
		__wbg_prototype_0d5bb2023db3bcfc: function () {
			const a = ResizeObserverEntry.prototype;
			return addHeapObject(a);
		},
		__wbg_prototypesetcall_d62e5099504357e6: function (a, c, r) {
			Uint8Array.prototype.set.call(
				getArrayU8FromWasm0(a, c),
				getObject(r),
			);
		},
		__wbg_pushErrorScope_9c7f2c66d0393f31: function (a, c) {
			getObject(a).pushErrorScope(__wbindgen_enum_GpuErrorFilter[c]);
		},
		__wbg_push_e87b0e732085a946: function (a, c) {
			return getObject(a).push(getObject(c));
		},
		__wbg_queryCounterEXT_12ca9f560a5855cb: function (a, c, r) {
			getObject(a).queryCounterEXT(getObject(c), r >>> 0);
		},
		__wbg_querySelectorAll_ccbf0696a1c6fed8: function () {
			return handleError(function (a, c, r) {
				const f = getObject(a).querySelectorAll(
					getStringFromWasm0(c, r),
				);
				return addHeapObject(f);
			}, arguments);
		},
		__wbg_querySelector_46ff1b81410aebea: function () {
			return handleError(function (a, c, r) {
				const f = getObject(a).querySelector(getStringFromWasm0(c, r));
				return isLikeNone(f) ? 0 : addHeapObject(f);
			}, arguments);
		},
		__wbg_queueMicrotask_0c399741342fb10f: function (a) {
			const c = getObject(a).queueMicrotask;
			return addHeapObject(c);
		},
		__wbg_queueMicrotask_9608487e970c906d: function (a, c) {
			getObject(a).queueMicrotask(getObject(c));
		},
		__wbg_queueMicrotask_a082d78ce798393e: function (a) {
			queueMicrotask(getObject(a));
		},
		__wbg_queue_5eda23116e5d3adb: function (a) {
			const c = getObject(a).queue;
			return addHeapObject(c);
		},
		__wbg_readBuffer_e559a3da4aa9e434: function (a, c) {
			getObject(a).readBuffer(c >>> 0);
		},
		__wbg_readPixels_41a371053c299080: function () {
			return handleError(function (a, c, r, f, o, g, w, T) {
				getObject(a).readPixels(
					c,
					r,
					f,
					o,
					g >>> 0,
					w >>> 0,
					getObject(T),
				);
			}, arguments);
		},
		__wbg_readPixels_5c7066b5bd547f81: function () {
			return handleError(function (a, c, r, f, o, g, w, T) {
				getObject(a).readPixels(
					c,
					r,
					f,
					o,
					g >>> 0,
					w >>> 0,
					getObject(T),
				);
			}, arguments);
		},
		__wbg_readPixels_f675ed52bd44f8f1: function () {
			return handleError(function (a, c, r, f, o, g, w, T) {
				getObject(a).readPixels(c, r, f, o, g >>> 0, w >>> 0, T);
			}, arguments);
		},
		__wbg_removeEventListener_d27694700fc0df8b: function () {
			return handleError(function (a, c, r, f) {
				getObject(a).removeEventListener(
					getStringFromWasm0(c, r),
					getObject(f),
				);
			}, arguments);
		},
		__wbg_removeListener_7afb5d85c58c554b: function () {
			return handleError(function (a, c) {
				getObject(a).removeListener(getObject(c));
			}, arguments);
		},
		__wbg_removeProperty_5b3523637b608633: function () {
			return handleError(function (a, c, r, f) {
				const o = getObject(c).removeProperty(getStringFromWasm0(r, f)),
					g = passStringToWasm0(
						o,
						wasm.__wbindgen_export,
						wasm.__wbindgen_export2,
					),
					w = WASM_VECTOR_LEN;
				getDataViewMemory0().setInt32(a + 4, w, true),
					getDataViewMemory0().setInt32(a + 0, g, true);
			}, arguments);
		},
		__wbg_renderbufferStorageMultisample_d999a80fbc25df5f: function (
			a,
			c,
			r,
			f,
			o,
			g,
		) {
			getObject(a).renderbufferStorageMultisample(
				c >>> 0,
				r,
				f >>> 0,
				o,
				g,
			);
		},
		__wbg_renderbufferStorage_9130171a6ae371dc: function (a, c, r, f, o) {
			getObject(a).renderbufferStorage(c >>> 0, r >>> 0, f, o);
		},
		__wbg_renderbufferStorage_b184ea29064b4e02: function (a, c, r, f, o) {
			getObject(a).renderbufferStorage(c >>> 0, r >>> 0, f, o);
		},
		__wbg_repeat_44d6eeebd275606f: function (a) {
			return getObject(a).repeat;
		},
		__wbg_requestAdapter_8efca1b953fd13aa: function (a, c) {
			const r = getObject(a).requestAdapter(getObject(c));
			return addHeapObject(r);
		},
		__wbg_requestAnimationFrame_206c97f410e7a383: function () {
			return handleError(function (a, c) {
				return getObject(a).requestAnimationFrame(getObject(c));
			}, arguments);
		},
		__wbg_requestDevice_290c73161fe959d5: function (a, c) {
			const r = getObject(a).requestDevice(getObject(c));
			return addHeapObject(r);
		},
		__wbg_requestFullscreen_3f16e43f398ce624: function (a) {
			const c = getObject(a).requestFullscreen();
			return addHeapObject(c);
		},
		__wbg_requestFullscreen_b977a3a0697e883c: function (a) {
			const c = getObject(a).requestFullscreen;
			return addHeapObject(c);
		},
		__wbg_requestIdleCallback_3689e3e38f6cfc02: function (a) {
			const c = getObject(a).requestIdleCallback;
			return addHeapObject(c);
		},
		__wbg_requestIdleCallback_75108097af8f5c6a: function () {
			return handleError(function (a, c) {
				return getObject(a).requestIdleCallback(getObject(c));
			}, arguments);
		},
		__wbg_requestPointerLock_5794d6c3f7d960bb: function (a) {
			getObject(a).requestPointerLock();
		},
		__wbg_resolveQuerySet_ee2438e6a23d55f6: function (a, c, r, f, o, g) {
			getObject(a).resolveQuerySet(
				getObject(c),
				r >>> 0,
				f >>> 0,
				getObject(o),
				g >>> 0,
			);
		},
		__wbg_resolve_ae8d83246e5bcc12: function (a) {
			const c = Promise.resolve(getObject(a));
			return addHeapObject(c);
		},
		__wbg_resume_7cf56c82bfdf6c58: function () {
			return handleError(function (a) {
				const c = getObject(a).resume();
				return addHeapObject(c);
			}, arguments);
		},
		__wbg_revokeObjectURL_c4a7ed8e1908b794: function () {
			return handleError(function (a, c) {
				URL.revokeObjectURL(getStringFromWasm0(a, c));
			}, arguments);
		},
		__wbg_samplerParameterf_774cff2229cc9fc3: function (a, c, r, f) {
			getObject(a).samplerParameterf(getObject(c), r >>> 0, f);
		},
		__wbg_samplerParameteri_7dde222b01588620: function (a, c, r, f) {
			getObject(a).samplerParameteri(getObject(c), r >>> 0, f);
		},
		__wbg_scheduler_a17d41c9c822fc26: function (a) {
			const c = getObject(a).scheduler;
			return addHeapObject(c);
		},
		__wbg_scheduler_b35fe73ba70e89cc: function (a) {
			const c = getObject(a).scheduler;
			return addHeapObject(c);
		},
		__wbg_scissor_b18f09381b341db5: function (a, c, r, f, o) {
			getObject(a).scissor(c, r, f, o);
		},
		__wbg_scissor_db3842546fb31842: function (a, c, r, f, o) {
			getObject(a).scissor(c, r, f, o);
		},
		__wbg_setAttribute_f20d3b966749ab64: function () {
			return handleError(function (a, c, r, f, o) {
				getObject(a).setAttribute(
					getStringFromWasm0(c, r),
					getStringFromWasm0(f, o),
				);
			}, arguments);
		},
		__wbg_setBindGroup_1c8c11d4dd6528cf: function (a, c, r) {
			getObject(a).setBindGroup(c >>> 0, getObject(r));
		},
		__wbg_setBindGroup_29f4a44dff76f1a4: function (a, c, r) {
			getObject(a).setBindGroup(c >>> 0, getObject(r));
		},
		__wbg_setBindGroup_35a4830ac2c27742: function () {
			return handleError(function (a, c, r, f, o, g, w) {
				getObject(a).setBindGroup(
					c >>> 0,
					getObject(r),
					getArrayU32FromWasm0(f, o),
					g,
					w >>> 0,
				);
			}, arguments);
		},
		__wbg_setBindGroup_abde98bc542a4ae2: function () {
			return handleError(function (a, c, r, f, o, g, w) {
				getObject(a).setBindGroup(
					c >>> 0,
					getObject(r),
					getArrayU32FromWasm0(f, o),
					g,
					w >>> 0,
				);
			}, arguments);
		},
		__wbg_setBlendConstant_b9a2e1bc2a6182a3: function () {
			return handleError(function (a, c) {
				getObject(a).setBlendConstant(getObject(c));
			}, arguments);
		},
		__wbg_setIndexBuffer_924197dc97dbb679: function (a, c, r, f, o) {
			getObject(a).setIndexBuffer(
				getObject(c),
				__wbindgen_enum_GpuIndexFormat[r],
				f,
				o,
			);
		},
		__wbg_setIndexBuffer_a400322dea5437f7: function (a, c, r, f) {
			getObject(a).setIndexBuffer(
				getObject(c),
				__wbindgen_enum_GpuIndexFormat[r],
				f,
			);
		},
		__wbg_setPipeline_c91e0c8670443991: function (a, c) {
			getObject(a).setPipeline(getObject(c));
		},
		__wbg_setPipeline_e6ea6756d71b19a7: function (a, c) {
			getObject(a).setPipeline(getObject(c));
		},
		__wbg_setPointerCapture_b6e6a21fc0db7621: function () {
			return handleError(function (a, c) {
				getObject(a).setPointerCapture(c);
			}, arguments);
		},
		__wbg_setProperty_ef29d2aa64a04d2b: function () {
			return handleError(function (a, c, r, f, o) {
				getObject(a).setProperty(
					getStringFromWasm0(c, r),
					getStringFromWasm0(f, o),
				);
			}, arguments);
		},
		__wbg_setScissorRect_eeb4f61d4b860d7a: function (a, c, r, f, o) {
			getObject(a).setScissorRect(c >>> 0, r >>> 0, f >>> 0, o >>> 0);
		},
		__wbg_setStencilReference_54f732c89e8ab296: function (a, c) {
			getObject(a).setStencilReference(c >>> 0);
		},
		__wbg_setTimeout_647865935a499f8b: function () {
			return handleError(function (a, c) {
				return getObject(a).setTimeout(getObject(c));
			}, arguments);
		},
		__wbg_setTimeout_7f7035ad0b026458: function () {
			return handleError(function (a, c, r) {
				return getObject(a).setTimeout(getObject(c), r);
			}, arguments);
		},
		__wbg_setVertexBuffer_58f30a4873b36907: function (a, c, r, f) {
			getObject(a).setVertexBuffer(c >>> 0, getObject(r), f);
		},
		__wbg_setVertexBuffer_7aa508f017477005: function (a, c, r, f, o) {
			getObject(a).setVertexBuffer(c >>> 0, getObject(r), f, o);
		},
		__wbg_setViewport_014b4c4d1101ba6b: function (a, c, r, f, o, g, w) {
			getObject(a).setViewport(c, r, f, o, g, w);
		},
		__wbg_set_7eaa4f96924fd6b3: function () {
			return handleError(function (a, c, r) {
				return Reflect.set(getObject(a), getObject(c), getObject(r));
			}, arguments);
		},
		__wbg_set_a_6f1653ca7319cdcf: function (a, c) {
			getObject(a).a = c;
		},
		__wbg_set_access_cbee993a36feed10: function (a, c) {
			getObject(a).access = __wbindgen_enum_GpuStorageTextureAccess[c];
		},
		__wbg_set_address_mode_u_38e255cd89ce1977: function (a, c) {
			getObject(a).addressModeU = __wbindgen_enum_GpuAddressMode[c];
		},
		__wbg_set_address_mode_v_513f843d6e3c9dbd: function (a, c) {
			getObject(a).addressModeV = __wbindgen_enum_GpuAddressMode[c];
		},
		__wbg_set_address_mode_w_801f70901a90ed5a: function (a, c) {
			getObject(a).addressModeW = __wbindgen_enum_GpuAddressMode[c];
		},
		__wbg_set_alpha_0a28ffc800461787: function (a, c) {
			getObject(a).alpha = getObject(c);
		},
		__wbg_set_alpha_mode_55b4f33e93691fe8: function (a, c) {
			getObject(a).alphaMode = __wbindgen_enum_GpuCanvasAlphaMode[c];
		},
		__wbg_set_alpha_to_coverage_enabled_ec44695cc0d0e961: function (a, c) {
			getObject(a).alphaToCoverageEnabled = c !== 0;
		},
		__wbg_set_array_layer_count_e774b6d4a5334e63: function (a, c) {
			getObject(a).arrayLayerCount = c >>> 0;
		},
		__wbg_set_array_stride_11c840b41b728354: function (a, c) {
			getObject(a).arrayStride = c;
		},
		__wbg_set_aspect_2503cdfcdcc17373: function (a, c) {
			getObject(a).aspect = __wbindgen_enum_GpuTextureAspect[c];
		},
		__wbg_set_attributes_ac1030b589bf253a: function (a, c) {
			getObject(a).attributes = getObject(c);
		},
		__wbg_set_b_d5b23064b0492744: function (a, c) {
			getObject(a).b = c;
		},
		__wbg_set_base_array_layer_f64cdadf250d1a9b: function (a, c) {
			getObject(a).baseArrayLayer = c >>> 0;
		},
		__wbg_set_base_mip_level_74fc97c2aaf8fc33: function (a, c) {
			getObject(a).baseMipLevel = c >>> 0;
		},
		__wbg_set_beginning_of_pass_write_index_348e7f2f53a86db0: function (
			a,
			c,
		) {
			getObject(a).beginningOfPassWriteIndex = c >>> 0;
		},
		__wbg_set_beginning_of_pass_write_index_880bdf30cfb151c3: function (
			a,
			c,
		) {
			getObject(a).beginningOfPassWriteIndex = c >>> 0;
		},
		__wbg_set_bind_group_layouts_6f13eb021a550053: function (a, c) {
			getObject(a).bindGroupLayouts = getObject(c);
		},
		__wbg_set_binding_2240d98479c0c256: function (a, c) {
			getObject(a).binding = c >>> 0;
		},
		__wbg_set_binding_5296904f2a4c7e25: function (a, c) {
			getObject(a).binding = c >>> 0;
		},
		__wbg_set_blend_4aea897cd7d3c0f8: function (a, c) {
			getObject(a).blend = getObject(c);
		},
		__wbg_set_box_6a730e6c216d512c: function (a, c) {
			getObject(a).box = __wbindgen_enum_ResizeObserverBoxOptions[c];
		},
		__wbg_set_buffer_2e7d1f7814caf92b: function (a, c) {
			getObject(a).buffer = getObject(c);
		},
		__wbg_set_buffer_ba8ed06078d347f7: function (a, c) {
			getObject(a).buffer = getObject(c);
		},
		__wbg_set_buffer_ea42becad62e7650: function (a, c) {
			getObject(a).buffer = getObject(c);
		},
		__wbg_set_buffer_fc9285180932669f: function (a, c) {
			getObject(a).buffer = getObject(c);
		},
		__wbg_set_buffers_72754529595d4bc0: function (a, c) {
			getObject(a).buffers = getObject(c);
		},
		__wbg_set_bytes_per_row_5fedf5a2d44b8482: function (a, c) {
			getObject(a).bytesPerRow = c >>> 0;
		},
		__wbg_set_bytes_per_row_9425e8d6a11b52dc: function (a, c) {
			getObject(a).bytesPerRow = c >>> 0;
		},
		__wbg_set_channelCount_77970d0435dc29e3: function (a, c) {
			getObject(a).channelCount = c >>> 0;
		},
		__wbg_set_clear_value_1171de96edbc21fe: function (a, c) {
			getObject(a).clearValue = getObject(c);
		},
		__wbg_set_code_27a25a855d3fbc6d: function (a, c, r) {
			getObject(a).code = getStringFromWasm0(c, r);
		},
		__wbg_set_color_attachments_4516b6dfb4ad987b: function (a, c) {
			getObject(a).colorAttachments = getObject(c);
		},
		__wbg_set_color_f2ac28bdc576c010: function (a, c) {
			getObject(a).color = getObject(c);
		},
		__wbg_set_compare_2c8ee8ccaa2b6b5d: function (a, c) {
			getObject(a).compare = __wbindgen_enum_GpuCompareFunction[c];
		},
		__wbg_set_compare_cbf49b43d3211833: function (a, c) {
			getObject(a).compare = __wbindgen_enum_GpuCompareFunction[c];
		},
		__wbg_set_compute_e8ed640c578ae016: function (a, c) {
			getObject(a).compute = getObject(c);
		},
		__wbg_set_count_53854513da5c0e04: function (a, c) {
			getObject(a).count = c >>> 0;
		},
		__wbg_set_count_b424874e36f62c59: function (a, c) {
			getObject(a).count = c >>> 0;
		},
		__wbg_set_cull_mode_3852dd4cff56dd90: function (a, c) {
			getObject(a).cullMode = __wbindgen_enum_GpuCullMode[c];
		},
		__wbg_set_cursor_8d686ff9dd99a325: function (a, c, r) {
			getObject(a).cursor = getStringFromWasm0(c, r);
		},
		__wbg_set_depth_bias_c20861a58fc2b8d9: function (a, c) {
			getObject(a).depthBias = c;
		},
		__wbg_set_depth_bias_clamp_eecc04d702f9402e: function (a, c) {
			getObject(a).depthBiasClamp = c;
		},
		__wbg_set_depth_bias_slope_scale_b2a251d3d4c65018: function (a, c) {
			getObject(a).depthBiasSlopeScale = c;
		},
		__wbg_set_depth_clear_value_fca9e379a0cdff8f: function (a, c) {
			getObject(a).depthClearValue = c;
		},
		__wbg_set_depth_compare_7883e52aad39b925: function (a, c) {
			getObject(a).depthCompare = __wbindgen_enum_GpuCompareFunction[c];
		},
		__wbg_set_depth_fail_op_1d11c8e03d061484: function (a, c) {
			getObject(a).depthFailOp = __wbindgen_enum_GpuStencilOperation[c];
		},
		__wbg_set_depth_load_op_7e95e67c69e09c5e: function (a, c) {
			getObject(a).depthLoadOp = __wbindgen_enum_GpuLoadOp[c];
		},
		__wbg_set_depth_or_array_layers_36ef1df107b6b651: function (a, c) {
			getObject(a).depthOrArrayLayers = c >>> 0;
		},
		__wbg_set_depth_read_only_0c5e726b56520b08: function (a, c) {
			getObject(a).depthReadOnly = c !== 0;
		},
		__wbg_set_depth_stencil_17e2d1710f4e07ae: function (a, c) {
			getObject(a).depthStencil = getObject(c);
		},
		__wbg_set_depth_stencil_attachment_a7b5eca74b7ddcfb: function (a, c) {
			getObject(a).depthStencilAttachment = getObject(c);
		},
		__wbg_set_depth_store_op_1b4cc257f121a4e7: function (a, c) {
			getObject(a).depthStoreOp = __wbindgen_enum_GpuStoreOp[c];
		},
		__wbg_set_depth_write_enabled_1551f99ae66d959e: function (a, c) {
			getObject(a).depthWriteEnabled = c !== 0;
		},
		__wbg_set_device_846227515bb0301a: function (a, c) {
			getObject(a).device = getObject(c);
		},
		__wbg_set_dimension_7454baa9c745cf06: function (a, c) {
			getObject(a).dimension = __wbindgen_enum_GpuTextureDimension[c];
		},
		__wbg_set_dimension_9d314669636abc65: function (a, c) {
			getObject(a).dimension = __wbindgen_enum_GpuTextureViewDimension[c];
		},
		__wbg_set_dst_factor_8397030245674624: function (a, c) {
			getObject(a).dstFactor = __wbindgen_enum_GpuBlendFactor[c];
		},
		__wbg_set_duration_bfef0b021dc8fd5b: function (a, c) {
			getObject(a).duration = c;
		},
		__wbg_set_e80615d7a9a43981: function (a, c, r) {
			getObject(a).set(getObject(c), r >>> 0);
		},
		__wbg_set_end_of_pass_write_index_4600a261d0317ecb: function (a, c) {
			getObject(a).endOfPassWriteIndex = c >>> 0;
		},
		__wbg_set_end_of_pass_write_index_9fec09fcc7da1609: function (a, c) {
			getObject(a).endOfPassWriteIndex = c >>> 0;
		},
		__wbg_set_entries_4d13c932343146c3: function (a, c) {
			getObject(a).entries = getObject(c);
		},
		__wbg_set_entries_7e6b569918b11bf4: function (a, c) {
			getObject(a).entries = getObject(c);
		},
		__wbg_set_entry_point_7248ed25fb9070c7: function (a, c, r) {
			getObject(a).entryPoint = getStringFromWasm0(c, r);
		},
		__wbg_set_entry_point_b01eb3970a1dcb95: function (a, c, r) {
			getObject(a).entryPoint = getStringFromWasm0(c, r);
		},
		__wbg_set_entry_point_c8f041069c527ff6: function (a, c, r) {
			getObject(a).entryPoint = getStringFromWasm0(c, r);
		},
		__wbg_set_external_texture_cf6cf39036321145: function (a, c) {
			getObject(a).externalTexture = getObject(c);
		},
		__wbg_set_fail_op_ac8f2b4c077715b1: function (a, c) {
			getObject(a).failOp = __wbindgen_enum_GpuStencilOperation[c];
		},
		__wbg_set_format_12bcbdd3428cd4b5: function (a, c) {
			getObject(a).format = __wbindgen_enum_GpuTextureFormat[c];
		},
		__wbg_set_format_1fc8a436841b29c8: function (a, c) {
			getObject(a).format = __wbindgen_enum_GpuTextureFormat[c];
		},
		__wbg_set_format_2a42ed14de233ae5: function (a, c) {
			getObject(a).format = __wbindgen_enum_GpuVertexFormat[c];
		},
		__wbg_set_format_3759d043ddc658d4: function (a, c) {
			getObject(a).format = __wbindgen_enum_GpuTextureFormat[c];
		},
		__wbg_set_format_b08e529cc1612d7b: function (a, c) {
			getObject(a).format = __wbindgen_enum_GpuTextureFormat[c];
		},
		__wbg_set_format_e0cf5a237864edb6: function (a, c) {
			getObject(a).format = __wbindgen_enum_GpuTextureFormat[c];
		},
		__wbg_set_format_ffa0a97f114a945a: function (a, c) {
			getObject(a).format = __wbindgen_enum_GpuTextureFormat[c];
		},
		__wbg_set_fragment_703ddd6f5db6e4af: function (a, c) {
			getObject(a).fragment = getObject(c);
		},
		__wbg_set_front_face_17a3723085696d9a: function (a, c) {
			getObject(a).frontFace = __wbindgen_enum_GpuFrontFace[c];
		},
		__wbg_set_g_4cc3b3e3231ca6f8: function (a, c) {
			getObject(a).g = c;
		},
		__wbg_set_has_dynamic_offset_dc25aba64b9bd3ff: function (a, c) {
			getObject(a).hasDynamicOffset = c !== 0;
		},
		__wbg_set_height_98a1a397672657e2: function (a, c) {
			getObject(a).height = c >>> 0;
		},
		__wbg_set_height_ac705ece3aa08c95: function (a, c) {
			getObject(a).height = c >>> 0;
		},
		__wbg_set_height_b6548a01bdcb689a: function (a, c) {
			getObject(a).height = c >>> 0;
		},
		__wbg_set_iterations_b84d4d3302a291a0: function (a, c) {
			getObject(a).iterations = c;
		},
		__wbg_set_label_10bd19b972ff1ba6: function (a, c, r) {
			getObject(a).label = getStringFromWasm0(c, r);
		},
		__wbg_set_label_16cff4ff3c381368: function (a, c, r) {
			getObject(a).label = getStringFromWasm0(c, r);
		},
		__wbg_set_label_343ceab4761679d7: function (a, c, r) {
			getObject(a).label = getStringFromWasm0(c, r);
		},
		__wbg_set_label_403725ced930414e: function (a, c, r) {
			getObject(a).label = getStringFromWasm0(c, r);
		},
		__wbg_set_label_62b82f9361718fb9: function (a, c, r) {
			getObject(a).label = getStringFromWasm0(c, r);
		},
		__wbg_set_label_6afa181067c4da56: function (a, c, r) {
			getObject(a).label = getStringFromWasm0(c, r);
		},
		__wbg_set_label_7d448e8a777d0d37: function (a, c, r) {
			getObject(a).label = getStringFromWasm0(c, r);
		},
		__wbg_set_label_900e563567315063: function (a, c, r) {
			getObject(a).label = getStringFromWasm0(c, r);
		},
		__wbg_set_label_98bef61fcbcecdde: function (a, c, r) {
			getObject(a).label = getStringFromWasm0(c, r);
		},
		__wbg_set_label_9d2ce197e447a967: function (a, c, r) {
			getObject(a).label = getStringFromWasm0(c, r);
		},
		__wbg_set_label_a19e77f79a88d021: function (a, c, r) {
			getObject(a).label = getStringFromWasm0(c, r);
		},
		__wbg_set_label_b5d7ff5f8e4fbaac: function (a, c, r) {
			getObject(a).label = getStringFromWasm0(c, r);
		},
		__wbg_set_label_ba288fbac1259847: function (a, c, r) {
			getObject(a).label = getStringFromWasm0(c, r);
		},
		__wbg_set_label_e135ef1842fb45f8: function (a, c, r) {
			getObject(a).label = getStringFromWasm0(c, r);
		},
		__wbg_set_label_e1bd2437f39d21f3: function (a, c, r) {
			getObject(a).label = getStringFromWasm0(c, r);
		},
		__wbg_set_label_e4debe6dc9ea319b: function (a, c, r) {
			getObject(a).label = getStringFromWasm0(c, r);
		},
		__wbg_set_layout_53be3643dc5dbbbe: function (a, c) {
			getObject(a).layout = getObject(c);
		},
		__wbg_set_layout_bb56309555eaa472: function (a, c) {
			getObject(a).layout = getObject(c);
		},
		__wbg_set_layout_ca5f863d331bb6b4: function (a, c) {
			getObject(a).layout = getObject(c);
		},
		__wbg_set_load_op_91d2cbf2912c96fd: function (a, c) {
			getObject(a).loadOp = __wbindgen_enum_GpuLoadOp[c];
		},
		__wbg_set_lod_max_clamp_01800ff5df00cc8e: function (a, c) {
			getObject(a).lodMaxClamp = c;
		},
		__wbg_set_lod_min_clamp_fe71be084b04bd97: function (a, c) {
			getObject(a).lodMinClamp = c;
		},
		__wbg_set_mag_filter_a6df09d1943d5caa: function (a, c) {
			getObject(a).magFilter = __wbindgen_enum_GpuFilterMode[c];
		},
		__wbg_set_mapped_at_creation_eb954cf5fdb9bc25: function (a, c) {
			getObject(a).mappedAtCreation = c !== 0;
		},
		__wbg_set_mask_47a41aae6631771f: function (a, c) {
			getObject(a).mask = c >>> 0;
		},
		__wbg_set_max_anisotropy_418bd200a56097a0: function (a, c) {
			getObject(a).maxAnisotropy = c;
		},
		__wbg_set_min_binding_size_d0315b751370234c: function (a, c) {
			getObject(a).minBindingSize = c;
		},
		__wbg_set_min_filter_5b27a7eb3f5ea88a: function (a, c) {
			getObject(a).minFilter = __wbindgen_enum_GpuFilterMode[c];
		},
		__wbg_set_mip_level_b50dccbd04935c98: function (a, c) {
			getObject(a).mipLevel = c >>> 0;
		},
		__wbg_set_mip_level_count_307eb64d9d29e3a6: function (a, c) {
			getObject(a).mipLevelCount = c >>> 0;
		},
		__wbg_set_mip_level_count_fe7f73daa6021aaa: function (a, c) {
			getObject(a).mipLevelCount = c >>> 0;
		},
		__wbg_set_mipmap_filter_e1543204e8199db0: function (a, c) {
			getObject(a).mipmapFilter = __wbindgen_enum_GpuMipmapFilterMode[c];
		},
		__wbg_set_module_46b766d7fbe021b2: function (a, c) {
			getObject(a).module = getObject(c);
		},
		__wbg_set_module_9afd1b80ff72cee9: function (a, c) {
			getObject(a).module = getObject(c);
		},
		__wbg_set_module_ffe8f8e909e9fdcf: function (a, c) {
			getObject(a).module = getObject(c);
		},
		__wbg_set_multisample_957afdd96685c6f5: function (a, c) {
			getObject(a).multisample = getObject(c);
		},
		__wbg_set_multisampled_84e304d3a68838ea: function (a, c) {
			getObject(a).multisampled = c !== 0;
		},
		__wbg_set_offset_157c6bc4fd6ec4b1: function (a, c) {
			getObject(a).offset = c;
		},
		__wbg_set_offset_3e78f3e530cf8049: function (a, c) {
			getObject(a).offset = c;
		},
		__wbg_set_offset_616ad7dfa51d50e0: function (a, c) {
			getObject(a).offset = c;
		},
		__wbg_set_offset_bea112c360dc7f2b: function (a, c) {
			getObject(a).offset = c;
		},
		__wbg_set_onended_c6277da5931bd62f: function (a, c) {
			getObject(a).onended = getObject(c);
		},
		__wbg_set_onmessage_f939f8b6d08ca76b: function (a, c) {
			getObject(a).onmessage = getObject(c);
		},
		__wbg_set_operation_6c5fd88df90bc7b2: function (a, c) {
			getObject(a).operation = __wbindgen_enum_GpuBlendOperation[c];
		},
		__wbg_set_origin_dec4f4c36f9f79f6: function (a, c) {
			getObject(a).origin = getObject(c);
		},
		__wbg_set_pass_op_461dabd5ee4ea1b7: function (a, c) {
			getObject(a).passOp = __wbindgen_enum_GpuStencilOperation[c];
		},
		__wbg_set_power_preference_a4ce891b22ea2b05: function (a, c) {
			getObject(a).powerPreference =
				__wbindgen_enum_GpuPowerPreference[c];
		},
		__wbg_set_premultiply_alpha_696b545e0615f655: function (a, c) {
			getObject(a).premultiplyAlpha = __wbindgen_enum_PremultiplyAlpha[c];
		},
		__wbg_set_primitive_eb8abbc5e7f278a4: function (a, c) {
			getObject(a).primitive = getObject(c);
		},
		__wbg_set_query_set_849fb32875f137d7: function (a, c) {
			getObject(a).querySet = getObject(c);
		},
		__wbg_set_query_set_c65a8f4d74f562f6: function (a, c) {
			getObject(a).querySet = getObject(c);
		},
		__wbg_set_r_5fa0f548248c394c: function (a, c) {
			getObject(a).r = c;
		},
		__wbg_set_required_features_98a83c7003fd73d5: function (a, c) {
			getObject(a).requiredFeatures = getObject(c);
		},
		__wbg_set_resolve_target_1ff405e060e2d32e: function (a, c) {
			getObject(a).resolveTarget = getObject(c);
		},
		__wbg_set_resource_1409c14d4d6b5a50: function (a, c) {
			getObject(a).resource = getObject(c);
		},
		__wbg_set_rows_per_image_8104dfe1b042a530: function (a, c) {
			getObject(a).rowsPerImage = c >>> 0;
		},
		__wbg_set_rows_per_image_9cfda8920e669db0: function (a, c) {
			getObject(a).rowsPerImage = c >>> 0;
		},
		__wbg_set_sample_count_95a9892a60894677: function (a, c) {
			getObject(a).sampleCount = c >>> 0;
		},
		__wbg_set_sample_rate_88fa12f3b8a6ae94: function (a, c) {
			getObject(a).sampleRate = c;
		},
		__wbg_set_sample_type_f8f7b39d62e7b29c: function (a, c) {
			getObject(a).sampleType = __wbindgen_enum_GpuTextureSampleType[c];
		},
		__wbg_set_sampler_a2277e90dfe7395f: function (a, c) {
			getObject(a).sampler = getObject(c);
		},
		__wbg_set_shader_location_cdbcf5cf84a6cbcb: function (a, c) {
			getObject(a).shaderLocation = c >>> 0;
		},
		__wbg_set_size_6f271c4c28c18e1b: function (a, c) {
			getObject(a).size = getObject(c);
		},
		__wbg_set_size_7ec162511b3bad1f: function (a, c) {
			getObject(a).size = c;
		},
		__wbg_set_size_ca765d983baccefd: function (a, c) {
			getObject(a).size = c;
		},
		__wbg_set_src_f257a96103ac1ac6: function (a, c, r) {
			getObject(a).src = getStringFromWasm0(c, r);
		},
		__wbg_set_src_factor_e96f05a25f8383ed: function (a, c) {
			getObject(a).srcFactor = __wbindgen_enum_GpuBlendFactor[c];
		},
		__wbg_set_stencil_back_5c8971274cbcddcf: function (a, c) {
			getObject(a).stencilBack = getObject(c);
		},
		__wbg_set_stencil_clear_value_89ba97b367fa1385: function (a, c) {
			getObject(a).stencilClearValue = c >>> 0;
		},
		__wbg_set_stencil_front_69f85bf4a6f02cb2: function (a, c) {
			getObject(a).stencilFront = getObject(c);
		},
		__wbg_set_stencil_load_op_a3e2c3a6f20d4da5: function (a, c) {
			getObject(a).stencilLoadOp = __wbindgen_enum_GpuLoadOp[c];
		},
		__wbg_set_stencil_read_mask_86a08afb2665c29b: function (a, c) {
			getObject(a).stencilReadMask = c >>> 0;
		},
		__wbg_set_stencil_read_only_dd058fe8c6a1f6ae: function (a, c) {
			getObject(a).stencilReadOnly = c !== 0;
		},
		__wbg_set_stencil_store_op_87c97415636844c9: function (a, c) {
			getObject(a).stencilStoreOp = __wbindgen_enum_GpuStoreOp[c];
		},
		__wbg_set_stencil_write_mask_7844d8a057a87a58: function (a, c) {
			getObject(a).stencilWriteMask = c >>> 0;
		},
		__wbg_set_step_mode_285f2e428148f3b4: function (a, c) {
			getObject(a).stepMode = __wbindgen_enum_GpuVertexStepMode[c];
		},
		__wbg_set_storage_texture_373b9fc0e534dd33: function (a, c) {
			getObject(a).storageTexture = getObject(c);
		},
		__wbg_set_store_op_94575f47253d270d: function (a, c) {
			getObject(a).storeOp = __wbindgen_enum_GpuStoreOp[c];
		},
		__wbg_set_strip_index_format_aeb7aa0e95e6285d: function (a, c) {
			getObject(a).stripIndexFormat = __wbindgen_enum_GpuIndexFormat[c];
		},
		__wbg_set_targets_93553735385af349: function (a, c) {
			getObject(a).targets = getObject(c);
		},
		__wbg_set_texture_6003a9e79918bf8a: function (a, c) {
			getObject(a).texture = getObject(c);
		},
		__wbg_set_texture_c5a457625c071b25: function (a, c) {
			getObject(a).texture = getObject(c);
		},
		__wbg_set_timestamp_writes_0603b32a31ee6205: function (a, c) {
			getObject(a).timestampWrites = getObject(c);
		},
		__wbg_set_timestamp_writes_f0a806787f57efc4: function (a, c) {
			getObject(a).timestampWrites = getObject(c);
		},
		__wbg_set_topology_5e4eb809635ea291: function (a, c) {
			getObject(a).topology = __wbindgen_enum_GpuPrimitiveTopology[c];
		},
		__wbg_set_type_0e707d4c06fc2b7b: function (a, c) {
			getObject(a).type = __wbindgen_enum_GpuSamplerBindingType[c];
		},
		__wbg_set_type_33e79f1b45a78c37: function (a, c, r) {
			getObject(a).type = getStringFromWasm0(c, r);
		},
		__wbg_set_type_6fe4c5f460401ee0: function (a, c) {
			getObject(a).type = __wbindgen_enum_GpuBufferBindingType[c];
		},
		__wbg_set_type_d6425b2efca08597: function (a, c) {
			getObject(a).type = __wbindgen_enum_GpuQueryType[c];
		},
		__wbg_set_unclipped_depth_e9a2451e4fa0277a: function (a, c) {
			getObject(a).unclippedDepth = c !== 0;
		},
		__wbg_set_usage_5abd566becc087bb: function (a, c) {
			getObject(a).usage = c >>> 0;
		},
		__wbg_set_usage_61967f166fba5e13: function (a, c) {
			getObject(a).usage = c >>> 0;
		},
		__wbg_set_usage_d0a75d4429098a06: function (a, c) {
			getObject(a).usage = c >>> 0;
		},
		__wbg_set_usage_f0bb325677668e77: function (a, c) {
			getObject(a).usage = c >>> 0;
		},
		__wbg_set_vertex_2525cfcd959b2add: function (a, c) {
			getObject(a).vertex = getObject(c);
		},
		__wbg_set_view_57d232eea19739c3: function (a, c) {
			getObject(a).view = getObject(c);
		},
		__wbg_set_view_dimension_49cfda500f1dea55: function (a, c) {
			getObject(a).viewDimension =
				__wbindgen_enum_GpuTextureViewDimension[c];
		},
		__wbg_set_view_dimension_a669c29ec3b0813a: function (a, c) {
			getObject(a).viewDimension =
				__wbindgen_enum_GpuTextureViewDimension[c];
		},
		__wbg_set_view_ffadd767d5e9b839: function (a, c) {
			getObject(a).view = getObject(c);
		},
		__wbg_set_view_formats_70a1fcabcd34282a: function (a, c) {
			getObject(a).viewFormats = getObject(c);
		},
		__wbg_set_view_formats_83865b9cdfda5cb6: function (a, c) {
			getObject(a).viewFormats = getObject(c);
		},
		__wbg_set_visibility_088046ee77c33b1d: function (a, c) {
			getObject(a).visibility = c >>> 0;
		},
		__wbg_set_width_576343a4a7f2cf28: function (a, c) {
			getObject(a).width = c >>> 0;
		},
		__wbg_set_width_c0fcaa2da53cd540: function (a, c) {
			getObject(a).width = c >>> 0;
		},
		__wbg_set_width_e96e07f8255ad913: function (a, c) {
			getObject(a).width = c >>> 0;
		},
		__wbg_set_write_mask_76041c03688571cd: function (a, c) {
			getObject(a).writeMask = c >>> 0;
		},
		__wbg_set_x_fdd6aca9a2390926: function (a, c) {
			getObject(a).x = c >>> 0;
		},
		__wbg_set_y_410a18c5811abf4c: function (a, c) {
			getObject(a).y = c >>> 0;
		},
		__wbg_set_z_f7f1ae8afd3a9308: function (a, c) {
			getObject(a).z = c >>> 0;
		},
		__wbg_shaderSource_06639e7b476e6ac2: function (a, c, r, f) {
			getObject(a).shaderSource(getObject(c), getStringFromWasm0(r, f));
		},
		__wbg_shaderSource_2bca0edc97475e95: function (a, c, r, f) {
			getObject(a).shaderSource(getObject(c), getStringFromWasm0(r, f));
		},
		__wbg_shiftKey_5256a2168f9dc186: function (a) {
			return getObject(a).shiftKey;
		},
		__wbg_shiftKey_ec106aa0755af421: function (a) {
			return getObject(a).shiftKey;
		},
		__wbg_signal_166e1da31adcac18: function (a) {
			const c = getObject(a).signal;
			return addHeapObject(c);
		},
		__wbg_size_09f35345b4742a87: function (a) {
			return getObject(a).size;
		},
		__wbg_stack_3b0d974bbf31e44f: function (a, c) {
			const r = getObject(c).stack,
				f = passStringToWasm0(
					r,
					wasm.__wbindgen_export,
					wasm.__wbindgen_export2,
				),
				o = WASM_VECTOR_LEN;
			getDataViewMemory0().setInt32(a + 4, o, true),
				getDataViewMemory0().setInt32(a + 0, f, true);
		},
		__wbg_start_b037850d8eda4626: function () {
			return handleError(function (a, c) {
				getObject(a).start(c);
			}, arguments);
		},
		__wbg_start_f837ba2bac4733b5: function (a) {
			getObject(a).start();
		},
		__wbg_static_accessor_GLOBAL_8adb955bd33fac2f: function () {
			const a = typeof global > 'u' ? null : global;
			return isLikeNone(a) ? 0 : addHeapObject(a);
		},
		__wbg_static_accessor_GLOBAL_THIS_ad356e0db91c7913: function () {
			const a = typeof globalThis > 'u' ? null : globalThis;
			return isLikeNone(a) ? 0 : addHeapObject(a);
		},
		__wbg_static_accessor_SELF_f207c857566db248: function () {
			const a = typeof self > 'u' ? null : self;
			return isLikeNone(a) ? 0 : addHeapObject(a);
		},
		__wbg_static_accessor_WINDOW_bb9f1ba69d61b386: function () {
			const a = typeof window > 'u' ? null : window;
			return isLikeNone(a) ? 0 : addHeapObject(a);
		},
		__wbg_status_318629ab93a22955: function (a) {
			return getObject(a).status;
		},
		__wbg_stencilFuncSeparate_18642df0574c1930: function (a, c, r, f, o) {
			getObject(a).stencilFuncSeparate(c >>> 0, r >>> 0, f, o >>> 0);
		},
		__wbg_stencilFuncSeparate_94ee4fbc164addec: function (a, c, r, f, o) {
			getObject(a).stencilFuncSeparate(c >>> 0, r >>> 0, f, o >>> 0);
		},
		__wbg_stencilMaskSeparate_13b0475860a9b559: function (a, c, r) {
			getObject(a).stencilMaskSeparate(c >>> 0, r >>> 0);
		},
		__wbg_stencilMaskSeparate_a7bd409376ee05ff: function (a, c, r) {
			getObject(a).stencilMaskSeparate(c >>> 0, r >>> 0);
		},
		__wbg_stencilMask_326a11d0928c3808: function (a, c) {
			getObject(a).stencilMask(c >>> 0);
		},
		__wbg_stencilMask_6354f8ba392f6581: function (a, c) {
			getObject(a).stencilMask(c >>> 0);
		},
		__wbg_stencilOpSeparate_7e819381705b9731: function (a, c, r, f, o) {
			getObject(a).stencilOpSeparate(c >>> 0, r >>> 0, f >>> 0, o >>> 0);
		},
		__wbg_stencilOpSeparate_8627d0f5f7fe5800: function (a, c, r, f, o) {
			getObject(a).stencilOpSeparate(c >>> 0, r >>> 0, f >>> 0, o >>> 0);
		},
		__wbg_stringify_5ae93966a84901ac: function () {
			return handleError(function (a) {
				const c = JSON.stringify(getObject(a));
				return addHeapObject(c);
			}, arguments);
		},
		__wbg_style_b01fc765f98b99ff: function (a) {
			const c = getObject(a).style;
			return addHeapObject(c);
		},
		__wbg_submit_21302eebe551e30d: function (a, c) {
			getObject(a).submit(getObject(c));
		},
		__wbg_texImage2D_32ed4220040ca614: function () {
			return handleError(function (a, c, r, f, o, g, w, T, S, p) {
				getObject(a).texImage2D(
					c >>> 0,
					r,
					f,
					o,
					g,
					w,
					T >>> 0,
					S >>> 0,
					getObject(p),
				);
			}, arguments);
		},
		__wbg_texImage2D_d8c284c813952313: function () {
			return handleError(function (a, c, r, f, o, g, w, T, S, p) {
				getObject(a).texImage2D(
					c >>> 0,
					r,
					f,
					o,
					g,
					w,
					T >>> 0,
					S >>> 0,
					p,
				);
			}, arguments);
		},
		__wbg_texImage2D_f4ae6c314a9a4bbe: function () {
			return handleError(function (a, c, r, f, o, g, w, T, S, p) {
				getObject(a).texImage2D(
					c >>> 0,
					r,
					f,
					o,
					g,
					w,
					T >>> 0,
					S >>> 0,
					getObject(p),
				);
			}, arguments);
		},
		__wbg_texImage3D_88ff1fa41be127b9: function () {
			return handleError(function (a, c, r, f, o, g, w, T, S, p, N) {
				getObject(a).texImage3D(
					c >>> 0,
					r,
					f,
					o,
					g,
					w,
					T,
					S >>> 0,
					p >>> 0,
					getObject(N),
				);
			}, arguments);
		},
		__wbg_texImage3D_9a207e0459a4f276: function () {
			return handleError(function (a, c, r, f, o, g, w, T, S, p, N) {
				getObject(a).texImage3D(
					c >>> 0,
					r,
					f,
					o,
					g,
					w,
					T,
					S >>> 0,
					p >>> 0,
					N,
				);
			}, arguments);
		},
		__wbg_texParameteri_f4b1596185f5432d: function (a, c, r, f) {
			getObject(a).texParameteri(c >>> 0, r >>> 0, f);
		},
		__wbg_texParameteri_fcdec30159061963: function (a, c, r, f) {
			getObject(a).texParameteri(c >>> 0, r >>> 0, f);
		},
		__wbg_texStorage2D_a84f74d36d279097: function (a, c, r, f, o, g) {
			getObject(a).texStorage2D(c >>> 0, r, f >>> 0, o, g);
		},
		__wbg_texStorage3D_aec6fc3e85ec72da: function (a, c, r, f, o, g, w) {
			getObject(a).texStorage3D(c >>> 0, r, f >>> 0, o, g, w);
		},
		__wbg_texSubImage2D_1e7d6febf82b9bed: function () {
			return handleError(function (a, c, r, f, o, g, w, T, S, p) {
				getObject(a).texSubImage2D(
					c >>> 0,
					r,
					f,
					o,
					g,
					w,
					T >>> 0,
					S >>> 0,
					getObject(p),
				);
			}, arguments);
		},
		__wbg_texSubImage2D_271ffedb47424d0d: function () {
			return handleError(function (a, c, r, f, o, g, w, T, S, p) {
				getObject(a).texSubImage2D(
					c >>> 0,
					r,
					f,
					o,
					g,
					w,
					T >>> 0,
					S >>> 0,
					getObject(p),
				);
			}, arguments);
		},
		__wbg_texSubImage2D_3bb41b987f2bfe39: function () {
			return handleError(function (a, c, r, f, o, g, w, T, S, p) {
				getObject(a).texSubImage2D(
					c >>> 0,
					r,
					f,
					o,
					g,
					w,
					T >>> 0,
					S >>> 0,
					getObject(p),
				);
			}, arguments);
		},
		__wbg_texSubImage2D_68e0413824eddc12: function () {
			return handleError(function (a, c, r, f, o, g, w, T, S, p) {
				getObject(a).texSubImage2D(
					c >>> 0,
					r,
					f,
					o,
					g,
					w,
					T >>> 0,
					S >>> 0,
					getObject(p),
				);
			}, arguments);
		},
		__wbg_texSubImage2D_b6cdbbe62097211a: function () {
			return handleError(function (a, c, r, f, o, g, w, T, S, p) {
				getObject(a).texSubImage2D(
					c >>> 0,
					r,
					f,
					o,
					g,
					w,
					T >>> 0,
					S >>> 0,
					getObject(p),
				);
			}, arguments);
		},
		__wbg_texSubImage2D_c8919d8f32f723da: function () {
			return handleError(function (a, c, r, f, o, g, w, T, S, p) {
				getObject(a).texSubImage2D(
					c >>> 0,
					r,
					f,
					o,
					g,
					w,
					T >>> 0,
					S >>> 0,
					getObject(p),
				);
			}, arguments);
		},
		__wbg_texSubImage2D_d784df0b813dc1ab: function () {
			return handleError(function (a, c, r, f, o, g, w, T, S, p) {
				getObject(a).texSubImage2D(
					c >>> 0,
					r,
					f,
					o,
					g,
					w,
					T >>> 0,
					S >>> 0,
					p,
				);
			}, arguments);
		},
		__wbg_texSubImage2D_dd1d50234b61de4b: function () {
			return handleError(function (a, c, r, f, o, g, w, T, S, p) {
				getObject(a).texSubImage2D(
					c >>> 0,
					r,
					f,
					o,
					g,
					w,
					T >>> 0,
					S >>> 0,
					getObject(p),
				);
			}, arguments);
		},
		__wbg_texSubImage3D_09cc863aedf44a21: function () {
			return handleError(function (a, c, r, f, o, g, w, T, S, p, N, C) {
				getObject(a).texSubImage3D(
					c >>> 0,
					r,
					f,
					o,
					g,
					w,
					T,
					S,
					p >>> 0,
					N >>> 0,
					getObject(C),
				);
			}, arguments);
		},
		__wbg_texSubImage3D_4665e67a8f0f7806: function () {
			return handleError(function (a, c, r, f, o, g, w, T, S, p, N, C) {
				getObject(a).texSubImage3D(
					c >>> 0,
					r,
					f,
					o,
					g,
					w,
					T,
					S,
					p >>> 0,
					N >>> 0,
					getObject(C),
				);
			}, arguments);
		},
		__wbg_texSubImage3D_61ed187f3ec11ecc: function () {
			return handleError(function (a, c, r, f, o, g, w, T, S, p, N, C) {
				getObject(a).texSubImage3D(
					c >>> 0,
					r,
					f,
					o,
					g,
					w,
					T,
					S,
					p >>> 0,
					N >>> 0,
					getObject(C),
				);
			}, arguments);
		},
		__wbg_texSubImage3D_6a46981af8bc8e49: function () {
			return handleError(function (a, c, r, f, o, g, w, T, S, p, N, C) {
				getObject(a).texSubImage3D(
					c >>> 0,
					r,
					f,
					o,
					g,
					w,
					T,
					S,
					p >>> 0,
					N >>> 0,
					getObject(C),
				);
			}, arguments);
		},
		__wbg_texSubImage3D_9eca35d234d51b8a: function () {
			return handleError(function (a, c, r, f, o, g, w, T, S, p, N, C) {
				getObject(a).texSubImage3D(
					c >>> 0,
					r,
					f,
					o,
					g,
					w,
					T,
					S,
					p >>> 0,
					N >>> 0,
					getObject(C),
				);
			}, arguments);
		},
		__wbg_texSubImage3D_b3cbbb79fe54da6d: function () {
			return handleError(function (a, c, r, f, o, g, w, T, S, p, N, C) {
				getObject(a).texSubImage3D(
					c >>> 0,
					r,
					f,
					o,
					g,
					w,
					T,
					S,
					p >>> 0,
					N >>> 0,
					C,
				);
			}, arguments);
		},
		__wbg_texSubImage3D_f9c3af789162846a: function () {
			return handleError(function (a, c, r, f, o, g, w, T, S, p, N, C) {
				getObject(a).texSubImage3D(
					c >>> 0,
					r,
					f,
					o,
					g,
					w,
					T,
					S,
					p >>> 0,
					N >>> 0,
					getObject(C),
				);
			}, arguments);
		},
		__wbg_then_098abe61755d12f6: function (a, c) {
			const r = getObject(a).then(getObject(c));
			return addHeapObject(r);
		},
		__wbg_then_9e335f6dd892bc11: function (a, c, r) {
			const f = getObject(a).then(getObject(c), getObject(r));
			return addHeapObject(f);
		},
		__wbg_then_bc59d1943397ca4e: function (a, c, r) {
			const f = getObject(a).then(getObject(c), getObject(r));
			return addHeapObject(f);
		},
		__wbg_toBlob_b7bc2b08e11beff6: function () {
			return handleError(function (a, c) {
				getObject(a).toBlob(getObject(c));
			}, arguments);
		},
		__wbg_transferFromImageBitmap_9f9bd42ea0f80770: function (a, c) {
			getObject(a).transferFromImageBitmap(getObject(c));
		},
		__wbg_uniform1f_8c3b03df282dba21: function (a, c, r) {
			getObject(a).uniform1f(getObject(c), r);
		},
		__wbg_uniform1f_b8841988568406b9: function (a, c, r) {
			getObject(a).uniform1f(getObject(c), r);
		},
		__wbg_uniform1i_953040fb972e9fab: function (a, c, r) {
			getObject(a).uniform1i(getObject(c), r);
		},
		__wbg_uniform1i_acd89bea81085be4: function (a, c, r) {
			getObject(a).uniform1i(getObject(c), r);
		},
		__wbg_uniform1ui_9f8d9b877d6691d8: function (a, c, r) {
			getObject(a).uniform1ui(getObject(c), r >>> 0);
		},
		__wbg_uniform2fv_28fbf8836f3045d0: function (a, c, r, f) {
			getObject(a).uniform2fv(getObject(c), getArrayF32FromWasm0(r, f));
		},
		__wbg_uniform2fv_f3c92aab21d0dec3: function (a, c, r, f) {
			getObject(a).uniform2fv(getObject(c), getArrayF32FromWasm0(r, f));
		},
		__wbg_uniform2iv_892b6d31137ad198: function (a, c, r, f) {
			getObject(a).uniform2iv(getObject(c), getArrayI32FromWasm0(r, f));
		},
		__wbg_uniform2iv_f40f632615c5685a: function (a, c, r, f) {
			getObject(a).uniform2iv(getObject(c), getArrayI32FromWasm0(r, f));
		},
		__wbg_uniform2uiv_6d170469a702f23e: function (a, c, r, f) {
			getObject(a).uniform2uiv(getObject(c), getArrayU32FromWasm0(r, f));
		},
		__wbg_uniform3fv_85a9a17c9635941b: function (a, c, r, f) {
			getObject(a).uniform3fv(getObject(c), getArrayF32FromWasm0(r, f));
		},
		__wbg_uniform3fv_cdf7c84f9119f13b: function (a, c, r, f) {
			getObject(a).uniform3fv(getObject(c), getArrayF32FromWasm0(r, f));
		},
		__wbg_uniform3iv_38e74d2ae9dfbfb8: function (a, c, r, f) {
			getObject(a).uniform3iv(getObject(c), getArrayI32FromWasm0(r, f));
		},
		__wbg_uniform3iv_4c372010ac6def3f: function (a, c, r, f) {
			getObject(a).uniform3iv(getObject(c), getArrayI32FromWasm0(r, f));
		},
		__wbg_uniform3uiv_bb7266bb3a5aef96: function (a, c, r, f) {
			getObject(a).uniform3uiv(getObject(c), getArrayU32FromWasm0(r, f));
		},
		__wbg_uniform4f_0b00a34f4789ad14: function (a, c, r, f, o, g) {
			getObject(a).uniform4f(getObject(c), r, f, o, g);
		},
		__wbg_uniform4f_7275e0fb864b7513: function (a, c, r, f, o, g) {
			getObject(a).uniform4f(getObject(c), r, f, o, g);
		},
		__wbg_uniform4fv_a4cdb4bd66867df5: function (a, c, r, f) {
			getObject(a).uniform4fv(getObject(c), getArrayF32FromWasm0(r, f));
		},
		__wbg_uniform4fv_c416900acf65eca9: function (a, c, r, f) {
			getObject(a).uniform4fv(getObject(c), getArrayF32FromWasm0(r, f));
		},
		__wbg_uniform4iv_b49cd4acf0aa3ebc: function (a, c, r, f) {
			getObject(a).uniform4iv(getObject(c), getArrayI32FromWasm0(r, f));
		},
		__wbg_uniform4iv_d654af0e6b7bdb1a: function (a, c, r, f) {
			getObject(a).uniform4iv(getObject(c), getArrayI32FromWasm0(r, f));
		},
		__wbg_uniform4uiv_e95d9a124fb8f91e: function (a, c, r, f) {
			getObject(a).uniform4uiv(getObject(c), getArrayU32FromWasm0(r, f));
		},
		__wbg_uniformBlockBinding_a47fa267662afd7b: function (a, c, r, f) {
			getObject(a).uniformBlockBinding(getObject(c), r >>> 0, f >>> 0);
		},
		__wbg_uniformMatrix2fv_4229ae27417c649a: function (a, c, r, f, o) {
			getObject(a).uniformMatrix2fv(
				getObject(c),
				r !== 0,
				getArrayF32FromWasm0(f, o),
			);
		},
		__wbg_uniformMatrix2fv_648417dd2040de5b: function (a, c, r, f, o) {
			getObject(a).uniformMatrix2fv(
				getObject(c),
				r !== 0,
				getArrayF32FromWasm0(f, o),
			);
		},
		__wbg_uniformMatrix2x3fv_eb9a53c8c9aa724b: function (a, c, r, f, o) {
			getObject(a).uniformMatrix2x3fv(
				getObject(c),
				r !== 0,
				getArrayF32FromWasm0(f, o),
			);
		},
		__wbg_uniformMatrix2x4fv_8849517a52f2e845: function (a, c, r, f, o) {
			getObject(a).uniformMatrix2x4fv(
				getObject(c),
				r !== 0,
				getArrayF32FromWasm0(f, o),
			);
		},
		__wbg_uniformMatrix3fv_244fc4416319c169: function (a, c, r, f, o) {
			getObject(a).uniformMatrix3fv(
				getObject(c),
				r !== 0,
				getArrayF32FromWasm0(f, o),
			);
		},
		__wbg_uniformMatrix3fv_bafc2707d0c48e27: function (a, c, r, f, o) {
			getObject(a).uniformMatrix3fv(
				getObject(c),
				r !== 0,
				getArrayF32FromWasm0(f, o),
			);
		},
		__wbg_uniformMatrix3x2fv_f1729eb13fcd41a3: function (a, c, r, f, o) {
			getObject(a).uniformMatrix3x2fv(
				getObject(c),
				r !== 0,
				getArrayF32FromWasm0(f, o),
			);
		},
		__wbg_uniformMatrix3x4fv_3c11181f5fa929de: function (a, c, r, f, o) {
			getObject(a).uniformMatrix3x4fv(
				getObject(c),
				r !== 0,
				getArrayF32FromWasm0(f, o),
			);
		},
		__wbg_uniformMatrix4fv_4d322b295d122214: function (a, c, r, f, o) {
			getObject(a).uniformMatrix4fv(
				getObject(c),
				r !== 0,
				getArrayF32FromWasm0(f, o),
			);
		},
		__wbg_uniformMatrix4fv_7c68dee5aee11694: function (a, c, r, f, o) {
			getObject(a).uniformMatrix4fv(
				getObject(c),
				r !== 0,
				getArrayF32FromWasm0(f, o),
			);
		},
		__wbg_uniformMatrix4x2fv_5a8701b552d704af: function (a, c, r, f, o) {
			getObject(a).uniformMatrix4x2fv(
				getObject(c),
				r !== 0,
				getArrayF32FromWasm0(f, o),
			);
		},
		__wbg_uniformMatrix4x3fv_741c3f4e0b2c7e04: function (a, c, r, f, o) {
			getObject(a).uniformMatrix4x3fv(
				getObject(c),
				r !== 0,
				getArrayF32FromWasm0(f, o),
			);
		},
		__wbg_unmap_b819b8b402db13cc: function (a) {
			getObject(a).unmap();
		},
		__wbg_unobserve_397ea595cb8bfdd0: function (a, c) {
			getObject(a).unobserve(getObject(c));
		},
		__wbg_usage_34a9bc47ff4a3feb: function (a) {
			return getObject(a).usage;
		},
		__wbg_useProgram_49b77c7558a0646a: function (a, c) {
			getObject(a).useProgram(getObject(c));
		},
		__wbg_useProgram_5405b431988b837b: function (a, c) {
			getObject(a).useProgram(getObject(c));
		},
		__wbg_userAgentData_31b8f893e8977e94: function (a) {
			const c = getObject(a).userAgentData;
			return isLikeNone(c) ? 0 : addHeapObject(c);
		},
		__wbg_userAgent_161a5f2d2a8dee61: function () {
			return handleError(function (a, c) {
				const r = getObject(c).userAgent,
					f = passStringToWasm0(
						r,
						wasm.__wbindgen_export,
						wasm.__wbindgen_export2,
					),
					o = WASM_VECTOR_LEN;
				getDataViewMemory0().setInt32(a + 4, o, true),
					getDataViewMemory0().setInt32(a + 0, f, true);
			}, arguments);
		},
		__wbg_value_f3d531408c0c70aa: function (a) {
			return getObject(a).value;
		},
		__wbg_vertexAttribDivisorANGLE_b357aa2bf70d3dcf: function (a, c, r) {
			getObject(a).vertexAttribDivisorANGLE(c >>> 0, r >>> 0);
		},
		__wbg_vertexAttribDivisor_99b2fd5affca539d: function (a, c, r) {
			getObject(a).vertexAttribDivisor(c >>> 0, r >>> 0);
		},
		__wbg_vertexAttribIPointer_ecd3baef73ba0965: function (
			a,
			c,
			r,
			f,
			o,
			g,
		) {
			getObject(a).vertexAttribIPointer(c >>> 0, r, f >>> 0, o, g);
		},
		__wbg_vertexAttribPointer_ea73fc4cc5b7d647: function (
			a,
			c,
			r,
			f,
			o,
			g,
			w,
		) {
			getObject(a).vertexAttribPointer(
				c >>> 0,
				r,
				f >>> 0,
				o !== 0,
				g,
				w,
			);
		},
		__wbg_vertexAttribPointer_f63675d7fad431e6: function (
			a,
			c,
			r,
			f,
			o,
			g,
			w,
		) {
			getObject(a).vertexAttribPointer(
				c >>> 0,
				r,
				f >>> 0,
				o !== 0,
				g,
				w,
			);
		},
		__wbg_viewport_63ee76a0f029804d: function (a, c, r, f, o) {
			getObject(a).viewport(c, r, f, o);
		},
		__wbg_viewport_b60aceadb9166023: function (a, c, r, f, o) {
			getObject(a).viewport(c, r, f, o);
		},
		__wbg_visibilityState_8b47c97faee36457: function (a) {
			const c = getObject(a).visibilityState;
			return (__wbindgen_enum_VisibilityState.indexOf(c) + 1 || 3) - 1;
		},
		__wbg_warn_809cad1bfc2b3a42: function (a, c, r, f) {
			console.warn(
				getObject(a),
				getObject(c),
				getObject(r),
				getObject(f),
			);
		},
		__wbg_webkitExitFullscreen_f487871f11a8185e: function (a) {
			getObject(a).webkitExitFullscreen();
		},
		__wbg_webkitFullscreenElement_4055d847f8ff064e: function (a) {
			const c = getObject(a).webkitFullscreenElement;
			return isLikeNone(c) ? 0 : addHeapObject(c);
		},
		__wbg_webkitRequestFullscreen_c4ec4df7be373ffd: function (a) {
			getObject(a).webkitRequestFullscreen();
		},
		__wbg_width_9824c1a2c17d3ebd: function (a) {
			return getObject(a).width;
		},
		__wbg_writeBuffer_c6919ed0c4aaeef5: function () {
			return handleError(function (a, c, r, f, o, g) {
				getObject(a).writeBuffer(getObject(c), r, getObject(f), o, g);
			}, arguments);
		},
		__wbg_writeTexture_340cfbecd9544755: function () {
			return handleError(function (a, c, r, f, o) {
				getObject(a).writeTexture(
					getObject(c),
					getObject(r),
					getObject(f),
					getObject(o),
				);
			}, arguments);
		},
		__wbg_x_663bdb24f78fdb4f: function (a) {
			return getObject(a).x;
		},
		__wbg_y_30a7c06266f44f65: function (a) {
			return getObject(a).y;
		},
		__wbindgen_cast_0000000000000001: function (a, c) {
			const r = makeMutClosure(
				a,
				c,
				wasm.__wasm_bindgen_func_elem_57771,
				__wasm_bindgen_func_elem_57772,
			);
			return addHeapObject(r);
		},
		__wbindgen_cast_0000000000000002: function (a, c) {
			const r = makeMutClosure(
				a,
				c,
				wasm.__wasm_bindgen_func_elem_67722,
				__wasm_bindgen_func_elem_67723,
			);
			return addHeapObject(r);
		},
		__wbindgen_cast_0000000000000003: function (a, c) {
			const r = makeMutClosure(
				a,
				c,
				wasm.__wasm_bindgen_func_elem_10024,
				__wasm_bindgen_func_elem_10025,
			);
			return addHeapObject(r);
		},
		__wbindgen_cast_0000000000000004: function (a, c) {
			const r = makeMutClosure(
				a,
				c,
				wasm.__wasm_bindgen_func_elem_10024,
				__wasm_bindgen_func_elem_10033,
			);
			return addHeapObject(r);
		},
		__wbindgen_cast_0000000000000005: function (a, c) {
			const r = makeMutClosure(
				a,
				c,
				wasm.__wasm_bindgen_func_elem_10024,
				__wasm_bindgen_func_elem_10025_4,
			);
			return addHeapObject(r);
		},
		__wbindgen_cast_0000000000000006: function (a, c) {
			const r = makeMutClosure(
				a,
				c,
				wasm.__wasm_bindgen_func_elem_10024,
				__wasm_bindgen_func_elem_10025_5,
			);
			return addHeapObject(r);
		},
		__wbindgen_cast_0000000000000007: function (a, c) {
			const r = makeMutClosure(
				a,
				c,
				wasm.__wasm_bindgen_func_elem_10024,
				__wasm_bindgen_func_elem_10025_6,
			);
			return addHeapObject(r);
		},
		__wbindgen_cast_0000000000000008: function (a, c) {
			const r = makeMutClosure(
				a,
				c,
				wasm.__wasm_bindgen_func_elem_10024,
				__wasm_bindgen_func_elem_10025_7,
			);
			return addHeapObject(r);
		},
		__wbindgen_cast_0000000000000009: function (a, c) {
			const r = makeMutClosure(
				a,
				c,
				wasm.__wasm_bindgen_func_elem_10024,
				__wasm_bindgen_func_elem_10025_8,
			);
			return addHeapObject(r);
		},
		__wbindgen_cast_000000000000000a: function (a, c) {
			const r = makeMutClosure(
				a,
				c,
				wasm.__wasm_bindgen_func_elem_10024,
				__wasm_bindgen_func_elem_10025_9,
			);
			return addHeapObject(r);
		},
		__wbindgen_cast_000000000000000b: function (a, c) {
			const r = makeMutClosure(
				a,
				c,
				wasm.__wasm_bindgen_func_elem_10024,
				__wasm_bindgen_func_elem_10025_10,
			);
			return addHeapObject(r);
		},
		__wbindgen_cast_000000000000000c: function (a, c) {
			const r = makeMutClosure(
				a,
				c,
				wasm.__wasm_bindgen_func_elem_10024,
				__wasm_bindgen_func_elem_10031,
			);
			return addHeapObject(r);
		},
		__wbindgen_cast_000000000000000d: function (a, c) {
			const r = makeMutClosure(
				a,
				c,
				wasm.__wasm_bindgen_func_elem_10024,
				__wasm_bindgen_func_elem_10037,
			);
			return addHeapObject(r);
		},
		__wbindgen_cast_000000000000000e: function (a, c) {
			const r = makeMutClosure(
				a,
				c,
				wasm.__wasm_bindgen_func_elem_121832,
				__wasm_bindgen_func_elem_121833,
			);
			return addHeapObject(r);
		},
		__wbindgen_cast_000000000000000f: function (a) {
			return addHeapObject(a);
		},
		__wbindgen_cast_0000000000000010: function (a, c) {
			const r = getArrayF32FromWasm0(a, c);
			return addHeapObject(r);
		},
		__wbindgen_cast_0000000000000011: function (a, c) {
			const r = getArrayI16FromWasm0(a, c);
			return addHeapObject(r);
		},
		__wbindgen_cast_0000000000000012: function (a, c) {
			const r = getArrayI32FromWasm0(a, c);
			return addHeapObject(r);
		},
		__wbindgen_cast_0000000000000013: function (a, c) {
			const r = getArrayI8FromWasm0(a, c);
			return addHeapObject(r);
		},
		__wbindgen_cast_0000000000000014: function (a, c) {
			const r = getArrayU16FromWasm0(a, c);
			return addHeapObject(r);
		},
		__wbindgen_cast_0000000000000015: function (a, c) {
			const r = getArrayU32FromWasm0(a, c);
			return addHeapObject(r);
		},
		__wbindgen_cast_0000000000000016: function (a, c) {
			const r = getArrayU8FromWasm0(a, c);
			return addHeapObject(r);
		},
		__wbindgen_cast_0000000000000017: function (a, c) {
			const r = getStringFromWasm0(a, c);
			return addHeapObject(r);
		},
		__wbindgen_object_clone_ref: function (a) {
			const c = getObject(a);
			return addHeapObject(c);
		},
		__wbindgen_object_drop_ref: function (a) {
			takeObject(a);
		},
	};
	return { __proto__: null, './isometric_game_bg.js': import0 };
}
const lAudioContext =
	typeof AudioContext < 'u'
		? AudioContext
		: typeof webkitAudioContext < 'u'
			? webkitAudioContext
			: void 0;
function __wasm_bindgen_func_elem_57772(a, c) {
	wasm.__wasm_bindgen_func_elem_57772(a, c);
}
function __wasm_bindgen_func_elem_10037(a, c) {
	wasm.__wasm_bindgen_func_elem_10037(a, c);
}
function __wasm_bindgen_func_elem_67723(a, c, r) {
	wasm.__wasm_bindgen_func_elem_67723(a, c, addHeapObject(r));
}
function __wasm_bindgen_func_elem_10025(a, c, r) {
	wasm.__wasm_bindgen_func_elem_10025(a, c, addHeapObject(r));
}
function __wasm_bindgen_func_elem_10025_4(a, c, r) {
	wasm.__wasm_bindgen_func_elem_10025_4(a, c, addHeapObject(r));
}
function __wasm_bindgen_func_elem_10025_5(a, c, r) {
	wasm.__wasm_bindgen_func_elem_10025_5(a, c, addHeapObject(r));
}
function __wasm_bindgen_func_elem_10025_6(a, c, r) {
	wasm.__wasm_bindgen_func_elem_10025_6(a, c, addHeapObject(r));
}
function __wasm_bindgen_func_elem_10025_7(a, c, r) {
	wasm.__wasm_bindgen_func_elem_10025_7(a, c, addHeapObject(r));
}
function __wasm_bindgen_func_elem_10025_8(a, c, r) {
	wasm.__wasm_bindgen_func_elem_10025_8(a, c, addHeapObject(r));
}
function __wasm_bindgen_func_elem_10025_9(a, c, r) {
	wasm.__wasm_bindgen_func_elem_10025_9(a, c, addHeapObject(r));
}
function __wasm_bindgen_func_elem_10025_10(a, c, r) {
	wasm.__wasm_bindgen_func_elem_10025_10(a, c, addHeapObject(r));
}
function __wasm_bindgen_func_elem_10031(a, c, r) {
	wasm.__wasm_bindgen_func_elem_10031(
		a,
		c,
		isLikeNone(r) ? 0 : addHeapObject(r),
	);
}
function __wasm_bindgen_func_elem_10033(a, c, r, f) {
	wasm.__wasm_bindgen_func_elem_10033(
		a,
		c,
		addHeapObject(r),
		addHeapObject(f),
	);
}
function __wasm_bindgen_func_elem_121833(a, c, r) {
	try {
		const g = wasm.__wbindgen_add_to_stack_pointer(-16);
		wasm.__wasm_bindgen_func_elem_121833(g, a, c, addHeapObject(r));
		var f = getDataViewMemory0().getInt32(g + 0, true),
			o = getDataViewMemory0().getInt32(g + 4, true);
		if (o) throw takeObject(f);
	} finally {
		wasm.__wbindgen_add_to_stack_pointer(16);
	}
}
const __wbindgen_enum_GamepadMappingType = ['', 'standard'],
	__wbindgen_enum_GpuAddressMode = [
		'clamp-to-edge',
		'repeat',
		'mirror-repeat',
	],
	__wbindgen_enum_GpuBlendFactor = [
		'zero',
		'one',
		'src',
		'one-minus-src',
		'src-alpha',
		'one-minus-src-alpha',
		'dst',
		'one-minus-dst',
		'dst-alpha',
		'one-minus-dst-alpha',
		'src-alpha-saturated',
		'constant',
		'one-minus-constant',
		'src1',
		'one-minus-src1',
		'src1-alpha',
		'one-minus-src1-alpha',
	],
	__wbindgen_enum_GpuBlendOperation = [
		'add',
		'subtract',
		'reverse-subtract',
		'min',
		'max',
	],
	__wbindgen_enum_GpuBufferBindingType = [
		'uniform',
		'storage',
		'read-only-storage',
	],
	__wbindgen_enum_GpuCanvasAlphaMode = ['opaque', 'premultiplied'],
	__wbindgen_enum_GpuCompareFunction = [
		'never',
		'less',
		'equal',
		'less-equal',
		'greater',
		'not-equal',
		'greater-equal',
		'always',
	],
	__wbindgen_enum_GpuCullMode = ['none', 'front', 'back'],
	__wbindgen_enum_GpuErrorFilter = [
		'validation',
		'out-of-memory',
		'internal',
	],
	__wbindgen_enum_GpuFilterMode = ['nearest', 'linear'],
	__wbindgen_enum_GpuFrontFace = ['ccw', 'cw'],
	__wbindgen_enum_GpuIndexFormat = ['uint16', 'uint32'],
	__wbindgen_enum_GpuLoadOp = ['load', 'clear'],
	__wbindgen_enum_GpuMipmapFilterMode = ['nearest', 'linear'],
	__wbindgen_enum_GpuPowerPreference = ['low-power', 'high-performance'],
	__wbindgen_enum_GpuPrimitiveTopology = [
		'point-list',
		'line-list',
		'line-strip',
		'triangle-list',
		'triangle-strip',
	],
	__wbindgen_enum_GpuQueryType = ['occlusion', 'timestamp'],
	__wbindgen_enum_GpuSamplerBindingType = [
		'filtering',
		'non-filtering',
		'comparison',
	],
	__wbindgen_enum_GpuStencilOperation = [
		'keep',
		'zero',
		'replace',
		'invert',
		'increment-clamp',
		'decrement-clamp',
		'increment-wrap',
		'decrement-wrap',
	],
	__wbindgen_enum_GpuStorageTextureAccess = [
		'write-only',
		'read-only',
		'read-write',
	],
	__wbindgen_enum_GpuStoreOp = ['store', 'discard'],
	__wbindgen_enum_GpuTextureAspect = ['all', 'stencil-only', 'depth-only'],
	__wbindgen_enum_GpuTextureDimension = ['1d', '2d', '3d'],
	__wbindgen_enum_GpuTextureFormat = [
		'r8unorm',
		'r8snorm',
		'r8uint',
		'r8sint',
		'r16uint',
		'r16sint',
		'r16float',
		'rg8unorm',
		'rg8snorm',
		'rg8uint',
		'rg8sint',
		'r32uint',
		'r32sint',
		'r32float',
		'rg16uint',
		'rg16sint',
		'rg16float',
		'rgba8unorm',
		'rgba8unorm-srgb',
		'rgba8snorm',
		'rgba8uint',
		'rgba8sint',
		'bgra8unorm',
		'bgra8unorm-srgb',
		'rgb9e5ufloat',
		'rgb10a2uint',
		'rgb10a2unorm',
		'rg11b10ufloat',
		'rg32uint',
		'rg32sint',
		'rg32float',
		'rgba16uint',
		'rgba16sint',
		'rgba16float',
		'rgba32uint',
		'rgba32sint',
		'rgba32float',
		'stencil8',
		'depth16unorm',
		'depth24plus',
		'depth24plus-stencil8',
		'depth32float',
		'depth32float-stencil8',
		'bc1-rgba-unorm',
		'bc1-rgba-unorm-srgb',
		'bc2-rgba-unorm',
		'bc2-rgba-unorm-srgb',
		'bc3-rgba-unorm',
		'bc3-rgba-unorm-srgb',
		'bc4-r-unorm',
		'bc4-r-snorm',
		'bc5-rg-unorm',
		'bc5-rg-snorm',
		'bc6h-rgb-ufloat',
		'bc6h-rgb-float',
		'bc7-rgba-unorm',
		'bc7-rgba-unorm-srgb',
		'etc2-rgb8unorm',
		'etc2-rgb8unorm-srgb',
		'etc2-rgb8a1unorm',
		'etc2-rgb8a1unorm-srgb',
		'etc2-rgba8unorm',
		'etc2-rgba8unorm-srgb',
		'eac-r11unorm',
		'eac-r11snorm',
		'eac-rg11unorm',
		'eac-rg11snorm',
		'astc-4x4-unorm',
		'astc-4x4-unorm-srgb',
		'astc-5x4-unorm',
		'astc-5x4-unorm-srgb',
		'astc-5x5-unorm',
		'astc-5x5-unorm-srgb',
		'astc-6x5-unorm',
		'astc-6x5-unorm-srgb',
		'astc-6x6-unorm',
		'astc-6x6-unorm-srgb',
		'astc-8x5-unorm',
		'astc-8x5-unorm-srgb',
		'astc-8x6-unorm',
		'astc-8x6-unorm-srgb',
		'astc-8x8-unorm',
		'astc-8x8-unorm-srgb',
		'astc-10x5-unorm',
		'astc-10x5-unorm-srgb',
		'astc-10x6-unorm',
		'astc-10x6-unorm-srgb',
		'astc-10x8-unorm',
		'astc-10x8-unorm-srgb',
		'astc-10x10-unorm',
		'astc-10x10-unorm-srgb',
		'astc-12x10-unorm',
		'astc-12x10-unorm-srgb',
		'astc-12x12-unorm',
		'astc-12x12-unorm-srgb',
	],
	__wbindgen_enum_GpuTextureSampleType = [
		'float',
		'unfilterable-float',
		'depth',
		'sint',
		'uint',
	],
	__wbindgen_enum_GpuTextureViewDimension = [
		'1d',
		'2d',
		'2d-array',
		'cube',
		'cube-array',
		'3d',
	],
	__wbindgen_enum_GpuVertexFormat = [
		'uint8',
		'uint8x2',
		'uint8x4',
		'sint8',
		'sint8x2',
		'sint8x4',
		'unorm8',
		'unorm8x2',
		'unorm8x4',
		'snorm8',
		'snorm8x2',
		'snorm8x4',
		'uint16',
		'uint16x2',
		'uint16x4',
		'sint16',
		'sint16x2',
		'sint16x4',
		'unorm16',
		'unorm16x2',
		'unorm16x4',
		'snorm16',
		'snorm16x2',
		'snorm16x4',
		'float16',
		'float16x2',
		'float16x4',
		'float32',
		'float32x2',
		'float32x3',
		'float32x4',
		'uint32',
		'uint32x2',
		'uint32x3',
		'uint32x4',
		'sint32',
		'sint32x2',
		'sint32x3',
		'sint32x4',
		'unorm10-10-10-2',
		'unorm8x4-bgra',
	],
	__wbindgen_enum_GpuVertexStepMode = ['vertex', 'instance'],
	__wbindgen_enum_PremultiplyAlpha = ['none', 'premultiply', 'default'],
	__wbindgen_enum_ResizeObserverBoxOptions = [
		'border-box',
		'content-box',
		'device-pixel-content-box',
	],
	__wbindgen_enum_VisibilityState = ['hidden', 'visible'];
function addHeapObject(a) {
	heap_next === heap.length && heap.push(heap.length + 1);
	const c = heap_next;
	return (heap_next = heap[c]), (heap[c] = a), c;
}
const CLOSURE_DTORS =
	typeof FinalizationRegistry > 'u'
		? { register: () => {}, unregister: () => {} }
		: new FinalizationRegistry((a) => a.dtor(a.a, a.b));
function debugString(a) {
	const c = typeof a;
	if (c == 'number' || c == 'boolean' || a == null) return `${a}`;
	if (c == 'string') return `"${a}"`;
	if (c == 'symbol') {
		const o = a.description;
		return o == null ? 'Symbol' : `Symbol(${o})`;
	}
	if (c == 'function') {
		const o = a.name;
		return typeof o == 'string' && o.length > 0
			? `Function(${o})`
			: 'Function';
	}
	if (Array.isArray(a)) {
		const o = a.length;
		let g = '[';
		o > 0 && (g += debugString(a[0]));
		for (let w = 1; w < o; w++) g += ', ' + debugString(a[w]);
		return (g += ']'), g;
	}
	const r = /\[object ([^\]]+)\]/.exec(toString.call(a));
	let f;
	if (r && r.length > 1) f = r[1];
	else return toString.call(a);
	if (f == 'Object')
		try {
			return 'Object(' + JSON.stringify(a) + ')';
		} catch {
			return 'Object';
		}
	return a instanceof Error
		? `${a.name}: ${a.message}
${a.stack}`
		: f;
}
function dropObject(a) {
	a < 1028 || ((heap[a] = heap_next), (heap_next = a));
}
function getArrayF32FromWasm0(a, c) {
	return (a = a >>> 0), getFloat32ArrayMemory0().subarray(a / 4, a / 4 + c);
}
function getArrayI16FromWasm0(a, c) {
	return (a = a >>> 0), getInt16ArrayMemory0().subarray(a / 2, a / 2 + c);
}
function getArrayI32FromWasm0(a, c) {
	return (a = a >>> 0), getInt32ArrayMemory0().subarray(a / 4, a / 4 + c);
}
function getArrayI8FromWasm0(a, c) {
	return (a = a >>> 0), getInt8ArrayMemory0().subarray(a / 1, a / 1 + c);
}
function getArrayU16FromWasm0(a, c) {
	return (a = a >>> 0), getUint16ArrayMemory0().subarray(a / 2, a / 2 + c);
}
function getArrayU32FromWasm0(a, c) {
	return (a = a >>> 0), getUint32ArrayMemory0().subarray(a / 4, a / 4 + c);
}
function getArrayU8FromWasm0(a, c) {
	return (a = a >>> 0), getUint8ArrayMemory0().subarray(a / 1, a / 1 + c);
}
function getClampedArrayU8FromWasm0(a, c) {
	return (
		(a = a >>> 0), getUint8ClampedArrayMemory0().subarray(a / 1, a / 1 + c)
	);
}
let cachedDataViewMemory0 = null;
function getDataViewMemory0() {
	return (
		(cachedDataViewMemory0 === null ||
			cachedDataViewMemory0.buffer.detached === true ||
			(cachedDataViewMemory0.buffer.detached === void 0 &&
				cachedDataViewMemory0.buffer !== wasm.memory.buffer)) &&
			(cachedDataViewMemory0 = new DataView(wasm.memory.buffer)),
		cachedDataViewMemory0
	);
}
let cachedFloat32ArrayMemory0 = null;
function getFloat32ArrayMemory0() {
	return (
		(cachedFloat32ArrayMemory0 === null ||
			cachedFloat32ArrayMemory0.byteLength === 0) &&
			(cachedFloat32ArrayMemory0 = new Float32Array(wasm.memory.buffer)),
		cachedFloat32ArrayMemory0
	);
}
let cachedInt16ArrayMemory0 = null;
function getInt16ArrayMemory0() {
	return (
		(cachedInt16ArrayMemory0 === null ||
			cachedInt16ArrayMemory0.byteLength === 0) &&
			(cachedInt16ArrayMemory0 = new Int16Array(wasm.memory.buffer)),
		cachedInt16ArrayMemory0
	);
}
let cachedInt32ArrayMemory0 = null;
function getInt32ArrayMemory0() {
	return (
		(cachedInt32ArrayMemory0 === null ||
			cachedInt32ArrayMemory0.byteLength === 0) &&
			(cachedInt32ArrayMemory0 = new Int32Array(wasm.memory.buffer)),
		cachedInt32ArrayMemory0
	);
}
let cachedInt8ArrayMemory0 = null;
function getInt8ArrayMemory0() {
	return (
		(cachedInt8ArrayMemory0 === null ||
			cachedInt8ArrayMemory0.byteLength === 0) &&
			(cachedInt8ArrayMemory0 = new Int8Array(wasm.memory.buffer)),
		cachedInt8ArrayMemory0
	);
}
function getStringFromWasm0(a, c) {
	return (a = a >>> 0), decodeText(a, c);
}
let cachedUint16ArrayMemory0 = null;
function getUint16ArrayMemory0() {
	return (
		(cachedUint16ArrayMemory0 === null ||
			cachedUint16ArrayMemory0.byteLength === 0) &&
			(cachedUint16ArrayMemory0 = new Uint16Array(wasm.memory.buffer)),
		cachedUint16ArrayMemory0
	);
}
let cachedUint32ArrayMemory0 = null;
function getUint32ArrayMemory0() {
	return (
		(cachedUint32ArrayMemory0 === null ||
			cachedUint32ArrayMemory0.byteLength === 0) &&
			(cachedUint32ArrayMemory0 = new Uint32Array(wasm.memory.buffer)),
		cachedUint32ArrayMemory0
	);
}
let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
	return (
		(cachedUint8ArrayMemory0 === null ||
			cachedUint8ArrayMemory0.byteLength === 0) &&
			(cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer)),
		cachedUint8ArrayMemory0
	);
}
let cachedUint8ClampedArrayMemory0 = null;
function getUint8ClampedArrayMemory0() {
	return (
		(cachedUint8ClampedArrayMemory0 === null ||
			cachedUint8ClampedArrayMemory0.byteLength === 0) &&
			(cachedUint8ClampedArrayMemory0 = new Uint8ClampedArray(
				wasm.memory.buffer,
			)),
		cachedUint8ClampedArrayMemory0
	);
}
function getObject(a) {
	return heap[a];
}
function handleError(a, c) {
	try {
		return a.apply(this, c);
	} catch (r) {
		wasm.__wbindgen_export3(addHeapObject(r));
	}
}
let heap = new Array(1024).fill(void 0);
heap.push(void 0, null, true, false);
let heap_next = heap.length;
function isLikeNone(a) {
	return a == null;
}
function makeMutClosure(a, c, r, f) {
	const o = { a, b: c, cnt: 1, dtor: r },
		g = (...w) => {
			o.cnt++;
			const T = o.a;
			o.a = 0;
			try {
				return f(T, o.b, ...w);
			} finally {
				(o.a = T), g._wbg_cb_unref();
			}
		};
	return (
		(g._wbg_cb_unref = () => {
			--o.cnt === 0 &&
				(o.dtor(o.a, o.b), (o.a = 0), CLOSURE_DTORS.unregister(o));
		}),
		CLOSURE_DTORS.register(g, o, o),
		g
	);
}
function passStringToWasm0(a, c, r) {
	if (r === void 0) {
		const T = cachedTextEncoder.encode(a),
			S = c(T.length, 1) >>> 0;
		return (
			getUint8ArrayMemory0()
				.subarray(S, S + T.length)
				.set(T),
			(WASM_VECTOR_LEN = T.length),
			S
		);
	}
	let f = a.length,
		o = c(f, 1) >>> 0;
	const g = getUint8ArrayMemory0();
	let w = 0;
	for (; w < f; w++) {
		const T = a.charCodeAt(w);
		if (T > 127) break;
		g[o + w] = T;
	}
	if (w !== f) {
		w !== 0 && (a = a.slice(w)),
			(o = r(o, f, (f = w + a.length * 3), 1) >>> 0);
		const T = getUint8ArrayMemory0().subarray(o + w, o + f),
			S = cachedTextEncoder.encodeInto(a, T);
		(w += S.written), (o = r(o, f, w, 1) >>> 0);
	}
	return (WASM_VECTOR_LEN = w), o;
}
function takeObject(a) {
	const c = getObject(a);
	return dropObject(a), c;
}
let cachedTextDecoder = new TextDecoder('utf-8', {
	ignoreBOM: true,
	fatal: true,
});
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(a, c) {
	return (
		(numBytesDecoded += c),
		numBytesDecoded >= MAX_SAFARI_DECODE_BYTES &&
			((cachedTextDecoder = new TextDecoder('utf-8', {
				ignoreBOM: true,
				fatal: true,
			})),
			cachedTextDecoder.decode(),
			(numBytesDecoded = c)),
		cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(a, a + c))
	);
}
const cachedTextEncoder = new TextEncoder();
'encodeInto' in cachedTextEncoder ||
	(cachedTextEncoder.encodeInto = function (a, c) {
		const r = cachedTextEncoder.encode(a);
		return c.set(r), { read: a.length, written: r.length };
	});
let WASM_VECTOR_LEN = 0,
	wasm;
function __wbg_finalize_init(a, c) {
	return (
		(wasm = a.exports),
		(cachedDataViewMemory0 = null),
		(cachedFloat32ArrayMemory0 = null),
		(cachedInt16ArrayMemory0 = null),
		(cachedInt32ArrayMemory0 = null),
		(cachedInt8ArrayMemory0 = null),
		(cachedUint16ArrayMemory0 = null),
		(cachedUint32ArrayMemory0 = null),
		(cachedUint8ArrayMemory0 = null),
		(cachedUint8ClampedArrayMemory0 = null),
		wasm.__wbindgen_start(),
		wasm
	);
}
async function __wbg_load(a, c) {
	if (typeof Response == 'function' && a instanceof Response) {
		if (typeof WebAssembly.instantiateStreaming == 'function')
			try {
				return await WebAssembly.instantiateStreaming(a, c);
			} catch (o) {
				if (
					a.ok &&
					r(a.type) &&
					a.headers.get('Content-Type') !== 'application/wasm'
				)
					console.warn(
						'`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n',
						o,
					);
				else throw o;
			}
		const f = await a.arrayBuffer();
		return await WebAssembly.instantiate(f, c);
	} else {
		const f = await WebAssembly.instantiate(a, c);
		return f instanceof WebAssembly.Instance
			? { instance: f, module: a }
			: f;
	}
	function r(f) {
		switch (f) {
			case 'basic':
			case 'cors':
			case 'default':
				return true;
		}
		return false;
	}
}
async function __wbg_init(a) {
	if (wasm !== void 0) return wasm;
	a !== void 0 &&
		(Object.getPrototypeOf(a) === Object.prototype
			? ({ module_or_path: a } = a)
			: console.warn(
					'using deprecated parameters for the initialization function; pass a single object instead',
				)),
		a === void 0 &&
			(a = new URL(
				'/isometric/assets/isometric_game_bg.wasm',
				import.meta.url,
			));
	const c = __wbg_get_imports();
	(typeof a == 'string' ||
		(typeof Request == 'function' && a instanceof Request) ||
		(typeof URL == 'function' && a instanceof URL)) &&
		(a = fetch(a));
	const { instance: r, module: f } = await __wbg_load(await a, c);
	return __wbg_finalize_init(r);
}
const isometric_game = Object.freeze(
	Object.defineProperty(
		{
			__proto__: null,
			default: __wbg_init,
			get_fps,
			get_player_state_json,
			get_selected_object_json,
		},
		Symbol.toStringTag,
		{ value: 'Module' },
	),
);
function GlassPanel({ children: a, className: c = '' }) {
	return jsxRuntimeExports.jsx('div', {
		className: `bg-glass backdrop-blur-[4px] rounded-glass border border-glass-border shadow-glass pointer-events-auto ${c}`,
		children: a,
	});
}
function ProgressBar({ value: a, max: c, color: r, label: f }) {
	const o = c > 0 ? (a / c) * 100 : 0;
	return jsxRuntimeExports.jsxs('div', {
		className: 'mb-1.5 md:mb-2',
		children: [
			jsxRuntimeExports.jsxs('div', {
				className: 'text-[8px] md:text-[10px] mb-0.5',
				children: [f, ': ', a, '/', c],
			}),
			jsxRuntimeExports.jsx('div', {
				className:
					'w-[140px] md:w-[200px] h-3 md:h-5 bg-slot border-2 border-panel-border-dark overflow-hidden',
				children: jsxRuntimeExports.jsx('div', {
					className: `h-full ${r} transition-[width] duration-300 ease-out`,
					style: { width: `${o}%` },
				}),
			}),
		],
	});
}
function HUD() {
	const [a, c] = reactExports.useState(null);
	return (
		reactExports.useEffect(() => {
			const r = setInterval(() => {
				try {
					const f = get_player_state_json();
					f && c(JSON.parse(f));
				} catch {}
			}, 250);
			return () => clearInterval(r);
		}, []),
		a
			? jsxRuntimeExports.jsxs(GlassPanel, {
					className:
						'absolute bottom-4 left-4 md:bottom-6 md:left-6 px-3 py-2 md:px-4 md:py-3',
					children: [
						jsxRuntimeExports.jsx(ProgressBar, {
							label: 'HP',
							value: a.health,
							max: a.max_health,
							color: 'bg-hp',
						}),
						jsxRuntimeExports.jsx(ProgressBar, {
							label: 'MP',
							value: a.mana,
							max: a.max_mana,
							color: 'bg-mp',
						}),
						jsxRuntimeExports.jsxs('div', {
							className:
								'text-[7px] md:text-[9px] text-text-muted mt-1',
							children: [
								'Pos: ',
								a.position.map((r) => r.toFixed(1)).join(', '),
							],
						}),
					],
				})
			: null
	);
}
const GRID_COLS = 4,
	GRID_ROWS = 4;
function Inventory() {
	const a = Array.from({ length: GRID_COLS * GRID_ROWS });
	return jsxRuntimeExports.jsx('div', {
		className:
			'absolute bottom-4 right-4 md:bottom-6 md:right-6 pointer-events-auto',
		children: jsxRuntimeExports.jsx('div', {
			className:
				'border-[3px] border-panel-border shadow-[0_0_0_1px_#1a1008,0_4px_12px_rgba(0,0,0,0.6)]',
			children: jsxRuntimeExports.jsxs('div', {
				className:
					'border-2 border-[#1a1008] bg-panel-inner p-2 md:p-3',
				children: [
					jsxRuntimeExports.jsx('div', {
						className:
							'text-[7px] md:text-[10px] mb-1.5 md:mb-2 text-center text-[#c8a832]',
						children: 'Inventory',
					}),
					jsxRuntimeExports.jsx('div', {
						className:
							'p-1 md:p-1.5 bg-[#1e1408] border border-[#5a4a2a]',
						children: jsxRuntimeExports.jsx('div', {
							className: 'grid grid-cols-4 gap-px md:gap-0.5',
							children: a.map((c, r) =>
								jsxRuntimeExports.jsx(
									'div',
									{
										className: `w-7 h-7 md:w-11 md:h-11 bg-[#261a0a] border border-[#3d2b14]
										shadow-[inset_0_1px_2px_rgba(0,0,0,0.4)]`,
									},
									r,
								),
							),
						}),
					}),
				],
			}),
		}),
	});
}
function FPSCounter() {
	const [a, c] = reactExports.useState(0);
	return (
		reactExports.useEffect(() => {
			const r = setInterval(() => {
				try {
					c(get_fps());
				} catch {}
			}, 1e3);
			return () => clearInterval(r);
		}, []),
		jsxRuntimeExports.jsxs('div', {
			className:
				'absolute top-2 right-2 md:top-3 md:right-3 px-2 py-1 md:px-3 md:py-1.5 bg-panel border border-panel-border text-[7px] md:text-[10px] text-text-muted pointer-events-auto',
			children: [a, ' FPS'],
		})
	);
}
const MODAL_CLOSE_DISTANCE = 6,
	ACTION_DISTANCE = 3;
function xzDistance(a, c) {
	const r = a[0] - c[0],
		f = a[2] - c[2];
	return Math.sqrt(r * r + f * f);
}
function getPlayerPosition() {
	try {
		const a = get_player_state_json();
		return a ? JSON.parse(a).position : null;
	} catch {
		return null;
	}
}
const OBJECT_INFO = {
		tree: {
			title: 'Tree',
			description: 'A sturdy tree with rough bark.',
			action: 'Chop Tree',
		},
		crate: {
			title: 'Wooden Crate',
			description: 'A wooden crate. Might contain something.',
			action: 'Open Crate',
		},
		crystal: {
			title: 'Crystal',
			description: 'A glowing crystal pulsing with energy.',
			action: 'Mine Crystal',
		},
		pillar: {
			title: 'Stone Pillar',
			description: 'An ancient stone pillar.',
			action: 'Examine',
		},
		sphere: {
			title: 'Metallic Sphere',
			description: 'A mysterious metallic sphere.',
			action: 'Examine',
		},
		flower: {
			title: 'Flower',
			description: 'A beautiful flower.',
			action: 'Collect Flower',
		},
	},
	FLOWER_INFO = {
		tulip: {
			title: 'Tulip',
			description: 'A vibrant tulip with soft petals.',
		},
		daisy: {
			title: 'Daisy',
			description: 'A cheerful white daisy swaying gently.',
		},
		lavender: {
			title: 'Lavender',
			description: 'A fragrant lavender sprig.',
		},
		bell: {
			title: 'Bellflower',
			description: 'A delicate bellflower with drooping petals.',
		},
		wildflower: {
			title: 'Wildflower',
			description: 'A bright wildflower growing freely.',
		},
	};
function ActionContent({ info: a, objectPos: c }) {
	return jsxRuntimeExports.jsxs('div', {
		className: 'space-y-2 md:space-y-3',
		children: [
			jsxRuntimeExports.jsx('div', {
				className:
					'px-2 py-1.5 md:px-3 md:py-2 bg-[#1e1408] border border-[#5a4a2a]',
				children: jsxRuntimeExports.jsx('p', {
					className:
						'text-[8px] md:text-xs text-text leading-relaxed',
					children: a.description,
				}),
			}),
			jsxRuntimeExports.jsx('div', {
				className: 'flex justify-center pt-1',
				children: jsxRuntimeExports.jsx('button', {
					className: `px-4 py-1.5 md:px-6 md:py-2 text-[8px] md:text-xs text-text
						bg-btn border-2 border-btn-border
						shadow-[inset_0_1px_0_rgba(255,255,255,0.15),0_2px_0_#1a3a10]
						hover:bg-btn-hover active:bg-btn-active active:shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]
						transition-colors cursor-pointer`,
					onClick: () => {
						const r = getPlayerPosition();
						if (r && xzDistance(r, c) > ACTION_DISTANCE) {
							gameEvents.emit('toast:show', {
								message: 'You are too far away.',
								severity: 'warning',
							}),
								gameEvents.emit('modal:close');
							return;
						}
						gameEvents.emit('toast:show', {
							message: `${a.action}: ${a.title}`,
							severity: 'info',
						}),
							gameEvents.emit('modal:close');
					},
					children: a.action,
				}),
			}),
		],
	});
}
function useObjectSelection() {
	const a = reactExports.useRef(false),
		c = reactExports.useRef(null);
	reactExports.useEffect(() => {
		const r = setInterval(() => {
				if (!a.current)
					try {
						const o = get_selected_object_json();
						if (!o) return;
						const g = JSON.parse(o);
						let w = OBJECT_INFO[g.kind];
						if (!w) return;
						if (g.kind === 'flower' && g.sub_kind) {
							const T = FLOWER_INFO[g.sub_kind];
							T &&
								(w = {
									...w,
									title: T.title,
									description: T.description,
								});
						}
						(a.current = true),
							(c.current = g.position),
							gameEvents.emit('modal:open', {
								title: w.title,
								size: 'sm',
								content: jsxRuntimeExports.jsx(ActionContent, {
									info: w,
									objectPos: g.position,
								}),
								onClose: () => {
									(a.current = false), (c.current = null);
								},
							});
					} catch {}
			}, 100),
			f = setInterval(() => {
				if (!a.current || !c.current) return;
				const o = getPlayerPosition();
				o &&
					xzDistance(o, c.current) > MODAL_CLOSE_DISTANCE &&
					gameEvents.emit('modal:close');
			}, 250);
		return () => {
			clearInterval(r), clearInterval(f);
		};
	}, []);
}
function App() {
	return (
		useObjectSelection(),
		jsxRuntimeExports.jsxs('div', {
			className:
				'fixed inset-0 pointer-events-none font-game text-text rpg-text-shadow',
			children: [
				jsxRuntimeExports.jsx(FPSCounter, {}),
				jsxRuntimeExports.jsx(HUD, {}),
				jsxRuntimeExports.jsx(Inventory, {}),
			],
		})
	);
}
async function bootstrap() {
	if (!navigator.gpu) {
		const c = document.getElementById('root');
		c &&
			((c.innerHTML =
				'<div style="color:#fff;padding:2rem;text-align:center"><h2>WebGPU Not Available</h2><p>This browser does not support WebGPU (Chrome 113+, Edge 113+, Safari 18+).</p></div>'),
			(c.style.pointerEvents = 'auto'));
		return;
	}
	const { default: a } = await __vitePreload(
		async () => {
			const { default: c } = await Promise.resolve().then(
				() => isometric_game,
			);
			return { default: c };
		},
		void 0,
	);
	await a(),
		ReactDOM.createRoot(document.getElementById('root')).render(
			jsxRuntimeExports.jsx(React.StrictMode, {
				children: jsxRuntimeExports.jsx(GameUIProvider, {
					children: jsxRuntimeExports.jsx(App, {}),
				}),
			}),
		);
}
bootstrap().catch(console.error);
