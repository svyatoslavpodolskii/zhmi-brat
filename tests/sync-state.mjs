import assert from "node:assert/strict";
import { stampChanges, mergeDiaries } from "../dist/sync-state.js";
const base = {
  name: "Брат",
  avatar: "🦍",
  activeCycle: "one",
  rev: 1,
  cycles: [
    {
      id: "one",
      name: "Цикл 1",
      createdAt: 1,
      position: { phase: "prep", week: 0, day: 0 },
      overrides: { a: 1, b: 2 },
      logs: {},
      done: [],
      dates: {},
    },
  ],
};
stampChanges(null, base, "a");
const a = structuredClone(base),
  b = structuredClone(base);
a.cycles[0].overrides.a = 3;
b.cycles[0].overrides.b = 4;
stampChanges(base, a, "a");
stampChanges(base, b, "b");
const merged = mergeDiaries([a, b]);
assert.deepEqual(merged.cycles[0].overrides, { a: 3, b: 4 });
assert.deepEqual(mergeDiaries([a, b]), mergeDiaries([b, a]));
const deleted = structuredClone(merged);
delete deleted.cycles[0].overrides.a;
stampChanges(merged, deleted, "a");
assert.equal(mergeDiaries([a, b, deleted]).cycles[0].overrides.a, undefined);
console.log("Per-field merge and tombstones passed");
