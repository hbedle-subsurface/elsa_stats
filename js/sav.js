/* sav.js — read an SPSS .sav file in the browser.
 *
 * Pew and most other survey archives distribute a .sav, which carries the
 * question wording and the answer labels that the CSV they ship alongside it
 * does not. Reading the .sav directly means a student drags one file in and
 * everything is already named.
 *
 * The format is a header followed by a run of records, then the data. This
 * reader handles what a released survey file actually uses: little- and
 * big-endian layouts, bytecode-compressed data, value labels, long variable
 * names, and the character encoding record. It does not handle the
 * zlib-compressed variant (.zsav, compression flag 2); for those the Python
 * converter in tools/ is the way in.
 *
 * Nothing here touches the network. The file is read from the user's disk
 * with FileReader and parsed in memory.
 */

(function (global) {
  'use strict';

  var SYSMIS_THRESHOLD = -1.7e308;   // SPSS system-missing is a huge negative

  function Reader(buffer) {
    this.view = new DataView(buffer);
    this.bytes = new Uint8Array(buffer);
    this.pos = 0;
    this.little = true;
  }

  Reader.prototype.int32 = function () {
    var v = this.view.getInt32(this.pos, this.little);
    this.pos += 4;
    return v;
  };
  Reader.prototype.double = function () {
    var v = this.view.getFloat64(this.pos, this.little);
    this.pos += 8;
    return v;
  };
  Reader.prototype.raw = function (n) {
    var slice = this.bytes.subarray(this.pos, this.pos + n);
    this.pos += n;
    return slice;
  };
  Reader.prototype.skip = function (n) { this.pos += n; };

  function decodeText(bytes, encoding) {
    try {
      return new TextDecoder(encoding || 'utf-8', { fatal: false }).decode(bytes);
    } catch (e) {
      var s = '';
      for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
      return s;
    }
  }

  function trimRight(s) { return s.replace(/[\s\u0000]+$/, ''); }

  /* SPSS stores a number even when the underlying answer is a whole-number
   * code. Write 1 rather than 1, so the value matches the codes printed in
   * the questionnaire and in any label map. */
  function numberToString(v) {
    if (v === null || !isFinite(v)) return '';
    if (Number.isInteger(v) && Math.abs(v) < 1e15) return String(v);
    var s = v.toPrecision(12);
    if (s.indexOf('e') === -1) s = s.replace(/0+$/, '').replace(/\.$/, '');
    return s;
  }

  function parse(buffer) {
    var r = new Reader(buffer);

    var magic = decodeText(r.raw(4), 'latin1');
    if (magic === '$FL3') {
      throw new Error('This is a zlib-compressed SPSS file (.zsav). Convert it with ' +
        'tools/make_dictionary.py, or re-save it as a plain .sav.');
    }
    if (magic !== '$FL2') {
      throw new Error('This does not look like an SPSS .sav file.');
    }

    r.skip(60);                              // product name

    // The layout code is 2 or 3 when read with the correct endianness.
    var layoutPos = r.pos;
    var layout = r.int32();
    if (layout !== 2 && layout !== 3) {
      r.little = false;
      r.pos = layoutPos;
      layout = r.int32();
      if (layout !== 2 && layout !== 3) {
        throw new Error('The file header is not readable; it may be truncated.');
      }
    }

    var caseSize = r.int32();                // cells per case, continuations included
    var compression = r.int32();
    r.int32();                               // weight index, unused here
    var nCases = r.int32();
    var bias = r.double();
    r.skip(9 + 8 + 64 + 3);                  // creation date, time, file label, padding

    if (compression === 2) {
      throw new Error('This file uses zlib compression. Convert it with ' +
        'tools/make_dictionary.py instead.');
    }

    var variables = [];      // one entry per cell, continuations included
    var valueLabelSets = [];
    var longNames = null;
    var encoding = 'utf-8';
    var pendingLabels = null;

    var guard = 0;
    while (true) {
      if (++guard > 200000) throw new Error('The file structure could not be followed.');
      var recType = r.int32();

      if (recType === 2) {
        var type = r.int32();
        var hasLabel = r.int32();
        var nMissing = r.int32();
        r.int32();                            // print format
        r.int32();                            // write format
        var shortName = trimRight(decodeText(r.raw(8), 'latin1'));

        var label = '';
        if (hasLabel) {
          var len = r.int32();
          label = trimRight(decodeText(r.raw(len), encoding));
          var pad = (4 - (len % 4)) % 4;
          r.skip(pad);
        }
        if (nMissing) r.skip(Math.abs(nMissing) * 8);

        variables.push({
          shortName: shortName,
          type: type,                          // 0 numeric, >0 string width, -1 continuation
          label: label,
          index: variables.length
        });

      } else if (recType === 3) {
        var count = r.int32();
        var pairs = [];
        for (var i = 0; i < count; i++) {
          var valueBytes = r.raw(8);
          var dv = new DataView(valueBytes.buffer, valueBytes.byteOffset, 8);
          var numeric = dv.getFloat64(0, r.little);
          var labLen = r.raw(1)[0];
          var text = trimRight(decodeText(r.raw(labLen), encoding));
          var used = 1 + labLen;
          var padding = (8 - (used % 8)) % 8;
          r.skip(padding);
          pairs.push({ numeric: numeric, bytes: valueBytes.slice(0), label: text });
        }
        pendingLabels = pairs;

      } else if (recType === 4) {
        var nVars = r.int32();
        var indices = [];
        for (var j = 0; j < nVars; j++) indices.push(r.int32());
        if (pendingLabels) {
          valueLabelSets.push({ indices: indices, pairs: pendingLabels });
          pendingLabels = null;
        }

      } else if (recType === 6) {
        var nLines = r.int32();
        r.skip(80 * nLines);

      } else if (recType === 7) {
        var subtype = r.int32();
        var size = r.int32();
        var cnt = r.int32();
        var payload = r.raw(size * cnt);

        if (subtype === 13) {
          longNames = {};
          decodeText(payload, encoding).split('\t').forEach(function (pair) {
            var eq = pair.indexOf('=');
            if (eq > 0) longNames[trimRight(pair.slice(0, eq))] = trimRight(pair.slice(eq + 1));
          });
        } else if (subtype === 20) {
          var enc = trimRight(decodeText(payload, 'latin1')).toLowerCase();
          if (enc) encoding = (enc === 'utf-8' || enc === 'utf8') ? 'utf-8' : enc;
        }

      } else if (recType === 999) {
        r.int32();                             // filler
        break;

      } else {
        throw new Error('Unexpected record type ' + recType + ' in the file.');
      }
    }

    // ---------------------------------------------------------- dictionary

    var columns = [];
    variables.forEach(function (v) {
      if (v.type === -1) return;               // string continuation cell
      var name = (longNames && longNames[v.shortName]) || v.shortName;
      columns.push({
        name: name,
        shortName: v.shortName,
        type: v.type,
        label: v.label,
        cellIndex: v.index,
        cells: v.type > 0 ? Math.max(1, Math.ceil(v.type / 8)) : 1
      });
    });

    // value label sets point at 1-based positions in the cell list
    var byCell = {};
    columns.forEach(function (c) { byCell[c.cellIndex] = c; });

    var labelsByColumn = {};
    valueLabelSets.forEach(function (set) {
      set.indices.forEach(function (oneBased) {
        var col = byCell[oneBased - 1];
        if (!col) return;
        var map = labelsByColumn[col.name] || (labelsByColumn[col.name] = {});
        set.pairs.forEach(function (p) {
          var key = col.type > 0
            ? trimRight(decodeText(p.bytes, encoding))
            : numberToString(p.numeric);
          map[key] = p.label;
        });
      });
    });

    // ---------------------------------------------------------------- data

    var cells = readCells(r, compression, bias, caseSize, nCases, encoding);
    var rows = [];
    var perCase = caseSize;

    for (var c = 0; c < cells.length / perCase; c++) {
      var base = c * perCase;
      var row = {};
      for (var k = 0; k < columns.length; k++) {
        var col = columns[k];
        var cell = cells[base + col.cellIndex];
        if (col.type > 0) {
          var text = '';
          for (var s = 0; s < col.cells; s++) {
            var piece = cells[base + col.cellIndex + s];
            text += (piece && piece.str !== undefined) ? piece.str : '';
          }
          row[col.name] = trimRight(text);
        } else {
          row[col.name] = (cell && cell.num !== null && cell.num !== undefined)
            ? numberToString(cell.num) : '';
        }
      }
      rows.push(row);
    }

    return {
      columns: columns.map(function (c) { return c.name; }),
      rows: rows,
      dictionary: buildDictionary(columns, labelsByColumn),
      nCasesDeclared: nCases,
      encoding: encoding
    };
  }

  /* Bytecode decompression. Each block of 8 command bytes describes up to 8
   * cells; some commands carry the value inline, others say to take the next
   * 8 raw bytes. */
  function readCells(r, compression, bias, caseSize, nCases, encoding) {
    var out = [];
    var target = nCases > 0 ? nCases * caseSize : Infinity;

    if (compression === 0) {
      while (out.length < target && r.pos + 8 <= r.bytes.length) {
        var bytes = r.raw(8);
        var dv = new DataView(bytes.buffer, bytes.byteOffset, 8);
        var num = dv.getFloat64(0, r.little);
        out.push({
          num: (num < SYSMIS_THRESHOLD || !isFinite(num)) ? null : num,
          str: decodeText(bytes, encoding)
        });
      }
      return out;
    }

    var done = false;
    while (!done && out.length < target && r.pos + 8 <= r.bytes.length) {
      var commands = r.raw(8);
      for (var i = 0; i < 8; i++) {
        var code = commands[i];

        if (code === 0) continue;                       // padding

        if (code === 252) { done = true; break; }       // end of file

        if (code === 253) {                             // value follows raw
          if (r.pos + 8 > r.bytes.length) { done = true; break; }
          var raw = r.raw(8);
          var rdv = new DataView(raw.buffer, raw.byteOffset, 8);
          var rv = rdv.getFloat64(0, r.little);
          out.push({
            num: (rv < SYSMIS_THRESHOLD || !isFinite(rv)) ? null : rv,
            str: decodeText(raw, encoding)
          });
        } else if (code === 254) {                      // eight spaces
          out.push({ num: null, str: '        ' });
        } else if (code === 255) {                      // system missing
          out.push({ num: null, str: '' });
        } else {                                        // 1..251: value - bias
          out.push({ num: code - bias, str: '' });
        }

        if (out.length >= target) { done = true; break; }
      }
    }
    return out;
  }

  var REFUSAL = /^\s*(refused|refusal|no answer|dk\b|don'?t know|dk\/ref|missing|not asked|skipped)/i;

  /* Package the question wording and answer labels in the same shape as the
   * JSON written by tools/make_dictionary.py, so both routes into the tool
   * produce identical results. */
  function buildDictionary(columns, labelsByColumn) {
    var dict = {};
    columns.forEach(function (col) {
      var parts = cleanQuestion(col.name, col.label);
      var entry = { short: parts.short };
      if (parts.full && parts.full !== parts.short) entry.question = parts.full;

      var labels = labelsByColumn[col.name];
      if (labels && Object.keys(labels).length) {
        entry.labels = labels;
        var refusals = Object.keys(labels).filter(function (k) {
          return REFUSAL.test(labels[k]);
        });
        if (refusals.length) entry.refusals = refusals;
      }
      dict[col.name] = entry;
    });
    return dict;
  }

  /* Pew repeats the variable name inside its own label and separates the
   * grid item from the question stem with a double slash. */
  function cleanQuestion(name, raw) {
    if (!raw) return { short: name, full: '' };
    var text = String(raw).trim();
    text = text.replace(new RegExp('^\\s*' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*[.:]\\s*'), '');
    text = text.replace(/[\u201c\u201d"]/g, '').replace(/\s+/g, ' ').trim();

    if (text.indexOf('//') !== -1) {
      var bits = text.split('//');
      var item = bits[0].trim();
      var stem = bits.slice(1).join('//').trim();
      return { short: item || name, full: stem + '  \u2014  ' + item };
    }
    var short = text;
    if (short.length > 70) short = short.slice(0, 67).replace(/\s+\S*$/, '') + '\u2026';
    return { short: short || name, full: text };
  }

  global.SAV = { parse: parse };
})(window);
