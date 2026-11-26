'use strict';
// Espace enseignant : le bouton « précédent » du navigateur (ou le geste retour du téléphone)
// réaffiche la rubrique précédente au lieu de quitter l'espace.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function monter() {
  const classes = new Set();
  const classList = { contains: c => classes.has(c), toggle: (c, on) => (on ?? !classes.has(c)) ? classes.add(c) : classes.delete(c), add: c => classes.add(c), remove: c => classes.delete(c) };
  const vues = new Set(['activitiesView', 'studentsView', 'resultsView', 'suiviView', 'teachingView']);
  const listeners = {};
  const url = new URL('https://latelier.melec-addict.fr/enseignant');
  const entrees = [url.href]; let pos = 0;
  const location = { get href() { return url.href; }, get hash() { return url.hash; }, get pathname() { return url.pathname; }, get search() { return url.search; } };
  const history = {
    state: null,
    replaceState(s, _t, u) { url.href = new URL(u, url).href; entrees[pos] = url.href; },
    pushState(s, _t, u) { url.href = new URL(u, url).href; entrees.splice(pos + 1); entrees.push(url.href); pos++; },
    back() { if (pos > 0) { pos--; url.href = entrees[pos]; (listeners.popstate || []).forEach(f => f({})); } }
  };
  const affiche = [];
  const button = { removeAttribute() {}, setAttribute() {}, addEventListener() {} };
  const context = {
    location, history,
    document: { body: { classList }, getElementById: id => id === 'appBackButton' ? button : (vues.has(id) ? {} : null), querySelector: () => null },
    MutationObserver: class { observe() {} },
    scrollTo() {},
    addEventListener(t, f) { (listeners[t] ||= []).push(f); }
  };
  context.window = context;
  // Comme home.js : chaque rubrique remplace l'adresse (#vue) sans créer d'entrée d'historique.
  context.show = name => { affiche.push(name); history.replaceState(null, '', location.pathname + (name === 'home' ? '' : '#' + name)); };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'retour.js'), 'utf8'), context);
  return { context, history, affiche, entrees: () => entrees.length };
}

test('chaque rubrique ouverte crée une entrée et le retour navigateur la réaffiche', () => {
  const { context, history, affiche, entrees } = monter();
  context.show('students');
  context.show('results');
  assert.strictEqual(entrees(), 3);
  history.back();
  assert.strictEqual(affiche.at(-1), 'students');
  assert.strictEqual(context.location.hash, '#students');
  history.back();
  assert.strictEqual(affiche.at(-1), 'home');
});

test('le retour navigateur ne crée pas de nouvelle entrée et consomme l’étape du bouton « Retour »', () => {
  const { context, history, entrees } = monter();
  context.show('students');
  context.show('results');
  assert.strictEqual(context.MelecRetour.size, 2);
  history.back();
  assert.strictEqual(entrees(), 3);
  assert.strictEqual(context.MelecRetour.size, 1);
});

test('adresse inconnue ou espace verrouillé : rien n’est affiché', () => {
  const { context, history, affiche } = monter();
  context.show('students');
  context.history.replaceState(null, '', '/enseignant#access_token=x');
  context.show('results');
  const avant = affiche.length;
  history.back();
  assert.strictEqual(affiche.length, avant);
  context.document.body.classList.add('cloud-locked');
  history.back();
  assert.strictEqual(affiche.length, avant);
});
