/* L'Atelier MELEC : SUIVI&PFMP — cœur de calcul repris de l'application « Évaluation ponctuelle »
   (melec-evaluation) : référentiel des épreuves E2, E31, E32, niveaux N1 à N4, note pondérée
   automatique, imports Excel sans doublon, préparation des attestations de stage.
   Aucune dépendance au navigateur : ce fichier est aussi testé tel quel par Node. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MelecSuiviCore = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const levels = [
    { code: 'N1', title: 'Non maîtrisé', factor: 0, color: '#e43d30' },
    { code: 'N2', title: 'Insuffisamment maîtrisé', factor: 1 / 3, color: '#f39c35' },
    { code: 'N3', title: 'Maîtrisé', factor: 2 / 3, color: '#9bc53d' },
    { code: 'N4', title: 'Très bien maîtrisé', factor: 1, color: '#24713a' }
  ];
  const levelDescriptions = [
    'La compétence n’est pas maîtrisée ; un accompagnement constant est nécessaire.',
    'La maîtrise reste fragile et nécessite un accompagnement régulier.',
    'La compétence est maîtrisée dans les situations usuelles.',
    'La compétence est pleinement maîtrisée, transférable et exercée avec autonomie.'
  ];
  const C = (code, title, weight, tasks, criteria) => ({ code, title, weight, tasks, criteria });
  const T = {
    t11: 'T1-1 · Prendre connaissance du dossier relatif aux opérations à réaliser et le constituer pour une opération simple',
    t12: 'T1-2 · Rechercher et expliciter les informations relatives aux opérations et aux conditions d’exécution',
    t13: 'T1-3 · Vérifier et compléter la liste des matériels électriques, équipements et outillages nécessaires',
    t14: 'T1-4 · Répartir les tâches selon les habilitations, certifications, équipiers et planning',
    t21: 'T2-1 · Organiser le poste de travail',
    t22: 'T2-2 · Implanter, poser et installer les matériels électriques',
    t23: 'T2-3 · Câbler et raccorder les matériels électriques',
    t24: 'T2-4 · Gérer les activités de son équipe',
    t25: 'T2-5 · Coordonner son activité avec les autres intervenants',
    t26: 'T2-6 · Mener son activité de manière éco-responsable',
    t31: 'T3-1 · Réaliser les vérifications, réglages, paramétrages et essais de mise en service',
    t32: 'T3-2 · Participer à la réception technique et aux levées de réserves',
    t41: 'T4-1 · Réaliser une opération de maintenance préventive',
    t42: 'T4-2 · Réaliser une opération de dépannage',
    t51: 'T5-1 · Participer à la mise à jour du dossier technique de l’installation',
    t52: 'T5-2 · Échanger sur le déroulement des opérations et expliquer le fonctionnement',
    t53: 'T5-3 · Conseiller le client et proposer une prestation, modification ou amélioration'
  };
  const base = {
    C2: C('C2', 'Organiser l’opération dans son contexte', 0.1714, [T.t13, T.t14, T.t21, T.t24, T.t25, T.t26, T.t42], [
      'Les matériels, équipements et outillages nécessaires sont identifiés',
      'Les tâches sont organisées en fonction des habilitations et du planning',
      'Les contraintes du poste et les aléas sont pris en compte',
      'Le poste de travail respecte les règles de santé, sécurité et ergonomie']),
    C4: C('C4', 'Réaliser une installation de manière éco-responsable', 0.2857, [T.t22, T.t23, T.t26], [
      'Les matériels sont posés conformément aux prescriptions',
      'Les câblages et raccordements respectent les règles de l’art',
      'Les adaptations nécessaires sont réalisées',
      'L’efficacité énergétique, l’environnement et le tri des déchets sont pris en compte',
      'Les autocontrôles sont réalisés et tracés']),
    C5: C('C5', 'Contrôler les grandeurs caractéristiques de l’installation', 0.1071, [T.t22, T.t23, T.t31, T.t32, T.t41, T.t42], [
      'Les contrôles et mesures adaptés sont réalisés', 'Les essais sont réalisés',
      'Les résultats sont correctement interprétés', 'Les règles de santé et de sécurité sont respectées']),
    C6: C('C6', 'Régler, paramétrer les matériels de l’installation', 0.1071, [T.t31, T.t32, T.t42], [
      'Les réglages sont conformes aux prescriptions', 'Les paramétrages sont réalisés et documentés',
      'L’efficacité énergétique est prise en compte', 'Les règles de santé et de sécurité sont respectées']),
    C7: C('C7', 'Valider le fonctionnement de l’installation', 0.1071, [T.t31, T.t32, T.t41, T.t42], [
      'La mise en fonctionnement respecte les prescriptions', 'Le fonctionnement est conforme au cahier des charges',
      'Les réserves sont identifiées et levées', 'Les règles de santé et de sécurité sont respectées']),
    C12: C('C12', 'Communiquer entre professionnels sur l’opération', 0.1143, [T.t11, T.t12, T.t24, T.t25, T.t51, T.t52], [
      'Les informations utiles sont identifiées et transmises', 'Les contraintes et choix techniques sont expliqués',
      'L’état d’avancement et les difficultés sont communiqués', 'Les choix économiques et énergétiques sont argumentés']),
    C13: C('C13', 'Communiquer avec le client/usager sur l’opération', 0.1073, [T.t52, T.t53], [
      'Les besoins du client sont collectés', 'Le fonctionnement et les conditions d’utilisation sont expliqués',
      'Les choix technologiques et économiques sont présentés', 'La satisfaction du client est recueillie'])
  };
  const exams = [
    { key: 'e2', label: 'E2', title: 'Préparation d’une opération', coefficient: 3, competencies: [
      C('C1', 'Analyser les conditions de l’opération et son contexte', 0.3, [T.t11, T.t12, T.t14], [
        'Les informations nécessaires sont recueillies', 'Les contraintes techniques, énergétiques et environnementales sont repérées',
        'Les risques professionnels sont évalués', 'Les habilitations et certifications nécessaires sont identifiées']),
      C('C3', 'Définir une installation à l’aide de solutions préétablies', 0.2, [T.t11], [
        'Le dossier technique est constitué et complet', 'La solution technique répond au besoin',
        'La solution intègre les enjeux d’efficacité énergétique']),
      C('C10', 'Exploiter les outils numériques dans le contexte professionnel', 0.3, [T.t11, T.t12, T.t51, T.t52], [
        'Les applications numériques sont exploitées avec pertinence', 'La recherche d’information est pertinente',
        'La communication numérique est éthique et responsable']),
      C('C11', 'Compléter les documents liés aux opérations', 0.2, [T.t11, T.t13, T.t51], [
        'Les documents nécessaires sont identifiés', 'Les informations utiles sont identifiées',
        'Les documents sont complétés ou modifiés correctement'])] },
    { key: 'e31', label: 'E31', title: 'Réalisation et mise en service d’une installation', coefficient: 7,
      competencies: [base.C2, base.C4, base.C5, base.C6, base.C7, base.C12, base.C13] },
    { key: 'e32', label: 'E32', title: 'Maintenance d’une installation', coefficient: 2, competencies: [
      C('C8', 'Diagnostiquer un dysfonctionnement', 0.7, [T.t42], [
        'Les informations relatives au dysfonctionnement sont analysées', 'Le fonctionnement de l’installation est analysé',
        'Le diagnostic est posé, pertinent et complet', 'Les règles de santé et de sécurité sont respectées']),
      C('C9', 'Remplacer un matériel électrique', 0.3, [T.t41, T.t42], [
        'Le matériel à remplacer est identifié et correctement déposé', 'Le matériel de remplacement est correctement choisi et installé',
        'Le fonctionnement est vérifié après rétablissement des énergies', 'Les règles de santé et de sécurité sont respectées'])] }
  ];

  // ───────── Utilitaires ─────────
  const uid = () => Math.random().toString(36).slice(2, 10);
  const pad = n => String(n).padStart(2, '0');
  const excelDate = n => new Date(Date.UTC(1899, 11, 30) + Math.floor(n) * 86400000);
  function formatBirthDate(value) {
    if (value == null || value === '') return '';
    if (value instanceof Date && !isNaN(value.getTime())) return `${pad(value.getDate())}/${pad(value.getMonth() + 1)}/${value.getFullYear()}`;
    if (typeof value === 'number') { const d = excelDate(value); return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`; }
    const text = String(value).trim();
    if (/^\d{1,2}[\/-]\d{1,2}[\/-]\d{4}$/.test(text)) { const [d, m, y] = text.split(/[\/-]/); return `${pad(Number(d))}/${pad(Number(m))}/${y}`; }
    if (/^\d{4}-\d{1,2}-\d{1,2}/.test(text)) { const [y, m, d] = text.slice(0, 10).split('-'); return `${pad(Number(d))}/${pad(Number(m))}/${y}`; }
    if (/^\d+(\.\d+)?$/.test(text)) { const d = excelDate(Number(text)); return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`; }
    const parsed = new Date(text);
    return isNaN(parsed.getTime()) ? text : `${pad(parsed.getDate())}/${pad(parsed.getMonth() + 1)}/${parsed.getFullYear()}`;
  }
  const header = v => String(v).toLowerCase().trim().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’'\-_/]+/g, ' ').replace(/\s+/g, ' ');
  const hasHeader = (keys, names) => keys.some(k => names.includes(header(k)));
  const pickCell = (o, names) => { const k = Object.keys(o).find(x => names.includes(header(x))); return k ? o[k] : ''; };
  const cellText = (o, names) => String(pickCell(o, names) ?? '').trim();
  const norm = v => String(v ?? '').trim().toLocaleLowerCase('fr').normalize('NFD').replace(/[̀-ͯ]/g, '');
  const studentKey = x => x.ine ? `ine:${norm(x.ine)}` : `student:${norm(x.lastName)}|${norm(x.firstName)}|${formatBirthDate(x.birthDate)}|${norm(x.className)}`;
  const teacherKey = x => x.email ? `email:${norm(x.email)}|class:${norm(x.className || '')}` : `teacher:${norm(x.lastName)}|${norm(x.firstName)}|${norm(x.className || '')}`;
  const tutorKey = x => `${norm(x.pfmpId || '')}|${norm(x.className || '')}|${norm(x.company || '')}|${norm(x.lastName)}|${norm(x.firstName)}`;

  function mergeUnique(current, incoming, key) {
    const merged = [...current];
    incoming.forEach(item => {
      const index = merged.findIndex(existing => key(existing) === key(item));
      if (index < 0) { merged.push(item); return; }
      const updates = Object.fromEntries(Object.entries(item).filter(([name, value]) => name !== 'id' && value !== '' && value != null));
      merged[index] = { ...merged[index], ...updates,
        ...('studentIds' in item ? { studentIds: [...new Set([...(merged[index].studentIds || []), ...(item.studentIds || [])])] } : {}),
        id: merged[index].id };
    });
    return merged;
  }
  function mergeClassNames(...groups) {
    const result = [], seen = new Set();
    groups.flat().forEach(value => { const name = String(value || '').trim(), key = norm(name); if (name && !seen.has(key)) { seen.add(key); result.push(name); } });
    return result;
  }

  // ───────── Base commune : la liste des élèves de L'Atelier MELEC est la référence ─────────
  // Une personne est reconnue par son nom complet et sa classe (accents, tirets et espaces ignorés),
  // ou par son numéro INE lorsqu'il est connu des deux côtés.
  const nameKey = (name, className) => norm(name).replace(/[\s'’-]+/g, ' ') + '|' + norm(className).replace(/\s+/g, '');
  const studentNameKey = s => nameKey(`${s.lastName || ''} ${s.firstName || ''}`, s.className);
  // « DUPONT DE LA TOUR Jean-Marc » → nom « DUPONT DE LA TOUR », prénom « Jean-Marc ».
  function splitRosterName(name) {
    const tokens = String(name || '').trim().split(/\s+/).filter(Boolean);
    let i = 0;
    while (i < tokens.length - 1 && /\p{L}/u.test(tokens[i]) && tokens[i] === tokens[i].toLocaleUpperCase('fr')) i++;
    if (i === 0) i = Math.min(1, tokens.length);
    return { lastName: tokens.slice(0, i).join(' '), firstName: tokens.slice(i).join(' ') };
  }
  // Ajoute au suivi les élèves et classes de la liste de référence, sans jamais en retirer ni créer de doublon.
  function linkRoster(state, roster, extraClasses = []) {
    const students = [...state.students], used = new Set(), detached = new Set(state.detachedRoster || []);
    const byRoster = new Map(), byName = new Map();
    students.forEach((s, i) => { if (s.rosterId) byRoster.set(s.rosterId, i); const k = studentNameKey(s); if (!byName.has(k)) byName.set(k, i); });
    let changed = false;
    (roster || []).forEach(r => {
      const name = String(r?.name || '').trim(), className = String(r?.className || '').trim();
      if (!r?.id || !name || !className || detached.has(r.id)) return;
      let i = byRoster.get(r.id);
      const sameId = i != null && !used.has(i);
      if (!sameId) i = byName.get(nameKey(name, className));
      if (i != null && !used.has(i)) {
        used.add(i);
        const s = students[i];
        // Nom ou classe corrigés dans la liste de référence : le suivi suit la correction.
        const renamed = sameId && studentNameKey(s) !== nameKey(name, className) ? splitRosterName(name) : null;
        if (renamed && norm(`${s.lastName} ${s.firstName}`).replace(/[\s'’-]+/g, ' ') === norm(name).replace(/[\s'’-]+/g, ' ')) renamed.lastName = s.lastName, renamed.firstName = s.firstName;
        if (renamed || s.rosterId !== r.id || norm(s.className) !== norm(className)) { students[i] = { ...s, ...(renamed || {}), rosterId: r.id, className }; changed = true; }
        return;
      }
      students.push({ id: uid(), ...splitRosterName(name), className, birthDate: '', ine: '', rosterId: r.id });
      used.add(students.length - 1); changed = true;
    });
    const classes = mergeClassNames(state.classes, (roster || []).filter(r => !detached.has(r?.id)).map(r => r?.className), extraClasses);
    if (classes.length !== state.classes.length) changed = true;
    return changed ? { ...state, students, classes } : state;
  }
  // Import d'une liste : complète les élèves déjà connus (INE, date de naissance) et ajoute les autres.
  function enrichStudents(state, incoming) {
    const students = [...state.students];
    let added = 0, updated = 0;
    incoming.forEach(item => {
      const ine = norm(item.ine), key = studentNameKey(item);
      const i = students.findIndex(s => (ine && norm(s.ine) === ine) || studentNameKey(s) === key);
      if (i < 0) { students.push({ ...item, id: item.id || uid() }); added++; return; }
      const s = students[i], next = { ...s };
      for (const field of ['ine', 'birthDate']) if (item[field] && norm(item[field]) !== norm(s[field])) next[field] = item[field];
      if (next.ine !== s.ine || next.birthDate !== s.birthDate) { students[i] = next; updated++; }
    });
    return { state: { ...state, students, classes: mergeClassNames(state.classes, incoming.map(s => s.className)) }, added, updated };
  }

  // ───────── Imports Excel (lignes déjà lues par XLSX.utils.sheet_to_json) ─────────
  function studentsFromRows(rows, defaultClass) {
    const keys = Object.keys(rows[0] || {});
    if (!hasHeader(keys, ['nom', 'lastname']) || !hasHeader(keys, ['prenom', 'firstname']) ||
        (!hasHeader(keys, ['numero ine', 'ine']) && !hasHeader(keys, ['date de naissance', 'naissance', 'birthdate'])))
      throw new Error('Ce fichier ne correspond pas à une liste d’élèves. Utilisez le bouton Importer Excel de la rubrique Nouvelle classe.');
    return rows.map(r => ({ id: uid(), lastName: cellText(r, ['nom', 'lastname']), firstName: cellText(r, ['prenom', 'firstname']),
      className: cellText(r, ['classe', 'class']) || defaultClass,
      birthDate: formatBirthDate(pickCell(r, ['date de naissance', 'naissance', 'birthdate'])), ine: cellText(r, ['numero ine', 'ine']) }))
      .filter(x => x.lastName && x.firstName && x.className);
  }
  const teacherEmailNames = ['email', 'e-mail', 'mail', 'adresse e-mail', 'adresse mail', 'adresse email', 'courriel', 'adresse électronique', 'email professionnel', 'e-mail professionnel', 'email enseignant', 'e-mail enseignant', 'email du professeur'].map(header);
  function teachersFromRows(rows, defaultClass) {
    const columns = Object.keys(rows[0] || {}).map(header);
    if (!columns.some(c => ['nom', 'lastname'].includes(c)) || !columns.some(c => ['prenom', 'firstname'].includes(c)) || !columns.some(c => ['matiere', 'matieres', 'discipline', 'subject'].includes(c)))
      throw new Error('Colonnes obligatoires : Nom, Prénom et Matière. Ajoutez E-mail pour permettre la première connexion.');
    const value = (row, names) => { const k = Object.keys(row).find(key => names.includes(header(key)) && String(row[key] ?? '').trim()); return k ? String(row[k]).trim() : ''; };
    const result = rows.map(r => ({ id: uid(), lastName: value(r, ['nom', 'lastname']), firstName: value(r, ['prenom', 'firstname']),
      email: value(r, teacherEmailNames).toLowerCase(), subject: value(r, ['matiere', 'matieres', 'discipline', 'subject']),
      phone: value(r, ['telephone', 'phone']), className: value(r, ['classe', 'class']) || defaultClass })).filter(t => t.lastName && t.firstName);
    if (result.some(t => !t.className)) throw new Error('Choisissez d’abord la classe de rattachement des enseignants.');
    return result;
  }
  // Compléter une adresse manquante garde l'identifiant utilisé par les affectations existantes.
  function reconcileImportedTeachers(previous, incoming) {
    return incoming.map(t => {
      const sameClass = previous.filter(p => header(p.className || '') === header(t.className || ''));
      const byEmail = t.email ? sameClass.filter(p => String(p.email || '').toLowerCase() === t.email) : [];
      const byName = sameClass.filter(p => (!p.email || !t.email) && header(p.lastName) === header(t.lastName) && header(p.firstName) === header(t.firstName));
      const matches = byEmail.length ? byEmail : byName;
      if (matches.length > 1) throw new Error(`Plusieurs fiches correspondent à ${t.lastName} ${t.firstName}. Complétez leurs adresses dans Professeurs avant de réimporter.`);
      const old = matches[0];
      return old ? { ...old, ...Object.fromEntries(Object.entries(t).filter(([k, v]) => k !== 'id' && v !== '' && v !== undefined)), id: old.id } : t;
    });
  }
  function tutorsFromRows(rows, state) {
    const keys = Object.keys(rows[0] || {}),
      tutorLastNames = ['nom du tuteur', 'nom tuteur'], tutorFirstNames = ['prenom du tuteur', 'prenom tuteur'],
      companyNames = ['entreprise', 'raison sociale', 'nom de l entreprise'], classNames = ['classe', 'classe de l eleve'],
      pfmpNames = ['pfmp', 'periode pfmp', 'nom de la pfmp'], studentLastNames = ['nom de l eleve', 'nom eleve'], studentFirstNames = ['prenom de l eleve', 'prenom eleve'];
    if (!hasHeader(keys, tutorLastNames) || !hasHeader(keys, tutorFirstNames) || !hasHeader(keys, companyNames) || !hasHeader(keys, classNames) || !hasHeader(keys, pfmpNames) ||
        (!hasHeader(keys, ['ine', 'numero ine']) && (!hasHeader(keys, studentLastNames) || !hasHeader(keys, studentFirstNames))))
      throw new Error('Colonnes obligatoires : Raison sociale, Nom du tuteur, Prénom du tuteur, Classe, PFMP et INE (ou Nom de l’élève + Prénom de l’élève).');
    return rows.map((row, index) => {
      const className = cellText(row, classNames), pfmpName = cellText(row, pfmpNames);
      const pfmp = state.pfmps.find(item => norm(item.className) === norm(className) && (norm(item.name) === norm(pfmpName) || norm(item.id) === norm(pfmpName)));
      const ine = cellText(row, ['ine', 'numero ine']), sl = cellText(row, studentLastNames), sf = cellText(row, studentFirstNames);
      const student = state.students.find(item => norm(item.className) === norm(className) &&
        (ine ? norm(item.ine) === norm(ine) : norm(item.lastName) === norm(sl) && norm(item.firstName) === norm(sf)));
      if (!pfmp) throw new Error(`Ligne ${index + 2} : la PFMP « ${pfmpName} » n’existe pas pour la classe « ${className} ».`);
      if (!student) throw new Error(`Ligne ${index + 2} : élève introuvable dans la classe « ${className} ».`);
      const company = cellText(row, companyNames);
      return { id: uid(), company, hostStructure: cellText(row, ['structure d accueil', 'structure accueil']) || company,
        companyAddress: cellText(row, ['adresse entreprise', 'adresse de l entreprise', 'adresse code postal ville']),
        companyPhone: cellText(row, ['telephone entreprise', 'telephone de l entreprise']),
        lastName: cellText(row, tutorLastNames), firstName: cellText(row, tutorFirstNames),
        email: cellText(row, ['email du tuteur', 'e-mail du tuteur', 'email', 'e-mail']), phone: cellText(row, ['telephone du tuteur', 'telephone tuteur']),
        className: pfmp.className, pfmpId: pfmp.id, studentIds: [student.id] };
    });
  }

  // ───────── Nettoyage des références ─────────
  function removeStudentReferences(state, removed) {
    if (!removed.size) return state;
    return { ...state, students: state.students.filter(s => !removed.has(s.id)), selected: removed.has(state.selected) ? '' : state.selected,
      evaluations: Object.fromEntries(Object.entries(state.evaluations).filter(([id]) => !removed.has(id))),
      activities: state.activities.map(a => ({ ...a, studentIds: a.studentIds.filter(id => !removed.has(id)) })),
      pfmps: state.pfmps.map(p => ({ ...p, assignments: Object.fromEntries(Object.entries(p.assignments).filter(([id]) => !removed.has(id))) })),
      tutors: state.tutors.map(t => ({ ...t, studentIds: (t.studentIds || []).filter(id => !removed.has(id)) })),
      attestations: state.attestations.filter(a => !removed.has(a.studentId)) };
  }
  function removeTeacherReferences(state, removed) {
    if (!removed.size) return state;
    return { ...state, teachers: state.teachers.filter(t => !removed.has(t.id)),
      pfmps: state.pfmps.map(p => ({ ...p, assignments: Object.fromEntries(Object.entries(p.assignments).map(([id, a]) => [id, removed.has(a.teacherId) ? { ...a, teacherId: '' } : a])) })) };
  }
  const emptyHeader = () => ({ logoDataUrl: '', schoolName: '', address: '', phone: '', ddfptEmail: '' });
  const emptyEval = () => ({ mastery: {}, tasks: {}, criteria: {}, appreciation: '', jury: '', date: '' });
  const emptyAttestationFields = () => ({ hostStructure: '', companyName: '', companyAddress: '', companyPhone: '', totalWeeks: '', absenceDays: '', absenceDetails: '', signedAtCity: '', signedAtDate: '', signerName: '' });
  function cleanState(saved) {
    saved = saved || {};
    return { schoolYear: saved.schoolYear || '2026-2027', classes: mergeClassNames(saved.classes || []),
      students: saved.students || [], teachers: (saved.teachers || []).map(({ accessCode, ...t }) => t), tutors: saved.tutors || [],
      periods: saved.periods || [], activities: saved.activities || [],
      pfmps: (saved.pfmps || []).map(p => ({ ...p, assignments: p.assignments || {} })),
      pdfHeader: { ...emptyHeader(), ...(saved.pdfHeader || {}) },
      detachedRoster: Array.isArray(saved.detachedRoster) ? saved.detachedRoster : [],
      evaluations: saved.evaluations || {}, attestations: saved.attestations || [], selected: '', selectedActivity: '', selectedPfmp: '' };
  }
  // Document enregistré côté serveur : sans les évaluations, attestations ni sélections d'écran.
  const documentOf = s => ({ schoolYear: s.schoolYear, classes: s.classes, students: s.students, teachers: s.teachers, tutors: s.tutors,
    periods: s.periods, activities: s.activities, pfmps: s.pfmps, pdfHeader: s.pdfHeader, detachedRoster: s.detachedRoster || [] });

  // ───────── Notes ─────────
  const criterionFactor = value => levels.find(l => l.code === value)?.factor;
  const evaluationSlot = (examKey, activityId = '') => activityId ? `activity:${activityId}:${examKey}` : examKey;
  const pfmpEvaluationSlot = (examKey, pfmpId = '') => pfmpId ? `pfmp:${pfmpId}:${examKey}` : examKey;
  function competencyResult(ev, c) {
    if (ev?.mastery?.[c.code] === -1) return { evaluated: false, excluded: true, factor: 0 };
    const values = [], mastery = ev?.mastery?.[c.code];
    if (mastery != null && mastery >= 0) values.push(levels[mastery].factor);
    c.tasks.forEach((_, i) => { const f = criterionFactor(ev?.tasks?.[`${c.code}-task-${i}`] || ''); if (f != null) values.push(f); });
    c.criteria.forEach((_, i) => { const f = criterionFactor(ev?.criteria?.[`${c.code}-${i}`] || ''); if (f != null) values.push(f); });
    return { evaluated: values.length > 0, excluded: false, factor: values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0 };
  }
  const slotFor = (s, exam, contextId, context) => (context === 'pfmp' || s.pfmps.some(p => p.id === contextId)) ? pfmpEvaluationSlot(exam.key, contextId) : evaluationSlot(exam.key, contextId);
  function score(s, studentId, exam, contextId = '', context = 'activity') {
    const ev = s.evaluations[studentId]?.[slotFor(s, exam, contextId, context)];
    const parts = exam.competencies.map(c => ({ c, ...competencyResult(ev, c) })).filter(x => x.evaluated);
    const weight = parts.reduce((n, x) => n + x.c.weight, 0);
    return weight ? parts.reduce((n, x) => n + x.c.weight * x.factor, 0) / weight * 20 : 0;
  }
  const completion = (s, id, exam, contextId = '', context = 'activity') =>
    exam.competencies.filter(c => competencyResult(s.evaluations[id]?.[slotFor(s, exam, contextId, context)], c).evaluated).length;
  function examFullyCompleted(s, studentId, exam, pfmpId) {
    const ev = s.evaluations[studentId]?.[pfmpEvaluationSlot(exam.key, pfmpId)];
    if (!ev?.date || !ev.jury) return false;
    return exam.competencies.every(c => {
      const m = ev.mastery?.[c.code];
      if (typeof m !== 'number') return false;
      if (m === -1) return true;
      return c.tasks.every((_, i) => Boolean(ev.tasks?.[`${c.code}-task-${i}`])) && c.criteria.every((_, i) => Boolean(ev.criteria?.[`${c.code}-${i}`]));
    });
  }
  function attestationIsReady(s, pfmp, studentId) {
    const a = pfmp.assignments[studentId], assigned = a ? exams.filter(e => a.examKeys.includes(e.key)) : [];
    return Boolean(a && assigned.length > 0 && assigned.every(e => examFullyCompleted(s, studentId, e, pfmp.id)));
  }
  function getOrCreateAttestation(s, pfmp, student, teacherEmail, now = new Date()) {
    const existing = s.attestations.find(a => a.pfmpId === pfmp.id && a.studentId === student.id);
    const tutor = s.tutors.find(t => t.pfmpId === pfmp.id && t.studentIds?.includes(student.id)) ||
      s.tutors.find(t => !t.pfmpId && t.className === student.className && t.studentIds?.includes(student.id));
    const start = new Date(`${pfmp.startDate}T12:00:00`), end = new Date(`${pfmp.endDate}T12:00:00`);
    const totalWeeks = Number.isFinite(start.getTime()) && Number.isFinite(end.getTime()) ? String(Math.max(1, Math.round((end - start + 86400000) / 604800000))) : '';
    const auto = { totalWeeks, signedAtDate: existing?.fields.signedAtDate || (attestationIsReady(s, pfmp, student.id) ? now.toISOString().slice(0, 10) : ''),
      ...(tutor ? { hostStructure: tutor.hostStructure || tutor.company || '', companyName: tutor.company || '', companyAddress: tutor.companyAddress || '', companyPhone: tutor.companyPhone || tutor.phone || '' } : {}) };
    if (existing?.signedAt) return existing;
    if (existing) return { ...existing, teacherEmail: String(teacherEmail || '').trim().toLowerCase(), fields: { ...emptyAttestationFields(), ...existing.fields, ...auto }, manualUnlocked: Boolean(existing.manualUnlocked) };
    return { id: `attestation-${pfmp.id}-${student.id}`, pfmpId: pfmp.id, studentId: student.id, teacherEmail: String(teacherEmail || '').trim().toLowerCase(),
      fields: { ...emptyAttestationFields(), hostStructure: tutor?.hostStructure || tutor?.company || '', companyName: tutor?.company || '',
        companyAddress: tutor?.companyAddress || '', companyPhone: tutor?.companyPhone || tutor?.phone || '', ...auto, absenceDays: '0', signerName: '' },
      adminLocked: false, manualUnlocked: false, signedAt: '', signedBy: '', signatureHash: '', updatedAt: now.toISOString() };
  }
  function activityScore(s, studentId, activity) {
    const evaluated = exams.filter(e => activity.examKeys.includes(e.key) && completion(s, studentId, e, activity.id) > 0);
    const weight = evaluated.reduce((t, e) => t + e.coefficient, 0);
    return weight ? evaluated.reduce((t, e) => t + score(s, studentId, e, activity.id) * e.coefficient, 0) / weight : null;
  }
  const pdfName = value => String(value).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();

  return { levels, levelDescriptions, exams, uid, formatBirthDate, norm, header, studentKey, teacherKey, tutorKey, mergeUnique, mergeClassNames,
    nameKey, studentNameKey, splitRosterName, linkRoster, enrichStudents,
    studentsFromRows, teachersFromRows, reconcileImportedTeachers, tutorsFromRows, removeStudentReferences, removeTeacherReferences,
    emptyHeader, emptyEval, emptyAttestationFields, cleanState, documentOf, criterionFactor, evaluationSlot, pfmpEvaluationSlot,
    competencyResult, score, completion, examFullyCompleted, attestationIsReady, getOrCreateAttestation, activityScore, pdfName };
});
