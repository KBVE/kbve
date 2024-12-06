function ba(t) {
  try {
    return JSON.stringify(t, (e, n) => typeof n == "bigint" ? n.toString() : n);
  } catch (e) {
    throw new Error(
      `Failed to stringify object with BigInt values: ${e instanceof Error ? e.message : e}`
    );
  }
}
function Aa(t) {
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
function wa(t) {
  try {
    return new TextDecoder("utf-8").decode(t);
  } catch {
    throw new Error("Unable to decode UTF-8 array to string.");
  }
}
function Ia(t) {
  try {
    return new TextEncoder().encode(t);
  } catch {
    throw new Error("Unable to encode string to UTF-8 array.");
  }
}
function Sa(t = "nested") {
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
class qt {
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  constructor() {
  }
  static getInstance() {
    return qt.instance || (qt.instance = new qt()), qt.instance;
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
    return this.safeCall(() => Aa(e));
  }
  safeStringify(e) {
    return this.safeCall(() => Na(e));
  }
  utf8ToString(e) {
    return this.safeCall(() => wa(e));
  }
  stringToUtf8(e) {
    return this.safeCall(() => Ia(e));
  }
  getNestedIFrame(e = "nested") {
    return this.safeCall(() => Sa(e));
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
const Nu = qt.getInstance();
var er = typeof globalThis < "u" ? globalThis : typeof window < "u" ? window : typeof global < "u" ? global : typeof self < "u" ? self : {};
function Si(t) {
  return t && t.__esModule && Object.prototype.hasOwnProperty.call(t, "default") ? t.default : t;
}
var Pr = { exports: {} }, pi;
function Oa() {
  return pi || (pi = 1, function(t) {
    var e = Object.prototype.hasOwnProperty, n = "~";
    function r() {
    }
    Object.create && (r.prototype = /* @__PURE__ */ Object.create(null), new r().__proto__ || (n = !1));
    function i(g, f, d) {
      this.fn = g, this.context = f, this.once = d || !1;
    }
    function s(g, f, d, _, A) {
      if (typeof d != "function")
        throw new TypeError("The listener must be a function");
      var k = new i(d, _ || g, A), X = n ? n + f : f;
      return g._events[X] ? g._events[X].fn ? g._events[X] = [g._events[X], k] : g._events[X].push(k) : (g._events[X] = k, g._eventsCount++), g;
    }
    function u(g, f) {
      --g._eventsCount === 0 ? g._events = new r() : delete g._events[f];
    }
    function c() {
      this._events = new r(), this._eventsCount = 0;
    }
    c.prototype.eventNames = function() {
      var f = [], d, _;
      if (this._eventsCount === 0)
        return f;
      for (_ in d = this._events)
        e.call(d, _) && f.push(n ? _.slice(1) : _);
      return Object.getOwnPropertySymbols ? f.concat(Object.getOwnPropertySymbols(d)) : f;
    }, c.prototype.listeners = function(f) {
      var d = n ? n + f : f, _ = this._events[d];
      if (!_)
        return [];
      if (_.fn)
        return [_.fn];
      for (var A = 0, k = _.length, X = new Array(k); A < k; A++)
        X[A] = _[A].fn;
      return X;
    }, c.prototype.listenerCount = function(f) {
      var d = n ? n + f : f, _ = this._events[d];
      return _ ? _.fn ? 1 : _.length : 0;
    }, c.prototype.emit = function(f, d, _, A, k, X) {
      var V = n ? n + f : f;
      if (!this._events[V])
        return !1;
      var D = this._events[V], pe = arguments.length, re, se;
      if (D.fn) {
        switch (D.once && this.removeListener(f, D.fn, void 0, !0), pe) {
          case 1:
            return D.fn.call(D.context), !0;
          case 2:
            return D.fn.call(D.context, d), !0;
          case 3:
            return D.fn.call(D.context, d, _), !0;
          case 4:
            return D.fn.call(D.context, d, _, A), !0;
          case 5:
            return D.fn.call(D.context, d, _, A, k), !0;
          case 6:
            return D.fn.call(D.context, d, _, A, k, X), !0;
        }
        for (se = 1, re = new Array(pe - 1); se < pe; se++)
          re[se - 1] = arguments[se];
        D.fn.apply(D.context, re);
      } else {
        var Ie = D.length, ge;
        for (se = 0; se < Ie; se++)
          switch (D[se].once && this.removeListener(f, D[se].fn, void 0, !0), pe) {
            case 1:
              D[se].fn.call(D[se].context);
              break;
            case 2:
              D[se].fn.call(D[se].context, d);
              break;
            case 3:
              D[se].fn.call(D[se].context, d, _);
              break;
            case 4:
              D[se].fn.call(D[se].context, d, _, A);
              break;
            default:
              if (!re)
                for (ge = 1, re = new Array(pe - 1); ge < pe; ge++)
                  re[ge - 1] = arguments[ge];
              D[se].fn.apply(D[se].context, re);
          }
      }
      return !0;
    }, c.prototype.on = function(f, d, _) {
      return s(this, f, d, _, !1);
    }, c.prototype.once = function(f, d, _) {
      return s(this, f, d, _, !0);
    }, c.prototype.removeListener = function(f, d, _, A) {
      var k = n ? n + f : f;
      if (!this._events[k])
        return this;
      if (!d)
        return u(this, k), this;
      var X = this._events[k];
      if (X.fn)
        X.fn === d && (!A || X.once) && (!_ || X.context === _) && u(this, k);
      else {
        for (var V = 0, D = [], pe = X.length; V < pe; V++)
          (X[V].fn !== d || A && !X[V].once || _ && X[V].context !== _) && D.push(X[V]);
        D.length ? this._events[k] = D.length === 1 ? D[0] : D : u(this, k);
      }
      return this;
    }, c.prototype.removeAllListeners = function(f) {
      var d;
      return f ? (d = n ? n + f : f, this._events[d] && u(this, d)) : (this._events = new r(), this._eventsCount = 0), this;
    }, c.prototype.off = c.prototype.removeListener, c.prototype.addListener = c.prototype.on, c.prefixed = n, c.EventEmitter = c, t.exports = c;
  }(Pr)), Pr.exports;
}
var Ra = Oa(), Da = /* @__PURE__ */ Si(Ra), te;
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
var Br;
(function(t) {
  t.mergeShapes = (e, n) => ({
    ...e,
    ...n
    // second overwrites first
  });
})(Br || (Br = {}));
const P = te.arrayToEnum([
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
      return P.undefined;
    case "string":
      return P.string;
    case "number":
      return isNaN(t) ? P.nan : P.number;
    case "boolean":
      return P.boolean;
    case "function":
      return P.function;
    case "bigint":
      return P.bigint;
    case "symbol":
      return P.symbol;
    case "object":
      return Array.isArray(t) ? P.array : t === null ? P.null : t.then && typeof t.then == "function" && t.catch && typeof t.catch == "function" ? P.promise : typeof Map < "u" && t instanceof Map ? P.map : typeof Set < "u" && t instanceof Set ? P.set : typeof Date < "u" && t instanceof Date ? P.date : P.object;
    default:
      return P.unknown;
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
]), xa = (t) => JSON.stringify(t, null, 2).replace(/"([^"]+)":/g, "$1:");
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
const zt = (t, e) => {
  let n;
  switch (t.code) {
    case S.invalid_type:
      t.received === P.undefined ? n = "Required" : n = `Expected ${t.expected}, received ${t.received}`;
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
let Oi = zt;
function Pa(t) {
  Oi = t;
}
function ir() {
  return Oi;
}
const sr = (t) => {
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
}, ka = [];
function x(t, e) {
  const n = ir(), r = sr({
    issueData: e,
    data: t.data,
    path: t.path,
    errorMaps: [
      t.common.contextualErrorMap,
      t.schemaErrorMap,
      n,
      n === zt ? void 0 : zt
      // then global default map
    ].filter((i) => !!i)
  });
  t.common.issues.push(r);
}
class Ne {
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
        return q;
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
    return Ne.mergeObjectSync(e, r);
  }
  static mergeObjectSync(e, n) {
    const r = {};
    for (const i of n) {
      const { key: s, value: u } = i;
      if (s.status === "aborted" || u.status === "aborted")
        return q;
      s.status === "dirty" && e.dirty(), u.status === "dirty" && e.dirty(), s.value !== "__proto__" && (typeof u.value < "u" || i.alwaysSet) && (r[s.value] = u.value);
    }
    return { status: e.value, value: r };
  }
}
const q = Object.freeze({
  status: "aborted"
}), Yt = (t) => ({ status: "dirty", value: t }), De = (t) => ({ status: "valid", value: t }), Gr = (t) => t.status === "aborted", Zr = (t) => t.status === "dirty", hn = (t) => t.status === "valid", gn = (t) => typeof Promise < "u" && t instanceof Promise;
function ar(t, e, n, r) {
  if (typeof e == "function" ? t !== e || !r : !e.has(t))
    throw new TypeError("Cannot read private member from an object whose class did not declare it");
  return e.get(t);
}
function Ri(t, e, n, r, i) {
  if (typeof e == "function" ? t !== e || !i : !e.has(t))
    throw new TypeError("Cannot write private member to an object whose class did not declare it");
  return e.set(t, n), n;
}
var B;
(function(t) {
  t.errToObj = (e) => typeof e == "string" ? { message: e } : e || {}, t.toString = (e) => typeof e == "string" ? e : e == null ? void 0 : e.message;
})(B || (B = {}));
var cn, dn;
class Je {
  constructor(e, n, r, i) {
    this._cachedPath = [], this.parent = e, this.data = n, this._path = r, this._key = i;
  }
  get path() {
    return this._cachedPath.length || (this._key instanceof Array ? this._cachedPath.push(...this._path, ...this._key) : this._cachedPath.push(...this._path, this._key)), this._cachedPath;
  }
}
const hi = (t, e) => {
  if (hn(e))
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
function C(t) {
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
class W {
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
      status: new Ne(),
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
    if (gn(n))
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
    return hi(i, s);
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
    }, i = this._parse({ data: e, path: r.path, parent: r }), s = await (gn(i) ? i : Promise.resolve(i));
    return hi(r, s);
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
    return Nt.create(this, this._def);
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
    return En.create([this, e], this._def);
  }
  and(e) {
    return yn.create(this, e, this._def);
  }
  transform(e) {
    return new ze({
      ...C(this._def),
      schema: this,
      typeName: K.ZodEffects,
      effect: { type: "transform", transform: e }
    });
  }
  default(e) {
    const n = typeof e == "function" ? e : () => e;
    return new wn({
      ...C(this._def),
      innerType: this,
      defaultValue: n,
      typeName: K.ZodDefault
    });
  }
  brand() {
    return new Yr({
      typeName: K.ZodBranded,
      type: this,
      ...C(this._def)
    });
  }
  catch(e) {
    const n = typeof e == "function" ? e : () => e;
    return new In({
      ...C(this._def),
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
    return Dn.create(this, e);
  }
  readonly() {
    return Sn.create(this);
  }
  isOptional() {
    return this.safeParse(void 0).success;
  }
  isNullable() {
    return this.safeParse(null).success;
  }
}
const Ma = /^c[^\s-]{8,}$/i, La = /^[0-9a-z]+$/, Ua = /^[0-9A-HJKMNP-TV-Z]{26}$/, Ba = /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/i, Ga = /^[a-z0-9_-]{21}$/i, Za = /^[-+]?P(?!$)(?:(?:[-+]?\d+Y)|(?:[-+]?\d+[.,]\d+Y$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:(?:[-+]?\d+W)|(?:[-+]?\d+[.,]\d+W$))?(?:(?:[-+]?\d+D)|(?:[-+]?\d+[.,]\d+D$))?(?:T(?=[\d+-])(?:(?:[-+]?\d+H)|(?:[-+]?\d+[.,]\d+H$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:[-+]?\d+(?:[.,]\d+)?S)?)??$/, Va = /^(?!\.)(?!.*\.\.)([A-Z0-9_'+\-\.]*)[A-Z0-9_+-]@([A-Z0-9][A-Z0-9\-]*\.)+[A-Z]{2,}$/i, Ha = "^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$";
let kr;
const Fa = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/, ja = /^(([a-f0-9]{1,4}:){7}|::([a-f0-9]{1,4}:){0,6}|([a-f0-9]{1,4}:){1}:([a-f0-9]{1,4}:){0,5}|([a-f0-9]{1,4}:){2}:([a-f0-9]{1,4}:){0,4}|([a-f0-9]{1,4}:){3}:([a-f0-9]{1,4}:){0,3}|([a-f0-9]{1,4}:){4}:([a-f0-9]{1,4}:){0,2}|([a-f0-9]{1,4}:){5}:([a-f0-9]{1,4}:){0,1})([a-f0-9]{1,4}|(((25[0-5])|(2[0-4][0-9])|(1[0-9]{2})|([0-9]{1,2}))\.){3}((25[0-5])|(2[0-4][0-9])|(1[0-9]{2})|([0-9]{1,2})))$/, Ka = /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/, Di = "((\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-((0[13578]|1[02])-(0[1-9]|[12]\\d|3[01])|(0[469]|11)-(0[1-9]|[12]\\d|30)|(02)-(0[1-9]|1\\d|2[0-8])))", qa = new RegExp(`^${Di}$`);
function xi(t) {
  let e = "([01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d";
  return t.precision ? e = `${e}\\.\\d{${t.precision}}` : t.precision == null && (e = `${e}(\\.\\d+)?`), e;
}
function Ya(t) {
  return new RegExp(`^${xi(t)}$`);
}
function Pi(t) {
  let e = `${Di}T${xi(t)}`;
  const n = [];
  return n.push(t.local ? "Z?" : "Z"), t.offset && n.push("([+-]\\d{2}:?\\d{2})"), e = `${e}(${n.join("|")})`, new RegExp(`^${e}$`);
}
function $a(t, e) {
  return !!((e === "v4" || !e) && Fa.test(t) || (e === "v6" || !e) && ja.test(t));
}
class Ye extends W {
  _parse(e) {
    if (this._def.coerce && (e.data = String(e.data)), this._getType(e) !== P.string) {
      const s = this._getOrReturnCtx(e);
      return x(s, {
        code: S.invalid_type,
        expected: P.string,
        received: s.parsedType
      }), q;
    }
    const r = new Ne();
    let i;
    for (const s of this._def.checks)
      if (s.kind === "min")
        e.data.length < s.value && (i = this._getOrReturnCtx(e, i), x(i, {
          code: S.too_small,
          minimum: s.value,
          type: "string",
          inclusive: !0,
          exact: !1,
          message: s.message
        }), r.dirty());
      else if (s.kind === "max")
        e.data.length > s.value && (i = this._getOrReturnCtx(e, i), x(i, {
          code: S.too_big,
          maximum: s.value,
          type: "string",
          inclusive: !0,
          exact: !1,
          message: s.message
        }), r.dirty());
      else if (s.kind === "length") {
        const u = e.data.length > s.value, c = e.data.length < s.value;
        (u || c) && (i = this._getOrReturnCtx(e, i), u ? x(i, {
          code: S.too_big,
          maximum: s.value,
          type: "string",
          inclusive: !0,
          exact: !0,
          message: s.message
        }) : c && x(i, {
          code: S.too_small,
          minimum: s.value,
          type: "string",
          inclusive: !0,
          exact: !0,
          message: s.message
        }), r.dirty());
      } else if (s.kind === "email")
        Va.test(e.data) || (i = this._getOrReturnCtx(e, i), x(i, {
          validation: "email",
          code: S.invalid_string,
          message: s.message
        }), r.dirty());
      else if (s.kind === "emoji")
        kr || (kr = new RegExp(Ha, "u")), kr.test(e.data) || (i = this._getOrReturnCtx(e, i), x(i, {
          validation: "emoji",
          code: S.invalid_string,
          message: s.message
        }), r.dirty());
      else if (s.kind === "uuid")
        Ba.test(e.data) || (i = this._getOrReturnCtx(e, i), x(i, {
          validation: "uuid",
          code: S.invalid_string,
          message: s.message
        }), r.dirty());
      else if (s.kind === "nanoid")
        Ga.test(e.data) || (i = this._getOrReturnCtx(e, i), x(i, {
          validation: "nanoid",
          code: S.invalid_string,
          message: s.message
        }), r.dirty());
      else if (s.kind === "cuid")
        Ma.test(e.data) || (i = this._getOrReturnCtx(e, i), x(i, {
          validation: "cuid",
          code: S.invalid_string,
          message: s.message
        }), r.dirty());
      else if (s.kind === "cuid2")
        La.test(e.data) || (i = this._getOrReturnCtx(e, i), x(i, {
          validation: "cuid2",
          code: S.invalid_string,
          message: s.message
        }), r.dirty());
      else if (s.kind === "ulid")
        Ua.test(e.data) || (i = this._getOrReturnCtx(e, i), x(i, {
          validation: "ulid",
          code: S.invalid_string,
          message: s.message
        }), r.dirty());
      else if (s.kind === "url")
        try {
          new URL(e.data);
        } catch {
          i = this._getOrReturnCtx(e, i), x(i, {
            validation: "url",
            code: S.invalid_string,
            message: s.message
          }), r.dirty();
        }
      else
        s.kind === "regex" ? (s.regex.lastIndex = 0, s.regex.test(e.data) || (i = this._getOrReturnCtx(e, i), x(i, {
          validation: "regex",
          code: S.invalid_string,
          message: s.message
        }), r.dirty())) : s.kind === "trim" ? e.data = e.data.trim() : s.kind === "includes" ? e.data.includes(s.value, s.position) || (i = this._getOrReturnCtx(e, i), x(i, {
          code: S.invalid_string,
          validation: { includes: s.value, position: s.position },
          message: s.message
        }), r.dirty()) : s.kind === "toLowerCase" ? e.data = e.data.toLowerCase() : s.kind === "toUpperCase" ? e.data = e.data.toUpperCase() : s.kind === "startsWith" ? e.data.startsWith(s.value) || (i = this._getOrReturnCtx(e, i), x(i, {
          code: S.invalid_string,
          validation: { startsWith: s.value },
          message: s.message
        }), r.dirty()) : s.kind === "endsWith" ? e.data.endsWith(s.value) || (i = this._getOrReturnCtx(e, i), x(i, {
          code: S.invalid_string,
          validation: { endsWith: s.value },
          message: s.message
        }), r.dirty()) : s.kind === "datetime" ? Pi(s).test(e.data) || (i = this._getOrReturnCtx(e, i), x(i, {
          code: S.invalid_string,
          validation: "datetime",
          message: s.message
        }), r.dirty()) : s.kind === "date" ? qa.test(e.data) || (i = this._getOrReturnCtx(e, i), x(i, {
          code: S.invalid_string,
          validation: "date",
          message: s.message
        }), r.dirty()) : s.kind === "time" ? Ya(s).test(e.data) || (i = this._getOrReturnCtx(e, i), x(i, {
          code: S.invalid_string,
          validation: "time",
          message: s.message
        }), r.dirty()) : s.kind === "duration" ? Za.test(e.data) || (i = this._getOrReturnCtx(e, i), x(i, {
          validation: "duration",
          code: S.invalid_string,
          message: s.message
        }), r.dirty()) : s.kind === "ip" ? $a(e.data, s.version) || (i = this._getOrReturnCtx(e, i), x(i, {
          validation: "ip",
          code: S.invalid_string,
          message: s.message
        }), r.dirty()) : s.kind === "base64" ? Ka.test(e.data) || (i = this._getOrReturnCtx(e, i), x(i, {
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
    return new Ye({
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
    return new Ye({
      ...this._def,
      checks: [...this._def.checks, { kind: "trim" }]
    });
  }
  toLowerCase() {
    return new Ye({
      ...this._def,
      checks: [...this._def.checks, { kind: "toLowerCase" }]
    });
  }
  toUpperCase() {
    return new Ye({
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
Ye.create = (t) => {
  var e;
  return new Ye({
    checks: [],
    typeName: K.ZodString,
    coerce: (e = t == null ? void 0 : t.coerce) !== null && e !== void 0 ? e : !1,
    ...C(t)
  });
};
function za(t, e) {
  const n = (t.toString().split(".")[1] || "").length, r = (e.toString().split(".")[1] || "").length, i = n > r ? n : r, s = parseInt(t.toFixed(i).replace(".", "")), u = parseInt(e.toFixed(i).replace(".", ""));
  return s % u / Math.pow(10, i);
}
class Tt extends W {
  constructor() {
    super(...arguments), this.min = this.gte, this.max = this.lte, this.step = this.multipleOf;
  }
  _parse(e) {
    if (this._def.coerce && (e.data = Number(e.data)), this._getType(e) !== P.number) {
      const s = this._getOrReturnCtx(e);
      return x(s, {
        code: S.invalid_type,
        expected: P.number,
        received: s.parsedType
      }), q;
    }
    let r;
    const i = new Ne();
    for (const s of this._def.checks)
      s.kind === "int" ? te.isInteger(e.data) || (r = this._getOrReturnCtx(e, r), x(r, {
        code: S.invalid_type,
        expected: "integer",
        received: "float",
        message: s.message
      }), i.dirty()) : s.kind === "min" ? (s.inclusive ? e.data < s.value : e.data <= s.value) && (r = this._getOrReturnCtx(e, r), x(r, {
        code: S.too_small,
        minimum: s.value,
        type: "number",
        inclusive: s.inclusive,
        exact: !1,
        message: s.message
      }), i.dirty()) : s.kind === "max" ? (s.inclusive ? e.data > s.value : e.data >= s.value) && (r = this._getOrReturnCtx(e, r), x(r, {
        code: S.too_big,
        maximum: s.value,
        type: "number",
        inclusive: s.inclusive,
        exact: !1,
        message: s.message
      }), i.dirty()) : s.kind === "multipleOf" ? za(e.data, s.value) !== 0 && (r = this._getOrReturnCtx(e, r), x(r, {
        code: S.not_multiple_of,
        multipleOf: s.value,
        message: s.message
      }), i.dirty()) : s.kind === "finite" ? Number.isFinite(e.data) || (r = this._getOrReturnCtx(e, r), x(r, {
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
  ...C(t)
});
class bt extends W {
  constructor() {
    super(...arguments), this.min = this.gte, this.max = this.lte;
  }
  _parse(e) {
    if (this._def.coerce && (e.data = BigInt(e.data)), this._getType(e) !== P.bigint) {
      const s = this._getOrReturnCtx(e);
      return x(s, {
        code: S.invalid_type,
        expected: P.bigint,
        received: s.parsedType
      }), q;
    }
    let r;
    const i = new Ne();
    for (const s of this._def.checks)
      s.kind === "min" ? (s.inclusive ? e.data < s.value : e.data <= s.value) && (r = this._getOrReturnCtx(e, r), x(r, {
        code: S.too_small,
        type: "bigint",
        minimum: s.value,
        inclusive: s.inclusive,
        message: s.message
      }), i.dirty()) : s.kind === "max" ? (s.inclusive ? e.data > s.value : e.data >= s.value) && (r = this._getOrReturnCtx(e, r), x(r, {
        code: S.too_big,
        type: "bigint",
        maximum: s.value,
        inclusive: s.inclusive,
        message: s.message
      }), i.dirty()) : s.kind === "multipleOf" ? e.data % s.value !== BigInt(0) && (r = this._getOrReturnCtx(e, r), x(r, {
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
    return new bt({
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
    return new bt({
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
bt.create = (t) => {
  var e;
  return new bt({
    checks: [],
    typeName: K.ZodBigInt,
    coerce: (e = t == null ? void 0 : t.coerce) !== null && e !== void 0 ? e : !1,
    ...C(t)
  });
};
class _n extends W {
  _parse(e) {
    if (this._def.coerce && (e.data = !!e.data), this._getType(e) !== P.boolean) {
      const r = this._getOrReturnCtx(e);
      return x(r, {
        code: S.invalid_type,
        expected: P.boolean,
        received: r.parsedType
      }), q;
    }
    return De(e.data);
  }
}
_n.create = (t) => new _n({
  typeName: K.ZodBoolean,
  coerce: (t == null ? void 0 : t.coerce) || !1,
  ...C(t)
});
class Ut extends W {
  _parse(e) {
    if (this._def.coerce && (e.data = new Date(e.data)), this._getType(e) !== P.date) {
      const s = this._getOrReturnCtx(e);
      return x(s, {
        code: S.invalid_type,
        expected: P.date,
        received: s.parsedType
      }), q;
    }
    if (isNaN(e.data.getTime())) {
      const s = this._getOrReturnCtx(e);
      return x(s, {
        code: S.invalid_date
      }), q;
    }
    const r = new Ne();
    let i;
    for (const s of this._def.checks)
      s.kind === "min" ? e.data.getTime() < s.value && (i = this._getOrReturnCtx(e, i), x(i, {
        code: S.too_small,
        message: s.message,
        inclusive: !0,
        exact: !1,
        minimum: s.value,
        type: "date"
      }), r.dirty()) : s.kind === "max" ? e.data.getTime() > s.value && (i = this._getOrReturnCtx(e, i), x(i, {
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
  ...C(t)
});
class or extends W {
  _parse(e) {
    if (this._getType(e) !== P.symbol) {
      const r = this._getOrReturnCtx(e);
      return x(r, {
        code: S.invalid_type,
        expected: P.symbol,
        received: r.parsedType
      }), q;
    }
    return De(e.data);
  }
}
or.create = (t) => new or({
  typeName: K.ZodSymbol,
  ...C(t)
});
class mn extends W {
  _parse(e) {
    if (this._getType(e) !== P.undefined) {
      const r = this._getOrReturnCtx(e);
      return x(r, {
        code: S.invalid_type,
        expected: P.undefined,
        received: r.parsedType
      }), q;
    }
    return De(e.data);
  }
}
mn.create = (t) => new mn({
  typeName: K.ZodUndefined,
  ...C(t)
});
class vn extends W {
  _parse(e) {
    if (this._getType(e) !== P.null) {
      const r = this._getOrReturnCtx(e);
      return x(r, {
        code: S.invalid_type,
        expected: P.null,
        received: r.parsedType
      }), q;
    }
    return De(e.data);
  }
}
vn.create = (t) => new vn({
  typeName: K.ZodNull,
  ...C(t)
});
class Ct extends W {
  constructor() {
    super(...arguments), this._any = !0;
  }
  _parse(e) {
    return De(e.data);
  }
}
Ct.create = (t) => new Ct({
  typeName: K.ZodAny,
  ...C(t)
});
class Mt extends W {
  constructor() {
    super(...arguments), this._unknown = !0;
  }
  _parse(e) {
    return De(e.data);
  }
}
Mt.create = (t) => new Mt({
  typeName: K.ZodUnknown,
  ...C(t)
});
class gt extends W {
  _parse(e) {
    const n = this._getOrReturnCtx(e);
    return x(n, {
      code: S.invalid_type,
      expected: P.never,
      received: n.parsedType
    }), q;
  }
}
gt.create = (t) => new gt({
  typeName: K.ZodNever,
  ...C(t)
});
class lr extends W {
  _parse(e) {
    if (this._getType(e) !== P.undefined) {
      const r = this._getOrReturnCtx(e);
      return x(r, {
        code: S.invalid_type,
        expected: P.void,
        received: r.parsedType
      }), q;
    }
    return De(e.data);
  }
}
lr.create = (t) => new lr({
  typeName: K.ZodVoid,
  ...C(t)
});
class $e extends W {
  _parse(e) {
    const { ctx: n, status: r } = this._processInputParams(e), i = this._def;
    if (n.parsedType !== P.array)
      return x(n, {
        code: S.invalid_type,
        expected: P.array,
        received: n.parsedType
      }), q;
    if (i.exactLength !== null) {
      const u = n.data.length > i.exactLength.value, c = n.data.length < i.exactLength.value;
      (u || c) && (x(n, {
        code: u ? S.too_big : S.too_small,
        minimum: c ? i.exactLength.value : void 0,
        maximum: u ? i.exactLength.value : void 0,
        type: "array",
        inclusive: !0,
        exact: !0,
        message: i.exactLength.message
      }), r.dirty());
    }
    if (i.minLength !== null && n.data.length < i.minLength.value && (x(n, {
      code: S.too_small,
      minimum: i.minLength.value,
      type: "array",
      inclusive: !0,
      exact: !1,
      message: i.minLength.message
    }), r.dirty()), i.maxLength !== null && n.data.length > i.maxLength.value && (x(n, {
      code: S.too_big,
      maximum: i.maxLength.value,
      type: "array",
      inclusive: !0,
      exact: !1,
      message: i.maxLength.message
    }), r.dirty()), n.common.async)
      return Promise.all([...n.data].map((u, c) => i.type._parseAsync(new Je(n, u, n.path, c)))).then((u) => Ne.mergeArray(r, u));
    const s = [...n.data].map((u, c) => i.type._parseSync(new Je(n, u, n.path, c)));
    return Ne.mergeArray(r, s);
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
  ...C(e)
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
    }) : t instanceof Qe ? Qe.create(jt(t.unwrap())) : t instanceof Nt ? Nt.create(jt(t.unwrap())) : t instanceof et ? et.create(t.items.map((e) => jt(e))) : t;
}
class de extends W {
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
    if (this._getType(e) !== P.object) {
      const f = this._getOrReturnCtx(e);
      return x(f, {
        code: S.invalid_type,
        expected: P.object,
        received: f.parsedType
      }), q;
    }
    const { status: r, ctx: i } = this._processInputParams(e), { shape: s, keys: u } = this._getCached(), c = [];
    if (!(this._def.catchall instanceof gt && this._def.unknownKeys === "strip"))
      for (const f in i.data)
        u.includes(f) || c.push(f);
    const g = [];
    for (const f of u) {
      const d = s[f], _ = i.data[f];
      g.push({
        key: { status: "valid", value: f },
        value: d._parse(new Je(i, _, i.path, f)),
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
        c.length > 0 && (x(i, {
          code: S.unrecognized_keys,
          keys: c
        }), r.dirty());
      else if (f !== "strip")
        throw new Error("Internal ZodObject error: invalid unknownKeys value.");
    } else {
      const f = this._def.catchall;
      for (const d of c) {
        const _ = i.data[d];
        g.push({
          key: { status: "valid", value: d },
          value: f._parse(
            new Je(i, _, i.path, d)
            //, ctx.child(key), value, getParsedType(value)
          ),
          alwaysSet: d in i.data
        });
      }
    }
    return i.common.async ? Promise.resolve().then(async () => {
      const f = [];
      for (const d of g) {
        const _ = await d.key, A = await d.value;
        f.push({
          key: _,
          value: A,
          alwaysSet: d.alwaysSet
        });
      }
      return f;
    }).then((f) => Ne.mergeObjectSync(r, f)) : Ne.mergeObjectSync(r, g);
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
    return ki(te.objectKeys(this.shape));
  }
}
de.create = (t, e) => new de({
  shape: () => t,
  unknownKeys: "strip",
  catchall: gt.create(),
  typeName: K.ZodObject,
  ...C(e)
});
de.strictCreate = (t, e) => new de({
  shape: () => t,
  unknownKeys: "strict",
  catchall: gt.create(),
  typeName: K.ZodObject,
  ...C(e)
});
de.lazycreate = (t, e) => new de({
  shape: t,
  unknownKeys: "strip",
  catchall: gt.create(),
  typeName: K.ZodObject,
  ...C(e)
});
class En extends W {
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
      return x(n, {
        code: S.invalid_union,
        unionErrors: u
      }), q;
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
      return x(n, {
        code: S.invalid_union,
        unionErrors: c
      }), q;
    }
  }
  get options() {
    return this._def.options;
  }
}
En.create = (t, e) => new En({
  options: t,
  typeName: K.ZodUnion,
  ...C(e)
});
const dt = (t) => t instanceof bn ? dt(t.schema) : t instanceof ze ? dt(t.innerType()) : t instanceof An ? [t.value] : t instanceof At ? t.options : t instanceof Nn ? te.objectValues(t.enum) : t instanceof wn ? dt(t._def.innerType) : t instanceof mn ? [void 0] : t instanceof vn ? [null] : t instanceof Qe ? [void 0, ...dt(t.unwrap())] : t instanceof Nt ? [null, ...dt(t.unwrap())] : t instanceof Yr || t instanceof Sn ? dt(t.unwrap()) : t instanceof In ? dt(t._def.innerType) : [];
class fr extends W {
  _parse(e) {
    const { ctx: n } = this._processInputParams(e);
    if (n.parsedType !== P.object)
      return x(n, {
        code: S.invalid_type,
        expected: P.object,
        received: n.parsedType
      }), q;
    const r = this.discriminator, i = n.data[r], s = this.optionsMap.get(i);
    return s ? n.common.async ? s._parseAsync({
      data: n.data,
      path: n.path,
      parent: n
    }) : s._parseSync({
      data: n.data,
      path: n.path,
      parent: n
    }) : (x(n, {
      code: S.invalid_union_discriminator,
      options: Array.from(this.optionsMap.keys()),
      path: [r]
    }), q);
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
    return new fr({
      typeName: K.ZodDiscriminatedUnion,
      discriminator: e,
      options: n,
      optionsMap: i,
      ...C(r)
    });
  }
}
function Vr(t, e) {
  const n = Et(t), r = Et(e);
  if (t === e)
    return { valid: !0, data: t };
  if (n === P.object && r === P.object) {
    const i = te.objectKeys(e), s = te.objectKeys(t).filter((c) => i.indexOf(c) !== -1), u = { ...t, ...e };
    for (const c of s) {
      const g = Vr(t[c], e[c]);
      if (!g.valid)
        return { valid: !1 };
      u[c] = g.data;
    }
    return { valid: !0, data: u };
  } else if (n === P.array && r === P.array) {
    if (t.length !== e.length)
      return { valid: !1 };
    const i = [];
    for (let s = 0; s < t.length; s++) {
      const u = t[s], c = e[s], g = Vr(u, c);
      if (!g.valid)
        return { valid: !1 };
      i.push(g.data);
    }
    return { valid: !0, data: i };
  } else
    return n === P.date && r === P.date && +t == +e ? { valid: !0, data: t } : { valid: !1 };
}
class yn extends W {
  _parse(e) {
    const { status: n, ctx: r } = this._processInputParams(e), i = (s, u) => {
      if (Gr(s) || Gr(u))
        return q;
      const c = Vr(s.value, u.value);
      return c.valid ? ((Zr(s) || Zr(u)) && n.dirty(), { status: n.value, value: c.data }) : (x(r, {
        code: S.invalid_intersection_types
      }), q);
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
yn.create = (t, e, n) => new yn({
  left: t,
  right: e,
  typeName: K.ZodIntersection,
  ...C(n)
});
class et extends W {
  _parse(e) {
    const { status: n, ctx: r } = this._processInputParams(e);
    if (r.parsedType !== P.array)
      return x(r, {
        code: S.invalid_type,
        expected: P.array,
        received: r.parsedType
      }), q;
    if (r.data.length < this._def.items.length)
      return x(r, {
        code: S.too_small,
        minimum: this._def.items.length,
        inclusive: !0,
        exact: !1,
        type: "array"
      }), q;
    !this._def.rest && r.data.length > this._def.items.length && (x(r, {
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
    return r.common.async ? Promise.all(s).then((u) => Ne.mergeArray(n, u)) : Ne.mergeArray(n, s);
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
    ...C(e)
  });
};
class Tn extends W {
  get keySchema() {
    return this._def.keyType;
  }
  get valueSchema() {
    return this._def.valueType;
  }
  _parse(e) {
    const { status: n, ctx: r } = this._processInputParams(e);
    if (r.parsedType !== P.object)
      return x(r, {
        code: S.invalid_type,
        expected: P.object,
        received: r.parsedType
      }), q;
    const i = [], s = this._def.keyType, u = this._def.valueType;
    for (const c in r.data)
      i.push({
        key: s._parse(new Je(r, c, r.path, c)),
        value: u._parse(new Je(r, r.data[c], r.path, c)),
        alwaysSet: c in r.data
      });
    return r.common.async ? Ne.mergeObjectAsync(n, i) : Ne.mergeObjectSync(n, i);
  }
  get element() {
    return this._def.valueType;
  }
  static create(e, n, r) {
    return n instanceof W ? new Tn({
      keyType: e,
      valueType: n,
      typeName: K.ZodRecord,
      ...C(r)
    }) : new Tn({
      keyType: Ye.create(),
      valueType: e,
      typeName: K.ZodRecord,
      ...C(n)
    });
  }
}
class ur extends W {
  get keySchema() {
    return this._def.keyType;
  }
  get valueSchema() {
    return this._def.valueType;
  }
  _parse(e) {
    const { status: n, ctx: r } = this._processInputParams(e);
    if (r.parsedType !== P.map)
      return x(r, {
        code: S.invalid_type,
        expected: P.map,
        received: r.parsedType
      }), q;
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
            return q;
          (f.status === "dirty" || d.status === "dirty") && n.dirty(), c.set(f.value, d.value);
        }
        return { status: n.value, value: c };
      });
    } else {
      const c = /* @__PURE__ */ new Map();
      for (const g of u) {
        const f = g.key, d = g.value;
        if (f.status === "aborted" || d.status === "aborted")
          return q;
        (f.status === "dirty" || d.status === "dirty") && n.dirty(), c.set(f.value, d.value);
      }
      return { status: n.value, value: c };
    }
  }
}
ur.create = (t, e, n) => new ur({
  valueType: e,
  keyType: t,
  typeName: K.ZodMap,
  ...C(n)
});
class Bt extends W {
  _parse(e) {
    const { status: n, ctx: r } = this._processInputParams(e);
    if (r.parsedType !== P.set)
      return x(r, {
        code: S.invalid_type,
        expected: P.set,
        received: r.parsedType
      }), q;
    const i = this._def;
    i.minSize !== null && r.data.size < i.minSize.value && (x(r, {
      code: S.too_small,
      minimum: i.minSize.value,
      type: "set",
      inclusive: !0,
      exact: !1,
      message: i.minSize.message
    }), n.dirty()), i.maxSize !== null && r.data.size > i.maxSize.value && (x(r, {
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
          return q;
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
  ...C(e)
});
class $t extends W {
  constructor() {
    super(...arguments), this.validate = this.implement;
  }
  _parse(e) {
    const { ctx: n } = this._processInputParams(e);
    if (n.parsedType !== P.function)
      return x(n, {
        code: S.invalid_type,
        expected: P.function,
        received: n.parsedType
      }), q;
    function r(c, g) {
      return sr({
        data: c,
        path: n.path,
        errorMaps: [
          n.common.contextualErrorMap,
          n.schemaErrorMap,
          ir(),
          zt
        ].filter((f) => !!f),
        issueData: {
          code: S.invalid_arguments,
          argumentsError: g
        }
      });
    }
    function i(c, g) {
      return sr({
        data: c,
        path: n.path,
        errorMaps: [
          n.common.contextualErrorMap,
          n.schemaErrorMap,
          ir(),
          zt
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
        const f = new Be([]), d = await c._def.args.parseAsync(g, s).catch((k) => {
          throw f.addIssue(r(g, k)), f;
        }), _ = await Reflect.apply(u, this, d);
        return await c._def.returns._def.type.parseAsync(_, s).catch((k) => {
          throw f.addIssue(i(_, k)), f;
        });
      });
    } else {
      const c = this;
      return De(function(...g) {
        const f = c._def.args.safeParse(g, s);
        if (!f.success)
          throw new Be([r(g, f.error)]);
        const d = Reflect.apply(u, this, f.data), _ = c._def.returns.safeParse(d, s);
        if (!_.success)
          throw new Be([i(d, _.error)]);
        return _.data;
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
    return new $t({
      ...this._def,
      args: et.create(e).rest(Mt.create())
    });
  }
  returns(e) {
    return new $t({
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
    return new $t({
      args: e || et.create([]).rest(Mt.create()),
      returns: n || Mt.create(),
      typeName: K.ZodFunction,
      ...C(r)
    });
  }
}
class bn extends W {
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
  ...C(e)
});
class An extends W {
  _parse(e) {
    if (e.data !== this._def.value) {
      const n = this._getOrReturnCtx(e);
      return x(n, {
        received: n.data,
        code: S.invalid_literal,
        expected: this._def.value
      }), q;
    }
    return { status: "valid", value: e.data };
  }
  get value() {
    return this._def.value;
  }
}
An.create = (t, e) => new An({
  value: t,
  typeName: K.ZodLiteral,
  ...C(e)
});
function ki(t, e) {
  return new At({
    values: t,
    typeName: K.ZodEnum,
    ...C(e)
  });
}
class At extends W {
  constructor() {
    super(...arguments), cn.set(this, void 0);
  }
  _parse(e) {
    if (typeof e.data != "string") {
      const n = this._getOrReturnCtx(e), r = this._def.values;
      return x(n, {
        expected: te.joinValues(r),
        received: n.parsedType,
        code: S.invalid_type
      }), q;
    }
    if (ar(this, cn) || Ri(this, cn, new Set(this._def.values)), !ar(this, cn).has(e.data)) {
      const n = this._getOrReturnCtx(e), r = this._def.values;
      return x(n, {
        received: n.data,
        code: S.invalid_enum_value,
        options: r
      }), q;
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
cn = /* @__PURE__ */ new WeakMap();
At.create = ki;
class Nn extends W {
  constructor() {
    super(...arguments), dn.set(this, void 0);
  }
  _parse(e) {
    const n = te.getValidEnumValues(this._def.values), r = this._getOrReturnCtx(e);
    if (r.parsedType !== P.string && r.parsedType !== P.number) {
      const i = te.objectValues(n);
      return x(r, {
        expected: te.joinValues(i),
        received: r.parsedType,
        code: S.invalid_type
      }), q;
    }
    if (ar(this, dn) || Ri(this, dn, new Set(te.getValidEnumValues(this._def.values))), !ar(this, dn).has(e.data)) {
      const i = te.objectValues(n);
      return x(r, {
        received: r.data,
        code: S.invalid_enum_value,
        options: i
      }), q;
    }
    return De(e.data);
  }
  get enum() {
    return this._def.values;
  }
}
dn = /* @__PURE__ */ new WeakMap();
Nn.create = (t, e) => new Nn({
  values: t,
  typeName: K.ZodNativeEnum,
  ...C(e)
});
class Xt extends W {
  unwrap() {
    return this._def.type;
  }
  _parse(e) {
    const { ctx: n } = this._processInputParams(e);
    if (n.parsedType !== P.promise && n.common.async === !1)
      return x(n, {
        code: S.invalid_type,
        expected: P.promise,
        received: n.parsedType
      }), q;
    const r = n.parsedType === P.promise ? n.data : Promise.resolve(n.data);
    return De(r.then((i) => this._def.type.parseAsync(i, {
      path: n.path,
      errorMap: n.common.contextualErrorMap
    })));
  }
}
Xt.create = (t, e) => new Xt({
  type: t,
  typeName: K.ZodPromise,
  ...C(e)
});
class ze extends W {
  innerType() {
    return this._def.schema;
  }
  sourceType() {
    return this._def.schema._def.typeName === K.ZodEffects ? this._def.schema.sourceType() : this._def.schema;
  }
  _parse(e) {
    const { status: n, ctx: r } = this._processInputParams(e), i = this._def.effect || null, s = {
      addIssue: (u) => {
        x(r, u), u.fatal ? n.abort() : n.dirty();
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
            return q;
          const g = await this._def.schema._parseAsync({
            data: c,
            path: r.path,
            parent: r
          });
          return g.status === "aborted" ? q : g.status === "dirty" || n.value === "dirty" ? Yt(g.value) : g;
        });
      {
        if (n.value === "aborted")
          return q;
        const c = this._def.schema._parseSync({
          data: u,
          path: r.path,
          parent: r
        });
        return c.status === "aborted" ? q : c.status === "dirty" || n.value === "dirty" ? Yt(c.value) : c;
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
        return c.status === "aborted" ? q : (c.status === "dirty" && n.dirty(), u(c.value), { status: n.value, value: c.value });
      } else
        return this._def.schema._parseAsync({ data: r.data, path: r.path, parent: r }).then((c) => c.status === "aborted" ? q : (c.status === "dirty" && n.dirty(), u(c.value).then(() => ({ status: n.value, value: c.value }))));
    }
    if (i.type === "transform")
      if (r.common.async === !1) {
        const u = this._def.schema._parseSync({
          data: r.data,
          path: r.path,
          parent: r
        });
        if (!hn(u))
          return u;
        const c = i.transform(u.value, s);
        if (c instanceof Promise)
          throw new Error("Asynchronous transform encountered during synchronous parse operation. Use .parseAsync instead.");
        return { status: n.value, value: c };
      } else
        return this._def.schema._parseAsync({ data: r.data, path: r.path, parent: r }).then((u) => hn(u) ? Promise.resolve(i.transform(u.value, s)).then((c) => ({ status: n.value, value: c })) : u);
    te.assertNever(i);
  }
}
ze.create = (t, e, n) => new ze({
  schema: t,
  typeName: K.ZodEffects,
  effect: e,
  ...C(n)
});
ze.createWithPreprocess = (t, e, n) => new ze({
  schema: e,
  effect: { type: "preprocess", transform: t },
  typeName: K.ZodEffects,
  ...C(n)
});
class Qe extends W {
  _parse(e) {
    return this._getType(e) === P.undefined ? De(void 0) : this._def.innerType._parse(e);
  }
  unwrap() {
    return this._def.innerType;
  }
}
Qe.create = (t, e) => new Qe({
  innerType: t,
  typeName: K.ZodOptional,
  ...C(e)
});
class Nt extends W {
  _parse(e) {
    return this._getType(e) === P.null ? De(null) : this._def.innerType._parse(e);
  }
  unwrap() {
    return this._def.innerType;
  }
}
Nt.create = (t, e) => new Nt({
  innerType: t,
  typeName: K.ZodNullable,
  ...C(e)
});
class wn extends W {
  _parse(e) {
    const { ctx: n } = this._processInputParams(e);
    let r = n.data;
    return n.parsedType === P.undefined && (r = this._def.defaultValue()), this._def.innerType._parse({
      data: r,
      path: n.path,
      parent: n
    });
  }
  removeDefault() {
    return this._def.innerType;
  }
}
wn.create = (t, e) => new wn({
  innerType: t,
  typeName: K.ZodDefault,
  defaultValue: typeof e.default == "function" ? e.default : () => e.default,
  ...C(e)
});
class In extends W {
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
    return gn(i) ? i.then((s) => ({
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
In.create = (t, e) => new In({
  innerType: t,
  typeName: K.ZodCatch,
  catchValue: typeof e.catch == "function" ? e.catch : () => e.catch,
  ...C(e)
});
class cr extends W {
  _parse(e) {
    if (this._getType(e) !== P.nan) {
      const r = this._getOrReturnCtx(e);
      return x(r, {
        code: S.invalid_type,
        expected: P.nan,
        received: r.parsedType
      }), q;
    }
    return { status: "valid", value: e.data };
  }
}
cr.create = (t) => new cr({
  typeName: K.ZodNaN,
  ...C(t)
});
const Ca = Symbol("zod_brand");
class Yr extends W {
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
class Dn extends W {
  _parse(e) {
    const { status: n, ctx: r } = this._processInputParams(e);
    if (r.common.async)
      return (async () => {
        const s = await this._def.in._parseAsync({
          data: r.data,
          path: r.path,
          parent: r
        });
        return s.status === "aborted" ? q : s.status === "dirty" ? (n.dirty(), Yt(s.value)) : this._def.out._parseAsync({
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
      return i.status === "aborted" ? q : i.status === "dirty" ? (n.dirty(), {
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
    return new Dn({
      in: e,
      out: n,
      typeName: K.ZodPipeline
    });
  }
}
class Sn extends W {
  _parse(e) {
    const n = this._def.innerType._parse(e), r = (i) => (hn(i) && (i.value = Object.freeze(i.value)), i);
    return gn(n) ? n.then((i) => r(i)) : r(n);
  }
  unwrap() {
    return this._def.innerType;
  }
}
Sn.create = (t, e) => new Sn({
  innerType: t,
  typeName: K.ZodReadonly,
  ...C(e)
});
function $r(t, e = {}, n) {
  return t ? Ct.create().superRefine((r, i) => {
    var s, u;
    if (!t(r)) {
      const c = typeof e == "function" ? e(r) : typeof e == "string" ? { message: e } : e, g = (u = (s = c.fatal) !== null && s !== void 0 ? s : n) !== null && u !== void 0 ? u : !0, f = typeof c == "string" ? { message: c } : c;
      i.addIssue({ code: "custom", ...f, fatal: g });
    }
  }) : Ct.create();
}
const Xa = {
  object: de.lazycreate
};
var K;
(function(t) {
  t.ZodString = "ZodString", t.ZodNumber = "ZodNumber", t.ZodNaN = "ZodNaN", t.ZodBigInt = "ZodBigInt", t.ZodBoolean = "ZodBoolean", t.ZodDate = "ZodDate", t.ZodSymbol = "ZodSymbol", t.ZodUndefined = "ZodUndefined", t.ZodNull = "ZodNull", t.ZodAny = "ZodAny", t.ZodUnknown = "ZodUnknown", t.ZodNever = "ZodNever", t.ZodVoid = "ZodVoid", t.ZodArray = "ZodArray", t.ZodObject = "ZodObject", t.ZodUnion = "ZodUnion", t.ZodDiscriminatedUnion = "ZodDiscriminatedUnion", t.ZodIntersection = "ZodIntersection", t.ZodTuple = "ZodTuple", t.ZodRecord = "ZodRecord", t.ZodMap = "ZodMap", t.ZodSet = "ZodSet", t.ZodFunction = "ZodFunction", t.ZodLazy = "ZodLazy", t.ZodLiteral = "ZodLiteral", t.ZodEnum = "ZodEnum", t.ZodEffects = "ZodEffects", t.ZodNativeEnum = "ZodNativeEnum", t.ZodOptional = "ZodOptional", t.ZodNullable = "ZodNullable", t.ZodDefault = "ZodDefault", t.ZodCatch = "ZodCatch", t.ZodPromise = "ZodPromise", t.ZodBranded = "ZodBranded", t.ZodPipeline = "ZodPipeline", t.ZodReadonly = "ZodReadonly";
})(K || (K = {}));
const Wa = (t, e = {
  message: `Input not instance of ${t.name}`
}) => $r((n) => n instanceof t, e), m = Ye.create, G = Tt.create, Qa = cr.create, Mi = bt.create, Y = _n.create, Ja = Ut.create, eo = or.create, to = mn.create, pr = vn.create, no = Ct.create, On = Mt.create, ro = gt.create, io = lr.create, ee = $e.create, R = de.create, so = de.strictCreate, zr = En.create, ao = fr.create, oo = yn.create, lo = et.create, uo = Tn.create, co = ur.create, fo = Bt.create, po = $t.create, ho = bn.create, me = An.create, go = At.create, Qt = Nn.create, _o = Xt.create, gi = ze.create, Li = Qe.create, mo = Nt.create, Ui = ze.createWithPreprocess, vo = Dn.create, Eo = () => m().optional(), yo = () => G().optional(), To = () => Y().optional(), bo = {
  string: (t) => Ye.create({ ...t, coerce: !0 }),
  number: (t) => Tt.create({ ...t, coerce: !0 }),
  boolean: (t) => _n.create({
    ...t,
    coerce: !0
  }),
  bigint: (t) => bt.create({ ...t, coerce: !0 }),
  date: (t) => Ut.create({ ...t, coerce: !0 })
}, Ao = q;
var L = /* @__PURE__ */ Object.freeze({
  __proto__: null,
  defaultErrorMap: zt,
  setErrorMap: Pa,
  getErrorMap: ir,
  makeIssue: sr,
  EMPTY_PATH: ka,
  addIssueToContext: x,
  ParseStatus: Ne,
  INVALID: q,
  DIRTY: Yt,
  OK: De,
  isAborted: Gr,
  isDirty: Zr,
  isValid: hn,
  isAsync: gn,
  get util() {
    return te;
  },
  get objectUtil() {
    return Br;
  },
  ZodParsedType: P,
  getParsedType: Et,
  ZodType: W,
  datetimeRegex: Pi,
  ZodString: Ye,
  ZodNumber: Tt,
  ZodBigInt: bt,
  ZodBoolean: _n,
  ZodDate: Ut,
  ZodSymbol: or,
  ZodUndefined: mn,
  ZodNull: vn,
  ZodAny: Ct,
  ZodUnknown: Mt,
  ZodNever: gt,
  ZodVoid: lr,
  ZodArray: $e,
  ZodObject: de,
  ZodUnion: En,
  ZodDiscriminatedUnion: fr,
  ZodIntersection: yn,
  ZodTuple: et,
  ZodRecord: Tn,
  ZodMap: ur,
  ZodSet: Bt,
  ZodFunction: $t,
  ZodLazy: bn,
  ZodLiteral: An,
  ZodEnum: At,
  ZodNativeEnum: Nn,
  ZodPromise: Xt,
  ZodEffects: ze,
  ZodTransformer: ze,
  ZodOptional: Qe,
  ZodNullable: Nt,
  ZodDefault: wn,
  ZodCatch: In,
  ZodNaN: cr,
  BRAND: Ca,
  ZodBranded: Yr,
  ZodPipeline: Dn,
  ZodReadonly: Sn,
  custom: $r,
  Schema: W,
  ZodSchema: W,
  late: Xa,
  get ZodFirstPartyTypeKind() {
    return K;
  },
  coerce: bo,
  any: no,
  array: ee,
  bigint: Mi,
  boolean: Y,
  date: Ja,
  discriminatedUnion: ao,
  effect: gi,
  enum: go,
  function: po,
  instanceof: Wa,
  intersection: oo,
  lazy: ho,
  literal: me,
  map: co,
  nan: Qa,
  nativeEnum: Qt,
  never: ro,
  null: pr,
  nullable: mo,
  number: G,
  object: R,
  oboolean: To,
  onumber: yo,
  optional: Li,
  ostring: Eo,
  pipeline: vo,
  preprocess: Ui,
  promise: _o,
  record: uo,
  set: fo,
  strictObject: so,
  string: m,
  symbol: eo,
  transformer: gi,
  tuple: lo,
  undefined: to,
  union: zr,
  unknown: On,
  void: io,
  NEVER: Ao,
  ZodIssueCode: S,
  quotelessJson: xa,
  ZodError: Be
}), Mr = { exports: {} }, _i;
function No() {
  return _i || (_i = 1, function(t) {
    var e = function(n) {
      var r = 1e7, i = 7, s = 9007199254740992, u = X(s), c = "0123456789abcdefghijklmnopqrstuvwxyz", g = typeof BigInt == "function";
      function f(a, l, h, E) {
        return typeof a > "u" ? f[0] : typeof l < "u" ? +l == 10 && !h ? F(a) : Vn(a, l, h, E) : F(a);
      }
      function d(a, l) {
        this.value = a, this.sign = l, this.isSmall = !1;
      }
      d.prototype = Object.create(f.prototype);
      function _(a) {
        this.value = a, this.sign = a < 0, this.isSmall = !0;
      }
      _.prototype = Object.create(f.prototype);
      function A(a) {
        this.value = a;
      }
      A.prototype = Object.create(f.prototype);
      function k(a) {
        return -s < a && a < s;
      }
      function X(a) {
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
      function pe(a) {
        for (var l = new Array(a), h = -1; ++h < a; )
          l[h] = 0;
        return l;
      }
      function re(a) {
        return a > 0 ? Math.floor(a) : Math.ceil(a);
      }
      function se(a, l) {
        var h = a.length, E = l.length, T = new Array(h), y = 0, N = r, w, I;
        for (I = 0; I < E; I++)
          w = a[I] + l[I] + y, y = w >= N ? 1 : 0, T[I] = w - y * N;
        for (; I < h; )
          w = a[I] + y, y = w === N ? 1 : 0, T[I++] = w - y * N;
        return y > 0 && T.push(y), T;
      }
      function Ie(a, l) {
        return a.length >= l.length ? se(a, l) : se(l, a);
      }
      function ge(a, l) {
        var h = a.length, E = new Array(h), T = r, y, N;
        for (N = 0; N < h; N++)
          y = a[N] - T + l, l = Math.floor(y / T), E[N] = y - l * T, l += 1;
        for (; l > 0; )
          E[N++] = l % T, l = Math.floor(l / T);
        return E;
      }
      d.prototype.add = function(a) {
        var l = F(a);
        if (this.sign !== l.sign)
          return this.subtract(l.negate());
        var h = this.value, E = l.value;
        return l.isSmall ? new d(ge(h, Math.abs(E)), this.sign) : new d(Ie(h, E), this.sign);
      }, d.prototype.plus = d.prototype.add, _.prototype.add = function(a) {
        var l = F(a), h = this.value;
        if (h < 0 !== l.sign)
          return this.subtract(l.negate());
        var E = l.value;
        if (l.isSmall) {
          if (k(h + E))
            return new _(h + E);
          E = X(Math.abs(E));
        }
        return new d(ge(E, Math.abs(h)), h < 0);
      }, _.prototype.plus = _.prototype.add, A.prototype.add = function(a) {
        return new A(this.value + F(a).value);
      }, A.prototype.plus = A.prototype.add;
      function Ge(a, l) {
        var h = a.length, E = l.length, T = new Array(h), y = 0, N = r, w, I;
        for (w = 0; w < E; w++)
          I = a[w] - y - l[w], I < 0 ? (I += N, y = 1) : y = 0, T[w] = I;
        for (w = E; w < h; w++) {
          if (I = a[w] - y, I < 0)
            I += N;
          else {
            T[w++] = I;
            break;
          }
          T[w] = I;
        }
        for (; w < h; w++)
          T[w] = a[w];
        return D(T), T;
      }
      function Te(a, l, h) {
        var E;
        return rt(a, l) >= 0 ? E = Ge(a, l) : (E = Ge(l, a), h = !h), E = V(E), typeof E == "number" ? (h && (E = -E), new _(E)) : new d(E, h);
      }
      function Me(a, l, h) {
        var E = a.length, T = new Array(E), y = -l, N = r, w, I;
        for (w = 0; w < E; w++)
          I = a[w] + y, y = Math.floor(I / N), I %= N, T[w] = I < 0 ? I + N : I;
        return T = V(T), typeof T == "number" ? (h && (T = -T), new _(T)) : new d(T, h);
      }
      d.prototype.subtract = function(a) {
        var l = F(a);
        if (this.sign !== l.sign)
          return this.add(l.negate());
        var h = this.value, E = l.value;
        return l.isSmall ? Me(h, Math.abs(E), this.sign) : Te(h, E, this.sign);
      }, d.prototype.minus = d.prototype.subtract, _.prototype.subtract = function(a) {
        var l = F(a), h = this.value;
        if (h < 0 !== l.sign)
          return this.add(l.negate());
        var E = l.value;
        return l.isSmall ? new _(h - E) : Me(E, Math.abs(h), h >= 0);
      }, _.prototype.minus = _.prototype.subtract, A.prototype.subtract = function(a) {
        return new A(this.value - F(a).value);
      }, A.prototype.minus = A.prototype.subtract, d.prototype.negate = function() {
        return new d(this.value, !this.sign);
      }, _.prototype.negate = function() {
        var a = this.sign, l = new _(-this.value);
        return l.sign = !a, l;
      }, A.prototype.negate = function() {
        return new A(-this.value);
      }, d.prototype.abs = function() {
        return new d(this.value, !1);
      }, _.prototype.abs = function() {
        return new _(Math.abs(this.value));
      }, A.prototype.abs = function() {
        return new A(this.value >= 0 ? this.value : -this.value);
      };
      function je(a, l) {
        var h = a.length, E = l.length, T = h + E, y = pe(T), N = r, w, I, H, J, $;
        for (H = 0; H < h; ++H) {
          J = a[H];
          for (var ne = 0; ne < E; ++ne)
            $ = l[ne], w = J * $ + y[H + ne], I = Math.floor(w / N), y[H + ne] = w - I * N, y[H + ne + 1] += I;
        }
        return D(y), y;
      }
      function Ze(a, l) {
        var h = a.length, E = new Array(h), T = r, y = 0, N, w;
        for (w = 0; w < h; w++)
          N = a[w] * l + y, y = Math.floor(N / T), E[w] = N - y * T;
        for (; y > 0; )
          E[w++] = y % T, y = Math.floor(y / T);
        return E;
      }
      function Se(a, l) {
        for (var h = []; l-- > 0; )
          h.push(0);
        return h.concat(a);
      }
      function oe(a, l) {
        var h = Math.max(a.length, l.length);
        if (h <= 30)
          return je(a, l);
        h = Math.ceil(h / 2);
        var E = a.slice(h), T = a.slice(0, h), y = l.slice(h), N = l.slice(0, h), w = oe(T, N), I = oe(E, y), H = oe(Ie(T, E), Ie(N, y)), J = Ie(Ie(w, Se(Ge(Ge(H, w), I), h)), Se(I, 2 * h));
        return D(J), J;
      }
      function mr(a, l) {
        return -0.012 * a - 0.012 * l + 15e-6 * a * l > 0;
      }
      d.prototype.multiply = function(a) {
        var l = F(a), h = this.value, E = l.value, T = this.sign !== l.sign, y;
        if (l.isSmall) {
          if (E === 0)
            return f[0];
          if (E === 1)
            return this;
          if (E === -1)
            return this.negate();
          if (y = Math.abs(E), y < r)
            return new d(Ze(h, y), T);
          E = X(y);
        }
        return mr(h.length, E.length) ? new d(oe(h, E), T) : new d(je(h, E), T);
      }, d.prototype.times = d.prototype.multiply;
      function xn(a, l, h) {
        return a < r ? new d(Ze(l, a), h) : new d(je(l, X(a)), h);
      }
      _.prototype._multiplyBySmall = function(a) {
        return k(a.value * this.value) ? new _(a.value * this.value) : xn(Math.abs(a.value), X(Math.abs(this.value)), this.sign !== a.sign);
      }, d.prototype._multiplyBySmall = function(a) {
        return a.value === 0 ? f[0] : a.value === 1 ? this : a.value === -1 ? this.negate() : xn(Math.abs(a.value), this.value, this.sign !== a.sign);
      }, _.prototype.multiply = function(a) {
        return F(a)._multiplyBySmall(this);
      }, _.prototype.times = _.prototype.multiply, A.prototype.multiply = function(a) {
        return new A(this.value * F(a).value);
      }, A.prototype.times = A.prototype.multiply;
      function Pn(a) {
        var l = a.length, h = pe(l + l), E = r, T, y, N, w, I;
        for (N = 0; N < l; N++) {
          w = a[N], y = 0 - w * w;
          for (var H = N; H < l; H++)
            I = a[H], T = 2 * (w * I) + h[N + H] + y, y = Math.floor(T / E), h[N + H] = T - y * E;
          h[N + l] = y;
        }
        return D(h), h;
      }
      d.prototype.square = function() {
        return new d(Pn(this.value), !1);
      }, _.prototype.square = function() {
        var a = this.value * this.value;
        return k(a) ? new _(a) : new d(Pn(X(Math.abs(this.value))), !1);
      }, A.prototype.square = function(a) {
        return new A(this.value * this.value);
      };
      function vr(a, l) {
        var h = a.length, E = l.length, T = r, y = pe(l.length), N = l[E - 1], w = Math.ceil(T / (2 * N)), I = Ze(a, w), H = Ze(l, w), J, $, ne, Oe, be, an, on;
        for (I.length <= h && I.push(0), H.push(0), N = H[E - 1], $ = h - E; $ >= 0; $--) {
          for (J = T - 1, I[$ + E] !== N && (J = Math.floor((I[$ + E] * T + I[$ + E - 1]) / N)), ne = 0, Oe = 0, an = H.length, be = 0; be < an; be++)
            ne += J * H[be], on = Math.floor(ne / T), Oe += I[$ + be] - (ne - on * T), ne = on, Oe < 0 ? (I[$ + be] = Oe + T, Oe = -1) : (I[$ + be] = Oe, Oe = 0);
          for (; Oe !== 0; ) {
            for (J -= 1, ne = 0, be = 0; be < an; be++)
              ne += I[$ + be] - T + H[be], ne < 0 ? (I[$ + be] = ne + T, ne = 0) : (I[$ + be] = ne, ne = 1);
            Oe += ne;
          }
          y[$] = J;
        }
        return I = kn(I, w)[0], [V(y), V(I)];
      }
      function Er(a, l) {
        for (var h = a.length, E = l.length, T = [], y = [], N = r, w, I, H, J, $; h; ) {
          if (y.unshift(a[--h]), D(y), rt(y, l) < 0) {
            T.push(0);
            continue;
          }
          I = y.length, H = y[I - 1] * N + y[I - 2], J = l[E - 1] * N + l[E - 2], I > E && (H = (H + 1) * N), w = Math.ceil(H / J);
          do {
            if ($ = Ze(l, w), rt($, y) <= 0)
              break;
            w--;
          } while (w);
          T.push(w), y = Ge(y, $);
        }
        return T.reverse(), [V(T), V(y)];
      }
      function kn(a, l) {
        var h = a.length, E = pe(h), T = r, y, N, w, I;
        for (w = 0, y = h - 1; y >= 0; --y)
          I = w * T + a[y], N = re(I / l), w = I - N * l, E[y] = N | 0;
        return [E, w | 0];
      }
      function nt(a, l) {
        var h, E = F(l);
        if (g)
          return [new A(a.value / E.value), new A(a.value % E.value)];
        var T = a.value, y = E.value, N;
        if (y === 0)
          throw new Error("Cannot divide by zero");
        if (a.isSmall)
          return E.isSmall ? [new _(re(T / y)), new _(T % y)] : [f[0], a];
        if (E.isSmall) {
          if (y === 1)
            return [a, f[0]];
          if (y == -1)
            return [a.negate(), f[0]];
          var w = Math.abs(y);
          if (w < r) {
            h = kn(T, w), N = V(h[0]);
            var I = h[1];
            return a.sign && (I = -I), typeof N == "number" ? (a.sign !== E.sign && (N = -N), [new _(N), new _(I)]) : [new d(N, a.sign !== E.sign), new _(I)];
          }
          y = X(w);
        }
        var H = rt(T, y);
        if (H === -1)
          return [f[0], a];
        if (H === 0)
          return [f[a.sign === E.sign ? 1 : -1], f[0]];
        T.length + y.length <= 200 ? h = vr(T, y) : h = Er(T, y), N = h[0];
        var J = a.sign !== E.sign, $ = h[1], ne = a.sign;
        return typeof N == "number" ? (J && (N = -N), N = new _(N)) : N = new d(N, J), typeof $ == "number" ? (ne && ($ = -$), $ = new _($)) : $ = new d($, ne), [N, $];
      }
      d.prototype.divmod = function(a) {
        var l = nt(this, a);
        return {
          quotient: l[0],
          remainder: l[1]
        };
      }, A.prototype.divmod = _.prototype.divmod = d.prototype.divmod, d.prototype.divide = function(a) {
        return nt(this, a)[0];
      }, A.prototype.over = A.prototype.divide = function(a) {
        return new A(this.value / F(a).value);
      }, _.prototype.over = _.prototype.divide = d.prototype.over = d.prototype.divide, d.prototype.mod = function(a) {
        return nt(this, a)[1];
      }, A.prototype.mod = A.prototype.remainder = function(a) {
        return new A(this.value % F(a).value);
      }, _.prototype.remainder = _.prototype.mod = d.prototype.remainder = d.prototype.mod, d.prototype.pow = function(a) {
        var l = F(a), h = this.value, E = l.value, T, y, N;
        if (E === 0)
          return f[1];
        if (h === 0)
          return f[0];
        if (h === 1)
          return f[1];
        if (h === -1)
          return l.isEven() ? f[1] : f[-1];
        if (l.sign)
          return f[0];
        if (!l.isSmall)
          throw new Error("The exponent " + l.toString() + " is too large.");
        if (this.isSmall && k(T = Math.pow(h, E)))
          return new _(re(T));
        for (y = this, N = f[1]; E & !0 && (N = N.times(y), --E), E !== 0; )
          E /= 2, y = y.square();
        return N;
      }, _.prototype.pow = d.prototype.pow, A.prototype.pow = function(a) {
        var l = F(a), h = this.value, E = l.value, T = BigInt(0), y = BigInt(1), N = BigInt(2);
        if (E === T)
          return f[1];
        if (h === T)
          return f[0];
        if (h === y)
          return f[1];
        if (h === BigInt(-1))
          return l.isEven() ? f[1] : f[-1];
        if (l.isNegative())
          return new A(T);
        for (var w = this, I = f[1]; (E & y) === y && (I = I.times(w), --E), E !== T; )
          E /= N, w = w.square();
        return I;
      }, d.prototype.modPow = function(a, l) {
        if (a = F(a), l = F(l), l.isZero())
          throw new Error("Cannot take modPow with modulus 0");
        var h = f[1], E = this.mod(l);
        for (a.isNegative() && (a = a.multiply(f[-1]), E = E.modInv(l)); a.isPositive(); ) {
          if (E.isZero())
            return f[0];
          a.isOdd() && (h = h.multiply(E).mod(l)), a = a.divide(2), E = E.square().mod(l);
        }
        return h;
      }, A.prototype.modPow = _.prototype.modPow = d.prototype.modPow;
      function rt(a, l) {
        if (a.length !== l.length)
          return a.length > l.length ? 1 : -1;
        for (var h = a.length - 1; h >= 0; h--)
          if (a[h] !== l[h])
            return a[h] > l[h] ? 1 : -1;
        return 0;
      }
      d.prototype.compareAbs = function(a) {
        var l = F(a), h = this.value, E = l.value;
        return l.isSmall ? 1 : rt(h, E);
      }, _.prototype.compareAbs = function(a) {
        var l = F(a), h = Math.abs(this.value), E = l.value;
        return l.isSmall ? (E = Math.abs(E), h === E ? 0 : h > E ? 1 : -1) : -1;
      }, A.prototype.compareAbs = function(a) {
        var l = this.value, h = F(a).value;
        return l = l >= 0 ? l : -l, h = h >= 0 ? h : -h, l === h ? 0 : l > h ? 1 : -1;
      }, d.prototype.compare = function(a) {
        if (a === 1 / 0)
          return -1;
        if (a === -1 / 0)
          return 1;
        var l = F(a), h = this.value, E = l.value;
        return this.sign !== l.sign ? l.sign ? 1 : -1 : l.isSmall ? this.sign ? -1 : 1 : rt(h, E) * (this.sign ? -1 : 1);
      }, d.prototype.compareTo = d.prototype.compare, _.prototype.compare = function(a) {
        if (a === 1 / 0)
          return -1;
        if (a === -1 / 0)
          return 1;
        var l = F(a), h = this.value, E = l.value;
        return l.isSmall ? h == E ? 0 : h > E ? 1 : -1 : h < 0 !== l.sign ? h < 0 ? -1 : 1 : h < 0 ? 1 : -1;
      }, _.prototype.compareTo = _.prototype.compare, A.prototype.compare = function(a) {
        if (a === 1 / 0)
          return -1;
        if (a === -1 / 0)
          return 1;
        var l = this.value, h = F(a).value;
        return l === h ? 0 : l > h ? 1 : -1;
      }, A.prototype.compareTo = A.prototype.compare, d.prototype.equals = function(a) {
        return this.compare(a) === 0;
      }, A.prototype.eq = A.prototype.equals = _.prototype.eq = _.prototype.equals = d.prototype.eq = d.prototype.equals, d.prototype.notEquals = function(a) {
        return this.compare(a) !== 0;
      }, A.prototype.neq = A.prototype.notEquals = _.prototype.neq = _.prototype.notEquals = d.prototype.neq = d.prototype.notEquals, d.prototype.greater = function(a) {
        return this.compare(a) > 0;
      }, A.prototype.gt = A.prototype.greater = _.prototype.gt = _.prototype.greater = d.prototype.gt = d.prototype.greater, d.prototype.lesser = function(a) {
        return this.compare(a) < 0;
      }, A.prototype.lt = A.prototype.lesser = _.prototype.lt = _.prototype.lesser = d.prototype.lt = d.prototype.lesser, d.prototype.greaterOrEquals = function(a) {
        return this.compare(a) >= 0;
      }, A.prototype.geq = A.prototype.greaterOrEquals = _.prototype.geq = _.prototype.greaterOrEquals = d.prototype.geq = d.prototype.greaterOrEquals, d.prototype.lesserOrEquals = function(a) {
        return this.compare(a) <= 0;
      }, A.prototype.leq = A.prototype.lesserOrEquals = _.prototype.leq = _.prototype.lesserOrEquals = d.prototype.leq = d.prototype.lesserOrEquals, d.prototype.isEven = function() {
        return (this.value[0] & 1) === 0;
      }, _.prototype.isEven = function() {
        return (this.value & 1) === 0;
      }, A.prototype.isEven = function() {
        return (this.value & BigInt(1)) === BigInt(0);
      }, d.prototype.isOdd = function() {
        return (this.value[0] & 1) === 1;
      }, _.prototype.isOdd = function() {
        return (this.value & 1) === 1;
      }, A.prototype.isOdd = function() {
        return (this.value & BigInt(1)) === BigInt(1);
      }, d.prototype.isPositive = function() {
        return !this.sign;
      }, _.prototype.isPositive = function() {
        return this.value > 0;
      }, A.prototype.isPositive = _.prototype.isPositive, d.prototype.isNegative = function() {
        return this.sign;
      }, _.prototype.isNegative = function() {
        return this.value < 0;
      }, A.prototype.isNegative = _.prototype.isNegative, d.prototype.isUnit = function() {
        return !1;
      }, _.prototype.isUnit = function() {
        return Math.abs(this.value) === 1;
      }, A.prototype.isUnit = function() {
        return this.abs().value === BigInt(1);
      }, d.prototype.isZero = function() {
        return !1;
      }, _.prototype.isZero = function() {
        return this.value === 0;
      }, A.prototype.isZero = function() {
        return this.value === BigInt(0);
      }, d.prototype.isDivisibleBy = function(a) {
        var l = F(a);
        return l.isZero() ? !1 : l.isUnit() ? !0 : l.compareAbs(2) === 0 ? this.isEven() : this.mod(l).isZero();
      }, A.prototype.isDivisibleBy = _.prototype.isDivisibleBy = d.prototype.isDivisibleBy;
      function Mn(a) {
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
      function nn(a, l) {
        for (var h = a.prev(), E = h, T = 0, y, N, w; E.isEven(); )
          E = E.divide(2), T++;
        e:
          for (N = 0; N < l.length; N++)
            if (!a.lesser(l[N]) && (w = e(l[N]).modPow(E, a), !(w.isUnit() || w.equals(h)))) {
              for (y = T - 1; y != 0; y--) {
                if (w = w.square().mod(a), w.isUnit())
                  return !1;
                if (w.equals(h))
                  continue e;
              }
              return !1;
            }
        return !0;
      }
      d.prototype.isPrime = function(a) {
        var l = Mn(this);
        if (l !== n)
          return l;
        var h = this.abs(), E = h.bitLength();
        if (E <= 64)
          return nn(h, [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37]);
        for (var T = Math.log(2) * E.toJSNumber(), y = Math.ceil(a === !0 ? 2 * Math.pow(T, 2) : T), N = [], w = 0; w < y; w++)
          N.push(e(w + 2));
        return nn(h, N);
      }, A.prototype.isPrime = _.prototype.isPrime = d.prototype.isPrime, d.prototype.isProbablePrime = function(a, l) {
        var h = Mn(this);
        if (h !== n)
          return h;
        for (var E = this.abs(), T = a === n ? 5 : a, y = [], N = 0; N < T; N++)
          y.push(e.randBetween(2, E.minus(2), l));
        return nn(E, y);
      }, A.prototype.isProbablePrime = _.prototype.isProbablePrime = d.prototype.isProbablePrime, d.prototype.modInv = function(a) {
        for (var l = e.zero, h = e.one, E = F(a), T = this.abs(), y, N, w; !T.isZero(); )
          y = E.divide(T), N = l, w = E, l = h, E = T, h = N.subtract(y.multiply(h)), T = w.subtract(y.multiply(T));
        if (!E.isUnit())
          throw new Error(this.toString() + " and " + a.toString() + " are not co-prime");
        return l.compare(0) === -1 && (l = l.add(a)), this.isNegative() ? l.negate() : l;
      }, A.prototype.modInv = _.prototype.modInv = d.prototype.modInv, d.prototype.next = function() {
        var a = this.value;
        return this.sign ? Me(a, 1, this.sign) : new d(ge(a, 1), this.sign);
      }, _.prototype.next = function() {
        var a = this.value;
        return a + 1 < s ? new _(a + 1) : new d(u, !1);
      }, A.prototype.next = function() {
        return new A(this.value + BigInt(1));
      }, d.prototype.prev = function() {
        var a = this.value;
        return this.sign ? new d(ge(a, 1), !0) : Me(a, 1, this.sign);
      }, _.prototype.prev = function() {
        var a = this.value;
        return a - 1 > -s ? new _(a - 1) : new d(u, !0);
      }, A.prototype.prev = function() {
        return new A(this.value - BigInt(1));
      };
      for (var Ke = [1]; 2 * Ke[Ke.length - 1] <= r; )
        Ke.push(2 * Ke[Ke.length - 1]);
      var St = Ke.length, it = Ke[St - 1];
      function Ln(a) {
        return Math.abs(a) <= r;
      }
      d.prototype.shiftLeft = function(a) {
        var l = F(a).toJSNumber();
        if (!Ln(l))
          throw new Error(String(l) + " is too large for shifting.");
        if (l < 0)
          return this.shiftRight(-l);
        var h = this;
        if (h.isZero())
          return h;
        for (; l >= St; )
          h = h.multiply(it), l -= St - 1;
        return h.multiply(Ke[l]);
      }, A.prototype.shiftLeft = _.prototype.shiftLeft = d.prototype.shiftLeft, d.prototype.shiftRight = function(a) {
        var l, h = F(a).toJSNumber();
        if (!Ln(h))
          throw new Error(String(h) + " is too large for shifting.");
        if (h < 0)
          return this.shiftLeft(-h);
        for (var E = this; h >= St; ) {
          if (E.isZero() || E.isNegative() && E.isUnit())
            return E;
          l = nt(E, it), E = l[1].isNegative() ? l[0].prev() : l[0], h -= St - 1;
        }
        return l = nt(E, Ke[h]), l[1].isNegative() ? l[0].prev() : l[0];
      }, A.prototype.shiftRight = _.prototype.shiftRight = d.prototype.shiftRight;
      function rn(a, l, h) {
        l = F(l);
        for (var E = a.isNegative(), T = l.isNegative(), y = E ? a.not() : a, N = T ? l.not() : l, w = 0, I = 0, H = null, J = null, $ = []; !y.isZero() || !N.isZero(); )
          H = nt(y, it), w = H[1].toJSNumber(), E && (w = it - 1 - w), J = nt(N, it), I = J[1].toJSNumber(), T && (I = it - 1 - I), y = H[0], N = J[0], $.push(h(w, I));
        for (var ne = h(E ? 1 : 0, T ? 1 : 0) !== 0 ? e(-1) : e(0), Oe = $.length - 1; Oe >= 0; Oe -= 1)
          ne = ne.multiply(it).add(e($[Oe]));
        return ne;
      }
      d.prototype.not = function() {
        return this.negate().prev();
      }, A.prototype.not = _.prototype.not = d.prototype.not, d.prototype.and = function(a) {
        return rn(this, a, function(l, h) {
          return l & h;
        });
      }, A.prototype.and = _.prototype.and = d.prototype.and, d.prototype.or = function(a) {
        return rn(this, a, function(l, h) {
          return l | h;
        });
      }, A.prototype.or = _.prototype.or = d.prototype.or, d.prototype.xor = function(a) {
        return rn(this, a, function(l, h) {
          return l ^ h;
        });
      }, A.prototype.xor = _.prototype.xor = d.prototype.xor;
      var ae = 1 << 30, Un = (r & -r) * (r & -r) | ae;
      function Zt(a) {
        var l = a.value, h = typeof l == "number" ? l | ae : typeof l == "bigint" ? l | BigInt(ae) : l[0] + l[1] * r | Un;
        return h & -h;
      }
      function qe(a, l) {
        if (l.compareTo(a) <= 0) {
          var h = qe(a, l.square(l)), E = h.p, T = h.e, y = E.multiply(l);
          return y.compareTo(a) <= 0 ? { p: y, e: T * 2 + 1 } : { p: E, e: T * 2 };
        }
        return { p: e(1), e: 0 };
      }
      d.prototype.bitLength = function() {
        var a = this;
        return a.compareTo(e(0)) < 0 && (a = a.negate().subtract(e(1))), a.compareTo(e(0)) === 0 ? e(0) : e(qe(a, e(2)).e).add(e(1));
      }, A.prototype.bitLength = _.prototype.bitLength = d.prototype.bitLength;
      function sn(a, l) {
        return a = F(a), l = F(l), a.greater(l) ? a : l;
      }
      function Vt(a, l) {
        return a = F(a), l = F(l), a.lesser(l) ? a : l;
      }
      function Bn(a, l) {
        if (a = F(a).abs(), l = F(l).abs(), a.equals(l))
          return a;
        if (a.isZero())
          return l;
        if (l.isZero())
          return a;
        for (var h = f[1], E, T; a.isEven() && l.isEven(); )
          E = Vt(Zt(a), Zt(l)), a = a.divide(E), l = l.divide(E), h = h.multiply(E);
        for (; a.isEven(); )
          a = a.divide(Zt(a));
        do {
          for (; l.isEven(); )
            l = l.divide(Zt(l));
          a.greater(l) && (T = l, l = a, a = T), l = l.subtract(a);
        } while (!l.isZero());
        return h.isUnit() ? a : a.multiply(h);
      }
      function Gn(a, l) {
        return a = F(a).abs(), l = F(l).abs(), a.divide(Bn(a, l)).multiply(l);
      }
      function Zn(a, l, h) {
        a = F(a), l = F(l);
        var E = h || Math.random, T = Vt(a, l), y = sn(a, l), N = y.subtract(T).add(1);
        if (N.isSmall)
          return T.add(Math.floor(E() * N));
        for (var w = Ot(N, r).value, I = [], H = !0, J = 0; J < w.length; J++) {
          var $ = H ? w[J] + (J + 1 < w.length ? w[J + 1] / r : 0) : r, ne = re(E() * $);
          I.push(ne), ne < w[J] && (H = !1);
        }
        return T.add(f.fromArray(I, r, !1));
      }
      var Vn = function(a, l, h, E) {
        h = h || c, a = String(a), E || (a = a.toLowerCase(), h = h.toLowerCase());
        var T = a.length, y, N = Math.abs(l), w = {};
        for (y = 0; y < h.length; y++)
          w[h[y]] = y;
        for (y = 0; y < T; y++) {
          var I = a[y];
          if (I !== "-" && I in w && w[I] >= N) {
            if (I === "1" && N === 1)
              continue;
            throw new Error(I + " is not a valid digit in base " + l + ".");
          }
        }
        l = F(l);
        var H = [], J = a[0] === "-";
        for (y = J ? 1 : 0; y < a.length; y++) {
          var I = a[y];
          if (I in w)
            H.push(F(w[I]));
          else if (I === "<") {
            var $ = y;
            do
              y++;
            while (a[y] !== ">" && y < a.length);
            H.push(F(a.slice($ + 1, y)));
          } else
            throw new Error(I + " is not a valid character");
        }
        return Hn(H, l, J);
      };
      function Hn(a, l, h) {
        var E = f[0], T = f[1], y;
        for (y = a.length - 1; y >= 0; y--)
          E = E.add(a[y].times(T)), T = T.times(l);
        return h ? E.negate() : E;
      }
      function yr(a, l) {
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
          var h = Array.apply(null, Array(a.toJSNumber() - 1)).map(Array.prototype.valueOf, [0, 1]);
          return h.unshift([1]), {
            value: [].concat.apply([], h),
            isNegative: !1
          };
        }
        var E = !1;
        if (a.isNegative() && l.isPositive() && (E = !0, a = a.abs()), l.isUnit())
          return a.isZero() ? { value: [0], isNegative: !1 } : {
            value: Array.apply(null, Array(a.toJSNumber())).map(Number.prototype.valueOf, 1),
            isNegative: E
          };
        for (var T = [], y = a, N; y.isNegative() || y.compareAbs(l) >= 0; ) {
          N = y.divmod(l), y = N.quotient;
          var w = N.remainder;
          w.isNegative() && (w = l.minus(w).abs(), y = y.next()), T.push(w.toJSNumber());
        }
        return T.push(y.toJSNumber()), { value: T.reverse(), isNegative: E };
      }
      function Fn(a, l, h) {
        var E = Ot(a, l);
        return (E.isNegative ? "-" : "") + E.value.map(function(T) {
          return yr(T, h);
        }).join("");
      }
      d.prototype.toArray = function(a) {
        return Ot(this, a);
      }, _.prototype.toArray = function(a) {
        return Ot(this, a);
      }, A.prototype.toArray = function(a) {
        return Ot(this, a);
      }, d.prototype.toString = function(a, l) {
        if (a === n && (a = 10), a !== 10 || l)
          return Fn(this, a, l);
        for (var h = this.value, E = h.length, T = String(h[--E]), y = "0000000", N; --E >= 0; )
          N = String(h[E]), T += y.slice(N.length) + N;
        var w = this.sign ? "-" : "";
        return w + T;
      }, _.prototype.toString = function(a, l) {
        return a === n && (a = 10), a != 10 || l ? Fn(this, a, l) : String(this.value);
      }, A.prototype.toString = _.prototype.toString, A.prototype.toJSON = d.prototype.toJSON = _.prototype.toJSON = function() {
        return this.toString();
      }, d.prototype.valueOf = function() {
        return parseInt(this.toString(), 10);
      }, d.prototype.toJSNumber = d.prototype.valueOf, _.prototype.valueOf = function() {
        return this.value;
      }, _.prototype.toJSNumber = _.prototype.valueOf, A.prototype.valueOf = A.prototype.toJSNumber = function() {
        return parseInt(this.toString(), 10);
      };
      function jn(a) {
        if (k(+a)) {
          var l = +a;
          if (l === re(l))
            return g ? new A(BigInt(l)) : new _(l);
          throw new Error("Invalid integer: " + a);
        }
        var h = a[0] === "-";
        h && (a = a.slice(1));
        var E = a.split(/e/i);
        if (E.length > 2)
          throw new Error("Invalid integer: " + E.join("e"));
        if (E.length === 2) {
          var T = E[1];
          if (T[0] === "+" && (T = T.slice(1)), T = +T, T !== re(T) || !k(T))
            throw new Error("Invalid integer: " + T + " is not a valid exponent.");
          var y = E[0], N = y.indexOf(".");
          if (N >= 0 && (T -= y.length - N - 1, y = y.slice(0, N) + y.slice(N + 1)), T < 0)
            throw new Error("Cannot include negative exponent part for integers");
          y += new Array(T + 1).join("0"), a = y;
        }
        var w = /^([0-9][0-9]*)$/.test(a);
        if (!w)
          throw new Error("Invalid integer: " + a);
        if (g)
          return new A(BigInt(h ? "-" + a : a));
        for (var I = [], H = a.length, J = i, $ = H - J; H > 0; )
          I.push(+a.slice($, H)), $ -= J, $ < 0 && ($ = 0), H -= J;
        return D(I), new d(I, h);
      }
      function Tr(a) {
        if (g)
          return new A(BigInt(a));
        if (k(a)) {
          if (a !== re(a))
            throw new Error(a + " is not an integer.");
          return new _(a);
        }
        return jn(a.toString());
      }
      function F(a) {
        return typeof a == "number" ? Tr(a) : typeof a == "string" ? jn(a) : typeof a == "bigint" ? new A(a) : a;
      }
      for (var st = 0; st < 1e3; st++)
        f[st] = F(st), st > 0 && (f[-st] = F(-st));
      return f.one = f[1], f.zero = f[0], f.minusOne = f[-1], f.max = sn, f.min = Vt, f.gcd = Bn, f.lcm = Gn, f.isInstance = function(a) {
        return a instanceof d || a instanceof _ || a instanceof A;
      }, f.randBetween = Zn, f.fromArray = function(a, l, h) {
        return Hn(a.map(F), F(l || 10), h);
      }, f;
    }();
    t.hasOwnProperty("exports") && (t.exports = e);
  }(Mr)), Mr.exports;
}
var wo = No(), Io = /* @__PURE__ */ Si(wo);
const Bi = 64, Hr = 16, yt = Bi / Hr;
function So() {
  try {
    return !0;
  } catch {
    return !1;
  }
}
function Oo(t, e, n) {
  let r = 0;
  for (let i = 0; i < n; i++) {
    const s = t[e + i];
    if (s === void 0)
      break;
    r += s * 16 ** i;
  }
  return r;
}
function Gi(t) {
  const e = [];
  for (let n = 0; n < t.length; n++) {
    let r = Number(t[n]);
    for (let i = 0; r || i < e.length; i++)
      r += (e[i] || 0) * 10, e[i] = r % 16, r = (r - e[i]) / 16;
  }
  return e;
}
function Ro(t) {
  const e = Gi(t), n = Array(yt);
  for (let r = 0; r < yt; r++)
    n[yt - 1 - r] = Oo(e, r * yt, yt);
  return n;
}
class Ce {
  static fromString(e) {
    return new Ce(Ro(e), e);
  }
  static fromBit(e) {
    const n = Array(yt), r = Math.floor(e / Hr);
    for (let i = 0; i < yt; i++)
      n[yt - 1 - i] = i === r ? 1 << e - r * Hr : 0;
    return new Ce(n);
  }
  constructor(e, n) {
    this.parts = e, this.str = n;
  }
  and({ parts: e }) {
    return new Ce(this.parts.map((n, r) => n & e[r]));
  }
  or({ parts: e }) {
    return new Ce(this.parts.map((n, r) => n | e[r]));
  }
  xor({ parts: e }) {
    return new Ce(this.parts.map((n, r) => n ^ e[r]));
  }
  not() {
    return new Ce(this.parts.map((e) => ~e));
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
    const e = new Array(Bi / 4);
    return this.parts.forEach((n, r) => {
      const i = Gi(n.toString());
      for (let s = 0; s < 4; s++)
        e[s + r * 4] = i[3 - s] || 0;
    }), this.str = Io.fromArray(e, 16).toString();
  }
  toJSON() {
    return this.toString();
  }
}
const It = So();
It && BigInt.prototype.toJSON == null && (BigInt.prototype.toJSON = function() {
  return this.toString();
});
const tr = {}, Zi = It ? function(e) {
  return BigInt(e);
} : function(e) {
  return e instanceof Ce ? e : (typeof e == "number" && (e = e.toString()), tr[e] != null || (tr[e] = Ce.fromString(e)), tr[e]);
}, ye = Zi(0), hr = It ? function(e = ye, n = ye) {
  return e & n;
} : function(e = ye, n = ye) {
  return e.and(n);
}, Vi = It ? function(e = ye, n = ye) {
  return e | n;
} : function(e = ye, n = ye) {
  return e.or(n);
}, Do = It ? function(e = ye, n = ye) {
  return e ^ n;
} : function(e = ye, n = ye) {
  return e.xor(n);
}, xo = It ? function(e = ye) {
  return ~e;
} : function(e = ye) {
  return e.not();
}, Cr = It ? function(e, n) {
  return e === n;
} : function(e, n) {
  return e == null || n == null ? e == n : e.equals(n);
};
function Po(...t) {
  let e = t[0];
  for (let n = 1; n < t.length; n++)
    e = Vi(e, t[n]);
  return e;
}
function ko(t, e) {
  return Cr(hr(t, e), e);
}
function Mo(t, e) {
  return !Cr(hr(t, e), ye);
}
function Lo(t, e) {
  return e === ye ? t : Vi(t, e);
}
function Uo(t, e) {
  return e === ye ? t : Do(t, hr(t, e));
}
const Bo = It ? function(e) {
  return BigInt(1) << BigInt(e);
} : function(e) {
  return Ce.fromBit(e);
};
var j = {
  combine: Po,
  add: Lo,
  remove: Uo,
  filter: hr,
  invert: xo,
  has: ko,
  hasAny: Mo,
  equals: Cr,
  deserialize: Zi,
  getFlag: Bo
}, mi;
(function(t) {
  t[t.CLOSE_NORMAL = 1e3] = "CLOSE_NORMAL", t[t.CLOSE_UNSUPPORTED = 1003] = "CLOSE_UNSUPPORTED", t[t.CLOSE_ABNORMAL = 1006] = "CLOSE_ABNORMAL", t[t.INVALID_CLIENTID = 4e3] = "INVALID_CLIENTID", t[t.INVALID_ORIGIN = 4001] = "INVALID_ORIGIN", t[t.RATELIMITED = 4002] = "RATELIMITED", t[t.TOKEN_REVOKED = 4003] = "TOKEN_REVOKED", t[t.INVALID_VERSION = 4004] = "INVALID_VERSION", t[t.INVALID_ENCODING = 4005] = "INVALID_ENCODING";
})(mi || (mi = {}));
var Fr;
(function(t) {
  t[t.INVALID_PAYLOAD = 4e3] = "INVALID_PAYLOAD", t[t.INVALID_COMMAND = 4002] = "INVALID_COMMAND", t[t.INVALID_EVENT = 4004] = "INVALID_EVENT", t[t.INVALID_PERMISSIONS = 4006] = "INVALID_PERMISSIONS";
})(Fr || (Fr = {}));
var jr;
(function(t) {
  t.LANDSCAPE = "landscape", t.PORTRAIT = "portrait";
})(jr || (jr = {}));
var pt;
(function(t) {
  t.MOBILE = "mobile", t.DESKTOP = "desktop";
})(pt || (pt = {}));
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
const vi = -1, Go = 250;
function we(t) {
  return Ui((e) => {
    var n;
    const [r] = (n = Object.entries(t).find(([, i]) => i === e)) !== null && n !== void 0 ? n : [];
    return e != null && r === void 0 ? t.UNHANDLED : e;
  }, m().or(G()));
}
function Hi(t) {
  const e = $r().transform((n) => {
    const r = t.safeParse(n);
    return r.success ? r.data : t._def.defaultValue();
  });
  return e.overlayType = t, e;
}
const Zo = L.object({ image_url: L.string() }), Vo = L.object({ mediaUrl: L.string().max(1024) }), Ho = L.object({ access_token: L.union([L.string(), L.null()]).optional() }), Fi = L.object({
  access_token: L.string(),
  user: L.object({
    username: L.string(),
    discriminator: L.string(),
    id: L.string(),
    avatar: L.union([L.string(), L.null()]).optional(),
    public_flags: L.number(),
    global_name: L.union([L.string(), L.null()]).optional()
  }),
  scopes: L.array(Hi(L.enum([
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
}), ji = L.object({
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
var Xe;
(function(t) {
  t.INITIATE_IMAGE_UPLOAD = "INITIATE_IMAGE_UPLOAD", t.OPEN_SHARE_MOMENT_DIALOG = "OPEN_SHARE_MOMENT_DIALOG", t.AUTHENTICATE = "AUTHENTICATE", t.GET_ACTIVITY_INSTANCE_CONNECTED_PARTICIPANTS = "GET_ACTIVITY_INSTANCE_CONNECTED_PARTICIPANTS";
})(Xe || (Xe = {}));
const Fo = L.object({}).optional().nullable(), Ei = L.void(), Ki = {
  [Xe.INITIATE_IMAGE_UPLOAD]: {
    request: Ei,
    response: Zo
  },
  [Xe.OPEN_SHARE_MOMENT_DIALOG]: {
    request: Vo,
    response: Fo
  },
  [Xe.AUTHENTICATE]: {
    request: Ho,
    response: Fi
  },
  [Xe.GET_ACTIVITY_INSTANCE_CONNECTED_PARTICIPANTS]: {
    request: Ei,
    response: ji
  }
}, jo = "DISPATCH";
var Z;
(function(t) {
  t.AUTHORIZE = "AUTHORIZE", t.AUTHENTICATE = "AUTHENTICATE", t.GET_GUILDS = "GET_GUILDS", t.GET_GUILD = "GET_GUILD", t.GET_CHANNEL = "GET_CHANNEL", t.GET_CHANNELS = "GET_CHANNELS", t.SELECT_VOICE_CHANNEL = "SELECT_VOICE_CHANNEL", t.SELECT_TEXT_CHANNEL = "SELECT_TEXT_CHANNEL", t.SUBSCRIBE = "SUBSCRIBE", t.UNSUBSCRIBE = "UNSUBSCRIBE", t.CAPTURE_SHORTCUT = "CAPTURE_SHORTCUT", t.SET_CERTIFIED_DEVICES = "SET_CERTIFIED_DEVICES", t.SET_ACTIVITY = "SET_ACTIVITY", t.GET_SKUS = "GET_SKUS", t.GET_ENTITLEMENTS = "GET_ENTITLEMENTS", t.GET_SKUS_EMBEDDED = "GET_SKUS_EMBEDDED", t.GET_ENTITLEMENTS_EMBEDDED = "GET_ENTITLEMENTS_EMBEDDED", t.START_PURCHASE = "START_PURCHASE", t.SET_CONFIG = "SET_CONFIG", t.SEND_ANALYTICS_EVENT = "SEND_ANALYTICS_EVENT", t.USER_SETTINGS_GET_LOCALE = "USER_SETTINGS_GET_LOCALE", t.OPEN_EXTERNAL_LINK = "OPEN_EXTERNAL_LINK", t.ENCOURAGE_HW_ACCELERATION = "ENCOURAGE_HW_ACCELERATION", t.CAPTURE_LOG = "CAPTURE_LOG", t.SET_ORIENTATION_LOCK_STATE = "SET_ORIENTATION_LOCK_STATE", t.OPEN_INVITE_DIALOG = "OPEN_INVITE_DIALOG", t.GET_PLATFORM_BEHAVIORS = "GET_PLATFORM_BEHAVIORS", t.GET_CHANNEL_PERMISSIONS = "GET_CHANNEL_PERMISSIONS", t.OPEN_SHARE_MOMENT_DIALOG = "OPEN_SHARE_MOMENT_DIALOG", t.INITIATE_IMAGE_UPLOAD = "INITIATE_IMAGE_UPLOAD", t.GET_ACTIVITY_INSTANCE_CONNECTED_PARTICIPANTS = "GET_ACTIVITY_INSTANCE_CONNECTED_PARTICIPANTS";
})(Z || (Z = {}));
const Jt = R({
  cmd: m(),
  data: On(),
  evt: pr(),
  nonce: m()
}).passthrough(), Ko = Object.assign(Object.assign({}, Fi.shape.scopes.element.overlayType._def.innerType.options[0].Values), { UNHANDLED: -1 });
we(Ko);
const wt = R({
  id: m(),
  username: m(),
  discriminator: m(),
  global_name: m().optional().nullable(),
  avatar: m().optional().nullable(),
  avatar_decoration_data: R({
    asset: m(),
    sku_id: m().optional()
  }).nullable(),
  bot: Y(),
  flags: G().optional().nullable(),
  premium_type: G().optional().nullable()
}), Xr = R({
  user: wt,
  nick: m().optional().nullable(),
  roles: ee(m()),
  joined_at: m(),
  deaf: Y(),
  mute: Y()
}), qo = R({
  user_id: m(),
  nick: m().optional().nullable(),
  guild_id: m(),
  avatar: m().optional().nullable(),
  avatar_decoration_data: R({
    asset: m(),
    sku_id: m().optional().nullable()
  }).optional().nullable(),
  color_string: m().optional().nullable()
}), Wr = R({
  id: m(),
  name: m().optional().nullable(),
  roles: ee(m()).optional().nullable(),
  user: wt.optional().nullable(),
  require_colons: Y().optional().nullable(),
  managed: Y().optional().nullable(),
  animated: Y().optional().nullable(),
  available: Y().optional().nullable()
}), qi = R({
  mute: Y(),
  deaf: Y(),
  self_mute: Y(),
  self_deaf: Y(),
  suppress: Y()
}), Yi = R({
  mute: Y(),
  nick: m(),
  user: wt,
  voice_state: qi,
  volume: G()
}), Yo = {
  UNHANDLED: -1,
  IDLE: "idle",
  DND: "dnd",
  ONLINE: "online",
  OFFLINE: "offline"
}, nr = we(Yo), pn = R({
  name: m(),
  type: G(),
  url: m().optional().nullable(),
  created_at: G().optional().nullable(),
  timestamps: R({
    start: G(),
    end: G()
  }).partial().optional().nullable(),
  application_id: m().optional().nullable(),
  details: m().optional().nullable(),
  state: m().optional().nullable(),
  emoji: Wr.optional().nullable(),
  party: R({
    id: m().optional().nullable(),
    size: ee(G()).optional().nullable()
  }).optional().nullable(),
  assets: R({
    large_image: m().nullable(),
    large_text: m().nullable(),
    small_image: m().nullable(),
    small_text: m().nullable()
  }).partial().optional().nullable(),
  secrets: R({
    join: m(),
    match: m()
  }).partial().optional().nullable(),
  instance: Y().optional().nullable(),
  flags: G().optional().nullable()
}), $o = {
  UNHANDLED: -1,
  ROLE: 0,
  MEMBER: 1
}, zo = R({
  id: m(),
  type: we($o),
  allow: m(),
  deny: m()
}), $i = {
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
}, zi = R({
  id: m(),
  type: we($i),
  guild_id: m().optional().nullable(),
  position: G().optional().nullable(),
  permission_overwrites: ee(zo).optional().nullable(),
  name: m().optional().nullable(),
  topic: m().optional().nullable(),
  nsfw: Y().optional().nullable(),
  last_message_id: m().optional().nullable(),
  bitrate: G().optional().nullable(),
  user_limit: G().optional().nullable(),
  rate_limit_per_user: G().optional().nullable(),
  recipients: ee(wt).optional().nullable(),
  icon: m().optional().nullable(),
  owner_id: m().optional().nullable(),
  application_id: m().optional().nullable(),
  parent_id: m().optional().nullable(),
  last_pin_timestamp: m().optional().nullable()
}), Co = R({
  user: wt,
  guild_id: m(),
  status: nr,
  activities: ee(pn),
  client_status: R({
    desktop: nr,
    mobile: nr,
    web: nr
  }).partial()
}), Xo = R({
  id: m(),
  name: m(),
  color: G(),
  hoist: Y(),
  position: G(),
  permissions: m(),
  managed: Y(),
  mentionable: Y()
});
R({
  id: m(),
  name: m(),
  owner_id: m(),
  icon: m().nullable(),
  icon_hash: m().optional().nullable(),
  splash: m().nullable(),
  discovery_splash: m().nullable(),
  owner: Y().optional().nullable(),
  permissions: m().optional().nullable(),
  region: m(),
  afk_channel_id: m().nullable(),
  afk_timeout: G(),
  widget_enabled: Y().optional().nullable(),
  widget_channel_id: m().optional().nullable(),
  verification_level: G(),
  default_message_notifications: G(),
  explicit_content_filter: G(),
  roles: ee(Xo),
  emojis: ee(Wr),
  features: ee(m()),
  mfa_level: G(),
  application_id: m().nullable(),
  system_channel_id: m().nullable(),
  system_channel_flags: G(),
  rules_channel_id: m().nullable(),
  joined_at: m().optional().nullable(),
  large: Y().optional().nullable(),
  unavailable: Y().optional().nullable(),
  member_count: G().optional().nullable(),
  voice_states: ee(qi).optional().nullable(),
  members: ee(Xr).optional().nullable(),
  channels: ee(zi).optional().nullable(),
  presences: ee(Co).optional().nullable(),
  max_presences: G().optional().nullable(),
  max_members: G().optional().nullable(),
  vanity_url_code: m().nullable(),
  description: m().nullable(),
  banner: m().nullable(),
  premium_tier: G(),
  premium_subscription_count: G().optional().nullable(),
  preferred_locale: m(),
  public_updates_channel_id: m().nullable(),
  max_video_channel_users: G().optional().nullable(),
  approximate_member_count: G().optional().nullable(),
  approximate_presence_count: G().optional().nullable()
});
const Wo = R({
  id: m(),
  guild_id: m(),
  type: G(),
  name: m()
}), Qo = R({
  id: m(),
  filename: m(),
  size: G(),
  url: m(),
  proxy_url: m(),
  height: G().optional().nullable(),
  width: G().optional().nullable()
}), Jo = R({
  text: m(),
  icon_url: m().optional().nullable(),
  proxy_icon_url: m().optional().nullable()
}), Kr = R({
  url: m().optional().nullable(),
  proxy_url: m().optional().nullable(),
  height: G().optional().nullable(),
  width: G().optional().nullable()
}), el = Kr.omit({ proxy_url: !0 }), tl = R({
  name: m().optional().nullable(),
  url: m().optional().nullable()
}), nl = R({
  name: m().optional().nullable(),
  url: m().optional().nullable(),
  icon_url: m().optional().nullable(),
  proxy_icon_url: m().optional().nullable()
}), rl = R({
  name: m(),
  value: m(),
  inline: Y()
}), il = R({
  title: m().optional().nullable(),
  type: m().optional().nullable(),
  description: m().optional().nullable(),
  url: m().optional().nullable(),
  timestamp: m().optional().nullable(),
  color: G().optional().nullable(),
  footer: Jo.optional().nullable(),
  image: Kr.optional().nullable(),
  thumbnail: Kr.optional().nullable(),
  video: el.optional().nullable(),
  provider: tl.optional().nullable(),
  author: nl.optional().nullable(),
  fields: ee(rl).optional().nullable()
}), sl = R({
  count: G(),
  me: Y(),
  emoji: Wr
}), al = R({
  type: G(),
  party_id: m().optional().nullable()
}), ol = R({
  id: m(),
  cover_image: m().optional().nullable(),
  description: m(),
  icon: m().optional().nullable(),
  name: m()
}), ll = R({
  message_id: m().optional().nullable(),
  channel_id: m().optional().nullable(),
  guild_id: m().optional().nullable()
}), ul = R({
  id: m(),
  channel_id: m(),
  guild_id: m().optional().nullable(),
  author: wt.optional().nullable(),
  member: Xr.optional().nullable(),
  content: m(),
  timestamp: m(),
  edited_timestamp: m().optional().nullable(),
  tts: Y(),
  mention_everyone: Y(),
  mentions: ee(wt),
  mention_roles: ee(m()),
  mention_channels: ee(Wo),
  attachments: ee(Qo),
  embeds: ee(il),
  reactions: ee(sl).optional().nullable(),
  nonce: zr([m(), G()]).optional().nullable(),
  pinned: Y(),
  webhook_id: m().optional().nullable(),
  type: G(),
  activity: al.optional().nullable(),
  application: ol.optional().nullable(),
  message_reference: ll.optional().nullable(),
  flags: G().optional().nullable(),
  stickers: ee(On()).optional().nullable(),
  // Cannot self reference, but this is possibly a Message
  referenced_message: On().optional().nullable()
}), cl = R({
  id: m(),
  name: m()
}), dl = {
  UNHANDLED: -1,
  KEYBOARD_KEY: 0,
  MOUSE_BUTTON: 1,
  KEYBOARD_MODIFIER_KEY: 2,
  GAMEPAD_BUTTON: 3
}, Ci = R({
  type: we(dl),
  code: G(),
  name: m()
}), fl = {
  UNHANDLED: -1,
  PUSH_TO_TALK: "PUSH_TO_TALK",
  VOICE_ACTIVITY: "VOICE_ACTIVITY"
}, pl = R({
  type: we(fl),
  auto_threshold: Y(),
  threshold: G(),
  shortcut: ee(Ci),
  delay: G()
}), yi = R({
  device_id: m(),
  volume: G(),
  available_devices: ee(cl)
}), hl = {
  UNHANDLED: -1,
  AUDIO_INPUT: "AUDIO_INPUT",
  AUDIO_OUTPUT: "AUDIO_OUTPUT",
  VIDEO_INPUT: "VIDEO_INPUT"
};
R({
  type: we(hl),
  id: m(),
  vendor: R({
    name: m(),
    url: m()
  }),
  model: R({
    name: m(),
    url: m()
  }),
  related: ee(m()),
  echo_cancellation: Y().optional().nullable(),
  noise_suppression: Y().optional().nullable(),
  automatic_gain_control: Y().optional().nullable(),
  hardware_mute: Y().optional().nullable()
});
const gl = {
  UNHANDLED: -1,
  APPLICATION: 1,
  DLC: 2,
  CONSUMABLE: 3,
  BUNDLE: 4,
  SUBSCRIPTION: 5
}, _l = R({
  id: m(),
  name: m(),
  type: we(gl),
  price: R({
    amount: G(),
    currency: m()
  }),
  application_id: m(),
  flags: G(),
  release_date: m().nullable()
}), ml = {
  UNHANDLED: -1,
  PURCHASE: 1,
  PREMIUM_SUBSCRIPTION: 2,
  DEVELOPER_GIFT: 3,
  TEST_MODE_PURCHASE: 4,
  FREE_PURCHASE: 5,
  USER_GIFT: 6,
  PREMIUM_PURCHASE: 7
}, Qr = R({
  id: m(),
  sku_id: m(),
  application_id: m(),
  user_id: m(),
  gift_code_flags: G(),
  type: we(ml),
  gifter_user_id: m().optional().nullable(),
  branches: ee(m()).optional().nullable(),
  starts_at: m().optional().nullable(),
  // ISO string
  ends_at: m().optional().nullable(),
  // ISO string
  parent_id: m().optional().nullable(),
  consumed: Y().optional().nullable(),
  deleted: Y().optional().nullable(),
  gift_code_batch_id: m().optional().nullable()
}), vl = {
  UNHANDLED: -1,
  UNLOCKED: 1,
  PORTRAIT: 2,
  LANDSCAPE: 3
};
we(vl);
const El = {
  UNHANDLED: -1,
  NOMINAL: 0,
  FAIR: 1,
  SERIOUS: 2,
  CRITICAL: 3
}, yl = we(El), Xi = {
  UNHANDLED: -1,
  PORTRAIT: 0,
  LANDSCAPE: 1
};
we(Xi);
const Wi = {
  UNHANDLED: -1,
  FOCUSED: 0,
  PIP: 1,
  GRID: 2
};
we(Wi);
const Jr = "ERROR";
var ie;
(function(t) {
  t.READY = "READY", t.VOICE_STATE_UPDATE = "VOICE_STATE_UPDATE", t.SPEAKING_START = "SPEAKING_START", t.SPEAKING_STOP = "SPEAKING_STOP", t.ACTIVITY_LAYOUT_MODE_UPDATE = "ACTIVITY_LAYOUT_MODE_UPDATE", t.ORIENTATION_UPDATE = "ORIENTATION_UPDATE", t.CURRENT_USER_UPDATE = "CURRENT_USER_UPDATE", t.CURRENT_GUILD_MEMBER_UPDATE = "CURRENT_GUILD_MEMBER_UPDATE", t.ENTITLEMENT_CREATE = "ENTITLEMENT_CREATE", t.THERMAL_STATE_UPDATE = "THERMAL_STATE_UPDATE", t.ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE = "ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE";
})(ie || (ie = {}));
const Le = Jt.extend({
  evt: Qt(ie),
  nonce: m().nullable(),
  cmd: me(jo),
  data: R({}).passthrough()
}), Qi = Jt.extend({
  evt: me(Jr),
  data: R({
    code: G(),
    message: m().optional()
  }).passthrough(),
  cmd: Qt(Z),
  nonce: m().nullable()
}), Tl = Le.extend({
  evt: m()
}), bl = zr([Le, Tl, Qi]);
function Al(t) {
  const e = t.evt;
  if (!(e in ie))
    throw new Error(`Unrecognized event type ${t.evt}`);
  return Nl[e].payload.parse(t);
}
const Nl = {
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
      evt: me(ie.READY),
      data: R({
        v: G(),
        config: R({
          cdn_host: m().optional(),
          api_endpoint: m(),
          environment: m()
        }),
        user: R({
          id: m(),
          username: m(),
          discriminator: m(),
          avatar: m().optional()
        }).optional()
      })
    })
  },
  [ie.VOICE_STATE_UPDATE]: {
    payload: Le.extend({
      evt: me(ie.VOICE_STATE_UPDATE),
      data: Yi
    }),
    subscribeArgs: R({
      channel_id: m()
    })
  },
  [ie.SPEAKING_START]: {
    payload: Le.extend({
      evt: me(ie.SPEAKING_START),
      data: R({
        lobby_id: m().optional(),
        channel_id: m().optional(),
        user_id: m()
      })
    }),
    subscribeArgs: R({
      lobby_id: m().nullable().optional(),
      channel_id: m().nullable().optional()
    })
  },
  [ie.SPEAKING_STOP]: {
    payload: Le.extend({
      evt: me(ie.SPEAKING_STOP),
      data: R({
        lobby_id: m().optional(),
        channel_id: m().optional(),
        user_id: m()
      })
    }),
    subscribeArgs: R({
      lobby_id: m().nullable().optional(),
      channel_id: m().nullable().optional()
    })
  },
  [ie.ACTIVITY_LAYOUT_MODE_UPDATE]: {
    payload: Le.extend({
      evt: me(ie.ACTIVITY_LAYOUT_MODE_UPDATE),
      data: R({
        layout_mode: we(Wi)
      })
    })
  },
  [ie.ORIENTATION_UPDATE]: {
    payload: Le.extend({
      evt: me(ie.ORIENTATION_UPDATE),
      data: R({
        screen_orientation: we(Xi),
        /**
         * @deprecated use screen_orientation instead
         */
        orientation: Qt(jr)
      })
    })
  },
  [ie.CURRENT_USER_UPDATE]: {
    payload: Le.extend({
      evt: me(ie.CURRENT_USER_UPDATE),
      data: wt
    })
  },
  [ie.CURRENT_GUILD_MEMBER_UPDATE]: {
    payload: Le.extend({
      evt: me(ie.CURRENT_GUILD_MEMBER_UPDATE),
      data: qo
    }),
    subscribeArgs: R({
      guild_id: m()
    })
  },
  [ie.ENTITLEMENT_CREATE]: {
    payload: Le.extend({
      evt: me(ie.ENTITLEMENT_CREATE),
      data: R({ entitlement: Qr })
    })
  },
  [ie.THERMAL_STATE_UPDATE]: {
    payload: Le.extend({
      evt: me(ie.THERMAL_STATE_UPDATE),
      data: R({ thermal_state: yl })
    })
  },
  [ie.ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE]: {
    payload: Le.extend({
      evt: me(ie.ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE),
      data: R({
        participants: ji.shape.participants
      })
    })
  }
};
function wl(t, e) {
  throw e;
}
const gr = R({}).nullable(), Ji = R({
  code: m()
}), Il = R({
  guilds: ee(R({
    id: m(),
    name: m()
  }))
}), Sl = R({
  id: m(),
  name: m(),
  icon_url: m().optional(),
  members: ee(Xr)
}), Wt = R({
  id: m(),
  type: we($i),
  guild_id: m().optional().nullable(),
  name: m().optional().nullable(),
  topic: m().optional().nullable(),
  bitrate: G().optional().nullable(),
  user_limit: G().optional().nullable(),
  position: G().optional().nullable(),
  voice_states: ee(Yi),
  messages: ee(ul)
}), Ol = R({
  channels: ee(zi)
});
Wt.nullable();
const Rl = Wt.nullable(), Dl = Wt.nullable();
R({
  input: yi,
  output: yi,
  mode: pl,
  automatic_gain_control: Y(),
  echo_cancellation: Y(),
  noise_suppression: Y(),
  qos: Y(),
  silence_warning: Y(),
  deaf: Y(),
  mute: Y()
});
const xl = R({
  evt: m()
}), Pl = R({ shortcut: Ci }), es = pn, ts = R({ skus: ee(_l) }), ns = R({ entitlements: ee(Qr) }), rs = ee(Qr).nullable(), is = R({
  use_interactive_pip: Y()
}), ss = R({
  locale: m()
}), as = R({
  enabled: Y()
}), os = R({
  permissions: Mi().or(m())
}), ls = Hi(R({ opened: Y().or(pr()) }).default({ opened: null })), us = R({
  iosKeyboardResizesView: Li(Y())
}), kl = Jt.extend({
  cmd: Qt(Z),
  evt: pr()
});
function Ml({ cmd: t, data: e }) {
  switch (t) {
    case Z.AUTHORIZE:
      return Ji.parse(e);
    case Z.CAPTURE_SHORTCUT:
      return Pl.parse(e);
    case Z.ENCOURAGE_HW_ACCELERATION:
      return as.parse(e);
    case Z.GET_CHANNEL:
      return Wt.parse(e);
    case Z.GET_CHANNELS:
      return Ol.parse(e);
    case Z.GET_CHANNEL_PERMISSIONS:
      return os.parse(e);
    case Z.GET_GUILD:
      return Sl.parse(e);
    case Z.GET_GUILDS:
      return Il.parse(e);
    case Z.GET_PLATFORM_BEHAVIORS:
      return us.parse(e);
    case Z.GET_CHANNEL:
      return Wt.parse(e);
    case Z.SELECT_TEXT_CHANNEL:
      return Dl.parse(e);
    case Z.SELECT_VOICE_CHANNEL:
      return Rl.parse(e);
    case Z.SET_ACTIVITY:
      return es.parse(e);
    case Z.GET_SKUS_EMBEDDED:
      return ts.parse(e);
    case Z.GET_ENTITLEMENTS_EMBEDDED:
      return ns.parse(e);
    case Z.SET_CONFIG:
      return is.parse(e);
    case Z.START_PURCHASE:
      return rs.parse(e);
    case Z.SUBSCRIBE:
    case Z.UNSUBSCRIBE:
      return xl.parse(e);
    case Z.USER_SETTINGS_GET_LOCALE:
      return ss.parse(e);
    case Z.OPEN_EXTERNAL_LINK:
      return ls.parse(e);
    case Z.SET_ORIENTATION_LOCK_STATE:
    case Z.SET_CERTIFIED_DEVICES:
    case Z.SEND_ANALYTICS_EVENT:
    case Z.OPEN_INVITE_DIALOG:
    case Z.CAPTURE_LOG:
    case Z.GET_SKUS:
    case Z.GET_ENTITLEMENTS:
      return gr.parse(e);
    case Z.AUTHENTICATE:
    case Z.INITIATE_IMAGE_UPLOAD:
    case Z.OPEN_SHARE_MOMENT_DIALOG:
    case Z.GET_ACTIVITY_INSTANCE_CONNECTED_PARTICIPANTS:
      const { response: n } = Ki[t];
      return n.parse(e);
    default:
      wl(t, new Error(`Unrecognized command ${t}`));
  }
}
function Ll(t) {
  return Object.assign(Object.assign({}, t), { data: Ml(t) });
}
R({
  frame_id: m(),
  platform: Qt(pt).optional().nullable()
});
R({
  v: me(1),
  encoding: me("json").optional(),
  client_id: m(),
  frame_id: m()
});
const Ul = R({
  code: G(),
  message: m().optional()
}), Bl = R({
  evt: m().nullable(),
  nonce: m().nullable(),
  data: On().nullable(),
  cmd: m()
}).passthrough();
function Gl(t) {
  const e = Bl.parse(t);
  return e.evt != null ? e.evt === Jr ? Qi.parse(e) : Al(bl.parse(e)) : Ll(kl.passthrough().parse(e));
}
function ke(t, e, n, r = () => {
}) {
  const i = Jt.extend({
    cmd: me(e),
    data: n
  });
  return async (s) => {
    const u = await t({ cmd: e, args: s, transfer: r(s) });
    return i.parse(u).data;
  };
}
function _r(t, e = () => {
}) {
  const n = Ki[t].response, r = Jt.extend({
    cmd: me(t),
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
const Zl = _r(Xe.AUTHENTICATE), Vl = (t) => ke(t, Z.AUTHORIZE, Ji), Hl = (t) => ke(t, Z.CAPTURE_LOG, gr), Fl = (t) => ke(t, Z.ENCOURAGE_HW_ACCELERATION, as), jl = (t) => ke(t, Z.GET_ENTITLEMENTS_EMBEDDED, ns), Kl = (t) => ke(t, Z.GET_SKUS_EMBEDDED, ts), ql = (t) => ke(t, Z.GET_CHANNEL_PERMISSIONS, os), Yl = (t) => ke(t, Z.GET_PLATFORM_BEHAVIORS, us), $l = (t) => ke(t, Z.OPEN_EXTERNAL_LINK, ls), zl = (t) => ke(t, Z.OPEN_INVITE_DIALOG, gr), Cl = _r(Xe.OPEN_SHARE_MOMENT_DIALOG);
pn.pick({
  state: !0,
  details: !0,
  timestamps: !0,
  assets: !0,
  party: !0,
  secrets: !0,
  instance: !0,
  type: !0
}).extend({
  type: pn.shape.type.optional(),
  instance: pn.shape.instance.optional()
}).nullable();
const Xl = (t) => ke(t, Z.SET_ACTIVITY, es), Wl = (t) => ke(t, Z.SET_CONFIG, is);
function Ql({ sendCommand: t, cmd: e, response: n, fallbackTransform: r, transferTransform: i = () => {
} }) {
  const s = Jt.extend({
    cmd: me(e),
    data: n
  });
  return async (u) => {
    try {
      const c = await t({ cmd: e, args: u, transfer: i(u) });
      return s.parse(c).data;
    } catch (c) {
      if (c.code === Fr.INVALID_PAYLOAD) {
        const g = r(u), f = await t({ cmd: e, args: g, transfer: i(g) });
        return s.parse(f).data;
      } else
        throw c;
    }
  };
}
const Jl = (t) => ({
  lock_state: t.lock_state,
  picture_in_picture_lock_state: t.picture_in_picture_lock_state
}), eu = (t) => Ql({
  sendCommand: t,
  cmd: Z.SET_ORIENTATION_LOCK_STATE,
  response: gr,
  fallbackTransform: Jl
}), tu = (t) => ke(t, Z.START_PURCHASE, rs), nu = (t) => ke(t, Z.USER_SETTINGS_GET_LOCALE, ss), ru = _r(Xe.INITIATE_IMAGE_UPLOAD), iu = (t) => ke(t, Z.GET_CHANNEL, Wt), su = _r(Xe.GET_ACTIVITY_INSTANCE_CONNECTED_PARTICIPANTS);
function au(t) {
  return {
    authenticate: Zl(t),
    authorize: Vl(t),
    captureLog: Hl(t),
    encourageHardwareAcceleration: Fl(t),
    getChannel: iu(t),
    getChannelPermissions: ql(t),
    getEntitlements: jl(t),
    getPlatformBehaviors: Yl(t),
    getSkus: Kl(t),
    openExternalLink: $l(t),
    openInviteDialog: zl(t),
    openShareMomentDialog: Cl(t),
    setActivity: Xl(t),
    setConfig: Wl(t),
    setOrientationLockState: eu(t),
    startPurchase: tu(t),
    userSettingsGetLocale: nu(t),
    initiateImageUpload: ru(t),
    getInstanceConnectedParticipants: su(t)
  };
}
class ou extends Error {
  constructor(e, n = "") {
    super(n), this.code = e, this.message = n, this.name = "Discord SDK Error";
  }
}
function lu() {
  return {
    disableConsoleLogOverride: !1
  };
}
const uu = ["log", "warn", "debug", "info", "error"];
function cu(t, e, n) {
  const r = t[e], i = t;
  r && (t[e] = function() {
    const s = [].slice.call(arguments), u = "" + s.join(" ");
    n(e, u), r.apply(i, s);
  });
}
var du = "1.7.0", fu = typeof crypto < "u" && crypto.randomUUID && crypto.randomUUID.bind(crypto), Ti = {
  randomUUID: fu
}, rr, pu = new Uint8Array(16);
function hu() {
  if (!rr && (rr = typeof crypto < "u" && crypto.getRandomValues && crypto.getRandomValues.bind(crypto), !rr))
    throw new Error("crypto.getRandomValues() not supported. See https://github.com/uuidjs/uuid#getrandomvalues-not-supported");
  return rr(pu);
}
var Ee = [];
for (var Lr = 0; Lr < 256; ++Lr)
  Ee.push((Lr + 256).toString(16).slice(1));
function gu(t, e = 0) {
  return (Ee[t[e + 0]] + Ee[t[e + 1]] + Ee[t[e + 2]] + Ee[t[e + 3]] + "-" + Ee[t[e + 4]] + Ee[t[e + 5]] + "-" + Ee[t[e + 6]] + Ee[t[e + 7]] + "-" + Ee[t[e + 8]] + Ee[t[e + 9]] + "-" + Ee[t[e + 10]] + Ee[t[e + 11]] + Ee[t[e + 12]] + Ee[t[e + 13]] + Ee[t[e + 14]] + Ee[t[e + 15]]).toLowerCase();
}
function bi(t, e, n) {
  if (Ti.randomUUID && !e && !t)
    return Ti.randomUUID();
  t = t || {};
  var r = t.random || (t.rng || hu)();
  return r[6] = r[6] & 15 | 64, r[8] = r[8] & 63 | 128, gu(r);
}
var ft;
(function(t) {
  t[t.HANDSHAKE = 0] = "HANDSHAKE", t[t.FRAME = 1] = "FRAME", t[t.CLOSE = 2] = "CLOSE", t[t.HELLO = 3] = "HELLO";
})(ft || (ft = {}));
const _u = new Set(mu());
function mu() {
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
function vu() {
  var t;
  return [(t = window.parent.opener) !== null && t !== void 0 ? t : window.parent, document.referrer ? document.referrer : "*"];
}
class Eu {
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
    if (this.sdkVersion = du, this.mobileAppVersion = null, this.source = null, this.sourceOrigin = "", this.eventBus = new Da(), this.pendingCommands = /* @__PURE__ */ new Map(), this.sendCommand = (c) => {
      var g;
      if (this.source == null)
        throw new Error("Attempting to send message before initialization");
      const f = bi();
      return (g = this.source) === null || g === void 0 || g.postMessage([ft.FRAME, Object.assign(Object.assign({}, c), { nonce: f })], this.sourceOrigin, this.getTransfer(c)), new Promise((_, A) => {
        this.pendingCommands.set(f, { resolve: _, reject: A });
      });
    }, this.commands = au(this.sendCommand), this.handleMessage = (c) => {
      if (!_u.has(c.origin))
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
    }, this.isReady = !1, this.clientId = e, this.configuration = n ?? lu(), typeof window < "u" && window.addEventListener("message", this.handleMessage), typeof window > "u") {
      this.frameId = "", this.instanceId = "", this.platform = pt.DESKTOP, this.guildId = null, this.channelId = null, this.locationId = null;
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
      if (u !== pt.DESKTOP && u !== pt.MOBILE)
        throw new Error(`Invalid query param "platform" of "${u}". Valid values are "${pt.DESKTOP}" or "${pt.MOBILE}"`);
    } else
      throw new Error("platform query param is not defined");
    this.platform = u, this.guildId = r.get("guild_id"), this.channelId = r.get("channel_id"), this.locationId = r.get("location_id"), this.mobileAppVersion = r.get("mobile_app_version"), [this.source, this.sourceOrigin] = vu(), this.addOnReadyListener(), this.handshake();
  }
  close(e, n) {
    var r;
    window.removeEventListener("message", this.handleMessage);
    const i = bi();
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
        return vi;
      }
    return vi;
  }
  handshake() {
    var e;
    const n = {
      v: 1,
      encoding: "json",
      client_id: this.clientId,
      frame_id: this.frameId
    }, r = this.parseMajorMobileVersion();
    (this.platform === pt.DESKTOP || r >= Go) && (n.sdk_version = this.sdkVersion), (e = this.source) === null || e === void 0 || e.postMessage([ft.HANDSHAKE, n], this.sourceOrigin);
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
    uu.forEach((n) => {
      cu(console, n, e);
    });
  }
  handleClose(e) {
    Ul.parse(e);
  }
  handleHandshake() {
  }
  handleFrame(e) {
    var n, r;
    let i;
    try {
      i = Gl(e);
    } catch (s) {
      console.error("Failed to parse", e), console.error(s);
      return;
    }
    if (i.cmd === "DISPATCH")
      this.eventBus.emit(i.evt, i.data);
    else {
      if (i.evt === Jr) {
        if (i.nonce != null) {
          (n = this.pendingCommands.get(i.nonce)) === null || n === void 0 || n.reject(i.data), this.pendingCommands.delete(i.nonce);
          return;
        }
        this.eventBus.emit("error", new ou(i.data.code, i.data.message));
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
var en = 1e9, yu = {
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
}, gs, ce = !0, Fe = "[DecimalError] ", Lt = Fe + "Invalid argument: ", ei = Fe + "Exponent out of range: ", tn = Math.floor, Pt = Math.pow, Tu = /^(\d+(\.\d*)?|\.\d+)(e[+-]?\d+)?$/i, Ue, ve = 1e7, ue = 7, cs = 9007199254740991, dr = tn(cs / ue), M = {};
M.absoluteValue = M.abs = function() {
  var t = new this.constructor(this);
  return t.s && (t.s = 1), t;
};
M.comparedTo = M.cmp = function(t) {
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
M.decimalPlaces = M.dp = function() {
  var t = this, e = t.d.length - 1, n = (e - t.e) * ue;
  if (e = t.d[e], e)
    for (; e % 10 == 0; e /= 10)
      n--;
  return n < 0 ? 0 : n;
};
M.dividedBy = M.div = function(t) {
  return ht(this, new this.constructor(t));
};
M.dividedToIntegerBy = M.idiv = function(t) {
  var e = this, n = e.constructor;
  return le(ht(e, new n(t), 0, 1), n.precision);
};
M.equals = M.eq = function(t) {
  return !this.cmp(t);
};
M.exponent = function() {
  return _e(this);
};
M.greaterThan = M.gt = function(t) {
  return this.cmp(t) > 0;
};
M.greaterThanOrEqualTo = M.gte = function(t) {
  return this.cmp(t) >= 0;
};
M.isInteger = M.isint = function() {
  return this.e > this.d.length - 2;
};
M.isNegative = M.isneg = function() {
  return this.s < 0;
};
M.isPositive = M.ispos = function() {
  return this.s > 0;
};
M.isZero = function() {
  return this.s === 0;
};
M.lessThan = M.lt = function(t) {
  return this.cmp(t) < 0;
};
M.lessThanOrEqualTo = M.lte = function(t) {
  return this.cmp(t) < 1;
};
M.logarithm = M.log = function(t) {
  var e, n = this, r = n.constructor, i = r.precision, s = i + 5;
  if (t === void 0)
    t = new r(10);
  else if (t = new r(t), t.s < 1 || t.eq(Ue))
    throw Error(Fe + "NaN");
  if (n.s < 1)
    throw Error(Fe + (n.s ? "NaN" : "-Infinity"));
  return n.eq(Ue) ? new r(0) : (ce = !1, e = ht(Rn(n, s), Rn(t, s), s), ce = !0, le(e, i));
};
M.minus = M.sub = function(t) {
  var e = this;
  return t = new e.constructor(t), e.s == t.s ? ps(e, t) : ds(e, (t.s = -t.s, t));
};
M.modulo = M.mod = function(t) {
  var e, n = this, r = n.constructor, i = r.precision;
  if (t = new r(t), !t.s)
    throw Error(Fe + "NaN");
  return n.s ? (ce = !1, e = ht(n, t, 0, 1).times(t), ce = !0, n.minus(e)) : le(new r(n), i);
};
M.naturalExponential = M.exp = function() {
  return fs(this);
};
M.naturalLogarithm = M.ln = function() {
  return Rn(this);
};
M.negated = M.neg = function() {
  var t = new this.constructor(this);
  return t.s = -t.s || 0, t;
};
M.plus = M.add = function(t) {
  var e = this;
  return t = new e.constructor(t), e.s == t.s ? ds(e, t) : ps(e, (t.s = -t.s, t));
};
M.precision = M.sd = function(t) {
  var e, n, r, i = this;
  if (t !== void 0 && t !== !!t && t !== 1 && t !== 0)
    throw Error(Lt + t);
  if (e = _e(i) + 1, r = i.d.length - 1, n = r * ue + 1, r = i.d[r], r) {
    for (; r % 10 == 0; r /= 10)
      n--;
    for (r = i.d[0]; r >= 10; r /= 10)
      n++;
  }
  return t && e > n ? e : n;
};
M.squareRoot = M.sqrt = function() {
  var t, e, n, r, i, s, u, c = this, g = c.constructor;
  if (c.s < 1) {
    if (!c.s)
      return new g(0);
    throw Error(Fe + "NaN");
  }
  for (t = _e(c), ce = !1, i = Math.sqrt(+c), i == 0 || i == 1 / 0 ? (e = We(c.d), (e.length + t) % 2 == 0 && (e += "0"), i = Math.sqrt(e), t = tn((t + 1) / 2) - (t < 0 || t % 2), i == 1 / 0 ? e = "5e" + t : (e = i.toExponential(), e = e.slice(0, e.indexOf("e") + 1) + t), r = new g(e)) : r = new g(i.toString()), n = g.precision, i = u = n + 3; ; )
    if (s = r, r = s.plus(ht(c, s, u + 2)).times(0.5), We(s.d).slice(0, u) === (e = We(r.d)).slice(0, u)) {
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
M.times = M.mul = function(t) {
  var e, n, r, i, s, u, c, g, f, d = this, _ = d.constructor, A = d.d, k = (t = new _(t)).d;
  if (!d.s || !t.s)
    return new _(0);
  for (t.s *= d.s, n = d.e + t.e, g = A.length, f = k.length, g < f && (s = A, A = k, k = s, u = g, g = f, f = u), s = [], u = g + f, r = u; r--; )
    s.push(0);
  for (r = f; --r >= 0; ) {
    for (e = 0, i = g + r; i > r; )
      c = s[i] + k[r] * A[i - r - 1] + e, s[i--] = c % ve | 0, e = c / ve | 0;
    s[i] = (s[i] + e) % ve | 0;
  }
  for (; !s[--u]; )
    s.pop();
  return e ? ++n : s.shift(), t.d = s, t.e = n, ce ? le(t, _.precision) : t;
};
M.toDecimalPlaces = M.todp = function(t, e) {
  var n = this, r = n.constructor;
  return n = new r(n), t === void 0 ? n : (tt(t, 0, en), e === void 0 ? e = r.rounding : tt(e, 0, 8), le(n, t + _e(n) + 1, e));
};
M.toExponential = function(t, e) {
  var n, r = this, i = r.constructor;
  return t === void 0 ? n = Gt(r, !0) : (tt(t, 0, en), e === void 0 ? e = i.rounding : tt(e, 0, 8), r = le(new i(r), t + 1, e), n = Gt(r, !0, t + 1)), n;
};
M.toFixed = function(t, e) {
  var n, r, i = this, s = i.constructor;
  return t === void 0 ? Gt(i) : (tt(t, 0, en), e === void 0 ? e = s.rounding : tt(e, 0, 8), r = le(new s(i), t + _e(i) + 1, e), n = Gt(r.abs(), !1, t + _e(r) + 1), i.isneg() && !i.isZero() ? "-" + n : n);
};
M.toInteger = M.toint = function() {
  var t = this, e = t.constructor;
  return le(new e(t), _e(t) + 1, e.rounding);
};
M.toNumber = function() {
  return +this;
};
M.toPower = M.pow = function(t) {
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
    if ((n = d < 0 ? -d : d) <= cs) {
      for (i = new g(Ue), e = Math.ceil(r / ue + 4), ce = !1; n % 2 && (i = i.times(c), Ni(i.d, e)), n = tn(n / 2), n !== 0; )
        c = c.times(c), Ni(c.d, e);
      return ce = !0, t.s < 0 ? new g(Ue).div(i) : le(i, r);
    }
  } else if (s < 0)
    throw Error(Fe + "NaN");
  return s = s < 0 && t.d[Math.max(e, n)] & 1 ? -1 : 1, c.s = 1, ce = !1, i = t.times(Rn(c, r + f)), ce = !0, i = fs(i), i.s = s, i;
};
M.toPrecision = function(t, e) {
  var n, r, i = this, s = i.constructor;
  return t === void 0 ? (n = _e(i), r = Gt(i, n <= s.toExpNeg || n >= s.toExpPos)) : (tt(t, 1, en), e === void 0 ? e = s.rounding : tt(e, 0, 8), i = le(new s(i), t, e), n = _e(i), r = Gt(i, t <= n || n <= s.toExpNeg, t)), r;
};
M.toSignificantDigits = M.tosd = function(t, e) {
  var n = this, r = n.constructor;
  return t === void 0 ? (t = r.precision, e = r.rounding) : (tt(t, 1, en), e === void 0 ? e = r.rounding : tt(e, 0, 8)), le(new r(n), t, e);
};
M.toString = M.valueOf = M.val = M.toJSON = M[Symbol.for("nodejs.util.inspect.custom")] = function() {
  var t = this, e = _e(t), n = t.constructor;
  return Gt(t, e <= n.toExpNeg || e >= n.toExpPos);
};
function ds(t, e) {
  var n, r, i, s, u, c, g, f, d = t.constructor, _ = d.precision;
  if (!t.s || !e.s)
    return e.s || (e = new d(t)), ce ? le(e, _) : e;
  if (g = t.d, f = e.d, u = t.e, i = e.e, g = g.slice(), s = u - i, s) {
    for (s < 0 ? (r = g, s = -s, c = f.length) : (r = f, i = u, c = g.length), u = Math.ceil(_ / ue), c = u > c ? u + 1 : c + 1, s > c && (s = c, r.length = 1), r.reverse(); s--; )
      r.push(0);
    r.reverse();
  }
  for (c = g.length, s = f.length, c - s < 0 && (s = c, r = f, f = g, g = r), n = 0; s; )
    n = (g[--s] = g[s] + f[s] + n) / ve | 0, g[s] %= ve;
  for (n && (g.unshift(n), ++i), c = g.length; g[--c] == 0; )
    g.pop();
  return e.d = g, e.e = i, ce ? le(e, _) : e;
}
function tt(t, e, n) {
  if (t !== ~~t || t < e || t > n)
    throw Error(Lt + t);
}
function We(t) {
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
var ht = /* @__PURE__ */ function() {
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
    var c, g, f, d, _, A, k, X, V, D, pe, re, se, Ie, ge, Ge, Te, Me, je = r.constructor, Ze = r.s == i.s ? 1 : -1, Se = r.d, oe = i.d;
    if (!r.s)
      return new je(r);
    if (!i.s)
      throw Error(Fe + "Division by zero");
    for (g = r.e - i.e, Te = oe.length, ge = Se.length, k = new je(Ze), X = k.d = [], f = 0; oe[f] == (Se[f] || 0); )
      ++f;
    if (oe[f] > (Se[f] || 0) && --g, s == null ? re = s = je.precision : u ? re = s + (_e(r) - _e(i)) + 1 : re = s, re < 0)
      return new je(0);
    if (re = re / ue + 2 | 0, f = 0, Te == 1)
      for (d = 0, oe = oe[0], re++; (f < ge || d) && re--; f++)
        se = d * ve + (Se[f] || 0), X[f] = se / oe | 0, d = se % oe | 0;
    else {
      for (d = ve / (oe[0] + 1) | 0, d > 1 && (oe = t(oe, d), Se = t(Se, d), Te = oe.length, ge = Se.length), Ie = Te, V = Se.slice(0, Te), D = V.length; D < Te; )
        V[D++] = 0;
      Me = oe.slice(), Me.unshift(0), Ge = oe[0], oe[1] >= ve / 2 && ++Ge;
      do
        d = 0, c = e(oe, V, Te, D), c < 0 ? (pe = V[0], Te != D && (pe = pe * ve + (V[1] || 0)), d = pe / Ge | 0, d > 1 ? (d >= ve && (d = ve - 1), _ = t(oe, d), A = _.length, D = V.length, c = e(_, V, A, D), c == 1 && (d--, n(_, Te < A ? Me : oe, A))) : (d == 0 && (c = d = 1), _ = oe.slice()), A = _.length, A < D && _.unshift(0), n(V, _, D), c == -1 && (D = V.length, c = e(oe, V, Te, D), c < 1 && (d++, n(V, Te < D ? Me : oe, D))), D = V.length) : c === 0 && (d++, V = [0]), X[f++] = d, c && V[0] ? V[D++] = Se[Ie] || 0 : (V = [Se[Ie]], D = 1);
      while ((Ie++ < ge || V[0] !== void 0) && re--);
    }
    return X[0] || X.shift(), k.e = g, le(k, u ? s + _e(k) + 1 : s);
  };
}();
function fs(t, e) {
  var n, r, i, s, u, c, g = 0, f = 0, d = t.constructor, _ = d.precision;
  if (_e(t) > 16)
    throw Error(ei + _e(t));
  if (!t.s)
    return new d(Ue);
  for (e == null ? (ce = !1, c = _) : c = e, u = new d(0.03125); t.abs().gte(0.1); )
    t = t.times(u), f += 5;
  for (r = Math.log(Pt(2, f)) / Math.LN10 * 2 + 5 | 0, c += r, n = i = s = new d(Ue), d.precision = c; ; ) {
    if (i = le(i.times(t), c), n = n.times(++g), u = s.plus(ht(i, n, c)), We(u.d).slice(0, c) === We(s.d).slice(0, c)) {
      for (; f--; )
        s = le(s.times(s), c);
      return d.precision = _, e == null ? (ce = !0, le(s, _)) : s;
    }
    s = u;
  }
}
function _e(t) {
  for (var e = t.e * ue, n = t.d[0]; n >= 10; n /= 10)
    e++;
  return e;
}
function Ur(t, e, n) {
  if (e > t.LN10.sd())
    throw ce = !0, n && (t.precision = n), Error(Fe + "LN10 precision limit exceeded");
  return le(new t(t.LN10), e);
}
function vt(t) {
  for (var e = ""; t--; )
    e += "0";
  return e;
}
function Rn(t, e) {
  var n, r, i, s, u, c, g, f, d, _ = 1, A = 10, k = t, X = k.d, V = k.constructor, D = V.precision;
  if (k.s < 1)
    throw Error(Fe + (k.s ? "NaN" : "-Infinity"));
  if (k.eq(Ue))
    return new V(0);
  if (e == null ? (ce = !1, f = D) : f = e, k.eq(10))
    return e == null && (ce = !0), Ur(V, f);
  if (f += A, V.precision = f, n = We(X), r = n.charAt(0), s = _e(k), Math.abs(s) < 15e14) {
    for (; r < 7 && r != 1 || r == 1 && n.charAt(1) > 3; )
      k = k.times(t), n = We(k.d), r = n.charAt(0), _++;
    s = _e(k), r > 1 ? (k = new V("0." + n), s++) : k = new V(r + "." + n.slice(1));
  } else
    return g = Ur(V, f + 2, D).times(s + ""), k = Rn(new V(r + "." + n.slice(1)), f - A).plus(g), V.precision = D, e == null ? (ce = !0, le(k, D)) : k;
  for (c = u = k = ht(k.minus(Ue), k.plus(Ue), f), d = le(k.times(k), f), i = 3; ; ) {
    if (u = le(u.times(d), f), g = c.plus(ht(u, new V(i), f)), We(g.d).slice(0, f) === We(c.d).slice(0, f))
      return c = c.times(2), s !== 0 && (c = c.plus(Ur(V, f + 2, D).times(s + ""))), c = ht(c, new V(_), f), V.precision = D, e == null ? (ce = !0, le(c, D)) : c;
    c = g, i += 2;
  }
}
function Ai(t, e) {
  var n, r, i;
  for ((n = e.indexOf(".")) > -1 && (e = e.replace(".", "")), (r = e.search(/e/i)) > 0 ? (n < 0 && (n = r), n += +e.slice(r + 1), e = e.substring(0, r)) : n < 0 && (n = e.length), r = 0; e.charCodeAt(r) === 48; )
    ++r;
  for (i = e.length; e.charCodeAt(i - 1) === 48; )
    --i;
  if (e = e.slice(r, i), e) {
    if (i -= r, n = n - r - 1, t.e = tn(n / ue), t.d = [], r = (n + 1) % ue, n < 0 && (r += ue), r < i) {
      for (r && t.d.push(+e.slice(0, r)), i -= ue; r < i; )
        t.d.push(+e.slice(r, r += ue));
      e = e.slice(r), r = ue - e.length;
    } else
      r -= i;
    for (; r--; )
      e += "0";
    if (t.d.push(+e), ce && (t.e > dr || t.e < -dr))
      throw Error(ei + n);
  } else
    t.s = 0, t.e = 0, t.d = [0];
  return t;
}
function le(t, e, n) {
  var r, i, s, u, c, g, f, d, _ = t.d;
  for (u = 1, s = _[0]; s >= 10; s /= 10)
    u++;
  if (r = e - u, r < 0)
    r += ue, i = e, f = _[d = 0];
  else {
    if (d = Math.ceil((r + 1) / ue), s = _.length, d >= s)
      return t;
    for (f = s = _[d], u = 1; s >= 10; s /= 10)
      u++;
    r %= ue, i = r - ue + u;
  }
  if (n !== void 0 && (s = Pt(10, u - i - 1), c = f / s % 10 | 0, g = e < 0 || _[d + 1] !== void 0 || f % s, g = n < 4 ? (c || g) && (n == 0 || n == (t.s < 0 ? 3 : 2)) : c > 5 || c == 5 && (n == 4 || g || n == 6 && // Check whether the digit to the left of the rounding digit is odd.
  (r > 0 ? i > 0 ? f / Pt(10, u - i) : 0 : _[d - 1]) % 10 & 1 || n == (t.s < 0 ? 8 : 7))), e < 1 || !_[0])
    return g ? (s = _e(t), _.length = 1, e = e - s - 1, _[0] = Pt(10, (ue - e % ue) % ue), t.e = tn(-e / ue) || 0) : (_.length = 1, _[0] = t.e = t.s = 0), t;
  if (r == 0 ? (_.length = d, s = 1, d--) : (_.length = d + 1, s = Pt(10, ue - r), _[d] = i > 0 ? (f / Pt(10, u - i) % Pt(10, i) | 0) * s : 0), g)
    for (; ; )
      if (d == 0) {
        (_[0] += s) == ve && (_[0] = 1, ++t.e);
        break;
      } else {
        if (_[d] += s, _[d] != ve)
          break;
        _[d--] = 0, s = 1;
      }
  for (r = _.length; _[--r] === 0; )
    _.pop();
  if (ce && (t.e > dr || t.e < -dr))
    throw Error(ei + _e(t));
  return t;
}
function ps(t, e) {
  var n, r, i, s, u, c, g, f, d, _, A = t.constructor, k = A.precision;
  if (!t.s || !e.s)
    return e.s ? e.s = -e.s : e = new A(t), ce ? le(e, k) : e;
  if (g = t.d, _ = e.d, r = e.e, f = t.e, g = g.slice(), u = f - r, u) {
    for (d = u < 0, d ? (n = g, u = -u, c = _.length) : (n = _, r = f, c = g.length), i = Math.max(Math.ceil(k / ue), c) + 2, u > i && (u = i, n.length = 1), n.reverse(), i = u; i--; )
      n.push(0);
    n.reverse();
  } else {
    for (i = g.length, c = _.length, d = i < c, d && (c = i), i = 0; i < c; i++)
      if (g[i] != _[i]) {
        d = g[i] < _[i];
        break;
      }
    u = 0;
  }
  for (d && (n = g, g = _, _ = n, e.s = -e.s), c = g.length, i = _.length - c; i > 0; --i)
    g[c++] = 0;
  for (i = _.length; i > u; ) {
    if (g[--i] < _[i]) {
      for (s = i; s && g[--s] === 0; )
        g[s] = ve - 1;
      --g[s], g[i] += ve;
    }
    g[i] -= _[i];
  }
  for (; g[--c] === 0; )
    g.pop();
  for (; g[0] === 0; g.shift())
    --r;
  return g[0] ? (e.d = g, e.e = r, ce ? le(e, k) : e) : new A(0);
}
function Gt(t, e, n) {
  var r, i = _e(t), s = We(t.d), u = s.length;
  return e ? (n && (r = n - u) > 0 ? s = s.charAt(0) + "." + s.slice(1) + vt(r) : u > 1 && (s = s.charAt(0) + "." + s.slice(1)), s = s + (i < 0 ? "e" : "e+") + i) : i < 0 ? (s = "0." + vt(-i - 1) + s, n && (r = n - u) > 0 && (s += vt(r))) : i >= u ? (s += vt(i + 1 - u), n && (r = n - i - 1) > 0 && (s = s + "." + vt(r))) : ((r = i + 1) < u && (s = s.slice(0, r) + "." + s.slice(r)), n && (r = n - u) > 0 && (i + 1 === u && (s += "."), s += vt(r))), t.s < 0 ? "-" + s : s;
}
function Ni(t, e) {
  if (t.length > e)
    return t.length = e, !0;
}
function hs(t) {
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
      return Ai(u, s.toString());
    } else if (typeof s != "string")
      throw Error(Lt + s);
    if (s.charCodeAt(0) === 45 ? (s = s.slice(1), u.s = -1) : u.s = 1, Tu.test(s))
      Ai(u, s);
    else
      throw Error(Lt + s);
  }
  if (i.prototype = M, i.ROUND_UP = 0, i.ROUND_DOWN = 1, i.ROUND_CEIL = 2, i.ROUND_FLOOR = 3, i.ROUND_HALF_UP = 4, i.ROUND_HALF_DOWN = 5, i.ROUND_HALF_EVEN = 6, i.ROUND_HALF_CEIL = 7, i.ROUND_HALF_FLOOR = 8, i.clone = hs, i.config = i.set = bu, t === void 0 && (t = {}), t)
    for (r = ["precision", "rounding", "toExpNeg", "toExpPos", "LN10"], e = 0; e < r.length; )
      t.hasOwnProperty(n = r[e++]) || (t[n] = this[n]);
  return i.config(t), i;
}
function bu(t) {
  if (!t || typeof t != "object")
    throw Error(Fe + "Object expected");
  var e, n, r, i = [
    "precision",
    1,
    en,
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
      if (tn(r) === r && r >= i[e + 1] && r <= i[e + 2])
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
var gs = hs(yu);
Ue = new gs(1);
var v;
(function(t) {
  t.AED = "aed", t.AFN = "afn", t.ALL = "all", t.AMD = "amd", t.ANG = "ang", t.AOA = "aoa", t.ARS = "ars", t.AUD = "aud", t.AWG = "awg", t.AZN = "azn", t.BAM = "bam", t.BBD = "bbd", t.BDT = "bdt", t.BGN = "bgn", t.BHD = "bhd", t.BIF = "bif", t.BMD = "bmd", t.BND = "bnd", t.BOB = "bob", t.BOV = "bov", t.BRL = "brl", t.BSD = "bsd", t.BTN = "btn", t.BWP = "bwp", t.BYN = "byn", t.BYR = "byr", t.BZD = "bzd", t.CAD = "cad", t.CDF = "cdf", t.CHE = "che", t.CHF = "chf", t.CHW = "chw", t.CLF = "clf", t.CLP = "clp", t.CNY = "cny", t.COP = "cop", t.COU = "cou", t.CRC = "crc", t.CUC = "cuc", t.CUP = "cup", t.CVE = "cve", t.CZK = "czk", t.DJF = "djf", t.DKK = "dkk", t.DOP = "dop", t.DZD = "dzd", t.EGP = "egp", t.ERN = "ern", t.ETB = "etb", t.EUR = "eur", t.FJD = "fjd", t.FKP = "fkp", t.GBP = "gbp", t.GEL = "gel", t.GHS = "ghs", t.GIP = "gip", t.GMD = "gmd", t.GNF = "gnf", t.GTQ = "gtq", t.GYD = "gyd", t.HKD = "hkd", t.HNL = "hnl", t.HRK = "hrk", t.HTG = "htg", t.HUF = "huf", t.IDR = "idr", t.ILS = "ils", t.INR = "inr", t.IQD = "iqd", t.IRR = "irr", t.ISK = "isk", t.JMD = "jmd", t.JOD = "jod", t.JPY = "jpy", t.KES = "kes", t.KGS = "kgs", t.KHR = "khr", t.KMF = "kmf", t.KPW = "kpw", t.KRW = "krw", t.KWD = "kwd", t.KYD = "kyd", t.KZT = "kzt", t.LAK = "lak", t.LBP = "lbp", t.LKR = "lkr", t.LRD = "lrd", t.LSL = "lsl", t.LTL = "ltl", t.LVL = "lvl", t.LYD = "lyd", t.MAD = "mad", t.MDL = "mdl", t.MGA = "mga", t.MKD = "mkd", t.MMK = "mmk", t.MNT = "mnt", t.MOP = "mop", t.MRO = "mro", t.MUR = "mur", t.MVR = "mvr", t.MWK = "mwk", t.MXN = "mxn", t.MXV = "mxv", t.MYR = "myr", t.MZN = "mzn", t.NAD = "nad", t.NGN = "ngn", t.NIO = "nio", t.NOK = "nok", t.NPR = "npr", t.NZD = "nzd", t.OMR = "omr", t.PAB = "pab", t.PEN = "pen", t.PGK = "pgk", t.PHP = "php", t.PKR = "pkr", t.PLN = "pln", t.PYG = "pyg", t.QAR = "qar", t.RON = "ron", t.RSD = "rsd", t.RUB = "rub", t.RWF = "rwf", t.SAR = "sar", t.SBD = "sbd", t.SCR = "scr", t.SDG = "sdg", t.SEK = "sek", t.SGD = "sgd", t.SHP = "shp", t.SLL = "sll", t.SOS = "sos", t.SRD = "srd", t.SSP = "ssp", t.STD = "std", t.SVC = "svc", t.SYP = "syp", t.SZL = "szl", t.THB = "thb", t.TJS = "tjs", t.TMT = "tmt", t.TND = "tnd", t.TOP = "top", t.TRY = "try", t.TTD = "ttd", t.TWD = "twd", t.TZS = "tzs", t.UAH = "uah", t.UGX = "ugx", t.USD = "usd", t.USN = "usn", t.USS = "uss", t.UYI = "uyi", t.UYU = "uyu", t.UZS = "uzs", t.VEF = "vef", t.VND = "vnd", t.VUV = "vuv", t.WST = "wst", t.XAF = "xaf", t.XAG = "xag", t.XAU = "xau", t.XBA = "xba", t.XBB = "xbb", t.XBC = "xbc", t.XBD = "xbd", t.XCD = "xcd", t.XDR = "xdr", t.XFU = "xfu", t.XOF = "xof", t.XPD = "xpd", t.XPF = "xpf", t.XPT = "xpt", t.XSU = "xsu", t.XTS = "xts", t.XUA = "xua", t.YER = "yer", t.ZAR = "zar", t.ZMW = "zmw", t.ZWL = "zwl";
})(v || (v = {}));
v.AED + "", v.AFN + "", v.ALL + "", v.AMD + "", v.ANG + "", v.AOA + "", v.ARS + "", v.AUD + "", v.AWG + "", v.AZN + "", v.BAM + "", v.BBD + "", v.BDT + "", v.BGN + "", v.BHD + "", v.BIF + "", v.BMD + "", v.BND + "", v.BOB + "", v.BOV + "", v.BRL + "", v.BSD + "", v.BTN + "", v.BWP + "", v.BYR + "", v.BYN + "", v.BZD + "", v.CAD + "", v.CDF + "", v.CHE + "", v.CHF + "", v.CHW + "", v.CLF + "", v.CLP + "", v.CNY + "", v.COP + "", v.COU + "", v.CRC + "", v.CUC + "", v.CUP + "", v.CVE + "", v.CZK + "", v.DJF + "", v.DKK + "", v.DOP + "", v.DZD + "", v.EGP + "", v.ERN + "", v.ETB + "", v.EUR + "", v.FJD + "", v.FKP + "", v.GBP + "", v.GEL + "", v.GHS + "", v.GIP + "", v.GMD + "", v.GNF + "", v.GTQ + "", v.GYD + "", v.HKD + "", v.HNL + "", v.HRK + "", v.HTG + "", v.HUF + "", v.IDR + "", v.ILS + "", v.INR + "", v.IQD + "", v.IRR + "", v.ISK + "", v.JMD + "", v.JOD + "", v.JPY + "", v.KES + "", v.KGS + "", v.KHR + "", v.KMF + "", v.KPW + "", v.KRW + "", v.KWD + "", v.KYD + "", v.KZT + "", v.LAK + "", v.LBP + "", v.LKR + "", v.LRD + "", v.LSL + "", v.LTL + "", v.LVL + "", v.LYD + "", v.MAD + "", v.MDL + "", v.MGA + "", v.MKD + "", v.MMK + "", v.MNT + "", v.MOP + "", v.MRO + "", v.MUR + "", v.MVR + "", v.MWK + "", v.MXN + "", v.MXV + "", v.MYR + "", v.MZN + "", v.NAD + "", v.NGN + "", v.NIO + "", v.NOK + "", v.NPR + "", v.NZD + "", v.OMR + "", v.PAB + "", v.PEN + "", v.PGK + "", v.PHP + "", v.PKR + "", v.PLN + "", v.PYG + "", v.QAR + "", v.RON + "", v.RSD + "", v.RUB + "", v.RWF + "", v.SAR + "", v.SBD + "", v.SCR + "", v.SDG + "", v.SEK + "", v.SGD + "", v.SHP + "", v.SLL + "", v.SOS + "", v.SRD + "", v.SSP + "", v.STD + "", v.SVC + "", v.SYP + "", v.SZL + "", v.THB + "", v.TJS + "", v.TMT + "", v.TND + "", v.TOP + "", v.TRY + "", v.TTD + "", v.TWD + "", v.TZS + "", v.UAH + "", v.UGX + "", v.USD + "", v.USN + "", v.USS + "", v.UYI + "", v.UYU + "", v.UZS + "", v.VEF + "", v.VND + "", v.VUV + "", v.WST + "", v.XAF + "", v.XAG + "", v.XAU + "", v.XBA + "", v.XBB + "", v.XBC + "", v.XBD + "", v.XCD + "", v.XDR + "", v.XFU + "", v.XOF + "", v.XPD + "", v.XPF + "", v.XPT + "", v.XSU + "", v.XTS + "", v.XUA + "", v.YER + "", v.ZAR + "", v.ZMW + "", v.ZWL + "";
var fn = { exports: {} };
fn.exports;
var wi;
function Au() {
  return wi || (wi = 1, function(t, e) {
    var n = 200, r = "Expected a function", i = "__lodash_hash_undefined__", s = 1, u = 2, c = 1 / 0, g = 9007199254740991, f = "[object Arguments]", d = "[object Array]", _ = "[object Boolean]", A = "[object Date]", k = "[object Error]", X = "[object Function]", V = "[object GeneratorFunction]", D = "[object Map]", pe = "[object Number]", re = "[object Object]", se = "[object Promise]", Ie = "[object RegExp]", ge = "[object Set]", Ge = "[object String]", Te = "[object Symbol]", Me = "[object WeakMap]", je = "[object ArrayBuffer]", Ze = "[object DataView]", Se = "[object Float32Array]", oe = "[object Float64Array]", mr = "[object Int8Array]", xn = "[object Int16Array]", Pn = "[object Int32Array]", vr = "[object Uint8Array]", Er = "[object Uint8ClampedArray]", kn = "[object Uint16Array]", nt = "[object Uint32Array]", rt = /\.|\[(?:[^[\]]*|(["'])(?:(?!\1)[^\\]|\\.)*?\1)\]/, Mn = /^\w*$/, nn = /^\./, Ke = /[^.[\]]+|\[(?:(-?\d+(?:\.\d+)?)|(["'])((?:(?!\2)[^\\]|\\.)*?)\2)\]|(?=(?:\.|\[\])(?:\.|\[\]|$))/g, St = /[\\^$.*+?()[\]{}|]/g, it = /\\(\\)?/g, Ln = /^\[object .+?Constructor\]$/, rn = /^(?:0|[1-9]\d*)$/, ae = {};
    ae[Se] = ae[oe] = ae[mr] = ae[xn] = ae[Pn] = ae[vr] = ae[Er] = ae[kn] = ae[nt] = !0, ae[f] = ae[d] = ae[je] = ae[_] = ae[Ze] = ae[A] = ae[k] = ae[X] = ae[D] = ae[pe] = ae[re] = ae[Ie] = ae[ge] = ae[Ge] = ae[Me] = !1;
    var Un = typeof er == "object" && er && er.Object === Object && er, Zt = typeof self == "object" && self && self.Object === Object && self, qe = Un || Zt || Function("return this")(), sn = e && !e.nodeType && e, Vt = sn && !0 && t && !t.nodeType && t, Bn = Vt && Vt.exports === sn, Gn = Bn && Un.process, Zn = function() {
      try {
        return Gn && Gn.binding("util");
      } catch {
      }
    }(), Vn = Zn && Zn.isTypedArray;
    function Hn(o, p) {
      for (var b = -1, O = o ? o.length : 0; ++b < O && p(o[b], b, o) !== !1; )
        ;
      return o;
    }
    function yr(o, p) {
      for (var b = -1, O = o ? o.length : 0; ++b < O; )
        if (p(o[b], b, o))
          return !0;
      return !1;
    }
    function Ot(o) {
      return function(p) {
        return p == null ? void 0 : p[o];
      };
    }
    function Fn(o, p) {
      for (var b = -1, O = Array(o); ++b < o; )
        O[b] = p(b);
      return O;
    }
    function jn(o) {
      return function(p) {
        return o(p);
      };
    }
    function Tr(o, p) {
      return o == null ? void 0 : o[p];
    }
    function F(o) {
      var p = !1;
      if (o != null && typeof o.toString != "function")
        try {
          p = !!(o + "");
        } catch {
        }
      return p;
    }
    function st(o) {
      var p = -1, b = Array(o.size);
      return o.forEach(function(O, z) {
        b[++p] = [z, O];
      }), b;
    }
    function a(o, p) {
      return function(b) {
        return o(p(b));
      };
    }
    function l(o) {
      var p = -1, b = Array(o.size);
      return o.forEach(function(O) {
        b[++p] = O;
      }), b;
    }
    var h = Array.prototype, E = Function.prototype, T = Object.prototype, y = qe["__core-js_shared__"], N = function() {
      var o = /[^.]+$/.exec(y && y.keys && y.keys.IE_PROTO || "");
      return o ? "Symbol(src)_1." + o : "";
    }(), w = E.toString, I = T.hasOwnProperty, H = T.toString, J = RegExp(
      "^" + w.call(I).replace(St, "\\$&").replace(/hasOwnProperty|(function).*?(?=\\\()| for .+?(?=\\\])/g, "$1.*?") + "$"
    ), $ = qe.Symbol, ne = qe.Uint8Array, Oe = a(Object.getPrototypeOf, Object), be = Object.create, an = T.propertyIsEnumerable, on = h.splice, _s = a(Object.keys, Object), br = Ht(qe, "DataView"), ln = Ht(qe, "Map"), Ar = Ht(qe, "Promise"), Nr = Ht(qe, "Set"), wr = Ht(qe, "WeakMap"), un = Ht(Object, "create"), ms = Dt(br), vs = Dt(ln), Es = Dt(Ar), ys = Dt(Nr), Ts = Dt(wr), Kn = $ ? $.prototype : void 0, Ir = Kn ? Kn.valueOf : void 0, ti = Kn ? Kn.toString : void 0;
    function Rt(o) {
      var p = -1, b = o ? o.length : 0;
      for (this.clear(); ++p < b; ) {
        var O = o[p];
        this.set(O[0], O[1]);
      }
    }
    function bs() {
      this.__data__ = un ? un(null) : {};
    }
    function As(o) {
      return this.has(o) && delete this.__data__[o];
    }
    function Ns(o) {
      var p = this.__data__;
      if (un) {
        var b = p[o];
        return b === i ? void 0 : b;
      }
      return I.call(p, o) ? p[o] : void 0;
    }
    function ws(o) {
      var p = this.__data__;
      return un ? p[o] !== void 0 : I.call(p, o);
    }
    function Is(o, p) {
      var b = this.__data__;
      return b[o] = un && p === void 0 ? i : p, this;
    }
    Rt.prototype.clear = bs, Rt.prototype.delete = As, Rt.prototype.get = Ns, Rt.prototype.has = ws, Rt.prototype.set = Is;
    function at(o) {
      var p = -1, b = o ? o.length : 0;
      for (this.clear(); ++p < b; ) {
        var O = o[p];
        this.set(O[0], O[1]);
      }
    }
    function Ss() {
      this.__data__ = [];
    }
    function Os(o) {
      var p = this.__data__, b = Yn(p, o);
      if (b < 0)
        return !1;
      var O = p.length - 1;
      return b == O ? p.pop() : on.call(p, b, 1), !0;
    }
    function Rs(o) {
      var p = this.__data__, b = Yn(p, o);
      return b < 0 ? void 0 : p[b][1];
    }
    function Ds(o) {
      return Yn(this.__data__, o) > -1;
    }
    function xs(o, p) {
      var b = this.__data__, O = Yn(b, o);
      return O < 0 ? b.push([o, p]) : b[O][1] = p, this;
    }
    at.prototype.clear = Ss, at.prototype.delete = Os, at.prototype.get = Rs, at.prototype.has = Ds, at.prototype.set = xs;
    function ot(o) {
      var p = -1, b = o ? o.length : 0;
      for (this.clear(); ++p < b; ) {
        var O = o[p];
        this.set(O[0], O[1]);
      }
    }
    function Ps() {
      this.__data__ = {
        hash: new Rt(),
        map: new (ln || at)(),
        string: new Rt()
      };
    }
    function ks(o) {
      return $n(this, o).delete(o);
    }
    function Ms(o) {
      return $n(this, o).get(o);
    }
    function Ls(o) {
      return $n(this, o).has(o);
    }
    function Us(o, p) {
      return $n(this, o).set(o, p), this;
    }
    ot.prototype.clear = Ps, ot.prototype.delete = ks, ot.prototype.get = Ms, ot.prototype.has = Ls, ot.prototype.set = Us;
    function qn(o) {
      var p = -1, b = o ? o.length : 0;
      for (this.__data__ = new ot(); ++p < b; )
        this.add(o[p]);
    }
    function Bs(o) {
      return this.__data__.set(o, i), this;
    }
    function Gs(o) {
      return this.__data__.has(o);
    }
    qn.prototype.add = qn.prototype.push = Bs, qn.prototype.has = Gs;
    function lt(o) {
      this.__data__ = new at(o);
    }
    function Zs() {
      this.__data__ = new at();
    }
    function Vs(o) {
      return this.__data__.delete(o);
    }
    function Hs(o) {
      return this.__data__.get(o);
    }
    function Fs(o) {
      return this.__data__.has(o);
    }
    function js(o, p) {
      var b = this.__data__;
      if (b instanceof at) {
        var O = b.__data__;
        if (!ln || O.length < n - 1)
          return O.push([o, p]), this;
        b = this.__data__ = new ot(O);
      }
      return b.set(o, p), this;
    }
    lt.prototype.clear = Zs, lt.prototype.delete = Vs, lt.prototype.get = Hs, lt.prototype.has = Fs, lt.prototype.set = js;
    function Ks(o, p) {
      var b = ut(o) || ui(o) ? Fn(o.length, String) : [], O = b.length, z = !!O;
      for (var U in o)
        I.call(o, U) && !(z && (U == "length" || si(U, O))) && b.push(U);
      return b;
    }
    function Yn(o, p) {
      for (var b = o.length; b--; )
        if (li(o[b][0], p))
          return b;
      return -1;
    }
    function qs(o) {
      return Ft(o) ? be(o) : {};
    }
    var Ys = aa();
    function $s(o, p) {
      return o && Ys(o, p, Wn);
    }
    function ni(o, p) {
      p = zn(p, o) ? [p] : ri(p);
      for (var b = 0, O = p.length; o != null && b < O; )
        o = o[Cn(p[b++])];
      return b && b == O ? o : void 0;
    }
    function zs(o) {
      return H.call(o);
    }
    function Cs(o, p) {
      return o != null && p in Object(o);
    }
    function Sr(o, p, b, O, z) {
      return o === p ? !0 : o == null || p == null || !Ft(o) && !Xn(p) ? o !== o && p !== p : Xs(o, p, Sr, b, O, z);
    }
    function Xs(o, p, b, O, z, U) {
      var Q = ut(o), he = ut(p), fe = d, Ae = d;
      Q || (fe = _t(o), fe = fe == f ? re : fe), he || (Ae = _t(p), Ae = Ae == f ? re : Ae);
      var xe = fe == re && !F(o), Pe = Ae == re && !F(p), Re = fe == Ae;
      if (Re && !xe)
        return U || (U = new lt()), Q || di(o) ? ii(o, p, b, O, z, U) : oa(o, p, fe, b, O, z, U);
      if (!(z & u)) {
        var Ve = xe && I.call(o, "__wrapped__"), He = Pe && I.call(p, "__wrapped__");
        if (Ve || He) {
          var mt = Ve ? o.value() : o, ct = He ? p.value() : p;
          return U || (U = new lt()), b(mt, ct, O, z, U);
        }
      }
      return Re ? (U || (U = new lt()), la(o, p, b, O, z, U)) : !1;
    }
    function Ws(o, p, b, O) {
      var z = b.length, U = z;
      if (o == null)
        return !U;
      for (o = Object(o); z--; ) {
        var Q = b[z];
        if (Q[2] ? Q[1] !== o[Q[0]] : !(Q[0] in o))
          return !1;
      }
      for (; ++z < U; ) {
        Q = b[z];
        var he = Q[0], fe = o[he], Ae = Q[1];
        if (Q[2]) {
          if (fe === void 0 && !(he in o))
            return !1;
        } else {
          var xe = new lt(), Pe;
          if (!(Pe === void 0 ? Sr(Ae, fe, O, s | u, xe) : Pe))
            return !1;
        }
      }
      return !0;
    }
    function Qs(o) {
      if (!Ft(o) || fa(o))
        return !1;
      var p = Rr(o) || F(o) ? J : Ln;
      return p.test(Dt(o));
    }
    function Js(o) {
      return Xn(o) && Dr(o.length) && !!ae[H.call(o)];
    }
    function ea(o) {
      return typeof o == "function" ? o : o == null ? ya : typeof o == "object" ? ut(o) ? ra(o[0], o[1]) : na(o) : Ta(o);
    }
    function ta(o) {
      if (!pa(o))
        return _s(o);
      var p = [];
      for (var b in Object(o))
        I.call(o, b) && b != "constructor" && p.push(b);
      return p;
    }
    function na(o) {
      var p = ua(o);
      return p.length == 1 && p[0][2] ? oi(p[0][0], p[0][1]) : function(b) {
        return b === o || Ws(b, o, p);
      };
    }
    function ra(o, p) {
      return zn(o) && ai(p) ? oi(Cn(o), p) : function(b) {
        var O = ma(b, o);
        return O === void 0 && O === p ? va(b, o) : Sr(p, O, void 0, s | u);
      };
    }
    function ia(o) {
      return function(p) {
        return ni(p, o);
      };
    }
    function sa(o) {
      if (typeof o == "string")
        return o;
      if (xr(o))
        return ti ? ti.call(o) : "";
      var p = o + "";
      return p == "0" && 1 / o == -c ? "-0" : p;
    }
    function ri(o) {
      return ut(o) ? o : ha(o);
    }
    function aa(o) {
      return function(p, b, O) {
        for (var z = -1, U = Object(p), Q = O(p), he = Q.length; he--; ) {
          var fe = Q[++z];
          if (b(U[fe], fe, U) === !1)
            break;
        }
        return p;
      };
    }
    function ii(o, p, b, O, z, U) {
      var Q = z & u, he = o.length, fe = p.length;
      if (he != fe && !(Q && fe > he))
        return !1;
      var Ae = U.get(o);
      if (Ae && U.get(p))
        return Ae == p;
      var xe = -1, Pe = !0, Re = z & s ? new qn() : void 0;
      for (U.set(o, p), U.set(p, o); ++xe < he; ) {
        var Ve = o[xe], He = p[xe];
        if (O)
          var mt = Q ? O(He, Ve, xe, p, o, U) : O(Ve, He, xe, o, p, U);
        if (mt !== void 0) {
          if (mt)
            continue;
          Pe = !1;
          break;
        }
        if (Re) {
          if (!yr(p, function(ct, xt) {
            if (!Re.has(xt) && (Ve === ct || b(Ve, ct, O, z, U)))
              return Re.add(xt);
          })) {
            Pe = !1;
            break;
          }
        } else if (!(Ve === He || b(Ve, He, O, z, U))) {
          Pe = !1;
          break;
        }
      }
      return U.delete(o), U.delete(p), Pe;
    }
    function oa(o, p, b, O, z, U, Q) {
      switch (b) {
        case Ze:
          if (o.byteLength != p.byteLength || o.byteOffset != p.byteOffset)
            return !1;
          o = o.buffer, p = p.buffer;
        case je:
          return !(o.byteLength != p.byteLength || !O(new ne(o), new ne(p)));
        case _:
        case A:
        case pe:
          return li(+o, +p);
        case k:
          return o.name == p.name && o.message == p.message;
        case Ie:
        case Ge:
          return o == p + "";
        case D:
          var he = st;
        case ge:
          var fe = U & u;
          if (he || (he = l), o.size != p.size && !fe)
            return !1;
          var Ae = Q.get(o);
          if (Ae)
            return Ae == p;
          U |= s, Q.set(o, p);
          var xe = ii(he(o), he(p), O, z, U, Q);
          return Q.delete(o), xe;
        case Te:
          if (Ir)
            return Ir.call(o) == Ir.call(p);
      }
      return !1;
    }
    function la(o, p, b, O, z, U) {
      var Q = z & u, he = Wn(o), fe = he.length, Ae = Wn(p), xe = Ae.length;
      if (fe != xe && !Q)
        return !1;
      for (var Pe = fe; Pe--; ) {
        var Re = he[Pe];
        if (!(Q ? Re in p : I.call(p, Re)))
          return !1;
      }
      var Ve = U.get(o);
      if (Ve && U.get(p))
        return Ve == p;
      var He = !0;
      U.set(o, p), U.set(p, o);
      for (var mt = Q; ++Pe < fe; ) {
        Re = he[Pe];
        var ct = o[Re], xt = p[Re];
        if (O)
          var fi = Q ? O(xt, ct, Re, p, o, U) : O(ct, xt, Re, o, p, U);
        if (!(fi === void 0 ? ct === xt || b(ct, xt, O, z, U) : fi)) {
          He = !1;
          break;
        }
        mt || (mt = Re == "constructor");
      }
      if (He && !mt) {
        var Qn = o.constructor, Jn = p.constructor;
        Qn != Jn && "constructor" in o && "constructor" in p && !(typeof Qn == "function" && Qn instanceof Qn && typeof Jn == "function" && Jn instanceof Jn) && (He = !1);
      }
      return U.delete(o), U.delete(p), He;
    }
    function $n(o, p) {
      var b = o.__data__;
      return da(p) ? b[typeof p == "string" ? "string" : "hash"] : b.map;
    }
    function ua(o) {
      for (var p = Wn(o), b = p.length; b--; ) {
        var O = p[b], z = o[O];
        p[b] = [O, z, ai(z)];
      }
      return p;
    }
    function Ht(o, p) {
      var b = Tr(o, p);
      return Qs(b) ? b : void 0;
    }
    var _t = zs;
    (br && _t(new br(new ArrayBuffer(1))) != Ze || ln && _t(new ln()) != D || Ar && _t(Ar.resolve()) != se || Nr && _t(new Nr()) != ge || wr && _t(new wr()) != Me) && (_t = function(o) {
      var p = H.call(o), b = p == re ? o.constructor : void 0, O = b ? Dt(b) : void 0;
      if (O)
        switch (O) {
          case ms:
            return Ze;
          case vs:
            return D;
          case Es:
            return se;
          case ys:
            return ge;
          case Ts:
            return Me;
        }
      return p;
    });
    function ca(o, p, b) {
      p = zn(p, o) ? [p] : ri(p);
      for (var O, z = -1, Q = p.length; ++z < Q; ) {
        var U = Cn(p[z]);
        if (!(O = o != null && b(o, U)))
          break;
        o = o[U];
      }
      if (O)
        return O;
      var Q = o ? o.length : 0;
      return !!Q && Dr(Q) && si(U, Q) && (ut(o) || ui(o));
    }
    function si(o, p) {
      return p = p ?? g, !!p && (typeof o == "number" || rn.test(o)) && o > -1 && o % 1 == 0 && o < p;
    }
    function zn(o, p) {
      if (ut(o))
        return !1;
      var b = typeof o;
      return b == "number" || b == "symbol" || b == "boolean" || o == null || xr(o) ? !0 : Mn.test(o) || !rt.test(o) || p != null && o in Object(p);
    }
    function da(o) {
      var p = typeof o;
      return p == "string" || p == "number" || p == "symbol" || p == "boolean" ? o !== "__proto__" : o === null;
    }
    function fa(o) {
      return !!N && N in o;
    }
    function pa(o) {
      var p = o && o.constructor, b = typeof p == "function" && p.prototype || T;
      return o === b;
    }
    function ai(o) {
      return o === o && !Ft(o);
    }
    function oi(o, p) {
      return function(b) {
        return b == null ? !1 : b[o] === p && (p !== void 0 || o in Object(b));
      };
    }
    var ha = Or(function(o) {
      o = _a(o);
      var p = [];
      return nn.test(o) && p.push(""), o.replace(Ke, function(b, O, z, U) {
        p.push(z ? U.replace(it, "$1") : O || b);
      }), p;
    });
    function Cn(o) {
      if (typeof o == "string" || xr(o))
        return o;
      var p = o + "";
      return p == "0" && 1 / o == -c ? "-0" : p;
    }
    function Dt(o) {
      if (o != null) {
        try {
          return w.call(o);
        } catch {
        }
        try {
          return o + "";
        } catch {
        }
      }
      return "";
    }
    function Or(o, p) {
      if (typeof o != "function" || p && typeof p != "function")
        throw new TypeError(r);
      var b = function() {
        var O = arguments, z = p ? p.apply(this, O) : O[0], U = b.cache;
        if (U.has(z))
          return U.get(z);
        var Q = o.apply(this, O);
        return b.cache = U.set(z, Q), Q;
      };
      return b.cache = new (Or.Cache || ot)(), b;
    }
    Or.Cache = ot;
    function li(o, p) {
      return o === p || o !== o && p !== p;
    }
    function ui(o) {
      return ga(o) && I.call(o, "callee") && (!an.call(o, "callee") || H.call(o) == f);
    }
    var ut = Array.isArray;
    function ci(o) {
      return o != null && Dr(o.length) && !Rr(o);
    }
    function ga(o) {
      return Xn(o) && ci(o);
    }
    function Rr(o) {
      var p = Ft(o) ? H.call(o) : "";
      return p == X || p == V;
    }
    function Dr(o) {
      return typeof o == "number" && o > -1 && o % 1 == 0 && o <= g;
    }
    function Ft(o) {
      var p = typeof o;
      return !!o && (p == "object" || p == "function");
    }
    function Xn(o) {
      return !!o && typeof o == "object";
    }
    function xr(o) {
      return typeof o == "symbol" || Xn(o) && H.call(o) == Te;
    }
    var di = Vn ? jn(Vn) : Js;
    function _a(o) {
      return o == null ? "" : sa(o);
    }
    function ma(o, p, b) {
      var O = o == null ? void 0 : ni(o, p);
      return O === void 0 ? b : O;
    }
    function va(o, p) {
      return o != null && ca(o, p, Cs);
    }
    function Wn(o) {
      return ci(o) ? Ks(o) : ta(o);
    }
    function Ea(o, p, b) {
      var O = ut(o) || di(o);
      if (p = ea(p), b == null)
        if (O || Ft(o)) {
          var z = o.constructor;
          O ? b = ut(o) ? new z() : [] : b = Rr(z) ? qs(Oe(o)) : {};
        } else
          b = {};
      return (O ? Hn : $s)(o, function(U, Q, he) {
        return p(b, U, Q, he);
      }), b;
    }
    function ya(o) {
      return o;
    }
    function Ta(o) {
      return zn(o) ? Ot(Cn(o)) : ia(o);
    }
    t.exports = Ea;
  }(fn, fn.exports)), fn.exports;
}
Au();
var Kt = /* @__PURE__ */ ((t) => (t[t.None = 0] = "None", t[t.Initializing = 1] = "Initializing", t[t.WaitingForServer = 2] = "WaitingForServer", t[t.Connected = 4] = "Connected", t[t.Disconnected = 8] = "Disconnected", t[t.Error = 16] = "Error", t[t.Reconnecting = 32] = "Reconnecting", t[t.Listening = 64] = "Listening", t[t.Paused = 128] = "Paused", t[t.Closing = 256] = "Closing", t[t.Retrying = 512] = "Retrying", t[t.Suspended = 1024] = "Suspended", t[t.Authenticated = 2048] = "Authenticated", t[t.Unsubscribed = 4096] = "Unsubscribed", t[t.PendingData = 8192] = "PendingData", t[t.Timeout = 16384] = "Timeout", t[t.ReceivingHandshake = 32768] = "ReceivingHandshake", t[t.HeartbeatFailure = 65536] = "HeartbeatFailure", t[t.Resuming = 131072] = "Resuming", t[t.RateLimited = 262144] = "RateLimited", t[t.Buffered = 524288] = "Buffered", t[t.WaitingForReconnect = 1048576] = "WaitingForReconnect", t[t.SendingData = 2097152] = "SendingData", t[t.ReceivingData = 4194304] = "ReceivingData", t[t.Overloaded = 8388608] = "Overloaded", t[t.Validating = 16777216] = "Validating", t[t.Queued = 33554432] = "Queued", t[t.Syncing = 67108864] = "Syncing", t[t.Expired = 134217728] = "Expired", t[t.Degraded = 268435456] = "Degraded", t[t.ShuttingDown = 536870912] = "ShuttingDown", t[t.MaintenanceMode = 1073741824] = "MaintenanceMode", t[t.CriticalFailure = -2147483648] = "CriticalFailure", t))(Kt || {}), qr = /* @__PURE__ */ ((t) => (t[t.None = 0] = "None", t[t.Text = 1] = "Text", t[t.JSON = 2] = "JSON", t[t.Binary = 4] = "Binary", t[t.Command = 8] = "Command", t[t.Event = 16] = "Event", t[t.Error = 32] = "Error", t[t.Notification = 64] = "Notification", t[t.Authentication = 128] = "Authentication", t[t.Configuration = 256] = "Configuration", t[t.Sync = 512] = "Sync", t[t.Heartbeat = 1024] = "Heartbeat", t[t.Purge = 2048] = "Purge", t))(qr || {});
const kt = class kt {
  constructor(e) {
    this.discordSdk = null, this.user = null, this.state = Kt.None, this.helper = e;
  }
  static getInstance(e) {
    return kt.instance || (kt.instance = new kt(e)), kt.instance;
  }
  async initialize(e) {
    if (this.discordSdk) {
      console.warn("DiscordSDK is already initialized.");
      return;
    }
    try {
      this.state = Kt.Initializing, this.discordSdk = new Eu(e.clientId), await this.discordSdk.ready(), this.state = Kt.Connected;
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
      case qr.Command:
        this.processCommandMessage(e);
        break;
      case qr.Notification:
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
kt.instance = null;
let Ii = kt;
export {
  Ii as DiscordSDKManager,
  Nu as Help,
  Sa as getNestedIFrame,
  Aa as safeParse,
  Na as safeStringify,
  Ia as stringToUtf8,
  ba as stringifyBigInt,
  wa as utf8ToString
};
//# sourceMappingURL=discord-sdk-manager.es.js.map
