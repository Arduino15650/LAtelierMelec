// Une session refusée par le serveur ramène au formulaire de connexion ; une panne réseau la conserve.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'portal-api.js'), 'utf8');
function monter(reponse) {
  const stockage = new Map([['melec-cloud-session-v1', JSON.stringify({ access_token: 'a.b.x', refresh_token: 'r', expires_at: Math.floor(Date.now() / 1000) + 3600 })]]);
  const context = {
    window: {}, atob: s => Buffer.from(s, 'base64').toString('binary'),
    sessionStorage: { getItem: k => stockage.get(k) ?? null, setItem: (k, v) => stockage.set(k, v), removeItem: k => stockage.delete(k) },
    location: { hash: '', pathname: '/eleve.html', search: '' }, history: { replaceState() {} },
    URLSearchParams, Date, Promise, AbortController, setTimeout, clearTimeout, JSON,
    fetch: async () => reponse
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  return { api: context.window.MelecPortal, stockage };
}
const json = (status, body) => ({ ok: status < 400, status, json: async () => body });

test('jeton illisible (PGRST301) : session refusée puis oubliée', async () => {
  const { api, stockage } = monter(json(401, { code: 'PGRST301', message: 'invalid JWT: unable to parse or verify signature, token is malformed' }));
  const erreur = await api.rest('student_profiles?select=*').catch(e => e);
  assert.equal(api.sessionRejected(erreur), true);
  api.forget();
  assert.equal(stockage.has('melec-cloud-session-v1'), false);
});

test('jeton de renouvellement refusé : session refusée', () => {
  const { api } = monter(json(200, {}));
  assert.equal(api.sessionRejected(Object.assign(new Error('Invalid Refresh Token: Refresh Token Not Found'), { status: 400, code: 'refresh_token_not_found' })), true);
  assert.equal(api.sessionRejected(Object.assign(new Error('JWT expired'), { status: 401, code: 'PGRST303' })), true);
});

test('panne réseau, serveur lent ou droit refusé : la session est conservée', () => {
  const { api } = monter(json(200, {}));
  assert.equal(api.sessionRejected(new Error('Le serveur ne répond pas après 12 secondes. Réessayez.')), false);
  assert.equal(api.sessionRejected(Object.assign(new Error('Erreur 503'), { status: 503 })), false);
  assert.equal(api.sessionRejected(Object.assign(new Error('permission denied for table store_items'), { status: 403, code: '42501' })), false);
});
