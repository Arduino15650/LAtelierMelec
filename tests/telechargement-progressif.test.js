// Téléchargement des gros documents de TP : un transfert lent mais régulier aboutit,
// un transfert bloqué est abandonné avec un message clair, la progression est indiquée.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'portal-api.js'), 'utf8');
const session = JSON.stringify({ access_token: 'jeton', refresh_token: 'r', expires_at: Math.floor(Date.now() / 1000) + 3600 });

// Horloge simulée : les délais du site s'écoulent instantanément quand le test avance le temps.
function horloge() {
  let maintenant = 0, suivant = 1;
  const minuteries = new Map();
  return {
    setTimeout(fn, ms) { const id = suivant++; minuteries.set(id, { fn, echeance: maintenant + (ms || 0) }); return id; },
    clearTimeout(id) { minuteries.delete(id); },
    avancer(ms) {
      const fin = maintenant + ms;
      for (;;) {
        const prochaine = [...minuteries.entries()].filter(([, m]) => m.echeance <= fin).sort((a, b) => a[1].echeance - b[1].echeance)[0];
        if (!prochaine) break;
        minuteries.delete(prochaine[0]); maintenant = prochaine[1].echeance; prochaine[1].fn();
      }
      maintenant = fin;
    }
  };
}

// Réponse dont le contenu arrive morceau par morceau, à la demande du test.
function reponseProgressive(signal, taille) {
  let attente = null;
  const morceaux = [];
  signal.addEventListener('abort', () => { if (attente) { attente.reject(Object.assign(new Error('abandon'), { name: 'AbortError' })); attente = null; } });
  return {
    reponse: {
      ok: true, status: 200,
      headers: { get: nom => nom === 'content-length' ? String(taille) : nom === 'content-type' ? 'application/pdf' : null },
      body: { getReader: () => ({
        read: () => morceaux.length ? Promise.resolve(morceaux.shift()) : new Promise((resolve, reject) => { attente = { resolve, reject }; }),
        cancel() {}
      }) }
    },
    envoyer(octets) { const element = { done: false, value: new Uint8Array(octets) }; if (attente) { attente.resolve(element); attente = null; } else morceaux.push(element); },
    terminer() { const element = { done: true }; if (attente) { attente.resolve(element); attente = null; } else morceaux.push(element); }
  };
}

function charger() {
  const temps = horloge();
  let flux = null;
  const contexte = {
    window: {}, sessionStorage: { getItem: () => session, setItem() {}, removeItem() {} },
    location: { hash: '', pathname: '/eleve.html' }, history: { replaceState() {} },
    URLSearchParams, Date, Promise, AbortController, Blob, Uint8Array, JSON, Math, Number, String, Error, encodeURIComponent,
    setTimeout: temps.setTimeout, clearTimeout: temps.clearTimeout,
    fetch: async (url, options) => { flux = reponseProgressive(options.signal, 10 * 1024 * 1024); return flux.reponse; }
  };
  vm.runInNewContext(source, contexte);
  return { api: contexte.window.MelecPortal, temps, flux: () => flux };
}
const tic = () => new Promise(resolve => setImmediate(resolve));

test('un dossier lent mais régulier (plus d’une minute) est entièrement téléchargé', async () => {
  const { api, temps, flux } = charger();
  const progression = [];
  const resultat = api.download('tp/dossier.pdf', { retryTransient: true, onProgress: (recu, total) => progression.push([recu, total]) });
  await tic();
  for (let i = 0; i < 10; i++) { temps.avancer(10000); flux().envoyer(1024 * 1024); await tic(); }
  flux().terminer();
  const fichier = await resultat;
  assert.equal(fichier.size, 10 * 1024 * 1024);
  assert.equal(fichier.type, 'application/pdf');
  assert.equal(progression.length, 10);
  assert.deepEqual(progression.at(-1), [10 * 1024 * 1024, 10 * 1024 * 1024]);
});

test('un transfert bloqué est abandonné avec un message compréhensible', async () => {
  const { api, temps, flux } = charger();
  const verification = assert.rejects(api.download('tp/dossier.pdf'), /transfert s’est interrompu/);
  await tic();
  flux().envoyer(1024); await tic();
  temps.avancer(29000); await tic();
  flux().envoyer(1024); await tic();
  temps.avancer(31000); await tic();
  await verification;
});

test('un serveur qui ne commence jamais à répondre est abandonné après 15 s', async () => {
  const temps = horloge();
  const contexte = {
    window: {}, sessionStorage: { getItem: () => session, setItem() {}, removeItem() {} },
    location: { hash: '', pathname: '/eleve.html' }, history: { replaceState() {} },
    URLSearchParams, Date, Promise, AbortController, Blob, Uint8Array, JSON, Math, Number, String, Error, encodeURIComponent,
    setTimeout: temps.setTimeout, clearTimeout: temps.clearTimeout,
    fetch: (url, options) => new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('abandon'))))
  };
  vm.runInNewContext(source, contexte);
  const verification = assert.rejects(contexte.window.MelecPortal.download('tp/dossier.pdf'), /transfert s’est interrompu/);
  await tic();
  temps.avancer(15000);
  await verification;
});
