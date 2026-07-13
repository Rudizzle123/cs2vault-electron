// CS2 Vault — storage-unit merge planner (Phase 6, session 3)
// ============================================================
// PURE functions only: no DOM, no IPC, no storage. Loaded as a renderer
// global (window.suMergePlan) via a <script> tag before app.js, and
// require()-able from Node for the offline harness (test-su-merge-plan.js).
//
// Pipeline:  resolved casket items ──aggregate()──▶ rows ──planMerge()──▶ plan
//
// Conventions: string concatenation (no template literals), function(){} style.

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.suMergePlan = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ── kind → holding type ─────────────────────────────────────────────
  // Resolver kinds (src/schema.js): weapon | knife | gloves | sticker |
  // patch | graffiti | charm | music | other. Holding types: skin | case |
  // sticker | armory | knife. Name-based fallback mirrors the decisive
  // parts of inferTypeFromSteamResult (app.js) for kind 'other'.
  function kindToType(kind, name) {
    var n = String(name || '').toLowerCase();
    if (kind === 'knife' || kind === 'gloves') return 'knife';
    if (kind === 'weapon') return n.indexOf('\u2605') !== -1 ? 'knife' : 'skin';
    if (kind === 'sticker' || kind === 'patch' || kind === 'graffiti') return 'sticker';
    if (kind === 'charm' || kind === 'music') return 'armory';
    // kind 'other' (cases, capsules, keys, agents, pins, passes) — by name
    if (n.indexOf('\u2605') !== -1) return 'knife';
    if (n.indexOf('sticker') !== -1 || n.indexOf('capsule') !== -1) return 'sticker';
    if (n.indexOf(' case') !== -1 || n.indexOf('package') !== -1 || n.indexOf(' crate') !== -1) return 'case';
    if (n.indexOf('charm') !== -1 || n.indexOf('patch') !== -1 || n.indexOf('pin') !== -1) return 'armory';
    return 'skin';
  }

  // ── aggregate ───────────────────────────────────────────────────────
  // batches: [{ casketName, items: [slim] }] where slim items carry the
  // session-2 resolver fields: name (market_hash_name or null), phase,
  // kind, defIndex, paintIndex, statTrak, customName.
  //
  // Grouping key = displayName = name + phase suffix. Phase VARIANTS SPLIT
  // into separate rows (decision 3.9.0-b): marketHash stays the phase-less
  // Steam name for pricing; displayName carries " — Phase N"/gem for the
  // holding's name field. customName (name tags) is deliberately IGNORED
  // for grouping — a name tag doesn't change market identity or price.
  //
  // Unmapped items (name === null — not in the schema yet) are excluded
  // from the rows and surfaced via unmappedCount for the UI note.
  function aggregate(batches) {
    var groups = {};
    var order = [];
    var unmapped = 0;
    var total = 0;
    (batches || []).forEach(function (b) {
      var casket = (b && b.casketName) ? String(b.casketName) : 'Storage Unit';
      ((b && b.items) || []).forEach(function (it) {
        total++;
        if (!it || !it.name) { unmapped++; return; }
        var display = it.name + (it.phase ? ' \u2014 ' + it.phase : '');
        if (!groups[display]) {
          groups[display] = {
            displayName: display,
            marketHash: it.name,
            phase: it.phase || null,
            kind: it.kind || null,
            type: kindToType(it.kind || null, it.name),
            qty: 0,
            caskets: []
          };
          order.push(display);
        }
        var g = groups[display];
        g.qty++;
        if (g.caskets.indexOf(casket) === -1) g.caskets.push(casket);
      });
    });
    var rows = order.map(function (k) { return groups[k]; });
    rows.sort(function (a, b) { return b.qty - a.qty; });
    return { rows: rows, unmappedCount: unmapped, totalItems: total };
  }

  // ── planMerge ───────────────────────────────────────────────────────
  // rows: aggregate().rows — existing: current holdings array (read-only).
  //
  // Matching order per row:
  //   1. exact displayName vs holding.name / holding.marketHash
  //      (a phase-named holding beats the phase-less hash match)
  //   2. marketHash vs holding.marketHash / holding.name
  // All comparisons case-insensitive (v3.6.0 findExisting semantics).
  //
  // Diff semantics (v3.6.0, approved 3.9.0-c): storage qty vs tracked qty —
  //   storage > tracked → import the difference ('more')
  //   storage ≤ tracked → nothing to import ('tracked', unticked)
  //   no match          → import all ('new')
  //
  // sharedMatch: true when 2+ rows resolve to the SAME existing holding
  // (phase variants of one tracked Doppler). Per-row diff vs the combined
  // tracked qty can over- or under-count in that case, so the UI flags
  // these rows for a manual quantity check.
  function planMerge(rows, existing) {
    var arr = existing || [];
    function findExisting(displayName, marketHash) {
      var d = String(displayName || '').toLowerCase();
      var h = String(marketHash || '').toLowerCase();
      var i, x, xn, xh;
      // pass 1: exact display-name (phase-aware) match
      for (i = 0; i < arr.length; i++) {
        x = arr[i];
        xn = String(x.name || '').toLowerCase();
        xh = String(x.marketHash || '').toLowerCase();
        if (xn === d || xh === d) return x;
      }
      // pass 2: phase-less market hash match — prefer a holding whose name
      // is NOT one of our phase-decorated variants ("hash \u2014 Phase N"),
      // so "Karambit | Doppler" wins over "Karambit | Doppler \u2014 Sapphire"
      // when matching a different phase by hash.
      var loose = null;
      for (i = 0; i < arr.length; i++) {
        x = arr[i];
        xn = String(x.name || '').toLowerCase();
        xh = String(x.marketHash || '').toLowerCase();
        if (xh !== h && xn !== h) continue;
        var phaseDecorated = xn.indexOf(h + ' \u2014 ') === 0;
        if (xn === h || !phaseDecorated) return x;
        if (!loose) loose = x;
      }
      return loose;
    }

    var matchCounts = {};
    var plan = (rows || []).map(function (r) {
      var ex = findExisting(r.displayName, r.marketHash);
      var importQty = r.qty, include = true, status = 'new';
      if (ex) {
        matchCounts[ex.id] = (matchCounts[ex.id] || 0) + 1;
        var diff = r.qty - (ex.qty || 0);
        if (diff > 0) { importQty = diff; status = 'more'; }
        else { importQty = r.qty; include = false; status = 'tracked'; }
      }
      return {
        displayName: r.displayName,
        marketHash: r.marketHash,
        phase: r.phase,
        type: r.type,
        storageQty: r.qty,
        caskets: r.caskets,
        existingId: ex ? ex.id : null,
        existingQty: ex ? (ex.qty || 0) : 0,
        importQty: importQty,
        include: include,
        status: status,
        sharedMatch: false,
        price: ''
      };
    });
    plan.forEach(function (p) {
      if (p.existingId && matchCounts[p.existingId] > 1) p.sharedMatch = true;
    });
    return plan;
  }

  return { aggregate: aggregate, planMerge: planMerge, kindToType: kindToType };
});
