/* Offline test harness — v3.2.0 (six new jurisdictions: SE, PL, AU, NO, DK, FI).
 * Extracts the real helpers + TAX_PROFILES from src/app.js (no DOM), then asserts:
 *   - v3.1.1 regressions stay green (DE cliff, UK deductible allowance, CA floor)
 *   - new profiles: rates, holding-period classification, AU 50% discount,
 *     FI two-tier 30/34% + €1,000 cliff, NO 22% (no share uplift), DK indicative,
 *     SE 30%, PL 19%, AU tax-year boundary.
 * Run: node test-tax-engine.js
 */
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, 'src/app.js'), 'utf8');
const lines = src.split('\n');
const slice = (a, b) => lines.slice(a - 1, b).join('\n');

global.window = { _store: {} };
function tradePlatform(t) { return t.platform || 'csfloat'; }

function lineOf(reSrc) { const re = new RegExp(reSrc); for (let i = 0; i < lines.length; i++) if (re.test(lines[i])) return i + 1; throw new Error('not found: ' + reSrc); }
const aApply = lineOf('^function _applyExemption');
const aMonths = lineOf('^function _monthsHeld');
const aProfilesStart = lineOf('^const TAX_PROFILES');
let aProfilesEnd = aProfilesStart;
for (let i = aProfilesStart; i < lines.length; i++) { if (/^};/.test(lines[i])) { aProfilesEnd = i + 1; break; } }

const extracted = [
  slice(aApply, aApply + 17),
  slice(aMonths, aMonths + 5),
  slice(aProfilesStart, aProfilesEnd),
].join('\n\n');
eval(extracted +
  '\nglobal.TAX_PROFILES = TAX_PROFILES;' +
  '\nglobal._applyExemption = _applyExemption;' +
  '\nglobal._exemptionUsed = _exemptionUsed;' +
  '\nglobal._monthsHeld = _monthsHeld;');

let pass = 0, fail = 0;
function check(name, got, want) { const ok = Math.abs(got - want) < 1e-6; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  (got ${got}, want ${want})`); ok ? pass++ : fail++; }
function checkBool(name, got, want) { const ok = got === want; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  (got ${got}, want ${want})`); ok ? pass++ : fail++; }

const P = TAX_PROFILES;

function auTaxable(disposals, profile) {
  let included = 0;
  disposals.forEach(d => {
    const cls = profile.classifyGain({ acqDate: d.acq, sellDate: d.sell });
    const inc = cls.inclusion != null ? cls.inclusion : 1;
    included += d.gain > 0 ? d.gain * inc : d.gain;
  });
  return _applyExemption(Math.max(0, included), profile);
}
function fiTax(taxable, profile) {
  const r = profile.rates, thr = r.threshold;
  return Math.min(taxable, thr) * (r.lower / 100) + Math.max(0, taxable - thr) * (r.upper / 100);
}

console.log('\n=== v3.1.1 regressions (must stay green) ===');
check('DE €999 -> 0', _applyExemption(999, P.DE), 0);
check('DE €1000 -> 1000', _applyExemption(1000, P.DE), 1000);
check('UK £3500 -> 500 (deductible)', _applyExemption(3500, P.UK), 500);
checkBool('UK basic 18', P.UK.rates.basic === 18, true);
checkBool('UK higher 24', P.UK.rates.higher === 24, true);
checkBool('CA pupFloor 1000', P.CA.pupFloor === 1000, true);
check('CA inclusion 0.5', P.CA.inclusionRate, 0.5);

console.log('\n=== Sweden (flat 30%, no allowance) ===');
checkBool('SE currency SEK', P.SE.taxCurrency === 'SEK', true);
check('SE flat rate 30', P.SE.rates.flat, 30);
check('SE no allowance', P.SE.allowance || 0, 0);
check('SE 4000 gain passes through', _applyExemption(4000, P.SE), 4000);
checkBool('SE classify always taxable', P.SE.classifyGain({}).taxable, true);

console.log('\n=== Poland (flat 19%, tax-free amount does not apply) ===');
checkBool('PL currency PLN', P.PL.taxCurrency === 'PLN', true);
check('PL flat rate 19', P.PL.rates.flat, 19);
check('PL no allowance', P.PL.allowance || 0, 0);

console.log('\n=== Norway (flat 22%, general asset — NO 1.72 uplift) ===');
checkBool('NO currency NOK', P.NO.taxCurrency === 'NOK', true);
check('NO flat rate 22 (not 37.84)', P.NO.rates.flat, 22);
checkBool('NO disclaimer notes no 1.72 uplift', /1\.72|37\.84/.test(P.NO.disclaimer), true);

console.log('\n=== Denmark (indicative, personal income up to ~52%) ===');
checkBool('DK currency DKK', P.DK.taxCurrency === 'DKK', true);
check('DK indicative rate 42', P.DK.rates.flat, 42);
checkBool('DK disclaimer flags indicative/marginal', /indicative|marginal|52/.test(P.DK.disclaimer), true);

console.log('\n=== Australia (50% CGT discount if held > 12 months) ===');
checkBool('AU currency AUD', P.AU.taxCurrency === 'AUD', true);
checkBool('AU perDisposalInclusion flag', P.AU.perDisposalInclusion === true, true);
checkBool('AU tax year starts 1 Jul (Aug date)', P.AU.taxYearStart(new Date('2026-08-15')) === '2026-07-01', true);
checkBool('AU tax year starts prev Jul (Mar date)', P.AU.taxYearStart(new Date('2026-03-15')) === '2025-07-01', true);
checkBool('AU label spans years', P.AU.taxYearLabel(new Date('2026-08-15')) === '2026/2027', true);
const auLong = P.AU.classifyGain({ acqDate: '2024-01-01', sellDate: '2026-01-01' });
const auShort = P.AU.classifyGain({ acqDate: '2025-08-01', sellDate: '2026-01-01' });
const auUnknown = P.AU.classifyGain({ acqDate: null, sellDate: '2026-01-01' });
check('AU >12mo inclusion 0.5', auLong.inclusion, 0.5);
check('AU <=12mo inclusion 1', auShort.inclusion, 1);
check('AU unknown-date inclusion 1 (conservative)', auUnknown.inclusion, 1);
checkBool('AU unknown-date flagged', auUnknown.flagged, true);
check('AU $1000 long gain -> $500 taxable', auTaxable([{ gain: 1000, acq: '2024-01-01', sell: '2026-01-01' }], P.AU), 500);
check('AU $1000 short gain -> $1000 taxable', auTaxable([{ gain: 1000, acq: '2025-08-01', sell: '2026-01-01' }], P.AU), 1000);
check('AU mixed long+short -> 900', auTaxable([{ gain: 1000, acq: '2024-01-01', sell: '2026-01-01' }, { gain: 400, acq: '2025-08-01', sell: '2026-01-01' }], P.AU), 900);
check('AU long gain + loss -> 200 taxable', auTaxable([{ gain: 1000, acq: '2024-01-01', sell: '2026-01-01' }, { gain: -300, acq: '2025-01-01', sell: '2026-02-01' }], P.AU), 200);
checkBool('AU knownLimits notes $10k personal-use exemption', /10,?000|personal-use/i.test(P.AU.knownLimits), true);

console.log('\n=== Finland (30%/34% two-tier + €1,000 cliff) ===');
checkBool('FI currency EUR', P.FI.taxCurrency === 'EUR', true);
checkBool('FI cliff flag', P.FI.allowanceIsCliff === true, true);
check('FI €999 -> 0 (below cliff)', _applyExemption(999, P.FI), 0);
check('FI €1000 -> 1000 (cliff crossed)', _applyExemption(1000, P.FI), 1000);
check('FI rates lower 30', P.FI.rates.lower, 30);
check('FI rates upper 34', P.FI.rates.upper, 34);
check('FI threshold 30000', P.FI.rates.threshold, 30000);
check('FI €20k taxable -> €6,000 tax', fiTax(20000, P.FI), 6000);
check('FI €50k taxable -> €15,800 tax', fiTax(50000, P.FI), 15800);
check('FI €30k taxable -> €9,000 tax', fiTax(30000, P.FI), 9000);

console.log('\n=== All new profiles have disclaimer + knownLimits ===');
['SE','PL','AU','NO','DK','FI'].forEach(code => {
  checkBool(code + ' has disclaimer', typeof P[code].disclaimer === 'string' && P[code].disclaimer.length > 40, true);
  checkBool(code + ' has knownLimits', typeof P[code].knownLimits === 'string' && P[code].knownLimits.length > 10, true);
  checkBool(code + ' disclaimer: not tax advice', /not tax advice/i.test(P[code].disclaimer), true);
});

console.log(`\n--- ${pass} passed, ${fail} failed ---`);
process.exit(fail ? 1 : 0);
