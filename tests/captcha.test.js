// Vérifie le contrôle anti-robot : jeton exigé, transmis à Supabase, renouvelé après chaque tentative.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const racine = path.join(__dirname, '..');

function chargerCaptcha() {
  const rendus = [], reinitialisations = [];
  const turnstile = {
    render(slot, options) { rendus.push({ slot, options }); return 'widget-' + rendus.length; },
    reset(id) { reinitialisations.push(id); }
  };
  const window = { turnstile };
  const slot = { dataset: { captcha: 'enseignant_connexion' } };
  const form = { querySelector: selector => selector === '[data-captcha]' ? slot : null };
  vm.runInNewContext(fs.readFileSync(path.join(racine, 'melec-captcha.js'), 'utf8'), { window, document: {}, setTimeout, clearTimeout, Promise, Map, Error });
  return { captcha: window.MelecCaptcha, form, rendus, reinitialisations };
}
const attendre = () => new Promise(resolve => setImmediate(resolve));

test('le contrôle est affiché une seule fois par formulaire, avec son action', async () => {
  const { captcha, form, rendus } = chargerCaptcha();
  captcha.mount(form); captcha.mount(form); await attendre();
  assert.equal(rendus.length, 1);
  assert.equal(rendus[0].options.action, 'enseignant_connexion');
  assert.match(rendus[0].options.sitekey, /^0x/);
});

test('sans validation, la connexion est refusée avant tout envoi', async () => {
  const { captcha, form } = chargerCaptcha();
  captcha.mount(form); await attendre();
  assert.throws(() => captcha.token(form), /anti-robot/);
});

test('le jeton validé est utilisé une seule fois puis le contrôle est relancé', async () => {
  const { captcha, form, rendus, reinitialisations } = chargerCaptcha();
  captcha.mount(form); await attendre();
  rendus[0].options.callback('jeton-1');
  assert.equal(captcha.token(form), 'jeton-1');
  captcha.reset(form);
  assert.deepEqual(reinitialisations, ['widget-1']);
  assert.throws(() => captcha.token(form), /anti-robot/);
});

test('un jeton expiré n’est plus accepté', async () => {
  const { captcha, form, rendus } = chargerCaptcha();
  captcha.mount(form); await attendre();
  rendus[0].options.callback('jeton-1');
  rendus[0].options['expired-callback']();
  assert.throws(() => captcha.token(form), /anti-robot/);
});

test('connexion et inscription transmettent le jeton à Supabase Auth', async () => {
  const appels = [];
  const sessionStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  const fetch = async (url, options) => { appels.push({ url, body: JSON.parse(options.body) }); return new Response('{"access_token":"a.b.c","expires_in":3600}', { status: 200 }); };
  const window = {};
  vm.runInNewContext(fs.readFileSync(path.join(racine, 'portal-api.js'), 'utf8'), {
    window, sessionStorage, fetch, AbortController, setTimeout, clearTimeout, URLSearchParams, Response, JSON, Math, Date, Number, String, encodeURIComponent,
    location: { hash: '', origin: 'https://exemple.test', pathname: '/eleve.html', search: '' }, history: { replaceState() {} }
  });
  await window.MelecPortal.signIn('prof@exemple.test', 'motdepasse', 'jeton-connexion');
  await window.MelecPortal.signUp({ email: 'eleve@exemple.test', password: 'motdepasse-long', lastName: 'Nom', firstName: 'Prénom', className: '1MELEC', captchaToken: 'jeton-inscription' });
  assert.equal(appels[0].body.gotrue_meta_security.captcha_token, 'jeton-connexion');
  assert.equal(appels[1].body.gotrue_meta_security.captcha_token, 'jeton-inscription');
});

test('les formulaires de connexion et d’inscription contiennent le contrôle', () => {
  const enseignant = fs.readFileSync(path.join(racine, 'enseignant.html'), 'utf8');
  const eleve = fs.readFileSync(path.join(racine, 'eleve.html'), 'utf8');
  assert.match(enseignant, /<form id="cloudLoginForm">[\s\S]*?data-captcha="enseignant_connexion"[\s\S]*?<\/form>/);
  assert.match(eleve, /<form id="studentLoginForm"[\s\S]*?data-captcha="eleve_connexion"[\s\S]*?<\/form>/);
  assert.match(eleve, /<form id="studentSignupForm"[\s\S]*?data-captcha="eleve_inscription"[\s\S]*?<\/form>/);
});

test('un clic sur « Se connecter » avant la validation attend le jeton au lieu d’échouer', async () => {
  const { captcha, form, rendus } = chargerCaptcha();
  captcha.mount(form); await attendre();
  let attente = false;
  const jeton = captcha.waitToken(form, () => { attente = true; });
  assert.equal(attente, true, 'message d’attente affiché');
  rendus[0].options.callback('jeton-tardif');
  assert.equal(await jeton, 'jeton-tardif');
  assert.equal(await captcha.waitToken(form), 'jeton-tardif', 'jeton déjà validé rendu immédiatement');
});

test('sans validation, l’attente finit par un message clair', async () => {
  const { captcha, form } = chargerCaptcha();
  captcha.mount(form); await attendre();
  await assert.rejects(captcha.waitToken(form, null, 20), /Vérifiez que vous êtes humain/);
});
