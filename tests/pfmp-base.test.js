// PFMP : règles d'accès imposées par la base (élève / enseignant), vérifiées sur un vrai PostgreSQL (PGlite).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const T = '11111111-1111-1111-1111-111111111111', A = '22222222-2222-2222-2222-222222222222', B = '33333333-3333-3333-3333-333333333333', X = '44444444-4444-4444-4444-444444444444';
let db;
async function as(uid, aal, sql) {
  await db.exec(`reset role; select set_config('t.uid','${uid}',false), set_config('t.aal','${aal}',false); set role authenticated;`);
  try { return (await db.query(sql)).rows; } catch (error) { return 'ERR: ' + error.message; } finally { await db.exec('reset role'); }
}
const call = (fn, args) => `select ${fn}(${args}) as r`;

test.before(async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('t.uid', true),'')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('aal', coalesce(nullif(current_setting('t.aal', true),''),'aal1')) $$;
    grant usage on schema auth to authenticated; grant execute on all functions in schema auth to authenticated;
    create schema melec_security; grant usage on schema melec_security to authenticated;
    create table public.teacher_accounts(user_id uuid primary key);
    create table public.student_profiles(user_id uuid primary key, approved_at timestamptz, blocked_at timestamptz);
    create function melec_security.session_suffisante() returns boolean language sql stable security definer set search_path='' as $$
      select coalesce(auth.jwt()->>'aal','aal1')='aal2' or not exists(select 1 from public.teacher_accounts t where t.user_id=auth.uid()) $$;
    grant execute on function melec_security.session_suffisante() to authenticated;
    insert into auth.users values ('${T}'),('${A}'),('${B}'),('${X}');
    insert into public.teacher_accounts values ('${T}');
    insert into public.student_profiles values ('${A}', now(), null), ('${B}', now(), null), ('${X}', null, null);`);
  await db.exec(fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '20261014150000_pfmp.sql'), 'utf8'));
});

test('seul l’enseignant avec Authenticator ajoute des entreprises ; les doublons sont ignorés', async () => {
  assert.match(String(await as(T, 'aal1', call('pfmp_import_companies', `'[{"raisonSociale":"ELEC A","fingerprint":"a"}]'`))), /réservée à l’enseignant/);
  assert.match(String(await as(A, 'aal1', call('pfmp_import_companies', `'[{"raisonSociale":"Z","fingerprint":"z"}]'`))), /réservée à l’enseignant/);
  const r = await as(T, 'aal2', call('pfmp_import_companies', `'[{"raisonSociale":"ELEC A","fingerprint":"a"},{"raisonSociale":"ELEC B","fingerprint":"b"},{"raisonSociale":"ELEC A bis","fingerprint":"a"}]'`));
  assert.deepEqual(r[0].r, { added: 2, duplicates: 1 });
});

test('un élève non validé ne voit rien ; un élève ne modifie pas l’annuaire', async () => {
  assert.equal((await as(X, 'aal1', 'select count(*)::int n from pfmp_companies'))[0].n, 0);
  assert.equal((await as(A, 'aal1', 'select count(*)::int n from pfmp_companies'))[0].n, 2);
  assert.deepEqual(await as(A, 'aal1', `update pfmp_companies set data = data || '{"ville":"X"}' returning id`), []);
});

test('une entreprise qui accepte un élève est réservée et disparaît pour les autres', async () => {
  const [{ id: ca }] = (await db.query(`select id from pfmp_companies where fingerprint='a'`)).rows;
  const ok = await as(A, 'aal1', call('pfmp_save_report', `null,'${ca}',null,'Accepté',current_date,'Téléphone','M. Dupont','Accord',null,null`));
  assert.equal(ok[0].r.status, 'Accepté');
  assert.deepEqual((await as(B, 'aal1', `select data->>'raisonSociale' n from pfmp_companies`)).map(r => r.n), ['ELEC B']);
  assert.match(String(await as(B, 'aal1', call('pfmp_save_report', `null,'${ca}',null,'En attente',current_date,'','','x',null,null`))), /déjà accepté/);
  assert.match(String(await as(B, 'aal1', call('pfmp_save_report', `null,'${ca}','${A}','En attente',current_date,'','','x',null,null`))), /inaccessible|déjà accepté/);
  assert.match(String(await as(B, 'aal1', `insert into pfmp_reports(company_id, student_id, status) values ('${ca}','${B}','Accepté')`)), /permission denied/);
  assert.equal((await as(B, 'aal1', 'select count(*)::int n from pfmp_reports'))[0].n, 0, 'un élève ne voit pas les démarches des autres');
  assert.equal((await as(T, 'aal2', 'select count(*)::int n from pfmp_reports'))[0].n, 1);
});

test('l’enseignant libère l’entreprise : elle redevient visible et la démarche passe « À relancer »', async () => {
  const [{ id: ca }] = (await db.query(`select id from pfmp_companies where fingerprint='a'`)).rows;
  assert.match(String(await as(A, 'aal1', call('pfmp_release', `'${ca}'`))), /réservée à l’enseignant/);
  assert.equal((await as(T, 'aal2', call('pfmp_release', `'${ca}'`)))[0].r, true);
  assert.equal((await as(B, 'aal1', 'select count(*)::int n from pfmp_companies'))[0].n, 2);
  assert.equal((await db.query(`select status from pfmp_reports`)).rows[0].status, 'À relancer');
});

test('suivi pédagogique : l’élève voit l’appréciation, jamais la note privée', async () => {
  await as(T, 'aal2', `insert into pfmp_followups(student_id, visit_date, teacher_note, appreciation) values ('${A}','2026-11-02','privé','Très bien')`);
  const mine = (await as(A, 'aal1', 'select pfmp_my_followup() as r'))[0].r;
  assert.equal(mine.appreciation, 'Très bien');
  assert.equal(mine.teacher_note, undefined);
  assert.deepEqual(await as(A, 'aal1', 'select * from pfmp_followups'), []);
  assert.match(String(await as(A, 'aal1', `insert into pfmp_followups(student_id, appreciation) values ('${A}','auto')`)), /permission denied|row-level/);
});

test('une entreprise supprimée n’est pas recréée par un nouvel import', async () => {
  const [{ id: cb }] = (await db.query(`select id from pfmp_companies where fingerprint='b'`)).rows;
  assert.equal((await as(T, 'aal2', call('pfmp_delete_companies', `array['${cb}']::uuid[]`)))[0].r, 1);
  assert.deepEqual((await as(T, 'aal2', call('pfmp_import_companies', `'[{"raisonSociale":"ELEC B","fingerprint":"b"}]'`)))[0].r, { added: 0, duplicates: 1 });
});
