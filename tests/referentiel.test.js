// Cohérence du référentiel Bac Pro MELEC (arrêté du 1er mars 2024).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = {};
context.window = context; // dans le navigateur, window est l'objet global
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'referential.js'), 'utf8'), context);
const MELEC = context.MELEC;

test('5 activités, 17 tâches, 13 compétences, 3 blocs, 6 secteurs', () => {
  assert.equal(MELEC.activities.length, 5);
  assert.equal(MELEC.tasks.length, 17);
  assert.equal(MELEC.competencies.length, 13);
  assert.equal(MELEC.blocks.length, 3);
  assert.equal(MELEC.sectors.length, 6);
});

test('chaque compétence appartient à un seul bloc et a des critères', () => {
  for (const c of MELEC.competencies) {
    assert.equal(MELEC.blocks.filter(b => b.competencies.includes(c.id)).length, 1, c.id);
    assert.ok(c.criteria.length > 0, c.id);
    assert.ok(['U2', 'U31', 'U32'].includes(c.unit), c.id);
  }
});

test('les liens tâche → compétence pointent vers des éléments existants, poids 1 ou 2', () => {
  const taches = new Set(MELEC.tasks.map(t => t.id));
  const comps = new Set(MELEC.competencies.map(c => c.id));
  for (const [tache, liens] of Object.entries(MELEC.links)) {
    assert.ok(taches.has(tache), tache);
    for (const [comp, poids] of Object.entries(liens)) {
      assert.ok(comps.has(comp), `${tache} → ${comp}`);
      assert.ok(poids === 1 || poids === 2, `${tache} → ${comp} : ${poids}`);
    }
  }
});

test('chaque tâche a une activité et une autonomie', () => {
  const activites = new Set(MELEC.activities.map(a => a.id));
  for (const t of MELEC.tasks) {
    assert.ok(activites.has(t.activity), t.id);
    assert.ok(['Totale', 'Partielle'].includes(t.autonomy), t.id);
  }
});
