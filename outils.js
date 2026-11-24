/* L'Atelier MELEC · Mes outils : CV et lettres de motivation.
   - Espace élève : onglet « Mes outils » (création, modification, suppression, PDF, correcteur,
     envoi à l'enseignant pour relecture).
   - Espace enseignant : onglet « CV et lettres » (lecture, PDF, commentaire, « à corriger » / « validé »).
   Données : table student_career_docs (supabase/migrations/…_documents_candidature.sql).
   Modèles et page A4 : outils-rendu.js ; mise en page et PDF : outils-pdf.js. */
(function () {
  'use strict';
  const R = window.MelecOutilsRendu, PDF = window.MelecOutilsPdf;
  if (!R || !PDF) return;
  const TABLE = 'student_career_docs';
  const LIST_FIELDS = 'id,student_id,kind,title,review_status,submitted_at,teacher_comment,reviewed_at,updated_at,created_at';
  const STATUS = { draft: 'Brouillon', submitted: 'Envoyé à l’enseignant', changes: 'À corriger', approved: 'Validé par l’enseignant' };
  const KIND = { cv: 'CV', lm: 'Lettre de motivation' };
  const dateFr = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
  const LT_URL = 'https://api.languagetool.org/v2/check';

  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs || {})) {
      if (value === undefined || value === null || value === false) continue;
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key === 'value') node.value = value;
      else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value === true ? '' : value);
    }
    for (const child of children.flat(Infinity)) if (child !== null && child !== undefined && child !== false) node.append(child);
    return node;
  }
  const fill = (node, ...children) => node.replaceChildren(...children.flat(Infinity).filter(c => c !== null && c !== undefined && c !== false));
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const statusChip = s => el('span', { class: 'ot-chip ot-st-' + s, text: STATUS[s] || s });
  const defaultTitle = (kind, data) => {
    const who = [data.person?.first, data.person?.last].filter(Boolean).join(' ');
    if (kind === 'cv') return 'CV' + (who ? ' · ' + who : '');
    return 'Lettre' + (data.recipient?.company ? ' · ' + data.recipient.company : who ? ' · ' + who : '');
  };

  // ───── Champs de saisie ─────
  function field(label, value, onInput, opts = {}) {
    const attrs = { value: value || '', maxlength: opts.max || 160, placeholder: opts.placeholder || '', type: opts.type || 'text', spellcheck: opts.spell === false ? 'false' : 'true', lang: 'fr', autocomplete: 'off', inputmode: opts.inputmode };
    const input = opts.area ? el('textarea', { ...attrs, rows: opts.rows || 4, type: null }) : el('input', attrs);
    if (opts.area) input.value = value || '';
    const count = opts.count ? el('span', { class: 'ot-count' }) : null;
    const update = () => { if (count) { const n = input.value.length; count.textContent = n + ' / ' + opts.count + ' caractères'; count.classList.toggle('over', n > opts.count); } };
    input.addEventListener('input', () => { onInput(input.value); update(); });
    update();
    return el('label', { class: 'ot-field' + (opts.cls ? ' ' + opts.cls : '') }, el('span', { text: label }), input, opts.hint ? el('small', { class: 'ot-help', text: opts.hint }) : null, count);
  }
  const switchBtn = (on, label, onClick) => el('button', { type: 'button', class: 'ot-switch', role: 'switch', 'aria-checked': String(on), 'aria-label': label, onclick: onClick });
  const chips = (items, isOn, onPick, label) => el('div', { class: 'ot-chips', role: 'group', 'aria-label': label }, items.map(([value, text]) =>
    el('button', { type: 'button', 'aria-pressed': String(isOn(value)), text, onclick: () => onPick(value) })));

  // Miniatures des organisations (CV et lettre) : simples rectangles.
  const SHEETS = {
    lateral: [[0, 0, 32, 100, 'a'], [38, 7, 40, 6, 'd'], [38, 18, 52, 3, 'l'], [38, 24, 48, 3, 'l'], [38, 34, 52, 3, 'l'], [38, 40, 44, 3, 'l'], [7, 8, 18, 14, 'p']],
    'lateral-d': [[68, 0, 32, 100, 'a'], [8, 7, 40, 6, 'd'], [8, 18, 52, 3, 'l'], [8, 24, 48, 3, 'l'], [8, 34, 52, 3, 'l'], [8, 40, 44, 3, 'l'], [75, 8, 18, 14, 'p']],
    ats: [[25, 6, 50, 6, 'd'], [20, 15, 60, 2, 'l'], [8, 22, 84, 1, 'a'], [8, 28, 84, 3, 'l'], [8, 34, 80, 3, 'l'], [8, 44, 84, 3, 'l'], [8, 50, 78, 3, 'l'], [8, 60, 84, 3, 'l']],
    bandeau: [[0, 0, 100, 20, 'a'], [6, 4, 16, 12, 'p'], [27, 6, 40, 5, 'w'], [8, 28, 54, 3, 'l'], [8, 34, 50, 3, 'l'], [8, 44, 54, 3, 'l'], [70, 28, 22, 3, 'l'], [70, 34, 20, 3, 'l']],
    deux: [[8, 6, 50, 6, 'd'], [76, 4, 16, 12, 'p'], [8, 18, 84, 1.5, 'a'], [8, 26, 38, 3, 'l'], [8, 32, 36, 3, 'l'], [54, 26, 38, 3, 'l'], [54, 32, 34, 3, 'l'], [8, 42, 38, 3, 'l'], [54, 42, 38, 3, 'l']],
    frise: [[8, 5, 14, 11, 'p'], [27, 7, 40, 6, 'd'], [26, 24, 1, 60, 'a'], [24, 26, 5, 3.5, 'a'], [24, 44, 5, 3.5, 'a'], [31, 26, 36, 3, 'l'], [31, 44, 34, 3, 'l'], [74, 24, 20, 3, 'l']],
    bento: [[8, 5, 14, 11, 'p'], [27, 7, 40, 6, 'd'], [6, 22, 52, 22, 'c'], [62, 22, 32, 30, 'c'], [6, 48, 52, 24, 'c'], [62, 56, 32, 16, 'c']],
    fr: [[8, 6, 30, 10, 'd'], [58, 20, 34, 8, 'c'], [58, 32, 28, 3, 'l'], [8, 40, 40, 3, 'a'], [8, 48, 84, 3, 'l'], [8, 54, 80, 3, 'l'], [8, 62, 84, 3, 'l'], [64, 82, 24, 4, 'a']],
    'bandeau-lm': [[0, 0, 100, 15, 'a'], [8, 5, 40, 5, 'w'], [58, 22, 34, 8, 'c'], [8, 36, 40, 3, 'a'], [8, 46, 84, 3, 'l'], [8, 52, 80, 3, 'l'], [8, 60, 84, 3, 'l'], [64, 82, 24, 4, 'a']],
    cv: [[8, 6, 50, 7, 'd'], [8, 16, 84, 1.5, 'a'], [58, 24, 34, 8, 'c'], [8, 38, 40, 3, 'a'], [8, 48, 84, 3, 'l'], [8, 54, 80, 3, 'l'], [8, 62, 84, 3, 'l'], [64, 82, 24, 4, 'a']],
    'lateral-lm': [[0, 0, 28, 100, 'a'], [36, 10, 30, 7, 'c'], [36, 24, 40, 3, 'a'], [36, 34, 56, 3, 'l'], [36, 40, 52, 3, 'l'], [36, 48, 56, 3, 'l'], [66, 80, 24, 4, 'a']],
    minimal: [[30, 6, 40, 6, 'd'], [45, 15, 10, 1, 'a'], [8, 26, 30, 7, 'c'], [8, 38, 40, 3, 'a'], [8, 48, 84, 3, 'l'], [8, 54, 80, 3, 'l'], [64, 80, 24, 4, 'a']],
    mail: [[6, 6, 88, 86, 'o'], [12, 12, 50, 5, 'c'], [12, 22, 40, 3, 'a'], [12, 30, 74, 3, 'l'], [12, 36, 70, 3, 'l'], [12, 44, 74, 3, 'l'], [12, 58, 30, 4, 'a']]
  };
  function sheet(id, accent) {
    const colors = { a: accent, d: '#1d2530', l: '#d5dbe3', p: '#9aa7b6', w: '#ffffff', c: '#e7ecf2' };
    return el('div', { class: 'ot-tile-sheet', 'aria-hidden': 'true' }, (SHEETS[id] || []).map(([x, y, w, h, c]) => {
      const span = el('span');
      span.style.cssText = `left:${x}%;top:${y}%;width:${w}%;height:${h}%;` + (c === 'o' ? 'border:2px solid #d5dbe3;' : 'background:' + colors[c] + ';');
      return span;
    }));
  }

  // ───── Photo et signature : réduites et compressées avant enregistrement ─────
  function readImage(file) {
    return new Promise((resolve, reject) => {
      if (!file || !/^image\//.test(file.type)) return reject(new Error('Choisissez une image (JPEG, PNG…).'));
      if (file.size > 15e6) return reject(new Error('Image trop lourde (15 Mo au plus).'));
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image illisible.')); };
      img.src = url;
    });
  }
  async function photoFromFile(file) {
    const img = await readImage(file);
    const ratio = 4 / 5, W = 360, H = 450;
    let sw = img.naturalWidth, sh = img.naturalHeight;
    if (sw / sh > ratio) sw = sh * ratio; else sh = sw / ratio;
    const canvas = el('canvas'); canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, 0, 0, W, H);
    for (const q of [0.85, 0.75, 0.6, 0.45]) { const url = canvas.toDataURL('image/jpeg', q); if (url.length < 190000) return url; }
    throw new Error('Photo trop détaillée : essayez une autre image.');
  }
  function trimCanvas(source) {
    const ctx = source.getContext('2d');
    const { width, height } = source;
    const data = ctx.getImageData(0, 0, width, height).data;
    let x0 = width, y0 = height, x1 = 0, y1 = 0;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (data[(y * width + x) * 4 + 3] > 10) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 <= x0 || y1 <= y0) return null;
    const pad = 6, out = el('canvas');
    out.width = x1 - x0 + 2 * pad; out.height = y1 - y0 + 2 * pad;
    out.getContext('2d').drawImage(source, x0 - pad, y0 - pad, out.width, out.height, 0, 0, out.width, out.height);
    return out;
  }
  async function signatureFromFile(file) {
    const img = await readImage(file);
    const scale = Math.min(1, 600 / img.naturalWidth, 240 / img.naturalHeight);
    const canvas = el('canvas'); canvas.width = Math.round(img.naturalWidth * scale); canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    // Fond clair rendu transparent : la signature se pose sur la page sans cadre blanc.
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < pixels.data.length; i += 4) { const v = (pixels.data[i] + pixels.data[i + 1] + pixels.data[i + 2]) / 3; if (v > 200) pixels.data[i + 3] = 0; }
    ctx.putImageData(pixels, 0, 0);
    const cut = trimCanvas(canvas) || canvas;
    const url = cut.toDataURL('image/png');
    if (url.length < 115000) return url;
    throw new Error('Image de signature trop lourde : recadrez-la sur la signature.');
  }

  // ───── Correcteur (orthographe, grammaire, conjugaison, syntaxe) ─────
  // Le texte des rubriques est envoyé au service LanguageTool (Allemagne, RGPD) ; les
  // coordonnées (e-mail, téléphone, adresse) et le nom ne sont jamais envoyés.
  let lastCheck = 0;
  function kindOf(match) {
    const id = (match.rule?.id || '') + ' ' + (match.rule?.category?.id || '');
    const type = match.rule?.issueType || '';
    if (type === 'misspelling' || /TYPOS|HUNSPELL|MORFOLOGIK/.test(id)) return ['spell', 'Orthographe'];
    if (/CONJ|VERBE|VERB|VINF|VAVOIR|VETRE|IMPERATIF|PP_|PPA|PASSE|INFINITI|SUBJ|FUTUR|_VB/.test(id)) return ['grammar', 'Conjugaison'];
    if (/ACCORD|AGREEMENT|GENRE|NOMBRE|PLURI|SING|^D_N|_D_N|SONT_SON|_GN/.test(id)) return ['grammar', 'Accord'];
    if (/PUNCT|VIRG|COMMA|POINT|DOUBLE_PUNCT/.test(id) || type === 'typographical') return ['punct', 'Ponctuation'];
    if (/STYLE|REDUND|REPET|COLLOQ|FAMILIER/.test(id) || type === 'style') return ['style', 'Style'];
    if (/CASING|MAJ/.test(id)) return ['grammar', 'Majuscule'];
    return ['grammar', 'Grammaire'];
  }
  async function checkTexts(fields) {
    const parts = [];
    let text = '';
    for (const f of fields) {
      const value = f.get();
      if (!value || !value.trim()) continue;
      if (text) text += '\n\n';
      parts.push({ f, start: text.length, length: value.length, value });
      text += value;
    }
    if (!text.trim()) return [];
    const wait = 4000 - (Date.now() - lastCheck);
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    lastCheck = Date.now();
    const body = new URLSearchParams({ text: text.slice(0, 19000), language: 'fr', disabledRules: 'FRENCH_WHITESPACE,APOS_TYP,TIRET,ESPACE_APRES_POINT,DOUBLE_PUNCTUATION,WHITESPACE_RULE,FR_SPLIT_WORDS_HYPHEN', disabledCategories: 'TYPOGRAPHY' });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    let response;
    try { response = await fetch(LT_URL, { method: 'POST', body, signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer' }); }
    catch { throw new Error('Correcteur injoignable : vérifiez la connexion. Le soulignement rouge du navigateur reste actif dans les champs.'); }
    finally { clearTimeout(timer); }
    if (response.status === 429) throw new Error('Beaucoup de vérifications en même temps dans la classe : réessayez dans une minute.');
    if (!response.ok) throw new Error('Correcteur indisponible pour le moment (' + response.status + ').');
    const json = await response.json();
    const out = [];
    for (const m of json.matches || []) {
      const part = parts.find(p => m.offset >= p.start && m.offset + m.length <= p.start + p.length);
      if (!part) continue;
      const offset = m.offset - part.start;
      const wrong = part.value.slice(offset, offset + m.length);
      if (/^\[.*\]$/.test(wrong) || /\[[^\]]*$/.test(part.value.slice(0, offset))) continue; // passage à compléter
      const [cls, label] = kindOf(m);
      out.push({ field: part.f, offset, length: m.length, wrong, message: m.message, short: m.shortMessage, replacements: (m.replacements || []).slice(0, 4).map(r => r.value), cls, label, rule: m.rule?.id || '' });
    }
    return out;
  }

  // ───── Éditeur (élève) ─────
  function createEditor(ctx) {
    // ctx : { doc, onChange(), onStructure(), cvList(), loadDoc(id), notify(text) }
    const doc = ctx.doc;
    let data = doc.data;
    let tab = 'content', openSection = doc.kind === 'cv' ? 'profil' : 'moi', themeFilter = '';
    let spell = { state: 'idle', items: [], error: '', ignored: new Set() };
    const panel = el('div', { class: 'ot-panel' });
    const stageScale = el('div', { class: 'ot-scale' });
    const pageHost = el('div', { class: 'ot-page-host' });
    stageScale.append(pageHost);
    const stage = el('div', { class: 'ot-stage' }, stageScale);
    const info = el('div', { class: 'ot-preview-bar', role: 'status', 'aria-live': 'polite' });
    const preview = el('div', { class: 'ot-preview' }, info, stage);
    let lastLayout = { pages: 1, k: 1 };
    let renderTicket = 0;
    const paint = async () => {
      const ticket = ++renderTicket;
      await PDF.loadFonts();
      const page = doc.kind === 'cv' ? R.renderCv(data) : R.renderLetter(data);
      await PDF.mount(pageHost, page);
      if (ticket !== renderTicket) return;
      lastLayout = PDF.layout(page, data, doc.kind);
      const width = stage.clientWidth - 24 || 600;
      const scale = Math.min(1, width / R.PAGE_W);
      stageScale.style.transform = 'scale(' + scale + ')';
      stageScale.style.width = R.PAGE_W + 'px';
      stage.style.height = (lastLayout.pages * R.PAGE_H * scale + 24) + 'px';
      fill(info, el('span', { text: lastLayout.pages + ' page' + (lastLayout.pages > 1 ? 's' : '') + ' A4' + (lastLayout.shrunk ? ' · texte ajusté à ' + Math.round(lastLayout.k * 100) + ' % pour tenir' : '') }),
        doc.kind === 'lm' ? el('span', { text: R.letterWords(data) + ' mots (conseillé : 250 à 400)' }) : el('span', { text: 'Score du CV : ' + R.cvScore(data).score + ' / 100' }));
    };
    const repaint = debounce(paint, 220);
    const resize = new ResizeObserver(debounce(() => paint(), 150));
    resize.observe(stage);
    const changed = () => { data = R.clean(doc.kind, data); doc.data = data; ctx.onChange(); repaint(); };
    const set = (fn) => { fn(data); changed(); };
    const restructure = (fn) => { fn(data); changed(); drawPanel(); };

    // Onglets du panneau
    function drawPanel() {
      const tabs = el('div', { class: 'ot-tabs', role: 'tablist' }, [['content', 'Contenu'], ['look', 'Apparence'], ['spell', 'Correcteur' + (spell.items.length ? ' (' + spell.items.length + ')' : '')]].map(([id, label]) =>
        el('button', { type: 'button', role: 'tab', 'aria-selected': String(tab === id), text: label, onclick: () => { tab = id; drawPanel(); } })));
      const body = tab === 'look' ? look() : tab === 'spell' ? spellPanel() : doc.kind === 'cv' ? cvContent() : lmContent();
      fill(panel, tabs, body);
    }

    // ── CV : contenu
    function photoBox() {
      const input = el('input', { type: 'file', accept: 'image/*', hidden: true, onchange: async () => {
        const file = input.files[0]; input.value = '';
        try { const url = await photoFromFile(file); restructure(d => { d.photo = url; d.photoPos = { x: 50, y: 50 }; }); }
        catch (error) { ctx.notify(error.message); }
      } });
      const prev = el('div', { class: 'ot-photo-prev' }, data.photo ? el('img', { src: data.photo, alt: 'Votre photo' }) : 'Pas de photo');
      if (data.photo) prev.firstChild.style.objectPosition = data.photoPos.x + '% ' + data.photoPos.y + '%';
      const slider = (label, key) => {
        const range = el('input', { type: 'range', min: 0, max: 100, value: data.photoPos[key], 'aria-label': label });
        range.addEventListener('input', () => { set(d => { d.photoPos[key] = Number(range.value); }); prev.firstChild.style.objectPosition = data.photoPos.x + '% ' + data.photoPos.y + '%'; });
        return el('label', { class: 'ot-field' }, el('span', { text: label }), range);
      };
      return el('div', { class: 'ot-photo-box' }, prev, el('div', { class: 'ot-panel' },
        el('div', { class: 'ot-doc-actions' }, el('button', { type: 'button', class: 'ot-mini', text: data.photo ? 'Changer la photo' : 'Importer une photo', onclick: () => input.click() }),
          data.photo ? el('button', { type: 'button', class: 'ot-mini subtle', text: 'Retirer', onclick: () => restructure(d => { d.photo = ''; }) }) : null, input),
        data.photo ? [slider('Cadrage horizontal', 'x'), slider('Cadrage vertical', 'y')] : el('p', { class: 'ot-help', text: 'Photo d’identité récente, de face, sur fond clair. Facultative en France : vous pouvez aussi choisir « sans photo » dans Apparence.' })));
    }
    function identity() {
      const p = data.person;
      const f = (label, key, opts) => field(label, p[key], v => set(d => { d.person[key] = v; }), opts);
      return el('div', { class: 'ot-group' }, el('h3', { text: 'Identité et coordonnées' }), doc.kind === 'cv' ? photoBox() : null,
        el('div', { class: 'ot-row' }, f('Prénom', 'first', { max: 60, spell: false }), f('Nom', 'last', { max: 60, spell: false })),
        doc.kind === 'cv' ? f('Titre sous le nom', 'title', { max: 120, placeholder: 'Ex. : Élève en Bac Pro MELEC · recherche stage PFMP' }) : null,
        el('div', { class: 'ot-row' }, f('E-mail', 'email', { max: 120, type: 'email', spell: false }), f('Téléphone', 'phone', { max: 30, type: 'tel', spell: false, inputmode: 'tel' })),
        f('Adresse', 'address', { max: 160, placeholder: 'N° et rue (facultatif sur un CV)' }),
        el('div', { class: 'ot-row' }, f('Code postal et ville', 'city', { max: 80 }), doc.kind === 'cv' ? f('Âge ou date de naissance (facultatif)', 'birth', { max: 40 }) : null),
        doc.kind === 'cv' ? f('Site ou profil en ligne (facultatif)', 'web', { max: 160, spell: false, placeholder: 'https://…' }) : null);
    }
    function score() {
      const s = R.cvScore(data);
      const meter = el('div', { class: 'ot-meter' }, el('span'));
      meter.firstChild.style.width = s.score + '%';
      return el('div', { class: 'ot-group' }, el('div', { class: 'ot-score' }, el('strong', { text: 'CV complet à ' + s.score + ' %' }), meter),
        s.tips.length ? el('ul', { class: 'ot-tips' }, s.tips.map(t => el('li', { text: t }))) : el('p', { class: 'ot-ok', text: 'Votre CV est complet. Pensez au correcteur avant de l’envoyer.' }));
    }
    const LIST_LABELS = {
      experiences: ['Poste ou mission', 'Entreprise', 'Ex. : Électricien stagiaire (PFMP)'], formation: ['Diplôme ou formation', 'Établissement', 'Ex. : Bac Pro MELEC'],
      projets: ['Réalisation', 'Cadre (atelier, entreprise…)', 'Ex. : Câblage d’un tableau de logement'], engagement: ['Rôle', 'Association ou structure', 'Ex. : Délégué de classe'],
      autre: ['Intitulé', 'Organisme', '']
    };
    function sectionEditor(s) {
      const x = data.sections[s.id];
      const parts = [field('Titre de la rubrique', x.title, v => set(d => { d.sections[s.id].title = v; }), { max: 60, placeholder: s.label }), el('p', { class: 'ot-help', text: s.help })];
      if (s.type === 'text') parts.push(field('Texte', x.text, v => set(d => { d.sections[s.id].text = v; }), { area: true, rows: 5, max: 1200, count: 450, hint: 'Conseil : 300 à 450 caractères. Une ligne commençant par « - » devient une puce.' }));
      if (s.type === 'list') {
        const [t, o, ph] = LIST_LABELS[s.id] || LIST_LABELS.autre;
        x.items.forEach((item, index) => {
          const f = (label, key, opts) => field(label, item[key], v => set(d => { d.sections[s.id].items[index][key] = v; }), opts);
          parts.push(el('div', { class: 'ot-item' }, f(t, 'title', { max: 160, placeholder: ph }),
            el('div', { class: 'ot-row' }, f(o, 'org', { max: 120 }), f('Ville', 'place', { max: 80 })),
            el('div', { class: 'ot-row' }, f('Début', 'start', { max: 30, placeholder: 'Ex. : mai 2026' }), f('Fin', 'end', { max: 30, placeholder: 'Ex. : juin 2026 ou « en cours »' })),
            f('Missions et résultats', 'desc', { area: true, rows: 4, max: 900, count: 400, hint: 'Une mission par ligne commençant par « - », avec un verbe d’action : « - Câblage de 12 tableaux de logements neufs ».' }),
            el('div', { class: 'ot-item-tools' },
              el('button', { type: 'button', text: '▲', 'aria-label': 'Monter', disabled: index === 0, onclick: () => restructure(d => { const l = d.sections[s.id].items; [l[index - 1], l[index]] = [l[index], l[index - 1]]; }) }),
              el('button', { type: 'button', text: '▼', 'aria-label': 'Descendre', disabled: index === x.items.length - 1, onclick: () => restructure(d => { const l = d.sections[s.id].items; [l[index + 1], l[index]] = [l[index], l[index + 1]]; }) }),
              el('button', { type: 'button', class: 'warn', text: 'Supprimer', onclick: () => restructure(d => { d.sections[s.id].items.splice(index, 1); }) }))));
        });
        if (x.items.length < 12) parts.push(el('button', { type: 'button', class: 'ot-mini', text: '＋ Ajouter', onclick: () => restructure(d => { d.sections[s.id].items.push(R.emptyItem()); }) }));
      }
      if (s.type === 'refs') {
        x.items.forEach((item, index) => {
          const f = (label, key, opts) => field(label, item[key], v => set(d => { d.sections[s.id].items[index][key] = v; }), opts);
          parts.push(el('div', { class: 'ot-item' }, el('div', { class: 'ot-row' }, f('Nom', 'name', { max: 80, spell: false }), f('Fonction', 'role', { max: 100 })),
            el('div', { class: 'ot-row' }, f('Entreprise', 'org', { max: 100 }), f('Téléphone ou e-mail', 'contact', { max: 120, spell: false })),
            el('div', { class: 'ot-item-tools' }, el('button', { type: 'button', class: 'warn', text: 'Supprimer', onclick: () => restructure(d => { d.sections[s.id].items.splice(index, 1); }) }))));
        });
        if (x.items.length < 4) parts.push(el('button', { type: 'button', class: 'ot-mini', text: '＋ Ajouter une référence', onclick: () => restructure(d => { d.sections[s.id].items.push({ name: '', role: '', org: '', contact: '' }); }) }));
        parts.push(el('p', { class: 'ot-help', text: 'Demandez toujours l’accord de la personne avant de la citer.' }));
      }
      if (s.type === 'tags') {
        x.tags.forEach((tag, index) => parts.push(el('div', { class: 'ot-level-row', style: 'grid-template-columns:1fr auto' },
          el('input', { value: tag, maxlength: 120, 'aria-label': s.label + ' ' + (index + 1), spellcheck: 'true', lang: 'fr', oninput: e => set(d => { d.sections[s.id].tags[index] = e.target.value; }) }),
          el('button', { type: 'button', class: 'ot-mini warn', text: '×', 'aria-label': 'Retirer', onclick: () => restructure(d => { d.sections[s.id].tags.splice(index, 1); }) }))));
        if (x.tags.length < 16) parts.push(el('button', { type: 'button', class: 'ot-mini', text: '＋ Ajouter', onclick: () => restructure(d => { d.sections[s.id].tags.push('Nouvel élément'); }) }));
        if (R.SUGGESTIONS[s.id]) parts.push(el('p', { class: 'ot-help', text: 'Suggestions (cliquez pour ajouter ou retirer) :' }),
          chips(R.SUGGESTIONS[s.id].map(v => [v, v]), v => x.tags.includes(v), v => restructure(d => { const l = d.sections[s.id].tags; const i = l.indexOf(v); if (i >= 0) l.splice(i, 1); else if (l.length < 16) l.push(v); }), 'Suggestions'));
      }
      if (s.type === 'levels') {
        x.levels.forEach((lv, index) => parts.push(el('div', { class: 'ot-level-row' },
          el('input', { value: lv.label, maxlength: 80, 'aria-label': 'Intitulé', spellcheck: 'true', lang: 'fr', oninput: e => set(d => { d.sections[s.id].levels[index].label = e.target.value; }) }),
          el('select', { 'aria-label': 'Niveau', onchange: e => set(d => { d.sections[s.id].levels[index].level = Number(e.target.value); }) }, [1, 2, 3, 4, 5].map(n => el('option', { value: n, text: n + ' · ' + R.LEVEL_NAMES[n], selected: lv.level === n }))),
          el('input', { value: lv.detail, maxlength: 40, placeholder: s.id === 'langues' ? 'Ex. : B1' : 'Précision (facultatif)', 'aria-label': 'Précision', oninput: e => set(d => { d.sections[s.id].levels[index].detail = e.target.value; }) }),
          el('button', { type: 'button', class: 'ot-mini warn', text: '×', 'aria-label': 'Retirer', onclick: () => restructure(d => { d.sections[s.id].levels.splice(index, 1); }) }))));
        if (x.levels.length < 14) parts.push(el('button', { type: 'button', class: 'ot-mini', text: '＋ Ajouter', onclick: () => restructure(d => { d.sections[s.id].levels.push({ label: '', level: 3, detail: '' }); }) }));
        if (R.SUGGESTIONS[s.id]) parts.push(el('p', { class: 'ot-help', text: 'Suggestions :' }),
          chips(R.SUGGESTIONS[s.id].map(v => [v, v]), v => x.levels.some(l => l.label === v), v => restructure(d => { const l = d.sections[s.id].levels; const i = l.findIndex(e => e.label === v); if (i >= 0) l.splice(i, 1); else if (l.length < 14) l.push({ label: v, level: 3, detail: '' }); }), 'Suggestions'));
      }
      return parts;
    }
    function sectionRows(defs, order, isOn, toggle, move, editor, label) {
      const on = order.filter(id => isOn(id)), off = order.filter(id => !isOn(id));
      return el('div', { class: 'ot-group' }, el('h3', { text: label + ' (' + on.length + ' affichées)' }),
        el('p', { class: 'ot-help', text: 'Activez, masquez ou déplacez chaque rubrique ; cliquez sur son nom pour la remplir.' }),
        on.map((id, index) => {
          const s = defs.find(x => x.id === id);
          const open = openSection === id;
          const title = (doc.kind === 'cv' ? (data.sections[id].title || '').trim() : '') || s.label;
          return el('div', { class: 'ot-sec' + (open ? ' open' : '') },
            el('div', { class: 'ot-sec-head' }, switchBtn(true, 'Masquer « ' + title + ' »', () => toggle(id)),
              el('button', { type: 'button', class: 'ot-sec-name', 'aria-expanded': String(open), text: title, onclick: () => { openSection = open ? '' : id; drawPanel(); } }),
              el('button', { type: 'button', text: '▲', 'aria-label': 'Monter « ' + title + ' »', disabled: index === 0, onclick: () => move(id, on[index - 1]) }),
              el('button', { type: 'button', text: '▼', 'aria-label': 'Descendre « ' + title + ' »', disabled: index === on.length - 1, onclick: () => move(id, on[index + 1]) })),
            open ? el('div', { class: 'ot-sec-body' }, editor(s)) : null);
        }),
        off.length ? [el('p', { class: 'ot-help', text: 'Rubriques masquées — cliquez pour les ajouter :' }),
          el('div', { class: 'ot-chips' }, off.map(id => el('button', { type: 'button', text: '＋ ' + defs.find(x => x.id === id).label, onclick: () => { openSection = id; toggle(id); } })))] : null);
    }
    const swap = (list, a, b) => { const i = list.indexOf(a), j = list.indexOf(b); if (i >= 0 && j >= 0) [list[i], list[j]] = [list[j], list[i]]; };
    function cvContent() {
      return [score(), identity(), sectionRows(R.CV_SECTIONS, data.order, id => data.sections[id].on,
        id => restructure(d => { d.sections[id].on = !d.sections[id].on; }), (a, b) => restructure(d => swap(d.order, a, b)), sectionEditor, 'Rubriques')];
    }

    // ── Lettre : contenu
    function fillFromType(onlyEmpty) {
      const type = R.LETTER_TYPES[data.type];
      restructure(d => {
        if (!onlyEmpty || !d.object.trim()) d.object = type.object;
        for (const b of R.LETTER_BLOCKS) {
          const model = b.id === 'accroche' ? type.accroche : b.model;
          if (model && (!onlyEmpty || !d.blocks[b.id].text.trim())) d.blocks[b.id].text = model;
        }
      });
    }
    async function copyFromCv(id, what) {
      try {
        const cv = await ctx.loadDoc(id);
        if (!cv) return;
        restructure(d => {
          if (what === 'person') { for (const k of ['first', 'last', 'email', 'phone', 'address', 'city', 'title']) d.person[k] = cv.data.person[k] || d.person[k]; }
          else { d.theme = cv.data.theme; d.accent = cv.data.accent; d.font = cv.data.font; }
        });
        ctx.notify(what === 'person' ? 'Coordonnées reprises du CV.' : 'Thème, couleur et police repris du CV.');
      } catch (error) { ctx.notify(error.message); }
    }
    function cvPicker(label, what) {
      const list = ctx.cvList();
      if (!list.length) return null;
      const select = el('select', { 'aria-label': label }, el('option', { value: '', text: label + '…' }), list.map(c => el('option', { value: c.id, text: c.title || 'CV' })));
      select.addEventListener('change', () => { if (select.value) copyFromCv(select.value, what); select.value = ''; });
      return select;
    }
    function lmContent() {
      const words = R.letterWords(data);
      const placeholders = (JSON.stringify(data.blocks) + data.object).match(/\[[^\]]{2,60}\]/g) || [];
      const typeGroup = el('div', { class: 'ot-group' }, el('h3', { text: 'Type de lettre' }),
        chips(Object.entries(R.LETTER_TYPES).map(([id, t]) => [id, t.name]), v => data.type === v, v => restructure(d => { d.type = v; }), 'Type de lettre'),
        el('div', { class: 'ot-doc-actions' },
          el('button', { type: 'button', class: 'ot-mini', text: 'Remplir les blocs vides avec le modèle', onclick: () => fillFromType(true) }),
          el('button', { type: 'button', class: 'ot-mini subtle', text: 'Tout remplacer par le modèle', onclick: () => { if (confirm('Remplacer tout le texte de la lettre par le modèle « ' + R.LETTER_TYPES[data.type].name + ' » ?')) fillFromType(false); } })),
        el('p', { class: words > 400 || (words && words < 150) ? 'ot-warn' : 'ot-help', text: words + ' mots. Une bonne lettre compte 250 à 400 mots et tient sur une page.' }),
        placeholders.length ? el('p', { class: 'ot-warn', text: 'À compléter avant l’envoi : ' + [...new Set(placeholders)].slice(0, 6).join(', ') + '.' }) : null);
      const p = data.person, rc = data.recipient;
      const who = el('div', { class: 'ot-group' }, el('h3', { text: 'Mes coordonnées' }), cvPicker('Reprendre les coordonnées d’un CV', 'person'),
        el('div', { class: 'ot-row' }, field('Prénom', p.first, v => set(d => { d.person.first = v; }), { max: 60, spell: false }), field('Nom', p.last, v => set(d => { d.person.last = v; }), { max: 60, spell: false })),
        field('Adresse', p.address, v => set(d => { d.person.address = v; }), { max: 160 }),
        el('div', { class: 'ot-row' }, field('Code postal et ville', p.city, v => set(d => { d.person.city = v; }), { max: 80 }), field('Téléphone', p.phone, v => set(d => { d.person.phone = v; }), { max: 30, type: 'tel', spell: false })),
        field('E-mail', p.email, v => set(d => { d.person.email = v; }), { max: 120, type: 'email', spell: false }));
      const to = el('div', { class: 'ot-group' }, el('h3', { text: 'Destinataire, lieu, date et objet' }),
        field('Entreprise', rc.company, v => set(d => { d.recipient.company = v; }), { max: 120 }),
        el('div', { class: 'ot-row' }, field('Service', rc.service, v => set(d => { d.recipient.service = v; }), { max: 120, placeholder: 'Ex. : Service recrutement' }), field('À l’attention de', rc.contact, v => set(d => { d.recipient.contact = v; }), { max: 120, placeholder: 'Ex. : Madame Durand' })),
        field('Adresse', rc.address, v => set(d => { d.recipient.address = v; }), { max: 160 }), field('Code postal et ville', rc.city, v => set(d => { d.recipient.city = v; }), { max: 80 }),
        el('div', { class: 'ot-row' }, field('Fait à', data.place, v => set(d => { d.place = v; }), { max: 60, placeholder: 'Votre ville' }), field('Date', data.date, v => set(d => { d.date = v; }), { max: 40, placeholder: 'Vide = date du jour' })),
        field('Objet', data.object, v => set(d => { d.object = v; }), { max: 200, placeholder: R.LETTER_TYPES[data.type].object }),
        field('Référence de l’offre', data.ref, v => set(d => { d.ref = v; }), { max: 80, placeholder: 'Ex. : n° 48213 (si annonce)', spell: false }));
      const blocks = sectionRows(R.LETTER_BLOCKS, data.order, id => data.blocks[id].on, id => restructure(d => { d.blocks[id].on = !d.blocks[id].on; }), (a, b) => restructure(d => swap(d.order, a, b)), b => {
        const area = field('Texte', data.blocks[b.id].text, v => set(d => { d.blocks[b.id].text = v; }), { area: true, rows: b.id === 'appel' ? 1 : 5, max: 1500, count: b.id === 'appel' || b.id === 'politesse' ? 0 : 700 });
        const ta = area.querySelector('textarea');
        const insert = tip => { const v = ta.value; const at = ta.selectionStart ?? v.length; ta.value = v ? v.slice(0, at) + (at && !/\s$/.test(v.slice(0, at)) ? ' ' : '') + tip.replace(/…$/, '') + v.slice(at) : tip.replace(/…$/, ''); ta.dispatchEvent(new Event('input')); ta.focus(); };
        const model = b.id === 'accroche' ? R.LETTER_TYPES[data.type].accroche : b.model;
        return [b.help ? el('p', { class: 'ot-help', text: b.help }) : null, area,
          el('p', { class: 'ot-help', text: 'Débuts de phrases (cliquez pour insérer) :' }), el('div', { class: 'ot-chips' }, (b.tips || []).map(t => el('button', { type: 'button', text: t, onclick: () => insert(t) }))),
          model ? el('button', { type: 'button', class: 'ot-mini subtle', text: 'Utiliser le texte d’exemple', onclick: () => { ta.value = model; ta.dispatchEvent(new Event('input')); } }) : null];
      }, 'Paragraphes');
      const show = data.show;
      const options = el('div', { class: 'ot-group' }, el('h3', { text: 'Éléments de la page' }),
        R.LETTER_OPTIONAL.map(o => el('div', { class: 'ot-sec-head' }, switchBtn(show[o.id], (show[o.id] ? 'Masquer ' : 'Afficher ') + o.label, () => restructure(d => { d.show[o.id] = !d.show[o.id]; })), el('span', { text: o.label }))),
        show.ps ? field('P.-S.', data.ps, v => set(d => { d.ps = v; }), { area: true, rows: 2, max: 400 }) : null,
        show.pj ? field('Mention des pièces jointes', data.pj, v => set(d => { d.pj = v; }), { max: 120 }) : null);
      return [typeGroup, who, to, blocks, options, show.signature ? signatureGroup() : null];
    }
    function signatureGroup() {
      const s = data.sign;
      const parts = [el('h3', { text: 'Signature' }), chips([['typed', 'Nom écrit'], ['drawn', 'Signer au doigt ou à la souris'], ['image', 'Importer une image']], v => s.mode === v, v => restructure(d => { d.sign.mode = v; }), 'Signature')];
      if (s.mode === 'drawn') {
        const pad = el('canvas', { class: 'ot-pad', width: 600, height: 200, 'aria-label': 'Zone de signature' });
        const g = pad.getContext('2d');
        g.lineWidth = 3.2; g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#13243a';
        if (s.image) { const img = new Image(); img.onload = () => g.drawImage(img, (600 - img.width) / 2, (200 - img.height) / 2); img.src = s.image; }
        let drawing = false, drawn = false;
        const pos = e => { const r = pad.getBoundingClientRect(); return [(e.clientX - r.left) * 600 / r.width, (e.clientY - r.top) * 200 / r.height]; };
        pad.addEventListener('pointerdown', e => { drawing = true; drawn = true; pad.setPointerCapture(e.pointerId); g.beginPath(); g.moveTo(...pos(e)); });
        pad.addEventListener('pointermove', e => { if (!drawing) return; g.lineTo(...pos(e)); g.stroke(); });
        const end = () => { drawing = false; };
        pad.addEventListener('pointerup', end); pad.addEventListener('pointercancel', end);
        parts.push(pad, el('div', { class: 'ot-doc-actions' },
          el('button', { type: 'button', class: 'ot-mini', text: 'Valider la signature', onclick: () => { if (!drawn && s.image) return; const cut = trimCanvas(pad); if (!cut) { ctx.notify('Signez dans le cadre blanc.'); return; } const url = cut.toDataURL('image/png'); if (url.length > 115000) { ctx.notify('Signature trop chargée : effacez et recommencez plus simplement.'); return; } restructure(d => { d.sign.image = url; }); ctx.notify('Signature enregistrée.'); } }),
          el('button', { type: 'button', class: 'ot-mini subtle', text: 'Effacer', onclick: () => { g.clearRect(0, 0, 600, 200); drawn = false; restructure(d => { d.sign.image = ''; }); } })));
      } else if (s.mode === 'image') {
        const input = el('input', { type: 'file', accept: 'image/*', hidden: true, onchange: async () => { const file = input.files[0]; input.value = ''; try { const url = await signatureFromFile(file); restructure(d => { d.sign.image = url; }); } catch (error) { ctx.notify(error.message); } } });
        parts.push(el('p', { class: 'ot-help', text: 'Photo de votre signature à l’encre foncée sur une feuille blanche : le fond blanc est retiré automatiquement.' }),
          el('div', { class: 'ot-doc-actions' }, el('button', { type: 'button', class: 'ot-mini', text: s.image ? 'Changer l’image' : 'Choisir une image', onclick: () => input.click() }), s.image ? el('button', { type: 'button', class: 'ot-mini subtle', text: 'Retirer', onclick: () => restructure(d => { d.sign.image = ''; }) }) : null, input));
      } else parts.push(el('p', { class: 'ot-help', text: 'Votre prénom et votre nom sont écrits en italique à la place de la signature.' }));
      return el('div', { class: 'ot-group' }, parts);
    }

    // ── Apparence (CV et lettre)
    function look() {
      const r = R.resolved(data);
      const layouts = doc.kind === 'cv' ? R.LAYOUTS : R.LETTER_LAYOUTS;
      const sheetId = id => doc.kind === 'lm' && (id === 'bandeau' || id === 'lateral') ? id + '-lm' : id;
      const layoutGroup = el('div', { class: 'ot-group' }, el('h3', { text: doc.kind === 'cv' ? 'Organisation du CV' : 'Organisation de la lettre' }),
        el('div', { class: 'ot-tiles' }, layouts.map(l => el('button', { type: 'button', class: 'ot-tile', 'aria-pressed': String(data.layout === l.id), title: l.hint, onclick: () => restructure(d => { d.layout = l.id; }) },
          sheet(sheetId(l.id), r.accent), el('strong', { text: l.name }), el('small', { text: l.hint })))));
      const themes = R.THEMES.filter(t => !themeFilter || t.level === themeFilter || (themeFilter === 'ATS' && t.ats));
      const themeGroup = el('div', { class: 'ot-group' }, el('h3', { text: 'Thème (12)' }),
        chips([['', 'Tous'], ...R.THEME_LEVELS.map(l => [l, l]), ['ATS', 'Compatibles ATS']], v => themeFilter === v, v => { themeFilter = v; drawPanel(); }, 'Filtrer les thèmes'),
        doc.kind === 'lm' ? cvPicker('Assortir à un de mes CV', 'theme') : null,
        el('div', { class: 'ot-tiles' }, themes.map(t => {
          const tile = el('button', { type: 'button', class: 'ot-tile', 'aria-pressed': String(data.theme === t.id), title: t.desc, onclick: () => restructure(d => { d.theme = t.id; d.accent = ''; }) },
            sheet(doc.kind === 'cv' ? (data.layout || 'lateral') : sheetId(data.layout), t.accent), el('strong', { text: t.name + (t.ats ? ' · ATS' : '') }), el('small', { text: t.level }));
          const side = tile.querySelector('.ot-tile-sheet span');
          if (side && doc.kind === 'cv' && (data.layout === 'lateral' || data.layout === 'lateral-d')) side.style.background = t.side === '#ffffff' ? '#eef1f5' : t.side;
          return tile;
        })),
        el('p', { class: 'ot-help', text: (R.THEMES.find(t => t.id === data.theme) || {}).desc || '' }));
      const color = el('input', { type: 'color', value: r.accent, 'aria-label': 'Autre couleur', onchange: e => restructure(d => { d.accent = e.target.value; }) });
      const custom = el('div', { class: 'ot-group' }, el('h3', { text: 'Personnaliser' }),
        el('div', { class: 'ot-field' }, el('span', { text: 'Couleur d’accent' }), el('div', { class: 'ot-swatches' }, R.ACCENTS.map(([value, name]) => {
          const b = el('button', { type: 'button', class: 'ot-swatch', title: name, 'aria-label': name, 'aria-pressed': String(data.accent === value), onclick: () => restructure(d => { d.accent = value; }) });
          b.style.setProperty('--sw', value || (R.THEMES.find(t => t.id === data.theme) || {}).accent);
          if (!value) b.textContent = '↺';
          return b;
        }), color)),
        el('div', { class: 'ot-field' }, el('span', { text: 'Police' }), chips(Object.entries(R.FONT_LABELS), v => data.font === v, v => restructure(d => { d.font = v; }), 'Police')),
        doc.kind === 'cv' ? [
          el('div', { class: 'ot-field' }, el('span', { text: 'Photo' }), chips([['', 'Comme le thème'], ['round', 'Ronde'], ['rounded', 'Coins arrondis'], ['square', 'Carrée'], ['none', 'Sans photo']], v => data.photoShape === v, v => restructure(d => { d.photoShape = v; }), 'Forme de la photo')),
          el('div', { class: 'ot-field' }, el('span', { text: 'Niveaux' }), chips([['bars', 'Barres'], ['dots', 'Points'], ['text', 'Texte (ATS)']], v => data.levelStyle === v, v => restructure(d => { d.levelStyle = v; }), 'Affichage des niveaux')),
          el('div', { class: 'ot-field' }, el('span', { text: 'Densité' }), chips([['airy', 'Aérée'], ['normal', 'Normale'], ['compact', 'Compacte']], v => data.density === v, v => restructure(d => { d.density = v; }), 'Densité')),
          el('div', { class: 'ot-sec-head' }, switchBtn(data.fit, 'Ajuster automatiquement sur une page', () => restructure(d => { d.fit = !d.fit; })), el('span', { text: 'Ajuster automatiquement le texte pour tenir sur une page' }))
        ] : el('div', { class: 'ot-field' }, el('span', { text: 'Alignement du texte' }), chips([[true, 'Justifié'], [false, 'Aligné à gauche']], v => data.justify === v, v => restructure(d => { d.justify = v; }), 'Alignement')));
      return [layoutGroup, themeGroup, custom];
    }

    // ── Correcteur
    function spellFields() {
      const out = [];
      const add = (label, get, setter) => out.push({ label, get, set: setter });
      if (doc.kind === 'cv') {
        add('Titre sous le nom', () => data.person.title, v => { data.person.title = v; });
        for (const id of data.order) {
          const s = R.CV_SECTIONS.find(x => x.id === id), x = data.sections[id];
          if (!x.on) continue;
          const name = (x.title || '').trim() || s.label;
          const sec = () => data.sections[id];
          if (x.title) add(name + ' · titre', () => sec().title, v => { sec().title = v; });
          if (s.type === 'text') add(name, () => sec().text, v => { sec().text = v; });
          if (s.type === 'list') x.items.forEach((item, i) => { for (const k of ['title', 'desc']) add(name + ' · ' + (i + 1) + (k === 'desc' ? ' (missions)' : ''), () => sec().items[i]?.[k] || '', v => { sec().items[i][k] = v; }); });
          if (s.type === 'refs') x.items.forEach((item, i) => add(name, () => sec().items[i]?.role || '', v => { sec().items[i].role = v; }));
          if (s.type === 'tags') x.tags.forEach((t, i) => add(name, () => sec().tags[i] || '', v => { sec().tags[i] = v; }));
          if (s.type === 'levels') x.levels.forEach((l, i) => add(name, () => sec().levels[i]?.label || '', v => { sec().levels[i].label = v; }));
        }
      } else {
        add('Objet', () => data.object, v => { data.object = v; });
        for (const id of data.order) {
          const b = R.LETTER_BLOCKS.find(x => x.id === id);
          if (data.blocks[id].on) add(b.label, () => data.blocks[id].text, v => { data.blocks[id].text = v; });
        }
        if (data.show.ps) add('P.-S.', () => data.ps, v => { data.ps = v; });
      }
      return out;
    }
    async function runSpell() {
      spell = { ...spell, state: 'busy', error: '', items: [] };
      drawPanel();
      try {
        const items = await checkTexts(spellFields());
        spell.items = items.filter(m => !spell.ignored.has(m.rule + '|' + m.wrong));
        spell.state = 'done';
      } catch (error) { spell.state = 'error'; spell.error = error.message; }
      drawPanel();
    }
    function applyFix(item, value) {
      const text = item.field.get();
      if (text.slice(item.offset, item.offset + item.length) !== item.wrong) { ctx.notify('Ce passage a changé : relancez la vérification.'); return; }
      item.field.set(text.slice(0, item.offset) + value + text.slice(item.offset + item.length));
      const delta = value.length - item.length;
      spell.items = spell.items.filter(m => m !== item);
      for (const m of spell.items) if (m.field === item.field && m.offset > item.offset) m.offset += delta;
      changed(); drawPanel();
    }
    function spellPanel() {
      const head = el('div', { class: 'ot-group' }, el('h3', { text: 'Correcteur d’orthographe et de grammaire' }),
        el('p', { class: 'ot-help', text: 'Vérifie l’orthographe, les accords, la conjugaison, la ponctuation et les tournures de tout le document. Cliquez sur une proposition pour corriger. Le texte des rubriques est analysé par le service LanguageTool (Union européenne) ; votre nom et vos coordonnées ne sont pas envoyés.' }),
        el('button', { type: 'button', class: 'portal-button', disabled: spell.state === 'busy', text: spell.state === 'busy' ? 'Vérification en cours…' : spell.state === 'idle' ? 'Vérifier mon document' : 'Relancer la vérification', onclick: runSpell }));
      if (spell.state === 'error') return [head, el('p', { class: 'ot-warn', text: spell.error })];
      if (spell.state === 'done' && !spell.items.length) return [head, el('p', { class: 'ot-ok', text: 'Aucune faute détectée. Relisez quand même à voix haute : aucun correcteur ne remplace une relecture.' })];
      if (!spell.items.length) return [head];
      const counts = spell.items.reduce((acc, m) => { acc[m.label] = (acc[m.label] || 0) + 1; return acc; }, {});
      return [head, el('p', { class: 'ot-help', text: spell.items.length + ' point(s) à revoir : ' + Object.entries(counts).map(([k, n]) => k.toLowerCase() + ' ' + n).join(', ') + '.' }),
        el('div', { class: 'ot-spell' }, spell.items.map(m => {
          const text = m.field.get();
          const from = Math.max(0, text.lastIndexOf(' ', Math.max(0, m.offset - 40)));
          const to = text.indexOf(' ', Math.min(text.length, m.offset + m.length + 40));
          const end = to < 0 ? text.length : to;
          return el('div', { class: 'ot-spell-item k-' + m.cls },
            el('span', { class: 'ot-spell-where', text: m.label + ' · ' + m.field.label }),
            el('p', { class: 'ot-spell-ctx' }, (from > 0 ? '…' : '') + text.slice(from, m.offset).trimStart(), el('mark', { text: m.wrong }), text.slice(m.offset + m.length, end) + (end < text.length ? '…' : '')),
            el('p', { class: 'ot-spell-msg', text: m.message }),
            el('div', { class: 'ot-spell-fix' }, m.replacements.map(v => el('button', { type: 'button', class: 'ot-fix', text: '✓ ' + (v || '(supprimer)'), onclick: () => applyFix(m, v) })),
              el('button', { type: 'button', class: 'subtle', text: 'Ignorer', onclick: () => { spell.ignored.add(m.rule + '|' + m.wrong); spell.items = spell.items.filter(x => x !== m); drawPanel(); } })));
        }))];
    }

    drawPanel();
    paint();
    return {
      node: el('div', { class: 'ot-editor' }, panel, preview),
      layoutInfo: () => lastLayout,
      destroy: () => resize.disconnect(),
      warnings: () => {
        const list = [];
        if (doc.kind === 'lm') {
          const ph = (JSON.stringify(data.blocks) + data.object).match(/\[[^\]]{2,60}\]/g);
          if (ph) list.push('Il reste des passages entre crochets à compléter : ' + [...new Set(ph)].slice(0, 4).join(', ') + '.');
          const w = R.letterWords(data);
          if (w > 420) list.push('La lettre est longue (' + w + ' mots) : visez 250 à 400 mots.');
        } else if (R.cvScore(data).score < 50) list.push('Le CV est encore incomplet (' + R.cvScore(data).score + ' %).');
        if (lastLayout.pages > 1 && doc.kind === 'lm') list.push('La lettre dépasse une page.');
        return list;
      }
    };
  }

  // ───── Espace élève ─────
  function initStudent() {
    const tabs = document.getElementById('studentContentTabs');
    const dashboard = document.getElementById('studentDashboard');
    const tp = document.getElementById('studentTpPane');
    const api = window.MelecPortal;
    if (!tabs || !dashboard || !tp || !api) return;
    const button = el('button', { type: 'button', id: 'studentToolsTab', text: 'Mes outils' });
    tabs.append(button);
    const message = el('p', { class: 'portal-small', role: 'status', 'aria-live': 'polite' });
    const content = el('div', { class: 'ot-space' });
    const pane = el('section', { id: 'studentToolsPane', class: 'student-pane ot-pane' }, el('h2', { text: 'Mes outils · CV et lettres de motivation' }), message, content);
    pane.hidden = true;
    dashboard.append(pane);
    let docs = [], current = null, editor = null, saveTimer = null, saving = Promise.resolve(), dirty = false, requestId = 0, statusLine = null, me = null;
    const notify = text => { message.textContent = text; };

    async function whoAmI() {
      if (me) return me;
      const id = await api.userId();
      let first = '', last = '', email = '';
      try { const rows = await api.rest('student_profiles?user_id=eq.' + encodeURIComponent(id) + '&select=first_name,last_name'); first = rows[0]?.first_name || ''; last = rows[0]?.last_name || ''; } catch { /* profil indisponible */ }
      try { email = (await api.user())?.email || ''; } catch { /* e-mail indisponible */ }
      me = { id, first, last, email };
      return me;
    }
    function close() { flush(); editor?.destroy(); editor = null; pane.hidden = true; button.classList.remove('active'); }
    const tpRunning = () => tabs.dataset.tpActive === 'true';
    async function open() {
      if (tpRunning()) { button.classList.add('active'); pane.hidden = false; pane.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
      else {
        tp.hidden = true;
        dashboard.querySelectorAll('.student-pane').forEach(other => { if (other !== pane) other.hidden = true; });
        tabs.querySelectorAll('button').forEach(other => other.classList.toggle('active', other === button));
        pane.hidden = false;
      }
      PDF.loadFonts(); PDF.pageSheet().catch(() => {});
      await showList();
    }
    async function loadList() {
      const user = await whoAmI();
      docs = await api.rest(TABLE + '?student_id=eq.' + encodeURIComponent(user.id) + '&select=' + LIST_FIELDS + '&order=updated_at.desc');
    }
    async function loadDoc(id) {
      const row = (await api.rest(TABLE + '?id=eq.' + encodeURIComponent(id) + '&select=*'))[0];
      if (!row) return null;
      row.data = R.clean(row.kind, row.data);
      return row;
    }
    async function showList(note) {
      const ticket = ++requestId;
      await flush();
      editor?.destroy(); editor = null; current = null;
      notify('Chargement de vos documents…');
      try { await loadList(); } catch (error) { if (ticket === requestId) notify('Documents indisponibles : ' + error.message); return; }
      if (ticket !== requestId || pane.hidden) return;
      notify(note || (docs.length ? 'Vos documents sont enregistrés automatiquement sur votre compte.' : 'Créez votre premier CV ou votre première lettre de motivation.'));
      const create = el('div', { class: 'ot-intro' },
        el('button', { type: 'button', class: 'ot-new', onclick: () => createDoc('cv') }, el('strong', { text: '＋ Nouveau CV' }), el('span', { text: '7 organisations et 12 thèmes, du plus sobre au plus professionnel, photo d’identité, rubriques à la carte.' })),
        el('button', { type: 'button', class: 'ot-new', onclick: () => createDoc('lm') }, el('strong', { text: '＋ Nouvelle lettre de motivation' }), el('span', { text: 'Stage, apprentissage, emploi, candidature spontanée… avec modèle guidé et signature.' })));
      const list = el('div', { class: 'ot-list' }, docs.map(row => el('div', { class: 'ot-doc' },
        el('span', { class: 'ot-doc-title', text: row.title || KIND[row.kind] }),
        el('span', { class: 'ot-doc-meta' }, el('span', { text: KIND[row.kind] + ' · modifié le ' + dateFr.format(new Date(row.updated_at)) }), statusChip(row.review_status)),
        row.teacher_comment ? el('span', { class: 'ot-doc-meta', text: '💬 ' + row.teacher_comment.slice(0, 120) + (row.teacher_comment.length > 120 ? '…' : '') }) : null,
        el('div', { class: 'ot-doc-actions' },
          el('button', { type: 'button', text: 'Ouvrir', onclick: () => showDoc(row.id) }),
          el('button', { type: 'button', class: 'subtle', text: 'PDF', onclick: async e => { e.target.disabled = true; try { const full = await loadDoc(row.id); if (full) { await PDF.download(full.data, full.kind, { title: full.title, author: [full.data.person.first, full.data.person.last].join(' ') }); } } catch (error) { notify('PDF impossible : ' + error.message); } e.target.disabled = false; } }),
          el('button', { type: 'button', class: 'subtle', text: 'Dupliquer', onclick: () => duplicate(row) }),
          el('button', { type: 'button', class: 'warn', text: 'Supprimer', onclick: () => remove(row) })))));
      fill(content, create, docs.length ? [el('h3', { text: 'Mes documents (' + docs.length + ')' }), list] : null);
    }
    async function createDoc(kind, base) {
      try {
        const who = await whoAmI();
        const data = base ? R.clean(kind, base) : kind === 'cv' ? R.newCv(who) : R.newLetter(who);
        if (!base && kind === 'lm') {
          // Lettre : coordonnées et thème repris du CV le plus récent.
          const cv = docs.find(d => d.kind === 'cv');
          if (cv) { const full = await loadDoc(cv.id).catch(() => null); if (full) { Object.assign(data.person, { ...data.person, ...Object.fromEntries(Object.entries(full.data.person).filter(([k, v]) => v && k in data.person)) }); data.theme = full.data.theme; data.accent = full.data.accent; data.font = full.data.font; } }
        }
        const rows = await api.rest(TABLE + '?select=id', { method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify({ kind, title: defaultTitle(kind, data), data }) });
        await showDoc(rows[0].id);
      } catch (error) { notify('Création impossible : ' + error.message); }
    }
    async function duplicate(row) {
      try { const full = await loadDoc(row.id); if (!full) return; await createDoc(full.kind, full.data); notify('Copie créée : adaptez-la à la nouvelle candidature.'); }
      catch (error) { notify('Copie impossible : ' + error.message); }
    }
    async function remove(row) {
      if (!confirm('Supprimer définitivement « ' + (row.title || KIND[row.kind]) + ' » ? Cette action est irréversible.')) return;
      try { await api.rest(TABLE + '?id=eq.' + encodeURIComponent(row.id), { method: 'DELETE' }); await showList('Document supprimé.'); }
      catch (error) { notify('Suppression impossible : ' + error.message); }
    }
    async function showDoc(id) {
      const ticket = ++requestId;
      await flush();
      notify('Ouverture…');
      let row;
      try { row = await loadDoc(id); } catch (error) { notify('Document indisponible : ' + error.message); return; }
      if (!row) { notify('Ce document n’existe plus.'); return showList(); }
      if (ticket !== requestId || pane.hidden) return;
      editor?.destroy();
      current = row; dirty = false;
      notify('');
      statusLine = el('span', { class: 'ot-help', role: 'status', text: 'Enregistré' });
      const title = el('input', { value: row.title, maxlength: 120, 'aria-label': 'Nom du document', class: 'ot-title-input', oninput: e => { row.title = e.target.value; markDirty(); } });
      const chip = statusChip(row.review_status);
      const sendBtn = el('button', { type: 'button', class: 'subtle', text: row.review_status === 'submitted' ? 'Envoyé ✓ (renvoyer)' : 'Envoyer à l’enseignant', onclick: async () => {
        const warn = editor.warnings();
        if (warn.length && !confirm(warn.join('\n') + '\n\nEnvoyer quand même à votre enseignant ?')) return;
        await flush();
        try {
          const rows = await api.rest(TABLE + '?id=eq.' + encodeURIComponent(row.id) + '&select=review_status', { method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify({ review_status: 'submitted' }) });
          row.review_status = rows[0]?.review_status || 'submitted';
          chip.replaceWith(statusChip(row.review_status));
          sendBtn.textContent = 'Envoyé ✓ (renvoyer)';
          notify('Document envoyé à votre enseignant pour relecture. Vous pouvez continuer à le modifier : il voit toujours la dernière version.');
        } catch (error) { notify('Envoi impossible : ' + error.message); }
      } });
      const pdfBtn = el('button', { type: 'button', class: 'portal-button', text: '⤓ Télécharger le PDF', onclick: async () => {
        const warn = editor.warnings();
        if (warn.length) notify('Attention : ' + warn.join(' '));
        pdfBtn.disabled = true; pdfBtn.textContent = 'Création du PDF…';
        try { await flush(); const res = await PDF.download(row.data, row.kind, { title: row.title, author: [row.data.person.first, row.data.person.last].join(' ') }); if (!warn.length) notify('PDF créé (' + res.pages + ' page' + (res.pages > 1 ? 's' : '') + ', ' + Math.max(1, Math.round(res.blob.size / 1024)) + ' Ko).'); }
        catch (error) { notify('PDF impossible : ' + error.message); }
        pdfBtn.disabled = false; pdfBtn.textContent = '⤓ Télécharger le PDF';
      } });
      editor = createEditor({ doc: row, onChange: markDirty, cvList: () => docs.filter(d => d.kind === 'cv' && d.id !== row.id), loadDoc, notify });
      const review = row.teacher_comment || row.review_status === 'changes' || row.review_status === 'approved'
        ? el('div', { class: 'ot-review' }, el('strong', { text: 'Avis de votre enseignant · ' + STATUS[row.review_status] + (row.reviewed_at ? ' · ' + dateFr.format(new Date(row.reviewed_at)) : '') }), row.teacher_comment ? el('p', { text: row.teacher_comment }) : null) : null;
      fill(content,
        el('div', { class: 'ot-toolbar' }, el('button', { type: 'button', text: '← Mes documents', onclick: () => showList() }), el('strong', { text: KIND[row.kind] }), chip, statusLine),
        el('div', { class: 'ot-toolbar' }, el('label', { class: 'ot-field', style: 'flex:1 1 260px' }, el('span', { text: 'Nom du document (pour vous retrouver)' }), title), sendBtn, pdfBtn),
        review, editor.node);
    }
    function markDirty() { dirty = true; if (statusLine) statusLine.textContent = 'Modifications non enregistrées…'; clearTimeout(saveTimer); saveTimer = setTimeout(() => save(), 1200); }
    function save() {
      clearTimeout(saveTimer); saveTimer = null;
      const row = current;
      if (!row || !dirty) return saving;
      dirty = false;
      saving = saving.catch(() => {}).then(async () => {
        if (statusLine) statusLine.textContent = 'Enregistrement…';
        const body = JSON.stringify({ title: (row.title || '').slice(0, 120), data: R.clean(row.kind, row.data) });
        const rows = await api.rest(TABLE + '?id=eq.' + encodeURIComponent(row.id) + '&select=id,updated_at', { method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' }, body });
        if (!rows.length) { if (current === row) notify('Ce document n’existe plus (supprimé ?).'); return; }
        const summary = docs.find(d => d.id === row.id);
        if (summary) { summary.title = row.title; summary.updated_at = rows[0].updated_at; }
        if (statusLine && current === row && !dirty) statusLine.textContent = 'Enregistré à ' + new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      }).catch(error => {
        dirty = true;
        if (statusLine && current === row) statusLine.textContent = 'Échec de l’enregistrement : ' + error.message + ' — nouvel essai dans 5 s.';
        clearTimeout(saveTimer); saveTimer = setTimeout(() => save(), 5000);
      });
      return saving;
    }
    function flush() { return dirty ? save() : saving.catch(() => {}); }
    button.addEventListener('click', () => { if (pane.hidden) open(); else if (tpRunning()) close(); });
    tabs.addEventListener('click', event => { const target = event.target.closest('button'); if (target && target !== button && !pane.hidden && !tpRunning()) close(); }, true);
    new MutationObserver(() => { if (!tp.hidden && !pane.hidden && !tpRunning()) close(); }).observe(tp, { attributes: true, attributeFilter: ['hidden'] });
    // Déconnexion : plus rien en mémoire.
    new MutationObserver(() => { if (dashboard.hidden || tabs.hidden) { close(); fill(content); docs = []; current = null; me = null; } }).observe(dashboard, { attributes: true, attributeFilter: ['hidden'] });
    new MutationObserver(() => { if (tabs.hidden) { close(); fill(content); docs = []; current = null; me = null; } }).observe(tabs, { attributes: true, attributeFilter: ['hidden'] });
    document.getElementById('studentRefresh')?.addEventListener('click', () => { if (!pane.hidden) close(); }, true);
    window.addEventListener('pagehide', () => { if (dirty) save(); });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && dirty) save(); });
  }

  // ───── Espace enseignant : onglet « CV et lettres » ─────
  async function renderTeacher(host, context) {
    const api = window.MelecPortal;
    const status = context.status || (() => {});
    const ticket = host.dataset.outilsTicket = String(Number(host.dataset.outilsTicket || 0) + 1);
    const live = () => host.isConnected && host.dataset.outilsTicket === ticket;
    const filter = host.dataset.outilsFilter || 'submitted';
    fill(host, el('div', { class: 'teach-card' }, el('p', { text: 'Chargement des CV et lettres…' })));
    let students, docs;
    try {
      const classFilter = context.classId ? '&class_id=eq.' + encodeURIComponent(context.classId) : '';
      students = await api.rest('student_profiles?select=user_id,last_name,first_name,class_id' + classFilter + '&order=last_name.asc,first_name.asc');
      const ids = students.map(s => s.user_id);
      docs = !ids.length ? [] : await api.rest(TABLE + '?select=' + LIST_FIELDS + '&student_id=in.(' + ids.map(encodeURIComponent).join(',') + ')&order=updated_at.desc');
    } catch (error) {
      if (live()) fill(host, el('div', { class: 'teach-card' }, el('p', { text: 'CV et lettres indisponibles : ' + error.message })));
      return;
    }
    if (!live()) return;
    const byId = new Map(students.map(s => [s.user_id, s]));
    const name = s => s ? s.last_name + ' ' + s.first_name : 'Élève inconnu';
    const className = id => context.classes?.find(c => c.id === id)?.name || '';
    const shown = docs.filter(d => filter === 'all' || d.review_status === filter);
    const counts = docs.reduce((acc, d) => { acc[d.review_status] = (acc[d.review_status] || 0) + 1; return acc; }, {});
    const viewer = el('div', { class: 'ot-teacher-viewer' });
    const filters = el('div', { class: 'ot-doc-actions' }, [['submitted', 'À relire'], ['changes', 'À corriger'], ['approved', 'Validés'], ['draft', 'Brouillons'], ['all', 'Tous']].map(([value, label]) =>
      el('button', { type: 'button', class: filter === value ? '' : 'subtle', 'aria-pressed': String(filter === value), text: label + ' (' + (value === 'all' ? docs.length : counts[value] || 0) + ')', onclick: () => { host.dataset.outilsFilter = value; renderTeacher(host, context); } })));
    const table = el('div', { class: 'devis-table-wrap' }, el('table', { class: 'devis-table devis-teacher-table' },
      el('thead', {}, el('tr', {}, ['Élève', 'Document', 'Type', 'Modifié le', 'État', ''].map(text => el('th', { text })))),
      el('tbody', {}, shown.length ? shown.map(row => {
        const s = byId.get(row.student_id);
        return el('tr', {},
          el('td', {}, el('strong', { text: name(s) }), s?.class_id && !context.classId ? el('div', { class: 'devis-hint', text: className(s.class_id) }) : null),
          el('td', { text: row.title || '—' }), el('td', { text: KIND[row.kind] }), el('td', { text: dateFr.format(new Date(row.updated_at)) }),
          el('td', {}, statusChip(row.review_status)),
          el('td', {}, el('button', { type: 'button', class: 'subtle', text: 'Ouvrir', onclick: () => openDoc(row, s) })));
      }) : el('tr', {}, el('td', { colspan: 6, text: 'Aucun document dans cette catégorie.' })))));
    async function openDoc(summary, student) {
      fill(viewer, el('p', { text: 'Ouverture…' }));
      try {
        const row = (await api.rest(TABLE + '?id=eq.' + encodeURIComponent(summary.id) + '&select=*'))[0];
        if (!row) { fill(viewer, el('p', { text: 'Ce document n’existe plus.' })); return; }
        const data = R.clean(row.kind, row.data);
        const pageHost = el('div');
        const scaleBox = el('div', { class: 'ot-scale' }, pageHost);
        const stage = el('div', { class: 'ot-stage' }, scaleBox);
        const comment = el('textarea', { maxlength: 4000, rows: 8, spellcheck: 'true', lang: 'fr', 'aria-label': 'Commentaire pour l’élève', placeholder: 'Ex. : Ajoute les dates de ta PFMP et détaille tes missions avec des verbes d’action.' });
        comment.value = row.teacher_comment || '';
        const answer = async (state) => {
          try {
            await api.rest(TABLE + '?id=eq.' + encodeURIComponent(row.id), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ review_status: state, teacher_comment: comment.value.slice(0, 4000) }) });
            status(state === 'approved' ? 'Document validé : l’élève voit votre avis.' : 'Avis envoyé : l’élève voit votre commentaire.');
            renderTeacher(host, context);
          } catch (error) { status(error.message, true); }
        };
        fill(viewer, el('div', { class: 'teach-card ot-teacher' },
          el('div', { class: 'devis-toolbar' }, el('h3', { text: KIND[row.kind] + ' · ' + name(student) + ' · ' + (row.title || '') }),
            el('button', { type: 'button', class: 'subtle', text: '⤓ PDF', onclick: async e => { e.target.disabled = true; try { await PDF.download(data, row.kind, { title: row.title, author: name(student) }); } catch (error) { status(error.message, true); } e.target.disabled = false; } }),
            el('button', { type: 'button', class: 'subtle', text: 'Fermer', onclick: () => fill(viewer) })),
          el('div', { class: 'ot-teacher-view' }, stage, el('div', { class: 'ot-panel' },
            el('p', { class: 'teach-help', text: 'État : ' + STATUS[row.review_status] + (row.submitted_at ? ' · envoyé le ' + dateFr.format(new Date(row.submitted_at)) : '') }),
            el('label', { class: 'ot-field' }, el('span', { text: 'Votre commentaire' }), comment),
            el('div', { class: 'ot-doc-actions' }, el('button', { type: 'button', class: 'warn', text: 'À corriger', onclick: () => answer('changes') }), el('button', { type: 'button', text: 'Valider', onclick: () => answer('approved') })),
            el('p', { class: 'teach-help', text: 'L’élève voit votre commentaire en haut de son document. Vous ne pouvez pas modifier son contenu.' })))));
        await PDF.loadFonts();
        const page = row.kind === 'cv' ? R.renderCv(data) : R.renderLetter(data);
        await PDF.mount(pageHost, page);
        const info = PDF.layout(page, data, row.kind);
        const scale = Math.min(1, ((stage.clientWidth || 640) - 24) / R.PAGE_W);
        scaleBox.style.transform = 'scale(' + scale + ')'; scaleBox.style.width = R.PAGE_W + 'px';
        stage.style.height = (info.pages * R.PAGE_H * scale + 24) + 'px';
        viewer.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch (error) { fill(viewer, el('p', { text: 'Document indisponible : ' + error.message })); }
    }
    fill(host, el('div', { class: 'teach-card ot-teacher' },
      el('div', { class: 'devis-toolbar' }, el('h2', { text: 'CV et lettres de motivation' }), el('button', { type: 'button', class: 'subtle', text: '↻ Actualiser', onclick: () => renderTeacher(host, context) })),
      el('p', { class: 'teach-help', text: (context.classId ? 'Classe ' + className(context.classId) + ' · ' : 'Toutes les classes · ') + docs.length + ' document(s). Les élèves envoient leurs CV et lettres pour relecture : répondez par un commentaire, « À corriger » ou « Valider ».' }),
      filters, table), viewer);
  }

  window.MelecOutils = { renderTeacher, checkTexts, createEditor };
  if (document.getElementById('studentContentTabs')) initStudent();
})();
