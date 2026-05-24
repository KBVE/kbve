var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
(function() {
  const a = document.createElement("link").relList;
  if (a && a.supports && a.supports("modulepreload")) return;
  for (const f of document.querySelectorAll('link[rel="modulepreload"]')) r(f);
  new MutationObserver((f) => {
    for (const b of f) if (b.type === "childList") for (const g of b.addedNodes) g.tagName === "LINK" && g.rel === "modulepreload" && r(g);
  }).observe(document, { childList: true, subtree: true });
  function i(f) {
    const b = {};
    return f.integrity && (b.integrity = f.integrity), f.referrerPolicy && (b.referrerPolicy = f.referrerPolicy), f.crossOrigin === "use-credentials" ? b.credentials = "include" : f.crossOrigin === "anonymous" ? b.credentials = "omit" : b.credentials = "same-origin", b;
  }
  function r(f) {
    if (f.ep) return;
    f.ep = true;
    const b = i(f);
    fetch(f.href, b);
  }
})();
const scriptRel = "modulepreload", assetsURL = function(n) {
  return "/isometric/" + n;
}, seen = {}, __vitePreload = function(a, i, r) {
  let f = Promise.resolve();
  if (i && i.length > 0) {
    let g = function(w) {
      return Promise.all(w.map((z) => Promise.resolve(z).then((R) => ({ status: "fulfilled", value: R }), (R) => ({ status: "rejected", reason: R }))));
    };
    document.getElementsByTagName("link");
    const h = document.querySelector("meta[property=csp-nonce]"), y = (h == null ? void 0 : h.nonce) || (h == null ? void 0 : h.getAttribute("nonce"));
    f = g(i.map((w) => {
      if (w = assetsURL(w), w in seen) return;
      seen[w] = true;
      const z = w.endsWith(".css"), R = z ? '[rel="stylesheet"]' : "";
      if (document.querySelector(`link[href="${w}"]${R}`)) return;
      const U = document.createElement("link");
      if (U.rel = z ? "stylesheet" : scriptRel, z || (U.as = "script"), U.crossOrigin = "", U.href = w, y && U.setAttribute("nonce", y), document.head.appendChild(U), z) return new Promise((re, fe) => {
        U.addEventListener("load", re), U.addEventListener("error", () => fe(new Error(`Unable to preload CSS for ${w}`)));
      });
    }));
  }
  function b(g) {
    const h = new Event("vite:preloadError", { cancelable: true });
    if (h.payload = g, window.dispatchEvent(h), !h.defaultPrevented) throw g;
  }
  return f.then((g) => {
    for (const h of g || []) h.status === "rejected" && b(h.reason);
    return a().catch(b);
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
  function i(r, f, b) {
    var g = null;
    if (b !== void 0 && (g = "" + b), f.key !== void 0 && (g = "" + f.key), "key" in f) {
      b = {};
      for (var h in f) h !== "key" && (b[h] = f[h]);
    } else b = f;
    return f = b.ref, { $$typeof: n, type: r, key: g, ref: f !== void 0 ? f : null, props: b };
  }
  return reactJsxRuntime_production.Fragment = a, reactJsxRuntime_production.jsx = i, reactJsxRuntime_production.jsxs = i, reactJsxRuntime_production;
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
  var n = Symbol.for("react.transitional.element"), a = Symbol.for("react.portal"), i = Symbol.for("react.fragment"), r = Symbol.for("react.strict_mode"), f = Symbol.for("react.profiler"), b = Symbol.for("react.consumer"), g = Symbol.for("react.context"), h = Symbol.for("react.forward_ref"), y = Symbol.for("react.suspense"), w = Symbol.for("react.memo"), z = Symbol.for("react.lazy"), R = Symbol.for("react.activity"), U = Symbol.iterator;
  function re(p) {
    return p === null || typeof p != "object" ? null : (p = U && p[U] || p["@@iterator"], typeof p == "function" ? p : null);
  }
  var fe = { isMounted: function() {
    return false;
  }, enqueueForceUpdate: function() {
  }, enqueueReplaceState: function() {
  }, enqueueSetState: function() {
  } }, xe = Object.assign, wt = {};
  function He(p, D, H) {
    this.props = p, this.context = D, this.refs = wt, this.updater = H || fe;
  }
  He.prototype.isReactComponent = {}, He.prototype.setState = function(p, D) {
    if (typeof p != "object" && typeof p != "function" && p != null) throw Error("takes an object of state variables to update or a function which returns an object of state variables.");
    this.updater.enqueueSetState(this, p, D, "setState");
  }, He.prototype.forceUpdate = function(p) {
    this.updater.enqueueForceUpdate(this, p, "forceUpdate");
  };
  function Xt() {
  }
  Xt.prototype = He.prototype;
  function Ce(p, D, H) {
    this.props = p, this.context = D, this.refs = wt, this.updater = H || fe;
  }
  var at = Ce.prototype = new Xt();
  at.constructor = Ce, xe(at, He.prototype), at.isPureReactComponent = true;
  var Ot = Array.isArray;
  function Be() {
  }
  var J = { H: null, A: null, T: null, S: null }, Le = Object.prototype.hasOwnProperty;
  function yt(p, D, H) {
    var B = H.ref;
    return { $$typeof: n, type: p, key: D, ref: B !== void 0 ? B : null, props: H };
  }
  function Ln(p, D) {
    return yt(p.type, D, p.props);
  }
  function ht(p) {
    return typeof p == "object" && p !== null && p.$$typeof === n;
  }
  function qe(p) {
    var D = { "=": "=0", ":": "=2" };
    return "$" + p.replace(/[=:]/g, function(H) {
      return D[H];
    });
  }
  var wn = /\/+/g;
  function Et(p, D) {
    return typeof p == "object" && p !== null && p.key != null ? qe("" + p.key) : D.toString(36);
  }
  function dt(p) {
    switch (p.status) {
      case "fulfilled":
        return p.value;
      case "rejected":
        throw p.reason;
      default:
        switch (typeof p.status == "string" ? p.then(Be, Be) : (p.status = "pending", p.then(function(D) {
          p.status === "pending" && (p.status = "fulfilled", p.value = D);
        }, function(D) {
          p.status === "pending" && (p.status = "rejected", p.reason = D);
        })), p.status) {
          case "fulfilled":
            return p.value;
          case "rejected":
            throw p.reason;
        }
    }
    throw p;
  }
  function A(p, D, H, B, W) {
    var X = typeof p;
    (X === "undefined" || X === "boolean") && (p = null);
    var te = false;
    if (p === null) te = true;
    else switch (X) {
      case "bigint":
      case "string":
      case "number":
        te = true;
        break;
      case "object":
        switch (p.$$typeof) {
          case n:
          case a:
            te = true;
            break;
          case z:
            return te = p._init, A(te(p._payload), D, H, B, W);
        }
    }
    if (te) return W = W(p), te = B === "" ? "." + Et(p, 0) : B, Ot(W) ? (H = "", te != null && (H = te.replace(wn, "$&/") + "/"), A(W, D, H, "", function(va) {
      return va;
    })) : W != null && (ht(W) && (W = Ln(W, H + (W.key == null || p && p.key === W.key ? "" : ("" + W.key).replace(wn, "$&/") + "/") + te)), D.push(W)), 1;
    te = 0;
    var Ne = B === "" ? "." : B + ":";
    if (Ot(p)) for (var pe = 0; pe < p.length; pe++) B = p[pe], X = Ne + Et(B, pe), te += A(B, D, H, X, W);
    else if (pe = re(p), typeof pe == "function") for (p = pe.call(p), pe = 0; !(B = p.next()).done; ) B = B.value, X = Ne + Et(B, pe++), te += A(B, D, H, X, W);
    else if (X === "object") {
      if (typeof p.then == "function") return A(dt(p), D, H, B, W);
      throw D = String(p), Error("Objects are not valid as a React child (found: " + (D === "[object Object]" ? "object with keys {" + Object.keys(p).join(", ") + "}" : D) + "). If you meant to render a collection of children, use an array instead.");
    }
    return te;
  }
  function C(p, D, H) {
    if (p == null) return p;
    var B = [], W = 0;
    return A(p, B, "", "", function(X) {
      return D.call(H, X, W++);
    }), B;
  }
  function V(p) {
    if (p._status === -1) {
      var D = p._result;
      D = D(), D.then(function(H) {
        (p._status === 0 || p._status === -1) && (p._status = 1, p._result = H);
      }, function(H) {
        (p._status === 0 || p._status === -1) && (p._status = 2, p._result = H);
      }), p._status === -1 && (p._status = 0, p._result = D);
    }
    if (p._status === 1) return p._result.default;
    throw p._result;
  }
  var ce = typeof reportError == "function" ? reportError : function(p) {
    if (typeof window == "object" && typeof window.ErrorEvent == "function") {
      var D = new window.ErrorEvent("error", { bubbles: true, cancelable: true, message: typeof p == "object" && p !== null && typeof p.message == "string" ? String(p.message) : String(p), error: p });
      if (!window.dispatchEvent(D)) return;
    } else if (typeof process == "object" && typeof process.emit == "function") {
      process.emit("uncaughtException", p);
      return;
    }
    console.error(p);
  }, oe = { map: C, forEach: function(p, D, H) {
    C(p, function() {
      D.apply(this, arguments);
    }, H);
  }, count: function(p) {
    var D = 0;
    return C(p, function() {
      D++;
    }), D;
  }, toArray: function(p) {
    return C(p, function(D) {
      return D;
    }) || [];
  }, only: function(p) {
    if (!ht(p)) throw Error("React.Children.only expected to receive a single React element child.");
    return p;
  } };
  return react_production.Activity = R, react_production.Children = oe, react_production.Component = He, react_production.Fragment = i, react_production.Profiler = f, react_production.PureComponent = Ce, react_production.StrictMode = r, react_production.Suspense = y, react_production.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = J, react_production.__COMPILER_RUNTIME = { __proto__: null, c: function(p) {
    return J.H.useMemoCache(p);
  } }, react_production.cache = function(p) {
    return function() {
      return p.apply(null, arguments);
    };
  }, react_production.cacheSignal = function() {
    return null;
  }, react_production.cloneElement = function(p, D, H) {
    if (p == null) throw Error("The argument must be a React element, but you passed " + p + ".");
    var B = xe({}, p.props), W = p.key;
    if (D != null) for (X in D.key !== void 0 && (W = "" + D.key), D) !Le.call(D, X) || X === "key" || X === "__self" || X === "__source" || X === "ref" && D.ref === void 0 || (B[X] = D[X]);
    var X = arguments.length - 2;
    if (X === 1) B.children = H;
    else if (1 < X) {
      for (var te = Array(X), Ne = 0; Ne < X; Ne++) te[Ne] = arguments[Ne + 2];
      B.children = te;
    }
    return yt(p.type, W, B);
  }, react_production.createContext = function(p) {
    return p = { $$typeof: g, _currentValue: p, _currentValue2: p, _threadCount: 0, Provider: null, Consumer: null }, p.Provider = p, p.Consumer = { $$typeof: b, _context: p }, p;
  }, react_production.createElement = function(p, D, H) {
    var B, W = {}, X = null;
    if (D != null) for (B in D.key !== void 0 && (X = "" + D.key), D) Le.call(D, B) && B !== "key" && B !== "__self" && B !== "__source" && (W[B] = D[B]);
    var te = arguments.length - 2;
    if (te === 1) W.children = H;
    else if (1 < te) {
      for (var Ne = Array(te), pe = 0; pe < te; pe++) Ne[pe] = arguments[pe + 2];
      W.children = Ne;
    }
    if (p && p.defaultProps) for (B in te = p.defaultProps, te) W[B] === void 0 && (W[B] = te[B]);
    return yt(p, X, W);
  }, react_production.createRef = function() {
    return { current: null };
  }, react_production.forwardRef = function(p) {
    return { $$typeof: h, render: p };
  }, react_production.isValidElement = ht, react_production.lazy = function(p) {
    return { $$typeof: z, _payload: { _status: -1, _result: p }, _init: V };
  }, react_production.memo = function(p, D) {
    return { $$typeof: w, type: p, compare: D === void 0 ? null : D };
  }, react_production.startTransition = function(p) {
    var D = J.T, H = {};
    J.T = H;
    try {
      var B = p(), W = J.S;
      W !== null && W(H, B), typeof B == "object" && B !== null && typeof B.then == "function" && B.then(Be, ce);
    } catch (X) {
      ce(X);
    } finally {
      D !== null && H.types !== null && (D.types = H.types), J.T = D;
    }
  }, react_production.unstable_useCacheRefresh = function() {
    return J.H.useCacheRefresh();
  }, react_production.use = function(p) {
    return J.H.use(p);
  }, react_production.useActionState = function(p, D, H) {
    return J.H.useActionState(p, D, H);
  }, react_production.useCallback = function(p, D) {
    return J.H.useCallback(p, D);
  }, react_production.useContext = function(p) {
    return J.H.useContext(p);
  }, react_production.useDebugValue = function() {
  }, react_production.useDeferredValue = function(p, D) {
    return J.H.useDeferredValue(p, D);
  }, react_production.useEffect = function(p, D) {
    return J.H.useEffect(p, D);
  }, react_production.useEffectEvent = function(p) {
    return J.H.useEffectEvent(p);
  }, react_production.useId = function() {
    return J.H.useId();
  }, react_production.useImperativeHandle = function(p, D, H) {
    return J.H.useImperativeHandle(p, D, H);
  }, react_production.useInsertionEffect = function(p, D) {
    return J.H.useInsertionEffect(p, D);
  }, react_production.useLayoutEffect = function(p, D) {
    return J.H.useLayoutEffect(p, D);
  }, react_production.useMemo = function(p, D) {
    return J.H.useMemo(p, D);
  }, react_production.useOptimistic = function(p, D) {
    return J.H.useOptimistic(p, D);
  }, react_production.useReducer = function(p, D, H) {
    return J.H.useReducer(p, D, H);
  }, react_production.useRef = function(p) {
    return J.H.useRef(p);
  }, react_production.useState = function(p) {
    return J.H.useState(p);
  }, react_production.useSyncExternalStore = function(p, D, H) {
    return J.H.useSyncExternalStore(p, D, H);
  }, react_production.useTransition = function() {
    return J.H.useTransition();
  }, react_production.version = "19.2.6", react_production;
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
    function a(A, C) {
      var V = A.length;
      A.push(C);
      e: for (; 0 < V; ) {
        var ce = V - 1 >>> 1, oe = A[ce];
        if (0 < f(oe, C)) A[ce] = C, A[V] = oe, V = ce;
        else break e;
      }
    }
    function i(A) {
      return A.length === 0 ? null : A[0];
    }
    function r(A) {
      if (A.length === 0) return null;
      var C = A[0], V = A.pop();
      if (V !== C) {
        A[0] = V;
        e: for (var ce = 0, oe = A.length, p = oe >>> 1; ce < p; ) {
          var D = 2 * (ce + 1) - 1, H = A[D], B = D + 1, W = A[B];
          if (0 > f(H, V)) B < oe && 0 > f(W, H) ? (A[ce] = W, A[B] = V, ce = B) : (A[ce] = H, A[D] = V, ce = D);
          else if (B < oe && 0 > f(W, V)) A[ce] = W, A[B] = V, ce = B;
          else break e;
        }
      }
      return C;
    }
    function f(A, C) {
      var V = A.sortIndex - C.sortIndex;
      return V !== 0 ? V : A.id - C.id;
    }
    if (n.unstable_now = void 0, typeof performance == "object" && typeof performance.now == "function") {
      var b = performance;
      n.unstable_now = function() {
        return b.now();
      };
    } else {
      var g = Date, h = g.now();
      n.unstable_now = function() {
        return g.now() - h;
      };
    }
    var y = [], w = [], z = 1, R = null, U = 3, re = false, fe = false, xe = false, wt = false, He = typeof setTimeout == "function" ? setTimeout : null, Xt = typeof clearTimeout == "function" ? clearTimeout : null, Ce = typeof setImmediate < "u" ? setImmediate : null;
    function at(A) {
      for (var C = i(w); C !== null; ) {
        if (C.callback === null) r(w);
        else if (C.startTime <= A) r(w), C.sortIndex = C.expirationTime, a(y, C);
        else break;
        C = i(w);
      }
    }
    function Ot(A) {
      if (xe = false, at(A), !fe) if (i(y) !== null) fe = true, Be || (Be = true, qe());
      else {
        var C = i(w);
        C !== null && dt(Ot, C.startTime - A);
      }
    }
    var Be = false, J = -1, Le = 5, yt = -1;
    function Ln() {
      return wt ? true : !(n.unstable_now() - yt < Le);
    }
    function ht() {
      if (wt = false, Be) {
        var A = n.unstable_now();
        yt = A;
        var C = true;
        try {
          e: {
            fe = false, xe && (xe = false, Xt(J), J = -1), re = true;
            var V = U;
            try {
              t: {
                for (at(A), R = i(y); R !== null && !(R.expirationTime > A && Ln()); ) {
                  var ce = R.callback;
                  if (typeof ce == "function") {
                    R.callback = null, U = R.priorityLevel;
                    var oe = ce(R.expirationTime <= A);
                    if (A = n.unstable_now(), typeof oe == "function") {
                      R.callback = oe, at(A), C = true;
                      break t;
                    }
                    R === i(y) && r(y), at(A);
                  } else r(y);
                  R = i(y);
                }
                if (R !== null) C = true;
                else {
                  var p = i(w);
                  p !== null && dt(Ot, p.startTime - A), C = false;
                }
              }
              break e;
            } finally {
              R = null, U = V, re = false;
            }
            C = void 0;
          }
        } finally {
          C ? qe() : Be = false;
        }
      }
    }
    var qe;
    if (typeof Ce == "function") qe = function() {
      Ce(ht);
    };
    else if (typeof MessageChannel < "u") {
      var wn = new MessageChannel(), Et = wn.port2;
      wn.port1.onmessage = ht, qe = function() {
        Et.postMessage(null);
      };
    } else qe = function() {
      He(ht, 0);
    };
    function dt(A, C) {
      J = He(function() {
        A(n.unstable_now());
      }, C);
    }
    n.unstable_IdlePriority = 5, n.unstable_ImmediatePriority = 1, n.unstable_LowPriority = 4, n.unstable_NormalPriority = 3, n.unstable_Profiling = null, n.unstable_UserBlockingPriority = 2, n.unstable_cancelCallback = function(A) {
      A.callback = null;
    }, n.unstable_forceFrameRate = function(A) {
      0 > A || 125 < A ? console.error("forceFrameRate takes a positive int between 0 and 125, forcing frame rates higher than 125 fps is not supported") : Le = 0 < A ? Math.floor(1e3 / A) : 5;
    }, n.unstable_getCurrentPriorityLevel = function() {
      return U;
    }, n.unstable_next = function(A) {
      switch (U) {
        case 1:
        case 2:
        case 3:
          var C = 3;
          break;
        default:
          C = U;
      }
      var V = U;
      U = C;
      try {
        return A();
      } finally {
        U = V;
      }
    }, n.unstable_requestPaint = function() {
      wt = true;
    }, n.unstable_runWithPriority = function(A, C) {
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
      var V = U;
      U = A;
      try {
        return C();
      } finally {
        U = V;
      }
    }, n.unstable_scheduleCallback = function(A, C, V) {
      var ce = n.unstable_now();
      switch (typeof V == "object" && V !== null ? (V = V.delay, V = typeof V == "number" && 0 < V ? ce + V : ce) : V = ce, A) {
        case 1:
          var oe = -1;
          break;
        case 2:
          oe = 250;
          break;
        case 5:
          oe = 1073741823;
          break;
        case 4:
          oe = 1e4;
          break;
        default:
          oe = 5e3;
      }
      return oe = V + oe, A = { id: z++, callback: C, priorityLevel: A, startTime: V, expirationTime: oe, sortIndex: -1 }, V > ce ? (A.sortIndex = V, a(w, A), i(y) === null && A === i(w) && (xe ? (Xt(J), J = -1) : xe = true, dt(Ot, V - ce))) : (A.sortIndex = oe, a(y, A), fe || re || (fe = true, Be || (Be = true, qe()))), A;
    }, n.unstable_shouldYield = Ln, n.unstable_wrapCallback = function(A) {
      var C = U;
      return function() {
        var V = U;
        U = C;
        try {
          return A.apply(this, arguments);
        } finally {
          U = V;
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
  function a(y) {
    var w = "https://react.dev/errors/" + y;
    if (1 < arguments.length) {
      w += "?args[]=" + encodeURIComponent(arguments[1]);
      for (var z = 2; z < arguments.length; z++) w += "&args[]=" + encodeURIComponent(arguments[z]);
    }
    return "Minified React error #" + y + "; visit " + w + " for the full message or use the non-minified dev environment for full errors and additional helpful warnings.";
  }
  function i() {
  }
  var r = { d: { f: i, r: function() {
    throw Error(a(522));
  }, D: i, C: i, L: i, m: i, X: i, S: i, M: i }, p: 0, findDOMNode: null }, f = Symbol.for("react.portal");
  function b(y, w, z) {
    var R = 3 < arguments.length && arguments[3] !== void 0 ? arguments[3] : null;
    return { $$typeof: f, key: R == null ? null : "" + R, children: y, containerInfo: w, implementation: z };
  }
  var g = n.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  function h(y, w) {
    if (y === "font") return "";
    if (typeof w == "string") return w === "use-credentials" ? w : "";
  }
  return reactDom_production.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = r, reactDom_production.createPortal = function(y, w) {
    var z = 2 < arguments.length && arguments[2] !== void 0 ? arguments[2] : null;
    if (!w || w.nodeType !== 1 && w.nodeType !== 9 && w.nodeType !== 11) throw Error(a(299));
    return b(y, w, null, z);
  }, reactDom_production.flushSync = function(y) {
    var w = g.T, z = r.p;
    try {
      if (g.T = null, r.p = 2, y) return y();
    } finally {
      g.T = w, r.p = z, r.d.f();
    }
  }, reactDom_production.preconnect = function(y, w) {
    typeof y == "string" && (w ? (w = w.crossOrigin, w = typeof w == "string" ? w === "use-credentials" ? w : "" : void 0) : w = null, r.d.C(y, w));
  }, reactDom_production.prefetchDNS = function(y) {
    typeof y == "string" && r.d.D(y);
  }, reactDom_production.preinit = function(y, w) {
    if (typeof y == "string" && w && typeof w.as == "string") {
      var z = w.as, R = h(z, w.crossOrigin), U = typeof w.integrity == "string" ? w.integrity : void 0, re = typeof w.fetchPriority == "string" ? w.fetchPriority : void 0;
      z === "style" ? r.d.S(y, typeof w.precedence == "string" ? w.precedence : void 0, { crossOrigin: R, integrity: U, fetchPriority: re }) : z === "script" && r.d.X(y, { crossOrigin: R, integrity: U, fetchPriority: re, nonce: typeof w.nonce == "string" ? w.nonce : void 0 });
    }
  }, reactDom_production.preinitModule = function(y, w) {
    if (typeof y == "string") if (typeof w == "object" && w !== null) {
      if (w.as == null || w.as === "script") {
        var z = h(w.as, w.crossOrigin);
        r.d.M(y, { crossOrigin: z, integrity: typeof w.integrity == "string" ? w.integrity : void 0, nonce: typeof w.nonce == "string" ? w.nonce : void 0 });
      }
    } else w == null && r.d.M(y);
  }, reactDom_production.preload = function(y, w) {
    if (typeof y == "string" && typeof w == "object" && w !== null && typeof w.as == "string") {
      var z = w.as, R = h(z, w.crossOrigin);
      r.d.L(y, z, { crossOrigin: R, integrity: typeof w.integrity == "string" ? w.integrity : void 0, nonce: typeof w.nonce == "string" ? w.nonce : void 0, type: typeof w.type == "string" ? w.type : void 0, fetchPriority: typeof w.fetchPriority == "string" ? w.fetchPriority : void 0, referrerPolicy: typeof w.referrerPolicy == "string" ? w.referrerPolicy : void 0, imageSrcSet: typeof w.imageSrcSet == "string" ? w.imageSrcSet : void 0, imageSizes: typeof w.imageSizes == "string" ? w.imageSizes : void 0, media: typeof w.media == "string" ? w.media : void 0 });
    }
  }, reactDom_production.preloadModule = function(y, w) {
    if (typeof y == "string") if (w) {
      var z = h(w.as, w.crossOrigin);
      r.d.m(y, { as: typeof w.as == "string" && w.as !== "script" ? w.as : void 0, crossOrigin: z, integrity: typeof w.integrity == "string" ? w.integrity : void 0 });
    } else r.d.m(y);
  }, reactDom_production.requestFormReset = function(y) {
    r.d.r(y);
  }, reactDom_production.unstable_batchedUpdates = function(y, w) {
    return y(w);
  }, reactDom_production.useFormState = function(y, w, z) {
    return g.H.useFormState(y, w, z);
  }, reactDom_production.useFormStatus = function() {
    return g.H.useHostTransitionStatus();
  }, reactDom_production.version = "19.2.6", reactDom_production;
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
  var n = requireScheduler(), a = requireReact(), i = requireReactDom();
  function r(e) {
    var t = "https://react.dev/errors/" + e;
    if (1 < arguments.length) {
      t += "?args[]=" + encodeURIComponent(arguments[1]);
      for (var c = 2; c < arguments.length; c++) t += "&args[]=" + encodeURIComponent(arguments[c]);
    }
    return "Minified React error #" + e + "; visit " + t + " for the full message or use the non-minified dev environment for full errors and additional helpful warnings.";
  }
  function f(e) {
    return !(!e || e.nodeType !== 1 && e.nodeType !== 9 && e.nodeType !== 11);
  }
  function b(e) {
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
  function g(e) {
    if (e.tag === 13) {
      var t = e.memoizedState;
      if (t === null && (e = e.alternate, e !== null && (t = e.memoizedState)), t !== null) return t.dehydrated;
    }
    return null;
  }
  function h(e) {
    if (e.tag === 31) {
      var t = e.memoizedState;
      if (t === null && (e = e.alternate, e !== null && (t = e.memoizedState)), t !== null) return t.dehydrated;
    }
    return null;
  }
  function y(e) {
    if (b(e) !== e) throw Error(r(188));
  }
  function w(e) {
    var t = e.alternate;
    if (!t) {
      if (t = b(e), t === null) throw Error(r(188));
      return t !== e ? null : e;
    }
    for (var c = e, u = t; ; ) {
      var l = c.return;
      if (l === null) break;
      var o = l.alternate;
      if (o === null) {
        if (u = l.return, u !== null) {
          c = u;
          continue;
        }
        break;
      }
      if (l.child === o.child) {
        for (o = l.child; o; ) {
          if (o === c) return y(l), e;
          if (o === u) return y(l), t;
          o = o.sibling;
        }
        throw Error(r(188));
      }
      if (c.return !== u.return) c = l, u = o;
      else {
        for (var _ = false, s = l.child; s; ) {
          if (s === c) {
            _ = true, c = l, u = o;
            break;
          }
          if (s === u) {
            _ = true, u = l, c = o;
            break;
          }
          s = s.sibling;
        }
        if (!_) {
          for (s = o.child; s; ) {
            if (s === c) {
              _ = true, c = o, u = l;
              break;
            }
            if (s === u) {
              _ = true, u = o, c = l;
              break;
            }
            s = s.sibling;
          }
          if (!_) throw Error(r(189));
        }
      }
      if (c.alternate !== u) throw Error(r(190));
    }
    if (c.tag !== 3) throw Error(r(188));
    return c.stateNode.current === c ? e : t;
  }
  function z(e) {
    var t = e.tag;
    if (t === 5 || t === 26 || t === 27 || t === 6) return e;
    for (e = e.child; e !== null; ) {
      if (t = z(e), t !== null) return t;
      e = e.sibling;
    }
    return null;
  }
  var R = Object.assign, U = Symbol.for("react.element"), re = Symbol.for("react.transitional.element"), fe = Symbol.for("react.portal"), xe = Symbol.for("react.fragment"), wt = Symbol.for("react.strict_mode"), He = Symbol.for("react.profiler"), Xt = Symbol.for("react.consumer"), Ce = Symbol.for("react.context"), at = Symbol.for("react.forward_ref"), Ot = Symbol.for("react.suspense"), Be = Symbol.for("react.suspense_list"), J = Symbol.for("react.memo"), Le = Symbol.for("react.lazy"), yt = Symbol.for("react.activity"), Ln = Symbol.for("react.memo_cache_sentinel"), ht = Symbol.iterator;
  function qe(e) {
    return e === null || typeof e != "object" ? null : (e = ht && e[ht] || e["@@iterator"], typeof e == "function" ? e : null);
  }
  var wn = Symbol.for("react.client.reference");
  function Et(e) {
    if (e == null) return null;
    if (typeof e == "function") return e.$$typeof === wn ? null : e.displayName || e.name || null;
    if (typeof e == "string") return e;
    switch (e) {
      case xe:
        return "Fragment";
      case He:
        return "Profiler";
      case wt:
        return "StrictMode";
      case Ot:
        return "Suspense";
      case Be:
        return "SuspenseList";
      case yt:
        return "Activity";
    }
    if (typeof e == "object") switch (e.$$typeof) {
      case fe:
        return "Portal";
      case Ce:
        return e.displayName || "Context";
      case Xt:
        return (e._context.displayName || "Context") + ".Consumer";
      case at:
        var t = e.render;
        return e = e.displayName, e || (e = t.displayName || t.name || "", e = e !== "" ? "ForwardRef(" + e + ")" : "ForwardRef"), e;
      case J:
        return t = e.displayName || null, t !== null ? t : Et(e.type) || "Memo";
      case Le:
        t = e._payload, e = e._init;
        try {
          return Et(e(t));
        } catch {
        }
    }
    return null;
  }
  var dt = Array.isArray, A = a.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, C = i.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, V = { pending: false, data: null, method: null, action: null }, ce = [], oe = -1;
  function p(e) {
    return { current: e };
  }
  function D(e) {
    0 > oe || (e.current = ce[oe], ce[oe] = null, oe--);
  }
  function H(e, t) {
    oe++, ce[oe] = e.current, e.current = t;
  }
  var B = p(null), W = p(null), X = p(null), te = p(null);
  function Ne(e, t) {
    switch (H(X, t), H(W, e), H(B, null), t.nodeType) {
      case 9:
      case 11:
        e = (e = t.documentElement) && (e = e.namespaceURI) ? xf(e) : 0;
        break;
      default:
        if (e = t.tagName, t = t.namespaceURI) t = xf(t), e = Ef(t, e);
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
    D(B), H(B, e);
  }
  function pe() {
    D(B), D(W), D(X);
  }
  function va(e) {
    e.memoizedState !== null && H(te, e);
    var t = B.current, c = Ef(t, e.type);
    t !== c && (H(W, e), H(B, c));
  }
  function mc(e) {
    W.current === e && (D(B), D(W)), te.current === e && (D(te), sc._currentValue = V);
  }
  var Nu, Pl;
  function On(e) {
    if (Nu === void 0) try {
      throw Error();
    } catch (c) {
      var t = c.stack.trim().match(/\n( *(at )?)/);
      Nu = t && t[1] || "", Pl = -1 < c.stack.indexOf(`
    at`) ? " (<anonymous>)" : -1 < c.stack.indexOf("@") ? "@unknown:0:0" : "";
    }
    return `
` + Nu + e + Pl;
  }
  var Uu = false;
  function Bu(e, t) {
    if (!e || Uu) return "";
    Uu = true;
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
              } catch (x) {
                var S = x;
              }
              Reflect.construct(e, [], M);
            } else {
              try {
                M.call();
              } catch (x) {
                S = x;
              }
              e.call(M.prototype);
            }
          } else {
            try {
              throw Error();
            } catch (x) {
              S = x;
            }
            (M = e()) && typeof M.catch == "function" && M.catch(function() {
            });
          }
        } catch (x) {
          if (x && S && typeof x.stack == "string") return [x.stack, S.stack];
        }
        return [null, null];
      } };
      u.DetermineComponentFrameRoot.displayName = "DetermineComponentFrameRoot";
      var l = Object.getOwnPropertyDescriptor(u.DetermineComponentFrameRoot, "name");
      l && l.configurable && Object.defineProperty(u.DetermineComponentFrameRoot, "name", { value: "DetermineComponentFrameRoot" });
      var o = u.DetermineComponentFrameRoot(), _ = o[0], s = o[1];
      if (_ && s) {
        var d = _.split(`
`), v = s.split(`
`);
        for (l = u = 0; u < d.length && !d[u].includes("DetermineComponentFrameRoot"); ) u++;
        for (; l < v.length && !v[l].includes("DetermineComponentFrameRoot"); ) l++;
        if (u === d.length || l === v.length) for (u = d.length - 1, l = v.length - 1; 1 <= u && 0 <= l && d[u] !== v[l]; ) l--;
        for (; 1 <= u && 0 <= l; u--, l--) if (d[u] !== v[l]) {
          if (u !== 1 || l !== 1) do
            if (u--, l--, 0 > l || d[u] !== v[l]) {
              var E = `
` + d[u].replace(" at new ", " at ");
              return e.displayName && E.includes("<anonymous>") && (E = E.replace("<anonymous>", e.displayName)), E;
            }
          while (1 <= u && 0 <= l);
          break;
        }
      }
    } finally {
      Uu = false, Error.prepareStackTrace = c;
    }
    return (c = e ? e.displayName || e.name : "") ? On(c) : "";
  }
  function ns(e, t) {
    switch (e.tag) {
      case 26:
      case 27:
      case 5:
        return On(e.type);
      case 16:
        return On("Lazy");
      case 13:
        return e.child !== t && t !== null ? On("Suspense Fallback") : On("Suspense");
      case 19:
        return On("SuspenseList");
      case 0:
      case 15:
        return Bu(e.type, false);
      case 11:
        return Bu(e.type.render, false);
      case 1:
        return Bu(e.type, true);
      case 31:
        return On("Activity");
      default:
        return "";
    }
  }
  function er(e) {
    try {
      var t = "", c = null;
      do
        t += ns(e, c), c = e, e = e.return;
      while (e);
      return t;
    } catch (u) {
      return `
Error generating stack: ` + u.message + `
` + u.stack;
    }
  }
  var Lu = Object.prototype.hasOwnProperty, qu = n.unstable_scheduleCallback, Gu = n.unstable_cancelCallback, as = n.unstable_shouldYield, cs = n.unstable_requestPaint, Qe = n.unstable_now, us = n.unstable_getCurrentPriorityLevel, tr = n.unstable_ImmediatePriority, nr = n.unstable_UserBlockingPriority, pc = n.unstable_NormalPriority, is = n.unstable_LowPriority, ar = n.unstable_IdlePriority, ls = n.log, rs = n.unstable_setDisableYieldValue, Sa = null, Ze = null;
  function Ft(e) {
    if (typeof ls == "function" && rs(e), Ze && typeof Ze.setStrictMode == "function") try {
      Ze.setStrictMode(Sa, e);
    } catch {
    }
  }
  var Ke = Math.clz32 ? Math.clz32 : fs, os = Math.log, _s = Math.LN2;
  function fs(e) {
    return e >>>= 0, e === 0 ? 32 : 31 - (os(e) / _s | 0) | 0;
  }
  var wc = 256, Oc = 262144, yc = 4194304;
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
  function hc(e, t, c) {
    var u = e.pendingLanes;
    if (u === 0) return 0;
    var l = 0, o = e.suspendedLanes, _ = e.pingedLanes;
    e = e.warmLanes;
    var s = u & 134217727;
    return s !== 0 ? (u = s & ~o, u !== 0 ? l = yn(u) : (_ &= s, _ !== 0 ? l = yn(_) : c || (c = s & ~e, c !== 0 && (l = yn(c))))) : (s = u & ~o, s !== 0 ? l = yn(s) : _ !== 0 ? l = yn(_) : c || (c = u & ~e, c !== 0 && (l = yn(c)))), l === 0 ? 0 : t !== 0 && t !== l && (t & o) === 0 && (o = l & -l, c = t & -t, o >= c || o === 32 && (c & 4194048) !== 0) ? t : l;
  }
  function xa(e, t) {
    return (e.pendingLanes & ~(e.suspendedLanes & ~e.pingedLanes) & t) === 0;
  }
  function ss(e, t) {
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
  function cr() {
    var e = yc;
    return yc <<= 1, (yc & 62914560) === 0 && (yc = 4194304), e;
  }
  function Vu(e) {
    for (var t = [], c = 0; 31 > c; c++) t.push(e);
    return t;
  }
  function Ea(e, t) {
    e.pendingLanes |= t, t !== 268435456 && (e.suspendedLanes = 0, e.pingedLanes = 0, e.warmLanes = 0);
  }
  function bs(e, t, c, u, l, o) {
    var _ = e.pendingLanes;
    e.pendingLanes = c, e.suspendedLanes = 0, e.pingedLanes = 0, e.warmLanes = 0, e.expiredLanes &= c, e.entangledLanes &= c, e.errorRecoveryDisabledLanes &= c, e.shellSuspendCounter = 0;
    var s = e.entanglements, d = e.expirationTimes, v = e.hiddenUpdates;
    for (c = _ & ~c; 0 < c; ) {
      var E = 31 - Ke(c), M = 1 << E;
      s[E] = 0, d[E] = -1;
      var S = v[E];
      if (S !== null) for (v[E] = null, E = 0; E < S.length; E++) {
        var x = S[E];
        x !== null && (x.lane &= -536870913);
      }
      c &= ~M;
    }
    u !== 0 && ur(e, u, 0), o !== 0 && l === 0 && e.tag !== 0 && (e.suspendedLanes |= o & ~(_ & ~t));
  }
  function ur(e, t, c) {
    e.pendingLanes |= t, e.suspendedLanes &= ~t;
    var u = 31 - Ke(t);
    e.entangledLanes |= t, e.entanglements[u] = e.entanglements[u] | 1073741824 | c & 261930;
  }
  function ir(e, t) {
    var c = e.entangledLanes |= t;
    for (e = e.entanglements; c; ) {
      var u = 31 - Ke(c), l = 1 << u;
      l & t | e[u] & t && (e[u] |= t), c &= ~l;
    }
  }
  function lr(e, t) {
    var c = t & -t;
    return c = (c & 42) !== 0 ? 1 : Wu(c), (c & (e.suspendedLanes | t)) !== 0 ? 0 : c;
  }
  function Wu(e) {
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
  function ku(e) {
    return e &= -e, 2 < e ? 8 < e ? (e & 134217727) !== 0 ? 32 : 268435456 : 8 : 2;
  }
  function rr() {
    var e = C.p;
    return e !== 0 ? e : (e = window.event, e === void 0 ? 32 : Kf(e.type));
  }
  function or(e, t) {
    var c = C.p;
    try {
      return C.p = e, t();
    } finally {
      C.p = c;
    }
  }
  var Qt = Math.random().toString(36).slice(2), Te = "__reactFiber$" + Qt, Ge = "__reactProps$" + Qt, qn = "__reactContainer$" + Qt, Yu = "__reactEvents$" + Qt, ds = "__reactListeners$" + Qt, gs = "__reactHandles$" + Qt, _r = "__reactResources$" + Qt, Aa = "__reactMarker$" + Qt;
  function Xu(e) {
    delete e[Te], delete e[Ge], delete e[Yu], delete e[ds], delete e[gs];
  }
  function Gn(e) {
    var t = e[Te];
    if (t) return t;
    for (var c = e.parentNode; c; ) {
      if (t = c[qn] || c[Te]) {
        if (c = t.alternate, t.child !== null || c !== null && c.child !== null) for (e = Cf(e); e !== null; ) {
          if (c = e[Te]) return c;
          e = Cf(e);
        }
        return t;
      }
      e = c, c = e.parentNode;
    }
    return null;
  }
  function Vn(e) {
    if (e = e[Te] || e[qn]) {
      var t = e.tag;
      if (t === 5 || t === 6 || t === 13 || t === 31 || t === 26 || t === 27 || t === 3) return e;
    }
    return null;
  }
  function Ta(e) {
    var t = e.tag;
    if (t === 5 || t === 26 || t === 27 || t === 6) return e.stateNode;
    throw Error(r(33));
  }
  function Wn(e) {
    var t = e[_r];
    return t || (t = e[_r] = { hoistableStyles: /* @__PURE__ */ new Map(), hoistableScripts: /* @__PURE__ */ new Map() }), t;
  }
  function Ee(e) {
    e[Aa] = true;
  }
  var fr = /* @__PURE__ */ new Set(), sr = {};
  function hn(e, t) {
    kn(e, t), kn(e + "Capture", t);
  }
  function kn(e, t) {
    for (sr[e] = t, e = 0; e < t.length; e++) fr.add(t[e]);
  }
  var ms = RegExp("^[:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD][:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040]*$"), br = {}, dr = {};
  function ps(e) {
    return Lu.call(dr, e) ? true : Lu.call(br, e) ? false : ms.test(e) ? dr[e] = true : (br[e] = true, false);
  }
  function jc(e, t, c) {
    if (ps(t)) if (c === null) e.removeAttribute(t);
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
  function gr(e) {
    var t = e.type;
    return (e = e.nodeName) && e.toLowerCase() === "input" && (t === "checkbox" || t === "radio");
  }
  function ws(e, t, c) {
    var u = Object.getOwnPropertyDescriptor(e.constructor.prototype, t);
    if (!e.hasOwnProperty(t) && typeof u < "u" && typeof u.get == "function" && typeof u.set == "function") {
      var l = u.get, o = u.set;
      return Object.defineProperty(e, t, { configurable: true, get: function() {
        return l.call(this);
      }, set: function(_) {
        c = "" + _, o.call(this, _);
      } }), Object.defineProperty(e, t, { enumerable: u.enumerable }), { getValue: function() {
        return c;
      }, setValue: function(_) {
        c = "" + _;
      }, stopTracking: function() {
        e._valueTracker = null, delete e[t];
      } };
    }
  }
  function Fu(e) {
    if (!e._valueTracker) {
      var t = gr(e) ? "checked" : "value";
      e._valueTracker = ws(e, t, "" + e[t]);
    }
  }
  function mr(e) {
    if (!e) return false;
    var t = e._valueTracker;
    if (!t) return true;
    var c = t.getValue(), u = "";
    return e && (u = gr(e) ? e.checked ? "true" : "false" : e.value), e = u, e !== c ? (t.setValue(e), true) : false;
  }
  function Sc(e) {
    if (e = e || (typeof document < "u" ? document : void 0), typeof e > "u") return null;
    try {
      return e.activeElement || e.body;
    } catch {
      return e.body;
    }
  }
  var Os = /[\n"\\]/g;
  function ut(e) {
    return e.replace(Os, function(t) {
      return "\\" + t.charCodeAt(0).toString(16) + " ";
    });
  }
  function Qu(e, t, c, u, l, o, _, s) {
    e.name = "", _ != null && typeof _ != "function" && typeof _ != "symbol" && typeof _ != "boolean" ? e.type = _ : e.removeAttribute("type"), t != null ? _ === "number" ? (t === 0 && e.value === "" || e.value != t) && (e.value = "" + ct(t)) : e.value !== "" + ct(t) && (e.value = "" + ct(t)) : _ !== "submit" && _ !== "reset" || e.removeAttribute("value"), t != null ? Zu(e, _, ct(t)) : c != null ? Zu(e, _, ct(c)) : u != null && e.removeAttribute("value"), l == null && o != null && (e.defaultChecked = !!o), l != null && (e.checked = l && typeof l != "function" && typeof l != "symbol"), s != null && typeof s != "function" && typeof s != "symbol" && typeof s != "boolean" ? e.name = "" + ct(s) : e.removeAttribute("name");
  }
  function pr(e, t, c, u, l, o, _, s) {
    if (o != null && typeof o != "function" && typeof o != "symbol" && typeof o != "boolean" && (e.type = o), t != null || c != null) {
      if (!(o !== "submit" && o !== "reset" || t != null)) {
        Fu(e);
        return;
      }
      c = c != null ? "" + ct(c) : "", t = t != null ? "" + ct(t) : c, s || t === e.value || (e.value = t), e.defaultValue = t;
    }
    u = u ?? l, u = typeof u != "function" && typeof u != "symbol" && !!u, e.checked = s ? e.checked : !!u, e.defaultChecked = !!u, _ != null && typeof _ != "function" && typeof _ != "symbol" && typeof _ != "boolean" && (e.name = _), Fu(e);
  }
  function Zu(e, t, c) {
    t === "number" && Sc(e.ownerDocument) === e || e.defaultValue === "" + c || (e.defaultValue = "" + c);
  }
  function Yn(e, t, c, u) {
    if (e = e.options, t) {
      t = {};
      for (var l = 0; l < c.length; l++) t["$" + c[l]] = true;
      for (c = 0; c < e.length; c++) l = t.hasOwnProperty("$" + e[c].value), e[c].selected !== l && (e[c].selected = l), l && u && (e[c].defaultSelected = true);
    } else {
      for (c = "" + ct(c), t = null, l = 0; l < e.length; l++) {
        if (e[l].value === c) {
          e[l].selected = true, u && (e[l].defaultSelected = true);
          return;
        }
        t !== null || e[l].disabled || (t = e[l]);
      }
      t !== null && (t.selected = true);
    }
  }
  function wr(e, t, c) {
    if (t != null && (t = "" + ct(t), t !== e.value && (e.value = t), c == null)) {
      e.defaultValue !== t && (e.defaultValue = t);
      return;
    }
    e.defaultValue = c != null ? "" + ct(c) : "";
  }
  function Or(e, t, c, u) {
    if (t == null) {
      if (u != null) {
        if (c != null) throw Error(r(92));
        if (dt(u)) {
          if (1 < u.length) throw Error(r(93));
          u = u[0];
        }
        c = u;
      }
      c == null && (c = ""), t = c;
    }
    c = ct(t), e.defaultValue = c, u = e.textContent, u === c && u !== "" && u !== null && (e.value = u), Fu(e);
  }
  function Xn(e, t) {
    if (t) {
      var c = e.firstChild;
      if (c && c === e.lastChild && c.nodeType === 3) {
        c.nodeValue = t;
        return;
      }
    }
    e.textContent = t;
  }
  var ys = new Set("animationIterationCount aspectRatio borderImageOutset borderImageSlice borderImageWidth boxFlex boxFlexGroup boxOrdinalGroup columnCount columns flex flexGrow flexPositive flexShrink flexNegative flexOrder gridArea gridRow gridRowEnd gridRowSpan gridRowStart gridColumn gridColumnEnd gridColumnSpan gridColumnStart fontWeight lineClamp lineHeight opacity order orphans scale tabSize widows zIndex zoom fillOpacity floodOpacity stopOpacity strokeDasharray strokeDashoffset strokeMiterlimit strokeOpacity strokeWidth MozAnimationIterationCount MozBoxFlex MozBoxFlexGroup MozLineClamp msAnimationIterationCount msFlex msZoom msFlexGrow msFlexNegative msFlexOrder msFlexPositive msFlexShrink msGridColumn msGridColumnSpan msGridRow msGridRowSpan WebkitAnimationIterationCount WebkitBoxFlex WebKitBoxFlexGroup WebkitBoxOrdinalGroup WebkitColumnCount WebkitColumns WebkitFlex WebkitFlexGrow WebkitFlexPositive WebkitFlexShrink WebkitLineClamp".split(" "));
  function yr(e, t, c) {
    var u = t.indexOf("--") === 0;
    c == null || typeof c == "boolean" || c === "" ? u ? e.setProperty(t, "") : t === "float" ? e.cssFloat = "" : e[t] = "" : u ? e.setProperty(t, c) : typeof c != "number" || c === 0 || ys.has(t) ? t === "float" ? e.cssFloat = c : e[t] = ("" + c).trim() : e[t] = c + "px";
  }
  function hr(e, t, c) {
    if (t != null && typeof t != "object") throw Error(r(62));
    if (e = e.style, c != null) {
      for (var u in c) !c.hasOwnProperty(u) || t != null && t.hasOwnProperty(u) || (u.indexOf("--") === 0 ? e.setProperty(u, "") : u === "float" ? e.cssFloat = "" : e[u] = "");
      for (var l in t) u = t[l], t.hasOwnProperty(l) && c[l] !== u && yr(e, l, u);
    } else for (var o in t) t.hasOwnProperty(o) && yr(e, o, t[o]);
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
  var hs = /* @__PURE__ */ new Map([["acceptCharset", "accept-charset"], ["htmlFor", "for"], ["httpEquiv", "http-equiv"], ["crossOrigin", "crossorigin"], ["accentHeight", "accent-height"], ["alignmentBaseline", "alignment-baseline"], ["arabicForm", "arabic-form"], ["baselineShift", "baseline-shift"], ["capHeight", "cap-height"], ["clipPath", "clip-path"], ["clipRule", "clip-rule"], ["colorInterpolation", "color-interpolation"], ["colorInterpolationFilters", "color-interpolation-filters"], ["colorProfile", "color-profile"], ["colorRendering", "color-rendering"], ["dominantBaseline", "dominant-baseline"], ["enableBackground", "enable-background"], ["fillOpacity", "fill-opacity"], ["fillRule", "fill-rule"], ["floodColor", "flood-color"], ["floodOpacity", "flood-opacity"], ["fontFamily", "font-family"], ["fontSize", "font-size"], ["fontSizeAdjust", "font-size-adjust"], ["fontStretch", "font-stretch"], ["fontStyle", "font-style"], ["fontVariant", "font-variant"], ["fontWeight", "font-weight"], ["glyphName", "glyph-name"], ["glyphOrientationHorizontal", "glyph-orientation-horizontal"], ["glyphOrientationVertical", "glyph-orientation-vertical"], ["horizAdvX", "horiz-adv-x"], ["horizOriginX", "horiz-origin-x"], ["imageRendering", "image-rendering"], ["letterSpacing", "letter-spacing"], ["lightingColor", "lighting-color"], ["markerEnd", "marker-end"], ["markerMid", "marker-mid"], ["markerStart", "marker-start"], ["overlinePosition", "overline-position"], ["overlineThickness", "overline-thickness"], ["paintOrder", "paint-order"], ["panose-1", "panose-1"], ["pointerEvents", "pointer-events"], ["renderingIntent", "rendering-intent"], ["shapeRendering", "shape-rendering"], ["stopColor", "stop-color"], ["stopOpacity", "stop-opacity"], ["strikethroughPosition", "strikethrough-position"], ["strikethroughThickness", "strikethrough-thickness"], ["strokeDasharray", "stroke-dasharray"], ["strokeDashoffset", "stroke-dashoffset"], ["strokeLinecap", "stroke-linecap"], ["strokeLinejoin", "stroke-linejoin"], ["strokeMiterlimit", "stroke-miterlimit"], ["strokeOpacity", "stroke-opacity"], ["strokeWidth", "stroke-width"], ["textAnchor", "text-anchor"], ["textDecoration", "text-decoration"], ["textRendering", "text-rendering"], ["transformOrigin", "transform-origin"], ["underlinePosition", "underline-position"], ["underlineThickness", "underline-thickness"], ["unicodeBidi", "unicode-bidi"], ["unicodeRange", "unicode-range"], ["unitsPerEm", "units-per-em"], ["vAlphabetic", "v-alphabetic"], ["vHanging", "v-hanging"], ["vIdeographic", "v-ideographic"], ["vMathematical", "v-mathematical"], ["vectorEffect", "vector-effect"], ["vertAdvY", "vert-adv-y"], ["vertOriginX", "vert-origin-x"], ["vertOriginY", "vert-origin-y"], ["wordSpacing", "word-spacing"], ["writingMode", "writing-mode"], ["xmlnsXlink", "xmlns:xlink"], ["xHeight", "x-height"]]), js = /^[\u0000-\u001F ]*j[\r\n\t]*a[\r\n\t]*v[\r\n\t]*a[\r\n\t]*s[\r\n\t]*c[\r\n\t]*r[\r\n\t]*i[\r\n\t]*p[\r\n\t]*t[\r\n\t]*:/i;
  function xc(e) {
    return js.test("" + e) ? "javascript:throw new Error('React has blocked a javascript: URL as a security precaution.')" : e;
  }
  function Tt() {
  }
  var Ju = null;
  function Iu(e) {
    return e = e.target || e.srcElement || window, e.correspondingUseElement && (e = e.correspondingUseElement), e.nodeType === 3 ? e.parentNode : e;
  }
  var Fn = null, Qn = null;
  function jr(e) {
    var t = Vn(e);
    if (t && (e = t.stateNode)) {
      var c = e[Ge] || null;
      e: switch (e = t.stateNode, t.type) {
        case "input":
          if (Qu(e, c.value, c.defaultValue, c.defaultValue, c.checked, c.defaultChecked, c.type, c.name), t = c.name, c.type === "radio" && t != null) {
            for (c = e; c.parentNode; ) c = c.parentNode;
            for (c = c.querySelectorAll('input[name="' + ut("" + t) + '"][type="radio"]'), t = 0; t < c.length; t++) {
              var u = c[t];
              if (u !== e && u.form === e.form) {
                var l = u[Ge] || null;
                if (!l) throw Error(r(90));
                Qu(u, l.value, l.defaultValue, l.defaultValue, l.checked, l.defaultChecked, l.type, l.name);
              }
            }
            for (t = 0; t < c.length; t++) u = c[t], u.form === e.form && mr(u);
          }
          break e;
        case "textarea":
          wr(e, c.value, c.defaultValue);
          break e;
        case "select":
          t = c.value, t != null && Yn(e, !!c.multiple, t, false);
      }
    }
  }
  var $u = false;
  function vr(e, t, c) {
    if ($u) return e(t, c);
    $u = true;
    try {
      var u = e(t);
      return u;
    } finally {
      if ($u = false, (Fn !== null || Qn !== null) && (su(), Fn && (t = Fn, e = Qn, Qn = Fn = null, jr(t), e))) for (t = 0; t < e.length; t++) jr(e[t]);
    }
  }
  function Ma(e, t) {
    var c = e.stateNode;
    if (c === null) return null;
    var u = c[Ge] || null;
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
    if (c && typeof c != "function") throw Error(r(231, t, typeof c));
    return c;
  }
  var Mt = !(typeof window > "u" || typeof window.document > "u" || typeof window.document.createElement > "u"), Pu = false;
  if (Mt) try {
    var Da = {};
    Object.defineProperty(Da, "passive", { get: function() {
      Pu = true;
    } }), window.addEventListener("test", Da, Da), window.removeEventListener("test", Da, Da);
  } catch {
    Pu = false;
  }
  var Zt = null, ei = null, Ec = null;
  function Sr() {
    if (Ec) return Ec;
    var e, t = ei, c = t.length, u, l = "value" in Zt ? Zt.value : Zt.textContent, o = l.length;
    for (e = 0; e < c && t[e] === l[e]; e++) ;
    var _ = c - e;
    for (u = 1; u <= _ && t[c - u] === l[o - u]; u++) ;
    return Ec = l.slice(e, 1 < u ? 1 - u : void 0);
  }
  function Ac(e) {
    var t = e.keyCode;
    return "charCode" in e ? (e = e.charCode, e === 0 && t === 13 && (e = 13)) : e = t, e === 10 && (e = 13), 32 <= e || e === 13 ? e : 0;
  }
  function Tc() {
    return true;
  }
  function xr() {
    return false;
  }
  function Ve(e) {
    function t(c, u, l, o, _) {
      this._reactName = c, this._targetInst = l, this.type = u, this.nativeEvent = o, this.target = _, this.currentTarget = null;
      for (var s in e) e.hasOwnProperty(s) && (c = e[s], this[s] = c ? c(o) : o[s]);
      return this.isDefaultPrevented = (o.defaultPrevented != null ? o.defaultPrevented : o.returnValue === false) ? Tc : xr, this.isPropagationStopped = xr, this;
    }
    return R(t.prototype, { preventDefault: function() {
      this.defaultPrevented = true;
      var c = this.nativeEvent;
      c && (c.preventDefault ? c.preventDefault() : typeof c.returnValue != "unknown" && (c.returnValue = false), this.isDefaultPrevented = Tc);
    }, stopPropagation: function() {
      var c = this.nativeEvent;
      c && (c.stopPropagation ? c.stopPropagation() : typeof c.cancelBubble != "unknown" && (c.cancelBubble = true), this.isPropagationStopped = Tc);
    }, persist: function() {
    }, isPersistent: Tc }), t;
  }
  var jn = { eventPhase: 0, bubbles: 0, cancelable: 0, timeStamp: function(e) {
    return e.timeStamp || Date.now();
  }, defaultPrevented: 0, isTrusted: 0 }, Mc = Ve(jn), Ra = R({}, jn, { view: 0, detail: 0 }), vs = Ve(Ra), ti, ni, za, Dc = R({}, Ra, { screenX: 0, screenY: 0, clientX: 0, clientY: 0, pageX: 0, pageY: 0, ctrlKey: 0, shiftKey: 0, altKey: 0, metaKey: 0, getModifierState: ci, button: 0, buttons: 0, relatedTarget: function(e) {
    return e.relatedTarget === void 0 ? e.fromElement === e.srcElement ? e.toElement : e.fromElement : e.relatedTarget;
  }, movementX: function(e) {
    return "movementX" in e ? e.movementX : (e !== za && (za && e.type === "mousemove" ? (ti = e.screenX - za.screenX, ni = e.screenY - za.screenY) : ni = ti = 0, za = e), ti);
  }, movementY: function(e) {
    return "movementY" in e ? e.movementY : ni;
  } }), Er = Ve(Dc), Ss = R({}, Dc, { dataTransfer: 0 }), xs = Ve(Ss), Es = R({}, Ra, { relatedTarget: 0 }), ai = Ve(Es), As = R({}, jn, { animationName: 0, elapsedTime: 0, pseudoElement: 0 }), Ts = Ve(As), Ms = R({}, jn, { clipboardData: function(e) {
    return "clipboardData" in e ? e.clipboardData : window.clipboardData;
  } }), Ds = Ve(Ms), Rs = R({}, jn, { data: 0 }), Ar = Ve(Rs), zs = { Esc: "Escape", Spacebar: " ", Left: "ArrowLeft", Up: "ArrowUp", Right: "ArrowRight", Down: "ArrowDown", Del: "Delete", Win: "OS", Menu: "ContextMenu", Apps: "ContextMenu", Scroll: "ScrollLock", MozPrintableKey: "Unidentified" }, Cs = { 8: "Backspace", 9: "Tab", 12: "Clear", 13: "Enter", 16: "Shift", 17: "Control", 18: "Alt", 19: "Pause", 20: "CapsLock", 27: "Escape", 32: " ", 33: "PageUp", 34: "PageDown", 35: "End", 36: "Home", 37: "ArrowLeft", 38: "ArrowUp", 39: "ArrowRight", 40: "ArrowDown", 45: "Insert", 46: "Delete", 112: "F1", 113: "F2", 114: "F3", 115: "F4", 116: "F5", 117: "F6", 118: "F7", 119: "F8", 120: "F9", 121: "F10", 122: "F11", 123: "F12", 144: "NumLock", 145: "ScrollLock", 224: "Meta" }, Hs = { Alt: "altKey", Control: "ctrlKey", Meta: "metaKey", Shift: "shiftKey" };
  function Ns(e) {
    var t = this.nativeEvent;
    return t.getModifierState ? t.getModifierState(e) : (e = Hs[e]) ? !!t[e] : false;
  }
  function ci() {
    return Ns;
  }
  var Us = R({}, Ra, { key: function(e) {
    if (e.key) {
      var t = zs[e.key] || e.key;
      if (t !== "Unidentified") return t;
    }
    return e.type === "keypress" ? (e = Ac(e), e === 13 ? "Enter" : String.fromCharCode(e)) : e.type === "keydown" || e.type === "keyup" ? Cs[e.keyCode] || "Unidentified" : "";
  }, code: 0, location: 0, ctrlKey: 0, shiftKey: 0, altKey: 0, metaKey: 0, repeat: 0, locale: 0, getModifierState: ci, charCode: function(e) {
    return e.type === "keypress" ? Ac(e) : 0;
  }, keyCode: function(e) {
    return e.type === "keydown" || e.type === "keyup" ? e.keyCode : 0;
  }, which: function(e) {
    return e.type === "keypress" ? Ac(e) : e.type === "keydown" || e.type === "keyup" ? e.keyCode : 0;
  } }), Bs = Ve(Us), Ls = R({}, Dc, { pointerId: 0, width: 0, height: 0, pressure: 0, tangentialPressure: 0, tiltX: 0, tiltY: 0, twist: 0, pointerType: 0, isPrimary: 0 }), Tr = Ve(Ls), qs = R({}, Ra, { touches: 0, targetTouches: 0, changedTouches: 0, altKey: 0, metaKey: 0, ctrlKey: 0, shiftKey: 0, getModifierState: ci }), Gs = Ve(qs), Vs = R({}, jn, { propertyName: 0, elapsedTime: 0, pseudoElement: 0 }), Ws = Ve(Vs), ks = R({}, Dc, { deltaX: function(e) {
    return "deltaX" in e ? e.deltaX : "wheelDeltaX" in e ? -e.wheelDeltaX : 0;
  }, deltaY: function(e) {
    return "deltaY" in e ? e.deltaY : "wheelDeltaY" in e ? -e.wheelDeltaY : "wheelDelta" in e ? -e.wheelDelta : 0;
  }, deltaZ: 0, deltaMode: 0 }), Ys = Ve(ks), Xs = R({}, jn, { newState: 0, oldState: 0 }), Fs = Ve(Xs), Qs = [9, 13, 27, 32], ui = Mt && "CompositionEvent" in window, Ca = null;
  Mt && "documentMode" in document && (Ca = document.documentMode);
  var Zs = Mt && "TextEvent" in window && !Ca, Mr = Mt && (!ui || Ca && 8 < Ca && 11 >= Ca), Dr = " ", Rr = false;
  function zr(e, t) {
    switch (e) {
      case "keyup":
        return Qs.indexOf(t.keyCode) !== -1;
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
  function Cr(e) {
    return e = e.detail, typeof e == "object" && "data" in e ? e.data : null;
  }
  var Zn = false;
  function Ks(e, t) {
    switch (e) {
      case "compositionend":
        return Cr(t);
      case "keypress":
        return t.which !== 32 ? null : (Rr = true, Dr);
      case "textInput":
        return e = t.data, e === Dr && Rr ? null : e;
      default:
        return null;
    }
  }
  function Js(e, t) {
    if (Zn) return e === "compositionend" || !ui && zr(e, t) ? (e = Sr(), Ec = ei = Zt = null, Zn = false, e) : null;
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
        return Mr && t.locale !== "ko" ? null : t.data;
      default:
        return null;
    }
  }
  var Is = { color: true, date: true, datetime: true, "datetime-local": true, email: true, month: true, number: true, password: true, range: true, search: true, tel: true, text: true, time: true, url: true, week: true };
  function Hr(e) {
    var t = e && e.nodeName && e.nodeName.toLowerCase();
    return t === "input" ? !!Is[e.type] : t === "textarea";
  }
  function Nr(e, t, c, u) {
    Fn ? Qn ? Qn.push(u) : Qn = [u] : Fn = u, t = Ou(t, "onChange"), 0 < t.length && (c = new Mc("onChange", "change", null, c, u), e.push({ event: c, listeners: t }));
  }
  var Ha = null, Na = null;
  function $s(e) {
    Of(e, 0);
  }
  function Rc(e) {
    var t = Ta(e);
    if (mr(t)) return e;
  }
  function Ur(e, t) {
    if (e === "change") return t;
  }
  var Br = false;
  if (Mt) {
    var ii;
    if (Mt) {
      var li = "oninput" in document;
      if (!li) {
        var Lr = document.createElement("div");
        Lr.setAttribute("oninput", "return;"), li = typeof Lr.oninput == "function";
      }
      ii = li;
    } else ii = false;
    Br = ii && (!document.documentMode || 9 < document.documentMode);
  }
  function qr() {
    Ha && (Ha.detachEvent("onpropertychange", Gr), Na = Ha = null);
  }
  function Gr(e) {
    if (e.propertyName === "value" && Rc(Na)) {
      var t = [];
      Nr(t, Na, e, Iu(e)), vr($s, t);
    }
  }
  function Ps(e, t, c) {
    e === "focusin" ? (qr(), Ha = t, Na = c, Ha.attachEvent("onpropertychange", Gr)) : e === "focusout" && qr();
  }
  function eb(e) {
    if (e === "selectionchange" || e === "keyup" || e === "keydown") return Rc(Na);
  }
  function tb(e, t) {
    if (e === "click") return Rc(t);
  }
  function nb(e, t) {
    if (e === "input" || e === "change") return Rc(t);
  }
  function ab(e, t) {
    return e === t && (e !== 0 || 1 / e === 1 / t) || e !== e && t !== t;
  }
  var Je = typeof Object.is == "function" ? Object.is : ab;
  function Ua(e, t) {
    if (Je(e, t)) return true;
    if (typeof e != "object" || e === null || typeof t != "object" || t === null) return false;
    var c = Object.keys(e), u = Object.keys(t);
    if (c.length !== u.length) return false;
    for (u = 0; u < c.length; u++) {
      var l = c[u];
      if (!Lu.call(t, l) || !Je(e[l], t[l])) return false;
    }
    return true;
  }
  function Vr(e) {
    for (; e && e.firstChild; ) e = e.firstChild;
    return e;
  }
  function Wr(e, t) {
    var c = Vr(e);
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
      c = Vr(c);
    }
  }
  function kr(e, t) {
    return e && t ? e === t ? true : e && e.nodeType === 3 ? false : t && t.nodeType === 3 ? kr(e, t.parentNode) : "contains" in e ? e.contains(t) : e.compareDocumentPosition ? !!(e.compareDocumentPosition(t) & 16) : false : false;
  }
  function Yr(e) {
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
  function ri(e) {
    var t = e && e.nodeName && e.nodeName.toLowerCase();
    return t && (t === "input" && (e.type === "text" || e.type === "search" || e.type === "tel" || e.type === "url" || e.type === "password") || t === "textarea" || e.contentEditable === "true");
  }
  var cb = Mt && "documentMode" in document && 11 >= document.documentMode, Kn = null, oi = null, Ba = null, _i = false;
  function Xr(e, t, c) {
    var u = c.window === c ? c.document : c.nodeType === 9 ? c : c.ownerDocument;
    _i || Kn == null || Kn !== Sc(u) || (u = Kn, "selectionStart" in u && ri(u) ? u = { start: u.selectionStart, end: u.selectionEnd } : (u = (u.ownerDocument && u.ownerDocument.defaultView || window).getSelection(), u = { anchorNode: u.anchorNode, anchorOffset: u.anchorOffset, focusNode: u.focusNode, focusOffset: u.focusOffset }), Ba && Ua(Ba, u) || (Ba = u, u = Ou(oi, "onSelect"), 0 < u.length && (t = new Mc("onSelect", "select", null, t, c), e.push({ event: t, listeners: u }), t.target = Kn)));
  }
  function vn(e, t) {
    var c = {};
    return c[e.toLowerCase()] = t.toLowerCase(), c["Webkit" + e] = "webkit" + t, c["Moz" + e] = "moz" + t, c;
  }
  var Jn = { animationend: vn("Animation", "AnimationEnd"), animationiteration: vn("Animation", "AnimationIteration"), animationstart: vn("Animation", "AnimationStart"), transitionrun: vn("Transition", "TransitionRun"), transitionstart: vn("Transition", "TransitionStart"), transitioncancel: vn("Transition", "TransitionCancel"), transitionend: vn("Transition", "TransitionEnd") }, fi = {}, Fr = {};
  Mt && (Fr = document.createElement("div").style, "AnimationEvent" in window || (delete Jn.animationend.animation, delete Jn.animationiteration.animation, delete Jn.animationstart.animation), "TransitionEvent" in window || delete Jn.transitionend.transition);
  function Sn(e) {
    if (fi[e]) return fi[e];
    if (!Jn[e]) return e;
    var t = Jn[e], c;
    for (c in t) if (t.hasOwnProperty(c) && c in Fr) return fi[e] = t[c];
    return e;
  }
  var Qr = Sn("animationend"), Zr = Sn("animationiteration"), Kr = Sn("animationstart"), ub = Sn("transitionrun"), ib = Sn("transitionstart"), lb = Sn("transitioncancel"), Jr = Sn("transitionend"), Ir = /* @__PURE__ */ new Map(), si = "abort auxClick beforeToggle cancel canPlay canPlayThrough click close contextMenu copy cut drag dragEnd dragEnter dragExit dragLeave dragOver dragStart drop durationChange emptied encrypted ended error gotPointerCapture input invalid keyDown keyPress keyUp load loadedData loadedMetadata loadStart lostPointerCapture mouseDown mouseMove mouseOut mouseOver mouseUp paste pause play playing pointerCancel pointerDown pointerMove pointerOut pointerOver pointerUp progress rateChange reset resize seeked seeking stalled submit suspend timeUpdate touchCancel touchEnd touchStart volumeChange scroll toggle touchMove waiting wheel".split(" ");
  si.push("scrollEnd");
  function gt(e, t) {
    Ir.set(e, t), hn(t, [e]);
  }
  var zc = typeof reportError == "function" ? reportError : function(e) {
    if (typeof window == "object" && typeof window.ErrorEvent == "function") {
      var t = new window.ErrorEvent("error", { bubbles: true, cancelable: true, message: typeof e == "object" && e !== null && typeof e.message == "string" ? String(e.message) : String(e), error: e });
      if (!window.dispatchEvent(t)) return;
    } else if (typeof process == "object" && typeof process.emit == "function") {
      process.emit("uncaughtException", e);
      return;
    }
    console.error(e);
  }, it = [], In = 0, bi = 0;
  function Cc() {
    for (var e = In, t = bi = In = 0; t < e; ) {
      var c = it[t];
      it[t++] = null;
      var u = it[t];
      it[t++] = null;
      var l = it[t];
      it[t++] = null;
      var o = it[t];
      if (it[t++] = null, u !== null && l !== null) {
        var _ = u.pending;
        _ === null ? l.next = l : (l.next = _.next, _.next = l), u.pending = l;
      }
      o !== 0 && $r(c, l, o);
    }
  }
  function Hc(e, t, c, u) {
    it[In++] = e, it[In++] = t, it[In++] = c, it[In++] = u, bi |= u, e.lanes |= u, e = e.alternate, e !== null && (e.lanes |= u);
  }
  function di(e, t, c, u) {
    return Hc(e, t, c, u), Nc(e);
  }
  function xn(e, t) {
    return Hc(e, null, null, t), Nc(e);
  }
  function $r(e, t, c) {
    e.lanes |= c;
    var u = e.alternate;
    u !== null && (u.lanes |= c);
    for (var l = false, o = e.return; o !== null; ) o.childLanes |= c, u = o.alternate, u !== null && (u.childLanes |= c), o.tag === 22 && (e = o.stateNode, e === null || e._visibility & 1 || (l = true)), e = o, o = o.return;
    return e.tag === 3 ? (o = e.stateNode, l && t !== null && (l = 31 - Ke(c), e = o.hiddenUpdates, u = e[l], u === null ? e[l] = [t] : u.push(t), t.lane = c | 536870912), o) : null;
  }
  function Nc(e) {
    if (50 < uc) throw uc = 0, vl = null, Error(r(185));
    for (var t = e.return; t !== null; ) e = t, t = e.return;
    return e.tag === 3 ? e.stateNode : null;
  }
  var $n = {};
  function rb(e, t, c, u) {
    this.tag = e, this.key = c, this.sibling = this.child = this.return = this.stateNode = this.type = this.elementType = null, this.index = 0, this.refCleanup = this.ref = null, this.pendingProps = t, this.dependencies = this.memoizedState = this.updateQueue = this.memoizedProps = null, this.mode = u, this.subtreeFlags = this.flags = 0, this.deletions = null, this.childLanes = this.lanes = 0, this.alternate = null;
  }
  function Ie(e, t, c, u) {
    return new rb(e, t, c, u);
  }
  function gi(e) {
    return e = e.prototype, !(!e || !e.isReactComponent);
  }
  function Dt(e, t) {
    var c = e.alternate;
    return c === null ? (c = Ie(e.tag, t, e.key, e.mode), c.elementType = e.elementType, c.type = e.type, c.stateNode = e.stateNode, c.alternate = e, e.alternate = c) : (c.pendingProps = t, c.type = e.type, c.flags = 0, c.subtreeFlags = 0, c.deletions = null), c.flags = e.flags & 65011712, c.childLanes = e.childLanes, c.lanes = e.lanes, c.child = e.child, c.memoizedProps = e.memoizedProps, c.memoizedState = e.memoizedState, c.updateQueue = e.updateQueue, t = e.dependencies, c.dependencies = t === null ? null : { lanes: t.lanes, firstContext: t.firstContext }, c.sibling = e.sibling, c.index = e.index, c.ref = e.ref, c.refCleanup = e.refCleanup, c;
  }
  function Pr(e, t) {
    e.flags &= 65011714;
    var c = e.alternate;
    return c === null ? (e.childLanes = 0, e.lanes = t, e.child = null, e.subtreeFlags = 0, e.memoizedProps = null, e.memoizedState = null, e.updateQueue = null, e.dependencies = null, e.stateNode = null) : (e.childLanes = c.childLanes, e.lanes = c.lanes, e.child = c.child, e.subtreeFlags = 0, e.deletions = null, e.memoizedProps = c.memoizedProps, e.memoizedState = c.memoizedState, e.updateQueue = c.updateQueue, e.type = c.type, t = c.dependencies, e.dependencies = t === null ? null : { lanes: t.lanes, firstContext: t.firstContext }), e;
  }
  function Uc(e, t, c, u, l, o) {
    var _ = 0;
    if (u = e, typeof e == "function") gi(e) && (_ = 1);
    else if (typeof e == "string") _ = bd(e, c, B.current) ? 26 : e === "html" || e === "head" || e === "body" ? 27 : 5;
    else e: switch (e) {
      case yt:
        return e = Ie(31, c, t, l), e.elementType = yt, e.lanes = o, e;
      case xe:
        return En(c.children, l, o, t);
      case wt:
        _ = 8, l |= 24;
        break;
      case He:
        return e = Ie(12, c, t, l | 2), e.elementType = He, e.lanes = o, e;
      case Ot:
        return e = Ie(13, c, t, l), e.elementType = Ot, e.lanes = o, e;
      case Be:
        return e = Ie(19, c, t, l), e.elementType = Be, e.lanes = o, e;
      default:
        if (typeof e == "object" && e !== null) switch (e.$$typeof) {
          case Ce:
            _ = 10;
            break e;
          case Xt:
            _ = 9;
            break e;
          case at:
            _ = 11;
            break e;
          case J:
            _ = 14;
            break e;
          case Le:
            _ = 16, u = null;
            break e;
        }
        _ = 29, c = Error(r(130, e === null ? "null" : typeof e, "")), u = null;
    }
    return t = Ie(_, c, t, l), t.elementType = e, t.type = u, t.lanes = o, t;
  }
  function En(e, t, c, u) {
    return e = Ie(7, e, u, t), e.lanes = c, e;
  }
  function mi(e, t, c) {
    return e = Ie(6, e, null, t), e.lanes = c, e;
  }
  function eo(e) {
    var t = Ie(18, null, null, 0);
    return t.stateNode = e, t;
  }
  function pi(e, t, c) {
    return t = Ie(4, e.children !== null ? e.children : [], e.key, t), t.lanes = c, t.stateNode = { containerInfo: e.containerInfo, pendingChildren: null, implementation: e.implementation }, t;
  }
  var to = /* @__PURE__ */ new WeakMap();
  function lt(e, t) {
    if (typeof e == "object" && e !== null) {
      var c = to.get(e);
      return c !== void 0 ? c : (t = { value: e, source: t, stack: er(t) }, to.set(e, t), t);
    }
    return { value: e, source: t, stack: er(t) };
  }
  var Pn = [], ea = 0, Bc = null, La = 0, rt = [], ot = 0, Kt = null, jt = 1, vt = "";
  function Rt(e, t) {
    Pn[ea++] = La, Pn[ea++] = Bc, Bc = e, La = t;
  }
  function no(e, t, c) {
    rt[ot++] = jt, rt[ot++] = vt, rt[ot++] = Kt, Kt = e;
    var u = jt;
    e = vt;
    var l = 32 - Ke(u) - 1;
    u &= ~(1 << l), c += 1;
    var o = 32 - Ke(t) + l;
    if (30 < o) {
      var _ = l - l % 5;
      o = (u & (1 << _) - 1).toString(32), u >>= _, l -= _, jt = 1 << 32 - Ke(t) + l | c << l | u, vt = o + e;
    } else jt = 1 << o | c << l | u, vt = e;
  }
  function wi(e) {
    e.return !== null && (Rt(e, 1), no(e, 1, 0));
  }
  function Oi(e) {
    for (; e === Bc; ) Bc = Pn[--ea], Pn[ea] = null, La = Pn[--ea], Pn[ea] = null;
    for (; e === Kt; ) Kt = rt[--ot], rt[ot] = null, vt = rt[--ot], rt[ot] = null, jt = rt[--ot], rt[ot] = null;
  }
  function ao(e, t) {
    rt[ot++] = jt, rt[ot++] = vt, rt[ot++] = Kt, jt = t.id, vt = t.overflow, Kt = e;
  }
  var Me = null, se = null, I = false, Jt = null, _t = false, yi = Error(r(519));
  function It(e) {
    var t = Error(r(418, 1 < arguments.length && arguments[1] !== void 0 && arguments[1] ? "text" : "HTML", ""));
    throw qa(lt(t, e)), yi;
  }
  function co(e) {
    var t = e.stateNode, c = e.type, u = e.memoizedProps;
    switch (t[Te] = e, t[Ge] = u, c) {
      case "dialog":
        Q("cancel", t), Q("close", t);
        break;
      case "iframe":
      case "object":
      case "embed":
        Q("load", t);
        break;
      case "video":
      case "audio":
        for (c = 0; c < lc.length; c++) Q(lc[c], t);
        break;
      case "source":
        Q("error", t);
        break;
      case "img":
      case "image":
      case "link":
        Q("error", t), Q("load", t);
        break;
      case "details":
        Q("toggle", t);
        break;
      case "input":
        Q("invalid", t), pr(t, u.value, u.defaultValue, u.checked, u.defaultChecked, u.type, u.name, true);
        break;
      case "select":
        Q("invalid", t);
        break;
      case "textarea":
        Q("invalid", t), Or(t, u.value, u.defaultValue, u.children);
    }
    c = u.children, typeof c != "string" && typeof c != "number" && typeof c != "bigint" || t.textContent === "" + c || u.suppressHydrationWarning === true || vf(t.textContent, c) ? (u.popover != null && (Q("beforetoggle", t), Q("toggle", t)), u.onScroll != null && Q("scroll", t), u.onScrollEnd != null && Q("scrollend", t), u.onClick != null && (t.onclick = Tt), t = true) : t = false, t || It(e, true);
  }
  function uo(e) {
    for (Me = e.return; Me; ) switch (Me.tag) {
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
        Me = Me.return;
    }
  }
  function ta(e) {
    if (e !== Me) return false;
    if (!I) return uo(e), I = true, false;
    var t = e.tag, c;
    if ((c = t !== 3 && t !== 27) && ((c = t === 5) && (c = e.type, c = !(c !== "form" && c !== "button") || Ll(e.type, e.memoizedProps)), c = !c), c && se && It(e), uo(e), t === 13) {
      if (e = e.memoizedState, e = e !== null ? e.dehydrated : null, !e) throw Error(r(317));
      se = zf(e);
    } else if (t === 31) {
      if (e = e.memoizedState, e = e !== null ? e.dehydrated : null, !e) throw Error(r(317));
      se = zf(e);
    } else t === 27 ? (t = se, sn(e.type) ? (e = kl, kl = null, se = e) : se = t) : se = Me ? st(e.stateNode.nextSibling) : null;
    return true;
  }
  function An() {
    se = Me = null, I = false;
  }
  function hi() {
    var e = Jt;
    return e !== null && (Xe === null ? Xe = e : Xe.push.apply(Xe, e), Jt = null), e;
  }
  function qa(e) {
    Jt === null ? Jt = [e] : Jt.push(e);
  }
  var ji = p(null), Tn = null, zt = null;
  function $t(e, t, c) {
    H(ji, t._currentValue), t._currentValue = c;
  }
  function Ct(e) {
    e._currentValue = ji.current, D(ji);
  }
  function vi(e, t, c) {
    for (; e !== null; ) {
      var u = e.alternate;
      if ((e.childLanes & t) !== t ? (e.childLanes |= t, u !== null && (u.childLanes |= t)) : u !== null && (u.childLanes & t) !== t && (u.childLanes |= t), e === c) break;
      e = e.return;
    }
  }
  function Si(e, t, c, u) {
    var l = e.child;
    for (l !== null && (l.return = e); l !== null; ) {
      var o = l.dependencies;
      if (o !== null) {
        var _ = l.child;
        o = o.firstContext;
        e: for (; o !== null; ) {
          var s = o;
          o = l;
          for (var d = 0; d < t.length; d++) if (s.context === t[d]) {
            o.lanes |= c, s = o.alternate, s !== null && (s.lanes |= c), vi(o.return, c, e), u || (_ = null);
            break e;
          }
          o = s.next;
        }
      } else if (l.tag === 18) {
        if (_ = l.return, _ === null) throw Error(r(341));
        _.lanes |= c, o = _.alternate, o !== null && (o.lanes |= c), vi(_, c, e), _ = null;
      } else _ = l.child;
      if (_ !== null) _.return = l;
      else for (_ = l; _ !== null; ) {
        if (_ === e) {
          _ = null;
          break;
        }
        if (l = _.sibling, l !== null) {
          l.return = _.return, _ = l;
          break;
        }
        _ = _.return;
      }
      l = _;
    }
  }
  function na(e, t, c, u) {
    e = null;
    for (var l = t, o = false; l !== null; ) {
      if (!o) {
        if ((l.flags & 524288) !== 0) o = true;
        else if ((l.flags & 262144) !== 0) break;
      }
      if (l.tag === 10) {
        var _ = l.alternate;
        if (_ === null) throw Error(r(387));
        if (_ = _.memoizedProps, _ !== null) {
          var s = l.type;
          Je(l.pendingProps.value, _.value) || (e !== null ? e.push(s) : e = [s]);
        }
      } else if (l === te.current) {
        if (_ = l.alternate, _ === null) throw Error(r(387));
        _.memoizedState.memoizedState !== l.memoizedState.memoizedState && (e !== null ? e.push(sc) : e = [sc]);
      }
      l = l.return;
    }
    e !== null && Si(t, e, c, u), t.flags |= 262144;
  }
  function Lc(e) {
    for (e = e.firstContext; e !== null; ) {
      if (!Je(e.context._currentValue, e.memoizedValue)) return true;
      e = e.next;
    }
    return false;
  }
  function Mn(e) {
    Tn = e, zt = null, e = e.dependencies, e !== null && (e.firstContext = null);
  }
  function De(e) {
    return io(Tn, e);
  }
  function qc(e, t) {
    return Tn === null && Mn(e), io(e, t);
  }
  function io(e, t) {
    var c = t._currentValue;
    if (t = { context: t, memoizedValue: c, next: null }, zt === null) {
      if (e === null) throw Error(r(308));
      zt = t, e.dependencies = { lanes: 0, firstContext: t }, e.flags |= 524288;
    } else zt = zt.next = t;
    return c;
  }
  var ob = typeof AbortController < "u" ? AbortController : function() {
    var e = [], t = this.signal = { aborted: false, addEventListener: function(c, u) {
      e.push(u);
    } };
    this.abort = function() {
      t.aborted = true, e.forEach(function(c) {
        return c();
      });
    };
  }, _b = n.unstable_scheduleCallback, fb = n.unstable_NormalPriority, ye = { $$typeof: Ce, Consumer: null, Provider: null, _currentValue: null, _currentValue2: null, _threadCount: 0 };
  function xi() {
    return { controller: new ob(), data: /* @__PURE__ */ new Map(), refCount: 0 };
  }
  function Ga(e) {
    e.refCount--, e.refCount === 0 && _b(fb, function() {
      e.controller.abort();
    });
  }
  var Va = null, Ei = 0, aa = 0, ca = null;
  function sb(e, t) {
    if (Va === null) {
      var c = Va = [];
      Ei = 0, aa = Ml(), ca = { status: "pending", value: void 0, then: function(u) {
        c.push(u);
      } };
    }
    return Ei++, t.then(lo, lo), t;
  }
  function lo() {
    if (--Ei === 0 && Va !== null) {
      ca !== null && (ca.status = "fulfilled");
      var e = Va;
      Va = null, aa = 0, ca = null;
      for (var t = 0; t < e.length; t++) (0, e[t])();
    }
  }
  function bb(e, t) {
    var c = [], u = { status: "pending", value: null, reason: null, then: function(l) {
      c.push(l);
    } };
    return e.then(function() {
      u.status = "fulfilled", u.value = t;
      for (var l = 0; l < c.length; l++) (0, c[l])(t);
    }, function(l) {
      for (u.status = "rejected", u.reason = l, l = 0; l < c.length; l++) (0, c[l])(void 0);
    }), u;
  }
  var ro = A.S;
  A.S = function(e, t) {
    F_ = Qe(), typeof t == "object" && t !== null && typeof t.then == "function" && sb(e, t), ro !== null && ro(e, t);
  };
  var Dn = p(null);
  function Ai() {
    var e = Dn.current;
    return e !== null ? e : _e.pooledCache;
  }
  function Gc(e, t) {
    t === null ? H(Dn, Dn.current) : H(Dn, t.pool);
  }
  function oo() {
    var e = Ai();
    return e === null ? null : { parent: ye._currentValue, pool: e };
  }
  var ua = Error(r(460)), Ti = Error(r(474)), Vc = Error(r(542)), Wc = { then: function() {
  } };
  function _o(e) {
    return e = e.status, e === "fulfilled" || e === "rejected";
  }
  function fo(e, t, c) {
    switch (c = e[c], c === void 0 ? e.push(t) : c !== t && (t.then(Tt, Tt), t = c), t.status) {
      case "fulfilled":
        return t.value;
      case "rejected":
        throw e = t.reason, bo(e), e;
      default:
        if (typeof t.status == "string") t.then(Tt, Tt);
        else {
          if (e = _e, e !== null && 100 < e.shellSuspendCounter) throw Error(r(482));
          e = t, e.status = "pending", e.then(function(u) {
            if (t.status === "pending") {
              var l = t;
              l.status = "fulfilled", l.value = u;
            }
          }, function(u) {
            if (t.status === "pending") {
              var l = t;
              l.status = "rejected", l.reason = u;
            }
          });
        }
        switch (t.status) {
          case "fulfilled":
            return t.value;
          case "rejected":
            throw e = t.reason, bo(e), e;
        }
        throw zn = t, ua;
    }
  }
  function Rn(e) {
    try {
      var t = e._init;
      return t(e._payload);
    } catch (c) {
      throw c !== null && typeof c == "object" && typeof c.then == "function" ? (zn = c, ua) : c;
    }
  }
  var zn = null;
  function so() {
    if (zn === null) throw Error(r(459));
    var e = zn;
    return zn = null, e;
  }
  function bo(e) {
    if (e === ua || e === Vc) throw Error(r(483));
  }
  var ia = null, Wa = 0;
  function kc(e) {
    var t = Wa;
    return Wa += 1, ia === null && (ia = []), fo(ia, e, t);
  }
  function ka(e, t) {
    t = t.props.ref, e.ref = t !== void 0 ? t : null;
  }
  function Yc(e, t) {
    throw t.$$typeof === U ? Error(r(525)) : (e = Object.prototype.toString.call(t), Error(r(31, e === "[object Object]" ? "object with keys {" + Object.keys(t).join(", ") + "}" : e)));
  }
  function go(e) {
    function t(O, m) {
      if (e) {
        var j = O.deletions;
        j === null ? (O.deletions = [m], O.flags |= 16) : j.push(m);
      }
    }
    function c(O, m) {
      if (!e) return null;
      for (; m !== null; ) t(O, m), m = m.sibling;
      return null;
    }
    function u(O) {
      for (var m = /* @__PURE__ */ new Map(); O !== null; ) O.key !== null ? m.set(O.key, O) : m.set(O.index, O), O = O.sibling;
      return m;
    }
    function l(O, m) {
      return O = Dt(O, m), O.index = 0, O.sibling = null, O;
    }
    function o(O, m, j) {
      return O.index = j, e ? (j = O.alternate, j !== null ? (j = j.index, j < m ? (O.flags |= 67108866, m) : j) : (O.flags |= 67108866, m)) : (O.flags |= 1048576, m);
    }
    function _(O) {
      return e && O.alternate === null && (O.flags |= 67108866), O;
    }
    function s(O, m, j, T) {
      return m === null || m.tag !== 6 ? (m = mi(j, O.mode, T), m.return = O, m) : (m = l(m, j), m.return = O, m);
    }
    function d(O, m, j, T) {
      var q = j.type;
      return q === xe ? E(O, m, j.props.children, T, j.key) : m !== null && (m.elementType === q || typeof q == "object" && q !== null && q.$$typeof === Le && Rn(q) === m.type) ? (m = l(m, j.props), ka(m, j), m.return = O, m) : (m = Uc(j.type, j.key, j.props, null, O.mode, T), ka(m, j), m.return = O, m);
    }
    function v(O, m, j, T) {
      return m === null || m.tag !== 4 || m.stateNode.containerInfo !== j.containerInfo || m.stateNode.implementation !== j.implementation ? (m = pi(j, O.mode, T), m.return = O, m) : (m = l(m, j.children || []), m.return = O, m);
    }
    function E(O, m, j, T, q) {
      return m === null || m.tag !== 7 ? (m = En(j, O.mode, T, q), m.return = O, m) : (m = l(m, j), m.return = O, m);
    }
    function M(O, m, j) {
      if (typeof m == "string" && m !== "" || typeof m == "number" || typeof m == "bigint") return m = mi("" + m, O.mode, j), m.return = O, m;
      if (typeof m == "object" && m !== null) {
        switch (m.$$typeof) {
          case re:
            return j = Uc(m.type, m.key, m.props, null, O.mode, j), ka(j, m), j.return = O, j;
          case fe:
            return m = pi(m, O.mode, j), m.return = O, m;
          case Le:
            return m = Rn(m), M(O, m, j);
        }
        if (dt(m) || qe(m)) return m = En(m, O.mode, j, null), m.return = O, m;
        if (typeof m.then == "function") return M(O, kc(m), j);
        if (m.$$typeof === Ce) return M(O, qc(O, m), j);
        Yc(O, m);
      }
      return null;
    }
    function S(O, m, j, T) {
      var q = m !== null ? m.key : null;
      if (typeof j == "string" && j !== "" || typeof j == "number" || typeof j == "bigint") return q !== null ? null : s(O, m, "" + j, T);
      if (typeof j == "object" && j !== null) {
        switch (j.$$typeof) {
          case re:
            return j.key === q ? d(O, m, j, T) : null;
          case fe:
            return j.key === q ? v(O, m, j, T) : null;
          case Le:
            return j = Rn(j), S(O, m, j, T);
        }
        if (dt(j) || qe(j)) return q !== null ? null : E(O, m, j, T, null);
        if (typeof j.then == "function") return S(O, m, kc(j), T);
        if (j.$$typeof === Ce) return S(O, m, qc(O, j), T);
        Yc(O, j);
      }
      return null;
    }
    function x(O, m, j, T, q) {
      if (typeof T == "string" && T !== "" || typeof T == "number" || typeof T == "bigint") return O = O.get(j) || null, s(m, O, "" + T, q);
      if (typeof T == "object" && T !== null) {
        switch (T.$$typeof) {
          case re:
            return O = O.get(T.key === null ? j : T.key) || null, d(m, O, T, q);
          case fe:
            return O = O.get(T.key === null ? j : T.key) || null, v(m, O, T, q);
          case Le:
            return T = Rn(T), x(O, m, j, T, q);
        }
        if (dt(T) || qe(T)) return O = O.get(j) || null, E(m, O, T, q, null);
        if (typeof T.then == "function") return x(O, m, j, kc(T), q);
        if (T.$$typeof === Ce) return x(O, m, j, qc(m, T), q);
        Yc(m, T);
      }
      return null;
    }
    function N(O, m, j, T) {
      for (var q = null, $ = null, L = m, Y = m = 0, K = null; L !== null && Y < j.length; Y++) {
        L.index > Y ? (K = L, L = null) : K = L.sibling;
        var P = S(O, L, j[Y], T);
        if (P === null) {
          L === null && (L = K);
          break;
        }
        e && L && P.alternate === null && t(O, L), m = o(P, m, Y), $ === null ? q = P : $.sibling = P, $ = P, L = K;
      }
      if (Y === j.length) return c(O, L), I && Rt(O, Y), q;
      if (L === null) {
        for (; Y < j.length; Y++) L = M(O, j[Y], T), L !== null && (m = o(L, m, Y), $ === null ? q = L : $.sibling = L, $ = L);
        return I && Rt(O, Y), q;
      }
      for (L = u(L); Y < j.length; Y++) K = x(L, O, Y, j[Y], T), K !== null && (e && K.alternate !== null && L.delete(K.key === null ? Y : K.key), m = o(K, m, Y), $ === null ? q = K : $.sibling = K, $ = K);
      return e && L.forEach(function(pn) {
        return t(O, pn);
      }), I && Rt(O, Y), q;
    }
    function G(O, m, j, T) {
      if (j == null) throw Error(r(151));
      for (var q = null, $ = null, L = m, Y = m = 0, K = null, P = j.next(); L !== null && !P.done; Y++, P = j.next()) {
        L.index > Y ? (K = L, L = null) : K = L.sibling;
        var pn = S(O, L, P.value, T);
        if (pn === null) {
          L === null && (L = K);
          break;
        }
        e && L && pn.alternate === null && t(O, L), m = o(pn, m, Y), $ === null ? q = pn : $.sibling = pn, $ = pn, L = K;
      }
      if (P.done) return c(O, L), I && Rt(O, Y), q;
      if (L === null) {
        for (; !P.done; Y++, P = j.next()) P = M(O, P.value, T), P !== null && (m = o(P, m, Y), $ === null ? q = P : $.sibling = P, $ = P);
        return I && Rt(O, Y), q;
      }
      for (L = u(L); !P.done; Y++, P = j.next()) P = x(L, O, Y, P.value, T), P !== null && (e && P.alternate !== null && L.delete(P.key === null ? Y : P.key), m = o(P, m, Y), $ === null ? q = P : $.sibling = P, $ = P);
      return e && L.forEach(function(Sd) {
        return t(O, Sd);
      }), I && Rt(O, Y), q;
    }
    function le(O, m, j, T) {
      if (typeof j == "object" && j !== null && j.type === xe && j.key === null && (j = j.props.children), typeof j == "object" && j !== null) {
        switch (j.$$typeof) {
          case re:
            e: {
              for (var q = j.key; m !== null; ) {
                if (m.key === q) {
                  if (q = j.type, q === xe) {
                    if (m.tag === 7) {
                      c(O, m.sibling), T = l(m, j.props.children), T.return = O, O = T;
                      break e;
                    }
                  } else if (m.elementType === q || typeof q == "object" && q !== null && q.$$typeof === Le && Rn(q) === m.type) {
                    c(O, m.sibling), T = l(m, j.props), ka(T, j), T.return = O, O = T;
                    break e;
                  }
                  c(O, m);
                  break;
                } else t(O, m);
                m = m.sibling;
              }
              j.type === xe ? (T = En(j.props.children, O.mode, T, j.key), T.return = O, O = T) : (T = Uc(j.type, j.key, j.props, null, O.mode, T), ka(T, j), T.return = O, O = T);
            }
            return _(O);
          case fe:
            e: {
              for (q = j.key; m !== null; ) {
                if (m.key === q) if (m.tag === 4 && m.stateNode.containerInfo === j.containerInfo && m.stateNode.implementation === j.implementation) {
                  c(O, m.sibling), T = l(m, j.children || []), T.return = O, O = T;
                  break e;
                } else {
                  c(O, m);
                  break;
                }
                else t(O, m);
                m = m.sibling;
              }
              T = pi(j, O.mode, T), T.return = O, O = T;
            }
            return _(O);
          case Le:
            return j = Rn(j), le(O, m, j, T);
        }
        if (dt(j)) return N(O, m, j, T);
        if (qe(j)) {
          if (q = qe(j), typeof q != "function") throw Error(r(150));
          return j = q.call(j), G(O, m, j, T);
        }
        if (typeof j.then == "function") return le(O, m, kc(j), T);
        if (j.$$typeof === Ce) return le(O, m, qc(O, j), T);
        Yc(O, j);
      }
      return typeof j == "string" && j !== "" || typeof j == "number" || typeof j == "bigint" ? (j = "" + j, m !== null && m.tag === 6 ? (c(O, m.sibling), T = l(m, j), T.return = O, O = T) : (c(O, m), T = mi(j, O.mode, T), T.return = O, O = T), _(O)) : c(O, m);
    }
    return function(O, m, j, T) {
      try {
        Wa = 0;
        var q = le(O, m, j, T);
        return ia = null, q;
      } catch (L) {
        if (L === ua || L === Vc) throw L;
        var $ = Ie(29, L, null, O.mode);
        return $.lanes = T, $.return = O, $;
      } finally {
      }
    };
  }
  var Cn = go(true), mo = go(false), Pt = false;
  function Mi(e) {
    e.updateQueue = { baseState: e.memoizedState, firstBaseUpdate: null, lastBaseUpdate: null, shared: { pending: null, lanes: 0, hiddenCallbacks: null }, callbacks: null };
  }
  function Di(e, t) {
    e = e.updateQueue, t.updateQueue === e && (t.updateQueue = { baseState: e.baseState, firstBaseUpdate: e.firstBaseUpdate, lastBaseUpdate: e.lastBaseUpdate, shared: e.shared, callbacks: null });
  }
  function en(e) {
    return { lane: e, tag: 0, payload: null, callback: null, next: null };
  }
  function tn(e, t, c) {
    var u = e.updateQueue;
    if (u === null) return null;
    if (u = u.shared, (ee & 2) !== 0) {
      var l = u.pending;
      return l === null ? t.next = t : (t.next = l.next, l.next = t), u.pending = t, t = Nc(e), $r(e, null, c), t;
    }
    return Hc(e, u, t, c), Nc(e);
  }
  function Ya(e, t, c) {
    if (t = t.updateQueue, t !== null && (t = t.shared, (c & 4194048) !== 0)) {
      var u = t.lanes;
      u &= e.pendingLanes, c |= u, t.lanes = c, ir(e, c);
    }
  }
  function Ri(e, t) {
    var c = e.updateQueue, u = e.alternate;
    if (u !== null && (u = u.updateQueue, c === u)) {
      var l = null, o = null;
      if (c = c.firstBaseUpdate, c !== null) {
        do {
          var _ = { lane: c.lane, tag: c.tag, payload: c.payload, callback: null, next: null };
          o === null ? l = o = _ : o = o.next = _, c = c.next;
        } while (c !== null);
        o === null ? l = o = t : o = o.next = t;
      } else l = o = t;
      c = { baseState: u.baseState, firstBaseUpdate: l, lastBaseUpdate: o, shared: u.shared, callbacks: u.callbacks }, e.updateQueue = c;
      return;
    }
    e = c.lastBaseUpdate, e === null ? c.firstBaseUpdate = t : e.next = t, c.lastBaseUpdate = t;
  }
  var zi = false;
  function Xa() {
    if (zi) {
      var e = ca;
      if (e !== null) throw e;
    }
  }
  function Fa(e, t, c, u) {
    zi = false;
    var l = e.updateQueue;
    Pt = false;
    var o = l.firstBaseUpdate, _ = l.lastBaseUpdate, s = l.shared.pending;
    if (s !== null) {
      l.shared.pending = null;
      var d = s, v = d.next;
      d.next = null, _ === null ? o = v : _.next = v, _ = d;
      var E = e.alternate;
      E !== null && (E = E.updateQueue, s = E.lastBaseUpdate, s !== _ && (s === null ? E.firstBaseUpdate = v : s.next = v, E.lastBaseUpdate = d));
    }
    if (o !== null) {
      var M = l.baseState;
      _ = 0, E = v = d = null, s = o;
      do {
        var S = s.lane & -536870913, x = S !== s.lane;
        if (x ? (Z & S) === S : (u & S) === S) {
          S !== 0 && S === aa && (zi = true), E !== null && (E = E.next = { lane: 0, tag: s.tag, payload: s.payload, callback: null, next: null });
          e: {
            var N = e, G = s;
            S = t;
            var le = c;
            switch (G.tag) {
              case 1:
                if (N = G.payload, typeof N == "function") {
                  M = N.call(le, M, S);
                  break e;
                }
                M = N;
                break e;
              case 3:
                N.flags = N.flags & -65537 | 128;
              case 0:
                if (N = G.payload, S = typeof N == "function" ? N.call(le, M, S) : N, S == null) break e;
                M = R({}, M, S);
                break e;
              case 2:
                Pt = true;
            }
          }
          S = s.callback, S !== null && (e.flags |= 64, x && (e.flags |= 8192), x = l.callbacks, x === null ? l.callbacks = [S] : x.push(S));
        } else x = { lane: S, tag: s.tag, payload: s.payload, callback: s.callback, next: null }, E === null ? (v = E = x, d = M) : E = E.next = x, _ |= S;
        if (s = s.next, s === null) {
          if (s = l.shared.pending, s === null) break;
          x = s, s = x.next, x.next = null, l.lastBaseUpdate = x, l.shared.pending = null;
        }
      } while (true);
      E === null && (d = M), l.baseState = d, l.firstBaseUpdate = v, l.lastBaseUpdate = E, o === null && (l.shared.lanes = 0), ln |= _, e.lanes = _, e.memoizedState = M;
    }
  }
  function po(e, t) {
    if (typeof e != "function") throw Error(r(191, e));
    e.call(t);
  }
  function wo(e, t) {
    var c = e.callbacks;
    if (c !== null) for (e.callbacks = null, e = 0; e < c.length; e++) po(c[e], t);
  }
  var la = p(null), Xc = p(0);
  function Oo(e, t) {
    e = Wt, H(Xc, e), H(la, t), Wt = e | t.baseLanes;
  }
  function Ci() {
    H(Xc, Wt), H(la, la.current);
  }
  function Hi() {
    Wt = Xc.current, D(la), D(Xc);
  }
  var $e = p(null), ft = null;
  function nn(e) {
    var t = e.alternate;
    H(we, we.current & 1), H($e, e), ft === null && (t === null || la.current !== null || t.memoizedState !== null) && (ft = e);
  }
  function Ni(e) {
    H(we, we.current), H($e, e), ft === null && (ft = e);
  }
  function yo(e) {
    e.tag === 22 ? (H(we, we.current), H($e, e), ft === null && (ft = e)) : an();
  }
  function an() {
    H(we, we.current), H($e, $e.current);
  }
  function Pe(e) {
    D($e), ft === e && (ft = null), D(we);
  }
  var we = p(0);
  function Fc(e) {
    for (var t = e; t !== null; ) {
      if (t.tag === 13) {
        var c = t.memoizedState;
        if (c !== null && (c = c.dehydrated, c === null || Vl(c) || Wl(c))) return t;
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
  var Ht = 0, k = null, ue = null, he = null, Qc = false, ra = false, Hn = false, Zc = 0, Qa = 0, oa = null, db = 0;
  function ge() {
    throw Error(r(321));
  }
  function Ui(e, t) {
    if (t === null) return false;
    for (var c = 0; c < t.length && c < e.length; c++) if (!Je(e[c], t[c])) return false;
    return true;
  }
  function Bi(e, t, c, u, l, o) {
    return Ht = o, k = t, t.memoizedState = null, t.updateQueue = null, t.lanes = 0, A.H = e === null || e.memoizedState === null ? a_ : $i, Hn = false, o = c(u, l), Hn = false, ra && (o = jo(t, c, u, l)), ho(e), o;
  }
  function ho(e) {
    A.H = Ja;
    var t = ue !== null && ue.next !== null;
    if (Ht = 0, he = ue = k = null, Qc = false, Qa = 0, oa = null, t) throw Error(r(300));
    e === null || je || (e = e.dependencies, e !== null && Lc(e) && (je = true));
  }
  function jo(e, t, c, u) {
    k = e;
    var l = 0;
    do {
      if (ra && (oa = null), Qa = 0, ra = false, 25 <= l) throw Error(r(301));
      if (l += 1, he = ue = null, e.updateQueue != null) {
        var o = e.updateQueue;
        o.lastEffect = null, o.events = null, o.stores = null, o.memoCache != null && (o.memoCache.index = 0);
      }
      A.H = c_, o = t(c, u);
    } while (ra);
    return o;
  }
  function gb() {
    var e = A.H, t = e.useState()[0];
    return t = typeof t.then == "function" ? Za(t) : t, e = e.useState()[0], (ue !== null ? ue.memoizedState : null) !== e && (k.flags |= 1024), t;
  }
  function Li() {
    var e = Zc !== 0;
    return Zc = 0, e;
  }
  function qi(e, t, c) {
    t.updateQueue = e.updateQueue, t.flags &= -2053, e.lanes &= ~c;
  }
  function Gi(e) {
    if (Qc) {
      for (e = e.memoizedState; e !== null; ) {
        var t = e.queue;
        t !== null && (t.pending = null), e = e.next;
      }
      Qc = false;
    }
    Ht = 0, he = ue = k = null, ra = false, Qa = Zc = 0, oa = null;
  }
  function Ue() {
    var e = { memoizedState: null, baseState: null, baseQueue: null, queue: null, next: null };
    return he === null ? k.memoizedState = he = e : he = he.next = e, he;
  }
  function Oe() {
    if (ue === null) {
      var e = k.alternate;
      e = e !== null ? e.memoizedState : null;
    } else e = ue.next;
    var t = he === null ? k.memoizedState : he.next;
    if (t !== null) he = t, ue = e;
    else {
      if (e === null) throw k.alternate === null ? Error(r(467)) : Error(r(310));
      ue = e, e = { memoizedState: ue.memoizedState, baseState: ue.baseState, baseQueue: ue.baseQueue, queue: ue.queue, next: null }, he === null ? k.memoizedState = he = e : he = he.next = e;
    }
    return he;
  }
  function Kc() {
    return { lastEffect: null, events: null, stores: null, memoCache: null };
  }
  function Za(e) {
    var t = Qa;
    return Qa += 1, oa === null && (oa = []), e = fo(oa, e, t), t = k, (he === null ? t.memoizedState : he.next) === null && (t = t.alternate, A.H = t === null || t.memoizedState === null ? a_ : $i), e;
  }
  function Jc(e) {
    if (e !== null && typeof e == "object") {
      if (typeof e.then == "function") return Za(e);
      if (e.$$typeof === Ce) return De(e);
    }
    throw Error(r(438, String(e)));
  }
  function Vi(e) {
    var t = null, c = k.updateQueue;
    if (c !== null && (t = c.memoCache), t == null) {
      var u = k.alternate;
      u !== null && (u = u.updateQueue, u !== null && (u = u.memoCache, u != null && (t = { data: u.data.map(function(l) {
        return l.slice();
      }), index: 0 })));
    }
    if (t == null && (t = { data: [], index: 0 }), c === null && (c = Kc(), k.updateQueue = c), c.memoCache = t, c = t.data[t.index], c === void 0) for (c = t.data[t.index] = Array(e), u = 0; u < e; u++) c[u] = Ln;
    return t.index++, c;
  }
  function Nt(e, t) {
    return typeof t == "function" ? t(e) : t;
  }
  function Ic(e) {
    var t = Oe();
    return Wi(t, ue, e);
  }
  function Wi(e, t, c) {
    var u = e.queue;
    if (u === null) throw Error(r(311));
    u.lastRenderedReducer = c;
    var l = e.baseQueue, o = u.pending;
    if (o !== null) {
      if (l !== null) {
        var _ = l.next;
        l.next = o.next, o.next = _;
      }
      t.baseQueue = l = o, u.pending = null;
    }
    if (o = e.baseState, l === null) e.memoizedState = o;
    else {
      t = l.next;
      var s = _ = null, d = null, v = t, E = false;
      do {
        var M = v.lane & -536870913;
        if (M !== v.lane ? (Z & M) === M : (Ht & M) === M) {
          var S = v.revertLane;
          if (S === 0) d !== null && (d = d.next = { lane: 0, revertLane: 0, gesture: null, action: v.action, hasEagerState: v.hasEagerState, eagerState: v.eagerState, next: null }), M === aa && (E = true);
          else if ((Ht & S) === S) {
            v = v.next, S === aa && (E = true);
            continue;
          } else M = { lane: 0, revertLane: v.revertLane, gesture: null, action: v.action, hasEagerState: v.hasEagerState, eagerState: v.eagerState, next: null }, d === null ? (s = d = M, _ = o) : d = d.next = M, k.lanes |= S, ln |= S;
          M = v.action, Hn && c(o, M), o = v.hasEagerState ? v.eagerState : c(o, M);
        } else S = { lane: M, revertLane: v.revertLane, gesture: v.gesture, action: v.action, hasEagerState: v.hasEagerState, eagerState: v.eagerState, next: null }, d === null ? (s = d = S, _ = o) : d = d.next = S, k.lanes |= M, ln |= M;
        v = v.next;
      } while (v !== null && v !== t);
      if (d === null ? _ = o : d.next = s, !Je(o, e.memoizedState) && (je = true, E && (c = ca, c !== null))) throw c;
      e.memoizedState = o, e.baseState = _, e.baseQueue = d, u.lastRenderedState = o;
    }
    return l === null && (u.lanes = 0), [e.memoizedState, u.dispatch];
  }
  function ki(e) {
    var t = Oe(), c = t.queue;
    if (c === null) throw Error(r(311));
    c.lastRenderedReducer = e;
    var u = c.dispatch, l = c.pending, o = t.memoizedState;
    if (l !== null) {
      c.pending = null;
      var _ = l = l.next;
      do
        o = e(o, _.action), _ = _.next;
      while (_ !== l);
      Je(o, t.memoizedState) || (je = true), t.memoizedState = o, t.baseQueue === null && (t.baseState = o), c.lastRenderedState = o;
    }
    return [o, u];
  }
  function vo(e, t, c) {
    var u = k, l = Oe(), o = I;
    if (o) {
      if (c === void 0) throw Error(r(407));
      c = c();
    } else c = t();
    var _ = !Je((ue || l).memoizedState, c);
    if (_ && (l.memoizedState = c, je = true), l = l.queue, Fi(Eo.bind(null, u, l, e), [e]), l.getSnapshot !== t || _ || he !== null && he.memoizedState.tag & 1) {
      if (u.flags |= 2048, _a(9, { destroy: void 0 }, xo.bind(null, u, l, c, t), null), _e === null) throw Error(r(349));
      o || (Ht & 127) !== 0 || So(u, t, c);
    }
    return c;
  }
  function So(e, t, c) {
    e.flags |= 16384, e = { getSnapshot: t, value: c }, t = k.updateQueue, t === null ? (t = Kc(), k.updateQueue = t, t.stores = [e]) : (c = t.stores, c === null ? t.stores = [e] : c.push(e));
  }
  function xo(e, t, c, u) {
    t.value = c, t.getSnapshot = u, Ao(t) && To(e);
  }
  function Eo(e, t, c) {
    return c(function() {
      Ao(t) && To(e);
    });
  }
  function Ao(e) {
    var t = e.getSnapshot;
    e = e.value;
    try {
      var c = t();
      return !Je(e, c);
    } catch {
      return true;
    }
  }
  function To(e) {
    var t = xn(e, 2);
    t !== null && Fe(t, e, 2);
  }
  function Yi(e) {
    var t = Ue();
    if (typeof e == "function") {
      var c = e;
      if (e = c(), Hn) {
        Ft(true);
        try {
          c();
        } finally {
          Ft(false);
        }
      }
    }
    return t.memoizedState = t.baseState = e, t.queue = { pending: null, lanes: 0, dispatch: null, lastRenderedReducer: Nt, lastRenderedState: e }, t;
  }
  function Mo(e, t, c, u) {
    return e.baseState = c, Wi(e, ue, typeof u == "function" ? u : Nt);
  }
  function mb(e, t, c, u, l) {
    if (eu(e)) throw Error(r(485));
    if (e = t.action, e !== null) {
      var o = { payload: l, action: e, next: null, isTransition: true, status: "pending", value: null, reason: null, listeners: [], then: function(_) {
        o.listeners.push(_);
      } };
      A.T !== null ? c(true) : o.isTransition = false, u(o), c = t.pending, c === null ? (o.next = t.pending = o, Do(t, o)) : (o.next = c.next, t.pending = c.next = o);
    }
  }
  function Do(e, t) {
    var c = t.action, u = t.payload, l = e.state;
    if (t.isTransition) {
      var o = A.T, _ = {};
      A.T = _;
      try {
        var s = c(l, u), d = A.S;
        d !== null && d(_, s), Ro(e, t, s);
      } catch (v) {
        Xi(e, t, v);
      } finally {
        o !== null && _.types !== null && (o.types = _.types), A.T = o;
      }
    } else try {
      o = c(l, u), Ro(e, t, o);
    } catch (v) {
      Xi(e, t, v);
    }
  }
  function Ro(e, t, c) {
    c !== null && typeof c == "object" && typeof c.then == "function" ? c.then(function(u) {
      zo(e, t, u);
    }, function(u) {
      return Xi(e, t, u);
    }) : zo(e, t, c);
  }
  function zo(e, t, c) {
    t.status = "fulfilled", t.value = c, Co(t), e.state = c, t = e.pending, t !== null && (c = t.next, c === t ? e.pending = null : (c = c.next, t.next = c, Do(e, c)));
  }
  function Xi(e, t, c) {
    var u = e.pending;
    if (e.pending = null, u !== null) {
      u = u.next;
      do
        t.status = "rejected", t.reason = c, Co(t), t = t.next;
      while (t !== u);
    }
    e.action = null;
  }
  function Co(e) {
    e = e.listeners;
    for (var t = 0; t < e.length; t++) (0, e[t])();
  }
  function Ho(e, t) {
    return t;
  }
  function No(e, t) {
    if (I) {
      var c = _e.formState;
      if (c !== null) {
        e: {
          var u = k;
          if (I) {
            if (se) {
              t: {
                for (var l = se, o = _t; l.nodeType !== 8; ) {
                  if (!o) {
                    l = null;
                    break t;
                  }
                  if (l = st(l.nextSibling), l === null) {
                    l = null;
                    break t;
                  }
                }
                o = l.data, l = o === "F!" || o === "F" ? l : null;
              }
              if (l) {
                se = st(l.nextSibling), u = l.data === "F!";
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
    return c = Ue(), c.memoizedState = c.baseState = t, u = { pending: null, lanes: 0, dispatch: null, lastRenderedReducer: Ho, lastRenderedState: t }, c.queue = u, c = e_.bind(null, k, u), u.dispatch = c, u = Yi(false), o = Ii.bind(null, k, false, u.queue), u = Ue(), l = { state: t, dispatch: null, action: e, pending: null }, u.queue = l, c = mb.bind(null, k, l, o, c), l.dispatch = c, u.memoizedState = e, [t, c, false];
  }
  function Uo(e) {
    var t = Oe();
    return Bo(t, ue, e);
  }
  function Bo(e, t, c) {
    if (t = Wi(e, t, Ho)[0], e = Ic(Nt)[0], typeof t == "object" && t !== null && typeof t.then == "function") try {
      var u = Za(t);
    } catch (_) {
      throw _ === ua ? Vc : _;
    }
    else u = t;
    t = Oe();
    var l = t.queue, o = l.dispatch;
    return c !== t.memoizedState && (k.flags |= 2048, _a(9, { destroy: void 0 }, pb.bind(null, l, c), null)), [u, o, e];
  }
  function pb(e, t) {
    e.action = t;
  }
  function Lo(e) {
    var t = Oe(), c = ue;
    if (c !== null) return Bo(t, c, e);
    Oe(), t = t.memoizedState, c = Oe();
    var u = c.queue.dispatch;
    return c.memoizedState = e, [t, u, false];
  }
  function _a(e, t, c, u) {
    return e = { tag: e, create: c, deps: u, inst: t, next: null }, t = k.updateQueue, t === null && (t = Kc(), k.updateQueue = t), c = t.lastEffect, c === null ? t.lastEffect = e.next = e : (u = c.next, c.next = e, e.next = u, t.lastEffect = e), e;
  }
  function qo() {
    return Oe().memoizedState;
  }
  function $c(e, t, c, u) {
    var l = Ue();
    k.flags |= e, l.memoizedState = _a(1 | t, { destroy: void 0 }, c, u === void 0 ? null : u);
  }
  function Pc(e, t, c, u) {
    var l = Oe();
    u = u === void 0 ? null : u;
    var o = l.memoizedState.inst;
    ue !== null && u !== null && Ui(u, ue.memoizedState.deps) ? l.memoizedState = _a(t, o, c, u) : (k.flags |= e, l.memoizedState = _a(1 | t, o, c, u));
  }
  function Go(e, t) {
    $c(8390656, 8, e, t);
  }
  function Fi(e, t) {
    Pc(2048, 8, e, t);
  }
  function wb(e) {
    k.flags |= 4;
    var t = k.updateQueue;
    if (t === null) t = Kc(), k.updateQueue = t, t.events = [e];
    else {
      var c = t.events;
      c === null ? t.events = [e] : c.push(e);
    }
  }
  function Vo(e) {
    var t = Oe().memoizedState;
    return wb({ ref: t, nextImpl: e }), function() {
      if ((ee & 2) !== 0) throw Error(r(440));
      return t.impl.apply(void 0, arguments);
    };
  }
  function Wo(e, t) {
    return Pc(4, 2, e, t);
  }
  function ko(e, t) {
    return Pc(4, 4, e, t);
  }
  function Yo(e, t) {
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
  function Xo(e, t, c) {
    c = c != null ? c.concat([e]) : null, Pc(4, 4, Yo.bind(null, t, e), c);
  }
  function Qi() {
  }
  function Fo(e, t) {
    var c = Oe();
    t = t === void 0 ? null : t;
    var u = c.memoizedState;
    return t !== null && Ui(t, u[1]) ? u[0] : (c.memoizedState = [e, t], e);
  }
  function Qo(e, t) {
    var c = Oe();
    t = t === void 0 ? null : t;
    var u = c.memoizedState;
    if (t !== null && Ui(t, u[1])) return u[0];
    if (u = e(), Hn) {
      Ft(true);
      try {
        e();
      } finally {
        Ft(false);
      }
    }
    return c.memoizedState = [u, t], u;
  }
  function Zi(e, t, c) {
    return c === void 0 || (Ht & 1073741824) !== 0 && (Z & 261930) === 0 ? e.memoizedState = t : (e.memoizedState = c, e = Z_(), k.lanes |= e, ln |= e, c);
  }
  function Zo(e, t, c, u) {
    return Je(c, t) ? c : la.current !== null ? (e = Zi(e, c, u), Je(e, t) || (je = true), e) : (Ht & 42) === 0 || (Ht & 1073741824) !== 0 && (Z & 261930) === 0 ? (je = true, e.memoizedState = c) : (e = Z_(), k.lanes |= e, ln |= e, t);
  }
  function Ko(e, t, c, u, l) {
    var o = C.p;
    C.p = o !== 0 && 8 > o ? o : 8;
    var _ = A.T, s = {};
    A.T = s, Ii(e, false, t, c);
    try {
      var d = l(), v = A.S;
      if (v !== null && v(s, d), d !== null && typeof d == "object" && typeof d.then == "function") {
        var E = bb(d, u);
        Ka(e, t, E, nt(e));
      } else Ka(e, t, u, nt(e));
    } catch (M) {
      Ka(e, t, { then: function() {
      }, status: "rejected", reason: M }, nt());
    } finally {
      C.p = o, _ !== null && s.types !== null && (_.types = s.types), A.T = _;
    }
  }
  function Ob() {
  }
  function Ki(e, t, c, u) {
    if (e.tag !== 5) throw Error(r(476));
    var l = Jo(e).queue;
    Ko(e, l, t, V, c === null ? Ob : function() {
      return Io(e), c(u);
    });
  }
  function Jo(e) {
    var t = e.memoizedState;
    if (t !== null) return t;
    t = { memoizedState: V, baseState: V, baseQueue: null, queue: { pending: null, lanes: 0, dispatch: null, lastRenderedReducer: Nt, lastRenderedState: V }, next: null };
    var c = {};
    return t.next = { memoizedState: c, baseState: c, baseQueue: null, queue: { pending: null, lanes: 0, dispatch: null, lastRenderedReducer: Nt, lastRenderedState: c }, next: null }, e.memoizedState = t, e = e.alternate, e !== null && (e.memoizedState = t), t;
  }
  function Io(e) {
    var t = Jo(e);
    t.next === null && (t = e.alternate.memoizedState), Ka(e, t.next.queue, {}, nt());
  }
  function Ji() {
    return De(sc);
  }
  function $o() {
    return Oe().memoizedState;
  }
  function Po() {
    return Oe().memoizedState;
  }
  function yb(e) {
    for (var t = e.return; t !== null; ) {
      switch (t.tag) {
        case 24:
        case 3:
          var c = nt();
          e = en(c);
          var u = tn(t, e, c);
          u !== null && (Fe(u, t, c), Ya(u, t, c)), t = { cache: xi() }, e.payload = t;
          return;
      }
      t = t.return;
    }
  }
  function hb(e, t, c) {
    var u = nt();
    c = { lane: u, revertLane: 0, gesture: null, action: c, hasEagerState: false, eagerState: null, next: null }, eu(e) ? t_(t, c) : (c = di(e, t, c, u), c !== null && (Fe(c, e, u), n_(c, t, u)));
  }
  function e_(e, t, c) {
    var u = nt();
    Ka(e, t, c, u);
  }
  function Ka(e, t, c, u) {
    var l = { lane: u, revertLane: 0, gesture: null, action: c, hasEagerState: false, eagerState: null, next: null };
    if (eu(e)) t_(t, l);
    else {
      var o = e.alternate;
      if (e.lanes === 0 && (o === null || o.lanes === 0) && (o = t.lastRenderedReducer, o !== null)) try {
        var _ = t.lastRenderedState, s = o(_, c);
        if (l.hasEagerState = true, l.eagerState = s, Je(s, _)) return Hc(e, t, l, 0), _e === null && Cc(), false;
      } catch {
      } finally {
      }
      if (c = di(e, t, l, u), c !== null) return Fe(c, e, u), n_(c, t, u), true;
    }
    return false;
  }
  function Ii(e, t, c, u) {
    if (u = { lane: 2, revertLane: Ml(), gesture: null, action: u, hasEagerState: false, eagerState: null, next: null }, eu(e)) {
      if (t) throw Error(r(479));
    } else t = di(e, c, u, 2), t !== null && Fe(t, e, 2);
  }
  function eu(e) {
    var t = e.alternate;
    return e === k || t !== null && t === k;
  }
  function t_(e, t) {
    ra = Qc = true;
    var c = e.pending;
    c === null ? t.next = t : (t.next = c.next, c.next = t), e.pending = t;
  }
  function n_(e, t, c) {
    if ((c & 4194048) !== 0) {
      var u = t.lanes;
      u &= e.pendingLanes, c |= u, t.lanes = c, ir(e, c);
    }
  }
  var Ja = { readContext: De, use: Jc, useCallback: ge, useContext: ge, useEffect: ge, useImperativeHandle: ge, useLayoutEffect: ge, useInsertionEffect: ge, useMemo: ge, useReducer: ge, useRef: ge, useState: ge, useDebugValue: ge, useDeferredValue: ge, useTransition: ge, useSyncExternalStore: ge, useId: ge, useHostTransitionStatus: ge, useFormState: ge, useActionState: ge, useOptimistic: ge, useMemoCache: ge, useCacheRefresh: ge };
  Ja.useEffectEvent = ge;
  var a_ = { readContext: De, use: Jc, useCallback: function(e, t) {
    return Ue().memoizedState = [e, t === void 0 ? null : t], e;
  }, useContext: De, useEffect: Go, useImperativeHandle: function(e, t, c) {
    c = c != null ? c.concat([e]) : null, $c(4194308, 4, Yo.bind(null, t, e), c);
  }, useLayoutEffect: function(e, t) {
    return $c(4194308, 4, e, t);
  }, useInsertionEffect: function(e, t) {
    $c(4, 2, e, t);
  }, useMemo: function(e, t) {
    var c = Ue();
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
    return c.memoizedState = [u, t], u;
  }, useReducer: function(e, t, c) {
    var u = Ue();
    if (c !== void 0) {
      var l = c(t);
      if (Hn) {
        Ft(true);
        try {
          c(t);
        } finally {
          Ft(false);
        }
      }
    } else l = t;
    return u.memoizedState = u.baseState = l, e = { pending: null, lanes: 0, dispatch: null, lastRenderedReducer: e, lastRenderedState: l }, u.queue = e, e = e.dispatch = hb.bind(null, k, e), [u.memoizedState, e];
  }, useRef: function(e) {
    var t = Ue();
    return e = { current: e }, t.memoizedState = e;
  }, useState: function(e) {
    e = Yi(e);
    var t = e.queue, c = e_.bind(null, k, t);
    return t.dispatch = c, [e.memoizedState, c];
  }, useDebugValue: Qi, useDeferredValue: function(e, t) {
    var c = Ue();
    return Zi(c, e, t);
  }, useTransition: function() {
    var e = Yi(false);
    return e = Ko.bind(null, k, e.queue, true, false), Ue().memoizedState = e, [false, e];
  }, useSyncExternalStore: function(e, t, c) {
    var u = k, l = Ue();
    if (I) {
      if (c === void 0) throw Error(r(407));
      c = c();
    } else {
      if (c = t(), _e === null) throw Error(r(349));
      (Z & 127) !== 0 || So(u, t, c);
    }
    l.memoizedState = c;
    var o = { value: c, getSnapshot: t };
    return l.queue = o, Go(Eo.bind(null, u, o, e), [e]), u.flags |= 2048, _a(9, { destroy: void 0 }, xo.bind(null, u, o, c, t), null), c;
  }, useId: function() {
    var e = Ue(), t = _e.identifierPrefix;
    if (I) {
      var c = vt, u = jt;
      c = (u & ~(1 << 32 - Ke(u) - 1)).toString(32) + c, t = "_" + t + "R_" + c, c = Zc++, 0 < c && (t += "H" + c.toString(32)), t += "_";
    } else c = db++, t = "_" + t + "r_" + c.toString(32) + "_";
    return e.memoizedState = t;
  }, useHostTransitionStatus: Ji, useFormState: No, useActionState: No, useOptimistic: function(e) {
    var t = Ue();
    t.memoizedState = t.baseState = e;
    var c = { pending: null, lanes: 0, dispatch: null, lastRenderedReducer: null, lastRenderedState: null };
    return t.queue = c, t = Ii.bind(null, k, true, c), c.dispatch = t, [e, t];
  }, useMemoCache: Vi, useCacheRefresh: function() {
    return Ue().memoizedState = yb.bind(null, k);
  }, useEffectEvent: function(e) {
    var t = Ue(), c = { impl: e };
    return t.memoizedState = c, function() {
      if ((ee & 2) !== 0) throw Error(r(440));
      return c.impl.apply(void 0, arguments);
    };
  } }, $i = { readContext: De, use: Jc, useCallback: Fo, useContext: De, useEffect: Fi, useImperativeHandle: Xo, useInsertionEffect: Wo, useLayoutEffect: ko, useMemo: Qo, useReducer: Ic, useRef: qo, useState: function() {
    return Ic(Nt);
  }, useDebugValue: Qi, useDeferredValue: function(e, t) {
    var c = Oe();
    return Zo(c, ue.memoizedState, e, t);
  }, useTransition: function() {
    var e = Ic(Nt)[0], t = Oe().memoizedState;
    return [typeof e == "boolean" ? e : Za(e), t];
  }, useSyncExternalStore: vo, useId: $o, useHostTransitionStatus: Ji, useFormState: Uo, useActionState: Uo, useOptimistic: function(e, t) {
    var c = Oe();
    return Mo(c, ue, e, t);
  }, useMemoCache: Vi, useCacheRefresh: Po };
  $i.useEffectEvent = Vo;
  var c_ = { readContext: De, use: Jc, useCallback: Fo, useContext: De, useEffect: Fi, useImperativeHandle: Xo, useInsertionEffect: Wo, useLayoutEffect: ko, useMemo: Qo, useReducer: ki, useRef: qo, useState: function() {
    return ki(Nt);
  }, useDebugValue: Qi, useDeferredValue: function(e, t) {
    var c = Oe();
    return ue === null ? Zi(c, e, t) : Zo(c, ue.memoizedState, e, t);
  }, useTransition: function() {
    var e = ki(Nt)[0], t = Oe().memoizedState;
    return [typeof e == "boolean" ? e : Za(e), t];
  }, useSyncExternalStore: vo, useId: $o, useHostTransitionStatus: Ji, useFormState: Lo, useActionState: Lo, useOptimistic: function(e, t) {
    var c = Oe();
    return ue !== null ? Mo(c, ue, e, t) : (c.baseState = e, [e, c.queue.dispatch]);
  }, useMemoCache: Vi, useCacheRefresh: Po };
  c_.useEffectEvent = Vo;
  function Pi(e, t, c, u) {
    t = e.memoizedState, c = c(u, t), c = c == null ? t : R({}, t, c), e.memoizedState = c, e.lanes === 0 && (e.updateQueue.baseState = c);
  }
  var el = { enqueueSetState: function(e, t, c) {
    e = e._reactInternals;
    var u = nt(), l = en(u);
    l.payload = t, c != null && (l.callback = c), t = tn(e, l, u), t !== null && (Fe(t, e, u), Ya(t, e, u));
  }, enqueueReplaceState: function(e, t, c) {
    e = e._reactInternals;
    var u = nt(), l = en(u);
    l.tag = 1, l.payload = t, c != null && (l.callback = c), t = tn(e, l, u), t !== null && (Fe(t, e, u), Ya(t, e, u));
  }, enqueueForceUpdate: function(e, t) {
    e = e._reactInternals;
    var c = nt(), u = en(c);
    u.tag = 2, t != null && (u.callback = t), t = tn(e, u, c), t !== null && (Fe(t, e, c), Ya(t, e, c));
  } };
  function u_(e, t, c, u, l, o, _) {
    return e = e.stateNode, typeof e.shouldComponentUpdate == "function" ? e.shouldComponentUpdate(u, o, _) : t.prototype && t.prototype.isPureReactComponent ? !Ua(c, u) || !Ua(l, o) : true;
  }
  function i_(e, t, c, u) {
    e = t.state, typeof t.componentWillReceiveProps == "function" && t.componentWillReceiveProps(c, u), typeof t.UNSAFE_componentWillReceiveProps == "function" && t.UNSAFE_componentWillReceiveProps(c, u), t.state !== e && el.enqueueReplaceState(t, t.state, null);
  }
  function Nn(e, t) {
    var c = t;
    if ("ref" in t) {
      c = {};
      for (var u in t) u !== "ref" && (c[u] = t[u]);
    }
    if (e = e.defaultProps) {
      c === t && (c = R({}, c));
      for (var l in e) c[l] === void 0 && (c[l] = e[l]);
    }
    return c;
  }
  function l_(e) {
    zc(e);
  }
  function r_(e) {
    console.error(e);
  }
  function o_(e) {
    zc(e);
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
  function __(e, t, c) {
    try {
      var u = e.onCaughtError;
      u(c.value, { componentStack: c.stack, errorBoundary: t.tag === 1 ? t.stateNode : null });
    } catch (l) {
      setTimeout(function() {
        throw l;
      });
    }
  }
  function tl(e, t, c) {
    return c = en(c), c.tag = 3, c.payload = { element: null }, c.callback = function() {
      tu(e, t);
    }, c;
  }
  function f_(e) {
    return e = en(e), e.tag = 3, e;
  }
  function s_(e, t, c, u) {
    var l = c.type.getDerivedStateFromError;
    if (typeof l == "function") {
      var o = u.value;
      e.payload = function() {
        return l(o);
      }, e.callback = function() {
        __(t, c, u);
      };
    }
    var _ = c.stateNode;
    _ !== null && typeof _.componentDidCatch == "function" && (e.callback = function() {
      __(t, c, u), typeof l != "function" && (rn === null ? rn = /* @__PURE__ */ new Set([this]) : rn.add(this));
      var s = u.stack;
      this.componentDidCatch(u.value, { componentStack: s !== null ? s : "" });
    });
  }
  function jb(e, t, c, u, l) {
    if (c.flags |= 32768, u !== null && typeof u == "object" && typeof u.then == "function") {
      if (t = c.alternate, t !== null && na(t, c, l, true), c = $e.current, c !== null) {
        switch (c.tag) {
          case 31:
          case 13:
            return ft === null ? bu() : c.alternate === null && me === 0 && (me = 3), c.flags &= -257, c.flags |= 65536, c.lanes = l, u === Wc ? c.flags |= 16384 : (t = c.updateQueue, t === null ? c.updateQueue = /* @__PURE__ */ new Set([u]) : t.add(u), El(e, u, l)), false;
          case 22:
            return c.flags |= 65536, u === Wc ? c.flags |= 16384 : (t = c.updateQueue, t === null ? (t = { transitions: null, markerInstances: null, retryQueue: /* @__PURE__ */ new Set([u]) }, c.updateQueue = t) : (c = t.retryQueue, c === null ? t.retryQueue = /* @__PURE__ */ new Set([u]) : c.add(u)), El(e, u, l)), false;
        }
        throw Error(r(435, c.tag));
      }
      return El(e, u, l), bu(), false;
    }
    if (I) return t = $e.current, t !== null ? ((t.flags & 65536) === 0 && (t.flags |= 256), t.flags |= 65536, t.lanes = l, u !== yi && (e = Error(r(422), { cause: u }), qa(lt(e, c)))) : (u !== yi && (t = Error(r(423), { cause: u }), qa(lt(t, c))), e = e.current.alternate, e.flags |= 65536, l &= -l, e.lanes |= l, u = lt(u, c), l = tl(e.stateNode, u, l), Ri(e, l), me !== 4 && (me = 2)), false;
    var o = Error(r(520), { cause: u });
    if (o = lt(o, c), cc === null ? cc = [o] : cc.push(o), me !== 4 && (me = 2), t === null) return true;
    u = lt(u, c), c = t;
    do {
      switch (c.tag) {
        case 3:
          return c.flags |= 65536, e = l & -l, c.lanes |= e, e = tl(c.stateNode, u, e), Ri(c, e), false;
        case 1:
          if (t = c.type, o = c.stateNode, (c.flags & 128) === 0 && (typeof t.getDerivedStateFromError == "function" || o !== null && typeof o.componentDidCatch == "function" && (rn === null || !rn.has(o)))) return c.flags |= 65536, l &= -l, c.lanes |= l, l = f_(l), s_(l, e, c, u), Ri(c, l), false;
      }
      c = c.return;
    } while (c !== null);
    return false;
  }
  var nl = Error(r(461)), je = false;
  function Re(e, t, c, u) {
    t.child = e === null ? mo(t, null, c, u) : Cn(t, e.child, c, u);
  }
  function b_(e, t, c, u, l) {
    c = c.render;
    var o = t.ref;
    if ("ref" in u) {
      var _ = {};
      for (var s in u) s !== "ref" && (_[s] = u[s]);
    } else _ = u;
    return Mn(t), u = Bi(e, t, c, _, o, l), s = Li(), e !== null && !je ? (qi(e, t, l), Ut(e, t, l)) : (I && s && wi(t), t.flags |= 1, Re(e, t, u, l), t.child);
  }
  function d_(e, t, c, u, l) {
    if (e === null) {
      var o = c.type;
      return typeof o == "function" && !gi(o) && o.defaultProps === void 0 && c.compare === null ? (t.tag = 15, t.type = o, g_(e, t, o, u, l)) : (e = Uc(c.type, null, u, t, t.mode, l), e.ref = t.ref, e.return = t, t.child = e);
    }
    if (o = e.child, !_l(e, l)) {
      var _ = o.memoizedProps;
      if (c = c.compare, c = c !== null ? c : Ua, c(_, u) && e.ref === t.ref) return Ut(e, t, l);
    }
    return t.flags |= 1, e = Dt(o, u), e.ref = t.ref, e.return = t, t.child = e;
  }
  function g_(e, t, c, u, l) {
    if (e !== null) {
      var o = e.memoizedProps;
      if (Ua(o, u) && e.ref === t.ref) if (je = false, t.pendingProps = u = o, _l(e, l)) (e.flags & 131072) !== 0 && (je = true);
      else return t.lanes = e.lanes, Ut(e, t, l);
    }
    return al(e, t, c, u, l);
  }
  function m_(e, t, c, u) {
    var l = u.children, o = e !== null ? e.memoizedState : null;
    if (e === null && t.stateNode === null && (t.stateNode = { _visibility: 1, _pendingMarkers: null, _retryCache: null, _transitions: null }), u.mode === "hidden") {
      if ((t.flags & 128) !== 0) {
        if (o = o !== null ? o.baseLanes | c : c, e !== null) {
          for (u = t.child = e.child, l = 0; u !== null; ) l = l | u.lanes | u.childLanes, u = u.sibling;
          u = l & ~o;
        } else u = 0, t.child = null;
        return p_(e, t, o, c, u);
      }
      if ((c & 536870912) !== 0) t.memoizedState = { baseLanes: 0, cachePool: null }, e !== null && Gc(t, o !== null ? o.cachePool : null), o !== null ? Oo(t, o) : Ci(), yo(t);
      else return u = t.lanes = 536870912, p_(e, t, o !== null ? o.baseLanes | c : c, c, u);
    } else o !== null ? (Gc(t, o.cachePool), Oo(t, o), an(), t.memoizedState = null) : (e !== null && Gc(t, null), Ci(), an());
    return Re(e, t, l, c), t.child;
  }
  function Ia(e, t) {
    return e !== null && e.tag === 22 || t.stateNode !== null || (t.stateNode = { _visibility: 1, _pendingMarkers: null, _retryCache: null, _transitions: null }), t.sibling;
  }
  function p_(e, t, c, u, l) {
    var o = Ai();
    return o = o === null ? null : { parent: ye._currentValue, pool: o }, t.memoizedState = { baseLanes: c, cachePool: o }, e !== null && Gc(t, null), Ci(), yo(t), e !== null && na(e, t, u, true), t.childLanes = l, null;
  }
  function nu(e, t) {
    return t = cu({ mode: t.mode, children: t.children }, e.mode), t.ref = e.ref, e.child = t, t.return = e, t;
  }
  function w_(e, t, c) {
    return Cn(t, e.child, null, c), e = nu(t, t.pendingProps), e.flags |= 2, Pe(t), t.memoizedState = null, e;
  }
  function vb(e, t, c) {
    var u = t.pendingProps, l = (t.flags & 128) !== 0;
    if (t.flags &= -129, e === null) {
      if (I) {
        if (u.mode === "hidden") return e = nu(t, u), t.lanes = 536870912, Ia(null, e);
        if (Ni(t), (e = se) ? (e = Rf(e, _t), e = e !== null && e.data === "&" ? e : null, e !== null && (t.memoizedState = { dehydrated: e, treeContext: Kt !== null ? { id: jt, overflow: vt } : null, retryLane: 536870912, hydrationErrors: null }, c = eo(e), c.return = t, t.child = c, Me = t, se = null)) : e = null, e === null) throw It(t);
        return t.lanes = 536870912, null;
      }
      return nu(t, u);
    }
    var o = e.memoizedState;
    if (o !== null) {
      var _ = o.dehydrated;
      if (Ni(t), l) if (t.flags & 256) t.flags &= -257, t = w_(e, t, c);
      else if (t.memoizedState !== null) t.child = e.child, t.flags |= 128, t = null;
      else throw Error(r(558));
      else if (je || na(e, t, c, false), l = (c & e.childLanes) !== 0, je || l) {
        if (u = _e, u !== null && (_ = lr(u, c), _ !== 0 && _ !== o.retryLane)) throw o.retryLane = _, xn(e, _), Fe(u, e, _), nl;
        bu(), t = w_(e, t, c);
      } else e = o.treeContext, se = st(_.nextSibling), Me = t, I = true, Jt = null, _t = false, e !== null && ao(t, e), t = nu(t, u), t.flags |= 4096;
      return t;
    }
    return e = Dt(e.child, { mode: u.mode, children: u.children }), e.ref = t.ref, t.child = e, e.return = t, e;
  }
  function au(e, t) {
    var c = t.ref;
    if (c === null) e !== null && e.ref !== null && (t.flags |= 4194816);
    else {
      if (typeof c != "function" && typeof c != "object") throw Error(r(284));
      (e === null || e.ref !== c) && (t.flags |= 4194816);
    }
  }
  function al(e, t, c, u, l) {
    return Mn(t), c = Bi(e, t, c, u, void 0, l), u = Li(), e !== null && !je ? (qi(e, t, l), Ut(e, t, l)) : (I && u && wi(t), t.flags |= 1, Re(e, t, c, l), t.child);
  }
  function O_(e, t, c, u, l, o) {
    return Mn(t), t.updateQueue = null, c = jo(t, u, c, l), ho(e), u = Li(), e !== null && !je ? (qi(e, t, o), Ut(e, t, o)) : (I && u && wi(t), t.flags |= 1, Re(e, t, c, o), t.child);
  }
  function y_(e, t, c, u, l) {
    if (Mn(t), t.stateNode === null) {
      var o = $n, _ = c.contextType;
      typeof _ == "object" && _ !== null && (o = De(_)), o = new c(u, o), t.memoizedState = o.state !== null && o.state !== void 0 ? o.state : null, o.updater = el, t.stateNode = o, o._reactInternals = t, o = t.stateNode, o.props = u, o.state = t.memoizedState, o.refs = {}, Mi(t), _ = c.contextType, o.context = typeof _ == "object" && _ !== null ? De(_) : $n, o.state = t.memoizedState, _ = c.getDerivedStateFromProps, typeof _ == "function" && (Pi(t, c, _, u), o.state = t.memoizedState), typeof c.getDerivedStateFromProps == "function" || typeof o.getSnapshotBeforeUpdate == "function" || typeof o.UNSAFE_componentWillMount != "function" && typeof o.componentWillMount != "function" || (_ = o.state, typeof o.componentWillMount == "function" && o.componentWillMount(), typeof o.UNSAFE_componentWillMount == "function" && o.UNSAFE_componentWillMount(), _ !== o.state && el.enqueueReplaceState(o, o.state, null), Fa(t, u, o, l), Xa(), o.state = t.memoizedState), typeof o.componentDidMount == "function" && (t.flags |= 4194308), u = true;
    } else if (e === null) {
      o = t.stateNode;
      var s = t.memoizedProps, d = Nn(c, s);
      o.props = d;
      var v = o.context, E = c.contextType;
      _ = $n, typeof E == "object" && E !== null && (_ = De(E));
      var M = c.getDerivedStateFromProps;
      E = typeof M == "function" || typeof o.getSnapshotBeforeUpdate == "function", s = t.pendingProps !== s, E || typeof o.UNSAFE_componentWillReceiveProps != "function" && typeof o.componentWillReceiveProps != "function" || (s || v !== _) && i_(t, o, u, _), Pt = false;
      var S = t.memoizedState;
      o.state = S, Fa(t, u, o, l), Xa(), v = t.memoizedState, s || S !== v || Pt ? (typeof M == "function" && (Pi(t, c, M, u), v = t.memoizedState), (d = Pt || u_(t, c, d, u, S, v, _)) ? (E || typeof o.UNSAFE_componentWillMount != "function" && typeof o.componentWillMount != "function" || (typeof o.componentWillMount == "function" && o.componentWillMount(), typeof o.UNSAFE_componentWillMount == "function" && o.UNSAFE_componentWillMount()), typeof o.componentDidMount == "function" && (t.flags |= 4194308)) : (typeof o.componentDidMount == "function" && (t.flags |= 4194308), t.memoizedProps = u, t.memoizedState = v), o.props = u, o.state = v, o.context = _, u = d) : (typeof o.componentDidMount == "function" && (t.flags |= 4194308), u = false);
    } else {
      o = t.stateNode, Di(e, t), _ = t.memoizedProps, E = Nn(c, _), o.props = E, M = t.pendingProps, S = o.context, v = c.contextType, d = $n, typeof v == "object" && v !== null && (d = De(v)), s = c.getDerivedStateFromProps, (v = typeof s == "function" || typeof o.getSnapshotBeforeUpdate == "function") || typeof o.UNSAFE_componentWillReceiveProps != "function" && typeof o.componentWillReceiveProps != "function" || (_ !== M || S !== d) && i_(t, o, u, d), Pt = false, S = t.memoizedState, o.state = S, Fa(t, u, o, l), Xa();
      var x = t.memoizedState;
      _ !== M || S !== x || Pt || e !== null && e.dependencies !== null && Lc(e.dependencies) ? (typeof s == "function" && (Pi(t, c, s, u), x = t.memoizedState), (E = Pt || u_(t, c, E, u, S, x, d) || e !== null && e.dependencies !== null && Lc(e.dependencies)) ? (v || typeof o.UNSAFE_componentWillUpdate != "function" && typeof o.componentWillUpdate != "function" || (typeof o.componentWillUpdate == "function" && o.componentWillUpdate(u, x, d), typeof o.UNSAFE_componentWillUpdate == "function" && o.UNSAFE_componentWillUpdate(u, x, d)), typeof o.componentDidUpdate == "function" && (t.flags |= 4), typeof o.getSnapshotBeforeUpdate == "function" && (t.flags |= 1024)) : (typeof o.componentDidUpdate != "function" || _ === e.memoizedProps && S === e.memoizedState || (t.flags |= 4), typeof o.getSnapshotBeforeUpdate != "function" || _ === e.memoizedProps && S === e.memoizedState || (t.flags |= 1024), t.memoizedProps = u, t.memoizedState = x), o.props = u, o.state = x, o.context = d, u = E) : (typeof o.componentDidUpdate != "function" || _ === e.memoizedProps && S === e.memoizedState || (t.flags |= 4), typeof o.getSnapshotBeforeUpdate != "function" || _ === e.memoizedProps && S === e.memoizedState || (t.flags |= 1024), u = false);
    }
    return o = u, au(e, t), u = (t.flags & 128) !== 0, o || u ? (o = t.stateNode, c = u && typeof c.getDerivedStateFromError != "function" ? null : o.render(), t.flags |= 1, e !== null && u ? (t.child = Cn(t, e.child, null, l), t.child = Cn(t, null, c, l)) : Re(e, t, c, l), t.memoizedState = o.state, e = t.child) : e = Ut(e, t, l), e;
  }
  function h_(e, t, c, u) {
    return An(), t.flags |= 256, Re(e, t, c, u), t.child;
  }
  var cl = { dehydrated: null, treeContext: null, retryLane: 0, hydrationErrors: null };
  function ul(e) {
    return { baseLanes: e, cachePool: oo() };
  }
  function il(e, t, c) {
    return e = e !== null ? e.childLanes & ~c : 0, t && (e |= tt), e;
  }
  function j_(e, t, c) {
    var u = t.pendingProps, l = false, o = (t.flags & 128) !== 0, _;
    if ((_ = o) || (_ = e !== null && e.memoizedState === null ? false : (we.current & 2) !== 0), _ && (l = true, t.flags &= -129), _ = (t.flags & 32) !== 0, t.flags &= -33, e === null) {
      if (I) {
        if (l ? nn(t) : an(), (e = se) ? (e = Rf(e, _t), e = e !== null && e.data !== "&" ? e : null, e !== null && (t.memoizedState = { dehydrated: e, treeContext: Kt !== null ? { id: jt, overflow: vt } : null, retryLane: 536870912, hydrationErrors: null }, c = eo(e), c.return = t, t.child = c, Me = t, se = null)) : e = null, e === null) throw It(t);
        return Wl(e) ? t.lanes = 32 : t.lanes = 536870912, null;
      }
      var s = u.children;
      return u = u.fallback, l ? (an(), l = t.mode, s = cu({ mode: "hidden", children: s }, l), u = En(u, l, c, null), s.return = t, u.return = t, s.sibling = u, t.child = s, u = t.child, u.memoizedState = ul(c), u.childLanes = il(e, _, c), t.memoizedState = cl, Ia(null, u)) : (nn(t), ll(t, s));
    }
    var d = e.memoizedState;
    if (d !== null && (s = d.dehydrated, s !== null)) {
      if (o) t.flags & 256 ? (nn(t), t.flags &= -257, t = rl(e, t, c)) : t.memoizedState !== null ? (an(), t.child = e.child, t.flags |= 128, t = null) : (an(), s = u.fallback, l = t.mode, u = cu({ mode: "visible", children: u.children }, l), s = En(s, l, c, null), s.flags |= 2, u.return = t, s.return = t, u.sibling = s, t.child = u, Cn(t, e.child, null, c), u = t.child, u.memoizedState = ul(c), u.childLanes = il(e, _, c), t.memoizedState = cl, t = Ia(null, u));
      else if (nn(t), Wl(s)) {
        if (_ = s.nextSibling && s.nextSibling.dataset, _) var v = _.dgst;
        _ = v, u = Error(r(419)), u.stack = "", u.digest = _, qa({ value: u, source: null, stack: null }), t = rl(e, t, c);
      } else if (je || na(e, t, c, false), _ = (c & e.childLanes) !== 0, je || _) {
        if (_ = _e, _ !== null && (u = lr(_, c), u !== 0 && u !== d.retryLane)) throw d.retryLane = u, xn(e, u), Fe(_, e, u), nl;
        Vl(s) || bu(), t = rl(e, t, c);
      } else Vl(s) ? (t.flags |= 192, t.child = e.child, t = null) : (e = d.treeContext, se = st(s.nextSibling), Me = t, I = true, Jt = null, _t = false, e !== null && ao(t, e), t = ll(t, u.children), t.flags |= 4096);
      return t;
    }
    return l ? (an(), s = u.fallback, l = t.mode, d = e.child, v = d.sibling, u = Dt(d, { mode: "hidden", children: u.children }), u.subtreeFlags = d.subtreeFlags & 65011712, v !== null ? s = Dt(v, s) : (s = En(s, l, c, null), s.flags |= 2), s.return = t, u.return = t, u.sibling = s, t.child = u, Ia(null, u), u = t.child, s = e.child.memoizedState, s === null ? s = ul(c) : (l = s.cachePool, l !== null ? (d = ye._currentValue, l = l.parent !== d ? { parent: d, pool: d } : l) : l = oo(), s = { baseLanes: s.baseLanes | c, cachePool: l }), u.memoizedState = s, u.childLanes = il(e, _, c), t.memoizedState = cl, Ia(e.child, u)) : (nn(t), c = e.child, e = c.sibling, c = Dt(c, { mode: "visible", children: u.children }), c.return = t, c.sibling = null, e !== null && (_ = t.deletions, _ === null ? (t.deletions = [e], t.flags |= 16) : _.push(e)), t.child = c, t.memoizedState = null, c);
  }
  function ll(e, t) {
    return t = cu({ mode: "visible", children: t }, e.mode), t.return = e, e.child = t;
  }
  function cu(e, t) {
    return e = Ie(22, e, null, t), e.lanes = 0, e;
  }
  function rl(e, t, c) {
    return Cn(t, e.child, null, c), e = ll(t, t.pendingProps.children), e.flags |= 2, t.memoizedState = null, e;
  }
  function v_(e, t, c) {
    e.lanes |= t;
    var u = e.alternate;
    u !== null && (u.lanes |= t), vi(e.return, t, c);
  }
  function ol(e, t, c, u, l, o) {
    var _ = e.memoizedState;
    _ === null ? e.memoizedState = { isBackwards: t, rendering: null, renderingStartTime: 0, last: u, tail: c, tailMode: l, treeForkCount: o } : (_.isBackwards = t, _.rendering = null, _.renderingStartTime = 0, _.last = u, _.tail = c, _.tailMode = l, _.treeForkCount = o);
  }
  function S_(e, t, c) {
    var u = t.pendingProps, l = u.revealOrder, o = u.tail;
    u = u.children;
    var _ = we.current, s = (_ & 2) !== 0;
    if (s ? (_ = _ & 1 | 2, t.flags |= 128) : _ &= 1, H(we, _), Re(e, t, u, c), u = I ? La : 0, !s && e !== null && (e.flags & 128) !== 0) e: for (e = t.child; e !== null; ) {
      if (e.tag === 13) e.memoizedState !== null && v_(e, c, t);
      else if (e.tag === 19) v_(e, c, t);
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
    switch (l) {
      case "forwards":
        for (c = t.child, l = null; c !== null; ) e = c.alternate, e !== null && Fc(e) === null && (l = c), c = c.sibling;
        c = l, c === null ? (l = t.child, t.child = null) : (l = c.sibling, c.sibling = null), ol(t, false, l, c, o, u);
        break;
      case "backwards":
      case "unstable_legacy-backwards":
        for (c = null, l = t.child, t.child = null; l !== null; ) {
          if (e = l.alternate, e !== null && Fc(e) === null) {
            t.child = l;
            break;
          }
          e = l.sibling, l.sibling = c, c = l, l = e;
        }
        ol(t, true, c, null, o, u);
        break;
      case "together":
        ol(t, false, null, null, void 0, u);
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
    if (e !== null && t.child !== e.child) throw Error(r(153));
    if (t.child !== null) {
      for (e = t.child, c = Dt(e, e.pendingProps), t.child = c, c.return = t; e.sibling !== null; ) e = e.sibling, c = c.sibling = Dt(e, e.pendingProps), c.return = t;
      c.sibling = null;
    }
    return t.child;
  }
  function _l(e, t) {
    return (e.lanes & t) !== 0 ? true : (e = e.dependencies, !!(e !== null && Lc(e)));
  }
  function Sb(e, t, c) {
    switch (t.tag) {
      case 3:
        Ne(t, t.stateNode.containerInfo), $t(t, ye, e.memoizedState.cache), An();
        break;
      case 27:
      case 5:
        va(t);
        break;
      case 4:
        Ne(t, t.stateNode.containerInfo);
        break;
      case 10:
        $t(t, t.type, t.memoizedProps.value);
        break;
      case 31:
        if (t.memoizedState !== null) return t.flags |= 128, Ni(t), null;
        break;
      case 13:
        var u = t.memoizedState;
        if (u !== null) return u.dehydrated !== null ? (nn(t), t.flags |= 128, null) : (c & t.child.childLanes) !== 0 ? j_(e, t, c) : (nn(t), e = Ut(e, t, c), e !== null ? e.sibling : null);
        nn(t);
        break;
      case 19:
        var l = (e.flags & 128) !== 0;
        if (u = (c & t.childLanes) !== 0, u || (na(e, t, c, false), u = (c & t.childLanes) !== 0), l) {
          if (u) return S_(e, t, c);
          t.flags |= 128;
        }
        if (l = t.memoizedState, l !== null && (l.rendering = null, l.tail = null, l.lastEffect = null), H(we, we.current), u) break;
        return null;
      case 22:
        return t.lanes = 0, m_(e, t, c, t.pendingProps);
      case 24:
        $t(t, ye, e.memoizedState.cache);
    }
    return Ut(e, t, c);
  }
  function x_(e, t, c) {
    if (e !== null) if (e.memoizedProps !== t.pendingProps) je = true;
    else {
      if (!_l(e, c) && (t.flags & 128) === 0) return je = false, Sb(e, t, c);
      je = (e.flags & 131072) !== 0;
    }
    else je = false, I && (t.flags & 1048576) !== 0 && no(t, La, t.index);
    switch (t.lanes = 0, t.tag) {
      case 16:
        e: {
          var u = t.pendingProps;
          if (e = Rn(t.elementType), t.type = e, typeof e == "function") gi(e) ? (u = Nn(e, u), t.tag = 1, t = y_(null, t, e, u, c)) : (t.tag = 0, t = al(null, t, e, u, c));
          else {
            if (e != null) {
              var l = e.$$typeof;
              if (l === at) {
                t.tag = 11, t = b_(null, t, e, u, c);
                break e;
              } else if (l === J) {
                t.tag = 14, t = d_(null, t, e, u, c);
                break e;
              }
            }
            throw t = Et(e) || e, Error(r(306, t, ""));
          }
        }
        return t;
      case 0:
        return al(e, t, t.type, t.pendingProps, c);
      case 1:
        return u = t.type, l = Nn(u, t.pendingProps), y_(e, t, u, l, c);
      case 3:
        e: {
          if (Ne(t, t.stateNode.containerInfo), e === null) throw Error(r(387));
          u = t.pendingProps;
          var o = t.memoizedState;
          l = o.element, Di(e, t), Fa(t, u, null, c);
          var _ = t.memoizedState;
          if (u = _.cache, $t(t, ye, u), u !== o.cache && Si(t, [ye], c, true), Xa(), u = _.element, o.isDehydrated) if (o = { element: u, isDehydrated: false, cache: _.cache }, t.updateQueue.baseState = o, t.memoizedState = o, t.flags & 256) {
            t = h_(e, t, u, c);
            break e;
          } else if (u !== l) {
            l = lt(Error(r(424)), t), qa(l), t = h_(e, t, u, c);
            break e;
          } else {
            switch (e = t.stateNode.containerInfo, e.nodeType) {
              case 9:
                e = e.body;
                break;
              default:
                e = e.nodeName === "HTML" ? e.ownerDocument.body : e;
            }
            for (se = st(e.firstChild), Me = t, I = true, Jt = null, _t = true, c = mo(t, null, u, c), t.child = c; c; ) c.flags = c.flags & -3 | 4096, c = c.sibling;
          }
          else {
            if (An(), u === l) {
              t = Ut(e, t, c);
              break e;
            }
            Re(e, t, u, c);
          }
          t = t.child;
        }
        return t;
      case 26:
        return au(e, t), e === null ? (c = Bf(t.type, null, t.pendingProps, null)) ? t.memoizedState = c : I || (c = t.type, e = t.pendingProps, u = yu(X.current).createElement(c), u[Te] = t, u[Ge] = e, ze(u, c, e), Ee(u), t.stateNode = u) : t.memoizedState = Bf(t.type, e.memoizedProps, t.pendingProps, e.memoizedState), null;
      case 27:
        return va(t), e === null && I && (u = t.stateNode = Hf(t.type, t.pendingProps, X.current), Me = t, _t = true, l = se, sn(t.type) ? (kl = l, se = st(u.firstChild)) : se = l), Re(e, t, t.pendingProps.children, c), au(e, t), e === null && (t.flags |= 4194304), t.child;
      case 5:
        return e === null && I && ((l = u = se) && (u = ed(u, t.type, t.pendingProps, _t), u !== null ? (t.stateNode = u, Me = t, se = st(u.firstChild), _t = false, l = true) : l = false), l || It(t)), va(t), l = t.type, o = t.pendingProps, _ = e !== null ? e.memoizedProps : null, u = o.children, Ll(l, o) ? u = null : _ !== null && Ll(l, _) && (t.flags |= 32), t.memoizedState !== null && (l = Bi(e, t, gb, null, null, c), sc._currentValue = l), au(e, t), Re(e, t, u, c), t.child;
      case 6:
        return e === null && I && ((e = c = se) && (c = td(c, t.pendingProps, _t), c !== null ? (t.stateNode = c, Me = t, se = null, e = true) : e = false), e || It(t)), null;
      case 13:
        return j_(e, t, c);
      case 4:
        return Ne(t, t.stateNode.containerInfo), u = t.pendingProps, e === null ? t.child = Cn(t, null, u, c) : Re(e, t, u, c), t.child;
      case 11:
        return b_(e, t, t.type, t.pendingProps, c);
      case 7:
        return Re(e, t, t.pendingProps, c), t.child;
      case 8:
        return Re(e, t, t.pendingProps.children, c), t.child;
      case 12:
        return Re(e, t, t.pendingProps.children, c), t.child;
      case 10:
        return u = t.pendingProps, $t(t, t.type, u.value), Re(e, t, u.children, c), t.child;
      case 9:
        return l = t.type._context, u = t.pendingProps.children, Mn(t), l = De(l), u = u(l), t.flags |= 1, Re(e, t, u, c), t.child;
      case 14:
        return d_(e, t, t.type, t.pendingProps, c);
      case 15:
        return g_(e, t, t.type, t.pendingProps, c);
      case 19:
        return S_(e, t, c);
      case 31:
        return vb(e, t, c);
      case 22:
        return m_(e, t, c, t.pendingProps);
      case 24:
        return Mn(t), u = De(ye), e === null ? (l = Ai(), l === null && (l = _e, o = xi(), l.pooledCache = o, o.refCount++, o !== null && (l.pooledCacheLanes |= c), l = o), t.memoizedState = { parent: u, cache: l }, Mi(t), $t(t, ye, l)) : ((e.lanes & c) !== 0 && (Di(e, t), Fa(t, null, null, c), Xa()), l = e.memoizedState, o = t.memoizedState, l.parent !== u ? (l = { parent: u, cache: u }, t.memoizedState = l, t.lanes === 0 && (t.memoizedState = t.updateQueue.baseState = l), $t(t, ye, u)) : (u = o.cache, $t(t, ye, u), u !== l.cache && Si(t, [ye], c, true))), Re(e, t, t.pendingProps.children, c), t.child;
      case 29:
        throw t.pendingProps;
    }
    throw Error(r(156, t.tag));
  }
  function Bt(e) {
    e.flags |= 4;
  }
  function fl(e, t, c, u, l) {
    if ((t = (e.mode & 32) !== 0) && (t = false), t) {
      if (e.flags |= 16777216, (l & 335544128) === l) if (e.stateNode.complete) e.flags |= 8192;
      else if ($_()) e.flags |= 8192;
      else throw zn = Wc, Ti;
    } else e.flags &= -16777217;
  }
  function E_(e, t) {
    if (t.type !== "stylesheet" || (t.state.loading & 4) !== 0) e.flags &= -16777217;
    else if (e.flags |= 16777216, !Wf(t)) if ($_()) e.flags |= 8192;
    else throw zn = Wc, Ti;
  }
  function uu(e, t) {
    t !== null && (e.flags |= 4), e.flags & 16384 && (t = e.tag !== 22 ? cr() : 536870912, e.lanes |= t, da |= t);
  }
  function $a(e, t) {
    if (!I) switch (e.tailMode) {
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
  function be(e) {
    var t = e.alternate !== null && e.alternate.child === e.child, c = 0, u = 0;
    if (t) for (var l = e.child; l !== null; ) c |= l.lanes | l.childLanes, u |= l.subtreeFlags & 65011712, u |= l.flags & 65011712, l.return = e, l = l.sibling;
    else for (l = e.child; l !== null; ) c |= l.lanes | l.childLanes, u |= l.subtreeFlags, u |= l.flags, l.return = e, l = l.sibling;
    return e.subtreeFlags |= u, e.childLanes = c, t;
  }
  function xb(e, t, c) {
    var u = t.pendingProps;
    switch (Oi(t), t.tag) {
      case 16:
      case 15:
      case 0:
      case 11:
      case 7:
      case 8:
      case 12:
      case 9:
      case 14:
        return be(t), null;
      case 1:
        return be(t), null;
      case 3:
        return c = t.stateNode, u = null, e !== null && (u = e.memoizedState.cache), t.memoizedState.cache !== u && (t.flags |= 2048), Ct(ye), pe(), c.pendingContext && (c.context = c.pendingContext, c.pendingContext = null), (e === null || e.child === null) && (ta(t) ? Bt(t) : e === null || e.memoizedState.isDehydrated && (t.flags & 256) === 0 || (t.flags |= 1024, hi())), be(t), null;
      case 26:
        var l = t.type, o = t.memoizedState;
        return e === null ? (Bt(t), o !== null ? (be(t), E_(t, o)) : (be(t), fl(t, l, null, u, c))) : o ? o !== e.memoizedState ? (Bt(t), be(t), E_(t, o)) : (be(t), t.flags &= -16777217) : (e = e.memoizedProps, e !== u && Bt(t), be(t), fl(t, l, e, u, c)), null;
      case 27:
        if (mc(t), c = X.current, l = t.type, e !== null && t.stateNode != null) e.memoizedProps !== u && Bt(t);
        else {
          if (!u) {
            if (t.stateNode === null) throw Error(r(166));
            return be(t), null;
          }
          e = B.current, ta(t) ? co(t) : (e = Hf(l, u, c), t.stateNode = e, Bt(t));
        }
        return be(t), null;
      case 5:
        if (mc(t), l = t.type, e !== null && t.stateNode != null) e.memoizedProps !== u && Bt(t);
        else {
          if (!u) {
            if (t.stateNode === null) throw Error(r(166));
            return be(t), null;
          }
          if (o = B.current, ta(t)) co(t);
          else {
            var _ = yu(X.current);
            switch (o) {
              case 1:
                o = _.createElementNS("http://www.w3.org/2000/svg", l);
                break;
              case 2:
                o = _.createElementNS("http://www.w3.org/1998/Math/MathML", l);
                break;
              default:
                switch (l) {
                  case "svg":
                    o = _.createElementNS("http://www.w3.org/2000/svg", l);
                    break;
                  case "math":
                    o = _.createElementNS("http://www.w3.org/1998/Math/MathML", l);
                    break;
                  case "script":
                    o = _.createElement("div"), o.innerHTML = "<script><\/script>", o = o.removeChild(o.firstChild);
                    break;
                  case "select":
                    o = typeof u.is == "string" ? _.createElement("select", { is: u.is }) : _.createElement("select"), u.multiple ? o.multiple = true : u.size && (o.size = u.size);
                    break;
                  default:
                    o = typeof u.is == "string" ? _.createElement(l, { is: u.is }) : _.createElement(l);
                }
            }
            o[Te] = t, o[Ge] = u;
            e: for (_ = t.child; _ !== null; ) {
              if (_.tag === 5 || _.tag === 6) o.appendChild(_.stateNode);
              else if (_.tag !== 4 && _.tag !== 27 && _.child !== null) {
                _.child.return = _, _ = _.child;
                continue;
              }
              if (_ === t) break e;
              for (; _.sibling === null; ) {
                if (_.return === null || _.return === t) break e;
                _ = _.return;
              }
              _.sibling.return = _.return, _ = _.sibling;
            }
            t.stateNode = o;
            e: switch (ze(o, l, u), l) {
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
        return be(t), fl(t, t.type, e === null ? null : e.memoizedProps, t.pendingProps, c), null;
      case 6:
        if (e && t.stateNode != null) e.memoizedProps !== u && Bt(t);
        else {
          if (typeof u != "string" && t.stateNode === null) throw Error(r(166));
          if (e = X.current, ta(t)) {
            if (e = t.stateNode, c = t.memoizedProps, u = null, l = Me, l !== null) switch (l.tag) {
              case 27:
              case 5:
                u = l.memoizedProps;
            }
            e[Te] = t, e = !!(e.nodeValue === c || u !== null && u.suppressHydrationWarning === true || vf(e.nodeValue, c)), e || It(t, true);
          } else e = yu(e).createTextNode(u), e[Te] = t, t.stateNode = e;
        }
        return be(t), null;
      case 31:
        if (c = t.memoizedState, e === null || e.memoizedState !== null) {
          if (u = ta(t), c !== null) {
            if (e === null) {
              if (!u) throw Error(r(318));
              if (e = t.memoizedState, e = e !== null ? e.dehydrated : null, !e) throw Error(r(557));
              e[Te] = t;
            } else An(), (t.flags & 128) === 0 && (t.memoizedState = null), t.flags |= 4;
            be(t), e = false;
          } else c = hi(), e !== null && e.memoizedState !== null && (e.memoizedState.hydrationErrors = c), e = true;
          if (!e) return t.flags & 256 ? (Pe(t), t) : (Pe(t), null);
          if ((t.flags & 128) !== 0) throw Error(r(558));
        }
        return be(t), null;
      case 13:
        if (u = t.memoizedState, e === null || e.memoizedState !== null && e.memoizedState.dehydrated !== null) {
          if (l = ta(t), u !== null && u.dehydrated !== null) {
            if (e === null) {
              if (!l) throw Error(r(318));
              if (l = t.memoizedState, l = l !== null ? l.dehydrated : null, !l) throw Error(r(317));
              l[Te] = t;
            } else An(), (t.flags & 128) === 0 && (t.memoizedState = null), t.flags |= 4;
            be(t), l = false;
          } else l = hi(), e !== null && e.memoizedState !== null && (e.memoizedState.hydrationErrors = l), l = true;
          if (!l) return t.flags & 256 ? (Pe(t), t) : (Pe(t), null);
        }
        return Pe(t), (t.flags & 128) !== 0 ? (t.lanes = c, t) : (c = u !== null, e = e !== null && e.memoizedState !== null, c && (u = t.child, l = null, u.alternate !== null && u.alternate.memoizedState !== null && u.alternate.memoizedState.cachePool !== null && (l = u.alternate.memoizedState.cachePool.pool), o = null, u.memoizedState !== null && u.memoizedState.cachePool !== null && (o = u.memoizedState.cachePool.pool), o !== l && (u.flags |= 2048)), c !== e && c && (t.child.flags |= 8192), uu(t, t.updateQueue), be(t), null);
      case 4:
        return pe(), e === null && Cl(t.stateNode.containerInfo), be(t), null;
      case 10:
        return Ct(t.type), be(t), null;
      case 19:
        if (D(we), u = t.memoizedState, u === null) return be(t), null;
        if (l = (t.flags & 128) !== 0, o = u.rendering, o === null) if (l) $a(u, false);
        else {
          if (me !== 0 || e !== null && (e.flags & 128) !== 0) for (e = t.child; e !== null; ) {
            if (o = Fc(e), o !== null) {
              for (t.flags |= 128, $a(u, false), e = o.updateQueue, t.updateQueue = e, uu(t, e), t.subtreeFlags = 0, e = c, c = t.child; c !== null; ) Pr(c, e), c = c.sibling;
              return H(we, we.current & 1 | 2), I && Rt(t, u.treeForkCount), t.child;
            }
            e = e.sibling;
          }
          u.tail !== null && Qe() > _u && (t.flags |= 128, l = true, $a(u, false), t.lanes = 4194304);
        }
        else {
          if (!l) if (e = Fc(o), e !== null) {
            if (t.flags |= 128, l = true, e = e.updateQueue, t.updateQueue = e, uu(t, e), $a(u, true), u.tail === null && u.tailMode === "hidden" && !o.alternate && !I) return be(t), null;
          } else 2 * Qe() - u.renderingStartTime > _u && c !== 536870912 && (t.flags |= 128, l = true, $a(u, false), t.lanes = 4194304);
          u.isBackwards ? (o.sibling = t.child, t.child = o) : (e = u.last, e !== null ? e.sibling = o : t.child = o, u.last = o);
        }
        return u.tail !== null ? (e = u.tail, u.rendering = e, u.tail = e.sibling, u.renderingStartTime = Qe(), e.sibling = null, c = we.current, H(we, l ? c & 1 | 2 : c & 1), I && Rt(t, u.treeForkCount), e) : (be(t), null);
      case 22:
      case 23:
        return Pe(t), Hi(), u = t.memoizedState !== null, e !== null ? e.memoizedState !== null !== u && (t.flags |= 8192) : u && (t.flags |= 8192), u ? (c & 536870912) !== 0 && (t.flags & 128) === 0 && (be(t), t.subtreeFlags & 6 && (t.flags |= 8192)) : be(t), c = t.updateQueue, c !== null && uu(t, c.retryQueue), c = null, e !== null && e.memoizedState !== null && e.memoizedState.cachePool !== null && (c = e.memoizedState.cachePool.pool), u = null, t.memoizedState !== null && t.memoizedState.cachePool !== null && (u = t.memoizedState.cachePool.pool), u !== c && (t.flags |= 2048), e !== null && D(Dn), null;
      case 24:
        return c = null, e !== null && (c = e.memoizedState.cache), t.memoizedState.cache !== c && (t.flags |= 2048), Ct(ye), be(t), null;
      case 25:
        return null;
      case 30:
        return null;
    }
    throw Error(r(156, t.tag));
  }
  function Eb(e, t) {
    switch (Oi(t), t.tag) {
      case 1:
        return e = t.flags, e & 65536 ? (t.flags = e & -65537 | 128, t) : null;
      case 3:
        return Ct(ye), pe(), e = t.flags, (e & 65536) !== 0 && (e & 128) === 0 ? (t.flags = e & -65537 | 128, t) : null;
      case 26:
      case 27:
      case 5:
        return mc(t), null;
      case 31:
        if (t.memoizedState !== null) {
          if (Pe(t), t.alternate === null) throw Error(r(340));
          An();
        }
        return e = t.flags, e & 65536 ? (t.flags = e & -65537 | 128, t) : null;
      case 13:
        if (Pe(t), e = t.memoizedState, e !== null && e.dehydrated !== null) {
          if (t.alternate === null) throw Error(r(340));
          An();
        }
        return e = t.flags, e & 65536 ? (t.flags = e & -65537 | 128, t) : null;
      case 19:
        return D(we), null;
      case 4:
        return pe(), null;
      case 10:
        return Ct(t.type), null;
      case 22:
      case 23:
        return Pe(t), Hi(), e !== null && D(Dn), e = t.flags, e & 65536 ? (t.flags = e & -65537 | 128, t) : null;
      case 24:
        return Ct(ye), null;
      case 25:
        return null;
      default:
        return null;
    }
  }
  function A_(e, t) {
    switch (Oi(t), t.tag) {
      case 3:
        Ct(ye), pe();
        break;
      case 26:
      case 27:
      case 5:
        mc(t);
        break;
      case 4:
        pe();
        break;
      case 31:
        t.memoizedState !== null && Pe(t);
        break;
      case 13:
        Pe(t);
        break;
      case 19:
        D(we);
        break;
      case 10:
        Ct(t.type);
        break;
      case 22:
      case 23:
        Pe(t), Hi(), e !== null && D(Dn);
        break;
      case 24:
        Ct(ye);
    }
  }
  function Pa(e, t) {
    try {
      var c = t.updateQueue, u = c !== null ? c.lastEffect : null;
      if (u !== null) {
        var l = u.next;
        c = l;
        do {
          if ((c.tag & e) === e) {
            u = void 0;
            var o = c.create, _ = c.inst;
            u = o(), _.destroy = u;
          }
          c = c.next;
        } while (c !== l);
      }
    } catch (s) {
      ae(t, t.return, s);
    }
  }
  function cn(e, t, c) {
    try {
      var u = t.updateQueue, l = u !== null ? u.lastEffect : null;
      if (l !== null) {
        var o = l.next;
        u = o;
        do {
          if ((u.tag & e) === e) {
            var _ = u.inst, s = _.destroy;
            if (s !== void 0) {
              _.destroy = void 0, l = t;
              var d = c, v = s;
              try {
                v();
              } catch (E) {
                ae(l, d, E);
              }
            }
          }
          u = u.next;
        } while (u !== o);
      }
    } catch (E) {
      ae(t, t.return, E);
    }
  }
  function T_(e) {
    var t = e.updateQueue;
    if (t !== null) {
      var c = e.stateNode;
      try {
        wo(t, c);
      } catch (u) {
        ae(e, e.return, u);
      }
    }
  }
  function M_(e, t, c) {
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
    } catch (l) {
      ae(e, t, l);
    }
  }
  function St(e, t) {
    var c = e.ref, u = e.refCleanup;
    if (c !== null) if (typeof u == "function") try {
      u();
    } catch (l) {
      ae(e, t, l);
    } finally {
      e.refCleanup = null, e = e.alternate, e != null && (e.refCleanup = null);
    }
    else if (typeof c == "function") try {
      c(null);
    } catch (l) {
      ae(e, t, l);
    }
    else c.current = null;
  }
  function D_(e) {
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
    } catch (l) {
      ae(e, e.return, l);
    }
  }
  function sl(e, t, c) {
    try {
      var u = e.stateNode;
      Zb(u, e.type, c, t), u[Ge] = t;
    } catch (l) {
      ae(e, e.return, l);
    }
  }
  function R_(e) {
    return e.tag === 5 || e.tag === 3 || e.tag === 26 || e.tag === 27 && sn(e.type) || e.tag === 4;
  }
  function bl(e) {
    e: for (; ; ) {
      for (; e.sibling === null; ) {
        if (e.return === null || R_(e.return)) return null;
        e = e.return;
      }
      for (e.sibling.return = e.return, e = e.sibling; e.tag !== 5 && e.tag !== 6 && e.tag !== 18; ) {
        if (e.tag === 27 && sn(e.type) || e.flags & 2 || e.child === null || e.tag === 4) continue e;
        e.child.return = e, e = e.child;
      }
      if (!(e.flags & 2)) return e.stateNode;
    }
  }
  function dl(e, t, c) {
    var u = e.tag;
    if (u === 5 || u === 6) e = e.stateNode, t ? (c.nodeType === 9 ? c.body : c.nodeName === "HTML" ? c.ownerDocument.body : c).insertBefore(e, t) : (t = c.nodeType === 9 ? c.body : c.nodeName === "HTML" ? c.ownerDocument.body : c, t.appendChild(e), c = c._reactRootContainer, c != null || t.onclick !== null || (t.onclick = Tt));
    else if (u !== 4 && (u === 27 && sn(e.type) && (c = e.stateNode, t = null), e = e.child, e !== null)) for (dl(e, t, c), e = e.sibling; e !== null; ) dl(e, t, c), e = e.sibling;
  }
  function iu(e, t, c) {
    var u = e.tag;
    if (u === 5 || u === 6) e = e.stateNode, t ? c.insertBefore(e, t) : c.appendChild(e);
    else if (u !== 4 && (u === 27 && sn(e.type) && (c = e.stateNode), e = e.child, e !== null)) for (iu(e, t, c), e = e.sibling; e !== null; ) iu(e, t, c), e = e.sibling;
  }
  function z_(e) {
    var t = e.stateNode, c = e.memoizedProps;
    try {
      for (var u = e.type, l = t.attributes; l.length; ) t.removeAttributeNode(l[0]);
      ze(t, u, c), t[Te] = e, t[Ge] = c;
    } catch (o) {
      ae(e, e.return, o);
    }
  }
  var Lt = false, ve = false, gl = false, C_ = typeof WeakSet == "function" ? WeakSet : Set, Ae = null;
  function Ab(e, t) {
    if (e = e.containerInfo, Ul = Au, e = Yr(e), ri(e)) {
      if ("selectionStart" in e) var c = { start: e.selectionStart, end: e.selectionEnd };
      else e: {
        c = (c = e.ownerDocument) && c.defaultView || window;
        var u = c.getSelection && c.getSelection();
        if (u && u.rangeCount !== 0) {
          c = u.anchorNode;
          var l = u.anchorOffset, o = u.focusNode;
          u = u.focusOffset;
          try {
            c.nodeType, o.nodeType;
          } catch {
            c = null;
            break e;
          }
          var _ = 0, s = -1, d = -1, v = 0, E = 0, M = e, S = null;
          t: for (; ; ) {
            for (var x; M !== c || l !== 0 && M.nodeType !== 3 || (s = _ + l), M !== o || u !== 0 && M.nodeType !== 3 || (d = _ + u), M.nodeType === 3 && (_ += M.nodeValue.length), (x = M.firstChild) !== null; ) S = M, M = x;
            for (; ; ) {
              if (M === e) break t;
              if (S === c && ++v === l && (s = _), S === o && ++E === u && (d = _), (x = M.nextSibling) !== null) break;
              M = S, S = M.parentNode;
            }
            M = x;
          }
          c = s === -1 || d === -1 ? null : { start: s, end: d };
        } else c = null;
      }
      c = c || { start: 0, end: 0 };
    } else c = null;
    for (Bl = { focusedElem: e, selectionRange: c }, Au = false, Ae = t; Ae !== null; ) if (t = Ae, e = t.child, (t.subtreeFlags & 1028) !== 0 && e !== null) e.return = t, Ae = e;
    else for (; Ae !== null; ) {
      switch (t = Ae, o = t.alternate, e = t.flags, t.tag) {
        case 0:
          if ((e & 4) !== 0 && (e = t.updateQueue, e = e !== null ? e.events : null, e !== null)) for (c = 0; c < e.length; c++) l = e[c], l.ref.impl = l.nextImpl;
          break;
        case 11:
        case 15:
          break;
        case 1:
          if ((e & 1024) !== 0 && o !== null) {
            e = void 0, c = t, l = o.memoizedProps, o = o.memoizedState, u = c.stateNode;
            try {
              var N = Nn(c.type, l);
              e = u.getSnapshotBeforeUpdate(N, o), u.__reactInternalSnapshotBeforeUpdate = e;
            } catch (G) {
              ae(c, c.return, G);
            }
          }
          break;
        case 3:
          if ((e & 1024) !== 0) {
            if (e = t.stateNode.containerInfo, c = e.nodeType, c === 9) Gl(e);
            else if (c === 1) switch (e.nodeName) {
              case "HEAD":
              case "HTML":
              case "BODY":
                Gl(e);
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
          if ((e & 1024) !== 0) throw Error(r(163));
      }
      if (e = t.sibling, e !== null) {
        e.return = t.return, Ae = e;
        break;
      }
      Ae = t.return;
    }
  }
  function H_(e, t, c) {
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
        } catch (_) {
          ae(c, c.return, _);
        }
        else {
          var l = Nn(c.type, t.memoizedProps);
          t = t.memoizedState;
          try {
            e.componentDidUpdate(l, t, e.__reactInternalSnapshotBeforeUpdate);
          } catch (_) {
            ae(c, c.return, _);
          }
        }
        u & 64 && T_(c), u & 512 && ec(c, c.return);
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
            wo(e, t);
          } catch (_) {
            ae(c, c.return, _);
          }
        }
        break;
      case 27:
        t === null && u & 4 && z_(c);
      case 26:
      case 5:
        Gt(e, c), t === null && u & 4 && D_(c), u & 512 && ec(c, c.return);
        break;
      case 12:
        Gt(e, c);
        break;
      case 31:
        Gt(e, c), u & 4 && B_(e, c);
        break;
      case 13:
        Gt(e, c), u & 4 && L_(e, c), u & 64 && (e = c.memoizedState, e !== null && (e = e.dehydrated, e !== null && (c = Ub.bind(null, c), nd(e, c))));
        break;
      case 22:
        if (u = c.memoizedState !== null || Lt, !u) {
          t = t !== null && t.memoizedState !== null || ve, l = Lt;
          var o = ve;
          Lt = u, (ve = t) && !o ? Vt(e, c, (c.subtreeFlags & 8772) !== 0) : Gt(e, c), Lt = l, ve = o;
        }
        break;
      case 30:
        break;
      default:
        Gt(e, c);
    }
  }
  function N_(e) {
    var t = e.alternate;
    t !== null && (e.alternate = null, N_(t)), e.child = null, e.deletions = null, e.sibling = null, e.tag === 5 && (t = e.stateNode, t !== null && Xu(t)), e.stateNode = null, e.return = null, e.dependencies = null, e.memoizedProps = null, e.memoizedState = null, e.pendingProps = null, e.stateNode = null, e.updateQueue = null;
  }
  var de = null, We = false;
  function qt(e, t, c) {
    for (c = c.child; c !== null; ) U_(e, t, c), c = c.sibling;
  }
  function U_(e, t, c) {
    if (Ze && typeof Ze.onCommitFiberUnmount == "function") try {
      Ze.onCommitFiberUnmount(Sa, c);
    } catch {
    }
    switch (c.tag) {
      case 26:
        ve || St(c, t), qt(e, t, c), c.memoizedState ? c.memoizedState.count-- : c.stateNode && (c = c.stateNode, c.parentNode.removeChild(c));
        break;
      case 27:
        ve || St(c, t);
        var u = de, l = We;
        sn(c.type) && (de = c.stateNode, We = false), qt(e, t, c), oc(c.stateNode), de = u, We = l;
        break;
      case 5:
        ve || St(c, t);
      case 6:
        if (u = de, l = We, de = null, qt(e, t, c), de = u, We = l, de !== null) if (We) try {
          (de.nodeType === 9 ? de.body : de.nodeName === "HTML" ? de.ownerDocument.body : de).removeChild(c.stateNode);
        } catch (o) {
          ae(c, t, o);
        }
        else try {
          de.removeChild(c.stateNode);
        } catch (o) {
          ae(c, t, o);
        }
        break;
      case 18:
        de !== null && (We ? (e = de, Mf(e.nodeType === 9 ? e.body : e.nodeName === "HTML" ? e.ownerDocument.body : e, c.stateNode), ja(e)) : Mf(de, c.stateNode));
        break;
      case 4:
        u = de, l = We, de = c.stateNode.containerInfo, We = true, qt(e, t, c), de = u, We = l;
        break;
      case 0:
      case 11:
      case 14:
      case 15:
        cn(2, c, t), ve || cn(4, c, t), qt(e, t, c);
        break;
      case 1:
        ve || (St(c, t), u = c.stateNode, typeof u.componentWillUnmount == "function" && M_(c, t, u)), qt(e, t, c);
        break;
      case 21:
        qt(e, t, c);
        break;
      case 22:
        ve = (u = ve) || c.memoizedState !== null, qt(e, t, c), ve = u;
        break;
      default:
        qt(e, t, c);
    }
  }
  function B_(e, t) {
    if (t.memoizedState === null && (e = t.alternate, e !== null && (e = e.memoizedState, e !== null))) {
      e = e.dehydrated;
      try {
        ja(e);
      } catch (c) {
        ae(t, t.return, c);
      }
    }
  }
  function L_(e, t) {
    if (t.memoizedState === null && (e = t.alternate, e !== null && (e = e.memoizedState, e !== null && (e = e.dehydrated, e !== null)))) try {
      ja(e);
    } catch (c) {
      ae(t, t.return, c);
    }
  }
  function Tb(e) {
    switch (e.tag) {
      case 31:
      case 13:
      case 19:
        var t = e.stateNode;
        return t === null && (t = e.stateNode = new C_()), t;
      case 22:
        return e = e.stateNode, t = e._retryCache, t === null && (t = e._retryCache = new C_()), t;
      default:
        throw Error(r(435, e.tag));
    }
  }
  function lu(e, t) {
    var c = Tb(e);
    t.forEach(function(u) {
      if (!c.has(u)) {
        c.add(u);
        var l = Bb.bind(null, e, u);
        u.then(l, l);
      }
    });
  }
  function ke(e, t) {
    var c = t.deletions;
    if (c !== null) for (var u = 0; u < c.length; u++) {
      var l = c[u], o = e, _ = t, s = _;
      e: for (; s !== null; ) {
        switch (s.tag) {
          case 27:
            if (sn(s.type)) {
              de = s.stateNode, We = false;
              break e;
            }
            break;
          case 5:
            de = s.stateNode, We = false;
            break e;
          case 3:
          case 4:
            de = s.stateNode.containerInfo, We = true;
            break e;
        }
        s = s.return;
      }
      if (de === null) throw Error(r(160));
      U_(o, _, l), de = null, We = false, o = l.alternate, o !== null && (o.return = null), l.return = null;
    }
    if (t.subtreeFlags & 13886) for (t = t.child; t !== null; ) q_(t, e), t = t.sibling;
  }
  var mt = null;
  function q_(e, t) {
    var c = e.alternate, u = e.flags;
    switch (e.tag) {
      case 0:
      case 11:
      case 14:
      case 15:
        ke(t, e), Ye(e), u & 4 && (cn(3, e, e.return), Pa(3, e), cn(5, e, e.return));
        break;
      case 1:
        ke(t, e), Ye(e), u & 512 && (ve || c === null || St(c, c.return)), u & 64 && Lt && (e = e.updateQueue, e !== null && (u = e.callbacks, u !== null && (c = e.shared.hiddenCallbacks, e.shared.hiddenCallbacks = c === null ? u : c.concat(u))));
        break;
      case 26:
        var l = mt;
        if (ke(t, e), Ye(e), u & 512 && (ve || c === null || St(c, c.return)), u & 4) {
          var o = c !== null ? c.memoizedState : null;
          if (u = e.memoizedState, c === null) if (u === null) if (e.stateNode === null) {
            e: {
              u = e.type, c = e.memoizedProps, l = l.ownerDocument || l;
              t: switch (u) {
                case "title":
                  o = l.getElementsByTagName("title")[0], (!o || o[Aa] || o[Te] || o.namespaceURI === "http://www.w3.org/2000/svg" || o.hasAttribute("itemprop")) && (o = l.createElement(u), l.head.insertBefore(o, l.querySelector("head > title"))), ze(o, u, c), o[Te] = e, Ee(o), u = o;
                  break e;
                case "link":
                  var _ = Gf("link", "href", l).get(u + (c.href || ""));
                  if (_) {
                    for (var s = 0; s < _.length; s++) if (o = _[s], o.getAttribute("href") === (c.href == null || c.href === "" ? null : c.href) && o.getAttribute("rel") === (c.rel == null ? null : c.rel) && o.getAttribute("title") === (c.title == null ? null : c.title) && o.getAttribute("crossorigin") === (c.crossOrigin == null ? null : c.crossOrigin)) {
                      _.splice(s, 1);
                      break t;
                    }
                  }
                  o = l.createElement(u), ze(o, u, c), l.head.appendChild(o);
                  break;
                case "meta":
                  if (_ = Gf("meta", "content", l).get(u + (c.content || ""))) {
                    for (s = 0; s < _.length; s++) if (o = _[s], o.getAttribute("content") === (c.content == null ? null : "" + c.content) && o.getAttribute("name") === (c.name == null ? null : c.name) && o.getAttribute("property") === (c.property == null ? null : c.property) && o.getAttribute("http-equiv") === (c.httpEquiv == null ? null : c.httpEquiv) && o.getAttribute("charset") === (c.charSet == null ? null : c.charSet)) {
                      _.splice(s, 1);
                      break t;
                    }
                  }
                  o = l.createElement(u), ze(o, u, c), l.head.appendChild(o);
                  break;
                default:
                  throw Error(r(468, u));
              }
              o[Te] = e, Ee(o), u = o;
            }
            e.stateNode = u;
          } else Vf(l, e.type, e.stateNode);
          else e.stateNode = qf(l, u, e.memoizedProps);
          else o !== u ? (o === null ? c.stateNode !== null && (c = c.stateNode, c.parentNode.removeChild(c)) : o.count--, u === null ? Vf(l, e.type, e.stateNode) : qf(l, u, e.memoizedProps)) : u === null && e.stateNode !== null && sl(e, e.memoizedProps, c.memoizedProps);
        }
        break;
      case 27:
        ke(t, e), Ye(e), u & 512 && (ve || c === null || St(c, c.return)), c !== null && u & 4 && sl(e, e.memoizedProps, c.memoizedProps);
        break;
      case 5:
        if (ke(t, e), Ye(e), u & 512 && (ve || c === null || St(c, c.return)), e.flags & 32) {
          l = e.stateNode;
          try {
            Xn(l, "");
          } catch (N) {
            ae(e, e.return, N);
          }
        }
        u & 4 && e.stateNode != null && (l = e.memoizedProps, sl(e, l, c !== null ? c.memoizedProps : l)), u & 1024 && (gl = true);
        break;
      case 6:
        if (ke(t, e), Ye(e), u & 4) {
          if (e.stateNode === null) throw Error(r(162));
          u = e.memoizedProps, c = e.stateNode;
          try {
            c.nodeValue = u;
          } catch (N) {
            ae(e, e.return, N);
          }
        }
        break;
      case 3:
        if (vu = null, l = mt, mt = hu(t.containerInfo), ke(t, e), mt = l, Ye(e), u & 4 && c !== null && c.memoizedState.isDehydrated) try {
          ja(t.containerInfo);
        } catch (N) {
          ae(e, e.return, N);
        }
        gl && (gl = false, G_(e));
        break;
      case 4:
        u = mt, mt = hu(e.stateNode.containerInfo), ke(t, e), Ye(e), mt = u;
        break;
      case 12:
        ke(t, e), Ye(e);
        break;
      case 31:
        ke(t, e), Ye(e), u & 4 && (u = e.updateQueue, u !== null && (e.updateQueue = null, lu(e, u)));
        break;
      case 13:
        ke(t, e), Ye(e), e.child.flags & 8192 && e.memoizedState !== null != (c !== null && c.memoizedState !== null) && (ou = Qe()), u & 4 && (u = e.updateQueue, u !== null && (e.updateQueue = null, lu(e, u)));
        break;
      case 22:
        l = e.memoizedState !== null;
        var d = c !== null && c.memoizedState !== null, v = Lt, E = ve;
        if (Lt = v || l, ve = E || d, ke(t, e), ve = E, Lt = v, Ye(e), u & 8192) e: for (t = e.stateNode, t._visibility = l ? t._visibility & -2 : t._visibility | 1, l && (c === null || d || Lt || ve || Un(e)), c = null, t = e; ; ) {
          if (t.tag === 5 || t.tag === 26) {
            if (c === null) {
              d = c = t;
              try {
                if (o = d.stateNode, l) _ = o.style, typeof _.setProperty == "function" ? _.setProperty("display", "none", "important") : _.display = "none";
                else {
                  s = d.stateNode;
                  var M = d.memoizedProps.style, S = M != null && M.hasOwnProperty("display") ? M.display : null;
                  s.style.display = S == null || typeof S == "boolean" ? "" : ("" + S).trim();
                }
              } catch (N) {
                ae(d, d.return, N);
              }
            }
          } else if (t.tag === 6) {
            if (c === null) {
              d = t;
              try {
                d.stateNode.nodeValue = l ? "" : d.memoizedProps;
              } catch (N) {
                ae(d, d.return, N);
              }
            }
          } else if (t.tag === 18) {
            if (c === null) {
              d = t;
              try {
                var x = d.stateNode;
                l ? Df(x, true) : Df(d.stateNode, false);
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
        u & 4 && (u = e.updateQueue, u !== null && (c = u.retryQueue, c !== null && (u.retryQueue = null, lu(e, c))));
        break;
      case 19:
        ke(t, e), Ye(e), u & 4 && (u = e.updateQueue, u !== null && (e.updateQueue = null, lu(e, u)));
        break;
      case 30:
        break;
      case 21:
        break;
      default:
        ke(t, e), Ye(e);
    }
  }
  function Ye(e) {
    var t = e.flags;
    if (t & 2) {
      try {
        for (var c, u = e.return; u !== null; ) {
          if (R_(u)) {
            c = u;
            break;
          }
          u = u.return;
        }
        if (c == null) throw Error(r(160));
        switch (c.tag) {
          case 27:
            var l = c.stateNode, o = bl(e);
            iu(e, o, l);
            break;
          case 5:
            var _ = c.stateNode;
            c.flags & 32 && (Xn(_, ""), c.flags &= -33);
            var s = bl(e);
            iu(e, s, _);
            break;
          case 3:
          case 4:
            var d = c.stateNode.containerInfo, v = bl(e);
            dl(e, v, d);
            break;
          default:
            throw Error(r(161));
        }
      } catch (E) {
        ae(e, e.return, E);
      }
      e.flags &= -3;
    }
    t & 4096 && (e.flags &= -4097);
  }
  function G_(e) {
    if (e.subtreeFlags & 1024) for (e = e.child; e !== null; ) {
      var t = e;
      G_(t), t.tag === 5 && t.flags & 1024 && t.stateNode.reset(), e = e.sibling;
    }
  }
  function Gt(e, t) {
    if (t.subtreeFlags & 8772) for (t = t.child; t !== null; ) H_(e, t.alternate, t), t = t.sibling;
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
          St(t, t.return);
          var c = t.stateNode;
          typeof c.componentWillUnmount == "function" && M_(t, t.return, c), Un(t);
          break;
        case 27:
          oc(t.stateNode);
        case 26:
        case 5:
          St(t, t.return), Un(t);
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
      var u = t.alternate, l = e, o = t, _ = o.flags;
      switch (o.tag) {
        case 0:
        case 11:
        case 15:
          Vt(l, o, c), Pa(4, o);
          break;
        case 1:
          if (Vt(l, o, c), u = o, l = u.stateNode, typeof l.componentDidMount == "function") try {
            l.componentDidMount();
          } catch (v) {
            ae(u, u.return, v);
          }
          if (u = o, l = u.updateQueue, l !== null) {
            var s = u.stateNode;
            try {
              var d = l.shared.hiddenCallbacks;
              if (d !== null) for (l.shared.hiddenCallbacks = null, l = 0; l < d.length; l++) po(d[l], s);
            } catch (v) {
              ae(u, u.return, v);
            }
          }
          c && _ & 64 && T_(o), ec(o, o.return);
          break;
        case 27:
          z_(o);
        case 26:
        case 5:
          Vt(l, o, c), c && u === null && _ & 4 && D_(o), ec(o, o.return);
          break;
        case 12:
          Vt(l, o, c);
          break;
        case 31:
          Vt(l, o, c), c && _ & 4 && B_(l, o);
          break;
        case 13:
          Vt(l, o, c), c && _ & 4 && L_(l, o);
          break;
        case 22:
          o.memoizedState === null && Vt(l, o, c), ec(o, o.return);
          break;
        case 30:
          break;
        default:
          Vt(l, o, c);
      }
      t = t.sibling;
    }
  }
  function ml(e, t) {
    var c = null;
    e !== null && e.memoizedState !== null && e.memoizedState.cachePool !== null && (c = e.memoizedState.cachePool.pool), e = null, t.memoizedState !== null && t.memoizedState.cachePool !== null && (e = t.memoizedState.cachePool.pool), e !== c && (e != null && e.refCount++, c != null && Ga(c));
  }
  function pl(e, t) {
    e = null, t.alternate !== null && (e = t.alternate.memoizedState.cache), t = t.memoizedState.cache, t !== e && (t.refCount++, e != null && Ga(e));
  }
  function pt(e, t, c, u) {
    if (t.subtreeFlags & 10256) for (t = t.child; t !== null; ) V_(e, t, c, u), t = t.sibling;
  }
  function V_(e, t, c, u) {
    var l = t.flags;
    switch (t.tag) {
      case 0:
      case 11:
      case 15:
        pt(e, t, c, u), l & 2048 && Pa(9, t);
        break;
      case 1:
        pt(e, t, c, u);
        break;
      case 3:
        pt(e, t, c, u), l & 2048 && (e = null, t.alternate !== null && (e = t.alternate.memoizedState.cache), t = t.memoizedState.cache, t !== e && (t.refCount++, e != null && Ga(e)));
        break;
      case 12:
        if (l & 2048) {
          pt(e, t, c, u), e = t.stateNode;
          try {
            var o = t.memoizedProps, _ = o.id, s = o.onPostCommit;
            typeof s == "function" && s(_, t.alternate === null ? "mount" : "update", e.passiveEffectDuration, -0);
          } catch (d) {
            ae(t, t.return, d);
          }
        } else pt(e, t, c, u);
        break;
      case 31:
        pt(e, t, c, u);
        break;
      case 13:
        pt(e, t, c, u);
        break;
      case 23:
        break;
      case 22:
        o = t.stateNode, _ = t.alternate, t.memoizedState !== null ? o._visibility & 2 ? pt(e, t, c, u) : tc(e, t) : o._visibility & 2 ? pt(e, t, c, u) : (o._visibility |= 2, fa(e, t, c, u, (t.subtreeFlags & 10256) !== 0 || false)), l & 2048 && ml(_, t);
        break;
      case 24:
        pt(e, t, c, u), l & 2048 && pl(t.alternate, t);
        break;
      default:
        pt(e, t, c, u);
    }
  }
  function fa(e, t, c, u, l) {
    for (l = l && ((t.subtreeFlags & 10256) !== 0 || false), t = t.child; t !== null; ) {
      var o = e, _ = t, s = c, d = u, v = _.flags;
      switch (_.tag) {
        case 0:
        case 11:
        case 15:
          fa(o, _, s, d, l), Pa(8, _);
          break;
        case 23:
          break;
        case 22:
          var E = _.stateNode;
          _.memoizedState !== null ? E._visibility & 2 ? fa(o, _, s, d, l) : tc(o, _) : (E._visibility |= 2, fa(o, _, s, d, l)), l && v & 2048 && ml(_.alternate, _);
          break;
        case 24:
          fa(o, _, s, d, l), l && v & 2048 && pl(_.alternate, _);
          break;
        default:
          fa(o, _, s, d, l);
      }
      t = t.sibling;
    }
  }
  function tc(e, t) {
    if (t.subtreeFlags & 10256) for (t = t.child; t !== null; ) {
      var c = e, u = t, l = u.flags;
      switch (u.tag) {
        case 22:
          tc(c, u), l & 2048 && ml(u.alternate, u);
          break;
        case 24:
          tc(c, u), l & 2048 && pl(u.alternate, u);
          break;
        default:
          tc(c, u);
      }
      t = t.sibling;
    }
  }
  var nc = 8192;
  function sa(e, t, c) {
    if (e.subtreeFlags & nc) for (e = e.child; e !== null; ) W_(e, t, c), e = e.sibling;
  }
  function W_(e, t, c) {
    switch (e.tag) {
      case 26:
        sa(e, t, c), e.flags & nc && e.memoizedState !== null && dd(c, mt, e.memoizedState, e.memoizedProps);
        break;
      case 5:
        sa(e, t, c);
        break;
      case 3:
      case 4:
        var u = mt;
        mt = hu(e.stateNode.containerInfo), sa(e, t, c), mt = u;
        break;
      case 22:
        e.memoizedState === null && (u = e.alternate, u !== null && u.memoizedState !== null ? (u = nc, nc = 16777216, sa(e, t, c), nc = u) : sa(e, t, c));
        break;
      default:
        sa(e, t, c);
    }
  }
  function k_(e) {
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
        Ae = u, X_(u, e);
      }
      k_(e);
    }
    if (e.subtreeFlags & 10256) for (e = e.child; e !== null; ) Y_(e), e = e.sibling;
  }
  function Y_(e) {
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
        e.memoizedState !== null && t._visibility & 2 && (e.return === null || e.return.tag !== 13) ? (t._visibility &= -3, ru(e)) : ac(e);
        break;
      default:
        ac(e);
    }
  }
  function ru(e) {
    var t = e.deletions;
    if ((e.flags & 16) !== 0) {
      if (t !== null) for (var c = 0; c < t.length; c++) {
        var u = t[c];
        Ae = u, X_(u, e);
      }
      k_(e);
    }
    for (e = e.child; e !== null; ) {
      switch (t = e, t.tag) {
        case 0:
        case 11:
        case 15:
          cn(8, t, t.return), ru(t);
          break;
        case 22:
          c = t.stateNode, c._visibility & 2 && (c._visibility &= -3, ru(t));
          break;
        default:
          ru(t);
      }
      e = e.sibling;
    }
  }
  function X_(e, t) {
    for (; Ae !== null; ) {
      var c = Ae;
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
      if (u = c.child, u !== null) u.return = c, Ae = u;
      else e: for (c = e; Ae !== null; ) {
        u = Ae;
        var l = u.sibling, o = u.return;
        if (N_(u), u === c) {
          Ae = null;
          break e;
        }
        if (l !== null) {
          l.return = o, Ae = l;
          break e;
        }
        Ae = o;
      }
    }
  }
  var Mb = { getCacheForType: function(e) {
    var t = De(ye), c = t.data.get(e);
    return c === void 0 && (c = e(), t.data.set(e, c)), c;
  }, cacheSignal: function() {
    return De(ye).controller.signal;
  } }, Db = typeof WeakMap == "function" ? WeakMap : Map, ee = 0, _e = null, F = null, Z = 0, ne = 0, et = null, un = false, ba = false, wl = false, Wt = 0, me = 0, ln = 0, Bn = 0, Ol = 0, tt = 0, da = 0, cc = null, Xe = null, yl = false, ou = 0, F_ = 0, _u = 1 / 0, fu = null, rn = null, Se = 0, on = null, ga = null, kt = 0, hl = 0, jl = null, Q_ = null, uc = 0, vl = null;
  function nt() {
    return (ee & 2) !== 0 && Z !== 0 ? Z & -Z : A.T !== null ? Ml() : rr();
  }
  function Z_() {
    if (tt === 0) if ((Z & 536870912) === 0 || I) {
      var e = Oc;
      Oc <<= 1, (Oc & 3932160) === 0 && (Oc = 262144), tt = e;
    } else tt = 536870912;
    return e = $e.current, e !== null && (e.flags |= 32), tt;
  }
  function Fe(e, t, c) {
    (e === _e && (ne === 2 || ne === 9) || e.cancelPendingCommit !== null) && (ma(e, 0), _n(e, Z, tt, false)), Ea(e, c), ((ee & 2) === 0 || e !== _e) && (e === _e && ((ee & 2) === 0 && (Bn |= c), me === 4 && _n(e, Z, tt, false)), xt(e));
  }
  function K_(e, t, c) {
    if ((ee & 6) !== 0) throw Error(r(327));
    var u = !c && (t & 127) === 0 && (t & e.expiredLanes) === 0 || xa(e, t), l = u ? Cb(e, t) : xl(e, t, true), o = u;
    do {
      if (l === 0) {
        ba && !u && _n(e, t, 0, false);
        break;
      } else {
        if (c = e.current.alternate, o && !Rb(c)) {
          l = xl(e, t, false), o = false;
          continue;
        }
        if (l === 2) {
          if (o = t, e.errorRecoveryDisabledLanes & o) var _ = 0;
          else _ = e.pendingLanes & -536870913, _ = _ !== 0 ? _ : _ & 536870912 ? 536870912 : 0;
          if (_ !== 0) {
            t = _;
            e: {
              var s = e;
              l = cc;
              var d = s.current.memoizedState.isDehydrated;
              if (d && (ma(s, _).flags |= 256), _ = xl(s, _, false), _ !== 2) {
                if (wl && !d) {
                  s.errorRecoveryDisabledLanes |= o, Bn |= o, l = 4;
                  break e;
                }
                o = Xe, Xe = l, o !== null && (Xe === null ? Xe = o : Xe.push.apply(Xe, o));
              }
              l = _;
            }
            if (o = false, l !== 2) continue;
          }
        }
        if (l === 1) {
          ma(e, 0), _n(e, t, 0, true);
          break;
        }
        e: {
          switch (u = e, o = l, o) {
            case 0:
            case 1:
              throw Error(r(345));
            case 4:
              if ((t & 4194048) !== t) break;
            case 6:
              _n(u, t, tt, !un);
              break e;
            case 2:
              Xe = null;
              break;
            case 3:
            case 5:
              break;
            default:
              throw Error(r(329));
          }
          if ((t & 62914560) === t && (l = ou + 300 - Qe(), 10 < l)) {
            if (_n(u, t, tt, !un), hc(u, 0, true) !== 0) break e;
            kt = t, u.timeoutHandle = Af(J_.bind(null, u, c, Xe, fu, yl, t, tt, Bn, da, un, o, "Throttled", -0, 0), l);
            break e;
          }
          J_(u, c, Xe, fu, yl, t, tt, Bn, da, un, o, null, -0, 0);
        }
      }
      break;
    } while (true);
    xt(e);
  }
  function J_(e, t, c, u, l, o, _, s, d, v, E, M, S, x) {
    if (e.timeoutHandle = -1, M = t.subtreeFlags, M & 8192 || (M & 16785408) === 16785408) {
      M = { stylesheets: null, count: 0, imgCount: 0, imgBytes: 0, suspenseyImages: [], waitingForImages: true, waitingForViewTransition: false, unsuspend: Tt }, W_(t, o, M);
      var N = (o & 62914560) === o ? ou - Qe() : (o & 4194048) === o ? F_ - Qe() : 0;
      if (N = gd(M, N), N !== null) {
        kt = o, e.cancelPendingCommit = N(cf.bind(null, e, t, o, c, u, l, _, s, d, E, M, null, S, x)), _n(e, o, _, !v);
        return;
      }
    }
    cf(e, t, o, c, u, l, _, s, d);
  }
  function Rb(e) {
    for (var t = e; ; ) {
      var c = t.tag;
      if ((c === 0 || c === 11 || c === 15) && t.flags & 16384 && (c = t.updateQueue, c !== null && (c = c.stores, c !== null))) for (var u = 0; u < c.length; u++) {
        var l = c[u], o = l.getSnapshot;
        l = l.value;
        try {
          if (!Je(o(), l)) return false;
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
  function _n(e, t, c, u) {
    t &= ~Ol, t &= ~Bn, e.suspendedLanes |= t, e.pingedLanes &= ~t, u && (e.warmLanes |= t), u = e.expirationTimes;
    for (var l = t; 0 < l; ) {
      var o = 31 - Ke(l), _ = 1 << o;
      u[o] = -1, l &= ~_;
    }
    c !== 0 && ur(e, c, t);
  }
  function su() {
    return (ee & 6) === 0 ? (ic(0), false) : true;
  }
  function Sl() {
    if (F !== null) {
      if (ne === 0) var e = F.return;
      else e = F, zt = Tn = null, Gi(e), ia = null, Wa = 0, e = F;
      for (; e !== null; ) A_(e.alternate, e), e = e.return;
      F = null;
    }
  }
  function ma(e, t) {
    var c = e.timeoutHandle;
    c !== -1 && (e.timeoutHandle = -1, Ib(c)), c = e.cancelPendingCommit, c !== null && (e.cancelPendingCommit = null, c()), kt = 0, Sl(), _e = e, F = c = Dt(e.current, null), Z = t, ne = 0, et = null, un = false, ba = xa(e, t), wl = false, da = tt = Ol = Bn = ln = me = 0, Xe = cc = null, yl = false, (t & 8) !== 0 && (t |= t & 32);
    var u = e.entangledLanes;
    if (u !== 0) for (e = e.entanglements, u &= t; 0 < u; ) {
      var l = 31 - Ke(u), o = 1 << l;
      t |= e[l], u &= ~o;
    }
    return Wt = t, Cc(), c;
  }
  function I_(e, t) {
    k = null, A.H = Ja, t === ua || t === Vc ? (t = so(), ne = 3) : t === Ti ? (t = so(), ne = 4) : ne = t === nl ? 8 : t !== null && typeof t == "object" && typeof t.then == "function" ? 6 : 1, et = t, F === null && (me = 1, tu(e, lt(t, e.current)));
  }
  function $_() {
    var e = $e.current;
    return e === null ? true : (Z & 4194048) === Z ? ft === null : (Z & 62914560) === Z || (Z & 536870912) !== 0 ? e === ft : false;
  }
  function P_() {
    var e = A.H;
    return A.H = Ja, e === null ? Ja : e;
  }
  function ef() {
    var e = A.A;
    return A.A = Mb, e;
  }
  function bu() {
    me = 4, un || (Z & 4194048) !== Z && $e.current !== null || (ba = true), (ln & 134217727) === 0 && (Bn & 134217727) === 0 || _e === null || _n(_e, Z, tt, false);
  }
  function xl(e, t, c) {
    var u = ee;
    ee |= 2;
    var l = P_(), o = ef();
    (_e !== e || Z !== t) && (fu = null, ma(e, t)), t = false;
    var _ = me;
    e: do
      try {
        if (ne !== 0 && F !== null) {
          var s = F, d = et;
          switch (ne) {
            case 8:
              Sl(), _ = 6;
              break e;
            case 3:
            case 2:
            case 9:
            case 6:
              $e.current === null && (t = true);
              var v = ne;
              if (ne = 0, et = null, pa(e, s, d, v), c && ba) {
                _ = 0;
                break e;
              }
              break;
            default:
              v = ne, ne = 0, et = null, pa(e, s, d, v);
          }
        }
        zb(), _ = me;
        break;
      } catch (E) {
        I_(e, E);
      }
    while (true);
    return t && e.shellSuspendCounter++, zt = Tn = null, ee = u, A.H = l, A.A = o, F === null && (_e = null, Z = 0, Cc()), _;
  }
  function zb() {
    for (; F !== null; ) tf(F);
  }
  function Cb(e, t) {
    var c = ee;
    ee |= 2;
    var u = P_(), l = ef();
    _e !== e || Z !== t ? (fu = null, _u = Qe() + 500, ma(e, t)) : ba = xa(e, t);
    e: do
      try {
        if (ne !== 0 && F !== null) {
          t = F;
          var o = et;
          t: switch (ne) {
            case 1:
              ne = 0, et = null, pa(e, t, o, 1);
              break;
            case 2:
            case 9:
              if (_o(o)) {
                ne = 0, et = null, nf(t);
                break;
              }
              t = function() {
                ne !== 2 && ne !== 9 || _e !== e || (ne = 7), xt(e);
              }, o.then(t, t);
              break e;
            case 3:
              ne = 7;
              break e;
            case 4:
              ne = 5;
              break e;
            case 7:
              _o(o) ? (ne = 0, et = null, nf(t)) : (ne = 0, et = null, pa(e, t, o, 7));
              break;
            case 5:
              var _ = null;
              switch (F.tag) {
                case 26:
                  _ = F.memoizedState;
                case 5:
                case 27:
                  var s = F;
                  if (_ ? Wf(_) : s.stateNode.complete) {
                    ne = 0, et = null;
                    var d = s.sibling;
                    if (d !== null) F = d;
                    else {
                      var v = s.return;
                      v !== null ? (F = v, du(v)) : F = null;
                    }
                    break t;
                  }
              }
              ne = 0, et = null, pa(e, t, o, 5);
              break;
            case 6:
              ne = 0, et = null, pa(e, t, o, 6);
              break;
            case 8:
              Sl(), me = 6;
              break e;
            default:
              throw Error(r(462));
          }
        }
        Hb();
        break;
      } catch (E) {
        I_(e, E);
      }
    while (true);
    return zt = Tn = null, A.H = u, A.A = l, ee = c, F !== null ? 0 : (_e = null, Z = 0, Cc(), me);
  }
  function Hb() {
    for (; F !== null && !as(); ) tf(F);
  }
  function tf(e) {
    var t = x_(e.alternate, e, Wt);
    e.memoizedProps = e.pendingProps, t === null ? du(e) : F = t;
  }
  function nf(e) {
    var t = e, c = t.alternate;
    switch (t.tag) {
      case 15:
      case 0:
        t = O_(c, t, t.pendingProps, t.type, void 0, Z);
        break;
      case 11:
        t = O_(c, t, t.pendingProps, t.type.render, t.ref, Z);
        break;
      case 5:
        Gi(t);
      default:
        A_(c, t), t = F = Pr(t, Wt), t = x_(c, t, Wt);
    }
    e.memoizedProps = e.pendingProps, t === null ? du(e) : F = t;
  }
  function pa(e, t, c, u) {
    zt = Tn = null, Gi(t), ia = null, Wa = 0;
    var l = t.return;
    try {
      if (jb(e, l, t, c, Z)) {
        me = 1, tu(e, lt(c, e.current)), F = null;
        return;
      }
    } catch (o) {
      if (l !== null) throw F = l, o;
      me = 1, tu(e, lt(c, e.current)), F = null;
      return;
    }
    t.flags & 32768 ? (I || u === 1 ? e = true : ba || (Z & 536870912) !== 0 ? e = false : (un = e = true, (u === 2 || u === 9 || u === 3 || u === 6) && (u = $e.current, u !== null && u.tag === 13 && (u.flags |= 16384))), af(t, e)) : du(t);
  }
  function du(e) {
    var t = e;
    do {
      if ((t.flags & 32768) !== 0) {
        af(t, un);
        return;
      }
      e = t.return;
      var c = xb(t.alternate, t, Wt);
      if (c !== null) {
        F = c;
        return;
      }
      if (t = t.sibling, t !== null) {
        F = t;
        return;
      }
      F = t = e;
    } while (t !== null);
    me === 0 && (me = 5);
  }
  function af(e, t) {
    do {
      var c = Eb(e.alternate, e);
      if (c !== null) {
        c.flags &= 32767, F = c;
        return;
      }
      if (c = e.return, c !== null && (c.flags |= 32768, c.subtreeFlags = 0, c.deletions = null), !t && (e = e.sibling, e !== null)) {
        F = e;
        return;
      }
      F = e = c;
    } while (e !== null);
    me = 6, F = null;
  }
  function cf(e, t, c, u, l, o, _, s, d) {
    e.cancelPendingCommit = null;
    do
      gu();
    while (Se !== 0);
    if ((ee & 6) !== 0) throw Error(r(327));
    if (t !== null) {
      if (t === e.current) throw Error(r(177));
      if (o = t.lanes | t.childLanes, o |= bi, bs(e, c, o, _, s, d), e === _e && (F = _e = null, Z = 0), ga = t, on = e, kt = c, hl = o, jl = l, Q_ = u, (t.subtreeFlags & 10256) !== 0 || (t.flags & 10256) !== 0 ? (e.callbackNode = null, e.callbackPriority = 0, Lb(pc, function() {
        return _f(), null;
      })) : (e.callbackNode = null, e.callbackPriority = 0), u = (t.flags & 13878) !== 0, (t.subtreeFlags & 13878) !== 0 || u) {
        u = A.T, A.T = null, l = C.p, C.p = 2, _ = ee, ee |= 4;
        try {
          Ab(e, t, c);
        } finally {
          ee = _, C.p = l, A.T = u;
        }
      }
      Se = 1, uf(), lf(), rf();
    }
  }
  function uf() {
    if (Se === 1) {
      Se = 0;
      var e = on, t = ga, c = (t.flags & 13878) !== 0;
      if ((t.subtreeFlags & 13878) !== 0 || c) {
        c = A.T, A.T = null;
        var u = C.p;
        C.p = 2;
        var l = ee;
        ee |= 4;
        try {
          q_(t, e);
          var o = Bl, _ = Yr(e.containerInfo), s = o.focusedElem, d = o.selectionRange;
          if (_ !== s && s && s.ownerDocument && kr(s.ownerDocument.documentElement, s)) {
            if (d !== null && ri(s)) {
              var v = d.start, E = d.end;
              if (E === void 0 && (E = v), "selectionStart" in s) s.selectionStart = v, s.selectionEnd = Math.min(E, s.value.length);
              else {
                var M = s.ownerDocument || document, S = M && M.defaultView || window;
                if (S.getSelection) {
                  var x = S.getSelection(), N = s.textContent.length, G = Math.min(d.start, N), le = d.end === void 0 ? G : Math.min(d.end, N);
                  !x.extend && G > le && (_ = le, le = G, G = _);
                  var O = Wr(s, G), m = Wr(s, le);
                  if (O && m && (x.rangeCount !== 1 || x.anchorNode !== O.node || x.anchorOffset !== O.offset || x.focusNode !== m.node || x.focusOffset !== m.offset)) {
                    var j = M.createRange();
                    j.setStart(O.node, O.offset), x.removeAllRanges(), G > le ? (x.addRange(j), x.extend(m.node, m.offset)) : (j.setEnd(m.node, m.offset), x.addRange(j));
                  }
                }
              }
            }
            for (M = [], x = s; x = x.parentNode; ) x.nodeType === 1 && M.push({ element: x, left: x.scrollLeft, top: x.scrollTop });
            for (typeof s.focus == "function" && s.focus(), s = 0; s < M.length; s++) {
              var T = M[s];
              T.element.scrollLeft = T.left, T.element.scrollTop = T.top;
            }
          }
          Au = !!Ul, Bl = Ul = null;
        } finally {
          ee = l, C.p = u, A.T = c;
        }
      }
      e.current = t, Se = 2;
    }
  }
  function lf() {
    if (Se === 2) {
      Se = 0;
      var e = on, t = ga, c = (t.flags & 8772) !== 0;
      if ((t.subtreeFlags & 8772) !== 0 || c) {
        c = A.T, A.T = null;
        var u = C.p;
        C.p = 2;
        var l = ee;
        ee |= 4;
        try {
          H_(e, t.alternate, t);
        } finally {
          ee = l, C.p = u, A.T = c;
        }
      }
      Se = 3;
    }
  }
  function rf() {
    if (Se === 4 || Se === 3) {
      Se = 0, cs();
      var e = on, t = ga, c = kt, u = Q_;
      (t.subtreeFlags & 10256) !== 0 || (t.flags & 10256) !== 0 ? Se = 5 : (Se = 0, ga = on = null, of(e, e.pendingLanes));
      var l = e.pendingLanes;
      if (l === 0 && (rn = null), ku(c), t = t.stateNode, Ze && typeof Ze.onCommitFiberRoot == "function") try {
        Ze.onCommitFiberRoot(Sa, t, void 0, (t.current.flags & 128) === 128);
      } catch {
      }
      if (u !== null) {
        t = A.T, l = C.p, C.p = 2, A.T = null;
        try {
          for (var o = e.onRecoverableError, _ = 0; _ < u.length; _++) {
            var s = u[_];
            o(s.value, { componentStack: s.stack });
          }
        } finally {
          A.T = t, C.p = l;
        }
      }
      (kt & 3) !== 0 && gu(), xt(e), l = e.pendingLanes, (c & 261930) !== 0 && (l & 42) !== 0 ? e === vl ? uc++ : (uc = 0, vl = e) : uc = 0, ic(0);
    }
  }
  function of(e, t) {
    (e.pooledCacheLanes &= t) === 0 && (t = e.pooledCache, t != null && (e.pooledCache = null, Ga(t)));
  }
  function gu() {
    return uf(), lf(), rf(), _f();
  }
  function _f() {
    if (Se !== 5) return false;
    var e = on, t = hl;
    hl = 0;
    var c = ku(kt), u = A.T, l = C.p;
    try {
      C.p = 32 > c ? 32 : c, A.T = null, c = jl, jl = null;
      var o = on, _ = kt;
      if (Se = 0, ga = on = null, kt = 0, (ee & 6) !== 0) throw Error(r(331));
      var s = ee;
      if (ee |= 4, Y_(o.current), V_(o, o.current, _, c), ee = s, ic(0, false), Ze && typeof Ze.onPostCommitFiberRoot == "function") try {
        Ze.onPostCommitFiberRoot(Sa, o);
      } catch {
      }
      return true;
    } finally {
      C.p = l, A.T = u, of(e, t);
    }
  }
  function ff(e, t, c) {
    t = lt(c, t), t = tl(e.stateNode, t, 2), e = tn(e, t, 2), e !== null && (Ea(e, 2), xt(e));
  }
  function ae(e, t, c) {
    if (e.tag === 3) ff(e, e, c);
    else for (; t !== null; ) {
      if (t.tag === 3) {
        ff(t, e, c);
        break;
      } else if (t.tag === 1) {
        var u = t.stateNode;
        if (typeof t.type.getDerivedStateFromError == "function" || typeof u.componentDidCatch == "function" && (rn === null || !rn.has(u))) {
          e = lt(c, e), c = f_(2), u = tn(t, c, 2), u !== null && (s_(c, u, t, e), Ea(u, 2), xt(u));
          break;
        }
      }
      t = t.return;
    }
  }
  function El(e, t, c) {
    var u = e.pingCache;
    if (u === null) {
      u = e.pingCache = new Db();
      var l = /* @__PURE__ */ new Set();
      u.set(t, l);
    } else l = u.get(t), l === void 0 && (l = /* @__PURE__ */ new Set(), u.set(t, l));
    l.has(c) || (wl = true, l.add(c), e = Nb.bind(null, e, t, c), t.then(e, e));
  }
  function Nb(e, t, c) {
    var u = e.pingCache;
    u !== null && u.delete(t), e.pingedLanes |= e.suspendedLanes & c, e.warmLanes &= ~c, _e === e && (Z & c) === c && (me === 4 || me === 3 && (Z & 62914560) === Z && 300 > Qe() - ou ? (ee & 2) === 0 && ma(e, 0) : Ol |= c, da === Z && (da = 0)), xt(e);
  }
  function sf(e, t) {
    t === 0 && (t = cr()), e = xn(e, t), e !== null && (Ea(e, t), xt(e));
  }
  function Ub(e) {
    var t = e.memoizedState, c = 0;
    t !== null && (c = t.retryLane), sf(e, c);
  }
  function Bb(e, t) {
    var c = 0;
    switch (e.tag) {
      case 31:
      case 13:
        var u = e.stateNode, l = e.memoizedState;
        l !== null && (c = l.retryLane);
        break;
      case 19:
        u = e.stateNode;
        break;
      case 22:
        u = e.stateNode._retryCache;
        break;
      default:
        throw Error(r(314));
    }
    u !== null && u.delete(t), sf(e, c);
  }
  function Lb(e, t) {
    return qu(e, t);
  }
  var mu = null, wa = null, Al = false, pu = false, Tl = false, fn = 0;
  function xt(e) {
    e !== wa && e.next === null && (wa === null ? mu = wa = e : wa = wa.next = e), pu = true, Al || (Al = true, Gb());
  }
  function ic(e, t) {
    if (!Tl && pu) {
      Tl = true;
      do
        for (var c = false, u = mu; u !== null; ) {
          if (e !== 0) {
            var l = u.pendingLanes;
            if (l === 0) var o = 0;
            else {
              var _ = u.suspendedLanes, s = u.pingedLanes;
              o = (1 << 31 - Ke(42 | e) + 1) - 1, o &= l & ~(_ & ~s), o = o & 201326741 ? o & 201326741 | 1 : o ? o | 2 : 0;
            }
            o !== 0 && (c = true, mf(u, o));
          } else o = Z, o = hc(u, u === _e ? o : 0, u.cancelPendingCommit !== null || u.timeoutHandle !== -1), (o & 3) === 0 || xa(u, o) || (c = true, mf(u, o));
          u = u.next;
        }
      while (c);
      Tl = false;
    }
  }
  function qb() {
    bf();
  }
  function bf() {
    pu = Al = false;
    var e = 0;
    fn !== 0 && Jb() && (e = fn);
    for (var t = Qe(), c = null, u = mu; u !== null; ) {
      var l = u.next, o = df(u, t);
      o === 0 ? (u.next = null, c === null ? mu = l : c.next = l, l === null && (wa = c)) : (c = u, (e !== 0 || (o & 3) !== 0) && (pu = true)), u = l;
    }
    Se !== 0 && Se !== 5 || ic(e), fn !== 0 && (fn = 0);
  }
  function df(e, t) {
    for (var c = e.suspendedLanes, u = e.pingedLanes, l = e.expirationTimes, o = e.pendingLanes & -62914561; 0 < o; ) {
      var _ = 31 - Ke(o), s = 1 << _, d = l[_];
      d === -1 ? ((s & c) === 0 || (s & u) !== 0) && (l[_] = ss(s, t)) : d <= t && (e.expiredLanes |= s), o &= ~s;
    }
    if (t = _e, c = Z, c = hc(e, e === t ? c : 0, e.cancelPendingCommit !== null || e.timeoutHandle !== -1), u = e.callbackNode, c === 0 || e === t && (ne === 2 || ne === 9) || e.cancelPendingCommit !== null) return u !== null && u !== null && Gu(u), e.callbackNode = null, e.callbackPriority = 0;
    if ((c & 3) === 0 || xa(e, c)) {
      if (t = c & -c, t === e.callbackPriority) return t;
      switch (u !== null && Gu(u), ku(c)) {
        case 2:
        case 8:
          c = nr;
          break;
        case 32:
          c = pc;
          break;
        case 268435456:
          c = ar;
          break;
        default:
          c = pc;
      }
      return u = gf.bind(null, e), c = qu(c, u), e.callbackPriority = t, e.callbackNode = c, t;
    }
    return u !== null && u !== null && Gu(u), e.callbackPriority = 2, e.callbackNode = null, 2;
  }
  function gf(e, t) {
    if (Se !== 0 && Se !== 5) return e.callbackNode = null, e.callbackPriority = 0, null;
    var c = e.callbackNode;
    if (gu() && e.callbackNode !== c) return null;
    var u = Z;
    return u = hc(e, e === _e ? u : 0, e.cancelPendingCommit !== null || e.timeoutHandle !== -1), u === 0 ? null : (K_(e, u, t), df(e, Qe()), e.callbackNode != null && e.callbackNode === c ? gf.bind(null, e) : null);
  }
  function mf(e, t) {
    if (gu()) return null;
    K_(e, t, true);
  }
  function Gb() {
    $b(function() {
      (ee & 6) !== 0 ? qu(tr, qb) : bf();
    });
  }
  function Ml() {
    if (fn === 0) {
      var e = aa;
      e === 0 && (e = wc, wc <<= 1, (wc & 261888) === 0 && (wc = 256)), fn = e;
    }
    return fn;
  }
  function pf(e) {
    return e == null || typeof e == "symbol" || typeof e == "boolean" ? null : typeof e == "function" ? e : xc("" + e);
  }
  function wf(e, t) {
    var c = t.ownerDocument.createElement("input");
    return c.name = t.name, c.value = t.value, e.id && c.setAttribute("form", e.id), t.parentNode.insertBefore(c, t), e = new FormData(e), c.parentNode.removeChild(c), e;
  }
  function Vb(e, t, c, u, l) {
    if (t === "submit" && c && c.stateNode === l) {
      var o = pf((l[Ge] || null).action), _ = u.submitter;
      _ && (t = (t = _[Ge] || null) ? pf(t.formAction) : _.getAttribute("formAction"), t !== null && (o = t, _ = null));
      var s = new Mc("action", "action", null, u, l);
      e.push({ event: s, listeners: [{ instance: null, listener: function() {
        if (u.defaultPrevented) {
          if (fn !== 0) {
            var d = _ ? wf(l, _) : new FormData(l);
            Ki(c, { pending: true, data: d, method: l.method, action: o }, null, d);
          }
        } else typeof o == "function" && (s.preventDefault(), d = _ ? wf(l, _) : new FormData(l), Ki(c, { pending: true, data: d, method: l.method, action: o }, o, d));
      }, currentTarget: l }] });
    }
  }
  for (var Dl = 0; Dl < si.length; Dl++) {
    var Rl = si[Dl], Wb = Rl.toLowerCase(), kb = Rl[0].toUpperCase() + Rl.slice(1);
    gt(Wb, "on" + kb);
  }
  gt(Qr, "onAnimationEnd"), gt(Zr, "onAnimationIteration"), gt(Kr, "onAnimationStart"), gt("dblclick", "onDoubleClick"), gt("focusin", "onFocus"), gt("focusout", "onBlur"), gt(ub, "onTransitionRun"), gt(ib, "onTransitionStart"), gt(lb, "onTransitionCancel"), gt(Jr, "onTransitionEnd"), kn("onMouseEnter", ["mouseout", "mouseover"]), kn("onMouseLeave", ["mouseout", "mouseover"]), kn("onPointerEnter", ["pointerout", "pointerover"]), kn("onPointerLeave", ["pointerout", "pointerover"]), hn("onChange", "change click focusin focusout input keydown keyup selectionchange".split(" ")), hn("onSelect", "focusout contextmenu dragend focusin keydown keyup mousedown mouseup selectionchange".split(" ")), hn("onBeforeInput", ["compositionend", "keypress", "textInput", "paste"]), hn("onCompositionEnd", "compositionend focusout keydown keypress keyup mousedown".split(" ")), hn("onCompositionStart", "compositionstart focusout keydown keypress keyup mousedown".split(" ")), hn("onCompositionUpdate", "compositionupdate focusout keydown keypress keyup mousedown".split(" "));
  var lc = "abort canplay canplaythrough durationchange emptied encrypted ended error loadeddata loadedmetadata loadstart pause play playing progress ratechange resize seeked seeking stalled suspend timeupdate volumechange waiting".split(" "), Yb = new Set("beforetoggle cancel close invalid load scroll scrollend toggle".split(" ").concat(lc));
  function Of(e, t) {
    t = (t & 4) !== 0;
    for (var c = 0; c < e.length; c++) {
      var u = e[c], l = u.event;
      u = u.listeners;
      e: {
        var o = void 0;
        if (t) for (var _ = u.length - 1; 0 <= _; _--) {
          var s = u[_], d = s.instance, v = s.currentTarget;
          if (s = s.listener, d !== o && l.isPropagationStopped()) break e;
          o = s, l.currentTarget = v;
          try {
            o(l);
          } catch (E) {
            zc(E);
          }
          l.currentTarget = null, o = d;
        }
        else for (_ = 0; _ < u.length; _++) {
          if (s = u[_], d = s.instance, v = s.currentTarget, s = s.listener, d !== o && l.isPropagationStopped()) break e;
          o = s, l.currentTarget = v;
          try {
            o(l);
          } catch (E) {
            zc(E);
          }
          l.currentTarget = null, o = d;
        }
      }
    }
  }
  function Q(e, t) {
    var c = t[Yu];
    c === void 0 && (c = t[Yu] = /* @__PURE__ */ new Set());
    var u = e + "__bubble";
    c.has(u) || (yf(t, e, 2, false), c.add(u));
  }
  function zl(e, t, c) {
    var u = 0;
    t && (u |= 4), yf(c, e, u, t);
  }
  var wu = "_reactListening" + Math.random().toString(36).slice(2);
  function Cl(e) {
    if (!e[wu]) {
      e[wu] = true, fr.forEach(function(c) {
        c !== "selectionchange" && (Yb.has(c) || zl(c, false, e), zl(c, true, e));
      });
      var t = e.nodeType === 9 ? e : e.ownerDocument;
      t === null || t[wu] || (t[wu] = true, zl("selectionchange", false, t));
    }
  }
  function yf(e, t, c, u) {
    switch (Kf(t)) {
      case 2:
        var l = wd;
        break;
      case 8:
        l = Od;
        break;
      default:
        l = Zl;
    }
    c = l.bind(null, t, c, e), l = void 0, !Pu || t !== "touchstart" && t !== "touchmove" && t !== "wheel" || (l = true), u ? l !== void 0 ? e.addEventListener(t, c, { capture: true, passive: l }) : e.addEventListener(t, c, true) : l !== void 0 ? e.addEventListener(t, c, { passive: l }) : e.addEventListener(t, c, false);
  }
  function Hl(e, t, c, u, l) {
    var o = u;
    if ((t & 1) === 0 && (t & 2) === 0 && u !== null) e: for (; ; ) {
      if (u === null) return;
      var _ = u.tag;
      if (_ === 3 || _ === 4) {
        var s = u.stateNode.containerInfo;
        if (s === l) break;
        if (_ === 4) for (_ = u.return; _ !== null; ) {
          var d = _.tag;
          if ((d === 3 || d === 4) && _.stateNode.containerInfo === l) return;
          _ = _.return;
        }
        for (; s !== null; ) {
          if (_ = Gn(s), _ === null) return;
          if (d = _.tag, d === 5 || d === 6 || d === 26 || d === 27) {
            u = o = _;
            continue e;
          }
          s = s.parentNode;
        }
      }
      u = u.return;
    }
    vr(function() {
      var v = o, E = Iu(c), M = [];
      e: {
        var S = Ir.get(e);
        if (S !== void 0) {
          var x = Mc, N = e;
          switch (e) {
            case "keypress":
              if (Ac(c) === 0) break e;
            case "keydown":
            case "keyup":
              x = Bs;
              break;
            case "focusin":
              N = "focus", x = ai;
              break;
            case "focusout":
              N = "blur", x = ai;
              break;
            case "beforeblur":
            case "afterblur":
              x = ai;
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
              x = Er;
              break;
            case "drag":
            case "dragend":
            case "dragenter":
            case "dragexit":
            case "dragleave":
            case "dragover":
            case "dragstart":
            case "drop":
              x = xs;
              break;
            case "touchcancel":
            case "touchend":
            case "touchmove":
            case "touchstart":
              x = Gs;
              break;
            case Qr:
            case Zr:
            case Kr:
              x = Ts;
              break;
            case Jr:
              x = Ws;
              break;
            case "scroll":
            case "scrollend":
              x = vs;
              break;
            case "wheel":
              x = Ys;
              break;
            case "copy":
            case "cut":
            case "paste":
              x = Ds;
              break;
            case "gotpointercapture":
            case "lostpointercapture":
            case "pointercancel":
            case "pointerdown":
            case "pointermove":
            case "pointerout":
            case "pointerover":
            case "pointerup":
              x = Tr;
              break;
            case "toggle":
            case "beforetoggle":
              x = Fs;
          }
          var G = (t & 4) !== 0, le = !G && (e === "scroll" || e === "scrollend"), O = G ? S !== null ? S + "Capture" : null : S;
          G = [];
          for (var m = v, j; m !== null; ) {
            var T = m;
            if (j = T.stateNode, T = T.tag, T !== 5 && T !== 26 && T !== 27 || j === null || O === null || (T = Ma(m, O), T != null && G.push(rc(m, T, j))), le) break;
            m = m.return;
          }
          0 < G.length && (S = new x(S, N, null, c, E), M.push({ event: S, listeners: G }));
        }
      }
      if ((t & 7) === 0) {
        e: {
          if (S = e === "mouseover" || e === "pointerover", x = e === "mouseout" || e === "pointerout", S && c !== Ju && (N = c.relatedTarget || c.fromElement) && (Gn(N) || N[qn])) break e;
          if ((x || S) && (S = E.window === E ? E : (S = E.ownerDocument) ? S.defaultView || S.parentWindow : window, x ? (N = c.relatedTarget || c.toElement, x = v, N = N ? Gn(N) : null, N !== null && (le = b(N), G = N.tag, N !== le || G !== 5 && G !== 27 && G !== 6) && (N = null)) : (x = null, N = v), x !== N)) {
            if (G = Er, T = "onMouseLeave", O = "onMouseEnter", m = "mouse", (e === "pointerout" || e === "pointerover") && (G = Tr, T = "onPointerLeave", O = "onPointerEnter", m = "pointer"), le = x == null ? S : Ta(x), j = N == null ? S : Ta(N), S = new G(T, m + "leave", x, c, E), S.target = le, S.relatedTarget = j, T = null, Gn(E) === v && (G = new G(O, m + "enter", N, c, E), G.target = j, G.relatedTarget = le, T = G), le = T, x && N) t: {
              for (G = Xb, O = x, m = N, j = 0, T = O; T; T = G(T)) j++;
              T = 0;
              for (var q = m; q; q = G(q)) T++;
              for (; 0 < j - T; ) O = G(O), j--;
              for (; 0 < T - j; ) m = G(m), T--;
              for (; j--; ) {
                if (O === m || m !== null && O === m.alternate) {
                  G = O;
                  break t;
                }
                O = G(O), m = G(m);
              }
              G = null;
            }
            else G = null;
            x !== null && hf(M, S, x, G, false), N !== null && le !== null && hf(M, le, N, G, true);
          }
        }
        e: {
          if (S = v ? Ta(v) : window, x = S.nodeName && S.nodeName.toLowerCase(), x === "select" || x === "input" && S.type === "file") var $ = Ur;
          else if (Hr(S)) if (Br) $ = nb;
          else {
            $ = eb;
            var L = Ps;
          }
          else x = S.nodeName, !x || x.toLowerCase() !== "input" || S.type !== "checkbox" && S.type !== "radio" ? v && Ku(v.elementType) && ($ = Ur) : $ = tb;
          if ($ && ($ = $(e, v))) {
            Nr(M, $, c, E);
            break e;
          }
          L && L(e, S, v), e === "focusout" && v && S.type === "number" && v.memoizedProps.value != null && Zu(S, "number", S.value);
        }
        switch (L = v ? Ta(v) : window, e) {
          case "focusin":
            (Hr(L) || L.contentEditable === "true") && (Kn = L, oi = v, Ba = null);
            break;
          case "focusout":
            Ba = oi = Kn = null;
            break;
          case "mousedown":
            _i = true;
            break;
          case "contextmenu":
          case "mouseup":
          case "dragend":
            _i = false, Xr(M, c, E);
            break;
          case "selectionchange":
            if (cb) break;
          case "keydown":
          case "keyup":
            Xr(M, c, E);
        }
        var Y;
        if (ui) e: {
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
        else Zn ? zr(e, c) && (K = "onCompositionEnd") : e === "keydown" && c.keyCode === 229 && (K = "onCompositionStart");
        K && (Mr && c.locale !== "ko" && (Zn || K !== "onCompositionStart" ? K === "onCompositionEnd" && Zn && (Y = Sr()) : (Zt = E, ei = "value" in Zt ? Zt.value : Zt.textContent, Zn = true)), L = Ou(v, K), 0 < L.length && (K = new Ar(K, e, null, c, E), M.push({ event: K, listeners: L }), Y ? K.data = Y : (Y = Cr(c), Y !== null && (K.data = Y)))), (Y = Zs ? Ks(e, c) : Js(e, c)) && (K = Ou(v, "onBeforeInput"), 0 < K.length && (L = new Ar("onBeforeInput", "beforeinput", null, c, E), M.push({ event: L, listeners: K }), L.data = Y)), Vb(M, e, v, c, E);
      }
      Of(M, t);
    });
  }
  function rc(e, t, c) {
    return { instance: e, listener: t, currentTarget: c };
  }
  function Ou(e, t) {
    for (var c = t + "Capture", u = []; e !== null; ) {
      var l = e, o = l.stateNode;
      if (l = l.tag, l !== 5 && l !== 26 && l !== 27 || o === null || (l = Ma(e, c), l != null && u.unshift(rc(e, l, o)), l = Ma(e, t), l != null && u.push(rc(e, l, o))), e.tag === 3) return u;
      e = e.return;
    }
    return [];
  }
  function Xb(e) {
    if (e === null) return null;
    do
      e = e.return;
    while (e && e.tag !== 5 && e.tag !== 27);
    return e || null;
  }
  function hf(e, t, c, u, l) {
    for (var o = t._reactName, _ = []; c !== null && c !== u; ) {
      var s = c, d = s.alternate, v = s.stateNode;
      if (s = s.tag, d !== null && d === u) break;
      s !== 5 && s !== 26 && s !== 27 || v === null || (d = v, l ? (v = Ma(c, o), v != null && _.unshift(rc(c, v, d))) : l || (v = Ma(c, o), v != null && _.push(rc(c, v, d)))), c = c.return;
    }
    _.length !== 0 && e.push({ event: t, listeners: _ });
  }
  var Fb = /\r\n?/g, Qb = /\u0000|\uFFFD/g;
  function jf(e) {
    return (typeof e == "string" ? e : "" + e).replace(Fb, `
`).replace(Qb, "");
  }
  function vf(e, t) {
    return t = jf(t), jf(e) === t;
  }
  function ie(e, t, c, u, l, o) {
    switch (c) {
      case "children":
        typeof u == "string" ? t === "body" || t === "textarea" && u === "" || Xn(e, u) : (typeof u == "number" || typeof u == "bigint") && t !== "body" && Xn(e, "" + u);
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
        hr(e, u, o);
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
        } else typeof o == "function" && (c === "formAction" ? (t !== "input" && ie(e, t, "name", l.name, l, null), ie(e, t, "formEncType", l.formEncType, l, null), ie(e, t, "formMethod", l.formMethod, l, null), ie(e, t, "formTarget", l.formTarget, l, null)) : (ie(e, t, "encType", l.encType, l, null), ie(e, t, "method", l.method, l, null), ie(e, t, "target", l.target, l, null)));
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
        u != null && Q("scroll", e);
        break;
      case "onScrollEnd":
        u != null && Q("scrollend", e);
        break;
      case "dangerouslySetInnerHTML":
        if (u != null) {
          if (typeof u != "object" || !("__html" in u)) throw Error(r(61));
          if (c = u.__html, c != null) {
            if (l.children != null) throw Error(r(60));
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
        Q("beforetoggle", e), Q("toggle", e), jc(e, "popover", u);
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
        jc(e, "is", u);
        break;
      case "innerText":
      case "textContent":
        break;
      default:
        (!(2 < c.length) || c[0] !== "o" && c[0] !== "O" || c[1] !== "n" && c[1] !== "N") && (c = hs.get(c) || c, jc(e, c, u));
    }
  }
  function Nl(e, t, c, u, l, o) {
    switch (c) {
      case "style":
        hr(e, u, o);
        break;
      case "dangerouslySetInnerHTML":
        if (u != null) {
          if (typeof u != "object" || !("__html" in u)) throw Error(r(61));
          if (c = u.__html, c != null) {
            if (l.children != null) throw Error(r(60));
            e.innerHTML = c;
          }
        }
        break;
      case "children":
        typeof u == "string" ? Xn(e, u) : (typeof u == "number" || typeof u == "bigint") && Xn(e, "" + u);
        break;
      case "onScroll":
        u != null && Q("scroll", e);
        break;
      case "onScrollEnd":
        u != null && Q("scrollend", e);
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
        if (!sr.hasOwnProperty(c)) e: {
          if (c[0] === "o" && c[1] === "n" && (l = c.endsWith("Capture"), t = c.slice(2, l ? c.length - 7 : void 0), o = e[Ge] || null, o = o != null ? o[c] : null, typeof o == "function" && e.removeEventListener(t, o, l), typeof u == "function")) {
            typeof o != "function" && o !== null && (c in e ? e[c] = null : e.hasAttribute(c) && e.removeAttribute(c)), e.addEventListener(t, u, l);
            break e;
          }
          c in e ? e[c] = u : u === true ? e.setAttribute(c, "") : jc(e, c, u);
        }
    }
  }
  function ze(e, t, c) {
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
        Q("error", e), Q("load", e);
        var u = false, l = false, o;
        for (o in c) if (c.hasOwnProperty(o)) {
          var _ = c[o];
          if (_ != null) switch (o) {
            case "src":
              u = true;
              break;
            case "srcSet":
              l = true;
              break;
            case "children":
            case "dangerouslySetInnerHTML":
              throw Error(r(137, t));
            default:
              ie(e, t, o, _, c, null);
          }
        }
        l && ie(e, t, "srcSet", c.srcSet, c, null), u && ie(e, t, "src", c.src, c, null);
        return;
      case "input":
        Q("invalid", e);
        var s = o = _ = l = null, d = null, v = null;
        for (u in c) if (c.hasOwnProperty(u)) {
          var E = c[u];
          if (E != null) switch (u) {
            case "name":
              l = E;
              break;
            case "type":
              _ = E;
              break;
            case "checked":
              d = E;
              break;
            case "defaultChecked":
              v = E;
              break;
            case "value":
              o = E;
              break;
            case "defaultValue":
              s = E;
              break;
            case "children":
            case "dangerouslySetInnerHTML":
              if (E != null) throw Error(r(137, t));
              break;
            default:
              ie(e, t, u, E, c, null);
          }
        }
        pr(e, o, s, d, v, _, l, false);
        return;
      case "select":
        Q("invalid", e), u = _ = o = null;
        for (l in c) if (c.hasOwnProperty(l) && (s = c[l], s != null)) switch (l) {
          case "value":
            o = s;
            break;
          case "defaultValue":
            _ = s;
            break;
          case "multiple":
            u = s;
          default:
            ie(e, t, l, s, c, null);
        }
        t = o, c = _, e.multiple = !!u, t != null ? Yn(e, !!u, t, false) : c != null && Yn(e, !!u, c, true);
        return;
      case "textarea":
        Q("invalid", e), o = l = u = null;
        for (_ in c) if (c.hasOwnProperty(_) && (s = c[_], s != null)) switch (_) {
          case "value":
            u = s;
            break;
          case "defaultValue":
            l = s;
            break;
          case "children":
            o = s;
            break;
          case "dangerouslySetInnerHTML":
            if (s != null) throw Error(r(91));
            break;
          default:
            ie(e, t, _, s, c, null);
        }
        Or(e, u, l, o);
        return;
      case "option":
        for (d in c) if (c.hasOwnProperty(d) && (u = c[d], u != null)) switch (d) {
          case "selected":
            e.selected = u && typeof u != "function" && typeof u != "symbol";
            break;
          default:
            ie(e, t, d, u, c, null);
        }
        return;
      case "dialog":
        Q("beforetoggle", e), Q("toggle", e), Q("cancel", e), Q("close", e);
        break;
      case "iframe":
      case "object":
        Q("load", e);
        break;
      case "video":
      case "audio":
        for (u = 0; u < lc.length; u++) Q(lc[u], e);
        break;
      case "image":
        Q("error", e), Q("load", e);
        break;
      case "details":
        Q("toggle", e);
        break;
      case "embed":
      case "source":
      case "link":
        Q("error", e), Q("load", e);
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
        for (v in c) if (c.hasOwnProperty(v) && (u = c[v], u != null)) switch (v) {
          case "children":
          case "dangerouslySetInnerHTML":
            throw Error(r(137, t));
          default:
            ie(e, t, v, u, c, null);
        }
        return;
      default:
        if (Ku(t)) {
          for (E in c) c.hasOwnProperty(E) && (u = c[E], u !== void 0 && Nl(e, t, E, u, c, void 0));
          return;
        }
    }
    for (s in c) c.hasOwnProperty(s) && (u = c[s], u != null && ie(e, t, s, u, c, null));
  }
  function Zb(e, t, c, u) {
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
        var l = null, o = null, _ = null, s = null, d = null, v = null, E = null;
        for (x in c) {
          var M = c[x];
          if (c.hasOwnProperty(x) && M != null) switch (x) {
            case "checked":
              break;
            case "value":
              break;
            case "defaultValue":
              d = M;
            default:
              u.hasOwnProperty(x) || ie(e, t, x, null, u, M);
          }
        }
        for (var S in u) {
          var x = u[S];
          if (M = c[S], u.hasOwnProperty(S) && (x != null || M != null)) switch (S) {
            case "type":
              o = x;
              break;
            case "name":
              l = x;
              break;
            case "checked":
              v = x;
              break;
            case "defaultChecked":
              E = x;
              break;
            case "value":
              _ = x;
              break;
            case "defaultValue":
              s = x;
              break;
            case "children":
            case "dangerouslySetInnerHTML":
              if (x != null) throw Error(r(137, t));
              break;
            default:
              x !== M && ie(e, t, S, x, u, M);
          }
        }
        Qu(e, _, s, d, v, E, o, l);
        return;
      case "select":
        x = _ = s = S = null;
        for (o in c) if (d = c[o], c.hasOwnProperty(o) && d != null) switch (o) {
          case "value":
            break;
          case "multiple":
            x = d;
          default:
            u.hasOwnProperty(o) || ie(e, t, o, null, u, d);
        }
        for (l in u) if (o = u[l], d = c[l], u.hasOwnProperty(l) && (o != null || d != null)) switch (l) {
          case "value":
            S = o;
            break;
          case "defaultValue":
            s = o;
            break;
          case "multiple":
            _ = o;
          default:
            o !== d && ie(e, t, l, o, u, d);
        }
        t = s, c = _, u = x, S != null ? Yn(e, !!c, S, false) : !!u != !!c && (t != null ? Yn(e, !!c, t, true) : Yn(e, !!c, c ? [] : "", false));
        return;
      case "textarea":
        x = S = null;
        for (s in c) if (l = c[s], c.hasOwnProperty(s) && l != null && !u.hasOwnProperty(s)) switch (s) {
          case "value":
            break;
          case "children":
            break;
          default:
            ie(e, t, s, null, u, l);
        }
        for (_ in u) if (l = u[_], o = c[_], u.hasOwnProperty(_) && (l != null || o != null)) switch (_) {
          case "value":
            S = l;
            break;
          case "defaultValue":
            x = l;
            break;
          case "children":
            break;
          case "dangerouslySetInnerHTML":
            if (l != null) throw Error(r(91));
            break;
          default:
            l !== o && ie(e, t, _, l, u, o);
        }
        wr(e, S, x);
        return;
      case "option":
        for (var N in c) if (S = c[N], c.hasOwnProperty(N) && S != null && !u.hasOwnProperty(N)) switch (N) {
          case "selected":
            e.selected = false;
            break;
          default:
            ie(e, t, N, null, u, S);
        }
        for (d in u) if (S = u[d], x = c[d], u.hasOwnProperty(d) && S !== x && (S != null || x != null)) switch (d) {
          case "selected":
            e.selected = S && typeof S != "function" && typeof S != "symbol";
            break;
          default:
            ie(e, t, d, S, u, x);
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
        for (var G in c) S = c[G], c.hasOwnProperty(G) && S != null && !u.hasOwnProperty(G) && ie(e, t, G, null, u, S);
        for (v in u) if (S = u[v], x = c[v], u.hasOwnProperty(v) && S !== x && (S != null || x != null)) switch (v) {
          case "children":
          case "dangerouslySetInnerHTML":
            if (S != null) throw Error(r(137, t));
            break;
          default:
            ie(e, t, v, S, u, x);
        }
        return;
      default:
        if (Ku(t)) {
          for (var le in c) S = c[le], c.hasOwnProperty(le) && S !== void 0 && !u.hasOwnProperty(le) && Nl(e, t, le, void 0, u, S);
          for (E in u) S = u[E], x = c[E], !u.hasOwnProperty(E) || S === x || S === void 0 && x === void 0 || Nl(e, t, E, S, u, x);
          return;
        }
    }
    for (var O in c) S = c[O], c.hasOwnProperty(O) && S != null && !u.hasOwnProperty(O) && ie(e, t, O, null, u, S);
    for (M in u) S = u[M], x = c[M], !u.hasOwnProperty(M) || S === x || S == null && x == null || ie(e, t, M, S, u, x);
  }
  function Sf(e) {
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
  function Kb() {
    if (typeof performance.getEntriesByType == "function") {
      for (var e = 0, t = 0, c = performance.getEntriesByType("resource"), u = 0; u < c.length; u++) {
        var l = c[u], o = l.transferSize, _ = l.initiatorType, s = l.duration;
        if (o && s && Sf(_)) {
          for (_ = 0, s = l.responseEnd, u += 1; u < c.length; u++) {
            var d = c[u], v = d.startTime;
            if (v > s) break;
            var E = d.transferSize, M = d.initiatorType;
            E && Sf(M) && (d = d.responseEnd, _ += E * (d < s ? 1 : (s - v) / (d - v)));
          }
          if (--u, t += 8 * (o + _) / (l.duration / 1e3), e++, 10 < e) break;
        }
      }
      if (0 < e) return t / e / 1e6;
    }
    return navigator.connection && (e = navigator.connection.downlink, typeof e == "number") ? e : 5;
  }
  var Ul = null, Bl = null;
  function yu(e) {
    return e.nodeType === 9 ? e : e.ownerDocument;
  }
  function xf(e) {
    switch (e) {
      case "http://www.w3.org/2000/svg":
        return 1;
      case "http://www.w3.org/1998/Math/MathML":
        return 2;
      default:
        return 0;
    }
  }
  function Ef(e, t) {
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
  function Ll(e, t) {
    return e === "textarea" || e === "noscript" || typeof t.children == "string" || typeof t.children == "number" || typeof t.children == "bigint" || typeof t.dangerouslySetInnerHTML == "object" && t.dangerouslySetInnerHTML !== null && t.dangerouslySetInnerHTML.__html != null;
  }
  var ql = null;
  function Jb() {
    var e = window.event;
    return e && e.type === "popstate" ? e === ql ? false : (ql = e, true) : (ql = null, false);
  }
  var Af = typeof setTimeout == "function" ? setTimeout : void 0, Ib = typeof clearTimeout == "function" ? clearTimeout : void 0, Tf = typeof Promise == "function" ? Promise : void 0, $b = typeof queueMicrotask == "function" ? queueMicrotask : typeof Tf < "u" ? function(e) {
    return Tf.resolve(null).then(e).catch(Pb);
  } : Af;
  function Pb(e) {
    setTimeout(function() {
      throw e;
    });
  }
  function sn(e) {
    return e === "head";
  }
  function Mf(e, t) {
    var c = t, u = 0;
    do {
      var l = c.nextSibling;
      if (e.removeChild(c), l && l.nodeType === 8) if (c = l.data, c === "/$" || c === "/&") {
        if (u === 0) {
          e.removeChild(l), ja(t);
          return;
        }
        u--;
      } else if (c === "$" || c === "$?" || c === "$~" || c === "$!" || c === "&") u++;
      else if (c === "html") oc(e.ownerDocument.documentElement);
      else if (c === "head") {
        c = e.ownerDocument.head, oc(c);
        for (var o = c.firstChild; o; ) {
          var _ = o.nextSibling, s = o.nodeName;
          o[Aa] || s === "SCRIPT" || s === "STYLE" || s === "LINK" && o.rel.toLowerCase() === "stylesheet" || c.removeChild(o), o = _;
        }
      } else c === "body" && oc(e.ownerDocument.body);
      c = l;
    } while (c);
    ja(t);
  }
  function Df(e, t) {
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
  function Gl(e) {
    var t = e.firstChild;
    for (t && t.nodeType === 10 && (t = t.nextSibling); t; ) {
      var c = t;
      switch (t = t.nextSibling, c.nodeName) {
        case "HTML":
        case "HEAD":
        case "BODY":
          Gl(c), Xu(c);
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
  function ed(e, t, c, u) {
    for (; e.nodeType === 1; ) {
      var l = c;
      if (e.nodeName.toLowerCase() !== t.toLowerCase()) {
        if (!u && (e.nodeName !== "INPUT" || e.type !== "hidden")) break;
      } else if (u) {
        if (!e[Aa]) switch (t) {
          case "meta":
            if (!e.hasAttribute("itemprop")) break;
            return e;
          case "link":
            if (o = e.getAttribute("rel"), o === "stylesheet" && e.hasAttribute("data-precedence")) break;
            if (o !== l.rel || e.getAttribute("href") !== (l.href == null || l.href === "" ? null : l.href) || e.getAttribute("crossorigin") !== (l.crossOrigin == null ? null : l.crossOrigin) || e.getAttribute("title") !== (l.title == null ? null : l.title)) break;
            return e;
          case "style":
            if (e.hasAttribute("data-precedence")) break;
            return e;
          case "script":
            if (o = e.getAttribute("src"), (o !== (l.src == null ? null : l.src) || e.getAttribute("type") !== (l.type == null ? null : l.type) || e.getAttribute("crossorigin") !== (l.crossOrigin == null ? null : l.crossOrigin)) && o && e.hasAttribute("async") && !e.hasAttribute("itemprop")) break;
            return e;
          default:
            return e;
        }
      } else if (t === "input" && e.type === "hidden") {
        var o = l.name == null ? null : "" + l.name;
        if (l.type === "hidden" && e.getAttribute("name") === o) return e;
      } else return e;
      if (e = st(e.nextSibling), e === null) break;
    }
    return null;
  }
  function td(e, t, c) {
    if (t === "") return null;
    for (; e.nodeType !== 3; ) if ((e.nodeType !== 1 || e.nodeName !== "INPUT" || e.type !== "hidden") && !c || (e = st(e.nextSibling), e === null)) return null;
    return e;
  }
  function Rf(e, t) {
    for (; e.nodeType !== 8; ) if ((e.nodeType !== 1 || e.nodeName !== "INPUT" || e.type !== "hidden") && !t || (e = st(e.nextSibling), e === null)) return null;
    return e;
  }
  function Vl(e) {
    return e.data === "$?" || e.data === "$~";
  }
  function Wl(e) {
    return e.data === "$!" || e.data === "$?" && e.ownerDocument.readyState !== "loading";
  }
  function nd(e, t) {
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
  function st(e) {
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
  var kl = null;
  function zf(e) {
    e = e.nextSibling;
    for (var t = 0; e; ) {
      if (e.nodeType === 8) {
        var c = e.data;
        if (c === "/$" || c === "/&") {
          if (t === 0) return st(e.nextSibling);
          t--;
        } else c !== "$" && c !== "$!" && c !== "$?" && c !== "$~" && c !== "&" || t++;
      }
      e = e.nextSibling;
    }
    return null;
  }
  function Cf(e) {
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
  function Hf(e, t, c) {
    switch (t = yu(c), e) {
      case "html":
        if (e = t.documentElement, !e) throw Error(r(452));
        return e;
      case "head":
        if (e = t.head, !e) throw Error(r(453));
        return e;
      case "body":
        if (e = t.body, !e) throw Error(r(454));
        return e;
      default:
        throw Error(r(451));
    }
  }
  function oc(e) {
    for (var t = e.attributes; t.length; ) e.removeAttributeNode(t[0]);
    Xu(e);
  }
  var bt = /* @__PURE__ */ new Map(), Nf = /* @__PURE__ */ new Set();
  function hu(e) {
    return typeof e.getRootNode == "function" ? e.getRootNode() : e.nodeType === 9 ? e : e.ownerDocument;
  }
  var Yt = C.d;
  C.d = { f: ad, r: cd, D: ud, C: id, L: ld, m: rd, X: _d, S: od, M: fd };
  function ad() {
    var e = Yt.f(), t = su();
    return e || t;
  }
  function cd(e) {
    var t = Vn(e);
    t !== null && t.tag === 5 && t.type === "form" ? Io(t) : Yt.r(e);
  }
  var Oa = typeof document > "u" ? null : document;
  function Uf(e, t, c) {
    var u = Oa;
    if (u && typeof t == "string" && t) {
      var l = ut(t);
      l = 'link[rel="' + e + '"][href="' + l + '"]', typeof c == "string" && (l += '[crossorigin="' + c + '"]'), Nf.has(l) || (Nf.add(l), e = { rel: e, crossOrigin: c, href: t }, u.querySelector(l) === null && (t = u.createElement("link"), ze(t, "link", e), Ee(t), u.head.appendChild(t)));
    }
  }
  function ud(e) {
    Yt.D(e), Uf("dns-prefetch", e, null);
  }
  function id(e, t) {
    Yt.C(e, t), Uf("preconnect", e, t);
  }
  function ld(e, t, c) {
    Yt.L(e, t, c);
    var u = Oa;
    if (u && e && t) {
      var l = 'link[rel="preload"][as="' + ut(t) + '"]';
      t === "image" && c && c.imageSrcSet ? (l += '[imagesrcset="' + ut(c.imageSrcSet) + '"]', typeof c.imageSizes == "string" && (l += '[imagesizes="' + ut(c.imageSizes) + '"]')) : l += '[href="' + ut(e) + '"]';
      var o = l;
      switch (t) {
        case "style":
          o = ya(e);
          break;
        case "script":
          o = ha(e);
      }
      bt.has(o) || (e = R({ rel: "preload", href: t === "image" && c && c.imageSrcSet ? void 0 : e, as: t }, c), bt.set(o, e), u.querySelector(l) !== null || t === "style" && u.querySelector(_c(o)) || t === "script" && u.querySelector(fc(o)) || (t = u.createElement("link"), ze(t, "link", e), Ee(t), u.head.appendChild(t)));
    }
  }
  function rd(e, t) {
    Yt.m(e, t);
    var c = Oa;
    if (c && e) {
      var u = t && typeof t.as == "string" ? t.as : "script", l = 'link[rel="modulepreload"][as="' + ut(u) + '"][href="' + ut(e) + '"]', o = l;
      switch (u) {
        case "audioworklet":
        case "paintworklet":
        case "serviceworker":
        case "sharedworker":
        case "worker":
        case "script":
          o = ha(e);
      }
      if (!bt.has(o) && (e = R({ rel: "modulepreload", href: e }, t), bt.set(o, e), c.querySelector(l) === null)) {
        switch (u) {
          case "audioworklet":
          case "paintworklet":
          case "serviceworker":
          case "sharedworker":
          case "worker":
          case "script":
            if (c.querySelector(fc(o))) return;
        }
        u = c.createElement("link"), ze(u, "link", e), Ee(u), c.head.appendChild(u);
      }
    }
  }
  function od(e, t, c) {
    Yt.S(e, t, c);
    var u = Oa;
    if (u && e) {
      var l = Wn(u).hoistableStyles, o = ya(e);
      t = t || "default";
      var _ = l.get(o);
      if (!_) {
        var s = { loading: 0, preload: null };
        if (_ = u.querySelector(_c(o))) s.loading = 5;
        else {
          e = R({ rel: "stylesheet", href: e, "data-precedence": t }, c), (c = bt.get(o)) && Yl(e, c);
          var d = _ = u.createElement("link");
          Ee(d), ze(d, "link", e), d._p = new Promise(function(v, E) {
            d.onload = v, d.onerror = E;
          }), d.addEventListener("load", function() {
            s.loading |= 1;
          }), d.addEventListener("error", function() {
            s.loading |= 2;
          }), s.loading |= 4, ju(_, t, u);
        }
        _ = { type: "stylesheet", instance: _, count: 1, state: s }, l.set(o, _);
      }
    }
  }
  function _d(e, t) {
    Yt.X(e, t);
    var c = Oa;
    if (c && e) {
      var u = Wn(c).hoistableScripts, l = ha(e), o = u.get(l);
      o || (o = c.querySelector(fc(l)), o || (e = R({ src: e, async: true }, t), (t = bt.get(l)) && Xl(e, t), o = c.createElement("script"), Ee(o), ze(o, "link", e), c.head.appendChild(o)), o = { type: "script", instance: o, count: 1, state: null }, u.set(l, o));
    }
  }
  function fd(e, t) {
    Yt.M(e, t);
    var c = Oa;
    if (c && e) {
      var u = Wn(c).hoistableScripts, l = ha(e), o = u.get(l);
      o || (o = c.querySelector(fc(l)), o || (e = R({ src: e, async: true, type: "module" }, t), (t = bt.get(l)) && Xl(e, t), o = c.createElement("script"), Ee(o), ze(o, "link", e), c.head.appendChild(o)), o = { type: "script", instance: o, count: 1, state: null }, u.set(l, o));
    }
  }
  function Bf(e, t, c, u) {
    var l = (l = X.current) ? hu(l) : null;
    if (!l) throw Error(r(446));
    switch (e) {
      case "meta":
      case "title":
        return null;
      case "style":
        return typeof c.precedence == "string" && typeof c.href == "string" ? (t = ya(c.href), c = Wn(l).hoistableStyles, u = c.get(t), u || (u = { type: "style", instance: null, count: 0, state: null }, c.set(t, u)), u) : { type: "void", instance: null, count: 0, state: null };
      case "link":
        if (c.rel === "stylesheet" && typeof c.href == "string" && typeof c.precedence == "string") {
          e = ya(c.href);
          var o = Wn(l).hoistableStyles, _ = o.get(e);
          if (_ || (l = l.ownerDocument || l, _ = { type: "stylesheet", instance: null, count: 0, state: { loading: 0, preload: null } }, o.set(e, _), (o = l.querySelector(_c(e))) && !o._p && (_.instance = o, _.state.loading = 5), bt.has(e) || (c = { rel: "preload", as: "style", href: c.href, crossOrigin: c.crossOrigin, integrity: c.integrity, media: c.media, hrefLang: c.hrefLang, referrerPolicy: c.referrerPolicy }, bt.set(e, c), o || sd(l, e, c, _.state))), t && u === null) throw Error(r(528, ""));
          return _;
        }
        if (t && u !== null) throw Error(r(529, ""));
        return null;
      case "script":
        return t = c.async, c = c.src, typeof c == "string" && t && typeof t != "function" && typeof t != "symbol" ? (t = ha(c), c = Wn(l).hoistableScripts, u = c.get(t), u || (u = { type: "script", instance: null, count: 0, state: null }, c.set(t, u)), u) : { type: "void", instance: null, count: 0, state: null };
      default:
        throw Error(r(444, e));
    }
  }
  function ya(e) {
    return 'href="' + ut(e) + '"';
  }
  function _c(e) {
    return 'link[rel="stylesheet"][' + e + "]";
  }
  function Lf(e) {
    return R({}, e, { "data-precedence": e.precedence, precedence: null });
  }
  function sd(e, t, c, u) {
    e.querySelector('link[rel="preload"][as="style"][' + t + "]") ? u.loading = 1 : (t = e.createElement("link"), u.preload = t, t.addEventListener("load", function() {
      return u.loading |= 1;
    }), t.addEventListener("error", function() {
      return u.loading |= 2;
    }), ze(t, "link", c), Ee(t), e.head.appendChild(t));
  }
  function ha(e) {
    return '[src="' + ut(e) + '"]';
  }
  function fc(e) {
    return "script[async]" + e;
  }
  function qf(e, t, c) {
    if (t.count++, t.instance === null) switch (t.type) {
      case "style":
        var u = e.querySelector('style[data-href~="' + ut(c.href) + '"]');
        if (u) return t.instance = u, Ee(u), u;
        var l = R({}, c, { "data-href": c.href, "data-precedence": c.precedence, href: null, precedence: null });
        return u = (e.ownerDocument || e).createElement("style"), Ee(u), ze(u, "style", l), ju(u, c.precedence, e), t.instance = u;
      case "stylesheet":
        l = ya(c.href);
        var o = e.querySelector(_c(l));
        if (o) return t.state.loading |= 4, t.instance = o, Ee(o), o;
        u = Lf(c), (l = bt.get(l)) && Yl(u, l), o = (e.ownerDocument || e).createElement("link"), Ee(o);
        var _ = o;
        return _._p = new Promise(function(s, d) {
          _.onload = s, _.onerror = d;
        }), ze(o, "link", u), t.state.loading |= 4, ju(o, c.precedence, e), t.instance = o;
      case "script":
        return o = ha(c.src), (l = e.querySelector(fc(o))) ? (t.instance = l, Ee(l), l) : (u = c, (l = bt.get(o)) && (u = R({}, c), Xl(u, l)), e = e.ownerDocument || e, l = e.createElement("script"), Ee(l), ze(l, "link", u), e.head.appendChild(l), t.instance = l);
      case "void":
        return null;
      default:
        throw Error(r(443, t.type));
    }
    else t.type === "stylesheet" && (t.state.loading & 4) === 0 && (u = t.instance, t.state.loading |= 4, ju(u, c.precedence, e));
    return t.instance;
  }
  function ju(e, t, c) {
    for (var u = c.querySelectorAll('link[rel="stylesheet"][data-precedence],style[data-precedence]'), l = u.length ? u[u.length - 1] : null, o = l, _ = 0; _ < u.length; _++) {
      var s = u[_];
      if (s.dataset.precedence === t) o = s;
      else if (o !== l) break;
    }
    o ? o.parentNode.insertBefore(e, o.nextSibling) : (t = c.nodeType === 9 ? c.head : c, t.insertBefore(e, t.firstChild));
  }
  function Yl(e, t) {
    e.crossOrigin == null && (e.crossOrigin = t.crossOrigin), e.referrerPolicy == null && (e.referrerPolicy = t.referrerPolicy), e.title == null && (e.title = t.title);
  }
  function Xl(e, t) {
    e.crossOrigin == null && (e.crossOrigin = t.crossOrigin), e.referrerPolicy == null && (e.referrerPolicy = t.referrerPolicy), e.integrity == null && (e.integrity = t.integrity);
  }
  var vu = null;
  function Gf(e, t, c) {
    if (vu === null) {
      var u = /* @__PURE__ */ new Map(), l = vu = /* @__PURE__ */ new Map();
      l.set(c, u);
    } else l = vu, u = l.get(c), u || (u = /* @__PURE__ */ new Map(), l.set(c, u));
    if (u.has(e)) return u;
    for (u.set(e, null), c = c.getElementsByTagName(e), l = 0; l < c.length; l++) {
      var o = c[l];
      if (!(o[Aa] || o[Te] || e === "link" && o.getAttribute("rel") === "stylesheet") && o.namespaceURI !== "http://www.w3.org/2000/svg") {
        var _ = o.getAttribute(t) || "";
        _ = e + _;
        var s = u.get(_);
        s ? s.push(o) : u.set(_, [o]);
      }
    }
    return u;
  }
  function Vf(e, t, c) {
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
  function Wf(e) {
    return !(e.type === "stylesheet" && (e.state.loading & 3) === 0);
  }
  function dd(e, t, c, u) {
    if (c.type === "stylesheet" && (typeof u.media != "string" || matchMedia(u.media).matches !== false) && (c.state.loading & 4) === 0) {
      if (c.instance === null) {
        var l = ya(u.href), o = t.querySelector(_c(l));
        if (o) {
          t = o._p, t !== null && typeof t == "object" && typeof t.then == "function" && (e.count++, e = Su.bind(e), t.then(e, e)), c.state.loading |= 4, c.instance = o, Ee(o);
          return;
        }
        o = t.ownerDocument || t, u = Lf(u), (l = bt.get(l)) && Yl(u, l), o = o.createElement("link"), Ee(o);
        var _ = o;
        _._p = new Promise(function(s, d) {
          _.onload = s, _.onerror = d;
        }), ze(o, "link", u), c.instance = o;
      }
      e.stylesheets === null && (e.stylesheets = /* @__PURE__ */ new Map()), e.stylesheets.set(c, t), (t = c.state.preload) && (c.state.loading & 3) === 0 && (e.count++, c = Su.bind(e), t.addEventListener("load", c), t.addEventListener("error", c));
    }
  }
  var Fl = 0;
  function gd(e, t) {
    return e.stylesheets && e.count === 0 && Eu(e, e.stylesheets), 0 < e.count || 0 < e.imgCount ? function(c) {
      var u = setTimeout(function() {
        if (e.stylesheets && Eu(e, e.stylesheets), e.unsuspend) {
          var o = e.unsuspend;
          e.unsuspend = null, o();
        }
      }, 6e4 + t);
      0 < e.imgBytes && Fl === 0 && (Fl = 62500 * Kb());
      var l = setTimeout(function() {
        if (e.waitingForImages = false, e.count === 0 && (e.stylesheets && Eu(e, e.stylesheets), e.unsuspend)) {
          var o = e.unsuspend;
          e.unsuspend = null, o();
        }
      }, (e.imgBytes > Fl ? 50 : 800) + t);
      return e.unsuspend = c, function() {
        e.unsuspend = null, clearTimeout(u), clearTimeout(l);
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
    e.stylesheets = null, e.unsuspend !== null && (e.count++, xu = /* @__PURE__ */ new Map(), t.forEach(md, e), xu = null, Su.call(e));
  }
  function md(e, t) {
    if (!(t.state.loading & 4)) {
      var c = xu.get(e);
      if (c) var u = c.get(null);
      else {
        c = /* @__PURE__ */ new Map(), xu.set(e, c);
        for (var l = e.querySelectorAll("link[data-precedence],style[data-precedence]"), o = 0; o < l.length; o++) {
          var _ = l[o];
          (_.nodeName === "LINK" || _.getAttribute("media") !== "not all") && (c.set(_.dataset.precedence, _), u = _);
        }
        u && c.set(null, u);
      }
      l = t.instance, _ = l.getAttribute("data-precedence"), o = c.get(_) || u, o === u && c.set(null, l), c.set(_, l), this.count++, u = Su.bind(this), l.addEventListener("load", u), l.addEventListener("error", u), o ? o.parentNode.insertBefore(l, o.nextSibling) : (e = e.nodeType === 9 ? e.head : e, e.insertBefore(l, e.firstChild)), t.state.loading |= 4;
    }
  }
  var sc = { $$typeof: Ce, Provider: null, Consumer: null, _currentValue: V, _currentValue2: V, _threadCount: 0 };
  function pd(e, t, c, u, l, o, _, s, d) {
    this.tag = 1, this.containerInfo = e, this.pingCache = this.current = this.pendingChildren = null, this.timeoutHandle = -1, this.callbackNode = this.next = this.pendingContext = this.context = this.cancelPendingCommit = null, this.callbackPriority = 0, this.expirationTimes = Vu(-1), this.entangledLanes = this.shellSuspendCounter = this.errorRecoveryDisabledLanes = this.expiredLanes = this.warmLanes = this.pingedLanes = this.suspendedLanes = this.pendingLanes = 0, this.entanglements = Vu(0), this.hiddenUpdates = Vu(null), this.identifierPrefix = u, this.onUncaughtError = l, this.onCaughtError = o, this.onRecoverableError = _, this.pooledCache = null, this.pooledCacheLanes = 0, this.formState = d, this.incompleteTransitions = /* @__PURE__ */ new Map();
  }
  function kf(e, t, c, u, l, o, _, s, d, v, E, M) {
    return e = new pd(e, t, c, _, d, v, E, M, s), t = 1, o === true && (t |= 24), o = Ie(3, null, null, t), e.current = o, o.stateNode = e, t = xi(), t.refCount++, e.pooledCache = t, t.refCount++, o.memoizedState = { element: u, isDehydrated: c, cache: t }, Mi(o), e;
  }
  function Yf(e) {
    return e ? (e = $n, e) : $n;
  }
  function Xf(e, t, c, u, l, o) {
    l = Yf(l), u.context === null ? u.context = l : u.pendingContext = l, u = en(t), u.payload = { element: c }, o = o === void 0 ? null : o, o !== null && (u.callback = o), c = tn(e, u, t), c !== null && (Fe(c, e, t), Ya(c, e, t));
  }
  function Ff(e, t) {
    if (e = e.memoizedState, e !== null && e.dehydrated !== null) {
      var c = e.retryLane;
      e.retryLane = c !== 0 && c < t ? c : t;
    }
  }
  function Ql(e, t) {
    Ff(e, t), (e = e.alternate) && Ff(e, t);
  }
  function Qf(e) {
    if (e.tag === 13 || e.tag === 31) {
      var t = xn(e, 67108864);
      t !== null && Fe(t, e, 67108864), Ql(e, 67108864);
    }
  }
  function Zf(e) {
    if (e.tag === 13 || e.tag === 31) {
      var t = nt();
      t = Wu(t);
      var c = xn(e, t);
      c !== null && Fe(c, e, t), Ql(e, t);
    }
  }
  var Au = true;
  function wd(e, t, c, u) {
    var l = A.T;
    A.T = null;
    var o = C.p;
    try {
      C.p = 2, Zl(e, t, c, u);
    } finally {
      C.p = o, A.T = l;
    }
  }
  function Od(e, t, c, u) {
    var l = A.T;
    A.T = null;
    var o = C.p;
    try {
      C.p = 8, Zl(e, t, c, u);
    } finally {
      C.p = o, A.T = l;
    }
  }
  function Zl(e, t, c, u) {
    if (Au) {
      var l = Kl(u);
      if (l === null) Hl(e, t, u, Tu, c), Jf(e, u);
      else if (hd(l, e, t, c, u)) u.stopPropagation();
      else if (Jf(e, u), t & 4 && -1 < yd.indexOf(e)) {
        for (; l !== null; ) {
          var o = Vn(l);
          if (o !== null) switch (o.tag) {
            case 3:
              if (o = o.stateNode, o.current.memoizedState.isDehydrated) {
                var _ = yn(o.pendingLanes);
                if (_ !== 0) {
                  var s = o;
                  for (s.pendingLanes |= 2, s.entangledLanes |= 2; _; ) {
                    var d = 1 << 31 - Ke(_);
                    s.entanglements[1] |= d, _ &= ~d;
                  }
                  xt(o), (ee & 6) === 0 && (_u = Qe() + 500, ic(0));
                }
              }
              break;
            case 31:
            case 13:
              s = xn(o, 2), s !== null && Fe(s, o, 2), su(), Ql(o, 2);
          }
          if (o = Kl(u), o === null && Hl(e, t, u, Tu, c), o === l) break;
          l = o;
        }
        l !== null && u.stopPropagation();
      } else Hl(e, t, u, null, c);
    }
  }
  function Kl(e) {
    return e = Iu(e), Jl(e);
  }
  var Tu = null;
  function Jl(e) {
    if (Tu = null, e = Gn(e), e !== null) {
      var t = b(e);
      if (t === null) e = null;
      else {
        var c = t.tag;
        if (c === 13) {
          if (e = g(t), e !== null) return e;
          e = null;
        } else if (c === 31) {
          if (e = h(t), e !== null) return e;
          e = null;
        } else if (c === 3) {
          if (t.stateNode.current.memoizedState.isDehydrated) return t.tag === 3 ? t.stateNode.containerInfo : null;
          e = null;
        } else t !== e && (e = null);
      }
    }
    return Tu = e, null;
  }
  function Kf(e) {
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
        switch (us()) {
          case tr:
            return 2;
          case nr:
            return 8;
          case pc:
          case is:
            return 32;
          case ar:
            return 268435456;
          default:
            return 32;
        }
      default:
        return 32;
    }
  }
  var Il = false, bn = null, dn = null, gn = null, bc = /* @__PURE__ */ new Map(), dc = /* @__PURE__ */ new Map(), mn = [], yd = "mousedown mouseup touchcancel touchend touchstart auxclick dblclick pointercancel pointerdown pointerup dragend dragstart drop compositionend compositionstart keydown keypress keyup input textInput copy cut paste click change contextmenu reset".split(" ");
  function Jf(e, t) {
    switch (e) {
      case "focusin":
      case "focusout":
        bn = null;
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
        bc.delete(t.pointerId);
        break;
      case "gotpointercapture":
      case "lostpointercapture":
        dc.delete(t.pointerId);
    }
  }
  function gc(e, t, c, u, l, o) {
    return e === null || e.nativeEvent !== o ? (e = { blockedOn: t, domEventName: c, eventSystemFlags: u, nativeEvent: o, targetContainers: [l] }, t !== null && (t = Vn(t), t !== null && Qf(t)), e) : (e.eventSystemFlags |= u, t = e.targetContainers, l !== null && t.indexOf(l) === -1 && t.push(l), e);
  }
  function hd(e, t, c, u, l) {
    switch (t) {
      case "focusin":
        return bn = gc(bn, e, t, c, u, l), true;
      case "dragenter":
        return dn = gc(dn, e, t, c, u, l), true;
      case "mouseover":
        return gn = gc(gn, e, t, c, u, l), true;
      case "pointerover":
        var o = l.pointerId;
        return bc.set(o, gc(bc.get(o) || null, e, t, c, u, l)), true;
      case "gotpointercapture":
        return o = l.pointerId, dc.set(o, gc(dc.get(o) || null, e, t, c, u, l)), true;
    }
    return false;
  }
  function If(e) {
    var t = Gn(e.target);
    if (t !== null) {
      var c = b(t);
      if (c !== null) {
        if (t = c.tag, t === 13) {
          if (t = g(c), t !== null) {
            e.blockedOn = t, or(e.priority, function() {
              Zf(c);
            });
            return;
          }
        } else if (t === 31) {
          if (t = h(c), t !== null) {
            e.blockedOn = t, or(e.priority, function() {
              Zf(c);
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
      var c = Kl(e.nativeEvent);
      if (c === null) {
        c = e.nativeEvent;
        var u = new c.constructor(c.type, c);
        Ju = u, c.target.dispatchEvent(u), Ju = null;
      } else return t = Vn(c), t !== null && Qf(t), e.blockedOn = c, false;
      t.shift();
    }
    return true;
  }
  function $f(e, t, c) {
    Mu(e) && c.delete(t);
  }
  function jd() {
    Il = false, bn !== null && Mu(bn) && (bn = null), dn !== null && Mu(dn) && (dn = null), gn !== null && Mu(gn) && (gn = null), bc.forEach($f), dc.forEach($f);
  }
  function Du(e, t) {
    e.blockedOn === t && (e.blockedOn = null, Il || (Il = true, n.unstable_scheduleCallback(n.unstable_NormalPriority, jd)));
  }
  var Ru = null;
  function Pf(e) {
    Ru !== e && (Ru = e, n.unstable_scheduleCallback(n.unstable_NormalPriority, function() {
      Ru === e && (Ru = null);
      for (var t = 0; t < e.length; t += 3) {
        var c = e[t], u = e[t + 1], l = e[t + 2];
        if (typeof u != "function") {
          if (Jl(u || c) === null) continue;
          break;
        }
        var o = Vn(c);
        o !== null && (e.splice(t, 3), t -= 3, Ki(o, { pending: true, data: l, method: c.method, action: u }, u, l));
      }
    }));
  }
  function ja(e) {
    function t(d) {
      return Du(d, e);
    }
    bn !== null && Du(bn, e), dn !== null && Du(dn, e), gn !== null && Du(gn, e), bc.forEach(t), dc.forEach(t);
    for (var c = 0; c < mn.length; c++) {
      var u = mn[c];
      u.blockedOn === e && (u.blockedOn = null);
    }
    for (; 0 < mn.length && (c = mn[0], c.blockedOn === null); ) If(c), c.blockedOn === null && mn.shift();
    if (c = (e.ownerDocument || e).$$reactFormReplay, c != null) for (u = 0; u < c.length; u += 3) {
      var l = c[u], o = c[u + 1], _ = l[Ge] || null;
      if (typeof o == "function") _ || Pf(c);
      else if (_) {
        var s = null;
        if (o && o.hasAttribute("formAction")) {
          if (l = o, _ = o[Ge] || null) s = _.formAction;
          else if (Jl(l) !== null) continue;
        } else s = _.action;
        typeof s == "function" ? c[u + 1] = s : (c.splice(u, 3), u -= 3), Pf(c);
      }
    }
  }
  function es() {
    function e(o) {
      o.canIntercept && o.info === "react-transition" && o.intercept({ handler: function() {
        return new Promise(function(_) {
          return l = _;
        });
      }, focusReset: "manual", scroll: "manual" });
    }
    function t() {
      l !== null && (l(), l = null), u || setTimeout(c, 20);
    }
    function c() {
      if (!u && !navigation.transition) {
        var o = navigation.currentEntry;
        o && o.url != null && navigation.navigate(o.url, { state: o.getState(), info: "react-transition", history: "replace" });
      }
    }
    if (typeof navigation == "object") {
      var u = false, l = null;
      return navigation.addEventListener("navigate", e), navigation.addEventListener("navigatesuccess", t), navigation.addEventListener("navigateerror", t), setTimeout(c, 100), function() {
        u = true, navigation.removeEventListener("navigate", e), navigation.removeEventListener("navigatesuccess", t), navigation.removeEventListener("navigateerror", t), l !== null && (l(), l = null);
      };
    }
  }
  function $l(e) {
    this._internalRoot = e;
  }
  zu.prototype.render = $l.prototype.render = function(e) {
    var t = this._internalRoot;
    if (t === null) throw Error(r(409));
    var c = t.current, u = nt();
    Xf(c, u, e, t, null, null);
  }, zu.prototype.unmount = $l.prototype.unmount = function() {
    var e = this._internalRoot;
    if (e !== null) {
      this._internalRoot = null;
      var t = e.containerInfo;
      Xf(e.current, 2, null, e, null, null), su(), t[qn] = null;
    }
  };
  function zu(e) {
    this._internalRoot = e;
  }
  zu.prototype.unstable_scheduleHydration = function(e) {
    if (e) {
      var t = rr();
      e = { blockedOn: null, target: e, priority: t };
      for (var c = 0; c < mn.length && t !== 0 && t < mn[c].priority; c++) ;
      mn.splice(c, 0, e), c === 0 && If(e);
    }
  };
  var ts = a.version;
  if (ts !== "19.2.6") throw Error(r(527, ts, "19.2.6"));
  C.findDOMNode = function(e) {
    var t = e._reactInternals;
    if (t === void 0) throw typeof e.render == "function" ? Error(r(188)) : (e = Object.keys(e).join(","), Error(r(268, e)));
    return e = w(t), e = e !== null ? z(e) : null, e = e === null ? null : e.stateNode, e;
  };
  var vd = { bundleType: 0, version: "19.2.6", rendererPackageName: "react-dom", currentDispatcherRef: A, reconcilerVersion: "19.2.6" };
  if (typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ < "u") {
    var Cu = __REACT_DEVTOOLS_GLOBAL_HOOK__;
    if (!Cu.isDisabled && Cu.supportsFiber) try {
      Sa = Cu.inject(vd), Ze = Cu;
    } catch {
    }
  }
  return reactDomClient_production.createRoot = function(e, t) {
    if (!f(e)) throw Error(r(299));
    var c = false, u = "", l = l_, o = r_, _ = o_;
    return t != null && (t.unstable_strictMode === true && (c = true), t.identifierPrefix !== void 0 && (u = t.identifierPrefix), t.onUncaughtError !== void 0 && (l = t.onUncaughtError), t.onCaughtError !== void 0 && (o = t.onCaughtError), t.onRecoverableError !== void 0 && (_ = t.onRecoverableError)), t = kf(e, 1, false, null, null, c, u, null, l, o, _, es), e[qn] = t.current, Cl(e), new $l(t);
  }, reactDomClient_production.hydrateRoot = function(e, t, c) {
    if (!f(e)) throw Error(r(299));
    var u = false, l = "", o = l_, _ = r_, s = o_, d = null;
    return c != null && (c.unstable_strictMode === true && (u = true), c.identifierPrefix !== void 0 && (l = c.identifierPrefix), c.onUncaughtError !== void 0 && (o = c.onUncaughtError), c.onCaughtError !== void 0 && (_ = c.onCaughtError), c.onRecoverableError !== void 0 && (s = c.onRecoverableError), c.formState !== void 0 && (d = c.formState)), t = kf(e, 1, true, t, c ?? null, u, l, d, o, _, s, es), t.context = Yf(null), c = t.current, u = nt(), u = Wu(u), l = en(u), l.callback = null, tn(c, l, u), c = u, t.current.lanes = c, Ea(t, c), xt(t), e[qn] = t.current, Cl(e), new zu(t);
  }, reactDomClient_production.version = "19.2.6", reactDomClient_production;
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
  on(a, i) {
    this.listeners.has(a) || this.listeners.set(a, /* @__PURE__ */ new Set());
    const r = this.listeners.get(a), f = i;
    return r.add(f), () => {
      r.delete(f);
    };
  }
  once(a, i) {
    const r = this.on(a, ((f) => {
      r(), i(f);
    }));
    return r;
  }
  emit(a, ...i) {
    const r = this.listeners.get(a);
    if (r) {
      const f = i[0];
      r.forEach((b) => b(f));
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
      let i = [...n.toasts, a.toast];
      return i.length > DEFAULT_TOAST_CONFIG.maxVisible && (i = i.map((r, f) => f === 0 && !r.exiting ? { ...r, exiting: true } : r)), { toasts: i };
    }
    case "MARK_EXITING":
      return { toasts: n.toasts.map((i) => i.id === a.id ? { ...i, exiting: true } : i) };
    case "REMOVE":
      return { toasts: n.toasts.filter((i) => i.id !== a.id) };
    case "CLEAR":
      return { toasts: n.toasts.map((i) => ({ ...i, exiting: true })) };
  }
}
const ToastStateContext = reactExports.createContext({ toasts: [] }), ToastDispatchContext = reactExports.createContext(() => {
});
function ToastProvider({ children: n }) {
  const [a, i] = reactExports.useReducer(toastReducer, { toasts: [] });
  return reactExports.useEffect(() => {
    const r = gameEvents.on("toast:show", ({ message: g, severity: h, duration: y }) => {
      i({ type: "ADD", toast: { id: crypto.randomUUID(), message: g, severity: h, duration: y ?? SEVERITY_DURATIONS[h], createdAt: Date.now(), exiting: false } });
    }), f = gameEvents.on("toast:dismiss", ({ id: g }) => {
      i({ type: "MARK_EXITING", id: g });
    }), b = gameEvents.on("toast:clear", () => {
      i({ type: "CLEAR" });
    });
    return () => {
      r(), f(), b();
    };
  }, []), jsxRuntimeExports.jsx(ToastStateContext, { value: a, children: jsxRuntimeExports.jsx(ToastDispatchContext, { value: i, children: n }) });
}
const initialState = { stack: [], isOpen: false };
function modalReducer(n, a) {
  var _a;
  switch (a.type) {
    case "OPEN":
      return { stack: [...n.stack, a.modal], isOpen: true };
    case "CLOSE": {
      const i = n.stack[n.stack.length - 1], r = n.stack.slice(0, -1);
      return (_a = i == null ? void 0 : i.onClose) == null ? void 0 : _a.call(i), { stack: r, isOpen: r.length > 0 };
    }
    case "CLOSE_ALL":
      return n.stack.forEach((i) => {
        var _a2;
        return (_a2 = i.onClose) == null ? void 0 : _a2.call(i);
      }), initialState;
  }
}
const ModalStateContext = reactExports.createContext(initialState), ModalDispatchContext = reactExports.createContext(() => {
});
function ModalProvider({ children: n }) {
  const [a, i] = reactExports.useReducer(modalReducer, initialState);
  return reactExports.useEffect(() => {
    const r = gameEvents.on("modal:open", ({ id: b, title: g, content: h, size: y, onClose: w }) => {
      i({ type: "OPEN", modal: { id: b ?? crypto.randomUUID(), title: g, content: h, onClose: w, closeOnOverlayClick: true, closeOnEscape: true, size: y ?? "md" } });
    }), f = gameEvents.on("modal:close", () => {
      i({ type: "CLOSE" });
    });
    return () => {
      r(), f();
    };
  }, []), jsxRuntimeExports.jsx(ModalStateContext, { value: a, children: jsxRuntimeExports.jsx(ModalDispatchContext, { value: i, children: n }) });
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
    const r = setTimeout(() => a(n.id), n.duration);
    return () => clearTimeout(r);
  }, [n.id, n.duration, n.exiting, a]);
  const i = SEVERITY_BORDER_COLORS[n.severity];
  return jsxRuntimeExports.jsxs("div", { className: `
				pointer-events-auto mb-2 px-3 py-2 md:px-4 md:py-3 min-w-[180px] md:min-w-[260px] max-w-[280px] md:max-w-[380px]
				bg-panel shadow-toast
				border-2 border-panel-border border-l-4 ${i}
				${n.exiting ? "animate-toast-out" : "animate-toast-in"}
				flex items-start gap-2
			`, onAnimationEnd: () => {
    n.exiting && a(n.id);
  }, children: [jsxRuntimeExports.jsx("span", { className: "text-[8px] md:text-xs leading-relaxed flex-1", children: n.message }), jsxRuntimeExports.jsx("button", { onClick: () => a(n.id), className: "text-text-muted hover:text-text text-[8px] md:text-xs leading-none mt-0.5 cursor-pointer", children: "\u2715" })] });
}
function ToastContainer() {
  const { toasts: n } = reactExports.useContext(ToastStateContext), a = reactExports.useContext(ToastDispatchContext), i = reactExports.useCallback((r) => {
    var _a;
    ((_a = n.find((b) => b.id === r)) == null ? void 0 : _a.exiting) ? a({ type: "REMOVE", id: r }) : a({ type: "MARK_EXITING", id: r });
  }, [n, a]);
  return n.length === 0 ? null : reactDomExports.createPortal(jsxRuntimeExports.jsx("div", { className: "fixed top-14 right-4 flex flex-col items-end pointer-events-none", children: n.map((r) => jsxRuntimeExports.jsx(ToastItem, { toast: r, onDismiss: i }, r.id)) }), getPortalRoot("toast-root"));
}
const MODAL_SIZE_CLASSES = { xs: "max-w-xs", sm: "max-w-sm", md: "max-w-md", lg: "max-w-lg" };
function ModalOverlay() {
  const { stack: n, isOpen: a } = reactExports.useContext(ModalStateContext), i = reactExports.useContext(ModalDispatchContext);
  if (!a || n.length === 0) return null;
  const r = n[n.length - 1], f = MODAL_SIZE_CLASSES[r.size ?? "md"];
  return reactDomExports.createPortal(jsxRuntimeExports.jsx("div", { className: "fixed inset-0 bg-overlay flex items-center justify-center pointer-events-auto", onClick: () => {
    r.closeOnOverlayClick !== false && i({ type: "CLOSE" });
  }, children: jsxRuntimeExports.jsx("div", { className: `
					${f} mx-4
					border-[3px] border-panel-border
					shadow-[0_0_0_1px_#1a1008,0_6px_20px_rgba(0,0,0,0.8)]
					animate-modal-in
				`, onClick: (b) => b.stopPropagation(), children: jsxRuntimeExports.jsxs("div", { className: "border-2 border-[#1a1008]", children: [jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between px-3 py-2 md:px-4 md:py-3 bg-[#1e1408] border-b border-[#5a4a2a]", children: [jsxRuntimeExports.jsx("h2", { className: "text-[10px] md:text-sm text-[#c8a832]", children: r.title }), jsxRuntimeExports.jsx("button", { onClick: () => i({ type: "CLOSE" }), className: `w-5 h-5 md:w-7 md:h-7 flex items-center justify-center
								bg-[#3d2b14] border border-[#5a4a2a]
								text-text-muted hover:text-[#c8a832] hover:border-panel-border
								text-[8px] md:text-xs leading-none cursor-pointer transition-colors`, children: "\u2715" })] }), jsxRuntimeExports.jsx("div", { className: "p-3 md:p-4 bg-panel-inner text-[8px] md:text-xs", children: r.content })] }) }) }), getPortalRoot("modal-root"));
}
function useKeyboard(n, a, i = true) {
  reactExports.useEffect(() => {
    if (!i) return;
    const r = (f) => {
      f.key === n && (f.preventDefault(), a());
    };
    return window.addEventListener("keydown", r), () => window.removeEventListener("keydown", r);
  }, [n, a, i]);
}
function focusCanvas() {
  var _a;
  (_a = document.getElementById("bevy-canvas")) == null ? void 0 : _a.focus();
}
function KeyboardRouter() {
  const n = reactExports.useContext(ModalStateContext), a = reactExports.useContext(ModalDispatchContext), i = reactExports.useRef(false), r = n.isOpen;
  reactExports.useEffect(() => {
    i.current && !r && focusCanvas(), i.current = r;
  }, [r]);
  const f = reactExports.useCallback(() => {
    n.isOpen && a({ type: "CLOSE" });
  }, [n.isOpen, a]);
  return useKeyboard("Escape", f), null;
}
function GameUIProvider({ children: n }) {
  return jsxRuntimeExports.jsx(ToastProvider, { children: jsxRuntimeExports.jsxs(ModalProvider, { children: [jsxRuntimeExports.jsx(KeyboardRouter, {}), n, jsxRuntimeExports.jsx(ToastContainer, {}), jsxRuntimeExports.jsx(ModalOverlay, {})] }) });
}
function __classPrivateFieldGet(n, a, i, r) {
  if (typeof a == "function" ? n !== a || !r : !a.has(n)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
  return i === "m" ? r : i === "a" ? r.call(n) : r ? r.value : a.get(n);
}
function __classPrivateFieldSet(n, a, i, r, f) {
  if (typeof a == "function" ? n !== a || true : !a.has(n)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
  return a.set(n, i), i;
}
typeof SuppressedError == "function" && SuppressedError;
var _Resource_rid;
const SERIALIZE_TO_IPC_FN = "__TAURI_TO_IPC_KEY__";
function transformCallback(n, a = false) {
  return window.__TAURI_INTERNALS__.transformCallback(n, a);
}
async function invoke(n, a = {}, i) {
  return window.__TAURI_INTERNALS__.invoke(n, a, i);
}
class Resource {
  get rid() {
    return __classPrivateFieldGet(this, _Resource_rid, "f");
  }
  constructor(a) {
    _Resource_rid.set(this, void 0), __classPrivateFieldSet(this, _Resource_rid, a);
  }
  async close() {
    return invoke("plugin:resources|close", { rid: this.rid });
  }
}
_Resource_rid = /* @__PURE__ */ new WeakMap();
function detectTauri$2() {
  return !!(window.__TAURI_INTERNALS__ || window.__TAURI__);
}
async function loadWasmModule() {
  try {
    return await __vitePreload(() => Promise.resolve().then(() => isometric_game), void 0);
  } catch {
    return null;
  }
}
async function sendChat(n) {
  if (!n.trim()) return false;
  if (detectTauri$2()) try {
    return await invoke("send_chat", { text: n });
  } catch (r) {
    return console.warn("[chat] send_chat (tauri) threw", r), false;
  }
  const a = await loadWasmModule();
  if (!a) return false;
  const i = a.send_chat;
  if (typeof i != "function") return false;
  try {
    return i(n);
  } catch (r) {
    return console.warn("[chat] send_chat (wasm) threw", r), false;
  }
}
async function fetchLog() {
  if (detectTauri$2()) try {
    return await invoke("get_chat_log");
  } catch {
    return [];
  }
  const n = await loadWasmModule();
  if (!n) return [];
  const a = n.get_chat_log_json;
  if (typeof a != "function") return [];
  try {
    const i = a();
    return i ? JSON.parse(i) : [];
  } catch {
    return [];
  }
}
async function fetchSignin() {
  if (detectTauri$2()) try {
    return await invoke("get_signin_state");
  } catch {
    return null;
  }
  const n = await loadWasmModule();
  if (!n) return null;
  const a = n.get_signin_state_json;
  if (typeof a != "function") return null;
  try {
    const i = a();
    return i ? JSON.parse(i) : null;
  } catch {
    return null;
  }
}
function ChatInput() {
  const [n, a] = reactExports.useState(false), [i, r] = reactExports.useState(null), [f, b] = reactExports.useState([]), [g, h] = reactExports.useState(false), y = reactExports.useRef(null), w = reactExports.useRef(null);
  reactExports.useEffect(() => {
    let R = false;
    const U = async () => {
      if (R) return;
      const [fe, xe] = await Promise.all([fetchSignin(), fetchLog()]);
      R || (fe && (a(fe.jwt_valid && !!fe.username), r(fe.username)), b(xe));
    };
    U();
    const re = setInterval(() => void U(), 1e3);
    return () => {
      R = true, clearInterval(re);
    };
  }, []), reactExports.useEffect(() => {
    if (!g) return;
    const R = w.current;
    R && (R.scrollTop = R.scrollHeight);
  }, [f, g]), reactExports.useEffect(() => {
    const R = (U) => {
      const re = U.target, fe = re == null ? void 0 : re.tagName;
      if (fe === "INPUT" || fe === "TEXTAREA" || fe === "SELECT" || (re == null ? void 0 : re.isContentEditable) === true) {
        re === y.current && U.key === "Escape" && (U.preventDefault(), y.current && (y.current.value = ""), h(false));
        return;
      }
      (U.code === "KeyT" || U.code === "Slash" || U.key === "T" || U.key === "t" || U.key === "/") && !U.metaKey && !U.ctrlKey && !U.altKey ? (U.preventDefault(), U.stopPropagation(), h((He) => !He)) : U.key === "Escape" && g && h(false);
    };
    return window.addEventListener("keydown", R, true), () => window.removeEventListener("keydown", R, true);
  }, [g]), reactExports.useEffect(() => {
    if (!g) return;
    const R = y.current;
    if (!R) return;
    const U = () => R.focus();
    U();
    const re = requestAnimationFrame(U);
    return () => cancelAnimationFrame(re);
  }, [g]);
  const z = reactExports.useCallback(async () => {
    const R = y.current, U = ((R == null ? void 0 : R.value) ?? "").trim();
    if (!U) return;
    await sendChat(U) || console.warn("[chat] send failed (not connected or rejected)"), R && (R.value = "");
  }, []);
  return !n || !g ? null : jsxRuntimeExports.jsxs("div", { style: { position: "fixed", left: 12, top: 48, width: "min(340px, calc(100vw - 24px))", height: "min(260px, calc(100vh - 96px))", zIndex: 9999, pointerEvents: "auto", background: "rgba(10, 10, 16, 0.86)", border: "1px solid rgba(255, 255, 255, 0.18)", borderRadius: 6, boxShadow: "0 4px 16px rgba(0, 0, 0, 0.4)", display: "flex", flexDirection: "column", color: "#e8d8b8", fontFamily: "monospace", fontSize: 12 }, children: [jsxRuntimeExports.jsxs("div", { style: { padding: "4px 8px", borderBottom: "1px solid rgba(255, 255, 255, 0.1)", fontSize: 11, color: "#a89878", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }, children: [jsxRuntimeExports.jsx("span", { children: "#general" }), jsxRuntimeExports.jsx("span", { style: { flex: 1, textAlign: "right" }, children: i ?? "" }), jsxRuntimeExports.jsx("button", { type: "button", onClick: () => h(false), style: { background: "transparent", border: "none", color: "#a89878", cursor: "pointer", fontSize: 14, lineHeight: 1, padding: "0 2px" }, title: "Close (Esc)", children: "\xD7" })] }), jsxRuntimeExports.jsx("div", { ref: w, style: { flex: 1, overflowY: "auto", padding: "6px 8px", display: "flex", flexDirection: "column", gap: 2 }, children: f.length === 0 ? jsxRuntimeExports.jsx("div", { style: { color: "#665a3a" }, children: "(no messages yet)" }) : f.map((R, U) => jsxRuntimeExports.jsxs("div", { style: { lineHeight: 1.3 }, children: [jsxRuntimeExports.jsx("span", { style: { color: "#7eb55b" }, children: R.sender }), jsxRuntimeExports.jsx("span", { style: { color: "#a89878" }, children: ": " }), jsxRuntimeExports.jsx("span", { children: R.content })] }, U)) }), jsxRuntimeExports.jsx("div", { style: { padding: "6px 8px", borderTop: "1px solid rgba(255, 255, 255, 0.1)" }, children: jsxRuntimeExports.jsx("input", { ref: y, type: "text", maxLength: 300, defaultValue: "", autoComplete: "off", spellCheck: false, onKeyDown: (R) => {
    R.key === "Enter" && (R.preventDefault(), z());
  }, placeholder: "Enter to send \u2014 Esc to close", style: { width: "100%", background: "rgba(0, 0, 0, 0.4)", border: "1px solid rgba(255, 255, 255, 0.15)", borderRadius: 4, outline: "none", color: "#e8d8b8", fontSize: 12, fontFamily: "inherit", caretColor: "#e8d8b8", padding: "4px 6px" } }) })] });
}
class LogicalSize {
  constructor(...a) {
    this.type = "Logical", a.length === 1 ? "Logical" in a[0] ? (this.width = a[0].Logical.width, this.height = a[0].Logical.height) : (this.width = a[0].width, this.height = a[0].height) : (this.width = a[0], this.height = a[1]);
  }
  toPhysical(a) {
    return new PhysicalSize(this.width * a, this.height * a);
  }
  [SERIALIZE_TO_IPC_FN]() {
    return { width: this.width, height: this.height };
  }
  toJSON() {
    return this[SERIALIZE_TO_IPC_FN]();
  }
}
class PhysicalSize {
  constructor(...a) {
    this.type = "Physical", a.length === 1 ? "Physical" in a[0] ? (this.width = a[0].Physical.width, this.height = a[0].Physical.height) : (this.width = a[0].width, this.height = a[0].height) : (this.width = a[0], this.height = a[1]);
  }
  toLogical(a) {
    return new LogicalSize(this.width / a, this.height / a);
  }
  [SERIALIZE_TO_IPC_FN]() {
    return { width: this.width, height: this.height };
  }
  toJSON() {
    return this[SERIALIZE_TO_IPC_FN]();
  }
}
class Size {
  constructor(a) {
    this.size = a;
  }
  toLogical(a) {
    return this.size instanceof LogicalSize ? this.size : this.size.toLogical(a);
  }
  toPhysical(a) {
    return this.size instanceof PhysicalSize ? this.size : this.size.toPhysical(a);
  }
  [SERIALIZE_TO_IPC_FN]() {
    return { [`${this.size.type}`]: { width: this.size.width, height: this.size.height } };
  }
  toJSON() {
    return this[SERIALIZE_TO_IPC_FN]();
  }
}
class LogicalPosition {
  constructor(...a) {
    this.type = "Logical", a.length === 1 ? "Logical" in a[0] ? (this.x = a[0].Logical.x, this.y = a[0].Logical.y) : (this.x = a[0].x, this.y = a[0].y) : (this.x = a[0], this.y = a[1]);
  }
  toPhysical(a) {
    return new PhysicalPosition(this.x * a, this.y * a);
  }
  [SERIALIZE_TO_IPC_FN]() {
    return { x: this.x, y: this.y };
  }
  toJSON() {
    return this[SERIALIZE_TO_IPC_FN]();
  }
}
class PhysicalPosition {
  constructor(...a) {
    this.type = "Physical", a.length === 1 ? "Physical" in a[0] ? (this.x = a[0].Physical.x, this.y = a[0].Physical.y) : (this.x = a[0].x, this.y = a[0].y) : (this.x = a[0], this.y = a[1]);
  }
  toLogical(a) {
    return new LogicalPosition(this.x / a, this.y / a);
  }
  [SERIALIZE_TO_IPC_FN]() {
    return { x: this.x, y: this.y };
  }
  toJSON() {
    return this[SERIALIZE_TO_IPC_FN]();
  }
}
class Position {
  constructor(a) {
    this.position = a;
  }
  toLogical(a) {
    return this.position instanceof LogicalPosition ? this.position : this.position.toLogical(a);
  }
  toPhysical(a) {
    return this.position instanceof PhysicalPosition ? this.position : this.position.toPhysical(a);
  }
  [SERIALIZE_TO_IPC_FN]() {
    return { [`${this.position.type}`]: { x: this.position.x, y: this.position.y } };
  }
  toJSON() {
    return this[SERIALIZE_TO_IPC_FN]();
  }
}
var TauriEvent;
(function(n) {
  n.WINDOW_RESIZED = "tauri://resize", n.WINDOW_MOVED = "tauri://move", n.WINDOW_CLOSE_REQUESTED = "tauri://close-requested", n.WINDOW_DESTROYED = "tauri://destroyed", n.WINDOW_FOCUS = "tauri://focus", n.WINDOW_BLUR = "tauri://blur", n.WINDOW_SCALE_FACTOR_CHANGED = "tauri://scale-change", n.WINDOW_THEME_CHANGED = "tauri://theme-changed", n.WINDOW_CREATED = "tauri://window-created", n.WINDOW_SUSPENDED = "tauri://suspended", n.WINDOW_RESUMED = "tauri://resumed", n.WEBVIEW_CREATED = "tauri://webview-created", n.DRAG_ENTER = "tauri://drag-enter", n.DRAG_OVER = "tauri://drag-over", n.DRAG_DROP = "tauri://drag-drop", n.DRAG_LEAVE = "tauri://drag-leave";
})(TauriEvent || (TauriEvent = {}));
async function _unlisten(n, a) {
  window.__TAURI_EVENT_PLUGIN_INTERNALS__.unregisterListener(n, a), await invoke("plugin:event|unlisten", { event: n, eventId: a });
}
async function listen(n, a, i) {
  var r;
  const f = typeof (i == null ? void 0 : i.target) == "string" ? { kind: "AnyLabel", label: i.target } : (r = i == null ? void 0 : i.target) !== null && r !== void 0 ? r : { kind: "Any" };
  return invoke("plugin:event|listen", { event: n, target: f, handler: transformCallback(a) }).then((b) => async () => _unlisten(n, b));
}
async function once(n, a, i) {
  return listen(n, (r) => {
    _unlisten(n, r.id), a(r);
  }, i);
}
async function emit(n, a) {
  await invoke("plugin:event|emit", { event: n, payload: a });
}
async function emitTo(n, a, i) {
  await invoke("plugin:event|emit_to", { target: typeof n == "string" ? { kind: "AnyLabel", label: n } : n, event: a, payload: i });
}
let Image$1 = class Hu extends Resource {
  constructor(a) {
    super(a);
  }
  static async new(a, i, r) {
    return invoke("plugin:image|new", { rgba: transformImage(a), width: i, height: r }).then((f) => new Hu(f));
  }
  static async fromBytes(a) {
    return invoke("plugin:image|from_bytes", { bytes: transformImage(a) }).then((i) => new Hu(i));
  }
  static async fromPath(a) {
    return invoke("plugin:image|from_path", { path: a }).then((i) => new Hu(i));
  }
  async rgba() {
    return invoke("plugin:image|rgba", { rid: this.rid }).then((a) => new Uint8Array(a));
  }
  async size() {
    return invoke("plugin:image|size", { rid: this.rid });
  }
};
function transformImage(n) {
  return n == null ? null : typeof n == "string" ? n : n instanceof Image$1 ? n.rid : n;
}
var UserAttentionType;
(function(n) {
  n[n.Critical = 1] = "Critical", n[n.Informational = 2] = "Informational";
})(UserAttentionType || (UserAttentionType = {}));
class CloseRequestedEvent {
  constructor(a) {
    this._preventDefault = false, this.event = a.event, this.id = a.id;
  }
  preventDefault() {
    this._preventDefault = true;
  }
  isPreventDefault() {
    return this._preventDefault;
  }
}
var ProgressBarStatus;
(function(n) {
  n.None = "none", n.Normal = "normal", n.Indeterminate = "indeterminate", n.Paused = "paused", n.Error = "error";
})(ProgressBarStatus || (ProgressBarStatus = {}));
function getCurrentWindow() {
  return new Window$1(window.__TAURI_INTERNALS__.metadata.currentWindow.label, { skip: true });
}
async function getAllWindows() {
  return invoke("plugin:window|get_all_windows").then((n) => n.map((a) => new Window$1(a, { skip: true })));
}
const localTauriEvents = ["tauri://created", "tauri://error"];
let Window$1 = class {
  constructor(a, i = {}) {
    var r;
    this.label = a, this.listeners = /* @__PURE__ */ Object.create(null), (i == null ? void 0 : i.skip) || invoke("plugin:window|create", { options: { ...i, parent: typeof i.parent == "string" ? i.parent : (r = i.parent) === null || r === void 0 ? void 0 : r.label, label: a } }).then(async () => this.emit("tauri://created")).catch(async (f) => this.emit("tauri://error", f));
  }
  static async getByLabel(a) {
    var i;
    return (i = (await getAllWindows()).find((r) => r.label === a)) !== null && i !== void 0 ? i : null;
  }
  static getCurrent() {
    return getCurrentWindow();
  }
  static async getAll() {
    return getAllWindows();
  }
  static async getFocusedWindow() {
    for (const a of await getAllWindows()) if (await a.isFocused()) return a;
    return null;
  }
  async listen(a, i) {
    return this._handleTauriEvent(a, i) ? () => {
      const r = this.listeners[a];
      r.splice(r.indexOf(i), 1);
    } : listen(a, i, { target: { kind: "Window", label: this.label } });
  }
  async once(a, i) {
    return this._handleTauriEvent(a, i) ? () => {
      const r = this.listeners[a];
      r.splice(r.indexOf(i), 1);
    } : once(a, i, { target: { kind: "Window", label: this.label } });
  }
  async emit(a, i) {
    if (localTauriEvents.includes(a)) {
      for (const r of this.listeners[a] || []) r({ event: a, id: -1, payload: i });
      return;
    }
    return emit(a, i);
  }
  async emitTo(a, i, r) {
    if (localTauriEvents.includes(i)) {
      for (const f of this.listeners[i] || []) f({ event: i, id: -1, payload: r });
      return;
    }
    return emitTo(a, i, r);
  }
  _handleTauriEvent(a, i) {
    return localTauriEvents.includes(a) ? (a in this.listeners ? this.listeners[a].push(i) : this.listeners[a] = [i], true) : false;
  }
  async scaleFactor() {
    return invoke("plugin:window|scale_factor", { label: this.label });
  }
  async innerPosition() {
    return invoke("plugin:window|inner_position", { label: this.label }).then((a) => new PhysicalPosition(a));
  }
  async outerPosition() {
    return invoke("plugin:window|outer_position", { label: this.label }).then((a) => new PhysicalPosition(a));
  }
  async innerSize() {
    return invoke("plugin:window|inner_size", { label: this.label }).then((a) => new PhysicalSize(a));
  }
  async outerSize() {
    return invoke("plugin:window|outer_size", { label: this.label }).then((a) => new PhysicalSize(a));
  }
  async isFullscreen() {
    return invoke("plugin:window|is_fullscreen", { label: this.label });
  }
  async isMinimized() {
    return invoke("plugin:window|is_minimized", { label: this.label });
  }
  async isMaximized() {
    return invoke("plugin:window|is_maximized", { label: this.label });
  }
  async isFocused() {
    return invoke("plugin:window|is_focused", { label: this.label });
  }
  async isDecorated() {
    return invoke("plugin:window|is_decorated", { label: this.label });
  }
  async isResizable() {
    return invoke("plugin:window|is_resizable", { label: this.label });
  }
  async isMaximizable() {
    return invoke("plugin:window|is_maximizable", { label: this.label });
  }
  async isMinimizable() {
    return invoke("plugin:window|is_minimizable", { label: this.label });
  }
  async isClosable() {
    return invoke("plugin:window|is_closable", { label: this.label });
  }
  async isVisible() {
    return invoke("plugin:window|is_visible", { label: this.label });
  }
  async title() {
    return invoke("plugin:window|title", { label: this.label });
  }
  async theme() {
    return invoke("plugin:window|theme", { label: this.label });
  }
  async isAlwaysOnTop() {
    return invoke("plugin:window|is_always_on_top", { label: this.label });
  }
  async activityName() {
    return invoke("plugin:window|activity_name", { label: this.label });
  }
  async sceneIdentifier() {
    return invoke("plugin:window|scene_identifier", { label: this.label });
  }
  async center() {
    return invoke("plugin:window|center", { label: this.label });
  }
  async requestUserAttention(a) {
    let i = null;
    return a && (a === UserAttentionType.Critical ? i = { type: "Critical" } : i = { type: "Informational" }), invoke("plugin:window|request_user_attention", { label: this.label, value: i });
  }
  async setResizable(a) {
    return invoke("plugin:window|set_resizable", { label: this.label, value: a });
  }
  async setEnabled(a) {
    return invoke("plugin:window|set_enabled", { label: this.label, value: a });
  }
  async isEnabled() {
    return invoke("plugin:window|is_enabled", { label: this.label });
  }
  async setMaximizable(a) {
    return invoke("plugin:window|set_maximizable", { label: this.label, value: a });
  }
  async setMinimizable(a) {
    return invoke("plugin:window|set_minimizable", { label: this.label, value: a });
  }
  async setClosable(a) {
    return invoke("plugin:window|set_closable", { label: this.label, value: a });
  }
  async setTitle(a) {
    return invoke("plugin:window|set_title", { label: this.label, value: a });
  }
  async maximize() {
    return invoke("plugin:window|maximize", { label: this.label });
  }
  async unmaximize() {
    return invoke("plugin:window|unmaximize", { label: this.label });
  }
  async toggleMaximize() {
    return invoke("plugin:window|toggle_maximize", { label: this.label });
  }
  async minimize() {
    return invoke("plugin:window|minimize", { label: this.label });
  }
  async unminimize() {
    return invoke("plugin:window|unminimize", { label: this.label });
  }
  async show() {
    return invoke("plugin:window|show", { label: this.label });
  }
  async hide() {
    return invoke("plugin:window|hide", { label: this.label });
  }
  async close() {
    return invoke("plugin:window|close", { label: this.label });
  }
  async destroy() {
    return invoke("plugin:window|destroy", { label: this.label });
  }
  async setDecorations(a) {
    return invoke("plugin:window|set_decorations", { label: this.label, value: a });
  }
  async setShadow(a) {
    return invoke("plugin:window|set_shadow", { label: this.label, value: a });
  }
  async setEffects(a) {
    return invoke("plugin:window|set_effects", { label: this.label, value: a });
  }
  async clearEffects() {
    return invoke("plugin:window|set_effects", { label: this.label, value: null });
  }
  async setAlwaysOnTop(a) {
    return invoke("plugin:window|set_always_on_top", { label: this.label, value: a });
  }
  async setAlwaysOnBottom(a) {
    return invoke("plugin:window|set_always_on_bottom", { label: this.label, value: a });
  }
  async setContentProtected(a) {
    return invoke("plugin:window|set_content_protected", { label: this.label, value: a });
  }
  async setSize(a) {
    return invoke("plugin:window|set_size", { label: this.label, value: a instanceof Size ? a : new Size(a) });
  }
  async setMinSize(a) {
    return invoke("plugin:window|set_min_size", { label: this.label, value: a instanceof Size ? a : a ? new Size(a) : null });
  }
  async setMaxSize(a) {
    return invoke("plugin:window|set_max_size", { label: this.label, value: a instanceof Size ? a : a ? new Size(a) : null });
  }
  async setSizeConstraints(a) {
    function i(r) {
      return r ? { Logical: r } : null;
    }
    return invoke("plugin:window|set_size_constraints", { label: this.label, value: { minWidth: i(a == null ? void 0 : a.minWidth), minHeight: i(a == null ? void 0 : a.minHeight), maxWidth: i(a == null ? void 0 : a.maxWidth), maxHeight: i(a == null ? void 0 : a.maxHeight) } });
  }
  async setPosition(a) {
    return invoke("plugin:window|set_position", { label: this.label, value: a instanceof Position ? a : new Position(a) });
  }
  async setFullscreen(a) {
    return invoke("plugin:window|set_fullscreen", { label: this.label, value: a });
  }
  async setSimpleFullscreen(a) {
    return invoke("plugin:window|set_simple_fullscreen", { label: this.label, value: a });
  }
  async setFocus() {
    return invoke("plugin:window|set_focus", { label: this.label });
  }
  async setFocusable(a) {
    return invoke("plugin:window|set_focusable", { label: this.label, value: a });
  }
  async setIcon(a) {
    return invoke("plugin:window|set_icon", { label: this.label, value: transformImage(a) });
  }
  async setSkipTaskbar(a) {
    return invoke("plugin:window|set_skip_taskbar", { label: this.label, value: a });
  }
  async setCursorGrab(a) {
    return invoke("plugin:window|set_cursor_grab", { label: this.label, value: a });
  }
  async setCursorVisible(a) {
    return invoke("plugin:window|set_cursor_visible", { label: this.label, value: a });
  }
  async setCursorIcon(a) {
    return invoke("plugin:window|set_cursor_icon", { label: this.label, value: a });
  }
  async setBackgroundColor(a) {
    return invoke("plugin:window|set_background_color", { color: a });
  }
  async setCursorPosition(a) {
    return invoke("plugin:window|set_cursor_position", { label: this.label, value: a instanceof Position ? a : new Position(a) });
  }
  async setIgnoreCursorEvents(a) {
    return invoke("plugin:window|set_ignore_cursor_events", { label: this.label, value: a });
  }
  async startDragging() {
    return invoke("plugin:window|start_dragging", { label: this.label });
  }
  async startResizeDragging(a) {
    return invoke("plugin:window|start_resize_dragging", { label: this.label, value: a });
  }
  async setBadgeCount(a) {
    return invoke("plugin:window|set_badge_count", { label: this.label, value: a });
  }
  async setBadgeLabel(a) {
    return invoke("plugin:window|set_badge_label", { label: this.label, value: a });
  }
  async setOverlayIcon(a) {
    return invoke("plugin:window|set_overlay_icon", { label: this.label, value: a ? transformImage(a) : void 0 });
  }
  async setProgressBar(a) {
    return invoke("plugin:window|set_progress_bar", { label: this.label, value: a });
  }
  async setVisibleOnAllWorkspaces(a) {
    return invoke("plugin:window|set_visible_on_all_workspaces", { label: this.label, value: a });
  }
  async setTitleBarStyle(a) {
    return invoke("plugin:window|set_title_bar_style", { label: this.label, value: a });
  }
  async setTheme(a) {
    return invoke("plugin:window|set_theme", { label: this.label, value: a });
  }
  async onResized(a) {
    return this.listen(TauriEvent.WINDOW_RESIZED, (i) => {
      i.payload = new PhysicalSize(i.payload), a(i);
    });
  }
  async onMoved(a) {
    return this.listen(TauriEvent.WINDOW_MOVED, (i) => {
      i.payload = new PhysicalPosition(i.payload), a(i);
    });
  }
  async onCloseRequested(a) {
    return this.listen(TauriEvent.WINDOW_CLOSE_REQUESTED, async (i) => {
      const r = new CloseRequestedEvent(i);
      await a(r), r.isPreventDefault() || await this.destroy();
    });
  }
  async onDragDropEvent(a) {
    const i = await this.listen(TauriEvent.DRAG_ENTER, (g) => {
      a({ ...g, payload: { type: "enter", paths: g.payload.paths, position: new PhysicalPosition(g.payload.position) } });
    }), r = await this.listen(TauriEvent.DRAG_OVER, (g) => {
      a({ ...g, payload: { type: "over", position: new PhysicalPosition(g.payload.position) } });
    }), f = await this.listen(TauriEvent.DRAG_DROP, (g) => {
      a({ ...g, payload: { type: "drop", paths: g.payload.paths, position: new PhysicalPosition(g.payload.position) } });
    }), b = await this.listen(TauriEvent.DRAG_LEAVE, (g) => {
      a({ ...g, payload: { type: "leave" } });
    });
    return () => {
      i(), f(), r(), b();
    };
  }
  async onFocusChanged(a) {
    const i = await this.listen(TauriEvent.WINDOW_FOCUS, (f) => {
      a({ ...f, payload: true });
    }), r = await this.listen(TauriEvent.WINDOW_BLUR, (f) => {
      a({ ...f, payload: false });
    });
    return () => {
      i(), r();
    };
  }
  async onScaleChanged(a) {
    return this.listen(TauriEvent.WINDOW_SCALE_FACTOR_CHANGED, a);
  }
  async onThemeChanged(a) {
    return this.listen(TauriEvent.WINDOW_THEME_CHANGED, a);
  }
};
var BackgroundThrottlingPolicy;
(function(n) {
  n.Disabled = "disabled", n.Throttle = "throttle", n.Suspend = "suspend";
})(BackgroundThrottlingPolicy || (BackgroundThrottlingPolicy = {}));
var ScrollBarStyle;
(function(n) {
  n.Default = "default", n.FluentOverlay = "fluentOverlay";
})(ScrollBarStyle || (ScrollBarStyle = {}));
var Effect;
(function(n) {
  n.AppearanceBased = "appearanceBased", n.Light = "light", n.Dark = "dark", n.MediumLight = "mediumLight", n.UltraDark = "ultraDark", n.Titlebar = "titlebar", n.Selection = "selection", n.Menu = "menu", n.Popover = "popover", n.Sidebar = "sidebar", n.HeaderView = "headerView", n.Sheet = "sheet", n.WindowBackground = "windowBackground", n.HudWindow = "hudWindow", n.FullScreenUI = "fullScreenUI", n.Tooltip = "tooltip", n.ContentBackground = "contentBackground", n.UnderWindowBackground = "underWindowBackground", n.UnderPageBackground = "underPageBackground", n.Mica = "mica", n.Blur = "blur", n.Acrylic = "acrylic", n.Tabbed = "tabbed", n.TabbedDark = "tabbedDark", n.TabbedLight = "tabbedLight";
})(Effect || (Effect = {}));
var EffectState;
(function(n) {
  n.FollowsWindowActiveState = "followsWindowActiveState", n.Active = "active", n.Inactive = "inactive";
})(EffectState || (EffectState = {}));
function mapMonitor(n) {
  return n === null ? null : { name: n.name, scaleFactor: n.scaleFactor, position: new PhysicalPosition(n.position), size: new PhysicalSize(n.size), workArea: { position: new PhysicalPosition(n.workArea.position), size: new PhysicalSize(n.workArea.size) } };
}
async function currentMonitor() {
  return invoke("plugin:window|current_monitor").then(mapMonitor);
}
async function primaryMonitor() {
  return invoke("plugin:window|primary_monitor").then(mapMonitor);
}
async function monitorFromPoint(n, a) {
  return invoke("plugin:window|monitor_from_point", { x: n, y: a }).then(mapMonitor);
}
async function availableMonitors() {
  return invoke("plugin:window|available_monitors").then((n) => n.map(mapMonitor));
}
async function cursorPosition() {
  return invoke("plugin:window|cursor_position").then((n) => new PhysicalPosition(n));
}
const window$1 = Object.freeze(Object.defineProperty({ __proto__: null, CloseRequestedEvent, get Effect() {
  return Effect;
}, get EffectState() {
  return EffectState;
}, LogicalPosition, LogicalSize, PhysicalPosition, PhysicalSize, get ProgressBarStatus() {
  return ProgressBarStatus;
}, get UserAttentionType() {
  return UserAttentionType;
}, Window: Window$1, availableMonitors, currentMonitor, cursorPosition, getAllWindows, getCurrentWindow, monitorFromPoint, primaryMonitor }, Symbol.toStringTag, { value: "Module" }));
function detectTauri$1() {
  return !!(window.__TAURI_INTERNALS__ || window.__TAURI__);
}
async function fetchChrome() {
  if (detectTauri$1()) try {
    return await invoke("get_ui_chrome");
  } catch {
    return null;
  }
  try {
    const a = (await __vitePreload(() => Promise.resolve().then(() => isometric_game), void 0)).get_ui_chrome_json;
    if (typeof a != "function") return null;
    const i = a();
    return i ? JSON.parse(i) : null;
  } catch {
    return null;
  }
}
function DragBar() {
  const [n, a] = reactExports.useState(false), i = detectTauri$1();
  if (reactExports.useEffect(() => {
    if (!i) return;
    let b = false;
    const g = async () => {
      if (b) return;
      const y = await fetchChrome();
      b || a(!!y && (y.phase === 0 || y.settings_open || y.overlay_open));
    };
    g();
    const h = setInterval(() => void g(), 500);
    return () => {
      b = true, clearInterval(h);
    };
  }, [i]), !i || !n) return null;
  const r = (b) => {
    b.button === 0 && (b.preventDefault(), b.stopPropagation(), getCurrentWindow().startDragging().catch((g) => console.warn("[drag] startDragging failed", g)));
  }, f = () => {
    const b = getCurrentWindow();
    b.isMaximized().then((g) => g ? b.unmaximize() : b.maximize()).catch((g) => console.warn("[drag] maximize toggle failed", g));
  };
  return jsxRuntimeExports.jsx("div", { "data-tauri-drag-region": true, onPointerDown: r, onDoubleClick: f, style: { position: "fixed", top: 0, left: 0, right: 0, height: 28, zIndex: 1e5, background: "rgba(0, 0, 0, 0.25)", borderBottom: "1px solid rgba(255, 255, 255, 0.08)", cursor: "grab", pointerEvents: "auto", display: "flex", alignItems: "center", justifyContent: "center", color: "#a89878", fontFamily: "monospace", fontSize: 10, userSelect: "none", WebkitUserSelect: "none" }, children: "drag to move" });
}
function atomics_wait_async(n, a, i) {
  return Atomics.waitAsync(n, a, i);
}
function wait_result_async(n) {
  return n.async;
}
function wait_result_value(n) {
  return n.value;
}
function dispatch_action(n, a) {
  const i = passStringToWasm0(a, wasm.__wbindgen_export, wasm.__wbindgen_export2), r = WASM_VECTOR_LEN;
  wasm.dispatch_action(n, i, r);
}
function get_chat_log_json() {
  let n, a;
  try {
    const f = wasm.__wbindgen_add_to_stack_pointer(-16);
    wasm.get_chat_log_json(f);
    var i = getDataViewMemory0().getInt32(f + 0, true), r = getDataViewMemory0().getInt32(f + 4, true);
    return n = i, a = r, getStringFromWasm0(i, r);
  } finally {
    wasm.__wbindgen_add_to_stack_pointer(16), wasm.__wbindgen_export4(n, a, 1);
  }
}
function get_fps() {
  return wasm.get_fps() >>> 0;
}
function get_hovered_object_json() {
  try {
    const i = wasm.__wbindgen_add_to_stack_pointer(-16);
    wasm.get_hovered_object_json(i);
    var n = getDataViewMemory0().getInt32(i + 0, true), a = getDataViewMemory0().getInt32(i + 4, true);
    let r;
    return n !== 0 && (r = getStringFromWasm0(n, a).slice(), wasm.__wbindgen_export4(n, a * 1, 1)), r;
  } finally {
    wasm.__wbindgen_add_to_stack_pointer(16);
  }
}
function get_object_registry_json() {
  try {
    const i = wasm.__wbindgen_add_to_stack_pointer(-16);
    wasm.get_object_registry_json(i);
    var n = getDataViewMemory0().getInt32(i + 0, true), a = getDataViewMemory0().getInt32(i + 4, true);
    let r;
    return n !== 0 && (r = getStringFromWasm0(n, a).slice(), wasm.__wbindgen_export4(n, a * 1, 1)), r;
  } finally {
    wasm.__wbindgen_add_to_stack_pointer(16);
  }
}
function get_online_status() {
  return wasm.get_online_status() !== 0;
}
function get_player_state_json() {
  let n, a;
  try {
    const f = wasm.__wbindgen_add_to_stack_pointer(-16);
    wasm.get_player_state_json(f);
    var i = getDataViewMemory0().getInt32(f + 0, true), r = getDataViewMemory0().getInt32(f + 4, true);
    return n = i, a = r, getStringFromWasm0(i, r);
  } finally {
    wasm.__wbindgen_add_to_stack_pointer(16), wasm.__wbindgen_export4(n, a, 1);
  }
}
function get_selected_object_json() {
  try {
    const i = wasm.__wbindgen_add_to_stack_pointer(-16);
    wasm.get_selected_object_json(i);
    var n = getDataViewMemory0().getInt32(i + 0, true), a = getDataViewMemory0().getInt32(i + 4, true);
    let r;
    return n !== 0 && (r = getStringFromWasm0(n, a).slice(), wasm.__wbindgen_export4(n, a * 1, 1)), r;
  } finally {
    wasm.__wbindgen_add_to_stack_pointer(16);
  }
}
function get_signin_state_json() {
  let n, a;
  try {
    const f = wasm.__wbindgen_add_to_stack_pointer(-16);
    wasm.get_signin_state_json(f);
    var i = getDataViewMemory0().getInt32(f + 0, true), r = getDataViewMemory0().getInt32(f + 4, true);
    return n = i, a = r, getStringFromWasm0(i, r);
  } finally {
    wasm.__wbindgen_add_to_stack_pointer(16), wasm.__wbindgen_export4(n, a, 1);
  }
}
function get_ui_chrome_json() {
  let n, a;
  try {
    const f = wasm.__wbindgen_add_to_stack_pointer(-16);
    wasm.get_ui_chrome_json(f);
    var i = getDataViewMemory0().getInt32(f + 0, true), r = getDataViewMemory0().getInt32(f + 4, true);
    return n = i, a = r, getStringFromWasm0(i, r);
  } finally {
    wasm.__wbindgen_add_to_stack_pointer(16), wasm.__wbindgen_export4(n, a, 1);
  }
}
function go_online(n, a) {
  const i = passStringToWasm0(n, wasm.__wbindgen_export, wasm.__wbindgen_export2), r = WASM_VECTOR_LEN, f = passStringToWasm0(a, wasm.__wbindgen_export, wasm.__wbindgen_export2), b = WASM_VECTOR_LEN;
  wasm.go_online(i, r, f, b);
}
function greet(n) {
  let a, i;
  try {
    const b = wasm.__wbindgen_add_to_stack_pointer(-16), g = passStringToWasm0(n, wasm.__wbindgen_export, wasm.__wbindgen_export2), h = WASM_VECTOR_LEN;
    wasm.greet(b, g, h);
    var r = getDataViewMemory0().getInt32(b + 0, true), f = getDataViewMemory0().getInt32(b + 4, true);
    return a = r, i = f, getStringFromWasm0(r, f);
  } finally {
    wasm.__wbindgen_add_to_stack_pointer(16), wasm.__wbindgen_export4(a, i, 1);
  }
}
function send_chat(n) {
  const a = passStringToWasm0(n, wasm.__wbindgen_export, wasm.__wbindgen_export2), i = WASM_VECTOR_LEN;
  return wasm.send_chat(a, i) !== 0;
}
function set_signed_in(n) {
  const a = passStringToWasm0(n, wasm.__wbindgen_export, wasm.__wbindgen_export2), i = WASM_VECTOR_LEN;
  wasm.set_signed_in(a, i);
}
function set_username(n) {
  const a = passStringToWasm0(n, wasm.__wbindgen_export, wasm.__wbindgen_export2), i = WASM_VECTOR_LEN;
  wasm.set_username(a, i);
}
function wasm_main() {
  wasm.wasm_main();
}
function worker_count() {
  return wasm.worker_count() >>> 0;
}
function worker_entry_point() {
  wasm.worker_entry_point();
}
function __wbg_get_imports(memory) {
  const import0 = { __proto__: null, __wbg_Error_83742b46f01ce22d: function(n, a) {
    const i = Error(getStringFromWasm0(n, a));
    return addHeapObject(i);
  }, __wbg_String_8564e559799eccda: function(n, a) {
    const i = String(getObject(a)), r = passStringToWasm0(i, wasm.__wbindgen_export, wasm.__wbindgen_export2), f = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(n + 4, f, true), getDataViewMemory0().setInt32(n + 0, r, true);
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
    const i = getObject(a), r = typeof i == "bigint" ? i : void 0;
    getDataViewMemory0().setBigInt64(n + 8, isLikeNone(r) ? BigInt(0) : r, true), getDataViewMemory0().setInt32(n + 0, !isLikeNone(r), true);
  }, __wbg___wbindgen_boolean_get_c0f3f60bac5a78d1: function(n) {
    const a = getObject(n), i = typeof a == "boolean" ? a : void 0;
    return isLikeNone(i) ? 16777215 : i ? 1 : 0;
  }, __wbg___wbindgen_debug_string_5398f5bb970e0daa: function(n, a) {
    const i = debugString(getObject(a)), r = passStringToWasm0(i, wasm.__wbindgen_export, wasm.__wbindgen_export2), f = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(n + 4, f, true), getDataViewMemory0().setInt32(n + 0, r, true);
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
    const i = getObject(a), r = typeof i == "number" ? i : void 0;
    getDataViewMemory0().setFloat64(n + 8, isLikeNone(r) ? 0 : r, true), getDataViewMemory0().setInt32(n + 0, !isLikeNone(r), true);
  }, __wbg___wbindgen_rethrow_5d3a9250cec92549: function(n) {
    throw takeObject(n);
  }, __wbg___wbindgen_string_get_395e606bd0ee4427: function(n, a) {
    const i = getObject(a), r = typeof i == "string" ? i : void 0;
    var f = isLikeNone(r) ? 0 : passStringToWasm0(r, wasm.__wbindgen_export, wasm.__wbindgen_export2), b = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(n + 4, b, true), getDataViewMemory0().setInt32(n + 0, f, true);
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
    return handleError(function(n, a, i, r) {
      getObject(n).addEventListener(getStringFromWasm0(a, i), getObject(r));
    }, arguments);
  }, __wbg_addListener_af610a227738fed8: function() {
    return handleError(function(n, a) {
      getObject(n).addListener(getObject(a));
    }, arguments);
  }, __wbg_altKey_7f2c3a24bf5420ae: function(n) {
    return getObject(n).altKey;
  }, __wbg_altKey_a8e58d65866de029: function(n) {
    return getObject(n).altKey;
  }, __wbg_animate_8f41e2f47c7d04ab: function(n, a, i) {
    const r = getObject(n).animate(getObject(a), getObject(i));
    return addHeapObject(r);
  }, __wbg_appendChild_8cb157b6ec5612a6: function() {
    return handleError(function(n, a) {
      const i = getObject(n).appendChild(getObject(a));
      return addHeapObject(i);
    }, arguments);
  }, __wbg_arrayBuffer_eb8e9ca620af2a19: function() {
    return handleError(function(n) {
      const a = getObject(n).arrayBuffer();
      return addHeapObject(a);
    }, arguments);
  }, __wbg_async_8532fa2513360fbc: function(n) {
    return getObject(n).async;
  }, __wbg_async_b33e4cb28c6b2093: function(n) {
    return getObject(n).async;
  }, __wbg_atomics_wait_async_a11d741af1e77056: function(n, a, i) {
    const r = atomics_wait_async(getObject(n), a >>> 0, i);
    return addHeapObject(r);
  }, __wbg_attachShader_6426e8576a115345: function(n, a, i) {
    getObject(n).attachShader(getObject(a), getObject(i));
  }, __wbg_attachShader_e557f37438249ff7: function(n, a, i) {
    getObject(n).attachShader(getObject(a), getObject(i));
  }, __wbg_axes_4ba58f8779c5d176: function(n) {
    const a = getObject(n).axes;
    return addHeapObject(a);
  }, __wbg_beginComputePass_d7b46482cf2ed824: function(n, a) {
    const i = getObject(n).beginComputePass(getObject(a));
    return addHeapObject(i);
  }, __wbg_beginQuery_ac2ef47e00ec594a: function(n, a, i) {
    getObject(n).beginQuery(a >>> 0, getObject(i));
  }, __wbg_beginRenderPass_373f34636d157c43: function() {
    return handleError(function(n, a) {
      const i = getObject(n).beginRenderPass(getObject(a));
      return addHeapObject(i);
    }, arguments);
  }, __wbg_bindAttribLocation_1d976e3bcc954adb: function(n, a, i, r, f) {
    getObject(n).bindAttribLocation(getObject(a), i >>> 0, getStringFromWasm0(r, f));
  }, __wbg_bindAttribLocation_8791402cc151e914: function(n, a, i, r, f) {
    getObject(n).bindAttribLocation(getObject(a), i >>> 0, getStringFromWasm0(r, f));
  }, __wbg_bindBufferRange_469c3643c2099003: function(n, a, i, r, f, b) {
    getObject(n).bindBufferRange(a >>> 0, i >>> 0, getObject(r), f, b);
  }, __wbg_bindBuffer_142694a9732bc098: function(n, a, i) {
    getObject(n).bindBuffer(a >>> 0, getObject(i));
  }, __wbg_bindBuffer_d2a4f6cfb33336fb: function(n, a, i) {
    getObject(n).bindBuffer(a >>> 0, getObject(i));
  }, __wbg_bindFramebuffer_4643a12ca1c72776: function(n, a, i) {
    getObject(n).bindFramebuffer(a >>> 0, getObject(i));
  }, __wbg_bindFramebuffer_fdc7c38f1c700e64: function(n, a, i) {
    getObject(n).bindFramebuffer(a >>> 0, getObject(i));
  }, __wbg_bindRenderbuffer_91db2fc67c1f0115: function(n, a, i) {
    getObject(n).bindRenderbuffer(a >>> 0, getObject(i));
  }, __wbg_bindRenderbuffer_e6cfc20b6ebcf605: function(n, a, i) {
    getObject(n).bindRenderbuffer(a >>> 0, getObject(i));
  }, __wbg_bindSampler_be3a05e88cecae98: function(n, a, i) {
    getObject(n).bindSampler(a >>> 0, getObject(i));
  }, __wbg_bindTexture_6a0892cd752b41d9: function(n, a, i) {
    getObject(n).bindTexture(a >>> 0, getObject(i));
  }, __wbg_bindTexture_6e7e157d0aabe457: function(n, a, i) {
    getObject(n).bindTexture(a >>> 0, getObject(i));
  }, __wbg_bindVertexArrayOES_082b0791772327fa: function(n, a) {
    getObject(n).bindVertexArrayOES(getObject(a));
  }, __wbg_bindVertexArray_c307251f3ff61930: function(n, a) {
    getObject(n).bindVertexArray(getObject(a));
  }, __wbg_blendColor_b4c7d8333af4876d: function(n, a, i, r, f) {
    getObject(n).blendColor(a, i, r, f);
  }, __wbg_blendColor_c2771aead110c867: function(n, a, i, r, f) {
    getObject(n).blendColor(a, i, r, f);
  }, __wbg_blendEquationSeparate_b08aba1c715cb265: function(n, a, i) {
    getObject(n).blendEquationSeparate(a >>> 0, i >>> 0);
  }, __wbg_blendEquationSeparate_f16ada84ba672878: function(n, a, i) {
    getObject(n).blendEquationSeparate(a >>> 0, i >>> 0);
  }, __wbg_blendEquation_46367a891604b604: function(n, a) {
    getObject(n).blendEquation(a >>> 0);
  }, __wbg_blendEquation_c353d94b097007e5: function(n, a) {
    getObject(n).blendEquation(a >>> 0);
  }, __wbg_blendFuncSeparate_6aae138b81d75b47: function(n, a, i, r, f) {
    getObject(n).blendFuncSeparate(a >>> 0, i >>> 0, r >>> 0, f >>> 0);
  }, __wbg_blendFuncSeparate_8c91c200b1a72e4b: function(n, a, i, r, f) {
    getObject(n).blendFuncSeparate(a >>> 0, i >>> 0, r >>> 0, f >>> 0);
  }, __wbg_blendFunc_2e98c5f57736e5f3: function(n, a, i) {
    getObject(n).blendFunc(a >>> 0, i >>> 0);
  }, __wbg_blendFunc_4ce0991003a9468e: function(n, a, i) {
    getObject(n).blendFunc(a >>> 0, i >>> 0);
  }, __wbg_blitFramebuffer_c1a68feaca974c87: function(n, a, i, r, f, b, g, h, y, w, z) {
    getObject(n).blitFramebuffer(a, i, r, f, b, g, h, y, w >>> 0, z >>> 0);
  }, __wbg_blockSize_5871fe73cc8dcba0: function(n) {
    return getObject(n).blockSize;
  }, __wbg_body_5eb99e7257e5ae34: function(n) {
    const a = getObject(n).body;
    return isLikeNone(a) ? 0 : addHeapObject(a);
  }, __wbg_brand_3bc196a43eceb8af: function(n, a) {
    const i = getObject(a).brand, r = passStringToWasm0(i, wasm.__wbindgen_export, wasm.__wbindgen_export2), f = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(n + 4, f, true), getDataViewMemory0().setInt32(n + 0, r, true);
  }, __wbg_brands_b7dcf262485c3e7c: function(n) {
    const a = getObject(n).brands;
    return addHeapObject(a);
  }, __wbg_bufferData_730b629ba3f6824f: function(n, a, i, r) {
    getObject(n).bufferData(a >>> 0, i, r >>> 0);
  }, __wbg_bufferData_d20232e3d5dcdc62: function(n, a, i, r) {
    getObject(n).bufferData(a >>> 0, getObject(i), r >>> 0);
  }, __wbg_bufferData_d3bd8c69ff4b7254: function(n, a, i, r) {
    getObject(n).bufferData(a >>> 0, getObject(i), r >>> 0);
  }, __wbg_bufferData_fb2d946faa09a60b: function(n, a, i, r) {
    getObject(n).bufferData(a >>> 0, i, r >>> 0);
  }, __wbg_bufferSubData_3fcefd4648de39b5: function(n, a, i, r) {
    getObject(n).bufferSubData(a >>> 0, i, getObject(r));
  }, __wbg_bufferSubData_7b112eb88657e7c0: function(n, a, i, r) {
    getObject(n).bufferSubData(a >>> 0, i, getObject(r));
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
    return handleError(function(n, a, i) {
      const r = getObject(n).call(getObject(a), getObject(i));
      return addHeapObject(r);
    }, arguments);
  }, __wbg_call_e133b57c9155d22c: function() {
    return handleError(function(n, a) {
      const i = getObject(n).call(getObject(a));
      return addHeapObject(i);
    }, arguments);
  }, __wbg_call_f858478a02f9600f: function() {
    return handleError(function(n, a, i, r, f) {
      const b = getObject(n).call(getObject(a), getObject(i), getObject(r), getObject(f));
      return addHeapObject(b);
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
    const i = getObject(n).catch(getObject(a));
    return addHeapObject(i);
  }, __wbg_clearBuffer_0439daeb4579be77: function(n, a, i) {
    getObject(n).clearBuffer(getObject(a), i);
  }, __wbg_clearBuffer_3de757fe2da3e161: function(n, a, i, r) {
    getObject(n).clearBuffer(getObject(a), i, r);
  }, __wbg_clearBufferfv_7bc3e789059fd29b: function(n, a, i, r, f) {
    getObject(n).clearBufferfv(a >>> 0, i, getArrayF32FromWasm0(r, f));
  }, __wbg_clearBufferiv_050b376a7480ef9c: function(n, a, i, r, f) {
    getObject(n).clearBufferiv(a >>> 0, i, getArrayI32FromWasm0(r, f));
  }, __wbg_clearBufferuiv_d75635e80261ea93: function(n, a, i, r, f) {
    getObject(n).clearBufferuiv(a >>> 0, i, getArrayU32FromWasm0(r, f));
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
  }, __wbg_clientWaitSync_5402aac488fc18bb: function(n, a, i, r) {
    return getObject(n).clientWaitSync(getObject(a), i >>> 0, r >>> 0);
  }, __wbg_close_08da3e8ce8a35dc2: function(n, a) {
    getObject(n).close(getObject(a));
  }, __wbg_close_87218c1c5fa30509: function() {
    return handleError(function(n) {
      const a = getObject(n).close();
      return addHeapObject(a);
    }, arguments);
  }, __wbg_close_a86fff250f8aa14f: function() {
    return handleError(function(n, a, i, r) {
      getObject(n).close(a, getStringFromWasm0(i, r));
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
    const i = getObject(a).code, r = passStringToWasm0(i, wasm.__wbindgen_export, wasm.__wbindgen_export2), f = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(n + 4, f, true), getDataViewMemory0().setInt32(n + 0, r, true);
  }, __wbg_code_aea376e2d265a64f: function(n) {
    return getObject(n).code;
  }, __wbg_colorMask_b053114f7da42448: function(n, a, i, r, f) {
    getObject(n).colorMask(a !== 0, i !== 0, r !== 0, f !== 0);
  }, __wbg_colorMask_b47840e05b5f8181: function(n, a, i, r, f) {
    getObject(n).colorMask(a !== 0, i !== 0, r !== 0, f !== 0);
  }, __wbg_compileShader_623a1051cf49494b: function(n, a) {
    getObject(n).compileShader(getObject(a));
  }, __wbg_compileShader_7ca66245c2798601: function(n, a) {
    getObject(n).compileShader(getObject(a));
  }, __wbg_compressedTexSubImage2D_593058a6f5aca176: function(n, a, i, r, f, b, g, h, y) {
    getObject(n).compressedTexSubImage2D(a >>> 0, i, r, f, b, g, h >>> 0, getObject(y));
  }, __wbg_compressedTexSubImage2D_aab12b65159c282e: function(n, a, i, r, f, b, g, h, y) {
    getObject(n).compressedTexSubImage2D(a >>> 0, i, r, f, b, g, h >>> 0, getObject(y));
  }, __wbg_compressedTexSubImage2D_f3c4ae95ef9d2420: function(n, a, i, r, f, b, g, h, y, w) {
    getObject(n).compressedTexSubImage2D(a >>> 0, i, r, f, b, g, h >>> 0, y, w);
  }, __wbg_compressedTexSubImage3D_77a6ab77487aa211: function(n, a, i, r, f, b, g, h, y, w, z, R) {
    getObject(n).compressedTexSubImage3D(a >>> 0, i, r, f, b, g, h, y, w >>> 0, z, R);
  }, __wbg_compressedTexSubImage3D_95f64742aae944b8: function(n, a, i, r, f, b, g, h, y, w, z) {
    getObject(n).compressedTexSubImage3D(a >>> 0, i, r, f, b, g, h, y, w >>> 0, getObject(z));
  }, __wbg_configure_b39d6ec9527208fd: function() {
    return handleError(function(n, a) {
      getObject(n).configure(getObject(a));
    }, arguments);
  }, __wbg_connect_3ca85e8e3b8d9828: function() {
    return handleError(function(n, a) {
      const i = getObject(n).connect(getObject(a));
      return addHeapObject(i);
    }, arguments);
  }, __wbg_connected_8628961b3a47d6ce: function(n) {
    return getObject(n).connected;
  }, __wbg_contains_6b23671a193f58e5: function(n, a) {
    return getObject(n).contains(getObject(a));
  }, __wbg_contentRect_7047bba46353f683: function(n) {
    const a = getObject(n).contentRect;
    return addHeapObject(a);
  }, __wbg_copyBufferSubData_aaeed526e555f0d1: function(n, a, i, r, f, b) {
    getObject(n).copyBufferSubData(a >>> 0, i >>> 0, r, f, b);
  }, __wbg_copyBufferToBuffer_293ca0a0d09a2280: function() {
    return handleError(function(n, a, i, r, f) {
      getObject(n).copyBufferToBuffer(getObject(a), i, getObject(r), f);
    }, arguments);
  }, __wbg_copyBufferToBuffer_321eb0198eb9c268: function() {
    return handleError(function(n, a, i, r, f, b) {
      getObject(n).copyBufferToBuffer(getObject(a), i, getObject(r), f, b);
    }, arguments);
  }, __wbg_copyExternalImageToTexture_b947b4c23a5d5380: function() {
    return handleError(function(n, a, i, r) {
      getObject(n).copyExternalImageToTexture(getObject(a), getObject(i), getObject(r));
    }, arguments);
  }, __wbg_copyTexSubImage2D_08a10bcd45b88038: function(n, a, i, r, f, b, g, h, y) {
    getObject(n).copyTexSubImage2D(a >>> 0, i, r, f, b, g, h, y);
  }, __wbg_copyTexSubImage2D_b9a10d000c616b3e: function(n, a, i, r, f, b, g, h, y) {
    getObject(n).copyTexSubImage2D(a >>> 0, i, r, f, b, g, h, y);
  }, __wbg_copyTexSubImage3D_7fcdf7c85bc308a5: function(n, a, i, r, f, b, g, h, y, w) {
    getObject(n).copyTexSubImage3D(a >>> 0, i, r, f, b, g, h, y, w);
  }, __wbg_copyTextureToBuffer_f5501895b13306e1: function() {
    return handleError(function(n, a, i, r) {
      getObject(n).copyTextureToBuffer(getObject(a), getObject(i), getObject(r));
    }, arguments);
  }, __wbg_copyTextureToTexture_facf8ecdb9559cb0: function() {
    return handleError(function(n, a, i, r) {
      getObject(n).copyTextureToTexture(getObject(a), getObject(i), getObject(r));
    }, arguments);
  }, __wbg_copyToChannel_9cc0d540c73436a4: function() {
    return handleError(function(n, a, i) {
      getObject(n).copyToChannel(getObject(a), i);
    }, arguments);
  }, __wbg_createBindGroupLayout_f5bb5a31b2ac11bf: function() {
    return handleError(function(n, a) {
      const i = getObject(n).createBindGroupLayout(getObject(a));
      return addHeapObject(i);
    }, arguments);
  }, __wbg_createBindGroup_2290306cfa413c74: function(n, a) {
    const i = getObject(n).createBindGroup(getObject(a));
    return addHeapObject(i);
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
      const i = getObject(n).createBuffer(getObject(a));
      return addHeapObject(i);
    }, arguments);
  }, __wbg_createBuffer_ed2bd7b52878b3fa: function() {
    return handleError(function(n, a, i, r) {
      const f = getObject(n).createBuffer(a >>> 0, i >>> 0, r);
      return addHeapObject(f);
    }, arguments);
  }, __wbg_createCommandEncoder_80578730e7314357: function(n, a) {
    const i = getObject(n).createCommandEncoder(getObject(a));
    return addHeapObject(i);
  }, __wbg_createComputePipeline_78a3fff4e7d451a8: function(n, a) {
    const i = getObject(n).createComputePipeline(getObject(a));
    return addHeapObject(i);
  }, __wbg_createElement_9b0aab265c549ded: function() {
    return handleError(function(n, a, i) {
      const r = getObject(n).createElement(getStringFromWasm0(a, i));
      return addHeapObject(r);
    }, arguments);
  }, __wbg_createFramebuffer_911d55689ff8358e: function(n) {
    const a = getObject(n).createFramebuffer();
    return isLikeNone(a) ? 0 : addHeapObject(a);
  }, __wbg_createFramebuffer_97d39363cdd9242a: function(n) {
    const a = getObject(n).createFramebuffer();
    return isLikeNone(a) ? 0 : addHeapObject(a);
  }, __wbg_createImageBitmap_46791779dcbfb789: function() {
    return handleError(function(n, a, i) {
      const r = getObject(n).createImageBitmap(getObject(a), getObject(i));
      return addHeapObject(r);
    }, arguments);
  }, __wbg_createIndex_323cb0213cc21d9b: function() {
    return handleError(function(n, a, i, r, f) {
      const b = getObject(n).createIndex(getStringFromWasm0(a, i), getObject(r), getObject(f));
      return addHeapObject(b);
    }, arguments);
  }, __wbg_createObjectStore_4709de9339ffc6c0: function() {
    return handleError(function(n, a, i, r) {
      const f = getObject(n).createObjectStore(getStringFromWasm0(a, i), getObject(r));
      return addHeapObject(f);
    }, arguments);
  }, __wbg_createObjectURL_f141426bcc1f70aa: function() {
    return handleError(function(n, a) {
      const i = URL.createObjectURL(getObject(a)), r = passStringToWasm0(i, wasm.__wbindgen_export, wasm.__wbindgen_export2), f = WASM_VECTOR_LEN;
      getDataViewMemory0().setInt32(n + 4, f, true), getDataViewMemory0().setInt32(n + 0, r, true);
    }, arguments);
  }, __wbg_createPipelineLayout_0ef251301bed0c34: function(n, a) {
    const i = getObject(n).createPipelineLayout(getObject(a));
    return addHeapObject(i);
  }, __wbg_createProgram_1fa32901e4db13cd: function(n) {
    const a = getObject(n).createProgram();
    return isLikeNone(a) ? 0 : addHeapObject(a);
  }, __wbg_createProgram_8eb14525e7fcffb8: function(n) {
    const a = getObject(n).createProgram();
    return isLikeNone(a) ? 0 : addHeapObject(a);
  }, __wbg_createQuerySet_9ae406d6d86026f6: function() {
    return handleError(function(n, a) {
      const i = getObject(n).createQuerySet(getObject(a));
      return addHeapObject(i);
    }, arguments);
  }, __wbg_createQuery_0f754c13ae341f39: function(n) {
    const a = getObject(n).createQuery();
    return isLikeNone(a) ? 0 : addHeapObject(a);
  }, __wbg_createRenderPipeline_f9f8aa23f50f8a9c: function() {
    return handleError(function(n, a) {
      const i = getObject(n).createRenderPipeline(getObject(a));
      return addHeapObject(i);
    }, arguments);
  }, __wbg_createRenderbuffer_69fb8c438e70e494: function(n) {
    const a = getObject(n).createRenderbuffer();
    return isLikeNone(a) ? 0 : addHeapObject(a);
  }, __wbg_createRenderbuffer_8847d6a81975caee: function(n) {
    const a = getObject(n).createRenderbuffer();
    return isLikeNone(a) ? 0 : addHeapObject(a);
  }, __wbg_createSampler_27c37a8245da51a4: function(n, a) {
    const i = getObject(n).createSampler(getObject(a));
    return addHeapObject(i);
  }, __wbg_createSampler_7bed7d46769be9a7: function(n) {
    const a = getObject(n).createSampler();
    return isLikeNone(a) ? 0 : addHeapObject(a);
  }, __wbg_createShaderModule_eb21a131dfb0d4dc: function(n, a) {
    const i = getObject(n).createShaderModule(getObject(a));
    return addHeapObject(i);
  }, __wbg_createShader_9ffc9dc1832608d7: function(n, a) {
    const i = getObject(n).createShader(a >>> 0);
    return isLikeNone(i) ? 0 : addHeapObject(i);
  }, __wbg_createShader_a00913b8c6489e6b: function(n, a) {
    const i = getObject(n).createShader(a >>> 0);
    return isLikeNone(i) ? 0 : addHeapObject(i);
  }, __wbg_createTexture_284160f981e0075f: function() {
    return handleError(function(n, a) {
      const i = getObject(n).createTexture(getObject(a));
      return addHeapObject(i);
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
      const i = getObject(n).createView(getObject(a));
      return addHeapObject(i);
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
  }, __wbg_debug_271c16e6de0bc226: function(n, a, i, r) {
    console.debug(getObject(n), getObject(a), getObject(i), getObject(r));
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
    return handleError(function(n, a, i) {
      getObject(n).deleteIndex(getStringFromWasm0(a, i));
    }, arguments);
  }, __wbg_deleteObjectStore_65401ab024ac08c1: function() {
    return handleError(function(n, a, i) {
      getObject(n).deleteObjectStore(getStringFromWasm0(a, i));
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
  }, __wbg_depthRange_b42d493a2b9258aa: function(n, a, i) {
    getObject(n).depthRange(a, i);
  }, __wbg_depthRange_ebba8110d3fe0332: function(n, a, i) {
    getObject(n).depthRange(a, i);
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
  }, __wbg_dispatchWorkgroupsIndirect_31170e3ef9951e18: function(n, a, i) {
    getObject(n).dispatchWorkgroupsIndirect(getObject(a), i);
  }, __wbg_dispatchWorkgroups_88dfc3f2209b9d74: function(n, a, i, r) {
    getObject(n).dispatchWorkgroups(a >>> 0, i >>> 0, r >>> 0);
  }, __wbg_document_c0320cd4183c6d9b: function(n) {
    const a = getObject(n).document;
    return isLikeNone(a) ? 0 : addHeapObject(a);
  }, __wbg_done_08ce71ee07e3bd17: function(n) {
    return getObject(n).done;
  }, __wbg_done_e8993c30afbbe414: function(n) {
    return getObject(n).done;
  }, __wbg_drawArraysInstancedANGLE_20ee4b8f67503b54: function(n, a, i, r, f) {
    getObject(n).drawArraysInstancedANGLE(a >>> 0, i, r, f);
  }, __wbg_drawArraysInstanced_13e40fca13079ade: function(n, a, i, r, f) {
    getObject(n).drawArraysInstanced(a >>> 0, i, r, f);
  }, __wbg_drawArrays_13005ccff75e4210: function(n, a, i, r) {
    getObject(n).drawArrays(a >>> 0, i, r);
  }, __wbg_drawArrays_c20dedf441392005: function(n, a, i, r) {
    getObject(n).drawArrays(a >>> 0, i, r);
  }, __wbg_drawBuffersWEBGL_5f9efe378355889a: function(n, a) {
    getObject(n).drawBuffersWEBGL(getObject(a));
  }, __wbg_drawBuffers_823c4881ba82dc9c: function(n, a) {
    getObject(n).drawBuffers(getObject(a));
  }, __wbg_drawElementsInstancedANGLE_e9170c6414853487: function(n, a, i, r, f, b) {
    getObject(n).drawElementsInstancedANGLE(a >>> 0, i, r >>> 0, f, b);
  }, __wbg_drawElementsInstanced_2e549060a77ba831: function(n, a, i, r, f, b) {
    getObject(n).drawElementsInstanced(a >>> 0, i, r >>> 0, f, b);
  }, __wbg_drawIndexedIndirect_1be586f18fe50ecf: function(n, a, i) {
    getObject(n).drawIndexedIndirect(getObject(a), i);
  }, __wbg_drawIndexed_a60a41b2b0ffdadf: function(n, a, i, r, f, b) {
    getObject(n).drawIndexed(a >>> 0, i >>> 0, r >>> 0, f, b >>> 0);
  }, __wbg_drawIndirect_74b596a2ff39cd46: function(n, a, i) {
    getObject(n).drawIndirect(getObject(a), i);
  }, __wbg_draw_bcc050d6677121b5: function(n, a, i, r, f) {
    getObject(n).draw(a >>> 0, i >>> 0, r >>> 0, f >>> 0);
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
  }, __wbg_error_1eece6b0039034ce: function(n, a, i, r) {
    console.error(getObject(n), getObject(a), getObject(i), getObject(r));
  }, __wbg_error_57ef6dadfcb01843: function(n) {
    const a = getObject(n).error;
    return isLikeNone(a) ? 0 : addHeapObject(a);
  }, __wbg_error_74898554122344a8: function() {
    return handleError(function(n) {
      const a = getObject(n).error;
      return isLikeNone(a) ? 0 : addHeapObject(a);
    }, arguments);
  }, __wbg_error_a6fa202b58aa1cd3: function(n, a) {
    let i, r;
    try {
      i = n, r = a, console.error(getStringFromWasm0(n, a));
    } finally {
      wasm.__wbindgen_export4(i, r, 1);
    }
  }, __wbg_error_cfce0f619500de52: function(n, a) {
    console.error(getObject(n), getObject(a));
  }, __wbg_eval_c311194bb27c7836: function() {
    return handleError(function(arg0, arg1) {
      const ret = eval(getStringFromWasm0(arg0, arg1));
      return addHeapObject(ret);
    }, arguments);
  }, __wbg_exec_203e2096c69172ee: function(n, a, i) {
    const r = getObject(n).exec(getStringFromWasm0(a, i));
    return isLikeNone(r) ? 0 : addHeapObject(r);
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
  }, __wbg_fenceSync_460953d9ad5fd31a: function(n, a, i) {
    const r = getObject(n).fenceSync(a >>> 0, i >>> 0);
    return isLikeNone(r) ? 0 : addHeapObject(r);
  }, __wbg_fetch_7b84bc2cce4c9b65: function(n, a, i) {
    const r = getObject(n).fetch(getStringFromWasm0(a, i));
    return addHeapObject(r);
  }, __wbg_fetch_e261f234f8b50660: function(n, a, i) {
    const r = getObject(n).fetch(getStringFromWasm0(a, i));
    return addHeapObject(r);
  }, __wbg_fetch_f8a611684c3b5fe5: function(n, a) {
    const i = getObject(n).fetch(getObject(a));
    return addHeapObject(i);
  }, __wbg_finish_073e2bc456a4b625: function(n) {
    const a = getObject(n).finish();
    return addHeapObject(a);
  }, __wbg_finish_e43b1b48427f2db0: function(n, a) {
    const i = getObject(n).finish(getObject(a));
    return addHeapObject(i);
  }, __wbg_flush_049a445c404024c2: function(n) {
    getObject(n).flush();
  }, __wbg_flush_c7dd5b1ae1447448: function(n) {
    getObject(n).flush();
  }, __wbg_focus_885197ce680db9e0: function() {
    return handleError(function(n) {
      getObject(n).focus();
    }, arguments);
  }, __wbg_framebufferRenderbuffer_7a2be23309166ad3: function(n, a, i, r, f) {
    getObject(n).framebufferRenderbuffer(a >>> 0, i >>> 0, r >>> 0, getObject(f));
  }, __wbg_framebufferRenderbuffer_d8c1d0b985bd3c51: function(n, a, i, r, f) {
    getObject(n).framebufferRenderbuffer(a >>> 0, i >>> 0, r >>> 0, getObject(f));
  }, __wbg_framebufferTexture2D_bf4d47f4027a3682: function(n, a, i, r, f, b) {
    getObject(n).framebufferTexture2D(a >>> 0, i >>> 0, r >>> 0, getObject(f), b);
  }, __wbg_framebufferTexture2D_e2f7d82e6707010e: function(n, a, i, r, f, b) {
    getObject(n).framebufferTexture2D(a >>> 0, i >>> 0, r >>> 0, getObject(f), b);
  }, __wbg_framebufferTextureLayer_01d5b9516636ccae: function(n, a, i, r, f, b) {
    getObject(n).framebufferTextureLayer(a >>> 0, i >>> 0, getObject(r), f, b);
  }, __wbg_framebufferTextureMultiviewOVR_336ea10e261ec5f6: function(n, a, i, r, f, b, g) {
    getObject(n).framebufferTextureMultiviewOVR(a >>> 0, i >>> 0, getObject(r), f, b, g);
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
  }, __wbg_getBufferSubData_cbabbb87d4c5c57d: function(n, a, i, r) {
    getObject(n).getBufferSubData(a >>> 0, i, getObject(r));
  }, __wbg_getCoalescedEvents_08e25b227866a984: function(n) {
    const a = getObject(n).getCoalescedEvents();
    return addHeapObject(a);
  }, __wbg_getCoalescedEvents_3e003f63d9ebbc05: function(n) {
    const a = getObject(n).getCoalescedEvents;
    return addHeapObject(a);
  }, __wbg_getComputedStyle_b12e52450a4be72c: function() {
    return handleError(function(n, a) {
      const i = getObject(n).getComputedStyle(getObject(a));
      return isLikeNone(i) ? 0 : addHeapObject(i);
    }, arguments);
  }, __wbg_getContext_07270456453ee7f5: function() {
    return handleError(function(n, a, i, r) {
      const f = getObject(n).getContext(getStringFromWasm0(a, i), getObject(r));
      return isLikeNone(f) ? 0 : addHeapObject(f);
    }, arguments);
  }, __wbg_getContext_794490fe04be926a: function() {
    return handleError(function(n, a, i, r) {
      const f = getObject(n).getContext(getStringFromWasm0(a, i), getObject(r));
      return isLikeNone(f) ? 0 : addHeapObject(f);
    }, arguments);
  }, __wbg_getContext_a9236f98f1f7fe7c: function() {
    return handleError(function(n, a, i) {
      const r = getObject(n).getContext(getStringFromWasm0(a, i));
      return isLikeNone(r) ? 0 : addHeapObject(r);
    }, arguments);
  }, __wbg_getContext_f04bf8f22dcb2d53: function() {
    return handleError(function(n, a, i) {
      const r = getObject(n).getContext(getStringFromWasm0(a, i));
      return isLikeNone(r) ? 0 : addHeapObject(r);
    }, arguments);
  }, __wbg_getCurrentTexture_7edbea16b438c9fc: function() {
    return handleError(function(n) {
      const a = getObject(n).getCurrentTexture();
      return addHeapObject(a);
    }, arguments);
  }, __wbg_getExtension_0b8543b0c6b3068d: function() {
    return handleError(function(n, a, i) {
      const r = getObject(n).getExtension(getStringFromWasm0(a, i));
      return isLikeNone(r) ? 0 : addHeapObject(r);
    }, arguments);
  }, __wbg_getGamepads_b179bcbe36d157bd: function() {
    return handleError(function(n) {
      const a = getObject(n).getGamepads();
      return addHeapObject(a);
    }, arguments);
  }, __wbg_getIndexedParameter_338c7c91cbabcf3e: function() {
    return handleError(function(n, a, i) {
      const r = getObject(n).getIndexedParameter(a >>> 0, i >>> 0);
      return addHeapObject(r);
    }, arguments);
  }, __wbg_getItem_a7cc1d4f154f2e6f: function() {
    return handleError(function(n, a, i, r) {
      const f = getObject(a).getItem(getStringFromWasm0(i, r));
      var b = isLikeNone(f) ? 0 : passStringToWasm0(f, wasm.__wbindgen_export, wasm.__wbindgen_export2), g = WASM_VECTOR_LEN;
      getDataViewMemory0().setInt32(n + 4, g, true), getDataViewMemory0().setInt32(n + 0, b, true);
    }, arguments);
  }, __wbg_getMappedRange_191c0084744858f0: function() {
    return handleError(function(n, a, i) {
      const r = getObject(n).getMappedRange(a, i);
      return addHeapObject(r);
    }, arguments);
  }, __wbg_getOwnPropertyDescriptor_afeb931addada534: function(n, a) {
    const i = Object.getOwnPropertyDescriptor(getObject(n), getObject(a));
    return addHeapObject(i);
  }, __wbg_getParameter_b1431cfde390c2fc: function() {
    return handleError(function(n, a) {
      const i = getObject(n).getParameter(a >>> 0);
      return addHeapObject(i);
    }, arguments);
  }, __wbg_getParameter_e634fa73b5e25287: function() {
    return handleError(function(n, a) {
      const i = getObject(n).getParameter(a >>> 0);
      return addHeapObject(i);
    }, arguments);
  }, __wbg_getPreferredCanvasFormat_56e30944cc798353: function(n) {
    const a = getObject(n).getPreferredCanvasFormat();
    return (__wbindgen_enum_GpuTextureFormat.indexOf(a) + 1 || 96) - 1;
  }, __wbg_getProgramInfoLog_50443ddea7475f57: function(n, a, i) {
    const r = getObject(a).getProgramInfoLog(getObject(i));
    var f = isLikeNone(r) ? 0 : passStringToWasm0(r, wasm.__wbindgen_export, wasm.__wbindgen_export2), b = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(n + 4, b, true), getDataViewMemory0().setInt32(n + 0, f, true);
  }, __wbg_getProgramInfoLog_e03efa51473d657e: function(n, a, i) {
    const r = getObject(a).getProgramInfoLog(getObject(i));
    var f = isLikeNone(r) ? 0 : passStringToWasm0(r, wasm.__wbindgen_export, wasm.__wbindgen_export2), b = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(n + 4, b, true), getDataViewMemory0().setInt32(n + 0, f, true);
  }, __wbg_getProgramParameter_46e2d49878b56edd: function(n, a, i) {
    const r = getObject(n).getProgramParameter(getObject(a), i >>> 0);
    return addHeapObject(r);
  }, __wbg_getProgramParameter_7d3bd54ec02de007: function(n, a, i) {
    const r = getObject(n).getProgramParameter(getObject(a), i >>> 0);
    return addHeapObject(r);
  }, __wbg_getPropertyValue_d2181532557839cf: function() {
    return handleError(function(n, a, i, r) {
      const f = getObject(a).getPropertyValue(getStringFromWasm0(i, r)), b = passStringToWasm0(f, wasm.__wbindgen_export, wasm.__wbindgen_export2), g = WASM_VECTOR_LEN;
      getDataViewMemory0().setInt32(n + 4, g, true), getDataViewMemory0().setInt32(n + 0, b, true);
    }, arguments);
  }, __wbg_getQueryParameter_5a3a2bd77e5f56bb: function(n, a, i) {
    const r = getObject(n).getQueryParameter(getObject(a), i >>> 0);
    return addHeapObject(r);
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
    const i = getObject(n).getReader(getObject(a));
    return addHeapObject(i);
  }, __wbg_getShaderInfoLog_22f9e8c90a52f38d: function(n, a, i) {
    const r = getObject(a).getShaderInfoLog(getObject(i));
    var f = isLikeNone(r) ? 0 : passStringToWasm0(r, wasm.__wbindgen_export, wasm.__wbindgen_export2), b = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(n + 4, b, true), getDataViewMemory0().setInt32(n + 0, f, true);
  }, __wbg_getShaderInfoLog_40c6a4ae67d82dde: function(n, a, i) {
    const r = getObject(a).getShaderInfoLog(getObject(i));
    var f = isLikeNone(r) ? 0 : passStringToWasm0(r, wasm.__wbindgen_export, wasm.__wbindgen_export2), b = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(n + 4, b, true), getDataViewMemory0().setInt32(n + 0, f, true);
  }, __wbg_getShaderParameter_46f64f7ca5d534db: function(n, a, i) {
    const r = getObject(n).getShaderParameter(getObject(a), i >>> 0);
    return addHeapObject(r);
  }, __wbg_getShaderParameter_82c275299b111f1b: function(n, a, i) {
    const r = getObject(n).getShaderParameter(getObject(a), i >>> 0);
    return addHeapObject(r);
  }, __wbg_getSupportedExtensions_a799751b74c3a674: function(n) {
    const a = getObject(n).getSupportedExtensions();
    return isLikeNone(a) ? 0 : addHeapObject(a);
  }, __wbg_getSupportedProfiles_e089393bebafd3b0: function(n) {
    const a = getObject(n).getSupportedProfiles();
    return isLikeNone(a) ? 0 : addHeapObject(a);
  }, __wbg_getSyncParameter_fbf70c60f5e3b271: function(n, a, i) {
    const r = getObject(n).getSyncParameter(getObject(a), i >>> 0);
    return addHeapObject(r);
  }, __wbg_getUniformBlockIndex_e483a4d166df9c2a: function(n, a, i, r) {
    return getObject(n).getUniformBlockIndex(getObject(a), getStringFromWasm0(i, r));
  }, __wbg_getUniformLocation_5eb08673afa04eee: function(n, a, i, r) {
    const f = getObject(n).getUniformLocation(getObject(a), getStringFromWasm0(i, r));
    return isLikeNone(f) ? 0 : addHeapObject(f);
  }, __wbg_getUniformLocation_90cdff44c2fceeb9: function(n, a, i, r) {
    const f = getObject(n).getUniformLocation(getObject(a), getStringFromWasm0(i, r));
    return isLikeNone(f) ? 0 : addHeapObject(f);
  }, __wbg_getWriter_aa227dc9da7cfa39: function() {
    return handleError(function(n) {
      const a = getObject(n).getWriter();
      return addHeapObject(a);
    }, arguments);
  }, __wbg_get_326e41e095fb2575: function() {
    return handleError(function(n, a) {
      const i = Reflect.get(getObject(n), getObject(a));
      return addHeapObject(i);
    }, arguments);
  }, __wbg_get_3ef1eba1850ade27: function() {
    return handleError(function(n, a) {
      const i = Reflect.get(getObject(n), getObject(a));
      return addHeapObject(i);
    }, arguments);
  }, __wbg_get_6ac8c8119f577720: function() {
    return handleError(function(n, a) {
      const i = getObject(n).get(getObject(a));
      return addHeapObject(i);
    }, arguments);
  }, __wbg_get_7873e3afa59bad00: function(n, a, i) {
    const r = getObject(a)[i >>> 0];
    var f = isLikeNone(r) ? 0 : passStringToWasm0(r, wasm.__wbindgen_export, wasm.__wbindgen_export2), b = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(n + 4, b, true), getDataViewMemory0().setInt32(n + 0, f, true);
  }, __wbg_get_a8ee5c45dabc1b3b: function(n, a) {
    const i = getObject(n)[a >>> 0];
    return addHeapObject(i);
  }, __wbg_get_c7546417fb0bec10: function(n, a) {
    const i = getObject(n)[a >>> 0];
    return isLikeNone(i) ? 0 : addHeapObject(i);
  }, __wbg_get_unchecked_329cfe50afab7352: function(n, a) {
    const i = getObject(n)[a >>> 0];
    return addHeapObject(i);
  }, __wbg_gpu_7c0927abcc96dd45: function(n) {
    const a = getObject(n).gpu;
    return addHeapObject(a);
  }, __wbg_hardwareConcurrency_a8e3f7c0d77df6d3: function(n) {
    return getObject(n).hardwareConcurrency;
  }, __wbg_has_926ef2ff40b308cf: function() {
    return handleError(function(n, a) {
      return Reflect.has(getObject(n), getObject(a));
    }, arguments);
  }, __wbg_has_abf74d2b4f3e578e: function(n, a, i) {
    return getObject(n).has(getStringFromWasm0(a, i));
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
      const i = getObject(a).hostname, r = passStringToWasm0(i, wasm.__wbindgen_export, wasm.__wbindgen_export2), f = WASM_VECTOR_LEN;
      getDataViewMemory0().setInt32(n + 4, f, true), getDataViewMemory0().setInt32(n + 0, r, true);
    }, arguments);
  }, __wbg_id_26bc2771d7af1b86: function(n, a) {
    const i = getObject(a).id, r = passStringToWasm0(i, wasm.__wbindgen_export, wasm.__wbindgen_export2), f = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(n + 4, f, true), getDataViewMemory0().setInt32(n + 0, r, true);
  }, __wbg_includes_9f81335525be01f9: function(n, a, i) {
    return getObject(n).includes(getObject(a), i);
  }, __wbg_indexNames_3a9be68017fb9405: function(n) {
    const a = getObject(n).indexNames;
    return addHeapObject(a);
  }, __wbg_index_4cc30c8b16093fd3: function(n) {
    return getObject(n).index;
  }, __wbg_index_f1b3b30c5d5af6fb: function() {
    return handleError(function(n, a, i) {
      const r = getObject(n).index(getStringFromWasm0(a, i));
      return addHeapObject(r);
    }, arguments);
  }, __wbg_info_0194681687b5ab04: function(n, a, i, r) {
    console.info(getObject(n), getObject(a), getObject(i), getObject(r));
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
    return handleError(function(n, a, i) {
      getObject(n).invalidateFramebuffer(a >>> 0, getObject(i));
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
    const i = getObject(a).key, r = passStringToWasm0(i, wasm.__wbindgen_export, wasm.__wbindgen_export2), f = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(n + 4, f, true), getDataViewMemory0().setInt32(n + 0, r, true);
  }, __wbg_label_0abc44bf8d3a3e99: function(n, a) {
    const i = getObject(a).label, r = passStringToWasm0(i, wasm.__wbindgen_export, wasm.__wbindgen_export2), f = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(n + 4, f, true), getDataViewMemory0().setInt32(n + 0, r, true);
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
  }, __wbg_log_0c201ade58bb55e1: function(n, a, i, r, f, b, g, h) {
    let y, w;
    try {
      y = n, w = a, console.log(getStringFromWasm0(n, a), getStringFromWasm0(i, r), getStringFromWasm0(f, b), getStringFromWasm0(g, h));
    } finally {
      wasm.__wbindgen_export4(y, w, 1);
    }
  }, __wbg_log_70972330cfc941dd: function(n, a, i, r) {
    console.log(getObject(n), getObject(a), getObject(i), getObject(r));
  }, __wbg_log_ce2c4456b290c5e7: function(n, a) {
    let i, r;
    try {
      i = n, r = a, console.log(getStringFromWasm0(n, a));
    } finally {
      wasm.__wbindgen_export4(i, r, 1);
    }
  }, __wbg_mapAsync_1be2f9e8f464f69e: function(n, a, i, r) {
    const f = getObject(n).mapAsync(a >>> 0, i, r);
    return addHeapObject(f);
  }, __wbg_mapping_c0470f8cd55cefc3: function(n) {
    const a = getObject(n).mapping;
    return (__wbindgen_enum_GamepadMappingType.indexOf(a) + 1 || 3) - 1;
  }, __wbg_mark_b4d943f3bc2d2404: function(n, a) {
    performance.mark(getStringFromWasm0(n, a));
  }, __wbg_matchMedia_b27489ec503ba2a5: function() {
    return handleError(function(n, a, i) {
      const r = getObject(n).matchMedia(getStringFromWasm0(a, i));
      return isLikeNone(r) ? 0 : addHeapObject(r);
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
    return handleError(function(n, a, i, r) {
      let f, b, g, h;
      try {
        f = n, b = a, g = i, h = r, performance.measure(getStringFromWasm0(n, a), getStringFromWasm0(i, r));
      } finally {
        wasm.__wbindgen_export4(f, b, 1), wasm.__wbindgen_export4(g, h, 1);
      }
    }, arguments);
  }, __wbg_media_91e147d0112e864c: function(n, a) {
    const i = getObject(a).media, r = passStringToWasm0(i, wasm.__wbindgen_export, wasm.__wbindgen_export2), f = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(n + 4, f, true), getDataViewMemory0().setInt32(n + 0, r, true);
  }, __wbg_message_206e22ac85ff4937: function(n, a) {
    const i = getObject(a).message, r = passStringToWasm0(i, wasm.__wbindgen_export, wasm.__wbindgen_export2), f = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(n + 4, f, true), getDataViewMemory0().setInt32(n + 0, r, true);
  }, __wbg_message_e959edc81e4b6cb7: function(n, a) {
    const i = getObject(a).message, r = passStringToWasm0(i, wasm.__wbindgen_export, wasm.__wbindgen_export2), f = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(n + 4, f, true), getDataViewMemory0().setInt32(n + 0, r, true);
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
      const i = new Worker(getStringFromWasm0(n, a));
      return addHeapObject(i);
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
  }, __wbg_new_aad8cb4adc774d03: function(n, a, i, r) {
    const f = new RegExp(getStringFromWasm0(n, a), getStringFromWasm0(i, r));
    return addHeapObject(f);
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
      var i = { a: n, b: a }, r = (b, g) => {
        const h = i.a;
        i.a = 0;
        try {
          return __wasm_bindgen_func_elem_194338(h, i.b, b, g);
        } finally {
          i.a = h;
        }
      };
      const f = new Promise(r);
      return addHeapObject(f);
    } finally {
      i.a = i.b = 0;
    }
  }, __wbg_new_dd50bcc3f60ba434: function() {
    return handleError(function(n, a) {
      const i = new WebSocket(getStringFromWasm0(n, a));
      return addHeapObject(i);
    }, arguments);
  }, __wbg_new_de704db0001dadc8: function() {
    return handleError(function(n) {
      const a = new ResizeObserver(getObject(n));
      return addHeapObject(a);
    }, arguments);
  }, __wbg_new_e9bc99ed55d4504d: function() {
    return handleError(function(n, a) {
      const i = new ImageData(takeObject(n), a >>> 0);
      return addHeapObject(i);
    }, arguments);
  }, __wbg_new_f7708ba82c4c12f6: function() {
    return handleError(function() {
      const n = new MessageChannel();
      return addHeapObject(n);
    }, arguments);
  }, __wbg_new_from_slice_22da9388ac046e50: function(n, a) {
    const i = new Uint8Array(getArrayU8FromWasm0(n, a));
    return addHeapObject(i);
  }, __wbg_new_typed_bccac67128ed885a: function() {
    const n = new Array();
    return addHeapObject(n);
  }, __wbg_new_with_byte_offset_and_length_b2ec5bf7b2f35743: function(n, a, i) {
    const r = new Uint8Array(getObject(n), a >>> 0, i >>> 0);
    return addHeapObject(r);
  }, __wbg_new_with_context_options_c1249ea1a7ddc84f: function() {
    return handleError(function(n) {
      const a = new lAudioContext(getObject(n));
      return addHeapObject(a);
    }, arguments);
  }, __wbg_new_with_length_825018a1616e9e55: function(n) {
    const a = new Uint8Array(n >>> 0);
    return addHeapObject(a);
  }, __wbg_new_with_options_a992f1eb77ddb6f5: function() {
    return handleError(function(n, a, i) {
      const r = new WebTransport(getStringFromWasm0(n, a), getObject(i));
      return addHeapObject(r);
    }, arguments);
  }, __wbg_new_with_str_and_init_b4b54d1a819bc724: function() {
    return handleError(function(n, a, i) {
      const r = new Request(getStringFromWasm0(n, a), getObject(i));
      return addHeapObject(r);
    }, arguments);
  }, __wbg_new_with_str_sequence_81cd713f8ef645ea: function() {
    return handleError(function(n) {
      const a = new Blob(getObject(n));
      return addHeapObject(a);
    }, arguments);
  }, __wbg_new_with_str_sequence_and_options_a037535f6e1edba0: function() {
    return handleError(function(n, a) {
      const i = new Blob(getObject(n), getObject(a));
      return addHeapObject(i);
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
    return handleError(function(n, a, i) {
      const r = getObject(n).objectStore(getStringFromWasm0(a, i));
      return addHeapObject(r);
    }, arguments);
  }, __wbg_observe_571954223f11dad1: function(n, a, i) {
    getObject(n).observe(getObject(a), getObject(i));
  }, __wbg_observe_a829ffd9907f84b1: function(n, a) {
    getObject(n).observe(getObject(a));
  }, __wbg_observe_e1a1f270d8431b29: function(n, a) {
    getObject(n).observe(getObject(a));
  }, __wbg_of_8bf7ed3eca00ea43: function(n) {
    const a = Array.of(getObject(n));
    return addHeapObject(a);
  }, __wbg_of_8fd5dd402bc67165: function(n, a, i) {
    const r = Array.of(getObject(n), getObject(a), getObject(i));
    return addHeapObject(r);
  }, __wbg_of_d6376e3774c51f89: function(n, a) {
    const i = Array.of(getObject(n), getObject(a));
    return addHeapObject(i);
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
    return handleError(function(n, a, i, r) {
      const f = getObject(n).open(getStringFromWasm0(a, i), r >>> 0);
      return addHeapObject(f);
    }, arguments);
  }, __wbg_open_f3dc09caa3990bc4: function() {
    return handleError(function(n, a, i) {
      const r = getObject(n).open(getStringFromWasm0(a, i));
      return addHeapObject(r);
    }, arguments);
  }, __wbg_origin_bac5c3119fe40a90: function() {
    return handleError(function(n, a) {
      const i = getObject(a).origin, r = passStringToWasm0(i, wasm.__wbindgen_export, wasm.__wbindgen_export2), f = WASM_VECTOR_LEN;
      getDataViewMemory0().setInt32(n + 4, f, true), getDataViewMemory0().setInt32(n + 0, r, true);
    }, arguments);
  }, __wbg_performance_3fcf6e32a7e1ed0a: function(n) {
    const a = getObject(n).performance;
    return addHeapObject(a);
  }, __wbg_persisted_8366757621586c61: function(n) {
    return getObject(n).persisted;
  }, __wbg_pixelStorei_2a2385ed59538d48: function(n, a, i) {
    getObject(n).pixelStorei(a >>> 0, i);
  }, __wbg_pixelStorei_2a3c5b85cf37caba: function(n, a, i) {
    getObject(n).pixelStorei(a >>> 0, i);
  }, __wbg_play_3997a1be51d27925: function(n) {
    getObject(n).play();
  }, __wbg_pointerId_85ff21be7b52f43e: function(n) {
    return getObject(n).pointerId;
  }, __wbg_pointerType_02525bef1df5f79c: function(n, a) {
    const i = getObject(a).pointerType, r = passStringToWasm0(i, wasm.__wbindgen_export, wasm.__wbindgen_export2), f = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(n + 4, f, true), getDataViewMemory0().setInt32(n + 0, r, true);
  }, __wbg_polygonOffset_17cb85e417bf9db7: function(n, a, i) {
    getObject(n).polygonOffset(a, i);
  }, __wbg_polygonOffset_cc6bec2f9f4a18f7: function(n, a, i) {
    getObject(n).polygonOffset(a, i);
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
    return handleError(function(n, a, i) {
      getObject(n).postMessage(getObject(a), getObject(i));
    }, arguments);
  }, __wbg_postMessage_c89a8b5edbf59ad0: function() {
    return handleError(function(n, a) {
      getObject(n).postMessage(getObject(a));
    }, arguments);
  }, __wbg_postMessage_edb4c90a528e5a8c: function() {
    return handleError(function(n, a) {
      getObject(n).postMessage(getObject(a));
    }, arguments);
  }, __wbg_postTask_e2439afddcdfbb55: function(n, a, i) {
    const r = getObject(n).postTask(getObject(a), getObject(i));
    return addHeapObject(r);
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
  }, __wbg_prototypesetcall_d62e5099504357e6: function(n, a, i) {
    Uint8Array.prototype.set.call(getArrayU8FromWasm0(n, a), getObject(i));
  }, __wbg_pushErrorScope_9c7f2c66d0393f31: function(n, a) {
    getObject(n).pushErrorScope(__wbindgen_enum_GpuErrorFilter[a]);
  }, __wbg_push_e87b0e732085a946: function(n, a) {
    return getObject(n).push(getObject(a));
  }, __wbg_put_ae369598c083f1f5: function() {
    return handleError(function(n, a) {
      const i = getObject(n).put(getObject(a));
      return addHeapObject(i);
    }, arguments);
  }, __wbg_put_f1673d719f93ce22: function() {
    return handleError(function(n, a, i) {
      const r = getObject(n).put(getObject(a), getObject(i));
      return addHeapObject(r);
    }, arguments);
  }, __wbg_queryCounterEXT_12ca9f560a5855cb: function(n, a, i) {
    getObject(n).queryCounterEXT(getObject(a), i >>> 0);
  }, __wbg_querySelectorAll_ccbf0696a1c6fed8: function() {
    return handleError(function(n, a, i) {
      const r = getObject(n).querySelectorAll(getStringFromWasm0(a, i));
      return addHeapObject(r);
    }, arguments);
  }, __wbg_querySelector_46ff1b81410aebea: function() {
    return handleError(function(n, a, i) {
      const r = getObject(n).querySelector(getStringFromWasm0(a, i));
      return isLikeNone(r) ? 0 : addHeapObject(r);
    }, arguments);
  }, __wbg_queueMicrotask_0c399741342fb10f: function(n) {
    const a = getObject(n).queueMicrotask;
    return addHeapObject(a);
  }, __wbg_queueMicrotask_9608487e970c906d: function(n, a) {
    getObject(n).queueMicrotask(getObject(a));
  }, __wbg_queueMicrotask_a082d78ce798393e: function(n) {
    queueMicrotask(getObject(n));
  }, __wbg_queueMicrotask_c71567d694717a50: function(n) {
    queueMicrotask(getObject(n));
  }, __wbg_queueMicrotask_cfcf83b0d75ff7d0: function(n) {
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
    return handleError(function(n, a, i, r, f, b, g, h) {
      getObject(n).readPixels(a, i, r, f, b >>> 0, g >>> 0, getObject(h));
    }, arguments);
  }, __wbg_readPixels_5c7066b5bd547f81: function() {
    return handleError(function(n, a, i, r, f, b, g, h) {
      getObject(n).readPixels(a, i, r, f, b >>> 0, g >>> 0, getObject(h));
    }, arguments);
  }, __wbg_readPixels_f675ed52bd44f8f1: function() {
    return handleError(function(n, a, i, r, f, b, g, h) {
      getObject(n).readPixels(a, i, r, f, b >>> 0, g >>> 0, h);
    }, arguments);
  }, __wbg_read_312e1367cbceb744: function(n, a) {
    const i = getObject(n).read(getObject(a));
    return addHeapObject(i);
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
    const i = getObject(a).reason, r = passStringToWasm0(i, wasm.__wbindgen_export, wasm.__wbindgen_export2), f = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(n + 4, f, true), getDataViewMemory0().setInt32(n + 0, r, true);
  }, __wbg_removeEventListener_d27694700fc0df8b: function() {
    return handleError(function(n, a, i, r) {
      getObject(n).removeEventListener(getStringFromWasm0(a, i), getObject(r));
    }, arguments);
  }, __wbg_removeListener_7afb5d85c58c554b: function() {
    return handleError(function(n, a) {
      getObject(n).removeListener(getObject(a));
    }, arguments);
  }, __wbg_removeProperty_5b3523637b608633: function() {
    return handleError(function(n, a, i, r) {
      const f = getObject(a).removeProperty(getStringFromWasm0(i, r)), b = passStringToWasm0(f, wasm.__wbindgen_export, wasm.__wbindgen_export2), g = WASM_VECTOR_LEN;
      getDataViewMemory0().setInt32(n + 4, g, true), getDataViewMemory0().setInt32(n + 0, b, true);
    }, arguments);
  }, __wbg_renderbufferStorageMultisample_d999a80fbc25df5f: function(n, a, i, r, f, b) {
    getObject(n).renderbufferStorageMultisample(a >>> 0, i, r >>> 0, f, b);
  }, __wbg_renderbufferStorage_9130171a6ae371dc: function(n, a, i, r, f) {
    getObject(n).renderbufferStorage(a >>> 0, i >>> 0, r, f);
  }, __wbg_renderbufferStorage_b184ea29064b4e02: function(n, a, i, r, f) {
    getObject(n).renderbufferStorage(a >>> 0, i >>> 0, r, f);
  }, __wbg_repeat_44d6eeebd275606f: function(n) {
    return getObject(n).repeat;
  }, __wbg_requestAdapter_8efca1b953fd13aa: function(n, a) {
    const i = getObject(n).requestAdapter(getObject(a));
    return addHeapObject(i);
  }, __wbg_requestAnimationFrame_206c97f410e7a383: function() {
    return handleError(function(n, a) {
      return getObject(n).requestAnimationFrame(getObject(a));
    }, arguments);
  }, __wbg_requestDevice_290c73161fe959d5: function(n, a) {
    const i = getObject(n).requestDevice(getObject(a));
    return addHeapObject(i);
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
  }, __wbg_resolveQuerySet_ee2438e6a23d55f6: function(n, a, i, r, f, b) {
    getObject(n).resolveQuerySet(getObject(a), i >>> 0, r >>> 0, getObject(f), b >>> 0);
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
  }, __wbg_samplerParameterf_774cff2229cc9fc3: function(n, a, i, r) {
    getObject(n).samplerParameterf(getObject(a), i >>> 0, r);
  }, __wbg_samplerParameteri_7dde222b01588620: function(n, a, i, r) {
    getObject(n).samplerParameteri(getObject(a), i >>> 0, r);
  }, __wbg_scheduler_a17d41c9c822fc26: function(n) {
    const a = getObject(n).scheduler;
    return addHeapObject(a);
  }, __wbg_scheduler_b35fe73ba70e89cc: function(n) {
    const a = getObject(n).scheduler;
    return addHeapObject(a);
  }, __wbg_scissor_b18f09381b341db5: function(n, a, i, r, f) {
    getObject(n).scissor(a, i, r, f);
  }, __wbg_scissor_db3842546fb31842: function(n, a, i, r, f) {
    getObject(n).scissor(a, i, r, f);
  }, __wbg_send_4a1dc66e8653e5ed: function() {
    return handleError(function(n, a, i) {
      getObject(n).send(getStringFromWasm0(a, i));
    }, arguments);
  }, __wbg_send_d31a693c975dea74: function() {
    return handleError(function(n, a, i) {
      getObject(n).send(getArrayU8FromWasm0(a, i));
    }, arguments);
  }, __wbg_send_d3733b292c3de949: function() {
    return handleError(function(n, a) {
      getObject(n).send(getObject(a));
    }, arguments);
  }, __wbg_setAttribute_f20d3b966749ab64: function() {
    return handleError(function(n, a, i, r, f) {
      getObject(n).setAttribute(getStringFromWasm0(a, i), getStringFromWasm0(r, f));
    }, arguments);
  }, __wbg_setBindGroup_1c8c11d4dd6528cf: function(n, a, i) {
    getObject(n).setBindGroup(a >>> 0, getObject(i));
  }, __wbg_setBindGroup_29f4a44dff76f1a4: function(n, a, i) {
    getObject(n).setBindGroup(a >>> 0, getObject(i));
  }, __wbg_setBindGroup_35a4830ac2c27742: function() {
    return handleError(function(n, a, i, r, f, b, g) {
      getObject(n).setBindGroup(a >>> 0, getObject(i), getArrayU32FromWasm0(r, f), b, g >>> 0);
    }, arguments);
  }, __wbg_setBindGroup_abde98bc542a4ae2: function() {
    return handleError(function(n, a, i, r, f, b, g) {
      getObject(n).setBindGroup(a >>> 0, getObject(i), getArrayU32FromWasm0(r, f), b, g >>> 0);
    }, arguments);
  }, __wbg_setBlendConstant_b9a2e1bc2a6182a3: function() {
    return handleError(function(n, a) {
      getObject(n).setBlendConstant(getObject(a));
    }, arguments);
  }, __wbg_setIndexBuffer_924197dc97dbb679: function(n, a, i, r, f) {
    getObject(n).setIndexBuffer(getObject(a), __wbindgen_enum_GpuIndexFormat[i], r, f);
  }, __wbg_setIndexBuffer_a400322dea5437f7: function(n, a, i, r) {
    getObject(n).setIndexBuffer(getObject(a), __wbindgen_enum_GpuIndexFormat[i], r);
  }, __wbg_setInterval_2cc6fda2bedb96bc: function() {
    return handleError(function(n, a, i) {
      return getObject(n).setInterval(getObject(a), i);
    }, arguments);
  }, __wbg_setPipeline_c91e0c8670443991: function(n, a) {
    getObject(n).setPipeline(getObject(a));
  }, __wbg_setPipeline_e6ea6756d71b19a7: function(n, a) {
    getObject(n).setPipeline(getObject(a));
  }, __wbg_setPointerCapture_b6e6a21fc0db7621: function() {
    return handleError(function(n, a) {
      getObject(n).setPointerCapture(a);
    }, arguments);
  }, __wbg_setProperty_ef29d2aa64a04d2b: function() {
    return handleError(function(n, a, i, r, f) {
      getObject(n).setProperty(getStringFromWasm0(a, i), getStringFromWasm0(r, f));
    }, arguments);
  }, __wbg_setScissorRect_eeb4f61d4b860d7a: function(n, a, i, r, f) {
    getObject(n).setScissorRect(a >>> 0, i >>> 0, r >>> 0, f >>> 0);
  }, __wbg_setStencilReference_54f732c89e8ab296: function(n, a) {
    getObject(n).setStencilReference(a >>> 0);
  }, __wbg_setTimeout_647865935a499f8b: function() {
    return handleError(function(n, a) {
      return getObject(n).setTimeout(getObject(a));
    }, arguments);
  }, __wbg_setTimeout_7f7035ad0b026458: function() {
    return handleError(function(n, a, i) {
      return getObject(n).setTimeout(getObject(a), i);
    }, arguments);
  }, __wbg_setTimeout_ef24d2fc3ad97385: function() {
    return handleError(function(n, a) {
      const i = setTimeout(getObject(n), a);
      return addHeapObject(i);
    }, arguments);
  }, __wbg_setVertexBuffer_58f30a4873b36907: function(n, a, i, r) {
    getObject(n).setVertexBuffer(a >>> 0, getObject(i), r);
  }, __wbg_setVertexBuffer_7aa508f017477005: function(n, a, i, r, f) {
    getObject(n).setVertexBuffer(a >>> 0, getObject(i), r, f);
  }, __wbg_setViewport_014b4c4d1101ba6b: function(n, a, i, r, f, b, g) {
    getObject(n).setViewport(a, i, r, f, b, g);
  }, __wbg_set_361bc2460da3016f: function(n, a, i) {
    getObject(n).set(getArrayF32FromWasm0(a, i));
  }, __wbg_set_7eaa4f96924fd6b3: function() {
    return handleError(function(n, a, i) {
      return Reflect.set(getObject(n), getObject(a), getObject(i));
    }, arguments);
  }, __wbg_set_8c0b3ffcf05d61c2: function(n, a, i) {
    getObject(n).set(getArrayU8FromWasm0(a, i));
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
  }, __wbg_set_code_27a25a855d3fbc6d: function(n, a, i) {
    getObject(n).code = getStringFromWasm0(a, i);
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
  }, __wbg_set_cursor_8d686ff9dd99a325: function(n, a, i) {
    getObject(n).cursor = getStringFromWasm0(a, i);
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
    return handleError(function(n, a, i, r, f) {
      getObject(n).set(getStringFromWasm0(a, i), getStringFromWasm0(r, f));
    }, arguments);
  }, __wbg_set_e80615d7a9a43981: function(n, a, i) {
    getObject(n).set(getObject(a), i >>> 0);
  }, __wbg_set_end_of_pass_write_index_4600a261d0317ecb: function(n, a) {
    getObject(n).endOfPassWriteIndex = a >>> 0;
  }, __wbg_set_end_of_pass_write_index_9fec09fcc7da1609: function(n, a) {
    getObject(n).endOfPassWriteIndex = a >>> 0;
  }, __wbg_set_entries_4d13c932343146c3: function(n, a) {
    getObject(n).entries = getObject(a);
  }, __wbg_set_entries_7e6b569918b11bf4: function(n, a) {
    getObject(n).entries = getObject(a);
  }, __wbg_set_entry_point_7248ed25fb9070c7: function(n, a, i) {
    getObject(n).entryPoint = getStringFromWasm0(a, i);
  }, __wbg_set_entry_point_b01eb3970a1dcb95: function(n, a, i) {
    getObject(n).entryPoint = getStringFromWasm0(a, i);
  }, __wbg_set_entry_point_c8f041069c527ff6: function(n, a, i) {
    getObject(n).entryPoint = getStringFromWasm0(a, i);
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
  }, __wbg_set_label_10bd19b972ff1ba6: function(n, a, i) {
    getObject(n).label = getStringFromWasm0(a, i);
  }, __wbg_set_label_16cff4ff3c381368: function(n, a, i) {
    getObject(n).label = getStringFromWasm0(a, i);
  }, __wbg_set_label_343ceab4761679d7: function(n, a, i) {
    getObject(n).label = getStringFromWasm0(a, i);
  }, __wbg_set_label_403725ced930414e: function(n, a, i) {
    getObject(n).label = getStringFromWasm0(a, i);
  }, __wbg_set_label_62b82f9361718fb9: function(n, a, i) {
    getObject(n).label = getStringFromWasm0(a, i);
  }, __wbg_set_label_6afa181067c4da56: function(n, a, i) {
    getObject(n).label = getStringFromWasm0(a, i);
  }, __wbg_set_label_7d448e8a777d0d37: function(n, a, i) {
    getObject(n).label = getStringFromWasm0(a, i);
  }, __wbg_set_label_900e563567315063: function(n, a, i) {
    getObject(n).label = getStringFromWasm0(a, i);
  }, __wbg_set_label_98bef61fcbcecdde: function(n, a, i) {
    getObject(n).label = getStringFromWasm0(a, i);
  }, __wbg_set_label_9d2ce197e447a967: function(n, a, i) {
    getObject(n).label = getStringFromWasm0(a, i);
  }, __wbg_set_label_a19e77f79a88d021: function(n, a, i) {
    getObject(n).label = getStringFromWasm0(a, i);
  }, __wbg_set_label_b5d7ff5f8e4fbaac: function(n, a, i) {
    getObject(n).label = getStringFromWasm0(a, i);
  }, __wbg_set_label_ba288fbac1259847: function(n, a, i) {
    getObject(n).label = getStringFromWasm0(a, i);
  }, __wbg_set_label_e135ef1842fb45f8: function(n, a, i) {
    getObject(n).label = getStringFromWasm0(a, i);
  }, __wbg_set_label_e1bd2437f39d21f3: function(n, a, i) {
    getObject(n).label = getStringFromWasm0(a, i);
  }, __wbg_set_label_e4debe6dc9ea319b: function(n, a, i) {
    getObject(n).label = getStringFromWasm0(a, i);
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
  }, __wbg_set_method_8c015e8bcafd7be1: function(n, a, i) {
    getObject(n).method = getStringFromWasm0(a, i);
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
  }, __wbg_set_name_02d633afec2e2bf0: function(n, a, i) {
    getObject(n).name = getStringFromWasm0(a, i);
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
  }, __wbg_set_option_server_certificate_hashes_ca5163033476c253: function(n, a, i) {
    let r;
    a !== 0 && (r = getArrayJsValueFromWasm0(a, i).slice(), wasm.__wbindgen_export4(a, i * 4, 4)), getObject(n).serverCertificateHashes = r;
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
  }, __wbg_set_src_f257a96103ac1ac6: function(n, a, i) {
    getObject(n).src = getStringFromWasm0(a, i);
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
  }, __wbg_set_type_33e79f1b45a78c37: function(n, a, i) {
    getObject(n).type = getStringFromWasm0(a, i);
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
  }, __wbg_shaderSource_06639e7b476e6ac2: function(n, a, i, r) {
    getObject(n).shaderSource(getObject(a), getStringFromWasm0(i, r));
  }, __wbg_shaderSource_2bca0edc97475e95: function(n, a, i, r) {
    getObject(n).shaderSource(getObject(a), getStringFromWasm0(i, r));
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
    const i = getObject(a).stack, r = passStringToWasm0(i, wasm.__wbindgen_export, wasm.__wbindgen_export2), f = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(n + 4, f, true), getDataViewMemory0().setInt32(n + 0, r, true);
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
  }, __wbg_stencilFuncSeparate_18642df0574c1930: function(n, a, i, r, f) {
    getObject(n).stencilFuncSeparate(a >>> 0, i >>> 0, r, f >>> 0);
  }, __wbg_stencilFuncSeparate_94ee4fbc164addec: function(n, a, i, r, f) {
    getObject(n).stencilFuncSeparate(a >>> 0, i >>> 0, r, f >>> 0);
  }, __wbg_stencilMaskSeparate_13b0475860a9b559: function(n, a, i) {
    getObject(n).stencilMaskSeparate(a >>> 0, i >>> 0);
  }, __wbg_stencilMaskSeparate_a7bd409376ee05ff: function(n, a, i) {
    getObject(n).stencilMaskSeparate(a >>> 0, i >>> 0);
  }, __wbg_stencilMask_326a11d0928c3808: function(n, a) {
    getObject(n).stencilMask(a >>> 0);
  }, __wbg_stencilMask_6354f8ba392f6581: function(n, a) {
    getObject(n).stencilMask(a >>> 0);
  }, __wbg_stencilOpSeparate_7e819381705b9731: function(n, a, i, r, f) {
    getObject(n).stencilOpSeparate(a >>> 0, i >>> 0, r >>> 0, f >>> 0);
  }, __wbg_stencilOpSeparate_8627d0f5f7fe5800: function(n, a, i, r, f) {
    getObject(n).stencilOpSeparate(a >>> 0, i >>> 0, r >>> 0, f >>> 0);
  }, __wbg_stringify_5ae93966a84901ac: function() {
    return handleError(function(n) {
      const a = JSON.stringify(getObject(n));
      return addHeapObject(a);
    }, arguments);
  }, __wbg_style_b01fc765f98b99ff: function(n) {
    const a = getObject(n).style;
    return addHeapObject(a);
  }, __wbg_subarray_a068d24e39478a8a: function(n, a, i) {
    const r = getObject(n).subarray(a >>> 0, i >>> 0);
    return addHeapObject(r);
  }, __wbg_submit_21302eebe551e30d: function(n, a) {
    getObject(n).submit(getObject(a));
  }, __wbg_target_7bc90f314634b37b: function(n) {
    const a = getObject(n).target;
    return isLikeNone(a) ? 0 : addHeapObject(a);
  }, __wbg_terminate_8d65e3d9758359c7: function(n) {
    getObject(n).terminate();
  }, __wbg_texImage2D_32ed4220040ca614: function() {
    return handleError(function(n, a, i, r, f, b, g, h, y, w) {
      getObject(n).texImage2D(a >>> 0, i, r, f, b, g, h >>> 0, y >>> 0, getObject(w));
    }, arguments);
  }, __wbg_texImage2D_d8c284c813952313: function() {
    return handleError(function(n, a, i, r, f, b, g, h, y, w) {
      getObject(n).texImage2D(a >>> 0, i, r, f, b, g, h >>> 0, y >>> 0, w);
    }, arguments);
  }, __wbg_texImage2D_f4ae6c314a9a4bbe: function() {
    return handleError(function(n, a, i, r, f, b, g, h, y, w) {
      getObject(n).texImage2D(a >>> 0, i, r, f, b, g, h >>> 0, y >>> 0, getObject(w));
    }, arguments);
  }, __wbg_texImage3D_88ff1fa41be127b9: function() {
    return handleError(function(n, a, i, r, f, b, g, h, y, w, z) {
      getObject(n).texImage3D(a >>> 0, i, r, f, b, g, h, y >>> 0, w >>> 0, getObject(z));
    }, arguments);
  }, __wbg_texImage3D_9a207e0459a4f276: function() {
    return handleError(function(n, a, i, r, f, b, g, h, y, w, z) {
      getObject(n).texImage3D(a >>> 0, i, r, f, b, g, h, y >>> 0, w >>> 0, z);
    }, arguments);
  }, __wbg_texParameteri_f4b1596185f5432d: function(n, a, i, r) {
    getObject(n).texParameteri(a >>> 0, i >>> 0, r);
  }, __wbg_texParameteri_fcdec30159061963: function(n, a, i, r) {
    getObject(n).texParameteri(a >>> 0, i >>> 0, r);
  }, __wbg_texStorage2D_a84f74d36d279097: function(n, a, i, r, f, b) {
    getObject(n).texStorage2D(a >>> 0, i, r >>> 0, f, b);
  }, __wbg_texStorage3D_aec6fc3e85ec72da: function(n, a, i, r, f, b, g) {
    getObject(n).texStorage3D(a >>> 0, i, r >>> 0, f, b, g);
  }, __wbg_texSubImage2D_1e7d6febf82b9bed: function() {
    return handleError(function(n, a, i, r, f, b, g, h, y, w) {
      getObject(n).texSubImage2D(a >>> 0, i, r, f, b, g, h >>> 0, y >>> 0, getObject(w));
    }, arguments);
  }, __wbg_texSubImage2D_271ffedb47424d0d: function() {
    return handleError(function(n, a, i, r, f, b, g, h, y, w) {
      getObject(n).texSubImage2D(a >>> 0, i, r, f, b, g, h >>> 0, y >>> 0, getObject(w));
    }, arguments);
  }, __wbg_texSubImage2D_3bb41b987f2bfe39: function() {
    return handleError(function(n, a, i, r, f, b, g, h, y, w) {
      getObject(n).texSubImage2D(a >>> 0, i, r, f, b, g, h >>> 0, y >>> 0, getObject(w));
    }, arguments);
  }, __wbg_texSubImage2D_68e0413824eddc12: function() {
    return handleError(function(n, a, i, r, f, b, g, h, y, w) {
      getObject(n).texSubImage2D(a >>> 0, i, r, f, b, g, h >>> 0, y >>> 0, getObject(w));
    }, arguments);
  }, __wbg_texSubImage2D_b6cdbbe62097211a: function() {
    return handleError(function(n, a, i, r, f, b, g, h, y, w) {
      getObject(n).texSubImage2D(a >>> 0, i, r, f, b, g, h >>> 0, y >>> 0, getObject(w));
    }, arguments);
  }, __wbg_texSubImage2D_c8919d8f32f723da: function() {
    return handleError(function(n, a, i, r, f, b, g, h, y, w) {
      getObject(n).texSubImage2D(a >>> 0, i, r, f, b, g, h >>> 0, y >>> 0, getObject(w));
    }, arguments);
  }, __wbg_texSubImage2D_d784df0b813dc1ab: function() {
    return handleError(function(n, a, i, r, f, b, g, h, y, w) {
      getObject(n).texSubImage2D(a >>> 0, i, r, f, b, g, h >>> 0, y >>> 0, w);
    }, arguments);
  }, __wbg_texSubImage2D_dd1d50234b61de4b: function() {
    return handleError(function(n, a, i, r, f, b, g, h, y, w) {
      getObject(n).texSubImage2D(a >>> 0, i, r, f, b, g, h >>> 0, y >>> 0, getObject(w));
    }, arguments);
  }, __wbg_texSubImage3D_09cc863aedf44a21: function() {
    return handleError(function(n, a, i, r, f, b, g, h, y, w, z, R) {
      getObject(n).texSubImage3D(a >>> 0, i, r, f, b, g, h, y, w >>> 0, z >>> 0, getObject(R));
    }, arguments);
  }, __wbg_texSubImage3D_4665e67a8f0f7806: function() {
    return handleError(function(n, a, i, r, f, b, g, h, y, w, z, R) {
      getObject(n).texSubImage3D(a >>> 0, i, r, f, b, g, h, y, w >>> 0, z >>> 0, getObject(R));
    }, arguments);
  }, __wbg_texSubImage3D_61ed187f3ec11ecc: function() {
    return handleError(function(n, a, i, r, f, b, g, h, y, w, z, R) {
      getObject(n).texSubImage3D(a >>> 0, i, r, f, b, g, h, y, w >>> 0, z >>> 0, getObject(R));
    }, arguments);
  }, __wbg_texSubImage3D_6a46981af8bc8e49: function() {
    return handleError(function(n, a, i, r, f, b, g, h, y, w, z, R) {
      getObject(n).texSubImage3D(a >>> 0, i, r, f, b, g, h, y, w >>> 0, z >>> 0, getObject(R));
    }, arguments);
  }, __wbg_texSubImage3D_9eca35d234d51b8a: function() {
    return handleError(function(n, a, i, r, f, b, g, h, y, w, z, R) {
      getObject(n).texSubImage3D(a >>> 0, i, r, f, b, g, h, y, w >>> 0, z >>> 0, getObject(R));
    }, arguments);
  }, __wbg_texSubImage3D_b3cbbb79fe54da6d: function() {
    return handleError(function(n, a, i, r, f, b, g, h, y, w, z, R) {
      getObject(n).texSubImage3D(a >>> 0, i, r, f, b, g, h, y, w >>> 0, z >>> 0, R);
    }, arguments);
  }, __wbg_texSubImage3D_f9c3af789162846a: function() {
    return handleError(function(n, a, i, r, f, b, g, h, y, w, z, R) {
      getObject(n).texSubImage3D(a >>> 0, i, r, f, b, g, h, y, w >>> 0, z >>> 0, getObject(R));
    }, arguments);
  }, __wbg_then_098abe61755d12f6: function(n, a) {
    const i = getObject(n).then(getObject(a));
    return addHeapObject(i);
  }, __wbg_then_1d7a5273811a5cea: function(n, a) {
    const i = getObject(n).then(getObject(a));
    return addHeapObject(i);
  }, __wbg_then_9e335f6dd892bc11: function(n, a, i) {
    const r = getObject(n).then(getObject(a), getObject(i));
    return addHeapObject(r);
  }, __wbg_then_bc59d1943397ca4e: function(n, a, i) {
    const r = getObject(n).then(getObject(a), getObject(i));
    return addHeapObject(r);
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
    return handleError(function(n, a, i) {
      const r = getObject(n).transaction(getObject(a), __wbindgen_enum_IdbTransactionMode[i]);
      return addHeapObject(r);
    }, arguments);
  }, __wbg_transaction_fda57653957fee06: function(n) {
    const a = getObject(n).transaction;
    return isLikeNone(a) ? 0 : addHeapObject(a);
  }, __wbg_transferFromImageBitmap_9f9bd42ea0f80770: function(n, a) {
    getObject(n).transferFromImageBitmap(getObject(a));
  }, __wbg_uniform1f_8c3b03df282dba21: function(n, a, i) {
    getObject(n).uniform1f(getObject(a), i);
  }, __wbg_uniform1f_b8841988568406b9: function(n, a, i) {
    getObject(n).uniform1f(getObject(a), i);
  }, __wbg_uniform1i_953040fb972e9fab: function(n, a, i) {
    getObject(n).uniform1i(getObject(a), i);
  }, __wbg_uniform1i_acd89bea81085be4: function(n, a, i) {
    getObject(n).uniform1i(getObject(a), i);
  }, __wbg_uniform1ui_9f8d9b877d6691d8: function(n, a, i) {
    getObject(n).uniform1ui(getObject(a), i >>> 0);
  }, __wbg_uniform2fv_28fbf8836f3045d0: function(n, a, i, r) {
    getObject(n).uniform2fv(getObject(a), getArrayF32FromWasm0(i, r));
  }, __wbg_uniform2fv_f3c92aab21d0dec3: function(n, a, i, r) {
    getObject(n).uniform2fv(getObject(a), getArrayF32FromWasm0(i, r));
  }, __wbg_uniform2iv_892b6d31137ad198: function(n, a, i, r) {
    getObject(n).uniform2iv(getObject(a), getArrayI32FromWasm0(i, r));
  }, __wbg_uniform2iv_f40f632615c5685a: function(n, a, i, r) {
    getObject(n).uniform2iv(getObject(a), getArrayI32FromWasm0(i, r));
  }, __wbg_uniform2uiv_6d170469a702f23e: function(n, a, i, r) {
    getObject(n).uniform2uiv(getObject(a), getArrayU32FromWasm0(i, r));
  }, __wbg_uniform3fv_85a9a17c9635941b: function(n, a, i, r) {
    getObject(n).uniform3fv(getObject(a), getArrayF32FromWasm0(i, r));
  }, __wbg_uniform3fv_cdf7c84f9119f13b: function(n, a, i, r) {
    getObject(n).uniform3fv(getObject(a), getArrayF32FromWasm0(i, r));
  }, __wbg_uniform3iv_38e74d2ae9dfbfb8: function(n, a, i, r) {
    getObject(n).uniform3iv(getObject(a), getArrayI32FromWasm0(i, r));
  }, __wbg_uniform3iv_4c372010ac6def3f: function(n, a, i, r) {
    getObject(n).uniform3iv(getObject(a), getArrayI32FromWasm0(i, r));
  }, __wbg_uniform3uiv_bb7266bb3a5aef96: function(n, a, i, r) {
    getObject(n).uniform3uiv(getObject(a), getArrayU32FromWasm0(i, r));
  }, __wbg_uniform4f_0b00a34f4789ad14: function(n, a, i, r, f, b) {
    getObject(n).uniform4f(getObject(a), i, r, f, b);
  }, __wbg_uniform4f_7275e0fb864b7513: function(n, a, i, r, f, b) {
    getObject(n).uniform4f(getObject(a), i, r, f, b);
  }, __wbg_uniform4fv_a4cdb4bd66867df5: function(n, a, i, r) {
    getObject(n).uniform4fv(getObject(a), getArrayF32FromWasm0(i, r));
  }, __wbg_uniform4fv_c416900acf65eca9: function(n, a, i, r) {
    getObject(n).uniform4fv(getObject(a), getArrayF32FromWasm0(i, r));
  }, __wbg_uniform4iv_b49cd4acf0aa3ebc: function(n, a, i, r) {
    getObject(n).uniform4iv(getObject(a), getArrayI32FromWasm0(i, r));
  }, __wbg_uniform4iv_d654af0e6b7bdb1a: function(n, a, i, r) {
    getObject(n).uniform4iv(getObject(a), getArrayI32FromWasm0(i, r));
  }, __wbg_uniform4uiv_e95d9a124fb8f91e: function(n, a, i, r) {
    getObject(n).uniform4uiv(getObject(a), getArrayU32FromWasm0(i, r));
  }, __wbg_uniformBlockBinding_a47fa267662afd7b: function(n, a, i, r) {
    getObject(n).uniformBlockBinding(getObject(a), i >>> 0, r >>> 0);
  }, __wbg_uniformMatrix2fv_4229ae27417c649a: function(n, a, i, r, f) {
    getObject(n).uniformMatrix2fv(getObject(a), i !== 0, getArrayF32FromWasm0(r, f));
  }, __wbg_uniformMatrix2fv_648417dd2040de5b: function(n, a, i, r, f) {
    getObject(n).uniformMatrix2fv(getObject(a), i !== 0, getArrayF32FromWasm0(r, f));
  }, __wbg_uniformMatrix2x3fv_eb9a53c8c9aa724b: function(n, a, i, r, f) {
    getObject(n).uniformMatrix2x3fv(getObject(a), i !== 0, getArrayF32FromWasm0(r, f));
  }, __wbg_uniformMatrix2x4fv_8849517a52f2e845: function(n, a, i, r, f) {
    getObject(n).uniformMatrix2x4fv(getObject(a), i !== 0, getArrayF32FromWasm0(r, f));
  }, __wbg_uniformMatrix3fv_244fc4416319c169: function(n, a, i, r, f) {
    getObject(n).uniformMatrix3fv(getObject(a), i !== 0, getArrayF32FromWasm0(r, f));
  }, __wbg_uniformMatrix3fv_bafc2707d0c48e27: function(n, a, i, r, f) {
    getObject(n).uniformMatrix3fv(getObject(a), i !== 0, getArrayF32FromWasm0(r, f));
  }, __wbg_uniformMatrix3x2fv_f1729eb13fcd41a3: function(n, a, i, r, f) {
    getObject(n).uniformMatrix3x2fv(getObject(a), i !== 0, getArrayF32FromWasm0(r, f));
  }, __wbg_uniformMatrix3x4fv_3c11181f5fa929de: function(n, a, i, r, f) {
    getObject(n).uniformMatrix3x4fv(getObject(a), i !== 0, getArrayF32FromWasm0(r, f));
  }, __wbg_uniformMatrix4fv_4d322b295d122214: function(n, a, i, r, f) {
    getObject(n).uniformMatrix4fv(getObject(a), i !== 0, getArrayF32FromWasm0(r, f));
  }, __wbg_uniformMatrix4fv_7c68dee5aee11694: function(n, a, i, r, f) {
    getObject(n).uniformMatrix4fv(getObject(a), i !== 0, getArrayF32FromWasm0(r, f));
  }, __wbg_uniformMatrix4x2fv_5a8701b552d704af: function(n, a, i, r, f) {
    getObject(n).uniformMatrix4x2fv(getObject(a), i !== 0, getArrayF32FromWasm0(r, f));
  }, __wbg_uniformMatrix4x3fv_741c3f4e0b2c7e04: function(n, a, i, r, f) {
    getObject(n).uniformMatrix4x3fv(getObject(a), i !== 0, getArrayF32FromWasm0(r, f));
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
      const i = getObject(a).userAgent, r = passStringToWasm0(i, wasm.__wbindgen_export, wasm.__wbindgen_export2), f = WASM_VECTOR_LEN;
      getDataViewMemory0().setInt32(n + 4, f, true), getDataViewMemory0().setInt32(n + 0, r, true);
    }, arguments);
  }, __wbg_value_21fc78aab0322612: function(n) {
    const a = getObject(n).value;
    return addHeapObject(a);
  }, __wbg_value_23545848209ec70e: function(n) {
    const a = getObject(n).value;
    return isLikeNone(a) ? 0 : addHeapObject(a);
  }, __wbg_value_a32389e33914d8b0: function(n) {
    const a = getObject(n).value;
    return addHeapObject(a);
  }, __wbg_value_a529cd2f781749fd: function(n) {
    const a = getObject(n).value;
    return addHeapObject(a);
  }, __wbg_value_f3d531408c0c70aa: function(n) {
    return getObject(n).value;
  }, __wbg_versions_276b2795b1c6a219: function(n) {
    const a = getObject(n).versions;
    return addHeapObject(a);
  }, __wbg_vertexAttribDivisorANGLE_b357aa2bf70d3dcf: function(n, a, i) {
    getObject(n).vertexAttribDivisorANGLE(a >>> 0, i >>> 0);
  }, __wbg_vertexAttribDivisor_99b2fd5affca539d: function(n, a, i) {
    getObject(n).vertexAttribDivisor(a >>> 0, i >>> 0);
  }, __wbg_vertexAttribIPointer_ecd3baef73ba0965: function(n, a, i, r, f, b) {
    getObject(n).vertexAttribIPointer(a >>> 0, i, r >>> 0, f, b);
  }, __wbg_vertexAttribPointer_ea73fc4cc5b7d647: function(n, a, i, r, f, b, g) {
    getObject(n).vertexAttribPointer(a >>> 0, i, r >>> 0, f !== 0, b, g);
  }, __wbg_vertexAttribPointer_f63675d7fad431e6: function(n, a, i, r, f, b, g) {
    getObject(n).vertexAttribPointer(a >>> 0, i, r >>> 0, f !== 0, b, g);
  }, __wbg_videoHeight_6dac1fd954779498: function(n) {
    return getObject(n).videoHeight;
  }, __wbg_videoWidth_48f094fdc1b5ba64: function(n) {
    return getObject(n).videoWidth;
  }, __wbg_viewport_63ee76a0f029804d: function(n, a, i, r, f) {
    getObject(n).viewport(a, i, r, f);
  }, __wbg_viewport_b60aceadb9166023: function(n, a, i, r, f) {
    getObject(n).viewport(a, i, r, f);
  }, __wbg_visibilityState_8b47c97faee36457: function(n) {
    const a = getObject(n).visibilityState;
    return (__wbindgen_enum_VisibilityState.indexOf(a) + 1 || 3) - 1;
  }, __wbg_waitAsync_4f2b907b7c917932: function(n, a, i) {
    const r = Atomics.waitAsync(getObject(n), a >>> 0, i);
    return addHeapObject(r);
  }, __wbg_waitAsync_91ab9cf292b5ab15: function(n, a, i) {
    const r = Atomics.waitAsync(getObject(n), a >>> 0, i);
    return addHeapObject(r);
  }, __wbg_waitAsync_a4399d51368b6ce4: function() {
    const n = Atomics.waitAsync;
    return addHeapObject(n);
  }, __wbg_wait_result_async_73157675ab05ec7d: function(n) {
    return wait_result_async(getObject(n));
  }, __wbg_wait_result_value_a7b2b15227c920a3: function(n) {
    const a = wait_result_value(getObject(n));
    return addHeapObject(a);
  }, __wbg_warn_809cad1bfc2b3a42: function(n, a, i, r) {
    console.warn(getObject(n), getObject(a), getObject(i), getObject(r));
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
    return handleError(function(n, a, i, r, f, b) {
      getObject(n).writeBuffer(getObject(a), i, getObject(r), f, b);
    }, arguments);
  }, __wbg_writeTexture_340cfbecd9544755: function() {
    return handleError(function(n, a, i, r, f) {
      getObject(n).writeTexture(getObject(a), getObject(i), getObject(r), getObject(f));
    }, arguments);
  }, __wbg_write_6c1ce79b0d7a43ff: function(n, a) {
    const i = getObject(n).write(getObject(a));
    return addHeapObject(i);
  }, __wbg_x_663bdb24f78fdb4f: function(n) {
    return getObject(n).x;
  }, __wbg_y_30a7c06266f44f65: function(n) {
    return getObject(n).y;
  }, __wbindgen_cast_0000000000000001: function(n, a) {
    const i = makeMutClosure(n, a, wasm.__wasm_bindgen_func_elem_128406, __wasm_bindgen_func_elem_128508);
    return addHeapObject(i);
  }, __wbindgen_cast_0000000000000002: function(n, a) {
    const i = makeMutClosure(n, a, wasm.__wasm_bindgen_func_elem_13858, __wasm_bindgen_func_elem_13921);
    return addHeapObject(i);
  }, __wbindgen_cast_0000000000000003: function(n, a) {
    const i = makeMutClosure(n, a, wasm.__wasm_bindgen_func_elem_13858, __wasm_bindgen_func_elem_13921_2);
    return addHeapObject(i);
  }, __wbindgen_cast_0000000000000004: function(n, a) {
    const i = makeMutClosure(n, a, wasm.__wasm_bindgen_func_elem_13858, __wasm_bindgen_func_elem_13921_3);
    return addHeapObject(i);
  }, __wbindgen_cast_0000000000000005: function(n, a) {
    const i = makeMutClosure(n, a, wasm.__wasm_bindgen_func_elem_14777, __wasm_bindgen_func_elem_14860);
    return addHeapObject(i);
  }, __wbindgen_cast_0000000000000006: function(n, a) {
    const i = makeMutClosure(n, a, wasm.__wasm_bindgen_func_elem_14777, __wasm_bindgen_func_elem_14862);
    return addHeapObject(i);
  }, __wbindgen_cast_0000000000000007: function(n, a) {
    const i = makeMutClosure(n, a, wasm.__wasm_bindgen_func_elem_15140, __wasm_bindgen_func_elem_15144);
    return addHeapObject(i);
  }, __wbindgen_cast_0000000000000008: function(n, a) {
    const i = makeMutClosure(n, a, wasm.__wasm_bindgen_func_elem_165535, __wasm_bindgen_func_elem_165730);
    return addHeapObject(i);
  }, __wbindgen_cast_0000000000000009: function(n, a) {
    const i = makeMutClosure(n, a, wasm.__wasm_bindgen_func_elem_180274, __wasm_bindgen_func_elem_180294);
    return addHeapObject(i);
  }, __wbindgen_cast_000000000000000a: function(n, a) {
    const i = makeMutClosure(n, a, wasm.__wasm_bindgen_func_elem_190749, __wasm_bindgen_func_elem_190755);
    return addHeapObject(i);
  }, __wbindgen_cast_000000000000000b: function(n, a) {
    const i = makeMutClosure(n, a, wasm.__wasm_bindgen_func_elem_190749, __wasm_bindgen_func_elem_190757);
    return addHeapObject(i);
  }, __wbindgen_cast_000000000000000c: function(n, a) {
    const i = makeMutClosure(n, a, wasm.__wasm_bindgen_func_elem_63600, __wasm_bindgen_func_elem_63689);
    return addHeapObject(i);
  }, __wbindgen_cast_000000000000000d: function(n, a) {
    const i = makeMutClosure(n, a, wasm.__wasm_bindgen_func_elem_63600, __wasm_bindgen_func_elem_63693);
    return addHeapObject(i);
  }, __wbindgen_cast_000000000000000e: function(n, a) {
    const i = makeMutClosure(n, a, wasm.__wasm_bindgen_func_elem_63600, __wasm_bindgen_func_elem_63689_13);
    return addHeapObject(i);
  }, __wbindgen_cast_000000000000000f: function(n, a) {
    const i = makeMutClosure(n, a, wasm.__wasm_bindgen_func_elem_63600, __wasm_bindgen_func_elem_63689_14);
    return addHeapObject(i);
  }, __wbindgen_cast_0000000000000010: function(n, a) {
    const i = makeMutClosure(n, a, wasm.__wasm_bindgen_func_elem_63600, __wasm_bindgen_func_elem_63689_15);
    return addHeapObject(i);
  }, __wbindgen_cast_0000000000000011: function(n, a) {
    const i = makeMutClosure(n, a, wasm.__wasm_bindgen_func_elem_63600, __wasm_bindgen_func_elem_63689_16);
    return addHeapObject(i);
  }, __wbindgen_cast_0000000000000012: function(n, a) {
    const i = makeMutClosure(n, a, wasm.__wasm_bindgen_func_elem_63600, __wasm_bindgen_func_elem_63689_17);
    return addHeapObject(i);
  }, __wbindgen_cast_0000000000000013: function(n, a) {
    const i = makeMutClosure(n, a, wasm.__wasm_bindgen_func_elem_63600, __wasm_bindgen_func_elem_63689_18);
    return addHeapObject(i);
  }, __wbindgen_cast_0000000000000014: function(n, a) {
    const i = makeMutClosure(n, a, wasm.__wasm_bindgen_func_elem_63600, __wasm_bindgen_func_elem_63689_19);
    return addHeapObject(i);
  }, __wbindgen_cast_0000000000000015: function(n, a) {
    const i = makeMutClosure(n, a, wasm.__wasm_bindgen_func_elem_63600, __wasm_bindgen_func_elem_63688);
    return addHeapObject(i);
  }, __wbindgen_cast_0000000000000016: function(n, a) {
    const i = makeMutClosure(n, a, wasm.__wasm_bindgen_func_elem_63600, __wasm_bindgen_func_elem_63701);
    return addHeapObject(i);
  }, __wbindgen_cast_0000000000000017: function(n, a) {
    const i = makeMutClosure(n, a, wasm.__wasm_bindgen_func_elem_9587, __wasm_bindgen_func_elem_9593);
    return addHeapObject(i);
  }, __wbindgen_cast_0000000000000018: function(n, a) {
    const i = makeMutClosure(n, a, wasm.__wasm_bindgen_func_elem_9609, __wasm_bindgen_func_elem_9629);
    return addHeapObject(i);
  }, __wbindgen_cast_0000000000000019: function(n, a) {
    const i = makeMutClosure(n, a, wasm.__wasm_bindgen_func_elem_12744, __wasm_bindgen_func_elem_12749);
    return addHeapObject(i);
  }, __wbindgen_cast_000000000000001a: function(n, a) {
    const i = makeMutClosure(n, a, wasm.__wasm_bindgen_func_elem_117989, __wasm_bindgen_func_elem_118016);
    return addHeapObject(i);
  }, __wbindgen_cast_000000000000001b: function(n) {
    return addHeapObject(n);
  }, __wbindgen_cast_000000000000001c: function(n) {
    return addHeapObject(n);
  }, __wbindgen_cast_000000000000001d: function(n, a) {
    const i = getArrayF32FromWasm0(n, a);
    return addHeapObject(i);
  }, __wbindgen_cast_000000000000001e: function(n, a) {
    const i = getArrayI16FromWasm0(n, a);
    return addHeapObject(i);
  }, __wbindgen_cast_000000000000001f: function(n, a) {
    const i = getArrayI32FromWasm0(n, a);
    return addHeapObject(i);
  }, __wbindgen_cast_0000000000000020: function(n, a) {
    const i = getArrayI8FromWasm0(n, a);
    return addHeapObject(i);
  }, __wbindgen_cast_0000000000000021: function(n, a) {
    const i = getArrayU16FromWasm0(n, a);
    return addHeapObject(i);
  }, __wbindgen_cast_0000000000000022: function(n, a) {
    const i = getArrayU32FromWasm0(n, a);
    return addHeapObject(i);
  }, __wbindgen_cast_0000000000000023: function(n, a) {
    const i = getArrayU8FromWasm0(n, a);
    return addHeapObject(i);
  }, __wbindgen_cast_0000000000000024: function(n, a) {
    const i = getStringFromWasm0(n, a);
    return addHeapObject(i);
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
            `, i = typeof URL.createObjectURL > "u" ? "data:application/javascript," + encodeURIComponent(a) : URL.createObjectURL(new Blob([a], { type: "text/javascript" })), r = passStringToWasm0(i, wasm.__wbindgen_export, wasm.__wbindgen_export2), f = WASM_VECTOR_LEN;
    getDataViewMemory0().setInt32(n + 4, f, true), getDataViewMemory0().setInt32(n + 0, r, true);
  }, __wbindgen_object_clone_ref: function(n) {
    const a = getObject(n);
    return addHeapObject(a);
  }, __wbindgen_object_drop_ref: function(n) {
    takeObject(n);
  }, memory: memory || new WebAssembly.Memory({ initial: 129, maximum: 65536, shared: true }) };
  return { __proto__: null, "./isometric_game_bg.js": import0 };
}
const lAudioContext = typeof AudioContext < "u" ? AudioContext : typeof webkitAudioContext < "u" ? webkitAudioContext : void 0;
function __wasm_bindgen_func_elem_15144(n, a) {
  wasm.__wasm_bindgen_func_elem_15144(n, a);
}
function __wasm_bindgen_func_elem_180294(n, a) {
  wasm.__wasm_bindgen_func_elem_180294(n, a);
}
function __wasm_bindgen_func_elem_63701(n, a) {
  wasm.__wasm_bindgen_func_elem_63701(n, a);
}
function __wasm_bindgen_func_elem_118016(n, a) {
  wasm.__wasm_bindgen_func_elem_118016(n, a);
}
function __wasm_bindgen_func_elem_128508(n, a, i) {
  wasm.__wasm_bindgen_func_elem_128508(n, a, addHeapObject(i));
}
function __wasm_bindgen_func_elem_13921(n, a, i) {
  wasm.__wasm_bindgen_func_elem_13921(n, a, addHeapObject(i));
}
function __wasm_bindgen_func_elem_13921_2(n, a, i) {
  wasm.__wasm_bindgen_func_elem_13921_2(n, a, addHeapObject(i));
}
function __wasm_bindgen_func_elem_13921_3(n, a, i) {
  wasm.__wasm_bindgen_func_elem_13921_3(n, a, addHeapObject(i));
}
function __wasm_bindgen_func_elem_14860(n, a, i) {
  wasm.__wasm_bindgen_func_elem_14860(n, a, addHeapObject(i));
}
function __wasm_bindgen_func_elem_165730(n, a, i) {
  wasm.__wasm_bindgen_func_elem_165730(n, a, addHeapObject(i));
}
function __wasm_bindgen_func_elem_190757(n, a, i) {
  wasm.__wasm_bindgen_func_elem_190757(n, a, addHeapObject(i));
}
function __wasm_bindgen_func_elem_63689(n, a, i) {
  wasm.__wasm_bindgen_func_elem_63689(n, a, addHeapObject(i));
}
function __wasm_bindgen_func_elem_63689_13(n, a, i) {
  wasm.__wasm_bindgen_func_elem_63689_13(n, a, addHeapObject(i));
}
function __wasm_bindgen_func_elem_63689_14(n, a, i) {
  wasm.__wasm_bindgen_func_elem_63689_14(n, a, addHeapObject(i));
}
function __wasm_bindgen_func_elem_63689_15(n, a, i) {
  wasm.__wasm_bindgen_func_elem_63689_15(n, a, addHeapObject(i));
}
function __wasm_bindgen_func_elem_63689_16(n, a, i) {
  wasm.__wasm_bindgen_func_elem_63689_16(n, a, addHeapObject(i));
}
function __wasm_bindgen_func_elem_63689_17(n, a, i) {
  wasm.__wasm_bindgen_func_elem_63689_17(n, a, addHeapObject(i));
}
function __wasm_bindgen_func_elem_63689_18(n, a, i) {
  wasm.__wasm_bindgen_func_elem_63689_18(n, a, addHeapObject(i));
}
function __wasm_bindgen_func_elem_63689_19(n, a, i) {
  wasm.__wasm_bindgen_func_elem_63689_19(n, a, addHeapObject(i));
}
function __wasm_bindgen_func_elem_63688(n, a, i) {
  wasm.__wasm_bindgen_func_elem_63688(n, a, isLikeNone(i) ? 0 : addHeapObject(i));
}
function __wasm_bindgen_func_elem_9593(n, a, i) {
  wasm.__wasm_bindgen_func_elem_9593(n, a, addHeapObject(i));
}
function __wasm_bindgen_func_elem_9629(n, a, i) {
  wasm.__wasm_bindgen_func_elem_9629(n, a, addHeapObject(i));
}
function __wasm_bindgen_func_elem_12749(n, a, i) {
  wasm.__wasm_bindgen_func_elem_12749(n, a, addHeapObject(i));
}
function __wasm_bindgen_func_elem_14862(n, a, i) {
  try {
    const b = wasm.__wbindgen_add_to_stack_pointer(-16);
    wasm.__wasm_bindgen_func_elem_14862(b, n, a, addHeapObject(i));
    var r = getDataViewMemory0().getInt32(b + 0, true), f = getDataViewMemory0().getInt32(b + 4, true);
    if (f) throw takeObject(r);
  } finally {
    wasm.__wbindgen_add_to_stack_pointer(16);
  }
}
function __wasm_bindgen_func_elem_190755(n, a, i) {
  try {
    const b = wasm.__wbindgen_add_to_stack_pointer(-16);
    wasm.__wasm_bindgen_func_elem_190755(b, n, a, addHeapObject(i));
    var r = getDataViewMemory0().getInt32(b + 0, true), f = getDataViewMemory0().getInt32(b + 4, true);
    if (f) throw takeObject(r);
  } finally {
    wasm.__wbindgen_add_to_stack_pointer(16);
  }
}
function __wasm_bindgen_func_elem_63693(n, a, i, r) {
  wasm.__wasm_bindgen_func_elem_63693(n, a, addHeapObject(i), addHeapObject(r));
}
function __wasm_bindgen_func_elem_194338(n, a, i, r) {
  wasm.__wasm_bindgen_func_elem_194338(n, a, addHeapObject(i), addHeapObject(r));
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
    const f = n.description;
    return f == null ? "Symbol" : `Symbol(${f})`;
  }
  if (a == "function") {
    const f = n.name;
    return typeof f == "string" && f.length > 0 ? `Function(${f})` : "Function";
  }
  if (Array.isArray(n)) {
    const f = n.length;
    let b = "[";
    f > 0 && (b += debugString(n[0]));
    for (let g = 1; g < f; g++) b += ", " + debugString(n[g]);
    return b += "]", b;
  }
  const i = /\[object ([^\]]+)\]/.exec(toString.call(n));
  let r;
  if (i && i.length > 1) r = i[1];
  else return toString.call(n);
  if (r == "Object") try {
    return "Object(" + JSON.stringify(n) + ")";
  } catch {
    return "Object";
  }
  return n instanceof Error ? `${n.name}: ${n.message}
${n.stack}` : r;
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
  const i = getDataViewMemory0(), r = [];
  for (let f = n; f < n + 4 * a; f += 4) r.push(takeObject(i.getUint32(f, true)));
  return r;
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
  } catch (i) {
    wasm.__wbindgen_export3(addHeapObject(i));
  }
}
let heap = new Array(1024).fill(void 0);
heap.push(void 0, null, true, false);
let heap_next = heap.length;
function isLikeNone(n) {
  return n == null;
}
function makeMutClosure(n, a, i, r) {
  const f = { a: n, b: a, cnt: 1, dtor: i }, b = (...g) => {
    f.cnt++;
    const h = f.a;
    f.a = 0;
    try {
      return r(h, f.b, ...g);
    } finally {
      f.a = h, b._wbg_cb_unref();
    }
  };
  return b._wbg_cb_unref = () => {
    --f.cnt === 0 && (f.dtor(f.a, f.b), f.a = 0, CLOSURE_DTORS.unregister(f));
  }, CLOSURE_DTORS.register(b, f, f), b;
}
function passStringToWasm0(n, a, i) {
  if (i === void 0) {
    const h = cachedTextEncoder.encode(n), y = a(h.length, 1) >>> 0;
    return getUint8ArrayMemory0().subarray(y, y + h.length).set(h), WASM_VECTOR_LEN = h.length, y;
  }
  let r = n.length, f = a(r, 1) >>> 0;
  const b = getUint8ArrayMemory0();
  let g = 0;
  for (; g < r; g++) {
    const h = n.charCodeAt(g);
    if (h > 127) break;
    b[f + g] = h;
  }
  if (g !== r) {
    g !== 0 && (n = n.slice(g)), f = i(f, r, r = g + n.length * 3, 1) >>> 0;
    const h = getUint8ArrayMemory0().subarray(f + g, f + r), y = cachedTextEncoder.encodeInto(n, h);
    g += y.written, f = i(f, r, g, 1) >>> 0;
  }
  return WASM_VECTOR_LEN = g, f;
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
  const i = cachedTextEncoder.encode(n);
  return a.set(i), { read: n.length, written: i.length };
});
let WASM_VECTOR_LEN = 0, wasm;
function __wbg_finalize_init(n, a, i) {
  if (wasm = n.exports, cachedDataViewMemory0 = null, cachedFloat32ArrayMemory0 = null, cachedInt16ArrayMemory0 = null, cachedInt32ArrayMemory0 = null, cachedInt8ArrayMemory0 = null, cachedUint16ArrayMemory0 = null, cachedUint32ArrayMemory0 = null, cachedUint8ArrayMemory0 = null, typeof i < "u" && (typeof i != "number" || i === 0 || i % 65536 !== 0)) throw new Error("invalid stack size");
  return wasm.__wbindgen_start(i), wasm;
}
async function __wbg_load(n, a) {
  if (typeof Response == "function" && n instanceof Response) {
    if (typeof WebAssembly.instantiateStreaming == "function") try {
      return await WebAssembly.instantiateStreaming(n, a);
    } catch (f) {
      if (n.ok && i(n.type) && n.headers.get("Content-Type") !== "application/wasm") console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", f);
      else throw f;
    }
    const r = await n.arrayBuffer();
    return await WebAssembly.instantiate(r, a);
  } else {
    const r = await WebAssembly.instantiate(n, a);
    return r instanceof WebAssembly.Instance ? { instance: r, module: n } : r;
  }
  function i(r) {
    switch (r) {
      case "basic":
      case "cors":
      case "default":
        return true;
    }
    return false;
  }
}
function initSync(n, a) {
  if (wasm !== void 0) return wasm;
  let i;
  n !== void 0 && (Object.getPrototypeOf(n) === Object.prototype ? { module: n, memory: a, thread_stack_size: i } = n : console.warn("using deprecated parameters for `initSync()`; pass a single object instead"));
  const r = __wbg_get_imports(a);
  n instanceof WebAssembly.Module || (n = new WebAssembly.Module(n));
  const f = new WebAssembly.Instance(n, r);
  return __wbg_finalize_init(f, n, i);
}
async function __wbg_init(n, a) {
  if (wasm !== void 0) return wasm;
  let i;
  n !== void 0 && (Object.getPrototypeOf(n) === Object.prototype ? { module_or_path: n, memory: a, thread_stack_size: i } = n : console.warn("using deprecated parameters for the initialization function; pass a single object instead")), n === void 0 && (n = new URL("/isometric/assets/isometric_game_bg.wasm", import.meta.url));
  const r = __wbg_get_imports(a);
  (typeof n == "string" || typeof Request == "function" && n instanceof Request || typeof URL == "function" && n instanceof URL) && (n = fetch(n));
  const { instance: f, module: b } = await __wbg_load(await n, r);
  return __wbg_finalize_init(f, b, i);
}
const isometric_game = Object.freeze(Object.defineProperty({ __proto__: null, default: __wbg_init, dispatch_action, get_chat_log_json, get_fps, get_hovered_object_json, get_object_registry_json, get_online_status, get_player_state_json, get_selected_object_json, get_signin_state_json, get_ui_chrome_json, go_online, greet, initSync, send_chat, set_signed_in, set_username, wasm_main, worker_count, worker_entry_point }, Symbol.toStringTag, { value: "Module" }));
function GlassPanel({ children: n, className: a = "" }) {
  return jsxRuntimeExports.jsx("div", { className: `bg-glass backdrop-blur-[4px] rounded-glass border border-glass-border shadow-glass pointer-events-auto ${a}`, children: n });
}
function HUD() {
  const [n, a] = reactExports.useState(null);
  return reactExports.useEffect(() => {
    const i = setInterval(() => {
      try {
        const r = get_player_state_json();
        r && a(JSON.parse(r));
      } catch {
      }
    }, 250);
    return () => clearInterval(i);
  }, []), n ? jsxRuntimeExports.jsx(GlassPanel, { className: "absolute top-12 right-4 md:top-14 md:right-6 px-3 py-1.5 md:px-4 md:py-2 pointer-events-none", children: jsxRuntimeExports.jsxs("div", { className: "text-[7px] md:text-[9px] text-text-muted", children: ["Pos: ", n.position.map((i) => i.toFixed(1)).join(", ")] }) }) : null;
}
const CAMERA_OFFSET = [15, 20, 15], VIEWPORT_HEIGHT = 20;
function computeCameraAxes() {
  const n = [-15, -20, -15], a = Math.sqrt(n[0] ** 2 + n[1] ** 2 + n[2] ** 2);
  n[0] /= a, n[1] /= a, n[2] /= a;
  const i = [0, 1, 0], r = [n[1] * i[2] - n[2] * i[1], n[2] * i[0] - n[0] * i[2], n[0] * i[1] - n[1] * i[0]], f = Math.sqrt(r[0] ** 2 + r[1] ** 2 + r[2] ** 2);
  r[0] /= f, r[1] /= f, r[2] /= f;
  const b = [r[1] * n[2] - r[2] * n[1], r[2] * n[0] - r[0] * n[2], r[0] * n[1] - r[1] * n[0]];
  return { right: r, up: b, forward: n };
}
const AXES = computeCameraAxes();
function dot(n, a) {
  return n[0] * a[0] + n[1] * a[1] + n[2] * a[2];
}
function worldToScreen(n, a, i, r) {
  const f = [n[0] - a[0], n[1] - a[1], n[2] - a[2]], b = VIEWPORT_HEIGHT / 2, g = i / r, h = b * g, y = dot(f, AXES.right) / h, w = dot(f, AXES.up) / b;
  return Math.abs(y) > 1.2 || Math.abs(w) > 1.2 ? null : { x: (y + 1) / 2 * i, y: (1 - w) / 2 * r };
}
const OBJECT_NAMES = { tree: "Tree", crate: "Wooden Crate", crystal: "Crystal", pillar: "Stone Pillar", sphere: "Metallic Sphere", flower: "Flower", rock: "Rock", mushroom: "Mushroom" }, FLOWER_NAMES = { tulip: "Tulip", daisy: "Daisy", lavender: "Lavender", bell: "Bellflower", wildflower: "Wildflower", sunflower: "Sunflower", rose: "Rose", cornflower: "Cornflower", allium: "Allium", blue_orchid: "Blue Orchid" }, ROCK_NAMES = { boulder: "Boulder", mossy_rock: "Mossy Rock", ore_copper: "Copper Ore", ore_iron: "Iron Ore", ore_crystal: "Crystal Ore" }, MUSHROOM_NAMES = { porcini: "Porcini", chanterelle: "Chanterelle", fly_agaric: "Fly Agaric" };
function ObjectLabel() {
  const [n, a] = reactExports.useState(null);
  return reactExports.useEffect(() => {
    const i = setInterval(() => {
      try {
        const r = get_hovered_object_json();
        if (!r) {
          a(null);
          return;
        }
        const f = JSON.parse(r), b = get_player_state_json();
        if (!b) {
          a(null);
          return;
        }
        const g = JSON.parse(b), h = [g.position[0] + CAMERA_OFFSET[0], g.position[1] + CAMERA_OFFSET[1], g.position[2] + CAMERA_OFFSET[2]], y = [f.position[0], f.position[1] + 1.5, f.position[2]], w = worldToScreen(y, h, window.innerWidth, window.innerHeight);
        if (!w) {
          a(null);
          return;
        }
        let z = OBJECT_NAMES[f.kind] ?? f.kind;
        f.kind === "flower" && f.sub_kind && (z = FLOWER_NAMES[f.sub_kind] ?? z), f.kind === "rock" && f.sub_kind && (z = ROCK_NAMES[f.sub_kind] ?? z), f.kind === "mushroom" && f.sub_kind && (z = MUSHROOM_NAMES[f.sub_kind] ?? z), a({ name: z, screenX: w.x, screenY: w.y });
      } catch {
        a(null);
      }
    }, 50);
    return () => clearInterval(i);
  }, []), n ? jsxRuntimeExports.jsx("div", { className: "absolute pointer-events-none", style: { left: n.screenX, top: n.screenY, transform: "translate(-50%, -100%)" }, children: jsxRuntimeExports.jsx("div", { className: `px-2 py-1 md:px-3 md:py-1.5 bg-[#1e1408]/90 border border-panel-border
					text-[7px] md:text-[10px] text-[#c8a832] whitespace-nowrap`, children: n.name }) }) : null;
}
const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
function detectTauri() {
  return !!(window.__TAURI_INTERNALS__ || window.__TAURI__);
}
async function fetchSignInState() {
  if (detectTauri()) try {
    return await invoke("get_signin_state");
  } catch {
    return null;
  }
  try {
    const a = (await __vitePreload(() => Promise.resolve().then(() => isometric_game), void 0)).get_signin_state_json;
    if (typeof a != "function") return null;
    const i = a();
    return i ? JSON.parse(i) : null;
  } catch {
    return null;
  }
}
async function submitUsername(n) {
  if (detectTauri()) {
    await invoke("set_username", { username: n });
    return;
  }
  const i = (await __vitePreload(() => Promise.resolve().then(() => isometric_game), void 0)).set_username;
  typeof i == "function" && i(n);
}
function UsernameModal() {
  const [n, a] = reactExports.useState(null), [i, r] = reactExports.useState(""), [f, b] = reactExports.useState(null), [g, h] = reactExports.useState(false);
  reactExports.useEffect(() => {
    let w = false;
    const z = async () => {
      const U = await fetchSignInState();
      w || a(U);
    };
    z();
    const R = setInterval(z, 1500);
    return () => {
      w = true, clearInterval(R);
    };
  }, []);
  const y = reactExports.useCallback(async (w) => {
    w.preventDefault();
    const z = i.trim();
    if (!USERNAME_RE.test(z)) {
      b("3\u201320 chars, letters / numbers / underscore only.");
      return;
    }
    h(true), b(null);
    try {
      await submitUsername(z);
    } catch (R) {
      b(String((R == null ? void 0 : R.message) ?? R));
    } finally {
      h(false);
    }
  }, [i]);
  return !n || !n.jwt_valid || n.username ? null : jsxRuntimeExports.jsx("div", { className: "fixed inset-0 z-[200] flex items-center justify-center bg-black/70 pointer-events-auto", children: jsxRuntimeExports.jsxs(GlassPanel, { className: "px-6 py-5 max-w-sm w-[92%] flex flex-col gap-3", children: [jsxRuntimeExports.jsx("h2", { className: "text-base font-semibold", children: "Choose your KBVE username" }), jsxRuntimeExports.jsx("p", { className: "text-xs text-text-muted", children: "This is the name other players will see in chat and on the leaderboards. 3\u201320 characters, letters / numbers / underscore." }), jsxRuntimeExports.jsxs("form", { onSubmit: y, className: "flex flex-col gap-2", children: [jsxRuntimeExports.jsx("input", { type: "text", autoFocus: true, maxLength: 20, value: i, onChange: (w) => r(w.target.value), placeholder: "e.g. h0lybyte", className: "bg-black/40 border border-glass-border rounded-glass px-3 py-2 text-sm outline-none focus:border-accent", disabled: g }), f && jsxRuntimeExports.jsx("div", { className: "text-xs text-red-400", children: f }), jsxRuntimeExports.jsx("button", { type: "submit", disabled: g || !i.trim(), className: "bg-accent/80 hover:bg-accent disabled:opacity-50 text-white text-sm font-medium rounded-glass px-4 py-2 transition", children: g ? "Submitting\u2026" : "Set username" })] })] }) });
}
const MODAL_CLOSE_DISTANCE = 6, ACTION_DISTANCE = 3;
function xzDistance(n, a) {
  const i = n[0] - a[0], r = n[2] - a[2];
  return Math.sqrt(i * i + r * r);
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
function ActionContent({ info: n, objectPos: a, entityId: i }) {
  return jsxRuntimeExports.jsxs("div", { className: "space-y-2 md:space-y-3", children: [jsxRuntimeExports.jsx("div", { className: "px-2 py-1.5 md:px-3 md:py-2 bg-[#1e1408] border border-[#5a4a2a]", children: jsxRuntimeExports.jsx("p", { className: "text-[8px] md:text-xs text-text leading-relaxed", children: n.description }) }), jsxRuntimeExports.jsx("div", { className: "flex justify-center pt-1", children: jsxRuntimeExports.jsx("button", { className: `px-4 py-1.5 md:px-6 md:py-2 text-[8px] md:text-xs text-text
						bg-btn border-2 border-btn-border
						shadow-[inset_0_1px_0_rgba(255,255,255,0.15),0_2px_0_#1a3a10]
						hover:bg-btn-hover active:bg-btn-active active:shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]
						transition-colors cursor-pointer`, onClick: () => {
    const r = getPlayerPosition();
    if (r && xzDistance(r, a) > ACTION_DISTANCE) {
      gameEvents.emit("toast:show", { message: "You are too far away.", severity: "warning" }), gameEvents.emit("modal:close");
      return;
    }
    const f = DISPATCH_ACTIONS[n.action];
    if (f) {
      dispatch_action(i, f);
      const b = f === "chop_tree" ? "Chopping" : f === "mine_rock" ? "Mining" : "Collecting";
      gameEvents.emit("toast:show", { message: `${b} ${n.title}...`, severity: "info" });
    } else gameEvents.emit("toast:show", { message: `${n.action}: ${n.title}`, severity: "info" });
    gameEvents.emit("modal:close");
  }, children: n.action }) })] });
}
function useObjectSelection() {
  const n = reactExports.useRef(false), a = reactExports.useRef(null);
  reactExports.useEffect(() => {
    if (!!(window.__TAURI_INTERNALS__ || window.__TAURI__)) return;
    const r = setInterval(() => {
      if (!n.current) try {
        const b = get_selected_object_json();
        if (!b) return;
        const g = JSON.parse(b);
        let h = OBJECT_INFO[g.kind];
        if (!h) return;
        if (g.kind === "flower" && g.sub_kind) {
          const y = FLOWER_INFO[g.sub_kind];
          y && (h = { ...h, title: y.title, description: y.description });
        }
        if (g.kind === "rock" && g.sub_kind) {
          const y = ROCK_INFO[g.sub_kind];
          y && (h = { title: y.title, description: y.description, action: y.action });
        }
        if (g.kind === "mushroom" && g.sub_kind) {
          const y = MUSHROOM_INFO[g.sub_kind];
          y && (h = { ...h, title: y.title, description: y.description });
        }
        n.current = true, a.current = g.position, gameEvents.emit("modal:open", { title: h.title, size: "sm", content: jsxRuntimeExports.jsx(ActionContent, { info: h, objectPos: g.position, entityId: g.entity_id }), onClose: () => {
          n.current = false, a.current = null;
        } });
      } catch {
      }
    }, 100), f = setInterval(() => {
      if (!n.current || !a.current) return;
      const b = getPlayerPosition();
      b && xzDistance(b, a.current) > MODAL_CLOSE_DISTANCE && gameEvents.emit("modal:close");
    }, 250);
    return () => {
      clearInterval(r), clearInterval(f);
    };
  }, []);
}
function App() {
  return useObjectSelection(), jsxRuntimeExports.jsxs("div", { className: "fixed inset-0 font-game text-text rpg-text-shadow", style: { pointerEvents: "none" }, children: [jsxRuntimeExports.jsx(DragBar, {}), jsxRuntimeExports.jsx(HUD, {}), jsxRuntimeExports.jsx(ObjectLabel, {}), jsxRuntimeExports.jsx(UsernameModal, {}), jsxRuntimeExports.jsx(ChatInput, {})] });
}
function setLoadingProgress(n, a) {
  const i = document.getElementById("loading-status"), r = document.getElementById("loading-bar");
  i && (i.textContent = n), r && (r.style.width = a + "%");
}
function kickPaint() {
  const n = () => {
    document.documentElement.getBoundingClientRect(), window.dispatchEvent(new Event("resize"));
  };
  let a = 0;
  const i = () => {
    n(), ++a < 36 && requestAnimationFrame(i);
  };
  requestAnimationFrame(i), setInterval(n, 500), (async () => {
    try {
      const r = await __vitePreload(() => Promise.resolve().then(() => window$1), void 0), f = r.getCurrentWindow(), b = await f.innerSize(), g = r.PhysicalSize;
      console.log("[paint] window-nudge starting; size=", b), await f.setSize(new g(b.width + 20, b.height + 20)), await new Promise((h) => setTimeout(h, 250)), await f.setSize(new g(b.width, b.height)), await new Promise((h) => setTimeout(h, 100)), await f.setSize(new g(b.width + 1, b.height)), await new Promise((h) => setTimeout(h, 100)), await f.setSize(new g(b.width, b.height)), console.log("[paint] window-nudge complete");
    } catch (r) {
      console.warn("[paint] window-nudge failed", r);
    }
  })();
}
function hideLoadingScreen() {
  const n = document.getElementById("game-loading");
  n && (n.style.opacity = "0", n.style.transition = "opacity 0.4s ease", setTimeout(() => n.remove(), 400));
}
function resolveEndpoints() {
  const n = window.location.hostname, a = window.location.protocol, i = a === "https:", r = n === "localhost" || n === "127.0.0.1", f = i ? "wss" : "ws";
  if (r) {
    const b = window.location.port || (i ? "443" : "80");
    return { api_base: `${a}//${n}:${b}`, ws_url: `${f}://${n}:5000`, wt_url: `https://${n}:5001` };
  }
  return { api_base: `https://${n}`, ws_url: `wss://${n}/ws`, wt_url: `https://wt.${n}:5001` };
}
function probeClientProfile() {
  const n = globalThis, a = resolveEndpoints(), i = { secure_context: window.location.protocol === "https:" || window.location.hostname === "localhost", has_webgpu: !!navigator.gpu, has_webtransport: typeof n.WebTransport == "function", has_shared_array_buffer: typeof n.SharedArrayBuffer < "u", has_offscreen_canvas: typeof n.OffscreenCanvas == "function", hardware_concurrency: navigator.hardwareConcurrency || 1, ...a, timestamp: Date.now() };
  try {
    localStorage.setItem("kbve_client_profile", JSON.stringify(i));
  } catch {
    console.warn("[profile] localStorage unavailable, WASM will use defaults");
  }
  return i;
}
async function bootstrap() {
  const n = probeClientProfile();
  if (!!(window.__TAURI_INTERNALS__ || window.__TAURI__)) {
    setLoadingProgress("Native build \u2014 mounting UI", 80);
    const h = document.getElementById("root");
    h && (ReactDOM.createRoot(h).render(jsxRuntimeExports.jsx(React.StrictMode, { children: jsxRuntimeExports.jsx(GameUIProvider, { children: jsxRuntimeExports.jsx(App, {}) }) })), kickPaint()), setLoadingProgress("Ready", 100), hideLoadingScreen();
    return;
  }
  if (!n.has_webgpu) {
    const h = document.getElementById("root");
    h && (h.innerHTML = '<div style="color:#fff;padding:2rem;text-align:center"><h2>WebGPU Not Available</h2><p>This browser does not support WebGPU (Chrome 113+, Edge 113+, Safari 18+).</p></div>', h.style.pointerEvents = "auto");
    return;
  }
  setLoadingProgress("Loading game module...", 20);
  const i = await __vitePreload(() => Promise.resolve().then(() => isometric_game), void 0), { default: r } = i;
  setLoadingProgress("Initializing WebGPU...", 60);
  const f = await r(), b = window.__KBVE_SESSION_PROBE__, g = b ? await b : null;
  if (g && typeof i.set_signed_in == "function") try {
    i.set_signed_in(g);
  } catch (h) {
    console.warn("[auth] set_signed_in threw", h);
  }
  if (typeof SharedArrayBuffer < "u" && "worker_entry_point" in f) {
    const h = Math.max(1, (navigator.hardwareConcurrency || 4) - 1);
    setLoadingProgress(`Spawning ${h} workers...`, 75);
    const y = new URL("/isometric/assets/isometric_game_bg.wasm", import.meta.url), w = f.memory, z = new URL("/isometric/assets/isometric_game.js", import.meta.url).href;
    try {
      const R = await WebAssembly.compileStreaming(fetch(y)), U = "/isometric/";
      for (let re = 0; re < h; re++) new Worker(`${U}wasm-worker.js`, { type: "module" }).postMessage({ module: R, memory: w, bindgenUrl: z });
      console.log(`[pthreads] Spawned ${h} WASM worker threads`);
    } catch (R) {
      console.warn("[pthreads] Failed to compile WASM for workers:", R);
    }
  }
  setLoadingProgress("Starting...", 90), ReactDOM.createRoot(document.getElementById("root")).render(jsxRuntimeExports.jsx(React.StrictMode, { children: jsxRuntimeExports.jsx(GameUIProvider, { children: jsxRuntimeExports.jsx(App, {}) }) })), setLoadingProgress("Ready", 100), hideLoadingScreen();
}
bootstrap().catch((n) => {
  setLoadingProgress("Failed to load game", 0), console.error(n);
});
