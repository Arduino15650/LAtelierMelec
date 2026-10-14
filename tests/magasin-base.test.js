// Magasin : règles d'accès et stock imposés par la base, vérifiés sur un vrai PostgreSQL (PGlite).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ADMIN = '11111111-1111-1111-1111-111111111111', PROF = '22222222-2222-2222-2222-222222222222';
const ELEVE = '33333333-3333-3333-3333-333333333333', INCONNU = '44444444-4444-4444-4444-444444444444', EQUIPE = '55555555-5555-5555-5555-555555555555';
let db;
async function as(uid, aal, sql) {
  await db.exec(`reset role; select set_config('t.uid','${uid}',false), set_config('t.aal','${aal}',false); set role authenticated;`);
  try { return (await db.query(sql)).rows; } catch (error) { return 'ERR: ' + error.message; } finally { await db.exec('reset role'); }
}
const one = async (uid, aal, sql) => { const r = await as(uid, aal, sql); return typeof r === 'string' ? r : r[0]?.r; };

test.before(async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth; create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz default now(), raw_user_meta_data jsonb default '{}'::jsonb); create table auth.mfa_factors(id uuid primary key default gen_random_uuid(), user_id uuid, status text); create schema private;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('t.uid', true),'')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('aal', coalesce(nullif(current_setting('t.aal', true),''),'aal1')) $$;
    grant usage on schema auth to authenticated; grant execute on all functions in schema auth to authenticated;
    create schema melec_security; grant usage on schema melec_security to authenticated;
    create table public.teacher_accounts(user_id uuid primary key);
    create table public.student_profiles(user_id uuid primary key, class_id uuid, approved_at timestamptz, blocked_at timestamptz, last_name text, first_name text, email text, requested_class text);
    create function melec_security.session_suffisante() returns boolean language sql stable security definer set search_path='' as $$
      select coalesce(auth.jwt()->>'aal','aal1')='aal2' or not exists(select 1 from public.teacher_accounts t where t.user_id=auth.uid()) $$;
    create function melec_security.eleve_actif() returns boolean language sql stable security definer set search_path='' as $$
      select exists(select 1 from public.student_profiles s where s.user_id=auth.uid() and s.approved_at is not null and s.blocked_at is null) $$;
    grant execute on all functions in schema melec_security to authenticated;
    insert into auth.users(id,email) values ('${ADMIN}','marvelangers15@gmail.com'),('${PROF}','prof@lycee.fr'),('${ELEVE}','eleve@lycee.fr'),('${INCONNU}','x@y.fr'),('${EQUIPE}','collegue@lycee.fr');
    insert into public.teacher_accounts values ('${ADMIN}'),('${PROF}');
    insert into public.student_profiles values ('${ELEVE}', null, now(), null);`);
  await db.exec(fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '20261014230000_magasin.sql'), 'utf8'));
  await db.exec(fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '20261014233000_magasin_equipe.sql'), 'utf8'));
  await db.exec('create trigger melec_student_profile_created after insert on auth.users for each row execute function private.create_student_profile()');
});

test('rôles : administrateur, équipe (enseignant), Authenticator obligatoire, élève et inconnu refusés', async () => {
  assert.equal(await one(ADMIN, 'aal2', 'select melec_security.role_magasin() r'), 'admin');
  assert.equal(await one(PROF, 'aal2', 'select melec_security.role_magasin() r'), 'team');
  assert.equal(await one(PROF, 'aal1', 'select melec_security.role_magasin() r'), null);
  assert.equal(await one(ELEVE, 'aal1', 'select melec_security.role_magasin() r'), null);
  assert.match(String(await one(INCONNU, 'aal2', 'select store_inventory() r')), /réservé à l’équipe/);
});

test('nouvel article avec stock initial, mouvements, stock insuffisant refusé, stock non modifiable directement', async () => {
  await one(PROF, 'aal2', `select store_mutate('{"action":"item","ref":"A9F74216","name":"Disjoncteur 16 A","type":"Protection électrique","category":"Habitat","supplier":"Schneider Electric","unit":"pièce","threshold":2,"stock":10}') r`);
  const id = (await db.query(`select id from store_items where ref='A9F74216'`)).rows[0].id;
  await one(PROF, 'aal2', `select store_mutate('{"action":"movement","id":"${id}","kind":"out","quantity":3,"note":"Atelier"}') r`);
  assert.match(String(await one(PROF, 'aal2', `select store_mutate('{"action":"movement","id":"${id}","kind":"out","quantity":50}') r`)), /Stock insuffisant/);
  const it = (await db.query(`select stock, incoming, outgoing from store_items where id='${id}'`)).rows[0];
  assert.deepEqual([it.stock, Number(it.incoming), Number(it.outgoing)], [7, 10, 3]);
  assert.match(String(await as(PROF, 'aal2', `update store_items set stock = 999`)), /permission denied/);
  assert.match(String(await as(PROF, 'aal2', `insert into store_movements(item_id, kind, quantity) values ('${id}','in',5)`)), /permission denied/);
  const auteur = (await db.query(`select author_email from store_movements where note='Atelier'`)).rows[0].author_email;
  assert.equal(auteur, 'prof@lycee.fr');
  assert.match(String(await one(PROF, 'aal2', `select store_mutate('{"action":"archive","id":"${id}"}') r`)), /zéro/);
});

test('administration : réservée à l’administrateur ; une adresse « équipe » ouvre le magasin', async () => {
  assert.match(String(await one(PROF, 'aal2', `select store_mutate('{"action":"member","email":"collegue@lycee.fr","role":"team"}') r`)), /non autorisée/);
  assert.match(String(await one(PROF, 'aal2', `select store_mutate('{"action":"settings","name":"X"}') r`)), /non autorisée/);
  await one(ADMIN, 'aal2', `select store_mutate('{"action":"member","email":"Collegue@lycee.fr","role":"team"}') r`);
  assert.equal(await one(EQUIPE, 'aal2', 'select melec_security.role_magasin() r'), 'team');
  assert.equal(await one(EQUIPE, 'aal1', 'select melec_security.role_magasin() r'), null);
  assert.match(String(await one(ADMIN, 'aal2', `select store_mutate('{"action":"remove_member","email":"marvelangers15@gmail.com"}') r`)), /propre accès/);
  await one(ADMIN, 'aal2', `select store_mutate('{"action":"settings","name":"Lycée Test","address":"1 rue"}') r`);
  assert.equal((await db.query('select name from store_settings')).rows[0].name, 'Lycée Test');
  assert.equal((await one(ADMIN, 'aal2', `select store_mutate('{"action":"settings","name":"Lycée Professionnel Auguste Bartholdi","address":"142 Rue Denis Papin, 76360 Barentin"}') r`)).ok, true);
  const liste = await one(ADMIN, 'aal2', 'select store_admin_members() r');
  assert.equal(liste.length, 3);
  assert.deepEqual(liste.find(m => m.email === 'collegue@lycee.fr'), { email: 'collegue@lycee.fr', role: 'team', active: true, teacher: false, account: true, confirmed: true, authenticator: false });
  assert.match(String(await one(PROF, 'aal2', 'select store_admin_members() r')), /administrateur/);
});

test('import Excel : crée les articles inconnus, complète les connus, aligne le stock sur le comptage', async () => {
  const rows = JSON.stringify([
    { ref: 'A9F74216', quantity: '9', location: 'Rayon A' },
    { ref: 'NSYS3D', name: 'Coffret 300x300', type: 'Tableaux et coffrets', supplier: 'Schneider Electric', quantity: '4' },
    { name: 'Gaine ICTA 20', quantity: '3' }, { ref: '', name: '' }]);
  const r = await one(PROF, 'aal2', `select store_import('${rows}'::jsonb, true, 'Inventaire test') r`);
  assert.deepEqual(r, { added: 2, updated: 1, moved: 3, skipped: 1 });
  const items = (await db.query(`select ref, name, stock, location, type from store_items order by name`)).rows;
  assert.equal(items.find(i => i.ref === 'A9F74216').stock, 9);
  assert.equal(items.find(i => i.ref === 'A9F74216').location, 'Rayon A');
  assert.match(items.find(i => i.name === 'Gaine ICTA 20').ref, /^INV-/);
  assert.equal(items.find(i => i.name === 'Gaine ICTA 20').type, 'À classer');
  assert.match(String(await one(ELEVE, 'aal1', `select store_import('[]'::jsonb) r`)), /réservé à l’équipe/);
});

test('élève : catalogue sans quantités, inventaire enregistré puis envoyé, aucun accès au stock', async () => {
  const cat = await one(ELEVE, 'aal1', 'select store_catalog() r');
  assert.ok(cat.length >= 3);
  assert.equal(cat[0].stock, undefined, 'le stock théorique reste caché');
  assert.deepEqual(await as(ELEVE, 'aal1', 'select * from store_items'), []);
  assert.match(String(await one(ELEVE, 'aal1', 'select store_inventory() r')), /réservé à l’équipe/);
  await one(ELEVE, 'aal1', `select store_count_save('[{"ref":"A9F74216","counted":8}]'::jsonb, false) r`);
  await one(ELEVE, 'aal1', `select store_count_save('[{"ref":"A9F74216","counted":9}]'::jsonb, true) r`);
  const rows = (await db.query('select lines, submitted_at from store_counts')).rows;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].lines[0].counted, 9);
  assert.ok(rows[0].submitted_at);
  assert.equal((await as(PROF, 'aal2', 'select count(*)::int n from store_counts'))[0].n, 1);
  assert.match(String(await one(INCONNU, 'aal1', `select store_count_save('[]'::jsonb) r`)), /élèves validés/);
  const id = rows.length && (await db.query('select id from store_counts')).rows[0].id;
  assert.equal(await one(PROF, 'aal2', `select store_count_mark('${id}','loaded') r`), true);
});

test('collègue de l’équipe sans compte enseignant : inscription sans fiche élève, magasin seulement, version synchronisée', async () => {
  const NOUVEAU = '66666666-6666-6666-6666-666666666666';
  await one(ADMIN, 'aal2', `select store_mutate('{"action":"member","email":"technicien@atelier.fr","role":"team"}') r`);
  await db.exec(`insert into auth.users(id,email,raw_user_meta_data) values ('${NOUVEAU}','technicien@atelier.fr','{"account_type":"team","last_name":"Durand"}')`);
  assert.equal((await db.query(`select count(*)::int n from public.student_profiles where user_id='${NOUVEAU}'`)).rows[0].n, 0, 'pas inscrit comme élève');
  await db.exec(`insert into auth.users(id,email) values ('77777777-7777-7777-7777-777777777777','eleve2@lycee.fr')`);
  assert.equal((await db.query(`select count(*)::int n from public.student_profiles where email='eleve2@lycee.fr'`)).rows[0].n, 1, 'un élève reste inscrit normalement');
  assert.equal(await one(NOUVEAU, 'aal1', 'select store_member_check() r'), true);
  assert.equal(await one(INCONNU, 'aal1', 'select store_member_check() r'), false);
  assert.match(String(await one(NOUVEAU, 'aal1', 'select store_inventory() r')), /Authenticator requis/);
  const v1 = await one(ADMIN, 'aal2', 'select store_version() r');
  await one(NOUVEAU, 'aal2', `select store_mutate('{"action":"item","ref":"WAGO221","name":"Borne Wago 221","type":"Appareillage","category":"Habitat","supplier":"Wago","unit":"pièce","threshold":10,"stock":50}') r`);
  const v2 = await one(ADMIN, 'aal2', 'select store_version() r');
  assert.notEqual(v1, v2, 'l’administrateur voit que le magasin a changé');
  assert.ok((await one(ADMIN, 'aal2', 'select store_inventory() r')).items.some(i => i.ref === 'WAGO221'));
  assert.match(String(await one(NOUVEAU, 'aal2', `select store_mutate('{"action":"settings","name":"X"}') r`)), /non autorisée/);
  assert.match(String(await one(NOUVEAU, 'aal2', 'select store_admin_members() r')), /administrateur/);
});
