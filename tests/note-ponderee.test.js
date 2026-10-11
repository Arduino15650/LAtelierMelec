// Calcul de la note sur 20 : N1 = 0 %, N2 = 33 %, N3 = 67 %, N4 = 100 %, NE exclu, pondération par compétence.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'evaluation-atelier-v2.js'), 'utf8');
const calcul = source.slice(0, source.indexOf('/* Le verrou est propre'));
const context = { window: {}, state: { students: [], activities: [] }, scoreResult: null, studentScore: null, grade: null,
  addEventListener() {}, document: { addEventListener() {} } };
context.window.addEventListener = () => {};
vm.createContext(context);
vm.runInContext(calcul, context);
const scoreResult = context.scoreResult;
const eleve = { id: 's1' };
const activite = (scores, poids = { C4: 2, C5: 1 }) => ({ competencies: Object.keys(poids), weights: poids, criteria: [], tasks: [], taskSelections: {}, scores: { s1: scores } });
const proche = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);

test('niveaux et pondération', () => {
  proche(scoreResult(activite({ 'mastery:C4': 'N4', 'mastery:C5': 'N1' }), eleve).note, 20 * 2 / 3);
  proche(scoreResult(activite({ 'mastery:C4': 'N3', 'mastery:C5': 'N3' }), eleve).note, 20 * 2 / 3);
  proche(scoreResult(activite({ 'mastery:C4': 'N2' }, { C4: 1 }), eleve).note, 20 / 3);
});

test('NE exclut la compétence du calcul', () => {
  proche(scoreResult(activite({ 'mastery:C4': 'NE', 'mastery:C5': 'N4' }), eleve).note, 20);
});

test('sans niveau renseigné, pas de note', () => {
  assert.equal(scoreResult(activite({}), eleve).note, null);
});

test('anciennes notes 0 à 4 toujours comprises', () => {
  proche(scoreResult(activite({ 'mastery:C4': 4, 'mastery:C5': 2 }), eleve).note, 20 * (2 * 1 + 1 / 3) / 3);
});

test('exemple du site : C2 N3 (×1), C5 N4 (×2), C6 N3 (×2), C7 N2 (×2), C10 NE → 13,33', () => {
  const r = scoreResult(activite({ 'mastery:C2': 'N3', 'mastery:C5': 'N4', 'mastery:C6': 'N3', 'mastery:C7': 'N2', 'mastery:C10': 'NE' },
    { C2: 1, C5: 2, C6: 2, C7: 2, C10: 1 }), eleve);
  assert.equal(r.note.toFixed(2), '13.33');
});
