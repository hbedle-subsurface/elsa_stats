/* regression.js — survey-weighted regression.
 *
 * Two models, both fitted with the survey weights and both using a
 * design-based sandwich variance estimator:
 *
 *   linear   the linear probability model. A 0/1 outcome regressed by
 *            weighted least squares. Coefficients read directly as changes
 *            in the probability of the outcome, in percentage points,
 *            which is the same unit the rest of the tool reports.
 *
 *   logistic weighted logistic regression, fitted by iteratively
 *            reweighted least squares. Coefficients are log odds ratios,
 *            so average marginal effects are computed alongside them to
 *            give a number in percentage points.
 *
 * The variance estimator in both cases is
 *
 *     V = A^-1 ( sum_i w_i^2 s_i s_i' ) A^-1
 *
 * where s_i is case i's score contribution. For a design with unequal
 * weights and no clustering this is the standard design-based estimator,
 * and it matches what a survey package reports. It does NOT account for
 * clustering or stratification; see docs/METHODS.md.
 */

(function (global) {
  'use strict';

  // ------------------------------------------------------- linear algebra

  function zeros(r, c) {
    var m = [];
    for (var i = 0; i < r; i++) { m.push(new Array(c).fill(0)); }
    return m;
  }

  /* Gauss-Jordan inversion with partial pivoting. Returns null when the
   * matrix is singular, which in practice means two predictors carry the
   * same information. */
  function invert(A) {
    var n = A.length;
    var M = A.map(function (row, i) {
      return row.slice().concat(row.map(function (_, j) { return i === j ? 1 : 0; }));
    });

    for (var col = 0; col < n; col++) {
      var pivot = col, best = Math.abs(M[col][col]);
      for (var r = col + 1; r < n; r++) {
        if (Math.abs(M[r][col]) > best) { best = Math.abs(M[r][col]); pivot = r; }
      }
      if (best < 1e-11) return null;
      if (pivot !== col) { var t = M[col]; M[col] = M[pivot]; M[pivot] = t; }

      var d = M[col][col];
      for (var k = 0; k < 2 * n; k++) M[col][k] /= d;

      for (var r2 = 0; r2 < n; r2++) {
        if (r2 === col) continue;
        var f = M[r2][col];
        if (f === 0) continue;
        for (var k2 = 0; k2 < 2 * n; k2++) M[r2][k2] -= f * M[col][k2];
      }
    }
    return M.map(function (row) { return row.slice(n); });
  }

  function matVec(A, v) {
    return A.map(function (row) {
      var s = 0;
      for (var j = 0; j < v.length; j++) s += row[j] * v[j];
      return s;
    });
  }

  function sandwich(Ainv, B) {
    var n = Ainv.length;
    var AB = zeros(n, n);
    for (var i = 0; i < n; i++) {
      for (var j = 0; j < n; j++) {
        var s = 0;
        for (var k = 0; k < n; k++) s += Ainv[i][k] * B[k][j];
        AB[i][j] = s;
      }
    }
    var V = zeros(n, n);
    for (var a = 0; a < n; a++) {
      for (var b = 0; b < n; b++) {
        var s2 = 0;
        for (var k2 = 0; k2 < n; k2++) s2 += AB[a][k2] * Ainv[k2][b];
        V[a][b] = s2;
      }
    }
    return V;
  }

  // -------------------------------------------------------- design matrix

  /* Builds X from a list of predictor specifications.
   *
   * spec: {name, type:'categorical'|'numeric', levels:[...], reference:value}
   *
   * A categorical predictor becomes one indicator column per level except
   * the reference level. Coefficients are then differences from that
   * reference, so which level is the reference changes how the numbers
   * read but not what the model says.
   */
  function buildDesign(rows, outcomeSpec, predictors, weightVar, missingCodes) {
    var terms = [{ label: '(intercept)', kind: 'intercept' }];

    predictors.forEach(function (p) {
      if (p.type === 'numeric') {
        terms.push({ label: p.name, kind: 'numeric', variable: p.name });
      } else {
        p.levels.forEach(function (lv) {
          if (String(lv) === String(p.reference)) return;
          terms.push({
            label: p.name + ': ' + lv,
            kind: 'dummy', variable: p.name, level: lv, reference: p.reference
          });
        });
      }
    });

    var X = [], y = [], w = [], kept = [], dropped = 0;
    var yesSet = outcomeSpec.yes.map(String);

    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];

      var wi = weightVar ? parseFloat(row[weightVar]) : 1;
      if (!isFinite(wi) || wi < 0) { dropped++; continue; }

      var yv = row[outcomeSpec.name];
      if (Stats.isMissing(yv, missingCodes)) { dropped++; continue; }
      if (outcomeSpec.drop && outcomeSpec.drop.map(String).indexOf(String(yv)) !== -1) {
        dropped++; continue;
      }

      // every predictor must be present: listwise deletion
      var ok = true, xrow = [1];
      for (var pi = 0; pi < predictors.length && ok; pi++) {
        var p = predictors[pi];
        var pv = row[p.name];
        if (Stats.isMissing(pv, missingCodes)) { ok = false; break; }
        if (p.type === 'numeric') {
          var num = Number(pv);
          if (!isFinite(num)) { ok = false; break; }
          xrow.push(num);
        } else {
          if (p.levels.map(String).indexOf(String(pv)) === -1) { ok = false; break; }
          p.levels.forEach(function (lv) {
            if (String(lv) === String(p.reference)) return;
            xrow.push(String(pv) === String(lv) ? 1 : 0);
          });
        }
      }
      if (!ok) { dropped++; continue; }

      X.push(xrow);
      y.push(yesSet.indexOf(String(yv)) !== -1 ? 1 : 0);
      w.push(wi);
      kept.push(i);
    }

    return { X: X, y: y, w: w, terms: terms, dropped: dropped, kept: kept };
  }

  // ------------------------------------------------ weighted least squares

  function fitLinear(X, y, w) {
    var n = X.length, k = X[0].length;

    var XtWX = zeros(k, k), XtWy = new Array(k).fill(0);
    for (var i = 0; i < n; i++) {
      var xi = X[i], wi = w[i];
      for (var a = 0; a < k; a++) {
        XtWy[a] += wi * xi[a] * y[i];
        for (var b = a; b < k; b++) {
          var v = wi * xi[a] * xi[b];
          XtWX[a][b] += v;
          if (a !== b) XtWX[b][a] += v;
        }
      }
    }

    var Ainv = invert(XtWX);
    if (!Ainv) return null;
    var beta = matVec(Ainv, XtWy);

    // residuals and the meat of the sandwich
    var B = zeros(k, k);
    var sumW = 0, sumWy = 0, ssr = 0, sst = 0;
    for (var i2 = 0; i2 < n; i2++) { sumW += w[i2]; sumWy += w[i2] * y[i2]; }
    var ybar = sumWy / sumW;

    var fitted = new Array(n);
    for (var i3 = 0; i3 < n; i3++) {
      var xi3 = X[i3], f = 0;
      for (var j = 0; j < k; j++) f += xi3[j] * beta[j];
      fitted[i3] = f;
      var e = y[i3] - f;
      ssr += w[i3] * e * e;
      sst += w[i3] * Math.pow(y[i3] - ybar, 2);
      var we = w[i3] * e;
      for (var a2 = 0; a2 < k; a2++) {
        for (var b2 = 0; b2 < k; b2++) {
          B[a2][b2] += we * we * xi3[a2] * xi3[b2];
        }
      }
    }

    var V = sandwich(Ainv, B);

    return {
      beta: beta,
      V: V,
      se: beta.map(function (_, j) { return Math.sqrt(V[j][j]); }),
      n: n, k: k,
      r2: sst > 0 ? 1 - ssr / sst : NaN,
      fitted: fitted
    };
  }

  // --------------------------------------------- weighted logistic (IRLS)

  function logistic(x) {
    if (x >= 0) { var e = Math.exp(-x); return 1 / (1 + e); }
    var e2 = Math.exp(x);
    return e2 / (1 + e2);
  }

  function fitLogistic(X, y, w, maxIter, tol) {
    maxIter = maxIter || 60;
    tol = tol || 1e-10;
    var n = X.length, k = X[0].length;
    var beta = new Array(k).fill(0);
    var converged = false, iter = 0, Ainv = null, mu = new Array(n);

    for (iter = 0; iter < maxIter; iter++) {
      var A = zeros(k, k), score = new Array(k).fill(0);

      for (var i = 0; i < n; i++) {
        var xi = X[i], eta = 0;
        for (var j = 0; j < k; j++) eta += xi[j] * beta[j];
        var m = logistic(eta);
        mu[i] = m;
        var vv = m * (1 - m);
        if (vv < 1e-10) vv = 1e-10;
        var aw = w[i] * vv;
        var resid = w[i] * (y[i] - m);
        for (var a = 0; a < k; a++) {
          score[a] += resid * xi[a];
          for (var b = a; b < k; b++) {
            var val = aw * xi[a] * xi[b];
            A[a][b] += val;
            if (a !== b) A[b][a] += val;
          }
        }
      }

      Ainv = invert(A);
      if (!Ainv) return null;
      var step = matVec(Ainv, score);

      var maxStep = 0;
      for (var s = 0; s < k; s++) {
        beta[s] += step[s];
        maxStep = Math.max(maxStep, Math.abs(step[s]));
      }
      if (maxStep < tol) { converged = true; break; }
    }

    // recompute mu and the information matrix at the solution
    var A2 = zeros(k, k), B = zeros(k, k);
    var llFull = 0, sumW = 0, sumWy = 0;
    for (var i2 = 0; i2 < n; i2++) {
      var xi2 = X[i2], eta2 = 0;
      for (var j2 = 0; j2 < k; j2++) eta2 += xi2[j2] * beta[j2];
      var m2 = logistic(eta2);
      mu[i2] = m2;
      var v2 = Math.max(m2 * (1 - m2), 1e-10);
      var aw2 = w[i2] * v2;
      var r2 = w[i2] * (y[i2] - m2);
      for (var a3 = 0; a3 < k; a3++) {
        for (var b3 = 0; b3 < k; b3++) {
          A2[a3][b3] += aw2 * xi2[a3] * xi2[b3];
          B[a3][b3] += r2 * r2 * xi2[a3] * xi2[b3];
        }
      }
      var pm = Math.min(Math.max(m2, 1e-12), 1 - 1e-12);
      llFull += w[i2] * (y[i2] * Math.log(pm) + (1 - y[i2]) * Math.log(1 - pm));
      sumW += w[i2];
      sumWy += w[i2] * y[i2];
    }

    var Ainv2 = invert(A2);
    if (!Ainv2) return null;
    var V = sandwich(Ainv2, B);

    // McFadden pseudo R-squared against the intercept-only model
    var pbar = sumWy / sumW;
    var llNull = sumW * (pbar * Math.log(pbar) + (1 - pbar) * Math.log(1 - pbar));

    return {
      beta: beta,
      V: V,
      se: beta.map(function (_, j) { return Math.sqrt(V[j][j]); }),
      n: n, k: k,
      converged: converged,
      iterations: iter + 1,
      mu: mu,
      logLik: llFull,
      pseudoR2: llNull !== 0 ? 1 - llFull / llNull : NaN
    };
  }

  // -------------------------------------------- average marginal effects

  /* For a dummy term: the average change in predicted probability from
   * setting that indicator to 1 for everybody versus 0 for everybody,
   * holding every other predictor at its observed value. This is the
   * number to report from a logistic model, because a log odds ratio is
   * not a quantity anyone has intuitions about.
   *
   * For a numeric term: the average derivative, per one-unit change.
   *
   * Standard errors use the delta method on the same sandwich covariance
   * matrix. */
  function marginalEffects(X, w, beta, V, terms, kind) {
    var n = X.length, k = beta.length;
    var sumW = 0;
    for (var i = 0; i < n; i++) sumW += w[i];

    return terms.map(function (term, j) {
      if (term.kind === 'intercept') return null;

      if (kind === 'linear') {
        // in a linear model the coefficient already is the marginal effect
        return { ame: beta[j], se: Math.sqrt(V[j][j]) };
      }

      var ame = 0;
      var grad = new Array(k).fill(0);

      for (var i2 = 0; i2 < n; i2++) {
        var xi = X[i2];

        if (term.kind === 'dummy') {
          var x1 = xi.slice(), x0 = xi.slice();
          // all dummies of the same variable go to zero, then this one to one
          terms.forEach(function (t2, j2) {
            if (t2.kind === 'dummy' && t2.variable === term.variable) { x1[j2] = 0; x0[j2] = 0; }
          });
          x1[j] = 1;

          var e1 = 0, e0 = 0;
          for (var a = 0; a < k; a++) { e1 += x1[a] * beta[a]; e0 += x0[a] * beta[a]; }
          var p1 = logistic(e1), p0 = logistic(e0);
          ame += w[i2] * (p1 - p0);

          var d1 = p1 * (1 - p1), d0 = p0 * (1 - p0);
          for (var b = 0; b < k; b++) {
            grad[b] += w[i2] * (d1 * x1[b] - d0 * x0[b]);
          }
        } else {
          var eta = 0;
          for (var c = 0; c < k; c++) eta += xi[c] * beta[c];
          var p = logistic(eta), d = p * (1 - p);
          ame += w[i2] * d * beta[j];
          for (var b2 = 0; b2 < k; b2++) {
            // d/dbeta_b of [ p(1-p) * beta_j ]
            grad[b2] += w[i2] * (d * (1 - 2 * p) * xi[b2] * beta[j] + (b2 === j ? d : 0));
          }
        }
      }

      ame /= sumW;
      for (var g = 0; g < k; g++) grad[g] /= sumW;

      var varAme = 0;
      for (var r = 0; r < k; r++) {
        for (var s = 0; s < k; s++) varAme += grad[r] * V[r][s] * grad[s];
      }

      return { ame: ame, se: Math.sqrt(Math.max(varAme, 0)) };
    });
  }

  /* Predicted probability for each level of one categorical predictor,
   * averaged over the observed values of everything else. These are
   * adjusted predictions: what the model says support would be if the whole
   * sample had that characteristic and kept everything else. */
  function adjustedPredictions(X, w, beta, terms, variable, levels, reference, kind) {
    var n = X.length, k = beta.length, sumW = 0;
    for (var i = 0; i < n; i++) sumW += w[i];

    return levels.map(function (lv) {
      var total = 0;
      for (var i2 = 0; i2 < n; i2++) {
        var x = X[i2].slice();
        terms.forEach(function (t, j) {
          if (t.kind === 'dummy' && t.variable === variable) {
            x[j] = (String(t.level) === String(lv)) ? 1 : 0;
          }
        });
        var eta = 0;
        for (var a = 0; a < k; a++) eta += x[a] * beta[a];
        total += w[i2] * (kind === 'linear' ? eta : logistic(eta));
      }
      return { level: lv, p: total / sumW, isReference: String(lv) === String(reference) };
    });
  }

  // ------------------------------------------------------------ front door

  /* Fit and package a model.
   *
   * outcomeSpec: {name, yes:[values], drop:[values]}
   * predictors:  [{name, type, levels, reference}]
   */
  function fit(rows, outcomeSpec, predictors, weightVar, missingCodes, kind) {
    var d = buildDesign(rows, outcomeSpec, predictors, weightVar, missingCodes);

    if (d.X.length < d.terms.length + 10) {
      return { error: 'Too few complete cases (' + d.X.length + ') for ' +
        d.terms.length + ' terms. Drop a predictor or combine categories.' };
    }

    var anyOne = d.y.some(function (v) { return v === 1; });
    var anyZero = d.y.some(function (v) { return v === 0; });
    if (!anyOne || !anyZero) {
      return { error: 'The outcome does not vary: every complete case is on the same side. ' +
        'Check which response options are marked as support.' };
    }

    var f = (kind === 'logistic') ? fitLogistic(d.X, d.y, d.w) : fitLinear(d.X, d.y, d.w);
    if (!f) {
      return { error: 'The model could not be fitted. Two predictors probably carry the same ' +
        'information, or a category has no cases left after listwise deletion.' };
    }

    var design = Stats.effectiveN(d.w);
    var me = marginalEffects(d.X, d.w, f.beta, f.V, d.terms, kind);

    var coefs = d.terms.map(function (t, j) {
      var z = f.se[j] > 0 ? f.beta[j] / f.se[j] : NaN;
      return {
        label: t.label,
        kind: t.kind,
        variable: t.variable,
        level: t.level,
        reference: t.reference,
        beta: f.beta[j],
        se: f.se[j],
        z: z,
        p: isFinite(z) ? Stats.chiSquareP(z * z, 1) : NaN,
        lo: f.beta[j] - 1.959964 * f.se[j],
        hi: f.beta[j] + 1.959964 * f.se[j],
        oddsRatio: kind === 'logistic' ? Math.exp(f.beta[j]) : null,
        ame: me[j] ? me[j].ame : null,
        ameSE: me[j] ? me[j].se : null
      };
    });

    return {
      kind: kind,
      coefficients: coefs,
      terms: d.terms,
      X: d.X, y: d.y, w: d.w,
      beta: f.beta,
      n: f.n,
      nEff: design.nEff,
      deff: design.deff,
      dropped: d.dropped,
      r2: f.r2,
      pseudoR2: f.pseudoR2,
      converged: f.converged === undefined ? true : f.converged,
      iterations: f.iterations,
      outcomeMean: (function () {
        var sw = 0, swy = 0;
        for (var i = 0; i < d.w.length; i++) { sw += d.w[i]; swy += d.w[i] * d.y[i]; }
        return swy / sw;
      })()
    };
  }

  global.Regression = {
    fit: fit,
    buildDesign: buildDesign,
    fitLinear: fitLinear,
    fitLogistic: fitLogistic,
    adjustedPredictions: adjustedPredictions,
    invert: invert,
    logistic: logistic
  };
})(window);
