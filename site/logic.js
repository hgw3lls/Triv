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
    a = norm(a);
    b = norm(b);
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
  function consensus(results) {
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
    groups.sort(function (x, y) {
      return y.length - x.length || avg(y) - avg(x);
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

  var api = { norm: norm, sameAnswer: sameAnswer, parseJson: parseJson, clampPct: clampPct, consensus: consensus, csvCell: csvCell };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.TriviaLogic = api;
})(typeof window !== "undefined" ? window : this);
