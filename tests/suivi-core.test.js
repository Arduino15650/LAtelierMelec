// SUIVI&PFMP : calculs repris d'« Évaluation ponctuelle » (notes pondérées, attestations, imports).
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../suivi-core.js');

const pfmp = { id: 'p1', name: 'PFMP 1', startDate: '2026-11-02', endDate: '2026-11-27', className: 'TMELEC', assignments: { s1: { teacherId: 't1', examKeys: ['e32'] } } };
const student = { id: 's1', lastName: 'Martin', firstName: 'Léa', className: 'TMELEC', birthDate: '', ine: '' };
const state = extra => S.cleanState({ classes: ['TMELEC'], students: [student], pfmps: [pfmp], ...extra });

test('note pondérée : N4 partout = 20, NE exclu, niveaux 0 / 33 / 67 / 100 %', () => {
  const e32 = S.exams.find(e => e.key === 'e32');
  const all = (code, level) => ({ mastery: { [code]: level } });
  let s = state({ evaluations: { s1: { 'pfmp:p1:e32': { mastery: { C8: 3, C9: 3 }, tasks: {}, criteria: {} } } } });
  assert.equal(S.score(s, 's1', e32, 'p1'), 20);
  s = state({ evaluations: { s1: { 'pfmp:p1:e32': { mastery: { C8: 2, C9: -1 }, tasks: {}, criteria: {} } } } });
  assert.ok(Math.abs(S.score(s, 's1', e32, 'p1') - 40 / 3) < 1e-9);
  s = state({ evaluations: { s1: { 'pfmp:p1:e32': { mastery: { C8: 0, C9: 3 }, tasks: {}, criteria: {} } } } });
  assert.ok(Math.abs(S.score(s, 's1', e32, 'p1') - 6) < 1e-9);
  assert.equal(S.completion(s, 's1', e32, 'p1'), 2);
  assert.ok(all);
});

test('attestation prête seulement quand toutes les épreuves affectées sont complètes (date et jury compris)', () => {
  const e32 = S.exams.find(e => e.key === 'e32');
  const full = { mastery: { C8: 3, C9: 2 }, tasks: {}, criteria: {}, date: '2026-11-20', jury: 'Anne Dupont' };
  e32.competencies.forEach(c => { c.tasks.forEach((_, i) => full.tasks[`${c.code}-task-${i}`] = 'N3'); c.criteria.forEach((_, i) => full.criteria[`${c.code}-${i}`] = 'N4'); });
  assert.equal(S.attestationIsReady(state({ evaluations: { s1: { 'pfmp:p1:e32': { ...full, jury: '' } } } }), pfmp, 's1'), false);
  const s = state({ evaluations: { s1: { 'pfmp:p1:e32': full } }, tutors: [{ id: 'tu', pfmpId: 'p1', className: 'TMELEC', company: 'Élec Nord', companyAddress: '1 rue', companyPhone: '02', studentIds: ['s1'], lastName: 'T', firstName: 'U' }] });
  assert.equal(S.attestationIsReady(s, pfmp, 's1'), true);
  const a = S.getOrCreateAttestation(s, pfmp, student, 'Prof@Lycee.fr', new Date('2026-11-30T10:00:00Z'));
  assert.deepEqual([a.id, a.teacherEmail, a.fields.totalWeeks, a.fields.companyName, a.fields.signedAtDate, a.fields.absenceDays],
    ['attestation-p1-s1', 'prof@lycee.fr', '4', 'Élec Nord', '2026-11-30', '0']);
});

test('imports Excel : élèves, enseignants (identifiant conservé), tuteurs liés à la PFMP', () => {
  const eleves = S.studentsFromRows([{ Nom: 'Martin', 'Prénom': 'Léa', Classe: 'TMELEC', 'Numéro INE': '123', 'Date de naissance': 39114 }], '');
  assert.deepEqual([eleves[0].lastName, eleves[0].birthDate, eleves[0].ine], ['Martin', '01/02/2007', '123']);
  assert.throws(() => S.studentsFromRows([{ Article: 'x' }], ''), /liste d’élèves/);
  const anciens = [{ id: 'old', lastName: 'Dupont', firstName: 'Anne', email: '', className: 'TMELEC', subject: '' }];
  const profs = S.reconcileImportedTeachers(anciens, S.teachersFromRows([{ Nom: 'Dupont', 'Prénom': 'Anne', 'Matière': 'Élec', 'E-mail': 'Anne@Lycee.fr' }], 'TMELEC'));
  assert.deepEqual([profs[0].id, profs[0].email], ['old', 'anne@lycee.fr']);
  const tuteurs = S.tutorsFromRows([{ 'Raison sociale': 'Élec Nord', 'Nom du tuteur': 'T', 'Prénom du tuteur': 'U', Classe: 'tmelec', PFMP: 'pfmp 1', "Nom de l'élève": 'MARTIN', "Prénom de l'élève": 'lea' }], state());
  assert.deepEqual([tuteurs[0].pfmpId, tuteurs[0].studentIds, tuteurs[0].hostStructure], ['p1', ['s1'], 'Élec Nord']);
  assert.throws(() => S.tutorsFromRows([{ 'Raison sociale': 'X', 'Nom du tuteur': 'T', 'Prénom du tuteur': 'U', Classe: 'TMELEC', PFMP: 'PFMP 9', INE: '1' }], state()), /n’existe pas/);
});

test('fusion sans doublon et nettoyage des références', () => {
  const merged = S.mergeUnique([{ id: 'a', ine: '1', lastName: 'A', firstName: 'B', className: 'C', birthDate: '' }], [{ id: 'z', ine: '1', lastName: 'A', firstName: 'B', className: 'C', birthDate: '02/02/2008' }], S.studentKey);
  assert.deepEqual([merged.length, merged[0].id, merged[0].birthDate], [1, 'a', '02/02/2008']);
  const s = S.removeStudentReferences(state({ evaluations: { s1: { e2: {} } } }), new Set(['s1']));
  assert.deepEqual([s.students.length, Object.keys(s.pfmps[0].assignments).length, Object.keys(s.evaluations).length], [0, 0, 0]);
  assert.deepEqual(Object.keys(S.documentOf(s)).sort(), ['activities', 'classes', 'pdfHeader', 'periods', 'pfmps', 'schoolYear', 'students', 'teachers', 'tutors']);
});
