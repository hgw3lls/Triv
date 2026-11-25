// Pure helpers shared by the page and the tests. No network, no DOM.
(function (root) {
  "use strict";

  function norm(s) {
    return String(s == null ? "" : s)
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9 ]/g, " ")
      .replace(/\b(the|a|an)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  // Two answers count as the same when one contains the other on word boundaries:
  // "Rembrandt" matches "Rembrandt van Rijn", but "4" does not match "14".
  function sameAnswer(a, b) {
    // A bare letter such as "A" would be stripped as an article, so compare those as written.
    var ra = String(a == null ? "" : a).trim().toLowerCase(), rb = String(b == null ? "" : b).trim().toLowerCase();
    a = norm(a) || ra.replace(/[^a-z0-9]/g, "");
    b = norm(b) || rb.replace(/[^a-z0-9]/g, "");
    if (!a || !b) return false;
    if (a === b) return true;
    var short = a.length <= b.length ? a : b;
    var long = a.length <= b.length ? b : a;
    return (" " + long + " ").indexOf(" " + short + " ") >= 0;
  }

  // Pull the last JSON object out of a model reply that may have prose around it.
  function parseJson(text) {
    text = String(text || "");
    var end = text.lastIndexOf("}");
    while (end >= 0) {
      var depth = 0;
      for (var i = end; i >= 0; i--) {
        var ch = text[i];
        if (ch === "}") depth++;
        else if (ch === "{") {
          depth--;
          if (depth === 0) {
            try {
              return JSON.parse(text.slice(i, end + 1));
            } catch (e) {
              break;
            }
          }
        }
      }
      end = text.lastIndexOf("}", end - 1);
    }
    return null;
  }

  function clampPct(v) {
    var n = Math.round(Number(v));
    if (!isFinite(n)) return null;
    return Math.max(0, Math.min(100, n));
  }

  // results: [{provider, answer, percent}] from models that finished.
  // Returns the answer most models agree on, plus a confidence level and score.
  // weights (optional): {provider: number}, from each model's track record. A heavier group wins a split.
  function consensus(results, weights) {
    var done = (results || []).filter(function (r) {
      return r && r.answer;
    });
    if (!done.length) return null;
    var groups = [];
    done.forEach(function (r) {
      for (var i = 0; i < groups.length; i++) {
        if (sameAnswer(groups[i][0].answer, r.answer)) {
          groups[i].push(r);
          return;
        }
      }
      groups.push([r]);
    });
    function avg(g) {
      var ps = g.map(function (r) { return r.percent; }).filter(function (p) { return typeof p === "number"; });
      if (!ps.length) return 50;
      return ps.reduce(function (a, b) { return a + b; }, 0) / ps.length;
    }
    function weight(g) {
      return g.reduce(function (t, r) { var w = weights && weights[r.provider]; return t + (typeof w === "number" ? w : 1); }, 0);
    }
    groups.sort(function (x, y) {
      return weight(y) - weight(x) || avg(y) - avg(x);
    });
    var best = groups[0];
    var n = done.length;
    var k = best.length;
    var score = avg(best);
    var level;
    if (n === 1) {
      level = score >= 85 ? "high" : score >= 55 ? "medium" : "low";
    } else if (k === n) {
      level = score >= 65 ? "high" : "medium";
    } else if (k >= 2) {
      level = score >= 50 ? "medium" : "low";
      score = Math.min(score, 75);
    } else {
      level = "low";
      score = Math.min(score, 40);
    }
    var top = best.slice().sort(function (x, y) {
      return (y.percent || 0) - (x.percent || 0);
    })[0];
    return {
      answer: top.answer,
      level: level,
      percent: Math.round(score),
      agree: k,
      of: n,
      providers: best.map(function (r) { return r.provider; })
    };
  }

  function csvCell(v) {
    v = String(v == null ? "" : v);
    // Stop spreadsheet apps from treating a cell as a formula.
    if (/^[=+\-@\t\r]/.test(v)) v = "'" + v;
    return '"' + v.replace(/"/g, '""') + '"';
  }

  // ---------- audio helpers ----------
  function rms(frame) {
    var sum = 0;
    for (var i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
    return Math.sqrt(sum / (frame.length || 1));
  }

  // How strongly a frame repeats at the pitch of a human voice (roughly 70-400 Hz), from 0 to 1.
  // Voiced speech scores high; applause, clatter, hiss and crowd rumble score low.
  function voicing(frame, sr) {
    var d = Math.max(1, Math.round(sr / 8000)), fs = sr / d, n = Math.floor(frame.length / d);
    if (n < 64) return 0;
    var x = new Float32Array(n), mean = 0, i, k;
    for (i = 0; i < n; i++) {
      var sum = 0;
      for (k = 0; k < d; k++) sum += frame[i * d + k];
      x[i] = sum / d; mean += x[i];
    }
    mean /= n;
    var energy = 0;
    for (i = 0; i < n; i++) { x[i] -= mean; energy += x[i] * x[i]; }
    if (energy < 1e-9) return 0;
    var lo = Math.max(2, Math.ceil(fs / 400)), hi = Math.min(n - 32, Math.floor(fs / 70)), best = 0;
    for (var lag = lo; lag <= hi; lag++) {
      var r = 0;
      for (i = 0; i < n - lag; i++) r += x[i] * x[i + lag];
      r = (r / energy) * (n / (n - lag));
      if (r > best) best = r;
    }
    return Math.min(1, best);
  }

  // Splits a stream of microphone frames into clips, all on the device.
  // A clip starts when a voice is heard above the room's background level, and ends at the first
  // long enough pause (or at the length cap). Loud sounds with no voice in them never start a clip,
  // and a clip with too little voice in it is dropped instead of sent.
  function createSegmenter(opts) {
    var sr = opts.sampleRate;
    var endSilence = opts.endSilenceMs || 1000, maxMs = opts.maxMs || 20000, minSpeech = opts.minSpeechMs || 500;
    var minVoiced = opts.minVoicedMs || 250, voicedAt = opts.voicedAt || 0.45, holdMs = 600;
    var prerollSamples = Math.round(((opts.prerollMs || 350) / 1000) * sr);
    var floor = 0.004, pre = [], preLen = 0, seg = null, segLen = 0, speechMs = 0, voicedMs = 0, sinceVoiced = 0, silenceMs = 0, segMin = 1;
    var minLevel = opts.minLevel || 0.01, ratio = opts.ratio || 2.5; // how far above the room a voice must be
    function threshold() { return Math.max(minLevel, floor * ratio); }
    function finish(capped) {
      // Drop most of the trailing pause: it carries nothing and makes the upload bigger and slower.
      var spare = silenceMs - 250;
      while (spare > 0 && seg.length > 1) {
        var lastMs = (seg[seg.length - 1].length / sr) * 1000;
        if (lastMs > spare) break;
        spare -= lastMs; segLen -= seg.pop().length;
      }
      var parts = seg, n = segLen, spoke = speechMs, voiced = voicedMs;
      if (capped) floor = Math.max(floor, segMin); // never went quiet: the room is louder than assumed
      seg = null; segLen = 0; speechMs = 0; voicedMs = 0; sinceVoiced = 0; silenceMs = 0; segMin = 1;
      if (opts.onState) opts.onState(false);
      if (spoke < minSpeech || voiced < minVoiced) return;
      var out = new Float32Array(n), at = 0;
      parts.forEach(function (f) { out.set(f, at); at += f.length; });
      opts.onSegment(out);
    }
    return {
      push: function (frame) {
        var ms = (frame.length / sr) * 1000, e = rms(frame), loud = e > threshold();
        var voiced = loud && voicing(frame, sr) >= voicedAt;
        if (!seg) {
          if (!voiced) {
            floor = loud ? floor * 0.99 + e * 0.01 : floor * 0.97 + e * 0.03;
            pre.push(frame); preLen += frame.length;
            while (pre.length > 1 && preLen - pre[0].length >= prerollSamples) preLen -= pre.shift().length;
            return;
          }
          seg = pre; segLen = preLen; pre = []; preLen = 0;
          seg.push(frame); segLen += frame.length;
          speechMs = ms; voicedMs = ms; sinceVoiced = 0; silenceMs = 0; segMin = e;
          if (opts.onState) opts.onState(true);
          return;
        }
        seg.push(frame); segLen += frame.length;
        if (e < segMin) segMin = e;
        if (voiced) { voicedMs += ms; sinceVoiced = 0; } else sinceVoiced += ms;
        // still talking: loud, and a voice was heard in the last moment (covers s, f, t and other unvoiced sounds)
        if (loud && sinceVoiced < holdMs) { speechMs += ms; silenceMs = 0; } else silenceMs += ms;
        if (silenceMs >= endSilence) finish(false);
        else if ((segLen / sr) * 1000 >= maxMs) finish(true);
      },
      flush: function () { if (seg) finish(false); }
    };
  }

  // Things speech-to-text produces from noise or small talk. Not worth a model call.
  var FILLER = ["", "you", "thank you", "thanks", "thanks for watching", "thank you for watching", "thank you very much", "bye", "bye bye",
    "ok", "okay", "so", "um", "uh", "yeah", "yes", "no", "right", "all right", "alright", "music", "applause", "laughter", "silence"];
  function isFiller(text) { return FILLER.indexOf(norm(text)) >= 0; }
  // Should this new text be sent to a model to look for questions? Free check, done on the device.
  // A short scrap is only worth sending if it might finish a sentence left hanging in the context.
  function worthAsking(text, context) {
    if (isFiller(text)) return false;
    if (String(text).indexOf("?") >= 0) return true;
    var raw = String(text || "").trim().split(/\s+/).filter(Boolean).length; // counted before "the"/"a" are stripped
    if (raw >= 3) return true;
    var c = String(context || "").trim();
    return c.length > 0 && !/[.?!]$/.test(c);
  }

  function downsample(input, from, to) {
    if (to >= from) return input;
    var ratio = from / to, n = Math.floor(input.length / ratio), out = new Float32Array(n);
    for (var i = 0; i < n; i++) {
      var a = Math.floor(i * ratio), b = Math.min(input.length, Math.floor((i + 1) * ratio)), sum = 0;
      for (var j = a; j < b; j++) sum += input[j];
      out[i] = sum / Math.max(1, b - a);
    }
    return out;
  }

  // 16-bit mono WAV.
  function encodeWav(samples, rate) {
    var buf = new ArrayBuffer(44 + samples.length * 2), v = new DataView(buf);
    function str(o, s) { for (var i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); }
    str(0, "RIFF"); v.setUint32(4, 36 + samples.length * 2, true); str(8, "WAVE"); str(12, "fmt ");
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    str(36, "data"); v.setUint32(40, samples.length * 2, true);
    for (var i = 0; i < samples.length; i++) {
      var x = Math.max(-1, Math.min(1, samples[i]));
      v.setInt16(44 + i * 2, x < 0 ? x * 0x8000 : x * 0x7fff, true);
    }
    return buf;
  }

  var api = { rms: rms, voicing: voicing, isFiller: isFiller, worthAsking: worthAsking, createSegmenter: createSegmenter, downsample: downsample, encodeWav: encodeWav, norm: norm, sameAnswer: sameAnswer, parseJson: parseJson, clampPct: clampPct, consensus: consensus, csvCell: csvCell };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.TriviaLogic = api;
})(typeof window !== "undefined" ? window : this);
