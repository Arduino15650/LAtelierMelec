// PFMP : normalisation et empreinte des entreprises identiques à Gestion PFMP (reconnaissance des doublons).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

const window = { MelecPortal: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'pfmp.js'), 'utf8'),
  { window, document: { getElementById: () => null }, crypto: webcrypto, TextEncoder, Intl, Math, Number, String, Array, Map, Set, Object, Date, JSON, Error, Promise, Uint8Array });
const { normalizeCompany, fingerprint } = window.MelecPfmp;

test('codes postaux, SIRET, secteurs et coordonnées sont remis en forme', () => {
  const c = normalizeCompany({ raisonSociale: ' Elec Alsace ', codePostal: '8000', siret: '123 456 789 0123', activite: 'Installation électrique', metiers: 'Électricien, Câbleur', lat: '48,08', lon: 'x' });
  assert.equal(c.raisonSociale, 'Elec Alsace');
  assert.equal(c.codePostal, '08000');
  assert.equal(c.siret, '01234567890123');
  assert.deepEqual([...c.metiers], ['Électricien', 'Câbleur']);
  assert.deepEqual([...c.secteurs], ['Électricité']);
  assert.equal(c.lat, 48.08);
  assert.equal(c.lon, null);
  assert.throws(() => normalizeCompany({ raisonSociale: '' }), /obligatoire/);
});

test('même SIRET = même entreprise ; sinon nom + adresse sans accents ni majuscules', async () => {
  const a = await fingerprint(normalizeCompany({ raisonSociale: 'A', siret: '12345678901234' }));
  const b = await fingerprint(normalizeCompany({ raisonSociale: 'Autre nom', siret: '12345678901234' }));
  assert.equal(a, b);
  const c = await fingerprint(normalizeCompany({ raisonSociale: 'Élec Rhin', adresse: '1 rue A', codePostal: '68000', ville: 'Colmar' }));
  const d = await fingerprint(normalizeCompany({ raisonSociale: 'ELEC RHIN', adresse: '1 RUE A', codePostal: '68000', ville: 'colmar' }));
  assert.equal(c, d);
  assert.match(c, /^[0-9a-f]{64}$/);
});
