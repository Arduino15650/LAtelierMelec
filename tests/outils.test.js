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

test('les exemples de CV sont complets et reprennent l’identité de l’élève', () => {
  const win = { MelecOutilsRendu: R };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'outils-exemples.js'), 'utf8'), { window: win, Math, Object, String, Array, JSON });
  const EX = win.MelecOutilsExemples;
  assert.ok(EX.EXAMPLES.length >= 7);
  for (const ex of EX.EXAMPLES) {
    const d = EX.cvFromExample(ex.id, { first: 'Inès', last: 'Benali', email: 'ines@lycee.fr' });
    assert.equal(d.person.first, 'Inès');
    assert.ok(R.THEMES.some(t => t.id === ex.theme), ex.id + ' : thème inconnu');
    assert.equal(d.theme, ex.theme);
    assert.ok(d.sections.experiences.items.length >= 1);
    assert.ok(R.cvScore(d).score >= 70, ex.id + ' : score ' + R.cvScore(d).score);
  }
});

test('contrôles de qualité du CV et de la lettre', () => {
  const lm = R.newLetter({}, 'pfmp');
  lm.recipient.company = 'Dupont';
  lm.blocks.vous.text = 'L’entreprise Dupont réalise des chantiers variés.';
  lm.blocks.conclusion.text = 'Je serais heureux de vous rencontrer lors d’un entretien.';
  lm.object = 'Demande de stage du 4 mai au 12 juin';
  const checks = R.letterChecks(lm);
  assert.ok(checks.some(([ok, t]) => ok && /Entreprise citée 1 fois/.test(t)));
  assert.ok(checks.some(([ok, t]) => ok && /entretien/.test(t)));
  const cv = R.newCv({});
  assert.ok(R.cvChecks(cv, 2).some(([ok, t]) => !ok && /2 pages/.test(t)));
  assert.ok(R.THEMES.length >= 22);
});

test('personnalisation : couleurs, polices, tailles et anciennes valeurs', () => {
  const d = R.clean('cv', { font: 'serif', accent: '#123456', sideColor: 'rouge', titleColor: '#abcdef', textSize: 'xl', titleStyle: 'pill', palette: 'marine-dore', icons: false, sideWidth: 'wide', photoSize: 'l', photoBorder: 1 });
  assert.equal(d.headFont, 'times');
  assert.equal(d.bodyFont, 'times');
  assert.equal(d.sideColor, '');
  assert.equal(d.titleColor, '#abcdef');
  assert.equal(d.textSize, 'm');
  assert.equal(d.titleStyle, 'pill');
  assert.equal(d.icons, false);
  assert.equal(d.sideWidth, 'wide');
  assert.equal(d.photoBorder, true);
  const r = R.resolved({ ...d, sideColor: '#13294b' });
  assert.equal(r.sideInk, '#ffffff');
  assert.equal(r.titleStyle, 'pill');
  assert.ok(R.PALETTES.length >= 12 && R.ACCENTS.length >= 17 && R.FONT_LIST.length >= 15);
  for (const f of R.FONT_LIST.filter(f => f[3])) for (const st of f[3]) assert.ok(fs.existsSync(path.join(__dirname, '..', 'fonts', f[0] + '-' + st + '.ttf')), f[0] + '-' + st);
  for (const t of R.THEMES) { assert.ok(R.FONT_LIST.some(f => f[0] === t.head), t.id); assert.ok(R.FONT_LIST.some(f => f[0] === t.body), t.id); }
  assert.ok(R.styleWarnings({ ...d, titleColor: '#f2f2f2' }).length >= 1);
});
