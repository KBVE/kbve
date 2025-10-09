import { w as B, p as tt, t as et } from "../comlink-CC72iIUO.js";
import { i as P, u as U, V as d, B as E, f as W, p as st, a as M, t as it, b as H, c as nt, d as ot, e as rt, g as at, h as ft, j as C } from "../reference-Dk_1njEH.js";
import { z as y } from "../index-CsrTWP6J.js";
let F = Symbol("clean"), k = [], ct = (e, t) => {
  let s = [], i = {
    get() {
      return i.lc || i.listen(() => {
      })(), i.value;
    },
    l: 0,
    lc: 0,
    listen(n, o) {
      return i.lc = s.push(n, o || i.l) / 2, () => {
        let r = s.indexOf(n);
        ~r && (s.splice(r, 2), --i.lc || i.off());
      };
    },
    notify(n) {
      let o = !k.length;
      for (let r = 0; r < s.length; r += 2)
        k.push(
          s[r],
          s[r + 1],
          i.value,
          n
        );
      if (o) {
        for (let r = 0; r < k.length; r += 4) {
          let h;
          for (let l = r + 1; !h && (l += 4) < k.length; )
            k[l] < k[r + 1] && (h = k.push(
              k[r],
              k[r + 1],
              k[r + 2],
              k[r + 3]
            ));
          h || k[r](k[r + 2], k[r + 3]);
        }
        k.length = 0;
      }
    },
    off() {
    },
    /* It will be called on last listener unsubscribing.
       We will redefine it in onMount and onStop. */
    set(n) {
      i.value !== n && (i.value = n, i.notify());
    },
    subscribe(n, o) {
      let r = i.listen(n, o);
      return n(i.value), r;
    },
    value: e
  };
  return process.env.NODE_ENV !== "production" && (i[F] = () => {
    s = [], i.lc = 0, i.off();
  }), i;
};
const lt = 5, S = 6, D = 10;
let ht = (e, t, s, i) => (e.events = e.events || {}, e.events[s + D] || (e.events[s + D] = i((n) => {
  e.events[s].reduceRight((o, r) => (r(o), o), {
    shared: {},
    ...n
  });
})), e.events[s] = e.events[s] || [], e.events[s].push(t), () => {
  let n = e.events[s], o = n.indexOf(t);
  n.splice(o, 1), n.length || (delete e.events[s], e.events[s + D](), delete e.events[s + D]);
}), dt = 1e3, ut = (e, t) => ht(e, (i) => {
  let n = t(i);
  n && e.events[S].push(n);
}, lt, (i) => {
  let n = e.listen;
  e.listen = (...r) => (!e.lc && !e.active && (e.active = !0, i()), n(...r));
  let o = e.off;
  if (e.events[S] = [], e.off = () => {
    o(), setTimeout(() => {
      if (e.active && !e.lc) {
        e.active = !1;
        for (let r of e.events[S]) r();
        e.events[S] = [];
      }
    }, dt);
  }, process.env.NODE_ENV !== "production") {
    let r = e[F];
    e[F] = () => {
      for (let h of e.events[S]) h();
      e.events[S] = [], e.active = !1, r();
    };
  }
  return () => {
    e.listen = n, e.off = o;
  };
}), pt = (e = {}) => {
  let t = ct(e);
  return t.setKey = function(s, i) {
    typeof i > "u" ? s in t.value && (t.value = { ...t.value }, delete t.value[s], t.notify(s)) : t.value[s] !== i && (t.value = {
      ...t.value,
      [s]: i
    }, t.notify(s));
  }, t;
}, _ = (e) => e, A = {}, b = { addEventListener() {
}, removeEventListener() {
} };
function wt() {
  try {
    return typeof localStorage < "u";
  } catch {
    return !1;
  }
}
wt() && (A = localStorage);
let yt = {
  addEventListener(e, t, s) {
    window.addEventListener("storage", t), window.addEventListener("pageshow", s);
  },
  removeEventListener(e, t, s) {
    window.removeEventListener("storage", t), window.removeEventListener("pageshow", s);
  }
};
typeof window < "u" && (b = yt);
function z(e, t = {}, s = {}) {
  let i = s.encode || _, n = s.decode || _, o = pt(), r = o.setKey;
  o.setKey = (a, f) => {
    typeof f > "u" ? (s.listen !== !1 && b.perKey && b.removeEventListener(e + a, l, u), delete A[e + a]) : (s.listen !== !1 && b.perKey && !(a in o.value) && b.addEventListener(e + a, l, u), A[e + a] = i(f)), r(a, f);
  };
  let h = o.set;
  o.set = function(a) {
    for (let f in a)
      o.setKey(f, a[f]);
    for (let f in o.value)
      f in a || o.setKey(f);
  };
  function l(a) {
    a.key ? a.key.startsWith(e) && (a.newValue === null ? r(a.key.slice(e.length), void 0) : r(a.key.slice(e.length), n(a.newValue))) : h({});
  }
  function u() {
    let a = { ...t };
    for (let f in A)
      f.startsWith(e) && (a[f.slice(e.length)] = n(A[f]));
    o.set(a);
  }
  return ut(o, () => {
    if (u(), s.listen !== !1)
      return b.addEventListener(e, l, u), () => {
        b.removeEventListener(e, l, u);
        for (let a in o.value)
          b.removeEventListener(e + a, l, u);
      };
  }), o;
}
async function kt(e, {
  version: t,
  i18nPath: s = "https://discord.sh/i18n/db.json",
  locale: i = "en",
  defaults: n = {
    welcome: "Welcome to the app!"
  }
}) {
  console.log("[init-worker] Initializing database...");
  try {
    await e.loadI18nFromJSON(s), console.log(`[init-worker] i18n loaded from ${s}`), await e.dbSet("locale", i);
    for (const [o, r] of Object.entries(n))
      await e.dbSet(o, r);
    await e.setVersion(t), e.loadServersFromJSON(), console.log(`[init-worker] DB initialized to version ${t}`);
  } catch (o) {
    console.error("[init-worker] Initialization failed:", o);
  }
}
let R = null;
async function gt(e) {
  if (R) return R;
  const t = {};
  async function s(r) {
    const h = e?.(r) ?? r, l = new Worker(h, { type: "module" }), u = B(l), a = await u.getMeta?.() ?? {
      name: "unknown",
      version: "0.0.1"
    }, f = `${a.name}@${a.version}`;
    console.log(`[mod-manager] ${f} is loaded.`);
    const c = { id: f, worker: l, instance: u, meta: a, url: r };
    return t[f] = c, c;
  }
  function i(r) {
    t[r] && (t[r].worker.terminate(), delete t[r]);
  }
  function n() {
    return Object.values(t).map((r) => r.meta);
  }
  async function o(r) {
    const h = t[r];
    if (!h) throw new Error(`Mod "${r}" not found`);
    return i(r), s(h.url);
  }
  return R = {
    registry: t,
    load: s,
    unload: i,
    list: n,
    reload: o
  }, R;
}
var O = /* @__PURE__ */ ((e) => (e[e.PAYLOAD_UNKNOWN = 0] = "PAYLOAD_UNKNOWN", e[e.JSON = 1] = "JSON", e[e.FLEX = 2] = "FLEX", e[e.PROTOBUF = 3] = "PROTOBUF", e[e.FLATBUFFER = 4] = "FLATBUFFER", e))(O || {}), g = /* @__PURE__ */ ((e) => (e[e.UNKNOWN = 0] = "UNKNOWN", e[e.ADD = 1] = "ADD", e[e.READ = 2] = "READ", e[e.GET = 4] = "GET", e[e.SET = 8] = "SET", e[e.DEL = 16] = "DEL", e[e.STREAM = 32] = "STREAM", e[e.GROUP = 64] = "GROUP", e[e.LIST = 128] = "LIST", e[e.ACTION = 256] = "ACTION", e[e.MESSAGE = 512] = "MESSAGE", e[e.INFO = 1024] = "INFO", e[e.DEBUG = 2048] = "DEBUG", e[e.ERROR = 4096] = "ERROR", e[e.AUTH = 8192] = "AUTH", e[e.HEARTBEAT = 16384] = "HEARTBEAT", e[e.CONFIG_UPDATE = 32768] = "CONFIG_UPDATE", e[e.REDIS = 65536] = "REDIS", e[e.SUPABASE = 131072] = "SUPABASE", e[e.FILESYSTEM = 262144] = "FILESYSTEM", e[e.WEBSOCKET = 524288] = "WEBSOCKET", e[e.HTTP_API = 1048576] = "HTTP_API", e[e.LOCAL_CACHE = 2097152] = "LOCAL_CACHE", e[e.AI = 4194304] = "AI", e))(g || {});
class T {
  constructor(t, s, i, n = null, o = 0) {
    this.builder = t, this.type = s, this.width = i, this.value = n, this.offset = o;
  }
  elementWidth(t, s) {
    if (P(this.type)) return this.width;
    for (let i = 0; i < 4; i++) {
      const n = 1 << i, r = t + M(t, n) + s * n - this.offset, h = U(r);
      if (1 << h === n)
        return h;
    }
    throw `Element is unknown. Size: ${t} at index: ${s}. This might be a bug. Please create an issue https://github.com/google/flatbuffers/issues/new`;
  }
  writeToBuffer(t) {
    const s = this.builder.computeOffset(t);
    if (this.type === d.FLOAT)
      this.width === E.WIDTH32 ? this.builder.view.setFloat32(this.builder.offset, this.value, !0) : this.builder.view.setFloat64(this.builder.offset, this.value, !0);
    else if (this.type === d.INT) {
      const i = W(t);
      this.builder.pushInt(this.value, i);
    } else if (this.type === d.UINT) {
      const i = W(t);
      this.builder.pushUInt(this.value, i);
    } else if (this.type === d.NULL)
      this.builder.pushInt(0, this.width);
    else if (this.type === d.BOOL)
      this.builder.pushInt(this.value ? 1 : 0, this.width);
    else
      throw `Unexpected type: ${this.type}. This might be a bug. Please create an issue https://github.com/google/flatbuffers/issues/new`;
    this.offset = s;
  }
  storedWidth(t = E.WIDTH8) {
    return P(this.type) ? Math.max(t, this.width) : this.width;
  }
  storedPackedType(t = E.WIDTH8) {
    return st(this.type, this.storedWidth(t));
  }
  isOffset() {
    return !P(this.type);
  }
}
class mt {
  constructor(t = 2048, s = !0, i = !0, n = !0) {
    this.dedupStrings = s, this.dedupKeys = i, this.dedupKeyVectors = n, this.stack = [], this.stackPointers = [], this.offset = 0, this.finished = !1, this.stringLookup = {}, this.keyLookup = {}, this.keyVectorLookup = {}, this.indirectIntLookup = {}, this.indirectUIntLookup = {}, this.indirectFloatLookup = {}, this.buffer = new ArrayBuffer(t > 0 ? t : 2048), this.view = new DataView(this.buffer);
  }
  align(t) {
    const s = it(t);
    return this.offset += M(this.offset, s), s;
  }
  computeOffset(t) {
    const s = this.offset + t;
    let i = this.buffer.byteLength;
    const n = i;
    for (; i < s; )
      i <<= 1;
    if (n < i) {
      const o = this.buffer;
      this.buffer = new ArrayBuffer(i), this.view = new DataView(this.buffer), new Uint8Array(this.buffer).set(new Uint8Array(o), 0);
    }
    return s;
  }
  pushInt(t, s) {
    if (s === E.WIDTH8)
      this.view.setInt8(this.offset, t);
    else if (s === E.WIDTH16)
      this.view.setInt16(this.offset, t, !0);
    else if (s === E.WIDTH32)
      this.view.setInt32(this.offset, t, !0);
    else if (s === E.WIDTH64)
      this.view.setBigInt64(this.offset, BigInt(t), !0);
    else
      throw `Unexpected width: ${s} for value: ${t}`;
  }
  pushUInt(t, s) {
    if (s === E.WIDTH8)
      this.view.setUint8(this.offset, t);
    else if (s === E.WIDTH16)
      this.view.setUint16(this.offset, t, !0);
    else if (s === E.WIDTH32)
      this.view.setUint32(this.offset, t, !0);
    else if (s === E.WIDTH64)
      this.view.setBigUint64(this.offset, BigInt(t), !0);
    else
      throw `Unexpected width: ${s} for value: ${t}`;
  }
  writeInt(t, s) {
    const i = this.computeOffset(s);
    this.pushInt(t, W(s)), this.offset = i;
  }
  writeUInt(t, s) {
    const i = this.computeOffset(s);
    this.pushUInt(t, W(s)), this.offset = i;
  }
  writeBlob(t) {
    const s = t.byteLength, i = U(s), n = this.align(i);
    this.writeUInt(s, n);
    const o = this.offset, r = this.computeOffset(s);
    new Uint8Array(this.buffer).set(new Uint8Array(t), o), this.stack.push(this.offsetStackValue(o, d.BLOB, i)), this.offset = r;
  }
  writeString(t) {
    if (this.dedupStrings && Object.prototype.hasOwnProperty.call(this.stringLookup, t)) {
      this.stack.push(this.stringLookup[t]);
      return;
    }
    const s = H(t), i = s.length, n = U(i), o = this.align(n);
    this.writeUInt(i, o);
    const r = this.offset, h = this.computeOffset(i + 1);
    new Uint8Array(this.buffer).set(s, r);
    const l = this.offsetStackValue(r, d.STRING, n);
    this.stack.push(l), this.dedupStrings && (this.stringLookup[t] = l), this.offset = h;
  }
  writeKey(t) {
    if (this.dedupKeys && Object.prototype.hasOwnProperty.call(this.keyLookup, t)) {
      this.stack.push(this.keyLookup[t]);
      return;
    }
    const s = H(t), i = s.length, n = this.computeOffset(i + 1);
    new Uint8Array(this.buffer).set(s, this.offset);
    const o = this.offsetStackValue(this.offset, d.KEY, E.WIDTH8);
    this.stack.push(o), this.dedupKeys && (this.keyLookup[t] = o), this.offset = n;
  }
  writeStackValue(t, s) {
    const i = this.computeOffset(s);
    if (t.isOffset()) {
      const n = this.offset - t.offset;
      if (s === 8 || BigInt(n) < BigInt(1) << BigInt(s * 8))
        this.writeUInt(n, s);
      else
        throw `Unexpected size ${s}. This might be a bug. Please create an issue https://github.com/google/flatbuffers/issues/new`;
    } else
      t.writeToBuffer(s);
    this.offset = i;
  }
  integrityCheckOnValueAddition() {
    if (this.finished)
      throw "Adding values after finish is prohibited";
    if (this.stackPointers.length !== 0 && this.stackPointers[this.stackPointers.length - 1].isVector === !1 && this.stack[this.stack.length - 1].type !== d.KEY)
      throw "Adding value to a map before adding a key is prohibited";
  }
  integrityCheckOnKeyAddition() {
    if (this.finished)
      throw "Adding values after finish is prohibited";
    if (this.stackPointers.length === 0 || this.stackPointers[this.stackPointers.length - 1].isVector)
      throw "Adding key before starting a map is prohibited";
  }
  startVector() {
    this.stackPointers.push({ stackPosition: this.stack.length, isVector: !0 });
  }
  startMap(t = !1) {
    this.stackPointers.push({ stackPosition: this.stack.length, isVector: !1, presorted: t });
  }
  endVector(t) {
    const s = this.stack.length - t.stackPosition, i = this.createVector(t.stackPosition, s, 1);
    this.stack.splice(t.stackPosition, s), this.stack.push(i);
  }
  endMap(t) {
    t.presorted || this.sort(t);
    let s = "";
    for (let r = t.stackPosition; r < this.stack.length; r += 2)
      s += `,${this.stack[r].offset}`;
    const i = this.stack.length - t.stackPosition >> 1;
    this.dedupKeyVectors && !Object.prototype.hasOwnProperty.call(this.keyVectorLookup, s) && (this.keyVectorLookup[s] = this.createVector(t.stackPosition, i, 2));
    const n = this.dedupKeyVectors ? this.keyVectorLookup[s] : this.createVector(t.stackPosition, i, 2), o = this.createVector(t.stackPosition + 1, i, 2, n);
    this.stack.splice(t.stackPosition, i << 1), this.stack.push(o);
  }
  sort(t) {
    const s = this.view, i = this.stack;
    function n(a, f) {
      if (a.type !== d.KEY || f.type !== d.KEY)
        throw `Stack values are not keys ${a} | ${f}. Check if you combined [addKey] with add... method calls properly.`;
      let c, p, w = 0;
      do {
        if (c = s.getUint8(a.offset + w), p = s.getUint8(f.offset + w), p < c) return !0;
        if (c < p) return !1;
        w += 1;
      } while (c !== 0 && p !== 0);
      return !1;
    }
    function o(a, f, c) {
      if (f === c) return;
      const p = a[f], w = a[f + 1];
      a[f] = a[c], a[f + 1] = a[c + 1], a[c] = p, a[c + 1] = w;
    }
    function r() {
      for (let a = t.stackPosition; a < i.length; a += 2) {
        let f = a;
        for (let c = a + 2; c < i.length; c += 2)
          n(i[f], i[c]) && (f = c);
        f !== a && o(i, f, a);
      }
    }
    function h(a, f) {
      if (a.type !== d.KEY || f.type !== d.KEY)
        throw `Stack values are not keys ${a} | ${f}. Check if you combined [addKey] with add... method calls properly.`;
      if (a.offset === f.offset)
        return !1;
      let c, p, w = 0;
      do {
        if (c = s.getUint8(a.offset + w), p = s.getUint8(f.offset + w), c < p) return !0;
        if (p < c) return !1;
        w += 1;
      } while (c !== 0 && p !== 0);
      return !1;
    }
    function l(a, f) {
      if (a < f) {
        const c = a + (f - a >> 2) * 2, p = i[c];
        let w = a, v = f;
        do {
          for (; h(i[w], p); )
            w += 2;
          for (; h(p, i[v]); )
            v -= 2;
          w <= v && (o(i, w, v), w += 2, v -= 2);
        } while (w <= v);
        l(a, v), l(w, f);
      }
    }
    let u = !0;
    for (let a = t.stackPosition; a < this.stack.length - 2; a += 2)
      if (n(this.stack[a], this.stack[a + 2])) {
        u = !1;
        break;
      }
    u || (this.stack.length - t.stackPosition > 40 ? l(t.stackPosition, this.stack.length - 2) : r());
  }
  end() {
    if (this.stackPointers.length < 1) return;
    const t = this.stackPointers.pop();
    t.isVector ? this.endVector(t) : this.endMap(t);
  }
  createVector(t, s, i, n = null) {
    let o = U(s), r = 1;
    if (n !== null) {
      const c = n.elementWidth(this.offset, 0);
      c > o && (o = c), r += 2;
    }
    let h = d.KEY, l = n === null;
    for (let c = t; c < this.stack.length; c += i) {
      const p = this.stack[c].elementWidth(this.offset, c + r);
      p > o && (o = p), c === t ? (h = this.stack[c].type, l = l && nt(h)) : h !== this.stack[c].type && (l = !1);
    }
    const u = this.align(o), a = l && ot(h) && s >= 2 && s <= 4;
    n !== null && (this.writeStackValue(n, u), this.writeUInt(1 << n.width, u)), a || this.writeUInt(s, u);
    const f = this.offset;
    for (let c = t; c < this.stack.length; c += i)
      this.writeStackValue(this.stack[c], u);
    if (!l)
      for (let c = t; c < this.stack.length; c += i)
        this.writeUInt(this.stack[c].storedPackedType(), 1);
    if (n !== null)
      return this.offsetStackValue(f, d.MAP, o);
    if (l) {
      const c = rt(h, a ? s : 0);
      return this.offsetStackValue(f, c, o);
    }
    return this.offsetStackValue(f, d.VECTOR, o);
  }
  nullStackValue() {
    return new T(this, d.NULL, E.WIDTH8);
  }
  boolStackValue(t) {
    return new T(this, d.BOOL, E.WIDTH8, t);
  }
  intStackValue(t) {
    return new T(this, d.INT, at(t), t);
  }
  uintStackValue(t) {
    return new T(this, d.UINT, U(t), t);
  }
  floatStackValue(t) {
    return new T(this, d.FLOAT, ft(t), t);
  }
  offsetStackValue(t, s, i) {
    return new T(this, s, i, null, t);
  }
  finishBuffer() {
    if (this.stack.length !== 1)
      throw `Stack has to be exactly 1, but it is ${this.stack.length}. You have to end all started vectors and maps before calling [finish]`;
    const t = this.stack[0], s = this.align(t.elementWidth(this.offset, 0));
    this.writeStackValue(t, s), this.writeUInt(t.storedPackedType(), 1), this.writeUInt(s, 1), this.finished = !0;
  }
  add(t) {
    if (this.integrityCheckOnValueAddition(), typeof t > "u")
      throw "You need to provide a value";
    if (t === null)
      this.stack.push(this.nullStackValue());
    else if (typeof t == "boolean")
      this.stack.push(this.boolStackValue(t));
    else if (typeof t == "bigint")
      this.stack.push(this.intStackValue(t));
    else if (typeof t == "number")
      Number.isInteger(t) ? this.stack.push(this.intStackValue(t)) : this.stack.push(this.floatStackValue(t));
    else if (ArrayBuffer.isView(t))
      this.writeBlob(t.buffer);
    else if (typeof t == "string" || t instanceof String)
      this.writeString(t);
    else if (Array.isArray(t)) {
      this.startVector();
      for (let s = 0; s < t.length; s++)
        this.add(t[s]);
      this.end();
    } else if (typeof t == "object") {
      const s = Object.getOwnPropertyNames(t).sort();
      this.startMap(!0);
      for (let i = 0; i < s.length; i++) {
        const n = s[i];
        this.addKey(n), this.add(t[n]);
      }
      this.end();
    } else
      throw `Unexpected value input ${t}`;
  }
  finish() {
    this.finished || this.finishBuffer();
    const t = this.buffer.slice(0, this.offset);
    return new Uint8Array(t);
  }
  isFinished() {
    return this.finished;
  }
  addKey(t) {
    this.integrityCheckOnKeyAddition(), this.writeKey(t);
  }
  addInt(t, s = !1, i = !1) {
    if (this.integrityCheckOnValueAddition(), !s) {
      this.stack.push(this.intStackValue(t));
      return;
    }
    if (i && Object.prototype.hasOwnProperty.call(this.indirectIntLookup, t)) {
      this.stack.push(this.indirectIntLookup[t]);
      return;
    }
    const n = this.intStackValue(t), o = this.align(n.width), r = this.computeOffset(o), h = this.offset;
    n.writeToBuffer(o);
    const l = this.offsetStackValue(h, d.INDIRECT_INT, n.width);
    this.stack.push(l), this.offset = r, i && (this.indirectIntLookup[t] = l);
  }
  addUInt(t, s = !1, i = !1) {
    if (this.integrityCheckOnValueAddition(), !s) {
      this.stack.push(this.uintStackValue(t));
      return;
    }
    if (i && Object.prototype.hasOwnProperty.call(this.indirectUIntLookup, t)) {
      this.stack.push(this.indirectUIntLookup[t]);
      return;
    }
    const n = this.uintStackValue(t), o = this.align(n.width), r = this.computeOffset(o), h = this.offset;
    n.writeToBuffer(o);
    const l = this.offsetStackValue(h, d.INDIRECT_UINT, n.width);
    this.stack.push(l), this.offset = r, i && (this.indirectUIntLookup[t] = l);
  }
  addFloat(t, s = !1, i = !1) {
    if (this.integrityCheckOnValueAddition(), !s) {
      this.stack.push(this.floatStackValue(t));
      return;
    }
    if (i && Object.prototype.hasOwnProperty.call(this.indirectFloatLookup, t)) {
      this.stack.push(this.indirectFloatLookup[t]);
      return;
    }
    const n = this.floatStackValue(t), o = this.align(n.width), r = this.computeOffset(o), h = this.offset;
    n.writeToBuffer(o);
    const l = this.offsetStackValue(h, d.INDIRECT_FLOAT, n.width);
    this.stack.push(l), this.offset = r, i && (this.indirectFloatLookup[t] = l);
  }
}
function N() {
  return new mt();
}
function Et(e) {
  const t = N();
  t.startMap();
  for (const [s, i] of Object.entries(e))
    t.addKey(s), t.add(i);
  return t.end(), t.finish();
}
function V(e, t, s, i, n = 1) {
  let o;
  if (s === O.FLEX)
    o = Et(e);
  else if (s === O.JSON)
    o = new TextEncoder().encode(JSON.stringify(e));
  else
    throw new Error("Unsupported format for wrapEnvelope");
  const r = N();
  return r.startMap(), r.addKey("version"), r.add(n), r.addKey("kind"), r.add(t), r.addKey("format"), r.add(s), r.addKey("payload"), r.add(o), r.addKey("metadata"), r.add(i ?? new Uint8Array()), r.end(), r.finish();
}
function X(e) {
  const t = e instanceof Uint8Array ? e : new Uint8Array(e), s = C(t.buffer).toObject();
  if (typeof s.version != "number" || typeof s.kind != "number" || typeof s.format != "number" || !s.payload)
    throw console.error("[unwrapEnvelope] Bad root:", s), new Error("[unwrapEnvelope] Invalid envelope structure");
  const i = {
    version: s.version,
    kind: s.kind,
    format: s.format,
    payload: new Uint8Array(s.payload),
    metadata: s.metadata ? new Uint8Array(s.metadata) : void 0
  };
  let n;
  if (i.format === O.FLEX)
    n = C(i.payload.buffer).toObject();
  else if (i.format === O.JSON)
    n = JSON.parse(new TextDecoder().decode(i.payload));
  else
    throw new Error(`[unwrapEnvelope] Unsupported format: ${i.format}`);
  return { envelope: i, payload: n };
}
function $(e) {
  return C(e.buffer).toObject();
}
function Ot(e) {
  try {
    const t = e instanceof Uint8Array ? e : new Uint8Array(e), s = $(t);
    console.log("[FlexObject]", JSON.stringify(s, null, 2));
  } catch (t) {
    console.error("[Flex Decode Error]", t);
  }
}
function q(e, t) {
  return (e & t) === t;
}
function bt(e, t) {
  return V(
    { key: e, value: t },
    g.SET | g.REDIS,
    O.FLEX
  );
}
function vt(e) {
  return V(
    { key: e },
    g.GET | g.REDIS,
    O.FLEX
  );
}
function St(e) {
  return V(
    { key: e },
    g.DEL | g.REDIS,
    O.FLEX
  );
}
function Tt(e) {
  const t = X(e);
  if (!q(t.envelope.kind, g.REDIS))
    throw new Error("[Redis] Not a Redis envelope");
  return t;
}
function It(e, t, s = "*") {
  return V(
    { stream: e, id: s, fields: t },
    g.ADD | g.STREAM | g.REDIS,
    O.FLEX
  );
}
function Lt(e, t, s) {
  const i = N();
  i.startMap(), i.addKey("streams"), i.startVector();
  for (const { stream: r, id: h } of e)
    i.startMap(), i.addKey("stream"), i.add(r), i.addKey("id"), i.add(h), i.end();
  i.end(), t !== void 0 && (i.addKey("count"), i.add(t)), s !== void 0 && (i.addKey("block"), i.add(s)), i.end();
  const n = i.finish(), o = N();
  return o.startMap(), o.addKey("version"), o.add(1), o.addKey("kind"), o.add(g.READ | g.STREAM | g.REDIS), o.addKey("format"), o.add(O.FLEX), o.addKey("payload"), o.add(n), o.addKey("metadata"), o.add(new Uint8Array()), o.end(), o.finish();
}
const Ut = {
  wrapEnvelope: V,
  unwrapEnvelope: X,
  MessageKind: g,
  PayloadFormat: O,
  unwrapFlexToJson: $,
  inspectFlex: Ot,
  hasKind: q,
  redis: {
    wrapRedisSet: bt,
    wrapRedisGet: vt,
    wrapRedisDel: St,
    wrapRedisXAdd: It,
    wrapRedisXRead: Lt,
    parseRedisPayload: Tt
  }
};
function Q(e) {
  typeof queueMicrotask == "function" ? queueMicrotask(e) : setTimeout(e, 0);
}
function Z(e) {
  const t = document.createElement(e.tag);
  if (e.class && (t.className = e.class), e.attrs)
    for (const [s, i] of Object.entries(e.attrs))
      if (typeof i == "function" && s.startsWith("on"))
        t.addEventListener(s.slice(2).toLowerCase(), i);
      else if (s === "style" && typeof i == "object")
        Object.assign(t.style, i);
      else if (s === "dataset" && typeof i == "object")
        for (const [n, o] of Object.entries(i))
          t.dataset[n] = String(o);
      else
        try {
          t.setAttribute(s, String(i));
        } catch {
        }
  if (e.style && Object.assign(t.style, e.style), e.children)
    for (const s of e.children) {
      const i = typeof s == "string" ? document.createTextNode(s) : Z(s);
      t.appendChild(i);
    }
  return t;
}
const At = y.enum(["top", "right", "bottom", "left"]), Vt = y.object({
  width: y.number(),
  height: y.number(),
  mode: y.enum(["static", "animated", "dynamic"]).optional()
});
y.object({
  rawHtml: y.string().optional(),
  needsCanvas: y.boolean().optional(),
  canvasOptions: Vt.optional()
});
const Dt = y.object({
  name: y.string(),
  version: y.string().optional()
}), Rt = y.object({
  meta: Dt.optional(),
  timestamp: y.number()
}), x = y.object({
  id: At,
  payload: y.any().optional()
}), Wt = y.object({
  timestamp: y.number()
}), Nt = {
  "droid-ready": Wt,
  "droid-mod-ready": Rt,
  "panel-open": x,
  "panel-close": x
};
class Bt {
  listeners = /* @__PURE__ */ new Map();
  on(t, s) {
    let i = this.listeners.get(t);
    i || (i = /* @__PURE__ */ new Set(), this.listeners.set(t, i)), i.add(s);
  }
  off(t, s) {
    this.listeners.get(t)?.delete(s);
  }
  emit(t, s) {
    const i = Nt[t];
    if (i)
      try {
        i.parse(s);
      } catch (n) {
        console.error(`[DroidEventBus] Invalid payload for ${t}:`, n);
        return;
      }
    window.dispatchEvent(new CustomEvent(t, { detail: s }));
    for (const n of this.listeners.get(t) ?? [])
      n(s);
  }
  wait(t) {
    return new Promise((s) => {
      const i = (n) => {
        this.off(t, i), s(n);
      };
      this.on(t, i);
    });
  }
}
const Pt = new Bt(), K = "1.0.3";
function j(e, t) {
  if (!e) throw new Error("[resolveWorkerURL] Worker name must be defined");
  if (typeof window < "u") {
    const s = window.kbveWorkerURLs;
    if (s?.[e]) return s[e];
  }
  return t ?? `/workers/${e}`;
}
async function Ct(e) {
  const t = e ?? j("ws-worker.js"), s = new SharedWorker(t, { type: "module" });
  return s.port.start(), B(s.port);
}
const m = z(
  "uiux-state",
  {
    panelManager: {
      top: { open: !1 },
      right: { open: !1 },
      bottom: { open: !1 },
      left: { open: !1 }
    },
    themeManager: { theme: "auto" },
    toastManager: {},
    scrollY: 0
  },
  {
    encode: JSON.stringify,
    decode: JSON.parse
  }
);
async function Ft(e) {
  const t = e ?? j("canvas-worker.js"), s = new Worker(t, { type: "module" });
  return B(s);
}
const Y = {
  state: m,
  openPanel(e, t) {
    const s = { ...m.get().panelManager };
    s[e] = { open: !0, payload: t }, m.setKey("panelManager", s);
  },
  closePanel(e) {
    const t = { ...m.get().panelManager };
    t[e] = { open: !1, payload: void 0 }, m.setKey("panelManager", t);
  },
  togglePanel(e, t) {
    const s = { ...m.get().panelManager }, i = s[e]?.open ?? !1;
    s[e] = { open: !i, payload: i ? void 0 : t }, m.setKey("panelManager", s);
  },
  setTheme(e) {
    m.setKey("themeManager", { theme: e });
  },
  addToast(e, t) {
    const s = { ...m.get().toastManager, [e]: t };
    m.setKey("toastManager", s);
  },
  removeToast(e) {
    const t = { ...m.get().toastManager };
    delete t[e], m.setKey("toastManager", t);
  },
  async dispatchCanvasRequest(e, t, s = "animated") {
    const i = t.transferControlToOffscreen();
    await window.kbve?.uiux?.worker?.bindCanvas(e, i, s);
  },
  closeAllPanels() {
    const e = { ...m.get().panelManager };
    console.log("error panel is closing");
    for (const t of Object.keys(e))
      e[t] = { open: !1, payload: void 0 };
    m.setKey("panelManager", e);
  },
  emitFromWorker(e) {
    e.type === "injectVNode" && e.vnode && Q(() => {
      const t = document.getElementById("bento-grid-inject");
      if (!t) {
        console.warn(
          "[KBVE] No injection target found: #bento-grid-inject"
        );
        return;
      }
      const s = Z(e.vnode);
      if (s.classList.add("animate-fade-in"), e.vnode.id) {
        const i = document.getElementById(e.vnode.id);
        i && i.remove();
      }
      t.appendChild(s);
    });
  }
}, I = z(
  "i18n-cache",
  {},
  {
    encode: JSON.stringify,
    decode: JSON.parse
  }
), L = {
  store: I,
  api: null,
  ready: Promise.resolve(),
  get(e) {
    return I.get()[e] ?? `[${e}]`;
  },
  async getAsync(e) {
    const t = I.get()[e];
    if (t !== void 0) return t;
    if (!this.api) return `[${e}]`;
    const s = await this.api.getTranslation(e);
    return s !== null ? (I.setKey(e, s), s) : `[${e}]`;
  },
  set(e, t) {
    I.setKey(e, t);
  },
  async hydrate(e, t) {
    this.api = e;
    for (const s of t) {
      const i = await e.getTranslation(s);
      i !== null && I.setKey(s, i);
    }
  },
  async hydrateLocale(e = "en") {
    if (!this.api) return;
    const s = (await this.api.getAllI18nKeys()).filter(
      (n) => n.startsWith(`${e}:`)
    ), i = await this.api.getTranslations(s);
    for (const [n, o] of Object.entries(i))
      console.log(`[i18n.setKey] ${n} = ${o}`), this.store.setKey(n, o);
  }
};
function G() {
  if (!navigator.serviceWorker?.controller) return;
  const e = new MessageChannel();
  navigator.serviceWorker.controller.postMessage(e.port2, [
    e.port2
  ]), e.port1.start();
}
async function jt(e) {
  const t = e ?? j("db-worker.js"), s = new SharedWorker(t, { type: "module" });
  s.port.start();
  const i = B(s.port);
  return await i.getVersion() !== K && await kt(i, {
    version: K,
    i18nPath: "https://discord.sh/i18n/db.json",
    locale: "en",
    defaults: { welcome: "Welcome!", theme: "dark" }
  }), i;
}
let J = !1;
function Ht(e, t) {
  const s = tt(async (i) => {
    Q(() => {
      const n = `ws:${Date.now()}`;
      t.storeWsMessage(n, i);
    });
  });
  e.onMessage(et(s, [0]));
}
async function Yt(e) {
  if (console.log("[DROID]: Main<T>"), J || (J = !0, navigator.serviceWorker?.controller ? G() : navigator.serviceWorker?.addEventListener(
    "controllerchange",
    G
  )), console.log("[DROID] Main<T> => Worker URLs", e?.workerURLs), !window.kbve?.api || !window.kbve?.i18n || !window.kbve?.uiux)
    try {
      const s = await Ft(
        typeof e?.workerURLs?.canvasWorker == "string" ? e.workerURLs.canvasWorker : void 0
      ), i = await jt(
        typeof e?.workerURLs?.dbWorker == "string" ? e.workerURLs.dbWorker : void 0
      ), n = await Ct(
        typeof e?.workerURLs?.wsWorker == "string" ? e.workerURLs.wsWorker : void 0
      ), o = await gt((l) => e?.workerURLs?.[l] ?? l), r = Pt;
      for (const l of Object.values(o.registry))
        typeof l.instance.init == "function" && await l.instance.init({
          emitFromWorker: Y.emitFromWorker
        }), console.log("[Event] -> Fire Mod Ready"), r.emit("droid-mod-ready", {
          meta: l.meta,
          timestamp: Date.now()
        });
      Ht(n, i);
      const h = Ut;
      L.api = i, L.ready = L.hydrateLocale("en"), window.kbve = {
        ...window.kbve || {},
        api: i,
        i18n: L,
        uiux: { ...Y, worker: s },
        ws: n,
        data: h,
        mod: o,
        events: r
      }, await L.ready, window.kbve.events.emit("droid-ready", {
        timestamp: Date.now()
      }), document.addEventListener("astro:page-load", () => {
        console.debug(
          "[KBVE] Re-dispatched droid-ready after astro:page-load"
        ), window.kbve?.events.emit("droid-ready", {
          timestamp: Date.now()
        });
      }), console.log("[KBVE] Global API ready");
    } catch (s) {
      throw console.error("[DROID] Initialization error:", s), s;
    }
  else
    console.log("[KBVE] Already initialized");
}
export {
  Ht as bridgeWsToDb,
  L as i18n,
  Yt as main,
  j as resolveWorkerURL,
  Y as uiux
};
