// Les appréciations sont enregistrées après une pause de frappe, ou immédiatement en quittant le champ.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'evaluation-atelier-v2.js'), 'utf8');
const debut = source.indexOf('  let feedbackSaveTimer=null;');
const fin = source.indexOf("document.addEventListener('visibilitychange'", debut);
const helpers = source.slice(debut, source.indexOf('\n', fin) + 1);

function monter() {
  const minuteries = new Map(); let id = 0; const ecoute = {};
  const context = {
    saves: 0, save() { context.saves++; },
    setTimeout(fn) { minuteries.set(++id, fn); return id; }, clearTimeout(t) { minuteries.delete(t); },
    window: { addEventListener(n, fn) { ecoute[n] = fn; } },
    document: { hidden: false, addEventListener(n, fn) { ecoute['doc:' + n] = fn; } }
  };
  vm.createContext(context);
  vm.runInContext(helpers + ';this.flush=flushFeedbackSave;this.later=scheduleFeedbackSave;', context);
  const avancer = () => { const fns = [...minuteries.values()]; minuteries.clear(); fns.forEach(f => f()); };
  return { context, avancer, ecoute };
}

test('plusieurs frappes rapprochées : un seul enregistrement', () => {
  const { context, avancer } = monter();
  context.later(); context.later(); context.later();
  assert.equal(context.saves, 0);
  avancer();
  assert.equal(context.saves, 1);
});

test('quitter le champ enregistre tout de suite, sans doublon', () => {
  const { context, avancer } = monter();
  context.later(); context.flush();
  assert.equal(context.saves, 1);
  avancer(); context.flush();
  assert.equal(context.saves, 1);
});

test('fermer ou masquer la page enregistre', () => {
  const { context, ecoute } = monter();
  context.later(); ecoute.pagehide();
  assert.equal(context.saves, 1);
  context.later(); context.document.hidden = true; ecoute['doc:visibilitychange']();
  assert.equal(context.saves, 2);
});
