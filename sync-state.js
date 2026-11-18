// Per-field last-writer registers. Different fields merge; a deletion is a tombstone.
const copy = (x) => JSON.parse(JSON.stringify(x));
function flatten(state) {
  const out = {};
  const put = (path, v) => {
    out[JSON.stringify(path)] = v;
  };
  for (const k of ["name", "avatar", "activeCycle", "recoveryEnabled"])
    if (state[k] !== undefined) put([k], state[k]);
  for (const id of state.recoveryMembers || [])
    put(["recoveryMembers", id], true);
  if (state.calendar) {
    if (state.calendar.schedule !== undefined)
      put(["calendar", "schedule"], state.calendar.schedule);
    for (const key of ["training", "workOverrides"])
      for (const [date, value] of Object.entries(state.calendar[key] || {}))
        put(["calendar", key, date], value);
  }
  for (const c of state.cycles || []) {
    for (const k of ["id", "name", "createdAt", "position"])
      put(["cycles", c.id, k], c[k]);
    for (const k of ["overrides", "logs", "dates", "drafts"])
      for (const [a, v] of Object.entries(c[k] || {}))
        put(["cycles", c.id, k, a], v);
    for (const k of c.done || []) put(["cycles", c.id, "done", k], true);
  }
  return out;
}
const later = (a, b) => !b || a.n > b.n || (a.n === b.n && a.d > b.d);
export function registersOf(state, device = "legacy") {
  if (state.registers) return state.registers;
  return Object.fromEntries(
    Object.entries(flatten(state)).map(([k, v]) => [
      k,
      { v, n: state.rev || 0, d: state.id || device },
    ]),
  );
}
export function stampChanges(before, after, device) {
  const a = before ? flatten(before) : {},
    b = flatten(after),
    regs = copy(before?.registers || after.registers || {});
  let n = Math.max(Date.now(), ...Object.values(regs).map((r) => r.n + 1));
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)]))
    if (JSON.stringify(a[k]) !== JSON.stringify(b[k]) || !regs[k])
      regs[k] = Object.hasOwn(b, k)
        ? { v: b[k], n: n++, d: device }
        : { deleted: true, n: n++, d: device };
  after.registers = regs;
  return after;
}
export function mergeDiaries(states) {
  const regs = {};
  for (const s of states)
    for (const [k, r] of Object.entries(registersOf(s, s.id)))
      if (later(r, regs[k])) regs[k] = r;
  const result = {
    cycles: [],
    registers: Object.fromEntries(
      Object.entries(regs).sort(([a], [b]) => a.localeCompare(b)),
    ),
    rev: Math.max(0, ...states.map((s) => s.rev || 0)),
    recoveryMembers: [],
    calendar: { schedule: null, training: {}, workOverrides: {} },
  };
  const cycles = Object.create(null);
  for (const [k, r] of Object.entries(result.registers)) {
    if (r.deleted) continue;
    let p;
    try {
      p = JSON.parse(k);
    } catch {
      continue;
    }
    if (p[0] === "calendar") {
      if (p.length === 2 && p[1] === "schedule")
        result.calendar.schedule = copy(r.v);
      else if (
        p.length === 3 &&
        ["training", "workOverrides"].includes(p[1]) &&
        /^\d{4}-\d{2}-\d{2}$/.test(p[2])
      )
        result.calendar[p[1]][p[2]] = copy(r.v);
    } else if (p[0] === "cycles") {
      if (!/^[a-zA-Z0-9-]{1,100}$/.test(p[1])) continue;
      const c = (cycles[p[1]] ??= {
        id: p[1],
        overrides: {},
        logs: {},
        dates: {},
        drafts: {},
        done: [],
      });
      if (p[2] === "done") {
        if (r.v) c.done.push(p[3]);
      } else if (
        p.length === 4 &&
        ["overrides", "logs", "dates", "drafts"].includes(p[2])
      )
        c[p[2]][p[3]] = copy(r.v);
      else if (
        p.length === 3 &&
        ["id", "name", "createdAt", "position"].includes(p[2])
      )
        c[p[2]] = copy(r.v);
    } else if (p[0] === "recoveryMembers" && r.v)
      result.recoveryMembers.push(p[1]);
    else if (
      p.length === 1 &&
      ["name", "avatar", "activeCycle", "recoveryEnabled"].includes(p[0])
    )
      result[p[0]] = copy(r.v);
  }
  result.cycles = Object.values(cycles)
    .filter((c) => c.name && c.position)
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  return result;
}
export function sameRegisters(a, b) {
  return (
    JSON.stringify(Object.entries(registersOf(a)).sort()) ===
    JSON.stringify(Object.entries(registersOf(b)).sort())
  );
}
