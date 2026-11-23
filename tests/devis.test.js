// Devis élèves : calculs HT / TVA 20 % / TTC et saisie des montants à la française.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const window = {};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'devis.js'), 'utf8'),
  { window, document: { getElementById: () => null }, Intl, Math, Number, String, Array, Map, Date, JSON, Object });
const { computeTotals, parseNumber, nextNumber } = window.MelecDevis;

test('les montants acceptent la virgule, le point, les espaces et le symbole €', () => {
  assert.equal(parseNumber('12,50'), 12.5);
  assert.equal(parseNumber('12.5'), 12.5);
  assert.equal(parseNumber('1 250,00 €'), 1250);
  assert.equal(parseNumber(''), 0);
  assert.ok(Number.isNaN(parseNumber('douze')));
  assert.ok(Number.isNaN(parseNumber('-3')));
});

test('total HT, TVA 20 % et TTC s’additionnent automatiquement', () => {
  const t = computeTotals([
    { qty: '1', pu: '48,90' }, { qty: '1', pu: '62,50' }, { qty: '3', pu: '9,80' },
    { qty: '25', pu: '0,62' }, { qty: '4', pu: '6,40' }
  ]);
  assert.equal(t.ht, 181.9);
  assert.equal(t.tva, 36.38);
  assert.equal(t.ttc, 218.28);
  assert.deepEqual(t.rows.map(r => r.ttc), [58.68, 75, 35.28, 18.6, 30.72]);
  assert.equal(t.valid, true);
});

test('une saisie incorrecte est signalée sans fausser le total', () => {
  const t = computeTotals([{ qty: '2', pu: '10' }, { qty: 'deux', pu: '5' }]);
  assert.equal(t.valid, false);
  assert.equal(t.rows[1].qtyOk, false);
  assert.equal(t.ht, 20);
  assert.equal(t.ttc, 24);
});

test('les centimes sont arrondis correctement', () => {
  const t = computeTotals([{ qty: '3', pu: '0,335' }]);
  assert.equal(t.ht, 1.01);
  assert.equal(t.tva, 0.2);
  assert.equal(t.ttc, 1.21);
});

test('le numéro de devis suit le dernier numéro de l’élève', () => {
  const year = new Date().getFullYear();
  assert.equal(nextNumber([]), `DEV-${year}-001`);
  assert.equal(nextNumber(['DEV-2026-001', 'DEV-2026-007']), `DEV-${year}-008`);
});

test('un devis peut répartir ses lignes entre plusieurs fournisseurs', () => {
  const { supplierTotals, suppliersLabel } = window.MelecDevis;
  const quote = { supplier: 'Rexel', lines: [
    { desc: 'Disjoncteur 16 A', sup: '', qty: '2', pu: '10' },
    { desc: 'Câble R2V 3G2,5', sup: 'Sonepar', qty: '10', pu: '1,5' },
    { desc: 'Télérupteur', sup: 'Rexel', qty: '1', pu: '20' },
    { desc: '', sup: '', qty: '', pu: '' }
  ] };
  const rows = supplierTotals(quote);
  assert.equal(rows.length, 2);
  const rexel = rows.find(r => r.name === 'Rexel'), sonepar = rows.find(r => r.name === 'Sonepar');
  assert.equal(rexel.ht, 40); assert.equal(rexel.ttc, 48); assert.equal(rexel.count, 2);
  assert.equal(sonepar.ht, 15); assert.equal(sonepar.ttc, 18); assert.equal(sonepar.count, 1);
  assert.equal(suppliersLabel(quote), 'Rexel + Sonepar');
  assert.equal(suppliersLabel({ supplier: 'CGED', lines: [{ desc: 'Gaine', sup: '', qty: '1', pu: '2' }] }), 'CGED');
  assert.equal(suppliersLabel({ supplier: 'Würth' }), 'Würth');
});
