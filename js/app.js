/* app.js — wiring.
 *
 * State lives in one object. Every panel reads from it and redraws; no
 * panel keeps its own copy of the data.
 */

(function () {
  'use strict';

  var state = {
    filename: null,
    columns: [],
    rows: [],
    profiles: [],
    profileByName: {},
    weightVar: null,
    missingCodes: [],
    // per-variable category roles for the gap panel: name -> {value: 'yes'|'no'|'drop'}
    roles: {},
    // value labels: name -> {code: label}
    labels: {},
    // question text: name -> {short, question}
    questions: {},
    // whether refusal codes are excluded from percentage bases
    excludeRefusals: false
  };

  function $(id) { return document.getElementById(id); }

  /* A Pew CSV ships numeric codes, not the answer text: ENV2_d holds 1 and 2,
   * not "Favor" and "Oppose". Labels typed into the codebook are stored here
   * and used everywhere a value is shown or read. */
  function labelOf(varName, value) {
    var m = state.labels[varName];
    if (m && m[String(value)] !== undefined) return m[String(value)];
    return String(value);
  }

  /* The readable name for a variable: the question's own wording when a
   * dictionary has been loaded, the raw column name otherwise. */
  function varLabel(varName) {
    var q = state.questions[varName];
    return (q && q.short) ? q.short : varName;
  }

  function varQuestion(varName) {
    var q = state.questions[varName];
    return (q && q.question) ? q.question : '';
  }

  /* How a variable is named in a dropdown: wording first, since that is what
   * she is looking for, with the column name after it so the row can always
   * be traced back to the codebook. */
  function varOptionText(varName, distinct) {
    var lab = varLabel(varName);
    var tail = ' \u00B7 ' + varName + (distinct ? ' (' + distinct + ')' : '');
    if (lab === varName) return varName + (distinct ? '  (' + distinct + ')' : '');
    if (lab.length > 58) lab = lab.slice(0, 55).replace(/\s+\S*$/, '') + '\u2026';
    return lab + tail;
  }

  function hasLabels(varName) {
    var m = state.labels[varName];
    return !!(m && Object.keys(m).length);
  }

  /* Display form: the label, with the raw code kept alongside so a value can
   * always be traced back to the questionnaire. */
  function showValue(varName, value) {
    if (!hasLabels(varName)) return String(value);
    var lab = labelOf(varName, value);
    return lab === String(value) ? String(value) : lab + ' (' + value + ')';
  }

  /* Parse "1=Favor, 2=Oppose, 99=Refused" into a map. Newlines work too. */
  function parseLabelSpec(text) {
    var out = {};
    String(text).split(/[\n,;]+/).forEach(function (part) {
      var m = part.match(/^\s*([^=]+?)\s*=\s*(.+?)\s*$/);
      if (m) out[m[1].trim()] = m[2].trim();
    });
    return out;
  }

  function labelSpecFor(varName) {
    var m = state.labels[varName];
    if (!m) return '';
    return Object.keys(m).map(function (k) { return k + ' = ' + m[k]; }).join('\n');
  }

  function fmt(n, digits) {
    if (n === null || n === undefined || isNaN(n)) return '\u2014';
    return Number(n).toLocaleString('en-US', {
      minimumFractionDigits: digits === undefined ? 0 : digits,
      maximumFractionDigits: digits === undefined ? 0 : digits
    });
  }

  // ================================================================= tabs

  var TABS = ['load', 'codebook', 'item', 'profile', 'cross', 'gap', 'model'];

  function showTab(key) {
    TABS.forEach(function (t) {
      var tab = $('tab-' + t), panel = $('panel-' + t);
      var on = (t === key);
      tab.setAttribute('aria-selected', on ? 'true' : 'false');
      panel.hidden = !on;
    });
  }

  TABS.forEach(function (t) {
    $('tab-' + t).addEventListener('click', function () {
      if (this.disabled) return;
      showTab(t);
      if (t === 'codebook') renderCodebook();
      if (t === 'item') renderItem();
      if (t === 'profile') renderProfileSetup();
      if (t === 'cross') renderCross();
      if (t === 'gap') renderGap();
      if (t === 'model') renderModelSetup();
    });
  });

  function enableAnalysisTabs(on) {
    ['codebook', 'item', 'profile', 'cross', 'gap', 'model'].forEach(function (t) {
      $('tab-' + t).disabled = !on;
    });
  }

  // ============================================================== readout

  function updateReadout() {
    var box = $('readout');
    if (!state.rows.length) {
      box.className = 'readout is-empty';
      $('readout-file').textContent = 'no file loaded';
      ['ro-cases', 'ro-vars', 'ro-weight', 'ro-neff', 'ro-deff'].forEach(function (id) {
        $(id).innerHTML = '&mdash;';
      });
      $('readout-note').className = 'readout-note quiet';
      $('readout-note').textContent = 'Load a file to begin.';
      return;
    }

    $('readout-file').textContent = state.filename || 'data';
    $('ro-cases').textContent = fmt(state.rows.length);
    $('ro-vars').textContent = fmt(state.columns.length);

    if (!state.weightVar) {
      box.className = 'readout is-unweighted';
      $('ro-weight').textContent = 'none';
      $('ro-neff').innerHTML = '&mdash;';
      $('ro-deff').innerHTML = '&mdash;';
      $('readout-note').className = 'readout-note';
      $('readout-note').textContent =
        'No weight set. Percentages describe the people who answered, not the population they were drawn from. Set the weight in the Codebook tab.';
      return;
    }

    var weights = [];
    for (var i = 0; i < state.rows.length; i++) {
      var w = parseFloat(state.rows[i][state.weightVar]);
      if (isFinite(w) && w >= 0) weights.push(w);
    }
    var d = Stats.effectiveN(weights);

    box.className = 'readout';
    $('ro-weight').textContent = state.weightVar;
    $('ro-neff').textContent = fmt(d.nEff);
    $('ro-deff').textContent = d.deff.toFixed(2);

    var moe = 1.959964 * Math.sqrt(0.25 / d.nEff) * 100;
    $('readout-note').className = 'readout-note quiet';
    $('readout-note').textContent =
      'Widest margin of error for a whole-sample percentage: \u00B1' + moe.toFixed(1) +
      ' points. Subgroups are wider.';
  }

  // ============================================================== loading

  function loadText(text, filename) {
    var parsed;
    try {
      parsed = CSV.parse(text);
    } catch (err) {
      message('error', 'That file could not be read as delimited text. ' + err.message);
      return;
    }

    if (!parsed.rows.length) {
      message('error', 'The file parsed but contains no data rows below the header.');
      return;
    }

    state.filename = filename;
    state.columns = parsed.columns;
    state.rows = parsed.rows;
    state.profiles = CSV.profile(parsed.rows, parsed.columns);
    state.profileByName = {};
    state.profiles.forEach(function (p) { state.profileByName[p.name] = p; });
    state.roles = {};
    state.weightVar = CSV.guessWeight(parsed.rows, state.profiles);

    // Refusal codes are detected but NOT excluded by default.
    //
    // Pew computes its published percentages with refusals left in the
    // denominator. Checked against Wave 148: keeping them in reproduces the
    // published 78% for solar, 72% for wind and 56% for nuclear exactly,
    // while dropping them overstates each by one and a half to two points.
    // Matching the published figures is the right default for a student
    // whose work will be read against the report it came from.
    var detected = {};
    state.profiles.forEach(function (p) {
      if (p.name === state.weightVar) return;
      p.values.forEach(function (v) {
        if (CSV.scaleScore(v.value) === 100) detected[v.value] = true;
      });
    });
    state.detectedRefusals = Object.keys(detected);
    state.missingCodes = [];
    state.excludeRefusals = false;
    $('missing-codes').value = '';

    var delimName = { ',': 'comma', '\t': 'tab', ';': 'semicolon', '|': 'pipe' }[parsed.delimiter] || parsed.delimiter;
    var msg = 'Read ' + fmt(parsed.rows.length) + ' cases and ' +
      fmt(parsed.columns.length) + ' variables (' + delimName + '-delimited).';
    if (state.detectedRefusals.length) {
      msg += ' Values that look like refusal codes (' + state.detectedRefusals.join(', ') +
        ') are being counted in percentage bases, which is how Pew computes its published ' +
        'figures. The Codebook tab has a switch to exclude them instead.';
    }

    if (state.weightVar) {
      msg += ' A column that looks like a survey weight was found and set: ' +
        state.weightVar + '. Confirm it against the questionnaire in the Codebook tab.';
      message('quiet', msg);
    } else {
      msg += ' No weight column was found automatically. Set one in the Codebook tab before reporting percentages.';
      message('warn', msg);
    }

    enableAnalysisTabs(true);
    $('rail-vars').hidden = false;
    populateSelectors();
    renderVarList();
    updateReadout();
    showTab('codebook');
    renderCodebook();
  }

  function message(kind, text) {
    var cls = kind === 'error' ? 'notice error' : (kind === 'warn' ? 'notice' : 'notice quiet');
    $('load-message').innerHTML = '<div class="' + cls + '"><p>' + text + '</p></div>';
  }

  function readFile(file) {
    var reader = new FileReader();
    reader.onload = function () { loadText(String(reader.result), file.name); };
    reader.onerror = function () { message('error', 'The browser could not read that file.'); };
    reader.readAsText(file);
  }

  var dz = $('dropzone');
  ['dragenter', 'dragover'].forEach(function (ev) {
    dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add('is-over'); });
  });
  ['dragleave', 'drop'].forEach(function (ev) {
    dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.remove('is-over'); });
  });
  dz.addEventListener('drop', function (e) {
    var f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) readFile(f);
  });
  $('browse-btn').addEventListener('click', function () { $('file-input').click(); });
  $('file-input').addEventListener('change', function () {
    if (this.files && this.files[0]) readFile(this.files[0]);
  });
  $('demo-btn').addEventListener('click', function () {
    fetch('data/practice-solar-survey.csv')
      .then(function (r) {
        if (!r.ok) throw new Error('status ' + r.status);
        return r.text();
      })
      .then(function (t) { loadText(t, 'practice-solar-survey.csv (synthetic)'); })
      .catch(function () {
        message('error', 'The practice file could not be opened. If this page was opened directly ' +
          'from the file system, the browser blocks reading neighboring files. Serve the folder ' +
          'with a local web server, or drag data/practice-solar-survey.csv onto the drop area.');
      });
  });

  // ========================================================= variable list

  function renderVarList() {
    var q = ($('var-search').value || '').trim().toLowerCase();
    var ul = $('var-list');
    ul.innerHTML = '';
    state.profiles.forEach(function (p) {
      if (q) {
        var hit = p.name.toLowerCase().indexOf(q) !== -1 ||
          p.values.some(function (v) { return String(v.value).toLowerCase().indexOf(q) !== -1; });
        if (!hit) return;
      }
      var li = document.createElement('li');
      if (p.name === state.weightVar) li.className = 'is-weight';
      var nm = document.createElement('span');
      nm.className = 'vname';
      nm.textContent = p.name;
      var kd = document.createElement('span');
      kd.className = 'vkind';
      kd.textContent = p.name === state.weightVar ? 'weight' :
        (p.kind === 'categorical' ? p.distinct + ' cats' :
          (p.kind === 'numeric' ? (p.codeLike ? p.distinct + ' codes' : 'numeric') : p.kind));
      li.appendChild(nm);
      li.appendChild(kd);
      ul.appendChild(li);
    });
    if (!ul.children.length) {
      var li2 = document.createElement('li');
      li2.innerHTML = '<span class="vkind">no match</span>';
      ul.appendChild(li2);
    }
  }
  $('var-search').addEventListener('input', renderVarList);

  // ============================================================ selectors

  function analysisVars() {
    return state.profiles.filter(function (p) {
      if (p.name === state.weightVar) return false;
      if (p.kind === 'empty' || p.kind === 'free-text') return false;
      if (p.distinct <= 1) return false;
      // a numeric column with a distinct value for nearly every case is an
      // identifier or a timestamp, not an answer
      if (p.allNumeric && p.distinct > 40 && p.distinct > p.nNonMissing * 0.5) return false;
      if (/^(QKEY|RESPID|CASEID)$/i.test(p.name)) return false;
      if (/INTERVIEW_(START|END)/i.test(p.name)) return false;
      return true;
    });
  }

  function fillSelect(sel, list, includeBlank, blankLabel) {
    var prev = sel.value;
    sel.innerHTML = '';
    if (includeBlank) {
      var o = document.createElement('option');
      o.value = '';
      o.textContent = blankLabel || '\u2014 none \u2014';
      sel.appendChild(o);
    }
    list.forEach(function (p) {
      var opt = document.createElement('option');
      opt.value = p.name;
      opt.textContent = varOptionText(p.name, p.distinct);
      sel.appendChild(opt);
    });
    if (prev && Array.prototype.some.call(sel.options, function (o) { return o.value === prev; })) {
      sel.value = prev;
    }
  }

  function populateSelectors() {
    var numeric = state.profiles.filter(function (p) { return p.allNumeric && p.kind !== 'empty'; });
    fillSelect($('weight-select'), numeric, true, '\u2014 no weight (unweighted) \u2014');
    if (state.weightVar) $('weight-select').value = state.weightVar;

    var vars = analysisVars();
    fillSelect($('item-select'), vars);
    fillSelect($('cross-row'), vars);
    fillSelect($('cross-col'), vars);
    fillSelect($('gap-a'), vars);
    fillSelect($('gap-b'), vars);
    fillSelect($('gap-group'), vars, true, '\u2014 whole sample \u2014');
    fillSelect($('model-outcome'), vars);
    fillSelect($('profile-item'), vars);

    // sensible defaults: look for names hinting at general and local items
    var general = vars.find(function (p) { return /(solar|renew|wind).*(gener|expand|more|country|nation)|^(solar|wind)_(national|general)/i.test(p.name); });
    var local = vars.find(function (p) { return /(local|community|near|nearby|my ?area)/i.test(p.name); });
    if (general) $('gap-a').value = general.name;
    if (local) $('gap-b').value = local.name;
  }

  $('weight-select').addEventListener('change', function () {
    state.weightVar = this.value || null;
    updateReadout();
    renderVarList();
    populateSelectors();
    renderCodebook();
  });

  $('apply-missing').addEventListener('click', function () {
    var raw = $('missing-codes').value || '';
    state.missingCodes = raw.split(',').map(function (s) { return s.trim(); })
      .filter(function (s) { return s.length > 0; });
    renderCodebook();
  });

  // ============================================================= codebook

  function renderCodebook() {
    var body = $('codebook-body');
    if (!state.rows.length) { body.innerHTML = ''; return; }

    var html = '';

    if (!state.weightVar) {
      html += '<div class="notice"><p><b>No survey weight is set.</b> ' +
        'Survey samples are not self-weighting: the people who respond differ from the population in ' +
        'age, education, race and partisanship, and the weight variable is what corrects for that. ' +
        'Unweighted percentages from a panel survey are a description of the panel, not of the country.</p>' +
        '<p>In Pew American Trends Panel files the weight is usually named <code>WEIGHT_W##</code>. ' +
        'In the CES it is <code>commonweight</code>.</p></div>';
    }

    if (state.missingCodes.length) {
      html += '<div class="notice quiet"><p>Excluded from all percentage bases as missing: <code>' +
        state.missingCodes.join('</code>, <code>') + '</code></p></div>';
    }

    html += '<table class="data"><caption>All variables in ' +
      (state.filename || 'the file') + '. Categories are listed for variables with 60 or fewer ' +
      'distinct values.</caption><thead><tr>' +
      '<th>variable</th><th>type</th><th>distinct</th><th>answered</th><th>missing</th><th>range</th>' +
      '</tr></thead><tbody>';

    state.profiles.forEach(function (p) {
      html += '<tr><td><code>' + escapeHTML(p.name) + '</code>' +
        (p.name === state.weightVar ? ' <span style="color:var(--teal);font-size:11px">weight</span>' : '') +
        '</td><td>' + p.kind + (p.codeLike ? ' (codes)' : '') + '</td>' +
        '<td>' + fmt(p.distinct) + (p.overflow ? '+' : '') + '</td>' +
        '<td>' + fmt(p.nNonMissing) + '</td>' +
        '<td class="moe">' + fmt(p.nMissing) + '</td>' +
        '<td class="moe">' + (p.min !== null ? p.min + ' to ' + p.max : '\u2014') + '</td></tr>';
    });

    html += '</tbody></table>';

    body.innerHTML = html;

    renderRefusalSwitch();

    var detail = document.createElement('div');
    detail.className = 'card';
    detail.style.marginTop = '18px';
    detail.innerHTML = '<h3>Response categories and labels</h3>' +
      '<p class="role-legend">A Pew CSV stores answers as numeric codes, so ' +
      '<code>ENV2_d</code> holds 1 and 2 rather than Favor and Oppose. Typing the ' +
      'labels from the questionnaire here makes them appear throughout the tool and ' +
      'lets it recognize which end of a scale is support. Labels can be saved to a file ' +
      'and reloaded, so a wave only has to be labeled once.</p>' +
      '<div class="controls"><div class="field"><label for="cb-var">Variable</label>' +
      '<select id="cb-var"></select></div>' +
      '<button class="secondary" id="labels-save">Save labels to a file</button>' +
      '<button class="secondary" id="labels-load">Load labels from a file</button>' +
      '<input type="file" id="labels-file" accept=".json" hidden>' +
      '</div><div id="cb-detail"></div>';
    body.appendChild(detail);

    fillSelect($('cb-var'), analysisVars());
    $('cb-var').addEventListener('change', renderCodebookDetail);
    $('labels-save').addEventListener('click', saveLabels);
    $('labels-load').addEventListener('click', function () { $('labels-file').click(); });
    $('labels-file').addEventListener('change', function () {
      if (this.files && this.files[0]) loadLabels(this.files[0]);
    });
    renderCodebookDetail();
  }

  function renderRefusalSwitch() {
    var box = $('refusal-switch');
    if (!box) return;
    if (!state.detectedRefusals || !state.detectedRefusals.length) { box.innerHTML = ''; return; }

    box.innerHTML = '<div class="notice quiet"><p>' +
      '<b>Refusal codes: ' + state.detectedRefusals.join(', ') + '</b></p>' +
      '<p>Pew computes its published percentages with refusals left in the denominator. ' +
      'Keeping them in reproduces the published figures for this wave; dropping them raises ' +
      'every percentage by a point or two. Either convention is defensible as long as the ' +
      'write-up says which one was used.</p>' +
      '<p style="margin-top:8px"><label><input type="checkbox" id="refusal-toggle"' +
      (state.excludeRefusals ? ' checked' : '') + '> ' +
      'Exclude refusals from percentage bases</label></p></div>';

    $('refusal-toggle').addEventListener('change', function () {
      state.excludeRefusals = this.checked;
      state.roles = {};          // re-derive, since refusals change side
      renderCodebook();
    });
  }

  /* The codes actually treated as missing: whatever was typed, plus the
   * detected refusal codes only when the switch is on. */
  function missingSet() {
    return state.excludeRefusals
      ? state.missingCodes.concat(state.detectedRefusals)
      : state.missingCodes.slice();
  }

  function saveLabels() {
    var blob = new Blob([JSON.stringify(state.labels, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = (state.filename || 'survey').replace(/\.[^.]+$/, '') + '_labels.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  function loadLabels(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var obj = JSON.parse(String(reader.result));
        var refusals = {};
        Object.keys(obj).forEach(function (k) {
          var e = obj[k];
          // a full dictionary from make_dictionary.py, or a plain label map
          if (e && (e.labels || e.short || e.question)) {
            if (e.labels) state.labels[k] = e.labels;
            if (e.short || e.question) {
              state.questions[k] = { short: e.short, question: e.question };
            }
            (e.refusals || []).forEach(function (c) { refusals[c] = true; });
          } else {
            state.labels[k] = e;
          }
        });
        // refusal codes named in the dictionary beat anything guessed from
        // the data: F_PARTYSUM_FINAL uses 9, which no rule could catch
        var named = Object.keys(refusals);
        if (named.length) {
          named.forEach(function (c) {
            if (state.detectedRefusals.indexOf(c) === -1) state.detectedRefusals.push(c);
          });
        }
        state.roles = {};
        populateSelectors();
        renderVarList();
        renderCodebook();
      } catch (err) {
        $('cb-detail').innerHTML = '<div class="notice error"><p>That file is not readable ' +
          'as a label map. It should be JSON of the form ' +
          '{"VARNAME": {"1": "Favor", "2": "Oppose"}}.</p></div>';
      }
    };
    reader.readAsText(file);
  }

  function renderCodebookDetail() {
    var name = $('cb-var').value;
    var target = $('cb-detail');
    if (!name) { target.innerHTML = ''; return; }
    var f = Stats.frequencies(state.rows, name, state.weightVar, missingSet());
    var cats = orderByProfile(f.categories, name);

    var html = '<div class="controls" style="align-items:flex-start">' +
      '<div class="field" style="flex:1"><label for="label-spec">' +
      'Labels for ' + escapeHTML(name) + ' \u2014 one per line, code = label</label>' +
      '<textarea id="label-spec" rows="4" style="width:100%;max-width:420px;font-family:var(--font-code);' +
      'font-size:12px;padding:6px 8px;border:1px solid var(--rule)" ' +
      'placeholder="1 = Favor&#10;2 = Oppose&#10;99 = Refused">' +
      escapeHTML(labelSpecFor(name)) + '</textarea></div>' +
      '<button class="secondary" id="label-apply">Apply labels</button></div>';

    html += '<table class="data"><thead><tr><th>value</th><th>cases</th>' +
      '<th>unweighted</th><th>weighted</th></tr></thead><tbody>';
    cats.forEach(function (c) {
      html += '<tr><td>' + escapeHTML(showValue(name, c.value)) + '</td><td>' + fmt(c.n) + '</td>' +
        '<td class="moe">' + Stats.pct(c.pU) + '</td><td>' + Stats.pct(c.pW) + '</td></tr>';
    });
    html += '</tbody><tfoot><tr><td>base</td><td>' + fmt(f.totalN) + '</td><td colspan="2">' +
      'missing or excluded: ' + fmt(f.missing.n) + ' cases</td></tr></tfoot></table>';
    target.innerHTML = html;

    $('label-apply').addEventListener('click', function () {
      state.labels[name] = parseLabelSpec($('label-spec').value);
      delete state.roles[name];
      renderCodebookDetail();
    });
  }

  /* Frequency results come back in whatever order the values were first
   * encountered. Reorder them to match the codebook, which puts an ordered
   * scale in scale order. */
  function orderByProfile(categories, varName) {
    var p = state.profileByName[varName];
    if (!p) return categories;
    var rank = {};
    p.values.forEach(function (v, ix) { rank[v.value] = ix; });
    return categories.slice().sort(function (a, b) {
      var ra = rank[a.value], rb = rank[b.value];
      if (ra === undefined) ra = 1e6;
      if (rb === undefined) rb = 1e6;
      return ra - rb;
    });
  }

  function supportingValues(varName) {
    var p = state.profileByName[varName];
    if (!p || !p.isScale) return null;
    return p.values.filter(function (v) { return v.score !== null && v.score < 0; })
      .map(function (v) { return v.value; });
  }

  // ============================================================= one item

  $('item-select').addEventListener('change', renderItem);

  function renderItem() {
    var name = $('item-select').value;
    var body = $('item-body');
    if (!name) { body.innerHTML = '<p class="empty-state">Choose a question.</p>'; return; }

    var f = Stats.frequencies(state.rows, name, state.weightVar, missingSet());
    if (!f.categories.length) {
      body.innerHTML = '<p class="empty-state">Every case is missing on this variable.</p>';
      return;
    }

    var cats = orderByProfile(f.categories, name);

    var maxShift = 0;
    cats.forEach(function (c) { maxShift = Math.max(maxShift, Math.abs(c.pW - c.pU)); });

    var html = '<div class="card"><h3>' + escapeHTML(name) + '</h3>';

    // For an ordered scale, the number that normally gets reported is the
    // two supporting categories combined.
    var support = null, yesVals = supportingValues(name);
    if (yesVals && yesVals.length) {
      support = Stats.collapsedProportion(state.rows, name, yesVals, state.weightVar, missingSet());
    }
    if (support) {
      html += '<p class="headline"><span class="big">' + Stats.pct(support.p) + '</span> ' +
        'combining ' + yesVals.map(function (v) { return '\u201C' + escapeHTML(v) + '\u201D'; }).join(' and ') +
        ', \u00B1' + (100 * support.moe).toFixed(1) + ' points.</p>' +
        '<p style="margin:0 0 16px;color:var(--slate);font-size:12.5px;max-width:66ch">' +
        'This interval is computed by collapsing the categories for each respondent first. ' +
        'Adding the separate intervals for the two categories together would overstate it.</p>';
    }

    html += '<table class="data"><thead><tr><th>response</th><th>cases</th>' +
      '<th>unweighted</th><th>weighted</th><th class="moe">shift</th>' +
      '<th class="moe">95% margin</th></tr></thead><tbody>';
    cats.forEach(function (c) {
      var shift = c.pW - c.pU;
      html += '<tr><td>' + escapeHTML(showValue(name, c.value)) + '</td><td>' + fmt(c.n) + '</td>' +
        '<td class="moe">' + Stats.pct(c.pU) + '</td>' +
        '<td>' + Stats.pct(c.pW) + '</td>' +
        '<td class="moe">' + (shift >= 0 ? '+' : '\u2212') + Math.abs(100 * shift).toFixed(1) + '</td>' +
        '<td class="moe">\u00B1' + (100 * c.moe).toFixed(1) + '</td></tr>';
    });
    html += '</tbody><tfoot><tr><td>base</td><td>' + fmt(f.totalN) + '</td>' +
      '<td colspan="4">effective n ' + fmt(f.design.nEff) +
      ' &middot; design effect ' + (isFinite(f.design.deff) ? f.design.deff.toFixed(2) : '\u2014') +
      ' &middot; missing ' + fmt(f.missing.n) + ' cases</td></tr></tfoot></table>';

    if (!state.weightVar) {
      html += '<div class="notice" style="margin-top:14px"><p>These are unweighted percentages. ' +
        'Set a weight in the Codebook tab.</p></div>';
    } else if (maxShift >= 0.03) {
      html += '<div class="notice quiet" style="margin-top:14px"><p>Weighting moves the largest ' +
        'category by ' + (100 * maxShift).toFixed(1) + ' points. Reporting the unweighted number ' +
        'here would have been wrong by about that much.</p></div>';
    }

    html += '<div class="chart" id="item-chart"></div>' +
      '<div class="figure-actions"><button class="secondary" id="item-dl">Save figure as SVG</button></div>';
    html += '</div>';

    body.innerHTML = html;

    var items = cats.map(function (c) {
      return { label: showValue(name, c.value), p: c.pW, moe: c.moe, n: c.n };
    });
    var svg = Charts.barsWithCI($('item-chart'), items, { labelWidth: 190 });
    $('item-dl').addEventListener('click', function () {
      Charts.downloadSVG(svg, name + '.svg');
    });
  }


  // ============================================================== profile

  var profileGroups = {};   // variable name -> included?

  $('profile-item').addEventListener('change', function () {
    renderProfileRoles();
    renderProfileGroups();
    renderProfile();
  });

  function renderProfileSetup() {
    if (!state.rows.length) return;
    renderProfileRoles();
    renderProfileGroups();
    renderProfile();
  }

  function renderProfileRoles() {
    var name = $('profile-item').value;
    var target = $('profile-roles');
    if (!name) { target.innerHTML = ''; return; }
    ensureRoles(name);
    var p = state.profileByName[name];

    var q = varQuestion(name);
    var html = '<div class="card"><h3>' + escapeHTML(varLabel(name)) + '</h3>';
    if (q) {
      html += '<p style="margin:-4px 0 14px;color:var(--slate);font-family:var(--font-text);' +
        'font-size:13.5px;max-width:72ch">' + escapeHTML(q) + '</p>';
    }
    html += '<p class="role-legend">Mark the answers being tracked. The chart shows the ' +
      'percentage of each group giving one of them.</p><div class="cat-editor">';
    p.values.forEach(function (v) {
      var role = state.roles[name][v.value] || 'no';
      html += '<div class="cat-row"><span class="cat-value">' +
        escapeHTML(showValue(name, v.value)) + '</span>' +
        '<span class="cat-n">' + fmt(v.n) + '</span>' +
        '<select data-pfvar="' + escapeHTML(name) + '" data-value="' + escapeHTML(v.value) + '">' +
        '<option value="yes"' + (role === 'yes' ? ' selected' : '') + '>track this</option>' +
        '<option value="no"' + (role === 'no' ? ' selected' : '') + '>other answer</option>' +
        '<option value="drop"' + (role === 'drop' ? ' selected' : '') + '>exclude</option>' +
        '</select></div>';
    });
    html += '</div></div>';
    target.innerHTML = html;

    target.querySelectorAll('select').forEach(function (sel) {
      sel.addEventListener('change', function () {
        state.roles[this.getAttribute('data-pfvar')][this.getAttribute('data-value')] = this.value;
        renderProfile();
      });
    });
  }

  /* Variables that make sense as a breakdown: a handful of categories, and
   * not the question being broken down. Pew names its background variables
   * with an F_ prefix, so those are selected to begin with; in a file with no
   * such convention, everything small enough is offered. */
  function backgroundCandidates() {
    var outcome = $('profile-item').value;
    return state.profiles.filter(function (p) {
      return p.name !== outcome && p.name !== state.weightVar &&
        p.kind !== 'empty' && p.kind !== 'free-text' &&
        p.distinct >= 2 && p.distinct <= 10;
    });
  }

  /* Which breakdowns to switch on before she has chosen anything.
   *
   * Turning on every background variable in a Pew file would draw a chart
   * three screens tall. These are the handful a first look normally wants,
   * matched by name; the rest are one click away. */
  var USUAL_BREAKDOWNS = [
    /AGECAT|^AGE|_AGE/i,
    /PARTYSUM|^PARTY|_PARTY/i,
    /EDUCCAT$|^EDUC$|_EDUC$/i,
    /USR_SELFID|URBAN|RURAL/i,
    /GENDER|^F_SEX/i,
    /CDIVISION|CREGION/i,
    /INC_TIER|INCOME/i
  ];

  /* Position in that list is a priority order, so a file holding several
   * geography variables does not crowd out age and party. */
  function breakdownRank(name) {
    for (var i = 0; i < USUAL_BREAKDOWNS.length; i++) {
      if (USUAL_BREAKDOWNS[i].test(name)) return i;
    }
    return 999;
  }

  function renderProfileGroups() {
    var cands = backgroundCandidates();

    var unset = cands.filter(function (p) { return profileGroups[p.name] === undefined; });
    if (unset.length) {
      var ranked = unset.slice().sort(function (a, b) {
        var ra = breakdownRank(a.name), rb = breakdownRank(b.name);
        if (ra !== rb) return ra - rb;
        return a.distinct - b.distinct;
      });
      var taken = {};
      ranked.forEach(function (p) {
        var r = breakdownRank(p.name);
        // one variable per concept: F_EDUCCAT and F_EDUCCAT2 say the same thing
        var want = r < 999 && !taken[r] && Object.keys(taken).length < 5;
        profileGroups[p.name] = want;
        if (want) taken[r] = true;
      });
    }

    var html = '';
    cands.forEach(function (p) {
      var on = profileGroups[p.name];
      html += '<div class="predictor-row' + (on ? ' is-on' : '') +
        '" data-gr="' + escapeHTML(p.name) + '">' +
        '<input type="checkbox" data-gvar="' + escapeHTML(p.name) + '"' + (on ? ' checked' : '') +
        ' aria-label="break out by ' + escapeHTML(varLabel(p.name)) + '">' +
        '<span class="pname">' + escapeHTML(varLabel(p.name)) + '</span>' +
        '<span class="pmeta">' + p.distinct + ' categories</span>' +
        '<span class="pmeta">' + escapeHTML(p.name) + '</span></div>';
    });

    var grid = $('profile-groups');
    grid.innerHTML = html || '<p class="empty-state">Nothing in this file has few enough ' +
      'categories to break out by.</p>';

    grid.querySelectorAll('input[type="checkbox"]').forEach(function (cb) {
      cb.addEventListener('change', function () {
        var v = this.getAttribute('data-gvar');
        profileGroups[v] = this.checked;
        var row = grid.querySelector('[data-gr="' + v.replace(/"/g, '\\"') + '"]');
        if (row) row.classList.toggle('is-on', this.checked);
        renderProfile();
      });
    });
  }

  function renderProfile() {
    var name = $('profile-item').value;
    var body = $('profile-body');
    if (!name) { body.innerHTML = ''; return; }

    ensureRoles(name);
    var yes = yesList(name);
    if (!yes.length) {
      body.innerHTML = '<div class="notice"><p>Mark at least one answer to track. ' +
        (hasLabels(name) ? '' : 'This variable is still bare numeric codes, so nothing could ' +
        'be guessed; load a dictionary in the Codebook tab and the answers will name themselves.') +
        '</p></div>';
      return;
    }

    var missing = missingSet().concat(dropList(name));
    var overall = Stats.collapsedProportion(state.rows, name, yes, state.weightVar, missing);
    if (!overall) { body.innerHTML = '<p class="empty-state">No cases answered this.</p>'; return; }

    var chosen = Object.keys(profileGroups).filter(function (k) {
      return profileGroups[k] && state.profileByName[k];
    });

    var panels = [];
    chosen.forEach(function (gv) {
      var prof = state.profileByName[gv];
      var rows = [];
      prof.values.forEach(function (lv) {
        var code = String(lv.value);
        if (missingSet().indexOf(code) !== -1) return;
        // "people who would not say which party they lean toward" is not a
        // group anyone wants a bar for. Refusals belong in the base of the
        // question being measured, not on the axis of who was asked it.
        if (state.detectedRefusals.indexOf(code) !== -1) return;
        var subset = state.rows.filter(function (r) { return String(r[gv]) === code; });
        var cp = Stats.collapsedProportion(subset, name, yes, state.weightVar, missing);
        if (!cp || cp.n < 25) return;   // too few cases to plot a point for
        rows.push({ label: labelOf(gv, lv.value), p: cp.p, moe: cp.moe, n: cp.n });
      });
      if (rows.length >= 2) panels.push({ title: varLabel(gv), rows: rows });
    });

    if (!panels.length) {
      body.innerHTML = '<p class="empty-state">Check at least one variable to break out by.</p>';
      return;
    }

    var tracked = yes.map(function (v) { return labelOf(name, v); }).join(', ');

    var html = '<div class="card"><h3>' + escapeHTML(varLabel(name)) + '</h3>' +
      '<p class="headline"><span class="big">' + Stats.pct(overall.p) + '</span> of everyone ' +
      'answered ' + escapeHTML(tracked) + ', \u00B1' + (100 * overall.moe).toFixed(1) + ' points.</p>' +
      '<div class="chart" id="profile-chart"></div>' +
      '<p style="margin:14px 0 0;color:var(--slate);font-size:12.5px;max-width:72ch">' +
      'A group whose interval overlaps the whole-sample line is drawn hollow: this survey ' +
      'cannot tell it apart from the average, and a difference read off those dots would not ' +
      'hold up. Groups with fewer than 25 cases are left out rather than plotted with an ' +
      'interval too wide to mean anything.</p>' +
      '<div class="figure-actions"><button class="secondary" id="profile-dl">Save figure as SVG</button></div>' +
      '</div>';

    body.innerHTML = html;

    var svg = Charts.profilePlot($('profile-chart'), panels, overall.p, {
      labelWidth: 176,
      axisLabel: 'percent answering ' + tracked
    });
    $('profile-dl').addEventListener('click', function () {
      Charts.downloadSVG(svg, 'profile_' + name + '.svg');
    });
  }

  // ============================================================= crosstab


  $('cross-row').addEventListener('change', renderCross);
  $('cross-col').addEventListener('change', renderCross);

  function renderCross() {
    var rv = $('cross-row').value, cv = $('cross-col').value;
    var body = $('cross-body');
    if (!rv || !cv) { body.innerHTML = '<p class="empty-state">Choose two variables.</p>'; return; }
    if (rv === cv) {
      body.innerHTML = '<p class="empty-state">Pick two different variables.</p>';
      return;
    }

    var ct = Stats.crosstab(state.rows, rv, cv, state.weightVar, missingSet());
    if (!ct.rowKeys.length || !ct.colKeys.length) {
      body.innerHTML = '<p class="empty-state">No cases answered both variables.</p>';
      return;
    }
    permuteCrosstab(ct);

    var html = '<div class="card"><h3>' + escapeHTML(cv) + ' by ' + escapeHTML(rv) + '</h3>';
    html += '<table class="data"><caption>Weighted row percentages. Each row sums to 100%.</caption><thead><tr><th>' +
      escapeHTML(rv) + '</th>';
    ct.colKeys.forEach(function (k) { html += '<th>' + escapeHTML(showValue(cv, k)) + '</th>'; });
    html += '<th class="moe">cases</th></tr></thead><tbody>';

    ct.rowKeys.forEach(function (rk, i) {
      html += '<tr><td>' + escapeHTML(showValue(rv, rk)) + '</td>';
      ct.rowPct[i].forEach(function (cell) {
        html += '<td>' + Stats.pct(cell.p, 0) + '</td>';
      });
      html += '<td class="moe">' + fmt(ct.rowTotalsN[i]) + '</td></tr>';
    });

    html += '</tbody><tfoot><tr><td>all</td>';
    ct.colKeys.forEach(function (k, j) {
      html += '<td>' + Stats.pct(ct.totalW > 0 ? ct.colTotalsW[j] / ct.totalW : 0, 0) + '</td>';
    });
    html += '<td class="moe">' + fmt(ct.totalN) + '</td></tr></tfoot></table>';

    if (ct.test) {
      html += '<div class="stat-line">' +
        stat('chi-square', ct.test.chi2.toFixed(2)) +
        stat('df', String(ct.test.df)) +
        stat('p', pShort(ct.test.p)) +
        stat("Cramer's V", ct.test.cramersV.toFixed(3)) +
        stat('effective n', fmt(ct.test.nEff)) +
        '</div>';

      var verdict;
      if (ct.test.p < 0.05) {
        verdict = 'Differences between groups this large would appear in fewer than ' +
          (ct.test.p < 0.001 ? '1 in 1,000' : (100 * ct.test.p).toFixed(1) + '%') +
          ' of samples drawn from a population where the groups actually answered alike. ' +
          "Cramer's V of " + ct.test.cramersV.toFixed(3) + ' describes how strong the association is, ' +
          'on a scale where 0 is no association and 1 is a perfect one.';
      } else {
        verdict = 'Differences this large are within the range that sampling alone produces ' +
          'when groups answer alike, so this table does not establish a difference between them.';
      }
      html += '<p style="margin:12px 0 0;color:var(--slate);max-width:66ch;font-size:12.5px">' +
        verdict + '</p>';

      if (ct.test.smallCells) {
        html += '<div class="notice" style="margin-top:12px"><p>At least one cell has an expected ' +
          'count below 5, so the chi-square approximation is unreliable here. Combining categories ' +
          'would give a more trustworthy test.</p></div>';
      }
    }

    if (!state.weightVar) {
      html += '<div class="notice" style="margin-top:12px"><p>Unweighted. Set a weight in the ' +
        'Codebook tab.</p></div>';
    }

    html += '<div class="chart" id="cross-chart"></div>' +
      '<div class="figure-actions"><button class="secondary" id="cross-dl">Save figure as SVG</button></div>';
    html += '</div>';
    body.innerHTML = html;

    // small multiples: one stacked row per group
    var series = ct.rowKeys.map(function (rk, i) {
      return {
        label: showValue(rv, rk) + '  (n=' + ct.rowTotalsN[i] + ')',
        segments: ct.colKeys.map(function (ck, j) {
          return { name: showValue(cv, ck), p: ct.rowPct[i][j].p };
        })
      };
    });
    // Where the supporting categories end. For an ordered scale this comes
    // from the scale itself; otherwise the categories are nominal and the
    // bars are read as a plain composition with no zero line.
    var colProfile = state.profileByName[cv];
    var split = ct.colKeys.length - 1;
    var hasMiddle = false;
    if (colProfile && colProfile.isScale) {
      split = -1;
      ct.colKeys.forEach(function (k, ix) {
        var sc = CSV.scaleScore(k);
        if (sc !== null && sc < 0) split = ix;
      });
      hasMiddle = colProfile.hasMiddle;
      if (split < 0) split = 0;
    }
    var svg = Charts.divergingBars($('cross-chart'), series, ct.colKeys, split,
      { labelWidth: 190, hasMiddle: hasMiddle, showNet: colProfile && colProfile.isScale });
    $('cross-dl').addEventListener('click', function () {
      Charts.downloadSVG(svg, cv + '_by_' + rv + '.svg');
    });
  }

  /* Reorder a crosstab's rows and columns into codebook order, in place.
   * The chi-square statistic is invariant to this, so only the display
   * arrays move. */
  function permuteCrosstab(ct) {
    function orderOf(varName, keys) {
      var p = state.profileByName[varName];
      var rank = {};
      if (p) p.values.forEach(function (v, ix) { rank[v.value] = ix; });
      return keys.map(function (k, i) { return i; }).sort(function (a, b) {
        var ra = rank[keys[a]], rb = rank[keys[b]];
        if (ra === undefined) ra = 1e6 + a;
        if (rb === undefined) rb = 1e6 + b;
        return ra - rb;
      });
    }

    var ri = orderOf(ct.rowVar, ct.rowKeys);
    var ci = orderOf(ct.colVar, ct.colKeys);

    function takeRows(arr) { return ri.map(function (i) { return arr[i]; }); }
    function takeCols(row) { return ci.map(function (j) { return row[j]; }); }

    ct.rowKeys = takeRows(ct.rowKeys);
    ct.rowTotalsW = takeRows(ct.rowTotalsW);
    ct.rowTotalsN = takeRows(ct.rowTotalsN);
    ct.cellsW = takeRows(ct.cellsW).map(takeCols);
    ct.cellsN = takeRows(ct.cellsN).map(takeCols);
    ct.rowPct = takeRows(ct.rowPct).map(takeCols);
    ct.colKeys = ci.map(function (j) { return ct.colKeys[j]; });
    ct.colTotalsW = ci.map(function (j) { return ct.colTotalsW[j]; });
    ct.colTotalsN = ci.map(function (j) { return ct.colTotalsN[j]; });
  }

  /* Typographic minus rather than a hyphen, so a table of estimates and a
   * table of intervals look like they belong to each other. */
  function num(x, digits) {
    if (x === null || x === undefined || isNaN(x)) return '\u2014';
    var v = Number(x).toFixed(digits);
    return v.replace(/^-/, '\u2212');
  }

  /* Formats a p-value for a compact readout without losing the
   * distinction between "equals" and "is below". */
  function pShort(p) {
    if (p === null || p === undefined || isNaN(p)) return '\u2014';
    if (p < 0.001) return '< 0.001';
    return p.toFixed(3);
  }

  function stat(label, value, small) {
    return '<div class="stat"><span class="label">' + label + '</span>' +
      '<span class="value' + (small ? ' small' : '') + '">' + value + '</span></div>';
  }

  // ================================================== general vs. local

  ['gap-a', 'gap-b'].forEach(function (id) {
    $(id).addEventListener('change', function () { renderGapCategories(); renderGap(); });
  });
  $('gap-group').addEventListener('change', renderGap);

  /* Starting guess for whether a response counts as support.
   *
   * Anything the scale reader does not recognize defaults to excluded
   * rather than to "does not support". Counting an unread refusal code as
   * opposition would quietly inflate the gap, which is the one error this
   * panel exists to avoid. */
  function guessRole(value, varName) {
    var score = CSV.scaleScore(varName ? labelOf(varName, value) : value);
    // A refusal counts as an answer in the denominator unless the Codebook
    // switch says otherwise, which is what reproduces Pew's published
    // figures. It is never the answer being tracked.
    if (score === 100) return state.excludeRefusals ? 'drop' : 'no';
    if (score === null) return 'drop';
    if (score < 0) return 'yes';
    if (score === 0) return 'drop';
    return 'no';
  }

  function ensureRoles(name) {
    if (!name) return;
    var p = state.profileByName[name];
    if (!p) return;
    if (!state.roles[name]) {
      state.roles[name] = {};
      p.values.forEach(function (v) { state.roles[name][v.value] = guessRole(v.value, name); });
    }
  }

  function renderGapCategories() {
    var a = $('gap-a').value, b = $('gap-b').value;
    ensureRoles(a); ensureRoles(b);
    var target = $('gap-categories');
    if (!a || !b) { target.innerHTML = ''; return; }

    var html = '<div class="card"><h3>Which answers count as support</h3>' +
      '<p class="role-legend">Each response option has to be sorted into supports, does not support, ' +
      'or excluded from the base. The starting guesses below come from matching the text of each ' +
      'option; check them against the questionnaire, because a reversed scale will invert the result.</p>' +
      ((!hasLabels(a) || !hasLabels(b))
        ? '<div class="notice"><p>One of these variables is still bare numeric codes, so nothing ' +
          'can be guessed and every option starts excluded. Add labels for it in the Codebook tab ' +
          'and the assignments will fill themselves in.</p></div>'
        : '') +
      '<div class="two-col">';

    [[a, 'Question A'], [b, 'Question B']].forEach(function (pair) {
      var name = pair[0];
      var p = state.profileByName[name];
      html += '<div><p style="font-size:11.5px;color:var(--slate);margin:0 0 8px">' + pair[1] +
        ' &mdash; <code>' + escapeHTML(name) + '</code></p><div class="cat-editor">';
      p.values.forEach(function (v) {
        var role = state.roles[name][v.value] || 'no';
        html += '<div class="cat-row"><span class="cat-value">' + escapeHTML(showValue(name, v.value)) + '</span>' +
          '<span class="cat-n">' + fmt(v.n) + '</span>' +
          '<select data-var="' + escapeHTML(name) + '" data-value="' + escapeHTML(v.value) + '">' +
          '<option value="yes"' + (role === 'yes' ? ' selected' : '') + '>supports</option>' +
          '<option value="no"' + (role === 'no' ? ' selected' : '') + '>does not</option>' +
          '<option value="drop"' + (role === 'drop' ? ' selected' : '') + '>exclude</option>' +
          '</select></div>';
      });
      html += '</div></div>';
    });

    html += '</div></div>';
    target.innerHTML = html;

    target.querySelectorAll('select').forEach(function (sel) {
      sel.addEventListener('change', function () {
        var v = this.getAttribute('data-var');
        state.roles[v][this.getAttribute('data-value')] = this.value;
        renderGap();
      });
    });
  }

  function yesList(name) {
    var r = state.roles[name] || {};
    return Object.keys(r).filter(function (k) { return r[k] === 'yes'; });
  }
  function dropList(name) {
    var r = state.roles[name] || {};
    return Object.keys(r).filter(function (k) { return r[k] === 'drop'; });
  }

  function renderGap() {
    var a = $('gap-a').value, b = $('gap-b').value, gv = $('gap-group').value;
    var body = $('gap-body');

    if (!a || !b) {
      body.innerHTML = '<p class="empty-state">Choose the general-support question and the ' +
        'local-support question.</p>';
      return;
    }
    if (a === b) {
      body.innerHTML = '<p class="empty-state">The two questions have to be different variables.</p>';
      return;
    }

    ensureRoles(a); ensureRoles(b);
    if (!$('gap-categories').innerHTML) renderGapCategories();

    var yesA = yesList(a), yesB = yesList(b);
    if (!yesA.length || !yesB.length) {
      body.innerHTML = '<p class="empty-state">At least one response option on each question has ' +
        'to be marked as supporting.</p>';
      return;
    }

    var missing = missingSet().concat(dropList(a)).concat(dropList(b));
    var res = Stats.pairedGap(state.rows, a, yesA, b, yesB, state.weightVar, missing);

    if (!res) {
      body.innerHTML = '<p class="empty-state">No cases answered both questions.</p>';
      return;
    }

    var html = '';

    // headline
    var gapPts = 100 * res.gap;
    html += '<div class="card"><h3>The gap</h3>';
    html += '<p class="headline"><span class="big">' + Math.abs(gapPts).toFixed(1) + ' points</span><br>' +
      Stats.pct(res.pA) + ' support it in general; ' + Stats.pct(res.pB) +
      ' support it where they live' +
      (gapPts >= 0 ? '.' : ', which is higher rather than lower.') + '</p>';

    html += '<div class="stat-line">' +
      stat('gap', (gapPts >= 0 ? '\u2212' : '+') + Math.abs(gapPts).toFixed(1) + ' pts') +
      stat('95% interval', '\u00B1' + (100 * res.moeGap).toFixed(1) + ' pts') +
      (res.mcnemar ? stat('McNemar chi-square', res.mcnemar.chi2.toFixed(2)) : '') +
      (res.mcnemar ? stat('p', pShort(res.mcnemar.p)) : '') +
      stat('effective n', fmt(res.design.nEff)) +
      '</div>';

    var interp;
    if (res.mcnemar && res.mcnemar.p < 0.05) {
      interp = 'The people who answered the two questions differently are lopsided enough that ' +
        'sampling error does not account for it: support really does fall between the general ' +
        'and the local version of the question in this sample. ' +
        Stats.pct(res.cellsW.aOnly / res.totalW) + ' of respondents support it in general while ' +
        'not supporting it locally, against ' + Stats.pct(res.cellsW.bOnly / res.totalW) +
        ' who do the reverse.';
    } else if (res.mcnemar) {
      interp = 'The respondents who answered the two questions differently split close to evenly ' +
        'between the two directions, so this sample does not show a general-to-local shift.';
    } else {
      interp = 'Every respondent answered both questions the same way, so there is no discordance ' +
        'to test.';
    }
    html += '<p style="margin:14px 0 0;color:var(--slate);max-width:66ch;font-size:12.5px">' +
      interp + '</p>';

    if (res.mcnemar && res.mcnemar.sparse) {
      html += '<div class="notice" style="margin-top:12px"><p>Fewer than about 10 effective cases ' +
        'answered the two questions differently, which is too few for McNemar\'s test to be ' +
        'reliable.</p></div>';
    }
    if (!state.weightVar) {
      html += '<div class="notice" style="margin-top:12px"><p>Unweighted. Set a weight in the ' +
        'Codebook tab before quoting these numbers.</p></div>';
    }
    html += '</div>';

    // 2x2 picture plus the table
    html += '<div class="card"><h3>Where the respondents sit</h3><div class="two-col">' +
      '<div class="chart" id="gap-square"></div>' +
      '<div id="gap-table"></div></div>' +
      '<div class="figure-actions"><button class="secondary" id="square-dl">Save figure as SVG</button></div></div>';

    // by group
    if (gv) {
      html += '<div class="card"><h3>The gap by ' + escapeHTML(gv) + '</h3>' +
        '<div class="chart" id="gap-chart"></div>' +
        '<div id="gap-group-table"></div>' +
        '<div class="figure-actions"><button class="secondary" id="gap-dl">Save figure as SVG</button></div></div>';
    }

    body.innerHTML = html;

    // --- 2x2
    var sq = Charts.pairedSquare($('gap-square'), res);
    var c = res.cellsW, cn = res.cellsN, tot = res.totalW;
    $('gap-table').innerHTML =
      '<table class="data"><caption>Weighted share of respondents in each combination of answers.</caption>' +
      '<thead><tr><th>answer pattern</th><th>cases</th><th>weighted</th></tr></thead><tbody>' +
      '<tr><td>supports in general and locally</td><td>' + fmt(cn.bothYes) + '</td><td>' + Stats.pct(c.bothYes / tot) + '</td></tr>' +
      '<tr><td>supports in general, not locally</td><td>' + fmt(cn.aOnly) + '</td><td>' + Stats.pct(c.aOnly / tot) + '</td></tr>' +
      '<tr><td>supports locally, not in general</td><td>' + fmt(cn.bOnly) + '</td><td>' + Stats.pct(c.bOnly / tot) + '</td></tr>' +
      '<tr><td>supports neither</td><td>' + fmt(cn.neither) + '</td><td>' + Stats.pct(c.neither / tot) + '</td></tr>' +
      '</tbody><tfoot><tr><td>answered both</td><td>' + fmt(res.design.n) + '</td>' +
      '<td>' + fmt(res.excluded) + ' excluded</td></tr></tfoot></table>';
    $('square-dl').addEventListener('click', function () {
      Charts.downloadSVG(sq, 'paired_' + a + '_' + b + '.svg');
    });

    // --- by group
    if (gv) {
      var groups = Stats.gapByGroup(state.rows, a, yesA, b, yesB, gv, state.weightVar, missing);

      // A grouping variable with a natural order — age bands, an ordered
      // scale — keeps that order, because a reader looking for a trend
      // across it needs the categories in sequence. An unordered variable
      // is sorted by the size of the gap instead, which is easier to read.
      var gp = state.profileByName[gv];
      var naturallyOrdered = gp && (gp.isScale || gp.allNumeric ||
        gp.values.every(function (v) { return /^\s*\d/.test(v.value); }));

      if (naturallyOrdered) {
        var rank = {};
        gp.values.forEach(function (v, ix) { rank[v.value] = ix; });
        groups.sort(function (x, y) {
          var rx = rank[x.group], ry = rank[y.group];
          return (rx === undefined ? 1e6 : rx) - (ry === undefined ? 1e6 : ry);
        });
      } else {
        groups.sort(function (x, y) { return y.gap - x.gap; });
      }

      var plotData = groups.map(function (g) {
        return {
          label: showValue(gv, g.group), pA: g.pA, pB: g.pB, gap: g.gap,
          moeA: 1.959964 * g.seA, moeB: 1.959964 * g.seB,
          nEff: g.design.nEff
        };
      });
      var gsvg = Charts.gapPlot($('gap-chart'), plotData, {
        labelWidth: 170,
        labelA: 'in general',
        labelB: 'locally'
      });

      var gt = '<table class="data"><caption>Each row is a separate paired comparison within that ' +
        'group. Margins of error widen as groups get smaller.</caption><thead><tr>' +
        '<th>' + escapeHTML(gv) + '</th><th>in general</th><th>locally</th><th>gap</th>' +
        '<th class="moe">95% interval</th><th class="moe">McNemar p</th><th class="moe">effective n</th>' +
        '</tr></thead><tbody>';
      groups.forEach(function (g) {
        gt += '<tr><td>' + escapeHTML(showValue(gv, g.group)) + '</td>' +
          '<td>' + Stats.pct(g.pA, 0) + '</td>' +
          '<td>' + Stats.pct(g.pB, 0) + '</td>' +
          '<td>' + (g.gap >= 0 ? '\u2212' : '+') + Math.abs(100 * g.gap).toFixed(1) + '</td>' +
          '<td class="moe">\u00B1' + (100 * g.moeGap).toFixed(1) + '</td>' +
          '<td class="moe">' + (g.mcnemar ? pShort(g.mcnemar.p) : '\u2014') + '</td>' +
          '<td class="moe">' + fmt(g.design.nEff) + '</td></tr>';
      });
      gt += '</tbody></table>';
      $('gap-group-table').innerHTML = gt;

      $('gap-dl').addEventListener('click', function () {
        Charts.downloadSVG(gsvg, 'gap_by_' + gv + '.svg');
      });
    }
  }


  // ============================================================ regression

  var modelPredictors = {};   // variable name -> {on, reference}

  function modelKind() {
    var r = document.querySelector('input[name="model-kind"]:checked');
    return r ? r.value : 'linear';
  }

  $('model-outcome').addEventListener('change', function () {
    renderModelOutcomeRoles();
    $('model-body').innerHTML = '';
  });
  Array.prototype.forEach.call(document.querySelectorAll('input[name="model-kind"]'), function (r) {
    r.addEventListener('change', function () { $('model-body').innerHTML = ''; });
  });
  $('model-fit').addEventListener('click', fitAndRenderModel);

  function renderModelSetup() {
    if (!state.rows.length) return;
    renderModelOutcomeRoles();
    renderModelPredictors();
  }

  /* The outcome has to be a yes/no indicator, so it reuses the same
   * category editor as the paired panel. */
  function renderModelOutcomeRoles() {
    var name = $('model-outcome').value;
    var target = $('model-outcome-roles');
    if (!name) { target.innerHTML = ''; return; }
    ensureRoles(name);
    var p = state.profileByName[name];

    var html = '<p class="role-legend">The model explains the probability of the ' +
      'answers marked as the outcome. Everything marked excluded is dropped from ' +
      'the model rather than counted on either side.</p><div class="cat-editor">';
    p.values.forEach(function (v) {
      var role = state.roles[name][v.value] || 'no';
      html += '<div class="cat-row"><span class="cat-value">' + escapeHTML(v.value) + '</span>' +
        '<span class="cat-n">' + fmt(v.n) + '</span>' +
        '<select data-mvar="' + escapeHTML(name) + '" data-value="' + escapeHTML(v.value) + '">' +
        '<option value="yes"' + (role === 'yes' ? ' selected' : '') + '>the outcome</option>' +
        '<option value="no"' + (role === 'no' ? ' selected' : '') + '>not the outcome</option>' +
        '<option value="drop"' + (role === 'drop' ? ' selected' : '') + '>exclude</option>' +
        '</select></div>';
    });
    html += '</div>';
    target.innerHTML = html;

    target.querySelectorAll('select').forEach(function (sel) {
      sel.addEventListener('change', function () {
        state.roles[this.getAttribute('data-mvar')][this.getAttribute('data-value')] = this.value;
        $('model-body').innerHTML = '';
      });
    });
  }

  function renderModelPredictors() {
    var outcome = $('model-outcome').value;
    var grid = $('model-predictors');
    var candidates = analysisVars().filter(function (p) {
      return p.name !== outcome && p.distinct <= 30;
    });

    var html = '';
    candidates.forEach(function (p) {
      var st = modelPredictors[p.name] || { on: false, reference: p.values[0].value };
      modelPredictors[p.name] = st;
      // a numeric column with many distinct values enters as a number;
      // otherwise it is treated as a set of categories
      var asNumeric = p.allNumeric && p.distinct > 8;

      html += '<div class="predictor-row' + (st.on ? ' is-on' : '') + '" data-row="' + escapeHTML(p.name) + '">' +
        '<input type="checkbox" data-pvar="' + escapeHTML(p.name) + '"' + (st.on ? ' checked' : '') +
        ' aria-label="include ' + escapeHTML(p.name) + '">' +
        '<span class="pname">' + escapeHTML(p.name) + '</span>' +
        '<span class="pmeta">' + (asNumeric ? 'numeric' : p.distinct + ' categories') + '</span>';

      if (asNumeric) {
        html += '<span class="pmeta">per unit</span>';
      } else {
        html += '<select data-refvar="' + escapeHTML(p.name) + '" aria-label="reference category">';
        p.values.forEach(function (v) {
          html += '<option value="' + escapeHTML(v.value) + '"' +
            (String(v.value) === String(st.reference) ? ' selected' : '') + '>ref: ' +
            escapeHTML(showValue(p.name, v.value)) + '</option>';
        });
        html += '</select>';
      }
      html += '</div>';
    });

    grid.innerHTML = html || '<p class="empty-state">No usable predictors in this file.</p>';

    grid.querySelectorAll('input[type="checkbox"]').forEach(function (cb) {
      cb.addEventListener('change', function () {
        var v = this.getAttribute('data-pvar');
        modelPredictors[v].on = this.checked;
        var row = grid.querySelector('[data-row="' + v.replace(/"/g, '\\"') + '"]');
        if (row) row.classList.toggle('is-on', this.checked);
      });
    });
    grid.querySelectorAll('select[data-refvar]').forEach(function (sel) {
      sel.addEventListener('change', function () {
        modelPredictors[this.getAttribute('data-refvar')].reference = this.value;
      });
    });
  }

  function fitAndRenderModel() {
    var outcomeName = $('model-outcome').value;
    var body = $('model-body');
    if (!outcomeName) { body.innerHTML = '<p class="empty-state">Choose an outcome.</p>'; return; }

    ensureRoles(outcomeName);
    var yes = yesList(outcomeName), drop = dropList(outcomeName);
    if (!yes.length) {
      body.innerHTML = '<div class="notice"><p>At least one response has to be marked as ' +
        'the outcome.</p></div>';
      return;
    }

    var preds = [];
    Object.keys(modelPredictors).forEach(function (name) {
      if (!modelPredictors[name].on) return;
      var p = state.profileByName[name];
      if (!p) return;
      var asNumeric = p.allNumeric && p.distinct > 8;
      preds.push({
        name: name,
        type: asNumeric ? 'numeric' : 'categorical',
        levels: p.values.map(function (v) { return v.value; }),
        reference: modelPredictors[name].reference
      });
    });

    if (!preds.length) {
      body.innerHTML = '<div class="notice"><p>Check at least one predictor.</p></div>';
      return;
    }

    var kind = modelKind();
    var missing = missingSet().concat(drop);
    var m = Regression.fit(state.rows, { name: outcomeName, yes: yes, drop: drop },
      preds, state.weightVar, missing, kind);

    if (m.error) {
      body.innerHTML = '<div class="notice error"><p>' + escapeHTML(m.error) + '</p></div>';
      return;
    }

    renderModelResults(m, outcomeName, preds, kind);
  }

  function renderModelResults(m, outcomeName, preds, kind) {
    var body = $('model-body');
    var isLinear = (kind === 'linear');

    var html = '<div class="card"><h3>Estimates</h3>';

    html += '<p class="headline">' +
      (isLinear
        ? 'Each estimate is the change in the probability of the outcome, in percentage points, ' +
          'when that predictor changes and the others stay put.'
        : 'Each coefficient is a log odds ratio. The rightmost column converts it into the ' +
          'average change in probability, in percentage points, which is the figure to quote.') +
      '</p>';

    html += '<table class="data"><caption>' +
      (isLinear ? 'Weighted least squares' : 'Weighted logistic regression') +
      ' on ' + escapeHTML(outcomeName) +
      '. Standard errors are design-based and account for the weights but not for ' +
      'clustering. Reference categories carry no estimate: every other category in ' +
      'that variable is measured against them.</caption><thead><tr>' +
      '<th>term</th><th>' + (isLinear ? 'estimate' : 'log odds') + '</th>' +
      (isLinear ? '' : '<th>odds ratio</th>') +
      '<th class="moe">std. error</th><th class="moe">95% interval</th><th class="moe">p</th>' +
      (isLinear ? '' : '<th>effect, pts</th>') +
      '</tr></thead><tbody>';

    // reference rows are inserted so the omitted category is visible
    var shown = [];
    m.coefficients.forEach(function (c) { shown.push({ coef: c }); });
    preds.forEach(function (p) {
      if (p.type !== 'categorical') return;
      var ix = -1;
      shown.forEach(function (s, i) {
        if (s.coef && s.coef.variable === p.name) ix = i;
      });
      var firstIx = -1;
      for (var i = 0; i < shown.length; i++) {
        if (shown[i].coef && shown[i].coef.variable === p.name) { firstIx = i; break; }
      }
      if (firstIx >= 0) {
        shown.splice(firstIx, 0, { reference: true, variable: p.name, level: p.reference });
      }
    });

    shown.forEach(function (s) {
      if (s.reference) {
        html += '<tr class="is-reference"><td class="term">' +
          escapeHTML(s.variable + ': ' + showValue(s.variable, s.level)) + '</td>' +
          '<td colspan="' + (isLinear ? 4 : 6) + '">reference category</td></tr>';
        return;
      }
      var c = s.coef;
      var est = isLinear
        ? ((c.beta >= 0 ? '+' : '\u2212') + Math.abs(100 * c.beta).toFixed(1) + ' pts')
        : num(c.beta, 3);
      html += '<tr><td class="term">' + escapeHTML(
        c.level !== undefined ? c.variable + ': ' + showValue(c.variable, c.level) : c.label) + '</td>' +
        '<td>' + est + '</td>' +
        (isLinear ? '' : '<td>' + c.oddsRatio.toFixed(2) + '</td>') +
        '<td class="moe">' + (isLinear ? num(100 * c.se, 1) : num(c.se, 3)) + '</td>' +
        '<td class="moe">' + (isLinear
          ? num(100 * c.lo, 1) + ' to ' + num(100 * c.hi, 1)
          : num(c.lo, 2) + ' to ' + num(c.hi, 2)) + '</td>' +
        '<td class="moe">' + pShort(c.p) + '</td>' +
        (isLinear ? '' : '<td>' + (c.ame === null ? '\u2014' :
          (c.ame >= 0 ? '+' : '\u2212') + Math.abs(100 * c.ame).toFixed(1)) + '</td>') +
        '</tr>';
    });

    html += '</tbody><tfoot><tr><td>fit</td><td colspan="' + (isLinear ? 4 : 6) + '">' +
      'complete cases ' + fmt(m.n) + ' &middot; effective n ' + fmt(m.nEff) +
      ' &middot; dropped for missing data ' + fmt(m.dropped) +
      ' &middot; ' + (isLinear
        ? 'R\u00B2 ' + (isFinite(m.r2) ? m.r2.toFixed(3) : '\u2014')
        : 'McFadden pseudo-R\u00B2 ' + (isFinite(m.pseudoR2) ? m.pseudoR2.toFixed(3) : '\u2014')) +
      '</td></tr></tfoot></table>';

    if (!state.weightVar) {
      html += '<div class="notice" style="margin-top:14px"><p>Fitted without weights. ' +
        'Set a weight in the Codebook tab.</p></div>';
    }
    if (kind === 'logistic' && !m.converged) {
      html += '<div class="notice" style="margin-top:14px"><p>The fitting routine did not ' +
        'converge in the iteration limit. A category with very few cases is the usual ' +
        'cause; combining categories normally fixes it.</p></div>';
    }
    if (isLinear) {
      var anyOut = m.coefficients.some(function (c) {
        return c.kind === 'intercept' ? false : false;
      });
      html += '<p style="margin:14px 0 0;color:var(--slate);font-size:12.5px;max-width:70ch">' +
        'A linear probability model can predict probabilities below 0 or above 1 for ' +
        'unusual combinations of predictors, which is its known weakness. Refitting as ' +
        'logistic is the check: if the two tell the same story, the simpler one is fine to ' +
        'report.</p>';
    }
    html += '</div>';

    // coefficient plot
    html += '<div class="card"><h3>What the model separates</h3>' +
      '<p style="margin:0 0 14px;color:var(--slate);font-size:12.5px;max-width:70ch">' +
      'A hollow dot marks an interval that crosses zero: the model has not distinguished ' +
      'that category from its reference.</p>' +
      '<div class="chart" id="coef-chart"></div>' +
      '<div class="figure-actions"><button class="secondary" id="coef-dl">Save figure as SVG</button></div></div>';

    // adjusted predictions, for the first categorical predictor
    var firstCat = preds.filter(function (p) { return p.type === 'categorical'; })[0];
    if (firstCat) {
      html += '<div class="card"><h3>Adjusted predictions</h3>' +
        '<p style="margin:0 0 14px;color:var(--slate);font-size:12.5px;max-width:70ch">' +
        'What the model says support would be if the entire sample had each value of ' +
        '<code>' + escapeHTML(firstCat.name) + '</code>, with every other predictor left at its ' +
        'observed value. The tick marks the plain weighted percentage in the data, which ' +
        'has no such adjustment. A wide separation between the two says the raw ' +
        'difference was partly something else.</p>' +
        '<div class="controls"><div class="field">' +
        '<label for="adj-var">Predictor</label><select id="adj-var"></select>' +
        '</div></div>' +
        '<div class="chart" id="adj-chart"></div>' +
        '<div class="figure-actions"><button class="secondary" id="adj-dl">Save figure as SVG</button></div></div>';
    }

    body.innerHTML = html;

    // --- coefficient plot data
    var plotTerms = [];
    preds.forEach(function (p) {
      if (p.type === 'categorical') {
        plotTerms.push({ label: p.name + ': ' + showValue(p.name, p.reference),
          reference: true, estimate: 0, lo: 0, hi: 0 });
      }
      m.coefficients.forEach(function (c) {
        if (c.variable !== p.name) return;
        var useAme = (kind === 'logistic');
        plotTerms.push({
          label: p.name + ': ' + showValue(p.name, c.level),
          estimate: useAme ? c.ame : c.beta,
          lo: useAme ? c.ame - 1.959964 * c.ameSE : c.lo,
          hi: useAme ? c.ame + 1.959964 * c.ameSE : c.hi
        });
      });
    });

    var coefSvg = Charts.coefficientPlot($('coef-chart'), plotTerms, {
      labelWidth: 215,
      asPercentagePoints: true,
      axisLabel: (kind === 'logistic'
        ? 'average marginal effect on the probability of the outcome (percentage points)'
        : 'change in the probability of the outcome (percentage points)')
    });
    $('coef-dl').addEventListener('click', function () {
      Charts.downloadSVG(coefSvg, 'coefficients_' + outcomeName + '.svg');
    });

    // --- adjusted predictions
    if (firstCat) {
      var cats = preds.filter(function (p) { return p.type === 'categorical'; });
      fillSelect($('adj-var'), cats.map(function (p) {
        return { name: p.name, distinct: p.levels.length };
      }));
      $('adj-var').value = firstCat.name;

      function drawAdjusted() {
        var varName = $('adj-var').value;
        var spec = preds.filter(function (p) { return p.name === varName; })[0];
        if (!spec) return;

        var ap = Regression.adjustedPredictions(m.X, m.w, m.beta, m.terms,
          varName, spec.levels, spec.reference, kind);

        // the unadjusted weighted percentage within each level, for comparison
        var observed = {};
        spec.levels.forEach(function (lv) {
          var subset = state.rows.filter(function (r) { return String(r[varName]) === String(lv); });
          var cp = Stats.collapsedProportion(subset, outcomeName, yesList(outcomeName),
            state.weightVar, missingSet().concat(dropList(outcomeName)));
          observed[lv] = cp ? cp.p : null;
        });

        var points = ap.map(function (a) {
          return {
            label: showValue(varName, a.level), p: a.p,
            observed: observed[a.level], isReference: a.isReference
          };
        });

        var adjSvg = Charts.adjustedPlot($('adj-chart'), points, {
          labelWidth: 175,
          labelModel: 'model estimate, others held constant',
          labelObserved: 'plain weighted percentage'
        });
        $('adj-dl').onclick = function () {
          Charts.downloadSVG(adjSvg, 'adjusted_' + varName + '.svg');
        };
      }

      $('adj-var').addEventListener('change', drawAdjusted);
      drawAdjusted();
    }
  }

  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  updateReadout();
})();
