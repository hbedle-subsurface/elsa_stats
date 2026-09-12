/* csv.js — delimited-text reader.
 *
 * Handles quoted fields, embedded delimiters and newlines inside quotes,
 * doubled quotes as an escape, CRLF or LF line endings, and a UTF-8 byte
 * order mark. Sniffs comma, tab, semicolon and pipe.
 *
 * Everything runs in the page. The file is read with FileReader and never
 * sent anywhere.
 */

(function (global) {
  'use strict';

  function stripBOM(text) {
    return text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
  }

  function sniffDelimiter(text) {
    var sample = text.slice(0, 64 * 1024);
    var firstBreak = sample.indexOf('\n');
    var head = firstBreak === -1 ? sample : sample.slice(0, firstBreak);
    var candidates = [',', '\t', ';', '|'];
    var best = ',', bestCount = -1;
    candidates.forEach(function (d) {
      // count only delimiters outside quotes on the header line
      var inQ = false, count = 0;
      for (var i = 0; i < head.length; i++) {
        var ch = head[i];
        if (ch === '"') inQ = !inQ;
        else if (ch === d && !inQ) count++;
      }
      if (count > bestCount) { bestCount = count; best = d; }
    });
    return best;
  }

  function parse(text, delimiter) {
    text = stripBOM(text);
    var d = delimiter || sniffDelimiter(text);

    var rows = [];
    var field = '';
    var record = [];
    var inQuotes = false;
    var i = 0, len = text.length;

    while (i < len) {
      var ch = text[i];

      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
          inQuotes = false; i++; continue;
        }
        field += ch; i++; continue;
      }

      if (ch === '"' && field === '') { inQuotes = true; i++; continue; }

      if (ch === d) { record.push(field); field = ''; i++; continue; }

      if (ch === '\r') {
        if (text[i + 1] === '\n') i++;
        record.push(field); field = '';
        rows.push(record); record = [];
        i++; continue;
      }

      if (ch === '\n') {
        record.push(field); field = '';
        rows.push(record); record = [];
        i++; continue;
      }

      field += ch; i++;
    }
    if (field !== '' || record.length > 0) { record.push(field); rows.push(record); }

    // drop fully empty trailing records
    while (rows.length && rows[rows.length - 1].every(function (c) { return c === ''; })) rows.pop();

    if (rows.length === 0) return { columns: [], rows: [], delimiter: d };

    var rawHeader = rows[0];
    var columns = [];
    var seen = {};
    rawHeader.forEach(function (h, ix) {
      var name = String(h).trim();
      if (name === '') name = 'column_' + (ix + 1);
      if (seen[name] !== undefined) { seen[name]++; name = name + '_' + seen[name]; }
      else seen[name] = 0;
      columns.push(name);
    });

    var out = [];
    for (var r = 1; r < rows.length; r++) {
      var rec = rows[r];
      if (rec.length === 1 && rec[0] === '') continue;
      var obj = {};
      for (var c = 0; c < columns.length; c++) {
        obj[columns[c]] = rec[c] === undefined ? '' : rec[c];
      }
      out.push(obj);
    }

    return { columns: columns, rows: out, delimiter: d };
  }

  /* ------------------------------------------------ response scale order
   *
   * Survey answers arrive in whatever order they happen to appear in the
   * file, which for a Likert item is meaningless and for a chart is
   * actively misleading. scaleScore() places a response on an ordered
   * scale running from strongest support (negative) through the middle
   * (zero) to strongest opposition (positive), with non-substantive
   * answers pushed to the end.
   *
   * Returns null when the text is not recognizable as a scale point, in
   * which case the caller falls back to numeric or frequency order. */

  var POSITIVE = /\b(favor|support|approve|agree|good|yes|important|likely|satisfied|willing|more)\b/;
  var NEGATIVE = /\b(oppose|disapprove|disagree|bad|no|unimportant|unlikely|dissatisfied|unwilling|less|fewer)\b/;
  var NEUTRAL = /\b(neither|neutral|about right|no opinion either way|mixed|same|no change)\b/;
  var NONSUBSTANTIVE = /(not sure|don'?t know|dk\b|no answer|no opinion|refused|refusal|skipped|missing|prefer not)/;

  function scaleScore(raw) {
    var s = String(raw).trim().toLowerCase();
    if (s === '') return null;

    if (NONSUBSTANTIVE.test(s)) return 100;

    // bare high numeric codes are conventionally refusals
    if (/^\d+$/.test(s)) {
      var n = parseInt(s, 10);
      if (n >= 90 && n <= 99) return 100;
      return null;
    }

    if (NEUTRAL.test(s)) return 0;

    var intensity = 1;
    if (/\b(strongly|very|completely|extremely|a great deal|definitely)\b/.test(s)) intensity = 2;
    else if (/\b(somewhat|mostly|moderately|fairly|slightly|a little|probably)\b/.test(s)) intensity = 1;

    // "not too" / "not at all" flip a positive word negative
    var negated = /\b(not too|not at all|not very|not really)\b/.test(s);
    if (negated) {
      if (POSITIVE.test(s)) return /\bnot at all\b/.test(s) ? 2 : 1;
      return null;
    }

    if (/^no\b/.test(s) && !NEGATIVE.test(s.slice(2))) return 1;
    if (/^yes\b/.test(s)) return -1;

    if (NEGATIVE.test(s)) return intensity;
    if (POSITIVE.test(s)) return -intensity;

    return null;
  }

  /* Sort a list of {value, n} into a defensible display order. */
  function orderValues(values) {
    var scored = values.map(function (v) {
      return { value: v.value, n: v.n, score: scaleScore(v.value) };
    });

    var substantive = scored.filter(function (v) { return v.score !== 100; });
    var recognized = substantive.length > 0 &&
      substantive.every(function (v) { return v.score !== null; });

    if (recognized) {
      // scale order, refusals last, ties broken by frequency
      scored.sort(function (a, b) {
        if (a.score !== b.score) return a.score - b.score;
        return b.n - a.n;
      });
      return scored;
    }

    var allNumeric = scored.every(function (v) { return isFinite(Number(v.value)); });
    if (allNumeric) {
      scored.sort(function (a, b) { return Number(a.value) - Number(b.value); });
      return scored;
    }

    // leading number, as in age bands "18-29", "30-49"
    var leading = /^\s*(\d+)/;
    var allLeading = scored.every(function (v) { return leading.test(v.value); });
    if (allLeading) {
      scored.sort(function (a, b) {
        return parseInt(a.value.match(leading)[1], 10) - parseInt(b.value.match(leading)[1], 10);
      });
      return scored;
    }

    // nominal: most common first
    scored.sort(function (a, b) { return b.n - a.n; });
    return scored;
  }

  /* Per-column summary used to build the codebook.
   * kind: 'numeric' | 'categorical' | 'free-text' | 'empty'
   * A numeric column with few distinct values is still reported as numeric
   * but flagged codeLike, because survey files store answers as codes. */
  function profile(rows, columns, maxDistinct) {
    maxDistinct = maxDistinct || 60;
    return columns.map(function (name) {
      var counts = new Map();
      var nMissing = 0, nNumeric = 0, nNonMissing = 0;
      var min = Infinity, max = -Infinity;
      var overflow = false;

      for (var i = 0; i < rows.length; i++) {
        var v = rows[i][name];
        if (Stats.isMissing(v)) { nMissing++; continue; }
        nNonMissing++;
        var num = Number(v);
        if (v !== '' && isFinite(num)) {
          nNumeric++;
          if (num < min) min = num;
          if (num > max) max = num;
        }
        var key = String(v);
        if (counts.size < maxDistinct * 4) {
          counts.set(key, (counts.get(key) || 0) + 1);
        } else {
          overflow = true;
        }
      }

      var distinct = counts.size;
      var allNumeric = nNonMissing > 0 && nNumeric === nNonMissing;
      var kind;
      if (nNonMissing === 0) kind = 'empty';
      else if (allNumeric) kind = 'numeric';
      else if (distinct > maxDistinct || overflow) kind = 'free-text';
      else kind = 'categorical';

      var values = orderValues(Array.from(counts.entries())
        .map(function (e) { return { value: e[0], n: e[1] }; }));

      // An ordered scale is one where every substantive answer landed on
      // the support-to-opposition scale. splitAfter is the index of the
      // last supporting answer, which is where a diverging bar chart puts
      // its zero line.
      var substantive = values.filter(function (v) { return v.score !== 100; });
      var isScale = substantive.length > 1 &&
        substantive.every(function (v) { return v.score !== null; });
      var splitAfter = -1;
      if (isScale) {
        values.forEach(function (v, ix) { if (v.score !== null && v.score < 0) splitAfter = ix; });
      }

      return {
        name: name,
        kind: kind,
        distinct: distinct,
        overflow: overflow,
        nMissing: nMissing,
        nNonMissing: nNonMissing,
        allNumeric: allNumeric,
        codeLike: allNumeric && distinct <= 20,
        isScale: isScale,
        splitAfter: splitAfter,
        hasMiddle: isScale && values.some(function (v) { return v.score === 0; }),
        min: isFinite(min) ? min : null,
        max: isFinite(max) ? max : null,
        values: values.slice(0, maxDistinct)
      };
    });
  }

  /* Guess which column holds the survey weight. Looks for a plausible name
   * AND checks the values look like weights: all positive, mean near 1,
   * more than a handful of distinct values. */
  function guessWeight(rows, profiles) {
    var namePattern = /(^|[^a-z])(weight|weights|wgt|wt)([^a-z]|$)/i;
    var scored = [];

    profiles.forEach(function (p) {
      if (!p.allNumeric || p.nNonMissing === 0) return;
      if (p.min === null || p.min < 0) return;
      var sum = 0, count = 0;
      for (var i = 0; i < rows.length; i++) {
        var v = Number(rows[i][p.name]);
        if (isFinite(v)) { sum += v; count++; }
      }
      if (count === 0) return;
      var mean = sum / count;
      var score = 0;
      if (namePattern.test(p.name)) score += 10;
      if (p.distinct > 20) score += 3;
      if (mean > 0.5 && mean < 2) score += 4;      // normalized to mean 1
      if (p.max !== null && p.max < 50) score += 1;
      if (score > 0) scored.push({ name: p.name, score: score, mean: mean });
    });

    scored.sort(function (a, b) { return b.score - a.score; });
    return scored.length && scored[0].score >= 10 ? scored[0].name : null;
  }

  global.CSV = {
    parse: parse,
    profile: profile,
    guessWeight: guessWeight,
    sniffDelimiter: sniffDelimiter,
    scaleScore: scaleScore,
    orderValues: orderValues
  };
})(window);
