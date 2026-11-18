import fs from "node:fs";
import assert from "node:assert/strict";
import { WorkbookEngine, mround } from "../dist/engine.js";
const data = JSON.parse(
  fs.readFileSync(new URL("../dist/workbook.json", import.meta.url)),
);
assert.equal(data.slots.length, 15);
assert.equal(data.links.length, 38);
assert.equal(
  data.sheets.reduce(
    (n, s) => n + Object.values(s.cells).filter((c) => c.f).length,
    0,
  ),
  2260,
);
for (const a of data.cleared)
  assert.equal(
    data.sheets[0].cells[a]?.v ?? null,
    null,
    `Input not cleared: ${a}`,
  );
const main = data.sheets[0].name;
assert.equal(mround((76 / 0.89) * 0.8, 2.5), 67.5);
assert.equal(mround(6.25, 2.5), 7.5);
const clean = new WorkbookEngine(data);
assert.equal(clean.get(main, "I77").value, null);
assert.ok(clean.get(main, "I77").error);
const changes = {
  [main + "!F77"]: 76,
  [main + "!G77"]: 4,
  [main + "!H77"]: 10,
};
const e = new WorkbookEngine(data, changes);
assert.equal(e.cell(main, "I77"), 67.5);
assert.equal(e.cell(main, "O77"), 70);
for (const [s, addr, expected] of [
  ["Калькулятор подходов", "D10", 50],
  ["Калькулятор подходов", "D16", 92.5],
  ["Калькулятор подходов", "L55", 302.5],
])
  assert.equal(e.cell(s, addr), expected);
// Exercise every original formula against Excel's saved results, without using saved formula values as inputs.
const path = new URL("../research/workbook.json", import.meta.url);
let report = {};
if (fs.existsSync(path)) {
  const original = JSON.parse(fs.readFileSync(path, "utf8"));
  const baseline = {
    sheets: original.sheets.map((s) => ({
      name: s.name,
      cells: Object.fromEntries(
        Object.entries(s.cells).map(([a, c]) => [
          a,
          c.f
            ? { f: c.f }
            : {
                v:
                  c.t === "s" || c.t === "inlineStr"
                    ? c.v
                    : c.v !== "" && Number.isFinite(Number(c.v))
                      ? Number(c.v)
                      : c.v || null,
              },
        ]),
      ),
    })),
  };
  const calc = new WorkbookEngine(baseline, {}, false),
    mismatches = [],
    unexpected = [],
    bySheet = {};
  let checked = 0,
    expectedErrors = 0;
  for (const s of original.sheets) {
    bySheet[s.name] = { checked: 0, expectedErrors: 0 };
    for (const [a, c] of Object.entries(s.cells)) {
      if (!c.f) continue;
      const got = calc.get(s.name, a);
      if (c.t === "e") {
        if (got.error) {
          expectedErrors++;
          bySheet[s.name].expectedErrors++;
        } else unexpected.push({ sheet: s.name, cell: a, expected: c.v, got });
        continue;
      }
      let expected =
        c.t === "str"
          ? c.v
          : c.v !== "" && Number.isFinite(Number(c.v))
            ? Number(c.v)
            : c.v;
      let value = got.value;
      if (value === null && expected === 0) value = 0;
      const equal =
        typeof expected === "number"
          ? Math.abs(value - expected) < 1e-7
          : value === expected;
      if (got.error || !equal)
        mismatches.push({ sheet: s.name, cell: a, expected, got });
      else {
        checked++;
        bySheet[s.name].checked++;
      }
    }
  }
  report = { checked, expectedErrors, mismatches, unexpected, bySheet };
  fs.writeFileSync(
    new URL("../research/verification.json", import.meta.url),
    JSON.stringify(report, null, 2),
  );
  console.log(
    JSON.stringify(
      {
        checked,
        expectedErrors,
        mismatchCount: mismatches.length,
        unexpected: unexpected.length,
        examples: mismatches.slice(0, 12),
      },
      null,
      2,
    ),
  );
  assert.equal(mismatches.length, 0, "Excel cache mismatch");
  assert.equal(unexpected.length, 0, "Unexpected validity");
}
console.log("Calculation checks passed");
