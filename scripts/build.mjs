// Assemblage du site pour la publication (npm run build → dossier dist/).
//
// Le code source reste du HTML, du JavaScript et du CSS classiques, utilisables tels quels.
// Pour la publication, chaque suite de feuilles de style ou de scripts chargés l'un après
// l'autre dans une page est regroupée en un seul fichier compressé, dans le même ordre.
// Le nom de chaque fichier assemblé contient l'empreinte de son contenu : les navigateurs
// prennent automatiquement la nouvelle version, sans numéro « ?v= » à mettre à jour.
//
// Rien n'est renommé ni réécrit : les scripts restent des scripts classiques qui partagent
// les mêmes variables globales, exactement comme lorsqu'ils étaient chargés séparément.
import {createHash} from 'node:crypto';
import {cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync} from 'node:fs';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {transform} from 'esbuild';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'dist');
const pages = ['index.html', 'enseignant.html', 'eleve.html'];
// Dossiers et fichiers de travail qui ne sont pas publiés.
const excluded = new Set(['.git', '.github', '.claude', 'node_modules', 'dist', 'tests', 'scripts', 'supabase', 'docs',
  'package.json', 'package-lock.json', 'CAHIER_DES_CHARGES.md', 'README.md', 'LISEZ_MOI.txt']);

const fingerprint = text => createHash('sha256').update(text).digest('hex').slice(0, 10);
const localPath = src => src.split(/[?#]/)[0].replace(/^\.\//, '');

// Suites de balises identiques, séparées seulement par des espaces.
const LINK = String.raw`<link rel="stylesheet" href="(?!https?:)[^"]+">`;
const SCRIPT = String.raw`<script src="(?!https?:)[^"]+"( defer)?><\/script>`;
const run = tag => new RegExp(String.raw`${tag}(?:\s*${tag})*`, 'g');

async function bundle(files, loader) {
  const parts = files.map(file => {
    const text = readFileSync(join(root, file), 'utf8');
    // Le « ; » protège la fin d'un fichier sans point-virgule final.
    return loader === 'js' ? `/* ${file} */\n${text}\n;` : `/* ${file} */\n${text}`;
  });
  const {code} = await transform(parts.join('\n'), {
    loader, minifyWhitespace: true, minifySyntax: true, legalComments: 'none', charset: 'utf8'
  });
  return code;
}

async function main() {
  rmSync(out, {recursive: true, force: true});
  mkdirSync(out);
  for (const entry of readdirSync(root)) {
    if (!excluded.has(entry)) cpSync(join(root, entry), join(out, entry), {recursive: true});
  }
  const created = [];
  for (const page of pages) {
    let html = readFileSync(join(root, page), 'utf8');
    const name = page.replace('.html', '');
    for (const [kind, pattern, loader] of [['css', run(LINK), 'css'], ['js', run(SCRIPT), 'js']]) {
      const groups = [...html.matchAll(pattern)];
      let index = 0;
      for (const group of groups) {
        const files = [...group[0].matchAll(kind === 'css' ? /href="([^"]+)"/g : /src="([^"]+)"/g)].map(m => localPath(m[1]));
        for (const file of files) if (!existsSync(join(root, file))) throw new Error(`${page} appelle ${file}, introuvable`);
        const code = await bundle(files, loader);
        const file = `${name}-${++index}.${fingerprint(code)}.${kind}`;
        writeFileSync(join(out, file), code);
        created.push({page, file, sources: files.length});
        const defer = kind === 'js' && / defer>/.test(group[0]) ? ' defer' : '';
        const tag = kind === 'css' ? `<link rel="stylesheet" href="${file}">` : `<script src="${file}"${defer}></script>`;
        html = html.replace(group[0], tag);
      }
    }
    writeFileSync(join(out, page), html);
  }
  // Le cache hors ligne change de nom à chaque publication qui modifie un fichier assemblé.
  const release = fingerprint(created.map(item => item.file).join('|'));
  const worker = readFileSync(join(root, 'service-worker.js'), 'utf8');
  const named = worker.replace(/const CACHE_NAME = '[^']*';/, `const CACHE_NAME = 'bac-pro-melec-${release}';`);
  if (named === worker) throw new Error('Nom du cache introuvable dans service-worker.js');
  writeFileSync(join(out, 'service-worker.js'), named);
  for (const item of created) console.log(`${item.page.padEnd(16)} ${String(item.sources).padStart(2)} fichier(s) → ${item.file}`);
}

main().catch(error => { console.error(error.message); process.exit(1); });
