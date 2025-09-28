import { e as oi } from "../comlink-CC72iIUO.js";
import { j as ai } from "../reference-Dk_1njEH.js";
var ui = typeof globalThis < "u" ? globalThis : typeof window < "u" ? window : typeof global < "u" ? global : typeof self < "u" ? self : {};
function si(T) {
  return T && T.__esModule && Object.prototype.hasOwnProperty.call(T, "default") ? T.default : T;
}
var Lt = { exports: {} }, ci = Lt.exports, br;
function li() {
  return br || (br = 1, function(T, Y) {
    (function($, A) {
      T.exports = A();
    })(ci, function() {
      var $ = function(e, t) {
        return ($ = Object.setPrototypeOf || { __proto__: [] } instanceof Array && function(n, r) {
          n.__proto__ = r;
        } || function(n, r) {
          for (var i in r) Object.prototype.hasOwnProperty.call(r, i) && (n[i] = r[i]);
        })(e, t);
      }, A = function() {
        return (A = Object.assign || function(e) {
          for (var t, n = 1, r = arguments.length; n < r; n++) for (var i in t = arguments[n]) Object.prototype.hasOwnProperty.call(t, i) && (e[i] = t[i]);
          return e;
        }).apply(this, arguments);
      };
      function ke(e, t, n) {
        for (var r, i = 0, o = t.length; i < o; i++) !r && i in t || ((r = r || Array.prototype.slice.call(t, 0, i))[i] = t[i]);
        return e.concat(r || Array.prototype.slice.call(t));
      }
      var X = typeof globalThis < "u" ? globalThis : typeof self < "u" ? self : typeof window < "u" ? window : ui, H = Object.keys, V = Array.isArray;
      function re(e, t) {
        return typeof t != "object" || H(t).forEach(function(n) {
          e[n] = t[n];
        }), e;
      }
      typeof Promise > "u" || X.Promise || (X.Promise = Promise);
      var Re = Object.getPrototypeOf, _r = {}.hasOwnProperty;
      function ne(e, t) {
        return _r.call(e, t);
      }
      function Fe(e, t) {
        typeof t == "function" && (t = t(Re(e))), (typeof Reflect > "u" ? H : Reflect.ownKeys)(t).forEach(function(n) {
          ye(e, n, t[n]);
        });
      }
      var Tn = Object.defineProperty;
      function ye(e, t, n, r) {
        Tn(e, t, re(n && ne(n, "get") && typeof n.get == "function" ? { get: n.get, set: n.set, configurable: !0 } : { value: n, configurable: !0, writable: !0 }, r));
      }
      function Me(e) {
        return { from: function(t) {
          return e.prototype = Object.create(t.prototype), ye(e.prototype, "constructor", e), { extend: Fe.bind(null, e.prototype) };
        } };
      }
      var xr = Object.getOwnPropertyDescriptor, kr = [].slice;
      function ht(e, t, n) {
        return kr.call(e, t, n);
      }
      function Dn(e, t) {
        return t(e);
      }
      function Qe(e) {
        if (!e) throw new Error("Assertion Failed");
      }
      function In(e) {
        X.setImmediate ? setImmediate(e) : setTimeout(e, 0);
      }
      function fe(e, t) {
        if (typeof t == "string" && ne(e, t)) return e[t];
        if (!t) return e;
        if (typeof t != "string") {
          for (var n = [], r = 0, i = t.length; r < i; ++r) {
            var o = fe(e, t[r]);
            n.push(o);
          }
          return n;
        }
        var a = t.indexOf(".");
        if (a !== -1) {
          var u = e[t.substr(0, a)];
          return u == null ? void 0 : fe(u, t.substr(a + 1));
        }
      }
      function ie(e, t, n) {
        if (e && t !== void 0 && !("isFrozen" in Object && Object.isFrozen(e))) if (typeof t != "string" && "length" in t) {
          Qe(typeof n != "string" && "length" in n);
          for (var r = 0, i = t.length; r < i; ++r) ie(e, t[r], n[r]);
        } else {
          var o, a, u = t.indexOf(".");
          u !== -1 ? (o = t.substr(0, u), (a = t.substr(u + 1)) === "" ? n === void 0 ? V(e) && !isNaN(parseInt(o)) ? e.splice(o, 1) : delete e[o] : e[o] = n : ie(u = !(u = e[o]) || !ne(e, o) ? e[o] = {} : u, a, n)) : n === void 0 ? V(e) && !isNaN(parseInt(t)) ? e.splice(t, 1) : delete e[t] : e[t] = n;
        }
      }
      function qn(e) {
        var t, n = {};
        for (t in e) ne(e, t) && (n[t] = e[t]);
        return n;
      }
      var Or = [].concat;
      function Bn(e) {
        return Or.apply([], e);
      }
      var Se = "BigUint64Array,BigInt64Array,Array,Boolean,String,Date,RegExp,Blob,File,FileList,FileSystemFileHandle,FileSystemDirectoryHandle,ArrayBuffer,DataView,Uint8ClampedArray,ImageBitmap,ImageData,Map,Set,CryptoKey".split(",").concat(Bn([8, 16, 32, 64].map(function(e) {
        return ["Int", "Uint", "Float"].map(function(t) {
          return t + e + "Array";
        });
      }))).filter(function(e) {
        return X[e];
      }), Rn = new Set(Se.map(function(e) {
        return X[e];
      })), Xe = null;
      function Oe(e) {
        return Xe = /* @__PURE__ */ new WeakMap(), e = function t(n) {
          if (!n || typeof n != "object") return n;
          var r = Xe.get(n);
          if (r) return r;
          if (V(n)) {
            r = [], Xe.set(n, r);
            for (var i = 0, o = n.length; i < o; ++i) r.push(t(n[i]));
          } else if (Rn.has(n.constructor)) r = n;
          else {
            var a, u = Re(n);
            for (a in r = u === Object.prototype ? {} : Object.create(u), Xe.set(n, r), n) ne(n, a) && (r[a] = t(n[a]));
          }
          return r;
        }(e), Xe = null, e;
      }
      var Pr = {}.toString;
      function $t(e) {
        return Pr.call(e).slice(8, -1);
      }
      var zt = typeof Symbol < "u" ? Symbol.iterator : "@@iterator", Kr = typeof zt == "symbol" ? function(e) {
        var t;
        return e != null && (t = e[zt]) && t.apply(e);
      } : function() {
        return null;
      };
      function Pe(e, t) {
        return t = e.indexOf(t), 0 <= t && e.splice(t, 1), 0 <= t;
      }
      var Ne = {};
      function he(e) {
        var t, n, r, i;
        if (arguments.length === 1) {
          if (V(e)) return e.slice();
          if (this === Ne && typeof e == "string") return [e];
          if (i = Kr(e)) {
            for (n = []; !(r = i.next()).done; ) n.push(r.value);
            return n;
          }
          if (e == null) return [e];
          if (typeof (t = e.length) != "number") return [e];
          for (n = new Array(t); t--; ) n[t] = e[t];
          return n;
        }
        for (t = arguments.length, n = new Array(t); t--; ) n[t] = arguments[t];
        return n;
      }
      var Wt = typeof Symbol < "u" ? function(e) {
        return e[Symbol.toStringTag] === "AsyncFunction";
      } : function() {
        return !1;
      }, et = ["Unknown", "Constraint", "Data", "TransactionInactive", "ReadOnly", "Version", "NotFound", "InvalidState", "InvalidAccess", "Abort", "Timeout", "QuotaExceeded", "Syntax", "DataClone"], ue = ["Modify", "Bulk", "OpenFailed", "VersionChange", "Schema", "Upgrade", "InvalidTable", "MissingAPI", "NoSuchDatabase", "InvalidArgument", "SubTransaction", "Unsupported", "Internal", "DatabaseClosed", "PrematureCommit", "ForeignAwait"].concat(et), Sr = { VersionChanged: "Database version changed by other database connection", DatabaseClosed: "Database has been closed", Abort: "Transaction aborted", TransactionInactive: "Transaction has already completed or failed", MissingAPI: "IndexedDB API missing. Please visit https://tinyurl.com/y2uuvskb" };
      function Le(e, t) {
        this.name = e, this.message = t;
      }
      function Fn(e, t) {
        return e + ". Errors: " + Object.keys(t).map(function(n) {
          return t[n].toString();
        }).filter(function(n, r, i) {
          return i.indexOf(n) === r;
        }).join(`
`);
      }
      function dt(e, t, n, r) {
        this.failures = t, this.failedKeys = r, this.successCount = n, this.message = Fn(e, t);
      }
      function Ue(e, t) {
        this.name = "BulkError", this.failures = Object.keys(t).map(function(n) {
          return t[n];
        }), this.failuresByPos = t, this.message = Fn(e, this.failures);
      }
      Me(Le).from(Error).extend({ toString: function() {
        return this.name + ": " + this.message;
      } }), Me(dt).from(Le), Me(Ue).from(Le);
      var Yt = ue.reduce(function(e, t) {
        return e[t] = t + "Error", e;
      }, {}), Er = Le, C = ue.reduce(function(e, t) {
        var n = t + "Error";
        function r(i, o) {
          this.name = n, i ? typeof i == "string" ? (this.message = "".concat(i).concat(o ? `
 ` + o : ""), this.inner = o || null) : typeof i == "object" && (this.message = "".concat(i.name, " ").concat(i.message), this.inner = i) : (this.message = Sr[t] || n, this.inner = null);
        }
        return Me(r).from(Er), e[t] = r, e;
      }, {});
      C.Syntax = SyntaxError, C.Type = TypeError, C.Range = RangeError;
      var Mn = et.reduce(function(e, t) {
        return e[t + "Error"] = C[t], e;
      }, {}), pt = ue.reduce(function(e, t) {
        return ["Syntax", "Type", "Range"].indexOf(t) === -1 && (e[t + "Error"] = C[t]), e;
      }, {});
      function M() {
      }
      function Je(e) {
        return e;
      }
      function Ar(e, t) {
        return e == null || e === Je ? t : function(n) {
          return t(e(n));
        };
      }
      function Ke(e, t) {
        return function() {
          e.apply(this, arguments), t.apply(this, arguments);
        };
      }
      function jr(e, t) {
        return e === M ? t : function() {
          var n = e.apply(this, arguments);
          n !== void 0 && (arguments[0] = n);
          var r = this.onsuccess, i = this.onerror;
          this.onsuccess = null, this.onerror = null;
          var o = t.apply(this, arguments);
          return r && (this.onsuccess = this.onsuccess ? Ke(r, this.onsuccess) : r), i && (this.onerror = this.onerror ? Ke(i, this.onerror) : i), o !== void 0 ? o : n;
        };
      }
      function Cr(e, t) {
        return e === M ? t : function() {
          e.apply(this, arguments);
          var n = this.onsuccess, r = this.onerror;
          this.onsuccess = this.onerror = null, t.apply(this, arguments), n && (this.onsuccess = this.onsuccess ? Ke(n, this.onsuccess) : n), r && (this.onerror = this.onerror ? Ke(r, this.onerror) : r);
        };
      }
      function Tr(e, t) {
        return e === M ? t : function(n) {
          var r = e.apply(this, arguments);
          re(n, r);
          var i = this.onsuccess, o = this.onerror;
          return this.onsuccess = null, this.onerror = null, n = t.apply(this, arguments), i && (this.onsuccess = this.onsuccess ? Ke(i, this.onsuccess) : i), o && (this.onerror = this.onerror ? Ke(o, this.onerror) : o), r === void 0 ? n === void 0 ? void 0 : n : re(r, n);
        };
      }
      function Dr(e, t) {
        return e === M ? t : function() {
          return t.apply(this, arguments) !== !1 && e.apply(this, arguments);
        };
      }
      function Ht(e, t) {
        return e === M ? t : function() {
          var n = e.apply(this, arguments);
          if (n && typeof n.then == "function") {
            for (var r = this, i = arguments.length, o = new Array(i); i--; ) o[i] = arguments[i];
            return n.then(function() {
              return t.apply(r, o);
            });
          }
          return t.apply(this, arguments);
        };
      }
      pt.ModifyError = dt, pt.DexieError = Le, pt.BulkError = Ue;
      var se = typeof location < "u" && /^(http|https):\/\/(localhost|127\.0\.0\.1)/.test(location.href);
      function Nn(e) {
        se = e;
      }
      var Ze = {}, Ln = 100, Se = typeof Promise > "u" ? [] : function() {
        var e = Promise.resolve();
        if (typeof crypto > "u" || !crypto.subtle) return [e, Re(e), e];
        var t = crypto.subtle.digest("SHA-512", new Uint8Array([0]));
        return [t, Re(t), e];
      }(), et = Se[0], ue = Se[1], Se = Se[2], ue = ue && ue.then, Ee = et && et.constructor, Gt = !!Se, tt = function(e, t) {
        nt.push([e, t]), yt && (queueMicrotask(qr), yt = !1);
      }, Qt = !0, yt = !0, Ae = [], vt = [], Xt = Je, ve = { id: "global", global: !0, ref: 0, unhandleds: [], onunhandled: M, pgp: !1, env: {}, finalize: M }, j = ve, nt = [], je = 0, mt = [];
      function S(e) {
        if (typeof this != "object") throw new TypeError("Promises must be constructed via new");
        this._listeners = [], this._lib = !1;
        var t = this._PSD = j;
        if (typeof e != "function") {
          if (e !== Ze) throw new TypeError("Not a function");
          return this._state = arguments[1], this._value = arguments[2], void (this._state === !1 && Zt(this, this._value));
        }
        this._state = null, this._value = null, ++t.ref, function n(r, i) {
          try {
            i(function(o) {
              if (r._state === null) {
                if (o === r) throw new TypeError("A promise cannot be resolved with itself.");
                var a = r._lib && Ve();
                o && typeof o.then == "function" ? n(r, function(u, c) {
                  o instanceof S ? o._then(u, c) : o.then(u, c);
                }) : (r._state = !0, r._value = o, Vn(r)), a && $e();
              }
            }, Zt.bind(null, r));
          } catch (o) {
            Zt(r, o);
          }
        }(this, e);
      }
      var Jt = { get: function() {
        var e = j, t = _t;
        function n(r, i) {
          var o = this, a = !e.global && (e !== j || t !== _t), u = a && !ge(), c = new S(function(f, p) {
            en(o, new Un(zn(r, e, a, u), zn(i, e, a, u), f, p, e));
          });
          return this._consoleTask && (c._consoleTask = this._consoleTask), c;
        }
        return n.prototype = Ze, n;
      }, set: function(e) {
        ye(this, "then", e && e.prototype === Ze ? Jt : { get: function() {
          return e;
        }, set: Jt.set });
      } };
      function Un(e, t, n, r, i) {
        this.onFulfilled = typeof e == "function" ? e : null, this.onRejected = typeof t == "function" ? t : null, this.resolve = n, this.reject = r, this.psd = i;
      }
      function Zt(e, t) {
        var n, r;
        vt.push(t), e._state === null && (n = e._lib && Ve(), t = Xt(t), e._state = !1, e._value = t, r = e, Ae.some(function(i) {
          return i._value === r._value;
        }) || Ae.push(r), Vn(e), n && $e());
      }
      function Vn(e) {
        var t = e._listeners;
        e._listeners = [];
        for (var n = 0, r = t.length; n < r; ++n) en(e, t[n]);
        var i = e._PSD;
        --i.ref || i.finalize(), je === 0 && (++je, tt(function() {
          --je == 0 && tn();
        }, []));
      }
      function en(e, t) {
        if (e._state !== null) {
          var n = e._state ? t.onFulfilled : t.onRejected;
          if (n === null) return (e._state ? t.resolve : t.reject)(e._value);
          ++t.psd.ref, ++je, tt(Ir, [n, e, t]);
        } else e._listeners.push(t);
      }
      function Ir(e, t, n) {
        try {
          var r, i = t._value;
          !t._state && vt.length && (vt = []), r = se && t._consoleTask ? t._consoleTask.run(function() {
            return e(i);
          }) : e(i), t._state || vt.indexOf(i) !== -1 || function(o) {
            for (var a = Ae.length; a; ) if (Ae[--a]._value === o._value) return Ae.splice(a, 1);
          }(t), n.resolve(r);
        } catch (o) {
          n.reject(o);
        } finally {
          --je == 0 && tn(), --n.psd.ref || n.psd.finalize();
        }
      }
      function qr() {
        Ce(ve, function() {
          Ve() && $e();
        });
      }
      function Ve() {
        var e = Qt;
        return yt = Qt = !1, e;
      }
      function $e() {
        var e, t, n;
        do
          for (; 0 < nt.length; ) for (e = nt, nt = [], n = e.length, t = 0; t < n; ++t) {
            var r = e[t];
            r[0].apply(null, r[1]);
          }
        while (0 < nt.length);
        yt = Qt = !0;
      }
      function tn() {
        var e = Ae;
        Ae = [], e.forEach(function(r) {
          r._PSD.onunhandled.call(null, r._value, r);
        });
        for (var t = mt.slice(0), n = t.length; n; ) t[--n]();
      }
      function gt(e) {
        return new S(Ze, !1, e);
      }
      function U(e, t) {
        var n = j;
        return function() {
          var r = Ve(), i = j;
          try {
            return be(n, !0), e.apply(this, arguments);
          } catch (o) {
            t && t(o);
          } finally {
            be(i, !1), r && $e();
          }
        };
      }
      Fe(S.prototype, { then: Jt, _then: function(e, t) {
        en(this, new Un(null, null, e, t, j));
      }, catch: function(e) {
        if (arguments.length === 1) return this.then(null, e);
        var t = e, n = arguments[1];
        return typeof t == "function" ? this.then(null, function(r) {
          return (r instanceof t ? n : gt)(r);
        }) : this.then(null, function(r) {
          return (r && r.name === t ? n : gt)(r);
        });
      }, finally: function(e) {
        return this.then(function(t) {
          return S.resolve(e()).then(function() {
            return t;
          });
        }, function(t) {
          return S.resolve(e()).then(function() {
            return gt(t);
          });
        });
      }, timeout: function(e, t) {
        var n = this;
        return e < 1 / 0 ? new S(function(r, i) {
          var o = setTimeout(function() {
            return i(new C.Timeout(t));
          }, e);
          n.then(r, i).finally(clearTimeout.bind(null, o));
        }) : this;
      } }), typeof Symbol < "u" && Symbol.toStringTag && ye(S.prototype, Symbol.toStringTag, "Dexie.Promise"), ve.env = $n(), Fe(S, { all: function() {
        var e = he.apply(null, arguments).map(xt);
        return new S(function(t, n) {
          e.length === 0 && t([]);
          var r = e.length;
          e.forEach(function(i, o) {
            return S.resolve(i).then(function(a) {
              e[o] = a, --r || t(e);
            }, n);
          });
        });
      }, resolve: function(e) {
        return e instanceof S ? e : e && typeof e.then == "function" ? new S(function(t, n) {
          e.then(t, n);
        }) : new S(Ze, !0, e);
      }, reject: gt, race: function() {
        var e = he.apply(null, arguments).map(xt);
        return new S(function(t, n) {
          e.map(function(r) {
            return S.resolve(r).then(t, n);
          });
        });
      }, PSD: { get: function() {
        return j;
      }, set: function(e) {
        return j = e;
      } }, totalEchoes: { get: function() {
        return _t;
      } }, newPSD: me, usePSD: Ce, scheduler: { get: function() {
        return tt;
      }, set: function(e) {
        tt = e;
      } }, rejectionMapper: { get: function() {
        return Xt;
      }, set: function(e) {
        Xt = e;
      } }, follow: function(e, t) {
        return new S(function(n, r) {
          return me(function(i, o) {
            var a = j;
            a.unhandleds = [], a.onunhandled = o, a.finalize = Ke(function() {
              var u, c = this;
              u = function() {
                c.unhandleds.length === 0 ? i() : o(c.unhandleds[0]);
              }, mt.push(function f() {
                u(), mt.splice(mt.indexOf(f), 1);
              }), ++je, tt(function() {
                --je == 0 && tn();
              }, []);
            }, a.finalize), e();
          }, t, n, r);
        });
      } }), Ee && (Ee.allSettled && ye(S, "allSettled", function() {
        var e = he.apply(null, arguments).map(xt);
        return new S(function(t) {
          e.length === 0 && t([]);
          var n = e.length, r = new Array(n);
          e.forEach(function(i, o) {
            return S.resolve(i).then(function(a) {
              return r[o] = { status: "fulfilled", value: a };
            }, function(a) {
              return r[o] = { status: "rejected", reason: a };
            }).then(function() {
              return --n || t(r);
            });
          });
        });
      }), Ee.any && typeof AggregateError < "u" && ye(S, "any", function() {
        var e = he.apply(null, arguments).map(xt);
        return new S(function(t, n) {
          e.length === 0 && n(new AggregateError([]));
          var r = e.length, i = new Array(r);
          e.forEach(function(o, a) {
            return S.resolve(o).then(function(u) {
              return t(u);
            }, function(u) {
              i[a] = u, --r || n(new AggregateError(i));
            });
          });
        });
      }), Ee.withResolvers && (S.withResolvers = Ee.withResolvers));
      var G = { awaits: 0, echoes: 0, id: 0 }, Br = 0, bt = [], wt = 0, _t = 0, Rr = 0;
      function me(e, t, n, r) {
        var i = j, o = Object.create(i);
        return o.parent = i, o.ref = 0, o.global = !1, o.id = ++Rr, ve.env, o.env = Gt ? { Promise: S, PromiseProp: { value: S, configurable: !0, writable: !0 }, all: S.all, race: S.race, allSettled: S.allSettled, any: S.any, resolve: S.resolve, reject: S.reject } : {}, t && re(o, t), ++i.ref, o.finalize = function() {
          --this.parent.ref || this.parent.finalize();
        }, r = Ce(o, e, n, r), o.ref === 0 && o.finalize(), r;
      }
      function ze() {
        return G.id || (G.id = ++Br), ++G.awaits, G.echoes += Ln, G.id;
      }
      function ge() {
        return !!G.awaits && (--G.awaits == 0 && (G.id = 0), G.echoes = G.awaits * Ln, !0);
      }
      function xt(e) {
        return G.echoes && e && e.constructor === Ee ? (ze(), e.then(function(t) {
          return ge(), t;
        }, function(t) {
          return ge(), z(t);
        })) : e;
      }
      function Fr() {
        var e = bt[bt.length - 1];
        bt.pop(), be(e, !1);
      }
      function be(e, t) {
        var n, r = j;
        (t ? !G.echoes || wt++ && e === j : !wt || --wt && e === j) || queueMicrotask(t ? function(i) {
          ++_t, G.echoes && --G.echoes != 0 || (G.echoes = G.awaits = G.id = 0), bt.push(j), be(i, !0);
        }.bind(null, e) : Fr), e !== j && (j = e, r === ve && (ve.env = $n()), Gt && (n = ve.env.Promise, t = e.env, (r.global || e.global) && (Object.defineProperty(X, "Promise", t.PromiseProp), n.all = t.all, n.race = t.race, n.resolve = t.resolve, n.reject = t.reject, t.allSettled && (n.allSettled = t.allSettled), t.any && (n.any = t.any))));
      }
      function $n() {
        var e = X.Promise;
        return Gt ? { Promise: e, PromiseProp: Object.getOwnPropertyDescriptor(X, "Promise"), all: e.all, race: e.race, allSettled: e.allSettled, any: e.any, resolve: e.resolve, reject: e.reject } : {};
      }
      function Ce(e, t, n, r, i) {
        var o = j;
        try {
          return be(e, !0), t(n, r, i);
        } finally {
          be(o, !1);
        }
      }
      function zn(e, t, n, r) {
        return typeof e != "function" ? e : function() {
          var i = j;
          n && ze(), be(t, !0);
          try {
            return e.apply(this, arguments);
          } finally {
            be(i, !1), r && queueMicrotask(ge);
          }
        };
      }
      function nn(e) {
        Promise === Ee && G.echoes === 0 ? wt === 0 ? e() : enqueueNativeMicroTask(e) : setTimeout(e, 0);
      }
      ("" + ue).indexOf("[native code]") === -1 && (ze = ge = M);
      var z = S.reject, Te = "￿", de = "Invalid key provided. Keys must be of type string, number, Date or Array<string | number | Date>.", Wn = "String expected.", We = [], kt = "__dbnames", rn = "readonly", on = "readwrite";
      function De(e, t) {
        return e ? t ? function() {
          return e.apply(this, arguments) && t.apply(this, arguments);
        } : e : t;
      }
      var Yn = { type: 3, lower: -1 / 0, lowerOpen: !1, upper: [[]], upperOpen: !1 };
      function Ot(e) {
        return typeof e != "string" || /\./.test(e) ? function(t) {
          return t;
        } : function(t) {
          return t[e] === void 0 && e in t && delete (t = Oe(t))[e], t;
        };
      }
      function Hn() {
        throw C.Type();
      }
      function R(e, t) {
        try {
          var n = Gn(e), r = Gn(t);
          if (n !== r) return n === "Array" ? 1 : r === "Array" ? -1 : n === "binary" ? 1 : r === "binary" ? -1 : n === "string" ? 1 : r === "string" ? -1 : n === "Date" ? 1 : r !== "Date" ? NaN : -1;
          switch (n) {
            case "number":
            case "Date":
            case "string":
              return t < e ? 1 : e < t ? -1 : 0;
            case "binary":
              return function(i, o) {
                for (var a = i.length, u = o.length, c = a < u ? a : u, f = 0; f < c; ++f) if (i[f] !== o[f]) return i[f] < o[f] ? -1 : 1;
                return a === u ? 0 : a < u ? -1 : 1;
              }(Qn(e), Qn(t));
            case "Array":
              return function(i, o) {
                for (var a = i.length, u = o.length, c = a < u ? a : u, f = 0; f < c; ++f) {
                  var p = R(i[f], o[f]);
                  if (p !== 0) return p;
                }
                return a === u ? 0 : a < u ? -1 : 1;
              }(e, t);
          }
        } catch {
        }
        return NaN;
      }
      function Gn(e) {
        var t = typeof e;
        return t != "object" ? t : ArrayBuffer.isView(e) ? "binary" : (e = $t(e), e === "ArrayBuffer" ? "binary" : e);
      }
      function Qn(e) {
        return e instanceof Uint8Array ? e : ArrayBuffer.isView(e) ? new Uint8Array(e.buffer, e.byteOffset, e.byteLength) : new Uint8Array(e);
      }
      var Xn = (L.prototype._trans = function(e, t, n) {
        var r = this._tx || j.trans, i = this.name, o = se && typeof console < "u" && console.createTask && console.createTask("Dexie: ".concat(e === "readonly" ? "read" : "write", " ").concat(this.name));
        function a(f, p, s) {
          if (!s.schema[i]) throw new C.NotFound("Table " + i + " not part of transaction");
          return t(s.idbtrans, s);
        }
        var u = Ve();
        try {
          var c = r && r.db._novip === this.db._novip ? r === j.trans ? r._promise(e, a, n) : me(function() {
            return r._promise(e, a, n);
          }, { trans: r, transless: j.transless || j }) : function f(p, s, v, l) {
            if (p.idbdb && (p._state.openComplete || j.letThrough || p._vip)) {
              var d = p._createTransaction(s, v, p._dbSchema);
              try {
                d.create(), p._state.PR1398_maxLoop = 3;
              } catch (y) {
                return y.name === Yt.InvalidState && p.isOpen() && 0 < --p._state.PR1398_maxLoop ? (console.warn("Dexie: Need to reopen db"), p.close({ disableAutoOpen: !1 }), p.open().then(function() {
                  return f(p, s, v, l);
                })) : z(y);
              }
              return d._promise(s, function(y, h) {
                return me(function() {
                  return j.trans = d, l(y, h, d);
                });
              }).then(function(y) {
                if (s === "readwrite") try {
                  d.idbtrans.commit();
                } catch {
                }
                return s === "readonly" ? y : d._completion.then(function() {
                  return y;
                });
              });
            }
            if (p._state.openComplete) return z(new C.DatabaseClosed(p._state.dbOpenError));
            if (!p._state.isBeingOpened) {
              if (!p._state.autoOpen) return z(new C.DatabaseClosed());
              p.open().catch(M);
            }
            return p._state.dbReadyPromise.then(function() {
              return f(p, s, v, l);
            });
          }(this.db, e, [this.name], a);
          return o && (c._consoleTask = o, c = c.catch(function(f) {
            return console.trace(f), z(f);
          })), c;
        } finally {
          u && $e();
        }
      }, L.prototype.get = function(e, t) {
        var n = this;
        return e && e.constructor === Object ? this.where(e).first(t) : e == null ? z(new C.Type("Invalid argument to Table.get()")) : this._trans("readonly", function(r) {
          return n.core.get({ trans: r, key: e }).then(function(i) {
            return n.hook.reading.fire(i);
          });
        }).then(t);
      }, L.prototype.where = function(e) {
        if (typeof e == "string") return new this.db.WhereClause(this, e);
        if (V(e)) return new this.db.WhereClause(this, "[".concat(e.join("+"), "]"));
        var t = H(e);
        if (t.length === 1) return this.where(t[0]).equals(e[t[0]]);
        var n = this.schema.indexes.concat(this.schema.primKey).filter(function(u) {
          if (u.compound && t.every(function(f) {
            return 0 <= u.keyPath.indexOf(f);
          })) {
            for (var c = 0; c < t.length; ++c) if (t.indexOf(u.keyPath[c]) === -1) return !1;
            return !0;
          }
          return !1;
        }).sort(function(u, c) {
          return u.keyPath.length - c.keyPath.length;
        })[0];
        if (n && this.db._maxKey !== Te) {
          var o = n.keyPath.slice(0, t.length);
          return this.where(o).equals(o.map(function(c) {
            return e[c];
          }));
        }
        !n && se && console.warn("The query ".concat(JSON.stringify(e), " on ").concat(this.name, " would benefit from a ") + "compound index [".concat(t.join("+"), "]"));
        var r = this.schema.idxByName;
        function i(u, c) {
          return R(u, c) === 0;
        }
        var a = t.reduce(function(s, c) {
          var f = s[0], p = s[1], s = r[c], v = e[c];
          return [f || s, f || !s ? De(p, s && s.multi ? function(l) {
            return l = fe(l, c), V(l) && l.some(function(d) {
              return i(v, d);
            });
          } : function(l) {
            return i(v, fe(l, c));
          }) : p];
        }, [null, null]), o = a[0], a = a[1];
        return o ? this.where(o.name).equals(e[o.keyPath]).filter(a) : n ? this.filter(a) : this.where(t).equals("");
      }, L.prototype.filter = function(e) {
        return this.toCollection().and(e);
      }, L.prototype.count = function(e) {
        return this.toCollection().count(e);
      }, L.prototype.offset = function(e) {
        return this.toCollection().offset(e);
      }, L.prototype.limit = function(e) {
        return this.toCollection().limit(e);
      }, L.prototype.each = function(e) {
        return this.toCollection().each(e);
      }, L.prototype.toArray = function(e) {
        return this.toCollection().toArray(e);
      }, L.prototype.toCollection = function() {
        return new this.db.Collection(new this.db.WhereClause(this));
      }, L.prototype.orderBy = function(e) {
        return new this.db.Collection(new this.db.WhereClause(this, V(e) ? "[".concat(e.join("+"), "]") : e));
      }, L.prototype.reverse = function() {
        return this.toCollection().reverse();
      }, L.prototype.mapToClass = function(e) {
        var t, n = this.db, r = this.name;
        function i() {
          return t !== null && t.apply(this, arguments) || this;
        }
        (this.schema.mappedClass = e).prototype instanceof Hn && (function(c, f) {
          if (typeof f != "function" && f !== null) throw new TypeError("Class extends value " + String(f) + " is not a constructor or null");
          function p() {
            this.constructor = c;
          }
          $(c, f), c.prototype = f === null ? Object.create(f) : (p.prototype = f.prototype, new p());
        }(i, t = e), Object.defineProperty(i.prototype, "db", { get: function() {
          return n;
        }, enumerable: !1, configurable: !0 }), i.prototype.table = function() {
          return r;
        }, e = i);
        for (var o = /* @__PURE__ */ new Set(), a = e.prototype; a; a = Re(a)) Object.getOwnPropertyNames(a).forEach(function(c) {
          return o.add(c);
        });
        function u(c) {
          if (!c) return c;
          var f, p = Object.create(e.prototype);
          for (f in c) if (!o.has(f)) try {
            p[f] = c[f];
          } catch {
          }
          return p;
        }
        return this.schema.readHook && this.hook.reading.unsubscribe(this.schema.readHook), this.schema.readHook = u, this.hook("reading", u), e;
      }, L.prototype.defineClass = function() {
        return this.mapToClass(function(e) {
          re(this, e);
        });
      }, L.prototype.add = function(e, t) {
        var n = this, r = this.schema.primKey, i = r.auto, o = r.keyPath, a = e;
        return o && i && (a = Ot(o)(e)), this._trans("readwrite", function(u) {
          return n.core.mutate({ trans: u, type: "add", keys: t != null ? [t] : null, values: [a] });
        }).then(function(u) {
          return u.numFailures ? S.reject(u.failures[0]) : u.lastResult;
        }).then(function(u) {
          if (o) try {
            ie(e, o, u);
          } catch {
          }
          return u;
        });
      }, L.prototype.update = function(e, t) {
        return typeof e != "object" || V(e) ? this.where(":id").equals(e).modify(t) : (e = fe(e, this.schema.primKey.keyPath), e === void 0 ? z(new C.InvalidArgument("Given object does not contain its primary key")) : this.where(":id").equals(e).modify(t));
      }, L.prototype.put = function(e, t) {
        var n = this, r = this.schema.primKey, i = r.auto, o = r.keyPath, a = e;
        return o && i && (a = Ot(o)(e)), this._trans("readwrite", function(u) {
          return n.core.mutate({ trans: u, type: "put", values: [a], keys: t != null ? [t] : null });
        }).then(function(u) {
          return u.numFailures ? S.reject(u.failures[0]) : u.lastResult;
        }).then(function(u) {
          if (o) try {
            ie(e, o, u);
          } catch {
          }
          return u;
        });
      }, L.prototype.delete = function(e) {
        var t = this;
        return this._trans("readwrite", function(n) {
          return t.core.mutate({ trans: n, type: "delete", keys: [e] });
        }).then(function(n) {
          return n.numFailures ? S.reject(n.failures[0]) : void 0;
        });
      }, L.prototype.clear = function() {
        var e = this;
        return this._trans("readwrite", function(t) {
          return e.core.mutate({ trans: t, type: "deleteRange", range: Yn });
        }).then(function(t) {
          return t.numFailures ? S.reject(t.failures[0]) : void 0;
        });
      }, L.prototype.bulkGet = function(e) {
        var t = this;
        return this._trans("readonly", function(n) {
          return t.core.getMany({ keys: e, trans: n }).then(function(r) {
            return r.map(function(i) {
              return t.hook.reading.fire(i);
            });
          });
        });
      }, L.prototype.bulkAdd = function(e, t, n) {
        var r = this, i = Array.isArray(t) ? t : void 0, o = (n = n || (i ? void 0 : t)) ? n.allKeys : void 0;
        return this._trans("readwrite", function(a) {
          var f = r.schema.primKey, u = f.auto, f = f.keyPath;
          if (f && i) throw new C.InvalidArgument("bulkAdd(): keys argument invalid on tables with inbound keys");
          if (i && i.length !== e.length) throw new C.InvalidArgument("Arguments objects and keys must have the same length");
          var c = e.length, f = f && u ? e.map(Ot(f)) : e;
          return r.core.mutate({ trans: a, type: "add", keys: i, values: f, wantResults: o }).then(function(d) {
            var s = d.numFailures, v = d.results, l = d.lastResult, d = d.failures;
            if (s === 0) return o ? v : l;
            throw new Ue("".concat(r.name, ".bulkAdd(): ").concat(s, " of ").concat(c, " operations failed"), d);
          });
        });
      }, L.prototype.bulkPut = function(e, t, n) {
        var r = this, i = Array.isArray(t) ? t : void 0, o = (n = n || (i ? void 0 : t)) ? n.allKeys : void 0;
        return this._trans("readwrite", function(a) {
          var f = r.schema.primKey, u = f.auto, f = f.keyPath;
          if (f && i) throw new C.InvalidArgument("bulkPut(): keys argument invalid on tables with inbound keys");
          if (i && i.length !== e.length) throw new C.InvalidArgument("Arguments objects and keys must have the same length");
          var c = e.length, f = f && u ? e.map(Ot(f)) : e;
          return r.core.mutate({ trans: a, type: "put", keys: i, values: f, wantResults: o }).then(function(d) {
            var s = d.numFailures, v = d.results, l = d.lastResult, d = d.failures;
            if (s === 0) return o ? v : l;
            throw new Ue("".concat(r.name, ".bulkPut(): ").concat(s, " of ").concat(c, " operations failed"), d);
          });
        });
      }, L.prototype.bulkUpdate = function(e) {
        var t = this, n = this.core, r = e.map(function(a) {
          return a.key;
        }), i = e.map(function(a) {
          return a.changes;
        }), o = [];
        return this._trans("readwrite", function(a) {
          return n.getMany({ trans: a, keys: r, cache: "clone" }).then(function(u) {
            var c = [], f = [];
            e.forEach(function(s, v) {
              var l = s.key, d = s.changes, y = u[v];
              if (y) {
                for (var h = 0, m = Object.keys(d); h < m.length; h++) {
                  var g = m[h], b = d[g];
                  if (g === t.schema.primKey.keyPath) {
                    if (R(b, l) !== 0) throw new C.Constraint("Cannot update primary key in bulkUpdate()");
                  } else ie(y, g, b);
                }
                o.push(v), c.push(l), f.push(y);
              }
            });
            var p = c.length;
            return n.mutate({ trans: a, type: "put", keys: c, values: f, updates: { keys: r, changeSpecs: i } }).then(function(s) {
              var v = s.numFailures, l = s.failures;
              if (v === 0) return p;
              for (var d = 0, y = Object.keys(l); d < y.length; d++) {
                var h, m = y[d], g = o[Number(m)];
                g != null && (h = l[m], delete l[m], l[g] = h);
              }
              throw new Ue("".concat(t.name, ".bulkUpdate(): ").concat(v, " of ").concat(p, " operations failed"), l);
            });
          });
        });
      }, L.prototype.bulkDelete = function(e) {
        var t = this, n = e.length;
        return this._trans("readwrite", function(r) {
          return t.core.mutate({ trans: r, type: "delete", keys: e });
        }).then(function(a) {
          var i = a.numFailures, o = a.lastResult, a = a.failures;
          if (i === 0) return o;
          throw new Ue("".concat(t.name, ".bulkDelete(): ").concat(i, " of ").concat(n, " operations failed"), a);
        });
      }, L);
      function L() {
      }
      function rt(e) {
        function t(a, u) {
          if (u) {
            for (var c = arguments.length, f = new Array(c - 1); --c; ) f[c - 1] = arguments[c];
            return n[a].subscribe.apply(null, f), e;
          }
          if (typeof a == "string") return n[a];
        }
        var n = {};
        t.addEventType = o;
        for (var r = 1, i = arguments.length; r < i; ++r) o(arguments[r]);
        return t;
        function o(a, u, c) {
          if (typeof a != "object") {
            var f;
            u = u || Dr;
            var p = { subscribers: [], fire: c = c || M, subscribe: function(s) {
              p.subscribers.indexOf(s) === -1 && (p.subscribers.push(s), p.fire = u(p.fire, s));
            }, unsubscribe: function(s) {
              p.subscribers = p.subscribers.filter(function(v) {
                return v !== s;
              }), p.fire = p.subscribers.reduce(u, c);
            } };
            return n[a] = t[a] = p;
          }
          H(f = a).forEach(function(s) {
            var v = f[s];
            if (V(v)) o(s, f[s][0], f[s][1]);
            else {
              if (v !== "asap") throw new C.InvalidArgument("Invalid event config");
              var l = o(s, Je, function() {
                for (var d = arguments.length, y = new Array(d); d--; ) y[d] = arguments[d];
                l.subscribers.forEach(function(h) {
                  In(function() {
                    h.apply(null, y);
                  });
                });
              });
            }
          });
        }
      }
      function it(e, t) {
        return Me(t).from({ prototype: e }), t;
      }
      function Ye(e, t) {
        return !(e.filter || e.algorithm || e.or) && (t ? e.justLimit : !e.replayFilter);
      }
      function an(e, t) {
        e.filter = De(e.filter, t);
      }
      function un(e, t, n) {
        var r = e.replayFilter;
        e.replayFilter = r ? function() {
          return De(r(), t());
        } : t, e.justLimit = n && !r;
      }
      function Pt(e, t) {
        if (e.isPrimKey) return t.primaryKey;
        var n = t.getIndexByKeyPath(e.index);
        if (!n) throw new C.Schema("KeyPath " + e.index + " on object store " + t.name + " is not indexed");
        return n;
      }
      function Jn(e, t, n) {
        var r = Pt(e, t.schema);
        return t.openCursor({ trans: n, values: !e.keysOnly, reverse: e.dir === "prev", unique: !!e.unique, query: { index: r, range: e.range } });
      }
      function Kt(e, t, n, r) {
        var i = e.replayFilter ? De(e.filter, e.replayFilter()) : e.filter;
        if (e.or) {
          var o = {}, a = function(u, c, f) {
            var p, s;
            i && !i(c, f, function(v) {
              return c.stop(v);
            }, function(v) {
              return c.fail(v);
            }) || ((s = "" + (p = c.primaryKey)) == "[object ArrayBuffer]" && (s = "" + new Uint8Array(p)), ne(o, s) || (o[s] = !0, t(u, c, f)));
          };
          return Promise.all([e.or._iterate(a, n), Zn(Jn(e, r, n), e.algorithm, a, !e.keysOnly && e.valueMapper)]);
        }
        return Zn(Jn(e, r, n), De(e.algorithm, i), t, !e.keysOnly && e.valueMapper);
      }
      function Zn(e, t, n, r) {
        var i = U(r ? function(o, a, u) {
          return n(r(o), a, u);
        } : n);
        return e.then(function(o) {
          if (o) return o.start(function() {
            var a = function() {
              return o.continue();
            };
            t && !t(o, function(u) {
              return a = u;
            }, function(u) {
              o.stop(u), a = M;
            }, function(u) {
              o.fail(u), a = M;
            }) || i(o.value, o, function(u) {
              return a = u;
            }), a();
          });
        });
      }
      var ot = (er.prototype.execute = function(e) {
        var t = this["@@propmod"];
        if (t.add !== void 0) {
          var n = t.add;
          if (V(n)) return ke(ke([], V(e) ? e : [], !0), n).sort();
          if (typeof n == "number") return (Number(e) || 0) + n;
          if (typeof n == "bigint") try {
            return BigInt(e) + n;
          } catch {
            return BigInt(0) + n;
          }
          throw new TypeError("Invalid term ".concat(n));
        }
        if (t.remove !== void 0) {
          var r = t.remove;
          if (V(r)) return V(e) ? e.filter(function(i) {
            return !r.includes(i);
          }).sort() : [];
          if (typeof r == "number") return Number(e) - r;
          if (typeof r == "bigint") try {
            return BigInt(e) - r;
          } catch {
            return BigInt(0) - r;
          }
          throw new TypeError("Invalid subtrahend ".concat(r));
        }
        return n = (n = t.replacePrefix) === null || n === void 0 ? void 0 : n[0], n && typeof e == "string" && e.startsWith(n) ? t.replacePrefix[1] + e.substring(n.length) : e;
      }, er);
      function er(e) {
        this["@@propmod"] = e;
      }
      var Mr = (F.prototype._read = function(e, t) {
        var n = this._ctx;
        return n.error ? n.table._trans(null, z.bind(null, n.error)) : n.table._trans("readonly", e).then(t);
      }, F.prototype._write = function(e) {
        var t = this._ctx;
        return t.error ? t.table._trans(null, z.bind(null, t.error)) : t.table._trans("readwrite", e, "locked");
      }, F.prototype._addAlgorithm = function(e) {
        var t = this._ctx;
        t.algorithm = De(t.algorithm, e);
      }, F.prototype._iterate = function(e, t) {
        return Kt(this._ctx, e, t, this._ctx.table.core);
      }, F.prototype.clone = function(e) {
        var t = Object.create(this.constructor.prototype), n = Object.create(this._ctx);
        return e && re(n, e), t._ctx = n, t;
      }, F.prototype.raw = function() {
        return this._ctx.valueMapper = null, this;
      }, F.prototype.each = function(e) {
        var t = this._ctx;
        return this._read(function(n) {
          return Kt(t, e, n, t.table.core);
        });
      }, F.prototype.count = function(e) {
        var t = this;
        return this._read(function(n) {
          var r = t._ctx, i = r.table.core;
          if (Ye(r, !0)) return i.count({ trans: n, query: { index: Pt(r, i.schema), range: r.range } }).then(function(a) {
            return Math.min(a, r.limit);
          });
          var o = 0;
          return Kt(r, function() {
            return ++o, !1;
          }, n, i).then(function() {
            return o;
          });
        }).then(e);
      }, F.prototype.sortBy = function(e, t) {
        var n = e.split(".").reverse(), r = n[0], i = n.length - 1;
        function o(c, f) {
          return f ? o(c[n[f]], f - 1) : c[r];
        }
        var a = this._ctx.dir === "next" ? 1 : -1;
        function u(c, f) {
          return R(o(c, i), o(f, i)) * a;
        }
        return this.toArray(function(c) {
          return c.sort(u);
        }).then(t);
      }, F.prototype.toArray = function(e) {
        var t = this;
        return this._read(function(n) {
          var r = t._ctx;
          if (r.dir === "next" && Ye(r, !0) && 0 < r.limit) {
            var i = r.valueMapper, o = Pt(r, r.table.core.schema);
            return r.table.core.query({ trans: n, limit: r.limit, values: !0, query: { index: o, range: r.range } }).then(function(u) {
              return u = u.result, i ? u.map(i) : u;
            });
          }
          var a = [];
          return Kt(r, function(u) {
            return a.push(u);
          }, n, r.table.core).then(function() {
            return a;
          });
        }, e);
      }, F.prototype.offset = function(e) {
        var t = this._ctx;
        return e <= 0 || (t.offset += e, Ye(t) ? un(t, function() {
          var n = e;
          return function(r, i) {
            return n === 0 || (n === 1 ? --n : i(function() {
              r.advance(n), n = 0;
            }), !1);
          };
        }) : un(t, function() {
          var n = e;
          return function() {
            return --n < 0;
          };
        })), this;
      }, F.prototype.limit = function(e) {
        return this._ctx.limit = Math.min(this._ctx.limit, e), un(this._ctx, function() {
          var t = e;
          return function(n, r, i) {
            return --t <= 0 && r(i), 0 <= t;
          };
        }, !0), this;
      }, F.prototype.until = function(e, t) {
        return an(this._ctx, function(n, r, i) {
          return !e(n.value) || (r(i), t);
        }), this;
      }, F.prototype.first = function(e) {
        return this.limit(1).toArray(function(t) {
          return t[0];
        }).then(e);
      }, F.prototype.last = function(e) {
        return this.reverse().first(e);
      }, F.prototype.filter = function(e) {
        var t;
        return an(this._ctx, function(n) {
          return e(n.value);
        }), (t = this._ctx).isMatch = De(t.isMatch, e), this;
      }, F.prototype.and = function(e) {
        return this.filter(e);
      }, F.prototype.or = function(e) {
        return new this.db.WhereClause(this._ctx.table, e, this);
      }, F.prototype.reverse = function() {
        return this._ctx.dir = this._ctx.dir === "prev" ? "next" : "prev", this._ondirectionchange && this._ondirectionchange(this._ctx.dir), this;
      }, F.prototype.desc = function() {
        return this.reverse();
      }, F.prototype.eachKey = function(e) {
        var t = this._ctx;
        return t.keysOnly = !t.isMatch, this.each(function(n, r) {
          e(r.key, r);
        });
      }, F.prototype.eachUniqueKey = function(e) {
        return this._ctx.unique = "unique", this.eachKey(e);
      }, F.prototype.eachPrimaryKey = function(e) {
        var t = this._ctx;
        return t.keysOnly = !t.isMatch, this.each(function(n, r) {
          e(r.primaryKey, r);
        });
      }, F.prototype.keys = function(e) {
        var t = this._ctx;
        t.keysOnly = !t.isMatch;
        var n = [];
        return this.each(function(r, i) {
          n.push(i.key);
        }).then(function() {
          return n;
        }).then(e);
      }, F.prototype.primaryKeys = function(e) {
        var t = this._ctx;
        if (t.dir === "next" && Ye(t, !0) && 0 < t.limit) return this._read(function(r) {
          var i = Pt(t, t.table.core.schema);
          return t.table.core.query({ trans: r, values: !1, limit: t.limit, query: { index: i, range: t.range } });
        }).then(function(r) {
          return r.result;
        }).then(e);
        t.keysOnly = !t.isMatch;
        var n = [];
        return this.each(function(r, i) {
          n.push(i.primaryKey);
        }).then(function() {
          return n;
        }).then(e);
      }, F.prototype.uniqueKeys = function(e) {
        return this._ctx.unique = "unique", this.keys(e);
      }, F.prototype.firstKey = function(e) {
        return this.limit(1).keys(function(t) {
          return t[0];
        }).then(e);
      }, F.prototype.lastKey = function(e) {
        return this.reverse().firstKey(e);
      }, F.prototype.distinct = function() {
        var e = this._ctx, e = e.index && e.table.schema.idxByName[e.index];
        if (!e || !e.multi) return this;
        var t = {};
        return an(this._ctx, function(i) {
          var r = i.primaryKey.toString(), i = ne(t, r);
          return t[r] = !0, !i;
        }), this;
      }, F.prototype.modify = function(e) {
        var t = this, n = this._ctx;
        return this._write(function(r) {
          var i, o, a;
          a = typeof e == "function" ? e : (i = H(e), o = i.length, function(h) {
            for (var m = !1, g = 0; g < o; ++g) {
              var b = i[g], w = e[b], _ = fe(h, b);
              w instanceof ot ? (ie(h, b, w.execute(_)), m = !0) : _ !== w && (ie(h, b, w), m = !0);
            }
            return m;
          });
          var u = n.table.core, s = u.schema.primaryKey, c = s.outbound, f = s.extractKey, p = 200, s = t.db._options.modifyChunkSize;
          s && (p = typeof s == "object" ? s[u.name] || s["*"] || 200 : s);
          function v(h, b) {
            var g = b.failures, b = b.numFailures;
            d += h - b;
            for (var w = 0, _ = H(g); w < _.length; w++) {
              var P = _[w];
              l.push(g[P]);
            }
          }
          var l = [], d = 0, y = [];
          return t.clone().primaryKeys().then(function(h) {
            function m(b) {
              var w = Math.min(p, h.length - b);
              return u.getMany({ trans: r, keys: h.slice(b, b + w), cache: "immutable" }).then(function(_) {
                for (var P = [], x = [], k = c ? [] : null, K = [], O = 0; O < w; ++O) {
                  var E = _[O], I = { value: Oe(E), primKey: h[b + O] };
                  a.call(I, I.value, I) !== !1 && (I.value == null ? K.push(h[b + O]) : c || R(f(E), f(I.value)) === 0 ? (x.push(I.value), c && k.push(h[b + O])) : (K.push(h[b + O]), P.push(I.value)));
                }
                return Promise.resolve(0 < P.length && u.mutate({ trans: r, type: "add", values: P }).then(function(q) {
                  for (var B in q.failures) K.splice(parseInt(B), 1);
                  v(P.length, q);
                })).then(function() {
                  return (0 < x.length || g && typeof e == "object") && u.mutate({ trans: r, type: "put", keys: k, values: x, criteria: g, changeSpec: typeof e != "function" && e, isAdditionalChunk: 0 < b }).then(function(q) {
                    return v(x.length, q);
                  });
                }).then(function() {
                  return (0 < K.length || g && e === sn) && u.mutate({ trans: r, type: "delete", keys: K, criteria: g, isAdditionalChunk: 0 < b }).then(function(q) {
                    return v(K.length, q);
                  });
                }).then(function() {
                  return h.length > b + w && m(b + p);
                });
              });
            }
            var g = Ye(n) && n.limit === 1 / 0 && (typeof e != "function" || e === sn) && { index: n.index, range: n.range };
            return m(0).then(function() {
              if (0 < l.length) throw new dt("Error modifying one or more objects", l, d, y);
              return h.length;
            });
          });
        });
      }, F.prototype.delete = function() {
        var e = this._ctx, t = e.range;
        return Ye(e) && (e.isPrimKey || t.type === 3) ? this._write(function(n) {
          var r = e.table.core.schema.primaryKey, i = t;
          return e.table.core.count({ trans: n, query: { index: r, range: i } }).then(function(o) {
            return e.table.core.mutate({ trans: n, type: "deleteRange", range: i }).then(function(a) {
              var u = a.failures;
              if (a.lastResult, a.results, a = a.numFailures, a) throw new dt("Could not delete some values", Object.keys(u).map(function(c) {
                return u[c];
              }), o - a);
              return o - a;
            });
          });
        }) : this.modify(sn);
      }, F);
      function F() {
      }
      var sn = function(e, t) {
        return t.value = null;
      };
      function Nr(e, t) {
        return e < t ? -1 : e === t ? 0 : 1;
      }
      function Lr(e, t) {
        return t < e ? -1 : e === t ? 0 : 1;
      }
      function oe(e, t, n) {
        return e = e instanceof nr ? new e.Collection(e) : e, e._ctx.error = new (n || TypeError)(t), e;
      }
      function He(e) {
        return new e.Collection(e, function() {
          return tr("");
        }).limit(0);
      }
      function St(e, t, n, r) {
        var i, o, a, u, c, f, p, s = n.length;
        if (!n.every(function(d) {
          return typeof d == "string";
        })) return oe(e, Wn);
        function v(d) {
          i = d === "next" ? function(h) {
            return h.toUpperCase();
          } : function(h) {
            return h.toLowerCase();
          }, o = d === "next" ? function(h) {
            return h.toLowerCase();
          } : function(h) {
            return h.toUpperCase();
          }, a = d === "next" ? Nr : Lr;
          var y = n.map(function(h) {
            return { lower: o(h), upper: i(h) };
          }).sort(function(h, m) {
            return a(h.lower, m.lower);
          });
          u = y.map(function(h) {
            return h.upper;
          }), c = y.map(function(h) {
            return h.lower;
          }), p = (f = d) === "next" ? "" : r;
        }
        v("next"), e = new e.Collection(e, function() {
          return we(u[0], c[s - 1] + r);
        }), e._ondirectionchange = function(d) {
          v(d);
        };
        var l = 0;
        return e._addAlgorithm(function(d, y, h) {
          var m = d.key;
          if (typeof m != "string") return !1;
          var g = o(m);
          if (t(g, c, l)) return !0;
          for (var b = null, w = l; w < s; ++w) {
            var _ = function(P, x, k, K, O, E) {
              for (var I = Math.min(P.length, K.length), q = -1, B = 0; B < I; ++B) {
                var ae = x[B];
                if (ae !== K[B]) return O(P[B], k[B]) < 0 ? P.substr(0, B) + k[B] + k.substr(B + 1) : O(P[B], K[B]) < 0 ? P.substr(0, B) + K[B] + k.substr(B + 1) : 0 <= q ? P.substr(0, q) + x[q] + k.substr(q + 1) : null;
                O(P[B], ae) < 0 && (q = B);
              }
              return I < K.length && E === "next" ? P + k.substr(P.length) : I < P.length && E === "prev" ? P.substr(0, k.length) : q < 0 ? null : P.substr(0, q) + K[q] + k.substr(q + 1);
            }(m, g, u[w], c[w], a, f);
            _ === null && b === null ? l = w + 1 : (b === null || 0 < a(b, _)) && (b = _);
          }
          return y(b !== null ? function() {
            d.continue(b + p);
          } : h), !1;
        }), e;
      }
      function we(e, t, n, r) {
        return { type: 2, lower: e, upper: t, lowerOpen: n, upperOpen: r };
      }
      function tr(e) {
        return { type: 1, lower: e, upper: e };
      }
      var nr = (Object.defineProperty(Q.prototype, "Collection", { get: function() {
        return this._ctx.table.db.Collection;
      }, enumerable: !1, configurable: !0 }), Q.prototype.between = function(e, t, n, r) {
        n = n !== !1, r = r === !0;
        try {
          return 0 < this._cmp(e, t) || this._cmp(e, t) === 0 && (n || r) && (!n || !r) ? He(this) : new this.Collection(this, function() {
            return we(e, t, !n, !r);
          });
        } catch {
          return oe(this, de);
        }
      }, Q.prototype.equals = function(e) {
        return e == null ? oe(this, de) : new this.Collection(this, function() {
          return tr(e);
        });
      }, Q.prototype.above = function(e) {
        return e == null ? oe(this, de) : new this.Collection(this, function() {
          return we(e, void 0, !0);
        });
      }, Q.prototype.aboveOrEqual = function(e) {
        return e == null ? oe(this, de) : new this.Collection(this, function() {
          return we(e, void 0, !1);
        });
      }, Q.prototype.below = function(e) {
        return e == null ? oe(this, de) : new this.Collection(this, function() {
          return we(void 0, e, !1, !0);
        });
      }, Q.prototype.belowOrEqual = function(e) {
        return e == null ? oe(this, de) : new this.Collection(this, function() {
          return we(void 0, e);
        });
      }, Q.prototype.startsWith = function(e) {
        return typeof e != "string" ? oe(this, Wn) : this.between(e, e + Te, !0, !0);
      }, Q.prototype.startsWithIgnoreCase = function(e) {
        return e === "" ? this.startsWith(e) : St(this, function(t, n) {
          return t.indexOf(n[0]) === 0;
        }, [e], Te);
      }, Q.prototype.equalsIgnoreCase = function(e) {
        return St(this, function(t, n) {
          return t === n[0];
        }, [e], "");
      }, Q.prototype.anyOfIgnoreCase = function() {
        var e = he.apply(Ne, arguments);
        return e.length === 0 ? He(this) : St(this, function(t, n) {
          return n.indexOf(t) !== -1;
        }, e, "");
      }, Q.prototype.startsWithAnyOfIgnoreCase = function() {
        var e = he.apply(Ne, arguments);
        return e.length === 0 ? He(this) : St(this, function(t, n) {
          return n.some(function(r) {
            return t.indexOf(r) === 0;
          });
        }, e, Te);
      }, Q.prototype.anyOf = function() {
        var e = this, t = he.apply(Ne, arguments), n = this._cmp;
        try {
          t.sort(n);
        } catch {
          return oe(this, de);
        }
        if (t.length === 0) return He(this);
        var r = new this.Collection(this, function() {
          return we(t[0], t[t.length - 1]);
        });
        r._ondirectionchange = function(o) {
          n = o === "next" ? e._ascending : e._descending, t.sort(n);
        };
        var i = 0;
        return r._addAlgorithm(function(o, a, u) {
          for (var c = o.key; 0 < n(c, t[i]); ) if (++i === t.length) return a(u), !1;
          return n(c, t[i]) === 0 || (a(function() {
            o.continue(t[i]);
          }), !1);
        }), r;
      }, Q.prototype.notEqual = function(e) {
        return this.inAnyRange([[-1 / 0, e], [e, this.db._maxKey]], { includeLowers: !1, includeUppers: !1 });
      }, Q.prototype.noneOf = function() {
        var e = he.apply(Ne, arguments);
        if (e.length === 0) return new this.Collection(this);
        try {
          e.sort(this._ascending);
        } catch {
          return oe(this, de);
        }
        var t = e.reduce(function(n, r) {
          return n ? n.concat([[n[n.length - 1][1], r]]) : [[-1 / 0, r]];
        }, null);
        return t.push([e[e.length - 1], this.db._maxKey]), this.inAnyRange(t, { includeLowers: !1, includeUppers: !1 });
      }, Q.prototype.inAnyRange = function(m, t) {
        var n = this, r = this._cmp, i = this._ascending, o = this._descending, a = this._min, u = this._max;
        if (m.length === 0) return He(this);
        if (!m.every(function(g) {
          return g[0] !== void 0 && g[1] !== void 0 && i(g[0], g[1]) <= 0;
        })) return oe(this, "First argument to inAnyRange() must be an Array of two-value Arrays [lower,upper] where upper must not be lower than lower", C.InvalidArgument);
        var c = !t || t.includeLowers !== !1, f = t && t.includeUppers === !0, p, s = i;
        function v(g, b) {
          return s(g[0], b[0]);
        }
        try {
          (p = m.reduce(function(g, b) {
            for (var w = 0, _ = g.length; w < _; ++w) {
              var P = g[w];
              if (r(b[0], P[1]) < 0 && 0 < r(b[1], P[0])) {
                P[0] = a(P[0], b[0]), P[1] = u(P[1], b[1]);
                break;
              }
            }
            return w === _ && g.push(b), g;
          }, [])).sort(v);
        } catch {
          return oe(this, de);
        }
        var l = 0, d = f ? function(g) {
          return 0 < i(g, p[l][1]);
        } : function(g) {
          return 0 <= i(g, p[l][1]);
        }, y = c ? function(g) {
          return 0 < o(g, p[l][0]);
        } : function(g) {
          return 0 <= o(g, p[l][0]);
        }, h = d, m = new this.Collection(this, function() {
          return we(p[0][0], p[p.length - 1][1], !c, !f);
        });
        return m._ondirectionchange = function(g) {
          s = g === "next" ? (h = d, i) : (h = y, o), p.sort(v);
        }, m._addAlgorithm(function(g, b, w) {
          for (var _, P = g.key; h(P); ) if (++l === p.length) return b(w), !1;
          return !d(_ = P) && !y(_) || (n._cmp(P, p[l][1]) === 0 || n._cmp(P, p[l][0]) === 0 || b(function() {
            s === i ? g.continue(p[l][0]) : g.continue(p[l][1]);
          }), !1);
        }), m;
      }, Q.prototype.startsWithAnyOf = function() {
        var e = he.apply(Ne, arguments);
        return e.every(function(t) {
          return typeof t == "string";
        }) ? e.length === 0 ? He(this) : this.inAnyRange(e.map(function(t) {
          return [t, t + Te];
        })) : oe(this, "startsWithAnyOf() only works with strings");
      }, Q);
      function Q() {
      }
      function ce(e) {
        return U(function(t) {
          return at(t), e(t.target.error), !1;
        });
      }
      function at(e) {
        e.stopPropagation && e.stopPropagation(), e.preventDefault && e.preventDefault();
      }
      var ut = "storagemutated", cn = "x-storagemutated-1", _e = rt(null, ut), Ur = (le.prototype._lock = function() {
        return Qe(!j.global), ++this._reculock, this._reculock !== 1 || j.global || (j.lockOwnerFor = this), this;
      }, le.prototype._unlock = function() {
        if (Qe(!j.global), --this._reculock == 0) for (j.global || (j.lockOwnerFor = null); 0 < this._blockedFuncs.length && !this._locked(); ) {
          var e = this._blockedFuncs.shift();
          try {
            Ce(e[1], e[0]);
          } catch {
          }
        }
        return this;
      }, le.prototype._locked = function() {
        return this._reculock && j.lockOwnerFor !== this;
      }, le.prototype.create = function(e) {
        var t = this;
        if (!this.mode) return this;
        var n = this.db.idbdb, r = this.db._state.dbOpenError;
        if (Qe(!this.idbtrans), !e && !n) switch (r && r.name) {
          case "DatabaseClosedError":
            throw new C.DatabaseClosed(r);
          case "MissingAPIError":
            throw new C.MissingAPI(r.message, r);
          default:
            throw new C.OpenFailed(r);
        }
        if (!this.active) throw new C.TransactionInactive();
        return Qe(this._completion._state === null), (e = this.idbtrans = e || (this.db.core || n).transaction(this.storeNames, this.mode, { durability: this.chromeTransactionDurability })).onerror = U(function(i) {
          at(i), t._reject(e.error);
        }), e.onabort = U(function(i) {
          at(i), t.active && t._reject(new C.Abort(e.error)), t.active = !1, t.on("abort").fire(i);
        }), e.oncomplete = U(function() {
          t.active = !1, t._resolve(), "mutatedParts" in e && _e.storagemutated.fire(e.mutatedParts);
        }), this;
      }, le.prototype._promise = function(e, t, n) {
        var r = this;
        if (e === "readwrite" && this.mode !== "readwrite") return z(new C.ReadOnly("Transaction is readonly"));
        if (!this.active) return z(new C.TransactionInactive());
        if (this._locked()) return new S(function(o, a) {
          r._blockedFuncs.push([function() {
            r._promise(e, t, n).then(o, a);
          }, j]);
        });
        if (n) return me(function() {
          var o = new S(function(a, u) {
            r._lock();
            var c = t(a, u, r);
            c && c.then && c.then(a, u);
          });
          return o.finally(function() {
            return r._unlock();
          }), o._lib = !0, o;
        });
        var i = new S(function(o, a) {
          var u = t(o, a, r);
          u && u.then && u.then(o, a);
        });
        return i._lib = !0, i;
      }, le.prototype._root = function() {
        return this.parent ? this.parent._root() : this;
      }, le.prototype.waitFor = function(e) {
        var t, n = this._root(), r = S.resolve(e);
        n._waitingFor ? n._waitingFor = n._waitingFor.then(function() {
          return r;
        }) : (n._waitingFor = r, n._waitingQueue = [], t = n.idbtrans.objectStore(n.storeNames[0]), function o() {
          for (++n._spinCount; n._waitingQueue.length; ) n._waitingQueue.shift()();
          n._waitingFor && (t.get(-1 / 0).onsuccess = o);
        }());
        var i = n._waitingFor;
        return new S(function(o, a) {
          r.then(function(u) {
            return n._waitingQueue.push(U(o.bind(null, u)));
          }, function(u) {
            return n._waitingQueue.push(U(a.bind(null, u)));
          }).finally(function() {
            n._waitingFor === i && (n._waitingFor = null);
          });
        });
      }, le.prototype.abort = function() {
        this.active && (this.active = !1, this.idbtrans && this.idbtrans.abort(), this._reject(new C.Abort()));
      }, le.prototype.table = function(e) {
        var t = this._memoizedTables || (this._memoizedTables = {});
        if (ne(t, e)) return t[e];
        var n = this.schema[e];
        if (!n) throw new C.NotFound("Table " + e + " not part of transaction");
        return n = new this.db.Table(e, n, this), n.core = this.db.core.table(e), t[e] = n;
      }, le);
      function le() {
      }
      function ln(e, t, n, r, i, o, a) {
        return { name: e, keyPath: t, unique: n, multi: r, auto: i, compound: o, src: (n && !a ? "&" : "") + (r ? "*" : "") + (i ? "++" : "") + rr(t) };
      }
      function rr(e) {
        return typeof e == "string" ? e : e ? "[" + [].join.call(e, "+") + "]" : "";
      }
      function fn(e, t, n) {
        return { name: e, primKey: t, indexes: n, mappedClass: null, idxByName: (r = function(i) {
          return [i.name, i];
        }, n.reduce(function(i, o, a) {
          return a = r(o, a), a && (i[a[0]] = a[1]), i;
        }, {})) };
        var r;
      }
      var st = function(e) {
        try {
          return e.only([[]]), st = function() {
            return [[]];
          }, [[]];
        } catch {
          return st = function() {
            return Te;
          }, Te;
        }
      };
      function hn(e) {
        return e == null ? function() {
        } : typeof e == "string" ? (t = e).split(".").length === 1 ? function(n) {
          return n[t];
        } : function(n) {
          return fe(n, t);
        } : function(n) {
          return fe(n, e);
        };
        var t;
      }
      function ir(e) {
        return [].slice.call(e);
      }
      var Vr = 0;
      function ct(e) {
        return e == null ? ":id" : typeof e == "string" ? e : "[".concat(e.join("+"), "]");
      }
      function $r(e, t, c) {
        function r(h) {
          if (h.type === 3) return null;
          if (h.type === 4) throw new Error("Cannot convert never type to IDBKeyRange");
          var l = h.lower, d = h.upper, y = h.lowerOpen, h = h.upperOpen;
          return l === void 0 ? d === void 0 ? null : t.upperBound(d, !!h) : d === void 0 ? t.lowerBound(l, !!y) : t.bound(l, d, !!y, !!h);
        }
        function i(v) {
          var l, d = v.name;
          return { name: d, schema: v, mutate: function(y) {
            var h = y.trans, m = y.type, g = y.keys, b = y.values, w = y.range;
            return new Promise(function(_, P) {
              _ = U(_);
              var x = h.objectStore(d), k = x.keyPath == null, K = m === "put" || m === "add";
              if (!K && m !== "delete" && m !== "deleteRange") throw new Error("Invalid operation type: " + m);
              var O, E = (g || b || { length: 1 }).length;
              if (g && b && g.length !== b.length) throw new Error("Given keys array must have same length as given values array.");
              if (E === 0) return _({ numFailures: 0, failures: {}, results: [], lastResult: void 0 });
              function I(te) {
                ++ae, at(te);
              }
              var q = [], B = [], ae = 0;
              if (m === "deleteRange") {
                if (w.type === 4) return _({ numFailures: ae, failures: B, results: [], lastResult: void 0 });
                w.type === 3 ? q.push(O = x.clear()) : q.push(O = x.delete(r(w)));
              } else {
                var k = K ? k ? [b, g] : [b, null] : [g, null], D = k[0], Z = k[1];
                if (K) for (var ee = 0; ee < E; ++ee) q.push(O = Z && Z[ee] !== void 0 ? x[m](D[ee], Z[ee]) : x[m](D[ee])), O.onerror = I;
                else for (ee = 0; ee < E; ++ee) q.push(O = x[m](D[ee])), O.onerror = I;
              }
              function Nt(te) {
                te = te.target.result, q.forEach(function(Be, jn) {
                  return Be.error != null && (B[jn] = Be.error);
                }), _({ numFailures: ae, failures: B, results: m === "delete" ? g : q.map(function(Be) {
                  return Be.result;
                }), lastResult: te });
              }
              O.onerror = function(te) {
                I(te), Nt(te);
              }, O.onsuccess = Nt;
            });
          }, getMany: function(y) {
            var h = y.trans, m = y.keys;
            return new Promise(function(g, b) {
              g = U(g);
              for (var w, _ = h.objectStore(d), P = m.length, x = new Array(P), k = 0, K = 0, O = function(q) {
                q = q.target, x[q._pos] = q.result, ++K === k && g(x);
              }, E = ce(b), I = 0; I < P; ++I) m[I] != null && ((w = _.get(m[I]))._pos = I, w.onsuccess = O, w.onerror = E, ++k);
              k === 0 && g(x);
            });
          }, get: function(y) {
            var h = y.trans, m = y.key;
            return new Promise(function(g, b) {
              g = U(g);
              var w = h.objectStore(d).get(m);
              w.onsuccess = function(_) {
                return g(_.target.result);
              }, w.onerror = ce(b);
            });
          }, query: (l = f, function(y) {
            return new Promise(function(h, m) {
              h = U(h);
              var g, b, w, k = y.trans, _ = y.values, P = y.limit, O = y.query, x = P === 1 / 0 ? void 0 : P, K = O.index, O = O.range, k = k.objectStore(d), K = K.isPrimaryKey ? k : k.index(K.name), O = r(O);
              if (P === 0) return h({ result: [] });
              l ? ((x = _ ? K.getAll(O, x) : K.getAllKeys(O, x)).onsuccess = function(E) {
                return h({ result: E.target.result });
              }, x.onerror = ce(m)) : (g = 0, b = !_ && "openKeyCursor" in K ? K.openKeyCursor(O) : K.openCursor(O), w = [], b.onsuccess = function(E) {
                var I = b.result;
                return I ? (w.push(_ ? I.value : I.primaryKey), ++g === P ? h({ result: w }) : void I.continue()) : h({ result: w });
              }, b.onerror = ce(m));
            });
          }), openCursor: function(y) {
            var h = y.trans, m = y.values, g = y.query, b = y.reverse, w = y.unique;
            return new Promise(function(_, P) {
              _ = U(_);
              var K = g.index, x = g.range, k = h.objectStore(d), k = K.isPrimaryKey ? k : k.index(K.name), K = b ? w ? "prevunique" : "prev" : w ? "nextunique" : "next", O = !m && "openKeyCursor" in k ? k.openKeyCursor(r(x), K) : k.openCursor(r(x), K);
              O.onerror = ce(P), O.onsuccess = U(function(E) {
                var I, q, B, ae, D = O.result;
                D ? (D.___id = ++Vr, D.done = !1, I = D.continue.bind(D), q = (q = D.continuePrimaryKey) && q.bind(D), B = D.advance.bind(D), ae = function() {
                  throw new Error("Cursor not stopped");
                }, D.trans = h, D.stop = D.continue = D.continuePrimaryKey = D.advance = function() {
                  throw new Error("Cursor not started");
                }, D.fail = U(P), D.next = function() {
                  var Z = this, ee = 1;
                  return this.start(function() {
                    return ee-- ? Z.continue() : Z.stop();
                  }).then(function() {
                    return Z;
                  });
                }, D.start = function(Z) {
                  function ee() {
                    if (O.result) try {
                      Z();
                    } catch (te) {
                      D.fail(te);
                    }
                    else D.done = !0, D.start = function() {
                      throw new Error("Cursor behind last entry");
                    }, D.stop();
                  }
                  var Nt = new Promise(function(te, Be) {
                    te = U(te), O.onerror = ce(Be), D.fail = Be, D.stop = function(jn) {
                      D.stop = D.continue = D.continuePrimaryKey = D.advance = ae, te(jn);
                    };
                  });
                  return O.onsuccess = U(function(te) {
                    O.onsuccess = ee, ee();
                  }), D.continue = I, D.continuePrimaryKey = q, D.advance = B, ee(), Nt;
                }, _(D)) : _(null);
              }, P);
            });
          }, count: function(y) {
            var h = y.query, m = y.trans, g = h.index, b = h.range;
            return new Promise(function(w, _) {
              var P = m.objectStore(d), x = g.isPrimaryKey ? P : P.index(g.name), P = r(b), x = P ? x.count(P) : x.count();
              x.onsuccess = U(function(k) {
                return w(k.target.result);
              }), x.onerror = ce(_);
            });
          } };
        }
        var o, a, u, p = (a = c, u = ir((o = e).objectStoreNames), { schema: { name: o.name, tables: u.map(function(v) {
          return a.objectStore(v);
        }).map(function(v) {
          var l = v.keyPath, h = v.autoIncrement, d = V(l), y = {}, h = { name: v.name, primaryKey: { name: null, isPrimaryKey: !0, outbound: l == null, compound: d, keyPath: l, autoIncrement: h, unique: !0, extractKey: hn(l) }, indexes: ir(v.indexNames).map(function(m) {
            return v.index(m);
          }).map(function(w) {
            var g = w.name, b = w.unique, _ = w.multiEntry, w = w.keyPath, _ = { name: g, compound: V(w), keyPath: w, unique: b, multiEntry: _, extractKey: hn(w) };
            return y[ct(w)] = _;
          }), getIndexByKeyPath: function(m) {
            return y[ct(m)];
          } };
          return y[":id"] = h.primaryKey, l != null && (y[ct(l)] = h.primaryKey), h;
        }) }, hasGetAll: 0 < u.length && "getAll" in a.objectStore(u[0]) && !(typeof navigator < "u" && /Safari/.test(navigator.userAgent) && !/(Chrome\/|Edge\/)/.test(navigator.userAgent) && [].concat(navigator.userAgent.match(/Safari\/(\d*)/))[1] < 604) }), c = p.schema, f = p.hasGetAll, p = c.tables.map(i), s = {};
        return p.forEach(function(v) {
          return s[v.name] = v;
        }), { stack: "dbcore", transaction: e.transaction.bind(e), table: function(v) {
          if (!s[v]) throw new Error("Table '".concat(v, "' not found"));
          return s[v];
        }, MIN_KEY: -1 / 0, MAX_KEY: st(t), schema: c };
      }
      function zr(e, t, n, r) {
        var i = n.IDBKeyRange;
        return n.indexedDB, { dbcore: (r = $r(t, i, r), e.dbcore.reduce(function(o, a) {
          return a = a.create, A(A({}, o), a(o));
        }, r)) };
      }
      function Et(e, r) {
        var n = r.db, r = zr(e._middlewares, n, e._deps, r);
        e.core = r.dbcore, e.tables.forEach(function(i) {
          var o = i.name;
          e.core.schema.tables.some(function(a) {
            return a.name === o;
          }) && (i.core = e.core.table(o), e[o] instanceof e.Table && (e[o].core = i.core));
        });
      }
      function At(e, t, n, r) {
        n.forEach(function(i) {
          var o = r[i];
          t.forEach(function(a) {
            var u = function c(f, p) {
              return xr(f, p) || (f = Re(f)) && c(f, p);
            }(a, i);
            (!u || "value" in u && u.value === void 0) && (a === e.Transaction.prototype || a instanceof e.Transaction ? ye(a, i, { get: function() {
              return this.table(i);
            }, set: function(c) {
              Tn(this, i, { value: c, writable: !0, configurable: !0, enumerable: !0 });
            } }) : a[i] = new e.Table(i, o));
          });
        });
      }
      function dn(e, t) {
        t.forEach(function(n) {
          for (var r in n) n[r] instanceof e.Table && delete n[r];
        });
      }
      function Wr(e, t) {
        return e._cfg.version - t._cfg.version;
      }
      function Yr(e, t, n, r) {
        var i = e._dbSchema;
        n.objectStoreNames.contains("$meta") && !i.$meta && (i.$meta = fn("$meta", ar("")[0], []), e._storeNames.push("$meta"));
        var o = e._createTransaction("readwrite", e._storeNames, i);
        o.create(n), o._completion.catch(r);
        var a = o._reject.bind(o), u = j.transless || j;
        me(function() {
          return j.trans = o, j.transless = u, t !== 0 ? (Et(e, n), f = t, ((c = o).storeNames.includes("$meta") ? c.table("$meta").get("version").then(function(p) {
            return p ?? f;
          }) : S.resolve(f)).then(function(p) {
            return v = p, l = o, d = n, y = [], p = (s = e)._versions, h = s._dbSchema = Ct(0, s.idbdb, d), (p = p.filter(function(m) {
              return m._cfg.version >= v;
            })).length !== 0 ? (p.forEach(function(m) {
              y.push(function() {
                var g = h, b = m._cfg.dbschema;
                Tt(s, g, d), Tt(s, b, d), h = s._dbSchema = b;
                var w = pn(g, b);
                w.add.forEach(function(K) {
                  yn(d, K[0], K[1].primKey, K[1].indexes);
                }), w.change.forEach(function(K) {
                  if (K.recreate) throw new C.Upgrade("Not yet support for changing primary key");
                  var O = d.objectStore(K.name);
                  K.add.forEach(function(E) {
                    return jt(O, E);
                  }), K.change.forEach(function(E) {
                    O.deleteIndex(E.name), jt(O, E);
                  }), K.del.forEach(function(E) {
                    return O.deleteIndex(E);
                  });
                });
                var _ = m._cfg.contentUpgrade;
                if (_ && m._cfg.version > v) {
                  Et(s, d), l._memoizedTables = {};
                  var P = qn(b);
                  w.del.forEach(function(K) {
                    P[K] = g[K];
                  }), dn(s, [s.Transaction.prototype]), At(s, [s.Transaction.prototype], H(P), P), l.schema = P;
                  var x, k = Wt(_);
                  return k && ze(), w = S.follow(function() {
                    var K;
                    (x = _(l)) && k && (K = ge.bind(null, null), x.then(K, K));
                  }), x && typeof x.then == "function" ? S.resolve(x) : w.then(function() {
                    return x;
                  });
                }
              }), y.push(function(g) {
                var b, w, _ = m._cfg.dbschema;
                b = _, w = g, [].slice.call(w.db.objectStoreNames).forEach(function(P) {
                  return b[P] == null && w.db.deleteObjectStore(P);
                }), dn(s, [s.Transaction.prototype]), At(s, [s.Transaction.prototype], s._storeNames, s._dbSchema), l.schema = s._dbSchema;
              }), y.push(function(g) {
                s.idbdb.objectStoreNames.contains("$meta") && (Math.ceil(s.idbdb.version / 10) === m._cfg.version ? (s.idbdb.deleteObjectStore("$meta"), delete s._dbSchema.$meta, s._storeNames = s._storeNames.filter(function(b) {
                  return b !== "$meta";
                })) : g.objectStore("$meta").put(m._cfg.version, "version"));
              });
            }), function m() {
              return y.length ? S.resolve(y.shift()(l.idbtrans)).then(m) : S.resolve();
            }().then(function() {
              or(h, d);
            })) : S.resolve();
            var s, v, l, d, y, h;
          }).catch(a)) : (H(i).forEach(function(p) {
            yn(n, p, i[p].primKey, i[p].indexes);
          }), Et(e, n), void S.follow(function() {
            return e.on.populate.fire(o);
          }).catch(a));
          var c, f;
        });
      }
      function Hr(e, t) {
        or(e._dbSchema, t), t.db.version % 10 != 0 || t.objectStoreNames.contains("$meta") || t.db.createObjectStore("$meta").add(Math.ceil(t.db.version / 10 - 1), "version");
        var n = Ct(0, e.idbdb, t);
        Tt(e, e._dbSchema, t);
        for (var r = 0, i = pn(n, e._dbSchema).change; r < i.length; r++) {
          var o = function(a) {
            if (a.change.length || a.recreate) return console.warn("Unable to patch indexes of table ".concat(a.name, " because it has changes on the type of index or primary key.")), { value: void 0 };
            var u = t.objectStore(a.name);
            a.add.forEach(function(c) {
              se && console.debug("Dexie upgrade patch: Creating missing index ".concat(a.name, ".").concat(c.src)), jt(u, c);
            });
          }(i[r]);
          if (typeof o == "object") return o.value;
        }
      }
      function pn(e, t) {
        var n, r = { del: [], add: [], change: [] };
        for (n in e) t[n] || r.del.push(n);
        for (n in t) {
          var i = e[n], o = t[n];
          if (i) {
            var a = { name: n, def: o, recreate: !1, del: [], add: [], change: [] };
            if ("" + (i.primKey.keyPath || "") != "" + (o.primKey.keyPath || "") || i.primKey.auto !== o.primKey.auto) a.recreate = !0, r.change.push(a);
            else {
              var u = i.idxByName, c = o.idxByName, f = void 0;
              for (f in u) c[f] || a.del.push(f);
              for (f in c) {
                var p = u[f], s = c[f];
                p ? p.src !== s.src && a.change.push(s) : a.add.push(s);
              }
              (0 < a.del.length || 0 < a.add.length || 0 < a.change.length) && r.change.push(a);
            }
          } else r.add.push([n, o]);
        }
        return r;
      }
      function yn(e, t, n, r) {
        var i = e.db.createObjectStore(t, n.keyPath ? { keyPath: n.keyPath, autoIncrement: n.auto } : { autoIncrement: n.auto });
        return r.forEach(function(o) {
          return jt(i, o);
        }), i;
      }
      function or(e, t) {
        H(e).forEach(function(n) {
          t.db.objectStoreNames.contains(n) || (se && console.debug("Dexie: Creating missing table", n), yn(t, n, e[n].primKey, e[n].indexes));
        });
      }
      function jt(e, t) {
        e.createIndex(t.name, t.keyPath, { unique: t.unique, multiEntry: t.multi });
      }
      function Ct(e, t, n) {
        var r = {};
        return ht(t.objectStoreNames, 0).forEach(function(i) {
          for (var o = n.objectStore(i), a = ln(rr(f = o.keyPath), f || "", !0, !1, !!o.autoIncrement, f && typeof f != "string", !0), u = [], c = 0; c < o.indexNames.length; ++c) {
            var p = o.index(o.indexNames[c]), f = p.keyPath, p = ln(p.name, f, !!p.unique, !!p.multiEntry, !1, f && typeof f != "string", !1);
            u.push(p);
          }
          r[i] = fn(i, a, u);
        }), r;
      }
      function Tt(e, t, n) {
        for (var r = n.db.objectStoreNames, i = 0; i < r.length; ++i) {
          var o = r[i], a = n.objectStore(o);
          e._hasGetAll = "getAll" in a;
          for (var u = 0; u < a.indexNames.length; ++u) {
            var c = a.indexNames[u], f = a.index(c).keyPath, p = typeof f == "string" ? f : "[" + ht(f).join("+") + "]";
            !t[o] || (f = t[o].idxByName[p]) && (f.name = c, delete t[o].idxByName[p], t[o].idxByName[c] = f);
          }
        }
        typeof navigator < "u" && /Safari/.test(navigator.userAgent) && !/(Chrome\/|Edge\/)/.test(navigator.userAgent) && X.WorkerGlobalScope && X instanceof X.WorkerGlobalScope && [].concat(navigator.userAgent.match(/Safari\/(\d*)/))[1] < 604 && (e._hasGetAll = !1);
      }
      function ar(e) {
        return e.split(",").map(function(t, n) {
          var r = (t = t.trim()).replace(/([&*]|\+\+)/g, ""), i = /^\[/.test(r) ? r.match(/^\[(.*)\]$/)[1].split("+") : r;
          return ln(r, i || null, /\&/.test(t), /\*/.test(t), /\+\+/.test(t), V(i), n === 0);
        });
      }
      var Gr = (Dt.prototype._parseStoresSpec = function(e, t) {
        H(e).forEach(function(n) {
          if (e[n] !== null) {
            var r = ar(e[n]), i = r.shift();
            if (i.unique = !0, i.multi) throw new C.Schema("Primary key cannot be multi-valued");
            r.forEach(function(o) {
              if (o.auto) throw new C.Schema("Only primary key can be marked as autoIncrement (++)");
              if (!o.keyPath) throw new C.Schema("Index must have a name and cannot be an empty string");
            }), t[n] = fn(n, i, r);
          }
        });
      }, Dt.prototype.stores = function(n) {
        var t = this.db;
        this._cfg.storesSource = this._cfg.storesSource ? re(this._cfg.storesSource, n) : n;
        var n = t._versions, r = {}, i = {};
        return n.forEach(function(o) {
          re(r, o._cfg.storesSource), i = o._cfg.dbschema = {}, o._parseStoresSpec(r, i);
        }), t._dbSchema = i, dn(t, [t._allTables, t, t.Transaction.prototype]), At(t, [t._allTables, t, t.Transaction.prototype, this._cfg.tables], H(i), i), t._storeNames = H(i), this;
      }, Dt.prototype.upgrade = function(e) {
        return this._cfg.contentUpgrade = Ht(this._cfg.contentUpgrade || M, e), this;
      }, Dt);
      function Dt() {
      }
      function vn(e, t) {
        var n = e._dbNamesDB;
        return n || (n = e._dbNamesDB = new pe(kt, { addons: [], indexedDB: e, IDBKeyRange: t })).version(1).stores({ dbnames: "name" }), n.table("dbnames");
      }
      function mn(e) {
        return e && typeof e.databases == "function";
      }
      function gn(e) {
        return me(function() {
          return j.letThrough = !0, e();
        });
      }
      function bn(e) {
        return !("from" in e);
      }
      var J = function(e, t) {
        if (!this) {
          var n = new J();
          return e && "d" in e && re(n, e), n;
        }
        re(this, arguments.length ? { d: 1, from: e, to: 1 < arguments.length ? t : e } : { d: 0 });
      };
      function lt(e, t, n) {
        var r = R(t, n);
        if (!isNaN(r)) {
          if (0 < r) throw RangeError();
          if (bn(e)) return re(e, { from: t, to: n, d: 1 });
          var i = e.l, r = e.r;
          if (R(n, e.from) < 0) return i ? lt(i, t, n) : e.l = { from: t, to: n, d: 1, l: null, r: null }, sr(e);
          if (0 < R(t, e.to)) return r ? lt(r, t, n) : e.r = { from: t, to: n, d: 1, l: null, r: null }, sr(e);
          R(t, e.from) < 0 && (e.from = t, e.l = null, e.d = r ? r.d + 1 : 1), 0 < R(n, e.to) && (e.to = n, e.r = null, e.d = e.l ? e.l.d + 1 : 1), n = !e.r, i && !e.l && ft(e, i), r && n && ft(e, r);
        }
      }
      function ft(e, t) {
        bn(t) || function n(r, c) {
          var o = c.from, a = c.to, u = c.l, c = c.r;
          lt(r, o, a), u && n(r, u), c && n(r, c);
        }(e, t);
      }
      function ur(e, t) {
        var n = It(t), r = n.next();
        if (r.done) return !1;
        for (var i = r.value, o = It(e), a = o.next(i.from), u = a.value; !r.done && !a.done; ) {
          if (R(u.from, i.to) <= 0 && 0 <= R(u.to, i.from)) return !0;
          R(i.from, u.from) < 0 ? i = (r = n.next(u.from)).value : u = (a = o.next(i.from)).value;
        }
        return !1;
      }
      function It(e) {
        var t = bn(e) ? null : { s: 0, n: e };
        return { next: function(n) {
          for (var r = 0 < arguments.length; t; ) switch (t.s) {
            case 0:
              if (t.s = 1, r) for (; t.n.l && R(n, t.n.from) < 0; ) t = { up: t, n: t.n.l, s: 1 };
              else for (; t.n.l; ) t = { up: t, n: t.n.l, s: 1 };
            case 1:
              if (t.s = 2, !r || R(n, t.n.to) <= 0) return { value: t.n, done: !1 };
            case 2:
              if (t.n.r) {
                t.s = 3, t = { up: t, n: t.n.r, s: 0 };
                continue;
              }
            case 3:
              t = t.up;
          }
          return { done: !0 };
        } };
      }
      function sr(e) {
        var t, n, r = (((t = e.r) === null || t === void 0 ? void 0 : t.d) || 0) - (((n = e.l) === null || n === void 0 ? void 0 : n.d) || 0), i = 1 < r ? "r" : r < -1 ? "l" : "";
        i && (t = i == "r" ? "l" : "r", n = A({}, e), r = e[i], e.from = r.from, e.to = r.to, e[i] = r[i], n[i] = r[t], (e[t] = n).d = cr(n)), e.d = cr(e);
      }
      function cr(n) {
        var t = n.r, n = n.l;
        return (t ? n ? Math.max(t.d, n.d) : t.d : n ? n.d : 0) + 1;
      }
      function qt(e, t) {
        return H(t).forEach(function(n) {
          e[n] ? ft(e[n], t[n]) : e[n] = function r(i) {
            var o, a, u = {};
            for (o in i) ne(i, o) && (a = i[o], u[o] = !a || typeof a != "object" || Rn.has(a.constructor) ? a : r(a));
            return u;
          }(t[n]);
        }), e;
      }
      function wn(e, t) {
        return e.all || t.all || Object.keys(e).some(function(n) {
          return t[n] && ur(t[n], e[n]);
        });
      }
      Fe(J.prototype, ((ue = { add: function(e) {
        return ft(this, e), this;
      }, addKey: function(e) {
        return lt(this, e, e), this;
      }, addKeys: function(e) {
        var t = this;
        return e.forEach(function(n) {
          return lt(t, n, n);
        }), this;
      }, hasKey: function(e) {
        var t = It(this).next(e).value;
        return t && R(t.from, e) <= 0 && 0 <= R(t.to, e);
      } })[zt] = function() {
        return It(this);
      }, ue));
      var Ie = {}, _n = {}, xn = !1;
      function Bt(e) {
        qt(_n, e), xn || (xn = !0, setTimeout(function() {
          xn = !1, kn(_n, !(_n = {}));
        }, 0));
      }
      function kn(e, t) {
        t === void 0 && (t = !1);
        var n = /* @__PURE__ */ new Set();
        if (e.all) for (var r = 0, i = Object.values(Ie); r < i.length; r++) lr(a = i[r], e, n, t);
        else for (var o in e) {
          var a, u = /^idb\:\/\/(.*)\/(.*)\//.exec(o);
          u && (o = u[1], u = u[2], (a = Ie["idb://".concat(o, "/").concat(u)]) && lr(a, e, n, t));
        }
        n.forEach(function(c) {
          return c();
        });
      }
      function lr(e, t, n, r) {
        for (var i = [], o = 0, a = Object.entries(e.queries.query); o < a.length; o++) {
          for (var u = a[o], c = u[0], f = [], p = 0, s = u[1]; p < s.length; p++) {
            var v = s[p];
            wn(t, v.obsSet) ? v.subscribers.forEach(function(h) {
              return n.add(h);
            }) : r && f.push(v);
          }
          r && i.push([c, f]);
        }
        if (r) for (var l = 0, d = i; l < d.length; l++) {
          var y = d[l], c = y[0], f = y[1];
          e.queries.query[c] = f;
        }
      }
      function Qr(e) {
        var t = e._state, n = e._deps.indexedDB;
        if (t.isBeingOpened || e.idbdb) return t.dbReadyPromise.then(function() {
          return t.dbOpenError ? z(t.dbOpenError) : e;
        });
        t.isBeingOpened = !0, t.dbOpenError = null, t.openComplete = !1;
        var r = t.openCanceller, i = Math.round(10 * e.verno), o = !1;
        function a() {
          if (t.openCanceller !== r) throw new C.DatabaseClosed("db.open() was cancelled");
        }
        function u() {
          return new S(function(v, l) {
            if (a(), !n) throw new C.MissingAPI();
            var d = e.name, y = t.autoSchema || !i ? n.open(d) : n.open(d, i);
            if (!y) throw new C.MissingAPI();
            y.onerror = ce(l), y.onblocked = U(e._fireOnBlocked), y.onupgradeneeded = U(function(h) {
              var m;
              p = y.transaction, t.autoSchema && !e._options.allowEmptyDB ? (y.onerror = at, p.abort(), y.result.close(), (m = n.deleteDatabase(d)).onsuccess = m.onerror = U(function() {
                l(new C.NoSuchDatabase("Database ".concat(d, " doesnt exist")));
              })) : (p.onerror = ce(l), h = h.oldVersion > Math.pow(2, 62) ? 0 : h.oldVersion, s = h < 1, e.idbdb = y.result, o && Hr(e, p), Yr(e, h / 10, p, l));
            }, l), y.onsuccess = U(function() {
              p = null;
              var h, m, g, b, w, _ = e.idbdb = y.result, P = ht(_.objectStoreNames);
              if (0 < P.length) try {
                var x = _.transaction((b = P).length === 1 ? b[0] : b, "readonly");
                if (t.autoSchema) m = _, g = x, (h = e).verno = m.version / 10, g = h._dbSchema = Ct(0, m, g), h._storeNames = ht(m.objectStoreNames, 0), At(h, [h._allTables], H(g), g);
                else if (Tt(e, e._dbSchema, x), ((w = pn(Ct(0, (w = e).idbdb, x), w._dbSchema)).add.length || w.change.some(function(k) {
                  return k.add.length || k.change.length;
                })) && !o) return console.warn("Dexie SchemaDiff: Schema was extended without increasing the number passed to db.version(). Dexie will add missing parts and increment native version number to workaround this."), _.close(), i = _.version + 1, o = !0, v(u());
                Et(e, x);
              } catch {
              }
              We.push(e), _.onversionchange = U(function(k) {
                t.vcFired = !0, e.on("versionchange").fire(k);
              }), _.onclose = U(function(k) {
                e.on("close").fire(k);
              }), s && (w = e._deps, x = d, _ = w.indexedDB, w = w.IDBKeyRange, mn(_) || x === kt || vn(_, w).put({ name: x }).catch(M)), v();
            }, l);
          }).catch(function(v) {
            switch (v?.name) {
              case "UnknownError":
                if (0 < t.PR1398_maxLoop) return t.PR1398_maxLoop--, console.warn("Dexie: Workaround for Chrome UnknownError on open()"), u();
                break;
              case "VersionError":
                if (0 < i) return i = 0, u();
            }
            return S.reject(v);
          });
        }
        var c, f = t.dbReadyResolve, p = null, s = !1;
        return S.race([r, (typeof navigator > "u" ? S.resolve() : !navigator.userAgentData && /Safari\//.test(navigator.userAgent) && !/Chrom(e|ium)\//.test(navigator.userAgent) && indexedDB.databases ? new Promise(function(v) {
          function l() {
            return indexedDB.databases().finally(v);
          }
          c = setInterval(l, 100), l();
        }).finally(function() {
          return clearInterval(c);
        }) : Promise.resolve()).then(u)]).then(function() {
          return a(), t.onReadyBeingFired = [], S.resolve(gn(function() {
            return e.on.ready.fire(e.vip);
          })).then(function v() {
            if (0 < t.onReadyBeingFired.length) {
              var l = t.onReadyBeingFired.reduce(Ht, M);
              return t.onReadyBeingFired = [], S.resolve(gn(function() {
                return l(e.vip);
              })).then(v);
            }
          });
        }).finally(function() {
          t.openCanceller === r && (t.onReadyBeingFired = null, t.isBeingOpened = !1);
        }).catch(function(v) {
          t.dbOpenError = v;
          try {
            p && p.abort();
          } catch {
          }
          return r === t.openCanceller && e._close(), z(v);
        }).finally(function() {
          t.openComplete = !0, f();
        }).then(function() {
          var v;
          return s && (v = {}, e.tables.forEach(function(l) {
            l.schema.indexes.forEach(function(d) {
              d.name && (v["idb://".concat(e.name, "/").concat(l.name, "/").concat(d.name)] = new J(-1 / 0, [[[]]]));
            }), v["idb://".concat(e.name, "/").concat(l.name, "/")] = v["idb://".concat(e.name, "/").concat(l.name, "/:dels")] = new J(-1 / 0, [[[]]]);
          }), _e(ut).fire(v), kn(v, !0)), e;
        });
      }
      function On(e) {
        function t(o) {
          return e.next(o);
        }
        var n = i(t), r = i(function(o) {
          return e.throw(o);
        });
        function i(o) {
          return function(c) {
            var u = o(c), c = u.value;
            return u.done ? c : c && typeof c.then == "function" ? c.then(n, r) : V(c) ? Promise.all(c).then(n, r) : n(c);
          };
        }
        return i(t)();
      }
      function Rt(e, t, n) {
        for (var r = V(e) ? e.slice() : [e], i = 0; i < n; ++i) r.push(t);
        return r;
      }
      var Xr = { stack: "dbcore", name: "VirtualIndexMiddleware", level: 1, create: function(e) {
        return A(A({}, e), { table: function(t) {
          var n = e.table(t), r = n.schema, i = {}, o = [];
          function a(s, v, l) {
            var d = ct(s), y = i[d] = i[d] || [], h = s == null ? 0 : typeof s == "string" ? 1 : s.length, m = 0 < v, m = A(A({}, l), { name: m ? "".concat(d, "(virtual-from:").concat(l.name, ")") : l.name, lowLevelIndex: l, isVirtual: m, keyTail: v, keyLength: h, extractKey: hn(s), unique: !m && l.unique });
            return y.push(m), m.isPrimaryKey || o.push(m), 1 < h && a(h === 2 ? s[0] : s.slice(0, h - 1), v + 1, l), y.sort(function(g, b) {
              return g.keyTail - b.keyTail;
            }), m;
          }
          t = a(r.primaryKey.keyPath, 0, r.primaryKey), i[":id"] = [t];
          for (var u = 0, c = r.indexes; u < c.length; u++) {
            var f = c[u];
            a(f.keyPath, 0, f);
          }
          function p(s) {
            var v, l = s.query.index;
            return l.isVirtual ? A(A({}, s), { query: { index: l.lowLevelIndex, range: (v = s.query.range, l = l.keyTail, { type: v.type === 1 ? 2 : v.type, lower: Rt(v.lower, v.lowerOpen ? e.MAX_KEY : e.MIN_KEY, l), lowerOpen: !0, upper: Rt(v.upper, v.upperOpen ? e.MIN_KEY : e.MAX_KEY, l), upperOpen: !0 }) } }) : s;
          }
          return A(A({}, n), { schema: A(A({}, r), { primaryKey: t, indexes: o, getIndexByKeyPath: function(s) {
            return (s = i[ct(s)]) && s[0];
          } }), count: function(s) {
            return n.count(p(s));
          }, query: function(s) {
            return n.query(p(s));
          }, openCursor: function(s) {
            var v = s.query.index, l = v.keyTail, d = v.isVirtual, y = v.keyLength;
            return d ? n.openCursor(p(s)).then(function(m) {
              return m && h(m);
            }) : n.openCursor(s);
            function h(m) {
              return Object.create(m, { continue: { value: function(g) {
                g != null ? m.continue(Rt(g, s.reverse ? e.MAX_KEY : e.MIN_KEY, l)) : s.unique ? m.continue(m.key.slice(0, y).concat(s.reverse ? e.MIN_KEY : e.MAX_KEY, l)) : m.continue();
              } }, continuePrimaryKey: { value: function(g, b) {
                m.continuePrimaryKey(Rt(g, e.MAX_KEY, l), b);
              } }, primaryKey: { get: function() {
                return m.primaryKey;
              } }, key: { get: function() {
                var g = m.key;
                return y === 1 ? g[0] : g.slice(0, y);
              } }, value: { get: function() {
                return m.value;
              } } });
            }
          } });
        } });
      } };
      function Pn(e, t, n, r) {
        return n = n || {}, r = r || "", H(e).forEach(function(i) {
          var o, a, u;
          ne(t, i) ? (o = e[i], a = t[i], typeof o == "object" && typeof a == "object" && o && a ? (u = $t(o)) !== $t(a) ? n[r + i] = t[i] : u === "Object" ? Pn(o, a, n, r + i + ".") : o !== a && (n[r + i] = t[i]) : o !== a && (n[r + i] = t[i])) : n[r + i] = void 0;
        }), H(t).forEach(function(i) {
          ne(e, i) || (n[r + i] = t[i]);
        }), n;
      }
      function Kn(e, t) {
        return t.type === "delete" ? t.keys : t.keys || t.values.map(e.extractKey);
      }
      var Jr = { stack: "dbcore", name: "HooksMiddleware", level: 2, create: function(e) {
        return A(A({}, e), { table: function(t) {
          var n = e.table(t), r = n.schema.primaryKey;
          return A(A({}, n), { mutate: function(i) {
            var o = j.trans, a = o.table(t).hook, u = a.deleting, c = a.creating, f = a.updating;
            switch (i.type) {
              case "add":
                if (c.fire === M) break;
                return o._promise("readwrite", function() {
                  return p(i);
                }, !0);
              case "put":
                if (c.fire === M && f.fire === M) break;
                return o._promise("readwrite", function() {
                  return p(i);
                }, !0);
              case "delete":
                if (u.fire === M) break;
                return o._promise("readwrite", function() {
                  return p(i);
                }, !0);
              case "deleteRange":
                if (u.fire === M) break;
                return o._promise("readwrite", function() {
                  return function s(v, l, d) {
                    return n.query({ trans: v, values: !1, query: { index: r, range: l }, limit: d }).then(function(y) {
                      var h = y.result;
                      return p({ type: "delete", keys: h, trans: v }).then(function(m) {
                        return 0 < m.numFailures ? Promise.reject(m.failures[0]) : h.length < d ? { failures: [], numFailures: 0, lastResult: void 0 } : s(v, A(A({}, l), { lower: h[h.length - 1], lowerOpen: !0 }), d);
                      });
                    });
                  }(i.trans, i.range, 1e4);
                }, !0);
            }
            return n.mutate(i);
            function p(s) {
              var v, l, d, y = j.trans, h = s.keys || Kn(r, s);
              if (!h) throw new Error("Keys missing");
              return (s = s.type === "add" || s.type === "put" ? A(A({}, s), { keys: h }) : A({}, s)).type !== "delete" && (s.values = ke([], s.values)), s.keys && (s.keys = ke([], s.keys)), v = n, d = h, ((l = s).type === "add" ? Promise.resolve([]) : v.getMany({ trans: l.trans, keys: d, cache: "immutable" })).then(function(m) {
                var g = h.map(function(b, w) {
                  var _, P, x, k = m[w], K = { onerror: null, onsuccess: null };
                  return s.type === "delete" ? u.fire.call(K, b, k, y) : s.type === "add" || k === void 0 ? (_ = c.fire.call(K, b, s.values[w], y), b == null && _ != null && (s.keys[w] = b = _, r.outbound || ie(s.values[w], r.keyPath, b))) : (_ = Pn(k, s.values[w]), (P = f.fire.call(K, _, b, k, y)) && (x = s.values[w], Object.keys(P).forEach(function(O) {
                    ne(x, O) ? x[O] = P[O] : ie(x, O, P[O]);
                  }))), K;
                });
                return n.mutate(s).then(function(b) {
                  for (var w = b.failures, _ = b.results, P = b.numFailures, b = b.lastResult, x = 0; x < h.length; ++x) {
                    var k = (_ || h)[x], K = g[x];
                    k == null ? K.onerror && K.onerror(w[x]) : K.onsuccess && K.onsuccess(s.type === "put" && m[x] ? s.values[x] : k);
                  }
                  return { failures: w, results: _, numFailures: P, lastResult: b };
                }).catch(function(b) {
                  return g.forEach(function(w) {
                    return w.onerror && w.onerror(b);
                  }), Promise.reject(b);
                });
              });
            }
          } });
        } });
      } };
      function fr(e, t, n) {
        try {
          if (!t || t.keys.length < e.length) return null;
          for (var r = [], i = 0, o = 0; i < t.keys.length && o < e.length; ++i) R(t.keys[i], e[o]) === 0 && (r.push(n ? Oe(t.values[i]) : t.values[i]), ++o);
          return r.length === e.length ? r : null;
        } catch {
          return null;
        }
      }
      var Zr = { stack: "dbcore", level: -1, create: function(e) {
        return { table: function(t) {
          var n = e.table(t);
          return A(A({}, n), { getMany: function(r) {
            if (!r.cache) return n.getMany(r);
            var i = fr(r.keys, r.trans._cache, r.cache === "clone");
            return i ? S.resolve(i) : n.getMany(r).then(function(o) {
              return r.trans._cache = { keys: r.keys, values: r.cache === "clone" ? Oe(o) : o }, o;
            });
          }, mutate: function(r) {
            return r.type !== "add" && (r.trans._cache = null), n.mutate(r);
          } });
        } };
      } };
      function hr(e, t) {
        return e.trans.mode === "readonly" && !!e.subscr && !e.trans.explicit && e.trans.db._options.cache !== "disabled" && !t.schema.primaryKey.outbound;
      }
      function dr(e, t) {
        switch (e) {
          case "query":
            return t.values && !t.unique;
          case "get":
          case "getMany":
          case "count":
          case "openCursor":
            return !1;
        }
      }
      var ei = { stack: "dbcore", level: 0, name: "Observability", create: function(e) {
        var t = e.schema.name, n = new J(e.MIN_KEY, e.MAX_KEY);
        return A(A({}, e), { transaction: function(r, i, o) {
          if (j.subscr && i !== "readonly") throw new C.ReadOnly("Readwrite transaction in liveQuery context. Querier source: ".concat(j.querier));
          return e.transaction(r, i, o);
        }, table: function(r) {
          var i = e.table(r), o = i.schema, a = o.primaryKey, s = o.indexes, u = a.extractKey, c = a.outbound, f = a.autoIncrement && s.filter(function(l) {
            return l.compound && l.keyPath.includes(a.keyPath);
          }), p = A(A({}, i), { mutate: function(l) {
            function d(O) {
              return O = "idb://".concat(t, "/").concat(r, "/").concat(O), b[O] || (b[O] = new J());
            }
            var y, h, m, g = l.trans, b = l.mutatedParts || (l.mutatedParts = {}), w = d(""), _ = d(":dels"), P = l.type, K = l.type === "deleteRange" ? [l.range] : l.type === "delete" ? [l.keys] : l.values.length < 50 ? [Kn(a, l).filter(function(O) {
              return O;
            }), l.values] : [], x = K[0], k = K[1], K = l.trans._cache;
            return V(x) ? (w.addKeys(x), (K = P === "delete" || x.length === k.length ? fr(x, K) : null) || _.addKeys(x), (K || k) && (y = d, h = K, m = k, o.indexes.forEach(function(O) {
              var E = y(O.name || "");
              function I(B) {
                return B != null ? O.extractKey(B) : null;
              }
              function q(B) {
                return O.multiEntry && V(B) ? B.forEach(function(ae) {
                  return E.addKey(ae);
                }) : E.addKey(B);
              }
              (h || m).forEach(function(B, Z) {
                var D = h && I(h[Z]), Z = m && I(m[Z]);
                R(D, Z) !== 0 && (D != null && q(D), Z != null && q(Z));
              });
            }))) : x ? (k = { from: (k = x.lower) !== null && k !== void 0 ? k : e.MIN_KEY, to: (k = x.upper) !== null && k !== void 0 ? k : e.MAX_KEY }, _.add(k), w.add(k)) : (w.add(n), _.add(n), o.indexes.forEach(function(O) {
              return d(O.name).add(n);
            })), i.mutate(l).then(function(O) {
              return !x || l.type !== "add" && l.type !== "put" || (w.addKeys(O.results), f && f.forEach(function(E) {
                for (var I = l.values.map(function(D) {
                  return E.extractKey(D);
                }), q = E.keyPath.findIndex(function(D) {
                  return D === a.keyPath;
                }), B = 0, ae = O.results.length; B < ae; ++B) I[B][q] = O.results[B];
                d(E.name).addKeys(I);
              })), g.mutatedParts = qt(g.mutatedParts || {}, b), O;
            });
          } }), s = function(d) {
            var y = d.query, d = y.index, y = y.range;
            return [d, new J((d = y.lower) !== null && d !== void 0 ? d : e.MIN_KEY, (y = y.upper) !== null && y !== void 0 ? y : e.MAX_KEY)];
          }, v = { get: function(l) {
            return [a, new J(l.key)];
          }, getMany: function(l) {
            return [a, new J().addKeys(l.keys)];
          }, count: s, query: s, openCursor: s };
          return H(v).forEach(function(l) {
            p[l] = function(d) {
              var y = j.subscr, h = !!y, m = hr(j, i) && dr(l, d) ? d.obsSet = {} : y;
              if (h) {
                var g = function(k) {
                  return k = "idb://".concat(t, "/").concat(r, "/").concat(k), m[k] || (m[k] = new J());
                }, b = g(""), w = g(":dels"), y = v[l](d), h = y[0], y = y[1];
                if ((l === "query" && h.isPrimaryKey && !d.values ? w : g(h.name || "")).add(y), !h.isPrimaryKey) {
                  if (l !== "count") {
                    var _ = l === "query" && c && d.values && i.query(A(A({}, d), { values: !1 }));
                    return i[l].apply(this, arguments).then(function(k) {
                      if (l === "query") {
                        if (c && d.values) return _.then(function(I) {
                          return I = I.result, b.addKeys(I), k;
                        });
                        var K = d.values ? k.result.map(u) : k.result;
                        (d.values ? b : w).addKeys(K);
                      } else if (l === "openCursor") {
                        var O = k, E = d.values;
                        return O && Object.create(O, { key: { get: function() {
                          return w.addKey(O.primaryKey), O.key;
                        } }, primaryKey: { get: function() {
                          var I = O.primaryKey;
                          return w.addKey(I), I;
                        } }, value: { get: function() {
                          return E && b.addKey(O.primaryKey), O.value;
                        } } });
                      }
                      return k;
                    });
                  }
                  w.add(n);
                }
              }
              return i[l].apply(this, arguments);
            };
          }), p;
        } });
      } };
      function pr(e, t, n) {
        if (n.numFailures === 0) return t;
        if (t.type === "deleteRange") return null;
        var r = t.keys ? t.keys.length : "values" in t && t.values ? t.values.length : 1;
        return n.numFailures === r ? null : (t = A({}, t), V(t.keys) && (t.keys = t.keys.filter(function(i, o) {
          return !(o in n.failures);
        })), "values" in t && V(t.values) && (t.values = t.values.filter(function(i, o) {
          return !(o in n.failures);
        })), t);
      }
      function Sn(e, t) {
        return n = e, ((r = t).lower === void 0 || (r.lowerOpen ? 0 < R(n, r.lower) : 0 <= R(n, r.lower))) && (e = e, (t = t).upper === void 0 || (t.upperOpen ? R(e, t.upper) < 0 : R(e, t.upper) <= 0));
        var n, r;
      }
      function yr(e, t, v, r, i, o) {
        if (!v || v.length === 0) return e;
        var a = t.query.index, u = a.multiEntry, c = t.query.range, f = r.schema.primaryKey.extractKey, p = a.extractKey, s = (a.lowLevelIndex || a).extractKey, v = v.reduce(function(l, d) {
          var y = l, h = [];
          if (d.type === "add" || d.type === "put") for (var m = new J(), g = d.values.length - 1; 0 <= g; --g) {
            var b, w = d.values[g], _ = f(w);
            m.hasKey(_) || (b = p(w), (u && V(b) ? b.some(function(O) {
              return Sn(O, c);
            }) : Sn(b, c)) && (m.addKey(_), h.push(w)));
          }
          switch (d.type) {
            case "add":
              var P = new J().addKeys(t.values ? l.map(function(E) {
                return f(E);
              }) : l), y = l.concat(t.values ? h.filter(function(E) {
                return E = f(E), !P.hasKey(E) && (P.addKey(E), !0);
              }) : h.map(function(E) {
                return f(E);
              }).filter(function(E) {
                return !P.hasKey(E) && (P.addKey(E), !0);
              }));
              break;
            case "put":
              var x = new J().addKeys(d.values.map(function(E) {
                return f(E);
              }));
              y = l.filter(function(E) {
                return !x.hasKey(t.values ? f(E) : E);
              }).concat(t.values ? h : h.map(function(E) {
                return f(E);
              }));
              break;
            case "delete":
              var k = new J().addKeys(d.keys);
              y = l.filter(function(E) {
                return !k.hasKey(t.values ? f(E) : E);
              });
              break;
            case "deleteRange":
              var K = d.range;
              y = l.filter(function(E) {
                return !Sn(f(E), K);
              });
          }
          return y;
        }, e);
        return v === e ? e : (v.sort(function(l, d) {
          return R(s(l), s(d)) || R(f(l), f(d));
        }), t.limit && t.limit < 1 / 0 && (v.length > t.limit ? v.length = t.limit : e.length === t.limit && v.length < t.limit && (i.dirty = !0)), o ? Object.freeze(v) : v);
      }
      function vr(e, t) {
        return R(e.lower, t.lower) === 0 && R(e.upper, t.upper) === 0 && !!e.lowerOpen == !!t.lowerOpen && !!e.upperOpen == !!t.upperOpen;
      }
      function ti(e, t) {
        return function(n, r, i, o) {
          if (n === void 0) return r !== void 0 ? -1 : 0;
          if (r === void 0) return 1;
          if ((r = R(n, r)) === 0) {
            if (i && o) return 0;
            if (i) return 1;
            if (o) return -1;
          }
          return r;
        }(e.lower, t.lower, e.lowerOpen, t.lowerOpen) <= 0 && 0 <= function(n, r, i, o) {
          if (n === void 0) return r !== void 0 ? 1 : 0;
          if (r === void 0) return -1;
          if ((r = R(n, r)) === 0) {
            if (i && o) return 0;
            if (i) return -1;
            if (o) return 1;
          }
          return r;
        }(e.upper, t.upper, e.upperOpen, t.upperOpen);
      }
      function ni(e, t, n, r) {
        e.subscribers.add(n), r.addEventListener("abort", function() {
          var i, o;
          e.subscribers.delete(n), e.subscribers.size === 0 && (i = e, o = t, setTimeout(function() {
            i.subscribers.size === 0 && Pe(o, i);
          }, 3e3));
        });
      }
      var ri = { stack: "dbcore", level: 0, name: "Cache", create: function(e) {
        var t = e.schema.name;
        return A(A({}, e), { transaction: function(n, r, i) {
          var o, a, u = e.transaction(n, r, i);
          return r === "readwrite" && (a = (o = new AbortController()).signal, i = function(c) {
            return function() {
              if (o.abort(), r === "readwrite") {
                for (var f = /* @__PURE__ */ new Set(), p = 0, s = n; p < s.length; p++) {
                  var v = s[p], l = Ie["idb://".concat(t, "/").concat(v)];
                  if (l) {
                    var d = e.table(v), y = l.optimisticOps.filter(function(E) {
                      return E.trans === u;
                    });
                    if (u._explicit && c && u.mutatedParts) for (var h = 0, m = Object.values(l.queries.query); h < m.length; h++) for (var g = 0, b = (P = m[h]).slice(); g < b.length; g++) wn((x = b[g]).obsSet, u.mutatedParts) && (Pe(P, x), x.subscribers.forEach(function(E) {
                      return f.add(E);
                    }));
                    else if (0 < y.length) {
                      l.optimisticOps = l.optimisticOps.filter(function(E) {
                        return E.trans !== u;
                      });
                      for (var w = 0, _ = Object.values(l.queries.query); w < _.length; w++) for (var P, x, k, K = 0, O = (P = _[w]).slice(); K < O.length; K++) (x = O[K]).res != null && u.mutatedParts && (c && !x.dirty ? (k = Object.isFrozen(x.res), k = yr(x.res, x.req, y, d, x, k), x.dirty ? (Pe(P, x), x.subscribers.forEach(function(E) {
                        return f.add(E);
                      })) : k !== x.res && (x.res = k, x.promise = S.resolve({ result: k }))) : (x.dirty && Pe(P, x), x.subscribers.forEach(function(E) {
                        return f.add(E);
                      })));
                    }
                  }
                }
                f.forEach(function(E) {
                  return E();
                });
              }
            };
          }, u.addEventListener("abort", i(!1), { signal: a }), u.addEventListener("error", i(!1), { signal: a }), u.addEventListener("complete", i(!0), { signal: a })), u;
        }, table: function(n) {
          var r = e.table(n), i = r.schema.primaryKey;
          return A(A({}, r), { mutate: function(o) {
            var a = j.trans;
            if (i.outbound || a.db._options.cache === "disabled" || a.explicit || a.idbtrans.mode !== "readwrite") return r.mutate(o);
            var u = Ie["idb://".concat(t, "/").concat(n)];
            return u ? (a = r.mutate(o), o.type !== "add" && o.type !== "put" || !(50 <= o.values.length || Kn(i, o).some(function(c) {
              return c == null;
            })) ? (u.optimisticOps.push(o), o.mutatedParts && Bt(o.mutatedParts), a.then(function(c) {
              0 < c.numFailures && (Pe(u.optimisticOps, o), (c = pr(0, o, c)) && u.optimisticOps.push(c), o.mutatedParts && Bt(o.mutatedParts));
            }), a.catch(function() {
              Pe(u.optimisticOps, o), o.mutatedParts && Bt(o.mutatedParts);
            })) : a.then(function(c) {
              var f = pr(0, A(A({}, o), { values: o.values.map(function(p, s) {
                var v;
                return c.failures[s] ? p : (p = (v = i.keyPath) !== null && v !== void 0 && v.includes(".") ? Oe(p) : A({}, p), ie(p, i.keyPath, c.results[s]), p);
              }) }), c);
              u.optimisticOps.push(f), queueMicrotask(function() {
                return o.mutatedParts && Bt(o.mutatedParts);
              });
            }), a) : r.mutate(o);
          }, query: function(o) {
            if (!hr(j, r) || !dr("query", o)) return r.query(o);
            var a = ((f = j.trans) === null || f === void 0 ? void 0 : f.db._options.cache) === "immutable", s = j, u = s.requery, c = s.signal, f = function(d, y, h, m) {
              var g = Ie["idb://".concat(d, "/").concat(y)];
              if (!g) return [];
              if (!(y = g.queries[h])) return [null, !1, g, null];
              var b = y[(m.query ? m.query.index.name : null) || ""];
              if (!b) return [null, !1, g, null];
              switch (h) {
                case "query":
                  var w = b.find(function(_) {
                    return _.req.limit === m.limit && _.req.values === m.values && vr(_.req.query.range, m.query.range);
                  });
                  return w ? [w, !0, g, b] : [b.find(function(_) {
                    return ("limit" in _.req ? _.req.limit : 1 / 0) >= m.limit && (!m.values || _.req.values) && ti(_.req.query.range, m.query.range);
                  }), !1, g, b];
                case "count":
                  return w = b.find(function(_) {
                    return vr(_.req.query.range, m.query.range);
                  }), [w, !!w, g, b];
              }
            }(t, n, "query", o), p = f[0], s = f[1], v = f[2], l = f[3];
            return p && s ? p.obsSet = o.obsSet : (s = r.query(o).then(function(d) {
              var y = d.result;
              if (p && (p.res = y), a) {
                for (var h = 0, m = y.length; h < m; ++h) Object.freeze(y[h]);
                Object.freeze(y);
              } else d.result = Oe(y);
              return d;
            }).catch(function(d) {
              return l && p && Pe(l, p), Promise.reject(d);
            }), p = { obsSet: o.obsSet, promise: s, subscribers: /* @__PURE__ */ new Set(), type: "query", req: o, dirty: !1 }, l ? l.push(p) : (l = [p], (v = v || (Ie["idb://".concat(t, "/").concat(n)] = { queries: { query: {}, count: {} }, objs: /* @__PURE__ */ new Map(), optimisticOps: [], unsignaledParts: {} })).queries.query[o.query.index.name || ""] = l)), ni(p, l, u, c), p.promise.then(function(d) {
              return { result: yr(d.result, o, v?.optimisticOps, r, p, a) };
            });
          } });
        } });
      } };
      function Ft(e, t) {
        return new Proxy(e, { get: function(n, r, i) {
          return r === "db" ? t : Reflect.get(n, r, i);
        } });
      }
      var pe = (W.prototype.version = function(e) {
        if (isNaN(e) || e < 0.1) throw new C.Type("Given version is not a positive number");
        if (e = Math.round(10 * e) / 10, this.idbdb || this._state.isBeingOpened) throw new C.Schema("Cannot add version when database is open");
        this.verno = Math.max(this.verno, e);
        var t = this._versions, n = t.filter(function(r) {
          return r._cfg.version === e;
        })[0];
        return n || (n = new this.Version(e), t.push(n), t.sort(Wr), n.stores({}), this._state.autoSchema = !1, n);
      }, W.prototype._whenReady = function(e) {
        var t = this;
        return this.idbdb && (this._state.openComplete || j.letThrough || this._vip) ? e() : new S(function(n, r) {
          if (t._state.openComplete) return r(new C.DatabaseClosed(t._state.dbOpenError));
          if (!t._state.isBeingOpened) {
            if (!t._state.autoOpen) return void r(new C.DatabaseClosed());
            t.open().catch(M);
          }
          t._state.dbReadyPromise.then(n, r);
        }).then(e);
      }, W.prototype.use = function(e) {
        var t = e.stack, n = e.create, r = e.level, i = e.name;
        return i && this.unuse({ stack: t, name: i }), e = this._middlewares[t] || (this._middlewares[t] = []), e.push({ stack: t, create: n, level: r ?? 10, name: i }), e.sort(function(o, a) {
          return o.level - a.level;
        }), this;
      }, W.prototype.unuse = function(e) {
        var t = e.stack, n = e.name, r = e.create;
        return t && this._middlewares[t] && (this._middlewares[t] = this._middlewares[t].filter(function(i) {
          return r ? i.create !== r : !!n && i.name !== n;
        })), this;
      }, W.prototype.open = function() {
        var e = this;
        return Ce(ve, function() {
          return Qr(e);
        });
      }, W.prototype._close = function() {
        var e = this._state, t = We.indexOf(this);
        if (0 <= t && We.splice(t, 1), this.idbdb) {
          try {
            this.idbdb.close();
          } catch {
          }
          this.idbdb = null;
        }
        e.isBeingOpened || (e.dbReadyPromise = new S(function(n) {
          e.dbReadyResolve = n;
        }), e.openCanceller = new S(function(n, r) {
          e.cancelOpen = r;
        }));
      }, W.prototype.close = function(n) {
        var t = (n === void 0 ? { disableAutoOpen: !0 } : n).disableAutoOpen, n = this._state;
        t ? (n.isBeingOpened && n.cancelOpen(new C.DatabaseClosed()), this._close(), n.autoOpen = !1, n.dbOpenError = new C.DatabaseClosed()) : (this._close(), n.autoOpen = this._options.autoOpen || n.isBeingOpened, n.openComplete = !1, n.dbOpenError = null);
      }, W.prototype.delete = function(e) {
        var t = this;
        e === void 0 && (e = { disableAutoOpen: !0 });
        var n = 0 < arguments.length && typeof arguments[0] != "object", r = this._state;
        return new S(function(i, o) {
          function a() {
            t.close(e);
            var u = t._deps.indexedDB.deleteDatabase(t.name);
            u.onsuccess = U(function() {
              var c, f, p;
              c = t._deps, f = t.name, p = c.indexedDB, c = c.IDBKeyRange, mn(p) || f === kt || vn(p, c).delete(f).catch(M), i();
            }), u.onerror = ce(o), u.onblocked = t._fireOnBlocked;
          }
          if (n) throw new C.InvalidArgument("Invalid closeOptions argument to db.delete()");
          r.isBeingOpened ? r.dbReadyPromise.then(a) : a();
        });
      }, W.prototype.backendDB = function() {
        return this.idbdb;
      }, W.prototype.isOpen = function() {
        return this.idbdb !== null;
      }, W.prototype.hasBeenClosed = function() {
        var e = this._state.dbOpenError;
        return e && e.name === "DatabaseClosed";
      }, W.prototype.hasFailed = function() {
        return this._state.dbOpenError !== null;
      }, W.prototype.dynamicallyOpened = function() {
        return this._state.autoSchema;
      }, Object.defineProperty(W.prototype, "tables", { get: function() {
        var e = this;
        return H(this._allTables).map(function(t) {
          return e._allTables[t];
        });
      }, enumerable: !1, configurable: !0 }), W.prototype.transaction = function() {
        var e = function(t, n, r) {
          var i = arguments.length;
          if (i < 2) throw new C.InvalidArgument("Too few arguments");
          for (var o = new Array(i - 1); --i; ) o[i - 1] = arguments[i];
          return r = o.pop(), [t, Bn(o), r];
        }.apply(this, arguments);
        return this._transaction.apply(this, e);
      }, W.prototype._transaction = function(e, t, n) {
        var r = this, i = j.trans;
        i && i.db === this && e.indexOf("!") === -1 || (i = null);
        var o, a, u = e.indexOf("?") !== -1;
        e = e.replace("!", "").replace("?", "");
        try {
          if (a = t.map(function(f) {
            if (f = f instanceof r.Table ? f.name : f, typeof f != "string") throw new TypeError("Invalid table argument to Dexie.transaction(). Only Table or String are allowed");
            return f;
          }), e == "r" || e === rn) o = rn;
          else {
            if (e != "rw" && e != on) throw new C.InvalidArgument("Invalid transaction mode: " + e);
            o = on;
          }
          if (i) {
            if (i.mode === rn && o === on) {
              if (!u) throw new C.SubTransaction("Cannot enter a sub-transaction with READWRITE mode when parent transaction is READONLY");
              i = null;
            }
            i && a.forEach(function(f) {
              if (i && i.storeNames.indexOf(f) === -1) {
                if (!u) throw new C.SubTransaction("Table " + f + " not included in parent transaction.");
                i = null;
              }
            }), u && i && !i.active && (i = null);
          }
        } catch (f) {
          return i ? i._promise(null, function(p, s) {
            s(f);
          }) : z(f);
        }
        var c = function f(p, s, v, l, d) {
          return S.resolve().then(function() {
            var y = j.transless || j, h = p._createTransaction(s, v, p._dbSchema, l);
            if (h.explicit = !0, y = { trans: h, transless: y }, l) h.idbtrans = l.idbtrans;
            else try {
              h.create(), h.idbtrans._explicit = !0, p._state.PR1398_maxLoop = 3;
            } catch (b) {
              return b.name === Yt.InvalidState && p.isOpen() && 0 < --p._state.PR1398_maxLoop ? (console.warn("Dexie: Need to reopen db"), p.close({ disableAutoOpen: !1 }), p.open().then(function() {
                return f(p, s, v, null, d);
              })) : z(b);
            }
            var m, g = Wt(d);
            return g && ze(), y = S.follow(function() {
              var b;
              (m = d.call(h, h)) && (g ? (b = ge.bind(null, null), m.then(b, b)) : typeof m.next == "function" && typeof m.throw == "function" && (m = On(m)));
            }, y), (m && typeof m.then == "function" ? S.resolve(m).then(function(b) {
              return h.active ? b : z(new C.PrematureCommit("Transaction committed too early. See http://bit.ly/2kdckMn"));
            }) : y.then(function() {
              return m;
            })).then(function(b) {
              return l && h._resolve(), h._completion.then(function() {
                return b;
              });
            }).catch(function(b) {
              return h._reject(b), z(b);
            });
          });
        }.bind(null, this, o, a, i, n);
        return i ? i._promise(o, c, "lock") : j.trans ? Ce(j.transless, function() {
          return r._whenReady(c);
        }) : this._whenReady(c);
      }, W.prototype.table = function(e) {
        if (!ne(this._allTables, e)) throw new C.InvalidTable("Table ".concat(e, " does not exist"));
        return this._allTables[e];
      }, W);
      function W(e, t) {
        var n = this;
        this._middlewares = {}, this.verno = 0;
        var r = W.dependencies;
        this._options = t = A({ addons: W.addons, autoOpen: !0, indexedDB: r.indexedDB, IDBKeyRange: r.IDBKeyRange, cache: "cloned" }, t), this._deps = { indexedDB: t.indexedDB, IDBKeyRange: t.IDBKeyRange }, r = t.addons, this._dbSchema = {}, this._versions = [], this._storeNames = [], this._allTables = {}, this.idbdb = null, this._novip = this;
        var i, o, a, u, c, f = { dbOpenError: null, isBeingOpened: !1, onReadyBeingFired: null, openComplete: !1, dbReadyResolve: M, dbReadyPromise: null, cancelOpen: M, openCanceller: null, autoSchema: !0, PR1398_maxLoop: 3, autoOpen: t.autoOpen };
        f.dbReadyPromise = new S(function(s) {
          f.dbReadyResolve = s;
        }), f.openCanceller = new S(function(s, v) {
          f.cancelOpen = v;
        }), this._state = f, this.name = e, this.on = rt(this, "populate", "blocked", "versionchange", "close", { ready: [Ht, M] }), this.on.ready.subscribe = Dn(this.on.ready.subscribe, function(s) {
          return function(v, l) {
            W.vip(function() {
              var d, y = n._state;
              y.openComplete ? (y.dbOpenError || S.resolve().then(v), l && s(v)) : y.onReadyBeingFired ? (y.onReadyBeingFired.push(v), l && s(v)) : (s(v), d = n, l || s(function h() {
                d.on.ready.unsubscribe(v), d.on.ready.unsubscribe(h);
              }));
            });
          };
        }), this.Collection = (i = this, it(Mr.prototype, function(m, h) {
          this.db = i;
          var l = Yn, d = null;
          if (h) try {
            l = h();
          } catch (g) {
            d = g;
          }
          var y = m._ctx, h = y.table, m = h.hook.reading.fire;
          this._ctx = { table: h, index: y.index, isPrimKey: !y.index || h.schema.primKey.keyPath && y.index === h.schema.primKey.name, range: l, keysOnly: !1, dir: "next", unique: "", algorithm: null, filter: null, replayFilter: null, justLimit: !0, isMatch: null, offset: 0, limit: 1 / 0, error: d, or: y.or, valueMapper: m !== Je ? m : null };
        })), this.Table = (o = this, it(Xn.prototype, function(s, v, l) {
          this.db = o, this._tx = l, this.name = s, this.schema = v, this.hook = o._allTables[s] ? o._allTables[s].hook : rt(null, { creating: [jr, M], reading: [Ar, Je], updating: [Tr, M], deleting: [Cr, M] });
        })), this.Transaction = (a = this, it(Ur.prototype, function(s, v, l, d, y) {
          var h = this;
          this.db = a, this.mode = s, this.storeNames = v, this.schema = l, this.chromeTransactionDurability = d, this.idbtrans = null, this.on = rt(this, "complete", "error", "abort"), this.parent = y || null, this.active = !0, this._reculock = 0, this._blockedFuncs = [], this._resolve = null, this._reject = null, this._waitingFor = null, this._waitingQueue = null, this._spinCount = 0, this._completion = new S(function(m, g) {
            h._resolve = m, h._reject = g;
          }), this._completion.then(function() {
            h.active = !1, h.on.complete.fire();
          }, function(m) {
            var g = h.active;
            return h.active = !1, h.on.error.fire(m), h.parent ? h.parent._reject(m) : g && h.idbtrans && h.idbtrans.abort(), z(m);
          });
        })), this.Version = (u = this, it(Gr.prototype, function(s) {
          this.db = u, this._cfg = { version: s, storesSource: null, dbschema: {}, tables: {}, contentUpgrade: null };
        })), this.WhereClause = (c = this, it(nr.prototype, function(s, v, l) {
          if (this.db = c, this._ctx = { table: s, index: v === ":id" ? null : v, or: l }, this._cmp = this._ascending = R, this._descending = function(d, y) {
            return R(y, d);
          }, this._max = function(d, y) {
            return 0 < R(d, y) ? d : y;
          }, this._min = function(d, y) {
            return R(d, y) < 0 ? d : y;
          }, this._IDBKeyRange = c._deps.IDBKeyRange, !this._IDBKeyRange) throw new C.MissingAPI();
        })), this.on("versionchange", function(s) {
          0 < s.newVersion ? console.warn("Another connection wants to upgrade database '".concat(n.name, "'. Closing db now to resume the upgrade.")) : console.warn("Another connection wants to delete database '".concat(n.name, "'. Closing db now to resume the delete request.")), n.close({ disableAutoOpen: !1 });
        }), this.on("blocked", function(s) {
          !s.newVersion || s.newVersion < s.oldVersion ? console.warn("Dexie.delete('".concat(n.name, "') was blocked")) : console.warn("Upgrade '".concat(n.name, "' blocked by other connection holding version ").concat(s.oldVersion / 10));
        }), this._maxKey = st(t.IDBKeyRange), this._createTransaction = function(s, v, l, d) {
          return new n.Transaction(s, v, l, n._options.chromeTransactionDurability, d);
        }, this._fireOnBlocked = function(s) {
          n.on("blocked").fire(s), We.filter(function(v) {
            return v.name === n.name && v !== n && !v._state.vcFired;
          }).map(function(v) {
            return v.on("versionchange").fire(s);
          });
        }, this.use(Zr), this.use(ri), this.use(ei), this.use(Xr), this.use(Jr);
        var p = new Proxy(this, { get: function(s, v, l) {
          if (v === "_vip") return !0;
          if (v === "table") return function(y) {
            return Ft(n.table(y), p);
          };
          var d = Reflect.get(s, v, l);
          return d instanceof Xn ? Ft(d, p) : v === "tables" ? d.map(function(y) {
            return Ft(y, p);
          }) : v === "_createTransaction" ? function() {
            return Ft(d.apply(this, arguments), p);
          } : d;
        } });
        this.vip = p, r.forEach(function(s) {
          return s(n);
        });
      }
      var Mt, ue = typeof Symbol < "u" && "observable" in Symbol ? Symbol.observable : "@@observable", ii = (En.prototype.subscribe = function(e, t, n) {
        return this._subscribe(e && typeof e != "function" ? e : { next: e, error: t, complete: n });
      }, En.prototype[ue] = function() {
        return this;
      }, En);
      function En(e) {
        this._subscribe = e;
      }
      try {
        Mt = { indexedDB: X.indexedDB || X.mozIndexedDB || X.webkitIndexedDB || X.msIndexedDB, IDBKeyRange: X.IDBKeyRange || X.webkitIDBKeyRange };
      } catch {
        Mt = { indexedDB: null, IDBKeyRange: null };
      }
      function mr(e) {
        var t, n = !1, r = new ii(function(i) {
          var o = Wt(e), a, u = !1, c = {}, f = {}, p = { get closed() {
            return u;
          }, unsubscribe: function() {
            u || (u = !0, a && a.abort(), s && _e.storagemutated.unsubscribe(l));
          } };
          i.start && i.start(p);
          var s = !1, v = function() {
            return nn(d);
          }, l = function(y) {
            qt(c, y), wn(f, c) && v();
          }, d = function() {
            var y, h, m;
            !u && Mt.indexedDB && (c = {}, y = {}, a && a.abort(), a = new AbortController(), m = function(g) {
              var b = Ve();
              try {
                o && ze();
                var w = me(e, g);
                return w = o ? w.finally(ge) : w;
              } finally {
                b && $e();
              }
            }(h = { subscr: y, signal: a.signal, requery: v, querier: e, trans: null }), Promise.resolve(m).then(function(g) {
              n = !0, t = g, u || h.signal.aborted || (c = {}, function(b) {
                for (var w in b) if (ne(b, w)) return;
                return 1;
              }(f = y) || s || (_e(ut, l), s = !0), nn(function() {
                return !u && i.next && i.next(g);
              }));
            }, function(g) {
              n = !1, ["DatabaseClosedError", "AbortError"].includes(g?.name) || u || nn(function() {
                u || i.error && i.error(g);
              });
            }));
          };
          return setTimeout(v, 0), p;
        });
        return r.hasValue = function() {
          return n;
        }, r.getValue = function() {
          return t;
        }, r;
      }
      var qe = pe;
      function An(e) {
        var t = xe;
        try {
          xe = !0, _e.storagemutated.fire(e), kn(e, !0);
        } finally {
          xe = t;
        }
      }
      Fe(qe, A(A({}, pt), { delete: function(e) {
        return new qe(e, { addons: [] }).delete();
      }, exists: function(e) {
        return new qe(e, { addons: [] }).open().then(function(t) {
          return t.close(), !0;
        }).catch("NoSuchDatabaseError", function() {
          return !1;
        });
      }, getDatabaseNames: function(e) {
        try {
          return t = qe.dependencies, n = t.indexedDB, t = t.IDBKeyRange, (mn(n) ? Promise.resolve(n.databases()).then(function(r) {
            return r.map(function(i) {
              return i.name;
            }).filter(function(i) {
              return i !== kt;
            });
          }) : vn(n, t).toCollection().primaryKeys()).then(e);
        } catch {
          return z(new C.MissingAPI());
        }
        var t, n;
      }, defineClass: function() {
        return function(e) {
          re(this, e);
        };
      }, ignoreTransaction: function(e) {
        return j.trans ? Ce(j.transless, e) : e();
      }, vip: gn, async: function(e) {
        return function() {
          try {
            var t = On(e.apply(this, arguments));
            return t && typeof t.then == "function" ? t : S.resolve(t);
          } catch (n) {
            return z(n);
          }
        };
      }, spawn: function(e, t, n) {
        try {
          var r = On(e.apply(n, t || []));
          return r && typeof r.then == "function" ? r : S.resolve(r);
        } catch (i) {
          return z(i);
        }
      }, currentTransaction: { get: function() {
        return j.trans || null;
      } }, waitFor: function(e, t) {
        return t = S.resolve(typeof e == "function" ? qe.ignoreTransaction(e) : e).timeout(t || 6e4), j.trans ? j.trans.waitFor(t) : t;
      }, Promise: S, debug: { get: function() {
        return se;
      }, set: function(e) {
        Nn(e);
      } }, derive: Me, extend: re, props: Fe, override: Dn, Events: rt, on: _e, liveQuery: mr, extendObservabilitySet: qt, getByKeyPath: fe, setByKeyPath: ie, delByKeyPath: function(e, t) {
        typeof t == "string" ? ie(e, t, void 0) : "length" in t && [].map.call(t, function(n) {
          ie(e, n, void 0);
        });
      }, shallowClone: qn, deepClone: Oe, getObjectDiff: Pn, cmp: R, asap: In, minKey: -1 / 0, addons: [], connections: We, errnames: Yt, dependencies: Mt, cache: Ie, semVer: "4.0.11", version: "4.0.11".split(".").map(function(e) {
        return parseInt(e);
      }).reduce(function(e, t, n) {
        return e + t / Math.pow(10, 2 * n);
      }) })), qe.maxKey = st(qe.dependencies.IDBKeyRange), typeof dispatchEvent < "u" && typeof addEventListener < "u" && (_e(ut, function(e) {
        xe || (e = new CustomEvent(cn, { detail: e }), xe = !0, dispatchEvent(e), xe = !1);
      }), addEventListener(cn, function(e) {
        e = e.detail, xe || An(e);
      }));
      var Ge, xe = !1, gr = function() {
      };
      return typeof BroadcastChannel < "u" && ((gr = function() {
        (Ge = new BroadcastChannel(cn)).onmessage = function(e) {
          return e.data && An(e.data);
        };
      })(), typeof Ge.unref == "function" && Ge.unref(), _e(ut, function(e) {
        xe || Ge.postMessage(e);
      })), typeof addEventListener < "u" && (addEventListener("pagehide", function(e) {
        if (!pe.disableBfCache && e.persisted) {
          se && console.debug("Dexie: handling persisted pagehide"), Ge?.close();
          for (var t = 0, n = We; t < n.length; t++) n[t].close({ disableAutoOpen: !1 });
        }
      }), addEventListener("pageshow", function(e) {
        !pe.disableBfCache && e.persisted && (se && console.debug("Dexie: handling persisted pageshow"), gr(), An({ all: new J(-1 / 0, [[]]) }));
      })), S.rejectionMapper = function(e, t) {
        return !e || e instanceof Le || e instanceof TypeError || e instanceof SyntaxError || !e.name || !Mn[e.name] ? e : (t = new Mn[e.name](t || e.message, e), "stack" in e && ye(t, "stack", { get: function() {
          return this.inner.stack;
        } }), t);
      }, Nn(se), A(pe, Object.freeze({ __proto__: null, Dexie: pe, liveQuery: mr, Entity: Hn, cmp: R, PropModification: ot, replacePrefix: function(e, t) {
        return new ot({ replacePrefix: [e, t] });
      }, add: function(e) {
        return new ot({ add: e });
      }, remove: function(e) {
        return new ot({ remove: e });
      }, default: pe, RangeSet: J, mergeRanges: ft, rangesOverlap: ur }), { default: pe }), pe;
    });
  }(Lt)), Lt.exports;
}
var fi = li();
const Cn = /* @__PURE__ */ si(fi), wr = Symbol.for("Dexie"), Vt = globalThis[wr] || (globalThis[wr] = Cn);
if (Cn.semVer !== Vt.semVer)
  throw new Error(`Two different versions of Dexie loaded in the same app: ${Cn.semVer} and ${Vt.semVer}`);
const {
  liveQuery: vi,
  mergeRanges: mi,
  rangesOverlap: gi,
  RangeSet: bi,
  cmp: wi,
  Entity: _i,
  PropModification: xi,
  replacePrefix: ki,
  add: Oi,
  remove: Pi
} = Vt;
class hi extends Vt {
  settings;
  meta;
  i18n;
  htmlservers;
  servers;
  tags;
  profiles;
  ws_messages;
  constructor() {
    super("AppStorage"), this.version(3).stores({
      settings: "&id",
      meta: "&key",
      i18n: "&key",
      htmlservers: "&key",
      servers: "&server_id",
      tags: "&tag_id",
      profiles: "&profile_id",
      ws_messages: "&key"
    });
  }
}
const N = new hi();
function di(T) {
  return `
		<div class="flex flex-col gap-2 p-2">
			<img src="${T.logo}" alt="${T.name}" class="w-12 h-12 rounded-full" />
			<h3 class="text-lg font-bold">${T.name}</h3>
			<p class="text-sm opacity-70">${T.summary}</p>
			<a href="${T.invite}" class="text-purple-400 underline text-xs">Join Join Join</a>
		</div>
	`.trim();
}
const Ut = {
  // WebSocket
  async storeWsMessage(T, Y) {
    const $ = ai(Y).toObject();
    await N.ws_messages.put({ key: T, message: $ });
  },
  async getWsMessage(T) {
    return (await N.ws_messages.get(T))?.message ?? null;
  },
  async getAllWsMessages() {
    return (await N.ws_messages.toArray()).sort((Y, $) => {
      const A = Number(Y.key.split(":")[1]);
      return Number($.key.split(":")[1]) - A;
    });
  },
  async clearWsMessages() {
    await N.ws_messages.clear();
  },
  // I18n
  async getTranslation(T) {
    return (await N.i18n.get(T))?.value ?? null;
  },
  async getTranslations(T) {
    const Y = {};
    for (const $ of T) {
      const A = await N.i18n.get($);
      A && (Y[$] = A.value);
    }
    return Y;
  },
  async putI18nBatch(T) {
    const Y = Object.entries(T).map(([$, A]) => ({
      key: $,
      value: A
    }));
    await N.i18n.bulkPut(Y);
  },
  async loadI18nFromJSON(T = "https://discord.sh/i18n/db.json") {
    const $ = await (await fetch(T)).json();
    await Ut.putI18nBatch($);
  },
  async getAllI18nKeys() {
    return await N.i18n.toCollection().primaryKeys();
  },
  async loadServersFromJSON(T = "https://discord.sh/data/servers.json") {
    const $ = await (await fetch(T)).json(), A = Object.values($);
    await Ut.putServers(A), await Ut.syncHtmlFromServers();
  },
  // HTML PreRender
  async syncHtmlFromServers() {
    const T = await N.servers.toArray(), Y = await N.htmlservers.toCollection().primaryKeys(), $ = [];
    for (const A of T)
      if (!Y.includes(A.server_id)) {
        const ke = di(A);
        $.push({ key: A.server_id, value: ke });
      }
    $.length > 0 ? (await N.htmlservers.bulkPut($), console.info(`[syncHtmlFromServers] Generated ${$.length} HTML cards.`)) : console.info("[syncHtmlFromServers] All servers already have HTML cards.");
  },
  // Settings
  async dbSet(T, Y) {
    await N.settings.put({ id: T, value: Y });
  },
  async dbGet(T) {
    return (await N.settings.get(T))?.value ?? null;
  },
  async dbClear() {
    await N.settings.clear();
  },
  // Meta
  async setVersion(T) {
    await N.meta.put({ key: "version", value: T });
  },
  async getVersion() {
    return (await N.meta.get("version"))?.value ?? null;
  },
  async markSeeded() {
    await N.meta.put({ key: "db_seeded", value: !0 });
  },
  async checkSeeded() {
    return (await N.meta.get("db_seeded"))?.value === !0;
  },
  // Servers
  async putServers(T) {
    await N.servers.bulkPut(T);
  },
  async getAllServers() {
    return await N.servers.toArray();
  },
  // HTML servers
  async putHtmlCards(T) {
    await N.htmlservers.bulkPut(T);
  },
  async getHtmlCard(T) {
    return (await N.htmlservers.get(T))?.value ?? null;
  },
  // Tags
  async putTags(T) {
    await N.tags.bulkPut(T);
  },
  async getAllTags() {
    return await N.tags.toArray();
  },
  // Profiles
  async putProfiles(T) {
    await N.profiles.bulkPut(T);
  },
  async getAllProfiles() {
    return await N.profiles.toArray();
  }
};
self.onconnect = (T) => {
  const Y = T.ports[0];
  Y.start(), oi(Ut, Y);
};
