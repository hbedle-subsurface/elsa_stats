/* stats.js — weighted survey statistics.
 *
 * Everything here works on an array of row objects and the NAME of a weight
 * column. If the weight name is null, every case gets weight 1 and the
 * results are unweighted.
 *
 * Variance estimation uses Kish's effective sample size. This treats the
 * weights as if they came from a simple random sample with unequal
 * probabilities of selection. It does not account for clustering or
 * stratification in the sample design, so for a clustered design the
 * intervals reported here are narrower than the true ones. For the American
 * Trends Panel and the CES, which release a single weight and no cluster
 * identifiers, this is the standard approximation.
 */

(function (global) {
  'use strict';

  // ---------------------------------------------------------------- helpers

  var MISSING_STRINGS = ['', '.', 'na', 'n/a', 'nan', 'null', ' '];

  function isMissing(v, extraCodes) {
    if (v === null || v === undefined) return true;
    var s = String(v).trim().toLowerCase();
    if (MISSING_STRINGS.indexOf(s) !== -1) return true;
    if (extraCodes && extraCodes.length) {
      for (var i = 0; i < extraCodes.length; i++) {
        if (String(extraCodes[i]).trim().toLowerCase() === s) return true;
      }
    }
    return false;
  }

  function weightOf(row, weightVar) {
    if (!weightVar) return 1;
    var w = parseFloat(row[weightVar]);
    if (!isFinite(w) || w < 0) return null; // null = drop this case
    return w;
  }

  // -------------------------------------------------- effective sample size

  /* Kish: n_eff = (sum w)^2 / sum w^2 ; deff = n / n_eff */
  function effectiveN(weights) {
    var sumW = 0, sumW2 = 0, n = weights.length;
    for (var i = 0; i < n; i++) {
      sumW += weights[i];
      sumW2 += weights[i] * weights[i];
    }
    if (sumW2 === 0) return { n: n, sumW: 0, sumW2: 0, nEff: 0, deff: NaN };
    var nEff = (sumW * sumW) / sumW2;
    return { n: n, sumW: sumW, sumW2: sumW2, nEff: nEff, deff: n / nEff };
  }

  // ------------------------------------------------------------ frequencies

  /* Returns {categories:[{value, w, n, pW, pU, se, moe}], total, design}
   * pW = weighted proportion, pU = unweighted proportion.
   * Cases missing on the variable are excluded from the base and reported
   * separately in .missing. */
  function frequencies(rows, varName, weightVar, missingCodes) {
    var map = new Map();
    var used = [];
    var missW = 0, missN = 0, droppedWeight = 0;

    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var w = weightOf(row, weightVar);
      if (w === null) { droppedWeight++; continue; }
      var v = row[varName];
      if (isMissing(v, missingCodes)) { missW += w; missN += 1; continue; }
      var key = String(v);
      var cell = map.get(key);
      if (!cell) { cell = { value: key, w: 0, n: 0 }; map.set(key, cell); }
      cell.w += w;
      cell.n += 1;
      used.push(w);
    }

    var design = effectiveN(used);
    var totW = design.sumW, totN = used.length;
    var cats = Array.from(map.values());

    cats.forEach(function (c) {
      c.pW = totW > 0 ? c.w / totW : 0;
      c.pU = totN > 0 ? c.n / totN : 0;
      var se = design.nEff > 0 ? Math.sqrt(c.pW * (1 - c.pW) / design.nEff) : NaN;
      c.se = se;
      c.moe = 1.959964 * se;
    });

    return {
      variable: varName,
      categories: cats,
      totalW: totW,
      totalN: totN,
      design: design,
      missing: { w: missW, n: missN },
      droppedWeight: droppedWeight
    };
  }

  /* Proportion of respondents whose answer falls in a set of categories,
   * for example "strongly favor" plus "somewhat favor" reported as total
   * support.
   *
   * This collapses at the case level. Adding the two separate confidence
   * intervals together would give the wrong answer, because the two
   * categories are not independent: every respondent who is in one is
   * necessarily not in the other. */
  function collapsedProportion(rows, varName, yesValues, weightVar, missingCodes) {
    var yesW = 0, totW = 0, yesN = 0, used = [];
    var set = yesValues.map(String);

    for (var i = 0; i < rows.length; i++) {
      var w = weightOf(rows[i], weightVar);
      if (w === null) continue;
      var v = rows[i][varName];
      if (isMissing(v, missingCodes)) continue;
      totW += w;
      used.push(w);
      if (set.indexOf(String(v)) !== -1) { yesW += w; yesN += 1; }
    }

    if (totW === 0) return null;
    var design = effectiveN(used);
    var p = yesW / totW;
    var se = design.nEff > 0 ? Math.sqrt(p * (1 - p) / design.nEff) : NaN;
    return {
      p: p, se: se, moe: 1.959964 * se,
      n: used.length, yesN: yesN, nEff: design.nEff, design: design
    };
  }

  // --------------------------------------------------------------- crosstab

  /* rows x cols weighted crosstab.
   * Returns row categories, column categories, weighted cell matrix,
   * unweighted cell matrix, row percentages, and a design-adjusted
   * chi-square test of independence. */
  function crosstab(rows, rowVar, colVar, weightVar, missingCodes) {
    var rowKeys = [], colKeys = [];
    var rowIx = new Map(), colIx = new Map();
    var cellsW = [], cellsN = [], usedW = [];

    function ensureRow(k) {
      if (!rowIx.has(k)) {
        rowIx.set(k, rowKeys.length);
        rowKeys.push(k);
        cellsW.push([]);
        cellsN.push([]);
        for (var j = 0; j < colKeys.length; j++) {
          cellsW[cellsW.length - 1].push(0);
          cellsN[cellsN.length - 1].push(0);
        }
      }
      return rowIx.get(k);
    }
    function ensureCol(k) {
      if (!colIx.has(k)) {
        colIx.set(k, colKeys.length);
        colKeys.push(k);
        for (var i = 0; i < cellsW.length; i++) { cellsW[i].push(0); cellsN[i].push(0); }
      }
      return colIx.get(k);
    }

    for (var r = 0; r < rows.length; r++) {
      var row = rows[r];
      var w = weightOf(row, weightVar);
      if (w === null) continue;
      var rv = row[rowVar], cv = row[colVar];
      if (isMissing(rv, missingCodes) || isMissing(cv, missingCodes)) continue;
      var i = ensureRow(String(rv)), j = ensureCol(String(cv));
      cellsW[i][j] += w;
      cellsN[i][j] += 1;
      usedW.push(w);
    }

    var design = effectiveN(usedW);
    var totalW = design.sumW;

    // Row percentages (weighted), with CI on each using the row's own n_eff
    var rowPct = [], rowTotalsW = [], rowTotalsN = [];
    for (var a = 0; a < rowKeys.length; a++) {
      var rtW = 0, rtN = 0;
      for (var b = 0; b < colKeys.length; b++) { rtW += cellsW[a][b]; rtN += cellsN[a][b]; }
      rowTotalsW.push(rtW);
      rowTotalsN.push(rtN);
      // approximate row-level n_eff by scaling the overall design effect
      var rowNEff = design.deff > 0 ? rtN / design.deff : rtN;
      var pcts = [];
      for (var c = 0; c < colKeys.length; c++) {
        var p = rtW > 0 ? cellsW[a][c] / rtW : 0;
        var se = rowNEff > 0 ? Math.sqrt(p * (1 - p) / rowNEff) : NaN;
        pcts.push({ p: p, se: se, moe: 1.959964 * se, w: cellsW[a][c], n: cellsN[a][c] });
      }
      rowPct.push(pcts);
    }

    var colTotalsW = [], colTotalsN = [];
    for (var d = 0; d < colKeys.length; d++) {
      var ctW = 0, ctN = 0;
      for (var e = 0; e < rowKeys.length; e++) { ctW += cellsW[e][d]; ctN += cellsN[e][d]; }
      colTotalsW.push(ctW);
      colTotalsN.push(ctN);
    }

    var test = chiSquareTest(cellsW, totalW, design.nEff);

    return {
      rowVar: rowVar, colVar: colVar,
      rowKeys: rowKeys, colKeys: colKeys,
      cellsW: cellsW, cellsN: cellsN,
      rowPct: rowPct,
      rowTotalsW: rowTotalsW, rowTotalsN: rowTotalsN,
      colTotalsW: colTotalsW, colTotalsN: colTotalsN,
      totalW: totalW, totalN: design.n,
      design: design,
      test: test
    };
  }

  /* Pearson chi-square computed on the weighted table rescaled so that the
   * grand total equals the effective sample size. This is the first-order
   * Rao-Scott correction: it divides the naive weighted chi-square by the
   * design effect. It is an approximation, not a full Taylor-series survey
   * variance estimate. */
  function chiSquareTest(cellsW, totalW, nEff) {
    var R = cellsW.length;
    if (R === 0) return null;
    var C = cellsW[0].length;
    if (R < 2 || C < 2) return null;

    var scale = totalW > 0 ? nEff / totalW : 0;
    var obs = [], rowT = new Array(R).fill(0), colT = new Array(C).fill(0), tot = 0;
    for (var i = 0; i < R; i++) {
      obs.push([]);
      for (var j = 0; j < C; j++) {
        var o = cellsW[i][j] * scale;
        obs[i].push(o);
        rowT[i] += o; colT[j] += o; tot += o;
      }
    }
    var chi2 = 0, minExp = Infinity;
    for (var a = 0; a < R; a++) {
      for (var b = 0; b < C; b++) {
        var exp = tot > 0 ? (rowT[a] * colT[b]) / tot : 0;
        if (exp < minExp) minExp = exp;
        if (exp > 0) chi2 += Math.pow(obs[a][b] - exp, 2) / exp;
      }
    }
    var df = (R - 1) * (C - 1);
    var minDim = Math.min(R - 1, C - 1);
    return {
      chi2: chi2,
      df: df,
      p: chiSquareP(chi2, df),
      cramersV: tot > 0 && minDim > 0 ? Math.sqrt(chi2 / (tot * minDim)) : NaN,
      minExpected: minExp,
      nEff: nEff,
      smallCells: minExp < 5
    };
  }

  // ------------------------------------------------ paired items (the gap)

  /* The NIMBY comparison. Two items asked of the same respondents, each
   * collapsed to a yes/no indicator by the caller's category lists.
   *
   * Builds the 2x2 table of (item A yes/no) x (item B yes/no) on cases that
   * answered BOTH, then reports:
   *   pA, pB          weighted proportion saying yes to each
   *   gap = pA - pB   the within-respondent difference
   *   b, c            the discordant cells (yes-A/no-B and no-A/yes-B)
   *   McNemar test on the discordant cells
   *
   * McNemar is the right test here because the two percentages come from the
   * same people and are therefore correlated. Comparing them with two
   * independent-sample tests overstates the uncertainty. */
  function pairedGap(rows, varA, yesA, varB, yesB, weightVar, missingCodes) {
    function inSet(v, set) {
      var s = String(v);
      for (var i = 0; i < set.length; i++) if (String(set[i]) === s) return true;
      return false;
    }

    var a = 0, b = 0, c = 0, d = 0;      // weighted 2x2
    var an = 0, bn = 0, cn = 0, dn = 0;  // unweighted 2x2
    var used = [], excluded = 0;

    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var w = weightOf(row, weightVar);
      if (w === null) { excluded++; continue; }
      var va = row[varA], vb = row[varB];
      if (isMissing(va, missingCodes) || isMissing(vb, missingCodes)) { excluded++; continue; }
      var ya = inSet(va, yesA), yb = inSet(vb, yesB);
      // a case whose answer is neither in the yes list nor a plain
      // non-missing "no" is still counted as no; the caller controls this
      // by choosing which categories count as yes.
      if (ya && yb) { a += w; an++; }
      else if (ya && !yb) { b += w; bn++; }
      else if (!ya && yb) { c += w; cn++; }
      else { d += w; dn++; }
      used.push(w);
    }

    var design = effectiveN(used);
    var totW = a + b + c + d;
    if (totW === 0) return null;

    var pA = (a + b) / totW;
    var pB = (a + c) / totW;
    var gap = pA - pB;

    // Variance of the difference between two correlated proportions:
    //   var(d) = (pb + pc - (pb - pc)^2) / n_eff
    var pb = b / totW, pc = c / totW;
    var varGap = design.nEff > 0 ? (pb + pc - Math.pow(pb - pc, 2)) / design.nEff : NaN;
    var seGap = Math.sqrt(varGap);

    // McNemar on discordant cells, scaled to the effective sample size
    var scale = design.nEff / totW;
    var B = b * scale, Cc = c * scale;
    var mc = null;
    if (B + Cc > 0) {
      var stat = Math.pow(Math.abs(B - Cc) - 1, 2) / (B + Cc); // continuity corrected
      if (Math.abs(B - Cc) < 1) stat = 0;
      mc = {
        chi2: stat,
        df: 1,
        p: chiSquareP(stat, 1),
        discordantEff: B + Cc,
        sparse: (B + Cc) < 10
      };
    }

    return {
      varA: varA, varB: varB,
      cellsW: { bothYes: a, aOnly: b, bOnly: c, neither: d },
      cellsN: { bothYes: an, aOnly: bn, bOnly: cn, neither: dn },
      pA: pA, pB: pB, gap: gap,
      seGap: seGap,
      moeGap: 1.959964 * seGap,
      seA: Math.sqrt(pA * (1 - pA) / design.nEff),
      seB: Math.sqrt(pB * (1 - pB) / design.nEff),
      mcnemar: mc,
      design: design,
      totalW: totW,
      excluded: excluded
    };
  }

  /* Run pairedGap separately within each category of a third variable, so
   * the gap can be compared across groups (party, age, urbanicity, state). */
  function gapByGroup(rows, varA, yesA, varB, yesB, groupVar, weightVar, missingCodes) {
    var buckets = new Map();
    for (var i = 0; i < rows.length; i++) {
      var g = rows[i][groupVar];
      if (isMissing(g, missingCodes)) continue;
      var k = String(g);
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k).push(rows[i]);
    }
    var out = [];
    buckets.forEach(function (subset, k) {
      var res = pairedGap(subset, varA, yesA, varB, yesB, weightVar, missingCodes);
      if (res) { res.group = k; out.push(res); }
    });
    return out;
  }

  // ------------------------------------------- chi-square tail probability

  function logGamma(x) {
    var cof = [76.18009172947146, -86.50532032941677, 24.01409824083091,
               -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
    var y = x, tmp = x + 5.5;
    tmp -= (x + 0.5) * Math.log(tmp);
    var ser = 1.000000000190015;
    for (var j = 0; j < 6; j++) { y += 1; ser += cof[j] / y; }
    return -tmp + Math.log(2.5066282746310005 * ser / x);
  }

  /* Regularized lower incomplete gamma P(a,x), series and continued-fraction
   * branches (Numerical Recipes). */
  function gammaP(a, x) {
    if (x <= 0) return 0;
    if (x < a + 1) {
      var ap = a, sum = 1 / a, del = sum;
      for (var n = 1; n < 300; n++) {
        ap += 1;
        del *= x / ap;
        sum += del;
        if (Math.abs(del) < Math.abs(sum) * 1e-14) break;
      }
      return sum * Math.exp(-x + a * Math.log(x) - logGamma(a));
    }
    // continued fraction for Q(a,x), then P = 1 - Q
    var tiny = 1e-300;
    var bq = x + 1 - a, cq = 1 / tiny, dq = 1 / bq, h = dq;
    for (var i = 1; i < 300; i++) {
      var an = -i * (i - a);
      bq += 2;
      dq = an * dq + bq; if (Math.abs(dq) < tiny) dq = tiny;
      cq = bq + an / cq; if (Math.abs(cq) < tiny) cq = tiny;
      dq = 1 / dq;
      var delt = dq * cq;
      h *= delt;
      if (Math.abs(delt - 1) < 1e-14) break;
    }
    var q = Math.exp(-x + a * Math.log(x) - logGamma(a)) * h;
    return 1 - q;
  }

  /* Upper tail: P(chi2_df > value) */
  function chiSquareP(value, df) {
    if (!isFinite(value) || value <= 0) return 1;
    if (df <= 0) return NaN;
    return 1 - gammaP(df / 2, value / 2);
  }

  // ------------------------------------------------------------------ misc

  function formatP(p) {
    if (p === null || p === undefined || isNaN(p)) return '\u2014';
    if (p < 0.001) return 'p < 0.001';
    return 'p = ' + p.toFixed(3);
  }

  function pct(x, digits) {
    if (x === null || x === undefined || isNaN(x)) return '\u2014';
    return (100 * x).toFixed(digits === undefined ? 1 : digits) + '%';
  }

  global.Stats = {
    isMissing: isMissing,
    effectiveN: effectiveN,
    frequencies: frequencies,
    collapsedProportion: collapsedProportion,
    crosstab: crosstab,
    chiSquareTest: chiSquareTest,
    chiSquareP: chiSquareP,
    pairedGap: pairedGap,
    gapByGroup: gapByGroup,
    formatP: formatP,
    pct: pct
  };
})(window);
