// CS2 Vault — offline harness for src/su-merge-plan.js (Phase 6, session 3)
// Run: node test-su-merge-plan.js   (no network, no Electron)
// Covers: aggregation (cross-unit, phase split, StatTrak, customName,
// unmapped exclusion), kind→type mapping, and NEW/MORE/TRACKED planning
// including the shared-match (multi-phase → one holding) flag.
'use strict';

const plan = require('./src/su-merge-plan.js');

let pass = 0, fail = 0;
function eq(label, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log('  ✓ ' + label); }
  else { fail++; console.log('  ✗ ' + label + '\n      got  ' + g + '\n      want ' + w); }
}

function item(name, phase, kind, extra) {
  const o = { name: name, phase: phase || null, kind: kind || 'weapon', defIndex: 1, paintIndex: 2, statTrak: false, customName: null };
  if (extra) Object.keys(extra).forEach(function (k) { o[k] = extra[k]; });
  return o;
}

console.log('— kindToType');
eq('knife', plan.kindToType('knife', '\u2605 Karambit | Doppler (Factory New)'), 'knife');
eq('gloves → knife type', plan.kindToType('gloves', '\u2605 Hand Wraps | Spruce DDPAT (Field-Tested)'), 'knife');
eq('weapon → skin', plan.kindToType('weapon', 'AK-47 | Redline (Field-Tested)'), 'skin');
eq('sticker', plan.kindToType('sticker', 'Sticker | Titan (Holo) | Katowice 2014'), 'sticker');
eq('patch → sticker type', plan.kindToType('patch', 'Patch | Phoenix'), 'sticker');
eq('graffiti → sticker type', plan.kindToType('graffiti', 'Sealed Graffiti | GGWP (Brick Red)'), 'sticker');
eq('charm → armory', plan.kindToType('charm', "Charm | Lil' Ava"), 'armory');
eq('music → armory', plan.kindToType('music', 'Music Kit | Daniel Sadowski, Crimson Assault'), 'armory');
eq('case by name (kind other)', plan.kindToType('other', 'Clutch Case'), 'case');
eq('souvenir package (kind other)', plan.kindToType('other', 'Cologne 2016 Cobblestone Souvenir Package'), 'case');
eq('capsule (kind other)', plan.kindToType('other', 'Paris 2023 Legends Sticker Capsule'), 'sticker');
eq('pin (kind other) → armory', plan.kindToType('other', 'Guardian Elite Pin'), 'armory');
eq('agent (kind other) → skin', plan.kindToType('other', 'Ground Rebel  | Elite Crew'), 'skin');
eq('null kind falls back to name', plan.kindToType(null, 'Snakebite Case'), 'case');

console.log('— aggregate: grouping + cross-unit');
const aggA = plan.aggregate([
  { casketName: 'Clutch', items: [item('Clutch Case', null, 'other'), item('Clutch Case', null, 'other')] },
  { casketName: 'Clutch2', items: [item('Clutch Case', null, 'other'), item('AUG | Luxe Trim (Field-Tested)')] }
]);
eq('two distinct rows', aggA.rows.length, 2);
eq('cross-unit qty summed', aggA.rows[0].qty, 3);
eq('caskets collected', aggA.rows[0].caskets, ['Clutch', 'Clutch2']);
eq('sorted by qty desc', aggA.rows[0].displayName, 'Clutch Case');
eq('marketHash = name when no phase', aggA.rows[1].marketHash, 'AUG | Luxe Trim (Field-Tested)');
eq('type derived (case)', aggA.rows[0].type, 'case');
eq('total items', aggA.totalItems, 4);
eq('no unmapped', aggA.unmappedCount, 0);

console.log('— aggregate: phase split, StatTrak, customName, unmapped');
const K = '\u2605 Karambit | Doppler (Factory New)';
const aggB = plan.aggregate([
  { casketName: 'Knives', items: [
    item(K, 'Phase 2', 'knife'),
    item(K, 'Phase 2', 'knife'),
    item(K, 'Sapphire', 'knife'),
    item('\u2605 StatTrak\u2122 Karambit | Doppler (Factory New)', 'Phase 1', 'knife'),
    item('AK-47 | Redline (Field-Tested)', null, 'weapon', { customName: 'My Baby' }),
    item('AK-47 | Redline (Field-Tested)', null, 'weapon'),
    item(null, null, null),   // unmapped — excluded
    item(null, null, null)    // unmapped — excluded
  ] }
]);
eq('phase variants are separate rows', aggB.rows.filter(function (r) { return r.marketHash === K; }).length, 2);
const p2 = aggB.rows.find(function (r) { return r.displayName === K + ' \u2014 Phase 2'; });
eq('phase in displayName, qty grouped', p2 && p2.qty, 2);
eq('phase-less marketHash preserved', p2 && p2.marketHash, K);
eq('phase field carried', p2 && p2.phase, 'Phase 2');
const sap = aggB.rows.find(function (r) { return r.displayName === K + ' \u2014 Sapphire'; });
eq('Sapphire its own row', sap && sap.qty, 1);
eq('StatTrak name is naturally distinct', aggB.rows.filter(function (r) { return r.displayName.indexOf('StatTrak') !== -1; }).length, 1);
const ak = aggB.rows.find(function (r) { return r.marketHash === 'AK-47 | Redline (Field-Tested)'; });
eq('customName ignored for grouping', ak && ak.qty, 2);
eq('unmapped counted', aggB.unmappedCount, 2);
eq('unmapped excluded from rows', aggB.rows.reduce(function (s, r) { return s + r.qty; }, 0), 6);
eq('knife type on phase rows', p2 && p2.type, 'knife');

console.log('— planMerge: NEW / MORE / TRACKED (v3.6.0 diff semantics)');
const existing = [
  { id: 'h1', name: 'Clutch Case', marketHash: 'Clutch Case', qty: 300 },
  { id: 'h2', name: 'AUG | Luxe Trim (Field-Tested)', marketHash: 'aug | luxe trim (field-tested)', qty: 135 },
  { id: 'h3', name: 'Fracture Case', marketHash: '', qty: 50 }
];
const rowsC = plan.aggregate([{ casketName: 'U', items: [] }]).rows; // empty ok
const planC = plan.planMerge([
  { displayName: 'Clutch Case', marketHash: 'Clutch Case', phase: null, type: 'case', qty: 342, caskets: ['U'] },
  { displayName: 'AUG | Luxe Trim (Field-Tested)', marketHash: 'AUG | Luxe Trim (Field-Tested)', phase: null, type: 'skin', qty: 135, caskets: ['U'] },
  { displayName: 'Fracture Case', marketHash: 'Fracture Case', phase: null, type: 'case', qty: 20, caskets: ['U'] },
  { displayName: 'M249 | Hypnosis (Field-Tested)', marketHash: 'M249 | Hypnosis (Field-Tested)', phase: null, type: 'skin', qty: 132, caskets: ['U'] }
], existing);
eq('empty aggregate ok', rowsC.length, 0);
eq('MORE: storage 342 vs tracked 300 → import 42', [planC[0].status, planC[0].importQty, planC[0].include], ['more', 42, true]);
eq('MORE: existingId linked', planC[0].existingId, 'h1');
eq('TRACKED: equal qty unticked', [planC[1].status, planC[1].include], ['tracked', false]);
eq('TRACKED: case-insensitive hash match', planC[1].existingId, 'h2');
eq('TRACKED: storage < tracked', [planC[2].status, planC[2].include], ['tracked', false]);
eq('match falls back to holding.name when marketHash empty', planC[2].existingId, 'h3');
eq('NEW: no match imports all', [planC[3].status, planC[3].importQty, planC[3].include], ['new', 132, true]);
eq('NEW: no existingId', planC[3].existingId, null);

console.log('— planMerge: phase-aware matching + sharedMatch flag');
const existingD = [
  { id: 'd1', name: '\u2605 Karambit | Doppler (Factory New) \u2014 Sapphire', marketHash: K, qty: 1 },
  { id: 'd2', name: K, marketHash: K, qty: 1 }
];
const planD = plan.planMerge([
  { displayName: K + ' \u2014 Sapphire', marketHash: K, phase: 'Sapphire', type: 'knife', qty: 1, caskets: ['U'] },
  { displayName: K + ' \u2014 Phase 2', marketHash: K, phase: 'Phase 2', type: 'knife', qty: 2, caskets: ['U'] },
  { displayName: K + ' \u2014 Phase 3', marketHash: K, phase: 'Phase 3', type: 'knife', qty: 1, caskets: ['U'] }
], existingD);
eq('phase-named holding matched exactly', planD[0].existingId, 'd1');
eq('exact phase match not flagged shared', planD[0].sharedMatch, false);
eq('phase rows fall back to hash-matched holding', [planD[1].existingId, planD[2].existingId], ['d2', 'd2']);
eq('multi-phase → one holding flagged sharedMatch', [planD[1].sharedMatch, planD[2].sharedMatch], [true, true]);
eq('shared rows keep per-row diff semantics', [planD[1].status, planD[1].importQty], ['more', 1]);

console.log('— planMerge: no existing holdings');
const planE = plan.planMerge([
  { displayName: 'Clutch Case', marketHash: 'Clutch Case', phase: null, type: 'case', qty: 5, caskets: ['U'] }
], []);
eq('everything NEW against empty holdings', [planE[0].status, planE[0].importQty], ['new', 5]);
eq('null existing tolerated', plan.planMerge([{ displayName: 'X', marketHash: 'X', phase: null, type: 'skin', qty: 1, caskets: [] }], null)[0].status, 'new');

console.log('\n' + pass + '/' + (pass + fail) + ' assertions passed');
if (fail) process.exit(1);
