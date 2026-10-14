/* L'Atelier MELEC : PFMP — annuaire des entreprises, démarches des élèves et suivi pédagogique.
   Reprend Gestion PFMP avec les comptes de L'Atelier MELEC.
   - Espace enseignant : menu « PFMP » (vue #pfmpView).
   - Espace élève : onglet « Ma PFMP ».
   Les règles d'accès sont imposées par la base (supabase/migrations/…_pfmp.sql). */
(function () {
  'use strict';
  const api = window.MelecPortal;
  if (!api) return;
  const STATUSES = ['À contacter', 'En attente', 'Accepté', 'Refusé', 'À relancer'];
  const METHODS = ['Téléphone', 'E-mail', 'Sur place', 'Courrier', 'Salon / forum', 'Autre'];
  const SECTORS = ['Électricité', 'Industrie', 'Restauration', 'Commerce', 'Bâtiment', 'Services à la personne', 'Administration & collectivités', 'Transport & logistique', 'Automobile', 'Hôtellerie & tourisme', 'Numérique', 'Autres activités', 'À renseigner'];
  const PAGE = 12;
  const norm = value => String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const dateFr = value => value ? new Date(value + 'T12:00:00').toLocaleDateString('fr-FR') : '—';
  const companyName = c => c?.data?.denomination || c?.data?.raisonSociale || 'Entreprise';
  const collator = new Intl.Collator('fr', { numeric: true, sensitivity: 'base' });
  const statusClass = status => 'pfmp-status pfmp-s-' + norm(status).replace(/[^a-z]+/g, '-');

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
  const field = (label, control, hint) => el('label', { class: 'pfmp-field' }, el('span', { text: label }), control, hint ? el('small', { text: hint }) : null);
  const option = (value, text, selected) => el('option', { value, text: text ?? value, selected: selected || null });

  // ───────── Normalisation et empreinte (identiques à Gestion PFMP, pour reconnaître les doublons) ─────────
  const clean = (v, max = 500) => typeof v === 'string' ? v.trim().slice(0, max) : (typeof v === 'number' ? String(v) : '');
  function normalizeCompany(v) {
    const c = {};
    for (const key of ['raisonSociale', 'denomination', 'siege', 'activite', 'ape', 'adresse', 'codePostal', 'ville', 'pays', 'telephone', 'portable', 'email', 'siteWeb', 'siret', 'contactNom', 'contactFonction', 'contactTelephone', 'contactEmail', 'acceptation']) c[key] = clean(v[key]);
    if (!c.raisonSociale) throw new Error('La raison sociale est obligatoire.');
    if (/^\d{1,5}$/.test(c.codePostal)) c.codePostal = c.codePostal.padStart(5, '0');
    c.siret = c.siret.replace(/\D/g, ''); if (c.siret.length === 13) c.siret = c.siret.padStart(14, '0');
    for (const key of ['metiers', 'secteurs']) c[key] = (Array.isArray(v[key]) ? v[key].map(x => clean(x)) : clean(v[key]).split(',').map(x => x.trim())).filter(Boolean);
    if (!c.secteurs.length) {
      const text = norm(c.activite + ' ' + c.metiers.join(' '));
      c.secteurs = SECTORS.filter(s => text.includes(norm(s === 'Industrie' ? 'industr' : s === 'Électricité' ? 'electric' : s)));
    }
    if (!c.secteurs.length) c.secteurs = [c.activite || 'À renseigner'];
    c.capacite = Number(v.capacite) > 0 ? Number(v.capacite) : null;
    const coord = (x, max) => x !== '' && x != null && Number.isFinite(Number(String(x).replace(',', '.'))) && Math.abs(Number(String(x).replace(',', '.'))) <= max ? Number(String(x).replace(',', '.')) : null;
    c.lat = coord(v.lat, 90); c.lon = coord(v.lon, 180);
    c.geoPrecision = clean(v.geoPrecision) || null;
    return c;
  }
  async function fingerprint(c) {
    const text = c.siret.length === 14 ? 'siret:' + c.siret : [norm(c.raisonSociale), norm(c.adresse), c.codePostal, norm(c.ville)].join('|');
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(digest)).map(x => x.toString(16).padStart(2, '0')).join('');
  }

  // ───────── Chargements ─────────
  const scripts = new Map();
  function loadScript(src) {
    if (!scripts.has(src)) scripts.set(src, new Promise((resolve, reject) => {
      const tag = document.createElement('script'); tag.src = src; tag.onload = resolve;
      tag.onerror = () => { scripts.delete(src); reject(new Error('Module indisponible : vérifiez la connexion.')); };
      document.head.append(tag);
    }));
    return scripts.get(src);
  }
  function loadStyle(href) { if (!document.querySelector('link[href="' + href + '"]')) document.head.append(el('link', { rel: 'stylesheet', href })); }
  const xlsx = () => window.XLSX ? Promise.resolve(window.XLSX) : loadScript('xlsx.full.min.js').then(() => window.XLSX);
  async function leaflet() {
    loadStyle('vendor/leaflet/leaflet.css'); loadStyle('vendor/leaflet/MarkerCluster.css'); loadStyle('vendor/leaflet/MarkerCluster.Default.css');
    if (!window.L) await loadScript('vendor/leaflet/leaflet.js');
    if (!window.L.markerClusterGroup) await loadScript('vendor/leaflet/leaflet.markercluster.js');
    return window.L;
  }
  // L'annuaire (plus de 3 000 entreprises) n'est retéléchargé que si son numéro de version a changé.
  const cache = { revision: null, companies: [], index: new Map() };
  async function loadCompanies(force) {
    const meta = await api.rest('pfmp_meta?select=revision');
    const revision = meta[0]?.revision ?? 0;
    if (!force && cache.revision === revision) return cache.companies;
    const all = [];
    for (let offset = 0; ; offset += 1000) {
      const rows = await api.rest('pfmp_companies?select=id,data&order=id.asc&limit=1000&offset=' + offset);
      all.push(...rows);
      if (rows.length < 1000) break;
    }
    cache.revision = revision; cache.companies = all; cache.index = new Map();
    for (const c of all) {
      const d = c.data;
      cache.index.set(c.id, norm([d.raisonSociale, d.denomination, d.adresse, d.codePostal, d.ville, d.activite, (d.metiers || []).join(' '), (d.secteurs || []).join(' '), d.siret].join(' ')));
    }
    return all;
  }
  function download(content, filename, type) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const link = el('a', { href: url, download: filename }); document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  // ───────── Annuaire (commun enseignant / élève) ─────────
  // options : { teacher, reservations: Map(company_id → student_id), studentName(id), onOpen(company) }
  function directory(host, options) {
    const state = { query: '', sector: '', city: '', availability: '', sort: 'raisonSociale', page: 1, map: false };
    const list = el('div', { class: 'pfmp-results' });
    const count = el('p', { class: 'pfmp-count', role: 'status' });
    const mapHost = el('div', { class: 'pfmp-map', hidden: true });
    const companies = () => cache.companies;
    const sectors = [...new Set(companies().flatMap(c => c.data.secteurs || []))].sort(collator.compare);
    const cities = [...new Set(companies().map(c => c.data.ville).filter(Boolean))].sort(collator.compare);
    const search = el('input', { type: 'search', placeholder: 'Nom, adresse, ville, métier, SIRET…', 'aria-label': 'Rechercher une entreprise', oninput: event => { state.query = event.target.value; state.page = 1; draw(); } });
    const sectorSelect = el('select', { 'aria-label': 'Secteur', onchange: event => { state.sector = event.target.value; state.page = 1; draw(); } }, option('', 'Tous les secteurs'), sectors.map(s => option(s)));
    const citySelect = el('select', { 'aria-label': 'Ville', onchange: event => { state.city = event.target.value; state.page = 1; draw(); } }, option('', 'Toutes les villes'), cities.map(s => option(s)));
    const availability = options.teacher ? el('select', { 'aria-label': 'Disponibilité', onchange: event => { state.availability = event.target.value; state.page = 1; draw(); } },
      option('', 'Toutes les entreprises'), option('free', 'Disponibles'), option('taken', 'PFMP attribuées')) : null;
    const sort = el('select', { 'aria-label': 'Trier', onchange: event => { state.sort = event.target.value; draw(); } },
      option('raisonSociale', 'Raison sociale A → Z'), option('denomination', 'Nom commercial A → Z'), option('ville', 'Ville A → Z'), option('activite', 'Activité A → Z'));
    const mapToggle = el('button', { type: 'button', class: 'subtle', text: '🗺 Carte', onclick: () => { state.map = !state.map; mapToggle.textContent = state.map ? '☰ Liste' : '🗺 Carte'; draw(); } });
    host.replaceChildren(
      el('div', { class: 'pfmp-filters' }, el('div', { class: 'pfmp-search' }, search), sectorSelect, citySelect, availability, sort, mapToggle),
      count, mapHost, list);
    let map = null, cluster = null;
    function filtered() {
      const q = norm(state.query);
      const out = companies().filter(c => {
        const d = c.data;
        if (q && !cache.index.get(c.id)?.includes(q)) return false;
        if (state.sector && !(d.secteurs || []).includes(state.sector)) return false;
        if (state.city && d.ville !== state.city) return false;
        if (state.availability === 'free' && options.reservations.has(c.id)) return false;
        if (state.availability === 'taken' && !options.reservations.has(c.id)) return false;
        return true;
      });
      return out.sort((a, b) => collator.compare(String(a.data[state.sort] || '~'), String(b.data[state.sort] || '~')));
    }
    async function drawMap(items) {
      mapHost.hidden = false; list.hidden = true;
      try {
        const L = await leaflet();
        if (!map) {
          map = L.map(mapHost, { scrollWheelZoom: true }).setView([46.6, 2.4], 6);
          L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
        }
        if (cluster) cluster.remove();
        cluster = L.markerClusterGroup({ chunkedLoading: true });
        const placed = items.filter(c => Number.isFinite(c.data.lat) && Number.isFinite(c.data.lon));
        placed.forEach(c => {
          const marker = L.marker([c.data.lat, c.data.lon], { title: companyName(c) });
          marker.on('click', () => options.onOpen(c));
          cluster.addLayer(marker);
        });
        map.addLayer(cluster);
        setTimeout(() => { map.invalidateSize(); if (placed.length) map.fitBounds(cluster.getBounds(), { maxZoom: 13, padding: [20, 20] }); }, 50);
        count.textContent = items.length.toLocaleString('fr-FR') + ' entreprise(s) · ' + placed.length.toLocaleString('fr-FR') + ' placée(s) sur la carte. Touchez un repère pour ouvrir la fiche.';
      } catch (error) { mapHost.textContent = error.message; }
    }
    function draw() {
      const items = filtered();
      if (state.map) return drawMap(items);
      mapHost.hidden = true; list.hidden = false;
      const pages = Math.max(1, Math.ceil(items.length / PAGE));
      state.page = Math.min(state.page, pages);
      const shown = items.slice((state.page - 1) * PAGE, state.page * PAGE);
      count.textContent = items.length.toLocaleString('fr-FR') + ' entreprise(s)' + (items.length ? ' · page ' + state.page + ' / ' + pages : '');
      list.replaceChildren(
        items.length ? el('div', { class: 'pfmp-company-list' }, shown.map(c => {
          const d = c.data, taken = options.reservations.get(c.id);
          return el('button', { type: 'button', class: 'pfmp-company', onclick: () => options.onOpen(c) },
            el('strong', { text: companyName(c) }),
            d.denomination && d.raisonSociale !== d.denomination ? el('span', { class: 'pfmp-muted', text: d.raisonSociale }) : null,
            el('span', { text: [d.codePostal, d.ville].filter(Boolean).join(' ') || 'Adresse à compléter' }),
            el('span', { class: 'pfmp-muted', text: d.activite || (d.secteurs || []).join(', ') || 'Activité à renseigner' }),
            taken ? el('span', { class: 'pfmp-chip pfmp-taken', text: options.teacher ? 'PFMP attribuée · ' + options.studentName(taken) : 'Votre entreprise' }) : null);
        })) : el('p', { class: 'pfmp-empty', text: 'Aucune entreprise ne correspond à ces filtres. Essayez un autre secteur ou élargissez la recherche.' }),
        pages > 1 ? el('div', { class: 'pfmp-pager' },
          el('button', { type: 'button', class: 'subtle', text: '← Précédent', disabled: state.page <= 1 || null, onclick: () => { state.page--; draw(); host.scrollIntoView({ block: 'start' }); } }),
          el('span', { text: state.page + ' / ' + pages }),
          el('button', { type: 'button', class: 'subtle', text: 'Suivant →', disabled: state.page >= pages || null, onclick: () => { state.page++; draw(); host.scrollIntoView({ block: 'start' }); } })) : null);
    }
    draw();
    return { redraw: draw, filtered, destroy: () => { map?.remove(); map = null; } };
  }

  // Fiche entreprise (lecture).
  function companyDetails(c) {
    const d = c.data;
    const line = (label, value, href) => value ? el('div', { class: 'pfmp-line' }, el('span', { text: label }), href ? el('a', { href, target: '_blank', rel: 'noopener noreferrer', text: value }) : el('b', { text: value })) : null;
    const address = [d.adresse, [d.codePostal, d.ville].filter(Boolean).join(' '), d.pays && d.pays !== 'France' ? d.pays : ''].filter(Boolean).join(', ');
    const route = Number.isFinite(d.lat) && Number.isFinite(d.lon) ? 'https://www.openstreetmap.org/directions?to=' + d.lat + '%2C' + d.lon
      : address ? 'https://www.openstreetmap.org/search?query=' + encodeURIComponent(address) : null;
    return el('div', { class: 'pfmp-details' },
      line('Adresse', address), route ? line('Itinéraire', 'Ouvrir la carte ↗', route) : null,
      line('Activité', d.activite), line('Métiers', (d.metiers || []).join(', ')), line('Secteurs', (d.secteurs || []).join(', ')),
      line('Téléphone', d.telephone, d.telephone ? 'tel:' + d.telephone.replace(/\s/g, '') : null), line('Portable', d.portable),
      line('E-mail', d.email, d.email ? 'mailto:' + d.email : null),
      line('Site web', d.siteWeb, d.siteWeb ? (/^https?:/i.test(d.siteWeb) ? d.siteWeb : 'https://' + d.siteWeb) : null),
      line('Responsable', [d.contactNom, d.contactFonction].filter(Boolean).join(' · ')), line('Tél. responsable', d.contactTelephone), line('E-mail responsable', d.contactEmail),
      line('Accueil des stagiaires', d.acceptation), line('Capacité', d.capacite ? String(d.capacite) : ''), line('SIRET', d.siret), line('APE', d.ape));
  }

  // Formulaire de démarche (compte rendu).
  function reportForm(report, onSave, onCancel, extra) {
    const r = report || {};
    const status = el('select', { required: true }, STATUSES.map(s => option(s, s, (r.status || 'À contacter') === s)));
    const date = el('input', { type: 'date', required: true, value: r.date || today() });
    const method = el('select', {}, option('', '—'), METHODS.map(m => option(m, m, r.method === m)));
    const contact = el('input', { maxlength: 500, value: r.contact || '', placeholder: 'Nom et fonction de l’interlocuteur' });
    const notes = el('textarea', { rows: 4, maxlength: 5000, required: true, placeholder: 'Ce que vous avez demandé, la réponse, la suite prévue…' });
    notes.value = r.notes || '';
    const start = el('input', { type: 'date', value: r.start_date || '' });
    const end = el('input', { type: 'date', value: r.end_date || '' });
    const dates = el('div', { class: 'pfmp-grid' }, field('Début de la PFMP', start), field('Fin de la PFMP', end));
    const sync = () => { dates.hidden = status.value !== 'Accepté'; };
    status.addEventListener('change', sync); sync();
    const message = el('p', { class: 'pfmp-message', role: 'status' });
    const save = el('button', { type: 'submit', class: 'portal-button', text: 'Enregistrer la démarche' });
    const form = el('form', { class: 'pfmp-form', onsubmit: async event => {
      event.preventDefault();
      if (!notes.value.trim()) { message.textContent = 'Rédigez le compte rendu.'; return; }
      if (start.value && end.value && end.value < start.value) { message.textContent = 'La fin de la PFMP doit suivre son début.'; return; }
      save.disabled = true; message.textContent = 'Enregistrement…';
      try { await onSave({ status: status.value, date: date.value, method: method.value, contact: contact.value.trim(), notes: notes.value.trim(), start: status.value === 'Accepté' ? start.value || null : null, end: status.value === 'Accepté' ? end.value || null : null }); }
      catch (error) { message.textContent = /déjà accepté/i.test(error.message) ? 'Cette entreprise a déjà accepté un autre élève.' : error.message; save.disabled = false; }
    } },
      extra || null,
      el('div', { class: 'pfmp-grid' }, field('Réponse de l’entreprise *', status), field('Date du contact *', date), field('Moyen de contact', method)),
      field('Interlocuteur', contact), field('Compte rendu *', notes), dates,
      el('p', { class: 'pfmp-hint', text: 'Quand une démarche passe à « Accepté », l’entreprise est réservée à l’élève et disparaît de la recherche des autres élèves.' }),
      el('div', { class: 'pfmp-actions' }, save, onCancel ? el('button', { type: 'button', class: 'subtle', text: 'Annuler', onclick: onCancel }) : null), message);
    return form;
  }
  const saveReport = (r, values) => api.rest('rpc/pfmp_save_report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
    p_id: r.id || null, p_company: r.company_id, p_student: r.student_id || null, p_status: values.status, p_date: values.date,
    p_method: values.method, p_contact: values.contact, p_notes: values.notes, p_start: values.start, p_end: values.end }) });
  function reportLine(r, label, onEdit) {
    return el('div', { class: 'pfmp-report' },
      el('div', { class: 'pfmp-report-head' }, el('span', { class: statusClass(r.status), text: r.status }), el('b', { text: label }), el('span', { class: 'pfmp-muted', text: dateFr(r.date) + (r.method ? ' · ' + r.method : '') })),
      r.contact ? el('p', { class: 'pfmp-muted', text: 'Interlocuteur : ' + r.contact }) : null,
      el('p', { class: 'pfmp-notes', text: r.notes }),
      r.status === 'Accepté' && (r.start_date || r.end_date) ? el('p', { class: 'pfmp-muted', text: 'PFMP du ' + dateFr(r.start_date) + ' au ' + dateFr(r.end_date) }) : null,
      onEdit ? el('button', { type: 'button', class: 'subtle', text: 'Modifier', onclick: onEdit }) : null);
  }

  // ───────────────────────────── Espace enseignant ─────────────────────────────
  function initTeacher(root) {
    let tab = 'companies', students = [], classes = [], reports = [], reservations = new Map(), followups = new Map(), classId = '', dir = null, loadedAt = 0;
    const status = el('p', { class: 'teach-status', role: 'status' });
    const say = (text, error) => { status.textContent = text; status.classList.toggle('error', Boolean(error)); };
    const studentName = id => { const s = students.find(x => x.user_id === id); return s ? s.last_name + ' ' + s.first_name : 'Élève'; };
    const className = id => classes.find(c => c.id === id)?.name || '';
    async function load(force) {
      const [s, cl, rep, res, fol] = await Promise.all([
        api.rest('student_profiles?select=user_id,last_name,first_name,class_id,approved_at,blocked_at&approved_at=not.is.null&order=last_name.asc,first_name.asc'),
        api.rest('teaching_classes?select=id,name&order=name.asc'),
        api.rest('pfmp_reports?select=*&order=updated_at.desc'),
        api.rest('pfmp_reservations?select=company_id,student_id,report_id'),
        api.rest('pfmp_followups?select=*'),
        loadCompanies(force)]);
      students = s; classes = cl; reports = rep;
      reservations = new Map(res.map(r => [r.company_id, r.student_id]));
      followups = new Map(fol.map(f => [f.student_id, f]));
      loadedAt = Date.now();
    }
    function frame(content) {
      root.replaceChildren(
        el('div', { class: 'teach-head' }, el('div', {}, el('h1', { text: 'PFMP' }), el('p', { text: 'Annuaire des entreprises, démarches des élèves et suivi pédagogique.' }))),
        el('div', { class: 'teach-tabs pfmp-tabs', role: 'tablist' }, [['companies', 'Entreprises'], ['students', 'Suivi des élèves'], ['reports', 'Comptes rendus'], ['import', 'Ajouter / exporter']].map(([key, label]) =>
          el('button', { type: 'button', class: tab === key ? 'active' : '', 'data-pfmp-tab': key, text: label, onclick: () => { tab = key; render(); } })),
          el('button', { type: 'button', class: 'subtle pfmp-refresh', text: '↻ Actualiser', onclick: () => open(true) })),
        content, status);
    }
    async function open(force) {
      if (!cache.companies.length || force || Date.now() - loadedAt > 60000) {
        frame(el('div', { class: 'teach-card', text: 'Chargement de l’annuaire et des démarches…' }));
        try { await load(force); } catch (error) { frame(el('div', { class: 'teach-card', text: 'PFMP indisponible : ' + error.message })); return; }
      }
      render();
    }
    function render() {
      dir?.destroy(); dir = null;
      if (tab === 'students') return renderStudents();
      if (tab === 'reports') return renderReports();
      if (tab === 'import') return renderImport();
      const metrics = el('div', { class: 'pfmp-metrics' },
        el('div', {}, el('b', { text: cache.companies.length.toLocaleString('fr-FR') }), el('span', { text: 'entreprises' })),
        el('div', {}, el('b', { text: String(reservations.size) }), el('span', { text: 'PFMP attribuées' })),
        el('div', {}, el('b', { text: String(reports.length) }), el('span', { text: 'démarches' })),
        el('div', {}, el('b', { text: String(new Set(reports.map(r => r.student_id)).size) }), el('span', { text: 'élèves actifs' })));
      const host = el('div');
      const detail = el('div', { class: 'pfmp-detail-host' });
      frame(el('div', { class: 'teach-card' }, metrics, host, detail));
      dir = directory(host, { teacher: true, reservations, studentName, onOpen: c => openCompany(c, detail) });
    }
    function openCompany(c, host) {
      const taken = reservations.get(c.id);
      const companyReports = reports.filter(r => r.company_id === c.id);
      const body = el('div');
      const showReports = () => body.replaceChildren(
        companyReports.length ? el('div', { class: 'pfmp-reports' }, companyReports.map(r => reportLine(r, studentName(r.student_id), () => editReport(r)))) : el('p', { class: 'pfmp-muted', text: 'Aucune démarche pour cette entreprise.' }),
        el('div', { class: 'pfmp-actions' },
          el('button', { type: 'button', class: 'subtle', text: '＋ Démarche pour un élève', onclick: () => editReport({ company_id: c.id }) }),
          el('button', { type: 'button', class: 'subtle', text: 'Modifier la fiche', onclick: () => editCompany(c) }),
          taken ? el('button', { type: 'button', class: 'subtle', text: 'Libérer l’entreprise', onclick: release }) : null,
          el('button', { type: 'button', class: 'warn', text: 'Supprimer l’entreprise', onclick: remove })));
      function editReport(r) {
        const picker = r.id ? null : field('Élève *', el('select', { required: true, id: 'pfmpStudentPick' }, option('', 'Choisir un élève…'),
          students.filter(s => !s.blocked_at).map(s => option(s.user_id, s.last_name + ' ' + s.first_name + (className(s.class_id) ? ' · ' + className(s.class_id) : '')))));
        body.replaceChildren(reportForm(r, async values => {
          const student = r.student_id || picker.querySelector('select').value;
          if (!student) throw new Error('Choisissez l’élève.');
          await saveReport({ ...r, student_id: student }, values);
          say('Démarche enregistrée.'); await load(); render();
        }, showReports, picker));
      }
      async function release() {
        if (!confirm('Rendre « ' + companyName(c) + ' » disponible ? La démarche acceptée de ' + studentName(taken) + ' repassera « À relancer ».')) return;
        try { await api.rest('rpc/pfmp_release', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ p_company: c.id }) }); say('Entreprise libérée.'); await load(); render(); }
        catch (error) { say(error.message, true); }
      }
      async function remove() {
        if (prompt('Supprimer définitivement « ' + companyName(c) + ' » et ses démarches ? Tapez SUPPRIMER pour confirmer.') !== 'SUPPRIMER') return;
        try { await api.rest('rpc/pfmp_delete_companies', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ p_ids: [c.id] }) }); say('Entreprise supprimée.'); await load(true); render(); }
        catch (error) { say(error.message, true); }
      }
      host.replaceChildren(el('section', { class: 'teach-card pfmp-company-detail' },
        el('div', { class: 'pfmp-actions pfmp-title' }, el('h2', { text: companyName(c) }), taken ? el('span', { class: 'pfmp-chip pfmp-taken', text: 'PFMP attribuée · ' + studentName(taken) }) : el('span', { class: 'pfmp-chip pfmp-free', text: 'Disponible' }),
          el('button', { type: 'button', class: 'subtle', text: 'Fermer', onclick: () => host.replaceChildren() })),
        companyDetails(c), el('h3', { text: 'Démarches' }), body));
      showReports();
      host.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    function companyForm(c, onDone) {
      const d = c?.data || {};
      const inputs = {};
      const input = (key, label, attrs = {}) => { inputs[key] = el('input', { value: Array.isArray(d[key]) ? d[key].join(', ') : (d[key] ?? ''), ...attrs }); return field(label, inputs[key]); };
      const message = el('p', { class: 'pfmp-message', role: 'status' });
      return el('form', { class: 'pfmp-form', onsubmit: async event => {
        event.preventDefault();
        try {
          const values = Object.fromEntries(Object.entries(inputs).map(([k, i]) => [k, i.value]));
          const next = normalizeCompany({ ...d, ...values });
          const moved = c && ['adresse', 'codePostal', 'ville'].some(k => (d[k] || '') !== next[k]) && values.lat === String(d.lat ?? '') && values.lon === String(d.lon ?? '');
          if (moved) { next.lat = null; next.lon = null; next.geoPrecision = null; }
          if (c) await api.rest('pfmp_companies?id=eq.' + encodeURIComponent(c.id), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: next, updated_at: new Date().toISOString() }) });
          else {
            const result = await api.rest('rpc/pfmp_import_companies', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ p_companies: [{ ...next, fingerprint: await fingerprint(next) }] }) });
            if (!result.added) throw new Error('Cette entreprise existe déjà (même SIRET ou même nom et adresse).');
          }
          await load(true); onDone(c ? 'Fiche modifiée.' : 'Entreprise ajoutée.');
        } catch (error) { message.textContent = error.message; }
      } },
        el('div', { class: 'pfmp-grid' }, input('raisonSociale', 'Raison sociale *', { required: true, maxlength: 200 }), input('denomination', 'Nom commercial'), input('activite', 'Activité'),
          input('metiers', 'Métiers (séparés par des virgules)'), input('secteurs', 'Secteurs (séparés par des virgules)'), input('siret', 'SIRET')),
        el('div', { class: 'pfmp-grid' }, input('adresse', 'Adresse'), input('codePostal', 'Code postal'), input('ville', 'Ville'), input('lat', 'Latitude'), input('lon', 'Longitude')),
        el('div', { class: 'pfmp-grid' }, input('telephone', 'Téléphone'), input('email', 'E-mail'), input('siteWeb', 'Site web'),
          input('contactNom', 'Responsable'), input('contactFonction', 'Fonction'), input('contactTelephone', 'Téléphone responsable'), input('contactEmail', 'E-mail responsable'),
          input('acceptation', 'Accueil des stagiaires'), input('capacite', 'Capacité', { inputmode: 'numeric' })),
        el('div', { class: 'pfmp-actions' }, el('button', { type: 'submit', class: 'portal-button', text: c ? 'Enregistrer la fiche' : 'Ajouter l’entreprise' }), el('button', { type: 'button', class: 'subtle', text: 'Annuler', onclick: () => onDone('') })), message);
    }
    function editCompany(c) {
      frame(el('div', { class: 'teach-card' }, el('h2', { text: 'Modifier : ' + companyName(c) }), companyForm(c, text => { if (text) say(text); render(); })));
    }
    // Suivi des élèves : une ligne par élève, démarches, entreprise retenue et suivi pédagogique.
    function renderStudents() {
      const classSelect = el('select', { 'aria-label': 'Classe', onchange: event => { classId = event.target.value; renderStudents(); } }, option('', 'Toutes les classes'), classes.map(c => option(c.id, c.name, c.id === classId)));
      const shown = students.filter(s => !s.blocked_at && (!classId || s.class_id === classId));
      const detail = el('div', { class: 'pfmp-detail-host' });
      const rows = shown.map(s => {
        const mine = reports.filter(r => r.student_id === s.user_id);
        const accepted = [...reservations.entries()].find(([, st]) => st === s.user_id);
        const acceptedReport = accepted ? reports.find(r => r.company_id === accepted[0] && r.student_id === s.user_id && r.status === 'Accepté') : null;
        const company = accepted ? cache.companies.find(c => c.id === accepted[0]) : null;
        const f = followups.get(s.user_id);
        return el('tr', {},
          el('td', {}, el('strong', { text: s.last_name + ' ' + s.first_name }), classId ? null : el('div', { class: 'pfmp-muted', text: className(s.class_id) })),
          el('td', { class: 'n', text: String(mine.length) }),
          el('td', {}, mine[0] ? el('span', { class: statusClass(mine[0].status), text: mine[0].status }) : el('span', { class: 'pfmp-muted', text: 'Aucune démarche' }), mine[0] ? el('div', { class: 'pfmp-muted', text: dateFr(mine[0].date) }) : null),
          el('td', {}, company ? el('b', { text: companyName(company) }) : el('span', { class: 'pfmp-muted', text: '—' }), acceptedReport?.start_date ? el('div', { class: 'pfmp-muted', text: dateFr(acceptedReport.start_date) + ' → ' + dateFr(acceptedReport.end_date) }) : null),
          el('td', { text: f?.visit_date ? dateFr(f.visit_date) : '—' }),
          el('td', {}, el('div', { class: 'pfmp-actions' },
            el('button', { type: 'button', class: 'subtle', text: 'Démarches', onclick: () => showStudent(s, detail) }),
            el('button', { type: 'button', class: 'subtle', text: 'Suivi', onclick: () => editFollowup(s, detail) }))));
      });
      frame(el('div', { class: 'teach-card' },
        el('div', { class: 'teach-row' }, el('label', { text: 'Classe' }), classSelect),
        el('div', { class: 'pfmp-table-wrap' }, el('table', { class: 'pfmp-table' },
          el('thead', {}, el('tr', {}, ['Élève', 'Démarches', 'Dernière réponse', 'Entreprise retenue', 'Visite', ''].map(t => el('th', { text: t, class: t === 'Démarches' ? 'n' : null })))),
          el('tbody', {}, rows.length ? rows : el('tr', {}, el('td', { colspan: 6, text: 'Aucun élève validé dans cette classe.' }))))),
        detail));
    }
    function showStudent(s, host) {
      const mine = reports.filter(r => r.student_id === s.user_id);
      host.replaceChildren(el('section', { class: 'teach-card' },
        el('div', { class: 'pfmp-actions pfmp-title' }, el('h2', { text: 'Démarches de ' + s.last_name + ' ' + s.first_name }), el('button', { type: 'button', class: 'subtle', text: 'Fermer', onclick: () => host.replaceChildren() })),
        mine.length ? el('div', { class: 'pfmp-reports' }, mine.map(r => reportLine(r, companyName(cache.companies.find(c => c.id === r.company_id))))) : el('p', { class: 'pfmp-muted', text: 'Aucune démarche enregistrée.' })));
      host.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    function editFollowup(s, host) {
      const f = followups.get(s.user_id) || {};
      const visit = el('input', { type: 'date', value: f.visit_date || '' });
      const appreciation = el('textarea', { rows: 3, maxlength: 3000 }); appreciation.value = f.appreciation || '';
      const note = el('textarea', { rows: 3, maxlength: 5000 }); note.value = f.teacher_note || '';
      const message = el('p', { class: 'pfmp-message', role: 'status' });
      host.replaceChildren(el('section', { class: 'teach-card' },
        el('div', { class: 'pfmp-actions pfmp-title' }, el('h2', { text: 'Suivi pédagogique · ' + s.last_name + ' ' + s.first_name }), el('button', { type: 'button', class: 'subtle', text: 'Fermer', onclick: () => host.replaceChildren() })),
        el('form', { class: 'pfmp-form', onsubmit: async event => {
          event.preventDefault();
          try {
            await api.rest('pfmp_followups?on_conflict=student_id', { method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
              body: JSON.stringify({ student_id: s.user_id, visit_date: visit.value || null, appreciation: appreciation.value.trim(), teacher_note: note.value.trim(), updated_at: new Date().toISOString() }) });
            say('Suivi enregistré.'); await load(); renderStudents();
          } catch (error) { message.textContent = error.message; }
        } },
          field('Date de visite en entreprise', visit),
          field('Appréciation (visible par l’élève)', appreciation),
          field('Note privée de l’enseignant (jamais visible par l’élève)', note),
          el('div', { class: 'pfmp-actions' }, el('button', { type: 'submit', class: 'portal-button', text: 'Enregistrer le suivi' })), message)));
      host.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    function renderReports() {
      const state = renderReports.state || (renderReports.state = { classId: '', student: '', status: '' });
      const visible = reports.filter(r => {
        const s = students.find(x => x.user_id === r.student_id);
        return (!state.classId || s?.class_id === state.classId) && (!state.student || r.student_id === state.student) && (!state.status || r.status === state.status);
      });
      const pick = (key, value) => { state[key] = value; renderReports(); };
      frame(el('div', { class: 'teach-card' },
        el('div', { class: 'pfmp-filters' },
          el('select', { 'aria-label': 'Classe', onchange: e => pick('classId', e.target.value) }, option('', 'Toutes les classes'), classes.map(c => option(c.id, c.name, c.id === state.classId))),
          el('select', { 'aria-label': 'Élève', onchange: e => pick('student', e.target.value) }, option('', 'Tous les élèves'), students.filter(s => !state.classId || s.class_id === state.classId).map(s => option(s.user_id, s.last_name + ' ' + s.first_name, s.user_id === state.student))),
          el('select', { 'aria-label': 'Réponse', onchange: e => pick('status', e.target.value) }, option('', 'Toutes les réponses'), STATUSES.map(s => option(s, s, s === state.status))),
          el('button', { type: 'button', class: 'subtle', text: 'Exporter (Excel)', onclick: () => exportReports(visible) })),
        el('p', { class: 'pfmp-count', text: visible.length + ' démarche(s)' }),
        el('div', { class: 'pfmp-reports' }, visible.slice(0, 300).map(r => reportLine(r, studentName(r.student_id) + ' → ' + companyName(cache.companies.find(c => c.id === r.company_id))))),
        visible.length > 300 ? el('p', { class: 'pfmp-muted', text: 'Seules les 300 plus récentes sont affichées ; l’export contient tout.' }) : null));
    }
    async function exportReports(list) {
      try {
        const X = await xlsx();
        const rows = [['Élève', 'Classe', 'Entreprise', 'Ville', 'Réponse', 'Date du contact', 'Moyen', 'Interlocuteur', 'Compte rendu', 'Début PFMP', 'Fin PFMP'],
          ...list.map(r => { const s = students.find(x => x.user_id === r.student_id); const c = cache.companies.find(x => x.id === r.company_id);
            return [studentName(r.student_id), className(s?.class_id), companyName(c), c?.data.ville || '', r.status, r.date, r.method, r.contact, r.notes, r.start_date || '', r.end_date || '']; })];
        const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(rows), 'Démarches');
        X.writeFile(wb, 'pfmp-demarches-' + today() + '.xlsx');
      } catch (error) { say(error.message, true); }
    }
    function renderImport() {
      const file = el('input', { type: 'file', accept: '.csv,.xlsx,.xls,.json' });
      const progress = el('p', { class: 'pfmp-message', role: 'status' });
      const importButton = el('button', { type: 'button', class: 'portal-button', text: 'Importer le fichier', onclick: async () => {
        if (!file.files[0]) { progress.textContent = 'Choisissez un fichier.'; return; }
        importButton.disabled = true;
        try { progress.textContent = await importCompanies(file.files[0], text => { progress.textContent = text; }); await load(true); }
        catch (error) { progress.textContent = error.message; }
        finally { importButton.disabled = false; }
      } });
      const exportList = async format => {
        try {
          const headers = ['Raison sociale', 'Dénomination commerciale', 'Activité', 'Métiers', 'Secteurs', 'Adresse', 'Code postal', 'Ville', 'Téléphone', 'E-mail', 'Site web', 'SIRET', 'Contact responsable', 'Fonction', 'Téléphone responsable', 'E-mail responsable', 'Accueil des stagiaires', 'Capacité', 'Latitude', 'Longitude', 'PFMP attribuée à'];
          const rows = [headers, ...cache.companies.map(c => { const d = c.data; return [d.raisonSociale, d.denomination, d.activite, (d.metiers || []).join(', '), (d.secteurs || []).join(', '), d.adresse, d.codePostal, d.ville, d.telephone, d.email, d.siteWeb, d.siret, d.contactNom, d.contactFonction, d.contactTelephone, d.contactEmail, d.acceptation, d.capacite ?? '', d.lat ?? '', d.lon ?? '', reservations.has(c.id) ? studentName(reservations.get(c.id)) : '']; })];
          if (format === 'xlsx') { const X = await xlsx(); const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(rows), 'Entreprises'); X.writeFile(wb, 'pfmp-entreprises-' + today() + '.xlsx'); }
          else download('﻿' + rows.map(row => row.map(v => { const s = String(v ?? ''); return '"' + (/^[=+\-@]/.test(s) ? "'" + s : s).replace(/"/g, '""') + '"'; }).join(';')).join('\r\n'), 'pfmp-entreprises-' + today() + '.csv', 'text/csv;charset=utf-8');
        } catch (error) { say(error.message, true); }
      };
      const formHost = el('div');
      frame(el('div', { class: 'pfmp-columns' },
        el('section', { class: 'teach-card' }, el('h2', { text: 'Ajouter des entreprises' }),
          el('p', { class: 'teach-help', text: 'Fichier CSV ou Excel avec une colonne « Raison sociale » (et si possible : adresse, code postal, ville, téléphone, e-mail, SIRET, activité, métiers, latitude, longitude). Les doublons (même SIRET, ou même nom et adresse) et les entreprises supprimées sont ignorés.' }),
          file, importButton, progress,
          el('button', { type: 'button', class: 'subtle', text: '＋ Ajouter une entreprise à la main', onclick: () => formHost.replaceChildren(companyForm(null, text => { formHost.replaceChildren(); if (text) say(text); })) }), formHost),
        el('section', { class: 'teach-card' }, el('h2', { text: 'Exporter l’annuaire' }),
          el('p', { class: 'teach-help', text: cache.companies.length.toLocaleString('fr-FR') + ' entreprises, avec l’élève à qui chaque PFMP est attribuée.' }),
          el('div', { class: 'pfmp-actions' }, el('button', { type: 'button', class: 'subtle', text: 'Télécharger Excel', onclick: () => exportList('xlsx') }), el('button', { type: 'button', class: 'subtle', text: 'Télécharger CSV', onclick: () => exportList('csv') })))));
    }
    const MAPPING = { raisonSociale: ['raison sociale', 'entreprise', 'nom', 'raisonsociale'], denomination: ['denomination commerciale', 'denomination', 'nom commercial'], siege: ['siege social', 'siege'], activite: ['activite', 'secteur', 'activity'], ape: ['ape', 'code ape'], metiers: ['metiers', 'metier'], secteurs: ['secteurs'], adresse: ['adresse', 'adresse 1'], codePostal: ['code postal', 'cp', 'codepostal'], ville: ['ville', 'commune'], pays: ['pays'], telephone: ['telephone fixe', 'telephone', 'tel'], portable: ['telephone portable', 'portable'], email: ['email', 'e-mail', 'mail'], siteWeb: ['site web', 'siteweb', 'site internet'], siret: ['n° siret', 'siret', 'no siret'], contactNom: ['contact responsable', 'nom du responsable', 'contactnom'], contactFonction: ['fonction du responsable', 'fonction'], contactTelephone: ['telephone fixe du responsable', 'telephone responsable'], contactEmail: ['email du responsable', 'e-mail responsable'], acceptation: ['accepte les stagiaires', 'accueil des stagiaires'], capacite: ['nombre max stagiaires', 'capacite'], lat: ['latitude', 'lat'], lon: ['longitude', 'lon', 'lng'] };
    async function importCompanies(file, progress) {
      let list;
      if (file.name.toLowerCase().endsWith('.json')) {
        const data = JSON.parse(await file.text());
        list = Array.isArray(data) ? data : data.companies || data.entreprises;
        if (!Array.isArray(list)) throw new Error('Le fichier JSON doit contenir une liste d’entreprises.');
      } else {
        const X = await xlsx();
        const wb = X.read(await file.arrayBuffer(), { type: 'array', codepage: 65001 });
        const rows = X.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '', raw: false });
        let hi = rows.findIndex(r => r.some(v => ['raison sociale', 'raisonsociale'].includes(norm(v))));
        if (hi < 0) hi = rows.findIndex(r => r.some(v => norm(v) === 'entreprise'));
        if (hi < 0) throw new Error('Colonne « Raison sociale » introuvable.');
        const h = rows[hi].map(norm);
        list = rows.slice(hi + 1).filter(r => r.some(Boolean)).map(r => {
          const c = {};
          for (const [key, aliases] of Object.entries(MAPPING)) { const i = h.findIndex(x => aliases.includes(x)); c[key] = i >= 0 ? r[i] : ''; }
          if (!c.telephone) c.telephone = c.portable || '';
          return c;
        }).filter(c => String(c.raisonSociale || '').trim());
      }
      const prepared = [];
      for (const raw of list) { try { const c = normalizeCompany(raw); prepared.push({ ...c, fingerprint: await fingerprint(c) }); } catch { /* ligne sans nom : ignorée */ } }
      let added = 0, duplicates = 0;
      for (let i = 0; i < prepared.length; i += 200) {
        const r = await api.rest('rpc/pfmp_import_companies', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ p_companies: prepared.slice(i, i + 200) }) });
        added += r.added; duplicates += r.duplicates;
        progress('Import : ' + Math.min(i + 200, prepared.length) + ' / ' + prepared.length);
      }
      return added + ' entreprise(s) ajoutée(s) · ' + duplicates + ' doublon(s) ignoré(s).';
    }
    return { open };
  }

  // ───────────────────────────── Espace élève ─────────────────────────────
  function initStudent() {
    const tabs = document.getElementById('studentContentTabs');
    const dashboard = document.getElementById('studentDashboard');
    const tp = document.getElementById('studentTpPane');
    if (!tabs || !dashboard || !tp) return;
    const button = el('button', { type: 'button', id: 'studentPfmpTab', text: 'Ma PFMP' });
    tabs.append(button);
    const content = el('div', { class: 'pfmp-space' });
    const pane = el('section', { id: 'studentPfmpPane', class: 'student-pane pfmp-pane' }, el('h2', { text: 'Ma PFMP' }), content);
    pane.hidden = true;
    dashboard.append(pane);
    let reports = [], reservation = null, followup = {}, dir = null, me = '', ticket = 0;
    const tpRunning = () => tabs.dataset.tpActive === 'true';
    function close() { dir?.destroy(); dir = null; pane.hidden = true; button.classList.remove('active'); }
    async function open() {
      if (tpRunning()) return;
      tp.hidden = true;
      dashboard.querySelectorAll('.student-pane').forEach(other => { if (other !== pane) other.hidden = true; });
      tabs.querySelectorAll('button').forEach(other => other.classList.toggle('active', other === button));
      pane.hidden = false;
      await show();
    }
    async function show() {
      const current = ++ticket;
      content.replaceChildren(el('p', { class: 'portal-small', text: 'Chargement de l’annuaire des entreprises…' }));
      try {
        me = await api.userId();
        const [rep, res, fol] = await Promise.all([
          api.rest('pfmp_reports?select=*&student_id=eq.' + encodeURIComponent(me) + '&order=updated_at.desc'),
          api.rest('pfmp_reservations?select=company_id,report_id&student_id=eq.' + encodeURIComponent(me)),
          api.rest('rpc/pfmp_my_followup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }),
          loadCompanies(false)]);
        reports = rep; reservation = res[0] || null; followup = fol || {};
      } catch (error) { if (current === ticket) content.replaceChildren(el('p', { class: 'portal-message', text: 'PFMP indisponible : ' + error.message })); return; }
      if (current !== ticket || pane.hidden) return;
      render();
    }
    function render() {
      dir?.destroy(); dir = null;
      const company = reservation ? cache.companies.find(c => c.id === reservation.company_id) : null;
      const accepted = reservation ? reports.find(r => r.id === reservation.report_id) : null;
      const detail = el('div', { class: 'pfmp-detail-host' });
      const host = el('div');
      content.replaceChildren(
        followup.appreciation || followup.visit_date ? el('section', { class: 'pfmp-panel pfmp-followup' }, el('h3', { text: 'Suivi de votre enseignant' }),
          followup.visit_date ? el('p', { text: 'Visite en entreprise : ' + dateFr(followup.visit_date) }) : null,
          followup.appreciation ? el('p', { class: 'pfmp-notes', text: followup.appreciation }) : null) : null,
        el('section', { class: 'pfmp-panel' }, el('h3', { text: 'Mon entreprise' }),
          company ? el('div', {}, el('p', {}, el('b', { text: companyName(company) }), ' · ' + [company.data.codePostal, company.data.ville].filter(Boolean).join(' ')),
            accepted?.start_date ? el('p', { text: 'PFMP du ' + dateFr(accepted.start_date) + ' au ' + dateFr(accepted.end_date) }) : null,
            el('button', { type: 'button', text: 'Voir la fiche', onclick: () => openCompany(company, detail) }))
            : el('p', { class: 'portal-small', text: 'Pas encore d’entreprise. Cherchez ci-dessous, contactez les entreprises et notez chaque démarche. Quand une entreprise accepte, elle vous est réservée.' })),
        el('section', { class: 'pfmp-panel' }, el('h3', { text: 'Mes démarches (' + reports.length + ')' }),
          reports.length ? el('div', { class: 'pfmp-reports' }, reports.map(r => reportLine(r, companyName(cache.companies.find(c => c.id === r.company_id)), () => {
            const c = cache.companies.find(x => x.id === r.company_id); if (c) openCompany(c, detail, r);
          }))) : el('p', { class: 'portal-small', text: 'Aucune démarche pour l’instant.' })),
        detail,
        el('section', { class: 'pfmp-panel' }, el('h3', { text: 'Rechercher une entreprise' }), host));
      dir = directory(host, { teacher: false, reservations: new Map(reservation ? [[reservation.company_id, me]] : []), studentName: () => '', onOpen: c => openCompany(c, detail) });
    }
    function openCompany(c, host, editing) {
      const mine = reports.filter(r => r.company_id === c.id);
      const body = el('div');
      const list = () => body.replaceChildren(
        mine.length ? el('div', { class: 'pfmp-reports' }, mine.map(r => reportLine(r, 'Ma démarche', () => form(r)))) : el('p', { class: 'portal-small', text: 'Vous n’avez pas encore contacté cette entreprise.' }),
        el('button', { type: 'button', class: 'portal-button', text: '＋ Noter une démarche', onclick: () => form({ company_id: c.id }) }));
      const form = r => body.replaceChildren(reportForm(r, async values => {
        await saveReport({ ...r, company_id: c.id }, values);
        await show();
      }, list));
      host.replaceChildren(el('section', { class: 'pfmp-panel pfmp-company-detail' },
        el('div', { class: 'pfmp-actions pfmp-title' }, el('h3', { text: companyName(c) }), el('button', { type: 'button', text: 'Fermer', onclick: () => host.replaceChildren() })),
        companyDetails(c), el('h3', { text: 'Mes démarches avec cette entreprise' }), body));
      if (editing) form(editing); else list();
      host.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    button.addEventListener('click', () => { if (pane.hidden) open(); });
    tabs.addEventListener('click', event => { const target = event.target.closest('button'); if (target && target !== button && !pane.hidden) close(); }, true);
    // Pendant un TP chronométré, l'onglet est indisponible (comme le référentiel).
    new MutationObserver(() => { button.disabled = tpRunning(); if (button.disabled && !pane.hidden) close(); }).observe(tabs, { attributes: true, attributeFilter: ['data-tp-active'] });
    new MutationObserver(() => { if (!tp.hidden && !pane.hidden) close(); }).observe(tp, { attributes: true, attributeFilter: ['hidden'] });
    new MutationObserver(() => { if (dashboard.hidden || tabs.hidden) { close(); content.replaceChildren(); cache.revision = null; cache.companies = []; } }).observe(dashboard, { attributes: true, attributeFilter: ['hidden'] });
    document.getElementById('studentRefresh')?.addEventListener('click', () => { if (!pane.hidden) close(); }, true);
  }

  // ───────────────────────────── Démarrage ─────────────────────────────
  const teacherRoot = document.getElementById('pfmpView');
  if (teacherRoot) {
    const teacher = initTeacher(teacherRoot);
    // Ouverture du menu : la vue est affichée par show('pfmp') ; les données se chargent alors.
    new MutationObserver(() => { if (!teacherRoot.classList.contains('hidden')) teacher.open(false); }).observe(teacherRoot, { attributes: true, attributeFilter: ['class'] });
  }
  if (document.getElementById('studentContentTabs')) initStudent();
  window.MelecPfmp = { normalizeCompany, fingerprint, norm };
})();
