// Maintien en éveil : la tâche planifiée écrit un horodatage sans exposer la table.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('melec_veille : écriture limitée, table inaccessible au public', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();
  await db.exec('create role anon; create role authenticated;');
  await db.exec(fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '20261015180000_veille.sql'), 'utf8'));
  await db.exec("update public.melec_veille set derniere_visite = now() - interval '1 hour'");
  await db.exec('set role anon');
  const first = (await db.query('select public.melec_veille() r')).rows[0].r;
  const second = (await db.query('select public.melec_veille() r')).rows[0].r;
  assert.equal(first.etat, 'ok');
  assert.equal(first.visites, 1);
  assert.equal(second.visites, 1, 'pas plus d’une écriture par 10 minutes');
  await assert.rejects(db.query('select * from public.melec_veille'), /permission denied/);
  await assert.rejects(db.query('update public.melec_veille set visites = 0'), /permission denied/);
  await db.exec('reset role');
});
