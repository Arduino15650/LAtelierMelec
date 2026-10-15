/* L'Atelier MELEC : menu « SUIVI&PFMP » de l'espace enseignant (vue #suiviView).
   Reprise de l'application « Évaluation ponctuelle » (melec-evaluation) : tableau de bord, classes,
   élèves, professeurs, tuteurs, activités en atelier, PFMP, évaluations E2 · E31 · E32,
   attestations de stage signées, résultats, accès des collègues — plus l'annuaire des entreprises
   PFMP déjà présent dans L'Atelier MELEC.
   Les calculs sont dans suivi-core.js ; les droits sont imposés par la base (…_suivi.sql). */
(function () {
  'use strict';
  const api = window.MelecPortal, K = window.MelecSuiviCore;
  const root = document.getElementById('suiviView');
  if (!api || !K || !root) return;

  // ───────── Utilitaires ─────────
  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (value === undefined || value === null || value === false) continue;
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key === 'value') node.value = value;
      else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value === true ? '' : value);
    }
    children.flat(Infinity).forEach(child => { if (child !== null && child !== undefined && child !== false) node.append(child); });
    return node;
  }
  const fill = (node, ...children) => node.replaceChildren(...children.flat(Infinity).filter(c => c !== null && c !== undefined && c !== false));
  const option = (value, text, selected) => el('option', { value, text: text ?? value, selected: selected || null });
  const field = (label, control, cls) => el('label', { class: 'su-field' + (cls ? ' ' + cls : '') }, el('span', { text: label }), control);
  const rpc = (name, body = {}) => api.rest('rpc/' + name, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, 60000);
  const collator = new Intl.Collator('fr', { numeric: true, sensitivity: 'base' });
  const byName = (a, b) => collator.compare(`${a.lastName} ${a.firstName}`, `${b.lastName} ${b.firstName}`);
  const plural = (n, word) => `${n} ${word}${n > 1 ? 's' : ''}`;
  const dateFr = value => { const [y, m, d] = String(value || '').split('-'); return d ? `${d}/${m}/${y}` : value || ''; };
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
  async function readRows(file) {
    const X = await xlsx();
    // CSV : lu comme texte UTF-8 (sinon les accents des en-têtes, « Prénom », ne sont pas reconnus).
    const wb = /\.csv$/i.test(file.name) ? X.read(await file.text(), { type: 'string', raw: true }) : X.read(new Uint8Array(await file.arrayBuffer()), { type: 'array', cellDates: true });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    if (!sheet) throw new Error('Le fichier Excel ne contient aucune feuille.');
    return X.utils.sheet_to_json(sheet, { defval: '', raw: true });
  }
  function pickFile(accept, then) {
    const input = el('input', { type: 'file', accept, hidden: true });
    input.addEventListener('change', () => { const f = input.files?.[0]; input.remove(); if (f) then(f); });
    document.body.append(input); input.click();
  }
  function optimizeLogo(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Impossible de lire le logo.'));
      reader.onload = () => {
        const image = new Image();
        image.onerror = () => reject(new Error('Le fichier choisi n’est pas une image valide.'));
        image.onload = () => {
          const scale = Math.min(1, 900 / image.width, 360 / image.height), canvas = document.createElement('canvas'), ctx = canvas.getContext('2d');
          canvas.width = Math.max(1, Math.round(image.width * scale)); canvas.height = Math.max(1, Math.round(image.height * scale));
          if (!ctx) return reject(new Error('La préparation du logo a échoué.'));
          ctx.drawImage(image, 0, 0, canvas.width, canvas.height); resolve(canvas.toDataURL('image/png'));
        };
        image.src = String(reader.result || '');
      };
      reader.readAsDataURL(file);
    });
  }

  // ───────── État et synchronisation ─────────
  let S = K.cleanState({}), role = '', me = '', base = null, version = '', loaded = false, loading = null, page = 'tableau', examKey = '';
  let docTimer = 0, docSaving = Promise.resolve(), docDirty = false;
  const evalTimers = new Map(), attTimers = new Map();
  const banner = el('p', { class: 'su-banner', role: 'status', hidden: true });
  function say(text, error) { banner.textContent = text || ''; banner.hidden = !text; banner.classList.toggle('error', Boolean(error)); }
  const pending = () => docDirty || docTimer || evalTimers.size || attTimers.size;

  async function load(keepPage) {
    const data = await rpc('suivi_load');
    role = data.role; me = data.email || ''; version = data.version; base = data.updatedAt || null;
    const evaluations = {};
    (data.evaluations || []).forEach(e => { (evaluations[e.studentId] ||= {})[e.slot] = e.evaluation; });
    const keep = { selected: S.selected, selectedActivity: S.selectedActivity, selectedPfmp: S.selectedPfmp };
    S = { ...K.cleanState({ ...(data.state || {}), evaluations, attestations: data.attestations || [] }), ...(keepPage ? keep : {}) };
    if (role !== 'admin' && !['pfmp', 'attestations', 'exam'].includes(page)) page = 'pfmp';
    loaded = true;
    linkFromRoster();
  }
  // ───────── Base commune : élèves et classes de « Élèves par classe » ─────────
  const registre = () => window.MelecRegistre;
  function linkFromRoster() {
    if (role !== 'admin' || !registre()) return false;
    const next = K.linkRoster(S, registre().roster());
    if (next === S) return false;
    S = next; scheduleDoc(); return true;
  }
  window.addEventListener('melec-roster-change', () => {
    if (!loaded || !linkFromRoster() || root.classList.contains('hidden')) return;
    const active = document.activeElement;
    if (!(active && root.contains(active) && /INPUT|TEXTAREA|SELECT/.test(active.tagName))) render();
  });
  // Élèves saisis ou importés ici : ajoutés aussi à la liste de référence, puis reliés.
  function shareStudents(list) {
    // Un élève ressaisi volontairement est de nouveau suivi s'il avait été retiré.
    const keys = new Set(list.map(K.studentNameKey));
    const back = new Set((registre()?.roster() || []).filter(r => keys.has(K.nameKey(r.name, r.className))).map(r => r.id));
    if (back.size && (S.detachedRoster || []).some(id => back.has(id))) S = { ...S, detachedRoster: S.detachedRoster.filter(id => !back.has(id)) };
    const added = registre()?.addStudents(list) || 0;
    if (added || back.size) S = K.linkRoster(S, registre().roster());
    return added;
  }
  function ensureLoaded() {
    if (loaded) return Promise.resolve();
    return loading ||= load(false).catch(error => { loading = null; throw error; });
  }
  function scheduleDoc() {
    if (role !== 'admin') return;
    docDirty = true; clearTimeout(docTimer);
    docTimer = setTimeout(() => { docTimer = 0; saveDoc(); }, 1200);
  }
  function saveDoc() {
    docSaving = docSaving.catch(() => {}).then(async () => {
      if (!docDirty) return;
      docDirty = false; say('Enregistrement…');
      try {
        base = await rpc('suivi_save_state', { p_data: K.documentOf(S), p_base: base });
        version = await rpc('suivi_version'); say('');
      } catch (error) {
        if (/autre poste/.test(error.message)) { say('Le suivi a été modifié sur un autre poste : la dernière version est rechargée. Refaites votre dernière modification.', true); await load(true); render(); }
        else { docDirty = true; say('Enregistrement interrompu : ' + error.message + ' Vos modifications restent dans cet onglet ; nouvel essai dans 10 s.', true); docTimer = setTimeout(() => { docTimer = 0; saveDoc(); }, 10000); }
      }
    });
    return docSaving;
  }
  function mutate(fn, redraw = true) { S = fn(S); scheduleDoc(); if (redraw) render(); }
  function setEvaluation(studentId, slot, ev) {
    S = { ...S, evaluations: { ...S.evaluations, [studentId]: { ...(S.evaluations[studentId] || {}), [slot]: ev } } };
    const key = studentId + '|' + slot; clearTimeout(evalTimers.get(key));
    evalTimers.set(key, setTimeout(async function send() {
      try { await rpc('suivi_save_evaluation', { p_student: studentId, p_slot: slot, p_evaluation: S.evaluations[studentId]?.[slot] || {} }); evalTimers.delete(key); say(''); }
      catch (error) { say('Évaluation non enregistrée : ' + error.message + ' Nouvel essai dans 10 s.', true); evalTimers.set(key, setTimeout(send, 10000)); }
    }, 700));
  }
  function putAttestation(a) {
    S = { ...S, attestations: S.attestations.some(x => x.id === a.id) ? S.attestations.map(x => x.id === a.id ? a : x) : [...S.attestations, a] };
  }
  function saveAttestation(a, now) {
    putAttestation(a); clearTimeout(attTimers.get(a.id));
    const send = async () => {
      try { putAttestation(await rpc('suivi_save_attestation', { p: S.attestations.find(x => x.id === a.id) })); attTimers.delete(a.id); say(''); if (now) render(); }
      catch (error) { attTimers.delete(a.id); say('Attestation non enregistrée : ' + error.message, true); }
    };
    if (now) return send();
    attTimers.set(a.id, setTimeout(send, 700));
  }
  async function flushAll() {
    clearTimeout(docTimer); docTimer = 0; await saveDoc();
    for (const [key, timer] of [...evalTimers]) { clearTimeout(timer); evalTimers.delete(key); const [studentId, slot] = key.split('|'); await rpc('suivi_save_evaluation', { p_student: studentId, p_slot: slot, p_evaluation: S.evaluations[studentId]?.[slot] || {} }); }
    for (const [id, timer] of [...attTimers]) { clearTimeout(timer); attTimers.delete(id); putAttestation(await rpc('suivi_save_attestation', { p: S.attestations.find(x => x.id === id) })); }
  }
  // Collègues qui travaillent en même temps : rechargement si le suivi a changé ailleurs.
  setInterval(async () => {
    if (!loaded || root.classList.contains('hidden') || document.hidden || pending()) return;
    try {
      const v = await rpc('suivi_version');
      if (v !== version && !pending()) { const active = document.activeElement; if (active && root.contains(active) && /INPUT|TEXTAREA|SELECT/.test(active.tagName)) return; await load(true); render(); }
    } catch { /* nouvel essai au prochain passage */ }
  }, 20000);
  window.addEventListener('beforeunload', event => { if (pending()) { event.preventDefault(); event.returnValue = ''; } });

  // ───────── Mise en page ─────────
  const ADMIN_PAGES = [['tableau', 'Tableau de bord'], ['classes', 'Classes'], ['eleves', 'Élèves'], ['professeurs', 'Professeurs'], ['tuteurs', 'Tuteurs'],
    ['activites', 'Activités en atelier'], ['pfmp', 'PFMP'], ['attestations', 'Attestations de stage'], ['resultats', 'Résultats'], ['acces', 'Accès des enseignants'], ['annuaire', 'Annuaire des entreprises']];
  const TEACHER_PAGES = [['pfmp', 'PFMP'], ['attestations', 'Attestations de stage']];
  const tabs = el('nav', { class: 'su-tabs', 'aria-label': 'Rubriques du suivi' });
  const main = el('div', { class: 'su-main' });
  const annuaire = document.getElementById('pfmpView');
  fill(root, el('header', { class: 'su-top' }, el('div', {}, el('p', { class: 'su-kicker', text: 'Suivi & certification' }), el('h2', { text: 'SUIVI&PFMP' }))), tabs, banner, main);
  if (annuaire) { annuaire.classList.remove('view'); annuaire.classList.add('hidden'); root.append(annuaire); }
  // Pages déjà visitées dans SUIVI&PFMP : utilisées par le bouton « Retour » flottant (retour.js).
  const visited = [];
  function go(next, exam) {
    if (next !== page || (exam || '') !== examKey) { visited.push([page, examKey]); if (visited.length > 30) visited.shift(); }
    page = next; examKey = exam || ''; render(); root.scrollIntoView({ block: 'start' });
  }
  function back() {
    if (root.classList.contains('hidden') || !visited.length) return false;
    [page, examKey] = visited.pop(); render(); root.scrollIntoView({ block: 'start' });
    return true;
  }
  function heading(kicker, title, copy, action) {
    return el('section', { class: 'su-heading' }, el('div', {}, kicker ? el('em', { text: kicker }) : null, el('h3', { text: title }), copy ? el('p', { text: copy }) : null), action || null);
  }
  function render() {
    // L'annuaire des entreprises reste réservé aux enseignants de L'Atelier MELEC (règles de la base).
    const pages = role === 'admin' ? ADMIN_PAGES : TEACHER_PAGES;
    fill(tabs, [...new Map(pages).entries()].map(([id, label]) => el('button', { type: 'button', class: (page === id || (page === 'exam' && id === (S.selectedActivity ? 'activites' : 'pfmp'))) ? 'active' : '', text: label, onclick: () => go(id) })));
    const showDirectory = page === 'annuaire';
    main.hidden = showDirectory;
    if (annuaire) annuaire.classList.toggle('hidden', !showDirectory);
    if (showDirectory) return;
    const view = { tableau: dashboard, classes: classesPage, eleves: studentsPage, professeurs: () => peoplePage(false), tuteurs: () => peoplePage(true),
      activites: activitiesPage, evaluations: evaluationHub, pfmp: pfmpPage, exam: examPage, attestations: attestationsPage, resultats: resultsPage, acces: accessPage }[page] || pfmpPage;
    try { fill(main, view()); } catch (error) { console.error(error); fill(main, el('p', { class: 'su-error', text: 'Cette page n’a pas pu s’afficher : ' + error.message })); }
  }
  const table = (headers, rows) => el('div', { class: 'su-table-wrap' }, el('table', { class: 'su-table' },
    el('thead', {}, el('tr', {}, headers.map(h => el('th', { text: h })))), el('tbody', {}, rows.map(r => el('tr', {}, r.map(c => el('td', {}, c)))))));
  const classSelect = (value, onchange, empty = 'Choisir une classe') => el('select', { onchange: e => onchange(e.target.value) }, option('', empty), S.classes.map(c => option(c, c, c === value)));
  const examLabel = key => K.exams.find(e => e.key === key)?.label;

  // ───────── 01 Tableau de bord ─────────
  function dashboard() {
    return el('div', { class: 'su-page' },
      heading('TABLEAU DE BORD', 'Pilotage de la classe'),
      el('section', { class: 'su-kpis' },
        el('article', {}, el('span', { text: 'Nombre de classes' }), el('b', { text: S.classes.length }), el('small', { text: `Nombre d’élèves enregistrés : ${S.students.length}` })),
        el('article', {}, el('span', { text: 'Équipes pédagogiques' }), el('b', { text: S.classes.length }), el('small', { text: `Professeurs : ${S.teachers.length} · PFMP : ${S.pfmps.length}` }))),
      el('section', { class: 'su-note' }, el('strong', { text: 'Référentiel officiel MELEC 2024' }),
        el('p', { text: 'E31 regroupe désormais réalisation et mise en service (coefficient 7). E32 couvre la maintenance d’une installation (coefficient 2).' })),
      el('section', { class: 'su-exam-cards' }, K.exams.map(e => el('article', {}, el('header', {}, el('span', { text: e.label }), el('b', { text: 'Coef. ' + e.coefficient })),
        el('h4', { text: e.title }), el('p', { text: e.competencies.map(c => c.code).join(' · ') }), el('small', { text: plural(e.competencies.length, 'compétence') })))),
      el('section', { class: 'su-levels' }, el('h4', { text: 'Niveaux d’acquisition · N1 à N4' }),
        el('div', {}, K.levels.map((l, i) => el('article', { style: `border-top-color:${l.color}` }, el('header', {}, el('span', { style: `background:${l.color}`, text: l.code }), el('b', { text: l.title }), el('small', { text: Math.round(l.factor * 100) + '%' })), el('p', { text: K.levelDescriptions[i] }))))));
  }

  // ───────── 02 Classes ─────────
  let teacherClass = '';
  function importStudents(file) {
    readRows(file).then(rows => {
      // Les élèves déjà connus (même nom et même classe, ou même INE) sont complétés, jamais dupliqués ni effacés.
      const incoming = K.mergeUnique([], K.studentsFromRows(rows, S.classes[0] || ''), K.studentKey);
      const result = K.enrichStudents(S, incoming);
      S = result.state; shareStudents(incoming);
      mutate(x => ({ ...x, selected: '' }));
      alert(`Importation terminée sans doublon : ${result.added} nouvel(s) élève(s), ${result.updated} fiche(s) complétée(s) (INE, date de naissance).`);
    }).catch(error => alert(error.message || 'Importation impossible.'));
  }
  function importTeachers(file) {
    readRows(file).then(rows => {
      const added = K.mergeUnique([], K.reconcileImportedTeachers(S.teachers, K.teachersFromRows(rows, teacherClass)), K.teacherKey), affected = new Set(added.map(a => K.norm(a.className || '')));
      const previous = S.teachers.filter(t => affected.has(K.norm(t.className || ''))), keys = new Set(added.map(K.teacherKey));
      const synchronized = K.mergeUnique(previous, added, K.teacherKey).filter(t => keys.has(K.teacherKey(t)));
      const kept = new Set(synchronized.map(t => t.id)), removed = new Set(previous.filter(t => !kept.has(t.id)).map(t => t.id));
      mutate(x => { const c = K.removeTeacherReferences(x, removed);
        return { ...c, teachers: [...c.teachers.filter(t => !affected.has(K.norm(t.className || ''))), ...synchronized], classes: K.mergeClassNames(c.classes, added.map(t => t.className || '')) }; });
      alert(`${plural(added.length, 'enseignant')} importé${added.length > 1 ? 's' : ''} sans doublon.`);
    }).catch(error => alert(error.message || 'Importation impossible.'));
  }
  function deleteClass(c) {
    const students = S.students.filter(s => s.className === c), teachers = S.teachers.filter(t => t.className === c);
    if ((students.length || teachers.length) && !confirm('Cette classe contient des élèves ou des enseignants. La supprimer de la liste ?')) return;
    const removedStudents = new Set(students.map(s => s.id)), pfmps = S.pfmps.filter(p => p.className === c), acts = S.activities.filter(a => a.className === c);
    pfmps.forEach(p => rpc('suivi_purge', { p_kind: 'pfmp', p_id: p.id }).catch(() => {}));
    acts.forEach(a => rpc('suivi_purge', { p_kind: 'activity', p_id: a.id }).catch(() => {}));
    if (removedStudents.size) rpc('suivi_purge_students', { p_ids: [...removedStudents] }).catch(() => {});
    const detached = students.map(s => s.rosterId).filter(Boolean);
    mutate(x => { const cl = K.removeTeacherReferences(K.removeStudentReferences(x, removedStudents), new Set(teachers.map(t => t.id)));
      return { ...cl, detachedRoster: [...new Set([...(cl.detachedRoster || []), ...detached])], classes: cl.classes.filter(n => n !== c), activities: cl.activities.filter(a => a.className !== c), pfmps: cl.pfmps.filter(p => p.className !== c),
        tutors: cl.tutors.filter(t => t.className !== c), attestations: cl.attestations.filter(a => !pfmps.some(p => p.id === a.pfmpId)) }; });
  }
  function classesPage() {
    const name = el('input', { placeholder: 'Ex. TMELEC 1' });
    return el('div', { class: 'su-page' },
      heading('PAGE 02', 'Gestion des classes', '', field('Année scolaire de référence', el('input', { value: S.schoolYear, placeholder: '2026-2027', onchange: e => mutate(x => ({ ...x, schoolYear: e.target.value.trim() })) }))),
      el('section', { class: 'su-grid2' },
        el('article', { class: 'su-card' }, el('h4', { text: '01 · Nouvelle classe' }), field('Intitulé de la classe', name),
          el('button', { type: 'button', class: 'su-primary', text: '+ Créer la classe', onclick: () => { const c = name.value.trim(); if (c) { teacherClass = c; mutate(x => ({ ...x, classes: K.mergeClassNames(x.classes, [c]) })); } } }),
          el('p', { class: 'su-sep', text: 'Importer pour ajouter ou mettre à jour sans doublon' }),
          el('button', { type: 'button', text: '+ Importer Excel (élèves)', onclick: () => pickFile('.xlsx,.xls,.csv', importStudents) })),
        el('article', { class: 'su-card' }, el('h4', { text: '02 · Nouvelle liste d’enseignants' }),
          field('Classe de rattachement', classSelect(teacherClass, v => { teacherClass = v; })),
          el('button', { type: 'button', class: 'su-primary', text: '+ Créer la liste', onclick: () => { if (teacherClass) { peopleClass = teacherClass; personDraft.className = teacherClass; go('professeurs'); } } }),
          el('p', { class: 'su-sep', text: 'Importer pour ajouter ou mettre à jour sans doublon' }),
          el('button', { type: 'button', text: '+ Importer Excel (enseignants)', onclick: () => pickFile('.xlsx,.xls,.csv', importTeachers) }))),
      el('h4', { class: 'su-section', text: `Classes créées · ${S.schoolYear}` }),
      el('section', { class: 'su-class-cards' }, S.classes.length ? S.classes.map(c => el('article', {},
        el('div', {}, el('span', { text: 'Classe' }), el('b', { text: c })),
        el('p', {}, el('span', { text: 'Nombre d’élèves' }), el('b', { text: S.students.filter(s => s.className === c).length })),
        el('p', {}, el('span', { text: 'Nombre d’enseignants' }), el('b', { text: S.teachers.filter(t => !t.className || t.className === c).length })),
        el('button', { type: 'button', class: 'su-icon danger', 'aria-label': 'Supprimer ' + c, text: '🗑', onclick: () => deleteClass(c) }))) : el('p', { class: 'su-empty', text: 'Aucune classe créée.' })));
  }

  // ───────── 03 Élèves ─────────
  let studentsClass = '';
  function studentsPage() {
    const f = { lastName: el('input'), firstName: el('input'), birthDate: el('input', { type: 'date' }), ine: el('input') }, cls = classSelect('', () => {});
    const visible = S.students.filter(s => s.className === studentsClass).sort(byName);
    return el('div', { class: 'su-page' }, heading('PAGE 03', 'Liste des élèves'),
      el('section', { class: 'su-card su-form' }, el('h4', { text: 'Nouvel élève' }),
        el('div', { class: 'su-fields' }, field('Nom', f.lastName), field('Prénom', f.firstName), field('Date de naissance', f.birthDate), field('Numéro INE', f.ine), field('Classe', cls),
          el('button', { type: 'button', class: 'su-primary', text: '+ Ajouter l’élève', onclick: () => {
            if (!f.lastName.value.trim() || !f.firstName.value.trim() || !cls.value) return;
            const st = { id: K.uid(), lastName: f.lastName.value.trim(), firstName: f.firstName.value.trim(), className: cls.value, birthDate: K.formatBirthDate(f.birthDate.value), ine: f.ine.value.trim() };
            studentsClass = cls.value; S = K.enrichStudents(S, [st]).state; shareStudents([st]); mutate(x => x);
          } }))),
      el('section', { class: 'su-filter' }, field('Afficher la liste de la classe', classSelect(studentsClass, v => { studentsClass = v; render(); })), studentsClass ? el('small', { text: plural(visible.length, 'élève') }) : null),
      studentsClass ? table(['Nom', 'Prénom', 'Classe', 'Date de naissance', 'Numéro INE', ''], visible.map(st => [st.lastName, st.firstName, st.className, K.formatBirthDate(st.birthDate), st.ine || '',
        el('button', { type: 'button', class: 'su-icon danger', 'aria-label': 'Supprimer ' + st.lastName, text: '🗑', onclick: () => {
          if (!confirm(`Retirer ${st.lastName} ${st.firstName} du suivi et supprimer ses évaluations ?${st.rosterId ? '\nL’élève reste dans la liste « Élèves par classe » du site.' : ''}`)) return;
          rpc('suivi_purge_students', { p_ids: [st.id] }).catch(error => say(error.message, true));
          mutate(x => ({ ...K.removeStudentReferences(x, new Set([st.id])), detachedRoster: st.rosterId ? [...new Set([...(x.detachedRoster || []), st.rosterId])] : (x.detachedRoster || []) }));
        } })])) : null);
  }

  // ───────── 04 Professeurs · 05 Tuteurs ─────────
  let peopleClass = '', tutorStudent = '';
  const personDraft = { className: '' };
  function peoplePage(isTutor) {
    const inputs = {}, keys = isTutor ? [['hostStructure', 'Structure d’accueil'], ['company', 'Raison sociale *'], ['companyAddress', 'Adresse / Code postal / Ville'], ['companyPhone', 'Téléphone de l’entreprise'],
      ['lastName', 'Nom du tuteur'], ['firstName', 'Prénom du tuteur'], ['email', 'E-mail'], ['phone', 'Téléphone']] : [['lastName', 'Nom'], ['firstName', 'Prénom'], ['email', 'E-mail'], ['subject', 'Matière']];
    keys.forEach(([k]) => { inputs[k] = el('input', { type: k === 'email' ? 'email' : 'text' }); });
    const tutorClass = classSelect(personDraft.className || '', v => { personDraft.className = v; personDraft.pfmpId = ''; personDraft.studentIds = []; render(); }, 'Choisir une classe');
    const pfmpSel = el('select', { disabled: !personDraft.className || null, onchange: e => { personDraft.pfmpId = e.target.value; } }, option('', 'Choisir une PFMP'),
      S.pfmps.filter(p => p.className === personDraft.className).map(p => option(p.id, `${p.name} · ${p.startDate} au ${p.endDate}`, p.id === personDraft.pfmpId)));
    const picks = S.students.filter(s => s.className === personDraft.className).sort(byName).map(st => el('label', { class: 'su-check' },
      el('input', { type: 'checkbox', checked: (personDraft.studentIds || []).includes(st.id) || null, onchange: e => { const set = new Set(personDraft.studentIds || []); e.target.checked ? set.add(st.id) : set.delete(st.id); personDraft.studentIds = [...set]; } }),
      el('span', { text: `${st.lastName} ${st.firstName}` })));
    const add = () => {
      const p = Object.fromEntries(keys.map(([k]) => [k, inputs[k].value.trim()]));
      if (!p.lastName) return;
      if (isTutor) {
        if (!p.company || !personDraft.className || !personDraft.pfmpId || !(personDraft.studentIds || []).length) { alert('Renseignez l’entreprise, la classe, la PFMP et au moins un élève.'); return; }
        mutate(x => ({ ...x, tutors: K.mergeUnique(x.tutors, [{ ...p, id: K.uid(), className: personDraft.className, pfmpId: personDraft.pfmpId, studentIds: [...personDraft.studentIds] }], K.tutorKey) }));
        personDraft.studentIds = [];
      } else {
        peopleClass = personDraft.className || peopleClass;
        mutate(x => ({ ...x, teachers: K.mergeUnique(x.teachers, [{ ...p, email: p.email.toLowerCase(), phone: '', id: K.uid(), className: personDraft.className || '' }], K.teacherKey) }));
      }
    };
    const list = isTutor ? (tutorStudent ? S.tutors.filter(t => (t.studentIds || []).includes(tutorStudent)) : []) : (peopleClass ? S.teachers.filter(t => !t.className || t.className === peopleClass).sort(byName) : []);
    const tutorStudents = S.students.filter(s => S.tutors.some(t => (t.studentIds || []).includes(s.id))).sort(byName);
    const importTutors = file => readRows(file).then(rows => {
      const incoming = K.tutorsFromRows(rows, S), merged = K.mergeUnique([], incoming, K.tutorKey), affected = new Set(incoming.flatMap(t => (t.studentIds || []).map(id => `${t.pfmpId || ''}|${id}`)));
      mutate(x => ({ ...x, tutors: K.mergeUnique(x.tutors.map(t => ({ ...t, studentIds: (t.studentIds || []).filter(id => !affected.has(`${t.pfmpId || ''}|${id}`)) })).filter(t => (t.studentIds || []).length), merged, K.tutorKey) }));
      alert(`${plural(incoming.length, 'ligne')} importée${incoming.length > 1 ? 's' : ''}. Les affectations existantes ont été mises à jour sans doublon.`);
    }).catch(error => alert(error.message || 'Importation impossible.'));
    const template = async () => {
      const X = await xlsx(), sheet = X.utils.json_to_sheet([{ 'Structure d’accueil': '', 'Raison sociale': '', 'Adresse entreprise': '', 'Téléphone entreprise': '', 'Nom du tuteur': '', 'Prénom du tuteur': '', 'Email du tuteur': '', 'Téléphone du tuteur': '', Classe: '', PFMP: '', INE: '', 'Nom de l’élève': '', 'Prénom de l’élève': '' }]), wb = X.utils.book_new();
      X.utils.book_append_sheet(wb, sheet, 'Tuteurs PFMP'); X.writeFile(wb, 'modele-tuteurs-pfmp.xlsx');
    };
    const members = accessCache;
    // Entreprise choisie dans l'annuaire PFMP du site : coordonnées et contact repris sans ressaisie.
    let companyPick = null;
    if (isTutor) {
      const list = el('datalist', { id: 'suCompanyList' }), search = el('input', { type: 'search', list: 'suCompanyList', placeholder: 'Raison sociale, ville… (annuaire PFMP)' });
      let rows = [];
      search.addEventListener('change', () => {
        const d = rows.find(r => r.label === search.value)?.data;
        if (!d) return;
        const set = (k, v) => { if (v) inputs[k].value = v; };
        set('company', d.raisonSociale); set('hostStructure', d.denomination || d.raisonSociale);
        set('companyAddress', [d.adresse, [d.codePostal, d.ville].filter(Boolean).join(' ')].filter(Boolean).join(', '));
        set('companyPhone', d.telephone || d.portable);
        if (String(d.contactNom || '').trim()) { const n = K.splitRosterName(d.contactNom); set('lastName', n.lastName); set('firstName', n.firstName); }
        set('email', d.contactEmail); set('phone', d.contactTelephone);
      });
      companyPick = field('Choisir dans l’annuaire des entreprises', el('span', {}, search, list));
      window.MelecPfmp?.companies?.().then(all => {
        rows = all.map(c => ({ data: c.data, label: [c.data.raisonSociale, c.data.ville].filter(Boolean).join(' — ') }));
        rows.forEach(r => { r.key = K.norm(r.label + ' ' + (r.data.codePostal || '')); });
        // Suggestions limitées aux 40 meilleures correspondances : liste fluide même avec un gros annuaire.
        search.addEventListener('input', () => {
          const q = K.norm(search.value).split(/\s+/).filter(Boolean);
          fill(list, q.length ? rows.filter(r => q.every(w => r.key.includes(w))).slice(0, 40).map(r => option(r.label, r.label)) : []);
        });
      }).catch(() => { search.placeholder = 'Annuaire indisponible : saisie manuelle'; });
    }
    return el('div', { class: 'su-page' },
      heading(isTutor ? 'PAGE 05' : 'PAGE 04', isTutor ? 'Entreprises & tuteurs' : 'Professeurs', isTutor ? 'Entreprises partenaires et coordonnées des tuteurs liés aux périodes en entreprise.' : 'L’adresse e-mail permet d’autoriser le professeur à évaluer ses élèves en PFMP (rubrique Accès des enseignants).'),
      el('section', { class: 'su-card su-form' }, el('div', { class: 'su-fields' }, companyPick, keys.map(([k, label]) => field(label, inputs[k])),
        isTutor ? [field('Classe des élèves', tutorClass), field('Période PFMP', pfmpSel), el('details', { class: 'su-multi' }, el('summary', { text: (personDraft.studentIds || []).length ? plural(personDraft.studentIds.length, 'élève') + ' sélectionné(s)' : 'Choisir les élèves' }), el('div', {}, picks.length ? picks : el('small', { text: 'Choisissez d’abord une classe' })))]
          : field('Classe associée', classSelect(personDraft.className || '', v => { personDraft.className = v; }, 'Toutes les classes')),
        el('button', { type: 'button', class: 'su-primary', text: isTutor ? '+ Ajouter le tuteur' : '+ Ajouter', onclick: add }))),
      isTutor ? null : knownColleagues(),
      isTutor ? el('section', { class: 'su-card su-import' }, el('div', {}, el('h4', { text: 'Importer les entreprises et tuteurs' }),
          el('p', { text: 'Colonnes reconnues : Structure d’accueil, Raison sociale, Adresse entreprise, Téléphone entreprise, Nom du tuteur, Prénom du tuteur, Email du tuteur, Téléphone du tuteur, Classe, PFMP et INE. Le nom et le prénom de l’élève peuvent remplacer l’INE.' })),
          el('button', { type: 'button', text: '⤓ Modèle Excel', onclick: () => template().catch(error => alert(error.message)) }),
          el('button', { type: 'button', class: 'su-primary', text: '+ Importer Excel', onclick: () => pickFile('.xlsx,.xls,.csv', importTutors) })) : null,
      el('section', { class: 'su-filter' }, isTutor
        ? field('Afficher les informations d’un élève', el('select', { onchange: e => { tutorStudent = e.target.value; render(); } }, option('', 'Choisir un élève'), tutorStudents.map(s => option(s.id, `${s.lastName} ${s.firstName} · ${s.className}`, s.id === tutorStudent))))
        : field('Afficher l’équipe pédagogique de la classe', classSelect(peopleClass, v => { peopleClass = v; render(); })),
        el('small', { text: isTutor ? (tutorStudent ? plural(list.length, 'entreprise') + ' trouvée(s)' : tutorStudents.length ? 'Les détails restent masqués jusqu’à la sélection d’un élève.' : 'Aucun élève n’est encore associé à une entreprise.') : (peopleClass ? plural(list.length, 'enseignant') : '') })),
      (isTutor ? tutorStudent : peopleClass) ? table(isTutor ? ['Structure d’accueil', 'Raison sociale', 'Adresse de l’entreprise', 'Téléphone entreprise', 'Nom du tuteur', 'Prénom du tuteur', 'PFMP', 'Classe', 'Élève(s)', 'E-mail', 'Téléphone du tuteur', '']
          : ['Nom', 'Prénom', 'E-mail', 'Matière', 'Classe', 'Accès à l’évaluation', ''],
        list.map(p => isTutor ? [p.hostStructure || p.company || '', p.company || '', p.companyAddress || '', p.companyPhone || '', p.lastName, p.firstName,
            S.pfmps.find(x => x.id === p.pfmpId)?.name || '—', p.className || '—', (p.studentIds || []).map(id => S.students.find(s => s.id === id)).filter(Boolean).map(s => `${s.lastName} ${s.firstName}`).join(', '), p.email || '', p.phone || '',
            el('button', { type: 'button', class: 'su-icon danger', text: '🗑', 'aria-label': 'Supprimer', onclick: () => mutate(x => ({ ...x, tutors: x.tutors.filter(t => t.id !== p.id) })) })]
          : [p.lastName, p.firstName, el('input', { type: 'email', value: p.email || '', class: 'su-inline', onchange: e => mutate(x => ({ ...x, teachers: x.teachers.map(t => t.id === p.id ? { ...t, email: e.target.value.trim().toLowerCase() } : t) })) }),
            p.subject || '', p.className || 'Toutes', accessBadge(p.email, members),
            el('button', { type: 'button', class: 'su-icon danger', text: '🗑', 'aria-label': 'Supprimer', onclick: () => { if (confirm(`Retirer ${p.lastName} ${p.firstName} ? Ses élèves en PFMP n’auront plus d’enseignant référent.`)) mutate(x => K.removeTeacherReferences(x, new Set([p.id]))); } })])) : null);
  }
  function accessBadge(email, members) {
    if (!email) return el('small', { text: 'Ajoutez son e-mail' });
    const m = (members || []).find(x => x.email === email.toLowerCase());
    if (m?.active) return el('small', { class: 'su-ok', text: m.account ? (m.authenticator ? 'Autorisé · Authenticator actif' : 'Autorisé · Authenticator à activer') : 'Autorisé · compte à créer' });
    return el('button', { type: 'button', class: 'su-small', text: 'Autoriser l’accès', onclick: async () => { try { await rpc('suivi_member_set', { p_email: email, p_name: '', p_active: true }); await refreshAccess(); render(); } catch (error) { say(error.message, true); } } });
  }

  // ───────── 06 Activités en atelier ─────────
  const emptyActivity = () => ({ title: '', description: '', date: new Date().toISOString().slice(0, 10), periodId: '', className: '', studentIds: [], examKeys: [] });
  let activityDraft = emptyActivity(), editingActivity = '', periodDraft = { id: '', name: '', startDate: '', endDate: '' }, activityDetails = '';
  function activitiesPage() {
    const d = activityDraft, p = periodDraft;
    const savePeriod = () => { if (!p.name.trim()) return; const period = { ...p, id: p.id || K.uid(), name: p.name.trim() };
      periodDraft = { id: '', name: '', startDate: '', endDate: '' }; if (!d.periodId) d.periodId = period.id;
      mutate(x => ({ ...x, periods: p.id ? x.periods.map(i => i.id === period.id ? period : i) : [...x.periods, period] })); };
    const saveActivity = () => {
      if (!d.title.trim() || !d.className || !d.studentIds.length || !d.examKeys.length) { alert('Renseignez le titre, la classe, au moins un élève et au moins une épreuve.'); return; }
      const activity = { ...d, id: editingActivity || K.uid(), title: d.title.trim() };
      editingActivity = ''; activityDraft = emptyActivity(); activityDetails = activity.id;
      mutate(x => ({ ...x, activities: x.activities.some(a => a.id === activity.id) ? x.activities.map(a => a.id === activity.id ? activity : a) : [...x.activities, activity] }));
    };
    const students = S.students.filter(s => s.className === d.className).sort(byName);
    const shown = S.activities.filter(a => a.id === activityDetails);
    return el('div', { class: 'su-page' }, heading('PAGE 06', 'Activités en atelier', 'Créez les périodes et les activités, choisissez les élèves, puis lancez leur évaluation.'),
      el('section', { class: 'su-grid2' },
        el('article', { class: 'su-card' }, el('h4', { text: 'Périodes d’évaluation' }), el('p', { class: 'su-muted', text: 'Chaque activité est rattachée à une période modifiable.' }),
          el('div', { class: 'su-fields' }, field('Nom de la période', el('input', { value: p.name, placeholder: 'Ex. Semestre 1', oninput: e => { p.name = e.target.value; } })),
            field('Début', el('input', { type: 'date', value: p.startDate, oninput: e => { p.startDate = e.target.value; } })), field('Fin', el('input', { type: 'date', value: p.endDate, oninput: e => { p.endDate = e.target.value; } })),
            el('button', { type: 'button', class: 'su-primary', text: p.id ? 'Mettre à jour' : '+ Ajouter la période', onclick: savePeriod })),
          el('ul', { class: 'su-list' }, S.periods.map(period => el('li', {}, el('span', {}, el('b', { text: period.name }), el('small', { text: `${period.startDate || '—'} → ${period.endDate || '—'}` })),
            el('button', { type: 'button', class: 'su-icon', text: '✎', 'aria-label': 'Modifier ' + period.name, onclick: () => { periodDraft = { ...period }; render(); } }),
            el('button', { type: 'button', class: 'su-icon danger', text: '🗑', 'aria-label': 'Supprimer ' + period.name, onclick: () => { if (confirm(`Supprimer définitivement la période « ${period.name} » ?`)) mutate(x => ({ ...x, periods: x.periods.filter(i => i.id !== period.id), activities: x.activities.map(a => a.periodId === period.id ? { ...a, periodId: '' } : a) })); } }))))),
        el('article', { class: 'su-card' }, el('h4', { text: editingActivity ? 'Modifier l’activité' : 'Nouvelle activité' }), el('p', { class: 'su-muted', text: 'La sélection multiple des élèves est autorisée.' }),
          el('div', { class: 'su-fields' }, field('Titre de l’activité', el('input', { value: d.title, placeholder: 'Ex. Câblage d’un tableau électrique', oninput: e => { d.title = e.target.value; } })),
            field('Date', el('input', { type: 'date', value: d.date, oninput: e => { d.date = e.target.value; } })),
            field('Période', el('select', { onchange: e => { d.periodId = e.target.value; } }, option('', 'Sans période'), S.periods.map(x => option(x.id, x.name, x.id === d.periodId)))),
            field('Classe', classSelect(d.className, v => { d.className = v; d.studentIds = []; render(); })),
            field('Description et consignes', el('textarea', { value: d.description, placeholder: 'Objectifs, matériel, consignes de sécurité…', oninput: e => { d.description = e.target.value; } }), 'su-wide')),
          el('fieldset', { class: 'su-checks' }, el('legend', { text: 'Épreuves à évaluer' }), K.exams.map(exam => el('label', { class: 'su-check' },
            el('input', { type: 'checkbox', checked: d.examKeys.includes(exam.key) || null, onchange: e => { d.examKeys = e.target.checked ? [...d.examKeys, exam.key] : d.examKeys.filter(k => k !== exam.key); } }),
            el('span', {}, el('b', { text: exam.label + ' ' }), exam.title)))),
          el('details', { class: 'su-multi' }, el('summary', { text: d.studentIds.length ? plural(d.studentIds.length, 'élève') + ' sélectionné(s)' : d.className ? 'Choisir un ou plusieurs élèves' : 'Choisissez d’abord une classe' }),
            el('div', {}, students.length ? students.map(st => el('label', { class: 'su-check' }, el('input', { type: 'checkbox', checked: d.studentIds.includes(st.id) || null,
              onchange: e => { d.studentIds = e.target.checked ? [...d.studentIds, st.id] : d.studentIds.filter(id => id !== st.id); } }), el('span', { text: `${st.lastName} ${st.firstName}` }))) : el('p', { text: 'Aucun élève enregistré dans cette classe.' }))),
          el('div', { class: 'su-actions' }, editingActivity ? el('button', { type: 'button', text: 'Annuler', onclick: () => { editingActivity = ''; activityDraft = emptyActivity(); render(); } }) : null,
            el('button', { type: 'button', class: 'su-primary', text: editingActivity ? 'Enregistrer les modifications' : '✓ Créer l’activité', onclick: saveActivity })))),
      el('h4', { class: 'su-section', text: 'Activités créées' }),
      el('section', { class: 'su-filter' }, field('Afficher les détails d’une activité', el('select', { onchange: e => { activityDetails = e.target.value; render(); } }, option('', 'Choisir une activité'), S.activities.map(a => option(a.id, `${a.title} · ${a.className}`, a.id === activityDetails)))),
        el('small', { text: S.activities.length ? plural(S.activities.length, 'activité') + ' enregistrée(s)' : 'Aucune activité créée.' })),
      shown.length ? shown.map(a => { const period = S.periods.find(x => x.id === a.periodId);
        return el('article', { class: 'su-card su-activity' }, el('header', {}, el('div', {}, el('small', { text: `${period?.name || 'Sans période'} · ${a.date || 'Date non renseignée'}` }), el('h4', { text: a.title }),
            el('p', { text: `${a.className} · ${plural(a.studentIds.length, 'élève')} · ${a.examKeys.map(examLabel).filter(Boolean).join(' · ')}` })),
            el('div', {}, el('button', { type: 'button', class: 'su-icon', text: '✎', 'aria-label': 'Modifier', onclick: () => { editingActivity = a.id; activityDraft = { title: a.title, description: a.description, date: a.date, periodId: a.periodId, className: a.className, studentIds: [...a.studentIds], examKeys: [...a.examKeys] }; render(); } }),
              el('button', { type: 'button', class: 'su-icon danger', text: '🗑', 'aria-label': 'Supprimer', onclick: () => { if (!confirm(`Supprimer définitivement l’activité « ${a.title} » et toutes ses évaluations ?`)) return;
                rpc('suivi_purge', { p_kind: 'activity', p_id: a.id }).catch(error => say(error.message, true)); activityDetails = '';
                mutate(x => ({ ...x, activities: x.activities.filter(i => i.id !== a.id), evaluations: Object.fromEntries(Object.entries(x.evaluations).map(([sid, v]) => [sid, Object.fromEntries(Object.entries(v).filter(([k]) => !k.startsWith(`activity:${a.id}:`)))])) })); } }))),
          a.description ? el('p', { text: a.description }) : null,
          el('footer', { class: 'su-actions' }, el('button', { type: 'button', text: '⤓ Exporter PDF', onclick: () => exportActivityPdf(a).catch(error => alert(error.message)) }),
            el('button', { type: 'button', text: '⎙ Imprimer', onclick: () => exportActivityPdf(a, true).catch(error => alert(error.message)) }),
            el('button', { type: 'button', class: 'su-primary', text: 'Évaluer →', onclick: () => { S.selectedActivity = a.id; S.selectedPfmp = ''; S.selected = ''; go('evaluations'); } }))); })
        : el('p', { class: 'su-empty', text: S.activities.length ? 'Sélectionnez une activité pour afficher ses détails.' : 'Aucune activité créée.' }));
  }
  function evaluationHub() {
    const a = S.activities.find(x => x.id === S.selectedActivity);
    if (!a) return el('div', { class: 'su-page' }, heading('ÉVALUATIONS', 'E2 · E31 · E32', 'Choisissez d’abord une activité en atelier.'), el('button', { type: 'button', class: 'su-primary', text: '← Voir les activités', onclick: () => go('activites') }));
    return el('div', { class: 'su-page' }, heading('ÉVALUATIONS', 'E2 · E31 · E32', `Activité : ${a.title} · ${a.className}`),
      el('section', { class: 'su-card' }, el('strong', { text: 'Élèves concernés' }), el('p', { text: a.studentIds.map(id => S.students.find(s => s.id === id)).filter(Boolean).map(s => `${s.lastName} ${s.firstName}`).join(' · ') })),
      el('section', { class: 'su-exam-cards' }, K.exams.filter(e => a.examKeys.includes(e.key)).map(e => el('button', { type: 'button', class: 'su-exam-link', onclick: () => go('exam', e.key) },
        el('header', {}, el('span', { text: e.label }), el('b', { text: 'Coef. ' + e.coefficient })), el('h4', { text: e.title }), el('p', { text: e.competencies.map(c => c.code).join(' · ') }), el('small', { text: plural(e.competencies.length, 'compétence') + ' →' })))),
      el('button', { type: 'button', text: '← Retour aux activités', onclick: () => go('activites') }));
  }

  // ───────── Grille d'évaluation d'une épreuve ─────────
  function examPage() {
    const exam = K.exams.find(e => e.key === examKey) || K.exams[0];
    const pfmp = S.pfmps.find(p => p.id === S.selectedPfmp);
    const activity = S.activities.find(a => a.id === S.selectedActivity) || (pfmp ? { id: pfmp.id, title: `PFMP · ${pfmp.name}`, className: pfmp.className, studentIds: Object.keys(pfmp.assignments), examKeys: K.exams.map(e => e.key) } : undefined);
    const slot = pfmp ? K.pfmpEvaluationSlot(exam.key, pfmp.id) : K.evaluationSlot(exam.key, activity?.id);
    const pickable = S.selectedActivity ? S.students.filter(s => activity?.studentIds.includes(s.id)) : pfmp ? S.students.filter(s => pfmp.assignments[s.id]) : S.students;
    const picker = field('Élève à évaluer', el('select', { onchange: e => { S.selected = e.target.value; render(); } }, option('', 'Sélectionner un élève'), pickable.sort(byName).map(st => option(st.id, `${st.lastName} ${st.firstName} · ${st.className}`, st.id === S.selected))));
    const back = () => go(S.selectedActivity ? 'evaluations' : 'pfmp');
    const st = S.students.find(x => x.id === S.selected);
    if (!st) return el('div', { class: 'su-page' }, heading(exam.label, exam.title, 'Sélectionnez un élève pour commencer l’évaluation.', picker), el('button', { type: 'button', text: '← Retour', onclick: back }));
    const ev = { ...K.emptyEval(), ...(S.evaluations[st.id]?.[slot] || {}) }; ev.tasks = { ...(ev.tasks || {}) }; ev.criteria = { ...(ev.criteria || {}) }; ev.mastery = { ...(ev.mastery || {}) };
    const locked = Boolean(pfmp && S.attestations.some(a => a.pfmpId === pfmp.id && a.studentId === st.id && (a.signedAt || a.adminLocked)));
    const patch = (p, redraw = true) => { if (locked) return; setEvaluation(st.id, slot, { ...ev, ...p }); Object.assign(ev, p); if (redraw) render(); };
    const toggleMaster = (code, value) => { const mastery = { ...ev.mastery }; if (mastery[code] === value) delete mastery[code]; else mastery[code] = value;
      if (value === -1) patch({ mastery, tasks: Object.fromEntries(Object.entries(ev.tasks).filter(([k]) => !k.startsWith(code + '-task-'))), criteria: Object.fromEntries(Object.entries(ev.criteria).filter(([k]) => !k.startsWith(code + '-'))) });
      else patch({ mastery }); };
    const toggleChoice = (fieldName, id, value) => { const values = { ...ev[fieldName] }; if (values[id] === value) delete values[id]; else values[id] = value; patch({ [fieldName]: values }); };
    const total = K.score(S, st.id, exam, activity?.id, pfmp ? 'pfmp' : 'activity');
    const jury = S.teachers.filter(p => !p.className || p.className === st.className);
    const available = S.selectedActivity ? K.exams.filter(e => activity?.examKeys.includes(e.key)) : pfmp ? K.exams.filter(e => (pfmp.assignments[st.id]?.examKeys || []).includes(e.key)) : [exam];
    const index = available.findIndex(e => e.key === exam.key), prev = index > 0 ? available[index - 1] : null, next = index >= 0 && index < available.length - 1 ? available[index + 1] : null;
    const canOpenAttestation = pfmp ? K.attestationIsReady(S, pfmp, st.id) : false;
    const choiceRow = (text, id, fieldName, disabled) => el('div', { class: 'su-choice' }, el('p', { text }), el('div', {}, ['NE', ...K.levels.map(l => l.code)].map((code, j) =>
      el('button', { type: 'button', disabled: disabled || null, class: ev[fieldName][id] === code ? 'sel' : '', style: j ? `--level:${K.levels[j - 1].color}` : null, text: code, onclick: () => toggleChoice(fieldName, id, code) }))));
    return el('div', { class: 'su-page su-exam' },
      heading(exam.label, exam.title, `${st.lastName} ${st.firstName} · ${st.className}${activity ? ' · ' + activity.title : ''}`,
        el('div', { class: 'su-actions' }, el('button', { type: 'button', text: S.selectedActivity ? '← Épreuves de l’élève' : '← Retour à la PFMP', onclick: back }), picker,
          el('button', { type: 'button', text: '⎙ Imprimer', onclick: () => print() }), el('button', { type: 'button', text: '⤓ PDF', onclick: () => exportExamPdf(exam, st, activity, ev, total).catch(error => alert(error.message)) }))),
      locked ? el('p', { class: 'su-warn', role: 'status', text: 'Évaluation verrouillée : l’attestation est signée ou verrouillée. Le responsable doit d’abord la déverrouiller.' }) : null,
      el('div', { class: 'su-note' }, el('b', { text: 'Notation pondérée automatique' }), el('span', { text: ' NE est exclu du calcul. N1 = 0 %, N2 = 33 %, N3 = 67 %, N4 = 100 %. Un second clic désélectionne le niveau.' })),
      exam.competencies.map(c => { const disabled = locked || ev.mastery[c.code] === -1;
        return el('section', { class: 'su-competency' + (disabled ? ' off' : '') },
          el('header', {}, el('i', { text: (c.weight * 100).toFixed(1) + '%' }), el('div', {}, el('span', { text: c.code }), el('h4', { text: c.title }), el('small', { text: `Poids : ${(c.weight * 20).toFixed(2)} points sur 20` })),
            el('div', { class: 'su-master' }, [{ code: 'NE', title: 'Non évalué', color: '#718096' }, ...K.levels].map((l, i) => el('button', { type: 'button', disabled: locked || null, class: ev.mastery[c.code] === i - 1 ? 'sel' : '', style: `--level:${l.color}`, onclick: () => toggleMaster(c.code, i - 1) }, el('b', { text: l.code }), el('small', { text: l.title }))))),
          el('div', { class: 'su-sub' }, el('h5', { text: 'Tâches associées et niveaux d’évaluation' }), c.tasks.map((t, i) => choiceRow(t, `${c.code}-task-${i}`, 'tasks', disabled))),
          el('div', { class: 'su-sub' }, el('h5', { text: 'Critères d’évaluation et niveaux constatés' }), c.criteria.map((t, i) => choiceRow(t, `${c.code}-${i}`, 'criteria', disabled)))); }),
      el('section', { class: 'su-score' }, el('div', {}, el('span', { text: 'Note automatique pondérée' }), el('b', { text: total.toFixed(2) + ' /20' })),
        el('div', {}, exam.competencies.map(c => { const r = K.competencyResult(ev, c); return el('span', {}, el('strong', { text: c.code + ' : ' }), r.evaluated ? (c.weight * 20 * r.factor).toFixed(2) : '—'); }))),
      el('section', { class: 'su-card su-fields' }, field('Appréciation', el('textarea', { disabled: locked || null, value: ev.appreciation || '', oninput: e => patch({ appreciation: e.target.value }, false) }), 'su-wide'),
        field('Date d’évaluation', el('input', { type: 'date', disabled: locked || null, value: ev.date || '', onchange: e => patch({ date: e.target.value }) })),
        field('Évaluateurs / jury', el('select', { disabled: locked || null, onchange: e => patch({ jury: e.target.value }) }, option('', 'Sélectionner dans l’équipe pédagogique'),
          jury.map(p => option(`${p.firstName} ${p.lastName}`, `${p.firstName} ${p.lastName}${p.className ? ' · ' + p.className : ''}`, ev.jury === `${p.firstName} ${p.lastName}`))))),
      el('nav', { class: 'su-exam-nav' }, prev ? el('button', { type: 'button', text: `← ${prev.label} · ${prev.title}`, onclick: () => go('exam', prev.key) }) : el('span'),
        el('button', { type: 'button', text: S.selectedActivity ? 'Toutes les épreuves' : 'Suivi de la PFMP', onclick: back }),
        next ? el('button', { type: 'button', class: 'su-primary', text: `${next.label} · ${next.title} →`, onclick: () => go('exam', next.key) })
          : pfmp ? el('button', { type: 'button', class: 'su-primary', disabled: !canOpenAttestation || null, title: canOpenAttestation ? 'Ouvrir l’attestation de stage' : 'Renseignez chaque compétence, tâche et critère des épreuves affectées à l’élève, ainsi que la date et le jury.',
              text: 'Attestation de stage ' + (canOpenAttestation ? '→' : '🔒'), onclick: () => go('attestations') }) : el('span')));
  }

  // ───────── 07 PFMP ─────────
  let pfmpDraft = { name: '', startDate: '', endDate: '', className: '' }, editingPfmp = '';
  function pfmpPage() {
    const admin = role === 'admin', f = pfmpDraft;
    const savePfmp = () => {
      if (!f.name.trim() || !f.startDate || !f.endDate || !f.className) { alert('Renseignez le nom, les dates et la classe de la PFMP.'); return; }
      if (f.endDate < f.startDate) { alert('La date de fin doit être postérieure à la date de début.'); return; }
      const previous = S.pfmps.find(p => p.id === editingPfmp);
      const assignments = Object.fromEntries(S.students.filter(s => s.className === f.className).map(s => [s.id, previous?.assignments[s.id] || { teacherId: '', examKeys: [] }]));
      const pfmp = { ...f, id: editingPfmp || K.uid(), name: f.name.trim(), assignments };
      editingPfmp = ''; pfmpDraft = { name: '', startDate: '', endDate: '', className: '' };
      mutate(x => ({ ...x, pfmps: x.pfmps.some(p => p.id === pfmp.id) ? x.pfmps.map(p => p.id === pfmp.id ? pfmp : p) : [...x.pfmps, pfmp], selectedPfmp: pfmp.id }));
    };
    const updateAssignment = (pfmpId, studentId, patch) => mutate(x => ({ ...x, pfmps: x.pfmps.map(p => p.id !== pfmpId ? p : { ...p, assignments: { ...p.assignments, [studentId]: { ...(p.assignments[studentId] || { teacherId: '', examKeys: [] }), ...patch } } }) }));
    const launch = (pfmp, studentId, key) => { S.selectedPfmp = pfmp.id; S.selectedActivity = ''; S.selected = studentId; go('exam', key); };
    const h = S.pdfHeader;
    const setHeader = (patch, redraw) => mutate(x => ({ ...x, pdfHeader: { ...x.pdfHeader, ...patch } }), redraw);
    return el('div', { class: 'su-page' }, heading('PAGE 07', 'Suivi des PFMP', admin ? 'Créez une période, attribuez un enseignant référent et choisissez les épreuves de chaque élève.' : 'Retrouvez uniquement les élèves qui vous sont confiés et ouvrez leur grille d’évaluation.'),
      admin ? el('details', { class: 'su-card su-letterhead' }, el('summary', { text: 'En-tête de l’attestation PDF — reprise automatiquement sur chaque attestation générée' }),
        el('div', { class: 'su-letterhead-grid' },
          el('div', { class: 'su-logo' }, el('span', { text: 'Logo de l’établissement' }), h.logoDataUrl ? el('img', { src: h.logoDataUrl, alt: 'Logo de l’établissement' }) : el('b', { text: 'Ajouter un logo' }),
            el('div', { class: 'su-actions' }, el('button', { type: 'button', text: h.logoDataUrl ? 'Remplacer' : 'Choisir une image', onclick: () => pickFile('image/png,image/jpeg,image/webp', file => optimizeLogo(file).then(url => setHeader({ logoDataUrl: url }, true)).catch(error => alert(error.message))) }),
              h.logoDataUrl ? el('button', { type: 'button', class: 'danger', text: 'Retirer', onclick: () => setHeader({ logoDataUrl: '' }, true) }) : null)),
          el('div', { class: 'su-fields' }, field('Nom du lycée', el('input', { value: h.schoolName, placeholder: 'Ex. Lycée Professionnel…', oninput: e => setHeader({ schoolName: e.target.value }, false) })),
            field('Adresse complète', el('textarea', { rows: 2, value: h.address, placeholder: 'Numéro, voie, code postal et ville', oninput: e => setHeader({ address: e.target.value }, false) }), 'su-wide'),
            field('Contact téléphonique', el('input', { type: 'tel', value: h.phone, placeholder: 'Ex. 02 00 00 00 00', oninput: e => setHeader({ phone: e.target.value }, false) })),
            field('E-mail DDFPT', el('input', { type: 'email', value: h.ddfptEmail, placeholder: 'ddfpt@etablissement.fr', oninput: e => setHeader({ ddfptEmail: e.target.value }, false) })))),
        el('p', { class: 'su-muted', text: 'Enregistrement automatique. Le logo est redimensionné sans déformation pour rester net dans le PDF.' })) : null,
      admin ? el('section', { class: 'su-card' }, el('h4', { text: editingPfmp ? 'Modifier la période PFMP' : 'Nouvelle période PFMP' }), el('p', { class: 'su-muted', text: 'Les élèves sont ajoutés automatiquement depuis la classe choisie.' }),
        el('div', { class: 'su-fields' }, field('Nom de la PFMP', el('input', { value: f.name, placeholder: 'Ex. PFMP 1', oninput: e => { f.name = e.target.value; } })),
          field('Date de début', el('input', { type: 'date', value: f.startDate, oninput: e => { f.startDate = e.target.value; } })), field('Date de fin', el('input', { type: 'date', value: f.endDate, oninput: e => { f.endDate = e.target.value; } })),
          field('Classe concernée', classSelect(f.className, v => { f.className = v; }))),
        el('div', { class: 'su-actions' }, editingPfmp ? el('button', { type: 'button', text: 'Annuler', onclick: () => { editingPfmp = ''; pfmpDraft = { name: '', startDate: '', endDate: '', className: '' }; render(); } }) : null,
          el('button', { type: 'button', class: 'su-primary', text: editingPfmp ? 'Enregistrer les modifications' : '✓ Créer la PFMP', onclick: savePfmp }))) : null,
      S.pfmps.length ? S.pfmps.map(pfmp => {
        const students = S.students.filter(s => pfmp.assignments[s.id]).sort(byName), teachers = S.teachers.filter(t => !t.className || t.className === pfmp.className);
        return el('article', { class: 'su-card su-pfmp' }, el('header', {}, el('div', {}, el('h4', { text: pfmp.name }), el('span', { text: `${dateFr(pfmp.startDate)} → ${dateFr(pfmp.endDate)}` }), el('p', { text: `${pfmp.className} · ${plural(students.length, 'élève')}` })),
            admin ? el('div', {}, el('button', { type: 'button', class: 'su-icon', text: '✎', 'aria-label': 'Modifier ' + pfmp.name, onclick: () => { editingPfmp = pfmp.id; pfmpDraft = { name: pfmp.name, startDate: pfmp.startDate, endDate: pfmp.endDate, className: pfmp.className }; render(); root.scrollIntoView(); } }),
              el('button', { type: 'button', class: 'su-icon danger', text: '🗑', 'aria-label': 'Supprimer ' + pfmp.name, onclick: () => { if (!confirm(`Supprimer définitivement la PFMP « ${pfmp.name} » et toutes ses évaluations ?`)) return;
                rpc('suivi_purge', { p_kind: 'pfmp', p_id: pfmp.id }).catch(error => say(error.message, true));
                mutate(x => ({ ...x, pfmps: x.pfmps.filter(p => p.id !== pfmp.id), selectedPfmp: x.selectedPfmp === pfmp.id ? '' : x.selectedPfmp, attestations: x.attestations.filter(a => a.pfmpId !== pfmp.id),
                  evaluations: Object.fromEntries(Object.entries(x.evaluations).map(([sid, v]) => [sid, Object.fromEntries(Object.entries(v).filter(([k]) => !k.startsWith(`pfmp:${pfmp.id}:`)))])) })); } })) : null),
          el('details', { class: 'su-pfmp-students', open: !admin || S.selectedPfmp === pfmp.id || null }, el('summary', { text: `Afficher les élèves (${students.length})` }),
            table(['Élève', 'Enseignant référent', 'Épreuves à évaluer', 'Évaluation et notes'], students.map(st => {
              const a = pfmp.assignments[st.id] || { teacherId: '', examKeys: [] }, selected = K.exams.filter(e => a.examKeys.includes(e.key));
              const scores = selected.map(e => K.completion(S, st.id, e, pfmp.id, 'pfmp') ? K.score(S, st.id, e, pfmp.id, 'pfmp') : null), valid = scores.filter(v => v != null);
              const average = valid.length ? valid.reduce((t, v) => t + v, 0) / valid.length : null;
              const teacher = S.teachers.find(t => t.id === a.teacherId);
              return [el('span', {}, el('b', { text: st.lastName + ' ' }), st.firstName),
                admin ? el('select', { onchange: e => updateAssignment(pfmp.id, st.id, { teacherId: e.target.value }) }, option('', 'Choisir un enseignant'), teachers.map(t => option(t.id, `${t.lastName} ${t.firstName}`, t.id === a.teacherId)))
                  : el('b', { text: teacher ? `${teacher.lastName} ${teacher.firstName}` : 'Enseignant' }),
                admin ? el('details', { class: 'su-multi' }, el('summary', { text: selected.length ? selected.map(e => e.label).join(' · ') : 'Choisir les épreuves' }),
                    el('div', {}, K.exams.map(e => el('label', { class: 'su-check' }, el('input', { type: 'checkbox', checked: a.examKeys.includes(e.key) || null,
                      onchange: ev => updateAssignment(pfmp.id, st.id, { examKeys: ev.target.checked ? [...a.examKeys, e.key] : a.examKeys.filter(k => k !== e.key) }) }), el('span', { text: `${e.label} · ${e.title}` })))))
                  : el('span', { text: selected.length ? selected.map(e => e.label).join(' · ') : 'Aucune épreuve attribuée' }),
                el('div', { class: 'su-pfmp-actions' }, selected.map((e, i) => el('button', { type: 'button', onclick: () => launch(pfmp, st.id, e.key) }, el('b', { text: e.label + ' ' }), scores[i] == null ? 'Évaluer' : scores[i].toFixed(2) + '/20')),
                  average != null ? el('strong', { text: `PFMP : ${average.toFixed(2)}/20` }) : null)];
            }))));
      }) : el('p', { class: 'su-empty', text: admin ? 'Aucune période PFMP créée.' : 'Aucun élève ne vous est encore confié sur une PFMP.' }));
  }

  // ───────── 08 Attestations de stage ─────────
  let attClass = '', attPfmp = '', attStudent = '', signMessage = '';
  function attestationsPage() {
    const admin = role === 'admin';
    const pairs = S.pfmps.flatMap(pfmp => Object.keys(pfmp.assignments).map(id => S.students.find(s => s.id === id)).filter(Boolean).map(student => ({ pfmp, student })));
    const selected = pairs.find(p => p.pfmp.id === S.selectedPfmp && p.student.id === S.selected);
    if (!selected || page !== 'attestations' || !S.selectedPfmp || !S.selected || S.selectedActivity) return attestationList(pairs, admin);
    return attestationForm(selected, admin);
  }
  const teacherEmailOf = pair => S.teachers.find(t => t.id === pair.pfmp.assignments[pair.student.id]?.teacherId)?.email || '';
  function toggleLock(pair) {
    const email = teacherEmailOf(pair);
    if (!email) { alert('Associez d’abord un enseignant disposant d’une adresse e-mail.'); return; }
    const item = K.getOrCreateAttestation(S, pair.pfmp, pair.student, email), ready = K.attestationIsReady(S, pair.pfmp, pair.student.id);
    const unlocking = item.adminLocked || (!ready && !item.manualUnlocked);
    if (unlocking && item.signedAt && !confirm('Déverrouiller cette attestation annulera sa signature actuelle. Continuer ?')) return;
    saveAttestation({ ...item, adminLocked: !unlocking, manualUnlocked: unlocking, signedAt: unlocking ? '' : item.signedAt, signedBy: unlocking ? '' : item.signedBy, signatureHash: unlocking ? '' : item.signatureHash, updatedAt: new Date().toISOString() }, true);
  }
  function attestationList(pairs, admin) {
    const classes = [...new Set(pairs.map(p => p.student.className))].filter(Boolean).sort((a, b) => a.localeCompare(b, 'fr'));
    const studentsFor = [...new Map(pairs.filter(p => p.student.className === attClass && p.pfmp.id === attPfmp).map(p => [p.student.id, p.student])).values()].sort(byName);
    const visible = attClass && attPfmp && (admin || attStudent) ? pairs.filter(p => p.student.className === attClass && p.pfmp.id === attPfmp && (!attStudent || p.student.id === attStudent)) : [];
    const card = pair => {
      const item = S.attestations.find(a => a.pfmpId === pair.pfmp.id && a.studentId === pair.student.id), ready = K.attestationIsReady(S, pair.pfmp, pair.student.id);
      const signed = Boolean(item?.signedAt), locked = Boolean(item?.adminLocked || (!ready && !item?.manualUnlocked));
      return el('article', { class: 'su-card su-att-card' }, el('span', { class: 'su-status ' + (signed ? 'signed' : 'pending'), text: signed ? 'Signée et complétée' : ready || item?.manualUnlocked ? 'À compléter' : 'Évaluations incomplètes' }),
        el('h4', { text: `${pair.student.lastName} ${pair.student.firstName}` }), el('p', { text: `${pair.student.className} · ${pair.pfmp.name}` }),
        el('div', { class: 'su-actions' }, el('button', { type: 'button', text: 'Ouvrir', onclick: () => { S.selectedPfmp = pair.pfmp.id; S.selectedActivity = ''; S.selected = pair.student.id; signMessage = ''; render(); } }),
          admin ? el('button', { type: 'button', text: locked ? '🔓 Déverrouiller' : '🔒 Verrouiller', onclick: () => toggleLock(pair) }) : null,
          item?.signedAt ? el('button', { type: 'button', class: 'su-primary', text: '⤓ PDF', onclick: () => exportAttestationPdf(item, pair.student, pair.pfmp).catch(error => alert(error.message)) }) : null,
          item?.signedAt && admin ? el('button', { type: 'button', class: 'su-primary', text: '⎙ Imprimer', onclick: () => exportAttestationPdf(item, pair.student, pair.pfmp, 'print').catch(error => alert(error.message)) }) : null));
    };
    return el('div', { class: 'su-page' }, heading('PAGE 08', 'Attestations de stage', admin ? 'Suivez les attestations, leur complétude et leur signature électronique.' : 'Une attestation devient accessible après l’évaluation complète de toutes les épreuves affectées à l’élève.'),
      pairs.length ? el('section', { class: 'su-card su-fields' },
        field('1. Classe', el('select', { onchange: e => { attClass = e.target.value; attPfmp = ''; attStudent = ''; render(); } }, option('', 'Choisir une classe'), classes.map(c => option(c, c, c === attClass)))),
        field('2. Période PFMP', el('select', { disabled: !attClass || null, onchange: e => { attPfmp = e.target.value; attStudent = ''; render(); } }, option('', 'Choisir une PFMP'), S.pfmps.filter(p => p.className === attClass).map(p => option(p.id, `${p.name} · ${dateFr(p.startDate)} au ${dateFr(p.endDate)}`, p.id === attPfmp)))),
        field('3. Élève', el('select', { disabled: !attPfmp || null, onchange: e => { attStudent = e.target.value; render(); } }, option('', admin ? 'Tous les élèves de cette PFMP' : 'Choisir un élève'), studentsFor.map(s => option(s.id, `${s.lastName} ${s.firstName}`, s.id === attStudent)))),
        el('small', { text: plural(visible.length, 'attestation') + ' affichée(s)' })) : null,
      visible.length ? el('section', { class: 'su-att-list' }, visible.map(card))
        : el('p', { class: 'su-empty', text: pairs.length ? attClass && attPfmp ? (!admin && !attStudent ? 'Choisissez un élève pour afficher son attestation.' : 'Aucune attestation ne correspond à cette sélection.') : 'Choisissez d’abord une classe puis une période PFMP.' : 'Aucune attestation liée à une PFMP.' }));
  }
  function attestationForm(pair, admin) {
    const stored = K.getOrCreateAttestation(S, pair.pfmp, pair.student, teacherEmailOf(pair) || me);
    const current = admin && !stored.fields.signedAtDate ? { ...stored, fields: { ...stored.fields, signedAtDate: new Date().toISOString().slice(0, 10) } } : stored;
    const ready = K.attestationIsReady(S, pair.pfmp, pair.student.id);
    const adminEditable = admin && !current.adminLocked && !current.signedAt;
    const editable = adminEditable || (!admin && (ready || current.manualUnlocked) && !current.adminLocked && !current.signedAt);
    const f = current.fields;
    const update = (name, value) => { if (!editable) return; current.fields = { ...current.fields, [name]: value }; saveAttestation({ ...current, updatedAt: new Date().toISOString() }); };
    const input = (name, opts = {}, editableHere = editable) => el(opts.tag || 'input', { type: opts.type, min: opts.min, step: opts.step, value: f[name] || '', disabled: !editableHere || null, placeholder: opts.placeholder, oninput: e => update(name, e.target.value) });
    const status = current.signedAt ? 'Signée et transmise' : current.adminLocked ? 'Verrouillée par l’administrateur' : admin ? 'Modifiable et validable par l’administrateur'
      : !ready ? (current.manualUnlocked ? 'Déverrouillée par l’administrateur' : `Verrouillée - ${K.exams.filter(e => pair.pfmp.assignments[pair.student.id]?.examKeys.includes(e.key)).map(e => e.label).join(', ') || 'aucune épreuve affectée'} à terminer`) : 'Prête à compléter';
    const h = S.pdfHeader, code = el('input', { inputmode: 'numeric', maxlength: 6, placeholder: '000000', 'aria-label': 'Code Microsoft Authenticator', oninput: e => { e.target.value = e.target.value.replace(/\D/g, ''); signButton.disabled = e.target.value.length !== 6; } });
    const message = el('p', { class: 'su-att-message', role: 'status', text: signMessage, hidden: !signMessage || null });
    const show = text => { signMessage = text; message.textContent = text; message.hidden = !text; message.scrollIntoView({ block: 'nearest' }); };
    const signButton = el('button', { type: 'button', class: 'su-primary', disabled: true, text: admin ? '🛡 Valider et signer' : '🛡 Signer et transmettre', onclick: async () => {
      const labels = { hostStructure: 'structure d’accueil', companyName: 'nom de l’entreprise', companyAddress: 'adresse de l’entreprise', companyPhone: 'téléphone de l’entreprise', totalWeeks: 'nombre total de semaines', absenceDays: 'nombre de jours d’absence', signedAtCity: 'ville (Fait à)', signedAtDate: 'date de signature', signerName: 'nom et prénom du signataire' };
      const missing = Object.keys(labels).filter(k => !String(current.fields[k] || '').trim()).map(k => labels[k]);
      if (missing.length) { show(`Signature impossible. Complétez les champs suivants : ${missing.join(', ')}.`); return; }
      signButton.disabled = true; show('Vérification du code Authenticator…');
      try {
        await flushAll();
        const factor = (await api.mfaFactors()).find(item => item.status === 'verified');
        if (!factor) throw new Error('Aucun authentificateur actif n’est associé à ce compte.');
        try { await api.mfaVerify(factor.id, code.value); } catch { throw new Error('La signature a été refusée : code Authenticator incorrect.'); }
        putAttestation(await rpc('suivi_sign_attestation', { p: { ...current, fields: current.fields } }));
        signMessage = admin ? 'Attestation validée, signée et verrouillée.' : 'Attestation signée, verrouillée et transmise à l’administrateur.';
        version = ''; render();
      } catch (error) { show('La signature n’a pas pu aboutir : ' + error.message); signButton.disabled = false; }
    } });
    return el('div', { class: 'su-page' }, heading('ATTESTATION', 'Attestation de stage', `${pair.student.lastName} ${pair.student.firstName} · ${pair.student.className}`,
        el('button', { type: 'button', text: '← Toutes les attestations', onclick: () => { S.selected = ''; S.selectedPfmp = ''; signMessage = ''; render(); } })),
      el('section', { class: 'su-card su-att-form' + (editable ? ' editable' : ' locked') },
        el('header', {}, el('div', {}, el('b', { text: pair.pfmp.name }), el('span', { text: ` Du ${dateFr(pair.pfmp.startDate)} au ${dateFr(pair.pfmp.endDate)}` })), el('span', { class: 'su-status ' + (current.signedAt ? 'signed' : 'pending'), text: status })),
        el('div', { class: 'su-att-head' }, el('p', { text: [h.schoolName, h.address].filter(Boolean).join(' · ') || 'En-tête de l’établissement à compléter dans PFMP' }), el('p', { text: [h.phone, h.ddfptEmail].filter(Boolean).join(' · ') }), el('h4', { text: 'Attestation de formation en milieu professionnel' })),
        el('fieldset', {}, el('legend', { text: 'La structure d’accueil' }),
          field('La structure d’accueil *', input('hostStructure', {}, adminEditable), 'su-wide'), field('Raison sociale *', input('companyName', {}, adminEditable)), field('Téléphone *', input('companyPhone', { type: 'tel' }, adminEditable)),
          field('Adresse / Code postal / Ville *', input('companyAddress', {}, adminEditable), 'su-wide')),
        el('fieldset', { disabled: true }, el('legend', { text: 'Certifie que le stagiaire' }),
          field('Nom et prénom', el('input', { value: `${pair.student.lastName} ${pair.student.firstName}`, readonly: true })),
          field('Date de naissance (JJ/MM/AAAA)', el('input', { value: K.formatBirthDate(pair.student.birthDate), placeholder: 'Non renseignée dans la fiche élève', readonly: true })),
          field('Scolarisé en classe de', el('input', { value: pair.student.className, readonly: true }), 'su-wide')),
        el('fieldset', {}, el('legend', { text: 'Période de formation en milieu professionnel' }),
          field('Du', el('input', { value: dateFr(pair.pfmp.startDate), disabled: true })), field('Au', el('input', { value: dateFr(pair.pfmp.endDate), disabled: true })), field('PFMP', el('input', { value: pair.pfmp.name, disabled: true })),
          field('Nombre total de semaines *', input('totalWeeks', { type: 'number', min: 0, step: 0.5 }, adminEditable)), field('Nombre de jours d’absence *', input('absenceDays', { type: 'number', min: 0 })),
          field('Précisions sur les absences', input('absenceDetails', { tag: 'textarea', placeholder: 'À compléter uniquement en cas d’absence' }), 'su-wide'),
          field('Fait à *', input('signedAtCity')), field('Le *', el('input', { type: 'date', value: f.signedAtDate || '', disabled: true })), field('Par (nom et prénom) *', input('signerName'), 'su-wide')),
        editable ? el('section', { class: 'su-sign' }, el('div', {}, el('h4', { text: 'Signature électronique obligatoire' }),
            el('p', { text: admin ? 'Saisissez le code actuel de Microsoft Authenticator pour valider et signer définitivement le document.' : 'Saisissez le code actuel de Microsoft Authenticator pour signer définitivement et transmettre le document.' })), code, signButton) : null,
        message,
        current.signedAt ? el('footer', { class: 'su-actions' }, el('span', {}, '✓ Signée par ', el('b', { text: current.signedBy }), ` · ${new Date(current.signedAt).toLocaleString('fr-FR')}`),
          el('button', { type: 'button', class: 'su-primary', text: '⤓ Télécharger le PDF', onclick: () => exportAttestationPdf(current, pair.student, pair.pfmp).catch(error => alert(error.message)) }),
          admin ? el('button', { type: 'button', class: 'su-primary', text: '⎙ Imprimer l’attestation', onclick: () => exportAttestationPdf(current, pair.student, pair.pfmp, 'print').catch(error => alert(error.message)) }) : null) : null));
  }

  // ───────── 09 Résultats ─────────
  let resultsClass = '';
  function resultsPage() {
    const students = resultsClass ? S.students.filter(s => s.className === resultsClass).sort(byName) : [], activities = resultsClass ? S.activities.filter(a => a.className === resultsClass) : [];
    const rowOf = st => { const values = activities.map(a => K.activityScore(S, st.id, a)), ok = values.filter(v => v != null);
      return { values, average: ok.length ? ok.reduce((t, v) => t + v, 0) / ok.length : null, count: ok.length, total: activities.filter(a => a.studentIds.includes(st.id)).length }; };
    const exportClass = async () => {
      const X = await xlsx();
      const data = students.map(st => { const r = rowOf(st); return { Nom: st.lastName, 'Prénom': st.firstName, Classe: st.className, INE: st.ine,
        ...Object.fromEntries(activities.map((a, i) => [`${a.title} /20`, r.values[i] == null ? 'Non évalué' : r.values[i].toFixed(2)])),
        'Moyenne des activités /20': r.average == null ? 'Non évalué' : r.average.toFixed(2), 'Nombre d’activités évaluées': r.count }; });
      const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, X.utils.json_to_sheet(data), 'Résultats activités'); X.writeFile(wb, `resultats-activites-${resultsClass}.xlsx`);
    };
    return el('div', { class: 'su-page' }, heading('PAGE 09', 'Résultats des activités', 'Choisissez une classe pour afficher et exporter les résultats obtenus lors des activités en atelier.',
        el('button', { type: 'button', class: 'su-primary', disabled: !resultsClass || null, text: '⤓ Exporter en Excel', onclick: () => exportClass().catch(error => alert(error.message)) })),
      el('section', { class: 'su-filter' }, field('Afficher les résultats de la classe', classSelect(resultsClass, v => { resultsClass = v; render(); })), resultsClass ? el('small', { text: plural(activities.length, 'activité') }) : null),
      resultsClass ? table(['Élève', ...activities.map(a => a.title), 'Moyenne des activités', 'Activités évaluées'], students.map(st => { const r = rowOf(st);
        return [`${st.lastName} ${st.firstName}`, ...r.values.map((v, i) => v == null ? '—' : el('button', { type: 'button', class: 'su-link', text: v.toFixed(2), onclick: () => { S.selectedActivity = activities[i].id; S.selectedPfmp = ''; S.selected = st.id; go('evaluations'); } })),
          r.average == null ? '—' : r.average.toFixed(2), `${r.count} / ${r.total}`]; })) : null);
  }

  // ───────── Accès des enseignants ─────────
  let accessCache = null, storeMembers = null;
  // Collègues déjà enregistrés ailleurs sur le site (accès SUIVI, équipe du Magasin) : ajout en un clic, sans doublon.
  function personFromEmail(email, name) {
    if (name) { const parts = name.trim().split(/\s+/), upper = parts.findIndex(p => p.length > 1 && p === p.toLocaleUpperCase('fr'));
      if (upper > 0) return { firstName: parts.slice(0, upper).join(' '), lastName: parts.slice(upper).join(' ') };
      return K.splitRosterName(name); }
    const [first = '', ...rest] = email.split('@')[0].split('.'), cap = w => w.replace(/(^|[-\s])\p{L}/gu, m => m.toLocaleUpperCase('fr'));
    return { firstName: cap(first), lastName: rest.join(' ').toLocaleUpperCase('fr') || first.toLocaleUpperCase('fr') };
  }
  function knownColleagues() {
    if (role !== 'admin') return null;
    if (!accessCache) refreshAccess().then(render).catch(() => {});
    if (storeMembers === null) { storeMembers = []; rpc('store_admin_members').then(m => { storeMembers = m || []; render(); }).catch(() => {}); }
    const have = new Set(S.teachers.map(t => K.norm(t.email)).filter(Boolean)), seen = new Set();
    const list = [...(accessCache || []).map(m => ({ email: m.email, name: m.name })), ...storeMembers.map(m => ({ email: m.email, name: '' }))]
      .filter(m => m.email && !have.has(K.norm(m.email)) && !seen.has(K.norm(m.email)) && seen.add(K.norm(m.email)));
    if (!list.length) return null;
    return el('section', { class: 'su-card' }, el('h4', { text: 'Collègues déjà enregistrés sur le site' }),
      el('p', { class: 'su-help', text: 'Accès SUIVI&PFMP et équipe du Magasin. Un clic les ajoute à la liste des professeurs.' }),
      el('div', { class: 'su-actions' }, list.map(m => el('button', { type: 'button', text: '+ ' + (m.name || m.email), title: m.email, onclick: () =>
        mutate(x => ({ ...x, teachers: K.mergeUnique(x.teachers, [{ id: K.uid(), ...personFromEmail(m.email, m.name), email: m.email.toLowerCase(), phone: '', subject: '', className: '' }], K.teacherKey) })) }))));
  }
  async function refreshAccess() { if (role === 'admin') accessCache = await rpc('suivi_members_list'); }
  function accessPage() {
    if (!accessCache) { refreshAccess().then(render).catch(error => say(error.message, true)); return el('p', { class: 'su-empty', text: 'Chargement des accès…' }); }
    const email = el('input', { type: 'email', placeholder: 'collegue@ac-normandie.fr' }), name = el('input', { placeholder: 'Nom et prénom (facultatif)' });
    const act = async (p_email, p_active, p_name = '') => { try { await rpc('suivi_member_set', { p_email, p_name, p_active }); await refreshAccess(); render(); } catch (error) { say(error.message, true); } };
    const known = S.teachers.filter(t => t.email && !accessCache.some(m => m.email === t.email.toLowerCase()));
    return el('div', { class: 'su-page' }, heading('ACCÈS', 'Accès des enseignants', 'Les enseignants de L’Atelier MELEC sont responsables du suivi. Autorisez ici les collègues qui évaluent leurs élèves en PFMP : ils créent leur compte depuis l’espace enseignant (« Collègue sans compte enseignant »), activent Authenticator, puis ne voient que les élèves qui leur sont confiés.'),
      el('section', { class: 'su-card su-fields' }, field('Adresse e-mail', email), field('Nom', name),
        el('button', { type: 'button', class: 'su-primary', text: 'Autoriser l’accès', onclick: () => email.value.trim() && act(email.value.trim(), true, name.value.trim()) })),
      known.length ? el('section', { class: 'su-card' }, el('h4', { text: 'Professeurs du suivi sans accès' }), el('div', { class: 'su-actions' }, known.map(t => el('button', { type: 'button', text: `+ ${t.lastName} ${t.firstName}`, onclick: () => act(t.email, true, `${t.firstName} ${t.lastName}`) })))) : null,
      table(['E-mail', 'Nom', 'Compte', 'Authenticator', 'Accès', ''], accessCache.map(m => [m.email, m.name || '', m.teacher ? 'Compte enseignant' : m.account ? (m.confirmed ? 'Créé' : 'E-mail à confirmer') : 'À créer',
        m.authenticator ? 'Actif' : '—', m.active ? el('button', { type: 'button', class: 'su-small', text: 'Suspendre l’accès', onclick: () => act(m.email, false) }) : el('button', { type: 'button', class: 'su-small', text: 'Autoriser l’accès', onclick: () => act(m.email, true) }),
        el('button', { type: 'button', class: 'su-icon danger', text: '🗑', 'aria-label': 'Retirer', onclick: () => confirm(`Retirer l’accès de ${m.email} ?`) && act(m.email, null) })])));
  }

  // ───────── PDF ─────────
  function addLines(doc, text, y, size = 11, weight = 'normal') {
    doc.setFont('helvetica', weight); doc.setFontSize(size);
    const lines = doc.splitTextToSize(text || '—', 174);
    if (y + lines.length * 6 > 282) { doc.addPage(); y = 20; }
    doc.text(lines, 18, y); return y + lines.length * 6;
  }
  async function exportActivityPdf(a, printDocument) {
    const Pdf = await jsPDF(), doc = new Pdf(), period = S.periods.find(p => p.id === a.periodId);
    let y = addLines(doc, 'Activité en atelier', 20, 18, 'bold');
    y = addLines(doc, a.title, y + 3, 15, 'bold'); y = addLines(doc, `Classe : ${a.className || 'Non renseignée'}`, y + 4);
    y = addLines(doc, `Date : ${a.date || 'Non renseignée'}`, y); y = addLines(doc, `Période : ${period?.name || 'Sans période'}`, y);
    y = addLines(doc, `Épreuves : ${a.examKeys.map(examLabel).filter(Boolean).join(', ') || 'Aucune'}`, y);
    y = addLines(doc, 'Description', y + 5, 12, 'bold'); y = addLines(doc, a.description || 'Aucune description.', y);
    y = addLines(doc, 'Élèves sélectionnés', y + 5, 12, 'bold');
    a.studentIds.forEach((id, i) => { const st = S.students.find(s => s.id === id); if (st) y = addLines(doc, `${i + 1}. ${st.lastName} ${st.firstName}`, y); });
    if (printDocument) { doc.autoPrint(); open(doc.output('bloburl'), '_blank'); } else doc.save(`activite-${K.pdfName(a.title) || 'atelier'}.pdf`);
  }
  async function exportExamPdf(exam, st, activity, ev, total) {
    const Pdf = await jsPDF(), doc = new Pdf();
    let y = addLines(doc, `${exam.label} — ${exam.title}`, 20, 18, 'bold');
    y = addLines(doc, `${st.lastName} ${st.firstName} · ${st.className}`, y + 3, 12, 'bold');
    if (activity) y = addLines(doc, `Activité : ${activity.title}`, y);
    y = addLines(doc, `Note automatique pondérée : ${total.toFixed(2)} /20`, y + 3, 13, 'bold');
    exam.competencies.forEach(c => { const r = K.competencyResult(ev, c);
      y = addLines(doc, `${c.code} — ${c.title} (${r.evaluated ? (r.factor * 20).toFixed(2) + '/20' : r.excluded ? 'Non évalué' : 'À évaluer'})`, y + 5, 12, 'bold');
      c.tasks.forEach((t, i) => { y = addLines(doc, `${ev.tasks[`${c.code}-task-${i}`] || '—'} · ${t}`, y, 9); });
      c.criteria.forEach((t, i) => { y = addLines(doc, `${ev.criteria[`${c.code}-${i}`] || '—'} · ${t}`, y, 9); }); });
    if (ev.appreciation) { y = addLines(doc, 'Appréciation', y + 5, 12, 'bold'); addLines(doc, ev.appreciation, y, 10); }
    doc.save(`${exam.key}-${K.pdfName(st.lastName + '-' + st.firstName)}.pdf`);
  }
  async function exportAttestationPdf(att, student, pfmp, action = 'download') {
    const Pdf = await jsPDF(), doc = new Pdf({ unit: 'mm', format: 'a4' }), f = att.fields, school = S.pdfHeader;
    const write = (value, x, y, width, size = 8.2, bold = false) => { if (!String(value || '').trim()) return; doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size); doc.setTextColor(0, 0, 0); doc.text(doc.splitTextToSize(String(value), width), x, y, { maxWidth: width }); };
    const row = (label, value, y, valueX = 63) => { doc.setFont('helvetica', 'bold'); doc.setFontSize(8.7); doc.setTextColor(15, 37, 55); doc.text(label, 16, y); doc.setDrawColor(112, 130, 143); doc.setLineWidth(0.25); doc.line(valueX, y + 1.2, 194, y + 1.2); write(value, valueX + 1.5, y, 128, 8.4); };
    const section = (title, y, height) => { doc.setDrawColor(31, 75, 103); doc.setLineWidth(0.45); doc.roundedRect(12, y, 186, height, 1.5, 1.5, 'S'); doc.setFillColor(11, 47, 77); doc.rect(12, y, 186, 8, 'F'); doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(9.2); doc.text(title, 16, y + 5.5); };
    doc.setFillColor(255, 255, 255); doc.rect(0, 0, 210, 297, 'F'); doc.setDrawColor(31, 75, 103); doc.setLineWidth(0.4); doc.rect(8, 8, 194, 281, 'S');
    doc.setFillColor(246, 250, 252); doc.roundedRect(12, 12, 186, 43, 2, 2, 'F'); doc.setDrawColor(148, 170, 184); doc.roundedRect(16, 17, 57, 31, 1.5, 1.5, 'S');
    if (school.logoDataUrl) {
      try { const image = doc.getImageProperties(school.logoDataUrl), ratio = Math.min(53 / image.width, 27 / image.height), w = image.width * ratio, hgt = image.height * ratio;
        doc.addImage(school.logoDataUrl, school.logoDataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG', 18 + (53 - w) / 2, 19 + (27 - hgt) / 2, w, hgt); }
      catch { write('LOGO', 36, 34, 20, 10, true); }
    } else { doc.setTextColor(104, 124, 138); doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.text('LOGO', 44.5, 31, { align: 'center' }); doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.text('Établissement', 44.5, 36, { align: 'center' }); }
    doc.setTextColor(11, 47, 77); doc.setFont('helvetica', 'bold'); doc.setFontSize(12.5); doc.text(doc.splitTextToSize(school.schoolName || 'NOM DE L’ÉTABLISSEMENT', 113), 79, 21.5);
    doc.setTextColor(32, 48, 60); write(school.address || 'Adresse de l’établissement', 79, 31.5, 113, 8.2); write(school.phone ? `Tél. ${school.phone}` : 'Téléphone', 79, 40.2, 52, 7.8);
    write(school.ddfptEmail ? `E-mail DDFPT : ${school.ddfptEmail}` : 'E-mail DDFPT', 79, 46.2, 113, 7.8);
    doc.setFillColor(255, 239, 0); doc.rect(12, 60, 186, 11, 'F'); doc.setTextColor(0, 0, 0); doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.text('ATTESTATION DE FORMATION EN MILIEU PROFESSIONNEL', 105, 67.5, { align: 'center' });
    section('LA STRUCTURE D’ACCUEIL', 77, 38); row('Structure / service :', f.hostStructure, 90, 52); row('Raison sociale :', f.companyName, 98, 47); row('Adresse / CP / Ville :', f.companyAddress, 106, 52); row('Téléphone :', f.companyPhone, 112, 39);
    section('CERTIFIE QUE LE STAGIAIRE', 121, 34); row('Nom et prénom :', `${student.lastName} ${student.firstName}`.trim(), 134, 47); row('Date de naissance :', K.formatBirthDate(student.birthDate), 142, 51); row('Scolarisé(e) en classe de :', student.className, 150, 61);
    doc.setFillColor(255, 239, 0); doc.rect(12, 161, 186, 9, 'F'); doc.setTextColor(0, 0, 0); doc.setFont('helvetica', 'bold'); doc.setFontSize(11.2); doc.text('a effectué une Période de Formation en Milieu Professionnel', 105, 167.2, { align: 'center' });
    doc.setDrawColor(31, 75, 103); doc.roundedRect(12, 176, 186, 22, 1.5, 1.5, 'S'); doc.setTextColor(214, 32, 32); doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.text('Du', 16, 184); doc.text('au', 77, 184);
    write(dateFr(pfmp.startDate), 29, 184, 43, 9.2, true); write(dateFr(pfmp.endDate), 88, 184, 43, 9.2, true); write(`(${pfmp.name || 'PFMP'})`, 145, 184, 46, 9.2, true);
    doc.setTextColor(15, 37, 55); doc.setFont('helvetica', 'bold'); doc.setFontSize(9.2); doc.text('Soit un total de', 16, 193); write(f.totalWeeks || '', 48, 193, 14, 9.2, true); doc.text('semaine(s)', 64, 193);
    doc.setTextColor(15, 37, 55); doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.text('ABSENCES', 12, 205); doc.setFont('helvetica', 'normal'); doc.text(`Nombre de jours : ${f.absenceDays || '0'}`, 38, 205);
    doc.setDrawColor(148, 170, 184); doc.roundedRect(12, 209, 186, 23, 1.5, 1.5, 'S'); write(f.absenceDetails || 'Aucune précision', 16, 215, 178, 7.8);
    row('Fait à :', f.signedAtCity, 240, 33); row('Le :', dateFr(f.signedAtDate), 248, 28); row('Par (nom et prénom) :', f.signerName || att.signedBy, 256, 58);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(15, 37, 55); doc.text('Date et signature', 16, 265); doc.text('Cachet de la structure', 142, 265);
    if (att.signedAt) {
      const signer = f.signerName || att.signedBy, signedDate = new Date(att.signedAt).toLocaleString('fr-FR'), fingerprint = (att.signatureHash || '').toUpperCase().match(/.{1,8}/g)?.slice(0, 4).join(' ') || 'NON DISPONIBLE';
      doc.setFillColor(247, 252, 255); doc.setDrawColor(18, 109, 157); doc.setLineWidth(0.45); doc.roundedRect(16, 268, 105, 16, 1.5, 1.5, 'FD');
      doc.setTextColor(10, 75, 111); doc.setFont('helvetica', 'bold'); doc.setFontSize(6.7); doc.text('SIGNATURE ÉLECTRONIQUE VALIDÉE', 20, 272);
      doc.setTextColor(0, 0, 0); doc.setFont('times', 'bolditalic'); doc.setFontSize(9.5); doc.text(signer, 20, 276.3, { maxWidth: 96 });
      doc.setFont('helvetica', 'normal'); doc.setFontSize(5.5); doc.text(`Validée le ${signedDate}`, 20, 280, { maxWidth: 55 });
      doc.setTextColor(55, 70, 80); doc.setFontSize(4.8); doc.text(`Empreinte : ${fingerprint}`, 74, 280, { maxWidth: 43 });
    }
    doc.setProperties({ title: `Attestation de formation en milieu professionnel - ${student.lastName} ${student.firstName}`, subject: `PFMP ${pfmp.name} - Empreinte de signature ${att.signatureHash || 'non signée'}`, author: school.schoolName || 'MELEC' });
    const name = `attestation-stage-${K.pdfName(student.lastName + '-' + student.firstName)}.pdf`;
    if (action === 'print') { doc.autoPrint(); const url = doc.output('bloburl'); if (!window.open(url, '_blank', 'noopener,noreferrer')) throw new Error('Autorisez l’ouverture de la fenêtre d’impression dans votre navigateur.'); return; }
    doc.save(name);
  }

  // ───────── Ouverture du menu ─────────
  async function open() {
    visited.length = 0;
    if (!loaded) fill(main, el('p', { class: 'su-empty', text: 'Chargement du suivi…' }));
    try { await ensureLoaded(); if (role === 'admin' && !accessCache) refreshAccess().catch(() => {}); render(); }
    catch (error) { fill(tabs); fill(main, el('p', { class: 'su-error', text: 'SUIVI&PFMP indisponible : ' + error.message })); }
  }
  new MutationObserver(() => { if (!root.classList.contains('hidden')) open(); }).observe(root, { attributes: true, attributeFilter: ['class'] });
  window.MelecSuivi = { open, back, flush: flushAll, get state() { return S; }, get role() { return role; } };
})();
