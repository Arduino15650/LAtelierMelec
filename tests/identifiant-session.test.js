// L'identifiant du compte est lu dans la session, sans requête réseau supplémentaire.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'portal-api.js'), 'utf8');
const b64 = obj => Buffer.from(JSON.stringify(obj)).toString('base64url');
const jeton = payload => `${b64({ alg: 'HS256' })}.${b64(payload)}.signature`;

function monter(session) {
  const appels = [];
  const context = {
    window: {}, atob: s => Buffer.from(s, 'base64').toString('binary'),
    sessionStorage: { getItem: () => JSON.stringify(session), setItem() {}, removeItem() {} },
    location: { hash: '', pathname: '/enseignant.html', search: '' }, history: { replaceState() {} },
    URLSearchParams, Date, Promise, AbortController, setTimeout, clearTimeout, JSON,
    fetch: async (url) => { appels.push(url); return { ok: true, status: 200, json: async () => ({ id: 'depuis-serveur' }) }; }
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  return { api: context.window.MelecPortal, appels };
}
const futur = () => Math.floor(Date.now() / 1000) + 3600;

test('identifiant pris dans la réponse de connexion', async () => {
  const access = jeton({ sub: 'autre' });
  const { api, appels } = monter({ access_token: access, refresh_token: 'r', expires_at: futur(), user: { id: 'u-connexion' } });
  assert.equal(await api.userId(), 'u-connexion');
  assert.equal(appels.length, 0);
});

test('identifiant lu dans le jeton quand la session ne contient pas l’utilisateur', async () => {
  const { api, appels } = monter({ access_token: jeton({ sub: 'u-jeton' }), refresh_token: 'r', expires_at: futur() });
  assert.equal(await api.userId(), 'u-jeton');
  assert.equal(appels.length, 0);
});

test('jeton illisible : on interroge Supabase comme avant', async () => {
  const { api, appels } = monter({ access_token: 'pas-un-jeton', refresh_token: 'r', expires_at: futur() });
  assert.equal(await api.userId(), 'depuis-serveur');
  assert.equal(appels.length, 1);
  assert.match(appels[0], /\/auth\/v1\/user$/);
});

test('jeton expiré : il est renouvelé avant de lire l’identifiant', async () => {
  const { api, appels } = monter({ access_token: jeton({ sub: 'ancien' }), refresh_token: 'r', expires_at: 1 });
  await api.userId();
  assert.match(appels[0], /grant_type=refresh_token/);
});
