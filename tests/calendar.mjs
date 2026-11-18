import assert from "node:assert/strict";
import {
  dateNumber,
  monthDates,
  monthShift,
  automaticWork,
  isWorkDay,
  completedDates,
  monthSummary,
  validCalendar,
} from "../dist/calendar.js";
import { stampChanges, mergeDiaries } from "../dist/sync-state.js";
const shift = { type: "rotation", work: 1, rest: 3, anchor: "2026-11-19" };
for (const [d, expected] of [
  ["2026-11-19", true],
  ["2026-11-20", false],
  ["2026-11-22", false],
  ["2026-11-23", true],
  ["2026-11-18", false],
  ["2026-11-15", true],
])
  assert.equal(automaticWork(d, shift), expected, d);
assert.equal(monthDates("2024-02").length, 29);
assert.equal(monthDates("2026-02").length, 28);
assert.equal(monthShift("2026-12", 1), "2027-01");
assert.equal(monthShift("2026-01", -1), "2025-12");
assert.equal(dateNumber("2026-02-29"), null);
assert.equal(
  monthSummary({ calendar: { schedule: shift } }, "2026-11").work,
  7,
);
assert.equal(
  monthSummary(
    {
      calendar: { schedule: { ...shift, type: "weekdays", work: 5, rest: 2 } },
    },
    "2026-11",
  ).work,
  21,
);
assert.equal(
  isWorkDay("2026-11-19", {
    schedule: shift,
    workOverrides: { "2026-11-19": false },
  }),
  false,
);
const base = {
  name: "Брат",
  avatar: "🦍",
  rev: 1,
  activeCycle: "test",
  cycles: [
    {
      id: "test",
      name: "Цикл",
      createdAt: 1,
      position: { phase: "prep", week: 0, day: 0 },
      overrides: {},
      logs: {},
      done: [],
      dates: {},
    },
  ],
  calendar: {
    schedule: shift,
    training: { "2026-11-19": "planned" },
    workOverrides: {},
  },
};
stampChanges(null, base, "a");
const a = structuredClone(base),
  b = structuredClone(base);
a.calendar.training["2026-11-20"] = "done";
delete a.calendar.training["2026-11-19"];
b.calendar.training["2026-11-21"] = "planned";
b.calendar.workOverrides["2026-11-22"] = true;
stampChanges(base, a, "a");
stampChanges(base, b, "b");
const merged = mergeDiaries([a, b]);
assert.deepEqual(merged.calendar.training, {
  "2026-11-20": "done",
  "2026-11-21": "planned",
});
assert.equal(merged.calendar.workOverrides["2026-11-22"], true);
assert.deepEqual(merged, mergeDiaries([b, a]));
assert.ok(validCalendar(merged.calendar));
assert.equal(validCalendar({ schedule: { ...shift, work: 0 } }), false);
assert.equal(validCalendar({ training: { bad: "planned" } }), false);
assert.equal(validCalendar({ workOverrides: { "2026-11-19": "yes" } }), false);
const logged = {
  cycles: [
    {
      done: ["prep:0:0"],
      dates: {},
      logs: {
        "prep:0:0:77:0": { date: "2026-11-19" },
        "prep:0:0:78:0": { date: "2026-11-19" },
        "prep:0:1:85:0": { date: "2026-11-20" },
      },
    },
  ],
  calendar: { training: { "2026-11-19": "done" } },
};
assert.deepEqual([...completedDates(logged)], ["2026-11-19"]);
assert.equal(
  monthSummary(base, "2026-11", [base, { ...base, id: "b" }]).all,
  1,
);
assert.equal(monthSummary(base, "2026-11", [base]).all, 0);
console.log(
  "Calendar shifts, weekdays, leap dates, completed sessions, group matches and shared edits passed",
);
