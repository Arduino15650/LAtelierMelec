// Vérifie l'assemblage pour la publication (npm run build) : chaque page assemblée ne charge
// que des fichiers présents, dans le même ordre que les fichiers d'origine.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const racine = path.join(__dirname, '..');
const dist = path.join(racine, 'dist');
let esbuildPresent = true;
try { require.resolve('esbuild', { paths: [racine] }); } catch { esbuildPresent = false; }
const locaux = html => [...html.matchAll(/<(?:link rel="stylesheet" href|script src)="(?!https?:)([^"?#]+)/g)].map(m => m[1].replace(/^\.\//, ''));

test('assemblage des pages', { skip: !esbuildPresent && 'esbuild non installé (npm ci)' }, async t => {
  execFileSync(process.execPath, [path.join(racine, 'scripts', 'build.mjs')], { stdio: 'pipe' });

  for (const page of ['index.html', 'enseignant.html', 'eleve.html']) {
    await t.test(page, () => {
      const source = fs.readFileSync(path.join(racine, page), 'utf8');
      const assemble = fs.readFileSync(path.join(dist, page), 'utf8');
      const fichiers = locaux(assemble);
      for (const fichier of fichiers) assert.ok(fs.existsSync(path.join(dist, fichier)), `${page} appelle ${fichier}, absent de dist`);
      assert.ok(fichiers.length < locaux(source).length || page === 'index.html', 'les fichiers sont regroupés');
      assert.doesNotMatch(assemble, /<(?:link rel="stylesheet" href|script src)="(?!https?:)[^"]*\?v=/, 'plus de numéro de version manuel sur les scripts et styles');
      // Le reste de la page est inchangé : seules les balises de chargement locales diffèrent.
      const sansChargements = html => html.replace(/<link rel="stylesheet" href="(?!https?:)[^"]+">|<script src="(?!https?:)[^"]+"( defer)?><\/script>/g, '').replace(/\s+/g, ' ');
      assert.equal(sansChargements(assemble), sansChargements(source));
    });
  }

  await t.test('le contenu des fichiers d’origine est repris dans l’ordre', () => {
    const page = fs.readFileSync(path.join(racine, 'enseignant.html'), 'utf8');
    const bundle = locaux(fs.readFileSync(path.join(dist, 'enseignant.html'), 'utf8')).filter(f => f.endsWith('.js'));
    const code = bundle.map(f => fs.readFileSync(path.join(dist, f), 'utf8')).join('\n');
    // Repères présents dans les fichiers d'origine, dans leur ordre de chargement.
    const reperes = ['melec-evaluation-v1', 'window.MelecPortal', 'window.MelecCaptcha', 'window.MelecMfa', 'melec-cloud-pending-v1-'];
    const positions = reperes.map(r => code.indexOf(r));
    for (const [i, p] of positions.entries()) assert.ok(p >= 0, `repère absent : ${reperes[i]}`);
    assert.deepEqual([...positions].sort((a, b) => a - b), positions, 'ordre de chargement conservé');
    assert.ok(locaux(page).includes('app.js'));
  });

  await t.test('le cache hors ligne change de nom à chaque publication', () => {
    const worker = fs.readFileSync(path.join(dist, 'service-worker.js'), 'utf8');
    assert.match(worker, /const CACHE_NAME = 'bac-pro-melec-[0-9a-f]{10}';/);
  });

  await t.test('les fichiers de travail ne sont pas publiés', () => {
    for (const prive of ['tests', 'supabase', 'scripts', 'node_modules', 'package.json', 'CAHIER_DES_CHARGES.md'])
      assert.ok(!fs.existsSync(path.join(dist, prive)), `${prive} ne doit pas être publié`);
  });
});
