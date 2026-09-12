/* charts.js — SVG charts drawn directly, no plotting library.
 *
 * Every percentage axis is fixed to 0-100. Axes are never scaled to the
 * data: a subgroup with a small spread should look like a small spread,
 * not get stretched to fill the panel.
 *
 * Each chart returns its SVG element so the caller can hand it to
 * downloadSVG() for a poster or a figure.
 */

(function (global) {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';

  function el(name, attrs, text) {
    var n = document.createElementNS(NS, name);
    if (attrs) Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function svgRoot(w, h) {
    var s = el('svg', {
      viewBox: '0 0 ' + w + ' ' + h,
      width: '100%',
      preserveAspectRatio: 'xMinYMin meet',
      'font-family': 'var(--font-ui)',
      role: 'img'
    });
    return s;
  }

  /* The palette is defined in css/style.css so that restyling the tool
   * never means editing this file. Values are read once, on first use. */
  var PALETTE = null;

  function palette() {
    if (PALETTE) return PALETTE;
    var cs = getComputedStyle(document.documentElement);
    function v(name, fallback) {
      var got = cs.getPropertyValue(name).trim();
      return got || fallback;
    }
    PALETTE = {
      support: [v('--c-support-1', '#114F45'), v('--c-support-2', '#6FA893')],
      middle: v('--c-middle', '#C0CCC6'),
      oppose: [v('--c-oppose-2', '#D8A860'), v('--c-oppose-1', '#9C5F26')],
      seriesA: v('--c-series-a', '#114F45'),
      seriesB: v('--c-series-b', '#9C5F26'),
      neutral: v('--c-neutral', '#B7C6C0'),
      positive: v('--c-positive', '#1D7A5F'),
      negative: v('--c-negative', '#9C5F26')
    };
    return PALETTE;
  }

  function supportColors(nSupport, nOppose, hasMiddle) {
    var P = palette();
    var out = [];
    for (var i = 0; i < nSupport; i++) {
      out.push(mix(P.support[0], P.support[1], nSupport === 1 ? 0 : i / (nSupport - 1)));
    }
    if (hasMiddle) out.push(P.middle);
    for (var j = 0; j < nOppose; j++) {
      out.push(mix(P.oppose[0], P.oppose[1], nOppose === 1 ? 0 : j / (nOppose - 1)));
    }
    return out;
  }

  function parseColor(c) {
    c = String(c).trim();
    if (c[0] === '#') {
      if (c.length === 4) {
        return [parseInt(c[1] + c[1], 16), parseInt(c[2] + c[2], 16), parseInt(c[3] + c[3], 16)];
      }
      return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
    }
    var m = c.match(/(\d+(?:\.\d+)?)/g);
    if (m && m.length >= 3) return [Number(m[0]), Number(m[1]), Number(m[2])];
    return [128, 128, 128];
  }

  function mix(a, b, t) {
    var x = parseColor(a), y = parseColor(b);
    var r = Math.round(x[0] + (y[0] - x[0]) * t),
        g = Math.round(x[1] + (y[1] - x[1]) * t),
        bl = Math.round(x[2] + (y[2] - x[2]) * t);
    return 'rgb(' + r + ',' + g + ',' + bl + ')';
  }

  // ------------------------------------------------------ percentage axis

  function percentAxis(parent, x0, x1, y, opts) {
    opts = opts || {};
    var step = opts.step || 25;
    var g = el('g', { class: 'axis' });
    g.appendChild(el('line', { x1: x0, x2: x1, y1: y, y2: y, stroke: 'var(--rule)', 'stroke-width': 1 }));
    for (var p = 0; p <= 100; p += step) {
      var x = x0 + (x1 - x0) * (p / 100);
      g.appendChild(el('line', { x1: x, x2: x, y1: y, y2: y + 4, stroke: 'var(--rule)', 'stroke-width': 1 }));
      g.appendChild(el('text', {
        x: x, y: y + 16, 'text-anchor': 'middle',
        'font-size': 10, fill: 'var(--slate)'
      }, p + '%'));
    }
    parent.appendChild(g);
    return g;
  }

  function gridlines(parent, x0, x1, yTop, yBottom, step) {
    step = step || 25;
    var g = el('g');
    for (var p = step; p < 100; p += step) {
      var x = x0 + (x1 - x0) * (p / 100);
      g.appendChild(el('line', {
        x1: x, x2: x, y1: yTop, y2: yBottom,
        stroke: 'var(--grid)', 'stroke-width': 1
      }));
    }
    parent.appendChild(g);
  }

  // ------------------------------------------- diverging stacked bar chart

  /* series: [{label, segments:[{name, p}], nEff}]
   * order of segments must run support -> middle -> oppose.
   * splitAfter = index after which opposition starts (the zero line). */
  function divergingBars(container, series, segmentNames, splitAfter, opts) {
    opts = opts || {};
    container.innerHTML = '';
    var labelW = opts.labelWidth || 150;
    var rowH = 30, gap = 10, padTop = 8, padBottom = 46, padRight = 48;
    var W = 760, plotX0 = labelW, plotX1 = W - padRight;
    var H = padTop + series.length * (rowH + gap) + padBottom;
    var svg = svgRoot(W, H);

    var nSup = splitAfter + 1;
    var hasMiddle = !!opts.hasMiddle;
    var nOpp = segmentNames.length - nSup - (hasMiddle ? 1 : 0);
    var colors = supportColors(nSup, nOpp, hasMiddle);

    gridlines(svg, plotX0, plotX1, padTop, padTop + series.length * (rowH + gap) - gap);

    series.forEach(function (s, ix) {
      var y = padTop + ix * (rowH + gap);

      svg.appendChild(el('text', {
        x: labelW - 10, y: y + rowH / 2 + 4, 'text-anchor': 'end',
        'font-size': 12, fill: 'var(--ink)'
      }, s.label));

      var x = plotX0;
      var supportTotal = 0;
      s.segments.forEach(function (seg, si) {
        var w = (plotX1 - plotX0) * seg.p;
        if (w > 0) {
          var rect = el('rect', {
            x: x, y: y, width: w, height: rowH,
            fill: colors[si], stroke: 'var(--paper)', 'stroke-width': 0.5
          });
          rect.appendChild(el('title', {}, seg.name + ': ' + (100 * seg.p).toFixed(1) + '%'));
          svg.appendChild(rect);
          if (w > 34) {
            svg.appendChild(el('text', {
              x: x + w / 2, y: y + rowH / 2 + 4, 'text-anchor': 'middle',
              'font-size': 11, fill: si < nSup ? '#FFFFFF' : (si === nSup && hasMiddle ? 'var(--ink)' : '#FFFFFF'),
              'font-variant-numeric': 'tabular-nums'
            }, Math.round(100 * seg.p) + ''));
          }
        }
        if (si <= splitAfter) supportTotal += seg.p;
        x += w;
      });

      // combined support printed at the right edge, for scale items only
      if (opts.showNet) {
        svg.appendChild(el('text', {
          x: plotX1 + 8, y: y + rowH / 2 + 4, 'text-anchor': 'start',
          'font-size': 11, fill: 'var(--slate)', 'font-variant-numeric': 'tabular-nums'
        }, Math.round(100 * supportTotal) + '%'));
      }
    });

    var axisY = padTop + series.length * (rowH + gap) - gap;
    percentAxis(svg, plotX0, plotX1, axisY);

    if (opts.showNet) {
      svg.appendChild(el('text', {
        x: plotX1 + 8, y: axisY + 16, 'text-anchor': 'start',
        'font-size': 9, fill: 'var(--slate)'
      }, 'support'));
    }

    container.appendChild(svg);
    container.appendChild(legend(segmentNames, colors));
    return svg;
  }

  function legend(names, colors) {
    var wrap = document.createElement('div');
    wrap.className = 'legend';
    names.forEach(function (n, i) {
      var item = document.createElement('span');
      item.className = 'legend-item';
      var sw = document.createElement('span');
      sw.className = 'legend-swatch';
      sw.style.background = colors[i];
      item.appendChild(sw);
      item.appendChild(document.createTextNode(n));
      wrap.appendChild(item);
    });
    return wrap;
  }

  // --------------------------------------------------- dumbbell / gap plot

  /* The NIMBY picture. One row per group, two dots joined by a line:
   * left dot = support for the general item, right dot = support for the
   * local item. The length of the connector IS the gap.
   * groups: [{label, pA, moeA, pB, moeB, gap, moeGap, nEff, sig}] */
  function gapPlot(container, groups, opts) {
    opts = opts || {};
    container.innerHTML = '';
    var labelW = opts.labelWidth || 150;
    var rowH = 26, padTop = 26, padBottom = 46, padRight = 128;
    var W = 760, plotX0 = labelW, plotX1 = W - padRight;
    var H = padTop + groups.length * rowH + padBottom;
    var svg = svgRoot(W, H);

    var P = palette();
    var cA = P.seriesA, cB = P.seriesB;

    gridlines(svg, plotX0, plotX1, padTop - 8, padTop + groups.length * rowH - 6);

    // Colour key, placed above the plot. The dots are not fixed to the
    // left or right of each other, so the key names them by colour rather
    // than by position.
    var keyX = plotX0;
    [[cA, opts.labelA || 'in general'], [cB, opts.labelB || 'locally']].forEach(function (k) {
      svg.appendChild(el('circle', { cx: keyX + 4, cy: 9, r: 4, fill: k[0] }));
      var t = el('text', { x: keyX + 13, y: 12.5, 'font-size': 10, fill: 'var(--slate)' }, k[1]);
      svg.appendChild(t);
      keyX += 20 + k[1].length * 5.4;
    });
    svg.appendChild(el('text', {
      x: plotX1 + 8, y: 12.5, 'font-size': 10, fill: 'var(--slate)'
    }, 'gap'));

    function X(p) { return plotX0 + (plotX1 - plotX0) * p; }

    groups.forEach(function (g, ix) {
      var y = padTop + ix * rowH + rowH / 2 - 6;

      svg.appendChild(el('text', {
        x: labelW - 10, y: y + 4, 'text-anchor': 'end', 'font-size': 12, fill: 'var(--ink)'
      }, g.label));

      var xa = X(g.pA), xb = X(g.pB);

      // connector
      svg.appendChild(el('line', {
        x1: xa, x2: xb, y1: y, y2: y,
        stroke: 'var(--slate)', 'stroke-width': 2, 'stroke-linecap': 'round', opacity: 0.45
      }));

      // error bars
      [[xa, g.moeA, cA], [xb, g.moeB, cB]].forEach(function (d) {
        if (!isFinite(d[1])) return;
        var lo = X(Math.max(0, (d[0] === xa ? g.pA : g.pB) - d[1]));
        var hi = X(Math.min(1, (d[0] === xa ? g.pA : g.pB) + d[1]));
        svg.appendChild(el('line', {
          x1: lo, x2: hi, y1: y, y2: y, stroke: d[2], 'stroke-width': 1, opacity: 0.8
        }));
      });

      var dotA = el('circle', { cx: xa, cy: y, r: 5, fill: cA });
      dotA.appendChild(el('title', {}, (opts.labelA || 'general') + ': ' + (100 * g.pA).toFixed(1) + '%'));
      svg.appendChild(dotA);

      var dotB = el('circle', { cx: xb, cy: y, r: 5, fill: cB });
      dotB.appendChild(el('title', {}, (opts.labelB || 'local') + ': ' + (100 * g.pB).toFixed(1) + '%'));
      svg.appendChild(dotB);

      var gapTxt = (g.gap >= 0 ? '\u2212' : '+') + Math.abs(100 * g.gap).toFixed(1) + ' pts';
      svg.appendChild(el('text', {
        x: plotX1 + 8, y: y + 4, 'font-size': 11,
        fill: 'var(--ink)', 'font-variant-numeric': 'tabular-nums'
      }, gapTxt));

      if (g.nEff !== undefined) {
        svg.appendChild(el('text', {
          x: plotX1 + 74, y: y + 4, 'font-size': 9, fill: 'var(--slate)',
          'font-variant-numeric': 'tabular-nums'
        }, 'n=' + Math.round(g.nEff)));
      }
    });

    percentAxis(svg, plotX0, plotX1, padTop + groups.length * rowH - 6);
    container.appendChild(svg);
    return svg;
  }

  // ------------------------------------------- bars with confidence bounds

  /* items: [{label, p, moe, n}] — single proportion per row. */
  function barsWithCI(container, items, opts) {
    opts = opts || {};
    container.innerHTML = '';
    var labelW = opts.labelWidth || 150;
    var rowH = 22, gap = 6, padTop = 8, padBottom = 46, padRight = 96;
    var W = 760, plotX0 = labelW, plotX1 = W - padRight;
    var H = padTop + items.length * (rowH + gap) + padBottom;
    var svg = svgRoot(W, H);
    var color = opts.color || palette().support[0];

    gridlines(svg, plotX0, plotX1, padTop, padTop + items.length * (rowH + gap) - gap);

    function X(p) { return plotX0 + (plotX1 - plotX0) * p; }

    items.forEach(function (it, ix) {
      var y = padTop + ix * (rowH + gap);
      svg.appendChild(el('text', {
        x: labelW - 10, y: y + rowH / 2 + 4, 'text-anchor': 'end', 'font-size': 12, fill: 'var(--ink)'
      }, it.label));

      var bar = el('rect', {
        x: plotX0, y: y, width: Math.max(0, X(it.p) - plotX0), height: rowH, fill: color
      });
      bar.appendChild(el('title', {}, it.label + ': ' + (100 * it.p).toFixed(1) + '%'));
      svg.appendChild(bar);

      if (isFinite(it.moe) && it.moe > 0) {
        var lo = X(Math.max(0, it.p - it.moe)), hi = X(Math.min(1, it.p + it.moe));
        var cy = y + rowH / 2;
        svg.appendChild(el('line', { x1: lo, x2: hi, y1: cy, y2: cy, stroke: 'var(--ink)', 'stroke-width': 1.25 }));
        svg.appendChild(el('line', { x1: lo, x2: lo, y1: cy - 4, y2: cy + 4, stroke: 'var(--ink)', 'stroke-width': 1.25 }));
        svg.appendChild(el('line', { x1: hi, x2: hi, y1: cy - 4, y2: cy + 4, stroke: 'var(--ink)', 'stroke-width': 1.25 }));
      }

      var txt = (100 * it.p).toFixed(1) + '%';
      if (isFinite(it.moe) && it.moe > 0) txt += ' \u00B1' + (100 * it.moe).toFixed(1);
      svg.appendChild(el('text', {
        x: plotX1 + 8, y: y + rowH / 2 + 4, 'font-size': 11, fill: 'var(--ink)',
        'font-variant-numeric': 'tabular-nums'
      }, txt));
    });

    percentAxis(svg, plotX0, plotX1, padTop + items.length * (rowH + gap) - gap);
    container.appendChild(svg);
    return svg;
  }

  // --------------------------------------------------------- 2x2 flow plot

  /* Where the NIMBY cases sit. Four blocks sized by weighted share,
   * with the two discordant cells called out. */
  function pairedSquare(container, gapResult, opts) {
    opts = opts || {};
    container.innerHTML = '';
    var W = 440, H = 330;
    var svg = svgRoot(W, H);
    var c = gapResult.cellsW, tot = gapResult.totalW;
    var pad = 76, size = 200;

    var pYes = (c.bothYes + c.aOnly) / tot;         // yes on A
    var pYesGivenA = (c.bothYes + c.bOnly) / tot;   // yes on B

    var splitX = pad + size * pYes;
    var splitYTop = pad + size * (c.bothYes / Math.max(1e-9, c.bothYes + c.aOnly));
    var splitYBot = pad + size * (c.bOnly / Math.max(1e-9, c.bOnly + c.neither));

    function block(x, y, w, h, fill, label, val, dark) {
      if (w <= 0.5 || h <= 0.5) return;
      var r = el('rect', { x: x, y: y, width: w, height: h, fill: fill, stroke: 'var(--paper)', 'stroke-width': 1 });
      r.appendChild(el('title', {}, label + ': ' + (100 * val / tot).toFixed(1) + '%'));
      svg.appendChild(r);
      if (w > 44 && h > 26) {
        svg.appendChild(el('text', {
          x: x + w / 2, y: y + h / 2 + 4, 'text-anchor': 'middle', 'font-size': 12,
          fill: dark ? 'var(--ink)' : '#FFFFFF', 'font-variant-numeric': 'tabular-nums'
        }, (100 * val / tot).toFixed(0) + '%'));
      }
    }

    // left column = yes on A ; top = yes on B
    var P = palette();
    block(pad, pad, splitX - pad, splitYTop - pad, P.support[0], 'favors both', c.bothYes, false);
    block(pad, splitYTop, splitX - pad, pad + size - splitYTop, P.oppose[1], 'favors in general, not locally', c.aOnly, false);
    block(splitX, pad, pad + size - splitX, splitYBot - pad, P.support[1], 'opposes in general, favors locally', c.bOnly, true);
    block(splitX, splitYBot, pad + size - splitX, pad + size - splitYBot, P.middle, 'opposes both', c.neither, true);

    // Each column and each row is named where it sits, so nothing has to be
    // inferred from an arrow. The width of a column is the share answering
    // that way in general; the height of a block within it is the share
    // answering that way locally.
    svg.appendChild(el('text', {
      x: pad + (splitX - pad) / 2, y: pad - 20, 'text-anchor': 'middle',
      'font-size': 10, fill: 'var(--ink)'
    }, 'favors in general'));
    if (pad + size - splitX > 40) {
      svg.appendChild(el('text', {
        x: splitX + (pad + size - splitX) / 2, y: pad - 20, 'text-anchor': 'middle',
        'font-size': 10, fill: 'var(--slate)'
      }, 'opposes'));
    }
    svg.appendChild(el('text', {
      'font-size': 10, fill: 'var(--ink)', 'text-anchor': 'middle',
      transform: 'translate(' + (pad - 14) + ',' + (pad + (splitYTop - pad) / 2) + ') rotate(-90)'
    }, 'favors locally'));
    if (pad + size - splitYTop > 34) {
      svg.appendChild(el('text', {
        'font-size': 10, fill: 'var(--slate)', 'text-anchor': 'middle',
        transform: 'translate(' + (pad - 14) + ',' + (splitYTop + (pad + size - splitYTop) / 2) + ') rotate(-90)'
      }, 'opposes'));
    }

    svg.appendChild(el('rect', {
      x: pad, y: pad, width: size, height: size,
      fill: 'none', stroke: 'var(--rule)', 'stroke-width': 1
    }));

    // The block the NIMBY literature is about, called out below the square
    // so the leader does not cross any other block.
    var cx = pad + (splitX - pad) / 2;
    var baseY = pad + size;
    svg.appendChild(el('line', {
      x1: cx, x2: cx, y1: baseY, y2: baseY + 12,
      stroke: P.oppose[1], 'stroke-width': 1, 'stroke-dasharray': '3 3'
    }));
    svg.appendChild(el('text', {
      x: cx, y: baseY + 26, 'text-anchor': 'middle',
      'font-size': 13, fill: P.oppose[1], 'font-weight': 600,
      'font-variant-numeric': 'tabular-nums'
    }, (100 * c.aOnly / tot).toFixed(1) + '%'));
    svg.appendChild(el('text', {
      x: cx, y: baseY + 39, 'text-anchor': 'middle', 'font-size': 10, fill: 'var(--slate)'
    }, 'favor it in general, not locally'));

    container.appendChild(svg);
    return svg;
  }

  // ------------------------------------------------------ coefficient plot

  /* One row per model term, a dot at the estimate and a line across its
   * confidence interval, with a rule at zero. A term whose interval
   * crosses zero is drawn hollow: the model has not separated it from no
   * effect at all.
   *
   * terms: [{label, estimate, lo, hi, reference}]
   *
   * The horizontal axis here is NOT a percentage axis and cannot be fixed
   * at 0-100. It is made symmetric about zero and rounded out to a whole
   * step so that two models of the same outcome are drawn on the same
   * scale, and the axis label states the units. */
  function coefficientPlot(container, terms, opts) {
    opts = opts || {};
    container.innerHTML = '';
    var P = palette();
    var labelW = opts.labelWidth || 210;
    var rowH = 26, padTop = 16, padBottom = 52, padRight = 130;
    var W = 780, plotX0 = labelW, plotX1 = W - padRight;
    var H = padTop + terms.length * rowH + padBottom;
    var svg = svgRoot(W, H);

    // symmetric, rounded domain
    var span = 0;
    terms.forEach(function (t) {
      span = Math.max(span, Math.abs(t.lo), Math.abs(t.hi), Math.abs(t.estimate));
    });
    if (!isFinite(span) || span === 0) span = 1;
    var step = Math.pow(10, Math.floor(Math.log10(span)));
    if (span / step > 5) step *= 2;
    else if (span / step < 1.5) step /= 2;
    var limit = Math.ceil(span / step) * step;

    function X(v) { return plotX0 + (plotX1 - plotX0) * ((v + limit) / (2 * limit)); }

    // gridlines at each step
    for (var g = -limit; g <= limit + 1e-9; g += step) {
      var gx = X(g);
      var isZero = Math.abs(g) < 1e-12;
      svg.appendChild(el('line', {
        x1: gx, x2: gx, y1: padTop - 6, y2: padTop + terms.length * rowH - 6,
        stroke: isZero ? 'var(--slate)' : 'var(--grid)',
        'stroke-width': isZero ? 1.25 : 1
      }));
      svg.appendChild(el('text', {
        x: gx, y: padTop + terms.length * rowH + 12, 'text-anchor': 'middle',
        'font-size': 10, fill: 'var(--slate)', 'font-variant-numeric': 'tabular-nums'
      }, opts.asPercentagePoints ? (100 * g).toFixed(0) : g.toFixed(2)));
    }

    terms.forEach(function (t, ix) {
      var y = padTop + ix * rowH + rowH / 2 - 6;

      svg.appendChild(el('text', {
        x: labelW - 10, y: y + 4, 'text-anchor': 'end', 'font-size': 11.5,
        fill: t.reference ? 'var(--slate)' : 'var(--ink)',
        'font-style': t.reference ? 'italic' : 'normal'
      }, t.label));

      if (t.reference) {
        // the omitted category: marked on the zero line, no estimate
        svg.appendChild(el('circle', {
          cx: X(0), cy: y, r: 3, fill: 'none',
          stroke: 'var(--slate)', 'stroke-width': 1
        }));
        svg.appendChild(el('text', {
          x: plotX1 + 8, y: y + 4, 'font-size': 10, fill: 'var(--slate)'
        }, 'reference'));
        return;
      }

      var crossesZero = (t.lo <= 0 && t.hi >= 0);
      var color = t.estimate >= 0 ? P.positive : P.negative;

      svg.appendChild(el('line', {
        x1: X(Math.max(t.lo, -limit)), x2: X(Math.min(t.hi, limit)),
        y1: y, y2: y, stroke: color, 'stroke-width': 1.5
      }));
      [t.lo, t.hi].forEach(function (b) {
        if (b < -limit || b > limit) return;
        svg.appendChild(el('line', {
          x1: X(b), x2: X(b), y1: y - 4, y2: y + 4, stroke: color, 'stroke-width': 1.5
        }));
      });

      var dot = el('circle', {
        cx: X(t.estimate), cy: y, r: 5,
        fill: crossesZero ? 'var(--panel)' : color,
        stroke: color, 'stroke-width': 1.5
      });
      dot.appendChild(el('title', {}, t.label + ': ' + t.estimate.toFixed(3) +
        ' (' + t.lo.toFixed(3) + ' to ' + t.hi.toFixed(3) + ')'));
      svg.appendChild(dot);

      var txt = opts.asPercentagePoints
        ? (t.estimate >= 0 ? '+' : '\u2212') + Math.abs(100 * t.estimate).toFixed(1) + ' pts'
        : t.estimate.toFixed(3);
      svg.appendChild(el('text', {
        x: plotX1 + 8, y: y + 4, 'font-size': 11, fill: 'var(--ink)',
        'font-variant-numeric': 'tabular-nums'
      }, txt));
    });

    var axisY = padTop + terms.length * rowH - 6;
    svg.appendChild(el('line', {
      x1: plotX0, x2: plotX1, y1: axisY, y2: axisY, stroke: 'var(--rule)', 'stroke-width': 1
    }));
    svg.appendChild(el('text', {
      x: (plotX0 + plotX1) / 2, y: axisY + 34, 'text-anchor': 'middle',
      'font-size': 10.5, fill: 'var(--slate)'
    }, opts.axisLabel || 'estimate'));

    container.appendChild(svg);
    return svg;
  }

  // ------------------------------------------------- adjusted predictions

  /* What the model says the outcome would be if the whole sample had each
   * value of one predictor, holding the others at their observed values.
   * A percentage, so the axis is fixed 0-100 like every other percentage
   * in the tool.
   *
   * points: [{label, p, observed, isReference}] */
  function adjustedPlot(container, points, opts) {
    opts = opts || {};
    container.innerHTML = '';
    var P = palette();
    var labelW = opts.labelWidth || 170;
    var rowH = 30, padTop = 24, padBottom = 50, padRight = 110;
    var W = 760, plotX0 = labelW, plotX1 = W - padRight;
    var H = padTop + points.length * rowH + padBottom;
    var svg = svgRoot(W, H);
    var showObserved = points.some(function (p) { return p.observed !== undefined && p.observed !== null; });

    gridlines(svg, plotX0, plotX1, padTop - 10, padTop + points.length * rowH - 8);

    if (showObserved) {
      var keyX = plotX0;
      [[P.support[0], opts.labelModel || 'model estimate', 'dot'],
       ['var(--slate)', opts.labelObserved || 'observed in the data', 'tick']].forEach(function (k) {
        if (k[2] === 'dot') {
          svg.appendChild(el('circle', { cx: keyX + 4, cy: 8, r: 4.5, fill: k[0] }));
        } else {
          svg.appendChild(el('line', {
            x1: keyX + 4, x2: keyX + 4, y1: 3, y2: 13, stroke: k[0], 'stroke-width': 1.5
          }));
        }
        svg.appendChild(el('text', {
          x: keyX + 13, y: 11.5, 'font-size': 10, fill: 'var(--slate)'
        }, k[1]));
        keyX += 24 + k[1].length * 5.3;
      });
    }

    function X(p) { return plotX0 + (plotX1 - plotX0) * p; }

    points.forEach(function (pt, ix) {
      var y = padTop + ix * rowH + rowH / 2 - 8;

      svg.appendChild(el('text', {
        x: labelW - 10, y: y + 4, 'text-anchor': 'end', 'font-size': 12, fill: 'var(--ink)'
      }, pt.label + (pt.isReference ? ' \u00B0' : '')));

      // a light bar to the estimate, so the row is readable at a glance
      svg.appendChild(el('rect', {
        x: plotX0, y: y - 7, width: Math.max(0, X(pt.p) - plotX0), height: 14,
        fill: P.support[1], opacity: 0.35
      }));

      if (pt.observed !== undefined && pt.observed !== null) {
        svg.appendChild(el('line', {
          x1: X(pt.observed), x2: X(pt.observed), y1: y - 9, y2: y + 9,
          stroke: 'var(--slate)', 'stroke-width': 1.5
        }));
      }

      var dot = el('circle', { cx: X(pt.p), cy: y, r: 5, fill: P.support[0] });
      dot.appendChild(el('title', {}, pt.label + ': ' + (100 * pt.p).toFixed(1) + '%'));
      svg.appendChild(dot);

      svg.appendChild(el('text', {
        x: plotX1 + 8, y: y + 4, 'font-size': 11, fill: 'var(--ink)',
        'font-variant-numeric': 'tabular-nums'
      }, (100 * pt.p).toFixed(1) + '%'));
    });

    percentAxis(svg, plotX0, plotX1, padTop + points.length * rowH - 8);
    container.appendChild(svg);
    return svg;
  }

  // ----------------------------------------------- demographic profile

  /* One question, broken out across several grouping variables at once.
   *
   * Every panel shares one fixed 0-100 axis and one dashed line at the
   * whole-sample percentage, so the eye can carry a comparison from one
   * block to the next without re-reading the numbers.
   *
   * A dot is filled only when its confidence interval excludes the
   * whole-sample figure. Groups that a survey this size cannot tell apart
   * from the average are drawn hollow and grey, so the colored dots are the
   * ones worth talking about.
   *
   * panels: [{title, rows:[{label, p, moe, n}]}]
   */
  function profilePlot(container, panels, overall, opts) {
    opts = opts || {};
    container.innerHTML = '';
    var P = palette();

    var labelW = opts.labelWidth || 168;
    var rowH = 24, panelGap = 16, titleH = 20;
    var padTop = 30, padBottom = 46, padRight = 118;
    var W = 780, plotX0 = labelW, plotX1 = W - padRight;

    var H = padTop;
    panels.forEach(function (pn) { H += titleH + pn.rows.length * rowH + panelGap; });
    H += padBottom;

    var svg = svgRoot(W, H);
    function X(p) { return plotX0 + (plotX1 - plotX0) * p; }

    // whole-sample reference line, drawn behind everything
    var refX = X(overall);
    svg.appendChild(el('line', {
      x1: refX, x2: refX, y1: padTop - 14, y2: H - padBottom + 2,
      stroke: 'var(--ink)', 'stroke-width': 1.25, 'stroke-dasharray': '5 3', opacity: 0.55
    }));
    svg.appendChild(el('text', {
      x: refX, y: 13, 'text-anchor': 'middle', 'font-size': 10.5,
      fill: 'var(--ink)', 'font-weight': 600
    }, 'everyone: ' + (100 * overall).toFixed(0) + '%'));

    for (var g = 0; g <= 100; g += 25) {
      var gx = X(g / 100);
      if (Math.abs(gx - refX) < 14) continue;
      svg.appendChild(el('line', {
        x1: gx, x2: gx, y1: padTop - 14, y2: H - padBottom + 2,
        stroke: 'var(--grid)', 'stroke-width': 1
      }));
    }

    var y = padTop;
    panels.forEach(function (pn) {
      svg.appendChild(el('text', {
        x: 8, y: y + 2, 'font-size': 11.5, fill: 'var(--accent)', 'font-weight': 600
      }, pn.title));
      svg.appendChild(el('line', {
        x1: 8, x2: labelW - 12, y1: y + 8, y2: y + 8,
        stroke: 'var(--rule)', 'stroke-width': 1
      }));
      y += titleH;

      pn.rows.forEach(function (r) {
        var cy = y + rowH / 2 - 2;

        svg.appendChild(el('text', {
          x: labelW - 12, y: cy + 4, 'text-anchor': 'end', 'font-size': 11.5, fill: 'var(--ink)'
        }, r.label));

        var distinct = isFinite(r.moe) &&
          (r.p - r.moe > overall || r.p + r.moe < overall);
        var color = !distinct ? '#9AA8A4'
          : (r.p > overall ? P.positive : P.negative);

        if (isFinite(r.moe) && r.moe > 0) {
          svg.appendChild(el('line', {
            x1: X(Math.max(0, r.p - r.moe)), x2: X(Math.min(1, r.p + r.moe)),
            y1: cy, y2: cy, stroke: color,
            'stroke-width': distinct ? 2.5 : 1.5,
            'stroke-linecap': 'round',
            opacity: distinct ? 0.55 : 0.4
          }));
        }

        var dot = el('circle', {
          cx: X(r.p), cy: cy, r: distinct ? 6.5 : 5,
          fill: distinct ? color : 'var(--panel)',
          stroke: color, 'stroke-width': distinct ? 1 : 1.5,
          opacity: distinct ? 1 : 0.8
        });
        dot.appendChild(el('title', {}, r.label + ': ' + (100 * r.p).toFixed(1) +
          '% \u00B1' + (100 * r.moe).toFixed(1) + ' (n=' + r.n + ')'));
        svg.appendChild(dot);

        svg.appendChild(el('text', {
          x: plotX1 + 8, y: cy + 4, 'font-size': 11.5,
          fill: distinct ? 'var(--ink)' : 'var(--slate)',
          'font-variant-numeric': 'tabular-nums'
        }, (100 * r.p).toFixed(0) + '%'));

        svg.appendChild(el('text', {
          x: plotX1 + 42, y: cy + 4, 'font-size': 9.5, fill: 'var(--slate)',
          'font-variant-numeric': 'tabular-nums'
        }, '\u00B1' + (100 * r.moe).toFixed(1)));

        svg.appendChild(el('text', {
          x: plotX1 + 78, y: cy + 4, 'font-size': 9.5, fill: 'var(--slate)',
          'font-variant-numeric': 'tabular-nums'
        }, 'n=' + r.n));

        y += rowH;
      });
      y += panelGap;
    });

    percentAxis(svg, plotX0, plotX1, H - padBottom + 2);
    svg.appendChild(el('text', {
      x: (plotX0 + plotX1) / 2, y: H - padBottom + 34, 'text-anchor': 'middle',
      'font-size': 10.5, fill: 'var(--slate)'
    }, opts.axisLabel || 'percent giving this answer'));

    container.appendChild(svg);

    var key = document.createElement('div');
    key.className = 'legend';
    key.innerHTML =
      '<span class="legend-item"><span class="legend-swatch" style="background:' + P.positive + '"></span>clearly above everyone</span>' +
      '<span class="legend-item"><span class="legend-swatch" style="background:' + P.negative + '"></span>clearly below</span>' +
      '<span class="legend-item"><span class="legend-swatch" style="background:var(--panel);border-color:#9AA8A4"></span>too close to call</span>';
    container.appendChild(key);

    return svg;
  }

  // -------------------------------------------------------------- download

  function downloadSVG(svg, filename) {
    // inline the CSS variables so the saved file looks right outside the page
    var clone = svg.cloneNode(true);
    var computed = getComputedStyle(document.documentElement);
    var vars = ['--ink', '--slate', '--rule', '--grid', '--paper', '--panel', '--font-ui',
                '--c-support-1', '--c-support-2', '--c-middle',
                '--c-oppose-1', '--c-oppose-2', '--c-series-a', '--c-series-b',
                '--c-positive', '--c-negative', '--c-neutral'];
    var styleText = ':root{' + vars.map(function (v) {
      return v + ':' + computed.getPropertyValue(v).trim() + ';';
    }).join('') + '}';
    var style = el('style', {}, styleText);
    clone.insertBefore(style, clone.firstChild);
    clone.setAttribute('xmlns', NS);

    var blob = new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename || 'figure.svg';
    a.click();
    URL.revokeObjectURL(url);
  }

  global.Charts = {
    palette: palette,
    divergingBars: divergingBars,
    coefficientPlot: coefficientPlot,
    profilePlot: profilePlot,
    adjustedPlot: adjustedPlot,
    gapPlot: gapPlot,
    barsWithCI: barsWithCI,
    pairedSquare: pairedSquare,
    downloadSVG: downloadSVG,
    supportColors: supportColors
  };
})(window);
