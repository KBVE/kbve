function ba(t) {
  try {
    return JSON.stringify(t, (e, n) => typeof n == "bigint" ? n.toString() : n);
  } catch (e) {
    throw new Error(
      `Failed to stringify object with BigInt values: ${e instanceof Error ? e.message : e}`
    );
  }
}
function Ia(t) {
  try {
    return JSON.parse(t);
  } catch (e) {
    throw new Error(
      `Failed to parse JSON: ${e instanceof Error ? e.message : e}`
    );
  }
}
function Na(t) {
  try {
    return JSON.stringify(t);
  } catch (e) {
    throw new Error(
      `Failed to stringify JSON: ${e instanceof Error ? e.message : e}`
    );
  }
}
function Sa(t) {
  try {
    return new TextDecoder("utf-8").decode(t);
  } catch {
    throw new Error("Unable to decode UTF-8 array to string.");
  }
}
function Oa(t) {
  try {
    return new TextEncoder().encode(t);
  } catch {
    throw new Error("Unable to encode string to UTF-8 array.");
  }
}
function Ra(t = "nested") {
  try {
    const e = document.getElementById(
      t
    );
    if (e)
      return e;
    console.warn(
      `No iframe with id '${t}' found. Falling back to the first iframe.`
    );
    const n = document.getElementsByTagName("iframe")[0];
    if (!n)
      throw new Error("No iframes found in the document.");
    return n;
  } catch (e) {
    throw console.error("Error retrieving iframe:", e), e;
  }
}
class Ct {
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  constructor() {
  }
  static getInstance() {
    return Ct.instance || (Ct.instance = new Ct()), Ct.instance;
  }
  safeCall(e) {
    try {
      return { data: e() };
    } catch (n) {
      return { error: this.wrapError(n) };
    }
  }
  wrapError(e) {
    return e instanceof Error ? e : new Error(
      typeof e == "string" ? e : "An unknown error occurred"
    );
  }
  stringifyBigInt(e) {
    return this.safeCall(() => ba(e));
  }
  safeParse(e) {
    return this.safeCall(() => Ia(e));
  }
  safeStringify(e) {
    return this.safeCall(() => Na(e));
  }
  utf8ToString(e) {
    return this.safeCall(() => Sa(e));
  }
  stringToUtf8(e) {
    return this.safeCall(() => Oa(e));
  }
  getNestedIFrame(e = "nested") {
    return this.safeCall(() => Ra(e));
  }
  sanitizeFields(e, n) {
    var r;
    if (!e)
      return e;
    for (const { field: i, key: s } of n)
      ((r = e[i]) == null ? void 0 : r[s]) === "" && delete e[i];
    return e;
  }
}
const Da = Ct.getInstance();
var nr = typeof globalThis < "u" ? globalThis : typeof window < "u" ? window : typeof global < "u" ? global : typeof self < "u" ? self : {};
function Ri(t) {
  return t && t.__esModule && Object.prototype.hasOwnProperty.call(t, "default") ? t.default : t;
}
var Lr = { exports: {} }, mi;
function Ma() {
  return mi || (mi = 1, function(t) {
    var e = Object.prototype.hasOwnProperty, n = "~";
    function r() {
    }
    Object.create && (r.prototype = /* @__PURE__ */ Object.create(null), new r().__proto__ || (n = !1));
    function i(g, f, d) {
      this.fn = g, this.context = f, this.once = d || !1;
    }
    function s(g, f, d, m, A) {
      if (typeof d != "function")
        throw new TypeError("The listener must be a function");
      var x = new i(d, m || g, A), W = n ? n + f : f;
      return g._events[W] ? g._events[W].fn ? g._events[W] = [g._events[W], x] : g._events[W].push(x) : (g._events[W] = x, g._eventsCount++), g;
    }
    function u(g, f) {
      --g._eventsCount === 0 ? g._events = new r() : delete g._events[f];
    }
    function c() {
      this._events = new r(), this._eventsCount = 0;
    }
    c.prototype.eventNames = function() {
      var f = [], d, m;
      if (this._eventsCount === 0)
        return f;
      for (m in d = this._events)
        e.call(d, m) && f.push(n ? m.slice(1) : m);
      return Object.getOwnPropertySymbols ? f.concat(Object.getOwnPropertySymbols(d)) : f;
    }, c.prototype.listeners = function(f) {
      var d = n ? n + f : f, m = this._events[d];
      if (!m)
        return [];
      if (m.fn)
        return [m.fn];
      for (var A = 0, x = m.length, W = new Array(x); A < x; A++)
        W[A] = m[A].fn;
      return W;
    }, c.prototype.listenerCount = function(f) {
      var d = n ? n + f : f, m = this._events[d];
      return m ? m.fn ? 1 : m.length : 0;
    }, c.prototype.emit = function(f, d, m, A, x, W) {
      var V = n ? n + f : f;
      if (!this._events[V])
        return !1;
      var D = this._events[V], he = arguments.length, re, se;
      if (D.fn) {
        switch (D.once && this.removeListener(f, D.fn, void 0, !0), he) {
          case 1:
            return D.fn.call(D.context), !0;
          case 2:
            return D.fn.call(D.context, d), !0;
          case 3:
            return D.fn.call(D.context, d, m), !0;
          case 4:
            return D.fn.call(D.context, d, m, A), !0;
          case 5:
            return D.fn.call(D.context, d, m, A, x), !0;
          case 6:
            return D.fn.call(D.context, d, m, A, x, W), !0;
        }
        for (se = 1, re = new Array(he - 1); se < he; se++)
          re[se - 1] = arguments[se];
        D.fn.apply(D.context, re);
      } else {
        var Ne = D.length, ge;
        for (se = 0; se < Ne; se++)
          switch (D[se].once && this.removeListener(f, D[se].fn, void 0, !0), he) {
            case 1:
              D[se].fn.call(D[se].context);
              break;
            case 2:
              D[se].fn.call(D[se].context, d);
              break;
            case 3:
              D[se].fn.call(D[se].context, d, m);
              break;
            case 4:
              D[se].fn.call(D[se].context, d, m, A);
              break;
            default:
              if (!re)
                for (ge = 1, re = new Array(he - 1); ge < he; ge++)
                  re[ge - 1] = arguments[ge];
              D[se].fn.apply(D[se].context, re);
          }
      }
      return !0;
    }, c.prototype.on = function(f, d, m) {
      return s(this, f, d, m, !1);
    }, c.prototype.once = function(f, d, m) {
      return s(this, f, d, m, !0);
    }, c.prototype.removeListener = function(f, d, m, A) {
      var x = n ? n + f : f;
      if (!this._events[x])
        return this;
      if (!d)
        return u(this, x), this;
      var W = this._events[x];
      if (W.fn)
        W.fn === d && (!A || W.once) && (!m || W.context === m) && u(this, x);
      else {
        for (var V = 0, D = [], he = W.length; V < he; V++)
          (W[V].fn !== d || A && !W[V].once || m && W[V].context !== m) && D.push(W[V]);
        D.length ? this._events[x] = D.length === 1 ? D[0] : D : u(this, x);
      }
      return this;
    }, c.prototype.removeAllListeners = function(f) {
      var d;
      return f ? (d = n ? n + f : f, this._events[d] && u(this, d)) : (this._events = new r(), this._eventsCount = 0), this;
    }, c.prototype.off = c.prototype.removeListener, c.prototype.addListener = c.prototype.on, c.prefixed = n, c.EventEmitter = c, t.exports = c;
  }(Lr)), Lr.exports;
}
var ka = Ma(), xa = /* @__PURE__ */ Ri(ka), te;
(function(t) {
  t.assertEqual = (i) => i;
  function e(i) {
  }
  t.assertIs = e;
  function n(i) {
    throw new Error();
  }
  t.assertNever = n, t.arrayToEnum = (i) => {
    const s = {};
    for (const u of i)
      s[u] = u;
    return s;
  }, t.getValidEnumValues = (i) => {
    const s = t.objectKeys(i).filter((c) => typeof i[i[c]] != "number"), u = {};
    for (const c of s)
      u[c] = i[c];
    return t.objectValues(u);
  }, t.objectValues = (i) => t.objectKeys(i).map(function(s) {
    return i[s];
  }), t.objectKeys = typeof Object.keys == "function" ? (i) => Object.keys(i) : (i) => {
    const s = [];
    for (const u in i)
      Object.prototype.hasOwnProperty.call(i, u) && s.push(u);
    return s;
  }, t.find = (i, s) => {
    for (const u of i)
      if (s(u))
        return u;
  }, t.isInteger = typeof Number.isInteger == "function" ? (i) => Number.isInteger(i) : (i) => typeof i == "number" && isFinite(i) && Math.floor(i) === i;
  function r(i, s = " | ") {
    return i.map((u) => typeof u == "string" ? `'${u}'` : u).join(s);
  }
  t.joinValues = r, t.jsonStringifyReplacer = (i, s) => typeof s == "bigint" ? s.toString() : s;
})(te || (te = {}));
var Vr;
(function(t) {
  t.mergeShapes = (e, n) => ({
    ...e,
    ...n
    // second overwrites first
  });
})(Vr || (Vr = {}));
const k = te.arrayToEnum([
  "string",
  "nan",
  "number",
  "integer",
  "float",
  "boolean",
  "date",
  "bigint",
  "symbol",
  "function",
  "undefined",
  "null",
  "array",
  "object",
  "unknown",
  "promise",
  "void",
  "never",
  "map",
  "set"
]), Et = (t) => {
  switch (typeof t) {
    case "undefined":
      return k.undefined;
    case "string":
      return k.string;
    case "number":
      return isNaN(t) ? k.nan : k.number;
    case "boolean":
      return k.boolean;
    case "function":
      return k.function;
    case "bigint":
      return k.bigint;
    case "symbol":
      return k.symbol;
    case "object":
      return Array.isArray(t) ? k.array : t === null ? k.null : t.then && typeof t.then == "function" && t.catch && typeof t.catch == "function" ? k.promise : typeof Map < "u" && t instanceof Map ? k.map : typeof Set < "u" && t instanceof Set ? k.set : typeof Date < "u" && t instanceof Date ? k.date : k.object;
    default:
      return k.unknown;
  }
}, S = te.arrayToEnum([
  "invalid_type",
  "invalid_literal",
  "custom",
  "invalid_union",
  "invalid_union_discriminator",
  "invalid_enum_value",
  "unrecognized_keys",
  "invalid_arguments",
  "invalid_return_type",
  "invalid_date",
  "invalid_string",
  "too_small",
  "too_big",
  "invalid_intersection_types",
  "not_multiple_of",
  "not_finite"
]), Pa = (t) => JSON.stringify(t, null, 2).replace(/"([^"]+)":/g, "$1:");
class Be extends Error {
  constructor(e) {
    super(), this.issues = [], this.addIssue = (r) => {
      this.issues = [...this.issues, r];
    }, this.addIssues = (r = []) => {
      this.issues = [...this.issues, ...r];
    };
    const n = new.target.prototype;
    Object.setPrototypeOf ? Object.setPrototypeOf(this, n) : this.__proto__ = n, this.name = "ZodError", this.issues = e;
  }
  get errors() {
    return this.issues;
  }
  format(e) {
    const n = e || function(s) {
      return s.message;
    }, r = { _errors: [] }, i = (s) => {
      for (const u of s.issues)
        if (u.code === "invalid_union")
          u.unionErrors.map(i);
        else if (u.code === "invalid_return_type")
          i(u.returnTypeError);
        else if (u.code === "invalid_arguments")
          i(u.argumentsError);
        else if (u.path.length === 0)
          r._errors.push(n(u));
        else {
          let c = r, g = 0;
          for (; g < u.path.length; ) {
            const f = u.path[g];
            g === u.path.length - 1 ? (c[f] = c[f] || { _errors: [] }, c[f]._errors.push(n(u))) : c[f] = c[f] || { _errors: [] }, c = c[f], g++;
          }
        }
    };
    return i(this), r;
  }
  static assert(e) {
    if (!(e instanceof Be))
      throw new Error(`Not a ZodError: ${e}`);
  }
  toString() {
    return this.message;
  }
  get message() {
    return JSON.stringify(this.issues, te.jsonStringifyReplacer, 2);
  }
  get isEmpty() {
    return this.issues.length === 0;
  }
  flatten(e = (n) => n.message) {
    const n = {}, r = [];
    for (const i of this.issues)
      i.path.length > 0 ? (n[i.path[0]] = n[i.path[0]] || [], n[i.path[0]].push(e(i))) : r.push(e(i));
    return { formErrors: r, fieldErrors: n };
  }
  get formErrors() {
    return this.flatten();
  }
}
Be.create = (t) => new Be(t);
const Yt = (t, e) => {
  let n;
  switch (t.code) {
    case S.invalid_type:
      t.received === k.undefined ? n = "Required" : n = `Expected ${t.expected}, received ${t.received}`;
      break;
    case S.invalid_literal:
      n = `Invalid literal value, expected ${JSON.stringify(t.expected, te.jsonStringifyReplacer)}`;
      break;
    case S.unrecognized_keys:
      n = `Unrecognized key(s) in object: ${te.joinValues(t.keys, ", ")}`;
      break;
    case S.invalid_union:
      n = "Invalid input";
      break;
    case S.invalid_union_discriminator:
      n = `Invalid discriminator value. Expected ${te.joinValues(t.options)}`;
      break;
    case S.invalid_enum_value:
      n = `Invalid enum value. Expected ${te.joinValues(t.options)}, received '${t.received}'`;
      break;
    case S.invalid_arguments:
      n = "Invalid function arguments";
      break;
    case S.invalid_return_type:
      n = "Invalid function return type";
      break;
    case S.invalid_date:
      n = "Invalid date";
      break;
    case S.invalid_string:
      typeof t.validation == "object" ? "includes" in t.validation ? (n = `Invalid input: must include "${t.validation.includes}"`, typeof t.validation.position == "number" && (n = `${n} at one or more positions greater than or equal to ${t.validation.position}`)) : "startsWith" in t.validation ? n = `Invalid input: must start with "${t.validation.startsWith}"` : "endsWith" in t.validation ? n = `Invalid input: must end with "${t.validation.endsWith}"` : te.assertNever(t.validation) : t.validation !== "regex" ? n = `Invalid ${t.validation}` : n = "Invalid";
      break;
    case S.too_small:
      t.type === "array" ? n = `Array must contain ${t.exact ? "exactly" : t.inclusive ? "at least" : "more than"} ${t.minimum} element(s)` : t.type === "string" ? n = `String must contain ${t.exact ? "exactly" : t.inclusive ? "at least" : "over"} ${t.minimum} character(s)` : t.type === "number" ? n = `Number must be ${t.exact ? "exactly equal to " : t.inclusive ? "greater than or equal to " : "greater than "}${t.minimum}` : t.type === "date" ? n = `Date must be ${t.exact ? "exactly equal to " : t.inclusive ? "greater than or equal to " : "greater than "}${new Date(Number(t.minimum))}` : n = "Invalid input";
      break;
    case S.too_big:
      t.type === "array" ? n = `Array must contain ${t.exact ? "exactly" : t.inclusive ? "at most" : "less than"} ${t.maximum} element(s)` : t.type === "string" ? n = `String must contain ${t.exact ? "exactly" : t.inclusive ? "at most" : "under"} ${t.maximum} character(s)` : t.type === "number" ? n = `Number must be ${t.exact ? "exactly" : t.inclusive ? "less than or equal to" : "less than"} ${t.maximum}` : t.type === "bigint" ? n = `BigInt must be ${t.exact ? "exactly" : t.inclusive ? "less than or equal to" : "less than"} ${t.maximum}` : t.type === "date" ? n = `Date must be ${t.exact ? "exactly" : t.inclusive ? "smaller than or equal to" : "smaller than"} ${new Date(Number(t.maximum))}` : n = "Invalid input";
      break;
    case S.custom:
      n = "Invalid input";
      break;
    case S.invalid_intersection_types:
      n = "Intersection results could not be merged";
      break;
    case S.not_multiple_of:
      n = `Number must be a multiple of ${t.multipleOf}`;
      break;
    case S.not_finite:
      n = "Number must be finite";
      break;
    default:
      n = e.defaultError, te.assertNever(t);
  }
  return { message: n };
};
let Di = Yt;
function La(t) {
  Di = t;
}
function ar() {
  return Di;
}
const or = (t) => {
  const { data: e, path: n, errorMaps: r, issueData: i } = t, s = [...n, ...i.path || []], u = {
    ...i,
    path: s
  };
  if (i.message !== void 0)
    return {
      ...i,
      path: s,
      message: i.message
    };
  let c = "";
  const g = r.filter((f) => !!f).slice().reverse();
  for (const f of g)
    c = f(u, { data: e, defaultError: c }).message;
  return {
    ...i,
    path: s,
    message: c
  };
}, Ua = [];
function M(t, e) {
  const n = ar(), r = or({
    issueData: e,
    data: t.data,
    path: t.path,
    errorMaps: [
      t.common.contextualErrorMap,
      t.schemaErrorMap,
      n,
      n === Yt ? void 0 : Yt
      // then global default map
    ].filter((i) => !!i)
  });
  t.common.issues.push(r);
}
class be {
  constructor() {
    this.value = "valid";
  }
  dirty() {
    this.value === "valid" && (this.value = "dirty");
  }
  abort() {
    this.value !== "aborted" && (this.value = "aborted");
  }
  static mergeArray(e, n) {
    const r = [];
    for (const i of n) {
      if (i.status === "aborted")
        return C;
      i.status === "dirty" && e.dirty(), r.push(i.value);
    }
    return { status: e.value, value: r };
  }
  static async mergeObjectAsync(e, n) {
    const r = [];
    for (const i of n) {
      const s = await i.key, u = await i.value;
      r.push({
        key: s,
        value: u
      });
    }
    return be.mergeObjectSync(e, r);
  }
  static mergeObjectSync(e, n) {
    const r = {};
    for (const i of n) {
      const { key: s, value: u } = i;
      if (s.status === "aborted" || u.status === "aborted")
        return C;
      s.status === "dirty" && e.dirty(), u.status === "dirty" && e.dirty(), s.value !== "__proto__" && (typeof u.value < "u" || i.alwaysSet) && (r[s.value] = u.value);
    }
    return { status: e.value, value: r };
  }
}
const C = Object.freeze({
  status: "aborted"
}), qt = (t) => ({ status: "dirty", value: t }), De = (t) => ({ status: "valid", value: t }), Hr = (t) => t.status === "aborted", Fr = (t) => t.status === "dirty", mn = (t) => t.status === "valid", _n = (t) => typeof Promise < "u" && t instanceof Promise;
function lr(t, e, n, r) {
  if (typeof e == "function" ? t !== e || !r : !e.has(t))
    throw new TypeError("Cannot read private member from an object whose class did not declare it");
  return e.get(t);
}
function Mi(t, e, n, r, i) {
  if (typeof e == "function" ? t !== e || !i : !e.has(t))
    throw new TypeError("Cannot write private member to an object whose class did not declare it");
  return e.set(t, n), n;
}
var B;
(function(t) {
  t.errToObj = (e) => typeof e == "string" ? { message: e } : e || {}, t.toString = (e) => typeof e == "string" ? e : e == null ? void 0 : e.message;
})(B || (B = {}));
var dn, fn;
class Je {
  constructor(e, n, r, i) {
    this._cachedPath = [], this.parent = e, this.data = n, this._path = r, this._key = i;
  }
  get path() {
    return this._cachedPath.length || (this._key instanceof Array ? this._cachedPath.push(...this._path, ...this._key) : this._cachedPath.push(...this._path, this._key)), this._cachedPath;
  }
}
const _i = (t, e) => {
  if (mn(e))
    return { success: !0, data: e.value };
  if (!t.common.issues.length)
    throw new Error("Validation failed but no issues detected.");
  return {
    success: !1,
    get error() {
      if (this._error)
        return this._error;
      const n = new Be(t.common.issues);
      return this._error = n, this._error;
    }
  };
};
function Y(t) {
  if (!t)
    return {};
  const { errorMap: e, invalid_type_error: n, required_error: r, description: i } = t;
  if (e && (n || r))
    throw new Error(`Can't use "invalid_type_error" or "required_error" in conjunction with custom error map.`);
  return e ? { errorMap: e, description: i } : { errorMap: (u, c) => {
    var g, f;
    const { message: d } = t;
    return u.code === "invalid_enum_value" ? { message: d ?? c.defaultError } : typeof c.data > "u" ? { message: (g = d ?? r) !== null && g !== void 0 ? g : c.defaultError } : u.code !== "invalid_type" ? { message: c.defaultError } : { message: (f = d ?? n) !== null && f !== void 0 ? f : c.defaultError };
  }, description: i };
}
class X {
  constructor(e) {
    this.spa = this.safeParseAsync, this._def = e, this.parse = this.parse.bind(this), this.safeParse = this.safeParse.bind(this), this.parseAsync = this.parseAsync.bind(this), this.safeParseAsync = this.safeParseAsync.bind(this), this.spa = this.spa.bind(this), this.refine = this.refine.bind(this), this.refinement = this.refinement.bind(this), this.superRefine = this.superRefine.bind(this), this.optional = this.optional.bind(this), this.nullable = this.nullable.bind(this), this.nullish = this.nullish.bind(this), this.array = this.array.bind(this), this.promise = this.promise.bind(this), this.or = this.or.bind(this), this.and = this.and.bind(this), this.transform = this.transform.bind(this), this.brand = this.brand.bind(this), this.default = this.default.bind(this), this.catch = this.catch.bind(this), this.describe = this.describe.bind(this), this.pipe = this.pipe.bind(this), this.readonly = this.readonly.bind(this), this.isNullable = this.isNullable.bind(this), this.isOptional = this.isOptional.bind(this);
  }
  get description() {
    return this._def.description;
  }
  _getType(e) {
    return Et(e.data);
  }
  _getOrReturnCtx(e, n) {
    return n || {
      common: e.parent.common,
      data: e.data,
      parsedType: Et(e.data),
      schemaErrorMap: this._def.errorMap,
      path: e.path,
      parent: e.parent
    };
  }
  _processInputParams(e) {
    return {
      status: new be(),
      ctx: {
        common: e.parent.common,
        data: e.data,
        parsedType: Et(e.data),
        schemaErrorMap: this._def.errorMap,
        path: e.path,
        parent: e.parent
      }
    };
  }
  _parseSync(e) {
    const n = this._parse(e);
    if (_n(n))
      throw new Error("Synchronous parse encountered promise.");
    return n;
  }
  _parseAsync(e) {
    const n = this._parse(e);
    return Promise.resolve(n);
  }
  parse(e, n) {
    const r = this.safeParse(e, n);
    if (r.success)
      return r.data;
    throw r.error;
  }
  safeParse(e, n) {
    var r;
    const i = {
      common: {
        issues: [],
        async: (r = n == null ? void 0 : n.async) !== null && r !== void 0 ? r : !1,
        contextualErrorMap: n == null ? void 0 : n.errorMap
      },
      path: (n == null ? void 0 : n.path) || [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data: e,
      parsedType: Et(e)
    }, s = this._parseSync({ data: e, path: i.path, parent: i });
    return _i(i, s);
  }
  async parseAsync(e, n) {
    const r = await this.safeParseAsync(e, n);
    if (r.success)
      return r.data;
    throw r.error;
  }
  async safeParseAsync(e, n) {
    const r = {
      common: {
        issues: [],
        contextualErrorMap: n == null ? void 0 : n.errorMap,
        async: !0
      },
      path: (n == null ? void 0 : n.path) || [],
      schemaErrorMap: this._def.errorMap,
      parent: null,
      data: e,
      parsedType: Et(e)
    }, i = this._parse({ data: e, path: r.path, parent: r }), s = await (_n(i) ? i : Promise.resolve(i));
    return _i(r, s);
  }
  refine(e, n) {
    const r = (i) => typeof n == "string" || typeof n > "u" ? { message: n } : typeof n == "function" ? n(i) : n;
    return this._refinement((i, s) => {
      const u = e(i), c = () => s.addIssue({
        code: S.custom,
        ...r(i)
      });
      return typeof Promise < "u" && u instanceof Promise ? u.then((g) => g ? !0 : (c(), !1)) : u ? !0 : (c(), !1);
    });
  }
  refinement(e, n) {
    return this._refinement((r, i) => e(r) ? !0 : (i.addIssue(typeof n == "function" ? n(r, i) : n), !1));
  }
  _refinement(e) {
    return new ze({
      schema: this,
      typeName: K.ZodEffects,
      effect: { type: "refinement", refinement: e }
    });
  }
  superRefine(e) {
    return this._refinement(e);
  }
  optional() {
    return Qe.create(this, this._def);
  }
  nullable() {
    return bt.create(this, this._def);
  }
  nullish() {
    return this.nullable().optional();
  }
  array() {
    return $e.create(this, this._def);
  }
  promise() {
    return Xt.create(this, this._def);
  }
  or(e) {
    return Tn.create([this, e], this._def);
  }
  and(e) {
    return wn.create(this, e, this._def);
  }
  transform(e) {
    return new ze({
      ...Y(this._def),
      schema: this,
      typeName: K.ZodEffects,
      effect: { type: "transform", transform: e }
    });
  }
  default(e) {
    const n = typeof e == "function" ? e : () => e;
    return new Sn({
      ...Y(this._def),
      innerType: this,
      defaultValue: n,
      typeName: K.ZodDefault
    });
  }
  brand() {
    return new Yr({
      typeName: K.ZodBranded,
      type: this,
      ...Y(this._def)
    });
  }
  catch(e) {
    const n = typeof e == "function" ? e : () => e;
    return new On({
      ...Y(this._def),
      innerType: this,
      catchValue: n,
      typeName: K.ZodCatch
    });
  }
  describe(e) {
    const n = this.constructor;
    return new n({
      ...this._def,
      description: e
    });
  }
  pipe(e) {
    return kn.create(this, e);
  }
  readonly() {
    return Rn.create(this);
  }
  isOptional() {
    return this.safeParse(void 0).success;
  }
  isNullable() {
    return this.safeParse(null).success;
  }
}
const Ba = /^c[^\s-]{8,}$/i, Ga = /^[0-9a-z]+$/, Za = /^[0-9A-HJKMNP-TV-Z]{26}$/, Va = /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/i, Ha = /^[a-z0-9_-]{21}$/i, Fa = /^[-+]?P(?!$)(?:(?:[-+]?\d+Y)|(?:[-+]?\d+[.,]\d+Y$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:(?:[-+]?\d+W)|(?:[-+]?\d+[.,]\d+W$))?(?:(?:[-+]?\d+D)|(?:[-+]?\d+[.,]\d+D$))?(?:T(?=[\d+-])(?:(?:[-+]?\d+H)|(?:[-+]?\d+[.,]\d+H$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:[-+]?\d+(?:[.,]\d+)?S)?)??$/, ja = /^(?!\.)(?!.*\.\.)([A-Z0-9_'+\-\.]*)[A-Z0-9_+-]@([A-Z0-9][A-Z0-9\-]*\.)+[A-Z]{2,}$/i, Ka = "^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$";
let Ur;
const Ca = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/, qa = /^(([a-f0-9]{1,4}:){7}|::([a-f0-9]{1,4}:){0,6}|([a-f0-9]{1,4}:){1}:([a-f0-9]{1,4}:){0,5}|([a-f0-9]{1,4}:){2}:([a-f0-9]{1,4}:){0,4}|([a-f0-9]{1,4}:){3}:([a-f0-9]{1,4}:){0,3}|([a-f0-9]{1,4}:){4}:([a-f0-9]{1,4}:){0,2}|([a-f0-9]{1,4}:){5}:([a-f0-9]{1,4}:){0,1})([a-f0-9]{1,4}|(((25[0-5])|(2[0-4][0-9])|(1[0-9]{2})|([0-9]{1,2}))\.){3}((25[0-5])|(2[0-4][0-9])|(1[0-9]{2})|([0-9]{1,2})))$/, $a = /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/, ki = "((\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-((0[13578]|1[02])-(0[1-9]|[12]\\d|3[01])|(0[469]|11)-(0[1-9]|[12]\\d|30)|(02)-(0[1-9]|1\\d|2[0-8])))", za = new RegExp(`^${ki}$`);
function xi(t) {
  let e = "([01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d";
  return t.precision ? e = `${e}\\.\\d{${t.precision}}` : t.precision == null && (e = `${e}(\\.\\d+)?`), e;
}
function Ya(t) {
  return new RegExp(`^${xi(t)}$`);
}
function Pi(t) {
  let e = `${ki}T${xi(t)}`;
  const n = [];
  return n.push(t.local ? "Z?" : "Z"), t.offset && n.push("([+-]\\d{2}:?\\d{2})"), e = `${e}(${n.join("|")})`, new RegExp(`^${e}$`);
}
function Wa(t, e) {
  return !!((e === "v4" || !e) && Ca.test(t) || (e === "v6" || !e) && qa.test(t));
}
class qe extends X {
  _parse(e) {
    if (this._def.coerce && (e.data = String(e.data)), this._getType(e) !== k.string) {
      const s = this._getOrReturnCtx(e);
      return M(s, {
        code: S.invalid_type,
        expected: k.string,
        received: s.parsedType
      }), C;
    }
    const r = new be();
    let i;
    for (const s of this._def.checks)
      if (s.kind === "min")
        e.data.length < s.value && (i = this._getOrReturnCtx(e, i), M(i, {
          code: S.too_small,
          minimum: s.value,
          type: "string",
          inclusive: !0,
          exact: !1,
          message: s.message
        }), r.dirty());
      else if (s.kind === "max")
        e.data.length > s.value && (i = this._getOrReturnCtx(e, i), M(i, {
          code: S.too_big,
          maximum: s.value,
          type: "string",
          inclusive: !0,
          exact: !1,
          message: s.message
        }), r.dirty());
      else if (s.kind === "length") {
        const u = e.data.length > s.value, c = e.data.length < s.value;
        (u || c) && (i = this._getOrReturnCtx(e, i), u ? M(i, {
          code: S.too_big,
          maximum: s.value,
          type: "string",
          inclusive: !0,
          exact: !0,
          message: s.message
        }) : c && M(i, {
          code: S.too_small,
          minimum: s.value,
          type: "string",
          inclusive: !0,
          exact: !0,
          message: s.message
        }), r.dirty());
      } else if (s.kind === "email")
        ja.test(e.data) || (i = this._getOrReturnCtx(e, i), M(i, {
          validation: "email",
          code: S.invalid_string,
          message: s.message
        }), r.dirty());
      else if (s.kind === "emoji")
        Ur || (Ur = new RegExp(Ka, "u")), Ur.test(e.data) || (i = this._getOrReturnCtx(e, i), M(i, {
          validation: "emoji",
          code: S.invalid_string,
          message: s.message
        }), r.dirty());
      else if (s.kind === "uuid")
        Va.test(e.data) || (i = this._getOrReturnCtx(e, i), M(i, {
          validation: "uuid",
          code: S.invalid_string,
          message: s.message
        }), r.dirty());
      else if (s.kind === "nanoid")
        Ha.test(e.data) || (i = this._getOrReturnCtx(e, i), M(i, {
          validation: "nanoid",
          code: S.invalid_string,
          message: s.message
        }), r.dirty());
      else if (s.kind === "cuid")
        Ba.test(e.data) || (i = this._getOrReturnCtx(e, i), M(i, {
          validation: "cuid",
          code: S.invalid_string,
          message: s.message
        }), r.dirty());
      else if (s.kind === "cuid2")
        Ga.test(e.data) || (i = this._getOrReturnCtx(e, i), M(i, {
          validation: "cuid2",
          code: S.invalid_string,
          message: s.message
        }), r.dirty());
      else if (s.kind === "ulid")
        Za.test(e.data) || (i = this._getOrReturnCtx(e, i), M(i, {
          validation: "ulid",
          code: S.invalid_string,
          message: s.message
        }), r.dirty());
      else if (s.kind === "url")
        try {
          new URL(e.data);
        } catch {
          i = this._getOrReturnCtx(e, i), M(i, {
            validation: "url",
            code: S.invalid_string,
            message: s.message
          }), r.dirty();
        }
      else
        s.kind === "regex" ? (s.regex.lastIndex = 0, s.regex.test(e.data) || (i = this._getOrReturnCtx(e, i), M(i, {
          validation: "regex",
          code: S.invalid_string,
          message: s.message
        }), r.dirty())) : s.kind === "trim" ? e.data = e.data.trim() : s.kind === "includes" ? e.data.includes(s.value, s.position) || (i = this._getOrReturnCtx(e, i), M(i, {
          code: S.invalid_string,
          validation: { includes: s.value, position: s.position },
          message: s.message
        }), r.dirty()) : s.kind === "toLowerCase" ? e.data = e.data.toLowerCase() : s.kind === "toUpperCase" ? e.data = e.data.toUpperCase() : s.kind === "startsWith" ? e.data.startsWith(s.value) || (i = this._getOrReturnCtx(e, i), M(i, {
          code: S.invalid_string,
          validation: { startsWith: s.value },
          message: s.message
        }), r.dirty()) : s.kind === "endsWith" ? e.data.endsWith(s.value) || (i = this._getOrReturnCtx(e, i), M(i, {
          code: S.invalid_string,
          validation: { endsWith: s.value },
          message: s.message
        }), r.dirty()) : s.kind === "datetime" ? Pi(s).test(e.data) || (i = this._getOrReturnCtx(e, i), M(i, {
          code: S.invalid_string,
          validation: "datetime",
          message: s.message
        }), r.dirty()) : s.kind === "date" ? za.test(e.data) || (i = this._getOrReturnCtx(e, i), M(i, {
          code: S.invalid_string,
          validation: "date",
          message: s.message
        }), r.dirty()) : s.kind === "time" ? Ya(s).test(e.data) || (i = this._getOrReturnCtx(e, i), M(i, {
          code: S.invalid_string,
          validation: "time",
          message: s.message
        }), r.dirty()) : s.kind === "duration" ? Fa.test(e.data) || (i = this._getOrReturnCtx(e, i), M(i, {
          validation: "duration",
          code: S.invalid_string,
          message: s.message
        }), r.dirty()) : s.kind === "ip" ? Wa(e.data, s.version) || (i = this._getOrReturnCtx(e, i), M(i, {
          validation: "ip",
          code: S.invalid_string,
          message: s.message
        }), r.dirty()) : s.kind === "base64" ? $a.test(e.data) || (i = this._getOrReturnCtx(e, i), M(i, {
          validation: "base64",
          code: S.invalid_string,
          message: s.message
        }), r.dirty()) : te.assertNever(s);
    return { status: r.value, value: e.data };
  }
  _regex(e, n, r) {
    return this.refinement((i) => e.test(i), {
      validation: n,
      code: S.invalid_string,
      ...B.errToObj(r)
    });
  }
  _addCheck(e) {
    return new qe({
      ...this._def,
      checks: [...this._def.checks, e]
    });
  }
  email(e) {
    return this._addCheck({ kind: "email", ...B.errToObj(e) });
  }
  url(e) {
    return this._addCheck({ kind: "url", ...B.errToObj(e) });
  }
  emoji(e) {
    return this._addCheck({ kind: "emoji", ...B.errToObj(e) });
  }
  uuid(e) {
    return this._addCheck({ kind: "uuid", ...B.errToObj(e) });
  }
  nanoid(e) {
    return this._addCheck({ kind: "nanoid", ...B.errToObj(e) });
  }
  cuid(e) {
    return this._addCheck({ kind: "cuid", ...B.errToObj(e) });
  }
  cuid2(e) {
    return this._addCheck({ kind: "cuid2", ...B.errToObj(e) });
  }
  ulid(e) {
    return this._addCheck({ kind: "ulid", ...B.errToObj(e) });
  }
  base64(e) {
    return this._addCheck({ kind: "base64", ...B.errToObj(e) });
  }
  ip(e) {
    return this._addCheck({ kind: "ip", ...B.errToObj(e) });
  }
  datetime(e) {
    var n, r;
    return typeof e == "string" ? this._addCheck({
      kind: "datetime",
      precision: null,
      offset: !1,
      local: !1,
      message: e
    }) : this._addCheck({
      kind: "datetime",
      precision: typeof (e == null ? void 0 : e.precision) > "u" ? null : e == null ? void 0 : e.precision,
      offset: (n = e == null ? void 0 : e.offset) !== null && n !== void 0 ? n : !1,
      local: (r = e == null ? void 0 : e.local) !== null && r !== void 0 ? r : !1,
      ...B.errToObj(e == null ? void 0 : e.message)
    });
  }
  date(e) {
    return this._addCheck({ kind: "date", message: e });
  }
  time(e) {
    return typeof e == "string" ? this._addCheck({
      kind: "time",
      precision: null,
      message: e
    }) : this._addCheck({
      kind: "time",
      precision: typeof (e == null ? void 0 : e.precision) > "u" ? null : e == null ? void 0 : e.precision,
      ...B.errToObj(e == null ? void 0 : e.message)
    });
  }
  duration(e) {
    return this._addCheck({ kind: "duration", ...B.errToObj(e) });
  }
  regex(e, n) {
    return this._addCheck({
      kind: "regex",
      regex: e,
      ...B.errToObj(n)
    });
  }
  includes(e, n) {
    return this._addCheck({
      kind: "includes",
      value: e,
      position: n == null ? void 0 : n.position,
      ...B.errToObj(n == null ? void 0 : n.message)
    });
  }
  startsWith(e, n) {
    return this._addCheck({
      kind: "startsWith",
      value: e,
      ...B.errToObj(n)
    });
  }
  endsWith(e, n) {
    return this._addCheck({
      kind: "endsWith",
      value: e,
      ...B.errToObj(n)
    });
  }
  min(e, n) {
    return this._addCheck({
      kind: "min",
      value: e,
      ...B.errToObj(n)
    });
  }
  max(e, n) {
    return this._addCheck({
      kind: "max",
      value: e,
      ...B.errToObj(n)
    });
  }
  length(e, n) {
    return this._addCheck({
      kind: "length",
      value: e,
      ...B.errToObj(n)
    });
  }
  /**
   * @deprecated Use z.string().min(1) instead.
   * @see {@link ZodString.min}
   */
  nonempty(e) {
    return this.min(1, B.errToObj(e));
  }
  trim() {
    return new qe({
      ...this._def,
      checks: [...this._def.checks, { kind: "trim" }]
    });
  }
  toLowerCase() {
    return new qe({
      ...this._def,
      checks: [...this._def.checks, { kind: "toLowerCase" }]
    });
  }
  toUpperCase() {
    return new qe({
      ...this._def,
      checks: [...this._def.checks, { kind: "toUpperCase" }]
    });
  }
  get isDatetime() {
    return !!this._def.checks.find((e) => e.kind === "datetime");
  }
  get isDate() {
    return !!this._def.checks.find((e) => e.kind === "date");
  }
  get isTime() {
    return !!this._def.checks.find((e) => e.kind === "time");
  }
  get isDuration() {
    return !!this._def.checks.find((e) => e.kind === "duration");
  }
  get isEmail() {
    return !!this._def.checks.find((e) => e.kind === "email");
  }
  get isURL() {
    return !!this._def.checks.find((e) => e.kind === "url");
  }
  get isEmoji() {
    return !!this._def.checks.find((e) => e.kind === "emoji");
  }
  get isUUID() {
    return !!this._def.checks.find((e) => e.kind === "uuid");
  }
  get isNANOID() {
    return !!this._def.checks.find((e) => e.kind === "nanoid");
  }
  get isCUID() {
    return !!this._def.checks.find((e) => e.kind === "cuid");
  }
  get isCUID2() {
    return !!this._def.checks.find((e) => e.kind === "cuid2");
  }
  get isULID() {
    return !!this._def.checks.find((e) => e.kind === "ulid");
  }
  get isIP() {
    return !!this._def.checks.find((e) => e.kind === "ip");
  }
  get isBase64() {
    return !!this._def.checks.find((e) => e.kind === "base64");
  }
  get minLength() {
    let e = null;
    for (const n of this._def.checks)
      n.kind === "min" && (e === null || n.value > e) && (e = n.value);
    return e;
  }
  get maxLength() {
    let e = null;
    for (const n of this._def.checks)
      n.kind === "max" && (e === null || n.value < e) && (e = n.value);
    return e;
  }
}
qe.create = (t) => {
  var e;
  return new qe({
    checks: [],
    typeName: K.ZodString,
    coerce: (e = t == null ? void 0 : t.coerce) !== null && e !== void 0 ? e : !1,
    ...Y(t)
  });
};
function Xa(t, e) {
  const n = (t.toString().split(".")[1] || "").length, r = (e.toString().split(".")[1] || "").length, i = n > r ? n : r, s = parseInt(t.toFixed(i).replace(".", "")), u = parseInt(e.toFixed(i).replace(".", ""));
  return s % u / Math.pow(10, i);
}
class Tt extends X {
  constructor() {
    super(...arguments), this.min = this.gte, this.max = this.lte, this.step = this.multipleOf;
  }
  _parse(e) {
    if (this._def.coerce && (e.data = Number(e.data)), this._getType(e) !== k.number) {
      const s = this._getOrReturnCtx(e);
      return M(s, {
        code: S.invalid_type,
        expected: k.number,
        received: s.parsedType
      }), C;
    }
    let r;
    const i = new be();
    for (const s of this._def.checks)
      s.kind === "int" ? te.isInteger(e.data) || (r = this._getOrReturnCtx(e, r), M(r, {
        code: S.invalid_type,
        expected: "integer",
        received: "float",
        message: s.message
      }), i.dirty()) : s.kind === "min" ? (s.inclusive ? e.data < s.value : e.data <= s.value) && (r = this._getOrReturnCtx(e, r), M(r, {
        code: S.too_small,
        minimum: s.value,
        type: "number",
        inclusive: s.inclusive,
        exact: !1,
        message: s.message
      }), i.dirty()) : s.kind === "max" ? (s.inclusive ? e.data > s.value : e.data >= s.value) && (r = this._getOrReturnCtx(e, r), M(r, {
        code: S.too_big,
        maximum: s.value,
        type: "number",
        inclusive: s.inclusive,
        exact: !1,
        message: s.message
      }), i.dirty()) : s.kind === "multipleOf" ? Xa(e.data, s.value) !== 0 && (r = this._getOrReturnCtx(e, r), M(r, {
        code: S.not_multiple_of,
        multipleOf: s.value,
        message: s.message
      }), i.dirty()) : s.kind === "finite" ? Number.isFinite(e.data) || (r = this._getOrReturnCtx(e, r), M(r, {
        code: S.not_finite,
        message: s.message
      }), i.dirty()) : te.assertNever(s);
    return { status: i.value, value: e.data };
  }
  gte(e, n) {
    return this.setLimit("min", e, !0, B.toString(n));
  }
  gt(e, n) {
    return this.setLimit("min", e, !1, B.toString(n));
  }
  lte(e, n) {
    return this.setLimit("max", e, !0, B.toString(n));
  }
  lt(e, n) {
    return this.setLimit("max", e, !1, B.toString(n));
  }
  setLimit(e, n, r, i) {
    return new Tt({
      ...this._def,
      checks: [
        ...this._def.checks,
        {
          kind: e,
          value: n,
          inclusive: r,
          message: B.toString(i)
        }
      ]
    });
  }
  _addCheck(e) {
    return new Tt({
      ...this._def,
      checks: [...this._def.checks, e]
    });
  }
  int(e) {
    return this._addCheck({
      kind: "int",
      message: B.toString(e)
    });
  }
  positive(e) {
    return this._addCheck({
      kind: "min",
      value: 0,
      inclusive: !1,
      message: B.toString(e)
    });
  }
  negative(e) {
    return this._addCheck({
      kind: "max",
      value: 0,
      inclusive: !1,
      message: B.toString(e)
    });
  }
  nonpositive(e) {
    return this._addCheck({
      kind: "max",
      value: 0,
      inclusive: !0,
      message: B.toString(e)
    });
  }
  nonnegative(e) {
    return this._addCheck({
      kind: "min",
      value: 0,
      inclusive: !0,
      message: B.toString(e)
    });
  }
  multipleOf(e, n) {
    return this._addCheck({
      kind: "multipleOf",
      value: e,
      message: B.toString(n)
    });
  }
  finite(e) {
    return this._addCheck({
      kind: "finite",
      message: B.toString(e)
    });
  }
  safe(e) {
    return this._addCheck({
      kind: "min",
      inclusive: !0,
      value: Number.MIN_SAFE_INTEGER,
      message: B.toString(e)
    })._addCheck({
      kind: "max",
      inclusive: !0,
      value: Number.MAX_SAFE_INTEGER,
      message: B.toString(e)
    });
  }
  get minValue() {
    let e = null;
    for (const n of this._def.checks)
      n.kind === "min" && (e === null || n.value > e) && (e = n.value);
    return e;
  }
  get maxValue() {
    let e = null;
    for (const n of this._def.checks)
      n.kind === "max" && (e === null || n.value < e) && (e = n.value);
    return e;
  }
  get isInt() {
    return !!this._def.checks.find((e) => e.kind === "int" || e.kind === "multipleOf" && te.isInteger(e.value));
  }
  get isFinite() {
    let e = null, n = null;
    for (const r of this._def.checks) {
      if (r.kind === "finite" || r.kind === "int" || r.kind === "multipleOf")
        return !0;
      r.kind === "min" ? (n === null || r.value > n) && (n = r.value) : r.kind === "max" && (e === null || r.value < e) && (e = r.value);
    }
    return Number.isFinite(n) && Number.isFinite(e);
  }
}
Tt.create = (t) => new Tt({
  checks: [],
  typeName: K.ZodNumber,
  coerce: (t == null ? void 0 : t.coerce) || !1,
  ...Y(t)
});
class wt extends X {
  constructor() {
    super(...arguments), this.min = this.gte, this.max = this.lte;
  }
  _parse(e) {
    if (this._def.coerce && (e.data = BigInt(e.data)), this._getType(e) !== k.bigint) {
      const s = this._getOrReturnCtx(e);
      return M(s, {
        code: S.invalid_type,
        expected: k.bigint,
        received: s.parsedType
      }), C;
    }
    let r;
    const i = new be();
    for (const s of this._def.checks)
      s.kind === "min" ? (s.inclusive ? e.data < s.value : e.data <= s.value) && (r = this._getOrReturnCtx(e, r), M(r, {
        code: S.too_small,
        type: "bigint",
        minimum: s.value,
        inclusive: s.inclusive,
        message: s.message
      }), i.dirty()) : s.kind === "max" ? (s.inclusive ? e.data > s.value : e.data >= s.value) && (r = this._getOrReturnCtx(e, r), M(r, {
        code: S.too_big,
        type: "bigint",
        maximum: s.value,
        inclusive: s.inclusive,
        message: s.message
      }), i.dirty()) : s.kind === "multipleOf" ? e.data % s.value !== BigInt(0) && (r = this._getOrReturnCtx(e, r), M(r, {
        code: S.not_multiple_of,
        multipleOf: s.value,
        message: s.message
      }), i.dirty()) : te.assertNever(s);
    return { status: i.value, value: e.data };
  }
  gte(e, n) {
    return this.setLimit("min", e, !0, B.toString(n));
  }
  gt(e, n) {
    return this.setLimit("min", e, !1, B.toString(n));
  }
  lte(e, n) {
    return this.setLimit("max", e, !0, B.toString(n));
  }
  lt(e, n) {
    return this.setLimit("max", e, !1, B.toString(n));
  }
  setLimit(e, n, r, i) {
    return new wt({
      ...this._def,
      checks: [
        ...this._def.checks,
        {
          kind: e,
          value: n,
          inclusive: r,
          message: B.toString(i)
        }
      ]
    });
  }
  _addCheck(e) {
    return new wt({
      ...this._def,
      checks: [...this._def.checks, e]
    });
  }
  positive(e) {
    return this._addCheck({
      kind: "min",
      value: BigInt(0),
      inclusive: !1,
      message: B.toString(e)
    });
  }
  negative(e) {
    return this._addCheck({
      kind: "max",
      value: BigInt(0),
      inclusive: !1,
      message: B.toString(e)
    });
  }
  nonpositive(e) {
    return this._addCheck({
      kind: "max",
      value: BigInt(0),
      inclusive: !0,
      message: B.toString(e)
    });
  }
  nonnegative(e) {
    return this._addCheck({
      kind: "min",
      value: BigInt(0),
      inclusive: !0,
      message: B.toString(e)
    });
  }
  multipleOf(e, n) {
    return this._addCheck({
      kind: "multipleOf",
      value: e,
      message: B.toString(n)
    });
  }
  get minValue() {
    let e = null;
    for (const n of this._def.checks)
      n.kind === "min" && (e === null || n.value > e) && (e = n.value);
    return e;
  }
  get maxValue() {
    let e = null;
    for (const n of this._def.checks)
      n.kind === "max" && (e === null || n.value < e) && (e = n.value);
    return e;
  }
}
wt.create = (t) => {
  var e;
  return new wt({
    checks: [],
    typeName: K.ZodBigInt,
    coerce: (e = t == null ? void 0 : t.coerce) !== null && e !== void 0 ? e : !1,
    ...Y(t)
  });
};
class vn extends X {
  _parse(e) {
    if (this._def.coerce && (e.data = !!e.data), this._getType(e) !== k.boolean) {
      const r = this._getOrReturnCtx(e);
      return M(r, {
        code: S.invalid_type,
        expected: k.boolean,
        received: r.parsedType
      }), C;
    }
    return De(e.data);
  }
}
vn.create = (t) => new vn({
  typeName: K.ZodBoolean,
  coerce: (t == null ? void 0 : t.coerce) || !1,
  ...Y(t)
});
class Ut extends X {
  _parse(e) {
    if (this._def.coerce && (e.data = new Date(e.data)), this._getType(e) !== k.date) {
      const s = this._getOrReturnCtx(e);
      return M(s, {
        code: S.invalid_type,
        expected: k.date,
        received: s.parsedType
      }), C;
    }
    if (isNaN(e.data.getTime())) {
      const s = this._getOrReturnCtx(e);
      return M(s, {
        code: S.invalid_date
      }), C;
    }
    const r = new be();
    let i;
    for (const s of this._def.checks)
      s.kind === "min" ? e.data.getTime() < s.value && (i = this._getOrReturnCtx(e, i), M(i, {
        code: S.too_small,
        message: s.message,
        inclusive: !0,
        exact: !1,
        minimum: s.value,
        type: "date"
      }), r.dirty()) : s.kind === "max" ? e.data.getTime() > s.value && (i = this._getOrReturnCtx(e, i), M(i, {
        code: S.too_big,
        message: s.message,
        inclusive: !0,
        exact: !1,
        maximum: s.value,
        type: "date"
      }), r.dirty()) : te.assertNever(s);
    return {
      status: r.value,
      value: new Date(e.data.getTime())
    };
  }
  _addCheck(e) {
    return new Ut({
      ...this._def,
      checks: [...this._def.checks, e]
    });
  }
  min(e, n) {
    return this._addCheck({
      kind: "min",
      value: e.getTime(),
      message: B.toString(n)
    });
  }
  max(e, n) {
    return this._addCheck({
      kind: "max",
      value: e.getTime(),
      message: B.toString(n)
    });
  }
  get minDate() {
    let e = null;
    for (const n of this._def.checks)
      n.kind === "min" && (e === null || n.value > e) && (e = n.value);
    return e != null ? new Date(e) : null;
  }
  get maxDate() {
    let e = null;
    for (const n of this._def.checks)
      n.kind === "max" && (e === null || n.value < e) && (e = n.value);
    return e != null ? new Date(e) : null;
  }
}
Ut.create = (t) => new Ut({
  checks: [],
  coerce: (t == null ? void 0 : t.coerce) || !1,
  typeName: K.ZodDate,
  ...Y(t)
});
class ur extends X {
  _parse(e) {
    if (this._getType(e) !== k.symbol) {
      const r = this._getOrReturnCtx(e);
      return M(r, {
        code: S.invalid_type,
        expected: k.symbol,
        received: r.parsedType
      }), C;
    }
    return De(e.data);
  }
}
ur.create = (t) => new ur({
  typeName: K.ZodSymbol,
  ...Y(t)
});
class En extends X {
  _parse(e) {
    if (this._getType(e) !== k.undefined) {
      const r = this._getOrReturnCtx(e);
      return M(r, {
        code: S.invalid_type,
        expected: k.undefined,
        received: r.parsedType
      }), C;
    }
    return De(e.data);
  }
}
En.create = (t) => new En({
  typeName: K.ZodUndefined,
  ...Y(t)
});
class yn extends X {
  _parse(e) {
    if (this._getType(e) !== k.null) {
      const r = this._getOrReturnCtx(e);
      return M(r, {
        code: S.invalid_type,
        expected: k.null,
        received: r.parsedType
      }), C;
    }
    return De(e.data);
  }
}
yn.create = (t) => new yn({
  typeName: K.ZodNull,
  ...Y(t)
});
class Wt extends X {
  constructor() {
    super(...arguments), this._any = !0;
  }
  _parse(e) {
    return De(e.data);
  }
}
Wt.create = (t) => new Wt({
  typeName: K.ZodAny,
  ...Y(t)
});
class Pt extends X {
  constructor() {
    super(...arguments), this._unknown = !0;
  }
  _parse(e) {
    return De(e.data);
  }
}
Pt.create = (t) => new Pt({
  typeName: K.ZodUnknown,
  ...Y(t)
});
class gt extends X {
  _parse(e) {
    const n = this._getOrReturnCtx(e);
    return M(n, {
      code: S.invalid_type,
      expected: k.never,
      received: n.parsedType
    }), C;
  }
}
gt.create = (t) => new gt({
  typeName: K.ZodNever,
  ...Y(t)
});
class cr extends X {
  _parse(e) {
    if (this._getType(e) !== k.undefined) {
      const r = this._getOrReturnCtx(e);
      return M(r, {
        code: S.invalid_type,
        expected: k.void,
        received: r.parsedType
      }), C;
    }
    return De(e.data);
  }
}
cr.create = (t) => new cr({
  typeName: K.ZodVoid,
  ...Y(t)
});
class $e extends X {
  _parse(e) {
    const { ctx: n, status: r } = this._processInputParams(e), i = this._def;
    if (n.parsedType !== k.array)
      return M(n, {
        code: S.invalid_type,
        expected: k.array,
        received: n.parsedType
      }), C;
    if (i.exactLength !== null) {
      const u = n.data.length > i.exactLength.value, c = n.data.length < i.exactLength.value;
      (u || c) && (M(n, {
        code: u ? S.too_big : S.too_small,
        minimum: c ? i.exactLength.value : void 0,
        maximum: u ? i.exactLength.value : void 0,
        type: "array",
        inclusive: !0,
        exact: !0,
        message: i.exactLength.message
      }), r.dirty());
    }
    if (i.minLength !== null && n.data.length < i.minLength.value && (M(n, {
      code: S.too_small,
      minimum: i.minLength.value,
      type: "array",
      inclusive: !0,
      exact: !1,
      message: i.minLength.message
    }), r.dirty()), i.maxLength !== null && n.data.length > i.maxLength.value && (M(n, {
      code: S.too_big,
      maximum: i.maxLength.value,
      type: "array",
      inclusive: !0,
      exact: !1,
      message: i.maxLength.message
    }), r.dirty()), n.common.async)
      return Promise.all([...n.data].map((u, c) => i.type._parseAsync(new Je(n, u, n.path, c)))).then((u) => be.mergeArray(r, u));
    const s = [...n.data].map((u, c) => i.type._parseSync(new Je(n, u, n.path, c)));
    return be.mergeArray(r, s);
  }
  get element() {
    return this._def.type;
  }
  min(e, n) {
    return new $e({
      ...this._def,
      minLength: { value: e, message: B.toString(n) }
    });
  }
  max(e, n) {
    return new $e({
      ...this._def,
      maxLength: { value: e, message: B.toString(n) }
    });
  }
  length(e, n) {
    return new $e({
      ...this._def,
      exactLength: { value: e, message: B.toString(n) }
    });
  }
  nonempty(e) {
    return this.min(1, e);
  }
}
$e.create = (t, e) => new $e({
  type: t,
  minLength: null,
  maxLength: null,
  exactLength: null,
  typeName: K.ZodArray,
  ...Y(e)
});
function jt(t) {
  if (t instanceof de) {
    const e = {};
    for (const n in t.shape) {
      const r = t.shape[n];
      e[n] = Qe.create(jt(r));
    }
    return new de({
      ...t._def,
      shape: () => e
    });
  } else
    return t instanceof $e ? new $e({
      ...t._def,
      type: jt(t.element)
    }) : t instanceof Qe ? Qe.create(jt(t.unwrap())) : t instanceof bt ? bt.create(jt(t.unwrap())) : t instanceof et ? et.create(t.items.map((e) => jt(e))) : t;
}
class de extends X {
  constructor() {
    super(...arguments), this._cached = null, this.nonstrict = this.passthrough, this.augment = this.extend;
  }
  _getCached() {
    if (this._cached !== null)
      return this._cached;
    const e = this._def.shape(), n = te.objectKeys(e);
    return this._cached = { shape: e, keys: n };
  }
  _parse(e) {
    if (this._getType(e) !== k.object) {
      const f = this._getOrReturnCtx(e);
      return M(f, {
        code: S.invalid_type,
        expected: k.object,
        received: f.parsedType
      }), C;
    }
    const { status: r, ctx: i } = this._processInputParams(e), { shape: s, keys: u } = this._getCached(), c = [];
    if (!(this._def.catchall instanceof gt && this._def.unknownKeys === "strip"))
      for (const f in i.data)
        u.includes(f) || c.push(f);
    const g = [];
    for (const f of u) {
      const d = s[f], m = i.data[f];
      g.push({
        key: { status: "valid", value: f },
        value: d._parse(new Je(i, m, i.path, f)),
        alwaysSet: f in i.data
      });
    }
    if (this._def.catchall instanceof gt) {
      const f = this._def.unknownKeys;
      if (f === "passthrough")
        for (const d of c)
          g.push({
            key: { status: "valid", value: d },
            value: { status: "valid", value: i.data[d] }
          });
      else if (f === "strict")
        c.length > 0 && (M(i, {
          code: S.unrecognized_keys,
          keys: c
        }), r.dirty());
      else if (f !== "strip")
        throw new Error("Internal ZodObject error: invalid unknownKeys value.");
    } else {
      const f = this._def.catchall;
      for (const d of c) {
        const m = i.data[d];
        g.push({
          key: { status: "valid", value: d },
          value: f._parse(
            new Je(i, m, i.path, d)
            //, ctx.child(key), value, getParsedType(value)
          ),
          alwaysSet: d in i.data
        });
      }
    }
    return i.common.async ? Promise.resolve().then(async () => {
      const f = [];
      for (const d of g) {
        const m = await d.key, A = await d.value;
        f.push({
          key: m,
          value: A,
          alwaysSet: d.alwaysSet
        });
      }
      return f;
    }).then((f) => be.mergeObjectSync(r, f)) : be.mergeObjectSync(r, g);
  }
  get shape() {
    return this._def.shape();
  }
  strict(e) {
    return B.errToObj, new de({
      ...this._def,
      unknownKeys: "strict",
      ...e !== void 0 ? {
        errorMap: (n, r) => {
          var i, s, u, c;
          const g = (u = (s = (i = this._def).errorMap) === null || s === void 0 ? void 0 : s.call(i, n, r).message) !== null && u !== void 0 ? u : r.defaultError;
          return n.code === "unrecognized_keys" ? {
            message: (c = B.errToObj(e).message) !== null && c !== void 0 ? c : g
          } : {
            message: g
          };
        }
      } : {}
    });
  }
  strip() {
    return new de({
      ...this._def,
      unknownKeys: "strip"
    });
  }
  passthrough() {
    return new de({
      ...this._def,
      unknownKeys: "passthrough"
    });
  }
  // const AugmentFactory =
  //   <Def extends ZodObjectDef>(def: Def) =>
  //   <Augmentation extends ZodRawShape>(
  //     augmentation: Augmentation
  //   ): ZodObject<
  //     extendShape<ReturnType<Def["shape"]>, Augmentation>,
  //     Def["unknownKeys"],
  //     Def["catchall"]
  //   > => {
  //     return new ZodObject({
  //       ...def,
  //       shape: () => ({
  //         ...def.shape(),
  //         ...augmentation,
  //       }),
  //     }) as any;
  //   };
  extend(e) {
    return new de({
      ...this._def,
      shape: () => ({
        ...this._def.shape(),
        ...e
      })
    });
  }
  /**
   * Prior to zod@1.0.12 there was a bug in the
   * inferred type of merged objects. Please
   * upgrade if you are experiencing issues.
   */
  merge(e) {
    return new de({
      unknownKeys: e._def.unknownKeys,
      catchall: e._def.catchall,
      shape: () => ({
        ...this._def.shape(),
        ...e._def.shape()
      }),
      typeName: K.ZodObject
    });
  }
  // merge<
  //   Incoming extends AnyZodObject,
  //   Augmentation extends Incoming["shape"],
  //   NewOutput extends {
  //     [k in keyof Augmentation | keyof Output]: k extends keyof Augmentation
  //       ? Augmentation[k]["_output"]
  //       : k extends keyof Output
  //       ? Output[k]
  //       : never;
  //   },
  //   NewInput extends {
  //     [k in keyof Augmentation | keyof Input]: k extends keyof Augmentation
  //       ? Augmentation[k]["_input"]
  //       : k extends keyof Input
  //       ? Input[k]
  //       : never;
  //   }
  // >(
  //   merging: Incoming
  // ): ZodObject<
  //   extendShape<T, ReturnType<Incoming["_def"]["shape"]>>,
  //   Incoming["_def"]["unknownKeys"],
  //   Incoming["_def"]["catchall"],
  //   NewOutput,
  //   NewInput
  // > {
  //   const merged: any = new ZodObject({
  //     unknownKeys: merging._def.unknownKeys,
  //     catchall: merging._def.catchall,
  //     shape: () =>
  //       objectUtil.mergeShapes(this._def.shape(), merging._def.shape()),
  //     typeName: ZodFirstPartyTypeKind.ZodObject,
  //   }) as any;
  //   return merged;
  // }
  setKey(e, n) {
    return this.augment({ [e]: n });
  }
  // merge<Incoming extends AnyZodObject>(
  //   merging: Incoming
  // ): //ZodObject<T & Incoming["_shape"], UnknownKeys, Catchall> = (merging) => {
  // ZodObject<
  //   extendShape<T, ReturnType<Incoming["_def"]["shape"]>>,
  //   Incoming["_def"]["unknownKeys"],
  //   Incoming["_def"]["catchall"]
  // > {
  //   // const mergedShape = objectUtil.mergeShapes(
  //   //   this._def.shape(),
  //   //   merging._def.shape()
  //   // );
  //   const merged: any = new ZodObject({
  //     unknownKeys: merging._def.unknownKeys,
  //     catchall: merging._def.catchall,
  //     shape: () =>
  //       objectUtil.mergeShapes(this._def.shape(), merging._def.shape()),
  //     typeName: ZodFirstPartyTypeKind.ZodObject,
  //   }) as any;
  //   return merged;
  // }
  catchall(e) {
    return new de({
      ...this._def,
      catchall: e
    });
  }
  pick(e) {
    const n = {};
    return te.objectKeys(e).forEach((r) => {
      e[r] && this.shape[r] && (n[r] = this.shape[r]);
    }), new de({
      ...this._def,
      shape: () => n
    });
  }
  omit(e) {
    const n = {};
    return te.objectKeys(this.shape).forEach((r) => {
      e[r] || (n[r] = this.shape[r]);
    }), new de({
      ...this._def,
      shape: () => n
    });
  }
  /**
   * @deprecated
   */
  deepPartial() {
    return jt(this);
  }
  partial(e) {
    const n = {};
    return te.objectKeys(this.shape).forEach((r) => {
      const i = this.shape[r];
      e && !e[r] ? n[r] = i : n[r] = i.optional();
    }), new de({
      ...this._def,
      shape: () => n
    });
  }
  required(e) {
    const n = {};
    return te.objectKeys(this.shape).forEach((r) => {
      if (e && !e[r])
        n[r] = this.shape[r];
      else {
        let s = this.shape[r];
        for (; s instanceof Qe; )
          s = s._def.innerType;
        n[r] = s;
      }
    }), new de({
      ...this._def,
      shape: () => n
    });
  }
  keyof() {
    return Li(te.objectKeys(this.shape));
  }
}
de.create = (t, e) => new de({
  shape: () => t,
  unknownKeys: "strip",
  catchall: gt.create(),
  typeName: K.ZodObject,
  ...Y(e)
});
de.strictCreate = (t, e) => new de({
  shape: () => t,
  unknownKeys: "strict",
  catchall: gt.create(),
  typeName: K.ZodObject,
  ...Y(e)
});
de.lazycreate = (t, e) => new de({
  shape: t,
  unknownKeys: "strip",
  catchall: gt.create(),
  typeName: K.ZodObject,
  ...Y(e)
});
class Tn extends X {
  _parse(e) {
    const { ctx: n } = this._processInputParams(e), r = this._def.options;
    function i(s) {
      for (const c of s)
        if (c.result.status === "valid")
          return c.result;
      for (const c of s)
        if (c.result.status === "dirty")
          return n.common.issues.push(...c.ctx.common.issues), c.result;
      const u = s.map((c) => new Be(c.ctx.common.issues));
      return M(n, {
        code: S.invalid_union,
        unionErrors: u
      }), C;
    }
    if (n.common.async)
      return Promise.all(r.map(async (s) => {
        const u = {
          ...n,
          common: {
            ...n.common,
            issues: []
          },
          parent: null
        };
        return {
          result: await s._parseAsync({
            data: n.data,
            path: n.path,
            parent: u
          }),
          ctx: u
        };
      })).then(i);
    {
      let s;
      const u = [];
      for (const g of r) {
        const f = {
          ...n,
          common: {
            ...n.common,
            issues: []
          },
          parent: null
        }, d = g._parseSync({
          data: n.data,
          path: n.path,
          parent: f
        });
        if (d.status === "valid")
          return d;
        d.status === "dirty" && !s && (s = { result: d, ctx: f }), f.common.issues.length && u.push(f.common.issues);
      }
      if (s)
        return n.common.issues.push(...s.ctx.common.issues), s.result;
      const c = u.map((g) => new Be(g));
      return M(n, {
        code: S.invalid_union,
        unionErrors: c
      }), C;
    }
  }
  get options() {
    return this._def.options;
  }
}
Tn.create = (t, e) => new Tn({
  options: t,
  typeName: K.ZodUnion,
  ...Y(e)
});
const dt = (t) => t instanceof bn ? dt(t.schema) : t instanceof ze ? dt(t.innerType()) : t instanceof In ? [t.value] : t instanceof At ? t.options : t instanceof Nn ? te.objectValues(t.enum) : t instanceof Sn ? dt(t._def.innerType) : t instanceof En ? [void 0] : t instanceof yn ? [null] : t instanceof Qe ? [void 0, ...dt(t.unwrap())] : t instanceof bt ? [null, ...dt(t.unwrap())] : t instanceof Yr || t instanceof Rn ? dt(t.unwrap()) : t instanceof On ? dt(t._def.innerType) : [];
class gr extends X {
  _parse(e) {
    const { ctx: n } = this._processInputParams(e);
    if (n.parsedType !== k.object)
      return M(n, {
        code: S.invalid_type,
        expected: k.object,
        received: n.parsedType
      }), C;
    const r = this.discriminator, i = n.data[r], s = this.optionsMap.get(i);
    return s ? n.common.async ? s._parseAsync({
      data: n.data,
      path: n.path,
      parent: n
    }) : s._parseSync({
      data: n.data,
      path: n.path,
      parent: n
    }) : (M(n, {
      code: S.invalid_union_discriminator,
      options: Array.from(this.optionsMap.keys()),
      path: [r]
    }), C);
  }
  get discriminator() {
    return this._def.discriminator;
  }
  get options() {
    return this._def.options;
  }
  get optionsMap() {
    return this._def.optionsMap;
  }
  /**
   * The constructor of the discriminated union schema. Its behaviour is very similar to that of the normal z.union() constructor.
   * However, it only allows a union of objects, all of which need to share a discriminator property. This property must
   * have a different value for each object in the union.
   * @param discriminator the name of the discriminator property
   * @param types an array of object schemas
   * @param params
   */
  static create(e, n, r) {
    const i = /* @__PURE__ */ new Map();
    for (const s of n) {
      const u = dt(s.shape[e]);
      if (!u.length)
        throw new Error(`A discriminator value for key \`${e}\` could not be extracted from all schema options`);
      for (const c of u) {
        if (i.has(c))
          throw new Error(`Discriminator property ${String(e)} has duplicate value ${String(c)}`);
        i.set(c, s);
      }
    }
    return new gr({
      typeName: K.ZodDiscriminatedUnion,
      discriminator: e,
      options: n,
      optionsMap: i,
      ...Y(r)
    });
  }
}
function jr(t, e) {
  const n = Et(t), r = Et(e);
  if (t === e)
    return { valid: !0, data: t };
  if (n === k.object && r === k.object) {
    const i = te.objectKeys(e), s = te.objectKeys(t).filter((c) => i.indexOf(c) !== -1), u = { ...t, ...e };
    for (const c of s) {
      const g = jr(t[c], e[c]);
      if (!g.valid)
        return { valid: !1 };
      u[c] = g.data;
    }
    return { valid: !0, data: u };
  } else if (n === k.array && r === k.array) {
    if (t.length !== e.length)
      return { valid: !1 };
    const i = [];
    for (let s = 0; s < t.length; s++) {
      const u = t[s], c = e[s], g = jr(u, c);
      if (!g.valid)
        return { valid: !1 };
      i.push(g.data);
    }
    return { valid: !0, data: i };
  } else
    return n === k.date && r === k.date && +t == +e ? { valid: !0, data: t } : { valid: !1 };
}
class wn extends X {
  _parse(e) {
    const { status: n, ctx: r } = this._processInputParams(e), i = (s, u) => {
      if (Hr(s) || Hr(u))
        return C;
      const c = jr(s.value, u.value);
      return c.valid ? ((Fr(s) || Fr(u)) && n.dirty(), { status: n.value, value: c.data }) : (M(r, {
        code: S.invalid_intersection_types
      }), C);
    };
    return r.common.async ? Promise.all([
      this._def.left._parseAsync({
        data: r.data,
        path: r.path,
        parent: r
      }),
      this._def.right._parseAsync({
        data: r.data,
        path: r.path,
        parent: r
      })
    ]).then(([s, u]) => i(s, u)) : i(this._def.left._parseSync({
      data: r.data,
      path: r.path,
      parent: r
    }), this._def.right._parseSync({
      data: r.data,
      path: r.path,
      parent: r
    }));
  }
}
wn.create = (t, e, n) => new wn({
  left: t,
  right: e,
  typeName: K.ZodIntersection,
  ...Y(n)
});
class et extends X {
  _parse(e) {
    const { status: n, ctx: r } = this._processInputParams(e);
    if (r.parsedType !== k.array)
      return M(r, {
        code: S.invalid_type,
        expected: k.array,
        received: r.parsedType
      }), C;
    if (r.data.length < this._def.items.length)
      return M(r, {
        code: S.too_small,
        minimum: this._def.items.length,
        inclusive: !0,
        exact: !1,
        type: "array"
      }), C;
    !this._def.rest && r.data.length > this._def.items.length && (M(r, {
      code: S.too_big,
      maximum: this._def.items.length,
      inclusive: !0,
      exact: !1,
      type: "array"
    }), n.dirty());
    const s = [...r.data].map((u, c) => {
      const g = this._def.items[c] || this._def.rest;
      return g ? g._parse(new Je(r, u, r.path, c)) : null;
    }).filter((u) => !!u);
    return r.common.async ? Promise.all(s).then((u) => be.mergeArray(n, u)) : be.mergeArray(n, s);
  }
  get items() {
    return this._def.items;
  }
  rest(e) {
    return new et({
      ...this._def,
      rest: e
    });
  }
}
et.create = (t, e) => {
  if (!Array.isArray(t))
    throw new Error("You must pass an array of schemas to z.tuple([ ... ])");
  return new et({
    items: t,
    typeName: K.ZodTuple,
    rest: null,
    ...Y(e)
  });
};
class An extends X {
  get keySchema() {
    return this._def.keyType;
  }
  get valueSchema() {
    return this._def.valueType;
  }
  _parse(e) {
    const { status: n, ctx: r } = this._processInputParams(e);
    if (r.parsedType !== k.object)
      return M(r, {
        code: S.invalid_type,
        expected: k.object,
        received: r.parsedType
      }), C;
    const i = [], s = this._def.keyType, u = this._def.valueType;
    for (const c in r.data)
      i.push({
        key: s._parse(new Je(r, c, r.path, c)),
        value: u._parse(new Je(r, r.data[c], r.path, c)),
        alwaysSet: c in r.data
      });
    return r.common.async ? be.mergeObjectAsync(n, i) : be.mergeObjectSync(n, i);
  }
  get element() {
    return this._def.valueType;
  }
  static create(e, n, r) {
    return n instanceof X ? new An({
      keyType: e,
      valueType: n,
      typeName: K.ZodRecord,
      ...Y(r)
    }) : new An({
      keyType: qe.create(),
      valueType: e,
      typeName: K.ZodRecord,
      ...Y(n)
    });
  }
}
class dr extends X {
  get keySchema() {
    return this._def.keyType;
  }
  get valueSchema() {
    return this._def.valueType;
  }
  _parse(e) {
    const { status: n, ctx: r } = this._processInputParams(e);
    if (r.parsedType !== k.map)
      return M(r, {
        code: S.invalid_type,
        expected: k.map,
        received: r.parsedType
      }), C;
    const i = this._def.keyType, s = this._def.valueType, u = [...r.data.entries()].map(([c, g], f) => ({
      key: i._parse(new Je(r, c, r.path, [f, "key"])),
      value: s._parse(new Je(r, g, r.path, [f, "value"]))
    }));
    if (r.common.async) {
      const c = /* @__PURE__ */ new Map();
      return Promise.resolve().then(async () => {
        for (const g of u) {
          const f = await g.key, d = await g.value;
          if (f.status === "aborted" || d.status === "aborted")
            return C;
          (f.status === "dirty" || d.status === "dirty") && n.dirty(), c.set(f.value, d.value);
        }
        return { status: n.value, value: c };
      });
    } else {
      const c = /* @__PURE__ */ new Map();
      for (const g of u) {
        const f = g.key, d = g.value;
        if (f.status === "aborted" || d.status === "aborted")
          return C;
        (f.status === "dirty" || d.status === "dirty") && n.dirty(), c.set(f.value, d.value);
      }
      return { status: n.value, value: c };
    }
  }
}
dr.create = (t, e, n) => new dr({
  valueType: e,
  keyType: t,
  typeName: K.ZodMap,
  ...Y(n)
});
class Bt extends X {
  _parse(e) {
    const { status: n, ctx: r } = this._processInputParams(e);
    if (r.parsedType !== k.set)
      return M(r, {
        code: S.invalid_type,
        expected: k.set,
        received: r.parsedType
      }), C;
    const i = this._def;
    i.minSize !== null && r.data.size < i.minSize.value && (M(r, {
      code: S.too_small,
      minimum: i.minSize.value,
      type: "set",
      inclusive: !0,
      exact: !1,
      message: i.minSize.message
    }), n.dirty()), i.maxSize !== null && r.data.size > i.maxSize.value && (M(r, {
      code: S.too_big,
      maximum: i.maxSize.value,
      type: "set",
      inclusive: !0,
      exact: !1,
      message: i.maxSize.message
    }), n.dirty());
    const s = this._def.valueType;
    function u(g) {
      const f = /* @__PURE__ */ new Set();
      for (const d of g) {
        if (d.status === "aborted")
          return C;
        d.status === "dirty" && n.dirty(), f.add(d.value);
      }
      return { status: n.value, value: f };
    }
    const c = [...r.data.values()].map((g, f) => s._parse(new Je(r, g, r.path, f)));
    return r.common.async ? Promise.all(c).then((g) => u(g)) : u(c);
  }
  min(e, n) {
    return new Bt({
      ...this._def,
      minSize: { value: e, message: B.toString(n) }
    });
  }
  max(e, n) {
    return new Bt({
      ...this._def,
      maxSize: { value: e, message: B.toString(n) }
    });
  }
  size(e, n) {
    return this.min(e, n).max(e, n);
  }
  nonempty(e) {
    return this.min(1, e);
  }
}
Bt.create = (t, e) => new Bt({
  valueType: t,
  minSize: null,
  maxSize: null,
  typeName: K.ZodSet,
  ...Y(e)
});
class zt extends X {
  constructor() {
    super(...arguments), this.validate = this.implement;
  }
  _parse(e) {
    const { ctx: n } = this._processInputParams(e);
    if (n.parsedType !== k.function)
      return M(n, {
        code: S.invalid_type,
        expected: k.function,
        received: n.parsedType
      }), C;
    function r(c, g) {
      return or({
        data: c,
        path: n.path,
        errorMaps: [
          n.common.contextualErrorMap,
          n.schemaErrorMap,
          ar(),
          Yt
        ].filter((f) => !!f),
        issueData: {
          code: S.invalid_arguments,
          argumentsError: g
        }
      });
    }
    function i(c, g) {
      return or({
        data: c,
        path: n.path,
        errorMaps: [
          n.common.contextualErrorMap,
          n.schemaErrorMap,
          ar(),
          Yt
        ].filter((f) => !!f),
        issueData: {
          code: S.invalid_return_type,
          returnTypeError: g
        }
      });
    }
    const s = { errorMap: n.common.contextualErrorMap }, u = n.data;
    if (this._def.returns instanceof Xt) {
      const c = this;
      return De(async function(...g) {
        const f = new Be([]), d = await c._def.args.parseAsync(g, s).catch((x) => {
          throw f.addIssue(r(g, x)), f;
        }), m = await Reflect.apply(u, this, d);
        return await c._def.returns._def.type.parseAsync(m, s).catch((x) => {
          throw f.addIssue(i(m, x)), f;
        });
      });
    } else {
      const c = this;
      return De(function(...g) {
        const f = c._def.args.safeParse(g, s);
        if (!f.success)
          throw new Be([r(g, f.error)]);
        const d = Reflect.apply(u, this, f.data), m = c._def.returns.safeParse(d, s);
        if (!m.success)
          throw new Be([i(d, m.error)]);
        return m.data;
      });
    }
  }
  parameters() {
    return this._def.args;
  }
  returnType() {
    return this._def.returns;
  }
  args(...e) {
    return new zt({
      ...this._def,
      args: et.create(e).rest(Pt.create())
    });
  }
  returns(e) {
    return new zt({
      ...this._def,
      returns: e
    });
  }
  implement(e) {
    return this.parse(e);
  }
  strictImplement(e) {
    return this.parse(e);
  }
  static create(e, n, r) {
    return new zt({
      args: e || et.create([]).rest(Pt.create()),
      returns: n || Pt.create(),
      typeName: K.ZodFunction,
      ...Y(r)
    });
  }
}
class bn extends X {
  get schema() {
    return this._def.getter();
  }
  _parse(e) {
    const { ctx: n } = this._processInputParams(e);
    return this._def.getter()._parse({ data: n.data, path: n.path, parent: n });
  }
}
bn.create = (t, e) => new bn({
  getter: t,
  typeName: K.ZodLazy,
  ...Y(e)
});
class In extends X {
  _parse(e) {
    if (e.data !== this._def.value) {
      const n = this._getOrReturnCtx(e);
      return M(n, {
        received: n.data,
        code: S.invalid_literal,
        expected: this._def.value
      }), C;
    }
    return { status: "valid", value: e.data };
  }
  get value() {
    return this._def.value;
  }
}
In.create = (t, e) => new In({
  value: t,
  typeName: K.ZodLiteral,
  ...Y(e)
});
function Li(t, e) {
  return new At({
    values: t,
    typeName: K.ZodEnum,
    ...Y(e)
  });
}
class At extends X {
  constructor() {
    super(...arguments), dn.set(this, void 0);
  }
  _parse(e) {
    if (typeof e.data != "string") {
      const n = this._getOrReturnCtx(e), r = this._def.values;
      return M(n, {
        expected: te.joinValues(r),
        received: n.parsedType,
        code: S.invalid_type
      }), C;
    }
    if (lr(this, dn) || Mi(this, dn, new Set(this._def.values)), !lr(this, dn).has(e.data)) {
      const n = this._getOrReturnCtx(e), r = this._def.values;
      return M(n, {
        received: n.data,
        code: S.invalid_enum_value,
        options: r
      }), C;
    }
    return De(e.data);
  }
  get options() {
    return this._def.values;
  }
  get enum() {
    const e = {};
    for (const n of this._def.values)
      e[n] = n;
    return e;
  }
  get Values() {
    const e = {};
    for (const n of this._def.values)
      e[n] = n;
    return e;
  }
  get Enum() {
    const e = {};
    for (const n of this._def.values)
      e[n] = n;
    return e;
  }
  extract(e, n = this._def) {
    return At.create(e, {
      ...this._def,
      ...n
    });
  }
  exclude(e, n = this._def) {
    return At.create(this.options.filter((r) => !e.includes(r)), {
      ...this._def,
      ...n
    });
  }
}
dn = /* @__PURE__ */ new WeakMap();
At.create = Li;
class Nn extends X {
  constructor() {
    super(...arguments), fn.set(this, void 0);
  }
  _parse(e) {
    const n = te.getValidEnumValues(this._def.values), r = this._getOrReturnCtx(e);
    if (r.parsedType !== k.string && r.parsedType !== k.number) {
      const i = te.objectValues(n);
      return M(r, {
        expected: te.joinValues(i),
        received: r.parsedType,
        code: S.invalid_type
      }), C;
    }
    if (lr(this, fn) || Mi(this, fn, new Set(te.getValidEnumValues(this._def.values))), !lr(this, fn).has(e.data)) {
      const i = te.objectValues(n);
      return M(r, {
        received: r.data,
        code: S.invalid_enum_value,
        options: i
      }), C;
    }
    return De(e.data);
  }
  get enum() {
    return this._def.values;
  }
}
fn = /* @__PURE__ */ new WeakMap();
Nn.create = (t, e) => new Nn({
  values: t,
  typeName: K.ZodNativeEnum,
  ...Y(e)
});
class Xt extends X {
  unwrap() {
    return this._def.type;
  }
  _parse(e) {
    const { ctx: n } = this._processInputParams(e);
    if (n.parsedType !== k.promise && n.common.async === !1)
      return M(n, {
        code: S.invalid_type,
        expected: k.promise,
        received: n.parsedType
      }), C;
    const r = n.parsedType === k.promise ? n.data : Promise.resolve(n.data);
    return De(r.then((i) => this._def.type.parseAsync(i, {
      path: n.path,
      errorMap: n.common.contextualErrorMap
    })));
  }
}
Xt.create = (t, e) => new Xt({
  type: t,
  typeName: K.ZodPromise,
  ...Y(e)
});
class ze extends X {
  innerType() {
    return this._def.schema;
  }
  sourceType() {
    return this._def.schema._def.typeName === K.ZodEffects ? this._def.schema.sourceType() : this._def.schema;
  }
  _parse(e) {
    const { status: n, ctx: r } = this._processInputParams(e), i = this._def.effect || null, s = {
      addIssue: (u) => {
        M(r, u), u.fatal ? n.abort() : n.dirty();
      },
      get path() {
        return r.path;
      }
    };
    if (s.addIssue = s.addIssue.bind(s), i.type === "preprocess") {
      const u = i.transform(r.data, s);
      if (r.common.async)
        return Promise.resolve(u).then(async (c) => {
          if (n.value === "aborted")
            return C;
          const g = await this._def.schema._parseAsync({
            data: c,
            path: r.path,
            parent: r
          });
          return g.status === "aborted" ? C : g.status === "dirty" || n.value === "dirty" ? qt(g.value) : g;
        });
      {
        if (n.value === "aborted")
          return C;
        const c = this._def.schema._parseSync({
          data: u,
          path: r.path,
          parent: r
        });
        return c.status === "aborted" ? C : c.status === "dirty" || n.value === "dirty" ? qt(c.value) : c;
      }
    }
    if (i.type === "refinement") {
      const u = (c) => {
        const g = i.refinement(c, s);
        if (r.common.async)
          return Promise.resolve(g);
        if (g instanceof Promise)
          throw new Error("Async refinement encountered during synchronous parse operation. Use .parseAsync instead.");
        return c;
      };
      if (r.common.async === !1) {
        const c = this._def.schema._parseSync({
          data: r.data,
          path: r.path,
          parent: r
        });
        return c.status === "aborted" ? C : (c.status === "dirty" && n.dirty(), u(c.value), { status: n.value, value: c.value });
      } else
        return this._def.schema._parseAsync({ data: r.data, path: r.path, parent: r }).then((c) => c.status === "aborted" ? C : (c.status === "dirty" && n.dirty(), u(c.value).then(() => ({ status: n.value, value: c.value }))));
    }
    if (i.type === "transform")
      if (r.common.async === !1) {
        const u = this._def.schema._parseSync({
          data: r.data,
          path: r.path,
          parent: r
        });
        if (!mn(u))
          return u;
        const c = i.transform(u.value, s);
        if (c instanceof Promise)
          throw new Error("Asynchronous transform encountered during synchronous parse operation. Use .parseAsync instead.");
        return { status: n.value, value: c };
      } else
        return this._def.schema._parseAsync({ data: r.data, path: r.path, parent: r }).then((u) => mn(u) ? Promise.resolve(i.transform(u.value, s)).then((c) => ({ status: n.value, value: c })) : u);
    te.assertNever(i);
  }
}
ze.create = (t, e, n) => new ze({
  schema: t,
  typeName: K.ZodEffects,
  effect: e,
  ...Y(n)
});
ze.createWithPreprocess = (t, e, n) => new ze({
  schema: e,
  effect: { type: "preprocess", transform: t },
  typeName: K.ZodEffects,
  ...Y(n)
});
class Qe extends X {
  _parse(e) {
    return this._getType(e) === k.undefined ? De(void 0) : this._def.innerType._parse(e);
  }
  unwrap() {
    return this._def.innerType;
  }
}
Qe.create = (t, e) => new Qe({
  innerType: t,
  typeName: K.ZodOptional,
  ...Y(e)
});
class bt extends X {
  _parse(e) {
    return this._getType(e) === k.null ? De(null) : this._def.innerType._parse(e);
  }
  unwrap() {
    return this._def.innerType;
  }
}
bt.create = (t, e) => new bt({
  innerType: t,
  typeName: K.ZodNullable,
  ...Y(e)
});
class Sn extends X {
  _parse(e) {
    const { ctx: n } = this._processInputParams(e);
    let r = n.data;
    return n.parsedType === k.undefined && (r = this._def.defaultValue()), this._def.innerType._parse({
      data: r,
      path: n.path,
      parent: n
    });
  }
  removeDefault() {
    return this._def.innerType;
  }
}
Sn.create = (t, e) => new Sn({
  innerType: t,
  typeName: K.ZodDefault,
  defaultValue: typeof e.default == "function" ? e.default : () => e.default,
  ...Y(e)
});
class On extends X {
  _parse(e) {
    const { ctx: n } = this._processInputParams(e), r = {
      ...n,
      common: {
        ...n.common,
        issues: []
      }
    }, i = this._def.innerType._parse({
      data: r.data,
      path: r.path,
      parent: {
        ...r
      }
    });
    return _n(i) ? i.then((s) => ({
      status: "valid",
      value: s.status === "valid" ? s.value : this._def.catchValue({
        get error() {
          return new Be(r.common.issues);
        },
        input: r.data
      })
    })) : {
      status: "valid",
      value: i.status === "valid" ? i.value : this._def.catchValue({
        get error() {
          return new Be(r.common.issues);
        },
        input: r.data
      })
    };
  }
  removeCatch() {
    return this._def.innerType;
  }
}
On.create = (t, e) => new On({
  innerType: t,
  typeName: K.ZodCatch,
  catchValue: typeof e.catch == "function" ? e.catch : () => e.catch,
  ...Y(e)
});
class fr extends X {
  _parse(e) {
    if (this._getType(e) !== k.nan) {
      const r = this._getOrReturnCtx(e);
      return M(r, {
        code: S.invalid_type,
        expected: k.nan,
        received: r.parsedType
      }), C;
    }
    return { status: "valid", value: e.data };
  }
}
fr.create = (t) => new fr({
  typeName: K.ZodNaN,
  ...Y(t)
});
const Qa = Symbol("zod_brand");
class Yr extends X {
  _parse(e) {
    const { ctx: n } = this._processInputParams(e), r = n.data;
    return this._def.type._parse({
      data: r,
      path: n.path,
      parent: n
    });
  }
  unwrap() {
    return this._def.type;
  }
}
class kn extends X {
  _parse(e) {
    const { status: n, ctx: r } = this._processInputParams(e);
    if (r.common.async)
      return (async () => {
        const s = await this._def.in._parseAsync({
          data: r.data,
          path: r.path,
          parent: r
        });
        return s.status === "aborted" ? C : s.status === "dirty" ? (n.dirty(), qt(s.value)) : this._def.out._parseAsync({
          data: s.value,
          path: r.path,
          parent: r
        });
      })();
    {
      const i = this._def.in._parseSync({
        data: r.data,
        path: r.path,
        parent: r
      });
      return i.status === "aborted" ? C : i.status === "dirty" ? (n.dirty(), {
        status: "dirty",
        value: i.value
      }) : this._def.out._parseSync({
        data: i.value,
        path: r.path,
        parent: r
      });
    }
  }
  static create(e, n) {
    return new kn({
      in: e,
      out: n,
      typeName: K.ZodPipeline
    });
  }
}
class Rn extends X {
  _parse(e) {
    const n = this._def.innerType._parse(e), r = (i) => (mn(i) && (i.value = Object.freeze(i.value)), i);
    return _n(n) ? n.then((i) => r(i)) : r(n);
  }
  unwrap() {
    return this._def.innerType;
  }
}
Rn.create = (t, e) => new Rn({
  innerType: t,
  typeName: K.ZodReadonly,
  ...Y(e)
});
function Wr(t, e = {}, n) {
  return t ? Wt.create().superRefine((r, i) => {
    var s, u;
    if (!t(r)) {
      const c = typeof e == "function" ? e(r) : typeof e == "string" ? { message: e } : e, g = (u = (s = c.fatal) !== null && s !== void 0 ? s : n) !== null && u !== void 0 ? u : !0, f = typeof c == "string" ? { message: c } : c;
      i.addIssue({ code: "custom", ...f, fatal: g });
    }
  }) : Wt.create();
}
const Ja = {
  object: de.lazycreate
};
var K;
(function(t) {
  t.ZodString = "ZodString", t.ZodNumber = "ZodNumber", t.ZodNaN = "ZodNaN", t.ZodBigInt = "ZodBigInt", t.ZodBoolean = "ZodBoolean", t.ZodDate = "ZodDate", t.ZodSymbol = "ZodSymbol", t.ZodUndefined = "ZodUndefined", t.ZodNull = "ZodNull", t.ZodAny = "ZodAny", t.ZodUnknown = "ZodUnknown", t.ZodNever = "ZodNever", t.ZodVoid = "ZodVoid", t.ZodArray = "ZodArray", t.ZodObject = "ZodObject", t.ZodUnion = "ZodUnion", t.ZodDiscriminatedUnion = "ZodDiscriminatedUnion", t.ZodIntersection = "ZodIntersection", t.ZodTuple = "ZodTuple", t.ZodRecord = "ZodRecord", t.ZodMap = "ZodMap", t.ZodSet = "ZodSet", t.ZodFunction = "ZodFunction", t.ZodLazy = "ZodLazy", t.ZodLiteral = "ZodLiteral", t.ZodEnum = "ZodEnum", t.ZodEffects = "ZodEffects", t.ZodNativeEnum = "ZodNativeEnum", t.ZodOptional = "ZodOptional", t.ZodNullable = "ZodNullable", t.ZodDefault = "ZodDefault", t.ZodCatch = "ZodCatch", t.ZodPromise = "ZodPromise", t.ZodBranded = "ZodBranded", t.ZodPipeline = "ZodPipeline", t.ZodReadonly = "ZodReadonly";
})(K || (K = {}));
const eo = (t, e = {
  message: `Input not instance of ${t.name}`
}) => Wr((n) => n instanceof t, e), _ = qe.create, G = Tt.create, to = fr.create, Ui = wt.create, q = vn.create, no = Ut.create, ro = ur.create, io = En.create, mr = yn.create, so = Wt.create, Dn = Pt.create, ao = gt.create, oo = cr.create, ee = $e.create, R = de.create, lo = de.strictCreate, Xr = Tn.create, uo = gr.create, co = wn.create, fo = et.create, ho = An.create, po = dr.create, go = Bt.create, mo = zt.create, _o = bn.create, _e = In.create, vo = At.create, Jt = Nn.create, Eo = Xt.create, vi = ze.create, Bi = Qe.create, yo = bt.create, Gi = ze.createWithPreprocess, To = kn.create, wo = () => _().optional(), Ao = () => G().optional(), bo = () => q().optional(), Io = {
  string: (t) => qe.create({ ...t, coerce: !0 }),
  number: (t) => Tt.create({ ...t, coerce: !0 }),
  boolean: (t) => vn.create({
    ...t,
    coerce: !0
  }),
  bigint: (t) => wt.create({ ...t, coerce: !0 }),
  date: (t) => Ut.create({ ...t, coerce: !0 })
}, No = C;
var L = /* @__PURE__ */ Object.freeze({
  __proto__: null,
  defaultErrorMap: Yt,
  setErrorMap: La,
  getErrorMap: ar,
  makeIssue: or,
  EMPTY_PATH: Ua,
  addIssueToContext: M,
  ParseStatus: be,
  INVALID: C,
  DIRTY: qt,
  OK: De,
  isAborted: Hr,
  isDirty: Fr,
  isValid: mn,
  isAsync: _n,
  get util() {
    return te;
  },
  get objectUtil() {
    return Vr;
  },
  ZodParsedType: k,
  getParsedType: Et,
  ZodType: X,
  datetimeRegex: Pi,
  ZodString: qe,
  ZodNumber: Tt,
  ZodBigInt: wt,
  ZodBoolean: vn,
  ZodDate: Ut,
  ZodSymbol: ur,
  ZodUndefined: En,
  ZodNull: yn,
  ZodAny: Wt,
  ZodUnknown: Pt,
  ZodNever: gt,
  ZodVoid: cr,
  ZodArray: $e,
  ZodObject: de,
  ZodUnion: Tn,
  ZodDiscriminatedUnion: gr,
  ZodIntersection: wn,
  ZodTuple: et,
  ZodRecord: An,
  ZodMap: dr,
  ZodSet: Bt,
  ZodFunction: zt,
  ZodLazy: bn,
  ZodLiteral: In,
  ZodEnum: At,
  ZodNativeEnum: Nn,
  ZodPromise: Xt,
  ZodEffects: ze,
  ZodTransformer: ze,
  ZodOptional: Qe,
  ZodNullable: bt,
  ZodDefault: Sn,
  ZodCatch: On,
  ZodNaN: fr,
  BRAND: Qa,
  ZodBranded: Yr,
  ZodPipeline: kn,
  ZodReadonly: Rn,
  custom: Wr,
  Schema: X,
  ZodSchema: X,
  late: Ja,
  get ZodFirstPartyTypeKind() {
    return K;
  },
  coerce: Io,
  any: so,
  array: ee,
  bigint: Ui,
  boolean: q,
  date: no,
  discriminatedUnion: uo,
  effect: vi,
  enum: vo,
  function: mo,
  instanceof: eo,
  intersection: co,
  lazy: _o,
  literal: _e,
  map: po,
  nan: to,
  nativeEnum: Jt,
  never: ao,
  null: mr,
  nullable: yo,
  number: G,
  object: R,
  oboolean: bo,
  onumber: Ao,
  optional: Bi,
  ostring: wo,
  pipeline: To,
  preprocess: Gi,
  promise: Eo,
  record: ho,
  set: go,
  strictObject: lo,
  string: _,
  symbol: ro,
  transformer: vi,
  tuple: fo,
  undefined: io,
  union: Xr,
  unknown: Dn,
  void: oo,
  NEVER: No,
  ZodIssueCode: S,
  quotelessJson: Pa,
  ZodError: Be
}), Br = { exports: {} }, Ei;
function So() {
  return Ei || (Ei = 1, function(t) {
    var e = function(n) {
      var r = 1e7, i = 7, s = 9007199254740992, u = W(s), c = "0123456789abcdefghijklmnopqrstuvwxyz", g = typeof BigInt == "function";
      function f(a, l, p, E) {
        return typeof a > "u" ? f[0] : typeof l < "u" ? +l == 10 && !p ? F(a) : Fn(a, l, p, E) : F(a);
      }
      function d(a, l) {
        this.value = a, this.sign = l, this.isSmall = !1;
      }
      d.prototype = Object.create(f.prototype);
      function m(a) {
        this.value = a, this.sign = a < 0, this.isSmall = !0;
      }
      m.prototype = Object.create(f.prototype);
      function A(a) {
        this.value = a;
      }
      A.prototype = Object.create(f.prototype);
      function x(a) {
        return -s < a && a < s;
      }
      function W(a) {
        return a < 1e7 ? [a] : a < 1e14 ? [a % 1e7, Math.floor(a / 1e7)] : [a % 1e7, Math.floor(a / 1e7) % 1e7, Math.floor(a / 1e14)];
      }
      function V(a) {
        D(a);
        var l = a.length;
        if (l < 4 && rt(a, u) < 0)
          switch (l) {
            case 0:
              return 0;
            case 1:
              return a[0];
            case 2:
              return a[0] + a[1] * r;
            default:
              return a[0] + (a[1] + a[2] * r) * r;
          }
        return a;
      }
      function D(a) {
        for (var l = a.length; a[--l] === 0; )
          ;
        a.length = l + 1;
      }
      function he(a) {
        for (var l = new Array(a), p = -1; ++p < a; )
          l[p] = 0;
        return l;
      }
      function re(a) {
        return a > 0 ? Math.floor(a) : Math.ceil(a);
      }
      function se(a, l) {
        var p = a.length, E = l.length, T = new Array(p), y = 0, b = r, I, N;
        for (N = 0; N < E; N++)
          I = a[N] + l[N] + y, y = I >= b ? 1 : 0, T[N] = I - y * b;
        for (; N < p; )
          I = a[N] + y, y = I === b ? 1 : 0, T[N++] = I - y * b;
        return y > 0 && T.push(y), T;
      }
      function Ne(a, l) {
        return a.length >= l.length ? se(a, l) : se(l, a);
      }
      function ge(a, l) {
        var p = a.length, E = new Array(p), T = r, y, b;
        for (b = 0; b < p; b++)
          y = a[b] - T + l, l = Math.floor(y / T), E[b] = y - l * T, l += 1;
        for (; l > 0; )
          E[b++] = l % T, l = Math.floor(l / T);
        return E;
      }
      d.prototype.add = function(a) {
        var l = F(a);
        if (this.sign !== l.sign)
          return this.subtract(l.negate());
        var p = this.value, E = l.value;
        return l.isSmall ? new d(ge(p, Math.abs(E)), this.sign) : new d(Ne(p, E), this.sign);
      }, d.prototype.plus = d.prototype.add, m.prototype.add = function(a) {
        var l = F(a), p = this.value;
        if (p < 0 !== l.sign)
          return this.subtract(l.negate());
        var E = l.value;
        if (l.isSmall) {
          if (x(p + E))
            return new m(p + E);
          E = W(Math.abs(E));
        }
        return new d(ge(E, Math.abs(p)), p < 0);
      }, m.prototype.plus = m.prototype.add, A.prototype.add = function(a) {
        return new A(this.value + F(a).value);
      }, A.prototype.plus = A.prototype.add;
      function Ge(a, l) {
        var p = a.length, E = l.length, T = new Array(p), y = 0, b = r, I, N;
        for (I = 0; I < E; I++)
          N = a[I] - y - l[I], N < 0 ? (N += b, y = 1) : y = 0, T[I] = N;
        for (I = E; I < p; I++) {
          if (N = a[I] - y, N < 0)
            N += b;
          else {
            T[I++] = N;
            break;
          }
          T[I] = N;
        }
        for (; I < p; I++)
          T[I] = a[I];
        return D(T), T;
      }
      function Te(a, l, p) {
        var E;
        return rt(a, l) >= 0 ? E = Ge(a, l) : (E = Ge(l, a), p = !p), E = V(E), typeof E == "number" ? (p && (E = -E), new m(E)) : new d(E, p);
      }
      function Pe(a, l, p) {
        var E = a.length, T = new Array(E), y = -l, b = r, I, N;
        for (I = 0; I < E; I++)
          N = a[I] + y, y = Math.floor(N / b), N %= b, T[I] = N < 0 ? N + b : N;
        return T = V(T), typeof T == "number" ? (p && (T = -T), new m(T)) : new d(T, p);
      }
      d.prototype.subtract = function(a) {
        var l = F(a);
        if (this.sign !== l.sign)
          return this.add(l.negate());
        var p = this.value, E = l.value;
        return l.isSmall ? Pe(p, Math.abs(E), this.sign) : Te(p, E, this.sign);
      }, d.prototype.minus = d.prototype.subtract, m.prototype.subtract = function(a) {
        var l = F(a), p = this.value;
        if (p < 0 !== l.sign)
          return this.add(l.negate());
        var E = l.value;
        return l.isSmall ? new m(p - E) : Pe(E, Math.abs(p), p >= 0);
      }, m.prototype.minus = m.prototype.subtract, A.prototype.subtract = function(a) {
        return new A(this.value - F(a).value);
      }, A.prototype.minus = A.prototype.subtract, d.prototype.negate = function() {
        return new d(this.value, !this.sign);
      }, m.prototype.negate = function() {
        var a = this.sign, l = new m(-this.value);
        return l.sign = !a, l;
      }, A.prototype.negate = function() {
        return new A(-this.value);
      }, d.prototype.abs = function() {
        return new d(this.value, !1);
      }, m.prototype.abs = function() {
        return new m(Math.abs(this.value));
      }, A.prototype.abs = function() {
        return new A(this.value >= 0 ? this.value : -this.value);
      };
      function je(a, l) {
        var p = a.length, E = l.length, T = p + E, y = he(T), b = r, I, N, H, J, $;
        for (H = 0; H < p; ++H) {
          J = a[H];
          for (var ne = 0; ne < E; ++ne)
            $ = l[ne], I = J * $ + y[H + ne], N = Math.floor(I / b), y[H + ne] = I - N * b, y[H + ne + 1] += N;
        }
        return D(y), y;
      }
      function Ze(a, l) {
        var p = a.length, E = new Array(p), T = r, y = 0, b, I;
        for (I = 0; I < p; I++)
          b = a[I] * l + y, y = Math.floor(b / T), E[I] = b - y * T;
        for (; y > 0; )
          E[I++] = y % T, y = Math.floor(y / T);
        return E;
      }
      function Se(a, l) {
        for (var p = []; l-- > 0; )
          p.push(0);
        return p.concat(a);
      }
      function oe(a, l) {
        var p = Math.max(a.length, l.length);
        if (p <= 30)
          return je(a, l);
        p = Math.ceil(p / 2);
        var E = a.slice(p), T = a.slice(0, p), y = l.slice(p), b = l.slice(0, p), I = oe(T, b), N = oe(E, y), H = oe(Ne(T, E), Ne(b, y)), J = Ne(Ne(I, Se(Ge(Ge(H, I), N), p)), Se(N, 2 * p));
        return D(J), J;
      }
      function yr(a, l) {
        return -0.012 * a - 0.012 * l + 15e-6 * a * l > 0;
      }
      d.prototype.multiply = function(a) {
        var l = F(a), p = this.value, E = l.value, T = this.sign !== l.sign, y;
        if (l.isSmall) {
          if (E === 0)
            return f[0];
          if (E === 1)
            return this;
          if (E === -1)
            return this.negate();
          if (y = Math.abs(E), y < r)
            return new d(Ze(p, y), T);
          E = W(y);
        }
        return yr(p.length, E.length) ? new d(oe(p, E), T) : new d(je(p, E), T);
      }, d.prototype.times = d.prototype.multiply;
      function xn(a, l, p) {
        return a < r ? new d(Ze(l, a), p) : new d(je(l, W(a)), p);
      }
      m.prototype._multiplyBySmall = function(a) {
        return x(a.value * this.value) ? new m(a.value * this.value) : xn(Math.abs(a.value), W(Math.abs(this.value)), this.sign !== a.sign);
      }, d.prototype._multiplyBySmall = function(a) {
        return a.value === 0 ? f[0] : a.value === 1 ? this : a.value === -1 ? this.negate() : xn(Math.abs(a.value), this.value, this.sign !== a.sign);
      }, m.prototype.multiply = function(a) {
        return F(a)._multiplyBySmall(this);
      }, m.prototype.times = m.prototype.multiply, A.prototype.multiply = function(a) {
        return new A(this.value * F(a).value);
      }, A.prototype.times = A.prototype.multiply;
      function Pn(a) {
        var l = a.length, p = he(l + l), E = r, T, y, b, I, N;
        for (b = 0; b < l; b++) {
          I = a[b], y = 0 - I * I;
          for (var H = b; H < l; H++)
            N = a[H], T = 2 * (I * N) + p[b + H] + y, y = Math.floor(T / E), p[b + H] = T - y * E;
          p[b + l] = y;
        }
        return D(p), p;
      }
      d.prototype.square = function() {
        return new d(Pn(this.value), !1);
      }, m.prototype.square = function() {
        var a = this.value * this.value;
        return x(a) ? new m(a) : new d(Pn(W(Math.abs(this.value))), !1);
      }, A.prototype.square = function(a) {
        return new A(this.value * this.value);
      };
      function Tr(a, l) {
        var p = a.length, E = l.length, T = r, y = he(l.length), b = l[E - 1], I = Math.ceil(T / (2 * b)), N = Ze(a, I), H = Ze(l, I), J, $, ne, Oe, we, on, ln;
        for (N.length <= p && N.push(0), H.push(0), b = H[E - 1], $ = p - E; $ >= 0; $--) {
          for (J = T - 1, N[$ + E] !== b && (J = Math.floor((N[$ + E] * T + N[$ + E - 1]) / b)), ne = 0, Oe = 0, on = H.length, we = 0; we < on; we++)
            ne += J * H[we], ln = Math.floor(ne / T), Oe += N[$ + we] - (ne - ln * T), ne = ln, Oe < 0 ? (N[$ + we] = Oe + T, Oe = -1) : (N[$ + we] = Oe, Oe = 0);
          for (; Oe !== 0; ) {
            for (J -= 1, ne = 0, we = 0; we < on; we++)
              ne += N[$ + we] - T + H[we], ne < 0 ? (N[$ + we] = ne + T, ne = 0) : (N[$ + we] = ne, ne = 1);
            Oe += ne;
          }
          y[$] = J;
        }
        return N = Ln(N, I)[0], [V(y), V(N)];
      }
      function wr(a, l) {
        for (var p = a.length, E = l.length, T = [], y = [], b = r, I, N, H, J, $; p; ) {
          if (y.unshift(a[--p]), D(y), rt(y, l) < 0) {
            T.push(0);
            continue;
          }
          N = y.length, H = y[N - 1] * b + y[N - 2], J = l[E - 1] * b + l[E - 2], N > E && (H = (H + 1) * b), I = Math.ceil(H / J);
          do {
            if ($ = Ze(l, I), rt($, y) <= 0)
              break;
            I--;
          } while (I);
          T.push(I), y = Ge(y, $);
        }
        return T.reverse(), [V(T), V(y)];
      }
      function Ln(a, l) {
        var p = a.length, E = he(p), T = r, y, b, I, N;
        for (I = 0, y = p - 1; y >= 0; --y)
          N = I * T + a[y], b = re(N / l), I = N - b * l, E[y] = b | 0;
        return [E, I | 0];
      }
      function nt(a, l) {
        var p, E = F(l);
        if (g)
          return [new A(a.value / E.value), new A(a.value % E.value)];
        var T = a.value, y = E.value, b;
        if (y === 0)
          throw new Error("Cannot divide by zero");
        if (a.isSmall)
          return E.isSmall ? [new m(re(T / y)), new m(T % y)] : [f[0], a];
        if (E.isSmall) {
          if (y === 1)
            return [a, f[0]];
          if (y == -1)
            return [a.negate(), f[0]];
          var I = Math.abs(y);
          if (I < r) {
            p = Ln(T, I), b = V(p[0]);
            var N = p[1];
            return a.sign && (N = -N), typeof b == "number" ? (a.sign !== E.sign && (b = -b), [new m(b), new m(N)]) : [new d(b, a.sign !== E.sign), new m(N)];
          }
          y = W(I);
        }
        var H = rt(T, y);
        if (H === -1)
          return [f[0], a];
        if (H === 0)
          return [f[a.sign === E.sign ? 1 : -1], f[0]];
        T.length + y.length <= 200 ? p = Tr(T, y) : p = wr(T, y), b = p[0];
        var J = a.sign !== E.sign, $ = p[1], ne = a.sign;
        return typeof b == "number" ? (J && (b = -b), b = new m(b)) : b = new d(b, J), typeof $ == "number" ? (ne && ($ = -$), $ = new m($)) : $ = new d($, ne), [b, $];
      }
      d.prototype.divmod = function(a) {
        var l = nt(this, a);
        return {
          quotient: l[0],
          remainder: l[1]
        };
      }, A.prototype.divmod = m.prototype.divmod = d.prototype.divmod, d.prototype.divide = function(a) {
        return nt(this, a)[0];
      }, A.prototype.over = A.prototype.divide = function(a) {
        return new A(this.value / F(a).value);
      }, m.prototype.over = m.prototype.divide = d.prototype.over = d.prototype.divide, d.prototype.mod = function(a) {
        return nt(this, a)[1];
      }, A.prototype.mod = A.prototype.remainder = function(a) {
        return new A(this.value % F(a).value);
      }, m.prototype.remainder = m.prototype.mod = d.prototype.remainder = d.prototype.mod, d.prototype.pow = function(a) {
        var l = F(a), p = this.value, E = l.value, T, y, b;
        if (E === 0)
          return f[1];
        if (p === 0)
          return f[0];
        if (p === 1)
          return f[1];
        if (p === -1)
          return l.isEven() ? f[1] : f[-1];
        if (l.sign)
          return f[0];
        if (!l.isSmall)
          throw new Error("The exponent " + l.toString() + " is too large.");
        if (this.isSmall && x(T = Math.pow(p, E)))
          return new m(re(T));
        for (y = this, b = f[1]; E & !0 && (b = b.times(y), --E), E !== 0; )
          E /= 2, y = y.square();
        return b;
      }, m.prototype.pow = d.prototype.pow, A.prototype.pow = function(a) {
        var l = F(a), p = this.value, E = l.value, T = BigInt(0), y = BigInt(1), b = BigInt(2);
        if (E === T)
          return f[1];
        if (p === T)
          return f[0];
        if (p === y)
          return f[1];
        if (p === BigInt(-1))
          return l.isEven() ? f[1] : f[-1];
        if (l.isNegative())
          return new A(T);
        for (var I = this, N = f[1]; (E & y) === y && (N = N.times(I), --E), E !== T; )
          E /= b, I = I.square();
        return N;
      }, d.prototype.modPow = function(a, l) {
        if (a = F(a), l = F(l), l.isZero())
          throw new Error("Cannot take modPow with modulus 0");
        var p = f[1], E = this.mod(l);
        for (a.isNegative() && (a = a.multiply(f[-1]), E = E.modInv(l)); a.isPositive(); ) {
          if (E.isZero())
            return f[0];
          a.isOdd() && (p = p.multiply(E).mod(l)), a = a.divide(2), E = E.square().mod(l);
        }
        return p;
      }, A.prototype.modPow = m.prototype.modPow = d.prototype.modPow;
      function rt(a, l) {
        if (a.length !== l.length)
          return a.length > l.length ? 1 : -1;
        for (var p = a.length - 1; p >= 0; p--)
          if (a[p] !== l[p])
            return a[p] > l[p] ? 1 : -1;
        return 0;
      }
      d.prototype.compareAbs = function(a) {
        var l = F(a), p = this.value, E = l.value;
        return l.isSmall ? 1 : rt(p, E);
      }, m.prototype.compareAbs = function(a) {
        var l = F(a), p = Math.abs(this.value), E = l.value;
        return l.isSmall ? (E = Math.abs(E), p === E ? 0 : p > E ? 1 : -1) : -1;
      }, A.prototype.compareAbs = function(a) {
        var l = this.value, p = F(a).value;
        return l = l >= 0 ? l : -l, p = p >= 0 ? p : -p, l === p ? 0 : l > p ? 1 : -1;
      }, d.prototype.compare = function(a) {
        if (a === 1 / 0)
          return -1;
        if (a === -1 / 0)
          return 1;
        var l = F(a), p = this.value, E = l.value;
        return this.sign !== l.sign ? l.sign ? 1 : -1 : l.isSmall ? this.sign ? -1 : 1 : rt(p, E) * (this.sign ? -1 : 1);
      }, d.prototype.compareTo = d.prototype.compare, m.prototype.compare = function(a) {
        if (a === 1 / 0)
          return -1;
        if (a === -1 / 0)
          return 1;
        var l = F(a), p = this.value, E = l.value;
        return l.isSmall ? p == E ? 0 : p > E ? 1 : -1 : p < 0 !== l.sign ? p < 0 ? -1 : 1 : p < 0 ? 1 : -1;
      }, m.prototype.compareTo = m.prototype.compare, A.prototype.compare = function(a) {
        if (a === 1 / 0)
          return -1;
        if (a === -1 / 0)
          return 1;
        var l = this.value, p = F(a).value;
        return l === p ? 0 : l > p ? 1 : -1;
      }, A.prototype.compareTo = A.prototype.compare, d.prototype.equals = function(a) {
        return this.compare(a) === 0;
      }, A.prototype.eq = A.prototype.equals = m.prototype.eq = m.prototype.equals = d.prototype.eq = d.prototype.equals, d.prototype.notEquals = function(a) {
        return this.compare(a) !== 0;
      }, A.prototype.neq = A.prototype.notEquals = m.prototype.neq = m.prototype.notEquals = d.prototype.neq = d.prototype.notEquals, d.prototype.greater = function(a) {
        return this.compare(a) > 0;
      }, A.prototype.gt = A.prototype.greater = m.prototype.gt = m.prototype.greater = d.prototype.gt = d.prototype.greater, d.prototype.lesser = function(a) {
        return this.compare(a) < 0;
      }, A.prototype.lt = A.prototype.lesser = m.prototype.lt = m.prototype.lesser = d.prototype.lt = d.prototype.lesser, d.prototype.greaterOrEquals = function(a) {
        return this.compare(a) >= 0;
      }, A.prototype.geq = A.prototype.greaterOrEquals = m.prototype.geq = m.prototype.greaterOrEquals = d.prototype.geq = d.prototype.greaterOrEquals, d.prototype.lesserOrEquals = function(a) {
        return this.compare(a) <= 0;
      }, A.prototype.leq = A.prototype.lesserOrEquals = m.prototype.leq = m.prototype.lesserOrEquals = d.prototype.leq = d.prototype.lesserOrEquals, d.prototype.isEven = function() {
        return (this.value[0] & 1) === 0;
      }, m.prototype.isEven = function() {
        return (this.value & 1) === 0;
      }, A.prototype.isEven = function() {
        return (this.value & BigInt(1)) === BigInt(0);
      }, d.prototype.isOdd = function() {
        return (this.value[0] & 1) === 1;
      }, m.prototype.isOdd = function() {
        return (this.value & 1) === 1;
      }, A.prototype.isOdd = function() {
        return (this.value & BigInt(1)) === BigInt(1);
      }, d.prototype.isPositive = function() {
        return !this.sign;
      }, m.prototype.isPositive = function() {
        return this.value > 0;
      }, A.prototype.isPositive = m.prototype.isPositive, d.prototype.isNegative = function() {
        return this.sign;
      }, m.prototype.isNegative = function() {
        return this.value < 0;
      }, A.prototype.isNegative = m.prototype.isNegative, d.prototype.isUnit = function() {
        return !1;
      }, m.prototype.isUnit = function() {
        return Math.abs(this.value) === 1;
      }, A.prototype.isUnit = function() {
        return this.abs().value === BigInt(1);
      }, d.prototype.isZero = function() {
        return !1;
      }, m.prototype.isZero = function() {
        return this.value === 0;
      }, A.prototype.isZero = function() {
        return this.value === BigInt(0);
      }, d.prototype.isDivisibleBy = function(a) {
        var l = F(a);
        return l.isZero() ? !1 : l.isUnit() ? !0 : l.compareAbs(2) === 0 ? this.isEven() : this.mod(l).isZero();
      }, A.prototype.isDivisibleBy = m.prototype.isDivisibleBy = d.prototype.isDivisibleBy;
      function Un(a) {
        var l = a.abs();
        if (l.isUnit())
          return !1;
        if (l.equals(2) || l.equals(3) || l.equals(5))
          return !0;
        if (l.isEven() || l.isDivisibleBy(3) || l.isDivisibleBy(5))
          return !1;
        if (l.lesser(49))
          return !0;
      }
      function rn(a, l) {
        for (var p = a.prev(), E = p, T = 0, y, b, I; E.isEven(); )
          E = E.divide(2), T++;
        e:
          for (b = 0; b < l.length; b++)
            if (!a.lesser(l[b]) && (I = e(l[b]).modPow(E, a), !(I.isUnit() || I.equals(p)))) {
              for (y = T - 1; y != 0; y--) {
                if (I = I.square().mod(a), I.isUnit())
                  return !1;
                if (I.equals(p))
                  continue e;
              }
              return !1;
            }
        return !0;
      }
      d.prototype.isPrime = function(a) {
        var l = Un(this);
        if (l !== n)
          return l;
        var p = this.abs(), E = p.bitLength();
        if (E <= 64)
          return rn(p, [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37]);
        for (var T = Math.log(2) * E.toJSNumber(), y = Math.ceil(a === !0 ? 2 * Math.pow(T, 2) : T), b = [], I = 0; I < y; I++)
          b.push(e(I + 2));
        return rn(p, b);
      }, A.prototype.isPrime = m.prototype.isPrime = d.prototype.isPrime, d.prototype.isProbablePrime = function(a, l) {
        var p = Un(this);
        if (p !== n)
          return p;
        for (var E = this.abs(), T = a === n ? 5 : a, y = [], b = 0; b < T; b++)
          y.push(e.randBetween(2, E.minus(2), l));
        return rn(E, y);
      }, A.prototype.isProbablePrime = m.prototype.isProbablePrime = d.prototype.isProbablePrime, d.prototype.modInv = function(a) {
        for (var l = e.zero, p = e.one, E = F(a), T = this.abs(), y, b, I; !T.isZero(); )
          y = E.divide(T), b = l, I = E, l = p, E = T, p = b.subtract(y.multiply(p)), T = I.subtract(y.multiply(T));
        if (!E.isUnit())
          throw new Error(this.toString() + " and " + a.toString() + " are not co-prime");
        return l.compare(0) === -1 && (l = l.add(a)), this.isNegative() ? l.negate() : l;
      }, A.prototype.modInv = m.prototype.modInv = d.prototype.modInv, d.prototype.next = function() {
        var a = this.value;
        return this.sign ? Pe(a, 1, this.sign) : new d(ge(a, 1), this.sign);
      }, m.prototype.next = function() {
        var a = this.value;
        return a + 1 < s ? new m(a + 1) : new d(u, !1);
      }, A.prototype.next = function() {
        return new A(this.value + BigInt(1));
      }, d.prototype.prev = function() {
        var a = this.value;
        return this.sign ? new d(ge(a, 1), !0) : Pe(a, 1, this.sign);
      }, m.prototype.prev = function() {
        var a = this.value;
        return a - 1 > -s ? new m(a - 1) : new d(u, !0);
      }, A.prototype.prev = function() {
        return new A(this.value - BigInt(1));
      };
      for (var Ke = [1]; 2 * Ke[Ke.length - 1] <= r; )
        Ke.push(2 * Ke[Ke.length - 1]);
      var St = Ke.length, it = Ke[St - 1];
      function Bn(a) {
        return Math.abs(a) <= r;
      }
      d.prototype.shiftLeft = function(a) {
        var l = F(a).toJSNumber();
        if (!Bn(l))
          throw new Error(String(l) + " is too large for shifting.");
        if (l < 0)
          return this.shiftRight(-l);
        var p = this;
        if (p.isZero())
          return p;
        for (; l >= St; )
          p = p.multiply(it), l -= St - 1;
        return p.multiply(Ke[l]);
      }, A.prototype.shiftLeft = m.prototype.shiftLeft = d.prototype.shiftLeft, d.prototype.shiftRight = function(a) {
        var l, p = F(a).toJSNumber();
        if (!Bn(p))
          throw new Error(String(p) + " is too large for shifting.");
        if (p < 0)
          return this.shiftLeft(-p);
        for (var E = this; p >= St; ) {
          if (E.isZero() || E.isNegative() && E.isUnit())
            return E;
          l = nt(E, it), E = l[1].isNegative() ? l[0].prev() : l[0], p -= St - 1;
        }
        return l = nt(E, Ke[p]), l[1].isNegative() ? l[0].prev() : l[0];
      }, A.prototype.shiftRight = m.prototype.shiftRight = d.prototype.shiftRight;
      function sn(a, l, p) {
        l = F(l);
        for (var E = a.isNegative(), T = l.isNegative(), y = E ? a.not() : a, b = T ? l.not() : l, I = 0, N = 0, H = null, J = null, $ = []; !y.isZero() || !b.isZero(); )
          H = nt(y, it), I = H[1].toJSNumber(), E && (I = it - 1 - I), J = nt(b, it), N = J[1].toJSNumber(), T && (N = it - 1 - N), y = H[0], b = J[0], $.push(p(I, N));
        for (var ne = p(E ? 1 : 0, T ? 1 : 0) !== 0 ? e(-1) : e(0), Oe = $.length - 1; Oe >= 0; Oe -= 1)
          ne = ne.multiply(it).add(e($[Oe]));
        return ne;
      }
      d.prototype.not = function() {
        return this.negate().prev();
      }, A.prototype.not = m.prototype.not = d.prototype.not, d.prototype.and = function(a) {
        return sn(this, a, function(l, p) {
          return l & p;
        });
      }, A.prototype.and = m.prototype.and = d.prototype.and, d.prototype.or = function(a) {
        return sn(this, a, function(l, p) {
          return l | p;
        });
      }, A.prototype.or = m.prototype.or = d.prototype.or, d.prototype.xor = function(a) {
        return sn(this, a, function(l, p) {
          return l ^ p;
        });
      }, A.prototype.xor = m.prototype.xor = d.prototype.xor;
      var ae = 1 << 30, Gn = (r & -r) * (r & -r) | ae;
      function Zt(a) {
        var l = a.value, p = typeof l == "number" ? l | ae : typeof l == "bigint" ? l | BigInt(ae) : l[0] + l[1] * r | Gn;
        return p & -p;
      }
      function Ce(a, l) {
        if (l.compareTo(a) <= 0) {
          var p = Ce(a, l.square(l)), E = p.p, T = p.e, y = E.multiply(l);
          return y.compareTo(a) <= 0 ? { p: y, e: T * 2 + 1 } : { p: E, e: T * 2 };
        }
        return { p: e(1), e: 0 };
      }
      d.prototype.bitLength = function() {
        var a = this;
        return a.compareTo(e(0)) < 0 && (a = a.negate().subtract(e(1))), a.compareTo(e(0)) === 0 ? e(0) : e(Ce(a, e(2)).e).add(e(1));
      }, A.prototype.bitLength = m.prototype.bitLength = d.prototype.bitLength;
      function an(a, l) {
        return a = F(a), l = F(l), a.greater(l) ? a : l;
      }
      function Vt(a, l) {
        return a = F(a), l = F(l), a.lesser(l) ? a : l;
      }
      function Zn(a, l) {
        if (a = F(a).abs(), l = F(l).abs(), a.equals(l))
          return a;
        if (a.isZero())
          return l;
        if (l.isZero())
          return a;
        for (var p = f[1], E, T; a.isEven() && l.isEven(); )
          E = Vt(Zt(a), Zt(l)), a = a.divide(E), l = l.divide(E), p = p.multiply(E);
        for (; a.isEven(); )
          a = a.divide(Zt(a));
        do {
          for (; l.isEven(); )
            l = l.divide(Zt(l));
          a.greater(l) && (T = l, l = a, a = T), l = l.subtract(a);
        } while (!l.isZero());
        return p.isUnit() ? a : a.multiply(p);
      }
      function Vn(a, l) {
        return a = F(a).abs(), l = F(l).abs(), a.divide(Zn(a, l)).multiply(l);
      }
      function Hn(a, l, p) {
        a = F(a), l = F(l);
        var E = p || Math.random, T = Vt(a, l), y = an(a, l), b = y.subtract(T).add(1);
        if (b.isSmall)
          return T.add(Math.floor(E() * b));
        for (var I = Ot(b, r).value, N = [], H = !0, J = 0; J < I.length; J++) {
          var $ = H ? I[J] + (J + 1 < I.length ? I[J + 1] / r : 0) : r, ne = re(E() * $);
          N.push(ne), ne < I[J] && (H = !1);
        }
        return T.add(f.fromArray(N, r, !1));
      }
      var Fn = function(a, l, p, E) {
        p = p || c, a = String(a), E || (a = a.toLowerCase(), p = p.toLowerCase());
        var T = a.length, y, b = Math.abs(l), I = {};
        for (y = 0; y < p.length; y++)
          I[p[y]] = y;
        for (y = 0; y < T; y++) {
          var N = a[y];
          if (N !== "-" && N in I && I[N] >= b) {
            if (N === "1" && b === 1)
              continue;
            throw new Error(N + " is not a valid digit in base " + l + ".");
          }
        }
        l = F(l);
        var H = [], J = a[0] === "-";
        for (y = J ? 1 : 0; y < a.length; y++) {
          var N = a[y];
          if (N in I)
            H.push(F(I[N]));
          else if (N === "<") {
            var $ = y;
            do
              y++;
            while (a[y] !== ">" && y < a.length);
            H.push(F(a.slice($ + 1, y)));
          } else
            throw new Error(N + " is not a valid character");
        }
        return jn(H, l, J);
      };
      function jn(a, l, p) {
        var E = f[0], T = f[1], y;
        for (y = a.length - 1; y >= 0; y--)
          E = E.add(a[y].times(T)), T = T.times(l);
        return p ? E.negate() : E;
      }
      function Ar(a, l) {
        return l = l || c, a < l.length ? l[a] : "<" + a + ">";
      }
      function Ot(a, l) {
        if (l = e(l), l.isZero()) {
          if (a.isZero())
            return { value: [0], isNegative: !1 };
          throw new Error("Cannot convert nonzero numbers to base 0.");
        }
        if (l.equals(-1)) {
          if (a.isZero())
            return { value: [0], isNegative: !1 };
          if (a.isNegative())
            return {
              value: [].concat.apply(
                [],
                Array.apply(null, Array(-a.toJSNumber())).map(Array.prototype.valueOf, [1, 0])
              ),
              isNegative: !1
            };
          var p = Array.apply(null, Array(a.toJSNumber() - 1)).map(Array.prototype.valueOf, [0, 1]);
          return p.unshift([1]), {
            value: [].concat.apply([], p),
            isNegative: !1
          };
        }
        var E = !1;
        if (a.isNegative() && l.isPositive() && (E = !0, a = a.abs()), l.isUnit())
          return a.isZero() ? { value: [0], isNegative: !1 } : {
            value: Array.apply(null, Array(a.toJSNumber())).map(Number.prototype.valueOf, 1),
            isNegative: E
          };
        for (var T = [], y = a, b; y.isNegative() || y.compareAbs(l) >= 0; ) {
          b = y.divmod(l), y = b.quotient;
          var I = b.remainder;
          I.isNegative() && (I = l.minus(I).abs(), y = y.next()), T.push(I.toJSNumber());
        }
        return T.push(y.toJSNumber()), { value: T.reverse(), isNegative: E };
      }
      function Kn(a, l, p) {
        var E = Ot(a, l);
        return (E.isNegative ? "-" : "") + E.value.map(function(T) {
          return Ar(T, p);
        }).join("");
      }
      d.prototype.toArray = function(a) {
        return Ot(this, a);
      }, m.prototype.toArray = function(a) {
        return Ot(this, a);
      }, A.prototype.toArray = function(a) {
        return Ot(this, a);
      }, d.prototype.toString = function(a, l) {
        if (a === n && (a = 10), a !== 10 || l)
          return Kn(this, a, l);
        for (var p = this.value, E = p.length, T = String(p[--E]), y = "0000000", b; --E >= 0; )
          b = String(p[E]), T += y.slice(b.length) + b;
        var I = this.sign ? "-" : "";
        return I + T;
      }, m.prototype.toString = function(a, l) {
        return a === n && (a = 10), a != 10 || l ? Kn(this, a, l) : String(this.value);
      }, A.prototype.toString = m.prototype.toString, A.prototype.toJSON = d.prototype.toJSON = m.prototype.toJSON = function() {
        return this.toString();
      }, d.prototype.valueOf = function() {
        return parseInt(this.toString(), 10);
      }, d.prototype.toJSNumber = d.prototype.valueOf, m.prototype.valueOf = function() {
        return this.value;
      }, m.prototype.toJSNumber = m.prototype.valueOf, A.prototype.valueOf = A.prototype.toJSNumber = function() {
        return parseInt(this.toString(), 10);
      };
      function Cn(a) {
        if (x(+a)) {
          var l = +a;
          if (l === re(l))
            return g ? new A(BigInt(l)) : new m(l);
          throw new Error("Invalid integer: " + a);
        }
        var p = a[0] === "-";
        p && (a = a.slice(1));
        var E = a.split(/e/i);
        if (E.length > 2)
          throw new Error("Invalid integer: " + E.join("e"));
        if (E.length === 2) {
          var T = E[1];
          if (T[0] === "+" && (T = T.slice(1)), T = +T, T !== re(T) || !x(T))
            throw new Error("Invalid integer: " + T + " is not a valid exponent.");
          var y = E[0], b = y.indexOf(".");
          if (b >= 0 && (T -= y.length - b - 1, y = y.slice(0, b) + y.slice(b + 1)), T < 0)
            throw new Error("Cannot include negative exponent part for integers");
          y += new Array(T + 1).join("0"), a = y;
        }
        var I = /^([0-9][0-9]*)$/.test(a);
        if (!I)
          throw new Error("Invalid integer: " + a);
        if (g)
          return new A(BigInt(p ? "-" + a : a));
        for (var N = [], H = a.length, J = i, $ = H - J; H > 0; )
          N.push(+a.slice($, H)), $ -= J, $ < 0 && ($ = 0), H -= J;
        return D(N), new d(N, p);
      }
      function br(a) {
        if (g)
          return new A(BigInt(a));
        if (x(a)) {
          if (a !== re(a))
            throw new Error(a + " is not an integer.");
          return new m(a);
        }
        return Cn(a.toString());
      }
      function F(a) {
        return typeof a == "number" ? br(a) : typeof a == "string" ? Cn(a) : typeof a == "bigint" ? new A(a) : a;
      }
      for (var st = 0; st < 1e3; st++)
        f[st] = F(st), st > 0 && (f[-st] = F(-st));
      return f.one = f[1], f.zero = f[0], f.minusOne = f[-1], f.max = an, f.min = Vt, f.gcd = Zn, f.lcm = Vn, f.isInstance = function(a) {
        return a instanceof d || a instanceof m || a instanceof A;
      }, f.randBetween = Hn, f.fromArray = function(a, l, p) {
        return jn(a.map(F), F(l || 10), p);
      }, f;
    }();
    t.hasOwnProperty("exports") && (t.exports = e);
  }(Br)), Br.exports;
}
var Oo = So(), Ro = /* @__PURE__ */ Ri(Oo);
const Zi = 64, Kr = 16, yt = Zi / Kr;
function Do() {
  try {
    return !0;
  } catch {
    return !1;
  }
}
function Mo(t, e, n) {
  let r = 0;
  for (let i = 0; i < n; i++) {
    const s = t[e + i];
    if (s === void 0)
      break;
    r += s * 16 ** i;
  }
  return r;
}
function Vi(t) {
  const e = [];
  for (let n = 0; n < t.length; n++) {
    let r = Number(t[n]);
    for (let i = 0; r || i < e.length; i++)
      r += (e[i] || 0) * 10, e[i] = r % 16, r = (r - e[i]) / 16;
  }
  return e;
}
function ko(t) {
  const e = Vi(t), n = Array(yt);
  for (let r = 0; r < yt; r++)
    n[yt - 1 - r] = Mo(e, r * yt, yt);
  return n;
}
class Ye {
  static fromString(e) {
    return new Ye(ko(e), e);
  }
  static fromBit(e) {
    const n = Array(yt), r = Math.floor(e / Kr);
    for (let i = 0; i < yt; i++)
      n[yt - 1 - i] = i === r ? 1 << e - r * Kr : 0;
    return new Ye(n);
  }
  constructor(e, n) {
    this.parts = e, this.str = n;
  }
  and({ parts: e }) {
    return new Ye(this.parts.map((n, r) => n & e[r]));
  }
  or({ parts: e }) {
    return new Ye(this.parts.map((n, r) => n | e[r]));
  }
  xor({ parts: e }) {
    return new Ye(this.parts.map((n, r) => n ^ e[r]));
  }
  not() {
    return new Ye(this.parts.map((e) => ~e));
  }
  equals({ parts: e }) {
    return this.parts.every((n, r) => n === e[r]);
  }
  /**
   * For the average case the string representation is provided, but
   * when we need to convert high and low to string we just let the
   * slower big-integer library do it.
   */
  toString() {
    if (this.str != null)
      return this.str;
    const e = new Array(Zi / 4);
    return this.parts.forEach((n, r) => {
      const i = Vi(n.toString());
      for (let s = 0; s < 4; s++)
        e[s + r * 4] = i[3 - s] || 0;
    }), this.str = Ro.fromArray(e, 16).toString();
  }
  toJSON() {
    return this.toString();
  }
}
const Nt = Do();
Nt && BigInt.prototype.toJSON == null && (BigInt.prototype.toJSON = function() {
  return this.toString();
});
const rr = {}, Hi = Nt ? function(e) {
  return BigInt(e);
} : function(e) {
  return e instanceof Ye ? e : (typeof e == "number" && (e = e.toString()), rr[e] != null || (rr[e] = Ye.fromString(e)), rr[e]);
}, ye = Hi(0), _r = Nt ? function(e = ye, n = ye) {
  return e & n;
} : function(e = ye, n = ye) {
  return e.and(n);
}, Fi = Nt ? function(e = ye, n = ye) {
  return e | n;
} : function(e = ye, n = ye) {
  return e.or(n);
}, xo = Nt ? function(e = ye, n = ye) {
  return e ^ n;
} : function(e = ye, n = ye) {
  return e.xor(n);
}, Po = Nt ? function(e = ye) {
  return ~e;
} : function(e = ye) {
  return e.not();
}, Qr = Nt ? function(e, n) {
  return e === n;
} : function(e, n) {
  return e == null || n == null ? e == n : e.equals(n);
};
function Lo(...t) {
  let e = t[0];
  for (let n = 1; n < t.length; n++)
    e = Fi(e, t[n]);
  return e;
}
function Uo(t, e) {
  return Qr(_r(t, e), e);
}
function Bo(t, e) {
  return !Qr(_r(t, e), ye);
}
function Go(t, e) {
  return e === ye ? t : Fi(t, e);
}
function Zo(t, e) {
  return e === ye ? t : xo(t, _r(t, e));
}
const Vo = Nt ? function(e) {
  return BigInt(1) << BigInt(e);
} : function(e) {
  return Ye.fromBit(e);
};
var j = {
  combine: Lo,
  add: Go,
  remove: Zo,
  filter: _r,
  invert: Po,
  has: Uo,
  hasAny: Bo,
  equals: Qr,
  deserialize: Hi,
  getFlag: Vo
}, yi;
(function(t) {
  t[t.CLOSE_NORMAL = 1e3] = "CLOSE_NORMAL", t[t.CLOSE_UNSUPPORTED = 1003] = "CLOSE_UNSUPPORTED", t[t.CLOSE_ABNORMAL = 1006] = "CLOSE_ABNORMAL", t[t.INVALID_CLIENTID = 4e3] = "INVALID_CLIENTID", t[t.INVALID_ORIGIN = 4001] = "INVALID_ORIGIN", t[t.RATELIMITED = 4002] = "RATELIMITED", t[t.TOKEN_REVOKED = 4003] = "TOKEN_REVOKED", t[t.INVALID_VERSION = 4004] = "INVALID_VERSION", t[t.INVALID_ENCODING = 4005] = "INVALID_ENCODING";
})(yi || (yi = {}));
var Cr;
(function(t) {
  t[t.INVALID_PAYLOAD = 4e3] = "INVALID_PAYLOAD", t[t.INVALID_COMMAND = 4002] = "INVALID_COMMAND", t[t.INVALID_EVENT = 4004] = "INVALID_EVENT", t[t.INVALID_PERMISSIONS = 4006] = "INVALID_PERMISSIONS";
})(Cr || (Cr = {}));
var qr;
(function(t) {
  t.LANDSCAPE = "landscape", t.PORTRAIT = "portrait";
})(qr || (qr = {}));
var ht;
(function(t) {
  t.MOBILE = "mobile", t.DESKTOP = "desktop";
})(ht || (ht = {}));
Object.freeze({
  CREATE_INSTANT_INVITE: j.getFlag(0),
  KICK_MEMBERS: j.getFlag(1),
  BAN_MEMBERS: j.getFlag(2),
  ADMINISTRATOR: j.getFlag(3),
  MANAGE_CHANNELS: j.getFlag(4),
  MANAGE_GUILD: j.getFlag(5),
  ADD_REACTIONS: j.getFlag(6),
  VIEW_AUDIT_LOG: j.getFlag(7),
  PRIORITY_SPEAKER: j.getFlag(8),
  STREAM: j.getFlag(9),
  VIEW_CHANNEL: j.getFlag(10),
  SEND_MESSAGES: j.getFlag(11),
  SEND_TTS_MESSAGES: j.getFlag(12),
  MANAGE_MESSAGES: j.getFlag(13),
  EMBED_LINKS: j.getFlag(14),
  ATTACH_FILES: j.getFlag(15),
  READ_MESSAGE_HISTORY: j.getFlag(16),
  MENTION_EVERYONE: j.getFlag(17),
  USE_EXTERNAL_EMOJIS: j.getFlag(18),
  VIEW_GUILD_INSIGHTS: j.getFlag(19),
  CONNECT: j.getFlag(20),
  SPEAK: j.getFlag(21),
  MUTE_MEMBERS: j.getFlag(22),
  DEAFEN_MEMBERS: j.getFlag(23),
  MOVE_MEMBERS: j.getFlag(24),
  USE_VAD: j.getFlag(25),
  CHANGE_NICKNAME: j.getFlag(26),
  MANAGE_NICKNAMES: j.getFlag(27),
  MANAGE_ROLES: j.getFlag(28),
  MANAGE_WEBHOOKS: j.getFlag(29),
  MANAGE_GUILD_EXPRESSIONS: j.getFlag(30),
  USE_APPLICATION_COMMANDS: j.getFlag(31),
  REQUEST_TO_SPEAK: j.getFlag(32),
  MANAGE_EVENTS: j.getFlag(33),
  MANAGE_THREADS: j.getFlag(34),
  CREATE_PUBLIC_THREADS: j.getFlag(35),
  CREATE_PRIVATE_THREADS: j.getFlag(36),
  USE_EXTERNAL_STICKERS: j.getFlag(37),
  SEND_MESSAGES_IN_THREADS: j.getFlag(38),
  USE_EMBEDDED_ACTIVITIES: j.getFlag(39),
  MODERATE_MEMBERS: j.getFlag(40),
  VIEW_CREATOR_MONETIZATION_ANALYTICS: j.getFlag(41),
  USE_SOUNDBOARD: j.getFlag(42),
  CREATE_GUILD_EXPRESSIONS: j.getFlag(43),
  CREATE_EVENTS: j.getFlag(44),
  USE_EXTERNAL_SOUNDS: j.getFlag(45),
  SEND_VOICE_MESSAGES: j.getFlag(46),
  SEND_POLLS: j.getFlag(49),
  USE_EXTERNAL_APPS: j.getFlag(50)
});
const Ti = -1, Ho = 250;
function Ie(t) {
  return Gi((e) => {
    var n;
    const [r] = (n = Object.entries(t).find(([, i]) => i === e)) !== null && n !== void 0 ? n : [];
    return e != null && r === void 0 ? t.UNHANDLED : e;
  }, _().or(G()));
}
function ji(t) {
  const e = Wr().transform((n) => {
    const r = t.safeParse(n);
    return r.success ? r.data : t._def.defaultValue();
  });
  return e.overlayType = t, e;
}
const Fo = L.object({ image_url: L.string() }), jo = L.object({ mediaUrl: L.string().max(1024) }), Ko = L.object({ access_token: L.union([L.string(), L.null()]).optional() }), Ki = L.object({
  access_token: L.string(),
  user: L.object({
    username: L.string(),
    discriminator: L.string(),
    id: L.string(),
    avatar: L.union([L.string(), L.null()]).optional(),
    public_flags: L.number(),
    global_name: L.union([L.string(), L.null()]).optional()
  }),
  scopes: L.array(ji(L.enum([
    "identify",
    "email",
    "connections",
    "guilds",
    "guilds.join",
    "guilds.members.read",
    "guilds.channels.read",
    "gdm.join",
    "bot",
    "rpc",
    "rpc.notifications.read",
    "rpc.voice.read",
    "rpc.voice.write",
    "rpc.video.read",
    "rpc.video.write",
    "rpc.screenshare.read",
    "rpc.screenshare.write",
    "rpc.activities.write",
    "webhook.incoming",
    "messages.read",
    "applications.builds.upload",
    "applications.builds.read",
    "applications.commands",
    "applications.commands.permissions.update",
    "applications.commands.update",
    "applications.store.update",
    "applications.entitlements",
    "activities.read",
    "activities.write",
    "relationships.read",
    "relationships.write",
    "voice",
    "dm_channels.read",
    "role_connections.write",
    "presences.read",
    "presences.write",
    "openid",
    "dm_channels.messages.read",
    "dm_channels.messages.write",
    "gateway.connect",
    "account.global_name.update",
    "payment_sources.country_code",
    "sdk.social_layer"
  ]).or(L.literal(-1)).default(-1))),
  expires: L.string(),
  application: L.object({
    description: L.string(),
    icon: L.union([L.string(), L.null()]).optional(),
    id: L.string(),
    rpc_origins: L.array(L.string()).optional(),
    name: L.string()
  })
}), Ci = L.object({
  participants: L.array(L.object({
    id: L.string(),
    username: L.string(),
    global_name: L.union([L.string(), L.null()]).optional(),
    discriminator: L.string(),
    avatar: L.union([L.string(), L.null()]).optional(),
    flags: L.number(),
    bot: L.boolean(),
    avatar_decoration_data: L.union([L.object({ asset: L.string(), skuId: L.string().optional() }), L.null()]).optional(),
    premium_type: L.union([L.number(), L.null()]).optional(),
    nickname: L.string().optional()
  }))
});
var We;
(function(t) {
  t.INITIATE_IMAGE_UPLOAD = "INITIATE_IMAGE_UPLOAD", t.OPEN_SHARE_MOMENT_DIALOG = "OPEN_SHARE_MOMENT_DIALOG", t.AUTHENTICATE = "AUTHENTICATE", t.GET_ACTIVITY_INSTANCE_CONNECTED_PARTICIPANTS = "GET_ACTIVITY_INSTANCE_CONNECTED_PARTICIPANTS";
})(We || (We = {}));
const Co = L.object({}).optional().nullable(), wi = L.void(), qi = {
  [We.INITIATE_IMAGE_UPLOAD]: {
    request: wi,
    response: Fo
  },
  [We.OPEN_SHARE_MOMENT_DIALOG]: {
    request: jo,
    response: Co
  },
  [We.AUTHENTICATE]: {
    request: Ko,
    response: Ki
  },
  [We.GET_ACTIVITY_INSTANCE_CONNECTED_PARTICIPANTS]: {
    request: wi,
    response: Ci
  }
}, qo = "DISPATCH";
var Z;
(function(t) {
  t.AUTHORIZE = "AUTHORIZE", t.AUTHENTICATE = "AUTHENTICATE", t.GET_GUILDS = "GET_GUILDS", t.GET_GUILD = "GET_GUILD", t.GET_CHANNEL = "GET_CHANNEL", t.GET_CHANNELS = "GET_CHANNELS", t.SELECT_VOICE_CHANNEL = "SELECT_VOICE_CHANNEL", t.SELECT_TEXT_CHANNEL = "SELECT_TEXT_CHANNEL", t.SUBSCRIBE = "SUBSCRIBE", t.UNSUBSCRIBE = "UNSUBSCRIBE", t.CAPTURE_SHORTCUT = "CAPTURE_SHORTCUT", t.SET_CERTIFIED_DEVICES = "SET_CERTIFIED_DEVICES", t.SET_ACTIVITY = "SET_ACTIVITY", t.GET_SKUS = "GET_SKUS", t.GET_ENTITLEMENTS = "GET_ENTITLEMENTS", t.GET_SKUS_EMBEDDED = "GET_SKUS_EMBEDDED", t.GET_ENTITLEMENTS_EMBEDDED = "GET_ENTITLEMENTS_EMBEDDED", t.START_PURCHASE = "START_PURCHASE", t.SET_CONFIG = "SET_CONFIG", t.SEND_ANALYTICS_EVENT = "SEND_ANALYTICS_EVENT", t.USER_SETTINGS_GET_LOCALE = "USER_SETTINGS_GET_LOCALE", t.OPEN_EXTERNAL_LINK = "OPEN_EXTERNAL_LINK", t.ENCOURAGE_HW_ACCELERATION = "ENCOURAGE_HW_ACCELERATION", t.CAPTURE_LOG = "CAPTURE_LOG", t.SET_ORIENTATION_LOCK_STATE = "SET_ORIENTATION_LOCK_STATE", t.OPEN_INVITE_DIALOG = "OPEN_INVITE_DIALOG", t.GET_PLATFORM_BEHAVIORS = "GET_PLATFORM_BEHAVIORS", t.GET_CHANNEL_PERMISSIONS = "GET_CHANNEL_PERMISSIONS", t.OPEN_SHARE_MOMENT_DIALOG = "OPEN_SHARE_MOMENT_DIALOG", t.INITIATE_IMAGE_UPLOAD = "INITIATE_IMAGE_UPLOAD", t.GET_ACTIVITY_INSTANCE_CONNECTED_PARTICIPANTS = "GET_ACTIVITY_INSTANCE_CONNECTED_PARTICIPANTS";
})(Z || (Z = {}));
const en = R({
  cmd: _(),
  data: Dn(),
  evt: mr(),
  nonce: _()
}).passthrough(), $o = Object.assign(Object.assign({}, Ki.shape.scopes.element.overlayType._def.innerType.options[0].Values), { UNHANDLED: -1 });
Ie($o);
const It = R({
  id: _(),
  username: _(),
  discriminator: _(),
  global_name: _().optional().nullable(),
  avatar: _().optional().nullable(),
  avatar_decoration_data: R({
    asset: _(),
    sku_id: _().optional()
  }).nullable(),
  bot: q(),
  flags: G().optional().nullable(),
  premium_type: G().optional().nullable()
}), Jr = R({
  user: It,
  nick: _().optional().nullable(),
  roles: ee(_()),
  joined_at: _(),
  deaf: q(),
  mute: q()
}), zo = R({
  user_id: _(),
  nick: _().optional().nullable(),
  guild_id: _(),
  avatar: _().optional().nullable(),
  avatar_decoration_data: R({
    asset: _(),
    sku_id: _().optional().nullable()
  }).optional().nullable(),
  color_string: _().optional().nullable()
}), ei = R({
  id: _(),
  name: _().optional().nullable(),
  roles: ee(_()).optional().nullable(),
  user: It.optional().nullable(),
  require_colons: q().optional().nullable(),
  managed: q().optional().nullable(),
  animated: q().optional().nullable(),
  available: q().optional().nullable()
}), $i = R({
  mute: q(),
  deaf: q(),
  self_mute: q(),
  self_deaf: q(),
  suppress: q()
}), zi = R({
  mute: q(),
  nick: _(),
  user: It,
  voice_state: $i,
  volume: G()
}), Yo = {
  UNHANDLED: -1,
  IDLE: "idle",
  DND: "dnd",
  ONLINE: "online",
  OFFLINE: "offline"
}, ir = Ie(Yo), gn = R({
  name: _(),
  type: G(),
  url: _().optional().nullable(),
  created_at: G().optional().nullable(),
  timestamps: R({
    start: G(),
    end: G()
  }).partial().optional().nullable(),
  application_id: _().optional().nullable(),
  details: _().optional().nullable(),
  state: _().optional().nullable(),
  emoji: ei.optional().nullable(),
  party: R({
    id: _().optional().nullable(),
    size: ee(G()).optional().nullable()
  }).optional().nullable(),
  assets: R({
    large_image: _().nullable(),
    large_text: _().nullable(),
    small_image: _().nullable(),
    small_text: _().nullable()
  }).partial().optional().nullable(),
  secrets: R({
    join: _(),
    match: _()
  }).partial().optional().nullable(),
  instance: q().optional().nullable(),
  flags: G().optional().nullable()
}), Wo = {
  UNHANDLED: -1,
  ROLE: 0,
  MEMBER: 1
}, Xo = R({
  id: _(),
  type: Ie(Wo),
  allow: _(),
  deny: _()
}), Yi = {
  UNHANDLED: -1,
  DM: 1,
  GROUP_DM: 3,
  GUILD_TEXT: 0,
  GUILD_VOICE: 2,
  GUILD_CATEGORY: 4,
  GUILD_ANNOUNCEMENT: 5,
  GUILD_STORE: 6,
  ANNOUNCEMENT_THREAD: 10,
  PUBLIC_THREAD: 11,
  PRIVATE_THREAD: 12,
  GUILD_STAGE_VOICE: 13,
  GUILD_DIRECTORY: 14,
  GUILD_FORUM: 15
}, Wi = R({
  id: _(),
  type: Ie(Yi),
  guild_id: _().optional().nullable(),
  position: G().optional().nullable(),
  permission_overwrites: ee(Xo).optional().nullable(),
  name: _().optional().nullable(),
  topic: _().optional().nullable(),
  nsfw: q().optional().nullable(),
  last_message_id: _().optional().nullable(),
  bitrate: G().optional().nullable(),
  user_limit: G().optional().nullable(),
  rate_limit_per_user: G().optional().nullable(),
  recipients: ee(It).optional().nullable(),
  icon: _().optional().nullable(),
  owner_id: _().optional().nullable(),
  application_id: _().optional().nullable(),
  parent_id: _().optional().nullable(),
  last_pin_timestamp: _().optional().nullable()
}), Qo = R({
  user: It,
  guild_id: _(),
  status: ir,
  activities: ee(gn),
  client_status: R({
    desktop: ir,
    mobile: ir,
    web: ir
  }).partial()
}), Jo = R({
  id: _(),
  name: _(),
  color: G(),
  hoist: q(),
  position: G(),
  permissions: _(),
  managed: q(),
  mentionable: q()
});
R({
  id: _(),
  name: _(),
  owner_id: _(),
  icon: _().nullable(),
  icon_hash: _().optional().nullable(),
  splash: _().nullable(),
  discovery_splash: _().nullable(),
  owner: q().optional().nullable(),
  permissions: _().optional().nullable(),
  region: _(),
  afk_channel_id: _().nullable(),
  afk_timeout: G(),
  widget_enabled: q().optional().nullable(),
  widget_channel_id: _().optional().nullable(),
  verification_level: G(),
  default_message_notifications: G(),
  explicit_content_filter: G(),
  roles: ee(Jo),
  emojis: ee(ei),
  features: ee(_()),
  mfa_level: G(),
  application_id: _().nullable(),
  system_channel_id: _().nullable(),
  system_channel_flags: G(),
  rules_channel_id: _().nullable(),
  joined_at: _().optional().nullable(),
  large: q().optional().nullable(),
  unavailable: q().optional().nullable(),
  member_count: G().optional().nullable(),
  voice_states: ee($i).optional().nullable(),
  members: ee(Jr).optional().nullable(),
  channels: ee(Wi).optional().nullable(),
  presences: ee(Qo).optional().nullable(),
  max_presences: G().optional().nullable(),
  max_members: G().optional().nullable(),
  vanity_url_code: _().nullable(),
  description: _().nullable(),
  banner: _().nullable(),
  premium_tier: G(),
  premium_subscription_count: G().optional().nullable(),
  preferred_locale: _(),
  public_updates_channel_id: _().nullable(),
  max_video_channel_users: G().optional().nullable(),
  approximate_member_count: G().optional().nullable(),
  approximate_presence_count: G().optional().nullable()
});
const el = R({
  id: _(),
  guild_id: _(),
  type: G(),
  name: _()
}), tl = R({
  id: _(),
  filename: _(),
  size: G(),
  url: _(),
  proxy_url: _(),
  height: G().optional().nullable(),
  width: G().optional().nullable()
}), nl = R({
  text: _(),
  icon_url: _().optional().nullable(),
  proxy_icon_url: _().optional().nullable()
}), $r = R({
  url: _().optional().nullable(),
  proxy_url: _().optional().nullable(),
  height: G().optional().nullable(),
  width: G().optional().nullable()
}), rl = $r.omit({ proxy_url: !0 }), il = R({
  name: _().optional().nullable(),
  url: _().optional().nullable()
}), sl = R({
  name: _().optional().nullable(),
  url: _().optional().nullable(),
  icon_url: _().optional().nullable(),
  proxy_icon_url: _().optional().nullable()
}), al = R({
  name: _(),
  value: _(),
  inline: q()
}), ol = R({
  title: _().optional().nullable(),
  type: _().optional().nullable(),
  description: _().optional().nullable(),
  url: _().optional().nullable(),
  timestamp: _().optional().nullable(),
  color: G().optional().nullable(),
  footer: nl.optional().nullable(),
  image: $r.optional().nullable(),
  thumbnail: $r.optional().nullable(),
  video: rl.optional().nullable(),
  provider: il.optional().nullable(),
  author: sl.optional().nullable(),
  fields: ee(al).optional().nullable()
}), ll = R({
  count: G(),
  me: q(),
  emoji: ei
}), ul = R({
  type: G(),
  party_id: _().optional().nullable()
}), cl = R({
  id: _(),
  cover_image: _().optional().nullable(),
  description: _(),
  icon: _().optional().nullable(),
  name: _()
}), dl = R({
  message_id: _().optional().nullable(),
  channel_id: _().optional().nullable(),
  guild_id: _().optional().nullable()
}), fl = R({
  id: _(),
  channel_id: _(),
  guild_id: _().optional().nullable(),
  author: It.optional().nullable(),
  member: Jr.optional().nullable(),
  content: _(),
  timestamp: _(),
  edited_timestamp: _().optional().nullable(),
  tts: q(),
  mention_everyone: q(),
  mentions: ee(It),
  mention_roles: ee(_()),
  mention_channels: ee(el),
  attachments: ee(tl),
  embeds: ee(ol),
  reactions: ee(ll).optional().nullable(),
  nonce: Xr([_(), G()]).optional().nullable(),
  pinned: q(),
  webhook_id: _().optional().nullable(),
  type: G(),
  activity: ul.optional().nullable(),
  application: cl.optional().nullable(),
  message_reference: dl.optional().nullable(),
  flags: G().optional().nullable(),
  stickers: ee(Dn()).optional().nullable(),
  // Cannot self reference, but this is possibly a Message
  referenced_message: Dn().optional().nullable()
}), hl = R({
  id: _(),
  name: _()
}), pl = {
  UNHANDLED: -1,
  KEYBOARD_KEY: 0,
  MOUSE_BUTTON: 1,
  KEYBOARD_MODIFIER_KEY: 2,
  GAMEPAD_BUTTON: 3
}, Xi = R({
  type: Ie(pl),
  code: G(),
  name: _()
}), gl = {
  UNHANDLED: -1,
  PUSH_TO_TALK: "PUSH_TO_TALK",
  VOICE_ACTIVITY: "VOICE_ACTIVITY"
}, ml = R({
  type: Ie(gl),
  auto_threshold: q(),
  threshold: G(),
  shortcut: ee(Xi),
  delay: G()
}), Ai = R({
  device_id: _(),
  volume: G(),
  available_devices: ee(hl)
}), _l = {
  UNHANDLED: -1,
  AUDIO_INPUT: "AUDIO_INPUT",
  AUDIO_OUTPUT: "AUDIO_OUTPUT",
  VIDEO_INPUT: "VIDEO_INPUT"
};
R({
  type: Ie(_l),
  id: _(),
  vendor: R({
    name: _(),
    url: _()
  }),
  model: R({
    name: _(),
    url: _()
  }),
  related: ee(_()),
  echo_cancellation: q().optional().nullable(),
  noise_suppression: q().optional().nullable(),
  automatic_gain_control: q().optional().nullable(),
  hardware_mute: q().optional().nullable()
});
const vl = {
  UNHANDLED: -1,
  APPLICATION: 1,
  DLC: 2,
  CONSUMABLE: 3,
  BUNDLE: 4,
  SUBSCRIPTION: 5
}, El = R({
  id: _(),
  name: _(),
  type: Ie(vl),
  price: R({
    amount: G(),
    currency: _()
  }),
  application_id: _(),
  flags: G(),
  release_date: _().nullable()
}), yl = {
  UNHANDLED: -1,
  PURCHASE: 1,
  PREMIUM_SUBSCRIPTION: 2,
  DEVELOPER_GIFT: 3,
  TEST_MODE_PURCHASE: 4,
  FREE_PURCHASE: 5,
  USER_GIFT: 6,
  PREMIUM_PURCHASE: 7
}, ti = R({
  id: _(),
  sku_id: _(),
  application_id: _(),
  user_id: _(),
  gift_code_flags: G(),
  type: Ie(yl),
  gifter_user_id: _().optional().nullable(),
  branches: ee(_()).optional().nullable(),
  starts_at: _().optional().nullable(),
  // ISO string
  ends_at: _().optional().nullable(),
  // ISO string
  parent_id: _().optional().nullable(),
  consumed: q().optional().nullable(),
  deleted: q().optional().nullable(),
  gift_code_batch_id: _().optional().nullable()
}), Tl = {
  UNHANDLED: -1,
  UNLOCKED: 1,
  PORTRAIT: 2,
  LANDSCAPE: 3
};
Ie(Tl);
const wl = {
  UNHANDLED: -1,
  NOMINAL: 0,
  FAIR: 1,
  SERIOUS: 2,
  CRITICAL: 3
}, Al = Ie(wl), Qi = {
  UNHANDLED: -1,
  PORTRAIT: 0,
  LANDSCAPE: 1
};
Ie(Qi);
const Ji = {
  UNHANDLED: -1,
  FOCUSED: 0,
  PIP: 1,
  GRID: 2
};
Ie(Ji);
const ni = "ERROR";
var ie;
(function(t) {
  t.READY = "READY", t.VOICE_STATE_UPDATE = "VOICE_STATE_UPDATE", t.SPEAKING_START = "SPEAKING_START", t.SPEAKING_STOP = "SPEAKING_STOP", t.ACTIVITY_LAYOUT_MODE_UPDATE = "ACTIVITY_LAYOUT_MODE_UPDATE", t.ORIENTATION_UPDATE = "ORIENTATION_UPDATE", t.CURRENT_USER_UPDATE = "CURRENT_USER_UPDATE", t.CURRENT_GUILD_MEMBER_UPDATE = "CURRENT_GUILD_MEMBER_UPDATE", t.ENTITLEMENT_CREATE = "ENTITLEMENT_CREATE", t.THERMAL_STATE_UPDATE = "THERMAL_STATE_UPDATE", t.ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE = "ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE";
})(ie || (ie = {}));
const Le = en.extend({
  evt: Jt(ie),
  nonce: _().nullable(),
  cmd: _e(qo),
  data: R({}).passthrough()
}), es = en.extend({
  evt: _e(ni),
  data: R({
    code: G(),
    message: _().optional()
  }).passthrough(),
  cmd: Jt(Z),
  nonce: _().nullable()
}), bl = Le.extend({
  evt: _()
}), Il = Xr([Le, bl, es]);
function Nl(t) {
  const e = t.evt;
  if (!(e in ie))
    throw new Error(`Unrecognized event type ${t.evt}`);
  return Sl[e].payload.parse(t);
}
const Sl = {
  /**
   * @description
   * The READY event is emitted by Discord's RPC server in reply to a client
   * initiating the RPC handshake. The event includes information about
   * - the rpc server version
   * - the discord client configuration
   * - the (basic) user object
   *
   * Unlike other events, READY will only be omitted once, immediately after the
   * Embedded App SDK is initialized
   *
   * # Supported Platforms
   * | Web | iOS | Android |
   * |-----|-----|---------|
   * | ✅  | ✅  | ✅      |
   *
   * Required scopes: []
   *
   */
  [ie.READY]: {
    payload: Le.extend({
      evt: _e(ie.READY),
      data: R({
        v: G(),
        config: R({
          cdn_host: _().optional(),
          api_endpoint: _(),
          environment: _()
        }),
        user: R({
          id: _(),
          username: _(),
          discriminator: _(),
          avatar: _().optional()
        }).optional()
      })
    })
  },
  [ie.VOICE_STATE_UPDATE]: {
    payload: Le.extend({
      evt: _e(ie.VOICE_STATE_UPDATE),
      data: zi
    }),
    subscribeArgs: R({
      channel_id: _()
    })
  },
  [ie.SPEAKING_START]: {
    payload: Le.extend({
      evt: _e(ie.SPEAKING_START),
      data: R({
        lobby_id: _().optional(),
        channel_id: _().optional(),
        user_id: _()
      })
    }),
    subscribeArgs: R({
      lobby_id: _().nullable().optional(),
      channel_id: _().nullable().optional()
    })
  },
  [ie.SPEAKING_STOP]: {
    payload: Le.extend({
      evt: _e(ie.SPEAKING_STOP),
      data: R({
        lobby_id: _().optional(),
        channel_id: _().optional(),
        user_id: _()
      })
    }),
    subscribeArgs: R({
      lobby_id: _().nullable().optional(),
      channel_id: _().nullable().optional()
    })
  },
  [ie.ACTIVITY_LAYOUT_MODE_UPDATE]: {
    payload: Le.extend({
      evt: _e(ie.ACTIVITY_LAYOUT_MODE_UPDATE),
      data: R({
        layout_mode: Ie(Ji)
      })
    })
  },
  [ie.ORIENTATION_UPDATE]: {
    payload: Le.extend({
      evt: _e(ie.ORIENTATION_UPDATE),
      data: R({
        screen_orientation: Ie(Qi),
        /**
         * @deprecated use screen_orientation instead
         */
        orientation: Jt(qr)
      })
    })
  },
  [ie.CURRENT_USER_UPDATE]: {
    payload: Le.extend({
      evt: _e(ie.CURRENT_USER_UPDATE),
      data: It
    })
  },
  [ie.CURRENT_GUILD_MEMBER_UPDATE]: {
    payload: Le.extend({
      evt: _e(ie.CURRENT_GUILD_MEMBER_UPDATE),
      data: zo
    }),
    subscribeArgs: R({
      guild_id: _()
    })
  },
  [ie.ENTITLEMENT_CREATE]: {
    payload: Le.extend({
      evt: _e(ie.ENTITLEMENT_CREATE),
      data: R({ entitlement: ti })
    })
  },
  [ie.THERMAL_STATE_UPDATE]: {
    payload: Le.extend({
      evt: _e(ie.THERMAL_STATE_UPDATE),
      data: R({ thermal_state: Al })
    })
  },
  [ie.ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE]: {
    payload: Le.extend({
      evt: _e(ie.ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE),
      data: R({
        participants: Ci.shape.participants
      })
    })
  }
};
function Ol(t, e) {
  throw e;
}
const vr = R({}).nullable(), ts = R({
  code: _()
}), Rl = R({
  guilds: ee(R({
    id: _(),
    name: _()
  }))
}), Dl = R({
  id: _(),
  name: _(),
  icon_url: _().optional(),
  members: ee(Jr)
}), Qt = R({
  id: _(),
  type: Ie(Yi),
  guild_id: _().optional().nullable(),
  name: _().optional().nullable(),
  topic: _().optional().nullable(),
  bitrate: G().optional().nullable(),
  user_limit: G().optional().nullable(),
  position: G().optional().nullable(),
  voice_states: ee(zi),
  messages: ee(fl)
}), Ml = R({
  channels: ee(Wi)
});
Qt.nullable();
const kl = Qt.nullable(), xl = Qt.nullable();
R({
  input: Ai,
  output: Ai,
  mode: ml,
  automatic_gain_control: q(),
  echo_cancellation: q(),
  noise_suppression: q(),
  qos: q(),
  silence_warning: q(),
  deaf: q(),
  mute: q()
});
const Pl = R({
  evt: _()
}), Ll = R({ shortcut: Xi }), ns = gn, rs = R({ skus: ee(El) }), is = R({ entitlements: ee(ti) }), ss = ee(ti).nullable(), as = R({
  use_interactive_pip: q()
}), os = R({
  locale: _()
}), ls = R({
  enabled: q()
}), us = R({
  permissions: Ui().or(_())
}), cs = ji(R({ opened: q().or(mr()) }).default({ opened: null })), ds = R({
  iosKeyboardResizesView: Bi(q())
}), Ul = en.extend({
  cmd: Jt(Z),
  evt: mr()
});
function Bl({ cmd: t, data: e }) {
  switch (t) {
    case Z.AUTHORIZE:
      return ts.parse(e);
    case Z.CAPTURE_SHORTCUT:
      return Ll.parse(e);
    case Z.ENCOURAGE_HW_ACCELERATION:
      return ls.parse(e);
    case Z.GET_CHANNEL:
      return Qt.parse(e);
    case Z.GET_CHANNELS:
      return Ml.parse(e);
    case Z.GET_CHANNEL_PERMISSIONS:
      return us.parse(e);
    case Z.GET_GUILD:
      return Dl.parse(e);
    case Z.GET_GUILDS:
      return Rl.parse(e);
    case Z.GET_PLATFORM_BEHAVIORS:
      return ds.parse(e);
    case Z.GET_CHANNEL:
      return Qt.parse(e);
    case Z.SELECT_TEXT_CHANNEL:
      return xl.parse(e);
    case Z.SELECT_VOICE_CHANNEL:
      return kl.parse(e);
    case Z.SET_ACTIVITY:
      return ns.parse(e);
    case Z.GET_SKUS_EMBEDDED:
      return rs.parse(e);
    case Z.GET_ENTITLEMENTS_EMBEDDED:
      return is.parse(e);
    case Z.SET_CONFIG:
      return as.parse(e);
    case Z.START_PURCHASE:
      return ss.parse(e);
    case Z.SUBSCRIBE:
    case Z.UNSUBSCRIBE:
      return Pl.parse(e);
    case Z.USER_SETTINGS_GET_LOCALE:
      return os.parse(e);
    case Z.OPEN_EXTERNAL_LINK:
      return cs.parse(e);
    case Z.SET_ORIENTATION_LOCK_STATE:
    case Z.SET_CERTIFIED_DEVICES:
    case Z.SEND_ANALYTICS_EVENT:
    case Z.OPEN_INVITE_DIALOG:
    case Z.CAPTURE_LOG:
    case Z.GET_SKUS:
    case Z.GET_ENTITLEMENTS:
      return vr.parse(e);
    case Z.AUTHENTICATE:
    case Z.INITIATE_IMAGE_UPLOAD:
    case Z.OPEN_SHARE_MOMENT_DIALOG:
    case Z.GET_ACTIVITY_INSTANCE_CONNECTED_PARTICIPANTS:
      const { response: n } = qi[t];
      return n.parse(e);
    default:
      Ol(t, new Error(`Unrecognized command ${t}`));
  }
}
function Gl(t) {
  return Object.assign(Object.assign({}, t), { data: Bl(t) });
}
R({
  frame_id: _(),
  platform: Jt(ht).optional().nullable()
});
R({
  v: _e(1),
  encoding: _e("json").optional(),
  client_id: _(),
  frame_id: _()
});
const Zl = R({
  code: G(),
  message: _().optional()
}), Vl = R({
  evt: _().nullable(),
  nonce: _().nullable(),
  data: Dn().nullable(),
  cmd: _()
}).passthrough();
function Hl(t) {
  const e = Vl.parse(t);
  return e.evt != null ? e.evt === ni ? es.parse(e) : Nl(Il.parse(e)) : Gl(Ul.passthrough().parse(e));
}
function xe(t, e, n, r = () => {
}) {
  const i = en.extend({
    cmd: _e(e),
    data: n
  });
  return async (s) => {
    const u = await t({ cmd: e, args: s, transfer: r(s) });
    return i.parse(u).data;
  };
}
function Er(t, e = () => {
}) {
  const n = qi[t].response, r = en.extend({
    cmd: _e(t),
    data: n
  });
  return (i) => async (s) => {
    const u = await i({
      // @ts-expect-error - Merge commands
      cmd: t,
      args: s,
      transfer: e(s)
    });
    return r.parse(u).data;
  };
}
const Fl = Er(We.AUTHENTICATE), jl = (t) => xe(t, Z.AUTHORIZE, ts), Kl = (t) => xe(t, Z.CAPTURE_LOG, vr), Cl = (t) => xe(t, Z.ENCOURAGE_HW_ACCELERATION, ls), ql = (t) => xe(t, Z.GET_ENTITLEMENTS_EMBEDDED, is), $l = (t) => xe(t, Z.GET_SKUS_EMBEDDED, rs), zl = (t) => xe(t, Z.GET_CHANNEL_PERMISSIONS, us), Yl = (t) => xe(t, Z.GET_PLATFORM_BEHAVIORS, ds), Wl = (t) => xe(t, Z.OPEN_EXTERNAL_LINK, cs), Xl = (t) => xe(t, Z.OPEN_INVITE_DIALOG, vr), Ql = Er(We.OPEN_SHARE_MOMENT_DIALOG);
gn.pick({
  state: !0,
  details: !0,
  timestamps: !0,
  assets: !0,
  party: !0,
  secrets: !0,
  instance: !0,
  type: !0
}).extend({
  type: gn.shape.type.optional(),
  instance: gn.shape.instance.optional()
}).nullable();
const Jl = (t) => xe(t, Z.SET_ACTIVITY, ns), eu = (t) => xe(t, Z.SET_CONFIG, as);
function tu({ sendCommand: t, cmd: e, response: n, fallbackTransform: r, transferTransform: i = () => {
} }) {
  const s = en.extend({
    cmd: _e(e),
    data: n
  });
  return async (u) => {
    try {
      const c = await t({ cmd: e, args: u, transfer: i(u) });
      return s.parse(c).data;
    } catch (c) {
      if (c.code === Cr.INVALID_PAYLOAD) {
        const g = r(u), f = await t({ cmd: e, args: g, transfer: i(g) });
        return s.parse(f).data;
      } else
        throw c;
    }
  };
}
const nu = (t) => ({
  lock_state: t.lock_state,
  picture_in_picture_lock_state: t.picture_in_picture_lock_state
}), ru = (t) => tu({
  sendCommand: t,
  cmd: Z.SET_ORIENTATION_LOCK_STATE,
  response: vr,
  fallbackTransform: nu
}), iu = (t) => xe(t, Z.START_PURCHASE, ss), su = (t) => xe(t, Z.USER_SETTINGS_GET_LOCALE, os), au = Er(We.INITIATE_IMAGE_UPLOAD), ou = (t) => xe(t, Z.GET_CHANNEL, Qt), lu = Er(We.GET_ACTIVITY_INSTANCE_CONNECTED_PARTICIPANTS);
function uu(t) {
  return {
    authenticate: Fl(t),
    authorize: jl(t),
    captureLog: Kl(t),
    encourageHardwareAcceleration: Cl(t),
    getChannel: ou(t),
    getChannelPermissions: zl(t),
    getEntitlements: ql(t),
    getPlatformBehaviors: Yl(t),
    getSkus: $l(t),
    openExternalLink: Wl(t),
    openInviteDialog: Xl(t),
    openShareMomentDialog: Ql(t),
    setActivity: Jl(t),
    setConfig: eu(t),
    setOrientationLockState: ru(t),
    startPurchase: iu(t),
    userSettingsGetLocale: su(t),
    initiateImageUpload: au(t),
    getInstanceConnectedParticipants: lu(t)
  };
}
class cu extends Error {
  constructor(e, n = "") {
    super(n), this.code = e, this.message = n, this.name = "Discord SDK Error";
  }
}
function du() {
  return {
    disableConsoleLogOverride: !1
  };
}
const fu = ["log", "warn", "debug", "info", "error"];
function hu(t, e, n) {
  const r = t[e], i = t;
  r && (t[e] = function() {
    const s = [].slice.call(arguments), u = "" + s.join(" ");
    n(e, u), r.apply(i, s);
  });
}
var pu = "1.7.0", gu = typeof crypto < "u" && crypto.randomUUID && crypto.randomUUID.bind(crypto), bi = {
  randomUUID: gu
}, sr, mu = new Uint8Array(16);
function _u() {
  if (!sr && (sr = typeof crypto < "u" && crypto.getRandomValues && crypto.getRandomValues.bind(crypto), !sr))
    throw new Error("crypto.getRandomValues() not supported. See https://github.com/uuidjs/uuid#getrandomvalues-not-supported");
  return sr(mu);
}
var Ee = [];
for (var Gr = 0; Gr < 256; ++Gr)
  Ee.push((Gr + 256).toString(16).slice(1));
function vu(t, e = 0) {
  return (Ee[t[e + 0]] + Ee[t[e + 1]] + Ee[t[e + 2]] + Ee[t[e + 3]] + "-" + Ee[t[e + 4]] + Ee[t[e + 5]] + "-" + Ee[t[e + 6]] + Ee[t[e + 7]] + "-" + Ee[t[e + 8]] + Ee[t[e + 9]] + "-" + Ee[t[e + 10]] + Ee[t[e + 11]] + Ee[t[e + 12]] + Ee[t[e + 13]] + Ee[t[e + 14]] + Ee[t[e + 15]]).toLowerCase();
}
function Ii(t, e, n) {
  if (bi.randomUUID && !e && !t)
    return bi.randomUUID();
  t = t || {};
  var r = t.random || (t.rng || _u)();
  return r[6] = r[6] & 15 | 64, r[8] = r[8] & 63 | 128, vu(r);
}
var ft;
(function(t) {
  t[t.HANDSHAKE = 0] = "HANDSHAKE", t[t.FRAME = 1] = "FRAME", t[t.CLOSE = 2] = "CLOSE", t[t.HELLO = 3] = "HELLO";
})(ft || (ft = {}));
const Eu = new Set(yu());
function yu() {
  return typeof window > "u" ? [] : [
    window.location.origin,
    "https://discord.com",
    "https://discordapp.com",
    "https://ptb.discord.com",
    "https://ptb.discordapp.com",
    "https://canary.discord.com",
    "https://canary.discordapp.com",
    "https://staging.discord.co",
    "http://localhost:3333",
    "https://pax.discord.com",
    "null"
  ];
}
function Tu() {
  var t;
  return [(t = window.parent.opener) !== null && t !== void 0 ? t : window.parent, document.referrer ? document.referrer : "*"];
}
class wu {
  getTransfer(e) {
    var n;
    switch (e.cmd) {
      case Z.SUBSCRIBE:
      case Z.UNSUBSCRIBE:
        return;
      default:
        return (n = e.transfer) !== null && n !== void 0 ? n : void 0;
    }
  }
  constructor(e, n) {
    if (this.sdkVersion = pu, this.mobileAppVersion = null, this.source = null, this.sourceOrigin = "", this.eventBus = new xa(), this.pendingCommands = /* @__PURE__ */ new Map(), this.sendCommand = (c) => {
      var g;
      if (this.source == null)
        throw new Error("Attempting to send message before initialization");
      const f = Ii();
      return (g = this.source) === null || g === void 0 || g.postMessage([ft.FRAME, Object.assign(Object.assign({}, c), { nonce: f })], this.sourceOrigin, this.getTransfer(c)), new Promise((m, A) => {
        this.pendingCommands.set(f, { resolve: m, reject: A });
      });
    }, this.commands = uu(this.sendCommand), this.handleMessage = (c) => {
      if (!Eu.has(c.origin))
        return;
      const g = c.data;
      if (!Array.isArray(g))
        return;
      const [f, d] = g;
      switch (f) {
        case ft.HELLO:
          return;
        case ft.CLOSE:
          return this.handleClose(d);
        case ft.HANDSHAKE:
          return this.handleHandshake();
        case ft.FRAME:
          return this.handleFrame(d);
        default:
          throw new Error("Invalid message format");
      }
    }, this.isReady = !1, this.clientId = e, this.configuration = n ?? du(), typeof window < "u" && window.addEventListener("message", this.handleMessage), typeof window > "u") {
      this.frameId = "", this.instanceId = "", this.platform = ht.DESKTOP, this.guildId = null, this.channelId = null, this.locationId = null;
      return;
    }
    const r = new URLSearchParams(this._getSearch()), i = r.get("frame_id");
    if (!i)
      throw new Error("frame_id query param is not defined");
    this.frameId = i;
    const s = r.get("instance_id");
    if (!s)
      throw new Error("instance_id query param is not defined");
    this.instanceId = s;
    const u = r.get("platform");
    if (u) {
      if (u !== ht.DESKTOP && u !== ht.MOBILE)
        throw new Error(`Invalid query param "platform" of "${u}". Valid values are "${ht.DESKTOP}" or "${ht.MOBILE}"`);
    } else
      throw new Error("platform query param is not defined");
    this.platform = u, this.guildId = r.get("guild_id"), this.channelId = r.get("channel_id"), this.locationId = r.get("location_id"), this.mobileAppVersion = r.get("mobile_app_version"), [this.source, this.sourceOrigin] = Tu(), this.addOnReadyListener(), this.handshake();
  }
  close(e, n) {
    var r;
    window.removeEventListener("message", this.handleMessage);
    const i = Ii();
    (r = this.source) === null || r === void 0 || r.postMessage([ft.CLOSE, { code: e, message: n, nonce: i }], this.sourceOrigin);
  }
  async subscribe(e, n, ...r) {
    const [i] = r, s = this.eventBus.listenerCount(e), u = this.eventBus.on(e, n);
    return Object.values(ie).includes(e) && e !== ie.READY && s === 0 && await this.sendCommand({
      cmd: Z.SUBSCRIBE,
      args: i,
      evt: e
    }), u;
  }
  async unsubscribe(e, n, ...r) {
    const [i] = r;
    return e !== ie.READY && this.eventBus.listenerCount(e) === 1 && await this.sendCommand({
      cmd: Z.UNSUBSCRIBE,
      evt: e,
      args: i
    }), this.eventBus.off(e, n);
  }
  async ready() {
    this.isReady || await new Promise((e) => {
      this.eventBus.once(ie.READY, e);
    });
  }
  parseMajorMobileVersion() {
    if (this.mobileAppVersion && this.mobileAppVersion.includes("."))
      try {
        return parseInt(this.mobileAppVersion.split(".")[0]);
      } catch {
        return Ti;
      }
    return Ti;
  }
  handshake() {
    var e;
    const n = {
      v: 1,
      encoding: "json",
      client_id: this.clientId,
      frame_id: this.frameId
    }, r = this.parseMajorMobileVersion();
    (this.platform === ht.DESKTOP || r >= Ho) && (n.sdk_version = this.sdkVersion), (e = this.source) === null || e === void 0 || e.postMessage([ft.HANDSHAKE, n], this.sourceOrigin);
  }
  addOnReadyListener() {
    this.eventBus.once(ie.READY, () => {
      this.overrideConsoleLogging(), this.isReady = !0;
    });
  }
  overrideConsoleLogging() {
    if (this.configuration.disableConsoleLogOverride)
      return;
    const e = (n, r) => {
      this.commands.captureLog({
        level: n,
        message: r
      });
    };
    fu.forEach((n) => {
      hu(console, n, e);
    });
  }
  handleClose(e) {
    Zl.parse(e);
  }
  handleHandshake() {
  }
  handleFrame(e) {
    var n, r;
    let i;
    try {
      i = Hl(e);
    } catch (s) {
      console.error("Failed to parse", e), console.error(s);
      return;
    }
    if (i.cmd === "DISPATCH")
      this.eventBus.emit(i.evt, i.data);
    else {
      if (i.evt === ni) {
        if (i.nonce != null) {
          (n = this.pendingCommands.get(i.nonce)) === null || n === void 0 || n.reject(i.data), this.pendingCommands.delete(i.nonce);
          return;
        }
        this.eventBus.emit("error", new cu(i.data.code, i.data.message));
      }
      if (i.nonce == null) {
        console.error("Missing nonce", e);
        return;
      }
      (r = this.pendingCommands.get(i.nonce)) === null || r === void 0 || r.resolve(i), this.pendingCommands.delete(i.nonce);
    }
  }
  _getSearch() {
    return typeof window > "u" ? "" : window.location.search;
  }
}
var tn = 1e9, Au = {
  // These values must be integers within the stated ranges (inclusive).
  // Most of these values can be changed during run-time using `Decimal.config`.
  // The maximum number of significant digits of the result of a calculation or base conversion.
  // E.g. `Decimal.config({ precision: 20 });`
  precision: 20,
  // 1 to MAX_DIGITS
  // The rounding mode used by default by `toInteger`, `toDecimalPlaces`, `toExponential`,
  // `toFixed`, `toPrecision` and `toSignificantDigits`.
  //
  // ROUND_UP         0 Away from zero.
  // ROUND_DOWN       1 Towards zero.
  // ROUND_CEIL       2 Towards +Infinity.
  // ROUND_FLOOR      3 Towards -Infinity.
  // ROUND_HALF_UP    4 Towards nearest neighbour. If equidistant, up.
  // ROUND_HALF_DOWN  5 Towards nearest neighbour. If equidistant, down.
  // ROUND_HALF_EVEN  6 Towards nearest neighbour. If equidistant, towards even neighbour.
  // ROUND_HALF_CEIL  7 Towards nearest neighbour. If equidistant, towards +Infinity.
  // ROUND_HALF_FLOOR 8 Towards nearest neighbour. If equidistant, towards -Infinity.
  //
  // E.g.
  // `Decimal.rounding = 4;`
  // `Decimal.rounding = Decimal.ROUND_HALF_UP;`
  rounding: 4,
  // 0 to 8
  // The exponent value at and beneath which `toString` returns exponential notation.
  // JavaScript numbers: -7
  toExpNeg: -7,
  // 0 to -MAX_E
  // The exponent value at and above which `toString` returns exponential notation.
  // JavaScript numbers: 21
  toExpPos: 21,
  // 0 to MAX_E
  // The natural logarithm of 10.
  // 115 digits
  LN10: "2.302585092994045684017991454684364207601101488628772976033327900967572609677352480235997205089598298341967784042286"
}, _s, ce = !0, Fe = "[DecimalError] ", Lt = Fe + "Invalid argument: ", ri = Fe + "Exponent out of range: ", nn = Math.floor, kt = Math.pow, bu = /^(\d+(\.\d*)?|\.\d+)(e[+-]?\d+)?$/i, Ue, ve = 1e7, ue = 7, fs = 9007199254740991, hr = nn(fs / ue), P = {};
P.absoluteValue = P.abs = function() {
  var t = new this.constructor(this);
  return t.s && (t.s = 1), t;
};
P.comparedTo = P.cmp = function(t) {
  var e, n, r, i, s = this;
  if (t = new s.constructor(t), s.s !== t.s)
    return s.s || -t.s;
  if (s.e !== t.e)
    return s.e > t.e ^ s.s < 0 ? 1 : -1;
  for (r = s.d.length, i = t.d.length, e = 0, n = r < i ? r : i; e < n; ++e)
    if (s.d[e] !== t.d[e])
      return s.d[e] > t.d[e] ^ s.s < 0 ? 1 : -1;
  return r === i ? 0 : r > i ^ s.s < 0 ? 1 : -1;
};
P.decimalPlaces = P.dp = function() {
  var t = this, e = t.d.length - 1, n = (e - t.e) * ue;
  if (e = t.d[e], e)
    for (; e % 10 == 0; e /= 10)
      n--;
  return n < 0 ? 0 : n;
};
P.dividedBy = P.div = function(t) {
  return pt(this, new this.constructor(t));
};
P.dividedToIntegerBy = P.idiv = function(t) {
  var e = this, n = e.constructor;
  return le(pt(e, new n(t), 0, 1), n.precision);
};
P.equals = P.eq = function(t) {
  return !this.cmp(t);
};
P.exponent = function() {
  return me(this);
};
P.greaterThan = P.gt = function(t) {
  return this.cmp(t) > 0;
};
P.greaterThanOrEqualTo = P.gte = function(t) {
  return this.cmp(t) >= 0;
};
P.isInteger = P.isint = function() {
  return this.e > this.d.length - 2;
};
P.isNegative = P.isneg = function() {
  return this.s < 0;
};
P.isPositive = P.ispos = function() {
  return this.s > 0;
};
P.isZero = function() {
  return this.s === 0;
};
P.lessThan = P.lt = function(t) {
  return this.cmp(t) < 0;
};
P.lessThanOrEqualTo = P.lte = function(t) {
  return this.cmp(t) < 1;
};
P.logarithm = P.log = function(t) {
  var e, n = this, r = n.constructor, i = r.precision, s = i + 5;
  if (t === void 0)
    t = new r(10);
  else if (t = new r(t), t.s < 1 || t.eq(Ue))
    throw Error(Fe + "NaN");
  if (n.s < 1)
    throw Error(Fe + (n.s ? "NaN" : "-Infinity"));
  return n.eq(Ue) ? new r(0) : (ce = !1, e = pt(Mn(n, s), Mn(t, s), s), ce = !0, le(e, i));
};
P.minus = P.sub = function(t) {
  var e = this;
  return t = new e.constructor(t), e.s == t.s ? gs(e, t) : hs(e, (t.s = -t.s, t));
};
P.modulo = P.mod = function(t) {
  var e, n = this, r = n.constructor, i = r.precision;
  if (t = new r(t), !t.s)
    throw Error(Fe + "NaN");
  return n.s ? (ce = !1, e = pt(n, t, 0, 1).times(t), ce = !0, n.minus(e)) : le(new r(n), i);
};
P.naturalExponential = P.exp = function() {
  return ps(this);
};
P.naturalLogarithm = P.ln = function() {
  return Mn(this);
};
P.negated = P.neg = function() {
  var t = new this.constructor(this);
  return t.s = -t.s || 0, t;
};
P.plus = P.add = function(t) {
  var e = this;
  return t = new e.constructor(t), e.s == t.s ? hs(e, t) : gs(e, (t.s = -t.s, t));
};
P.precision = P.sd = function(t) {
  var e, n, r, i = this;
  if (t !== void 0 && t !== !!t && t !== 1 && t !== 0)
    throw Error(Lt + t);
  if (e = me(i) + 1, r = i.d.length - 1, n = r * ue + 1, r = i.d[r], r) {
    for (; r % 10 == 0; r /= 10)
      n--;
    for (r = i.d[0]; r >= 10; r /= 10)
      n++;
  }
  return t && e > n ? e : n;
};
P.squareRoot = P.sqrt = function() {
  var t, e, n, r, i, s, u, c = this, g = c.constructor;
  if (c.s < 1) {
    if (!c.s)
      return new g(0);
    throw Error(Fe + "NaN");
  }
  for (t = me(c), ce = !1, i = Math.sqrt(+c), i == 0 || i == 1 / 0 ? (e = Xe(c.d), (e.length + t) % 2 == 0 && (e += "0"), i = Math.sqrt(e), t = nn((t + 1) / 2) - (t < 0 || t % 2), i == 1 / 0 ? e = "5e" + t : (e = i.toExponential(), e = e.slice(0, e.indexOf("e") + 1) + t), r = new g(e)) : r = new g(i.toString()), n = g.precision, i = u = n + 3; ; )
    if (s = r, r = s.plus(pt(c, s, u + 2)).times(0.5), Xe(s.d).slice(0, u) === (e = Xe(r.d)).slice(0, u)) {
      if (e = e.slice(u - 3, u + 1), i == u && e == "4999") {
        if (le(s, n + 1, 0), s.times(s).eq(c)) {
          r = s;
          break;
        }
      } else if (e != "9999")
        break;
      u += 4;
    }
  return ce = !0, le(r, n);
};
P.times = P.mul = function(t) {
  var e, n, r, i, s, u, c, g, f, d = this, m = d.constructor, A = d.d, x = (t = new m(t)).d;
  if (!d.s || !t.s)
    return new m(0);
  for (t.s *= d.s, n = d.e + t.e, g = A.length, f = x.length, g < f && (s = A, A = x, x = s, u = g, g = f, f = u), s = [], u = g + f, r = u; r--; )
    s.push(0);
  for (r = f; --r >= 0; ) {
    for (e = 0, i = g + r; i > r; )
      c = s[i] + x[r] * A[i - r - 1] + e, s[i--] = c % ve | 0, e = c / ve | 0;
    s[i] = (s[i] + e) % ve | 0;
  }
  for (; !s[--u]; )
    s.pop();
  return e ? ++n : s.shift(), t.d = s, t.e = n, ce ? le(t, m.precision) : t;
};
P.toDecimalPlaces = P.todp = function(t, e) {
  var n = this, r = n.constructor;
  return n = new r(n), t === void 0 ? n : (tt(t, 0, tn), e === void 0 ? e = r.rounding : tt(e, 0, 8), le(n, t + me(n) + 1, e));
};
P.toExponential = function(t, e) {
  var n, r = this, i = r.constructor;
  return t === void 0 ? n = Gt(r, !0) : (tt(t, 0, tn), e === void 0 ? e = i.rounding : tt(e, 0, 8), r = le(new i(r), t + 1, e), n = Gt(r, !0, t + 1)), n;
};
P.toFixed = function(t, e) {
  var n, r, i = this, s = i.constructor;
  return t === void 0 ? Gt(i) : (tt(t, 0, tn), e === void 0 ? e = s.rounding : tt(e, 0, 8), r = le(new s(i), t + me(i) + 1, e), n = Gt(r.abs(), !1, t + me(r) + 1), i.isneg() && !i.isZero() ? "-" + n : n);
};
P.toInteger = P.toint = function() {
  var t = this, e = t.constructor;
  return le(new e(t), me(t) + 1, e.rounding);
};
P.toNumber = function() {
  return +this;
};
P.toPower = P.pow = function(t) {
  var e, n, r, i, s, u, c = this, g = c.constructor, f = 12, d = +(t = new g(t));
  if (!t.s)
    return new g(Ue);
  if (c = new g(c), !c.s) {
    if (t.s < 1)
      throw Error(Fe + "Infinity");
    return c;
  }
  if (c.eq(Ue))
    return c;
  if (r = g.precision, t.eq(Ue))
    return le(c, r);
  if (e = t.e, n = t.d.length - 1, u = e >= n, s = c.s, u) {
    if ((n = d < 0 ? -d : d) <= fs) {
      for (i = new g(Ue), e = Math.ceil(r / ue + 4), ce = !1; n % 2 && (i = i.times(c), Si(i.d, e)), n = nn(n / 2), n !== 0; )
        c = c.times(c), Si(c.d, e);
      return ce = !0, t.s < 0 ? new g(Ue).div(i) : le(i, r);
    }
  } else if (s < 0)
    throw Error(Fe + "NaN");
  return s = s < 0 && t.d[Math.max(e, n)] & 1 ? -1 : 1, c.s = 1, ce = !1, i = t.times(Mn(c, r + f)), ce = !0, i = ps(i), i.s = s, i;
};
P.toPrecision = function(t, e) {
  var n, r, i = this, s = i.constructor;
  return t === void 0 ? (n = me(i), r = Gt(i, n <= s.toExpNeg || n >= s.toExpPos)) : (tt(t, 1, tn), e === void 0 ? e = s.rounding : tt(e, 0, 8), i = le(new s(i), t, e), n = me(i), r = Gt(i, t <= n || n <= s.toExpNeg, t)), r;
};
P.toSignificantDigits = P.tosd = function(t, e) {
  var n = this, r = n.constructor;
  return t === void 0 ? (t = r.precision, e = r.rounding) : (tt(t, 1, tn), e === void 0 ? e = r.rounding : tt(e, 0, 8)), le(new r(n), t, e);
};
P.toString = P.valueOf = P.val = P.toJSON = P[Symbol.for("nodejs.util.inspect.custom")] = function() {
  var t = this, e = me(t), n = t.constructor;
  return Gt(t, e <= n.toExpNeg || e >= n.toExpPos);
};
function hs(t, e) {
  var n, r, i, s, u, c, g, f, d = t.constructor, m = d.precision;
  if (!t.s || !e.s)
    return e.s || (e = new d(t)), ce ? le(e, m) : e;
  if (g = t.d, f = e.d, u = t.e, i = e.e, g = g.slice(), s = u - i, s) {
    for (s < 0 ? (r = g, s = -s, c = f.length) : (r = f, i = u, c = g.length), u = Math.ceil(m / ue), c = u > c ? u + 1 : c + 1, s > c && (s = c, r.length = 1), r.reverse(); s--; )
      r.push(0);
    r.reverse();
  }
  for (c = g.length, s = f.length, c - s < 0 && (s = c, r = f, f = g, g = r), n = 0; s; )
    n = (g[--s] = g[s] + f[s] + n) / ve | 0, g[s] %= ve;
  for (n && (g.unshift(n), ++i), c = g.length; g[--c] == 0; )
    g.pop();
  return e.d = g, e.e = i, ce ? le(e, m) : e;
}
function tt(t, e, n) {
  if (t !== ~~t || t < e || t > n)
    throw Error(Lt + t);
}
function Xe(t) {
  var e, n, r, i = t.length - 1, s = "", u = t[0];
  if (i > 0) {
    for (s += u, e = 1; e < i; e++)
      r = t[e] + "", n = ue - r.length, n && (s += vt(n)), s += r;
    u = t[e], r = u + "", n = ue - r.length, n && (s += vt(n));
  } else if (u === 0)
    return "0";
  for (; u % 10 === 0; )
    u /= 10;
  return s + u;
}
var pt = /* @__PURE__ */ function() {
  function t(r, i) {
    var s, u = 0, c = r.length;
    for (r = r.slice(); c--; )
      s = r[c] * i + u, r[c] = s % ve | 0, u = s / ve | 0;
    return u && r.unshift(u), r;
  }
  function e(r, i, s, u) {
    var c, g;
    if (s != u)
      g = s > u ? 1 : -1;
    else
      for (c = g = 0; c < s; c++)
        if (r[c] != i[c]) {
          g = r[c] > i[c] ? 1 : -1;
          break;
        }
    return g;
  }
  function n(r, i, s) {
    for (var u = 0; s--; )
      r[s] -= u, u = r[s] < i[s] ? 1 : 0, r[s] = u * ve + r[s] - i[s];
    for (; !r[0] && r.length > 1; )
      r.shift();
  }
  return function(r, i, s, u) {
    var c, g, f, d, m, A, x, W, V, D, he, re, se, Ne, ge, Ge, Te, Pe, je = r.constructor, Ze = r.s == i.s ? 1 : -1, Se = r.d, oe = i.d;
    if (!r.s)
      return new je(r);
    if (!i.s)
      throw Error(Fe + "Division by zero");
    for (g = r.e - i.e, Te = oe.length, ge = Se.length, x = new je(Ze), W = x.d = [], f = 0; oe[f] == (Se[f] || 0); )
      ++f;
    if (oe[f] > (Se[f] || 0) && --g, s == null ? re = s = je.precision : u ? re = s + (me(r) - me(i)) + 1 : re = s, re < 0)
      return new je(0);
    if (re = re / ue + 2 | 0, f = 0, Te == 1)
      for (d = 0, oe = oe[0], re++; (f < ge || d) && re--; f++)
        se = d * ve + (Se[f] || 0), W[f] = se / oe | 0, d = se % oe | 0;
    else {
      for (d = ve / (oe[0] + 1) | 0, d > 1 && (oe = t(oe, d), Se = t(Se, d), Te = oe.length, ge = Se.length), Ne = Te, V = Se.slice(0, Te), D = V.length; D < Te; )
        V[D++] = 0;
      Pe = oe.slice(), Pe.unshift(0), Ge = oe[0], oe[1] >= ve / 2 && ++Ge;
      do
        d = 0, c = e(oe, V, Te, D), c < 0 ? (he = V[0], Te != D && (he = he * ve + (V[1] || 0)), d = he / Ge | 0, d > 1 ? (d >= ve && (d = ve - 1), m = t(oe, d), A = m.length, D = V.length, c = e(m, V, A, D), c == 1 && (d--, n(m, Te < A ? Pe : oe, A))) : (d == 0 && (c = d = 1), m = oe.slice()), A = m.length, A < D && m.unshift(0), n(V, m, D), c == -1 && (D = V.length, c = e(oe, V, Te, D), c < 1 && (d++, n(V, Te < D ? Pe : oe, D))), D = V.length) : c === 0 && (d++, V = [0]), W[f++] = d, c && V[0] ? V[D++] = Se[Ne] || 0 : (V = [Se[Ne]], D = 1);
      while ((Ne++ < ge || V[0] !== void 0) && re--);
    }
    return W[0] || W.shift(), x.e = g, le(x, u ? s + me(x) + 1 : s);
  };
}();
function ps(t, e) {
  var n, r, i, s, u, c, g = 0, f = 0, d = t.constructor, m = d.precision;
  if (me(t) > 16)
    throw Error(ri + me(t));
  if (!t.s)
    return new d(Ue);
  for (e == null ? (ce = !1, c = m) : c = e, u = new d(0.03125); t.abs().gte(0.1); )
    t = t.times(u), f += 5;
  for (r = Math.log(kt(2, f)) / Math.LN10 * 2 + 5 | 0, c += r, n = i = s = new d(Ue), d.precision = c; ; ) {
    if (i = le(i.times(t), c), n = n.times(++g), u = s.plus(pt(i, n, c)), Xe(u.d).slice(0, c) === Xe(s.d).slice(0, c)) {
      for (; f--; )
        s = le(s.times(s), c);
      return d.precision = m, e == null ? (ce = !0, le(s, m)) : s;
    }
    s = u;
  }
}
function me(t) {
  for (var e = t.e * ue, n = t.d[0]; n >= 10; n /= 10)
    e++;
  return e;
}
function Zr(t, e, n) {
  if (e > t.LN10.sd())
    throw ce = !0, n && (t.precision = n), Error(Fe + "LN10 precision limit exceeded");
  return le(new t(t.LN10), e);
}
function vt(t) {
  for (var e = ""; t--; )
    e += "0";
  return e;
}
function Mn(t, e) {
  var n, r, i, s, u, c, g, f, d, m = 1, A = 10, x = t, W = x.d, V = x.constructor, D = V.precision;
  if (x.s < 1)
    throw Error(Fe + (x.s ? "NaN" : "-Infinity"));
  if (x.eq(Ue))
    return new V(0);
  if (e == null ? (ce = !1, f = D) : f = e, x.eq(10))
    return e == null && (ce = !0), Zr(V, f);
  if (f += A, V.precision = f, n = Xe(W), r = n.charAt(0), s = me(x), Math.abs(s) < 15e14) {
    for (; r < 7 && r != 1 || r == 1 && n.charAt(1) > 3; )
      x = x.times(t), n = Xe(x.d), r = n.charAt(0), m++;
    s = me(x), r > 1 ? (x = new V("0." + n), s++) : x = new V(r + "." + n.slice(1));
  } else
    return g = Zr(V, f + 2, D).times(s + ""), x = Mn(new V(r + "." + n.slice(1)), f - A).plus(g), V.precision = D, e == null ? (ce = !0, le(x, D)) : x;
  for (c = u = x = pt(x.minus(Ue), x.plus(Ue), f), d = le(x.times(x), f), i = 3; ; ) {
    if (u = le(u.times(d), f), g = c.plus(pt(u, new V(i), f)), Xe(g.d).slice(0, f) === Xe(c.d).slice(0, f))
      return c = c.times(2), s !== 0 && (c = c.plus(Zr(V, f + 2, D).times(s + ""))), c = pt(c, new V(m), f), V.precision = D, e == null ? (ce = !0, le(c, D)) : c;
    c = g, i += 2;
  }
}
function Ni(t, e) {
  var n, r, i;
  for ((n = e.indexOf(".")) > -1 && (e = e.replace(".", "")), (r = e.search(/e/i)) > 0 ? (n < 0 && (n = r), n += +e.slice(r + 1), e = e.substring(0, r)) : n < 0 && (n = e.length), r = 0; e.charCodeAt(r) === 48; )
    ++r;
  for (i = e.length; e.charCodeAt(i - 1) === 48; )
    --i;
  if (e = e.slice(r, i), e) {
    if (i -= r, n = n - r - 1, t.e = nn(n / ue), t.d = [], r = (n + 1) % ue, n < 0 && (r += ue), r < i) {
      for (r && t.d.push(+e.slice(0, r)), i -= ue; r < i; )
        t.d.push(+e.slice(r, r += ue));
      e = e.slice(r), r = ue - e.length;
    } else
      r -= i;
    for (; r--; )
      e += "0";
    if (t.d.push(+e), ce && (t.e > hr || t.e < -hr))
      throw Error(ri + n);
  } else
    t.s = 0, t.e = 0, t.d = [0];
  return t;
}
function le(t, e, n) {
  var r, i, s, u, c, g, f, d, m = t.d;
  for (u = 1, s = m[0]; s >= 10; s /= 10)
    u++;
  if (r = e - u, r < 0)
    r += ue, i = e, f = m[d = 0];
  else {
    if (d = Math.ceil((r + 1) / ue), s = m.length, d >= s)
      return t;
    for (f = s = m[d], u = 1; s >= 10; s /= 10)
      u++;
    r %= ue, i = r - ue + u;
  }
  if (n !== void 0 && (s = kt(10, u - i - 1), c = f / s % 10 | 0, g = e < 0 || m[d + 1] !== void 0 || f % s, g = n < 4 ? (c || g) && (n == 0 || n == (t.s < 0 ? 3 : 2)) : c > 5 || c == 5 && (n == 4 || g || n == 6 && // Check whether the digit to the left of the rounding digit is odd.
  (r > 0 ? i > 0 ? f / kt(10, u - i) : 0 : m[d - 1]) % 10 & 1 || n == (t.s < 0 ? 8 : 7))), e < 1 || !m[0])
    return g ? (s = me(t), m.length = 1, e = e - s - 1, m[0] = kt(10, (ue - e % ue) % ue), t.e = nn(-e / ue) || 0) : (m.length = 1, m[0] = t.e = t.s = 0), t;
  if (r == 0 ? (m.length = d, s = 1, d--) : (m.length = d + 1, s = kt(10, ue - r), m[d] = i > 0 ? (f / kt(10, u - i) % kt(10, i) | 0) * s : 0), g)
    for (; ; )
      if (d == 0) {
        (m[0] += s) == ve && (m[0] = 1, ++t.e);
        break;
      } else {
        if (m[d] += s, m[d] != ve)
          break;
        m[d--] = 0, s = 1;
      }
  for (r = m.length; m[--r] === 0; )
    m.pop();
  if (ce && (t.e > hr || t.e < -hr))
    throw Error(ri + me(t));
  return t;
}
function gs(t, e) {
  var n, r, i, s, u, c, g, f, d, m, A = t.constructor, x = A.precision;
  if (!t.s || !e.s)
    return e.s ? e.s = -e.s : e = new A(t), ce ? le(e, x) : e;
  if (g = t.d, m = e.d, r = e.e, f = t.e, g = g.slice(), u = f - r, u) {
    for (d = u < 0, d ? (n = g, u = -u, c = m.length) : (n = m, r = f, c = g.length), i = Math.max(Math.ceil(x / ue), c) + 2, u > i && (u = i, n.length = 1), n.reverse(), i = u; i--; )
      n.push(0);
    n.reverse();
  } else {
    for (i = g.length, c = m.length, d = i < c, d && (c = i), i = 0; i < c; i++)
      if (g[i] != m[i]) {
        d = g[i] < m[i];
        break;
      }
    u = 0;
  }
  for (d && (n = g, g = m, m = n, e.s = -e.s), c = g.length, i = m.length - c; i > 0; --i)
    g[c++] = 0;
  for (i = m.length; i > u; ) {
    if (g[--i] < m[i]) {
      for (s = i; s && g[--s] === 0; )
        g[s] = ve - 1;
      --g[s], g[i] += ve;
    }
    g[i] -= m[i];
  }
  for (; g[--c] === 0; )
    g.pop();
  for (; g[0] === 0; g.shift())
    --r;
  return g[0] ? (e.d = g, e.e = r, ce ? le(e, x) : e) : new A(0);
}
function Gt(t, e, n) {
  var r, i = me(t), s = Xe(t.d), u = s.length;
  return e ? (n && (r = n - u) > 0 ? s = s.charAt(0) + "." + s.slice(1) + vt(r) : u > 1 && (s = s.charAt(0) + "." + s.slice(1)), s = s + (i < 0 ? "e" : "e+") + i) : i < 0 ? (s = "0." + vt(-i - 1) + s, n && (r = n - u) > 0 && (s += vt(r))) : i >= u ? (s += vt(i + 1 - u), n && (r = n - i - 1) > 0 && (s = s + "." + vt(r))) : ((r = i + 1) < u && (s = s.slice(0, r) + "." + s.slice(r)), n && (r = n - u) > 0 && (i + 1 === u && (s += "."), s += vt(r))), t.s < 0 ? "-" + s : s;
}
function Si(t, e) {
  if (t.length > e)
    return t.length = e, !0;
}
function ms(t) {
  var e, n, r;
  function i(s) {
    var u = this;
    if (!(u instanceof i))
      return new i(s);
    if (u.constructor = i, s instanceof i) {
      u.s = s.s, u.e = s.e, u.d = (s = s.d) ? s.slice() : s;
      return;
    }
    if (typeof s == "number") {
      if (s * 0 !== 0)
        throw Error(Lt + s);
      if (s > 0)
        u.s = 1;
      else if (s < 0)
        s = -s, u.s = -1;
      else {
        u.s = 0, u.e = 0, u.d = [0];
        return;
      }
      if (s === ~~s && s < 1e7) {
        u.e = 0, u.d = [s];
        return;
      }
      return Ni(u, s.toString());
    } else if (typeof s != "string")
      throw Error(Lt + s);
    if (s.charCodeAt(0) === 45 ? (s = s.slice(1), u.s = -1) : u.s = 1, bu.test(s))
      Ni(u, s);
    else
      throw Error(Lt + s);
  }
  if (i.prototype = P, i.ROUND_UP = 0, i.ROUND_DOWN = 1, i.ROUND_CEIL = 2, i.ROUND_FLOOR = 3, i.ROUND_HALF_UP = 4, i.ROUND_HALF_DOWN = 5, i.ROUND_HALF_EVEN = 6, i.ROUND_HALF_CEIL = 7, i.ROUND_HALF_FLOOR = 8, i.clone = ms, i.config = i.set = Iu, t === void 0 && (t = {}), t)
    for (r = ["precision", "rounding", "toExpNeg", "toExpPos", "LN10"], e = 0; e < r.length; )
      t.hasOwnProperty(n = r[e++]) || (t[n] = this[n]);
  return i.config(t), i;
}
function Iu(t) {
  if (!t || typeof t != "object")
    throw Error(Fe + "Object expected");
  var e, n, r, i = [
    "precision",
    1,
    tn,
    "rounding",
    0,
    8,
    "toExpNeg",
    -1 / 0,
    0,
    "toExpPos",
    0,
    1 / 0
  ];
  for (e = 0; e < i.length; e += 3)
    if ((r = t[n = i[e]]) !== void 0)
      if (nn(r) === r && r >= i[e + 1] && r <= i[e + 2])
        this[n] = r;
      else
        throw Error(Lt + n + ": " + r);
  if ((r = t[n = "LN10"]) !== void 0)
    if (r == Math.LN10)
      this[n] = new this(r);
    else
      throw Error(Lt + n + ": " + r);
  return this;
}
var _s = ms(Au);
Ue = new _s(1);
var v;
(function(t) {
  t.AED = "aed", t.AFN = "afn", t.ALL = "all", t.AMD = "amd", t.ANG = "ang", t.AOA = "aoa", t.ARS = "ars", t.AUD = "aud", t.AWG = "awg", t.AZN = "azn", t.BAM = "bam", t.BBD = "bbd", t.BDT = "bdt", t.BGN = "bgn", t.BHD = "bhd", t.BIF = "bif", t.BMD = "bmd", t.BND = "bnd", t.BOB = "bob", t.BOV = "bov", t.BRL = "brl", t.BSD = "bsd", t.BTN = "btn", t.BWP = "bwp", t.BYN = "byn", t.BYR = "byr", t.BZD = "bzd", t.CAD = "cad", t.CDF = "cdf", t.CHE = "che", t.CHF = "chf", t.CHW = "chw", t.CLF = "clf", t.CLP = "clp", t.CNY = "cny", t.COP = "cop", t.COU = "cou", t.CRC = "crc", t.CUC = "cuc", t.CUP = "cup", t.CVE = "cve", t.CZK = "czk", t.DJF = "djf", t.DKK = "dkk", t.DOP = "dop", t.DZD = "dzd", t.EGP = "egp", t.ERN = "ern", t.ETB = "etb", t.EUR = "eur", t.FJD = "fjd", t.FKP = "fkp", t.GBP = "gbp", t.GEL = "gel", t.GHS = "ghs", t.GIP = "gip", t.GMD = "gmd", t.GNF = "gnf", t.GTQ = "gtq", t.GYD = "gyd", t.HKD = "hkd", t.HNL = "hnl", t.HRK = "hrk", t.HTG = "htg", t.HUF = "huf", t.IDR = "idr", t.ILS = "ils", t.INR = "inr", t.IQD = "iqd", t.IRR = "irr", t.ISK = "isk", t.JMD = "jmd", t.JOD = "jod", t.JPY = "jpy", t.KES = "kes", t.KGS = "kgs", t.KHR = "khr", t.KMF = "kmf", t.KPW = "kpw", t.KRW = "krw", t.KWD = "kwd", t.KYD = "kyd", t.KZT = "kzt", t.LAK = "lak", t.LBP = "lbp", t.LKR = "lkr", t.LRD = "lrd", t.LSL = "lsl", t.LTL = "ltl", t.LVL = "lvl", t.LYD = "lyd", t.MAD = "mad", t.MDL = "mdl", t.MGA = "mga", t.MKD = "mkd", t.MMK = "mmk", t.MNT = "mnt", t.MOP = "mop", t.MRO = "mro", t.MUR = "mur", t.MVR = "mvr", t.MWK = "mwk", t.MXN = "mxn", t.MXV = "mxv", t.MYR = "myr", t.MZN = "mzn", t.NAD = "nad", t.NGN = "ngn", t.NIO = "nio", t.NOK = "nok", t.NPR = "npr", t.NZD = "nzd", t.OMR = "omr", t.PAB = "pab", t.PEN = "pen", t.PGK = "pgk", t.PHP = "php", t.PKR = "pkr", t.PLN = "pln", t.PYG = "pyg", t.QAR = "qar", t.RON = "ron", t.RSD = "rsd", t.RUB = "rub", t.RWF = "rwf", t.SAR = "sar", t.SBD = "sbd", t.SCR = "scr", t.SDG = "sdg", t.SEK = "sek", t.SGD = "sgd", t.SHP = "shp", t.SLL = "sll", t.SOS = "sos", t.SRD = "srd", t.SSP = "ssp", t.STD = "std", t.SVC = "svc", t.SYP = "syp", t.SZL = "szl", t.THB = "thb", t.TJS = "tjs", t.TMT = "tmt", t.TND = "tnd", t.TOP = "top", t.TRY = "try", t.TTD = "ttd", t.TWD = "twd", t.TZS = "tzs", t.UAH = "uah", t.UGX = "ugx", t.USD = "usd", t.USN = "usn", t.USS = "uss", t.UYI = "uyi", t.UYU = "uyu", t.UZS = "uzs", t.VEF = "vef", t.VND = "vnd", t.VUV = "vuv", t.WST = "wst", t.XAF = "xaf", t.XAG = "xag", t.XAU = "xau", t.XBA = "xba", t.XBB = "xbb", t.XBC = "xbc", t.XBD = "xbd", t.XCD = "xcd", t.XDR = "xdr", t.XFU = "xfu", t.XOF = "xof", t.XPD = "xpd", t.XPF = "xpf", t.XPT = "xpt", t.XSU = "xsu", t.XTS = "xts", t.XUA = "xua", t.YER = "yer", t.ZAR = "zar", t.ZMW = "zmw", t.ZWL = "zwl";
})(v || (v = {}));
v.AED + "", v.AFN + "", v.ALL + "", v.AMD + "", v.ANG + "", v.AOA + "", v.ARS + "", v.AUD + "", v.AWG + "", v.AZN + "", v.BAM + "", v.BBD + "", v.BDT + "", v.BGN + "", v.BHD + "", v.BIF + "", v.BMD + "", v.BND + "", v.BOB + "", v.BOV + "", v.BRL + "", v.BSD + "", v.BTN + "", v.BWP + "", v.BYR + "", v.BYN + "", v.BZD + "", v.CAD + "", v.CDF + "", v.CHE + "", v.CHF + "", v.CHW + "", v.CLF + "", v.CLP + "", v.CNY + "", v.COP + "", v.COU + "", v.CRC + "", v.CUC + "", v.CUP + "", v.CVE + "", v.CZK + "", v.DJF + "", v.DKK + "", v.DOP + "", v.DZD + "", v.EGP + "", v.ERN + "", v.ETB + "", v.EUR + "", v.FJD + "", v.FKP + "", v.GBP + "", v.GEL + "", v.GHS + "", v.GIP + "", v.GMD + "", v.GNF + "", v.GTQ + "", v.GYD + "", v.HKD + "", v.HNL + "", v.HRK + "", v.HTG + "", v.HUF + "", v.IDR + "", v.ILS + "", v.INR + "", v.IQD + "", v.IRR + "", v.ISK + "", v.JMD + "", v.JOD + "", v.JPY + "", v.KES + "", v.KGS + "", v.KHR + "", v.KMF + "", v.KPW + "", v.KRW + "", v.KWD + "", v.KYD + "", v.KZT + "", v.LAK + "", v.LBP + "", v.LKR + "", v.LRD + "", v.LSL + "", v.LTL + "", v.LVL + "", v.LYD + "", v.MAD + "", v.MDL + "", v.MGA + "", v.MKD + "", v.MMK + "", v.MNT + "", v.MOP + "", v.MRO + "", v.MUR + "", v.MVR + "", v.MWK + "", v.MXN + "", v.MXV + "", v.MYR + "", v.MZN + "", v.NAD + "", v.NGN + "", v.NIO + "", v.NOK + "", v.NPR + "", v.NZD + "", v.OMR + "", v.PAB + "", v.PEN + "", v.PGK + "", v.PHP + "", v.PKR + "", v.PLN + "", v.PYG + "", v.QAR + "", v.RON + "", v.RSD + "", v.RUB + "", v.RWF + "", v.SAR + "", v.SBD + "", v.SCR + "", v.SDG + "", v.SEK + "", v.SGD + "", v.SHP + "", v.SLL + "", v.SOS + "", v.SRD + "", v.SSP + "", v.STD + "", v.SVC + "", v.SYP + "", v.SZL + "", v.THB + "", v.TJS + "", v.TMT + "", v.TND + "", v.TOP + "", v.TRY + "", v.TTD + "", v.TWD + "", v.TZS + "", v.UAH + "", v.UGX + "", v.USD + "", v.USN + "", v.USS + "", v.UYI + "", v.UYU + "", v.UZS + "", v.VEF + "", v.VND + "", v.VUV + "", v.WST + "", v.XAF + "", v.XAG + "", v.XAU + "", v.XBA + "", v.XBB + "", v.XBC + "", v.XBD + "", v.XCD + "", v.XDR + "", v.XFU + "", v.XOF + "", v.XPD + "", v.XPF + "", v.XPT + "", v.XSU + "", v.XTS + "", v.XUA + "", v.YER + "", v.ZAR + "", v.ZMW + "", v.ZWL + "";
var hn = { exports: {} };
hn.exports;
var Oi;
function Nu() {
  return Oi || (Oi = 1, function(t, e) {
    var n = 200, r = "Expected a function", i = "__lodash_hash_undefined__", s = 1, u = 2, c = 1 / 0, g = 9007199254740991, f = "[object Arguments]", d = "[object Array]", m = "[object Boolean]", A = "[object Date]", x = "[object Error]", W = "[object Function]", V = "[object GeneratorFunction]", D = "[object Map]", he = "[object Number]", re = "[object Object]", se = "[object Promise]", Ne = "[object RegExp]", ge = "[object Set]", Ge = "[object String]", Te = "[object Symbol]", Pe = "[object WeakMap]", je = "[object ArrayBuffer]", Ze = "[object DataView]", Se = "[object Float32Array]", oe = "[object Float64Array]", yr = "[object Int8Array]", xn = "[object Int16Array]", Pn = "[object Int32Array]", Tr = "[object Uint8Array]", wr = "[object Uint8ClampedArray]", Ln = "[object Uint16Array]", nt = "[object Uint32Array]", rt = /\.|\[(?:[^[\]]*|(["'])(?:(?!\1)[^\\]|\\.)*?\1)\]/, Un = /^\w*$/, rn = /^\./, Ke = /[^.[\]]+|\[(?:(-?\d+(?:\.\d+)?)|(["'])((?:(?!\2)[^\\]|\\.)*?)\2)\]|(?=(?:\.|\[\])(?:\.|\[\]|$))/g, St = /[\\^$.*+?()[\]{}|]/g, it = /\\(\\)?/g, Bn = /^\[object .+?Constructor\]$/, sn = /^(?:0|[1-9]\d*)$/, ae = {};
    ae[Se] = ae[oe] = ae[yr] = ae[xn] = ae[Pn] = ae[Tr] = ae[wr] = ae[Ln] = ae[nt] = !0, ae[f] = ae[d] = ae[je] = ae[m] = ae[Ze] = ae[A] = ae[x] = ae[W] = ae[D] = ae[he] = ae[re] = ae[Ne] = ae[ge] = ae[Ge] = ae[Pe] = !1;
    var Gn = typeof nr == "object" && nr && nr.Object === Object && nr, Zt = typeof self == "object" && self && self.Object === Object && self, Ce = Gn || Zt || Function("return this")(), an = e && !e.nodeType && e, Vt = an && !0 && t && !t.nodeType && t, Zn = Vt && Vt.exports === an, Vn = Zn && Gn.process, Hn = function() {
      try {
        return Vn && Vn.binding("util");
      } catch {
      }
    }(), Fn = Hn && Hn.isTypedArray;
    function jn(o, h) {
      for (var w = -1, O = o ? o.length : 0; ++w < O && h(o[w], w, o) !== !1; )
        ;
      return o;
    }
    function Ar(o, h) {
      for (var w = -1, O = o ? o.length : 0; ++w < O; )
        if (h(o[w], w, o))
          return !0;
      return !1;
    }
    function Ot(o) {
      return function(h) {
        return h == null ? void 0 : h[o];
      };
    }
    function Kn(o, h) {
      for (var w = -1, O = Array(o); ++w < o; )
        O[w] = h(w);
      return O;
    }
    function Cn(o) {
      return function(h) {
        return o(h);
      };
    }
    function br(o, h) {
      return o == null ? void 0 : o[h];
    }
    function F(o) {
      var h = !1;
      if (o != null && typeof o.toString != "function")
        try {
          h = !!(o + "");
        } catch {
        }
      return h;
    }
    function st(o) {
      var h = -1, w = Array(o.size);
      return o.forEach(function(O, z) {
        w[++h] = [z, O];
      }), w;
    }
    function a(o, h) {
      return function(w) {
        return o(h(w));
      };
    }
    function l(o) {
      var h = -1, w = Array(o.size);
      return o.forEach(function(O) {
        w[++h] = O;
      }), w;
    }
    var p = Array.prototype, E = Function.prototype, T = Object.prototype, y = Ce["__core-js_shared__"], b = function() {
      var o = /[^.]+$/.exec(y && y.keys && y.keys.IE_PROTO || "");
      return o ? "Symbol(src)_1." + o : "";
    }(), I = E.toString, N = T.hasOwnProperty, H = T.toString, J = RegExp(
      "^" + I.call(N).replace(St, "\\$&").replace(/hasOwnProperty|(function).*?(?=\\\()| for .+?(?=\\\])/g, "$1.*?") + "$"
    ), $ = Ce.Symbol, ne = Ce.Uint8Array, Oe = a(Object.getPrototypeOf, Object), we = Object.create, on = T.propertyIsEnumerable, ln = p.splice, vs = a(Object.keys, Object), Ir = Ht(Ce, "DataView"), un = Ht(Ce, "Map"), Nr = Ht(Ce, "Promise"), Sr = Ht(Ce, "Set"), Or = Ht(Ce, "WeakMap"), cn = Ht(Object, "create"), Es = Dt(Ir), ys = Dt(un), Ts = Dt(Nr), ws = Dt(Sr), As = Dt(Or), qn = $ ? $.prototype : void 0, Rr = qn ? qn.valueOf : void 0, ii = qn ? qn.toString : void 0;
    function Rt(o) {
      var h = -1, w = o ? o.length : 0;
      for (this.clear(); ++h < w; ) {
        var O = o[h];
        this.set(O[0], O[1]);
      }
    }
    function bs() {
      this.__data__ = cn ? cn(null) : {};
    }
    function Is(o) {
      return this.has(o) && delete this.__data__[o];
    }
    function Ns(o) {
      var h = this.__data__;
      if (cn) {
        var w = h[o];
        return w === i ? void 0 : w;
      }
      return N.call(h, o) ? h[o] : void 0;
    }
    function Ss(o) {
      var h = this.__data__;
      return cn ? h[o] !== void 0 : N.call(h, o);
    }
    function Os(o, h) {
      var w = this.__data__;
      return w[o] = cn && h === void 0 ? i : h, this;
    }
    Rt.prototype.clear = bs, Rt.prototype.delete = Is, Rt.prototype.get = Ns, Rt.prototype.has = Ss, Rt.prototype.set = Os;
    function at(o) {
      var h = -1, w = o ? o.length : 0;
      for (this.clear(); ++h < w; ) {
        var O = o[h];
        this.set(O[0], O[1]);
      }
    }
    function Rs() {
      this.__data__ = [];
    }
    function Ds(o) {
      var h = this.__data__, w = zn(h, o);
      if (w < 0)
        return !1;
      var O = h.length - 1;
      return w == O ? h.pop() : ln.call(h, w, 1), !0;
    }
    function Ms(o) {
      var h = this.__data__, w = zn(h, o);
      return w < 0 ? void 0 : h[w][1];
    }
    function ks(o) {
      return zn(this.__data__, o) > -1;
    }
    function xs(o, h) {
      var w = this.__data__, O = zn(w, o);
      return O < 0 ? w.push([o, h]) : w[O][1] = h, this;
    }
    at.prototype.clear = Rs, at.prototype.delete = Ds, at.prototype.get = Ms, at.prototype.has = ks, at.prototype.set = xs;
    function ot(o) {
      var h = -1, w = o ? o.length : 0;
      for (this.clear(); ++h < w; ) {
        var O = o[h];
        this.set(O[0], O[1]);
      }
    }
    function Ps() {
      this.__data__ = {
        hash: new Rt(),
        map: new (un || at)(),
        string: new Rt()
      };
    }
    function Ls(o) {
      return Yn(this, o).delete(o);
    }
    function Us(o) {
      return Yn(this, o).get(o);
    }
    function Bs(o) {
      return Yn(this, o).has(o);
    }
    function Gs(o, h) {
      return Yn(this, o).set(o, h), this;
    }
    ot.prototype.clear = Ps, ot.prototype.delete = Ls, ot.prototype.get = Us, ot.prototype.has = Bs, ot.prototype.set = Gs;
    function $n(o) {
      var h = -1, w = o ? o.length : 0;
      for (this.__data__ = new ot(); ++h < w; )
        this.add(o[h]);
    }
    function Zs(o) {
      return this.__data__.set(o, i), this;
    }
    function Vs(o) {
      return this.__data__.has(o);
    }
    $n.prototype.add = $n.prototype.push = Zs, $n.prototype.has = Vs;
    function lt(o) {
      this.__data__ = new at(o);
    }
    function Hs() {
      this.__data__ = new at();
    }
    function Fs(o) {
      return this.__data__.delete(o);
    }
    function js(o) {
      return this.__data__.get(o);
    }
    function Ks(o) {
      return this.__data__.has(o);
    }
    function Cs(o, h) {
      var w = this.__data__;
      if (w instanceof at) {
        var O = w.__data__;
        if (!un || O.length < n - 1)
          return O.push([o, h]), this;
        w = this.__data__ = new ot(O);
      }
      return w.set(o, h), this;
    }
    lt.prototype.clear = Hs, lt.prototype.delete = Fs, lt.prototype.get = js, lt.prototype.has = Ks, lt.prototype.set = Cs;
    function qs(o, h) {
      var w = ut(o) || fi(o) ? Kn(o.length, String) : [], O = w.length, z = !!O;
      for (var U in o)
        N.call(o, U) && !(z && (U == "length" || li(U, O))) && w.push(U);
      return w;
    }
    function zn(o, h) {
      for (var w = o.length; w--; )
        if (di(o[w][0], h))
          return w;
      return -1;
    }
    function $s(o) {
      return Ft(o) ? we(o) : {};
    }
    var zs = la();
    function Ys(o, h) {
      return o && zs(o, h, Jn);
    }
    function si(o, h) {
      h = Wn(h, o) ? [h] : ai(h);
      for (var w = 0, O = h.length; o != null && w < O; )
        o = o[Xn(h[w++])];
      return w && w == O ? o : void 0;
    }
    function Ws(o) {
      return H.call(o);
    }
    function Xs(o, h) {
      return o != null && h in Object(o);
    }
    function Dr(o, h, w, O, z) {
      return o === h ? !0 : o == null || h == null || !Ft(o) && !Qn(h) ? o !== o && h !== h : Qs(o, h, Dr, w, O, z);
    }
    function Qs(o, h, w, O, z, U) {
      var Q = ut(o), pe = ut(h), fe = d, Ae = d;
      Q || (fe = mt(o), fe = fe == f ? re : fe), pe || (Ae = mt(h), Ae = Ae == f ? re : Ae);
      var Me = fe == re && !F(o), ke = Ae == re && !F(h), Re = fe == Ae;
      if (Re && !Me)
        return U || (U = new lt()), Q || pi(o) ? oi(o, h, w, O, z, U) : ua(o, h, fe, w, O, z, U);
      if (!(z & u)) {
        var Ve = Me && N.call(o, "__wrapped__"), He = ke && N.call(h, "__wrapped__");
        if (Ve || He) {
          var _t = Ve ? o.value() : o, ct = He ? h.value() : h;
          return U || (U = new lt()), w(_t, ct, O, z, U);
        }
      }
      return Re ? (U || (U = new lt()), ca(o, h, w, O, z, U)) : !1;
    }
    function Js(o, h, w, O) {
      var z = w.length, U = z;
      if (o == null)
        return !U;
      for (o = Object(o); z--; ) {
        var Q = w[z];
        if (Q[2] ? Q[1] !== o[Q[0]] : !(Q[0] in o))
          return !1;
      }
      for (; ++z < U; ) {
        Q = w[z];
        var pe = Q[0], fe = o[pe], Ae = Q[1];
        if (Q[2]) {
          if (fe === void 0 && !(pe in o))
            return !1;
        } else {
          var Me = new lt(), ke;
          if (!(ke === void 0 ? Dr(Ae, fe, O, s | u, Me) : ke))
            return !1;
        }
      }
      return !0;
    }
    function ea(o) {
      if (!Ft(o) || pa(o))
        return !1;
      var h = kr(o) || F(o) ? J : Bn;
      return h.test(Dt(o));
    }
    function ta(o) {
      return Qn(o) && xr(o.length) && !!ae[H.call(o)];
    }
    function na(o) {
      return typeof o == "function" ? o : o == null ? wa : typeof o == "object" ? ut(o) ? sa(o[0], o[1]) : ia(o) : Aa(o);
    }
    function ra(o) {
      if (!ga(o))
        return vs(o);
      var h = [];
      for (var w in Object(o))
        N.call(o, w) && w != "constructor" && h.push(w);
      return h;
    }
    function ia(o) {
      var h = da(o);
      return h.length == 1 && h[0][2] ? ci(h[0][0], h[0][1]) : function(w) {
        return w === o || Js(w, o, h);
      };
    }
    function sa(o, h) {
      return Wn(o) && ui(h) ? ci(Xn(o), h) : function(w) {
        var O = Ea(w, o);
        return O === void 0 && O === h ? ya(w, o) : Dr(h, O, void 0, s | u);
      };
    }
    function aa(o) {
      return function(h) {
        return si(h, o);
      };
    }
    function oa(o) {
      if (typeof o == "string")
        return o;
      if (Pr(o))
        return ii ? ii.call(o) : "";
      var h = o + "";
      return h == "0" && 1 / o == -c ? "-0" : h;
    }
    function ai(o) {
      return ut(o) ? o : ma(o);
    }
    function la(o) {
      return function(h, w, O) {
        for (var z = -1, U = Object(h), Q = O(h), pe = Q.length; pe--; ) {
          var fe = Q[++z];
          if (w(U[fe], fe, U) === !1)
            break;
        }
        return h;
      };
    }
    function oi(o, h, w, O, z, U) {
      var Q = z & u, pe = o.length, fe = h.length;
      if (pe != fe && !(Q && fe > pe))
        return !1;
      var Ae = U.get(o);
      if (Ae && U.get(h))
        return Ae == h;
      var Me = -1, ke = !0, Re = z & s ? new $n() : void 0;
      for (U.set(o, h), U.set(h, o); ++Me < pe; ) {
        var Ve = o[Me], He = h[Me];
        if (O)
          var _t = Q ? O(He, Ve, Me, h, o, U) : O(Ve, He, Me, o, h, U);
        if (_t !== void 0) {
          if (_t)
            continue;
          ke = !1;
          break;
        }
        if (Re) {
          if (!Ar(h, function(ct, Mt) {
            if (!Re.has(Mt) && (Ve === ct || w(Ve, ct, O, z, U)))
              return Re.add(Mt);
          })) {
            ke = !1;
            break;
          }
        } else if (!(Ve === He || w(Ve, He, O, z, U))) {
          ke = !1;
          break;
        }
      }
      return U.delete(o), U.delete(h), ke;
    }
    function ua(o, h, w, O, z, U, Q) {
      switch (w) {
        case Ze:
          if (o.byteLength != h.byteLength || o.byteOffset != h.byteOffset)
            return !1;
          o = o.buffer, h = h.buffer;
        case je:
          return !(o.byteLength != h.byteLength || !O(new ne(o), new ne(h)));
        case m:
        case A:
        case he:
          return di(+o, +h);
        case x:
          return o.name == h.name && o.message == h.message;
        case Ne:
        case Ge:
          return o == h + "";
        case D:
          var pe = st;
        case ge:
          var fe = U & u;
          if (pe || (pe = l), o.size != h.size && !fe)
            return !1;
          var Ae = Q.get(o);
          if (Ae)
            return Ae == h;
          U |= s, Q.set(o, h);
          var Me = oi(pe(o), pe(h), O, z, U, Q);
          return Q.delete(o), Me;
        case Te:
          if (Rr)
            return Rr.call(o) == Rr.call(h);
      }
      return !1;
    }
    function ca(o, h, w, O, z, U) {
      var Q = z & u, pe = Jn(o), fe = pe.length, Ae = Jn(h), Me = Ae.length;
      if (fe != Me && !Q)
        return !1;
      for (var ke = fe; ke--; ) {
        var Re = pe[ke];
        if (!(Q ? Re in h : N.call(h, Re)))
          return !1;
      }
      var Ve = U.get(o);
      if (Ve && U.get(h))
        return Ve == h;
      var He = !0;
      U.set(o, h), U.set(h, o);
      for (var _t = Q; ++ke < fe; ) {
        Re = pe[ke];
        var ct = o[Re], Mt = h[Re];
        if (O)
          var gi = Q ? O(Mt, ct, Re, h, o, U) : O(ct, Mt, Re, o, h, U);
        if (!(gi === void 0 ? ct === Mt || w(ct, Mt, O, z, U) : gi)) {
          He = !1;
          break;
        }
        _t || (_t = Re == "constructor");
      }
      if (He && !_t) {
        var er = o.constructor, tr = h.constructor;
        er != tr && "constructor" in o && "constructor" in h && !(typeof er == "function" && er instanceof er && typeof tr == "function" && tr instanceof tr) && (He = !1);
      }
      return U.delete(o), U.delete(h), He;
    }
    function Yn(o, h) {
      var w = o.__data__;
      return ha(h) ? w[typeof h == "string" ? "string" : "hash"] : w.map;
    }
    function da(o) {
      for (var h = Jn(o), w = h.length; w--; ) {
        var O = h[w], z = o[O];
        h[w] = [O, z, ui(z)];
      }
      return h;
    }
    function Ht(o, h) {
      var w = br(o, h);
      return ea(w) ? w : void 0;
    }
    var mt = Ws;
    (Ir && mt(new Ir(new ArrayBuffer(1))) != Ze || un && mt(new un()) != D || Nr && mt(Nr.resolve()) != se || Sr && mt(new Sr()) != ge || Or && mt(new Or()) != Pe) && (mt = function(o) {
      var h = H.call(o), w = h == re ? o.constructor : void 0, O = w ? Dt(w) : void 0;
      if (O)
        switch (O) {
          case Es:
            return Ze;
          case ys:
            return D;
          case Ts:
            return se;
          case ws:
            return ge;
          case As:
            return Pe;
        }
      return h;
    });
    function fa(o, h, w) {
      h = Wn(h, o) ? [h] : ai(h);
      for (var O, z = -1, Q = h.length; ++z < Q; ) {
        var U = Xn(h[z]);
        if (!(O = o != null && w(o, U)))
          break;
        o = o[U];
      }
      if (O)
        return O;
      var Q = o ? o.length : 0;
      return !!Q && xr(Q) && li(U, Q) && (ut(o) || fi(o));
    }
    function li(o, h) {
      return h = h ?? g, !!h && (typeof o == "number" || sn.test(o)) && o > -1 && o % 1 == 0 && o < h;
    }
    function Wn(o, h) {
      if (ut(o))
        return !1;
      var w = typeof o;
      return w == "number" || w == "symbol" || w == "boolean" || o == null || Pr(o) ? !0 : Un.test(o) || !rt.test(o) || h != null && o in Object(h);
    }
    function ha(o) {
      var h = typeof o;
      return h == "string" || h == "number" || h == "symbol" || h == "boolean" ? o !== "__proto__" : o === null;
    }
    function pa(o) {
      return !!b && b in o;
    }
    function ga(o) {
      var h = o && o.constructor, w = typeof h == "function" && h.prototype || T;
      return o === w;
    }
    function ui(o) {
      return o === o && !Ft(o);
    }
    function ci(o, h) {
      return function(w) {
        return w == null ? !1 : w[o] === h && (h !== void 0 || o in Object(w));
      };
    }
    var ma = Mr(function(o) {
      o = va(o);
      var h = [];
      return rn.test(o) && h.push(""), o.replace(Ke, function(w, O, z, U) {
        h.push(z ? U.replace(it, "$1") : O || w);
      }), h;
    });
    function Xn(o) {
      if (typeof o == "string" || Pr(o))
        return o;
      var h = o + "";
      return h == "0" && 1 / o == -c ? "-0" : h;
    }
    function Dt(o) {
      if (o != null) {
        try {
          return I.call(o);
        } catch {
        }
        try {
          return o + "";
        } catch {
        }
      }
      return "";
    }
    function Mr(o, h) {
      if (typeof o != "function" || h && typeof h != "function")
        throw new TypeError(r);
      var w = function() {
        var O = arguments, z = h ? h.apply(this, O) : O[0], U = w.cache;
        if (U.has(z))
          return U.get(z);
        var Q = o.apply(this, O);
        return w.cache = U.set(z, Q), Q;
      };
      return w.cache = new (Mr.Cache || ot)(), w;
    }
    Mr.Cache = ot;
    function di(o, h) {
      return o === h || o !== o && h !== h;
    }
    function fi(o) {
      return _a(o) && N.call(o, "callee") && (!on.call(o, "callee") || H.call(o) == f);
    }
    var ut = Array.isArray;
    function hi(o) {
      return o != null && xr(o.length) && !kr(o);
    }
    function _a(o) {
      return Qn(o) && hi(o);
    }
    function kr(o) {
      var h = Ft(o) ? H.call(o) : "";
      return h == W || h == V;
    }
    function xr(o) {
      return typeof o == "number" && o > -1 && o % 1 == 0 && o <= g;
    }
    function Ft(o) {
      var h = typeof o;
      return !!o && (h == "object" || h == "function");
    }
    function Qn(o) {
      return !!o && typeof o == "object";
    }
    function Pr(o) {
      return typeof o == "symbol" || Qn(o) && H.call(o) == Te;
    }
    var pi = Fn ? Cn(Fn) : ta;
    function va(o) {
      return o == null ? "" : oa(o);
    }
    function Ea(o, h, w) {
      var O = o == null ? void 0 : si(o, h);
      return O === void 0 ? w : O;
    }
    function ya(o, h) {
      return o != null && fa(o, h, Xs);
    }
    function Jn(o) {
      return hi(o) ? qs(o) : ra(o);
    }
    function Ta(o, h, w) {
      var O = ut(o) || pi(o);
      if (h = na(h), w == null)
        if (O || Ft(o)) {
          var z = o.constructor;
          O ? w = ut(o) ? new z() : [] : w = kr(z) ? $s(Oe(o)) : {};
        } else
          w = {};
      return (O ? jn : Ys)(o, function(U, Q, pe) {
        return h(w, U, Q, pe);
      }), w;
    }
    function wa(o) {
      return o;
    }
    function Aa(o) {
      return Wn(o) ? Ot(Xn(o)) : aa(o);
    }
    t.exports = Ta;
  }(hn, hn.exports)), hn.exports;
}
Nu();
var Kt = /* @__PURE__ */ ((t) => (t[t.None = 0] = "None", t[t.Initializing = 1] = "Initializing", t[t.WaitingForServer = 2] = "WaitingForServer", t[t.Connected = 4] = "Connected", t[t.Disconnected = 8] = "Disconnected", t[t.Error = 16] = "Error", t[t.Reconnecting = 32] = "Reconnecting", t[t.Listening = 64] = "Listening", t[t.Paused = 128] = "Paused", t[t.Closing = 256] = "Closing", t[t.Retrying = 512] = "Retrying", t[t.Suspended = 1024] = "Suspended", t[t.Authenticated = 2048] = "Authenticated", t[t.Unsubscribed = 4096] = "Unsubscribed", t[t.PendingData = 8192] = "PendingData", t[t.Timeout = 16384] = "Timeout", t[t.ReceivingHandshake = 32768] = "ReceivingHandshake", t[t.HeartbeatFailure = 65536] = "HeartbeatFailure", t[t.Resuming = 131072] = "Resuming", t[t.RateLimited = 262144] = "RateLimited", t[t.Buffered = 524288] = "Buffered", t[t.WaitingForReconnect = 1048576] = "WaitingForReconnect", t[t.SendingData = 2097152] = "SendingData", t[t.ReceivingData = 4194304] = "ReceivingData", t[t.Overloaded = 8388608] = "Overloaded", t[t.Validating = 16777216] = "Validating", t[t.Queued = 33554432] = "Queued", t[t.Syncing = 67108864] = "Syncing", t[t.Expired = 134217728] = "Expired", t[t.Degraded = 268435456] = "Degraded", t[t.ShuttingDown = 536870912] = "ShuttingDown", t[t.MaintenanceMode = 1073741824] = "MaintenanceMode", t[t.CriticalFailure = -2147483648] = "CriticalFailure", t))(Kt || {}), pr = /* @__PURE__ */ ((t) => (t[t.None = 0] = "None", t[t.Text = 1] = "Text", t[t.JSON = 2] = "JSON", t[t.Binary = 4] = "Binary", t[t.Command = 8] = "Command", t[t.Event = 16] = "Event", t[t.Error = 32] = "Error", t[t.Notification = 64] = "Notification", t[t.Authentication = 128] = "Authentication", t[t.Configuration = 256] = "Configuration", t[t.Sync = 512] = "Sync", t[t.Heartbeat = 1024] = "Heartbeat", t[t.Purge = 2048] = "Purge", t))(pr || {});
const xt = class xt {
  constructor(e) {
    this.discordSdk = null, this.user = null, this.state = Kt.None, this.helper = e;
  }
  static getInstance(e) {
    return xt.instance || (xt.instance = new xt(e)), xt.instance;
  }
  async initialize(e) {
    if (this.discordSdk) {
      console.warn("DiscordSDK is already initialized.");
      return;
    }
    try {
      this.state = Kt.Initializing, this.discordSdk = new wu(e.clientId), await this.discordSdk.ready(), this.state = Kt.Connected;
      const { code: n } = await this.discordSdk.commands.authorize({
        client_id: e.clientId,
        response_type: "code",
        state: "",
        prompt: "none",
        scope: e.scope
      }), i = await (await fetch(e.tokenRoute, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: n })
      })).json();
      if (!i.access_token)
        throw new Error("No access_token field found in response.");
      const { user: s } = await this.discordSdk.commands.authenticate({
        access_token: i.access_token
      });
      this.user = s, this.state = Kt.Authenticated;
    } catch (n) {
      throw this.state = Kt.Error, console.error("Error initializing DiscordSDK:", n), n;
    }
  }
  /**
   * Get the DiscordSDK instance
   */
  getSdk() {
    if (!this.discordSdk)
      throw new Error(
        "DiscordSDK is not initialized. Call initialize() first."
      );
    return this.discordSdk;
  }
  /**
   * Get the authenticated user
   */
  getUser() {
    return this.user;
  }
  /**
   * Get the current state of the manager
   */
  getState() {
    return this.state;
  }
  /**
   * Send a message to the SDK
   */
  sendMessage(e) {
    if (!this.discordSdk)
      throw new Error(
        "DiscordSDK is not initialized. Call initialize() first."
      );
    switch (console.log("Sending message:", e), e.type) {
      case pr.Command:
        this.processCommandMessage(e);
        break;
      case pr.Notification:
        this.processNotificationMessage(
          e
        );
        break;
      default:
        console.warn("Unhandled message type:", e.type);
    }
  }
  processCommandMessage(e) {
    console.log("Processing command:", e.payload.command);
  }
  processNotificationMessage(e) {
    console.log("Notification received:", e.payload.message);
  }
};
xt.instance = null;
let zr = xt;
class $t {
  constructor(e, n) {
    this.discordSdkManager = null, this.commandMap = /* @__PURE__ */ new Map(), this.logs = /* @__PURE__ */ new Map(), this.discordSdkManager = e, this.helper = n, this.initializeCommandMap();
  }
  static getInstance(e, n) {
    return $t.instance || ($t.instance = new $t(
      e,
      n
    )), $t.instance;
  }
  get discordSdk() {
    var e;
    return ((e = this.discordSdkManager) == null ? void 0 : e.getSdk()) || null;
  }
  getLogs() {
    return Array.from(this.logs.values());
  }
  purgeLogs() {
    this.logs.clear();
  }
  initializeCommandMap() {
    this.commandMap.set("SUBSCRIBE", this.subscribe.bind(this)), this.commandMap.set("UNSUBSCRIBE", this.unsubscribe.bind(this)), this.commandMap.set("SET_ACTIVITY", this.setActivity.bind(this)), this.commandMap.set("PING_LOAD", this.pingLoad.bind(this)), this.commandMap.set("GET_INSTANCE_ID", this.getInstanceId.bind(this)), this.commandMap.set("GET_CHANNEL_ID", this.getChannelId.bind(this)), this.commandMap.set("GET_GUILD_ID", this.getGuildId.bind(this)), this.commandMap.set("GET_USER_ID", this.getUserId.bind(this)), this.commandMap.set("GET_USER", this.getUser.bind(this)), this.commandMap.set(
      "GET_INSTANCE_PARTICIPANTS",
      this.getInstanceParticipants.bind(this)
    ), this.commandMap.set(
      "HARDWARE_ACCELERATION",
      this.hardwareAcceleration.bind(this)
    ), this.commandMap.set("GET_CHANNEL", this.getChannel.bind(this)), this.commandMap.set(
      "GET_CHANNEL_PERMISSIONS",
      this.getChannelPermissions.bind(this)
    ), this.commandMap.set(
      "GET_ENTITLEMENTS",
      this.getEntitlements.bind(this)
    ), this.commandMap.set(
      "GET_PLATFORM_BEHAVIORS",
      this.getPlatformBehaviors.bind(this)
    ), this.commandMap.set("GET_SKUS", this.getSkus.bind(this)), this.commandMap.set("IMAGE_UPLOAD", this.imageUpload.bind(this)), this.commandMap.set("EXTERNAL_LINK", this.externalLink.bind(this)), this.commandMap.set("INVITE_DIALOG", this.inviteDialog.bind(this)), this.commandMap.set(
      "SHARE_MOMENT_DIALOG",
      this.shareMomentDialog.bind(this)
    ), this.commandMap.set(
      "SET_ORIENTATION_LOCK_STATE",
      this.setOrientationLockState.bind(this)
    ), this.commandMap.set("START_PURCHASE", this.startPurchase.bind(this)), this.commandMap.set("GET_LOCALE", this.getLocale.bind(this)), this.commandMap.set("SET_CONFIG", this.setConfig.bind(this));
  }
  async handleMessage(e) {
    if (!this.discordSdk)
      throw new Error("DiscordSDK is not initialized in MessageHandler.");
    const { command: n, args: r } = e, i = this.commandMap.get(String(n));
    if (!i) {
      this.log("warn", `Unhandled command: ${e.command}`);
      return;
    }
    try {
      await i(r, e);
    } catch {
      throw new Error("[Message Handler] handleMessage error");
    }
  }
  validateSdkInitialized() {
    if (!this.discordSdk)
      throw new Error("DiscordSDK is not initialized.");
  }
  async subscribe(e, { event: n }) {
    var r, i;
    if (this.validateSdkInitialized(), !n)
      throw new Error("SUBSCRIBE event is undefined.");
    e != null && e.channel_id && (e = { channel_id: (r = this.discordSdk) == null ? void 0 : r.channelId }, this.log(
      "info",
      `Overriding channel_id with current channel ID: ${e.channel_id}`
    ));
    try {
      await ((i = this.discordSdk) == null ? void 0 : i.subscribe(
        n,
        this.handleEvent.bind(this),
        e
      )), this.log("info", `Subscribed to event '${n}'`);
    } catch (s) {
      this.logAndRethrowError("Failed to subscribe to event", s);
    }
  }
  async unsubscribe(e, { event: n }) {
    var r, i;
    if (this.validateSdkInitialized(), !n)
      throw new Error("UNSUBSCRIBE event is undefined.");
    e != null && e.channel_id && (e = { channel_id: (r = this.discordSdk) == null ? void 0 : r.channelId }, this.log(
      "info",
      `Overriding channel_id with current channel ID: ${e.channel_id}`
    ));
    try {
      await ((i = this.discordSdk) == null ? void 0 : i.unsubscribe(
        n,
        this.handleEvent.bind(this)
      )), this.log("info", `Unsubscribed from event '${n}'`);
    } catch (s) {
      this.logAndRethrowError("Failed to unsubscribe from event", s);
    }
  }
  async setActivity(e) {
    var r;
    if (this.validateSdkInitialized(), !(e != null && e.activity))
      throw this.log("error", "No activity provided for SET_ACTIVITY."), new Error("No activity provided for SET_ACTIVITY.");
    const n = [
      { field: "assets", key: "large_image" },
      { field: "party", key: "id" },
      { field: "emoji", key: "id" },
      { field: "secrets", key: "match" }
    ];
    e.activity = this.helper.sanitizeFields(
      e.activity,
      n
    );
    try {
      const i = await ((r = this.discordSdk) == null ? void 0 : r.commands.setActivity(e));
      this.log("info", "Activity set successfully", { data: i });
    } catch (i) {
      this.logAndRethrowError("Failed to set activity", i);
    }
  }
  async pingLoad() {
    this.postMessage("LOADED", { version: "1.0.0" }), this.log("info", "Ping load dispatched");
  }
  async getInstanceId(e, { nonce: n, command: r }) {
    if (!r || !n)
      throw new Error("Command/Nonce is undefined.");
    await this.postSdkProperty("instanceId", r, n);
  }
  async getChannelId(e, { nonce: n, command: r }) {
    if (!r || !n)
      throw new Error("Command/Nonce is undefined.");
    await this.postSdkProperty("channelId", r, n);
  }
  async getGuildId(e, { nonce: n, command: r }) {
    if (!r || !n)
      throw new Error("Command/Nonce is undefined.");
    await this.postSdkProperty("guildId", r, n);
  }
  async getUserId(e, { nonce: n, command: r }) {
    if (!r || !n)
      throw new Error("Command/Nonce is undefined.");
    if (!this.discordSdk || !this.discordSdkManager)
      throw new Error("Discord SDK is not initialized.");
    const i = this.discordSdkManager.getUser();
    if (!i)
      throw new Error(
        "You need to be authenticated to get the current user ID."
      );
    this.postMessage(r, { nonce: n, data: i.id }), this.log("info", `User ID fetched: ${i.id}`);
  }
  async getUser(e, { nonce: n, command: r }) {
    if (!r || !n)
      throw new Error("Command/Nonce is undefined.");
    if (!this.discordSdk || !this.discordSdkManager)
      throw new Error("Discord SDK is not initialized.");
    const i = this.discordSdkManager.getUser();
    if (!i)
      throw new Error(
        "You need to be authenticated to get the current user."
      );
    this.postMessage(r, { nonce: n, data: i }), this.log(
      "info",
      `User details fetched: ${i.username}#${i.discriminator}`
    );
  }
  async getInstanceParticipants(e, { nonce: n, command: r }) {
    var i;
    if (!r || !n)
      throw new Error("Command/Nonce is undefined.");
    this.validateSdkInitialized();
    try {
      const s = await ((i = this.discordSdk) == null ? void 0 : i.commands.getInstanceConnectedParticipants());
      this.postMessage(r, { nonce: n, data: s }), this.log(
        "info",
        `Fetched instance participants: ${JSON.stringify(s)}`
      );
    } catch (s) {
      this.logAndRethrowError(
        "Failed to fetch instance participants",
        s
      );
    }
  }
  async hardwareAcceleration(e, { nonce: n, command: r }) {
    var i;
    if (!r || !n)
      throw new Error("Command/Nonce is undefined.");
    this.validateSdkInitialized();
    try {
      const s = await ((i = this.discordSdk) == null ? void 0 : i.commands.encourageHardwareAcceleration());
      this.postMessage(r, { nonce: n, data: s }), this.log("info", "Hardware acceleration encouraged successfully.", {
        data: s
      });
    } catch (s) {
      this.logAndRethrowError(
        "Failed to encourage hardware acceleration",
        s
      );
    }
  }
  async getChannel(e, { nonce: n, command: r }) {
    var i;
    if (!r || !n)
      throw new Error("Command/Nonce is undefined.");
    if (!(e != null && e.channel_id))
      throw new Error("No channel ID provided for GET_CHANNEL.");
    this.validateSdkInitialized();
    try {
      const s = await ((i = this.discordSdk) == null ? void 0 : i.commands.getChannel(e));
      this.postMessage(r, { nonce: n, data: s, args: e }), this.log("info", `Fetched channel: ${JSON.stringify(s)}`);
    } catch (s) {
      this.logAndRethrowError("Failed to fetch channel", s);
    }
  }
  async getChannelPermissions(e, { nonce: n, command: r }) {
    var i;
    if (!r || !n)
      throw new Error("Command/Nonce is undefined.");
    if (!(e != null && e.channel_id))
      throw new Error(
        "No channel ID provided for GET_CHANNEL_PERMISSIONS."
      );
    this.validateSdkInitialized();
    try {
      const s = await ((i = this.discordSdk) == null ? void 0 : i.commands.getChannelPermissions(e));
      if (!s)
        throw new Error(
          "No permissions data received for the channel."
        );
      const u = this.helper.stringifyBigInt(
        s
      );
      this.postMessage(r, { nonce: n, data: u, args: e }), this.log(
        "info",
        `Fetched channel permissions for channel ID '${e.channel_id}': ${u}`
      );
    } catch (s) {
      this.logAndRethrowError(
        "Failed to fetch channel permissions",
        s
      );
    }
  }
  async getEntitlements(e, { nonce: n, command: r }) {
    var i;
    if (!r || !n)
      throw new Error("Command/Nonce is undefined.");
    this.validateSdkInitialized();
    try {
      const s = await ((i = this.discordSdk) == null ? void 0 : i.commands.getEntitlements());
      if (!s || !s.entitlements)
        throw new Error("No entitlement data received.");
      this.postMessage(r, { nonce: n, data: s.entitlements }), this.log("info", "Fetched entitlement successfully", {
        data: s.entitlements
      });
    } catch (s) {
      this.logAndRethrowError("Failed to fetch entitlement", s);
    }
  }
  async getPlatformBehaviors(e, { nonce: n, command: r }) {
    var i;
    if (!r || !n)
      throw new Error("Command/Nonce is undefined.");
    this.validateSdkInitialized();
    try {
      const s = await ((i = this.discordSdk) == null ? void 0 : i.commands.getPlatformBehaviors());
      if (!s)
        throw new Error("No platform behaviors data received.");
      this.postMessage(r, { nonce: n, data: s }), this.log("info", "Fetched platform behaviors successfully", {
        data: s
      });
    } catch (s) {
      this.logAndRethrowError(
        "Failed to fetch platform behaviorss",
        s
      );
    }
  }
  async getSkus(e, { nonce: n, command: r }) {
    var i;
    if (!r || !n)
      throw new Error("Command/Nonce is undefined.");
    this.validateSdkInitialized();
    try {
      const s = await ((i = this.discordSdk) == null ? void 0 : i.commands.getSkus());
      if (!s || !Array.isArray(s.skus) || s.skus.length === 0)
        throw new Error("No SKU data received or SKUs are empty.");
      this.postMessage(r, { nonce: n, data: s.skus }), this.log("info", "Fetched SKUs successfully", { data: s.skus });
    } catch (s) {
      this.logAndRethrowError("Failed to fetch SKUs", s);
    }
  }
  async imageUpload(e, { nonce: n, command: r }) {
    var i;
    if (!r || !n)
      throw new Error("Command/Nonce is undefined.");
    this.validateSdkInitialized();
    try {
      const s = await ((i = this.discordSdk) == null ? void 0 : i.commands.initiateImageUpload());
      if (!s)
        throw new Error("No image upload URL received.");
      this.postMessage(r, {
        nonce: n,
        data: { image_url: s, canceled: !1 }
      }), this.log("info", `Image upload URL received: ${s}`);
    } catch (s) {
      this.postMessage(r, {
        nonce: n,
        data: { image_url: "", canceled: !0 }
      }), this.logAndRethrowError("Failed to initiate image upload", s);
    }
  }
  async externalLink(e, { command: n }) {
    var r;
    if (!n)
      throw new Error("Command is undefined.");
    if (this.validateSdkInitialized(), !(e != null && e.url))
      throw new Error("No URL provided for EXTERNAL_LINK.");
    try {
      await ((r = this.discordSdk) == null ? void 0 : r.commands.openExternalLink(e)), this.log("info", `External link opened: ${e.url}`);
    } catch (i) {
      this.logAndRethrowError("Failed to open external link", i);
    }
  }
  async inviteDialog(e, { command: n }) {
    var r;
    if (!n)
      throw new Error("Command is undefined.");
    this.validateSdkInitialized();
    try {
      await ((r = this.discordSdk) == null ? void 0 : r.commands.openInviteDialog()), this.log("info", "Invite dialog opened successfully.");
    } catch (i) {
      this.logAndRethrowError("Failed to open invite dialog", i);
    }
  }
  async shareMomentDialog(e, { command: n }) {
    var r;
    if (!n)
      throw new Error("Command is undefined.");
    if (this.validateSdkInitialized(), !(e != null && e.mediaUrl))
      throw new Error("No media URL provided for SHARE_MOMENT_DIALOG.");
    try {
      await ((r = this.discordSdk) == null ? void 0 : r.commands.openShareMomentDialog(e)), this.log(
        "info",
        `Shared moment dialog opened with URL: ${e.mediaUrl}`
      );
    } catch (i) {
      this.logAndRethrowError(
        "Failed to open Share Moment Dialog",
        i
      );
    }
  }
  async setOrientationLockState(e) {
    var n;
    e.lock_state || this.logAndThrowError(
      "No lock state provided for SET_ORIENTATION_LOCK_STATE"
    );
    try {
      await ((n = this.discordSdk) == null ? void 0 : n.commands.setOrientationLockState(e)), this.log("info", "Orientation lock state set successfully.");
    } catch (r) {
      this.logAndRethrowError(
        "Failed to set orientation lock state",
        r
      );
    }
  }
  async startPurchase() {
    this.logAndThrowError("Purchases are not supported in this version.");
  }
  async getLocale(e, { command: n, nonce: r }) {
    var i;
    (!n || !r) && this.logAndThrowError("Command or nonce is undefined.");
    try {
      const s = await ((i = this.discordSdk) == null ? void 0 : i.commands.userSettingsGetLocale());
      this.postMessage(n, { nonce: r, data: s }), this.log("info", "Locale fetched successfully.");
    } catch (s) {
      this.logAndRethrowError("Failed to fetch locale", s);
    }
  }
  async setConfig(e) {
    var n;
    e.use_interactive_pip || this.logAndThrowError(
      "No 'use interactive pip' provided for SET_CONFIG"
    );
    try {
      const r = await ((n = this.discordSdk) == null ? void 0 : n.commands.setConfig(e));
      this.log("info", "Config set successfully", { data: r });
    } catch (r) {
      this.logAndRethrowError("Failed to set config", r);
    }
  }
  handleEvent(e) {
    this.postMessage("DISPATCH", { eventData: e });
  }
  postMessage(e, n) {
    const r = this.helper.getNestedIFrame();
    if (r.error)
      throw new Error(
        `Failed to get iframe: ${r.error.message}`
      );
    const i = r.data;
    if (!(i != null && i.contentWindow))
      throw new Error("Iframe contentWindow is null or undefined.");
    i.contentWindow.postMessage({ command: e, ...n }, "*");
  }
  async postSdkProperty(e, n, r) {
    try {
      if (!this.discordSdk)
        throw new Error("Discord SDK is null");
      const i = String(e), s = this.discordSdk[i];
      if (s === void 0)
        throw new Error(
          `Property '${i}' does not exist on DiscordSDK.`
        );
      this.postMessage(n, { nonce: r, data: s }), this.log("info", `Fetched '${i}': ${s}`);
    } catch (i) {
      this.logAndRethrowError(`Failed to fetch '${String(e)}'`, i);
    }
  }
  //  [Logger]
  log(e, n, r) {
    const i = Date.now();
    this.logs.set(i, { level: e, message: n, context: r });
  }
  logAndThrowError(e) {
    throw this.log("error", e), new Error(e);
  }
  logAndRethrowError(e, n, r) {
    const i = n instanceof Error ? `${e}: ${n.message}` : `${e}: ${String(n)}`;
    throw this.log("error", i, { ...r, error: n }), n instanceof Error ? n : new Error(String(n));
  }
}
class pn {
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  constructor() {
    this.helper = Da, this.discordManager = null, this.messageHandler = null, this.ready = !1;
  }
  static getInstance() {
    return pn.instance || (pn.instance = new pn()), pn.instance;
  }
  async initialize(e) {
    if (this.ready) {
      console.warn("Manager is already initialized.");
      return;
    }
    this.discordManager = zr.getInstance(this.helper), await this.discordManager.initialize(e), this.messageHandler = $t.getInstance(
      this.discordManager,
      this.helper
    ), this.ready = !0;
  }
  getSDKManager() {
    if (!this.ready || !this.discordManager)
      throw new Error(
        "Manager is not initialized. Call initialize() first."
      );
    return this.discordManager;
  }
  getMessageHandler() {
    if (!this.ready || !this.messageHandler)
      throw new Error(
        "MessageHandler is not initialized. Call initialize() first."
      );
    return this.messageHandler;
  }
  SDK(e) {
    return e ? e(this.getSDKManager()) : this.getSDKManager();
  }
  Helper(e) {
    return e ? e(this.helper) : this.helper;
  }
  Message(e) {
    const n = this.getMessageHandler();
    return e ? e(n) : n;
  }
  getAuthenticatedUser() {
    return this.SDK((e) => e.getUser());
  }
  sendCommand(e) {
    const n = {
      type: pr.Command,
      payload: e
    };
    this.SDK((r) => r.sendMessage(n));
  }
  async handleMessage(e) {
    await this.Message((n) => n.handleMessage(e));
  }
  getLogs() {
    return this.Message((e) => e.getLogs());
  }
  purgeLogs() {
    this.Message((e) => e.purgeLogs());
  }
}
export {
  Da as Help,
  pn as Manager,
  Ra as getNestedIFrame,
  Ia as safeParse,
  Na as safeStringify,
  Oa as stringToUtf8,
  ba as stringifyBigInt,
  Sa as utf8ToString
};
//# sourceMappingURL=discord-sdk-manager.es.js.map
