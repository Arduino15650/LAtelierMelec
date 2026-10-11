// Reprise de session enseignant et file d'envoi vers Supabase (cloud-sync.js), sans réseau réel.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'cloud-sync.js'), 'utf8');
const KEY = 'melec-evaluation-v1';

function stockage(initial = {}) {
  const m = new Map(Object.entries(initial));
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), m };
}
function element() {
  return { hidden: false, textContent: '', className: '', value: '', disabled: false,
    classList: { add() {}, remove() {}, toggle() {} }, addEventListener() {}, querySelector: () => element() };
}

async function monter({ revisionDistante = 4, cache = true } = {}) {
  const els = new Map();
  const appels = [];
  const state = { activities: [{ id: 'a1', title: 'Tableau « T3 »', scores: { s1: { 'mastery:C4': 'N3' } } }], students: [{ id: 's1', name: 'Léa' }] };
  const local = stockage(cache ? { [KEY]: JSON.stringify(state), 'melec-evaluation-owner-v1': 'u1', 'melec-evaluation-revision-v1-u1': String(revisionDistante) } : {});
  const session = stockage({ 'melec-cloud-session-v1': JSON.stringify({ access_token: 't', refresh_token: 'r' }) });
  const minuteries = [];
  const context = {
    localStorage: local, sessionStorage: session, console,
    document: {
      getElementById: id => { if (!els.has(id)) els.set(id, element()); return els.get(id); },
      querySelector: sel => (sel === '#editorView.hidden' ? element() : element()),
      body: { classList: { add() {}, remove() {} } }, documentElement: { classList: { add() {}, remove() {} } },
      addEventListener() {}, hidden: false
    },
    window: {
      addEventListener() {}, location: { replace() {} },
      MelecPortal: {
        user: async () => ({ id: 'u1' }),
        userId: async () => 'u1',
        rest: async (chemin, options = {}) => {
          appels.push({ chemin, methode: options.method || 'GET', corps: options.body });
          if (chemin.startsWith('teacher_accounts')) return [{ user_id: 'u1' }];
          if (chemin.includes('select=revision') && !options.method) return [{ revision: revisionDistante }];
          if (chemin.includes('select=data,revision')) return [{ data: state, revision: revisionDistante }];
          if (options.method === 'PATCH') return [{ revision: revisionDistante + 1 }];
          return [];
        }
      }
    },
    setTimeout: (fn) => { minuteries.push(fn); return minuteries.length; }, clearTimeout() {}, setInterval() {},
    alert() {}, confirm: () => true,
    state, show() {}, renderHome() {},
    load: () => JSON.parse(local.getItem(KEY)),
    save: () => local.setItem(KEY, JSON.stringify(context.state))
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  await new Promise(r => setImmediate(r));
  await new Promise(r => setImmediate(r));
  return { context, local, appels, minuteries };
}

test('reprise de session : cache local à jour, aucune relecture complète', async () => {
  const { appels } = await monter();
  assert.ok(appels.some(a => a.chemin.startsWith('teacher_accounts')), 'compte enseignant vérifié');
  assert.ok(!appels.some(a => a.chemin.includes('select=data,revision')), 'pas de téléchargement inutile');
});

test('reprise de session sans cache : la sauvegarde distante est relue', async () => {
  const { appels } = await monter({ cache: false });
  assert.ok(appels.some(a => a.chemin.includes('select=data,revision')));
});

test('enregistrer : copie locale et file d’envoi identiques au format d’origine', async () => {
  const { context, local } = await monter();
  context.state.activities[0].scores.s1['mastery:C5'] = 'N4';
  context.save();
  assert.equal(local.getItem(KEY), JSON.stringify(context.state));
  assert.equal(local.getItem('melec-cloud-pending-v1-u1'), JSON.stringify({ data: context.state, revision: 4 }));
});

test('l’envoi part avec la révision attendue puis vide la file', async () => {
  const { context, local, appels, minuteries } = await monter();
  context.save();
  minuteries.splice(0).forEach(f => f());
  await new Promise(r => setImmediate(r));
  await new Promise(r => setImmediate(r));
  const patch = appels.find(a => a.methode === 'PATCH');
  assert.ok(patch, 'envoi effectué');
  assert.match(patch.chemin, /revision=eq\.4/);
  assert.equal(JSON.parse(patch.corps).revision, 5);
  assert.equal(local.getItem('melec-cloud-pending-v1-u1'), null);
});
