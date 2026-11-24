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

const loadExamples = () => {
  const win = { MelecOutilsRendu: R };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'outils-exemples.js'), 'utf8'), { window: win, Math, Object, String, Array, JSON, Set });
  return win.MelecOutilsExemples;
};

test('14 organisations de CV, langues et pays : valeurs gardées ou corrigées', () => {
  const ids = ['lateral', 'lateral-d', 'ats', 'bandeau', 'deux', 'frise', 'bento', 'hybride', 'competences', 'europass', 'infographie', 'centre', 'minimal', 'asym'];
  assert.deepEqual(Array.from(R.LAYOUTS, l => l.id), ids);
  for (const id of ids) assert.equal(R.clean('cv', { layout: id }).layout, id);
  const cv = R.clean('cv', { lang: 'en', country: 'ch' });
  assert.equal(cv.lang, 'en'); assert.equal(cv.country, 'ch');
  const bad = R.clean('cv', { lang: 'de', country: 'mars' });
  assert.equal(bad.lang, 'fr'); assert.equal(bad.country, 'fr');
  assert.equal(R.clean('lm', { lang: 'es' }).lang, 'es');
});

test('titres des rubriques en anglais et en espagnol, niveaux traduits', () => {
  for (const lang of ['en', 'es']) {
    const t = R.I18N[lang];
    for (const s of R.CV_SECTIONS) assert.ok(t[s.id], lang + ' : ' + s.id);
    assert.equal(t.levels.length, 6);
    for (const k of ['object', 'ref', 'ps', 'date', 'blank', 'keys', 'key']) assert.ok(t[k], lang + ' : ' + k);
  }
  const d = R.newCv({}); d.lang = 'en';
  assert.equal(R.sectionTitle(d, R.CV_SECTIONS.find(s => s.id === 'experiences')), 'Work experience');
  d.sections.experiences.title = 'Internships';
  assert.equal(R.sectionTitle(d, R.CV_SECTIONS.find(s => s.id === 'experiences')), 'Internships');
  assert.equal(R.tr({ lang: 'fr' }).object, 'Objet : ');
});

test('conseils par pays : Royaume-Uni, États-Unis, Canada, Suisse, Europass', () => {
  const photo = 'data:image/png;base64,AAAA';
  const uk = R.clean('cv', { ...R.newCv({}), country: 'uk', lang: 'fr', photo });
  const ukChecks = R.cvChecks(uk, 1);
  assert.ok(ukChecks.some(([ok, t]) => !ok && /retirez la photo/.test(t)));
  assert.ok(ukChecks.some(([ok, t]) => !ok && /anglais/.test(t)));
  const us = R.clean('cv', { ...R.newCv({}), country: 'us', lang: 'en' });
  assert.ok(R.cvChecks(us, 1).some(([ok, t]) => ok && /États-Unis/.test(t)));
  const ch = R.clean('cv', { ...R.newCv({}), country: 'ch' });
  assert.ok(R.cvChecks(ch, 1).some(([ok, t]) => !ok && /Suisse/.test(t)));
  const eu = R.clean('cv', { ...R.newCv({}), country: 'eu', layout: 'europass' });
  assert.ok(R.cvChecks(eu, 1).some(([ok, t]) => ok && /Europass/.test(t)));
});

test('20 exemples de CV : les 13 nouveaux profils, pays et langues', () => {
  const EX = loadExamples();
  assert.ok(EX.EXAMPLES.length >= 20);
  assert.equal(new Set(EX.EXAMPLES.map(e => e.id)).size, EX.EXAMPLES.length);
  for (const id of ['lyceen', 'stage-3e', 'job-ete', 'interim', 'cap', 'reconversion', 'france-travail', 'anglais', 'canadien', 'suisse', 'europass', 'courants-faibles', 'genie-climatique']) assert.ok(EX.EXAMPLES.some(e => e.id === id), id);
  for (const ex of EX.EXAMPLES) {
    assert.ok(['Débutant', 'Profil', 'Métier', 'Pays'].includes(ex.cat), ex.id + ' : catégorie ' + ex.cat);
    assert.ok(R.LAYOUTS.some(l => l.id === ex.layout), ex.id + ' : organisation');
    const d = EX.cvFromExample(ex.id, { first: 'Inès', last: 'Benali' });
    assert.equal(d.lang, ex.lang || 'fr');
    assert.equal(d.country, ex.country || 'fr');
    assert.ok(R.cvScore(d).score >= 70, ex.id + ' : score ' + R.cvScore(d).score);
  }
  const en = EX.cvFromExample('anglais', {});
  assert.equal(en.lang, 'en'); assert.equal(en.photo, '');
  assert.equal(EX.cvFromExample('europass', {}).layout, 'europass');
});

test('11 lettres d’exemple complètes (250 mots et plus), reprenant l’identité de l’élève', () => {
  const EX = loadExamples();
  assert.ok(EX.LETTERS.length >= 11);
  assert.equal(new Set(EX.LETTERS.map(l => l.id)).size, EX.LETTERS.length);
  for (const ex of EX.LETTERS) {
    assert.ok(R.LETTER_TYPES[ex.type], ex.id + ' : type');
    assert.ok(R.LETTER_LAYOUTS.some(l => l.id === ex.layout), ex.id + ' : organisation');
    const d = EX.letterFromExample(ex.id, { first: 'Inès', last: 'Benali', email: 'ines@lycee.fr' });
    assert.equal(d.person.first, 'Inès');
    assert.ok(d.recipient.company && d.object, ex.id + ' : entreprise et objet');
    const n = R.letterWords(d);
    assert.ok(n >= 250, ex.id + ' : ' + n + ' mots');
  }
});

test('galerie : plus de 200 modèles originaux, sans répétition', () => {
  const EX = loadExamples();
  assert.ok(EX.MODELS.length >= 200);
  assert.equal(new Set(EX.MODELS.map(m => m.id)).size, EX.MODELS.length);
  assert.equal(new Set(EX.MODELS.map(m => JSON.stringify(m.style))).size, EX.MODELS.length, 'deux modèles identiques');
  for (const l of R.LAYOUTS) assert.ok(EX.MODELS.some(m => m.layout === l.id), l.id);
  for (const m of EX.MODELS) {
    assert.ok(EX.MODEL_CATS.includes(m.cat), m.id);
    const d = R.clean('cv', { ...R.newCv({}), ...m.style });
    assert.equal(d.layout, m.style.layout, m.id + ' : organisation');
    assert.equal(d.theme, m.style.theme, m.id + ' : thème');
    if (m.style.headFont) assert.equal(d.headFont, m.style.headFont, m.id + ' : police');
    if (m.ats) assert.ok(['ats', 'europass', 'minimal', 'hybride', 'competences'].includes(m.layout), m.id + ' : ATS sur deux colonnes');
  }
  assert.ok(EX.MODELS.some(m => m.ats));
});

test('export Word : bibliothèque et licence présentes, script chargé dans l’espace élève', () => {
  const root = path.join(__dirname, '..');
  assert.ok(fs.statSync(path.join(root, 'docx.min.js')).size > 100000);
  assert.match(fs.readFileSync(path.join(root, 'DOCX-LICENSE.txt'), 'utf8'), /MIT/);
  const html = fs.readFileSync(path.join(root, 'eleve.html'), 'utf8');
  const word = html.indexOf('outils-word.js'), main = html.indexOf('src="outils.js');
  assert.ok(word > 0 && word < main, 'outils-word.js avant outils.js');
  const code = fs.readFileSync(path.join(root, 'outils-word.js'), 'utf8');
  assert.match(code, /window\.MelecOutilsWord = \{ build/);
  assert.match(code, /\.\/docx\.min\.js/);
});
