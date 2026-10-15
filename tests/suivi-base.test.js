// SUIVI&PFMP : règles d'accès imposées par la base, vérifiées sur un vrai PostgreSQL (PGlite).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ADMIN = '11111111-1111-1111-1111-111111111111', COLLEGUE = '22222222-2222-2222-2222-222222222222';
const AUTRE = '33333333-3333-3333-3333-333333333333', ELEVE = '44444444-4444-4444-4444-444444444444';
let db;
async function as(uid, aal, sql, totpAgo = null) {
  const amr = totpAgo == null ? '[]' : JSON.stringify([{ method: 'totp', timestamp: Math.floor(Date.now() / 1000) - totpAgo }]);
  await db.exec(`reset role; select set_config('t.uid','${uid}',false), set_config('t.aal','${aal}',false), set_config('t.amr','${amr}',false); set role authenticated;`);
  try { return (await db.query(sql)).rows; } catch (error) { return 'ERR: ' + error.message; } finally { await db.exec('reset role'); }
}
const one = async (uid, aal, sql, totpAgo) => { const r = await as(uid, aal, sql, totpAgo); return typeof r === 'string' ? r : r[0]?.r; };
const q = value => "'" + JSON.stringify(value).replace(/'/g, "''") + "'";

const STATE = {
  schoolYear: '2026-2027', classes: ['TMELEC'],
  students: [{ id: 's1', lastName: 'Martin', firstName: 'Léa', className: 'TMELEC', birthDate: '01/02/2008', ine: '123' },
             { id: 's2', lastName: 'Durand', firstName: 'Tom', className: 'TMELEC', birthDate: '', ine: '' }],
  teachers: [{ id: 't1', lastName: 'Dupont', firstName: 'Anne', email: 'collegue@lycee.fr', phone: '', subject: 'Électrotechnique', className: 'TMELEC' },
             { id: 't2', lastName: 'Autre', firstName: 'Paul', email: 'autre@lycee.fr', phone: '', subject: 'Maths', className: 'TMELEC' }],
  tutors: [], periods: [], activities: [],
  pfmps: [{ id: 'p1', name: 'PFMP 1', startDate: '2026-11-02', endDate: '2026-11-27', className: 'TMELEC',
            assignments: { s1: { teacherId: 't1', examKeys: ['e2', 'e31'] }, s2: { teacherId: 't2', examKeys: ['e32'] } } }],
  pdfHeader: { logoDataUrl: '', schoolName: 'Lycée', address: '', phone: '', ddfptEmail: '' }
};
const FIELDS = { hostStructure: 'Atelier', companyName: 'Élec Nord', companyAddress: '1 rue, 76000 Rouen', companyPhone: '0200000000',
  totalWeeks: '4', absenceDays: '0', absenceDetails: '', signedAtCity: 'Barentin', signedAtDate: '2026-11-27', signerName: 'Anne Dupont' };

test.before(async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth; create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz default now(), raw_user_meta_data jsonb default '{}'::jsonb); create table auth.mfa_factors(id uuid primary key default gen_random_uuid(), user_id uuid, status text); create schema private;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('t.uid', true),'')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('aal', coalesce(nullif(current_setting('t.aal', true),''),'aal1'), 'amr', coalesce(nullif(current_setting('t.amr', true),''),'[]')::jsonb) $$;
    grant usage on schema auth to authenticated; grant execute on all functions in schema auth to authenticated;
    create schema melec_security; grant usage on schema melec_security to authenticated;
    create table public.teacher_accounts(user_id uuid primary key);
    create table public.store_members(email text primary key, role text, active boolean default true);
    create table public.student_profiles(user_id uuid primary key, last_name text, first_name text, email text, requested_class text);
    insert into auth.users(id,email) values ('${ADMIN}','prof@lycee.fr'),('${COLLEGUE}','collegue@lycee.fr'),('${AUTRE}','autre@lycee.fr');
    insert into public.teacher_accounts values ('${ADMIN}');`);
  await db.exec(fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '20261015150000_suivi.sql'), 'utf8'));
  await db.exec('create trigger melec_student_profile_created after insert on auth.users for each row execute function private.create_student_profile()');
});

test('rôles : enseignant responsable, collègue autorisé évaluateur, Authenticator obligatoire', async () => {
  assert.equal(await one(ADMIN, 'aal2', 'select melec_security.role_suivi() r'), 'admin');
  assert.equal(await one(ADMIN, 'aal1', 'select melec_security.role_suivi() r'), null);
  assert.equal(await one(COLLEGUE, 'aal2', 'select melec_security.role_suivi() r'), null);
  assert.match(String(await one(COLLEGUE, 'aal2', 'select suivi_load() r')), /réservé aux enseignants autorisés/);
  assert.match(String(await one(COLLEGUE, 'aal2', `select suivi_member_set('collegue@lycee.fr','Anne',true) r`)), /réservé/);
  await one(ADMIN, 'aal2', `select suivi_member_set('Collegue@Lycee.fr','Anne Dupont',true) r`);
  await one(ADMIN, 'aal2', `select suivi_member_set('autre@lycee.fr','Paul Autre',true) r`);
  assert.equal(await one(COLLEGUE, 'aal2', 'select melec_security.role_suivi() r'), 'evaluateur');
  assert.equal(await one(COLLEGUE, 'aal2', 'select store_member_check() r'), true);
  const liste = await one(ADMIN, 'aal2', 'select suivi_members_list() r');
  assert.deepEqual(liste.map(m => m.email), ['autre@lycee.fr', 'collegue@lycee.fr']);
});

test('document : seul le responsable enregistre ; conflit détecté si un autre poste a enregistré', async () => {
  const v0 = (await db.query('select updated_at from suivi_state')).rows[0].updated_at.toISOString();
  assert.match(String(await one(COLLEGUE, 'aal2', `select suivi_save_state(${q(STATE)}, null) r`)), /responsable/);
  const v1 = await one(ADMIN, 'aal2', `select suivi_save_state(${q({ ...STATE, evaluations: { x: 1 }, selected: 's1' })}, '${v0}') r`);
  assert.ok(v1);
  assert.match(String(await one(ADMIN, 'aal2', `select suivi_save_state(${q(STATE)}, '${v0}') r`)), /autre poste/);
  const data = (await db.query('select data from suivi_state')).rows[0].data;
  assert.equal(data.evaluations, undefined);
  assert.equal(data.selected, undefined);
});

test('évaluateur : ne voit que ses élèves et ne note que ses épreuves', async () => {
  const vue = await one(COLLEGUE, 'aal2', 'select suivi_load() r');
  assert.equal(vue.role, 'evaluateur');
  assert.deepEqual(vue.state.students.map(s => s.id), ['s1']);
  assert.deepEqual(Object.keys(vue.state.pfmps[0].assignments), ['s1']);
  assert.deepEqual(vue.state.classes, ['TMELEC']);
  const ev = { mastery: { C1: 3 }, tasks: {}, criteria: {}, appreciation: 'Bien', jury: 'Anne Dupont', date: '2026-11-20' };
  assert.equal(await one(COLLEGUE, 'aal2', `select suivi_save_evaluation('s1','pfmp:p1:e2',${q(ev)}) r`), '');
  assert.match(String(await one(COLLEGUE, 'aal2', `select suivi_save_evaluation('s1','pfmp:p1:e32',${q(ev)}) r`)), /pas affectée/);
  assert.match(String(await one(COLLEGUE, 'aal2', `select suivi_save_evaluation('s2','pfmp:p1:e32',${q(ev)}) r`)), /pas affectée/);
  assert.match(String(await one(COLLEGUE, 'aal2', `select suivi_save_evaluation('s1','e2',${q(ev)}) r`)), /pas affectée/);
  assert.match(String(await one(COLLEGUE, 'aal2', `select suivi_save_evaluation('s1','pfmp:p1:e9',${q(ev)}) r`)), /inconnue/);
  assert.equal(await one(AUTRE, 'aal2', `select suivi_save_evaluation('s2','pfmp:p1:e32',${q(ev)}) r`), '');
  assert.equal((await one(AUTRE, 'aal2', 'select suivi_load() r')).evaluations.length, 1);
  assert.equal((await one(ADMIN, 'aal2', 'select suivi_load() r')).evaluations.length, 2);
  assert.match(String(await as(COLLEGUE, 'aal2', 'select * from suivi_evaluations')), /permission denied/);
});

test('attestation : signature avec code Authenticator récent, empreinte serveur, verrouillage puis déverrouillage', async () => {
  const att = { id: 'attestation-p1-s1', pfmpId: 'p1', studentId: 's1', teacherEmail: 'collegue@lycee.fr', fields: FIELDS, adminLocked: false, manualUnlocked: false };
  assert.match(String(await one(AUTRE, 'aal2', `select suivi_save_attestation(${q(att)}) r`)), /pas confié/);
  assert.match(String(await one(COLLEGUE, 'aal2', `select suivi_sign_attestation(${q(att)}) r`)), /code Authenticator/);
  assert.match(String(await one(COLLEGUE, 'aal2', `select suivi_sign_attestation(${q(att)}) r`, 900)), /code Authenticator/);
  assert.match(String(await one(COLLEGUE, 'aal2', `select suivi_sign_attestation(${q({ ...att, fields: { ...FIELDS, signerName: '' } })}) r`, 10)), /champs obligatoires/);
  const signee = await one(COLLEGUE, 'aal2', `select suivi_sign_attestation(${q(att)}) r`, 10);
  assert.equal(signee.adminLocked, true);
  assert.equal(signee.signedBy, 'Anne Dupont');
  assert.match(signee.signatureHash, /^[0-9a-f]{64}$/);
  // Signée : plus aucune modification ni note par l'évaluateur, ni signature en double.
  assert.match(String(await one(COLLEGUE, 'aal2', `select suivi_save_attestation(${q(att)}) r`)), /verrouillée ou déjà signée/);
  assert.match(String(await one(COLLEGUE, 'aal2', `select suivi_save_evaluation('s1','pfmp:p1:e2','{"mastery":{}}') r`)), /verrouillée/);
  assert.match(String(await one(ADMIN, 'aal2', `select suivi_save_attestation(${q({ ...att, adminLocked: true, fields: { ...FIELDS, companyName: 'Autre' } })}) r`)), /déverrouillez/);
  // Le responsable déverrouille : la signature est annulée et l'évaluateur peut de nouveau compléter.
  const ouverte = await one(ADMIN, 'aal2', `select suivi_save_attestation(${q({ ...att, adminLocked: false, manualUnlocked: true })}) r`);
  assert.deepEqual([ouverte.signedAt, ouverte.signatureHash, ouverte.adminLocked, ouverte.manualUnlocked], ['', '', false, true]);
  // L'évaluateur ne peut changer que ses champs (absences, lieu, signataire).
  const modifiee = await one(COLLEGUE, 'aal2', `select suivi_save_attestation(${q({ ...att, fields: { ...FIELDS, companyName: 'Piratage', absenceDays: '2' } })}) r`);
  assert.deepEqual([modifiee.fields.companyName, modifiee.fields.absenceDays], ['Élec Nord', '2']);
});

test('suppression d’une PFMP : évaluations et attestations retirées ; collègue retiré = plus d’accès', async () => {
  assert.match(String(await one(COLLEGUE, 'aal2', `select suivi_purge('pfmp','p1') r`)), /responsable/);
  await one(ADMIN, 'aal2', `select suivi_purge('pfmp','p1') r`);
  assert.equal((await db.query('select count(*)::int n from suivi_evaluations')).rows[0].n, 0);
  assert.equal((await db.query('select count(*)::int n from suivi_attestations')).rows[0].n, 0);
  await one(ADMIN, 'aal2', `select suivi_member_set('collegue@lycee.fr','',null) r`);
  assert.equal(await one(COLLEGUE, 'aal2', 'select melec_security.role_suivi() r'), null);
});

test('inscription d’un collègue autorisé : pas de fiche élève créée', async () => {
  await one(ADMIN, 'aal2', `select suivi_member_set('nouveau@lycee.fr','',true) r`);
  await db.exec(`insert into auth.users(id,email) values ('${ELEVE}','nouveau@lycee.fr')`);
  assert.equal((await db.query(`select count(*)::int n from student_profiles where user_id='${ELEVE}'`)).rows[0].n, 0);
});
