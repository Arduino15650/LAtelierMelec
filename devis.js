/* L'Atelier MELEC : devis de matériel électrique.
   - Espace élève : onglet « Mes devis » (création, enregistrement automatique, réouverture).
   - Espace enseignant : onglet « Devis élèves » (consultation, verrouillage, suppression).
   Les données sont dans la table student_quotes (voir supabase/migrations/…_devis_eleves.sql). */
(function () {
  'use strict';
  const TVA = 0.20;
  const SUPPLIERS = ['Rexel', 'Sonepar', 'CGED', 'Yesss Électrique', 'Würth'];
  const UNITS = ['u', 'm', 'lot', 'couronne', 'boîte'];
  const MATERIALS = [
    'Disjoncteur divisionnaire 1P+N 10 A courbe C', 'Disjoncteur divisionnaire 1P+N 16 A courbe C',
    'Disjoncteur divisionnaire 1P+N 20 A courbe C', 'Disjoncteur divisionnaire 1P+N 32 A courbe C',
    'Interrupteur différentiel 40 A 30 mA type AC', 'Interrupteur différentiel 40 A 30 mA type A',
    'Tableau électrique 2 rangées 13 modules', 'Peigne d’alimentation 13 modules',
    'Câble H07V-U 1,5 mm² bleu', 'Câble H07V-U 1,5 mm² rouge', 'Câble H07V-U 2,5 mm² rouge',
    'Câble H07V-U 1,5 mm² vert/jaune', 'Câble R2V 3G1,5 mm²', 'Câble R2V 3G2,5 mm²',
    'Gaine ICTA Ø16 mm', 'Gaine ICTA Ø20 mm', 'Boîte d’encastrement Ø67 mm prof. 40 mm',
    'Prise de courant 2P+T 16 A', 'Interrupteur simple allumage 10 A', 'Interrupteur va-et-vient 10 A',
    'Bouton poussoir 10 A', 'Télérupteur 16 A', 'Bornes de connexion automatiques 3 entrées', 'Barrette de terre 8 trous'
  ];
  const euro = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
  const dateFr = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
  const round2 = value => Math.round((value + Number.EPSILON) * 100) / 100;
  // Accepte « 12,50 », « 12.50 », « 1 250,00 € ». Case vide = 0 ; saisie incorrecte = NaN.
  function parseNumber(text) {
    const clean = String(text ?? '').replace(/[\s  €]/g, '').replace(',', '.');
    if (clean === '') return 0;
    return /^\d+(\.\d+)?$/.test(clean) ? Number(clean) : NaN;
  }
  function computeTotals(lines) {
    let ht = 0, valid = true;
    const rows = (lines || []).map(entry => {
      const qty = parseNumber(entry.qty), pu = parseNumber(entry.pu);
      const ok = !Number.isNaN(qty) && !Number.isNaN(pu);
      if (!ok) valid = false;
      const lineHt = ok ? round2(qty * pu) : 0;
      ht += lineHt;
      return { qtyOk: !Number.isNaN(qty), puOk: !Number.isNaN(pu), ht: lineHt, ttc: round2(lineHt * (1 + TVA)) };
    });
    ht = round2(ht);
    const tva = round2(ht * TVA);
    return { rows, ht, tva, ttc: round2(ht + tva), valid };
  }
  const blankLine = () => ({ desc: '', ref: '', qty: '', unit: 'u', pu: '' });
  const cleanLines = lines => (Array.isArray(lines) ? lines : []).slice(0, 200).map(entry => ({
    desc: String(entry?.desc ?? '').slice(0, 200), ref: String(entry?.ref ?? '').slice(0, 60),
    qty: String(entry?.qty ?? '').slice(0, 15), unit: UNITS.includes(entry?.unit) ? entry.unit : 'u',
    pu: String(entry?.pu ?? '').slice(0, 15)
  }));
  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (value === undefined || value === null || value === false) continue;
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value === true ? '' : value);
    }
    children.flat().forEach(child => { if (child !== null && child !== undefined && child !== false) node.append(child); });
    return node;
  }
  // Remplace le contenu d'un bloc en ignorant les parties absentes (null, false) : sans ce filtre,
  // le navigateur afficherait le mot « null » à leur place.
  const fill = (node, ...children) => node.replaceChildren(...children.flat(Infinity).filter(child => child !== null && child !== undefined && child !== false));
  function nextNumber(numbers) {
    const year = new Date().getFullYear();
    const used = numbers.map(number => Number((String(number).match(/-(\d+)$/) || [])[1]) || 0);
    return 'DEV-' + year + '-' + String(Math.max(0, ...used) + 1).padStart(3, '0');
  }
  let datalistReady = false;
  function ensureDatalist() {
    if (datalistReady) return;
    datalistReady = true;
    document.body.append(el('datalist', { id: 'devisMaterials' }, MATERIALS.map(value => el('option', { value }))));
  }

  // Éditeur de devis : en-tête, lignes et totaux. readOnly : consultation seule.
  function renderEditor(container, quote, options = {}) {
    ensureDatalist();
    const readOnly = Boolean(options.readOnly);
    const onChange = options.onChange || (() => {});
    const uid = 'dv' + Math.random().toString(36).slice(2, 8);
    quote.lines = cleanLines(quote.lines);
    if (!quote.lines.length && !readOnly) quote.lines = [blankLine(), blankLine(), blankLine()];
    const known = SUPPLIERS.includes(quote.supplier);
    const changed = () => { refresh(); onChange(quote); };
    const field = (label, input) => el('label', { class: 'devis-field' }, el('span', { text: label }), input);
    const project = el('input', { id: uid + '-project', maxlength: 200, value: quote.project || '', placeholder: 'Ex. : Tableau de chambre', disabled: readOnly,
      oninput: event => { quote.project = event.target.value; changed(); } });
    const supplierSelect = el('select', { id: uid + '-supplier', disabled: readOnly },
      SUPPLIERS.map(name => el('option', { value: name, text: name, selected: known && quote.supplier === name })),
      el('option', { value: '__other', text: 'Autre fournisseur…', selected: !known }));
    const otherSupplier = el('input', { id: uid + '-other', maxlength: 80, value: known ? '' : (quote.supplier || ''), placeholder: 'Nom du fournisseur', disabled: readOnly,
      oninput: event => { quote.supplier = event.target.value.trim(); changed(); } });
    const otherField = field('Nom du fournisseur', otherSupplier);
    otherField.hidden = known;
    supplierSelect.addEventListener('change', () => {
      const other = supplierSelect.value === '__other';
      otherField.hidden = !other;
      quote.supplier = other ? otherSupplier.value.trim() : supplierSelect.value;
      changed();
      if (other) otherSupplier.focus();
    });
    const date = el('input', { id: uid + '-date', type: 'date', value: quote.quote_date || '', disabled: readOnly,
      oninput: event => { quote.quote_date = event.target.value; changed(); } });
    const head = el('div', { class: 'devis-fields' },
      field('Chantier / objet', project), field('Fournisseur', supplierSelect), otherField, field('Date du devis', date),
      options.studentLabel ? el('div', { class: 'devis-field' }, el('span', { text: 'Élève' }), el('strong', { text: options.studentLabel })) : null);

    const body = el('tbody');
    const table = el('div', { class: 'devis-table-wrap' }, el('table', { class: 'devis-table' },
      el('thead', {}, el('tr', {},
        el('th', { text: 'Description' }), el('th', { text: 'Référence' }), el('th', { class: 'n', text: 'Qté' }), el('th', { text: 'Unité' }),
        el('th', { class: 'n', text: 'Prix unit. HT' }), el('th', { class: 'n', text: 'Total HT' }), el('th', { class: 'n', text: 'Total TTC' }),
        readOnly ? null : el('th', { 'aria-label': 'Supprimer' }))),
      body));
    const tHt = el('b'), tTva = el('b'), tTtc = el('b');
    const totals = el('div', { class: 'devis-totals', 'aria-live': 'polite' },
      el('div', {}, el('span', { text: 'Total HT' }), tHt),
      el('div', {}, el('span', { text: 'TVA 20 %' }), tTva),
      el('div', { class: 'devis-grand' }, el('span', { text: 'Total TTC' }), tTtc));
    const addLine = readOnly ? null : el('button', { type: 'button', class: 'devis-add', text: '＋ Ajouter une ligne',
      onclick: () => { quote.lines.push(blankLine()); drawLines(); changed(); body.lastElementChild?.querySelector('input')?.focus(); } });
    const hint = readOnly ? null : el('p', { class: 'devis-hint', text: 'Prix : virgule ou point (12,50). Câble : quantité en mètres, unité « m ». Les totaux se calculent automatiquement (TVA 20 %).' });

    function drawLines() {
      fill(body, ...quote.lines.map((entry, index) => {
        const input = (key, attrs) => el('input', { value: entry[key], disabled: readOnly, 'data-k': key, ...attrs,
          oninput: event => { entry[key] = event.target.value; changed(); } });
        return el('tr', {},
          el('td', {}, input('desc', { list: 'devisMaterials', maxlength: 200, 'aria-label': 'Description ligne ' + (index + 1), placeholder: readOnly ? '' : 'Ex. : Disjoncteur 1P+N 16 A' })),
          el('td', {}, input('ref', { maxlength: 60, 'aria-label': 'Référence ligne ' + (index + 1) })),
          el('td', {}, input('qty', { class: 'n', inputmode: 'decimal', maxlength: 15, 'aria-label': 'Quantité ligne ' + (index + 1) })),
          el('td', {}, el('select', { disabled: readOnly, 'aria-label': 'Unité ligne ' + (index + 1),
            onchange: event => { entry.unit = event.target.value; changed(); } },
            UNITS.map(unit => el('option', { value: unit, text: unit, selected: unit === entry.unit })))),
          el('td', {}, input('pu', { class: 'n', inputmode: 'decimal', maxlength: 15, placeholder: '0,00', 'aria-label': 'Prix unitaire HT ligne ' + (index + 1) })),
          el('td', { class: 'n devis-amount', 'data-o': 'ht' }),
          el('td', { class: 'n devis-amount devis-strong', 'data-o': 'ttc' }),
          readOnly ? null : el('td', {}, el('button', { type: 'button', class: 'devis-remove', 'aria-label': 'Supprimer la ligne ' + (index + 1), text: '×',
            onclick: () => { quote.lines.splice(index, 1); drawLines(); changed(); } })));
      }));
      if (!quote.lines.length) body.append(el('tr', {}, el('td', { colspan: readOnly ? 7 : 8, class: 'devis-hint', text: readOnly ? 'Aucune ligne.' : 'Aucune ligne : cliquez sur « Ajouter une ligne ».' })));
      refresh();
    }
    function refresh() {
      const result = computeTotals(quote.lines);
      [...body.children].forEach((row, index) => {
        const line = result.rows[index];
        if (!line) return;
        row.querySelector('[data-o="ht"]').textContent = euro.format(line.ht);
        row.querySelector('[data-o="ttc"]').textContent = euro.format(line.ttc);
        row.querySelector('[data-k="qty"]').setAttribute('aria-invalid', String(!line.qtyOk));
        row.querySelector('[data-k="pu"]').setAttribute('aria-invalid', String(!line.puOk));
      });
      tHt.textContent = euro.format(result.ht);
      tTva.textContent = euro.format(result.tva);
      tTtc.textContent = euro.format(result.ttc);
      quote.total_ht = result.ht; quote.total_ttc = result.ttc;
      return result;
    }
    fill(container, el('div', { class: 'devis-sheet' }, head, table, el('div', { class: 'devis-under' }, addLine, hint), totals));
    drawLines();
    return { refresh };
  }

  const payload = quote => ({
    number: quote.number, project: quote.project || '', supplier: quote.supplier || '', quote_date: quote.quote_date || undefined,
    lines: cleanLines(quote.lines), total_ht: computeTotals(quote.lines).ht, total_ttc: computeTotals(quote.lines).ttc
  });
  const LIST_FIELDS = 'id,student_id,number,project,supplier,quote_date,total_ht,total_ttc,locked_at,updated_at';

  // ───────────── Espace élève ─────────────
  function initStudent() {
    const tabs = document.getElementById('studentContentTabs');
    const dashboard = document.getElementById('studentDashboard');
    const tp = document.getElementById('studentTpPane');
    const api = window.MelecPortal;
    if (!tabs || !dashboard || !tp || !api) return;
    const button = el('button', { type: 'button', id: 'studentQuotesTab', text: 'Mes devis' });
    tabs.append(button);
    const message = el('p', { class: 'portal-small', role: 'status', 'aria-live': 'polite' });
    const content = el('div', { class: 'devis-space' });
    const pane = el('section', { id: 'studentQuotesPane', class: 'student-pane devis-pane' }, el('h2', { text: 'Mes devis matériel' }), message, content);
    pane.hidden = true;
    dashboard.append(pane);
    let quotes = [], current = null, saveTimer = null, saving = Promise.resolve(), dirty = false, requestId = 0, statusLine = null;

    function close() {
      flush();
      pane.hidden = true; button.classList.remove('active');
    }
    const tpRunning = () => tabs.dataset.tpActive === 'true';
    async function open() {
      if (tpRunning()) {
        // TP chronométré en cours : les devis s'ouvrent sous le TP, qui reste affiché.
        button.classList.add('active');
        pane.hidden = false;
        pane.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        tp.hidden = true;
        // Les autres onglets (référentiel, CCF) se ferment comme lorsque l'on ouvre les TP.
        dashboard.querySelectorAll('.student-pane').forEach(other => { if (other !== pane) other.hidden = true; });
        tabs.querySelectorAll('button').forEach(other => other.classList.toggle('active', other === button));
        pane.hidden = false;
      }
      await showList();
    }
    async function loadList() {
      const user = await api.userId();
      quotes = await api.rest('student_quotes?student_id=eq.' + encodeURIComponent(user) + '&select=' + LIST_FIELDS + '&order=updated_at.desc');
    }
    async function showList() {
      const ticket = ++requestId;
      current = null;
      message.textContent = 'Chargement de vos devis…';
      try { await loadList(); } catch (error) { if (ticket === requestId) message.textContent = 'Devis indisponibles : ' + error.message; return; }
      if (ticket !== requestId || pane.hidden) return;
      message.textContent = quotes.length ? 'Vos devis sont enregistrés automatiquement et visibles par votre enseignant.' : 'Aucun devis pour l’instant. Créez votre premier devis.';
      const list = el('div', { class: 'devis-list' }, quotes.map(quote => el('button', { type: 'button', class: 'devis-entry', onclick: () => showQuote(quote.id) },
        el('span', { class: 'devis-entry-title', text: quote.project || 'Devis sans objet' }),
        el('span', { class: 'devis-entry-meta', text: (quote.supplier || 'Fournisseur à préciser') + ' · ' + quote.number }),
        el('span', { class: 'devis-entry-meta' }, el('b', { text: euro.format(Number(quote.total_ttc) || 0) + ' TTC' }), quote.locked_at ? el('span', { class: 'devis-chip devis-locked', text: '🔒 Verrouillé par l’enseignant' }) : null))));
      fill(content, 
        el('div', { class: 'devis-toolbar' }, el('button', { type: 'button', class: 'portal-button devis-primary', text: '＋ Nouveau devis', onclick: () => showQuote(null) })),
        list, ...[comparison()].filter(Boolean));
    }
    // Comparaison des fournisseurs pour un même chantier.
    function comparison() {
      const groups = new Map();
      quotes.forEach(quote => {
        const key = (quote.project || '').trim().toLocaleLowerCase('fr');
        if (!key || !(Number(quote.total_ttc) > 0)) return;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(quote);
      });
      const rows = [...groups.values()].filter(group => group.length > 1).map(group => {
        const sorted = [...group].sort((a, b) => Number(a.total_ttc) - Number(b.total_ttc));
        return el('li', {}, el('strong', { text: sorted[0].project }), ' : le moins cher est ',
          el('b', { text: (sorted[0].supplier || '?') + ' (' + euro.format(Number(sorted[0].total_ttc)) + ')' }),
          ', écart de ' + euro.format(Number(sorted.at(-1).total_ttc) - Number(sorted[0].total_ttc)) + ' TTC avec ' + (sorted.at(-1).supplier || '?') + '.');
      });
      return rows.length ? el('div', { class: 'devis-compare' }, el('h3', { text: 'Comparaison des fournisseurs' }), el('ul', {}, rows)) : null;
    }
    async function showQuote(id, prefill) {
      const ticket = ++requestId;
      await flush();
      let quote;
      if (id) {
        message.textContent = 'Ouverture du devis…';
        try { quote = (await api.rest('student_quotes?id=eq.' + encodeURIComponent(id) + '&select=*'))[0]; }
        catch (error) { message.textContent = 'Devis indisponible : ' + error.message; return; }
        if (!quote) { message.textContent = 'Ce devis n’existe plus (supprimé par l’enseignant).'; return showList(); }
      } else {
        quote = { id: null, number: nextNumber(quotes.map(q => q.number)), project: '', supplier: 'Rexel', quote_date: new Date().toISOString().slice(0, 10), lines: [], ...(prefill || {}) };
      }
      if (ticket !== requestId || pane.hidden) return;
      current = quote; dirty = false;
      const locked = Boolean(quote.locked_at);
      message.textContent = locked ? 'Ce devis a été verrouillé par votre enseignant : consultation seule.' : '';
      statusLine = el('span', { class: 'devis-save', role: 'status', text: quote.id ? 'Enregistré' : 'Nouveau devis : il sera enregistré dès la première saisie.' });
      const editorHost = el('div');
      const saveButton = locked ? null : el('button', { type: 'button', class: 'portal-button devis-primary', text: 'Enregistrer', onclick: () => save(true) });
      const duplicate = el('button', { type: 'button', text: 'Dupliquer pour un autre fournisseur', onclick: async () => {
        await flush();
        const lines = cleanLines(quote.lines).map(entry => ({ ...entry, ref: '', pu: '' }));
        const nextSupplier = SUPPLIERS.find(name => name !== quote.supplier) || '';
        await showQuote(null, { project: quote.project, supplier: nextSupplier, lines });
        if (current) { dirty = true; save(true); }
        message.textContent = 'Copie créée : mêmes articles et quantités. Complétez les références et les prix du nouveau fournisseur.';
      } });
      fill(content, 
        el('div', { class: 'devis-toolbar' },
          el('button', { type: 'button', text: '← Mes devis', onclick: () => { flush().then(showList); } }),
          el('span', { class: 'devis-number', text: 'Devis ' + quote.number }), statusLine),
        editorHost,
        el('div', { class: 'devis-toolbar devis-bottom' }, duplicate, saveButton));
      renderEditor(editorHost, quote, { readOnly: locked, onChange: () => { dirty = true; statusLine.textContent = 'Modifications non enregistrées…'; clearTimeout(saveTimer); saveTimer = setTimeout(() => save(false), 1200); } });
    }
    function save(manual) {
      clearTimeout(saveTimer); saveTimer = null;
      const quote = current;
      if (!quote || (!dirty && !manual)) return saving;
      dirty = false;
      saving = saving.catch(() => {}).then(async () => {
        if (statusLine) statusLine.textContent = 'Enregistrement…';
        const body = JSON.stringify(payload(quote));
        const headers = { 'Content-Type': 'application/json', Prefer: 'return=representation' };
        let rows;
        if (!quote.id) {
          rows = await api.rest('student_quotes?select=id,updated_at', { method: 'POST', headers, body });
          if (rows[0]) { quote.id = rows[0].id; quotes.unshift({ id: quote.id, number: quote.number, project: quote.project, supplier: quote.supplier, total_ttc: quote.total_ttc }); }
        } else {
          rows = await api.rest('student_quotes?id=eq.' + encodeURIComponent(quote.id) + '&locked_at=is.null&select=id,updated_at', { method: 'PATCH', headers, body });
        }
        if (!rows.length) {
          // Verrouillé (ou supprimé) par l'enseignant pendant la saisie.
          if (current === quote) { message.textContent = 'Ce devis vient d’être verrouillé ou supprimé par votre enseignant : vos dernières modifications n’ont pas été enregistrées.'; showQuote(quote.id); }
          return;
        }
        if (statusLine && current === quote) statusLine.textContent = 'Enregistré à ' + new Date(rows[0].updated_at || Date.now()).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) + ' · visible par l’enseignant';
      }).catch(error => {
        dirty = true;
        if (statusLine && current === quote) statusLine.textContent = 'Échec de l’enregistrement : ' + error.message + ' — nouvel essai dans 5 s.';
        clearTimeout(saveTimer); saveTimer = setTimeout(() => save(false), 5000);
      });
      return saving;
    }
    function flush() { return dirty ? save(false) : saving.catch(() => {}); }
    button.addEventListener('click', () => { if (pane.hidden) open(); else if (tpRunning()) close(); });
    // Un autre onglet ouvert, un TP en cours ou une déconnexion referment les devis.
    tabs.addEventListener('click', event => {
      const target = event.target.closest('button');
      if (target && target !== button && !pane.hidden && !tpRunning()) close();
    }, true);
    // Les devis restent accessibles pendant un TP chronométré (l'élève peut devoir chiffrer du matériel).
    new MutationObserver(() => { if (!tp.hidden && !pane.hidden && !tpRunning()) close(); }).observe(tp, { attributes: true, attributeFilter: ['hidden'] });
    new MutationObserver(() => {
      if (dashboard.hidden || tabs.hidden) { close(); fill(content); quotes = []; current = null; }
    }).observe(dashboard, { attributes: true, attributeFilter: ['hidden'] });
    document.getElementById('studentRefresh')?.addEventListener('click', () => { if (!pane.hidden) close(); }, true);
    window.addEventListener('pagehide', () => { if (dirty) save(false); });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && dirty) save(false); });
  }

  // ───────────── Espace enseignant ─────────────
  // Appelé par teaching-space.js pour l'onglet « Devis élèves ».
  async function renderTeacher(host, context) {
    const api = window.MelecPortal;
    const status = context.status || (() => {});
    const ticket = host.dataset.devisTicket = String(Number(host.dataset.devisTicket || 0) + 1);
    const live = () => host.isConnected && host.dataset.devisTicket === ticket;
    fill(host, el('div', { class: 'teach-card' }, el('p', { text: 'Chargement des devis…' })));
    let students, quotes;
    try {
      const classFilter = context.classId ? '&class_id=eq.' + encodeURIComponent(context.classId) : '';
      students = await api.rest('student_profiles?select=user_id,last_name,first_name,class_id' + classFilter + '&order=last_name.asc,first_name.asc');
      const ids = students.map(student => student.user_id);
      quotes = !ids.length ? [] : await api.rest('student_quotes?select=' + LIST_FIELDS + '&student_id=in.(' + ids.map(encodeURIComponent).join(',') + ')&order=updated_at.desc');
    } catch (error) {
      if (live()) fill(host, el('div', { class: 'teach-card' }, el('p', { text: 'Devis indisponibles : ' + error.message })));
      return;
    }
    if (!live()) return;
    const byId = new Map(students.map(student => [student.user_id, student]));
    const className = id => context.classes?.find(entry => entry.id === id)?.name || '';
    const name = student => student ? student.last_name + ' ' + student.first_name : 'Élève inconnu';
    const viewer = el('div', { class: 'devis-teacher-view' });
    const refresh = el('button', { type: 'button', class: 'subtle', text: '↻ Actualiser', onclick: () => renderTeacher(host, context) });
    const table = el('div', { class: 'devis-table-wrap' }, el('table', { class: 'devis-table devis-teacher-table' },
      el('thead', {}, el('tr', {}, ['Élève', 'Chantier / objet', 'Fournisseur', 'N°', 'Modifié le', 'Total TTC', 'État', 'Actions'].map(text => el('th', { text, class: text === 'Total TTC' ? 'n' : null })))),
      el('tbody', {}, quotes.length ? quotes.map(quote => {
        const student = byId.get(quote.student_id);
        const lock = el('button', { type: 'button', class: 'subtle', text: quote.locked_at ? 'Déverrouiller' : 'Verrouiller', onclick: async () => {
          lock.disabled = true;
          try {
            await api.rest('student_quotes?id=eq.' + encodeURIComponent(quote.id), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ locked_at: quote.locked_at ? null : new Date().toISOString() }) });
            status(quote.locked_at ? 'Devis déverrouillé : l’élève peut de nouveau le modifier.' : 'Devis verrouillé : l’élève ne peut plus le modifier.');
            renderTeacher(host, context);
          } catch (error) { lock.disabled = false; status(error.message, true); }
        } });
        const remove = el('button', { type: 'button', class: 'warn', text: 'Supprimer', onclick: async () => {
          if (!confirm('Supprimer définitivement le devis « ' + (quote.project || quote.number) + ' » de ' + name(student) + ' ? Cette action est irréversible.')) return;
          remove.disabled = true;
          try {
            await api.rest('student_quotes?id=eq.' + encodeURIComponent(quote.id), { method: 'DELETE' });
            status('Devis supprimé définitivement.');
            renderTeacher(host, context);
          } catch (error) { remove.disabled = false; status(error.message, true); }
        } });
        const openButton = el('button', { type: 'button', class: 'subtle', text: 'Ouvrir', onclick: () => openQuote(quote, student) });
        return el('tr', {},
          el('td', {}, el('strong', { text: name(student) }), student?.class_id && !context.classId ? el('div', { class: 'devis-hint', text: className(student.class_id) }) : null),
          el('td', { text: quote.project || '—' }), el('td', { text: quote.supplier || '—' }), el('td', { text: quote.number }),
          el('td', { text: dateFr.format(new Date(quote.updated_at)) }),
          el('td', { class: 'n devis-amount', text: euro.format(Number(quote.total_ttc) || 0) }),
          el('td', {}, quote.locked_at ? el('span', { class: 'devis-chip devis-locked', text: '🔒 Verrouillé' }) : el('span', { class: 'devis-chip devis-open', text: 'Modifiable par l’élève' })),
          el('td', {}, el('div', { class: 'devis-actions' }, openButton, lock, remove)));
      }) : el('tr', {}, el('td', { colspan: 8, text: context.classId ? 'Aucun devis dans cette classe pour l’instant.' : 'Aucun devis pour l’instant.' })))));
    async function openQuote(summary, student) {
      fill(viewer, el('p', { text: 'Ouverture…' }));
      try {
        const quote = (await api.rest('student_quotes?id=eq.' + encodeURIComponent(summary.id) + '&select=*'))[0];
        if (!quote) { fill(viewer, el('p', { text: 'Ce devis n’existe plus.' })); return; }
        const editorHost = el('div');
        fill(viewer, el('div', { class: 'teach-card devis-teacher-card' },
          el('div', { class: 'devis-toolbar' }, el('h3', { text: 'Devis ' + quote.number + ' · ' + name(student) }),
            el('button', { type: 'button', class: 'subtle', text: 'Fermer', onclick: () => fill(viewer) })),
          editorHost));
        renderEditor(editorHost, quote, { readOnly: true, studentLabel: name(student) });
        viewer.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch (error) { fill(viewer, el('p', { text: 'Devis indisponible : ' + error.message })); }
    }
    fill(host, el('div', { class: 'teach-card devis-teacher' },
      el('div', { class: 'devis-toolbar' }, el('h2', { text: 'Devis des élèves' }), refresh),
      el('p', { class: 'teach-help', text: (context.classId ? 'Classe ' + className(context.classId) + ' · ' : 'Toutes les classes · ') + quotes.length + ' devis. Chaque enregistrement d’un élève apparaît ici. « Verrouiller » empêche l’élève de modifier son devis ; « Supprimer » l’efface définitivement de la base.' }),
      table), viewer);
  }

  window.MelecDevis = { computeTotals, parseNumber, nextNumber, renderEditor, renderTeacher, TVA };
  if (document.getElementById('studentContentTabs')) initStudent();
})();
