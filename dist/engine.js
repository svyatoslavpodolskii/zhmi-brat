// A deliberately small Excel interpreter. Formula text comes verbatim from the workbook.
export class CalcError extends Error {
  constructor(message, cell) {
    super(message);
    this.cell = cell;
  }
}
export const colNum = (s) =>
  [...s.replace(/\$/g, "")].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);
export function colName(n) {
  let s = "";
  for (; n; n = Math.floor((n - 1) / 26))
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}
export const mround = (n, s) => {
  if (!s) return 0;
  if (n * s < 0) throw new CalcError("Разные знаки у числа и шага");
  return Math.sign(n) * Math.floor(Math.abs(n / s) + 0.5 + 1e-10) * Math.abs(s);
};
const asts = new Map();
function parse(text) {
  if (asts.has(text)) return asts.get(text);
  const tokens = [];
  let p = 0;
  const re =
    /\s*(?:("(?:[^"]|"")*")|((?:'(?:[^']|'')*'|[A-Za-zА-Яа-яЁё_][A-Za-zА-Яа-яЁё_ 0-9]*)!\$?[A-Z]+\$?\d+(?::\$?[A-Z]+\$?\d+)?|\$?[A-Z]+\$?\d+(?::\$?[A-Z]+\$?\d+)?)|(\d+(?:\.\d+)?(?:[Ee][+-]?\d+)?)|([A-Z_][A-Z_0-9.]*)|(<>|<=|>=|[=<>+*/^&(),%{};-]))/gy;
  while (p < text.length) {
    re.lastIndex = p;
    const m = re.exec(text);
    if (!m) throw new CalcError("Неизвестный синтаксис: " + text.slice(p));
    p = re.lastIndex;
    tokens.push(
      m[1]
        ? { t: "str", v: m[1].slice(1, -1).replace(/""/g, '"') }
        : m[2]
          ? { t: "ref", v: m[2] }
          : m[3]
            ? { t: "num", v: Number(m[3]) }
            : m[4]
              ? { t: "id", v: m[4] }
              : { t: m[5] },
    );
  }
  let at = 0;
  const peek = () => tokens[at]?.t;
  const take = (t) => {
    const v = tokens[at++];
    if (t && v?.t !== t) throw new CalcError("Ожидалось " + t);
    return v;
  };
  const precedence = {
    "=": 1,
    "<>": 1,
    "<": 1,
    ">": 1,
    "<=": 1,
    ">=": 1,
    "&": 2,
    "+": 3,
    "-": 3,
    "*": 4,
    "/": 4,
    "^": 5,
  };
  function expr(min = 0) {
    let n;
    const t = take();
    if (!t) throw new CalcError("Пустая формула");
    if (t.t === "-" || t.t === "+") n = { t: "unary", op: t.t, a: expr(6) };
    else if (t.t === "(") {
      n = expr();
      take(")");
    } else if (t.t === "id" && peek() === "(") {
      take("(");
      const args = [];
      if (peek() !== ")")
        do {
          args.push(expr());
          if (peek() !== ",") break;
          take(",");
        } while (true);
      take(")");
      n = { t: "call", name: t.v, args };
    } else n = t;
    while (peek() === "%") {
      take("%");
      n = { t: "binary", op: "/", a: n, b: { t: "num", v: 100 } };
    }
    while (precedence[peek()] >= min) {
      const op = take().t;
      n = { t: "binary", op, a: n, b: expr(precedence[op] + 1) };
    }
    return n;
  }
  const ast = expr();
  if (at !== tokens.length) throw new CalcError("Лишние символы в формуле");
  asts.set(text, ast);
  return ast;
}
export class WorkbookEngine {
  constructor(data, overrides = {}, strict = true) {
    this.data = data;
    this.overrides = overrides;
    this.strict = strict;
    this.cache = new Map();
    this.active = new Set();
  }
  cell(sheet, addr) {
    addr = addr.replace(/\$/g, "");
    const key = sheet + "!" + addr;
    if (this.cache.has(key)) return this.cache.get(key);
    if (this.active.has(key)) throw new CalcError("Циклическая ссылка", key);
    this.active.add(key);
    try {
      let v;
      if (Object.hasOwn(this.overrides, key)) v = this.overrides[key];
      else {
        const c = this.data.sheets.find((s) => s.name === sheet)?.cells[addr];
        v = c?.f ? this.eval(parse(c.f), sheet) : (c?.v ?? null);
      }
      this.cache.set(key, v);
      return v;
    } catch (e) {
      if (!e.cell) e.cell = key;
      throw e;
    } finally {
      this.active.delete(key);
    }
  }
  get(sheet, addr) {
    try {
      return { value: this.cell(sheet, addr) };
    } catch (e) {
      return { value: null, error: e.message, cell: e.cell };
    }
  }
  num(v) {
    if (v === null || v === "") {
      if (this.strict)
        throw new CalcError("Нужен результат предыдущего подхода или теста");
      return 0;
    }
    const n = Number(v);
    if (!Number.isFinite(n)) throw new CalcError("Ожидалось число");
    return n;
  }
  eval(n, s) {
    if (n.t === "num" || n.t === "str") return n.v;
    if (n.t === "id") {
      if (n.v === "FALSE") return false;
      if (n.v === "TRUE") return true;
      throw new CalcError("Неизвестное имя " + n.v);
    }
    if (n.t === "ref") {
      let ref = n.v,
        sheet = s;
      if (ref.includes("!")) {
        const i = ref.lastIndexOf("!");
        sheet = ref.slice(0, i).replace(/^'|'$/g, "").replace(/''/g, "'");
        ref = ref.slice(i + 1);
      }
      ref = ref.replace(/\$/g, "");
      if (!ref.includes(":")) return this.cell(sheet, ref);
      const [a, b] = ref.split(":").map((x) => x.match(/([A-Z]+)(\d+)/));
      return {
        range: true,
        sheet,
        c1: colNum(a[1]),
        c2: colNum(b[1]),
        r1: +a[2],
        r2: +b[2],
      };
    }
    if (n.t === "unary")
      return (n.op === "-" ? -1 : 1) * this.num(this.eval(n.a, s));
    if (n.t === "binary") {
      const a = this.eval(n.a, s),
        b = this.eval(n.b, s);
      if (n.op === "&") return String(a ?? "") + String(b ?? "");
      if (["=", "<>", "<", ">", "<=", ">="].includes(n.op)) {
        const aa = a ?? 0,
          bb = b ?? 0;
        switch (n.op) {
          case "=":
            return aa === bb;
          case "<>":
            return aa !== bb;
          case "<":
            return aa < bb;
          case ">":
            return aa > bb;
          case "<=":
            return aa <= bb;
          case ">=":
            return aa >= bb;
        }
      }
      const x = this.num(a),
        y = this.num(b);
      switch (n.op) {
        case "+":
          return x + y;
        case "-":
          return x - y;
        case "*":
          return x * y;
        case "/":
          if (!y) throw new CalcError("Деление на ноль");
          return x / y;
        case "^":
          return x ** y;
      }
    }
    if (n.t === "call") {
      if (n.name === "IF")
        return this.eval(n.args[this.eval(n.args[0], s) ? 1 : 2], s);
      const a = n.args.map((x) => this.eval(x, s));
      if (n.name === "MROUND") return mround(this.num(a[0]), this.num(a[1]));
      if (n.name === "FLOOR" || n.name === "CEILING") {
        const x = this.num(a[0]),
          step = this.num(a[1]);
        if (step <= 0) throw new CalcError("Шаг должен быть больше нуля");
        return (
          (n.name === "FLOOR"
            ? Math.floor(x / step + 1e-10)
            : Math.ceil(x / step - 1e-10)) * step
        );
      }
      if (n.name === "INDEX") {
        const r = a[0],
          ri = this.num(a[1]) - 1,
          ci = a[2] === undefined ? 0 : this.num(a[2]) - 1;
        if (
          !r?.range ||
          ri < 0 ||
          ci < 0 ||
          r.r1 + ri > r.r2 ||
          r.c1 + ci > r.c2
        )
          throw new CalcError("Индекс вне таблицы");
        return this.cell(r.sheet, colName(r.c1 + ci) + (r.r1 + ri));
      }
      if (n.name === "MATCH") {
        const [value, r] = a;
        if (value === null && this.strict)
          throw new CalcError("Укажите повторения и RPE");
        if (!r?.range) throw new CalcError("Неверный диапазон MATCH");
        let i = 1;
        for (let rr = r.r1; rr <= r.r2; rr++)
          for (let cc = r.c1; cc <= r.c2; cc++, i++) {
            if (this.cell(r.sheet, colName(cc) + rr) === value) return i;
          }
        throw new CalcError("Значение отсутствует в таблице RPE/повторений");
      }
      if (n.name === "VLOOKUP") {
        const [value, r, index] = a;
        if (!r?.range) throw new CalcError("Неверная таблица выбора");
        for (let rr = r.r1; rr <= r.r2; rr++)
          if (this.cell(r.sheet, colName(r.c1) + rr) === value)
            return this.cell(r.sheet, colName(r.c1 + this.num(index) - 1) + rr);
        throw new CalcError("Выберите упражнение из списка");
      }
      throw new CalcError("Неизвестная функция " + n.name);
    }
    throw new CalcError("Неизвестное выражение");
  }
}
