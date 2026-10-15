/* L'Atelier MELEC : magasin électrique (reprise de MELECGEST) et inventaire par les élèves.
   - Espace enseignant : menu « Accès équipe » (vue #magasinView) — le magasin à l'identique
     de MELECGEST, plus l'import de listes Excel et la réception des inventaires des élèves.
   - Espace enseignant, administrateur seulement : menu « Administration » (vue #adminView) —
     établissement, accès au magasin, chargement et export de la base complète.
   - Espace élève : onglet « Inventaire magasin » — comptage à l'aveugle, envoi à l'enseignant.
   Les règles d'accès sont imposées par la base (supabase/migrations/…_magasin.sql). */
(function () {
  'use strict';
  const api = window.MelecPortal;
  if (!api) return;

  // ───────── Listes de MELECGEST ─────────
  const MANUFACTURERS = ['Schneider Electric', 'Legrand', 'Hager', 'ABB', 'Siemens', 'Eaton', 'Nexans', 'Wago', 'Phoenix Contact', 'Rittal', 'Gewiss', 'Delta Dore', 'Theben', 'Signify', 'LEDVANCE', 'Atlantic', 'Chauvin Arnoux', 'Fluke', 'Socomec', 'Weidmüller', 'Legrand Cable Management', '3M'];
  const DISTRIBUTORS = ['Rexel', 'Sonepar', 'YESSS Électrique', 'CGED'];
  const TYPES = ['Protection électrique', 'Appareillage', 'Câbles et conducteurs', 'Éclairage', 'Automatismes', 'Tableaux et coffrets', 'Outillage', 'Domotique', 'Cheminement', 'Énergie et recharge'];
  const CATEGORIES = ['Habitat', 'Tertiaire', 'Industrie'];
  const UNITS = ['pièce', 'mètre', 'rouleau', 'boîte', 'lot'];
  const BLANK = { ref: '', name: '', type: TYPES[0], category: CATEGORIES[0], supplier: MANUFACTURERS[0], unit: 'pièce', location: '', stock: 0, threshold: 5 };
  const POLL_MS = 15000;

  // ───────── Utilitaires ─────────
  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (value === undefined || value === null || value === false) continue;
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value === true ? '' : value);
    }
    children.flat(Infinity).forEach(child => { if (child !== null && child !== undefined && child !== false) node.append(child); });
    return node;
  }
  const fill = (node, ...children) => node.replaceChildren(...children.flat(Infinity).filter(child => child !== null && child !== undefined && child !== false));
  const option = (value, text, selected) => el('option', { value, text: text ?? value, selected: selected || null });
  const norm = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const collator = new Intl.Collator('fr', { numeric: true, sensitivity: 'base' });
  const fr = n => Number(n || 0).toLocaleString('fr-FR');
  const uniq = list => [...new Set(list.filter(Boolean))];
  const today = () => new Date().toISOString().slice(0, 10);
  const rpc = (name, body = {}) => api.rest('rpc/' + name, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const field = (label, control, hint) => el('label', { class: 'mg-field' }, el('span', { text: label }), control, hint ? el('small', { text: hint }) : null);
  const scripts = new Map();
  function loadScript(src) {
    if (!scripts.has(src)) scripts.set(src, new Promise((resolve, reject) => {
      const tag = document.createElement('script'); tag.src = src; tag.onload = resolve;
      tag.onerror = () => { scripts.delete(src); reject(new Error('Module indisponible : ' + src)); };
      document.head.append(tag);
    }));
    return scripts.get(src);
  }
  const xlsx = () => window.XLSX ? Promise.resolve(window.XLSX) : loadScript('xlsx.full.min.js').then(() => window.XLSX);
  const jsPDF = () => window.jspdf?.jsPDF ? Promise.resolve(window.jspdf.jsPDF) : loadScript('jspdf.umd.min.js').then(() => window.jspdf.jsPDF);
  function saveFile(blob, name) {
    const url = URL.createObjectURL(blob);
    const link = el('a', { href: url, download: name }); document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }
  function dialog(title, subtitle, ...body) {
    const box = el('dialog', { class: 'mg-dialog' },
      el('button', { type: 'button', class: 'mg-close', 'aria-label': 'Fermer', text: '✕', onclick: () => box.close() }),
      el('h2', { text: title }), subtitle ? el('p', { class: 'mg-subtitle', text: subtitle }) : null, ...body);
    box.addEventListener('close', () => box.remove());
    document.body.append(box); box.showModal();
    return box;
  }
  const errorLine = () => el('p', { class: 'mg-error', role: 'alert' });

  // ───────── Excel : lecture tolérante des colonnes ─────────
  const COLUMNS = {
    ref: ['reference', 'ref', 'ref.', 'reference fabricant', 'code', 'code article'],
    name: ['designation', 'article', 'libelle', 'nom', 'description', 'materiel'],
    type: ['type', 'type de materiel', 'famille'],
    category: ['categorie', 'domaine', 'secteur'],
    supplier: ['fournisseur', 'fabricant', 'fournisseur / fabricant', 'fournisseur/fabricant', 'marque'],
    unit: ['unite', 'u'],
    location: ['emplacement', 'rayon', 'localisation', 'bac'],
    threshold: ['seuil', "seuil d'alerte", 'seuil d’alerte', 'seuil alerte'],
    quantity: ['quantite comptee', 'quantite', 'stock', 'qte', 'qte comptee', 'compte', 'nombre', 'stock disponible']
  };
  function rowsFromSheet(aoa) {
    const headerIndex = aoa.findIndex(row => row.some(cell => Object.values(COLUMNS).some(names => names.includes(norm(cell)))));
    if (headerIndex < 0) throw new Error('Colonnes introuvables : le fichier doit contenir au moins « Référence » ou « Désignation ».');
    const header = aoa[headerIndex].map(norm);
    const at = {};
    for (const [key, names] of Object.entries(COLUMNS)) {
      for (const name of names) { const i = header.indexOf(name); if (i >= 0) { at[key] = i; break; } }
    }
    if (at.ref === undefined && at.name === undefined) throw new Error('Colonne « Référence » ou « Désignation » introuvable.');
    return aoa.slice(headerIndex + 1).map(row => {
      const out = {};
      for (const [key, i] of Object.entries(at)) {
        const value = row[i];
        out[key] = value === undefined || value === null ? '' : String(value).trim();
      }
      if (out.quantity !== undefined) out.quantity = out.quantity.replace(',', '.').replace(/\s/g, '');
      if (out.quantity && !/^\d+$/.test(out.quantity)) out.quantity = /^\d+(\.0+)?$/.test(out.quantity) ? String(parseInt(out.quantity, 10)) : '';
      return out;
    }).filter(row => row.ref || row.name);
  }
  async function readListFile(file) {
    const X = await xlsx();
    const book = X.read(await file.arrayBuffer(), { type: 'array' });
    // Feuille « Inventaire » en priorité (fichiers produits par L'Atelier MELEC), sinon la première.
    const sheetName = book.SheetNames.find(name => norm(name) === 'inventaire') || book.SheetNames[0];
    return rowsFromSheet(X.utils.sheet_to_json(book.Sheets[sheetName], { header: 1, raw: false, defval: '' }));
  }
  function sheet(X, rows, widths) {
    const ws = X.utils.aoa_to_sheet(rows);
    ws['!cols'] = widths.map(wch => ({ wch }));
    if (rows.length > 1) ws['!autofilter'] = { ref: X.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length - 1, c: rows[0].length - 1 } }) };
    return ws;
  }
  const sortItems = list => [...list].sort((a, b) => collator.compare(a.type, b.type) || collator.compare(a.category, b.category) || collator.compare(a.supplier, b.supplier) || collator.compare(a.name, b.name));

  // Fenêtre d'import : aperçu, options, application.
  function importDialog(rows, { title = 'Ajouter des articles (Excel)', align = false, note = 'Inventaire du ' + new Date().toLocaleDateString('fr-FR'), items = [], onDone, onApplied } = {}) {
    const byRef = new Map(items.map(i => [norm(i.ref), i]));
    const byName = new Map(items.map(i => [norm(i.name), i]));
    const known = row => byRef.get(norm(row.ref)) || (!row.ref && byName.get(norm(row.name)));
    const created = rows.filter(row => !known(row)).length;
    const gaps = rows.filter(row => { const it = known(row); return it && row.quantity !== '' && row.quantity !== undefined && Number(row.quantity) !== it.stock; }).length;
    const alignBox = el('input', { type: 'checkbox', checked: align || null });
    const noteInput = el('input', { maxlength: 300, value: note });
    const message = errorLine();
    const preview = el('div', { class: 'mg-table-wrap' }, el('table', { class: 'mg-table' },
      el('thead', {}, el('tr', {}, ['', 'Référence', 'Désignation', 'Type', 'Fournisseur', 'Quantité', 'Stock actuel'].map(t => el('th', { text: t })))),
      el('tbody', {}, rows.slice(0, 200).map(row => {
        const it = known(row);
        return el('tr', {},
          el('td', {}, el('span', { class: 'mg-badge ' + (it ? 'blue' : 'green'), text: it ? 'Connu' : 'Nouveau' })),
          el('td', { text: row.ref || '(à créer)' }), el('td', { text: row.name || it?.name || '' }), el('td', { text: row.type || it?.type || '' }),
          el('td', { text: row.supplier || it?.supplier || '' }), el('td', { class: 'n', text: row.quantity ?? '' }), el('td', { class: 'n', text: it ? fr(it.stock) : '—' }));
      }))));
    const apply = el('button', { type: 'button', class: 'mg-primary', text: 'Charger dans le magasin' });
    const box = dialog(title, rows.length + ' ligne(s) lue(s) · ' + created + ' nouvel(s) article(s) · ' + gaps + ' écart(s) de stock',
      preview, rows.length > 200 ? el('p', { class: 'mg-help', text: 'Aperçu limité aux 200 premières lignes ; toutes seront chargées.' }) : null,
      el('label', { class: 'mg-check' }, alignBox, el('span', { text: 'Remplacer le stock par la quantité de la liste (une entrée ou une sortie « inventaire » corrige l’écart)' })),
      field('Motif des corrections de stock', noteInput),
      el('p', { class: 'mg-help', text: 'Les articles inconnus sont créés (la quantité devient leur stock initial). Les articles connus sont complétés : les cases vides de la liste ne remplacent rien.' }),
      message, el('div', { class: 'mg-actions' }, apply));
    apply.onclick = async () => {
      apply.disabled = true; apply.textContent = 'Chargement…'; message.textContent = '';
      try {
        let totals = { added: 0, updated: 0, moved: 0, skipped: 0 };
        for (let i = 0; i < rows.length; i += 500) {
          const r = await rpc('store_import', { p_rows: rows.slice(i, i + 500), p_align: alignBox.checked, p_note: noteInput.value });
          for (const key of Object.keys(totals)) totals[key] += r[key] || 0;
          apply.textContent = 'Chargement… ' + Math.min(rows.length, i + 500) + ' / ' + rows.length;
        }
        box.close();
        await onApplied?.();
        onDone?.(totals.added + ' article(s) créé(s), ' + totals.updated + ' complété(s), ' + totals.moved + ' mouvement(s) de stock' + (totals.skipped ? ', ' + totals.skipped + ' ligne(s) vide(s) ignorée(s)' : '') + '.');
      } catch (error) { message.textContent = error.message; apply.disabled = false; apply.textContent = 'Réessayer'; }
    };
  }
  function pickFile(accept, onFile) {
    const input = el('input', { type: 'file', accept, hidden: true, onchange: () => { const f = input.files[0]; input.remove(); if (f) onFile(f); } });
    document.body.append(input); input.click();
  }

  // ───────── Export Excel et PDF ─────────
  async function exportItemsExcel(items, settings, name) {
    const X = await xlsx();
    const rows = [['Type', 'Catégorie', 'Fournisseur', 'Référence', 'Désignation', 'Unité', 'Emplacement', 'Stock', 'Seuil d’alerte', 'Entrées', 'Sorties', 'État']];
    for (const i of sortItems(items)) rows.push([i.type, i.category, i.supplier, i.ref, i.name, i.unit, i.location, i.stock, i.threshold, Number(i.incoming || 0), Number(i.outgoing || 0),
      i.archived_at ? 'Archivé' : i.stock === 0 ? 'En rupture' : i.stock <= i.threshold ? 'Stock faible' : 'Disponible']);
    const wb = X.utils.book_new();
    X.utils.book_append_sheet(wb, sheet(X, rows, [22, 12, 22, 18, 40, 9, 18, 9, 9, 9, 9, 13]), 'Inventaire');
    X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([[settings?.name || 'L’Atelier MELEC — Magasin électrique'], [settings?.address || ''], [], ['Export du', new Date().toLocaleString('fr-FR')], ['Références', items.length]]), 'Établissement');
    X.writeFile(wb, name);
  }
  async function inventoryPdf(filtered, settings, filter) {
    const JsPDF = await jsPDF();
    const p = new JsPDF({ orientation: 'landscape' });
    const w = p.internal.pageSize.getWidth(), h = p.internal.pageSize.getHeight();
    let y = 18, page = 1;
    const X = [16, 48, 120, 184, 232, 251, 272];
    const header = () => {
      p.setTextColor(26, 40, 53); p.setFont('helvetica', 'bold'); p.setFontSize(20);
      p.text(settings?.name || 'L’Atelier MELEC — Inventaire électrique', 14, 20);
      p.setFont('helvetica', 'normal'); p.setFontSize(10);
      if (settings?.address) { const a = p.splitTextToSize(settings.address, 220); p.text(a, 14, 28); y = 30 + a.length * 5; } else y = 30;
      if (settings?.logo) { try { p.addImage(settings.logo, 'JPEG', w - 40, 10, 25, 25); } catch { /* logo illisible : ignoré */ } }
      p.setTextColor(90, 100, 110);
      p.text('Inventaire du ' + new Date().toLocaleString('fr-FR') + ' • ' + filtered.length + ' référence(s)', 14, y + 6);
      p.text(p.splitTextToSize([filter.type, filter.category, filter.supplier].filter(Boolean).join(' / '), 250), 14, y + 12);
      y += 24;
      p.setFillColor(237, 242, 240); p.rect(14, y, w - 28, 9, 'F');
      p.setTextColor(26, 40, 53); p.setFont('helvetica', 'bold');
      ['Référence', 'Désignation', 'Type / catégorie', 'Fournisseur', 'Stock', 'Entrées', 'Sorties'].forEach((t, i) => p.text(t, X[i], y + 6));
      y += 12; p.setFont('helvetica', 'normal');
    };
    const footer = () => { p.setFontSize(9); p.setTextColor(110, 120, 125); p.text('L’Atelier MELEC • Magasin • Page ' + page, 14, h - 8); };
    header();
    for (const i of filtered) {
      const cols = [p.splitTextToSize(i.ref, 30), p.splitTextToSize(i.name, 68), p.splitTextToSize(i.type + '\n' + i.category, 60), p.splitTextToSize(i.supplier, 42),
        p.splitTextToSize(i.stock + ' ' + i.unit, 17), [String(i.incoming || 0)], [String(i.outgoing || 0)]];
      const row = Math.max(...cols.map(c => c.length)) * 4.5 + 7;
      if (y + row > h - 16) { footer(); p.addPage(); page++; header(); }
      p.setFontSize(9); p.setTextColor(30, 45, 55);
      cols.forEach((c, j) => p.text(c, X[j], y + 5));
      y += row; p.setDrawColor(225, 230, 232); p.line(14, y, w - 14, y);
    }
    footer();
    return p;
  }

  // ───────── Inventaires des élèves : regroupement et Excel organisé ─────────
  function consolidate(counts, items, studentName) {
    const byId = new Map(items.map(i => [i.id, i]));
    const byRef = new Map(items.map(i => [norm(i.ref), i]));
    const lines = new Map();
    for (const c of counts) for (const l of c.lines || []) {
      const it = (l.item_id && byId.get(l.item_id)) || (l.ref && byRef.get(norm(l.ref))) || null;
      const key = it ? 'id:' + it.id : 'new:' + norm(l.ref || l.name);
      const row = lines.get(key) || { item: it, ref: it?.ref || l.ref || '', name: it?.name || l.name || '', type: it?.type || l.type || '', category: it?.category || l.category || '',
        supplier: it?.supplier || l.supplier || '', unit: it?.unit || l.unit || 'pièce', location: l.location || it?.location || '', counted: 0, who: new Set(), notes: [] };
      row.counted += Math.max(0, Number(l.counted) || 0);
      row.who.add(studentName(c.student_id));
      if (l.note) row.notes.push(l.note);
      lines.set(key, row);
    }
    return sortItems([...lines.values()]);
  }
  async function countsExcel(counts, items, studentName, className) {
    const X = await xlsx();
    const rows = consolidate(counts, items, studentName);
    const inv = [['Type', 'Catégorie', 'Fournisseur', 'Référence', 'Désignation', 'Unité', 'Emplacement', 'Quantité comptée', 'Stock théorique', 'Écart', 'Nouvel article', 'Compté par', 'Remarques']];
    for (const r of rows) inv.push([r.type, r.category, r.supplier, r.ref, r.name, r.unit, r.location, r.counted, r.item ? r.item.stock : '', r.item ? r.counted - r.item.stock : '', r.item ? '' : 'Oui', [...r.who].join(', '), r.notes.join(' · ')]);
    const detail = [['Élève', 'Classe', 'Envoyé le', 'Référence', 'Désignation', 'Quantité comptée', 'Remarque']];
    for (const c of counts) for (const l of c.lines || []) detail.push([studentName(c.student_id), className(c.class_id), c.submitted_at ? new Date(c.submitted_at).toLocaleString('fr-FR') : '', l.ref || '', l.name || '', Number(l.counted) || 0, l.note || '']);
    const gaps = rows.filter(r => r.item && r.counted !== r.item.stock);
    const summary = [['Inventaire du magasin — synthèse'], [], ['Édité le', new Date().toLocaleString('fr-FR')],
      ['Classe(s)', uniq(counts.map(c => className(c.class_id))).join(', ')], ['Élèves', uniq(counts.map(c => studentName(c.student_id))).join(', ')],
      ['Références comptées', rows.length], ['Nouveaux articles', rows.filter(r => !r.item).length], ['Écarts avec le stock', gaps.length], [],
      ['Pour mettre le magasin à jour : Accès équipe → Ajouter des articles (Excel) → choisir ce fichier.']];
    const wb = X.utils.book_new();
    X.utils.book_append_sheet(wb, sheet(X, inv, [22, 12, 22, 18, 40, 9, 18, 16, 15, 9, 13, 26, 30]), 'Inventaire');
    X.utils.book_append_sheet(wb, sheet(X, detail, [26, 12, 18, 18, 40, 16, 30]), 'Détail par élève');
    X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(summary), 'Synthèse');
    X.writeFile(wb, 'inventaire-magasin-' + today() + '.xlsx');
    return rows;
  }

  // ───────── Filtres « Explorer le magasin » (communs équipe / élève) ─────────
  function filterPanel(state, lists, onChange) {
    const select = (key, placeholder, values, groups) => {
      const s = el('select', { onchange: () => { state[key] = s.value; onChange(); } }, option('', placeholder));
      if (groups) {
        s.append(el('optgroup', { label: 'Fabricants' }, values.filter(v => !DISTRIBUTORS.includes(v)).map(v => option(v, v, state[key] === v))));
        s.append(el('optgroup', { label: 'Distributeurs' }, DISTRIBUTORS.map(v => option(v, v, state[key] === v))));
      } else values.forEach(v => s.append(option(v, v, state[key] === v)));
      return s;
    };
    const search = el('input', { type: 'search', placeholder: 'Référence, désignation…', value: state.search, oninput: () => { state.search = search.value; onChange(true); } });
    const selected = state.type || state.category || state.supplier;
    return el('section', { class: 'mg-filter-panel' },
      el('div', { class: 'mg-filter-heading' }, el('span', {}, el('b', { 'aria-hidden': 'true', text: '⚙' }), ' Explorer le magasin'), el('small', { text: lists.hint || 'Votre inventaire apparaît après une sélection' })),
      el('div', { class: 'mg-filters' },
        field('Type de matériel', select('type', 'Choisir un type', lists.types)),
        field('Catégorie', select('category', 'Choisir une catégorie', lists.categories)),
        field('Fournisseur / fabricant', select('supplier', 'Choisir un fournisseur', lists.suppliers, true)),
        field('Rechercher', el('div', { class: 'mg-search' }, el('span', { 'aria-hidden': 'true', text: '⌕' }), search))),
      selected ? el('div', { class: 'mg-filter-bottom' },
        el('span', {}, [state.type, state.category, state.supplier].filter(Boolean).map(v => el('span', { class: 'mg-chip', text: v }))),
        el('button', { type: 'button', class: 'mg-text-button', text: '✕ Effacer les filtres', onclick: () => { state.type = state.category = state.supplier = state.search = ''; onChange(); } })) : null);
  }
  const matches = (i, f) => (!f.type || i.type === f.type) && (!f.category || i.category === f.category) && (!f.supplier || i.supplier === f.supplier) &&
    (!f.search || norm(i.name + ' ' + i.ref + ' ' + (i.location || '')).includes(norm(f.search)));

  // ───────────────────────────── Accès équipe ─────────────────────────────
  function initTeam(root) {
    const state = { type: '', category: '', supplier: '', search: '' };
    let data = { items: [], movements: [], admin: false }, settings = null, settingsVersion = null, online = false, loaded = false;
    let showArchived = false, tab = 'stock', view = 'cards', section = 'store', timer = 0, busy = false, counts = [], students = [], classes = [], version = '';
    const status = el('p', { class: 'mg-toast', role: 'status' });
    const say = (text, error) => { status.textContent = text; status.classList.toggle('error', Boolean(error)); if (text) setTimeout(() => { if (status.textContent === text) status.textContent = ''; }, 5000); };
    const visible = () => !root.classList.contains('hidden') && document.visibilityState !== 'hidden';
    async function load() {
      const inv = await rpc('store_inventory');
      if (!settings || settingsVersion !== inv.settings_version) {
        settings = (await api.rest('store_settings?select=name,address,logo,updated_at&id=eq.1'))[0] || null;
        settingsVersion = inv.settings_version;
      }
      data = inv; online = true; loaded = true;
      document.dispatchEvent(new CustomEvent('melec-store-role', { detail: { admin: Boolean(inv.admin) } }));
    }
    async function loadCounts() {
      const [c, s, k] = await Promise.all([
        api.rest('store_counts?select=id,student_id,class_id,lines,submitted_at,loaded_at&submitted_at=not.is.null&order=submitted_at.desc&limit=200'),
        api.rest('student_profiles?select=user_id,last_name,first_name,class_id&order=last_name.asc,first_name.asc'),
        (window.MelecRegistre ? window.MelecRegistre.ensureClasses() : Promise.resolve()).then(() => api.rest('teaching_classes?select=id,name&order=name.asc'))]);
      counts = c; students = s; classes = k;
    }
    const studentName = id => { const s = students.find(x => x.user_id === id); return s ? (s.last_name + ' ' + s.first_name).trim() : 'Élève'; };
    const className = id => classes.find(c => c.id === id)?.name || '';
    function schedule() {
      clearTimeout(timer);
      if (!visible()) return;
      timer = setTimeout(async () => {
        if (!visible() || busy || document.querySelector('dialog.mg-dialog[open]')) return schedule();
        // Synchronisation avec l'administrateur et les autres membres : petit appel de version,
        // le magasin n'est relu que s'il a changé (article, mouvement, réglage, inventaire d'élève).
        try {
          const next = await rpc('store_version');
          if (next !== version) { await Promise.all([load(), loadCounts()]); version = next; render(); }
          else if (!online) { online = true; renderStatus(); }
        } catch { online = false; renderStatus(); }
        schedule();
      }, online ? POLL_MS : POLL_MS * 2);
    }
    async function open() {
      if (!loaded) fill(root, el('div', { class: 'teach-card', text: 'Connexion au magasin…' }));
      try { await Promise.all([load(), loadCounts(), rpc('store_version').then(v => { version = v; })]); }
      catch (error) { online = false; if (!loaded) { fill(root, el('div', { class: 'teach-card' }, el('h2', { text: 'Accès équipe' }), el('p', { text: 'Magasin indisponible : ' + error.message }))); return; } }
      render(); schedule();
    }
    async function mutate(body, message) {
      busy = true;
      try {
        await rpc('store_mutate', { b: body });
        try { await load(); } catch { message += ' Actualisation momentanément indisponible ; ne répétez pas l’opération.'; }
        say(message); render(); return true;
      } finally { busy = false; }
    }
    const lists = () => ({
      types: uniq([...TYPES, ...data.items.map(i => i.type)]),
      categories: uniq([...CATEGORIES, ...data.items.map(i => i.category)]),
      suppliers: uniq([...MANUFACTURERS, ...DISTRIBUTORS, ...data.items.map(i => i.supplier)])
    });
    const connection = el('span', { class: 'mg-connection' });
    function renderStatus() { connection.className = 'mg-connection' + (online ? '' : ' offline'); connection.textContent = online ? 'Synchronisé' : loaded ? 'Hors connexion' : 'Connexion…'; }

    function articleForm(article) {
      const values = { ...BLANK, ...article };
      const l = lists();
      const input = (key, extra = {}) => el('input', { maxlength: 160, value: values[key] ?? '', required: key !== 'location' || null, oninput: e => { values[key] = e.target.value; }, ...extra });
      const withList = (key, options) => { const id = 'mg-list-' + key + '-' + Math.random().toString(36).slice(2, 7); return [input(key, { list: id }), el('datalist', { id }, options.map(v => option(v)))]; };
      const message = errorLine();
      const form = el('form', { class: 'mg-form' },
        el('div', { class: 'mg-grid' },
          field('Désignation', input('name', { placeholder: 'Ex. Disjoncteur 16 A — 1P+N' })),
          field('Référence', input('ref', { placeholder: 'Référence fabricant' })),
          field('Type de matériel', withList('type', l.types)),
          field('Catégorie', withList('category', l.categories)),
          field('Fournisseur / fabricant', withList('supplier', l.suppliers)),
          field('Unité', withList('unit', UNITS)),
          field('Emplacement (facultatif)', input('location', { placeholder: 'Ex. Rayon A · Bac 03' })),
          article.id ? null : field('Stock initial', el('input', { type: 'number', min: 0, max: 10000000, required: true, value: values.stock, oninput: e => { values.stock = Number(e.target.value); } })),
          field('Seuil d’alerte', el('input', { type: 'number', min: 0, max: 10000000, required: true, value: values.threshold, oninput: e => { values.threshold = Number(e.target.value); } }))),
        article.id ? el('p', { class: 'mg-help', text: 'Pour modifier la quantité, enregistrez une entrée ou une sortie : chaque mouvement reste traçable.' }) : null,
        message, el('button', { class: 'mg-primary', text: article.id ? 'Enregistrer les modifications' : 'Ajouter au magasin' }));
      const box = dialog(article.id ? 'Modifier l’article' : 'Une nouvelle référence', 'Renseignez le matériel pour l’ajouter au magasin.', form);
      form.onsubmit = async event => {
        event.preventDefault(); message.textContent = '';
        const button = form.querySelector('button.mg-primary'); button.disabled = true;
        try { await mutate({ action: article.id ? 'edit' : 'item', ...values }, article.id ? 'Article mis à jour.' : 'Article ajouté au magasin.'); box.close(); }
        catch (error) { message.textContent = error.message; button.disabled = false; }
      };
    }
    function movementForm(item, kind) {
      let quantity = 1, note = '';
      const current = () => data.items.find(i => i.id === item.id)?.stock ?? item.stock;
      const message = errorLine();
      const form = el('form', { class: 'mg-form' },
        el('div', { class: 'mg-movement-stock' }, 'Stock actuel ', el('strong', { text: fr(current()) + ' ' + item.unit })),
        field('Quantité (' + item.unit + ')', el('input', { type: 'number', min: 1, max: kind === 'out' ? current() : 10000000, required: true, value: 1, autofocus: true, oninput: e => { quantity = Number(e.target.value); } })),
        field('Motif / destinataire (facultatif)', el('textarea', { maxlength: 400, placeholder: 'Livraison, atelier, chantier…', oninput: e => { note = e.target.value; } })),
        message, el('button', { class: 'mg-primary' + (kind === 'out' ? ' orange' : ''), text: 'Confirmer le mouvement' }));
      const box = dialog(kind === 'in' ? 'Enregistrer une entrée' : 'Enregistrer une sortie', item.name + ' · ' + item.ref, form);
      form.onsubmit = async event => {
        event.preventDefault(); message.textContent = '';
        const button = form.querySelector('button.mg-primary'); button.disabled = true;
        try { await mutate({ action: 'movement', id: item.id, kind, quantity, note }, 'Mouvement enregistré. Le stock est à jour.'); box.close(); }
        catch (error) { message.textContent = error.message; button.disabled = false; }
      };
    }
    function archiveForm(item) {
      const message = errorLine();
      const button = el('button', { type: 'button', class: 'mg-primary', text: item.archived_at ? 'Restaurer' : 'Confirmer l’archivage' });
      const box = dialog(item.archived_at ? 'Restaurer la référence' : 'Archiver la référence', item.name + ' · ' + item.ref,
        el('p', { class: 'mg-help-box', text: item.archived_at ? 'La référence redeviendra disponible pour les entrées et les sorties.' : 'L’historique sera conservé et la référence pourra être restaurée. Le stock doit être à zéro avant l’archivage.' }),
        message, button);
      button.onclick = async () => {
        button.disabled = true;
        try { await mutate({ action: item.archived_at ? 'restore' : 'archive', id: item.id }, item.archived_at ? 'Référence restaurée.' : 'Référence archivée.'); box.close(); }
        catch (error) { message.textContent = error.message; button.disabled = false; }
      };
    }
    function emailForm(filtered) {
      const message = errorLine();
      const input = el('input', { type: 'email', required: true, placeholder: 'destinataire@etablissement.fr' });
      const form = el('form', { class: 'mg-form' }, field('Adresse e-mail du destinataire', input),
        el('p', { class: 'mg-help-box', text: 'Le PDF sera téléchargé et votre messagerie s’ouvrira. Ajoutez le fichier en pièce jointe avant d’envoyer. Sur les appareils compatibles, le partage du PDF est proposé directement.' }),
        message, el('button', { class: 'mg-primary', text: 'Préparer le PDF et le message' }));
      const box = dialog('Transmettre l’inventaire', 'Le PDF contient les ' + filtered.length + ' références sélectionnées et les informations de votre établissement.', form);
      form.onsubmit = async event => {
        event.preventDefault();
        try {
          const p = await inventoryPdf(filtered, settings, state);
          const file = new File([p.output('blob')], 'magasin-inventaire.pdf', { type: 'application/pdf' });
          if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: 'Inventaire du magasin', text: 'Inventaire à transmettre à ' + input.value }); say('PDF partagé via votre appareil.'); }
          else {
            p.save('magasin-inventaire.pdf');
            window.location.href = 'mailto:' + encodeURIComponent(input.value) + '?subject=' + encodeURIComponent('Inventaire électrique — ' + (settings?.name || 'L’Atelier MELEC')) +
              '&body=' + encodeURIComponent('Bonjour,\n\nVeuillez trouver ci-joint l’inventaire du magasin électrique.\n\nAjoutez le fichier magasin-inventaire.pdf téléchargé à ce message avant de l’envoyer.');
            say('PDF téléchargé : ajoutez-le en pièce jointe au message.');
          }
          box.close();
        } catch (error) { message.textContent = error.name === 'AbortError' ? 'Partage annulé.' : 'Impossible de préparer le PDF.'; }
      };
    }
    const importExcel = () => pickFile('.xlsx,.xls,.csv,.ods', async file => {
      try { const rows = await readListFile(file); if (!rows.length) throw new Error('Aucune ligne utilisable dans ce fichier.'); importDialog(rows, { items: data.items, onApplied: load, onDone: text => { say(text); render(); } }); }
      catch (error) { say(error.message, true); }
    });

    function itemCard(i) {
      const statusText = i.archived_at ? 'Archivé' : i.stock === 0 ? 'En rupture' : i.stock <= i.threshold ? 'Stock faible' : 'Disponible';
      const statusClass = i.archived_at ? '' : i.stock === 0 ? 'out' : i.stock <= i.threshold ? 'low' : '';
      return el('article', { class: 'mg-item' },
        el('div', { class: 'mg-item-top' },
          el('span', { class: 'mg-item-icon', 'aria-hidden': 'true', text: '⚡' }),
          el('span', { class: 'mg-stock-status ' + statusClass }, el('i'), statusText),
          el('button', { type: 'button', class: 'mg-icon-button', 'aria-label': 'Modifier ' + i.name, title: 'Modifier', text: '✎', disabled: !online || null, onclick: () => articleForm(i) })),
        el('div', { class: 'mg-item-title' }, el('span', { class: 'mg-reference', text: i.ref }), el('h3', { text: i.name }), el('p', {}, i.type, el('span', { text: ' · ' }), i.category)),
        el('div', { class: 'mg-item-meta' }, el('span', { text: i.supplier }), i.location ? el('span', { text: i.location }) : null),
        el('div', { class: 'mg-quantity' }, el('strong', { text: fr(i.stock) }),
          el('span', {}, i.unit + (i.stock > 1 && i.unit === 'pièce' ? 's' : '') + ' en stock', el('small', { text: 'Seuil d’alerte : ' + i.threshold }))),
        el('div', { class: 'mg-item-counters' }, el('span', { text: '↙ ' + fr(i.incoming) + ' entrées' }), el('span', { text: '↗ ' + fr(i.outgoing) + ' sorties' })),
        i.archived_at ? null : el('div', { class: 'mg-item-actions' },
          el('button', { type: 'button', disabled: !online || null, text: '＋ Entrée', onclick: () => movementForm(i, 'in') }),
          el('button', { type: 'button', disabled: !online || !i.stock || null, text: '↗ Sortie', onclick: () => movementForm(i, 'out') })),
        el('button', { type: 'button', class: 'mg-text-button mg-archive', disabled: !online || null, text: i.archived_at ? '⟲ Restaurer la référence' : '▣ Archiver la référence', onclick: () => archiveForm(i) }));
    }
    function history(movements) {
      return el('div', { class: 'mg-history' },
        movements.length ? el('div', { class: 'mg-table-wrap' }, el('table', { class: 'mg-table' },
          el('thead', {}, el('tr', {}, ['Date et heure', 'Article', 'Mouvement', 'Quantité', 'Effectué par', 'Motif'].map(t => el('th', { text: t })))),
          el('tbody', {}, movements.map(m => el('tr', {},
            el('td', { text: new Date(m.created).toLocaleString('fr-FR') }),
            el('td', {}, el('strong', { text: m.name }), el('small', { text: m.ref })),
            el('td', {}, el('span', { class: 'mg-badge ' + (m.kind === 'in' ? 'green' : 'orange'), text: m.kind === 'in' ? 'Entrée' : 'Sortie' })),
            el('td', { text: m.quantity + ' ' + m.unit }), el('td', { class: 'mg-author', text: m.author_email || 'Auteur non renseigné' }), el('td', { text: m.note || '—' })))))) :
          el('div', { class: 'mg-empty' }, el('h3', { text: 'Aucun mouvement enregistré' })),
        el('p', { class: 'mg-help', text: 'Les 200 derniers mouvements du magasin sont disponibles dans cet historique. Les compteurs incluent tous les mouvements, même ceux des références archivées.' }));
    }
    function renderStore() {
      const filtered = data.items.filter(i => Boolean(i.archived_at) === showArchived && matches(i, state));
      const selected = Boolean(state.type || state.category || state.supplier);
      const ids = new Set(filtered.map(i => i.id));
      const movements = data.movements.filter(m => ids.has(m.item_id));
      const sum = key => filtered.reduce((s, i) => s + Number(i[key] || 0), 0);
      const panel = filterPanel(state, lists(), searching => { if (searching) { clearTimeout(renderStore.t); renderStore.t = setTimeout(render, 160); } else render(); });
      if (!selected) return [panel, el('p', { class: 'mg-hint', text: fr(data.items.filter(i => !i.archived_at).length) + ' référence(s) active(s) dans le magasin. Choisissez un type, une catégorie ou un fournisseur pour les afficher.' })];
      const stats = [
        ['Références sélectionnées', filtered.length, 'neutral', '▦'],
        ['Stock disponible', sum('stock'), 'neutral', '▣', new Set(filtered.map(i => i.unit)).size > 1 ? 'Unités mixtes' : ''],
        ['Entrées cumulées', sum('incoming'), 'green', '↙'],
        ['Sorties cumulées', sum('outgoing'), 'orange', '↗']];
      return [panel, el('div', { class: 'mg-results' },
        field('Afficher', el('select', { onchange: e => { showArchived = e.target.value === 'archived'; render(); } },
          option('active', 'Références actives', !showArchived), option('archived', 'Références archivées', showArchived))),
        el('section', { class: 'mg-stats' }, stats.map(([label, value, color, icon, small]) => el('div', { class: 'mg-stat ' + color },
          el('span', { class: 'mg-stat-icon', 'aria-hidden': 'true', text: icon }), el('div', {}, el('small', { text: label }), el('strong', { text: fr(value) }), small ? el('small', { text: small }) : null)))),
        el('div', { class: 'mg-toolbar' },
          el('div', { class: 'mg-tabs' },
            el('button', { type: 'button', class: tab === 'stock' ? 'active' : '', onclick: () => { tab = 'stock'; render(); } }, '▦ Inventaire ', el('span', { text: String(filtered.length) })),
            el('button', { type: 'button', class: tab === 'history' ? 'active' : '', text: '⟲ Mouvements', onclick: () => { tab = 'history'; render(); } })),
          el('div', { class: 'mg-export' },
            el('button', { type: 'button', class: 'subtle', disabled: !filtered.length || null, text: '⤓ PDF', onclick: async () => { try { (await inventoryPdf(filtered, settings, state)).save('magasin-inventaire.pdf'); say('Le PDF a été téléchargé.'); } catch { say('La génération du PDF a échoué.', true); } } }),
            el('button', { type: 'button', class: 'subtle', disabled: !filtered.length || null, text: '⤓ Excel', onclick: () => exportItemsExcel(filtered, settings, 'magasin-selection-' + today() + '.xlsx').catch(error => say(error.message, true)) }),
            el('button', { type: 'button', class: 'subtle', disabled: !filtered.length || null, text: '✉ Envoyer', onclick: () => emailForm(filtered) }),
            el('div', { class: 'mg-view-toggle' },
              el('button', { type: 'button', 'aria-label': 'Vue cartes', title: 'Vue cartes', class: view === 'cards' ? 'active' : '', text: '▦', onclick: () => { view = 'cards'; render(); } }),
              el('button', { type: 'button', 'aria-label': 'Vue liste', title: 'Vue liste', class: view === 'list' ? 'active' : '', text: '☰', onclick: () => { view = 'list'; render(); } })))),
        tab === 'stock' ? (filtered.length ? el('div', { class: 'mg-inventory ' + view }, filtered.map(itemCard)) :
          el('div', { class: 'mg-empty' }, el('h3', { text: 'Aucun article pour cette sélection' }), el('p', { text: 'Ajoutez votre première référence ou modifiez les filtres.' }),
            el('button', { type: 'button', class: 'mg-primary', disabled: !online || null, text: '＋ Ajouter un article', onclick: () => articleForm({ ...BLANK, type: state.type || BLANK.type, category: state.category || BLANK.category, supplier: state.supplier || BLANK.supplier }) })))
          : history(movements),
        el('div', { class: 'mg-footer' }, el('span', { text: '⟳ Actualisation automatique toutes les 15 secondes, en pause lorsque l’onglet est masqué' }),
          el('span', { text: filtered.filter(i => !i.archived_at && i.stock <= i.threshold).length + ' référence(s) sous le seuil d’alerte' })))];
    }
    function renderCounts() {
      const waiting = counts.filter(c => !c.loaded_at);
      const loadCountsInStore = list => {
        const rows = consolidate(list, data.items, studentName).map(r => ({ ref: r.ref, name: r.name, type: r.type, category: r.category, supplier: r.supplier, unit: r.unit, location: r.location, quantity: String(r.counted) }));
        importDialog(rows, { title: 'Charger l’inventaire des élèves', align: true, items: data.items, onApplied: async () => { await Promise.all(list.map(c => rpc('store_count_mark', { p_id: c.id, p_action: 'loaded' }))); await Promise.all([load(), loadCounts()]); }, onDone: text => { say(text); render(); } });
      };
      return el('section', { class: 'mg-counts' },
        el('div', { class: 'mg-counts-head' },
          el('p', { text: counts.length ? waiting.length + ' inventaire(s) en attente sur ' + counts.length + ' reçu(s). L’Excel regroupe les comptages par type, catégorie et fournisseur, avec le stock théorique et l’écart.' : 'Aucun inventaire reçu pour l’instant. Les élèves le font depuis leur espace, onglet « Inventaire magasin ».' }),
          counts.length ? el('div', { class: 'mg-actions' },
            el('button', { type: 'button', class: 'subtle', disabled: !waiting.length || null, text: '⤓ Excel des inventaires en attente', onclick: () => countsExcel(waiting, data.items, studentName, className).catch(error => say(error.message, true)) }),
            el('button', { type: 'button', class: 'mg-primary', disabled: !waiting.length || null, text: 'Charger dans le magasin', onclick: () => loadCountsInStore(waiting) })) : null),
        counts.length ? el('div', { class: 'mg-table-wrap' }, el('table', { class: 'mg-table' },
          el('thead', {}, el('tr', {}, ['Élève', 'Classe', 'Envoyé le', 'Articles comptés', 'Nouveaux', 'État', ''].map(t => el('th', { text: t })))),
          el('tbody', {}, counts.map(c => el('tr', {},
            el('td', { text: studentName(c.student_id) }), el('td', { text: className(c.class_id) }), el('td', { text: new Date(c.submitted_at).toLocaleString('fr-FR') }),
            el('td', { class: 'n', text: String((c.lines || []).length) }), el('td', { class: 'n', text: String((c.lines || []).filter(l => !l.item_id).length) }),
            el('td', {}, el('span', { class: 'mg-badge ' + (c.loaded_at ? 'green' : 'orange'), text: c.loaded_at ? 'Chargé le ' + new Date(c.loaded_at).toLocaleDateString('fr-FR') : 'En attente' })),
            el('td', {}, el('div', { class: 'mg-actions' },
              el('button', { type: 'button', class: 'subtle', text: 'Excel', onclick: () => countsExcel([c], data.items, studentName, className).catch(error => say(error.message, true)) }),
              c.loaded_at ? null : el('button', { type: 'button', class: 'subtle', text: 'Charger', onclick: () => loadCountsInStore([c]) }),
              el('button', { type: 'button', class: 'warn', text: 'Supprimer', onclick: async () => {
                if (!confirm('Supprimer définitivement l’inventaire de ' + studentName(c.student_id) + ' ?')) return;
                try { await rpc('store_count_mark', { p_id: c.id, p_action: 'delete' }); await loadCounts(); render(); say('Inventaire supprimé.'); } catch (error) { say(error.message, true); }
              } })))))))) : null);
    }
    function render() {
      renderStatus();
      const waiting = counts.filter(c => !c.loaded_at).length;
      fill(root,
        el('div', { class: 'teach-head mg-head' },
          el('div', {}, el('span', { class: 'mg-eyebrow', text: 'Gestion du matériel électrique' }), el('h1', { text: 'Accès équipe' }), el('p', { text: 'Votre magasin. En temps réel. Un inventaire organisé : chaque entrée et sortie enregistrée.' })),
          el('div', { class: 'mg-head-actions' }, connection,
            el('button', { type: 'button', class: 'subtle', disabled: !online || null, text: '⤒ Ajouter des articles (Excel)', onclick: importExcel }),
            el('button', { type: 'button', class: 'mg-primary', disabled: !online || null, text: '＋ Nouvel article', onclick: () => articleForm({ ...BLANK }) }))),
        el('div', { class: 'teach-tabs mg-sections', role: 'tablist' },
          el('button', { type: 'button', class: section === 'store' ? 'active' : '', text: 'Magasin', onclick: () => { section = 'store'; render(); } }),
          el('button', { type: 'button', class: section === 'counts' ? 'active' : '', onclick: async () => { section = 'counts'; try { await loadCounts(); } catch (error) { say(error.message, true); } render(); } },
            'Inventaires des élèves', waiting ? el('span', { class: 'mg-count-badge', text: String(waiting) }) : null)),
        el('div', { class: 'teach-card mg-card' }, section === 'store' ? renderStore() : renderCounts()),
        status);
    }
    document.addEventListener('visibilitychange', () => { if (visible()) { load().then(render, () => {}); schedule(); } });
    // Rôle administrateur : la liste des accès ne répond qu'à un administrateur (réponse légère,
    // sans télécharger tout l'inventaire à la connexion).
    const probe = () => rpc('store_admin_members').then(() => true, error => { if (/administrateur/i.test(error.message)) return false; throw error; })
      .then(admin => document.dispatchEvent(new CustomEvent('melec-store-role', { detail: { admin } })));
    return { open, stop: () => clearTimeout(timer), probe };
  }

  // ───────────────────────────── Administration ─────────────────────────────
  function initAdmin(root) {
    let settings = { name: '', address: '', logo: '' }, members = [], items = [], version = '', timer = 0;
    const status = el('p', { class: 'mg-toast', role: 'status' });
    const say = (text, error) => { status.textContent = text; status.classList.toggle('error', Boolean(error)); };
    const visible = () => !root.classList.contains('hidden') && document.visibilityState !== 'hidden';
    // Synchronisation : les articles ajoutés par l'équipe apparaissent ici sans recharger la page.
    function schedule() {
      clearTimeout(timer);
      if (!visible()) return;
      timer = setTimeout(async () => {
        try {
          const next = await rpc('store_version');
          const editing = root.contains(document.activeElement) && document.activeElement.matches('input,textarea,select');
          if (next !== version && !editing && !document.querySelector('dialog.mg-dialog[open]')) {
            const inv = await rpc('store_inventory'); items = inv.items || []; version = next; renderBase();
          }
        } catch { /* nouvel essai au prochain passage */ }
        schedule();
      }, POLL_MS);
    }
    let myEmail = '';
    async function load() {
      const [s, m, inv, me] = await Promise.all([api.rest('store_settings?select=name,address,logo&id=eq.1'), rpc('store_admin_members'), rpc('store_inventory'), api.user().catch(() => null)]);
      settings = s[0] || settings; members = m || []; items = inv.items || []; myEmail = String(me?.email || '').toLowerCase();
    }
    async function open() {
      fill(root, el('div', { class: 'teach-card', text: 'Chargement de l’administration…' }));
      try { await load(); version = await rpc('store_version').catch(() => ''); render(); schedule(); }
      catch (error) { fill(root, el('div', { class: 'teach-card' }, el('h2', { text: 'Administration' }), el('p', { text: 'Réservée à l’administrateur, avec Authenticator : ' + error.message }))); }
    }
    async function logoFrom(file) {
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 10000000) throw new Error('Choisissez un logo PNG, JPEG ou WebP de moins de 10 Mo.');
      const img = await createImageBitmap(file), canvas = document.createElement('canvas');
      const r = Math.min(1, 500 / img.width, 500 / img.height);
      canvas.width = Math.round(img.width * r); canvas.height = Math.round(img.height * r);
      const ctx = canvas.getContext('2d'); ctx.fillStyle = 'white'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0, canvas.width, canvas.height); img.close?.();
      return canvas.toDataURL('image/jpeg', 0.85);
    }
    const baseCard = el('section', { class: 'teach-card' });
    function renderBase() {
      const active = items.filter(i => !i.archived_at);
      fill(baseCard, el('h2', { text: 'Base du magasin' }),
          el('div', { class: 'mg-stats' },
            [['Références actives', active.length, '▦'], ['Archivées', items.length - active.length, '▣'], ['Unités en stock', active.reduce((s, i) => s + i.stock, 0), '⚡'], ['Sous le seuil', active.filter(i => i.stock <= i.threshold).length, '⚠']]
              .map(([label, value, icon]) => el('div', { class: 'mg-stat neutral' }, el('span', { class: 'mg-stat-icon', 'aria-hidden': 'true', text: icon }), el('div', {}, el('small', { text: label }), el('strong', { text: fr(value) }))))),
          el('p', { class: 'mg-help', text: 'Synchronisation : chargez l’inventaire complet (Excel des élèves complété par l’équipe, ou tout tableau avec Référence, Désignation, Type, Catégorie, Fournisseur, Unité, Emplacement, Quantité). Les articles inconnus sont créés, les connus complétés, et le stock peut être aligné sur les quantités comptées.' }),
          el('div', { class: 'mg-actions' },
            el('button', { type: 'button', class: 'mg-primary', text: '⤒ Charger la base du magasin (Excel)', onclick: () => pickFile('.xlsx,.xls,.csv,.ods', async file => {
              try { const rows = await readListFile(file); if (!rows.length) throw new Error('Aucune ligne utilisable dans ce fichier.'); importDialog(rows, { title: 'Synchroniser la base du magasin', align: true, items, onApplied: load, onDone: text => { say(text); render(); } }); }
              catch (error) { say(error.message, true); }
            }) }),
            el('button', { type: 'button', class: 'subtle', text: '⤓ Télécharger la base complète (Excel)', onclick: () => exportItemsExcel(items, settings, 'magasin-base-complete-' + today() + '.xlsx').catch(error => say(error.message, true)) }),
            el('button', { type: 'button', class: 'subtle', text: '⤓ Modèle de liste vide', onclick: async () => {
              const X = await xlsx(); const wb = X.utils.book_new();
              X.utils.book_append_sheet(wb, sheet(X, [['Type', 'Catégorie', 'Fournisseur', 'Référence', 'Désignation', 'Unité', 'Emplacement', 'Quantité comptée', 'Seuil d’alerte'],
                ['Protection électrique', 'Habitat', 'Schneider Electric', 'A9F74216', 'Disjoncteur 16 A — 1P+N', 'pièce', 'Rayon A · Bac 03', 12, 5]], [22, 12, 22, 18, 40, 9, 18, 16, 12]), 'Inventaire');
              X.writeFile(wb, 'modele-liste-magasin.xlsx');
            } })));
    }
    function render() {
      const school = { ...settings };
      const logoBox = el('div', { class: 'mg-logo-preview' });
      const drawLogo = () => fill(logoBox, school.logo ? [el('img', { src: school.logo, alt: 'Logo de l’établissement' }), el('button', { type: 'button', class: 'mg-text-button', text: 'Retirer', onclick: () => { school.logo = ''; drawLogo(); } })] : null);
      drawLogo();
      const schoolForm = el('form', { class: 'mg-form' },
        field('Nom de l’établissement', el('input', { required: true, maxlength: 160, value: school.name, oninput: e => { school.name = e.target.value; } })),
        field('Adresse complète', el('textarea', { required: true, maxlength: 800, text: school.address, oninput: e => { school.address = e.target.value; } })),
        field('Logo de l’établissement (facultatif)', el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', onchange: async e => { try { school.logo = await logoFrom(e.target.files[0]); drawLogo(); } catch (error) { say(error.message, true); } } })),
        logoBox, el('button', { class: 'mg-primary', text: 'Enregistrer l’établissement' }));
      schoolForm.onsubmit = async event => {
        event.preventDefault();
        try { await rpc('store_mutate', { b: { action: 'settings', ...school } }); settings = school; say('Établissement enregistré.'); } catch (error) { say(error.message, true); }
      };
      const email = el('input', { type: 'email', required: true }), role = el('select', {}, option('team', 'Équipe'), option('admin', 'Administrateur'));
      const memberForm = el('form', { class: 'mg-form mg-inline' }, field('Adresse e-mail', email), field('Rôle', role), el('button', { class: 'mg-primary', text: 'Autoriser cet accès' }));
      memberForm.onsubmit = async event => {
        event.preventDefault();
        try { await rpc('store_mutate', { b: { action: 'member', email: email.value, role: role.value } }); members = await rpc('store_admin_members'); say('Adresse autorisée.'); render(); } catch (error) { say(error.message, true); }
      };
      renderBase();
      fill(root,
        el('div', { class: 'teach-head mg-head' }, el('div', {}, el('span', { class: 'mg-eyebrow', text: 'Espace administrateur' }), el('h1', { text: 'Administration' }),
          el('p', { text: 'Établissement, accès au magasin et synchronisation de la base.' }))),
        el('div', { class: 'mg-admin-grid' },
          el('section', { class: 'teach-card' }, el('h2', { text: 'Votre établissement' }), el('p', { class: 'mg-help', text: 'Ces informations apparaîtront sur vos exports PDF.' }), schoolForm),
          el('section', { class: 'teach-card' }, el('h2', { text: 'Accès au magasin' }),
            el('p', { class: 'mg-help', text: 'Tous les enseignants de L’Atelier MELEC ont l’accès équipe. Autorisez ici d’autres adresses ou un administrateur ; chaque personne crée son compte et configure Authenticator. Aucun mot de passe n’est partagé.' }),
            memberForm,
            el('div', { class: 'mg-members' }, members.map(m => el('div', { class: 'mg-member' },
              el('span', {}, m.email, el('small', { text: [(m.role === 'admin' ? 'Administrateur' : 'Équipe'), m.active ? 'Actif' : 'Désactivé',
                m.teacher ? 'compte enseignant' : !m.account ? 'compte pas encore créé' : !m.confirmed ? 'adresse à confirmer' : 'compte équipe',
                m.account ? (m.authenticator ? 'Authenticator activé' : 'Authenticator à activer à la 1re connexion') : ''].filter(Boolean).join(' · ') })),
              m.active && m.email !== myEmail ? el('button', { type: 'button', class: 'subtle', text: 'Désactiver', onclick: async () => {
                try { await rpc('store_mutate', { b: { action: 'remove_member', email: m.email } }); members = await rpc('store_admin_members'); say('Accès désactivé.'); render(); } catch (error) { say(error.message, true); }
              } }) : null))))),
        baseCard,
        status);
    }
    return { open };
  }

  // ───────────────────────────── Espace élève : inventaire ─────────────────────────────
  function initStudent() {
    const tabs = document.getElementById('studentContentTabs');
    const dashboard = document.getElementById('studentDashboard');
    const tp = document.getElementById('studentTpPane');
    if (!tabs || !dashboard || !tp) return;
    const button = el('button', { type: 'button', id: 'studentStoreTab', text: 'Inventaire magasin' });
    tabs.append(button);
    const content = el('div', { class: 'mg-space' });
    const pane = el('section', { id: 'studentStorePane', class: 'student-pane mg-pane' }, el('h2', { text: 'Inventaire du magasin' }), content);
    pane.hidden = true;
    dashboard.append(pane);
    const state = { type: '', category: '', supplier: '', search: '' };
    let catalog = [], lines = new Map(), sentAt = null, timer = 0, ticket = 0, view = 'list', saving = Promise.resolve(), live = [];
    const key = line => line.item_id || 'new:' + norm(line.ref || line.name);
    const saveState = el('span', { class: 'mg-save', role: 'status' });
    function close() { pane.hidden = true; button.classList.remove('active'); if (timer) { clearTimeout(timer); save(false); } }
    async function open() {
      tp.hidden = true;
      dashboard.querySelectorAll('.student-pane').forEach(other => { if (other !== pane) other.hidden = true; });
      tabs.querySelectorAll('button').forEach(other => other.classList.toggle('active', other === button));
      pane.hidden = false;
      const current = ++ticket;
      fill(content, el('p', { class: 'portal-small', text: 'Chargement du catalogue du magasin…' }));
      try {
        const me = await api.userId();
        const [cat, mine] = await Promise.all([rpc('store_catalog'), api.rest('store_counts?select=lines,submitted_at&student_id=eq.' + encodeURIComponent(me) + '&order=updated_at.desc&limit=5')]);
        catalog = cat || [];
        const draft = mine.find(c => !c.submitted_at);
        sentAt = mine.find(c => c.submitted_at)?.submitted_at || null;
        lines = new Map((draft?.lines || []).map(l => [key(l), l]));
      } catch (error) { if (current === ticket) fill(content, el('p', { class: 'portal-message', text: 'Inventaire indisponible : ' + error.message })); return; }
      if (current === ticket && !pane.hidden) render();
    }
    function save(submit) {
      clearTimeout(timer); timer = 0;
      saveState.textContent = 'Enregistrement…';
      saving = saving.then(() => rpc('store_count_save', { p_lines: [...lines.values()], p_submit: Boolean(submit) }))
        .then(() => { saveState.textContent = submit ? 'Envoyé à l’enseignant.' : 'Brouillon enregistré'; })
        .catch(error => { saveState.textContent = 'Non enregistré : ' + error.message; throw error; });
      return saving;
    }
    const later = () => { saveState.textContent = 'Modifications en attente…'; clearTimeout(timer); timer = setTimeout(() => save(false).catch(() => {}), 1200); };
    function setCount(item, value, note) {
      const k = key(item);
      const counted = value === '' || value === null ? null : Math.max(0, Math.min(10000000, Math.round(Number(value))));
      if (counted === null || Number.isNaN(counted)) lines.delete(k);
      else lines.set(k, { item_id: item.id || null, ref: item.ref || '', name: item.name, type: item.type || '', category: item.category || '', supplier: item.supplier || '', unit: item.unit || 'pièce', location: item.location || '', counted, note: note ?? lines.get(k)?.note ?? '' });
      later(); summary(); live.forEach(update => update());
      document.querySelectorAll('#studentStorePane .mg-count').forEach(card => { if (card.dataset.key === k) card.classList.toggle('is-counted', lines.has(k)); });
    }
    const summaryBox = el('div', { class: 'mg-student-bar' });
    function summary() {
      const counted = [...lines.values()];
      fill(summaryBox,
        el('span', {}, el('strong', { text: String(counted.length) }), ' article(s) compté(s)', counted.filter(l => !l.item_id).length ? ' · ' + counted.filter(l => !l.item_id).length + ' ajouté(s)' : '', ' ', saveState),
        el('div', { class: 'mg-actions' },
          el('button', { type: 'button', class: 'subtle', disabled: !counted.length || null, text: 'Voir mon inventaire', onclick: review }),
          el('button', { type: 'button', class: 'portal-button', disabled: !counted.length || null, text: 'Envoyer à l’enseignant', onclick: send })));
    }
    async function send() {
      if (!confirm('Envoyer votre inventaire (' + lines.size + ' article(s)) à l’enseignant ? Vous pourrez ensuite en commencer un nouveau.')) return;
      try { await save(true); sentAt = new Date().toISOString(); lines = new Map(); render(); }
      catch { /* message affiché dans la barre */ }
    }
    function review() {
      const rows = [...lines.values()].sort((a, b) => collator.compare(a.name, b.name));
      const box = dialog('Mon inventaire', rows.length + ' article(s) compté(s)',
        el('div', { class: 'mg-table-wrap' }, el('table', { class: 'mg-table' },
          el('thead', {}, el('tr', {}, ['Référence', 'Désignation', 'Quantité', ''].map(t => el('th', { text: t })))),
          el('tbody', {}, rows.map(l => el('tr', {}, el('td', { text: l.ref || '—' }), el('td', { text: l.name }), el('td', { class: 'n', text: fr(l.counted) + ' ' + l.unit }),
            el('td', {}, el('button', { type: 'button', class: 'subtle', text: 'Retirer', onclick: () => { lines.delete(key(l)); later(); box.close(); render(); } }))))))));
    }
    function addMissing() {
      const values = { name: '', ref: '', type: state.type || '', category: state.category || '', supplier: state.supplier || '', unit: 'pièce', location: '', counted: 1, note: '' };
      const input = (k, extra = {}) => el('input', { maxlength: 160, value: values[k], oninput: e => { values[k] = e.target.value; }, ...extra });
      const list = (k, options) => { const id = 'mg-s-' + k; return [input(k, { list: id }), el('datalist', { id }, options.map(v => option(v)))]; };
      const form = el('form', { class: 'mg-form' },
        el('div', { class: 'mg-grid' },
          field('Désignation *', input('name', { required: true, placeholder: 'Ex. Disjoncteur 16 A — 1P+N' })),
          field('Référence (si lisible)', input('ref', { placeholder: 'Sur l’étiquette ou l’emballage' })),
          field('Type de matériel', list('type', TYPES)), field('Catégorie', list('category', CATEGORIES)),
          field('Fournisseur / fabricant', list('supplier', [...MANUFACTURERS, ...DISTRIBUTORS])), field('Unité', list('unit', UNITS)),
          field('Emplacement', input('location', { placeholder: 'Ex. Rayon A · Bac 03' })),
          field('Quantité comptée *', el('input', { type: 'number', min: 0, required: true, value: 1, oninput: e => { values.counted = e.target.value; } })),
          field('Remarque', input('note', { placeholder: 'État, emballage…' }))),
        el('button', { class: 'portal-button', text: 'Ajouter à mon inventaire' }));
      const box = dialog('Article absent de la liste', 'Il sera transmis à l’enseignant, qui pourra l’ajouter au magasin.', form);
      form.onsubmit = event => { event.preventDefault(); setCount({ ...values, id: null }, values.counted, values.note); box.close(); render(); };
    }
    function render() {
      const lists = { types: uniq([...TYPES, ...catalog.map(i => i.type)]), categories: uniq([...CATEGORIES, ...catalog.map(i => i.category)]),
        suppliers: uniq([...MANUFACTURERS, ...DISTRIBUTORS, ...catalog.map(i => i.supplier)]), hint: 'Les articles à compter apparaissent après une sélection' };
      const selected = Boolean(state.type || state.category || state.supplier);
      const filtered = catalog.filter(i => matches(i, state));
      const added = [...lines.values()].filter(l => !l.item_id && matches(l, state));
      live = [];
      const row = (item, isNew) => {
        const line = lines.get(key(item));
        const qty = el('input', { type: 'number', min: 0, inputmode: 'numeric', placeholder: '—', 'aria-label': 'Quantité comptée pour ' + item.name, value: line?.counted ?? '', oninput: e => setCount(item, e.target.value, note.value) });
        const note = el('input', { maxlength: 200, placeholder: 'Remarque', 'aria-label': 'Remarque pour ' + item.name, value: line?.note || '', oninput: () => { if (lines.has(key(item))) { lines.get(key(item)).note = note.value; later(); } } });
        return el('article', { class: 'mg-item mg-count' + (line ? ' is-counted' : ''), 'data-key': key(item) },
          el('div', { class: 'mg-item-title' }, el('span', { class: 'mg-reference', text: item.ref || (isNew ? 'Nouvel article' : '') }), el('h3', { text: item.name }),
            el('p', {}, [item.type, item.category, item.supplier].filter(Boolean).join(' · ')), item.location ? el('small', { text: '⌖ ' + item.location }) : null),
          el('div', { class: 'mg-count-fields' }, el('label', { class: 'mg-count-qty' }, el('span', { text: 'Quantité comptée (' + (item.unit || 'pièce') + ')' }), qty), note));
      };
      fill(content,
        el('p', { class: 'portal-small', text: 'Comptez le matériel présent dans le magasin et notez la quantité de chaque article. Votre inventaire est enregistré au fur et à mesure ; envoyez-le à votre enseignant quand il est terminé.' + (sentAt ? ' Dernier envoi : ' + new Date(sentAt).toLocaleString('fr-FR') + '.' : '') }),
        filterPanel(state, lists, searching => { if (searching) { clearTimeout(render.t); render.t = setTimeout(render, 160); } else render(); }),
        selected ? el('div', { class: 'mg-results' },
          el('section', { class: 'mg-stats' }, [['Articles sélectionnés', () => filtered.length, '▦'], ['Comptés dans la sélection', () => filtered.filter(i => lines.has(key(i))).length, '✓'], ['Ajoutés par vous', () => [...lines.values()].filter(l => !l.item_id).length, '＋']]
            .map(([label, value, icon]) => { const strong = el('strong', { text: fr(value()) }); live.push(() => { strong.textContent = fr(value()); });
              return el('div', { class: 'mg-stat neutral' }, el('span', { class: 'mg-stat-icon', 'aria-hidden': 'true', text: icon }), el('div', {}, el('small', { text: label }), strong)); })),
          el('div', { class: 'mg-toolbar' }, el('button', { type: 'button', class: 'subtle', text: '＋ Article absent de la liste', onclick: addMissing }),
            el('div', { class: 'mg-view-toggle' },
              el('button', { type: 'button', 'aria-label': 'Vue cartes', class: view === 'cards' ? 'active' : '', text: '▦', onclick: () => { view = 'cards'; render(); } }),
              el('button', { type: 'button', 'aria-label': 'Vue liste', class: view === 'list' ? 'active' : '', text: '☰', onclick: () => { view = 'list'; render(); } }))),
          filtered.length || added.length ? el('div', { class: 'mg-inventory ' + view }, filtered.map(i => row(i, false)), added.map(l => row({ ...l, id: null }, true))) :
            el('div', { class: 'mg-empty' }, el('h3', { text: 'Aucun article pour cette sélection' }), el('p', { text: 'Si vous trouvez du matériel qui n’est pas dans la liste, ajoutez-le.' }))) :
          el('p', { class: 'mg-hint', text: catalog.length ? catalog.length + ' article(s) dans le catalogue. Choisissez un type, une catégorie ou un fournisseur pour commencer à compter.' : 'Le catalogue du magasin est encore vide : ajoutez les articles que vous trouvez avec « Article absent de la liste ».' }),
        !selected && !catalog.length ? el('button', { type: 'button', class: 'subtle', text: '＋ Article absent de la liste', onclick: addMissing }) : null,
        summaryBox);
      summary();
    }
    button.addEventListener('click', () => { if (pane.hidden) open(); });
    tabs.addEventListener('click', event => { const target = event.target.closest('button'); if (target && target !== button && !pane.hidden) close(); }, true);
    new MutationObserver(() => { if (!tp.hidden && !pane.hidden) close(); }).observe(tp, { attributes: true, attributeFilter: ['hidden'] });
    new MutationObserver(() => { if (dashboard.hidden || tabs.hidden) { close(); fill(content); catalog = []; lines = new Map(); } }).observe(dashboard, { attributes: true, attributeFilter: ['hidden'] });
    document.getElementById('studentRefresh')?.addEventListener('click', () => { if (!pane.hidden) close(); }, true);
    window.addEventListener('pagehide', () => { if (timer) save(false); });
  }

  // ───────────────────────────── Démarrage ─────────────────────────────
  const teamRoot = document.getElementById('magasinView');
  if (teamRoot) {
    const team = initTeam(teamRoot);
    let wasHidden = true;
    new MutationObserver(() => {
      const hidden = teamRoot.classList.contains('hidden');
      if (!hidden && wasHidden) team.open(); else if (hidden) team.stop();
      wasHidden = hidden;
    }).observe(teamRoot, { attributes: true, attributeFilter: ['class'] });
    // Le menu « Administration » n'apparaît que pour l'administrateur (vérifié par la base).
    const adminRoot = document.getElementById('adminView');
    const adminNav = document.querySelector('.nav[data-view="admin"]');
    document.addEventListener('melec-store-role', event => { if (adminNav) adminNav.hidden = !event.detail.admin; });
    if (adminRoot) {
      const admin = initAdmin(adminRoot);
      let adminHidden = true;
      new MutationObserver(() => { const hidden = adminRoot.classList.contains('hidden'); if (!hidden && adminHidden) admin.open(); adminHidden = hidden; }).observe(adminRoot, { attributes: true, attributeFilter: ['class'] });
      // Dès que l'enseignant est connecté (page déverrouillée), on vérifie une fois son rôle.
      let probed = false, probing = false;
      const probe = () => {
        if (probed || probing || document.body.classList.contains('cloud-locked')) return;
        probing = true;
        team.probe().then(() => { probed = true; }, () => {}).finally(() => { probing = false; });
      };
      new MutationObserver(probe).observe(document.body, { attributes: true, attributeFilter: ['class'] });
      probe();
    }
  }
  if (document.getElementById('studentContentTabs')) initStudent();
  window.MelecMagasin = { rowsFromSheet, consolidate, norm, matches };
})();
