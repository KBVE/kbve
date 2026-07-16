var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
(function() {
  const s = document.createElement("link").relList;
  if (s && s.supports && s.supports("modulepreload")) return;
  for (const i of document.querySelectorAll('link[rel="modulepreload"]')) a(i);
  new MutationObserver((i) => {
    for (const _ of i) if (_.type === "childList") for (const d of _.addedNodes) d.tagName === "LINK" && d.rel === "modulepreload" && a(d);
  }).observe(document, { childList: true, subtree: true });
  function n(i) {
    const _ = {};
    return i.integrity && (_.integrity = i.integrity), i.referrerPolicy && (_.referrerPolicy = i.referrerPolicy), i.crossOrigin === "use-credentials" ? _.credentials = "include" : i.crossOrigin === "anonymous" ? _.credentials = "omit" : _.credentials = "same-origin", _;
  }
  function a(i) {
    if (i.ep) return;
    i.ep = true;
    const _ = n(i);
    fetch(i.href, _);
  }
})();
const Qg = "modulepreload", Zg = function(o) {
  return "/isometric/" + o;
}, Cb = {}, $a = function(s, n, a) {
  let i = Promise.resolve();
  if (n && n.length > 0) {
    let d = function(h) {
      return Promise.all(h.map((B) => Promise.resolve(B).then((R) => ({ status: "fulfilled", value: R }), (R) => ({ status: "rejected", reason: R }))));
    };
    document.getElementsByTagName("link");
    const y = document.querySelector("meta[property=csp-nonce]"), S = (y == null ? void 0 : y.nonce) || (y == null ? void 0 : y.getAttribute("nonce"));
    i = d(n.map((h) => {
      if (h = Zg(h), h in Cb) return;
      Cb[h] = true;
      const B = h.endsWith(".css"), R = B ? '[rel="stylesheet"]' : "";
      if (document.querySelector(`link[href="${h}"]${R}`)) return;
      const X = document.createElement("link");
      if (X.rel = B ? "stylesheet" : Qg, B || (X.as = "script"), X.crossOrigin = "", X.href = h, S && X.setAttribute("nonce", S), document.head.appendChild(X), B) return new Promise((ie, qe) => {
        X.addEventListener("load", ie), X.addEventListener("error", () => qe(new Error(`Unable to preload CSS for ${h}`)));
      });
    }));
  }
  function _(d) {
    const y = new Event("vite:preloadError", { cancelable: true });
    if (y.payload = d, window.dispatchEvent(y), !y.defaultPrevented) throw d;
  }
  return i.then((d) => {
    for (const y of d || []) y.status === "rejected" && _(y.reason);
    return s().catch(_);
  });
};
function nd(o) {
  return o && o.__esModule && Object.prototype.hasOwnProperty.call(o, "default") ? o.default : o;
}
var $r = { exports: {} }, Ku = {};
/**
* @license React
* react-jsx-runtime.production.js
*
* Copyright (c) Meta Platforms, Inc. and affiliates.
*
* This source code is licensed under the MIT license found in the
* LICENSE file in the root directory of this source tree.
*/
var Rb;
function Kg() {
  if (Rb) return Ku;
  Rb = 1;
  var o = Symbol.for("react.transitional.element"), s = Symbol.for("react.fragment");
  function n(a, i, _) {
    var d = null;
    if (_ !== void 0 && (d = "" + _), i.key !== void 0 && (d = "" + i.key), "key" in i) {
      _ = {};
      for (var y in i) y !== "key" && (_[y] = i[y]);
    } else _ = i;
    return i = _.ref, { $$typeof: o, type: a, key: d, ref: i !== void 0 ? i : null, props: _ };
  }
  return Ku.Fragment = s, Ku.jsx = n, Ku.jsxs = n, Ku;
}
var Ub;
function Jg() {
  return Ub || (Ub = 1, $r.exports = Kg()), $r.exports;
}
var V = Jg(), Pr = { exports: {} }, $ = {};
/**
* @license React
* react.production.js
*
* Copyright (c) Meta Platforms, Inc. and affiliates.
*
* This source code is licensed under the MIT license found in the
* LICENSE file in the root directory of this source tree.
*/
var Bb;
function kg() {
  if (Bb) return $;
  Bb = 1;
  var o = Symbol.for("react.transitional.element"), s = Symbol.for("react.portal"), n = Symbol.for("react.fragment"), a = Symbol.for("react.strict_mode"), i = Symbol.for("react.profiler"), _ = Symbol.for("react.consumer"), d = Symbol.for("react.context"), y = Symbol.for("react.forward_ref"), S = Symbol.for("react.suspense"), h = Symbol.for("react.memo"), B = Symbol.for("react.lazy"), R = Symbol.for("react.activity"), X = Symbol.iterator;
  function ie(x) {
    return x === null || typeof x != "object" ? null : (x = X && x[X] || x["@@iterator"], typeof x == "function" ? x : null);
  }
  var qe = { isMounted: function() {
    return false;
  }, enqueueForceUpdate: function() {
  }, enqueueReplaceState: function() {
  }, enqueueSetState: function() {
  } }, ne = Object.assign, oe = {};
  function Me(x, j, Y) {
    this.props = x, this.context = j, this.refs = oe, this.updater = Y || qe;
  }
  Me.prototype.isReactComponent = {}, Me.prototype.setState = function(x, j) {
    if (typeof x != "object" && typeof x != "function" && x != null) throw Error("takes an object of state variables to update or a function which returns an object of state variables.");
    this.updater.enqueueSetState(this, x, j, "setState");
  }, Me.prototype.forceUpdate = function(x) {
    this.updater.enqueueForceUpdate(this, x, "forceUpdate");
  };
  function Ke() {
  }
  Ke.prototype = Me.prototype;
  function Ve(x, j, Y) {
    this.props = x, this.context = j, this.refs = oe, this.updater = Y || qe;
  }
  var ot = Ve.prototype = new Ke();
  ot.constructor = Ve, ne(ot, Me.prototype), ot.isPureReactComponent = true;
  var Yt = Array.isArray;
  function tt() {
  }
  var se = { H: null, A: null, T: null, S: null }, nt = Object.prototype.hasOwnProperty;
  function Vt(x, j, Y) {
    var Z = Y.ref;
    return { $$typeof: o, type: x, key: j, ref: Z !== void 0 ? Z : null, props: Y };
  }
  function sa(x, j) {
    return Vt(x.type, j, x.props);
  }
  function Xt(x) {
    return typeof x == "object" && x !== null && x.$$typeof === o;
  }
  function at(x) {
    var j = { "=": "=0", ":": "=2" };
    return "$" + x.replace(/[=:]/g, function(Y) {
      return j[Y];
    });
  }
  var Xn = /\/+/g;
  function kt(x, j) {
    return typeof x == "object" && x !== null && x.key != null ? at("" + x.key) : j.toString(36);
  }
  function jt(x) {
    switch (x.status) {
      case "fulfilled":
        return x.value;
      case "rejected":
        throw x.reason;
      default:
        switch (typeof x.status == "string" ? x.then(tt, tt) : (x.status = "pending", x.then(function(j) {
          x.status === "pending" && (x.status = "fulfilled", x.value = j);
        }, function(j) {
          x.status === "pending" && (x.status = "rejected", x.reason = j);
        })), x.status) {
          case "fulfilled":
            return x.value;
          case "rejected":
            throw x.reason;
        }
    }
    throw x;
  }
  function C(x, j, Y, Z, P) {
    var ue = typeof x;
    (ue === "undefined" || ue === "boolean") && (x = null);
    var we = false;
    if (x === null) we = true;
    else switch (ue) {
      case "bigint":
      case "string":
      case "number":
        we = true;
        break;
      case "object":
        switch (x.$$typeof) {
          case o:
          case s:
            we = true;
            break;
          case B:
            return we = x._init, C(we(x._payload), j, Y, Z, P);
        }
    }
    if (we) return P = P(x), we = Z === "" ? "." + kt(x, 0) : Z, Yt(P) ? (Y = "", we != null && (Y = we.replace(Xn, "$&/") + "/"), C(P, j, Y, "", function(Pa) {
      return Pa;
    })) : P != null && (Xt(P) && (P = sa(P, Y + (P.key == null || x && x.key === P.key ? "" : ("" + P.key).replace(Xn, "$&/") + "/") + we)), j.push(P)), 1;
    we = 0;
    var Pe = Z === "" ? "." : Z + ":";
    if (Yt(x)) for (var Ue = 0; Ue < x.length; Ue++) Z = x[Ue], ue = Pe + kt(Z, Ue), we += C(Z, j, Y, ue, P);
    else if (Ue = ie(x), typeof Ue == "function") for (x = Ue.call(x), Ue = 0; !(Z = x.next()).done; ) Z = Z.value, ue = Pe + kt(Z, Ue++), we += C(Z, j, Y, ue, P);
    else if (ue === "object") {
      if (typeof x.then == "function") return C(jt(x), j, Y, Z, P);
      throw j = String(x), Error("Objects are not valid as a React child (found: " + (j === "[object Object]" ? "object with keys {" + Object.keys(x).join(", ") + "}" : j) + "). If you meant to render a collection of children, use an array instead.");
    }
    return we;
  }
  function G(x, j, Y) {
    if (x == null) return x;
    var Z = [], P = 0;
    return C(x, Z, "", "", function(ue) {
      return j.call(Y, ue, P++);
    }), Z;
  }
  function I(x) {
    if (x._status === -1) {
      var j = x._result;
      j = j(), j.then(function(Y) {
        (x._status === 0 || x._status === -1) && (x._status = 1, x._result = Y);
      }, function(Y) {
        (x._status === 0 || x._status === -1) && (x._status = 2, x._result = Y);
      }), x._status === -1 && (x._status = 0, x._result = j);
    }
    if (x._status === 1) return x._result.default;
    throw x._result;
  }
  var pe = typeof reportError == "function" ? reportError : function(x) {
    if (typeof window == "object" && typeof window.ErrorEvent == "function") {
      var j = new window.ErrorEvent("error", { bubbles: true, cancelable: true, message: typeof x == "object" && x !== null && typeof x.message == "string" ? String(x.message) : String(x), error: x });
      if (!window.dispatchEvent(j)) return;
    } else if (typeof process == "object" && typeof process.emit == "function") {
      process.emit("uncaughtException", x);
      return;
    }
    console.error(x);
  }, Ae = { map: G, forEach: function(x, j, Y) {
    G(x, function() {
      j.apply(this, arguments);
    }, Y);
  }, count: function(x) {
    var j = 0;
    return G(x, function() {
      j++;
    }), j;
  }, toArray: function(x) {
    return G(x, function(j) {
      return j;
    }) || [];
  }, only: function(x) {
    if (!Xt(x)) throw Error("React.Children.only expected to receive a single React element child.");
    return x;
  } };
  return $.Activity = R, $.Children = Ae, $.Component = Me, $.Fragment = n, $.Profiler = i, $.PureComponent = Ve, $.StrictMode = a, $.Suspense = S, $.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = se, $.__COMPILER_RUNTIME = { __proto__: null, c: function(x) {
    return se.H.useMemoCache(x);
  } }, $.cache = function(x) {
    return function() {
      return x.apply(null, arguments);
    };
  }, $.cacheSignal = function() {
    return null;
  }, $.cloneElement = function(x, j, Y) {
    if (x == null) throw Error("The argument must be a React element, but you passed " + x + ".");
    var Z = ne({}, x.props), P = x.key;
    if (j != null) for (ue in j.key !== void 0 && (P = "" + j.key), j) !nt.call(j, ue) || ue === "key" || ue === "__self" || ue === "__source" || ue === "ref" && j.ref === void 0 || (Z[ue] = j[ue]);
    var ue = arguments.length - 2;
    if (ue === 1) Z.children = Y;
    else if (1 < ue) {
      for (var we = Array(ue), Pe = 0; Pe < ue; Pe++) we[Pe] = arguments[Pe + 2];
      Z.children = we;
    }
    return Vt(x.type, P, Z);
  }, $.createContext = function(x) {
    return x = { $$typeof: d, _currentValue: x, _currentValue2: x, _threadCount: 0, Provider: null, Consumer: null }, x.Provider = x, x.Consumer = { $$typeof: _, _context: x }, x;
  }, $.createElement = function(x, j, Y) {
    var Z, P = {}, ue = null;
    if (j != null) for (Z in j.key !== void 0 && (ue = "" + j.key), j) nt.call(j, Z) && Z !== "key" && Z !== "__self" && Z !== "__source" && (P[Z] = j[Z]);
    var we = arguments.length - 2;
    if (we === 1) P.children = Y;
    else if (1 < we) {
      for (var Pe = Array(we), Ue = 0; Ue < we; Ue++) Pe[Ue] = arguments[Ue + 2];
      P.children = Pe;
    }
    if (x && x.defaultProps) for (Z in we = x.defaultProps, we) P[Z] === void 0 && (P[Z] = we[Z]);
    return Vt(x, ue, P);
  }, $.createRef = function() {
    return { current: null };
  }, $.forwardRef = function(x) {
    return { $$typeof: y, render: x };
  }, $.isValidElement = Xt, $.lazy = function(x) {
    return { $$typeof: B, _payload: { _status: -1, _result: x }, _init: I };
  }, $.memo = function(x, j) {
    return { $$typeof: h, type: x, compare: j === void 0 ? null : j };
  }, $.startTransition = function(x) {
    var j = se.T, Y = {};
    se.T = Y;
    try {
      var Z = x(), P = se.S;
      P !== null && P(Y, Z), typeof Z == "object" && Z !== null && typeof Z.then == "function" && Z.then(tt, pe);
    } catch (ue) {
      pe(ue);
    } finally {
      j !== null && Y.types !== null && (j.types = Y.types), se.T = j;
    }
  }, $.unstable_useCacheRefresh = function() {
    return se.H.useCacheRefresh();
  }, $.use = function(x) {
    return se.H.use(x);
  }, $.useActionState = function(x, j, Y) {
    return se.H.useActionState(x, j, Y);
  }, $.useCallback = function(x, j) {
    return se.H.useCallback(x, j);
  }, $.useContext = function(x) {
    return se.H.useContext(x);
  }, $.useDebugValue = function() {
  }, $.useDeferredValue = function(x, j) {
    return se.H.useDeferredValue(x, j);
  }, $.useEffect = function(x, j) {
    return se.H.useEffect(x, j);
  }, $.useEffectEvent = function(x) {
    return se.H.useEffectEvent(x);
  }, $.useId = function() {
    return se.H.useId();
  }, $.useImperativeHandle = function(x, j, Y) {
    return se.H.useImperativeHandle(x, j, Y);
  }, $.useInsertionEffect = function(x, j) {
    return se.H.useInsertionEffect(x, j);
  }, $.useLayoutEffect = function(x, j) {
    return se.H.useLayoutEffect(x, j);
  }, $.useMemo = function(x, j) {
    return se.H.useMemo(x, j);
  }, $.useOptimistic = function(x, j) {
    return se.H.useOptimistic(x, j);
  }, $.useReducer = function(x, j, Y) {
    return se.H.useReducer(x, j, Y);
  }, $.useRef = function(x) {
    return se.H.useRef(x);
  }, $.useState = function(x) {
    return se.H.useState(x);
  }, $.useSyncExternalStore = function(x, j, Y) {
    return se.H.useSyncExternalStore(x, j, Y);
  }, $.useTransition = function() {
    return se.H.useTransition();
  }, $.version = "19.2.7", $;
}
var Nb;
function pf() {
  return Nb || (Nb = 1, Pr.exports = kg()), Pr.exports;
}
var F = pf();
const jb = nd(F);
var ef = { exports: {} }, Ju = {}, tf = { exports: {} }, nf = {};
/**
* @license React
* scheduler.production.js
*
* Copyright (c) Meta Platforms, Inc. and affiliates.
*
* This source code is licensed under the MIT license found in the
* LICENSE file in the root directory of this source tree.
*/
var qb;
function Wg() {
  return qb || (qb = 1, (function(o) {
    function s(C, G) {
      var I = C.length;
      C.push(G);
      e: for (; 0 < I; ) {
        var pe = I - 1 >>> 1, Ae = C[pe];
        if (0 < i(Ae, G)) C[pe] = G, C[I] = Ae, I = pe;
        else break e;
      }
    }
    function n(C) {
      return C.length === 0 ? null : C[0];
    }
    function a(C) {
      if (C.length === 0) return null;
      var G = C[0], I = C.pop();
      if (I !== G) {
        C[0] = I;
        e: for (var pe = 0, Ae = C.length, x = Ae >>> 1; pe < x; ) {
          var j = 2 * (pe + 1) - 1, Y = C[j], Z = j + 1, P = C[Z];
          if (0 > i(Y, I)) Z < Ae && 0 > i(P, Y) ? (C[pe] = P, C[Z] = I, pe = Z) : (C[pe] = Y, C[j] = I, pe = j);
          else if (Z < Ae && 0 > i(P, I)) C[pe] = P, C[Z] = I, pe = Z;
          else break e;
        }
      }
      return G;
    }
    function i(C, G) {
      var I = C.sortIndex - G.sortIndex;
      return I !== 0 ? I : C.id - G.id;
    }
    if (o.unstable_now = void 0, typeof performance == "object" && typeof performance.now == "function") {
      var _ = performance;
      o.unstable_now = function() {
        return _.now();
      };
    } else {
      var d = Date, y = d.now();
      o.unstable_now = function() {
        return d.now() - y;
      };
    }
    var S = [], h = [], B = 1, R = null, X = 3, ie = false, qe = false, ne = false, oe = false, Me = typeof setTimeout == "function" ? setTimeout : null, Ke = typeof clearTimeout == "function" ? clearTimeout : null, Ve = typeof setImmediate < "u" ? setImmediate : null;
    function ot(C) {
      for (var G = n(h); G !== null; ) {
        if (G.callback === null) a(h);
        else if (G.startTime <= C) a(h), G.sortIndex = G.expirationTime, s(S, G);
        else break;
        G = n(h);
      }
    }
    function Yt(C) {
      if (ne = false, ot(C), !qe) if (n(S) !== null) qe = true, tt || (tt = true, at());
      else {
        var G = n(h);
        G !== null && jt(Yt, G.startTime - C);
      }
    }
    var tt = false, se = -1, nt = 5, Vt = -1;
    function sa() {
      return oe ? true : !(o.unstable_now() - Vt < nt);
    }
    function Xt() {
      if (oe = false, tt) {
        var C = o.unstable_now();
        Vt = C;
        var G = true;
        try {
          e: {
            qe = false, ne && (ne = false, Ke(se), se = -1), ie = true;
            var I = X;
            try {
              t: {
                for (ot(C), R = n(S); R !== null && !(R.expirationTime > C && sa()); ) {
                  var pe = R.callback;
                  if (typeof pe == "function") {
                    R.callback = null, X = R.priorityLevel;
                    var Ae = pe(R.expirationTime <= C);
                    if (C = o.unstable_now(), typeof Ae == "function") {
                      R.callback = Ae, ot(C), G = true;
                      break t;
                    }
                    R === n(S) && a(S), ot(C);
                  } else a(S);
                  R = n(S);
                }
                if (R !== null) G = true;
                else {
                  var x = n(h);
                  x !== null && jt(Yt, x.startTime - C), G = false;
                }
              }
              break e;
            } finally {
              R = null, X = I, ie = false;
            }
            G = void 0;
          }
        } finally {
          G ? at() : tt = false;
        }
      }
    }
    var at;
    if (typeof Ve == "function") at = function() {
      Ve(Xt);
    };
    else if (typeof MessageChannel < "u") {
      var Xn = new MessageChannel(), kt = Xn.port2;
      Xn.port1.onmessage = Xt, at = function() {
        kt.postMessage(null);
      };
    } else at = function() {
      Me(Xt, 0);
    };
    function jt(C, G) {
      se = Me(function() {
        C(o.unstable_now());
      }, G);
    }
    o.unstable_IdlePriority = 5, o.unstable_ImmediatePriority = 1, o.unstable_LowPriority = 4, o.unstable_NormalPriority = 3, o.unstable_Profiling = null, o.unstable_UserBlockingPriority = 2, o.unstable_cancelCallback = function(C) {
      C.callback = null;
    }, o.unstable_forceFrameRate = function(C) {
      0 > C || 125 < C ? console.error("forceFrameRate takes a positive int between 0 and 125, forcing frame rates higher than 125 fps is not supported") : nt = 0 < C ? Math.floor(1e3 / C) : 5;
    }, o.unstable_getCurrentPriorityLevel = function() {
      return X;
    }, o.unstable_next = function(C) {
      switch (X) {
        case 1:
        case 2:
        case 3:
          var G = 3;
          break;
        default:
          G = X;
      }
      var I = X;
      X = G;
      try {
        return C();
      } finally {
        X = I;
      }
    }, o.unstable_requestPaint = function() {
      oe = true;
    }, o.unstable_runWithPriority = function(C, G) {
      switch (C) {
        case 1:
        case 2:
        case 3:
        case 4:
        case 5:
          break;
        default:
          C = 3;
      }
      var I = X;
      X = C;
      try {
        return G();
      } finally {
        X = I;
      }
    }, o.unstable_scheduleCallback = function(C, G, I) {
      var pe = o.unstable_now();
      switch (typeof I == "object" && I !== null ? (I = I.delay, I = typeof I == "number" && 0 < I ? pe + I : pe) : I = pe, C) {
        case 1:
          var Ae = -1;
          break;
        case 2:
          Ae = 250;
          break;
        case 5:
          Ae = 1073741823;
          break;
        case 4:
          Ae = 1e4;
          break;
        default:
          Ae = 5e3;
      }
      return Ae = I + Ae, C = { id: B++, callback: G, priorityLevel: C, startTime: I, expirationTime: Ae, sortIndex: -1 }, I > pe ? (C.sortIndex = I, s(h, C), n(S) === null && C === n(h) && (ne ? (Ke(se), se = -1) : ne = true, jt(Yt, I - pe))) : (C.sortIndex = Ae, s(S, C), qe || ie || (qe = true, tt || (tt = true, at()))), C;
    }, o.unstable_shouldYield = sa, o.unstable_wrapCallback = function(C) {
      var G = X;
      return function() {
        var I = X;
        X = G;
        try {
          return C.apply(this, arguments);
        } finally {
          X = I;
        }
      };
    };
  })(nf)), nf;
}
var Hb;
function Ig() {
  return Hb || (Hb = 1, tf.exports = Wg()), tf.exports;
}
var af = { exports: {} }, $e = {};
/**
* @license React
* react-dom.production.js
*
* Copyright (c) Meta Platforms, Inc. and affiliates.
*
* This source code is licensed under the MIT license found in the
* LICENSE file in the root directory of this source tree.
*/
var Lb;
function Fg() {
  if (Lb) return $e;
  Lb = 1;
  var o = pf();
  function s(S) {
    var h = "https://react.dev/errors/" + S;
    if (1 < arguments.length) {
      h += "?args[]=" + encodeURIComponent(arguments[1]);
      for (var B = 2; B < arguments.length; B++) h += "&args[]=" + encodeURIComponent(arguments[B]);
    }
    return "Minified React error #" + S + "; visit " + h + " for the full message or use the non-minified dev environment for full errors and additional helpful warnings.";
  }
  function n() {
  }
  var a = { d: { f: n, r: function() {
    throw Error(s(522));
  }, D: n, C: n, L: n, m: n, X: n, S: n, M: n }, p: 0, findDOMNode: null }, i = Symbol.for("react.portal");
  function _(S, h, B) {
    var R = 3 < arguments.length && arguments[3] !== void 0 ? arguments[3] : null;
    return { $$typeof: i, key: R == null ? null : "" + R, children: S, containerInfo: h, implementation: B };
  }
  var d = o.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  function y(S, h) {
    if (S === "font") return "";
    if (typeof h == "string") return h === "use-credentials" ? h : "";
  }
  return $e.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = a, $e.createPortal = function(S, h) {
    var B = 2 < arguments.length && arguments[2] !== void 0 ? arguments[2] : null;
    if (!h || h.nodeType !== 1 && h.nodeType !== 9 && h.nodeType !== 11) throw Error(s(299));
    return _(S, h, null, B);
  }, $e.flushSync = function(S) {
    var h = d.T, B = a.p;
    try {
      if (d.T = null, a.p = 2, S) return S();
    } finally {
      d.T = h, a.p = B, a.d.f();
    }
  }, $e.preconnect = function(S, h) {
    typeof S == "string" && (h ? (h = h.crossOrigin, h = typeof h == "string" ? h === "use-credentials" ? h : "" : void 0) : h = null, a.d.C(S, h));
  }, $e.prefetchDNS = function(S) {
    typeof S == "string" && a.d.D(S);
  }, $e.preinit = function(S, h) {
    if (typeof S == "string" && h && typeof h.as == "string") {
      var B = h.as, R = y(B, h.crossOrigin), X = typeof h.integrity == "string" ? h.integrity : void 0, ie = typeof h.fetchPriority == "string" ? h.fetchPriority : void 0;
      B === "style" ? a.d.S(S, typeof h.precedence == "string" ? h.precedence : void 0, { crossOrigin: R, integrity: X, fetchPriority: ie }) : B === "script" && a.d.X(S, { crossOrigin: R, integrity: X, fetchPriority: ie, nonce: typeof h.nonce == "string" ? h.nonce : void 0 });
    }
  }, $e.preinitModule = function(S, h) {
    if (typeof S == "string") if (typeof h == "object" && h !== null) {
      if (h.as == null || h.as === "script") {
        var B = y(h.as, h.crossOrigin);
        a.d.M(S, { crossOrigin: B, integrity: typeof h.integrity == "string" ? h.integrity : void 0, nonce: typeof h.nonce == "string" ? h.nonce : void 0 });
      }
    } else h == null && a.d.M(S);
  }, $e.preload = function(S, h) {
    if (typeof S == "string" && typeof h == "object" && h !== null && typeof h.as == "string") {
      var B = h.as, R = y(B, h.crossOrigin);
      a.d.L(S, B, { crossOrigin: R, integrity: typeof h.integrity == "string" ? h.integrity : void 0, nonce: typeof h.nonce == "string" ? h.nonce : void 0, type: typeof h.type == "string" ? h.type : void 0, fetchPriority: typeof h.fetchPriority == "string" ? h.fetchPriority : void 0, referrerPolicy: typeof h.referrerPolicy == "string" ? h.referrerPolicy : void 0, imageSrcSet: typeof h.imageSrcSet == "string" ? h.imageSrcSet : void 0, imageSizes: typeof h.imageSizes == "string" ? h.imageSizes : void 0, media: typeof h.media == "string" ? h.media : void 0 });
    }
  }, $e.preloadModule = function(S, h) {
    if (typeof S == "string") if (h) {
      var B = y(h.as, h.crossOrigin);
      a.d.m(S, { as: typeof h.as == "string" && h.as !== "script" ? h.as : void 0, crossOrigin: B, integrity: typeof h.integrity == "string" ? h.integrity : void 0 });
    } else a.d.m(S);
  }, $e.requestFormReset = function(S) {
    a.d.r(S);
  }, $e.unstable_batchedUpdates = function(S, h) {
    return S(h);
  }, $e.useFormState = function(S, h, B) {
    return d.H.useFormState(S, h, B);
  }, $e.useFormStatus = function() {
    return d.H.useHostTransitionStatus();
  }, $e.version = "19.2.7", $e;
}
var Gb;
function ad() {
  if (Gb) return af.exports;
  Gb = 1;
  function o() {
    if (!(typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ > "u" || typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE != "function")) try {
      __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(o);
    } catch (s) {
      console.error(s);
    }
  }
  return o(), af.exports = Fg(), af.exports;
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
var Yb;
function $g() {
  if (Yb) return Ju;
  Yb = 1;
  var o = Ig(), s = pf(), n = ad();
  function a(e) {
    var t = "https://react.dev/errors/" + e;
    if (1 < arguments.length) {
      t += "?args[]=" + encodeURIComponent(arguments[1]);
      for (var u = 2; u < arguments.length; u++) t += "&args[]=" + encodeURIComponent(arguments[u]);
    }
    return "Minified React error #" + e + "; visit " + t + " for the full message or use the non-minified dev environment for full errors and additional helpful warnings.";
  }
  function i(e) {
    return !(!e || e.nodeType !== 1 && e.nodeType !== 9 && e.nodeType !== 11);
  }
  function _(e) {
    var t = e, u = e;
    if (e.alternate) for (; t.return; ) t = t.return;
    else {
      e = t;
      do
        t = e, (t.flags & 4098) !== 0 && (u = t.return), e = t.return;
      while (e);
    }
    return t.tag === 3 ? u : null;
  }
  function d(e) {
    if (e.tag === 13) {
      var t = e.memoizedState;
      if (t === null && (e = e.alternate, e !== null && (t = e.memoizedState)), t !== null) return t.dehydrated;
    }
    return null;
  }
  function y(e) {
    if (e.tag === 31) {
      var t = e.memoizedState;
      if (t === null && (e = e.alternate, e !== null && (t = e.memoizedState)), t !== null) return t.dehydrated;
    }
    return null;
  }
  function S(e) {
    if (_(e) !== e) throw Error(a(188));
  }
  function h(e) {
    var t = e.alternate;
    if (!t) {
      if (t = _(e), t === null) throw Error(a(188));
      return t !== e ? null : e;
    }
    for (var u = e, l = t; ; ) {
      var r = u.return;
      if (r === null) break;
      var f = r.alternate;
      if (f === null) {
        if (l = r.return, l !== null) {
          u = l;
          continue;
        }
        break;
      }
      if (r.child === f.child) {
        for (f = r.child; f; ) {
          if (f === u) return S(r), e;
          if (f === l) return S(r), t;
          f = f.sibling;
        }
        throw Error(a(188));
      }
      if (u.return !== l.return) u = r, l = f;
      else {
        for (var b = false, g = r.child; g; ) {
          if (g === u) {
            b = true, u = r, l = f;
            break;
          }
          if (g === l) {
            b = true, l = r, u = f;
            break;
          }
          g = g.sibling;
        }
        if (!b) {
          for (g = f.child; g; ) {
            if (g === u) {
              b = true, u = f, l = r;
              break;
            }
            if (g === l) {
              b = true, l = f, u = r;
              break;
            }
            g = g.sibling;
          }
          if (!b) throw Error(a(189));
        }
      }
      if (u.alternate !== l) throw Error(a(190));
    }
    if (u.tag !== 3) throw Error(a(188));
    return u.stateNode.current === u ? e : t;
  }
  function B(e) {
    var t = e.tag;
    if (t === 5 || t === 26 || t === 27 || t === 6) return e;
    for (e = e.child; e !== null; ) {
      if (t = B(e), t !== null) return t;
      e = e.sibling;
    }
    return null;
  }
  var R = Object.assign, X = Symbol.for("react.element"), ie = Symbol.for("react.transitional.element"), qe = Symbol.for("react.portal"), ne = Symbol.for("react.fragment"), oe = Symbol.for("react.strict_mode"), Me = Symbol.for("react.profiler"), Ke = Symbol.for("react.consumer"), Ve = Symbol.for("react.context"), ot = Symbol.for("react.forward_ref"), Yt = Symbol.for("react.suspense"), tt = Symbol.for("react.suspense_list"), se = Symbol.for("react.memo"), nt = Symbol.for("react.lazy"), Vt = Symbol.for("react.activity"), sa = Symbol.for("react.memo_cache_sentinel"), Xt = Symbol.iterator;
  function at(e) {
    return e === null || typeof e != "object" ? null : (e = Xt && e[Xt] || e["@@iterator"], typeof e == "function" ? e : null);
  }
  var Xn = Symbol.for("react.client.reference");
  function kt(e) {
    if (e == null) return null;
    if (typeof e == "function") return e.$$typeof === Xn ? null : e.displayName || e.name || null;
    if (typeof e == "string") return e;
    switch (e) {
      case ne:
        return "Fragment";
      case Me:
        return "Profiler";
      case oe:
        return "StrictMode";
      case Yt:
        return "Suspense";
      case tt:
        return "SuspenseList";
      case Vt:
        return "Activity";
    }
    if (typeof e == "object") switch (e.$$typeof) {
      case qe:
        return "Portal";
      case Ve:
        return e.displayName || "Context";
      case Ke:
        return (e._context.displayName || "Context") + ".Consumer";
      case ot:
        var t = e.render;
        return e = e.displayName, e || (e = t.displayName || t.name || "", e = e !== "" ? "ForwardRef(" + e + ")" : "ForwardRef"), e;
      case se:
        return t = e.displayName || null, t !== null ? t : kt(e.type) || "Memo";
      case nt:
        t = e._payload, e = e._init;
        try {
          return kt(e(t));
        } catch {
        }
    }
    return null;
  }
  var jt = Array.isArray, C = s.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, G = n.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE, I = { pending: false, data: null, method: null, action: null }, pe = [], Ae = -1;
  function x(e) {
    return { current: e };
  }
  function j(e) {
    0 > Ae || (e.current = pe[Ae], pe[Ae] = null, Ae--);
  }
  function Y(e, t) {
    Ae++, pe[Ae] = e.current, e.current = t;
  }
  var Z = x(null), P = x(null), ue = x(null), we = x(null);
  function Pe(e, t) {
    switch (Y(ue, t), Y(P, e), Y(Z, null), t.nodeType) {
      case 9:
      case 11:
        e = (e = t.documentElement) && (e = e.namespaceURI) ? eb(e) : 0;
        break;
      default:
        if (e = t.tagName, t = t.namespaceURI) t = eb(t), e = tb(t, e);
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
    j(Z), Y(Z, e);
  }
  function Ue() {
    j(Z), j(P), j(ue);
  }
  function Pa(e) {
    e.memoizedState !== null && Y(we, e);
    var t = Z.current, u = tb(t, e.type);
    t !== u && (Y(P, e), Y(Z, u));
  }
  function il(e) {
    P.current === e && (j(Z), j(P)), we.current === e && (j(we), Vu._currentValue = I);
  }
  var Bc, Df;
  function Qn(e) {
    if (Bc === void 0) try {
      throw Error();
    } catch (u) {
      var t = u.stack.trim().match(/\n( *(at )?)/);
      Bc = t && t[1] || "", Df = -1 < u.stack.indexOf(`
    at`) ? " (<anonymous>)" : -1 < u.stack.indexOf("@") ? "@unknown:0:0" : "";
    }
    return `
` + Bc + e + Df;
  }
  var Nc = false;
  function jc(e, t) {
    if (!e || Nc) return "";
    Nc = true;
    var u = Error.prepareStackTrace;
    Error.prepareStackTrace = void 0;
    try {
      var l = { DetermineComponentFrameRoot: function() {
        try {
          if (t) {
            var N = function() {
              throw Error();
            };
            if (Object.defineProperty(N.prototype, "props", { set: function() {
              throw Error();
            } }), typeof Reflect == "object" && Reflect.construct) {
              try {
                Reflect.construct(N, []);
              } catch (D) {
                var z = D;
              }
              Reflect.construct(e, [], N);
            } else {
              try {
                N.call();
              } catch (D) {
                z = D;
              }
              e.call(N.prototype);
            }
          } else {
            try {
              throw Error();
            } catch (D) {
              z = D;
            }
            (N = e()) && typeof N.catch == "function" && N.catch(function() {
            });
          }
        } catch (D) {
          if (D && z && typeof D.stack == "string") return [D.stack, z.stack];
        }
        return [null, null];
      } };
      l.DetermineComponentFrameRoot.displayName = "DetermineComponentFrameRoot";
      var r = Object.getOwnPropertyDescriptor(l.DetermineComponentFrameRoot, "name");
      r && r.configurable && Object.defineProperty(l.DetermineComponentFrameRoot, "name", { value: "DetermineComponentFrameRoot" });
      var f = l.DetermineComponentFrameRoot(), b = f[0], g = f[1];
      if (b && g) {
        var w = b.split(`
`), T = g.split(`
`);
        for (r = l = 0; l < w.length && !w[l].includes("DetermineComponentFrameRoot"); ) l++;
        for (; r < T.length && !T[r].includes("DetermineComponentFrameRoot"); ) r++;
        if (l === w.length || r === T.length) for (l = w.length - 1, r = T.length - 1; 1 <= l && 0 <= r && w[l] !== T[r]; ) r--;
        for (; 1 <= l && 0 <= r; l--, r--) if (w[l] !== T[r]) {
          if (l !== 1 || r !== 1) do
            if (l--, r--, 0 > r || w[l] !== T[r]) {
              var M = `
` + w[l].replace(" at new ", " at ");
              return e.displayName && M.includes("<anonymous>") && (M = M.replace("<anonymous>", e.displayName)), M;
            }
          while (1 <= l && 0 <= r);
          break;
        }
      }
    } finally {
      Nc = false, Error.prepareStackTrace = u;
    }
    return (u = e ? e.displayName || e.name : "") ? Qn(u) : "";
  }
  function vd(e, t) {
    switch (e.tag) {
      case 26:
      case 27:
      case 5:
        return Qn(e.type);
      case 16:
        return Qn("Lazy");
      case 13:
        return e.child !== t && t !== null ? Qn("Suspense Fallback") : Qn("Suspense");
      case 19:
        return Qn("SuspenseList");
      case 0:
      case 15:
        return jc(e.type, false);
      case 11:
        return jc(e.type.render, false);
      case 1:
        return jc(e.type, true);
      case 31:
        return Qn("Activity");
      default:
        return "";
    }
  }
  function Mf(e) {
    try {
      var t = "", u = null;
      do
        t += vd(e, u), u = e, e = e.return;
      while (e);
      return t;
    } catch (l) {
      return `
Error generating stack: ` + l.message + `
` + l.stack;
    }
  }
  var qc = Object.prototype.hasOwnProperty, Hc = o.unstable_scheduleCallback, Lc = o.unstable_cancelCallback, Sd = o.unstable_shouldYield, xd = o.unstable_requestPaint, st = o.unstable_now, Ad = o.unstable_getCurrentPriorityLevel, Cf = o.unstable_ImmediatePriority, Rf = o.unstable_UserBlockingPriority, rl = o.unstable_NormalPriority, Ed = o.unstable_LowPriority, Uf = o.unstable_IdlePriority, Td = o.log, zd = o.unstable_setDisableYieldValue, eu = null, bt = null;
  function gn(e) {
    if (typeof Td == "function" && zd(e), bt && typeof bt.setStrictMode == "function") try {
      bt.setStrictMode(eu, e);
    } catch {
    }
  }
  var dt = Math.clz32 ? Math.clz32 : Md, Od = Math.log, Dd = Math.LN2;
  function Md(e) {
    return e >>>= 0, e === 0 ? 32 : 31 - (Od(e) / Dd | 0) | 0;
  }
  var fl = 256, _l = 262144, ol = 4194304;
  function Zn(e) {
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
  function sl(e, t, u) {
    var l = e.pendingLanes;
    if (l === 0) return 0;
    var r = 0, f = e.suspendedLanes, b = e.pingedLanes;
    e = e.warmLanes;
    var g = l & 134217727;
    return g !== 0 ? (l = g & ~f, l !== 0 ? r = Zn(l) : (b &= g, b !== 0 ? r = Zn(b) : u || (u = g & ~e, u !== 0 && (r = Zn(u))))) : (g = l & ~f, g !== 0 ? r = Zn(g) : b !== 0 ? r = Zn(b) : u || (u = l & ~e, u !== 0 && (r = Zn(u)))), r === 0 ? 0 : t !== 0 && t !== r && (t & f) === 0 && (f = r & -r, u = t & -t, f >= u || f === 32 && (u & 4194048) !== 0) ? t : r;
  }
  function tu(e, t) {
    return (e.pendingLanes & ~(e.suspendedLanes & ~e.pingedLanes) & t) === 0;
  }
  function Cd(e, t) {
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
  function Bf() {
    var e = ol;
    return ol <<= 1, (ol & 62914560) === 0 && (ol = 4194304), e;
  }
  function Gc(e) {
    for (var t = [], u = 0; 31 > u; u++) t.push(e);
    return t;
  }
  function nu(e, t) {
    e.pendingLanes |= t, t !== 268435456 && (e.suspendedLanes = 0, e.pingedLanes = 0, e.warmLanes = 0);
  }
  function Rd(e, t, u, l, r, f) {
    var b = e.pendingLanes;
    e.pendingLanes = u, e.suspendedLanes = 0, e.pingedLanes = 0, e.warmLanes = 0, e.expiredLanes &= u, e.entangledLanes &= u, e.errorRecoveryDisabledLanes &= u, e.shellSuspendCounter = 0;
    var g = e.entanglements, w = e.expirationTimes, T = e.hiddenUpdates;
    for (u = b & ~u; 0 < u; ) {
      var M = 31 - dt(u), N = 1 << M;
      g[M] = 0, w[M] = -1;
      var z = T[M];
      if (z !== null) for (T[M] = null, M = 0; M < z.length; M++) {
        var D = z[M];
        D !== null && (D.lane &= -536870913);
      }
      u &= ~N;
    }
    l !== 0 && Nf(e, l, 0), f !== 0 && r === 0 && e.tag !== 0 && (e.suspendedLanes |= f & ~(b & ~t));
  }
  function Nf(e, t, u) {
    e.pendingLanes |= t, e.suspendedLanes &= ~t;
    var l = 31 - dt(t);
    e.entangledLanes |= t, e.entanglements[l] = e.entanglements[l] | 1073741824 | u & 261930;
  }
  function jf(e, t) {
    var u = e.entangledLanes |= t;
    for (e = e.entanglements; u; ) {
      var l = 31 - dt(u), r = 1 << l;
      r & t | e[l] & t && (e[l] |= t), u &= ~r;
    }
  }
  function qf(e, t) {
    var u = t & -t;
    return u = (u & 42) !== 0 ? 1 : Yc(u), (u & (e.suspendedLanes | t)) !== 0 ? 0 : u;
  }
  function Yc(e) {
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
  function Vc(e) {
    return e &= -e, 2 < e ? 8 < e ? (e & 134217727) !== 0 ? 32 : 268435456 : 8 : 2;
  }
  function Hf() {
    var e = G.p;
    return e !== 0 ? e : (e = window.event, e === void 0 ? 32 : Ab(e.type));
  }
  function Lf(e, t) {
    var u = G.p;
    try {
      return G.p = e, t();
    } finally {
      G.p = u;
    }
  }
  var mn = Math.random().toString(36).slice(2), Je = "__reactFiber$" + mn, ut = "__reactProps$" + mn, ba = "__reactContainer$" + mn, Xc = "__reactEvents$" + mn, Ud = "__reactListeners$" + mn, Bd = "__reactHandles$" + mn, Gf = "__reactResources$" + mn, au = "__reactMarker$" + mn;
  function Qc(e) {
    delete e[Je], delete e[ut], delete e[Xc], delete e[Ud], delete e[Bd];
  }
  function da(e) {
    var t = e[Je];
    if (t) return t;
    for (var u = e.parentNode; u; ) {
      if (t = u[ba] || u[Je]) {
        if (u = t.alternate, t.child !== null || u !== null && u.child !== null) for (e = rb(e); e !== null; ) {
          if (u = e[Je]) return u;
          e = rb(e);
        }
        return t;
      }
      e = u, u = e.parentNode;
    }
    return null;
  }
  function ga(e) {
    if (e = e[Je] || e[ba]) {
      var t = e.tag;
      if (t === 5 || t === 6 || t === 13 || t === 31 || t === 26 || t === 27 || t === 3) return e;
    }
    return null;
  }
  function uu(e) {
    var t = e.tag;
    if (t === 5 || t === 26 || t === 27 || t === 6) return e.stateNode;
    throw Error(a(33));
  }
  function ma(e) {
    var t = e[Gf];
    return t || (t = e[Gf] = { hoistableStyles: /* @__PURE__ */ new Map(), hoistableScripts: /* @__PURE__ */ new Map() }), t;
  }
  function Qe(e) {
    e[au] = true;
  }
  var Yf = /* @__PURE__ */ new Set(), Vf = {};
  function Kn(e, t) {
    wa(e, t), wa(e + "Capture", t);
  }
  function wa(e, t) {
    for (Vf[e] = t, e = 0; e < t.length; e++) Yf.add(t[e]);
  }
  var Nd = RegExp("^[:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD][:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040]*$"), Xf = {}, Qf = {};
  function jd(e) {
    return qc.call(Qf, e) ? true : qc.call(Xf, e) ? false : Nd.test(e) ? Qf[e] = true : (Xf[e] = true, false);
  }
  function bl(e, t, u) {
    if (jd(t)) if (u === null) e.removeAttribute(t);
    else {
      switch (typeof u) {
        case "undefined":
        case "function":
        case "symbol":
          e.removeAttribute(t);
          return;
        case "boolean":
          var l = t.toLowerCase().slice(0, 5);
          if (l !== "data-" && l !== "aria-") {
            e.removeAttribute(t);
            return;
          }
      }
      e.setAttribute(t, "" + u);
    }
  }
  function dl(e, t, u) {
    if (u === null) e.removeAttribute(t);
    else {
      switch (typeof u) {
        case "undefined":
        case "function":
        case "symbol":
        case "boolean":
          e.removeAttribute(t);
          return;
      }
      e.setAttribute(t, "" + u);
    }
  }
  function Wt(e, t, u, l) {
    if (l === null) e.removeAttribute(u);
    else {
      switch (typeof l) {
        case "undefined":
        case "function":
        case "symbol":
        case "boolean":
          e.removeAttribute(u);
          return;
      }
      e.setAttributeNS(t, u, "" + l);
    }
  }
  function xt(e) {
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
  function Zf(e) {
    var t = e.type;
    return (e = e.nodeName) && e.toLowerCase() === "input" && (t === "checkbox" || t === "radio");
  }
  function qd(e, t, u) {
    var l = Object.getOwnPropertyDescriptor(e.constructor.prototype, t);
    if (!e.hasOwnProperty(t) && typeof l < "u" && typeof l.get == "function" && typeof l.set == "function") {
      var r = l.get, f = l.set;
      return Object.defineProperty(e, t, { configurable: true, get: function() {
        return r.call(this);
      }, set: function(b) {
        u = "" + b, f.call(this, b);
      } }), Object.defineProperty(e, t, { enumerable: l.enumerable }), { getValue: function() {
        return u;
      }, setValue: function(b) {
        u = "" + b;
      }, stopTracking: function() {
        e._valueTracker = null, delete e[t];
      } };
    }
  }
  function Zc(e) {
    if (!e._valueTracker) {
      var t = Zf(e) ? "checked" : "value";
      e._valueTracker = qd(e, t, "" + e[t]);
    }
  }
  function Kf(e) {
    if (!e) return false;
    var t = e._valueTracker;
    if (!t) return true;
    var u = t.getValue(), l = "";
    return e && (l = Zf(e) ? e.checked ? "true" : "false" : e.value), e = l, e !== u ? (t.setValue(e), true) : false;
  }
  function gl(e) {
    if (e = e || (typeof document < "u" ? document : void 0), typeof e > "u") return null;
    try {
      return e.activeElement || e.body;
    } catch {
      return e.body;
    }
  }
  var Hd = /[\n"\\]/g;
  function At(e) {
    return e.replace(Hd, function(t) {
      return "\\" + t.charCodeAt(0).toString(16) + " ";
    });
  }
  function Kc(e, t, u, l, r, f, b, g) {
    e.name = "", b != null && typeof b != "function" && typeof b != "symbol" && typeof b != "boolean" ? e.type = b : e.removeAttribute("type"), t != null ? b === "number" ? (t === 0 && e.value === "" || e.value != t) && (e.value = "" + xt(t)) : e.value !== "" + xt(t) && (e.value = "" + xt(t)) : b !== "submit" && b !== "reset" || e.removeAttribute("value"), t != null ? Jc(e, b, xt(t)) : u != null ? Jc(e, b, xt(u)) : l != null && e.removeAttribute("value"), r == null && f != null && (e.defaultChecked = !!f), r != null && (e.checked = r && typeof r != "function" && typeof r != "symbol"), g != null && typeof g != "function" && typeof g != "symbol" && typeof g != "boolean" ? e.name = "" + xt(g) : e.removeAttribute("name");
  }
  function Jf(e, t, u, l, r, f, b, g) {
    if (f != null && typeof f != "function" && typeof f != "symbol" && typeof f != "boolean" && (e.type = f), t != null || u != null) {
      if (!(f !== "submit" && f !== "reset" || t != null)) {
        Zc(e);
        return;
      }
      u = u != null ? "" + xt(u) : "", t = t != null ? "" + xt(t) : u, g || t === e.value || (e.value = t), e.defaultValue = t;
    }
    l = l ?? r, l = typeof l != "function" && typeof l != "symbol" && !!l, e.checked = g ? e.checked : !!l, e.defaultChecked = !!l, b != null && typeof b != "function" && typeof b != "symbol" && typeof b != "boolean" && (e.name = b), Zc(e);
  }
  function Jc(e, t, u) {
    t === "number" && gl(e.ownerDocument) === e || e.defaultValue === "" + u || (e.defaultValue = "" + u);
  }
  function ya(e, t, u, l) {
    if (e = e.options, t) {
      t = {};
      for (var r = 0; r < u.length; r++) t["$" + u[r]] = true;
      for (u = 0; u < e.length; u++) r = t.hasOwnProperty("$" + e[u].value), e[u].selected !== r && (e[u].selected = r), r && l && (e[u].defaultSelected = true);
    } else {
      for (u = "" + xt(u), t = null, r = 0; r < e.length; r++) {
        if (e[r].value === u) {
          e[r].selected = true, l && (e[r].defaultSelected = true);
          return;
        }
        t !== null || e[r].disabled || (t = e[r]);
      }
      t !== null && (t.selected = true);
    }
  }
  function kf(e, t, u) {
    if (t != null && (t = "" + xt(t), t !== e.value && (e.value = t), u == null)) {
      e.defaultValue !== t && (e.defaultValue = t);
      return;
    }
    e.defaultValue = u != null ? "" + xt(u) : "";
  }
  function Wf(e, t, u, l) {
    if (t == null) {
      if (l != null) {
        if (u != null) throw Error(a(92));
        if (jt(l)) {
          if (1 < l.length) throw Error(a(93));
          l = l[0];
        }
        u = l;
      }
      u == null && (u = ""), t = u;
    }
    u = xt(t), e.defaultValue = u, l = e.textContent, l === u && l !== "" && l !== null && (e.value = l), Zc(e);
  }
  function ha(e, t) {
    if (t) {
      var u = e.firstChild;
      if (u && u === e.lastChild && u.nodeType === 3) {
        u.nodeValue = t;
        return;
      }
    }
    e.textContent = t;
  }
  var Ld = new Set("animationIterationCount aspectRatio borderImageOutset borderImageSlice borderImageWidth boxFlex boxFlexGroup boxOrdinalGroup columnCount columns flex flexGrow flexPositive flexShrink flexNegative flexOrder gridArea gridRow gridRowEnd gridRowSpan gridRowStart gridColumn gridColumnEnd gridColumnSpan gridColumnStart fontWeight lineClamp lineHeight opacity order orphans scale tabSize widows zIndex zoom fillOpacity floodOpacity stopOpacity strokeDasharray strokeDashoffset strokeMiterlimit strokeOpacity strokeWidth MozAnimationIterationCount MozBoxFlex MozBoxFlexGroup MozLineClamp msAnimationIterationCount msFlex msZoom msFlexGrow msFlexNegative msFlexOrder msFlexPositive msFlexShrink msGridColumn msGridColumnSpan msGridRow msGridRowSpan WebkitAnimationIterationCount WebkitBoxFlex WebKitBoxFlexGroup WebkitBoxOrdinalGroup WebkitColumnCount WebkitColumns WebkitFlex WebkitFlexGrow WebkitFlexPositive WebkitFlexShrink WebkitLineClamp".split(" "));
  function If(e, t, u) {
    var l = t.indexOf("--") === 0;
    u == null || typeof u == "boolean" || u === "" ? l ? e.setProperty(t, "") : t === "float" ? e.cssFloat = "" : e[t] = "" : l ? e.setProperty(t, u) : typeof u != "number" || u === 0 || Ld.has(t) ? t === "float" ? e.cssFloat = u : e[t] = ("" + u).trim() : e[t] = u + "px";
  }
  function Ff(e, t, u) {
    if (t != null && typeof t != "object") throw Error(a(62));
    if (e = e.style, u != null) {
      for (var l in u) !u.hasOwnProperty(l) || t != null && t.hasOwnProperty(l) || (l.indexOf("--") === 0 ? e.setProperty(l, "") : l === "float" ? e.cssFloat = "" : e[l] = "");
      for (var r in t) l = t[r], t.hasOwnProperty(r) && u[r] !== l && If(e, r, l);
    } else for (var f in t) t.hasOwnProperty(f) && If(e, f, t[f]);
  }
  function kc(e) {
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
  var Gd = /* @__PURE__ */ new Map([["acceptCharset", "accept-charset"], ["htmlFor", "for"], ["httpEquiv", "http-equiv"], ["crossOrigin", "crossorigin"], ["accentHeight", "accent-height"], ["alignmentBaseline", "alignment-baseline"], ["arabicForm", "arabic-form"], ["baselineShift", "baseline-shift"], ["capHeight", "cap-height"], ["clipPath", "clip-path"], ["clipRule", "clip-rule"], ["colorInterpolation", "color-interpolation"], ["colorInterpolationFilters", "color-interpolation-filters"], ["colorProfile", "color-profile"], ["colorRendering", "color-rendering"], ["dominantBaseline", "dominant-baseline"], ["enableBackground", "enable-background"], ["fillOpacity", "fill-opacity"], ["fillRule", "fill-rule"], ["floodColor", "flood-color"], ["floodOpacity", "flood-opacity"], ["fontFamily", "font-family"], ["fontSize", "font-size"], ["fontSizeAdjust", "font-size-adjust"], ["fontStretch", "font-stretch"], ["fontStyle", "font-style"], ["fontVariant", "font-variant"], ["fontWeight", "font-weight"], ["glyphName", "glyph-name"], ["glyphOrientationHorizontal", "glyph-orientation-horizontal"], ["glyphOrientationVertical", "glyph-orientation-vertical"], ["horizAdvX", "horiz-adv-x"], ["horizOriginX", "horiz-origin-x"], ["imageRendering", "image-rendering"], ["letterSpacing", "letter-spacing"], ["lightingColor", "lighting-color"], ["markerEnd", "marker-end"], ["markerMid", "marker-mid"], ["markerStart", "marker-start"], ["overlinePosition", "overline-position"], ["overlineThickness", "overline-thickness"], ["paintOrder", "paint-order"], ["panose-1", "panose-1"], ["pointerEvents", "pointer-events"], ["renderingIntent", "rendering-intent"], ["shapeRendering", "shape-rendering"], ["stopColor", "stop-color"], ["stopOpacity", "stop-opacity"], ["strikethroughPosition", "strikethrough-position"], ["strikethroughThickness", "strikethrough-thickness"], ["strokeDasharray", "stroke-dasharray"], ["strokeDashoffset", "stroke-dashoffset"], ["strokeLinecap", "stroke-linecap"], ["strokeLinejoin", "stroke-linejoin"], ["strokeMiterlimit", "stroke-miterlimit"], ["strokeOpacity", "stroke-opacity"], ["strokeWidth", "stroke-width"], ["textAnchor", "text-anchor"], ["textDecoration", "text-decoration"], ["textRendering", "text-rendering"], ["transformOrigin", "transform-origin"], ["underlinePosition", "underline-position"], ["underlineThickness", "underline-thickness"], ["unicodeBidi", "unicode-bidi"], ["unicodeRange", "unicode-range"], ["unitsPerEm", "units-per-em"], ["vAlphabetic", "v-alphabetic"], ["vHanging", "v-hanging"], ["vIdeographic", "v-ideographic"], ["vMathematical", "v-mathematical"], ["vectorEffect", "vector-effect"], ["vertAdvY", "vert-adv-y"], ["vertOriginX", "vert-origin-x"], ["vertOriginY", "vert-origin-y"], ["wordSpacing", "word-spacing"], ["writingMode", "writing-mode"], ["xmlnsXlink", "xmlns:xlink"], ["xHeight", "x-height"]]), Yd = /^[\u0000-\u001F ]*j[\r\n\t]*a[\r\n\t]*v[\r\n\t]*a[\r\n\t]*s[\r\n\t]*c[\r\n\t]*r[\r\n\t]*i[\r\n\t]*p[\r\n\t]*t[\r\n\t]*:/i;
  function ml(e) {
    return Yd.test("" + e) ? "javascript:throw new Error('React has blocked a javascript: URL as a security precaution.')" : e;
  }
  function It() {
  }
  var Wc = null;
  function Ic(e) {
    return e = e.target || e.srcElement || window, e.correspondingUseElement && (e = e.correspondingUseElement), e.nodeType === 3 ? e.parentNode : e;
  }
  var pa = null, va = null;
  function $f(e) {
    var t = ga(e);
    if (t && (e = t.stateNode)) {
      var u = e[ut] || null;
      e: switch (e = t.stateNode, t.type) {
        case "input":
          if (Kc(e, u.value, u.defaultValue, u.defaultValue, u.checked, u.defaultChecked, u.type, u.name), t = u.name, u.type === "radio" && t != null) {
            for (u = e; u.parentNode; ) u = u.parentNode;
            for (u = u.querySelectorAll('input[name="' + At("" + t) + '"][type="radio"]'), t = 0; t < u.length; t++) {
              var l = u[t];
              if (l !== e && l.form === e.form) {
                var r = l[ut] || null;
                if (!r) throw Error(a(90));
                Kc(l, r.value, r.defaultValue, r.defaultValue, r.checked, r.defaultChecked, r.type, r.name);
              }
            }
            for (t = 0; t < u.length; t++) l = u[t], l.form === e.form && Kf(l);
          }
          break e;
        case "textarea":
          kf(e, u.value, u.defaultValue);
          break e;
        case "select":
          t = u.value, t != null && ya(e, !!u.multiple, t, false);
      }
    }
  }
  var Fc = false;
  function Pf(e, t, u) {
    if (Fc) return e(t, u);
    Fc = true;
    try {
      var l = e(t);
      return l;
    } finally {
      if (Fc = false, (pa !== null || va !== null) && (ac(), pa && (t = pa, e = va, va = pa = null, $f(t), e))) for (t = 0; t < e.length; t++) $f(e[t]);
    }
  }
  function lu(e, t) {
    var u = e.stateNode;
    if (u === null) return null;
    var l = u[ut] || null;
    if (l === null) return null;
    u = l[t];
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
        (l = !l.disabled) || (e = e.type, l = !(e === "button" || e === "input" || e === "select" || e === "textarea")), e = !l;
        break e;
      default:
        e = false;
    }
    if (e) return null;
    if (u && typeof u != "function") throw Error(a(231, t, typeof u));
    return u;
  }
  var Ft = !(typeof window > "u" || typeof window.document > "u" || typeof window.document.createElement > "u"), $c = false;
  if (Ft) try {
    var cu = {};
    Object.defineProperty(cu, "passive", { get: function() {
      $c = true;
    } }), window.addEventListener("test", cu, cu), window.removeEventListener("test", cu, cu);
  } catch {
    $c = false;
  }
  var wn = null, Pc = null, wl = null;
  function e_() {
    if (wl) return wl;
    var e, t = Pc, u = t.length, l, r = "value" in wn ? wn.value : wn.textContent, f = r.length;
    for (e = 0; e < u && t[e] === r[e]; e++) ;
    var b = u - e;
    for (l = 1; l <= b && t[u - l] === r[f - l]; l++) ;
    return wl = r.slice(e, 1 < l ? 1 - l : void 0);
  }
  function yl(e) {
    var t = e.keyCode;
    return "charCode" in e ? (e = e.charCode, e === 0 && t === 13 && (e = 13)) : e = t, e === 10 && (e = 13), 32 <= e || e === 13 ? e : 0;
  }
  function hl() {
    return true;
  }
  function t_() {
    return false;
  }
  function lt(e) {
    function t(u, l, r, f, b) {
      this._reactName = u, this._targetInst = r, this.type = l, this.nativeEvent = f, this.target = b, this.currentTarget = null;
      for (var g in e) e.hasOwnProperty(g) && (u = e[g], this[g] = u ? u(f) : f[g]);
      return this.isDefaultPrevented = (f.defaultPrevented != null ? f.defaultPrevented : f.returnValue === false) ? hl : t_, this.isPropagationStopped = t_, this;
    }
    return R(t.prototype, { preventDefault: function() {
      this.defaultPrevented = true;
      var u = this.nativeEvent;
      u && (u.preventDefault ? u.preventDefault() : typeof u.returnValue != "unknown" && (u.returnValue = false), this.isDefaultPrevented = hl);
    }, stopPropagation: function() {
      var u = this.nativeEvent;
      u && (u.stopPropagation ? u.stopPropagation() : typeof u.cancelBubble != "unknown" && (u.cancelBubble = true), this.isPropagationStopped = hl);
    }, persist: function() {
    }, isPersistent: hl }), t;
  }
  var Jn = { eventPhase: 0, bubbles: 0, cancelable: 0, timeStamp: function(e) {
    return e.timeStamp || Date.now();
  }, defaultPrevented: 0, isTrusted: 0 }, pl = lt(Jn), iu = R({}, Jn, { view: 0, detail: 0 }), Vd = lt(iu), ei, ti, ru, vl = R({}, iu, { screenX: 0, screenY: 0, clientX: 0, clientY: 0, pageX: 0, pageY: 0, ctrlKey: 0, shiftKey: 0, altKey: 0, metaKey: 0, getModifierState: ai, button: 0, buttons: 0, relatedTarget: function(e) {
    return e.relatedTarget === void 0 ? e.fromElement === e.srcElement ? e.toElement : e.fromElement : e.relatedTarget;
  }, movementX: function(e) {
    return "movementX" in e ? e.movementX : (e !== ru && (ru && e.type === "mousemove" ? (ei = e.screenX - ru.screenX, ti = e.screenY - ru.screenY) : ti = ei = 0, ru = e), ei);
  }, movementY: function(e) {
    return "movementY" in e ? e.movementY : ti;
  } }), n_ = lt(vl), Xd = R({}, vl, { dataTransfer: 0 }), Qd = lt(Xd), Zd = R({}, iu, { relatedTarget: 0 }), ni = lt(Zd), Kd = R({}, Jn, { animationName: 0, elapsedTime: 0, pseudoElement: 0 }), Jd = lt(Kd), kd = R({}, Jn, { clipboardData: function(e) {
    return "clipboardData" in e ? e.clipboardData : window.clipboardData;
  } }), Wd = lt(kd), Id = R({}, Jn, { data: 0 }), a_ = lt(Id), Fd = { Esc: "Escape", Spacebar: " ", Left: "ArrowLeft", Up: "ArrowUp", Right: "ArrowRight", Down: "ArrowDown", Del: "Delete", Win: "OS", Menu: "ContextMenu", Apps: "ContextMenu", Scroll: "ScrollLock", MozPrintableKey: "Unidentified" }, $d = { 8: "Backspace", 9: "Tab", 12: "Clear", 13: "Enter", 16: "Shift", 17: "Control", 18: "Alt", 19: "Pause", 20: "CapsLock", 27: "Escape", 32: " ", 33: "PageUp", 34: "PageDown", 35: "End", 36: "Home", 37: "ArrowLeft", 38: "ArrowUp", 39: "ArrowRight", 40: "ArrowDown", 45: "Insert", 46: "Delete", 112: "F1", 113: "F2", 114: "F3", 115: "F4", 116: "F5", 117: "F6", 118: "F7", 119: "F8", 120: "F9", 121: "F10", 122: "F11", 123: "F12", 144: "NumLock", 145: "ScrollLock", 224: "Meta" }, Pd = { Alt: "altKey", Control: "ctrlKey", Meta: "metaKey", Shift: "shiftKey" };
  function e0(e) {
    var t = this.nativeEvent;
    return t.getModifierState ? t.getModifierState(e) : (e = Pd[e]) ? !!t[e] : false;
  }
  function ai() {
    return e0;
  }
  var t0 = R({}, iu, { key: function(e) {
    if (e.key) {
      var t = Fd[e.key] || e.key;
      if (t !== "Unidentified") return t;
    }
    return e.type === "keypress" ? (e = yl(e), e === 13 ? "Enter" : String.fromCharCode(e)) : e.type === "keydown" || e.type === "keyup" ? $d[e.keyCode] || "Unidentified" : "";
  }, code: 0, location: 0, ctrlKey: 0, shiftKey: 0, altKey: 0, metaKey: 0, repeat: 0, locale: 0, getModifierState: ai, charCode: function(e) {
    return e.type === "keypress" ? yl(e) : 0;
  }, keyCode: function(e) {
    return e.type === "keydown" || e.type === "keyup" ? e.keyCode : 0;
  }, which: function(e) {
    return e.type === "keypress" ? yl(e) : e.type === "keydown" || e.type === "keyup" ? e.keyCode : 0;
  } }), n0 = lt(t0), a0 = R({}, vl, { pointerId: 0, width: 0, height: 0, pressure: 0, tangentialPressure: 0, tiltX: 0, tiltY: 0, twist: 0, pointerType: 0, isPrimary: 0 }), u_ = lt(a0), u0 = R({}, iu, { touches: 0, targetTouches: 0, changedTouches: 0, altKey: 0, metaKey: 0, ctrlKey: 0, shiftKey: 0, getModifierState: ai }), l0 = lt(u0), c0 = R({}, Jn, { propertyName: 0, elapsedTime: 0, pseudoElement: 0 }), i0 = lt(c0), r0 = R({}, vl, { deltaX: function(e) {
    return "deltaX" in e ? e.deltaX : "wheelDeltaX" in e ? -e.wheelDeltaX : 0;
  }, deltaY: function(e) {
    return "deltaY" in e ? e.deltaY : "wheelDeltaY" in e ? -e.wheelDeltaY : "wheelDelta" in e ? -e.wheelDelta : 0;
  }, deltaZ: 0, deltaMode: 0 }), f0 = lt(r0), _0 = R({}, Jn, { newState: 0, oldState: 0 }), o0 = lt(_0), s0 = [9, 13, 27, 32], ui = Ft && "CompositionEvent" in window, fu = null;
  Ft && "documentMode" in document && (fu = document.documentMode);
  var b0 = Ft && "TextEvent" in window && !fu, l_ = Ft && (!ui || fu && 8 < fu && 11 >= fu), c_ = " ", i_ = false;
  function r_(e, t) {
    switch (e) {
      case "keyup":
        return s0.indexOf(t.keyCode) !== -1;
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
  function f_(e) {
    return e = e.detail, typeof e == "object" && "data" in e ? e.data : null;
  }
  var Sa = false;
  function d0(e, t) {
    switch (e) {
      case "compositionend":
        return f_(t);
      case "keypress":
        return t.which !== 32 ? null : (i_ = true, c_);
      case "textInput":
        return e = t.data, e === c_ && i_ ? null : e;
      default:
        return null;
    }
  }
  function g0(e, t) {
    if (Sa) return e === "compositionend" || !ui && r_(e, t) ? (e = e_(), wl = Pc = wn = null, Sa = false, e) : null;
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
        return l_ && t.locale !== "ko" ? null : t.data;
      default:
        return null;
    }
  }
  var m0 = { color: true, date: true, datetime: true, "datetime-local": true, email: true, month: true, number: true, password: true, range: true, search: true, tel: true, text: true, time: true, url: true, week: true };
  function __(e) {
    var t = e && e.nodeName && e.nodeName.toLowerCase();
    return t === "input" ? !!m0[e.type] : t === "textarea";
  }
  function o_(e, t, u, l) {
    pa ? va ? va.push(l) : va = [l] : pa = l, t = _c(t, "onChange"), 0 < t.length && (u = new pl("onChange", "change", null, u, l), e.push({ event: u, listeners: t }));
  }
  var _u = null, ou = null;
  function w0(e) {
    ks(e, 0);
  }
  function Sl(e) {
    var t = uu(e);
    if (Kf(t)) return e;
  }
  function s_(e, t) {
    if (e === "change") return t;
  }
  var b_ = false;
  if (Ft) {
    var li;
    if (Ft) {
      var ci = "oninput" in document;
      if (!ci) {
        var d_ = document.createElement("div");
        d_.setAttribute("oninput", "return;"), ci = typeof d_.oninput == "function";
      }
      li = ci;
    } else li = false;
    b_ = li && (!document.documentMode || 9 < document.documentMode);
  }
  function g_() {
    _u && (_u.detachEvent("onpropertychange", m_), ou = _u = null);
  }
  function m_(e) {
    if (e.propertyName === "value" && Sl(ou)) {
      var t = [];
      o_(t, ou, e, Ic(e)), Pf(w0, t);
    }
  }
  function y0(e, t, u) {
    e === "focusin" ? (g_(), _u = t, ou = u, _u.attachEvent("onpropertychange", m_)) : e === "focusout" && g_();
  }
  function h0(e) {
    if (e === "selectionchange" || e === "keyup" || e === "keydown") return Sl(ou);
  }
  function p0(e, t) {
    if (e === "click") return Sl(t);
  }
  function v0(e, t) {
    if (e === "input" || e === "change") return Sl(t);
  }
  function S0(e, t) {
    return e === t && (e !== 0 || 1 / e === 1 / t) || e !== e && t !== t;
  }
  var gt = typeof Object.is == "function" ? Object.is : S0;
  function su(e, t) {
    if (gt(e, t)) return true;
    if (typeof e != "object" || e === null || typeof t != "object" || t === null) return false;
    var u = Object.keys(e), l = Object.keys(t);
    if (u.length !== l.length) return false;
    for (l = 0; l < u.length; l++) {
      var r = u[l];
      if (!qc.call(t, r) || !gt(e[r], t[r])) return false;
    }
    return true;
  }
  function w_(e) {
    for (; e && e.firstChild; ) e = e.firstChild;
    return e;
  }
  function y_(e, t) {
    var u = w_(e);
    e = 0;
    for (var l; u; ) {
      if (u.nodeType === 3) {
        if (l = e + u.textContent.length, e <= t && l >= t) return { node: u, offset: t - e };
        e = l;
      }
      e: {
        for (; u; ) {
          if (u.nextSibling) {
            u = u.nextSibling;
            break e;
          }
          u = u.parentNode;
        }
        u = void 0;
      }
      u = w_(u);
    }
  }
  function h_(e, t) {
    return e && t ? e === t ? true : e && e.nodeType === 3 ? false : t && t.nodeType === 3 ? h_(e, t.parentNode) : "contains" in e ? e.contains(t) : e.compareDocumentPosition ? !!(e.compareDocumentPosition(t) & 16) : false : false;
  }
  function p_(e) {
    e = e != null && e.ownerDocument != null && e.ownerDocument.defaultView != null ? e.ownerDocument.defaultView : window;
    for (var t = gl(e.document); t instanceof e.HTMLIFrameElement; ) {
      try {
        var u = typeof t.contentWindow.location.href == "string";
      } catch {
        u = false;
      }
      if (u) e = t.contentWindow;
      else break;
      t = gl(e.document);
    }
    return t;
  }
  function ii(e) {
    var t = e && e.nodeName && e.nodeName.toLowerCase();
    return t && (t === "input" && (e.type === "text" || e.type === "search" || e.type === "tel" || e.type === "url" || e.type === "password") || t === "textarea" || e.contentEditable === "true");
  }
  var x0 = Ft && "documentMode" in document && 11 >= document.documentMode, xa = null, ri = null, bu = null, fi = false;
  function v_(e, t, u) {
    var l = u.window === u ? u.document : u.nodeType === 9 ? u : u.ownerDocument;
    fi || xa == null || xa !== gl(l) || (l = xa, "selectionStart" in l && ii(l) ? l = { start: l.selectionStart, end: l.selectionEnd } : (l = (l.ownerDocument && l.ownerDocument.defaultView || window).getSelection(), l = { anchorNode: l.anchorNode, anchorOffset: l.anchorOffset, focusNode: l.focusNode, focusOffset: l.focusOffset }), bu && su(bu, l) || (bu = l, l = _c(ri, "onSelect"), 0 < l.length && (t = new pl("onSelect", "select", null, t, u), e.push({ event: t, listeners: l }), t.target = xa)));
  }
  function kn(e, t) {
    var u = {};
    return u[e.toLowerCase()] = t.toLowerCase(), u["Webkit" + e] = "webkit" + t, u["Moz" + e] = "moz" + t, u;
  }
  var Aa = { animationend: kn("Animation", "AnimationEnd"), animationiteration: kn("Animation", "AnimationIteration"), animationstart: kn("Animation", "AnimationStart"), transitionrun: kn("Transition", "TransitionRun"), transitionstart: kn("Transition", "TransitionStart"), transitioncancel: kn("Transition", "TransitionCancel"), transitionend: kn("Transition", "TransitionEnd") }, _i = {}, S_ = {};
  Ft && (S_ = document.createElement("div").style, "AnimationEvent" in window || (delete Aa.animationend.animation, delete Aa.animationiteration.animation, delete Aa.animationstart.animation), "TransitionEvent" in window || delete Aa.transitionend.transition);
  function Wn(e) {
    if (_i[e]) return _i[e];
    if (!Aa[e]) return e;
    var t = Aa[e], u;
    for (u in t) if (t.hasOwnProperty(u) && u in S_) return _i[e] = t[u];
    return e;
  }
  var x_ = Wn("animationend"), A_ = Wn("animationiteration"), E_ = Wn("animationstart"), A0 = Wn("transitionrun"), E0 = Wn("transitionstart"), T0 = Wn("transitioncancel"), T_ = Wn("transitionend"), z_ = /* @__PURE__ */ new Map(), oi = "abort auxClick beforeToggle cancel canPlay canPlayThrough click close contextMenu copy cut drag dragEnd dragEnter dragExit dragLeave dragOver dragStart drop durationChange emptied encrypted ended error gotPointerCapture input invalid keyDown keyPress keyUp load loadedData loadedMetadata loadStart lostPointerCapture mouseDown mouseMove mouseOut mouseOver mouseUp paste pause play playing pointerCancel pointerDown pointerMove pointerOut pointerOver pointerUp progress rateChange reset resize seeked seeking stalled submit suspend timeUpdate touchCancel touchEnd touchStart volumeChange scroll toggle touchMove waiting wheel".split(" ");
  oi.push("scrollEnd");
  function qt(e, t) {
    z_.set(e, t), Kn(t, [e]);
  }
  var xl = typeof reportError == "function" ? reportError : function(e) {
    if (typeof window == "object" && typeof window.ErrorEvent == "function") {
      var t = new window.ErrorEvent("error", { bubbles: true, cancelable: true, message: typeof e == "object" && e !== null && typeof e.message == "string" ? String(e.message) : String(e), error: e });
      if (!window.dispatchEvent(t)) return;
    } else if (typeof process == "object" && typeof process.emit == "function") {
      process.emit("uncaughtException", e);
      return;
    }
    console.error(e);
  }, Et = [], Ea = 0, si = 0;
  function Al() {
    for (var e = Ea, t = si = Ea = 0; t < e; ) {
      var u = Et[t];
      Et[t++] = null;
      var l = Et[t];
      Et[t++] = null;
      var r = Et[t];
      Et[t++] = null;
      var f = Et[t];
      if (Et[t++] = null, l !== null && r !== null) {
        var b = l.pending;
        b === null ? r.next = r : (r.next = b.next, b.next = r), l.pending = r;
      }
      f !== 0 && O_(u, r, f);
    }
  }
  function El(e, t, u, l) {
    Et[Ea++] = e, Et[Ea++] = t, Et[Ea++] = u, Et[Ea++] = l, si |= l, e.lanes |= l, e = e.alternate, e !== null && (e.lanes |= l);
  }
  function bi(e, t, u, l) {
    return El(e, t, u, l), Tl(e);
  }
  function In(e, t) {
    return El(e, null, null, t), Tl(e);
  }
  function O_(e, t, u) {
    e.lanes |= u;
    var l = e.alternate;
    l !== null && (l.lanes |= u);
    for (var r = false, f = e.return; f !== null; ) f.childLanes |= u, l = f.alternate, l !== null && (l.childLanes |= u), f.tag === 22 && (e = f.stateNode, e === null || e._visibility & 1 || (r = true)), e = f, f = f.return;
    return e.tag === 3 ? (f = e.stateNode, r && t !== null && (r = 31 - dt(u), e = f.hiddenUpdates, l = e[r], l === null ? e[r] = [t] : l.push(t), t.lane = u | 536870912), f) : null;
  }
  function Tl(e) {
    if (50 < Nu) throw Nu = 0, Sr = null, Error(a(185));
    for (var t = e.return; t !== null; ) e = t, t = e.return;
    return e.tag === 3 ? e.stateNode : null;
  }
  var Ta = {};
  function z0(e, t, u, l) {
    this.tag = e, this.key = u, this.sibling = this.child = this.return = this.stateNode = this.type = this.elementType = null, this.index = 0, this.refCleanup = this.ref = null, this.pendingProps = t, this.dependencies = this.memoizedState = this.updateQueue = this.memoizedProps = null, this.mode = l, this.subtreeFlags = this.flags = 0, this.deletions = null, this.childLanes = this.lanes = 0, this.alternate = null;
  }
  function mt(e, t, u, l) {
    return new z0(e, t, u, l);
  }
  function di(e) {
    return e = e.prototype, !(!e || !e.isReactComponent);
  }
  function $t(e, t) {
    var u = e.alternate;
    return u === null ? (u = mt(e.tag, t, e.key, e.mode), u.elementType = e.elementType, u.type = e.type, u.stateNode = e.stateNode, u.alternate = e, e.alternate = u) : (u.pendingProps = t, u.type = e.type, u.flags = 0, u.subtreeFlags = 0, u.deletions = null), u.flags = e.flags & 65011712, u.childLanes = e.childLanes, u.lanes = e.lanes, u.child = e.child, u.memoizedProps = e.memoizedProps, u.memoizedState = e.memoizedState, u.updateQueue = e.updateQueue, t = e.dependencies, u.dependencies = t === null ? null : { lanes: t.lanes, firstContext: t.firstContext }, u.sibling = e.sibling, u.index = e.index, u.ref = e.ref, u.refCleanup = e.refCleanup, u;
  }
  function D_(e, t) {
    e.flags &= 65011714;
    var u = e.alternate;
    return u === null ? (e.childLanes = 0, e.lanes = t, e.child = null, e.subtreeFlags = 0, e.memoizedProps = null, e.memoizedState = null, e.updateQueue = null, e.dependencies = null, e.stateNode = null) : (e.childLanes = u.childLanes, e.lanes = u.lanes, e.child = u.child, e.subtreeFlags = 0, e.deletions = null, e.memoizedProps = u.memoizedProps, e.memoizedState = u.memoizedState, e.updateQueue = u.updateQueue, e.type = u.type, t = u.dependencies, e.dependencies = t === null ? null : { lanes: t.lanes, firstContext: t.firstContext }), e;
  }
  function zl(e, t, u, l, r, f) {
    var b = 0;
    if (l = e, typeof e == "function") di(e) && (b = 1);
    else if (typeof e == "string") b = Rg(e, u, Z.current) ? 26 : e === "html" || e === "head" || e === "body" ? 27 : 5;
    else e: switch (e) {
      case Vt:
        return e = mt(31, u, t, r), e.elementType = Vt, e.lanes = f, e;
      case ne:
        return Fn(u.children, r, f, t);
      case oe:
        b = 8, r |= 24;
        break;
      case Me:
        return e = mt(12, u, t, r | 2), e.elementType = Me, e.lanes = f, e;
      case Yt:
        return e = mt(13, u, t, r), e.elementType = Yt, e.lanes = f, e;
      case tt:
        return e = mt(19, u, t, r), e.elementType = tt, e.lanes = f, e;
      default:
        if (typeof e == "object" && e !== null) switch (e.$$typeof) {
          case Ve:
            b = 10;
            break e;
          case Ke:
            b = 9;
            break e;
          case ot:
            b = 11;
            break e;
          case se:
            b = 14;
            break e;
          case nt:
            b = 16, l = null;
            break e;
        }
        b = 29, u = Error(a(130, e === null ? "null" : typeof e, "")), l = null;
    }
    return t = mt(b, u, t, r), t.elementType = e, t.type = l, t.lanes = f, t;
  }
  function Fn(e, t, u, l) {
    return e = mt(7, e, l, t), e.lanes = u, e;
  }
  function gi(e, t, u) {
    return e = mt(6, e, null, t), e.lanes = u, e;
  }
  function M_(e) {
    var t = mt(18, null, null, 0);
    return t.stateNode = e, t;
  }
  function mi(e, t, u) {
    return t = mt(4, e.children !== null ? e.children : [], e.key, t), t.lanes = u, t.stateNode = { containerInfo: e.containerInfo, pendingChildren: null, implementation: e.implementation }, t;
  }
  var C_ = /* @__PURE__ */ new WeakMap();
  function Tt(e, t) {
    if (typeof e == "object" && e !== null) {
      var u = C_.get(e);
      return u !== void 0 ? u : (t = { value: e, source: t, stack: Mf(t) }, C_.set(e, t), t);
    }
    return { value: e, source: t, stack: Mf(t) };
  }
  var za = [], Oa = 0, Ol = null, du = 0, zt = [], Ot = 0, yn = null, Qt = 1, Zt = "";
  function Pt(e, t) {
    za[Oa++] = du, za[Oa++] = Ol, Ol = e, du = t;
  }
  function R_(e, t, u) {
    zt[Ot++] = Qt, zt[Ot++] = Zt, zt[Ot++] = yn, yn = e;
    var l = Qt;
    e = Zt;
    var r = 32 - dt(l) - 1;
    l &= ~(1 << r), u += 1;
    var f = 32 - dt(t) + r;
    if (30 < f) {
      var b = r - r % 5;
      f = (l & (1 << b) - 1).toString(32), l >>= b, r -= b, Qt = 1 << 32 - dt(t) + r | u << r | l, Zt = f + e;
    } else Qt = 1 << f | u << r | l, Zt = e;
  }
  function wi(e) {
    e.return !== null && (Pt(e, 1), R_(e, 1, 0));
  }
  function yi(e) {
    for (; e === Ol; ) Ol = za[--Oa], za[Oa] = null, du = za[--Oa], za[Oa] = null;
    for (; e === yn; ) yn = zt[--Ot], zt[Ot] = null, Zt = zt[--Ot], zt[Ot] = null, Qt = zt[--Ot], zt[Ot] = null;
  }
  function U_(e, t) {
    zt[Ot++] = Qt, zt[Ot++] = Zt, zt[Ot++] = yn, Qt = t.id, Zt = t.overflow, yn = e;
  }
  var ke = null, Te = null, be = false, hn = null, Dt = false, hi = Error(a(519));
  function pn(e) {
    var t = Error(a(418, 1 < arguments.length && arguments[1] !== void 0 && arguments[1] ? "text" : "HTML", ""));
    throw gu(Tt(t, e)), hi;
  }
  function B_(e) {
    var t = e.stateNode, u = e.type, l = e.memoizedProps;
    switch (t[Je] = e, t[ut] = l, u) {
      case "dialog":
        ce("cancel", t), ce("close", t);
        break;
      case "iframe":
      case "object":
      case "embed":
        ce("load", t);
        break;
      case "video":
      case "audio":
        for (u = 0; u < qu.length; u++) ce(qu[u], t);
        break;
      case "source":
        ce("error", t);
        break;
      case "img":
      case "image":
      case "link":
        ce("error", t), ce("load", t);
        break;
      case "details":
        ce("toggle", t);
        break;
      case "input":
        ce("invalid", t), Jf(t, l.value, l.defaultValue, l.checked, l.defaultChecked, l.type, l.name, true);
        break;
      case "select":
        ce("invalid", t);
        break;
      case "textarea":
        ce("invalid", t), Wf(t, l.value, l.defaultValue, l.children);
    }
    u = l.children, typeof u != "string" && typeof u != "number" && typeof u != "bigint" || t.textContent === "" + u || l.suppressHydrationWarning === true || $s(t.textContent, u) ? (l.popover != null && (ce("beforetoggle", t), ce("toggle", t)), l.onScroll != null && ce("scroll", t), l.onScrollEnd != null && ce("scrollend", t), l.onClick != null && (t.onclick = It), t = true) : t = false, t || pn(e, true);
  }
  function N_(e) {
    for (ke = e.return; ke; ) switch (ke.tag) {
      case 5:
      case 31:
      case 13:
        Dt = false;
        return;
      case 27:
      case 3:
        Dt = true;
        return;
      default:
        ke = ke.return;
    }
  }
  function Da(e) {
    if (e !== ke) return false;
    if (!be) return N_(e), be = true, false;
    var t = e.tag, u;
    if ((u = t !== 3 && t !== 27) && ((u = t === 5) && (u = e.type, u = !(u !== "form" && u !== "button") || qr(e.type, e.memoizedProps)), u = !u), u && Te && pn(e), N_(e), t === 13) {
      if (e = e.memoizedState, e = e !== null ? e.dehydrated : null, !e) throw Error(a(317));
      Te = ib(e);
    } else if (t === 31) {
      if (e = e.memoizedState, e = e !== null ? e.dehydrated : null, !e) throw Error(a(317));
      Te = ib(e);
    } else t === 27 ? (t = Te, Bn(e.type) ? (e = Vr, Vr = null, Te = e) : Te = t) : Te = ke ? Ct(e.stateNode.nextSibling) : null;
    return true;
  }
  function $n() {
    Te = ke = null, be = false;
  }
  function pi() {
    var e = hn;
    return e !== null && (ft === null ? ft = e : ft.push.apply(ft, e), hn = null), e;
  }
  function gu(e) {
    hn === null ? hn = [e] : hn.push(e);
  }
  var vi = x(null), Pn = null, en = null;
  function vn(e, t, u) {
    Y(vi, t._currentValue), t._currentValue = u;
  }
  function tn(e) {
    e._currentValue = vi.current, j(vi);
  }
  function Si(e, t, u) {
    for (; e !== null; ) {
      var l = e.alternate;
      if ((e.childLanes & t) !== t ? (e.childLanes |= t, l !== null && (l.childLanes |= t)) : l !== null && (l.childLanes & t) !== t && (l.childLanes |= t), e === u) break;
      e = e.return;
    }
  }
  function xi(e, t, u, l) {
    var r = e.child;
    for (r !== null && (r.return = e); r !== null; ) {
      var f = r.dependencies;
      if (f !== null) {
        var b = r.child;
        f = f.firstContext;
        e: for (; f !== null; ) {
          var g = f;
          f = r;
          for (var w = 0; w < t.length; w++) if (g.context === t[w]) {
            f.lanes |= u, g = f.alternate, g !== null && (g.lanes |= u), Si(f.return, u, e), l || (b = null);
            break e;
          }
          f = g.next;
        }
      } else if (r.tag === 18) {
        if (b = r.return, b === null) throw Error(a(341));
        b.lanes |= u, f = b.alternate, f !== null && (f.lanes |= u), Si(b, u, e), b = null;
      } else b = r.child;
      if (b !== null) b.return = r;
      else for (b = r; b !== null; ) {
        if (b === e) {
          b = null;
          break;
        }
        if (r = b.sibling, r !== null) {
          r.return = b.return, b = r;
          break;
        }
        b = b.return;
      }
      r = b;
    }
  }
  function Ma(e, t, u, l) {
    e = null;
    for (var r = t, f = false; r !== null; ) {
      if (!f) {
        if ((r.flags & 524288) !== 0) f = true;
        else if ((r.flags & 262144) !== 0) break;
      }
      if (r.tag === 10) {
        var b = r.alternate;
        if (b === null) throw Error(a(387));
        if (b = b.memoizedProps, b !== null) {
          var g = r.type;
          gt(r.pendingProps.value, b.value) || (e !== null ? e.push(g) : e = [g]);
        }
      } else if (r === we.current) {
        if (b = r.alternate, b === null) throw Error(a(387));
        b.memoizedState.memoizedState !== r.memoizedState.memoizedState && (e !== null ? e.push(Vu) : e = [Vu]);
      }
      r = r.return;
    }
    e !== null && xi(t, e, u, l), t.flags |= 262144;
  }
  function Dl(e) {
    for (e = e.firstContext; e !== null; ) {
      if (!gt(e.context._currentValue, e.memoizedValue)) return true;
      e = e.next;
    }
    return false;
  }
  function ea(e) {
    Pn = e, en = null, e = e.dependencies, e !== null && (e.firstContext = null);
  }
  function We(e) {
    return j_(Pn, e);
  }
  function Ml(e, t) {
    return Pn === null && ea(e), j_(e, t);
  }
  function j_(e, t) {
    var u = t._currentValue;
    if (t = { context: t, memoizedValue: u, next: null }, en === null) {
      if (e === null) throw Error(a(308));
      en = t, e.dependencies = { lanes: 0, firstContext: t }, e.flags |= 524288;
    } else en = en.next = t;
    return u;
  }
  var O0 = typeof AbortController < "u" ? AbortController : function() {
    var e = [], t = this.signal = { aborted: false, addEventListener: function(u, l) {
      e.push(l);
    } };
    this.abort = function() {
      t.aborted = true, e.forEach(function(u) {
        return u();
      });
    };
  }, D0 = o.unstable_scheduleCallback, M0 = o.unstable_NormalPriority, He = { $$typeof: Ve, Consumer: null, Provider: null, _currentValue: null, _currentValue2: null, _threadCount: 0 };
  function Ai() {
    return { controller: new O0(), data: /* @__PURE__ */ new Map(), refCount: 0 };
  }
  function mu(e) {
    e.refCount--, e.refCount === 0 && D0(M0, function() {
      e.controller.abort();
    });
  }
  var wu = null, Ei = 0, Ca = 0, Ra = null;
  function C0(e, t) {
    if (wu === null) {
      var u = wu = [];
      Ei = 0, Ca = Or(), Ra = { status: "pending", value: void 0, then: function(l) {
        u.push(l);
      } };
    }
    return Ei++, t.then(q_, q_), t;
  }
  function q_() {
    if (--Ei === 0 && wu !== null) {
      Ra !== null && (Ra.status = "fulfilled");
      var e = wu;
      wu = null, Ca = 0, Ra = null;
      for (var t = 0; t < e.length; t++) (0, e[t])();
    }
  }
  function R0(e, t) {
    var u = [], l = { status: "pending", value: null, reason: null, then: function(r) {
      u.push(r);
    } };
    return e.then(function() {
      l.status = "fulfilled", l.value = t;
      for (var r = 0; r < u.length; r++) (0, u[r])(t);
    }, function(r) {
      for (l.status = "rejected", l.reason = r, r = 0; r < u.length; r++) (0, u[r])(void 0);
    }), l;
  }
  var H_ = C.S;
  C.S = function(e, t) {
    Ss = st(), typeof t == "object" && t !== null && typeof t.then == "function" && C0(e, t), H_ !== null && H_(e, t);
  };
  var ta = x(null);
  function Ti() {
    var e = ta.current;
    return e !== null ? e : Ee.pooledCache;
  }
  function Cl(e, t) {
    t === null ? Y(ta, ta.current) : Y(ta, t.pool);
  }
  function L_() {
    var e = Ti();
    return e === null ? null : { parent: He._currentValue, pool: e };
  }
  var Ua = Error(a(460)), zi = Error(a(474)), Rl = Error(a(542)), Ul = { then: function() {
  } };
  function G_(e) {
    return e = e.status, e === "fulfilled" || e === "rejected";
  }
  function Y_(e, t, u) {
    switch (u = e[u], u === void 0 ? e.push(t) : u !== t && (t.then(It, It), t = u), t.status) {
      case "fulfilled":
        return t.value;
      case "rejected":
        throw e = t.reason, X_(e), e;
      default:
        if (typeof t.status == "string") t.then(It, It);
        else {
          if (e = Ee, e !== null && 100 < e.shellSuspendCounter) throw Error(a(482));
          e = t, e.status = "pending", e.then(function(l) {
            if (t.status === "pending") {
              var r = t;
              r.status = "fulfilled", r.value = l;
            }
          }, function(l) {
            if (t.status === "pending") {
              var r = t;
              r.status = "rejected", r.reason = l;
            }
          });
        }
        switch (t.status) {
          case "fulfilled":
            return t.value;
          case "rejected":
            throw e = t.reason, X_(e), e;
        }
        throw aa = t, Ua;
    }
  }
  function na(e) {
    try {
      var t = e._init;
      return t(e._payload);
    } catch (u) {
      throw u !== null && typeof u == "object" && typeof u.then == "function" ? (aa = u, Ua) : u;
    }
  }
  var aa = null;
  function V_() {
    if (aa === null) throw Error(a(459));
    var e = aa;
    return aa = null, e;
  }
  function X_(e) {
    if (e === Ua || e === Rl) throw Error(a(483));
  }
  var Ba = null, yu = 0;
  function Bl(e) {
    var t = yu;
    return yu += 1, Ba === null && (Ba = []), Y_(Ba, e, t);
  }
  function hu(e, t) {
    t = t.props.ref, e.ref = t !== void 0 ? t : null;
  }
  function Nl(e, t) {
    throw t.$$typeof === X ? Error(a(525)) : (e = Object.prototype.toString.call(t), Error(a(31, e === "[object Object]" ? "object with keys {" + Object.keys(t).join(", ") + "}" : e)));
  }
  function Q_(e) {
    function t(A, v) {
      if (e) {
        var E = A.deletions;
        E === null ? (A.deletions = [v], A.flags |= 16) : E.push(v);
      }
    }
    function u(A, v) {
      if (!e) return null;
      for (; v !== null; ) t(A, v), v = v.sibling;
      return null;
    }
    function l(A) {
      for (var v = /* @__PURE__ */ new Map(); A !== null; ) A.key !== null ? v.set(A.key, A) : v.set(A.index, A), A = A.sibling;
      return v;
    }
    function r(A, v) {
      return A = $t(A, v), A.index = 0, A.sibling = null, A;
    }
    function f(A, v, E) {
      return A.index = E, e ? (E = A.alternate, E !== null ? (E = E.index, E < v ? (A.flags |= 67108866, v) : E) : (A.flags |= 67108866, v)) : (A.flags |= 1048576, v);
    }
    function b(A) {
      return e && A.alternate === null && (A.flags |= 67108866), A;
    }
    function g(A, v, E, U) {
      return v === null || v.tag !== 6 ? (v = gi(E, A.mode, U), v.return = A, v) : (v = r(v, E), v.return = A, v);
    }
    function w(A, v, E, U) {
      var k = E.type;
      return k === ne ? M(A, v, E.props.children, U, E.key) : v !== null && (v.elementType === k || typeof k == "object" && k !== null && k.$$typeof === nt && na(k) === v.type) ? (v = r(v, E.props), hu(v, E), v.return = A, v) : (v = zl(E.type, E.key, E.props, null, A.mode, U), hu(v, E), v.return = A, v);
    }
    function T(A, v, E, U) {
      return v === null || v.tag !== 4 || v.stateNode.containerInfo !== E.containerInfo || v.stateNode.implementation !== E.implementation ? (v = mi(E, A.mode, U), v.return = A, v) : (v = r(v, E.children || []), v.return = A, v);
    }
    function M(A, v, E, U, k) {
      return v === null || v.tag !== 7 ? (v = Fn(E, A.mode, U, k), v.return = A, v) : (v = r(v, E), v.return = A, v);
    }
    function N(A, v, E) {
      if (typeof v == "string" && v !== "" || typeof v == "number" || typeof v == "bigint") return v = gi("" + v, A.mode, E), v.return = A, v;
      if (typeof v == "object" && v !== null) {
        switch (v.$$typeof) {
          case ie:
            return E = zl(v.type, v.key, v.props, null, A.mode, E), hu(E, v), E.return = A, E;
          case qe:
            return v = mi(v, A.mode, E), v.return = A, v;
          case nt:
            return v = na(v), N(A, v, E);
        }
        if (jt(v) || at(v)) return v = Fn(v, A.mode, E, null), v.return = A, v;
        if (typeof v.then == "function") return N(A, Bl(v), E);
        if (v.$$typeof === Ve) return N(A, Ml(A, v), E);
        Nl(A, v);
      }
      return null;
    }
    function z(A, v, E, U) {
      var k = v !== null ? v.key : null;
      if (typeof E == "string" && E !== "" || typeof E == "number" || typeof E == "bigint") return k !== null ? null : g(A, v, "" + E, U);
      if (typeof E == "object" && E !== null) {
        switch (E.$$typeof) {
          case ie:
            return E.key === k ? w(A, v, E, U) : null;
          case qe:
            return E.key === k ? T(A, v, E, U) : null;
          case nt:
            return E = na(E), z(A, v, E, U);
        }
        if (jt(E) || at(E)) return k !== null ? null : M(A, v, E, U, null);
        if (typeof E.then == "function") return z(A, v, Bl(E), U);
        if (E.$$typeof === Ve) return z(A, v, Ml(A, E), U);
        Nl(A, E);
      }
      return null;
    }
    function D(A, v, E, U, k) {
      if (typeof U == "string" && U !== "" || typeof U == "number" || typeof U == "bigint") return A = A.get(E) || null, g(v, A, "" + U, k);
      if (typeof U == "object" && U !== null) {
        switch (U.$$typeof) {
          case ie:
            return A = A.get(U.key === null ? E : U.key) || null, w(v, A, U, k);
          case qe:
            return A = A.get(U.key === null ? E : U.key) || null, T(v, A, U, k);
          case nt:
            return U = na(U), D(A, v, E, U, k);
        }
        if (jt(U) || at(U)) return A = A.get(E) || null, M(v, A, U, k, null);
        if (typeof U.then == "function") return D(A, v, E, Bl(U), k);
        if (U.$$typeof === Ve) return D(A, v, E, Ml(v, U), k);
        Nl(v, U);
      }
      return null;
    }
    function Q(A, v, E, U) {
      for (var k = null, de = null, K = v, te = v = 0, fe = null; K !== null && te < E.length; te++) {
        K.index > te ? (fe = K, K = null) : fe = K.sibling;
        var ge = z(A, K, E[te], U);
        if (ge === null) {
          K === null && (K = fe);
          break;
        }
        e && K && ge.alternate === null && t(A, K), v = f(ge, v, te), de === null ? k = ge : de.sibling = ge, de = ge, K = fe;
      }
      if (te === E.length) return u(A, K), be && Pt(A, te), k;
      if (K === null) {
        for (; te < E.length; te++) K = N(A, E[te], U), K !== null && (v = f(K, v, te), de === null ? k = K : de.sibling = K, de = K);
        return be && Pt(A, te), k;
      }
      for (K = l(K); te < E.length; te++) fe = D(K, A, te, E[te], U), fe !== null && (e && fe.alternate !== null && K.delete(fe.key === null ? te : fe.key), v = f(fe, v, te), de === null ? k = fe : de.sibling = fe, de = fe);
      return e && K.forEach(function(Ln) {
        return t(A, Ln);
      }), be && Pt(A, te), k;
    }
    function W(A, v, E, U) {
      if (E == null) throw Error(a(151));
      for (var k = null, de = null, K = v, te = v = 0, fe = null, ge = E.next(); K !== null && !ge.done; te++, ge = E.next()) {
        K.index > te ? (fe = K, K = null) : fe = K.sibling;
        var Ln = z(A, K, ge.value, U);
        if (Ln === null) {
          K === null && (K = fe);
          break;
        }
        e && K && Ln.alternate === null && t(A, K), v = f(Ln, v, te), de === null ? k = Ln : de.sibling = Ln, de = Ln, K = fe;
      }
      if (ge.done) return u(A, K), be && Pt(A, te), k;
      if (K === null) {
        for (; !ge.done; te++, ge = E.next()) ge = N(A, ge.value, U), ge !== null && (v = f(ge, v, te), de === null ? k = ge : de.sibling = ge, de = ge);
        return be && Pt(A, te), k;
      }
      for (K = l(K); !ge.done; te++, ge = E.next()) ge = D(K, A, te, ge.value, U), ge !== null && (e && ge.alternate !== null && K.delete(ge.key === null ? te : ge.key), v = f(ge, v, te), de === null ? k = ge : de.sibling = ge, de = ge);
      return e && K.forEach(function(Xg) {
        return t(A, Xg);
      }), be && Pt(A, te), k;
    }
    function xe(A, v, E, U) {
      if (typeof E == "object" && E !== null && E.type === ne && E.key === null && (E = E.props.children), typeof E == "object" && E !== null) {
        switch (E.$$typeof) {
          case ie:
            e: {
              for (var k = E.key; v !== null; ) {
                if (v.key === k) {
                  if (k = E.type, k === ne) {
                    if (v.tag === 7) {
                      u(A, v.sibling), U = r(v, E.props.children), U.return = A, A = U;
                      break e;
                    }
                  } else if (v.elementType === k || typeof k == "object" && k !== null && k.$$typeof === nt && na(k) === v.type) {
                    u(A, v.sibling), U = r(v, E.props), hu(U, E), U.return = A, A = U;
                    break e;
                  }
                  u(A, v);
                  break;
                } else t(A, v);
                v = v.sibling;
              }
              E.type === ne ? (U = Fn(E.props.children, A.mode, U, E.key), U.return = A, A = U) : (U = zl(E.type, E.key, E.props, null, A.mode, U), hu(U, E), U.return = A, A = U);
            }
            return b(A);
          case qe:
            e: {
              for (k = E.key; v !== null; ) {
                if (v.key === k) if (v.tag === 4 && v.stateNode.containerInfo === E.containerInfo && v.stateNode.implementation === E.implementation) {
                  u(A, v.sibling), U = r(v, E.children || []), U.return = A, A = U;
                  break e;
                } else {
                  u(A, v);
                  break;
                }
                else t(A, v);
                v = v.sibling;
              }
              U = mi(E, A.mode, U), U.return = A, A = U;
            }
            return b(A);
          case nt:
            return E = na(E), xe(A, v, E, U);
        }
        if (jt(E)) return Q(A, v, E, U);
        if (at(E)) {
          if (k = at(E), typeof k != "function") throw Error(a(150));
          return E = k.call(E), W(A, v, E, U);
        }
        if (typeof E.then == "function") return xe(A, v, Bl(E), U);
        if (E.$$typeof === Ve) return xe(A, v, Ml(A, E), U);
        Nl(A, E);
      }
      return typeof E == "string" && E !== "" || typeof E == "number" || typeof E == "bigint" ? (E = "" + E, v !== null && v.tag === 6 ? (u(A, v.sibling), U = r(v, E), U.return = A, A = U) : (u(A, v), U = gi(E, A.mode, U), U.return = A, A = U), b(A)) : u(A, v);
    }
    return function(A, v, E, U) {
      try {
        yu = 0;
        var k = xe(A, v, E, U);
        return Ba = null, k;
      } catch (K) {
        if (K === Ua || K === Rl) throw K;
        var de = mt(29, K, null, A.mode);
        return de.lanes = U, de.return = A, de;
      } finally {
      }
    };
  }
  var ua = Q_(true), Z_ = Q_(false), Sn = false;
  function Oi(e) {
    e.updateQueue = { baseState: e.memoizedState, firstBaseUpdate: null, lastBaseUpdate: null, shared: { pending: null, lanes: 0, hiddenCallbacks: null }, callbacks: null };
  }
  function Di(e, t) {
    e = e.updateQueue, t.updateQueue === e && (t.updateQueue = { baseState: e.baseState, firstBaseUpdate: e.firstBaseUpdate, lastBaseUpdate: e.lastBaseUpdate, shared: e.shared, callbacks: null });
  }
  function xn(e) {
    return { lane: e, tag: 0, payload: null, callback: null, next: null };
  }
  function An(e, t, u) {
    var l = e.updateQueue;
    if (l === null) return null;
    if (l = l.shared, (me & 2) !== 0) {
      var r = l.pending;
      return r === null ? t.next = t : (t.next = r.next, r.next = t), l.pending = t, t = Tl(e), O_(e, null, u), t;
    }
    return El(e, l, t, u), Tl(e);
  }
  function pu(e, t, u) {
    if (t = t.updateQueue, t !== null && (t = t.shared, (u & 4194048) !== 0)) {
      var l = t.lanes;
      l &= e.pendingLanes, u |= l, t.lanes = u, jf(e, u);
    }
  }
  function Mi(e, t) {
    var u = e.updateQueue, l = e.alternate;
    if (l !== null && (l = l.updateQueue, u === l)) {
      var r = null, f = null;
      if (u = u.firstBaseUpdate, u !== null) {
        do {
          var b = { lane: u.lane, tag: u.tag, payload: u.payload, callback: null, next: null };
          f === null ? r = f = b : f = f.next = b, u = u.next;
        } while (u !== null);
        f === null ? r = f = t : f = f.next = t;
      } else r = f = t;
      u = { baseState: l.baseState, firstBaseUpdate: r, lastBaseUpdate: f, shared: l.shared, callbacks: l.callbacks }, e.updateQueue = u;
      return;
    }
    e = u.lastBaseUpdate, e === null ? u.firstBaseUpdate = t : e.next = t, u.lastBaseUpdate = t;
  }
  var Ci = false;
  function vu() {
    if (Ci) {
      var e = Ra;
      if (e !== null) throw e;
    }
  }
  function Su(e, t, u, l) {
    Ci = false;
    var r = e.updateQueue;
    Sn = false;
    var f = r.firstBaseUpdate, b = r.lastBaseUpdate, g = r.shared.pending;
    if (g !== null) {
      r.shared.pending = null;
      var w = g, T = w.next;
      w.next = null, b === null ? f = T : b.next = T, b = w;
      var M = e.alternate;
      M !== null && (M = M.updateQueue, g = M.lastBaseUpdate, g !== b && (g === null ? M.firstBaseUpdate = T : g.next = T, M.lastBaseUpdate = w));
    }
    if (f !== null) {
      var N = r.baseState;
      b = 0, M = T = w = null, g = f;
      do {
        var z = g.lane & -536870913, D = z !== g.lane;
        if (D ? (re & z) === z : (l & z) === z) {
          z !== 0 && z === Ca && (Ci = true), M !== null && (M = M.next = { lane: 0, tag: g.tag, payload: g.payload, callback: null, next: null });
          e: {
            var Q = e, W = g;
            z = t;
            var xe = u;
            switch (W.tag) {
              case 1:
                if (Q = W.payload, typeof Q == "function") {
                  N = Q.call(xe, N, z);
                  break e;
                }
                N = Q;
                break e;
              case 3:
                Q.flags = Q.flags & -65537 | 128;
              case 0:
                if (Q = W.payload, z = typeof Q == "function" ? Q.call(xe, N, z) : Q, z == null) break e;
                N = R({}, N, z);
                break e;
              case 2:
                Sn = true;
            }
          }
          z = g.callback, z !== null && (e.flags |= 64, D && (e.flags |= 8192), D = r.callbacks, D === null ? r.callbacks = [z] : D.push(z));
        } else D = { lane: z, tag: g.tag, payload: g.payload, callback: g.callback, next: null }, M === null ? (T = M = D, w = N) : M = M.next = D, b |= z;
        if (g = g.next, g === null) {
          if (g = r.shared.pending, g === null) break;
          D = g, g = D.next, D.next = null, r.lastBaseUpdate = D, r.shared.pending = null;
        }
      } while (true);
      M === null && (w = N), r.baseState = w, r.firstBaseUpdate = T, r.lastBaseUpdate = M, f === null && (r.shared.lanes = 0), Dn |= b, e.lanes = b, e.memoizedState = N;
    }
  }
  function K_(e, t) {
    if (typeof e != "function") throw Error(a(191, e));
    e.call(t);
  }
  function J_(e, t) {
    var u = e.callbacks;
    if (u !== null) for (e.callbacks = null, e = 0; e < u.length; e++) K_(u[e], t);
  }
  var Na = x(null), jl = x(0);
  function k_(e, t) {
    e = on, Y(jl, e), Y(Na, t), on = e | t.baseLanes;
  }
  function Ri() {
    Y(jl, on), Y(Na, Na.current);
  }
  function Ui() {
    on = jl.current, j(Na), j(jl);
  }
  var wt = x(null), Mt = null;
  function En(e) {
    var t = e.alternate;
    Y(Be, Be.current & 1), Y(wt, e), Mt === null && (t === null || Na.current !== null || t.memoizedState !== null) && (Mt = e);
  }
  function Bi(e) {
    Y(Be, Be.current), Y(wt, e), Mt === null && (Mt = e);
  }
  function W_(e) {
    e.tag === 22 ? (Y(Be, Be.current), Y(wt, e), Mt === null && (Mt = e)) : Tn();
  }
  function Tn() {
    Y(Be, Be.current), Y(wt, wt.current);
  }
  function yt(e) {
    j(wt), Mt === e && (Mt = null), j(Be);
  }
  var Be = x(0);
  function ql(e) {
    for (var t = e; t !== null; ) {
      if (t.tag === 13) {
        var u = t.memoizedState;
        if (u !== null && (u = u.dehydrated, u === null || Gr(u) || Yr(u))) return t;
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
  var nn = 0, ee = null, ve = null, Le = null, Hl = false, ja = false, la = false, Ll = 0, xu = 0, qa = null, U0 = 0;
  function Ce() {
    throw Error(a(321));
  }
  function Ni(e, t) {
    if (t === null) return false;
    for (var u = 0; u < t.length && u < e.length; u++) if (!gt(e[u], t[u])) return false;
    return true;
  }
  function ji(e, t, u, l, r, f) {
    return nn = f, ee = t, t.memoizedState = null, t.updateQueue = null, t.lanes = 0, C.H = e === null || e.memoizedState === null ? Uo : Fi, la = false, f = u(l, r), la = false, ja && (f = F_(t, u, l, r)), I_(e), f;
  }
  function I_(e) {
    C.H = Tu;
    var t = ve !== null && ve.next !== null;
    if (nn = 0, Le = ve = ee = null, Hl = false, xu = 0, qa = null, t) throw Error(a(300));
    e === null || Ge || (e = e.dependencies, e !== null && Dl(e) && (Ge = true));
  }
  function F_(e, t, u, l) {
    ee = e;
    var r = 0;
    do {
      if (ja && (qa = null), xu = 0, ja = false, 25 <= r) throw Error(a(301));
      if (r += 1, Le = ve = null, e.updateQueue != null) {
        var f = e.updateQueue;
        f.lastEffect = null, f.events = null, f.stores = null, f.memoCache != null && (f.memoCache.index = 0);
      }
      C.H = Bo, f = t(u, l);
    } while (ja);
    return f;
  }
  function B0() {
    var e = C.H, t = e.useState()[0];
    return t = typeof t.then == "function" ? Au(t) : t, e = e.useState()[0], (ve !== null ? ve.memoizedState : null) !== e && (ee.flags |= 1024), t;
  }
  function qi() {
    var e = Ll !== 0;
    return Ll = 0, e;
  }
  function Hi(e, t, u) {
    t.updateQueue = e.updateQueue, t.flags &= -2053, e.lanes &= ~u;
  }
  function Li(e) {
    if (Hl) {
      for (e = e.memoizedState; e !== null; ) {
        var t = e.queue;
        t !== null && (t.pending = null), e = e.next;
      }
      Hl = false;
    }
    nn = 0, Le = ve = ee = null, ja = false, xu = Ll = 0, qa = null;
  }
  function et() {
    var e = { memoizedState: null, baseState: null, baseQueue: null, queue: null, next: null };
    return Le === null ? ee.memoizedState = Le = e : Le = Le.next = e, Le;
  }
  function Ne() {
    if (ve === null) {
      var e = ee.alternate;
      e = e !== null ? e.memoizedState : null;
    } else e = ve.next;
    var t = Le === null ? ee.memoizedState : Le.next;
    if (t !== null) Le = t, ve = e;
    else {
      if (e === null) throw ee.alternate === null ? Error(a(467)) : Error(a(310));
      ve = e, e = { memoizedState: ve.memoizedState, baseState: ve.baseState, baseQueue: ve.baseQueue, queue: ve.queue, next: null }, Le === null ? ee.memoizedState = Le = e : Le = Le.next = e;
    }
    return Le;
  }
  function Gl() {
    return { lastEffect: null, events: null, stores: null, memoCache: null };
  }
  function Au(e) {
    var t = xu;
    return xu += 1, qa === null && (qa = []), e = Y_(qa, e, t), t = ee, (Le === null ? t.memoizedState : Le.next) === null && (t = t.alternate, C.H = t === null || t.memoizedState === null ? Uo : Fi), e;
  }
  function Yl(e) {
    if (e !== null && typeof e == "object") {
      if (typeof e.then == "function") return Au(e);
      if (e.$$typeof === Ve) return We(e);
    }
    throw Error(a(438, String(e)));
  }
  function Gi(e) {
    var t = null, u = ee.updateQueue;
    if (u !== null && (t = u.memoCache), t == null) {
      var l = ee.alternate;
      l !== null && (l = l.updateQueue, l !== null && (l = l.memoCache, l != null && (t = { data: l.data.map(function(r) {
        return r.slice();
      }), index: 0 })));
    }
    if (t == null && (t = { data: [], index: 0 }), u === null && (u = Gl(), ee.updateQueue = u), u.memoCache = t, u = t.data[t.index], u === void 0) for (u = t.data[t.index] = Array(e), l = 0; l < e; l++) u[l] = sa;
    return t.index++, u;
  }
  function an(e, t) {
    return typeof t == "function" ? t(e) : t;
  }
  function Vl(e) {
    var t = Ne();
    return Yi(t, ve, e);
  }
  function Yi(e, t, u) {
    var l = e.queue;
    if (l === null) throw Error(a(311));
    l.lastRenderedReducer = u;
    var r = e.baseQueue, f = l.pending;
    if (f !== null) {
      if (r !== null) {
        var b = r.next;
        r.next = f.next, f.next = b;
      }
      t.baseQueue = r = f, l.pending = null;
    }
    if (f = e.baseState, r === null) e.memoizedState = f;
    else {
      t = r.next;
      var g = b = null, w = null, T = t, M = false;
      do {
        var N = T.lane & -536870913;
        if (N !== T.lane ? (re & N) === N : (nn & N) === N) {
          var z = T.revertLane;
          if (z === 0) w !== null && (w = w.next = { lane: 0, revertLane: 0, gesture: null, action: T.action, hasEagerState: T.hasEagerState, eagerState: T.eagerState, next: null }), N === Ca && (M = true);
          else if ((nn & z) === z) {
            T = T.next, z === Ca && (M = true);
            continue;
          } else N = { lane: 0, revertLane: T.revertLane, gesture: null, action: T.action, hasEagerState: T.hasEagerState, eagerState: T.eagerState, next: null }, w === null ? (g = w = N, b = f) : w = w.next = N, ee.lanes |= z, Dn |= z;
          N = T.action, la && u(f, N), f = T.hasEagerState ? T.eagerState : u(f, N);
        } else z = { lane: N, revertLane: T.revertLane, gesture: T.gesture, action: T.action, hasEagerState: T.hasEagerState, eagerState: T.eagerState, next: null }, w === null ? (g = w = z, b = f) : w = w.next = z, ee.lanes |= N, Dn |= N;
        T = T.next;
      } while (T !== null && T !== t);
      if (w === null ? b = f : w.next = g, !gt(f, e.memoizedState) && (Ge = true, M && (u = Ra, u !== null))) throw u;
      e.memoizedState = f, e.baseState = b, e.baseQueue = w, l.lastRenderedState = f;
    }
    return r === null && (l.lanes = 0), [e.memoizedState, l.dispatch];
  }
  function Vi(e) {
    var t = Ne(), u = t.queue;
    if (u === null) throw Error(a(311));
    u.lastRenderedReducer = e;
    var l = u.dispatch, r = u.pending, f = t.memoizedState;
    if (r !== null) {
      u.pending = null;
      var b = r = r.next;
      do
        f = e(f, b.action), b = b.next;
      while (b !== r);
      gt(f, t.memoizedState) || (Ge = true), t.memoizedState = f, t.baseQueue === null && (t.baseState = f), u.lastRenderedState = f;
    }
    return [f, l];
  }
  function $_(e, t, u) {
    var l = ee, r = Ne(), f = be;
    if (f) {
      if (u === void 0) throw Error(a(407));
      u = u();
    } else u = t();
    var b = !gt((ve || r).memoizedState, u);
    if (b && (r.memoizedState = u, Ge = true), r = r.queue, Zi(to.bind(null, l, r, e), [e]), r.getSnapshot !== t || b || Le !== null && Le.memoizedState.tag & 1) {
      if (l.flags |= 2048, Ha(9, { destroy: void 0 }, eo.bind(null, l, r, u, t), null), Ee === null) throw Error(a(349));
      f || (nn & 127) !== 0 || P_(l, t, u);
    }
    return u;
  }
  function P_(e, t, u) {
    e.flags |= 16384, e = { getSnapshot: t, value: u }, t = ee.updateQueue, t === null ? (t = Gl(), ee.updateQueue = t, t.stores = [e]) : (u = t.stores, u === null ? t.stores = [e] : u.push(e));
  }
  function eo(e, t, u, l) {
    t.value = u, t.getSnapshot = l, no(t) && ao(e);
  }
  function to(e, t, u) {
    return u(function() {
      no(t) && ao(e);
    });
  }
  function no(e) {
    var t = e.getSnapshot;
    e = e.value;
    try {
      var u = t();
      return !gt(e, u);
    } catch {
      return true;
    }
  }
  function ao(e) {
    var t = In(e, 2);
    t !== null && _t(t, e, 2);
  }
  function Xi(e) {
    var t = et();
    if (typeof e == "function") {
      var u = e;
      if (e = u(), la) {
        gn(true);
        try {
          u();
        } finally {
          gn(false);
        }
      }
    }
    return t.memoizedState = t.baseState = e, t.queue = { pending: null, lanes: 0, dispatch: null, lastRenderedReducer: an, lastRenderedState: e }, t;
  }
  function uo(e, t, u, l) {
    return e.baseState = u, Yi(e, ve, typeof l == "function" ? l : an);
  }
  function N0(e, t, u, l, r) {
    if (Zl(e)) throw Error(a(485));
    if (e = t.action, e !== null) {
      var f = { payload: r, action: e, next: null, isTransition: true, status: "pending", value: null, reason: null, listeners: [], then: function(b) {
        f.listeners.push(b);
      } };
      C.T !== null ? u(true) : f.isTransition = false, l(f), u = t.pending, u === null ? (f.next = t.pending = f, lo(t, f)) : (f.next = u.next, t.pending = u.next = f);
    }
  }
  function lo(e, t) {
    var u = t.action, l = t.payload, r = e.state;
    if (t.isTransition) {
      var f = C.T, b = {};
      C.T = b;
      try {
        var g = u(r, l), w = C.S;
        w !== null && w(b, g), co(e, t, g);
      } catch (T) {
        Qi(e, t, T);
      } finally {
        f !== null && b.types !== null && (f.types = b.types), C.T = f;
      }
    } else try {
      f = u(r, l), co(e, t, f);
    } catch (T) {
      Qi(e, t, T);
    }
  }
  function co(e, t, u) {
    u !== null && typeof u == "object" && typeof u.then == "function" ? u.then(function(l) {
      io(e, t, l);
    }, function(l) {
      return Qi(e, t, l);
    }) : io(e, t, u);
  }
  function io(e, t, u) {
    t.status = "fulfilled", t.value = u, ro(t), e.state = u, t = e.pending, t !== null && (u = t.next, u === t ? e.pending = null : (u = u.next, t.next = u, lo(e, u)));
  }
  function Qi(e, t, u) {
    var l = e.pending;
    if (e.pending = null, l !== null) {
      l = l.next;
      do
        t.status = "rejected", t.reason = u, ro(t), t = t.next;
      while (t !== l);
    }
    e.action = null;
  }
  function ro(e) {
    e = e.listeners;
    for (var t = 0; t < e.length; t++) (0, e[t])();
  }
  function fo(e, t) {
    return t;
  }
  function _o(e, t) {
    if (be) {
      var u = Ee.formState;
      if (u !== null) {
        e: {
          var l = ee;
          if (be) {
            if (Te) {
              t: {
                for (var r = Te, f = Dt; r.nodeType !== 8; ) {
                  if (!f) {
                    r = null;
                    break t;
                  }
                  if (r = Ct(r.nextSibling), r === null) {
                    r = null;
                    break t;
                  }
                }
                f = r.data, r = f === "F!" || f === "F" ? r : null;
              }
              if (r) {
                Te = Ct(r.nextSibling), l = r.data === "F!";
                break e;
              }
            }
            pn(l);
          }
          l = false;
        }
        l && (t = u[0]);
      }
    }
    return u = et(), u.memoizedState = u.baseState = t, l = { pending: null, lanes: 0, dispatch: null, lastRenderedReducer: fo, lastRenderedState: t }, u.queue = l, u = Mo.bind(null, ee, l), l.dispatch = u, l = Xi(false), f = Ii.bind(null, ee, false, l.queue), l = et(), r = { state: t, dispatch: null, action: e, pending: null }, l.queue = r, u = N0.bind(null, ee, r, f, u), r.dispatch = u, l.memoizedState = e, [t, u, false];
  }
  function oo(e) {
    var t = Ne();
    return so(t, ve, e);
  }
  function so(e, t, u) {
    if (t = Yi(e, t, fo)[0], e = Vl(an)[0], typeof t == "object" && t !== null && typeof t.then == "function") try {
      var l = Au(t);
    } catch (b) {
      throw b === Ua ? Rl : b;
    }
    else l = t;
    t = Ne();
    var r = t.queue, f = r.dispatch;
    return u !== t.memoizedState && (ee.flags |= 2048, Ha(9, { destroy: void 0 }, j0.bind(null, r, u), null)), [l, f, e];
  }
  function j0(e, t) {
    e.action = t;
  }
  function bo(e) {
    var t = Ne(), u = ve;
    if (u !== null) return so(t, u, e);
    Ne(), t = t.memoizedState, u = Ne();
    var l = u.queue.dispatch;
    return u.memoizedState = e, [t, l, false];
  }
  function Ha(e, t, u, l) {
    return e = { tag: e, create: u, deps: l, inst: t, next: null }, t = ee.updateQueue, t === null && (t = Gl(), ee.updateQueue = t), u = t.lastEffect, u === null ? t.lastEffect = e.next = e : (l = u.next, u.next = e, e.next = l, t.lastEffect = e), e;
  }
  function go() {
    return Ne().memoizedState;
  }
  function Xl(e, t, u, l) {
    var r = et();
    ee.flags |= e, r.memoizedState = Ha(1 | t, { destroy: void 0 }, u, l === void 0 ? null : l);
  }
  function Ql(e, t, u, l) {
    var r = Ne();
    l = l === void 0 ? null : l;
    var f = r.memoizedState.inst;
    ve !== null && l !== null && Ni(l, ve.memoizedState.deps) ? r.memoizedState = Ha(t, f, u, l) : (ee.flags |= e, r.memoizedState = Ha(1 | t, f, u, l));
  }
  function mo(e, t) {
    Xl(8390656, 8, e, t);
  }
  function Zi(e, t) {
    Ql(2048, 8, e, t);
  }
  function q0(e) {
    ee.flags |= 4;
    var t = ee.updateQueue;
    if (t === null) t = Gl(), ee.updateQueue = t, t.events = [e];
    else {
      var u = t.events;
      u === null ? t.events = [e] : u.push(e);
    }
  }
  function wo(e) {
    var t = Ne().memoizedState;
    return q0({ ref: t, nextImpl: e }), function() {
      if ((me & 2) !== 0) throw Error(a(440));
      return t.impl.apply(void 0, arguments);
    };
  }
  function yo(e, t) {
    return Ql(4, 2, e, t);
  }
  function ho(e, t) {
    return Ql(4, 4, e, t);
  }
  function po(e, t) {
    if (typeof t == "function") {
      e = e();
      var u = t(e);
      return function() {
        typeof u == "function" ? u() : t(null);
      };
    }
    if (t != null) return e = e(), t.current = e, function() {
      t.current = null;
    };
  }
  function vo(e, t, u) {
    u = u != null ? u.concat([e]) : null, Ql(4, 4, po.bind(null, t, e), u);
  }
  function Ki() {
  }
  function So(e, t) {
    var u = Ne();
    t = t === void 0 ? null : t;
    var l = u.memoizedState;
    return t !== null && Ni(t, l[1]) ? l[0] : (u.memoizedState = [e, t], e);
  }
  function xo(e, t) {
    var u = Ne();
    t = t === void 0 ? null : t;
    var l = u.memoizedState;
    if (t !== null && Ni(t, l[1])) return l[0];
    if (l = e(), la) {
      gn(true);
      try {
        e();
      } finally {
        gn(false);
      }
    }
    return u.memoizedState = [l, t], l;
  }
  function Ji(e, t, u) {
    return u === void 0 || (nn & 1073741824) !== 0 && (re & 261930) === 0 ? e.memoizedState = t : (e.memoizedState = u, e = As(), ee.lanes |= e, Dn |= e, u);
  }
  function Ao(e, t, u, l) {
    return gt(u, t) ? u : Na.current !== null ? (e = Ji(e, u, l), gt(e, t) || (Ge = true), e) : (nn & 42) === 0 || (nn & 1073741824) !== 0 && (re & 261930) === 0 ? (Ge = true, e.memoizedState = u) : (e = As(), ee.lanes |= e, Dn |= e, t);
  }
  function Eo(e, t, u, l, r) {
    var f = G.p;
    G.p = f !== 0 && 8 > f ? f : 8;
    var b = C.T, g = {};
    C.T = g, Ii(e, false, t, u);
    try {
      var w = r(), T = C.S;
      if (T !== null && T(g, w), w !== null && typeof w == "object" && typeof w.then == "function") {
        var M = R0(w, l);
        Eu(e, t, M, vt(e));
      } else Eu(e, t, l, vt(e));
    } catch (N) {
      Eu(e, t, { then: function() {
      }, status: "rejected", reason: N }, vt());
    } finally {
      G.p = f, b !== null && g.types !== null && (b.types = g.types), C.T = b;
    }
  }
  function H0() {
  }
  function ki(e, t, u, l) {
    if (e.tag !== 5) throw Error(a(476));
    var r = To(e).queue;
    Eo(e, r, t, I, u === null ? H0 : function() {
      return zo(e), u(l);
    });
  }
  function To(e) {
    var t = e.memoizedState;
    if (t !== null) return t;
    t = { memoizedState: I, baseState: I, baseQueue: null, queue: { pending: null, lanes: 0, dispatch: null, lastRenderedReducer: an, lastRenderedState: I }, next: null };
    var u = {};
    return t.next = { memoizedState: u, baseState: u, baseQueue: null, queue: { pending: null, lanes: 0, dispatch: null, lastRenderedReducer: an, lastRenderedState: u }, next: null }, e.memoizedState = t, e = e.alternate, e !== null && (e.memoizedState = t), t;
  }
  function zo(e) {
    var t = To(e);
    t.next === null && (t = e.alternate.memoizedState), Eu(e, t.next.queue, {}, vt());
  }
  function Wi() {
    return We(Vu);
  }
  function Oo() {
    return Ne().memoizedState;
  }
  function Do() {
    return Ne().memoizedState;
  }
  function L0(e) {
    for (var t = e.return; t !== null; ) {
      switch (t.tag) {
        case 24:
        case 3:
          var u = vt();
          e = xn(u);
          var l = An(t, e, u);
          l !== null && (_t(l, t, u), pu(l, t, u)), t = { cache: Ai() }, e.payload = t;
          return;
      }
      t = t.return;
    }
  }
  function G0(e, t, u) {
    var l = vt();
    u = { lane: l, revertLane: 0, gesture: null, action: u, hasEagerState: false, eagerState: null, next: null }, Zl(e) ? Co(t, u) : (u = bi(e, t, u, l), u !== null && (_t(u, e, l), Ro(u, t, l)));
  }
  function Mo(e, t, u) {
    var l = vt();
    Eu(e, t, u, l);
  }
  function Eu(e, t, u, l) {
    var r = { lane: l, revertLane: 0, gesture: null, action: u, hasEagerState: false, eagerState: null, next: null };
    if (Zl(e)) Co(t, r);
    else {
      var f = e.alternate;
      if (e.lanes === 0 && (f === null || f.lanes === 0) && (f = t.lastRenderedReducer, f !== null)) try {
        var b = t.lastRenderedState, g = f(b, u);
        if (r.hasEagerState = true, r.eagerState = g, gt(g, b)) return El(e, t, r, 0), Ee === null && Al(), false;
      } catch {
      } finally {
      }
      if (u = bi(e, t, r, l), u !== null) return _t(u, e, l), Ro(u, t, l), true;
    }
    return false;
  }
  function Ii(e, t, u, l) {
    if (l = { lane: 2, revertLane: Or(), gesture: null, action: l, hasEagerState: false, eagerState: null, next: null }, Zl(e)) {
      if (t) throw Error(a(479));
    } else t = bi(e, u, l, 2), t !== null && _t(t, e, 2);
  }
  function Zl(e) {
    var t = e.alternate;
    return e === ee || t !== null && t === ee;
  }
  function Co(e, t) {
    ja = Hl = true;
    var u = e.pending;
    u === null ? t.next = t : (t.next = u.next, u.next = t), e.pending = t;
  }
  function Ro(e, t, u) {
    if ((u & 4194048) !== 0) {
      var l = t.lanes;
      l &= e.pendingLanes, u |= l, t.lanes = u, jf(e, u);
    }
  }
  var Tu = { readContext: We, use: Yl, useCallback: Ce, useContext: Ce, useEffect: Ce, useImperativeHandle: Ce, useLayoutEffect: Ce, useInsertionEffect: Ce, useMemo: Ce, useReducer: Ce, useRef: Ce, useState: Ce, useDebugValue: Ce, useDeferredValue: Ce, useTransition: Ce, useSyncExternalStore: Ce, useId: Ce, useHostTransitionStatus: Ce, useFormState: Ce, useActionState: Ce, useOptimistic: Ce, useMemoCache: Ce, useCacheRefresh: Ce };
  Tu.useEffectEvent = Ce;
  var Uo = { readContext: We, use: Yl, useCallback: function(e, t) {
    return et().memoizedState = [e, t === void 0 ? null : t], e;
  }, useContext: We, useEffect: mo, useImperativeHandle: function(e, t, u) {
    u = u != null ? u.concat([e]) : null, Xl(4194308, 4, po.bind(null, t, e), u);
  }, useLayoutEffect: function(e, t) {
    return Xl(4194308, 4, e, t);
  }, useInsertionEffect: function(e, t) {
    Xl(4, 2, e, t);
  }, useMemo: function(e, t) {
    var u = et();
    t = t === void 0 ? null : t;
    var l = e();
    if (la) {
      gn(true);
      try {
        e();
      } finally {
        gn(false);
      }
    }
    return u.memoizedState = [l, t], l;
  }, useReducer: function(e, t, u) {
    var l = et();
    if (u !== void 0) {
      var r = u(t);
      if (la) {
        gn(true);
        try {
          u(t);
        } finally {
          gn(false);
        }
      }
    } else r = t;
    return l.memoizedState = l.baseState = r, e = { pending: null, lanes: 0, dispatch: null, lastRenderedReducer: e, lastRenderedState: r }, l.queue = e, e = e.dispatch = G0.bind(null, ee, e), [l.memoizedState, e];
  }, useRef: function(e) {
    var t = et();
    return e = { current: e }, t.memoizedState = e;
  }, useState: function(e) {
    e = Xi(e);
    var t = e.queue, u = Mo.bind(null, ee, t);
    return t.dispatch = u, [e.memoizedState, u];
  }, useDebugValue: Ki, useDeferredValue: function(e, t) {
    var u = et();
    return Ji(u, e, t);
  }, useTransition: function() {
    var e = Xi(false);
    return e = Eo.bind(null, ee, e.queue, true, false), et().memoizedState = e, [false, e];
  }, useSyncExternalStore: function(e, t, u) {
    var l = ee, r = et();
    if (be) {
      if (u === void 0) throw Error(a(407));
      u = u();
    } else {
      if (u = t(), Ee === null) throw Error(a(349));
      (re & 127) !== 0 || P_(l, t, u);
    }
    r.memoizedState = u;
    var f = { value: u, getSnapshot: t };
    return r.queue = f, mo(to.bind(null, l, f, e), [e]), l.flags |= 2048, Ha(9, { destroy: void 0 }, eo.bind(null, l, f, u, t), null), u;
  }, useId: function() {
    var e = et(), t = Ee.identifierPrefix;
    if (be) {
      var u = Zt, l = Qt;
      u = (l & ~(1 << 32 - dt(l) - 1)).toString(32) + u, t = "_" + t + "R_" + u, u = Ll++, 0 < u && (t += "H" + u.toString(32)), t += "_";
    } else u = U0++, t = "_" + t + "r_" + u.toString(32) + "_";
    return e.memoizedState = t;
  }, useHostTransitionStatus: Wi, useFormState: _o, useActionState: _o, useOptimistic: function(e) {
    var t = et();
    t.memoizedState = t.baseState = e;
    var u = { pending: null, lanes: 0, dispatch: null, lastRenderedReducer: null, lastRenderedState: null };
    return t.queue = u, t = Ii.bind(null, ee, true, u), u.dispatch = t, [e, t];
  }, useMemoCache: Gi, useCacheRefresh: function() {
    return et().memoizedState = L0.bind(null, ee);
  }, useEffectEvent: function(e) {
    var t = et(), u = { impl: e };
    return t.memoizedState = u, function() {
      if ((me & 2) !== 0) throw Error(a(440));
      return u.impl.apply(void 0, arguments);
    };
  } }, Fi = { readContext: We, use: Yl, useCallback: So, useContext: We, useEffect: Zi, useImperativeHandle: vo, useInsertionEffect: yo, useLayoutEffect: ho, useMemo: xo, useReducer: Vl, useRef: go, useState: function() {
    return Vl(an);
  }, useDebugValue: Ki, useDeferredValue: function(e, t) {
    var u = Ne();
    return Ao(u, ve.memoizedState, e, t);
  }, useTransition: function() {
    var e = Vl(an)[0], t = Ne().memoizedState;
    return [typeof e == "boolean" ? e : Au(e), t];
  }, useSyncExternalStore: $_, useId: Oo, useHostTransitionStatus: Wi, useFormState: oo, useActionState: oo, useOptimistic: function(e, t) {
    var u = Ne();
    return uo(u, ve, e, t);
  }, useMemoCache: Gi, useCacheRefresh: Do };
  Fi.useEffectEvent = wo;
  var Bo = { readContext: We, use: Yl, useCallback: So, useContext: We, useEffect: Zi, useImperativeHandle: vo, useInsertionEffect: yo, useLayoutEffect: ho, useMemo: xo, useReducer: Vi, useRef: go, useState: function() {
    return Vi(an);
  }, useDebugValue: Ki, useDeferredValue: function(e, t) {
    var u = Ne();
    return ve === null ? Ji(u, e, t) : Ao(u, ve.memoizedState, e, t);
  }, useTransition: function() {
    var e = Vi(an)[0], t = Ne().memoizedState;
    return [typeof e == "boolean" ? e : Au(e), t];
  }, useSyncExternalStore: $_, useId: Oo, useHostTransitionStatus: Wi, useFormState: bo, useActionState: bo, useOptimistic: function(e, t) {
    var u = Ne();
    return ve !== null ? uo(u, ve, e, t) : (u.baseState = e, [e, u.queue.dispatch]);
  }, useMemoCache: Gi, useCacheRefresh: Do };
  Bo.useEffectEvent = wo;
  function $i(e, t, u, l) {
    t = e.memoizedState, u = u(l, t), u = u == null ? t : R({}, t, u), e.memoizedState = u, e.lanes === 0 && (e.updateQueue.baseState = u);
  }
  var Pi = { enqueueSetState: function(e, t, u) {
    e = e._reactInternals;
    var l = vt(), r = xn(l);
    r.payload = t, u != null && (r.callback = u), t = An(e, r, l), t !== null && (_t(t, e, l), pu(t, e, l));
  }, enqueueReplaceState: function(e, t, u) {
    e = e._reactInternals;
    var l = vt(), r = xn(l);
    r.tag = 1, r.payload = t, u != null && (r.callback = u), t = An(e, r, l), t !== null && (_t(t, e, l), pu(t, e, l));
  }, enqueueForceUpdate: function(e, t) {
    e = e._reactInternals;
    var u = vt(), l = xn(u);
    l.tag = 2, t != null && (l.callback = t), t = An(e, l, u), t !== null && (_t(t, e, u), pu(t, e, u));
  } };
  function No(e, t, u, l, r, f, b) {
    return e = e.stateNode, typeof e.shouldComponentUpdate == "function" ? e.shouldComponentUpdate(l, f, b) : t.prototype && t.prototype.isPureReactComponent ? !su(u, l) || !su(r, f) : true;
  }
  function jo(e, t, u, l) {
    e = t.state, typeof t.componentWillReceiveProps == "function" && t.componentWillReceiveProps(u, l), typeof t.UNSAFE_componentWillReceiveProps == "function" && t.UNSAFE_componentWillReceiveProps(u, l), t.state !== e && Pi.enqueueReplaceState(t, t.state, null);
  }
  function ca(e, t) {
    var u = t;
    if ("ref" in t) {
      u = {};
      for (var l in t) l !== "ref" && (u[l] = t[l]);
    }
    if (e = e.defaultProps) {
      u === t && (u = R({}, u));
      for (var r in e) u[r] === void 0 && (u[r] = e[r]);
    }
    return u;
  }
  function qo(e) {
    xl(e);
  }
  function Ho(e) {
    console.error(e);
  }
  function Lo(e) {
    xl(e);
  }
  function Kl(e, t) {
    try {
      var u = e.onUncaughtError;
      u(t.value, { componentStack: t.stack });
    } catch (l) {
      setTimeout(function() {
        throw l;
      });
    }
  }
  function Go(e, t, u) {
    try {
      var l = e.onCaughtError;
      l(u.value, { componentStack: u.stack, errorBoundary: t.tag === 1 ? t.stateNode : null });
    } catch (r) {
      setTimeout(function() {
        throw r;
      });
    }
  }
  function er(e, t, u) {
    return u = xn(u), u.tag = 3, u.payload = { element: null }, u.callback = function() {
      Kl(e, t);
    }, u;
  }
  function Yo(e) {
    return e = xn(e), e.tag = 3, e;
  }
  function Vo(e, t, u, l) {
    var r = u.type.getDerivedStateFromError;
    if (typeof r == "function") {
      var f = l.value;
      e.payload = function() {
        return r(f);
      }, e.callback = function() {
        Go(t, u, l);
      };
    }
    var b = u.stateNode;
    b !== null && typeof b.componentDidCatch == "function" && (e.callback = function() {
      Go(t, u, l), typeof r != "function" && (Mn === null ? Mn = /* @__PURE__ */ new Set([this]) : Mn.add(this));
      var g = l.stack;
      this.componentDidCatch(l.value, { componentStack: g !== null ? g : "" });
    });
  }
  function Y0(e, t, u, l, r) {
    if (u.flags |= 32768, l !== null && typeof l == "object" && typeof l.then == "function") {
      if (t = u.alternate, t !== null && Ma(t, u, r, true), u = wt.current, u !== null) {
        switch (u.tag) {
          case 31:
          case 13:
            return Mt === null ? uc() : u.alternate === null && Re === 0 && (Re = 3), u.flags &= -257, u.flags |= 65536, u.lanes = r, l === Ul ? u.flags |= 16384 : (t = u.updateQueue, t === null ? u.updateQueue = /* @__PURE__ */ new Set([l]) : t.add(l), Er(e, l, r)), false;
          case 22:
            return u.flags |= 65536, l === Ul ? u.flags |= 16384 : (t = u.updateQueue, t === null ? (t = { transitions: null, markerInstances: null, retryQueue: /* @__PURE__ */ new Set([l]) }, u.updateQueue = t) : (u = t.retryQueue, u === null ? t.retryQueue = /* @__PURE__ */ new Set([l]) : u.add(l)), Er(e, l, r)), false;
        }
        throw Error(a(435, u.tag));
      }
      return Er(e, l, r), uc(), false;
    }
    if (be) return t = wt.current, t !== null ? ((t.flags & 65536) === 0 && (t.flags |= 256), t.flags |= 65536, t.lanes = r, l !== hi && (e = Error(a(422), { cause: l }), gu(Tt(e, u)))) : (l !== hi && (t = Error(a(423), { cause: l }), gu(Tt(t, u))), e = e.current.alternate, e.flags |= 65536, r &= -r, e.lanes |= r, l = Tt(l, u), r = er(e.stateNode, l, r), Mi(e, r), Re !== 4 && (Re = 2)), false;
    var f = Error(a(520), { cause: l });
    if (f = Tt(f, u), Bu === null ? Bu = [f] : Bu.push(f), Re !== 4 && (Re = 2), t === null) return true;
    l = Tt(l, u), u = t;
    do {
      switch (u.tag) {
        case 3:
          return u.flags |= 65536, e = r & -r, u.lanes |= e, e = er(u.stateNode, l, e), Mi(u, e), false;
        case 1:
          if (t = u.type, f = u.stateNode, (u.flags & 128) === 0 && (typeof t.getDerivedStateFromError == "function" || f !== null && typeof f.componentDidCatch == "function" && (Mn === null || !Mn.has(f)))) return u.flags |= 65536, r &= -r, u.lanes |= r, r = Yo(r), Vo(r, e, u, l), Mi(u, r), false;
      }
      u = u.return;
    } while (u !== null);
    return false;
  }
  var tr = Error(a(461)), Ge = false;
  function Ie(e, t, u, l) {
    t.child = e === null ? Z_(t, null, u, l) : ua(t, e.child, u, l);
  }
  function Xo(e, t, u, l, r) {
    u = u.render;
    var f = t.ref;
    if ("ref" in l) {
      var b = {};
      for (var g in l) g !== "ref" && (b[g] = l[g]);
    } else b = l;
    return ea(t), l = ji(e, t, u, b, f, r), g = qi(), e !== null && !Ge ? (Hi(e, t, r), un(e, t, r)) : (be && g && wi(t), t.flags |= 1, Ie(e, t, l, r), t.child);
  }
  function Qo(e, t, u, l, r) {
    if (e === null) {
      var f = u.type;
      return typeof f == "function" && !di(f) && f.defaultProps === void 0 && u.compare === null ? (t.tag = 15, t.type = f, Zo(e, t, f, l, r)) : (e = zl(u.type, null, l, t, t.mode, r), e.ref = t.ref, e.return = t, t.child = e);
    }
    if (f = e.child, !fr(e, r)) {
      var b = f.memoizedProps;
      if (u = u.compare, u = u !== null ? u : su, u(b, l) && e.ref === t.ref) return un(e, t, r);
    }
    return t.flags |= 1, e = $t(f, l), e.ref = t.ref, e.return = t, t.child = e;
  }
  function Zo(e, t, u, l, r) {
    if (e !== null) {
      var f = e.memoizedProps;
      if (su(f, l) && e.ref === t.ref) if (Ge = false, t.pendingProps = l = f, fr(e, r)) (e.flags & 131072) !== 0 && (Ge = true);
      else return t.lanes = e.lanes, un(e, t, r);
    }
    return nr(e, t, u, l, r);
  }
  function Ko(e, t, u, l) {
    var r = l.children, f = e !== null ? e.memoizedState : null;
    if (e === null && t.stateNode === null && (t.stateNode = { _visibility: 1, _pendingMarkers: null, _retryCache: null, _transitions: null }), l.mode === "hidden") {
      if ((t.flags & 128) !== 0) {
        if (f = f !== null ? f.baseLanes | u : u, e !== null) {
          for (l = t.child = e.child, r = 0; l !== null; ) r = r | l.lanes | l.childLanes, l = l.sibling;
          l = r & ~f;
        } else l = 0, t.child = null;
        return Jo(e, t, f, u, l);
      }
      if ((u & 536870912) !== 0) t.memoizedState = { baseLanes: 0, cachePool: null }, e !== null && Cl(t, f !== null ? f.cachePool : null), f !== null ? k_(t, f) : Ri(), W_(t);
      else return l = t.lanes = 536870912, Jo(e, t, f !== null ? f.baseLanes | u : u, u, l);
    } else f !== null ? (Cl(t, f.cachePool), k_(t, f), Tn(), t.memoizedState = null) : (e !== null && Cl(t, null), Ri(), Tn());
    return Ie(e, t, r, u), t.child;
  }
  function zu(e, t) {
    return e !== null && e.tag === 22 || t.stateNode !== null || (t.stateNode = { _visibility: 1, _pendingMarkers: null, _retryCache: null, _transitions: null }), t.sibling;
  }
  function Jo(e, t, u, l, r) {
    var f = Ti();
    return f = f === null ? null : { parent: He._currentValue, pool: f }, t.memoizedState = { baseLanes: u, cachePool: f }, e !== null && Cl(t, null), Ri(), W_(t), e !== null && Ma(e, t, l, true), t.childLanes = r, null;
  }
  function Jl(e, t) {
    return t = Wl({ mode: t.mode, children: t.children }, e.mode), t.ref = e.ref, e.child = t, t.return = e, t;
  }
  function ko(e, t, u) {
    return ua(t, e.child, null, u), e = Jl(t, t.pendingProps), e.flags |= 2, yt(t), t.memoizedState = null, e;
  }
  function V0(e, t, u) {
    var l = t.pendingProps, r = (t.flags & 128) !== 0;
    if (t.flags &= -129, e === null) {
      if (be) {
        if (l.mode === "hidden") return e = Jl(t, l), t.lanes = 536870912, zu(null, e);
        if (Bi(t), (e = Te) ? (e = cb(e, Dt), e = e !== null && e.data === "&" ? e : null, e !== null && (t.memoizedState = { dehydrated: e, treeContext: yn !== null ? { id: Qt, overflow: Zt } : null, retryLane: 536870912, hydrationErrors: null }, u = M_(e), u.return = t, t.child = u, ke = t, Te = null)) : e = null, e === null) throw pn(t);
        return t.lanes = 536870912, null;
      }
      return Jl(t, l);
    }
    var f = e.memoizedState;
    if (f !== null) {
      var b = f.dehydrated;
      if (Bi(t), r) if (t.flags & 256) t.flags &= -257, t = ko(e, t, u);
      else if (t.memoizedState !== null) t.child = e.child, t.flags |= 128, t = null;
      else throw Error(a(558));
      else if (Ge || Ma(e, t, u, false), r = (u & e.childLanes) !== 0, Ge || r) {
        if (l = Ee, l !== null && (b = qf(l, u), b !== 0 && b !== f.retryLane)) throw f.retryLane = b, In(e, b), _t(l, e, b), tr;
        uc(), t = ko(e, t, u);
      } else e = f.treeContext, Te = Ct(b.nextSibling), ke = t, be = true, hn = null, Dt = false, e !== null && U_(t, e), t = Jl(t, l), t.flags |= 4096;
      return t;
    }
    return e = $t(e.child, { mode: l.mode, children: l.children }), e.ref = t.ref, t.child = e, e.return = t, e;
  }
  function kl(e, t) {
    var u = t.ref;
    if (u === null) e !== null && e.ref !== null && (t.flags |= 4194816);
    else {
      if (typeof u != "function" && typeof u != "object") throw Error(a(284));
      (e === null || e.ref !== u) && (t.flags |= 4194816);
    }
  }
  function nr(e, t, u, l, r) {
    return ea(t), u = ji(e, t, u, l, void 0, r), l = qi(), e !== null && !Ge ? (Hi(e, t, r), un(e, t, r)) : (be && l && wi(t), t.flags |= 1, Ie(e, t, u, r), t.child);
  }
  function Wo(e, t, u, l, r, f) {
    return ea(t), t.updateQueue = null, u = F_(t, l, u, r), I_(e), l = qi(), e !== null && !Ge ? (Hi(e, t, f), un(e, t, f)) : (be && l && wi(t), t.flags |= 1, Ie(e, t, u, f), t.child);
  }
  function Io(e, t, u, l, r) {
    if (ea(t), t.stateNode === null) {
      var f = Ta, b = u.contextType;
      typeof b == "object" && b !== null && (f = We(b)), f = new u(l, f), t.memoizedState = f.state !== null && f.state !== void 0 ? f.state : null, f.updater = Pi, t.stateNode = f, f._reactInternals = t, f = t.stateNode, f.props = l, f.state = t.memoizedState, f.refs = {}, Oi(t), b = u.contextType, f.context = typeof b == "object" && b !== null ? We(b) : Ta, f.state = t.memoizedState, b = u.getDerivedStateFromProps, typeof b == "function" && ($i(t, u, b, l), f.state = t.memoizedState), typeof u.getDerivedStateFromProps == "function" || typeof f.getSnapshotBeforeUpdate == "function" || typeof f.UNSAFE_componentWillMount != "function" && typeof f.componentWillMount != "function" || (b = f.state, typeof f.componentWillMount == "function" && f.componentWillMount(), typeof f.UNSAFE_componentWillMount == "function" && f.UNSAFE_componentWillMount(), b !== f.state && Pi.enqueueReplaceState(f, f.state, null), Su(t, l, f, r), vu(), f.state = t.memoizedState), typeof f.componentDidMount == "function" && (t.flags |= 4194308), l = true;
    } else if (e === null) {
      f = t.stateNode;
      var g = t.memoizedProps, w = ca(u, g);
      f.props = w;
      var T = f.context, M = u.contextType;
      b = Ta, typeof M == "object" && M !== null && (b = We(M));
      var N = u.getDerivedStateFromProps;
      M = typeof N == "function" || typeof f.getSnapshotBeforeUpdate == "function", g = t.pendingProps !== g, M || typeof f.UNSAFE_componentWillReceiveProps != "function" && typeof f.componentWillReceiveProps != "function" || (g || T !== b) && jo(t, f, l, b), Sn = false;
      var z = t.memoizedState;
      f.state = z, Su(t, l, f, r), vu(), T = t.memoizedState, g || z !== T || Sn ? (typeof N == "function" && ($i(t, u, N, l), T = t.memoizedState), (w = Sn || No(t, u, w, l, z, T, b)) ? (M || typeof f.UNSAFE_componentWillMount != "function" && typeof f.componentWillMount != "function" || (typeof f.componentWillMount == "function" && f.componentWillMount(), typeof f.UNSAFE_componentWillMount == "function" && f.UNSAFE_componentWillMount()), typeof f.componentDidMount == "function" && (t.flags |= 4194308)) : (typeof f.componentDidMount == "function" && (t.flags |= 4194308), t.memoizedProps = l, t.memoizedState = T), f.props = l, f.state = T, f.context = b, l = w) : (typeof f.componentDidMount == "function" && (t.flags |= 4194308), l = false);
    } else {
      f = t.stateNode, Di(e, t), b = t.memoizedProps, M = ca(u, b), f.props = M, N = t.pendingProps, z = f.context, T = u.contextType, w = Ta, typeof T == "object" && T !== null && (w = We(T)), g = u.getDerivedStateFromProps, (T = typeof g == "function" || typeof f.getSnapshotBeforeUpdate == "function") || typeof f.UNSAFE_componentWillReceiveProps != "function" && typeof f.componentWillReceiveProps != "function" || (b !== N || z !== w) && jo(t, f, l, w), Sn = false, z = t.memoizedState, f.state = z, Su(t, l, f, r), vu();
      var D = t.memoizedState;
      b !== N || z !== D || Sn || e !== null && e.dependencies !== null && Dl(e.dependencies) ? (typeof g == "function" && ($i(t, u, g, l), D = t.memoizedState), (M = Sn || No(t, u, M, l, z, D, w) || e !== null && e.dependencies !== null && Dl(e.dependencies)) ? (T || typeof f.UNSAFE_componentWillUpdate != "function" && typeof f.componentWillUpdate != "function" || (typeof f.componentWillUpdate == "function" && f.componentWillUpdate(l, D, w), typeof f.UNSAFE_componentWillUpdate == "function" && f.UNSAFE_componentWillUpdate(l, D, w)), typeof f.componentDidUpdate == "function" && (t.flags |= 4), typeof f.getSnapshotBeforeUpdate == "function" && (t.flags |= 1024)) : (typeof f.componentDidUpdate != "function" || b === e.memoizedProps && z === e.memoizedState || (t.flags |= 4), typeof f.getSnapshotBeforeUpdate != "function" || b === e.memoizedProps && z === e.memoizedState || (t.flags |= 1024), t.memoizedProps = l, t.memoizedState = D), f.props = l, f.state = D, f.context = w, l = M) : (typeof f.componentDidUpdate != "function" || b === e.memoizedProps && z === e.memoizedState || (t.flags |= 4), typeof f.getSnapshotBeforeUpdate != "function" || b === e.memoizedProps && z === e.memoizedState || (t.flags |= 1024), l = false);
    }
    return f = l, kl(e, t), l = (t.flags & 128) !== 0, f || l ? (f = t.stateNode, u = l && typeof u.getDerivedStateFromError != "function" ? null : f.render(), t.flags |= 1, e !== null && l ? (t.child = ua(t, e.child, null, r), t.child = ua(t, null, u, r)) : Ie(e, t, u, r), t.memoizedState = f.state, e = t.child) : e = un(e, t, r), e;
  }
  function Fo(e, t, u, l) {
    return $n(), t.flags |= 256, Ie(e, t, u, l), t.child;
  }
  var ar = { dehydrated: null, treeContext: null, retryLane: 0, hydrationErrors: null };
  function ur(e) {
    return { baseLanes: e, cachePool: L_() };
  }
  function lr(e, t, u) {
    return e = e !== null ? e.childLanes & ~u : 0, t && (e |= pt), e;
  }
  function $o(e, t, u) {
    var l = t.pendingProps, r = false, f = (t.flags & 128) !== 0, b;
    if ((b = f) || (b = e !== null && e.memoizedState === null ? false : (Be.current & 2) !== 0), b && (r = true, t.flags &= -129), b = (t.flags & 32) !== 0, t.flags &= -33, e === null) {
      if (be) {
        if (r ? En(t) : Tn(), (e = Te) ? (e = cb(e, Dt), e = e !== null && e.data !== "&" ? e : null, e !== null && (t.memoizedState = { dehydrated: e, treeContext: yn !== null ? { id: Qt, overflow: Zt } : null, retryLane: 536870912, hydrationErrors: null }, u = M_(e), u.return = t, t.child = u, ke = t, Te = null)) : e = null, e === null) throw pn(t);
        return Yr(e) ? t.lanes = 32 : t.lanes = 536870912, null;
      }
      var g = l.children;
      return l = l.fallback, r ? (Tn(), r = t.mode, g = Wl({ mode: "hidden", children: g }, r), l = Fn(l, r, u, null), g.return = t, l.return = t, g.sibling = l, t.child = g, l = t.child, l.memoizedState = ur(u), l.childLanes = lr(e, b, u), t.memoizedState = ar, zu(null, l)) : (En(t), cr(t, g));
    }
    var w = e.memoizedState;
    if (w !== null && (g = w.dehydrated, g !== null)) {
      if (f) t.flags & 256 ? (En(t), t.flags &= -257, t = ir(e, t, u)) : t.memoizedState !== null ? (Tn(), t.child = e.child, t.flags |= 128, t = null) : (Tn(), g = l.fallback, r = t.mode, l = Wl({ mode: "visible", children: l.children }, r), g = Fn(g, r, u, null), g.flags |= 2, l.return = t, g.return = t, l.sibling = g, t.child = l, ua(t, e.child, null, u), l = t.child, l.memoizedState = ur(u), l.childLanes = lr(e, b, u), t.memoizedState = ar, t = zu(null, l));
      else if (En(t), Yr(g)) {
        if (b = g.nextSibling && g.nextSibling.dataset, b) var T = b.dgst;
        b = T, l = Error(a(419)), l.stack = "", l.digest = b, gu({ value: l, source: null, stack: null }), t = ir(e, t, u);
      } else if (Ge || Ma(e, t, u, false), b = (u & e.childLanes) !== 0, Ge || b) {
        if (b = Ee, b !== null && (l = qf(b, u), l !== 0 && l !== w.retryLane)) throw w.retryLane = l, In(e, l), _t(b, e, l), tr;
        Gr(g) || uc(), t = ir(e, t, u);
      } else Gr(g) ? (t.flags |= 192, t.child = e.child, t = null) : (e = w.treeContext, Te = Ct(g.nextSibling), ke = t, be = true, hn = null, Dt = false, e !== null && U_(t, e), t = cr(t, l.children), t.flags |= 4096);
      return t;
    }
    return r ? (Tn(), g = l.fallback, r = t.mode, w = e.child, T = w.sibling, l = $t(w, { mode: "hidden", children: l.children }), l.subtreeFlags = w.subtreeFlags & 65011712, T !== null ? g = $t(T, g) : (g = Fn(g, r, u, null), g.flags |= 2), g.return = t, l.return = t, l.sibling = g, t.child = l, zu(null, l), l = t.child, g = e.child.memoizedState, g === null ? g = ur(u) : (r = g.cachePool, r !== null ? (w = He._currentValue, r = r.parent !== w ? { parent: w, pool: w } : r) : r = L_(), g = { baseLanes: g.baseLanes | u, cachePool: r }), l.memoizedState = g, l.childLanes = lr(e, b, u), t.memoizedState = ar, zu(e.child, l)) : (En(t), u = e.child, e = u.sibling, u = $t(u, { mode: "visible", children: l.children }), u.return = t, u.sibling = null, e !== null && (b = t.deletions, b === null ? (t.deletions = [e], t.flags |= 16) : b.push(e)), t.child = u, t.memoizedState = null, u);
  }
  function cr(e, t) {
    return t = Wl({ mode: "visible", children: t }, e.mode), t.return = e, e.child = t;
  }
  function Wl(e, t) {
    return e = mt(22, e, null, t), e.lanes = 0, e;
  }
  function ir(e, t, u) {
    return ua(t, e.child, null, u), e = cr(t, t.pendingProps.children), e.flags |= 2, t.memoizedState = null, e;
  }
  function Po(e, t, u) {
    e.lanes |= t;
    var l = e.alternate;
    l !== null && (l.lanes |= t), Si(e.return, t, u);
  }
  function rr(e, t, u, l, r, f) {
    var b = e.memoizedState;
    b === null ? e.memoizedState = { isBackwards: t, rendering: null, renderingStartTime: 0, last: l, tail: u, tailMode: r, treeForkCount: f } : (b.isBackwards = t, b.rendering = null, b.renderingStartTime = 0, b.last = l, b.tail = u, b.tailMode = r, b.treeForkCount = f);
  }
  function es(e, t, u) {
    var l = t.pendingProps, r = l.revealOrder, f = l.tail;
    l = l.children;
    var b = Be.current, g = (b & 2) !== 0;
    if (g ? (b = b & 1 | 2, t.flags |= 128) : b &= 1, Y(Be, b), Ie(e, t, l, u), l = be ? du : 0, !g && e !== null && (e.flags & 128) !== 0) e: for (e = t.child; e !== null; ) {
      if (e.tag === 13) e.memoizedState !== null && Po(e, u, t);
      else if (e.tag === 19) Po(e, u, t);
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
        for (u = t.child, r = null; u !== null; ) e = u.alternate, e !== null && ql(e) === null && (r = u), u = u.sibling;
        u = r, u === null ? (r = t.child, t.child = null) : (r = u.sibling, u.sibling = null), rr(t, false, r, u, f, l);
        break;
      case "backwards":
      case "unstable_legacy-backwards":
        for (u = null, r = t.child, t.child = null; r !== null; ) {
          if (e = r.alternate, e !== null && ql(e) === null) {
            t.child = r;
            break;
          }
          e = r.sibling, r.sibling = u, u = r, r = e;
        }
        rr(t, true, u, null, f, l);
        break;
      case "together":
        rr(t, false, null, null, void 0, l);
        break;
      default:
        t.memoizedState = null;
    }
    return t.child;
  }
  function un(e, t, u) {
    if (e !== null && (t.dependencies = e.dependencies), Dn |= t.lanes, (u & t.childLanes) === 0) if (e !== null) {
      if (Ma(e, t, u, false), (u & t.childLanes) === 0) return null;
    } else return null;
    if (e !== null && t.child !== e.child) throw Error(a(153));
    if (t.child !== null) {
      for (e = t.child, u = $t(e, e.pendingProps), t.child = u, u.return = t; e.sibling !== null; ) e = e.sibling, u = u.sibling = $t(e, e.pendingProps), u.return = t;
      u.sibling = null;
    }
    return t.child;
  }
  function fr(e, t) {
    return (e.lanes & t) !== 0 ? true : (e = e.dependencies, !!(e !== null && Dl(e)));
  }
  function X0(e, t, u) {
    switch (t.tag) {
      case 3:
        Pe(t, t.stateNode.containerInfo), vn(t, He, e.memoizedState.cache), $n();
        break;
      case 27:
      case 5:
        Pa(t);
        break;
      case 4:
        Pe(t, t.stateNode.containerInfo);
        break;
      case 10:
        vn(t, t.type, t.memoizedProps.value);
        break;
      case 31:
        if (t.memoizedState !== null) return t.flags |= 128, Bi(t), null;
        break;
      case 13:
        var l = t.memoizedState;
        if (l !== null) return l.dehydrated !== null ? (En(t), t.flags |= 128, null) : (u & t.child.childLanes) !== 0 ? $o(e, t, u) : (En(t), e = un(e, t, u), e !== null ? e.sibling : null);
        En(t);
        break;
      case 19:
        var r = (e.flags & 128) !== 0;
        if (l = (u & t.childLanes) !== 0, l || (Ma(e, t, u, false), l = (u & t.childLanes) !== 0), r) {
          if (l) return es(e, t, u);
          t.flags |= 128;
        }
        if (r = t.memoizedState, r !== null && (r.rendering = null, r.tail = null, r.lastEffect = null), Y(Be, Be.current), l) break;
        return null;
      case 22:
        return t.lanes = 0, Ko(e, t, u, t.pendingProps);
      case 24:
        vn(t, He, e.memoizedState.cache);
    }
    return un(e, t, u);
  }
  function ts(e, t, u) {
    if (e !== null) if (e.memoizedProps !== t.pendingProps) Ge = true;
    else {
      if (!fr(e, u) && (t.flags & 128) === 0) return Ge = false, X0(e, t, u);
      Ge = (e.flags & 131072) !== 0;
    }
    else Ge = false, be && (t.flags & 1048576) !== 0 && R_(t, du, t.index);
    switch (t.lanes = 0, t.tag) {
      case 16:
        e: {
          var l = t.pendingProps;
          if (e = na(t.elementType), t.type = e, typeof e == "function") di(e) ? (l = ca(e, l), t.tag = 1, t = Io(null, t, e, l, u)) : (t.tag = 0, t = nr(null, t, e, l, u));
          else {
            if (e != null) {
              var r = e.$$typeof;
              if (r === ot) {
                t.tag = 11, t = Xo(null, t, e, l, u);
                break e;
              } else if (r === se) {
                t.tag = 14, t = Qo(null, t, e, l, u);
                break e;
              }
            }
            throw t = kt(e) || e, Error(a(306, t, ""));
          }
        }
        return t;
      case 0:
        return nr(e, t, t.type, t.pendingProps, u);
      case 1:
        return l = t.type, r = ca(l, t.pendingProps), Io(e, t, l, r, u);
      case 3:
        e: {
          if (Pe(t, t.stateNode.containerInfo), e === null) throw Error(a(387));
          l = t.pendingProps;
          var f = t.memoizedState;
          r = f.element, Di(e, t), Su(t, l, null, u);
          var b = t.memoizedState;
          if (l = b.cache, vn(t, He, l), l !== f.cache && xi(t, [He], u, true), vu(), l = b.element, f.isDehydrated) if (f = { element: l, isDehydrated: false, cache: b.cache }, t.updateQueue.baseState = f, t.memoizedState = f, t.flags & 256) {
            t = Fo(e, t, l, u);
            break e;
          } else if (l !== r) {
            r = Tt(Error(a(424)), t), gu(r), t = Fo(e, t, l, u);
            break e;
          } else {
            switch (e = t.stateNode.containerInfo, e.nodeType) {
              case 9:
                e = e.body;
                break;
              default:
                e = e.nodeName === "HTML" ? e.ownerDocument.body : e;
            }
            for (Te = Ct(e.firstChild), ke = t, be = true, hn = null, Dt = true, u = Z_(t, null, l, u), t.child = u; u; ) u.flags = u.flags & -3 | 4096, u = u.sibling;
          }
          else {
            if ($n(), l === r) {
              t = un(e, t, u);
              break e;
            }
            Ie(e, t, l, u);
          }
          t = t.child;
        }
        return t;
      case 26:
        return kl(e, t), e === null ? (u = sb(t.type, null, t.pendingProps, null)) ? t.memoizedState = u : be || (u = t.type, e = t.pendingProps, l = oc(ue.current).createElement(u), l[Je] = t, l[ut] = e, Fe(l, u, e), Qe(l), t.stateNode = l) : t.memoizedState = sb(t.type, e.memoizedProps, t.pendingProps, e.memoizedState), null;
      case 27:
        return Pa(t), e === null && be && (l = t.stateNode = fb(t.type, t.pendingProps, ue.current), ke = t, Dt = true, r = Te, Bn(t.type) ? (Vr = r, Te = Ct(l.firstChild)) : Te = r), Ie(e, t, t.pendingProps.children, u), kl(e, t), e === null && (t.flags |= 4194304), t.child;
      case 5:
        return e === null && be && ((r = l = Te) && (l = hg(l, t.type, t.pendingProps, Dt), l !== null ? (t.stateNode = l, ke = t, Te = Ct(l.firstChild), Dt = false, r = true) : r = false), r || pn(t)), Pa(t), r = t.type, f = t.pendingProps, b = e !== null ? e.memoizedProps : null, l = f.children, qr(r, f) ? l = null : b !== null && qr(r, b) && (t.flags |= 32), t.memoizedState !== null && (r = ji(e, t, B0, null, null, u), Vu._currentValue = r), kl(e, t), Ie(e, t, l, u), t.child;
      case 6:
        return e === null && be && ((e = u = Te) && (u = pg(u, t.pendingProps, Dt), u !== null ? (t.stateNode = u, ke = t, Te = null, e = true) : e = false), e || pn(t)), null;
      case 13:
        return $o(e, t, u);
      case 4:
        return Pe(t, t.stateNode.containerInfo), l = t.pendingProps, e === null ? t.child = ua(t, null, l, u) : Ie(e, t, l, u), t.child;
      case 11:
        return Xo(e, t, t.type, t.pendingProps, u);
      case 7:
        return Ie(e, t, t.pendingProps, u), t.child;
      case 8:
        return Ie(e, t, t.pendingProps.children, u), t.child;
      case 12:
        return Ie(e, t, t.pendingProps.children, u), t.child;
      case 10:
        return l = t.pendingProps, vn(t, t.type, l.value), Ie(e, t, l.children, u), t.child;
      case 9:
        return r = t.type._context, l = t.pendingProps.children, ea(t), r = We(r), l = l(r), t.flags |= 1, Ie(e, t, l, u), t.child;
      case 14:
        return Qo(e, t, t.type, t.pendingProps, u);
      case 15:
        return Zo(e, t, t.type, t.pendingProps, u);
      case 19:
        return es(e, t, u);
      case 31:
        return V0(e, t, u);
      case 22:
        return Ko(e, t, u, t.pendingProps);
      case 24:
        return ea(t), l = We(He), e === null ? (r = Ti(), r === null && (r = Ee, f = Ai(), r.pooledCache = f, f.refCount++, f !== null && (r.pooledCacheLanes |= u), r = f), t.memoizedState = { parent: l, cache: r }, Oi(t), vn(t, He, r)) : ((e.lanes & u) !== 0 && (Di(e, t), Su(t, null, null, u), vu()), r = e.memoizedState, f = t.memoizedState, r.parent !== l ? (r = { parent: l, cache: l }, t.memoizedState = r, t.lanes === 0 && (t.memoizedState = t.updateQueue.baseState = r), vn(t, He, l)) : (l = f.cache, vn(t, He, l), l !== r.cache && xi(t, [He], u, true))), Ie(e, t, t.pendingProps.children, u), t.child;
      case 29:
        throw t.pendingProps;
    }
    throw Error(a(156, t.tag));
  }
  function ln(e) {
    e.flags |= 4;
  }
  function _r(e, t, u, l, r) {
    if ((t = (e.mode & 32) !== 0) && (t = false), t) {
      if (e.flags |= 16777216, (r & 335544128) === r) if (e.stateNode.complete) e.flags |= 8192;
      else if (Os()) e.flags |= 8192;
      else throw aa = Ul, zi;
    } else e.flags &= -16777217;
  }
  function ns(e, t) {
    if (t.type !== "stylesheet" || (t.state.loading & 4) !== 0) e.flags &= -16777217;
    else if (e.flags |= 16777216, !wb(t)) if (Os()) e.flags |= 8192;
    else throw aa = Ul, zi;
  }
  function Il(e, t) {
    t !== null && (e.flags |= 4), e.flags & 16384 && (t = e.tag !== 22 ? Bf() : 536870912, e.lanes |= t, Va |= t);
  }
  function Ou(e, t) {
    if (!be) switch (e.tailMode) {
      case "hidden":
        t = e.tail;
        for (var u = null; t !== null; ) t.alternate !== null && (u = t), t = t.sibling;
        u === null ? e.tail = null : u.sibling = null;
        break;
      case "collapsed":
        u = e.tail;
        for (var l = null; u !== null; ) u.alternate !== null && (l = u), u = u.sibling;
        l === null ? t || e.tail === null ? e.tail = null : e.tail.sibling = null : l.sibling = null;
    }
  }
  function ze(e) {
    var t = e.alternate !== null && e.alternate.child === e.child, u = 0, l = 0;
    if (t) for (var r = e.child; r !== null; ) u |= r.lanes | r.childLanes, l |= r.subtreeFlags & 65011712, l |= r.flags & 65011712, r.return = e, r = r.sibling;
    else for (r = e.child; r !== null; ) u |= r.lanes | r.childLanes, l |= r.subtreeFlags, l |= r.flags, r.return = e, r = r.sibling;
    return e.subtreeFlags |= l, e.childLanes = u, t;
  }
  function Q0(e, t, u) {
    var l = t.pendingProps;
    switch (yi(t), t.tag) {
      case 16:
      case 15:
      case 0:
      case 11:
      case 7:
      case 8:
      case 12:
      case 9:
      case 14:
        return ze(t), null;
      case 1:
        return ze(t), null;
      case 3:
        return u = t.stateNode, l = null, e !== null && (l = e.memoizedState.cache), t.memoizedState.cache !== l && (t.flags |= 2048), tn(He), Ue(), u.pendingContext && (u.context = u.pendingContext, u.pendingContext = null), (e === null || e.child === null) && (Da(t) ? ln(t) : e === null || e.memoizedState.isDehydrated && (t.flags & 256) === 0 || (t.flags |= 1024, pi())), ze(t), null;
      case 26:
        var r = t.type, f = t.memoizedState;
        return e === null ? (ln(t), f !== null ? (ze(t), ns(t, f)) : (ze(t), _r(t, r, null, l, u))) : f ? f !== e.memoizedState ? (ln(t), ze(t), ns(t, f)) : (ze(t), t.flags &= -16777217) : (e = e.memoizedProps, e !== l && ln(t), ze(t), _r(t, r, e, l, u)), null;
      case 27:
        if (il(t), u = ue.current, r = t.type, e !== null && t.stateNode != null) e.memoizedProps !== l && ln(t);
        else {
          if (!l) {
            if (t.stateNode === null) throw Error(a(166));
            return ze(t), null;
          }
          e = Z.current, Da(t) ? B_(t) : (e = fb(r, l, u), t.stateNode = e, ln(t));
        }
        return ze(t), null;
      case 5:
        if (il(t), r = t.type, e !== null && t.stateNode != null) e.memoizedProps !== l && ln(t);
        else {
          if (!l) {
            if (t.stateNode === null) throw Error(a(166));
            return ze(t), null;
          }
          if (f = Z.current, Da(t)) B_(t);
          else {
            var b = oc(ue.current);
            switch (f) {
              case 1:
                f = b.createElementNS("http://www.w3.org/2000/svg", r);
                break;
              case 2:
                f = b.createElementNS("http://www.w3.org/1998/Math/MathML", r);
                break;
              default:
                switch (r) {
                  case "svg":
                    f = b.createElementNS("http://www.w3.org/2000/svg", r);
                    break;
                  case "math":
                    f = b.createElementNS("http://www.w3.org/1998/Math/MathML", r);
                    break;
                  case "script":
                    f = b.createElement("div"), f.innerHTML = "<script><\/script>", f = f.removeChild(f.firstChild);
                    break;
                  case "select":
                    f = typeof l.is == "string" ? b.createElement("select", { is: l.is }) : b.createElement("select"), l.multiple ? f.multiple = true : l.size && (f.size = l.size);
                    break;
                  default:
                    f = typeof l.is == "string" ? b.createElement(r, { is: l.is }) : b.createElement(r);
                }
            }
            f[Je] = t, f[ut] = l;
            e: for (b = t.child; b !== null; ) {
              if (b.tag === 5 || b.tag === 6) f.appendChild(b.stateNode);
              else if (b.tag !== 4 && b.tag !== 27 && b.child !== null) {
                b.child.return = b, b = b.child;
                continue;
              }
              if (b === t) break e;
              for (; b.sibling === null; ) {
                if (b.return === null || b.return === t) break e;
                b = b.return;
              }
              b.sibling.return = b.return, b = b.sibling;
            }
            t.stateNode = f;
            e: switch (Fe(f, r, l), r) {
              case "button":
              case "input":
              case "select":
              case "textarea":
                l = !!l.autoFocus;
                break e;
              case "img":
                l = true;
                break e;
              default:
                l = false;
            }
            l && ln(t);
          }
        }
        return ze(t), _r(t, t.type, e === null ? null : e.memoizedProps, t.pendingProps, u), null;
      case 6:
        if (e && t.stateNode != null) e.memoizedProps !== l && ln(t);
        else {
          if (typeof l != "string" && t.stateNode === null) throw Error(a(166));
          if (e = ue.current, Da(t)) {
            if (e = t.stateNode, u = t.memoizedProps, l = null, r = ke, r !== null) switch (r.tag) {
              case 27:
              case 5:
                l = r.memoizedProps;
            }
            e[Je] = t, e = !!(e.nodeValue === u || l !== null && l.suppressHydrationWarning === true || $s(e.nodeValue, u)), e || pn(t, true);
          } else e = oc(e).createTextNode(l), e[Je] = t, t.stateNode = e;
        }
        return ze(t), null;
      case 31:
        if (u = t.memoizedState, e === null || e.memoizedState !== null) {
          if (l = Da(t), u !== null) {
            if (e === null) {
              if (!l) throw Error(a(318));
              if (e = t.memoizedState, e = e !== null ? e.dehydrated : null, !e) throw Error(a(557));
              e[Je] = t;
            } else $n(), (t.flags & 128) === 0 && (t.memoizedState = null), t.flags |= 4;
            ze(t), e = false;
          } else u = pi(), e !== null && e.memoizedState !== null && (e.memoizedState.hydrationErrors = u), e = true;
          if (!e) return t.flags & 256 ? (yt(t), t) : (yt(t), null);
          if ((t.flags & 128) !== 0) throw Error(a(558));
        }
        return ze(t), null;
      case 13:
        if (l = t.memoizedState, e === null || e.memoizedState !== null && e.memoizedState.dehydrated !== null) {
          if (r = Da(t), l !== null && l.dehydrated !== null) {
            if (e === null) {
              if (!r) throw Error(a(318));
              if (r = t.memoizedState, r = r !== null ? r.dehydrated : null, !r) throw Error(a(317));
              r[Je] = t;
            } else $n(), (t.flags & 128) === 0 && (t.memoizedState = null), t.flags |= 4;
            ze(t), r = false;
          } else r = pi(), e !== null && e.memoizedState !== null && (e.memoizedState.hydrationErrors = r), r = true;
          if (!r) return t.flags & 256 ? (yt(t), t) : (yt(t), null);
        }
        return yt(t), (t.flags & 128) !== 0 ? (t.lanes = u, t) : (u = l !== null, e = e !== null && e.memoizedState !== null, u && (l = t.child, r = null, l.alternate !== null && l.alternate.memoizedState !== null && l.alternate.memoizedState.cachePool !== null && (r = l.alternate.memoizedState.cachePool.pool), f = null, l.memoizedState !== null && l.memoizedState.cachePool !== null && (f = l.memoizedState.cachePool.pool), f !== r && (l.flags |= 2048)), u !== e && u && (t.child.flags |= 8192), Il(t, t.updateQueue), ze(t), null);
      case 4:
        return Ue(), e === null && Rr(t.stateNode.containerInfo), ze(t), null;
      case 10:
        return tn(t.type), ze(t), null;
      case 19:
        if (j(Be), l = t.memoizedState, l === null) return ze(t), null;
        if (r = (t.flags & 128) !== 0, f = l.rendering, f === null) if (r) Ou(l, false);
        else {
          if (Re !== 0 || e !== null && (e.flags & 128) !== 0) for (e = t.child; e !== null; ) {
            if (f = ql(e), f !== null) {
              for (t.flags |= 128, Ou(l, false), e = f.updateQueue, t.updateQueue = e, Il(t, e), t.subtreeFlags = 0, e = u, u = t.child; u !== null; ) D_(u, e), u = u.sibling;
              return Y(Be, Be.current & 1 | 2), be && Pt(t, l.treeForkCount), t.child;
            }
            e = e.sibling;
          }
          l.tail !== null && st() > tc && (t.flags |= 128, r = true, Ou(l, false), t.lanes = 4194304);
        }
        else {
          if (!r) if (e = ql(f), e !== null) {
            if (t.flags |= 128, r = true, e = e.updateQueue, t.updateQueue = e, Il(t, e), Ou(l, true), l.tail === null && l.tailMode === "hidden" && !f.alternate && !be) return ze(t), null;
          } else 2 * st() - l.renderingStartTime > tc && u !== 536870912 && (t.flags |= 128, r = true, Ou(l, false), t.lanes = 4194304);
          l.isBackwards ? (f.sibling = t.child, t.child = f) : (e = l.last, e !== null ? e.sibling = f : t.child = f, l.last = f);
        }
        return l.tail !== null ? (e = l.tail, l.rendering = e, l.tail = e.sibling, l.renderingStartTime = st(), e.sibling = null, u = Be.current, Y(Be, r ? u & 1 | 2 : u & 1), be && Pt(t, l.treeForkCount), e) : (ze(t), null);
      case 22:
      case 23:
        return yt(t), Ui(), l = t.memoizedState !== null, e !== null ? e.memoizedState !== null !== l && (t.flags |= 8192) : l && (t.flags |= 8192), l ? (u & 536870912) !== 0 && (t.flags & 128) === 0 && (ze(t), t.subtreeFlags & 6 && (t.flags |= 8192)) : ze(t), u = t.updateQueue, u !== null && Il(t, u.retryQueue), u = null, e !== null && e.memoizedState !== null && e.memoizedState.cachePool !== null && (u = e.memoizedState.cachePool.pool), l = null, t.memoizedState !== null && t.memoizedState.cachePool !== null && (l = t.memoizedState.cachePool.pool), l !== u && (t.flags |= 2048), e !== null && j(ta), null;
      case 24:
        return u = null, e !== null && (u = e.memoizedState.cache), t.memoizedState.cache !== u && (t.flags |= 2048), tn(He), ze(t), null;
      case 25:
        return null;
      case 30:
        return null;
    }
    throw Error(a(156, t.tag));
  }
  function Z0(e, t) {
    switch (yi(t), t.tag) {
      case 1:
        return e = t.flags, e & 65536 ? (t.flags = e & -65537 | 128, t) : null;
      case 3:
        return tn(He), Ue(), e = t.flags, (e & 65536) !== 0 && (e & 128) === 0 ? (t.flags = e & -65537 | 128, t) : null;
      case 26:
      case 27:
      case 5:
        return il(t), null;
      case 31:
        if (t.memoizedState !== null) {
          if (yt(t), t.alternate === null) throw Error(a(340));
          $n();
        }
        return e = t.flags, e & 65536 ? (t.flags = e & -65537 | 128, t) : null;
      case 13:
        if (yt(t), e = t.memoizedState, e !== null && e.dehydrated !== null) {
          if (t.alternate === null) throw Error(a(340));
          $n();
        }
        return e = t.flags, e & 65536 ? (t.flags = e & -65537 | 128, t) : null;
      case 19:
        return j(Be), null;
      case 4:
        return Ue(), null;
      case 10:
        return tn(t.type), null;
      case 22:
      case 23:
        return yt(t), Ui(), e !== null && j(ta), e = t.flags, e & 65536 ? (t.flags = e & -65537 | 128, t) : null;
      case 24:
        return tn(He), null;
      case 25:
        return null;
      default:
        return null;
    }
  }
  function as(e, t) {
    switch (yi(t), t.tag) {
      case 3:
        tn(He), Ue();
        break;
      case 26:
      case 27:
      case 5:
        il(t);
        break;
      case 4:
        Ue();
        break;
      case 31:
        t.memoizedState !== null && yt(t);
        break;
      case 13:
        yt(t);
        break;
      case 19:
        j(Be);
        break;
      case 10:
        tn(t.type);
        break;
      case 22:
      case 23:
        yt(t), Ui(), e !== null && j(ta);
        break;
      case 24:
        tn(He);
    }
  }
  function Du(e, t) {
    try {
      var u = t.updateQueue, l = u !== null ? u.lastEffect : null;
      if (l !== null) {
        var r = l.next;
        u = r;
        do {
          if ((u.tag & e) === e) {
            l = void 0;
            var f = u.create, b = u.inst;
            l = f(), b.destroy = l;
          }
          u = u.next;
        } while (u !== r);
      }
    } catch (g) {
      he(t, t.return, g);
    }
  }
  function zn(e, t, u) {
    try {
      var l = t.updateQueue, r = l !== null ? l.lastEffect : null;
      if (r !== null) {
        var f = r.next;
        l = f;
        do {
          if ((l.tag & e) === e) {
            var b = l.inst, g = b.destroy;
            if (g !== void 0) {
              b.destroy = void 0, r = t;
              var w = u, T = g;
              try {
                T();
              } catch (M) {
                he(r, w, M);
              }
            }
          }
          l = l.next;
        } while (l !== f);
      }
    } catch (M) {
      he(t, t.return, M);
    }
  }
  function us(e) {
    var t = e.updateQueue;
    if (t !== null) {
      var u = e.stateNode;
      try {
        J_(t, u);
      } catch (l) {
        he(e, e.return, l);
      }
    }
  }
  function ls(e, t, u) {
    u.props = ca(e.type, e.memoizedProps), u.state = e.memoizedState;
    try {
      u.componentWillUnmount();
    } catch (l) {
      he(e, t, l);
    }
  }
  function Mu(e, t) {
    try {
      var u = e.ref;
      if (u !== null) {
        switch (e.tag) {
          case 26:
          case 27:
          case 5:
            var l = e.stateNode;
            break;
          case 30:
            l = e.stateNode;
            break;
          default:
            l = e.stateNode;
        }
        typeof u == "function" ? e.refCleanup = u(l) : u.current = l;
      }
    } catch (r) {
      he(e, t, r);
    }
  }
  function Kt(e, t) {
    var u = e.ref, l = e.refCleanup;
    if (u !== null) if (typeof l == "function") try {
      l();
    } catch (r) {
      he(e, t, r);
    } finally {
      e.refCleanup = null, e = e.alternate, e != null && (e.refCleanup = null);
    }
    else if (typeof u == "function") try {
      u(null);
    } catch (r) {
      he(e, t, r);
    }
    else u.current = null;
  }
  function cs(e) {
    var t = e.type, u = e.memoizedProps, l = e.stateNode;
    try {
      e: switch (t) {
        case "button":
        case "input":
        case "select":
        case "textarea":
          u.autoFocus && l.focus();
          break e;
        case "img":
          u.src ? l.src = u.src : u.srcSet && (l.srcset = u.srcSet);
      }
    } catch (r) {
      he(e, e.return, r);
    }
  }
  function or(e, t, u) {
    try {
      var l = e.stateNode;
      bg(l, e.type, u, t), l[ut] = t;
    } catch (r) {
      he(e, e.return, r);
    }
  }
  function is(e) {
    return e.tag === 5 || e.tag === 3 || e.tag === 26 || e.tag === 27 && Bn(e.type) || e.tag === 4;
  }
  function sr(e) {
    e: for (; ; ) {
      for (; e.sibling === null; ) {
        if (e.return === null || is(e.return)) return null;
        e = e.return;
      }
      for (e.sibling.return = e.return, e = e.sibling; e.tag !== 5 && e.tag !== 6 && e.tag !== 18; ) {
        if (e.tag === 27 && Bn(e.type) || e.flags & 2 || e.child === null || e.tag === 4) continue e;
        e.child.return = e, e = e.child;
      }
      if (!(e.flags & 2)) return e.stateNode;
    }
  }
  function br(e, t, u) {
    var l = e.tag;
    if (l === 5 || l === 6) e = e.stateNode, t ? (u.nodeType === 9 ? u.body : u.nodeName === "HTML" ? u.ownerDocument.body : u).insertBefore(e, t) : (t = u.nodeType === 9 ? u.body : u.nodeName === "HTML" ? u.ownerDocument.body : u, t.appendChild(e), u = u._reactRootContainer, u != null || t.onclick !== null || (t.onclick = It));
    else if (l !== 4 && (l === 27 && Bn(e.type) && (u = e.stateNode, t = null), e = e.child, e !== null)) for (br(e, t, u), e = e.sibling; e !== null; ) br(e, t, u), e = e.sibling;
  }
  function Fl(e, t, u) {
    var l = e.tag;
    if (l === 5 || l === 6) e = e.stateNode, t ? u.insertBefore(e, t) : u.appendChild(e);
    else if (l !== 4 && (l === 27 && Bn(e.type) && (u = e.stateNode), e = e.child, e !== null)) for (Fl(e, t, u), e = e.sibling; e !== null; ) Fl(e, t, u), e = e.sibling;
  }
  function rs(e) {
    var t = e.stateNode, u = e.memoizedProps;
    try {
      for (var l = e.type, r = t.attributes; r.length; ) t.removeAttributeNode(r[0]);
      Fe(t, l, u), t[Je] = e, t[ut] = u;
    } catch (f) {
      he(e, e.return, f);
    }
  }
  var cn = false, Ye = false, dr = false, fs = typeof WeakSet == "function" ? WeakSet : Set, Ze = null;
  function K0(e, t) {
    if (e = e.containerInfo, Nr = yc, e = p_(e), ii(e)) {
      if ("selectionStart" in e) var u = { start: e.selectionStart, end: e.selectionEnd };
      else e: {
        u = (u = e.ownerDocument) && u.defaultView || window;
        var l = u.getSelection && u.getSelection();
        if (l && l.rangeCount !== 0) {
          u = l.anchorNode;
          var r = l.anchorOffset, f = l.focusNode;
          l = l.focusOffset;
          try {
            u.nodeType, f.nodeType;
          } catch {
            u = null;
            break e;
          }
          var b = 0, g = -1, w = -1, T = 0, M = 0, N = e, z = null;
          t: for (; ; ) {
            for (var D; N !== u || r !== 0 && N.nodeType !== 3 || (g = b + r), N !== f || l !== 0 && N.nodeType !== 3 || (w = b + l), N.nodeType === 3 && (b += N.nodeValue.length), (D = N.firstChild) !== null; ) z = N, N = D;
            for (; ; ) {
              if (N === e) break t;
              if (z === u && ++T === r && (g = b), z === f && ++M === l && (w = b), (D = N.nextSibling) !== null) break;
              N = z, z = N.parentNode;
            }
            N = D;
          }
          u = g === -1 || w === -1 ? null : { start: g, end: w };
        } else u = null;
      }
      u = u || { start: 0, end: 0 };
    } else u = null;
    for (jr = { focusedElem: e, selectionRange: u }, yc = false, Ze = t; Ze !== null; ) if (t = Ze, e = t.child, (t.subtreeFlags & 1028) !== 0 && e !== null) e.return = t, Ze = e;
    else for (; Ze !== null; ) {
      switch (t = Ze, f = t.alternate, e = t.flags, t.tag) {
        case 0:
          if ((e & 4) !== 0 && (e = t.updateQueue, e = e !== null ? e.events : null, e !== null)) for (u = 0; u < e.length; u++) r = e[u], r.ref.impl = r.nextImpl;
          break;
        case 11:
        case 15:
          break;
        case 1:
          if ((e & 1024) !== 0 && f !== null) {
            e = void 0, u = t, r = f.memoizedProps, f = f.memoizedState, l = u.stateNode;
            try {
              var Q = ca(u.type, r);
              e = l.getSnapshotBeforeUpdate(Q, f), l.__reactInternalSnapshotBeforeUpdate = e;
            } catch (W) {
              he(u, u.return, W);
            }
          }
          break;
        case 3:
          if ((e & 1024) !== 0) {
            if (e = t.stateNode.containerInfo, u = e.nodeType, u === 9) Lr(e);
            else if (u === 1) switch (e.nodeName) {
              case "HEAD":
              case "HTML":
              case "BODY":
                Lr(e);
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
          if ((e & 1024) !== 0) throw Error(a(163));
      }
      if (e = t.sibling, e !== null) {
        e.return = t.return, Ze = e;
        break;
      }
      Ze = t.return;
    }
  }
  function _s(e, t, u) {
    var l = u.flags;
    switch (u.tag) {
      case 0:
      case 11:
      case 15:
        fn(e, u), l & 4 && Du(5, u);
        break;
      case 1:
        if (fn(e, u), l & 4) if (e = u.stateNode, t === null) try {
          e.componentDidMount();
        } catch (b) {
          he(u, u.return, b);
        }
        else {
          var r = ca(u.type, t.memoizedProps);
          t = t.memoizedState;
          try {
            e.componentDidUpdate(r, t, e.__reactInternalSnapshotBeforeUpdate);
          } catch (b) {
            he(u, u.return, b);
          }
        }
        l & 64 && us(u), l & 512 && Mu(u, u.return);
        break;
      case 3:
        if (fn(e, u), l & 64 && (e = u.updateQueue, e !== null)) {
          if (t = null, u.child !== null) switch (u.child.tag) {
            case 27:
            case 5:
              t = u.child.stateNode;
              break;
            case 1:
              t = u.child.stateNode;
          }
          try {
            J_(e, t);
          } catch (b) {
            he(u, u.return, b);
          }
        }
        break;
      case 27:
        t === null && l & 4 && rs(u);
      case 26:
      case 5:
        fn(e, u), t === null && l & 4 && cs(u), l & 512 && Mu(u, u.return);
        break;
      case 12:
        fn(e, u);
        break;
      case 31:
        fn(e, u), l & 4 && bs(e, u);
        break;
      case 13:
        fn(e, u), l & 4 && ds(e, u), l & 64 && (e = u.memoizedState, e !== null && (e = e.dehydrated, e !== null && (u = tg.bind(null, u), vg(e, u))));
        break;
      case 22:
        if (l = u.memoizedState !== null || cn, !l) {
          t = t !== null && t.memoizedState !== null || Ye, r = cn;
          var f = Ye;
          cn = l, (Ye = t) && !f ? _n(e, u, (u.subtreeFlags & 8772) !== 0) : fn(e, u), cn = r, Ye = f;
        }
        break;
      case 30:
        break;
      default:
        fn(e, u);
    }
  }
  function os(e) {
    var t = e.alternate;
    t !== null && (e.alternate = null, os(t)), e.child = null, e.deletions = null, e.sibling = null, e.tag === 5 && (t = e.stateNode, t !== null && Qc(t)), e.stateNode = null, e.return = null, e.dependencies = null, e.memoizedProps = null, e.memoizedState = null, e.pendingProps = null, e.stateNode = null, e.updateQueue = null;
  }
  var De = null, ct = false;
  function rn(e, t, u) {
    for (u = u.child; u !== null; ) ss(e, t, u), u = u.sibling;
  }
  function ss(e, t, u) {
    if (bt && typeof bt.onCommitFiberUnmount == "function") try {
      bt.onCommitFiberUnmount(eu, u);
    } catch {
    }
    switch (u.tag) {
      case 26:
        Ye || Kt(u, t), rn(e, t, u), u.memoizedState ? u.memoizedState.count-- : u.stateNode && (u = u.stateNode, u.parentNode.removeChild(u));
        break;
      case 27:
        Ye || Kt(u, t);
        var l = De, r = ct;
        Bn(u.type) && (De = u.stateNode, ct = false), rn(e, t, u), Lu(u.stateNode), De = l, ct = r;
        break;
      case 5:
        Ye || Kt(u, t);
      case 6:
        if (l = De, r = ct, De = null, rn(e, t, u), De = l, ct = r, De !== null) if (ct) try {
          (De.nodeType === 9 ? De.body : De.nodeName === "HTML" ? De.ownerDocument.body : De).removeChild(u.stateNode);
        } catch (f) {
          he(u, t, f);
        }
        else try {
          De.removeChild(u.stateNode);
        } catch (f) {
          he(u, t, f);
        }
        break;
      case 18:
        De !== null && (ct ? (e = De, ub(e.nodeType === 9 ? e.body : e.nodeName === "HTML" ? e.ownerDocument.body : e, u.stateNode), Ia(e)) : ub(De, u.stateNode));
        break;
      case 4:
        l = De, r = ct, De = u.stateNode.containerInfo, ct = true, rn(e, t, u), De = l, ct = r;
        break;
      case 0:
      case 11:
      case 14:
      case 15:
        zn(2, u, t), Ye || zn(4, u, t), rn(e, t, u);
        break;
      case 1:
        Ye || (Kt(u, t), l = u.stateNode, typeof l.componentWillUnmount == "function" && ls(u, t, l)), rn(e, t, u);
        break;
      case 21:
        rn(e, t, u);
        break;
      case 22:
        Ye = (l = Ye) || u.memoizedState !== null, rn(e, t, u), Ye = l;
        break;
      default:
        rn(e, t, u);
    }
  }
  function bs(e, t) {
    if (t.memoizedState === null && (e = t.alternate, e !== null && (e = e.memoizedState, e !== null))) {
      e = e.dehydrated;
      try {
        Ia(e);
      } catch (u) {
        he(t, t.return, u);
      }
    }
  }
  function ds(e, t) {
    if (t.memoizedState === null && (e = t.alternate, e !== null && (e = e.memoizedState, e !== null && (e = e.dehydrated, e !== null)))) try {
      Ia(e);
    } catch (u) {
      he(t, t.return, u);
    }
  }
  function J0(e) {
    switch (e.tag) {
      case 31:
      case 13:
      case 19:
        var t = e.stateNode;
        return t === null && (t = e.stateNode = new fs()), t;
      case 22:
        return e = e.stateNode, t = e._retryCache, t === null && (t = e._retryCache = new fs()), t;
      default:
        throw Error(a(435, e.tag));
    }
  }
  function $l(e, t) {
    var u = J0(e);
    t.forEach(function(l) {
      if (!u.has(l)) {
        u.add(l);
        var r = ng.bind(null, e, l);
        l.then(r, r);
      }
    });
  }
  function it(e, t) {
    var u = t.deletions;
    if (u !== null) for (var l = 0; l < u.length; l++) {
      var r = u[l], f = e, b = t, g = b;
      e: for (; g !== null; ) {
        switch (g.tag) {
          case 27:
            if (Bn(g.type)) {
              De = g.stateNode, ct = false;
              break e;
            }
            break;
          case 5:
            De = g.stateNode, ct = false;
            break e;
          case 3:
          case 4:
            De = g.stateNode.containerInfo, ct = true;
            break e;
        }
        g = g.return;
      }
      if (De === null) throw Error(a(160));
      ss(f, b, r), De = null, ct = false, f = r.alternate, f !== null && (f.return = null), r.return = null;
    }
    if (t.subtreeFlags & 13886) for (t = t.child; t !== null; ) gs(t, e), t = t.sibling;
  }
  var Ht = null;
  function gs(e, t) {
    var u = e.alternate, l = e.flags;
    switch (e.tag) {
      case 0:
      case 11:
      case 14:
      case 15:
        it(t, e), rt(e), l & 4 && (zn(3, e, e.return), Du(3, e), zn(5, e, e.return));
        break;
      case 1:
        it(t, e), rt(e), l & 512 && (Ye || u === null || Kt(u, u.return)), l & 64 && cn && (e = e.updateQueue, e !== null && (l = e.callbacks, l !== null && (u = e.shared.hiddenCallbacks, e.shared.hiddenCallbacks = u === null ? l : u.concat(l))));
        break;
      case 26:
        var r = Ht;
        if (it(t, e), rt(e), l & 512 && (Ye || u === null || Kt(u, u.return)), l & 4) {
          var f = u !== null ? u.memoizedState : null;
          if (l = e.memoizedState, u === null) if (l === null) if (e.stateNode === null) {
            e: {
              l = e.type, u = e.memoizedProps, r = r.ownerDocument || r;
              t: switch (l) {
                case "title":
                  f = r.getElementsByTagName("title")[0], (!f || f[au] || f[Je] || f.namespaceURI === "http://www.w3.org/2000/svg" || f.hasAttribute("itemprop")) && (f = r.createElement(l), r.head.insertBefore(f, r.querySelector("head > title"))), Fe(f, l, u), f[Je] = e, Qe(f), l = f;
                  break e;
                case "link":
                  var b = gb("link", "href", r).get(l + (u.href || ""));
                  if (b) {
                    for (var g = 0; g < b.length; g++) if (f = b[g], f.getAttribute("href") === (u.href == null || u.href === "" ? null : u.href) && f.getAttribute("rel") === (u.rel == null ? null : u.rel) && f.getAttribute("title") === (u.title == null ? null : u.title) && f.getAttribute("crossorigin") === (u.crossOrigin == null ? null : u.crossOrigin)) {
                      b.splice(g, 1);
                      break t;
                    }
                  }
                  f = r.createElement(l), Fe(f, l, u), r.head.appendChild(f);
                  break;
                case "meta":
                  if (b = gb("meta", "content", r).get(l + (u.content || ""))) {
                    for (g = 0; g < b.length; g++) if (f = b[g], f.getAttribute("content") === (u.content == null ? null : "" + u.content) && f.getAttribute("name") === (u.name == null ? null : u.name) && f.getAttribute("property") === (u.property == null ? null : u.property) && f.getAttribute("http-equiv") === (u.httpEquiv == null ? null : u.httpEquiv) && f.getAttribute("charset") === (u.charSet == null ? null : u.charSet)) {
                      b.splice(g, 1);
                      break t;
                    }
                  }
                  f = r.createElement(l), Fe(f, l, u), r.head.appendChild(f);
                  break;
                default:
                  throw Error(a(468, l));
              }
              f[Je] = e, Qe(f), l = f;
            }
            e.stateNode = l;
          } else mb(r, e.type, e.stateNode);
          else e.stateNode = db(r, l, e.memoizedProps);
          else f !== l ? (f === null ? u.stateNode !== null && (u = u.stateNode, u.parentNode.removeChild(u)) : f.count--, l === null ? mb(r, e.type, e.stateNode) : db(r, l, e.memoizedProps)) : l === null && e.stateNode !== null && or(e, e.memoizedProps, u.memoizedProps);
        }
        break;
      case 27:
        it(t, e), rt(e), l & 512 && (Ye || u === null || Kt(u, u.return)), u !== null && l & 4 && or(e, e.memoizedProps, u.memoizedProps);
        break;
      case 5:
        if (it(t, e), rt(e), l & 512 && (Ye || u === null || Kt(u, u.return)), e.flags & 32) {
          r = e.stateNode;
          try {
            ha(r, "");
          } catch (Q) {
            he(e, e.return, Q);
          }
        }
        l & 4 && e.stateNode != null && (r = e.memoizedProps, or(e, r, u !== null ? u.memoizedProps : r)), l & 1024 && (dr = true);
        break;
      case 6:
        if (it(t, e), rt(e), l & 4) {
          if (e.stateNode === null) throw Error(a(162));
          l = e.memoizedProps, u = e.stateNode;
          try {
            u.nodeValue = l;
          } catch (Q) {
            he(e, e.return, Q);
          }
        }
        break;
      case 3:
        if (dc = null, r = Ht, Ht = sc(t.containerInfo), it(t, e), Ht = r, rt(e), l & 4 && u !== null && u.memoizedState.isDehydrated) try {
          Ia(t.containerInfo);
        } catch (Q) {
          he(e, e.return, Q);
        }
        dr && (dr = false, ms(e));
        break;
      case 4:
        l = Ht, Ht = sc(e.stateNode.containerInfo), it(t, e), rt(e), Ht = l;
        break;
      case 12:
        it(t, e), rt(e);
        break;
      case 31:
        it(t, e), rt(e), l & 4 && (l = e.updateQueue, l !== null && (e.updateQueue = null, $l(e, l)));
        break;
      case 13:
        it(t, e), rt(e), e.child.flags & 8192 && e.memoizedState !== null != (u !== null && u.memoizedState !== null) && (ec = st()), l & 4 && (l = e.updateQueue, l !== null && (e.updateQueue = null, $l(e, l)));
        break;
      case 22:
        r = e.memoizedState !== null;
        var w = u !== null && u.memoizedState !== null, T = cn, M = Ye;
        if (cn = T || r, Ye = M || w, it(t, e), Ye = M, cn = T, rt(e), l & 8192) e: for (t = e.stateNode, t._visibility = r ? t._visibility & -2 : t._visibility | 1, r && (u === null || w || cn || Ye || ia(e)), u = null, t = e; ; ) {
          if (t.tag === 5 || t.tag === 26) {
            if (u === null) {
              w = u = t;
              try {
                if (f = w.stateNode, r) b = f.style, typeof b.setProperty == "function" ? b.setProperty("display", "none", "important") : b.display = "none";
                else {
                  g = w.stateNode;
                  var N = w.memoizedProps.style, z = N != null && N.hasOwnProperty("display") ? N.display : null;
                  g.style.display = z == null || typeof z == "boolean" ? "" : ("" + z).trim();
                }
              } catch (Q) {
                he(w, w.return, Q);
              }
            }
          } else if (t.tag === 6) {
            if (u === null) {
              w = t;
              try {
                w.stateNode.nodeValue = r ? "" : w.memoizedProps;
              } catch (Q) {
                he(w, w.return, Q);
              }
            }
          } else if (t.tag === 18) {
            if (u === null) {
              w = t;
              try {
                var D = w.stateNode;
                r ? lb(D, true) : lb(w.stateNode, false);
              } catch (Q) {
                he(w, w.return, Q);
              }
            }
          } else if ((t.tag !== 22 && t.tag !== 23 || t.memoizedState === null || t === e) && t.child !== null) {
            t.child.return = t, t = t.child;
            continue;
          }
          if (t === e) break e;
          for (; t.sibling === null; ) {
            if (t.return === null || t.return === e) break e;
            u === t && (u = null), t = t.return;
          }
          u === t && (u = null), t.sibling.return = t.return, t = t.sibling;
        }
        l & 4 && (l = e.updateQueue, l !== null && (u = l.retryQueue, u !== null && (l.retryQueue = null, $l(e, u))));
        break;
      case 19:
        it(t, e), rt(e), l & 4 && (l = e.updateQueue, l !== null && (e.updateQueue = null, $l(e, l)));
        break;
      case 30:
        break;
      case 21:
        break;
      default:
        it(t, e), rt(e);
    }
  }
  function rt(e) {
    var t = e.flags;
    if (t & 2) {
      try {
        for (var u, l = e.return; l !== null; ) {
          if (is(l)) {
            u = l;
            break;
          }
          l = l.return;
        }
        if (u == null) throw Error(a(160));
        switch (u.tag) {
          case 27:
            var r = u.stateNode, f = sr(e);
            Fl(e, f, r);
            break;
          case 5:
            var b = u.stateNode;
            u.flags & 32 && (ha(b, ""), u.flags &= -33);
            var g = sr(e);
            Fl(e, g, b);
            break;
          case 3:
          case 4:
            var w = u.stateNode.containerInfo, T = sr(e);
            br(e, T, w);
            break;
          default:
            throw Error(a(161));
        }
      } catch (M) {
        he(e, e.return, M);
      }
      e.flags &= -3;
    }
    t & 4096 && (e.flags &= -4097);
  }
  function ms(e) {
    if (e.subtreeFlags & 1024) for (e = e.child; e !== null; ) {
      var t = e;
      ms(t), t.tag === 5 && t.flags & 1024 && t.stateNode.reset(), e = e.sibling;
    }
  }
  function fn(e, t) {
    if (t.subtreeFlags & 8772) for (t = t.child; t !== null; ) _s(e, t.alternate, t), t = t.sibling;
  }
  function ia(e) {
    for (e = e.child; e !== null; ) {
      var t = e;
      switch (t.tag) {
        case 0:
        case 11:
        case 14:
        case 15:
          zn(4, t, t.return), ia(t);
          break;
        case 1:
          Kt(t, t.return);
          var u = t.stateNode;
          typeof u.componentWillUnmount == "function" && ls(t, t.return, u), ia(t);
          break;
        case 27:
          Lu(t.stateNode);
        case 26:
        case 5:
          Kt(t, t.return), ia(t);
          break;
        case 22:
          t.memoizedState === null && ia(t);
          break;
        case 30:
          ia(t);
          break;
        default:
          ia(t);
      }
      e = e.sibling;
    }
  }
  function _n(e, t, u) {
    for (u = u && (t.subtreeFlags & 8772) !== 0, t = t.child; t !== null; ) {
      var l = t.alternate, r = e, f = t, b = f.flags;
      switch (f.tag) {
        case 0:
        case 11:
        case 15:
          _n(r, f, u), Du(4, f);
          break;
        case 1:
          if (_n(r, f, u), l = f, r = l.stateNode, typeof r.componentDidMount == "function") try {
            r.componentDidMount();
          } catch (T) {
            he(l, l.return, T);
          }
          if (l = f, r = l.updateQueue, r !== null) {
            var g = l.stateNode;
            try {
              var w = r.shared.hiddenCallbacks;
              if (w !== null) for (r.shared.hiddenCallbacks = null, r = 0; r < w.length; r++) K_(w[r], g);
            } catch (T) {
              he(l, l.return, T);
            }
          }
          u && b & 64 && us(f), Mu(f, f.return);
          break;
        case 27:
          rs(f);
        case 26:
        case 5:
          _n(r, f, u), u && l === null && b & 4 && cs(f), Mu(f, f.return);
          break;
        case 12:
          _n(r, f, u);
          break;
        case 31:
          _n(r, f, u), u && b & 4 && bs(r, f);
          break;
        case 13:
          _n(r, f, u), u && b & 4 && ds(r, f);
          break;
        case 22:
          f.memoizedState === null && _n(r, f, u), Mu(f, f.return);
          break;
        case 30:
          break;
        default:
          _n(r, f, u);
      }
      t = t.sibling;
    }
  }
  function gr(e, t) {
    var u = null;
    e !== null && e.memoizedState !== null && e.memoizedState.cachePool !== null && (u = e.memoizedState.cachePool.pool), e = null, t.memoizedState !== null && t.memoizedState.cachePool !== null && (e = t.memoizedState.cachePool.pool), e !== u && (e != null && e.refCount++, u != null && mu(u));
  }
  function mr(e, t) {
    e = null, t.alternate !== null && (e = t.alternate.memoizedState.cache), t = t.memoizedState.cache, t !== e && (t.refCount++, e != null && mu(e));
  }
  function Lt(e, t, u, l) {
    if (t.subtreeFlags & 10256) for (t = t.child; t !== null; ) ws(e, t, u, l), t = t.sibling;
  }
  function ws(e, t, u, l) {
    var r = t.flags;
    switch (t.tag) {
      case 0:
      case 11:
      case 15:
        Lt(e, t, u, l), r & 2048 && Du(9, t);
        break;
      case 1:
        Lt(e, t, u, l);
        break;
      case 3:
        Lt(e, t, u, l), r & 2048 && (e = null, t.alternate !== null && (e = t.alternate.memoizedState.cache), t = t.memoizedState.cache, t !== e && (t.refCount++, e != null && mu(e)));
        break;
      case 12:
        if (r & 2048) {
          Lt(e, t, u, l), e = t.stateNode;
          try {
            var f = t.memoizedProps, b = f.id, g = f.onPostCommit;
            typeof g == "function" && g(b, t.alternate === null ? "mount" : "update", e.passiveEffectDuration, -0);
          } catch (w) {
            he(t, t.return, w);
          }
        } else Lt(e, t, u, l);
        break;
      case 31:
        Lt(e, t, u, l);
        break;
      case 13:
        Lt(e, t, u, l);
        break;
      case 23:
        break;
      case 22:
        f = t.stateNode, b = t.alternate, t.memoizedState !== null ? f._visibility & 2 ? Lt(e, t, u, l) : Cu(e, t) : f._visibility & 2 ? Lt(e, t, u, l) : (f._visibility |= 2, La(e, t, u, l, (t.subtreeFlags & 10256) !== 0 || false)), r & 2048 && gr(b, t);
        break;
      case 24:
        Lt(e, t, u, l), r & 2048 && mr(t.alternate, t);
        break;
      default:
        Lt(e, t, u, l);
    }
  }
  function La(e, t, u, l, r) {
    for (r = r && ((t.subtreeFlags & 10256) !== 0 || false), t = t.child; t !== null; ) {
      var f = e, b = t, g = u, w = l, T = b.flags;
      switch (b.tag) {
        case 0:
        case 11:
        case 15:
          La(f, b, g, w, r), Du(8, b);
          break;
        case 23:
          break;
        case 22:
          var M = b.stateNode;
          b.memoizedState !== null ? M._visibility & 2 ? La(f, b, g, w, r) : Cu(f, b) : (M._visibility |= 2, La(f, b, g, w, r)), r && T & 2048 && gr(b.alternate, b);
          break;
        case 24:
          La(f, b, g, w, r), r && T & 2048 && mr(b.alternate, b);
          break;
        default:
          La(f, b, g, w, r);
      }
      t = t.sibling;
    }
  }
  function Cu(e, t) {
    if (t.subtreeFlags & 10256) for (t = t.child; t !== null; ) {
      var u = e, l = t, r = l.flags;
      switch (l.tag) {
        case 22:
          Cu(u, l), r & 2048 && gr(l.alternate, l);
          break;
        case 24:
          Cu(u, l), r & 2048 && mr(l.alternate, l);
          break;
        default:
          Cu(u, l);
      }
      t = t.sibling;
    }
  }
  var Ru = 8192;
  function Ga(e, t, u) {
    if (e.subtreeFlags & Ru) for (e = e.child; e !== null; ) ys(e, t, u), e = e.sibling;
  }
  function ys(e, t, u) {
    switch (e.tag) {
      case 26:
        Ga(e, t, u), e.flags & Ru && e.memoizedState !== null && Ug(u, Ht, e.memoizedState, e.memoizedProps);
        break;
      case 5:
        Ga(e, t, u);
        break;
      case 3:
      case 4:
        var l = Ht;
        Ht = sc(e.stateNode.containerInfo), Ga(e, t, u), Ht = l;
        break;
      case 22:
        e.memoizedState === null && (l = e.alternate, l !== null && l.memoizedState !== null ? (l = Ru, Ru = 16777216, Ga(e, t, u), Ru = l) : Ga(e, t, u));
        break;
      default:
        Ga(e, t, u);
    }
  }
  function hs(e) {
    var t = e.alternate;
    if (t !== null && (e = t.child, e !== null)) {
      t.child = null;
      do
        t = e.sibling, e.sibling = null, e = t;
      while (e !== null);
    }
  }
  function Uu(e) {
    var t = e.deletions;
    if ((e.flags & 16) !== 0) {
      if (t !== null) for (var u = 0; u < t.length; u++) {
        var l = t[u];
        Ze = l, vs(l, e);
      }
      hs(e);
    }
    if (e.subtreeFlags & 10256) for (e = e.child; e !== null; ) ps(e), e = e.sibling;
  }
  function ps(e) {
    switch (e.tag) {
      case 0:
      case 11:
      case 15:
        Uu(e), e.flags & 2048 && zn(9, e, e.return);
        break;
      case 3:
        Uu(e);
        break;
      case 12:
        Uu(e);
        break;
      case 22:
        var t = e.stateNode;
        e.memoizedState !== null && t._visibility & 2 && (e.return === null || e.return.tag !== 13) ? (t._visibility &= -3, Pl(e)) : Uu(e);
        break;
      default:
        Uu(e);
    }
  }
  function Pl(e) {
    var t = e.deletions;
    if ((e.flags & 16) !== 0) {
      if (t !== null) for (var u = 0; u < t.length; u++) {
        var l = t[u];
        Ze = l, vs(l, e);
      }
      hs(e);
    }
    for (e = e.child; e !== null; ) {
      switch (t = e, t.tag) {
        case 0:
        case 11:
        case 15:
          zn(8, t, t.return), Pl(t);
          break;
        case 22:
          u = t.stateNode, u._visibility & 2 && (u._visibility &= -3, Pl(t));
          break;
        default:
          Pl(t);
      }
      e = e.sibling;
    }
  }
  function vs(e, t) {
    for (; Ze !== null; ) {
      var u = Ze;
      switch (u.tag) {
        case 0:
        case 11:
        case 15:
          zn(8, u, t);
          break;
        case 23:
        case 22:
          if (u.memoizedState !== null && u.memoizedState.cachePool !== null) {
            var l = u.memoizedState.cachePool.pool;
            l != null && l.refCount++;
          }
          break;
        case 24:
          mu(u.memoizedState.cache);
      }
      if (l = u.child, l !== null) l.return = u, Ze = l;
      else e: for (u = e; Ze !== null; ) {
        l = Ze;
        var r = l.sibling, f = l.return;
        if (os(l), l === u) {
          Ze = null;
          break e;
        }
        if (r !== null) {
          r.return = f, Ze = r;
          break e;
        }
        Ze = f;
      }
    }
  }
  var k0 = { getCacheForType: function(e) {
    var t = We(He), u = t.data.get(e);
    return u === void 0 && (u = e(), t.data.set(e, u)), u;
  }, cacheSignal: function() {
    return We(He).controller.signal;
  } }, W0 = typeof WeakMap == "function" ? WeakMap : Map, me = 0, Ee = null, le = null, re = 0, ye = 0, ht = null, On = false, Ya = false, wr = false, on = 0, Re = 0, Dn = 0, ra = 0, yr = 0, pt = 0, Va = 0, Bu = null, ft = null, hr = false, ec = 0, Ss = 0, tc = 1 / 0, nc = null, Mn = null, Xe = 0, Cn = null, Xa = null, sn = 0, pr = 0, vr = null, xs = null, Nu = 0, Sr = null;
  function vt() {
    return (me & 2) !== 0 && re !== 0 ? re & -re : C.T !== null ? Or() : Hf();
  }
  function As() {
    if (pt === 0) if ((re & 536870912) === 0 || be) {
      var e = _l;
      _l <<= 1, (_l & 3932160) === 0 && (_l = 262144), pt = e;
    } else pt = 536870912;
    return e = wt.current, e !== null && (e.flags |= 32), pt;
  }
  function _t(e, t, u) {
    (e === Ee && (ye === 2 || ye === 9) || e.cancelPendingCommit !== null) && (Qa(e, 0), Rn(e, re, pt, false)), nu(e, u), ((me & 2) === 0 || e !== Ee) && (e === Ee && ((me & 2) === 0 && (ra |= u), Re === 4 && Rn(e, re, pt, false)), Jt(e));
  }
  function Es(e, t, u) {
    if ((me & 6) !== 0) throw Error(a(327));
    var l = !u && (t & 127) === 0 && (t & e.expiredLanes) === 0 || tu(e, t), r = l ? $0(e, t) : Ar(e, t, true), f = l;
    do {
      if (r === 0) {
        Ya && !l && Rn(e, t, 0, false);
        break;
      } else {
        if (u = e.current.alternate, f && !I0(u)) {
          r = Ar(e, t, false), f = false;
          continue;
        }
        if (r === 2) {
          if (f = t, e.errorRecoveryDisabledLanes & f) var b = 0;
          else b = e.pendingLanes & -536870913, b = b !== 0 ? b : b & 536870912 ? 536870912 : 0;
          if (b !== 0) {
            t = b;
            e: {
              var g = e;
              r = Bu;
              var w = g.current.memoizedState.isDehydrated;
              if (w && (Qa(g, b).flags |= 256), b = Ar(g, b, false), b !== 2) {
                if (wr && !w) {
                  g.errorRecoveryDisabledLanes |= f, ra |= f, r = 4;
                  break e;
                }
                f = ft, ft = r, f !== null && (ft === null ? ft = f : ft.push.apply(ft, f));
              }
              r = b;
            }
            if (f = false, r !== 2) continue;
          }
        }
        if (r === 1) {
          Qa(e, 0), Rn(e, t, 0, true);
          break;
        }
        e: {
          switch (l = e, f = r, f) {
            case 0:
            case 1:
              throw Error(a(345));
            case 4:
              if ((t & 4194048) !== t) break;
            case 6:
              Rn(l, t, pt, !On);
              break e;
            case 2:
              ft = null;
              break;
            case 3:
            case 5:
              break;
            default:
              throw Error(a(329));
          }
          if ((t & 62914560) === t && (r = ec + 300 - st(), 10 < r)) {
            if (Rn(l, t, pt, !On), sl(l, 0, true) !== 0) break e;
            sn = t, l.timeoutHandle = nb(Ts.bind(null, l, u, ft, nc, hr, t, pt, ra, Va, On, f, "Throttled", -0, 0), r);
            break e;
          }
          Ts(l, u, ft, nc, hr, t, pt, ra, Va, On, f, null, -0, 0);
        }
      }
      break;
    } while (true);
    Jt(e);
  }
  function Ts(e, t, u, l, r, f, b, g, w, T, M, N, z, D) {
    if (e.timeoutHandle = -1, N = t.subtreeFlags, N & 8192 || (N & 16785408) === 16785408) {
      N = { stylesheets: null, count: 0, imgCount: 0, imgBytes: 0, suspenseyImages: [], waitingForImages: true, waitingForViewTransition: false, unsuspend: It }, ys(t, f, N);
      var Q = (f & 62914560) === f ? ec - st() : (f & 4194048) === f ? Ss - st() : 0;
      if (Q = Bg(N, Q), Q !== null) {
        sn = f, e.cancelPendingCommit = Q(Bs.bind(null, e, t, f, u, l, r, b, g, w, M, N, null, z, D)), Rn(e, f, b, !T);
        return;
      }
    }
    Bs(e, t, f, u, l, r, b, g, w);
  }
  function I0(e) {
    for (var t = e; ; ) {
      var u = t.tag;
      if ((u === 0 || u === 11 || u === 15) && t.flags & 16384 && (u = t.updateQueue, u !== null && (u = u.stores, u !== null))) for (var l = 0; l < u.length; l++) {
        var r = u[l], f = r.getSnapshot;
        r = r.value;
        try {
          if (!gt(f(), r)) return false;
        } catch {
          return false;
        }
      }
      if (u = t.child, t.subtreeFlags & 16384 && u !== null) u.return = t, t = u;
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
  function Rn(e, t, u, l) {
    t &= ~yr, t &= ~ra, e.suspendedLanes |= t, e.pingedLanes &= ~t, l && (e.warmLanes |= t), l = e.expirationTimes;
    for (var r = t; 0 < r; ) {
      var f = 31 - dt(r), b = 1 << f;
      l[f] = -1, r &= ~b;
    }
    u !== 0 && Nf(e, u, t);
  }
  function ac() {
    return (me & 6) === 0 ? (ju(0), false) : true;
  }
  function xr() {
    if (le !== null) {
      if (ye === 0) var e = le.return;
      else e = le, en = Pn = null, Li(e), Ba = null, yu = 0, e = le;
      for (; e !== null; ) as(e.alternate, e), e = e.return;
      le = null;
    }
  }
  function Qa(e, t) {
    var u = e.timeoutHandle;
    u !== -1 && (e.timeoutHandle = -1, mg(u)), u = e.cancelPendingCommit, u !== null && (e.cancelPendingCommit = null, u()), sn = 0, xr(), Ee = e, le = u = $t(e.current, null), re = t, ye = 0, ht = null, On = false, Ya = tu(e, t), wr = false, Va = pt = yr = ra = Dn = Re = 0, ft = Bu = null, hr = false, (t & 8) !== 0 && (t |= t & 32);
    var l = e.entangledLanes;
    if (l !== 0) for (e = e.entanglements, l &= t; 0 < l; ) {
      var r = 31 - dt(l), f = 1 << r;
      t |= e[r], l &= ~f;
    }
    return on = t, Al(), u;
  }
  function zs(e, t) {
    ee = null, C.H = Tu, t === Ua || t === Rl ? (t = V_(), ye = 3) : t === zi ? (t = V_(), ye = 4) : ye = t === tr ? 8 : t !== null && typeof t == "object" && typeof t.then == "function" ? 6 : 1, ht = t, le === null && (Re = 1, Kl(e, Tt(t, e.current)));
  }
  function Os() {
    var e = wt.current;
    return e === null ? true : (re & 4194048) === re ? Mt === null : (re & 62914560) === re || (re & 536870912) !== 0 ? e === Mt : false;
  }
  function Ds() {
    var e = C.H;
    return C.H = Tu, e === null ? Tu : e;
  }
  function Ms() {
    var e = C.A;
    return C.A = k0, e;
  }
  function uc() {
    Re = 4, On || (re & 4194048) !== re && wt.current !== null || (Ya = true), (Dn & 134217727) === 0 && (ra & 134217727) === 0 || Ee === null || Rn(Ee, re, pt, false);
  }
  function Ar(e, t, u) {
    var l = me;
    me |= 2;
    var r = Ds(), f = Ms();
    (Ee !== e || re !== t) && (nc = null, Qa(e, t)), t = false;
    var b = Re;
    e: do
      try {
        if (ye !== 0 && le !== null) {
          var g = le, w = ht;
          switch (ye) {
            case 8:
              xr(), b = 6;
              break e;
            case 3:
            case 2:
            case 9:
            case 6:
              wt.current === null && (t = true);
              var T = ye;
              if (ye = 0, ht = null, Za(e, g, w, T), u && Ya) {
                b = 0;
                break e;
              }
              break;
            default:
              T = ye, ye = 0, ht = null, Za(e, g, w, T);
          }
        }
        F0(), b = Re;
        break;
      } catch (M) {
        zs(e, M);
      }
    while (true);
    return t && e.shellSuspendCounter++, en = Pn = null, me = l, C.H = r, C.A = f, le === null && (Ee = null, re = 0, Al()), b;
  }
  function F0() {
    for (; le !== null; ) Cs(le);
  }
  function $0(e, t) {
    var u = me;
    me |= 2;
    var l = Ds(), r = Ms();
    Ee !== e || re !== t ? (nc = null, tc = st() + 500, Qa(e, t)) : Ya = tu(e, t);
    e: do
      try {
        if (ye !== 0 && le !== null) {
          t = le;
          var f = ht;
          t: switch (ye) {
            case 1:
              ye = 0, ht = null, Za(e, t, f, 1);
              break;
            case 2:
            case 9:
              if (G_(f)) {
                ye = 0, ht = null, Rs(t);
                break;
              }
              t = function() {
                ye !== 2 && ye !== 9 || Ee !== e || (ye = 7), Jt(e);
              }, f.then(t, t);
              break e;
            case 3:
              ye = 7;
              break e;
            case 4:
              ye = 5;
              break e;
            case 7:
              G_(f) ? (ye = 0, ht = null, Rs(t)) : (ye = 0, ht = null, Za(e, t, f, 7));
              break;
            case 5:
              var b = null;
              switch (le.tag) {
                case 26:
                  b = le.memoizedState;
                case 5:
                case 27:
                  var g = le;
                  if (b ? wb(b) : g.stateNode.complete) {
                    ye = 0, ht = null;
                    var w = g.sibling;
                    if (w !== null) le = w;
                    else {
                      var T = g.return;
                      T !== null ? (le = T, lc(T)) : le = null;
                    }
                    break t;
                  }
              }
              ye = 0, ht = null, Za(e, t, f, 5);
              break;
            case 6:
              ye = 0, ht = null, Za(e, t, f, 6);
              break;
            case 8:
              xr(), Re = 6;
              break e;
            default:
              throw Error(a(462));
          }
        }
        P0();
        break;
      } catch (M) {
        zs(e, M);
      }
    while (true);
    return en = Pn = null, C.H = l, C.A = r, me = u, le !== null ? 0 : (Ee = null, re = 0, Al(), Re);
  }
  function P0() {
    for (; le !== null && !Sd(); ) Cs(le);
  }
  function Cs(e) {
    var t = ts(e.alternate, e, on);
    e.memoizedProps = e.pendingProps, t === null ? lc(e) : le = t;
  }
  function Rs(e) {
    var t = e, u = t.alternate;
    switch (t.tag) {
      case 15:
      case 0:
        t = Wo(u, t, t.pendingProps, t.type, void 0, re);
        break;
      case 11:
        t = Wo(u, t, t.pendingProps, t.type.render, t.ref, re);
        break;
      case 5:
        Li(t);
      default:
        as(u, t), t = le = D_(t, on), t = ts(u, t, on);
    }
    e.memoizedProps = e.pendingProps, t === null ? lc(e) : le = t;
  }
  function Za(e, t, u, l) {
    en = Pn = null, Li(t), Ba = null, yu = 0;
    var r = t.return;
    try {
      if (Y0(e, r, t, u, re)) {
        Re = 1, Kl(e, Tt(u, e.current)), le = null;
        return;
      }
    } catch (f) {
      if (r !== null) throw le = r, f;
      Re = 1, Kl(e, Tt(u, e.current)), le = null;
      return;
    }
    t.flags & 32768 ? (be || l === 1 ? e = true : Ya || (re & 536870912) !== 0 ? e = false : (On = e = true, (l === 2 || l === 9 || l === 3 || l === 6) && (l = wt.current, l !== null && l.tag === 13 && (l.flags |= 16384))), Us(t, e)) : lc(t);
  }
  function lc(e) {
    var t = e;
    do {
      if ((t.flags & 32768) !== 0) {
        Us(t, On);
        return;
      }
      e = t.return;
      var u = Q0(t.alternate, t, on);
      if (u !== null) {
        le = u;
        return;
      }
      if (t = t.sibling, t !== null) {
        le = t;
        return;
      }
      le = t = e;
    } while (t !== null);
    Re === 0 && (Re = 5);
  }
  function Us(e, t) {
    do {
      var u = Z0(e.alternate, e);
      if (u !== null) {
        u.flags &= 32767, le = u;
        return;
      }
      if (u = e.return, u !== null && (u.flags |= 32768, u.subtreeFlags = 0, u.deletions = null), !t && (e = e.sibling, e !== null)) {
        le = e;
        return;
      }
      le = e = u;
    } while (e !== null);
    Re = 6, le = null;
  }
  function Bs(e, t, u, l, r, f, b, g, w) {
    e.cancelPendingCommit = null;
    do
      cc();
    while (Xe !== 0);
    if ((me & 6) !== 0) throw Error(a(327));
    if (t !== null) {
      if (t === e.current) throw Error(a(177));
      if (f = t.lanes | t.childLanes, f |= si, Rd(e, u, f, b, g, w), e === Ee && (le = Ee = null, re = 0), Xa = t, Cn = e, sn = u, pr = f, vr = r, xs = l, (t.subtreeFlags & 10256) !== 0 || (t.flags & 10256) !== 0 ? (e.callbackNode = null, e.callbackPriority = 0, ag(rl, function() {
        return Ls(), null;
      })) : (e.callbackNode = null, e.callbackPriority = 0), l = (t.flags & 13878) !== 0, (t.subtreeFlags & 13878) !== 0 || l) {
        l = C.T, C.T = null, r = G.p, G.p = 2, b = me, me |= 4;
        try {
          K0(e, t, u);
        } finally {
          me = b, G.p = r, C.T = l;
        }
      }
      Xe = 1, Ns(), js(), qs();
    }
  }
  function Ns() {
    if (Xe === 1) {
      Xe = 0;
      var e = Cn, t = Xa, u = (t.flags & 13878) !== 0;
      if ((t.subtreeFlags & 13878) !== 0 || u) {
        u = C.T, C.T = null;
        var l = G.p;
        G.p = 2;
        var r = me;
        me |= 4;
        try {
          gs(t, e);
          var f = jr, b = p_(e.containerInfo), g = f.focusedElem, w = f.selectionRange;
          if (b !== g && g && g.ownerDocument && h_(g.ownerDocument.documentElement, g)) {
            if (w !== null && ii(g)) {
              var T = w.start, M = w.end;
              if (M === void 0 && (M = T), "selectionStart" in g) g.selectionStart = T, g.selectionEnd = Math.min(M, g.value.length);
              else {
                var N = g.ownerDocument || document, z = N && N.defaultView || window;
                if (z.getSelection) {
                  var D = z.getSelection(), Q = g.textContent.length, W = Math.min(w.start, Q), xe = w.end === void 0 ? W : Math.min(w.end, Q);
                  !D.extend && W > xe && (b = xe, xe = W, W = b);
                  var A = y_(g, W), v = y_(g, xe);
                  if (A && v && (D.rangeCount !== 1 || D.anchorNode !== A.node || D.anchorOffset !== A.offset || D.focusNode !== v.node || D.focusOffset !== v.offset)) {
                    var E = N.createRange();
                    E.setStart(A.node, A.offset), D.removeAllRanges(), W > xe ? (D.addRange(E), D.extend(v.node, v.offset)) : (E.setEnd(v.node, v.offset), D.addRange(E));
                  }
                }
              }
            }
            for (N = [], D = g; D = D.parentNode; ) D.nodeType === 1 && N.push({ element: D, left: D.scrollLeft, top: D.scrollTop });
            for (typeof g.focus == "function" && g.focus(), g = 0; g < N.length; g++) {
              var U = N[g];
              U.element.scrollLeft = U.left, U.element.scrollTop = U.top;
            }
          }
          yc = !!Nr, jr = Nr = null;
        } finally {
          me = r, G.p = l, C.T = u;
        }
      }
      e.current = t, Xe = 2;
    }
  }
  function js() {
    if (Xe === 2) {
      Xe = 0;
      var e = Cn, t = Xa, u = (t.flags & 8772) !== 0;
      if ((t.subtreeFlags & 8772) !== 0 || u) {
        u = C.T, C.T = null;
        var l = G.p;
        G.p = 2;
        var r = me;
        me |= 4;
        try {
          _s(e, t.alternate, t);
        } finally {
          me = r, G.p = l, C.T = u;
        }
      }
      Xe = 3;
    }
  }
  function qs() {
    if (Xe === 4 || Xe === 3) {
      Xe = 0, xd();
      var e = Cn, t = Xa, u = sn, l = xs;
      (t.subtreeFlags & 10256) !== 0 || (t.flags & 10256) !== 0 ? Xe = 5 : (Xe = 0, Xa = Cn = null, Hs(e, e.pendingLanes));
      var r = e.pendingLanes;
      if (r === 0 && (Mn = null), Vc(u), t = t.stateNode, bt && typeof bt.onCommitFiberRoot == "function") try {
        bt.onCommitFiberRoot(eu, t, void 0, (t.current.flags & 128) === 128);
      } catch {
      }
      if (l !== null) {
        t = C.T, r = G.p, G.p = 2, C.T = null;
        try {
          for (var f = e.onRecoverableError, b = 0; b < l.length; b++) {
            var g = l[b];
            f(g.value, { componentStack: g.stack });
          }
        } finally {
          C.T = t, G.p = r;
        }
      }
      (sn & 3) !== 0 && cc(), Jt(e), r = e.pendingLanes, (u & 261930) !== 0 && (r & 42) !== 0 ? e === Sr ? Nu++ : (Nu = 0, Sr = e) : Nu = 0, ju(0);
    }
  }
  function Hs(e, t) {
    (e.pooledCacheLanes &= t) === 0 && (t = e.pooledCache, t != null && (e.pooledCache = null, mu(t)));
  }
  function cc() {
    return Ns(), js(), qs(), Ls();
  }
  function Ls() {
    if (Xe !== 5) return false;
    var e = Cn, t = pr;
    pr = 0;
    var u = Vc(sn), l = C.T, r = G.p;
    try {
      G.p = 32 > u ? 32 : u, C.T = null, u = vr, vr = null;
      var f = Cn, b = sn;
      if (Xe = 0, Xa = Cn = null, sn = 0, (me & 6) !== 0) throw Error(a(331));
      var g = me;
      if (me |= 4, ps(f.current), ws(f, f.current, b, u), me = g, ju(0, false), bt && typeof bt.onPostCommitFiberRoot == "function") try {
        bt.onPostCommitFiberRoot(eu, f);
      } catch {
      }
      return true;
    } finally {
      G.p = r, C.T = l, Hs(e, t);
    }
  }
  function Gs(e, t, u) {
    t = Tt(u, t), t = er(e.stateNode, t, 2), e = An(e, t, 2), e !== null && (nu(e, 2), Jt(e));
  }
  function he(e, t, u) {
    if (e.tag === 3) Gs(e, e, u);
    else for (; t !== null; ) {
      if (t.tag === 3) {
        Gs(t, e, u);
        break;
      } else if (t.tag === 1) {
        var l = t.stateNode;
        if (typeof t.type.getDerivedStateFromError == "function" || typeof l.componentDidCatch == "function" && (Mn === null || !Mn.has(l))) {
          e = Tt(u, e), u = Yo(2), l = An(t, u, 2), l !== null && (Vo(u, l, t, e), nu(l, 2), Jt(l));
          break;
        }
      }
      t = t.return;
    }
  }
  function Er(e, t, u) {
    var l = e.pingCache;
    if (l === null) {
      l = e.pingCache = new W0();
      var r = /* @__PURE__ */ new Set();
      l.set(t, r);
    } else r = l.get(t), r === void 0 && (r = /* @__PURE__ */ new Set(), l.set(t, r));
    r.has(u) || (wr = true, r.add(u), e = eg.bind(null, e, t, u), t.then(e, e));
  }
  function eg(e, t, u) {
    var l = e.pingCache;
    l !== null && l.delete(t), e.pingedLanes |= e.suspendedLanes & u, e.warmLanes &= ~u, Ee === e && (re & u) === u && (Re === 4 || Re === 3 && (re & 62914560) === re && 300 > st() - ec ? (me & 2) === 0 && Qa(e, 0) : yr |= u, Va === re && (Va = 0)), Jt(e);
  }
  function Ys(e, t) {
    t === 0 && (t = Bf()), e = In(e, t), e !== null && (nu(e, t), Jt(e));
  }
  function tg(e) {
    var t = e.memoizedState, u = 0;
    t !== null && (u = t.retryLane), Ys(e, u);
  }
  function ng(e, t) {
    var u = 0;
    switch (e.tag) {
      case 31:
      case 13:
        var l = e.stateNode, r = e.memoizedState;
        r !== null && (u = r.retryLane);
        break;
      case 19:
        l = e.stateNode;
        break;
      case 22:
        l = e.stateNode._retryCache;
        break;
      default:
        throw Error(a(314));
    }
    l !== null && l.delete(t), Ys(e, u);
  }
  function ag(e, t) {
    return Hc(e, t);
  }
  var ic = null, Ka = null, Tr = false, rc = false, zr = false, Un = 0;
  function Jt(e) {
    e !== Ka && e.next === null && (Ka === null ? ic = Ka = e : Ka = Ka.next = e), rc = true, Tr || (Tr = true, lg());
  }
  function ju(e, t) {
    if (!zr && rc) {
      zr = true;
      do
        for (var u = false, l = ic; l !== null; ) {
          if (e !== 0) {
            var r = l.pendingLanes;
            if (r === 0) var f = 0;
            else {
              var b = l.suspendedLanes, g = l.pingedLanes;
              f = (1 << 31 - dt(42 | e) + 1) - 1, f &= r & ~(b & ~g), f = f & 201326741 ? f & 201326741 | 1 : f ? f | 2 : 0;
            }
            f !== 0 && (u = true, Zs(l, f));
          } else f = re, f = sl(l, l === Ee ? f : 0, l.cancelPendingCommit !== null || l.timeoutHandle !== -1), (f & 3) === 0 || tu(l, f) || (u = true, Zs(l, f));
          l = l.next;
        }
      while (u);
      zr = false;
    }
  }
  function ug() {
    Vs();
  }
  function Vs() {
    rc = Tr = false;
    var e = 0;
    Un !== 0 && gg() && (e = Un);
    for (var t = st(), u = null, l = ic; l !== null; ) {
      var r = l.next, f = Xs(l, t);
      f === 0 ? (l.next = null, u === null ? ic = r : u.next = r, r === null && (Ka = u)) : (u = l, (e !== 0 || (f & 3) !== 0) && (rc = true)), l = r;
    }
    Xe !== 0 && Xe !== 5 || ju(e), Un !== 0 && (Un = 0);
  }
  function Xs(e, t) {
    for (var u = e.suspendedLanes, l = e.pingedLanes, r = e.expirationTimes, f = e.pendingLanes & -62914561; 0 < f; ) {
      var b = 31 - dt(f), g = 1 << b, w = r[b];
      w === -1 ? ((g & u) === 0 || (g & l) !== 0) && (r[b] = Cd(g, t)) : w <= t && (e.expiredLanes |= g), f &= ~g;
    }
    if (t = Ee, u = re, u = sl(e, e === t ? u : 0, e.cancelPendingCommit !== null || e.timeoutHandle !== -1), l = e.callbackNode, u === 0 || e === t && (ye === 2 || ye === 9) || e.cancelPendingCommit !== null) return l !== null && l !== null && Lc(l), e.callbackNode = null, e.callbackPriority = 0;
    if ((u & 3) === 0 || tu(e, u)) {
      if (t = u & -u, t === e.callbackPriority) return t;
      switch (l !== null && Lc(l), Vc(u)) {
        case 2:
        case 8:
          u = Rf;
          break;
        case 32:
          u = rl;
          break;
        case 268435456:
          u = Uf;
          break;
        default:
          u = rl;
      }
      return l = Qs.bind(null, e), u = Hc(u, l), e.callbackPriority = t, e.callbackNode = u, t;
    }
    return l !== null && l !== null && Lc(l), e.callbackPriority = 2, e.callbackNode = null, 2;
  }
  function Qs(e, t) {
    if (Xe !== 0 && Xe !== 5) return e.callbackNode = null, e.callbackPriority = 0, null;
    var u = e.callbackNode;
    if (cc() && e.callbackNode !== u) return null;
    var l = re;
    return l = sl(e, e === Ee ? l : 0, e.cancelPendingCommit !== null || e.timeoutHandle !== -1), l === 0 ? null : (Es(e, l, t), Xs(e, st()), e.callbackNode != null && e.callbackNode === u ? Qs.bind(null, e) : null);
  }
  function Zs(e, t) {
    if (cc()) return null;
    Es(e, t, true);
  }
  function lg() {
    wg(function() {
      (me & 6) !== 0 ? Hc(Cf, ug) : Vs();
    });
  }
  function Or() {
    if (Un === 0) {
      var e = Ca;
      e === 0 && (e = fl, fl <<= 1, (fl & 261888) === 0 && (fl = 256)), Un = e;
    }
    return Un;
  }
  function Ks(e) {
    return e == null || typeof e == "symbol" || typeof e == "boolean" ? null : typeof e == "function" ? e : ml("" + e);
  }
  function Js(e, t) {
    var u = t.ownerDocument.createElement("input");
    return u.name = t.name, u.value = t.value, e.id && u.setAttribute("form", e.id), t.parentNode.insertBefore(u, t), e = new FormData(e), u.parentNode.removeChild(u), e;
  }
  function cg(e, t, u, l, r) {
    if (t === "submit" && u && u.stateNode === r) {
      var f = Ks((r[ut] || null).action), b = l.submitter;
      b && (t = (t = b[ut] || null) ? Ks(t.formAction) : b.getAttribute("formAction"), t !== null && (f = t, b = null));
      var g = new pl("action", "action", null, l, r);
      e.push({ event: g, listeners: [{ instance: null, listener: function() {
        if (l.defaultPrevented) {
          if (Un !== 0) {
            var w = b ? Js(r, b) : new FormData(r);
            ki(u, { pending: true, data: w, method: r.method, action: f }, null, w);
          }
        } else typeof f == "function" && (g.preventDefault(), w = b ? Js(r, b) : new FormData(r), ki(u, { pending: true, data: w, method: r.method, action: f }, f, w));
      }, currentTarget: r }] });
    }
  }
  for (var Dr = 0; Dr < oi.length; Dr++) {
    var Mr = oi[Dr], ig = Mr.toLowerCase(), rg = Mr[0].toUpperCase() + Mr.slice(1);
    qt(ig, "on" + rg);
  }
  qt(x_, "onAnimationEnd"), qt(A_, "onAnimationIteration"), qt(E_, "onAnimationStart"), qt("dblclick", "onDoubleClick"), qt("focusin", "onFocus"), qt("focusout", "onBlur"), qt(A0, "onTransitionRun"), qt(E0, "onTransitionStart"), qt(T0, "onTransitionCancel"), qt(T_, "onTransitionEnd"), wa("onMouseEnter", ["mouseout", "mouseover"]), wa("onMouseLeave", ["mouseout", "mouseover"]), wa("onPointerEnter", ["pointerout", "pointerover"]), wa("onPointerLeave", ["pointerout", "pointerover"]), Kn("onChange", "change click focusin focusout input keydown keyup selectionchange".split(" ")), Kn("onSelect", "focusout contextmenu dragend focusin keydown keyup mousedown mouseup selectionchange".split(" ")), Kn("onBeforeInput", ["compositionend", "keypress", "textInput", "paste"]), Kn("onCompositionEnd", "compositionend focusout keydown keypress keyup mousedown".split(" ")), Kn("onCompositionStart", "compositionstart focusout keydown keypress keyup mousedown".split(" ")), Kn("onCompositionUpdate", "compositionupdate focusout keydown keypress keyup mousedown".split(" "));
  var qu = "abort canplay canplaythrough durationchange emptied encrypted ended error loadeddata loadedmetadata loadstart pause play playing progress ratechange resize seeked seeking stalled suspend timeupdate volumechange waiting".split(" "), fg = new Set("beforetoggle cancel close invalid load scroll scrollend toggle".split(" ").concat(qu));
  function ks(e, t) {
    t = (t & 4) !== 0;
    for (var u = 0; u < e.length; u++) {
      var l = e[u], r = l.event;
      l = l.listeners;
      e: {
        var f = void 0;
        if (t) for (var b = l.length - 1; 0 <= b; b--) {
          var g = l[b], w = g.instance, T = g.currentTarget;
          if (g = g.listener, w !== f && r.isPropagationStopped()) break e;
          f = g, r.currentTarget = T;
          try {
            f(r);
          } catch (M) {
            xl(M);
          }
          r.currentTarget = null, f = w;
        }
        else for (b = 0; b < l.length; b++) {
          if (g = l[b], w = g.instance, T = g.currentTarget, g = g.listener, w !== f && r.isPropagationStopped()) break e;
          f = g, r.currentTarget = T;
          try {
            f(r);
          } catch (M) {
            xl(M);
          }
          r.currentTarget = null, f = w;
        }
      }
    }
  }
  function ce(e, t) {
    var u = t[Xc];
    u === void 0 && (u = t[Xc] = /* @__PURE__ */ new Set());
    var l = e + "__bubble";
    u.has(l) || (Ws(t, e, 2, false), u.add(l));
  }
  function Cr(e, t, u) {
    var l = 0;
    t && (l |= 4), Ws(u, e, l, t);
  }
  var fc = "_reactListening" + Math.random().toString(36).slice(2);
  function Rr(e) {
    if (!e[fc]) {
      e[fc] = true, Yf.forEach(function(u) {
        u !== "selectionchange" && (fg.has(u) || Cr(u, false, e), Cr(u, true, e));
      });
      var t = e.nodeType === 9 ? e : e.ownerDocument;
      t === null || t[fc] || (t[fc] = true, Cr("selectionchange", false, t));
    }
  }
  function Ws(e, t, u, l) {
    switch (Ab(t)) {
      case 2:
        var r = qg;
        break;
      case 8:
        r = Hg;
        break;
      default:
        r = Jr;
    }
    u = r.bind(null, t, u, e), r = void 0, !$c || t !== "touchstart" && t !== "touchmove" && t !== "wheel" || (r = true), l ? r !== void 0 ? e.addEventListener(t, u, { capture: true, passive: r }) : e.addEventListener(t, u, true) : r !== void 0 ? e.addEventListener(t, u, { passive: r }) : e.addEventListener(t, u, false);
  }
  function Ur(e, t, u, l, r) {
    var f = l;
    if ((t & 1) === 0 && (t & 2) === 0 && l !== null) e: for (; ; ) {
      if (l === null) return;
      var b = l.tag;
      if (b === 3 || b === 4) {
        var g = l.stateNode.containerInfo;
        if (g === r) break;
        if (b === 4) for (b = l.return; b !== null; ) {
          var w = b.tag;
          if ((w === 3 || w === 4) && b.stateNode.containerInfo === r) return;
          b = b.return;
        }
        for (; g !== null; ) {
          if (b = da(g), b === null) return;
          if (w = b.tag, w === 5 || w === 6 || w === 26 || w === 27) {
            l = f = b;
            continue e;
          }
          g = g.parentNode;
        }
      }
      l = l.return;
    }
    Pf(function() {
      var T = f, M = Ic(u), N = [];
      e: {
        var z = z_.get(e);
        if (z !== void 0) {
          var D = pl, Q = e;
          switch (e) {
            case "keypress":
              if (yl(u) === 0) break e;
            case "keydown":
            case "keyup":
              D = n0;
              break;
            case "focusin":
              Q = "focus", D = ni;
              break;
            case "focusout":
              Q = "blur", D = ni;
              break;
            case "beforeblur":
            case "afterblur":
              D = ni;
              break;
            case "click":
              if (u.button === 2) break e;
            case "auxclick":
            case "dblclick":
            case "mousedown":
            case "mousemove":
            case "mouseup":
            case "mouseout":
            case "mouseover":
            case "contextmenu":
              D = n_;
              break;
            case "drag":
            case "dragend":
            case "dragenter":
            case "dragexit":
            case "dragleave":
            case "dragover":
            case "dragstart":
            case "drop":
              D = Qd;
              break;
            case "touchcancel":
            case "touchend":
            case "touchmove":
            case "touchstart":
              D = l0;
              break;
            case x_:
            case A_:
            case E_:
              D = Jd;
              break;
            case T_:
              D = i0;
              break;
            case "scroll":
            case "scrollend":
              D = Vd;
              break;
            case "wheel":
              D = f0;
              break;
            case "copy":
            case "cut":
            case "paste":
              D = Wd;
              break;
            case "gotpointercapture":
            case "lostpointercapture":
            case "pointercancel":
            case "pointerdown":
            case "pointermove":
            case "pointerout":
            case "pointerover":
            case "pointerup":
              D = u_;
              break;
            case "toggle":
            case "beforetoggle":
              D = o0;
          }
          var W = (t & 4) !== 0, xe = !W && (e === "scroll" || e === "scrollend"), A = W ? z !== null ? z + "Capture" : null : z;
          W = [];
          for (var v = T, E; v !== null; ) {
            var U = v;
            if (E = U.stateNode, U = U.tag, U !== 5 && U !== 26 && U !== 27 || E === null || A === null || (U = lu(v, A), U != null && W.push(Hu(v, U, E))), xe) break;
            v = v.return;
          }
          0 < W.length && (z = new D(z, Q, null, u, M), N.push({ event: z, listeners: W }));
        }
      }
      if ((t & 7) === 0) {
        e: {
          if (z = e === "mouseover" || e === "pointerover", D = e === "mouseout" || e === "pointerout", z && u !== Wc && (Q = u.relatedTarget || u.fromElement) && (da(Q) || Q[ba])) break e;
          if ((D || z) && (z = M.window === M ? M : (z = M.ownerDocument) ? z.defaultView || z.parentWindow : window, D ? (Q = u.relatedTarget || u.toElement, D = T, Q = Q ? da(Q) : null, Q !== null && (xe = _(Q), W = Q.tag, Q !== xe || W !== 5 && W !== 27 && W !== 6) && (Q = null)) : (D = null, Q = T), D !== Q)) {
            if (W = n_, U = "onMouseLeave", A = "onMouseEnter", v = "mouse", (e === "pointerout" || e === "pointerover") && (W = u_, U = "onPointerLeave", A = "onPointerEnter", v = "pointer"), xe = D == null ? z : uu(D), E = Q == null ? z : uu(Q), z = new W(U, v + "leave", D, u, M), z.target = xe, z.relatedTarget = E, U = null, da(M) === T && (W = new W(A, v + "enter", Q, u, M), W.target = E, W.relatedTarget = xe, U = W), xe = U, D && Q) t: {
              for (W = _g, A = D, v = Q, E = 0, U = A; U; U = W(U)) E++;
              U = 0;
              for (var k = v; k; k = W(k)) U++;
              for (; 0 < E - U; ) A = W(A), E--;
              for (; 0 < U - E; ) v = W(v), U--;
              for (; E--; ) {
                if (A === v || v !== null && A === v.alternate) {
                  W = A;
                  break t;
                }
                A = W(A), v = W(v);
              }
              W = null;
            }
            else W = null;
            D !== null && Is(N, z, D, W, false), Q !== null && xe !== null && Is(N, xe, Q, W, true);
          }
        }
        e: {
          if (z = T ? uu(T) : window, D = z.nodeName && z.nodeName.toLowerCase(), D === "select" || D === "input" && z.type === "file") var de = s_;
          else if (__(z)) if (b_) de = v0;
          else {
            de = h0;
            var K = y0;
          }
          else D = z.nodeName, !D || D.toLowerCase() !== "input" || z.type !== "checkbox" && z.type !== "radio" ? T && kc(T.elementType) && (de = s_) : de = p0;
          if (de && (de = de(e, T))) {
            o_(N, de, u, M);
            break e;
          }
          K && K(e, z, T), e === "focusout" && T && z.type === "number" && T.memoizedProps.value != null && Jc(z, "number", z.value);
        }
        switch (K = T ? uu(T) : window, e) {
          case "focusin":
            (__(K) || K.contentEditable === "true") && (xa = K, ri = T, bu = null);
            break;
          case "focusout":
            bu = ri = xa = null;
            break;
          case "mousedown":
            fi = true;
            break;
          case "contextmenu":
          case "mouseup":
          case "dragend":
            fi = false, v_(N, u, M);
            break;
          case "selectionchange":
            if (x0) break;
          case "keydown":
          case "keyup":
            v_(N, u, M);
        }
        var te;
        if (ui) e: {
          switch (e) {
            case "compositionstart":
              var fe = "onCompositionStart";
              break e;
            case "compositionend":
              fe = "onCompositionEnd";
              break e;
            case "compositionupdate":
              fe = "onCompositionUpdate";
              break e;
          }
          fe = void 0;
        }
        else Sa ? r_(e, u) && (fe = "onCompositionEnd") : e === "keydown" && u.keyCode === 229 && (fe = "onCompositionStart");
        fe && (l_ && u.locale !== "ko" && (Sa || fe !== "onCompositionStart" ? fe === "onCompositionEnd" && Sa && (te = e_()) : (wn = M, Pc = "value" in wn ? wn.value : wn.textContent, Sa = true)), K = _c(T, fe), 0 < K.length && (fe = new a_(fe, e, null, u, M), N.push({ event: fe, listeners: K }), te ? fe.data = te : (te = f_(u), te !== null && (fe.data = te)))), (te = b0 ? d0(e, u) : g0(e, u)) && (fe = _c(T, "onBeforeInput"), 0 < fe.length && (K = new a_("onBeforeInput", "beforeinput", null, u, M), N.push({ event: K, listeners: fe }), K.data = te)), cg(N, e, T, u, M);
      }
      ks(N, t);
    });
  }
  function Hu(e, t, u) {
    return { instance: e, listener: t, currentTarget: u };
  }
  function _c(e, t) {
    for (var u = t + "Capture", l = []; e !== null; ) {
      var r = e, f = r.stateNode;
      if (r = r.tag, r !== 5 && r !== 26 && r !== 27 || f === null || (r = lu(e, u), r != null && l.unshift(Hu(e, r, f)), r = lu(e, t), r != null && l.push(Hu(e, r, f))), e.tag === 3) return l;
      e = e.return;
    }
    return [];
  }
  function _g(e) {
    if (e === null) return null;
    do
      e = e.return;
    while (e && e.tag !== 5 && e.tag !== 27);
    return e || null;
  }
  function Is(e, t, u, l, r) {
    for (var f = t._reactName, b = []; u !== null && u !== l; ) {
      var g = u, w = g.alternate, T = g.stateNode;
      if (g = g.tag, w !== null && w === l) break;
      g !== 5 && g !== 26 && g !== 27 || T === null || (w = T, r ? (T = lu(u, f), T != null && b.unshift(Hu(u, T, w))) : r || (T = lu(u, f), T != null && b.push(Hu(u, T, w)))), u = u.return;
    }
    b.length !== 0 && e.push({ event: t, listeners: b });
  }
  var og = /\r\n?/g, sg = /\u0000|\uFFFD/g;
  function Fs(e) {
    return (typeof e == "string" ? e : "" + e).replace(og, `
`).replace(sg, "");
  }
  function $s(e, t) {
    return t = Fs(t), Fs(e) === t;
  }
  function Se(e, t, u, l, r, f) {
    switch (u) {
      case "children":
        typeof l == "string" ? t === "body" || t === "textarea" && l === "" || ha(e, l) : (typeof l == "number" || typeof l == "bigint") && t !== "body" && ha(e, "" + l);
        break;
      case "className":
        dl(e, "class", l);
        break;
      case "tabIndex":
        dl(e, "tabindex", l);
        break;
      case "dir":
      case "role":
      case "viewBox":
      case "width":
      case "height":
        dl(e, u, l);
        break;
      case "style":
        Ff(e, l, f);
        break;
      case "data":
        if (t !== "object") {
          dl(e, "data", l);
          break;
        }
      case "src":
      case "href":
        if (l === "" && (t !== "a" || u !== "href")) {
          e.removeAttribute(u);
          break;
        }
        if (l == null || typeof l == "function" || typeof l == "symbol" || typeof l == "boolean") {
          e.removeAttribute(u);
          break;
        }
        l = ml("" + l), e.setAttribute(u, l);
        break;
      case "action":
      case "formAction":
        if (typeof l == "function") {
          e.setAttribute(u, "javascript:throw new Error('A React form was unexpectedly submitted. If you called form.submit() manually, consider using form.requestSubmit() instead. If you\\'re trying to use event.stopPropagation() in a submit event handler, consider also calling event.preventDefault().')");
          break;
        } else typeof f == "function" && (u === "formAction" ? (t !== "input" && Se(e, t, "name", r.name, r, null), Se(e, t, "formEncType", r.formEncType, r, null), Se(e, t, "formMethod", r.formMethod, r, null), Se(e, t, "formTarget", r.formTarget, r, null)) : (Se(e, t, "encType", r.encType, r, null), Se(e, t, "method", r.method, r, null), Se(e, t, "target", r.target, r, null)));
        if (l == null || typeof l == "symbol" || typeof l == "boolean") {
          e.removeAttribute(u);
          break;
        }
        l = ml("" + l), e.setAttribute(u, l);
        break;
      case "onClick":
        l != null && (e.onclick = It);
        break;
      case "onScroll":
        l != null && ce("scroll", e);
        break;
      case "onScrollEnd":
        l != null && ce("scrollend", e);
        break;
      case "dangerouslySetInnerHTML":
        if (l != null) {
          if (typeof l != "object" || !("__html" in l)) throw Error(a(61));
          if (u = l.__html, u != null) {
            if (r.children != null) throw Error(a(60));
            e.innerHTML = u;
          }
        }
        break;
      case "multiple":
        e.multiple = l && typeof l != "function" && typeof l != "symbol";
        break;
      case "muted":
        e.muted = l && typeof l != "function" && typeof l != "symbol";
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
        if (l == null || typeof l == "function" || typeof l == "boolean" || typeof l == "symbol") {
          e.removeAttribute("xlink:href");
          break;
        }
        u = ml("" + l), e.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", u);
        break;
      case "contentEditable":
      case "spellCheck":
      case "draggable":
      case "value":
      case "autoReverse":
      case "externalResourcesRequired":
      case "focusable":
      case "preserveAlpha":
        l != null && typeof l != "function" && typeof l != "symbol" ? e.setAttribute(u, "" + l) : e.removeAttribute(u);
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
        l && typeof l != "function" && typeof l != "symbol" ? e.setAttribute(u, "") : e.removeAttribute(u);
        break;
      case "capture":
      case "download":
        l === true ? e.setAttribute(u, "") : l !== false && l != null && typeof l != "function" && typeof l != "symbol" ? e.setAttribute(u, l) : e.removeAttribute(u);
        break;
      case "cols":
      case "rows":
      case "size":
      case "span":
        l != null && typeof l != "function" && typeof l != "symbol" && !isNaN(l) && 1 <= l ? e.setAttribute(u, l) : e.removeAttribute(u);
        break;
      case "rowSpan":
      case "start":
        l == null || typeof l == "function" || typeof l == "symbol" || isNaN(l) ? e.removeAttribute(u) : e.setAttribute(u, l);
        break;
      case "popover":
        ce("beforetoggle", e), ce("toggle", e), bl(e, "popover", l);
        break;
      case "xlinkActuate":
        Wt(e, "http://www.w3.org/1999/xlink", "xlink:actuate", l);
        break;
      case "xlinkArcrole":
        Wt(e, "http://www.w3.org/1999/xlink", "xlink:arcrole", l);
        break;
      case "xlinkRole":
        Wt(e, "http://www.w3.org/1999/xlink", "xlink:role", l);
        break;
      case "xlinkShow":
        Wt(e, "http://www.w3.org/1999/xlink", "xlink:show", l);
        break;
      case "xlinkTitle":
        Wt(e, "http://www.w3.org/1999/xlink", "xlink:title", l);
        break;
      case "xlinkType":
        Wt(e, "http://www.w3.org/1999/xlink", "xlink:type", l);
        break;
      case "xmlBase":
        Wt(e, "http://www.w3.org/XML/1998/namespace", "xml:base", l);
        break;
      case "xmlLang":
        Wt(e, "http://www.w3.org/XML/1998/namespace", "xml:lang", l);
        break;
      case "xmlSpace":
        Wt(e, "http://www.w3.org/XML/1998/namespace", "xml:space", l);
        break;
      case "is":
        bl(e, "is", l);
        break;
      case "innerText":
      case "textContent":
        break;
      default:
        (!(2 < u.length) || u[0] !== "o" && u[0] !== "O" || u[1] !== "n" && u[1] !== "N") && (u = Gd.get(u) || u, bl(e, u, l));
    }
  }
  function Br(e, t, u, l, r, f) {
    switch (u) {
      case "style":
        Ff(e, l, f);
        break;
      case "dangerouslySetInnerHTML":
        if (l != null) {
          if (typeof l != "object" || !("__html" in l)) throw Error(a(61));
          if (u = l.__html, u != null) {
            if (r.children != null) throw Error(a(60));
            e.innerHTML = u;
          }
        }
        break;
      case "children":
        typeof l == "string" ? ha(e, l) : (typeof l == "number" || typeof l == "bigint") && ha(e, "" + l);
        break;
      case "onScroll":
        l != null && ce("scroll", e);
        break;
      case "onScrollEnd":
        l != null && ce("scrollend", e);
        break;
      case "onClick":
        l != null && (e.onclick = It);
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
        if (!Vf.hasOwnProperty(u)) e: {
          if (u[0] === "o" && u[1] === "n" && (r = u.endsWith("Capture"), t = u.slice(2, r ? u.length - 7 : void 0), f = e[ut] || null, f = f != null ? f[u] : null, typeof f == "function" && e.removeEventListener(t, f, r), typeof l == "function")) {
            typeof f != "function" && f !== null && (u in e ? e[u] = null : e.hasAttribute(u) && e.removeAttribute(u)), e.addEventListener(t, l, r);
            break e;
          }
          u in e ? e[u] = l : l === true ? e.setAttribute(u, "") : bl(e, u, l);
        }
    }
  }
  function Fe(e, t, u) {
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
        ce("error", e), ce("load", e);
        var l = false, r = false, f;
        for (f in u) if (u.hasOwnProperty(f)) {
          var b = u[f];
          if (b != null) switch (f) {
            case "src":
              l = true;
              break;
            case "srcSet":
              r = true;
              break;
            case "children":
            case "dangerouslySetInnerHTML":
              throw Error(a(137, t));
            default:
              Se(e, t, f, b, u, null);
          }
        }
        r && Se(e, t, "srcSet", u.srcSet, u, null), l && Se(e, t, "src", u.src, u, null);
        return;
      case "input":
        ce("invalid", e);
        var g = f = b = r = null, w = null, T = null;
        for (l in u) if (u.hasOwnProperty(l)) {
          var M = u[l];
          if (M != null) switch (l) {
            case "name":
              r = M;
              break;
            case "type":
              b = M;
              break;
            case "checked":
              w = M;
              break;
            case "defaultChecked":
              T = M;
              break;
            case "value":
              f = M;
              break;
            case "defaultValue":
              g = M;
              break;
            case "children":
            case "dangerouslySetInnerHTML":
              if (M != null) throw Error(a(137, t));
              break;
            default:
              Se(e, t, l, M, u, null);
          }
        }
        Jf(e, f, g, w, T, b, r, false);
        return;
      case "select":
        ce("invalid", e), l = b = f = null;
        for (r in u) if (u.hasOwnProperty(r) && (g = u[r], g != null)) switch (r) {
          case "value":
            f = g;
            break;
          case "defaultValue":
            b = g;
            break;
          case "multiple":
            l = g;
          default:
            Se(e, t, r, g, u, null);
        }
        t = f, u = b, e.multiple = !!l, t != null ? ya(e, !!l, t, false) : u != null && ya(e, !!l, u, true);
        return;
      case "textarea":
        ce("invalid", e), f = r = l = null;
        for (b in u) if (u.hasOwnProperty(b) && (g = u[b], g != null)) switch (b) {
          case "value":
            l = g;
            break;
          case "defaultValue":
            r = g;
            break;
          case "children":
            f = g;
            break;
          case "dangerouslySetInnerHTML":
            if (g != null) throw Error(a(91));
            break;
          default:
            Se(e, t, b, g, u, null);
        }
        Wf(e, l, r, f);
        return;
      case "option":
        for (w in u) if (u.hasOwnProperty(w) && (l = u[w], l != null)) switch (w) {
          case "selected":
            e.selected = l && typeof l != "function" && typeof l != "symbol";
            break;
          default:
            Se(e, t, w, l, u, null);
        }
        return;
      case "dialog":
        ce("beforetoggle", e), ce("toggle", e), ce("cancel", e), ce("close", e);
        break;
      case "iframe":
      case "object":
        ce("load", e);
        break;
      case "video":
      case "audio":
        for (l = 0; l < qu.length; l++) ce(qu[l], e);
        break;
      case "image":
        ce("error", e), ce("load", e);
        break;
      case "details":
        ce("toggle", e);
        break;
      case "embed":
      case "source":
      case "link":
        ce("error", e), ce("load", e);
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
        for (T in u) if (u.hasOwnProperty(T) && (l = u[T], l != null)) switch (T) {
          case "children":
          case "dangerouslySetInnerHTML":
            throw Error(a(137, t));
          default:
            Se(e, t, T, l, u, null);
        }
        return;
      default:
        if (kc(t)) {
          for (M in u) u.hasOwnProperty(M) && (l = u[M], l !== void 0 && Br(e, t, M, l, u, void 0));
          return;
        }
    }
    for (g in u) u.hasOwnProperty(g) && (l = u[g], l != null && Se(e, t, g, l, u, null));
  }
  function bg(e, t, u, l) {
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
        var r = null, f = null, b = null, g = null, w = null, T = null, M = null;
        for (D in u) {
          var N = u[D];
          if (u.hasOwnProperty(D) && N != null) switch (D) {
            case "checked":
              break;
            case "value":
              break;
            case "defaultValue":
              w = N;
            default:
              l.hasOwnProperty(D) || Se(e, t, D, null, l, N);
          }
        }
        for (var z in l) {
          var D = l[z];
          if (N = u[z], l.hasOwnProperty(z) && (D != null || N != null)) switch (z) {
            case "type":
              f = D;
              break;
            case "name":
              r = D;
              break;
            case "checked":
              T = D;
              break;
            case "defaultChecked":
              M = D;
              break;
            case "value":
              b = D;
              break;
            case "defaultValue":
              g = D;
              break;
            case "children":
            case "dangerouslySetInnerHTML":
              if (D != null) throw Error(a(137, t));
              break;
            default:
              D !== N && Se(e, t, z, D, l, N);
          }
        }
        Kc(e, b, g, w, T, M, f, r);
        return;
      case "select":
        D = b = g = z = null;
        for (f in u) if (w = u[f], u.hasOwnProperty(f) && w != null) switch (f) {
          case "value":
            break;
          case "multiple":
            D = w;
          default:
            l.hasOwnProperty(f) || Se(e, t, f, null, l, w);
        }
        for (r in l) if (f = l[r], w = u[r], l.hasOwnProperty(r) && (f != null || w != null)) switch (r) {
          case "value":
            z = f;
            break;
          case "defaultValue":
            g = f;
            break;
          case "multiple":
            b = f;
          default:
            f !== w && Se(e, t, r, f, l, w);
        }
        t = g, u = b, l = D, z != null ? ya(e, !!u, z, false) : !!l != !!u && (t != null ? ya(e, !!u, t, true) : ya(e, !!u, u ? [] : "", false));
        return;
      case "textarea":
        D = z = null;
        for (g in u) if (r = u[g], u.hasOwnProperty(g) && r != null && !l.hasOwnProperty(g)) switch (g) {
          case "value":
            break;
          case "children":
            break;
          default:
            Se(e, t, g, null, l, r);
        }
        for (b in l) if (r = l[b], f = u[b], l.hasOwnProperty(b) && (r != null || f != null)) switch (b) {
          case "value":
            z = r;
            break;
          case "defaultValue":
            D = r;
            break;
          case "children":
            break;
          case "dangerouslySetInnerHTML":
            if (r != null) throw Error(a(91));
            break;
          default:
            r !== f && Se(e, t, b, r, l, f);
        }
        kf(e, z, D);
        return;
      case "option":
        for (var Q in u) if (z = u[Q], u.hasOwnProperty(Q) && z != null && !l.hasOwnProperty(Q)) switch (Q) {
          case "selected":
            e.selected = false;
            break;
          default:
            Se(e, t, Q, null, l, z);
        }
        for (w in l) if (z = l[w], D = u[w], l.hasOwnProperty(w) && z !== D && (z != null || D != null)) switch (w) {
          case "selected":
            e.selected = z && typeof z != "function" && typeof z != "symbol";
            break;
          default:
            Se(e, t, w, z, l, D);
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
        for (var W in u) z = u[W], u.hasOwnProperty(W) && z != null && !l.hasOwnProperty(W) && Se(e, t, W, null, l, z);
        for (T in l) if (z = l[T], D = u[T], l.hasOwnProperty(T) && z !== D && (z != null || D != null)) switch (T) {
          case "children":
          case "dangerouslySetInnerHTML":
            if (z != null) throw Error(a(137, t));
            break;
          default:
            Se(e, t, T, z, l, D);
        }
        return;
      default:
        if (kc(t)) {
          for (var xe in u) z = u[xe], u.hasOwnProperty(xe) && z !== void 0 && !l.hasOwnProperty(xe) && Br(e, t, xe, void 0, l, z);
          for (M in l) z = l[M], D = u[M], !l.hasOwnProperty(M) || z === D || z === void 0 && D === void 0 || Br(e, t, M, z, l, D);
          return;
        }
    }
    for (var A in u) z = u[A], u.hasOwnProperty(A) && z != null && !l.hasOwnProperty(A) && Se(e, t, A, null, l, z);
    for (N in l) z = l[N], D = u[N], !l.hasOwnProperty(N) || z === D || z == null && D == null || Se(e, t, N, z, l, D);
  }
  function Ps(e) {
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
  function dg() {
    if (typeof performance.getEntriesByType == "function") {
      for (var e = 0, t = 0, u = performance.getEntriesByType("resource"), l = 0; l < u.length; l++) {
        var r = u[l], f = r.transferSize, b = r.initiatorType, g = r.duration;
        if (f && g && Ps(b)) {
          for (b = 0, g = r.responseEnd, l += 1; l < u.length; l++) {
            var w = u[l], T = w.startTime;
            if (T > g) break;
            var M = w.transferSize, N = w.initiatorType;
            M && Ps(N) && (w = w.responseEnd, b += M * (w < g ? 1 : (g - T) / (w - T)));
          }
          if (--l, t += 8 * (f + b) / (r.duration / 1e3), e++, 10 < e) break;
        }
      }
      if (0 < e) return t / e / 1e6;
    }
    return navigator.connection && (e = navigator.connection.downlink, typeof e == "number") ? e : 5;
  }
  var Nr = null, jr = null;
  function oc(e) {
    return e.nodeType === 9 ? e : e.ownerDocument;
  }
  function eb(e) {
    switch (e) {
      case "http://www.w3.org/2000/svg":
        return 1;
      case "http://www.w3.org/1998/Math/MathML":
        return 2;
      default:
        return 0;
    }
  }
  function tb(e, t) {
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
  function qr(e, t) {
    return e === "textarea" || e === "noscript" || typeof t.children == "string" || typeof t.children == "number" || typeof t.children == "bigint" || typeof t.dangerouslySetInnerHTML == "object" && t.dangerouslySetInnerHTML !== null && t.dangerouslySetInnerHTML.__html != null;
  }
  var Hr = null;
  function gg() {
    var e = window.event;
    return e && e.type === "popstate" ? e === Hr ? false : (Hr = e, true) : (Hr = null, false);
  }
  var nb = typeof setTimeout == "function" ? setTimeout : void 0, mg = typeof clearTimeout == "function" ? clearTimeout : void 0, ab = typeof Promise == "function" ? Promise : void 0, wg = typeof queueMicrotask == "function" ? queueMicrotask : typeof ab < "u" ? function(e) {
    return ab.resolve(null).then(e).catch(yg);
  } : nb;
  function yg(e) {
    setTimeout(function() {
      throw e;
    });
  }
  function Bn(e) {
    return e === "head";
  }
  function ub(e, t) {
    var u = t, l = 0;
    do {
      var r = u.nextSibling;
      if (e.removeChild(u), r && r.nodeType === 8) if (u = r.data, u === "/$" || u === "/&") {
        if (l === 0) {
          e.removeChild(r), Ia(t);
          return;
        }
        l--;
      } else if (u === "$" || u === "$?" || u === "$~" || u === "$!" || u === "&") l++;
      else if (u === "html") Lu(e.ownerDocument.documentElement);
      else if (u === "head") {
        u = e.ownerDocument.head, Lu(u);
        for (var f = u.firstChild; f; ) {
          var b = f.nextSibling, g = f.nodeName;
          f[au] || g === "SCRIPT" || g === "STYLE" || g === "LINK" && f.rel.toLowerCase() === "stylesheet" || u.removeChild(f), f = b;
        }
      } else u === "body" && Lu(e.ownerDocument.body);
      u = r;
    } while (u);
    Ia(t);
  }
  function lb(e, t) {
    var u = e;
    e = 0;
    do {
      var l = u.nextSibling;
      if (u.nodeType === 1 ? t ? (u._stashedDisplay = u.style.display, u.style.display = "none") : (u.style.display = u._stashedDisplay || "", u.getAttribute("style") === "" && u.removeAttribute("style")) : u.nodeType === 3 && (t ? (u._stashedText = u.nodeValue, u.nodeValue = "") : u.nodeValue = u._stashedText || ""), l && l.nodeType === 8) if (u = l.data, u === "/$") {
        if (e === 0) break;
        e--;
      } else u !== "$" && u !== "$?" && u !== "$~" && u !== "$!" || e++;
      u = l;
    } while (u);
  }
  function Lr(e) {
    var t = e.firstChild;
    for (t && t.nodeType === 10 && (t = t.nextSibling); t; ) {
      var u = t;
      switch (t = t.nextSibling, u.nodeName) {
        case "HTML":
        case "HEAD":
        case "BODY":
          Lr(u), Qc(u);
          continue;
        case "SCRIPT":
        case "STYLE":
          continue;
        case "LINK":
          if (u.rel.toLowerCase() === "stylesheet") continue;
      }
      e.removeChild(u);
    }
  }
  function hg(e, t, u, l) {
    for (; e.nodeType === 1; ) {
      var r = u;
      if (e.nodeName.toLowerCase() !== t.toLowerCase()) {
        if (!l && (e.nodeName !== "INPUT" || e.type !== "hidden")) break;
      } else if (l) {
        if (!e[au]) switch (t) {
          case "meta":
            if (!e.hasAttribute("itemprop")) break;
            return e;
          case "link":
            if (f = e.getAttribute("rel"), f === "stylesheet" && e.hasAttribute("data-precedence")) break;
            if (f !== r.rel || e.getAttribute("href") !== (r.href == null || r.href === "" ? null : r.href) || e.getAttribute("crossorigin") !== (r.crossOrigin == null ? null : r.crossOrigin) || e.getAttribute("title") !== (r.title == null ? null : r.title)) break;
            return e;
          case "style":
            if (e.hasAttribute("data-precedence")) break;
            return e;
          case "script":
            if (f = e.getAttribute("src"), (f !== (r.src == null ? null : r.src) || e.getAttribute("type") !== (r.type == null ? null : r.type) || e.getAttribute("crossorigin") !== (r.crossOrigin == null ? null : r.crossOrigin)) && f && e.hasAttribute("async") && !e.hasAttribute("itemprop")) break;
            return e;
          default:
            return e;
        }
      } else if (t === "input" && e.type === "hidden") {
        var f = r.name == null ? null : "" + r.name;
        if (r.type === "hidden" && e.getAttribute("name") === f) return e;
      } else return e;
      if (e = Ct(e.nextSibling), e === null) break;
    }
    return null;
  }
  function pg(e, t, u) {
    if (t === "") return null;
    for (; e.nodeType !== 3; ) if ((e.nodeType !== 1 || e.nodeName !== "INPUT" || e.type !== "hidden") && !u || (e = Ct(e.nextSibling), e === null)) return null;
    return e;
  }
  function cb(e, t) {
    for (; e.nodeType !== 8; ) if ((e.nodeType !== 1 || e.nodeName !== "INPUT" || e.type !== "hidden") && !t || (e = Ct(e.nextSibling), e === null)) return null;
    return e;
  }
  function Gr(e) {
    return e.data === "$?" || e.data === "$~";
  }
  function Yr(e) {
    return e.data === "$!" || e.data === "$?" && e.ownerDocument.readyState !== "loading";
  }
  function vg(e, t) {
    var u = e.ownerDocument;
    if (e.data === "$~") e._reactRetry = t;
    else if (e.data !== "$?" || u.readyState !== "loading") t();
    else {
      var l = function() {
        t(), u.removeEventListener("DOMContentLoaded", l);
      };
      u.addEventListener("DOMContentLoaded", l), e._reactRetry = l;
    }
  }
  function Ct(e) {
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
  var Vr = null;
  function ib(e) {
    e = e.nextSibling;
    for (var t = 0; e; ) {
      if (e.nodeType === 8) {
        var u = e.data;
        if (u === "/$" || u === "/&") {
          if (t === 0) return Ct(e.nextSibling);
          t--;
        } else u !== "$" && u !== "$!" && u !== "$?" && u !== "$~" && u !== "&" || t++;
      }
      e = e.nextSibling;
    }
    return null;
  }
  function rb(e) {
    e = e.previousSibling;
    for (var t = 0; e; ) {
      if (e.nodeType === 8) {
        var u = e.data;
        if (u === "$" || u === "$!" || u === "$?" || u === "$~" || u === "&") {
          if (t === 0) return e;
          t--;
        } else u !== "/$" && u !== "/&" || t++;
      }
      e = e.previousSibling;
    }
    return null;
  }
  function fb(e, t, u) {
    switch (t = oc(u), e) {
      case "html":
        if (e = t.documentElement, !e) throw Error(a(452));
        return e;
      case "head":
        if (e = t.head, !e) throw Error(a(453));
        return e;
      case "body":
        if (e = t.body, !e) throw Error(a(454));
        return e;
      default:
        throw Error(a(451));
    }
  }
  function Lu(e) {
    for (var t = e.attributes; t.length; ) e.removeAttributeNode(t[0]);
    Qc(e);
  }
  var Rt = /* @__PURE__ */ new Map(), _b = /* @__PURE__ */ new Set();
  function sc(e) {
    return typeof e.getRootNode == "function" ? e.getRootNode() : e.nodeType === 9 ? e : e.ownerDocument;
  }
  var bn = G.d;
  G.d = { f: Sg, r: xg, D: Ag, C: Eg, L: Tg, m: zg, X: Dg, S: Og, M: Mg };
  function Sg() {
    var e = bn.f(), t = ac();
    return e || t;
  }
  function xg(e) {
    var t = ga(e);
    t !== null && t.tag === 5 && t.type === "form" ? zo(t) : bn.r(e);
  }
  var Ja = typeof document > "u" ? null : document;
  function ob(e, t, u) {
    var l = Ja;
    if (l && typeof t == "string" && t) {
      var r = At(t);
      r = 'link[rel="' + e + '"][href="' + r + '"]', typeof u == "string" && (r += '[crossorigin="' + u + '"]'), _b.has(r) || (_b.add(r), e = { rel: e, crossOrigin: u, href: t }, l.querySelector(r) === null && (t = l.createElement("link"), Fe(t, "link", e), Qe(t), l.head.appendChild(t)));
    }
  }
  function Ag(e) {
    bn.D(e), ob("dns-prefetch", e, null);
  }
  function Eg(e, t) {
    bn.C(e, t), ob("preconnect", e, t);
  }
  function Tg(e, t, u) {
    bn.L(e, t, u);
    var l = Ja;
    if (l && e && t) {
      var r = 'link[rel="preload"][as="' + At(t) + '"]';
      t === "image" && u && u.imageSrcSet ? (r += '[imagesrcset="' + At(u.imageSrcSet) + '"]', typeof u.imageSizes == "string" && (r += '[imagesizes="' + At(u.imageSizes) + '"]')) : r += '[href="' + At(e) + '"]';
      var f = r;
      switch (t) {
        case "style":
          f = ka(e);
          break;
        case "script":
          f = Wa(e);
      }
      Rt.has(f) || (e = R({ rel: "preload", href: t === "image" && u && u.imageSrcSet ? void 0 : e, as: t }, u), Rt.set(f, e), l.querySelector(r) !== null || t === "style" && l.querySelector(Gu(f)) || t === "script" && l.querySelector(Yu(f)) || (t = l.createElement("link"), Fe(t, "link", e), Qe(t), l.head.appendChild(t)));
    }
  }
  function zg(e, t) {
    bn.m(e, t);
    var u = Ja;
    if (u && e) {
      var l = t && typeof t.as == "string" ? t.as : "script", r = 'link[rel="modulepreload"][as="' + At(l) + '"][href="' + At(e) + '"]', f = r;
      switch (l) {
        case "audioworklet":
        case "paintworklet":
        case "serviceworker":
        case "sharedworker":
        case "worker":
        case "script":
          f = Wa(e);
      }
      if (!Rt.has(f) && (e = R({ rel: "modulepreload", href: e }, t), Rt.set(f, e), u.querySelector(r) === null)) {
        switch (l) {
          case "audioworklet":
          case "paintworklet":
          case "serviceworker":
          case "sharedworker":
          case "worker":
          case "script":
            if (u.querySelector(Yu(f))) return;
        }
        l = u.createElement("link"), Fe(l, "link", e), Qe(l), u.head.appendChild(l);
      }
    }
  }
  function Og(e, t, u) {
    bn.S(e, t, u);
    var l = Ja;
    if (l && e) {
      var r = ma(l).hoistableStyles, f = ka(e);
      t = t || "default";
      var b = r.get(f);
      if (!b) {
        var g = { loading: 0, preload: null };
        if (b = l.querySelector(Gu(f))) g.loading = 5;
        else {
          e = R({ rel: "stylesheet", href: e, "data-precedence": t }, u), (u = Rt.get(f)) && Xr(e, u);
          var w = b = l.createElement("link");
          Qe(w), Fe(w, "link", e), w._p = new Promise(function(T, M) {
            w.onload = T, w.onerror = M;
          }), w.addEventListener("load", function() {
            g.loading |= 1;
          }), w.addEventListener("error", function() {
            g.loading |= 2;
          }), g.loading |= 4, bc(b, t, l);
        }
        b = { type: "stylesheet", instance: b, count: 1, state: g }, r.set(f, b);
      }
    }
  }
  function Dg(e, t) {
    bn.X(e, t);
    var u = Ja;
    if (u && e) {
      var l = ma(u).hoistableScripts, r = Wa(e), f = l.get(r);
      f || (f = u.querySelector(Yu(r)), f || (e = R({ src: e, async: true }, t), (t = Rt.get(r)) && Qr(e, t), f = u.createElement("script"), Qe(f), Fe(f, "link", e), u.head.appendChild(f)), f = { type: "script", instance: f, count: 1, state: null }, l.set(r, f));
    }
  }
  function Mg(e, t) {
    bn.M(e, t);
    var u = Ja;
    if (u && e) {
      var l = ma(u).hoistableScripts, r = Wa(e), f = l.get(r);
      f || (f = u.querySelector(Yu(r)), f || (e = R({ src: e, async: true, type: "module" }, t), (t = Rt.get(r)) && Qr(e, t), f = u.createElement("script"), Qe(f), Fe(f, "link", e), u.head.appendChild(f)), f = { type: "script", instance: f, count: 1, state: null }, l.set(r, f));
    }
  }
  function sb(e, t, u, l) {
    var r = (r = ue.current) ? sc(r) : null;
    if (!r) throw Error(a(446));
    switch (e) {
      case "meta":
      case "title":
        return null;
      case "style":
        return typeof u.precedence == "string" && typeof u.href == "string" ? (t = ka(u.href), u = ma(r).hoistableStyles, l = u.get(t), l || (l = { type: "style", instance: null, count: 0, state: null }, u.set(t, l)), l) : { type: "void", instance: null, count: 0, state: null };
      case "link":
        if (u.rel === "stylesheet" && typeof u.href == "string" && typeof u.precedence == "string") {
          e = ka(u.href);
          var f = ma(r).hoistableStyles, b = f.get(e);
          if (b || (r = r.ownerDocument || r, b = { type: "stylesheet", instance: null, count: 0, state: { loading: 0, preload: null } }, f.set(e, b), (f = r.querySelector(Gu(e))) && !f._p && (b.instance = f, b.state.loading = 5), Rt.has(e) || (u = { rel: "preload", as: "style", href: u.href, crossOrigin: u.crossOrigin, integrity: u.integrity, media: u.media, hrefLang: u.hrefLang, referrerPolicy: u.referrerPolicy }, Rt.set(e, u), f || Cg(r, e, u, b.state))), t && l === null) throw Error(a(528, ""));
          return b;
        }
        if (t && l !== null) throw Error(a(529, ""));
        return null;
      case "script":
        return t = u.async, u = u.src, typeof u == "string" && t && typeof t != "function" && typeof t != "symbol" ? (t = Wa(u), u = ma(r).hoistableScripts, l = u.get(t), l || (l = { type: "script", instance: null, count: 0, state: null }, u.set(t, l)), l) : { type: "void", instance: null, count: 0, state: null };
      default:
        throw Error(a(444, e));
    }
  }
  function ka(e) {
    return 'href="' + At(e) + '"';
  }
  function Gu(e) {
    return 'link[rel="stylesheet"][' + e + "]";
  }
  function bb(e) {
    return R({}, e, { "data-precedence": e.precedence, precedence: null });
  }
  function Cg(e, t, u, l) {
    e.querySelector('link[rel="preload"][as="style"][' + t + "]") ? l.loading = 1 : (t = e.createElement("link"), l.preload = t, t.addEventListener("load", function() {
      return l.loading |= 1;
    }), t.addEventListener("error", function() {
      return l.loading |= 2;
    }), Fe(t, "link", u), Qe(t), e.head.appendChild(t));
  }
  function Wa(e) {
    return '[src="' + At(e) + '"]';
  }
  function Yu(e) {
    return "script[async]" + e;
  }
  function db(e, t, u) {
    if (t.count++, t.instance === null) switch (t.type) {
      case "style":
        var l = e.querySelector('style[data-href~="' + At(u.href) + '"]');
        if (l) return t.instance = l, Qe(l), l;
        var r = R({}, u, { "data-href": u.href, "data-precedence": u.precedence, href: null, precedence: null });
        return l = (e.ownerDocument || e).createElement("style"), Qe(l), Fe(l, "style", r), bc(l, u.precedence, e), t.instance = l;
      case "stylesheet":
        r = ka(u.href);
        var f = e.querySelector(Gu(r));
        if (f) return t.state.loading |= 4, t.instance = f, Qe(f), f;
        l = bb(u), (r = Rt.get(r)) && Xr(l, r), f = (e.ownerDocument || e).createElement("link"), Qe(f);
        var b = f;
        return b._p = new Promise(function(g, w) {
          b.onload = g, b.onerror = w;
        }), Fe(f, "link", l), t.state.loading |= 4, bc(f, u.precedence, e), t.instance = f;
      case "script":
        return f = Wa(u.src), (r = e.querySelector(Yu(f))) ? (t.instance = r, Qe(r), r) : (l = u, (r = Rt.get(f)) && (l = R({}, u), Qr(l, r)), e = e.ownerDocument || e, r = e.createElement("script"), Qe(r), Fe(r, "link", l), e.head.appendChild(r), t.instance = r);
      case "void":
        return null;
      default:
        throw Error(a(443, t.type));
    }
    else t.type === "stylesheet" && (t.state.loading & 4) === 0 && (l = t.instance, t.state.loading |= 4, bc(l, u.precedence, e));
    return t.instance;
  }
  function bc(e, t, u) {
    for (var l = u.querySelectorAll('link[rel="stylesheet"][data-precedence],style[data-precedence]'), r = l.length ? l[l.length - 1] : null, f = r, b = 0; b < l.length; b++) {
      var g = l[b];
      if (g.dataset.precedence === t) f = g;
      else if (f !== r) break;
    }
    f ? f.parentNode.insertBefore(e, f.nextSibling) : (t = u.nodeType === 9 ? u.head : u, t.insertBefore(e, t.firstChild));
  }
  function Xr(e, t) {
    e.crossOrigin == null && (e.crossOrigin = t.crossOrigin), e.referrerPolicy == null && (e.referrerPolicy = t.referrerPolicy), e.title == null && (e.title = t.title);
  }
  function Qr(e, t) {
    e.crossOrigin == null && (e.crossOrigin = t.crossOrigin), e.referrerPolicy == null && (e.referrerPolicy = t.referrerPolicy), e.integrity == null && (e.integrity = t.integrity);
  }
  var dc = null;
  function gb(e, t, u) {
    if (dc === null) {
      var l = /* @__PURE__ */ new Map(), r = dc = /* @__PURE__ */ new Map();
      r.set(u, l);
    } else r = dc, l = r.get(u), l || (l = /* @__PURE__ */ new Map(), r.set(u, l));
    if (l.has(e)) return l;
    for (l.set(e, null), u = u.getElementsByTagName(e), r = 0; r < u.length; r++) {
      var f = u[r];
      if (!(f[au] || f[Je] || e === "link" && f.getAttribute("rel") === "stylesheet") && f.namespaceURI !== "http://www.w3.org/2000/svg") {
        var b = f.getAttribute(t) || "";
        b = e + b;
        var g = l.get(b);
        g ? g.push(f) : l.set(b, [f]);
      }
    }
    return l;
  }
  function mb(e, t, u) {
    e = e.ownerDocument || e, e.head.insertBefore(u, t === "title" ? e.querySelector("head > title") : null);
  }
  function Rg(e, t, u) {
    if (u === 1 || t.itemProp != null) return false;
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
  function wb(e) {
    return !(e.type === "stylesheet" && (e.state.loading & 3) === 0);
  }
  function Ug(e, t, u, l) {
    if (u.type === "stylesheet" && (typeof l.media != "string" || matchMedia(l.media).matches !== false) && (u.state.loading & 4) === 0) {
      if (u.instance === null) {
        var r = ka(l.href), f = t.querySelector(Gu(r));
        if (f) {
          t = f._p, t !== null && typeof t == "object" && typeof t.then == "function" && (e.count++, e = gc.bind(e), t.then(e, e)), u.state.loading |= 4, u.instance = f, Qe(f);
          return;
        }
        f = t.ownerDocument || t, l = bb(l), (r = Rt.get(r)) && Xr(l, r), f = f.createElement("link"), Qe(f);
        var b = f;
        b._p = new Promise(function(g, w) {
          b.onload = g, b.onerror = w;
        }), Fe(f, "link", l), u.instance = f;
      }
      e.stylesheets === null && (e.stylesheets = /* @__PURE__ */ new Map()), e.stylesheets.set(u, t), (t = u.state.preload) && (u.state.loading & 3) === 0 && (e.count++, u = gc.bind(e), t.addEventListener("load", u), t.addEventListener("error", u));
    }
  }
  var Zr = 0;
  function Bg(e, t) {
    return e.stylesheets && e.count === 0 && wc(e, e.stylesheets), 0 < e.count || 0 < e.imgCount ? function(u) {
      var l = setTimeout(function() {
        if (e.stylesheets && wc(e, e.stylesheets), e.unsuspend) {
          var f = e.unsuspend;
          e.unsuspend = null, f();
        }
      }, 6e4 + t);
      0 < e.imgBytes && Zr === 0 && (Zr = 62500 * dg());
      var r = setTimeout(function() {
        if (e.waitingForImages = false, e.count === 0 && (e.stylesheets && wc(e, e.stylesheets), e.unsuspend)) {
          var f = e.unsuspend;
          e.unsuspend = null, f();
        }
      }, (e.imgBytes > Zr ? 50 : 800) + t);
      return e.unsuspend = u, function() {
        e.unsuspend = null, clearTimeout(l), clearTimeout(r);
      };
    } : null;
  }
  function gc() {
    if (this.count--, this.count === 0 && (this.imgCount === 0 || !this.waitingForImages)) {
      if (this.stylesheets) wc(this, this.stylesheets);
      else if (this.unsuspend) {
        var e = this.unsuspend;
        this.unsuspend = null, e();
      }
    }
  }
  var mc = null;
  function wc(e, t) {
    e.stylesheets = null, e.unsuspend !== null && (e.count++, mc = /* @__PURE__ */ new Map(), t.forEach(Ng, e), mc = null, gc.call(e));
  }
  function Ng(e, t) {
    if (!(t.state.loading & 4)) {
      var u = mc.get(e);
      if (u) var l = u.get(null);
      else {
        u = /* @__PURE__ */ new Map(), mc.set(e, u);
        for (var r = e.querySelectorAll("link[data-precedence],style[data-precedence]"), f = 0; f < r.length; f++) {
          var b = r[f];
          (b.nodeName === "LINK" || b.getAttribute("media") !== "not all") && (u.set(b.dataset.precedence, b), l = b);
        }
        l && u.set(null, l);
      }
      r = t.instance, b = r.getAttribute("data-precedence"), f = u.get(b) || l, f === l && u.set(null, r), u.set(b, r), this.count++, l = gc.bind(this), r.addEventListener("load", l), r.addEventListener("error", l), f ? f.parentNode.insertBefore(r, f.nextSibling) : (e = e.nodeType === 9 ? e.head : e, e.insertBefore(r, e.firstChild)), t.state.loading |= 4;
    }
  }
  var Vu = { $$typeof: Ve, Provider: null, Consumer: null, _currentValue: I, _currentValue2: I, _threadCount: 0 };
  function jg(e, t, u, l, r, f, b, g, w) {
    this.tag = 1, this.containerInfo = e, this.pingCache = this.current = this.pendingChildren = null, this.timeoutHandle = -1, this.callbackNode = this.next = this.pendingContext = this.context = this.cancelPendingCommit = null, this.callbackPriority = 0, this.expirationTimes = Gc(-1), this.entangledLanes = this.shellSuspendCounter = this.errorRecoveryDisabledLanes = this.expiredLanes = this.warmLanes = this.pingedLanes = this.suspendedLanes = this.pendingLanes = 0, this.entanglements = Gc(0), this.hiddenUpdates = Gc(null), this.identifierPrefix = l, this.onUncaughtError = r, this.onCaughtError = f, this.onRecoverableError = b, this.pooledCache = null, this.pooledCacheLanes = 0, this.formState = w, this.incompleteTransitions = /* @__PURE__ */ new Map();
  }
  function yb(e, t, u, l, r, f, b, g, w, T, M, N) {
    return e = new jg(e, t, u, b, w, T, M, N, g), t = 1, f === true && (t |= 24), f = mt(3, null, null, t), e.current = f, f.stateNode = e, t = Ai(), t.refCount++, e.pooledCache = t, t.refCount++, f.memoizedState = { element: l, isDehydrated: u, cache: t }, Oi(f), e;
  }
  function hb(e) {
    return e ? (e = Ta, e) : Ta;
  }
  function pb(e, t, u, l, r, f) {
    r = hb(r), l.context === null ? l.context = r : l.pendingContext = r, l = xn(t), l.payload = { element: u }, f = f === void 0 ? null : f, f !== null && (l.callback = f), u = An(e, l, t), u !== null && (_t(u, e, t), pu(u, e, t));
  }
  function vb(e, t) {
    if (e = e.memoizedState, e !== null && e.dehydrated !== null) {
      var u = e.retryLane;
      e.retryLane = u !== 0 && u < t ? u : t;
    }
  }
  function Kr(e, t) {
    vb(e, t), (e = e.alternate) && vb(e, t);
  }
  function Sb(e) {
    if (e.tag === 13 || e.tag === 31) {
      var t = In(e, 67108864);
      t !== null && _t(t, e, 67108864), Kr(e, 67108864);
    }
  }
  function xb(e) {
    if (e.tag === 13 || e.tag === 31) {
      var t = vt();
      t = Yc(t);
      var u = In(e, t);
      u !== null && _t(u, e, t), Kr(e, t);
    }
  }
  var yc = true;
  function qg(e, t, u, l) {
    var r = C.T;
    C.T = null;
    var f = G.p;
    try {
      G.p = 2, Jr(e, t, u, l);
    } finally {
      G.p = f, C.T = r;
    }
  }
  function Hg(e, t, u, l) {
    var r = C.T;
    C.T = null;
    var f = G.p;
    try {
      G.p = 8, Jr(e, t, u, l);
    } finally {
      G.p = f, C.T = r;
    }
  }
  function Jr(e, t, u, l) {
    if (yc) {
      var r = kr(l);
      if (r === null) Ur(e, t, l, hc, u), Eb(e, l);
      else if (Gg(r, e, t, u, l)) l.stopPropagation();
      else if (Eb(e, l), t & 4 && -1 < Lg.indexOf(e)) {
        for (; r !== null; ) {
          var f = ga(r);
          if (f !== null) switch (f.tag) {
            case 3:
              if (f = f.stateNode, f.current.memoizedState.isDehydrated) {
                var b = Zn(f.pendingLanes);
                if (b !== 0) {
                  var g = f;
                  for (g.pendingLanes |= 2, g.entangledLanes |= 2; b; ) {
                    var w = 1 << 31 - dt(b);
                    g.entanglements[1] |= w, b &= ~w;
                  }
                  Jt(f), (me & 6) === 0 && (tc = st() + 500, ju(0));
                }
              }
              break;
            case 31:
            case 13:
              g = In(f, 2), g !== null && _t(g, f, 2), ac(), Kr(f, 2);
          }
          if (f = kr(l), f === null && Ur(e, t, l, hc, u), f === r) break;
          r = f;
        }
        r !== null && l.stopPropagation();
      } else Ur(e, t, l, null, u);
    }
  }
  function kr(e) {
    return e = Ic(e), Wr(e);
  }
  var hc = null;
  function Wr(e) {
    if (hc = null, e = da(e), e !== null) {
      var t = _(e);
      if (t === null) e = null;
      else {
        var u = t.tag;
        if (u === 13) {
          if (e = d(t), e !== null) return e;
          e = null;
        } else if (u === 31) {
          if (e = y(t), e !== null) return e;
          e = null;
        } else if (u === 3) {
          if (t.stateNode.current.memoizedState.isDehydrated) return t.tag === 3 ? t.stateNode.containerInfo : null;
          e = null;
        } else t !== e && (e = null);
      }
    }
    return hc = e, null;
  }
  function Ab(e) {
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
        switch (Ad()) {
          case Cf:
            return 2;
          case Rf:
            return 8;
          case rl:
          case Ed:
            return 32;
          case Uf:
            return 268435456;
          default:
            return 32;
        }
      default:
        return 32;
    }
  }
  var Ir = false, Nn = null, jn = null, qn = null, Xu = /* @__PURE__ */ new Map(), Qu = /* @__PURE__ */ new Map(), Hn = [], Lg = "mousedown mouseup touchcancel touchend touchstart auxclick dblclick pointercancel pointerdown pointerup dragend dragstart drop compositionend compositionstart keydown keypress keyup input textInput copy cut paste click change contextmenu reset".split(" ");
  function Eb(e, t) {
    switch (e) {
      case "focusin":
      case "focusout":
        Nn = null;
        break;
      case "dragenter":
      case "dragleave":
        jn = null;
        break;
      case "mouseover":
      case "mouseout":
        qn = null;
        break;
      case "pointerover":
      case "pointerout":
        Xu.delete(t.pointerId);
        break;
      case "gotpointercapture":
      case "lostpointercapture":
        Qu.delete(t.pointerId);
    }
  }
  function Zu(e, t, u, l, r, f) {
    return e === null || e.nativeEvent !== f ? (e = { blockedOn: t, domEventName: u, eventSystemFlags: l, nativeEvent: f, targetContainers: [r] }, t !== null && (t = ga(t), t !== null && Sb(t)), e) : (e.eventSystemFlags |= l, t = e.targetContainers, r !== null && t.indexOf(r) === -1 && t.push(r), e);
  }
  function Gg(e, t, u, l, r) {
    switch (t) {
      case "focusin":
        return Nn = Zu(Nn, e, t, u, l, r), true;
      case "dragenter":
        return jn = Zu(jn, e, t, u, l, r), true;
      case "mouseover":
        return qn = Zu(qn, e, t, u, l, r), true;
      case "pointerover":
        var f = r.pointerId;
        return Xu.set(f, Zu(Xu.get(f) || null, e, t, u, l, r)), true;
      case "gotpointercapture":
        return f = r.pointerId, Qu.set(f, Zu(Qu.get(f) || null, e, t, u, l, r)), true;
    }
    return false;
  }
  function Tb(e) {
    var t = da(e.target);
    if (t !== null) {
      var u = _(t);
      if (u !== null) {
        if (t = u.tag, t === 13) {
          if (t = d(u), t !== null) {
            e.blockedOn = t, Lf(e.priority, function() {
              xb(u);
            });
            return;
          }
        } else if (t === 31) {
          if (t = y(u), t !== null) {
            e.blockedOn = t, Lf(e.priority, function() {
              xb(u);
            });
            return;
          }
        } else if (t === 3 && u.stateNode.current.memoizedState.isDehydrated) {
          e.blockedOn = u.tag === 3 ? u.stateNode.containerInfo : null;
          return;
        }
      }
    }
    e.blockedOn = null;
  }
  function pc(e) {
    if (e.blockedOn !== null) return false;
    for (var t = e.targetContainers; 0 < t.length; ) {
      var u = kr(e.nativeEvent);
      if (u === null) {
        u = e.nativeEvent;
        var l = new u.constructor(u.type, u);
        Wc = l, u.target.dispatchEvent(l), Wc = null;
      } else return t = ga(u), t !== null && Sb(t), e.blockedOn = u, false;
      t.shift();
    }
    return true;
  }
  function zb(e, t, u) {
    pc(e) && u.delete(t);
  }
  function Yg() {
    Ir = false, Nn !== null && pc(Nn) && (Nn = null), jn !== null && pc(jn) && (jn = null), qn !== null && pc(qn) && (qn = null), Xu.forEach(zb), Qu.forEach(zb);
  }
  function vc(e, t) {
    e.blockedOn === t && (e.blockedOn = null, Ir || (Ir = true, o.unstable_scheduleCallback(o.unstable_NormalPriority, Yg)));
  }
  var Sc = null;
  function Ob(e) {
    Sc !== e && (Sc = e, o.unstable_scheduleCallback(o.unstable_NormalPriority, function() {
      Sc === e && (Sc = null);
      for (var t = 0; t < e.length; t += 3) {
        var u = e[t], l = e[t + 1], r = e[t + 2];
        if (typeof l != "function") {
          if (Wr(l || u) === null) continue;
          break;
        }
        var f = ga(u);
        f !== null && (e.splice(t, 3), t -= 3, ki(f, { pending: true, data: r, method: u.method, action: l }, l, r));
      }
    }));
  }
  function Ia(e) {
    function t(w) {
      return vc(w, e);
    }
    Nn !== null && vc(Nn, e), jn !== null && vc(jn, e), qn !== null && vc(qn, e), Xu.forEach(t), Qu.forEach(t);
    for (var u = 0; u < Hn.length; u++) {
      var l = Hn[u];
      l.blockedOn === e && (l.blockedOn = null);
    }
    for (; 0 < Hn.length && (u = Hn[0], u.blockedOn === null); ) Tb(u), u.blockedOn === null && Hn.shift();
    if (u = (e.ownerDocument || e).$$reactFormReplay, u != null) for (l = 0; l < u.length; l += 3) {
      var r = u[l], f = u[l + 1], b = r[ut] || null;
      if (typeof f == "function") b || Ob(u);
      else if (b) {
        var g = null;
        if (f && f.hasAttribute("formAction")) {
          if (r = f, b = f[ut] || null) g = b.formAction;
          else if (Wr(r) !== null) continue;
        } else g = b.action;
        typeof g == "function" ? u[l + 1] = g : (u.splice(l, 3), l -= 3), Ob(u);
      }
    }
  }
  function Db() {
    function e(f) {
      f.canIntercept && f.info === "react-transition" && f.intercept({ handler: function() {
        return new Promise(function(b) {
          return r = b;
        });
      }, focusReset: "manual", scroll: "manual" });
    }
    function t() {
      r !== null && (r(), r = null), l || setTimeout(u, 20);
    }
    function u() {
      if (!l && !navigation.transition) {
        var f = navigation.currentEntry;
        f && f.url != null && navigation.navigate(f.url, { state: f.getState(), info: "react-transition", history: "replace" });
      }
    }
    if (typeof navigation == "object") {
      var l = false, r = null;
      return navigation.addEventListener("navigate", e), navigation.addEventListener("navigatesuccess", t), navigation.addEventListener("navigateerror", t), setTimeout(u, 100), function() {
        l = true, navigation.removeEventListener("navigate", e), navigation.removeEventListener("navigatesuccess", t), navigation.removeEventListener("navigateerror", t), r !== null && (r(), r = null);
      };
    }
  }
  function Fr(e) {
    this._internalRoot = e;
  }
  xc.prototype.render = Fr.prototype.render = function(e) {
    var t = this._internalRoot;
    if (t === null) throw Error(a(409));
    var u = t.current, l = vt();
    pb(u, l, e, t, null, null);
  }, xc.prototype.unmount = Fr.prototype.unmount = function() {
    var e = this._internalRoot;
    if (e !== null) {
      this._internalRoot = null;
      var t = e.containerInfo;
      pb(e.current, 2, null, e, null, null), ac(), t[ba] = null;
    }
  };
  function xc(e) {
    this._internalRoot = e;
  }
  xc.prototype.unstable_scheduleHydration = function(e) {
    if (e) {
      var t = Hf();
      e = { blockedOn: null, target: e, priority: t };
      for (var u = 0; u < Hn.length && t !== 0 && t < Hn[u].priority; u++) ;
      Hn.splice(u, 0, e), u === 0 && Tb(e);
    }
  };
  var Mb = s.version;
  if (Mb !== "19.2.7") throw Error(a(527, Mb, "19.2.7"));
  G.findDOMNode = function(e) {
    var t = e._reactInternals;
    if (t === void 0) throw typeof e.render == "function" ? Error(a(188)) : (e = Object.keys(e).join(","), Error(a(268, e)));
    return e = h(t), e = e !== null ? B(e) : null, e = e === null ? null : e.stateNode, e;
  };
  var Vg = { bundleType: 0, version: "19.2.7", rendererPackageName: "react-dom", currentDispatcherRef: C, reconcilerVersion: "19.2.7" };
  if (typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ < "u") {
    var Ac = __REACT_DEVTOOLS_GLOBAL_HOOK__;
    if (!Ac.isDisabled && Ac.supportsFiber) try {
      eu = Ac.inject(Vg), bt = Ac;
    } catch {
    }
  }
  return Ju.createRoot = function(e, t) {
    if (!i(e)) throw Error(a(299));
    var u = false, l = "", r = qo, f = Ho, b = Lo;
    return t != null && (t.unstable_strictMode === true && (u = true), t.identifierPrefix !== void 0 && (l = t.identifierPrefix), t.onUncaughtError !== void 0 && (r = t.onUncaughtError), t.onCaughtError !== void 0 && (f = t.onCaughtError), t.onRecoverableError !== void 0 && (b = t.onRecoverableError)), t = yb(e, 1, false, null, null, u, l, null, r, f, b, Db), e[ba] = t.current, Rr(e), new Fr(t);
  }, Ju.hydrateRoot = function(e, t, u) {
    if (!i(e)) throw Error(a(299));
    var l = false, r = "", f = qo, b = Ho, g = Lo, w = null;
    return u != null && (u.unstable_strictMode === true && (l = true), u.identifierPrefix !== void 0 && (r = u.identifierPrefix), u.onUncaughtError !== void 0 && (f = u.onUncaughtError), u.onCaughtError !== void 0 && (b = u.onCaughtError), u.onRecoverableError !== void 0 && (g = u.onRecoverableError), u.formState !== void 0 && (w = u.formState)), t = yb(e, 1, true, t, u ?? null, l, r, w, f, b, g, Db), t.context = hb(null), u = t.current, l = vt(), l = Yc(l), r = xn(l), r.callback = null, An(u, r, l), u = l, t.current.lanes = u, nu(t, u), Jt(t), e[ba] = t.current, Rr(e), new xc(t);
  }, Ju.version = "19.2.7", Ju;
}
var Vb;
function Pg() {
  if (Vb) return ef.exports;
  Vb = 1;
  function o() {
    if (!(typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ > "u" || typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE != "function")) try {
      __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(o);
    } catch (s) {
      console.error(s);
    }
  }
  return o(), ef.exports = $g(), ef.exports;
}
var em = Pg();
const Xb = nd(em);
class tm {
  constructor() {
    __publicField(this, "listeners", /* @__PURE__ */ new Map());
  }
  on(s, n) {
    this.listeners.has(s) || this.listeners.set(s, /* @__PURE__ */ new Set());
    const a = this.listeners.get(s), i = n;
    return a.add(i), () => {
      a.delete(i);
    };
  }
  once(s, n) {
    const a = this.on(s, ((i) => {
      a(), n(i);
    }));
    return a;
  }
  emit(s, ...n) {
    const a = this.listeners.get(s);
    if (a) {
      const i = n[0];
      a.forEach((_) => _(i));
    }
  }
  off(s) {
    this.listeners.delete(s);
  }
}
const Bt = new tm(), nm = { maxVisible: 5 }, am = { info: 3e3, success: 3e3, warning: 5e3, error: 6e3, loot: 4e3 }, um = { info: "border-l-toast-info", success: "border-l-toast-success", warning: "border-l-toast-warning", error: "border-l-toast-error", loot: "border-l-toast-loot" };
function lm(o, s) {
  switch (s.type) {
    case "ADD": {
      let n = [...o.toasts, s.toast];
      return n.length > nm.maxVisible && (n = n.map((a, i) => i === 0 && !a.exiting ? { ...a, exiting: true } : a)), { toasts: n };
    }
    case "MARK_EXITING":
      return { toasts: o.toasts.map((n) => n.id === s.id ? { ...n, exiting: true } : n) };
    case "REMOVE":
      return { toasts: o.toasts.filter((n) => n.id !== s.id) };
    case "CLEAR":
      return { toasts: o.toasts.map((n) => ({ ...n, exiting: true })) };
  }
}
const ud = F.createContext({ toasts: [] }), ld = F.createContext(() => {
});
function cm({ children: o }) {
  const [s, n] = F.useReducer(lm, { toasts: [] });
  return F.useEffect(() => {
    const a = Bt.on("toast:show", ({ message: d, severity: y, duration: S }) => {
      n({ type: "ADD", toast: { id: crypto.randomUUID(), message: d, severity: y, duration: S ?? am[y], createdAt: Date.now(), exiting: false } });
    }), i = Bt.on("toast:dismiss", ({ id: d }) => {
      n({ type: "MARK_EXITING", id: d });
    }), _ = Bt.on("toast:clear", () => {
      n({ type: "CLEAR" });
    });
    return () => {
      a(), i(), _();
    };
  }, []), V.jsx(ud, { value: s, children: V.jsx(ld, { value: n, children: o }) });
}
const vf = { stack: [], isOpen: false };
function im(o, s) {
  var _a2;
  switch (s.type) {
    case "OPEN":
      return { stack: [...o.stack, s.modal], isOpen: true };
    case "CLOSE": {
      const n = o.stack[o.stack.length - 1], a = o.stack.slice(0, -1);
      return (_a2 = n == null ? void 0 : n.onClose) == null ? void 0 : _a2.call(n), { stack: a, isOpen: a.length > 0 };
    }
    case "CLOSE_ALL":
      return o.stack.forEach((n) => {
        var _a3;
        return (_a3 = n.onClose) == null ? void 0 : _a3.call(n);
      }), vf;
  }
}
const Sf = F.createContext(vf), xf = F.createContext(() => {
});
function rm({ children: o }) {
  const [s, n] = F.useReducer(im, vf);
  return F.useEffect(() => {
    const a = Bt.on("modal:open", ({ id: _, title: d, content: y, size: S, onClose: h }) => {
      n({ type: "OPEN", modal: { id: _ ?? crypto.randomUUID(), title: d, content: y, onClose: h, closeOnOverlayClick: true, closeOnEscape: true, size: S ?? "md" } });
    }), i = Bt.on("modal:close", () => {
      n({ type: "CLOSE" });
    });
    return () => {
      a(), i();
    };
  }, []), V.jsx(Sf, { value: s, children: V.jsx(xf, { value: n, children: o }) });
}
var cd = ad();
const Qb = /* @__PURE__ */ new Map(), fm = { "toast-root": "100", "modal-root": "90", "menu-root": "80" };
function id(o) {
  let s = Qb.get(o);
  return (!s || !document.body.contains(s)) && (s = document.createElement("div"), s.id = o, s.style.position = "fixed", s.style.inset = "0", s.style.pointerEvents = "none", s.style.zIndex = fm[o] ?? "50", document.body.appendChild(s), Qb.set(o, s)), s;
}
function _m({ toast: o, onDismiss: s }) {
  F.useEffect(() => {
    if (o.duration <= 0 || o.exiting) return;
    const a = setTimeout(() => s(o.id), o.duration);
    return () => clearTimeout(a);
  }, [o.id, o.duration, o.exiting, s]);
  const n = um[o.severity];
  return V.jsxs("div", { className: `
				pointer-events-auto mb-2 px-3 py-2 md:px-4 md:py-3 min-w-[180px] md:min-w-[260px] max-w-[280px] md:max-w-[380px]
				bg-panel shadow-toast
				border-2 border-panel-border border-l-4 ${n}
				${o.exiting ? "animate-toast-out" : "animate-toast-in"}
				flex items-start gap-2
			`, onAnimationEnd: () => {
    o.exiting && s(o.id);
  }, children: [V.jsx("span", { className: "text-[8px] md:text-xs leading-relaxed flex-1", children: o.message }), V.jsx("button", { onClick: () => s(o.id), className: "text-text-muted hover:text-text text-[8px] md:text-xs leading-none mt-0.5 cursor-pointer", children: "\u2715" })] });
}
function om() {
  const { toasts: o } = F.useContext(ud), s = F.useContext(ld), n = F.useCallback((a) => {
    var _a2;
    ((_a2 = o.find((_) => _.id === a)) == null ? void 0 : _a2.exiting) ? s({ type: "REMOVE", id: a }) : s({ type: "MARK_EXITING", id: a });
  }, [o, s]);
  return o.length === 0 ? null : cd.createPortal(V.jsx("div", { className: "fixed top-14 right-4 flex flex-col items-end pointer-events-none", children: o.map((a) => V.jsx(_m, { toast: a, onDismiss: n }, a.id)) }), id("toast-root"));
}
const sm = { xs: "max-w-xs", sm: "max-w-sm", md: "max-w-md", lg: "max-w-lg" };
function bm() {
  const { stack: o, isOpen: s } = F.useContext(Sf), n = F.useContext(xf);
  if (!s || o.length === 0) return null;
  const a = o[o.length - 1], i = sm[a.size ?? "md"];
  return cd.createPortal(V.jsx("div", { className: "fixed inset-0 bg-overlay flex items-center justify-center pointer-events-auto", onClick: () => {
    a.closeOnOverlayClick !== false && n({ type: "CLOSE" });
  }, children: V.jsx("div", { className: `
					${i} mx-4
					border-[3px] border-panel-border
					shadow-[0_0_0_1px_#1a1008,0_6px_20px_rgba(0,0,0,0.8)]
					animate-modal-in
				`, onClick: (_) => _.stopPropagation(), children: V.jsxs("div", { className: "border-2 border-[#1a1008]", children: [V.jsxs("div", { className: "flex items-center justify-between px-3 py-2 md:px-4 md:py-3 bg-[#1e1408] border-b border-[#5a4a2a]", children: [V.jsx("h2", { className: "text-[10px] md:text-sm text-[#c8a832]", children: a.title }), V.jsx("button", { onClick: () => n({ type: "CLOSE" }), className: `w-5 h-5 md:w-7 md:h-7 flex items-center justify-center
								bg-[#3d2b14] border border-[#5a4a2a]
								text-text-muted hover:text-[#c8a832] hover:border-panel-border
								text-[8px] md:text-xs leading-none cursor-pointer transition-colors`, children: "\u2715" })] }), V.jsx("div", { className: "p-3 md:p-4 bg-panel-inner text-[8px] md:text-xs", children: a.content })] }) }) }), id("modal-root"));
}
function dm(o, s, n = true) {
  F.useEffect(() => {
    if (!n) return;
    const a = (i) => {
      i.key === o && (i.preventDefault(), s());
    };
    return window.addEventListener("keydown", a), () => window.removeEventListener("keydown", a);
  }, [o, s, n]);
}
function gm() {
  var _a2;
  (_a2 = document.getElementById("bevy-canvas")) == null ? void 0 : _a2.focus();
}
function mm() {
  const o = F.useContext(Sf), s = F.useContext(xf), n = F.useRef(false), a = o.isOpen;
  F.useEffect(() => {
    n.current && !a && gm(), n.current = a;
  }, [a]);
  const i = F.useCallback(() => {
    o.isOpen && s({ type: "CLOSE" });
  }, [o.isOpen, s]);
  return dm("Escape", i), null;
}
function Zb({ children: o }) {
  return V.jsx(cm, { children: V.jsxs(rm, { children: [V.jsx(mm, {}), o, V.jsx(om, {}), V.jsx(bm, {})] }) });
}
function wm(o, s, n, a) {
  if (typeof s == "function" ? o !== s || !a : !s.has(o)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
  return n === "m" ? a : n === "a" ? a.call(o) : a ? a.value : s.get(o);
}
function ym(o, s, n, a, i) {
  if (typeof s == "function" ? o !== s || true : !s.has(o)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
  return s.set(o, n), n;
}
var Tc;
const Nt = "__TAURI_TO_IPC_KEY__";
function hm(o, s = false) {
  return window.__TAURI_INTERNALS__.transformCallback(o, s);
}
async function H(o, s = {}, n) {
  return window.__TAURI_INTERNALS__.invoke(o, s, n);
}
class pm {
  get rid() {
    return wm(this, Tc, "f");
  }
  constructor(s) {
    Tc.set(this, void 0), ym(this, Tc, s);
  }
  async close() {
    return H("plugin:resources|close", { rid: this.rid });
  }
}
Tc = /* @__PURE__ */ new WeakMap();
function Af() {
  return !!(window.__TAURI_INTERNALS__ || window.__TAURI__);
}
async function Ef() {
  try {
    return await $a(() => Promise.resolve().then(() => cl), void 0);
  } catch {
    return null;
  }
}
async function vm(o) {
  if (!o.trim()) return false;
  if (Af()) try {
    return await H("send_chat", { text: o });
  } catch (a) {
    return console.warn("[chat] send_chat (tauri) threw", a), false;
  }
  const s = await Ef();
  if (!s) return false;
  const n = s.send_chat;
  if (typeof n != "function") return false;
  try {
    return n(o);
  } catch (a) {
    return console.warn("[chat] send_chat (wasm) threw", a), false;
  }
}
async function Sm() {
  if (Af()) try {
    return await H("get_chat_log");
  } catch {
    return [];
  }
  const o = await Ef();
  if (!o) return [];
  const s = o.get_chat_log_json;
  if (typeof s != "function") return [];
  try {
    const n = s();
    return n ? JSON.parse(n) : [];
  } catch {
    return [];
  }
}
async function xm() {
  if (Af()) try {
    return await H("get_signin_state");
  } catch {
    return null;
  }
  const o = await Ef();
  if (!o) return null;
  const s = o.get_signin_state_json;
  if (typeof s != "function") return null;
  try {
    const n = s();
    return n ? JSON.parse(n) : null;
  } catch {
    return null;
  }
}
function Am() {
  const [o, s] = F.useState(false), [n, a] = F.useState(null), [i, _] = F.useState([]), [d, y] = F.useState({ open: false, seen: 0 }), { open: S } = d, h = F.useRef(null), B = F.useRef(null);
  F.useEffect(() => {
    let ne = false;
    const oe = async () => {
      if (ne) return;
      const [Ke, Ve] = await Promise.all([xm(), Sm()]);
      ne || (Ke && (s(Ke.jwt_valid && !!Ke.username), a(Ke.username)), _(Ve));
    };
    oe();
    const Me = setInterval(() => void oe(), 1e3);
    return () => {
      ne = true, clearInterval(Me);
    };
  }, []);
  const R = () => y({ open: true, seen: i.length }), X = () => y({ open: false, seen: i.length });
  F.useEffect(() => {
    if (!S) return;
    const ne = B.current;
    ne && (ne.scrollTop = ne.scrollHeight);
  }, [i, S]), F.useEffect(() => {
    const ne = (oe) => {
      const Me = oe.target, Ke = Me == null ? void 0 : Me.tagName;
      if (Ke === "INPUT" || Ke === "TEXTAREA" || Ke === "SELECT" || (Me == null ? void 0 : Me.isContentEditable) === true) {
        Me === h.current && oe.key === "Escape" && (oe.preventDefault(), h.current && (h.current.value = ""), X());
        return;
      }
      (oe.code === "KeyT" || oe.code === "Slash" || oe.key === "T" || oe.key === "t" || oe.key === "/") && !oe.metaKey && !oe.ctrlKey && !oe.altKey ? (oe.preventDefault(), oe.stopPropagation(), S ? X() : R()) : oe.key === "Escape" && S && X();
    };
    return window.addEventListener("keydown", ne, true), () => window.removeEventListener("keydown", ne, true);
  }, [S]), F.useEffect(() => {
    if (!S) return;
    const ne = h.current;
    if (!ne) return;
    const oe = () => ne.focus();
    oe();
    const Me = requestAnimationFrame(oe);
    return () => cancelAnimationFrame(Me);
  }, [S]);
  const ie = F.useCallback(async () => {
    const ne = h.current, oe = ((ne == null ? void 0 : ne.value) ?? "").trim();
    if (!oe) return;
    await vm(oe) || console.warn("[chat] send failed (not connected or rejected)"), ne && (ne.value = "");
  }, []);
  if (!o) return null;
  const qe = S ? 0 : Math.max(0, i.length - d.seen);
  return S ? V.jsxs("div", { style: { position: "fixed", left: 12, top: 48, width: "min(340px, calc(100vw - 24px))", height: "min(260px, calc(100vh - 96px))", zIndex: 9999, pointerEvents: "auto", background: "rgba(10, 10, 16, 0.86)", border: "1px solid rgba(255, 255, 255, 0.18)", borderRadius: 6, boxShadow: "0 4px 16px rgba(0, 0, 0, 0.4)", display: "flex", flexDirection: "column", color: "#e8d8b8", fontFamily: "monospace", fontSize: 12 }, children: [V.jsxs("div", { style: { padding: "4px 8px", borderBottom: "1px solid rgba(255, 255, 255, 0.1)", fontSize: 11, color: "#a89878", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }, children: [V.jsx("span", { children: "#general" }), V.jsx("span", { style: { flex: 1, textAlign: "right" }, children: n ?? "" }), V.jsx("button", { type: "button", onClick: X, style: { background: "transparent", border: "none", color: "#a89878", cursor: "pointer", fontSize: 14, lineHeight: 1, padding: "0 2px" }, title: "Close (Esc)", children: "\xD7" })] }), V.jsx("div", { ref: B, style: { flex: 1, overflowY: "auto", padding: "6px 8px", display: "flex", flexDirection: "column", gap: 2 }, children: i.length === 0 ? V.jsx("div", { style: { color: "#665a3a" }, children: "(no messages yet)" }) : i.map((ne, oe) => V.jsxs("div", { style: { lineHeight: 1.3 }, children: [V.jsx("span", { style: { color: "#7eb55b" }, children: ne.sender }), V.jsx("span", { style: { color: "#a89878" }, children: ": " }), V.jsx("span", { children: ne.content })] }, oe)) }), V.jsx("div", { style: { padding: "6px 8px", borderTop: "1px solid rgba(255, 255, 255, 0.1)" }, children: V.jsx("input", { ref: h, type: "text", maxLength: 300, defaultValue: "", autoComplete: "off", spellCheck: false, onKeyDown: (ne) => {
    ne.key === "Enter" && (ne.preventDefault(), ie());
  }, placeholder: "Enter to send \u2014 Esc to close", style: { width: "100%", background: "rgba(0, 0, 0, 0.4)", border: "1px solid rgba(255, 255, 255, 0.15)", borderRadius: 4, outline: "none", color: "#e8d8b8", fontSize: 12, fontFamily: "inherit", caretColor: "#e8d8b8", padding: "4px 6px" } }) })] }) : qe === 0 ? null : V.jsxs("button", { type: "button", onClick: R, style: { position: "fixed", left: 12, top: 48, zIndex: 9999, pointerEvents: "auto", padding: "4px 10px", background: "rgba(10, 10, 16, 0.86)", border: "1px solid #b83030", borderRadius: 12, color: "#e8d8b8", fontFamily: "monospace", fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }, title: "Press T to open chat", children: [V.jsx("span", { style: { color: "#b83030", fontWeight: "bold" }, children: qe }), V.jsx("span", { children: "chat" })] });
}
class Tf {
  constructor(...s) {
    this.type = "Logical", s.length === 1 ? "Logical" in s[0] ? (this.width = s[0].Logical.width, this.height = s[0].Logical.height) : (this.width = s[0].width, this.height = s[0].height) : (this.width = s[0], this.height = s[1]);
  }
  toPhysical(s) {
    return new Vn(this.width * s, this.height * s);
  }
  [Nt]() {
    return { width: this.width, height: this.height };
  }
  toJSON() {
    return this[Nt]();
  }
}
class Vn {
  constructor(...s) {
    this.type = "Physical", s.length === 1 ? "Physical" in s[0] ? (this.width = s[0].Physical.width, this.height = s[0].Physical.height) : (this.width = s[0].width, this.height = s[0].height) : (this.width = s[0], this.height = s[1]);
  }
  toLogical(s) {
    return new Tf(this.width / s, this.height / s);
  }
  [Nt]() {
    return { width: this.width, height: this.height };
  }
  toJSON() {
    return this[Nt]();
  }
}
class Fa {
  constructor(s) {
    this.size = s;
  }
  toLogical(s) {
    return this.size instanceof Tf ? this.size : this.size.toLogical(s);
  }
  toPhysical(s) {
    return this.size instanceof Vn ? this.size : this.size.toPhysical(s);
  }
  [Nt]() {
    return { [`${this.size.type}`]: { width: this.size.width, height: this.size.height } };
  }
  toJSON() {
    return this[Nt]();
  }
}
class zf {
  constructor(...s) {
    this.type = "Logical", s.length === 1 ? "Logical" in s[0] ? (this.x = s[0].Logical.x, this.y = s[0].Logical.y) : (this.x = s[0].x, this.y = s[0].y) : (this.x = s[0], this.y = s[1]);
  }
  toPhysical(s) {
    return new Ut(this.x * s, this.y * s);
  }
  [Nt]() {
    return { x: this.x, y: this.y };
  }
  toJSON() {
    return this[Nt]();
  }
}
class Ut {
  constructor(...s) {
    this.type = "Physical", s.length === 1 ? "Physical" in s[0] ? (this.x = s[0].Physical.x, this.y = s[0].Physical.y) : (this.x = s[0].x, this.y = s[0].y) : (this.x = s[0], this.y = s[1]);
  }
  toLogical(s) {
    return new zf(this.x / s, this.y / s);
  }
  [Nt]() {
    return { x: this.x, y: this.y };
  }
  toJSON() {
    return this[Nt]();
  }
}
class Ec {
  constructor(s) {
    this.position = s;
  }
  toLogical(s) {
    return this.position instanceof zf ? this.position : this.position.toLogical(s);
  }
  toPhysical(s) {
    return this.position instanceof Ut ? this.position : this.position.toPhysical(s);
  }
  [Nt]() {
    return { [`${this.position.type}`]: { x: this.position.x, y: this.position.y } };
  }
  toJSON() {
    return this[Nt]();
  }
}
var St;
(function(o) {
  o.WINDOW_RESIZED = "tauri://resize", o.WINDOW_MOVED = "tauri://move", o.WINDOW_CLOSE_REQUESTED = "tauri://close-requested", o.WINDOW_DESTROYED = "tauri://destroyed", o.WINDOW_FOCUS = "tauri://focus", o.WINDOW_BLUR = "tauri://blur", o.WINDOW_SCALE_FACTOR_CHANGED = "tauri://scale-change", o.WINDOW_THEME_CHANGED = "tauri://theme-changed", o.WINDOW_CREATED = "tauri://window-created", o.WINDOW_SUSPENDED = "tauri://suspended", o.WINDOW_RESUMED = "tauri://resumed", o.WEBVIEW_CREATED = "tauri://webview-created", o.DRAG_ENTER = "tauri://drag-enter", o.DRAG_OVER = "tauri://drag-over", o.DRAG_DROP = "tauri://drag-drop", o.DRAG_LEAVE = "tauri://drag-leave";
})(St || (St = {}));
async function rd(o, s) {
  window.__TAURI_EVENT_PLUGIN_INTERNALS__.unregisterListener(o, s), await H("plugin:event|unlisten", { event: o, eventId: s });
}
async function fd(o, s, n) {
  var a;
  const i = typeof (n == null ? void 0 : n.target) == "string" ? { kind: "AnyLabel", label: n.target } : (a = n == null ? void 0 : n.target) !== null && a !== void 0 ? a : { kind: "Any" };
  return H("plugin:event|listen", { event: o, target: i, handler: hm(s) }).then((_) => async () => rd(o, _));
}
async function Em(o, s, n) {
  return fd(o, (a) => {
    rd(o, a.id), s(a);
  }, n);
}
async function Tm(o, s) {
  await H("plugin:event|emit", { event: o, payload: s });
}
async function zm(o, s, n) {
  await H("plugin:event|emit_to", { target: typeof o == "string" ? { kind: "AnyLabel", label: o } : o, event: s, payload: n });
}
let Om = class zc extends pm {
  constructor(s) {
    super(s);
  }
  static async new(s, n, a) {
    return H("plugin:image|new", { rgba: Dc(s), width: n, height: a }).then((i) => new zc(i));
  }
  static async fromBytes(s) {
    return H("plugin:image|from_bytes", { bytes: Dc(s) }).then((n) => new zc(n));
  }
  static async fromPath(s) {
    return H("plugin:image|from_path", { path: s }).then((n) => new zc(n));
  }
  async rgba() {
    return H("plugin:image|rgba", { rid: this.rid }).then((s) => new Uint8Array(s));
  }
  async size() {
    return H("plugin:image|size", { rid: this.rid });
  }
};
function Dc(o) {
  return o == null ? null : typeof o == "string" ? o : o instanceof Om ? o.rid : o;
}
var Mc;
(function(o) {
  o[o.Critical = 1] = "Critical", o[o.Informational = 2] = "Informational";
})(Mc || (Mc = {}));
class _d {
  constructor(s) {
    this._preventDefault = false, this.event = s.event, this.id = s.id;
  }
  preventDefault() {
    this._preventDefault = true;
  }
  isPreventDefault() {
    return this._preventDefault;
  }
}
var gf;
(function(o) {
  o.None = "none", o.Normal = "normal", o.Indeterminate = "indeterminate", o.Paused = "paused", o.Error = "error";
})(gf || (gf = {}));
function Cc() {
  return new Of(window.__TAURI_INTERNALS__.metadata.currentWindow.label, { skip: true });
}
async function Oc() {
  return H("plugin:window|get_all_windows").then((o) => o.map((s) => new Of(s, { skip: true })));
}
const uf = ["tauri://created", "tauri://error"];
let Of = class {
  constructor(s, n = {}) {
    var a;
    this.label = s, this.listeners = /* @__PURE__ */ Object.create(null), (n == null ? void 0 : n.skip) || H("plugin:window|create", { options: { ...n, parent: typeof n.parent == "string" ? n.parent : (a = n.parent) === null || a === void 0 ? void 0 : a.label, label: s } }).then(async () => this.emit("tauri://created")).catch(async (i) => this.emit("tauri://error", i));
  }
  static async getByLabel(s) {
    var n;
    return (n = (await Oc()).find((a) => a.label === s)) !== null && n !== void 0 ? n : null;
  }
  static getCurrent() {
    return Cc();
  }
  static async getAll() {
    return Oc();
  }
  static async getFocusedWindow() {
    for (const s of await Oc()) if (await s.isFocused()) return s;
    return null;
  }
  async listen(s, n) {
    return this._handleTauriEvent(s, n) ? () => {
      const a = this.listeners[s];
      a.splice(a.indexOf(n), 1);
    } : fd(s, n, { target: { kind: "Window", label: this.label } });
  }
  async once(s, n) {
    return this._handleTauriEvent(s, n) ? () => {
      const a = this.listeners[s];
      a.splice(a.indexOf(n), 1);
    } : Em(s, n, { target: { kind: "Window", label: this.label } });
  }
  async emit(s, n) {
    if (uf.includes(s)) {
      for (const a of this.listeners[s] || []) a({ event: s, id: -1, payload: n });
      return;
    }
    return Tm(s, n);
  }
  async emitTo(s, n, a) {
    if (uf.includes(n)) {
      for (const i of this.listeners[n] || []) i({ event: n, id: -1, payload: a });
      return;
    }
    return zm(s, n, a);
  }
  _handleTauriEvent(s, n) {
    return uf.includes(s) ? (s in this.listeners ? this.listeners[s].push(n) : this.listeners[s] = [n], true) : false;
  }
  async scaleFactor() {
    return H("plugin:window|scale_factor", { label: this.label });
  }
  async innerPosition() {
    return H("plugin:window|inner_position", { label: this.label }).then((s) => new Ut(s));
  }
  async outerPosition() {
    return H("plugin:window|outer_position", { label: this.label }).then((s) => new Ut(s));
  }
  async innerSize() {
    return H("plugin:window|inner_size", { label: this.label }).then((s) => new Vn(s));
  }
  async outerSize() {
    return H("plugin:window|outer_size", { label: this.label }).then((s) => new Vn(s));
  }
  async isFullscreen() {
    return H("plugin:window|is_fullscreen", { label: this.label });
  }
  async isMinimized() {
    return H("plugin:window|is_minimized", { label: this.label });
  }
  async isMaximized() {
    return H("plugin:window|is_maximized", { label: this.label });
  }
  async isFocused() {
    return H("plugin:window|is_focused", { label: this.label });
  }
  async isDecorated() {
    return H("plugin:window|is_decorated", { label: this.label });
  }
  async isResizable() {
    return H("plugin:window|is_resizable", { label: this.label });
  }
  async isMaximizable() {
    return H("plugin:window|is_maximizable", { label: this.label });
  }
  async isMinimizable() {
    return H("plugin:window|is_minimizable", { label: this.label });
  }
  async isClosable() {
    return H("plugin:window|is_closable", { label: this.label });
  }
  async isVisible() {
    return H("plugin:window|is_visible", { label: this.label });
  }
  async title() {
    return H("plugin:window|title", { label: this.label });
  }
  async theme() {
    return H("plugin:window|theme", { label: this.label });
  }
  async isAlwaysOnTop() {
    return H("plugin:window|is_always_on_top", { label: this.label });
  }
  async activityName() {
    return H("plugin:window|activity_name", { label: this.label });
  }
  async sceneIdentifier() {
    return H("plugin:window|scene_identifier", { label: this.label });
  }
  async center() {
    return H("plugin:window|center", { label: this.label });
  }
  async requestUserAttention(s) {
    let n = null;
    return s && (s === Mc.Critical ? n = { type: "Critical" } : n = { type: "Informational" }), H("plugin:window|request_user_attention", { label: this.label, value: n });
  }
  async setResizable(s) {
    return H("plugin:window|set_resizable", { label: this.label, value: s });
  }
  async setEnabled(s) {
    return H("plugin:window|set_enabled", { label: this.label, value: s });
  }
  async isEnabled() {
    return H("plugin:window|is_enabled", { label: this.label });
  }
  async setMaximizable(s) {
    return H("plugin:window|set_maximizable", { label: this.label, value: s });
  }
  async setMinimizable(s) {
    return H("plugin:window|set_minimizable", { label: this.label, value: s });
  }
  async setClosable(s) {
    return H("plugin:window|set_closable", { label: this.label, value: s });
  }
  async setTitle(s) {
    return H("plugin:window|set_title", { label: this.label, value: s });
  }
  async maximize() {
    return H("plugin:window|maximize", { label: this.label });
  }
  async unmaximize() {
    return H("plugin:window|unmaximize", { label: this.label });
  }
  async toggleMaximize() {
    return H("plugin:window|toggle_maximize", { label: this.label });
  }
  async minimize() {
    return H("plugin:window|minimize", { label: this.label });
  }
  async unminimize() {
    return H("plugin:window|unminimize", { label: this.label });
  }
  async show() {
    return H("plugin:window|show", { label: this.label });
  }
  async hide() {
    return H("plugin:window|hide", { label: this.label });
  }
  async close() {
    return H("plugin:window|close", { label: this.label });
  }
  async destroy() {
    return H("plugin:window|destroy", { label: this.label });
  }
  async setDecorations(s) {
    return H("plugin:window|set_decorations", { label: this.label, value: s });
  }
  async setShadow(s) {
    return H("plugin:window|set_shadow", { label: this.label, value: s });
  }
  async setEffects(s) {
    return H("plugin:window|set_effects", { label: this.label, value: s });
  }
  async clearEffects() {
    return H("plugin:window|set_effects", { label: this.label, value: null });
  }
  async setAlwaysOnTop(s) {
    return H("plugin:window|set_always_on_top", { label: this.label, value: s });
  }
  async setAlwaysOnBottom(s) {
    return H("plugin:window|set_always_on_bottom", { label: this.label, value: s });
  }
  async setContentProtected(s) {
    return H("plugin:window|set_content_protected", { label: this.label, value: s });
  }
  async setSize(s) {
    return H("plugin:window|set_size", { label: this.label, value: s instanceof Fa ? s : new Fa(s) });
  }
  async setMinSize(s) {
    return H("plugin:window|set_min_size", { label: this.label, value: s instanceof Fa ? s : s ? new Fa(s) : null });
  }
  async setMaxSize(s) {
    return H("plugin:window|set_max_size", { label: this.label, value: s instanceof Fa ? s : s ? new Fa(s) : null });
  }
  async setSizeConstraints(s) {
    function n(a) {
      return a ? { Logical: a } : null;
    }
    return H("plugin:window|set_size_constraints", { label: this.label, value: { minWidth: n(s == null ? void 0 : s.minWidth), minHeight: n(s == null ? void 0 : s.minHeight), maxWidth: n(s == null ? void 0 : s.maxWidth), maxHeight: n(s == null ? void 0 : s.maxHeight) } });
  }
  async setPosition(s) {
    return H("plugin:window|set_position", { label: this.label, value: s instanceof Ec ? s : new Ec(s) });
  }
  async setFullscreen(s) {
    return H("plugin:window|set_fullscreen", { label: this.label, value: s });
  }
  async setSimpleFullscreen(s) {
    return H("plugin:window|set_simple_fullscreen", { label: this.label, value: s });
  }
  async setFocus() {
    return H("plugin:window|set_focus", { label: this.label });
  }
  async setFocusable(s) {
    return H("plugin:window|set_focusable", { label: this.label, value: s });
  }
  async setIcon(s) {
    return H("plugin:window|set_icon", { label: this.label, value: Dc(s) });
  }
  async setSkipTaskbar(s) {
    return H("plugin:window|set_skip_taskbar", { label: this.label, value: s });
  }
  async setCursorGrab(s) {
    return H("plugin:window|set_cursor_grab", { label: this.label, value: s });
  }
  async setCursorVisible(s) {
    return H("plugin:window|set_cursor_visible", { label: this.label, value: s });
  }
  async setCursorIcon(s) {
    return H("plugin:window|set_cursor_icon", { label: this.label, value: s });
  }
  async setBackgroundColor(s) {
    return H("plugin:window|set_background_color", { color: s });
  }
  async setCursorPosition(s) {
    return H("plugin:window|set_cursor_position", { label: this.label, value: s instanceof Ec ? s : new Ec(s) });
  }
  async setIgnoreCursorEvents(s) {
    return H("plugin:window|set_ignore_cursor_events", { label: this.label, value: s });
  }
  async startDragging() {
    return H("plugin:window|start_dragging", { label: this.label });
  }
  async startResizeDragging(s) {
    return H("plugin:window|start_resize_dragging", { label: this.label, value: s });
  }
  async setBadgeCount(s) {
    return H("plugin:window|set_badge_count", { label: this.label, value: s });
  }
  async setBadgeLabel(s) {
    return H("plugin:window|set_badge_label", { label: this.label, value: s });
  }
  async setOverlayIcon(s) {
    return H("plugin:window|set_overlay_icon", { label: this.label, value: s ? Dc(s) : void 0 });
  }
  async setProgressBar(s) {
    return H("plugin:window|set_progress_bar", { label: this.label, value: s });
  }
  async setVisibleOnAllWorkspaces(s) {
    return H("plugin:window|set_visible_on_all_workspaces", { label: this.label, value: s });
  }
  async setTitleBarStyle(s) {
    return H("plugin:window|set_title_bar_style", { label: this.label, value: s });
  }
  async setTheme(s) {
    return H("plugin:window|set_theme", { label: this.label, value: s });
  }
  async onResized(s) {
    return this.listen(St.WINDOW_RESIZED, (n) => {
      n.payload = new Vn(n.payload), s(n);
    });
  }
  async onMoved(s) {
    return this.listen(St.WINDOW_MOVED, (n) => {
      n.payload = new Ut(n.payload), s(n);
    });
  }
  async onCloseRequested(s) {
    return this.listen(St.WINDOW_CLOSE_REQUESTED, async (n) => {
      const a = new _d(n);
      await s(a), a.isPreventDefault() || await this.destroy();
    });
  }
  async onDragDropEvent(s) {
    const n = await this.listen(St.DRAG_ENTER, (d) => {
      s({ ...d, payload: { type: "enter", paths: d.payload.paths, position: new Ut(d.payload.position) } });
    }), a = await this.listen(St.DRAG_OVER, (d) => {
      s({ ...d, payload: { type: "over", position: new Ut(d.payload.position) } });
    }), i = await this.listen(St.DRAG_DROP, (d) => {
      s({ ...d, payload: { type: "drop", paths: d.payload.paths, position: new Ut(d.payload.position) } });
    }), _ = await this.listen(St.DRAG_LEAVE, (d) => {
      s({ ...d, payload: { type: "leave" } });
    });
    return () => {
      n(), i(), a(), _();
    };
  }
  async onFocusChanged(s) {
    const n = await this.listen(St.WINDOW_FOCUS, (i) => {
      s({ ...i, payload: true });
    }), a = await this.listen(St.WINDOW_BLUR, (i) => {
      s({ ...i, payload: false });
    });
    return () => {
      n(), a();
    };
  }
  async onScaleChanged(s) {
    return this.listen(St.WINDOW_SCALE_FACTOR_CHANGED, s);
  }
  async onThemeChanged(s) {
    return this.listen(St.WINDOW_THEME_CHANGED, s);
  }
};
var Kb;
(function(o) {
  o.Disabled = "disabled", o.Throttle = "throttle", o.Suspend = "suspend";
})(Kb || (Kb = {}));
var Jb;
(function(o) {
  o.Default = "default", o.FluentOverlay = "fluentOverlay";
})(Jb || (Jb = {}));
var mf;
(function(o) {
  o.AppearanceBased = "appearanceBased", o.Light = "light", o.Dark = "dark", o.MediumLight = "mediumLight", o.UltraDark = "ultraDark", o.Titlebar = "titlebar", o.Selection = "selection", o.Menu = "menu", o.Popover = "popover", o.Sidebar = "sidebar", o.HeaderView = "headerView", o.Sheet = "sheet", o.WindowBackground = "windowBackground", o.HudWindow = "hudWindow", o.FullScreenUI = "fullScreenUI", o.Tooltip = "tooltip", o.ContentBackground = "contentBackground", o.UnderWindowBackground = "underWindowBackground", o.UnderPageBackground = "underPageBackground", o.Mica = "mica", o.Blur = "blur", o.Acrylic = "acrylic", o.Tabbed = "tabbed", o.TabbedDark = "tabbedDark", o.TabbedLight = "tabbedLight";
})(mf || (mf = {}));
var wf;
(function(o) {
  o.FollowsWindowActiveState = "followsWindowActiveState", o.Active = "active", o.Inactive = "inactive";
})(wf || (wf = {}));
function Rc(o) {
  return o === null ? null : { name: o.name, scaleFactor: o.scaleFactor, position: new Ut(o.position), size: new Vn(o.size), workArea: { position: new Ut(o.workArea.position), size: new Vn(o.workArea.size) } };
}
async function Dm() {
  return H("plugin:window|current_monitor").then(Rc);
}
async function Mm() {
  return H("plugin:window|primary_monitor").then(Rc);
}
async function Cm(o, s) {
  return H("plugin:window|monitor_from_point", { x: o, y: s }).then(Rc);
}
async function Rm() {
  return H("plugin:window|available_monitors").then((o) => o.map(Rc));
}
async function Um() {
  return H("plugin:window|cursor_position").then((o) => new Ut(o));
}
const Bm = Object.freeze(Object.defineProperty({ __proto__: null, CloseRequestedEvent: _d, get Effect() {
  return mf;
}, get EffectState() {
  return wf;
}, LogicalPosition: zf, LogicalSize: Tf, PhysicalPosition: Ut, PhysicalSize: Vn, get ProgressBarStatus() {
  return gf;
}, get UserAttentionType() {
  return Mc;
}, Window: Of, availableMonitors: Rm, currentMonitor: Dm, cursorPosition: Um, getAllWindows: Oc, getCurrentWindow: Cc, monitorFromPoint: Cm, primaryMonitor: Mm }, Symbol.toStringTag, { value: "Module" }));
function od() {
  return !!(window.__TAURI_INTERNALS__ || window.__TAURI__);
}
async function Nm() {
  if (od()) try {
    return await H("get_ui_chrome");
  } catch {
    return null;
  }
  try {
    const s = (await $a(() => Promise.resolve().then(() => cl), void 0)).get_ui_chrome_json;
    if (typeof s != "function") return null;
    const n = s();
    return n ? JSON.parse(n) : null;
  } catch {
    return null;
  }
}
function jm() {
  const [o, s] = F.useState(false), n = od();
  if (F.useEffect(() => {
    if (!n) return;
    let _ = false;
    const d = async () => {
      if (_) return;
      const S = await Nm();
      _ || s(!!S && (S.phase === 0 || S.settings_open || S.overlay_open));
    };
    d();
    const y = setInterval(() => void d(), 500);
    return () => {
      _ = true, clearInterval(y);
    };
  }, [n]), !n || !o) return null;
  const a = (_) => {
    _.button === 0 && (_.preventDefault(), _.stopPropagation(), Cc().startDragging().catch((d) => console.warn("[drag] startDragging failed", d)));
  }, i = () => {
    const _ = Cc();
    _.isMaximized().then((d) => d ? _.unmaximize() : _.maximize()).catch((d) => console.warn("[drag] maximize toggle failed", d));
  };
  return V.jsx("div", { "data-tauri-drag-region": true, onPointerDown: a, onDoubleClick: i, style: { position: "fixed", top: 0, left: 0, right: 0, height: 28, zIndex: 1e5, background: "rgba(0, 0, 0, 0.25)", borderBottom: "1px solid rgba(255, 255, 255, 0.08)", cursor: "grab", pointerEvents: "auto", display: "flex", alignItems: "center", justifyContent: "center", color: "#a89878", fontFamily: "monospace", fontSize: 10, userSelect: "none", WebkitUserSelect: "none" }, children: "drag to move" });
}
function qm(o, s, n) {
  return Atomics.waitAsync(o, s, n);
}
function Hm(o) {
  return o.async;
}
function Lm(o) {
  return o.value;
}
const Gm = Object.freeze({ I8: 0, 0: "I8", I16: 1, 1: "I16", I24: 2, 2: "I24", I32: 3, 3: "I32", I64: 4, 4: "I64", U8: 5, 5: "U8", U16: 6, 6: "U16", U24: 7, 7: "U24", U32: 8, 8: "U32", U64: 9, 9: "U64", F32: 10, 10: "F32", F64: 11, 11: "F64", DsdU8: 12, 12: "DsdU8", DsdU16: 13, 13: "DsdU16", DsdU32: 14, 14: "DsdU32" });
class yf {
  __destroy_into_raw() {
    const s = this.__wbg_ptr;
    return this.__wbg_ptr = 0, P1.unregister(this), s;
  }
  free() {
    const s = this.__destroy_into_raw();
    p.__wbg_streamconfig_free(s, 0);
  }
  get buffer_size() {
    const s = p.__wbg_get_streamconfig_buffer_size(this.__wbg_ptr);
    return s === 4294967297 ? void 0 : s;
  }
  get channels() {
    return p.__wbg_get_streamconfig_channels(this.__wbg_ptr);
  }
  get sample_rate() {
    return p.__wbg_get_streamconfig_sample_rate(this.__wbg_ptr) >>> 0;
  }
  set buffer_size(s) {
    p.__wbg_set_streamconfig_buffer_size(this.__wbg_ptr, J(s) ? 4294967297 : s >>> 0);
  }
  set channels(s) {
    p.__wbg_set_streamconfig_channels(this.__wbg_ptr, s);
  }
  set sample_rate(s) {
    p.__wbg_set_streamconfig_sample_rate(this.__wbg_ptr, s);
  }
}
Symbol.dispose && (yf.prototype[Symbol.dispose] = yf.prototype.free);
function sd(o, s) {
  const n = _e(s, p.__wbindgen_export, p.__wbindgen_export2), a = ae;
  p.dispatch_action(o, n, a);
}
function Ym() {
  let o, s;
  try {
    const i = p.__wbindgen_add_to_stack_pointer(-16);
    p.get_chat_log_json(i);
    var n = L().getInt32(i + 0, true), a = L().getInt32(i + 4, true);
    return o = n, s = a, q(n, a);
  } finally {
    p.__wbindgen_add_to_stack_pointer(16), p.__wbindgen_export4(o, s, 1);
  }
}
function Vm() {
  return p.get_fps() >>> 0;
}
function bd() {
  try {
    const n = p.__wbindgen_add_to_stack_pointer(-16);
    p.get_hovered_object_json(n);
    var o = L().getInt32(n + 0, true), s = L().getInt32(n + 4, true);
    let a;
    return o !== 0 && (a = q(o, s).slice(), p.__wbindgen_export4(o, s * 1, 1)), a;
  } finally {
    p.__wbindgen_add_to_stack_pointer(16);
  }
}
function Xm() {
  try {
    const n = p.__wbindgen_add_to_stack_pointer(-16);
    p.get_object_registry_json(n);
    var o = L().getInt32(n + 0, true), s = L().getInt32(n + 4, true);
    let a;
    return o !== 0 && (a = q(o, s).slice(), p.__wbindgen_export4(o, s * 1, 1)), a;
  } finally {
    p.__wbindgen_add_to_stack_pointer(16);
  }
}
function Qm() {
  return p.get_online_status() !== 0;
}
function Uc() {
  let o, s;
  try {
    const i = p.__wbindgen_add_to_stack_pointer(-16);
    p.get_player_state_json(i);
    var n = L().getInt32(i + 0, true), a = L().getInt32(i + 4, true);
    return o = n, s = a, q(n, a);
  } finally {
    p.__wbindgen_add_to_stack_pointer(16), p.__wbindgen_export4(o, s, 1);
  }
}
function dd() {
  try {
    const n = p.__wbindgen_add_to_stack_pointer(-16);
    p.get_selected_object_json(n);
    var o = L().getInt32(n + 0, true), s = L().getInt32(n + 4, true);
    let a;
    return o !== 0 && (a = q(o, s).slice(), p.__wbindgen_export4(o, s * 1, 1)), a;
  } finally {
    p.__wbindgen_add_to_stack_pointer(16);
  }
}
function Zm() {
  let o, s;
  try {
    const i = p.__wbindgen_add_to_stack_pointer(-16);
    p.get_signin_state_json(i);
    var n = L().getInt32(i + 0, true), a = L().getInt32(i + 4, true);
    return o = n, s = a, q(n, a);
  } finally {
    p.__wbindgen_add_to_stack_pointer(16), p.__wbindgen_export4(o, s, 1);
  }
}
function Km() {
  let o, s;
  try {
    const i = p.__wbindgen_add_to_stack_pointer(-16);
    p.get_ui_chrome_json(i);
    var n = L().getInt32(i + 0, true), a = L().getInt32(i + 4, true);
    return o = n, s = a, q(n, a);
  } finally {
    p.__wbindgen_add_to_stack_pointer(16), p.__wbindgen_export4(o, s, 1);
  }
}
function Jm(o, s) {
  const n = _e(o, p.__wbindgen_export, p.__wbindgen_export2), a = ae, i = _e(s, p.__wbindgen_export, p.__wbindgen_export2), _ = ae;
  p.go_online(n, a, i, _);
}
function km(o) {
  let s, n;
  try {
    const _ = p.__wbindgen_add_to_stack_pointer(-16), d = _e(o, p.__wbindgen_export, p.__wbindgen_export2), y = ae;
    p.greet(_, d, y);
    var a = L().getInt32(_ + 0, true), i = L().getInt32(_ + 4, true);
    return s = a, n = i, q(a, i);
  } finally {
    p.__wbindgen_add_to_stack_pointer(16), p.__wbindgen_export4(s, n, 1);
  }
}
function Wm(o) {
  const s = _e(o, p.__wbindgen_export, p.__wbindgen_export2), n = ae;
  return p.send_chat(s, n) !== 0;
}
function Im(o) {
  const s = _e(o, p.__wbindgen_export, p.__wbindgen_export2), n = ae;
  p.set_signed_in(s, n);
}
function Fm(o) {
  const s = _e(o, p.__wbindgen_export, p.__wbindgen_export2), n = ae;
  p.set_username(s, n);
}
function $m() {
  p.wasm_main();
}
function Pm() {
  return p.worker_count() >>> 0;
}
function e1() {
  p.worker_entry_point();
}
function gd(o) {
  return { __proto__: null, "./isometric_game_bg.js": { __proto__: null, __wbg_Error_83742b46f01ce22d: function(n, a) {
    const i = Error(q(n, a));
    return m(i);
  }, __wbg_String_8564e559799eccda: function(n, a) {
    const i = String(c(a)), _ = _e(i, p.__wbindgen_export, p.__wbindgen_export2), d = ae;
    L().setInt32(n + 4, d, true), L().setInt32(n + 0, _, true);
  }, __wbg_Window_3d0268df3530e70f: function(n) {
    const a = c(n).Window;
    return m(a);
  }, __wbg_Window_a07901001eb4269f: function(n) {
    const a = c(n).Window;
    return m(a);
  }, __wbg_Window_c7f91e3f80ae0a0e: function(n) {
    const a = c(n).Window;
    return m(a);
  }, __wbg_WorkerGlobalScope_d1b9459d53a39f3d: function(n) {
    const a = c(n).WorkerGlobalScope;
    return m(a);
  }, __wbg_WorkerGlobalScope_eb29ae6fbed1fc86: function(n) {
    const a = c(n).WorkerGlobalScope;
    return m(a);
  }, __wbg___wbindgen_bigint_get_as_i64_447a76b5c6ef7bda: function(n, a) {
    const i = c(a), _ = typeof i == "bigint" ? i : void 0;
    L().setBigInt64(n + 8, J(_) ? BigInt(0) : _, true), L().setInt32(n + 0, !J(_), true);
  }, __wbg___wbindgen_boolean_get_c0f3f60bac5a78d1: function(n) {
    const a = c(n), i = typeof a == "boolean" ? a : void 0;
    return J(i) ? 16777215 : i ? 1 : 0;
  }, __wbg___wbindgen_debug_string_5398f5bb970e0daa: function(n, a) {
    const i = hf(c(a)), _ = _e(i, p.__wbindgen_export, p.__wbindgen_export2), d = ae;
    L().setInt32(n + 4, d, true), L().setInt32(n + 0, _, true);
  }, __wbg___wbindgen_in_41dbb8413020e076: function(n, a) {
    return c(n) in c(a);
  }, __wbg___wbindgen_is_bigint_e2141d4f045b7eda: function(n) {
    return typeof c(n) == "bigint";
  }, __wbg___wbindgen_is_falsy_30906e697739fcc2: function(n) {
    return !c(n);
  }, __wbg___wbindgen_is_function_3c846841762788c1: function(n) {
    return typeof c(n) == "function";
  }, __wbg___wbindgen_is_null_0b605fc6b167c56f: function(n) {
    return c(n) === null;
  }, __wbg___wbindgen_is_object_781bc9f159099513: function(n) {
    const a = c(n);
    return typeof a == "object" && a !== null;
  }, __wbg___wbindgen_is_string_7ef6b97b02428fae: function(n) {
    return typeof c(n) == "string";
  }, __wbg___wbindgen_is_undefined_52709e72fb9f179c: function(n) {
    return c(n) === void 0;
  }, __wbg___wbindgen_jsval_eq_ee31bfad3e536463: function(n, a) {
    return c(n) === c(a);
  }, __wbg___wbindgen_jsval_loose_eq_5bcc3bed3c69e72b: function(n, a) {
    return c(n) == c(a);
  }, __wbg___wbindgen_memory_edb3f01e3930bbf6: function() {
    const n = p.memory;
    return m(n);
  }, __wbg___wbindgen_number_get_34bb9d9dcfa21373: function(n, a) {
    const i = c(a), _ = typeof i == "number" ? i : void 0;
    L().setFloat64(n + 8, J(_) ? 0 : _, true), L().setInt32(n + 0, !J(_), true);
  }, __wbg___wbindgen_rethrow_5d3a9250cec92549: function(n) {
    throw Gt(n);
  }, __wbg___wbindgen_string_get_395e606bd0ee4427: function(n, a) {
    const i = c(a), _ = typeof i == "string" ? i : void 0;
    var d = J(_) ? 0 : _e(_, p.__wbindgen_export, p.__wbindgen_export2), y = ae;
    L().setInt32(n + 4, y, true), L().setInt32(n + 0, d, true);
  }, __wbg___wbindgen_throw_6ddd609b62940d55: function(n, a) {
    throw new Error(q(n, a));
  }, __wbg__wbg_cb_unref_6b5b6b8576d35cb1: function(n) {
    c(n)._wbg_cb_unref();
  }, __wbg_abort_5ef96933660780b7: function(n) {
    c(n).abort();
  }, __wbg_activeElement_c2981ba623ac16d9: function(n) {
    const a = c(n).activeElement;
    return J(a) ? 0 : m(a);
  }, __wbg_activeTexture_11610c2c57e26cfa: function(n, a) {
    c(n).activeTexture(a >>> 0);
  }, __wbg_activeTexture_66fa8cafd3610ddb: function(n, a) {
    c(n).activeTexture(a >>> 0);
  }, __wbg_addEventListener_2d985aa8a656f6dc: function() {
    return O(function(n, a, i, _) {
      c(n).addEventListener(q(a, i), c(_));
    }, arguments);
  }, __wbg_addListener_af610a227738fed8: function() {
    return O(function(n, a) {
      c(n).addListener(c(a));
    }, arguments);
  }, __wbg_altKey_7f2c3a24bf5420ae: function(n) {
    return c(n).altKey;
  }, __wbg_altKey_a8e58d65866de029: function(n) {
    return c(n).altKey;
  }, __wbg_animate_8f41e2f47c7d04ab: function(n, a, i) {
    const _ = c(n).animate(c(a), c(i));
    return m(_);
  }, __wbg_appendChild_8cb157b6ec5612a6: function() {
    return O(function(n, a) {
      const i = c(n).appendChild(c(a));
      return m(i);
    }, arguments);
  }, __wbg_arrayBuffer_eb8e9ca620af2a19: function() {
    return O(function(n) {
      const a = c(n).arrayBuffer();
      return m(a);
    }, arguments);
  }, __wbg_async_8532fa2513360fbc: function(n) {
    return c(n).async;
  }, __wbg_async_b33e4cb28c6b2093: function(n) {
    return c(n).async;
  }, __wbg_async_cb71ca8525c0f8b7: function(n) {
    return c(n).async;
  }, __wbg_atomics_wait_async_a11d741af1e77056: function(n, a, i) {
    const _ = qm(c(n), a >>> 0, i);
    return m(_);
  }, __wbg_attachShader_6426e8576a115345: function(n, a, i) {
    c(n).attachShader(c(a), c(i));
  }, __wbg_attachShader_e557f37438249ff7: function(n, a, i) {
    c(n).attachShader(c(a), c(i));
  }, __wbg_axes_4ba58f8779c5d176: function(n) {
    const a = c(n).axes;
    return m(a);
  }, __wbg_beginComputePass_705eb14eefc2b94e: function(n, a) {
    const i = c(n).beginComputePass(c(a));
    return m(i);
  }, __wbg_beginQuery_ac2ef47e00ec594a: function(n, a, i) {
    c(n).beginQuery(a >>> 0, c(i));
  }, __wbg_beginRenderPass_10e1d8bb36f2f74e: function() {
    return O(function(n, a) {
      const i = c(n).beginRenderPass(c(a));
      return m(i);
    }, arguments);
  }, __wbg_bindAttribLocation_1d976e3bcc954adb: function(n, a, i, _, d) {
    c(n).bindAttribLocation(c(a), i >>> 0, q(_, d));
  }, __wbg_bindAttribLocation_8791402cc151e914: function(n, a, i, _, d) {
    c(n).bindAttribLocation(c(a), i >>> 0, q(_, d));
  }, __wbg_bindBufferRange_469c3643c2099003: function(n, a, i, _, d, y) {
    c(n).bindBufferRange(a >>> 0, i >>> 0, c(_), d, y);
  }, __wbg_bindBuffer_142694a9732bc098: function(n, a, i) {
    c(n).bindBuffer(a >>> 0, c(i));
  }, __wbg_bindBuffer_d2a4f6cfb33336fb: function(n, a, i) {
    c(n).bindBuffer(a >>> 0, c(i));
  }, __wbg_bindFramebuffer_4643a12ca1c72776: function(n, a, i) {
    c(n).bindFramebuffer(a >>> 0, c(i));
  }, __wbg_bindFramebuffer_fdc7c38f1c700e64: function(n, a, i) {
    c(n).bindFramebuffer(a >>> 0, c(i));
  }, __wbg_bindRenderbuffer_91db2fc67c1f0115: function(n, a, i) {
    c(n).bindRenderbuffer(a >>> 0, c(i));
  }, __wbg_bindRenderbuffer_e6cfc20b6ebcf605: function(n, a, i) {
    c(n).bindRenderbuffer(a >>> 0, c(i));
  }, __wbg_bindSampler_be3a05e88cecae98: function(n, a, i) {
    c(n).bindSampler(a >>> 0, c(i));
  }, __wbg_bindTexture_6a0892cd752b41d9: function(n, a, i) {
    c(n).bindTexture(a >>> 0, c(i));
  }, __wbg_bindTexture_6e7e157d0aabe457: function(n, a, i) {
    c(n).bindTexture(a >>> 0, c(i));
  }, __wbg_bindVertexArrayOES_082b0791772327fa: function(n, a) {
    c(n).bindVertexArrayOES(c(a));
  }, __wbg_bindVertexArray_c307251f3ff61930: function(n, a) {
    c(n).bindVertexArray(c(a));
  }, __wbg_blendColor_b4c7d8333af4876d: function(n, a, i, _, d) {
    c(n).blendColor(a, i, _, d);
  }, __wbg_blendColor_c2771aead110c867: function(n, a, i, _, d) {
    c(n).blendColor(a, i, _, d);
  }, __wbg_blendEquationSeparate_b08aba1c715cb265: function(n, a, i) {
    c(n).blendEquationSeparate(a >>> 0, i >>> 0);
  }, __wbg_blendEquationSeparate_f16ada84ba672878: function(n, a, i) {
    c(n).blendEquationSeparate(a >>> 0, i >>> 0);
  }, __wbg_blendEquation_46367a891604b604: function(n, a) {
    c(n).blendEquation(a >>> 0);
  }, __wbg_blendEquation_c353d94b097007e5: function(n, a) {
    c(n).blendEquation(a >>> 0);
  }, __wbg_blendFuncSeparate_6aae138b81d75b47: function(n, a, i, _, d) {
    c(n).blendFuncSeparate(a >>> 0, i >>> 0, _ >>> 0, d >>> 0);
  }, __wbg_blendFuncSeparate_8c91c200b1a72e4b: function(n, a, i, _, d) {
    c(n).blendFuncSeparate(a >>> 0, i >>> 0, _ >>> 0, d >>> 0);
  }, __wbg_blendFunc_2e98c5f57736e5f3: function(n, a, i) {
    c(n).blendFunc(a >>> 0, i >>> 0);
  }, __wbg_blendFunc_4ce0991003a9468e: function(n, a, i) {
    c(n).blendFunc(a >>> 0, i >>> 0);
  }, __wbg_blitFramebuffer_c1a68feaca974c87: function(n, a, i, _, d, y, S, h, B, R, X) {
    c(n).blitFramebuffer(a, i, _, d, y, S, h, B, R >>> 0, X >>> 0);
  }, __wbg_blockSize_5871fe73cc8dcba0: function(n) {
    return c(n).blockSize;
  }, __wbg_body_5eb99e7257e5ae34: function(n) {
    const a = c(n).body;
    return J(a) ? 0 : m(a);
  }, __wbg_brand_3bc196a43eceb8af: function(n, a) {
    const i = c(a).brand, _ = _e(i, p.__wbindgen_export, p.__wbindgen_export2), d = ae;
    L().setInt32(n + 4, d, true), L().setInt32(n + 0, _, true);
  }, __wbg_brands_b7dcf262485c3e7c: function(n) {
    const a = c(n).brands;
    return m(a);
  }, __wbg_bufferData_730b629ba3f6824f: function(n, a, i, _) {
    c(n).bufferData(a >>> 0, i, _ >>> 0);
  }, __wbg_bufferData_d20232e3d5dcdc62: function(n, a, i, _) {
    c(n).bufferData(a >>> 0, c(i), _ >>> 0);
  }, __wbg_bufferData_d3bd8c69ff4b7254: function(n, a, i, _) {
    c(n).bufferData(a >>> 0, c(i), _ >>> 0);
  }, __wbg_bufferData_fb2d946faa09a60b: function(n, a, i, _) {
    c(n).bufferData(a >>> 0, i, _ >>> 0);
  }, __wbg_bufferSubData_3fcefd4648de39b5: function(n, a, i, _) {
    c(n).bufferSubData(a >>> 0, i, c(_));
  }, __wbg_bufferSubData_7b112eb88657e7c0: function(n, a, i, _) {
    c(n).bufferSubData(a >>> 0, i, c(_));
  }, __wbg_buffer_60b8043cd926067d: function(n) {
    const a = c(n).buffer;
    return m(a);
  }, __wbg_buffer_eb2779983eb67380: function(n) {
    const a = c(n).buffer;
    return m(a);
  }, __wbg_button_bdc91677bd7bbf58: function(n) {
    return c(n).button;
  }, __wbg_buttons_a18e71d5dcec8ba9: function(n) {
    return c(n).buttons;
  }, __wbg_buttons_ed0c8b1fa9af7a25: function(n) {
    const a = c(n).buttons;
    return m(a);
  }, __wbg_call_2d781c1f4d5c0ef8: function() {
    return O(function(n, a, i) {
      const _ = c(n).call(c(a), c(i));
      return m(_);
    }, arguments);
  }, __wbg_call_e133b57c9155d22c: function() {
    return O(function(n, a) {
      const i = c(n).call(c(a));
      return m(i);
    }, arguments);
  }, __wbg_call_f858478a02f9600f: function() {
    return O(function(n, a, i, _, d) {
      const y = c(n).call(c(a), c(i), c(_), c(d));
      return m(y);
    }, arguments);
  }, __wbg_cancelAnimationFrame_43fad84647f46036: function() {
    return O(function(n, a) {
      c(n).cancelAnimationFrame(a);
    }, arguments);
  }, __wbg_cancelIdleCallback_d3eb47e732dd4bcd: function(n, a) {
    c(n).cancelIdleCallback(a >>> 0);
  }, __wbg_cancel_65f38182e2eeac5c: function(n) {
    c(n).cancel();
  }, __wbg_catch_d7ed0375ab6532a5: function(n, a) {
    const i = c(n).catch(c(a));
    return m(i);
  }, __wbg_clearBuffer_700f6bba0d974e6c: function(n, a, i) {
    c(n).clearBuffer(c(a), i);
  }, __wbg_clearBuffer_b67061873f997b6a: function(n, a, i, _) {
    c(n).clearBuffer(c(a), i, _);
  }, __wbg_clearBufferfv_7bc3e789059fd29b: function(n, a, i, _, d) {
    c(n).clearBufferfv(a >>> 0, i, je(_, d));
  }, __wbg_clearBufferiv_050b376a7480ef9c: function(n, a, i, _, d) {
    c(n).clearBufferiv(a >>> 0, i, Gn(_, d));
  }, __wbg_clearBufferuiv_d75635e80261ea93: function(n, a, i, _, d) {
    c(n).clearBufferuiv(a >>> 0, i, _a(_, d));
  }, __wbg_clearDepth_0fb1b5aba2ff2d63: function(n, a) {
    c(n).clearDepth(a);
  }, __wbg_clearDepth_3ff5ef5e5fad4016: function(n, a) {
    c(n).clearDepth(a);
  }, __wbg_clearStencil_0e5924dc2f0fa2b7: function(n, a) {
    c(n).clearStencil(a);
  }, __wbg_clearStencil_4505636e726114d0: function(n, a) {
    c(n).clearStencil(a);
  }, __wbg_clearTimeout_113b1cde814ec762: function(n) {
    const a = clearTimeout(Gt(n));
    return m(a);
  }, __wbg_clearTimeout_fdfb5a1468af1a97: function(n, a) {
    c(n).clearTimeout(a);
  }, __wbg_clear_3d6ad4729e206aac: function(n, a) {
    c(n).clear(a >>> 0);
  }, __wbg_clear_5a0606f7c62ad39a: function(n, a) {
    c(n).clear(a >>> 0);
  }, __wbg_clientWaitSync_5402aac488fc18bb: function(n, a, i, _) {
    return c(n).clientWaitSync(c(a), i >>> 0, _ >>> 0);
  }, __wbg_clipboard_0285d75eacda5282: function(n) {
    const a = c(n).clipboard;
    return m(a);
  }, __wbg_close_08da3e8ce8a35dc2: function(n, a) {
    c(n).close(c(a));
  }, __wbg_close_87218c1c5fa30509: function() {
    return O(function(n) {
      const a = c(n).close();
      return m(a);
    }, arguments);
  }, __wbg_close_a86fff250f8aa14f: function() {
    return O(function(n, a, i, _) {
      c(n).close(a, q(i, _));
    }, arguments);
  }, __wbg_close_ab55423854e61546: function(n) {
    c(n).close();
  }, __wbg_close_af26905c832a88cb: function() {
    return O(function(n) {
      c(n).close();
    }, arguments);
  }, __wbg_close_b511f9aac1bec666: function(n) {
    c(n).close();
  }, __wbg_close_cbf870bdad0aad99: function(n) {
    c(n).close();
  }, __wbg_closed_fa5c07e5d468802f: function() {
    return O(function(n) {
      const a = c(n).closed;
      return m(a);
    }, arguments);
  }, __wbg_code_3c69123dcbcf263d: function(n, a) {
    const i = c(a).code, _ = _e(i, p.__wbindgen_export, p.__wbindgen_export2), d = ae;
    L().setInt32(n + 4, d, true), L().setInt32(n + 0, _, true);
  }, __wbg_code_aea376e2d265a64f: function(n) {
    return c(n).code;
  }, __wbg_colorMask_b053114f7da42448: function(n, a, i, _, d) {
    c(n).colorMask(a !== 0, i !== 0, _ !== 0, d !== 0);
  }, __wbg_colorMask_b47840e05b5f8181: function(n, a, i, _, d) {
    c(n).colorMask(a !== 0, i !== 0, _ !== 0, d !== 0);
  }, __wbg_compileShader_623a1051cf49494b: function(n, a) {
    c(n).compileShader(c(a));
  }, __wbg_compileShader_7ca66245c2798601: function(n, a) {
    c(n).compileShader(c(a));
  }, __wbg_compressedTexSubImage2D_593058a6f5aca176: function(n, a, i, _, d, y, S, h, B) {
    c(n).compressedTexSubImage2D(a >>> 0, i, _, d, y, S, h >>> 0, c(B));
  }, __wbg_compressedTexSubImage2D_aab12b65159c282e: function(n, a, i, _, d, y, S, h, B) {
    c(n).compressedTexSubImage2D(a >>> 0, i, _, d, y, S, h >>> 0, c(B));
  }, __wbg_compressedTexSubImage2D_f3c4ae95ef9d2420: function(n, a, i, _, d, y, S, h, B, R) {
    c(n).compressedTexSubImage2D(a >>> 0, i, _, d, y, S, h >>> 0, B, R);
  }, __wbg_compressedTexSubImage3D_77a6ab77487aa211: function(n, a, i, _, d, y, S, h, B, R, X, ie) {
    c(n).compressedTexSubImage3D(a >>> 0, i, _, d, y, S, h, B, R >>> 0, X, ie);
  }, __wbg_compressedTexSubImage3D_95f64742aae944b8: function(n, a, i, _, d, y, S, h, B, R, X) {
    c(n).compressedTexSubImage3D(a >>> 0, i, _, d, y, S, h, B, R >>> 0, c(X));
  }, __wbg_configure_3d64c677c7d68a15: function() {
    return O(function(n, a) {
      c(n).configure(c(a));
    }, arguments);
  }, __wbg_connect_3ca85e8e3b8d9828: function() {
    return O(function(n, a) {
      const i = c(n).connect(c(a));
      return m(i);
    }, arguments);
  }, __wbg_connected_8628961b3a47d6ce: function(n) {
    return c(n).connected;
  }, __wbg_contains_6b23671a193f58e5: function(n, a) {
    return c(n).contains(c(a));
  }, __wbg_contentRect_7047bba46353f683: function(n) {
    const a = c(n).contentRect;
    return m(a);
  }, __wbg_copyBufferSubData_aaeed526e555f0d1: function(n, a, i, _, d, y) {
    c(n).copyBufferSubData(a >>> 0, i >>> 0, _, d, y);
  }, __wbg_copyBufferToBuffer_8bb974c7f9c5f4dc: function() {
    return O(function(n, a, i, _, d) {
      c(n).copyBufferToBuffer(c(a), i, c(_), d);
    }, arguments);
  }, __wbg_copyBufferToBuffer_8fe240a0000c9e22: function() {
    return O(function(n, a, i, _, d, y) {
      c(n).copyBufferToBuffer(c(a), i, c(_), d, y);
    }, arguments);
  }, __wbg_copyTexSubImage2D_08a10bcd45b88038: function(n, a, i, _, d, y, S, h, B) {
    c(n).copyTexSubImage2D(a >>> 0, i, _, d, y, S, h, B);
  }, __wbg_copyTexSubImage2D_b9a10d000c616b3e: function(n, a, i, _, d, y, S, h, B) {
    c(n).copyTexSubImage2D(a >>> 0, i, _, d, y, S, h, B);
  }, __wbg_copyTexSubImage3D_7fcdf7c85bc308a5: function(n, a, i, _, d, y, S, h, B, R) {
    c(n).copyTexSubImage3D(a >>> 0, i, _, d, y, S, h, B, R);
  }, __wbg_copyTextureToBuffer_4186c16aef1922a5: function() {
    return O(function(n, a, i, _) {
      c(n).copyTextureToBuffer(c(a), c(i), c(_));
    }, arguments);
  }, __wbg_copyTextureToTexture_1be188df1e535c0a: function() {
    return O(function(n, a, i, _) {
      c(n).copyTextureToTexture(c(a), c(i), c(_));
    }, arguments);
  }, __wbg_copyToChannel_7b2719b823d2b2b7: function() {
    return O(function(n, a, i) {
      c(n).copyToChannel(c(a), i);
    }, arguments);
  }, __wbg_createBindGroupLayout_9ea1a44942aaf13e: function() {
    return O(function(n, a) {
      const i = c(n).createBindGroupLayout(c(a));
      return m(i);
    }, arguments);
  }, __wbg_createBindGroup_2320df4db188406c: function(n, a) {
    const i = c(n).createBindGroup(c(a));
    return m(i);
  }, __wbg_createBufferSource_7102af74fcd1a840: function() {
    return O(function(n) {
      const a = c(n).createBufferSource();
      return m(a);
    }, arguments);
  }, __wbg_createBuffer_1aa34315dc9585a2: function(n) {
    const a = c(n).createBuffer();
    return J(a) ? 0 : m(a);
  }, __wbg_createBuffer_2f08c0205e04efca: function() {
    return O(function(n, a) {
      const i = c(n).createBuffer(c(a));
      return m(i);
    }, arguments);
  }, __wbg_createBuffer_8e47b88217a98607: function(n) {
    const a = c(n).createBuffer();
    return J(a) ? 0 : m(a);
  }, __wbg_createBuffer_ed2bd7b52878b3fa: function() {
    return O(function(n, a, i, _) {
      const d = c(n).createBuffer(a >>> 0, i >>> 0, _);
      return m(d);
    }, arguments);
  }, __wbg_createCommandEncoder_cd88faca35d9ed68: function(n, a) {
    const i = c(n).createCommandEncoder(c(a));
    return m(i);
  }, __wbg_createComputePipeline_3e135ff73c8fc483: function(n, a) {
    const i = c(n).createComputePipeline(c(a));
    return m(i);
  }, __wbg_createElement_9b0aab265c549ded: function() {
    return O(function(n, a, i) {
      const _ = c(n).createElement(q(a, i));
      return m(_);
    }, arguments);
  }, __wbg_createFramebuffer_911d55689ff8358e: function(n) {
    const a = c(n).createFramebuffer();
    return J(a) ? 0 : m(a);
  }, __wbg_createFramebuffer_97d39363cdd9242a: function(n) {
    const a = c(n).createFramebuffer();
    return J(a) ? 0 : m(a);
  }, __wbg_createImageBitmap_46791779dcbfb789: function() {
    return O(function(n, a, i) {
      const _ = c(n).createImageBitmap(c(a), c(i));
      return m(_);
    }, arguments);
  }, __wbg_createIndex_323cb0213cc21d9b: function() {
    return O(function(n, a, i, _, d) {
      const y = c(n).createIndex(q(a, i), c(_), c(d));
      return m(y);
    }, arguments);
  }, __wbg_createObjectStore_4709de9339ffc6c0: function() {
    return O(function(n, a, i, _) {
      const d = c(n).createObjectStore(q(a, i), c(_));
      return m(d);
    }, arguments);
  }, __wbg_createObjectURL_f141426bcc1f70aa: function() {
    return O(function(n, a) {
      const i = URL.createObjectURL(c(a)), _ = _e(i, p.__wbindgen_export, p.__wbindgen_export2), d = ae;
      L().setInt32(n + 4, d, true), L().setInt32(n + 0, _, true);
    }, arguments);
  }, __wbg_createPipelineLayout_7a186f2e9bf0d605: function(n, a) {
    const i = c(n).createPipelineLayout(c(a));
    return m(i);
  }, __wbg_createProgram_1fa32901e4db13cd: function(n) {
    const a = c(n).createProgram();
    return J(a) ? 0 : m(a);
  }, __wbg_createProgram_8eb14525e7fcffb8: function(n) {
    const a = c(n).createProgram();
    return J(a) ? 0 : m(a);
  }, __wbg_createQuery_0f754c13ae341f39: function(n) {
    const a = c(n).createQuery();
    return J(a) ? 0 : m(a);
  }, __wbg_createRenderPipeline_f48187ba9f7701e8: function() {
    return O(function(n, a) {
      const i = c(n).createRenderPipeline(c(a));
      return m(i);
    }, arguments);
  }, __wbg_createRenderbuffer_69fb8c438e70e494: function(n) {
    const a = c(n).createRenderbuffer();
    return J(a) ? 0 : m(a);
  }, __wbg_createRenderbuffer_8847d6a81975caee: function(n) {
    const a = c(n).createRenderbuffer();
    return J(a) ? 0 : m(a);
  }, __wbg_createSampler_248bd67c920af37d: function(n, a) {
    const i = c(n).createSampler(c(a));
    return m(i);
  }, __wbg_createSampler_7bed7d46769be9a7: function(n) {
    const a = c(n).createSampler();
    return J(a) ? 0 : m(a);
  }, __wbg_createShaderModule_53701de4fb271c90: function(n, a) {
    const i = c(n).createShaderModule(c(a));
    return m(i);
  }, __wbg_createShader_9ffc9dc1832608d7: function(n, a) {
    const i = c(n).createShader(a >>> 0);
    return J(i) ? 0 : m(i);
  }, __wbg_createShader_a00913b8c6489e6b: function(n, a) {
    const i = c(n).createShader(a >>> 0);
    return J(i) ? 0 : m(i);
  }, __wbg_createTexture_9b1b4f40cab0097b: function(n) {
    const a = c(n).createTexture();
    return J(a) ? 0 : m(a);
  }, __wbg_createTexture_9e76b80a2dc0d12e: function() {
    return O(function(n, a) {
      const i = c(n).createTexture(c(a));
      return m(i);
    }, arguments);
  }, __wbg_createTexture_ceb367c3528574ec: function(n) {
    const a = c(n).createTexture();
    return J(a) ? 0 : m(a);
  }, __wbg_createVertexArrayOES_1b30eca82fb89274: function(n) {
    const a = c(n).createVertexArrayOES();
    return J(a) ? 0 : m(a);
  }, __wbg_createVertexArray_420460898dc8d838: function(n) {
    const a = c(n).createVertexArray();
    return J(a) ? 0 : m(a);
  }, __wbg_createView_cc96b5bdd3d5bf5e: function() {
    return O(function(n, a) {
      const i = c(n).createView(c(a));
      return m(i);
    }, arguments);
  }, __wbg_crypto_38df2bab126b63dc: function(n) {
    const a = c(n).crypto;
    return m(a);
  }, __wbg_ctrlKey_6f8a95d15c098679: function(n) {
    return c(n).ctrlKey;
  }, __wbg_ctrlKey_a41da599a72ee93d: function(n) {
    return c(n).ctrlKey;
  }, __wbg_cullFace_2c9f57c2f90cbe70: function(n, a) {
    c(n).cullFace(a >>> 0);
  }, __wbg_cullFace_d759515c1199276c: function(n, a) {
    c(n).cullFace(a >>> 0);
  }, __wbg_currentTime_5f6bbe3d7b1a6fbf: function(n) {
    return c(n).currentTime;
  }, __wbg_data_a3d9ff9cdd801002: function(n) {
    const a = c(n).data;
    return m(a);
  }, __wbg_datagrams_7bf9e7994926631a: function(n) {
    const a = c(n).datagrams;
    return m(a);
  }, __wbg_debug_271c16e6de0bc226: function(n, a, i, _) {
    console.debug(c(n), c(a), c(i), c(_));
  }, __wbg_decode_b645e759f92c7fe0: function(n) {
    const a = c(n).decode();
    return m(a);
  }, __wbg_deleteBuffer_a2f8244b249c356e: function(n, a) {
    c(n).deleteBuffer(c(a));
  }, __wbg_deleteBuffer_b053c58b4ed1ab1c: function(n, a) {
    c(n).deleteBuffer(c(a));
  }, __wbg_deleteFramebuffer_1af8b97d40962089: function(n, a) {
    c(n).deleteFramebuffer(c(a));
  }, __wbg_deleteFramebuffer_badadfcd45ef5e64: function(n, a) {
    c(n).deleteFramebuffer(c(a));
  }, __wbg_deleteIndex_9391b8bace7b0b18: function() {
    return O(function(n, a, i) {
      c(n).deleteIndex(q(a, i));
    }, arguments);
  }, __wbg_deleteObjectStore_65401ab024ac08c1: function() {
    return O(function(n, a, i) {
      c(n).deleteObjectStore(q(a, i));
    }, arguments);
  }, __wbg_deleteProgram_cb8f79d5c1e84863: function(n, a) {
    c(n).deleteProgram(c(a));
  }, __wbg_deleteProgram_fc1d8d77ef7e154d: function(n, a) {
    c(n).deleteProgram(c(a));
  }, __wbg_deleteQuery_9420681ec3d643ef: function(n, a) {
    c(n).deleteQuery(c(a));
  }, __wbg_deleteRenderbuffer_401ffe15b179c343: function(n, a) {
    c(n).deleteRenderbuffer(c(a));
  }, __wbg_deleteRenderbuffer_b030660bf2e9fc95: function(n, a) {
    c(n).deleteRenderbuffer(c(a));
  }, __wbg_deleteSampler_8111fd44b061bdd1: function(n, a) {
    c(n).deleteSampler(c(a));
  }, __wbg_deleteShader_5b6992b5e5894d44: function(n, a) {
    c(n).deleteShader(c(a));
  }, __wbg_deleteShader_a8e5ccb432053dbe: function(n, a) {
    c(n).deleteShader(c(a));
  }, __wbg_deleteSync_deeb154f55e59a7d: function(n, a) {
    c(n).deleteSync(c(a));
  }, __wbg_deleteTexture_00ecab74f7bddf91: function(n, a) {
    c(n).deleteTexture(c(a));
  }, __wbg_deleteTexture_d8b1d278731e0c9f: function(n, a) {
    c(n).deleteTexture(c(a));
  }, __wbg_deleteVertexArrayOES_9da21e3515bf556e: function(n, a) {
    c(n).deleteVertexArrayOES(c(a));
  }, __wbg_deleteVertexArray_5a75f4855c2881df: function(n, a) {
    c(n).deleteVertexArray(c(a));
  }, __wbg_deltaMode_e239727f16c7ad68: function(n) {
    return c(n).deltaMode;
  }, __wbg_deltaX_74ad854454fab779: function(n) {
    return c(n).deltaX;
  }, __wbg_deltaY_c6ccae416e166d01: function(n) {
    return c(n).deltaY;
  }, __wbg_depthFunc_0376ef69458b01d8: function(n, a) {
    c(n).depthFunc(a >>> 0);
  }, __wbg_depthFunc_befeae10cb29920d: function(n, a) {
    c(n).depthFunc(a >>> 0);
  }, __wbg_depthMask_c6c1b0d88ade6c84: function(n, a) {
    c(n).depthMask(a !== 0);
  }, __wbg_depthMask_fd5bc408415b9cd3: function(n, a) {
    c(n).depthMask(a !== 0);
  }, __wbg_depthRange_b42d493a2b9258aa: function(n, a, i) {
    c(n).depthRange(a, i);
  }, __wbg_depthRange_ebba8110d3fe0332: function(n, a, i) {
    c(n).depthRange(a, i);
  }, __wbg_description_18d0a6d4077fec8e: function(n, a) {
    const i = c(a).description, _ = _e(i, p.__wbindgen_export, p.__wbindgen_export2), d = ae;
    L().setInt32(n + 4, d, true), L().setInt32(n + 0, _, true);
  }, __wbg_destination_d1f70fe081ff0932: function(n) {
    const a = c(n).destination;
    return m(a);
  }, __wbg_destroy_b5b39f25f0799295: function(n) {
    c(n).destroy();
  }, __wbg_devicePixelContentBoxSize_82a5f309b4b96a31: function(n) {
    const a = c(n).devicePixelContentBoxSize;
    return m(a);
  }, __wbg_devicePixelRatio_c36a5fab28da634e: function(n) {
    return c(n).devicePixelRatio;
  }, __wbg_disableVertexAttribArray_124a165b099b763b: function(n, a) {
    c(n).disableVertexAttribArray(a >>> 0);
  }, __wbg_disableVertexAttribArray_c4f42277355986c0: function(n, a) {
    c(n).disableVertexAttribArray(a >>> 0);
  }, __wbg_disable_62ec2189c50a0db7: function(n, a) {
    c(n).disable(a >>> 0);
  }, __wbg_disable_7731e2f3362ef1c5: function(n, a) {
    c(n).disable(a >>> 0);
  }, __wbg_disconnect_09ddbc78942a2057: function(n) {
    c(n).disconnect();
  }, __wbg_disconnect_21257e7fa524a113: function(n) {
    c(n).disconnect();
  }, __wbg_dispatchWorkgroupsIndirect_07e3b56efd02764b: function(n, a, i) {
    c(n).dispatchWorkgroupsIndirect(c(a), i);
  }, __wbg_dispatchWorkgroups_0cf298d736b85a78: function(n, a, i, _) {
    c(n).dispatchWorkgroups(a >>> 0, i >>> 0, _ >>> 0);
  }, __wbg_document_c0320cd4183c6d9b: function(n) {
    const a = c(n).document;
    return J(a) ? 0 : m(a);
  }, __wbg_done_08ce71ee07e3bd17: function(n) {
    return c(n).done;
  }, __wbg_done_e8993c30afbbe414: function(n) {
    return c(n).done;
  }, __wbg_drawArraysInstancedANGLE_20ee4b8f67503b54: function(n, a, i, _, d) {
    c(n).drawArraysInstancedANGLE(a >>> 0, i, _, d);
  }, __wbg_drawArraysInstanced_13e40fca13079ade: function(n, a, i, _, d) {
    c(n).drawArraysInstanced(a >>> 0, i, _, d);
  }, __wbg_drawArrays_13005ccff75e4210: function(n, a, i, _) {
    c(n).drawArrays(a >>> 0, i, _);
  }, __wbg_drawArrays_c20dedf441392005: function(n, a, i, _) {
    c(n).drawArrays(a >>> 0, i, _);
  }, __wbg_drawBuffersWEBGL_5f9efe378355889a: function(n, a) {
    c(n).drawBuffersWEBGL(c(a));
  }, __wbg_drawBuffers_823c4881ba82dc9c: function(n, a) {
    c(n).drawBuffers(c(a));
  }, __wbg_drawElementsInstancedANGLE_e9170c6414853487: function(n, a, i, _, d, y) {
    c(n).drawElementsInstancedANGLE(a >>> 0, i, _ >>> 0, d, y);
  }, __wbg_drawElementsInstanced_2e549060a77ba831: function(n, a, i, _, d, y) {
    c(n).drawElementsInstanced(a >>> 0, i, _ >>> 0, d, y);
  }, __wbg_drawIndexedIndirect_300125bd70bcd09b: function(n, a, i) {
    c(n).drawIndexedIndirect(c(a), i);
  }, __wbg_drawIndexed_68637ebab6dd8d6e: function(n, a, i, _, d, y) {
    c(n).drawIndexed(a >>> 0, i >>> 0, _ >>> 0, d, y >>> 0);
  }, __wbg_drawIndirect_3cabcd983032eced: function(n, a, i) {
    c(n).drawIndirect(c(a), i);
  }, __wbg_draw_ad0811de56a2d768: function(n, a, i, _, d) {
    c(n).draw(a >>> 0, i >>> 0, _ >>> 0, d >>> 0);
  }, __wbg_enableVertexAttribArray_60dadea3a00e104a: function(n, a) {
    c(n).enableVertexAttribArray(a >>> 0);
  }, __wbg_enableVertexAttribArray_626e8d2d9d1fdff9: function(n, a) {
    c(n).enableVertexAttribArray(a >>> 0);
  }, __wbg_enable_3728894fa8c1d348: function(n, a) {
    c(n).enable(a >>> 0);
  }, __wbg_enable_91dff7f43064bb54: function(n, a) {
    c(n).enable(a >>> 0);
  }, __wbg_endQuery_48241eaef2e96940: function(n, a) {
    c(n).endQuery(a >>> 0);
  }, __wbg_end_414453a89205612c: function(n) {
    c(n).end();
  }, __wbg_end_fb560a3ae8e3624e: function(n) {
    c(n).end();
  }, __wbg_entries_e8a20ff8c9757101: function(n) {
    const a = Object.entries(c(n));
    return m(a);
  }, __wbg_error_1eece6b0039034ce: function(n, a, i, _) {
    console.error(c(n), c(a), c(i), c(_));
  }, __wbg_error_287b079609b734b7: function(n) {
    const a = c(n).error;
    return m(a);
  }, __wbg_error_57ef6dadfcb01843: function(n) {
    const a = c(n).error;
    return J(a) ? 0 : m(a);
  }, __wbg_error_74898554122344a8: function() {
    return O(function(n) {
      const a = c(n).error;
      return J(a) ? 0 : m(a);
    }, arguments);
  }, __wbg_error_a6fa202b58aa1cd3: function(n, a) {
    let i, _;
    try {
      i = n, _ = a, console.error(q(n, a));
    } finally {
      p.__wbindgen_export4(i, _, 1);
    }
  }, __wbg_error_cfce0f619500de52: function(n, a) {
    console.error(c(n), c(a));
  }, __wbg_exec_203e2096c69172ee: function(n, a, i) {
    const _ = c(n).exec(q(a, i));
    return J(_) ? 0 : m(_);
  }, __wbg_exitFullscreen_446223b7026ea4a9: function(n) {
    c(n).exitFullscreen();
  }, __wbg_exitPointerLock_3c4e763915172704: function(n) {
    c(n).exitPointerLock();
  }, __wbg_features_4ce861c12227aa47: function(n) {
    const a = c(n).features;
    return m(a);
  }, __wbg_features_614e8836a2aaf39a: function(n) {
    const a = c(n).features;
    return m(a);
  }, __wbg_fenceSync_460953d9ad5fd31a: function(n, a, i) {
    const _ = c(n).fenceSync(a >>> 0, i >>> 0);
    return J(_) ? 0 : m(_);
  }, __wbg_fetch_7b84bc2cce4c9b65: function(n, a, i) {
    const _ = c(n).fetch(q(a, i));
    return m(_);
  }, __wbg_fetch_e261f234f8b50660: function(n, a, i) {
    const _ = c(n).fetch(q(a, i));
    return m(_);
  }, __wbg_fetch_f8a611684c3b5fe5: function(n, a) {
    const i = c(n).fetch(c(a));
    return m(i);
  }, __wbg_finish_087cb89c65c06eb1: function(n) {
    const a = c(n).finish();
    return m(a);
  }, __wbg_finish_cfaeede3baf55be1: function(n, a) {
    const i = c(n).finish(c(a));
    return m(i);
  }, __wbg_flush_049a445c404024c2: function(n) {
    c(n).flush();
  }, __wbg_flush_c7dd5b1ae1447448: function(n) {
    c(n).flush();
  }, __wbg_focus_885197ce680db9e0: function() {
    return O(function(n) {
      c(n).focus();
    }, arguments);
  }, __wbg_framebufferRenderbuffer_7a2be23309166ad3: function(n, a, i, _, d) {
    c(n).framebufferRenderbuffer(a >>> 0, i >>> 0, _ >>> 0, c(d));
  }, __wbg_framebufferRenderbuffer_d8c1d0b985bd3c51: function(n, a, i, _, d) {
    c(n).framebufferRenderbuffer(a >>> 0, i >>> 0, _ >>> 0, c(d));
  }, __wbg_framebufferTexture2D_bf4d47f4027a3682: function(n, a, i, _, d, y) {
    c(n).framebufferTexture2D(a >>> 0, i >>> 0, _ >>> 0, c(d), y);
  }, __wbg_framebufferTexture2D_e2f7d82e6707010e: function(n, a, i, _, d, y) {
    c(n).framebufferTexture2D(a >>> 0, i >>> 0, _ >>> 0, c(d), y);
  }, __wbg_framebufferTextureLayer_01d5b9516636ccae: function(n, a, i, _, d, y) {
    c(n).framebufferTextureLayer(a >>> 0, i >>> 0, c(_), d, y);
  }, __wbg_framebufferTextureMultiviewOVR_336ea10e261ec5f6: function(n, a, i, _, d, y, S) {
    c(n).framebufferTextureMultiviewOVR(a >>> 0, i >>> 0, c(_), d, y, S);
  }, __wbg_frontFace_1537b8c3fc174f05: function(n, a) {
    c(n).frontFace(a >>> 0);
  }, __wbg_frontFace_57081a0312eb822e: function(n, a) {
    c(n).frontFace(a >>> 0);
  }, __wbg_fullscreenElement_8068aa5be9c86543: function(n) {
    const a = c(n).fullscreenElement;
    return J(a) ? 0 : m(a);
  }, __wbg_getBoundingClientRect_b236f2e393fd0e7a: function(n) {
    const a = c(n).getBoundingClientRect();
    return m(a);
  }, __wbg_getBufferSubData_cbabbb87d4c5c57d: function(n, a, i, _) {
    c(n).getBufferSubData(a >>> 0, i, c(_));
  }, __wbg_getCoalescedEvents_08e25b227866a984: function(n) {
    const a = c(n).getCoalescedEvents();
    return m(a);
  }, __wbg_getCoalescedEvents_3e003f63d9ebbc05: function(n) {
    const a = c(n).getCoalescedEvents;
    return m(a);
  }, __wbg_getComputedStyle_b12e52450a4be72c: function() {
    return O(function(n, a) {
      const i = c(n).getComputedStyle(c(a));
      return J(i) ? 0 : m(i);
    }, arguments);
  }, __wbg_getContext_07270456453ee7f5: function() {
    return O(function(n, a, i, _) {
      const d = c(n).getContext(q(a, i), c(_));
      return J(d) ? 0 : m(d);
    }, arguments);
  }, __wbg_getContext_794490fe04be926a: function() {
    return O(function(n, a, i, _) {
      const d = c(n).getContext(q(a, i), c(_));
      return J(d) ? 0 : m(d);
    }, arguments);
  }, __wbg_getContext_a9236f98f1f7fe7c: function() {
    return O(function(n, a, i) {
      const _ = c(n).getContext(q(a, i));
      return J(_) ? 0 : m(_);
    }, arguments);
  }, __wbg_getContext_f04bf8f22dcb2d53: function() {
    return O(function(n, a, i) {
      const _ = c(n).getContext(q(a, i));
      return J(_) ? 0 : m(_);
    }, arguments);
  }, __wbg_getCurrentTexture_51975ae7185fd15f: function() {
    return O(function(n) {
      const a = c(n).getCurrentTexture();
      return m(a);
    }, arguments);
  }, __wbg_getExtension_0b8543b0c6b3068d: function() {
    return O(function(n, a, i) {
      const _ = c(n).getExtension(q(a, i));
      return J(_) ? 0 : m(_);
    }, arguments);
  }, __wbg_getGamepads_b179bcbe36d157bd: function() {
    return O(function(n) {
      const a = c(n).getGamepads();
      return m(a);
    }, arguments);
  }, __wbg_getIndexedParameter_338c7c91cbabcf3e: function() {
    return O(function(n, a, i) {
      const _ = c(n).getIndexedParameter(a >>> 0, i >>> 0);
      return m(_);
    }, arguments);
  }, __wbg_getItem_a7cc1d4f154f2e6f: function() {
    return O(function(n, a, i, _) {
      const d = c(a).getItem(q(i, _));
      var y = J(d) ? 0 : _e(d, p.__wbindgen_export, p.__wbindgen_export2), S = ae;
      L().setInt32(n + 4, S, true), L().setInt32(n + 0, y, true);
    }, arguments);
  }, __wbg_getMappedRange_5ed22727c9679168: function() {
    return O(function(n, a, i) {
      const _ = c(n).getMappedRange(a, i);
      return m(_);
    }, arguments);
  }, __wbg_getOwnPropertyDescriptor_afeb931addada534: function(n, a) {
    const i = Object.getOwnPropertyDescriptor(c(n), c(a));
    return m(i);
  }, __wbg_getParameter_b1431cfde390c2fc: function() {
    return O(function(n, a) {
      const i = c(n).getParameter(a >>> 0);
      return m(i);
    }, arguments);
  }, __wbg_getParameter_e634fa73b5e25287: function() {
    return O(function(n, a) {
      const i = c(n).getParameter(a >>> 0);
      return m(i);
    }, arguments);
  }, __wbg_getPreferredCanvasFormat_1b8495aeb1d11ab1: function(n) {
    const a = c(n).getPreferredCanvasFormat();
    return (fa.indexOf(a) + 1 || 96) - 1;
  }, __wbg_getProgramInfoLog_50443ddea7475f57: function(n, a, i) {
    const _ = c(a).getProgramInfoLog(c(i));
    var d = J(_) ? 0 : _e(_, p.__wbindgen_export, p.__wbindgen_export2), y = ae;
    L().setInt32(n + 4, y, true), L().setInt32(n + 0, d, true);
  }, __wbg_getProgramInfoLog_e03efa51473d657e: function(n, a, i) {
    const _ = c(a).getProgramInfoLog(c(i));
    var d = J(_) ? 0 : _e(_, p.__wbindgen_export, p.__wbindgen_export2), y = ae;
    L().setInt32(n + 4, y, true), L().setInt32(n + 0, d, true);
  }, __wbg_getProgramParameter_46e2d49878b56edd: function(n, a, i) {
    const _ = c(n).getProgramParameter(c(a), i >>> 0);
    return m(_);
  }, __wbg_getProgramParameter_7d3bd54ec02de007: function(n, a, i) {
    const _ = c(n).getProgramParameter(c(a), i >>> 0);
    return m(_);
  }, __wbg_getPropertyValue_d2181532557839cf: function() {
    return O(function(n, a, i, _) {
      const d = c(a).getPropertyValue(q(i, _)), y = _e(d, p.__wbindgen_export, p.__wbindgen_export2), S = ae;
      L().setInt32(n + 4, S, true), L().setInt32(n + 0, y, true);
    }, arguments);
  }, __wbg_getQueryParameter_5a3a2bd77e5f56bb: function(n, a, i) {
    const _ = c(n).getQueryParameter(c(a), i >>> 0);
    return m(_);
  }, __wbg_getRandomValues_783a29df2108885b: function() {
    return O(function(n) {
      globalThis.crypto.getRandomValues(c(n));
    }, arguments);
  }, __wbg_getRandomValues_c44a50d8cfdaebeb: function() {
    return O(function(n, a) {
      c(n).getRandomValues(c(a));
    }, arguments);
  }, __wbg_getRandomValues_e37a2f84ab559944: function() {
    return O(function(n) {
      globalThis.crypto.getRandomValues(c(n));
    }, arguments);
  }, __wbg_getReader_a1b0550ef1bdd954: function(n, a) {
    const i = c(n).getReader(c(a));
    return m(i);
  }, __wbg_getShaderInfoLog_22f9e8c90a52f38d: function(n, a, i) {
    const _ = c(a).getShaderInfoLog(c(i));
    var d = J(_) ? 0 : _e(_, p.__wbindgen_export, p.__wbindgen_export2), y = ae;
    L().setInt32(n + 4, y, true), L().setInt32(n + 0, d, true);
  }, __wbg_getShaderInfoLog_40c6a4ae67d82dde: function(n, a, i) {
    const _ = c(a).getShaderInfoLog(c(i));
    var d = J(_) ? 0 : _e(_, p.__wbindgen_export, p.__wbindgen_export2), y = ae;
    L().setInt32(n + 4, y, true), L().setInt32(n + 0, d, true);
  }, __wbg_getShaderParameter_46f64f7ca5d534db: function(n, a, i) {
    const _ = c(n).getShaderParameter(c(a), i >>> 0);
    return m(_);
  }, __wbg_getShaderParameter_82c275299b111f1b: function(n, a, i) {
    const _ = c(n).getShaderParameter(c(a), i >>> 0);
    return m(_);
  }, __wbg_getSupportedExtensions_a799751b74c3a674: function(n) {
    const a = c(n).getSupportedExtensions();
    return J(a) ? 0 : m(a);
  }, __wbg_getSupportedProfiles_e089393bebafd3b0: function(n) {
    const a = c(n).getSupportedProfiles();
    return J(a) ? 0 : m(a);
  }, __wbg_getSyncParameter_fbf70c60f5e3b271: function(n, a, i) {
    const _ = c(n).getSyncParameter(c(a), i >>> 0);
    return m(_);
  }, __wbg_getUniformBlockIndex_e483a4d166df9c2a: function(n, a, i, _) {
    return c(n).getUniformBlockIndex(c(a), q(i, _));
  }, __wbg_getUniformLocation_5eb08673afa04eee: function(n, a, i, _) {
    const d = c(n).getUniformLocation(c(a), q(i, _));
    return J(d) ? 0 : m(d);
  }, __wbg_getUniformLocation_90cdff44c2fceeb9: function(n, a, i, _) {
    const d = c(n).getUniformLocation(c(a), q(i, _));
    return J(d) ? 0 : m(d);
  }, __wbg_getWriter_aa227dc9da7cfa39: function() {
    return O(function(n) {
      const a = c(n).getWriter();
      return m(a);
    }, arguments);
  }, __wbg_get_326e41e095fb2575: function() {
    return O(function(n, a) {
      const i = Reflect.get(c(n), c(a));
      return m(i);
    }, arguments);
  }, __wbg_get_3ef1eba1850ade27: function() {
    return O(function(n, a) {
      const i = Reflect.get(c(n), c(a));
      return m(i);
    }, arguments);
  }, __wbg_get_6ac8c8119f577720: function() {
    return O(function(n, a) {
      const i = c(n).get(c(a));
      return m(i);
    }, arguments);
  }, __wbg_get_7873e3afa59bad00: function(n, a, i) {
    const _ = c(a)[i >>> 0];
    var d = J(_) ? 0 : _e(_, p.__wbindgen_export, p.__wbindgen_export2), y = ae;
    L().setInt32(n + 4, y, true), L().setInt32(n + 0, d, true);
  }, __wbg_get_a8ee5c45dabc1b3b: function(n, a) {
    const i = c(n)[a >>> 0];
    return m(i);
  }, __wbg_get_c7546417fb0bec10: function(n, a) {
    const i = c(n)[a >>> 0];
    return J(i) ? 0 : m(i);
  }, __wbg_get_unchecked_329cfe50afab7352: function(n, a) {
    const i = c(n)[a >>> 0];
    return m(i);
  }, __wbg_gpu_a7c12045c25d009a: function(n) {
    const a = c(n).gpu;
    return m(a);
  }, __wbg_hardwareConcurrency_a8e3f7c0d77df6d3: function(n) {
    return c(n).hardwareConcurrency;
  }, __wbg_has_926ef2ff40b308cf: function() {
    return O(function(n, a) {
      return Reflect.has(c(n), c(a));
    }, arguments);
  }, __wbg_has_b5a46804dc5e62bd: function(n, a, i) {
    return c(n).has(q(a, i));
  }, __wbg_headers_fc8c672cd757e0fd: function(n) {
    const a = c(n).headers;
    return m(a);
  }, __wbg_height_8c06cb597de53887: function(n) {
    return c(n).height;
  }, __wbg_hidden_19530f76732ba428: function(n) {
    return c(n).hidden;
  }, __wbg_hostname_a30ece22df1c8b63: function() {
    return O(function(n, a) {
      const i = c(a).hostname, _ = _e(i, p.__wbindgen_export, p.__wbindgen_export2), d = ae;
      L().setInt32(n + 4, d, true), L().setInt32(n + 0, _, true);
    }, arguments);
  }, __wbg_id_26bc2771d7af1b86: function(n, a) {
    const i = c(a).id, _ = _e(i, p.__wbindgen_export, p.__wbindgen_export2), d = ae;
    L().setInt32(n + 4, d, true), L().setInt32(n + 0, _, true);
  }, __wbg_includes_9f81335525be01f9: function(n, a, i) {
    return c(n).includes(c(a), i);
  }, __wbg_indexNames_3a9be68017fb9405: function(n) {
    const a = c(n).indexNames;
    return m(a);
  }, __wbg_index_4cc30c8b16093fd3: function(n) {
    return c(n).index;
  }, __wbg_index_f1b3b30c5d5af6fb: function() {
    return O(function(n, a, i) {
      const _ = c(n).index(q(a, i));
      return m(_);
    }, arguments);
  }, __wbg_info_0194681687b5ab04: function(n, a, i, _) {
    console.info(c(n), c(a), c(i), c(_));
  }, __wbg_info_22dcf1fd1b12bc7d: function(n) {
    const a = c(n).info;
    return m(a);
  }, __wbg_inlineSize_bc956acca480b3d7: function(n) {
    return c(n).inlineSize;
  }, __wbg_instanceof_ArrayBuffer_101e2bf31071a9f6: function(n) {
    let a;
    try {
      a = c(n) instanceof ArrayBuffer;
    } catch {
      a = false;
    }
    return a;
  }, __wbg_instanceof_DomException_2bdcf7791a2d7d09: function(n) {
    let a;
    try {
      a = c(n) instanceof DOMException;
    } catch {
      a = false;
    }
    return a;
  }, __wbg_instanceof_GpuAdapter_fc7b89fc546de0bc: function(n) {
    let a;
    try {
      a = c(n) instanceof GPUAdapter;
    } catch {
      a = false;
    }
    return a;
  }, __wbg_instanceof_GpuCanvasContext_1a39fd0621603553: function(n) {
    let a;
    try {
      a = c(n) instanceof GPUCanvasContext;
    } catch {
      a = false;
    }
    return a;
  }, __wbg_instanceof_GpuDeviceLostInfo_c0ebce29b32e81e8: function(n) {
    let a;
    try {
      a = c(n) instanceof GPUDeviceLostInfo;
    } catch {
      a = false;
    }
    return a;
  }, __wbg_instanceof_GpuOutOfMemoryError_5ac5c50ce9ee21d2: function(n) {
    let a;
    try {
      a = c(n) instanceof GPUOutOfMemoryError;
    } catch {
      a = false;
    }
    return a;
  }, __wbg_instanceof_GpuValidationError_77b97d666afabac1: function(n) {
    let a;
    try {
      a = c(n) instanceof GPUValidationError;
    } catch {
      a = false;
    }
    return a;
  }, __wbg_instanceof_HtmlCanvasElement_26125339f936be50: function(n) {
    let a;
    try {
      a = c(n) instanceof HTMLCanvasElement;
    } catch {
      a = false;
    }
    return a;
  }, __wbg_instanceof_IdbDatabase_5f436cc89cc07f14: function(n) {
    let a;
    try {
      a = c(n) instanceof IDBDatabase;
    } catch {
      a = false;
    }
    return a;
  }, __wbg_instanceof_IdbFactory_efcffbfd9020e4ac: function(n) {
    let a;
    try {
      a = c(n) instanceof IDBFactory;
    } catch {
      a = false;
    }
    return a;
  }, __wbg_instanceof_IdbOpenDbRequest_10c2576001eb6613: function(n) {
    let a;
    try {
      a = c(n) instanceof IDBOpenDBRequest;
    } catch {
      a = false;
    }
    return a;
  }, __wbg_instanceof_IdbRequest_6a0e24572d4f1d46: function(n) {
    let a;
    try {
      a = c(n) instanceof IDBRequest;
    } catch {
      a = false;
    }
    return a;
  }, __wbg_instanceof_IdbTransaction_125db5cfd1c1bfd2: function(n) {
    let a;
    try {
      a = c(n) instanceof IDBTransaction;
    } catch {
      a = false;
    }
    return a;
  }, __wbg_instanceof_Map_f194b366846aca0c: function(n) {
    let a;
    try {
      a = c(n) instanceof Map;
    } catch {
      a = false;
    }
    return a;
  }, __wbg_instanceof_Object_be1962063fcc0c9f: function(n) {
    let a;
    try {
      a = c(n) instanceof Object;
    } catch {
      a = false;
    }
    return a;
  }, __wbg_instanceof_Performance_fc16db7b6f107638: function(n) {
    let a;
    try {
      a = c(n) instanceof Performance;
    } catch {
      a = false;
    }
    return a;
  }, __wbg_instanceof_Response_9b4d9fd451e051b1: function(n) {
    let a;
    try {
      a = c(n) instanceof Response;
    } catch {
      a = false;
    }
    return a;
  }, __wbg_instanceof_Uint8Array_740438561a5b956d: function(n) {
    let a;
    try {
      a = c(n) instanceof Uint8Array;
    } catch {
      a = false;
    }
    return a;
  }, __wbg_instanceof_WebGl2RenderingContext_349f232f715e6bc2: function(n) {
    let a;
    try {
      a = c(n) instanceof WebGL2RenderingContext;
    } catch {
      a = false;
    }
    return a;
  }, __wbg_instanceof_Window_23e677d2c6843922: function(n) {
    let a;
    try {
      a = c(n) instanceof Window;
    } catch {
      a = false;
    }
    return a;
  }, __wbg_invalidateFramebuffer_df9574509a402d4f: function() {
    return O(function(n, a, i) {
      c(n).invalidateFramebuffer(a >>> 0, c(i));
    }, arguments);
  }, __wbg_isArray_33b91feb269ff46e: function(n) {
    return Array.isArray(c(n));
  }, __wbg_isIntersecting_b3e74fb0cf75f7d1: function(n) {
    return c(n).isIntersecting;
  }, __wbg_isSafeInteger_ecd6a7f9c3e053cd: function(n) {
    return Number.isSafeInteger(c(n));
  }, __wbg_isSecureContext_b78081a385656549: function(n) {
    return c(n).isSecureContext;
  }, __wbg_is_a166b9958c2438ad: function(n, a) {
    return Object.is(c(n), c(a));
  }, __wbg_iterator_d8f549ec8fb061b1: function() {
    return m(Symbol.iterator);
  }, __wbg_json_602d0b5448ab6391: function() {
    return O(function(n) {
      const a = c(n).json();
      return m(a);
    }, arguments);
  }, __wbg_keyPath_f17010debffed49a: function() {
    return O(function(n) {
      const a = c(n).keyPath;
      return m(a);
    }, arguments);
  }, __wbg_key_99eb0f0a1000963d: function(n, a) {
    const i = c(a).key, _ = _e(i, p.__wbindgen_export, p.__wbindgen_export2), d = ae;
    L().setInt32(n + 4, d, true), L().setInt32(n + 0, _, true);
  }, __wbg_label_47480289cc2bce71: function(n, a) {
    const i = c(a).label, _ = _e(i, p.__wbindgen_export, p.__wbindgen_export2), d = ae;
    L().setInt32(n + 4, d, true), L().setInt32(n + 0, _, true);
  }, __wbg_length_02c4f6002306a824: function(n) {
    return c(n).length;
  }, __wbg_length_259ee9d041e381ad: function(n) {
    return c(n).length;
  }, __wbg_length_b3416cf66a5452c8: function(n) {
    return c(n).length;
  }, __wbg_length_ea16607d7b61445b: function(n) {
    return c(n).length;
  }, __wbg_limits_1c25cb4f379a4418: function(n) {
    const a = c(n).limits;
    return m(a);
  }, __wbg_limits_50a8c5e629dbfe40: function(n) {
    const a = c(n).limits;
    return m(a);
  }, __wbg_linkProgram_b969f67969a850b5: function(n, a) {
    c(n).linkProgram(c(a));
  }, __wbg_linkProgram_e626a3e7d78e1738: function(n, a) {
    c(n).linkProgram(c(a));
  }, __wbg_localStorage_51c38b3b222e1ed2: function() {
    return O(function(n) {
      const a = c(n).localStorage;
      return J(a) ? 0 : m(a);
    }, arguments);
  }, __wbg_location_cb6f3af6ad563d81: function(n) {
    return c(n).location;
  }, __wbg_location_fc8d47802682dd93: function(n) {
    const a = c(n).location;
    return m(a);
  }, __wbg_log_0c201ade58bb55e1: function(n, a, i, _, d, y, S, h) {
    let B, R;
    try {
      B = n, R = a, console.log(q(n, a), q(i, _), q(d, y), q(S, h));
    } finally {
      p.__wbindgen_export4(B, R, 1);
    }
  }, __wbg_log_70972330cfc941dd: function(n, a, i, _) {
    console.log(c(n), c(a), c(i), c(_));
  }, __wbg_log_ce2c4456b290c5e7: function(n, a) {
    let i, _;
    try {
      i = n, _ = a, console.log(q(n, a));
    } finally {
      p.__wbindgen_export4(i, _, 1);
    }
  }, __wbg_lost_7b1065bddc80e8ac: function(n) {
    const a = c(n).lost;
    return m(a);
  }, __wbg_mapAsync_bb0029907dd91181: function(n, a, i, _) {
    const d = c(n).mapAsync(a >>> 0, i, _);
    return m(d);
  }, __wbg_mapping_c0470f8cd55cefc3: function(n) {
    const a = c(n).mapping;
    return (D1.indexOf(a) + 1 || 3) - 1;
  }, __wbg_mark_b4d943f3bc2d2404: function(n, a) {
    performance.mark(q(n, a));
  }, __wbg_matchMedia_b27489ec503ba2a5: function() {
    return O(function(n, a, i) {
      const _ = c(n).matchMedia(q(a, i));
      return J(_) ? 0 : m(_);
    }, arguments);
  }, __wbg_matches_d58caa45a0ef29a3: function(n) {
    return c(n).matches;
  }, __wbg_maxBindGroups_14611ac9ed1c6b56: function(n) {
    return c(n).maxBindGroups;
  }, __wbg_maxBindingsPerBindGroup_dd3f66044d2a9bfb: function(n) {
    return c(n).maxBindingsPerBindGroup;
  }, __wbg_maxBufferSize_f7ce3e1856349d2f: function(n) {
    return c(n).maxBufferSize;
  }, __wbg_maxChannelCount_8cba596bef7c2947: function(n) {
    return c(n).maxChannelCount;
  }, __wbg_maxColorAttachmentBytesPerSample_55e64194645ea041: function(n) {
    return c(n).maxColorAttachmentBytesPerSample;
  }, __wbg_maxColorAttachments_fd9187f9f786da18: function(n) {
    return c(n).maxColorAttachments;
  }, __wbg_maxComputeInvocationsPerWorkgroup_9b3b1fc261129782: function(n) {
    return c(n).maxComputeInvocationsPerWorkgroup;
  }, __wbg_maxComputeWorkgroupSizeX_c55bbbcc02b75241: function(n) {
    return c(n).maxComputeWorkgroupSizeX;
  }, __wbg_maxComputeWorkgroupSizeY_96f40b1ec3102a3a: function(n) {
    return c(n).maxComputeWorkgroupSizeY;
  }, __wbg_maxComputeWorkgroupSizeZ_c2b1061d521561bb: function(n) {
    return c(n).maxComputeWorkgroupSizeZ;
  }, __wbg_maxComputeWorkgroupStorageSize_fac26e89d99e08f9: function(n) {
    return c(n).maxComputeWorkgroupStorageSize;
  }, __wbg_maxComputeWorkgroupsPerDimension_cd001f910e9b4d70: function(n) {
    return c(n).maxComputeWorkgroupsPerDimension;
  }, __wbg_maxDatagramSize_09185857947128ac: function(n) {
    return c(n).maxDatagramSize;
  }, __wbg_maxDynamicStorageBuffersPerPipelineLayout_29399b82af020d86: function(n) {
    return c(n).maxDynamicStorageBuffersPerPipelineLayout;
  }, __wbg_maxDynamicUniformBuffersPerPipelineLayout_6d6cf80f3bd08e52: function(n) {
    return c(n).maxDynamicUniformBuffersPerPipelineLayout;
  }, __wbg_maxInterStageShaderVariables_8b000f47a166b1d5: function(n) {
    return c(n).maxInterStageShaderVariables;
  }, __wbg_maxSampledTexturesPerShaderStage_618a49f33217dde2: function(n) {
    return c(n).maxSampledTexturesPerShaderStage;
  }, __wbg_maxSamplersPerShaderStage_aa09fa0311712a1a: function(n) {
    return c(n).maxSamplersPerShaderStage;
  }, __wbg_maxStorageBufferBindingSize_0ec83ae10ad73180: function(n) {
    return c(n).maxStorageBufferBindingSize;
  }, __wbg_maxStorageBuffersPerShaderStage_0cca5b468fcf10b6: function(n) {
    return c(n).maxStorageBuffersPerShaderStage;
  }, __wbg_maxStorageTexturesPerShaderStage_9d6c35770f37866c: function(n) {
    return c(n).maxStorageTexturesPerShaderStage;
  }, __wbg_maxTextureArrayLayers_c2bf9c85285832d4: function(n) {
    return c(n).maxTextureArrayLayers;
  }, __wbg_maxTextureDimension1D_e09f86e22ea6bac9: function(n) {
    return c(n).maxTextureDimension1D;
  }, __wbg_maxTextureDimension2D_2631916ef9a3efa8: function(n) {
    return c(n).maxTextureDimension2D;
  }, __wbg_maxTextureDimension3D_06ee54121b37d431: function(n) {
    return c(n).maxTextureDimension3D;
  }, __wbg_maxUniformBufferBindingSize_af9e8a077907ed64: function(n) {
    return c(n).maxUniformBufferBindingSize;
  }, __wbg_maxUniformBuffersPerShaderStage_f871b70865df8c11: function(n) {
    return c(n).maxUniformBuffersPerShaderStage;
  }, __wbg_maxVertexAttributes_e72dabb2714f5cf5: function(n) {
    return c(n).maxVertexAttributes;
  }, __wbg_maxVertexBufferArrayStride_6a1cd814386082ce: function(n) {
    return c(n).maxVertexBufferArrayStride;
  }, __wbg_maxVertexBuffers_9c61c5fd286ebcc6: function(n) {
    return c(n).maxVertexBuffers;
  }, __wbg_measure_84362959e621a2c1: function() {
    return O(function(n, a, i, _) {
      let d, y, S, h;
      try {
        d = n, y = a, S = i, h = _, performance.measure(q(n, a), q(i, _));
      } finally {
        p.__wbindgen_export4(d, y, 1), p.__wbindgen_export4(S, h, 1);
      }
    }, arguments);
  }, __wbg_media_91e147d0112e864c: function(n, a) {
    const i = c(a).media, _ = _e(i, p.__wbindgen_export, p.__wbindgen_export2), d = ae;
    L().setInt32(n + 4, d, true), L().setInt32(n + 0, _, true);
  }, __wbg_message_09714b1dbee17e65: function(n, a) {
    const i = c(a).message, _ = _e(i, p.__wbindgen_export, p.__wbindgen_export2), d = ae;
    L().setInt32(n + 4, d, true), L().setInt32(n + 0, _, true);
  }, __wbg_message_6769962f0009c864: function(n, a) {
    const i = c(a).message, _ = _e(i, p.__wbindgen_export, p.__wbindgen_export2), d = ae;
    L().setInt32(n + 4, d, true), L().setInt32(n + 0, _, true);
  }, __wbg_message_e959edc81e4b6cb7: function(n, a) {
    const i = c(a).message, _ = _e(i, p.__wbindgen_export, p.__wbindgen_export2), d = ae;
    L().setInt32(n + 4, d, true), L().setInt32(n + 0, _, true);
  }, __wbg_metaKey_04074c2a59c1806c: function(n) {
    return c(n).metaKey;
  }, __wbg_metaKey_09c90f191df1276b: function(n) {
    return c(n).metaKey;
  }, __wbg_minStorageBufferOffsetAlignment_e214f59628fb3558: function(n) {
    return c(n).minStorageBufferOffsetAlignment;
  }, __wbg_minUniformBufferOffsetAlignment_58b69e1c3924f6a4: function(n) {
    return c(n).minUniformBufferOffsetAlignment;
  }, __wbg_movementX_36b3256d18bcf681: function(n) {
    return c(n).movementX;
  }, __wbg_movementY_004a98ec08b8f584: function(n) {
    return c(n).movementY;
  }, __wbg_msCrypto_bd5a034af96bcba6: function(n) {
    const a = c(n).msCrypto;
    return m(a);
  }, __wbg_multiEntry_fd907a11ddf44df1: function(n) {
    return c(n).multiEntry;
  }, __wbg_navigator_583ffd4fc14c0f7a: function(n) {
    const a = c(n).navigator;
    return m(a);
  }, __wbg_navigator_9cebf56f28aa719b: function(n) {
    const a = c(n).navigator;
    return m(a);
  }, __wbg_new_0b637bad3d58f611: function() {
    return O(function() {
      const n = new Image();
      return m(n);
    }, arguments);
  }, __wbg_new_227d7c05414eb861: function() {
    const n = new Error();
    return m(n);
  }, __wbg_new_231f743fdbbd7628: function(n) {
    const a = new Uint8ClampedArray(c(n));
    return m(a);
  }, __wbg_new_2cb6f455748a4e89: function(n) {
    const a = new Float32Array(c(n));
    return m(a);
  }, __wbg_new_3acd383af1655b5f: function() {
    return O(function(n, a) {
      const i = new Worker(q(n, a));
      return m(i);
    }, arguments);
  }, __wbg_new_42398a42abc5b110: function() {
    return O(function(n) {
      const a = new IntersectionObserver(c(n));
      return m(a);
    }, arguments);
  }, __wbg_new_5f486cdf45a04d78: function(n) {
    const a = new Uint8Array(c(n));
    return m(a);
  }, __wbg_new_a5de2c0e786216d6: function(n) {
    const a = new ArrayBuffer(n >>> 0);
    return m(a);
  }, __wbg_new_a70fbab9066b301f: function() {
    const n = new Array();
    return m(n);
  }, __wbg_new_aad8cb4adc774d03: function(n, a, i, _) {
    const d = new RegExp(q(n, a), q(i, _));
    return m(d);
  }, __wbg_new_ab79df5bd7c26067: function() {
    const n = new Object();
    return m(n);
  }, __wbg_new_af04f4c3ed7fd887: function(n) {
    const a = new Int32Array(c(n));
    return m(a);
  }, __wbg_new_c518c60af666645b: function() {
    return O(function() {
      const n = new AbortController();
      return m(n);
    }, arguments);
  }, __wbg_new_d098e265629cd10f: function(n, a) {
    try {
      var i = { a: n, b: a }, _ = (y, S) => {
        const h = i.a;
        i.a = 0;
        try {
          return z1(h, i.b, y, S);
        } finally {
          i.a = h;
        }
      };
      const d = new Promise(_);
      return m(d);
    } finally {
      i.a = i.b = 0;
    }
  }, __wbg_new_dd50bcc3f60ba434: function() {
    return O(function(n, a) {
      const i = new WebSocket(q(n, a));
      return m(i);
    }, arguments);
  }, __wbg_new_de704db0001dadc8: function() {
    return O(function(n) {
      const a = new ResizeObserver(c(n));
      return m(a);
    }, arguments);
  }, __wbg_new_e9bc99ed55d4504d: function() {
    return O(function(n, a) {
      const i = new ImageData(Gt(n), a >>> 0);
      return m(i);
    }, arguments);
  }, __wbg_new_f7708ba82c4c12f6: function() {
    return O(function() {
      const n = new MessageChannel();
      return m(n);
    }, arguments);
  }, __wbg_new_from_slice_22da9388ac046e50: function(n, a) {
    const i = new Uint8Array(oa(n, a));
    return m(i);
  }, __wbg_new_typed_bccac67128ed885a: function() {
    const n = new Array();
    return m(n);
  }, __wbg_new_with_byte_offset_and_length_b2ec5bf7b2f35743: function(n, a, i) {
    const _ = new Uint8Array(c(n), a >>> 0, i >>> 0);
    return m(_);
  }, __wbg_new_with_context_options_c1249ea1a7ddc84f: function() {
    return O(function(n) {
      const a = new t1(c(n));
      return m(a);
    }, arguments);
  }, __wbg_new_with_length_825018a1616e9e55: function(n) {
    const a = new Uint8Array(n >>> 0);
    return m(a);
  }, __wbg_new_with_options_a992f1eb77ddb6f5: function() {
    return O(function(n, a, i) {
      const _ = new WebTransport(q(n, a), c(i));
      return m(_);
    }, arguments);
  }, __wbg_new_with_str_and_init_b4b54d1a819bc724: function() {
    return O(function(n, a, i) {
      const _ = new Request(q(n, a), c(i));
      return m(_);
    }, arguments);
  }, __wbg_new_with_str_sequence_81cd713f8ef645ea: function() {
    return O(function(n) {
      const a = new Blob(c(n));
      return m(a);
    }, arguments);
  }, __wbg_new_with_str_sequence_and_options_a037535f6e1edba0: function() {
    return O(function(n, a) {
      const i = new Blob(c(n), c(a));
      return m(i);
    }, arguments);
  }, __wbg_next_11b99ee6237339e3: function() {
    return O(function(n) {
      const a = c(n).next();
      return m(a);
    }, arguments);
  }, __wbg_next_e01a967809d1aa68: function(n) {
    const a = c(n).next;
    return m(a);
  }, __wbg_node_84ea875411254db1: function(n) {
    const a = c(n).node;
    return m(a);
  }, __wbg_now_16f0c993d5dd6c27: function() {
    return Date.now();
  }, __wbg_now_c6d7a7d35f74f6f1: function(n) {
    return c(n).now();
  }, __wbg_now_e7c6795a7f81e10f: function(n) {
    return c(n).now();
  }, __wbg_objectStoreNames_564985d2e9ae7523: function(n) {
    const a = c(n).objectStoreNames;
    return m(a);
  }, __wbg_objectStore_f314ab152a5c7bd0: function() {
    return O(function(n, a, i) {
      const _ = c(n).objectStore(q(a, i));
      return m(_);
    }, arguments);
  }, __wbg_observe_571954223f11dad1: function(n, a, i) {
    c(n).observe(c(a), c(i));
  }, __wbg_observe_a829ffd9907f84b1: function(n, a) {
    c(n).observe(c(a));
  }, __wbg_observe_e1a1f270d8431b29: function(n, a) {
    c(n).observe(c(a));
  }, __wbg_of_8bf7ed3eca00ea43: function(n) {
    const a = Array.of(c(n));
    return m(a);
  }, __wbg_of_8fd5dd402bc67165: function(n, a, i) {
    const _ = Array.of(c(n), c(a), c(i));
    return m(_);
  }, __wbg_of_d6376e3774c51f89: function(n, a) {
    const i = Array.of(c(n), c(a));
    return m(i);
  }, __wbg_offsetX_a9bf2ea7f0575ac9: function(n) {
    return c(n).offsetX;
  }, __wbg_offsetY_10e5433a1bbd4c01: function(n) {
    return c(n).offsetY;
  }, __wbg_ok_7ec8b94facac7704: function(n) {
    return c(n).ok;
  }, __wbg_onSubmittedWorkDone_1460145eecea40ef: function(n) {
    const a = c(n).onSubmittedWorkDone();
    return m(a);
  }, __wbg_open_e7a9d3d6344572f6: function() {
    return O(function(n, a, i, _) {
      const d = c(n).open(q(a, i), _ >>> 0);
      return m(d);
    }, arguments);
  }, __wbg_open_f3dc09caa3990bc4: function() {
    return O(function(n, a, i) {
      const _ = c(n).open(q(a, i));
      return m(_);
    }, arguments);
  }, __wbg_origin_bac5c3119fe40a90: function() {
    return O(function(n, a) {
      const i = c(a).origin, _ = _e(i, p.__wbindgen_export, p.__wbindgen_export2), d = ae;
      L().setInt32(n + 4, d, true), L().setInt32(n + 0, _, true);
    }, arguments);
  }, __wbg_performance_3fcf6e32a7e1ed0a: function(n) {
    const a = c(n).performance;
    return m(a);
  }, __wbg_persisted_8366757621586c61: function(n) {
    return c(n).persisted;
  }, __wbg_pixelStorei_2a2385ed59538d48: function(n, a, i) {
    c(n).pixelStorei(a >>> 0, i);
  }, __wbg_pixelStorei_2a3c5b85cf37caba: function(n, a, i) {
    c(n).pixelStorei(a >>> 0, i);
  }, __wbg_play_3997a1be51d27925: function(n) {
    c(n).play();
  }, __wbg_pointerId_85ff21be7b52f43e: function(n) {
    return c(n).pointerId;
  }, __wbg_pointerType_02525bef1df5f79c: function(n, a) {
    const i = c(a).pointerType, _ = _e(i, p.__wbindgen_export, p.__wbindgen_export2), d = ae;
    L().setInt32(n + 4, d, true), L().setInt32(n + 0, _, true);
  }, __wbg_polygonOffset_17cb85e417bf9db7: function(n, a, i) {
    c(n).polygonOffset(a, i);
  }, __wbg_polygonOffset_cc6bec2f9f4a18f7: function(n, a, i) {
    c(n).polygonOffset(a, i);
  }, __wbg_popDebugGroup_0c45034afb9a2d56: function(n) {
    c(n).popDebugGroup();
  }, __wbg_popErrorScope_4cbc9ce0c8cc5a9f: function(n) {
    const a = c(n).popErrorScope();
    return m(a);
  }, __wbg_port1_869a7ef90538dbdf: function(n) {
    const a = c(n).port1;
    return m(a);
  }, __wbg_port2_947a51b8ba00adc9: function(n) {
    const a = c(n).port2;
    return m(a);
  }, __wbg_postMessage_5ed5275983f7dad2: function() {
    return O(function(n, a, i) {
      c(n).postMessage(c(a), c(i));
    }, arguments);
  }, __wbg_postMessage_c89a8b5edbf59ad0: function() {
    return O(function(n, a) {
      c(n).postMessage(c(a));
    }, arguments);
  }, __wbg_postMessage_edb4c90a528e5a8c: function() {
    return O(function(n, a) {
      c(n).postMessage(c(a));
    }, arguments);
  }, __wbg_postTask_e2439afddcdfbb55: function(n, a, i) {
    const _ = c(n).postTask(c(a), c(i));
    return m(_);
  }, __wbg_pressed_04111050e054a5e8: function(n) {
    return c(n).pressed;
  }, __wbg_pressure_8a4698697b9bba06: function(n) {
    return c(n).pressure;
  }, __wbg_preventDefault_25a229bfe5c510f8: function(n) {
    c(n).preventDefault();
  }, __wbg_process_44c7a14e11e9f69e: function(n) {
    const a = c(n).process;
    return m(a);
  }, __wbg_prototype_0d5bb2023db3bcfc: function() {
    const n = ResizeObserverEntry.prototype;
    return m(n);
  }, __wbg_prototypesetcall_d62e5099504357e6: function(n, a, i) {
    Uint8Array.prototype.set.call(oa(n, a), c(i));
  }, __wbg_pushDebugGroup_3f0735d624fe2b7a: function(n, a, i) {
    c(n).pushDebugGroup(q(a, i));
  }, __wbg_pushErrorScope_aad0eef2ff5b28d3: function(n, a) {
    c(n).pushErrorScope(N1[a]);
  }, __wbg_push_e87b0e732085a946: function(n, a) {
    return c(n).push(c(a));
  }, __wbg_put_ae369598c083f1f5: function() {
    return O(function(n, a) {
      const i = c(n).put(c(a));
      return m(i);
    }, arguments);
  }, __wbg_put_f1673d719f93ce22: function() {
    return O(function(n, a, i) {
      const _ = c(n).put(c(a), c(i));
      return m(_);
    }, arguments);
  }, __wbg_queryCounterEXT_12ca9f560a5855cb: function(n, a, i) {
    c(n).queryCounterEXT(c(a), i >>> 0);
  }, __wbg_querySelectorAll_ccbf0696a1c6fed8: function() {
    return O(function(n, a, i) {
      const _ = c(n).querySelectorAll(q(a, i));
      return m(_);
    }, arguments);
  }, __wbg_querySelector_46ff1b81410aebea: function() {
    return O(function(n, a, i) {
      const _ = c(n).querySelector(q(a, i));
      return J(_) ? 0 : m(_);
    }, arguments);
  }, __wbg_queueMicrotask_0c399741342fb10f: function(n) {
    const a = c(n).queueMicrotask;
    return m(a);
  }, __wbg_queueMicrotask_6913321b637d352e: function(n) {
    queueMicrotask(c(n));
  }, __wbg_queueMicrotask_9608487e970c906d: function(n, a) {
    c(n).queueMicrotask(c(a));
  }, __wbg_queueMicrotask_a082d78ce798393e: function(n) {
    queueMicrotask(c(n));
  }, __wbg_queueMicrotask_c71567d694717a50: function(n) {
    queueMicrotask(c(n));
  }, __wbg_queueMicrotask_cfcf83b0d75ff7d0: function(n) {
    queueMicrotask(c(n));
  }, __wbg_queue_65d985f3e6d786a6: function(n) {
    const a = c(n).queue;
    return m(a);
  }, __wbg_randomFillSync_6c25eac9869eb53c: function() {
    return O(function(n, a) {
      c(n).randomFillSync(Gt(a));
    }, arguments);
  }, __wbg_readBuffer_e559a3da4aa9e434: function(n, a) {
    c(n).readBuffer(a >>> 0);
  }, __wbg_readPixels_41a371053c299080: function() {
    return O(function(n, a, i, _, d, y, S, h) {
      c(n).readPixels(a, i, _, d, y >>> 0, S >>> 0, c(h));
    }, arguments);
  }, __wbg_readPixels_5c7066b5bd547f81: function() {
    return O(function(n, a, i, _, d, y, S, h) {
      c(n).readPixels(a, i, _, d, y >>> 0, S >>> 0, c(h));
    }, arguments);
  }, __wbg_readPixels_f675ed52bd44f8f1: function() {
    return O(function(n, a, i, _, d, y, S, h) {
      c(n).readPixels(a, i, _, d, y >>> 0, S >>> 0, h);
    }, arguments);
  }, __wbg_readText_fafc6e2dec6e3b6e: function(n) {
    const a = c(n).readText();
    return m(a);
  }, __wbg_read_312e1367cbceb744: function(n, a) {
    const i = c(n).read(c(a));
    return m(i);
  }, __wbg_readable_bd6ae02fbb928d26: function(n) {
    const a = c(n).readable;
    return m(a);
  }, __wbg_readyState_1f1e7f1bdf9f4d42: function(n) {
    return c(n).readyState;
  }, __wbg_ready_8fcc468b2355b4af: function() {
    return O(function(n) {
      const a = c(n).ready;
      return m(a);
    }, arguments);
  }, __wbg_reason_21c585c1cbc2cc8f: function(n) {
    const a = c(n).reason;
    return (B1.indexOf(a) + 1 || 3) - 1;
  }, __wbg_reason_cbcb9911796c4714: function(n, a) {
    const i = c(a).reason, _ = _e(i, p.__wbindgen_export, p.__wbindgen_export2), d = ae;
    L().setInt32(n + 4, d, true), L().setInt32(n + 0, _, true);
  }, __wbg_removeEventListener_d27694700fc0df8b: function() {
    return O(function(n, a, i, _) {
      c(n).removeEventListener(q(a, i), c(_));
    }, arguments);
  }, __wbg_removeListener_7afb5d85c58c554b: function() {
    return O(function(n, a) {
      c(n).removeListener(c(a));
    }, arguments);
  }, __wbg_removeProperty_5b3523637b608633: function() {
    return O(function(n, a, i, _) {
      const d = c(a).removeProperty(q(i, _)), y = _e(d, p.__wbindgen_export, p.__wbindgen_export2), S = ae;
      L().setInt32(n + 4, S, true), L().setInt32(n + 0, y, true);
    }, arguments);
  }, __wbg_renderbufferStorageMultisample_d999a80fbc25df5f: function(n, a, i, _, d, y) {
    c(n).renderbufferStorageMultisample(a >>> 0, i, _ >>> 0, d, y);
  }, __wbg_renderbufferStorage_9130171a6ae371dc: function(n, a, i, _, d) {
    c(n).renderbufferStorage(a >>> 0, i >>> 0, _, d);
  }, __wbg_renderbufferStorage_b184ea29064b4e02: function(n, a, i, _, d) {
    c(n).renderbufferStorage(a >>> 0, i >>> 0, _, d);
  }, __wbg_repeat_44d6eeebd275606f: function(n) {
    return c(n).repeat;
  }, __wbg_requestAdapter_9ff5c9d1ff271165: function(n, a) {
    const i = c(n).requestAdapter(c(a));
    return m(i);
  }, __wbg_requestAnimationFrame_206c97f410e7a383: function() {
    return O(function(n, a) {
      return c(n).requestAnimationFrame(c(a));
    }, arguments);
  }, __wbg_requestDevice_c1c34f88a477e509: function(n, a) {
    const i = c(n).requestDevice(c(a));
    return m(i);
  }, __wbg_requestFullscreen_3f16e43f398ce624: function(n) {
    const a = c(n).requestFullscreen();
    return m(a);
  }, __wbg_requestFullscreen_b977a3a0697e883c: function(n) {
    const a = c(n).requestFullscreen;
    return m(a);
  }, __wbg_requestIdleCallback_3689e3e38f6cfc02: function(n) {
    const a = c(n).requestIdleCallback;
    return m(a);
  }, __wbg_requestIdleCallback_75108097af8f5c6a: function() {
    return O(function(n, a) {
      return c(n).requestIdleCallback(c(a));
    }, arguments);
  }, __wbg_requestPointerLock_5794d6c3f7d960bb: function(n) {
    c(n).requestPointerLock();
  }, __wbg_require_b4edbdcf3e2a1ef0: function() {
    return O(function() {
      const n = module.require;
      return m(n);
    }, arguments);
  }, __wbg_resolve_ae8d83246e5bcc12: function(n) {
    const a = Promise.resolve(c(n));
    return m(a);
  }, __wbg_result_c5baa2d3d690a01a: function() {
    return O(function(n) {
      const a = c(n).result;
      return m(a);
    }, arguments);
  }, __wbg_resume_7cf56c82bfdf6c58: function() {
    return O(function(n) {
      const a = c(n).resume();
      return m(a);
    }, arguments);
  }, __wbg_revokeObjectURL_c4a7ed8e1908b794: function() {
    return O(function(n, a) {
      URL.revokeObjectURL(q(n, a));
    }, arguments);
  }, __wbg_samplerParameterf_774cff2229cc9fc3: function(n, a, i, _) {
    c(n).samplerParameterf(c(a), i >>> 0, _);
  }, __wbg_samplerParameteri_7dde222b01588620: function(n, a, i, _) {
    c(n).samplerParameteri(c(a), i >>> 0, _);
  }, __wbg_scheduler_a17d41c9c822fc26: function(n) {
    const a = c(n).scheduler;
    return m(a);
  }, __wbg_scheduler_b35fe73ba70e89cc: function(n) {
    const a = c(n).scheduler;
    return m(a);
  }, __wbg_scissor_b18f09381b341db5: function(n, a, i, _, d) {
    c(n).scissor(a, i, _, d);
  }, __wbg_scissor_db3842546fb31842: function(n, a, i, _, d) {
    c(n).scissor(a, i, _, d);
  }, __wbg_send_4a1dc66e8653e5ed: function() {
    return O(function(n, a, i) {
      c(n).send(q(a, i));
    }, arguments);
  }, __wbg_send_d31a693c975dea74: function() {
    return O(function(n, a, i) {
      c(n).send(oa(a, i));
    }, arguments);
  }, __wbg_send_d3733b292c3de949: function() {
    return O(function(n, a) {
      c(n).send(c(a));
    }, arguments);
  }, __wbg_setAttribute_f20d3b966749ab64: function() {
    return O(function(n, a, i, _, d) {
      c(n).setAttribute(q(a, i), q(_, d));
    }, arguments);
  }, __wbg_setBindGroup_4ba56e1e0d26f244: function() {
    return O(function(n, a, i, _, d, y, S) {
      c(n).setBindGroup(a >>> 0, c(i), _a(_, d), y, S >>> 0);
    }, arguments);
  }, __wbg_setBindGroup_6124849cc8547086: function(n, a, i) {
    c(n).setBindGroup(a >>> 0, c(i));
  }, __wbg_setBindGroup_79afcff8b9db8be3: function() {
    return O(function(n, a, i, _, d, y, S) {
      c(n).setBindGroup(a >>> 0, c(i), _a(_, d), y, S >>> 0);
    }, arguments);
  }, __wbg_setBindGroup_84eb639ac393a9f4: function(n, a, i) {
    c(n).setBindGroup(a >>> 0, c(i));
  }, __wbg_setBlendConstant_400c9c253b043929: function() {
    return O(function(n, a) {
      c(n).setBlendConstant(c(a));
    }, arguments);
  }, __wbg_setIndexBuffer_17431786d06c1b7c: function(n, a, i, _, d) {
    c(n).setIndexBuffer(c(a), rf[i], _, d);
  }, __wbg_setIndexBuffer_a16ed5b869c87507: function(n, a, i, _) {
    c(n).setIndexBuffer(c(a), rf[i], _);
  }, __wbg_setInterval_2cc6fda2bedb96bc: function() {
    return O(function(n, a, i) {
      return c(n).setInterval(c(a), i);
    }, arguments);
  }, __wbg_setPipeline_95c76ab8da697fcf: function(n, a) {
    c(n).setPipeline(c(a));
  }, __wbg_setPipeline_bab24dbce96903b9: function(n, a) {
    c(n).setPipeline(c(a));
  }, __wbg_setPointerCapture_b6e6a21fc0db7621: function() {
    return O(function(n, a) {
      c(n).setPointerCapture(a);
    }, arguments);
  }, __wbg_setProperty_ef29d2aa64a04d2b: function() {
    return O(function(n, a, i, _, d) {
      c(n).setProperty(q(a, i), q(_, d));
    }, arguments);
  }, __wbg_setScissorRect_40786fdec122b032: function(n, a, i, _, d) {
    c(n).setScissorRect(a >>> 0, i >>> 0, _ >>> 0, d >>> 0);
  }, __wbg_setStencilReference_f614f80489a0b9b4: function(n, a) {
    c(n).setStencilReference(a >>> 0);
  }, __wbg_setTimeout_647865935a499f8b: function() {
    return O(function(n, a) {
      return c(n).setTimeout(c(a));
    }, arguments);
  }, __wbg_setTimeout_7f7035ad0b026458: function() {
    return O(function(n, a, i) {
      return c(n).setTimeout(c(a), i);
    }, arguments);
  }, __wbg_setTimeout_ef24d2fc3ad97385: function() {
    return O(function(n, a) {
      const i = setTimeout(c(n), a);
      return m(i);
    }, arguments);
  }, __wbg_setVertexBuffer_91c4b602d0289943: function(n, a, i, _) {
    c(n).setVertexBuffer(a >>> 0, c(i), _);
  }, __wbg_setVertexBuffer_b508baf8d0ffe331: function(n, a, i, _, d) {
    c(n).setVertexBuffer(a >>> 0, c(i), _, d);
  }, __wbg_setViewport_f9d423db4f4b4b58: function(n, a, i, _, d, y, S) {
    c(n).setViewport(a, i, _, d, y, S);
  }, __wbg_set_361bc2460da3016f: function(n, a, i) {
    c(n).set(je(a, i));
  }, __wbg_set_7eaa4f96924fd6b3: function() {
    return O(function(n, a, i) {
      return Reflect.set(c(n), c(a), c(i));
    }, arguments);
  }, __wbg_set_8c0b3ffcf05d61c2: function(n, a, i) {
    c(n).set(oa(a, i));
  }, __wbg_set_a_5f6e488475272136: function(n, a) {
    c(n).a = a;
  }, __wbg_set_access_091f317905cd76a5: function(n, a) {
    c(n).access = Y1[a];
  }, __wbg_set_address_mode_u_a37cf1035585c638: function(n, a) {
    c(n).addressModeU = lf[a];
  }, __wbg_set_address_mode_v_8ac049e029caef76: function(n, a) {
    c(n).addressModeV = lf[a];
  }, __wbg_set_address_mode_w_eb9260ee11729e92: function(n, a) {
    c(n).addressModeW = lf[a];
  }, __wbg_set_alpha_aa2e606e9e647b21: function(n, a) {
    c(n).alpha = c(a);
  }, __wbg_set_alpha_mode_92402195b3ae1ee7: function(n, a) {
    c(n).alphaMode = R1[a];
  }, __wbg_set_alpha_to_coverage_enabled_b4ce9c3f7f8b7ad7: function(n, a) {
    c(n).alphaToCoverageEnabled = a !== 0;
  }, __wbg_set_array_layer_count_daec613068108a9d: function(n, a) {
    c(n).arrayLayerCount = a >>> 0;
  }, __wbg_set_array_stride_c2c009eabc18b5f6: function(n, a) {
    c(n).arrayStride = a;
  }, __wbg_set_aspect_77332ac136ee94eb: function(n, a) {
    c(n).aspect = Ib[a];
  }, __wbg_set_aspect_a823a14d00d42d37: function(n, a) {
    c(n).aspect = Ib[a];
  }, __wbg_set_attributes_05f9117fd32ca606: function(n, a) {
    c(n).attributes = c(a);
  }, __wbg_set_auto_increment_ffc3cd6470763a4c: function(n, a) {
    c(n).autoIncrement = a !== 0;
  }, __wbg_set_b_688365d692bba214: function(n, a) {
    c(n).b = a;
  }, __wbg_set_base_array_layer_cc6c68d233489c4b: function(n, a) {
    c(n).baseArrayLayer = a >>> 0;
  }, __wbg_set_base_mip_level_e07a3efe9006d5ea: function(n, a) {
    c(n).baseMipLevel = a >>> 0;
  }, __wbg_set_beginning_of_pass_write_index_27be5b0b35ec3de0: function(n, a) {
    c(n).beginningOfPassWriteIndex = a >>> 0;
  }, __wbg_set_beginning_of_pass_write_index_c12e7856ee670800: function(n, a) {
    c(n).beginningOfPassWriteIndex = a >>> 0;
  }, __wbg_set_binaryType_3dcf8281ec100a8f: function(n, a) {
    c(n).binaryType = O1[a];
  }, __wbg_set_bind_group_layouts_5325d038771af328: function(n, a) {
    c(n).bindGroupLayouts = c(a);
  }, __wbg_set_binding_b6b0fe5c281b8c69: function(n, a) {
    c(n).binding = a >>> 0;
  }, __wbg_set_binding_f3c188a8cd21455b: function(n, a) {
    c(n).binding = a >>> 0;
  }, __wbg_set_blend_8d6e9c08b5702a09: function(n, a) {
    c(n).blend = c(a);
  }, __wbg_set_body_a3d856b097dfda04: function(n, a) {
    c(n).body = c(a);
  }, __wbg_set_box_6a730e6c216d512c: function(n, a) {
    c(n).box = I1[a];
  }, __wbg_set_buffer_55f096330c8912b4: function(n, a) {
    c(n).buffer = c(a);
  }, __wbg_set_buffer_aa7bf4ad8f17b2bd: function(n, a) {
    c(n).buffer = c(a);
  }, __wbg_set_buffer_e89095a9f0cafad3: function(n, a) {
    c(n).buffer = c(a);
  }, __wbg_set_buffer_ea42becad62e7650: function(n, a) {
    c(n).buffer = c(a);
  }, __wbg_set_buffers_85a7238f4ef28ab4: function(n, a) {
    c(n).buffers = c(a);
  }, __wbg_set_bytes_per_row_68a1ea90d4710bc9: function(n, a) {
    c(n).bytesPerRow = a >>> 0;
  }, __wbg_set_bytes_per_row_91681ca78d744888: function(n, a) {
    c(n).bytesPerRow = a >>> 0;
  }, __wbg_set_channelCount_77970d0435dc29e3: function(n, a) {
    c(n).channelCount = a >>> 0;
  }, __wbg_set_clear_value_642701f928a5ccb3: function(n, a) {
    c(n).clearValue = c(a);
  }, __wbg_set_code_56e2d45ec1ff6c2d: function(n, a, i) {
    c(n).code = q(a, i);
  }, __wbg_set_color_attachments_abe67f6631926e28: function(n, a) {
    c(n).colorAttachments = c(a);
  }, __wbg_set_color_bc393d7efc3c8594: function(n, a) {
    c(n).color = c(a);
  }, __wbg_set_compare_1509dc1a5420943f: function(n, a) {
    c(n).compare = cf[a];
  }, __wbg_set_compare_42211fbf15e3b850: function(n, a) {
    c(n).compare = cf[a];
  }, __wbg_set_compute_5a859e405c9eb6c6: function(n, a) {
    c(n).compute = c(a);
  }, __wbg_set_count_26a934d1cd07d080: function(n, a) {
    c(n).count = a >>> 0;
  }, __wbg_set_cull_mode_9d466c1ab414cac8: function(n, a) {
    c(n).cullMode = U1[a];
  }, __wbg_set_cursor_8d686ff9dd99a325: function(n, a, i) {
    c(n).cursor = q(a, i);
  }, __wbg_set_depth_bias_428c9340b0fd937b: function(n, a) {
    c(n).depthBias = a;
  }, __wbg_set_depth_bias_clamp_f009599ca67fa30c: function(n, a) {
    c(n).depthBiasClamp = a;
  }, __wbg_set_depth_bias_slope_scale_7125880b4cb7a951: function(n, a) {
    c(n).depthBiasSlopeScale = a;
  }, __wbg_set_depth_clear_value_442bf492734f63b6: function(n, a) {
    c(n).depthClearValue = a;
  }, __wbg_set_depth_compare_30e9ea552da12fe2: function(n, a) {
    c(n).depthCompare = cf[a];
  }, __wbg_set_depth_fail_op_5e42dc3e4c382951: function(n, a) {
    c(n).depthFailOp = _f[a];
  }, __wbg_set_depth_load_op_34d430b74bb36d91: function(n, a) {
    c(n).depthLoadOp = ff[a];
  }, __wbg_set_depth_or_array_layers_4bbbeadacb393f02: function(n, a) {
    c(n).depthOrArrayLayers = a >>> 0;
  }, __wbg_set_depth_read_only_138a11b10c731094: function(n, a) {
    c(n).depthReadOnly = a !== 0;
  }, __wbg_set_depth_stencil_1bd50dbc450c8650: function(n, a) {
    c(n).depthStencil = c(a);
  }, __wbg_set_depth_stencil_attachment_1ee0d93bc3273369: function(n, a) {
    c(n).depthStencilAttachment = c(a);
  }, __wbg_set_depth_store_op_0ea0a215313dbda7: function(n, a) {
    c(n).depthStoreOp = of[a];
  }, __wbg_set_depth_write_enabled_64c2e7f6fa4b6b7b: function(n, a) {
    c(n).depthWriteEnabled = a !== 0;
  }, __wbg_set_device_0d774b66e7288f72: function(n, a) {
    c(n).device = c(a);
  }, __wbg_set_dimension_174ad7e2fb67fb4e: function(n, a) {
    c(n).dimension = sf[a];
  }, __wbg_set_dimension_36e13ccecae5af4b: function(n, a) {
    c(n).dimension = V1[a];
  }, __wbg_set_dst_factor_1ed75271a89a711e: function(n, a) {
    c(n).dstFactor = kb[a];
  }, __wbg_set_duration_bfef0b021dc8fd5b: function(n, a) {
    c(n).duration = a;
  }, __wbg_set_e09648bea3f1af1e: function() {
    return O(function(n, a, i, _, d) {
      c(n).set(q(a, i), q(_, d));
    }, arguments);
  }, __wbg_set_e80615d7a9a43981: function(n, a, i) {
    c(n).set(c(a), i >>> 0);
  }, __wbg_set_end_of_pass_write_index_e8f52fc08bc0603e: function(n, a) {
    c(n).endOfPassWriteIndex = a >>> 0;
  }, __wbg_set_end_of_pass_write_index_f4ab90c5743df805: function(n, a) {
    c(n).endOfPassWriteIndex = a >>> 0;
  }, __wbg_set_entries_3017e6132f938c6e: function(n, a) {
    c(n).entries = c(a);
  }, __wbg_set_entries_fc76ca4d7da6a709: function(n, a) {
    c(n).entries = c(a);
  }, __wbg_set_entry_point_4443daff87d82ef1: function(n, a, i) {
    c(n).entryPoint = q(a, i);
  }, __wbg_set_entry_point_6fec5723cc790927: function(n, a, i) {
    c(n).entryPoint = q(a, i);
  }, __wbg_set_entry_point_8db3b6d103e3b865: function(n, a, i) {
    c(n).entryPoint = q(a, i);
  }, __wbg_set_external_texture_825fe2bc7a0c0603: function(n, a) {
    c(n).externalTexture = c(a);
  }, __wbg_set_fail_op_77ab26c98f847b65: function(n, a) {
    c(n).failOp = _f[a];
  }, __wbg_set_format_1786adb7bc74c7c9: function(n, a) {
    c(n).format = fa[a];
  }, __wbg_set_format_6606f5c1fba6f459: function(n, a) {
    c(n).format = Q1[a];
  }, __wbg_set_format_90860b0321868db4: function(n, a) {
    c(n).format = fa[a];
  }, __wbg_set_format_abf7a1bc5425c56a: function(n, a) {
    c(n).format = fa[a];
  }, __wbg_set_format_d347899cd860709c: function(n, a) {
    c(n).format = fa[a];
  }, __wbg_set_format_e9d4b1475bb3bd3b: function(n, a) {
    c(n).format = fa[a];
  }, __wbg_set_format_f9341112e43ea182: function(n, a) {
    c(n).format = fa[a];
  }, __wbg_set_fragment_1a595620425637e1: function(n, a) {
    c(n).fragment = c(a);
  }, __wbg_set_front_face_50cdf4eb61504a46: function(n, a) {
    c(n).frontFace = j1[a];
  }, __wbg_set_g_d4d1d77cf8fdd362: function(n, a) {
    c(n).g = a;
  }, __wbg_set_has_dynamic_offset_7d30014fdbfe90c5: function(n, a) {
    c(n).hasDynamicOffset = a !== 0;
  }, __wbg_set_height_98a1a397672657e2: function(n, a) {
    c(n).height = a >>> 0;
  }, __wbg_set_height_b6548a01bdcb689a: function(n, a) {
    c(n).height = a >>> 0;
  }, __wbg_set_height_e8b5483b8c117d5e: function(n, a) {
    c(n).height = a >>> 0;
  }, __wbg_set_iterations_b84d4d3302a291a0: function(n, a) {
    c(n).iterations = a;
  }, __wbg_set_key_path_3c45a8ff0b89e678: function(n, a) {
    c(n).keyPath = c(a);
  }, __wbg_set_label_03d2396d4655a3e1: function(n, a, i) {
    c(n).label = q(a, i);
  }, __wbg_set_label_0c1bd0e976cf0a9a: function(n, a, i) {
    c(n).label = q(a, i);
  }, __wbg_set_label_1175a3329a06e52b: function(n, a, i) {
    c(n).label = q(a, i);
  }, __wbg_set_label_2d2227f4d5991e50: function(n, a, i) {
    c(n).label = q(a, i);
  }, __wbg_set_label_2f592bd1be3db6b3: function(n, a, i) {
    c(n).label = q(a, i);
  }, __wbg_set_label_4a1dd4244f80abc9: function(n, a, i) {
    c(n).label = q(a, i);
  }, __wbg_set_label_8b0da33fd11b2572: function(n, a, i) {
    c(n).label = q(a, i);
  }, __wbg_set_label_8fd860a36d2c7b74: function(n, a, i) {
    c(n).label = q(a, i);
  }, __wbg_set_label_bae57fb9f24fde5c: function(n, a, i) {
    c(n).label = q(a, i);
  }, __wbg_set_label_be45aed56e4b9fee: function(n, a, i) {
    c(n).label = q(a, i);
  }, __wbg_set_label_c47c451211e2f6d2: function(n, a, i) {
    c(n).label = q(a, i);
  }, __wbg_set_label_cd567b7b35838e4c: function(n, a, i) {
    c(n).label = q(a, i);
  }, __wbg_set_label_d1c24b5a7a3ac31d: function(n, a, i) {
    c(n).label = q(a, i);
  }, __wbg_set_label_dcd98efbb9370da8: function(n, a, i) {
    c(n).label = q(a, i);
  }, __wbg_set_label_f92ae11c77d74198: function(n, a, i) {
    c(n).label = q(a, i);
  }, __wbg_set_layout_19e558a0fa724e95: function(n, a) {
    c(n).layout = c(a);
  }, __wbg_set_layout_7c5ba5bdcde8a0f0: function(n, a) {
    c(n).layout = c(a);
  }, __wbg_set_layout_eeef59714f5bf48b: function(n, a) {
    c(n).layout = c(a);
  }, __wbg_set_load_op_56844f51434037bf: function(n, a) {
    c(n).loadOp = ff[a];
  }, __wbg_set_lod_max_clamp_3f157633f32c9f94: function(n, a) {
    c(n).lodMaxClamp = a;
  }, __wbg_set_lod_min_clamp_7e246c739fb1a854: function(n, a) {
    c(n).lodMinClamp = a;
  }, __wbg_set_mag_filter_69d846b974d4bcc0: function(n, a) {
    c(n).magFilter = Wb[a];
  }, __wbg_set_mapped_at_creation_48de4735fab51e78: function(n, a) {
    c(n).mappedAtCreation = a !== 0;
  }, __wbg_set_mask_0c49a66362fc0079: function(n, a) {
    c(n).mask = a >>> 0;
  }, __wbg_set_max_anisotropy_3ef0d5bca2336cc7: function(n, a) {
    c(n).maxAnisotropy = a;
  }, __wbg_set_method_8c015e8bcafd7be1: function(n, a, i) {
    c(n).method = q(a, i);
  }, __wbg_set_min_binding_size_689661b9ed25e083: function(n, a) {
    c(n).minBindingSize = a;
  }, __wbg_set_min_filter_fbf2d8d9f503dcd7: function(n, a) {
    c(n).minFilter = Wb[a];
  }, __wbg_set_mip_level_246db61be15bdd69: function(n, a) {
    c(n).mipLevel = a >>> 0;
  }, __wbg_set_mip_level_count_72f8bc1f80f7539b: function(n, a) {
    c(n).mipLevelCount = a >>> 0;
  }, __wbg_set_mip_level_count_b19a0d9192e62d5d: function(n, a) {
    c(n).mipLevelCount = a >>> 0;
  }, __wbg_set_mipmap_filter_17fd50a3898fd5ff: function(n, a) {
    c(n).mipmapFilter = q1[a];
  }, __wbg_set_mode_21d9616e340ea5b3: function(n, a) {
    c(n).mode = k1[a];
  }, __wbg_set_mode_5a87f2c809cf37c2: function(n, a) {
    c(n).mode = W1[a];
  }, __wbg_set_module_08ad08e736d8edbf: function(n, a) {
    c(n).module = c(a);
  }, __wbg_set_module_14e471fdd94c582d: function(n, a) {
    c(n).module = c(a);
  }, __wbg_set_module_9b938909233aed50: function(n, a) {
    c(n).module = c(a);
  }, __wbg_set_multi_entry_38c253febe05d3be: function(n, a) {
    c(n).multiEntry = a !== 0;
  }, __wbg_set_multisample_85f073947b782d07: function(n, a) {
    c(n).multisample = c(a);
  }, __wbg_set_multisampled_40505c1381e1c32c: function(n, a) {
    c(n).multisampled = a !== 0;
  }, __wbg_set_name_02d633afec2e2bf0: function(n, a, i) {
    c(n).name = q(a, i);
  }, __wbg_set_offset_2c374e604504e0b2: function(n, a) {
    c(n).offset = a;
  }, __wbg_set_offset_73156b0e0b41d79a: function(n, a) {
    c(n).offset = a;
  }, __wbg_set_offset_8d9d9afffa18b591: function(n, a) {
    c(n).offset = a;
  }, __wbg_set_offset_a097a8050a3a9a33: function(n, a) {
    c(n).offset = a;
  }, __wbg_set_onabort_63885d8d7841a8d5: function(n, a) {
    c(n).onabort = c(a);
  }, __wbg_set_onclose_8da801226bdd7a7b: function(n, a) {
    c(n).onclose = c(a);
  }, __wbg_set_oncomplete_f31e6dc6d16c1ff8: function(n, a) {
    c(n).oncomplete = c(a);
  }, __wbg_set_onerror_8a268cb237177bba: function(n, a) {
    c(n).onerror = c(a);
  }, __wbg_set_onerror_901ca711f94a5bbb: function(n, a) {
    c(n).onerror = c(a);
  }, __wbg_set_onerror_c1ecd6233c533c08: function(n, a) {
    c(n).onerror = c(a);
  }, __wbg_set_onmessage_6f80ab771bf151aa: function(n, a) {
    c(n).onmessage = c(a);
  }, __wbg_set_onmessage_d5dc11c291025af6: function(n, a) {
    c(n).onmessage = c(a);
  }, __wbg_set_onmessage_f939f8b6d08ca76b: function(n, a) {
    c(n).onmessage = c(a);
  }, __wbg_set_onopen_34e3e24cf9337ddd: function(n, a) {
    c(n).onopen = c(a);
  }, __wbg_set_onsuccess_fca94ded107b64af: function(n, a) {
    c(n).onsuccess = c(a);
  }, __wbg_set_onuncapturederror_b9a9ff2c881b2b40: function(n, a) {
    c(n).onuncapturederror = c(a);
  }, __wbg_set_onupgradeneeded_860ce42184f987e7: function(n, a) {
    c(n).onupgradeneeded = c(a);
  }, __wbg_set_onversionchange_3d88930f82c97b92: function(n, a) {
    c(n).onversionchange = c(a);
  }, __wbg_set_operation_b5862f5a1a143b30: function(n, a) {
    c(n).operation = M1[a];
  }, __wbg_set_option_algorithm_raw_693274bd7f1275e0: function(n, a) {
    c(n).algorithm = Gt(a);
  }, __wbg_set_option_allow_pooling_aa637fc7f2e488b1: function(n, a) {
    c(n).allowPooling = a === 16777215 ? void 0 : a !== 0;
  }, __wbg_set_option_close_code_624c19c1530f917c: function(n, a) {
    c(n).closeCode = a === 4294967297 ? void 0 : a;
  }, __wbg_set_option_congestion_control_4478d1afecc84e6f: function(n, a) {
    c(n).congestionControl = $1[a];
  }, __wbg_set_option_reason_20a082bfbba4ec8b: function(n, a) {
    c(n).reason = Gt(a);
  }, __wbg_set_option_require_unreliable_203c3fdb2d312c57: function(n, a) {
    c(n).requireUnreliable = a === 16777215 ? void 0 : a !== 0;
  }, __wbg_set_option_server_certificate_hashes_ca5163033476c253: function(n, a, i) {
    let _;
    a !== 0 && (_ = a2(a, i).slice(), p.__wbindgen_export4(a, i * 4, 4)), c(n).serverCertificateHashes = _;
  }, __wbg_set_option_value_raw_3f4b8318e07ec20d: function(n, a) {
    c(n).value = Gt(a);
  }, __wbg_set_origin_9b3b0fbe0a5dc469: function(n, a) {
    c(n).origin = c(a);
  }, __wbg_set_pass_op_e9470d1262fb8a8b: function(n, a) {
    c(n).passOp = _f[a];
  }, __wbg_set_power_preference_c0d3fa7ce46b1a2e: function(n, a) {
    c(n).powerPreference = H1[a];
  }, __wbg_set_premultiply_alpha_696b545e0615f655: function(n, a) {
    c(n).premultiplyAlpha = J1[a];
  }, __wbg_set_primitive_369241acd17871f1: function(n, a) {
    c(n).primitive = c(a);
  }, __wbg_set_query_set_18679a8580267d5a: function(n, a) {
    c(n).querySet = c(a);
  }, __wbg_set_query_set_f1314b06c84c4b00: function(n, a) {
    c(n).querySet = c(a);
  }, __wbg_set_r_527e5a41c4b1a846: function(n, a) {
    c(n).r = a;
  }, __wbg_set_required_features_54918de8185c5fab: function(n, a) {
    c(n).requiredFeatures = c(a);
  }, __wbg_set_required_limits_3b031f66f838f4e3: function(n, a) {
    c(n).requiredLimits = c(a);
  }, __wbg_set_resolve_target_fe76b3f99cf72078: function(n, a) {
    c(n).resolveTarget = c(a);
  }, __wbg_set_resource_fe385d2e3dadaf63: function(n, a) {
    c(n).resource = c(a);
  }, __wbg_set_rows_per_image_d198b7e73a38978b: function(n, a) {
    c(n).rowsPerImage = a >>> 0;
  }, __wbg_set_rows_per_image_f9878f4b10f4fd7f: function(n, a) {
    c(n).rowsPerImage = a >>> 0;
  }, __wbg_set_sample_count_865e1d19b84e27e6: function(n, a) {
    c(n).sampleCount = a >>> 0;
  }, __wbg_set_sample_rate_88fa12f3b8a6ae94: function(n, a) {
    c(n).sampleRate = a;
  }, __wbg_set_sample_type_7088b1efddce6a69: function(n, a) {
    c(n).sampleType = X1[a];
  }, __wbg_set_sampler_8c5d7fb1b02058c6: function(n, a) {
    c(n).sampler = c(a);
  }, __wbg_set_shader_location_0ff30a733291a396: function(n, a) {
    c(n).shaderLocation = a >>> 0;
  }, __wbg_set_size_1e6281b07cd39177: function(n, a) {
    c(n).size = a;
  }, __wbg_set_size_41cd9255ca1e4242: function(n, a) {
    c(n).size = a;
  }, __wbg_set_size_a61ff22205255d61: function(n, a) {
    c(n).size = c(a);
  }, __wbg_set_src_f257a96103ac1ac6: function(n, a, i) {
    c(n).src = q(a, i);
  }, __wbg_set_src_factor_1c4f755f8676df1b: function(n, a) {
    c(n).srcFactor = kb[a];
  }, __wbg_set_stencil_back_6ef4683123b19b25: function(n, a) {
    c(n).stencilBack = c(a);
  }, __wbg_set_stencil_clear_value_10b58f674d0177c2: function(n, a) {
    c(n).stencilClearValue = a >>> 0;
  }, __wbg_set_stencil_front_aeb8580a97e5424b: function(n, a) {
    c(n).stencilFront = c(a);
  }, __wbg_set_stencil_load_op_f20a90a66acd3d8c: function(n, a) {
    c(n).stencilLoadOp = ff[a];
  }, __wbg_set_stencil_read_mask_2954f260d47349ea: function(n, a) {
    c(n).stencilReadMask = a >>> 0;
  }, __wbg_set_stencil_read_only_fb489d191b6d969b: function(n, a) {
    c(n).stencilReadOnly = a !== 0;
  }, __wbg_set_stencil_store_op_477c4cf6422dfa3f: function(n, a) {
    c(n).stencilStoreOp = of[a];
  }, __wbg_set_stencil_write_mask_3f8e9b3781814a95: function(n, a) {
    c(n).stencilWriteMask = a >>> 0;
  }, __wbg_set_step_mode_a35aef328761c452: function(n, a) {
    c(n).stepMode = Z1[a];
  }, __wbg_set_storage_texture_ab9eed9786337ef0: function(n, a) {
    c(n).storageTexture = c(a);
  }, __wbg_set_store_op_caeede4654b3d847: function(n, a) {
    c(n).storeOp = of[a];
  }, __wbg_set_strip_index_format_0cd0510e166c4ec4: function(n, a) {
    c(n).stripIndexFormat = rf[a];
  }, __wbg_set_targets_6b0b3bdd87f35668: function(n, a) {
    c(n).targets = c(a);
  }, __wbg_set_texture_16d2be474ce6ad0c: function(n, a) {
    c(n).texture = c(a);
  }, __wbg_set_texture_e25a73da75cf5808: function(n, a) {
    c(n).texture = c(a);
  }, __wbg_set_timestamp_writes_26336a2ad72cdcaf: function(n, a) {
    c(n).timestampWrites = c(a);
  }, __wbg_set_timestamp_writes_c552d52fbb417005: function(n, a) {
    c(n).timestampWrites = c(a);
  }, __wbg_set_topology_beefb3aca0612b00: function(n, a) {
    c(n).topology = L1[a];
  }, __wbg_set_type_33e79f1b45a78c37: function(n, a, i) {
    c(n).type = q(a, i);
  }, __wbg_set_type_38961e08504ca674: function(n, a) {
    c(n).type = C1[a];
  }, __wbg_set_type_c1eebc19f8a6aeb9: function(n, a) {
    c(n).type = G1[a];
  }, __wbg_set_unclipped_depth_5a4f7eb57fe006b2: function(n, a) {
    c(n).unclippedDepth = a !== 0;
  }, __wbg_set_unique_a39d85db47f8e025: function(n, a) {
    c(n).unique = a !== 0;
  }, __wbg_set_usage_7f0dda8309469b1c: function(n, a) {
    c(n).usage = a >>> 0;
  }, __wbg_set_usage_7fa9cd18d1104aca: function(n, a) {
    c(n).usage = a >>> 0;
  }, __wbg_set_usage_908213a4d4bb8bde: function(n, a) {
    c(n).usage = a >>> 0;
  }, __wbg_set_usage_ae014e77ff77ce06: function(n, a) {
    c(n).usage = a >>> 0;
  }, __wbg_set_vertex_a4951dd9a7a4ed54: function(n, a) {
    c(n).vertex = c(a);
  }, __wbg_set_view_bdeab150b5f0768c: function(n, a) {
    c(n).view = c(a);
  }, __wbg_set_view_dbd0294573f64d05: function(n, a) {
    c(n).view = c(a);
  }, __wbg_set_view_dimension_263387976511ebc9: function(n, a) {
    c(n).viewDimension = sf[a];
  }, __wbg_set_view_dimension_3ed01b237e85826f: function(n, a) {
    c(n).viewDimension = sf[a];
  }, __wbg_set_view_formats_bab284fc81b40e70: function(n, a) {
    c(n).viewFormats = c(a);
  }, __wbg_set_view_formats_fe531a043efb71fa: function(n, a) {
    c(n).viewFormats = c(a);
  }, __wbg_set_visibility_1bca121a89accba5: function(n, a) {
    c(n).visibility = a >>> 0;
  }, __wbg_set_width_1a5e2e86fa5bdcd8: function(n, a) {
    c(n).width = a >>> 0;
  }, __wbg_set_width_576343a4a7f2cf28: function(n, a) {
    c(n).width = a >>> 0;
  }, __wbg_set_width_c0fcaa2da53cd540: function(n, a) {
    c(n).width = a >>> 0;
  }, __wbg_set_write_mask_144b25e2bd909124: function(n, a) {
    c(n).writeMask = a >>> 0;
  }, __wbg_set_x_56f0c2c08a62725c: function(n, a) {
    c(n).x = a >>> 0;
  }, __wbg_set_y_04fb8ce84735b4e1: function(n, a) {
    c(n).y = a >>> 0;
  }, __wbg_set_z_a51316db27a4941e: function(n, a) {
    c(n).z = a >>> 0;
  }, __wbg_shaderSource_06639e7b476e6ac2: function(n, a, i, _) {
    c(n).shaderSource(c(a), q(i, _));
  }, __wbg_shaderSource_2bca0edc97475e95: function(n, a, i, _) {
    c(n).shaderSource(c(a), q(i, _));
  }, __wbg_shiftKey_5256a2168f9dc186: function(n) {
    return c(n).shiftKey;
  }, __wbg_shiftKey_ec106aa0755af421: function(n) {
    return c(n).shiftKey;
  }, __wbg_signal_166e1da31adcac18: function(n) {
    const a = c(n).signal;
    return m(a);
  }, __wbg_size_1356eae711a92515: function(n) {
    return c(n).size;
  }, __wbg_stack_3b0d974bbf31e44f: function(n, a) {
    const i = c(a).stack, _ = _e(i, p.__wbindgen_export, p.__wbindgen_export2), d = ae;
    L().setInt32(n + 4, d, true), L().setInt32(n + 0, _, true);
  }, __wbg_start_b037850d8eda4626: function() {
    return O(function(n, a) {
      c(n).start(a);
    }, arguments);
  }, __wbg_start_f837ba2bac4733b5: function(n) {
    c(n).start();
  }, __wbg_static_accessor_GLOBAL_8adb955bd33fac2f: function() {
    const n = typeof global > "u" ? null : global;
    return J(n) ? 0 : m(n);
  }, __wbg_static_accessor_GLOBAL_THIS_ad356e0db91c7913: function() {
    const n = typeof globalThis > "u" ? null : globalThis;
    return J(n) ? 0 : m(n);
  }, __wbg_static_accessor_SELF_f207c857566db248: function() {
    const n = typeof self > "u" ? null : self;
    return J(n) ? 0 : m(n);
  }, __wbg_static_accessor_WINDOW_bb9f1ba69d61b386: function() {
    const n = typeof window > "u" ? null : window;
    return J(n) ? 0 : m(n);
  }, __wbg_status_318629ab93a22955: function(n) {
    return c(n).status;
  }, __wbg_stencilFuncSeparate_18642df0574c1930: function(n, a, i, _, d) {
    c(n).stencilFuncSeparate(a >>> 0, i >>> 0, _, d >>> 0);
  }, __wbg_stencilFuncSeparate_94ee4fbc164addec: function(n, a, i, _, d) {
    c(n).stencilFuncSeparate(a >>> 0, i >>> 0, _, d >>> 0);
  }, __wbg_stencilMaskSeparate_13b0475860a9b559: function(n, a, i) {
    c(n).stencilMaskSeparate(a >>> 0, i >>> 0);
  }, __wbg_stencilMaskSeparate_a7bd409376ee05ff: function(n, a, i) {
    c(n).stencilMaskSeparate(a >>> 0, i >>> 0);
  }, __wbg_stencilMask_326a11d0928c3808: function(n, a) {
    c(n).stencilMask(a >>> 0);
  }, __wbg_stencilMask_6354f8ba392f6581: function(n, a) {
    c(n).stencilMask(a >>> 0);
  }, __wbg_stencilOpSeparate_7e819381705b9731: function(n, a, i, _, d) {
    c(n).stencilOpSeparate(a >>> 0, i >>> 0, _ >>> 0, d >>> 0);
  }, __wbg_stencilOpSeparate_8627d0f5f7fe5800: function(n, a, i, _, d) {
    c(n).stencilOpSeparate(a >>> 0, i >>> 0, _ >>> 0, d >>> 0);
  }, __wbg_stringify_5ae93966a84901ac: function() {
    return O(function(n) {
      const a = JSON.stringify(c(n));
      return m(a);
    }, arguments);
  }, __wbg_style_b01fc765f98b99ff: function(n) {
    const a = c(n).style;
    return m(a);
  }, __wbg_subarray_a068d24e39478a8a: function(n, a, i) {
    const _ = c(n).subarray(a >>> 0, i >>> 0);
    return m(_);
  }, __wbg_submit_1290d44bb76ecef4: function(n, a) {
    c(n).submit(c(a));
  }, __wbg_target_7bc90f314634b37b: function(n) {
    const a = c(n).target;
    return J(a) ? 0 : m(a);
  }, __wbg_terminate_8d65e3d9758359c7: function(n) {
    c(n).terminate();
  }, __wbg_texImage2D_32ed4220040ca614: function() {
    return O(function(n, a, i, _, d, y, S, h, B, R) {
      c(n).texImage2D(a >>> 0, i, _, d, y, S, h >>> 0, B >>> 0, c(R));
    }, arguments);
  }, __wbg_texImage2D_d8c284c813952313: function() {
    return O(function(n, a, i, _, d, y, S, h, B, R) {
      c(n).texImage2D(a >>> 0, i, _, d, y, S, h >>> 0, B >>> 0, R);
    }, arguments);
  }, __wbg_texImage2D_f4ae6c314a9a4bbe: function() {
    return O(function(n, a, i, _, d, y, S, h, B, R) {
      c(n).texImage2D(a >>> 0, i, _, d, y, S, h >>> 0, B >>> 0, c(R));
    }, arguments);
  }, __wbg_texImage3D_88ff1fa41be127b9: function() {
    return O(function(n, a, i, _, d, y, S, h, B, R, X) {
      c(n).texImage3D(a >>> 0, i, _, d, y, S, h, B >>> 0, R >>> 0, c(X));
    }, arguments);
  }, __wbg_texImage3D_9a207e0459a4f276: function() {
    return O(function(n, a, i, _, d, y, S, h, B, R, X) {
      c(n).texImage3D(a >>> 0, i, _, d, y, S, h, B >>> 0, R >>> 0, X);
    }, arguments);
  }, __wbg_texParameteri_f4b1596185f5432d: function(n, a, i, _) {
    c(n).texParameteri(a >>> 0, i >>> 0, _);
  }, __wbg_texParameteri_fcdec30159061963: function(n, a, i, _) {
    c(n).texParameteri(a >>> 0, i >>> 0, _);
  }, __wbg_texStorage2D_a84f74d36d279097: function(n, a, i, _, d, y) {
    c(n).texStorage2D(a >>> 0, i, _ >>> 0, d, y);
  }, __wbg_texStorage3D_aec6fc3e85ec72da: function(n, a, i, _, d, y, S) {
    c(n).texStorage3D(a >>> 0, i, _ >>> 0, d, y, S);
  }, __wbg_texSubImage2D_1e7d6febf82b9bed: function() {
    return O(function(n, a, i, _, d, y, S, h, B, R) {
      c(n).texSubImage2D(a >>> 0, i, _, d, y, S, h >>> 0, B >>> 0, c(R));
    }, arguments);
  }, __wbg_texSubImage2D_271ffedb47424d0d: function() {
    return O(function(n, a, i, _, d, y, S, h, B, R) {
      c(n).texSubImage2D(a >>> 0, i, _, d, y, S, h >>> 0, B >>> 0, c(R));
    }, arguments);
  }, __wbg_texSubImage2D_3bb41b987f2bfe39: function() {
    return O(function(n, a, i, _, d, y, S, h, B, R) {
      c(n).texSubImage2D(a >>> 0, i, _, d, y, S, h >>> 0, B >>> 0, c(R));
    }, arguments);
  }, __wbg_texSubImage2D_68e0413824eddc12: function() {
    return O(function(n, a, i, _, d, y, S, h, B, R) {
      c(n).texSubImage2D(a >>> 0, i, _, d, y, S, h >>> 0, B >>> 0, c(R));
    }, arguments);
  }, __wbg_texSubImage2D_b6cdbbe62097211a: function() {
    return O(function(n, a, i, _, d, y, S, h, B, R) {
      c(n).texSubImage2D(a >>> 0, i, _, d, y, S, h >>> 0, B >>> 0, c(R));
    }, arguments);
  }, __wbg_texSubImage2D_c8919d8f32f723da: function() {
    return O(function(n, a, i, _, d, y, S, h, B, R) {
      c(n).texSubImage2D(a >>> 0, i, _, d, y, S, h >>> 0, B >>> 0, c(R));
    }, arguments);
  }, __wbg_texSubImage2D_d784df0b813dc1ab: function() {
    return O(function(n, a, i, _, d, y, S, h, B, R) {
      c(n).texSubImage2D(a >>> 0, i, _, d, y, S, h >>> 0, B >>> 0, R);
    }, arguments);
  }, __wbg_texSubImage2D_dd1d50234b61de4b: function() {
    return O(function(n, a, i, _, d, y, S, h, B, R) {
      c(n).texSubImage2D(a >>> 0, i, _, d, y, S, h >>> 0, B >>> 0, c(R));
    }, arguments);
  }, __wbg_texSubImage3D_09cc863aedf44a21: function() {
    return O(function(n, a, i, _, d, y, S, h, B, R, X, ie) {
      c(n).texSubImage3D(a >>> 0, i, _, d, y, S, h, B, R >>> 0, X >>> 0, c(ie));
    }, arguments);
  }, __wbg_texSubImage3D_4665e67a8f0f7806: function() {
    return O(function(n, a, i, _, d, y, S, h, B, R, X, ie) {
      c(n).texSubImage3D(a >>> 0, i, _, d, y, S, h, B, R >>> 0, X >>> 0, c(ie));
    }, arguments);
  }, __wbg_texSubImage3D_61ed187f3ec11ecc: function() {
    return O(function(n, a, i, _, d, y, S, h, B, R, X, ie) {
      c(n).texSubImage3D(a >>> 0, i, _, d, y, S, h, B, R >>> 0, X >>> 0, c(ie));
    }, arguments);
  }, __wbg_texSubImage3D_6a46981af8bc8e49: function() {
    return O(function(n, a, i, _, d, y, S, h, B, R, X, ie) {
      c(n).texSubImage3D(a >>> 0, i, _, d, y, S, h, B, R >>> 0, X >>> 0, c(ie));
    }, arguments);
  }, __wbg_texSubImage3D_9eca35d234d51b8a: function() {
    return O(function(n, a, i, _, d, y, S, h, B, R, X, ie) {
      c(n).texSubImage3D(a >>> 0, i, _, d, y, S, h, B, R >>> 0, X >>> 0, c(ie));
    }, arguments);
  }, __wbg_texSubImage3D_b3cbbb79fe54da6d: function() {
    return O(function(n, a, i, _, d, y, S, h, B, R, X, ie) {
      c(n).texSubImage3D(a >>> 0, i, _, d, y, S, h, B, R >>> 0, X >>> 0, ie);
    }, arguments);
  }, __wbg_texSubImage3D_f9c3af789162846a: function() {
    return O(function(n, a, i, _, d, y, S, h, B, R, X, ie) {
      c(n).texSubImage3D(a >>> 0, i, _, d, y, S, h, B, R >>> 0, X >>> 0, c(ie));
    }, arguments);
  }, __wbg_then_098abe61755d12f6: function(n, a) {
    const i = c(n).then(c(a));
    return m(i);
  }, __wbg_then_1d7a5273811a5cea: function(n, a) {
    const i = c(n).then(c(a));
    return m(i);
  }, __wbg_then_9e335f6dd892bc11: function(n, a, i) {
    const _ = c(n).then(c(a), c(i));
    return m(_);
  }, __wbg_then_bc59d1943397ca4e: function(n, a, i) {
    const _ = c(n).then(c(a), c(i));
    return m(_);
  }, __wbg_timeOrigin_f3d5cb4f4a06c2b7: function(n) {
    return c(n).timeOrigin;
  }, __wbg_toBlob_b7bc2b08e11beff6: function() {
    return O(function(n, a) {
      c(n).toBlob(c(a));
    }, arguments);
  }, __wbg_toString_3272fa0dfd05dd87: function(n) {
    const a = c(n).toString();
    return m(a);
  }, __wbg_transaction_3223f7c8d0f40129: function() {
    return O(function(n, a, i) {
      const _ = c(n).transaction(c(a), K1[i]);
      return m(_);
    }, arguments);
  }, __wbg_transaction_fda57653957fee06: function(n) {
    const a = c(n).transaction;
    return J(a) ? 0 : m(a);
  }, __wbg_transferFromImageBitmap_9f9bd42ea0f80770: function(n, a) {
    c(n).transferFromImageBitmap(c(a));
  }, __wbg_uniform1f_8c3b03df282dba21: function(n, a, i) {
    c(n).uniform1f(c(a), i);
  }, __wbg_uniform1f_b8841988568406b9: function(n, a, i) {
    c(n).uniform1f(c(a), i);
  }, __wbg_uniform1i_953040fb972e9fab: function(n, a, i) {
    c(n).uniform1i(c(a), i);
  }, __wbg_uniform1i_acd89bea81085be4: function(n, a, i) {
    c(n).uniform1i(c(a), i);
  }, __wbg_uniform1ui_9f8d9b877d6691d8: function(n, a, i) {
    c(n).uniform1ui(c(a), i >>> 0);
  }, __wbg_uniform2fv_28fbf8836f3045d0: function(n, a, i, _) {
    c(n).uniform2fv(c(a), je(i, _));
  }, __wbg_uniform2fv_f3c92aab21d0dec3: function(n, a, i, _) {
    c(n).uniform2fv(c(a), je(i, _));
  }, __wbg_uniform2iv_892b6d31137ad198: function(n, a, i, _) {
    c(n).uniform2iv(c(a), Gn(i, _));
  }, __wbg_uniform2iv_f40f632615c5685a: function(n, a, i, _) {
    c(n).uniform2iv(c(a), Gn(i, _));
  }, __wbg_uniform2uiv_6d170469a702f23e: function(n, a, i, _) {
    c(n).uniform2uiv(c(a), _a(i, _));
  }, __wbg_uniform3fv_85a9a17c9635941b: function(n, a, i, _) {
    c(n).uniform3fv(c(a), je(i, _));
  }, __wbg_uniform3fv_cdf7c84f9119f13b: function(n, a, i, _) {
    c(n).uniform3fv(c(a), je(i, _));
  }, __wbg_uniform3iv_38e74d2ae9dfbfb8: function(n, a, i, _) {
    c(n).uniform3iv(c(a), Gn(i, _));
  }, __wbg_uniform3iv_4c372010ac6def3f: function(n, a, i, _) {
    c(n).uniform3iv(c(a), Gn(i, _));
  }, __wbg_uniform3uiv_bb7266bb3a5aef96: function(n, a, i, _) {
    c(n).uniform3uiv(c(a), _a(i, _));
  }, __wbg_uniform4f_0b00a34f4789ad14: function(n, a, i, _, d, y) {
    c(n).uniform4f(c(a), i, _, d, y);
  }, __wbg_uniform4f_7275e0fb864b7513: function(n, a, i, _, d, y) {
    c(n).uniform4f(c(a), i, _, d, y);
  }, __wbg_uniform4fv_a4cdb4bd66867df5: function(n, a, i, _) {
    c(n).uniform4fv(c(a), je(i, _));
  }, __wbg_uniform4fv_c416900acf65eca9: function(n, a, i, _) {
    c(n).uniform4fv(c(a), je(i, _));
  }, __wbg_uniform4iv_b49cd4acf0aa3ebc: function(n, a, i, _) {
    c(n).uniform4iv(c(a), Gn(i, _));
  }, __wbg_uniform4iv_d654af0e6b7bdb1a: function(n, a, i, _) {
    c(n).uniform4iv(c(a), Gn(i, _));
  }, __wbg_uniform4uiv_e95d9a124fb8f91e: function(n, a, i, _) {
    c(n).uniform4uiv(c(a), _a(i, _));
  }, __wbg_uniformBlockBinding_a47fa267662afd7b: function(n, a, i, _) {
    c(n).uniformBlockBinding(c(a), i >>> 0, _ >>> 0);
  }, __wbg_uniformMatrix2fv_4229ae27417c649a: function(n, a, i, _, d) {
    c(n).uniformMatrix2fv(c(a), i !== 0, je(_, d));
  }, __wbg_uniformMatrix2fv_648417dd2040de5b: function(n, a, i, _, d) {
    c(n).uniformMatrix2fv(c(a), i !== 0, je(_, d));
  }, __wbg_uniformMatrix2x3fv_eb9a53c8c9aa724b: function(n, a, i, _, d) {
    c(n).uniformMatrix2x3fv(c(a), i !== 0, je(_, d));
  }, __wbg_uniformMatrix2x4fv_8849517a52f2e845: function(n, a, i, _, d) {
    c(n).uniformMatrix2x4fv(c(a), i !== 0, je(_, d));
  }, __wbg_uniformMatrix3fv_244fc4416319c169: function(n, a, i, _, d) {
    c(n).uniformMatrix3fv(c(a), i !== 0, je(_, d));
  }, __wbg_uniformMatrix3fv_bafc2707d0c48e27: function(n, a, i, _, d) {
    c(n).uniformMatrix3fv(c(a), i !== 0, je(_, d));
  }, __wbg_uniformMatrix3x2fv_f1729eb13fcd41a3: function(n, a, i, _, d) {
    c(n).uniformMatrix3x2fv(c(a), i !== 0, je(_, d));
  }, __wbg_uniformMatrix3x4fv_3c11181f5fa929de: function(n, a, i, _, d) {
    c(n).uniformMatrix3x4fv(c(a), i !== 0, je(_, d));
  }, __wbg_uniformMatrix4fv_4d322b295d122214: function(n, a, i, _, d) {
    c(n).uniformMatrix4fv(c(a), i !== 0, je(_, d));
  }, __wbg_uniformMatrix4fv_7c68dee5aee11694: function(n, a, i, _, d) {
    c(n).uniformMatrix4fv(c(a), i !== 0, je(_, d));
  }, __wbg_uniformMatrix4x2fv_5a8701b552d704af: function(n, a, i, _, d) {
    c(n).uniformMatrix4x2fv(c(a), i !== 0, je(_, d));
  }, __wbg_uniformMatrix4x3fv_741c3f4e0b2c7e04: function(n, a, i, _, d) {
    c(n).uniformMatrix4x3fv(c(a), i !== 0, je(_, d));
  }, __wbg_unique_3329c63c37e586a7: function(n) {
    return c(n).unique;
  }, __wbg_unmap_8f06698a75b8331a: function(n) {
    c(n).unmap();
  }, __wbg_unobserve_397ea595cb8bfdd0: function(n, a) {
    c(n).unobserve(c(a));
  }, __wbg_usage_ffc49211c0488f66: function(n) {
    return c(n).usage;
  }, __wbg_useProgram_49b77c7558a0646a: function(n, a) {
    c(n).useProgram(c(a));
  }, __wbg_useProgram_5405b431988b837b: function(n, a) {
    c(n).useProgram(c(a));
  }, __wbg_userAgentData_31b8f893e8977e94: function(n) {
    const a = c(n).userAgentData;
    return J(a) ? 0 : m(a);
  }, __wbg_userAgent_161a5f2d2a8dee61: function() {
    return O(function(n, a) {
      const i = c(a).userAgent, _ = _e(i, p.__wbindgen_export, p.__wbindgen_export2), d = ae;
      L().setInt32(n + 4, d, true), L().setInt32(n + 0, _, true);
    }, arguments);
  }, __wbg_valueOf_5c6da6c9a85f34dc: function(n) {
    const a = c(n).valueOf();
    return m(a);
  }, __wbg_value_21fc78aab0322612: function(n) {
    const a = c(n).value;
    return m(a);
  }, __wbg_value_23545848209ec70e: function(n) {
    const a = c(n).value;
    return J(a) ? 0 : m(a);
  }, __wbg_value_755737dfb43af927: function(n) {
    const a = c(n).value;
    return m(a);
  }, __wbg_value_a32389e33914d8b0: function(n) {
    const a = c(n).value;
    return m(a);
  }, __wbg_value_a529cd2f781749fd: function(n) {
    const a = c(n).value;
    return m(a);
  }, __wbg_value_f3d531408c0c70aa: function(n) {
    return c(n).value;
  }, __wbg_versions_276b2795b1c6a219: function(n) {
    const a = c(n).versions;
    return m(a);
  }, __wbg_vertexAttribDivisorANGLE_b357aa2bf70d3dcf: function(n, a, i) {
    c(n).vertexAttribDivisorANGLE(a >>> 0, i >>> 0);
  }, __wbg_vertexAttribDivisor_99b2fd5affca539d: function(n, a, i) {
    c(n).vertexAttribDivisor(a >>> 0, i >>> 0);
  }, __wbg_vertexAttribIPointer_ecd3baef73ba0965: function(n, a, i, _, d, y) {
    c(n).vertexAttribIPointer(a >>> 0, i, _ >>> 0, d, y);
  }, __wbg_vertexAttribPointer_ea73fc4cc5b7d647: function(n, a, i, _, d, y, S) {
    c(n).vertexAttribPointer(a >>> 0, i, _ >>> 0, d !== 0, y, S);
  }, __wbg_vertexAttribPointer_f63675d7fad431e6: function(n, a, i, _, d, y, S) {
    c(n).vertexAttribPointer(a >>> 0, i, _ >>> 0, d !== 0, y, S);
  }, __wbg_viewport_63ee76a0f029804d: function(n, a, i, _, d) {
    c(n).viewport(a, i, _, d);
  }, __wbg_viewport_b60aceadb9166023: function(n, a, i, _, d) {
    c(n).viewport(a, i, _, d);
  }, __wbg_visibilityState_8b47c97faee36457: function(n) {
    const a = c(n).visibilityState;
    return (F1.indexOf(a) + 1 || 3) - 1;
  }, __wbg_waitAsync_4f2b907b7c917932: function(n, a, i) {
    const _ = Atomics.waitAsync(c(n), a >>> 0, i);
    return m(_);
  }, __wbg_waitAsync_75e29f35b95a3bf0: function(n, a, i) {
    const _ = Atomics.waitAsync(c(n), a >>> 0, i);
    return m(_);
  }, __wbg_waitAsync_91ab9cf292b5ab15: function(n, a, i) {
    const _ = Atomics.waitAsync(c(n), a >>> 0, i);
    return m(_);
  }, __wbg_waitAsync_a4399d51368b6ce4: function() {
    const n = Atomics.waitAsync;
    return m(n);
  }, __wbg_wait_result_async_73157675ab05ec7d: function(n) {
    return Hm(c(n));
  }, __wbg_wait_result_value_a7b2b15227c920a3: function(n) {
    const a = Lm(c(n));
    return m(a);
  }, __wbg_warn_809cad1bfc2b3a42: function(n, a, i, _) {
    console.warn(c(n), c(a), c(i), c(_));
  }, __wbg_webkitExitFullscreen_f487871f11a8185e: function(n) {
    c(n).webkitExitFullscreen();
  }, __wbg_webkitFullscreenElement_4055d847f8ff064e: function(n) {
    const a = c(n).webkitFullscreenElement;
    return J(a) ? 0 : m(a);
  }, __wbg_webkitRequestFullscreen_c4ec4df7be373ffd: function(n) {
    c(n).webkitRequestFullscreen();
  }, __wbg_width_9824c1a2c17d3ebd: function(n) {
    return c(n).width;
  }, __wbg_writable_4aa9e3ac71d54eb9: function(n) {
    const a = c(n).writable;
    return m(a);
  }, __wbg_writeBuffer_b4bdd36178348ca5: function() {
    return O(function(n, a, i, _, d, y, S) {
      c(n).writeBuffer(c(a), i, oa(_, d), y, S);
    }, arguments);
  }, __wbg_writeText_9a7de75ffb2482e6: function(n, a, i) {
    const _ = c(n).writeText(q(a, i));
    return m(_);
  }, __wbg_writeTexture_b45b69132e46a227: function() {
    return O(function(n, a, i, _, d, y) {
      c(n).writeTexture(c(a), oa(i, _), c(d), c(y));
    }, arguments);
  }, __wbg_write_6c1ce79b0d7a43ff: function(n, a) {
    const i = c(n).write(c(a));
    return m(i);
  }, __wbg_x_663bdb24f78fdb4f: function(n) {
    return c(n).x;
  }, __wbg_y_30a7c06266f44f65: function(n) {
    return c(n).y;
  }, __wbindgen_cast_0000000000000001: function(n, a) {
    const i = Oe(n, a, p.__wasm_bindgen_func_elem_13375, c1);
    return m(i);
  }, __wbindgen_cast_0000000000000002: function(n, a) {
    const i = Oe(n, a, p.__wasm_bindgen_func_elem_130113, n1);
    return m(i);
  }, __wbindgen_cast_0000000000000003: function(n, a) {
    const i = Oe(n, a, p.__wasm_bindgen_func_elem_14262, i1);
    return m(i);
  }, __wbindgen_cast_0000000000000004: function(n, a) {
    const i = Oe(n, a, p.__wasm_bindgen_func_elem_14262, r1);
    return m(i);
  }, __wbindgen_cast_0000000000000005: function(n, a) {
    const i = Oe(n, a, p.__wasm_bindgen_func_elem_15239, A1);
    return m(i);
  }, __wbindgen_cast_0000000000000006: function(n, a) {
    const i = Oe(n, a, p.__wasm_bindgen_func_elem_15524, a1);
    return m(i);
  }, __wbindgen_cast_0000000000000007: function(n, a) {
    const i = Oe(n, a, p.__wasm_bindgen_func_elem_149025, f1);
    return m(i);
  }, __wbindgen_cast_0000000000000008: function(n, a) {
    const i = Oe(n, a, p.__wasm_bindgen_func_elem_149025, _1);
    return m(i);
  }, __wbindgen_cast_0000000000000009: function(n, a) {
    const i = Oe(n, a, p.__wasm_bindgen_func_elem_206687, u1);
    return m(i);
  }, __wbindgen_cast_000000000000000a: function(n, a) {
    const i = Oe(n, a, p.__wasm_bindgen_func_elem_209543, o1);
    return m(i);
  }, __wbindgen_cast_000000000000000b: function(n, a) {
    const i = Oe(n, a, p.__wasm_bindgen_func_elem_218215, E1);
    return m(i);
  }, __wbindgen_cast_000000000000000c: function(n, a) {
    const i = Oe(n, a, p.__wasm_bindgen_func_elem_218215, s1);
    return m(i);
  }, __wbindgen_cast_000000000000000d: function(n, a) {
    const i = Oe(n, a, p.__wasm_bindgen_func_elem_67805, b1);
    return m(i);
  }, __wbindgen_cast_000000000000000e: function(n, a) {
    const i = Oe(n, a, p.__wasm_bindgen_func_elem_67805, T1);
    return m(i);
  }, __wbindgen_cast_000000000000000f: function(n, a) {
    const i = Oe(n, a, p.__wasm_bindgen_func_elem_67805, d1);
    return m(i);
  }, __wbindgen_cast_0000000000000010: function(n, a) {
    const i = Oe(n, a, p.__wasm_bindgen_func_elem_67805, g1);
    return m(i);
  }, __wbindgen_cast_0000000000000011: function(n, a) {
    const i = Oe(n, a, p.__wasm_bindgen_func_elem_67805, m1);
    return m(i);
  }, __wbindgen_cast_0000000000000012: function(n, a) {
    const i = Oe(n, a, p.__wasm_bindgen_func_elem_67805, w1);
    return m(i);
  }, __wbindgen_cast_0000000000000013: function(n, a) {
    const i = Oe(n, a, p.__wasm_bindgen_func_elem_67805, y1);
    return m(i);
  }, __wbindgen_cast_0000000000000014: function(n, a) {
    const i = Oe(n, a, p.__wasm_bindgen_func_elem_67805, h1);
    return m(i);
  }, __wbindgen_cast_0000000000000015: function(n, a) {
    const i = Oe(n, a, p.__wasm_bindgen_func_elem_67805, p1);
    return m(i);
  }, __wbindgen_cast_0000000000000016: function(n, a) {
    const i = Oe(n, a, p.__wasm_bindgen_func_elem_67805, v1);
    return m(i);
  }, __wbindgen_cast_0000000000000017: function(n, a) {
    const i = Oe(n, a, p.__wasm_bindgen_func_elem_67805, l1);
    return m(i);
  }, __wbindgen_cast_0000000000000018: function(n, a) {
    const i = Oe(n, a, p.__wasm_bindgen_func_elem_9852, S1);
    return m(i);
  }, __wbindgen_cast_0000000000000019: function(n, a) {
    const i = Oe(n, a, p.__wasm_bindgen_func_elem_9906, x1);
    return m(i);
  }, __wbindgen_cast_000000000000001a: function(n) {
    return m(n);
  }, __wbindgen_cast_000000000000001b: function(n) {
    return m(n);
  }, __wbindgen_cast_000000000000001c: function(n, a) {
    const i = je(n, a);
    return m(i);
  }, __wbindgen_cast_000000000000001d: function(n, a) {
    const i = t2(n, a);
    return m(i);
  }, __wbindgen_cast_000000000000001e: function(n, a) {
    const i = Gn(n, a);
    return m(i);
  }, __wbindgen_cast_000000000000001f: function(n, a) {
    const i = n2(n, a);
    return m(i);
  }, __wbindgen_cast_0000000000000020: function(n, a) {
    const i = u2(n, a);
    return m(i);
  }, __wbindgen_cast_0000000000000021: function(n, a) {
    const i = _a(n, a);
    return m(i);
  }, __wbindgen_cast_0000000000000022: function(n, a) {
    const i = oa(n, a);
    return m(i);
  }, __wbindgen_cast_0000000000000023: function(n, a) {
    const i = q(n, a);
    return m(i);
  }, __wbindgen_cast_0000000000000024: function(n) {
    const a = BigInt.asUintN(64, n);
    return m(a);
  }, __wbindgen_link_fcd7cf2a23e346d3: function(n) {
    const a = `onmessage = function (ev) {
                let [ia, index, value] = ev.data;
                ia = new Int32Array(ia.buffer);
                let result = Atomics.wait(ia, index, value);
                postMessage(result);
            };
            `, i = typeof URL.createObjectURL > "u" ? "data:application/javascript," + encodeURIComponent(a) : URL.createObjectURL(new Blob([a], { type: "text/javascript" })), _ = _e(i, p.__wbindgen_export, p.__wbindgen_export2), d = ae;
    L().setInt32(n + 4, d, true), L().setInt32(n + 0, _, true);
  }, __wbindgen_object_clone_ref: function(n) {
    const a = c(n);
    return m(a);
  }, __wbindgen_object_drop_ref: function(n) {
    Gt(n);
  }, memory: o || new WebAssembly.Memory({ initial: 131, maximum: 65536, shared: true }) } };
}
const t1 = typeof AudioContext < "u" ? AudioContext : typeof webkitAudioContext < "u" ? webkitAudioContext : void 0;
function n1(o, s) {
  p.__wasm_bindgen_func_elem_130121(o, s);
}
function a1(o, s) {
  p.__wasm_bindgen_func_elem_15526(o, s);
}
function u1(o, s) {
  p.__wasm_bindgen_func_elem_206690(o, s);
}
function l1(o, s) {
  p.__wasm_bindgen_func_elem_67822(o, s);
}
function c1(o, s, n) {
  p.__wasm_bindgen_func_elem_13377(o, s, m(n));
}
function i1(o, s, n) {
  p.__wasm_bindgen_func_elem_14269(o, s, m(n));
}
function r1(o, s, n) {
  p.__wasm_bindgen_func_elem_14269_3(o, s, m(n));
}
function f1(o, s, n) {
  p.__wasm_bindgen_func_elem_149029(o, s, m(n));
}
function _1(o, s, n) {
  p.__wasm_bindgen_func_elem_149029_7(o, s, m(n));
}
function o1(o, s, n) {
  p.__wasm_bindgen_func_elem_209544(o, s, m(n));
}
function s1(o, s, n) {
  p.__wasm_bindgen_func_elem_218219(o, s, m(n));
}
function b1(o, s, n) {
  p.__wasm_bindgen_func_elem_67810(o, s, m(n));
}
function d1(o, s, n) {
  p.__wasm_bindgen_func_elem_67810_14(o, s, m(n));
}
function g1(o, s, n) {
  p.__wasm_bindgen_func_elem_67810_15(o, s, m(n));
}
function m1(o, s, n) {
  p.__wasm_bindgen_func_elem_67810_16(o, s, m(n));
}
function w1(o, s, n) {
  p.__wasm_bindgen_func_elem_67810_17(o, s, m(n));
}
function y1(o, s, n) {
  p.__wasm_bindgen_func_elem_67810_18(o, s, m(n));
}
function h1(o, s, n) {
  p.__wasm_bindgen_func_elem_67810_19(o, s, m(n));
}
function p1(o, s, n) {
  p.__wasm_bindgen_func_elem_67810_20(o, s, m(n));
}
function v1(o, s, n) {
  p.__wasm_bindgen_func_elem_67809(o, s, J(n) ? 0 : m(n));
}
function S1(o, s, n) {
  p.__wasm_bindgen_func_elem_9856(o, s, m(n));
}
function x1(o, s, n) {
  p.__wasm_bindgen_func_elem_9909(o, s, m(n));
}
function A1(o, s, n) {
  try {
    const _ = p.__wbindgen_add_to_stack_pointer(-16);
    p.__wasm_bindgen_func_elem_15246(_, o, s, m(n));
    var a = L().getInt32(_ + 0, true), i = L().getInt32(_ + 4, true);
    if (i) throw Gt(a);
  } finally {
    p.__wbindgen_add_to_stack_pointer(16);
  }
}
function E1(o, s, n) {
  try {
    const _ = p.__wbindgen_add_to_stack_pointer(-16);
    p.__wasm_bindgen_func_elem_218217(_, o, s, m(n));
    var a = L().getInt32(_ + 0, true), i = L().getInt32(_ + 4, true);
    if (i) throw Gt(a);
  } finally {
    p.__wbindgen_add_to_stack_pointer(16);
  }
}
function T1(o, s, n, a) {
  p.__wasm_bindgen_func_elem_67814(o, s, m(n), m(a));
}
function z1(o, s, n, a) {
  p.__wasm_bindgen_func_elem_221798(o, s, m(n), m(a));
}
const O1 = ["blob", "arraybuffer"], D1 = ["", "standard"], lf = ["clamp-to-edge", "repeat", "mirror-repeat"], kb = ["zero", "one", "src", "one-minus-src", "src-alpha", "one-minus-src-alpha", "dst", "one-minus-dst", "dst-alpha", "one-minus-dst-alpha", "src-alpha-saturated", "constant", "one-minus-constant", "src1", "one-minus-src1", "src1-alpha", "one-minus-src1-alpha"], M1 = ["add", "subtract", "reverse-subtract", "min", "max"], C1 = ["uniform", "storage", "read-only-storage"], R1 = ["opaque", "premultiplied"], cf = ["never", "less", "equal", "less-equal", "greater", "not-equal", "greater-equal", "always"], U1 = ["none", "front", "back"], B1 = ["unknown", "destroyed"], N1 = ["validation", "out-of-memory", "internal"], Wb = ["nearest", "linear"], j1 = ["ccw", "cw"], rf = ["uint16", "uint32"], ff = ["load", "clear"], q1 = ["nearest", "linear"], H1 = ["low-power", "high-performance"], L1 = ["point-list", "line-list", "line-strip", "triangle-list", "triangle-strip"], G1 = ["filtering", "non-filtering", "comparison"], _f = ["keep", "zero", "replace", "invert", "increment-clamp", "decrement-clamp", "increment-wrap", "decrement-wrap"], Y1 = ["write-only", "read-only", "read-write"], of = ["store", "discard"], Ib = ["all", "stencil-only", "depth-only"], V1 = ["1d", "2d", "3d"], fa = ["r8unorm", "r8snorm", "r8uint", "r8sint", "r16uint", "r16sint", "r16float", "rg8unorm", "rg8snorm", "rg8uint", "rg8sint", "r32uint", "r32sint", "r32float", "rg16uint", "rg16sint", "rg16float", "rgba8unorm", "rgba8unorm-srgb", "rgba8snorm", "rgba8uint", "rgba8sint", "bgra8unorm", "bgra8unorm-srgb", "rgb9e5ufloat", "rgb10a2uint", "rgb10a2unorm", "rg11b10ufloat", "rg32uint", "rg32sint", "rg32float", "rgba16uint", "rgba16sint", "rgba16float", "rgba32uint", "rgba32sint", "rgba32float", "stencil8", "depth16unorm", "depth24plus", "depth24plus-stencil8", "depth32float", "depth32float-stencil8", "bc1-rgba-unorm", "bc1-rgba-unorm-srgb", "bc2-rgba-unorm", "bc2-rgba-unorm-srgb", "bc3-rgba-unorm", "bc3-rgba-unorm-srgb", "bc4-r-unorm", "bc4-r-snorm", "bc5-rg-unorm", "bc5-rg-snorm", "bc6h-rgb-ufloat", "bc6h-rgb-float", "bc7-rgba-unorm", "bc7-rgba-unorm-srgb", "etc2-rgb8unorm", "etc2-rgb8unorm-srgb", "etc2-rgb8a1unorm", "etc2-rgb8a1unorm-srgb", "etc2-rgba8unorm", "etc2-rgba8unorm-srgb", "eac-r11unorm", "eac-r11snorm", "eac-rg11unorm", "eac-rg11snorm", "astc-4x4-unorm", "astc-4x4-unorm-srgb", "astc-5x4-unorm", "astc-5x4-unorm-srgb", "astc-5x5-unorm", "astc-5x5-unorm-srgb", "astc-6x5-unorm", "astc-6x5-unorm-srgb", "astc-6x6-unorm", "astc-6x6-unorm-srgb", "astc-8x5-unorm", "astc-8x5-unorm-srgb", "astc-8x6-unorm", "astc-8x6-unorm-srgb", "astc-8x8-unorm", "astc-8x8-unorm-srgb", "astc-10x5-unorm", "astc-10x5-unorm-srgb", "astc-10x6-unorm", "astc-10x6-unorm-srgb", "astc-10x8-unorm", "astc-10x8-unorm-srgb", "astc-10x10-unorm", "astc-10x10-unorm-srgb", "astc-12x10-unorm", "astc-12x10-unorm-srgb", "astc-12x12-unorm", "astc-12x12-unorm-srgb"], X1 = ["float", "unfilterable-float", "depth", "sint", "uint"], sf = ["1d", "2d", "2d-array", "cube", "cube-array", "3d"], Q1 = ["uint8", "uint8x2", "uint8x4", "sint8", "sint8x2", "sint8x4", "unorm8", "unorm8x2", "unorm8x4", "snorm8", "snorm8x2", "snorm8x4", "uint16", "uint16x2", "uint16x4", "sint16", "sint16x2", "sint16x4", "unorm16", "unorm16x2", "unorm16x4", "snorm16", "snorm16x2", "snorm16x4", "float16", "float16x2", "float16x4", "float32", "float32x2", "float32x3", "float32x4", "uint32", "uint32x2", "uint32x3", "uint32x4", "sint32", "sint32x2", "sint32x3", "sint32x4", "unorm10-10-10-2", "unorm8x4-bgra"], Z1 = ["vertex", "instance"], K1 = ["readonly", "readwrite", "versionchange", "readwriteflush", "cleanup"], J1 = ["none", "premultiply", "default"], k1 = ["byob"], W1 = ["same-origin", "no-cors", "cors", "navigate"], I1 = ["border-box", "content-box", "device-pixel-content-box"], F1 = ["hidden", "visible"], $1 = ["default", "throughput", "low-latency"], P1 = typeof FinalizationRegistry > "u" ? { register: () => {
}, unregister: () => {
} } : new FinalizationRegistry((o) => p.__wbg_streamconfig_free(o >>> 0, 1));
function m(o) {
  al === dn.length && dn.push(dn.length + 1);
  const s = al;
  return al = dn[s], dn[s] = o, s;
}
const Fb = typeof FinalizationRegistry > "u" ? { register: () => {
}, unregister: () => {
} } : new FinalizationRegistry((o) => o.dtor(o.a, o.b));
function hf(o) {
  const s = typeof o;
  if (s == "number" || s == "boolean" || o == null) return `${o}`;
  if (s == "string") return `"${o}"`;
  if (s == "symbol") {
    const i = o.description;
    return i == null ? "Symbol" : `Symbol(${i})`;
  }
  if (s == "function") {
    const i = o.name;
    return typeof i == "string" && i.length > 0 ? `Function(${i})` : "Function";
  }
  if (Array.isArray(o)) {
    const i = o.length;
    let _ = "[";
    i > 0 && (_ += hf(o[0]));
    for (let d = 1; d < i; d++) _ += ", " + hf(o[d]);
    return _ += "]", _;
  }
  const n = /\[object ([^\]]+)\]/.exec(toString.call(o));
  let a;
  if (n && n.length > 1) a = n[1];
  else return toString.call(o);
  if (a == "Object") try {
    return "Object(" + JSON.stringify(o) + ")";
  } catch {
    return "Object";
  }
  return o instanceof Error ? `${o.name}: ${o.message}
${o.stack}` : a;
}
function e2(o) {
  o < 1028 || (dn[o] = al, al = o);
}
function je(o, s) {
  return o = o >>> 0, l2().subarray(o / 4, o / 4 + s);
}
function t2(o, s) {
  return o = o >>> 0, c2().subarray(o / 2, o / 2 + s);
}
function Gn(o, s) {
  return o = o >>> 0, i2().subarray(o / 4, o / 4 + s);
}
function n2(o, s) {
  return o = o >>> 0, r2().subarray(o / 1, o / 1 + s);
}
function a2(o, s) {
  o = o >>> 0;
  const n = L(), a = [];
  for (let i = o; i < o + 4 * s; i += 4) a.push(Gt(n.getUint32(i, true)));
  return a;
}
function u2(o, s) {
  return o = o >>> 0, f2().subarray(o / 2, o / 2 + s);
}
function _a(o, s) {
  return o = o >>> 0, _2().subarray(o / 4, o / 4 + s);
}
function oa(o, s) {
  return o = o >>> 0, nl().subarray(o / 1, o / 1 + s);
}
let ku = null;
function L() {
  return (ku === null || ku.buffer !== p.memory.buffer) && (ku = new DataView(p.memory.buffer)), ku;
}
let Wu = null;
function l2() {
  return (Wu === null || Wu.buffer !== p.memory.buffer) && (Wu = new Float32Array(p.memory.buffer)), Wu;
}
let Iu = null;
function c2() {
  return (Iu === null || Iu.buffer !== p.memory.buffer) && (Iu = new Int16Array(p.memory.buffer)), Iu;
}
let Fu = null;
function i2() {
  return (Fu === null || Fu.buffer !== p.memory.buffer) && (Fu = new Int32Array(p.memory.buffer)), Fu;
}
let $u = null;
function r2() {
  return ($u === null || $u.buffer !== p.memory.buffer) && ($u = new Int8Array(p.memory.buffer)), $u;
}
function q(o, s) {
  return o = o >>> 0, s2(o, s);
}
let Pu = null;
function f2() {
  return (Pu === null || Pu.buffer !== p.memory.buffer) && (Pu = new Uint16Array(p.memory.buffer)), Pu;
}
let el = null;
function _2() {
  return (el === null || el.buffer !== p.memory.buffer) && (el = new Uint32Array(p.memory.buffer)), el;
}
let tl = null;
function nl() {
  return (tl === null || tl.buffer !== p.memory.buffer) && (tl = new Uint8Array(p.memory.buffer)), tl;
}
function c(o) {
  return dn[o];
}
function O(o, s) {
  try {
    return o.apply(this, s);
  } catch (n) {
    p.__wbindgen_export3(m(n));
  }
}
let dn = new Array(1024).fill(void 0);
dn.push(void 0, null, true, false);
let al = dn.length;
function J(o) {
  return o == null;
}
function Oe(o, s, n, a) {
  const i = { a: o, b: s, cnt: 1, dtor: n }, _ = (...d) => {
    i.cnt++;
    const y = i.a;
    i.a = 0;
    try {
      return a(y, i.b, ...d);
    } finally {
      i.a = y, _._wbg_cb_unref();
    }
  };
  return _._wbg_cb_unref = () => {
    --i.cnt === 0 && (i.dtor(i.a, i.b), i.a = 0, Fb.unregister(i));
  }, Fb.register(_, i, i), _;
}
function _e(o, s, n) {
  if (n === void 0) {
    const y = ll.encode(o), S = s(y.length, 1) >>> 0;
    return nl().subarray(S, S + y.length).set(y), ae = y.length, S;
  }
  let a = o.length, i = s(a, 1) >>> 0;
  const _ = nl();
  let d = 0;
  for (; d < a; d++) {
    const y = o.charCodeAt(d);
    if (y > 127) break;
    _[i + d] = y;
  }
  if (d !== a) {
    d !== 0 && (o = o.slice(d)), i = n(i, a, a = d + o.length * 3, 1) >>> 0;
    const y = nl().subarray(i + d, i + a), S = ll.encodeInto(o, y);
    d += S.written, i = n(i, a, d, 1) >>> 0;
  }
  return ae = d, i;
}
function Gt(o) {
  const s = c(o);
  return e2(o), s;
}
let ul = typeof TextDecoder < "u" ? new TextDecoder("utf-8", { ignoreBOM: true, fatal: true }) : void 0;
ul && ul.decode();
const o2 = 2146435072;
let bf = 0;
function s2(o, s) {
  return bf += s, bf >= o2 && (ul = new TextDecoder("utf-8", { ignoreBOM: true, fatal: true }), ul.decode(), bf = s), ul.decode(nl().slice(o, o + s));
}
const ll = typeof TextEncoder < "u" ? new TextEncoder() : void 0;
ll && (ll.encodeInto = function(o, s) {
  const n = ll.encode(o);
  return s.set(n), { read: o.length, written: n.length };
});
let ae = 0, p;
function md(o, s, n) {
  if (p = o.exports, ku = null, Wu = null, Iu = null, Fu = null, $u = null, Pu = null, el = null, tl = null, typeof n < "u" && (typeof n != "number" || n === 0 || n % 65536 !== 0)) throw new Error("invalid stack size");
  return p.__wbindgen_start(n), p;
}
async function b2(o, s) {
  if (typeof Response == "function" && o instanceof Response) {
    if (typeof WebAssembly.instantiateStreaming == "function") try {
      return await WebAssembly.instantiateStreaming(o, s);
    } catch (i) {
      if (o.ok && n(o.type) && o.headers.get("Content-Type") !== "application/wasm") console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", i);
      else throw i;
    }
    const a = await o.arrayBuffer();
    return await WebAssembly.instantiate(a, s);
  } else {
    const a = await WebAssembly.instantiate(o, s);
    return a instanceof WebAssembly.Instance ? { instance: a, module: o } : a;
  }
  function n(a) {
    switch (a) {
      case "basic":
      case "cors":
      case "default":
        return true;
    }
    return false;
  }
}
function d2(o, s) {
  if (p !== void 0) return p;
  let n;
  o !== void 0 && (Object.getPrototypeOf(o) === Object.prototype ? { module: o, memory: s, thread_stack_size: n } = o : console.warn("using deprecated parameters for `initSync()`; pass a single object instead"));
  const a = gd(s);
  o instanceof WebAssembly.Module || (o = new WebAssembly.Module(o));
  const i = new WebAssembly.Instance(o, a);
  return md(i, o, n);
}
async function g2(o, s) {
  if (p !== void 0) return p;
  let n;
  o !== void 0 && (Object.getPrototypeOf(o) === Object.prototype ? { module_or_path: o, memory: s, thread_stack_size: n } = o : console.warn("using deprecated parameters for the initialization function; pass a single object instead")), o === void 0 && (o = new URL("/isometric/assets/isometric_game_bg.wasm", import.meta.url));
  const a = gd(s);
  (typeof o == "string" || typeof Request == "function" && o instanceof Request || typeof URL == "function" && o instanceof URL) && (o = fetch(o));
  const { instance: i, module: _ } = await b2(await o, a);
  return md(i, _, n);
}
const cl = Object.freeze(Object.defineProperty({ __proto__: null, SampleFormat: Gm, StreamConfig: yf, default: g2, dispatch_action: sd, get_chat_log_json: Ym, get_fps: Vm, get_hovered_object_json: bd, get_object_registry_json: Xm, get_online_status: Qm, get_player_state_json: Uc, get_selected_object_json: dd, get_signin_state_json: Zm, get_ui_chrome_json: Km, go_online: Jm, greet: km, initSync: d2, send_chat: Wm, set_signed_in: Im, set_username: Fm, wasm_main: $m, worker_count: Pm, worker_entry_point: e1 }, Symbol.toStringTag, { value: "Module" }));
function wd({ children: o, className: s = "" }) {
  return V.jsx("div", { className: `bg-glass backdrop-blur-[4px] rounded-glass border border-glass-border shadow-glass pointer-events-auto ${s}`, children: o });
}
function m2() {
  const [o, s] = F.useState(null);
  return F.useEffect(() => {
    const n = setInterval(() => {
      try {
        const a = Uc();
        a && s(JSON.parse(a));
      } catch {
      }
    }, 250);
    return () => clearInterval(n);
  }, []), o ? V.jsx(wd, { className: "absolute top-12 right-4 md:top-14 md:right-6 px-3 py-1.5 md:px-4 md:py-2 pointer-events-none", children: V.jsxs("div", { className: "text-[7px] md:text-[9px] text-text-muted", children: ["Pos: ", o.position.map((n) => n.toFixed(1)).join(", ")] }) }) : null;
}
const df = [15, 20, 15], w2 = 20;
function y2() {
  const o = [-15, -20, -15], s = Math.sqrt(o[0] ** 2 + o[1] ** 2 + o[2] ** 2);
  o[0] /= s, o[1] /= s, o[2] /= s;
  const n = [0, 1, 0], a = [o[1] * n[2] - o[2] * n[1], o[2] * n[0] - o[0] * n[2], o[0] * n[1] - o[1] * n[0]], i = Math.sqrt(a[0] ** 2 + a[1] ** 2 + a[2] ** 2);
  a[0] /= i, a[1] /= i, a[2] /= i;
  const _ = [a[1] * o[2] - a[2] * o[1], a[2] * o[0] - a[0] * o[2], a[0] * o[1] - a[1] * o[0]];
  return { right: a, up: _, forward: o };
}
const $b = y2();
function Pb(o, s) {
  return o[0] * s[0] + o[1] * s[1] + o[2] * s[2];
}
function h2(o, s, n, a) {
  const i = [o[0] - s[0], o[1] - s[1], o[2] - s[2]], _ = w2 / 2, d = n / a, y = _ * d, S = Pb(i, $b.right) / y, h = Pb(i, $b.up) / _;
  return Math.abs(S) > 1.2 || Math.abs(h) > 1.2 ? null : { x: (S + 1) / 2 * n, y: (1 - h) / 2 * a };
}
const p2 = { tree: "Tree", crate: "Wooden Crate", crystal: "Crystal", pillar: "Stone Pillar", sphere: "Metallic Sphere", flower: "Flower", rock: "Rock", mushroom: "Mushroom" }, v2 = { tulip: "Tulip", daisy: "Daisy", lavender: "Lavender", bell: "Bellflower", wildflower: "Wildflower", sunflower: "Sunflower", rose: "Rose", cornflower: "Cornflower", allium: "Allium", blue_orchid: "Blue Orchid" }, S2 = { boulder: "Boulder", mossy_rock: "Mossy Rock", ore_copper: "Copper Ore", ore_iron: "Iron Ore", ore_crystal: "Crystal Ore" }, x2 = { porcini: "Porcini", chanterelle: "Chanterelle", fly_agaric: "Fly Agaric" };
function A2() {
  const [o, s] = F.useState(null);
  return F.useEffect(() => {
    const n = setInterval(() => {
      try {
        const a = bd();
        if (!a) {
          s(null);
          return;
        }
        const i = JSON.parse(a), _ = Uc();
        if (!_) {
          s(null);
          return;
        }
        const d = JSON.parse(_), y = [d.position[0] + df[0], d.position[1] + df[1], d.position[2] + df[2]], S = [i.position[0], i.position[1] + 1.5, i.position[2]], h = h2(S, y, window.innerWidth, window.innerHeight);
        if (!h) {
          s(null);
          return;
        }
        let B = p2[i.kind] ?? i.kind;
        i.kind === "flower" && i.sub_kind && (B = v2[i.sub_kind] ?? B), i.kind === "rock" && i.sub_kind && (B = S2[i.sub_kind] ?? B), i.kind === "mushroom" && i.sub_kind && (B = x2[i.sub_kind] ?? B), s({ name: B, screenX: h.x, screenY: h.y });
      } catch {
        s(null);
      }
    }, 50);
    return () => clearInterval(n);
  }, []), o ? V.jsx("div", { className: "absolute pointer-events-none", style: { left: o.screenX, top: o.screenY, transform: "translate(-50%, -100%)" }, children: V.jsx("div", { className: `px-2 py-1 md:px-3 md:py-1.5 bg-[#1e1408]/90 border border-panel-border
					text-[7px] md:text-[10px] text-[#c8a832] whitespace-nowrap`, children: o.name }) }) : null;
}
const E2 = /^[a-zA-Z0-9_]{3,20}$/;
function yd() {
  return !!(window.__TAURI_INTERNALS__ || window.__TAURI__);
}
async function T2() {
  if (yd()) try {
    return await H("get_signin_state");
  } catch {
    return null;
  }
  try {
    const s = (await $a(() => Promise.resolve().then(() => cl), void 0)).get_signin_state_json;
    if (typeof s != "function") return null;
    const n = s();
    return n ? JSON.parse(n) : null;
  } catch {
    return null;
  }
}
async function z2(o) {
  if (yd()) {
    await H("set_username", { username: o });
    return;
  }
  const n = (await $a(() => Promise.resolve().then(() => cl), void 0)).set_username;
  typeof n == "function" && n(o);
}
function O2() {
  const [o, s] = F.useState(null), [n, a] = F.useState(""), [i, _] = F.useState(null), [d, y] = F.useState(false);
  F.useEffect(() => {
    let h = false;
    const B = async () => {
      const X = await T2();
      h || s(X);
    };
    B();
    const R = setInterval(B, 1500);
    return () => {
      h = true, clearInterval(R);
    };
  }, []);
  const S = F.useCallback(async (h) => {
    h.preventDefault();
    const B = n.trim();
    if (!E2.test(B)) {
      _("3\u201320 chars, letters / numbers / underscore only.");
      return;
    }
    y(true), _(null);
    try {
      await z2(B);
    } catch (R) {
      _(String((R == null ? void 0 : R.message) ?? R));
    } finally {
      y(false);
    }
  }, [n]);
  return !o || !o.jwt_valid || o.username ? null : V.jsx("div", { className: "fixed inset-0 z-[200] flex items-center justify-center bg-black/70 pointer-events-auto", children: V.jsxs(wd, { className: "px-6 py-5 max-w-sm w-[92%] flex flex-col gap-3", children: [V.jsx("h2", { className: "text-base font-semibold", children: "Choose your KBVE username" }), V.jsx("p", { className: "text-xs text-text-muted", children: "This is the name other players will see in chat and on the leaderboards. 3\u201320 characters, letters / numbers / underscore." }), V.jsxs("form", { onSubmit: S, className: "flex flex-col gap-2", children: [V.jsx("input", { type: "text", autoFocus: true, maxLength: 20, value: n, onChange: (h) => a(h.target.value), placeholder: "e.g. h0lybyte", className: "bg-black/40 border border-glass-border rounded-glass px-3 py-2 text-sm outline-none focus:border-accent", disabled: d }), i && V.jsx("div", { className: "text-xs text-red-400", children: i }), V.jsx("button", { type: "submit", disabled: d || !n.trim(), className: "bg-accent/80 hover:bg-accent disabled:opacity-50 text-white text-sm font-medium rounded-glass px-4 py-2 transition", children: d ? "Submitting\u2026" : "Set username" })] })] }) });
}
const D2 = 6, M2 = 3;
function hd(o, s) {
  const n = o[0] - s[0], a = o[2] - s[2];
  return Math.sqrt(n * n + a * a);
}
function pd() {
  try {
    const o = Uc();
    return o ? JSON.parse(o).position : null;
  } catch {
    return null;
  }
}
const C2 = { tree: { title: "Tree", description: "A sturdy tree with rough bark.", action: "Chop Tree" }, crate: { title: "Wooden Crate", description: "A wooden crate. Might contain something.", action: "Open Crate" }, crystal: { title: "Crystal", description: "A glowing crystal pulsing with energy.", action: "Mine Crystal" }, pillar: { title: "Stone Pillar", description: "An ancient stone pillar.", action: "Examine" }, sphere: { title: "Metallic Sphere", description: "A mysterious metallic sphere.", action: "Examine" }, flower: { title: "Flower", description: "A beautiful flower.", action: "Collect Flower" }, rock: { title: "Rock", description: "A weathered stone formation.", action: "Mine Rock" }, mushroom: { title: "Mushroom", description: "A wild mushroom growing in the shade.", action: "Collect Mushroom" } }, R2 = { tulip: { title: "Tulip", description: "A vibrant tulip with soft petals." }, daisy: { title: "Daisy", description: "A cheerful white daisy swaying gently." }, lavender: { title: "Lavender", description: "A fragrant lavender sprig." }, bell: { title: "Bellflower", description: "A delicate bellflower with drooping petals." }, wildflower: { title: "Wildflower", description: "A bright wildflower growing freely." }, sunflower: { title: "Sunflower", description: "A tall sunflower turning toward the light." }, rose: { title: "Rose", description: "A thorny rose with velvety red petals." }, cornflower: { title: "Cornflower", description: "A bright blue cornflower swaying in the breeze." }, allium: { title: "Allium", description: "A round purple allium bloom on a slender stem." }, blue_orchid: { title: "Blue Orchid", description: "A rare blue orchid with delicate petals." } }, U2 = { boulder: { title: "Boulder", description: "A large, weathered boulder covered in lichen.", action: "Examine" }, mossy_rock: { title: "Mossy Rock", description: "A moss-covered stone, cool and damp to the touch.", action: "Examine" }, ore_copper: { title: "Copper Ore", description: "Greenish-brown veins of copper glint in the stone.", action: "Mine Ore" }, ore_iron: { title: "Iron Ore", description: "Dark reddish streaks of iron run through the rock.", action: "Mine Ore" }, ore_crystal: { title: "Crystal Ore", description: "Shimmering purple crystals jut from the stone.", action: "Mine Ore" } }, B2 = { porcini: { title: "Porcini", description: "A plump porcini mushroom with a rich earthy aroma." }, chanterelle: { title: "Chanterelle", description: "A golden chanterelle with a delicate funnel shape." }, fly_agaric: { title: "Fly Agaric", description: "A red-capped toadstool with white spots. Handle with care." } }, N2 = { "Chop Tree": "chop_tree", "Mine Rock": "mine_rock", "Mine Ore": "mine_rock", "Collect Flower": "collect_flower", "Collect Mushroom": "collect_mushroom" };
function j2({ info: o, objectPos: s, entityId: n }) {
  return V.jsxs("div", { className: "space-y-2 md:space-y-3", children: [V.jsx("div", { className: "px-2 py-1.5 md:px-3 md:py-2 bg-[#1e1408] border border-[#5a4a2a]", children: V.jsx("p", { className: "text-[8px] md:text-xs text-text leading-relaxed", children: o.description }) }), V.jsx("div", { className: "flex justify-center pt-1", children: V.jsx("button", { className: `px-4 py-1.5 md:px-6 md:py-2 text-[8px] md:text-xs text-text
						bg-btn border-2 border-btn-border
						shadow-[inset_0_1px_0_rgba(255,255,255,0.15),0_2px_0_#1a3a10]
						hover:bg-btn-hover active:bg-btn-active active:shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]
						transition-colors cursor-pointer`, onClick: () => {
    const a = pd();
    if (a && hd(a, s) > M2) {
      Bt.emit("toast:show", { message: "You are too far away.", severity: "warning" }), Bt.emit("modal:close");
      return;
    }
    const i = N2[o.action];
    if (i) {
      sd(n, i);
      const _ = i === "chop_tree" ? "Chopping" : i === "mine_rock" ? "Mining" : "Collecting";
      Bt.emit("toast:show", { message: `${_} ${o.title}...`, severity: "info" });
    } else Bt.emit("toast:show", { message: `${o.action}: ${o.title}`, severity: "info" });
    Bt.emit("modal:close");
  }, children: o.action }) })] });
}
function q2() {
  const o = F.useRef(false), s = F.useRef(null);
  F.useEffect(() => {
    if (!!(window.__TAURI_INTERNALS__ || window.__TAURI__)) return;
    const a = setInterval(() => {
      if (!o.current) try {
        const _ = dd();
        if (!_) return;
        const d = JSON.parse(_);
        let y = C2[d.kind];
        if (!y) return;
        if (d.kind === "flower" && d.sub_kind) {
          const S = R2[d.sub_kind];
          S && (y = { ...y, title: S.title, description: S.description });
        }
        if (d.kind === "rock" && d.sub_kind) {
          const S = U2[d.sub_kind];
          S && (y = { title: S.title, description: S.description, action: S.action });
        }
        if (d.kind === "mushroom" && d.sub_kind) {
          const S = B2[d.sub_kind];
          S && (y = { ...y, title: S.title, description: S.description });
        }
        o.current = true, s.current = d.position, Bt.emit("modal:open", { title: y.title, size: "sm", content: V.jsx(j2, { info: y, objectPos: d.position, entityId: d.entity_id }), onClose: () => {
          o.current = false, s.current = null;
        } });
      } catch {
      }
    }, 100), i = setInterval(() => {
      if (!o.current || !s.current) return;
      const _ = pd();
      _ && hd(_, s.current) > D2 && Bt.emit("modal:close");
    }, 250);
    return () => {
      clearInterval(a), clearInterval(i);
    };
  }, []);
}
function ed() {
  return q2(), V.jsxs("div", { className: "fixed inset-0 font-game text-text rpg-text-shadow", style: { pointerEvents: "none" }, children: [V.jsx(jm, {}), V.jsx(m2, {}), V.jsx(A2, {}), V.jsx(O2, {}), V.jsx(Am, {})] });
}
function Yn(o, s) {
  const n = document.getElementById("loading-status"), a = document.getElementById("loading-bar");
  n && (n.textContent = o), a && (a.style.width = s + "%");
}
function H2() {
  const o = () => {
    document.documentElement.getBoundingClientRect(), window.dispatchEvent(new Event("resize"));
  };
  let s = 0;
  const n = () => {
    o(), ++s < 36 && requestAnimationFrame(n);
  };
  requestAnimationFrame(n), setInterval(o, 500), (async () => {
    try {
      const a = await $a(() => Promise.resolve().then(() => Bm), void 0), i = a.getCurrentWindow(), _ = await i.innerSize(), d = a.PhysicalSize;
      await i.setSize(new d(_.width + 20, _.height + 20)), await new Promise((y) => setTimeout(y, 250)), await i.setSize(new d(_.width, _.height)), await new Promise((y) => setTimeout(y, 100)), await i.setSize(new d(_.width + 1, _.height)), await new Promise((y) => setTimeout(y, 100)), await i.setSize(new d(_.width, _.height));
    } catch (a) {
      console.warn("[paint] window-nudge failed", a);
    }
  })();
}
function td() {
  const o = document.getElementById("game-loading");
  o && (o.style.opacity = "0", o.style.transition = "opacity 0.4s ease", setTimeout(() => o.remove(), 400));
}
function L2() {
  const o = window.location.hostname, s = window.location.protocol, n = s === "https:", a = o === "localhost" || o === "127.0.0.1", i = n ? "wss" : "ws";
  if (a) {
    const _ = window.location.port || (n ? "443" : "80");
    return { api_base: `${s}//${o}:${_}`, ws_url: `${i}://${o}:5000`, wt_url: `https://${o}:5001` };
  }
  return { api_base: `https://${o}`, ws_url: `wss://${o}/ws`, wt_url: `https://wt.${o}:5001` };
}
function G2() {
  const o = globalThis, s = L2(), n = { secure_context: window.location.protocol === "https:" || window.location.hostname === "localhost", has_webgpu: !!navigator.gpu, has_webtransport: typeof o.WebTransport == "function", has_shared_array_buffer: typeof o.SharedArrayBuffer < "u", has_offscreen_canvas: typeof o.OffscreenCanvas == "function", hardware_concurrency: navigator.hardwareConcurrency || 1, ...s, timestamp: Date.now() };
  try {
    localStorage.setItem("kbve_client_profile", JSON.stringify(n));
  } catch {
    console.warn("[profile] localStorage unavailable, WASM will use defaults");
  }
  return n;
}
async function Y2() {
  const o = G2();
  if (!!(window.__TAURI_INTERNALS__ || window.__TAURI__)) {
    Yn("Native build \u2014 mounting UI", 80);
    const y = document.getElementById("root");
    y && (Xb.createRoot(y).render(V.jsx(jb.StrictMode, { children: V.jsx(Zb, { children: V.jsx(ed, {}) }) })), H2()), Yn("Ready", 100), td();
    return;
  }
  if (!o.has_webgpu) {
    const y = document.getElementById("root");
    y && (y.innerHTML = '<div style="color:#fff;padding:2rem;text-align:center"><h2>WebGPU Not Available</h2><p>This browser does not support WebGPU (Chrome 113+, Edge 113+, Safari 18+).</p></div>', y.style.pointerEvents = "auto");
    return;
  }
  Yn("Loading game module...", 20);
  const n = await $a(() => Promise.resolve().then(() => cl), void 0), { default: a } = n;
  Yn("Initializing WebGPU...", 60);
  const i = await a(), _ = window.__KBVE_SESSION_PROBE__, d = _ ? await _ : null;
  if (d && typeof n.set_signed_in == "function") try {
    n.set_signed_in(d);
  } catch (y) {
    console.warn("[auth] set_signed_in threw", y);
  }
  if (typeof SharedArrayBuffer < "u" && "worker_entry_point" in i) {
    const y = Math.max(1, (navigator.hardwareConcurrency || 4) - 1);
    Yn(`Spawning ${y} workers...`, 75);
    const S = new URL("/isometric/assets/isometric_game_bg.wasm", import.meta.url), h = i.memory, B = new URL("/isometric/assets/isometric_game.js", import.meta.url).href;
    try {
      const R = await WebAssembly.compileStreaming(fetch(S)), X = "/isometric/";
      for (let ie = 0; ie < y; ie++) new Worker(`${X}wasm-worker.js`, { type: "module" }).postMessage({ module: R, memory: h, bindgenUrl: B });
    } catch (R) {
      console.warn("[pthreads] worker setup failed", R);
    }
  }
  Yn("Starting...", 90), Xb.createRoot(document.getElementById("root")).render(V.jsx(jb.StrictMode, { children: V.jsx(Zb, { children: V.jsx(ed, {}) }) })), Yn("Ready", 100), td();
}
Y2().catch((o) => {
  Yn("Failed to load game", 0), console.error(o);
});
