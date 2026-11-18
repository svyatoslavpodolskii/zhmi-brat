import fs from "node:fs";
import assert from "node:assert/strict";
import { WorkbookEngine, colName } from "../dist/engine.js";
import {
  MAIN,
  dayRows,
  effectiveOverrides,
  nextPosition,
} from "../dist/state.js";
const data = JSON.parse(
  fs.readFileSync(new URL("../dist/workbook.json", import.meta.url)),
);
let tested = 0;
for (const slot of data.slots)
  for (const option of slot.options) {
    const cycle = { overrides: {}, logs: {} };
    // Fill every prerequisite with controlled values, so all nine weeks must recalculate.
    for (const s of data.slots) {
      cycle.overrides[MAIN + "!C" + s.testRow] = 80;
      cycle.overrides[MAIN + "!D" + s.testRow] = 6;
      for (const col of ["H", "K", "N", "Q", "T", "W"])
        cycle.overrides[MAIN + "!" + col + s.row] = 8;
      cycle.overrides[MAIN + "!F" + s.row] = 60;
      cycle.overrides[MAIN + "!G" + s.row] = 6;
    }
    cycle.overrides[MAIN + "!B" + slot.row] = option.name;
    for (const ds of dayRows)
      for (const r of ds)
        for (let j = 0; j < 5; j++)
          for (const col of ["F", "M", "T"])
            cycle.overrides[MAIN + "!" + col + (r + j)] = 8;
    const e = new WorkbookEngine(data, effectiveOverrides(data, cycle));
    for (let week = 0; week < 9; week++) {
      const r = dayRows[Math.floor(week / 3)][slot.day] + slot.index,
        cols = [
          3 + (week % 3) * 7,
          4 + (week % 3) * 7,
          5 + (week % 3) * 7,
          7 + (week % 3) * 7,
          8 + (week % 3) * 7,
          9 + (week % 3) * 7,
        ];
      for (const col of cols) {
        const result = e.get(MAIN, colName(col) + r);
        assert.ok(
          !result.error,
          JSON.stringify({
            slot: slot.row,
            option,
            week,
            cell: colName(col) + r,
            result,
          }),
        );
        if (option.name !== "+") assert.notEqual(result.value, null);
        tested++;
      }
    }
  }
let pos = { phase: "prep", week: 0, day: 0 },
  count = 0,
  rest = 0;
while (pos) {
  if (pos.phase === "rest") rest++;
  else count++;
  pos = nextPosition(pos);
  assert.ok(count < 50);
}
assert.equal(count, 36);
assert.equal(rest, 1);
console.log(
  JSON.stringify({
    exerciseWeekChecks: tested,
    workoutsPerCycle: count,
    recoveryWeeks: rest,
  }),
);
