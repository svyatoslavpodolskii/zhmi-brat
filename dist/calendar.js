const DAY = 86400000;
export function dateNumber(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return null;
  const n = Date.parse(value + "T00:00:00Z");
  return Number.isFinite(n) && new Date(n).toISOString().slice(0, 10) === value
    ? n / DAY
    : null;
}
export const dateString = (n) => new Date(n * DAY).toISOString().slice(0, 10);
export function monthDates(month) {
  const start = dateNumber(month + "-01");
  if (start === null) return [];
  const d = new Date(start * DAY);
  return Array.from(
    {
      length: new Date(
        Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
      ).getUTCDate(),
    },
    (_, i) => dateString(start + i),
  );
}
export function monthShift(month, step) {
  const d = new Date(month + "-01T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + step);
  return d.toISOString().slice(0, 7);
}
export function calendarOf(person) {
  return (
    person?.calendar || { schedule: null, training: {}, workOverrides: {} }
  );
}
export function automaticWork(date, schedule) {
  const n = dateNumber(date);
  if (n === null || !schedule) return false;
  if (schedule.type === "weekdays") {
    const day = new Date(n * DAY).getUTCDay();
    return day >= 1 && day <= 5;
  }
  const anchor = dateNumber(schedule.anchor);
  if (anchor === null) return false;
  const length = schedule.work + schedule.rest;
  return (((n - anchor) % length) + length) % length < schedule.work;
}
export function isWorkDay(date, calendar) {
  return Object.hasOwn(calendar?.workOverrides || {}, date)
    ? calendar.workOverrides[date]
    : automaticWork(date, calendar?.schedule);
}
export function completedDates(person) {
  const dates = new Set();
  for (const c of person?.cycles || []) {
    const unresolved = new Set();
    for (const key of c.done || []) {
      const explicit = c.dates?.[key];
      if (dateNumber(explicit) !== null) {
        dates.add(explicit);
        continue;
      }
      unresolved.add(key);
    }
    if (unresolved.size)
      for (const [k, l] of Object.entries(c.logs || {}))
        if (
          unresolved.has(k.split(":").slice(0, 3).join(":")) &&
          dateNumber(l.date) !== null
        )
          dates.add(l.date);
  }
  for (const [d, status] of Object.entries(person?.calendar?.training || {}))
    if (status === "done") dates.add(d);
  return dates;
}
export function trainingStatus(
  person,
  date,
  completed = completedDates(person),
) {
  return completed.has(date)
    ? "done"
    : calendarOf(person).training?.[date] === "planned"
      ? "planned"
      : null;
}
export function dayParticipants(members, date) {
  return members.filter((p) => trainingStatus(p, date));
}
export function monthSummary(person, month, members = []) {
  const dates = monthDates(month),
    calendar = calendarOf(person),
    done = completedDates(person);
  const team = members.map((p) => ({
    person: p,
    completed: completedDates(p),
  }));
  let work = 0,
    planned = 0,
    completed = 0,
    all = 0;
  for (const date of dates) {
    if (isWorkDay(date, calendar)) work++;
    const status = trainingStatus(person, date, done);
    if (status === "done") completed++;
    if (status === "planned") planned++;
    if (
      members.length > 1 &&
      team.every((p) => trainingStatus(p.person, date, p.completed))
    )
      all++;
  }
  return {
    work,
    free: dates.length - work,
    planned,
    completed,
    all,
    days: dates.length,
  };
}
export function validCalendar(c) {
  if (c === undefined) return true;
  if (!c || typeof c !== "object" || Array.isArray(c)) return false;
  const map = (value, valid) =>
    value === undefined ||
    (value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value).length <= 20000 &&
      Object.entries(value).every(
        ([date, v]) => dateNumber(date) !== null && valid(v),
      ));
  if (
    !map(c.training, (v) => v === "planned" || v === "done") ||
    !map(c.workOverrides, (v) => typeof v === "boolean")
  )
    return false;
  const s = c.schedule;
  return (
    s == null ||
    (s &&
      ["rotation", "weekdays"].includes(s.type) &&
      dateNumber(s.anchor) !== null &&
      Number.isInteger(s.work) &&
      s.work >= 1 &&
      s.work <= 31 &&
      Number.isInteger(s.rest) &&
      s.rest >= 1 &&
      s.rest <= 31)
  );
}
export const SCHEDULES = [
  { id: "1/3", name: "Сутки через трое", work: 1, rest: 3, type: "rotation" },
  { id: "5/2-week", name: "5/2 · пн–пт", work: 5, rest: 2, type: "weekdays" },
  { id: "5/2", name: "5/2 · по кругу", work: 5, rest: 2, type: "rotation" },
  { id: "4/2", name: "4/2", work: 4, rest: 2, type: "rotation" },
  { id: "2/2", name: "2/2", work: 2, rest: 2, type: "rotation" },
  { id: "3/3", name: "3/3", work: 3, rest: 3, type: "rotation" },
  { id: "6/1", name: "6/1", work: 6, rest: 1, type: "rotation" },
];
