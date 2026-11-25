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

// ---- audio ----
function frames(seconds, amp, sr) {
  const out = [];
  for (let i = 0; i < Math.round((seconds * sr) / 2048); i++) {
    const f = new Float32Array(2048);
    for (let j = 0; j < f.length; j++) f[j] = amp * Math.sin((2 * Math.PI * 220 * (i * 2048 + j)) / sr);
    out.push(f);
  }
  return out;
}
{
  const sr = 48000, clips = [], states = [];
  const seg = L.createSegmenter({ sampleRate: sr, onSegment: (c) => clips.push(c), onState: (s) => states.push(s) });
  const feed = (fs) => fs.forEach((f) => seg.push(f));
  feed(frames(1, 0.002, sr));   // room noise
  feed(frames(2.5, 0.2, sr));   // a question
  feed(frames(1.5, 0.002, sr)); // the pause after it
  assert.strictEqual(clips.length, 1, "one clip, cut at the pause");
  const secs = clips[0].length / sr;
  assert.ok(secs > 2.8 && secs < 3.4, "clip covers the speech and only a little of the pause: " + secs);
  assert.deepStrictEqual(states, [true, false]);
  feed(frames(0.2, 0.2, sr));   // a cough: too short to send
  feed(frames(1.5, 0.002, sr));
  assert.strictEqual(clips.length, 1);
  feed(frames(1.5, 0.2, sr));   // second question, cut off by stopping the mic
  seg.flush();
  assert.strictEqual(clips.length, 2);

  // a room that never goes quiet is capped, then the background level adapts
  const clips2 = [];
  const seg2 = L.createSegmenter({ sampleRate: sr, maxMs: 3000, onSegment: (c) => clips2.push(c) });
  frames(3.5, 0.05, sr).forEach((f) => seg2.push(f));
  assert.strictEqual(clips2.length, 1);
  frames(2, 0.05, sr).forEach((f) => seg2.push(f));
  assert.strictEqual(clips2.length, 1, "steady noise no longer counts as speech");

  // loud sounds with no voice in them (applause, clatter) never become a clip
  function noise(seconds, amp) {
    const out = []; let seed = 7;
    for (let i = 0; i < Math.round((seconds * sr) / 2048); i++) {
      const f = new Float32Array(2048);
      for (let j = 0; j < f.length; j++) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; f[j] = amp * ((seed / 0x3fffffff) - 1); }
      out.push(f);
    }
    return out;
  }
  assert.ok(L.voicing(frames(0.1, 0.2, sr)[0], sr) > 0.8, "a steady pitch reads as voiced");
  assert.ok(L.voicing(noise(0.1, 0.2)[0], sr) < 0.3, "noise reads as unvoiced");
  const clips3 = [];
  const seg3 = L.createSegmenter({ sampleRate: sr, onSegment: (c) => clips3.push(c) });
  frames(1, 0.002, sr).forEach((f) => seg3.push(f));
  noise(3, 0.3).forEach((f) => seg3.push(f));        // applause
  frames(1.5, 0.002, sr).forEach((f) => seg3.push(f));
  assert.strictEqual(clips3.length, 0, "applause is not sent");
  // a voice followed by trailing noise ends shortly after the voice stops
  frames(2, 0.2, sr).forEach((f) => seg3.push(f));
  noise(3, 0.15).forEach((f) => seg3.push(f));
  assert.strictEqual(clips3.length, 1);
  assert.ok(clips3[0].length / sr < 4.5, "clip ended despite the noise: " + clips3[0].length / sr);

  const down = L.downsample(clips[0], sr, 16000);
  assert.ok(Math.abs(down.length - clips[0].length / 3) <= 1);
  const wav = new DataView(L.encodeWav(down, 16000));
  assert.strictEqual(wav.byteLength, 44 + down.length * 2);
  assert.strictEqual(wav.getUint32(24, true), 16000);
  assert.strictEqual(String.fromCharCode(wav.getUint8(0), wav.getUint8(1), wav.getUint8(2), wav.getUint8(3)), "RIFF");
}

assert.ok(L.isFiller("Thank you."));
assert.ok(L.isFiller(" Okay "));
assert.ok(!L.worthAsking("Thank you.", "Who painted the Night Watch?"));
assert.ok(!L.worthAsking("Next round", "That was round one."), "small talk after a finished sentence waits");
assert.ok(L.worthAsking("the Titanic", "In what year did they launch"), "a scrap that may finish a hanging sentence is sent");
assert.ok(L.worthAsking("Who painted the Night Watch", ""));
assert.ok(L.worthAsking("Paris?", "That was round one."));

console.log("logic tests passed");
