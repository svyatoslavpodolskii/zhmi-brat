import { newCode, validCode, normalizeCode } from "./rooms.js";
export const MAIN = "Программа тренировок ";
export const dayRows = [
  [154, 162, 170],
  [181, 189, 197],
  [208, 216, 224],
];
export const uid = () => crypto.randomUUID();
export const today = () =>
  new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Qyzylorda",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export function freshCycle(previous) {
  const overrides = {};
  if (previous)
    for (const [k, v] of Object.entries(previous.overrides || {}))
      if (k.startsWith(MAIN + "!B") || k.startsWith(MAIN + "!E"))
        overrides[k] = v;
  return {
    id: uid(),
    name: "Цикл " + (previous ? 2 : 1),
    createdAt: Date.now(),
    overrides,
    logs: {},
    done: [],
    dates: {},
    position: { phase: "prep", week: 0, day: 0 },
  };
}
export function initialState() {
  let saved;
  try {
    saved = JSON.parse(localStorage.getItem("zhmi:state"));
  } catch {}
  if (saved?.cycles?.length) return saved;
  const cycle = freshCycle();
  return {
    name: "Брат",
    avatar: "🦍",
    room: newCode(),
    rev: 0,
    cycles: [cycle],
    activeCycle: cycle.id,
  };
}
export function setKey(p) {
  return `${p.phase}:${p.week}:${p.day}`;
}
export function safeOverrides(data, overrides) {
  const out = {};
  const valid = new Set();
  for (const slot of data.slots) {
    for (const col of [
      "B",
      "C",
      "D",
      "E",
      "F",
      "G",
      "H",
      "I",
      "J",
      "K",
      "L",
      "M",
      "N",
      "O",
      "P",
      "Q",
      "R",
      "S",
      "T",
      "U",
      "V",
      "W",
    ])
      valid.add(MAIN + "!" + col + slot.row);
    for (const col of ["B", "C", "D"])
      valid.add(MAIN + "!" + col + slot.testRow);
  }
  for (const ds of dayRows)
    for (const start of ds)
      for (let r = start; r < start + 5; r++)
        for (const col of ["B", "F", "M", "T"]) valid.add(MAIN + "!" + col + r);
  for (const [k, v] of Object.entries(overrides || {}))
    if (
      valid.has(k) &&
      ((typeof v === "string" && v.length <= 150) ||
        (typeof v === "number" && Number.isFinite(v)) ||
        v === null)
    )
      out[k] = v;
  return out;
}
export function effectiveOverrides(data, cycle) {
  const out = safeOverrides(data, cycle.overrides);
  for (const slot of data.slots) {
    const name = out[MAIN + "!B" + slot.row] ?? slot.default;
    out[MAIN + "!B" + slot.testRow] = name === "+" ? "" : name;
    for (const ds of dayRows)
      out[MAIN + "!B" + (ds[slot.day] + slot.index)] = name === "+" ? "" : name;
  }
  return out;
}
export function nextPosition(p) {
  const n = { ...p };
  if (p.phase === "rest") return { phase: "meso", week: 3, day: 0 };
  if (n.day < 2) {
    n.day++;
    return n;
  }
  n.day = 0;
  if (p.phase === "prep") {
    if (p.week === 0) n.week = 1;
    else return { phase: "test", week: 0, day: 0 };
  } else if (p.phase === "test") return { phase: "meso", week: 0, day: 0 };
  else if (p.week === 2) return { phase: "rest", week: 0, day: 0 };
  else if (p.week < 8) n.week++;
  else return null;
  return n;
}
export function parseRoom(text) {
  try {
    const u = new URL(text);
    text = new URLSearchParams(u.hash.slice(1)).get("room") || text;
  } catch {}
  if (!validCode(text)) throw Error("Нужны все 10 эмодзи из приглашения");
  return normalizeCode(text);
}
