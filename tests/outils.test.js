// Mes outils (CV et lettres) : nettoyage des données, caractères compatibles PDF, score et compteur de mots.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const window = {};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'outils-rendu.js'), 'utf8'), { window, Intl, Math, Number, String, Array, Date, JSON, Object, Set });
const R = window.MelecOutilsRendu;

test('un nouveau CV a toutes ses rubriques et des valeurs sûres', () => {
  const cv = R.newCv({ first: 'Lucas', last: 'Martin' });
  assert.equal(cv.person.first, 'Lucas');
  assert.equal(cv.order.length, R.CV_SECTIONS.length);
  assert.equal(cv.sections.experiences.items.length, 1);
  assert.equal(cv.layout, 'lateral');
});

test('les données reçues sont nettoyées (valeurs inconnues, tailles, images)', () => {
  const cv = R.clean('cv', { layout: 'pirate', theme: 'x', accent: 'red', photo: 'javascript:alert(1)', order: ['profil', 'profil', 'inconnu'],
    sections: { profil: { text: 'a'.repeat(5000) }, competences: { levels: [{ label: 'Câblage', level: 9 }] } }, person: { first: 'A'.repeat(500) } });
  assert.equal(cv.layout, 'lateral');
  assert.equal(cv.theme, 'moderne');
  assert.equal(cv.accent, '');
  assert.equal(cv.photo, '');
  assert.equal(cv.order[0], 'profil');
  assert.equal(new Set(cv.order).size, R.CV_SECTIONS.length);
  assert.equal(cv.sections.profil.text.length, 1200);
  assert.equal(cv.sections.competences.levels[0].level, 5);
  assert.equal(cv.person.first.length, 60);
  const lm = R.clean('lm', { type: 'offre', sign: { mode: 'drawn', image: 'data:image/png;base64,AAAA' }, show: { ref: true } });
  assert.equal(lm.type, 'offre');
  assert.equal(lm.sign.image, 'data:image/png;base64,AAAA');
  assert.equal(lm.show.ref, true);
  assert.equal(lm.show.ps, false);
});

test('les caractères impossibles à écrire dans le PDF sont remplacés', () => {
  assert.equal(R.safe('Électricien « MELEC » – l’atelier œuvre 12 €'), 'Électricien « MELEC » – l’atelier œuvre 12 €');
  assert.equal(R.safe('a → b ✓ 😀'), 'a > b v ');
  assert.equal(R.safe('ă ş'), 'a s');
});

test('score du CV et nombre de mots de la lettre', () => {
  const cv = R.newCv({ first: 'Lucas', last: 'Martin', email: 'l@m.fr' });
  const before = R.cvScore(cv).score;
  cv.person.title = 'Électricien'; cv.person.phone = '0600000000';
  cv.sections.profil.text = 'Élève motivé et rigoureux en Bac Pro MELEC, je recherche un stage pour progresser en câblage.';
  assert.ok(R.cvScore(cv).score > before);
  const lm = R.newLetter({}, 'pfmp');
  lm.blocks.moi.text = 'Je sais câbler un tableau.';
  assert.equal(R.letterWords(lm), 5);
});
