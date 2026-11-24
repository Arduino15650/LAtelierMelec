// Mes outils (CV et lettres) : droits élève / enseignant imposés par la base, vérifiés sur PostgreSQL (PGlite).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const PROF = '22222222-2222-2222-2222-222222222222', ELEVE = '33333333-3333-3333-3333-333333333333';
const AUTRE = '44444444-4444-4444-4444-444444444444', BLOQUE = '55555555-5555-5555-5555-555555555555';
let db;
async function as(uid, aal, sql) {
  await db.exec(`reset role; select set_config('t.uid','${uid}',false), set_config('t.aal','${aal}',false); set role authenticated;`);
  try { return (await db.query(sql)).rows; } catch (error) { return 'ERR: ' + error.message; } finally { await db.exec('reset role'); }
}

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
    grant execute on all functions in schema melec_security to authenticated;
    grant select on public.teacher_accounts, public.student_profiles to authenticated;
    insert into auth.users values ('${PROF}'),('${ELEVE}'),('${AUTRE}'),('${BLOQUE}');
    insert into public.teacher_accounts values ('${PROF}');
    insert into public.student_profiles values ('${ELEVE}', now(), null), ('${AUTRE}', now(), null), ('${BLOQUE}', now(), now());`);
  await db.exec(fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '20261124150000_documents_candidature.sql'), 'utf8'));
});

let docId;
test('l’élève crée son CV ; un élève bloqué ou l’enseignant ne peuvent pas en créer', async () => {
  const rows = await as(ELEVE, 'aal1', `insert into student_career_docs(kind,title,data,teacher_comment,review_status) values ('cv','Mon CV','{"v":1}','triche','approved') returning id, review_status, teacher_comment`);
  docId = rows[0].id;
  assert.equal(rows[0].review_status, 'draft');
  assert.equal(rows[0].teacher_comment, '');
  assert.match(String(await as(BLOQUE, 'aal1', `insert into student_career_docs(kind) values ('cv')`)), /ERR/);
  assert.match(String(await as(PROF, 'aal2', `insert into student_career_docs(kind) values ('cv')`)), /ERR/);
  assert.match(String(await as(ELEVE, 'aal1', `insert into student_career_docs(kind) values ('autre')`)), /ERR/);
});

test('un autre élève ne voit ni ne modifie le document', async () => {
  assert.deepEqual(await as(AUTRE, 'aal1', 'select id from student_career_docs'), []);
  assert.deepEqual(await as(AUTRE, 'aal1', `update student_career_docs set title='x' returning id`), []);
  assert.deepEqual(await as(AUTRE, 'aal1', `delete from student_career_docs returning id`), []);
});

test('envoi pour relecture, réponse de l’enseignant sans toucher au contenu', async () => {
  const sent = await as(ELEVE, 'aal1', `update student_career_docs set review_status='submitted' where id='${docId}' returning submitted_at`);
  assert.ok(sent[0].submitted_at);
  assert.equal((await as(PROF, 'aal1', 'select id from student_career_docs')).length, 0, 'Authenticator obligatoire pour l’enseignant');
  const reviewed = await as(PROF, 'aal2', `update student_career_docs set review_status='changes', teacher_comment='Ajoute tes dates de stage.', data='{"pirate":true}', title='modifié' where id='${docId}' returning data, title, reviewed_by, review_status`);
  assert.deepEqual(reviewed[0].data, { v: 1 });
  assert.equal(reviewed[0].title, 'Mon CV');
  assert.equal(reviewed[0].reviewed_by, PROF);
  assert.equal(reviewed[0].review_status, 'changes');
  const prof = await as(PROF, 'aal2', `update student_career_docs set review_status='draft' where id='${docId}' returning review_status`);
  assert.equal(prof[0].review_status, 'changes', 'l’enseignant ne remet pas un document en brouillon');
});

test('l’élève ne peut ni effacer le commentaire ni se valider lui-même, mais modifie et supprime son document', async () => {
  const rows = await as(ELEVE, 'aal1', `update student_career_docs set teacher_comment='', review_status='approved', data='{"v":2}' where id='${docId}' returning teacher_comment, review_status, data`);
  assert.equal(rows[0].teacher_comment, 'Ajoute tes dates de stage.');
  assert.equal(rows[0].review_status, 'changes');
  assert.deepEqual(rows[0].data, { v: 2 });
  const again = await as(ELEVE, 'aal1', `update student_career_docs set review_status='submitted' where id='${docId}' returning review_status`);
  assert.equal(again[0].review_status, 'submitted');
  assert.equal((await as(ELEVE, 'aal1', `delete from student_career_docs where id='${docId}' returning id`)).length, 1);
});

test('taille du contenu limitée', async () => {
  const big = 'x'.repeat(700000);
  assert.match(String(await as(ELEVE, 'aal1', `insert into student_career_docs(kind,data) values ('lm', jsonb_build_object('t', '${big}'))`)), /ERR/);
});
