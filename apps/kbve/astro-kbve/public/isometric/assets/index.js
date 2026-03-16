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
	for (const _ of document.querySelectorAll('link[rel="modulepreload"]'))
		f(_);
	new MutationObserver((_) => {
		for (const b of _)
			if (b.type === 'childList')
				for (const y of b.addedNodes)
					y.tagName === 'LINK' && y.rel === 'modulepreload' && f(y);
	}).observe(document, { childList: true, subtree: true });
	function i(_) {
		const b = {};
		return (
			_.integrity && (b.integrity = _.integrity),
			_.referrerPolicy && (b.referrerPolicy = _.referrerPolicy),
			_.crossOrigin === 'use-credentials'
				? (b.credentials = 'include')
				: _.crossOrigin === 'anonymous'
					? (b.credentials = 'omit')
					: (b.credentials = 'same-origin'),
			b
		);
	}
	function f(_) {
		if (_.ep) return;
		_.ep = true;
		const b = i(_);
		fetch(_.href, b);
	}
})();
const scriptRel = 'modulepreload',
	assetsURL = function (a) {
		return '/isometric/' + a;
	},
	seen = {},
	__vitePreload = function (c, i, f) {
		let _ = Promise.resolve();
		if (i && i.length > 0) {
			let y = function (p) {
				return Promise.all(
					p.map((z) =>
						Promise.resolve(z).then(
							(R) => ({ status: 'fulfilled', value: R }),
							(R) => ({ status: 'rejected', reason: R }),
						),
					),
				);
			};
			document.getElementsByTagName('link');
			const x = document.querySelector('meta[property=csp-nonce]'),
				v =
					(x == null ? void 0 : x.nonce) ||
					(x == null ? void 0 : x.getAttribute('nonce'));
			_ = y(
				i.map((p) => {
					if (((p = assetsURL(p)), p in seen)) return;
					seen[p] = true;
					const z = p.endsWith('.css'),
						R = z ? '[rel="stylesheet"]' : '';
					if (document.querySelector(`link[href="${p}"]${R}`)) return;
					const J = document.createElement('link');
					if (
						((J.rel = z ? 'stylesheet' : scriptRel),
						z || (J.as = 'script'),
						(J.crossOrigin = ''),
						(J.href = p),
						v && J.setAttribute('nonce', v),
						document.head.appendChild(J),
						z)
					)
						return new Promise((Ce, De) => {
							J.addEventListener('load', Ce),
								J.addEventListener('error', () =>
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
		function b(y) {
			const x = new Event('vite:preloadError', { cancelable: true });
			if (((x.payload = y), window.dispatchEvent(x), !x.defaultPrevented))
				throw y;
		}
		return _.then((y) => {
			for (const x of y || []) x.status === 'rejected' && b(x.reason);
			return c().catch(b);
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
	function i(f, _, b) {
		var y = null;
		if (
			(b !== void 0 && (y = '' + b),
			_.key !== void 0 && (y = '' + _.key),
			'key' in _)
		) {
			b = {};
			for (var x in _) x !== 'key' && (b[x] = _[x]);
		} else b = _;
		return (
			(_ = b.ref),
			{
				$$typeof: a,
				type: f,
				key: y,
				ref: _ !== void 0 ? _ : null,
				props: b,
			}
		);
	}
	return (
		(reactJsxRuntime_production.Fragment = c),
		(reactJsxRuntime_production.jsx = i),
		(reactJsxRuntime_production.jsxs = i),
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
		i = Symbol.for('react.fragment'),
		f = Symbol.for('react.strict_mode'),
		_ = Symbol.for('react.profiler'),
		b = Symbol.for('react.consumer'),
		y = Symbol.for('react.context'),
		x = Symbol.for('react.forward_ref'),
		v = Symbol.for('react.suspense'),
		p = Symbol.for('react.memo'),
		z = Symbol.for('react.lazy'),
		R = Symbol.for('react.activity'),
		J = Symbol.iterator;
	function Ce(m) {
		return m === null || typeof m != 'object'
			? null
			: ((m = (J && m[J]) || m['@@iterator']),
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
		ze = Object.assign,
		St = {};
	function Fe(m, D, H) {
		(this.props = m),
			(this.context = D),
			(this.refs = St),
			(this.updater = H || De);
	}
	(Fe.prototype.isReactComponent = {}),
		(Fe.prototype.setState = function (m, D) {
			if (typeof m != 'object' && typeof m != 'function' && m != null)
				throw Error(
					'takes an object of state variables to update or a function which returns an object of state variables.',
				);
			this.updater.enqueueSetState(this, m, D, 'setState');
		}),
		(Fe.prototype.forceUpdate = function (m) {
			this.updater.enqueueForceUpdate(this, m, 'forceUpdate');
		});
	function Zt() {}
	Zt.prototype = Fe.prototype;
	function Re(m, D, H) {
		(this.props = m),
			(this.context = D),
			(this.refs = St),
			(this.updater = H || De);
	}
	var at = (Re.prototype = new Zt());
	(at.constructor = Re),
		ze(at, Fe.prototype),
		(at.isPureReactComponent = true);
	var Ot = Array.isArray;
	function Ue() {}
	var k = { H: null, A: null, T: null, S: null },
		Be = Object.prototype.hasOwnProperty;
	function yt(m, D, H) {
		var U = H.ref;
		return {
			$$typeof: a,
			type: m,
			key: D,
			ref: U !== void 0 ? U : null,
			props: H,
		};
	}
	function Ln(m, D) {
		return yt(m.type, D, m.props);
	}
	function jt(m) {
		return typeof m == 'object' && m !== null && m.$$typeof === a;
	}
	function Le(m) {
		var D = { '=': '=0', ':': '=2' };
		return (
			'$' +
			m.replace(/[=:]/g, function (H) {
				return D[H];
			})
		);
	}
	var On = /\/+/g;
	function Et(m, D) {
		return typeof m == 'object' && m !== null && m.key != null
			? Le('' + m.key)
			: D.toString(36);
	}
	function dt(m) {
		switch (m.status) {
			case 'fulfilled':
				return m.value;
			case 'rejected':
				throw m.reason;
			default:
				switch (
					(typeof m.status == 'string'
						? m.then(Ue, Ue)
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
	function A(m, D, H, U, V) {
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
						case z:
							return (
								(te = m._init), A(te(m._payload), D, H, U, V)
							);
					}
			}
		if (te)
			return (
				(V = V(m)),
				(te = U === '' ? '.' + Et(m, 0) : U),
				Ot(V)
					? ((H = ''),
						te != null && (H = te.replace(On, '$&/') + '/'),
						A(V, D, H, '', function (va) {
							return va;
						}))
					: V != null &&
						(jt(V) &&
							(V = Ln(
								V,
								H +
									(V.key == null || (m && m.key === V.key)
										? ''
										: ('' + V.key).replace(On, '$&/') +
											'/') +
									te,
							)),
						D.push(V)),
				1
			);
		te = 0;
		var He = U === '' ? '.' : U + ':';
		if (Ot(m))
			for (var ge = 0; ge < m.length; ge++)
				(U = m[ge]), (Q = He + Et(U, ge)), (te += A(U, D, H, Q, V));
		else if (((ge = Ce(m)), typeof ge == 'function'))
			for (m = ge.call(m), ge = 0; !(U = m.next()).done; )
				(U = U.value), (Q = He + Et(U, ge++)), (te += A(U, D, H, Q, V));
		else if (Q === 'object') {
			if (typeof m.then == 'function') return A(dt(m), D, H, U, V);
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
	function C(m, D, H) {
		if (m == null) return m;
		var U = [],
			V = 0;
		return (
			A(m, U, '', '', function (Q) {
				return D.call(H, Q, V++);
			}),
			U
		);
	}
	function q(m) {
		if (m._status === -1) {
			var D = m._result;
			(D = D()),
				D.then(
					function (H) {
						(m._status === 0 || m._status === -1) &&
							((m._status = 1), (m._result = H));
					},
					function (H) {
						(m._status === 0 || m._status === -1) &&
							((m._status = 2), (m._result = H));
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
			map: C,
			forEach: function (m, D, H) {
				C(
					m,
					function () {
						D.apply(this, arguments);
					},
					H,
				);
			},
			count: function (m) {
				var D = 0;
				return (
					C(m, function () {
						D++;
					}),
					D
				);
			},
			toArray: function (m) {
				return (
					C(m, function (D) {
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
		(react_production.Activity = R),
		(react_production.Children = re),
		(react_production.Component = Fe),
		(react_production.Fragment = i),
		(react_production.Profiler = _),
		(react_production.PureComponent = Re),
		(react_production.StrictMode = f),
		(react_production.Suspense = v),
		(react_production.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE =
			k),
		(react_production.__COMPILER_RUNTIME = {
			__proto__: null,
			c: function (m) {
				return k.H.useMemoCache(m);
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
		(react_production.cloneElement = function (m, D, H) {
			if (m == null)
				throw Error(
					'The argument must be a React element, but you passed ' +
						m +
						'.',
				);
			var U = ze({}, m.props),
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
			if (Q === 1) U.children = H;
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
					$$typeof: y,
					_currentValue: m,
					_currentValue2: m,
					_threadCount: 0,
					Provider: null,
					Consumer: null,
				}),
				(m.Provider = m),
				(m.Consumer = { $$typeof: b, _context: m }),
				m
			);
		}),
		(react_production.createElement = function (m, D, H) {
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
			if (te === 1) V.children = H;
			else if (1 < te) {
				for (var He = Array(te), ge = 0; ge < te; ge++)
					He[ge] = arguments[ge + 2];
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
			return { $$typeof: x, render: m };
		}),
		(react_production.isValidElement = jt),
		(react_production.lazy = function (m) {
			return {
				$$typeof: z,
				_payload: { _status: -1, _result: m },
				_init: q,
			};
		}),
		(react_production.memo = function (m, D) {
			return { $$typeof: p, type: m, compare: D === void 0 ? null : D };
		}),
		(react_production.startTransition = function (m) {
			var D = k.T,
				H = {};
			k.T = H;
			try {
				var U = m(),
					V = k.S;
				V !== null && V(H, U),
					typeof U == 'object' &&
						U !== null &&
						typeof U.then == 'function' &&
						U.then(Ue, ce);
			} catch (Q) {
				ce(Q);
			} finally {
				D !== null && H.types !== null && (D.types = H.types),
					(k.T = D);
			}
		}),
		(react_production.unstable_useCacheRefresh = function () {
			return k.H.useCacheRefresh();
		}),
		(react_production.use = function (m) {
			return k.H.use(m);
		}),
		(react_production.useActionState = function (m, D, H) {
			return k.H.useActionState(m, D, H);
		}),
		(react_production.useCallback = function (m, D) {
			return k.H.useCallback(m, D);
		}),
		(react_production.useContext = function (m) {
			return k.H.useContext(m);
		}),
		(react_production.useDebugValue = function () {}),
		(react_production.useDeferredValue = function (m, D) {
			return k.H.useDeferredValue(m, D);
		}),
		(react_production.useEffect = function (m, D) {
			return k.H.useEffect(m, D);
		}),
		(react_production.useEffectEvent = function (m) {
			return k.H.useEffectEvent(m);
		}),
		(react_production.useId = function () {
			return k.H.useId();
		}),
		(react_production.useImperativeHandle = function (m, D, H) {
			return k.H.useImperativeHandle(m, D, H);
		}),
		(react_production.useInsertionEffect = function (m, D) {
			return k.H.useInsertionEffect(m, D);
		}),
		(react_production.useLayoutEffect = function (m, D) {
			return k.H.useLayoutEffect(m, D);
		}),
		(react_production.useMemo = function (m, D) {
			return k.H.useMemo(m, D);
		}),
		(react_production.useOptimistic = function (m, D) {
			return k.H.useOptimistic(m, D);
		}),
		(react_production.useReducer = function (m, D, H) {
			return k.H.useReducer(m, D, H);
		}),
		(react_production.useRef = function (m) {
			return k.H.useRef(m);
		}),
		(react_production.useState = function (m) {
			return k.H.useState(m);
		}),
		(react_production.useSyncExternalStore = function (m, D, H) {
			return k.H.useSyncExternalStore(m, D, H);
		}),
		(react_production.useTransition = function () {
			return k.H.useTransition();
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
				function c(A, C) {
					var q = A.length;
					A.push(C);
					e: for (; 0 < q; ) {
						var ce = (q - 1) >>> 1,
							re = A[ce];
						if (0 < _(re, C)) (A[ce] = C), (A[q] = re), (q = ce);
						else break e;
					}
				}
				function i(A) {
					return A.length === 0 ? null : A[0];
				}
				function f(A) {
					if (A.length === 0) return null;
					var C = A[0],
						q = A.pop();
					if (q !== C) {
						A[0] = q;
						e: for (
							var ce = 0, re = A.length, m = re >>> 1;
							ce < m;

						) {
							var D = 2 * (ce + 1) - 1,
								H = A[D],
								U = D + 1,
								V = A[U];
							if (0 > _(H, q))
								U < re && 0 > _(V, H)
									? ((A[ce] = V), (A[U] = q), (ce = U))
									: ((A[ce] = H), (A[D] = q), (ce = D));
							else if (U < re && 0 > _(V, q))
								(A[ce] = V), (A[U] = q), (ce = U);
							else break e;
						}
					}
					return C;
				}
				function _(A, C) {
					var q = A.sortIndex - C.sortIndex;
					return q !== 0 ? q : A.id - C.id;
				}
				if (
					((a.unstable_now = void 0),
					typeof performance == 'object' &&
						typeof performance.now == 'function')
				) {
					var b = performance;
					a.unstable_now = function () {
						return b.now();
					};
				} else {
					var y = Date,
						x = y.now();
					a.unstable_now = function () {
						return y.now() - x;
					};
				}
				var v = [],
					p = [],
					z = 1,
					R = null,
					J = 3,
					Ce = false,
					De = false,
					ze = false,
					St = false,
					Fe = typeof setTimeout == 'function' ? setTimeout : null,
					Zt =
						typeof clearTimeout == 'function' ? clearTimeout : null,
					Re = typeof setImmediate < 'u' ? setImmediate : null;
				function at(A) {
					for (var C = i(p); C !== null; ) {
						if (C.callback === null) f(p);
						else if (C.startTime <= A)
							f(p), (C.sortIndex = C.expirationTime), c(v, C);
						else break;
						C = i(p);
					}
				}
				function Ot(A) {
					if (((ze = false), at(A), !De))
						if (i(v) !== null)
							(De = true), Ue || ((Ue = true), Le());
						else {
							var C = i(p);
							C !== null && dt(Ot, C.startTime - A);
						}
				}
				var Ue = false,
					k = -1,
					Be = 5,
					yt = -1;
				function Ln() {
					return St ? true : !(a.unstable_now() - yt < Be);
				}
				function jt() {
					if (((St = false), Ue)) {
						var A = a.unstable_now();
						yt = A;
						var C = true;
						try {
							e: {
								(De = false),
									ze && ((ze = false), Zt(k), (k = -1)),
									(Ce = true);
								var q = J;
								try {
									t: {
										for (
											at(A), R = i(v);
											R !== null &&
											!(R.expirationTime > A && Ln());

										) {
											var ce = R.callback;
											if (typeof ce == 'function') {
												(R.callback = null),
													(J = R.priorityLevel);
												var re = ce(
													R.expirationTime <= A,
												);
												if (
													((A = a.unstable_now()),
													typeof re == 'function')
												) {
													(R.callback = re),
														at(A),
														(C = true);
													break t;
												}
												R === i(v) && f(v), at(A);
											} else f(v);
											R = i(v);
										}
										if (R !== null) C = true;
										else {
											var m = i(p);
											m !== null &&
												dt(Ot, m.startTime - A),
												(C = false);
										}
									}
									break e;
								} finally {
									(R = null), (J = q), (Ce = false);
								}
								C = void 0;
							}
						} finally {
							C ? Le() : (Ue = false);
						}
					}
				}
				var Le;
				if (typeof Re == 'function')
					Le = function () {
						Re(jt);
					};
				else if (typeof MessageChannel < 'u') {
					var On = new MessageChannel(),
						Et = On.port2;
					(On.port1.onmessage = jt),
						(Le = function () {
							Et.postMessage(null);
						});
				} else
					Le = function () {
						Fe(jt, 0);
					};
				function dt(A, C) {
					k = Fe(function () {
						A(a.unstable_now());
					}, C);
				}
				(a.unstable_IdlePriority = 5),
					(a.unstable_ImmediatePriority = 1),
					(a.unstable_LowPriority = 4),
					(a.unstable_NormalPriority = 3),
					(a.unstable_Profiling = null),
					(a.unstable_UserBlockingPriority = 2),
					(a.unstable_cancelCallback = function (A) {
						A.callback = null;
					}),
					(a.unstable_forceFrameRate = function (A) {
						0 > A || 125 < A
							? console.error(
									'forceFrameRate takes a positive int between 0 and 125, forcing frame rates higher than 125 fps is not supported',
								)
							: (Be = 0 < A ? Math.floor(1e3 / A) : 5);
					}),
					(a.unstable_getCurrentPriorityLevel = function () {
						return J;
					}),
					(a.unstable_next = function (A) {
						switch (J) {
							case 1:
							case 2:
							case 3:
								var C = 3;
								break;
							default:
								C = J;
						}
						var q = J;
						J = C;
						try {
							return A();
						} finally {
							J = q;
						}
					}),
					(a.unstable_requestPaint = function () {
						St = true;
					}),
					(a.unstable_runWithPriority = function (A, C) {
						switch (A) {
							case 1:
							case 2:
							case 3:
							case 4:
							case 5:
								break;
							default:
								A = 3;
						}
						var q = J;
						J = A;
						try {
							return C();
						} finally {
							J = q;
						}
					}),
					(a.unstable_scheduleCallback = function (A, C, q) {
						var ce = a.unstable_now();
						switch (
							(typeof q == 'object' && q !== null
								? ((q = q.delay),
									(q =
										typeof q == 'number' && 0 < q
											? ce + q
											: ce))
								: (q = ce),
							A)
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
							(re = q + re),
							(A = {
								id: z++,
								callback: C,
								priorityLevel: A,
								startTime: q,
								expirationTime: re,
								sortIndex: -1,
							}),
							q > ce
								? ((A.sortIndex = q),
									c(p, A),
									i(v) === null &&
										A === i(p) &&
										(ze ? (Zt(k), (k = -1)) : (ze = true),
										dt(Ot, q - ce)))
								: ((A.sortIndex = re),
									c(v, A),
									De ||
										Ce ||
										((De = true),
										Ue || ((Ue = true), Le()))),
							A
						);
					}),
					(a.unstable_shouldYield = Ln),
					(a.unstable_wrapCallback = function (A) {
						var C = J;
						return function () {
							var q = J;
							J = C;
							try {
								return A.apply(this, arguments);
							} finally {
								J = q;
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
	function c(v) {
		var p = 'https://react.dev/errors/' + v;
		if (1 < arguments.length) {
			p += '?args[]=' + encodeURIComponent(arguments[1]);
			for (var z = 2; z < arguments.length; z++)
				p += '&args[]=' + encodeURIComponent(arguments[z]);
		}
		return (
			'Minified React error #' +
			v +
			'; visit ' +
			p +
			' for the full message or use the non-minified dev environment for full errors and additional helpful warnings.'
		);
	}
	function i() {}
	var f = {
			d: {
				f: i,
				r: function () {
					throw Error(c(522));
				},
				D: i,
				C: i,
				L: i,
				m: i,
				X: i,
				S: i,
				M: i,
			},
			p: 0,
			findDOMNode: null,
		},
		_ = Symbol.for('react.portal');
	function b(v, p, z) {
		var R =
			3 < arguments.length && arguments[3] !== void 0
				? arguments[3]
				: null;
		return {
			$$typeof: _,
			key: R == null ? null : '' + R,
			children: v,
			containerInfo: p,
			implementation: z,
		};
	}
	var y = a.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
	function x(v, p) {
		if (v === 'font') return '';
		if (typeof p == 'string') return p === 'use-credentials' ? p : '';
	}
	return (
		(reactDom_production.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE =
			f),
		(reactDom_production.createPortal = function (v, p) {
			var z =
				2 < arguments.length && arguments[2] !== void 0
					? arguments[2]
					: null;
			if (
				!p ||
				(p.nodeType !== 1 && p.nodeType !== 9 && p.nodeType !== 11)
			)
				throw Error(c(299));
			return b(v, p, null, z);
		}),
		(reactDom_production.flushSync = function (v) {
			var p = y.T,
				z = f.p;
			try {
				if (((y.T = null), (f.p = 2), v)) return v();
			} finally {
				(y.T = p), (f.p = z), f.d.f();
			}
		}),
		(reactDom_production.preconnect = function (v, p) {
			typeof v == 'string' &&
				(p
					? ((p = p.crossOrigin),
						(p =
							typeof p == 'string'
								? p === 'use-credentials'
									? p
									: ''
								: void 0))
					: (p = null),
				f.d.C(v, p));
		}),
		(reactDom_production.prefetchDNS = function (v) {
			typeof v == 'string' && f.d.D(v);
		}),
		(reactDom_production.preinit = function (v, p) {
			if (typeof v == 'string' && p && typeof p.as == 'string') {
				var z = p.as,
					R = x(z, p.crossOrigin),
					J = typeof p.integrity == 'string' ? p.integrity : void 0,
					Ce =
						typeof p.fetchPriority == 'string'
							? p.fetchPriority
							: void 0;
				z === 'style'
					? f.d.S(
							v,
							typeof p.precedence == 'string'
								? p.precedence
								: void 0,
							{ crossOrigin: R, integrity: J, fetchPriority: Ce },
						)
					: z === 'script' &&
						f.d.X(v, {
							crossOrigin: R,
							integrity: J,
							fetchPriority: Ce,
							nonce:
								typeof p.nonce == 'string' ? p.nonce : void 0,
						});
			}
		}),
		(reactDom_production.preinitModule = function (v, p) {
			if (typeof v == 'string')
				if (typeof p == 'object' && p !== null) {
					if (p.as == null || p.as === 'script') {
						var z = x(p.as, p.crossOrigin);
						f.d.M(v, {
							crossOrigin: z,
							integrity:
								typeof p.integrity == 'string'
									? p.integrity
									: void 0,
							nonce:
								typeof p.nonce == 'string' ? p.nonce : void 0,
						});
					}
				} else p == null && f.d.M(v);
		}),
		(reactDom_production.preload = function (v, p) {
			if (
				typeof v == 'string' &&
				typeof p == 'object' &&
				p !== null &&
				typeof p.as == 'string'
			) {
				var z = p.as,
					R = x(z, p.crossOrigin);
				f.d.L(v, z, {
					crossOrigin: R,
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
		(reactDom_production.preloadModule = function (v, p) {
			if (typeof v == 'string')
				if (p) {
					var z = x(p.as, p.crossOrigin);
					f.d.m(v, {
						as:
							typeof p.as == 'string' && p.as !== 'script'
								? p.as
								: void 0,
						crossOrigin: z,
						integrity:
							typeof p.integrity == 'string'
								? p.integrity
								: void 0,
					});
				} else f.d.m(v);
		}),
		(reactDom_production.requestFormReset = function (v) {
			f.d.r(v);
		}),
		(reactDom_production.unstable_batchedUpdates = function (v, p) {
			return v(p);
		}),
		(reactDom_production.useFormState = function (v, p, z) {
			return y.H.useFormState(v, p, z);
		}),
		(reactDom_production.useFormStatus = function () {
			return y.H.useHostTransitionStatus();
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
		i = requireReactDom();
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
	function _(e) {
		return !(
			!e ||
			(e.nodeType !== 1 && e.nodeType !== 9 && e.nodeType !== 11)
		);
	}
	function b(e) {
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
	function y(e) {
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
	function x(e) {
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
	function v(e) {
		if (b(e) !== e) throw Error(f(188));
	}
	function p(e) {
		var t = e.alternate;
		if (!t) {
			if (((t = b(e)), t === null)) throw Error(f(188));
			return t !== e ? null : e;
		}
		for (var n = e, u = t; ; ) {
			var l = n.return;
			if (l === null) break;
			var r = l.alternate;
			if (r === null) {
				if (((u = l.return), u !== null)) {
					n = u;
					continue;
				}
				break;
			}
			if (l.child === r.child) {
				for (r = l.child; r; ) {
					if (r === n) return v(l), e;
					if (r === u) return v(l), t;
					r = r.sibling;
				}
				throw Error(f(188));
			}
			if (n.return !== u.return) (n = l), (u = r);
			else {
				for (var o = false, s = l.child; s; ) {
					if (s === n) {
						(o = true), (n = l), (u = r);
						break;
					}
					if (s === u) {
						(o = true), (u = l), (n = r);
						break;
					}
					s = s.sibling;
				}
				if (!o) {
					for (s = r.child; s; ) {
						if (s === n) {
							(o = true), (n = r), (u = l);
							break;
						}
						if (s === u) {
							(o = true), (u = r), (n = l);
							break;
						}
						s = s.sibling;
					}
					if (!o) throw Error(f(189));
				}
			}
			if (n.alternate !== u) throw Error(f(190));
		}
		if (n.tag !== 3) throw Error(f(188));
		return n.stateNode.current === n ? e : t;
	}
	function z(e) {
		var t = e.tag;
		if (t === 5 || t === 26 || t === 27 || t === 6) return e;
		for (e = e.child; e !== null; ) {
			if (((t = z(e)), t !== null)) return t;
			e = e.sibling;
		}
		return null;
	}
	var R = Object.assign,
		J = Symbol.for('react.element'),
		Ce = Symbol.for('react.transitional.element'),
		De = Symbol.for('react.portal'),
		ze = Symbol.for('react.fragment'),
		St = Symbol.for('react.strict_mode'),
		Fe = Symbol.for('react.profiler'),
		Zt = Symbol.for('react.consumer'),
		Re = Symbol.for('react.context'),
		at = Symbol.for('react.forward_ref'),
		Ot = Symbol.for('react.suspense'),
		Ue = Symbol.for('react.suspense_list'),
		k = Symbol.for('react.memo'),
		Be = Symbol.for('react.lazy'),
		yt = Symbol.for('react.activity'),
		Ln = Symbol.for('react.memo_cache_sentinel'),
		jt = Symbol.iterator;
	function Le(e) {
		return e === null || typeof e != 'object'
			? null
			: ((e = (jt && e[jt]) || e['@@iterator']),
				typeof e == 'function' ? e : null);
	}
	var On = Symbol.for('react.client.reference');
	function Et(e) {
		if (e == null) return null;
		if (typeof e == 'function')
			return e.$$typeof === On ? null : e.displayName || e.name || null;
		if (typeof e == 'string') return e;
		switch (e) {
			case ze:
				return 'Fragment';
			case Fe:
				return 'Profiler';
			case St:
				return 'StrictMode';
			case Ot:
				return 'Suspense';
			case Ue:
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
				case k:
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
	var dt = Array.isArray,
		A = c.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE,
		C = i.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE,
		q = { pending: false, data: null, method: null, action: null },
		ce = [],
		re = -1;
	function m(e) {
		return { current: e };
	}
	function D(e) {
		0 > re || ((e.current = ce[re]), (ce[re] = null), re--);
	}
	function H(e, t) {
		re++, (ce[re] = e.current), (e.current = t);
	}
	var U = m(null),
		V = m(null),
		Q = m(null),
		te = m(null);
	function He(e, t) {
		switch ((H(Q, t), H(V, e), H(U, null), t.nodeType)) {
			case 9:
			case 11:
				e = (e = t.documentElement) && (e = e.namespaceURI) ? x_(e) : 0;
				break;
			default:
				if (((e = t.tagName), (t = t.namespaceURI)))
					(t = x_(t)), (e = S_(t, e));
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
		D(U), H(U, e);
	}
	function ge() {
		D(U), D(V), D(Q);
	}
	function va(e) {
		e.memoizedState !== null && H(te, e);
		var t = U.current,
			n = S_(t, e.type);
		t !== n && (H(V, e), H(U, n));
	}
	function mc(e) {
		V.current === e && (D(U), D(V)),
			te.current === e && (D(te), (sc._currentValue = q));
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
	var Nu = false;
	function Uu(e, t) {
		if (!e || Nu) return '';
		Nu = true;
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
								} catch (S) {
									var w = S;
								}
								Reflect.construct(e, [], M);
							} else {
								try {
									M.call();
								} catch (S) {
									w = S;
								}
								e.call(M.prototype);
							}
						} else {
							try {
								throw Error();
							} catch (S) {
								w = S;
							}
							(M = e()) &&
								typeof M.catch == 'function' &&
								M.catch(function () {});
						}
					} catch (S) {
						if (S && w && typeof S.stack == 'string')
							return [S.stack, w.stack];
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
			var r = u.DetermineComponentFrameRoot(),
				o = r[0],
				s = r[1];
			if (o && s) {
				var d = o.split(`
`),
					h = s.split(`
`);
				for (
					l = u = 0;
					u < d.length &&
					!d[u].includes('DetermineComponentFrameRoot');

				)
					u++;
				for (
					;
					l < h.length &&
					!h[l].includes('DetermineComponentFrameRoot');

				)
					l++;
				if (u === d.length || l === h.length)
					for (
						u = d.length - 1, l = h.length - 1;
						1 <= u && 0 <= l && d[u] !== h[l];

					)
						l--;
				for (; 1 <= u && 0 <= l; u--, l--)
					if (d[u] !== h[l]) {
						if (u !== 1 || l !== 1)
							do
								if ((u--, l--, 0 > l || d[u] !== h[l])) {
									var E =
										`
` + d[u].replace(' at new ', ' at ');
									return (
										e.displayName &&
											E.includes('<anonymous>') &&
											(E = E.replace(
												'<anonymous>',
												e.displayName,
											)),
										E
									);
								}
							while (1 <= u && 0 <= l);
						break;
					}
			}
		} finally {
			(Nu = false), (Error.prepareStackTrace = n);
		}
		return (n = e ? e.displayName || e.name : '') ? yn(n) : '';
	}
	function ts(e, t) {
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
				return Uu(e.type, false);
			case 11:
				return Uu(e.type.render, false);
			case 1:
				return Uu(e.type, true);
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
			do (t += ts(e, n)), (n = e), (e = e.return);
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
		Lu = a.unstable_scheduleCallback,
		Gu = a.unstable_cancelCallback,
		ns = a.unstable_shouldYield,
		as = a.unstable_requestPaint,
		We = a.unstable_now,
		cs = a.unstable_getCurrentPriorityLevel,
		er = a.unstable_ImmediatePriority,
		tr = a.unstable_UserBlockingPriority,
		pc = a.unstable_NormalPriority,
		us = a.unstable_LowPriority,
		nr = a.unstable_IdlePriority,
		ls = a.log,
		is = a.unstable_setDisableYieldValue,
		xa = null,
		Ke = null;
	function Ft(e) {
		if (
			(typeof ls == 'function' && is(e),
			Ke && typeof Ke.setStrictMode == 'function')
		)
			try {
				Ke.setStrictMode(xa, e);
			} catch {}
	}
	var Je = Math.clz32 ? Math.clz32 : os,
		rs = Math.log,
		fs = Math.LN2;
	function os(e) {
		return (e >>>= 0), e === 0 ? 32 : (31 - ((rs(e) / fs) | 0)) | 0;
	}
	var Oc = 256,
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
			r = e.suspendedLanes,
			o = e.pingedLanes;
		e = e.warmLanes;
		var s = u & 134217727;
		return (
			s !== 0
				? ((u = s & ~r),
					u !== 0
						? (l = jn(u))
						: ((o &= s),
							o !== 0
								? (l = jn(o))
								: n || ((n = s & ~e), n !== 0 && (l = jn(n)))))
				: ((s = u & ~r),
					s !== 0
						? (l = jn(s))
						: o !== 0
							? (l = jn(o))
							: n || ((n = u & ~e), n !== 0 && (l = jn(n)))),
			l === 0
				? 0
				: t !== 0 &&
					  t !== l &&
					  (t & r) === 0 &&
					  ((r = l & -l),
					  (n = t & -t),
					  r >= n || (r === 32 && (n & 4194048) !== 0))
					? t
					: l
		);
	}
	function Sa(e, t) {
		return (
			(e.pendingLanes & ~(e.suspendedLanes & ~e.pingedLanes) & t) === 0
		);
	}
	function _s(e, t) {
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
	function qu(e) {
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
	function ss(e, t, n, u, l, r) {
		var o = e.pendingLanes;
		(e.pendingLanes = n),
			(e.suspendedLanes = 0),
			(e.pingedLanes = 0),
			(e.warmLanes = 0),
			(e.expiredLanes &= n),
			(e.entangledLanes &= n),
			(e.errorRecoveryDisabledLanes &= n),
			(e.shellSuspendCounter = 0);
		var s = e.entanglements,
			d = e.expirationTimes,
			h = e.hiddenUpdates;
		for (n = o & ~n; 0 < n; ) {
			var E = 31 - Je(n),
				M = 1 << E;
			(s[E] = 0), (d[E] = -1);
			var w = h[E];
			if (w !== null)
				for (h[E] = null, E = 0; E < w.length; E++) {
					var S = w[E];
					S !== null && (S.lane &= -536870913);
				}
			n &= ~M;
		}
		u !== 0 && cr(e, u, 0),
			r !== 0 &&
				l === 0 &&
				e.tag !== 0 &&
				(e.suspendedLanes |= r & ~(o & ~t));
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
		var e = C.p;
		return e !== 0
			? e
			: ((e = window.event), e === void 0 ? 32 : K_(e.type));
	}
	function rr(e, t) {
		var n = C.p;
		try {
			return (C.p = e), t();
		} finally {
			C.p = n;
		}
	}
	var Wt = Math.random().toString(36).slice(2),
		Se = '__reactFiber$' + Wt,
		Ge = '__reactProps$' + Wt,
		Gn = '__reactContainer$' + Wt,
		Xu = '__reactEvents$' + Wt,
		bs = '__reactListeners$' + Wt,
		ds = '__reactHandles$' + Wt,
		fr = '__reactResources$' + Wt,
		Aa = '__reactMarker$' + Wt;
	function Qu(e) {
		delete e[Se], delete e[Ge], delete e[Xu], delete e[bs], delete e[ds];
	}
	function qn(e) {
		var t = e[Se];
		if (t) return t;
		for (var n = e.parentNode; n; ) {
			if ((t = n[Gn] || n[Se])) {
				if (
					((n = t.alternate),
					t.child !== null || (n !== null && n.child !== null))
				)
					for (e = C_(e); e !== null; ) {
						if ((n = e[Se])) return n;
						e = C_(e);
					}
				return t;
			}
			(e = n), (n = e.parentNode);
		}
		return null;
	}
	function Vn(e) {
		if ((e = e[Se] || e[Gn])) {
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
	var or = /* @__PURE__ */ new Set(),
		_r = {};
	function hn(e, t) {
		Xn(e, t), Xn(e + 'Capture', t);
	}
	function Xn(e, t) {
		for (_r[e] = t, e = 0; e < t.length; e++) or.add(t[e]);
	}
	var gs = RegExp(
			'^[:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD][:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040]*$',
		),
		sr = {},
		br = {};
	function ms(e) {
		return Bu.call(br, e)
			? true
			: Bu.call(sr, e)
				? false
				: gs.test(e)
					? (br[e] = true)
					: ((sr[e] = true), false);
	}
	function wc(e, t, n) {
		if (ms(t))
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
	function dr(e) {
		var t = e.type;
		return (
			(e = e.nodeName) &&
			e.toLowerCase() === 'input' &&
			(t === 'checkbox' || t === 'radio')
		);
	}
	function ps(e, t, n) {
		var u = Object.getOwnPropertyDescriptor(e.constructor.prototype, t);
		if (
			!e.hasOwnProperty(t) &&
			typeof u < 'u' &&
			typeof u.get == 'function' &&
			typeof u.set == 'function'
		) {
			var l = u.get,
				r = u.set;
			return (
				Object.defineProperty(e, t, {
					configurable: true,
					get: function () {
						return l.call(this);
					},
					set: function (o) {
						(n = '' + o), r.call(this, o);
					},
				}),
				Object.defineProperty(e, t, { enumerable: u.enumerable }),
				{
					getValue: function () {
						return n;
					},
					setValue: function (o) {
						n = '' + o;
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
			var t = dr(e) ? 'checked' : 'value';
			e._valueTracker = ps(e, t, '' + e[t]);
		}
	}
	function gr(e) {
		if (!e) return false;
		var t = e._valueTracker;
		if (!t) return true;
		var n = t.getValue(),
			u = '';
		return (
			e && (u = dr(e) ? (e.checked ? 'true' : 'false') : e.value),
			(e = u),
			e !== n ? (t.setValue(e), true) : false
		);
	}
	function xc(e) {
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
	var Os = /[\n"\\]/g;
	function ut(e) {
		return e.replace(Os, function (t) {
			return '\\' + t.charCodeAt(0).toString(16) + ' ';
		});
	}
	function Fu(e, t, n, u, l, r, o, s) {
		(e.name = ''),
			o != null &&
			typeof o != 'function' &&
			typeof o != 'symbol' &&
			typeof o != 'boolean'
				? (e.type = o)
				: e.removeAttribute('type'),
			t != null
				? o === 'number'
					? ((t === 0 && e.value === '') || e.value != t) &&
						(e.value = '' + ct(t))
					: e.value !== '' + ct(t) && (e.value = '' + ct(t))
				: (o !== 'submit' && o !== 'reset') ||
					e.removeAttribute('value'),
			t != null
				? Wu(e, o, ct(t))
				: n != null
					? Wu(e, o, ct(n))
					: u != null && e.removeAttribute('value'),
			l == null && r != null && (e.defaultChecked = !!r),
			l != null &&
				(e.checked =
					l && typeof l != 'function' && typeof l != 'symbol'),
			s != null &&
			typeof s != 'function' &&
			typeof s != 'symbol' &&
			typeof s != 'boolean'
				? (e.name = '' + ct(s))
				: e.removeAttribute('name');
	}
	function mr(e, t, n, u, l, r, o, s) {
		if (
			(r != null &&
				typeof r != 'function' &&
				typeof r != 'symbol' &&
				typeof r != 'boolean' &&
				(e.type = r),
			t != null || n != null)
		) {
			if (!((r !== 'submit' && r !== 'reset') || t != null)) {
				Zu(e);
				return;
			}
			(n = n != null ? '' + ct(n) : ''),
				(t = t != null ? '' + ct(t) : n),
				s || t === e.value || (e.value = t),
				(e.defaultValue = t);
		}
		(u = u ?? l),
			(u = typeof u != 'function' && typeof u != 'symbol' && !!u),
			(e.checked = s ? e.checked : !!u),
			(e.defaultChecked = !!u),
			o != null &&
				typeof o != 'function' &&
				typeof o != 'symbol' &&
				typeof o != 'boolean' &&
				(e.name = o),
			Zu(e);
	}
	function Wu(e, t, n) {
		(t === 'number' && xc(e.ownerDocument) === e) ||
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
	function pr(e, t, n) {
		if (
			t != null &&
			((t = '' + ct(t)), t !== e.value && (e.value = t), n == null)
		) {
			e.defaultValue !== t && (e.defaultValue = t);
			return;
		}
		e.defaultValue = n != null ? '' + ct(n) : '';
	}
	function Or(e, t, n, u) {
		if (t == null) {
			if (u != null) {
				if (n != null) throw Error(f(92));
				if (dt(u)) {
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
	var ys = new Set(
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
				: typeof n != 'number' || n === 0 || ys.has(t)
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
		} else for (var r in t) t.hasOwnProperty(r) && yr(e, r, t[r]);
	}
	function Ku(e) {
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
	var js = /* @__PURE__ */ new Map([
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
		hs =
			/^[\u0000-\u001F ]*j[\r\n\t]*a[\r\n\t]*v[\r\n\t]*a[\r\n\t]*s[\r\n\t]*c[\r\n\t]*r[\r\n\t]*i[\r\n\t]*p[\r\n\t]*t[\r\n\t]*:/i;
	function Sc(e) {
		return hs.test('' + e)
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
	var Fn = null,
		Wn = null;
	function hr(e) {
		var t = Vn(e);
		if (t && (e = t.stateNode)) {
			var n = e[Ge] || null;
			e: switch (((e = t.stateNode), t.type)) {
				case 'input':
					if (
						(Fu(
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
								var l = u[Ge] || null;
								if (!l) throw Error(f(90));
								Fu(
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
							(u = n[t]), u.form === e.form && gr(u);
					}
					break e;
				case 'textarea':
					pr(e, n.value, n.defaultValue);
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
				(Fn !== null || Wn !== null) &&
					(su(),
					Fn && ((t = Fn), (e = Wn), (Wn = Fn = null), hr(t), e)))
			)
				for (t = 0; t < e.length; t++) hr(e[t]);
		}
	}
	function Ma(e, t) {
		var n = e.stateNode;
		if (n === null) return null;
		var u = n[Ge] || null;
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
	var Kt = null,
		Pu = null,
		Ec = null;
	function vr() {
		if (Ec) return Ec;
		var e,
			t = Pu,
			n = t.length,
			u,
			l = 'value' in Kt ? Kt.value : Kt.textContent,
			r = l.length;
		for (e = 0; e < n && t[e] === l[e]; e++);
		var o = n - e;
		for (u = 1; u <= o && t[n - u] === l[r - u]; u++);
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
	function xr() {
		return false;
	}
	function qe(e) {
		function t(n, u, l, r, o) {
			(this._reactName = n),
				(this._targetInst = l),
				(this.type = u),
				(this.nativeEvent = r),
				(this.target = o),
				(this.currentTarget = null);
			for (var s in e)
				e.hasOwnProperty(s) &&
					((n = e[s]), (this[s] = n ? n(r) : r[s]));
			return (
				(this.isDefaultPrevented = (
					r.defaultPrevented != null
						? r.defaultPrevented
						: r.returnValue === false
				)
					? Tc
					: xr),
				(this.isPropagationStopped = xr),
				this
			);
		}
		return (
			R(t.prototype, {
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
		Mc = qe(wn),
		Ra = R({}, wn, { view: 0, detail: 0 }),
		ws = qe(Ra),
		el,
		tl,
		Ca,
		Dc = R({}, Ra, {
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
					: (e !== Ca &&
							(Ca && e.type === 'mousemove'
								? ((el = e.screenX - Ca.screenX),
									(tl = e.screenY - Ca.screenY))
								: (tl = el = 0),
							(Ca = e)),
						el);
			},
			movementY: function (e) {
				return 'movementY' in e ? e.movementY : tl;
			},
		}),
		Sr = qe(Dc),
		vs = R({}, Dc, { dataTransfer: 0 }),
		xs = qe(vs),
		Ss = R({}, Ra, { relatedTarget: 0 }),
		nl = qe(Ss),
		Es = R({}, wn, { animationName: 0, elapsedTime: 0, pseudoElement: 0 }),
		As = qe(Es),
		Ts = R({}, wn, {
			clipboardData: function (e) {
				return 'clipboardData' in e
					? e.clipboardData
					: window.clipboardData;
			},
		}),
		Ms = qe(Ts),
		Ds = R({}, wn, { data: 0 }),
		Er = qe(Ds),
		Rs = {
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
		Cs = {
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
		zs = {
			Alt: 'altKey',
			Control: 'ctrlKey',
			Meta: 'metaKey',
			Shift: 'shiftKey',
		};
	function Hs(e) {
		var t = this.nativeEvent;
		return t.getModifierState
			? t.getModifierState(e)
			: (e = zs[e])
				? !!t[e]
				: false;
	}
	function al() {
		return Hs;
	}
	var Ns = R({}, Ra, {
			key: function (e) {
				if (e.key) {
					var t = Rs[e.key] || e.key;
					if (t !== 'Unidentified') return t;
				}
				return e.type === 'keypress'
					? ((e = Ac(e)), e === 13 ? 'Enter' : String.fromCharCode(e))
					: e.type === 'keydown' || e.type === 'keyup'
						? Cs[e.keyCode] || 'Unidentified'
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
		Us = qe(Ns),
		Bs = R({}, Dc, {
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
		Ar = qe(Bs),
		Ls = R({}, Ra, {
			touches: 0,
			targetTouches: 0,
			changedTouches: 0,
			altKey: 0,
			metaKey: 0,
			ctrlKey: 0,
			shiftKey: 0,
			getModifierState: al,
		}),
		Gs = qe(Ls),
		qs = R({}, wn, { propertyName: 0, elapsedTime: 0, pseudoElement: 0 }),
		Vs = qe(qs),
		Ys = R({}, Dc, {
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
		Xs = qe(Ys),
		Qs = R({}, wn, { newState: 0, oldState: 0 }),
		Zs = qe(Qs),
		Fs = [9, 13, 27, 32],
		cl = Mt && 'CompositionEvent' in window,
		za = null;
	Mt && 'documentMode' in document && (za = document.documentMode);
	var Ws = Mt && 'TextEvent' in window && !za,
		Tr = Mt && (!cl || (za && 8 < za && 11 >= za)),
		Mr = ' ',
		Dr = false;
	function Rr(e, t) {
		switch (e) {
			case 'keyup':
				return Fs.indexOf(t.keyCode) !== -1;
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
	function Cr(e) {
		return (
			(e = e.detail), typeof e == 'object' && 'data' in e ? e.data : null
		);
	}
	var Kn = false;
	function Ks(e, t) {
		switch (e) {
			case 'compositionend':
				return Cr(t);
			case 'keypress':
				return t.which !== 32 ? null : ((Dr = true), Mr);
			case 'textInput':
				return (e = t.data), e === Mr && Dr ? null : e;
			default:
				return null;
		}
	}
	function Js(e, t) {
		if (Kn)
			return e === 'compositionend' || (!cl && Rr(e, t))
				? ((e = vr()), (Ec = Pu = Kt = null), (Kn = false), e)
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
	var ks = {
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
	function zr(e) {
		var t = e && e.nodeName && e.nodeName.toLowerCase();
		return t === 'input' ? !!ks[e.type] : t === 'textarea';
	}
	function Hr(e, t, n, u) {
		Fn ? (Wn ? Wn.push(u) : (Wn = [u])) : (Fn = u),
			(t = yu(t, 'onChange')),
			0 < t.length &&
				((n = new Mc('onChange', 'change', null, n, u)),
				e.push({ event: n, listeners: t }));
	}
	var Ha = null,
		Na = null;
	function Is(e) {
		O_(e, 0);
	}
	function Rc(e) {
		var t = Ta(e);
		if (gr(t)) return e;
	}
	function Nr(e, t) {
		if (e === 'change') return t;
	}
	var Ur = false;
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
		Ur = ul && (!document.documentMode || 9 < document.documentMode);
	}
	function Lr() {
		Ha && (Ha.detachEvent('onpropertychange', Gr), (Na = Ha = null));
	}
	function Gr(e) {
		if (e.propertyName === 'value' && Rc(Na)) {
			var t = [];
			Hr(t, Na, e, ku(e)), wr(Is, t);
		}
	}
	function $s(e, t, n) {
		e === 'focusin'
			? (Lr(), (Ha = t), (Na = n), Ha.attachEvent('onpropertychange', Gr))
			: e === 'focusout' && Lr();
	}
	function Ps(e) {
		if (e === 'selectionchange' || e === 'keyup' || e === 'keydown')
			return Rc(Na);
	}
	function eb(e, t) {
		if (e === 'click') return Rc(t);
	}
	function tb(e, t) {
		if (e === 'input' || e === 'change') return Rc(t);
	}
	function nb(e, t) {
		return (
			(e === t && (e !== 0 || 1 / e === 1 / t)) || (e !== e && t !== t)
		);
	}
	var ke = typeof Object.is == 'function' ? Object.is : nb;
	function Ua(e, t) {
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
	function qr(e) {
		for (; e && e.firstChild; ) e = e.firstChild;
		return e;
	}
	function Vr(e, t) {
		var n = qr(e);
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
			n = qr(n);
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
		for (var t = xc(e.document); t instanceof e.HTMLIFrameElement; ) {
			try {
				var n = typeof t.contentWindow.location.href == 'string';
			} catch {
				n = false;
			}
			if (n) e = t.contentWindow;
			else break;
			t = xc(e.document);
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
	var ab = Mt && 'documentMode' in document && 11 >= document.documentMode,
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
			Jn !== xc(u) ||
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
			(Ba && Ua(Ba, u)) ||
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
		ol = {},
		Zr = {};
	Mt &&
		((Zr = document.createElement('div').style),
		'AnimationEvent' in window ||
			(delete kn.animationend.animation,
			delete kn.animationiteration.animation,
			delete kn.animationstart.animation),
		'TransitionEvent' in window || delete kn.transitionend.transition);
	function xn(e) {
		if (ol[e]) return ol[e];
		if (!kn[e]) return e;
		var t = kn[e],
			n;
		for (n in t) if (t.hasOwnProperty(n) && n in Zr) return (ol[e] = t[n]);
		return e;
	}
	var Fr = xn('animationend'),
		Wr = xn('animationiteration'),
		Kr = xn('animationstart'),
		cb = xn('transitionrun'),
		ub = xn('transitionstart'),
		lb = xn('transitioncancel'),
		Jr = xn('transitionend'),
		kr = /* @__PURE__ */ new Map(),
		_l =
			'abort auxClick beforeToggle cancel canPlay canPlayThrough click close contextMenu copy cut drag dragEnd dragEnter dragExit dragLeave dragOver dragStart drop durationChange emptied encrypted ended error gotPointerCapture input invalid keyDown keyPress keyUp load loadedData loadedMetadata loadStart lostPointerCapture mouseDown mouseMove mouseOut mouseOver mouseUp paste pause play playing pointerCancel pointerDown pointerMove pointerOut pointerOver pointerUp progress rateChange reset resize seeked seeking stalled submit suspend timeUpdate touchCancel touchEnd touchStart volumeChange scroll toggle touchMove waiting wheel'.split(
				' ',
			);
	_l.push('scrollEnd');
	function gt(e, t) {
		kr.set(e, t), hn(t, [e]);
	}
	var Cc =
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
		sl = 0;
	function zc() {
		for (var e = In, t = (sl = In = 0); t < e; ) {
			var n = lt[t];
			lt[t++] = null;
			var u = lt[t];
			lt[t++] = null;
			var l = lt[t];
			lt[t++] = null;
			var r = lt[t];
			if (((lt[t++] = null), u !== null && l !== null)) {
				var o = u.pending;
				o === null ? (l.next = l) : ((l.next = o.next), (o.next = l)),
					(u.pending = l);
			}
			r !== 0 && Ir(n, l, r);
		}
	}
	function Hc(e, t, n, u) {
		(lt[In++] = e),
			(lt[In++] = t),
			(lt[In++] = n),
			(lt[In++] = u),
			(sl |= u),
			(e.lanes |= u),
			(e = e.alternate),
			e !== null && (e.lanes |= u);
	}
	function bl(e, t, n, u) {
		return Hc(e, t, n, u), Nc(e);
	}
	function Sn(e, t) {
		return Hc(e, null, null, t), Nc(e);
	}
	function Ir(e, t, n) {
		e.lanes |= n;
		var u = e.alternate;
		u !== null && (u.lanes |= n);
		for (var l = false, r = e.return; r !== null; )
			(r.childLanes |= n),
				(u = r.alternate),
				u !== null && (u.childLanes |= n),
				r.tag === 22 &&
					((e = r.stateNode),
					e === null || e._visibility & 1 || (l = true)),
				(e = r),
				(r = r.return);
		return e.tag === 3
			? ((r = e.stateNode),
				l &&
					t !== null &&
					((l = 31 - Je(n)),
					(e = r.hiddenUpdates),
					(u = e[l]),
					u === null ? (e[l] = [t]) : u.push(t),
					(t.lane = n | 536870912)),
				r)
			: null;
	}
	function Nc(e) {
		if (50 < uc) throw ((uc = 0), (wi = null), Error(f(185)));
		for (var t = e.return; t !== null; ) (e = t), (t = e.return);
		return e.tag === 3 ? e.stateNode : null;
	}
	var $n = {};
	function ib(e, t, n, u) {
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
		return new ib(e, t, n, u);
	}
	function dl(e) {
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
	function Uc(e, t, n, u, l, r) {
		var o = 0;
		if (((u = e), typeof e == 'function')) dl(e) && (o = 1);
		else if (typeof e == 'string')
			o = sd(e, n, U.current)
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
						(e.lanes = r),
						e
					);
				case ze:
					return En(n.children, l, r, t);
				case St:
					(o = 8), (l |= 24);
					break;
				case Fe:
					return (
						(e = Ie(12, n, t, l | 2)),
						(e.elementType = Fe),
						(e.lanes = r),
						e
					);
				case Ot:
					return (
						(e = Ie(13, n, t, l)),
						(e.elementType = Ot),
						(e.lanes = r),
						e
					);
				case Ue:
					return (
						(e = Ie(19, n, t, l)),
						(e.elementType = Ue),
						(e.lanes = r),
						e
					);
				default:
					if (typeof e == 'object' && e !== null)
						switch (e.$$typeof) {
							case Re:
								o = 10;
								break e;
							case Zt:
								o = 9;
								break e;
							case at:
								o = 11;
								break e;
							case k:
								o = 14;
								break e;
							case Be:
								(o = 16), (u = null);
								break e;
						}
					(o = 29),
						(n = Error(f(130, e === null ? 'null' : typeof e, ''))),
						(u = null);
			}
		return (
			(t = Ie(o, n, t, l)),
			(t.elementType = e),
			(t.type = u),
			(t.lanes = r),
			t
		);
	}
	function En(e, t, n, u) {
		return (e = Ie(7, e, u, t)), (e.lanes = n), e;
	}
	function gl(e, t, n) {
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
		La = 0,
		rt = [],
		ft = 0,
		Jt = null,
		ht = 1,
		wt = '';
	function Rt(e, t) {
		(Pn[ea++] = La), (Pn[ea++] = Bc), (Bc = e), (La = t);
	}
	function tf(e, t, n) {
		(rt[ft++] = ht), (rt[ft++] = wt), (rt[ft++] = Jt), (Jt = e);
		var u = ht;
		e = wt;
		var l = 32 - Je(u) - 1;
		(u &= ~(1 << l)), (n += 1);
		var r = 32 - Je(t) + l;
		if (30 < r) {
			var o = l - (l % 5);
			(r = (u & ((1 << o) - 1)).toString(32)),
				(u >>= o),
				(l -= o),
				(ht = (1 << (32 - Je(t) + l)) | (n << l) | u),
				(wt = r + e);
		} else (ht = (1 << r) | (n << l) | u), (wt = e);
	}
	function pl(e) {
		e.return !== null && (Rt(e, 1), tf(e, 1, 0));
	}
	function Ol(e) {
		for (; e === Bc; )
			(Bc = Pn[--ea]), (Pn[ea] = null), (La = Pn[--ea]), (Pn[ea] = null);
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
		oe = null,
		I = false,
		kt = null,
		ot = false,
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
		throw (Ga(it(t, e)), yl);
	}
	function af(e) {
		var t = e.stateNode,
			n = e.type,
			u = e.memoizedProps;
		switch (((t[Se] = e), (t[Ge] = u), n)) {
			case 'dialog':
				F('cancel', t), F('close', t);
				break;
			case 'iframe':
			case 'object':
			case 'embed':
				F('load', t);
				break;
			case 'video':
			case 'audio':
				for (n = 0; n < ic.length; n++) F(ic[n], t);
				break;
			case 'source':
				F('error', t);
				break;
			case 'img':
			case 'image':
			case 'link':
				F('error', t), F('load', t);
				break;
			case 'details':
				F('toggle', t);
				break;
			case 'input':
				F('invalid', t),
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
				F('invalid', t);
				break;
			case 'textarea':
				F('invalid', t), Or(t, u.value, u.defaultValue, u.children);
		}
		(n = u.children),
			(typeof n != 'string' &&
				typeof n != 'number' &&
				typeof n != 'bigint') ||
			t.textContent === '' + n ||
			u.suppressHydrationWarning === true ||
			w_(t.textContent, n)
				? (u.popover != null && (F('beforetoggle', t), F('toggle', t)),
					u.onScroll != null && F('scroll', t),
					u.onScrollEnd != null && F('scrollend', t),
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
					ot = false;
					return;
				case 27:
				case 3:
					ot = true;
					return;
				default:
					Ee = Ee.return;
			}
	}
	function ta(e) {
		if (e !== Ee) return false;
		if (!I) return cf(e), (I = true), false;
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
			n && oe && It(e),
			cf(e),
			t === 13)
		) {
			if (
				((e = e.memoizedState),
				(e = e !== null ? e.dehydrated : null),
				!e)
			)
				throw Error(f(317));
			oe = R_(e);
		} else if (t === 31) {
			if (
				((e = e.memoizedState),
				(e = e !== null ? e.dehydrated : null),
				!e)
			)
				throw Error(f(317));
			oe = R_(e);
		} else
			t === 27
				? ((t = oe),
					sn(e.type) ? ((e = Yi), (Yi = null), (oe = e)) : (oe = t))
				: (oe = Ee ? st(e.stateNode.nextSibling) : null);
		return true;
	}
	function An() {
		(oe = Ee = null), (I = false);
	}
	function jl() {
		var e = kt;
		return (
			e !== null &&
				(Qe === null ? (Qe = e) : Qe.push.apply(Qe, e), (kt = null)),
			e
		);
	}
	function Ga(e) {
		kt === null ? (kt = [e]) : kt.push(e);
	}
	var hl = m(null),
		Tn = null,
		Ct = null;
	function $t(e, t, n) {
		H(hl, t._currentValue), (t._currentValue = n);
	}
	function zt(e) {
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
			var r = l.dependencies;
			if (r !== null) {
				var o = l.child;
				r = r.firstContext;
				e: for (; r !== null; ) {
					var s = r;
					r = l;
					for (var d = 0; d < t.length; d++)
						if (s.context === t[d]) {
							(r.lanes |= n),
								(s = r.alternate),
								s !== null && (s.lanes |= n),
								wl(r.return, n, e),
								u || (o = null);
							break e;
						}
					r = s.next;
				}
			} else if (l.tag === 18) {
				if (((o = l.return), o === null)) throw Error(f(341));
				(o.lanes |= n),
					(r = o.alternate),
					r !== null && (r.lanes |= n),
					wl(o, n, e),
					(o = null);
			} else o = l.child;
			if (o !== null) o.return = l;
			else
				for (o = l; o !== null; ) {
					if (o === e) {
						o = null;
						break;
					}
					if (((l = o.sibling), l !== null)) {
						(l.return = o.return), (o = l);
						break;
					}
					o = o.return;
				}
			l = o;
		}
	}
	function na(e, t, n, u) {
		e = null;
		for (var l = t, r = false; l !== null; ) {
			if (!r) {
				if ((l.flags & 524288) !== 0) r = true;
				else if ((l.flags & 262144) !== 0) break;
			}
			if (l.tag === 10) {
				var o = l.alternate;
				if (o === null) throw Error(f(387));
				if (((o = o.memoizedProps), o !== null)) {
					var s = l.type;
					ke(l.pendingProps.value, o.value) ||
						(e !== null ? e.push(s) : (e = [s]));
				}
			} else if (l === te.current) {
				if (((o = l.alternate), o === null)) throw Error(f(387));
				o.memoizedState.memoizedState !==
					l.memoizedState.memoizedState &&
					(e !== null ? e.push(sc) : (e = [sc]));
			}
			l = l.return;
		}
		e !== null && vl(t, e, n, u), (t.flags |= 262144);
	}
	function Lc(e) {
		for (e = e.firstContext; e !== null; ) {
			if (!ke(e.context._currentValue, e.memoizedValue)) return true;
			e = e.next;
		}
		return false;
	}
	function Mn(e) {
		(Tn = e),
			(Ct = null),
			(e = e.dependencies),
			e !== null && (e.firstContext = null);
	}
	function Ae(e) {
		return uf(Tn, e);
	}
	function Gc(e, t) {
		return Tn === null && Mn(e), uf(e, t);
	}
	function uf(e, t) {
		var n = t._currentValue;
		if (((t = { context: t, memoizedValue: n, next: null }), Ct === null)) {
			if (e === null) throw Error(f(308));
			(Ct = t),
				(e.dependencies = { lanes: 0, firstContext: t }),
				(e.flags |= 524288);
		} else Ct = Ct.next = t;
		return n;
	}
	var rb =
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
		fb = a.unstable_scheduleCallback,
		ob = a.unstable_NormalPriority,
		Oe = {
			$$typeof: Re,
			Consumer: null,
			Provider: null,
			_currentValue: null,
			_currentValue2: null,
			_threadCount: 0,
		};
	function xl() {
		return {
			controller: new rb(),
			data: /* @__PURE__ */ new Map(),
			refCount: 0,
		};
	}
	function qa(e) {
		e.refCount--,
			e.refCount === 0 &&
				fb(ob, function () {
					e.controller.abort();
				});
	}
	var Va = null,
		Sl = 0,
		aa = 0,
		ca = null;
	function _b(e, t) {
		if (Va === null) {
			var n = (Va = []);
			(Sl = 0),
				(aa = Ti()),
				(ca = {
					status: 'pending',
					value: void 0,
					then: function (u) {
						n.push(u);
					},
				});
		}
		return Sl++, t.then(lf, lf), t;
	}
	function lf() {
		if (--Sl === 0 && Va !== null) {
			ca !== null && (ca.status = 'fulfilled');
			var e = Va;
			(Va = null), (aa = 0), (ca = null);
			for (var t = 0; t < e.length; t++) (0, e[t])();
		}
	}
	function sb(e, t) {
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
	var rf = A.S;
	A.S = function (e, t) {
		(Fo = We()),
			typeof t == 'object' &&
				t !== null &&
				typeof t.then == 'function' &&
				_b(e, t),
			rf !== null && rf(e, t);
	};
	var Dn = m(null);
	function El() {
		var e = Dn.current;
		return e !== null ? e : fe.pooledCache;
	}
	function qc(e, t) {
		t === null ? H(Dn, Dn.current) : H(Dn, t.pool);
	}
	function ff() {
		var e = El();
		return e === null ? null : { parent: Oe._currentValue, pool: e };
	}
	var ua = Error(f(460)),
		Al = Error(f(474)),
		Vc = Error(f(542)),
		Yc = { then: function () {} };
	function of(e) {
		return (e = e.status), e === 'fulfilled' || e === 'rejected';
	}
	function _f(e, t, n) {
		switch (
			((n = e[n]),
			n === void 0 ? e.push(t) : n !== t && (t.then(Tt, Tt), (t = n)),
			t.status)
		) {
			case 'fulfilled':
				return t.value;
			case 'rejected':
				throw ((e = t.reason), bf(e), e);
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
						throw ((e = t.reason), bf(e), e);
				}
				throw ((Cn = t), ua);
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
				? ((Cn = n), ua)
				: n;
		}
	}
	var Cn = null;
	function sf() {
		if (Cn === null) throw Error(f(459));
		var e = Cn;
		return (Cn = null), e;
	}
	function bf(e) {
		if (e === ua || e === Vc) throw Error(f(483));
	}
	var la = null,
		Ya = 0;
	function Xc(e) {
		var t = Ya;
		return (Ya += 1), la === null && (la = []), _f(la, e, t);
	}
	function Xa(e, t) {
		(t = t.props.ref), (e.ref = t !== void 0 ? t : null);
	}
	function Qc(e, t) {
		throw t.$$typeof === J
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
	function df(e) {
		function t(O, g) {
			if (e) {
				var j = O.deletions;
				j === null ? ((O.deletions = [g]), (O.flags |= 16)) : j.push(g);
			}
		}
		function n(O, g) {
			if (!e) return null;
			for (; g !== null; ) t(O, g), (g = g.sibling);
			return null;
		}
		function u(O) {
			for (var g = /* @__PURE__ */ new Map(); O !== null; )
				O.key !== null ? g.set(O.key, O) : g.set(O.index, O),
					(O = O.sibling);
			return g;
		}
		function l(O, g) {
			return (O = Dt(O, g)), (O.index = 0), (O.sibling = null), O;
		}
		function r(O, g, j) {
			return (
				(O.index = j),
				e
					? ((j = O.alternate),
						j !== null
							? ((j = j.index),
								j < g ? ((O.flags |= 67108866), g) : j)
							: ((O.flags |= 67108866), g))
					: ((O.flags |= 1048576), g)
			);
		}
		function o(O) {
			return e && O.alternate === null && (O.flags |= 67108866), O;
		}
		function s(O, g, j, T) {
			return g === null || g.tag !== 6
				? ((g = gl(j, O.mode, T)), (g.return = O), g)
				: ((g = l(g, j)), (g.return = O), g);
		}
		function d(O, g, j, T) {
			var L = j.type;
			return L === ze
				? E(O, g, j.props.children, T, j.key)
				: g !== null &&
					  (g.elementType === L ||
							(typeof L == 'object' &&
								L !== null &&
								L.$$typeof === Be &&
								Rn(L) === g.type))
					? ((g = l(g, j.props)), Xa(g, j), (g.return = O), g)
					: ((g = Uc(j.type, j.key, j.props, null, O.mode, T)),
						Xa(g, j),
						(g.return = O),
						g);
		}
		function h(O, g, j, T) {
			return g === null ||
				g.tag !== 4 ||
				g.stateNode.containerInfo !== j.containerInfo ||
				g.stateNode.implementation !== j.implementation
				? ((g = ml(j, O.mode, T)), (g.return = O), g)
				: ((g = l(g, j.children || [])), (g.return = O), g);
		}
		function E(O, g, j, T, L) {
			return g === null || g.tag !== 7
				? ((g = En(j, O.mode, T, L)), (g.return = O), g)
				: ((g = l(g, j)), (g.return = O), g);
		}
		function M(O, g, j) {
			if (
				(typeof g == 'string' && g !== '') ||
				typeof g == 'number' ||
				typeof g == 'bigint'
			)
				return (g = gl('' + g, O.mode, j)), (g.return = O), g;
			if (typeof g == 'object' && g !== null) {
				switch (g.$$typeof) {
					case Ce:
						return (
							(j = Uc(g.type, g.key, g.props, null, O.mode, j)),
							Xa(j, g),
							(j.return = O),
							j
						);
					case De:
						return (g = ml(g, O.mode, j)), (g.return = O), g;
					case Be:
						return (g = Rn(g)), M(O, g, j);
				}
				if (dt(g) || Le(g))
					return (g = En(g, O.mode, j, null)), (g.return = O), g;
				if (typeof g.then == 'function') return M(O, Xc(g), j);
				if (g.$$typeof === Re) return M(O, Gc(O, g), j);
				Qc(O, g);
			}
			return null;
		}
		function w(O, g, j, T) {
			var L = g !== null ? g.key : null;
			if (
				(typeof j == 'string' && j !== '') ||
				typeof j == 'number' ||
				typeof j == 'bigint'
			)
				return L !== null ? null : s(O, g, '' + j, T);
			if (typeof j == 'object' && j !== null) {
				switch (j.$$typeof) {
					case Ce:
						return j.key === L ? d(O, g, j, T) : null;
					case De:
						return j.key === L ? h(O, g, j, T) : null;
					case Be:
						return (j = Rn(j)), w(O, g, j, T);
				}
				if (dt(j) || Le(j))
					return L !== null ? null : E(O, g, j, T, null);
				if (typeof j.then == 'function') return w(O, g, Xc(j), T);
				if (j.$$typeof === Re) return w(O, g, Gc(O, j), T);
				Qc(O, j);
			}
			return null;
		}
		function S(O, g, j, T, L) {
			if (
				(typeof T == 'string' && T !== '') ||
				typeof T == 'number' ||
				typeof T == 'bigint'
			)
				return (O = O.get(j) || null), s(g, O, '' + T, L);
			if (typeof T == 'object' && T !== null) {
				switch (T.$$typeof) {
					case Ce:
						return (
							(O = O.get(T.key === null ? j : T.key) || null),
							d(g, O, T, L)
						);
					case De:
						return (
							(O = O.get(T.key === null ? j : T.key) || null),
							h(g, O, T, L)
						);
					case Be:
						return (T = Rn(T)), S(O, g, j, T, L);
				}
				if (dt(T) || Le(T))
					return (O = O.get(j) || null), E(g, O, T, L, null);
				if (typeof T.then == 'function') return S(O, g, j, Xc(T), L);
				if (T.$$typeof === Re) return S(O, g, j, Gc(g, T), L);
				Qc(g, T);
			}
			return null;
		}
		function N(O, g, j, T) {
			for (
				var L = null, $ = null, B = g, X = (g = 0), K = null;
				B !== null && X < j.length;
				X++
			) {
				B.index > X ? ((K = B), (B = null)) : (K = B.sibling);
				var P = w(O, B, j[X], T);
				if (P === null) {
					B === null && (B = K);
					break;
				}
				e && B && P.alternate === null && t(O, B),
					(g = r(P, g, X)),
					$ === null ? (L = P) : ($.sibling = P),
					($ = P),
					(B = K);
			}
			if (X === j.length) return n(O, B), I && Rt(O, X), L;
			if (B === null) {
				for (; X < j.length; X++)
					(B = M(O, j[X], T)),
						B !== null &&
							((g = r(B, g, X)),
							$ === null ? (L = B) : ($.sibling = B),
							($ = B));
				return I && Rt(O, X), L;
			}
			for (B = u(B); X < j.length; X++)
				(K = S(B, O, X, j[X], T)),
					K !== null &&
						(e &&
							K.alternate !== null &&
							B.delete(K.key === null ? X : K.key),
						(g = r(K, g, X)),
						$ === null ? (L = K) : ($.sibling = K),
						($ = K));
			return (
				e &&
					B.forEach(function (pn) {
						return t(O, pn);
					}),
				I && Rt(O, X),
				L
			);
		}
		function G(O, g, j, T) {
			if (j == null) throw Error(f(151));
			for (
				var L = null,
					$ = null,
					B = g,
					X = (g = 0),
					K = null,
					P = j.next();
				B !== null && !P.done;
				X++, P = j.next()
			) {
				B.index > X ? ((K = B), (B = null)) : (K = B.sibling);
				var pn = w(O, B, P.value, T);
				if (pn === null) {
					B === null && (B = K);
					break;
				}
				e && B && pn.alternate === null && t(O, B),
					(g = r(pn, g, X)),
					$ === null ? (L = pn) : ($.sibling = pn),
					($ = pn),
					(B = K);
			}
			if (P.done) return n(O, B), I && Rt(O, X), L;
			if (B === null) {
				for (; !P.done; X++, P = j.next())
					(P = M(O, P.value, T)),
						P !== null &&
							((g = r(P, g, X)),
							$ === null ? (L = P) : ($.sibling = P),
							($ = P));
				return I && Rt(O, X), L;
			}
			for (B = u(B); !P.done; X++, P = j.next())
				(P = S(B, O, X, P.value, T)),
					P !== null &&
						(e &&
							P.alternate !== null &&
							B.delete(P.key === null ? X : P.key),
						(g = r(P, g, X)),
						$ === null ? (L = P) : ($.sibling = P),
						($ = P));
			return (
				e &&
					B.forEach(function (vd) {
						return t(O, vd);
					}),
				I && Rt(O, X),
				L
			);
		}
		function ie(O, g, j, T) {
			if (
				(typeof j == 'object' &&
					j !== null &&
					j.type === ze &&
					j.key === null &&
					(j = j.props.children),
				typeof j == 'object' && j !== null)
			) {
				switch (j.$$typeof) {
					case Ce:
						e: {
							for (var L = j.key; g !== null; ) {
								if (g.key === L) {
									if (((L = j.type), L === ze)) {
										if (g.tag === 7) {
											n(O, g.sibling),
												(T = l(g, j.props.children)),
												(T.return = O),
												(O = T);
											break e;
										}
									} else if (
										g.elementType === L ||
										(typeof L == 'object' &&
											L !== null &&
											L.$$typeof === Be &&
											Rn(L) === g.type)
									) {
										n(O, g.sibling),
											(T = l(g, j.props)),
											Xa(T, j),
											(T.return = O),
											(O = T);
										break e;
									}
									n(O, g);
									break;
								} else t(O, g);
								g = g.sibling;
							}
							j.type === ze
								? ((T = En(j.props.children, O.mode, T, j.key)),
									(T.return = O),
									(O = T))
								: ((T = Uc(
										j.type,
										j.key,
										j.props,
										null,
										O.mode,
										T,
									)),
									Xa(T, j),
									(T.return = O),
									(O = T));
						}
						return o(O);
					case De:
						e: {
							for (L = j.key; g !== null; ) {
								if (g.key === L)
									if (
										g.tag === 4 &&
										g.stateNode.containerInfo ===
											j.containerInfo &&
										g.stateNode.implementation ===
											j.implementation
									) {
										n(O, g.sibling),
											(T = l(g, j.children || [])),
											(T.return = O),
											(O = T);
										break e;
									} else {
										n(O, g);
										break;
									}
								else t(O, g);
								g = g.sibling;
							}
							(T = ml(j, O.mode, T)), (T.return = O), (O = T);
						}
						return o(O);
					case Be:
						return (j = Rn(j)), ie(O, g, j, T);
				}
				if (dt(j)) return N(O, g, j, T);
				if (Le(j)) {
					if (((L = Le(j)), typeof L != 'function'))
						throw Error(f(150));
					return (j = L.call(j)), G(O, g, j, T);
				}
				if (typeof j.then == 'function') return ie(O, g, Xc(j), T);
				if (j.$$typeof === Re) return ie(O, g, Gc(O, j), T);
				Qc(O, j);
			}
			return (typeof j == 'string' && j !== '') ||
				typeof j == 'number' ||
				typeof j == 'bigint'
				? ((j = '' + j),
					g !== null && g.tag === 6
						? (n(O, g.sibling),
							(T = l(g, j)),
							(T.return = O),
							(O = T))
						: (n(O, g),
							(T = gl(j, O.mode, T)),
							(T.return = O),
							(O = T)),
					o(O))
				: n(O, g);
		}
		return function (O, g, j, T) {
			try {
				Ya = 0;
				var L = ie(O, g, j, T);
				return (la = null), L;
			} catch (B) {
				if (B === ua || B === Vc) throw B;
				var $ = Ie(29, B, null, O.mode);
				return ($.lanes = T), ($.return = O), $;
			} finally {
			}
		};
	}
	var zn = df(true),
		gf = df(false),
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
				(t = Nc(e)),
				Ir(e, null, n),
				t
			);
		}
		return Hc(e, u, t, n), Nc(e);
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
				r = null;
			if (((n = n.firstBaseUpdate), n !== null)) {
				do {
					var o = {
						lane: n.lane,
						tag: n.tag,
						payload: n.payload,
						callback: null,
						next: null,
					};
					r === null ? (l = r = o) : (r = r.next = o), (n = n.next);
				} while (n !== null);
				r === null ? (l = r = t) : (r = r.next = t);
			} else l = r = t;
			(n = {
				baseState: u.baseState,
				firstBaseUpdate: l,
				lastBaseUpdate: r,
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
	function Fa(e, t, n, u) {
		Rl = false;
		var l = e.updateQueue;
		Pt = false;
		var r = l.firstBaseUpdate,
			o = l.lastBaseUpdate,
			s = l.shared.pending;
		if (s !== null) {
			l.shared.pending = null;
			var d = s,
				h = d.next;
			(d.next = null), o === null ? (r = h) : (o.next = h), (o = d);
			var E = e.alternate;
			E !== null &&
				((E = E.updateQueue),
				(s = E.lastBaseUpdate),
				s !== o &&
					(s === null ? (E.firstBaseUpdate = h) : (s.next = h),
					(E.lastBaseUpdate = d)));
		}
		if (r !== null) {
			var M = l.baseState;
			(o = 0), (E = h = d = null), (s = r);
			do {
				var w = s.lane & -536870913,
					S = w !== s.lane;
				if (S ? (W & w) === w : (u & w) === w) {
					w !== 0 && w === aa && (Rl = true),
						E !== null &&
							(E = E.next =
								{
									lane: 0,
									tag: s.tag,
									payload: s.payload,
									callback: null,
									next: null,
								});
					e: {
						var N = e,
							G = s;
						w = t;
						var ie = n;
						switch (G.tag) {
							case 1:
								if (((N = G.payload), typeof N == 'function')) {
									M = N.call(ie, M, w);
									break e;
								}
								M = N;
								break e;
							case 3:
								N.flags = (N.flags & -65537) | 128;
							case 0:
								if (
									((N = G.payload),
									(w =
										typeof N == 'function'
											? N.call(ie, M, w)
											: N),
									w == null)
								)
									break e;
								M = R({}, M, w);
								break e;
							case 2:
								Pt = true;
						}
					}
					(w = s.callback),
						w !== null &&
							((e.flags |= 64),
							S && (e.flags |= 8192),
							(S = l.callbacks),
							S === null ? (l.callbacks = [w]) : S.push(w));
				} else
					(S = {
						lane: w,
						tag: s.tag,
						payload: s.payload,
						callback: s.callback,
						next: null,
					}),
						E === null ? ((h = E = S), (d = M)) : (E = E.next = S),
						(o |= w);
				if (((s = s.next), s === null)) {
					if (((s = l.shared.pending), s === null)) break;
					(S = s),
						(s = S.next),
						(S.next = null),
						(l.lastBaseUpdate = S),
						(l.shared.pending = null);
				}
			} while (true);
			E === null && (d = M),
				(l.baseState = d),
				(l.firstBaseUpdate = h),
				(l.lastBaseUpdate = E),
				r === null && (l.shared.lanes = 0),
				(ln |= o),
				(e.lanes = o),
				(e.memoizedState = M);
		}
	}
	function mf(e, t) {
		if (typeof e != 'function') throw Error(f(191, e));
		e.call(t);
	}
	function pf(e, t) {
		var n = e.callbacks;
		if (n !== null)
			for (e.callbacks = null, e = 0; e < n.length; e++) mf(n[e], t);
	}
	var ia = m(null),
		Zc = m(0);
	function Of(e, t) {
		(e = Yt), H(Zc, e), H(ia, t), (Yt = e | t.baseLanes);
	}
	function Cl() {
		H(Zc, Yt), H(ia, ia.current);
	}
	function zl() {
		(Yt = Zc.current), D(ia), D(Zc);
	}
	var $e = m(null),
		_t = null;
	function nn(e) {
		var t = e.alternate;
		H(me, me.current & 1),
			H($e, e),
			_t === null &&
				(t === null ||
					ia.current !== null ||
					t.memoizedState !== null) &&
				(_t = e);
	}
	function Hl(e) {
		H(me, me.current), H($e, e), _t === null && (_t = e);
	}
	function yf(e) {
		e.tag === 22
			? (H(me, me.current), H($e, e), _t === null && (_t = e))
			: an();
	}
	function an() {
		H(me, me.current), H($e, $e.current);
	}
	function Pe(e) {
		D($e), _t === e && (_t = null), D(me);
	}
	var me = m(0);
	function Fc(e) {
		for (var t = e; t !== null; ) {
			if (t.tag === 13) {
				var n = t.memoizedState;
				if (
					n !== null &&
					((n = n.dehydrated), n === null || qi(n) || Vi(n))
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
		Kc = 0,
		Wa = 0,
		fa = null,
		bb = 0;
	function be() {
		throw Error(f(321));
	}
	function Nl(e, t) {
		if (t === null) return false;
		for (var n = 0; n < t.length && n < e.length; n++)
			if (!ke(e[n], t[n])) return false;
		return true;
	}
	function Ul(e, t, n, u, l, r) {
		return (
			(Ht = r),
			(Y = t),
			(t.memoizedState = null),
			(t.updateQueue = null),
			(t.lanes = 0),
			(A.H = e === null || e.memoizedState === null ? no : Il),
			(Hn = false),
			(r = n(u, l)),
			(Hn = false),
			ra && (r = hf(t, n, u, l)),
			jf(e),
			r
		);
	}
	function jf(e) {
		A.H = ka;
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
			((e = e.dependencies), e !== null && Lc(e) && (je = true));
	}
	function hf(e, t, n, u) {
		Y = e;
		var l = 0;
		do {
			if ((ra && (fa = null), (Wa = 0), (ra = false), 25 <= l))
				throw Error(f(301));
			if (((l += 1), (ye = ue = null), e.updateQueue != null)) {
				var r = e.updateQueue;
				(r.lastEffect = null),
					(r.events = null),
					(r.stores = null),
					r.memoCache != null && (r.memoCache.index = 0);
			}
			(A.H = ao), (r = t(n, u));
		} while (ra);
		return r;
	}
	function db() {
		var e = A.H,
			t = e.useState()[0];
		return (
			(t = typeof t.then == 'function' ? Ka(t) : t),
			(e = e.useState()[0]),
			(ue !== null ? ue.memoizedState : null) !== e && (Y.flags |= 1024),
			t
		);
	}
	function Bl() {
		var e = Kc !== 0;
		return (Kc = 0), e;
	}
	function Ll(e, t, n) {
		(t.updateQueue = e.updateQueue), (t.flags &= -2053), (e.lanes &= ~n);
	}
	function Gl(e) {
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
			(Wa = Kc = 0),
			(fa = null);
	}
	function Ne() {
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
	function pe() {
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
	function Ka(e) {
		var t = Wa;
		return (
			(Wa += 1),
			fa === null && (fa = []),
			(e = _f(fa, e, t)),
			(t = Y),
			(ye === null ? t.memoizedState : ye.next) === null &&
				((t = t.alternate),
				(A.H = t === null || t.memoizedState === null ? no : Il)),
			e
		);
	}
	function kc(e) {
		if (e !== null && typeof e == 'object') {
			if (typeof e.then == 'function') return Ka(e);
			if (e.$$typeof === Re) return Ae(e);
		}
		throw Error(f(438, String(e)));
	}
	function ql(e) {
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
			for (n = t.data[t.index] = Array(e), u = 0; u < e; u++) n[u] = Ln;
		return t.index++, n;
	}
	function Nt(e, t) {
		return typeof t == 'function' ? t(e) : t;
	}
	function Ic(e) {
		var t = pe();
		return Vl(t, ue, e);
	}
	function Vl(e, t, n) {
		var u = e.queue;
		if (u === null) throw Error(f(311));
		u.lastRenderedReducer = n;
		var l = e.baseQueue,
			r = u.pending;
		if (r !== null) {
			if (l !== null) {
				var o = l.next;
				(l.next = r.next), (r.next = o);
			}
			(t.baseQueue = l = r), (u.pending = null);
		}
		if (((r = e.baseState), l === null)) e.memoizedState = r;
		else {
			t = l.next;
			var s = (o = null),
				d = null,
				h = t,
				E = false;
			do {
				var M = h.lane & -536870913;
				if (M !== h.lane ? (W & M) === M : (Ht & M) === M) {
					var w = h.revertLane;
					if (w === 0)
						d !== null &&
							(d = d.next =
								{
									lane: 0,
									revertLane: 0,
									gesture: null,
									action: h.action,
									hasEagerState: h.hasEagerState,
									eagerState: h.eagerState,
									next: null,
								}),
							M === aa && (E = true);
					else if ((Ht & w) === w) {
						(h = h.next), w === aa && (E = true);
						continue;
					} else
						(M = {
							lane: 0,
							revertLane: h.revertLane,
							gesture: null,
							action: h.action,
							hasEagerState: h.hasEagerState,
							eagerState: h.eagerState,
							next: null,
						}),
							d === null
								? ((s = d = M), (o = r))
								: (d = d.next = M),
							(Y.lanes |= w),
							(ln |= w);
					(M = h.action),
						Hn && n(r, M),
						(r = h.hasEagerState ? h.eagerState : n(r, M));
				} else
					(w = {
						lane: M,
						revertLane: h.revertLane,
						gesture: h.gesture,
						action: h.action,
						hasEagerState: h.hasEagerState,
						eagerState: h.eagerState,
						next: null,
					}),
						d === null ? ((s = d = w), (o = r)) : (d = d.next = w),
						(Y.lanes |= M),
						(ln |= M);
				h = h.next;
			} while (h !== null && h !== t);
			if (
				(d === null ? (o = r) : (d.next = s),
				!ke(r, e.memoizedState) &&
					((je = true), E && ((n = ca), n !== null)))
			)
				throw n;
			(e.memoizedState = r),
				(e.baseState = o),
				(e.baseQueue = d),
				(u.lastRenderedState = r);
		}
		return l === null && (u.lanes = 0), [e.memoizedState, u.dispatch];
	}
	function Yl(e) {
		var t = pe(),
			n = t.queue;
		if (n === null) throw Error(f(311));
		n.lastRenderedReducer = e;
		var u = n.dispatch,
			l = n.pending,
			r = t.memoizedState;
		if (l !== null) {
			n.pending = null;
			var o = (l = l.next);
			do (r = e(r, o.action)), (o = o.next);
			while (o !== l);
			ke(r, t.memoizedState) || (je = true),
				(t.memoizedState = r),
				t.baseQueue === null && (t.baseState = r),
				(n.lastRenderedState = r);
		}
		return [r, u];
	}
	function wf(e, t, n) {
		var u = Y,
			l = pe(),
			r = I;
		if (r) {
			if (n === void 0) throw Error(f(407));
			n = n();
		} else n = t();
		var o = !ke((ue || l).memoizedState, n);
		if (
			(o && ((l.memoizedState = n), (je = true)),
			(l = l.queue),
			Zl(Sf.bind(null, u, l, e), [e]),
			l.getSnapshot !== t ||
				o ||
				(ye !== null && ye.memoizedState.tag & 1))
		) {
			if (
				((u.flags |= 2048),
				oa(9, { destroy: void 0 }, xf.bind(null, u, l, n, t), null),
				fe === null)
			)
				throw Error(f(349));
			r || (Ht & 127) !== 0 || vf(u, t, n);
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
	function xf(e, t, n, u) {
		(t.value = n), (t.getSnapshot = u), Ef(t) && Af(e);
	}
	function Sf(e, t, n) {
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
		var t = Sn(e, 2);
		t !== null && Ze(t, e, 2);
	}
	function Xl(e) {
		var t = Ne();
		if (typeof e == 'function') {
			var n = e;
			if (((e = n()), Hn)) {
				Ft(true);
				try {
					n();
				} finally {
					Ft(false);
				}
			}
		}
		return (
			(t.memoizedState = t.baseState = e),
			(t.queue = {
				pending: null,
				lanes: 0,
				dispatch: null,
				lastRenderedReducer: Nt,
				lastRenderedState: e,
			}),
			t
		);
	}
	function Tf(e, t, n, u) {
		return (e.baseState = n), Vl(e, ue, typeof u == 'function' ? u : Nt);
	}
	function gb(e, t, n, u, l) {
		if (eu(e)) throw Error(f(485));
		if (((e = t.action), e !== null)) {
			var r = {
				payload: l,
				action: e,
				next: null,
				isTransition: true,
				status: 'pending',
				value: null,
				reason: null,
				listeners: [],
				then: function (o) {
					r.listeners.push(o);
				},
			};
			A.T !== null ? n(true) : (r.isTransition = false),
				u(r),
				(n = t.pending),
				n === null
					? ((r.next = t.pending = r), Mf(t, r))
					: ((r.next = n.next), (t.pending = n.next = r));
		}
	}
	function Mf(e, t) {
		var n = t.action,
			u = t.payload,
			l = e.state;
		if (t.isTransition) {
			var r = A.T,
				o = {};
			A.T = o;
			try {
				var s = n(l, u),
					d = A.S;
				d !== null && d(o, s), Df(e, t, s);
			} catch (h) {
				Ql(e, t, h);
			} finally {
				r !== null && o.types !== null && (r.types = o.types),
					(A.T = r);
			}
		} else
			try {
				(r = n(l, u)), Df(e, t, r);
			} catch (h) {
				Ql(e, t, h);
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
			Cf(t),
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
			do (t.status = 'rejected'), (t.reason = n), Cf(t), (t = t.next);
			while (t !== u);
		}
		e.action = null;
	}
	function Cf(e) {
		e = e.listeners;
		for (var t = 0; t < e.length; t++) (0, e[t])();
	}
	function zf(e, t) {
		return t;
	}
	function Hf(e, t) {
		if (I) {
			var n = fe.formState;
			if (n !== null) {
				e: {
					var u = Y;
					if (I) {
						if (oe) {
							t: {
								for (var l = oe, r = ot; l.nodeType !== 8; ) {
									if (!r) {
										l = null;
										break t;
									}
									if (((l = st(l.nextSibling)), l === null)) {
										l = null;
										break t;
									}
								}
								(r = l.data),
									(l = r === 'F!' || r === 'F' ? l : null);
							}
							if (l) {
								(oe = st(l.nextSibling)), (u = l.data === 'F!');
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
			(n = Ne()),
			(n.memoizedState = n.baseState = t),
			(u = {
				pending: null,
				lanes: 0,
				dispatch: null,
				lastRenderedReducer: zf,
				lastRenderedState: t,
			}),
			(n.queue = u),
			(n = Pf.bind(null, Y, u)),
			(u.dispatch = n),
			(u = Xl(false)),
			(r = kl.bind(null, Y, false, u.queue)),
			(u = Ne()),
			(l = { state: t, dispatch: null, action: e, pending: null }),
			(u.queue = l),
			(n = gb.bind(null, Y, l, r, n)),
			(l.dispatch = n),
			(u.memoizedState = e),
			[t, n, false]
		);
	}
	function Nf(e) {
		var t = pe();
		return Uf(t, ue, e);
	}
	function Uf(e, t, n) {
		if (
			((t = Vl(e, t, zf)[0]),
			(e = Ic(Nt)[0]),
			typeof t == 'object' && t !== null && typeof t.then == 'function')
		)
			try {
				var u = Ka(t);
			} catch (o) {
				throw o === ua ? Vc : o;
			}
		else u = t;
		t = pe();
		var l = t.queue,
			r = l.dispatch;
		return (
			n !== t.memoizedState &&
				((Y.flags |= 2048),
				oa(9, { destroy: void 0 }, mb.bind(null, l, n), null)),
			[u, r, e]
		);
	}
	function mb(e, t) {
		e.action = t;
	}
	function Bf(e) {
		var t = pe(),
			n = ue;
		if (n !== null) return Uf(t, n, e);
		pe(), (t = t.memoizedState), (n = pe());
		var u = n.queue.dispatch;
		return (n.memoizedState = e), [t, u, false];
	}
	function oa(e, t, n, u) {
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
	function Lf() {
		return pe().memoizedState;
	}
	function $c(e, t, n, u) {
		var l = Ne();
		(Y.flags |= e),
			(l.memoizedState = oa(
				1 | t,
				{ destroy: void 0 },
				n,
				u === void 0 ? null : u,
			));
	}
	function Pc(e, t, n, u) {
		var l = pe();
		u = u === void 0 ? null : u;
		var r = l.memoizedState.inst;
		ue !== null && u !== null && Nl(u, ue.memoizedState.deps)
			? (l.memoizedState = oa(t, r, n, u))
			: ((Y.flags |= e), (l.memoizedState = oa(1 | t, r, n, u)));
	}
	function Gf(e, t) {
		$c(8390656, 8, e, t);
	}
	function Zl(e, t) {
		Pc(2048, 8, e, t);
	}
	function pb(e) {
		Y.flags |= 4;
		var t = Y.updateQueue;
		if (t === null) (t = Jc()), (Y.updateQueue = t), (t.events = [e]);
		else {
			var n = t.events;
			n === null ? (t.events = [e]) : n.push(e);
		}
	}
	function qf(e) {
		var t = pe().memoizedState;
		return (
			pb({ ref: t, nextImpl: e }),
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
	function Fl() {}
	function Zf(e, t) {
		var n = pe();
		t = t === void 0 ? null : t;
		var u = n.memoizedState;
		return t !== null && Nl(t, u[1])
			? u[0]
			: ((n.memoizedState = [e, t]), e);
	}
	function Ff(e, t) {
		var n = pe();
		t = t === void 0 ? null : t;
		var u = n.memoizedState;
		if (t !== null && Nl(t, u[1])) return u[0];
		if (((u = e()), Hn)) {
			Ft(true);
			try {
				e();
			} finally {
				Ft(false);
			}
		}
		return (n.memoizedState = [u, t]), u;
	}
	function Wl(e, t, n) {
		return n === void 0 || ((Ht & 1073741824) !== 0 && (W & 261930) === 0)
			? (e.memoizedState = t)
			: ((e.memoizedState = n), (e = Ko()), (Y.lanes |= e), (ln |= e), n);
	}
	function Wf(e, t, n, u) {
		return ke(n, t)
			? n
			: ia.current !== null
				? ((e = Wl(e, n, u)), ke(e, t) || (je = true), e)
				: (Ht & 42) === 0 ||
					  ((Ht & 1073741824) !== 0 && (W & 261930) === 0)
					? ((je = true), (e.memoizedState = n))
					: ((e = Ko()), (Y.lanes |= e), (ln |= e), t);
	}
	function Kf(e, t, n, u, l) {
		var r = C.p;
		C.p = r !== 0 && 8 > r ? r : 8;
		var o = A.T,
			s = {};
		(A.T = s), kl(e, false, t, n);
		try {
			var d = l(),
				h = A.S;
			if (
				(h !== null && h(s, d),
				d !== null &&
					typeof d == 'object' &&
					typeof d.then == 'function')
			) {
				var E = sb(d, u);
				Ja(e, t, E, nt(e));
			} else Ja(e, t, u, nt(e));
		} catch (M) {
			Ja(
				e,
				t,
				{ then: function () {}, status: 'rejected', reason: M },
				nt(),
			);
		} finally {
			(C.p = r),
				o !== null && s.types !== null && (o.types = s.types),
				(A.T = o);
		}
	}
	function Ob() {}
	function Kl(e, t, n, u) {
		if (e.tag !== 5) throw Error(f(476));
		var l = Jf(e).queue;
		Kf(
			e,
			l,
			t,
			q,
			n === null
				? Ob
				: function () {
						return kf(e), n(u);
					},
		);
	}
	function Jf(e) {
		var t = e.memoizedState;
		if (t !== null) return t;
		t = {
			memoizedState: q,
			baseState: q,
			baseQueue: null,
			queue: {
				pending: null,
				lanes: 0,
				dispatch: null,
				lastRenderedReducer: Nt,
				lastRenderedState: q,
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
					lastRenderedReducer: Nt,
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
		return Ae(sc);
	}
	function If() {
		return pe().memoizedState;
	}
	function $f() {
		return pe().memoizedState;
	}
	function yb(e) {
		for (var t = e.return; t !== null; ) {
			switch (t.tag) {
				case 24:
				case 3:
					var n = nt();
					e = en(n);
					var u = tn(t, e, n);
					u !== null && (Ze(u, t, n), Qa(u, t, n)),
						(t = { cache: xl() }),
						(e.payload = t);
					return;
			}
			t = t.return;
		}
	}
	function jb(e, t, n) {
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
				? eo(t, n)
				: ((n = bl(e, t, n, u)),
					n !== null && (Ze(n, e, u), to(n, t, u)));
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
		if (eu(e)) eo(t, l);
		else {
			var r = e.alternate;
			if (
				e.lanes === 0 &&
				(r === null || r.lanes === 0) &&
				((r = t.lastRenderedReducer), r !== null)
			)
				try {
					var o = t.lastRenderedState,
						s = r(o, n);
					if (
						((l.hasEagerState = true), (l.eagerState = s), ke(s, o))
					)
						return Hc(e, t, l, 0), fe === null && zc(), false;
				} catch {
				} finally {
				}
			if (((n = bl(e, t, l, u)), n !== null))
				return Ze(n, e, u), to(n, t, u), true;
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
		} else (t = bl(e, n, u, 2)), t !== null && Ze(t, e, 2);
	}
	function eu(e) {
		var t = e.alternate;
		return e === Y || (t !== null && t === Y);
	}
	function eo(e, t) {
		ra = Wc = true;
		var n = e.pending;
		n === null ? (t.next = t) : ((t.next = n.next), (n.next = t)),
			(e.pending = t);
	}
	function to(e, t, n) {
		if ((n & 4194048) !== 0) {
			var u = t.lanes;
			(u &= e.pendingLanes), (n |= u), (t.lanes = n), ur(e, n);
		}
	}
	var ka = {
		readContext: Ae,
		use: kc,
		useCallback: be,
		useContext: be,
		useEffect: be,
		useImperativeHandle: be,
		useLayoutEffect: be,
		useInsertionEffect: be,
		useMemo: be,
		useReducer: be,
		useRef: be,
		useState: be,
		useDebugValue: be,
		useDeferredValue: be,
		useTransition: be,
		useSyncExternalStore: be,
		useId: be,
		useHostTransitionStatus: be,
		useFormState: be,
		useActionState: be,
		useOptimistic: be,
		useMemoCache: be,
		useCacheRefresh: be,
	};
	ka.useEffectEvent = be;
	var no = {
			readContext: Ae,
			use: kc,
			useCallback: function (e, t) {
				return (Ne().memoizedState = [e, t === void 0 ? null : t]), e;
			},
			useContext: Ae,
			useEffect: Gf,
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
				var n = Ne();
				t = t === void 0 ? null : t;
				var u = e();
				if (Hn) {
					Ft(true);
					try {
						e();
					} finally {
						Ft(false);
					}
				}
				return (n.memoizedState = [u, t]), u;
			},
			useReducer: function (e, t, n) {
				var u = Ne();
				if (n !== void 0) {
					var l = n(t);
					if (Hn) {
						Ft(true);
						try {
							n(t);
						} finally {
							Ft(false);
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
					(e = e.dispatch = jb.bind(null, Y, e)),
					[u.memoizedState, e]
				);
			},
			useRef: function (e) {
				var t = Ne();
				return (e = { current: e }), (t.memoizedState = e);
			},
			useState: function (e) {
				e = Xl(e);
				var t = e.queue,
					n = Pf.bind(null, Y, t);
				return (t.dispatch = n), [e.memoizedState, n];
			},
			useDebugValue: Fl,
			useDeferredValue: function (e, t) {
				var n = Ne();
				return Wl(n, e, t);
			},
			useTransition: function () {
				var e = Xl(false);
				return (
					(e = Kf.bind(null, Y, e.queue, true, false)),
					(Ne().memoizedState = e),
					[false, e]
				);
			},
			useSyncExternalStore: function (e, t, n) {
				var u = Y,
					l = Ne();
				if (I) {
					if (n === void 0) throw Error(f(407));
					n = n();
				} else {
					if (((n = t()), fe === null)) throw Error(f(349));
					(W & 127) !== 0 || vf(u, t, n);
				}
				l.memoizedState = n;
				var r = { value: n, getSnapshot: t };
				return (
					(l.queue = r),
					Gf(Sf.bind(null, u, r, e), [e]),
					(u.flags |= 2048),
					oa(9, { destroy: void 0 }, xf.bind(null, u, r, n, t), null),
					n
				);
			},
			useId: function () {
				var e = Ne(),
					t = fe.identifierPrefix;
				if (I) {
					var n = wt,
						u = ht;
					(n = (u & ~(1 << (32 - Je(u) - 1))).toString(32) + n),
						(t = '_' + t + 'R_' + n),
						(n = Kc++),
						0 < n && (t += 'H' + n.toString(32)),
						(t += '_');
				} else (n = bb++), (t = '_' + t + 'r_' + n.toString(32) + '_');
				return (e.memoizedState = t);
			},
			useHostTransitionStatus: Jl,
			useFormState: Hf,
			useActionState: Hf,
			useOptimistic: function (e) {
				var t = Ne();
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
			useMemoCache: ql,
			useCacheRefresh: function () {
				return (Ne().memoizedState = yb.bind(null, Y));
			},
			useEffectEvent: function (e) {
				var t = Ne(),
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
			useMemo: Ff,
			useReducer: Ic,
			useRef: Lf,
			useState: function () {
				return Ic(Nt);
			},
			useDebugValue: Fl,
			useDeferredValue: function (e, t) {
				var n = pe();
				return Wf(n, ue.memoizedState, e, t);
			},
			useTransition: function () {
				var e = Ic(Nt)[0],
					t = pe().memoizedState;
				return [typeof e == 'boolean' ? e : Ka(e), t];
			},
			useSyncExternalStore: wf,
			useId: If,
			useHostTransitionStatus: Jl,
			useFormState: Nf,
			useActionState: Nf,
			useOptimistic: function (e, t) {
				var n = pe();
				return Tf(n, ue, e, t);
			},
			useMemoCache: ql,
			useCacheRefresh: $f,
		};
	Il.useEffectEvent = qf;
	var ao = {
		readContext: Ae,
		use: kc,
		useCallback: Zf,
		useContext: Ae,
		useEffect: Zl,
		useImperativeHandle: Qf,
		useInsertionEffect: Vf,
		useLayoutEffect: Yf,
		useMemo: Ff,
		useReducer: Yl,
		useRef: Lf,
		useState: function () {
			return Yl(Nt);
		},
		useDebugValue: Fl,
		useDeferredValue: function (e, t) {
			var n = pe();
			return ue === null ? Wl(n, e, t) : Wf(n, ue.memoizedState, e, t);
		},
		useTransition: function () {
			var e = Yl(Nt)[0],
				t = pe().memoizedState;
			return [typeof e == 'boolean' ? e : Ka(e), t];
		},
		useSyncExternalStore: wf,
		useId: If,
		useHostTransitionStatus: Jl,
		useFormState: Bf,
		useActionState: Bf,
		useOptimistic: function (e, t) {
			var n = pe();
			return ue !== null
				? Tf(n, ue, e, t)
				: ((n.baseState = e), [e, n.queue.dispatch]);
		},
		useMemoCache: ql,
		useCacheRefresh: $f,
	};
	ao.useEffectEvent = qf;
	function $l(e, t, n, u) {
		(t = e.memoizedState),
			(n = n(u, t)),
			(n = n == null ? t : R({}, t, n)),
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
	function co(e, t, n, u, l, r, o) {
		return (
			(e = e.stateNode),
			typeof e.shouldComponentUpdate == 'function'
				? e.shouldComponentUpdate(u, r, o)
				: t.prototype && t.prototype.isPureReactComponent
					? !Ua(n, u) || !Ua(l, r)
					: true
		);
	}
	function uo(e, t, n, u) {
		(e = t.state),
			typeof t.componentWillReceiveProps == 'function' &&
				t.componentWillReceiveProps(n, u),
			typeof t.UNSAFE_componentWillReceiveProps == 'function' &&
				t.UNSAFE_componentWillReceiveProps(n, u),
			t.state !== e && Pl.enqueueReplaceState(t, t.state, null);
	}
	function Nn(e, t) {
		var n = t;
		if ('ref' in t) {
			n = {};
			for (var u in t) u !== 'ref' && (n[u] = t[u]);
		}
		if ((e = e.defaultProps)) {
			n === t && (n = R({}, n));
			for (var l in e) n[l] === void 0 && (n[l] = e[l]);
		}
		return n;
	}
	function lo(e) {
		Cc(e);
	}
	function io(e) {
		console.error(e);
	}
	function ro(e) {
		Cc(e);
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
	function fo(e, t, n) {
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
	function oo(e) {
		return (e = en(e)), (e.tag = 3), e;
	}
	function _o(e, t, n, u) {
		var l = n.type.getDerivedStateFromError;
		if (typeof l == 'function') {
			var r = u.value;
			(e.payload = function () {
				return l(r);
			}),
				(e.callback = function () {
					fo(t, n, u);
				});
		}
		var o = n.stateNode;
		o !== null &&
			typeof o.componentDidCatch == 'function' &&
			(e.callback = function () {
				fo(t, n, u),
					typeof l != 'function' &&
						(rn === null
							? (rn = /* @__PURE__ */ new Set([this]))
							: rn.add(this));
				var s = u.stack;
				this.componentDidCatch(u.value, {
					componentStack: s !== null ? s : '',
				});
			});
	}
	function hb(e, t, n, u, l) {
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
							_t === null
								? bu()
								: n.alternate === null && de === 0 && (de = 3),
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
									Si(e, u, l)),
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
									Si(e, u, l)),
							false
						);
				}
				throw Error(f(435, n.tag));
			}
			return Si(e, u, l), bu(), false;
		}
		if (I)
			return (
				(t = $e.current),
				t !== null
					? ((t.flags & 65536) === 0 && (t.flags |= 256),
						(t.flags |= 65536),
						(t.lanes = l),
						u !== yl &&
							((e = Error(f(422), { cause: u })), Ga(it(e, n))))
					: (u !== yl &&
							((t = Error(f(423), { cause: u })), Ga(it(t, n))),
						(e = e.current.alternate),
						(e.flags |= 65536),
						(l &= -l),
						(e.lanes |= l),
						(u = it(u, n)),
						(l = ei(e.stateNode, u, l)),
						Dl(e, l),
						de !== 4 && (de = 2)),
				false
			);
		var r = Error(f(520), { cause: u });
		if (
			((r = it(r, n)),
			cc === null ? (cc = [r]) : cc.push(r),
			de !== 4 && (de = 2),
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
						(r = n.stateNode),
						(n.flags & 128) === 0 &&
							(typeof t.getDerivedStateFromError == 'function' ||
								(r !== null &&
									typeof r.componentDidCatch == 'function' &&
									(rn === null || !rn.has(r)))))
					)
						return (
							(n.flags |= 65536),
							(l &= -l),
							(n.lanes |= l),
							(l = oo(l)),
							_o(l, e, n, u),
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
		t.child = e === null ? gf(t, null, n, u) : zn(t, e.child, n, u);
	}
	function so(e, t, n, u, l) {
		n = n.render;
		var r = t.ref;
		if ('ref' in u) {
			var o = {};
			for (var s in u) s !== 'ref' && (o[s] = u[s]);
		} else o = u;
		return (
			Mn(t),
			(u = Ul(e, t, n, o, r, l)),
			(s = Bl()),
			e !== null && !je
				? (Ll(e, t, l), Ut(e, t, l))
				: (I && s && pl(t), (t.flags |= 1), Te(e, t, u, l), t.child)
		);
	}
	function bo(e, t, n, u, l) {
		if (e === null) {
			var r = n.type;
			return typeof r == 'function' &&
				!dl(r) &&
				r.defaultProps === void 0 &&
				n.compare === null
				? ((t.tag = 15), (t.type = r), go(e, t, r, u, l))
				: ((e = Uc(n.type, null, u, t, t.mode, l)),
					(e.ref = t.ref),
					(e.return = t),
					(t.child = e));
		}
		if (((r = e.child), !fi(e, l))) {
			var o = r.memoizedProps;
			if (
				((n = n.compare),
				(n = n !== null ? n : Ua),
				n(o, u) && e.ref === t.ref)
			)
				return Ut(e, t, l);
		}
		return (
			(t.flags |= 1),
			(e = Dt(r, u)),
			(e.ref = t.ref),
			(e.return = t),
			(t.child = e)
		);
	}
	function go(e, t, n, u, l) {
		if (e !== null) {
			var r = e.memoizedProps;
			if (Ua(r, u) && e.ref === t.ref)
				if (((je = false), (t.pendingProps = u = r), fi(e, l)))
					(e.flags & 131072) !== 0 && (je = true);
				else return (t.lanes = e.lanes), Ut(e, t, l);
		}
		return ni(e, t, n, u, l);
	}
	function mo(e, t, n, u) {
		var l = u.children,
			r = e !== null ? e.memoizedState : null;
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
				if (((r = r !== null ? r.baseLanes | n : n), e !== null)) {
					for (u = t.child = e.child, l = 0; u !== null; )
						(l = l | u.lanes | u.childLanes), (u = u.sibling);
					u = l & ~r;
				} else (u = 0), (t.child = null);
				return po(e, t, r, n, u);
			}
			if ((n & 536870912) !== 0)
				(t.memoizedState = { baseLanes: 0, cachePool: null }),
					e !== null && qc(t, r !== null ? r.cachePool : null),
					r !== null ? Of(t, r) : Cl(),
					yf(t);
			else
				return (
					(u = t.lanes = 536870912),
					po(e, t, r !== null ? r.baseLanes | n : n, n, u)
				);
		} else
			r !== null
				? (qc(t, r.cachePool), Of(t, r), an(), (t.memoizedState = null))
				: (e !== null && qc(t, null), Cl(), an());
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
	function po(e, t, n, u, l) {
		var r = El();
		return (
			(r = r === null ? null : { parent: Oe._currentValue, pool: r }),
			(t.memoizedState = { baseLanes: n, cachePool: r }),
			e !== null && qc(t, null),
			Cl(),
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
	function Oo(e, t, n) {
		return (
			zn(t, e.child, null, n),
			(e = nu(t, t.pendingProps)),
			(e.flags |= 2),
			Pe(t),
			(t.memoizedState = null),
			e
		);
	}
	function wb(e, t, n) {
		var u = t.pendingProps,
			l = (t.flags & 128) !== 0;
		if (((t.flags &= -129), e === null)) {
			if (I) {
				if (u.mode === 'hidden')
					return (e = nu(t, u)), (t.lanes = 536870912), Ia(null, e);
				if (
					(Hl(t),
					(e = oe)
						? ((e = D_(e, ot)),
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
								(oe = null)))
						: (e = null),
					e === null)
				)
					throw It(t);
				return (t.lanes = 536870912), null;
			}
			return nu(t, u);
		}
		var r = e.memoizedState;
		if (r !== null) {
			var o = r.dehydrated;
			if ((Hl(t), l))
				if (t.flags & 256) (t.flags &= -257), (t = Oo(e, t, n));
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
						((o = lr(u, n)), o !== 0 && o !== r.retryLane))
				)
					throw ((r.retryLane = o), Sn(e, o), Ze(u, e, o), ti);
				bu(), (t = Oo(e, t, n));
			} else
				(e = r.treeContext),
					(oe = st(o.nextSibling)),
					(Ee = t),
					(I = true),
					(kt = null),
					(ot = false),
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
			(n = Ul(e, t, n, u, void 0, l)),
			(u = Bl()),
			e !== null && !je
				? (Ll(e, t, l), Ut(e, t, l))
				: (I && u && pl(t), (t.flags |= 1), Te(e, t, n, l), t.child)
		);
	}
	function yo(e, t, n, u, l, r) {
		return (
			Mn(t),
			(t.updateQueue = null),
			(n = hf(t, u, n, l)),
			jf(e),
			(u = Bl()),
			e !== null && !je
				? (Ll(e, t, r), Ut(e, t, r))
				: (I && u && pl(t), (t.flags |= 1), Te(e, t, n, r), t.child)
		);
	}
	function jo(e, t, n, u, l) {
		if ((Mn(t), t.stateNode === null)) {
			var r = $n,
				o = n.contextType;
			typeof o == 'object' && o !== null && (r = Ae(o)),
				(r = new n(u, r)),
				(t.memoizedState =
					r.state !== null && r.state !== void 0 ? r.state : null),
				(r.updater = Pl),
				(t.stateNode = r),
				(r._reactInternals = t),
				(r = t.stateNode),
				(r.props = u),
				(r.state = t.memoizedState),
				(r.refs = {}),
				Tl(t),
				(o = n.contextType),
				(r.context = typeof o == 'object' && o !== null ? Ae(o) : $n),
				(r.state = t.memoizedState),
				(o = n.getDerivedStateFromProps),
				typeof o == 'function' &&
					($l(t, n, o, u), (r.state = t.memoizedState)),
				typeof n.getDerivedStateFromProps == 'function' ||
					typeof r.getSnapshotBeforeUpdate == 'function' ||
					(typeof r.UNSAFE_componentWillMount != 'function' &&
						typeof r.componentWillMount != 'function') ||
					((o = r.state),
					typeof r.componentWillMount == 'function' &&
						r.componentWillMount(),
					typeof r.UNSAFE_componentWillMount == 'function' &&
						r.UNSAFE_componentWillMount(),
					o !== r.state && Pl.enqueueReplaceState(r, r.state, null),
					Fa(t, u, r, l),
					Za(),
					(r.state = t.memoizedState)),
				typeof r.componentDidMount == 'function' &&
					(t.flags |= 4194308),
				(u = true);
		} else if (e === null) {
			r = t.stateNode;
			var s = t.memoizedProps,
				d = Nn(n, s);
			r.props = d;
			var h = r.context,
				E = n.contextType;
			(o = $n), typeof E == 'object' && E !== null && (o = Ae(E));
			var M = n.getDerivedStateFromProps;
			(E =
				typeof M == 'function' ||
				typeof r.getSnapshotBeforeUpdate == 'function'),
				(s = t.pendingProps !== s),
				E ||
					(typeof r.UNSAFE_componentWillReceiveProps != 'function' &&
						typeof r.componentWillReceiveProps != 'function') ||
					((s || h !== o) && uo(t, r, u, o)),
				(Pt = false);
			var w = t.memoizedState;
			(r.state = w),
				Fa(t, u, r, l),
				Za(),
				(h = t.memoizedState),
				s || w !== h || Pt
					? (typeof M == 'function' &&
							($l(t, n, M, u), (h = t.memoizedState)),
						(d = Pt || co(t, n, d, u, w, h, o))
							? (E ||
									(typeof r.UNSAFE_componentWillMount !=
										'function' &&
										typeof r.componentWillMount !=
											'function') ||
									(typeof r.componentWillMount ==
										'function' && r.componentWillMount(),
									typeof r.UNSAFE_componentWillMount ==
										'function' &&
										r.UNSAFE_componentWillMount()),
								typeof r.componentDidMount == 'function' &&
									(t.flags |= 4194308))
							: (typeof r.componentDidMount == 'function' &&
									(t.flags |= 4194308),
								(t.memoizedProps = u),
								(t.memoizedState = h)),
						(r.props = u),
						(r.state = h),
						(r.context = o),
						(u = d))
					: (typeof r.componentDidMount == 'function' &&
							(t.flags |= 4194308),
						(u = false));
		} else {
			(r = t.stateNode),
				Ml(e, t),
				(o = t.memoizedProps),
				(E = Nn(n, o)),
				(r.props = E),
				(M = t.pendingProps),
				(w = r.context),
				(h = n.contextType),
				(d = $n),
				typeof h == 'object' && h !== null && (d = Ae(h)),
				(s = n.getDerivedStateFromProps),
				(h =
					typeof s == 'function' ||
					typeof r.getSnapshotBeforeUpdate == 'function') ||
					(typeof r.UNSAFE_componentWillReceiveProps != 'function' &&
						typeof r.componentWillReceiveProps != 'function') ||
					((o !== M || w !== d) && uo(t, r, u, d)),
				(Pt = false),
				(w = t.memoizedState),
				(r.state = w),
				Fa(t, u, r, l),
				Za();
			var S = t.memoizedState;
			o !== M ||
			w !== S ||
			Pt ||
			(e !== null && e.dependencies !== null && Lc(e.dependencies))
				? (typeof s == 'function' &&
						($l(t, n, s, u), (S = t.memoizedState)),
					(E =
						Pt ||
						co(t, n, E, u, w, S, d) ||
						(e !== null &&
							e.dependencies !== null &&
							Lc(e.dependencies)))
						? (h ||
								(typeof r.UNSAFE_componentWillUpdate !=
									'function' &&
									typeof r.componentWillUpdate !=
										'function') ||
								(typeof r.componentWillUpdate == 'function' &&
									r.componentWillUpdate(u, S, d),
								typeof r.UNSAFE_componentWillUpdate ==
									'function' &&
									r.UNSAFE_componentWillUpdate(u, S, d)),
							typeof r.componentDidUpdate == 'function' &&
								(t.flags |= 4),
							typeof r.getSnapshotBeforeUpdate == 'function' &&
								(t.flags |= 1024))
						: (typeof r.componentDidUpdate != 'function' ||
								(o === e.memoizedProps &&
									w === e.memoizedState) ||
								(t.flags |= 4),
							typeof r.getSnapshotBeforeUpdate != 'function' ||
								(o === e.memoizedProps &&
									w === e.memoizedState) ||
								(t.flags |= 1024),
							(t.memoizedProps = u),
							(t.memoizedState = S)),
					(r.props = u),
					(r.state = S),
					(r.context = d),
					(u = E))
				: (typeof r.componentDidUpdate != 'function' ||
						(o === e.memoizedProps && w === e.memoizedState) ||
						(t.flags |= 4),
					typeof r.getSnapshotBeforeUpdate != 'function' ||
						(o === e.memoizedProps && w === e.memoizedState) ||
						(t.flags |= 1024),
					(u = false));
		}
		return (
			(r = u),
			au(e, t),
			(u = (t.flags & 128) !== 0),
			r || u
				? ((r = t.stateNode),
					(n =
						u && typeof n.getDerivedStateFromError != 'function'
							? null
							: r.render()),
					(t.flags |= 1),
					e !== null && u
						? ((t.child = zn(t, e.child, null, l)),
							(t.child = zn(t, null, n, l)))
						: Te(e, t, n, l),
					(t.memoizedState = r.state),
					(e = t.child))
				: (e = Ut(e, t, l)),
			e
		);
	}
	function ho(e, t, n, u) {
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
	function wo(e, t, n) {
		var u = t.pendingProps,
			l = false,
			r = (t.flags & 128) !== 0,
			o;
		if (
			((o = r) ||
				(o =
					e !== null && e.memoizedState === null
						? false
						: (me.current & 2) !== 0),
			o && ((l = true), (t.flags &= -129)),
			(o = (t.flags & 32) !== 0),
			(t.flags &= -33),
			e === null)
		) {
			if (I) {
				if (
					(l ? nn(t) : an(),
					(e = oe)
						? ((e = D_(e, ot)),
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
								(oe = null)))
						: (e = null),
					e === null)
				)
					throw It(t);
				return Vi(e) ? (t.lanes = 32) : (t.lanes = 536870912), null;
			}
			var s = u.children;
			return (
				(u = u.fallback),
				l
					? (an(),
						(l = t.mode),
						(s = cu({ mode: 'hidden', children: s }, l)),
						(u = En(u, l, n, null)),
						(s.return = t),
						(u.return = t),
						(s.sibling = u),
						(t.child = s),
						(u = t.child),
						(u.memoizedState = ci(n)),
						(u.childLanes = ui(e, o, n)),
						(t.memoizedState = ai),
						Ia(null, u))
					: (nn(t), li(t, s))
			);
		}
		var d = e.memoizedState;
		if (d !== null && ((s = d.dehydrated), s !== null)) {
			if (r)
				t.flags & 256
					? (nn(t), (t.flags &= -257), (t = ii(e, t, n)))
					: t.memoizedState !== null
						? (an(),
							(t.child = e.child),
							(t.flags |= 128),
							(t = null))
						: (an(),
							(s = u.fallback),
							(l = t.mode),
							(u = cu(
								{ mode: 'visible', children: u.children },
								l,
							)),
							(s = En(s, l, n, null)),
							(s.flags |= 2),
							(u.return = t),
							(s.return = t),
							(u.sibling = s),
							(t.child = u),
							zn(t, e.child, null, n),
							(u = t.child),
							(u.memoizedState = ci(n)),
							(u.childLanes = ui(e, o, n)),
							(t.memoizedState = ai),
							(t = Ia(null, u)));
			else if ((nn(t), Vi(s))) {
				if (((o = s.nextSibling && s.nextSibling.dataset), o))
					var h = o.dgst;
				(o = h),
					(u = Error(f(419))),
					(u.stack = ''),
					(u.digest = o),
					Ga({ value: u, source: null, stack: null }),
					(t = ii(e, t, n));
			} else if (
				(je || na(e, t, n, false),
				(o = (n & e.childLanes) !== 0),
				je || o)
			) {
				if (
					((o = fe),
					o !== null &&
						((u = lr(o, n)), u !== 0 && u !== d.retryLane))
				)
					throw ((d.retryLane = u), Sn(e, u), Ze(o, e, u), ti);
				qi(s) || bu(), (t = ii(e, t, n));
			} else
				qi(s)
					? ((t.flags |= 192), (t.child = e.child), (t = null))
					: ((e = d.treeContext),
						(oe = st(s.nextSibling)),
						(Ee = t),
						(I = true),
						(kt = null),
						(ot = false),
						e !== null && nf(t, e),
						(t = li(t, u.children)),
						(t.flags |= 4096));
			return t;
		}
		return l
			? (an(),
				(s = u.fallback),
				(l = t.mode),
				(d = e.child),
				(h = d.sibling),
				(u = Dt(d, { mode: 'hidden', children: u.children })),
				(u.subtreeFlags = d.subtreeFlags & 65011712),
				h !== null
					? (s = Dt(h, s))
					: ((s = En(s, l, n, null)), (s.flags |= 2)),
				(s.return = t),
				(u.return = t),
				(u.sibling = s),
				(t.child = u),
				Ia(null, u),
				(u = t.child),
				(s = e.child.memoizedState),
				s === null
					? (s = ci(n))
					: ((l = s.cachePool),
						l !== null
							? ((d = Oe._currentValue),
								(l =
									l.parent !== d
										? { parent: d, pool: d }
										: l))
							: (l = ff()),
						(s = { baseLanes: s.baseLanes | n, cachePool: l })),
				(u.memoizedState = s),
				(u.childLanes = ui(e, o, n)),
				(t.memoizedState = ai),
				Ia(e.child, u))
			: (nn(t),
				(n = e.child),
				(e = n.sibling),
				(n = Dt(n, { mode: 'visible', children: u.children })),
				(n.return = t),
				(n.sibling = null),
				e !== null &&
					((o = t.deletions),
					o === null
						? ((t.deletions = [e]), (t.flags |= 16))
						: o.push(e)),
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
			zn(t, e.child, null, n),
			(e = li(t, t.pendingProps.children)),
			(e.flags |= 2),
			(t.memoizedState = null),
			e
		);
	}
	function vo(e, t, n) {
		e.lanes |= t;
		var u = e.alternate;
		u !== null && (u.lanes |= t), wl(e.return, t, n);
	}
	function ri(e, t, n, u, l, r) {
		var o = e.memoizedState;
		o === null
			? (e.memoizedState = {
					isBackwards: t,
					rendering: null,
					renderingStartTime: 0,
					last: u,
					tail: n,
					tailMode: l,
					treeForkCount: r,
				})
			: ((o.isBackwards = t),
				(o.rendering = null),
				(o.renderingStartTime = 0),
				(o.last = u),
				(o.tail = n),
				(o.tailMode = l),
				(o.treeForkCount = r));
	}
	function xo(e, t, n) {
		var u = t.pendingProps,
			l = u.revealOrder,
			r = u.tail;
		u = u.children;
		var o = me.current,
			s = (o & 2) !== 0;
		if (
			(s ? ((o = (o & 1) | 2), (t.flags |= 128)) : (o &= 1),
			H(me, o),
			Te(e, t, u, n),
			(u = I ? La : 0),
			!s && e !== null && (e.flags & 128) !== 0)
		)
			e: for (e = t.child; e !== null; ) {
				if (e.tag === 13) e.memoizedState !== null && vo(e, n, t);
				else if (e.tag === 19) vo(e, n, t);
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
						e !== null && Fc(e) === null && (l = n),
						(n = n.sibling);
				(n = l),
					n === null
						? ((l = t.child), (t.child = null))
						: ((l = n.sibling), (n.sibling = null)),
					ri(t, false, l, n, r, u);
				break;
			case 'backwards':
			case 'unstable_legacy-backwards':
				for (n = null, l = t.child, t.child = null; l !== null; ) {
					if (((e = l.alternate), e !== null && Fc(e) === null)) {
						t.child = l;
						break;
					}
					(e = l.sibling), (l.sibling = n), (n = l), (l = e);
				}
				ri(t, true, n, null, r, u);
				break;
			case 'together':
				ri(t, false, null, null, void 0, u);
				break;
			default:
				t.memoizedState = null;
		}
		return t.child;
	}
	function Ut(e, t, n) {
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
			: ((e = e.dependencies), !!(e !== null && Lc(e)));
	}
	function vb(e, t, n) {
		switch (t.tag) {
			case 3:
				He(t, t.stateNode.containerInfo),
					$t(t, Oe, e.memoizedState.cache),
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
							? wo(e, t, n)
							: (nn(t),
								(e = Ut(e, t, n)),
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
					if (u) return xo(e, t, n);
					t.flags |= 128;
				}
				if (
					((l = t.memoizedState),
					l !== null &&
						((l.rendering = null),
						(l.tail = null),
						(l.lastEffect = null)),
					H(me, me.current),
					u)
				)
					break;
				return null;
			case 22:
				return (t.lanes = 0), mo(e, t, n, t.pendingProps);
			case 24:
				$t(t, Oe, e.memoizedState.cache);
		}
		return Ut(e, t, n);
	}
	function So(e, t, n) {
		if (e !== null)
			if (e.memoizedProps !== t.pendingProps) je = true;
			else {
				if (!fi(e, n) && (t.flags & 128) === 0)
					return (je = false), vb(e, t, n);
				je = (e.flags & 131072) !== 0;
			}
		else (je = false), I && (t.flags & 1048576) !== 0 && tf(t, La, t.index);
		switch (((t.lanes = 0), t.tag)) {
			case 16:
				e: {
					var u = t.pendingProps;
					if (
						((e = Rn(t.elementType)),
						(t.type = e),
						typeof e == 'function')
					)
						dl(e)
							? ((u = Nn(e, u)),
								(t.tag = 1),
								(t = jo(null, t, e, u, n)))
							: ((t.tag = 0), (t = ni(null, t, e, u, n)));
					else {
						if (e != null) {
							var l = e.$$typeof;
							if (l === at) {
								(t.tag = 11), (t = so(null, t, e, u, n));
								break e;
							} else if (l === k) {
								(t.tag = 14), (t = bo(null, t, e, u, n));
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
					(u = t.type), (l = Nn(u, t.pendingProps)), jo(e, t, u, l, n)
				);
			case 3:
				e: {
					if ((He(t, t.stateNode.containerInfo), e === null))
						throw Error(f(387));
					u = t.pendingProps;
					var r = t.memoizedState;
					(l = r.element), Ml(e, t), Fa(t, u, null, n);
					var o = t.memoizedState;
					if (
						((u = o.cache),
						$t(t, Oe, u),
						u !== r.cache && vl(t, [Oe], n, true),
						Za(),
						(u = o.element),
						r.isDehydrated)
					)
						if (
							((r = {
								element: u,
								isDehydrated: false,
								cache: o.cache,
							}),
							(t.updateQueue.baseState = r),
							(t.memoizedState = r),
							t.flags & 256)
						) {
							t = ho(e, t, u, n);
							break e;
						} else if (u !== l) {
							(l = it(Error(f(424)), t)),
								Ga(l),
								(t = ho(e, t, u, n));
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
								oe = st(e.firstChild),
									Ee = t,
									I = true,
									kt = null,
									ot = true,
									n = gf(t, null, u, n),
									t.child = n;
								n;

							)
								(n.flags = (n.flags & -3) | 4096),
									(n = n.sibling);
						}
					else {
						if ((An(), u === l)) {
							t = Ut(e, t, n);
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
						? (n = U_(t.type, null, t.pendingProps, null))
							? (t.memoizedState = n)
							: I ||
								((n = t.type),
								(e = t.pendingProps),
								(u = ju(Q.current).createElement(n)),
								(u[Se] = t),
								(u[Ge] = e),
								Me(u, n, e),
								ve(u),
								(t.stateNode = u))
						: (t.memoizedState = U_(
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
						I &&
						((u = t.stateNode =
							z_(t.type, t.pendingProps, Q.current)),
						(Ee = t),
						(ot = true),
						(l = oe),
						sn(t.type)
							? ((Yi = l), (oe = st(u.firstChild)))
							: (oe = l)),
					Te(e, t, t.pendingProps.children, n),
					au(e, t),
					e === null && (t.flags |= 4194304),
					t.child
				);
			case 5:
				return (
					e === null &&
						I &&
						((l = u = oe) &&
							((u = Pb(u, t.type, t.pendingProps, ot)),
							u !== null
								? ((t.stateNode = u),
									(Ee = t),
									(oe = st(u.firstChild)),
									(ot = false),
									(l = true))
								: (l = false)),
						l || It(t)),
					va(t),
					(l = t.type),
					(r = t.pendingProps),
					(o = e !== null ? e.memoizedProps : null),
					(u = r.children),
					Bi(l, r)
						? (u = null)
						: o !== null && Bi(l, o) && (t.flags |= 32),
					t.memoizedState !== null &&
						((l = Ul(e, t, db, null, null, n)),
						(sc._currentValue = l)),
					au(e, t),
					Te(e, t, u, n),
					t.child
				);
			case 6:
				return (
					e === null &&
						I &&
						((e = n = oe) &&
							((n = ed(n, t.pendingProps, ot)),
							n !== null
								? ((t.stateNode = n),
									(Ee = t),
									(oe = null),
									(e = true))
								: (e = false)),
						e || It(t)),
					null
				);
			case 13:
				return wo(e, t, n);
			case 4:
				return (
					He(t, t.stateNode.containerInfo),
					(u = t.pendingProps),
					e === null ? (t.child = zn(t, null, u, n)) : Te(e, t, u, n),
					t.child
				);
			case 11:
				return so(e, t, t.type, t.pendingProps, n);
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
				return bo(e, t, t.type, t.pendingProps, n);
			case 15:
				return go(e, t, t.type, t.pendingProps, n);
			case 19:
				return xo(e, t, n);
			case 31:
				return wb(e, t, n);
			case 22:
				return mo(e, t, n, t.pendingProps);
			case 24:
				return (
					Mn(t),
					(u = Ae(Oe)),
					e === null
						? ((l = El()),
							l === null &&
								((l = fe),
								(r = xl()),
								(l.pooledCache = r),
								r.refCount++,
								r !== null && (l.pooledCacheLanes |= n),
								(l = r)),
							(t.memoizedState = { parent: u, cache: l }),
							Tl(t),
							$t(t, Oe, l))
						: ((e.lanes & n) !== 0 &&
								(Ml(e, t), Fa(t, null, null, n), Za()),
							(l = e.memoizedState),
							(r = t.memoizedState),
							l.parent !== u
								? ((l = { parent: u, cache: u }),
									(t.memoizedState = l),
									t.lanes === 0 &&
										(t.memoizedState =
											t.updateQueue.baseState =
												l),
									$t(t, Oe, u))
								: ((u = r.cache),
									$t(t, Oe, u),
									u !== l.cache && vl(t, [Oe], n, true))),
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
	function oi(e, t, n, u, l) {
		if (((t = (e.mode & 32) !== 0) && (t = false), t)) {
			if (((e.flags |= 16777216), (l & 335544128) === l))
				if (e.stateNode.complete) e.flags |= 8192;
				else if ($o()) e.flags |= 8192;
				else throw ((Cn = Yc), Al);
		} else e.flags &= -16777217;
	}
	function Eo(e, t) {
		if (t.type !== 'stylesheet' || (t.state.loading & 4) !== 0)
			e.flags &= -16777217;
		else if (((e.flags |= 16777216), !V_(t)))
			if ($o()) e.flags |= 8192;
			else throw ((Cn = Yc), Al);
	}
	function uu(e, t) {
		t !== null && (e.flags |= 4),
			e.flags & 16384 &&
				((t = e.tag !== 22 ? ar() : 536870912),
				(e.lanes |= t),
				(da |= t));
	}
	function $a(e, t) {
		if (!I)
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
	function _e(e) {
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
	function xb(e, t, n) {
		var u = t.pendingProps;
		switch ((Ol(t), t.tag)) {
			case 16:
			case 15:
			case 0:
			case 11:
			case 7:
			case 8:
			case 12:
			case 9:
			case 14:
				return _e(t), null;
			case 1:
				return _e(t), null;
			case 3:
				return (
					(n = t.stateNode),
					(u = null),
					e !== null && (u = e.memoizedState.cache),
					t.memoizedState.cache !== u && (t.flags |= 2048),
					zt(Oe),
					ge(),
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
					_e(t),
					null
				);
			case 26:
				var l = t.type,
					r = t.memoizedState;
				return (
					e === null
						? (Bt(t),
							r !== null
								? (_e(t), Eo(t, r))
								: (_e(t), oi(t, l, null, u, n)))
						: r
							? r !== e.memoizedState
								? (Bt(t), _e(t), Eo(t, r))
								: (_e(t), (t.flags &= -16777217))
							: ((e = e.memoizedProps),
								e !== u && Bt(t),
								_e(t),
								oi(t, l, e, u, n)),
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
						return _e(t), null;
					}
					(e = U.current),
						ta(t)
							? af(t)
							: ((e = z_(l, u, n)), (t.stateNode = e), Bt(t));
				}
				return _e(t), null;
			case 5:
				if ((mc(t), (l = t.type), e !== null && t.stateNode != null))
					e.memoizedProps !== u && Bt(t);
				else {
					if (!u) {
						if (t.stateNode === null) throw Error(f(166));
						return _e(t), null;
					}
					if (((r = U.current), ta(t))) af(t);
					else {
						var o = ju(Q.current);
						switch (r) {
							case 1:
								r = o.createElementNS(
									'http://www.w3.org/2000/svg',
									l,
								);
								break;
							case 2:
								r = o.createElementNS(
									'http://www.w3.org/1998/Math/MathML',
									l,
								);
								break;
							default:
								switch (l) {
									case 'svg':
										r = o.createElementNS(
											'http://www.w3.org/2000/svg',
											l,
										);
										break;
									case 'math':
										r = o.createElementNS(
											'http://www.w3.org/1998/Math/MathML',
											l,
										);
										break;
									case 'script':
										(r = o.createElement('div')),
											(r.innerHTML =
												'<script><\/script>'),
											(r = r.removeChild(r.firstChild));
										break;
									case 'select':
										(r =
											typeof u.is == 'string'
												? o.createElement('select', {
														is: u.is,
													})
												: o.createElement('select')),
											u.multiple
												? (r.multiple = true)
												: u.size && (r.size = u.size);
										break;
									default:
										r =
											typeof u.is == 'string'
												? o.createElement(l, {
														is: u.is,
													})
												: o.createElement(l);
								}
						}
						(r[Se] = t), (r[Ge] = u);
						e: for (o = t.child; o !== null; ) {
							if (o.tag === 5 || o.tag === 6)
								r.appendChild(o.stateNode);
							else if (
								o.tag !== 4 &&
								o.tag !== 27 &&
								o.child !== null
							) {
								(o.child.return = o), (o = o.child);
								continue;
							}
							if (o === t) break e;
							for (; o.sibling === null; ) {
								if (o.return === null || o.return === t)
									break e;
								o = o.return;
							}
							(o.sibling.return = o.return), (o = o.sibling);
						}
						t.stateNode = r;
						e: switch ((Me(r, l, u), l)) {
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
					_e(t),
					oi(
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
						(e[Se] = t),
							(e = !!(
								e.nodeValue === n ||
								(u !== null &&
									u.suppressHydrationWarning === true) ||
								w_(e.nodeValue, n)
							)),
							e || It(t, true);
					} else
						(e = ju(e).createTextNode(u)),
							(e[Se] = t),
							(t.stateNode = e);
				}
				return _e(t), null;
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
							e[Se] = t;
						} else
							An(),
								(t.flags & 128) === 0 &&
									(t.memoizedState = null),
								(t.flags |= 4);
						_e(t), (e = false);
					} else
						(n = jl()),
							e !== null &&
								e.memoizedState !== null &&
								(e.memoizedState.hydrationErrors = n),
							(e = true);
					if (!e) return t.flags & 256 ? (Pe(t), t) : (Pe(t), null);
					if ((t.flags & 128) !== 0) throw Error(f(558));
				}
				return _e(t), null;
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
							l[Se] = t;
						} else
							An(),
								(t.flags & 128) === 0 &&
									(t.memoizedState = null),
								(t.flags |= 4);
						_e(t), (l = false);
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
								(r = null),
								u.memoizedState !== null &&
									u.memoizedState.cachePool !== null &&
									(r = u.memoizedState.cachePool.pool),
								r !== l && (u.flags |= 2048)),
							n !== e && n && (t.child.flags |= 8192),
							uu(t, t.updateQueue),
							_e(t),
							null)
				);
			case 4:
				return (
					ge(),
					e === null && Ci(t.stateNode.containerInfo),
					_e(t),
					null
				);
			case 10:
				return zt(t.type), _e(t), null;
			case 19:
				if ((D(me), (u = t.memoizedState), u === null))
					return _e(t), null;
				if (
					((l = (t.flags & 128) !== 0), (r = u.rendering), r === null)
				)
					if (l) $a(u, false);
					else {
						if (de !== 0 || (e !== null && (e.flags & 128) !== 0))
							for (e = t.child; e !== null; ) {
								if (((r = Fc(e)), r !== null)) {
									for (
										t.flags |= 128,
											$a(u, false),
											e = r.updateQueue,
											t.updateQueue = e,
											uu(t, e),
											t.subtreeFlags = 0,
											e = n,
											n = t.child;
										n !== null;

									)
										$r(n, e), (n = n.sibling);
									return (
										H(me, (me.current & 1) | 2),
										I && Rt(t, u.treeForkCount),
										t.child
									);
								}
								e = e.sibling;
							}
						u.tail !== null &&
							We() > ou &&
							((t.flags |= 128),
							(l = true),
							$a(u, false),
							(t.lanes = 4194304));
					}
				else {
					if (!l)
						if (((e = Fc(r)), e !== null)) {
							if (
								((t.flags |= 128),
								(l = true),
								(e = e.updateQueue),
								(t.updateQueue = e),
								uu(t, e),
								$a(u, true),
								u.tail === null &&
									u.tailMode === 'hidden' &&
									!r.alternate &&
									!I)
							)
								return _e(t), null;
						} else
							2 * We() - u.renderingStartTime > ou &&
								n !== 536870912 &&
								((t.flags |= 128),
								(l = true),
								$a(u, false),
								(t.lanes = 4194304));
					u.isBackwards
						? ((r.sibling = t.child), (t.child = r))
						: ((e = u.last),
							e !== null ? (e.sibling = r) : (t.child = r),
							(u.last = r));
				}
				return u.tail !== null
					? ((e = u.tail),
						(u.rendering = e),
						(u.tail = e.sibling),
						(u.renderingStartTime = We()),
						(e.sibling = null),
						(n = me.current),
						H(me, l ? (n & 1) | 2 : n & 1),
						I && Rt(t, u.treeForkCount),
						e)
					: (_e(t), null);
			case 22:
			case 23:
				return (
					Pe(t),
					zl(),
					(u = t.memoizedState !== null),
					e !== null
						? (e.memoizedState !== null) !== u && (t.flags |= 8192)
						: u && (t.flags |= 8192),
					u
						? (n & 536870912) !== 0 &&
							(t.flags & 128) === 0 &&
							(_e(t), t.subtreeFlags & 6 && (t.flags |= 8192))
						: _e(t),
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
					zt(Oe),
					_e(t),
					null
				);
			case 25:
				return null;
			case 30:
				return null;
		}
		throw Error(f(156, t.tag));
	}
	function Sb(e, t) {
		switch ((Ol(t), t.tag)) {
			case 1:
				return (
					(e = t.flags),
					e & 65536 ? ((t.flags = (e & -65537) | 128), t) : null
				);
			case 3:
				return (
					zt(Oe),
					ge(),
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
				return ge(), null;
			case 10:
				return zt(t.type), null;
			case 22:
			case 23:
				return (
					Pe(t),
					zl(),
					e !== null && D(Dn),
					(e = t.flags),
					e & 65536 ? ((t.flags = (e & -65537) | 128), t) : null
				);
			case 24:
				return zt(Oe), null;
			case 25:
				return null;
			default:
				return null;
		}
	}
	function Ao(e, t) {
		switch ((Ol(t), t.tag)) {
			case 3:
				zt(Oe), ge();
				break;
			case 26:
			case 27:
			case 5:
				mc(t);
				break;
			case 4:
				ge();
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
				zt(t.type);
				break;
			case 22:
			case 23:
				Pe(t), zl(), e !== null && D(Dn);
				break;
			case 24:
				zt(Oe);
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
						var r = n.create,
							o = n.inst;
						(u = r()), (o.destroy = u);
					}
					n = n.next;
				} while (n !== l);
			}
		} catch (s) {
			ae(t, t.return, s);
		}
	}
	function cn(e, t, n) {
		try {
			var u = t.updateQueue,
				l = u !== null ? u.lastEffect : null;
			if (l !== null) {
				var r = l.next;
				u = r;
				do {
					if ((u.tag & e) === e) {
						var o = u.inst,
							s = o.destroy;
						if (s !== void 0) {
							(o.destroy = void 0), (l = t);
							var d = n,
								h = s;
							try {
								h();
							} catch (E) {
								ae(l, d, E);
							}
						}
					}
					u = u.next;
				} while (u !== r);
			}
		} catch (E) {
			ae(t, t.return, E);
		}
	}
	function To(e) {
		var t = e.updateQueue;
		if (t !== null) {
			var n = e.stateNode;
			try {
				pf(t, n);
			} catch (u) {
				ae(e, e.return, u);
			}
		}
	}
	function Mo(e, t, n) {
		(n.props = Nn(e.type, e.memoizedProps)), (n.state = e.memoizedState);
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
	function Do(e) {
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
	function _i(e, t, n) {
		try {
			var u = e.stateNode;
			Wb(u, e.type, n, t), (u[Ge] = t);
		} catch (l) {
			ae(e, e.return, l);
		}
	}
	function Ro(e) {
		return (
			e.tag === 5 ||
			e.tag === 3 ||
			e.tag === 26 ||
			(e.tag === 27 && sn(e.type)) ||
			e.tag === 4
		);
	}
	function si(e) {
		e: for (;;) {
			for (; e.sibling === null; ) {
				if (e.return === null || Ro(e.return)) return null;
				e = e.return;
			}
			for (
				e.sibling.return = e.return, e = e.sibling;
				e.tag !== 5 && e.tag !== 6 && e.tag !== 18;

			) {
				if (
					(e.tag === 27 && sn(e.type)) ||
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
	function bi(e, t, n) {
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
			(u === 27 && sn(e.type) && ((n = e.stateNode), (t = null)),
			(e = e.child),
			e !== null)
		)
			for (bi(e, t, n), e = e.sibling; e !== null; )
				bi(e, t, n), (e = e.sibling);
	}
	function lu(e, t, n) {
		var u = e.tag;
		if (u === 5 || u === 6)
			(e = e.stateNode), t ? n.insertBefore(e, t) : n.appendChild(e);
		else if (
			u !== 4 &&
			(u === 27 && sn(e.type) && (n = e.stateNode),
			(e = e.child),
			e !== null)
		)
			for (lu(e, t, n), e = e.sibling; e !== null; )
				lu(e, t, n), (e = e.sibling);
	}
	function Co(e) {
		var t = e.stateNode,
			n = e.memoizedProps;
		try {
			for (var u = e.type, l = t.attributes; l.length; )
				t.removeAttributeNode(l[0]);
			Me(t, u, n), (t[Se] = e), (t[Ge] = n);
		} catch (r) {
			ae(e, e.return, r);
		}
	}
	var Lt = false,
		he = false,
		di = false,
		zo = typeof WeakSet == 'function' ? WeakSet : Set,
		xe = null;
	function Eb(e, t) {
		if (((e = e.containerInfo), (Ni = Au), (e = Xr(e)), il(e))) {
			if ('selectionStart' in e)
				var n = { start: e.selectionStart, end: e.selectionEnd };
			else
				e: {
					n = ((n = e.ownerDocument) && n.defaultView) || window;
					var u = n.getSelection && n.getSelection();
					if (u && u.rangeCount !== 0) {
						n = u.anchorNode;
						var l = u.anchorOffset,
							r = u.focusNode;
						u = u.focusOffset;
						try {
							n.nodeType, r.nodeType;
						} catch {
							n = null;
							break e;
						}
						var o = 0,
							s = -1,
							d = -1,
							h = 0,
							E = 0,
							M = e,
							w = null;
						t: for (;;) {
							for (
								var S;
								M !== n ||
									(l !== 0 && M.nodeType !== 3) ||
									(s = o + l),
									M !== r ||
										(u !== 0 && M.nodeType !== 3) ||
										(d = o + u),
									M.nodeType === 3 &&
										(o += M.nodeValue.length),
									(S = M.firstChild) !== null;

							)
								(w = M), (M = S);
							for (;;) {
								if (M === e) break t;
								if (
									(w === n && ++h === l && (s = o),
									w === r && ++E === u && (d = o),
									(S = M.nextSibling) !== null)
								)
									break;
								(M = w), (w = M.parentNode);
							}
							M = S;
						}
						n = s === -1 || d === -1 ? null : { start: s, end: d };
					} else n = null;
				}
			n = n || { start: 0, end: 0 };
		} else n = null;
		for (
			Ui = { focusedElem: e, selectionRange: n }, Au = false, xe = t;
			xe !== null;

		)
			if (
				((t = xe),
				(e = t.child),
				(t.subtreeFlags & 1028) !== 0 && e !== null)
			)
				(e.return = t), (xe = e);
			else
				for (; xe !== null; ) {
					switch (
						((t = xe), (r = t.alternate), (e = t.flags), t.tag)
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
							if ((e & 1024) !== 0 && r !== null) {
								(e = void 0),
									(n = t),
									(l = r.memoizedProps),
									(r = r.memoizedState),
									(u = n.stateNode);
								try {
									var N = Nn(n.type, l);
									(e = u.getSnapshotBeforeUpdate(N, r)),
										(u.__reactInternalSnapshotBeforeUpdate =
											e);
								} catch (G) {
									ae(n, n.return, G);
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
									Gi(e);
								else if (n === 1)
									switch (e.nodeName) {
										case 'HEAD':
										case 'HTML':
										case 'BODY':
											Gi(e);
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
						(e.return = t.return), (xe = e);
						break;
					}
					xe = t.return;
				}
	}
	function Ho(e, t, n) {
		var u = n.flags;
		switch (n.tag) {
			case 0:
			case 11:
			case 15:
				qt(e, n), u & 4 && Pa(5, n);
				break;
			case 1:
				if ((qt(e, n), u & 4))
					if (((e = n.stateNode), t === null))
						try {
							e.componentDidMount();
						} catch (o) {
							ae(n, n.return, o);
						}
					else {
						var l = Nn(n.type, t.memoizedProps);
						t = t.memoizedState;
						try {
							e.componentDidUpdate(
								l,
								t,
								e.__reactInternalSnapshotBeforeUpdate,
							);
						} catch (o) {
							ae(n, n.return, o);
						}
					}
				u & 64 && To(n), u & 512 && ec(n, n.return);
				break;
			case 3:
				if ((qt(e, n), u & 64 && ((e = n.updateQueue), e !== null))) {
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
						pf(e, t);
					} catch (o) {
						ae(n, n.return, o);
					}
				}
				break;
			case 27:
				t === null && u & 4 && Co(n);
			case 26:
			case 5:
				qt(e, n),
					t === null && u & 4 && Do(n),
					u & 512 && ec(n, n.return);
				break;
			case 12:
				qt(e, n);
				break;
			case 31:
				qt(e, n), u & 4 && Bo(e, n);
				break;
			case 13:
				qt(e, n),
					u & 4 && Lo(e, n),
					u & 64 &&
						((e = n.memoizedState),
						e !== null &&
							((e = e.dehydrated),
							e !== null && ((n = Nb.bind(null, n)), td(e, n))));
				break;
			case 22:
				if (((u = n.memoizedState !== null || Lt), !u)) {
					(t = (t !== null && t.memoizedState !== null) || he),
						(l = Lt);
					var r = he;
					(Lt = u),
						(he = t) && !r
							? Vt(e, n, (n.subtreeFlags & 8772) !== 0)
							: qt(e, n),
						(Lt = l),
						(he = r);
				}
				break;
			case 30:
				break;
			default:
				qt(e, n);
		}
	}
	function No(e) {
		var t = e.alternate;
		t !== null && ((e.alternate = null), No(t)),
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
	var se = null,
		Ve = false;
	function Gt(e, t, n) {
		for (n = n.child; n !== null; ) Uo(e, t, n), (n = n.sibling);
	}
	function Uo(e, t, n) {
		if (Ke && typeof Ke.onCommitFiberUnmount == 'function')
			try {
				Ke.onCommitFiberUnmount(xa, n);
			} catch {}
		switch (n.tag) {
			case 26:
				he || vt(n, t),
					Gt(e, t, n),
					n.memoizedState
						? n.memoizedState.count--
						: n.stateNode &&
							((n = n.stateNode), n.parentNode.removeChild(n));
				break;
			case 27:
				he || vt(n, t);
				var u = se,
					l = Ve;
				sn(n.type) && ((se = n.stateNode), (Ve = false)),
					Gt(e, t, n),
					fc(n.stateNode),
					(se = u),
					(Ve = l);
				break;
			case 5:
				he || vt(n, t);
			case 6:
				if (
					((u = se),
					(l = Ve),
					(se = null),
					Gt(e, t, n),
					(se = u),
					(Ve = l),
					se !== null)
				)
					if (Ve)
						try {
							(se.nodeType === 9
								? se.body
								: se.nodeName === 'HTML'
									? se.ownerDocument.body
									: se
							).removeChild(n.stateNode);
						} catch (r) {
							ae(n, t, r);
						}
					else
						try {
							se.removeChild(n.stateNode);
						} catch (r) {
							ae(n, t, r);
						}
				break;
			case 18:
				se !== null &&
					(Ve
						? ((e = se),
							T_(
								e.nodeType === 9
									? e.body
									: e.nodeName === 'HTML'
										? e.ownerDocument.body
										: e,
								n.stateNode,
							),
							wa(e))
						: T_(se, n.stateNode));
				break;
			case 4:
				(u = se),
					(l = Ve),
					(se = n.stateNode.containerInfo),
					(Ve = true),
					Gt(e, t, n),
					(se = u),
					(Ve = l);
				break;
			case 0:
			case 11:
			case 14:
			case 15:
				cn(2, n, t), he || cn(4, n, t), Gt(e, t, n);
				break;
			case 1:
				he ||
					(vt(n, t),
					(u = n.stateNode),
					typeof u.componentWillUnmount == 'function' && Mo(n, t, u)),
					Gt(e, t, n);
				break;
			case 21:
				Gt(e, t, n);
				break;
			case 22:
				(he = (u = he) || n.memoizedState !== null),
					Gt(e, t, n),
					(he = u);
				break;
			default:
				Gt(e, t, n);
		}
	}
	function Bo(e, t) {
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
	function Lo(e, t) {
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
	function Ab(e) {
		switch (e.tag) {
			case 31:
			case 13:
			case 19:
				var t = e.stateNode;
				return t === null && (t = e.stateNode = new zo()), t;
			case 22:
				return (
					(e = e.stateNode),
					(t = e._retryCache),
					t === null && (t = e._retryCache = new zo()),
					t
				);
			default:
				throw Error(f(435, e.tag));
		}
	}
	function iu(e, t) {
		var n = Ab(e);
		t.forEach(function (u) {
			if (!n.has(u)) {
				n.add(u);
				var l = Ub.bind(null, e, u);
				u.then(l, l);
			}
		});
	}
	function Ye(e, t) {
		var n = t.deletions;
		if (n !== null)
			for (var u = 0; u < n.length; u++) {
				var l = n[u],
					r = e,
					o = t,
					s = o;
				e: for (; s !== null; ) {
					switch (s.tag) {
						case 27:
							if (sn(s.type)) {
								(se = s.stateNode), (Ve = false);
								break e;
							}
							break;
						case 5:
							(se = s.stateNode), (Ve = false);
							break e;
						case 3:
						case 4:
							(se = s.stateNode.containerInfo), (Ve = true);
							break e;
					}
					s = s.return;
				}
				if (se === null) throw Error(f(160));
				Uo(r, o, l),
					(se = null),
					(Ve = false),
					(r = l.alternate),
					r !== null && (r.return = null),
					(l.return = null);
			}
		if (t.subtreeFlags & 13886)
			for (t = t.child; t !== null; ) Go(t, e), (t = t.sibling);
	}
	var mt = null;
	function Go(e, t) {
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
						Lt &&
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
					var r = n !== null ? n.memoizedState : null;
					if (((u = e.memoizedState), n === null))
						if (u === null)
							if (e.stateNode === null) {
								e: {
									(u = e.type),
										(n = e.memoizedProps),
										(l = l.ownerDocument || l);
									t: switch (u) {
										case 'title':
											(r =
												l.getElementsByTagName(
													'title',
												)[0]),
												(!r ||
													r[Aa] ||
													r[Se] ||
													r.namespaceURI ===
														'http://www.w3.org/2000/svg' ||
													r.hasAttribute(
														'itemprop',
													)) &&
													((r = l.createElement(u)),
													l.head.insertBefore(
														r,
														l.querySelector(
															'head > title',
														),
													)),
												Me(r, u, n),
												(r[Se] = e),
												ve(r),
												(u = r);
											break e;
										case 'link':
											var o = G_('link', 'href', l).get(
												u + (n.href || ''),
											);
											if (o) {
												for (
													var s = 0;
													s < o.length;
													s++
												)
													if (
														((r = o[s]),
														r.getAttribute(
															'href',
														) ===
															(n.href == null ||
															n.href === ''
																? null
																: n.href) &&
															r.getAttribute(
																'rel',
															) ===
																(n.rel == null
																	? null
																	: n.rel) &&
															r.getAttribute(
																'title',
															) ===
																(n.title == null
																	? null
																	: n.title) &&
															r.getAttribute(
																'crossorigin',
															) ===
																(n.crossOrigin ==
																null
																	? null
																	: n.crossOrigin))
													) {
														o.splice(s, 1);
														break t;
													}
											}
											(r = l.createElement(u)),
												Me(r, u, n),
												l.head.appendChild(r);
											break;
										case 'meta':
											if (
												(o = G_(
													'meta',
													'content',
													l,
												).get(u + (n.content || '')))
											) {
												for (s = 0; s < o.length; s++)
													if (
														((r = o[s]),
														r.getAttribute(
															'content',
														) ===
															(n.content == null
																? null
																: '' +
																	n.content) &&
															r.getAttribute(
																'name',
															) ===
																(n.name == null
																	? null
																	: n.name) &&
															r.getAttribute(
																'property',
															) ===
																(n.property ==
																null
																	? null
																	: n.property) &&
															r.getAttribute(
																'http-equiv',
															) ===
																(n.httpEquiv ==
																null
																	? null
																	: n.httpEquiv) &&
															r.getAttribute(
																'charset',
															) ===
																(n.charSet ==
																null
																	? null
																	: n.charSet))
													) {
														o.splice(s, 1);
														break t;
													}
											}
											(r = l.createElement(u)),
												Me(r, u, n),
												l.head.appendChild(r);
											break;
										default:
											throw Error(f(468, u));
									}
									(r[Se] = e), ve(r), (u = r);
								}
								e.stateNode = u;
							} else q_(l, e.type, e.stateNode);
						else e.stateNode = L_(l, u, e.memoizedProps);
					else
						r !== u
							? (r === null
									? n.stateNode !== null &&
										((n = n.stateNode),
										n.parentNode.removeChild(n))
									: r.count--,
								u === null
									? q_(l, e.type, e.stateNode)
									: L_(l, u, e.memoizedProps))
							: u === null &&
								e.stateNode !== null &&
								_i(e, e.memoizedProps, n.memoizedProps);
				}
				break;
			case 27:
				Ye(t, e),
					Xe(e),
					u & 512 && (he || n === null || vt(n, n.return)),
					n !== null &&
						u & 4 &&
						_i(e, e.memoizedProps, n.memoizedProps);
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
					} catch (N) {
						ae(e, e.return, N);
					}
				}
				u & 4 &&
					e.stateNode != null &&
					((l = e.memoizedProps),
					_i(e, l, n !== null ? n.memoizedProps : l)),
					u & 1024 && (di = true);
				break;
			case 6:
				if ((Ye(t, e), Xe(e), u & 4)) {
					if (e.stateNode === null) throw Error(f(162));
					(u = e.memoizedProps), (n = e.stateNode);
					try {
						n.nodeValue = u;
					} catch (N) {
						ae(e, e.return, N);
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
					} catch (N) {
						ae(e, e.return, N);
					}
				di && ((di = false), qo(e));
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
				var d = n !== null && n.memoizedState !== null,
					h = Lt,
					E = he;
				if (
					((Lt = h || l),
					(he = E || d),
					Ye(t, e),
					(he = E),
					(Lt = h),
					Xe(e),
					u & 8192)
				)
					e: for (
						t = e.stateNode,
							t._visibility = l
								? t._visibility & -2
								: t._visibility | 1,
							l && (n === null || d || Lt || he || Un(e)),
							n = null,
							t = e;
						;

					) {
						if (t.tag === 5 || t.tag === 26) {
							if (n === null) {
								d = n = t;
								try {
									if (((r = d.stateNode), l))
										(o = r.style),
											typeof o.setProperty == 'function'
												? o.setProperty(
														'display',
														'none',
														'important',
													)
												: (o.display = 'none');
									else {
										s = d.stateNode;
										var M = d.memoizedProps.style,
											w =
												M != null &&
												M.hasOwnProperty('display')
													? M.display
													: null;
										s.style.display =
											w == null || typeof w == 'boolean'
												? ''
												: ('' + w).trim();
									}
								} catch (N) {
									ae(d, d.return, N);
								}
							}
						} else if (t.tag === 6) {
							if (n === null) {
								d = t;
								try {
									d.stateNode.nodeValue = l
										? ''
										: d.memoizedProps;
								} catch (N) {
									ae(d, d.return, N);
								}
							}
						} else if (t.tag === 18) {
							if (n === null) {
								d = t;
								try {
									var S = d.stateNode;
									l ? M_(S, true) : M_(d.stateNode, false);
								} catch (N) {
									ae(d, d.return, N);
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
					if (Ro(u)) {
						n = u;
						break;
					}
					u = u.return;
				}
				if (n == null) throw Error(f(160));
				switch (n.tag) {
					case 27:
						var l = n.stateNode,
							r = si(e);
						lu(e, r, l);
						break;
					case 5:
						var o = n.stateNode;
						n.flags & 32 && (Zn(o, ''), (n.flags &= -33));
						var s = si(e);
						lu(e, s, o);
						break;
					case 3:
					case 4:
						var d = n.stateNode.containerInfo,
							h = si(e);
						bi(e, h, d);
						break;
					default:
						throw Error(f(161));
				}
			} catch (E) {
				ae(e, e.return, E);
			}
			e.flags &= -3;
		}
		t & 4096 && (e.flags &= -4097);
	}
	function qo(e) {
		if (e.subtreeFlags & 1024)
			for (e = e.child; e !== null; ) {
				var t = e;
				qo(t),
					t.tag === 5 && t.flags & 1024 && t.stateNode.reset(),
					(e = e.sibling);
			}
	}
	function qt(e, t) {
		if (t.subtreeFlags & 8772)
			for (t = t.child; t !== null; )
				Ho(e, t.alternate, t), (t = t.sibling);
	}
	function Un(e) {
		for (e = e.child; e !== null; ) {
			var t = e;
			switch (t.tag) {
				case 0:
				case 11:
				case 14:
				case 15:
					cn(4, t, t.return), Un(t);
					break;
				case 1:
					vt(t, t.return);
					var n = t.stateNode;
					typeof n.componentWillUnmount == 'function' &&
						Mo(t, t.return, n),
						Un(t);
					break;
				case 27:
					fc(t.stateNode);
				case 26:
				case 5:
					vt(t, t.return), Un(t);
					break;
				case 22:
					t.memoizedState === null && Un(t);
					break;
				case 30:
					Un(t);
					break;
				default:
					Un(t);
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
				r = t,
				o = r.flags;
			switch (r.tag) {
				case 0:
				case 11:
				case 15:
					Vt(l, r, n), Pa(4, r);
					break;
				case 1:
					if (
						(Vt(l, r, n),
						(u = r),
						(l = u.stateNode),
						typeof l.componentDidMount == 'function')
					)
						try {
							l.componentDidMount();
						} catch (h) {
							ae(u, u.return, h);
						}
					if (((u = r), (l = u.updateQueue), l !== null)) {
						var s = u.stateNode;
						try {
							var d = l.shared.hiddenCallbacks;
							if (d !== null)
								for (
									l.shared.hiddenCallbacks = null, l = 0;
									l < d.length;
									l++
								)
									mf(d[l], s);
						} catch (h) {
							ae(u, u.return, h);
						}
					}
					n && o & 64 && To(r), ec(r, r.return);
					break;
				case 27:
					Co(r);
				case 26:
				case 5:
					Vt(l, r, n),
						n && u === null && o & 4 && Do(r),
						ec(r, r.return);
					break;
				case 12:
					Vt(l, r, n);
					break;
				case 31:
					Vt(l, r, n), n && o & 4 && Bo(l, r);
					break;
				case 13:
					Vt(l, r, n), n && o & 4 && Lo(l, r);
					break;
				case 22:
					r.memoizedState === null && Vt(l, r, n), ec(r, r.return);
					break;
				case 30:
					break;
				default:
					Vt(l, r, n);
			}
			t = t.sibling;
		}
	}
	function gi(e, t) {
		var n = null;
		e !== null &&
			e.memoizedState !== null &&
			e.memoizedState.cachePool !== null &&
			(n = e.memoizedState.cachePool.pool),
			(e = null),
			t.memoizedState !== null &&
				t.memoizedState.cachePool !== null &&
				(e = t.memoizedState.cachePool.pool),
			e !== n && (e != null && e.refCount++, n != null && qa(n));
	}
	function mi(e, t) {
		(e = null),
			t.alternate !== null && (e = t.alternate.memoizedState.cache),
			(t = t.memoizedState.cache),
			t !== e && (t.refCount++, e != null && qa(e));
	}
	function pt(e, t, n, u) {
		if (t.subtreeFlags & 10256)
			for (t = t.child; t !== null; ) Vo(e, t, n, u), (t = t.sibling);
	}
	function Vo(e, t, n, u) {
		var l = t.flags;
		switch (t.tag) {
			case 0:
			case 11:
			case 15:
				pt(e, t, n, u), l & 2048 && Pa(9, t);
				break;
			case 1:
				pt(e, t, n, u);
				break;
			case 3:
				pt(e, t, n, u),
					l & 2048 &&
						((e = null),
						t.alternate !== null &&
							(e = t.alternate.memoizedState.cache),
						(t = t.memoizedState.cache),
						t !== e && (t.refCount++, e != null && qa(e)));
				break;
			case 12:
				if (l & 2048) {
					pt(e, t, n, u), (e = t.stateNode);
					try {
						var r = t.memoizedProps,
							o = r.id,
							s = r.onPostCommit;
						typeof s == 'function' &&
							s(
								o,
								t.alternate === null ? 'mount' : 'update',
								e.passiveEffectDuration,
								-0,
							);
					} catch (d) {
						ae(t, t.return, d);
					}
				} else pt(e, t, n, u);
				break;
			case 31:
				pt(e, t, n, u);
				break;
			case 13:
				pt(e, t, n, u);
				break;
			case 23:
				break;
			case 22:
				(r = t.stateNode),
					(o = t.alternate),
					t.memoizedState !== null
						? r._visibility & 2
							? pt(e, t, n, u)
							: tc(e, t)
						: r._visibility & 2
							? pt(e, t, n, u)
							: ((r._visibility |= 2),
								_a(
									e,
									t,
									n,
									u,
									(t.subtreeFlags & 10256) !== 0 || false,
								)),
					l & 2048 && gi(o, t);
				break;
			case 24:
				pt(e, t, n, u), l & 2048 && mi(t.alternate, t);
				break;
			default:
				pt(e, t, n, u);
		}
	}
	function _a(e, t, n, u, l) {
		for (
			l = l && ((t.subtreeFlags & 10256) !== 0 || false), t = t.child;
			t !== null;

		) {
			var r = e,
				o = t,
				s = n,
				d = u,
				h = o.flags;
			switch (o.tag) {
				case 0:
				case 11:
				case 15:
					_a(r, o, s, d, l), Pa(8, o);
					break;
				case 23:
					break;
				case 22:
					var E = o.stateNode;
					o.memoizedState !== null
						? E._visibility & 2
							? _a(r, o, s, d, l)
							: tc(r, o)
						: ((E._visibility |= 2), _a(r, o, s, d, l)),
						l && h & 2048 && gi(o.alternate, o);
					break;
				case 24:
					_a(r, o, s, d, l), l && h & 2048 && mi(o.alternate, o);
					break;
				default:
					_a(r, o, s, d, l);
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
						tc(n, u), l & 2048 && gi(u.alternate, u);
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
	function sa(e, t, n) {
		if (e.subtreeFlags & nc)
			for (e = e.child; e !== null; ) Yo(e, t, n), (e = e.sibling);
	}
	function Yo(e, t, n) {
		switch (e.tag) {
			case 26:
				sa(e, t, n),
					e.flags & nc &&
						e.memoizedState !== null &&
						bd(n, mt, e.memoizedState, e.memoizedProps);
				break;
			case 5:
				sa(e, t, n);
				break;
			case 3:
			case 4:
				var u = mt;
				(mt = hu(e.stateNode.containerInfo)), sa(e, t, n), (mt = u);
				break;
			case 22:
				e.memoizedState === null &&
					((u = e.alternate),
					u !== null && u.memoizedState !== null
						? ((u = nc), (nc = 16777216), sa(e, t, n), (nc = u))
						: sa(e, t, n));
				break;
			default:
				sa(e, t, n);
		}
	}
	function Xo(e) {
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
					(xe = u), Zo(u, e);
				}
			Xo(e);
		}
		if (e.subtreeFlags & 10256)
			for (e = e.child; e !== null; ) Qo(e), (e = e.sibling);
	}
	function Qo(e) {
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
					(xe = u), Zo(u, e);
				}
			Xo(e);
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
	function Zo(e, t) {
		for (; xe !== null; ) {
			var n = xe;
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
					qa(n.memoizedState.cache);
			}
			if (((u = n.child), u !== null)) (u.return = n), (xe = u);
			else
				e: for (n = e; xe !== null; ) {
					u = xe;
					var l = u.sibling,
						r = u.return;
					if ((No(u), u === n)) {
						xe = null;
						break e;
					}
					if (l !== null) {
						(l.return = r), (xe = l);
						break e;
					}
					xe = r;
				}
		}
	}
	var Tb = {
			getCacheForType: function (e) {
				var t = Ae(Oe),
					n = t.data.get(e);
				return n === void 0 && ((n = e()), t.data.set(e, n)), n;
			},
			cacheSignal: function () {
				return Ae(Oe).controller.signal;
			},
		},
		Mb = typeof WeakMap == 'function' ? WeakMap : Map,
		ee = 0,
		fe = null,
		Z = null,
		W = 0,
		ne = 0,
		et = null,
		un = false,
		ba = false,
		pi = false,
		Yt = 0,
		de = 0,
		ln = 0,
		Bn = 0,
		Oi = 0,
		tt = 0,
		da = 0,
		cc = null,
		Qe = null,
		yi = false,
		fu = 0,
		Fo = 0,
		ou = 1 / 0,
		_u = null,
		rn = null,
		we = 0,
		fn = null,
		ga = null,
		Xt = 0,
		ji = 0,
		hi = null,
		Wo = null,
		uc = 0,
		wi = null;
	function nt() {
		return (ee & 2) !== 0 && W !== 0 ? W & -W : A.T !== null ? Ti() : ir();
	}
	function Ko() {
		if (tt === 0)
			if ((W & 536870912) === 0 || I) {
				var e = yc;
				(yc <<= 1), (yc & 3932160) === 0 && (yc = 262144), (tt = e);
			} else tt = 536870912;
		return (e = $e.current), e !== null && (e.flags |= 32), tt;
	}
	function Ze(e, t, n) {
		((e === fe && (ne === 2 || ne === 9)) ||
			e.cancelPendingCommit !== null) &&
			(ma(e, 0), on(e, W, tt, false)),
			Ea(e, n),
			((ee & 2) === 0 || e !== fe) &&
				(e === fe &&
					((ee & 2) === 0 && (Bn |= n),
					de === 4 && on(e, W, tt, false)),
				xt(e));
	}
	function Jo(e, t, n) {
		if ((ee & 6) !== 0) throw Error(f(327));
		var u =
				(!n && (t & 127) === 0 && (t & e.expiredLanes) === 0) ||
				Sa(e, t),
			l = u ? Cb(e, t) : xi(e, t, true),
			r = u;
		do {
			if (l === 0) {
				ba && !u && on(e, t, 0, false);
				break;
			} else {
				if (((n = e.current.alternate), r && !Db(n))) {
					(l = xi(e, t, false)), (r = false);
					continue;
				}
				if (l === 2) {
					if (((r = t), e.errorRecoveryDisabledLanes & r)) var o = 0;
					else
						(o = e.pendingLanes & -536870913),
							(o = o !== 0 ? o : o & 536870912 ? 536870912 : 0);
					if (o !== 0) {
						t = o;
						e: {
							var s = e;
							l = cc;
							var d = s.current.memoizedState.isDehydrated;
							if (
								(d && (ma(s, o).flags |= 256),
								(o = xi(s, o, false)),
								o !== 2)
							) {
								if (pi && !d) {
									(s.errorRecoveryDisabledLanes |= r),
										(Bn |= r),
										(l = 4);
									break e;
								}
								(r = Qe),
									(Qe = l),
									r !== null &&
										(Qe === null
											? (Qe = r)
											: Qe.push.apply(Qe, r));
							}
							l = o;
						}
						if (((r = false), l !== 2)) continue;
					}
				}
				if (l === 1) {
					ma(e, 0), on(e, t, 0, true);
					break;
				}
				e: {
					switch (((u = e), (r = l), r)) {
						case 0:
						case 1:
							throw Error(f(345));
						case 4:
							if ((t & 4194048) !== t) break;
						case 6:
							on(u, t, tt, !un);
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
						if ((on(u, t, tt, !un), hc(u, 0, true) !== 0)) break e;
						(Xt = t),
							(u.timeoutHandle = E_(
								ko.bind(
									null,
									u,
									n,
									Qe,
									_u,
									yi,
									t,
									tt,
									Bn,
									da,
									un,
									r,
									'Throttled',
									-0,
									0,
								),
								l,
							));
						break e;
					}
					ko(u, n, Qe, _u, yi, t, tt, Bn, da, un, r, null, -0, 0);
				}
			}
			break;
		} while (true);
		xt(e);
	}
	function ko(e, t, n, u, l, r, o, s, d, h, E, M, w, S) {
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
				Yo(t, r, M);
			var N =
				(r & 62914560) === r
					? fu - We()
					: (r & 4194048) === r
						? Fo - We()
						: 0;
			if (((N = dd(M, N)), N !== null)) {
				(Xt = r),
					(e.cancelPendingCommit = N(
						c_.bind(
							null,
							e,
							t,
							r,
							n,
							u,
							l,
							o,
							s,
							d,
							E,
							M,
							null,
							w,
							S,
						),
					)),
					on(e, r, o, !h);
				return;
			}
		}
		c_(e, t, r, n, u, l, o, s, d);
	}
	function Db(e) {
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
						r = l.getSnapshot;
					l = l.value;
					try {
						if (!ke(r(), l)) return false;
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
	function on(e, t, n, u) {
		(t &= ~Oi),
			(t &= ~Bn),
			(e.suspendedLanes |= t),
			(e.pingedLanes &= ~t),
			u && (e.warmLanes |= t),
			(u = e.expirationTimes);
		for (var l = t; 0 < l; ) {
			var r = 31 - Je(l),
				o = 1 << r;
			(u[r] = -1), (l &= ~o);
		}
		n !== 0 && cr(e, n, t);
	}
	function su() {
		return (ee & 6) === 0 ? (lc(0), false) : true;
	}
	function vi() {
		if (Z !== null) {
			if (ne === 0) var e = Z.return;
			else
				(e = Z),
					(Ct = Tn = null),
					Gl(e),
					(la = null),
					(Ya = 0),
					(e = Z);
			for (; e !== null; ) Ao(e.alternate, e), (e = e.return);
			Z = null;
		}
	}
	function ma(e, t) {
		var n = e.timeoutHandle;
		n !== -1 && ((e.timeoutHandle = -1), kb(n)),
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
			(ba = Sa(e, t)),
			(pi = false),
			(da = tt = Oi = Bn = ln = de = 0),
			(Qe = cc = null),
			(yi = false),
			(t & 8) !== 0 && (t |= t & 32);
		var u = e.entangledLanes;
		if (u !== 0)
			for (e = e.entanglements, u &= t; 0 < u; ) {
				var l = 31 - Je(u),
					r = 1 << l;
				(t |= e[l]), (u &= ~r);
			}
		return (Yt = t), zc(), n;
	}
	function Io(e, t) {
		(Y = null),
			(A.H = ka),
			t === ua || t === Vc
				? ((t = sf()), (ne = 3))
				: t === Al
					? ((t = sf()), (ne = 4))
					: (ne =
							t === ti
								? 8
								: t !== null &&
									  typeof t == 'object' &&
									  typeof t.then == 'function'
									? 6
									: 1),
			(et = t),
			Z === null && ((de = 1), tu(e, it(t, e.current)));
	}
	function $o() {
		var e = $e.current;
		return e === null
			? true
			: (W & 4194048) === W
				? _t === null
				: (W & 62914560) === W || (W & 536870912) !== 0
					? e === _t
					: false;
	}
	function Po() {
		var e = A.H;
		return (A.H = ka), e === null ? ka : e;
	}
	function e_() {
		var e = A.A;
		return (A.A = Tb), e;
	}
	function bu() {
		(de = 4),
			un || ((W & 4194048) !== W && $e.current !== null) || (ba = true),
			((ln & 134217727) === 0 && (Bn & 134217727) === 0) ||
				fe === null ||
				on(fe, W, tt, false);
	}
	function xi(e, t, n) {
		var u = ee;
		ee |= 2;
		var l = Po(),
			r = e_();
		(fe !== e || W !== t) && ((_u = null), ma(e, t)), (t = false);
		var o = de;
		e: do
			try {
				if (ne !== 0 && Z !== null) {
					var s = Z,
						d = et;
					switch (ne) {
						case 8:
							vi(), (o = 6);
							break e;
						case 3:
						case 2:
						case 9:
						case 6:
							$e.current === null && (t = true);
							var h = ne;
							if (
								((ne = 0), (et = null), pa(e, s, d, h), n && ba)
							) {
								o = 0;
								break e;
							}
							break;
						default:
							(h = ne), (ne = 0), (et = null), pa(e, s, d, h);
					}
				}
				Rb(), (o = de);
				break;
			} catch (E) {
				Io(e, E);
			}
		while (true);
		return (
			t && e.shellSuspendCounter++,
			(Ct = Tn = null),
			(ee = u),
			(A.H = l),
			(A.A = r),
			Z === null && ((fe = null), (W = 0), zc()),
			o
		);
	}
	function Rb() {
		for (; Z !== null; ) t_(Z);
	}
	function Cb(e, t) {
		var n = ee;
		ee |= 2;
		var u = Po(),
			l = e_();
		fe !== e || W !== t
			? ((_u = null), (ou = We() + 500), ma(e, t))
			: (ba = Sa(e, t));
		e: do
			try {
				if (ne !== 0 && Z !== null) {
					t = Z;
					var r = et;
					t: switch (ne) {
						case 1:
							(ne = 0), (et = null), pa(e, t, r, 1);
							break;
						case 2:
						case 9:
							if (of(r)) {
								(ne = 0), (et = null), n_(t);
								break;
							}
							(t = function () {
								(ne !== 2 && ne !== 9) || fe !== e || (ne = 7),
									xt(e);
							}),
								r.then(t, t);
							break e;
						case 3:
							ne = 7;
							break e;
						case 4:
							ne = 5;
							break e;
						case 7:
							of(r)
								? ((ne = 0), (et = null), n_(t))
								: ((ne = 0), (et = null), pa(e, t, r, 7));
							break;
						case 5:
							var o = null;
							switch (Z.tag) {
								case 26:
									o = Z.memoizedState;
								case 5:
								case 27:
									var s = Z;
									if (o ? V_(o) : s.stateNode.complete) {
										(ne = 0), (et = null);
										var d = s.sibling;
										if (d !== null) Z = d;
										else {
											var h = s.return;
											h !== null
												? ((Z = h), du(h))
												: (Z = null);
										}
										break t;
									}
							}
							(ne = 0), (et = null), pa(e, t, r, 5);
							break;
						case 6:
							(ne = 0), (et = null), pa(e, t, r, 6);
							break;
						case 8:
							vi(), (de = 6);
							break e;
						default:
							throw Error(f(462));
					}
				}
				zb();
				break;
			} catch (E) {
				Io(e, E);
			}
		while (true);
		return (
			(Ct = Tn = null),
			(A.H = u),
			(A.A = l),
			(ee = n),
			Z !== null ? 0 : ((fe = null), (W = 0), zc(), de)
		);
	}
	function zb() {
		for (; Z !== null && !ns(); ) t_(Z);
	}
	function t_(e) {
		var t = So(e.alternate, e, Yt);
		(e.memoizedProps = e.pendingProps), t === null ? du(e) : (Z = t);
	}
	function n_(e) {
		var t = e,
			n = t.alternate;
		switch (t.tag) {
			case 15:
			case 0:
				t = yo(n, t, t.pendingProps, t.type, void 0, W);
				break;
			case 11:
				t = yo(n, t, t.pendingProps, t.type.render, t.ref, W);
				break;
			case 5:
				Gl(t);
			default:
				Ao(n, t), (t = Z = $r(t, Yt)), (t = So(n, t, Yt));
		}
		(e.memoizedProps = e.pendingProps), t === null ? du(e) : (Z = t);
	}
	function pa(e, t, n, u) {
		(Ct = Tn = null), Gl(t), (la = null), (Ya = 0);
		var l = t.return;
		try {
			if (hb(e, l, t, n, W)) {
				(de = 1), tu(e, it(n, e.current)), (Z = null);
				return;
			}
		} catch (r) {
			if (l !== null) throw ((Z = l), r);
			(de = 1), tu(e, it(n, e.current)), (Z = null);
			return;
		}
		t.flags & 32768
			? (I || u === 1
					? (e = true)
					: ba || (W & 536870912) !== 0
						? (e = false)
						: ((un = e = true),
							(u === 2 || u === 9 || u === 3 || u === 6) &&
								((u = $e.current),
								u !== null &&
									u.tag === 13 &&
									(u.flags |= 16384))),
				a_(t, e))
			: du(t);
	}
	function du(e) {
		var t = e;
		do {
			if ((t.flags & 32768) !== 0) {
				a_(t, un);
				return;
			}
			e = t.return;
			var n = xb(t.alternate, t, Yt);
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
		de === 0 && (de = 5);
	}
	function a_(e, t) {
		do {
			var n = Sb(e.alternate, e);
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
		(de = 6), (Z = null);
	}
	function c_(e, t, n, u, l, r, o, s, d) {
		e.cancelPendingCommit = null;
		do gu();
		while (we !== 0);
		if ((ee & 6) !== 0) throw Error(f(327));
		if (t !== null) {
			if (t === e.current) throw Error(f(177));
			if (
				((r = t.lanes | t.childLanes),
				(r |= sl),
				ss(e, n, r, o, s, d),
				e === fe && ((Z = fe = null), (W = 0)),
				(ga = t),
				(fn = e),
				(Xt = n),
				(ji = r),
				(hi = l),
				(Wo = u),
				(t.subtreeFlags & 10256) !== 0 || (t.flags & 10256) !== 0
					? ((e.callbackNode = null),
						(e.callbackPriority = 0),
						Bb(pc, function () {
							return f_(), null;
						}))
					: ((e.callbackNode = null), (e.callbackPriority = 0)),
				(u = (t.flags & 13878) !== 0),
				(t.subtreeFlags & 13878) !== 0 || u)
			) {
				(u = A.T),
					(A.T = null),
					(l = C.p),
					(C.p = 2),
					(o = ee),
					(ee |= 4);
				try {
					Eb(e, t, n);
				} finally {
					(ee = o), (C.p = l), (A.T = u);
				}
			}
			(we = 1), u_(), l_(), i_();
		}
	}
	function u_() {
		if (we === 1) {
			we = 0;
			var e = fn,
				t = ga,
				n = (t.flags & 13878) !== 0;
			if ((t.subtreeFlags & 13878) !== 0 || n) {
				(n = A.T), (A.T = null);
				var u = C.p;
				C.p = 2;
				var l = ee;
				ee |= 4;
				try {
					Go(t, e);
					var r = Ui,
						o = Xr(e.containerInfo),
						s = r.focusedElem,
						d = r.selectionRange;
					if (
						o !== s &&
						s &&
						s.ownerDocument &&
						Yr(s.ownerDocument.documentElement, s)
					) {
						if (d !== null && il(s)) {
							var h = d.start,
								E = d.end;
							if (
								(E === void 0 && (E = h), 'selectionStart' in s)
							)
								(s.selectionStart = h),
									(s.selectionEnd = Math.min(
										E,
										s.value.length,
									));
							else {
								var M = s.ownerDocument || document,
									w = (M && M.defaultView) || window;
								if (w.getSelection) {
									var S = w.getSelection(),
										N = s.textContent.length,
										G = Math.min(d.start, N),
										ie =
											d.end === void 0
												? G
												: Math.min(d.end, N);
									!S.extend &&
										G > ie &&
										((o = ie), (ie = G), (G = o));
									var O = Vr(s, G),
										g = Vr(s, ie);
									if (
										O &&
										g &&
										(S.rangeCount !== 1 ||
											S.anchorNode !== O.node ||
											S.anchorOffset !== O.offset ||
											S.focusNode !== g.node ||
											S.focusOffset !== g.offset)
									) {
										var j = M.createRange();
										j.setStart(O.node, O.offset),
											S.removeAllRanges(),
											G > ie
												? (S.addRange(j),
													S.extend(g.node, g.offset))
												: (j.setEnd(g.node, g.offset),
													S.addRange(j));
									}
								}
							}
						}
						for (M = [], S = s; (S = S.parentNode); )
							S.nodeType === 1 &&
								M.push({
									element: S,
									left: S.scrollLeft,
									top: S.scrollTop,
								});
						for (
							typeof s.focus == 'function' && s.focus(), s = 0;
							s < M.length;
							s++
						) {
							var T = M[s];
							(T.element.scrollLeft = T.left),
								(T.element.scrollTop = T.top);
						}
					}
					(Au = !!Ni), (Ui = Ni = null);
				} finally {
					(ee = l), (C.p = u), (A.T = n);
				}
			}
			(e.current = t), (we = 2);
		}
	}
	function l_() {
		if (we === 2) {
			we = 0;
			var e = fn,
				t = ga,
				n = (t.flags & 8772) !== 0;
			if ((t.subtreeFlags & 8772) !== 0 || n) {
				(n = A.T), (A.T = null);
				var u = C.p;
				C.p = 2;
				var l = ee;
				ee |= 4;
				try {
					Ho(e, t.alternate, t);
				} finally {
					(ee = l), (C.p = u), (A.T = n);
				}
			}
			we = 3;
		}
	}
	function i_() {
		if (we === 4 || we === 3) {
			(we = 0), as();
			var e = fn,
				t = ga,
				n = Xt,
				u = Wo;
			(t.subtreeFlags & 10256) !== 0 || (t.flags & 10256) !== 0
				? (we = 5)
				: ((we = 0), (ga = fn = null), r_(e, e.pendingLanes));
			var l = e.pendingLanes;
			if (
				(l === 0 && (rn = null),
				Yu(n),
				(t = t.stateNode),
				Ke && typeof Ke.onCommitFiberRoot == 'function')
			)
				try {
					Ke.onCommitFiberRoot(
						xa,
						t,
						void 0,
						(t.current.flags & 128) === 128,
					);
				} catch {}
			if (u !== null) {
				(t = A.T), (l = C.p), (C.p = 2), (A.T = null);
				try {
					for (
						var r = e.onRecoverableError, o = 0;
						o < u.length;
						o++
					) {
						var s = u[o];
						r(s.value, { componentStack: s.stack });
					}
				} finally {
					(A.T = t), (C.p = l);
				}
			}
			(Xt & 3) !== 0 && gu(),
				xt(e),
				(l = e.pendingLanes),
				(n & 261930) !== 0 && (l & 42) !== 0
					? e === wi
						? uc++
						: ((uc = 0), (wi = e))
					: (uc = 0),
				lc(0);
		}
	}
	function r_(e, t) {
		(e.pooledCacheLanes &= t) === 0 &&
			((t = e.pooledCache), t != null && ((e.pooledCache = null), qa(t)));
	}
	function gu() {
		return u_(), l_(), i_(), f_();
	}
	function f_() {
		if (we !== 5) return false;
		var e = fn,
			t = ji;
		ji = 0;
		var n = Yu(Xt),
			u = A.T,
			l = C.p;
		try {
			(C.p = 32 > n ? 32 : n), (A.T = null), (n = hi), (hi = null);
			var r = fn,
				o = Xt;
			if (((we = 0), (ga = fn = null), (Xt = 0), (ee & 6) !== 0))
				throw Error(f(331));
			var s = ee;
			if (
				((ee |= 4),
				Qo(r.current),
				Vo(r, r.current, o, n),
				(ee = s),
				lc(0, false),
				Ke && typeof Ke.onPostCommitFiberRoot == 'function')
			)
				try {
					Ke.onPostCommitFiberRoot(xa, r);
				} catch {}
			return true;
		} finally {
			(C.p = l), (A.T = u), r_(e, t);
		}
	}
	function o_(e, t, n) {
		(t = it(n, t)),
			(t = ei(e.stateNode, t, 2)),
			(e = tn(e, t, 2)),
			e !== null && (Ea(e, 2), xt(e));
	}
	function ae(e, t, n) {
		if (e.tag === 3) o_(e, e, n);
		else
			for (; t !== null; ) {
				if (t.tag === 3) {
					o_(t, e, n);
					break;
				} else if (t.tag === 1) {
					var u = t.stateNode;
					if (
						typeof t.type.getDerivedStateFromError == 'function' ||
						(typeof u.componentDidCatch == 'function' &&
							(rn === null || !rn.has(u)))
					) {
						(e = it(n, e)),
							(n = oo(2)),
							(u = tn(t, n, 2)),
							u !== null && (_o(n, u, t, e), Ea(u, 2), xt(u));
						break;
					}
				}
				t = t.return;
			}
	}
	function Si(e, t, n) {
		var u = e.pingCache;
		if (u === null) {
			u = e.pingCache = new Mb();
			var l = /* @__PURE__ */ new Set();
			u.set(t, l);
		} else
			(l = u.get(t)),
				l === void 0 && ((l = /* @__PURE__ */ new Set()), u.set(t, l));
		l.has(n) ||
			((pi = true), l.add(n), (e = Hb.bind(null, e, t, n)), t.then(e, e));
	}
	function Hb(e, t, n) {
		var u = e.pingCache;
		u !== null && u.delete(t),
			(e.pingedLanes |= e.suspendedLanes & n),
			(e.warmLanes &= ~n),
			fe === e &&
				(W & n) === n &&
				(de === 4 ||
				(de === 3 && (W & 62914560) === W && 300 > We() - fu)
					? (ee & 2) === 0 && ma(e, 0)
					: (Oi |= n),
				da === W && (da = 0)),
			xt(e);
	}
	function __(e, t) {
		t === 0 && (t = ar()), (e = Sn(e, t)), e !== null && (Ea(e, t), xt(e));
	}
	function Nb(e) {
		var t = e.memoizedState,
			n = 0;
		t !== null && (n = t.retryLane), __(e, n);
	}
	function Ub(e, t) {
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
		u !== null && u.delete(t), __(e, n);
	}
	function Bb(e, t) {
		return Lu(e, t);
	}
	var mu = null,
		Oa = null,
		Ei = false,
		pu = false,
		Ai = false,
		_n = 0;
	function xt(e) {
		e !== Oa &&
			e.next === null &&
			(Oa === null ? (mu = Oa = e) : (Oa = Oa.next = e)),
			(pu = true),
			Ei || ((Ei = true), Gb());
	}
	function lc(e, t) {
		if (!Ai && pu) {
			Ai = true;
			do
				for (var n = false, u = mu; u !== null; ) {
					if (e !== 0) {
						var l = u.pendingLanes;
						if (l === 0) var r = 0;
						else {
							var o = u.suspendedLanes,
								s = u.pingedLanes;
							(r = (1 << (31 - Je(42 | e) + 1)) - 1),
								(r &= l & ~(o & ~s)),
								(r =
									r & 201326741
										? (r & 201326741) | 1
										: r
											? r | 2
											: 0);
						}
						r !== 0 && ((n = true), g_(u, r));
					} else
						(r = W),
							(r = hc(
								u,
								u === fe ? r : 0,
								u.cancelPendingCommit !== null ||
									u.timeoutHandle !== -1,
							)),
							(r & 3) === 0 || Sa(u, r) || ((n = true), g_(u, r));
					u = u.next;
				}
			while (n);
			Ai = false;
		}
	}
	function Lb() {
		s_();
	}
	function s_() {
		pu = Ei = false;
		var e = 0;
		_n !== 0 && Jb() && (e = _n);
		for (var t = We(), n = null, u = mu; u !== null; ) {
			var l = u.next,
				r = b_(u, t);
			r === 0
				? ((u.next = null),
					n === null ? (mu = l) : (n.next = l),
					l === null && (Oa = n))
				: ((n = u), (e !== 0 || (r & 3) !== 0) && (pu = true)),
				(u = l);
		}
		(we !== 0 && we !== 5) || lc(e), _n !== 0 && (_n = 0);
	}
	function b_(e, t) {
		for (
			var n = e.suspendedLanes,
				u = e.pingedLanes,
				l = e.expirationTimes,
				r = e.pendingLanes & -62914561;
			0 < r;

		) {
			var o = 31 - Je(r),
				s = 1 << o,
				d = l[o];
			d === -1
				? ((s & n) === 0 || (s & u) !== 0) && (l[o] = _s(s, t))
				: d <= t && (e.expiredLanes |= s),
				(r &= ~s);
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
				u !== null && u !== null && Gu(u),
				(e.callbackNode = null),
				(e.callbackPriority = 0)
			);
		if ((n & 3) === 0 || Sa(e, n)) {
			if (((t = n & -n), t === e.callbackPriority)) return t;
			switch ((u !== null && Gu(u), Yu(n))) {
				case 2:
				case 8:
					n = tr;
					break;
				case 32:
					n = pc;
					break;
				case 268435456:
					n = nr;
					break;
				default:
					n = pc;
			}
			return (
				(u = d_.bind(null, e)),
				(n = Lu(n, u)),
				(e.callbackPriority = t),
				(e.callbackNode = n),
				t
			);
		}
		return (
			u !== null && u !== null && Gu(u),
			(e.callbackPriority = 2),
			(e.callbackNode = null),
			2
		);
	}
	function d_(e, t) {
		if (we !== 0 && we !== 5)
			return (e.callbackNode = null), (e.callbackPriority = 0), null;
		var n = e.callbackNode;
		if (gu() && e.callbackNode !== n) return null;
		var u = W;
		return (
			(u = hc(
				e,
				e === fe ? u : 0,
				e.cancelPendingCommit !== null || e.timeoutHandle !== -1,
			)),
			u === 0
				? null
				: (Jo(e, u, t),
					b_(e, We()),
					e.callbackNode != null && e.callbackNode === n
						? d_.bind(null, e)
						: null)
		);
	}
	function g_(e, t) {
		if (gu()) return null;
		Jo(e, t, true);
	}
	function Gb() {
		Ib(function () {
			(ee & 6) !== 0 ? Lu(er, Lb) : s_();
		});
	}
	function Ti() {
		if (_n === 0) {
			var e = aa;
			e === 0 &&
				((e = Oc), (Oc <<= 1), (Oc & 261888) === 0 && (Oc = 256)),
				(_n = e);
		}
		return _n;
	}
	function m_(e) {
		return e == null || typeof e == 'symbol' || typeof e == 'boolean'
			? null
			: typeof e == 'function'
				? e
				: Sc('' + e);
	}
	function p_(e, t) {
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
	function qb(e, t, n, u, l) {
		if (t === 'submit' && n && n.stateNode === l) {
			var r = m_((l[Ge] || null).action),
				o = u.submitter;
			o &&
				((t = (t = o[Ge] || null)
					? m_(t.formAction)
					: o.getAttribute('formAction')),
				t !== null && ((r = t), (o = null)));
			var s = new Mc('action', 'action', null, u, l);
			e.push({
				event: s,
				listeners: [
					{
						instance: null,
						listener: function () {
							if (u.defaultPrevented) {
								if (_n !== 0) {
									var d = o ? p_(l, o) : new FormData(l);
									Kl(
										n,
										{
											pending: true,
											data: d,
											method: l.method,
											action: r,
										},
										null,
										d,
									);
								}
							} else
								typeof r == 'function' &&
									(s.preventDefault(),
									(d = o ? p_(l, o) : new FormData(l)),
									Kl(
										n,
										{
											pending: true,
											data: d,
											method: l.method,
											action: r,
										},
										r,
										d,
									));
						},
						currentTarget: l,
					},
				],
			});
		}
	}
	for (var Mi = 0; Mi < _l.length; Mi++) {
		var Di = _l[Mi],
			Vb = Di.toLowerCase(),
			Yb = Di[0].toUpperCase() + Di.slice(1);
		gt(Vb, 'on' + Yb);
	}
	gt(Fr, 'onAnimationEnd'),
		gt(Wr, 'onAnimationIteration'),
		gt(Kr, 'onAnimationStart'),
		gt('dblclick', 'onDoubleClick'),
		gt('focusin', 'onFocus'),
		gt('focusout', 'onBlur'),
		gt(cb, 'onTransitionRun'),
		gt(ub, 'onTransitionStart'),
		gt(lb, 'onTransitionCancel'),
		gt(Jr, 'onTransitionEnd'),
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
		Xb = new Set(
			'beforetoggle cancel close invalid load scroll scrollend toggle'
				.split(' ')
				.concat(ic),
		);
	function O_(e, t) {
		t = (t & 4) !== 0;
		for (var n = 0; n < e.length; n++) {
			var u = e[n],
				l = u.event;
			u = u.listeners;
			e: {
				var r = void 0;
				if (t)
					for (var o = u.length - 1; 0 <= o; o--) {
						var s = u[o],
							d = s.instance,
							h = s.currentTarget;
						if (
							((s = s.listener),
							d !== r && l.isPropagationStopped())
						)
							break e;
						(r = s), (l.currentTarget = h);
						try {
							r(l);
						} catch (E) {
							Cc(E);
						}
						(l.currentTarget = null), (r = d);
					}
				else
					for (o = 0; o < u.length; o++) {
						if (
							((s = u[o]),
							(d = s.instance),
							(h = s.currentTarget),
							(s = s.listener),
							d !== r && l.isPropagationStopped())
						)
							break e;
						(r = s), (l.currentTarget = h);
						try {
							r(l);
						} catch (E) {
							Cc(E);
						}
						(l.currentTarget = null), (r = d);
					}
			}
		}
	}
	function F(e, t) {
		var n = t[Xu];
		n === void 0 && (n = t[Xu] = /* @__PURE__ */ new Set());
		var u = e + '__bubble';
		n.has(u) || (y_(t, e, 2, false), n.add(u));
	}
	function Ri(e, t, n) {
		var u = 0;
		t && (u |= 4), y_(n, e, u, t);
	}
	var Ou = '_reactListening' + Math.random().toString(36).slice(2);
	function Ci(e) {
		if (!e[Ou]) {
			(e[Ou] = true),
				or.forEach(function (n) {
					n !== 'selectionchange' &&
						(Xb.has(n) || Ri(n, false, e), Ri(n, true, e));
				});
			var t = e.nodeType === 9 ? e : e.ownerDocument;
			t === null ||
				t[Ou] ||
				((t[Ou] = true), Ri('selectionchange', false, t));
		}
	}
	function y_(e, t, n, u) {
		switch (K_(t)) {
			case 2:
				var l = pd;
				break;
			case 8:
				l = Od;
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
	function zi(e, t, n, u, l) {
		var r = u;
		if ((t & 1) === 0 && (t & 2) === 0 && u !== null)
			e: for (;;) {
				if (u === null) return;
				var o = u.tag;
				if (o === 3 || o === 4) {
					var s = u.stateNode.containerInfo;
					if (s === l) break;
					if (o === 4)
						for (o = u.return; o !== null; ) {
							var d = o.tag;
							if (
								(d === 3 || d === 4) &&
								o.stateNode.containerInfo === l
							)
								return;
							o = o.return;
						}
					for (; s !== null; ) {
						if (((o = qn(s)), o === null)) return;
						if (
							((d = o.tag),
							d === 5 || d === 6 || d === 26 || d === 27)
						) {
							u = r = o;
							continue e;
						}
						s = s.parentNode;
					}
				}
				u = u.return;
			}
		wr(function () {
			var h = r,
				E = ku(n),
				M = [];
			e: {
				var w = kr.get(e);
				if (w !== void 0) {
					var S = Mc,
						N = e;
					switch (e) {
						case 'keypress':
							if (Ac(n) === 0) break e;
						case 'keydown':
						case 'keyup':
							S = Us;
							break;
						case 'focusin':
							(N = 'focus'), (S = nl);
							break;
						case 'focusout':
							(N = 'blur'), (S = nl);
							break;
						case 'beforeblur':
						case 'afterblur':
							S = nl;
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
							S = Sr;
							break;
						case 'drag':
						case 'dragend':
						case 'dragenter':
						case 'dragexit':
						case 'dragleave':
						case 'dragover':
						case 'dragstart':
						case 'drop':
							S = xs;
							break;
						case 'touchcancel':
						case 'touchend':
						case 'touchmove':
						case 'touchstart':
							S = Gs;
							break;
						case Fr:
						case Wr:
						case Kr:
							S = As;
							break;
						case Jr:
							S = Vs;
							break;
						case 'scroll':
						case 'scrollend':
							S = ws;
							break;
						case 'wheel':
							S = Xs;
							break;
						case 'copy':
						case 'cut':
						case 'paste':
							S = Ms;
							break;
						case 'gotpointercapture':
						case 'lostpointercapture':
						case 'pointercancel':
						case 'pointerdown':
						case 'pointermove':
						case 'pointerout':
						case 'pointerover':
						case 'pointerup':
							S = Ar;
							break;
						case 'toggle':
						case 'beforetoggle':
							S = Zs;
					}
					var G = (t & 4) !== 0,
						ie = !G && (e === 'scroll' || e === 'scrollend'),
						O = G ? (w !== null ? w + 'Capture' : null) : w;
					G = [];
					for (var g = h, j; g !== null; ) {
						var T = g;
						if (
							((j = T.stateNode),
							(T = T.tag),
							(T !== 5 && T !== 26 && T !== 27) ||
								j === null ||
								O === null ||
								((T = Ma(g, O)),
								T != null && G.push(rc(g, T, j))),
							ie)
						)
							break;
						g = g.return;
					}
					0 < G.length &&
						((w = new S(w, N, null, n, E)),
						M.push({ event: w, listeners: G }));
				}
			}
			if ((t & 7) === 0) {
				e: {
					if (
						((w = e === 'mouseover' || e === 'pointerover'),
						(S = e === 'mouseout' || e === 'pointerout'),
						w &&
							n !== Ju &&
							(N = n.relatedTarget || n.fromElement) &&
							(qn(N) || N[Gn]))
					)
						break e;
					if (
						(S || w) &&
						((w =
							E.window === E
								? E
								: (w = E.ownerDocument)
									? w.defaultView || w.parentWindow
									: window),
						S
							? ((N = n.relatedTarget || n.toElement),
								(S = h),
								(N = N ? qn(N) : null),
								N !== null &&
									((ie = b(N)),
									(G = N.tag),
									N !== ie ||
										(G !== 5 && G !== 27 && G !== 6)) &&
									(N = null))
							: ((S = null), (N = h)),
						S !== N)
					) {
						if (
							((G = Sr),
							(T = 'onMouseLeave'),
							(O = 'onMouseEnter'),
							(g = 'mouse'),
							(e === 'pointerout' || e === 'pointerover') &&
								((G = Ar),
								(T = 'onPointerLeave'),
								(O = 'onPointerEnter'),
								(g = 'pointer')),
							(ie = S == null ? w : Ta(S)),
							(j = N == null ? w : Ta(N)),
							(w = new G(T, g + 'leave', S, n, E)),
							(w.target = ie),
							(w.relatedTarget = j),
							(T = null),
							qn(E) === h &&
								((G = new G(O, g + 'enter', N, n, E)),
								(G.target = j),
								(G.relatedTarget = ie),
								(T = G)),
							(ie = T),
							S && N)
						)
							t: {
								for (
									G = Qb, O = S, g = N, j = 0, T = O;
									T;
									T = G(T)
								)
									j++;
								T = 0;
								for (var L = g; L; L = G(L)) T++;
								for (; 0 < j - T; ) (O = G(O)), j--;
								for (; 0 < T - j; ) (g = G(g)), T--;
								for (; j--; ) {
									if (
										O === g ||
										(g !== null && O === g.alternate)
									) {
										G = O;
										break t;
									}
									(O = G(O)), (g = G(g));
								}
								G = null;
							}
						else G = null;
						S !== null && j_(M, w, S, G, false),
							N !== null && ie !== null && j_(M, ie, N, G, true);
					}
				}
				e: {
					if (
						((w = h ? Ta(h) : window),
						(S = w.nodeName && w.nodeName.toLowerCase()),
						S === 'select' || (S === 'input' && w.type === 'file'))
					)
						var $ = Nr;
					else if (zr(w))
						if (Ur) $ = tb;
						else {
							$ = Ps;
							var B = $s;
						}
					else
						(S = w.nodeName),
							!S ||
							S.toLowerCase() !== 'input' ||
							(w.type !== 'checkbox' && w.type !== 'radio')
								? h && Ku(h.elementType) && ($ = Nr)
								: ($ = eb);
					if ($ && ($ = $(e, h))) {
						Hr(M, $, n, E);
						break e;
					}
					B && B(e, w, h),
						e === 'focusout' &&
							h &&
							w.type === 'number' &&
							h.memoizedProps.value != null &&
							Wu(w, 'number', w.value);
				}
				switch (((B = h ? Ta(h) : window), e)) {
					case 'focusin':
						(zr(B) || B.contentEditable === 'true') &&
							((Jn = B), (rl = h), (Ba = null));
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
						(fl = false), Qr(M, n, E);
						break;
					case 'selectionchange':
						if (ab) break;
					case 'keydown':
					case 'keyup':
						Qr(M, n, E);
				}
				var X;
				if (cl)
					e: {
						switch (e) {
							case 'compositionstart':
								var K = 'onCompositionStart';
								break e;
							case 'compositionend':
								K = 'onCompositionEnd';
								break e;
							case 'compositionupdate':
								K = 'onCompositionUpdate';
								break e;
						}
						K = void 0;
					}
				else
					Kn
						? Rr(e, n) && (K = 'onCompositionEnd')
						: e === 'keydown' &&
							n.keyCode === 229 &&
							(K = 'onCompositionStart');
				K &&
					(Tr &&
						n.locale !== 'ko' &&
						(Kn || K !== 'onCompositionStart'
							? K === 'onCompositionEnd' && Kn && (X = vr())
							: ((Kt = E),
								(Pu =
									'value' in Kt ? Kt.value : Kt.textContent),
								(Kn = true))),
					(B = yu(h, K)),
					0 < B.length &&
						((K = new Er(K, e, null, n, E)),
						M.push({ event: K, listeners: B }),
						X
							? (K.data = X)
							: ((X = Cr(n)), X !== null && (K.data = X)))),
					(X = Ws ? Ks(e, n) : Js(e, n)) &&
						((K = yu(h, 'onBeforeInput')),
						0 < K.length &&
							((B = new Er(
								'onBeforeInput',
								'beforeinput',
								null,
								n,
								E,
							)),
							M.push({ event: B, listeners: K }),
							(B.data = X))),
					qb(M, e, h, n, E);
			}
			O_(M, t);
		});
	}
	function rc(e, t, n) {
		return { instance: e, listener: t, currentTarget: n };
	}
	function yu(e, t) {
		for (var n = t + 'Capture', u = []; e !== null; ) {
			var l = e,
				r = l.stateNode;
			if (
				((l = l.tag),
				(l !== 5 && l !== 26 && l !== 27) ||
					r === null ||
					((l = Ma(e, n)),
					l != null && u.unshift(rc(e, l, r)),
					(l = Ma(e, t)),
					l != null && u.push(rc(e, l, r))),
				e.tag === 3)
			)
				return u;
			e = e.return;
		}
		return [];
	}
	function Qb(e) {
		if (e === null) return null;
		do e = e.return;
		while (e && e.tag !== 5 && e.tag !== 27);
		return e || null;
	}
	function j_(e, t, n, u, l) {
		for (var r = t._reactName, o = []; n !== null && n !== u; ) {
			var s = n,
				d = s.alternate,
				h = s.stateNode;
			if (((s = s.tag), d !== null && d === u)) break;
			(s !== 5 && s !== 26 && s !== 27) ||
				h === null ||
				((d = h),
				l
					? ((h = Ma(n, r)), h != null && o.unshift(rc(n, h, d)))
					: l || ((h = Ma(n, r)), h != null && o.push(rc(n, h, d)))),
				(n = n.return);
		}
		o.length !== 0 && e.push({ event: t, listeners: o });
	}
	var Zb = /\r\n?/g,
		Fb = /\u0000|\uFFFD/g;
	function h_(e) {
		return (typeof e == 'string' ? e : '' + e)
			.replace(
				Zb,
				`
`,
			)
			.replace(Fb, '');
	}
	function w_(e, t) {
		return (t = h_(t)), h_(e) === t;
	}
	function le(e, t, n, u, l, r) {
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
				jr(e, u, r);
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
				(u = Sc('' + u)), e.setAttribute(n, u);
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
					typeof r == 'function' &&
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
				(u = Sc('' + u)), e.setAttribute(n, u);
				break;
			case 'onClick':
				u != null && (e.onclick = Tt);
				break;
			case 'onScroll':
				u != null && F('scroll', e);
				break;
			case 'onScrollEnd':
				u != null && F('scrollend', e);
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
				(n = Sc('' + u)),
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
				F('beforetoggle', e), F('toggle', e), wc(e, 'popover', u);
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
					((n = js.get(n) || n), wc(e, n, u));
		}
	}
	function Hi(e, t, n, u, l, r) {
		switch (n) {
			case 'style':
				jr(e, u, r);
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
				u != null && F('scroll', e);
				break;
			case 'onScrollEnd':
				u != null && F('scrollend', e);
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
				if (!_r.hasOwnProperty(n))
					e: {
						if (
							n[0] === 'o' &&
							n[1] === 'n' &&
							((l = n.endsWith('Capture')),
							(t = n.slice(2, l ? n.length - 7 : void 0)),
							(r = e[Ge] || null),
							(r = r != null ? r[n] : null),
							typeof r == 'function' &&
								e.removeEventListener(t, r, l),
							typeof u == 'function')
						) {
							typeof r != 'function' &&
								r !== null &&
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
				F('error', e), F('load', e);
				var u = false,
					l = false,
					r;
				for (r in n)
					if (n.hasOwnProperty(r)) {
						var o = n[r];
						if (o != null)
							switch (r) {
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
									le(e, t, r, o, n, null);
							}
					}
				l && le(e, t, 'srcSet', n.srcSet, n, null),
					u && le(e, t, 'src', n.src, n, null);
				return;
			case 'input':
				F('invalid', e);
				var s = (r = o = l = null),
					d = null,
					h = null;
				for (u in n)
					if (n.hasOwnProperty(u)) {
						var E = n[u];
						if (E != null)
							switch (u) {
								case 'name':
									l = E;
									break;
								case 'type':
									o = E;
									break;
								case 'checked':
									d = E;
									break;
								case 'defaultChecked':
									h = E;
									break;
								case 'value':
									r = E;
									break;
								case 'defaultValue':
									s = E;
									break;
								case 'children':
								case 'dangerouslySetInnerHTML':
									if (E != null) throw Error(f(137, t));
									break;
								default:
									le(e, t, u, E, n, null);
							}
					}
				mr(e, r, s, d, h, o, l, false);
				return;
			case 'select':
				F('invalid', e), (u = o = r = null);
				for (l in n)
					if (n.hasOwnProperty(l) && ((s = n[l]), s != null))
						switch (l) {
							case 'value':
								r = s;
								break;
							case 'defaultValue':
								o = s;
								break;
							case 'multiple':
								u = s;
							default:
								le(e, t, l, s, n, null);
						}
				(t = r),
					(n = o),
					(e.multiple = !!u),
					t != null
						? Qn(e, !!u, t, false)
						: n != null && Qn(e, !!u, n, true);
				return;
			case 'textarea':
				F('invalid', e), (r = l = u = null);
				for (o in n)
					if (n.hasOwnProperty(o) && ((s = n[o]), s != null))
						switch (o) {
							case 'value':
								u = s;
								break;
							case 'defaultValue':
								l = s;
								break;
							case 'children':
								r = s;
								break;
							case 'dangerouslySetInnerHTML':
								if (s != null) throw Error(f(91));
								break;
							default:
								le(e, t, o, s, n, null);
						}
				Or(e, u, l, r);
				return;
			case 'option':
				for (d in n)
					if (n.hasOwnProperty(d) && ((u = n[d]), u != null))
						switch (d) {
							case 'selected':
								e.selected =
									u &&
									typeof u != 'function' &&
									typeof u != 'symbol';
								break;
							default:
								le(e, t, d, u, n, null);
						}
				return;
			case 'dialog':
				F('beforetoggle', e),
					F('toggle', e),
					F('cancel', e),
					F('close', e);
				break;
			case 'iframe':
			case 'object':
				F('load', e);
				break;
			case 'video':
			case 'audio':
				for (u = 0; u < ic.length; u++) F(ic[u], e);
				break;
			case 'image':
				F('error', e), F('load', e);
				break;
			case 'details':
				F('toggle', e);
				break;
			case 'embed':
			case 'source':
			case 'link':
				F('error', e), F('load', e);
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
				for (h in n)
					if (n.hasOwnProperty(h) && ((u = n[h]), u != null))
						switch (h) {
							case 'children':
							case 'dangerouslySetInnerHTML':
								throw Error(f(137, t));
							default:
								le(e, t, h, u, n, null);
						}
				return;
			default:
				if (Ku(t)) {
					for (E in n)
						n.hasOwnProperty(E) &&
							((u = n[E]),
							u !== void 0 && Hi(e, t, E, u, n, void 0));
					return;
				}
		}
		for (s in n)
			n.hasOwnProperty(s) &&
				((u = n[s]), u != null && le(e, t, s, u, n, null));
	}
	function Wb(e, t, n, u) {
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
					r = null,
					o = null,
					s = null,
					d = null,
					h = null,
					E = null;
				for (S in n) {
					var M = n[S];
					if (n.hasOwnProperty(S) && M != null)
						switch (S) {
							case 'checked':
								break;
							case 'value':
								break;
							case 'defaultValue':
								d = M;
							default:
								u.hasOwnProperty(S) || le(e, t, S, null, u, M);
						}
				}
				for (var w in u) {
					var S = u[w];
					if (
						((M = n[w]),
						u.hasOwnProperty(w) && (S != null || M != null))
					)
						switch (w) {
							case 'type':
								r = S;
								break;
							case 'name':
								l = S;
								break;
							case 'checked':
								h = S;
								break;
							case 'defaultChecked':
								E = S;
								break;
							case 'value':
								o = S;
								break;
							case 'defaultValue':
								s = S;
								break;
							case 'children':
							case 'dangerouslySetInnerHTML':
								if (S != null) throw Error(f(137, t));
								break;
							default:
								S !== M && le(e, t, w, S, u, M);
						}
				}
				Fu(e, o, s, d, h, E, r, l);
				return;
			case 'select':
				S = o = s = w = null;
				for (r in n)
					if (((d = n[r]), n.hasOwnProperty(r) && d != null))
						switch (r) {
							case 'value':
								break;
							case 'multiple':
								S = d;
							default:
								u.hasOwnProperty(r) || le(e, t, r, null, u, d);
						}
				for (l in u)
					if (
						((r = u[l]),
						(d = n[l]),
						u.hasOwnProperty(l) && (r != null || d != null))
					)
						switch (l) {
							case 'value':
								w = r;
								break;
							case 'defaultValue':
								s = r;
								break;
							case 'multiple':
								o = r;
							default:
								r !== d && le(e, t, l, r, u, d);
						}
				(t = s),
					(n = o),
					(u = S),
					w != null
						? Qn(e, !!n, w, false)
						: !!u != !!n &&
							(t != null
								? Qn(e, !!n, t, true)
								: Qn(e, !!n, n ? [] : '', false));
				return;
			case 'textarea':
				S = w = null;
				for (s in n)
					if (
						((l = n[s]),
						n.hasOwnProperty(s) &&
							l != null &&
							!u.hasOwnProperty(s))
					)
						switch (s) {
							case 'value':
								break;
							case 'children':
								break;
							default:
								le(e, t, s, null, u, l);
						}
				for (o in u)
					if (
						((l = u[o]),
						(r = n[o]),
						u.hasOwnProperty(o) && (l != null || r != null))
					)
						switch (o) {
							case 'value':
								w = l;
								break;
							case 'defaultValue':
								S = l;
								break;
							case 'children':
								break;
							case 'dangerouslySetInnerHTML':
								if (l != null) throw Error(f(91));
								break;
							default:
								l !== r && le(e, t, o, l, u, r);
						}
				pr(e, w, S);
				return;
			case 'option':
				for (var N in n)
					if (
						((w = n[N]),
						n.hasOwnProperty(N) &&
							w != null &&
							!u.hasOwnProperty(N))
					)
						switch (N) {
							case 'selected':
								e.selected = false;
								break;
							default:
								le(e, t, N, null, u, w);
						}
				for (d in u)
					if (
						((w = u[d]),
						(S = n[d]),
						u.hasOwnProperty(d) &&
							w !== S &&
							(w != null || S != null))
					)
						switch (d) {
							case 'selected':
								e.selected =
									w &&
									typeof w != 'function' &&
									typeof w != 'symbol';
								break;
							default:
								le(e, t, d, w, u, S);
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
				for (var G in n)
					(w = n[G]),
						n.hasOwnProperty(G) &&
							w != null &&
							!u.hasOwnProperty(G) &&
							le(e, t, G, null, u, w);
				for (h in u)
					if (
						((w = u[h]),
						(S = n[h]),
						u.hasOwnProperty(h) &&
							w !== S &&
							(w != null || S != null))
					)
						switch (h) {
							case 'children':
							case 'dangerouslySetInnerHTML':
								if (w != null) throw Error(f(137, t));
								break;
							default:
								le(e, t, h, w, u, S);
						}
				return;
			default:
				if (Ku(t)) {
					for (var ie in n)
						(w = n[ie]),
							n.hasOwnProperty(ie) &&
								w !== void 0 &&
								!u.hasOwnProperty(ie) &&
								Hi(e, t, ie, void 0, u, w);
					for (E in u)
						(w = u[E]),
							(S = n[E]),
							!u.hasOwnProperty(E) ||
								w === S ||
								(w === void 0 && S === void 0) ||
								Hi(e, t, E, w, u, S);
					return;
				}
		}
		for (var O in n)
			(w = n[O]),
				n.hasOwnProperty(O) &&
					w != null &&
					!u.hasOwnProperty(O) &&
					le(e, t, O, null, u, w);
		for (M in u)
			(w = u[M]),
				(S = n[M]),
				!u.hasOwnProperty(M) ||
					w === S ||
					(w == null && S == null) ||
					le(e, t, M, w, u, S);
	}
	function v_(e) {
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
	function Kb() {
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
					r = l.transferSize,
					o = l.initiatorType,
					s = l.duration;
				if (r && s && v_(o)) {
					for (o = 0, s = l.responseEnd, u += 1; u < n.length; u++) {
						var d = n[u],
							h = d.startTime;
						if (h > s) break;
						var E = d.transferSize,
							M = d.initiatorType;
						E &&
							v_(M) &&
							((d = d.responseEnd),
							(o += E * (d < s ? 1 : (s - h) / (d - h))));
					}
					if (
						(--u,
						(t += (8 * (r + o)) / (l.duration / 1e3)),
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
	var Ni = null,
		Ui = null;
	function ju(e) {
		return e.nodeType === 9 ? e : e.ownerDocument;
	}
	function x_(e) {
		switch (e) {
			case 'http://www.w3.org/2000/svg':
				return 1;
			case 'http://www.w3.org/1998/Math/MathML':
				return 2;
			default:
				return 0;
		}
	}
	function S_(e, t) {
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
	var Li = null;
	function Jb() {
		var e = window.event;
		return e && e.type === 'popstate'
			? e === Li
				? false
				: ((Li = e), true)
			: ((Li = null), false);
	}
	var E_ = typeof setTimeout == 'function' ? setTimeout : void 0,
		kb = typeof clearTimeout == 'function' ? clearTimeout : void 0,
		A_ = typeof Promise == 'function' ? Promise : void 0,
		Ib =
			typeof queueMicrotask == 'function'
				? queueMicrotask
				: typeof A_ < 'u'
					? function (e) {
							return A_.resolve(null).then(e).catch($b);
						}
					: E_;
	function $b(e) {
		setTimeout(function () {
			throw e;
		});
	}
	function sn(e) {
		return e === 'head';
	}
	function T_(e, t) {
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
					for (var r = n.firstChild; r; ) {
						var o = r.nextSibling,
							s = r.nodeName;
						r[Aa] ||
							s === 'SCRIPT' ||
							s === 'STYLE' ||
							(s === 'LINK' &&
								r.rel.toLowerCase() === 'stylesheet') ||
							n.removeChild(r),
							(r = o);
					}
				} else n === 'body' && fc(e.ownerDocument.body);
			n = l;
		} while (n);
		wa(t);
	}
	function M_(e, t) {
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
	function Gi(e) {
		var t = e.firstChild;
		for (t && t.nodeType === 10 && (t = t.nextSibling); t; ) {
			var n = t;
			switch (((t = t.nextSibling), n.nodeName)) {
				case 'HTML':
				case 'HEAD':
				case 'BODY':
					Gi(n), Qu(n);
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
	function Pb(e, t, n, u) {
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
								((r = e.getAttribute('rel')),
								r === 'stylesheet' &&
									e.hasAttribute('data-precedence'))
							)
								break;
							if (
								r !== l.rel ||
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
								((r = e.getAttribute('src')),
								(r !== (l.src == null ? null : l.src) ||
									e.getAttribute('type') !==
										(l.type == null ? null : l.type) ||
									e.getAttribute('crossorigin') !==
										(l.crossOrigin == null
											? null
											: l.crossOrigin)) &&
									r &&
									e.hasAttribute('async') &&
									!e.hasAttribute('itemprop'))
							)
								break;
							return e;
						default:
							return e;
					}
			} else if (t === 'input' && e.type === 'hidden') {
				var r = l.name == null ? null : '' + l.name;
				if (l.type === 'hidden' && e.getAttribute('name') === r)
					return e;
			} else return e;
			if (((e = st(e.nextSibling)), e === null)) break;
		}
		return null;
	}
	function ed(e, t, n) {
		if (t === '') return null;
		for (; e.nodeType !== 3; )
			if (
				((e.nodeType !== 1 ||
					e.nodeName !== 'INPUT' ||
					e.type !== 'hidden') &&
					!n) ||
				((e = st(e.nextSibling)), e === null)
			)
				return null;
		return e;
	}
	function D_(e, t) {
		for (; e.nodeType !== 8; )
			if (
				((e.nodeType !== 1 ||
					e.nodeName !== 'INPUT' ||
					e.type !== 'hidden') &&
					!t) ||
				((e = st(e.nextSibling)), e === null)
			)
				return null;
		return e;
	}
	function qi(e) {
		return e.data === '$?' || e.data === '$~';
	}
	function Vi(e) {
		return (
			e.data === '$!' ||
			(e.data === '$?' && e.ownerDocument.readyState !== 'loading')
		);
	}
	function td(e, t) {
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
	function st(e) {
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
	function R_(e) {
		e = e.nextSibling;
		for (var t = 0; e; ) {
			if (e.nodeType === 8) {
				var n = e.data;
				if (n === '/$' || n === '/&') {
					if (t === 0) return st(e.nextSibling);
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
	function C_(e) {
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
	function z_(e, t, n) {
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
	var bt = /* @__PURE__ */ new Map(),
		H_ = /* @__PURE__ */ new Set();
	function hu(e) {
		return typeof e.getRootNode == 'function'
			? e.getRootNode()
			: e.nodeType === 9
				? e
				: e.ownerDocument;
	}
	var Qt = C.d;
	C.d = { f: nd, r: ad, D: cd, C: ud, L: ld, m: id, X: fd, S: rd, M: od };
	function nd() {
		var e = Qt.f(),
			t = su();
		return e || t;
	}
	function ad(e) {
		var t = Vn(e);
		t !== null && t.tag === 5 && t.type === 'form' ? kf(t) : Qt.r(e);
	}
	var ya = typeof document > 'u' ? null : document;
	function N_(e, t, n) {
		var u = ya;
		if (u && typeof t == 'string' && t) {
			var l = ut(t);
			(l = 'link[rel="' + e + '"][href="' + l + '"]'),
				typeof n == 'string' && (l += '[crossorigin="' + n + '"]'),
				H_.has(l) ||
					(H_.add(l),
					(e = { rel: e, crossOrigin: n, href: t }),
					u.querySelector(l) === null &&
						((t = u.createElement('link')),
						Me(t, 'link', e),
						ve(t),
						u.head.appendChild(t)));
		}
	}
	function cd(e) {
		Qt.D(e), N_('dns-prefetch', e, null);
	}
	function ud(e, t) {
		Qt.C(e, t), N_('preconnect', e, t);
	}
	function ld(e, t, n) {
		Qt.L(e, t, n);
		var u = ya;
		if (u && e && t) {
			var l = 'link[rel="preload"][as="' + ut(t) + '"]';
			t === 'image' && n && n.imageSrcSet
				? ((l += '[imagesrcset="' + ut(n.imageSrcSet) + '"]'),
					typeof n.imageSizes == 'string' &&
						(l += '[imagesizes="' + ut(n.imageSizes) + '"]'))
				: (l += '[href="' + ut(e) + '"]');
			var r = l;
			switch (t) {
				case 'style':
					r = ja(e);
					break;
				case 'script':
					r = ha(e);
			}
			bt.has(r) ||
				((e = R(
					{
						rel: 'preload',
						href: t === 'image' && n && n.imageSrcSet ? void 0 : e,
						as: t,
					},
					n,
				)),
				bt.set(r, e),
				u.querySelector(l) !== null ||
					(t === 'style' && u.querySelector(oc(r))) ||
					(t === 'script' && u.querySelector(_c(r))) ||
					((t = u.createElement('link')),
					Me(t, 'link', e),
					ve(t),
					u.head.appendChild(t)));
		}
	}
	function id(e, t) {
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
				r = l;
			switch (u) {
				case 'audioworklet':
				case 'paintworklet':
				case 'serviceworker':
				case 'sharedworker':
				case 'worker':
				case 'script':
					r = ha(e);
			}
			if (
				!bt.has(r) &&
				((e = R({ rel: 'modulepreload', href: e }, t)),
				bt.set(r, e),
				n.querySelector(l) === null)
			) {
				switch (u) {
					case 'audioworklet':
					case 'paintworklet':
					case 'serviceworker':
					case 'sharedworker':
					case 'worker':
					case 'script':
						if (n.querySelector(_c(r))) return;
				}
				(u = n.createElement('link')),
					Me(u, 'link', e),
					ve(u),
					n.head.appendChild(u);
			}
		}
	}
	function rd(e, t, n) {
		Qt.S(e, t, n);
		var u = ya;
		if (u && e) {
			var l = Yn(u).hoistableStyles,
				r = ja(e);
			t = t || 'default';
			var o = l.get(r);
			if (!o) {
				var s = { loading: 0, preload: null };
				if ((o = u.querySelector(oc(r)))) s.loading = 5;
				else {
					(e = R(
						{ rel: 'stylesheet', href: e, 'data-precedence': t },
						n,
					)),
						(n = bt.get(r)) && Xi(e, n);
					var d = (o = u.createElement('link'));
					ve(d),
						Me(d, 'link', e),
						(d._p = new Promise(function (h, E) {
							(d.onload = h), (d.onerror = E);
						})),
						d.addEventListener('load', function () {
							s.loading |= 1;
						}),
						d.addEventListener('error', function () {
							s.loading |= 2;
						}),
						(s.loading |= 4),
						wu(o, t, u);
				}
				(o = { type: 'stylesheet', instance: o, count: 1, state: s }),
					l.set(r, o);
			}
		}
	}
	function fd(e, t) {
		Qt.X(e, t);
		var n = ya;
		if (n && e) {
			var u = Yn(n).hoistableScripts,
				l = ha(e),
				r = u.get(l);
			r ||
				((r = n.querySelector(_c(l))),
				r ||
					((e = R({ src: e, async: true }, t)),
					(t = bt.get(l)) && Qi(e, t),
					(r = n.createElement('script')),
					ve(r),
					Me(r, 'link', e),
					n.head.appendChild(r)),
				(r = { type: 'script', instance: r, count: 1, state: null }),
				u.set(l, r));
		}
	}
	function od(e, t) {
		Qt.M(e, t);
		var n = ya;
		if (n && e) {
			var u = Yn(n).hoistableScripts,
				l = ha(e),
				r = u.get(l);
			r ||
				((r = n.querySelector(_c(l))),
				r ||
					((e = R({ src: e, async: true, type: 'module' }, t)),
					(t = bt.get(l)) && Qi(e, t),
					(r = n.createElement('script')),
					ve(r),
					Me(r, 'link', e),
					n.head.appendChild(r)),
				(r = { type: 'script', instance: r, count: 1, state: null }),
				u.set(l, r));
		}
	}
	function U_(e, t, n, u) {
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
					var r = Yn(l).hoistableStyles,
						o = r.get(e);
					if (
						(o ||
							((l = l.ownerDocument || l),
							(o = {
								type: 'stylesheet',
								instance: null,
								count: 0,
								state: { loading: 0, preload: null },
							}),
							r.set(e, o),
							(r = l.querySelector(oc(e))) &&
								!r._p &&
								((o.instance = r), (o.state.loading = 5)),
							bt.has(e) ||
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
								bt.set(e, n),
								r || _d(l, e, n, o.state))),
						t && u === null)
					)
						throw Error(f(528, ''));
					return o;
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
	function oc(e) {
		return 'link[rel="stylesheet"][' + e + ']';
	}
	function B_(e) {
		return R({}, e, { 'data-precedence': e.precedence, precedence: null });
	}
	function _d(e, t, n, u) {
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
	function _c(e) {
		return 'script[async]' + e;
	}
	function L_(e, t, n) {
		if ((t.count++, t.instance === null))
			switch (t.type) {
				case 'style':
					var u = e.querySelector(
						'style[data-href~="' + ut(n.href) + '"]',
					);
					if (u) return (t.instance = u), ve(u), u;
					var l = R({}, n, {
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
					var r = e.querySelector(oc(l));
					if (r)
						return (
							(t.state.loading |= 4), (t.instance = r), ve(r), r
						);
					(u = B_(n)),
						(l = bt.get(l)) && Xi(u, l),
						(r = (e.ownerDocument || e).createElement('link')),
						ve(r);
					var o = r;
					return (
						(o._p = new Promise(function (s, d) {
							(o.onload = s), (o.onerror = d);
						})),
						Me(r, 'link', u),
						(t.state.loading |= 4),
						wu(r, n.precedence, e),
						(t.instance = r)
					);
				case 'script':
					return (
						(r = ha(n.src)),
						(l = e.querySelector(_c(r)))
							? ((t.instance = l), ve(l), l)
							: ((u = n),
								(l = bt.get(r)) && ((u = R({}, n)), Qi(u, l)),
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
				r = l,
				o = 0;
			o < u.length;
			o++
		) {
			var s = u[o];
			if (s.dataset.precedence === t) r = s;
			else if (r !== l) break;
		}
		r
			? r.parentNode.insertBefore(e, r.nextSibling)
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
	function G_(e, t, n) {
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
			var r = n[l];
			if (
				!(
					r[Aa] ||
					r[Se] ||
					(e === 'link' && r.getAttribute('rel') === 'stylesheet')
				) &&
				r.namespaceURI !== 'http://www.w3.org/2000/svg'
			) {
				var o = r.getAttribute(t) || '';
				o = e + o;
				var s = u.get(o);
				s ? s.push(r) : u.set(o, [r]);
			}
		}
		return u;
	}
	function q_(e, t, n) {
		(e = e.ownerDocument || e),
			e.head.insertBefore(
				n,
				t === 'title' ? e.querySelector('head > title') : null,
			);
	}
	function sd(e, t, n) {
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
	function V_(e) {
		return !(e.type === 'stylesheet' && (e.state.loading & 3) === 0);
	}
	function bd(e, t, n, u) {
		if (
			n.type === 'stylesheet' &&
			(typeof u.media != 'string' ||
				matchMedia(u.media).matches !== false) &&
			(n.state.loading & 4) === 0
		) {
			if (n.instance === null) {
				var l = ja(u.href),
					r = t.querySelector(oc(l));
				if (r) {
					(t = r._p),
						t !== null &&
							typeof t == 'object' &&
							typeof t.then == 'function' &&
							(e.count++, (e = xu.bind(e)), t.then(e, e)),
						(n.state.loading |= 4),
						(n.instance = r),
						ve(r);
					return;
				}
				(r = t.ownerDocument || t),
					(u = B_(u)),
					(l = bt.get(l)) && Xi(u, l),
					(r = r.createElement('link')),
					ve(r);
				var o = r;
				(o._p = new Promise(function (s, d) {
					(o.onload = s), (o.onerror = d);
				})),
					Me(r, 'link', u),
					(n.instance = r);
			}
			e.stylesheets === null &&
				(e.stylesheets = /* @__PURE__ */ new Map()),
				e.stylesheets.set(n, t),
				(t = n.state.preload) &&
					(n.state.loading & 3) === 0 &&
					(e.count++,
					(n = xu.bind(e)),
					t.addEventListener('load', n),
					t.addEventListener('error', n));
		}
	}
	var Zi = 0;
	function dd(e, t) {
		return (
			e.stylesheets && e.count === 0 && Eu(e, e.stylesheets),
			0 < e.count || 0 < e.imgCount
				? function (n) {
						var u = setTimeout(function () {
							if (
								(e.stylesheets && Eu(e, e.stylesheets),
								e.unsuspend)
							) {
								var r = e.unsuspend;
								(e.unsuspend = null), r();
							}
						}, 6e4 + t);
						0 < e.imgBytes && Zi === 0 && (Zi = 62500 * Kb());
						var l = setTimeout(
							function () {
								if (
									((e.waitingForImages = false),
									e.count === 0 &&
										(e.stylesheets && Eu(e, e.stylesheets),
										e.unsuspend))
								) {
									var r = e.unsuspend;
									(e.unsuspend = null), r();
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
	function xu() {
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
	var Su = null;
	function Eu(e, t) {
		(e.stylesheets = null),
			e.unsuspend !== null &&
				(e.count++,
				(Su = /* @__PURE__ */ new Map()),
				t.forEach(gd, e),
				(Su = null),
				xu.call(e));
	}
	function gd(e, t) {
		if (!(t.state.loading & 4)) {
			var n = Su.get(e);
			if (n) var u = n.get(null);
			else {
				(n = /* @__PURE__ */ new Map()), Su.set(e, n);
				for (
					var l = e.querySelectorAll(
							'link[data-precedence],style[data-precedence]',
						),
						r = 0;
					r < l.length;
					r++
				) {
					var o = l[r];
					(o.nodeName === 'LINK' ||
						o.getAttribute('media') !== 'not all') &&
						(n.set(o.dataset.precedence, o), (u = o));
				}
				u && n.set(null, u);
			}
			(l = t.instance),
				(o = l.getAttribute('data-precedence')),
				(r = n.get(o) || u),
				r === u && n.set(null, l),
				n.set(o, l),
				this.count++,
				(u = xu.bind(this)),
				l.addEventListener('load', u),
				l.addEventListener('error', u),
				r
					? r.parentNode.insertBefore(l, r.nextSibling)
					: ((e = e.nodeType === 9 ? e.head : e),
						e.insertBefore(l, e.firstChild)),
				(t.state.loading |= 4);
		}
	}
	var sc = {
		$$typeof: Re,
		Provider: null,
		Consumer: null,
		_currentValue: q,
		_currentValue2: q,
		_threadCount: 0,
	};
	function md(e, t, n, u, l, r, o, s, d) {
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
			(this.expirationTimes = qu(-1)),
			(this.entangledLanes =
				this.shellSuspendCounter =
				this.errorRecoveryDisabledLanes =
				this.expiredLanes =
				this.warmLanes =
				this.pingedLanes =
				this.suspendedLanes =
				this.pendingLanes =
					0),
			(this.entanglements = qu(0)),
			(this.hiddenUpdates = qu(null)),
			(this.identifierPrefix = u),
			(this.onUncaughtError = l),
			(this.onCaughtError = r),
			(this.onRecoverableError = o),
			(this.pooledCache = null),
			(this.pooledCacheLanes = 0),
			(this.formState = d),
			(this.incompleteTransitions = /* @__PURE__ */ new Map());
	}
	function Y_(e, t, n, u, l, r, o, s, d, h, E, M) {
		return (
			(e = new md(e, t, n, o, d, h, E, M, s)),
			(t = 1),
			r === true && (t |= 24),
			(r = Ie(3, null, null, t)),
			(e.current = r),
			(r.stateNode = e),
			(t = xl()),
			t.refCount++,
			(e.pooledCache = t),
			t.refCount++,
			(r.memoizedState = { element: u, isDehydrated: n, cache: t }),
			Tl(r),
			e
		);
	}
	function X_(e) {
		return e ? ((e = $n), e) : $n;
	}
	function Q_(e, t, n, u, l, r) {
		(l = X_(l)),
			u.context === null ? (u.context = l) : (u.pendingContext = l),
			(u = en(t)),
			(u.payload = { element: n }),
			(r = r === void 0 ? null : r),
			r !== null && (u.callback = r),
			(n = tn(e, u, t)),
			n !== null && (Ze(n, e, t), Qa(n, e, t));
	}
	function Z_(e, t) {
		if (((e = e.memoizedState), e !== null && e.dehydrated !== null)) {
			var n = e.retryLane;
			e.retryLane = n !== 0 && n < t ? n : t;
		}
	}
	function Fi(e, t) {
		Z_(e, t), (e = e.alternate) && Z_(e, t);
	}
	function F_(e) {
		if (e.tag === 13 || e.tag === 31) {
			var t = Sn(e, 67108864);
			t !== null && Ze(t, e, 67108864), Fi(e, 67108864);
		}
	}
	function W_(e) {
		if (e.tag === 13 || e.tag === 31) {
			var t = nt();
			t = Vu(t);
			var n = Sn(e, t);
			n !== null && Ze(n, e, t), Fi(e, t);
		}
	}
	var Au = true;
	function pd(e, t, n, u) {
		var l = A.T;
		A.T = null;
		var r = C.p;
		try {
			(C.p = 2), Wi(e, t, n, u);
		} finally {
			(C.p = r), (A.T = l);
		}
	}
	function Od(e, t, n, u) {
		var l = A.T;
		A.T = null;
		var r = C.p;
		try {
			(C.p = 8), Wi(e, t, n, u);
		} finally {
			(C.p = r), (A.T = l);
		}
	}
	function Wi(e, t, n, u) {
		if (Au) {
			var l = Ki(u);
			if (l === null) zi(e, t, u, Tu, n), J_(e, u);
			else if (jd(l, e, t, n, u)) u.stopPropagation();
			else if ((J_(e, u), t & 4 && -1 < yd.indexOf(e))) {
				for (; l !== null; ) {
					var r = Vn(l);
					if (r !== null)
						switch (r.tag) {
							case 3:
								if (
									((r = r.stateNode),
									r.current.memoizedState.isDehydrated)
								) {
									var o = jn(r.pendingLanes);
									if (o !== 0) {
										var s = r;
										for (
											s.pendingLanes |= 2,
												s.entangledLanes |= 2;
											o;

										) {
											var d = 1 << (31 - Je(o));
											(s.entanglements[1] |= d),
												(o &= ~d);
										}
										xt(r),
											(ee & 6) === 0 &&
												((ou = We() + 500), lc(0));
									}
								}
								break;
							case 31:
							case 13:
								(s = Sn(r, 2)),
									s !== null && Ze(s, r, 2),
									su(),
									Fi(r, 2);
						}
					if (
						((r = Ki(u)), r === null && zi(e, t, u, Tu, n), r === l)
					)
						break;
					l = r;
				}
				l !== null && u.stopPropagation();
			} else zi(e, t, u, null, n);
		}
	}
	function Ki(e) {
		return (e = ku(e)), Ji(e);
	}
	var Tu = null;
	function Ji(e) {
		if (((Tu = null), (e = qn(e)), e !== null)) {
			var t = b(e);
			if (t === null) e = null;
			else {
				var n = t.tag;
				if (n === 13) {
					if (((e = y(t)), e !== null)) return e;
					e = null;
				} else if (n === 31) {
					if (((e = x(t)), e !== null)) return e;
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
	function K_(e) {
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
				switch (cs()) {
					case er:
						return 2;
					case tr:
						return 8;
					case pc:
					case us:
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
		bn = null,
		dn = null,
		gn = null,
		bc = /* @__PURE__ */ new Map(),
		dc = /* @__PURE__ */ new Map(),
		mn = [],
		yd =
			'mousedown mouseup touchcancel touchend touchstart auxclick dblclick pointercancel pointerdown pointerup dragend dragstart drop compositionend compositionstart keydown keypress keyup input textInput copy cut paste click change contextmenu reset'.split(
				' ',
			);
	function J_(e, t) {
		switch (e) {
			case 'focusin':
			case 'focusout':
				bn = null;
				break;
			case 'dragenter':
			case 'dragleave':
				dn = null;
				break;
			case 'mouseover':
			case 'mouseout':
				gn = null;
				break;
			case 'pointerover':
			case 'pointerout':
				bc.delete(t.pointerId);
				break;
			case 'gotpointercapture':
			case 'lostpointercapture':
				dc.delete(t.pointerId);
		}
	}
	function gc(e, t, n, u, l, r) {
		return e === null || e.nativeEvent !== r
			? ((e = {
					blockedOn: t,
					domEventName: n,
					eventSystemFlags: u,
					nativeEvent: r,
					targetContainers: [l],
				}),
				t !== null && ((t = Vn(t)), t !== null && F_(t)),
				e)
			: ((e.eventSystemFlags |= u),
				(t = e.targetContainers),
				l !== null && t.indexOf(l) === -1 && t.push(l),
				e);
	}
	function jd(e, t, n, u, l) {
		switch (t) {
			case 'focusin':
				return (bn = gc(bn, e, t, n, u, l)), true;
			case 'dragenter':
				return (dn = gc(dn, e, t, n, u, l)), true;
			case 'mouseover':
				return (gn = gc(gn, e, t, n, u, l)), true;
			case 'pointerover':
				var r = l.pointerId;
				return bc.set(r, gc(bc.get(r) || null, e, t, n, u, l)), true;
			case 'gotpointercapture':
				return (
					(r = l.pointerId),
					dc.set(r, gc(dc.get(r) || null, e, t, n, u, l)),
					true
				);
		}
		return false;
	}
	function k_(e) {
		var t = qn(e.target);
		if (t !== null) {
			var n = b(t);
			if (n !== null) {
				if (((t = n.tag), t === 13)) {
					if (((t = y(n)), t !== null)) {
						(e.blockedOn = t),
							rr(e.priority, function () {
								W_(n);
							});
						return;
					}
				} else if (t === 31) {
					if (((t = x(n)), t !== null)) {
						(e.blockedOn = t),
							rr(e.priority, function () {
								W_(n);
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
			var n = Ki(e.nativeEvent);
			if (n === null) {
				n = e.nativeEvent;
				var u = new n.constructor(n.type, n);
				(Ju = u), n.target.dispatchEvent(u), (Ju = null);
			} else
				return (
					(t = Vn(n)), t !== null && F_(t), (e.blockedOn = n), false
				);
			t.shift();
		}
		return true;
	}
	function I_(e, t, n) {
		Mu(e) && n.delete(t);
	}
	function hd() {
		(ki = false),
			bn !== null && Mu(bn) && (bn = null),
			dn !== null && Mu(dn) && (dn = null),
			gn !== null && Mu(gn) && (gn = null),
			bc.forEach(I_),
			dc.forEach(I_);
	}
	function Du(e, t) {
		e.blockedOn === t &&
			((e.blockedOn = null),
			ki ||
				((ki = true),
				a.unstable_scheduleCallback(a.unstable_NormalPriority, hd)));
	}
	var Ru = null;
	function $_(e) {
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
					var r = Vn(n);
					r !== null &&
						(e.splice(t, 3),
						(t -= 3),
						Kl(
							r,
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
		function t(d) {
			return Du(d, e);
		}
		bn !== null && Du(bn, e),
			dn !== null && Du(dn, e),
			gn !== null && Du(gn, e),
			bc.forEach(t),
			dc.forEach(t);
		for (var n = 0; n < mn.length; n++) {
			var u = mn[n];
			u.blockedOn === e && (u.blockedOn = null);
		}
		for (; 0 < mn.length && ((n = mn[0]), n.blockedOn === null); )
			k_(n), n.blockedOn === null && mn.shift();
		if (((n = (e.ownerDocument || e).$$reactFormReplay), n != null))
			for (u = 0; u < n.length; u += 3) {
				var l = n[u],
					r = n[u + 1],
					o = l[Ge] || null;
				if (typeof r == 'function') o || $_(n);
				else if (o) {
					var s = null;
					if (r && r.hasAttribute('formAction')) {
						if (((l = r), (o = r[Ge] || null))) s = o.formAction;
						else if (Ji(l) !== null) continue;
					} else s = o.action;
					typeof s == 'function'
						? (n[u + 1] = s)
						: (n.splice(u, 3), (u -= 3)),
						$_(n);
				}
			}
	}
	function P_() {
		function e(r) {
			r.canIntercept &&
				r.info === 'react-transition' &&
				r.intercept({
					handler: function () {
						return new Promise(function (o) {
							return (l = o);
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
				var r = navigation.currentEntry;
				r &&
					r.url != null &&
					navigation.navigate(r.url, {
						state: r.getState(),
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
	(Cu.prototype.render = Ii.prototype.render =
		function (e) {
			var t = this._internalRoot;
			if (t === null) throw Error(f(409));
			var n = t.current,
				u = nt();
			Q_(n, u, e, t, null, null);
		}),
		(Cu.prototype.unmount = Ii.prototype.unmount =
			function () {
				var e = this._internalRoot;
				if (e !== null) {
					this._internalRoot = null;
					var t = e.containerInfo;
					Q_(e.current, 2, null, e, null, null), su(), (t[Gn] = null);
				}
			});
	function Cu(e) {
		this._internalRoot = e;
	}
	Cu.prototype.unstable_scheduleHydration = function (e) {
		if (e) {
			var t = ir();
			e = { blockedOn: null, target: e, priority: t };
			for (
				var n = 0;
				n < mn.length && t !== 0 && t < mn[n].priority;
				n++
			);
			mn.splice(n, 0, e), n === 0 && k_(e);
		}
	};
	var es = c.version;
	if (es !== '19.2.4') throw Error(f(527, es, '19.2.4'));
	C.findDOMNode = function (e) {
		var t = e._reactInternals;
		if (t === void 0)
			throw typeof e.render == 'function'
				? Error(f(188))
				: ((e = Object.keys(e).join(',')), Error(f(268, e)));
		return (
			(e = p(t)),
			(e = e !== null ? z(e) : null),
			(e = e === null ? null : e.stateNode),
			e
		);
	};
	var wd = {
		bundleType: 0,
		version: '19.2.4',
		rendererPackageName: 'react-dom',
		currentDispatcherRef: A,
		reconcilerVersion: '19.2.4',
	};
	if (typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ < 'u') {
		var zu = __REACT_DEVTOOLS_GLOBAL_HOOK__;
		if (!zu.isDisabled && zu.supportsFiber)
			try {
				(xa = zu.inject(wd)), (Ke = zu);
			} catch {}
	}
	return (
		(reactDomClient_production.createRoot = function (e, t) {
			if (!_(e)) throw Error(f(299));
			var n = false,
				u = '',
				l = lo,
				r = io,
				o = ro;
			return (
				t != null &&
					(t.unstable_strictMode === true && (n = true),
					t.identifierPrefix !== void 0 && (u = t.identifierPrefix),
					t.onUncaughtError !== void 0 && (l = t.onUncaughtError),
					t.onCaughtError !== void 0 && (r = t.onCaughtError),
					t.onRecoverableError !== void 0 &&
						(o = t.onRecoverableError)),
				(t = Y_(e, 1, false, null, null, n, u, null, l, r, o, P_)),
				(e[Gn] = t.current),
				Ci(e),
				new Ii(t)
			);
		}),
		(reactDomClient_production.hydrateRoot = function (e, t, n) {
			if (!_(e)) throw Error(f(299));
			var u = false,
				l = '',
				r = lo,
				o = io,
				s = ro,
				d = null;
			return (
				n != null &&
					(n.unstable_strictMode === true && (u = true),
					n.identifierPrefix !== void 0 && (l = n.identifierPrefix),
					n.onUncaughtError !== void 0 && (r = n.onUncaughtError),
					n.onCaughtError !== void 0 && (o = n.onCaughtError),
					n.onRecoverableError !== void 0 &&
						(s = n.onRecoverableError),
					n.formState !== void 0 && (d = n.formState)),
				(t = Y_(e, 1, true, t, n ?? null, u, l, d, r, o, s, P_)),
				(t.context = X_(null)),
				(n = t.current),
				(u = nt()),
				(u = Vu(u)),
				(l = en(u)),
				(l.callback = null),
				tn(n, l, u),
				(n = u),
				(t.current.lanes = n),
				Ea(t, n),
				xt(t),
				(e[Gn] = t.current),
				Ci(e),
				new Cu(t)
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
	on(c, i) {
		this.listeners.has(c) ||
			this.listeners.set(c, /* @__PURE__ */ new Set());
		const f = this.listeners.get(c),
			_ = i;
		return (
			f.add(_),
			() => {
				f.delete(_);
			}
		);
	}
	once(c, i) {
		const f = this.on(c, (_) => {
			f(), i(_);
		});
		return f;
	}
	emit(c, ...i) {
		const f = this.listeners.get(c);
		if (f) {
			const _ = i[0];
			f.forEach((b) => b(_));
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
			let i = [...a.toasts, c.toast];
			return (
				i.length > DEFAULT_TOAST_CONFIG.maxVisible &&
					(i = i.map((f, _) =>
						_ === 0 && !f.exiting ? { ...f, exiting: true } : f,
					)),
				{ toasts: i }
			);
		}
		case 'MARK_EXITING':
			return {
				toasts: a.toasts.map((i) =>
					i.id === c.id ? { ...i, exiting: true } : i,
				),
			};
		case 'REMOVE':
			return { toasts: a.toasts.filter((i) => i.id !== c.id) };
		case 'CLEAR':
			return { toasts: a.toasts.map((i) => ({ ...i, exiting: true })) };
	}
}
const ToastStateContext = reactExports.createContext({ toasts: [] }),
	ToastDispatchContext = reactExports.createContext(() => {});
function ToastProvider({ children: a }) {
	const [c, i] = reactExports.useReducer(toastReducer, { toasts: [] });
	return (
		reactExports.useEffect(() => {
			const f = gameEvents.on(
					'toast:show',
					({ message: y, severity: x, duration: v }) => {
						i({
							type: 'ADD',
							toast: {
								id: crypto.randomUUID(),
								message: y,
								severity: x,
								duration: v ?? SEVERITY_DURATIONS[x],
								createdAt: Date.now(),
								exiting: false,
							},
						});
					},
				),
				_ = gameEvents.on('toast:dismiss', ({ id: y }) => {
					i({ type: 'MARK_EXITING', id: y });
				}),
				b = gameEvents.on('toast:clear', () => {
					i({ type: 'CLEAR' });
				});
			return () => {
				f(), _(), b();
			};
		}, []),
		jsxRuntimeExports.jsx(ToastStateContext, {
			value: c,
			children: jsxRuntimeExports.jsx(ToastDispatchContext, {
				value: i,
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
			const i = a.stack[a.stack.length - 1],
				f = a.stack.slice(0, -1);
			return (
				(_a = i == null ? void 0 : i.onClose) == null
					? void 0
					: _a.call(i),
				{ stack: f, isOpen: f.length > 0 }
			);
		}
		case 'CLOSE_ALL':
			return (
				a.stack.forEach((i) => {
					var _a2;
					return (_a2 = i.onClose) == null ? void 0 : _a2.call(i);
				}),
				initialState$1
			);
	}
}
const ModalStateContext = reactExports.createContext(initialState$1),
	ModalDispatchContext = reactExports.createContext(() => {});
function ModalProvider({ children: a }) {
	const [c, i] = reactExports.useReducer(modalReducer, initialState$1);
	return (
		reactExports.useEffect(() => {
			const f = gameEvents.on(
					'modal:open',
					({ id: b, title: y, content: x, size: v, onClose: p }) => {
						i({
							type: 'OPEN',
							modal: {
								id: b ?? crypto.randomUUID(),
								title: y,
								content: x,
								onClose: p,
								closeOnOverlayClick: true,
								closeOnEscape: true,
								size: v ?? 'md',
							},
						});
					},
				),
				_ = gameEvents.on('modal:close', () => {
					i({ type: 'CLOSE' });
				});
			return () => {
				f(), _();
			};
		}, []),
		jsxRuntimeExports.jsx(ModalStateContext, {
			value: c,
			children: jsxRuntimeExports.jsx(ModalDispatchContext, {
				value: i,
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
	const [c, i] = reactExports.useReducer(menuReducer, initialState);
	return (
		reactExports.useEffect(() => {
			const f = gameEvents.on('menu:toggle', () => {
					i({ type: 'TOGGLE' });
				}),
				_ = gameEvents.on('menu:open', () => {
					i({ type: 'OPEN' });
				}),
				b = gameEvents.on('menu:close', () => {
					i({ type: 'CLOSE' });
				});
			return () => {
				f(), _(), b();
			};
		}, []),
		jsxRuntimeExports.jsx(MenuStateContext, {
			value: c,
			children: jsxRuntimeExports.jsx(MenuDispatchContext, {
				value: i,
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
	const i = SEVERITY_BORDER_COLORS[a.severity];
	return jsxRuntimeExports.jsxs('div', {
		className: `
				pointer-events-auto mb-2 px-3 py-2 md:px-4 md:py-3 min-w-[180px] md:min-w-[260px] max-w-[280px] md:max-w-[380px]
				bg-panel shadow-toast
				border-2 border-panel-border border-l-4 ${i}
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
		i = reactExports.useCallback(
			(f) => {
				var _a;
				((_a = a.find((b) => b.id === f)) == null ? void 0 : _a.exiting)
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
							{ toast: f, onDismiss: i },
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
		i = reactExports.useContext(ModalDispatchContext);
	if (!c || a.length === 0) return null;
	const f = a[a.length - 1],
		_ = MODAL_SIZE_CLASSES[f.size ?? 'md'];
	return reactDomExports.createPortal(
		jsxRuntimeExports.jsx('div', {
			className:
				'fixed inset-0 bg-overlay flex items-center justify-center pointer-events-auto',
			onClick: () => {
				f.closeOnOverlayClick !== false && i({ type: 'CLOSE' });
			},
			children: jsxRuntimeExports.jsx('div', {
				className: `
					${_} mx-4
					border-[3px] border-panel-border
					shadow-[0_0_0_1px_#1a1008,0_6px_20px_rgba(0,0,0,0.8)]
					animate-modal-in
				`,
				onClick: (b) => b.stopPropagation(),
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
									onClick: () => i({ type: 'CLOSE' }),
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
		i = reactExports.useContext(MenuDispatchContext);
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
										onClick: () => i({ type: 'CLOSE' }),
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
											({ key: f, label: _ }) =>
												jsxRuntimeExports.jsx(
													'button',
													{
														onClick: () =>
															i({
																type: 'SET_CATEGORY',
																category: f,
															}),
														className: `
									text-left text-[8px] px-3 py-1.5 cursor-pointer transition-colors
									${c === f ? 'bg-btn text-text' : 'text-text-muted hover:text-text hover:bg-btn/30'}
								`,
														children: _,
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
									onClick: () => i({ type: 'CLOSE' }),
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
function useKeyboard(a, c, i = true) {
	reactExports.useEffect(() => {
		if (!i) return;
		const f = (_) => {
			_.key === a && (_.preventDefault(), c());
		};
		return (
			window.addEventListener('keydown', f),
			() => window.removeEventListener('keydown', f)
		);
	}, [a, c, i]);
}
function focusCanvas() {
	var _a;
	(_a = document.getElementById('bevy-canvas')) == null ? void 0 : _a.focus();
}
function KeyboardRouter() {
	const a = reactExports.useContext(ModalStateContext),
		c = reactExports.useContext(ModalDispatchContext),
		i = reactExports.useContext(MenuStateContext),
		f = reactExports.useContext(MenuDispatchContext),
		_ = reactExports.useRef(false),
		b = a.isOpen || i.isOpen;
	reactExports.useEffect(() => {
		_.current && !b && focusCanvas(), (_.current = b);
	}, [b]);
	const y = reactExports.useCallback(() => {
		a.isOpen
			? c({ type: 'CLOSE' })
			: i.isOpen
				? f({ type: 'CLOSE' })
				: f({ type: 'OPEN' });
	}, [a.isOpen, i.isOpen, c, f]);
	return useKeyboard('Escape', y), null;
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
function dispatch_action(a, c) {
	const i = passStringToWasm0(
			c,
			wasm.__wbindgen_export,
			wasm.__wbindgen_export2,
		),
		f = WASM_VECTOR_LEN;
	wasm.dispatch_action(a, i, f);
}
function get_fps() {
	return wasm.get_fps() >>> 0;
}
function get_hovered_object_json() {
	try {
		const i = wasm.__wbindgen_add_to_stack_pointer(-16);
		wasm.get_hovered_object_json(i);
		var a = getDataViewMemory0().getInt32(i + 0, true),
			c = getDataViewMemory0().getInt32(i + 4, true);
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
function get_inventory_json() {
	try {
		const i = wasm.__wbindgen_add_to_stack_pointer(-16);
		wasm.get_inventory_json(i);
		var a = getDataViewMemory0().getInt32(i + 0, true),
			c = getDataViewMemory0().getInt32(i + 4, true);
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
function get_online_status() {
	return wasm.get_online_status() !== 0;
}
function get_player_state_json() {
	let a, c;
	try {
		const _ = wasm.__wbindgen_add_to_stack_pointer(-16);
		wasm.get_player_state_json(_);
		var i = getDataViewMemory0().getInt32(_ + 0, true),
			f = getDataViewMemory0().getInt32(_ + 4, true);
		return (a = i), (c = f), getStringFromWasm0(i, f);
	} finally {
		wasm.__wbindgen_add_to_stack_pointer(16),
			wasm.__wbindgen_export4(a, c, 1);
	}
}
function get_selected_object_json() {
	try {
		const i = wasm.__wbindgen_add_to_stack_pointer(-16);
		wasm.get_selected_object_json(i);
		var a = getDataViewMemory0().getInt32(i + 0, true),
			c = getDataViewMemory0().getInt32(i + 4, true);
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
function go_online(a, c) {
	const i = passStringToWasm0(
			a,
			wasm.__wbindgen_export,
			wasm.__wbindgen_export2,
		),
		f = WASM_VECTOR_LEN,
		_ = passStringToWasm0(
			c,
			wasm.__wbindgen_export,
			wasm.__wbindgen_export2,
		),
		b = WASM_VECTOR_LEN;
	wasm.go_online(i, f, _, b);
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
				i = typeof c == 'boolean' ? c : void 0;
			return isLikeNone(i) ? 16777215 : i ? 1 : 0;
		},
		__wbg___wbindgen_debug_string_5398f5bb970e0daa: function (a, c) {
			const i = debugString(getObject(c)),
				f = passStringToWasm0(
					i,
					wasm.__wbindgen_export,
					wasm.__wbindgen_export2,
				),
				_ = WASM_VECTOR_LEN;
			getDataViewMemory0().setInt32(a + 4, _, true),
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
			const i = getObject(c),
				f = typeof i == 'number' ? i : void 0;
			getDataViewMemory0().setFloat64(a + 8, isLikeNone(f) ? 0 : f, true),
				getDataViewMemory0().setInt32(a + 0, !isLikeNone(f), true);
		},
		__wbg___wbindgen_string_get_395e606bd0ee4427: function (a, c) {
			const i = getObject(c),
				f = typeof i == 'string' ? i : void 0;
			var _ = isLikeNone(f)
					? 0
					: passStringToWasm0(
							f,
							wasm.__wbindgen_export,
							wasm.__wbindgen_export2,
						),
				b = WASM_VECTOR_LEN;
			getDataViewMemory0().setInt32(a + 4, b, true),
				getDataViewMemory0().setInt32(a + 0, _, true);
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
			return handleError(function (a, c, i, f) {
				getObject(a).addEventListener(
					getStringFromWasm0(c, i),
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
		__wbg_animate_8f41e2f47c7d04ab: function (a, c, i) {
			const f = getObject(a).animate(getObject(c), getObject(i));
			return addHeapObject(f);
		},
		__wbg_appendChild_8cb157b6ec5612a6: function () {
			return handleError(function (a, c) {
				const i = getObject(a).appendChild(getObject(c));
				return addHeapObject(i);
			}, arguments);
		},
		__wbg_arrayBuffer_eb8e9ca620af2a19: function () {
			return handleError(function (a) {
				const c = getObject(a).arrayBuffer();
				return addHeapObject(c);
			}, arguments);
		},
		__wbg_attachShader_6426e8576a115345: function (a, c, i) {
			getObject(a).attachShader(getObject(c), getObject(i));
		},
		__wbg_attachShader_e557f37438249ff7: function (a, c, i) {
			getObject(a).attachShader(getObject(c), getObject(i));
		},
		__wbg_axes_4ba58f8779c5d176: function (a) {
			const c = getObject(a).axes;
			return addHeapObject(c);
		},
		__wbg_beginComputePass_d7b46482cf2ed824: function (a, c) {
			const i = getObject(a).beginComputePass(getObject(c));
			return addHeapObject(i);
		},
		__wbg_beginQuery_ac2ef47e00ec594a: function (a, c, i) {
			getObject(a).beginQuery(c >>> 0, getObject(i));
		},
		__wbg_beginRenderPass_373f34636d157c43: function () {
			return handleError(function (a, c) {
				const i = getObject(a).beginRenderPass(getObject(c));
				return addHeapObject(i);
			}, arguments);
		},
		__wbg_bindAttribLocation_1d976e3bcc954adb: function (a, c, i, f, _) {
			getObject(a).bindAttribLocation(
				getObject(c),
				i >>> 0,
				getStringFromWasm0(f, _),
			);
		},
		__wbg_bindAttribLocation_8791402cc151e914: function (a, c, i, f, _) {
			getObject(a).bindAttribLocation(
				getObject(c),
				i >>> 0,
				getStringFromWasm0(f, _),
			);
		},
		__wbg_bindBufferRange_469c3643c2099003: function (a, c, i, f, _, b) {
			getObject(a).bindBufferRange(c >>> 0, i >>> 0, getObject(f), _, b);
		},
		__wbg_bindBuffer_142694a9732bc098: function (a, c, i) {
			getObject(a).bindBuffer(c >>> 0, getObject(i));
		},
		__wbg_bindBuffer_d2a4f6cfb33336fb: function (a, c, i) {
			getObject(a).bindBuffer(c >>> 0, getObject(i));
		},
		__wbg_bindFramebuffer_4643a12ca1c72776: function (a, c, i) {
			getObject(a).bindFramebuffer(c >>> 0, getObject(i));
		},
		__wbg_bindFramebuffer_fdc7c38f1c700e64: function (a, c, i) {
			getObject(a).bindFramebuffer(c >>> 0, getObject(i));
		},
		__wbg_bindRenderbuffer_91db2fc67c1f0115: function (a, c, i) {
			getObject(a).bindRenderbuffer(c >>> 0, getObject(i));
		},
		__wbg_bindRenderbuffer_e6cfc20b6ebcf605: function (a, c, i) {
			getObject(a).bindRenderbuffer(c >>> 0, getObject(i));
		},
		__wbg_bindSampler_be3a05e88cecae98: function (a, c, i) {
			getObject(a).bindSampler(c >>> 0, getObject(i));
		},
		__wbg_bindTexture_6a0892cd752b41d9: function (a, c, i) {
			getObject(a).bindTexture(c >>> 0, getObject(i));
		},
		__wbg_bindTexture_6e7e157d0aabe457: function (a, c, i) {
			getObject(a).bindTexture(c >>> 0, getObject(i));
		},
		__wbg_bindVertexArrayOES_082b0791772327fa: function (a, c) {
			getObject(a).bindVertexArrayOES(getObject(c));
		},
		__wbg_bindVertexArray_c307251f3ff61930: function (a, c) {
			getObject(a).bindVertexArray(getObject(c));
		},
		__wbg_blendColor_b4c7d8333af4876d: function (a, c, i, f, _) {
			getObject(a).blendColor(c, i, f, _);
		},
		__wbg_blendColor_c2771aead110c867: function (a, c, i, f, _) {
			getObject(a).blendColor(c, i, f, _);
		},
		__wbg_blendEquationSeparate_b08aba1c715cb265: function (a, c, i) {
			getObject(a).blendEquationSeparate(c >>> 0, i >>> 0);
		},
		__wbg_blendEquationSeparate_f16ada84ba672878: function (a, c, i) {
			getObject(a).blendEquationSeparate(c >>> 0, i >>> 0);
		},
		__wbg_blendEquation_46367a891604b604: function (a, c) {
			getObject(a).blendEquation(c >>> 0);
		},
		__wbg_blendEquation_c353d94b097007e5: function (a, c) {
			getObject(a).blendEquation(c >>> 0);
		},
		__wbg_blendFuncSeparate_6aae138b81d75b47: function (a, c, i, f, _) {
			getObject(a).blendFuncSeparate(c >>> 0, i >>> 0, f >>> 0, _ >>> 0);
		},
		__wbg_blendFuncSeparate_8c91c200b1a72e4b: function (a, c, i, f, _) {
			getObject(a).blendFuncSeparate(c >>> 0, i >>> 0, f >>> 0, _ >>> 0);
		},
		__wbg_blendFunc_2e98c5f57736e5f3: function (a, c, i) {
			getObject(a).blendFunc(c >>> 0, i >>> 0);
		},
		__wbg_blendFunc_4ce0991003a9468e: function (a, c, i) {
			getObject(a).blendFunc(c >>> 0, i >>> 0);
		},
		__wbg_blitFramebuffer_c1a68feaca974c87: function (
			a,
			c,
			i,
			f,
			_,
			b,
			y,
			x,
			v,
			p,
			z,
		) {
			getObject(a).blitFramebuffer(
				c,
				i,
				f,
				_,
				b,
				y,
				x,
				v,
				p >>> 0,
				z >>> 0,
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
			const i = getObject(c).brand,
				f = passStringToWasm0(
					i,
					wasm.__wbindgen_export,
					wasm.__wbindgen_export2,
				),
				_ = WASM_VECTOR_LEN;
			getDataViewMemory0().setInt32(a + 4, _, true),
				getDataViewMemory0().setInt32(a + 0, f, true);
		},
		__wbg_brands_b7dcf262485c3e7c: function (a) {
			const c = getObject(a).brands;
			return addHeapObject(c);
		},
		__wbg_bufferData_730b629ba3f6824f: function (a, c, i, f) {
			getObject(a).bufferData(c >>> 0, i, f >>> 0);
		},
		__wbg_bufferData_d20232e3d5dcdc62: function (a, c, i, f) {
			getObject(a).bufferData(c >>> 0, getObject(i), f >>> 0);
		},
		__wbg_bufferData_d3bd8c69ff4b7254: function (a, c, i, f) {
			getObject(a).bufferData(c >>> 0, getObject(i), f >>> 0);
		},
		__wbg_bufferData_fb2d946faa09a60b: function (a, c, i, f) {
			getObject(a).bufferData(c >>> 0, i, f >>> 0);
		},
		__wbg_bufferSubData_3fcefd4648de39b5: function (a, c, i, f) {
			getObject(a).bufferSubData(c >>> 0, i, getObject(f));
		},
		__wbg_bufferSubData_7b112eb88657e7c0: function (a, c, i, f) {
			getObject(a).bufferSubData(c >>> 0, i, getObject(f));
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
			const i = getObject(a).catch(getObject(c));
			return addHeapObject(i);
		},
		__wbg_clearBuffer_0439daeb4579be77: function (a, c, i) {
			getObject(a).clearBuffer(getObject(c), i);
		},
		__wbg_clearBuffer_3de757fe2da3e161: function (a, c, i, f) {
			getObject(a).clearBuffer(getObject(c), i, f);
		},
		__wbg_clearBufferfv_7bc3e789059fd29b: function (a, c, i, f, _) {
			getObject(a).clearBufferfv(c >>> 0, i, getArrayF32FromWasm0(f, _));
		},
		__wbg_clearBufferiv_050b376a7480ef9c: function (a, c, i, f, _) {
			getObject(a).clearBufferiv(c >>> 0, i, getArrayI32FromWasm0(f, _));
		},
		__wbg_clearBufferuiv_d75635e80261ea93: function (a, c, i, f, _) {
			getObject(a).clearBufferuiv(c >>> 0, i, getArrayU32FromWasm0(f, _));
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
		__wbg_clientWaitSync_5402aac488fc18bb: function (a, c, i, f) {
			return getObject(a).clientWaitSync(getObject(c), i >>> 0, f >>> 0);
		},
		__wbg_close_87218c1c5fa30509: function () {
			return handleError(function (a) {
				const c = getObject(a).close();
				return addHeapObject(c);
			}, arguments);
		},
		__wbg_close_a86fff250f8aa14f: function () {
			return handleError(function (a, c, i, f) {
				getObject(a).close(c, getStringFromWasm0(i, f));
			}, arguments);
		},
		__wbg_close_ab55423854e61546: function (a) {
			getObject(a).close();
		},
		__wbg_code_3c69123dcbcf263d: function (a, c) {
			const i = getObject(c).code,
				f = passStringToWasm0(
					i,
					wasm.__wbindgen_export,
					wasm.__wbindgen_export2,
				),
				_ = WASM_VECTOR_LEN;
			getDataViewMemory0().setInt32(a + 4, _, true),
				getDataViewMemory0().setInt32(a + 0, f, true);
		},
		__wbg_code_aea376e2d265a64f: function (a) {
			return getObject(a).code;
		},
		__wbg_colorMask_b053114f7da42448: function (a, c, i, f, _) {
			getObject(a).colorMask(c !== 0, i !== 0, f !== 0, _ !== 0);
		},
		__wbg_colorMask_b47840e05b5f8181: function (a, c, i, f, _) {
			getObject(a).colorMask(c !== 0, i !== 0, f !== 0, _ !== 0);
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
			i,
			f,
			_,
			b,
			y,
			x,
			v,
		) {
			getObject(a).compressedTexSubImage2D(
				c >>> 0,
				i,
				f,
				_,
				b,
				y,
				x >>> 0,
				getObject(v),
			);
		},
		__wbg_compressedTexSubImage2D_aab12b65159c282e: function (
			a,
			c,
			i,
			f,
			_,
			b,
			y,
			x,
			v,
		) {
			getObject(a).compressedTexSubImage2D(
				c >>> 0,
				i,
				f,
				_,
				b,
				y,
				x >>> 0,
				getObject(v),
			);
		},
		__wbg_compressedTexSubImage2D_f3c4ae95ef9d2420: function (
			a,
			c,
			i,
			f,
			_,
			b,
			y,
			x,
			v,
			p,
		) {
			getObject(a).compressedTexSubImage2D(
				c >>> 0,
				i,
				f,
				_,
				b,
				y,
				x >>> 0,
				v,
				p,
			);
		},
		__wbg_compressedTexSubImage3D_77a6ab77487aa211: function (
			a,
			c,
			i,
			f,
			_,
			b,
			y,
			x,
			v,
			p,
			z,
			R,
		) {
			getObject(a).compressedTexSubImage3D(
				c >>> 0,
				i,
				f,
				_,
				b,
				y,
				x,
				v,
				p >>> 0,
				z,
				R,
			);
		},
		__wbg_compressedTexSubImage3D_95f64742aae944b8: function (
			a,
			c,
			i,
			f,
			_,
			b,
			y,
			x,
			v,
			p,
			z,
		) {
			getObject(a).compressedTexSubImage3D(
				c >>> 0,
				i,
				f,
				_,
				b,
				y,
				x,
				v,
				p >>> 0,
				getObject(z),
			);
		},
		__wbg_configure_b39d6ec9527208fd: function () {
			return handleError(function (a, c) {
				getObject(a).configure(getObject(c));
			}, arguments);
		},
		__wbg_connect_3ca85e8e3b8d9828: function () {
			return handleError(function (a, c) {
				const i = getObject(a).connect(getObject(c));
				return addHeapObject(i);
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
		__wbg_copyBufferSubData_aaeed526e555f0d1: function (a, c, i, f, _, b) {
			getObject(a).copyBufferSubData(c >>> 0, i >>> 0, f, _, b);
		},
		__wbg_copyBufferToBuffer_293ca0a0d09a2280: function () {
			return handleError(function (a, c, i, f, _) {
				getObject(a).copyBufferToBuffer(
					getObject(c),
					i,
					getObject(f),
					_,
				);
			}, arguments);
		},
		__wbg_copyBufferToBuffer_321eb0198eb9c268: function () {
			return handleError(function (a, c, i, f, _, b) {
				getObject(a).copyBufferToBuffer(
					getObject(c),
					i,
					getObject(f),
					_,
					b,
				);
			}, arguments);
		},
		__wbg_copyTexSubImage2D_08a10bcd45b88038: function (
			a,
			c,
			i,
			f,
			_,
			b,
			y,
			x,
			v,
		) {
			getObject(a).copyTexSubImage2D(c >>> 0, i, f, _, b, y, x, v);
		},
		__wbg_copyTexSubImage2D_b9a10d000c616b3e: function (
			a,
			c,
			i,
			f,
			_,
			b,
			y,
			x,
			v,
		) {
			getObject(a).copyTexSubImage2D(c >>> 0, i, f, _, b, y, x, v);
		},
		__wbg_copyTexSubImage3D_7fcdf7c85bc308a5: function (
			a,
			c,
			i,
			f,
			_,
			b,
			y,
			x,
			v,
			p,
		) {
			getObject(a).copyTexSubImage3D(c >>> 0, i, f, _, b, y, x, v, p);
		},
		__wbg_copyTextureToBuffer_f5501895b13306e1: function () {
			return handleError(function (a, c, i, f) {
				getObject(a).copyTextureToBuffer(
					getObject(c),
					getObject(i),
					getObject(f),
				);
			}, arguments);
		},
		__wbg_copyTextureToTexture_facf8ecdb9559cb0: function () {
			return handleError(function (a, c, i, f) {
				getObject(a).copyTextureToTexture(
					getObject(c),
					getObject(i),
					getObject(f),
				);
			}, arguments);
		},
		__wbg_copyToChannel_0fa00b3f5955d456: function () {
			return handleError(function (a, c, i, f) {
				getObject(a).copyToChannel(getArrayF32FromWasm0(c, i), f);
			}, arguments);
		},
		__wbg_createBindGroupLayout_f5bb5a31b2ac11bf: function () {
			return handleError(function (a, c) {
				const i = getObject(a).createBindGroupLayout(getObject(c));
				return addHeapObject(i);
			}, arguments);
		},
		__wbg_createBindGroup_2290306cfa413c74: function (a, c) {
			const i = getObject(a).createBindGroup(getObject(c));
			return addHeapObject(i);
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
				const i = getObject(a).createBuffer(getObject(c));
				return addHeapObject(i);
			}, arguments);
		},
		__wbg_createBuffer_ed2bd7b52878b3fa: function () {
			return handleError(function (a, c, i, f) {
				const _ = getObject(a).createBuffer(c >>> 0, i >>> 0, f);
				return addHeapObject(_);
			}, arguments);
		},
		__wbg_createCommandEncoder_80578730e7314357: function (a, c) {
			const i = getObject(a).createCommandEncoder(getObject(c));
			return addHeapObject(i);
		},
		__wbg_createComputePipeline_78a3fff4e7d451a8: function (a, c) {
			const i = getObject(a).createComputePipeline(getObject(c));
			return addHeapObject(i);
		},
		__wbg_createElement_9b0aab265c549ded: function () {
			return handleError(function (a, c, i) {
				const f = getObject(a).createElement(getStringFromWasm0(c, i));
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
			return handleError(function (a, c, i) {
				const f = getObject(a).createImageBitmap(
					getObject(c),
					getObject(i),
				);
				return addHeapObject(f);
			}, arguments);
		},
		__wbg_createObjectURL_f141426bcc1f70aa: function () {
			return handleError(function (a, c) {
				const i = URL.createObjectURL(getObject(c)),
					f = passStringToWasm0(
						i,
						wasm.__wbindgen_export,
						wasm.__wbindgen_export2,
					),
					_ = WASM_VECTOR_LEN;
				getDataViewMemory0().setInt32(a + 4, _, true),
					getDataViewMemory0().setInt32(a + 0, f, true);
			}, arguments);
		},
		__wbg_createPipelineLayout_0ef251301bed0c34: function (a, c) {
			const i = getObject(a).createPipelineLayout(getObject(c));
			return addHeapObject(i);
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
				const i = getObject(a).createQuerySet(getObject(c));
				return addHeapObject(i);
			}, arguments);
		},
		__wbg_createQuery_0f754c13ae341f39: function (a) {
			const c = getObject(a).createQuery();
			return isLikeNone(c) ? 0 : addHeapObject(c);
		},
		__wbg_createRenderPipeline_f9f8aa23f50f8a9c: function () {
			return handleError(function (a, c) {
				const i = getObject(a).createRenderPipeline(getObject(c));
				return addHeapObject(i);
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
			const i = getObject(a).createSampler(getObject(c));
			return addHeapObject(i);
		},
		__wbg_createSampler_7bed7d46769be9a7: function (a) {
			const c = getObject(a).createSampler();
			return isLikeNone(c) ? 0 : addHeapObject(c);
		},
		__wbg_createShaderModule_eb21a131dfb0d4dc: function (a, c) {
			const i = getObject(a).createShaderModule(getObject(c));
			return addHeapObject(i);
		},
		__wbg_createShader_9ffc9dc1832608d7: function (a, c) {
			const i = getObject(a).createShader(c >>> 0);
			return isLikeNone(i) ? 0 : addHeapObject(i);
		},
		__wbg_createShader_a00913b8c6489e6b: function (a, c) {
			const i = getObject(a).createShader(c >>> 0);
			return isLikeNone(i) ? 0 : addHeapObject(i);
		},
		__wbg_createTexture_284160f981e0075f: function () {
			return handleError(function (a, c) {
				const i = getObject(a).createTexture(getObject(c));
				return addHeapObject(i);
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
				const i = getObject(a).createView(getObject(c));
				return addHeapObject(i);
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
		__wbg_data_a3d9ff9cdd801002: function (a) {
			const c = getObject(a).data;
			return addHeapObject(c);
		},
		__wbg_debug_271c16e6de0bc226: function (a, c, i, f) {
			console.debug(
				getObject(a),
				getObject(c),
				getObject(i),
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
		__wbg_depthRange_b42d493a2b9258aa: function (a, c, i) {
			getObject(a).depthRange(c, i);
		},
		__wbg_depthRange_ebba8110d3fe0332: function (a, c, i) {
			getObject(a).depthRange(c, i);
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
		__wbg_dispatchWorkgroupsIndirect_31170e3ef9951e18: function (a, c, i) {
			getObject(a).dispatchWorkgroupsIndirect(getObject(c), i);
		},
		__wbg_dispatchWorkgroups_88dfc3f2209b9d74: function (a, c, i, f) {
			getObject(a).dispatchWorkgroups(c >>> 0, i >>> 0, f >>> 0);
		},
		__wbg_document_c0320cd4183c6d9b: function (a) {
			const c = getObject(a).document;
			return isLikeNone(c) ? 0 : addHeapObject(c);
		},
		__wbg_drawArraysInstancedANGLE_20ee4b8f67503b54: function (
			a,
			c,
			i,
			f,
			_,
		) {
			getObject(a).drawArraysInstancedANGLE(c >>> 0, i, f, _);
		},
		__wbg_drawArraysInstanced_13e40fca13079ade: function (a, c, i, f, _) {
			getObject(a).drawArraysInstanced(c >>> 0, i, f, _);
		},
		__wbg_drawArrays_13005ccff75e4210: function (a, c, i, f) {
			getObject(a).drawArrays(c >>> 0, i, f);
		},
		__wbg_drawArrays_c20dedf441392005: function (a, c, i, f) {
			getObject(a).drawArrays(c >>> 0, i, f);
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
			i,
			f,
			_,
			b,
		) {
			getObject(a).drawElementsInstancedANGLE(c >>> 0, i, f >>> 0, _, b);
		},
		__wbg_drawElementsInstanced_2e549060a77ba831: function (
			a,
			c,
			i,
			f,
			_,
			b,
		) {
			getObject(a).drawElementsInstanced(c >>> 0, i, f >>> 0, _, b);
		},
		__wbg_drawIndexedIndirect_1be586f18fe50ecf: function (a, c, i) {
			getObject(a).drawIndexedIndirect(getObject(c), i);
		},
		__wbg_drawIndexed_a60a41b2b0ffdadf: function (a, c, i, f, _, b) {
			getObject(a).drawIndexed(c >>> 0, i >>> 0, f >>> 0, _, b >>> 0);
		},
		__wbg_drawIndirect_74b596a2ff39cd46: function (a, c, i) {
			getObject(a).drawIndirect(getObject(c), i);
		},
		__wbg_draw_bcc050d6677121b5: function (a, c, i, f, _) {
			getObject(a).draw(c >>> 0, i >>> 0, f >>> 0, _ >>> 0);
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
		__wbg_error_1eece6b0039034ce: function (a, c, i, f) {
			console.error(
				getObject(a),
				getObject(c),
				getObject(i),
				getObject(f),
			);
		},
		__wbg_error_a6fa202b58aa1cd3: function (a, c) {
			let i, f;
			try {
				(i = a), (f = c), console.error(getStringFromWasm0(a, c));
			} finally {
				wasm.__wbindgen_export4(i, f, 1);
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
		__wbg_exec_203e2096c69172ee: function (a, c, i) {
			const f = getObject(a).exec(getStringFromWasm0(c, i));
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
		__wbg_fenceSync_460953d9ad5fd31a: function (a, c, i) {
			const f = getObject(a).fenceSync(c >>> 0, i >>> 0);
			return isLikeNone(f) ? 0 : addHeapObject(f);
		},
		__wbg_fetch_7b84bc2cce4c9b65: function (a, c, i) {
			const f = getObject(a).fetch(getStringFromWasm0(c, i));
			return addHeapObject(f);
		},
		__wbg_fetch_e261f234f8b50660: function (a, c, i) {
			const f = getObject(a).fetch(getStringFromWasm0(c, i));
			return addHeapObject(f);
		},
		__wbg_finish_073e2bc456a4b625: function (a) {
			const c = getObject(a).finish();
			return addHeapObject(c);
		},
		__wbg_finish_e43b1b48427f2db0: function (a, c) {
			const i = getObject(a).finish(getObject(c));
			return addHeapObject(i);
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
			i,
			f,
			_,
		) {
			getObject(a).framebufferRenderbuffer(
				c >>> 0,
				i >>> 0,
				f >>> 0,
				getObject(_),
			);
		},
		__wbg_framebufferRenderbuffer_d8c1d0b985bd3c51: function (
			a,
			c,
			i,
			f,
			_,
		) {
			getObject(a).framebufferRenderbuffer(
				c >>> 0,
				i >>> 0,
				f >>> 0,
				getObject(_),
			);
		},
		__wbg_framebufferTexture2D_bf4d47f4027a3682: function (
			a,
			c,
			i,
			f,
			_,
			b,
		) {
			getObject(a).framebufferTexture2D(
				c >>> 0,
				i >>> 0,
				f >>> 0,
				getObject(_),
				b,
			);
		},
		__wbg_framebufferTexture2D_e2f7d82e6707010e: function (
			a,
			c,
			i,
			f,
			_,
			b,
		) {
			getObject(a).framebufferTexture2D(
				c >>> 0,
				i >>> 0,
				f >>> 0,
				getObject(_),
				b,
			);
		},
		__wbg_framebufferTextureLayer_01d5b9516636ccae: function (
			a,
			c,
			i,
			f,
			_,
			b,
		) {
			getObject(a).framebufferTextureLayer(
				c >>> 0,
				i >>> 0,
				getObject(f),
				_,
				b,
			);
		},
		__wbg_framebufferTextureMultiviewOVR_336ea10e261ec5f6: function (
			a,
			c,
			i,
			f,
			_,
			b,
			y,
		) {
			getObject(a).framebufferTextureMultiviewOVR(
				c >>> 0,
				i >>> 0,
				getObject(f),
				_,
				b,
				y,
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
		__wbg_getBufferSubData_cbabbb87d4c5c57d: function (a, c, i, f) {
			getObject(a).getBufferSubData(c >>> 0, i, getObject(f));
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
				const i = getObject(a).getComputedStyle(getObject(c));
				return isLikeNone(i) ? 0 : addHeapObject(i);
			}, arguments);
		},
		__wbg_getContext_07270456453ee7f5: function () {
			return handleError(function (a, c, i, f) {
				const _ = getObject(a).getContext(
					getStringFromWasm0(c, i),
					getObject(f),
				);
				return isLikeNone(_) ? 0 : addHeapObject(_);
			}, arguments);
		},
		__wbg_getContext_794490fe04be926a: function () {
			return handleError(function (a, c, i, f) {
				const _ = getObject(a).getContext(
					getStringFromWasm0(c, i),
					getObject(f),
				);
				return isLikeNone(_) ? 0 : addHeapObject(_);
			}, arguments);
		},
		__wbg_getContext_a9236f98f1f7fe7c: function () {
			return handleError(function (a, c, i) {
				const f = getObject(a).getContext(getStringFromWasm0(c, i));
				return isLikeNone(f) ? 0 : addHeapObject(f);
			}, arguments);
		},
		__wbg_getContext_f04bf8f22dcb2d53: function () {
			return handleError(function (a, c, i) {
				const f = getObject(a).getContext(getStringFromWasm0(c, i));
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
			return handleError(function (a, c, i) {
				const f = getObject(a).getExtension(getStringFromWasm0(c, i));
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
			return handleError(function (a, c, i) {
				const f = getObject(a).getIndexedParameter(c >>> 0, i >>> 0);
				return addHeapObject(f);
			}, arguments);
		},
		__wbg_getMappedRange_191c0084744858f0: function () {
			return handleError(function (a, c, i) {
				const f = getObject(a).getMappedRange(c, i);
				return addHeapObject(f);
			}, arguments);
		},
		__wbg_getOwnPropertyDescriptor_afeb931addada534: function (a, c) {
			const i = Object.getOwnPropertyDescriptor(
				getObject(a),
				getObject(c),
			);
			return addHeapObject(i);
		},
		__wbg_getParameter_b1431cfde390c2fc: function () {
			return handleError(function (a, c) {
				const i = getObject(a).getParameter(c >>> 0);
				return addHeapObject(i);
			}, arguments);
		},
		__wbg_getParameter_e634fa73b5e25287: function () {
			return handleError(function (a, c) {
				const i = getObject(a).getParameter(c >>> 0);
				return addHeapObject(i);
			}, arguments);
		},
		__wbg_getPreferredCanvasFormat_56e30944cc798353: function (a) {
			const c = getObject(a).getPreferredCanvasFormat();
			return (__wbindgen_enum_GpuTextureFormat.indexOf(c) + 1 || 96) - 1;
		},
		__wbg_getProgramInfoLog_50443ddea7475f57: function (a, c, i) {
			const f = getObject(c).getProgramInfoLog(getObject(i));
			var _ = isLikeNone(f)
					? 0
					: passStringToWasm0(
							f,
							wasm.__wbindgen_export,
							wasm.__wbindgen_export2,
						),
				b = WASM_VECTOR_LEN;
			getDataViewMemory0().setInt32(a + 4, b, true),
				getDataViewMemory0().setInt32(a + 0, _, true);
		},
		__wbg_getProgramInfoLog_e03efa51473d657e: function (a, c, i) {
			const f = getObject(c).getProgramInfoLog(getObject(i));
			var _ = isLikeNone(f)
					? 0
					: passStringToWasm0(
							f,
							wasm.__wbindgen_export,
							wasm.__wbindgen_export2,
						),
				b = WASM_VECTOR_LEN;
			getDataViewMemory0().setInt32(a + 4, b, true),
				getDataViewMemory0().setInt32(a + 0, _, true);
		},
		__wbg_getProgramParameter_46e2d49878b56edd: function (a, c, i) {
			const f = getObject(a).getProgramParameter(getObject(c), i >>> 0);
			return addHeapObject(f);
		},
		__wbg_getProgramParameter_7d3bd54ec02de007: function (a, c, i) {
			const f = getObject(a).getProgramParameter(getObject(c), i >>> 0);
			return addHeapObject(f);
		},
		__wbg_getPropertyValue_d2181532557839cf: function () {
			return handleError(function (a, c, i, f) {
				const _ = getObject(c).getPropertyValue(
						getStringFromWasm0(i, f),
					),
					b = passStringToWasm0(
						_,
						wasm.__wbindgen_export,
						wasm.__wbindgen_export2,
					),
					y = WASM_VECTOR_LEN;
				getDataViewMemory0().setInt32(a + 4, y, true),
					getDataViewMemory0().setInt32(a + 0, b, true);
			}, arguments);
		},
		__wbg_getQueryParameter_5a3a2bd77e5f56bb: function (a, c, i) {
			const f = getObject(a).getQueryParameter(getObject(c), i >>> 0);
			return addHeapObject(f);
		},
		__wbg_getRandomValues_3f44b700395062e5: function () {
			return handleError(function (a, c) {
				globalThis.crypto.getRandomValues(getArrayU8FromWasm0(a, c));
			}, arguments);
		},
		__wbg_getRandomValues_a1cf2e70b003a59d: function () {
			return handleError(function (a, c) {
				globalThis.crypto.getRandomValues(getArrayU8FromWasm0(a, c));
			}, arguments);
		},
		__wbg_getShaderInfoLog_22f9e8c90a52f38d: function (a, c, i) {
			const f = getObject(c).getShaderInfoLog(getObject(i));
			var _ = isLikeNone(f)
					? 0
					: passStringToWasm0(
							f,
							wasm.__wbindgen_export,
							wasm.__wbindgen_export2,
						),
				b = WASM_VECTOR_LEN;
			getDataViewMemory0().setInt32(a + 4, b, true),
				getDataViewMemory0().setInt32(a + 0, _, true);
		},
		__wbg_getShaderInfoLog_40c6a4ae67d82dde: function (a, c, i) {
			const f = getObject(c).getShaderInfoLog(getObject(i));
			var _ = isLikeNone(f)
					? 0
					: passStringToWasm0(
							f,
							wasm.__wbindgen_export,
							wasm.__wbindgen_export2,
						),
				b = WASM_VECTOR_LEN;
			getDataViewMemory0().setInt32(a + 4, b, true),
				getDataViewMemory0().setInt32(a + 0, _, true);
		},
		__wbg_getShaderParameter_46f64f7ca5d534db: function (a, c, i) {
			const f = getObject(a).getShaderParameter(getObject(c), i >>> 0);
			return addHeapObject(f);
		},
		__wbg_getShaderParameter_82c275299b111f1b: function (a, c, i) {
			const f = getObject(a).getShaderParameter(getObject(c), i >>> 0);
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
		__wbg_getSyncParameter_fbf70c60f5e3b271: function (a, c, i) {
			const f = getObject(a).getSyncParameter(getObject(c), i >>> 0);
			return addHeapObject(f);
		},
		__wbg_getUniformBlockIndex_e483a4d166df9c2a: function (a, c, i, f) {
			return getObject(a).getUniformBlockIndex(
				getObject(c),
				getStringFromWasm0(i, f),
			);
		},
		__wbg_getUniformLocation_5eb08673afa04eee: function (a, c, i, f) {
			const _ = getObject(a).getUniformLocation(
				getObject(c),
				getStringFromWasm0(i, f),
			);
			return isLikeNone(_) ? 0 : addHeapObject(_);
		},
		__wbg_getUniformLocation_90cdff44c2fceeb9: function (a, c, i, f) {
			const _ = getObject(a).getUniformLocation(
				getObject(c),
				getStringFromWasm0(i, f),
			);
			return isLikeNone(_) ? 0 : addHeapObject(_);
		},
		__wbg_get_3ef1eba1850ade27: function () {
			return handleError(function (a, c) {
				const i = Reflect.get(getObject(a), getObject(c));
				return addHeapObject(i);
			}, arguments);
		},
		__wbg_get_a8ee5c45dabc1b3b: function (a, c) {
			const i = getObject(a)[c >>> 0];
			return addHeapObject(i);
		},
		__wbg_get_c7546417fb0bec10: function (a, c) {
			const i = getObject(a)[c >>> 0];
			return isLikeNone(i) ? 0 : addHeapObject(i);
		},
		__wbg_get_unchecked_329cfe50afab7352: function (a, c) {
			const i = getObject(a)[c >>> 0];
			return addHeapObject(i);
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
		__wbg_has_abf74d2b4f3e578e: function (a, c, i) {
			return getObject(a).has(getStringFromWasm0(c, i));
		},
		__wbg_height_8c06cb597de53887: function (a) {
			return getObject(a).height;
		},
		__wbg_hidden_19530f76732ba428: function (a) {
			return getObject(a).hidden;
		},
		__wbg_id_26bc2771d7af1b86: function (a, c) {
			const i = getObject(c).id,
				f = passStringToWasm0(
					i,
					wasm.__wbindgen_export,
					wasm.__wbindgen_export2,
				),
				_ = WASM_VECTOR_LEN;
			getDataViewMemory0().setInt32(a + 4, _, true),
				getDataViewMemory0().setInt32(a + 0, f, true);
		},
		__wbg_includes_9f81335525be01f9: function (a, c, i) {
			return getObject(a).includes(getObject(c), i);
		},
		__wbg_index_4cc30c8b16093fd3: function (a) {
			return getObject(a).index;
		},
		__wbg_info_0194681687b5ab04: function (a, c, i, f) {
			console.info(
				getObject(a),
				getObject(c),
				getObject(i),
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
		__wbg_instanceof_Performance_fc16db7b6f107638: function (a) {
			let c;
			try {
				c = getObject(a) instanceof Performance;
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
			return handleError(function (a, c, i) {
				getObject(a).invalidateFramebuffer(c >>> 0, getObject(i));
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
			const i = getObject(c).key,
				f = passStringToWasm0(
					i,
					wasm.__wbindgen_export,
					wasm.__wbindgen_export2,
				),
				_ = WASM_VECTOR_LEN;
			getDataViewMemory0().setInt32(a + 4, _, true),
				getDataViewMemory0().setInt32(a + 0, f, true);
		},
		__wbg_label_0abc44bf8d3a3e99: function (a, c) {
			const i = getObject(c).label,
				f = passStringToWasm0(
					i,
					wasm.__wbindgen_export,
					wasm.__wbindgen_export2,
				),
				_ = WASM_VECTOR_LEN;
			getDataViewMemory0().setInt32(a + 4, _, true),
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
		__wbg_log_0c201ade58bb55e1: function (a, c, i, f, _, b, y, x) {
			let v, p;
			try {
				(v = a),
					(p = c),
					console.log(
						getStringFromWasm0(a, c),
						getStringFromWasm0(i, f),
						getStringFromWasm0(_, b),
						getStringFromWasm0(y, x),
					);
			} finally {
				wasm.__wbindgen_export4(v, p, 1);
			}
		},
		__wbg_log_70972330cfc941dd: function (a, c, i, f) {
			console.log(getObject(a), getObject(c), getObject(i), getObject(f));
		},
		__wbg_log_ce2c4456b290c5e7: function (a, c) {
			let i, f;
			try {
				(i = a), (f = c), console.log(getStringFromWasm0(a, c));
			} finally {
				wasm.__wbindgen_export4(i, f, 1);
			}
		},
		__wbg_mapAsync_1be2f9e8f464f69e: function (a, c, i, f) {
			const _ = getObject(a).mapAsync(c >>> 0, i, f);
			return addHeapObject(_);
		},
		__wbg_mapping_c0470f8cd55cefc3: function (a) {
			const c = getObject(a).mapping;
			return (__wbindgen_enum_GamepadMappingType.indexOf(c) + 1 || 3) - 1;
		},
		__wbg_mark_b4d943f3bc2d2404: function (a, c) {
			performance.mark(getStringFromWasm0(a, c));
		},
		__wbg_matchMedia_b27489ec503ba2a5: function () {
			return handleError(function (a, c, i) {
				const f = getObject(a).matchMedia(getStringFromWasm0(c, i));
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
			return handleError(function (a, c, i, f) {
				let _, b, y, x;
				try {
					(_ = a),
						(b = c),
						(y = i),
						(x = f),
						performance.measure(
							getStringFromWasm0(a, c),
							getStringFromWasm0(i, f),
						);
				} finally {
					wasm.__wbindgen_export4(_, b, 1),
						wasm.__wbindgen_export4(y, x, 1);
				}
			}, arguments);
		},
		__wbg_media_91e147d0112e864c: function (a, c) {
			const i = getObject(c).media,
				f = passStringToWasm0(
					i,
					wasm.__wbindgen_export,
					wasm.__wbindgen_export2,
				),
				_ = WASM_VECTOR_LEN;
			getDataViewMemory0().setInt32(a + 4, _, true),
				getDataViewMemory0().setInt32(a + 0, f, true);
		},
		__wbg_message_206e22ac85ff4937: function (a, c) {
			const i = getObject(c).message,
				f = passStringToWasm0(
					i,
					wasm.__wbindgen_export,
					wasm.__wbindgen_export2,
				),
				_ = WASM_VECTOR_LEN;
			getDataViewMemory0().setInt32(a + 4, _, true),
				getDataViewMemory0().setInt32(a + 0, f, true);
		},
		__wbg_message_e959edc81e4b6cb7: function (a, c) {
			const i = getObject(c).message,
				f = passStringToWasm0(
					i,
					wasm.__wbindgen_export,
					wasm.__wbindgen_export2,
				),
				_ = WASM_VECTOR_LEN;
			getDataViewMemory0().setInt32(a + 4, _, true),
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
				const i = new Worker(getStringFromWasm0(a, c));
				return addHeapObject(i);
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
		__wbg_new_aad8cb4adc774d03: function (a, c, i, f) {
			const _ = new RegExp(
				getStringFromWasm0(a, c),
				getStringFromWasm0(i, f),
			);
			return addHeapObject(_);
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
		__wbg_new_dd50bcc3f60ba434: function () {
			return handleError(function (a, c) {
				const i = new WebSocket(getStringFromWasm0(a, c));
				return addHeapObject(i);
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
			const i = new Uint8Array(getArrayU8FromWasm0(a, c));
			return addHeapObject(i);
		},
		__wbg_new_typed_bccac67128ed885a: function () {
			const a = new Array();
			return addHeapObject(a);
		},
		__wbg_new_with_byte_offset_and_length_b2ec5bf7b2f35743: function (
			a,
			c,
			i,
		) {
			const f = new Uint8Array(getObject(a), c >>> 0, i >>> 0);
			return addHeapObject(f);
		},
		__wbg_new_with_context_options_c1249ea1a7ddc84f: function () {
			return handleError(function (a) {
				const c = new lAudioContext(getObject(a));
				return addHeapObject(c);
			}, arguments);
		},
		__wbg_new_with_str_sequence_81cd713f8ef645ea: function () {
			return handleError(function (a) {
				const c = new Blob(getObject(a));
				return addHeapObject(c);
			}, arguments);
		},
		__wbg_new_with_str_sequence_and_options_a037535f6e1edba0: function () {
			return handleError(function (a, c) {
				const i = new Blob(getObject(a), getObject(c));
				return addHeapObject(i);
			}, arguments);
		},
		__wbg_new_with_u8_clamped_array_f0ba3283326efdd8: function () {
			return handleError(function (a, c, i) {
				const f = new ImageData(
					getClampedArrayU8FromWasm0(a, c),
					i >>> 0,
				);
				return addHeapObject(f);
			}, arguments);
		},
		__wbg_now_16f0c993d5dd6c27: function () {
			return Date.now();
		},
		__wbg_now_c6d7a7d35f74f6f1: function (a) {
			return getObject(a).now();
		},
		__wbg_now_e7c6795a7f81e10f: function (a) {
			return getObject(a).now();
		},
		__wbg_observe_571954223f11dad1: function (a, c, i) {
			getObject(a).observe(getObject(c), getObject(i));
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
			const i = Array.of(getObject(a), getObject(c));
			return addHeapObject(i);
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
		__wbg_pixelStorei_2a2385ed59538d48: function (a, c, i) {
			getObject(a).pixelStorei(c >>> 0, i);
		},
		__wbg_pixelStorei_2a3c5b85cf37caba: function (a, c, i) {
			getObject(a).pixelStorei(c >>> 0, i);
		},
		__wbg_play_3997a1be51d27925: function (a) {
			getObject(a).play();
		},
		__wbg_pointerId_85ff21be7b52f43e: function (a) {
			return getObject(a).pointerId;
		},
		__wbg_pointerType_02525bef1df5f79c: function (a, c) {
			const i = getObject(c).pointerType,
				f = passStringToWasm0(
					i,
					wasm.__wbindgen_export,
					wasm.__wbindgen_export2,
				),
				_ = WASM_VECTOR_LEN;
			getDataViewMemory0().setInt32(a + 4, _, true),
				getDataViewMemory0().setInt32(a + 0, f, true);
		},
		__wbg_polygonOffset_17cb85e417bf9db7: function (a, c, i) {
			getObject(a).polygonOffset(c, i);
		},
		__wbg_polygonOffset_cc6bec2f9f4a18f7: function (a, c, i) {
			getObject(a).polygonOffset(c, i);
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
			return handleError(function (a, c, i) {
				getObject(a).postMessage(getObject(c), getObject(i));
			}, arguments);
		},
		__wbg_postMessage_c89a8b5edbf59ad0: function () {
			return handleError(function (a, c) {
				getObject(a).postMessage(getObject(c));
			}, arguments);
		},
		__wbg_postTask_e2439afddcdfbb55: function (a, c, i) {
			const f = getObject(a).postTask(getObject(c), getObject(i));
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
		__wbg_prototypesetcall_d62e5099504357e6: function (a, c, i) {
			Uint8Array.prototype.set.call(
				getArrayU8FromWasm0(a, c),
				getObject(i),
			);
		},
		__wbg_pushErrorScope_9c7f2c66d0393f31: function (a, c) {
			getObject(a).pushErrorScope(__wbindgen_enum_GpuErrorFilter[c]);
		},
		__wbg_push_e87b0e732085a946: function (a, c) {
			return getObject(a).push(getObject(c));
		},
		__wbg_queryCounterEXT_12ca9f560a5855cb: function (a, c, i) {
			getObject(a).queryCounterEXT(getObject(c), i >>> 0);
		},
		__wbg_querySelectorAll_ccbf0696a1c6fed8: function () {
			return handleError(function (a, c, i) {
				const f = getObject(a).querySelectorAll(
					getStringFromWasm0(c, i),
				);
				return addHeapObject(f);
			}, arguments);
		},
		__wbg_querySelector_46ff1b81410aebea: function () {
			return handleError(function (a, c, i) {
				const f = getObject(a).querySelector(getStringFromWasm0(c, i));
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
			return handleError(function (a, c, i, f, _, b, y, x) {
				getObject(a).readPixels(
					c,
					i,
					f,
					_,
					b >>> 0,
					y >>> 0,
					getObject(x),
				);
			}, arguments);
		},
		__wbg_readPixels_5c7066b5bd547f81: function () {
			return handleError(function (a, c, i, f, _, b, y, x) {
				getObject(a).readPixels(
					c,
					i,
					f,
					_,
					b >>> 0,
					y >>> 0,
					getObject(x),
				);
			}, arguments);
		},
		__wbg_readPixels_f675ed52bd44f8f1: function () {
			return handleError(function (a, c, i, f, _, b, y, x) {
				getObject(a).readPixels(c, i, f, _, b >>> 0, y >>> 0, x);
			}, arguments);
		},
		__wbg_reason_cbcb9911796c4714: function (a, c) {
			const i = getObject(c).reason,
				f = passStringToWasm0(
					i,
					wasm.__wbindgen_export,
					wasm.__wbindgen_export2,
				),
				_ = WASM_VECTOR_LEN;
			getDataViewMemory0().setInt32(a + 4, _, true),
				getDataViewMemory0().setInt32(a + 0, f, true);
		},
		__wbg_removeEventListener_d27694700fc0df8b: function () {
			return handleError(function (a, c, i, f) {
				getObject(a).removeEventListener(
					getStringFromWasm0(c, i),
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
			return handleError(function (a, c, i, f) {
				const _ = getObject(c).removeProperty(getStringFromWasm0(i, f)),
					b = passStringToWasm0(
						_,
						wasm.__wbindgen_export,
						wasm.__wbindgen_export2,
					),
					y = WASM_VECTOR_LEN;
				getDataViewMemory0().setInt32(a + 4, y, true),
					getDataViewMemory0().setInt32(a + 0, b, true);
			}, arguments);
		},
		__wbg_renderbufferStorageMultisample_d999a80fbc25df5f: function (
			a,
			c,
			i,
			f,
			_,
			b,
		) {
			getObject(a).renderbufferStorageMultisample(
				c >>> 0,
				i,
				f >>> 0,
				_,
				b,
			);
		},
		__wbg_renderbufferStorage_9130171a6ae371dc: function (a, c, i, f, _) {
			getObject(a).renderbufferStorage(c >>> 0, i >>> 0, f, _);
		},
		__wbg_renderbufferStorage_b184ea29064b4e02: function (a, c, i, f, _) {
			getObject(a).renderbufferStorage(c >>> 0, i >>> 0, f, _);
		},
		__wbg_repeat_44d6eeebd275606f: function (a) {
			return getObject(a).repeat;
		},
		__wbg_requestAdapter_8efca1b953fd13aa: function (a, c) {
			const i = getObject(a).requestAdapter(getObject(c));
			return addHeapObject(i);
		},
		__wbg_requestAnimationFrame_206c97f410e7a383: function () {
			return handleError(function (a, c) {
				return getObject(a).requestAnimationFrame(getObject(c));
			}, arguments);
		},
		__wbg_requestDevice_290c73161fe959d5: function (a, c) {
			const i = getObject(a).requestDevice(getObject(c));
			return addHeapObject(i);
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
		__wbg_resolveQuerySet_ee2438e6a23d55f6: function (a, c, i, f, _, b) {
			getObject(a).resolveQuerySet(
				getObject(c),
				i >>> 0,
				f >>> 0,
				getObject(_),
				b >>> 0,
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
		__wbg_samplerParameterf_774cff2229cc9fc3: function (a, c, i, f) {
			getObject(a).samplerParameterf(getObject(c), i >>> 0, f);
		},
		__wbg_samplerParameteri_7dde222b01588620: function (a, c, i, f) {
			getObject(a).samplerParameteri(getObject(c), i >>> 0, f);
		},
		__wbg_scheduler_a17d41c9c822fc26: function (a) {
			const c = getObject(a).scheduler;
			return addHeapObject(c);
		},
		__wbg_scheduler_b35fe73ba70e89cc: function (a) {
			const c = getObject(a).scheduler;
			return addHeapObject(c);
		},
		__wbg_scissor_b18f09381b341db5: function (a, c, i, f, _) {
			getObject(a).scissor(c, i, f, _);
		},
		__wbg_scissor_db3842546fb31842: function (a, c, i, f, _) {
			getObject(a).scissor(c, i, f, _);
		},
		__wbg_send_d31a693c975dea74: function () {
			return handleError(function (a, c, i) {
				getObject(a).send(getArrayU8FromWasm0(c, i));
			}, arguments);
		},
		__wbg_setAttribute_f20d3b966749ab64: function () {
			return handleError(function (a, c, i, f, _) {
				getObject(a).setAttribute(
					getStringFromWasm0(c, i),
					getStringFromWasm0(f, _),
				);
			}, arguments);
		},
		__wbg_setBindGroup_1c8c11d4dd6528cf: function (a, c, i) {
			getObject(a).setBindGroup(c >>> 0, getObject(i));
		},
		__wbg_setBindGroup_29f4a44dff76f1a4: function (a, c, i) {
			getObject(a).setBindGroup(c >>> 0, getObject(i));
		},
		__wbg_setBindGroup_35a4830ac2c27742: function () {
			return handleError(function (a, c, i, f, _, b, y) {
				getObject(a).setBindGroup(
					c >>> 0,
					getObject(i),
					getArrayU32FromWasm0(f, _),
					b,
					y >>> 0,
				);
			}, arguments);
		},
		__wbg_setBindGroup_abde98bc542a4ae2: function () {
			return handleError(function (a, c, i, f, _, b, y) {
				getObject(a).setBindGroup(
					c >>> 0,
					getObject(i),
					getArrayU32FromWasm0(f, _),
					b,
					y >>> 0,
				);
			}, arguments);
		},
		__wbg_setBlendConstant_b9a2e1bc2a6182a3: function () {
			return handleError(function (a, c) {
				getObject(a).setBlendConstant(getObject(c));
			}, arguments);
		},
		__wbg_setIndexBuffer_924197dc97dbb679: function (a, c, i, f, _) {
			getObject(a).setIndexBuffer(
				getObject(c),
				__wbindgen_enum_GpuIndexFormat[i],
				f,
				_,
			);
		},
		__wbg_setIndexBuffer_a400322dea5437f7: function (a, c, i, f) {
			getObject(a).setIndexBuffer(
				getObject(c),
				__wbindgen_enum_GpuIndexFormat[i],
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
			return handleError(function (a, c, i, f, _) {
				getObject(a).setProperty(
					getStringFromWasm0(c, i),
					getStringFromWasm0(f, _),
				);
			}, arguments);
		},
		__wbg_setScissorRect_eeb4f61d4b860d7a: function (a, c, i, f, _) {
			getObject(a).setScissorRect(c >>> 0, i >>> 0, f >>> 0, _ >>> 0);
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
			return handleError(function (a, c, i) {
				return getObject(a).setTimeout(getObject(c), i);
			}, arguments);
		},
		__wbg_setVertexBuffer_58f30a4873b36907: function (a, c, i, f) {
			getObject(a).setVertexBuffer(c >>> 0, getObject(i), f);
		},
		__wbg_setVertexBuffer_7aa508f017477005: function (a, c, i, f, _) {
			getObject(a).setVertexBuffer(c >>> 0, getObject(i), f, _);
		},
		__wbg_setViewport_014b4c4d1101ba6b: function (a, c, i, f, _, b, y) {
			getObject(a).setViewport(c, i, f, _, b, y);
		},
		__wbg_set_7eaa4f96924fd6b3: function () {
			return handleError(function (a, c, i) {
				return Reflect.set(getObject(a), getObject(c), getObject(i));
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
		__wbg_set_binaryType_3dcf8281ec100a8f: function (a, c) {
			getObject(a).binaryType = __wbindgen_enum_BinaryType[c];
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
		__wbg_set_code_27a25a855d3fbc6d: function (a, c, i) {
			getObject(a).code = getStringFromWasm0(c, i);
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
		__wbg_set_cursor_8d686ff9dd99a325: function (a, c, i) {
			getObject(a).cursor = getStringFromWasm0(c, i);
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
		__wbg_set_e80615d7a9a43981: function (a, c, i) {
			getObject(a).set(getObject(c), i >>> 0);
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
		__wbg_set_entry_point_7248ed25fb9070c7: function (a, c, i) {
			getObject(a).entryPoint = getStringFromWasm0(c, i);
		},
		__wbg_set_entry_point_b01eb3970a1dcb95: function (a, c, i) {
			getObject(a).entryPoint = getStringFromWasm0(c, i);
		},
		__wbg_set_entry_point_c8f041069c527ff6: function (a, c, i) {
			getObject(a).entryPoint = getStringFromWasm0(c, i);
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
		__wbg_set_label_10bd19b972ff1ba6: function (a, c, i) {
			getObject(a).label = getStringFromWasm0(c, i);
		},
		__wbg_set_label_16cff4ff3c381368: function (a, c, i) {
			getObject(a).label = getStringFromWasm0(c, i);
		},
		__wbg_set_label_343ceab4761679d7: function (a, c, i) {
			getObject(a).label = getStringFromWasm0(c, i);
		},
		__wbg_set_label_403725ced930414e: function (a, c, i) {
			getObject(a).label = getStringFromWasm0(c, i);
		},
		__wbg_set_label_62b82f9361718fb9: function (a, c, i) {
			getObject(a).label = getStringFromWasm0(c, i);
		},
		__wbg_set_label_6afa181067c4da56: function (a, c, i) {
			getObject(a).label = getStringFromWasm0(c, i);
		},
		__wbg_set_label_7d448e8a777d0d37: function (a, c, i) {
			getObject(a).label = getStringFromWasm0(c, i);
		},
		__wbg_set_label_900e563567315063: function (a, c, i) {
			getObject(a).label = getStringFromWasm0(c, i);
		},
		__wbg_set_label_98bef61fcbcecdde: function (a, c, i) {
			getObject(a).label = getStringFromWasm0(c, i);
		},
		__wbg_set_label_9d2ce197e447a967: function (a, c, i) {
			getObject(a).label = getStringFromWasm0(c, i);
		},
		__wbg_set_label_a19e77f79a88d021: function (a, c, i) {
			getObject(a).label = getStringFromWasm0(c, i);
		},
		__wbg_set_label_b5d7ff5f8e4fbaac: function (a, c, i) {
			getObject(a).label = getStringFromWasm0(c, i);
		},
		__wbg_set_label_ba288fbac1259847: function (a, c, i) {
			getObject(a).label = getStringFromWasm0(c, i);
		},
		__wbg_set_label_e135ef1842fb45f8: function (a, c, i) {
			getObject(a).label = getStringFromWasm0(c, i);
		},
		__wbg_set_label_e1bd2437f39d21f3: function (a, c, i) {
			getObject(a).label = getStringFromWasm0(c, i);
		},
		__wbg_set_label_e4debe6dc9ea319b: function (a, c, i) {
			getObject(a).label = getStringFromWasm0(c, i);
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
		__wbg_set_onclose_8da801226bdd7a7b: function (a, c) {
			getObject(a).onclose = getObject(c);
		},
		__wbg_set_onended_c6277da5931bd62f: function (a, c) {
			getObject(a).onended = getObject(c);
		},
		__wbg_set_onerror_901ca711f94a5bbb: function (a, c) {
			getObject(a).onerror = getObject(c);
		},
		__wbg_set_onmessage_6f80ab771bf151aa: function (a, c) {
			getObject(a).onmessage = getObject(c);
		},
		__wbg_set_onmessage_d5dc11c291025af6: function (a, c) {
			getObject(a).onmessage = getObject(c);
		},
		__wbg_set_onmessage_f939f8b6d08ca76b: function (a, c) {
			getObject(a).onmessage = getObject(c);
		},
		__wbg_set_onopen_34e3e24cf9337ddd: function (a, c) {
			getObject(a).onopen = getObject(c);
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
		__wbg_set_src_f257a96103ac1ac6: function (a, c, i) {
			getObject(a).src = getStringFromWasm0(c, i);
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
		__wbg_set_type_33e79f1b45a78c37: function (a, c, i) {
			getObject(a).type = getStringFromWasm0(c, i);
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
		__wbg_shaderSource_06639e7b476e6ac2: function (a, c, i, f) {
			getObject(a).shaderSource(getObject(c), getStringFromWasm0(i, f));
		},
		__wbg_shaderSource_2bca0edc97475e95: function (a, c, i, f) {
			getObject(a).shaderSource(getObject(c), getStringFromWasm0(i, f));
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
			const i = getObject(c).stack,
				f = passStringToWasm0(
					i,
					wasm.__wbindgen_export,
					wasm.__wbindgen_export2,
				),
				_ = WASM_VECTOR_LEN;
			getDataViewMemory0().setInt32(a + 4, _, true),
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
		__wbg_stencilFuncSeparate_18642df0574c1930: function (a, c, i, f, _) {
			getObject(a).stencilFuncSeparate(c >>> 0, i >>> 0, f, _ >>> 0);
		},
		__wbg_stencilFuncSeparate_94ee4fbc164addec: function (a, c, i, f, _) {
			getObject(a).stencilFuncSeparate(c >>> 0, i >>> 0, f, _ >>> 0);
		},
		__wbg_stencilMaskSeparate_13b0475860a9b559: function (a, c, i) {
			getObject(a).stencilMaskSeparate(c >>> 0, i >>> 0);
		},
		__wbg_stencilMaskSeparate_a7bd409376ee05ff: function (a, c, i) {
			getObject(a).stencilMaskSeparate(c >>> 0, i >>> 0);
		},
		__wbg_stencilMask_326a11d0928c3808: function (a, c) {
			getObject(a).stencilMask(c >>> 0);
		},
		__wbg_stencilMask_6354f8ba392f6581: function (a, c) {
			getObject(a).stencilMask(c >>> 0);
		},
		__wbg_stencilOpSeparate_7e819381705b9731: function (a, c, i, f, _) {
			getObject(a).stencilOpSeparate(c >>> 0, i >>> 0, f >>> 0, _ >>> 0);
		},
		__wbg_stencilOpSeparate_8627d0f5f7fe5800: function (a, c, i, f, _) {
			getObject(a).stencilOpSeparate(c >>> 0, i >>> 0, f >>> 0, _ >>> 0);
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
		__wbg_terminate_8d65e3d9758359c7: function (a) {
			getObject(a).terminate();
		},
		__wbg_texImage2D_32ed4220040ca614: function () {
			return handleError(function (a, c, i, f, _, b, y, x, v, p) {
				getObject(a).texImage2D(
					c >>> 0,
					i,
					f,
					_,
					b,
					y,
					x >>> 0,
					v >>> 0,
					getObject(p),
				);
			}, arguments);
		},
		__wbg_texImage2D_d8c284c813952313: function () {
			return handleError(function (a, c, i, f, _, b, y, x, v, p) {
				getObject(a).texImage2D(
					c >>> 0,
					i,
					f,
					_,
					b,
					y,
					x >>> 0,
					v >>> 0,
					p,
				);
			}, arguments);
		},
		__wbg_texImage2D_f4ae6c314a9a4bbe: function () {
			return handleError(function (a, c, i, f, _, b, y, x, v, p) {
				getObject(a).texImage2D(
					c >>> 0,
					i,
					f,
					_,
					b,
					y,
					x >>> 0,
					v >>> 0,
					getObject(p),
				);
			}, arguments);
		},
		__wbg_texImage3D_88ff1fa41be127b9: function () {
			return handleError(function (a, c, i, f, _, b, y, x, v, p, z) {
				getObject(a).texImage3D(
					c >>> 0,
					i,
					f,
					_,
					b,
					y,
					x,
					v >>> 0,
					p >>> 0,
					getObject(z),
				);
			}, arguments);
		},
		__wbg_texImage3D_9a207e0459a4f276: function () {
			return handleError(function (a, c, i, f, _, b, y, x, v, p, z) {
				getObject(a).texImage3D(
					c >>> 0,
					i,
					f,
					_,
					b,
					y,
					x,
					v >>> 0,
					p >>> 0,
					z,
				);
			}, arguments);
		},
		__wbg_texParameteri_f4b1596185f5432d: function (a, c, i, f) {
			getObject(a).texParameteri(c >>> 0, i >>> 0, f);
		},
		__wbg_texParameteri_fcdec30159061963: function (a, c, i, f) {
			getObject(a).texParameteri(c >>> 0, i >>> 0, f);
		},
		__wbg_texStorage2D_a84f74d36d279097: function (a, c, i, f, _, b) {
			getObject(a).texStorage2D(c >>> 0, i, f >>> 0, _, b);
		},
		__wbg_texStorage3D_aec6fc3e85ec72da: function (a, c, i, f, _, b, y) {
			getObject(a).texStorage3D(c >>> 0, i, f >>> 0, _, b, y);
		},
		__wbg_texSubImage2D_1e7d6febf82b9bed: function () {
			return handleError(function (a, c, i, f, _, b, y, x, v, p) {
				getObject(a).texSubImage2D(
					c >>> 0,
					i,
					f,
					_,
					b,
					y,
					x >>> 0,
					v >>> 0,
					getObject(p),
				);
			}, arguments);
		},
		__wbg_texSubImage2D_271ffedb47424d0d: function () {
			return handleError(function (a, c, i, f, _, b, y, x, v, p) {
				getObject(a).texSubImage2D(
					c >>> 0,
					i,
					f,
					_,
					b,
					y,
					x >>> 0,
					v >>> 0,
					getObject(p),
				);
			}, arguments);
		},
		__wbg_texSubImage2D_3bb41b987f2bfe39: function () {
			return handleError(function (a, c, i, f, _, b, y, x, v, p) {
				getObject(a).texSubImage2D(
					c >>> 0,
					i,
					f,
					_,
					b,
					y,
					x >>> 0,
					v >>> 0,
					getObject(p),
				);
			}, arguments);
		},
		__wbg_texSubImage2D_68e0413824eddc12: function () {
			return handleError(function (a, c, i, f, _, b, y, x, v, p) {
				getObject(a).texSubImage2D(
					c >>> 0,
					i,
					f,
					_,
					b,
					y,
					x >>> 0,
					v >>> 0,
					getObject(p),
				);
			}, arguments);
		},
		__wbg_texSubImage2D_b6cdbbe62097211a: function () {
			return handleError(function (a, c, i, f, _, b, y, x, v, p) {
				getObject(a).texSubImage2D(
					c >>> 0,
					i,
					f,
					_,
					b,
					y,
					x >>> 0,
					v >>> 0,
					getObject(p),
				);
			}, arguments);
		},
		__wbg_texSubImage2D_c8919d8f32f723da: function () {
			return handleError(function (a, c, i, f, _, b, y, x, v, p) {
				getObject(a).texSubImage2D(
					c >>> 0,
					i,
					f,
					_,
					b,
					y,
					x >>> 0,
					v >>> 0,
					getObject(p),
				);
			}, arguments);
		},
		__wbg_texSubImage2D_d784df0b813dc1ab: function () {
			return handleError(function (a, c, i, f, _, b, y, x, v, p) {
				getObject(a).texSubImage2D(
					c >>> 0,
					i,
					f,
					_,
					b,
					y,
					x >>> 0,
					v >>> 0,
					p,
				);
			}, arguments);
		},
		__wbg_texSubImage2D_dd1d50234b61de4b: function () {
			return handleError(function (a, c, i, f, _, b, y, x, v, p) {
				getObject(a).texSubImage2D(
					c >>> 0,
					i,
					f,
					_,
					b,
					y,
					x >>> 0,
					v >>> 0,
					getObject(p),
				);
			}, arguments);
		},
		__wbg_texSubImage3D_09cc863aedf44a21: function () {
			return handleError(function (a, c, i, f, _, b, y, x, v, p, z, R) {
				getObject(a).texSubImage3D(
					c >>> 0,
					i,
					f,
					_,
					b,
					y,
					x,
					v,
					p >>> 0,
					z >>> 0,
					getObject(R),
				);
			}, arguments);
		},
		__wbg_texSubImage3D_4665e67a8f0f7806: function () {
			return handleError(function (a, c, i, f, _, b, y, x, v, p, z, R) {
				getObject(a).texSubImage3D(
					c >>> 0,
					i,
					f,
					_,
					b,
					y,
					x,
					v,
					p >>> 0,
					z >>> 0,
					getObject(R),
				);
			}, arguments);
		},
		__wbg_texSubImage3D_61ed187f3ec11ecc: function () {
			return handleError(function (a, c, i, f, _, b, y, x, v, p, z, R) {
				getObject(a).texSubImage3D(
					c >>> 0,
					i,
					f,
					_,
					b,
					y,
					x,
					v,
					p >>> 0,
					z >>> 0,
					getObject(R),
				);
			}, arguments);
		},
		__wbg_texSubImage3D_6a46981af8bc8e49: function () {
			return handleError(function (a, c, i, f, _, b, y, x, v, p, z, R) {
				getObject(a).texSubImage3D(
					c >>> 0,
					i,
					f,
					_,
					b,
					y,
					x,
					v,
					p >>> 0,
					z >>> 0,
					getObject(R),
				);
			}, arguments);
		},
		__wbg_texSubImage3D_9eca35d234d51b8a: function () {
			return handleError(function (a, c, i, f, _, b, y, x, v, p, z, R) {
				getObject(a).texSubImage3D(
					c >>> 0,
					i,
					f,
					_,
					b,
					y,
					x,
					v,
					p >>> 0,
					z >>> 0,
					getObject(R),
				);
			}, arguments);
		},
		__wbg_texSubImage3D_b3cbbb79fe54da6d: function () {
			return handleError(function (a, c, i, f, _, b, y, x, v, p, z, R) {
				getObject(a).texSubImage3D(
					c >>> 0,
					i,
					f,
					_,
					b,
					y,
					x,
					v,
					p >>> 0,
					z >>> 0,
					R,
				);
			}, arguments);
		},
		__wbg_texSubImage3D_f9c3af789162846a: function () {
			return handleError(function (a, c, i, f, _, b, y, x, v, p, z, R) {
				getObject(a).texSubImage3D(
					c >>> 0,
					i,
					f,
					_,
					b,
					y,
					x,
					v,
					p >>> 0,
					z >>> 0,
					getObject(R),
				);
			}, arguments);
		},
		__wbg_then_098abe61755d12f6: function (a, c) {
			const i = getObject(a).then(getObject(c));
			return addHeapObject(i);
		},
		__wbg_then_9e335f6dd892bc11: function (a, c, i) {
			const f = getObject(a).then(getObject(c), getObject(i));
			return addHeapObject(f);
		},
		__wbg_then_bc59d1943397ca4e: function (a, c, i) {
			const f = getObject(a).then(getObject(c), getObject(i));
			return addHeapObject(f);
		},
		__wbg_toBlob_b7bc2b08e11beff6: function () {
			return handleError(function (a, c) {
				getObject(a).toBlob(getObject(c));
			}, arguments);
		},
		__wbg_toString_3272fa0dfd05dd87: function (a) {
			const c = getObject(a).toString();
			return addHeapObject(c);
		},
		__wbg_transferFromImageBitmap_9f9bd42ea0f80770: function (a, c) {
			getObject(a).transferFromImageBitmap(getObject(c));
		},
		__wbg_uniform1f_8c3b03df282dba21: function (a, c, i) {
			getObject(a).uniform1f(getObject(c), i);
		},
		__wbg_uniform1f_b8841988568406b9: function (a, c, i) {
			getObject(a).uniform1f(getObject(c), i);
		},
		__wbg_uniform1i_953040fb972e9fab: function (a, c, i) {
			getObject(a).uniform1i(getObject(c), i);
		},
		__wbg_uniform1i_acd89bea81085be4: function (a, c, i) {
			getObject(a).uniform1i(getObject(c), i);
		},
		__wbg_uniform1ui_9f8d9b877d6691d8: function (a, c, i) {
			getObject(a).uniform1ui(getObject(c), i >>> 0);
		},
		__wbg_uniform2fv_28fbf8836f3045d0: function (a, c, i, f) {
			getObject(a).uniform2fv(getObject(c), getArrayF32FromWasm0(i, f));
		},
		__wbg_uniform2fv_f3c92aab21d0dec3: function (a, c, i, f) {
			getObject(a).uniform2fv(getObject(c), getArrayF32FromWasm0(i, f));
		},
		__wbg_uniform2iv_892b6d31137ad198: function (a, c, i, f) {
			getObject(a).uniform2iv(getObject(c), getArrayI32FromWasm0(i, f));
		},
		__wbg_uniform2iv_f40f632615c5685a: function (a, c, i, f) {
			getObject(a).uniform2iv(getObject(c), getArrayI32FromWasm0(i, f));
		},
		__wbg_uniform2uiv_6d170469a702f23e: function (a, c, i, f) {
			getObject(a).uniform2uiv(getObject(c), getArrayU32FromWasm0(i, f));
		},
		__wbg_uniform3fv_85a9a17c9635941b: function (a, c, i, f) {
			getObject(a).uniform3fv(getObject(c), getArrayF32FromWasm0(i, f));
		},
		__wbg_uniform3fv_cdf7c84f9119f13b: function (a, c, i, f) {
			getObject(a).uniform3fv(getObject(c), getArrayF32FromWasm0(i, f));
		},
		__wbg_uniform3iv_38e74d2ae9dfbfb8: function (a, c, i, f) {
			getObject(a).uniform3iv(getObject(c), getArrayI32FromWasm0(i, f));
		},
		__wbg_uniform3iv_4c372010ac6def3f: function (a, c, i, f) {
			getObject(a).uniform3iv(getObject(c), getArrayI32FromWasm0(i, f));
		},
		__wbg_uniform3uiv_bb7266bb3a5aef96: function (a, c, i, f) {
			getObject(a).uniform3uiv(getObject(c), getArrayU32FromWasm0(i, f));
		},
		__wbg_uniform4f_0b00a34f4789ad14: function (a, c, i, f, _, b) {
			getObject(a).uniform4f(getObject(c), i, f, _, b);
		},
		__wbg_uniform4f_7275e0fb864b7513: function (a, c, i, f, _, b) {
			getObject(a).uniform4f(getObject(c), i, f, _, b);
		},
		__wbg_uniform4fv_a4cdb4bd66867df5: function (a, c, i, f) {
			getObject(a).uniform4fv(getObject(c), getArrayF32FromWasm0(i, f));
		},
		__wbg_uniform4fv_c416900acf65eca9: function (a, c, i, f) {
			getObject(a).uniform4fv(getObject(c), getArrayF32FromWasm0(i, f));
		},
		__wbg_uniform4iv_b49cd4acf0aa3ebc: function (a, c, i, f) {
			getObject(a).uniform4iv(getObject(c), getArrayI32FromWasm0(i, f));
		},
		__wbg_uniform4iv_d654af0e6b7bdb1a: function (a, c, i, f) {
			getObject(a).uniform4iv(getObject(c), getArrayI32FromWasm0(i, f));
		},
		__wbg_uniform4uiv_e95d9a124fb8f91e: function (a, c, i, f) {
			getObject(a).uniform4uiv(getObject(c), getArrayU32FromWasm0(i, f));
		},
		__wbg_uniformBlockBinding_a47fa267662afd7b: function (a, c, i, f) {
			getObject(a).uniformBlockBinding(getObject(c), i >>> 0, f >>> 0);
		},
		__wbg_uniformMatrix2fv_4229ae27417c649a: function (a, c, i, f, _) {
			getObject(a).uniformMatrix2fv(
				getObject(c),
				i !== 0,
				getArrayF32FromWasm0(f, _),
			);
		},
		__wbg_uniformMatrix2fv_648417dd2040de5b: function (a, c, i, f, _) {
			getObject(a).uniformMatrix2fv(
				getObject(c),
				i !== 0,
				getArrayF32FromWasm0(f, _),
			);
		},
		__wbg_uniformMatrix2x3fv_eb9a53c8c9aa724b: function (a, c, i, f, _) {
			getObject(a).uniformMatrix2x3fv(
				getObject(c),
				i !== 0,
				getArrayF32FromWasm0(f, _),
			);
		},
		__wbg_uniformMatrix2x4fv_8849517a52f2e845: function (a, c, i, f, _) {
			getObject(a).uniformMatrix2x4fv(
				getObject(c),
				i !== 0,
				getArrayF32FromWasm0(f, _),
			);
		},
		__wbg_uniformMatrix3fv_244fc4416319c169: function (a, c, i, f, _) {
			getObject(a).uniformMatrix3fv(
				getObject(c),
				i !== 0,
				getArrayF32FromWasm0(f, _),
			);
		},
		__wbg_uniformMatrix3fv_bafc2707d0c48e27: function (a, c, i, f, _) {
			getObject(a).uniformMatrix3fv(
				getObject(c),
				i !== 0,
				getArrayF32FromWasm0(f, _),
			);
		},
		__wbg_uniformMatrix3x2fv_f1729eb13fcd41a3: function (a, c, i, f, _) {
			getObject(a).uniformMatrix3x2fv(
				getObject(c),
				i !== 0,
				getArrayF32FromWasm0(f, _),
			);
		},
		__wbg_uniformMatrix3x4fv_3c11181f5fa929de: function (a, c, i, f, _) {
			getObject(a).uniformMatrix3x4fv(
				getObject(c),
				i !== 0,
				getArrayF32FromWasm0(f, _),
			);
		},
		__wbg_uniformMatrix4fv_4d322b295d122214: function (a, c, i, f, _) {
			getObject(a).uniformMatrix4fv(
				getObject(c),
				i !== 0,
				getArrayF32FromWasm0(f, _),
			);
		},
		__wbg_uniformMatrix4fv_7c68dee5aee11694: function (a, c, i, f, _) {
			getObject(a).uniformMatrix4fv(
				getObject(c),
				i !== 0,
				getArrayF32FromWasm0(f, _),
			);
		},
		__wbg_uniformMatrix4x2fv_5a8701b552d704af: function (a, c, i, f, _) {
			getObject(a).uniformMatrix4x2fv(
				getObject(c),
				i !== 0,
				getArrayF32FromWasm0(f, _),
			);
		},
		__wbg_uniformMatrix4x3fv_741c3f4e0b2c7e04: function (a, c, i, f, _) {
			getObject(a).uniformMatrix4x3fv(
				getObject(c),
				i !== 0,
				getArrayF32FromWasm0(f, _),
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
				const i = getObject(c).userAgent,
					f = passStringToWasm0(
						i,
						wasm.__wbindgen_export,
						wasm.__wbindgen_export2,
					),
					_ = WASM_VECTOR_LEN;
				getDataViewMemory0().setInt32(a + 4, _, true),
					getDataViewMemory0().setInt32(a + 0, f, true);
			}, arguments);
		},
		__wbg_value_f3d531408c0c70aa: function (a) {
			return getObject(a).value;
		},
		__wbg_vertexAttribDivisorANGLE_b357aa2bf70d3dcf: function (a, c, i) {
			getObject(a).vertexAttribDivisorANGLE(c >>> 0, i >>> 0);
		},
		__wbg_vertexAttribDivisor_99b2fd5affca539d: function (a, c, i) {
			getObject(a).vertexAttribDivisor(c >>> 0, i >>> 0);
		},
		__wbg_vertexAttribIPointer_ecd3baef73ba0965: function (
			a,
			c,
			i,
			f,
			_,
			b,
		) {
			getObject(a).vertexAttribIPointer(c >>> 0, i, f >>> 0, _, b);
		},
		__wbg_vertexAttribPointer_ea73fc4cc5b7d647: function (
			a,
			c,
			i,
			f,
			_,
			b,
			y,
		) {
			getObject(a).vertexAttribPointer(
				c >>> 0,
				i,
				f >>> 0,
				_ !== 0,
				b,
				y,
			);
		},
		__wbg_vertexAttribPointer_f63675d7fad431e6: function (
			a,
			c,
			i,
			f,
			_,
			b,
			y,
		) {
			getObject(a).vertexAttribPointer(
				c >>> 0,
				i,
				f >>> 0,
				_ !== 0,
				b,
				y,
			);
		},
		__wbg_viewport_63ee76a0f029804d: function (a, c, i, f, _) {
			getObject(a).viewport(c, i, f, _);
		},
		__wbg_viewport_b60aceadb9166023: function (a, c, i, f, _) {
			getObject(a).viewport(c, i, f, _);
		},
		__wbg_visibilityState_8b47c97faee36457: function (a) {
			const c = getObject(a).visibilityState;
			return (__wbindgen_enum_VisibilityState.indexOf(c) + 1 || 3) - 1;
		},
		__wbg_warn_809cad1bfc2b3a42: function (a, c, i, f) {
			console.warn(
				getObject(a),
				getObject(c),
				getObject(i),
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
			return handleError(function (a, c, i, f, _, b) {
				getObject(a).writeBuffer(getObject(c), i, getObject(f), _, b);
			}, arguments);
		},
		__wbg_writeTexture_340cfbecd9544755: function () {
			return handleError(function (a, c, i, f, _) {
				getObject(a).writeTexture(
					getObject(c),
					getObject(i),
					getObject(f),
					getObject(_),
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
			const i = makeMutClosure(
				a,
				c,
				wasm.__wasm_bindgen_func_elem_119659,
				__wasm_bindgen_func_elem_119660,
			);
			return addHeapObject(i);
		},
		__wbindgen_cast_0000000000000002: function (a, c) {
			const i = makeMutClosure(
				a,
				c,
				wasm.__wasm_bindgen_func_elem_170447,
				__wasm_bindgen_func_elem_170448,
			);
			return addHeapObject(i);
		},
		__wbindgen_cast_0000000000000003: function (a, c) {
			const i = makeMutClosure(
				a,
				c,
				wasm.__wasm_bindgen_func_elem_182421,
				__wasm_bindgen_func_elem_182422,
			);
			return addHeapObject(i);
		},
		__wbindgen_cast_0000000000000004: function (a, c) {
			const i = makeMutClosure(
				a,
				c,
				wasm.__wasm_bindgen_func_elem_55914,
				__wasm_bindgen_func_elem_55915,
			);
			return addHeapObject(i);
		},
		__wbindgen_cast_0000000000000005: function (a, c) {
			const i = makeMutClosure(
				a,
				c,
				wasm.__wasm_bindgen_func_elem_55914,
				__wasm_bindgen_func_elem_55924,
			);
			return addHeapObject(i);
		},
		__wbindgen_cast_0000000000000006: function (a, c) {
			const i = makeMutClosure(
				a,
				c,
				wasm.__wasm_bindgen_func_elem_55914,
				__wasm_bindgen_func_elem_55915_5,
			);
			return addHeapObject(i);
		},
		__wbindgen_cast_0000000000000007: function (a, c) {
			const i = makeMutClosure(
				a,
				c,
				wasm.__wasm_bindgen_func_elem_55914,
				__wasm_bindgen_func_elem_55915_6,
			);
			return addHeapObject(i);
		},
		__wbindgen_cast_0000000000000008: function (a, c) {
			const i = makeMutClosure(
				a,
				c,
				wasm.__wasm_bindgen_func_elem_55914,
				__wasm_bindgen_func_elem_55915_7,
			);
			return addHeapObject(i);
		},
		__wbindgen_cast_0000000000000009: function (a, c) {
			const i = makeMutClosure(
				a,
				c,
				wasm.__wasm_bindgen_func_elem_55914,
				__wasm_bindgen_func_elem_55915_8,
			);
			return addHeapObject(i);
		},
		__wbindgen_cast_000000000000000a: function (a, c) {
			const i = makeMutClosure(
				a,
				c,
				wasm.__wasm_bindgen_func_elem_55914,
				__wasm_bindgen_func_elem_55915_9,
			);
			return addHeapObject(i);
		},
		__wbindgen_cast_000000000000000b: function (a, c) {
			const i = makeMutClosure(
				a,
				c,
				wasm.__wasm_bindgen_func_elem_55914,
				__wasm_bindgen_func_elem_55915_10,
			);
			return addHeapObject(i);
		},
		__wbindgen_cast_000000000000000c: function (a, c) {
			const i = makeMutClosure(
				a,
				c,
				wasm.__wasm_bindgen_func_elem_55914,
				__wasm_bindgen_func_elem_55915_11,
			);
			return addHeapObject(i);
		},
		__wbindgen_cast_000000000000000d: function (a, c) {
			const i = makeMutClosure(
				a,
				c,
				wasm.__wasm_bindgen_func_elem_55914,
				__wasm_bindgen_func_elem_55917,
			);
			return addHeapObject(i);
		},
		__wbindgen_cast_000000000000000e: function (a, c) {
			const i = makeMutClosure(
				a,
				c,
				wasm.__wasm_bindgen_func_elem_55914,
				__wasm_bindgen_func_elem_55928,
			);
			return addHeapObject(i);
		},
		__wbindgen_cast_000000000000000f: function (a, c) {
			const i = makeMutClosure(
				a,
				c,
				wasm.__wasm_bindgen_func_elem_8998,
				__wasm_bindgen_func_elem_8999,
			);
			return addHeapObject(i);
		},
		__wbindgen_cast_0000000000000010: function (a, c) {
			const i = makeMutClosure(
				a,
				c,
				wasm.__wasm_bindgen_func_elem_8998,
				__wasm_bindgen_func_elem_8999_15,
			);
			return addHeapObject(i);
		},
		__wbindgen_cast_0000000000000011: function (a, c) {
			const i = makeMutClosure(
				a,
				c,
				wasm.__wasm_bindgen_func_elem_8998,
				__wasm_bindgen_func_elem_8999_16,
			);
			return addHeapObject(i);
		},
		__wbindgen_cast_0000000000000012: function (a, c) {
			const i = makeMutClosure(
				a,
				c,
				wasm.__wasm_bindgen_func_elem_109315,
				__wasm_bindgen_func_elem_109316,
			);
			return addHeapObject(i);
		},
		__wbindgen_cast_0000000000000013: function (a) {
			return addHeapObject(a);
		},
		__wbindgen_cast_0000000000000014: function (a, c) {
			const i = getArrayF32FromWasm0(a, c);
			return addHeapObject(i);
		},
		__wbindgen_cast_0000000000000015: function (a, c) {
			const i = getArrayI16FromWasm0(a, c);
			return addHeapObject(i);
		},
		__wbindgen_cast_0000000000000016: function (a, c) {
			const i = getArrayI32FromWasm0(a, c);
			return addHeapObject(i);
		},
		__wbindgen_cast_0000000000000017: function (a, c) {
			const i = getArrayI8FromWasm0(a, c);
			return addHeapObject(i);
		},
		__wbindgen_cast_0000000000000018: function (a, c) {
			const i = getArrayU16FromWasm0(a, c);
			return addHeapObject(i);
		},
		__wbindgen_cast_0000000000000019: function (a, c) {
			const i = getArrayU32FromWasm0(a, c);
			return addHeapObject(i);
		},
		__wbindgen_cast_000000000000001a: function (a, c) {
			const i = getArrayU8FromWasm0(a, c);
			return addHeapObject(i);
		},
		__wbindgen_cast_000000000000001b: function (a, c) {
			const i = getStringFromWasm0(a, c);
			return addHeapObject(i);
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
function __wasm_bindgen_func_elem_170448(a, c) {
	wasm.__wasm_bindgen_func_elem_170448(a, c);
}
function __wasm_bindgen_func_elem_55928(a, c) {
	wasm.__wasm_bindgen_func_elem_55928(a, c);
}
function __wasm_bindgen_func_elem_109316(a, c) {
	wasm.__wasm_bindgen_func_elem_109316(a, c);
}
function __wasm_bindgen_func_elem_119660(a, c, i) {
	wasm.__wasm_bindgen_func_elem_119660(a, c, addHeapObject(i));
}
function __wasm_bindgen_func_elem_55915(a, c, i) {
	wasm.__wasm_bindgen_func_elem_55915(a, c, addHeapObject(i));
}
function __wasm_bindgen_func_elem_55915_5(a, c, i) {
	wasm.__wasm_bindgen_func_elem_55915_5(a, c, addHeapObject(i));
}
function __wasm_bindgen_func_elem_55915_6(a, c, i) {
	wasm.__wasm_bindgen_func_elem_55915_6(a, c, addHeapObject(i));
}
function __wasm_bindgen_func_elem_55915_7(a, c, i) {
	wasm.__wasm_bindgen_func_elem_55915_7(a, c, addHeapObject(i));
}
function __wasm_bindgen_func_elem_55915_8(a, c, i) {
	wasm.__wasm_bindgen_func_elem_55915_8(a, c, addHeapObject(i));
}
function __wasm_bindgen_func_elem_55915_9(a, c, i) {
	wasm.__wasm_bindgen_func_elem_55915_9(a, c, addHeapObject(i));
}
function __wasm_bindgen_func_elem_55915_10(a, c, i) {
	wasm.__wasm_bindgen_func_elem_55915_10(a, c, addHeapObject(i));
}
function __wasm_bindgen_func_elem_55915_11(a, c, i) {
	wasm.__wasm_bindgen_func_elem_55915_11(a, c, addHeapObject(i));
}
function __wasm_bindgen_func_elem_55917(a, c, i) {
	wasm.__wasm_bindgen_func_elem_55917(
		a,
		c,
		isLikeNone(i) ? 0 : addHeapObject(i),
	);
}
function __wasm_bindgen_func_elem_8999(a, c, i) {
	wasm.__wasm_bindgen_func_elem_8999(a, c, addHeapObject(i));
}
function __wasm_bindgen_func_elem_8999_15(a, c, i) {
	wasm.__wasm_bindgen_func_elem_8999_15(a, c, addHeapObject(i));
}
function __wasm_bindgen_func_elem_8999_16(a, c, i) {
	wasm.__wasm_bindgen_func_elem_8999_16(a, c, addHeapObject(i));
}
function __wasm_bindgen_func_elem_182422(a, c, i) {
	try {
		const b = wasm.__wbindgen_add_to_stack_pointer(-16);
		wasm.__wasm_bindgen_func_elem_182422(b, a, c, addHeapObject(i));
		var f = getDataViewMemory0().getInt32(b + 0, true),
			_ = getDataViewMemory0().getInt32(b + 4, true);
		if (_) throw takeObject(f);
	} finally {
		wasm.__wbindgen_add_to_stack_pointer(16);
	}
}
function __wasm_bindgen_func_elem_55924(a, c, i, f) {
	wasm.__wasm_bindgen_func_elem_55924(
		a,
		c,
		addHeapObject(i),
		addHeapObject(f),
	);
}
const __wbindgen_enum_BinaryType = ['blob', 'arraybuffer'],
	__wbindgen_enum_GamepadMappingType = ['', 'standard'],
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
		const _ = a.description;
		return _ == null ? 'Symbol' : `Symbol(${_})`;
	}
	if (c == 'function') {
		const _ = a.name;
		return typeof _ == 'string' && _.length > 0
			? `Function(${_})`
			: 'Function';
	}
	if (Array.isArray(a)) {
		const _ = a.length;
		let b = '[';
		_ > 0 && (b += debugString(a[0]));
		for (let y = 1; y < _; y++) b += ', ' + debugString(a[y]);
		return (b += ']'), b;
	}
	const i = /\[object ([^\]]+)\]/.exec(toString.call(a));
	let f;
	if (i && i.length > 1) f = i[1];
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
	} catch (i) {
		wasm.__wbindgen_export3(addHeapObject(i));
	}
}
let heap = new Array(1024).fill(void 0);
heap.push(void 0, null, true, false);
let heap_next = heap.length;
function isLikeNone(a) {
	return a == null;
}
function makeMutClosure(a, c, i, f) {
	const _ = { a, b: c, cnt: 1, dtor: i },
		b = (...y) => {
			_.cnt++;
			const x = _.a;
			_.a = 0;
			try {
				return f(x, _.b, ...y);
			} finally {
				(_.a = x), b._wbg_cb_unref();
			}
		};
	return (
		(b._wbg_cb_unref = () => {
			--_.cnt === 0 &&
				(_.dtor(_.a, _.b), (_.a = 0), CLOSURE_DTORS.unregister(_));
		}),
		CLOSURE_DTORS.register(b, _, _),
		b
	);
}
function passStringToWasm0(a, c, i) {
	if (i === void 0) {
		const x = cachedTextEncoder.encode(a),
			v = c(x.length, 1) >>> 0;
		return (
			getUint8ArrayMemory0()
				.subarray(v, v + x.length)
				.set(x),
			(WASM_VECTOR_LEN = x.length),
			v
		);
	}
	let f = a.length,
		_ = c(f, 1) >>> 0;
	const b = getUint8ArrayMemory0();
	let y = 0;
	for (; y < f; y++) {
		const x = a.charCodeAt(y);
		if (x > 127) break;
		b[_ + y] = x;
	}
	if (y !== f) {
		y !== 0 && (a = a.slice(y)),
			(_ = i(_, f, (f = y + a.length * 3), 1) >>> 0);
		const x = getUint8ArrayMemory0().subarray(_ + y, _ + f),
			v = cachedTextEncoder.encodeInto(a, x);
		(y += v.written), (_ = i(_, f, y, 1) >>> 0);
	}
	return (WASM_VECTOR_LEN = y), _;
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
		const i = cachedTextEncoder.encode(a);
		return c.set(i), { read: a.length, written: i.length };
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
			} catch (_) {
				if (
					a.ok &&
					i(a.type) &&
					a.headers.get('Content-Type') !== 'application/wasm'
				)
					console.warn(
						'`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n',
						_,
					);
				else throw _;
			}
		const f = await a.arrayBuffer();
		return await WebAssembly.instantiate(f, c);
	} else {
		const f = await WebAssembly.instantiate(a, c);
		return f instanceof WebAssembly.Instance
			? { instance: f, module: a }
			: f;
	}
	function i(f) {
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
	const { instance: i, module: f } = await __wbg_load(await a, c);
	return __wbg_finalize_init(i);
}
const isometric_game = Object.freeze(
	Object.defineProperty(
		{
			__proto__: null,
			default: __wbg_init,
			dispatch_action,
			get_fps,
			get_hovered_object_json,
			get_inventory_json,
			get_online_status,
			get_player_state_json,
			get_selected_object_json,
			go_online,
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
function HUD() {
	const [a, c] = reactExports.useState(null);
	return (
		reactExports.useEffect(() => {
			const i = setInterval(() => {
				try {
					const f = get_player_state_json();
					f && c(JSON.parse(f));
				} catch {}
			}, 250);
			return () => clearInterval(i);
		}, []),
		a
			? jsxRuntimeExports.jsx(GlassPanel, {
					className:
						'absolute top-12 right-4 md:top-14 md:right-6 px-3 py-1.5 md:px-4 md:py-2 pointer-events-none',
					children: jsxRuntimeExports.jsxs('div', {
						className: 'text-[7px] md:text-[9px] text-text-muted',
						children: [
							'Pos: ',
							a.position.map((i) => i.toFixed(1)).join(', '),
						],
					}),
				})
			: null
	);
}
const ITEM_NAMES = {
	log: 'Log',
	stone: 'Stone',
	mossy_stone: 'Mossy Stone',
	copper_ore: 'Copper Ore',
	iron_ore: 'Iron Ore',
	crystal_ore: 'Crystal Ore',
	tulip: 'Tulip',
	daisy: 'Daisy',
	lavender: 'Lavender',
	bellflower: 'Bellflower',
	wildflower: 'Wildflower',
	sunflower: 'Sunflower',
	rose: 'Rose',
	cornflower: 'Cornflower',
	allium: 'Allium',
	blue_orchid: 'Blue Orchid',
	porcini: 'Porcini',
	chanterelle: 'Chanterelle',
	fly_agaric: 'Fly Agaric',
};
function useInventory() {
	const [a, c] = reactExports.useState(null),
		i = reactExports.useRef(/* @__PURE__ */ new Map());
	return (
		reactExports.useEffect(() => {
			const f = setInterval(() => {
				try {
					const _ = get_inventory_json();
					if (!_) return;
					const b = JSON.parse(_);
					c(b);
					const y = /* @__PURE__ */ new Map();
					for (const v of b.items) y.set(v.kind, v.quantity);
					const x = i.current;
					for (const [v, p] of y) {
						const z = x.get(v) ?? 0;
						if (p > z) {
							const R = p - z,
								J = ITEM_NAMES[v] ?? v;
							gameEvents.emit('toast:show', {
								message: `+${R} ${J}`,
								severity: 'loot',
							});
						}
					}
					i.current = y;
				} catch {}
			}, 200);
			return () => clearInterval(f);
		}, []),
		a
	);
}
const GRID_COLS = 4,
	GRID_ROWS = 4,
	TOTAL_SLOTS = GRID_COLS * GRID_ROWS,
	ITEM_ICONS = {
		log: '\u{1FAB5}',
		stone: '\u{1FAA8}',
		mossy_stone: '\u{1FAA8}',
		copper_ore: '\u{1F7E4}',
		iron_ore: '\u2B1B',
		crystal_ore: '\u{1F7E3}',
		tulip: '\u{1F337}',
		daisy: '\u{1F33C}',
		lavender: '\u{1F49C}',
		bellflower: '\u{1F514}',
		wildflower: '\u{1F33B}',
		sunflower: '\u{1F33B}',
		rose: '\u{1F339}',
		cornflower: '\u{1F499}',
		allium: '\u{1F7E3}',
		blue_orchid: '\u{1F48E}',
		porcini: '\u{1F344}',
		chanterelle: '\u{1F344}',
		fly_agaric: '\u{1F344}',
	},
	ITEM_SHORT_NAMES = {
		log: 'Log',
		stone: 'Stn',
		mossy_stone: 'Mss',
		copper_ore: 'Cu',
		iron_ore: 'Fe',
		crystal_ore: 'Cry',
		tulip: 'Tlp',
		daisy: 'Dsy',
		lavender: 'Lvn',
		bellflower: 'Bel',
		wildflower: 'Wld',
		sunflower: 'Sun',
		rose: 'Rse',
		cornflower: 'Crn',
		allium: 'All',
		blue_orchid: 'Orc',
		porcini: 'Por',
		chanterelle: 'Chn',
		fly_agaric: 'Fly',
	};
function Inventory() {
	var _a;
	const [a, c] = reactExports.useState(false),
		f = ((_a = useInventory()) == null ? void 0 : _a.items) ?? [];
	return jsxRuntimeExports.jsxs('div', {
		className:
			'absolute bottom-40 right-4 md:bottom-44 md:right-6 pointer-events-auto',
		children: [
			jsxRuntimeExports.jsx('button', {
				onClick: () => c(!a),
				className: `block ml-auto mb-1 px-2 py-1 text-[8px] md:text-[10px]
					bg-panel-inner border-2 border-panel-border text-[#c8a832]
					shadow-[0_0_0_1px_#1a1008,0_2px_6px_rgba(0,0,0,0.5)]
					hover:bg-[#2a1c0c] active:bg-[#1a1008] transition-colors`,
				children: a ? 'Close' : 'Bag',
			}),
			a &&
				jsxRuntimeExports.jsx('div', {
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
									className:
										'grid grid-cols-4 gap-px md:gap-0.5',
									children: Array.from({
										length: TOTAL_SLOTS,
									}).map((_, b) => {
										const y = f[b];
										return jsxRuntimeExports.jsx(
											'div',
											{
												className: `w-7 h-7 md:w-11 md:h-11 bg-[#261a0a] border border-[#3d2b14]
												shadow-[inset_0_1px_2px_rgba(0,0,0,0.4)]
												flex flex-col items-center justify-center relative`,
												children:
													y &&
													jsxRuntimeExports.jsxs(
														jsxRuntimeExports.Fragment,
														{
															children: [
																jsxRuntimeExports.jsx(
																	'span',
																	{
																		className:
																			'text-[10px] md:text-[14px] leading-none',
																		children:
																			ITEM_ICONS[
																				y
																					.kind
																			] ??
																			'?',
																	},
																),
																jsxRuntimeExports.jsx(
																	'span',
																	{
																		className:
																			'text-[5px] md:text-[7px] text-text-muted leading-none mt-px',
																		children:
																			ITEM_SHORT_NAMES[
																				y
																					.kind
																			] ??
																			y.kind,
																	},
																),
																y.quantity >
																	1 &&
																	jsxRuntimeExports.jsx(
																		'span',
																		{
																			className:
																				'absolute bottom-0 right-0.5 text-[5px] md:text-[7px] text-[#c8a832] leading-none',
																			children:
																				y.quantity,
																		},
																	),
															],
														},
													),
											},
											b,
										);
									}),
								}),
							}),
						],
					}),
				}),
		],
	});
}
function FPSCounter() {
	const [a, c] = reactExports.useState(0);
	return (
		reactExports.useEffect(() => {
			const i = setInterval(() => {
				try {
					c(get_fps());
				} catch {}
			}, 1e3);
			return () => clearInterval(i);
		}, []),
		jsxRuntimeExports.jsxs('div', {
			className:
				'absolute top-12 left-4 md:top-14 md:left-6 px-2 py-1 md:px-3 md:py-1.5 bg-panel border border-panel-border text-[7px] md:text-[10px] text-text-muted pointer-events-auto',
			children: [a, ' FPS'],
		})
	);
}
const CAMERA_OFFSET = [15, 20, 15],
	VIEWPORT_HEIGHT = 20;
function computeCameraAxes() {
	const a = [-15, -20, -15],
		c = Math.sqrt(a[0] ** 2 + a[1] ** 2 + a[2] ** 2);
	(a[0] /= c), (a[1] /= c), (a[2] /= c);
	const i = [0, 1, 0],
		f = [
			a[1] * i[2] - a[2] * i[1],
			a[2] * i[0] - a[0] * i[2],
			a[0] * i[1] - a[1] * i[0],
		],
		_ = Math.sqrt(f[0] ** 2 + f[1] ** 2 + f[2] ** 2);
	(f[0] /= _), (f[1] /= _), (f[2] /= _);
	const b = [
		f[1] * a[2] - f[2] * a[1],
		f[2] * a[0] - f[0] * a[2],
		f[0] * a[1] - f[1] * a[0],
	];
	return { right: f, up: b, forward: a };
}
const AXES = computeCameraAxes();
function dot(a, c) {
	return a[0] * c[0] + a[1] * c[1] + a[2] * c[2];
}
function worldToScreen(a, c, i, f) {
	const _ = [a[0] - c[0], a[1] - c[1], a[2] - c[2]],
		b = VIEWPORT_HEIGHT / 2,
		y = i / f,
		x = b * y,
		v = dot(_, AXES.right) / x,
		p = dot(_, AXES.up) / b;
	return Math.abs(v) > 1.2 || Math.abs(p) > 1.2
		? null
		: { x: ((v + 1) / 2) * i, y: ((1 - p) / 2) * f };
}
const OBJECT_NAMES = {
		tree: 'Tree',
		crate: 'Wooden Crate',
		crystal: 'Crystal',
		pillar: 'Stone Pillar',
		sphere: 'Metallic Sphere',
		flower: 'Flower',
		rock: 'Rock',
		mushroom: 'Mushroom',
	},
	FLOWER_NAMES = {
		tulip: 'Tulip',
		daisy: 'Daisy',
		lavender: 'Lavender',
		bell: 'Bellflower',
		wildflower: 'Wildflower',
		sunflower: 'Sunflower',
		rose: 'Rose',
		cornflower: 'Cornflower',
		allium: 'Allium',
		blue_orchid: 'Blue Orchid',
	},
	ROCK_NAMES = {
		boulder: 'Boulder',
		mossy_rock: 'Mossy Rock',
		ore_copper: 'Copper Ore',
		ore_iron: 'Iron Ore',
		ore_crystal: 'Crystal Ore',
	},
	MUSHROOM_NAMES = {
		porcini: 'Porcini',
		chanterelle: 'Chanterelle',
		fly_agaric: 'Fly Agaric',
	};
function ObjectLabel() {
	const [a, c] = reactExports.useState(null);
	return (
		reactExports.useEffect(() => {
			const i = setInterval(() => {
				try {
					const f = get_hovered_object_json();
					if (!f) {
						c(null);
						return;
					}
					const _ = JSON.parse(f),
						b = get_player_state_json();
					if (!b) {
						c(null);
						return;
					}
					const y = JSON.parse(b),
						x = [
							y.position[0] + CAMERA_OFFSET[0],
							y.position[1] + CAMERA_OFFSET[1],
							y.position[2] + CAMERA_OFFSET[2],
						],
						v = [_.position[0], _.position[1] + 1.5, _.position[2]],
						p = worldToScreen(
							v,
							x,
							window.innerWidth,
							window.innerHeight,
						);
					if (!p) {
						c(null);
						return;
					}
					let z = OBJECT_NAMES[_.kind] ?? _.kind;
					_.kind === 'flower' &&
						_.sub_kind &&
						(z = FLOWER_NAMES[_.sub_kind] ?? z),
						_.kind === 'rock' &&
							_.sub_kind &&
							(z = ROCK_NAMES[_.sub_kind] ?? z),
						_.kind === 'mushroom' &&
							_.sub_kind &&
							(z = MUSHROOM_NAMES[_.sub_kind] ?? z),
						c({ name: z, screenX: p.x, screenY: p.y });
				} catch {
					c(null);
				}
			}, 50);
			return () => clearInterval(i);
		}, []),
		a
			? jsxRuntimeExports.jsx('div', {
					className: 'absolute pointer-events-none',
					style: {
						left: a.screenX,
						top: a.screenY,
						transform: 'translate(-50%, -100%)',
					},
					children: jsxRuntimeExports.jsx('div', {
						className: `px-2 py-1 md:px-3 md:py-1.5 bg-[#1e1408]/90 border border-panel-border
					text-[7px] md:text-[10px] text-[#c8a832] whitespace-nowrap`,
						children: a.name,
					}),
				})
			: null
	);
}
async function getSupabaseJwt() {
	return new Promise((a) => {
		const c = indexedDB.open('sb-auth-v2', 1);
		(c.onerror = () => a('')),
			(c.onupgradeneeded = () => {
				var _a;
				(_a = c.transaction) == null ? void 0 : _a.abort(), a('');
			}),
			(c.onsuccess = () => {
				const i = c.result;
				try {
					const _ = i.transaction('kv', 'readonly').objectStore('kv'),
						b = _.get('supabase.auth.token');
					(b.onsuccess = () => {
						var _a;
						if ((_a = b.result) == null ? void 0 : _a.value)
							try {
								const x = JSON.parse(b.result.value);
								a((x == null ? void 0 : x.access_token) ?? '');
								return;
							} catch {}
						const y = _.openCursor();
						(y.onsuccess = () => {
							const x = y.result;
							if (!x) {
								a('');
								return;
							}
							const v = x.key;
							if (v.includes('auth') && v.includes('token'))
								try {
									const p = JSON.parse(x.value.value);
									a(
										(p == null ? void 0 : p.access_token) ??
											'',
									);
								} catch {
									x.continue();
								}
							else x.continue();
						}),
							(y.onerror = () => a(''));
					}),
						(b.onerror = () => a(''));
				} catch {
					a('');
				}
			});
	});
}
function GoOnlineButton() {
	const [a, c] = reactExports.useState(false),
		[i, f] = reactExports.useState(false),
		[_, b] = reactExports.useState(null);
	reactExports.useEffect(() => {
		getSupabaseJwt().then((v) => b(v.length > 0));
	}, []),
		reactExports.useEffect(() => {
			const v = setInterval(() => {
				try {
					const p = get_online_status();
					c(p), p && f(false);
				} catch {}
			}, 500);
			return () => clearInterval(v);
		}, []);
	const y = async () => {
		if (!(a || i)) {
			f(true);
			try {
				const v = await getSupabaseJwt(),
					p = window.location.hostname,
					R =
						p === 'localhost' || p === '127.0.0.1'
							? 'ws://127.0.0.1:5000'
							: `wss://${p}/ws`;
				go_online(R, v);
			} catch {
				f(false);
			}
		}
	};
	if (_ === null) return null;
	const x = a
		? 'Online'
		: i
			? 'Connecting...'
			: _
				? 'Go Online'
				: 'Go Online (Guest)';
	return jsxRuntimeExports.jsx(GlassPanel, {
		className: 'absolute bottom-4 right-4 md:bottom-6 md:right-6',
		children: jsxRuntimeExports.jsxs('button', {
			onClick: y,
			disabled: a || i,
			className: `px-3 py-1.5 md:px-4 md:py-2 text-[9px] md:text-xs font-bold tracking-wider uppercase pointer-events-auto transition-colors ${a ? 'text-green-400 cursor-default' : i ? 'text-yellow-400 cursor-wait' : 'text-text hover:text-white cursor-pointer'}`,
			children: [
				jsxRuntimeExports.jsx('span', {
					className: `inline-block w-1.5 h-1.5 rounded-full mr-1.5 ${a ? 'bg-green-400' : i ? 'bg-yellow-400 animate-pulse' : _ ? 'bg-blue-400' : 'bg-red-400'}`,
				}),
				x,
			],
		}),
	});
}
const MODAL_CLOSE_DISTANCE = 6,
	ACTION_DISTANCE = 3;
function xzDistance(a, c) {
	const i = a[0] - c[0],
		f = a[2] - c[2];
	return Math.sqrt(i * i + f * f);
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
		rock: {
			title: 'Rock',
			description: 'A weathered stone formation.',
			action: 'Mine Rock',
		},
		mushroom: {
			title: 'Mushroom',
			description: 'A wild mushroom growing in the shade.',
			action: 'Collect Mushroom',
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
		sunflower: {
			title: 'Sunflower',
			description: 'A tall sunflower turning toward the light.',
		},
		rose: {
			title: 'Rose',
			description: 'A thorny rose with velvety red petals.',
		},
		cornflower: {
			title: 'Cornflower',
			description: 'A bright blue cornflower swaying in the breeze.',
		},
		allium: {
			title: 'Allium',
			description: 'A round purple allium bloom on a slender stem.',
		},
		blue_orchid: {
			title: 'Blue Orchid',
			description: 'A rare blue orchid with delicate petals.',
		},
	},
	ROCK_INFO = {
		boulder: {
			title: 'Boulder',
			description: 'A large, weathered boulder covered in lichen.',
			action: 'Examine',
		},
		mossy_rock: {
			title: 'Mossy Rock',
			description: 'A moss-covered stone, cool and damp to the touch.',
			action: 'Examine',
		},
		ore_copper: {
			title: 'Copper Ore',
			description: 'Greenish-brown veins of copper glint in the stone.',
			action: 'Mine Ore',
		},
		ore_iron: {
			title: 'Iron Ore',
			description: 'Dark reddish streaks of iron run through the rock.',
			action: 'Mine Ore',
		},
		ore_crystal: {
			title: 'Crystal Ore',
			description: 'Shimmering purple crystals jut from the stone.',
			action: 'Mine Ore',
		},
	},
	MUSHROOM_INFO = {
		porcini: {
			title: 'Porcini',
			description: 'A plump porcini mushroom with a rich earthy aroma.',
		},
		chanterelle: {
			title: 'Chanterelle',
			description: 'A golden chanterelle with a delicate funnel shape.',
		},
		fly_agaric: {
			title: 'Fly Agaric',
			description:
				'A red-capped toadstool with white spots. Handle with care.',
		},
	},
	DISPATCH_ACTIONS = {
		'Chop Tree': 'chop_tree',
		'Mine Rock': 'mine_rock',
		'Mine Ore': 'mine_rock',
		'Collect Flower': 'collect_flower',
		'Collect Mushroom': 'collect_mushroom',
	};
function ActionContent({ info: a, objectPos: c, entityId: i }) {
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
						const f = getPlayerPosition();
						if (f && xzDistance(f, c) > ACTION_DISTANCE) {
							gameEvents.emit('toast:show', {
								message: 'You are too far away.',
								severity: 'warning',
							}),
								gameEvents.emit('modal:close');
							return;
						}
						const _ = DISPATCH_ACTIONS[a.action];
						if (_) {
							dispatch_action(i, _);
							const b =
								_ === 'chop_tree'
									? 'Chopping'
									: _ === 'mine_rock'
										? 'Mining'
										: 'Collecting';
							gameEvents.emit('toast:show', {
								message: `${b} ${a.title}...`,
								severity: 'info',
							});
						} else
							gameEvents.emit('toast:show', {
								message: `${a.action}: ${a.title}`,
								severity: 'info',
							});
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
		const i = setInterval(() => {
				if (!a.current)
					try {
						const _ = get_selected_object_json();
						if (!_) return;
						const b = JSON.parse(_);
						let y = OBJECT_INFO[b.kind];
						if (!y) return;
						if (b.kind === 'flower' && b.sub_kind) {
							const x = FLOWER_INFO[b.sub_kind];
							x &&
								(y = {
									...y,
									title: x.title,
									description: x.description,
								});
						}
						if (b.kind === 'rock' && b.sub_kind) {
							const x = ROCK_INFO[b.sub_kind];
							x &&
								(y = {
									title: x.title,
									description: x.description,
									action: x.action,
								});
						}
						if (b.kind === 'mushroom' && b.sub_kind) {
							const x = MUSHROOM_INFO[b.sub_kind];
							x &&
								(y = {
									...y,
									title: x.title,
									description: x.description,
								});
						}
						(a.current = true),
							(c.current = b.position),
							gameEvents.emit('modal:open', {
								title: y.title,
								size: 'sm',
								content: jsxRuntimeExports.jsx(ActionContent, {
									info: y,
									objectPos: b.position,
									entityId: b.entity_id,
								}),
								onClose: () => {
									(a.current = false), (c.current = null);
								},
							});
					} catch {}
			}, 100),
			f = setInterval(() => {
				if (!a.current || !c.current) return;
				const _ = getPlayerPosition();
				_ &&
					xzDistance(_, c.current) > MODAL_CLOSE_DISTANCE &&
					gameEvents.emit('modal:close');
			}, 250);
		return () => {
			clearInterval(i), clearInterval(f);
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
				jsxRuntimeExports.jsx(ObjectLabel, {}),
				jsxRuntimeExports.jsx(GoOnlineButton, {}),
			],
		})
	);
}
function setLoadingProgress(a, c) {
	const i = document.getElementById('loading-status'),
		f = document.getElementById('loading-bar');
	i && (i.textContent = a), f && (f.style.width = c + '%');
}
function hideLoadingScreen() {
	const a = document.getElementById('game-loading');
	a &&
		((a.style.opacity = '0'),
		(a.style.transition = 'opacity 0.4s ease'),
		setTimeout(() => a.remove(), 400));
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
	setLoadingProgress('Loading game module...', 20);
	const { default: a } = await __vitePreload(
		async () => {
			const { default: c } = await Promise.resolve().then(
				() => isometric_game,
			);
			return { default: c };
		},
		void 0,
	);
	setLoadingProgress('Initializing WebGPU...', 60),
		await a(),
		setLoadingProgress('Starting...', 90),
		ReactDOM.createRoot(document.getElementById('root')).render(
			jsxRuntimeExports.jsx(React.StrictMode, {
				children: jsxRuntimeExports.jsx(GameUIProvider, {
					children: jsxRuntimeExports.jsx(App, {}),
				}),
			}),
		),
		setLoadingProgress('Ready', 100),
		hideLoadingScreen();
}
bootstrap().catch((a) => {
	setLoadingProgress('Failed to load game', 0), console.error(a);
});
