// Vérifie que chaque script du site se lit sans erreur de syntaxe.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const racine = path.join(__dirname, '..');
const scripts = fs.readdirSync(racine).filter(f => f.endsWith('.js') && !f.endsWith('.min.js'));

for (const fichier of scripts) {
  test(`syntaxe de ${fichier}`, () => {
    assert.doesNotThrow(() => execFileSync(process.execPath, ['--check', path.join(racine, fichier)], { stdio: 'pipe' }));
  });
}

test('chaque script appelé par les pages existe', () => {
  for (const page of ['index.html', 'enseignant.html', 'eleve.html']) {
    const html = fs.readFileSync(path.join(racine, page), 'utf8');
    const sources = [...html.matchAll(/<(?:script|link)[^>]+(?:src|href)="(?!https?:)([^"?#]+)/g)].map(m => m[1].replace(/^\.\//, ''));
    for (const source of sources) assert.ok(fs.existsSync(path.join(racine, source)), `${page} appelle ${source}, introuvable`);
  }
});
