const assert = require("assert");
const L = require("../site/logic.js");

assert.ok(L.sameAnswer("Rembrandt", "Rembrandt van Rijn"));
assert.ok(L.sameAnswer("The Beatles", "beatles"));
assert.ok(!L.sameAnswer("4", "14"));
assert.ok(!L.sameAnswer("Saturn", "Jupiter"));
assert.ok(!L.sameAnswer("", "x"));

assert.deepStrictEqual(L.parseJson('I searched. {"answer":"Saturn","percent":90}'), { answer: "Saturn", percent: 90 });
assert.deepStrictEqual(L.parseJson('{"a":{"b":1}} trailing'), { a: { b: 1 } });
assert.deepStrictEqual(L.parseJson('bad {x} then {"ok":true}'), { ok: true });
assert.strictEqual(L.parseJson("no json"), null);

assert.strictEqual(L.clampPct("140"), 100);
assert.strictEqual(L.clampPct("abc"), null);

let c = L.consensus([
  { provider: "claude", answer: "Saturn", percent: 95 },
  { provider: "openai", answer: "saturn", percent: 90 },
  { provider: "gemini", answer: "Saturn", percent: 85 }
]);
assert.strictEqual(c.level, "high");
assert.strictEqual(c.agree, 3);
assert.strictEqual(c.percent, 90);

c = L.consensus([
  { provider: "claude", answer: "Saturn", percent: 95 },
  { provider: "openai", answer: "Jupiter", percent: 90 },
  { provider: "gemini", answer: "Saturn", percent: 85 }
]);
assert.strictEqual(c.answer, "Saturn");
assert.strictEqual(c.level, "medium");
assert.strictEqual(c.agree, 2);
assert.ok(c.percent <= 75);

c = L.consensus([
  { provider: "claude", answer: "A", percent: 95 },
  { provider: "openai", answer: "B", percent: 90 }
]);
assert.strictEqual(c.level, "low");
assert.ok(c.percent <= 40);

c = L.consensus([{ provider: "claude", answer: "A", percent: 60 }]);
assert.strictEqual(c.level, "medium");
assert.strictEqual(L.consensus([]), null);

assert.strictEqual(L.csvCell('=SUM(1)'), '"\'=SUM(1)"');
assert.strictEqual(L.csvCell('say "hi"'), '"say ""hi"""');

console.log("logic tests passed");
