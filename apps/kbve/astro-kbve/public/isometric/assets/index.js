var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
(function() {
  const a = document.createElement("link").relList;
  if (a && a.supports && a.supports("modulepreload")) return;
  for (const o of document.querySelectorAll('link[rel="modulepreload"]')) _(o);
  new MutationObserver((o) => {
    for (const s of o) if (s.type === "childList") for (const j of s.addedNodes) j.tagName === "LINK" && j.rel === "modulepreload" && _(j);
  }).observe(document, { childList: true, subtree: true });
  function l(o) {
    const s = {};
    return o.integrity && (s.integrity = o.integrity), o.referrerPolicy && (s.referrerPolicy = o.referrerPolicy), o.crossOrigin === "use-credentials" ? s.credentials = "include" : o.crossOrigin === "anonymous" ? s.credentials = "omit" : s.credentials = "same-origin", s;
  }
  function _(o) {
    if (o.ep) return;
    o.ep = true;
    const s = l(o);
    fetch(o.href, s);
  }
})();
const scriptRel = "modulepreload", assetsURL = function(n) {
  return "/isometric/" + n;
}, seen = {}, __vitePreload = function(a, l, _) {
  let o = Promise.resolve();
  if (l && l.length > 0) {
    let j = function(p) {
      return Promise.all(p.map((H) => Promise.resolve(H).then((z) => ({ status: "fulfilled", value: z }), (z) => ({ status: "rejected", reason: z }))));
    };
    document.getElementsByTagName("link");
    const S = document.querySelector("meta[property=csp-nonce]"), x = (S == null ? void 0 : S.nonce) || (S == null ? void 0 : S.getAttribute("nonce"));
    o = j(l.map((p) => {
      if (p = assetsURL(p), p in seen) return;
      seen[p] = true;
      const H = p.endsWith(".css"), z = H ? '[rel="stylesheet"]' : "";
      if (document.querySelector(`link[href="${p}"]${z}`)) return;
      const I = document.createElement("link");
      if (I.rel = H ? "stylesheet" : scriptRel, H || (I.as = "script"), I.crossOrigin = "", I.href = p, x && I.setAttribute("nonce", x), document.head.appendChild(I), H) return new Promise((Ce, De) => {
        I.addEventListener("load", Ce), I.addEventListener("error", () => De(new Error(`Unable to preload CSS for ${p}`)));
      });
    }));
  }
  function s(j) {
    const S = new Event("vite:preloadError", { cancelable: true });
    if (S.payload = j, window.dispatchEvent(S), !S.defaultPrevented) throw j;
  }
  return o.then((j) => {
    for (const S of j || []) S.status === "rejected" && s(S.reason);
    return a().catch(s);
  });
};
function getDefaultExportFromCjs(n) {
  return n && n.__esModule && Object.prototype.hasOwnProperty.call(n, "default") ? n.default : n;
}
var jsxRuntime = { exports: {} }, reactJsxRuntime_production = {};
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
  if (hasRequiredReactJsxRuntime_production) return reactJsxRuntime_production;
  hasRequiredReactJsxRuntime_production = 1;
  var n = Symbol.for("react.transitional.element"), a = Symbol.for("react.fragment");
  function l(_, o, s) {
    var j = null;
    if (s !== void 0 && (j = "" + s), o.key !== void 0 && (j = "" + o.key), "key" in o) {
      s = {};
      for (var S in o) S !== "key" && (s[S] = o[S]);
    } else s = o;
    return o = s.ref, { $$typeof: n, type: _, key: j, ref: o !== void 0 ? o : null, props: s };
  }
  return reactJsxRuntime_production.Fragment = a, reactJsxRuntime_production.jsx = l, reactJsxRuntime_production.jsxs = l, reactJsxRuntime_production;
}
var hasRequiredJsxRuntime;
function requireJsxRuntime() {
  return hasRequiredJsxRuntime || (hasRequiredJsxRuntime = 1, jsxRuntime.exports = requireReactJsxRuntime_production()), jsxRuntime.exports;
}
var jsxRuntimeExports = requireJsxRuntime(), react = { exports: {} }, react_production = {};
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
  var n = Symbol.for("react.transitional.element"), a = Symbol.for("react.portal"), l = Symbol.for("react.fragment"), _ = Symbol.for("react.strict_mode"), o = Symbol.for("react.profiler"), s = Symbol.for("react.consumer"), j = Symbol.for("react.context"), S = Symbol.for("react.forward_ref"), x = Symbol.for("react.suspense"), p = Symbol.for("react.memo"), H = Symbol.for("react.lazy"), z = Symbol.for("react.activity"), I = Symbol.iterator;
  function Ce(m) {
    return m === null || typeof m != "object" ? null : (m = I && m[I] || m["@@iterator"], typeof m == "function" ? m : null);
  }
  var De = { isMounted: function() {
    return false;
  }, enqueueForceUpdate: function() {
  }, enqueueReplaceState: function() {
  }, enqueueSetState: function() {
  } }, He = Object.assign, xt = {};
  function We(m, D, C) {
    this.props = m, this.context = D, this.refs = xt, this.updater = C || De;
  }
  We.prototype.isReactComponent = {}, We.prototype.setState = function(m, D) {
    if (typeof m != "object" && typeof m != "function" && m != null) throw Error("takes an object of state variables to update or a function which returns an object of state variables.");
    this.updater.enqueueSetState(this, m, D, "setState");
  }, We.prototype.forceUpdate = function(m) {
    this.updater.enqueueForceUpdate(this, m, "forceUpdate");
  };
  function Zt() {
  }
  Zt.prototype = We.prototype;
  function Re(m, D, C) {
    this.props = m, this.context = D, this.refs = xt, this.updater = C || De;
  }
  var at = Re.prototype = new Zt();
  at.constructor = Re, He(at, We.prototype), at.isPureReactComponent = true;
  var pt = Array.isArray;
  function Ue() {
  }
  var J = { H: null, A: null, T: null, S: null }, Be = Object.prototype.hasOwnProperty;
  function jt(m, D, C) {
    var U = C.ref;
    return { $$typeof: n, type: m, key: D, ref: U !== void 0 ? U : null, props: C };
  }
  function Ln(m, D) {
    return jt(m.type, D, m.props);
  }
  function yt(m) {
    return typeof m == "object" && m !== null && m.$$typeof === n;
  }
  function Le(m) {
    var D = { "=": "=0", ":": "=2" };
    return "$" + m.replace(/[=:]/g, function(C) {
      return D[C];
    });
  }
  var pn = /\/+/g;
  function Et(m, D) {
    return typeof m == "object" && m !== null && m.key != null ? Le("" + m.key) : D.toString(36);
  }
  function dt(m) {
    switch (m.status) {
      case "fulfilled":
        return m.value;
      case "rejected":
        throw m.reason;
      default:
        switch (typeof m.status == "string" ? m.then(Ue, Ue) : (m.status = "pending", m.then(function(D) {
          m.status === "pending" && (m.status = "fulfilled", m.value = D);
        }, function(D) {
          m.status === "pending" && (m.status = "rejected", m.reason = D);
        })), m.status) {
          case "fulfilled":
            return m.value;
          case "rejected":
            throw m.reason;
        }
    }
    throw m;
  }
  function A(m, D, C, U, V) {
    var Q = typeof m;
    (Q === "undefined" || Q === "boolean") && (m = null);
    var te = false;
    if (m === null) te = true;
    else switch (Q) {
      case "bigint":
      case "string":
      case "number":
        te = true;
        break;
      case "object":
        switch (m.$$typeof) {
          case n:
          case a:
            te = true;
            break;
          case H:
            return te = m._init, A(te(m._payload), D, C, U, V);
        }
    }
    if (te) return V = V(m), te = U === "" ? "." + Et(m, 0) : U, pt(V) ? (C = "", te != null && (C = te.replace(pn, "$&/") + "/"), A(V, D, C, "", function(va) {
      return va;
    })) : V != null && (yt(V) && (V = Ln(V, C + (V.key == null || m && m.key === V.key ? "" : ("" + V.key).replace(pn, "$&/") + "/") + te)), D.push(V)), 1;
    te = 0;
    var ze = U === "" ? "." : U + ":";
    if (pt(m)) for (var ge = 0; ge < m.length; ge++) U = m[ge], Q = ze + Et(U, ge), te += A(U, D, C, Q, V);
    else if (ge = Ce(m), typeof ge == "function") for (m = ge.call(m), ge = 0; !(U = m.next()).done; ) U = U.value, Q = ze + Et(U, ge++), te += A(U, D, C, Q, V);
    else if (Q === "object") {
      if (typeof m.then == "function") return A(dt(m), D, C, U, V);
      throw D = String(m), Error("Objects are not valid as a React child (found: " + (D === "[object Object]" ? "object with keys {" + Object.keys(m).join(", ") + "}" : D) + "). If you meant to render a collection of children, use an array instead.");
    }
    return te;
  }
  function R(m, D, C) {
    if (m == null) return m;
    var U = [], V = 0;
    return A(m, U, "", "", function(Q) {
      return D.call(C, Q, V++);
    }), U;
  }
  function G(m) {
    if (m._status === -1) {
      var D = m._result;
      D = D(), D.then(function(C) {
        (m._status === 0 || m._status === -1) && (m._status = 1, m._result = C);
      }, function(C) {
        (m._status === 0 || m._status === -1) && (m._status = 2, m._result = C);
      }), m._status === -1 && (m._status = 0, m._result = D);
    }
    if (m._status === 1) return m._result.default;
    throw m._result;
  }
  var ce = typeof reportError == "function" ? reportError : function(m) {
    if (typeof window == "object" && typeof window.ErrorEvent == "function") {
      var D = new window.ErrorEvent("error", { bubbles: true, cancelable: true, message: typeof m == "object" && m !== null && typeof m.message == "string" ? String(m.message) : String(m), error: m });
      if (!window.dispatchEvent(D)) return;
    } else if (typeof process == "object" && typeof process.emit == "function") {
      process.emit("uncaughtException", m);
      return;
    }
    console.error(m);
  }, ie = { map: R, forEach: function(m, D, C) {
    R(m, function() {
      D.apply(this, arguments);
    }, C);
  }, count: function(m) {
    var D = 0;
    return R(m, function() {
      D++;
    }), D;
  }, toArray: function(m) {
    return R(m, function(D) {
      return D;
    }) || [];
  }, only: function(m) {
    if (!yt(m)) throw Error("React.Children.only expected to receive a single React element child.");
    return m;
  } };
  return react_production.Activity = z, react_production.Children = ie, react_production.Component = We, react_production.Fragment = l, react_production.Profiler = o, react_production.PureComponent = Re, react_production.StrictMode = _, react_production.Suspense = x, react_production.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = J, react_production.__COMPILER_RUNTIME = { __proto__: null, c: function(m) {
    return J.H.useMemoCache(m);
  } }, react_production.cache = function(m) {
    return function() {
      return m.apply(null, arguments);
    };
  }, react_production.cacheSignal = function() {
    return null;
  }, react_production.cloneElement = function(m, D, C) {
    if (m == null) throw Error("The argument must be a React element, but you passed " + m + ".");
    var U = He({}, m.props), V = m.key;
    if (D != null) for (Q in D.key !== void 0 && (V = "" + D.key), D) !Be.call(D, Q) || Q === "key" || Q === "__self" || Q === "__source" || Q === "ref" && D.ref === void 0 || (U[Q] = D[Q]);
    var Q = arguments.length - 2;
    if (Q === 1) U.children = C;
    else if (1 < Q) {
      for (var te = Array(Q), ze = 0; ze < Q; ze++) te[ze] = arguments[ze + 2];
      U.children = te;
    }
    return jt(m.type, V, U);
  }, react_production.createContext = function(m) {
    return m = { $$typeof: j, _currentValue: m, _currentValue2: m, _threadCount: 0, Provider: null, Consumer: null }, m.Provider = m, m.Consumer = { $$typeof: s, _context: m }, m;
  }, react_production.createElement = function(m, D, C) {
    var U, V = {}, Q = null;
    if (D != null) for (U in D.key !== void 0 && (Q = "" + D.key), D) Be.call(D, U) && U !== "key" && U !== "__self" && U !== "__source" && (V[U] = D[U]);
    var te = arguments.length - 2;
    if (te === 1) V.children = C;
    else if (1 < te) {
      for (var ze = Array(te), ge = 0; ge < te; ge++) ze[ge] = arguments[ge + 2];
      V.children = ze;
    }
    if (m && m.defaultProps) for (U in te = m.defaultProps, te) V[U] === void 0 && (V[U] = te[U]);
    return jt(m, Q, V);
  }, react_production.createRef = function() {
    return { current: null };
  }, react_production.forwardRef = function(m) {
    return { $$typeof: S, render: m };
  }, react_production.isValidElement = yt, react_production.lazy = function(m) {
    return { $$typeof: H, _payload: { _status: -1, _result: m }, _init: G };
  }, react_production.memo = function(m, D) {
    return { $$typeof: p, type: m, compare: D === void 0 ? null : D };
  }, react_production.startTransition = function(m) {
    var D = J.T, C = {};
    J.T = C;
    try {
      var U = m(), V = J.S;
      V !== null && V(C, U), typeof U == "object" && U !== null && typeof U.then == "function" && U.then(Ue, ce);
    } catch (Q) {
      ce(Q);
    } finally {
      D !== null && C.types !== null && (D.types = C.types), J.T = D;
    }
  }, react_production.unstable_useCacheRefresh = function() {
    return J.H.useCacheRefresh();
  }, react_production.use = function(m) {
    return J.H.use(m);
  }, react_production.useActionState = function(m, D, C) {
    return J.H.useActionState(m, D, C);
  }, react_production.useCallback = function(m, D) {
    return J.H.useCallback(m, D);
  }, react_production.useContext = function(m) {
    return J.H.useContext(m);
  }, react_production.useDebugValue = function() {
  }, react_production.useDeferredValue = function(m, D) {
    return J.H.useDeferredValue(m, D);
  }, react_production.useEffect = function(m, D) {
    return J.H.useEffect(m, D);
  }, react_production.useEffectEvent = function(m) {
    return J.H.useEffectEvent(m);
  }, react_production.useId = function() {
    return J.H.useId();
  }, react_production.useImperativeHandle = function(m, D, C) {
    return J.H.useImperativeHandle(m, D, C);
  }, react_production.useInsertionEffect = function(m, D) {
    return J.H.useInsertionEffect(m, D);
  }, react_production.useLayoutEffect = function(m, D) {
    return J.H.useLayoutEffect(m, D);
  }, react_production.useMemo = function(m, D) {
    return J.H.useMemo(m, D);
  }, react_production.useOptimistic = function(m, D) {
    return J.H.useOptimistic(m, D);
  }, react_production.useReducer = function(m, D, C) {
    return J.H.useReducer(m, D, C);
  }, react_production.useRef = function(m) {
    return J.H.useRef(m);
  }, react_production.useState = function(m) {
    return J.H.useState(m);
  }, react_production.useSyncExternalStore = function(m, D, C) {
    return J.H.useSyncExternalStore(m, D, C);
  }, react_production.useTransition = function() {
    return J.H.useTransition();
  }, react_production.version = "19.2.4", react_production;
}
var hasRequiredReact;
function requireReact() {
  return hasRequiredReact || (hasRequiredReact = 1, react.exports = requireReact_production()), react.exports;
}
var reactExports = requireReact();
const React = getDefaultExportFromCjs(reactExports);
var client = { exports: {} }, reactDomClient_production = {}, scheduler = { exports: {} }, scheduler_production = {};
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
  return hasRequiredScheduler_production || (hasRequiredScheduler_production = 1, (function(n) {
    function a(A, R) {
      var G = A.length;
      A.push(R);
      e: for (; 0 < G; ) {
        var ce = G - 1 >>> 1, ie = A[ce];
        if (0 < o(ie, R)) A[ce] = R, A[G] = ie, G = ce;
        else break e;
      }
    }
    function l(A) {
      return A.length === 0 ? null : A[0];
    }
    function _(A) {
      if (A.length === 0) return null;
      var R = A[0], G = A.pop();
      if (G !== R) {
        A[0] = G;
        e: for (var ce = 0, ie = A.length, m = ie >>> 1; ce < m; ) {
          var D = 2 * (ce + 1) - 1, C = A[D], U = D + 1, V = A[U];
          if (0 > o(C, G)) U < ie && 0 > o(V, C) ? (A[ce] = V, A[U] = G, ce = U) : (A[ce] = C, A[D] = G, ce = D);
          else if (U < ie && 0 > o(V, G)) A[ce] = V, A[U] = G, ce = U;
          else break e;
        }
      }
      return R;
    }
    function o(A, R) {
      var G = A.sortIndex - R.sortIndex;
      return G !== 0 ? G : A.id - R.id;
    }
    if (n.unstable_now = void 0, typeof performance == "object" && typeof performance.now == "function") {
      var s = performance;
      n.unstable_now = function() {
        return s.now();
      };
    } else {
      var j = Date, S = j.now();
      n.unstable_now = function() {
        return j.now() - S;
      };
    }
    var x = [], p = [], H = 1, z = null, I = 3, Ce = false, De = false, He = false, xt = false, We = typeof setTimeout == "function" ? setTimeout : null, Zt = typeof clearTimeout == "function" ? clearTimeout : null, Re = typeof setImmediate < "u" ? setImmediate : null;
    function at(A) {
      for (var R = l(p); R !== null; ) {
        if (R.callback === null) _(p);
        else if (R.startTime <= A) _(p), R.sortIndex = R.expirationTime, a(x, R);
        else break;
        R = l(p);
      }
    }
    function pt(A) {
      if (He = false, at(A), !De) if (l(x) !== null) De = true, Ue || (Ue = true, Le());
      else {
        var R = l(p);
        R !== null && dt(pt, R.startTime - A);
      }
    }
    var Ue = false, J = -1, Be = 5, jt = -1;
    function Ln() {
      return xt ? true : !(n.unstable_now() - jt < Be);
    }
    function yt() {
      if (xt = false, Ue) {
        var A = n.unstable_now();
        jt = A;
        var R = true;
        try {
          e: {
            De = false, He && (He = false, Zt(J), J = -1), Ce = true;
            var G = I;
            try {
              t: {
                for (at(A), z = l(x); z !== null && !(z.expirationTime > A && Ln()); ) {
                  var ce = z.callback;
                  if (typeof ce == "function") {
                    z.callback = null, I = z.priorityLevel;
                    var ie = ce(z.expirationTime <= A);
                    if (A = n.unstable_now(), typeof ie == "function") {
                      z.callback = ie, at(A), R = true;
                      break t;
                    }
                    z === l(x) && _(x), at(A);
                  } else _(x);
                  z = l(x);
                }
                if (z !== null) R = true;
                else {
                  var m = l(p);
                  m !== null && dt(pt, m.startTime - A), R = false;
                }
              }
              break e;
            } finally {
              z = null, I = G, Ce = false;
            }
            R = void 0;
          }
        } finally {
          R ? Le() : Ue = false;
        }
      }
    }
    var Le;
    if (typeof Re == "function") Le = function() {
      Re(yt);
    };
    else if (typeof MessageChannel < "u") {
      var pn = new MessageChannel(), Et = pn.port2;
      pn.port1.onmessage = yt, Le = function() {
        Et.postMessage(null);
      };
    } else Le = function() {
      We(yt, 0);
    };
    function dt(A, R) {
      J = We(function() {
        A(n.unstable_now());
      }, R);
    }
    n.unstable_IdlePriority = 5, n.unstable_ImmediatePriority = 1, n.unstable_LowPriority = 4, n.unstable_NormalPriority = 3, n.unstable_Profiling = null, n.unstable_UserBlockingPriority = 2, n.unstable_cancelCallback = function(A) {
      A.callback = null;
    }, n.unstable_forceFrameRate = function(A) {
      0 > A || 125 < A ? console.error("forceFrameRate takes a positive int between 0 and 125, forcing frame rates higher than 125 fps is not supported") : Be = 0 < A ? Math.floor(1e3 / A) : 5;
    }, n.unstable_getCurrentPriorityLevel = function() {
      return I;
    }, n.unstable_next = function(A) {
      switch (I) {
        case 1:
        case 2:
        case 3:
          var R = 3;
          break;
        default:
          R = I;
      }
      var G = I;
      I = R;
      try {
        return A();
      } finally {
        I = G;
      }
    }, n.unstable_requestPaint = function() {
      xt = true;
    }, n.unstable_runWithPriority = function(A, R) {
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
      var G = I;
      I = A;
      try {
        return R();
      } finally {
        I = G;
      }
    }, n.unstable_scheduleCallback = function(A, R, G) {
      var ce = n.unstable_now();
      switch (typeof G == "object" && G !== null ? (G = G.delay, G = typeof G == "number" && 0 < G ? ce + G : ce) : G = ce, A) {
        case 1:
          var ie = -1;
          break;
        case 2:
          ie = 250;
          break;
        case 5:
          ie = 1073741823;
          break;
        case 4:
          ie = 1e4;
          break;
        default:
          ie = 5e3;
      }
      return ie = G + ie, A = { id: H++, callback: R, priorityLevel: A, startTime: G, expirationTime: ie, sortIndex: -1 }, G > ce ? (A.sortIndex = G, a(p, A), l(x) === null && A === l(p) && (He ? (Zt(J), J = -1) : He = true, dt(pt, G - ce))) : (A.sortIndex = ie, a(x, A), De || Ce || (De = true, Ue || (Ue = true, Le()))), A;
    }, n.unstable_shouldYield = Ln, n.unstable_wrapCallback = function(A) {
      var R = I;
      return function() {
        var G = I;
        I = R;
        try {
          return A.apply(this, arguments);
        } finally {
          I = G;
        }
      };
    };
  })(scheduler_production)), scheduler_production;
}
var hasRequiredScheduler;
function requireScheduler() {
  return hasRequiredScheduler || (hasRequiredScheduler = 1, scheduler.exports = requireScheduler_production()), scheduler.exports;
}
var reactDom = { exports: {} }, reactDom_production = {};
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
  var n = requireReact();
  function a(x) {
    var p = "https://react.dev/errors/" + x;
    if (1 < arguments.length) {
      p += "?args[]=" + encodeURIComponent(arguments[1]);
      for (var H = 2; H < arguments.length; H++) p += "&args[]=" + encodeURIComponent(arguments[H]);
    }
    return "Minified React error #" + x + "; visit " + p + " for the full message or use the non-minified dev environment for full errors and additional helpful warnings.";
  }
  function l() {
  }
  var _ = { d: { f: l, r: function() {
    throw Error(a(522));
  }, D: l, C: l, L: l, m: l, X: l, S: l, M: l }, p: 0, findDOMNode: null }, o = Symbol.for("react.portal");
  function s(x, p, H) {
    var z = 3 < arguments.length && arguments[3] !== void 0 ? arguments[3] : null;
    return { $$typeof: o, key: z == null ? null : "" + z, children: x, containerInfo: p, implementation: H };
  }
  var j = n.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  function S(x, p) {
    if (x === "font") return "";
    if (typeof p == "string") return p === "use-credentials" ? p : "";
  }
  return reactDom_production.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = _, reactDom_production.createPortal = function(x, p) {
    var H = 2 < arguments.length && arguments[2] !== void 0 ? arguments[2] : null;
    if (!p || p.nodeType !== 1 && p.nodeType !== 9 && p.nodeType !== 11) throw Error(a(299));
    return s(x, p, null, H);
  }, reactDom_production.flushSync = function(x) {
    var p = j.T, H = _.p;
    try {
      if (j.T = null, _.p = 2, x) return x();
    } finally {
      j.T = p, _.p = H, _.d.f();
    }
  }, reactDom_production.preconnect = function(x, p) {
    typeof x == "string" && (p ? (p = p.crossOrigin, p = typeof p == "string" ? p === "use-credentials" ? p : "" : void 0) : p = null, _.d.C(x, p));
  }, reactDom_production.prefetchDNS = function(x) {
    typeof x == "string" && _.d.D(x);
  }, reactDom_production.preinit = function(x, p) {
    if (typeof x == "string" && p && typeof p.as == "string") {
      var H = p.as, z = S(H, p.crossOrigin), I = typeof p.integrity == "string" ? p.integrity : void 0, Ce = typeof p.fetchPriority == "string" ? p.fetchPriority : void 0;
      H === "style" ? _.d.S(x, typeof p.precedence == "string" ? p.precedence : void 0, { crossOrigin: z, integrity: I, fetchPriority: Ce }) : H === "script" && _.d.X(x, { crossOrigin: z, integrity: I, fetchPriority: Ce, nonce: typeof p.nonce == "string" ? p.nonce : void 0 });
    }
  }, reactDom_production.preinitModule = function(x, p) {
    if (typeof x == "string") if (typeof p == "object" && p !== null) {
      if (p.as == null || p.as === "script") {
        var H = S(p.as, p.crossOrigin);
        _.d.M(x, { crossOrigin: H, integrity: typeof p.integrity == "string" ? p.integrity : void 0, nonce: typeof p.nonce == "string" ? p.nonce : void 0 });
      }
    } else p == null && _.d.M(x);
  }, reactDom_production.preload = function(x, p) {
    if (typeof x == "string" && typeof p == "object" && p !== null && typeof p.as == "string") {
      var H = p.as, z = S(H, p.crossOrigin);
      _.d.L(x, H, { crossOrigin: z, integrity: typeof p.integrity == "string" ? p.integrity : void 0, nonce: typeof p.nonce == "string" ? p.nonce : void 0, type: typeof p.type == "string" ? p.type : void 0, fetchPriority: typeof p.fetchPriority == "string" ? p.fetchPriority : void 0, referrerPolicy: typeof p.referrerPolicy == "string" ? p.referrerPolicy : void 0, imageSrcSet: typeof p.imageSrcSet == "string" ? p.imageSrcSet : void 0, imageSizes: typeof p.imageSizes == "string" ? p.imageSizes : void 0, media: typeof p.media == "string" ? p.media : void 0 });
    }
  }, reactDom_production.preloadModule = function(x, p) {
    if (typeof x == "string") if (p) {
      var H = S(p.as, p.crossOrigin);
      _.d.m(x, { as: typeof p.as == "string" && p.as !== "script" ? p.as : void 0, crossOrigin: H, integrity: typeof p.integrity == "string" ? p.integrity : void 0 });
    } else _.d.m(x);
  }, reactDom_production.requestFormReset = function(x) {
    _.d.r(x);
  }, reactDom_production.unstable_batchedUpdates = function(x, p) {
    return x(p);
  }, reactDom_production.useFormState = function(x, p, H) {
    return j.H.useFormState(x, p, H);
  }, reactDom_production.useFormStatus = function() {
    return j.H.useHostTransitionStatus();
  }, reactDom_production.version = "19.2.4", reactDom_production;
}
var hasRequiredReactDom;
function requireReactDom() {
  if (hasRequiredReactDom) return reactDom.exports;
  hasRequiredReactDom = 1;
  function n() {
    if (!(typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ > "u" || typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE != "function")) try {
      __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(n);
    } catch (a) {
      console.error(a);
    }
  }
  return n(), reactDom.exports = requireReactDom_production(), reactDom.exports;
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
  var n = requireScheduler(), a = requireReact(), l = requireReactDom();
  function _(e) {
    var t = "https://react.dev/errors/" + e;
    if (1 < arguments.length) {
      t += "?args[]=" + encodeURIComponent(arguments[1]);
      for (var c = 2; c < arguments.length; c++) t += "&args[]=" + encodeURIComponent(arguments[c]);
    }
    return "Minified React error #" + e + "; visit " + t + " for the full message or use the non-minified dev environment for full errors and additional helpful warnings.";
  }
  function o(e) {
    return !(!e || e.nodeType !== 1 && e.nodeType !== 9 && e.nodeType !== 11);
  }
  function s(e) {
    var t = e, c = e;
    if (e.alternate) for (; t.return; ) t = t.return;
    else {
      e = t;
      do
        t = e, (t.flags & 4098) !== 0 && (c = t.return), e = t.return;
      while (e);
    }
    return t.tag === 3 ? c : null;
  }
  function j(e) {
    if (e.tag === 13) {
      var t = e.memoizedState;
      if (t === null && (e = e.alternate, e !== null && (t = e.memoizedState)), t !== null) return t.dehydrated;
    }
    return null;
  }
  function S(e) {
    if (e.tag === 31) {
      var t = e.memoizedState;
      if (t === null && (e = e.alternate, e !== null && (t = e.memoizedState)), t !== null) return t.dehydrated;
    }
    return null;
  }
  function x(e) {
    if (s(e) !== e) throw Error(_(188));
  }
  function p(e) {
    var t = e.alternate;
    if (!t) {
      if (t = s(e), t === null) throw Error(_(188));
      return t !== e ? null : e;
    }
    for (var c = e, u = t; ; ) {
      var r = c.return;
      if (r === null) break;
      var i = r.alternate;
      if (i === null) {
        if (u = r.return, u !== null) {
          c = u;
          continue;
        }
        break;
      }
      if (r.child === i.child) {
        for (i = r.child; i; ) {
          if (i === c) return x(r), e;
          if (i === u) return x(r), t;
          i = i.sibling;
        }
        throw Error(_(188));
      }
      if (c.return !== u.return) c = r, u = i;
      else {
        for (var f = false, b = r.child; b; ) {
          if (b === c) {
            f = true, c = r, u = i;
            break;
          }
          if (b === u) {
            f = true, u = r, c = i;
            break;
          }
          b = b.sibling;
        }
        if (!f) {
          for (b = i.child; b; ) {
            if (b === c) {
              f = true, c = i, u = r;
              break;
            }
            if (b === u) {
              f = true, u = i, c = r;
              break;
            }
            b = b.sibling;
          }
          if (!f) throw Error(_(189));
        }
      }
      if (c.alternate !== u) throw Error(_(190));
    }
    if (c.tag !== 3) throw Error(_(188));
    return c.stateNode.current === c ? e : t;
  }
  function H(e) {
    var t = e.tag;
    if (t === 5 || t === 26 || t === 27 || t === 6) return e;
    for (e = e.child; e !== null; ) {
      if (t = H(e), t !== null) return t;
      e = e.sibling;
    }
    return null;
  }
  var z = Object.assign, I = Symbol.for("react.element"), Ce = Symbol.for("react.transitional.element"), De = Symbol.for("react.portal"), He = Symbol.for("react.fragment"), xt = Symbol.for("react.strict_mode"), We = Symbol.for("react.profiler"), Zt = Symbol.for("react.consumer"), Re = Symbol.for("react.context"), at = Symbol.for("react.forward_ref"), pt = Symbol.for("react.suspense"), Ue = Symbol.for("react.suspense_list"), J = Symbol.for("react.memo"), Be = Symbol.for("react.lazy"), jt = Symbol.for("react.activity"), Ln = Symbol.for("react.memo_cache_sentinel"), yt = Symbol.iterator;
  function Le(e) {
    return e === null || typeof e != "object" ? null : (e = yt && e[yt] || e["@@iterator"], typeof e == "function" ? e : null);
  }
  var pn = Symbol.for("react.client.reference");
  function Et(e) {
    if (e == null) return null;
    if (typeof e == "function") return e.$$typeof === pn ? null : e.displayName || e.name || null;
    if (typeof e == "string") return e;
    switch (e) {
      case He:
        return "Fragment";
      case We:
        return "Profiler";
      case xt:
        return "StrictMode";
      case pt:
        return "Suspense";
      case Ue:
        return "SuspenseList";
      case jt:
        return "Activity";
    }
    if (typeof e == "object") switch (e.$$typeof) {
      case De:
        return "Portal";
      case Re:
        return e.displayName || "Context";
      case Zt:
        return (e._context.displayName || "Context") + ".Consumer";
      case at:
        var t = e.render;
        return e = e.displayName, e || (e = t.displayName || t.name || "", e = e !== "" ? "ForwardRef(" + e + ")" : "ForwardRef"), e;
      case J:
        return t = e.displayName || null, t !== null ? t : Et(e.type) || "Memo";
      case Be:
        t = e._payload, e = e._init;
        try {
          return Et(e(t));
        } catch {
        }
    }
    return null;
  }
  var dt = Array.isArray, A = a.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, R = l.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, G = { pending: false, data: null, method: null, action: null }, ce = [], ie = -1;
  function m(e) {
    return { current: e };
  }
  function D(e) {
    0 > ie || (e.current = ce[ie], ce[ie] = null, ie--);
  }
  function C(e, t) {
    ie++, ce[ie] = e.current, e.current = t;
  }
  var U = m(null), V = m(null), Q = m(null), te = m(null);
  function ze(e, t) {
    switch (C(Q, t), C(V, e), C(U, null), t.nodeType) {
      case 9:
      case 11:
        e = (e = t.documentElement) && (e = e.namespaceURI) ? So(e) : 0;
        break;
      default:
        if (e = t.tagName, t = t.namespaceURI) t = So(t), e = xo(t, e);
        else switch (e) {
          case "svg":
            e = 1;
            break;
          case "math":
            e = 2;
            break;
          default:
            e = 0;
        }
    }
    D(U), C(U, e);
  }
  function ge() {
    D(U), D(V), D(Q);
  }
  function va(e) {
    e.memoizedState !== null && C(te, e);
    var t = U.current, c = xo(t, e.type);
    t !== c && (C(V, e), C(U, c));
  }
  function mc(e) {
    V.current === e && (D(U), D(V)), te.current === e && (D(te), bc._currentValue = G);
  }
  var zu, $r;
  function jn(e) {
    if (zu === void 0) try {
      throw Error();
    } catch (c) {
      var t = c.stack.trim().match(/\n( *(at )?)/);
      zu = t && t[1] || "", $r = -1 < c.stack.indexOf(`
    at`) ? " (<anonymous>)" : -1 < c.stack.indexOf("@") ? "@unknown:0:0" : "";
    }
    return `
` + zu + e + $r;
  }
  var Nu = false;
  function Uu(e, t) {
    if (!e || Nu) return "";
    Nu = true;
    var c = Error.prepareStackTrace;
    Error.prepareStackTrace = void 0;
    try {
      var u = { DetermineComponentFrameRoot: function() {
        try {
          if (t) {
            var M = function() {
              throw Error();
            };
            if (Object.defineProperty(M.prototype, "props", { set: function() {
              throw Error();
            } }), typeof Reflect == "object" && Reflect.construct) {
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
            (M = e()) && typeof M.catch == "function" && M.catch(function() {
            });
          }
        } catch (v) {
          if (v && h && typeof v.stack == "string") return [v.stack, h.stack];
        }
        return [null, null];
      } };
      u.DetermineComponentFrameRoot.displayName = "DetermineComponentFrameRoot";
      var r = Object.getOwnPropertyDescriptor(u.DetermineComponentFrameRoot, "name");
      r && r.configurable && Object.defineProperty(u.DetermineComponentFrameRoot, "name", { value: "DetermineComponentFrameRoot" });
      var i = u.DetermineComponentFrameRoot(), f = i[0], b = i[1];
      if (f && b) {
        var d = f.split(`
`), w = b.split(`
`);
        for (r = u = 0; u < d.length && !d[u].includes("DetermineComponentFrameRoot"); ) u++;
        for (; r < w.length && !w[r].includes("DetermineComponentFrameRoot"); ) r++;
        if (u === d.length || r === w.length) for (u = d.length - 1, r = w.length - 1; 1 <= u && 0 <= r && d[u] !== w[r]; ) r--;
        for (; 1 <= u && 0 <= r; u--, r--) if (d[u] !== w[r]) {
          if (u !== 1 || r !== 1) do
            if (u--, r--, 0 > r || d[u] !== w[r]) {
              var E = `
` + d[u].replace(" at new ", " at ");
              return e.displayName && E.includes("<anonymous>") && (E = E.replace("<anonymous>", e.displayName)), E;
            }
          while (1 <= u && 0 <= r);
          break;
        }
      }
    } finally {
      Nu = false, Error.prepareStackTrace = c;
    }
    return (c = e ? e.displayName || e.name : "") ? jn(c) : "";
  }
  function tb(e, t) {
    switch (e.tag) {
      case 26:
      case 27:
      case 5:
        return jn(e.type);
      case 16:
        return jn("Lazy");
      case 13:
        return e.child !== t && t !== null ? jn("Suspense Fallback") : jn("Suspense");
      case 19:
        return jn("SuspenseList");
      case 0:
      case 15:
        return Uu(e.type, false);
      case 11:
        return Uu(e.type.render, false);
      case 1:
        return Uu(e.type, true);
      case 31:
        return jn("Activity");
      default:
        return "";
    }
  }
  function Pr(e) {
    try {
      var t = "", c = null;
      do
        t += tb(e, c), c = e, e = e.return;
      while (e);
      return t;
    } catch (u) {
      return `
Error generating stack: ` + u.message + `
` + u.stack;
    }
  }
  var Bu = Object.prototype.hasOwnProperty, Lu = n.unstable_scheduleCallback, qu = n.unstable_cancelCallback, nb = n.unstable_shouldYield, ab = n.unstable_requestPaint, Fe = n.unstable_now, cb = n.unstable_getCurrentPriorityLevel, ei = n.unstable_ImmediatePriority, ti = n.unstable_UserBlockingPriority, Oc = n.unstable_NormalPriority, ub = n.unstable_LowPriority, ni = n.unstable_IdlePriority, lb = n.log, rb = n.unstable_setDisableYieldValue, Sa = null, Ke = null;
  function Wt(e) {
    if (typeof lb == "function" && rb(e), Ke && typeof Ke.setStrictMode == "function") try {
      Ke.setStrictMode(Sa, e);
    } catch {
    }
  }
  var Je = Math.clz32 ? Math.clz32 : fb, ib = Math.log, _b = Math.LN2;
  function fb(e) {
    return e >>>= 0, e === 0 ? 32 : 31 - (ib(e) / _b | 0) | 0;
  }
  var pc = 256, jc = 262144, yc = 4194304;
  function yn(e) {
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
  function wc(e, t, c) {
    var u = e.pendingLanes;
    if (u === 0) return 0;
    var r = 0, i = e.suspendedLanes, f = e.pingedLanes;
    e = e.warmLanes;
    var b = u & 134217727;
    return b !== 0 ? (u = b & ~i, u !== 0 ? r = yn(u) : (f &= b, f !== 0 ? r = yn(f) : c || (c = b & ~e, c !== 0 && (r = yn(c))))) : (b = u & ~i, b !== 0 ? r = yn(b) : f !== 0 ? r = yn(f) : c || (c = u & ~e, c !== 0 && (r = yn(c)))), r === 0 ? 0 : t !== 0 && t !== r && (t & i) === 0 && (i = r & -r, c = t & -t, i >= c || i === 32 && (c & 4194048) !== 0) ? t : r;
  }
  function xa(e, t) {
    return (e.pendingLanes & ~(e.suspendedLanes & ~e.pingedLanes) & t) === 0;
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
  function ai() {
    var e = yc;
    return yc <<= 1, (yc & 62914560) === 0 && (yc = 4194304), e;
  }
  function Gu(e) {
    for (var t = [], c = 0; 31 > c; c++) t.push(e);
    return t;
  }
  function Ea(e, t) {
    e.pendingLanes |= t, t !== 268435456 && (e.suspendedLanes = 0, e.pingedLanes = 0, e.warmLanes = 0);
  }
  function bb(e, t, c, u, r, i) {
    var f = e.pendingLanes;
    e.pendingLanes = c, e.suspendedLanes = 0, e.pingedLanes = 0, e.warmLanes = 0, e.expiredLanes &= c, e.entangledLanes &= c, e.errorRecoveryDisabledLanes &= c, e.shellSuspendCounter = 0;
    var b = e.entanglements, d = e.expirationTimes, w = e.hiddenUpdates;
    for (c = f & ~c; 0 < c; ) {
      var E = 31 - Je(c), M = 1 << E;
      b[E] = 0, d[E] = -1;
      var h = w[E];
      if (h !== null) for (w[E] = null, E = 0; E < h.length; E++) {
        var v = h[E];
        v !== null && (v.lane &= -536870913);
      }
      c &= ~M;
    }
    u !== 0 && ci(e, u, 0), i !== 0 && r === 0 && e.tag !== 0 && (e.suspendedLanes |= i & ~(f & ~t));
  }
  function ci(e, t, c) {
    e.pendingLanes |= t, e.suspendedLanes &= ~t;
    var u = 31 - Je(t);
    e.entangledLanes |= t, e.entanglements[u] = e.entanglements[u] | 1073741824 | c & 261930;
  }
  function ui(e, t) {
    var c = e.entangledLanes |= t;
    for (e = e.entanglements; c; ) {
      var u = 31 - Je(c), r = 1 << u;
      r & t | e[u] & t && (e[u] |= t), c &= ~r;
    }
  }
  function li(e, t) {
    var c = t & -t;
    return c = (c & 42) !== 0 ? 1 : Vu(c), (c & (e.suspendedLanes | t)) !== 0 ? 0 : c;
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
    return e &= -e, 2 < e ? 8 < e ? (e & 134217727) !== 0 ? 32 : 268435456 : 8 : 2;
  }
  function ri() {
    var e = R.p;
    return e !== 0 ? e : (e = window.event, e === void 0 ? 32 : Ko(e.type));
  }
  function ii(e, t) {
    var c = R.p;
    try {
      return R.p = e, t();
    } finally {
      R.p = c;
    }
  }
  var Ft = Math.random().toString(36).slice(2), xe = "__reactFiber$" + Ft, qe = "__reactProps$" + Ft, qn = "__reactContainer$" + Ft, Xu = "__reactEvents$" + Ft, sb = "__reactListeners$" + Ft, db = "__reactHandles$" + Ft, _i = "__reactResources$" + Ft, Aa = "__reactMarker$" + Ft;
  function Qu(e) {
    delete e[xe], delete e[qe], delete e[Xu], delete e[sb], delete e[db];
  }
  function Gn(e) {
    var t = e[xe];
    if (t) return t;
    for (var c = e.parentNode; c; ) {
      if (t = c[qn] || c[xe]) {
        if (c = t.alternate, t.child !== null || c !== null && c.child !== null) for (e = Co(e); e !== null; ) {
          if (c = e[xe]) return c;
          e = Co(e);
        }
        return t;
      }
      e = c, c = e.parentNode;
    }
    return null;
  }
  function Vn(e) {
    if (e = e[xe] || e[qn]) {
      var t = e.tag;
      if (t === 5 || t === 6 || t === 13 || t === 31 || t === 26 || t === 27 || t === 3) return e;
    }
    return null;
  }
  function Ta(e) {
    var t = e.tag;
    if (t === 5 || t === 26 || t === 27 || t === 6) return e.stateNode;
    throw Error(_(33));
  }
  function Yn(e) {
    var t = e[_i];
    return t || (t = e[_i] = { hoistableStyles: /* @__PURE__ */ new Map(), hoistableScripts: /* @__PURE__ */ new Map() }), t;
  }
  function ve(e) {
    e[Aa] = true;
  }
  var fi = /* @__PURE__ */ new Set(), oi = {};
  function wn(e, t) {
    Xn(e, t), Xn(e + "Capture", t);
  }
  function Xn(e, t) {
    for (oi[e] = t, e = 0; e < t.length; e++) fi.add(t[e]);
  }
  var gb = RegExp("^[:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD][:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040]*$"), bi = {}, si = {};
  function mb(e) {
    return Bu.call(si, e) ? true : Bu.call(bi, e) ? false : gb.test(e) ? si[e] = true : (bi[e] = true, false);
  }
  function hc(e, t, c) {
    if (mb(t)) if (c === null) e.removeAttribute(t);
    else {
      switch (typeof c) {
        case "undefined":
        case "function":
        case "symbol":
          e.removeAttribute(t);
          return;
        case "boolean":
          var u = t.toLowerCase().slice(0, 5);
          if (u !== "data-" && u !== "aria-") {
            e.removeAttribute(t);
            return;
          }
      }
      e.setAttribute(t, "" + c);
    }
  }
  function vc(e, t, c) {
    if (c === null) e.removeAttribute(t);
    else {
      switch (typeof c) {
        case "undefined":
        case "function":
        case "symbol":
        case "boolean":
          e.removeAttribute(t);
          return;
      }
      e.setAttribute(t, "" + c);
    }
  }
  function At(e, t, c, u) {
    if (u === null) e.removeAttribute(c);
    else {
      switch (typeof u) {
        case "undefined":
        case "function":
        case "symbol":
        case "boolean":
          e.removeAttribute(c);
          return;
      }
      e.setAttributeNS(t, c, "" + u);
    }
  }
  function ct(e) {
    switch (typeof e) {
      case "bigint":
      case "boolean":
      case "number":
      case "string":
      case "undefined":
        return e;
      case "object":
        return e;
      default:
        return "";
    }
  }
  function di(e) {
    var t = e.type;
    return (e = e.nodeName) && e.toLowerCase() === "input" && (t === "checkbox" || t === "radio");
  }
  function Ob(e, t, c) {
    var u = Object.getOwnPropertyDescriptor(e.constructor.prototype, t);
    if (!e.hasOwnProperty(t) && typeof u < "u" && typeof u.get == "function" && typeof u.set == "function") {
      var r = u.get, i = u.set;
      return Object.defineProperty(e, t, { configurable: true, get: function() {
        return r.call(this);
      }, set: function(f) {
        c = "" + f, i.call(this, f);
      } }), Object.defineProperty(e, t, { enumerable: u.enumerable }), { getValue: function() {
        return c;
      }, setValue: function(f) {
        c = "" + f;
      }, stopTracking: function() {
        e._valueTracker = null, delete e[t];
      } };
    }
  }
  function Zu(e) {
    if (!e._valueTracker) {
      var t = di(e) ? "checked" : "value";
      e._valueTracker = Ob(e, t, "" + e[t]);
    }
  }
  function gi(e) {
    if (!e) return false;
    var t = e._valueTracker;
    if (!t) return true;
    var c = t.getValue(), u = "";
    return e && (u = di(e) ? e.checked ? "true" : "false" : e.value), e = u, e !== c ? (t.setValue(e), true) : false;
  }
  function Sc(e) {
    if (e = e || (typeof document < "u" ? document : void 0), typeof e > "u") return null;
    try {
      return e.activeElement || e.body;
    } catch {
      return e.body;
    }
  }
  var pb = /[\n"\\]/g;
  function ut(e) {
    return e.replace(pb, function(t) {
      return "\\" + t.charCodeAt(0).toString(16) + " ";
    });
  }
  function Wu(e, t, c, u, r, i, f, b) {
    e.name = "", f != null && typeof f != "function" && typeof f != "symbol" && typeof f != "boolean" ? e.type = f : e.removeAttribute("type"), t != null ? f === "number" ? (t === 0 && e.value === "" || e.value != t) && (e.value = "" + ct(t)) : e.value !== "" + ct(t) && (e.value = "" + ct(t)) : f !== "submit" && f !== "reset" || e.removeAttribute("value"), t != null ? Fu(e, f, ct(t)) : c != null ? Fu(e, f, ct(c)) : u != null && e.removeAttribute("value"), r == null && i != null && (e.defaultChecked = !!i), r != null && (e.checked = r && typeof r != "function" && typeof r != "symbol"), b != null && typeof b != "function" && typeof b != "symbol" && typeof b != "boolean" ? e.name = "" + ct(b) : e.removeAttribute("name");
  }
  function mi(e, t, c, u, r, i, f, b) {
    if (i != null && typeof i != "function" && typeof i != "symbol" && typeof i != "boolean" && (e.type = i), t != null || c != null) {
      if (!(i !== "submit" && i !== "reset" || t != null)) {
        Zu(e);
        return;
      }
      c = c != null ? "" + ct(c) : "", t = t != null ? "" + ct(t) : c, b || t === e.value || (e.value = t), e.defaultValue = t;
    }
    u = u ?? r, u = typeof u != "function" && typeof u != "symbol" && !!u, e.checked = b ? e.checked : !!u, e.defaultChecked = !!u, f != null && typeof f != "function" && typeof f != "symbol" && typeof f != "boolean" && (e.name = f), Zu(e);
  }
  function Fu(e, t, c) {
    t === "number" && Sc(e.ownerDocument) === e || e.defaultValue === "" + c || (e.defaultValue = "" + c);
  }
  function Qn(e, t, c, u) {
    if (e = e.options, t) {
      t = {};
      for (var r = 0; r < c.length; r++) t["$" + c[r]] = true;
      for (c = 0; c < e.length; c++) r = t.hasOwnProperty("$" + e[c].value), e[c].selected !== r && (e[c].selected = r), r && u && (e[c].defaultSelected = true);
    } else {
      for (c = "" + ct(c), t = null, r = 0; r < e.length; r++) {
        if (e[r].value === c) {
          e[r].selected = true, u && (e[r].defaultSelected = true);
          return;
        }
        t !== null || e[r].disabled || (t = e[r]);
      }
      t !== null && (t.selected = true);
    }
  }
  function Oi(e, t, c) {
    if (t != null && (t = "" + ct(t), t !== e.value && (e.value = t), c == null)) {
      e.defaultValue !== t && (e.defaultValue = t);
      return;
    }
    e.defaultValue = c != null ? "" + ct(c) : "";
  }
  function pi(e, t, c, u) {
    if (t == null) {
      if (u != null) {
        if (c != null) throw Error(_(92));
        if (dt(u)) {
          if (1 < u.length) throw Error(_(93));
          u = u[0];
        }
        c = u;
      }
      c == null && (c = ""), t = c;
    }
    c = ct(t), e.defaultValue = c, u = e.textContent, u === c && u !== "" && u !== null && (e.value = u), Zu(e);
  }
  function Zn(e, t) {
    if (t) {
      var c = e.firstChild;
      if (c && c === e.lastChild && c.nodeType === 3) {
        c.nodeValue = t;
        return;
      }
    }
    e.textContent = t;
  }
  var jb = new Set("animationIterationCount aspectRatio borderImageOutset borderImageSlice borderImageWidth boxFlex boxFlexGroup boxOrdinalGroup columnCount columns flex flexGrow flexPositive flexShrink flexNegative flexOrder gridArea gridRow gridRowEnd gridRowSpan gridRowStart gridColumn gridColumnEnd gridColumnSpan gridColumnStart fontWeight lineClamp lineHeight opacity order orphans scale tabSize widows zIndex zoom fillOpacity floodOpacity stopOpacity strokeDasharray strokeDashoffset strokeMiterlimit strokeOpacity strokeWidth MozAnimationIterationCount MozBoxFlex MozBoxFlexGroup MozLineClamp msAnimationIterationCount msFlex msZoom msFlexGrow msFlexNegative msFlexOrder msFlexPositive msFlexShrink msGridColumn msGridColumnSpan msGridRow msGridRowSpan WebkitAnimationIterationCount WebkitBoxFlex WebKitBoxFlexGroup WebkitBoxOrdinalGroup WebkitColumnCount WebkitColumns WebkitFlex WebkitFlexGrow WebkitFlexPositive WebkitFlexShrink WebkitLineClamp".split(" "));
  function ji(e, t, c) {
    var u = t.indexOf("--") === 0;
    c == null || typeof c == "boolean" || c === "" ? u ? e.setProperty(t, "") : t === "float" ? e.cssFloat = "" : e[t] = "" : u ? e.setProperty(t, c) : typeof c != "number" || c === 0 || jb.has(t) ? t === "float" ? e.cssFloat = c : e[t] = ("" + c).trim() : e[t] = c + "px";
  }
  function yi(e, t, c) {
    if (t != null && typeof t != "object") throw Error(_(62));
    if (e = e.style, c != null) {
      for (var u in c) !c.hasOwnProperty(u) || t != null && t.hasOwnProperty(u) || (u.indexOf("--") === 0 ? e.setProperty(u, "") : u === "float" ? e.cssFloat = "" : e[u] = "");
      for (var r in t) u = t[r], t.hasOwnProperty(r) && c[r] !== u && ji(e, r, u);
    } else for (var i in t) t.hasOwnProperty(i) && ji(e, i, t[i]);
  }
  function Ku(e) {
    if (e.indexOf("-") === -1) return false;
    switch (e) {
      case "annotation-xml":
      case "color-profile":
      case "font-face":
      case "font-face-src":
      case "font-face-uri":
      case "font-face-format":
      case "font-face-name":
      case "missing-glyph":
        return false;
      default:
        return true;
    }
  }
  var yb = /* @__PURE__ */ new Map([["acceptCharset", "accept-charset"], ["htmlFor", "for"], ["httpEquiv", "http-equiv"], ["crossOrigin", "crossorigin"], ["accentHeight", "accent-height"], ["alignmentBaseline", "alignment-baseline"], ["arabicForm", "arabic-form"], ["baselineShift", "baseline-shift"], ["capHeight", "cap-height"], ["clipPath", "clip-path"], ["clipRule", "clip-rule"], ["colorInterpolation", "color-interpolation"], ["colorInterpolationFilters", "color-interpolation-filters"], ["colorProfile", "color-profile"], ["colorRendering", "color-rendering"], ["dominantBaseline", "dominant-baseline"], ["enableBackground", "enable-background"], ["fillOpacity", "fill-opacity"], ["fillRule", "fill-rule"], ["floodColor", "flood-color"], ["floodOpacity", "flood-opacity"], ["fontFamily", "font-family"], ["fontSize", "font-size"], ["fontSizeAdjust", "font-size-adjust"], ["fontStretch", "font-stretch"], ["fontStyle", "font-style"], ["fontVariant", "font-variant"], ["fontWeight", "font-weight"], ["glyphName", "glyph-name"], ["glyphOrientationHorizontal", "glyph-orientation-horizontal"], ["glyphOrientationVertical", "glyph-orientation-vertical"], ["horizAdvX", "horiz-adv-x"], ["horizOriginX", "horiz-origin-x"], ["imageRendering", "image-rendering"], ["letterSpacing", "letter-spacing"], ["lightingColor", "lighting-color"], ["markerEnd", "marker-end"], ["markerMid", "marker-mid"], ["markerStart", "marker-start"], ["overlinePosition", "overline-position"], ["overlineThickness", "overline-thickness"], ["paintOrder", "paint-order"], ["panose-1", "panose-1"], ["pointerEvents", "pointer-events"], ["renderingIntent", "rendering-intent"], ["shapeRendering", "shape-rendering"], ["stopColor", "stop-color"], ["stopOpacity", "stop-opacity"], ["strikethroughPosition", "strikethrough-position"], ["strikethroughThickness", "strikethrough-thickness"], ["strokeDasharray", "stroke-dasharray"], ["strokeDashoffset", "stroke-dashoffset"], ["strokeLinecap", "stroke-linecap"], ["strokeLinejoin", "stroke-linejoin"], ["strokeMiterlimit", "stroke-miterlimit"], ["strokeOpacity", "stroke-opacity"], ["strokeWidth", "stroke-width"], ["textAnchor", "text-anchor"], ["textDecoration", "text-decoration"], ["textRendering", "text-rendering"], ["transformOrigin", "transform-origin"], ["underlinePosition", "underline-position"], ["underlineThickness", "underline-thickness"], ["unicodeBidi", "unicode-bidi"], ["unicodeRange", "unicode-range"], ["unitsPerEm", "units-per-em"], ["vAlphabetic", "v-alphabetic"], ["vHanging", "v-hanging"], ["vIdeographic", "v-ideographic"], ["vMathematical", "v-mathematical"], ["vectorEffect", "vector-effect"], ["vertAdvY", "vert-adv-y"], ["vertOriginX", "vert-origin-x"], ["vertOriginY", "vert-origin-y"], ["wordSpacing", "word-spacing"], ["writingMode", "writing-mode"], ["xmlnsXlink", "xmlns:xlink"], ["xHeight", "x-height"]]), wb = /^[\u0000-\u001F ]*j[\r\n\t]*a[\r\n\t]*v[\r\n\t]*a[\r\n\t]*s[\r\n\t]*c[\r\n\t]*r[\r\n\t]*i[\r\n\t]*p[\r\n\t]*t[\r\n\t]*:/i;
  function xc(e) {
    return wb.test("" + e) ? "javascript:throw new Error('React has blocked a javascript: URL as a security precaution.')" : e;
  }
  function Tt() {
  }
  var Ju = null;
  function ku(e) {
    return e = e.target || e.srcElement || window, e.correspondingUseElement && (e = e.correspondingUseElement), e.nodeType === 3 ? e.parentNode : e;
  }
  var Wn = null, Fn = null;
  function wi(e) {
    var t = Vn(e);
    if (t && (e = t.stateNode)) {
      var c = e[qe] || null;
      e: switch (e = t.stateNode, t.type) {
        case "input":
          if (Wu(e, c.value, c.defaultValue, c.defaultValue, c.checked, c.defaultChecked, c.type, c.name), t = c.name, c.type === "radio" && t != null) {
            for (c = e; c.parentNode; ) c = c.parentNode;
            for (c = c.querySelectorAll('input[name="' + ut("" + t) + '"][type="radio"]'), t = 0; t < c.length; t++) {
              var u = c[t];
              if (u !== e && u.form === e.form) {
                var r = u[qe] || null;
                if (!r) throw Error(_(90));
                Wu(u, r.value, r.defaultValue, r.defaultValue, r.checked, r.defaultChecked, r.type, r.name);
              }
            }
            for (t = 0; t < c.length; t++) u = c[t], u.form === e.form && gi(u);
          }
          break e;
        case "textarea":
          Oi(e, c.value, c.defaultValue);
          break e;
        case "select":
          t = c.value, t != null && Qn(e, !!c.multiple, t, false);
      }
    }
  }
  var Iu = false;
  function hi(e, t, c) {
    if (Iu) return e(t, c);
    Iu = true;
    try {
      var u = e(t);
      return u;
    } finally {
      if (Iu = false, (Wn !== null || Fn !== null) && (bu(), Wn && (t = Wn, e = Fn, Fn = Wn = null, wi(t), e))) for (t = 0; t < e.length; t++) wi(e[t]);
    }
  }
  function Ma(e, t) {
    var c = e.stateNode;
    if (c === null) return null;
    var u = c[qe] || null;
    if (u === null) return null;
    c = u[t];
    e: switch (t) {
      case "onClick":
      case "onClickCapture":
      case "onDoubleClick":
      case "onDoubleClickCapture":
      case "onMouseDown":
      case "onMouseDownCapture":
      case "onMouseMove":
      case "onMouseMoveCapture":
      case "onMouseUp":
      case "onMouseUpCapture":
      case "onMouseEnter":
        (u = !u.disabled) || (e = e.type, u = !(e === "button" || e === "input" || e === "select" || e === "textarea")), e = !u;
        break e;
      default:
        e = false;
    }
    if (e) return null;
    if (c && typeof c != "function") throw Error(_(231, t, typeof c));
    return c;
  }
  var Mt = !(typeof window > "u" || typeof window.document > "u" || typeof window.document.createElement > "u"), $u = false;
  if (Mt) try {
    var Da = {};
    Object.defineProperty(Da, "passive", { get: function() {
      $u = true;
    } }), window.addEventListener("test", Da, Da), window.removeEventListener("test", Da, Da);
  } catch {
    $u = false;
  }
  var Kt = null, Pu = null, Ec = null;
  function vi() {
    if (Ec) return Ec;
    var e, t = Pu, c = t.length, u, r = "value" in Kt ? Kt.value : Kt.textContent, i = r.length;
    for (e = 0; e < c && t[e] === r[e]; e++) ;
    var f = c - e;
    for (u = 1; u <= f && t[c - u] === r[i - u]; u++) ;
    return Ec = r.slice(e, 1 < u ? 1 - u : void 0);
  }
  function Ac(e) {
    var t = e.keyCode;
    return "charCode" in e ? (e = e.charCode, e === 0 && t === 13 && (e = 13)) : e = t, e === 10 && (e = 13), 32 <= e || e === 13 ? e : 0;
  }
  function Tc() {
    return true;
  }
  function Si() {
    return false;
  }
  function Ge(e) {
    function t(c, u, r, i, f) {
      this._reactName = c, this._targetInst = r, this.type = u, this.nativeEvent = i, this.target = f, this.currentTarget = null;
      for (var b in e) e.hasOwnProperty(b) && (c = e[b], this[b] = c ? c(i) : i[b]);
      return this.isDefaultPrevented = (i.defaultPrevented != null ? i.defaultPrevented : i.returnValue === false) ? Tc : Si, this.isPropagationStopped = Si, this;
    }
    return z(t.prototype, { preventDefault: function() {
      this.defaultPrevented = true;
      var c = this.nativeEvent;
      c && (c.preventDefault ? c.preventDefault() : typeof c.returnValue != "unknown" && (c.returnValue = false), this.isDefaultPrevented = Tc);
    }, stopPropagation: function() {
      var c = this.nativeEvent;
      c && (c.stopPropagation ? c.stopPropagation() : typeof c.cancelBubble != "unknown" && (c.cancelBubble = true), this.isPropagationStopped = Tc);
    }, persist: function() {
    }, isPersistent: Tc }), t;
  }
  var hn = { eventPhase: 0, bubbles: 0, cancelable: 0, timeStamp: function(e) {
    return e.timeStamp || Date.now();
  }, defaultPrevented: 0, isTrusted: 0 }, Mc = Ge(hn), Ra = z({}, hn, { view: 0, detail: 0 }), hb = Ge(Ra), el, tl, Ca, Dc = z({}, Ra, { screenX: 0, screenY: 0, clientX: 0, clientY: 0, pageX: 0, pageY: 0, ctrlKey: 0, shiftKey: 0, altKey: 0, metaKey: 0, getModifierState: al, button: 0, buttons: 0, relatedTarget: function(e) {
    return e.relatedTarget === void 0 ? e.fromElement === e.srcElement ? e.toElement : e.fromElement : e.relatedTarget;
  }, movementX: function(e) {
    return "movementX" in e ? e.movementX : (e !== Ca && (Ca && e.type === "mousemove" ? (el = e.screenX - Ca.screenX, tl = e.screenY - Ca.screenY) : tl = el = 0, Ca = e), el);
  }, movementY: function(e) {
    return "movementY" in e ? e.movementY : tl;
  } }), xi = Ge(Dc), vb = z({}, Dc, { dataTransfer: 0 }), Sb = Ge(vb), xb = z({}, Ra, { relatedTarget: 0 }), nl = Ge(xb), Eb = z({}, hn, { animationName: 0, elapsedTime: 0, pseudoElement: 0 }), Ab = Ge(Eb), Tb = z({}, hn, { clipboardData: function(e) {
    return "clipboardData" in e ? e.clipboardData : window.clipboardData;
  } }), Mb = Ge(Tb), Db = z({}, hn, { data: 0 }), Ei = Ge(Db), Rb = { Esc: "Escape", Spacebar: " ", Left: "ArrowLeft", Up: "ArrowUp", Right: "ArrowRight", Down: "ArrowDown", Del: "Delete", Win: "OS", Menu: "ContextMenu", Apps: "ContextMenu", Scroll: "ScrollLock", MozPrintableKey: "Unidentified" }, Cb = { 8: "Backspace", 9: "Tab", 12: "Clear", 13: "Enter", 16: "Shift", 17: "Control", 18: "Alt", 19: "Pause", 20: "CapsLock", 27: "Escape", 32: " ", 33: "PageUp", 34: "PageDown", 35: "End", 36: "Home", 37: "ArrowLeft", 38: "ArrowUp", 39: "ArrowRight", 40: "ArrowDown", 45: "Insert", 46: "Delete", 112: "F1", 113: "F2", 114: "F3", 115: "F4", 116: "F5", 117: "F6", 118: "F7", 119: "F8", 120: "F9", 121: "F10", 122: "F11", 123: "F12", 144: "NumLock", 145: "ScrollLock", 224: "Meta" }, Hb = { Alt: "altKey", Control: "ctrlKey", Meta: "metaKey", Shift: "shiftKey" };
  function zb(e) {
    var t = this.nativeEvent;
    return t.getModifierState ? t.getModifierState(e) : (e = Hb[e]) ? !!t[e] : false;
  }
  function al() {
    return zb;
  }
  var Nb = z({}, Ra, { key: function(e) {
    if (e.key) {
      var t = Rb[e.key] || e.key;
      if (t !== "Unidentified") return t;
    }
    return e.type === "keypress" ? (e = Ac(e), e === 13 ? "Enter" : String.fromCharCode(e)) : e.type === "keydown" || e.type === "keyup" ? Cb[e.keyCode] || "Unidentified" : "";
  }, code: 0, location: 0, ctrlKey: 0, shiftKey: 0, altKey: 0, metaKey: 0, repeat: 0, locale: 0, getModifierState: al, charCode: function(e) {
    return e.type === "keypress" ? Ac(e) : 0;
  }, keyCode: function(e) {
    return e.type === "keydown" || e.type === "keyup" ? e.keyCode : 0;
  }, which: function(e) {
    return e.type === "keypress" ? Ac(e) : e.type === "keydown" || e.type === "keyup" ? e.keyCode : 0;
  } }), Ub = Ge(Nb), Bb = z({}, Dc, { pointerId: 0, width: 0, height: 0, pressure: 0, tangentialPressure: 0, tiltX: 0, tiltY: 0, twist: 0, pointerType: 0, isPrimary: 0 }), Ai = Ge(Bb), Lb = z({}, Ra, { touches: 0, targetTouches: 0, changedTouches: 0, altKey: 0, metaKey: 0, ctrlKey: 0, shiftKey: 0, getModifierState: al }), qb = Ge(Lb), Gb = z({}, hn, { propertyName: 0, elapsedTime: 0, pseudoElement: 0 }), Vb = Ge(Gb), Yb = z({}, Dc, { deltaX: function(e) {
    return "deltaX" in e ? e.deltaX : "wheelDeltaX" in e ? -e.wheelDeltaX : 0;
  }, deltaY: function(e) {
    return "deltaY" in e ? e.deltaY : "wheelDeltaY" in e ? -e.wheelDeltaY : "wheelDelta" in e ? -e.wheelDelta : 0;
  }, deltaZ: 0, deltaMode: 0 }), Xb = Ge(Yb), Qb = z({}, hn, { newState: 0, oldState: 0 }), Zb = Ge(Qb), Wb = [9, 13, 27, 32], cl = Mt && "CompositionEvent" in window, Ha = null;
  Mt && "documentMode" in document && (Ha = document.documentMode);
  var Fb = Mt && "TextEvent" in window && !Ha, Ti = Mt && (!cl || Ha && 8 < Ha && 11 >= Ha), Mi = " ", Di = false;
  function Ri(e, t) {
    switch (e) {
      case "keyup":
        return Wb.indexOf(t.keyCode) !== -1;
      case "keydown":
        return t.keyCode !== 229;
      case "keypress":
      case "mousedown":
      case "focusout":
        return true;
      default:
        return false;
    }
  }
  function Ci(e) {
    return e = e.detail, typeof e == "object" && "data" in e ? e.data : null;
  }
  var Kn = false;
  function Kb(e, t) {
    switch (e) {
      case "compositionend":
        return Ci(t);
      case "keypress":
        return t.which !== 32 ? null : (Di = true, Mi);
      case "textInput":
        return e = t.data, e === Mi && Di ? null : e;
      default:
        return null;
    }
  }
  function Jb(e, t) {
    if (Kn) return e === "compositionend" || !cl && Ri(e, t) ? (e = vi(), Ec = Pu = Kt = null, Kn = false, e) : null;
    switch (e) {
      case "paste":
        return null;
      case "keypress":
        if (!(t.ctrlKey || t.altKey || t.metaKey) || t.ctrlKey && t.altKey) {
          if (t.char && 1 < t.char.length) return t.char;
          if (t.which) return String.fromCharCode(t.which);
        }
        return null;
      case "compositionend":
        return Ti && t.locale !== "ko" ? null : t.data;
      default:
        return null;
    }
  }
  var kb = { color: true, date: true, datetime: true, "datetime-local": true, email: true, month: true, number: true, password: true, range: true, search: true, tel: true, text: true, time: true, url: true, week: true };
  function Hi(e) {
    var t = e && e.nodeName && e.nodeName.toLowerCase();
    return t === "input" ? !!kb[e.type] : t === "textarea";
  }
  function zi(e, t, c, u) {
    Wn ? Fn ? Fn.push(u) : Fn = [u] : Wn = u, t = ju(t, "onChange"), 0 < t.length && (c = new Mc("onChange", "change", null, c, u), e.push({ event: c, listeners: t }));
  }
  var za = null, Na = null;
  function Ib(e) {
    po(e, 0);
  }
  function Rc(e) {
    var t = Ta(e);
    if (gi(t)) return e;
  }
  function Ni(e, t) {
    if (e === "change") return t;
  }
  var Ui = false;
  if (Mt) {
    var ul;
    if (Mt) {
      var ll = "oninput" in document;
      if (!ll) {
        var Bi = document.createElement("div");
        Bi.setAttribute("oninput", "return;"), ll = typeof Bi.oninput == "function";
      }
      ul = ll;
    } else ul = false;
    Ui = ul && (!document.documentMode || 9 < document.documentMode);
  }
  function Li() {
    za && (za.detachEvent("onpropertychange", qi), Na = za = null);
  }
  function qi(e) {
    if (e.propertyName === "value" && Rc(Na)) {
      var t = [];
      zi(t, Na, e, ku(e)), hi(Ib, t);
    }
  }
  function $b(e, t, c) {
    e === "focusin" ? (Li(), za = t, Na = c, za.attachEvent("onpropertychange", qi)) : e === "focusout" && Li();
  }
  function Pb(e) {
    if (e === "selectionchange" || e === "keyup" || e === "keydown") return Rc(Na);
  }
  function es(e, t) {
    if (e === "click") return Rc(t);
  }
  function ts(e, t) {
    if (e === "input" || e === "change") return Rc(t);
  }
  function ns(e, t) {
    return e === t && (e !== 0 || 1 / e === 1 / t) || e !== e && t !== t;
  }
  var ke = typeof Object.is == "function" ? Object.is : ns;
  function Ua(e, t) {
    if (ke(e, t)) return true;
    if (typeof e != "object" || e === null || typeof t != "object" || t === null) return false;
    var c = Object.keys(e), u = Object.keys(t);
    if (c.length !== u.length) return false;
    for (u = 0; u < c.length; u++) {
      var r = c[u];
      if (!Bu.call(t, r) || !ke(e[r], t[r])) return false;
    }
    return true;
  }
  function Gi(e) {
    for (; e && e.firstChild; ) e = e.firstChild;
    return e;
  }
  function Vi(e, t) {
    var c = Gi(e);
    e = 0;
    for (var u; c; ) {
      if (c.nodeType === 3) {
        if (u = e + c.textContent.length, e <= t && u >= t) return { node: c, offset: t - e };
        e = u;
      }
      e: {
        for (; c; ) {
          if (c.nextSibling) {
            c = c.nextSibling;
            break e;
          }
          c = c.parentNode;
        }
        c = void 0;
      }
      c = Gi(c);
    }
  }
  function Yi(e, t) {
    return e && t ? e === t ? true : e && e.nodeType === 3 ? false : t && t.nodeType === 3 ? Yi(e, t.parentNode) : "contains" in e ? e.contains(t) : e.compareDocumentPosition ? !!(e.compareDocumentPosition(t) & 16) : false : false;
  }
  function Xi(e) {
    e = e != null && e.ownerDocument != null && e.ownerDocument.defaultView != null ? e.ownerDocument.defaultView : window;
    for (var t = Sc(e.document); t instanceof e.HTMLIFrameElement; ) {
      try {
        var c = typeof t.contentWindow.location.href == "string";
      } catch {
        c = false;
      }
      if (c) e = t.contentWindow;
      else break;
      t = Sc(e.document);
    }
    return t;
  }
  function rl(e) {
    var t = e && e.nodeName && e.nodeName.toLowerCase();
    return t && (t === "input" && (e.type === "text" || e.type === "search" || e.type === "tel" || e.type === "url" || e.type === "password") || t === "textarea" || e.contentEditable === "true");
  }
  var as = Mt && "documentMode" in document && 11 >= document.documentMode, Jn = null, il = null, Ba = null, _l = false;
  function Qi(e, t, c) {
    var u = c.window === c ? c.document : c.nodeType === 9 ? c : c.ownerDocument;
    _l || Jn == null || Jn !== Sc(u) || (u = Jn, "selectionStart" in u && rl(u) ? u = { start: u.selectionStart, end: u.selectionEnd } : (u = (u.ownerDocument && u.ownerDocument.defaultView || window).getSelection(), u = { anchorNode: u.anchorNode, anchorOffset: u.anchorOffset, focusNode: u.focusNode, focusOffset: u.focusOffset }), Ba && Ua(Ba, u) || (Ba = u, u = ju(il, "onSelect"), 0 < u.length && (t = new Mc("onSelect", "select", null, t, c), e.push({ event: t, listeners: u }), t.target = Jn)));
  }
  function vn(e, t) {
    var c = {};
    return c[e.toLowerCase()] = t.toLowerCase(), c["Webkit" + e] = "webkit" + t, c["Moz" + e] = "moz" + t, c;
  }
  var kn = { animationend: vn("Animation", "AnimationEnd"), animationiteration: vn("Animation", "AnimationIteration"), animationstart: vn("Animation", "AnimationStart"), transitionrun: vn("Transition", "TransitionRun"), transitionstart: vn("Transition", "TransitionStart"), transitioncancel: vn("Transition", "TransitionCancel"), transitionend: vn("Transition", "TransitionEnd") }, fl = {}, Zi = {};
  Mt && (Zi = document.createElement("div").style, "AnimationEvent" in window || (delete kn.animationend.animation, delete kn.animationiteration.animation, delete kn.animationstart.animation), "TransitionEvent" in window || delete kn.transitionend.transition);
  function Sn(e) {
    if (fl[e]) return fl[e];
    if (!kn[e]) return e;
    var t = kn[e], c;
    for (c in t) if (t.hasOwnProperty(c) && c in Zi) return fl[e] = t[c];
    return e;
  }
  var Wi = Sn("animationend"), Fi = Sn("animationiteration"), Ki = Sn("animationstart"), cs = Sn("transitionrun"), us = Sn("transitionstart"), ls = Sn("transitioncancel"), Ji = Sn("transitionend"), ki = /* @__PURE__ */ new Map(), ol = "abort auxClick beforeToggle cancel canPlay canPlayThrough click close contextMenu copy cut drag dragEnd dragEnter dragExit dragLeave dragOver dragStart drop durationChange emptied encrypted ended error gotPointerCapture input invalid keyDown keyPress keyUp load loadedData loadedMetadata loadStart lostPointerCapture mouseDown mouseMove mouseOut mouseOver mouseUp paste pause play playing pointerCancel pointerDown pointerMove pointerOut pointerOver pointerUp progress rateChange reset resize seeked seeking stalled submit suspend timeUpdate touchCancel touchEnd touchStart volumeChange scroll toggle touchMove waiting wheel".split(" ");
  ol.push("scrollEnd");
  function gt(e, t) {
    ki.set(e, t), wn(t, [e]);
  }
  var Cc = typeof reportError == "function" ? reportError : function(e) {
    if (typeof window == "object" && typeof window.ErrorEvent == "function") {
      var t = new window.ErrorEvent("error", { bubbles: true, cancelable: true, message: typeof e == "object" && e !== null && typeof e.message == "string" ? String(e.message) : String(e), error: e });
      if (!window.dispatchEvent(t)) return;
    } else if (typeof process == "object" && typeof process.emit == "function") {
      process.emit("uncaughtException", e);
      return;
    }
    console.error(e);
  }, lt = [], In = 0, bl = 0;
  function Hc() {
    for (var e = In, t = bl = In = 0; t < e; ) {
      var c = lt[t];
      lt[t++] = null;
      var u = lt[t];
      lt[t++] = null;
      var r = lt[t];
      lt[t++] = null;
      var i = lt[t];
      if (lt[t++] = null, u !== null && r !== null) {
        var f = u.pending;
        f === null ? r.next = r : (r.next = f.next, f.next = r), u.pending = r;
      }
      i !== 0 && Ii(c, r, i);
    }
  }
  function zc(e, t, c, u) {
    lt[In++] = e, lt[In++] = t, lt[In++] = c, lt[In++] = u, bl |= u, e.lanes |= u, e = e.alternate, e !== null && (e.lanes |= u);
  }
  function sl(e, t, c, u) {
    return zc(e, t, c, u), Nc(e);
  }
  function xn(e, t) {
    return zc(e, null, null, t), Nc(e);
  }
  function Ii(e, t, c) {
    e.lanes |= c;
    var u = e.alternate;
    u !== null && (u.lanes |= c);
    for (var r = false, i = e.return; i !== null; ) i.childLanes |= c, u = i.alternate, u !== null && (u.childLanes |= c), i.tag === 22 && (e = i.stateNode, e === null || e._visibility & 1 || (r = true)), e = i, i = i.return;
    return e.tag === 3 ? (i = e.stateNode, r && t !== null && (r = 31 - Je(c), e = i.hiddenUpdates, u = e[r], u === null ? e[r] = [t] : u.push(t), t.lane = c | 536870912), i) : null;
  }
  function Nc(e) {
    if (50 < uc) throw uc = 0, hr = null, Error(_(185));
    for (var t = e.return; t !== null; ) e = t, t = e.return;
    return e.tag === 3 ? e.stateNode : null;
  }
  var $n = {};
  function rs(e, t, c, u) {
    this.tag = e, this.key = c, this.sibling = this.child = this.return = this.stateNode = this.type = this.elementType = null, this.index = 0, this.refCleanup = this.ref = null, this.pendingProps = t, this.dependencies = this.memoizedState = this.updateQueue = this.memoizedProps = null, this.mode = u, this.subtreeFlags = this.flags = 0, this.deletions = null, this.childLanes = this.lanes = 0, this.alternate = null;
  }
  function Ie(e, t, c, u) {
    return new rs(e, t, c, u);
  }
  function dl(e) {
    return e = e.prototype, !(!e || !e.isReactComponent);
  }
  function Dt(e, t) {
    var c = e.alternate;
    return c === null ? (c = Ie(e.tag, t, e.key, e.mode), c.elementType = e.elementType, c.type = e.type, c.stateNode = e.stateNode, c.alternate = e, e.alternate = c) : (c.pendingProps = t, c.type = e.type, c.flags = 0, c.subtreeFlags = 0, c.deletions = null), c.flags = e.flags & 65011712, c.childLanes = e.childLanes, c.lanes = e.lanes, c.child = e.child, c.memoizedProps = e.memoizedProps, c.memoizedState = e.memoizedState, c.updateQueue = e.updateQueue, t = e.dependencies, c.dependencies = t === null ? null : { lanes: t.lanes, firstContext: t.firstContext }, c.sibling = e.sibling, c.index = e.index, c.ref = e.ref, c.refCleanup = e.refCleanup, c;
  }
  function $i(e, t) {
    e.flags &= 65011714;
    var c = e.alternate;
    return c === null ? (e.childLanes = 0, e.lanes = t, e.child = null, e.subtreeFlags = 0, e.memoizedProps = null, e.memoizedState = null, e.updateQueue = null, e.dependencies = null, e.stateNode = null) : (e.childLanes = c.childLanes, e.lanes = c.lanes, e.child = c.child, e.subtreeFlags = 0, e.deletions = null, e.memoizedProps = c.memoizedProps, e.memoizedState = c.memoizedState, e.updateQueue = c.updateQueue, e.type = c.type, t = c.dependencies, e.dependencies = t === null ? null : { lanes: t.lanes, firstContext: t.firstContext }), e;
  }
  function Uc(e, t, c, u, r, i) {
    var f = 0;
    if (u = e, typeof e == "function") dl(e) && (f = 1);
    else if (typeof e == "string") f = bd(e, c, U.current) ? 26 : e === "html" || e === "head" || e === "body" ? 27 : 5;
    else e: switch (e) {
      case jt:
        return e = Ie(31, c, t, r), e.elementType = jt, e.lanes = i, e;
      case He:
        return En(c.children, r, i, t);
      case xt:
        f = 8, r |= 24;
        break;
      case We:
        return e = Ie(12, c, t, r | 2), e.elementType = We, e.lanes = i, e;
      case pt:
        return e = Ie(13, c, t, r), e.elementType = pt, e.lanes = i, e;
      case Ue:
        return e = Ie(19, c, t, r), e.elementType = Ue, e.lanes = i, e;
      default:
        if (typeof e == "object" && e !== null) switch (e.$$typeof) {
          case Re:
            f = 10;
            break e;
          case Zt:
            f = 9;
            break e;
          case at:
            f = 11;
            break e;
          case J:
            f = 14;
            break e;
          case Be:
            f = 16, u = null;
            break e;
        }
        f = 29, c = Error(_(130, e === null ? "null" : typeof e, "")), u = null;
    }
    return t = Ie(f, c, t, r), t.elementType = e, t.type = u, t.lanes = i, t;
  }
  function En(e, t, c, u) {
    return e = Ie(7, e, u, t), e.lanes = c, e;
  }
  function gl(e, t, c) {
    return e = Ie(6, e, null, t), e.lanes = c, e;
  }
  function Pi(e) {
    var t = Ie(18, null, null, 0);
    return t.stateNode = e, t;
  }
  function ml(e, t, c) {
    return t = Ie(4, e.children !== null ? e.children : [], e.key, t), t.lanes = c, t.stateNode = { containerInfo: e.containerInfo, pendingChildren: null, implementation: e.implementation }, t;
  }
  var e_ = /* @__PURE__ */ new WeakMap();
  function rt(e, t) {
    if (typeof e == "object" && e !== null) {
      var c = e_.get(e);
      return c !== void 0 ? c : (t = { value: e, source: t, stack: Pr(t) }, e_.set(e, t), t);
    }
    return { value: e, source: t, stack: Pr(t) };
  }
  var Pn = [], ea = 0, Bc = null, La = 0, it = [], _t = 0, Jt = null, wt = 1, ht = "";
  function Rt(e, t) {
    Pn[ea++] = La, Pn[ea++] = Bc, Bc = e, La = t;
  }
  function t_(e, t, c) {
    it[_t++] = wt, it[_t++] = ht, it[_t++] = Jt, Jt = e;
    var u = wt;
    e = ht;
    var r = 32 - Je(u) - 1;
    u &= ~(1 << r), c += 1;
    var i = 32 - Je(t) + r;
    if (30 < i) {
      var f = r - r % 5;
      i = (u & (1 << f) - 1).toString(32), u >>= f, r -= f, wt = 1 << 32 - Je(t) + r | c << r | u, ht = i + e;
    } else wt = 1 << i | c << r | u, ht = e;
  }
  function Ol(e) {
    e.return !== null && (Rt(e, 1), t_(e, 1, 0));
  }
  function pl(e) {
    for (; e === Bc; ) Bc = Pn[--ea], Pn[ea] = null, La = Pn[--ea], Pn[ea] = null;
    for (; e === Jt; ) Jt = it[--_t], it[_t] = null, ht = it[--_t], it[_t] = null, wt = it[--_t], it[_t] = null;
  }
  function n_(e, t) {
    it[_t++] = wt, it[_t++] = ht, it[_t++] = Jt, wt = t.id, ht = t.overflow, Jt = e;
  }
  var Ee = null, fe = null, k = false, kt = null, ft = false, jl = Error(_(519));
  function It(e) {
    var t = Error(_(418, 1 < arguments.length && arguments[1] !== void 0 && arguments[1] ? "text" : "HTML", ""));
    throw qa(rt(t, e)), jl;
  }
  function a_(e) {
    var t = e.stateNode, c = e.type, u = e.memoizedProps;
    switch (t[xe] = e, t[qe] = u, c) {
      case "dialog":
        W("cancel", t), W("close", t);
        break;
      case "iframe":
      case "object":
      case "embed":
        W("load", t);
        break;
      case "video":
      case "audio":
        for (c = 0; c < rc.length; c++) W(rc[c], t);
        break;
      case "source":
        W("error", t);
        break;
      case "img":
      case "image":
      case "link":
        W("error", t), W("load", t);
        break;
      case "details":
        W("toggle", t);
        break;
      case "input":
        W("invalid", t), mi(t, u.value, u.defaultValue, u.checked, u.defaultChecked, u.type, u.name, true);
        break;
      case "select":
        W("invalid", t);
        break;
      case "textarea":
        W("invalid", t), pi(t, u.value, u.defaultValue, u.children);
    }
    c = u.children, typeof c != "string" && typeof c != "number" && typeof c != "bigint" || t.textContent === "" + c || u.suppressHydrationWarning === true || ho(t.textContent, c) ? (u.popover != null && (W("beforetoggle", t), W("toggle", t)), u.onScroll != null && W("scroll", t), u.onScrollEnd != null && W("scrollend", t), u.onClick != null && (t.onclick = Tt), t = true) : t = false, t || It(e, true);
  }
  function c_(e) {
    for (Ee = e.return; Ee; ) switch (Ee.tag) {
      case 5:
      case 31:
      case 13:
        ft = false;
        return;
      case 27:
      case 3:
        ft = true;
        return;
      default:
        Ee = Ee.return;
    }
  }
  function ta(e) {
    if (e !== Ee) return false;
    if (!k) return c_(e), k = true, false;
    var t = e.tag, c;
    if ((c = t !== 3 && t !== 27) && ((c = t === 5) && (c = e.type, c = !(c !== "form" && c !== "button") || Br(e.type, e.memoizedProps)), c = !c), c && fe && It(e), c_(e), t === 13) {
      if (e = e.memoizedState, e = e !== null ? e.dehydrated : null, !e) throw Error(_(317));
      fe = Ro(e);
    } else if (t === 31) {
      if (e = e.memoizedState, e = e !== null ? e.dehydrated : null, !e) throw Error(_(317));
      fe = Ro(e);
    } else t === 27 ? (t = fe, bn(e.type) ? (e = Yr, Yr = null, fe = e) : fe = t) : fe = Ee ? bt(e.stateNode.nextSibling) : null;
    return true;
  }
  function An() {
    fe = Ee = null, k = false;
  }
  function yl() {
    var e = kt;
    return e !== null && (Qe === null ? Qe = e : Qe.push.apply(Qe, e), kt = null), e;
  }
  function qa(e) {
    kt === null ? kt = [e] : kt.push(e);
  }
  var wl = m(null), Tn = null, Ct = null;
  function $t(e, t, c) {
    C(wl, t._currentValue), t._currentValue = c;
  }
  function Ht(e) {
    e._currentValue = wl.current, D(wl);
  }
  function hl(e, t, c) {
    for (; e !== null; ) {
      var u = e.alternate;
      if ((e.childLanes & t) !== t ? (e.childLanes |= t, u !== null && (u.childLanes |= t)) : u !== null && (u.childLanes & t) !== t && (u.childLanes |= t), e === c) break;
      e = e.return;
    }
  }
  function vl(e, t, c, u) {
    var r = e.child;
    for (r !== null && (r.return = e); r !== null; ) {
      var i = r.dependencies;
      if (i !== null) {
        var f = r.child;
        i = i.firstContext;
        e: for (; i !== null; ) {
          var b = i;
          i = r;
          for (var d = 0; d < t.length; d++) if (b.context === t[d]) {
            i.lanes |= c, b = i.alternate, b !== null && (b.lanes |= c), hl(i.return, c, e), u || (f = null);
            break e;
          }
          i = b.next;
        }
      } else if (r.tag === 18) {
        if (f = r.return, f === null) throw Error(_(341));
        f.lanes |= c, i = f.alternate, i !== null && (i.lanes |= c), hl(f, c, e), f = null;
      } else f = r.child;
      if (f !== null) f.return = r;
      else for (f = r; f !== null; ) {
        if (f === e) {
          f = null;
          break;
        }
        if (r = f.sibling, r !== null) {
          r.return = f.return, f = r;
          break;
        }
        f = f.return;
      }
      r = f;
    }
  }
  function na(e, t, c, u) {
    e = null;
    for (var r = t, i = false; r !== null; ) {
      if (!i) {
        if ((r.flags & 524288) !== 0) i = true;
        else if ((r.flags & 262144) !== 0) break;
      }
      if (r.tag === 10) {
        var f = r.alternate;
        if (f === null) throw Error(_(387));
        if (f = f.memoizedProps, f !== null) {
          var b = r.type;
          ke(r.pendingProps.value, f.value) || (e !== null ? e.push(b) : e = [b]);
        }
      } else if (r === te.current) {
        if (f = r.alternate, f === null) throw Error(_(387));
        f.memoizedState.memoizedState !== r.memoizedState.memoizedState && (e !== null ? e.push(bc) : e = [bc]);
      }
      r = r.return;
    }
    e !== null && vl(t, e, c, u), t.flags |= 262144;
  }
  function Lc(e) {
    for (e = e.firstContext; e !== null; ) {
      if (!ke(e.context._currentValue, e.memoizedValue)) return true;
      e = e.next;
    }
    return false;
  }
  function Mn(e) {
    Tn = e, Ct = null, e = e.dependencies, e !== null && (e.firstContext = null);
  }
  function Ae(e) {
    return u_(Tn, e);
  }
  function qc(e, t) {
    return Tn === null && Mn(e), u_(e, t);
  }
  function u_(e, t) {
    var c = t._currentValue;
    if (t = { context: t, memoizedValue: c, next: null }, Ct === null) {
      if (e === null) throw Error(_(308));
      Ct = t, e.dependencies = { lanes: 0, firstContext: t }, e.flags |= 524288;
    } else Ct = Ct.next = t;
    return c;
  }
  var is = typeof AbortController < "u" ? AbortController : function() {
    var e = [], t = this.signal = { aborted: false, addEventListener: function(c, u) {
      e.push(u);
    } };
    this.abort = function() {
      t.aborted = true, e.forEach(function(c) {
        return c();
      });
    };
  }, _s = n.unstable_scheduleCallback, fs = n.unstable_NormalPriority, pe = { $$typeof: Re, Consumer: null, Provider: null, _currentValue: null, _currentValue2: null, _threadCount: 0 };
  function Sl() {
    return { controller: new is(), data: /* @__PURE__ */ new Map(), refCount: 0 };
  }
  function Ga(e) {
    e.refCount--, e.refCount === 0 && _s(fs, function() {
      e.controller.abort();
    });
  }
  var Va = null, xl = 0, aa = 0, ca = null;
  function os(e, t) {
    if (Va === null) {
      var c = Va = [];
      xl = 0, aa = Tr(), ca = { status: "pending", value: void 0, then: function(u) {
        c.push(u);
      } };
    }
    return xl++, t.then(l_, l_), t;
  }
  function l_() {
    if (--xl === 0 && Va !== null) {
      ca !== null && (ca.status = "fulfilled");
      var e = Va;
      Va = null, aa = 0, ca = null;
      for (var t = 0; t < e.length; t++) (0, e[t])();
    }
  }
  function bs(e, t) {
    var c = [], u = { status: "pending", value: null, reason: null, then: function(r) {
      c.push(r);
    } };
    return e.then(function() {
      u.status = "fulfilled", u.value = t;
      for (var r = 0; r < c.length; r++) (0, c[r])(t);
    }, function(r) {
      for (u.status = "rejected", u.reason = r, r = 0; r < c.length; r++) (0, c[r])(void 0);
    }), u;
  }
  var r_ = A.S;
  A.S = function(e, t) {
    Zf = Fe(), typeof t == "object" && t !== null && typeof t.then == "function" && os(e, t), r_ !== null && r_(e, t);
  };
  var Dn = m(null);
  function El() {
    var e = Dn.current;
    return e !== null ? e : _e.pooledCache;
  }
  function Gc(e, t) {
    t === null ? C(Dn, Dn.current) : C(Dn, t.pool);
  }
  function i_() {
    var e = El();
    return e === null ? null : { parent: pe._currentValue, pool: e };
  }
  var ua = Error(_(460)), Al = Error(_(474)), Vc = Error(_(542)), Yc = { then: function() {
  } };
  function __(e) {
    return e = e.status, e === "fulfilled" || e === "rejected";
  }
  function f_(e, t, c) {
    switch (c = e[c], c === void 0 ? e.push(t) : c !== t && (t.then(Tt, Tt), t = c), t.status) {
      case "fulfilled":
        return t.value;
      case "rejected":
        throw e = t.reason, b_(e), e;
      default:
        if (typeof t.status == "string") t.then(Tt, Tt);
        else {
          if (e = _e, e !== null && 100 < e.shellSuspendCounter) throw Error(_(482));
          e = t, e.status = "pending", e.then(function(u) {
            if (t.status === "pending") {
              var r = t;
              r.status = "fulfilled", r.value = u;
            }
          }, function(u) {
            if (t.status === "pending") {
              var r = t;
              r.status = "rejected", r.reason = u;
            }
          });
        }
        switch (t.status) {
          case "fulfilled":
            return t.value;
          case "rejected":
            throw e = t.reason, b_(e), e;
        }
        throw Cn = t, ua;
    }
  }
  function Rn(e) {
    try {
      var t = e._init;
      return t(e._payload);
    } catch (c) {
      throw c !== null && typeof c == "object" && typeof c.then == "function" ? (Cn = c, ua) : c;
    }
  }
  var Cn = null;
  function o_() {
    if (Cn === null) throw Error(_(459));
    var e = Cn;
    return Cn = null, e;
  }
  function b_(e) {
    if (e === ua || e === Vc) throw Error(_(483));
  }
  var la = null, Ya = 0;
  function Xc(e) {
    var t = Ya;
    return Ya += 1, la === null && (la = []), f_(la, e, t);
  }
  function Xa(e, t) {
    t = t.props.ref, e.ref = t !== void 0 ? t : null;
  }
  function Qc(e, t) {
    throw t.$$typeof === I ? Error(_(525)) : (e = Object.prototype.toString.call(t), Error(_(31, e === "[object Object]" ? "object with keys {" + Object.keys(t).join(", ") + "}" : e)));
  }
  function s_(e) {
    function t(O, g) {
      if (e) {
        var y = O.deletions;
        y === null ? (O.deletions = [g], O.flags |= 16) : y.push(g);
      }
    }
    function c(O, g) {
      if (!e) return null;
      for (; g !== null; ) t(O, g), g = g.sibling;
      return null;
    }
    function u(O) {
      for (var g = /* @__PURE__ */ new Map(); O !== null; ) O.key !== null ? g.set(O.key, O) : g.set(O.index, O), O = O.sibling;
      return g;
    }
    function r(O, g) {
      return O = Dt(O, g), O.index = 0, O.sibling = null, O;
    }
    function i(O, g, y) {
      return O.index = y, e ? (y = O.alternate, y !== null ? (y = y.index, y < g ? (O.flags |= 67108866, g) : y) : (O.flags |= 67108866, g)) : (O.flags |= 1048576, g);
    }
    function f(O) {
      return e && O.alternate === null && (O.flags |= 67108866), O;
    }
    function b(O, g, y, T) {
      return g === null || g.tag !== 6 ? (g = gl(y, O.mode, T), g.return = O, g) : (g = r(g, y), g.return = O, g);
    }
    function d(O, g, y, T) {
      var L = y.type;
      return L === He ? E(O, g, y.props.children, T, y.key) : g !== null && (g.elementType === L || typeof L == "object" && L !== null && L.$$typeof === Be && Rn(L) === g.type) ? (g = r(g, y.props), Xa(g, y), g.return = O, g) : (g = Uc(y.type, y.key, y.props, null, O.mode, T), Xa(g, y), g.return = O, g);
    }
    function w(O, g, y, T) {
      return g === null || g.tag !== 4 || g.stateNode.containerInfo !== y.containerInfo || g.stateNode.implementation !== y.implementation ? (g = ml(y, O.mode, T), g.return = O, g) : (g = r(g, y.children || []), g.return = O, g);
    }
    function E(O, g, y, T, L) {
      return g === null || g.tag !== 7 ? (g = En(y, O.mode, T, L), g.return = O, g) : (g = r(g, y), g.return = O, g);
    }
    function M(O, g, y) {
      if (typeof g == "string" && g !== "" || typeof g == "number" || typeof g == "bigint") return g = gl("" + g, O.mode, y), g.return = O, g;
      if (typeof g == "object" && g !== null) {
        switch (g.$$typeof) {
          case Ce:
            return y = Uc(g.type, g.key, g.props, null, O.mode, y), Xa(y, g), y.return = O, y;
          case De:
            return g = ml(g, O.mode, y), g.return = O, g;
          case Be:
            return g = Rn(g), M(O, g, y);
        }
        if (dt(g) || Le(g)) return g = En(g, O.mode, y, null), g.return = O, g;
        if (typeof g.then == "function") return M(O, Xc(g), y);
        if (g.$$typeof === Re) return M(O, qc(O, g), y);
        Qc(O, g);
      }
      return null;
    }
    function h(O, g, y, T) {
      var L = g !== null ? g.key : null;
      if (typeof y == "string" && y !== "" || typeof y == "number" || typeof y == "bigint") return L !== null ? null : b(O, g, "" + y, T);
      if (typeof y == "object" && y !== null) {
        switch (y.$$typeof) {
          case Ce:
            return y.key === L ? d(O, g, y, T) : null;
          case De:
            return y.key === L ? w(O, g, y, T) : null;
          case Be:
            return y = Rn(y), h(O, g, y, T);
        }
        if (dt(y) || Le(y)) return L !== null ? null : E(O, g, y, T, null);
        if (typeof y.then == "function") return h(O, g, Xc(y), T);
        if (y.$$typeof === Re) return h(O, g, qc(O, y), T);
        Qc(O, y);
      }
      return null;
    }
    function v(O, g, y, T, L) {
      if (typeof T == "string" && T !== "" || typeof T == "number" || typeof T == "bigint") return O = O.get(y) || null, b(g, O, "" + T, L);
      if (typeof T == "object" && T !== null) {
        switch (T.$$typeof) {
          case Ce:
            return O = O.get(T.key === null ? y : T.key) || null, d(g, O, T, L);
          case De:
            return O = O.get(T.key === null ? y : T.key) || null, w(g, O, T, L);
          case Be:
            return T = Rn(T), v(O, g, y, T, L);
        }
        if (dt(T) || Le(T)) return O = O.get(y) || null, E(g, O, T, L, null);
        if (typeof T.then == "function") return v(O, g, y, Xc(T), L);
        if (T.$$typeof === Re) return v(O, g, y, qc(g, T), L);
        Qc(g, T);
      }
      return null;
    }
    function N(O, g, y, T) {
      for (var L = null, $ = null, B = g, X = g = 0, K = null; B !== null && X < y.length; X++) {
        B.index > X ? (K = B, B = null) : K = B.sibling;
        var P = h(O, B, y[X], T);
        if (P === null) {
          B === null && (B = K);
          break;
        }
        e && B && P.alternate === null && t(O, B), g = i(P, g, X), $ === null ? L = P : $.sibling = P, $ = P, B = K;
      }
      if (X === y.length) return c(O, B), k && Rt(O, X), L;
      if (B === null) {
        for (; X < y.length; X++) B = M(O, y[X], T), B !== null && (g = i(B, g, X), $ === null ? L = B : $.sibling = B, $ = B);
        return k && Rt(O, X), L;
      }
      for (B = u(B); X < y.length; X++) K = v(B, O, X, y[X], T), K !== null && (e && K.alternate !== null && B.delete(K.key === null ? X : K.key), g = i(K, g, X), $ === null ? L = K : $.sibling = K, $ = K);
      return e && B.forEach(function(On) {
        return t(O, On);
      }), k && Rt(O, X), L;
    }
    function q(O, g, y, T) {
      if (y == null) throw Error(_(151));
      for (var L = null, $ = null, B = g, X = g = 0, K = null, P = y.next(); B !== null && !P.done; X++, P = y.next()) {
        B.index > X ? (K = B, B = null) : K = B.sibling;
        var On = h(O, B, P.value, T);
        if (On === null) {
          B === null && (B = K);
          break;
        }
        e && B && On.alternate === null && t(O, B), g = i(On, g, X), $ === null ? L = On : $.sibling = On, $ = On, B = K;
      }
      if (P.done) return c(O, B), k && Rt(O, X), L;
      if (B === null) {
        for (; !P.done; X++, P = y.next()) P = M(O, P.value, T), P !== null && (g = i(P, g, X), $ === null ? L = P : $.sibling = P, $ = P);
        return k && Rt(O, X), L;
      }
      for (B = u(B); !P.done; X++, P = y.next()) P = v(B, O, X, P.value, T), P !== null && (e && P.alternate !== null && B.delete(P.key === null ? X : P.key), g = i(P, g, X), $ === null ? L = P : $.sibling = P, $ = P);
      return e && B.forEach(function(vd) {
        return t(O, vd);
      }), k && Rt(O, X), L;
    }
    function re(O, g, y, T) {
      if (typeof y == "object" && y !== null && y.type === He && y.key === null && (y = y.props.children), typeof y == "object" && y !== null) {
        switch (y.$$typeof) {
          case Ce:
            e: {
              for (var L = y.key; g !== null; ) {
                if (g.key === L) {
                  if (L = y.type, L === He) {
                    if (g.tag === 7) {
                      c(O, g.sibling), T = r(g, y.props.children), T.return = O, O = T;
                      break e;
                    }
                  } else if (g.elementType === L || typeof L == "object" && L !== null && L.$$typeof === Be && Rn(L) === g.type) {
                    c(O, g.sibling), T = r(g, y.props), Xa(T, y), T.return = O, O = T;
                    break e;
                  }
                  c(O, g);
                  break;
                } else t(O, g);
                g = g.sibling;
              }
              y.type === He ? (T = En(y.props.children, O.mode, T, y.key), T.return = O, O = T) : (T = Uc(y.type, y.key, y.props, null, O.mode, T), Xa(T, y), T.return = O, O = T);
            }
            return f(O);
          case De:
            e: {
              for (L = y.key; g !== null; ) {
                if (g.key === L) if (g.tag === 4 && g.stateNode.containerInfo === y.containerInfo && g.stateNode.implementation === y.implementation) {
                  c(O, g.sibling), T = r(g, y.children || []), T.return = O, O = T;
                  break e;
                } else {
                  c(O, g);
                  break;
                }
                else t(O, g);
                g = g.sibling;
              }
              T = ml(y, O.mode, T), T.return = O, O = T;
            }
            return f(O);
          case Be:
            return y = Rn(y), re(O, g, y, T);
        }
        if (dt(y)) return N(O, g, y, T);
        if (Le(y)) {
          if (L = Le(y), typeof L != "function") throw Error(_(150));
          return y = L.call(y), q(O, g, y, T);
        }
        if (typeof y.then == "function") return re(O, g, Xc(y), T);
        if (y.$$typeof === Re) return re(O, g, qc(O, y), T);
        Qc(O, y);
      }
      return typeof y == "string" && y !== "" || typeof y == "number" || typeof y == "bigint" ? (y = "" + y, g !== null && g.tag === 6 ? (c(O, g.sibling), T = r(g, y), T.return = O, O = T) : (c(O, g), T = gl(y, O.mode, T), T.return = O, O = T), f(O)) : c(O, g);
    }
    return function(O, g, y, T) {
      try {
        Ya = 0;
        var L = re(O, g, y, T);
        return la = null, L;
      } catch (B) {
        if (B === ua || B === Vc) throw B;
        var $ = Ie(29, B, null, O.mode);
        return $.lanes = T, $.return = O, $;
      } finally {
      }
    };
  }
  var Hn = s_(true), d_ = s_(false), Pt = false;
  function Tl(e) {
    e.updateQueue = { baseState: e.memoizedState, firstBaseUpdate: null, lastBaseUpdate: null, shared: { pending: null, lanes: 0, hiddenCallbacks: null }, callbacks: null };
  }
  function Ml(e, t) {
    e = e.updateQueue, t.updateQueue === e && (t.updateQueue = { baseState: e.baseState, firstBaseUpdate: e.firstBaseUpdate, lastBaseUpdate: e.lastBaseUpdate, shared: e.shared, callbacks: null });
  }
  function en(e) {
    return { lane: e, tag: 0, payload: null, callback: null, next: null };
  }
  function tn(e, t, c) {
    var u = e.updateQueue;
    if (u === null) return null;
    if (u = u.shared, (ee & 2) !== 0) {
      var r = u.pending;
      return r === null ? t.next = t : (t.next = r.next, r.next = t), u.pending = t, t = Nc(e), Ii(e, null, c), t;
    }
    return zc(e, u, t, c), Nc(e);
  }
  function Qa(e, t, c) {
    if (t = t.updateQueue, t !== null && (t = t.shared, (c & 4194048) !== 0)) {
      var u = t.lanes;
      u &= e.pendingLanes, c |= u, t.lanes = c, ui(e, c);
    }
  }
  function Dl(e, t) {
    var c = e.updateQueue, u = e.alternate;
    if (u !== null && (u = u.updateQueue, c === u)) {
      var r = null, i = null;
      if (c = c.firstBaseUpdate, c !== null) {
        do {
          var f = { lane: c.lane, tag: c.tag, payload: c.payload, callback: null, next: null };
          i === null ? r = i = f : i = i.next = f, c = c.next;
        } while (c !== null);
        i === null ? r = i = t : i = i.next = t;
      } else r = i = t;
      c = { baseState: u.baseState, firstBaseUpdate: r, lastBaseUpdate: i, shared: u.shared, callbacks: u.callbacks }, e.updateQueue = c;
      return;
    }
    e = c.lastBaseUpdate, e === null ? c.firstBaseUpdate = t : e.next = t, c.lastBaseUpdate = t;
  }
  var Rl = false;
  function Za() {
    if (Rl) {
      var e = ca;
      if (e !== null) throw e;
    }
  }
  function Wa(e, t, c, u) {
    Rl = false;
    var r = e.updateQueue;
    Pt = false;
    var i = r.firstBaseUpdate, f = r.lastBaseUpdate, b = r.shared.pending;
    if (b !== null) {
      r.shared.pending = null;
      var d = b, w = d.next;
      d.next = null, f === null ? i = w : f.next = w, f = d;
      var E = e.alternate;
      E !== null && (E = E.updateQueue, b = E.lastBaseUpdate, b !== f && (b === null ? E.firstBaseUpdate = w : b.next = w, E.lastBaseUpdate = d));
    }
    if (i !== null) {
      var M = r.baseState;
      f = 0, E = w = d = null, b = i;
      do {
        var h = b.lane & -536870913, v = h !== b.lane;
        if (v ? (F & h) === h : (u & h) === h) {
          h !== 0 && h === aa && (Rl = true), E !== null && (E = E.next = { lane: 0, tag: b.tag, payload: b.payload, callback: null, next: null });
          e: {
            var N = e, q = b;
            h = t;
            var re = c;
            switch (q.tag) {
              case 1:
                if (N = q.payload, typeof N == "function") {
                  M = N.call(re, M, h);
                  break e;
                }
                M = N;
                break e;
              case 3:
                N.flags = N.flags & -65537 | 128;
              case 0:
                if (N = q.payload, h = typeof N == "function" ? N.call(re, M, h) : N, h == null) break e;
                M = z({}, M, h);
                break e;
              case 2:
                Pt = true;
            }
          }
          h = b.callback, h !== null && (e.flags |= 64, v && (e.flags |= 8192), v = r.callbacks, v === null ? r.callbacks = [h] : v.push(h));
        } else v = { lane: h, tag: b.tag, payload: b.payload, callback: b.callback, next: null }, E === null ? (w = E = v, d = M) : E = E.next = v, f |= h;
        if (b = b.next, b === null) {
          if (b = r.shared.pending, b === null) break;
          v = b, b = v.next, v.next = null, r.lastBaseUpdate = v, r.shared.pending = null;
        }
      } while (true);
      E === null && (d = M), r.baseState = d, r.firstBaseUpdate = w, r.lastBaseUpdate = E, i === null && (r.shared.lanes = 0), ln |= f, e.lanes = f, e.memoizedState = M;
    }
  }
  function g_(e, t) {
    if (typeof e != "function") throw Error(_(191, e));
    e.call(t);
  }
  function m_(e, t) {
    var c = e.callbacks;
    if (c !== null) for (e.callbacks = null, e = 0; e < c.length; e++) g_(c[e], t);
  }
  var ra = m(null), Zc = m(0);
  function O_(e, t) {
    e = Yt, C(Zc, e), C(ra, t), Yt = e | t.baseLanes;
  }
  function Cl() {
    C(Zc, Yt), C(ra, ra.current);
  }
  function Hl() {
    Yt = Zc.current, D(ra), D(Zc);
  }
  var $e = m(null), ot = null;
  function nn(e) {
    var t = e.alternate;
    C(me, me.current & 1), C($e, e), ot === null && (t === null || ra.current !== null || t.memoizedState !== null) && (ot = e);
  }
  function zl(e) {
    C(me, me.current), C($e, e), ot === null && (ot = e);
  }
  function p_(e) {
    e.tag === 22 ? (C(me, me.current), C($e, e), ot === null && (ot = e)) : an();
  }
  function an() {
    C(me, me.current), C($e, $e.current);
  }
  function Pe(e) {
    D($e), ot === e && (ot = null), D(me);
  }
  var me = m(0);
  function Wc(e) {
    for (var t = e; t !== null; ) {
      if (t.tag === 13) {
        var c = t.memoizedState;
        if (c !== null && (c = c.dehydrated, c === null || Gr(c) || Vr(c))) return t;
      } else if (t.tag === 19 && (t.memoizedProps.revealOrder === "forwards" || t.memoizedProps.revealOrder === "backwards" || t.memoizedProps.revealOrder === "unstable_legacy-backwards" || t.memoizedProps.revealOrder === "together")) {
        if ((t.flags & 128) !== 0) return t;
      } else if (t.child !== null) {
        t.child.return = t, t = t.child;
        continue;
      }
      if (t === e) break;
      for (; t.sibling === null; ) {
        if (t.return === null || t.return === e) return null;
        t = t.return;
      }
      t.sibling.return = t.return, t = t.sibling;
    }
    return null;
  }
  var zt = 0, Y = null, ue = null, je = null, Fc = false, ia = false, zn = false, Kc = 0, Fa = 0, _a = null, ss = 0;
  function se() {
    throw Error(_(321));
  }
  function Nl(e, t) {
    if (t === null) return false;
    for (var c = 0; c < t.length && c < e.length; c++) if (!ke(e[c], t[c])) return false;
    return true;
  }
  function Ul(e, t, c, u, r, i) {
    return zt = i, Y = t, t.memoizedState = null, t.updateQueue = null, t.lanes = 0, A.H = e === null || e.memoizedState === null ? tf : Il, zn = false, i = c(u, r), zn = false, ia && (i = y_(t, c, u, r)), j_(e), i;
  }
  function j_(e) {
    A.H = ka;
    var t = ue !== null && ue.next !== null;
    if (zt = 0, je = ue = Y = null, Fc = false, Fa = 0, _a = null, t) throw Error(_(300));
    e === null || ye || (e = e.dependencies, e !== null && Lc(e) && (ye = true));
  }
  function y_(e, t, c, u) {
    Y = e;
    var r = 0;
    do {
      if (ia && (_a = null), Fa = 0, ia = false, 25 <= r) throw Error(_(301));
      if (r += 1, je = ue = null, e.updateQueue != null) {
        var i = e.updateQueue;
        i.lastEffect = null, i.events = null, i.stores = null, i.memoCache != null && (i.memoCache.index = 0);
      }
      A.H = nf, i = t(c, u);
    } while (ia);
    return i;
  }
  function ds() {
    var e = A.H, t = e.useState()[0];
    return t = typeof t.then == "function" ? Ka(t) : t, e = e.useState()[0], (ue !== null ? ue.memoizedState : null) !== e && (Y.flags |= 1024), t;
  }
  function Bl() {
    var e = Kc !== 0;
    return Kc = 0, e;
  }
  function Ll(e, t, c) {
    t.updateQueue = e.updateQueue, t.flags &= -2053, e.lanes &= ~c;
  }
  function ql(e) {
    if (Fc) {
      for (e = e.memoizedState; e !== null; ) {
        var t = e.queue;
        t !== null && (t.pending = null), e = e.next;
      }
      Fc = false;
    }
    zt = 0, je = ue = Y = null, ia = false, Fa = Kc = 0, _a = null;
  }
  function Ne() {
    var e = { memoizedState: null, baseState: null, baseQueue: null, queue: null, next: null };
    return je === null ? Y.memoizedState = je = e : je = je.next = e, je;
  }
  function Oe() {
    if (ue === null) {
      var e = Y.alternate;
      e = e !== null ? e.memoizedState : null;
    } else e = ue.next;
    var t = je === null ? Y.memoizedState : je.next;
    if (t !== null) je = t, ue = e;
    else {
      if (e === null) throw Y.alternate === null ? Error(_(467)) : Error(_(310));
      ue = e, e = { memoizedState: ue.memoizedState, baseState: ue.baseState, baseQueue: ue.baseQueue, queue: ue.queue, next: null }, je === null ? Y.memoizedState = je = e : je = je.next = e;
    }
    return je;
  }
  function Jc() {
    return { lastEffect: null, events: null, stores: null, memoCache: null };
  }
  function Ka(e) {
    var t = Fa;
    return Fa += 1, _a === null && (_a = []), e = f_(_a, e, t), t = Y, (je === null ? t.memoizedState : je.next) === null && (t = t.alternate, A.H = t === null || t.memoizedState === null ? tf : Il), e;
  }
  function kc(e) {
    if (e !== null && typeof e == "object") {
      if (typeof e.then == "function") return Ka(e);
      if (e.$$typeof === Re) return Ae(e);
    }
    throw Error(_(438, String(e)));
  }
  function Gl(e) {
    var t = null, c = Y.updateQueue;
    if (c !== null && (t = c.memoCache), t == null) {
      var u = Y.alternate;
      u !== null && (u = u.updateQueue, u !== null && (u = u.memoCache, u != null && (t = { data: u.data.map(function(r) {
        return r.slice();
      }), index: 0 })));
    }
    if (t == null && (t = { data: [], index: 0 }), c === null && (c = Jc(), Y.updateQueue = c), c.memoCache = t, c = t.data[t.index], c === void 0) for (c = t.data[t.index] = Array(e), u = 0; u < e; u++) c[u] = Ln;
    return t.index++, c;
  }
  function Nt(e, t) {
    return typeof t == "function" ? t(e) : t;
  }
  function Ic(e) {
    var t = Oe();
    return Vl(t, ue, e);
  }
  function Vl(e, t, c) {
    var u = e.queue;
    if (u === null) throw Error(_(311));
    u.lastRenderedReducer = c;
    var r = e.baseQueue, i = u.pending;
    if (i !== null) {
      if (r !== null) {
        var f = r.next;
        r.next = i.next, i.next = f;
      }
      t.baseQueue = r = i, u.pending = null;
    }
    if (i = e.baseState, r === null) e.memoizedState = i;
    else {
      t = r.next;
      var b = f = null, d = null, w = t, E = false;
      do {
        var M = w.lane & -536870913;
        if (M !== w.lane ? (F & M) === M : (zt & M) === M) {
          var h = w.revertLane;
          if (h === 0) d !== null && (d = d.next = { lane: 0, revertLane: 0, gesture: null, action: w.action, hasEagerState: w.hasEagerState, eagerState: w.eagerState, next: null }), M === aa && (E = true);
          else if ((zt & h) === h) {
            w = w.next, h === aa && (E = true);
            continue;
          } else M = { lane: 0, revertLane: w.revertLane, gesture: null, action: w.action, hasEagerState: w.hasEagerState, eagerState: w.eagerState, next: null }, d === null ? (b = d = M, f = i) : d = d.next = M, Y.lanes |= h, ln |= h;
          M = w.action, zn && c(i, M), i = w.hasEagerState ? w.eagerState : c(i, M);
        } else h = { lane: M, revertLane: w.revertLane, gesture: w.gesture, action: w.action, hasEagerState: w.hasEagerState, eagerState: w.eagerState, next: null }, d === null ? (b = d = h, f = i) : d = d.next = h, Y.lanes |= M, ln |= M;
        w = w.next;
      } while (w !== null && w !== t);
      if (d === null ? f = i : d.next = b, !ke(i, e.memoizedState) && (ye = true, E && (c = ca, c !== null))) throw c;
      e.memoizedState = i, e.baseState = f, e.baseQueue = d, u.lastRenderedState = i;
    }
    return r === null && (u.lanes = 0), [e.memoizedState, u.dispatch];
  }
  function Yl(e) {
    var t = Oe(), c = t.queue;
    if (c === null) throw Error(_(311));
    c.lastRenderedReducer = e;
    var u = c.dispatch, r = c.pending, i = t.memoizedState;
    if (r !== null) {
      c.pending = null;
      var f = r = r.next;
      do
        i = e(i, f.action), f = f.next;
      while (f !== r);
      ke(i, t.memoizedState) || (ye = true), t.memoizedState = i, t.baseQueue === null && (t.baseState = i), c.lastRenderedState = i;
    }
    return [i, u];
  }
  function w_(e, t, c) {
    var u = Y, r = Oe(), i = k;
    if (i) {
      if (c === void 0) throw Error(_(407));
      c = c();
    } else c = t();
    var f = !ke((ue || r).memoizedState, c);
    if (f && (r.memoizedState = c, ye = true), r = r.queue, Zl(S_.bind(null, u, r, e), [e]), r.getSnapshot !== t || f || je !== null && je.memoizedState.tag & 1) {
      if (u.flags |= 2048, fa(9, { destroy: void 0 }, v_.bind(null, u, r, c, t), null), _e === null) throw Error(_(349));
      i || (zt & 127) !== 0 || h_(u, t, c);
    }
    return c;
  }
  function h_(e, t, c) {
    e.flags |= 16384, e = { getSnapshot: t, value: c }, t = Y.updateQueue, t === null ? (t = Jc(), Y.updateQueue = t, t.stores = [e]) : (c = t.stores, c === null ? t.stores = [e] : c.push(e));
  }
  function v_(e, t, c, u) {
    t.value = c, t.getSnapshot = u, x_(t) && E_(e);
  }
  function S_(e, t, c) {
    return c(function() {
      x_(t) && E_(e);
    });
  }
  function x_(e) {
    var t = e.getSnapshot;
    e = e.value;
    try {
      var c = t();
      return !ke(e, c);
    } catch {
      return true;
    }
  }
  function E_(e) {
    var t = xn(e, 2);
    t !== null && Ze(t, e, 2);
  }
  function Xl(e) {
    var t = Ne();
    if (typeof e == "function") {
      var c = e;
      if (e = c(), zn) {
        Wt(true);
        try {
          c();
        } finally {
          Wt(false);
        }
      }
    }
    return t.memoizedState = t.baseState = e, t.queue = { pending: null, lanes: 0, dispatch: null, lastRenderedReducer: Nt, lastRenderedState: e }, t;
  }
  function A_(e, t, c, u) {
    return e.baseState = c, Vl(e, ue, typeof u == "function" ? u : Nt);
  }
  function gs(e, t, c, u, r) {
    if (eu(e)) throw Error(_(485));
    if (e = t.action, e !== null) {
      var i = { payload: r, action: e, next: null, isTransition: true, status: "pending", value: null, reason: null, listeners: [], then: function(f) {
        i.listeners.push(f);
      } };
      A.T !== null ? c(true) : i.isTransition = false, u(i), c = t.pending, c === null ? (i.next = t.pending = i, T_(t, i)) : (i.next = c.next, t.pending = c.next = i);
    }
  }
  function T_(e, t) {
    var c = t.action, u = t.payload, r = e.state;
    if (t.isTransition) {
      var i = A.T, f = {};
      A.T = f;
      try {
        var b = c(r, u), d = A.S;
        d !== null && d(f, b), M_(e, t, b);
      } catch (w) {
        Ql(e, t, w);
      } finally {
        i !== null && f.types !== null && (i.types = f.types), A.T = i;
      }
    } else try {
      i = c(r, u), M_(e, t, i);
    } catch (w) {
      Ql(e, t, w);
    }
  }
  function M_(e, t, c) {
    c !== null && typeof c == "object" && typeof c.then == "function" ? c.then(function(u) {
      D_(e, t, u);
    }, function(u) {
      return Ql(e, t, u);
    }) : D_(e, t, c);
  }
  function D_(e, t, c) {
    t.status = "fulfilled", t.value = c, R_(t), e.state = c, t = e.pending, t !== null && (c = t.next, c === t ? e.pending = null : (c = c.next, t.next = c, T_(e, c)));
  }
  function Ql(e, t, c) {
    var u = e.pending;
    if (e.pending = null, u !== null) {
      u = u.next;
      do
        t.status = "rejected", t.reason = c, R_(t), t = t.next;
      while (t !== u);
    }
    e.action = null;
  }
  function R_(e) {
    e = e.listeners;
    for (var t = 0; t < e.length; t++) (0, e[t])();
  }
  function C_(e, t) {
    return t;
  }
  function H_(e, t) {
    if (k) {
      var c = _e.formState;
      if (c !== null) {
        e: {
          var u = Y;
          if (k) {
            if (fe) {
              t: {
                for (var r = fe, i = ft; r.nodeType !== 8; ) {
                  if (!i) {
                    r = null;
                    break t;
                  }
                  if (r = bt(r.nextSibling), r === null) {
                    r = null;
                    break t;
                  }
                }
                i = r.data, r = i === "F!" || i === "F" ? r : null;
              }
              if (r) {
                fe = bt(r.nextSibling), u = r.data === "F!";
                break e;
              }
            }
            It(u);
          }
          u = false;
        }
        u && (t = c[0]);
      }
    }
    return c = Ne(), c.memoizedState = c.baseState = t, u = { pending: null, lanes: 0, dispatch: null, lastRenderedReducer: C_, lastRenderedState: t }, c.queue = u, c = $_.bind(null, Y, u), u.dispatch = c, u = Xl(false), i = kl.bind(null, Y, false, u.queue), u = Ne(), r = { state: t, dispatch: null, action: e, pending: null }, u.queue = r, c = gs.bind(null, Y, r, i, c), r.dispatch = c, u.memoizedState = e, [t, c, false];
  }
  function z_(e) {
    var t = Oe();
    return N_(t, ue, e);
  }
  function N_(e, t, c) {
    if (t = Vl(e, t, C_)[0], e = Ic(Nt)[0], typeof t == "object" && t !== null && typeof t.then == "function") try {
      var u = Ka(t);
    } catch (f) {
      throw f === ua ? Vc : f;
    }
    else u = t;
    t = Oe();
    var r = t.queue, i = r.dispatch;
    return c !== t.memoizedState && (Y.flags |= 2048, fa(9, { destroy: void 0 }, ms.bind(null, r, c), null)), [u, i, e];
  }
  function ms(e, t) {
    e.action = t;
  }
  function U_(e) {
    var t = Oe(), c = ue;
    if (c !== null) return N_(t, c, e);
    Oe(), t = t.memoizedState, c = Oe();
    var u = c.queue.dispatch;
    return c.memoizedState = e, [t, u, false];
  }
  function fa(e, t, c, u) {
    return e = { tag: e, create: c, deps: u, inst: t, next: null }, t = Y.updateQueue, t === null && (t = Jc(), Y.updateQueue = t), c = t.lastEffect, c === null ? t.lastEffect = e.next = e : (u = c.next, c.next = e, e.next = u, t.lastEffect = e), e;
  }
  function B_() {
    return Oe().memoizedState;
  }
  function $c(e, t, c, u) {
    var r = Ne();
    Y.flags |= e, r.memoizedState = fa(1 | t, { destroy: void 0 }, c, u === void 0 ? null : u);
  }
  function Pc(e, t, c, u) {
    var r = Oe();
    u = u === void 0 ? null : u;
    var i = r.memoizedState.inst;
    ue !== null && u !== null && Nl(u, ue.memoizedState.deps) ? r.memoizedState = fa(t, i, c, u) : (Y.flags |= e, r.memoizedState = fa(1 | t, i, c, u));
  }
  function L_(e, t) {
    $c(8390656, 8, e, t);
  }
  function Zl(e, t) {
    Pc(2048, 8, e, t);
  }
  function Os(e) {
    Y.flags |= 4;
    var t = Y.updateQueue;
    if (t === null) t = Jc(), Y.updateQueue = t, t.events = [e];
    else {
      var c = t.events;
      c === null ? t.events = [e] : c.push(e);
    }
  }
  function q_(e) {
    var t = Oe().memoizedState;
    return Os({ ref: t, nextImpl: e }), function() {
      if ((ee & 2) !== 0) throw Error(_(440));
      return t.impl.apply(void 0, arguments);
    };
  }
  function G_(e, t) {
    return Pc(4, 2, e, t);
  }
  function V_(e, t) {
    return Pc(4, 4, e, t);
  }
  function Y_(e, t) {
    if (typeof t == "function") {
      e = e();
      var c = t(e);
      return function() {
        typeof c == "function" ? c() : t(null);
      };
    }
    if (t != null) return e = e(), t.current = e, function() {
      t.current = null;
    };
  }
  function X_(e, t, c) {
    c = c != null ? c.concat([e]) : null, Pc(4, 4, Y_.bind(null, t, e), c);
  }
  function Wl() {
  }
  function Q_(e, t) {
    var c = Oe();
    t = t === void 0 ? null : t;
    var u = c.memoizedState;
    return t !== null && Nl(t, u[1]) ? u[0] : (c.memoizedState = [e, t], e);
  }
  function Z_(e, t) {
    var c = Oe();
    t = t === void 0 ? null : t;
    var u = c.memoizedState;
    if (t !== null && Nl(t, u[1])) return u[0];
    if (u = e(), zn) {
      Wt(true);
      try {
        e();
      } finally {
        Wt(false);
      }
    }
    return c.memoizedState = [u, t], u;
  }
  function Fl(e, t, c) {
    return c === void 0 || (zt & 1073741824) !== 0 && (F & 261930) === 0 ? e.memoizedState = t : (e.memoizedState = c, e = Ff(), Y.lanes |= e, ln |= e, c);
  }
  function W_(e, t, c, u) {
    return ke(c, t) ? c : ra.current !== null ? (e = Fl(e, c, u), ke(e, t) || (ye = true), e) : (zt & 42) === 0 || (zt & 1073741824) !== 0 && (F & 261930) === 0 ? (ye = true, e.memoizedState = c) : (e = Ff(), Y.lanes |= e, ln |= e, t);
  }
  function F_(e, t, c, u, r) {
    var i = R.p;
    R.p = i !== 0 && 8 > i ? i : 8;
    var f = A.T, b = {};
    A.T = b, kl(e, false, t, c);
    try {
      var d = r(), w = A.S;
      if (w !== null && w(b, d), d !== null && typeof d == "object" && typeof d.then == "function") {
        var E = bs(d, u);
        Ja(e, t, E, nt(e));
      } else Ja(e, t, u, nt(e));
    } catch (M) {
      Ja(e, t, { then: function() {
      }, status: "rejected", reason: M }, nt());
    } finally {
      R.p = i, f !== null && b.types !== null && (f.types = b.types), A.T = f;
    }
  }
  function ps() {
  }
  function Kl(e, t, c, u) {
    if (e.tag !== 5) throw Error(_(476));
    var r = K_(e).queue;
    F_(e, r, t, G, c === null ? ps : function() {
      return J_(e), c(u);
    });
  }
  function K_(e) {
    var t = e.memoizedState;
    if (t !== null) return t;
    t = { memoizedState: G, baseState: G, baseQueue: null, queue: { pending: null, lanes: 0, dispatch: null, lastRenderedReducer: Nt, lastRenderedState: G }, next: null };
    var c = {};
    return t.next = { memoizedState: c, baseState: c, baseQueue: null, queue: { pending: null, lanes: 0, dispatch: null, lastRenderedReducer: Nt, lastRenderedState: c }, next: null }, e.memoizedState = t, e = e.alternate, e !== null && (e.memoizedState = t), t;
  }
  function J_(e) {
    var t = K_(e);
    t.next === null && (t = e.alternate.memoizedState), Ja(e, t.next.queue, {}, nt());
  }
  function Jl() {
    return Ae(bc);
  }
  function k_() {
    return Oe().memoizedState;
  }
  function I_() {
    return Oe().memoizedState;
  }
  function js(e) {
    for (var t = e.return; t !== null; ) {
      switch (t.tag) {
        case 24:
        case 3:
          var c = nt();
          e = en(c);
          var u = tn(t, e, c);
          u !== null && (Ze(u, t, c), Qa(u, t, c)), t = { cache: Sl() }, e.payload = t;
          return;
      }
      t = t.return;
    }
  }
  function ys(e, t, c) {
    var u = nt();
    c = { lane: u, revertLane: 0, gesture: null, action: c, hasEagerState: false, eagerState: null, next: null }, eu(e) ? P_(t, c) : (c = sl(e, t, c, u), c !== null && (Ze(c, e, u), ef(c, t, u)));
  }
  function $_(e, t, c) {
    var u = nt();
    Ja(e, t, c, u);
  }
  function Ja(e, t, c, u) {
    var r = { lane: u, revertLane: 0, gesture: null, action: c, hasEagerState: false, eagerState: null, next: null };
    if (eu(e)) P_(t, r);
    else {
      var i = e.alternate;
      if (e.lanes === 0 && (i === null || i.lanes === 0) && (i = t.lastRenderedReducer, i !== null)) try {
        var f = t.lastRenderedState, b = i(f, c);
        if (r.hasEagerState = true, r.eagerState = b, ke(b, f)) return zc(e, t, r, 0), _e === null && Hc(), false;
      } catch {
      } finally {
      }
      if (c = sl(e, t, r, u), c !== null) return Ze(c, e, u), ef(c, t, u), true;
    }
    return false;
  }
  function kl(e, t, c, u) {
    if (u = { lane: 2, revertLane: Tr(), gesture: null, action: u, hasEagerState: false, eagerState: null, next: null }, eu(e)) {
      if (t) throw Error(_(479));
    } else t = sl(e, c, u, 2), t !== null && Ze(t, e, 2);
  }
  function eu(e) {
    var t = e.alternate;
    return e === Y || t !== null && t === Y;
  }
  function P_(e, t) {
    ia = Fc = true;
    var c = e.pending;
    c === null ? t.next = t : (t.next = c.next, c.next = t), e.pending = t;
  }
  function ef(e, t, c) {
    if ((c & 4194048) !== 0) {
      var u = t.lanes;
      u &= e.pendingLanes, c |= u, t.lanes = c, ui(e, c);
    }
  }
  var ka = { readContext: Ae, use: kc, useCallback: se, useContext: se, useEffect: se, useImperativeHandle: se, useLayoutEffect: se, useInsertionEffect: se, useMemo: se, useReducer: se, useRef: se, useState: se, useDebugValue: se, useDeferredValue: se, useTransition: se, useSyncExternalStore: se, useId: se, useHostTransitionStatus: se, useFormState: se, useActionState: se, useOptimistic: se, useMemoCache: se, useCacheRefresh: se };
  ka.useEffectEvent = se;
  var tf = { readContext: Ae, use: kc, useCallback: function(e, t) {
    return Ne().memoizedState = [e, t === void 0 ? null : t], e;
  }, useContext: Ae, useEffect: L_, useImperativeHandle: function(e, t, c) {
    c = c != null ? c.concat([e]) : null, $c(4194308, 4, Y_.bind(null, t, e), c);
  }, useLayoutEffect: function(e, t) {
    return $c(4194308, 4, e, t);
  }, useInsertionEffect: function(e, t) {
    $c(4, 2, e, t);
  }, useMemo: function(e, t) {
    var c = Ne();
    t = t === void 0 ? null : t;
    var u = e();
    if (zn) {
      Wt(true);
      try {
        e();
      } finally {
        Wt(false);
      }
    }
    return c.memoizedState = [u, t], u;
  }, useReducer: function(e, t, c) {
    var u = Ne();
    if (c !== void 0) {
      var r = c(t);
      if (zn) {
        Wt(true);
        try {
          c(t);
        } finally {
          Wt(false);
        }
      }
    } else r = t;
    return u.memoizedState = u.baseState = r, e = { pending: null, lanes: 0, dispatch: null, lastRenderedReducer: e, lastRenderedState: r }, u.queue = e, e = e.dispatch = ys.bind(null, Y, e), [u.memoizedState, e];
  }, useRef: function(e) {
    var t = Ne();
    return e = { current: e }, t.memoizedState = e;
  }, useState: function(e) {
    e = Xl(e);
    var t = e.queue, c = $_.bind(null, Y, t);
    return t.dispatch = c, [e.memoizedState, c];
  }, useDebugValue: Wl, useDeferredValue: function(e, t) {
    var c = Ne();
    return Fl(c, e, t);
  }, useTransition: function() {
    var e = Xl(false);
    return e = F_.bind(null, Y, e.queue, true, false), Ne().memoizedState = e, [false, e];
  }, useSyncExternalStore: function(e, t, c) {
    var u = Y, r = Ne();
    if (k) {
      if (c === void 0) throw Error(_(407));
      c = c();
    } else {
      if (c = t(), _e === null) throw Error(_(349));
      (F & 127) !== 0 || h_(u, t, c);
    }
    r.memoizedState = c;
    var i = { value: c, getSnapshot: t };
    return r.queue = i, L_(S_.bind(null, u, i, e), [e]), u.flags |= 2048, fa(9, { destroy: void 0 }, v_.bind(null, u, i, c, t), null), c;
  }, useId: function() {
    var e = Ne(), t = _e.identifierPrefix;
    if (k) {
      var c = ht, u = wt;
      c = (u & ~(1 << 32 - Je(u) - 1)).toString(32) + c, t = "_" + t + "R_" + c, c = Kc++, 0 < c && (t += "H" + c.toString(32)), t += "_";
    } else c = ss++, t = "_" + t + "r_" + c.toString(32) + "_";
    return e.memoizedState = t;
  }, useHostTransitionStatus: Jl, useFormState: H_, useActionState: H_, useOptimistic: function(e) {
    var t = Ne();
    t.memoizedState = t.baseState = e;
    var c = { pending: null, lanes: 0, dispatch: null, lastRenderedReducer: null, lastRenderedState: null };
    return t.queue = c, t = kl.bind(null, Y, true, c), c.dispatch = t, [e, t];
  }, useMemoCache: Gl, useCacheRefresh: function() {
    return Ne().memoizedState = js.bind(null, Y);
  }, useEffectEvent: function(e) {
    var t = Ne(), c = { impl: e };
    return t.memoizedState = c, function() {
      if ((ee & 2) !== 0) throw Error(_(440));
      return c.impl.apply(void 0, arguments);
    };
  } }, Il = { readContext: Ae, use: kc, useCallback: Q_, useContext: Ae, useEffect: Zl, useImperativeHandle: X_, useInsertionEffect: G_, useLayoutEffect: V_, useMemo: Z_, useReducer: Ic, useRef: B_, useState: function() {
    return Ic(Nt);
  }, useDebugValue: Wl, useDeferredValue: function(e, t) {
    var c = Oe();
    return W_(c, ue.memoizedState, e, t);
  }, useTransition: function() {
    var e = Ic(Nt)[0], t = Oe().memoizedState;
    return [typeof e == "boolean" ? e : Ka(e), t];
  }, useSyncExternalStore: w_, useId: k_, useHostTransitionStatus: Jl, useFormState: z_, useActionState: z_, useOptimistic: function(e, t) {
    var c = Oe();
    return A_(c, ue, e, t);
  }, useMemoCache: Gl, useCacheRefresh: I_ };
  Il.useEffectEvent = q_;
  var nf = { readContext: Ae, use: kc, useCallback: Q_, useContext: Ae, useEffect: Zl, useImperativeHandle: X_, useInsertionEffect: G_, useLayoutEffect: V_, useMemo: Z_, useReducer: Yl, useRef: B_, useState: function() {
    return Yl(Nt);
  }, useDebugValue: Wl, useDeferredValue: function(e, t) {
    var c = Oe();
    return ue === null ? Fl(c, e, t) : W_(c, ue.memoizedState, e, t);
  }, useTransition: function() {
    var e = Yl(Nt)[0], t = Oe().memoizedState;
    return [typeof e == "boolean" ? e : Ka(e), t];
  }, useSyncExternalStore: w_, useId: k_, useHostTransitionStatus: Jl, useFormState: U_, useActionState: U_, useOptimistic: function(e, t) {
    var c = Oe();
    return ue !== null ? A_(c, ue, e, t) : (c.baseState = e, [e, c.queue.dispatch]);
  }, useMemoCache: Gl, useCacheRefresh: I_ };
  nf.useEffectEvent = q_;
  function $l(e, t, c, u) {
    t = e.memoizedState, c = c(u, t), c = c == null ? t : z({}, t, c), e.memoizedState = c, e.lanes === 0 && (e.updateQueue.baseState = c);
  }
  var Pl = { enqueueSetState: function(e, t, c) {
    e = e._reactInternals;
    var u = nt(), r = en(u);
    r.payload = t, c != null && (r.callback = c), t = tn(e, r, u), t !== null && (Ze(t, e, u), Qa(t, e, u));
  }, enqueueReplaceState: function(e, t, c) {
    e = e._reactInternals;
    var u = nt(), r = en(u);
    r.tag = 1, r.payload = t, c != null && (r.callback = c), t = tn(e, r, u), t !== null && (Ze(t, e, u), Qa(t, e, u));
  }, enqueueForceUpdate: function(e, t) {
    e = e._reactInternals;
    var c = nt(), u = en(c);
    u.tag = 2, t != null && (u.callback = t), t = tn(e, u, c), t !== null && (Ze(t, e, c), Qa(t, e, c));
  } };
  function af(e, t, c, u, r, i, f) {
    return e = e.stateNode, typeof e.shouldComponentUpdate == "function" ? e.shouldComponentUpdate(u, i, f) : t.prototype && t.prototype.isPureReactComponent ? !Ua(c, u) || !Ua(r, i) : true;
  }
  function cf(e, t, c, u) {
    e = t.state, typeof t.componentWillReceiveProps == "function" && t.componentWillReceiveProps(c, u), typeof t.UNSAFE_componentWillReceiveProps == "function" && t.UNSAFE_componentWillReceiveProps(c, u), t.state !== e && Pl.enqueueReplaceState(t, t.state, null);
  }
  function Nn(e, t) {
    var c = t;
    if ("ref" in t) {
      c = {};
      for (var u in t) u !== "ref" && (c[u] = t[u]);
    }
    if (e = e.defaultProps) {
      c === t && (c = z({}, c));
      for (var r in e) c[r] === void 0 && (c[r] = e[r]);
    }
    return c;
  }
  function uf(e) {
    Cc(e);
  }
  function lf(e) {
    console.error(e);
  }
  function rf(e) {
    Cc(e);
  }
  function tu(e, t) {
    try {
      var c = e.onUncaughtError;
      c(t.value, { componentStack: t.stack });
    } catch (u) {
      setTimeout(function() {
        throw u;
      });
    }
  }
  function _f(e, t, c) {
    try {
      var u = e.onCaughtError;
      u(c.value, { componentStack: c.stack, errorBoundary: t.tag === 1 ? t.stateNode : null });
    } catch (r) {
      setTimeout(function() {
        throw r;
      });
    }
  }
  function er(e, t, c) {
    return c = en(c), c.tag = 3, c.payload = { element: null }, c.callback = function() {
      tu(e, t);
    }, c;
  }
  function ff(e) {
    return e = en(e), e.tag = 3, e;
  }
  function of(e, t, c, u) {
    var r = c.type.getDerivedStateFromError;
    if (typeof r == "function") {
      var i = u.value;
      e.payload = function() {
        return r(i);
      }, e.callback = function() {
        _f(t, c, u);
      };
    }
    var f = c.stateNode;
    f !== null && typeof f.componentDidCatch == "function" && (e.callback = function() {
      _f(t, c, u), typeof r != "function" && (rn === null ? rn = /* @__PURE__ */ new Set([this]) : rn.add(this));
      var b = u.stack;
      this.componentDidCatch(u.value, { componentStack: b !== null ? b : "" });
    });
  }
  function ws(e, t, c, u, r) {
    if (c.flags |= 32768, u !== null && typeof u == "object" && typeof u.then == "function") {
      if (t = c.alternate, t !== null && na(t, c, r, true), c = $e.current, c !== null) {
        switch (c.tag) {
          case 31:
          case 13:
            return ot === null ? su() : c.alternate === null && de === 0 && (de = 3), c.flags &= -257, c.flags |= 65536, c.lanes = r, u === Yc ? c.flags |= 16384 : (t = c.updateQueue, t === null ? c.updateQueue = /* @__PURE__ */ new Set([u]) : t.add(u), xr(e, u, r)), false;
          case 22:
            return c.flags |= 65536, u === Yc ? c.flags |= 16384 : (t = c.updateQueue, t === null ? (t = { transitions: null, markerInstances: null, retryQueue: /* @__PURE__ */ new Set([u]) }, c.updateQueue = t) : (c = t.retryQueue, c === null ? t.retryQueue = /* @__PURE__ */ new Set([u]) : c.add(u)), xr(e, u, r)), false;
        }
        throw Error(_(435, c.tag));
      }
      return xr(e, u, r), su(), false;
    }
    if (k) return t = $e.current, t !== null ? ((t.flags & 65536) === 0 && (t.flags |= 256), t.flags |= 65536, t.lanes = r, u !== jl && (e = Error(_(422), { cause: u }), qa(rt(e, c)))) : (u !== jl && (t = Error(_(423), { cause: u }), qa(rt(t, c))), e = e.current.alternate, e.flags |= 65536, r &= -r, e.lanes |= r, u = rt(u, c), r = er(e.stateNode, u, r), Dl(e, r), de !== 4 && (de = 2)), false;
    var i = Error(_(520), { cause: u });
    if (i = rt(i, c), cc === null ? cc = [i] : cc.push(i), de !== 4 && (de = 2), t === null) return true;
    u = rt(u, c), c = t;
    do {
      switch (c.tag) {
        case 3:
          return c.flags |= 65536, e = r & -r, c.lanes |= e, e = er(c.stateNode, u, e), Dl(c, e), false;
        case 1:
          if (t = c.type, i = c.stateNode, (c.flags & 128) === 0 && (typeof t.getDerivedStateFromError == "function" || i !== null && typeof i.componentDidCatch == "function" && (rn === null || !rn.has(i)))) return c.flags |= 65536, r &= -r, c.lanes |= r, r = ff(r), of(r, e, c, u), Dl(c, r), false;
      }
      c = c.return;
    } while (c !== null);
    return false;
  }
  var tr = Error(_(461)), ye = false;
  function Te(e, t, c, u) {
    t.child = e === null ? d_(t, null, c, u) : Hn(t, e.child, c, u);
  }
  function bf(e, t, c, u, r) {
    c = c.render;
    var i = t.ref;
    if ("ref" in u) {
      var f = {};
      for (var b in u) b !== "ref" && (f[b] = u[b]);
    } else f = u;
    return Mn(t), u = Ul(e, t, c, f, i, r), b = Bl(), e !== null && !ye ? (Ll(e, t, r), Ut(e, t, r)) : (k && b && Ol(t), t.flags |= 1, Te(e, t, u, r), t.child);
  }
  function sf(e, t, c, u, r) {
    if (e === null) {
      var i = c.type;
      return typeof i == "function" && !dl(i) && i.defaultProps === void 0 && c.compare === null ? (t.tag = 15, t.type = i, df(e, t, i, u, r)) : (e = Uc(c.type, null, u, t, t.mode, r), e.ref = t.ref, e.return = t, t.child = e);
    }
    if (i = e.child, !_r(e, r)) {
      var f = i.memoizedProps;
      if (c = c.compare, c = c !== null ? c : Ua, c(f, u) && e.ref === t.ref) return Ut(e, t, r);
    }
    return t.flags |= 1, e = Dt(i, u), e.ref = t.ref, e.return = t, t.child = e;
  }
  function df(e, t, c, u, r) {
    if (e !== null) {
      var i = e.memoizedProps;
      if (Ua(i, u) && e.ref === t.ref) if (ye = false, t.pendingProps = u = i, _r(e, r)) (e.flags & 131072) !== 0 && (ye = true);
      else return t.lanes = e.lanes, Ut(e, t, r);
    }
    return nr(e, t, c, u, r);
  }
  function gf(e, t, c, u) {
    var r = u.children, i = e !== null ? e.memoizedState : null;
    if (e === null && t.stateNode === null && (t.stateNode = { _visibility: 1, _pendingMarkers: null, _retryCache: null, _transitions: null }), u.mode === "hidden") {
      if ((t.flags & 128) !== 0) {
        if (i = i !== null ? i.baseLanes | c : c, e !== null) {
          for (u = t.child = e.child, r = 0; u !== null; ) r = r | u.lanes | u.childLanes, u = u.sibling;
          u = r & ~i;
        } else u = 0, t.child = null;
        return mf(e, t, i, c, u);
      }
      if ((c & 536870912) !== 0) t.memoizedState = { baseLanes: 0, cachePool: null }, e !== null && Gc(t, i !== null ? i.cachePool : null), i !== null ? O_(t, i) : Cl(), p_(t);
      else return u = t.lanes = 536870912, mf(e, t, i !== null ? i.baseLanes | c : c, c, u);
    } else i !== null ? (Gc(t, i.cachePool), O_(t, i), an(), t.memoizedState = null) : (e !== null && Gc(t, null), Cl(), an());
    return Te(e, t, r, c), t.child;
  }
  function Ia(e, t) {
    return e !== null && e.tag === 22 || t.stateNode !== null || (t.stateNode = { _visibility: 1, _pendingMarkers: null, _retryCache: null, _transitions: null }), t.sibling;
  }
  function mf(e, t, c, u, r) {
    var i = El();
    return i = i === null ? null : { parent: pe._currentValue, pool: i }, t.memoizedState = { baseLanes: c, cachePool: i }, e !== null && Gc(t, null), Cl(), p_(t), e !== null && na(e, t, u, true), t.childLanes = r, null;
  }
  function nu(e, t) {
    return t = cu({ mode: t.mode, children: t.children }, e.mode), t.ref = e.ref, e.child = t, t.return = e, t;
  }
  function Of(e, t, c) {
    return Hn(t, e.child, null, c), e = nu(t, t.pendingProps), e.flags |= 2, Pe(t), t.memoizedState = null, e;
  }
  function hs(e, t, c) {
    var u = t.pendingProps, r = (t.flags & 128) !== 0;
    if (t.flags &= -129, e === null) {
      if (k) {
        if (u.mode === "hidden") return e = nu(t, u), t.lanes = 536870912, Ia(null, e);
        if (zl(t), (e = fe) ? (e = Do(e, ft), e = e !== null && e.data === "&" ? e : null, e !== null && (t.memoizedState = { dehydrated: e, treeContext: Jt !== null ? { id: wt, overflow: ht } : null, retryLane: 536870912, hydrationErrors: null }, c = Pi(e), c.return = t, t.child = c, Ee = t, fe = null)) : e = null, e === null) throw It(t);
        return t.lanes = 536870912, null;
      }
      return nu(t, u);
    }
    var i = e.memoizedState;
    if (i !== null) {
      var f = i.dehydrated;
      if (zl(t), r) if (t.flags & 256) t.flags &= -257, t = Of(e, t, c);
      else if (t.memoizedState !== null) t.child = e.child, t.flags |= 128, t = null;
      else throw Error(_(558));
      else if (ye || na(e, t, c, false), r = (c & e.childLanes) !== 0, ye || r) {
        if (u = _e, u !== null && (f = li(u, c), f !== 0 && f !== i.retryLane)) throw i.retryLane = f, xn(e, f), Ze(u, e, f), tr;
        su(), t = Of(e, t, c);
      } else e = i.treeContext, fe = bt(f.nextSibling), Ee = t, k = true, kt = null, ft = false, e !== null && n_(t, e), t = nu(t, u), t.flags |= 4096;
      return t;
    }
    return e = Dt(e.child, { mode: u.mode, children: u.children }), e.ref = t.ref, t.child = e, e.return = t, e;
  }
  function au(e, t) {
    var c = t.ref;
    if (c === null) e !== null && e.ref !== null && (t.flags |= 4194816);
    else {
      if (typeof c != "function" && typeof c != "object") throw Error(_(284));
      (e === null || e.ref !== c) && (t.flags |= 4194816);
    }
  }
  function nr(e, t, c, u, r) {
    return Mn(t), c = Ul(e, t, c, u, void 0, r), u = Bl(), e !== null && !ye ? (Ll(e, t, r), Ut(e, t, r)) : (k && u && Ol(t), t.flags |= 1, Te(e, t, c, r), t.child);
  }
  function pf(e, t, c, u, r, i) {
    return Mn(t), t.updateQueue = null, c = y_(t, u, c, r), j_(e), u = Bl(), e !== null && !ye ? (Ll(e, t, i), Ut(e, t, i)) : (k && u && Ol(t), t.flags |= 1, Te(e, t, c, i), t.child);
  }
  function jf(e, t, c, u, r) {
    if (Mn(t), t.stateNode === null) {
      var i = $n, f = c.contextType;
      typeof f == "object" && f !== null && (i = Ae(f)), i = new c(u, i), t.memoizedState = i.state !== null && i.state !== void 0 ? i.state : null, i.updater = Pl, t.stateNode = i, i._reactInternals = t, i = t.stateNode, i.props = u, i.state = t.memoizedState, i.refs = {}, Tl(t), f = c.contextType, i.context = typeof f == "object" && f !== null ? Ae(f) : $n, i.state = t.memoizedState, f = c.getDerivedStateFromProps, typeof f == "function" && ($l(t, c, f, u), i.state = t.memoizedState), typeof c.getDerivedStateFromProps == "function" || typeof i.getSnapshotBeforeUpdate == "function" || typeof i.UNSAFE_componentWillMount != "function" && typeof i.componentWillMount != "function" || (f = i.state, typeof i.componentWillMount == "function" && i.componentWillMount(), typeof i.UNSAFE_componentWillMount == "function" && i.UNSAFE_componentWillMount(), f !== i.state && Pl.enqueueReplaceState(i, i.state, null), Wa(t, u, i, r), Za(), i.state = t.memoizedState), typeof i.componentDidMount == "function" && (t.flags |= 4194308), u = true;
    } else if (e === null) {
      i = t.stateNode;
      var b = t.memoizedProps, d = Nn(c, b);
      i.props = d;
      var w = i.context, E = c.contextType;
      f = $n, typeof E == "object" && E !== null && (f = Ae(E));
      var M = c.getDerivedStateFromProps;
      E = typeof M == "function" || typeof i.getSnapshotBeforeUpdate == "function", b = t.pendingProps !== b, E || typeof i.UNSAFE_componentWillReceiveProps != "function" && typeof i.componentWillReceiveProps != "function" || (b || w !== f) && cf(t, i, u, f), Pt = false;
      var h = t.memoizedState;
      i.state = h, Wa(t, u, i, r), Za(), w = t.memoizedState, b || h !== w || Pt ? (typeof M == "function" && ($l(t, c, M, u), w = t.memoizedState), (d = Pt || af(t, c, d, u, h, w, f)) ? (E || typeof i.UNSAFE_componentWillMount != "function" && typeof i.componentWillMount != "function" || (typeof i.componentWillMount == "function" && i.componentWillMount(), typeof i.UNSAFE_componentWillMount == "function" && i.UNSAFE_componentWillMount()), typeof i.componentDidMount == "function" && (t.flags |= 4194308)) : (typeof i.componentDidMount == "function" && (t.flags |= 4194308), t.memoizedProps = u, t.memoizedState = w), i.props = u, i.state = w, i.context = f, u = d) : (typeof i.componentDidMount == "function" && (t.flags |= 4194308), u = false);
    } else {
      i = t.stateNode, Ml(e, t), f = t.memoizedProps, E = Nn(c, f), i.props = E, M = t.pendingProps, h = i.context, w = c.contextType, d = $n, typeof w == "object" && w !== null && (d = Ae(w)), b = c.getDerivedStateFromProps, (w = typeof b == "function" || typeof i.getSnapshotBeforeUpdate == "function") || typeof i.UNSAFE_componentWillReceiveProps != "function" && typeof i.componentWillReceiveProps != "function" || (f !== M || h !== d) && cf(t, i, u, d), Pt = false, h = t.memoizedState, i.state = h, Wa(t, u, i, r), Za();
      var v = t.memoizedState;
      f !== M || h !== v || Pt || e !== null && e.dependencies !== null && Lc(e.dependencies) ? (typeof b == "function" && ($l(t, c, b, u), v = t.memoizedState), (E = Pt || af(t, c, E, u, h, v, d) || e !== null && e.dependencies !== null && Lc(e.dependencies)) ? (w || typeof i.UNSAFE_componentWillUpdate != "function" && typeof i.componentWillUpdate != "function" || (typeof i.componentWillUpdate == "function" && i.componentWillUpdate(u, v, d), typeof i.UNSAFE_componentWillUpdate == "function" && i.UNSAFE_componentWillUpdate(u, v, d)), typeof i.componentDidUpdate == "function" && (t.flags |= 4), typeof i.getSnapshotBeforeUpdate == "function" && (t.flags |= 1024)) : (typeof i.componentDidUpdate != "function" || f === e.memoizedProps && h === e.memoizedState || (t.flags |= 4), typeof i.getSnapshotBeforeUpdate != "function" || f === e.memoizedProps && h === e.memoizedState || (t.flags |= 1024), t.memoizedProps = u, t.memoizedState = v), i.props = u, i.state = v, i.context = d, u = E) : (typeof i.componentDidUpdate != "function" || f === e.memoizedProps && h === e.memoizedState || (t.flags |= 4), typeof i.getSnapshotBeforeUpdate != "function" || f === e.memoizedProps && h === e.memoizedState || (t.flags |= 1024), u = false);
    }
    return i = u, au(e, t), u = (t.flags & 128) !== 0, i || u ? (i = t.stateNode, c = u && typeof c.getDerivedStateFromError != "function" ? null : i.render(), t.flags |= 1, e !== null && u ? (t.child = Hn(t, e.child, null, r), t.child = Hn(t, null, c, r)) : Te(e, t, c, r), t.memoizedState = i.state, e = t.child) : e = Ut(e, t, r), e;
  }
  function yf(e, t, c, u) {
    return An(), t.flags |= 256, Te(e, t, c, u), t.child;
  }
  var ar = { dehydrated: null, treeContext: null, retryLane: 0, hydrationErrors: null };
  function cr(e) {
    return { baseLanes: e, cachePool: i_() };
  }
  function ur(e, t, c) {
    return e = e !== null ? e.childLanes & ~c : 0, t && (e |= tt), e;
  }
  function wf(e, t, c) {
    var u = t.pendingProps, r = false, i = (t.flags & 128) !== 0, f;
    if ((f = i) || (f = e !== null && e.memoizedState === null ? false : (me.current & 2) !== 0), f && (r = true, t.flags &= -129), f = (t.flags & 32) !== 0, t.flags &= -33, e === null) {
      if (k) {
        if (r ? nn(t) : an(), (e = fe) ? (e = Do(e, ft), e = e !== null && e.data !== "&" ? e : null, e !== null && (t.memoizedState = { dehydrated: e, treeContext: Jt !== null ? { id: wt, overflow: ht } : null, retryLane: 536870912, hydrationErrors: null }, c = Pi(e), c.return = t, t.child = c, Ee = t, fe = null)) : e = null, e === null) throw It(t);
        return Vr(e) ? t.lanes = 32 : t.lanes = 536870912, null;
      }
      var b = u.children;
      return u = u.fallback, r ? (an(), r = t.mode, b = cu({ mode: "hidden", children: b }, r), u = En(u, r, c, null), b.return = t, u.return = t, b.sibling = u, t.child = b, u = t.child, u.memoizedState = cr(c), u.childLanes = ur(e, f, c), t.memoizedState = ar, Ia(null, u)) : (nn(t), lr(t, b));
    }
    var d = e.memoizedState;
    if (d !== null && (b = d.dehydrated, b !== null)) {
      if (i) t.flags & 256 ? (nn(t), t.flags &= -257, t = rr(e, t, c)) : t.memoizedState !== null ? (an(), t.child = e.child, t.flags |= 128, t = null) : (an(), b = u.fallback, r = t.mode, u = cu({ mode: "visible", children: u.children }, r), b = En(b, r, c, null), b.flags |= 2, u.return = t, b.return = t, u.sibling = b, t.child = u, Hn(t, e.child, null, c), u = t.child, u.memoizedState = cr(c), u.childLanes = ur(e, f, c), t.memoizedState = ar, t = Ia(null, u));
      else if (nn(t), Vr(b)) {
        if (f = b.nextSibling && b.nextSibling.dataset, f) var w = f.dgst;
        f = w, u = Error(_(419)), u.stack = "", u.digest = f, qa({ value: u, source: null, stack: null }), t = rr(e, t, c);
      } else if (ye || na(e, t, c, false), f = (c & e.childLanes) !== 0, ye || f) {
        if (f = _e, f !== null && (u = li(f, c), u !== 0 && u !== d.retryLane)) throw d.retryLane = u, xn(e, u), Ze(f, e, u), tr;
        Gr(b) || su(), t = rr(e, t, c);
      } else Gr(b) ? (t.flags |= 192, t.child = e.child, t = null) : (e = d.treeContext, fe = bt(b.nextSibling), Ee = t, k = true, kt = null, ft = false, e !== null && n_(t, e), t = lr(t, u.children), t.flags |= 4096);
      return t;
    }
    return r ? (an(), b = u.fallback, r = t.mode, d = e.child, w = d.sibling, u = Dt(d, { mode: "hidden", children: u.children }), u.subtreeFlags = d.subtreeFlags & 65011712, w !== null ? b = Dt(w, b) : (b = En(b, r, c, null), b.flags |= 2), b.return = t, u.return = t, u.sibling = b, t.child = u, Ia(null, u), u = t.child, b = e.child.memoizedState, b === null ? b = cr(c) : (r = b.cachePool, r !== null ? (d = pe._currentValue, r = r.parent !== d ? { parent: d, pool: d } : r) : r = i_(), b = { baseLanes: b.baseLanes | c, cachePool: r }), u.memoizedState = b, u.childLanes = ur(e, f, c), t.memoizedState = ar, Ia(e.child, u)) : (nn(t), c = e.child, e = c.sibling, c = Dt(c, { mode: "visible", children: u.children }), c.return = t, c.sibling = null, e !== null && (f = t.deletions, f === null ? (t.deletions = [e], t.flags |= 16) : f.push(e)), t.child = c, t.memoizedState = null, c);
  }
  function lr(e, t) {
    return t = cu({ mode: "visible", children: t }, e.mode), t.return = e, e.child = t;
  }
  function cu(e, t) {
    return e = Ie(22, e, null, t), e.lanes = 0, e;
  }
  function rr(e, t, c) {
    return Hn(t, e.child, null, c), e = lr(t, t.pendingProps.children), e.flags |= 2, t.memoizedState = null, e;
  }
  function hf(e, t, c) {
    e.lanes |= t;
    var u = e.alternate;
    u !== null && (u.lanes |= t), hl(e.return, t, c);
  }
  function ir(e, t, c, u, r, i) {
    var f = e.memoizedState;
    f === null ? e.memoizedState = { isBackwards: t, rendering: null, renderingStartTime: 0, last: u, tail: c, tailMode: r, treeForkCount: i } : (f.isBackwards = t, f.rendering = null, f.renderingStartTime = 0, f.last = u, f.tail = c, f.tailMode = r, f.treeForkCount = i);
  }
  function vf(e, t, c) {
    var u = t.pendingProps, r = u.revealOrder, i = u.tail;
    u = u.children;
    var f = me.current, b = (f & 2) !== 0;
    if (b ? (f = f & 1 | 2, t.flags |= 128) : f &= 1, C(me, f), Te(e, t, u, c), u = k ? La : 0, !b && e !== null && (e.flags & 128) !== 0) e: for (e = t.child; e !== null; ) {
      if (e.tag === 13) e.memoizedState !== null && hf(e, c, t);
      else if (e.tag === 19) hf(e, c, t);
      else if (e.child !== null) {
        e.child.return = e, e = e.child;
        continue;
      }
      if (e === t) break e;
      for (; e.sibling === null; ) {
        if (e.return === null || e.return === t) break e;
        e = e.return;
      }
      e.sibling.return = e.return, e = e.sibling;
    }
    switch (r) {
      case "forwards":
        for (c = t.child, r = null; c !== null; ) e = c.alternate, e !== null && Wc(e) === null && (r = c), c = c.sibling;
        c = r, c === null ? (r = t.child, t.child = null) : (r = c.sibling, c.sibling = null), ir(t, false, r, c, i, u);
        break;
      case "backwards":
      case "unstable_legacy-backwards":
        for (c = null, r = t.child, t.child = null; r !== null; ) {
          if (e = r.alternate, e !== null && Wc(e) === null) {
            t.child = r;
            break;
          }
          e = r.sibling, r.sibling = c, c = r, r = e;
        }
        ir(t, true, c, null, i, u);
        break;
      case "together":
        ir(t, false, null, null, void 0, u);
        break;
      default:
        t.memoizedState = null;
    }
    return t.child;
  }
  function Ut(e, t, c) {
    if (e !== null && (t.dependencies = e.dependencies), ln |= t.lanes, (c & t.childLanes) === 0) if (e !== null) {
      if (na(e, t, c, false), (c & t.childLanes) === 0) return null;
    } else return null;
    if (e !== null && t.child !== e.child) throw Error(_(153));
    if (t.child !== null) {
      for (e = t.child, c = Dt(e, e.pendingProps), t.child = c, c.return = t; e.sibling !== null; ) e = e.sibling, c = c.sibling = Dt(e, e.pendingProps), c.return = t;
      c.sibling = null;
    }
    return t.child;
  }
  function _r(e, t) {
    return (e.lanes & t) !== 0 ? true : (e = e.dependencies, !!(e !== null && Lc(e)));
  }
  function vs(e, t, c) {
    switch (t.tag) {
      case 3:
        ze(t, t.stateNode.containerInfo), $t(t, pe, e.memoizedState.cache), An();
        break;
      case 27:
      case 5:
        va(t);
        break;
      case 4:
        ze(t, t.stateNode.containerInfo);
        break;
      case 10:
        $t(t, t.type, t.memoizedProps.value);
        break;
      case 31:
        if (t.memoizedState !== null) return t.flags |= 128, zl(t), null;
        break;
      case 13:
        var u = t.memoizedState;
        if (u !== null) return u.dehydrated !== null ? (nn(t), t.flags |= 128, null) : (c & t.child.childLanes) !== 0 ? wf(e, t, c) : (nn(t), e = Ut(e, t, c), e !== null ? e.sibling : null);
        nn(t);
        break;
      case 19:
        var r = (e.flags & 128) !== 0;
        if (u = (c & t.childLanes) !== 0, u || (na(e, t, c, false), u = (c & t.childLanes) !== 0), r) {
          if (u) return vf(e, t, c);
          t.flags |= 128;
        }
        if (r = t.memoizedState, r !== null && (r.rendering = null, r.tail = null, r.lastEffect = null), C(me, me.current), u) break;
        return null;
      case 22:
        return t.lanes = 0, gf(e, t, c, t.pendingProps);
      case 24:
        $t(t, pe, e.memoizedState.cache);
    }
    return Ut(e, t, c);
  }
  function Sf(e, t, c) {
    if (e !== null) if (e.memoizedProps !== t.pendingProps) ye = true;
    else {
      if (!_r(e, c) && (t.flags & 128) === 0) return ye = false, vs(e, t, c);
      ye = (e.flags & 131072) !== 0;
    }
    else ye = false, k && (t.flags & 1048576) !== 0 && t_(t, La, t.index);
    switch (t.lanes = 0, t.tag) {
      case 16:
        e: {
          var u = t.pendingProps;
          if (e = Rn(t.elementType), t.type = e, typeof e == "function") dl(e) ? (u = Nn(e, u), t.tag = 1, t = jf(null, t, e, u, c)) : (t.tag = 0, t = nr(null, t, e, u, c));
          else {
            if (e != null) {
              var r = e.$$typeof;
              if (r === at) {
                t.tag = 11, t = bf(null, t, e, u, c);
                break e;
              } else if (r === J) {
                t.tag = 14, t = sf(null, t, e, u, c);
                break e;
              }
            }
            throw t = Et(e) || e, Error(_(306, t, ""));
          }
        }
        return t;
      case 0:
        return nr(e, t, t.type, t.pendingProps, c);
      case 1:
        return u = t.type, r = Nn(u, t.pendingProps), jf(e, t, u, r, c);
      case 3:
        e: {
          if (ze(t, t.stateNode.containerInfo), e === null) throw Error(_(387));
          u = t.pendingProps;
          var i = t.memoizedState;
          r = i.element, Ml(e, t), Wa(t, u, null, c);
          var f = t.memoizedState;
          if (u = f.cache, $t(t, pe, u), u !== i.cache && vl(t, [pe], c, true), Za(), u = f.element, i.isDehydrated) if (i = { element: u, isDehydrated: false, cache: f.cache }, t.updateQueue.baseState = i, t.memoizedState = i, t.flags & 256) {
            t = yf(e, t, u, c);
            break e;
          } else if (u !== r) {
            r = rt(Error(_(424)), t), qa(r), t = yf(e, t, u, c);
            break e;
          } else {
            switch (e = t.stateNode.containerInfo, e.nodeType) {
              case 9:
                e = e.body;
                break;
              default:
                e = e.nodeName === "HTML" ? e.ownerDocument.body : e;
            }
            for (fe = bt(e.firstChild), Ee = t, k = true, kt = null, ft = true, c = d_(t, null, u, c), t.child = c; c; ) c.flags = c.flags & -3 | 4096, c = c.sibling;
          }
          else {
            if (An(), u === r) {
              t = Ut(e, t, c);
              break e;
            }
            Te(e, t, u, c);
          }
          t = t.child;
        }
        return t;
      case 26:
        return au(e, t), e === null ? (c = Uo(t.type, null, t.pendingProps, null)) ? t.memoizedState = c : k || (c = t.type, e = t.pendingProps, u = yu(Q.current).createElement(c), u[xe] = t, u[qe] = e, Me(u, c, e), ve(u), t.stateNode = u) : t.memoizedState = Uo(t.type, e.memoizedProps, t.pendingProps, e.memoizedState), null;
      case 27:
        return va(t), e === null && k && (u = t.stateNode = Ho(t.type, t.pendingProps, Q.current), Ee = t, ft = true, r = fe, bn(t.type) ? (Yr = r, fe = bt(u.firstChild)) : fe = r), Te(e, t, t.pendingProps.children, c), au(e, t), e === null && (t.flags |= 4194304), t.child;
      case 5:
        return e === null && k && ((r = u = fe) && (u = Ps(u, t.type, t.pendingProps, ft), u !== null ? (t.stateNode = u, Ee = t, fe = bt(u.firstChild), ft = false, r = true) : r = false), r || It(t)), va(t), r = t.type, i = t.pendingProps, f = e !== null ? e.memoizedProps : null, u = i.children, Br(r, i) ? u = null : f !== null && Br(r, f) && (t.flags |= 32), t.memoizedState !== null && (r = Ul(e, t, ds, null, null, c), bc._currentValue = r), au(e, t), Te(e, t, u, c), t.child;
      case 6:
        return e === null && k && ((e = c = fe) && (c = ed(c, t.pendingProps, ft), c !== null ? (t.stateNode = c, Ee = t, fe = null, e = true) : e = false), e || It(t)), null;
      case 13:
        return wf(e, t, c);
      case 4:
        return ze(t, t.stateNode.containerInfo), u = t.pendingProps, e === null ? t.child = Hn(t, null, u, c) : Te(e, t, u, c), t.child;
      case 11:
        return bf(e, t, t.type, t.pendingProps, c);
      case 7:
        return Te(e, t, t.pendingProps, c), t.child;
      case 8:
        return Te(e, t, t.pendingProps.children, c), t.child;
      case 12:
        return Te(e, t, t.pendingProps.children, c), t.child;
      case 10:
        return u = t.pendingProps, $t(t, t.type, u.value), Te(e, t, u.children, c), t.child;
      case 9:
        return r = t.type._context, u = t.pendingProps.children, Mn(t), r = Ae(r), u = u(r), t.flags |= 1, Te(e, t, u, c), t.child;
      case 14:
        return sf(e, t, t.type, t.pendingProps, c);
      case 15:
        return df(e, t, t.type, t.pendingProps, c);
      case 19:
        return vf(e, t, c);
      case 31:
        return hs(e, t, c);
      case 22:
        return gf(e, t, c, t.pendingProps);
      case 24:
        return Mn(t), u = Ae(pe), e === null ? (r = El(), r === null && (r = _e, i = Sl(), r.pooledCache = i, i.refCount++, i !== null && (r.pooledCacheLanes |= c), r = i), t.memoizedState = { parent: u, cache: r }, Tl(t), $t(t, pe, r)) : ((e.lanes & c) !== 0 && (Ml(e, t), Wa(t, null, null, c), Za()), r = e.memoizedState, i = t.memoizedState, r.parent !== u ? (r = { parent: u, cache: u }, t.memoizedState = r, t.lanes === 0 && (t.memoizedState = t.updateQueue.baseState = r), $t(t, pe, u)) : (u = i.cache, $t(t, pe, u), u !== r.cache && vl(t, [pe], c, true))), Te(e, t, t.pendingProps.children, c), t.child;
      case 29:
        throw t.pendingProps;
    }
    throw Error(_(156, t.tag));
  }
  function Bt(e) {
    e.flags |= 4;
  }
  function fr(e, t, c, u, r) {
    if ((t = (e.mode & 32) !== 0) && (t = false), t) {
      if (e.flags |= 16777216, (r & 335544128) === r) if (e.stateNode.complete) e.flags |= 8192;
      else if (If()) e.flags |= 8192;
      else throw Cn = Yc, Al;
    } else e.flags &= -16777217;
  }
  function xf(e, t) {
    if (t.type !== "stylesheet" || (t.state.loading & 4) !== 0) e.flags &= -16777217;
    else if (e.flags |= 16777216, !Vo(t)) if (If()) e.flags |= 8192;
    else throw Cn = Yc, Al;
  }
  function uu(e, t) {
    t !== null && (e.flags |= 4), e.flags & 16384 && (t = e.tag !== 22 ? ai() : 536870912, e.lanes |= t, da |= t);
  }
  function $a(e, t) {
    if (!k) switch (e.tailMode) {
      case "hidden":
        t = e.tail;
        for (var c = null; t !== null; ) t.alternate !== null && (c = t), t = t.sibling;
        c === null ? e.tail = null : c.sibling = null;
        break;
      case "collapsed":
        c = e.tail;
        for (var u = null; c !== null; ) c.alternate !== null && (u = c), c = c.sibling;
        u === null ? t || e.tail === null ? e.tail = null : e.tail.sibling = null : u.sibling = null;
    }
  }
  function oe(e) {
    var t = e.alternate !== null && e.alternate.child === e.child, c = 0, u = 0;
    if (t) for (var r = e.child; r !== null; ) c |= r.lanes | r.childLanes, u |= r.subtreeFlags & 65011712, u |= r.flags & 65011712, r.return = e, r = r.sibling;
    else for (r = e.child; r !== null; ) c |= r.lanes | r.childLanes, u |= r.subtreeFlags, u |= r.flags, r.return = e, r = r.sibling;
    return e.subtreeFlags |= u, e.childLanes = c, t;
  }
  function Ss(e, t, c) {
    var u = t.pendingProps;
    switch (pl(t), t.tag) {
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
        return c = t.stateNode, u = null, e !== null && (u = e.memoizedState.cache), t.memoizedState.cache !== u && (t.flags |= 2048), Ht(pe), ge(), c.pendingContext && (c.context = c.pendingContext, c.pendingContext = null), (e === null || e.child === null) && (ta(t) ? Bt(t) : e === null || e.memoizedState.isDehydrated && (t.flags & 256) === 0 || (t.flags |= 1024, yl())), oe(t), null;
      case 26:
        var r = t.type, i = t.memoizedState;
        return e === null ? (Bt(t), i !== null ? (oe(t), xf(t, i)) : (oe(t), fr(t, r, null, u, c))) : i ? i !== e.memoizedState ? (Bt(t), oe(t), xf(t, i)) : (oe(t), t.flags &= -16777217) : (e = e.memoizedProps, e !== u && Bt(t), oe(t), fr(t, r, e, u, c)), null;
      case 27:
        if (mc(t), c = Q.current, r = t.type, e !== null && t.stateNode != null) e.memoizedProps !== u && Bt(t);
        else {
          if (!u) {
            if (t.stateNode === null) throw Error(_(166));
            return oe(t), null;
          }
          e = U.current, ta(t) ? a_(t) : (e = Ho(r, u, c), t.stateNode = e, Bt(t));
        }
        return oe(t), null;
      case 5:
        if (mc(t), r = t.type, e !== null && t.stateNode != null) e.memoizedProps !== u && Bt(t);
        else {
          if (!u) {
            if (t.stateNode === null) throw Error(_(166));
            return oe(t), null;
          }
          if (i = U.current, ta(t)) a_(t);
          else {
            var f = yu(Q.current);
            switch (i) {
              case 1:
                i = f.createElementNS("http://www.w3.org/2000/svg", r);
                break;
              case 2:
                i = f.createElementNS("http://www.w3.org/1998/Math/MathML", r);
                break;
              default:
                switch (r) {
                  case "svg":
                    i = f.createElementNS("http://www.w3.org/2000/svg", r);
                    break;
                  case "math":
                    i = f.createElementNS("http://www.w3.org/1998/Math/MathML", r);
                    break;
                  case "script":
                    i = f.createElement("div"), i.innerHTML = "<script><\/script>", i = i.removeChild(i.firstChild);
                    break;
                  case "select":
                    i = typeof u.is == "string" ? f.createElement("select", { is: u.is }) : f.createElement("select"), u.multiple ? i.multiple = true : u.size && (i.size = u.size);
                    break;
                  default:
                    i = typeof u.is == "string" ? f.createElement(r, { is: u.is }) : f.createElement(r);
                }
            }
            i[xe] = t, i[qe] = u;
            e: for (f = t.child; f !== null; ) {
              if (f.tag === 5 || f.tag === 6) i.appendChild(f.stateNode);
              else if (f.tag !== 4 && f.tag !== 27 && f.child !== null) {
                f.child.return = f, f = f.child;
                continue;
              }
              if (f === t) break e;
              for (; f.sibling === null; ) {
                if (f.return === null || f.return === t) break e;
                f = f.return;
              }
              f.sibling.return = f.return, f = f.sibling;
            }
            t.stateNode = i;
            e: switch (Me(i, r, u), r) {
              case "button":
              case "input":
              case "select":
              case "textarea":
                u = !!u.autoFocus;
                break e;
              case "img":
                u = true;
                break e;
              default:
                u = false;
            }
            u && Bt(t);
          }
        }
        return oe(t), fr(t, t.type, e === null ? null : e.memoizedProps, t.pendingProps, c), null;
      case 6:
        if (e && t.stateNode != null) e.memoizedProps !== u && Bt(t);
        else {
          if (typeof u != "string" && t.stateNode === null) throw Error(_(166));
          if (e = Q.current, ta(t)) {
            if (e = t.stateNode, c = t.memoizedProps, u = null, r = Ee, r !== null) switch (r.tag) {
              case 27:
              case 5:
                u = r.memoizedProps;
            }
            e[xe] = t, e = !!(e.nodeValue === c || u !== null && u.suppressHydrationWarning === true || ho(e.nodeValue, c)), e || It(t, true);
          } else e = yu(e).createTextNode(u), e[xe] = t, t.stateNode = e;
        }
        return oe(t), null;
      case 31:
        if (c = t.memoizedState, e === null || e.memoizedState !== null) {
          if (u = ta(t), c !== null) {
            if (e === null) {
              if (!u) throw Error(_(318));
              if (e = t.memoizedState, e = e !== null ? e.dehydrated : null, !e) throw Error(_(557));
              e[xe] = t;
            } else An(), (t.flags & 128) === 0 && (t.memoizedState = null), t.flags |= 4;
            oe(t), e = false;
          } else c = yl(), e !== null && e.memoizedState !== null && (e.memoizedState.hydrationErrors = c), e = true;
          if (!e) return t.flags & 256 ? (Pe(t), t) : (Pe(t), null);
          if ((t.flags & 128) !== 0) throw Error(_(558));
        }
        return oe(t), null;
      case 13:
        if (u = t.memoizedState, e === null || e.memoizedState !== null && e.memoizedState.dehydrated !== null) {
          if (r = ta(t), u !== null && u.dehydrated !== null) {
            if (e === null) {
              if (!r) throw Error(_(318));
              if (r = t.memoizedState, r = r !== null ? r.dehydrated : null, !r) throw Error(_(317));
              r[xe] = t;
            } else An(), (t.flags & 128) === 0 && (t.memoizedState = null), t.flags |= 4;
            oe(t), r = false;
          } else r = yl(), e !== null && e.memoizedState !== null && (e.memoizedState.hydrationErrors = r), r = true;
          if (!r) return t.flags & 256 ? (Pe(t), t) : (Pe(t), null);
        }
        return Pe(t), (t.flags & 128) !== 0 ? (t.lanes = c, t) : (c = u !== null, e = e !== null && e.memoizedState !== null, c && (u = t.child, r = null, u.alternate !== null && u.alternate.memoizedState !== null && u.alternate.memoizedState.cachePool !== null && (r = u.alternate.memoizedState.cachePool.pool), i = null, u.memoizedState !== null && u.memoizedState.cachePool !== null && (i = u.memoizedState.cachePool.pool), i !== r && (u.flags |= 2048)), c !== e && c && (t.child.flags |= 8192), uu(t, t.updateQueue), oe(t), null);
      case 4:
        return ge(), e === null && Cr(t.stateNode.containerInfo), oe(t), null;
      case 10:
        return Ht(t.type), oe(t), null;
      case 19:
        if (D(me), u = t.memoizedState, u === null) return oe(t), null;
        if (r = (t.flags & 128) !== 0, i = u.rendering, i === null) if (r) $a(u, false);
        else {
          if (de !== 0 || e !== null && (e.flags & 128) !== 0) for (e = t.child; e !== null; ) {
            if (i = Wc(e), i !== null) {
              for (t.flags |= 128, $a(u, false), e = i.updateQueue, t.updateQueue = e, uu(t, e), t.subtreeFlags = 0, e = c, c = t.child; c !== null; ) $i(c, e), c = c.sibling;
              return C(me, me.current & 1 | 2), k && Rt(t, u.treeForkCount), t.child;
            }
            e = e.sibling;
          }
          u.tail !== null && Fe() > fu && (t.flags |= 128, r = true, $a(u, false), t.lanes = 4194304);
        }
        else {
          if (!r) if (e = Wc(i), e !== null) {
            if (t.flags |= 128, r = true, e = e.updateQueue, t.updateQueue = e, uu(t, e), $a(u, true), u.tail === null && u.tailMode === "hidden" && !i.alternate && !k) return oe(t), null;
          } else 2 * Fe() - u.renderingStartTime > fu && c !== 536870912 && (t.flags |= 128, r = true, $a(u, false), t.lanes = 4194304);
          u.isBackwards ? (i.sibling = t.child, t.child = i) : (e = u.last, e !== null ? e.sibling = i : t.child = i, u.last = i);
        }
        return u.tail !== null ? (e = u.tail, u.rendering = e, u.tail = e.sibling, u.renderingStartTime = Fe(), e.sibling = null, c = me.current, C(me, r ? c & 1 | 2 : c & 1), k && Rt(t, u.treeForkCount), e) : (oe(t), null);
      case 22:
      case 23:
        return Pe(t), Hl(), u = t.memoizedState !== null, e !== null ? e.memoizedState !== null !== u && (t.flags |= 8192) : u && (t.flags |= 8192), u ? (c & 536870912) !== 0 && (t.flags & 128) === 0 && (oe(t), t.subtreeFlags & 6 && (t.flags |= 8192)) : oe(t), c = t.updateQueue, c !== null && uu(t, c.retryQueue), c = null, e !== null && e.memoizedState !== null && e.memoizedState.cachePool !== null && (c = e.memoizedState.cachePool.pool), u = null, t.memoizedState !== null && t.memoizedState.cachePool !== null && (u = t.memoizedState.cachePool.pool), u !== c && (t.flags |= 2048), e !== null && D(Dn), null;
      case 24:
        return c = null, e !== null && (c = e.memoizedState.cache), t.memoizedState.cache !== c && (t.flags |= 2048), Ht(pe), oe(t), null;
      case 25:
        return null;
      case 30:
        return null;
    }
    throw Error(_(156, t.tag));
  }
  function xs(e, t) {
    switch (pl(t), t.tag) {
      case 1:
        return e = t.flags, e & 65536 ? (t.flags = e & -65537 | 128, t) : null;
      case 3:
        return Ht(pe), ge(), e = t.flags, (e & 65536) !== 0 && (e & 128) === 0 ? (t.flags = e & -65537 | 128, t) : null;
      case 26:
      case 27:
      case 5:
        return mc(t), null;
      case 31:
        if (t.memoizedState !== null) {
          if (Pe(t), t.alternate === null) throw Error(_(340));
          An();
        }
        return e = t.flags, e & 65536 ? (t.flags = e & -65537 | 128, t) : null;
      case 13:
        if (Pe(t), e = t.memoizedState, e !== null && e.dehydrated !== null) {
          if (t.alternate === null) throw Error(_(340));
          An();
        }
        return e = t.flags, e & 65536 ? (t.flags = e & -65537 | 128, t) : null;
      case 19:
        return D(me), null;
      case 4:
        return ge(), null;
      case 10:
        return Ht(t.type), null;
      case 22:
      case 23:
        return Pe(t), Hl(), e !== null && D(Dn), e = t.flags, e & 65536 ? (t.flags = e & -65537 | 128, t) : null;
      case 24:
        return Ht(pe), null;
      case 25:
        return null;
      default:
        return null;
    }
  }
  function Ef(e, t) {
    switch (pl(t), t.tag) {
      case 3:
        Ht(pe), ge();
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
        Ht(t.type);
        break;
      case 22:
      case 23:
        Pe(t), Hl(), e !== null && D(Dn);
        break;
      case 24:
        Ht(pe);
    }
  }
  function Pa(e, t) {
    try {
      var c = t.updateQueue, u = c !== null ? c.lastEffect : null;
      if (u !== null) {
        var r = u.next;
        c = r;
        do {
          if ((c.tag & e) === e) {
            u = void 0;
            var i = c.create, f = c.inst;
            u = i(), f.destroy = u;
          }
          c = c.next;
        } while (c !== r);
      }
    } catch (b) {
      ae(t, t.return, b);
    }
  }
  function cn(e, t, c) {
    try {
      var u = t.updateQueue, r = u !== null ? u.lastEffect : null;
      if (r !== null) {
        var i = r.next;
        u = i;
        do {
          if ((u.tag & e) === e) {
            var f = u.inst, b = f.destroy;
            if (b !== void 0) {
              f.destroy = void 0, r = t;
              var d = c, w = b;
              try {
                w();
              } catch (E) {
                ae(r, d, E);
              }
            }
          }
          u = u.next;
        } while (u !== i);
      }
    } catch (E) {
      ae(t, t.return, E);
    }
  }
  function Af(e) {
    var t = e.updateQueue;
    if (t !== null) {
      var c = e.stateNode;
      try {
        m_(t, c);
      } catch (u) {
        ae(e, e.return, u);
      }
    }
  }
  function Tf(e, t, c) {
    c.props = Nn(e.type, e.memoizedProps), c.state = e.memoizedState;
    try {
      c.componentWillUnmount();
    } catch (u) {
      ae(e, t, u);
    }
  }
  function ec(e, t) {
    try {
      var c = e.ref;
      if (c !== null) {
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
        typeof c == "function" ? e.refCleanup = c(u) : c.current = u;
      }
    } catch (r) {
      ae(e, t, r);
    }
  }
  function vt(e, t) {
    var c = e.ref, u = e.refCleanup;
    if (c !== null) if (typeof u == "function") try {
      u();
    } catch (r) {
      ae(e, t, r);
    } finally {
      e.refCleanup = null, e = e.alternate, e != null && (e.refCleanup = null);
    }
    else if (typeof c == "function") try {
      c(null);
    } catch (r) {
      ae(e, t, r);
    }
    else c.current = null;
  }
  function Mf(e) {
    var t = e.type, c = e.memoizedProps, u = e.stateNode;
    try {
      e: switch (t) {
        case "button":
        case "input":
        case "select":
        case "textarea":
          c.autoFocus && u.focus();
          break e;
        case "img":
          c.src ? u.src = c.src : c.srcSet && (u.srcset = c.srcSet);
      }
    } catch (r) {
      ae(e, e.return, r);
    }
  }
  function or(e, t, c) {
    try {
      var u = e.stateNode;
      Fs(u, e.type, c, t), u[qe] = t;
    } catch (r) {
      ae(e, e.return, r);
    }
  }
  function Df(e) {
    return e.tag === 5 || e.tag === 3 || e.tag === 26 || e.tag === 27 && bn(e.type) || e.tag === 4;
  }
  function br(e) {
    e: for (; ; ) {
      for (; e.sibling === null; ) {
        if (e.return === null || Df(e.return)) return null;
        e = e.return;
      }
      for (e.sibling.return = e.return, e = e.sibling; e.tag !== 5 && e.tag !== 6 && e.tag !== 18; ) {
        if (e.tag === 27 && bn(e.type) || e.flags & 2 || e.child === null || e.tag === 4) continue e;
        e.child.return = e, e = e.child;
      }
      if (!(e.flags & 2)) return e.stateNode;
    }
  }
  function sr(e, t, c) {
    var u = e.tag;
    if (u === 5 || u === 6) e = e.stateNode, t ? (c.nodeType === 9 ? c.body : c.nodeName === "HTML" ? c.ownerDocument.body : c).insertBefore(e, t) : (t = c.nodeType === 9 ? c.body : c.nodeName === "HTML" ? c.ownerDocument.body : c, t.appendChild(e), c = c._reactRootContainer, c != null || t.onclick !== null || (t.onclick = Tt));
    else if (u !== 4 && (u === 27 && bn(e.type) && (c = e.stateNode, t = null), e = e.child, e !== null)) for (sr(e, t, c), e = e.sibling; e !== null; ) sr(e, t, c), e = e.sibling;
  }
  function lu(e, t, c) {
    var u = e.tag;
    if (u === 5 || u === 6) e = e.stateNode, t ? c.insertBefore(e, t) : c.appendChild(e);
    else if (u !== 4 && (u === 27 && bn(e.type) && (c = e.stateNode), e = e.child, e !== null)) for (lu(e, t, c), e = e.sibling; e !== null; ) lu(e, t, c), e = e.sibling;
  }
  function Rf(e) {
    var t = e.stateNode, c = e.memoizedProps;
    try {
      for (var u = e.type, r = t.attributes; r.length; ) t.removeAttributeNode(r[0]);
      Me(t, u, c), t[xe] = e, t[qe] = c;
    } catch (i) {
      ae(e, e.return, i);
    }
  }
  var Lt = false, we = false, dr = false, Cf = typeof WeakSet == "function" ? WeakSet : Set, Se = null;
  function Es(e, t) {
    if (e = e.containerInfo, Nr = Au, e = Xi(e), rl(e)) {
      if ("selectionStart" in e) var c = { start: e.selectionStart, end: e.selectionEnd };
      else e: {
        c = (c = e.ownerDocument) && c.defaultView || window;
        var u = c.getSelection && c.getSelection();
        if (u && u.rangeCount !== 0) {
          c = u.anchorNode;
          var r = u.anchorOffset, i = u.focusNode;
          u = u.focusOffset;
          try {
            c.nodeType, i.nodeType;
          } catch {
            c = null;
            break e;
          }
          var f = 0, b = -1, d = -1, w = 0, E = 0, M = e, h = null;
          t: for (; ; ) {
            for (var v; M !== c || r !== 0 && M.nodeType !== 3 || (b = f + r), M !== i || u !== 0 && M.nodeType !== 3 || (d = f + u), M.nodeType === 3 && (f += M.nodeValue.length), (v = M.firstChild) !== null; ) h = M, M = v;
            for (; ; ) {
              if (M === e) break t;
              if (h === c && ++w === r && (b = f), h === i && ++E === u && (d = f), (v = M.nextSibling) !== null) break;
              M = h, h = M.parentNode;
            }
            M = v;
          }
          c = b === -1 || d === -1 ? null : { start: b, end: d };
        } else c = null;
      }
      c = c || { start: 0, end: 0 };
    } else c = null;
    for (Ur = { focusedElem: e, selectionRange: c }, Au = false, Se = t; Se !== null; ) if (t = Se, e = t.child, (t.subtreeFlags & 1028) !== 0 && e !== null) e.return = t, Se = e;
    else for (; Se !== null; ) {
      switch (t = Se, i = t.alternate, e = t.flags, t.tag) {
        case 0:
          if ((e & 4) !== 0 && (e = t.updateQueue, e = e !== null ? e.events : null, e !== null)) for (c = 0; c < e.length; c++) r = e[c], r.ref.impl = r.nextImpl;
          break;
        case 11:
        case 15:
          break;
        case 1:
          if ((e & 1024) !== 0 && i !== null) {
            e = void 0, c = t, r = i.memoizedProps, i = i.memoizedState, u = c.stateNode;
            try {
              var N = Nn(c.type, r);
              e = u.getSnapshotBeforeUpdate(N, i), u.__reactInternalSnapshotBeforeUpdate = e;
            } catch (q) {
              ae(c, c.return, q);
            }
          }
          break;
        case 3:
          if ((e & 1024) !== 0) {
            if (e = t.stateNode.containerInfo, c = e.nodeType, c === 9) qr(e);
            else if (c === 1) switch (e.nodeName) {
              case "HEAD":
              case "HTML":
              case "BODY":
                qr(e);
                break;
              default:
                e.textContent = "";
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
          if ((e & 1024) !== 0) throw Error(_(163));
      }
      if (e = t.sibling, e !== null) {
        e.return = t.return, Se = e;
        break;
      }
      Se = t.return;
    }
  }
  function Hf(e, t, c) {
    var u = c.flags;
    switch (c.tag) {
      case 0:
      case 11:
      case 15:
        Gt(e, c), u & 4 && Pa(5, c);
        break;
      case 1:
        if (Gt(e, c), u & 4) if (e = c.stateNode, t === null) try {
          e.componentDidMount();
        } catch (f) {
          ae(c, c.return, f);
        }
        else {
          var r = Nn(c.type, t.memoizedProps);
          t = t.memoizedState;
          try {
            e.componentDidUpdate(r, t, e.__reactInternalSnapshotBeforeUpdate);
          } catch (f) {
            ae(c, c.return, f);
          }
        }
        u & 64 && Af(c), u & 512 && ec(c, c.return);
        break;
      case 3:
        if (Gt(e, c), u & 64 && (e = c.updateQueue, e !== null)) {
          if (t = null, c.child !== null) switch (c.child.tag) {
            case 27:
            case 5:
              t = c.child.stateNode;
              break;
            case 1:
              t = c.child.stateNode;
          }
          try {
            m_(e, t);
          } catch (f) {
            ae(c, c.return, f);
          }
        }
        break;
      case 27:
        t === null && u & 4 && Rf(c);
      case 26:
      case 5:
        Gt(e, c), t === null && u & 4 && Mf(c), u & 512 && ec(c, c.return);
        break;
      case 12:
        Gt(e, c);
        break;
      case 31:
        Gt(e, c), u & 4 && Uf(e, c);
        break;
      case 13:
        Gt(e, c), u & 4 && Bf(e, c), u & 64 && (e = c.memoizedState, e !== null && (e = e.dehydrated, e !== null && (c = Ns.bind(null, c), td(e, c))));
        break;
      case 22:
        if (u = c.memoizedState !== null || Lt, !u) {
          t = t !== null && t.memoizedState !== null || we, r = Lt;
          var i = we;
          Lt = u, (we = t) && !i ? Vt(e, c, (c.subtreeFlags & 8772) !== 0) : Gt(e, c), Lt = r, we = i;
        }
        break;
      case 30:
        break;
      default:
        Gt(e, c);
    }
  }
  function zf(e) {
    var t = e.alternate;
    t !== null && (e.alternate = null, zf(t)), e.child = null, e.deletions = null, e.sibling = null, e.tag === 5 && (t = e.stateNode, t !== null && Qu(t)), e.stateNode = null, e.return = null, e.dependencies = null, e.memoizedProps = null, e.memoizedState = null, e.pendingProps = null, e.stateNode = null, e.updateQueue = null;
  }
  var be = null, Ve = false;
  function qt(e, t, c) {
    for (c = c.child; c !== null; ) Nf(e, t, c), c = c.sibling;
  }
  function Nf(e, t, c) {
    if (Ke && typeof Ke.onCommitFiberUnmount == "function") try {
      Ke.onCommitFiberUnmount(Sa, c);
    } catch {
    }
    switch (c.tag) {
      case 26:
        we || vt(c, t), qt(e, t, c), c.memoizedState ? c.memoizedState.count-- : c.stateNode && (c = c.stateNode, c.parentNode.removeChild(c));
        break;
      case 27:
        we || vt(c, t);
        var u = be, r = Ve;
        bn(c.type) && (be = c.stateNode, Ve = false), qt(e, t, c), _c(c.stateNode), be = u, Ve = r;
        break;
      case 5:
        we || vt(c, t);
      case 6:
        if (u = be, r = Ve, be = null, qt(e, t, c), be = u, Ve = r, be !== null) if (Ve) try {
          (be.nodeType === 9 ? be.body : be.nodeName === "HTML" ? be.ownerDocument.body : be).removeChild(c.stateNode);
        } catch (i) {
          ae(c, t, i);
        }
        else try {
          be.removeChild(c.stateNode);
        } catch (i) {
          ae(c, t, i);
        }
        break;
      case 18:
        be !== null && (Ve ? (e = be, To(e.nodeType === 9 ? e.body : e.nodeName === "HTML" ? e.ownerDocument.body : e, c.stateNode), ha(e)) : To(be, c.stateNode));
        break;
      case 4:
        u = be, r = Ve, be = c.stateNode.containerInfo, Ve = true, qt(e, t, c), be = u, Ve = r;
        break;
      case 0:
      case 11:
      case 14:
      case 15:
        cn(2, c, t), we || cn(4, c, t), qt(e, t, c);
        break;
      case 1:
        we || (vt(c, t), u = c.stateNode, typeof u.componentWillUnmount == "function" && Tf(c, t, u)), qt(e, t, c);
        break;
      case 21:
        qt(e, t, c);
        break;
      case 22:
        we = (u = we) || c.memoizedState !== null, qt(e, t, c), we = u;
        break;
      default:
        qt(e, t, c);
    }
  }
  function Uf(e, t) {
    if (t.memoizedState === null && (e = t.alternate, e !== null && (e = e.memoizedState, e !== null))) {
      e = e.dehydrated;
      try {
        ha(e);
      } catch (c) {
        ae(t, t.return, c);
      }
    }
  }
  function Bf(e, t) {
    if (t.memoizedState === null && (e = t.alternate, e !== null && (e = e.memoizedState, e !== null && (e = e.dehydrated, e !== null)))) try {
      ha(e);
    } catch (c) {
      ae(t, t.return, c);
    }
  }
  function As(e) {
    switch (e.tag) {
      case 31:
      case 13:
      case 19:
        var t = e.stateNode;
        return t === null && (t = e.stateNode = new Cf()), t;
      case 22:
        return e = e.stateNode, t = e._retryCache, t === null && (t = e._retryCache = new Cf()), t;
      default:
        throw Error(_(435, e.tag));
    }
  }
  function ru(e, t) {
    var c = As(e);
    t.forEach(function(u) {
      if (!c.has(u)) {
        c.add(u);
        var r = Us.bind(null, e, u);
        u.then(r, r);
      }
    });
  }
  function Ye(e, t) {
    var c = t.deletions;
    if (c !== null) for (var u = 0; u < c.length; u++) {
      var r = c[u], i = e, f = t, b = f;
      e: for (; b !== null; ) {
        switch (b.tag) {
          case 27:
            if (bn(b.type)) {
              be = b.stateNode, Ve = false;
              break e;
            }
            break;
          case 5:
            be = b.stateNode, Ve = false;
            break e;
          case 3:
          case 4:
            be = b.stateNode.containerInfo, Ve = true;
            break e;
        }
        b = b.return;
      }
      if (be === null) throw Error(_(160));
      Nf(i, f, r), be = null, Ve = false, i = r.alternate, i !== null && (i.return = null), r.return = null;
    }
    if (t.subtreeFlags & 13886) for (t = t.child; t !== null; ) Lf(t, e), t = t.sibling;
  }
  var mt = null;
  function Lf(e, t) {
    var c = e.alternate, u = e.flags;
    switch (e.tag) {
      case 0:
      case 11:
      case 14:
      case 15:
        Ye(t, e), Xe(e), u & 4 && (cn(3, e, e.return), Pa(3, e), cn(5, e, e.return));
        break;
      case 1:
        Ye(t, e), Xe(e), u & 512 && (we || c === null || vt(c, c.return)), u & 64 && Lt && (e = e.updateQueue, e !== null && (u = e.callbacks, u !== null && (c = e.shared.hiddenCallbacks, e.shared.hiddenCallbacks = c === null ? u : c.concat(u))));
        break;
      case 26:
        var r = mt;
        if (Ye(t, e), Xe(e), u & 512 && (we || c === null || vt(c, c.return)), u & 4) {
          var i = c !== null ? c.memoizedState : null;
          if (u = e.memoizedState, c === null) if (u === null) if (e.stateNode === null) {
            e: {
              u = e.type, c = e.memoizedProps, r = r.ownerDocument || r;
              t: switch (u) {
                case "title":
                  i = r.getElementsByTagName("title")[0], (!i || i[Aa] || i[xe] || i.namespaceURI === "http://www.w3.org/2000/svg" || i.hasAttribute("itemprop")) && (i = r.createElement(u), r.head.insertBefore(i, r.querySelector("head > title"))), Me(i, u, c), i[xe] = e, ve(i), u = i;
                  break e;
                case "link":
                  var f = qo("link", "href", r).get(u + (c.href || ""));
                  if (f) {
                    for (var b = 0; b < f.length; b++) if (i = f[b], i.getAttribute("href") === (c.href == null || c.href === "" ? null : c.href) && i.getAttribute("rel") === (c.rel == null ? null : c.rel) && i.getAttribute("title") === (c.title == null ? null : c.title) && i.getAttribute("crossorigin") === (c.crossOrigin == null ? null : c.crossOrigin)) {
                      f.splice(b, 1);
                      break t;
                    }
                  }
                  i = r.createElement(u), Me(i, u, c), r.head.appendChild(i);
                  break;
                case "meta":
                  if (f = qo("meta", "content", r).get(u + (c.content || ""))) {
                    for (b = 0; b < f.length; b++) if (i = f[b], i.getAttribute("content") === (c.content == null ? null : "" + c.content) && i.getAttribute("name") === (c.name == null ? null : c.name) && i.getAttribute("property") === (c.property == null ? null : c.property) && i.getAttribute("http-equiv") === (c.httpEquiv == null ? null : c.httpEquiv) && i.getAttribute("charset") === (c.charSet == null ? null : c.charSet)) {
                      f.splice(b, 1);
                      break t;
                    }
                  }
                  i = r.createElement(u), Me(i, u, c), r.head.appendChild(i);
                  break;
                default:
                  throw Error(_(468, u));
              }
              i[xe] = e, ve(i), u = i;
            }
            e.stateNode = u;
          } else Go(r, e.type, e.stateNode);
          else e.stateNode = Lo(r, u, e.memoizedProps);
          else i !== u ? (i === null ? c.stateNode !== null && (c = c.stateNode, c.parentNode.removeChild(c)) : i.count--, u === null ? Go(r, e.type, e.stateNode) : Lo(r, u, e.memoizedProps)) : u === null && e.stateNode !== null && or(e, e.memoizedProps, c.memoizedProps);
        }
        break;
      case 27:
        Ye(t, e), Xe(e), u & 512 && (we || c === null || vt(c, c.return)), c !== null && u & 4 && or(e, e.memoizedProps, c.memoizedProps);
        break;
      case 5:
        if (Ye(t, e), Xe(e), u & 512 && (we || c === null || vt(c, c.return)), e.flags & 32) {
          r = e.stateNode;
          try {
            Zn(r, "");
          } catch (N) {
            ae(e, e.return, N);
          }
        }
        u & 4 && e.stateNode != null && (r = e.memoizedProps, or(e, r, c !== null ? c.memoizedProps : r)), u & 1024 && (dr = true);
        break;
      case 6:
        if (Ye(t, e), Xe(e), u & 4) {
          if (e.stateNode === null) throw Error(_(162));
          u = e.memoizedProps, c = e.stateNode;
          try {
            c.nodeValue = u;
          } catch (N) {
            ae(e, e.return, N);
          }
        }
        break;
      case 3:
        if (vu = null, r = mt, mt = wu(t.containerInfo), Ye(t, e), mt = r, Xe(e), u & 4 && c !== null && c.memoizedState.isDehydrated) try {
          ha(t.containerInfo);
        } catch (N) {
          ae(e, e.return, N);
        }
        dr && (dr = false, qf(e));
        break;
      case 4:
        u = mt, mt = wu(e.stateNode.containerInfo), Ye(t, e), Xe(e), mt = u;
        break;
      case 12:
        Ye(t, e), Xe(e);
        break;
      case 31:
        Ye(t, e), Xe(e), u & 4 && (u = e.updateQueue, u !== null && (e.updateQueue = null, ru(e, u)));
        break;
      case 13:
        Ye(t, e), Xe(e), e.child.flags & 8192 && e.memoizedState !== null != (c !== null && c.memoizedState !== null) && (_u = Fe()), u & 4 && (u = e.updateQueue, u !== null && (e.updateQueue = null, ru(e, u)));
        break;
      case 22:
        r = e.memoizedState !== null;
        var d = c !== null && c.memoizedState !== null, w = Lt, E = we;
        if (Lt = w || r, we = E || d, Ye(t, e), we = E, Lt = w, Xe(e), u & 8192) e: for (t = e.stateNode, t._visibility = r ? t._visibility & -2 : t._visibility | 1, r && (c === null || d || Lt || we || Un(e)), c = null, t = e; ; ) {
          if (t.tag === 5 || t.tag === 26) {
            if (c === null) {
              d = c = t;
              try {
                if (i = d.stateNode, r) f = i.style, typeof f.setProperty == "function" ? f.setProperty("display", "none", "important") : f.display = "none";
                else {
                  b = d.stateNode;
                  var M = d.memoizedProps.style, h = M != null && M.hasOwnProperty("display") ? M.display : null;
                  b.style.display = h == null || typeof h == "boolean" ? "" : ("" + h).trim();
                }
              } catch (N) {
                ae(d, d.return, N);
              }
            }
          } else if (t.tag === 6) {
            if (c === null) {
              d = t;
              try {
                d.stateNode.nodeValue = r ? "" : d.memoizedProps;
              } catch (N) {
                ae(d, d.return, N);
              }
            }
          } else if (t.tag === 18) {
            if (c === null) {
              d = t;
              try {
                var v = d.stateNode;
                r ? Mo(v, true) : Mo(d.stateNode, false);
              } catch (N) {
                ae(d, d.return, N);
              }
            }
          } else if ((t.tag !== 22 && t.tag !== 23 || t.memoizedState === null || t === e) && t.child !== null) {
            t.child.return = t, t = t.child;
            continue;
          }
          if (t === e) break e;
          for (; t.sibling === null; ) {
            if (t.return === null || t.return === e) break e;
            c === t && (c = null), t = t.return;
          }
          c === t && (c = null), t.sibling.return = t.return, t = t.sibling;
        }
        u & 4 && (u = e.updateQueue, u !== null && (c = u.retryQueue, c !== null && (u.retryQueue = null, ru(e, c))));
        break;
      case 19:
        Ye(t, e), Xe(e), u & 4 && (u = e.updateQueue, u !== null && (e.updateQueue = null, ru(e, u)));
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
        for (var c, u = e.return; u !== null; ) {
          if (Df(u)) {
            c = u;
            break;
          }
          u = u.return;
        }
        if (c == null) throw Error(_(160));
        switch (c.tag) {
          case 27:
            var r = c.stateNode, i = br(e);
            lu(e, i, r);
            break;
          case 5:
            var f = c.stateNode;
            c.flags & 32 && (Zn(f, ""), c.flags &= -33);
            var b = br(e);
            lu(e, b, f);
            break;
          case 3:
          case 4:
            var d = c.stateNode.containerInfo, w = br(e);
            sr(e, w, d);
            break;
          default:
            throw Error(_(161));
        }
      } catch (E) {
        ae(e, e.return, E);
      }
      e.flags &= -3;
    }
    t & 4096 && (e.flags &= -4097);
  }
  function qf(e) {
    if (e.subtreeFlags & 1024) for (e = e.child; e !== null; ) {
      var t = e;
      qf(t), t.tag === 5 && t.flags & 1024 && t.stateNode.reset(), e = e.sibling;
    }
  }
  function Gt(e, t) {
    if (t.subtreeFlags & 8772) for (t = t.child; t !== null; ) Hf(e, t.alternate, t), t = t.sibling;
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
          var c = t.stateNode;
          typeof c.componentWillUnmount == "function" && Tf(t, t.return, c), Un(t);
          break;
        case 27:
          _c(t.stateNode);
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
  function Vt(e, t, c) {
    for (c = c && (t.subtreeFlags & 8772) !== 0, t = t.child; t !== null; ) {
      var u = t.alternate, r = e, i = t, f = i.flags;
      switch (i.tag) {
        case 0:
        case 11:
        case 15:
          Vt(r, i, c), Pa(4, i);
          break;
        case 1:
          if (Vt(r, i, c), u = i, r = u.stateNode, typeof r.componentDidMount == "function") try {
            r.componentDidMount();
          } catch (w) {
            ae(u, u.return, w);
          }
          if (u = i, r = u.updateQueue, r !== null) {
            var b = u.stateNode;
            try {
              var d = r.shared.hiddenCallbacks;
              if (d !== null) for (r.shared.hiddenCallbacks = null, r = 0; r < d.length; r++) g_(d[r], b);
            } catch (w) {
              ae(u, u.return, w);
            }
          }
          c && f & 64 && Af(i), ec(i, i.return);
          break;
        case 27:
          Rf(i);
        case 26:
        case 5:
          Vt(r, i, c), c && u === null && f & 4 && Mf(i), ec(i, i.return);
          break;
        case 12:
          Vt(r, i, c);
          break;
        case 31:
          Vt(r, i, c), c && f & 4 && Uf(r, i);
          break;
        case 13:
          Vt(r, i, c), c && f & 4 && Bf(r, i);
          break;
        case 22:
          i.memoizedState === null && Vt(r, i, c), ec(i, i.return);
          break;
        case 30:
          break;
        default:
          Vt(r, i, c);
      }
      t = t.sibling;
    }
  }
  function gr(e, t) {
    var c = null;
    e !== null && e.memoizedState !== null && e.memoizedState.cachePool !== null && (c = e.memoizedState.cachePool.pool), e = null, t.memoizedState !== null && t.memoizedState.cachePool !== null && (e = t.memoizedState.cachePool.pool), e !== c && (e != null && e.refCount++, c != null && Ga(c));
  }
  function mr(e, t) {
    e = null, t.alternate !== null && (e = t.alternate.memoizedState.cache), t = t.memoizedState.cache, t !== e && (t.refCount++, e != null && Ga(e));
  }
  function Ot(e, t, c, u) {
    if (t.subtreeFlags & 10256) for (t = t.child; t !== null; ) Gf(e, t, c, u), t = t.sibling;
  }
  function Gf(e, t, c, u) {
    var r = t.flags;
    switch (t.tag) {
      case 0:
      case 11:
      case 15:
        Ot(e, t, c, u), r & 2048 && Pa(9, t);
        break;
      case 1:
        Ot(e, t, c, u);
        break;
      case 3:
        Ot(e, t, c, u), r & 2048 && (e = null, t.alternate !== null && (e = t.alternate.memoizedState.cache), t = t.memoizedState.cache, t !== e && (t.refCount++, e != null && Ga(e)));
        break;
      case 12:
        if (r & 2048) {
          Ot(e, t, c, u), e = t.stateNode;
          try {
            var i = t.memoizedProps, f = i.id, b = i.onPostCommit;
            typeof b == "function" && b(f, t.alternate === null ? "mount" : "update", e.passiveEffectDuration, -0);
          } catch (d) {
            ae(t, t.return, d);
          }
        } else Ot(e, t, c, u);
        break;
      case 31:
        Ot(e, t, c, u);
        break;
      case 13:
        Ot(e, t, c, u);
        break;
      case 23:
        break;
      case 22:
        i = t.stateNode, f = t.alternate, t.memoizedState !== null ? i._visibility & 2 ? Ot(e, t, c, u) : tc(e, t) : i._visibility & 2 ? Ot(e, t, c, u) : (i._visibility |= 2, oa(e, t, c, u, (t.subtreeFlags & 10256) !== 0 || false)), r & 2048 && gr(f, t);
        break;
      case 24:
        Ot(e, t, c, u), r & 2048 && mr(t.alternate, t);
        break;
      default:
        Ot(e, t, c, u);
    }
  }
  function oa(e, t, c, u, r) {
    for (r = r && ((t.subtreeFlags & 10256) !== 0 || false), t = t.child; t !== null; ) {
      var i = e, f = t, b = c, d = u, w = f.flags;
      switch (f.tag) {
        case 0:
        case 11:
        case 15:
          oa(i, f, b, d, r), Pa(8, f);
          break;
        case 23:
          break;
        case 22:
          var E = f.stateNode;
          f.memoizedState !== null ? E._visibility & 2 ? oa(i, f, b, d, r) : tc(i, f) : (E._visibility |= 2, oa(i, f, b, d, r)), r && w & 2048 && gr(f.alternate, f);
          break;
        case 24:
          oa(i, f, b, d, r), r && w & 2048 && mr(f.alternate, f);
          break;
        default:
          oa(i, f, b, d, r);
      }
      t = t.sibling;
    }
  }
  function tc(e, t) {
    if (t.subtreeFlags & 10256) for (t = t.child; t !== null; ) {
      var c = e, u = t, r = u.flags;
      switch (u.tag) {
        case 22:
          tc(c, u), r & 2048 && gr(u.alternate, u);
          break;
        case 24:
          tc(c, u), r & 2048 && mr(u.alternate, u);
          break;
        default:
          tc(c, u);
      }
      t = t.sibling;
    }
  }
  var nc = 8192;
  function ba(e, t, c) {
    if (e.subtreeFlags & nc) for (e = e.child; e !== null; ) Vf(e, t, c), e = e.sibling;
  }
  function Vf(e, t, c) {
    switch (e.tag) {
      case 26:
        ba(e, t, c), e.flags & nc && e.memoizedState !== null && sd(c, mt, e.memoizedState, e.memoizedProps);
        break;
      case 5:
        ba(e, t, c);
        break;
      case 3:
      case 4:
        var u = mt;
        mt = wu(e.stateNode.containerInfo), ba(e, t, c), mt = u;
        break;
      case 22:
        e.memoizedState === null && (u = e.alternate, u !== null && u.memoizedState !== null ? (u = nc, nc = 16777216, ba(e, t, c), nc = u) : ba(e, t, c));
        break;
      default:
        ba(e, t, c);
    }
  }
  function Yf(e) {
    var t = e.alternate;
    if (t !== null && (e = t.child, e !== null)) {
      t.child = null;
      do
        t = e.sibling, e.sibling = null, e = t;
      while (e !== null);
    }
  }
  function ac(e) {
    var t = e.deletions;
    if ((e.flags & 16) !== 0) {
      if (t !== null) for (var c = 0; c < t.length; c++) {
        var u = t[c];
        Se = u, Qf(u, e);
      }
      Yf(e);
    }
    if (e.subtreeFlags & 10256) for (e = e.child; e !== null; ) Xf(e), e = e.sibling;
  }
  function Xf(e) {
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
        e.memoizedState !== null && t._visibility & 2 && (e.return === null || e.return.tag !== 13) ? (t._visibility &= -3, iu(e)) : ac(e);
        break;
      default:
        ac(e);
    }
  }
  function iu(e) {
    var t = e.deletions;
    if ((e.flags & 16) !== 0) {
      if (t !== null) for (var c = 0; c < t.length; c++) {
        var u = t[c];
        Se = u, Qf(u, e);
      }
      Yf(e);
    }
    for (e = e.child; e !== null; ) {
      switch (t = e, t.tag) {
        case 0:
        case 11:
        case 15:
          cn(8, t, t.return), iu(t);
          break;
        case 22:
          c = t.stateNode, c._visibility & 2 && (c._visibility &= -3, iu(t));
          break;
        default:
          iu(t);
      }
      e = e.sibling;
    }
  }
  function Qf(e, t) {
    for (; Se !== null; ) {
      var c = Se;
      switch (c.tag) {
        case 0:
        case 11:
        case 15:
          cn(8, c, t);
          break;
        case 23:
        case 22:
          if (c.memoizedState !== null && c.memoizedState.cachePool !== null) {
            var u = c.memoizedState.cachePool.pool;
            u != null && u.refCount++;
          }
          break;
        case 24:
          Ga(c.memoizedState.cache);
      }
      if (u = c.child, u !== null) u.return = c, Se = u;
      else e: for (c = e; Se !== null; ) {
        u = Se;
        var r = u.sibling, i = u.return;
        if (zf(u), u === c) {
          Se = null;
          break e;
        }
        if (r !== null) {
          r.return = i, Se = r;
          break e;
        }
        Se = i;
      }
    }
  }
  var Ts = { getCacheForType: function(e) {
    var t = Ae(pe), c = t.data.get(e);
    return c === void 0 && (c = e(), t.data.set(e, c)), c;
  }, cacheSignal: function() {
    return Ae(pe).controller.signal;
  } }, Ms = typeof WeakMap == "function" ? WeakMap : Map, ee = 0, _e = null, Z = null, F = 0, ne = 0, et = null, un = false, sa = false, Or = false, Yt = 0, de = 0, ln = 0, Bn = 0, pr = 0, tt = 0, da = 0, cc = null, Qe = null, jr = false, _u = 0, Zf = 0, fu = 1 / 0, ou = null, rn = null, he = 0, _n = null, ga = null, Xt = 0, yr = 0, wr = null, Wf = null, uc = 0, hr = null;
  function nt() {
    return (ee & 2) !== 0 && F !== 0 ? F & -F : A.T !== null ? Tr() : ri();
  }
  function Ff() {
    if (tt === 0) if ((F & 536870912) === 0 || k) {
      var e = jc;
      jc <<= 1, (jc & 3932160) === 0 && (jc = 262144), tt = e;
    } else tt = 536870912;
    return e = $e.current, e !== null && (e.flags |= 32), tt;
  }
  function Ze(e, t, c) {
    (e === _e && (ne === 2 || ne === 9) || e.cancelPendingCommit !== null) && (ma(e, 0), fn(e, F, tt, false)), Ea(e, c), ((ee & 2) === 0 || e !== _e) && (e === _e && ((ee & 2) === 0 && (Bn |= c), de === 4 && fn(e, F, tt, false)), St(e));
  }
  function Kf(e, t, c) {
    if ((ee & 6) !== 0) throw Error(_(327));
    var u = !c && (t & 127) === 0 && (t & e.expiredLanes) === 0 || xa(e, t), r = u ? Cs(e, t) : Sr(e, t, true), i = u;
    do {
      if (r === 0) {
        sa && !u && fn(e, t, 0, false);
        break;
      } else {
        if (c = e.current.alternate, i && !Ds(c)) {
          r = Sr(e, t, false), i = false;
          continue;
        }
        if (r === 2) {
          if (i = t, e.errorRecoveryDisabledLanes & i) var f = 0;
          else f = e.pendingLanes & -536870913, f = f !== 0 ? f : f & 536870912 ? 536870912 : 0;
          if (f !== 0) {
            t = f;
            e: {
              var b = e;
              r = cc;
              var d = b.current.memoizedState.isDehydrated;
              if (d && (ma(b, f).flags |= 256), f = Sr(b, f, false), f !== 2) {
                if (Or && !d) {
                  b.errorRecoveryDisabledLanes |= i, Bn |= i, r = 4;
                  break e;
                }
                i = Qe, Qe = r, i !== null && (Qe === null ? Qe = i : Qe.push.apply(Qe, i));
              }
              r = f;
            }
            if (i = false, r !== 2) continue;
          }
        }
        if (r === 1) {
          ma(e, 0), fn(e, t, 0, true);
          break;
        }
        e: {
          switch (u = e, i = r, i) {
            case 0:
            case 1:
              throw Error(_(345));
            case 4:
              if ((t & 4194048) !== t) break;
            case 6:
              fn(u, t, tt, !un);
              break e;
            case 2:
              Qe = null;
              break;
            case 3:
            case 5:
              break;
            default:
              throw Error(_(329));
          }
          if ((t & 62914560) === t && (r = _u + 300 - Fe(), 10 < r)) {
            if (fn(u, t, tt, !un), wc(u, 0, true) !== 0) break e;
            Xt = t, u.timeoutHandle = Eo(Jf.bind(null, u, c, Qe, ou, jr, t, tt, Bn, da, un, i, "Throttled", -0, 0), r);
            break e;
          }
          Jf(u, c, Qe, ou, jr, t, tt, Bn, da, un, i, null, -0, 0);
        }
      }
      break;
    } while (true);
    St(e);
  }
  function Jf(e, t, c, u, r, i, f, b, d, w, E, M, h, v) {
    if (e.timeoutHandle = -1, M = t.subtreeFlags, M & 8192 || (M & 16785408) === 16785408) {
      M = { stylesheets: null, count: 0, imgCount: 0, imgBytes: 0, suspenseyImages: [], waitingForImages: true, waitingForViewTransition: false, unsuspend: Tt }, Vf(t, i, M);
      var N = (i & 62914560) === i ? _u - Fe() : (i & 4194048) === i ? Zf - Fe() : 0;
      if (N = dd(M, N), N !== null) {
        Xt = i, e.cancelPendingCommit = N(ao.bind(null, e, t, i, c, u, r, f, b, d, E, M, null, h, v)), fn(e, i, f, !w);
        return;
      }
    }
    ao(e, t, i, c, u, r, f, b, d);
  }
  function Ds(e) {
    for (var t = e; ; ) {
      var c = t.tag;
      if ((c === 0 || c === 11 || c === 15) && t.flags & 16384 && (c = t.updateQueue, c !== null && (c = c.stores, c !== null))) for (var u = 0; u < c.length; u++) {
        var r = c[u], i = r.getSnapshot;
        r = r.value;
        try {
          if (!ke(i(), r)) return false;
        } catch {
          return false;
        }
      }
      if (c = t.child, t.subtreeFlags & 16384 && c !== null) c.return = t, t = c;
      else {
        if (t === e) break;
        for (; t.sibling === null; ) {
          if (t.return === null || t.return === e) return true;
          t = t.return;
        }
        t.sibling.return = t.return, t = t.sibling;
      }
    }
    return true;
  }
  function fn(e, t, c, u) {
    t &= ~pr, t &= ~Bn, e.suspendedLanes |= t, e.pingedLanes &= ~t, u && (e.warmLanes |= t), u = e.expirationTimes;
    for (var r = t; 0 < r; ) {
      var i = 31 - Je(r), f = 1 << i;
      u[i] = -1, r &= ~f;
    }
    c !== 0 && ci(e, c, t);
  }
  function bu() {
    return (ee & 6) === 0 ? (lc(0), false) : true;
  }
  function vr() {
    if (Z !== null) {
      if (ne === 0) var e = Z.return;
      else e = Z, Ct = Tn = null, ql(e), la = null, Ya = 0, e = Z;
      for (; e !== null; ) Ef(e.alternate, e), e = e.return;
      Z = null;
    }
  }
  function ma(e, t) {
    var c = e.timeoutHandle;
    c !== -1 && (e.timeoutHandle = -1, ks(c)), c = e.cancelPendingCommit, c !== null && (e.cancelPendingCommit = null, c()), Xt = 0, vr(), _e = e, Z = c = Dt(e.current, null), F = t, ne = 0, et = null, un = false, sa = xa(e, t), Or = false, da = tt = pr = Bn = ln = de = 0, Qe = cc = null, jr = false, (t & 8) !== 0 && (t |= t & 32);
    var u = e.entangledLanes;
    if (u !== 0) for (e = e.entanglements, u &= t; 0 < u; ) {
      var r = 31 - Je(u), i = 1 << r;
      t |= e[r], u &= ~i;
    }
    return Yt = t, Hc(), c;
  }
  function kf(e, t) {
    Y = null, A.H = ka, t === ua || t === Vc ? (t = o_(), ne = 3) : t === Al ? (t = o_(), ne = 4) : ne = t === tr ? 8 : t !== null && typeof t == "object" && typeof t.then == "function" ? 6 : 1, et = t, Z === null && (de = 1, tu(e, rt(t, e.current)));
  }
  function If() {
    var e = $e.current;
    return e === null ? true : (F & 4194048) === F ? ot === null : (F & 62914560) === F || (F & 536870912) !== 0 ? e === ot : false;
  }
  function $f() {
    var e = A.H;
    return A.H = ka, e === null ? ka : e;
  }
  function Pf() {
    var e = A.A;
    return A.A = Ts, e;
  }
  function su() {
    de = 4, un || (F & 4194048) !== F && $e.current !== null || (sa = true), (ln & 134217727) === 0 && (Bn & 134217727) === 0 || _e === null || fn(_e, F, tt, false);
  }
  function Sr(e, t, c) {
    var u = ee;
    ee |= 2;
    var r = $f(), i = Pf();
    (_e !== e || F !== t) && (ou = null, ma(e, t)), t = false;
    var f = de;
    e: do
      try {
        if (ne !== 0 && Z !== null) {
          var b = Z, d = et;
          switch (ne) {
            case 8:
              vr(), f = 6;
              break e;
            case 3:
            case 2:
            case 9:
            case 6:
              $e.current === null && (t = true);
              var w = ne;
              if (ne = 0, et = null, Oa(e, b, d, w), c && sa) {
                f = 0;
                break e;
              }
              break;
            default:
              w = ne, ne = 0, et = null, Oa(e, b, d, w);
          }
        }
        Rs(), f = de;
        break;
      } catch (E) {
        kf(e, E);
      }
    while (true);
    return t && e.shellSuspendCounter++, Ct = Tn = null, ee = u, A.H = r, A.A = i, Z === null && (_e = null, F = 0, Hc()), f;
  }
  function Rs() {
    for (; Z !== null; ) eo(Z);
  }
  function Cs(e, t) {
    var c = ee;
    ee |= 2;
    var u = $f(), r = Pf();
    _e !== e || F !== t ? (ou = null, fu = Fe() + 500, ma(e, t)) : sa = xa(e, t);
    e: do
      try {
        if (ne !== 0 && Z !== null) {
          t = Z;
          var i = et;
          t: switch (ne) {
            case 1:
              ne = 0, et = null, Oa(e, t, i, 1);
              break;
            case 2:
            case 9:
              if (__(i)) {
                ne = 0, et = null, to(t);
                break;
              }
              t = function() {
                ne !== 2 && ne !== 9 || _e !== e || (ne = 7), St(e);
              }, i.then(t, t);
              break e;
            case 3:
              ne = 7;
              break e;
            case 4:
              ne = 5;
              break e;
            case 7:
              __(i) ? (ne = 0, et = null, to(t)) : (ne = 0, et = null, Oa(e, t, i, 7));
              break;
            case 5:
              var f = null;
              switch (Z.tag) {
                case 26:
                  f = Z.memoizedState;
                case 5:
                case 27:
                  var b = Z;
                  if (f ? Vo(f) : b.stateNode.complete) {
                    ne = 0, et = null;
                    var d = b.sibling;
                    if (d !== null) Z = d;
                    else {
                      var w = b.return;
                      w !== null ? (Z = w, du(w)) : Z = null;
                    }
                    break t;
                  }
              }
              ne = 0, et = null, Oa(e, t, i, 5);
              break;
            case 6:
              ne = 0, et = null, Oa(e, t, i, 6);
              break;
            case 8:
              vr(), de = 6;
              break e;
            default:
              throw Error(_(462));
          }
        }
        Hs();
        break;
      } catch (E) {
        kf(e, E);
      }
    while (true);
    return Ct = Tn = null, A.H = u, A.A = r, ee = c, Z !== null ? 0 : (_e = null, F = 0, Hc(), de);
  }
  function Hs() {
    for (; Z !== null && !nb(); ) eo(Z);
  }
  function eo(e) {
    var t = Sf(e.alternate, e, Yt);
    e.memoizedProps = e.pendingProps, t === null ? du(e) : Z = t;
  }
  function to(e) {
    var t = e, c = t.alternate;
    switch (t.tag) {
      case 15:
      case 0:
        t = pf(c, t, t.pendingProps, t.type, void 0, F);
        break;
      case 11:
        t = pf(c, t, t.pendingProps, t.type.render, t.ref, F);
        break;
      case 5:
        ql(t);
      default:
        Ef(c, t), t = Z = $i(t, Yt), t = Sf(c, t, Yt);
    }
    e.memoizedProps = e.pendingProps, t === null ? du(e) : Z = t;
  }
  function Oa(e, t, c, u) {
    Ct = Tn = null, ql(t), la = null, Ya = 0;
    var r = t.return;
    try {
      if (ws(e, r, t, c, F)) {
        de = 1, tu(e, rt(c, e.current)), Z = null;
        return;
      }
    } catch (i) {
      if (r !== null) throw Z = r, i;
      de = 1, tu(e, rt(c, e.current)), Z = null;
      return;
    }
    t.flags & 32768 ? (k || u === 1 ? e = true : sa || (F & 536870912) !== 0 ? e = false : (un = e = true, (u === 2 || u === 9 || u === 3 || u === 6) && (u = $e.current, u !== null && u.tag === 13 && (u.flags |= 16384))), no(t, e)) : du(t);
  }
  function du(e) {
    var t = e;
    do {
      if ((t.flags & 32768) !== 0) {
        no(t, un);
        return;
      }
      e = t.return;
      var c = Ss(t.alternate, t, Yt);
      if (c !== null) {
        Z = c;
        return;
      }
      if (t = t.sibling, t !== null) {
        Z = t;
        return;
      }
      Z = t = e;
    } while (t !== null);
    de === 0 && (de = 5);
  }
  function no(e, t) {
    do {
      var c = xs(e.alternate, e);
      if (c !== null) {
        c.flags &= 32767, Z = c;
        return;
      }
      if (c = e.return, c !== null && (c.flags |= 32768, c.subtreeFlags = 0, c.deletions = null), !t && (e = e.sibling, e !== null)) {
        Z = e;
        return;
      }
      Z = e = c;
    } while (e !== null);
    de = 6, Z = null;
  }
  function ao(e, t, c, u, r, i, f, b, d) {
    e.cancelPendingCommit = null;
    do
      gu();
    while (he !== 0);
    if ((ee & 6) !== 0) throw Error(_(327));
    if (t !== null) {
      if (t === e.current) throw Error(_(177));
      if (i = t.lanes | t.childLanes, i |= bl, bb(e, c, i, f, b, d), e === _e && (Z = _e = null, F = 0), ga = t, _n = e, Xt = c, yr = i, wr = r, Wf = u, (t.subtreeFlags & 10256) !== 0 || (t.flags & 10256) !== 0 ? (e.callbackNode = null, e.callbackPriority = 0, Bs(Oc, function() {
        return io(), null;
      })) : (e.callbackNode = null, e.callbackPriority = 0), u = (t.flags & 13878) !== 0, (t.subtreeFlags & 13878) !== 0 || u) {
        u = A.T, A.T = null, r = R.p, R.p = 2, f = ee, ee |= 4;
        try {
          Es(e, t, c);
        } finally {
          ee = f, R.p = r, A.T = u;
        }
      }
      he = 1, co(), uo(), lo();
    }
  }
  function co() {
    if (he === 1) {
      he = 0;
      var e = _n, t = ga, c = (t.flags & 13878) !== 0;
      if ((t.subtreeFlags & 13878) !== 0 || c) {
        c = A.T, A.T = null;
        var u = R.p;
        R.p = 2;
        var r = ee;
        ee |= 4;
        try {
          Lf(t, e);
          var i = Ur, f = Xi(e.containerInfo), b = i.focusedElem, d = i.selectionRange;
          if (f !== b && b && b.ownerDocument && Yi(b.ownerDocument.documentElement, b)) {
            if (d !== null && rl(b)) {
              var w = d.start, E = d.end;
              if (E === void 0 && (E = w), "selectionStart" in b) b.selectionStart = w, b.selectionEnd = Math.min(E, b.value.length);
              else {
                var M = b.ownerDocument || document, h = M && M.defaultView || window;
                if (h.getSelection) {
                  var v = h.getSelection(), N = b.textContent.length, q = Math.min(d.start, N), re = d.end === void 0 ? q : Math.min(d.end, N);
                  !v.extend && q > re && (f = re, re = q, q = f);
                  var O = Vi(b, q), g = Vi(b, re);
                  if (O && g && (v.rangeCount !== 1 || v.anchorNode !== O.node || v.anchorOffset !== O.offset || v.focusNode !== g.node || v.focusOffset !== g.offset)) {
                    var y = M.createRange();
                    y.setStart(O.node, O.offset), v.removeAllRanges(), q > re ? (v.addRange(y), v.extend(g.node, g.offset)) : (y.setEnd(g.node, g.offset), v.addRange(y));
                  }
                }
              }
            }
            for (M = [], v = b; v = v.parentNode; ) v.nodeType === 1 && M.push({ element: v, left: v.scrollLeft, top: v.scrollTop });
            for (typeof b.focus == "function" && b.focus(), b = 0; b < M.length; b++) {
              var T = M[b];
              T.element.scrollLeft = T.left, T.element.scrollTop = T.top;
            }
          }
          Au = !!Nr, Ur = Nr = null;
        } finally {
          ee = r, R.p = u, A.T = c;
        }
      }
      e.current = t, he = 2;
    }
  }
  function uo() {
    if (he === 2) {
      he = 0;
      var e = _n, t = ga, c = (t.flags & 8772) !== 0;
      if ((t.subtreeFlags & 8772) !== 0 || c) {
        c = A.T, A.T = null;
        var u = R.p;
        R.p = 2;
        var r = ee;
        ee |= 4;
        try {
          Hf(e, t.alternate, t);
        } finally {
          ee = r, R.p = u, A.T = c;
        }
      }
      he = 3;
    }
  }
  function lo() {
    if (he === 4 || he === 3) {
      he = 0, ab();
      var e = _n, t = ga, c = Xt, u = Wf;
      (t.subtreeFlags & 10256) !== 0 || (t.flags & 10256) !== 0 ? he = 5 : (he = 0, ga = _n = null, ro(e, e.pendingLanes));
      var r = e.pendingLanes;
      if (r === 0 && (rn = null), Yu(c), t = t.stateNode, Ke && typeof Ke.onCommitFiberRoot == "function") try {
        Ke.onCommitFiberRoot(Sa, t, void 0, (t.current.flags & 128) === 128);
      } catch {
      }
      if (u !== null) {
        t = A.T, r = R.p, R.p = 2, A.T = null;
        try {
          for (var i = e.onRecoverableError, f = 0; f < u.length; f++) {
            var b = u[f];
            i(b.value, { componentStack: b.stack });
          }
        } finally {
          A.T = t, R.p = r;
        }
      }
      (Xt & 3) !== 0 && gu(), St(e), r = e.pendingLanes, (c & 261930) !== 0 && (r & 42) !== 0 ? e === hr ? uc++ : (uc = 0, hr = e) : uc = 0, lc(0);
    }
  }
  function ro(e, t) {
    (e.pooledCacheLanes &= t) === 0 && (t = e.pooledCache, t != null && (e.pooledCache = null, Ga(t)));
  }
  function gu() {
    return co(), uo(), lo(), io();
  }
  function io() {
    if (he !== 5) return false;
    var e = _n, t = yr;
    yr = 0;
    var c = Yu(Xt), u = A.T, r = R.p;
    try {
      R.p = 32 > c ? 32 : c, A.T = null, c = wr, wr = null;
      var i = _n, f = Xt;
      if (he = 0, ga = _n = null, Xt = 0, (ee & 6) !== 0) throw Error(_(331));
      var b = ee;
      if (ee |= 4, Xf(i.current), Gf(i, i.current, f, c), ee = b, lc(0, false), Ke && typeof Ke.onPostCommitFiberRoot == "function") try {
        Ke.onPostCommitFiberRoot(Sa, i);
      } catch {
      }
      return true;
    } finally {
      R.p = r, A.T = u, ro(e, t);
    }
  }
  function _o(e, t, c) {
    t = rt(c, t), t = er(e.stateNode, t, 2), e = tn(e, t, 2), e !== null && (Ea(e, 2), St(e));
  }
  function ae(e, t, c) {
    if (e.tag === 3) _o(e, e, c);
    else for (; t !== null; ) {
      if (t.tag === 3) {
        _o(t, e, c);
        break;
      } else if (t.tag === 1) {
        var u = t.stateNode;
        if (typeof t.type.getDerivedStateFromError == "function" || typeof u.componentDidCatch == "function" && (rn === null || !rn.has(u))) {
          e = rt(c, e), c = ff(2), u = tn(t, c, 2), u !== null && (of(c, u, t, e), Ea(u, 2), St(u));
          break;
        }
      }
      t = t.return;
    }
  }
  function xr(e, t, c) {
    var u = e.pingCache;
    if (u === null) {
      u = e.pingCache = new Ms();
      var r = /* @__PURE__ */ new Set();
      u.set(t, r);
    } else r = u.get(t), r === void 0 && (r = /* @__PURE__ */ new Set(), u.set(t, r));
    r.has(c) || (Or = true, r.add(c), e = zs.bind(null, e, t, c), t.then(e, e));
  }
  function zs(e, t, c) {
    var u = e.pingCache;
    u !== null && u.delete(t), e.pingedLanes |= e.suspendedLanes & c, e.warmLanes &= ~c, _e === e && (F & c) === c && (de === 4 || de === 3 && (F & 62914560) === F && 300 > Fe() - _u ? (ee & 2) === 0 && ma(e, 0) : pr |= c, da === F && (da = 0)), St(e);
  }
  function fo(e, t) {
    t === 0 && (t = ai()), e = xn(e, t), e !== null && (Ea(e, t), St(e));
  }
  function Ns(e) {
    var t = e.memoizedState, c = 0;
    t !== null && (c = t.retryLane), fo(e, c);
  }
  function Us(e, t) {
    var c = 0;
    switch (e.tag) {
      case 31:
      case 13:
        var u = e.stateNode, r = e.memoizedState;
        r !== null && (c = r.retryLane);
        break;
      case 19:
        u = e.stateNode;
        break;
      case 22:
        u = e.stateNode._retryCache;
        break;
      default:
        throw Error(_(314));
    }
    u !== null && u.delete(t), fo(e, c);
  }
  function Bs(e, t) {
    return Lu(e, t);
  }
  var mu = null, pa = null, Er = false, Ou = false, Ar = false, on = 0;
  function St(e) {
    e !== pa && e.next === null && (pa === null ? mu = pa = e : pa = pa.next = e), Ou = true, Er || (Er = true, qs());
  }
  function lc(e, t) {
    if (!Ar && Ou) {
      Ar = true;
      do
        for (var c = false, u = mu; u !== null; ) {
          if (e !== 0) {
            var r = u.pendingLanes;
            if (r === 0) var i = 0;
            else {
              var f = u.suspendedLanes, b = u.pingedLanes;
              i = (1 << 31 - Je(42 | e) + 1) - 1, i &= r & ~(f & ~b), i = i & 201326741 ? i & 201326741 | 1 : i ? i | 2 : 0;
            }
            i !== 0 && (c = true, go(u, i));
          } else i = F, i = wc(u, u === _e ? i : 0, u.cancelPendingCommit !== null || u.timeoutHandle !== -1), (i & 3) === 0 || xa(u, i) || (c = true, go(u, i));
          u = u.next;
        }
      while (c);
      Ar = false;
    }
  }
  function Ls() {
    oo();
  }
  function oo() {
    Ou = Er = false;
    var e = 0;
    on !== 0 && Js() && (e = on);
    for (var t = Fe(), c = null, u = mu; u !== null; ) {
      var r = u.next, i = bo(u, t);
      i === 0 ? (u.next = null, c === null ? mu = r : c.next = r, r === null && (pa = c)) : (c = u, (e !== 0 || (i & 3) !== 0) && (Ou = true)), u = r;
    }
    he !== 0 && he !== 5 || lc(e), on !== 0 && (on = 0);
  }
  function bo(e, t) {
    for (var c = e.suspendedLanes, u = e.pingedLanes, r = e.expirationTimes, i = e.pendingLanes & -62914561; 0 < i; ) {
      var f = 31 - Je(i), b = 1 << f, d = r[f];
      d === -1 ? ((b & c) === 0 || (b & u) !== 0) && (r[f] = ob(b, t)) : d <= t && (e.expiredLanes |= b), i &= ~b;
    }
    if (t = _e, c = F, c = wc(e, e === t ? c : 0, e.cancelPendingCommit !== null || e.timeoutHandle !== -1), u = e.callbackNode, c === 0 || e === t && (ne === 2 || ne === 9) || e.cancelPendingCommit !== null) return u !== null && u !== null && qu(u), e.callbackNode = null, e.callbackPriority = 0;
    if ((c & 3) === 0 || xa(e, c)) {
      if (t = c & -c, t === e.callbackPriority) return t;
      switch (u !== null && qu(u), Yu(c)) {
        case 2:
        case 8:
          c = ti;
          break;
        case 32:
          c = Oc;
          break;
        case 268435456:
          c = ni;
          break;
        default:
          c = Oc;
      }
      return u = so.bind(null, e), c = Lu(c, u), e.callbackPriority = t, e.callbackNode = c, t;
    }
    return u !== null && u !== null && qu(u), e.callbackPriority = 2, e.callbackNode = null, 2;
  }
  function so(e, t) {
    if (he !== 0 && he !== 5) return e.callbackNode = null, e.callbackPriority = 0, null;
    var c = e.callbackNode;
    if (gu() && e.callbackNode !== c) return null;
    var u = F;
    return u = wc(e, e === _e ? u : 0, e.cancelPendingCommit !== null || e.timeoutHandle !== -1), u === 0 ? null : (Kf(e, u, t), bo(e, Fe()), e.callbackNode != null && e.callbackNode === c ? so.bind(null, e) : null);
  }
  function go(e, t) {
    if (gu()) return null;
    Kf(e, t, true);
  }
  function qs() {
    Is(function() {
      (ee & 6) !== 0 ? Lu(ei, Ls) : oo();
    });
  }
  function Tr() {
    if (on === 0) {
      var e = aa;
      e === 0 && (e = pc, pc <<= 1, (pc & 261888) === 0 && (pc = 256)), on = e;
    }
    return on;
  }
  function mo(e) {
    return e == null || typeof e == "symbol" || typeof e == "boolean" ? null : typeof e == "function" ? e : xc("" + e);
  }
  function Oo(e, t) {
    var c = t.ownerDocument.createElement("input");
    return c.name = t.name, c.value = t.value, e.id && c.setAttribute("form", e.id), t.parentNode.insertBefore(c, t), e = new FormData(e), c.parentNode.removeChild(c), e;
  }
  function Gs(e, t, c, u, r) {
    if (t === "submit" && c && c.stateNode === r) {
      var i = mo((r[qe] || null).action), f = u.submitter;
      f && (t = (t = f[qe] || null) ? mo(t.formAction) : f.getAttribute("formAction"), t !== null && (i = t, f = null));
      var b = new Mc("action", "action", null, u, r);
      e.push({ event: b, listeners: [{ instance: null, listener: function() {
        if (u.defaultPrevented) {
          if (on !== 0) {
            var d = f ? Oo(r, f) : new FormData(r);
            Kl(c, { pending: true, data: d, method: r.method, action: i }, null, d);
          }
        } else typeof i == "function" && (b.preventDefault(), d = f ? Oo(r, f) : new FormData(r), Kl(c, { pending: true, data: d, method: r.method, action: i }, i, d));
      }, currentTarget: r }] });
    }
  }
  for (var Mr = 0; Mr < ol.length; Mr++) {
    var Dr = ol[Mr], Vs = Dr.toLowerCase(), Ys = Dr[0].toUpperCase() + Dr.slice(1);
    gt(Vs, "on" + Ys);
  }
  gt(Wi, "onAnimationEnd"), gt(Fi, "onAnimationIteration"), gt(Ki, "onAnimationStart"), gt("dblclick", "onDoubleClick"), gt("focusin", "onFocus"), gt("focusout", "onBlur"), gt(cs, "onTransitionRun"), gt(us, "onTransitionStart"), gt(ls, "onTransitionCancel"), gt(Ji, "onTransitionEnd"), Xn("onMouseEnter", ["mouseout", "mouseover"]), Xn("onMouseLeave", ["mouseout", "mouseover"]), Xn("onPointerEnter", ["pointerout", "pointerover"]), Xn("onPointerLeave", ["pointerout", "pointerover"]), wn("onChange", "change click focusin focusout input keydown keyup selectionchange".split(" ")), wn("onSelect", "focusout contextmenu dragend focusin keydown keyup mousedown mouseup selectionchange".split(" ")), wn("onBeforeInput", ["compositionend", "keypress", "textInput", "paste"]), wn("onCompositionEnd", "compositionend focusout keydown keypress keyup mousedown".split(" ")), wn("onCompositionStart", "compositionstart focusout keydown keypress keyup mousedown".split(" ")), wn("onCompositionUpdate", "compositionupdate focusout keydown keypress keyup mousedown".split(" "));
  var rc = "abort canplay canplaythrough durationchange emptied encrypted ended error loadeddata loadedmetadata loadstart pause play playing progress ratechange resize seeked seeking stalled suspend timeupdate volumechange waiting".split(" "), Xs = new Set("beforetoggle cancel close invalid load scroll scrollend toggle".split(" ").concat(rc));
  function po(e, t) {
    t = (t & 4) !== 0;
    for (var c = 0; c < e.length; c++) {
      var u = e[c], r = u.event;
      u = u.listeners;
      e: {
        var i = void 0;
        if (t) for (var f = u.length - 1; 0 <= f; f--) {
          var b = u[f], d = b.instance, w = b.currentTarget;
          if (b = b.listener, d !== i && r.isPropagationStopped()) break e;
          i = b, r.currentTarget = w;
          try {
            i(r);
          } catch (E) {
            Cc(E);
          }
          r.currentTarget = null, i = d;
        }
        else for (f = 0; f < u.length; f++) {
          if (b = u[f], d = b.instance, w = b.currentTarget, b = b.listener, d !== i && r.isPropagationStopped()) break e;
          i = b, r.currentTarget = w;
          try {
            i(r);
          } catch (E) {
            Cc(E);
          }
          r.currentTarget = null, i = d;
        }
      }
    }
  }
  function W(e, t) {
    var c = t[Xu];
    c === void 0 && (c = t[Xu] = /* @__PURE__ */ new Set());
    var u = e + "__bubble";
    c.has(u) || (jo(t, e, 2, false), c.add(u));
  }
  function Rr(e, t, c) {
    var u = 0;
    t && (u |= 4), jo(c, e, u, t);
  }
  var pu = "_reactListening" + Math.random().toString(36).slice(2);
  function Cr(e) {
    if (!e[pu]) {
      e[pu] = true, fi.forEach(function(c) {
        c !== "selectionchange" && (Xs.has(c) || Rr(c, false, e), Rr(c, true, e));
      });
      var t = e.nodeType === 9 ? e : e.ownerDocument;
      t === null || t[pu] || (t[pu] = true, Rr("selectionchange", false, t));
    }
  }
  function jo(e, t, c, u) {
    switch (Ko(t)) {
      case 2:
        var r = Od;
        break;
      case 8:
        r = pd;
        break;
      default:
        r = Fr;
    }
    c = r.bind(null, t, c, e), r = void 0, !$u || t !== "touchstart" && t !== "touchmove" && t !== "wheel" || (r = true), u ? r !== void 0 ? e.addEventListener(t, c, { capture: true, passive: r }) : e.addEventListener(t, c, true) : r !== void 0 ? e.addEventListener(t, c, { passive: r }) : e.addEventListener(t, c, false);
  }
  function Hr(e, t, c, u, r) {
    var i = u;
    if ((t & 1) === 0 && (t & 2) === 0 && u !== null) e: for (; ; ) {
      if (u === null) return;
      var f = u.tag;
      if (f === 3 || f === 4) {
        var b = u.stateNode.containerInfo;
        if (b === r) break;
        if (f === 4) for (f = u.return; f !== null; ) {
          var d = f.tag;
          if ((d === 3 || d === 4) && f.stateNode.containerInfo === r) return;
          f = f.return;
        }
        for (; b !== null; ) {
          if (f = Gn(b), f === null) return;
          if (d = f.tag, d === 5 || d === 6 || d === 26 || d === 27) {
            u = i = f;
            continue e;
          }
          b = b.parentNode;
        }
      }
      u = u.return;
    }
    hi(function() {
      var w = i, E = ku(c), M = [];
      e: {
        var h = ki.get(e);
        if (h !== void 0) {
          var v = Mc, N = e;
          switch (e) {
            case "keypress":
              if (Ac(c) === 0) break e;
            case "keydown":
            case "keyup":
              v = Ub;
              break;
            case "focusin":
              N = "focus", v = nl;
              break;
            case "focusout":
              N = "blur", v = nl;
              break;
            case "beforeblur":
            case "afterblur":
              v = nl;
              break;
            case "click":
              if (c.button === 2) break e;
            case "auxclick":
            case "dblclick":
            case "mousedown":
            case "mousemove":
            case "mouseup":
            case "mouseout":
            case "mouseover":
            case "contextmenu":
              v = xi;
              break;
            case "drag":
            case "dragend":
            case "dragenter":
            case "dragexit":
            case "dragleave":
            case "dragover":
            case "dragstart":
            case "drop":
              v = Sb;
              break;
            case "touchcancel":
            case "touchend":
            case "touchmove":
            case "touchstart":
              v = qb;
              break;
            case Wi:
            case Fi:
            case Ki:
              v = Ab;
              break;
            case Ji:
              v = Vb;
              break;
            case "scroll":
            case "scrollend":
              v = hb;
              break;
            case "wheel":
              v = Xb;
              break;
            case "copy":
            case "cut":
            case "paste":
              v = Mb;
              break;
            case "gotpointercapture":
            case "lostpointercapture":
            case "pointercancel":
            case "pointerdown":
            case "pointermove":
            case "pointerout":
            case "pointerover":
            case "pointerup":
              v = Ai;
              break;
            case "toggle":
            case "beforetoggle":
              v = Zb;
          }
          var q = (t & 4) !== 0, re = !q && (e === "scroll" || e === "scrollend"), O = q ? h !== null ? h + "Capture" : null : h;
          q = [];
          for (var g = w, y; g !== null; ) {
            var T = g;
            if (y = T.stateNode, T = T.tag, T !== 5 && T !== 26 && T !== 27 || y === null || O === null || (T = Ma(g, O), T != null && q.push(ic(g, T, y))), re) break;
            g = g.return;
          }
          0 < q.length && (h = new v(h, N, null, c, E), M.push({ event: h, listeners: q }));
        }
      }
      if ((t & 7) === 0) {
        e: {
          if (h = e === "mouseover" || e === "pointerover", v = e === "mouseout" || e === "pointerout", h && c !== Ju && (N = c.relatedTarget || c.fromElement) && (Gn(N) || N[qn])) break e;
          if ((v || h) && (h = E.window === E ? E : (h = E.ownerDocument) ? h.defaultView || h.parentWindow : window, v ? (N = c.relatedTarget || c.toElement, v = w, N = N ? Gn(N) : null, N !== null && (re = s(N), q = N.tag, N !== re || q !== 5 && q !== 27 && q !== 6) && (N = null)) : (v = null, N = w), v !== N)) {
            if (q = xi, T = "onMouseLeave", O = "onMouseEnter", g = "mouse", (e === "pointerout" || e === "pointerover") && (q = Ai, T = "onPointerLeave", O = "onPointerEnter", g = "pointer"), re = v == null ? h : Ta(v), y = N == null ? h : Ta(N), h = new q(T, g + "leave", v, c, E), h.target = re, h.relatedTarget = y, T = null, Gn(E) === w && (q = new q(O, g + "enter", N, c, E), q.target = y, q.relatedTarget = re, T = q), re = T, v && N) t: {
              for (q = Qs, O = v, g = N, y = 0, T = O; T; T = q(T)) y++;
              T = 0;
              for (var L = g; L; L = q(L)) T++;
              for (; 0 < y - T; ) O = q(O), y--;
              for (; 0 < T - y; ) g = q(g), T--;
              for (; y--; ) {
                if (O === g || g !== null && O === g.alternate) {
                  q = O;
                  break t;
                }
                O = q(O), g = q(g);
              }
              q = null;
            }
            else q = null;
            v !== null && yo(M, h, v, q, false), N !== null && re !== null && yo(M, re, N, q, true);
          }
        }
        e: {
          if (h = w ? Ta(w) : window, v = h.nodeName && h.nodeName.toLowerCase(), v === "select" || v === "input" && h.type === "file") var $ = Ni;
          else if (Hi(h)) if (Ui) $ = ts;
          else {
            $ = Pb;
            var B = $b;
          }
          else v = h.nodeName, !v || v.toLowerCase() !== "input" || h.type !== "checkbox" && h.type !== "radio" ? w && Ku(w.elementType) && ($ = Ni) : $ = es;
          if ($ && ($ = $(e, w))) {
            zi(M, $, c, E);
            break e;
          }
          B && B(e, h, w), e === "focusout" && w && h.type === "number" && w.memoizedProps.value != null && Fu(h, "number", h.value);
        }
        switch (B = w ? Ta(w) : window, e) {
          case "focusin":
            (Hi(B) || B.contentEditable === "true") && (Jn = B, il = w, Ba = null);
            break;
          case "focusout":
            Ba = il = Jn = null;
            break;
          case "mousedown":
            _l = true;
            break;
          case "contextmenu":
          case "mouseup":
          case "dragend":
            _l = false, Qi(M, c, E);
            break;
          case "selectionchange":
            if (as) break;
          case "keydown":
          case "keyup":
            Qi(M, c, E);
        }
        var X;
        if (cl) e: {
          switch (e) {
            case "compositionstart":
              var K = "onCompositionStart";
              break e;
            case "compositionend":
              K = "onCompositionEnd";
              break e;
            case "compositionupdate":
              K = "onCompositionUpdate";
              break e;
          }
          K = void 0;
        }
        else Kn ? Ri(e, c) && (K = "onCompositionEnd") : e === "keydown" && c.keyCode === 229 && (K = "onCompositionStart");
        K && (Ti && c.locale !== "ko" && (Kn || K !== "onCompositionStart" ? K === "onCompositionEnd" && Kn && (X = vi()) : (Kt = E, Pu = "value" in Kt ? Kt.value : Kt.textContent, Kn = true)), B = ju(w, K), 0 < B.length && (K = new Ei(K, e, null, c, E), M.push({ event: K, listeners: B }), X ? K.data = X : (X = Ci(c), X !== null && (K.data = X)))), (X = Fb ? Kb(e, c) : Jb(e, c)) && (K = ju(w, "onBeforeInput"), 0 < K.length && (B = new Ei("onBeforeInput", "beforeinput", null, c, E), M.push({ event: B, listeners: K }), B.data = X)), Gs(M, e, w, c, E);
      }
      po(M, t);
    });
  }
  function ic(e, t, c) {
    return { instance: e, listener: t, currentTarget: c };
  }
  function ju(e, t) {
    for (var c = t + "Capture", u = []; e !== null; ) {
      var r = e, i = r.stateNode;
      if (r = r.tag, r !== 5 && r !== 26 && r !== 27 || i === null || (r = Ma(e, c), r != null && u.unshift(ic(e, r, i)), r = Ma(e, t), r != null && u.push(ic(e, r, i))), e.tag === 3) return u;
      e = e.return;
    }
    return [];
  }
  function Qs(e) {
    if (e === null) return null;
    do
      e = e.return;
    while (e && e.tag !== 5 && e.tag !== 27);
    return e || null;
  }
  function yo(e, t, c, u, r) {
    for (var i = t._reactName, f = []; c !== null && c !== u; ) {
      var b = c, d = b.alternate, w = b.stateNode;
      if (b = b.tag, d !== null && d === u) break;
      b !== 5 && b !== 26 && b !== 27 || w === null || (d = w, r ? (w = Ma(c, i), w != null && f.unshift(ic(c, w, d))) : r || (w = Ma(c, i), w != null && f.push(ic(c, w, d)))), c = c.return;
    }
    f.length !== 0 && e.push({ event: t, listeners: f });
  }
  var Zs = /\r\n?/g, Ws = /\u0000|\uFFFD/g;
  function wo(e) {
    return (typeof e == "string" ? e : "" + e).replace(Zs, `
`).replace(Ws, "");
  }
  function ho(e, t) {
    return t = wo(t), wo(e) === t;
  }
  function le(e, t, c, u, r, i) {
    switch (c) {
      case "children":
        typeof u == "string" ? t === "body" || t === "textarea" && u === "" || Zn(e, u) : (typeof u == "number" || typeof u == "bigint") && t !== "body" && Zn(e, "" + u);
        break;
      case "className":
        vc(e, "class", u);
        break;
      case "tabIndex":
        vc(e, "tabindex", u);
        break;
      case "dir":
      case "role":
      case "viewBox":
      case "width":
      case "height":
        vc(e, c, u);
        break;
      case "style":
        yi(e, u, i);
        break;
      case "data":
        if (t !== "object") {
          vc(e, "data", u);
          break;
        }
      case "src":
      case "href":
        if (u === "" && (t !== "a" || c !== "href")) {
          e.removeAttribute(c);
          break;
        }
        if (u == null || typeof u == "function" || typeof u == "symbol" || typeof u == "boolean") {
          e.removeAttribute(c);
          break;
        }
        u = xc("" + u), e.setAttribute(c, u);
        break;
      case "action":
      case "formAction":
        if (typeof u == "function") {
          e.setAttribute(c, "javascript:throw new Error('A React form was unexpectedly submitted. If you called form.submit() manually, consider using form.requestSubmit() instead. If you\\'re trying to use event.stopPropagation() in a submit event handler, consider also calling event.preventDefault().')");
          break;
        } else typeof i == "function" && (c === "formAction" ? (t !== "input" && le(e, t, "name", r.name, r, null), le(e, t, "formEncType", r.formEncType, r, null), le(e, t, "formMethod", r.formMethod, r, null), le(e, t, "formTarget", r.formTarget, r, null)) : (le(e, t, "encType", r.encType, r, null), le(e, t, "method", r.method, r, null), le(e, t, "target", r.target, r, null)));
        if (u == null || typeof u == "symbol" || typeof u == "boolean") {
          e.removeAttribute(c);
          break;
        }
        u = xc("" + u), e.setAttribute(c, u);
        break;
      case "onClick":
        u != null && (e.onclick = Tt);
        break;
      case "onScroll":
        u != null && W("scroll", e);
        break;
      case "onScrollEnd":
        u != null && W("scrollend", e);
        break;
      case "dangerouslySetInnerHTML":
        if (u != null) {
          if (typeof u != "object" || !("__html" in u)) throw Error(_(61));
          if (c = u.__html, c != null) {
            if (r.children != null) throw Error(_(60));
            e.innerHTML = c;
          }
        }
        break;
      case "multiple":
        e.multiple = u && typeof u != "function" && typeof u != "symbol";
        break;
      case "muted":
        e.muted = u && typeof u != "function" && typeof u != "symbol";
        break;
      case "suppressContentEditableWarning":
      case "suppressHydrationWarning":
      case "defaultValue":
      case "defaultChecked":
      case "innerHTML":
      case "ref":
        break;
      case "autoFocus":
        break;
      case "xlinkHref":
        if (u == null || typeof u == "function" || typeof u == "boolean" || typeof u == "symbol") {
          e.removeAttribute("xlink:href");
          break;
        }
        c = xc("" + u), e.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", c);
        break;
      case "contentEditable":
      case "spellCheck":
      case "draggable":
      case "value":
      case "autoReverse":
      case "externalResourcesRequired":
      case "focusable":
      case "preserveAlpha":
        u != null && typeof u != "function" && typeof u != "symbol" ? e.setAttribute(c, "" + u) : e.removeAttribute(c);
        break;
      case "inert":
      case "allowFullScreen":
      case "async":
      case "autoPlay":
      case "controls":
      case "default":
      case "defer":
      case "disabled":
      case "disablePictureInPicture":
      case "disableRemotePlayback":
      case "formNoValidate":
      case "hidden":
      case "loop":
      case "noModule":
      case "noValidate":
      case "open":
      case "playsInline":
      case "readOnly":
      case "required":
      case "reversed":
      case "scoped":
      case "seamless":
      case "itemScope":
        u && typeof u != "function" && typeof u != "symbol" ? e.setAttribute(c, "") : e.removeAttribute(c);
        break;
      case "capture":
      case "download":
        u === true ? e.setAttribute(c, "") : u !== false && u != null && typeof u != "function" && typeof u != "symbol" ? e.setAttribute(c, u) : e.removeAttribute(c);
        break;
      case "cols":
      case "rows":
      case "size":
      case "span":
        u != null && typeof u != "function" && typeof u != "symbol" && !isNaN(u) && 1 <= u ? e.setAttribute(c, u) : e.removeAttribute(c);
        break;
      case "rowSpan":
      case "start":
        u == null || typeof u == "function" || typeof u == "symbol" || isNaN(u) ? e.removeAttribute(c) : e.setAttribute(c, u);
        break;
      case "popover":
        W("beforetoggle", e), W("toggle", e), hc(e, "popover", u);
        break;
      case "xlinkActuate":
        At(e, "http://www.w3.org/1999/xlink", "xlink:actuate", u);
        break;
      case "xlinkArcrole":
        At(e, "http://www.w3.org/1999/xlink", "xlink:arcrole", u);
        break;
      case "xlinkRole":
        At(e, "http://www.w3.org/1999/xlink", "xlink:role", u);
        break;
      case "xlinkShow":
        At(e, "http://www.w3.org/1999/xlink", "xlink:show", u);
        break;
      case "xlinkTitle":
        At(e, "http://www.w3.org/1999/xlink", "xlink:title", u);
        break;
      case "xlinkType":
        At(e, "http://www.w3.org/1999/xlink", "xlink:type", u);
        break;
      case "xmlBase":
        At(e, "http://www.w3.org/XML/1998/namespace", "xml:base", u);
        break;
      case "xmlLang":
        At(e, "http://www.w3.org/XML/1998/namespace", "xml:lang", u);
        break;
      case "xmlSpace":
        At(e, "http://www.w3.org/XML/1998/namespace", "xml:space", u);
        break;
      case "is":
        hc(e, "is", u);
        break;
      case "innerText":
      case "textContent":
        break;
      default:
        (!(2 < c.length) || c[0] !== "o" && c[0] !== "O" || c[1] !== "n" && c[1] !== "N") && (c = yb.get(c) || c, hc(e, c, u));
    }
  }
  function zr(e, t, c, u, r, i) {
    switch (c) {
      case "style":
        yi(e, u, i);
        break;
      case "dangerouslySetInnerHTML":
        if (u != null) {
          if (typeof u != "object" || !("__html" in u)) throw Error(_(61));
          if (c = u.__html, c != null) {
            if (r.children != null) throw Error(_(60));
            e.innerHTML = c;
          }
        }
        break;
      case "children":
        typeof u == "string" ? Zn(e, u) : (typeof u == "number" || typeof u == "bigint") && Zn(e, "" + u);
        break;
      case "onScroll":
        u != null && W("scroll", e);
        break;
      case "onScrollEnd":
        u != null && W("scrollend", e);
        break;
      case "onClick":
        u != null && (e.onclick = Tt);
        break;
      case "suppressContentEditableWarning":
      case "suppressHydrationWarning":
      case "innerHTML":
      case "ref":
        break;
      case "innerText":
      case "textContent":
        break;
      default:
        if (!oi.hasOwnProperty(c)) e: {
          if (c[0] === "o" && c[1] === "n" && (r = c.endsWith("Capture"), t = c.slice(2, r ? c.length - 7 : void 0), i = e[qe] || null, i = i != null ? i[c] : null, typeof i == "function" && e.removeEventListener(t, i, r), typeof u == "function")) {
            typeof i != "function" && i !== null && (c in e ? e[c] = null : e.hasAttribute(c) && e.removeAttribute(c)), e.addEventListener(t, u, r);
            break e;
          }
          c in e ? e[c] = u : u === true ? e.setAttribute(c, "") : hc(e, c, u);
        }
    }
  }
  function Me(e, t, c) {
    switch (t) {
      case "div":
      case "span":
      case "svg":
      case "path":
      case "a":
      case "g":
      case "p":
      case "li":
        break;
      case "img":
        W("error", e), W("load", e);
        var u = false, r = false, i;
        for (i in c) if (c.hasOwnProperty(i)) {
          var f = c[i];
          if (f != null) switch (i) {
            case "src":
              u = true;
              break;
            case "srcSet":
              r = true;
              break;
            case "children":
            case "dangerouslySetInnerHTML":
              throw Error(_(137, t));
            default:
              le(e, t, i, f, c, null);
          }
        }
        r && le(e, t, "srcSet", c.srcSet, c, null), u && le(e, t, "src", c.src, c, null);
        return;
      case "input":
        W("invalid", e);
        var b = i = f = r = null, d = null, w = null;
        for (u in c) if (c.hasOwnProperty(u)) {
          var E = c[u];
          if (E != null) switch (u) {
            case "name":
              r = E;
              break;
            case "type":
              f = E;
              break;
            case "checked":
              d = E;
              break;
            case "defaultChecked":
              w = E;
              break;
            case "value":
              i = E;
              break;
            case "defaultValue":
              b = E;
              break;
            case "children":
            case "dangerouslySetInnerHTML":
              if (E != null) throw Error(_(137, t));
              break;
            default:
              le(e, t, u, E, c, null);
          }
        }
        mi(e, i, b, d, w, f, r, false);
        return;
      case "select":
        W("invalid", e), u = f = i = null;
        for (r in c) if (c.hasOwnProperty(r) && (b = c[r], b != null)) switch (r) {
          case "value":
            i = b;
            break;
          case "defaultValue":
            f = b;
            break;
          case "multiple":
            u = b;
          default:
            le(e, t, r, b, c, null);
        }
        t = i, c = f, e.multiple = !!u, t != null ? Qn(e, !!u, t, false) : c != null && Qn(e, !!u, c, true);
        return;
      case "textarea":
        W("invalid", e), i = r = u = null;
        for (f in c) if (c.hasOwnProperty(f) && (b = c[f], b != null)) switch (f) {
          case "value":
            u = b;
            break;
          case "defaultValue":
            r = b;
            break;
          case "children":
            i = b;
            break;
          case "dangerouslySetInnerHTML":
            if (b != null) throw Error(_(91));
            break;
          default:
            le(e, t, f, b, c, null);
        }
        pi(e, u, r, i);
        return;
      case "option":
        for (d in c) if (c.hasOwnProperty(d) && (u = c[d], u != null)) switch (d) {
          case "selected":
            e.selected = u && typeof u != "function" && typeof u != "symbol";
            break;
          default:
            le(e, t, d, u, c, null);
        }
        return;
      case "dialog":
        W("beforetoggle", e), W("toggle", e), W("cancel", e), W("close", e);
        break;
      case "iframe":
      case "object":
        W("load", e);
        break;
      case "video":
      case "audio":
        for (u = 0; u < rc.length; u++) W(rc[u], e);
        break;
      case "image":
        W("error", e), W("load", e);
        break;
      case "details":
        W("toggle", e);
        break;
      case "embed":
      case "source":
      case "link":
        W("error", e), W("load", e);
      case "area":
      case "base":
      case "br":
      case "col":
      case "hr":
      case "keygen":
      case "meta":
      case "param":
      case "track":
      case "wbr":
      case "menuitem":
        for (w in c) if (c.hasOwnProperty(w) && (u = c[w], u != null)) switch (w) {
          case "children":
          case "dangerouslySetInnerHTML":
            throw Error(_(137, t));
          default:
            le(e, t, w, u, c, null);
        }
        return;
      default:
        if (Ku(t)) {
          for (E in c) c.hasOwnProperty(E) && (u = c[E], u !== void 0 && zr(e, t, E, u, c, void 0));
          return;
        }
    }
    for (b in c) c.hasOwnProperty(b) && (u = c[b], u != null && le(e, t, b, u, c, null));
  }
  function Fs(e, t, c, u) {
    switch (t) {
      case "div":
      case "span":
      case "svg":
      case "path":
      case "a":
      case "g":
      case "p":
      case "li":
        break;
      case "input":
        var r = null, i = null, f = null, b = null, d = null, w = null, E = null;
        for (v in c) {
          var M = c[v];
          if (c.hasOwnProperty(v) && M != null) switch (v) {
            case "checked":
              break;
            case "value":
              break;
            case "defaultValue":
              d = M;
            default:
              u.hasOwnProperty(v) || le(e, t, v, null, u, M);
          }
        }
        for (var h in u) {
          var v = u[h];
          if (M = c[h], u.hasOwnProperty(h) && (v != null || M != null)) switch (h) {
            case "type":
              i = v;
              break;
            case "name":
              r = v;
              break;
            case "checked":
              w = v;
              break;
            case "defaultChecked":
              E = v;
              break;
            case "value":
              f = v;
              break;
            case "defaultValue":
              b = v;
              break;
            case "children":
            case "dangerouslySetInnerHTML":
              if (v != null) throw Error(_(137, t));
              break;
            default:
              v !== M && le(e, t, h, v, u, M);
          }
        }
        Wu(e, f, b, d, w, E, i, r);
        return;
      case "select":
        v = f = b = h = null;
        for (i in c) if (d = c[i], c.hasOwnProperty(i) && d != null) switch (i) {
          case "value":
            break;
          case "multiple":
            v = d;
          default:
            u.hasOwnProperty(i) || le(e, t, i, null, u, d);
        }
        for (r in u) if (i = u[r], d = c[r], u.hasOwnProperty(r) && (i != null || d != null)) switch (r) {
          case "value":
            h = i;
            break;
          case "defaultValue":
            b = i;
            break;
          case "multiple":
            f = i;
          default:
            i !== d && le(e, t, r, i, u, d);
        }
        t = b, c = f, u = v, h != null ? Qn(e, !!c, h, false) : !!u != !!c && (t != null ? Qn(e, !!c, t, true) : Qn(e, !!c, c ? [] : "", false));
        return;
      case "textarea":
        v = h = null;
        for (b in c) if (r = c[b], c.hasOwnProperty(b) && r != null && !u.hasOwnProperty(b)) switch (b) {
          case "value":
            break;
          case "children":
            break;
          default:
            le(e, t, b, null, u, r);
        }
        for (f in u) if (r = u[f], i = c[f], u.hasOwnProperty(f) && (r != null || i != null)) switch (f) {
          case "value":
            h = r;
            break;
          case "defaultValue":
            v = r;
            break;
          case "children":
            break;
          case "dangerouslySetInnerHTML":
            if (r != null) throw Error(_(91));
            break;
          default:
            r !== i && le(e, t, f, r, u, i);
        }
        Oi(e, h, v);
        return;
      case "option":
        for (var N in c) if (h = c[N], c.hasOwnProperty(N) && h != null && !u.hasOwnProperty(N)) switch (N) {
          case "selected":
            e.selected = false;
            break;
          default:
            le(e, t, N, null, u, h);
        }
        for (d in u) if (h = u[d], v = c[d], u.hasOwnProperty(d) && h !== v && (h != null || v != null)) switch (d) {
          case "selected":
            e.selected = h && typeof h != "function" && typeof h != "symbol";
            break;
          default:
            le(e, t, d, h, u, v);
        }
        return;
      case "img":
      case "link":
      case "area":
      case "base":
      case "br":
      case "col":
      case "embed":
      case "hr":
      case "keygen":
      case "meta":
      case "param":
      case "source":
      case "track":
      case "wbr":
      case "menuitem":
        for (var q in c) h = c[q], c.hasOwnProperty(q) && h != null && !u.hasOwnProperty(q) && le(e, t, q, null, u, h);
        for (w in u) if (h = u[w], v = c[w], u.hasOwnProperty(w) && h !== v && (h != null || v != null)) switch (w) {
          case "children":
          case "dangerouslySetInnerHTML":
            if (h != null) throw Error(_(137, t));
            break;
          default:
            le(e, t, w, h, u, v);
        }
        return;
      default:
        if (Ku(t)) {
          for (var re in c) h = c[re], c.hasOwnProperty(re) && h !== void 0 && !u.hasOwnProperty(re) && zr(e, t, re, void 0, u, h);
          for (E in u) h = u[E], v = c[E], !u.hasOwnProperty(E) || h === v || h === void 0 && v === void 0 || zr(e, t, E, h, u, v);
          return;
        }
    }
    for (var O in c) h = c[O], c.hasOwnProperty(O) && h != null && !u.hasOwnProperty(O) && le(e, t, O, null, u, h);
    for (M in u) h = u[M], v = c[M], !u.hasOwnProperty(M) || h === v || h == null && v == null || le(e, t, M, h, u, v);
  }
  function vo(e) {
    switch (e) {
      case "css":
      case "script":
      case "font":
      case "img":
      case "image":
      case "input":
      case "link":
        return true;
      default:
        return false;
    }
  }
  function Ks() {
    if (typeof performance.getEntriesByType == "function") {
      for (var e = 0, t = 0, c = performance.getEntriesByType("resource"), u = 0; u < c.length; u++) {
        var r = c[u], i = r.transferSize, f = r.initiatorType, b = r.duration;
        if (i && b && vo(f)) {
          for (f = 0, b = r.responseEnd, u += 1; u < c.length; u++) {
            var d = c[u], w = d.startTime;
            if (w > b) break;
            var E = d.transferSize, M = d.initiatorType;
            E && vo(M) && (d = d.responseEnd, f += E * (d < b ? 1 : (b - w) / (d - w)));
          }
          if (--u, t += 8 * (i + f) / (r.duration / 1e3), e++, 10 < e) break;
        }
      }
      if (0 < e) return t / e / 1e6;
    }
    return navigator.connection && (e = navigator.connection.downlink, typeof e == "number") ? e : 5;
  }
  var Nr = null, Ur = null;
  function yu(e) {
    return e.nodeType === 9 ? e : e.ownerDocument;
  }
  function So(e) {
    switch (e) {
      case "http://www.w3.org/2000/svg":
        return 1;
      case "http://www.w3.org/1998/Math/MathML":
        return 2;
      default:
        return 0;
    }
  }
  function xo(e, t) {
    if (e === 0) switch (t) {
      case "svg":
        return 1;
      case "math":
        return 2;
      default:
        return 0;
    }
    return e === 1 && t === "foreignObject" ? 0 : e;
  }
  function Br(e, t) {
    return e === "textarea" || e === "noscript" || typeof t.children == "string" || typeof t.children == "number" || typeof t.children == "bigint" || typeof t.dangerouslySetInnerHTML == "object" && t.dangerouslySetInnerHTML !== null && t.dangerouslySetInnerHTML.__html != null;
  }
  var Lr = null;
  function Js() {
    var e = window.event;
    return e && e.type === "popstate" ? e === Lr ? false : (Lr = e, true) : (Lr = null, false);
  }
  var Eo = typeof setTimeout == "function" ? setTimeout : void 0, ks = typeof clearTimeout == "function" ? clearTimeout : void 0, Ao = typeof Promise == "function" ? Promise : void 0, Is = typeof queueMicrotask == "function" ? queueMicrotask : typeof Ao < "u" ? function(e) {
    return Ao.resolve(null).then(e).catch($s);
  } : Eo;
  function $s(e) {
    setTimeout(function() {
      throw e;
    });
  }
  function bn(e) {
    return e === "head";
  }
  function To(e, t) {
    var c = t, u = 0;
    do {
      var r = c.nextSibling;
      if (e.removeChild(c), r && r.nodeType === 8) if (c = r.data, c === "/$" || c === "/&") {
        if (u === 0) {
          e.removeChild(r), ha(t);
          return;
        }
        u--;
      } else if (c === "$" || c === "$?" || c === "$~" || c === "$!" || c === "&") u++;
      else if (c === "html") _c(e.ownerDocument.documentElement);
      else if (c === "head") {
        c = e.ownerDocument.head, _c(c);
        for (var i = c.firstChild; i; ) {
          var f = i.nextSibling, b = i.nodeName;
          i[Aa] || b === "SCRIPT" || b === "STYLE" || b === "LINK" && i.rel.toLowerCase() === "stylesheet" || c.removeChild(i), i = f;
        }
      } else c === "body" && _c(e.ownerDocument.body);
      c = r;
    } while (c);
    ha(t);
  }
  function Mo(e, t) {
    var c = e;
    e = 0;
    do {
      var u = c.nextSibling;
      if (c.nodeType === 1 ? t ? (c._stashedDisplay = c.style.display, c.style.display = "none") : (c.style.display = c._stashedDisplay || "", c.getAttribute("style") === "" && c.removeAttribute("style")) : c.nodeType === 3 && (t ? (c._stashedText = c.nodeValue, c.nodeValue = "") : c.nodeValue = c._stashedText || ""), u && u.nodeType === 8) if (c = u.data, c === "/$") {
        if (e === 0) break;
        e--;
      } else c !== "$" && c !== "$?" && c !== "$~" && c !== "$!" || e++;
      c = u;
    } while (c);
  }
  function qr(e) {
    var t = e.firstChild;
    for (t && t.nodeType === 10 && (t = t.nextSibling); t; ) {
      var c = t;
      switch (t = t.nextSibling, c.nodeName) {
        case "HTML":
        case "HEAD":
        case "BODY":
          qr(c), Qu(c);
          continue;
        case "SCRIPT":
        case "STYLE":
          continue;
        case "LINK":
          if (c.rel.toLowerCase() === "stylesheet") continue;
      }
      e.removeChild(c);
    }
  }
  function Ps(e, t, c, u) {
    for (; e.nodeType === 1; ) {
      var r = c;
      if (e.nodeName.toLowerCase() !== t.toLowerCase()) {
        if (!u && (e.nodeName !== "INPUT" || e.type !== "hidden")) break;
      } else if (u) {
        if (!e[Aa]) switch (t) {
          case "meta":
            if (!e.hasAttribute("itemprop")) break;
            return e;
          case "link":
            if (i = e.getAttribute("rel"), i === "stylesheet" && e.hasAttribute("data-precedence")) break;
            if (i !== r.rel || e.getAttribute("href") !== (r.href == null || r.href === "" ? null : r.href) || e.getAttribute("crossorigin") !== (r.crossOrigin == null ? null : r.crossOrigin) || e.getAttribute("title") !== (r.title == null ? null : r.title)) break;
            return e;
          case "style":
            if (e.hasAttribute("data-precedence")) break;
            return e;
          case "script":
            if (i = e.getAttribute("src"), (i !== (r.src == null ? null : r.src) || e.getAttribute("type") !== (r.type == null ? null : r.type) || e.getAttribute("crossorigin") !== (r.crossOrigin == null ? null : r.crossOrigin)) && i && e.hasAttribute("async") && !e.hasAttribute("itemprop")) break;
            return e;
          default:
            return e;
        }
      } else if (t === "input" && e.type === "hidden") {
        var i = r.name == null ? null : "" + r.name;
        if (r.type === "hidden" && e.getAttribute("name") === i) return e;
      } else return e;
      if (e = bt(e.nextSibling), e === null) break;
    }
    return null;
  }
  function ed(e, t, c) {
    if (t === "") return null;
    for (; e.nodeType !== 3; ) if ((e.nodeType !== 1 || e.nodeName !== "INPUT" || e.type !== "hidden") && !c || (e = bt(e.nextSibling), e === null)) return null;
    return e;
  }
  function Do(e, t) {
    for (; e.nodeType !== 8; ) if ((e.nodeType !== 1 || e.nodeName !== "INPUT" || e.type !== "hidden") && !t || (e = bt(e.nextSibling), e === null)) return null;
    return e;
  }
  function Gr(e) {
    return e.data === "$?" || e.data === "$~";
  }
  function Vr(e) {
    return e.data === "$!" || e.data === "$?" && e.ownerDocument.readyState !== "loading";
  }
  function td(e, t) {
    var c = e.ownerDocument;
    if (e.data === "$~") e._reactRetry = t;
    else if (e.data !== "$?" || c.readyState !== "loading") t();
    else {
      var u = function() {
        t(), c.removeEventListener("DOMContentLoaded", u);
      };
      c.addEventListener("DOMContentLoaded", u), e._reactRetry = u;
    }
  }
  function bt(e) {
    for (; e != null; e = e.nextSibling) {
      var t = e.nodeType;
      if (t === 1 || t === 3) break;
      if (t === 8) {
        if (t = e.data, t === "$" || t === "$!" || t === "$?" || t === "$~" || t === "&" || t === "F!" || t === "F") break;
        if (t === "/$" || t === "/&") return null;
      }
    }
    return e;
  }
  var Yr = null;
  function Ro(e) {
    e = e.nextSibling;
    for (var t = 0; e; ) {
      if (e.nodeType === 8) {
        var c = e.data;
        if (c === "/$" || c === "/&") {
          if (t === 0) return bt(e.nextSibling);
          t--;
        } else c !== "$" && c !== "$!" && c !== "$?" && c !== "$~" && c !== "&" || t++;
      }
      e = e.nextSibling;
    }
    return null;
  }
  function Co(e) {
    e = e.previousSibling;
    for (var t = 0; e; ) {
      if (e.nodeType === 8) {
        var c = e.data;
        if (c === "$" || c === "$!" || c === "$?" || c === "$~" || c === "&") {
          if (t === 0) return e;
          t--;
        } else c !== "/$" && c !== "/&" || t++;
      }
      e = e.previousSibling;
    }
    return null;
  }
  function Ho(e, t, c) {
    switch (t = yu(c), e) {
      case "html":
        if (e = t.documentElement, !e) throw Error(_(452));
        return e;
      case "head":
        if (e = t.head, !e) throw Error(_(453));
        return e;
      case "body":
        if (e = t.body, !e) throw Error(_(454));
        return e;
      default:
        throw Error(_(451));
    }
  }
  function _c(e) {
    for (var t = e.attributes; t.length; ) e.removeAttributeNode(t[0]);
    Qu(e);
  }
  var st = /* @__PURE__ */ new Map(), zo = /* @__PURE__ */ new Set();
  function wu(e) {
    return typeof e.getRootNode == "function" ? e.getRootNode() : e.nodeType === 9 ? e : e.ownerDocument;
  }
  var Qt = R.d;
  R.d = { f: nd, r: ad, D: cd, C: ud, L: ld, m: rd, X: _d, S: id, M: fd };
  function nd() {
    var e = Qt.f(), t = bu();
    return e || t;
  }
  function ad(e) {
    var t = Vn(e);
    t !== null && t.tag === 5 && t.type === "form" ? J_(t) : Qt.r(e);
  }
  var ja = typeof document > "u" ? null : document;
  function No(e, t, c) {
    var u = ja;
    if (u && typeof t == "string" && t) {
      var r = ut(t);
      r = 'link[rel="' + e + '"][href="' + r + '"]', typeof c == "string" && (r += '[crossorigin="' + c + '"]'), zo.has(r) || (zo.add(r), e = { rel: e, crossOrigin: c, href: t }, u.querySelector(r) === null && (t = u.createElement("link"), Me(t, "link", e), ve(t), u.head.appendChild(t)));
    }
  }
  function cd(e) {
    Qt.D(e), No("dns-prefetch", e, null);
  }
  function ud(e, t) {
    Qt.C(e, t), No("preconnect", e, t);
  }
  function ld(e, t, c) {
    Qt.L(e, t, c);
    var u = ja;
    if (u && e && t) {
      var r = 'link[rel="preload"][as="' + ut(t) + '"]';
      t === "image" && c && c.imageSrcSet ? (r += '[imagesrcset="' + ut(c.imageSrcSet) + '"]', typeof c.imageSizes == "string" && (r += '[imagesizes="' + ut(c.imageSizes) + '"]')) : r += '[href="' + ut(e) + '"]';
      var i = r;
      switch (t) {
        case "style":
          i = ya(e);
          break;
        case "script":
          i = wa(e);
      }
      st.has(i) || (e = z({ rel: "preload", href: t === "image" && c && c.imageSrcSet ? void 0 : e, as: t }, c), st.set(i, e), u.querySelector(r) !== null || t === "style" && u.querySelector(fc(i)) || t === "script" && u.querySelector(oc(i)) || (t = u.createElement("link"), Me(t, "link", e), ve(t), u.head.appendChild(t)));
    }
  }
  function rd(e, t) {
    Qt.m(e, t);
    var c = ja;
    if (c && e) {
      var u = t && typeof t.as == "string" ? t.as : "script", r = 'link[rel="modulepreload"][as="' + ut(u) + '"][href="' + ut(e) + '"]', i = r;
      switch (u) {
        case "audioworklet":
        case "paintworklet":
        case "serviceworker":
        case "sharedworker":
        case "worker":
        case "script":
          i = wa(e);
      }
      if (!st.has(i) && (e = z({ rel: "modulepreload", href: e }, t), st.set(i, e), c.querySelector(r) === null)) {
        switch (u) {
          case "audioworklet":
          case "paintworklet":
          case "serviceworker":
          case "sharedworker":
          case "worker":
          case "script":
            if (c.querySelector(oc(i))) return;
        }
        u = c.createElement("link"), Me(u, "link", e), ve(u), c.head.appendChild(u);
      }
    }
  }
  function id(e, t, c) {
    Qt.S(e, t, c);
    var u = ja;
    if (u && e) {
      var r = Yn(u).hoistableStyles, i = ya(e);
      t = t || "default";
      var f = r.get(i);
      if (!f) {
        var b = { loading: 0, preload: null };
        if (f = u.querySelector(fc(i))) b.loading = 5;
        else {
          e = z({ rel: "stylesheet", href: e, "data-precedence": t }, c), (c = st.get(i)) && Xr(e, c);
          var d = f = u.createElement("link");
          ve(d), Me(d, "link", e), d._p = new Promise(function(w, E) {
            d.onload = w, d.onerror = E;
          }), d.addEventListener("load", function() {
            b.loading |= 1;
          }), d.addEventListener("error", function() {
            b.loading |= 2;
          }), b.loading |= 4, hu(f, t, u);
        }
        f = { type: "stylesheet", instance: f, count: 1, state: b }, r.set(i, f);
      }
    }
  }
  function _d(e, t) {
    Qt.X(e, t);
    var c = ja;
    if (c && e) {
      var u = Yn(c).hoistableScripts, r = wa(e), i = u.get(r);
      i || (i = c.querySelector(oc(r)), i || (e = z({ src: e, async: true }, t), (t = st.get(r)) && Qr(e, t), i = c.createElement("script"), ve(i), Me(i, "link", e), c.head.appendChild(i)), i = { type: "script", instance: i, count: 1, state: null }, u.set(r, i));
    }
  }
  function fd(e, t) {
    Qt.M(e, t);
    var c = ja;
    if (c && e) {
      var u = Yn(c).hoistableScripts, r = wa(e), i = u.get(r);
      i || (i = c.querySelector(oc(r)), i || (e = z({ src: e, async: true, type: "module" }, t), (t = st.get(r)) && Qr(e, t), i = c.createElement("script"), ve(i), Me(i, "link", e), c.head.appendChild(i)), i = { type: "script", instance: i, count: 1, state: null }, u.set(r, i));
    }
  }
  function Uo(e, t, c, u) {
    var r = (r = Q.current) ? wu(r) : null;
    if (!r) throw Error(_(446));
    switch (e) {
      case "meta":
      case "title":
        return null;
      case "style":
        return typeof c.precedence == "string" && typeof c.href == "string" ? (t = ya(c.href), c = Yn(r).hoistableStyles, u = c.get(t), u || (u = { type: "style", instance: null, count: 0, state: null }, c.set(t, u)), u) : { type: "void", instance: null, count: 0, state: null };
      case "link":
        if (c.rel === "stylesheet" && typeof c.href == "string" && typeof c.precedence == "string") {
          e = ya(c.href);
          var i = Yn(r).hoistableStyles, f = i.get(e);
          if (f || (r = r.ownerDocument || r, f = { type: "stylesheet", instance: null, count: 0, state: { loading: 0, preload: null } }, i.set(e, f), (i = r.querySelector(fc(e))) && !i._p && (f.instance = i, f.state.loading = 5), st.has(e) || (c = { rel: "preload", as: "style", href: c.href, crossOrigin: c.crossOrigin, integrity: c.integrity, media: c.media, hrefLang: c.hrefLang, referrerPolicy: c.referrerPolicy }, st.set(e, c), i || od(r, e, c, f.state))), t && u === null) throw Error(_(528, ""));
          return f;
        }
        if (t && u !== null) throw Error(_(529, ""));
        return null;
      case "script":
        return t = c.async, c = c.src, typeof c == "string" && t && typeof t != "function" && typeof t != "symbol" ? (t = wa(c), c = Yn(r).hoistableScripts, u = c.get(t), u || (u = { type: "script", instance: null, count: 0, state: null }, c.set(t, u)), u) : { type: "void", instance: null, count: 0, state: null };
      default:
        throw Error(_(444, e));
    }
  }
  function ya(e) {
    return 'href="' + ut(e) + '"';
  }
  function fc(e) {
    return 'link[rel="stylesheet"][' + e + "]";
  }
  function Bo(e) {
    return z({}, e, { "data-precedence": e.precedence, precedence: null });
  }
  function od(e, t, c, u) {
    e.querySelector('link[rel="preload"][as="style"][' + t + "]") ? u.loading = 1 : (t = e.createElement("link"), u.preload = t, t.addEventListener("load", function() {
      return u.loading |= 1;
    }), t.addEventListener("error", function() {
      return u.loading |= 2;
    }), Me(t, "link", c), ve(t), e.head.appendChild(t));
  }
  function wa(e) {
    return '[src="' + ut(e) + '"]';
  }
  function oc(e) {
    return "script[async]" + e;
  }
  function Lo(e, t, c) {
    if (t.count++, t.instance === null) switch (t.type) {
      case "style":
        var u = e.querySelector('style[data-href~="' + ut(c.href) + '"]');
        if (u) return t.instance = u, ve(u), u;
        var r = z({}, c, { "data-href": c.href, "data-precedence": c.precedence, href: null, precedence: null });
        return u = (e.ownerDocument || e).createElement("style"), ve(u), Me(u, "style", r), hu(u, c.precedence, e), t.instance = u;
      case "stylesheet":
        r = ya(c.href);
        var i = e.querySelector(fc(r));
        if (i) return t.state.loading |= 4, t.instance = i, ve(i), i;
        u = Bo(c), (r = st.get(r)) && Xr(u, r), i = (e.ownerDocument || e).createElement("link"), ve(i);
        var f = i;
        return f._p = new Promise(function(b, d) {
          f.onload = b, f.onerror = d;
        }), Me(i, "link", u), t.state.loading |= 4, hu(i, c.precedence, e), t.instance = i;
      case "script":
        return i = wa(c.src), (r = e.querySelector(oc(i))) ? (t.instance = r, ve(r), r) : (u = c, (r = st.get(i)) && (u = z({}, c), Qr(u, r)), e = e.ownerDocument || e, r = e.createElement("script"), ve(r), Me(r, "link", u), e.head.appendChild(r), t.instance = r);
      case "void":
        return null;
      default:
        throw Error(_(443, t.type));
    }
    else t.type === "stylesheet" && (t.state.loading & 4) === 0 && (u = t.instance, t.state.loading |= 4, hu(u, c.precedence, e));
    return t.instance;
  }
  function hu(e, t, c) {
    for (var u = c.querySelectorAll('link[rel="stylesheet"][data-precedence],style[data-precedence]'), r = u.length ? u[u.length - 1] : null, i = r, f = 0; f < u.length; f++) {
      var b = u[f];
      if (b.dataset.precedence === t) i = b;
      else if (i !== r) break;
    }
    i ? i.parentNode.insertBefore(e, i.nextSibling) : (t = c.nodeType === 9 ? c.head : c, t.insertBefore(e, t.firstChild));
  }
  function Xr(e, t) {
    e.crossOrigin == null && (e.crossOrigin = t.crossOrigin), e.referrerPolicy == null && (e.referrerPolicy = t.referrerPolicy), e.title == null && (e.title = t.title);
  }
  function Qr(e, t) {
    e.crossOrigin == null && (e.crossOrigin = t.crossOrigin), e.referrerPolicy == null && (e.referrerPolicy = t.referrerPolicy), e.integrity == null && (e.integrity = t.integrity);
  }
  var vu = null;
  function qo(e, t, c) {
    if (vu === null) {
      var u = /* @__PURE__ */ new Map(), r = vu = /* @__PURE__ */ new Map();
      r.set(c, u);
    } else r = vu, u = r.get(c), u || (u = /* @__PURE__ */ new Map(), r.set(c, u));
    if (u.has(e)) return u;
    for (u.set(e, null), c = c.getElementsByTagName(e), r = 0; r < c.length; r++) {
      var i = c[r];
      if (!(i[Aa] || i[xe] || e === "link" && i.getAttribute("rel") === "stylesheet") && i.namespaceURI !== "http://www.w3.org/2000/svg") {
        var f = i.getAttribute(t) || "";
        f = e + f;
        var b = u.get(f);
        b ? b.push(i) : u.set(f, [i]);
      }
    }
    return u;
  }
  function Go(e, t, c) {
    e = e.ownerDocument || e, e.head.insertBefore(c, t === "title" ? e.querySelector("head > title") : null);
  }
  function bd(e, t, c) {
    if (c === 1 || t.itemProp != null) return false;
    switch (e) {
      case "meta":
      case "title":
        return true;
      case "style":
        if (typeof t.precedence != "string" || typeof t.href != "string" || t.href === "") break;
        return true;
      case "link":
        if (typeof t.rel != "string" || typeof t.href != "string" || t.href === "" || t.onLoad || t.onError) break;
        switch (t.rel) {
          case "stylesheet":
            return e = t.disabled, typeof t.precedence == "string" && e == null;
          default:
            return true;
        }
      case "script":
        if (t.async && typeof t.async != "function" && typeof t.async != "symbol" && !t.onLoad && !t.onError && t.src && typeof t.src == "string") return true;
    }
    return false;
  }
  function Vo(e) {
    return !(e.type === "stylesheet" && (e.state.loading & 3) === 0);
  }
  function sd(e, t, c, u) {
    if (c.type === "stylesheet" && (typeof u.media != "string" || matchMedia(u.media).matches !== false) && (c.state.loading & 4) === 0) {
      if (c.instance === null) {
        var r = ya(u.href), i = t.querySelector(fc(r));
        if (i) {
          t = i._p, t !== null && typeof t == "object" && typeof t.then == "function" && (e.count++, e = Su.bind(e), t.then(e, e)), c.state.loading |= 4, c.instance = i, ve(i);
          return;
        }
        i = t.ownerDocument || t, u = Bo(u), (r = st.get(r)) && Xr(u, r), i = i.createElement("link"), ve(i);
        var f = i;
        f._p = new Promise(function(b, d) {
          f.onload = b, f.onerror = d;
        }), Me(i, "link", u), c.instance = i;
      }
      e.stylesheets === null && (e.stylesheets = /* @__PURE__ */ new Map()), e.stylesheets.set(c, t), (t = c.state.preload) && (c.state.loading & 3) === 0 && (e.count++, c = Su.bind(e), t.addEventListener("load", c), t.addEventListener("error", c));
    }
  }
  var Zr = 0;
  function dd(e, t) {
    return e.stylesheets && e.count === 0 && Eu(e, e.stylesheets), 0 < e.count || 0 < e.imgCount ? function(c) {
      var u = setTimeout(function() {
        if (e.stylesheets && Eu(e, e.stylesheets), e.unsuspend) {
          var i = e.unsuspend;
          e.unsuspend = null, i();
        }
      }, 6e4 + t);
      0 < e.imgBytes && Zr === 0 && (Zr = 62500 * Ks());
      var r = setTimeout(function() {
        if (e.waitingForImages = false, e.count === 0 && (e.stylesheets && Eu(e, e.stylesheets), e.unsuspend)) {
          var i = e.unsuspend;
          e.unsuspend = null, i();
        }
      }, (e.imgBytes > Zr ? 50 : 800) + t);
      return e.unsuspend = c, function() {
        e.unsuspend = null, clearTimeout(u), clearTimeout(r);
      };
    } : null;
  }
  function Su() {
    if (this.count--, this.count === 0 && (this.imgCount === 0 || !this.waitingForImages)) {
      if (this.stylesheets) Eu(this, this.stylesheets);
      else if (this.unsuspend) {
        var e = this.unsuspend;
        this.unsuspend = null, e();
      }
    }
  }
  var xu = null;
  function Eu(e, t) {
    e.stylesheets = null, e.unsuspend !== null && (e.count++, xu = /* @__PURE__ */ new Map(), t.forEach(gd, e), xu = null, Su.call(e));
  }
  function gd(e, t) {
    if (!(t.state.loading & 4)) {
      var c = xu.get(e);
      if (c) var u = c.get(null);
      else {
        c = /* @__PURE__ */ new Map(), xu.set(e, c);
        for (var r = e.querySelectorAll("link[data-precedence],style[data-precedence]"), i = 0; i < r.length; i++) {
          var f = r[i];
          (f.nodeName === "LINK" || f.getAttribute("media") !== "not all") && (c.set(f.dataset.precedence, f), u = f);
        }
        u && c.set(null, u);
      }
      r = t.instance, f = r.getAttribute("data-precedence"), i = c.get(f) || u, i === u && c.set(null, r), c.set(f, r), this.count++, u = Su.bind(this), r.addEventListener("load", u), r.addEventListener("error", u), i ? i.parentNode.insertBefore(r, i.nextSibling) : (e = e.nodeType === 9 ? e.head : e, e.insertBefore(r, e.firstChild)), t.state.loading |= 4;
    }
  }
  var bc = { $$typeof: Re, Provider: null, Consumer: null, _currentValue: G, _currentValue2: G, _threadCount: 0 };
  function md(e, t, c, u, r, i, f, b, d) {
    this.tag = 1, this.containerInfo = e, this.pingCache = this.current = this.pendingChildren = null, this.timeoutHandle = -1, this.callbackNode = this.next = this.pendingContext = this.context = this.cancelPendingCommit = null, this.callbackPriority = 0, this.expirationTimes = Gu(-1), this.entangledLanes = this.shellSuspendCounter = this.errorRecoveryDisabledLanes = this.expiredLanes = this.warmLanes = this.pingedLanes = this.suspendedLanes = this.pendingLanes = 0, this.entanglements = Gu(0), this.hiddenUpdates = Gu(null), this.identifierPrefix = u, this.onUncaughtError = r, this.onCaughtError = i, this.onRecoverableError = f, this.pooledCache = null, this.pooledCacheLanes = 0, this.formState = d, this.incompleteTransitions = /* @__PURE__ */ new Map();
  }
  function Yo(e, t, c, u, r, i, f, b, d, w, E, M) {
    return e = new md(e, t, c, f, d, w, E, M, b), t = 1, i === true && (t |= 24), i = Ie(3, null, null, t), e.current = i, i.stateNode = e, t = Sl(), t.refCount++, e.pooledCache = t, t.refCount++, i.memoizedState = { element: u, isDehydrated: c, cache: t }, Tl(i), e;
  }
  function Xo(e) {
    return e ? (e = $n, e) : $n;
  }
  function Qo(e, t, c, u, r, i) {
    r = Xo(r), u.context === null ? u.context = r : u.pendingContext = r, u = en(t), u.payload = { element: c }, i = i === void 0 ? null : i, i !== null && (u.callback = i), c = tn(e, u, t), c !== null && (Ze(c, e, t), Qa(c, e, t));
  }
  function Zo(e, t) {
    if (e = e.memoizedState, e !== null && e.dehydrated !== null) {
      var c = e.retryLane;
      e.retryLane = c !== 0 && c < t ? c : t;
    }
  }
  function Wr(e, t) {
    Zo(e, t), (e = e.alternate) && Zo(e, t);
  }
  function Wo(e) {
    if (e.tag === 13 || e.tag === 31) {
      var t = xn(e, 67108864);
      t !== null && Ze(t, e, 67108864), Wr(e, 67108864);
    }
  }
  function Fo(e) {
    if (e.tag === 13 || e.tag === 31) {
      var t = nt();
      t = Vu(t);
      var c = xn(e, t);
      c !== null && Ze(c, e, t), Wr(e, t);
    }
  }
  var Au = true;
  function Od(e, t, c, u) {
    var r = A.T;
    A.T = null;
    var i = R.p;
    try {
      R.p = 2, Fr(e, t, c, u);
    } finally {
      R.p = i, A.T = r;
    }
  }
  function pd(e, t, c, u) {
    var r = A.T;
    A.T = null;
    var i = R.p;
    try {
      R.p = 8, Fr(e, t, c, u);
    } finally {
      R.p = i, A.T = r;
    }
  }
  function Fr(e, t, c, u) {
    if (Au) {
      var r = Kr(u);
      if (r === null) Hr(e, t, u, Tu, c), Jo(e, u);
      else if (yd(r, e, t, c, u)) u.stopPropagation();
      else if (Jo(e, u), t & 4 && -1 < jd.indexOf(e)) {
        for (; r !== null; ) {
          var i = Vn(r);
          if (i !== null) switch (i.tag) {
            case 3:
              if (i = i.stateNode, i.current.memoizedState.isDehydrated) {
                var f = yn(i.pendingLanes);
                if (f !== 0) {
                  var b = i;
                  for (b.pendingLanes |= 2, b.entangledLanes |= 2; f; ) {
                    var d = 1 << 31 - Je(f);
                    b.entanglements[1] |= d, f &= ~d;
                  }
                  St(i), (ee & 6) === 0 && (fu = Fe() + 500, lc(0));
                }
              }
              break;
            case 31:
            case 13:
              b = xn(i, 2), b !== null && Ze(b, i, 2), bu(), Wr(i, 2);
          }
          if (i = Kr(u), i === null && Hr(e, t, u, Tu, c), i === r) break;
          r = i;
        }
        r !== null && u.stopPropagation();
      } else Hr(e, t, u, null, c);
    }
  }
  function Kr(e) {
    return e = ku(e), Jr(e);
  }
  var Tu = null;
  function Jr(e) {
    if (Tu = null, e = Gn(e), e !== null) {
      var t = s(e);
      if (t === null) e = null;
      else {
        var c = t.tag;
        if (c === 13) {
          if (e = j(t), e !== null) return e;
          e = null;
        } else if (c === 31) {
          if (e = S(t), e !== null) return e;
          e = null;
        } else if (c === 3) {
          if (t.stateNode.current.memoizedState.isDehydrated) return t.tag === 3 ? t.stateNode.containerInfo : null;
          e = null;
        } else t !== e && (e = null);
      }
    }
    return Tu = e, null;
  }
  function Ko(e) {
    switch (e) {
      case "beforetoggle":
      case "cancel":
      case "click":
      case "close":
      case "contextmenu":
      case "copy":
      case "cut":
      case "auxclick":
      case "dblclick":
      case "dragend":
      case "dragstart":
      case "drop":
      case "focusin":
      case "focusout":
      case "input":
      case "invalid":
      case "keydown":
      case "keypress":
      case "keyup":
      case "mousedown":
      case "mouseup":
      case "paste":
      case "pause":
      case "play":
      case "pointercancel":
      case "pointerdown":
      case "pointerup":
      case "ratechange":
      case "reset":
      case "resize":
      case "seeked":
      case "submit":
      case "toggle":
      case "touchcancel":
      case "touchend":
      case "touchstart":
      case "volumechange":
      case "change":
      case "selectionchange":
      case "textInput":
      case "compositionstart":
      case "compositionend":
      case "compositionupdate":
      case "beforeblur":
      case "afterblur":
      case "beforeinput":
      case "blur":
      case "fullscreenchange":
      case "focus":
      case "hashchange":
      case "popstate":
      case "select":
      case "selectstart":
        return 2;
      case "drag":
      case "dragenter":
      case "dragexit":
      case "dragleave":
      case "dragover":
      case "mousemove":
      case "mouseout":
      case "mouseover":
      case "pointermove":
      case "pointerout":
      case "pointerover":
      case "scroll":
      case "touchmove":
      case "wheel":
      case "mouseenter":
      case "mouseleave":
      case "pointerenter":
      case "pointerleave":
        return 8;
      case "message":
        switch (cb()) {
          case ei:
            return 2;
          case ti:
            return 8;
          case Oc:
          case ub:
            return 32;
          case ni:
            return 268435456;
          default:
            return 32;
        }
      default:
        return 32;
    }
  }
  var kr = false, sn = null, dn = null, gn = null, sc = /* @__PURE__ */ new Map(), dc = /* @__PURE__ */ new Map(), mn = [], jd = "mousedown mouseup touchcancel touchend touchstart auxclick dblclick pointercancel pointerdown pointerup dragend dragstart drop compositionend compositionstart keydown keypress keyup input textInput copy cut paste click change contextmenu reset".split(" ");
  function Jo(e, t) {
    switch (e) {
      case "focusin":
      case "focusout":
        sn = null;
        break;
      case "dragenter":
      case "dragleave":
        dn = null;
        break;
      case "mouseover":
      case "mouseout":
        gn = null;
        break;
      case "pointerover":
      case "pointerout":
        sc.delete(t.pointerId);
        break;
      case "gotpointercapture":
      case "lostpointercapture":
        dc.delete(t.pointerId);
    }
  }
  function gc(e, t, c, u, r, i) {
    return e === null || e.nativeEvent !== i ? (e = { blockedOn: t, domEventName: c, eventSystemFlags: u, nativeEvent: i, targetContainers: [r] }, t !== null && (t = Vn(t), t !== null && Wo(t)), e) : (e.eventSystemFlags |= u, t = e.targetContainers, r !== null && t.indexOf(r) === -1 && t.push(r), e);
  }
  function yd(e, t, c, u, r) {
    switch (t) {
      case "focusin":
        return sn = gc(sn, e, t, c, u, r), true;
      case "dragenter":
        return dn = gc(dn, e, t, c, u, r), true;
      case "mouseover":
        return gn = gc(gn, e, t, c, u, r), true;
      case "pointerover":
        var i = r.pointerId;
        return sc.set(i, gc(sc.get(i) || null, e, t, c, u, r)), true;
      case "gotpointercapture":
        return i = r.pointerId, dc.set(i, gc(dc.get(i) || null, e, t, c, u, r)), true;
    }
    return false;
  }
  function ko(e) {
    var t = Gn(e.target);
    if (t !== null) {
      var c = s(t);
      if (c !== null) {
        if (t = c.tag, t === 13) {
          if (t = j(c), t !== null) {
            e.blockedOn = t, ii(e.priority, function() {
              Fo(c);
            });
            return;
          }
        } else if (t === 31) {
          if (t = S(c), t !== null) {
            e.blockedOn = t, ii(e.priority, function() {
              Fo(c);
            });
            return;
          }
        } else if (t === 3 && c.stateNode.current.memoizedState.isDehydrated) {
          e.blockedOn = c.tag === 3 ? c.stateNode.containerInfo : null;
          return;
        }
      }
    }
    e.blockedOn = null;
  }
  function Mu(e) {
    if (e.blockedOn !== null) return false;
    for (var t = e.targetContainers; 0 < t.length; ) {
      var c = Kr(e.nativeEvent);
      if (c === null) {
        c = e.nativeEvent;
        var u = new c.constructor(c.type, c);
        Ju = u, c.target.dispatchEvent(u), Ju = null;
      } else return t = Vn(c), t !== null && Wo(t), e.blockedOn = c, false;
      t.shift();
    }
    return true;
  }
  function Io(e, t, c) {
    Mu(e) && c.delete(t);
  }
  function wd() {
    kr = false, sn !== null && Mu(sn) && (sn = null), dn !== null && Mu(dn) && (dn = null), gn !== null && Mu(gn) && (gn = null), sc.forEach(Io), dc.forEach(Io);
  }
  function Du(e, t) {
    e.blockedOn === t && (e.blockedOn = null, kr || (kr = true, n.unstable_scheduleCallback(n.unstable_NormalPriority, wd)));
  }
  var Ru = null;
  function $o(e) {
    Ru !== e && (Ru = e, n.unstable_scheduleCallback(n.unstable_NormalPriority, function() {
      Ru === e && (Ru = null);
      for (var t = 0; t < e.length; t += 3) {
        var c = e[t], u = e[t + 1], r = e[t + 2];
        if (typeof u != "function") {
          if (Jr(u || c) === null) continue;
          break;
        }
        var i = Vn(c);
        i !== null && (e.splice(t, 3), t -= 3, Kl(i, { pending: true, data: r, method: c.method, action: u }, u, r));
      }
    }));
  }
  function ha(e) {
    function t(d) {
      return Du(d, e);
    }
    sn !== null && Du(sn, e), dn !== null && Du(dn, e), gn !== null && Du(gn, e), sc.forEach(t), dc.forEach(t);
    for (var c = 0; c < mn.length; c++) {
      var u = mn[c];
      u.blockedOn === e && (u.blockedOn = null);
    }
    for (; 0 < mn.length && (c = mn[0], c.blockedOn === null); ) ko(c), c.blockedOn === null && mn.shift();
    if (c = (e.ownerDocument || e).$$reactFormReplay, c != null) for (u = 0; u < c.length; u += 3) {
      var r = c[u], i = c[u + 1], f = r[qe] || null;
      if (typeof i == "function") f || $o(c);
      else if (f) {
        var b = null;
        if (i && i.hasAttribute("formAction")) {
          if (r = i, f = i[qe] || null) b = f.formAction;
          else if (Jr(r) !== null) continue;
        } else b = f.action;
        typeof b == "function" ? c[u + 1] = b : (c.splice(u, 3), u -= 3), $o(c);
      }
    }
  }
  function Po() {
    function e(i) {
      i.canIntercept && i.info === "react-transition" && i.intercept({ handler: function() {
        return new Promise(function(f) {
          return r = f;
        });
      }, focusReset: "manual", scroll: "manual" });
    }
    function t() {
      r !== null && (r(), r = null), u || setTimeout(c, 20);
    }
    function c() {
      if (!u && !navigation.transition) {
        var i = navigation.currentEntry;
        i && i.url != null && navigation.navigate(i.url, { state: i.getState(), info: "react-transition", history: "replace" });
      }
    }
    if (typeof navigation == "object") {
      var u = false, r = null;
      return navigation.addEventListener("navigate", e), navigation.addEventListener("navigatesuccess", t), navigation.addEventListener("navigateerror", t), setTimeout(c, 100), function() {
        u = true, navigation.removeEventListener("navigate", e), navigation.removeEventListener("navigatesuccess", t), navigation.removeEventListener("navigateerror", t), r !== null && (r(), r = null);
      };
    }
  }
  function Ir(e) {
    this._internalRoot = e;
  }
  Cu.prototype.render = Ir.prototype.render = function(e) {
    var t = this._internalRoot;
    if (t === null) throw Error(_(409));
    var c = t.current, u = nt();
    Qo(c, u, e, t, null, null);
  }, Cu.prototype.unmount = Ir.prototype.unmount = function() {
    var e = this._internalRoot;
    if (e !== null) {
      this._internalRoot = null;
      var t = e.containerInfo;
      Qo(e.current, 2, null, e, null, null), bu(), t[qn] = null;
    }
  };
  function Cu(e) {
    this._internalRoot = e;
  }
  Cu.prototype.unstable_scheduleHydration = function(e) {
    if (e) {
      var t = ri();
      e = { blockedOn: null, target: e, priority: t };
      for (var c = 0; c < mn.length && t !== 0 && t < mn[c].priority; c++) ;
      mn.splice(c, 0, e), c === 0 && ko(e);
    }
  };
  var eb = a.version;
  if (eb !== "19.2.4") throw Error(_(527, eb, "19.2.4"));
  R.findDOMNode = function(e) {
    var t = e._reactInternals;
    if (t === void 0) throw typeof e.render == "function" ? Error(_(188)) : (e = Object.keys(e).join(","), Error(_(268, e)));
    return e = p(t), e = e !== null ? H(e) : null, e = e === null ? null : e.stateNode, e;
  };
  var hd = { bundleType: 0, version: "19.2.4", rendererPackageName: "react-dom", currentDispatcherRef: A, reconcilerVersion: "19.2.4" };
  if (typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ < "u") {
    var Hu = __REACT_DEVTOOLS_GLOBAL_HOOK__;
    if (!Hu.isDisabled && Hu.supportsFiber) try {
      Sa = Hu.inject(hd), Ke = Hu;
    } catch {
    }
  }
  return reactDomClient_production.createRoot = function(e, t) {
    if (!o(e)) throw Error(_(299));
    var c = false, u = "", r = uf, i = lf, f = rf;
    return t != null && (t.unstable_strictMode === true && (c = true), t.identifierPrefix !== void 0 && (u = t.identifierPrefix), t.onUncaughtError !== void 0 && (r = t.onUncaughtError), t.onCaughtError !== void 0 && (i = t.onCaughtError), t.onRecoverableError !== void 0 && (f = t.onRecoverableError)), t = Yo(e, 1, false, null, null, c, u, null, r, i, f, Po), e[qn] = t.current, Cr(e), new Ir(t);
  }, reactDomClient_production.hydrateRoot = function(e, t, c) {
    if (!o(e)) throw Error(_(299));
    var u = false, r = "", i = uf, f = lf, b = rf, d = null;
    return c != null && (c.unstable_strictMode === true && (u = true), c.identifierPrefix !== void 0 && (r = c.identifierPrefix), c.onUncaughtError !== void 0 && (i = c.onUncaughtError), c.onCaughtError !== void 0 && (f = c.onCaughtError), c.onRecoverableError !== void 0 && (b = c.onRecoverableError), c.formState !== void 0 && (d = c.formState)), t = Yo(e, 1, true, t, c ?? null, u, r, d, i, f, b, Po), t.context = Xo(null), c = t.current, u = nt(), u = Vu(u), r = en(u), r.callback = null, tn(c, r, u), c = u, t.current.lanes = c, Ea(t, c), St(t), e[qn] = t.current, Cr(e), new Cu(t);
  }, reactDomClient_production.version = "19.2.4", reactDomClient_production;
}
var hasRequiredClient;
function requireClient() {
  if (hasRequiredClient) return client.exports;
  hasRequiredClient = 1;
  function n() {
    if (!(typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ > "u" || typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE != "function")) try {
      __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(n);
    } catch (a) {
      console.error(a);
    }
  }
  return n(), client.exports = requireReactDomClient_production(), client.exports;
}
var clientExports = requireClient();
const ReactDOM = getDefaultExportFromCjs(clientExports);
class EventBus {
  constructor() {
    __publicField(this, "listeners", /* @__PURE__ */ new Map());
  }
  on(a, l) {
    this.listeners.has(a) || this.listeners.set(a, /* @__PURE__ */ new Set());
    const _ = this.listeners.get(a), o = l;
    return _.add(o), () => {
      _.delete(o);
    };
  }
  once(a, l) {
    const _ = this.on(a, ((o) => {
      _(), l(o);
    }));
    return _;
  }
  emit(a, ...l) {
    const _ = this.listeners.get(a);
    if (_) {
      const o = l[0];
      _.forEach((s) => s(o));
    }
  }
  off(a) {
    this.listeners.delete(a);
  }
}
const gameEvents = new EventBus(), DEFAULT_TOAST_CONFIG = { maxVisible: 5 }, SEVERITY_DURATIONS = { info: 3e3, success: 3e3, warning: 5e3, error: 6e3, loot: 4e3 }, SEVERITY_BORDER_COLORS = { info: "border-l-toast-info", success: "border-l-toast-success", warning: "border-l-toast-warning", error: "border-l-toast-error", loot: "border-l-toast-loot" };
function toastReducer(n, a) {
  switch (a.type) {
    case "ADD": {
      let l = [...n.toasts, a.toast];
      return l.length > DEFAULT_TOAST_CONFIG.maxVisible && (l = l.map((_, o) => o === 0 && !_.exiting ? { ..._, exiting: true } : _)), { toasts: l };
    }
    case "MARK_EXITING":
      return { toasts: n.toasts.map((l) => l.id === a.id ? { ...l, exiting: true } : l) };
    case "REMOVE":
      return { toasts: n.toasts.filter((l) => l.id !== a.id) };
    case "CLEAR":
      return { toasts: n.toasts.map((l) => ({ ...l, exiting: true })) };
  }
}
const ToastStateContext = reactExports.createContext({ toasts: [] }), ToastDispatchContext = reactExports.createContext(() => {
});
function ToastProvider({ children: n }) {
  const [a, l] = reactExports.useReducer(toastReducer, { toasts: [] });
  return reactExports.useEffect(() => {
    const _ = gameEvents.on("toast:show", ({ message: j, severity: S, duration: x }) => {
      l({ type: "ADD", toast: { id: crypto.randomUUID(), message: j, severity: S, duration: x ?? SEVERITY_DURATIONS[S], createdAt: Date.now(), exiting: false } });
    }), o = gameEvents.on("toast:dismiss", ({ id: j }) => {
      l({ type: "MARK_EXITING", id: j });
    }), s = gameEvents.on("toast:clear", () => {
      l({ type: "CLEAR" });
    });
    return () => {
      _(), o(), s();
    };
  }, []), jsxRuntimeExports.jsx(ToastStateContext, { value: a, children: jsxRuntimeExports.jsx(ToastDispatchContext, { value: l, children: n }) });
}
const initialState$1 = { stack: [], isOpen: false };
function modalReducer(n, a) {
  var _a;
  switch (a.type) {
    case "OPEN":
      return { stack: [...n.stack, a.modal], isOpen: true };
    case "CLOSE": {
      const l = n.stack[n.stack.length - 1], _ = n.stack.slice(0, -1);
      return (_a = l == null ? void 0 : l.onClose) == null ? void 0 : _a.call(l), { stack: _, isOpen: _.length > 0 };
    }
    case "CLOSE_ALL":
      return n.stack.forEach((l) => {
        var _a2;
        return (_a2 = l.onClose) == null ? void 0 : _a2.call(l);
      }), initialState$1;
  }
}
const ModalStateContext = reactExports.createContext(initialState$1), ModalDispatchContext = reactExports.createContext(() => {
});
function ModalProvider({ children: n }) {
  const [a, l] = reactExports.useReducer(modalReducer, initialState$1);
  return reactExports.useEffect(() => {
    const _ = gameEvents.on("modal:open", ({ id: s, title: j, content: S, size: x, onClose: p }) => {
      l({ type: "OPEN", modal: { id: s ?? crypto.randomUUID(), title: j, content: S, onClose: p, closeOnOverlayClick: true, closeOnEscape: true, size: x ?? "md" } });
    }), o = gameEvents.on("modal:close", () => {
      l({ type: "CLOSE" });
    });
    return () => {
      _(), o();
    };
  }, []), jsxRuntimeExports.jsx(ModalStateContext, { value: a, children: jsxRuntimeExports.jsx(ModalDispatchContext, { value: l, children: n }) });
}
const initialState = { isOpen: false, activeCategory: "general" };
function menuReducer(n, a) {
  switch (a.type) {
    case "TOGGLE":
      return { ...n, isOpen: !n.isOpen };
    case "OPEN":
      return { ...n, isOpen: true };
    case "CLOSE":
      return { ...n, isOpen: false, activeCategory: "general" };
    case "SET_CATEGORY":
      return { ...n, activeCategory: a.category };
  }
}
const MenuStateContext = reactExports.createContext(initialState), MenuDispatchContext = reactExports.createContext(() => {
});
function MenuProvider({ children: n }) {
  const [a, l] = reactExports.useReducer(menuReducer, initialState);
  return reactExports.useEffect(() => {
    const _ = gameEvents.on("menu:toggle", () => {
      l({ type: "TOGGLE" });
    }), o = gameEvents.on("menu:open", () => {
      l({ type: "OPEN" });
    }), s = gameEvents.on("menu:close", () => {
      l({ type: "CLOSE" });
    });
    return () => {
      _(), o(), s();
    };
  }, []), jsxRuntimeExports.jsx(MenuStateContext, { value: a, children: jsxRuntimeExports.jsx(MenuDispatchContext, { value: l, children: n }) });
}
var reactDomExports = requireReactDom();
const portalCache = /* @__PURE__ */ new Map(), Z_INDEX = { "toast-root": "100", "modal-root": "90", "menu-root": "80" };
function getPortalRoot(n) {
  let a = portalCache.get(n);
  return (!a || !document.body.contains(a)) && (a = document.createElement("div"), a.id = n, a.style.position = "fixed", a.style.inset = "0", a.style.pointerEvents = "none", a.style.zIndex = Z_INDEX[n] ?? "50", document.body.appendChild(a), portalCache.set(n, a)), a;
}
function ToastItem({ toast: n, onDismiss: a }) {
  reactExports.useEffect(() => {
    if (n.duration <= 0 || n.exiting) return;
    const _ = setTimeout(() => a(n.id), n.duration);
    return () => clearTimeout(_);
  }, [n.id, n.duration, n.exiting, a]);
  const l = SEVERITY_BORDER_COLORS[n.severity];
  return jsxRuntimeExports.jsxs("div", { className: `
				pointer-events-auto mb-2 px-3 py-2 md:px-4 md:py-3 min-w-[180px] md:min-w-[260px] max-w-[280px] md:max-w-[380px]
				bg-panel shadow-toast
				border-2 border-panel-border border-l-4 ${l}
				${n.exiting ? "animate-toast-out" : "animate-toast-in"}
				flex items-start gap-2
			`, onAnimationEnd: () => {
    n.exiting && a(n.id);
  }, children: [jsxRuntimeExports.jsx("span", { className: "text-[8px] md:text-xs leading-relaxed flex-1", children: n.message }), jsxRuntimeExports.jsx("button", { onClick: () => a(n.id), className: "text-text-muted hover:text-text text-[8px] md:text-xs leading-none mt-0.5 cursor-pointer", children: "\u2715" })] });
}
function ToastContainer() {
  const { toasts: n } = reactExports.useContext(ToastStateContext), a = reactExports.useContext(ToastDispatchContext), l = reactExports.useCallback((_) => {
    var _a;
    ((_a = n.find((s) => s.id === _)) == null ? void 0 : _a.exiting) ? a({ type: "REMOVE", id: _ }) : a({ type: "MARK_EXITING", id: _ });
  }, [n, a]);
  return n.length === 0 ? null : reactDomExports.createPortal(jsxRuntimeExports.jsx("div", { className: "fixed top-14 right-4 flex flex-col items-end pointer-events-none", children: n.map((_) => jsxRuntimeExports.jsx(ToastItem, { toast: _, onDismiss: l }, _.id)) }), getPortalRoot("toast-root"));
}
const MODAL_SIZE_CLASSES = { xs: "max-w-xs", sm: "max-w-sm", md: "max-w-md", lg: "max-w-lg" };
function ModalOverlay() {
  const { stack: n, isOpen: a } = reactExports.useContext(ModalStateContext), l = reactExports.useContext(ModalDispatchContext);
  if (!a || n.length === 0) return null;
  const _ = n[n.length - 1], o = MODAL_SIZE_CLASSES[_.size ?? "md"];
  return reactDomExports.createPortal(jsxRuntimeExports.jsx("div", { className: "fixed inset-0 bg-overlay flex items-center justify-center pointer-events-auto", onClick: () => {
    _.closeOnOverlayClick !== false && l({ type: "CLOSE" });
  }, children: jsxRuntimeExports.jsx("div", { className: `
					${o} mx-4
					border-[3px] border-panel-border
					shadow-[0_0_0_1px_#1a1008,0_6px_20px_rgba(0,0,0,0.8)]
					animate-modal-in
				`, onClick: (s) => s.stopPropagation(), children: jsxRuntimeExports.jsxs("div", { className: "border-2 border-[#1a1008]", children: [jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between px-3 py-2 md:px-4 md:py-3 bg-[#1e1408] border-b border-[#5a4a2a]", children: [jsxRuntimeExports.jsx("h2", { className: "text-[10px] md:text-sm text-[#c8a832]", children: _.title }), jsxRuntimeExports.jsx("button", { onClick: () => l({ type: "CLOSE" }), className: `w-5 h-5 md:w-7 md:h-7 flex items-center justify-center
								bg-[#3d2b14] border border-[#5a4a2a]
								text-text-muted hover:text-[#c8a832] hover:border-panel-border
								text-[8px] md:text-xs leading-none cursor-pointer transition-colors`, children: "\u2715" })] }), jsxRuntimeExports.jsx("div", { className: "p-3 md:p-4 bg-panel-inner text-[8px] md:text-xs", children: _.content })] }) }) }), getPortalRoot("modal-root"));
}
const CATEGORIES = [{ key: "general", label: "General" }, { key: "audio", label: "Audio" }, { key: "video", label: "Video" }, { key: "controls", label: "Controls" }];
function SettingsContent({ category: n }) {
  switch (n) {
    case "general":
      return jsxRuntimeExports.jsxs("div", { className: "space-y-3", children: [jsxRuntimeExports.jsx("h3", { className: "text-[9px] mb-2", children: "General Settings" }), jsxRuntimeExports.jsx("div", { className: "text-[8px] text-text-muted", children: "Game settings will be added here." })] });
    case "audio":
      return jsxRuntimeExports.jsxs("div", { className: "space-y-3", children: [jsxRuntimeExports.jsx("h3", { className: "text-[9px] mb-2", children: "Audio Settings" }), jsxRuntimeExports.jsx("div", { className: "text-[8px] text-text-muted", children: "Volume controls will be added here." })] });
    case "video":
      return jsxRuntimeExports.jsxs("div", { className: "space-y-3", children: [jsxRuntimeExports.jsx("h3", { className: "text-[9px] mb-2", children: "Video Settings" }), jsxRuntimeExports.jsx("div", { className: "text-[8px] text-text-muted", children: "Resolution and display options will be added here." })] });
    case "controls":
      return jsxRuntimeExports.jsxs("div", { className: "space-y-3", children: [jsxRuntimeExports.jsx("h3", { className: "text-[9px] mb-2", children: "Controls" }), jsxRuntimeExports.jsxs("div", { className: "text-[8px] text-text-muted space-y-1", children: [jsxRuntimeExports.jsx("div", { children: "W / A / S / D \u2014 Move" }), jsxRuntimeExports.jsx("div", { children: "Space \u2014 Jump" }), jsxRuntimeExports.jsx("div", { children: "Escape \u2014 Toggle Menu" })] })] });
  }
}
function PauseMenu() {
  const { isOpen: n, activeCategory: a } = reactExports.useContext(MenuStateContext), l = reactExports.useContext(MenuDispatchContext);
  return n ? reactDomExports.createPortal(jsxRuntimeExports.jsx("div", { className: "fixed inset-0 bg-overlay flex items-center justify-center pointer-events-auto", children: jsxRuntimeExports.jsxs("div", { className: "bg-panel border-2 border-panel-border shadow-panel w-full max-w-lg mx-4 animate-modal-in", children: [jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between px-3 py-2 border-b-2 border-panel-border bg-panel-inner", children: [jsxRuntimeExports.jsx("h2", { className: "text-[10px]", children: "Settings" }), jsxRuntimeExports.jsx("button", { onClick: () => l({ type: "CLOSE" }), className: "text-text-muted hover:text-text text-[10px] leading-none cursor-pointer", children: "\u2715" })] }), jsxRuntimeExports.jsxs("div", { className: "flex min-h-[240px]", children: [jsxRuntimeExports.jsx("div", { className: "w-32 border-r-2 border-panel-border p-2 flex flex-col gap-1 bg-panel-inner", children: CATEGORIES.map(({ key: _, label: o }) => jsxRuntimeExports.jsx("button", { onClick: () => l({ type: "SET_CATEGORY", category: _ }), className: `
									text-left text-[8px] px-3 py-1.5 cursor-pointer transition-colors
									${a === _ ? "bg-btn text-text" : "text-text-muted hover:text-text hover:bg-btn/30"}
								`, children: o }, _)) }), jsxRuntimeExports.jsx("div", { className: "flex-1 p-4 bg-panel-inner", children: jsxRuntimeExports.jsx(SettingsContent, { category: a }) })] }), jsxRuntimeExports.jsx("div", { className: "flex justify-end px-3 py-2 border-t-2 border-panel-border bg-panel-inner", children: jsxRuntimeExports.jsx("button", { onClick: () => l({ type: "CLOSE" }), className: "px-4 py-1.5 text-[8px] bg-btn border border-btn-border hover:bg-btn-hover cursor-pointer transition-colors text-text", children: "Resume" }) })] }) }), getPortalRoot("menu-root")) : null;
}
function useKeyboard(n, a, l = true) {
  reactExports.useEffect(() => {
    if (!l) return;
    const _ = (o) => {
      o.key === n && (o.preventDefault(), a());
    };
    return window.addEventListener("keydown", _), () => window.removeEventListener("keydown", _);
  }, [n, a, l]);
}
function focusCanvas() {
  var _a;
  (_a = document.getElementById("bevy-canvas")) == null ? void 0 : _a.focus();
}
function KeyboardRouter() {
  const n = reactExports.useContext(ModalStateContext), a = reactExports.useContext(ModalDispatchContext), l = reactExports.useContext(MenuStateContext), _ = reactExports.useContext(MenuDispatchContext), o = reactExports.useRef(false), s = n.isOpen || l.isOpen;
  reactExports.useEffect(() => {
    o.current && !s && focusCanvas(), o.current = s;
  }, [s]);
  const j = reactExports.useCallback(() => {
    n.isOpen ? a({ type: "CLOSE" }) : l.isOpen ? _({ type: "CLOSE" }) : _({ type: "OPEN" });
  }, [n.isOpen, l.isOpen, a, _]);
  return useKeyboard("Escape", j), null;
}
function GameUIProvider({ children: n }) {
  return jsxRuntimeExports.jsx(ToastProvider, { children: jsxRuntimeExports.jsx(ModalProvider, { children: jsxRuntimeExports.jsxs(MenuProvider, { children: [jsxRuntimeExports.jsx(KeyboardRouter, {}), n, jsxRuntimeExports.jsx(ToastContainer, {}), jsxRuntimeExports.jsx(ModalOverlay, {}), jsxRuntimeExports.jsx(PauseMenu, {})] }) }) });
}
function atomics_wait_async(n, a, l) {
  return Atomics.waitAsync(n, a, l);
}
function wait_result_async(n) {
  return n.async;
}
function wait_result_value(n) {
  return n.value;
}
function dispatch_action(n, a) {
  const l = passStringToWasm0(a, wasm.__wbindgen_export, wasm.__wbindgen_export2), _ = WASM_VECTOR_LEN;
  wasm.dispatch_action(n, l, _);
}
function get_fps() {
  return wasm.get_fps() >>> 0;
}
function get_hovered_object_json() {
  try {
    const l = wasm.__wbindgen_add_to_stack_pointer(-16);
    wasm.get_hovered_object_json(l);
    var n = getDataViewMemory0().getInt32(l + 0, true), a = getDataViewMemory0().getInt32(l + 4, true);
    let _;
    return n !== 0 && (_ = getStringFromWasm0(n, a).slice(), wasm.__wbindgen_export4(n, a * 1, 1)), _;
  } finally {
    wasm.__wbindgen_add_to_stack_pointer(16);
  }
}
function get_inventory_json() {
  try {
    const l = wasm.__wbindgen_add_to_stack_pointer(-16);
    wasm.get_inventory_json(l);
    var n = getDataViewMemory0().getInt32(l + 0, true), a = getDataViewMemory0().getInt32(l + 4, true);
    let _;
    return n !== 0 && (_ = getStringFromWasm0(n, a).slice(), wasm.__wbindgen_export4(n, a * 1, 1)), _;
  } finally {
    wasm.__wbindgen_add_to_stack_pointer(16);
  }
}
function get_player_state_json() {
  let n, a;
  try {
    const o = wasm.__wbindgen_add_to_stack_pointer(-16);
    wasm.get_player_state_json(o);
    var l = getDataViewMemory0().getInt32(o + 0, true), _ = getDataViewMemory0().getInt32(o + 4, true);
    return n = l, a = _, getStringFromWasm0(l, _);
  } finally {
    wasm.__wbindgen_add_to_stack_pointer(16), wasm.__wbindgen_export4(n, a, 1);
  }
}
function get_selected_object_json() {
  try {
    const l = wasm.__wbindgen_add_to_stack_pointer(-16);
    wasm.get_selected_object_json(l);
    var n = getDataViewMemory0().getInt32(l + 0, true), a = getDataViewMemory0().getInt32(l + 4, true);
    let _;
    return n !== 0 && (_ = getStringFromWasm0(n, a).slice(), wasm.__wbindgen_export4(n, a * 1, 1)), _;
  } finally {
    wasm.__wbindgen_add_to_stack_pointer(16);
  }
}
function __wbg_get_imports(memory) {
  const import0 = { __proto__: null, __wbg_Error_83742b46f01ce22d: function(n, a) {
    const l = Error(getStringFromWasm0(n, a));
    return addHeapObject(l);
  }, __wbg_String_8564e559799eccda: function(n, a) {
    const l = String(getObject(a)), _ = passStringToWasm0(l, wasm.__wbindgen_export, wasm.__wbindgen_export2), o = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(n + 4, o, true), getDataViewMemory0().setInt32(n + 0, _, true);
  }, __wbg_Window_1535697a053fe988: function(n) {
    const a = getObject(n).Window;
    return addHeapObject(a);
  }, __wbg_Window_c7f91e3f80ae0a0e: function(n) {
    const a = getObject(n).Window;
    return addHeapObject(a);
  }, __wbg_Window_e0df001eddf1d3fa: function(n) {
    const a = getObject(n).Window;
    return addHeapObject(a);
  }, __wbg_WorkerGlobalScope_b9ad7f2d34707e2e: function(n) {
    const a = getObject(n).WorkerGlobalScope;
    return addHeapObject(a);
  }, __wbg_WorkerGlobalScope_d731e9136c6c49a0: function(n) {
    const a = getObject(n).WorkerGlobalScope;
    return addHeapObject(a);
  }, __wbg___wbindgen_bigint_get_as_i64_447a76b5c6ef7bda: function(n, a) {
    const l = getObject(a), _ = typeof l == "bigint" ? l : void 0;
    getDataViewMemory0().setBigInt64(n + 8, isLikeNone(_) ? BigInt(0) : _, true), getDataViewMemory0().setInt32(n + 0, !isLikeNone(_), true);
  }, __wbg___wbindgen_boolean_get_c0f3f60bac5a78d1: function(n) {
    const a = getObject(n), l = typeof a == "boolean" ? a : void 0;
    return isLikeNone(l) ? 16777215 : l ? 1 : 0;
  }, __wbg___wbindgen_debug_string_5398f5bb970e0daa: function(n, a) {
    const l = debugString(getObject(a)), _ = passStringToWasm0(l, wasm.__wbindgen_export, wasm.__wbindgen_export2), o = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(n + 4, o, true), getDataViewMemory0().setInt32(n + 0, _, true);
  }, __wbg___wbindgen_in_41dbb8413020e076: function(n, a) {
    return getObject(n) in getObject(a);
  }, __wbg___wbindgen_is_bigint_e2141d4f045b7eda: function(n) {
    return typeof getObject(n) == "bigint";
  }, __wbg___wbindgen_is_function_3c846841762788c1: function(n) {
    return typeof getObject(n) == "function";
  }, __wbg___wbindgen_is_null_0b605fc6b167c56f: function(n) {
    return getObject(n) === null;
  }, __wbg___wbindgen_is_object_781bc9f159099513: function(n) {
    const a = getObject(n);
    return typeof a == "object" && a !== null;
  }, __wbg___wbindgen_is_string_7ef6b97b02428fae: function(n) {
    return typeof getObject(n) == "string";
  }, __wbg___wbindgen_is_undefined_52709e72fb9f179c: function(n) {
    return getObject(n) === void 0;
  }, __wbg___wbindgen_jsval_eq_ee31bfad3e536463: function(n, a) {
    return getObject(n) === getObject(a);
  }, __wbg___wbindgen_jsval_loose_eq_5bcc3bed3c69e72b: function(n, a) {
    return getObject(n) == getObject(a);
  }, __wbg___wbindgen_memory_edb3f01e3930bbf6: function() {
    const n = wasm.memory;
    return addHeapObject(n);
  }, __wbg___wbindgen_number_get_34bb9d9dcfa21373: function(n, a) {
    const l = getObject(a), _ = typeof l == "number" ? l : void 0;
    getDataViewMemory0().setFloat64(n + 8, isLikeNone(_) ? 0 : _, true), getDataViewMemory0().setInt32(n + 0, !isLikeNone(_), true);
  }, __wbg___wbindgen_rethrow_5d3a9250cec92549: function(n) {
    throw takeObject(n);
  }, __wbg___wbindgen_string_get_395e606bd0ee4427: function(n, a) {
    const l = getObject(a), _ = typeof l == "string" ? l : void 0;
    var o = isLikeNone(_) ? 0 : passStringToWasm0(_, wasm.__wbindgen_export, wasm.__wbindgen_export2), s = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(n + 4, s, true), getDataViewMemory0().setInt32(n + 0, o, true);
  }, __wbg___wbindgen_throw_6ddd609b62940d55: function(n, a) {
    throw new Error(getStringFromWasm0(n, a));
  }, __wbg__wbg_cb_unref_6b5b6b8576d35cb1: function(n) {
    getObject(n)._wbg_cb_unref();
  }, __wbg_abort_5ef96933660780b7: function(n) {
    getObject(n).abort();
  }, __wbg_activeElement_c2981ba623ac16d9: function(n) {
    const a = getObject(n).activeElement;
    return isLikeNone(a) ? 0 : addHeapObject(a);
  }, __wbg_activeTexture_11610c2c57e26cfa: function(n, a) {
    getObject(n).activeTexture(a >>> 0);
  }, __wbg_activeTexture_66fa8cafd3610ddb: function(n, a) {
    getObject(n).activeTexture(a >>> 0);
  }, __wbg_addEventListener_2d985aa8a656f6dc: function() {
    return handleError(function(n, a, l, _) {
      getObject(n).addEventListener(getStringFromWasm0(a, l), getObject(_));
    }, arguments);
  }, __wbg_addListener_af610a227738fed8: function() {
    return handleError(function(n, a) {
      getObject(n).addListener(getObject(a));
    }, arguments);
  }, __wbg_altKey_7f2c3a24bf5420ae: function(n) {
    return getObject(n).altKey;
  }, __wbg_altKey_a8e58d65866de029: function(n) {
    return getObject(n).altKey;
  }, __wbg_animate_8f41e2f47c7d04ab: function(n, a, l) {
    const _ = getObject(n).animate(getObject(a), getObject(l));
    return addHeapObject(_);
  }, __wbg_appendChild_8cb157b6ec5612a6: function() {
    return handleError(function(n, a) {
      const l = getObject(n).appendChild(getObject(a));
      return addHeapObject(l);
    }, arguments);
  }, __wbg_arrayBuffer_eb8e9ca620af2a19: function() {
    return handleError(function(n) {
      const a = getObject(n).arrayBuffer();
      return addHeapObject(a);
    }, arguments);
  }, __wbg_async_b33e4cb28c6b2093: function(n) {
    return getObject(n).async;
  }, __wbg_async_b88fec439c0ee2f0: function(n) {
    return getObject(n).async;
  }, __wbg_atomics_wait_async_c96d62ed85455e44: function(n, a, l) {
    const _ = atomics_wait_async(getObject(n), a >>> 0, l);
    return addHeapObject(_);
  }, __wbg_attachShader_6426e8576a115345: function(n, a, l) {
    getObject(n).attachShader(getObject(a), getObject(l));
  }, __wbg_attachShader_e557f37438249ff7: function(n, a, l) {
    getObject(n).attachShader(getObject(a), getObject(l));
  }, __wbg_axes_4ba58f8779c5d176: function(n) {
    const a = getObject(n).axes;
    return addHeapObject(a);
  }, __wbg_beginComputePass_d7b46482cf2ed824: function(n, a) {
    const l = getObject(n).beginComputePass(getObject(a));
    return addHeapObject(l);
  }, __wbg_beginQuery_ac2ef47e00ec594a: function(n, a, l) {
    getObject(n).beginQuery(a >>> 0, getObject(l));
  }, __wbg_beginRenderPass_373f34636d157c43: function() {
    return handleError(function(n, a) {
      const l = getObject(n).beginRenderPass(getObject(a));
      return addHeapObject(l);
    }, arguments);
  }, __wbg_bindAttribLocation_1d976e3bcc954adb: function(n, a, l, _, o) {
    getObject(n).bindAttribLocation(getObject(a), l >>> 0, getStringFromWasm0(_, o));
  }, __wbg_bindAttribLocation_8791402cc151e914: function(n, a, l, _, o) {
    getObject(n).bindAttribLocation(getObject(a), l >>> 0, getStringFromWasm0(_, o));
  }, __wbg_bindBufferRange_469c3643c2099003: function(n, a, l, _, o, s) {
    getObject(n).bindBufferRange(a >>> 0, l >>> 0, getObject(_), o, s);
  }, __wbg_bindBuffer_142694a9732bc098: function(n, a, l) {
    getObject(n).bindBuffer(a >>> 0, getObject(l));
  }, __wbg_bindBuffer_d2a4f6cfb33336fb: function(n, a, l) {
    getObject(n).bindBuffer(a >>> 0, getObject(l));
  }, __wbg_bindFramebuffer_4643a12ca1c72776: function(n, a, l) {
    getObject(n).bindFramebuffer(a >>> 0, getObject(l));
  }, __wbg_bindFramebuffer_fdc7c38f1c700e64: function(n, a, l) {
    getObject(n).bindFramebuffer(a >>> 0, getObject(l));
  }, __wbg_bindRenderbuffer_91db2fc67c1f0115: function(n, a, l) {
    getObject(n).bindRenderbuffer(a >>> 0, getObject(l));
  }, __wbg_bindRenderbuffer_e6cfc20b6ebcf605: function(n, a, l) {
    getObject(n).bindRenderbuffer(a >>> 0, getObject(l));
  }, __wbg_bindSampler_be3a05e88cecae98: function(n, a, l) {
    getObject(n).bindSampler(a >>> 0, getObject(l));
  }, __wbg_bindTexture_6a0892cd752b41d9: function(n, a, l) {
    getObject(n).bindTexture(a >>> 0, getObject(l));
  }, __wbg_bindTexture_6e7e157d0aabe457: function(n, a, l) {
    getObject(n).bindTexture(a >>> 0, getObject(l));
  }, __wbg_bindVertexArrayOES_082b0791772327fa: function(n, a) {
    getObject(n).bindVertexArrayOES(getObject(a));
  }, __wbg_bindVertexArray_c307251f3ff61930: function(n, a) {
    getObject(n).bindVertexArray(getObject(a));
  }, __wbg_blendColor_b4c7d8333af4876d: function(n, a, l, _, o) {
    getObject(n).blendColor(a, l, _, o);
  }, __wbg_blendColor_c2771aead110c867: function(n, a, l, _, o) {
    getObject(n).blendColor(a, l, _, o);
  }, __wbg_blendEquationSeparate_b08aba1c715cb265: function(n, a, l) {
    getObject(n).blendEquationSeparate(a >>> 0, l >>> 0);
  }, __wbg_blendEquationSeparate_f16ada84ba672878: function(n, a, l) {
    getObject(n).blendEquationSeparate(a >>> 0, l >>> 0);
  }, __wbg_blendEquation_46367a891604b604: function(n, a) {
    getObject(n).blendEquation(a >>> 0);
  }, __wbg_blendEquation_c353d94b097007e5: function(n, a) {
    getObject(n).blendEquation(a >>> 0);
  }, __wbg_blendFuncSeparate_6aae138b81d75b47: function(n, a, l, _, o) {
    getObject(n).blendFuncSeparate(a >>> 0, l >>> 0, _ >>> 0, o >>> 0);
  }, __wbg_blendFuncSeparate_8c91c200b1a72e4b: function(n, a, l, _, o) {
    getObject(n).blendFuncSeparate(a >>> 0, l >>> 0, _ >>> 0, o >>> 0);
  }, __wbg_blendFunc_2e98c5f57736e5f3: function(n, a, l) {
    getObject(n).blendFunc(a >>> 0, l >>> 0);
  }, __wbg_blendFunc_4ce0991003a9468e: function(n, a, l) {
    getObject(n).blendFunc(a >>> 0, l >>> 0);
  }, __wbg_blitFramebuffer_c1a68feaca974c87: function(n, a, l, _, o, s, j, S, x, p, H) {
    getObject(n).blitFramebuffer(a, l, _, o, s, j, S, x, p >>> 0, H >>> 0);
  }, __wbg_blockSize_5871fe73cc8dcba0: function(n) {
    return getObject(n).blockSize;
  }, __wbg_body_5eb99e7257e5ae34: function(n) {
    const a = getObject(n).body;
    return isLikeNone(a) ? 0 : addHeapObject(a);
  }, __wbg_brand_3bc196a43eceb8af: function(n, a) {
    const l = getObject(a).brand, _ = passStringToWasm0(l, wasm.__wbindgen_export, wasm.__wbindgen_export2), o = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(n + 4, o, true), getDataViewMemory0().setInt32(n + 0, _, true);
  }, __wbg_brands_b7dcf262485c3e7c: function(n) {
    const a = getObject(n).brands;
    return addHeapObject(a);
  }, __wbg_bufferData_730b629ba3f6824f: function(n, a, l, _) {
    getObject(n).bufferData(a >>> 0, l, _ >>> 0);
  }, __wbg_bufferData_d20232e3d5dcdc62: function(n, a, l, _) {
    getObject(n).bufferData(a >>> 0, getObject(l), _ >>> 0);
  }, __wbg_bufferData_d3bd8c69ff4b7254: function(n, a, l, _) {
    getObject(n).bufferData(a >>> 0, getObject(l), _ >>> 0);
  }, __wbg_bufferData_fb2d946faa09a60b: function(n, a, l, _) {
    getObject(n).bufferData(a >>> 0, l, _ >>> 0);
  }, __wbg_bufferSubData_3fcefd4648de39b5: function(n, a, l, _) {
    getObject(n).bufferSubData(a >>> 0, l, getObject(_));
  }, __wbg_bufferSubData_7b112eb88657e7c0: function(n, a, l, _) {
    getObject(n).bufferSubData(a >>> 0, l, getObject(_));
  }, __wbg_buffer_60b8043cd926067d: function(n) {
    const a = getObject(n).buffer;
    return addHeapObject(a);
  }, __wbg_buffer_eb2779983eb67380: function(n) {
    const a = getObject(n).buffer;
    return addHeapObject(a);
  }, __wbg_button_bdc91677bd7bbf58: function(n) {
    return getObject(n).button;
  }, __wbg_buttons_a18e71d5dcec8ba9: function(n) {
    return getObject(n).buttons;
  }, __wbg_buttons_ed0c8b1fa9af7a25: function(n) {
    const a = getObject(n).buttons;
    return addHeapObject(a);
  }, __wbg_call_2d781c1f4d5c0ef8: function() {
    return handleError(function(n, a, l) {
      const _ = getObject(n).call(getObject(a), getObject(l));
      return addHeapObject(_);
    }, arguments);
  }, __wbg_call_e133b57c9155d22c: function() {
    return handleError(function(n, a) {
      const l = getObject(n).call(getObject(a));
      return addHeapObject(l);
    }, arguments);
  }, __wbg_call_f858478a02f9600f: function() {
    return handleError(function(n, a, l, _, o) {
      const s = getObject(n).call(getObject(a), getObject(l), getObject(_), getObject(o));
      return addHeapObject(s);
    }, arguments);
  }, __wbg_cancelAnimationFrame_43fad84647f46036: function() {
    return handleError(function(n, a) {
      getObject(n).cancelAnimationFrame(a);
    }, arguments);
  }, __wbg_cancelIdleCallback_d3eb47e732dd4bcd: function(n, a) {
    getObject(n).cancelIdleCallback(a >>> 0);
  }, __wbg_cancel_65f38182e2eeac5c: function(n) {
    getObject(n).cancel();
  }, __wbg_catch_d7ed0375ab6532a5: function(n, a) {
    const l = getObject(n).catch(getObject(a));
    return addHeapObject(l);
  }, __wbg_clearBuffer_0439daeb4579be77: function(n, a, l) {
    getObject(n).clearBuffer(getObject(a), l);
  }, __wbg_clearBuffer_3de757fe2da3e161: function(n, a, l, _) {
    getObject(n).clearBuffer(getObject(a), l, _);
  }, __wbg_clearBufferfv_7bc3e789059fd29b: function(n, a, l, _, o) {
    getObject(n).clearBufferfv(a >>> 0, l, getArrayF32FromWasm0(_, o));
  }, __wbg_clearBufferiv_050b376a7480ef9c: function(n, a, l, _, o) {
    getObject(n).clearBufferiv(a >>> 0, l, getArrayI32FromWasm0(_, o));
  }, __wbg_clearBufferuiv_d75635e80261ea93: function(n, a, l, _, o) {
    getObject(n).clearBufferuiv(a >>> 0, l, getArrayU32FromWasm0(_, o));
  }, __wbg_clearDepth_0fb1b5aba2ff2d63: function(n, a) {
    getObject(n).clearDepth(a);
  }, __wbg_clearDepth_3ff5ef5e5fad4016: function(n, a) {
    getObject(n).clearDepth(a);
  }, __wbg_clearStencil_0e5924dc2f0fa2b7: function(n, a) {
    getObject(n).clearStencil(a);
  }, __wbg_clearStencil_4505636e726114d0: function(n, a) {
    getObject(n).clearStencil(a);
  }, __wbg_clearTimeout_113b1cde814ec762: function(n) {
    const a = clearTimeout(takeObject(n));
    return addHeapObject(a);
  }, __wbg_clearTimeout_fdfb5a1468af1a97: function(n, a) {
    getObject(n).clearTimeout(a);
  }, __wbg_clear_3d6ad4729e206aac: function(n, a) {
    getObject(n).clear(a >>> 0);
  }, __wbg_clear_5a0606f7c62ad39a: function(n, a) {
    getObject(n).clear(a >>> 0);
  }, __wbg_clientWaitSync_5402aac488fc18bb: function(n, a, l, _) {
    return getObject(n).clientWaitSync(getObject(a), l >>> 0, _ >>> 0);
  }, __wbg_close_08da3e8ce8a35dc2: function(n, a) {
    getObject(n).close(getObject(a));
  }, __wbg_close_87218c1c5fa30509: function() {
    return handleError(function(n) {
      const a = getObject(n).close();
      return addHeapObject(a);
    }, arguments);
  }, __wbg_close_a86fff250f8aa14f: function() {
    return handleError(function(n, a, l, _) {
      getObject(n).close(a, getStringFromWasm0(l, _));
    }, arguments);
  }, __wbg_close_ab55423854e61546: function(n) {
    getObject(n).close();
  }, __wbg_close_af26905c832a88cb: function() {
    return handleError(function(n) {
      getObject(n).close();
    }, arguments);
  }, __wbg_close_b511f9aac1bec666: function(n) {
    getObject(n).close();
  }, __wbg_close_cbf870bdad0aad99: function(n) {
    getObject(n).close();
  }, __wbg_closed_fa5c07e5d468802f: function() {
    return handleError(function(n) {
      const a = getObject(n).closed;
      return addHeapObject(a);
    }, arguments);
  }, __wbg_code_3c69123dcbcf263d: function(n, a) {
    const l = getObject(a).code, _ = passStringToWasm0(l, wasm.__wbindgen_export, wasm.__wbindgen_export2), o = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(n + 4, o, true), getDataViewMemory0().setInt32(n + 0, _, true);
  }, __wbg_code_aea376e2d265a64f: function(n) {
    return getObject(n).code;
  }, __wbg_colorMask_b053114f7da42448: function(n, a, l, _, o) {
    getObject(n).colorMask(a !== 0, l !== 0, _ !== 0, o !== 0);
  }, __wbg_colorMask_b47840e05b5f8181: function(n, a, l, _, o) {
    getObject(n).colorMask(a !== 0, l !== 0, _ !== 0, o !== 0);
  }, __wbg_compileShader_623a1051cf49494b: function(n, a) {
    getObject(n).compileShader(getObject(a));
  }, __wbg_compileShader_7ca66245c2798601: function(n, a) {
    getObject(n).compileShader(getObject(a));
  }, __wbg_compressedTexSubImage2D_593058a6f5aca176: function(n, a, l, _, o, s, j, S, x) {
    getObject(n).compressedTexSubImage2D(a >>> 0, l, _, o, s, j, S >>> 0, getObject(x));
  }, __wbg_compressedTexSubImage2D_aab12b65159c282e: function(n, a, l, _, o, s, j, S, x) {
    getObject(n).compressedTexSubImage2D(a >>> 0, l, _, o, s, j, S >>> 0, getObject(x));
  }, __wbg_compressedTexSubImage2D_f3c4ae95ef9d2420: function(n, a, l, _, o, s, j, S, x, p) {
    getObject(n).compressedTexSubImage2D(a >>> 0, l, _, o, s, j, S >>> 0, x, p);
  }, __wbg_compressedTexSubImage3D_77a6ab77487aa211: function(n, a, l, _, o, s, j, S, x, p, H, z) {
    getObject(n).compressedTexSubImage3D(a >>> 0, l, _, o, s, j, S, x, p >>> 0, H, z);
  }, __wbg_compressedTexSubImage3D_95f64742aae944b8: function(n, a, l, _, o, s, j, S, x, p, H) {
    getObject(n).compressedTexSubImage3D(a >>> 0, l, _, o, s, j, S, x, p >>> 0, getObject(H));
  }, __wbg_configure_b39d6ec9527208fd: function() {
    return handleError(function(n, a) {
      getObject(n).configure(getObject(a));
    }, arguments);
  }, __wbg_connect_3ca85e8e3b8d9828: function() {
    return handleError(function(n, a) {
      const l = getObject(n).connect(getObject(a));
      return addHeapObject(l);
    }, arguments);
  }, __wbg_connected_8628961b3a47d6ce: function(n) {
    return getObject(n).connected;
  }, __wbg_contains_6b23671a193f58e5: function(n, a) {
    return getObject(n).contains(getObject(a));
  }, __wbg_contentRect_7047bba46353f683: function(n) {
    const a = getObject(n).contentRect;
    return addHeapObject(a);
  }, __wbg_copyBufferSubData_aaeed526e555f0d1: function(n, a, l, _, o, s) {
    getObject(n).copyBufferSubData(a >>> 0, l >>> 0, _, o, s);
  }, __wbg_copyBufferToBuffer_293ca0a0d09a2280: function() {
    return handleError(function(n, a, l, _, o) {
      getObject(n).copyBufferToBuffer(getObject(a), l, getObject(_), o);
    }, arguments);
  }, __wbg_copyBufferToBuffer_321eb0198eb9c268: function() {
    return handleError(function(n, a, l, _, o, s) {
      getObject(n).copyBufferToBuffer(getObject(a), l, getObject(_), o, s);
    }, arguments);
  }, __wbg_copyExternalImageToTexture_b947b4c23a5d5380: function() {
    return handleError(function(n, a, l, _) {
      getObject(n).copyExternalImageToTexture(getObject(a), getObject(l), getObject(_));
    }, arguments);
  }, __wbg_copyTexSubImage2D_08a10bcd45b88038: function(n, a, l, _, o, s, j, S, x) {
    getObject(n).copyTexSubImage2D(a >>> 0, l, _, o, s, j, S, x);
  }, __wbg_copyTexSubImage2D_b9a10d000c616b3e: function(n, a, l, _, o, s, j, S, x) {
    getObject(n).copyTexSubImage2D(a >>> 0, l, _, o, s, j, S, x);
  }, __wbg_copyTexSubImage3D_7fcdf7c85bc308a5: function(n, a, l, _, o, s, j, S, x, p) {
    getObject(n).copyTexSubImage3D(a >>> 0, l, _, o, s, j, S, x, p);
  }, __wbg_copyTextureToBuffer_f5501895b13306e1: function() {
    return handleError(function(n, a, l, _) {
      getObject(n).copyTextureToBuffer(getObject(a), getObject(l), getObject(_));
    }, arguments);
  }, __wbg_copyTextureToTexture_facf8ecdb9559cb0: function() {
    return handleError(function(n, a, l, _) {
      getObject(n).copyTextureToTexture(getObject(a), getObject(l), getObject(_));
    }, arguments);
  }, __wbg_copyToChannel_9cc0d540c73436a4: function() {
    return handleError(function(n, a, l) {
      getObject(n).copyToChannel(getObject(a), l);
    }, arguments);
  }, __wbg_createBindGroupLayout_f5bb5a31b2ac11bf: function() {
    return handleError(function(n, a) {
      const l = getObject(n).createBindGroupLayout(getObject(a));
      return addHeapObject(l);
    }, arguments);
  }, __wbg_createBindGroup_2290306cfa413c74: function(n, a) {
    const l = getObject(n).createBindGroup(getObject(a));
    return addHeapObject(l);
  }, __wbg_createBufferSource_7102af74fcd1a840: function() {
    return handleError(function(n) {
      const a = getObject(n).createBufferSource();
      return addHeapObject(a);
    }, arguments);
  }, __wbg_createBuffer_1aa34315dc9585a2: function(n) {
    const a = getObject(n).createBuffer();
    return isLikeNone(a) ? 0 : addHeapObject(a);
  }, __wbg_createBuffer_8e47b88217a98607: function(n) {
    const a = getObject(n).createBuffer();
    return isLikeNone(a) ? 0 : addHeapObject(a);
  }, __wbg_createBuffer_e2b25dd1471f92f7: function() {
    return handleError(function(n, a) {
      const l = getObject(n).createBuffer(getObject(a));
      return addHeapObject(l);
    }, arguments);
  }, __wbg_createBuffer_ed2bd7b52878b3fa: function() {
    return handleError(function(n, a, l, _) {
      const o = getObject(n).createBuffer(a >>> 0, l >>> 0, _);
      return addHeapObject(o);
    }, arguments);
  }, __wbg_createCommandEncoder_80578730e7314357: function(n, a) {
    const l = getObject(n).createCommandEncoder(getObject(a));
    return addHeapObject(l);
  }, __wbg_createComputePipeline_78a3fff4e7d451a8: function(n, a) {
    const l = getObject(n).createComputePipeline(getObject(a));
    return addHeapObject(l);
  }, __wbg_createElement_9b0aab265c549ded: function() {
    return handleError(function(n, a, l) {
      const _ = getObject(n).createElement(getStringFromWasm0(a, l));
      return addHeapObject(_);
    }, arguments);
  }, __wbg_createFramebuffer_911d55689ff8358e: function(n) {
    const a = getObject(n).createFramebuffer();
    return isLikeNone(a) ? 0 : addHeapObject(a);
  }, __wbg_createFramebuffer_97d39363cdd9242a: function(n) {
    const a = getObject(n).createFramebuffer();
    return isLikeNone(a) ? 0 : addHeapObject(a);
  }, __wbg_createImageBitmap_46791779dcbfb789: function() {
    return handleError(function(n, a, l) {
      const _ = getObject(n).createImageBitmap(getObject(a), getObject(l));
      return addHeapObject(_);
    }, arguments);
  }, __wbg_createIndex_323cb0213cc21d9b: function() {
    return handleError(function(n, a, l, _, o) {
      const s = getObject(n).createIndex(getStringFromWasm0(a, l), getObject(_), getObject(o));
      return addHeapObject(s);
    }, arguments);
  }, __wbg_createObjectStore_4709de9339ffc6c0: function() {
    return handleError(function(n, a, l, _) {
      const o = getObject(n).createObjectStore(getStringFromWasm0(a, l), getObject(_));
      return addHeapObject(o);
    }, arguments);
  }, __wbg_createObjectURL_f141426bcc1f70aa: function() {
    return handleError(function(n, a) {
      const l = URL.createObjectURL(getObject(a)), _ = passStringToWasm0(l, wasm.__wbindgen_export, wasm.__wbindgen_export2), o = WASM_VECTOR_LEN;
      getDataViewMemory0().setInt32(n + 4, o, true), getDataViewMemory0().setInt32(n + 0, _, true);
    }, arguments);
  }, __wbg_createPipelineLayout_0ef251301bed0c34: function(n, a) {
    const l = getObject(n).createPipelineLayout(getObject(a));
    return addHeapObject(l);
  }, __wbg_createProgram_1fa32901e4db13cd: function(n) {
    const a = getObject(n).createProgram();
    return isLikeNone(a) ? 0 : addHeapObject(a);
  }, __wbg_createProgram_8eb14525e7fcffb8: function(n) {
    const a = getObject(n).createProgram();
    return isLikeNone(a) ? 0 : addHeapObject(a);
  }, __wbg_createQuerySet_9ae406d6d86026f6: function() {
    return handleError(function(n, a) {
      const l = getObject(n).createQuerySet(getObject(a));
      return addHeapObject(l);
    }, arguments);
  }, __wbg_createQuery_0f754c13ae341f39: function(n) {
    const a = getObject(n).createQuery();
    return isLikeNone(a) ? 0 : addHeapObject(a);
  }, __wbg_createRenderPipeline_f9f8aa23f50f8a9c: function() {
    return handleError(function(n, a) {
      const l = getObject(n).createRenderPipeline(getObject(a));
      return addHeapObject(l);
    }, arguments);
  }, __wbg_createRenderbuffer_69fb8c438e70e494: function(n) {
    const a = getObject(n).createRenderbuffer();
    return isLikeNone(a) ? 0 : addHeapObject(a);
  }, __wbg_createRenderbuffer_8847d6a81975caee: function(n) {
    const a = getObject(n).createRenderbuffer();
    return isLikeNone(a) ? 0 : addHeapObject(a);
  }, __wbg_createSampler_27c37a8245da51a4: function(n, a) {
    const l = getObject(n).createSampler(getObject(a));
    return addHeapObject(l);
  }, __wbg_createSampler_7bed7d46769be9a7: function(n) {
    const a = getObject(n).createSampler();
    return isLikeNone(a) ? 0 : addHeapObject(a);
  }, __wbg_createShaderModule_eb21a131dfb0d4dc: function(n, a) {
    const l = getObject(n).createShaderModule(getObject(a));
    return addHeapObject(l);
  }, __wbg_createShader_9ffc9dc1832608d7: function(n, a) {
    const l = getObject(n).createShader(a >>> 0);
    return isLikeNone(l) ? 0 : addHeapObject(l);
  }, __wbg_createShader_a00913b8c6489e6b: function(n, a) {
    const l = getObject(n).createShader(a >>> 0);
    return isLikeNone(l) ? 0 : addHeapObject(l);
  }, __wbg_createTexture_284160f981e0075f: function() {
    return handleError(function(n, a) {
      const l = getObject(n).createTexture(getObject(a));
      return addHeapObject(l);
    }, arguments);
  }, __wbg_createTexture_9b1b4f40cab0097b: function(n) {
    const a = getObject(n).createTexture();
    return isLikeNone(a) ? 0 : addHeapObject(a);
  }, __wbg_createTexture_ceb367c3528574ec: function(n) {
    const a = getObject(n).createTexture();
    return isLikeNone(a) ? 0 : addHeapObject(a);
  }, __wbg_createVertexArrayOES_1b30eca82fb89274: function(n) {
    const a = getObject(n).createVertexArrayOES();
    return isLikeNone(a) ? 0 : addHeapObject(a);
  }, __wbg_createVertexArray_420460898dc8d838: function(n) {
    const a = getObject(n).createVertexArray();
    return isLikeNone(a) ? 0 : addHeapObject(a);
  }, __wbg_createView_b09749798973b0f5: function() {
    return handleError(function(n, a) {
      const l = getObject(n).createView(getObject(a));
      return addHeapObject(l);
    }, arguments);
  }, __wbg_crypto_38df2bab126b63dc: function(n) {
    const a = getObject(n).crypto;
    return addHeapObject(a);
  }, __wbg_ctrlKey_6f8a95d15c098679: function(n) {
    return getObject(n).ctrlKey;
  }, __wbg_ctrlKey_a41da599a72ee93d: function(n) {
    return getObject(n).ctrlKey;
  }, __wbg_cullFace_2c9f57c2f90cbe70: function(n, a) {
    getObject(n).cullFace(a >>> 0);
  }, __wbg_cullFace_d759515c1199276c: function(n, a) {
    getObject(n).cullFace(a >>> 0);
  }, __wbg_currentTime_5f6bbe3d7b1a6fbf: function(n) {
    return getObject(n).currentTime;
  }, __wbg_data_a3d9ff9cdd801002: function(n) {
    const a = getObject(n).data;
    return addHeapObject(a);
  }, __wbg_datagrams_7bf9e7994926631a: function(n) {
    const a = getObject(n).datagrams;
    return addHeapObject(a);
  }, __wbg_debug_271c16e6de0bc226: function(n, a, l, _) {
    console.debug(getObject(n), getObject(a), getObject(l), getObject(_));
  }, __wbg_decode_b645e759f92c7fe0: function(n) {
    const a = getObject(n).decode();
    return addHeapObject(a);
  }, __wbg_deleteBuffer_a2f8244b249c356e: function(n, a) {
    getObject(n).deleteBuffer(getObject(a));
  }, __wbg_deleteBuffer_b053c58b4ed1ab1c: function(n, a) {
    getObject(n).deleteBuffer(getObject(a));
  }, __wbg_deleteFramebuffer_1af8b97d40962089: function(n, a) {
    getObject(n).deleteFramebuffer(getObject(a));
  }, __wbg_deleteFramebuffer_badadfcd45ef5e64: function(n, a) {
    getObject(n).deleteFramebuffer(getObject(a));
  }, __wbg_deleteIndex_9391b8bace7b0b18: function() {
    return handleError(function(n, a, l) {
      getObject(n).deleteIndex(getStringFromWasm0(a, l));
    }, arguments);
  }, __wbg_deleteObjectStore_65401ab024ac08c1: function() {
    return handleError(function(n, a, l) {
      getObject(n).deleteObjectStore(getStringFromWasm0(a, l));
    }, arguments);
  }, __wbg_deleteProgram_cb8f79d5c1e84863: function(n, a) {
    getObject(n).deleteProgram(getObject(a));
  }, __wbg_deleteProgram_fc1d8d77ef7e154d: function(n, a) {
    getObject(n).deleteProgram(getObject(a));
  }, __wbg_deleteQuery_9420681ec3d643ef: function(n, a) {
    getObject(n).deleteQuery(getObject(a));
  }, __wbg_deleteRenderbuffer_401ffe15b179c343: function(n, a) {
    getObject(n).deleteRenderbuffer(getObject(a));
  }, __wbg_deleteRenderbuffer_b030660bf2e9fc95: function(n, a) {
    getObject(n).deleteRenderbuffer(getObject(a));
  }, __wbg_deleteSampler_8111fd44b061bdd1: function(n, a) {
    getObject(n).deleteSampler(getObject(a));
  }, __wbg_deleteShader_5b6992b5e5894d44: function(n, a) {
    getObject(n).deleteShader(getObject(a));
  }, __wbg_deleteShader_a8e5ccb432053dbe: function(n, a) {
    getObject(n).deleteShader(getObject(a));
  }, __wbg_deleteSync_deeb154f55e59a7d: function(n, a) {
    getObject(n).deleteSync(getObject(a));
  }, __wbg_deleteTexture_00ecab74f7bddf91: function(n, a) {
    getObject(n).deleteTexture(getObject(a));
  }, __wbg_deleteTexture_d8b1d278731e0c9f: function(n, a) {
    getObject(n).deleteTexture(getObject(a));
  }, __wbg_deleteVertexArrayOES_9da21e3515bf556e: function(n, a) {
    getObject(n).deleteVertexArrayOES(getObject(a));
  }, __wbg_deleteVertexArray_5a75f4855c2881df: function(n, a) {
    getObject(n).deleteVertexArray(getObject(a));
  }, __wbg_deltaMode_e239727f16c7ad68: function(n) {
    return getObject(n).deltaMode;
  }, __wbg_deltaX_74ad854454fab779: function(n) {
    return getObject(n).deltaX;
  }, __wbg_deltaY_c6ccae416e166d01: function(n) {
    return getObject(n).deltaY;
  }, __wbg_depthFunc_0376ef69458b01d8: function(n, a) {
    getObject(n).depthFunc(a >>> 0);
  }, __wbg_depthFunc_befeae10cb29920d: function(n, a) {
    getObject(n).depthFunc(a >>> 0);
  }, __wbg_depthMask_c6c1b0d88ade6c84: function(n, a) {
    getObject(n).depthMask(a !== 0);
  }, __wbg_depthMask_fd5bc408415b9cd3: function(n, a) {
    getObject(n).depthMask(a !== 0);
  }, __wbg_depthRange_b42d493a2b9258aa: function(n, a, l) {
    getObject(n).depthRange(a, l);
  }, __wbg_depthRange_ebba8110d3fe0332: function(n, a, l) {
    getObject(n).depthRange(a, l);
  }, __wbg_destination_d1f70fe081ff0932: function(n) {
    const a = getObject(n).destination;
    return addHeapObject(a);
  }, __wbg_destroy_ebf527bbd86ae58b: function(n) {
    getObject(n).destroy();
  }, __wbg_devicePixelContentBoxSize_82a5f309b4b96a31: function(n) {
    const a = getObject(n).devicePixelContentBoxSize;
    return addHeapObject(a);
  }, __wbg_devicePixelRatio_c36a5fab28da634e: function(n) {
    return getObject(n).devicePixelRatio;
  }, __wbg_disableVertexAttribArray_124a165b099b763b: function(n, a) {
    getObject(n).disableVertexAttribArray(a >>> 0);
  }, __wbg_disableVertexAttribArray_c4f42277355986c0: function(n, a) {
    getObject(n).disableVertexAttribArray(a >>> 0);
  }, __wbg_disable_62ec2189c50a0db7: function(n, a) {
    getObject(n).disable(a >>> 0);
  }, __wbg_disable_7731e2f3362ef1c5: function(n, a) {
    getObject(n).disable(a >>> 0);
  }, __wbg_disconnect_09ddbc78942a2057: function(n) {
    getObject(n).disconnect();
  }, __wbg_disconnect_21257e7fa524a113: function(n) {
    getObject(n).disconnect();
  }, __wbg_dispatchWorkgroupsIndirect_31170e3ef9951e18: function(n, a, l) {
    getObject(n).dispatchWorkgroupsIndirect(getObject(a), l);
  }, __wbg_dispatchWorkgroups_88dfc3f2209b9d74: function(n, a, l, _) {
    getObject(n).dispatchWorkgroups(a >>> 0, l >>> 0, _ >>> 0);
  }, __wbg_document_c0320cd4183c6d9b: function(n) {
    const a = getObject(n).document;
    return isLikeNone(a) ? 0 : addHeapObject(a);
  }, __wbg_done_08ce71ee07e3bd17: function(n) {
    return getObject(n).done;
  }, __wbg_done_e8993c30afbbe414: function(n) {
    return getObject(n).done;
  }, __wbg_drawArraysInstancedANGLE_20ee4b8f67503b54: function(n, a, l, _, o) {
    getObject(n).drawArraysInstancedANGLE(a >>> 0, l, _, o);
  }, __wbg_drawArraysInstanced_13e40fca13079ade: function(n, a, l, _, o) {
    getObject(n).drawArraysInstanced(a >>> 0, l, _, o);
  }, __wbg_drawArrays_13005ccff75e4210: function(n, a, l, _) {
    getObject(n).drawArrays(a >>> 0, l, _);
  }, __wbg_drawArrays_c20dedf441392005: function(n, a, l, _) {
    getObject(n).drawArrays(a >>> 0, l, _);
  }, __wbg_drawBuffersWEBGL_5f9efe378355889a: function(n, a) {
    getObject(n).drawBuffersWEBGL(getObject(a));
  }, __wbg_drawBuffers_823c4881ba82dc9c: function(n, a) {
    getObject(n).drawBuffers(getObject(a));
  }, __wbg_drawElementsInstancedANGLE_e9170c6414853487: function(n, a, l, _, o, s) {
    getObject(n).drawElementsInstancedANGLE(a >>> 0, l, _ >>> 0, o, s);
  }, __wbg_drawElementsInstanced_2e549060a77ba831: function(n, a, l, _, o, s) {
    getObject(n).drawElementsInstanced(a >>> 0, l, _ >>> 0, o, s);
  }, __wbg_drawIndexedIndirect_1be586f18fe50ecf: function(n, a, l) {
    getObject(n).drawIndexedIndirect(getObject(a), l);
  }, __wbg_drawIndexed_a60a41b2b0ffdadf: function(n, a, l, _, o, s) {
    getObject(n).drawIndexed(a >>> 0, l >>> 0, _ >>> 0, o, s >>> 0);
  }, __wbg_drawIndirect_74b596a2ff39cd46: function(n, a, l) {
    getObject(n).drawIndirect(getObject(a), l);
  }, __wbg_draw_bcc050d6677121b5: function(n, a, l, _, o) {
    getObject(n).draw(a >>> 0, l >>> 0, _ >>> 0, o >>> 0);
  }, __wbg_enableVertexAttribArray_60dadea3a00e104a: function(n, a) {
    getObject(n).enableVertexAttribArray(a >>> 0);
  }, __wbg_enableVertexAttribArray_626e8d2d9d1fdff9: function(n, a) {
    getObject(n).enableVertexAttribArray(a >>> 0);
  }, __wbg_enable_3728894fa8c1d348: function(n, a) {
    getObject(n).enable(a >>> 0);
  }, __wbg_enable_91dff7f43064bb54: function(n, a) {
    getObject(n).enable(a >>> 0);
  }, __wbg_endQuery_48241eaef2e96940: function(n, a) {
    getObject(n).endQuery(a >>> 0);
  }, __wbg_end_05c67c1822b40952: function(n) {
    getObject(n).end();
  }, __wbg_end_c269ebd826210ed1: function(n) {
    getObject(n).end();
  }, __wbg_entries_e8a20ff8c9757101: function(n) {
    const a = Object.entries(getObject(n));
    return addHeapObject(a);
  }, __wbg_error_1eece6b0039034ce: function(n, a, l, _) {
    console.error(getObject(n), getObject(a), getObject(l), getObject(_));
  }, __wbg_error_57ef6dadfcb01843: function(n) {
    const a = getObject(n).error;
    return isLikeNone(a) ? 0 : addHeapObject(a);
  }, __wbg_error_74898554122344a8: function() {
    return handleError(function(n) {
      const a = getObject(n).error;
      return isLikeNone(a) ? 0 : addHeapObject(a);
    }, arguments);
  }, __wbg_error_a6fa202b58aa1cd3: function(n, a) {
    let l, _;
    try {
      l = n, _ = a, console.error(getStringFromWasm0(n, a));
    } finally {
      wasm.__wbindgen_export4(l, _, 1);
    }
  }, __wbg_error_cfce0f619500de52: function(n, a) {
    console.error(getObject(n), getObject(a));
  }, __wbg_eval_c311194bb27c7836: function() {
    return handleError(function(arg0, arg1) {
      const ret = eval(getStringFromWasm0(arg0, arg1));
      return addHeapObject(ret);
    }, arguments);
  }, __wbg_exec_203e2096c69172ee: function(n, a, l) {
    const _ = getObject(n).exec(getStringFromWasm0(a, l));
    return isLikeNone(_) ? 0 : addHeapObject(_);
  }, __wbg_exitFullscreen_446223b7026ea4a9: function(n) {
    getObject(n).exitFullscreen();
  }, __wbg_exitPointerLock_3c4e763915172704: function(n) {
    getObject(n).exitPointerLock();
  }, __wbg_features_a239101d9dc0c094: function(n) {
    const a = getObject(n).features;
    return addHeapObject(a);
  }, __wbg_features_cb4af4c41720c5e5: function(n) {
    const a = getObject(n).features;
    return addHeapObject(a);
  }, __wbg_fenceSync_460953d9ad5fd31a: function(n, a, l) {
    const _ = getObject(n).fenceSync(a >>> 0, l >>> 0);
    return isLikeNone(_) ? 0 : addHeapObject(_);
  }, __wbg_fetch_7b84bc2cce4c9b65: function(n, a, l) {
    const _ = getObject(n).fetch(getStringFromWasm0(a, l));
    return addHeapObject(_);
  }, __wbg_fetch_e261f234f8b50660: function(n, a, l) {
    const _ = getObject(n).fetch(getStringFromWasm0(a, l));
    return addHeapObject(_);
  }, __wbg_fetch_f8a611684c3b5fe5: function(n, a) {
    const l = getObject(n).fetch(getObject(a));
    return addHeapObject(l);
  }, __wbg_finish_073e2bc456a4b625: function(n) {
    const a = getObject(n).finish();
    return addHeapObject(a);
  }, __wbg_finish_e43b1b48427f2db0: function(n, a) {
    const l = getObject(n).finish(getObject(a));
    return addHeapObject(l);
  }, __wbg_flush_049a445c404024c2: function(n) {
    getObject(n).flush();
  }, __wbg_flush_c7dd5b1ae1447448: function(n) {
    getObject(n).flush();
  }, __wbg_focus_885197ce680db9e0: function() {
    return handleError(function(n) {
      getObject(n).focus();
    }, arguments);
  }, __wbg_framebufferRenderbuffer_7a2be23309166ad3: function(n, a, l, _, o) {
    getObject(n).framebufferRenderbuffer(a >>> 0, l >>> 0, _ >>> 0, getObject(o));
  }, __wbg_framebufferRenderbuffer_d8c1d0b985bd3c51: function(n, a, l, _, o) {
    getObject(n).framebufferRenderbuffer(a >>> 0, l >>> 0, _ >>> 0, getObject(o));
  }, __wbg_framebufferTexture2D_bf4d47f4027a3682: function(n, a, l, _, o, s) {
    getObject(n).framebufferTexture2D(a >>> 0, l >>> 0, _ >>> 0, getObject(o), s);
  }, __wbg_framebufferTexture2D_e2f7d82e6707010e: function(n, a, l, _, o, s) {
    getObject(n).framebufferTexture2D(a >>> 0, l >>> 0, _ >>> 0, getObject(o), s);
  }, __wbg_framebufferTextureLayer_01d5b9516636ccae: function(n, a, l, _, o, s) {
    getObject(n).framebufferTextureLayer(a >>> 0, l >>> 0, getObject(_), o, s);
  }, __wbg_framebufferTextureMultiviewOVR_336ea10e261ec5f6: function(n, a, l, _, o, s, j) {
    getObject(n).framebufferTextureMultiviewOVR(a >>> 0, l >>> 0, getObject(_), o, s, j);
  }, __wbg_frontFace_1537b8c3fc174f05: function(n, a) {
    getObject(n).frontFace(a >>> 0);
  }, __wbg_frontFace_57081a0312eb822e: function(n, a) {
    getObject(n).frontFace(a >>> 0);
  }, __wbg_fullscreenElement_8068aa5be9c86543: function(n) {
    const a = getObject(n).fullscreenElement;
    return isLikeNone(a) ? 0 : addHeapObject(a);
  }, __wbg_getBoundingClientRect_b236f2e393fd0e7a: function(n) {
    const a = getObject(n).getBoundingClientRect();
    return addHeapObject(a);
  }, __wbg_getBufferSubData_cbabbb87d4c5c57d: function(n, a, l, _) {
    getObject(n).getBufferSubData(a >>> 0, l, getObject(_));
  }, __wbg_getCoalescedEvents_08e25b227866a984: function(n) {
    const a = getObject(n).getCoalescedEvents();
    return addHeapObject(a);
  }, __wbg_getCoalescedEvents_3e003f63d9ebbc05: function(n) {
    const a = getObject(n).getCoalescedEvents;
    return addHeapObject(a);
  }, __wbg_getComputedStyle_b12e52450a4be72c: function() {
    return handleError(function(n, a) {
      const l = getObject(n).getComputedStyle(getObject(a));
      return isLikeNone(l) ? 0 : addHeapObject(l);
    }, arguments);
  }, __wbg_getContext_07270456453ee7f5: function() {
    return handleError(function(n, a, l, _) {
      const o = getObject(n).getContext(getStringFromWasm0(a, l), getObject(_));
      return isLikeNone(o) ? 0 : addHeapObject(o);
    }, arguments);
  }, __wbg_getContext_794490fe04be926a: function() {
    return handleError(function(n, a, l, _) {
      const o = getObject(n).getContext(getStringFromWasm0(a, l), getObject(_));
      return isLikeNone(o) ? 0 : addHeapObject(o);
    }, arguments);
  }, __wbg_getContext_a9236f98f1f7fe7c: function() {
    return handleError(function(n, a, l) {
      const _ = getObject(n).getContext(getStringFromWasm0(a, l));
      return isLikeNone(_) ? 0 : addHeapObject(_);
    }, arguments);
  }, __wbg_getContext_f04bf8f22dcb2d53: function() {
    return handleError(function(n, a, l) {
      const _ = getObject(n).getContext(getStringFromWasm0(a, l));
      return isLikeNone(_) ? 0 : addHeapObject(_);
    }, arguments);
  }, __wbg_getCurrentTexture_7edbea16b438c9fc: function() {
    return handleError(function(n) {
      const a = getObject(n).getCurrentTexture();
      return addHeapObject(a);
    }, arguments);
  }, __wbg_getExtension_0b8543b0c6b3068d: function() {
    return handleError(function(n, a, l) {
      const _ = getObject(n).getExtension(getStringFromWasm0(a, l));
      return isLikeNone(_) ? 0 : addHeapObject(_);
    }, arguments);
  }, __wbg_getGamepads_b179bcbe36d157bd: function() {
    return handleError(function(n) {
      const a = getObject(n).getGamepads();
      return addHeapObject(a);
    }, arguments);
  }, __wbg_getIndexedParameter_338c7c91cbabcf3e: function() {
    return handleError(function(n, a, l) {
      const _ = getObject(n).getIndexedParameter(a >>> 0, l >>> 0);
      return addHeapObject(_);
    }, arguments);
  }, __wbg_getItem_a7cc1d4f154f2e6f: function() {
    return handleError(function(n, a, l, _) {
      const o = getObject(a).getItem(getStringFromWasm0(l, _));
      var s = isLikeNone(o) ? 0 : passStringToWasm0(o, wasm.__wbindgen_export, wasm.__wbindgen_export2), j = WASM_VECTOR_LEN;
      getDataViewMemory0().setInt32(n + 4, j, true), getDataViewMemory0().setInt32(n + 0, s, true);
    }, arguments);
  }, __wbg_getMappedRange_191c0084744858f0: function() {
    return handleError(function(n, a, l) {
      const _ = getObject(n).getMappedRange(a, l);
      return addHeapObject(_);
    }, arguments);
  }, __wbg_getOwnPropertyDescriptor_afeb931addada534: function(n, a) {
    const l = Object.getOwnPropertyDescriptor(getObject(n), getObject(a));
    return addHeapObject(l);
  }, __wbg_getParameter_b1431cfde390c2fc: function() {
    return handleError(function(n, a) {
      const l = getObject(n).getParameter(a >>> 0);
      return addHeapObject(l);
    }, arguments);
  }, __wbg_getParameter_e634fa73b5e25287: function() {
    return handleError(function(n, a) {
      const l = getObject(n).getParameter(a >>> 0);
      return addHeapObject(l);
    }, arguments);
  }, __wbg_getPreferredCanvasFormat_56e30944cc798353: function(n) {
    const a = getObject(n).getPreferredCanvasFormat();
    return (__wbindgen_enum_GpuTextureFormat.indexOf(a) + 1 || 96) - 1;
  }, __wbg_getProgramInfoLog_50443ddea7475f57: function(n, a, l) {
    const _ = getObject(a).getProgramInfoLog(getObject(l));
    var o = isLikeNone(_) ? 0 : passStringToWasm0(_, wasm.__wbindgen_export, wasm.__wbindgen_export2), s = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(n + 4, s, true), getDataViewMemory0().setInt32(n + 0, o, true);
  }, __wbg_getProgramInfoLog_e03efa51473d657e: function(n, a, l) {
    const _ = getObject(a).getProgramInfoLog(getObject(l));
    var o = isLikeNone(_) ? 0 : passStringToWasm0(_, wasm.__wbindgen_export, wasm.__wbindgen_export2), s = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(n + 4, s, true), getDataViewMemory0().setInt32(n + 0, o, true);
  }, __wbg_getProgramParameter_46e2d49878b56edd: function(n, a, l) {
    const _ = getObject(n).getProgramParameter(getObject(a), l >>> 0);
    return addHeapObject(_);
  }, __wbg_getProgramParameter_7d3bd54ec02de007: function(n, a, l) {
    const _ = getObject(n).getProgramParameter(getObject(a), l >>> 0);
    return addHeapObject(_);
  }, __wbg_getPropertyValue_d2181532557839cf: function() {
    return handleError(function(n, a, l, _) {
      const o = getObject(a).getPropertyValue(getStringFromWasm0(l, _)), s = passStringToWasm0(o, wasm.__wbindgen_export, wasm.__wbindgen_export2), j = WASM_VECTOR_LEN;
      getDataViewMemory0().setInt32(n + 4, j, true), getDataViewMemory0().setInt32(n + 0, s, true);
    }, arguments);
  }, __wbg_getQueryParameter_5a3a2bd77e5f56bb: function(n, a, l) {
    const _ = getObject(n).getQueryParameter(getObject(a), l >>> 0);
    return addHeapObject(_);
  }, __wbg_getRandomValues_b2176991427f6db8: function() {
    return handleError(function(n) {
      globalThis.crypto.getRandomValues(getObject(n));
    }, arguments);
  }, __wbg_getRandomValues_c44a50d8cfdaebeb: function() {
    return handleError(function(n, a) {
      getObject(n).getRandomValues(getObject(a));
    }, arguments);
  }, __wbg_getRandomValues_e37a2f84ab559944: function() {
    return handleError(function(n) {
      globalThis.crypto.getRandomValues(getObject(n));
    }, arguments);
  }, __wbg_getReader_a1b0550ef1bdd954: function(n, a) {
    const l = getObject(n).getReader(getObject(a));
    return addHeapObject(l);
  }, __wbg_getShaderInfoLog_22f9e8c90a52f38d: function(n, a, l) {
    const _ = getObject(a).getShaderInfoLog(getObject(l));
    var o = isLikeNone(_) ? 0 : passStringToWasm0(_, wasm.__wbindgen_export, wasm.__wbindgen_export2), s = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(n + 4, s, true), getDataViewMemory0().setInt32(n + 0, o, true);
  }, __wbg_getShaderInfoLog_40c6a4ae67d82dde: function(n, a, l) {
    const _ = getObject(a).getShaderInfoLog(getObject(l));
    var o = isLikeNone(_) ? 0 : passStringToWasm0(_, wasm.__wbindgen_export, wasm.__wbindgen_export2), s = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(n + 4, s, true), getDataViewMemory0().setInt32(n + 0, o, true);
  }, __wbg_getShaderParameter_46f64f7ca5d534db: function(n, a, l) {
    const _ = getObject(n).getShaderParameter(getObject(a), l >>> 0);
    return addHeapObject(_);
  }, __wbg_getShaderParameter_82c275299b111f1b: function(n, a, l) {
    const _ = getObject(n).getShaderParameter(getObject(a), l >>> 0);
    return addHeapObject(_);
  }, __wbg_getSupportedExtensions_a799751b74c3a674: function(n) {
    const a = getObject(n).getSupportedExtensions();
    return isLikeNone(a) ? 0 : addHeapObject(a);
  }, __wbg_getSupportedProfiles_e089393bebafd3b0: function(n) {
    const a = getObject(n).getSupportedProfiles();
    return isLikeNone(a) ? 0 : addHeapObject(a);
  }, __wbg_getSyncParameter_fbf70c60f5e3b271: function(n, a, l) {
    const _ = getObject(n).getSyncParameter(getObject(a), l >>> 0);
    return addHeapObject(_);
  }, __wbg_getUniformBlockIndex_e483a4d166df9c2a: function(n, a, l, _) {
    return getObject(n).getUniformBlockIndex(getObject(a), getStringFromWasm0(l, _));
  }, __wbg_getUniformLocation_5eb08673afa04eee: function(n, a, l, _) {
    const o = getObject(n).getUniformLocation(getObject(a), getStringFromWasm0(l, _));
    return isLikeNone(o) ? 0 : addHeapObject(o);
  }, __wbg_getUniformLocation_90cdff44c2fceeb9: function(n, a, l, _) {
    const o = getObject(n).getUniformLocation(getObject(a), getStringFromWasm0(l, _));
    return isLikeNone(o) ? 0 : addHeapObject(o);
  }, __wbg_getWriter_aa227dc9da7cfa39: function() {
    return handleError(function(n) {
      const a = getObject(n).getWriter();
      return addHeapObject(a);
    }, arguments);
  }, __wbg_get_326e41e095fb2575: function() {
    return handleError(function(n, a) {
      const l = Reflect.get(getObject(n), getObject(a));
      return addHeapObject(l);
    }, arguments);
  }, __wbg_get_3ef1eba1850ade27: function() {
    return handleError(function(n, a) {
      const l = Reflect.get(getObject(n), getObject(a));
      return addHeapObject(l);
    }, arguments);
  }, __wbg_get_6ac8c8119f577720: function() {
    return handleError(function(n, a) {
      const l = getObject(n).get(getObject(a));
      return addHeapObject(l);
    }, arguments);
  }, __wbg_get_7873e3afa59bad00: function(n, a, l) {
    const _ = getObject(a)[l >>> 0];
    var o = isLikeNone(_) ? 0 : passStringToWasm0(_, wasm.__wbindgen_export, wasm.__wbindgen_export2), s = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(n + 4, s, true), getDataViewMemory0().setInt32(n + 0, o, true);
  }, __wbg_get_a8ee5c45dabc1b3b: function(n, a) {
    const l = getObject(n)[a >>> 0];
    return addHeapObject(l);
  }, __wbg_get_c7546417fb0bec10: function(n, a) {
    const l = getObject(n)[a >>> 0];
    return isLikeNone(l) ? 0 : addHeapObject(l);
  }, __wbg_get_unchecked_329cfe50afab7352: function(n, a) {
    const l = getObject(n)[a >>> 0];
    return addHeapObject(l);
  }, __wbg_gpu_7c0927abcc96dd45: function(n) {
    const a = getObject(n).gpu;
    return addHeapObject(a);
  }, __wbg_hardwareConcurrency_a8e3f7c0d77df6d3: function(n) {
    return getObject(n).hardwareConcurrency;
  }, __wbg_has_926ef2ff40b308cf: function() {
    return handleError(function(n, a) {
      return Reflect.has(getObject(n), getObject(a));
    }, arguments);
  }, __wbg_has_abf74d2b4f3e578e: function(n, a, l) {
    return getObject(n).has(getStringFromWasm0(a, l));
  }, __wbg_headers_fc8c672cd757e0fd: function(n) {
    const a = getObject(n).headers;
    return addHeapObject(a);
  }, __wbg_height_05531443b91baa6e: function(n) {
    return getObject(n).height;
  }, __wbg_height_6568c4427c3b889d: function(n) {
    return getObject(n).height;
  }, __wbg_height_8c06cb597de53887: function(n) {
    return getObject(n).height;
  }, __wbg_height_a6fcb48398bd1539: function(n) {
    return getObject(n).height;
  }, __wbg_height_ee9ea840e5499878: function(n) {
    return getObject(n).height;
  }, __wbg_height_fb8c4164276f25fd: function(n) {
    return getObject(n).height;
  }, __wbg_hidden_19530f76732ba428: function(n) {
    return getObject(n).hidden;
  }, __wbg_hostname_a30ece22df1c8b63: function() {
    return handleError(function(n, a) {
      const l = getObject(a).hostname, _ = passStringToWasm0(l, wasm.__wbindgen_export, wasm.__wbindgen_export2), o = WASM_VECTOR_LEN;
      getDataViewMemory0().setInt32(n + 4, o, true), getDataViewMemory0().setInt32(n + 0, _, true);
    }, arguments);
  }, __wbg_id_26bc2771d7af1b86: function(n, a) {
    const l = getObject(a).id, _ = passStringToWasm0(l, wasm.__wbindgen_export, wasm.__wbindgen_export2), o = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(n + 4, o, true), getDataViewMemory0().setInt32(n + 0, _, true);
  }, __wbg_includes_9f81335525be01f9: function(n, a, l) {
    return getObject(n).includes(getObject(a), l);
  }, __wbg_indexNames_3a9be68017fb9405: function(n) {
    const a = getObject(n).indexNames;
    return addHeapObject(a);
  }, __wbg_index_4cc30c8b16093fd3: function(n) {
    return getObject(n).index;
  }, __wbg_index_f1b3b30c5d5af6fb: function() {
    return handleError(function(n, a, l) {
      const _ = getObject(n).index(getStringFromWasm0(a, l));
      return addHeapObject(_);
    }, arguments);
  }, __wbg_info_0194681687b5ab04: function(n, a, l, _) {
    console.info(getObject(n), getObject(a), getObject(l), getObject(_));
  }, __wbg_inlineSize_bc956acca480b3d7: function(n) {
    return getObject(n).inlineSize;
  }, __wbg_instanceof_ArrayBuffer_101e2bf31071a9f6: function(n) {
    let a;
    try {
      a = getObject(n) instanceof ArrayBuffer;
    } catch {
      a = false;
    }
    return a;
  }, __wbg_instanceof_DomException_2bdcf7791a2d7d09: function(n) {
    let a;
    try {
      a = getObject(n) instanceof DOMException;
    } catch {
      a = false;
    }
    return a;
  }, __wbg_instanceof_GpuAdapter_5e451ad6596e2784: function(n) {
    let a;
    try {
      a = getObject(n) instanceof GPUAdapter;
    } catch {
      a = false;
    }
    return a;
  }, __wbg_instanceof_GpuCanvasContext_f70ee27f49f4f884: function(n) {
    let a;
    try {
      a = getObject(n) instanceof GPUCanvasContext;
    } catch {
      a = false;
    }
    return a;
  }, __wbg_instanceof_GpuOutOfMemoryError_d312fd1714771dbd: function(n) {
    let a;
    try {
      a = getObject(n) instanceof GPUOutOfMemoryError;
    } catch {
      a = false;
    }
    return a;
  }, __wbg_instanceof_GpuValidationError_eb3c494ad7b55611: function(n) {
    let a;
    try {
      a = getObject(n) instanceof GPUValidationError;
    } catch {
      a = false;
    }
    return a;
  }, __wbg_instanceof_HtmlCanvasElement_26125339f936be50: function(n) {
    let a;
    try {
      a = getObject(n) instanceof HTMLCanvasElement;
    } catch {
      a = false;
    }
    return a;
  }, __wbg_instanceof_IdbDatabase_5f436cc89cc07f14: function(n) {
    let a;
    try {
      a = getObject(n) instanceof IDBDatabase;
    } catch {
      a = false;
    }
    return a;
  }, __wbg_instanceof_IdbFactory_efcffbfd9020e4ac: function(n) {
    let a;
    try {
      a = getObject(n) instanceof IDBFactory;
    } catch {
      a = false;
    }
    return a;
  }, __wbg_instanceof_IdbOpenDbRequest_10c2576001eb6613: function(n) {
    let a;
    try {
      a = getObject(n) instanceof IDBOpenDBRequest;
    } catch {
      a = false;
    }
    return a;
  }, __wbg_instanceof_IdbRequest_6a0e24572d4f1d46: function(n) {
    let a;
    try {
      a = getObject(n) instanceof IDBRequest;
    } catch {
      a = false;
    }
    return a;
  }, __wbg_instanceof_IdbTransaction_125db5cfd1c1bfd2: function(n) {
    let a;
    try {
      a = getObject(n) instanceof IDBTransaction;
    } catch {
      a = false;
    }
    return a;
  }, __wbg_instanceof_Map_f194b366846aca0c: function(n) {
    let a;
    try {
      a = getObject(n) instanceof Map;
    } catch {
      a = false;
    }
    return a;
  }, __wbg_instanceof_Object_be1962063fcc0c9f: function(n) {
    let a;
    try {
      a = getObject(n) instanceof Object;
    } catch {
      a = false;
    }
    return a;
  }, __wbg_instanceof_Performance_fc16db7b6f107638: function(n) {
    let a;
    try {
      a = getObject(n) instanceof Performance;
    } catch {
      a = false;
    }
    return a;
  }, __wbg_instanceof_Response_9b4d9fd451e051b1: function(n) {
    let a;
    try {
      a = getObject(n) instanceof Response;
    } catch {
      a = false;
    }
    return a;
  }, __wbg_instanceof_Uint8Array_740438561a5b956d: function(n) {
    let a;
    try {
      a = getObject(n) instanceof Uint8Array;
    } catch {
      a = false;
    }
    return a;
  }, __wbg_instanceof_WebGl2RenderingContext_349f232f715e6bc2: function(n) {
    let a;
    try {
      a = getObject(n) instanceof WebGL2RenderingContext;
    } catch {
      a = false;
    }
    return a;
  }, __wbg_instanceof_Window_23e677d2c6843922: function(n) {
    let a;
    try {
      a = getObject(n) instanceof Window;
    } catch {
      a = false;
    }
    return a;
  }, __wbg_invalidateFramebuffer_df9574509a402d4f: function() {
    return handleError(function(n, a, l) {
      getObject(n).invalidateFramebuffer(a >>> 0, getObject(l));
    }, arguments);
  }, __wbg_isArray_33b91feb269ff46e: function(n) {
    return Array.isArray(getObject(n));
  }, __wbg_isIntersecting_b3e74fb0cf75f7d1: function(n) {
    return getObject(n).isIntersecting;
  }, __wbg_isSafeInteger_ecd6a7f9c3e053cd: function(n) {
    return Number.isSafeInteger(getObject(n));
  }, __wbg_isSecureContext_b78081a385656549: function(n) {
    return getObject(n).isSecureContext;
  }, __wbg_is_a166b9958c2438ad: function(n, a) {
    return Object.is(getObject(n), getObject(a));
  }, __wbg_iterator_d8f549ec8fb061b1: function() {
    return addHeapObject(Symbol.iterator);
  }, __wbg_json_602d0b5448ab6391: function() {
    return handleError(function(n) {
      const a = getObject(n).json();
      return addHeapObject(a);
    }, arguments);
  }, __wbg_keyPath_f17010debffed49a: function() {
    return handleError(function(n) {
      const a = getObject(n).keyPath;
      return addHeapObject(a);
    }, arguments);
  }, __wbg_key_99eb0f0a1000963d: function(n, a) {
    const l = getObject(a).key, _ = passStringToWasm0(l, wasm.__wbindgen_export, wasm.__wbindgen_export2), o = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(n + 4, o, true), getDataViewMemory0().setInt32(n + 0, _, true);
  }, __wbg_label_0abc44bf8d3a3e99: function(n, a) {
    const l = getObject(a).label, _ = passStringToWasm0(l, wasm.__wbindgen_export, wasm.__wbindgen_export2), o = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(n + 4, o, true), getDataViewMemory0().setInt32(n + 0, _, true);
  }, __wbg_length_02c4f6002306a824: function(n) {
    return getObject(n).length;
  }, __wbg_length_259ee9d041e381ad: function(n) {
    return getObject(n).length;
  }, __wbg_length_b3416cf66a5452c8: function(n) {
    return getObject(n).length;
  }, __wbg_length_ea16607d7b61445b: function(n) {
    return getObject(n).length;
  }, __wbg_limits_764638d29dec49d4: function(n) {
    const a = getObject(n).limits;
    return addHeapObject(a);
  }, __wbg_limits_ea7aa423b3575ea6: function(n) {
    const a = getObject(n).limits;
    return addHeapObject(a);
  }, __wbg_linkProgram_b969f67969a850b5: function(n, a) {
    getObject(n).linkProgram(getObject(a));
  }, __wbg_linkProgram_e626a3e7d78e1738: function(n, a) {
    getObject(n).linkProgram(getObject(a));
  }, __wbg_localStorage_51c38b3b222e1ed2: function() {
    return handleError(function(n) {
      const a = getObject(n).localStorage;
      return isLikeNone(a) ? 0 : addHeapObject(a);
    }, arguments);
  }, __wbg_location_cb6f3af6ad563d81: function(n) {
    return getObject(n).location;
  }, __wbg_location_fc8d47802682dd93: function(n) {
    const a = getObject(n).location;
    return addHeapObject(a);
  }, __wbg_log_0c201ade58bb55e1: function(n, a, l, _, o, s, j, S) {
    let x, p;
    try {
      x = n, p = a, console.log(getStringFromWasm0(n, a), getStringFromWasm0(l, _), getStringFromWasm0(o, s), getStringFromWasm0(j, S));
    } finally {
      wasm.__wbindgen_export4(x, p, 1);
    }
  }, __wbg_log_70972330cfc941dd: function(n, a, l, _) {
    console.log(getObject(n), getObject(a), getObject(l), getObject(_));
  }, __wbg_log_ce2c4456b290c5e7: function(n, a) {
    let l, _;
    try {
      l = n, _ = a, console.log(getStringFromWasm0(n, a));
    } finally {
      wasm.__wbindgen_export4(l, _, 1);
    }
  }, __wbg_mapAsync_1be2f9e8f464f69e: function(n, a, l, _) {
    const o = getObject(n).mapAsync(a >>> 0, l, _);
    return addHeapObject(o);
  }, __wbg_mapping_c0470f8cd55cefc3: function(n) {
    const a = getObject(n).mapping;
    return (__wbindgen_enum_GamepadMappingType.indexOf(a) + 1 || 3) - 1;
  }, __wbg_mark_b4d943f3bc2d2404: function(n, a) {
    performance.mark(getStringFromWasm0(n, a));
  }, __wbg_matchMedia_b27489ec503ba2a5: function() {
    return handleError(function(n, a, l) {
      const _ = getObject(n).matchMedia(getStringFromWasm0(a, l));
      return isLikeNone(_) ? 0 : addHeapObject(_);
    }, arguments);
  }, __wbg_matches_d58caa45a0ef29a3: function(n) {
    return getObject(n).matches;
  }, __wbg_maxBindGroups_c439abd1498fc924: function(n) {
    return getObject(n).maxBindGroups;
  }, __wbg_maxBindingsPerBindGroup_186292f383c7b982: function(n) {
    return getObject(n).maxBindingsPerBindGroup;
  }, __wbg_maxBufferSize_87b76aa2842d0e8e: function(n) {
    return getObject(n).maxBufferSize;
  }, __wbg_maxChannelCount_8cba596bef7c2947: function(n) {
    return getObject(n).maxChannelCount;
  }, __wbg_maxColorAttachmentBytesPerSample_2ba81ae1e2742413: function(n) {
    return getObject(n).maxColorAttachmentBytesPerSample;
  }, __wbg_maxColorAttachments_1ec5191521ef0d22: function(n) {
    return getObject(n).maxColorAttachments;
  }, __wbg_maxComputeInvocationsPerWorkgroup_ee67a82206d412d2: function(n) {
    return getObject(n).maxComputeInvocationsPerWorkgroup;
  }, __wbg_maxComputeWorkgroupSizeX_0b2b16b802f85a14: function(n) {
    return getObject(n).maxComputeWorkgroupSizeX;
  }, __wbg_maxComputeWorkgroupSizeY_00d8aeba9472fdb2: function(n) {
    return getObject(n).maxComputeWorkgroupSizeY;
  }, __wbg_maxComputeWorkgroupSizeZ_351fd9dab4c07321: function(n) {
    return getObject(n).maxComputeWorkgroupSizeZ;
  }, __wbg_maxComputeWorkgroupStorageSize_881d2b675868eb68: function(n) {
    return getObject(n).maxComputeWorkgroupStorageSize;
  }, __wbg_maxComputeWorkgroupsPerDimension_21c223eca6bd6d6b: function(n) {
    return getObject(n).maxComputeWorkgroupsPerDimension;
  }, __wbg_maxDatagramSize_09185857947128ac: function(n) {
    return getObject(n).maxDatagramSize;
  }, __wbg_maxDynamicStorageBuffersPerPipelineLayout_7155d3f7a514a157: function(n) {
    return getObject(n).maxDynamicStorageBuffersPerPipelineLayout;
  }, __wbg_maxDynamicUniformBuffersPerPipelineLayout_76dee9028eaa5322: function(n) {
    return getObject(n).maxDynamicUniformBuffersPerPipelineLayout;
  }, __wbg_maxSampledTexturesPerShaderStage_78d018dcd0b999c8: function(n) {
    return getObject(n).maxSampledTexturesPerShaderStage;
  }, __wbg_maxSamplersPerShaderStage_0e3ad4d70194a7c2: function(n) {
    return getObject(n).maxSamplersPerShaderStage;
  }, __wbg_maxStorageBufferBindingSize_30a1e5c0b8fcd992: function(n) {
    return getObject(n).maxStorageBufferBindingSize;
  }, __wbg_maxStorageBuffersPerShaderStage_d77703e9a0d5960e: function(n) {
    return getObject(n).maxStorageBuffersPerShaderStage;
  }, __wbg_maxStorageTexturesPerShaderStage_c09e7daf1141067e: function(n) {
    return getObject(n).maxStorageTexturesPerShaderStage;
  }, __wbg_maxTextureArrayLayers_44d8badedb4e5245: function(n) {
    return getObject(n).maxTextureArrayLayers;
  }, __wbg_maxTextureDimension1D_6d1ff8e56b9cf824: function(n) {
    return getObject(n).maxTextureDimension1D;
  }, __wbg_maxTextureDimension2D_5ef5830837d92b7c: function(n) {
    return getObject(n).maxTextureDimension2D;
  }, __wbg_maxTextureDimension3D_cfdebbf2b20068cd: function(n) {
    return getObject(n).maxTextureDimension3D;
  }, __wbg_maxUniformBufferBindingSize_63dc0c714d2fcebe: function(n) {
    return getObject(n).maxUniformBufferBindingSize;
  }, __wbg_maxUniformBuffersPerShaderStage_a52382f8a7dfc816: function(n) {
    return getObject(n).maxUniformBuffersPerShaderStage;
  }, __wbg_maxVertexAttributes_4c83ac8c1d442e1c: function(n) {
    return getObject(n).maxVertexAttributes;
  }, __wbg_maxVertexBufferArrayStride_955879053ec672f8: function(n) {
    return getObject(n).maxVertexBufferArrayStride;
  }, __wbg_maxVertexBuffers_0bb014e62f100c6c: function(n) {
    return getObject(n).maxVertexBuffers;
  }, __wbg_measure_84362959e621a2c1: function() {
    return handleError(function(n, a, l, _) {
      let o, s, j, S;
      try {
        o = n, s = a, j = l, S = _, performance.measure(getStringFromWasm0(n, a), getStringFromWasm0(l, _));
      } finally {
        wasm.__wbindgen_export4(o, s, 1), wasm.__wbindgen_export4(j, S, 1);
      }
    }, arguments);
  }, __wbg_media_91e147d0112e864c: function(n, a) {
    const l = getObject(a).media, _ = passStringToWasm0(l, wasm.__wbindgen_export, wasm.__wbindgen_export2), o = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(n + 4, o, true), getDataViewMemory0().setInt32(n + 0, _, true);
  }, __wbg_message_206e22ac85ff4937: function(n, a) {
    const l = getObject(a).message, _ = passStringToWasm0(l, wasm.__wbindgen_export, wasm.__wbindgen_export2), o = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(n + 4, o, true), getDataViewMemory0().setInt32(n + 0, _, true);
  }, __wbg_message_e959edc81e4b6cb7: function(n, a) {
    const l = getObject(a).message, _ = passStringToWasm0(l, wasm.__wbindgen_export, wasm.__wbindgen_export2), o = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(n + 4, o, true), getDataViewMemory0().setInt32(n + 0, _, true);
  }, __wbg_metaKey_04074c2a59c1806c: function(n) {
    return getObject(n).metaKey;
  }, __wbg_metaKey_09c90f191df1276b: function(n) {
    return getObject(n).metaKey;
  }, __wbg_minStorageBufferOffsetAlignment_6ed09762e603ac3a: function(n) {
    return getObject(n).minStorageBufferOffsetAlignment;
  }, __wbg_minUniformBufferOffsetAlignment_02579f79815cf83c: function(n) {
    return getObject(n).minUniformBufferOffsetAlignment;
  }, __wbg_movementX_36b3256d18bcf681: function(n) {
    return getObject(n).movementX;
  }, __wbg_movementY_004a98ec08b8f584: function(n) {
    return getObject(n).movementY;
  }, __wbg_msCrypto_bd5a034af96bcba6: function(n) {
    const a = getObject(n).msCrypto;
    return addHeapObject(a);
  }, __wbg_multiEntry_fd907a11ddf44df1: function(n) {
    return getObject(n).multiEntry;
  }, __wbg_navigator_583ffd4fc14c0f7a: function(n) {
    const a = getObject(n).navigator;
    return addHeapObject(a);
  }, __wbg_navigator_9cebf56f28aa719b: function(n) {
    const a = getObject(n).navigator;
    return addHeapObject(a);
  }, __wbg_new_0b637bad3d58f611: function() {
    return handleError(function() {
      const n = new Image();
      return addHeapObject(n);
    }, arguments);
  }, __wbg_new_227d7c05414eb861: function() {
    const n = new Error();
    return addHeapObject(n);
  }, __wbg_new_231f743fdbbd7628: function(n) {
    const a = new Uint8ClampedArray(getObject(n));
    return addHeapObject(a);
  }, __wbg_new_2cb6f455748a4e89: function(n) {
    const a = new Float32Array(getObject(n));
    return addHeapObject(a);
  }, __wbg_new_3acd383af1655b5f: function() {
    return handleError(function(n, a) {
      const l = new Worker(getStringFromWasm0(n, a));
      return addHeapObject(l);
    }, arguments);
  }, __wbg_new_42398a42abc5b110: function() {
    return handleError(function(n) {
      const a = new IntersectionObserver(getObject(n));
      return addHeapObject(a);
    }, arguments);
  }, __wbg_new_5f486cdf45a04d78: function(n) {
    const a = new Uint8Array(getObject(n));
    return addHeapObject(a);
  }, __wbg_new_a5de2c0e786216d6: function(n) {
    const a = new ArrayBuffer(n >>> 0);
    return addHeapObject(a);
  }, __wbg_new_a70fbab9066b301f: function() {
    const n = new Array();
    return addHeapObject(n);
  }, __wbg_new_aad8cb4adc774d03: function(n, a, l, _) {
    const o = new RegExp(getStringFromWasm0(n, a), getStringFromWasm0(l, _));
    return addHeapObject(o);
  }, __wbg_new_ab79df5bd7c26067: function() {
    const n = new Object();
    return addHeapObject(n);
  }, __wbg_new_af04f4c3ed7fd887: function(n) {
    const a = new Int32Array(getObject(n));
    return addHeapObject(a);
  }, __wbg_new_c518c60af666645b: function() {
    return handleError(function() {
      const n = new AbortController();
      return addHeapObject(n);
    }, arguments);
  }, __wbg_new_d098e265629cd10f: function(n, a) {
    try {
      var l = { a: n, b: a }, _ = (s, j) => {
        const S = l.a;
        l.a = 0;
        try {
          return __wasm_bindgen_func_elem_192522(S, l.b, s, j);
        } finally {
          l.a = S;
        }
      };
      const o = new Promise(_);
      return addHeapObject(o);
    } finally {
      l.a = l.b = 0;
    }
  }, __wbg_new_dd50bcc3f60ba434: function() {
    return handleError(function(n, a) {
      const l = new WebSocket(getStringFromWasm0(n, a));
      return addHeapObject(l);
    }, arguments);
  }, __wbg_new_de704db0001dadc8: function() {
    return handleError(function(n) {
      const a = new ResizeObserver(getObject(n));
      return addHeapObject(a);
    }, arguments);
  }, __wbg_new_e9bc99ed55d4504d: function() {
    return handleError(function(n, a) {
      const l = new ImageData(takeObject(n), a >>> 0);
      return addHeapObject(l);
    }, arguments);
  }, __wbg_new_f7708ba82c4c12f6: function() {
    return handleError(function() {
      const n = new MessageChannel();
      return addHeapObject(n);
    }, arguments);
  }, __wbg_new_from_slice_22da9388ac046e50: function(n, a) {
    const l = new Uint8Array(getArrayU8FromWasm0(n, a));
    return addHeapObject(l);
  }, __wbg_new_typed_bccac67128ed885a: function() {
    const n = new Array();
    return addHeapObject(n);
  }, __wbg_new_with_byte_offset_and_length_b2ec5bf7b2f35743: function(n, a, l) {
    const _ = new Uint8Array(getObject(n), a >>> 0, l >>> 0);
    return addHeapObject(_);
  }, __wbg_new_with_context_options_c1249ea1a7ddc84f: function() {
    return handleError(function(n) {
      const a = new lAudioContext(getObject(n));
      return addHeapObject(a);
    }, arguments);
  }, __wbg_new_with_length_825018a1616e9e55: function(n) {
    const a = new Uint8Array(n >>> 0);
    return addHeapObject(a);
  }, __wbg_new_with_options_a992f1eb77ddb6f5: function() {
    return handleError(function(n, a, l) {
      const _ = new WebTransport(getStringFromWasm0(n, a), getObject(l));
      return addHeapObject(_);
    }, arguments);
  }, __wbg_new_with_str_and_init_b4b54d1a819bc724: function() {
    return handleError(function(n, a, l) {
      const _ = new Request(getStringFromWasm0(n, a), getObject(l));
      return addHeapObject(_);
    }, arguments);
  }, __wbg_new_with_str_sequence_81cd713f8ef645ea: function() {
    return handleError(function(n) {
      const a = new Blob(getObject(n));
      return addHeapObject(a);
    }, arguments);
  }, __wbg_new_with_str_sequence_and_options_a037535f6e1edba0: function() {
    return handleError(function(n, a) {
      const l = new Blob(getObject(n), getObject(a));
      return addHeapObject(l);
    }, arguments);
  }, __wbg_next_11b99ee6237339e3: function() {
    return handleError(function(n) {
      const a = getObject(n).next();
      return addHeapObject(a);
    }, arguments);
  }, __wbg_next_e01a967809d1aa68: function(n) {
    const a = getObject(n).next;
    return addHeapObject(a);
  }, __wbg_node_84ea875411254db1: function(n) {
    const a = getObject(n).node;
    return addHeapObject(a);
  }, __wbg_now_16f0c993d5dd6c27: function() {
    return Date.now();
  }, __wbg_now_c6d7a7d35f74f6f1: function(n) {
    return getObject(n).now();
  }, __wbg_now_e7c6795a7f81e10f: function(n) {
    return getObject(n).now();
  }, __wbg_objectStoreNames_564985d2e9ae7523: function(n) {
    const a = getObject(n).objectStoreNames;
    return addHeapObject(a);
  }, __wbg_objectStore_f314ab152a5c7bd0: function() {
    return handleError(function(n, a, l) {
      const _ = getObject(n).objectStore(getStringFromWasm0(a, l));
      return addHeapObject(_);
    }, arguments);
  }, __wbg_observe_571954223f11dad1: function(n, a, l) {
    getObject(n).observe(getObject(a), getObject(l));
  }, __wbg_observe_a829ffd9907f84b1: function(n, a) {
    getObject(n).observe(getObject(a));
  }, __wbg_observe_e1a1f270d8431b29: function(n, a) {
    getObject(n).observe(getObject(a));
  }, __wbg_of_8bf7ed3eca00ea43: function(n) {
    const a = Array.of(getObject(n));
    return addHeapObject(a);
  }, __wbg_of_8fd5dd402bc67165: function(n, a, l) {
    const _ = Array.of(getObject(n), getObject(a), getObject(l));
    return addHeapObject(_);
  }, __wbg_of_d6376e3774c51f89: function(n, a) {
    const l = Array.of(getObject(n), getObject(a));
    return addHeapObject(l);
  }, __wbg_offsetX_a9bf2ea7f0575ac9: function(n) {
    return getObject(n).offsetX;
  }, __wbg_offsetY_10e5433a1bbd4c01: function(n) {
    return getObject(n).offsetY;
  }, __wbg_ok_7ec8b94facac7704: function(n) {
    return getObject(n).ok;
  }, __wbg_onSubmittedWorkDone_7d532ba1f20a64b3: function(n) {
    const a = getObject(n).onSubmittedWorkDone();
    return addHeapObject(a);
  }, __wbg_open_e7a9d3d6344572f6: function() {
    return handleError(function(n, a, l, _) {
      const o = getObject(n).open(getStringFromWasm0(a, l), _ >>> 0);
      return addHeapObject(o);
    }, arguments);
  }, __wbg_open_f3dc09caa3990bc4: function() {
    return handleError(function(n, a, l) {
      const _ = getObject(n).open(getStringFromWasm0(a, l));
      return addHeapObject(_);
    }, arguments);
  }, __wbg_origin_bac5c3119fe40a90: function() {
    return handleError(function(n, a) {
      const l = getObject(a).origin, _ = passStringToWasm0(l, wasm.__wbindgen_export, wasm.__wbindgen_export2), o = WASM_VECTOR_LEN;
      getDataViewMemory0().setInt32(n + 4, o, true), getDataViewMemory0().setInt32(n + 0, _, true);
    }, arguments);
  }, __wbg_performance_3fcf6e32a7e1ed0a: function(n) {
    const a = getObject(n).performance;
    return addHeapObject(a);
  }, __wbg_persisted_8366757621586c61: function(n) {
    return getObject(n).persisted;
  }, __wbg_pixelStorei_2a2385ed59538d48: function(n, a, l) {
    getObject(n).pixelStorei(a >>> 0, l);
  }, __wbg_pixelStorei_2a3c5b85cf37caba: function(n, a, l) {
    getObject(n).pixelStorei(a >>> 0, l);
  }, __wbg_play_3997a1be51d27925: function(n) {
    getObject(n).play();
  }, __wbg_pointerId_85ff21be7b52f43e: function(n) {
    return getObject(n).pointerId;
  }, __wbg_pointerType_02525bef1df5f79c: function(n, a) {
    const l = getObject(a).pointerType, _ = passStringToWasm0(l, wasm.__wbindgen_export, wasm.__wbindgen_export2), o = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(n + 4, o, true), getDataViewMemory0().setInt32(n + 0, _, true);
  }, __wbg_polygonOffset_17cb85e417bf9db7: function(n, a, l) {
    getObject(n).polygonOffset(a, l);
  }, __wbg_polygonOffset_cc6bec2f9f4a18f7: function(n, a, l) {
    getObject(n).polygonOffset(a, l);
  }, __wbg_popErrorScope_560bfe3f43f543e7: function(n) {
    const a = getObject(n).popErrorScope();
    return addHeapObject(a);
  }, __wbg_port1_869a7ef90538dbdf: function(n) {
    const a = getObject(n).port1;
    return addHeapObject(a);
  }, __wbg_port2_947a51b8ba00adc9: function(n) {
    const a = getObject(n).port2;
    return addHeapObject(a);
  }, __wbg_postMessage_5ed5275983f7dad2: function() {
    return handleError(function(n, a, l) {
      getObject(n).postMessage(getObject(a), getObject(l));
    }, arguments);
  }, __wbg_postMessage_c89a8b5edbf59ad0: function() {
    return handleError(function(n, a) {
      getObject(n).postMessage(getObject(a));
    }, arguments);
  }, __wbg_postMessage_edb4c90a528e5a8c: function() {
    return handleError(function(n, a) {
      getObject(n).postMessage(getObject(a));
    }, arguments);
  }, __wbg_postTask_e2439afddcdfbb55: function(n, a, l) {
    const _ = getObject(n).postTask(getObject(a), getObject(l));
    return addHeapObject(_);
  }, __wbg_pressed_04111050e054a5e8: function(n) {
    return getObject(n).pressed;
  }, __wbg_pressure_8a4698697b9bba06: function(n) {
    return getObject(n).pressure;
  }, __wbg_preventDefault_25a229bfe5c510f8: function(n) {
    getObject(n).preventDefault();
  }, __wbg_process_44c7a14e11e9f69e: function(n) {
    const a = getObject(n).process;
    return addHeapObject(a);
  }, __wbg_prototype_0d5bb2023db3bcfc: function() {
    const n = ResizeObserverEntry.prototype;
    return addHeapObject(n);
  }, __wbg_prototypesetcall_d62e5099504357e6: function(n, a, l) {
    Uint8Array.prototype.set.call(getArrayU8FromWasm0(n, a), getObject(l));
  }, __wbg_pushErrorScope_9c7f2c66d0393f31: function(n, a) {
    getObject(n).pushErrorScope(__wbindgen_enum_GpuErrorFilter[a]);
  }, __wbg_push_e87b0e732085a946: function(n, a) {
    return getObject(n).push(getObject(a));
  }, __wbg_put_ae369598c083f1f5: function() {
    return handleError(function(n, a) {
      const l = getObject(n).put(getObject(a));
      return addHeapObject(l);
    }, arguments);
  }, __wbg_put_f1673d719f93ce22: function() {
    return handleError(function(n, a, l) {
      const _ = getObject(n).put(getObject(a), getObject(l));
      return addHeapObject(_);
    }, arguments);
  }, __wbg_queryCounterEXT_12ca9f560a5855cb: function(n, a, l) {
    getObject(n).queryCounterEXT(getObject(a), l >>> 0);
  }, __wbg_querySelectorAll_ccbf0696a1c6fed8: function() {
    return handleError(function(n, a, l) {
      const _ = getObject(n).querySelectorAll(getStringFromWasm0(a, l));
      return addHeapObject(_);
    }, arguments);
  }, __wbg_querySelector_46ff1b81410aebea: function() {
    return handleError(function(n, a, l) {
      const _ = getObject(n).querySelector(getStringFromWasm0(a, l));
      return isLikeNone(_) ? 0 : addHeapObject(_);
    }, arguments);
  }, __wbg_queueMicrotask_0c399741342fb10f: function(n) {
    const a = getObject(n).queueMicrotask;
    return addHeapObject(a);
  }, __wbg_queueMicrotask_2c62b1965a4562a4: function(n) {
    queueMicrotask(getObject(n));
  }, __wbg_queueMicrotask_6df42d3afe4aa9f8: function(n) {
    queueMicrotask(getObject(n));
  }, __wbg_queueMicrotask_9608487e970c906d: function(n, a) {
    getObject(n).queueMicrotask(getObject(a));
  }, __wbg_queueMicrotask_a082d78ce798393e: function(n) {
    queueMicrotask(getObject(n));
  }, __wbg_queue_5eda23116e5d3adb: function(n) {
    const a = getObject(n).queue;
    return addHeapObject(a);
  }, __wbg_randomFillSync_6c25eac9869eb53c: function() {
    return handleError(function(n, a) {
      getObject(n).randomFillSync(takeObject(a));
    }, arguments);
  }, __wbg_readBuffer_e559a3da4aa9e434: function(n, a) {
    getObject(n).readBuffer(a >>> 0);
  }, __wbg_readPixels_41a371053c299080: function() {
    return handleError(function(n, a, l, _, o, s, j, S) {
      getObject(n).readPixels(a, l, _, o, s >>> 0, j >>> 0, getObject(S));
    }, arguments);
  }, __wbg_readPixels_5c7066b5bd547f81: function() {
    return handleError(function(n, a, l, _, o, s, j, S) {
      getObject(n).readPixels(a, l, _, o, s >>> 0, j >>> 0, getObject(S));
    }, arguments);
  }, __wbg_readPixels_f675ed52bd44f8f1: function() {
    return handleError(function(n, a, l, _, o, s, j, S) {
      getObject(n).readPixels(a, l, _, o, s >>> 0, j >>> 0, S);
    }, arguments);
  }, __wbg_read_312e1367cbceb744: function(n, a) {
    const l = getObject(n).read(getObject(a));
    return addHeapObject(l);
  }, __wbg_readable_bd6ae02fbb928d26: function(n) {
    const a = getObject(n).readable;
    return addHeapObject(a);
  }, __wbg_readyState_1f1e7f1bdf9f4d42: function(n) {
    return getObject(n).readyState;
  }, __wbg_ready_8fcc468b2355b4af: function() {
    return handleError(function(n) {
      const a = getObject(n).ready;
      return addHeapObject(a);
    }, arguments);
  }, __wbg_reason_cbcb9911796c4714: function(n, a) {
    const l = getObject(a).reason, _ = passStringToWasm0(l, wasm.__wbindgen_export, wasm.__wbindgen_export2), o = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(n + 4, o, true), getDataViewMemory0().setInt32(n + 0, _, true);
  }, __wbg_removeEventListener_d27694700fc0df8b: function() {
    return handleError(function(n, a, l, _) {
      getObject(n).removeEventListener(getStringFromWasm0(a, l), getObject(_));
    }, arguments);
  }, __wbg_removeListener_7afb5d85c58c554b: function() {
    return handleError(function(n, a) {
      getObject(n).removeListener(getObject(a));
    }, arguments);
  }, __wbg_removeProperty_5b3523637b608633: function() {
    return handleError(function(n, a, l, _) {
      const o = getObject(a).removeProperty(getStringFromWasm0(l, _)), s = passStringToWasm0(o, wasm.__wbindgen_export, wasm.__wbindgen_export2), j = WASM_VECTOR_LEN;
      getDataViewMemory0().setInt32(n + 4, j, true), getDataViewMemory0().setInt32(n + 0, s, true);
    }, arguments);
  }, __wbg_renderbufferStorageMultisample_d999a80fbc25df5f: function(n, a, l, _, o, s) {
    getObject(n).renderbufferStorageMultisample(a >>> 0, l, _ >>> 0, o, s);
  }, __wbg_renderbufferStorage_9130171a6ae371dc: function(n, a, l, _, o) {
    getObject(n).renderbufferStorage(a >>> 0, l >>> 0, _, o);
  }, __wbg_renderbufferStorage_b184ea29064b4e02: function(n, a, l, _, o) {
    getObject(n).renderbufferStorage(a >>> 0, l >>> 0, _, o);
  }, __wbg_repeat_44d6eeebd275606f: function(n) {
    return getObject(n).repeat;
  }, __wbg_requestAdapter_8efca1b953fd13aa: function(n, a) {
    const l = getObject(n).requestAdapter(getObject(a));
    return addHeapObject(l);
  }, __wbg_requestAnimationFrame_206c97f410e7a383: function() {
    return handleError(function(n, a) {
      return getObject(n).requestAnimationFrame(getObject(a));
    }, arguments);
  }, __wbg_requestDevice_290c73161fe959d5: function(n, a) {
    const l = getObject(n).requestDevice(getObject(a));
    return addHeapObject(l);
  }, __wbg_requestFullscreen_3f16e43f398ce624: function(n) {
    const a = getObject(n).requestFullscreen();
    return addHeapObject(a);
  }, __wbg_requestFullscreen_b977a3a0697e883c: function(n) {
    const a = getObject(n).requestFullscreen;
    return addHeapObject(a);
  }, __wbg_requestIdleCallback_3689e3e38f6cfc02: function(n) {
    const a = getObject(n).requestIdleCallback;
    return addHeapObject(a);
  }, __wbg_requestIdleCallback_75108097af8f5c6a: function() {
    return handleError(function(n, a) {
      return getObject(n).requestIdleCallback(getObject(a));
    }, arguments);
  }, __wbg_requestPointerLock_5794d6c3f7d960bb: function(n) {
    getObject(n).requestPointerLock();
  }, __wbg_require_b4edbdcf3e2a1ef0: function() {
    return handleError(function() {
      const n = module.require;
      return addHeapObject(n);
    }, arguments);
  }, __wbg_resolveQuerySet_ee2438e6a23d55f6: function(n, a, l, _, o, s) {
    getObject(n).resolveQuerySet(getObject(a), l >>> 0, _ >>> 0, getObject(o), s >>> 0);
  }, __wbg_resolve_ae8d83246e5bcc12: function(n) {
    const a = Promise.resolve(getObject(n));
    return addHeapObject(a);
  }, __wbg_result_c5baa2d3d690a01a: function() {
    return handleError(function(n) {
      const a = getObject(n).result;
      return addHeapObject(a);
    }, arguments);
  }, __wbg_resume_7cf56c82bfdf6c58: function() {
    return handleError(function(n) {
      const a = getObject(n).resume();
      return addHeapObject(a);
    }, arguments);
  }, __wbg_revokeObjectURL_c4a7ed8e1908b794: function() {
    return handleError(function(n, a) {
      URL.revokeObjectURL(getStringFromWasm0(n, a));
    }, arguments);
  }, __wbg_samplerParameterf_774cff2229cc9fc3: function(n, a, l, _) {
    getObject(n).samplerParameterf(getObject(a), l >>> 0, _);
  }, __wbg_samplerParameteri_7dde222b01588620: function(n, a, l, _) {
    getObject(n).samplerParameteri(getObject(a), l >>> 0, _);
  }, __wbg_scheduler_a17d41c9c822fc26: function(n) {
    const a = getObject(n).scheduler;
    return addHeapObject(a);
  }, __wbg_scheduler_b35fe73ba70e89cc: function(n) {
    const a = getObject(n).scheduler;
    return addHeapObject(a);
  }, __wbg_scissor_b18f09381b341db5: function(n, a, l, _, o) {
    getObject(n).scissor(a, l, _, o);
  }, __wbg_scissor_db3842546fb31842: function(n, a, l, _, o) {
    getObject(n).scissor(a, l, _, o);
  }, __wbg_send_d31a693c975dea74: function() {
    return handleError(function(n, a, l) {
      getObject(n).send(getArrayU8FromWasm0(a, l));
    }, arguments);
  }, __wbg_send_d3733b292c3de949: function() {
    return handleError(function(n, a) {
      getObject(n).send(getObject(a));
    }, arguments);
  }, __wbg_setAttribute_f20d3b966749ab64: function() {
    return handleError(function(n, a, l, _, o) {
      getObject(n).setAttribute(getStringFromWasm0(a, l), getStringFromWasm0(_, o));
    }, arguments);
  }, __wbg_setBindGroup_1c8c11d4dd6528cf: function(n, a, l) {
    getObject(n).setBindGroup(a >>> 0, getObject(l));
  }, __wbg_setBindGroup_29f4a44dff76f1a4: function(n, a, l) {
    getObject(n).setBindGroup(a >>> 0, getObject(l));
  }, __wbg_setBindGroup_35a4830ac2c27742: function() {
    return handleError(function(n, a, l, _, o, s, j) {
      getObject(n).setBindGroup(a >>> 0, getObject(l), getArrayU32FromWasm0(_, o), s, j >>> 0);
    }, arguments);
  }, __wbg_setBindGroup_abde98bc542a4ae2: function() {
    return handleError(function(n, a, l, _, o, s, j) {
      getObject(n).setBindGroup(a >>> 0, getObject(l), getArrayU32FromWasm0(_, o), s, j >>> 0);
    }, arguments);
  }, __wbg_setBlendConstant_b9a2e1bc2a6182a3: function() {
    return handleError(function(n, a) {
      getObject(n).setBlendConstant(getObject(a));
    }, arguments);
  }, __wbg_setIndexBuffer_924197dc97dbb679: function(n, a, l, _, o) {
    getObject(n).setIndexBuffer(getObject(a), __wbindgen_enum_GpuIndexFormat[l], _, o);
  }, __wbg_setIndexBuffer_a400322dea5437f7: function(n, a, l, _) {
    getObject(n).setIndexBuffer(getObject(a), __wbindgen_enum_GpuIndexFormat[l], _);
  }, __wbg_setPipeline_c91e0c8670443991: function(n, a) {
    getObject(n).setPipeline(getObject(a));
  }, __wbg_setPipeline_e6ea6756d71b19a7: function(n, a) {
    getObject(n).setPipeline(getObject(a));
  }, __wbg_setPointerCapture_b6e6a21fc0db7621: function() {
    return handleError(function(n, a) {
      getObject(n).setPointerCapture(a);
    }, arguments);
  }, __wbg_setProperty_ef29d2aa64a04d2b: function() {
    return handleError(function(n, a, l, _, o) {
      getObject(n).setProperty(getStringFromWasm0(a, l), getStringFromWasm0(_, o));
    }, arguments);
  }, __wbg_setScissorRect_eeb4f61d4b860d7a: function(n, a, l, _, o) {
    getObject(n).setScissorRect(a >>> 0, l >>> 0, _ >>> 0, o >>> 0);
  }, __wbg_setStencilReference_54f732c89e8ab296: function(n, a) {
    getObject(n).setStencilReference(a >>> 0);
  }, __wbg_setTimeout_647865935a499f8b: function() {
    return handleError(function(n, a) {
      return getObject(n).setTimeout(getObject(a));
    }, arguments);
  }, __wbg_setTimeout_7f7035ad0b026458: function() {
    return handleError(function(n, a, l) {
      return getObject(n).setTimeout(getObject(a), l);
    }, arguments);
  }, __wbg_setTimeout_ef24d2fc3ad97385: function() {
    return handleError(function(n, a) {
      const l = setTimeout(getObject(n), a);
      return addHeapObject(l);
    }, arguments);
  }, __wbg_setVertexBuffer_58f30a4873b36907: function(n, a, l, _) {
    getObject(n).setVertexBuffer(a >>> 0, getObject(l), _);
  }, __wbg_setVertexBuffer_7aa508f017477005: function(n, a, l, _, o) {
    getObject(n).setVertexBuffer(a >>> 0, getObject(l), _, o);
  }, __wbg_setViewport_014b4c4d1101ba6b: function(n, a, l, _, o, s, j) {
    getObject(n).setViewport(a, l, _, o, s, j);
  }, __wbg_set_361bc2460da3016f: function(n, a, l) {
    getObject(n).set(getArrayF32FromWasm0(a, l));
  }, __wbg_set_7eaa4f96924fd6b3: function() {
    return handleError(function(n, a, l) {
      return Reflect.set(getObject(n), getObject(a), getObject(l));
    }, arguments);
  }, __wbg_set_8c0b3ffcf05d61c2: function(n, a, l) {
    getObject(n).set(getArrayU8FromWasm0(a, l));
  }, __wbg_set_a_6f1653ca7319cdcf: function(n, a) {
    getObject(n).a = a;
  }, __wbg_set_access_cbee993a36feed10: function(n, a) {
    getObject(n).access = __wbindgen_enum_GpuStorageTextureAccess[a];
  }, __wbg_set_address_mode_u_38e255cd89ce1977: function(n, a) {
    getObject(n).addressModeU = __wbindgen_enum_GpuAddressMode[a];
  }, __wbg_set_address_mode_v_513f843d6e3c9dbd: function(n, a) {
    getObject(n).addressModeV = __wbindgen_enum_GpuAddressMode[a];
  }, __wbg_set_address_mode_w_801f70901a90ed5a: function(n, a) {
    getObject(n).addressModeW = __wbindgen_enum_GpuAddressMode[a];
  }, __wbg_set_alpha_0a28ffc800461787: function(n, a) {
    getObject(n).alpha = getObject(a);
  }, __wbg_set_alpha_mode_55b4f33e93691fe8: function(n, a) {
    getObject(n).alphaMode = __wbindgen_enum_GpuCanvasAlphaMode[a];
  }, __wbg_set_alpha_to_coverage_enabled_ec44695cc0d0e961: function(n, a) {
    getObject(n).alphaToCoverageEnabled = a !== 0;
  }, __wbg_set_array_layer_count_e774b6d4a5334e63: function(n, a) {
    getObject(n).arrayLayerCount = a >>> 0;
  }, __wbg_set_array_stride_11c840b41b728354: function(n, a) {
    getObject(n).arrayStride = a;
  }, __wbg_set_aspect_2503cdfcdcc17373: function(n, a) {
    getObject(n).aspect = __wbindgen_enum_GpuTextureAspect[a];
  }, __wbg_set_aspect_b3563bd83d526df0: function(n, a) {
    getObject(n).aspect = __wbindgen_enum_GpuTextureAspect[a];
  }, __wbg_set_attributes_ac1030b589bf253a: function(n, a) {
    getObject(n).attributes = getObject(a);
  }, __wbg_set_auto_increment_ffc3cd6470763a4c: function(n, a) {
    getObject(n).autoIncrement = a !== 0;
  }, __wbg_set_b_d5b23064b0492744: function(n, a) {
    getObject(n).b = a;
  }, __wbg_set_base_array_layer_f64cdadf250d1a9b: function(n, a) {
    getObject(n).baseArrayLayer = a >>> 0;
  }, __wbg_set_base_mip_level_74fc97c2aaf8fc33: function(n, a) {
    getObject(n).baseMipLevel = a >>> 0;
  }, __wbg_set_beginning_of_pass_write_index_348e7f2f53a86db0: function(n, a) {
    getObject(n).beginningOfPassWriteIndex = a >>> 0;
  }, __wbg_set_beginning_of_pass_write_index_880bdf30cfb151c3: function(n, a) {
    getObject(n).beginningOfPassWriteIndex = a >>> 0;
  }, __wbg_set_binaryType_3dcf8281ec100a8f: function(n, a) {
    getObject(n).binaryType = __wbindgen_enum_BinaryType[a];
  }, __wbg_set_bind_group_layouts_6f13eb021a550053: function(n, a) {
    getObject(n).bindGroupLayouts = getObject(a);
  }, __wbg_set_binding_2240d98479c0c256: function(n, a) {
    getObject(n).binding = a >>> 0;
  }, __wbg_set_binding_5296904f2a4c7e25: function(n, a) {
    getObject(n).binding = a >>> 0;
  }, __wbg_set_blend_4aea897cd7d3c0f8: function(n, a) {
    getObject(n).blend = getObject(a);
  }, __wbg_set_body_a3d856b097dfda04: function(n, a) {
    getObject(n).body = getObject(a);
  }, __wbg_set_box_6a730e6c216d512c: function(n, a) {
    getObject(n).box = __wbindgen_enum_ResizeObserverBoxOptions[a];
  }, __wbg_set_buffer_2e7d1f7814caf92b: function(n, a) {
    getObject(n).buffer = getObject(a);
  }, __wbg_set_buffer_ba8ed06078d347f7: function(n, a) {
    getObject(n).buffer = getObject(a);
  }, __wbg_set_buffer_ea42becad62e7650: function(n, a) {
    getObject(n).buffer = getObject(a);
  }, __wbg_set_buffer_fc9285180932669f: function(n, a) {
    getObject(n).buffer = getObject(a);
  }, __wbg_set_buffers_72754529595d4bc0: function(n, a) {
    getObject(n).buffers = getObject(a);
  }, __wbg_set_bytes_per_row_5fedf5a2d44b8482: function(n, a) {
    getObject(n).bytesPerRow = a >>> 0;
  }, __wbg_set_bytes_per_row_9425e8d6a11b52dc: function(n, a) {
    getObject(n).bytesPerRow = a >>> 0;
  }, __wbg_set_channelCount_77970d0435dc29e3: function(n, a) {
    getObject(n).channelCount = a >>> 0;
  }, __wbg_set_clear_value_1171de96edbc21fe: function(n, a) {
    getObject(n).clearValue = getObject(a);
  }, __wbg_set_code_27a25a855d3fbc6d: function(n, a, l) {
    getObject(n).code = getStringFromWasm0(a, l);
  }, __wbg_set_color_attachments_4516b6dfb4ad987b: function(n, a) {
    getObject(n).colorAttachments = getObject(a);
  }, __wbg_set_color_f2ac28bdc576c010: function(n, a) {
    getObject(n).color = getObject(a);
  }, __wbg_set_compare_2c8ee8ccaa2b6b5d: function(n, a) {
    getObject(n).compare = __wbindgen_enum_GpuCompareFunction[a];
  }, __wbg_set_compare_cbf49b43d3211833: function(n, a) {
    getObject(n).compare = __wbindgen_enum_GpuCompareFunction[a];
  }, __wbg_set_compute_e8ed640c578ae016: function(n, a) {
    getObject(n).compute = getObject(a);
  }, __wbg_set_count_53854513da5c0e04: function(n, a) {
    getObject(n).count = a >>> 0;
  }, __wbg_set_count_b424874e36f62c59: function(n, a) {
    getObject(n).count = a >>> 0;
  }, __wbg_set_cull_mode_3852dd4cff56dd90: function(n, a) {
    getObject(n).cullMode = __wbindgen_enum_GpuCullMode[a];
  }, __wbg_set_cursor_8d686ff9dd99a325: function(n, a, l) {
    getObject(n).cursor = getStringFromWasm0(a, l);
  }, __wbg_set_depth_bias_c20861a58fc2b8d9: function(n, a) {
    getObject(n).depthBias = a;
  }, __wbg_set_depth_bias_clamp_eecc04d702f9402e: function(n, a) {
    getObject(n).depthBiasClamp = a;
  }, __wbg_set_depth_bias_slope_scale_b2a251d3d4c65018: function(n, a) {
    getObject(n).depthBiasSlopeScale = a;
  }, __wbg_set_depth_clear_value_fca9e379a0cdff8f: function(n, a) {
    getObject(n).depthClearValue = a;
  }, __wbg_set_depth_compare_7883e52aad39b925: function(n, a) {
    getObject(n).depthCompare = __wbindgen_enum_GpuCompareFunction[a];
  }, __wbg_set_depth_fail_op_1d11c8e03d061484: function(n, a) {
    getObject(n).depthFailOp = __wbindgen_enum_GpuStencilOperation[a];
  }, __wbg_set_depth_load_op_7e95e67c69e09c5e: function(n, a) {
    getObject(n).depthLoadOp = __wbindgen_enum_GpuLoadOp[a];
  }, __wbg_set_depth_or_array_layers_36ef1df107b6b651: function(n, a) {
    getObject(n).depthOrArrayLayers = a >>> 0;
  }, __wbg_set_depth_read_only_0c5e726b56520b08: function(n, a) {
    getObject(n).depthReadOnly = a !== 0;
  }, __wbg_set_depth_stencil_17e2d1710f4e07ae: function(n, a) {
    getObject(n).depthStencil = getObject(a);
  }, __wbg_set_depth_stencil_attachment_a7b5eca74b7ddcfb: function(n, a) {
    getObject(n).depthStencilAttachment = getObject(a);
  }, __wbg_set_depth_store_op_1b4cc257f121a4e7: function(n, a) {
    getObject(n).depthStoreOp = __wbindgen_enum_GpuStoreOp[a];
  }, __wbg_set_depth_write_enabled_1551f99ae66d959e: function(n, a) {
    getObject(n).depthWriteEnabled = a !== 0;
  }, __wbg_set_device_846227515bb0301a: function(n, a) {
    getObject(n).device = getObject(a);
  }, __wbg_set_dimension_7454baa9c745cf06: function(n, a) {
    getObject(n).dimension = __wbindgen_enum_GpuTextureDimension[a];
  }, __wbg_set_dimension_9d314669636abc65: function(n, a) {
    getObject(n).dimension = __wbindgen_enum_GpuTextureViewDimension[a];
  }, __wbg_set_dst_factor_8397030245674624: function(n, a) {
    getObject(n).dstFactor = __wbindgen_enum_GpuBlendFactor[a];
  }, __wbg_set_duration_bfef0b021dc8fd5b: function(n, a) {
    getObject(n).duration = a;
  }, __wbg_set_e09648bea3f1af1e: function() {
    return handleError(function(n, a, l, _, o) {
      getObject(n).set(getStringFromWasm0(a, l), getStringFromWasm0(_, o));
    }, arguments);
  }, __wbg_set_e80615d7a9a43981: function(n, a, l) {
    getObject(n).set(getObject(a), l >>> 0);
  }, __wbg_set_end_of_pass_write_index_4600a261d0317ecb: function(n, a) {
    getObject(n).endOfPassWriteIndex = a >>> 0;
  }, __wbg_set_end_of_pass_write_index_9fec09fcc7da1609: function(n, a) {
    getObject(n).endOfPassWriteIndex = a >>> 0;
  }, __wbg_set_entries_4d13c932343146c3: function(n, a) {
    getObject(n).entries = getObject(a);
  }, __wbg_set_entries_7e6b569918b11bf4: function(n, a) {
    getObject(n).entries = getObject(a);
  }, __wbg_set_entry_point_7248ed25fb9070c7: function(n, a, l) {
    getObject(n).entryPoint = getStringFromWasm0(a, l);
  }, __wbg_set_entry_point_b01eb3970a1dcb95: function(n, a, l) {
    getObject(n).entryPoint = getStringFromWasm0(a, l);
  }, __wbg_set_entry_point_c8f041069c527ff6: function(n, a, l) {
    getObject(n).entryPoint = getStringFromWasm0(a, l);
  }, __wbg_set_external_texture_cf6cf39036321145: function(n, a) {
    getObject(n).externalTexture = getObject(a);
  }, __wbg_set_fail_op_ac8f2b4c077715b1: function(n, a) {
    getObject(n).failOp = __wbindgen_enum_GpuStencilOperation[a];
  }, __wbg_set_flip_y_1d6eb3a87c41d6ba: function(n, a) {
    getObject(n).flipY = a !== 0;
  }, __wbg_set_format_12bcbdd3428cd4b5: function(n, a) {
    getObject(n).format = __wbindgen_enum_GpuTextureFormat[a];
  }, __wbg_set_format_1fc8a436841b29c8: function(n, a) {
    getObject(n).format = __wbindgen_enum_GpuTextureFormat[a];
  }, __wbg_set_format_2a42ed14de233ae5: function(n, a) {
    getObject(n).format = __wbindgen_enum_GpuVertexFormat[a];
  }, __wbg_set_format_3759d043ddc658d4: function(n, a) {
    getObject(n).format = __wbindgen_enum_GpuTextureFormat[a];
  }, __wbg_set_format_b08e529cc1612d7b: function(n, a) {
    getObject(n).format = __wbindgen_enum_GpuTextureFormat[a];
  }, __wbg_set_format_e0cf5a237864edb6: function(n, a) {
    getObject(n).format = __wbindgen_enum_GpuTextureFormat[a];
  }, __wbg_set_format_ffa0a97f114a945a: function(n, a) {
    getObject(n).format = __wbindgen_enum_GpuTextureFormat[a];
  }, __wbg_set_fragment_703ddd6f5db6e4af: function(n, a) {
    getObject(n).fragment = getObject(a);
  }, __wbg_set_front_face_17a3723085696d9a: function(n, a) {
    getObject(n).frontFace = __wbindgen_enum_GpuFrontFace[a];
  }, __wbg_set_g_4cc3b3e3231ca6f8: function(n, a) {
    getObject(n).g = a;
  }, __wbg_set_has_dynamic_offset_dc25aba64b9bd3ff: function(n, a) {
    getObject(n).hasDynamicOffset = a !== 0;
  }, __wbg_set_height_98a1a397672657e2: function(n, a) {
    getObject(n).height = a >>> 0;
  }, __wbg_set_height_ac705ece3aa08c95: function(n, a) {
    getObject(n).height = a >>> 0;
  }, __wbg_set_height_b6548a01bdcb689a: function(n, a) {
    getObject(n).height = a >>> 0;
  }, __wbg_set_iterations_b84d4d3302a291a0: function(n, a) {
    getObject(n).iterations = a;
  }, __wbg_set_key_path_3c45a8ff0b89e678: function(n, a) {
    getObject(n).keyPath = getObject(a);
  }, __wbg_set_label_10bd19b972ff1ba6: function(n, a, l) {
    getObject(n).label = getStringFromWasm0(a, l);
  }, __wbg_set_label_16cff4ff3c381368: function(n, a, l) {
    getObject(n).label = getStringFromWasm0(a, l);
  }, __wbg_set_label_343ceab4761679d7: function(n, a, l) {
    getObject(n).label = getStringFromWasm0(a, l);
  }, __wbg_set_label_403725ced930414e: function(n, a, l) {
    getObject(n).label = getStringFromWasm0(a, l);
  }, __wbg_set_label_62b82f9361718fb9: function(n, a, l) {
    getObject(n).label = getStringFromWasm0(a, l);
  }, __wbg_set_label_6afa181067c4da56: function(n, a, l) {
    getObject(n).label = getStringFromWasm0(a, l);
  }, __wbg_set_label_7d448e8a777d0d37: function(n, a, l) {
    getObject(n).label = getStringFromWasm0(a, l);
  }, __wbg_set_label_900e563567315063: function(n, a, l) {
    getObject(n).label = getStringFromWasm0(a, l);
  }, __wbg_set_label_98bef61fcbcecdde: function(n, a, l) {
    getObject(n).label = getStringFromWasm0(a, l);
  }, __wbg_set_label_9d2ce197e447a967: function(n, a, l) {
    getObject(n).label = getStringFromWasm0(a, l);
  }, __wbg_set_label_a19e77f79a88d021: function(n, a, l) {
    getObject(n).label = getStringFromWasm0(a, l);
  }, __wbg_set_label_b5d7ff5f8e4fbaac: function(n, a, l) {
    getObject(n).label = getStringFromWasm0(a, l);
  }, __wbg_set_label_ba288fbac1259847: function(n, a, l) {
    getObject(n).label = getStringFromWasm0(a, l);
  }, __wbg_set_label_e135ef1842fb45f8: function(n, a, l) {
    getObject(n).label = getStringFromWasm0(a, l);
  }, __wbg_set_label_e1bd2437f39d21f3: function(n, a, l) {
    getObject(n).label = getStringFromWasm0(a, l);
  }, __wbg_set_label_e4debe6dc9ea319b: function(n, a, l) {
    getObject(n).label = getStringFromWasm0(a, l);
  }, __wbg_set_layout_53be3643dc5dbbbe: function(n, a) {
    getObject(n).layout = getObject(a);
  }, __wbg_set_layout_bb56309555eaa472: function(n, a) {
    getObject(n).layout = getObject(a);
  }, __wbg_set_layout_ca5f863d331bb6b4: function(n, a) {
    getObject(n).layout = getObject(a);
  }, __wbg_set_load_op_91d2cbf2912c96fd: function(n, a) {
    getObject(n).loadOp = __wbindgen_enum_GpuLoadOp[a];
  }, __wbg_set_lod_max_clamp_01800ff5df00cc8e: function(n, a) {
    getObject(n).lodMaxClamp = a;
  }, __wbg_set_lod_min_clamp_fe71be084b04bd97: function(n, a) {
    getObject(n).lodMinClamp = a;
  }, __wbg_set_mag_filter_a6df09d1943d5caa: function(n, a) {
    getObject(n).magFilter = __wbindgen_enum_GpuFilterMode[a];
  }, __wbg_set_mapped_at_creation_eb954cf5fdb9bc25: function(n, a) {
    getObject(n).mappedAtCreation = a !== 0;
  }, __wbg_set_mask_47a41aae6631771f: function(n, a) {
    getObject(n).mask = a >>> 0;
  }, __wbg_set_max_anisotropy_418bd200a56097a0: function(n, a) {
    getObject(n).maxAnisotropy = a;
  }, __wbg_set_method_8c015e8bcafd7be1: function(n, a, l) {
    getObject(n).method = getStringFromWasm0(a, l);
  }, __wbg_set_min_binding_size_d0315b751370234c: function(n, a) {
    getObject(n).minBindingSize = a;
  }, __wbg_set_min_filter_5b27a7eb3f5ea88a: function(n, a) {
    getObject(n).minFilter = __wbindgen_enum_GpuFilterMode[a];
  }, __wbg_set_mip_level_b50dccbd04935c98: function(n, a) {
    getObject(n).mipLevel = a >>> 0;
  }, __wbg_set_mip_level_count_307eb64d9d29e3a6: function(n, a) {
    getObject(n).mipLevelCount = a >>> 0;
  }, __wbg_set_mip_level_count_fe7f73daa6021aaa: function(n, a) {
    getObject(n).mipLevelCount = a >>> 0;
  }, __wbg_set_mip_level_d9ab998d69d5e023: function(n, a) {
    getObject(n).mipLevel = a >>> 0;
  }, __wbg_set_mipmap_filter_e1543204e8199db0: function(n, a) {
    getObject(n).mipmapFilter = __wbindgen_enum_GpuMipmapFilterMode[a];
  }, __wbg_set_mode_21d9616e340ea5b3: function(n, a) {
    getObject(n).mode = __wbindgen_enum_ReadableStreamReaderMode[a];
  }, __wbg_set_mode_5a87f2c809cf37c2: function(n, a) {
    getObject(n).mode = __wbindgen_enum_RequestMode[a];
  }, __wbg_set_module_46b766d7fbe021b2: function(n, a) {
    getObject(n).module = getObject(a);
  }, __wbg_set_module_9afd1b80ff72cee9: function(n, a) {
    getObject(n).module = getObject(a);
  }, __wbg_set_module_ffe8f8e909e9fdcf: function(n, a) {
    getObject(n).module = getObject(a);
  }, __wbg_set_multi_entry_38c253febe05d3be: function(n, a) {
    getObject(n).multiEntry = a !== 0;
  }, __wbg_set_multisample_957afdd96685c6f5: function(n, a) {
    getObject(n).multisample = getObject(a);
  }, __wbg_set_multisampled_84e304d3a68838ea: function(n, a) {
    getObject(n).multisampled = a !== 0;
  }, __wbg_set_name_02d633afec2e2bf0: function(n, a, l) {
    getObject(n).name = getStringFromWasm0(a, l);
  }, __wbg_set_offset_157c6bc4fd6ec4b1: function(n, a) {
    getObject(n).offset = a;
  }, __wbg_set_offset_3e78f3e530cf8049: function(n, a) {
    getObject(n).offset = a;
  }, __wbg_set_offset_616ad7dfa51d50e0: function(n, a) {
    getObject(n).offset = a;
  }, __wbg_set_offset_bea112c360dc7f2b: function(n, a) {
    getObject(n).offset = a;
  }, __wbg_set_onabort_63885d8d7841a8d5: function(n, a) {
    getObject(n).onabort = getObject(a);
  }, __wbg_set_onclose_8da801226bdd7a7b: function(n, a) {
    getObject(n).onclose = getObject(a);
  }, __wbg_set_oncomplete_f31e6dc6d16c1ff8: function(n, a) {
    getObject(n).oncomplete = getObject(a);
  }, __wbg_set_onended_c6277da5931bd62f: function(n, a) {
    getObject(n).onended = getObject(a);
  }, __wbg_set_onerror_8a268cb237177bba: function(n, a) {
    getObject(n).onerror = getObject(a);
  }, __wbg_set_onerror_901ca711f94a5bbb: function(n, a) {
    getObject(n).onerror = getObject(a);
  }, __wbg_set_onerror_c1ecd6233c533c08: function(n, a) {
    getObject(n).onerror = getObject(a);
  }, __wbg_set_onmessage_6f80ab771bf151aa: function(n, a) {
    getObject(n).onmessage = getObject(a);
  }, __wbg_set_onmessage_d5dc11c291025af6: function(n, a) {
    getObject(n).onmessage = getObject(a);
  }, __wbg_set_onmessage_f939f8b6d08ca76b: function(n, a) {
    getObject(n).onmessage = getObject(a);
  }, __wbg_set_onopen_34e3e24cf9337ddd: function(n, a) {
    getObject(n).onopen = getObject(a);
  }, __wbg_set_onsuccess_fca94ded107b64af: function(n, a) {
    getObject(n).onsuccess = getObject(a);
  }, __wbg_set_onupgradeneeded_860ce42184f987e7: function(n, a) {
    getObject(n).onupgradeneeded = getObject(a);
  }, __wbg_set_onversionchange_3d88930f82c97b92: function(n, a) {
    getObject(n).onversionchange = getObject(a);
  }, __wbg_set_operation_6c5fd88df90bc7b2: function(n, a) {
    getObject(n).operation = __wbindgen_enum_GpuBlendOperation[a];
  }, __wbg_set_option_algorithm_raw_693274bd7f1275e0: function(n, a) {
    getObject(n).algorithm = takeObject(a);
  }, __wbg_set_option_allow_pooling_aa637fc7f2e488b1: function(n, a) {
    getObject(n).allowPooling = a === 16777215 ? void 0 : a !== 0;
  }, __wbg_set_option_close_code_624c19c1530f917c: function(n, a) {
    getObject(n).closeCode = a === 4294967297 ? void 0 : a;
  }, __wbg_set_option_congestion_control_4478d1afecc84e6f: function(n, a) {
    getObject(n).congestionControl = __wbindgen_enum_WebTransportCongestionControl[a];
  }, __wbg_set_option_reason_20a082bfbba4ec8b: function(n, a) {
    getObject(n).reason = takeObject(a);
  }, __wbg_set_option_require_unreliable_203c3fdb2d312c57: function(n, a) {
    getObject(n).requireUnreliable = a === 16777215 ? void 0 : a !== 0;
  }, __wbg_set_option_server_certificate_hashes_ca5163033476c253: function(n, a, l) {
    let _;
    a !== 0 && (_ = getArrayJsValueFromWasm0(a, l).slice(), wasm.__wbindgen_export4(a, l * 4, 4)), getObject(n).serverCertificateHashes = _;
  }, __wbg_set_option_value_raw_3f4b8318e07ec20d: function(n, a) {
    getObject(n).value = takeObject(a);
  }, __wbg_set_origin_7c6c9e1dcff651b0: function(n, a) {
    getObject(n).origin = getObject(a);
  }, __wbg_set_origin_dec4f4c36f9f79f6: function(n, a) {
    getObject(n).origin = getObject(a);
  }, __wbg_set_origin_e31287868acd44a7: function(n, a) {
    getObject(n).origin = getObject(a);
  }, __wbg_set_pass_op_461dabd5ee4ea1b7: function(n, a) {
    getObject(n).passOp = __wbindgen_enum_GpuStencilOperation[a];
  }, __wbg_set_power_preference_a4ce891b22ea2b05: function(n, a) {
    getObject(n).powerPreference = __wbindgen_enum_GpuPowerPreference[a];
  }, __wbg_set_premultiplied_alpha_be0cbc761719bedb: function(n, a) {
    getObject(n).premultipliedAlpha = a !== 0;
  }, __wbg_set_premultiply_alpha_696b545e0615f655: function(n, a) {
    getObject(n).premultiplyAlpha = __wbindgen_enum_PremultiplyAlpha[a];
  }, __wbg_set_primitive_eb8abbc5e7f278a4: function(n, a) {
    getObject(n).primitive = getObject(a);
  }, __wbg_set_query_set_849fb32875f137d7: function(n, a) {
    getObject(n).querySet = getObject(a);
  }, __wbg_set_query_set_c65a8f4d74f562f6: function(n, a) {
    getObject(n).querySet = getObject(a);
  }, __wbg_set_r_5fa0f548248c394c: function(n, a) {
    getObject(n).r = a;
  }, __wbg_set_required_features_98a83c7003fd73d5: function(n, a) {
    getObject(n).requiredFeatures = getObject(a);
  }, __wbg_set_resolve_target_1ff405e060e2d32e: function(n, a) {
    getObject(n).resolveTarget = getObject(a);
  }, __wbg_set_resource_1409c14d4d6b5a50: function(n, a) {
    getObject(n).resource = getObject(a);
  }, __wbg_set_rows_per_image_8104dfe1b042a530: function(n, a) {
    getObject(n).rowsPerImage = a >>> 0;
  }, __wbg_set_rows_per_image_9cfda8920e669db0: function(n, a) {
    getObject(n).rowsPerImage = a >>> 0;
  }, __wbg_set_sample_count_95a9892a60894677: function(n, a) {
    getObject(n).sampleCount = a >>> 0;
  }, __wbg_set_sample_rate_88fa12f3b8a6ae94: function(n, a) {
    getObject(n).sampleRate = a;
  }, __wbg_set_sample_type_f8f7b39d62e7b29c: function(n, a) {
    getObject(n).sampleType = __wbindgen_enum_GpuTextureSampleType[a];
  }, __wbg_set_sampler_a2277e90dfe7395f: function(n, a) {
    getObject(n).sampler = getObject(a);
  }, __wbg_set_shader_location_cdbcf5cf84a6cbcb: function(n, a) {
    getObject(n).shaderLocation = a >>> 0;
  }, __wbg_set_size_6f271c4c28c18e1b: function(n, a) {
    getObject(n).size = getObject(a);
  }, __wbg_set_size_7ec162511b3bad1f: function(n, a) {
    getObject(n).size = a;
  }, __wbg_set_size_ca765d983baccefd: function(n, a) {
    getObject(n).size = a;
  }, __wbg_set_source_d4bc460599114f45: function(n, a) {
    getObject(n).source = getObject(a);
  }, __wbg_set_src_f257a96103ac1ac6: function(n, a, l) {
    getObject(n).src = getStringFromWasm0(a, l);
  }, __wbg_set_src_factor_e96f05a25f8383ed: function(n, a) {
    getObject(n).srcFactor = __wbindgen_enum_GpuBlendFactor[a];
  }, __wbg_set_stencil_back_5c8971274cbcddcf: function(n, a) {
    getObject(n).stencilBack = getObject(a);
  }, __wbg_set_stencil_clear_value_89ba97b367fa1385: function(n, a) {
    getObject(n).stencilClearValue = a >>> 0;
  }, __wbg_set_stencil_front_69f85bf4a6f02cb2: function(n, a) {
    getObject(n).stencilFront = getObject(a);
  }, __wbg_set_stencil_load_op_a3e2c3a6f20d4da5: function(n, a) {
    getObject(n).stencilLoadOp = __wbindgen_enum_GpuLoadOp[a];
  }, __wbg_set_stencil_read_mask_86a08afb2665c29b: function(n, a) {
    getObject(n).stencilReadMask = a >>> 0;
  }, __wbg_set_stencil_read_only_dd058fe8c6a1f6ae: function(n, a) {
    getObject(n).stencilReadOnly = a !== 0;
  }, __wbg_set_stencil_store_op_87c97415636844c9: function(n, a) {
    getObject(n).stencilStoreOp = __wbindgen_enum_GpuStoreOp[a];
  }, __wbg_set_stencil_write_mask_7844d8a057a87a58: function(n, a) {
    getObject(n).stencilWriteMask = a >>> 0;
  }, __wbg_set_step_mode_285f2e428148f3b4: function(n, a) {
    getObject(n).stepMode = __wbindgen_enum_GpuVertexStepMode[a];
  }, __wbg_set_storage_texture_373b9fc0e534dd33: function(n, a) {
    getObject(n).storageTexture = getObject(a);
  }, __wbg_set_store_op_94575f47253d270d: function(n, a) {
    getObject(n).storeOp = __wbindgen_enum_GpuStoreOp[a];
  }, __wbg_set_strip_index_format_aeb7aa0e95e6285d: function(n, a) {
    getObject(n).stripIndexFormat = __wbindgen_enum_GpuIndexFormat[a];
  }, __wbg_set_targets_93553735385af349: function(n, a) {
    getObject(n).targets = getObject(a);
  }, __wbg_set_texture_6003a9e79918bf8a: function(n, a) {
    getObject(n).texture = getObject(a);
  }, __wbg_set_texture_935130bd6b12578e: function(n, a) {
    getObject(n).texture = getObject(a);
  }, __wbg_set_texture_c5a457625c071b25: function(n, a) {
    getObject(n).texture = getObject(a);
  }, __wbg_set_timestamp_writes_0603b32a31ee6205: function(n, a) {
    getObject(n).timestampWrites = getObject(a);
  }, __wbg_set_timestamp_writes_f0a806787f57efc4: function(n, a) {
    getObject(n).timestampWrites = getObject(a);
  }, __wbg_set_topology_5e4eb809635ea291: function(n, a) {
    getObject(n).topology = __wbindgen_enum_GpuPrimitiveTopology[a];
  }, __wbg_set_type_0e707d4c06fc2b7b: function(n, a) {
    getObject(n).type = __wbindgen_enum_GpuSamplerBindingType[a];
  }, __wbg_set_type_33e79f1b45a78c37: function(n, a, l) {
    getObject(n).type = getStringFromWasm0(a, l);
  }, __wbg_set_type_6fe4c5f460401ee0: function(n, a) {
    getObject(n).type = __wbindgen_enum_GpuBufferBindingType[a];
  }, __wbg_set_type_d6425b2efca08597: function(n, a) {
    getObject(n).type = __wbindgen_enum_GpuQueryType[a];
  }, __wbg_set_unclipped_depth_e9a2451e4fa0277a: function(n, a) {
    getObject(n).unclippedDepth = a !== 0;
  }, __wbg_set_unique_a39d85db47f8e025: function(n, a) {
    getObject(n).unique = a !== 0;
  }, __wbg_set_usage_5abd566becc087bb: function(n, a) {
    getObject(n).usage = a >>> 0;
  }, __wbg_set_usage_61967f166fba5e13: function(n, a) {
    getObject(n).usage = a >>> 0;
  }, __wbg_set_usage_d0a75d4429098a06: function(n, a) {
    getObject(n).usage = a >>> 0;
  }, __wbg_set_usage_f0bb325677668e77: function(n, a) {
    getObject(n).usage = a >>> 0;
  }, __wbg_set_vertex_2525cfcd959b2add: function(n, a) {
    getObject(n).vertex = getObject(a);
  }, __wbg_set_view_57d232eea19739c3: function(n, a) {
    getObject(n).view = getObject(a);
  }, __wbg_set_view_dimension_49cfda500f1dea55: function(n, a) {
    getObject(n).viewDimension = __wbindgen_enum_GpuTextureViewDimension[a];
  }, __wbg_set_view_dimension_a669c29ec3b0813a: function(n, a) {
    getObject(n).viewDimension = __wbindgen_enum_GpuTextureViewDimension[a];
  }, __wbg_set_view_ffadd767d5e9b839: function(n, a) {
    getObject(n).view = getObject(a);
  }, __wbg_set_view_formats_70a1fcabcd34282a: function(n, a) {
    getObject(n).viewFormats = getObject(a);
  }, __wbg_set_view_formats_83865b9cdfda5cb6: function(n, a) {
    getObject(n).viewFormats = getObject(a);
  }, __wbg_set_visibility_088046ee77c33b1d: function(n, a) {
    getObject(n).visibility = a >>> 0;
  }, __wbg_set_width_576343a4a7f2cf28: function(n, a) {
    getObject(n).width = a >>> 0;
  }, __wbg_set_width_c0fcaa2da53cd540: function(n, a) {
    getObject(n).width = a >>> 0;
  }, __wbg_set_width_e96e07f8255ad913: function(n, a) {
    getObject(n).width = a >>> 0;
  }, __wbg_set_write_mask_76041c03688571cd: function(n, a) {
    getObject(n).writeMask = a >>> 0;
  }, __wbg_set_x_dc7ca4677f8c2ee1: function(n, a) {
    getObject(n).x = a >>> 0;
  }, __wbg_set_x_fdd6aca9a2390926: function(n, a) {
    getObject(n).x = a >>> 0;
  }, __wbg_set_y_410a18c5811abf4c: function(n, a) {
    getObject(n).y = a >>> 0;
  }, __wbg_set_y_61cf6ff0f725b3bf: function(n, a) {
    getObject(n).y = a >>> 0;
  }, __wbg_set_z_f7f1ae8afd3a9308: function(n, a) {
    getObject(n).z = a >>> 0;
  }, __wbg_shaderSource_06639e7b476e6ac2: function(n, a, l, _) {
    getObject(n).shaderSource(getObject(a), getStringFromWasm0(l, _));
  }, __wbg_shaderSource_2bca0edc97475e95: function(n, a, l, _) {
    getObject(n).shaderSource(getObject(a), getStringFromWasm0(l, _));
  }, __wbg_shiftKey_5256a2168f9dc186: function(n) {
    return getObject(n).shiftKey;
  }, __wbg_shiftKey_ec106aa0755af421: function(n) {
    return getObject(n).shiftKey;
  }, __wbg_signal_166e1da31adcac18: function(n) {
    const a = getObject(n).signal;
    return addHeapObject(a);
  }, __wbg_size_09f35345b4742a87: function(n) {
    return getObject(n).size;
  }, __wbg_stack_3b0d974bbf31e44f: function(n, a) {
    const l = getObject(a).stack, _ = passStringToWasm0(l, wasm.__wbindgen_export, wasm.__wbindgen_export2), o = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(n + 4, o, true), getDataViewMemory0().setInt32(n + 0, _, true);
  }, __wbg_start_b037850d8eda4626: function() {
    return handleError(function(n, a) {
      getObject(n).start(a);
    }, arguments);
  }, __wbg_start_f837ba2bac4733b5: function(n) {
    getObject(n).start();
  }, __wbg_static_accessor_GLOBAL_8adb955bd33fac2f: function() {
    const n = typeof global > "u" ? null : global;
    return isLikeNone(n) ? 0 : addHeapObject(n);
  }, __wbg_static_accessor_GLOBAL_THIS_ad356e0db91c7913: function() {
    const n = typeof globalThis > "u" ? null : globalThis;
    return isLikeNone(n) ? 0 : addHeapObject(n);
  }, __wbg_static_accessor_SELF_f207c857566db248: function() {
    const n = typeof self > "u" ? null : self;
    return isLikeNone(n) ? 0 : addHeapObject(n);
  }, __wbg_static_accessor_WINDOW_bb9f1ba69d61b386: function() {
    const n = typeof window > "u" ? null : window;
    return isLikeNone(n) ? 0 : addHeapObject(n);
  }, __wbg_status_318629ab93a22955: function(n) {
    return getObject(n).status;
  }, __wbg_stencilFuncSeparate_18642df0574c1930: function(n, a, l, _, o) {
    getObject(n).stencilFuncSeparate(a >>> 0, l >>> 0, _, o >>> 0);
  }, __wbg_stencilFuncSeparate_94ee4fbc164addec: function(n, a, l, _, o) {
    getObject(n).stencilFuncSeparate(a >>> 0, l >>> 0, _, o >>> 0);
  }, __wbg_stencilMaskSeparate_13b0475860a9b559: function(n, a, l) {
    getObject(n).stencilMaskSeparate(a >>> 0, l >>> 0);
  }, __wbg_stencilMaskSeparate_a7bd409376ee05ff: function(n, a, l) {
    getObject(n).stencilMaskSeparate(a >>> 0, l >>> 0);
  }, __wbg_stencilMask_326a11d0928c3808: function(n, a) {
    getObject(n).stencilMask(a >>> 0);
  }, __wbg_stencilMask_6354f8ba392f6581: function(n, a) {
    getObject(n).stencilMask(a >>> 0);
  }, __wbg_stencilOpSeparate_7e819381705b9731: function(n, a, l, _, o) {
    getObject(n).stencilOpSeparate(a >>> 0, l >>> 0, _ >>> 0, o >>> 0);
  }, __wbg_stencilOpSeparate_8627d0f5f7fe5800: function(n, a, l, _, o) {
    getObject(n).stencilOpSeparate(a >>> 0, l >>> 0, _ >>> 0, o >>> 0);
  }, __wbg_stringify_5ae93966a84901ac: function() {
    return handleError(function(n) {
      const a = JSON.stringify(getObject(n));
      return addHeapObject(a);
    }, arguments);
  }, __wbg_style_b01fc765f98b99ff: function(n) {
    const a = getObject(n).style;
    return addHeapObject(a);
  }, __wbg_subarray_a068d24e39478a8a: function(n, a, l) {
    const _ = getObject(n).subarray(a >>> 0, l >>> 0);
    return addHeapObject(_);
  }, __wbg_submit_21302eebe551e30d: function(n, a) {
    getObject(n).submit(getObject(a));
  }, __wbg_target_7bc90f314634b37b: function(n) {
    const a = getObject(n).target;
    return isLikeNone(a) ? 0 : addHeapObject(a);
  }, __wbg_terminate_8d65e3d9758359c7: function(n) {
    getObject(n).terminate();
  }, __wbg_texImage2D_32ed4220040ca614: function() {
    return handleError(function(n, a, l, _, o, s, j, S, x, p) {
      getObject(n).texImage2D(a >>> 0, l, _, o, s, j, S >>> 0, x >>> 0, getObject(p));
    }, arguments);
  }, __wbg_texImage2D_d8c284c813952313: function() {
    return handleError(function(n, a, l, _, o, s, j, S, x, p) {
      getObject(n).texImage2D(a >>> 0, l, _, o, s, j, S >>> 0, x >>> 0, p);
    }, arguments);
  }, __wbg_texImage2D_f4ae6c314a9a4bbe: function() {
    return handleError(function(n, a, l, _, o, s, j, S, x, p) {
      getObject(n).texImage2D(a >>> 0, l, _, o, s, j, S >>> 0, x >>> 0, getObject(p));
    }, arguments);
  }, __wbg_texImage3D_88ff1fa41be127b9: function() {
    return handleError(function(n, a, l, _, o, s, j, S, x, p, H) {
      getObject(n).texImage3D(a >>> 0, l, _, o, s, j, S, x >>> 0, p >>> 0, getObject(H));
    }, arguments);
  }, __wbg_texImage3D_9a207e0459a4f276: function() {
    return handleError(function(n, a, l, _, o, s, j, S, x, p, H) {
      getObject(n).texImage3D(a >>> 0, l, _, o, s, j, S, x >>> 0, p >>> 0, H);
    }, arguments);
  }, __wbg_texParameteri_f4b1596185f5432d: function(n, a, l, _) {
    getObject(n).texParameteri(a >>> 0, l >>> 0, _);
  }, __wbg_texParameteri_fcdec30159061963: function(n, a, l, _) {
    getObject(n).texParameteri(a >>> 0, l >>> 0, _);
  }, __wbg_texStorage2D_a84f74d36d279097: function(n, a, l, _, o, s) {
    getObject(n).texStorage2D(a >>> 0, l, _ >>> 0, o, s);
  }, __wbg_texStorage3D_aec6fc3e85ec72da: function(n, a, l, _, o, s, j) {
    getObject(n).texStorage3D(a >>> 0, l, _ >>> 0, o, s, j);
  }, __wbg_texSubImage2D_1e7d6febf82b9bed: function() {
    return handleError(function(n, a, l, _, o, s, j, S, x, p) {
      getObject(n).texSubImage2D(a >>> 0, l, _, o, s, j, S >>> 0, x >>> 0, getObject(p));
    }, arguments);
  }, __wbg_texSubImage2D_271ffedb47424d0d: function() {
    return handleError(function(n, a, l, _, o, s, j, S, x, p) {
      getObject(n).texSubImage2D(a >>> 0, l, _, o, s, j, S >>> 0, x >>> 0, getObject(p));
    }, arguments);
  }, __wbg_texSubImage2D_3bb41b987f2bfe39: function() {
    return handleError(function(n, a, l, _, o, s, j, S, x, p) {
      getObject(n).texSubImage2D(a >>> 0, l, _, o, s, j, S >>> 0, x >>> 0, getObject(p));
    }, arguments);
  }, __wbg_texSubImage2D_68e0413824eddc12: function() {
    return handleError(function(n, a, l, _, o, s, j, S, x, p) {
      getObject(n).texSubImage2D(a >>> 0, l, _, o, s, j, S >>> 0, x >>> 0, getObject(p));
    }, arguments);
  }, __wbg_texSubImage2D_b6cdbbe62097211a: function() {
    return handleError(function(n, a, l, _, o, s, j, S, x, p) {
      getObject(n).texSubImage2D(a >>> 0, l, _, o, s, j, S >>> 0, x >>> 0, getObject(p));
    }, arguments);
  }, __wbg_texSubImage2D_c8919d8f32f723da: function() {
    return handleError(function(n, a, l, _, o, s, j, S, x, p) {
      getObject(n).texSubImage2D(a >>> 0, l, _, o, s, j, S >>> 0, x >>> 0, getObject(p));
    }, arguments);
  }, __wbg_texSubImage2D_d784df0b813dc1ab: function() {
    return handleError(function(n, a, l, _, o, s, j, S, x, p) {
      getObject(n).texSubImage2D(a >>> 0, l, _, o, s, j, S >>> 0, x >>> 0, p);
    }, arguments);
  }, __wbg_texSubImage2D_dd1d50234b61de4b: function() {
    return handleError(function(n, a, l, _, o, s, j, S, x, p) {
      getObject(n).texSubImage2D(a >>> 0, l, _, o, s, j, S >>> 0, x >>> 0, getObject(p));
    }, arguments);
  }, __wbg_texSubImage3D_09cc863aedf44a21: function() {
    return handleError(function(n, a, l, _, o, s, j, S, x, p, H, z) {
      getObject(n).texSubImage3D(a >>> 0, l, _, o, s, j, S, x, p >>> 0, H >>> 0, getObject(z));
    }, arguments);
  }, __wbg_texSubImage3D_4665e67a8f0f7806: function() {
    return handleError(function(n, a, l, _, o, s, j, S, x, p, H, z) {
      getObject(n).texSubImage3D(a >>> 0, l, _, o, s, j, S, x, p >>> 0, H >>> 0, getObject(z));
    }, arguments);
  }, __wbg_texSubImage3D_61ed187f3ec11ecc: function() {
    return handleError(function(n, a, l, _, o, s, j, S, x, p, H, z) {
      getObject(n).texSubImage3D(a >>> 0, l, _, o, s, j, S, x, p >>> 0, H >>> 0, getObject(z));
    }, arguments);
  }, __wbg_texSubImage3D_6a46981af8bc8e49: function() {
    return handleError(function(n, a, l, _, o, s, j, S, x, p, H, z) {
      getObject(n).texSubImage3D(a >>> 0, l, _, o, s, j, S, x, p >>> 0, H >>> 0, getObject(z));
    }, arguments);
  }, __wbg_texSubImage3D_9eca35d234d51b8a: function() {
    return handleError(function(n, a, l, _, o, s, j, S, x, p, H, z) {
      getObject(n).texSubImage3D(a >>> 0, l, _, o, s, j, S, x, p >>> 0, H >>> 0, getObject(z));
    }, arguments);
  }, __wbg_texSubImage3D_b3cbbb79fe54da6d: function() {
    return handleError(function(n, a, l, _, o, s, j, S, x, p, H, z) {
      getObject(n).texSubImage3D(a >>> 0, l, _, o, s, j, S, x, p >>> 0, H >>> 0, z);
    }, arguments);
  }, __wbg_texSubImage3D_f9c3af789162846a: function() {
    return handleError(function(n, a, l, _, o, s, j, S, x, p, H, z) {
      getObject(n).texSubImage3D(a >>> 0, l, _, o, s, j, S, x, p >>> 0, H >>> 0, getObject(z));
    }, arguments);
  }, __wbg_then_098abe61755d12f6: function(n, a) {
    const l = getObject(n).then(getObject(a));
    return addHeapObject(l);
  }, __wbg_then_1d7a5273811a5cea: function(n, a) {
    const l = getObject(n).then(getObject(a));
    return addHeapObject(l);
  }, __wbg_then_9e335f6dd892bc11: function(n, a, l) {
    const _ = getObject(n).then(getObject(a), getObject(l));
    return addHeapObject(_);
  }, __wbg_then_bc59d1943397ca4e: function(n, a, l) {
    const _ = getObject(n).then(getObject(a), getObject(l));
    return addHeapObject(_);
  }, __wbg_timeOrigin_f3d5cb4f4a06c2b7: function(n) {
    return getObject(n).timeOrigin;
  }, __wbg_toBlob_b7bc2b08e11beff6: function() {
    return handleError(function(n, a) {
      getObject(n).toBlob(getObject(a));
    }, arguments);
  }, __wbg_toString_3272fa0dfd05dd87: function(n) {
    const a = getObject(n).toString();
    return addHeapObject(a);
  }, __wbg_transaction_3223f7c8d0f40129: function() {
    return handleError(function(n, a, l) {
      const _ = getObject(n).transaction(getObject(a), __wbindgen_enum_IdbTransactionMode[l]);
      return addHeapObject(_);
    }, arguments);
  }, __wbg_transaction_fda57653957fee06: function(n) {
    const a = getObject(n).transaction;
    return isLikeNone(a) ? 0 : addHeapObject(a);
  }, __wbg_transferFromImageBitmap_9f9bd42ea0f80770: function(n, a) {
    getObject(n).transferFromImageBitmap(getObject(a));
  }, __wbg_uniform1f_8c3b03df282dba21: function(n, a, l) {
    getObject(n).uniform1f(getObject(a), l);
  }, __wbg_uniform1f_b8841988568406b9: function(n, a, l) {
    getObject(n).uniform1f(getObject(a), l);
  }, __wbg_uniform1i_953040fb972e9fab: function(n, a, l) {
    getObject(n).uniform1i(getObject(a), l);
  }, __wbg_uniform1i_acd89bea81085be4: function(n, a, l) {
    getObject(n).uniform1i(getObject(a), l);
  }, __wbg_uniform1ui_9f8d9b877d6691d8: function(n, a, l) {
    getObject(n).uniform1ui(getObject(a), l >>> 0);
  }, __wbg_uniform2fv_28fbf8836f3045d0: function(n, a, l, _) {
    getObject(n).uniform2fv(getObject(a), getArrayF32FromWasm0(l, _));
  }, __wbg_uniform2fv_f3c92aab21d0dec3: function(n, a, l, _) {
    getObject(n).uniform2fv(getObject(a), getArrayF32FromWasm0(l, _));
  }, __wbg_uniform2iv_892b6d31137ad198: function(n, a, l, _) {
    getObject(n).uniform2iv(getObject(a), getArrayI32FromWasm0(l, _));
  }, __wbg_uniform2iv_f40f632615c5685a: function(n, a, l, _) {
    getObject(n).uniform2iv(getObject(a), getArrayI32FromWasm0(l, _));
  }, __wbg_uniform2uiv_6d170469a702f23e: function(n, a, l, _) {
    getObject(n).uniform2uiv(getObject(a), getArrayU32FromWasm0(l, _));
  }, __wbg_uniform3fv_85a9a17c9635941b: function(n, a, l, _) {
    getObject(n).uniform3fv(getObject(a), getArrayF32FromWasm0(l, _));
  }, __wbg_uniform3fv_cdf7c84f9119f13b: function(n, a, l, _) {
    getObject(n).uniform3fv(getObject(a), getArrayF32FromWasm0(l, _));
  }, __wbg_uniform3iv_38e74d2ae9dfbfb8: function(n, a, l, _) {
    getObject(n).uniform3iv(getObject(a), getArrayI32FromWasm0(l, _));
  }, __wbg_uniform3iv_4c372010ac6def3f: function(n, a, l, _) {
    getObject(n).uniform3iv(getObject(a), getArrayI32FromWasm0(l, _));
  }, __wbg_uniform3uiv_bb7266bb3a5aef96: function(n, a, l, _) {
    getObject(n).uniform3uiv(getObject(a), getArrayU32FromWasm0(l, _));
  }, __wbg_uniform4f_0b00a34f4789ad14: function(n, a, l, _, o, s) {
    getObject(n).uniform4f(getObject(a), l, _, o, s);
  }, __wbg_uniform4f_7275e0fb864b7513: function(n, a, l, _, o, s) {
    getObject(n).uniform4f(getObject(a), l, _, o, s);
  }, __wbg_uniform4fv_a4cdb4bd66867df5: function(n, a, l, _) {
    getObject(n).uniform4fv(getObject(a), getArrayF32FromWasm0(l, _));
  }, __wbg_uniform4fv_c416900acf65eca9: function(n, a, l, _) {
    getObject(n).uniform4fv(getObject(a), getArrayF32FromWasm0(l, _));
  }, __wbg_uniform4iv_b49cd4acf0aa3ebc: function(n, a, l, _) {
    getObject(n).uniform4iv(getObject(a), getArrayI32FromWasm0(l, _));
  }, __wbg_uniform4iv_d654af0e6b7bdb1a: function(n, a, l, _) {
    getObject(n).uniform4iv(getObject(a), getArrayI32FromWasm0(l, _));
  }, __wbg_uniform4uiv_e95d9a124fb8f91e: function(n, a, l, _) {
    getObject(n).uniform4uiv(getObject(a), getArrayU32FromWasm0(l, _));
  }, __wbg_uniformBlockBinding_a47fa267662afd7b: function(n, a, l, _) {
    getObject(n).uniformBlockBinding(getObject(a), l >>> 0, _ >>> 0);
  }, __wbg_uniformMatrix2fv_4229ae27417c649a: function(n, a, l, _, o) {
    getObject(n).uniformMatrix2fv(getObject(a), l !== 0, getArrayF32FromWasm0(_, o));
  }, __wbg_uniformMatrix2fv_648417dd2040de5b: function(n, a, l, _, o) {
    getObject(n).uniformMatrix2fv(getObject(a), l !== 0, getArrayF32FromWasm0(_, o));
  }, __wbg_uniformMatrix2x3fv_eb9a53c8c9aa724b: function(n, a, l, _, o) {
    getObject(n).uniformMatrix2x3fv(getObject(a), l !== 0, getArrayF32FromWasm0(_, o));
  }, __wbg_uniformMatrix2x4fv_8849517a52f2e845: function(n, a, l, _, o) {
    getObject(n).uniformMatrix2x4fv(getObject(a), l !== 0, getArrayF32FromWasm0(_, o));
  }, __wbg_uniformMatrix3fv_244fc4416319c169: function(n, a, l, _, o) {
    getObject(n).uniformMatrix3fv(getObject(a), l !== 0, getArrayF32FromWasm0(_, o));
  }, __wbg_uniformMatrix3fv_bafc2707d0c48e27: function(n, a, l, _, o) {
    getObject(n).uniformMatrix3fv(getObject(a), l !== 0, getArrayF32FromWasm0(_, o));
  }, __wbg_uniformMatrix3x2fv_f1729eb13fcd41a3: function(n, a, l, _, o) {
    getObject(n).uniformMatrix3x2fv(getObject(a), l !== 0, getArrayF32FromWasm0(_, o));
  }, __wbg_uniformMatrix3x4fv_3c11181f5fa929de: function(n, a, l, _, o) {
    getObject(n).uniformMatrix3x4fv(getObject(a), l !== 0, getArrayF32FromWasm0(_, o));
  }, __wbg_uniformMatrix4fv_4d322b295d122214: function(n, a, l, _, o) {
    getObject(n).uniformMatrix4fv(getObject(a), l !== 0, getArrayF32FromWasm0(_, o));
  }, __wbg_uniformMatrix4fv_7c68dee5aee11694: function(n, a, l, _, o) {
    getObject(n).uniformMatrix4fv(getObject(a), l !== 0, getArrayF32FromWasm0(_, o));
  }, __wbg_uniformMatrix4x2fv_5a8701b552d704af: function(n, a, l, _, o) {
    getObject(n).uniformMatrix4x2fv(getObject(a), l !== 0, getArrayF32FromWasm0(_, o));
  }, __wbg_uniformMatrix4x3fv_741c3f4e0b2c7e04: function(n, a, l, _, o) {
    getObject(n).uniformMatrix4x3fv(getObject(a), l !== 0, getArrayF32FromWasm0(_, o));
  }, __wbg_unique_3329c63c37e586a7: function(n) {
    return getObject(n).unique;
  }, __wbg_unmap_b819b8b402db13cc: function(n) {
    getObject(n).unmap();
  }, __wbg_unobserve_397ea595cb8bfdd0: function(n, a) {
    getObject(n).unobserve(getObject(a));
  }, __wbg_usage_34a9bc47ff4a3feb: function(n) {
    return getObject(n).usage;
  }, __wbg_useProgram_49b77c7558a0646a: function(n, a) {
    getObject(n).useProgram(getObject(a));
  }, __wbg_useProgram_5405b431988b837b: function(n, a) {
    getObject(n).useProgram(getObject(a));
  }, __wbg_userAgentData_31b8f893e8977e94: function(n) {
    const a = getObject(n).userAgentData;
    return isLikeNone(a) ? 0 : addHeapObject(a);
  }, __wbg_userAgent_161a5f2d2a8dee61: function() {
    return handleError(function(n, a) {
      const l = getObject(a).userAgent, _ = passStringToWasm0(l, wasm.__wbindgen_export, wasm.__wbindgen_export2), o = WASM_VECTOR_LEN;
      getDataViewMemory0().setInt32(n + 4, o, true), getDataViewMemory0().setInt32(n + 0, _, true);
    }, arguments);
  }, __wbg_value_21fc78aab0322612: function(n) {
    const a = getObject(n).value;
    return addHeapObject(a);
  }, __wbg_value_23545848209ec70e: function(n) {
    const a = getObject(n).value;
    return isLikeNone(a) ? 0 : addHeapObject(a);
  }, __wbg_value_a529cd2f781749fd: function(n) {
    const a = getObject(n).value;
    return addHeapObject(a);
  }, __wbg_value_a7c23a21e935ac89: function(n) {
    const a = getObject(n).value;
    return addHeapObject(a);
  }, __wbg_value_f3d531408c0c70aa: function(n) {
    return getObject(n).value;
  }, __wbg_versions_276b2795b1c6a219: function(n) {
    const a = getObject(n).versions;
    return addHeapObject(a);
  }, __wbg_vertexAttribDivisorANGLE_b357aa2bf70d3dcf: function(n, a, l) {
    getObject(n).vertexAttribDivisorANGLE(a >>> 0, l >>> 0);
  }, __wbg_vertexAttribDivisor_99b2fd5affca539d: function(n, a, l) {
    getObject(n).vertexAttribDivisor(a >>> 0, l >>> 0);
  }, __wbg_vertexAttribIPointer_ecd3baef73ba0965: function(n, a, l, _, o, s) {
    getObject(n).vertexAttribIPointer(a >>> 0, l, _ >>> 0, o, s);
  }, __wbg_vertexAttribPointer_ea73fc4cc5b7d647: function(n, a, l, _, o, s, j) {
    getObject(n).vertexAttribPointer(a >>> 0, l, _ >>> 0, o !== 0, s, j);
  }, __wbg_vertexAttribPointer_f63675d7fad431e6: function(n, a, l, _, o, s, j) {
    getObject(n).vertexAttribPointer(a >>> 0, l, _ >>> 0, o !== 0, s, j);
  }, __wbg_videoHeight_6dac1fd954779498: function(n) {
    return getObject(n).videoHeight;
  }, __wbg_videoWidth_48f094fdc1b5ba64: function(n) {
    return getObject(n).videoWidth;
  }, __wbg_viewport_63ee76a0f029804d: function(n, a, l, _, o) {
    getObject(n).viewport(a, l, _, o);
  }, __wbg_viewport_b60aceadb9166023: function(n, a, l, _, o) {
    getObject(n).viewport(a, l, _, o);
  }, __wbg_visibilityState_8b47c97faee36457: function(n) {
    const a = getObject(n).visibilityState;
    return (__wbindgen_enum_VisibilityState.indexOf(a) + 1 || 3) - 1;
  }, __wbg_waitAsync_91ab9cf292b5ab15: function(n, a, l) {
    const _ = Atomics.waitAsync(getObject(n), a >>> 0, l);
    return addHeapObject(_);
  }, __wbg_waitAsync_a4399d51368b6ce4: function() {
    const n = Atomics.waitAsync;
    return addHeapObject(n);
  }, __wbg_waitAsync_a9d210beb53413c2: function(n, a, l) {
    const _ = Atomics.waitAsync(getObject(n), a >>> 0, l);
    return addHeapObject(_);
  }, __wbg_wait_result_async_e0be1c2ed94dac07: function(n) {
    return wait_result_async(getObject(n));
  }, __wbg_wait_result_value_97c00ae9aaadc48f: function(n) {
    const a = wait_result_value(getObject(n));
    return addHeapObject(a);
  }, __wbg_warn_809cad1bfc2b3a42: function(n, a, l, _) {
    console.warn(getObject(n), getObject(a), getObject(l), getObject(_));
  }, __wbg_webkitExitFullscreen_f487871f11a8185e: function(n) {
    getObject(n).webkitExitFullscreen();
  }, __wbg_webkitFullscreenElement_4055d847f8ff064e: function(n) {
    const a = getObject(n).webkitFullscreenElement;
    return isLikeNone(a) ? 0 : addHeapObject(a);
  }, __wbg_webkitRequestFullscreen_c4ec4df7be373ffd: function(n) {
    getObject(n).webkitRequestFullscreen();
  }, __wbg_width_462295a1353ea71b: function(n) {
    return getObject(n).width;
  }, __wbg_width_4d6fc7fecd877217: function(n) {
    return getObject(n).width;
  }, __wbg_width_6a767700990b90f4: function(n) {
    return getObject(n).width;
  }, __wbg_width_71d9d44b5e14c4b7: function(n) {
    return getObject(n).width;
  }, __wbg_width_9824c1a2c17d3ebd: function(n) {
    return getObject(n).width;
  }, __wbg_width_e0981c16dad36a72: function(n) {
    return getObject(n).width;
  }, __wbg_writable_4aa9e3ac71d54eb9: function(n) {
    const a = getObject(n).writable;
    return addHeapObject(a);
  }, __wbg_writeBuffer_c6919ed0c4aaeef5: function() {
    return handleError(function(n, a, l, _, o, s) {
      getObject(n).writeBuffer(getObject(a), l, getObject(_), o, s);
    }, arguments);
  }, __wbg_writeTexture_340cfbecd9544755: function() {
    return handleError(function(n, a, l, _, o) {
      getObject(n).writeTexture(getObject(a), getObject(l), getObject(_), getObject(o));
    }, arguments);
  }, __wbg_write_6c1ce79b0d7a43ff: function(n, a) {
    const l = getObject(n).write(getObject(a));
    return addHeapObject(l);
  }, __wbg_x_663bdb24f78fdb4f: function(n) {
    return getObject(n).x;
  }, __wbg_y_30a7c06266f44f65: function(n) {
    return getObject(n).y;
  }, __wbindgen_cast_0000000000000001: function(n, a) {
    const l = makeMutClosure(n, a, wasm.__wasm_bindgen_func_elem_13335, __wasm_bindgen_func_elem_13418);
    return addHeapObject(l);
  }, __wbindgen_cast_0000000000000002: function(n, a) {
    const l = makeMutClosure(n, a, wasm.__wasm_bindgen_func_elem_13335, __wasm_bindgen_func_elem_13420);
    return addHeapObject(l);
  }, __wbindgen_cast_0000000000000003: function(n, a) {
    const l = makeMutClosure(n, a, wasm.__wasm_bindgen_func_elem_13698, __wasm_bindgen_func_elem_13702);
    return addHeapObject(l);
  }, __wbindgen_cast_0000000000000004: function(n, a) {
    const l = makeMutClosure(n, a, wasm.__wasm_bindgen_func_elem_126634, __wasm_bindgen_func_elem_126736);
    return addHeapObject(l);
  }, __wbindgen_cast_0000000000000005: function(n, a) {
    const l = makeMutClosure(n, a, wasm.__wasm_bindgen_func_elem_163736, __wasm_bindgen_func_elem_163924);
    return addHeapObject(l);
  }, __wbindgen_cast_0000000000000006: function(n, a) {
    const l = makeMutClosure(n, a, wasm.__wasm_bindgen_func_elem_178458, __wasm_bindgen_func_elem_178478);
    return addHeapObject(l);
  }, __wbindgen_cast_0000000000000007: function(n, a) {
    const l = makeMutClosure(n, a, wasm.__wasm_bindgen_func_elem_188935, __wasm_bindgen_func_elem_188941);
    return addHeapObject(l);
  }, __wbindgen_cast_0000000000000008: function(n, a) {
    const l = makeMutClosure(n, a, wasm.__wasm_bindgen_func_elem_188935, __wasm_bindgen_func_elem_188943);
    return addHeapObject(l);
  }, __wbindgen_cast_0000000000000009: function(n, a) {
    const l = makeMutClosure(n, a, wasm.__wasm_bindgen_func_elem_61880, __wasm_bindgen_func_elem_61969);
    return addHeapObject(l);
  }, __wbindgen_cast_000000000000000a: function(n, a) {
    const l = makeMutClosure(n, a, wasm.__wasm_bindgen_func_elem_61880, __wasm_bindgen_func_elem_61973);
    return addHeapObject(l);
  }, __wbindgen_cast_000000000000000b: function(n, a) {
    const l = makeMutClosure(n, a, wasm.__wasm_bindgen_func_elem_61880, __wasm_bindgen_func_elem_61969_10);
    return addHeapObject(l);
  }, __wbindgen_cast_000000000000000c: function(n, a) {
    const l = makeMutClosure(n, a, wasm.__wasm_bindgen_func_elem_61880, __wasm_bindgen_func_elem_61969_11);
    return addHeapObject(l);
  }, __wbindgen_cast_000000000000000d: function(n, a) {
    const l = makeMutClosure(n, a, wasm.__wasm_bindgen_func_elem_61880, __wasm_bindgen_func_elem_61969_12);
    return addHeapObject(l);
  }, __wbindgen_cast_000000000000000e: function(n, a) {
    const l = makeMutClosure(n, a, wasm.__wasm_bindgen_func_elem_61880, __wasm_bindgen_func_elem_61969_13);
    return addHeapObject(l);
  }, __wbindgen_cast_000000000000000f: function(n, a) {
    const l = makeMutClosure(n, a, wasm.__wasm_bindgen_func_elem_61880, __wasm_bindgen_func_elem_61969_14);
    return addHeapObject(l);
  }, __wbindgen_cast_0000000000000010: function(n, a) {
    const l = makeMutClosure(n, a, wasm.__wasm_bindgen_func_elem_61880, __wasm_bindgen_func_elem_61969_15);
    return addHeapObject(l);
  }, __wbindgen_cast_0000000000000011: function(n, a) {
    const l = makeMutClosure(n, a, wasm.__wasm_bindgen_func_elem_61880, __wasm_bindgen_func_elem_61969_16);
    return addHeapObject(l);
  }, __wbindgen_cast_0000000000000012: function(n, a) {
    const l = makeMutClosure(n, a, wasm.__wasm_bindgen_func_elem_61880, __wasm_bindgen_func_elem_61968);
    return addHeapObject(l);
  }, __wbindgen_cast_0000000000000013: function(n, a) {
    const l = makeMutClosure(n, a, wasm.__wasm_bindgen_func_elem_61880, __wasm_bindgen_func_elem_61981);
    return addHeapObject(l);
  }, __wbindgen_cast_0000000000000014: function(n, a) {
    const l = makeMutClosure(n, a, wasm.__wasm_bindgen_func_elem_8246, __wasm_bindgen_func_elem_8252);
    return addHeapObject(l);
  }, __wbindgen_cast_0000000000000015: function(n, a) {
    const l = makeMutClosure(n, a, wasm.__wasm_bindgen_func_elem_8274, __wasm_bindgen_func_elem_8294);
    return addHeapObject(l);
  }, __wbindgen_cast_0000000000000016: function(n, a) {
    const l = makeMutClosure(n, a, wasm.__wasm_bindgen_func_elem_11302, __wasm_bindgen_func_elem_11307);
    return addHeapObject(l);
  }, __wbindgen_cast_0000000000000017: function(n, a) {
    const l = makeMutClosure(n, a, wasm.__wasm_bindgen_func_elem_12416, __wasm_bindgen_func_elem_12479);
    return addHeapObject(l);
  }, __wbindgen_cast_0000000000000018: function(n, a) {
    const l = makeMutClosure(n, a, wasm.__wasm_bindgen_func_elem_12416, __wasm_bindgen_func_elem_12479_23);
    return addHeapObject(l);
  }, __wbindgen_cast_0000000000000019: function(n, a) {
    const l = makeMutClosure(n, a, wasm.__wasm_bindgen_func_elem_12416, __wasm_bindgen_func_elem_12479_24);
    return addHeapObject(l);
  }, __wbindgen_cast_000000000000001a: function(n, a) {
    const l = makeMutClosure(n, a, wasm.__wasm_bindgen_func_elem_116235, __wasm_bindgen_func_elem_116262);
    return addHeapObject(l);
  }, __wbindgen_cast_000000000000001b: function(n) {
    return addHeapObject(n);
  }, __wbindgen_cast_000000000000001c: function(n) {
    return addHeapObject(n);
  }, __wbindgen_cast_000000000000001d: function(n, a) {
    const l = getArrayF32FromWasm0(n, a);
    return addHeapObject(l);
  }, __wbindgen_cast_000000000000001e: function(n, a) {
    const l = getArrayI16FromWasm0(n, a);
    return addHeapObject(l);
  }, __wbindgen_cast_000000000000001f: function(n, a) {
    const l = getArrayI32FromWasm0(n, a);
    return addHeapObject(l);
  }, __wbindgen_cast_0000000000000020: function(n, a) {
    const l = getArrayI8FromWasm0(n, a);
    return addHeapObject(l);
  }, __wbindgen_cast_0000000000000021: function(n, a) {
    const l = getArrayU16FromWasm0(n, a);
    return addHeapObject(l);
  }, __wbindgen_cast_0000000000000022: function(n, a) {
    const l = getArrayU32FromWasm0(n, a);
    return addHeapObject(l);
  }, __wbindgen_cast_0000000000000023: function(n, a) {
    const l = getArrayU8FromWasm0(n, a);
    return addHeapObject(l);
  }, __wbindgen_cast_0000000000000024: function(n, a) {
    const l = getStringFromWasm0(n, a);
    return addHeapObject(l);
  }, __wbindgen_cast_0000000000000025: function(n) {
    const a = BigInt.asUintN(64, n);
    return addHeapObject(a);
  }, __wbindgen_link_fcd7cf2a23e346d3: function(n) {
    const a = `onmessage = function (ev) {
                let [ia, index, value] = ev.data;
                ia = new Int32Array(ia.buffer);
                let result = Atomics.wait(ia, index, value);
                postMessage(result);
            };
            `, l = typeof URL.createObjectURL > "u" ? "data:application/javascript," + encodeURIComponent(a) : URL.createObjectURL(new Blob([a], { type: "text/javascript" })), _ = passStringToWasm0(l, wasm.__wbindgen_export, wasm.__wbindgen_export2), o = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(n + 4, o, true), getDataViewMemory0().setInt32(n + 0, _, true);
  }, __wbindgen_object_clone_ref: function(n) {
    const a = getObject(n);
    return addHeapObject(a);
  }, __wbindgen_object_drop_ref: function(n) {
    takeObject(n);
  }, memory: memory || new WebAssembly.Memory({ initial: 125, maximum: 65536, shared: true }) };
  return { __proto__: null, "./isometric_game_bg.js": import0 };
}
const lAudioContext = typeof AudioContext < "u" ? AudioContext : typeof webkitAudioContext < "u" ? webkitAudioContext : void 0;
function __wasm_bindgen_func_elem_13702(n, a) {
  wasm.__wasm_bindgen_func_elem_13702(n, a);
}
function __wasm_bindgen_func_elem_178478(n, a) {
  wasm.__wasm_bindgen_func_elem_178478(n, a);
}
function __wasm_bindgen_func_elem_61981(n, a) {
  wasm.__wasm_bindgen_func_elem_61981(n, a);
}
function __wasm_bindgen_func_elem_116262(n, a) {
  wasm.__wasm_bindgen_func_elem_116262(n, a);
}
function __wasm_bindgen_func_elem_13418(n, a, l) {
  wasm.__wasm_bindgen_func_elem_13418(n, a, addHeapObject(l));
}
function __wasm_bindgen_func_elem_126736(n, a, l) {
  wasm.__wasm_bindgen_func_elem_126736(n, a, addHeapObject(l));
}
function __wasm_bindgen_func_elem_163924(n, a, l) {
  wasm.__wasm_bindgen_func_elem_163924(n, a, addHeapObject(l));
}
function __wasm_bindgen_func_elem_188943(n, a, l) {
  wasm.__wasm_bindgen_func_elem_188943(n, a, addHeapObject(l));
}
function __wasm_bindgen_func_elem_61969(n, a, l) {
  wasm.__wasm_bindgen_func_elem_61969(n, a, addHeapObject(l));
}
function __wasm_bindgen_func_elem_61969_10(n, a, l) {
  wasm.__wasm_bindgen_func_elem_61969_10(n, a, addHeapObject(l));
}
function __wasm_bindgen_func_elem_61969_11(n, a, l) {
  wasm.__wasm_bindgen_func_elem_61969_11(n, a, addHeapObject(l));
}
function __wasm_bindgen_func_elem_61969_12(n, a, l) {
  wasm.__wasm_bindgen_func_elem_61969_12(n, a, addHeapObject(l));
}
function __wasm_bindgen_func_elem_61969_13(n, a, l) {
  wasm.__wasm_bindgen_func_elem_61969_13(n, a, addHeapObject(l));
}
function __wasm_bindgen_func_elem_61969_14(n, a, l) {
  wasm.__wasm_bindgen_func_elem_61969_14(n, a, addHeapObject(l));
}
function __wasm_bindgen_func_elem_61969_15(n, a, l) {
  wasm.__wasm_bindgen_func_elem_61969_15(n, a, addHeapObject(l));
}
function __wasm_bindgen_func_elem_61969_16(n, a, l) {
  wasm.__wasm_bindgen_func_elem_61969_16(n, a, addHeapObject(l));
}
function __wasm_bindgen_func_elem_61968(n, a, l) {
  wasm.__wasm_bindgen_func_elem_61968(n, a, isLikeNone(l) ? 0 : addHeapObject(l));
}
function __wasm_bindgen_func_elem_8252(n, a, l) {
  wasm.__wasm_bindgen_func_elem_8252(n, a, addHeapObject(l));
}
function __wasm_bindgen_func_elem_8294(n, a, l) {
  wasm.__wasm_bindgen_func_elem_8294(n, a, addHeapObject(l));
}
function __wasm_bindgen_func_elem_11307(n, a, l) {
  wasm.__wasm_bindgen_func_elem_11307(n, a, addHeapObject(l));
}
function __wasm_bindgen_func_elem_12479(n, a, l) {
  wasm.__wasm_bindgen_func_elem_12479(n, a, addHeapObject(l));
}
function __wasm_bindgen_func_elem_12479_23(n, a, l) {
  wasm.__wasm_bindgen_func_elem_12479_23(n, a, addHeapObject(l));
}
function __wasm_bindgen_func_elem_12479_24(n, a, l) {
  wasm.__wasm_bindgen_func_elem_12479_24(n, a, addHeapObject(l));
}
function __wasm_bindgen_func_elem_13420(n, a, l) {
  try {
    const s = wasm.__wbindgen_add_to_stack_pointer(-16);
    wasm.__wasm_bindgen_func_elem_13420(s, n, a, addHeapObject(l));
    var _ = getDataViewMemory0().getInt32(s + 0, true), o = getDataViewMemory0().getInt32(s + 4, true);
    if (o) throw takeObject(_);
  } finally {
    wasm.__wbindgen_add_to_stack_pointer(16);
  }
}
function __wasm_bindgen_func_elem_188941(n, a, l) {
  try {
    const s = wasm.__wbindgen_add_to_stack_pointer(-16);
    wasm.__wasm_bindgen_func_elem_188941(s, n, a, addHeapObject(l));
    var _ = getDataViewMemory0().getInt32(s + 0, true), o = getDataViewMemory0().getInt32(s + 4, true);
    if (o) throw takeObject(_);
  } finally {
    wasm.__wbindgen_add_to_stack_pointer(16);
  }
}
function __wasm_bindgen_func_elem_61973(n, a, l, _) {
  wasm.__wasm_bindgen_func_elem_61973(n, a, addHeapObject(l), addHeapObject(_));
}
function __wasm_bindgen_func_elem_192522(n, a, l, _) {
  wasm.__wasm_bindgen_func_elem_192522(n, a, addHeapObject(l), addHeapObject(_));
}
const __wbindgen_enum_BinaryType = ["blob", "arraybuffer"], __wbindgen_enum_GamepadMappingType = ["", "standard"], __wbindgen_enum_GpuAddressMode = ["clamp-to-edge", "repeat", "mirror-repeat"], __wbindgen_enum_GpuBlendFactor = ["zero", "one", "src", "one-minus-src", "src-alpha", "one-minus-src-alpha", "dst", "one-minus-dst", "dst-alpha", "one-minus-dst-alpha", "src-alpha-saturated", "constant", "one-minus-constant", "src1", "one-minus-src1", "src1-alpha", "one-minus-src1-alpha"], __wbindgen_enum_GpuBlendOperation = ["add", "subtract", "reverse-subtract", "min", "max"], __wbindgen_enum_GpuBufferBindingType = ["uniform", "storage", "read-only-storage"], __wbindgen_enum_GpuCanvasAlphaMode = ["opaque", "premultiplied"], __wbindgen_enum_GpuCompareFunction = ["never", "less", "equal", "less-equal", "greater", "not-equal", "greater-equal", "always"], __wbindgen_enum_GpuCullMode = ["none", "front", "back"], __wbindgen_enum_GpuErrorFilter = ["validation", "out-of-memory", "internal"], __wbindgen_enum_GpuFilterMode = ["nearest", "linear"], __wbindgen_enum_GpuFrontFace = ["ccw", "cw"], __wbindgen_enum_GpuIndexFormat = ["uint16", "uint32"], __wbindgen_enum_GpuLoadOp = ["load", "clear"], __wbindgen_enum_GpuMipmapFilterMode = ["nearest", "linear"], __wbindgen_enum_GpuPowerPreference = ["low-power", "high-performance"], __wbindgen_enum_GpuPrimitiveTopology = ["point-list", "line-list", "line-strip", "triangle-list", "triangle-strip"], __wbindgen_enum_GpuQueryType = ["occlusion", "timestamp"], __wbindgen_enum_GpuSamplerBindingType = ["filtering", "non-filtering", "comparison"], __wbindgen_enum_GpuStencilOperation = ["keep", "zero", "replace", "invert", "increment-clamp", "decrement-clamp", "increment-wrap", "decrement-wrap"], __wbindgen_enum_GpuStorageTextureAccess = ["write-only", "read-only", "read-write"], __wbindgen_enum_GpuStoreOp = ["store", "discard"], __wbindgen_enum_GpuTextureAspect = ["all", "stencil-only", "depth-only"], __wbindgen_enum_GpuTextureDimension = ["1d", "2d", "3d"], __wbindgen_enum_GpuTextureFormat = ["r8unorm", "r8snorm", "r8uint", "r8sint", "r16uint", "r16sint", "r16float", "rg8unorm", "rg8snorm", "rg8uint", "rg8sint", "r32uint", "r32sint", "r32float", "rg16uint", "rg16sint", "rg16float", "rgba8unorm", "rgba8unorm-srgb", "rgba8snorm", "rgba8uint", "rgba8sint", "bgra8unorm", "bgra8unorm-srgb", "rgb9e5ufloat", "rgb10a2uint", "rgb10a2unorm", "rg11b10ufloat", "rg32uint", "rg32sint", "rg32float", "rgba16uint", "rgba16sint", "rgba16float", "rgba32uint", "rgba32sint", "rgba32float", "stencil8", "depth16unorm", "depth24plus", "depth24plus-stencil8", "depth32float", "depth32float-stencil8", "bc1-rgba-unorm", "bc1-rgba-unorm-srgb", "bc2-rgba-unorm", "bc2-rgba-unorm-srgb", "bc3-rgba-unorm", "bc3-rgba-unorm-srgb", "bc4-r-unorm", "bc4-r-snorm", "bc5-rg-unorm", "bc5-rg-snorm", "bc6h-rgb-ufloat", "bc6h-rgb-float", "bc7-rgba-unorm", "bc7-rgba-unorm-srgb", "etc2-rgb8unorm", "etc2-rgb8unorm-srgb", "etc2-rgb8a1unorm", "etc2-rgb8a1unorm-srgb", "etc2-rgba8unorm", "etc2-rgba8unorm-srgb", "eac-r11unorm", "eac-r11snorm", "eac-rg11unorm", "eac-rg11snorm", "astc-4x4-unorm", "astc-4x4-unorm-srgb", "astc-5x4-unorm", "astc-5x4-unorm-srgb", "astc-5x5-unorm", "astc-5x5-unorm-srgb", "astc-6x5-unorm", "astc-6x5-unorm-srgb", "astc-6x6-unorm", "astc-6x6-unorm-srgb", "astc-8x5-unorm", "astc-8x5-unorm-srgb", "astc-8x6-unorm", "astc-8x6-unorm-srgb", "astc-8x8-unorm", "astc-8x8-unorm-srgb", "astc-10x5-unorm", "astc-10x5-unorm-srgb", "astc-10x6-unorm", "astc-10x6-unorm-srgb", "astc-10x8-unorm", "astc-10x8-unorm-srgb", "astc-10x10-unorm", "astc-10x10-unorm-srgb", "astc-12x10-unorm", "astc-12x10-unorm-srgb", "astc-12x12-unorm", "astc-12x12-unorm-srgb"], __wbindgen_enum_GpuTextureSampleType = ["float", "unfilterable-float", "depth", "sint", "uint"], __wbindgen_enum_GpuTextureViewDimension = ["1d", "2d", "2d-array", "cube", "cube-array", "3d"], __wbindgen_enum_GpuVertexFormat = ["uint8", "uint8x2", "uint8x4", "sint8", "sint8x2", "sint8x4", "unorm8", "unorm8x2", "unorm8x4", "snorm8", "snorm8x2", "snorm8x4", "uint16", "uint16x2", "uint16x4", "sint16", "sint16x2", "sint16x4", "unorm16", "unorm16x2", "unorm16x4", "snorm16", "snorm16x2", "snorm16x4", "float16", "float16x2", "float16x4", "float32", "float32x2", "float32x3", "float32x4", "uint32", "uint32x2", "uint32x3", "uint32x4", "sint32", "sint32x2", "sint32x3", "sint32x4", "unorm10-10-10-2", "unorm8x4-bgra"], __wbindgen_enum_GpuVertexStepMode = ["vertex", "instance"], __wbindgen_enum_IdbTransactionMode = ["readonly", "readwrite", "versionchange", "readwriteflush", "cleanup"], __wbindgen_enum_PremultiplyAlpha = ["none", "premultiply", "default"], __wbindgen_enum_ReadableStreamReaderMode = ["byob"], __wbindgen_enum_RequestMode = ["same-origin", "no-cors", "cors", "navigate"], __wbindgen_enum_ResizeObserverBoxOptions = ["border-box", "content-box", "device-pixel-content-box"], __wbindgen_enum_VisibilityState = ["hidden", "visible"], __wbindgen_enum_WebTransportCongestionControl = ["default", "throughput", "low-latency"];
function addHeapObject(n) {
  heap_next === heap.length && heap.push(heap.length + 1);
  const a = heap_next;
  return heap_next = heap[a], heap[a] = n, a;
}
const CLOSURE_DTORS = typeof FinalizationRegistry > "u" ? { register: () => {
}, unregister: () => {
} } : new FinalizationRegistry((n) => n.dtor(n.a, n.b));
function debugString(n) {
  const a = typeof n;
  if (a == "number" || a == "boolean" || n == null) return `${n}`;
  if (a == "string") return `"${n}"`;
  if (a == "symbol") {
    const o = n.description;
    return o == null ? "Symbol" : `Symbol(${o})`;
  }
  if (a == "function") {
    const o = n.name;
    return typeof o == "string" && o.length > 0 ? `Function(${o})` : "Function";
  }
  if (Array.isArray(n)) {
    const o = n.length;
    let s = "[";
    o > 0 && (s += debugString(n[0]));
    for (let j = 1; j < o; j++) s += ", " + debugString(n[j]);
    return s += "]", s;
  }
  const l = /\[object ([^\]]+)\]/.exec(toString.call(n));
  let _;
  if (l && l.length > 1) _ = l[1];
  else return toString.call(n);
  if (_ == "Object") try {
    return "Object(" + JSON.stringify(n) + ")";
  } catch {
    return "Object";
  }
  return n instanceof Error ? `${n.name}: ${n.message}
${n.stack}` : _;
}
function dropObject(n) {
  n < 1028 || (heap[n] = heap_next, heap_next = n);
}
function getArrayF32FromWasm0(n, a) {
  return n = n >>> 0, getFloat32ArrayMemory0().subarray(n / 4, n / 4 + a);
}
function getArrayI16FromWasm0(n, a) {
  return n = n >>> 0, getInt16ArrayMemory0().subarray(n / 2, n / 2 + a);
}
function getArrayI32FromWasm0(n, a) {
  return n = n >>> 0, getInt32ArrayMemory0().subarray(n / 4, n / 4 + a);
}
function getArrayI8FromWasm0(n, a) {
  return n = n >>> 0, getInt8ArrayMemory0().subarray(n / 1, n / 1 + a);
}
function getArrayJsValueFromWasm0(n, a) {
  n = n >>> 0;
  const l = getDataViewMemory0(), _ = [];
  for (let o = n; o < n + 4 * a; o += 4) _.push(takeObject(l.getUint32(o, true)));
  return _;
}
function getArrayU16FromWasm0(n, a) {
  return n = n >>> 0, getUint16ArrayMemory0().subarray(n / 2, n / 2 + a);
}
function getArrayU32FromWasm0(n, a) {
  return n = n >>> 0, getUint32ArrayMemory0().subarray(n / 4, n / 4 + a);
}
function getArrayU8FromWasm0(n, a) {
  return n = n >>> 0, getUint8ArrayMemory0().subarray(n / 1, n / 1 + a);
}
let cachedDataViewMemory0 = null;
function getDataViewMemory0() {
  return (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer !== wasm.memory.buffer) && (cachedDataViewMemory0 = new DataView(wasm.memory.buffer)), cachedDataViewMemory0;
}
let cachedFloat32ArrayMemory0 = null;
function getFloat32ArrayMemory0() {
  return (cachedFloat32ArrayMemory0 === null || cachedFloat32ArrayMemory0.buffer !== wasm.memory.buffer) && (cachedFloat32ArrayMemory0 = new Float32Array(wasm.memory.buffer)), cachedFloat32ArrayMemory0;
}
let cachedInt16ArrayMemory0 = null;
function getInt16ArrayMemory0() {
  return (cachedInt16ArrayMemory0 === null || cachedInt16ArrayMemory0.buffer !== wasm.memory.buffer) && (cachedInt16ArrayMemory0 = new Int16Array(wasm.memory.buffer)), cachedInt16ArrayMemory0;
}
let cachedInt32ArrayMemory0 = null;
function getInt32ArrayMemory0() {
  return (cachedInt32ArrayMemory0 === null || cachedInt32ArrayMemory0.buffer !== wasm.memory.buffer) && (cachedInt32ArrayMemory0 = new Int32Array(wasm.memory.buffer)), cachedInt32ArrayMemory0;
}
let cachedInt8ArrayMemory0 = null;
function getInt8ArrayMemory0() {
  return (cachedInt8ArrayMemory0 === null || cachedInt8ArrayMemory0.buffer !== wasm.memory.buffer) && (cachedInt8ArrayMemory0 = new Int8Array(wasm.memory.buffer)), cachedInt8ArrayMemory0;
}
function getStringFromWasm0(n, a) {
  return n = n >>> 0, decodeText(n, a);
}
let cachedUint16ArrayMemory0 = null;
function getUint16ArrayMemory0() {
  return (cachedUint16ArrayMemory0 === null || cachedUint16ArrayMemory0.buffer !== wasm.memory.buffer) && (cachedUint16ArrayMemory0 = new Uint16Array(wasm.memory.buffer)), cachedUint16ArrayMemory0;
}
let cachedUint32ArrayMemory0 = null;
function getUint32ArrayMemory0() {
  return (cachedUint32ArrayMemory0 === null || cachedUint32ArrayMemory0.buffer !== wasm.memory.buffer) && (cachedUint32ArrayMemory0 = new Uint32Array(wasm.memory.buffer)), cachedUint32ArrayMemory0;
}
let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
  return (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.buffer !== wasm.memory.buffer) && (cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer)), cachedUint8ArrayMemory0;
}
function getObject(n) {
  return heap[n];
}
function handleError(n, a) {
  try {
    return n.apply(this, a);
  } catch (l) {
    wasm.__wbindgen_export3(addHeapObject(l));
  }
}
let heap = new Array(1024).fill(void 0);
heap.push(void 0, null, true, false);
let heap_next = heap.length;
function isLikeNone(n) {
  return n == null;
}
function makeMutClosure(n, a, l, _) {
  const o = { a: n, b: a, cnt: 1, dtor: l }, s = (...j) => {
    o.cnt++;
    const S = o.a;
    o.a = 0;
    try {
      return _(S, o.b, ...j);
    } finally {
      o.a = S, s._wbg_cb_unref();
    }
  };
  return s._wbg_cb_unref = () => {
    --o.cnt === 0 && (o.dtor(o.a, o.b), o.a = 0, CLOSURE_DTORS.unregister(o));
  }, CLOSURE_DTORS.register(s, o, o), s;
}
function passStringToWasm0(n, a, l) {
  if (l === void 0) {
    const S = cachedTextEncoder.encode(n), x = a(S.length, 1) >>> 0;
    return getUint8ArrayMemory0().subarray(x, x + S.length).set(S), WASM_VECTOR_LEN = S.length, x;
  }
  let _ = n.length, o = a(_, 1) >>> 0;
  const s = getUint8ArrayMemory0();
  let j = 0;
  for (; j < _; j++) {
    const S = n.charCodeAt(j);
    if (S > 127) break;
    s[o + j] = S;
  }
  if (j !== _) {
    j !== 0 && (n = n.slice(j)), o = l(o, _, _ = j + n.length * 3, 1) >>> 0;
    const S = getUint8ArrayMemory0().subarray(o + j, o + _), x = cachedTextEncoder.encodeInto(n, S);
    j += x.written, o = l(o, _, j, 1) >>> 0;
  }
  return WASM_VECTOR_LEN = j, o;
}
function takeObject(n) {
  const a = getObject(n);
  return dropObject(n), a;
}
let cachedTextDecoder = typeof TextDecoder < "u" ? new TextDecoder("utf-8", { ignoreBOM: true, fatal: true }) : void 0;
cachedTextDecoder && cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(n, a) {
  return numBytesDecoded += a, numBytesDecoded >= MAX_SAFARI_DECODE_BYTES && (cachedTextDecoder = new TextDecoder("utf-8", { ignoreBOM: true, fatal: true }), cachedTextDecoder.decode(), numBytesDecoded = a), cachedTextDecoder.decode(getUint8ArrayMemory0().slice(n, n + a));
}
const cachedTextEncoder = typeof TextEncoder < "u" ? new TextEncoder() : void 0;
cachedTextEncoder && (cachedTextEncoder.encodeInto = function(n, a) {
  const l = cachedTextEncoder.encode(n);
  return a.set(l), { read: n.length, written: l.length };
});
let WASM_VECTOR_LEN = 0, wasm;
function __wbg_finalize_init(n, a, l) {
  if (wasm = n.exports, cachedDataViewMemory0 = null, cachedFloat32ArrayMemory0 = null, cachedInt16ArrayMemory0 = null, cachedInt32ArrayMemory0 = null, cachedInt8ArrayMemory0 = null, cachedUint16ArrayMemory0 = null, cachedUint32ArrayMemory0 = null, cachedUint8ArrayMemory0 = null, typeof l < "u" && (typeof l != "number" || l === 0 || l % 65536 !== 0)) throw new Error("invalid stack size");
  return wasm.__wbindgen_start(l), wasm;
}
async function __wbg_load(n, a) {
  if (typeof Response == "function" && n instanceof Response) {
    if (typeof WebAssembly.instantiateStreaming == "function") try {
      return await WebAssembly.instantiateStreaming(n, a);
    } catch (o) {
      if (n.ok && l(n.type) && n.headers.get("Content-Type") !== "application/wasm") console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", o);
      else throw o;
    }
    const _ = await n.arrayBuffer();
    return await WebAssembly.instantiate(_, a);
  } else {
    const _ = await WebAssembly.instantiate(n, a);
    return _ instanceof WebAssembly.Instance ? { instance: _, module: n } : _;
  }
  function l(_) {
    switch (_) {
      case "basic":
      case "cors":
      case "default":
        return true;
    }
    return false;
  }
}
async function __wbg_init(n, a) {
  if (wasm !== void 0) return wasm;
  let l;
  n !== void 0 && (Object.getPrototypeOf(n) === Object.prototype ? { module_or_path: n, memory: a, thread_stack_size: l } = n : console.warn("using deprecated parameters for the initialization function; pass a single object instead")), n === void 0 && (n = new URL("/isometric/assets/isometric_game_bg.wasm", import.meta.url));
  const _ = __wbg_get_imports(a);
  (typeof n == "string" || typeof Request == "function" && n instanceof Request || typeof URL == "function" && n instanceof URL) && (n = fetch(n));
  const { instance: o, module: s } = await __wbg_load(await n, _);
  return __wbg_finalize_init(o, s, l);
}
const isometric_game = Object.freeze(Object.defineProperty({ __proto__: null, default: __wbg_init, dispatch_action, get_fps, get_hovered_object_json, get_inventory_json, get_player_state_json, get_selected_object_json }, Symbol.toStringTag, { value: "Module" }));
function GlassPanel({ children: n, className: a = "" }) {
  return jsxRuntimeExports.jsx("div", { className: `bg-glass backdrop-blur-[4px] rounded-glass border border-glass-border shadow-glass pointer-events-auto ${a}`, children: n });
}
function HUD() {
  const [n, a] = reactExports.useState(null);
  return reactExports.useEffect(() => {
    const l = setInterval(() => {
      try {
        const _ = get_player_state_json();
        _ && a(JSON.parse(_));
      } catch {
      }
    }, 250);
    return () => clearInterval(l);
  }, []), n ? jsxRuntimeExports.jsx(GlassPanel, { className: "absolute top-12 right-4 md:top-14 md:right-6 px-3 py-1.5 md:px-4 md:py-2 pointer-events-none", children: jsxRuntimeExports.jsxs("div", { className: "text-[7px] md:text-[9px] text-text-muted", children: ["Pos: ", n.position.map((l) => l.toFixed(1)).join(", ")] }) }) : null;
}
function useInventory() {
  const [n, a] = reactExports.useState(null);
  return reactExports.useEffect(() => {
    const l = setInterval(() => {
      try {
        const _ = get_inventory_json();
        if (!_) return;
        a(JSON.parse(_));
      } catch {
      }
    }, 200);
    return () => clearInterval(l);
  }, []), n;
}
const GRID_COLS = 4, GRID_ROWS = 4, TOTAL_SLOTS = GRID_COLS * GRID_ROWS, ITEM_ICONS = { log: "\u{1FAB5}", stone: "\u{1FAA8}", mossy_stone: "\u{1FAA8}", copper_ore: "\u{1F7E4}", iron_ore: "\u2B1B", crystal_ore: "\u{1F7E3}", tulip: "\u{1F337}", daisy: "\u{1F33C}", lavender: "\u{1F49C}", bellflower: "\u{1F514}", wildflower: "\u{1F33B}", sunflower: "\u{1F33B}", rose: "\u{1F339}", cornflower: "\u{1F499}", allium: "\u{1F7E3}", blue_orchid: "\u{1F48E}", porcini: "\u{1F344}", chanterelle: "\u{1F344}", fly_agaric: "\u{1F344}" }, ITEM_SHORT_NAMES = { log: "Log", stone: "Stn", mossy_stone: "Mss", copper_ore: "Cu", iron_ore: "Fe", crystal_ore: "Cry", tulip: "Tlp", daisy: "Dsy", lavender: "Lvn", bellflower: "Bel", wildflower: "Wld", sunflower: "Sun", rose: "Rse", cornflower: "Crn", allium: "All", blue_orchid: "Orc", porcini: "Por", chanterelle: "Chn", fly_agaric: "Fly" };
function Inventory() {
  var _a;
  const [n, a] = reactExports.useState(false), _ = ((_a = useInventory()) == null ? void 0 : _a.items) ?? [];
  return jsxRuntimeExports.jsxs("div", { className: "absolute bottom-40 right-4 md:bottom-44 md:right-6 pointer-events-auto", children: [jsxRuntimeExports.jsx("button", { onClick: () => a(!n), className: `block ml-auto mb-1 px-2 py-1 text-[8px] md:text-[10px]
					bg-panel-inner border-2 border-panel-border text-[#c8a832]
					shadow-[0_0_0_1px_#1a1008,0_2px_6px_rgba(0,0,0,0.5)]
					hover:bg-[#2a1c0c] active:bg-[#1a1008] transition-colors`, children: n ? "Close" : "Bag" }), n && jsxRuntimeExports.jsx("div", { className: "border-[3px] border-panel-border shadow-[0_0_0_1px_#1a1008,0_4px_12px_rgba(0,0,0,0.6)]", children: jsxRuntimeExports.jsxs("div", { className: "border-2 border-[#1a1008] bg-panel-inner p-2 md:p-3", children: [jsxRuntimeExports.jsx("div", { className: "text-[7px] md:text-[10px] mb-1.5 md:mb-2 text-center text-[#c8a832]", children: "Inventory" }), jsxRuntimeExports.jsx("div", { className: "p-1 md:p-1.5 bg-[#1e1408] border border-[#5a4a2a]", children: jsxRuntimeExports.jsx("div", { className: "grid grid-cols-4 gap-px md:gap-0.5", children: Array.from({ length: TOTAL_SLOTS }).map((o, s) => {
    const j = _[s];
    return jsxRuntimeExports.jsx("div", { className: `w-7 h-7 md:w-11 md:h-11 bg-[#261a0a] border border-[#3d2b14]
												shadow-[inset_0_1px_2px_rgba(0,0,0,0.4)]
												flex flex-col items-center justify-center relative`, children: j && jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [jsxRuntimeExports.jsx("span", { className: "text-[10px] md:text-[14px] leading-none", children: ITEM_ICONS[j.kind] ?? "?" }), jsxRuntimeExports.jsx("span", { className: "text-[5px] md:text-[7px] text-text-muted leading-none mt-px", children: ITEM_SHORT_NAMES[j.kind] ?? j.kind }), j.quantity > 1 && jsxRuntimeExports.jsx("span", { className: "absolute bottom-0 right-0.5 text-[5px] md:text-[7px] text-[#c8a832] leading-none", children: j.quantity })] }) }, s);
  }) }) })] }) })] });
}
function FPSCounter() {
  const [n, a] = reactExports.useState(0);
  return reactExports.useEffect(() => {
    const l = setInterval(() => {
      try {
        a(get_fps());
      } catch {
      }
    }, 1e3);
    return () => clearInterval(l);
  }, []), jsxRuntimeExports.jsxs("div", { className: "absolute top-12 left-4 md:top-14 md:left-6 px-2 py-1 md:px-3 md:py-1.5 bg-panel border border-panel-border text-[7px] md:text-[10px] text-text-muted pointer-events-auto", children: [n, " FPS"] });
}
const CAMERA_OFFSET = [15, 20, 15], VIEWPORT_HEIGHT = 20;
function computeCameraAxes() {
  const n = [-15, -20, -15], a = Math.sqrt(n[0] ** 2 + n[1] ** 2 + n[2] ** 2);
  n[0] /= a, n[1] /= a, n[2] /= a;
  const l = [0, 1, 0], _ = [n[1] * l[2] - n[2] * l[1], n[2] * l[0] - n[0] * l[2], n[0] * l[1] - n[1] * l[0]], o = Math.sqrt(_[0] ** 2 + _[1] ** 2 + _[2] ** 2);
  _[0] /= o, _[1] /= o, _[2] /= o;
  const s = [_[1] * n[2] - _[2] * n[1], _[2] * n[0] - _[0] * n[2], _[0] * n[1] - _[1] * n[0]];
  return { right: _, up: s, forward: n };
}
const AXES = computeCameraAxes();
function dot(n, a) {
  return n[0] * a[0] + n[1] * a[1] + n[2] * a[2];
}
function worldToScreen(n, a, l, _) {
  const o = [n[0] - a[0], n[1] - a[1], n[2] - a[2]], s = VIEWPORT_HEIGHT / 2, j = l / _, S = s * j, x = dot(o, AXES.right) / S, p = dot(o, AXES.up) / s;
  return Math.abs(x) > 1.2 || Math.abs(p) > 1.2 ? null : { x: (x + 1) / 2 * l, y: (1 - p) / 2 * _ };
}
const OBJECT_NAMES = { tree: "Tree", crate: "Wooden Crate", crystal: "Crystal", pillar: "Stone Pillar", sphere: "Metallic Sphere", flower: "Flower", rock: "Rock", mushroom: "Mushroom" }, FLOWER_NAMES = { tulip: "Tulip", daisy: "Daisy", lavender: "Lavender", bell: "Bellflower", wildflower: "Wildflower", sunflower: "Sunflower", rose: "Rose", cornflower: "Cornflower", allium: "Allium", blue_orchid: "Blue Orchid" }, ROCK_NAMES = { boulder: "Boulder", mossy_rock: "Mossy Rock", ore_copper: "Copper Ore", ore_iron: "Iron Ore", ore_crystal: "Crystal Ore" }, MUSHROOM_NAMES = { porcini: "Porcini", chanterelle: "Chanterelle", fly_agaric: "Fly Agaric" };
function ObjectLabel() {
  const [n, a] = reactExports.useState(null);
  return reactExports.useEffect(() => {
    const l = setInterval(() => {
      try {
        const _ = get_hovered_object_json();
        if (!_) {
          a(null);
          return;
        }
        const o = JSON.parse(_), s = get_player_state_json();
        if (!s) {
          a(null);
          return;
        }
        const j = JSON.parse(s), S = [j.position[0] + CAMERA_OFFSET[0], j.position[1] + CAMERA_OFFSET[1], j.position[2] + CAMERA_OFFSET[2]], x = [o.position[0], o.position[1] + 1.5, o.position[2]], p = worldToScreen(x, S, window.innerWidth, window.innerHeight);
        if (!p) {
          a(null);
          return;
        }
        let H = OBJECT_NAMES[o.kind] ?? o.kind;
        o.kind === "flower" && o.sub_kind && (H = FLOWER_NAMES[o.sub_kind] ?? H), o.kind === "rock" && o.sub_kind && (H = ROCK_NAMES[o.sub_kind] ?? H), o.kind === "mushroom" && o.sub_kind && (H = MUSHROOM_NAMES[o.sub_kind] ?? H), a({ name: H, screenX: p.x, screenY: p.y });
      } catch {
        a(null);
      }
    }, 50);
    return () => clearInterval(l);
  }, []), n ? jsxRuntimeExports.jsx("div", { className: "absolute pointer-events-none", style: { left: n.screenX, top: n.screenY, transform: "translate(-50%, -100%)" }, children: jsxRuntimeExports.jsx("div", { className: `px-2 py-1 md:px-3 md:py-1.5 bg-[#1e1408]/90 border border-panel-border
					text-[7px] md:text-[10px] text-[#c8a832] whitespace-nowrap`, children: n.name }) }) : null;
}
const MODAL_CLOSE_DISTANCE = 6, ACTION_DISTANCE = 3;
function xzDistance(n, a) {
  const l = n[0] - a[0], _ = n[2] - a[2];
  return Math.sqrt(l * l + _ * _);
}
function getPlayerPosition() {
  try {
    const n = get_player_state_json();
    return n ? JSON.parse(n).position : null;
  } catch {
    return null;
  }
}
const OBJECT_INFO = { tree: { title: "Tree", description: "A sturdy tree with rough bark.", action: "Chop Tree" }, crate: { title: "Wooden Crate", description: "A wooden crate. Might contain something.", action: "Open Crate" }, crystal: { title: "Crystal", description: "A glowing crystal pulsing with energy.", action: "Mine Crystal" }, pillar: { title: "Stone Pillar", description: "An ancient stone pillar.", action: "Examine" }, sphere: { title: "Metallic Sphere", description: "A mysterious metallic sphere.", action: "Examine" }, flower: { title: "Flower", description: "A beautiful flower.", action: "Collect Flower" }, rock: { title: "Rock", description: "A weathered stone formation.", action: "Mine Rock" }, mushroom: { title: "Mushroom", description: "A wild mushroom growing in the shade.", action: "Collect Mushroom" } }, FLOWER_INFO = { tulip: { title: "Tulip", description: "A vibrant tulip with soft petals." }, daisy: { title: "Daisy", description: "A cheerful white daisy swaying gently." }, lavender: { title: "Lavender", description: "A fragrant lavender sprig." }, bell: { title: "Bellflower", description: "A delicate bellflower with drooping petals." }, wildflower: { title: "Wildflower", description: "A bright wildflower growing freely." }, sunflower: { title: "Sunflower", description: "A tall sunflower turning toward the light." }, rose: { title: "Rose", description: "A thorny rose with velvety red petals." }, cornflower: { title: "Cornflower", description: "A bright blue cornflower swaying in the breeze." }, allium: { title: "Allium", description: "A round purple allium bloom on a slender stem." }, blue_orchid: { title: "Blue Orchid", description: "A rare blue orchid with delicate petals." } }, ROCK_INFO = { boulder: { title: "Boulder", description: "A large, weathered boulder covered in lichen.", action: "Examine" }, mossy_rock: { title: "Mossy Rock", description: "A moss-covered stone, cool and damp to the touch.", action: "Examine" }, ore_copper: { title: "Copper Ore", description: "Greenish-brown veins of copper glint in the stone.", action: "Mine Ore" }, ore_iron: { title: "Iron Ore", description: "Dark reddish streaks of iron run through the rock.", action: "Mine Ore" }, ore_crystal: { title: "Crystal Ore", description: "Shimmering purple crystals jut from the stone.", action: "Mine Ore" } }, MUSHROOM_INFO = { porcini: { title: "Porcini", description: "A plump porcini mushroom with a rich earthy aroma." }, chanterelle: { title: "Chanterelle", description: "A golden chanterelle with a delicate funnel shape." }, fly_agaric: { title: "Fly Agaric", description: "A red-capped toadstool with white spots. Handle with care." } }, DISPATCH_ACTIONS = { "Chop Tree": "chop_tree", "Mine Rock": "mine_rock", "Mine Ore": "mine_rock", "Collect Flower": "collect_flower", "Collect Mushroom": "collect_mushroom" };
function ActionContent({ info: n, objectPos: a, entityId: l }) {
  return jsxRuntimeExports.jsxs("div", { className: "space-y-2 md:space-y-3", children: [jsxRuntimeExports.jsx("div", { className: "px-2 py-1.5 md:px-3 md:py-2 bg-[#1e1408] border border-[#5a4a2a]", children: jsxRuntimeExports.jsx("p", { className: "text-[8px] md:text-xs text-text leading-relaxed", children: n.description }) }), jsxRuntimeExports.jsx("div", { className: "flex justify-center pt-1", children: jsxRuntimeExports.jsx("button", { className: `px-4 py-1.5 md:px-6 md:py-2 text-[8px] md:text-xs text-text
						bg-btn border-2 border-btn-border
						shadow-[inset_0_1px_0_rgba(255,255,255,0.15),0_2px_0_#1a3a10]
						hover:bg-btn-hover active:bg-btn-active active:shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]
						transition-colors cursor-pointer`, onClick: () => {
    const _ = getPlayerPosition();
    if (_ && xzDistance(_, a) > ACTION_DISTANCE) {
      gameEvents.emit("toast:show", { message: "You are too far away.", severity: "warning" }), gameEvents.emit("modal:close");
      return;
    }
    const o = DISPATCH_ACTIONS[n.action];
    if (o) {
      dispatch_action(l, o);
      const s = o === "chop_tree" ? "Chopping" : o === "mine_rock" ? "Mining" : "Collecting";
      gameEvents.emit("toast:show", { message: `${s} ${n.title}...`, severity: "info" });
    } else gameEvents.emit("toast:show", { message: `${n.action}: ${n.title}`, severity: "info" });
    gameEvents.emit("modal:close");
  }, children: n.action }) })] });
}
function useObjectSelection() {
  const n = reactExports.useRef(false), a = reactExports.useRef(null);
  reactExports.useEffect(() => {
    const l = setInterval(() => {
      if (!n.current) try {
        const o = get_selected_object_json();
        if (!o) return;
        const s = JSON.parse(o);
        let j = OBJECT_INFO[s.kind];
        if (!j) return;
        if (s.kind === "flower" && s.sub_kind) {
          const S = FLOWER_INFO[s.sub_kind];
          S && (j = { ...j, title: S.title, description: S.description });
        }
        if (s.kind === "rock" && s.sub_kind) {
          const S = ROCK_INFO[s.sub_kind];
          S && (j = { title: S.title, description: S.description, action: S.action });
        }
        if (s.kind === "mushroom" && s.sub_kind) {
          const S = MUSHROOM_INFO[s.sub_kind];
          S && (j = { ...j, title: S.title, description: S.description });
        }
        n.current = true, a.current = s.position, gameEvents.emit("modal:open", { title: j.title, size: "sm", content: jsxRuntimeExports.jsx(ActionContent, { info: j, objectPos: s.position, entityId: s.entity_id }), onClose: () => {
          n.current = false, a.current = null;
        } });
      } catch {
      }
    }, 100), _ = setInterval(() => {
      if (!n.current || !a.current) return;
      const o = getPlayerPosition();
      o && xzDistance(o, a.current) > MODAL_CLOSE_DISTANCE && gameEvents.emit("modal:close");
    }, 250);
    return () => {
      clearInterval(l), clearInterval(_);
    };
  }, []);
}
function App() {
  return useObjectSelection(), jsxRuntimeExports.jsxs("div", { className: "fixed inset-0 pointer-events-none font-game text-text rpg-text-shadow", children: [jsxRuntimeExports.jsx(FPSCounter, {}), jsxRuntimeExports.jsx(HUD, {}), jsxRuntimeExports.jsx(Inventory, {}), jsxRuntimeExports.jsx(ObjectLabel, {})] });
}
function setLoadingProgress(n, a) {
  const l = document.getElementById("loading-status"), _ = document.getElementById("loading-bar");
  l && (l.textContent = n), _ && (_.style.width = a + "%");
}
function hideLoadingScreen() {
  const n = document.getElementById("game-loading");
  n && (n.style.opacity = "0", n.style.transition = "opacity 0.4s ease", setTimeout(() => n.remove(), 400));
}
function resolveEndpoints() {
  const n = window.location.hostname, a = window.location.protocol, l = a === "https:", _ = n === "localhost" || n === "127.0.0.1", o = l ? "wss" : "ws";
  if (_) {
    const s = window.location.port || (l ? "443" : "80");
    return { api_base: `${a}//${n}:${s}`, ws_url: `${o}://${n}:5000`, wt_url: `https://${n}:5001` };
  }
  return { api_base: `https://${n}`, ws_url: `wss://${n}/ws`, wt_url: `https://wt.${n}:5001` };
}
function probeClientProfile() {
  const n = globalThis, a = resolveEndpoints(), l = { secure_context: window.location.protocol === "https:" || window.location.hostname === "localhost", has_webgpu: !!navigator.gpu, has_webtransport: typeof n.WebTransport == "function", has_shared_array_buffer: typeof n.SharedArrayBuffer < "u", has_offscreen_canvas: typeof n.OffscreenCanvas == "function", hardware_concurrency: navigator.hardwareConcurrency || 1, ...a, timestamp: Date.now() };
  try {
    localStorage.setItem("kbve_client_profile", JSON.stringify(l));
  } catch {
    console.warn("[profile] localStorage unavailable, WASM will use defaults");
  }
  return l;
}
async function bootstrap() {
  if (!probeClientProfile().has_webgpu) {
    const _ = document.getElementById("root");
    _ && (_.innerHTML = '<div style="color:#fff;padding:2rem;text-align:center"><h2>WebGPU Not Available</h2><p>This browser does not support WebGPU (Chrome 113+, Edge 113+, Safari 18+).</p></div>', _.style.pointerEvents = "auto");
    return;
  }
  setLoadingProgress("Loading game module...", 20);
  const { default: a } = await __vitePreload(async () => {
    const { default: _ } = await Promise.resolve().then(() => isometric_game);
    return { default: _ };
  }, void 0);
  setLoadingProgress("Initializing WebGPU...", 60);
  const l = await a();
  if (typeof SharedArrayBuffer < "u" && "worker_entry_point" in l) {
    const _ = Math.max(1, (navigator.hardwareConcurrency || 4) - 1);
    setLoadingProgress(`Spawning ${_} workers...`, 75);
    const o = new URL("/isometric/assets/isometric_game_bg.wasm", import.meta.url), s = l.memory, j = new URL("/isometric/assets/isometric_game.js", import.meta.url).href;
    try {
      const S = await WebAssembly.compileStreaming(fetch(o)), x = "/isometric/";
      for (let p = 0; p < _; p++) new Worker(`${x}wasm-worker.js`, { type: "module" }).postMessage({ module: S, memory: s, bindgenUrl: j });
      console.log(`[pthreads] Spawned ${_} WASM worker threads`);
    } catch (S) {
      console.warn("[pthreads] Failed to compile WASM for workers:", S);
    }
  }
  setLoadingProgress("Starting...", 90), ReactDOM.createRoot(document.getElementById("root")).render(jsxRuntimeExports.jsx(React.StrictMode, { children: jsxRuntimeExports.jsx(GameUIProvider, { children: jsxRuntimeExports.jsx(App, {}) }) })), setLoadingProgress("Ready", 100), hideLoadingScreen();
}
bootstrap().catch((n) => {
  setLoadingProgress("Failed to load game", 0), console.error(n);
});
