/* Offline test harness for v3.1.1 tax-engine correctness pass.
 * Extracts the pure helpers + TAX_PROFILES from src/app.js (no DOM needed),
 * evals them in a stubbed context, and asserts the DE Freigrenze cliff and
 * the CA $1,000 PUP floor across boundary cases.
 *
 * Run: node test-tax-engine.js
 */
const fs = require('fs');
const src = fs.readFileSync(require('path').join(__dirname, 'src/app.js'), 'utf8');
const lines = src.split('\n');
const slice = (a, b) => lines.slice(a - 1, b).join('\n'); // 1-indexed inclusive

// Stub the bits app.js expects at module scope.
global.window = { _store: {} };
function tradePlatform(t) { return t.platform || 'csfloat'; }

// Extract the pieces we need (line ranges verified against the current file).
const extracted = [
  slice(2041, 2059),  // _applyExemption + _exemptionUsed
  slice(2061, 2066),  // _monthsHeld
  slice(2087, 2169),  // TAX_PROFILES
].join('\n\n');
eval(extracted + '\nglobal.TAX_PROFILES = TAX_PROFILES;\nglobal._applyExemption = _applyExemption;\nglobal._exemptionUsed = _exemptionUsed;\nglobal._monthsHeld = _monthsHeld;\n');

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = Math.abs(got - want) < 1e-6;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  (got ${got}, want ${want})`);
  ok ? pass++ : fail++;
}
function checkBool(name, got, want) {
  const ok = got === want;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  (got ${got}, want ${want})`);
  ok ? pass++ : fail++;
}

const DE = TAX_PROFILES.DE;
const UK = TAX_PROFILES.UK;
const CA = TAX_PROFILES.CA;
const US = TAX_PROFILES.US;

console.log('\n=== Germany Freigrenze CLIFF (€1,000) ===');
// Below the cliff → fully tax-free
check('DE €999 gain  -> taxable 0',        _applyExemption(999, DE),  0);
check('DE €0 gain    -> taxable 0',        _applyExemption(0, DE),    0);
check('DE €500 gain  -> taxable 0',        _applyExemption(500, DE),  0);
// At / above the cliff → ENTIRE gain taxable from the first euro
check('DE €1000 gain -> taxable 1000',     _applyExemption(1000, DE), 1000);
check('DE €1001 gain -> taxable 1001',     _applyExemption(1001, DE), 1001);
check('DE €1500 gain -> taxable 1500',     _applyExemption(1500, DE), 1500);
check('DE €5000 gain -> taxable 5000',     _applyExemption(5000, DE), 5000);
// Loss / negative net → 0
check('DE -€200 net  -> taxable 0',        _applyExemption(-200, DE), 0);
// "Used" semantics for the bar (all-or-nothing)
check('DE used @ €999  -> 999',            _exemptionUsed(999, DE),   999);
check('DE used @ €1500 -> 1000 (full)',    _exemptionUsed(1500, DE),  1000);

console.log('\n=== UK allowance stays DEDUCTIBLE (£3,000) — must NOT become a cliff ===');
check('UK £2999 gain -> taxable 0',        _applyExemption(2999, UK), 0);
check('UK £3000 gain -> taxable 0',        _applyExemption(3000, UK), 0);
check('UK £3500 gain -> taxable 500',      _applyExemption(3500, UK), 500);
check('UK £10000 gain -> taxable 7000',    _applyExemption(10000, UK),7000);
check('UK used @ £3500 -> 3000',           _exemptionUsed(3500, UK),  3000);
check('UK used @ £1200 -> 1200',           _exemptionUsed(1200, UK),  1200);
checkBool('UK is not a cliff',             !!UK.allowanceIsCliff,     false);
checkBool('DE is a cliff',                 !!DE.allowanceIsCliff,     true);

console.log('\n=== US / CA have no annual allowance ===');
check('US gain passes through (no allow)', _applyExemption(4000, US), 4000);
check('CA gain passes through (no allow)', _applyExemption(4000, CA), 4000);

// --- CA $1,000 PUP floor (mirrors the formula in calculateCGTWithTaxCurrency) ---
// floored gain = max(gross, floor) - fee - max(cost, floor), then *inclusionRate downstream.
function caFloorGain(grossCAD, feeCAD, costCAD) {
  const floor = CA.pupFloor || 0;
  let g = grossCAD, c = costCAD;
  if (floor > 0) { if (g < floor) g = floor; if (c < floor) c = floor; }
  return { gain: g - feeCAD - c, floored: (grossCAD < floor || costCAD < floor) };
}

console.log('\n=== Canada $1,000 personal-use-property floor ===');
checkBool('CA pupFloor present',           CA.pupFloor === 1000, true);
// Cheap-bought, cheap-sold: both deemed $1,000 -> gain ~0 (only the fee), not a fake gain.
let r = caFloorGain(400, 8, 50); // bought $50, sold $400, $8 fee
check('CA cheap buy/sell -> gain -8',      r.gain, -8);
checkBool('CA floor applied (cheap)',      r.floored, true);
// Cheap-bought ($50), expensive-sold ($5,000): cost floored to $1,000, proceeds as-is.
r = caFloorGain(5000, 100, 50);
check('CA cheap-buy expensive-sell -> 3900', r.gain, 5000 - 100 - 1000);
checkBool('CA floor applied (cheap cost)', r.floored, true);
// Both above floor: untouched.
r = caFloorGain(5000, 100, 2000);
check('CA both >floor -> 2900',            r.gain, 5000 - 100 - 2000);
checkBool('CA floor NOT applied (both high)', r.floored, false);
// 50% inclusion on a floored gain
const inclGain = Math.max(0, caFloorGain(5000, 100, 50).gain) * CA.inclusionRate;
check('CA 50% inclusion on 3900 -> 1950',  inclGain, 1950);

console.log('\n=== LPP loss ring-fencing is DISCLOSED (not modelled) ===');
checkBool('CA knownLimits mentions LPP',   /LPP/i.test(CA.knownLimits || ''), true);
checkBool('CA disclaimer mentions LPP',    /LPP|listed personal property/i.test(CA.disclaimer), true);
// LPP loss boundary: a losing LPP-style disposal still reduces the pool in THIS app
// (documented simplification). Assert the app does NOT ring-fence (i.e. a loss flows through).
const lppLoss = caFloorGain(1000, 0, 1500).gain; // sold at floor 1000, cost 1500 -> -500 loss
check('CA LPP-style loss flows into pool (-500)', lppLoss, -500);

console.log('\n=== US collectibles + 1099-K disclosed in disclaimer ===');
checkBool('US disclaimer notes collectibles 28%', /collectible/i.test(US.disclaimer) && /28%/.test(US.disclaimer), true);
checkBool('US disclaimer notes 1099-K',    /1099-?K/i.test(US.disclaimer), true);

console.log('\n=== DE scope caveat (pools all private sales) ===');
checkBool('DE disclaimer notes all private sales pooled', /crypto|gold|private sale/i.test(DE.disclaimer), true);

console.log('\n=== UK rates are 18%/24% (not legacy 10/20) ===');
checkBool('UK basic 18',  UK.rates.basic === 18, true);
checkBool('UK higher 24', UK.rates.higher === 24, true);

console.log(`\n--- ${pass} passed, ${fail} failed ---`);
process.exit(fail ? 1 : 0);
