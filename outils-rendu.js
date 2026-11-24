/* L'Atelier MELEC · Mes outils : modèles de CV et de lettre de motivation.
   Ce fichier ne contient que les données (thèmes, organisations, rubriques) et la fabrication
   de la page A4 (794 × 1123 px à 96 ppp). La même page sert à l'aperçu et au PDF
   (outils-pdf.js la redessine en texte vectoriel). Les polices sont choisies pour avoir
   exactement les mêmes largeurs que les polices intégrées au PDF (Helvetica, Times, Courier). */
(function () {
  'use strict';
  const PAGE_W = 794, PAGE_H = 1123;
  const FONTS = {
    sans: 'Arimo, Arial, Helvetica, "Liberation Sans", sans-serif',
    serif: 'Tinos, "Times New Roman", Times, "Liberation Serif", serif',
    mono: 'Cousine, "Courier New", Courier, "Liberation Mono", monospace'
  };
  const FONT_LABELS = { '': 'Celle du thème', sans: 'Sans empattement (Arial)', serif: 'À empattements (Times)', mono: 'Technique (Courier)' };

  // 12 thèmes, du plus simple au plus professionnel. side : couleur de la colonne ; sideInk : texte de la colonne.
  const THEMES = [
    { id: 'sobre', name: 'Sobre', level: 'Simple', ats: true, accent: '#222222', side: '#f2f2f2', sideInk: '#222222', head: 'sans', body: 'sans', title: 'rule', caps: false, photo: 'rounded', desc: 'Noir et blanc, une seule police : passe partout et s’imprime parfaitement.' },
    { id: 'classique', name: 'Classique', level: 'Simple', ats: true, accent: '#1f3b63', side: '#eef2f7', sideInk: '#1f3b63', head: 'serif', body: 'sans', title: 'rule', caps: false, photo: 'rounded', desc: 'Titres à empattements bleu marine, le CV « bien élevé ».' },
    { id: 'harvard', name: 'Épuré ATS', level: 'Simple', ats: true, accent: '#111111', side: '#ffffff', sideInk: '#111111', head: 'serif', body: 'serif', title: 'caps', caps: true, photo: 'none', desc: 'Inspiré des CV universitaires : sans couleur, lu sans erreur par les logiciels de recrutement.' },
    { id: 'moderne', name: 'Moderne', level: 'Moderne', ats: false, accent: '#0b7f74', side: '#0b7f74', sideInk: '#ffffff', head: 'sans', body: 'sans', title: 'bar', caps: false, photo: 'round', desc: 'Colonne colorée, photo ronde, barres de niveau : le standard actuel.' },
    { id: 'suisse', name: 'Minimal suisse', level: 'Moderne', ats: true, accent: '#d62839', side: '#ffffff', sideInk: '#222222', head: 'sans', body: 'sans', title: 'caps', caps: false, photo: 'square', desc: 'Grille stricte, grand nom en gras, une seule couleur vive.' },
    { id: 'nordique', name: 'Nordique', level: 'Moderne', ats: false, accent: '#4a6fa5', side: '#e9eff6', sideInk: '#2c3e57', head: 'sans', body: 'sans', title: 'pill', caps: false, photo: 'rounded', desc: 'Tons doux, titres en pastilles, beaucoup d’air.' },
    { id: 'technique', name: 'Technique', level: 'Professionnel', ats: true, accent: '#3b5bdb', side: '#edf1ff', sideInk: '#26346e', head: 'mono', body: 'sans', title: 'code', caps: false, photo: 'rounded', desc: 'Esprit bureau d’études : titres techniques, repères bleus, très lisible.' },
    { id: 'pro', name: 'Électrique pro', level: 'Professionnel', ats: false, accent: '#e07a10', side: '#0f2846', sideInk: '#e9f1fb', head: 'sans', body: 'sans', title: 'bar', caps: true, photo: 'rounded', desc: 'Le style de L’Atelier : bleu nuit et orange, très affirmé.' },
    { id: 'corporate', name: 'Corporate', level: 'Professionnel', ats: true, accent: '#0d3b66', side: '#0d3b66', sideInk: '#ffffff', head: 'sans', body: 'sans', title: 'rule', caps: true, photo: 'square', desc: 'Bleu profond et sobre, pour l’alternance et les grands groupes.' },
    { id: 'elegant', name: 'Élégant', level: 'Professionnel', ats: true, accent: '#8a6d3b', side: '#faf6ee', sideInk: '#5b4523', head: 'serif', body: 'sans', title: 'caps', caps: false, photo: 'round', desc: 'Filets dorés, mise en page aérée et raffinée.' },
    { id: 'creatif', name: 'Créatif', level: 'Créatif', ats: false, accent: '#7b2cbf', side: '#f3e8ff', sideInk: '#4a1c7a', head: 'sans', body: 'sans', title: 'pill', caps: false, photo: 'round', desc: 'Violet franc et pastilles, pour se démarquer.' },
    { id: 'graphite', name: 'Graphite', level: 'Créatif', ats: false, accent: '#ef8354', side: '#2b2d42', sideInk: '#edf2f4', head: 'sans', body: 'sans', title: 'bar', caps: true, photo: 'round', desc: 'Colonne anthracite et corail, très graphique.' }
  ];
  const THEME_LEVELS = ['Simple', 'Moderne', 'Professionnel', 'Créatif'];
  const ACCENTS = [['', 'Couleur du thème'], ['#e07a10', 'Orange'], ['#0b7f74', 'Sarcelle'], ['#1f6feb', 'Bleu'], ['#0d3b66', 'Marine'], ['#d62839', 'Rouge'], ['#7b2cbf', 'Violet'], ['#2f855a', 'Vert'], ['#222222', 'Noir']];

  const LAYOUTS = [
    { id: 'lateral', name: 'Colonne à gauche', hint: 'Photo, coordonnées et compétences dans une colonne ; parcours à droite. Le plus répandu.' },
    { id: 'lateral-d', name: 'Colonne à droite', hint: 'Le parcours d’abord, la colonne d’informations à droite.' },
    { id: 'ats', name: 'Une colonne (ATS)', hint: 'Tout sur une seule colonne : lu sans erreur par les logiciels de recrutement.' },
    { id: 'bandeau', name: 'Bandeau', hint: 'Un grand bandeau en haut avec nom, photo et coordonnées, puis deux colonnes.' },
    { id: 'deux', name: 'Deux colonnes', hint: 'Deux colonnes équilibrées sous l’en-tête : expériences à gauche, formation et atouts à droite.' },
    { id: 'frise', name: 'Frise chronologique', hint: 'Expériences et formations sur une ligne de temps : le parcours se lit d’un coup d’œil.' },
    { id: 'bento', name: 'Cartes (bento)', hint: 'Chaque rubrique dans une carte : très moderne et aéré.' }
  ];

  // Rubriques du CV. zone : main (parcours) ou side (atouts). type : text, list, tags, levels, refs.
  const CV_SECTIONS = [
    { id: 'profil', label: 'Profil', type: 'text', zone: 'main', on: true, help: '2 à 3 phrases : qui vous êtes, ce que vous cherchez, votre point fort.' },
    { id: 'experiences', label: 'Expériences professionnelles', type: 'list', zone: 'main', on: true, help: 'Stages (PFMP), jobs d’été, apprentissage : du plus récent au plus ancien.' },
    { id: 'formation', label: 'Formation', type: 'list', zone: 'main', on: true, help: 'Diplôme préparé, établissement, années. Le plus récent en premier.' },
    { id: 'projets', label: 'Réalisations et projets', type: 'list', zone: 'main', on: false, help: 'Chef-d’œuvre, projet d’atelier, installation réalisée…' },
    { id: 'engagement', label: 'Engagements et bénévolat', type: 'list', zone: 'main', on: false, help: 'Association, délégué de classe, club sportif, sapeur-pompier volontaire…' },
    { id: 'autre', label: 'Rubrique libre', type: 'list', zone: 'main', on: false, help: 'Donnez-lui le titre de votre choix (Prix, Séjours à l’étranger…).' },
    { id: 'references', label: 'Références', type: 'refs', zone: 'main', on: false, help: 'Tuteur de stage ou employeur qui accepte d’être contacté.' },
    { id: 'habilitations', label: 'Habilitations et certifications', type: 'tags', zone: 'side', on: true, help: 'Habilitations électriques, SST, CACES… Une par ligne.' },
    { id: 'competences', label: 'Compétences techniques', type: 'levels', zone: 'side', on: true, help: 'Ce que vous savez faire, avec votre niveau.' },
    { id: 'savoiretre', label: 'Qualités', type: 'tags', zone: 'side', on: true, help: 'Vos qualités professionnelles (3 à 6).' },
    { id: 'logiciels', label: 'Logiciels et outils', type: 'levels', zone: 'side', on: false, help: 'Logiciels de schéma, bureautique, appareils de mesure…' },
    { id: 'langues', label: 'Langues', type: 'levels', zone: 'side', on: true, help: 'Niveau : A1 à C2 ou « langue maternelle ».' },
    { id: 'permis', label: 'Permis et mobilité', type: 'tags', zone: 'side', on: false, help: 'Permis B (en cours), véhiculé, mobile sur la région…' },
    { id: 'interets', label: 'Centres d’intérêt', type: 'tags', zone: 'side', on: true, help: 'Précis et vrais : « football en club depuis 6 ans » plutôt que « sport ».' },
    { id: 'liens', label: 'Liens', type: 'tags', zone: 'side', on: false, help: 'Profil LinkedIn, portfolio… (adresse complète).' }
  ];
  const SUGGESTIONS = {
    habilitations: ['Habilitation électrique B1V', 'Habilitation électrique B2V', 'Habilitation électrique BR', 'Habilitation électrique BC', 'Habilitation électrique H0V', 'Habilitation électrique BE Manœuvre', 'Sauveteur secouriste du travail (SST)', 'Travail en hauteur', 'PRAP'],
    competences: ['Câblage d’armoires et de tableaux', 'Lecture de schémas électriques', 'Pose de chemins de câbles', 'Consignation et mise en sécurité', 'Mise en service et essais', 'Mesures électriques', 'Domotique KNX', 'Réseaux VDI', 'Photovoltaïque', 'Bornes de recharge (IRVE)', 'Automatismes industriels', 'Dépannage'],
    savoiretre: ['Rigueur', 'Ponctualité', 'Esprit d’équipe', 'Sens de la sécurité', 'Autonomie', 'Curiosité', 'Sens du contact', 'Organisation', 'Motivation'],
    logiciels: ['Word, Excel', 'SEE Electrical', 'QElectroTech', 'AutoCAD', 'Caneco', 'ETS (KNX)', 'Multimètre et pince ampèremétrique', 'Contrôleur d’installation'],
    langues: ['Français', 'Anglais', 'Espagnol', 'Allemand', 'Arabe', 'Portugais', 'Italien'],
    permis: ['Permis B', 'Permis B en cours', 'Permis AM', 'Véhiculé', 'Mobile sur toute la région'],
    interets: ['Football en club', 'Musique', 'Bricolage électronique', 'Jeux vidéo', 'Cuisine', 'Randonnée', 'Mécanique']
  };
  const LEVEL_NAMES = ['', 'Notions', 'Intermédiaire', 'Bon niveau', 'Très bon niveau', 'Expert'];

  // Lettre de motivation : organisations, types et blocs.
  const LETTER_LAYOUTS = [
    { id: 'fr', name: 'Française classique', hint: 'Vos coordonnées à gauche, le destinataire à droite, puis lieu, date et objet : la présentation attendue en France.' },
    { id: 'bandeau', name: 'En-tête moderne', hint: 'Votre nom dans un bandeau de couleur, comme sur un CV moderne.' },
    { id: 'cv', name: 'Assortie au CV', hint: 'Le même en-tête que votre CV : les deux documents forment un ensemble.' },
    { id: 'lateral', name: 'Colonne latérale', hint: 'Vos coordonnées dans une colonne colorée, la lettre à droite.' },
    { id: 'minimal', name: 'Minimaliste', hint: 'Nom centré, filet fin, beaucoup d’air : sobre et élégant.' },
    { id: 'mail', name: 'Message e-mail', hint: 'Version courte à coller dans un e-mail ou une plateforme, avec le CV en pièce jointe.' }
  ];
  const LETTER_TYPES = {
    pfmp: { name: 'Stage (PFMP)', object: 'Demande de stage (PFMP) du [date de début] au [date de fin]',
      accroche: 'Élève en [classe] Bac Pro MELEC au lycée [nom du lycée], je recherche une entreprise d’accueil pour ma période de formation en milieu professionnel de [nombre] semaines, du [date de début] au [date de fin].' },
    apprentissage: { name: 'Apprentissage', object: 'Candidature à un contrat d’apprentissage · [formation visée]',
      accroche: 'Je prépare un [diplôme] et je souhaite poursuivre en [formation visée] en alternance : je serais heureux de le faire au sein de votre entreprise comme apprenti.' },
    emploi: { name: 'Premier emploi', object: 'Candidature au poste de [intitulé du poste]',
      accroche: 'Titulaire du Bac Pro MELEC, je souhaite mettre au service de votre entreprise les compétences acquises au lycée et lors de mes stages.' },
    spontanee: { name: 'Candidature spontanée', object: 'Candidature spontanée · [métier visé]',
      accroche: 'Passionné par les installations électriques, je me permets de vous proposer ma candidature, même si aucun poste n’est publié aujourd’hui.' },
    offre: { name: 'Réponse à une offre', object: 'Réponse à votre offre « [intitulé de l’offre] »',
      accroche: 'Votre offre d’[intitulé du poste] publiée sur [site] le [date] a retenu toute mon attention : mon profil correspond à vos attentes.' },
    etudes: { name: 'Poursuite d’études', object: 'Candidature en [formation visée]',
      accroche: 'Élève en terminale Bac Pro MELEC, je souhaite intégrer votre [formation visée] pour approfondir [domaine].' }
  };
  const LETTER_BLOCKS = [
    { id: 'appel', label: 'Formule d’appel', model: 'Madame, Monsieur,', tips: ['Madame,', 'Monsieur,', 'Madame, Monsieur,'] },
    { id: 'accroche', label: 'Accroche', help: 'Pourquoi vous écrivez, en une ou deux phrases.', tips: ['Votre annonce a retenu toute mon attention…', 'Élève en Bac Pro MELEC, je…', 'Sur les conseils de…'] },
    { id: 'vous', label: 'Vous · l’entreprise', help: 'Ce que vous savez d’elle et pourquoi vous la choisissez.', model: 'Votre entreprise intervient sur [type de chantiers] et est reconnue pour [point fort] : c’est l’environnement dans lequel je veux progresser.', tips: ['Votre entreprise est reconnue pour…', 'J’ai découvert vos chantiers…', 'Vos valeurs de…'] },
    { id: 'moi', label: 'Moi · mes atouts', help: 'Vos compétences, avec des preuves concrètes (stage, réalisation).', model: 'Lors de ma dernière période de stage chez [entreprise], j’ai [réalisation précise]. Je sais [compétence] et je suis titulaire de l’habilitation [niveau].', tips: ['Lors de mon stage chez…', 'Je suis titulaire de l’habilitation…', 'J’ai appris à…'] },
    { id: 'nous', label: 'Nous · le projet commun', help: 'Ce que vous apporterez et ce que vous apprendrez.', model: 'Rejoindre votre équipe me permettrait de progresser en [domaine], tout en vous apportant mon sérieux, ma ponctualité et ma motivation.', tips: ['Je souhaite contribuer à…', 'Ce stage me permettra de…'] },
    { id: 'dispo', label: 'Disponibilités', on: false, help: 'Dates, mobilité, permis.', model: 'Je suis disponible à partir du [date] et peux me déplacer sur [secteur].', tips: ['Je suis disponible à partir du…', 'Je suis mobile sur…'] },
    { id: 'conclusion', label: 'Conclusion', help: 'Demandez un entretien.', model: 'Je serais heureux de vous présenter ma motivation lors d’un entretien, à la date qui vous conviendra.', tips: ['Je me tiens à votre disposition…', 'Dans l’attente de votre réponse…'] },
    { id: 'politesse', label: 'Formule de politesse', model: 'Je vous prie d’agréer, Madame, Monsieur, l’expression de mes salutations distinguées.', tips: ['Je vous prie d’agréer, Madame, Monsieur, l’expression de mes salutations distinguées.', 'Veuillez recevoir, Madame, Monsieur, mes sincères salutations.', 'Bien cordialement,'] }
  ];
  const LETTER_OPTIONAL = [
    { id: 'expediteur', label: 'Mes coordonnées' }, { id: 'destinataire', label: 'Destinataire' }, { id: 'date', label: 'Lieu et date' },
    { id: 'objet', label: 'Objet' }, { id: 'ref', label: 'Référence de l’offre' }, { id: 'signature', label: 'Signature' },
    { id: 'ps', label: 'P.-S.' }, { id: 'pj', label: 'Pièce jointe' }
  ];

  // Caractères que le PDF ne sait pas écrire avec ses polices intégrées : remplacés partout,
  // pour que l'aperçu et le PDF soient identiques.
  const MAP = { '‑': '-', '‐': '-', '−': '-', ' ': ' ', ' ': ' ', ' ': ' ', '​': '', '→': '>', '←': '<', '✓': 'v', '✔': 'v', '★': '*', '•': '•', '″': '"', '′': '\'', '―': '—', 'ﬁ': 'fi', 'ﬂ': 'fl', 'œ': 'œ' };
  const ALLOWED = /[\x20-\x7e\xa0-\xffŒœŠšŸŽžƒˆ˜–—‘’‚“”„†‡•…‰‹›€™\n]/;
  function safe(text) {
    let out = '';
    for (const char of String(text ?? '').normalize('NFC')) {
      if (MAP[char] !== undefined) out += MAP[char];
      else if (ALLOWED.test(char)) out += char;
      else {
        const base = char.normalize('NFD').replace(/[̀-ͯ]/g, '');
        out += base && ALLOWED.test(base[0]) ? base : '';
      }
    }
    return out;
  }
  const str = (value, max = 2000) => String(value ?? '').slice(0, max);
  const tid = () => Math.random().toString(36).slice(2, 10);
  const pick = (value, list, fallback) => (list.includes(value) ? value : fallback);

  // ───── Données : valeurs par défaut et nettoyage (tout ce qui vient de la base est vérifié) ─────
  const emptyItem = () => ({ id: tid(), title: '', org: '', place: '', start: '', end: '', desc: '' });
  function newCv(person = {}) {
    const sections = {};
    for (const s of CV_SECTIONS) sections[s.id] = { on: s.on, title: '' , ...(s.type === 'text' ? { text: '' } : s.type === 'list' || s.type === 'refs' ? { items: [] } : s.type === 'tags' ? { tags: [] } : { levels: [] }) };
    sections.experiences.items = [emptyItem()];
    sections.formation.items = [{ ...emptyItem(), title: 'Bac Pro MELEC (Métiers de l’électricité et de ses environnements connectés)' }];
    sections.langues.levels = [{ label: 'Français', level: 5, detail: 'Langue maternelle' }, { label: 'Anglais', level: 2, detail: 'A2' }];
    return clean('cv', {
      v: 1, layout: 'lateral', theme: 'moderne', accent: '', font: '', photoShape: '', levelStyle: 'bars', density: 'normal', fit: true,
      person: { first: person.first || '', last: person.last || '', title: '', email: person.email || '', phone: '', city: '', address: '', birth: '', web: '' },
      photo: '', order: CV_SECTIONS.map(s => s.id), sections
    });
  }
  function newLetter(person = {}, type = 'pfmp') {
    const blocks = {};
    for (const b of LETTER_BLOCKS) blocks[b.id] = { on: b.on !== false, text: '' };
    return clean('lm', {
      v: 1, layout: 'fr', theme: 'moderne', accent: '', font: '', type, justify: true,
      person: { first: person.first || '', last: person.last || '', title: '', email: person.email || '', phone: '', address: '', city: '' },
      recipient: { company: '', contact: '', service: '', address: '', city: '' },
      place: '', date: '', object: '', ref: '', ps: '', pj: 'Pièce jointe : curriculum vitae',
      sign: { mode: 'typed', image: '' },
      show: { expediteur: true, destinataire: true, date: true, objet: true, ref: false, signature: true, ps: false, pj: true },
      order: LETTER_BLOCKS.map(b => b.id), blocks
    });
  }
  const IMG = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
  function cleanImage(value, max) { return typeof value === 'string' && value.length <= max && IMG.test(value) ? value : ''; }
  function cleanOrder(order, ids) {
    const seen = new Set();
    const list = (Array.isArray(order) ? order : []).filter(id => ids.includes(id) && !seen.has(id) && seen.add(id));
    return [...list, ...ids.filter(id => !seen.has(id))];
  }
  function clean(kind, raw) {
    const d = raw && typeof raw === 'object' ? raw : {};
    const themeIds = THEMES.map(t => t.id);
    const common = {
      v: 1, theme: pick(d.theme, themeIds, 'moderne'), accent: /^#[0-9a-f]{6}$/i.test(d.accent || '') ? d.accent : '',
      font: pick(d.font, ['', 'sans', 'serif', 'mono'], '')
    };
    const p = d.person || {};
    if (kind === 'cv') {
      const sections = {};
      const src = d.sections || {};
      for (const s of CV_SECTIONS) {
        const x = src[s.id] || {};
        const base = { on: x.on === undefined ? s.on : Boolean(x.on), title: str(x.title, 60) };
        if (s.type === 'text') base.text = str(x.text, 1200);
        else if (s.type === 'list') base.items = (Array.isArray(x.items) ? x.items : []).slice(0, 12).map(i => ({ id: str(i?.id, 12) || tid(), title: str(i?.title, 160), org: str(i?.org, 120), place: str(i?.place, 80), start: str(i?.start, 30), end: str(i?.end, 30), desc: str(i?.desc, 900) }));
        else if (s.type === 'refs') base.items = (Array.isArray(x.items) ? x.items : []).slice(0, 4).map(i => ({ id: str(i?.id, 12) || tid(), name: str(i?.name, 80), role: str(i?.role, 100), org: str(i?.org, 100), contact: str(i?.contact, 120) }));
        else if (s.type === 'tags') base.tags = (Array.isArray(x.tags) ? x.tags : []).slice(0, 16).map(t => str(t, 120));
        else base.levels = (Array.isArray(x.levels) ? x.levels : []).slice(0, 14).map(l => ({ label: str(l?.label, 80), level: Math.min(5, Math.max(1, Math.round(Number(l?.level) || 3))), detail: str(l?.detail, 40) }));
        sections[s.id] = base;
      }
      return {
        ...common, layout: pick(d.layout, LAYOUTS.map(l => l.id), 'lateral'),
        photoShape: pick(d.photoShape, ['', 'round', 'rounded', 'square', 'none'], ''),
        levelStyle: pick(d.levelStyle, ['bars', 'dots', 'text'], 'bars'),
        density: pick(d.density, ['airy', 'normal', 'compact'], 'normal'), fit: d.fit !== false,
        person: { first: str(p.first, 60), last: str(p.last, 60), title: str(p.title, 120), email: str(p.email, 120), phone: str(p.phone, 30), city: str(p.city, 80), address: str(p.address, 160), birth: str(p.birth, 40), web: str(p.web, 160) },
        photo: cleanImage(d.photo, 200000),
        photoPos: { x: Math.min(100, Math.max(0, Number(d.photoPos?.x ?? 50))), y: Math.min(100, Math.max(0, Number(d.photoPos?.y ?? 50))) },
        order: cleanOrder(d.order, CV_SECTIONS.map(s => s.id)), sections
      };
    }
    const blocks = {};
    for (const b of LETTER_BLOCKS) blocks[b.id] = { on: d.blocks?.[b.id]?.on === undefined ? b.on !== false : Boolean(d.blocks[b.id].on), text: str(d.blocks?.[b.id]?.text, 1500) };
    const r = d.recipient || {};
    const show = {};
    for (const o of LETTER_OPTIONAL) show[o.id] = d.show?.[o.id] === undefined ? !['ref', 'ps'].includes(o.id) : Boolean(d.show[o.id]);
    return {
      ...common, layout: pick(d.layout, LETTER_LAYOUTS.map(l => l.id), 'fr'), type: pick(d.type, Object.keys(LETTER_TYPES), 'pfmp'),
      justify: d.justify !== false,
      person: { first: str(p.first, 60), last: str(p.last, 60), title: str(p.title, 120), email: str(p.email, 120), phone: str(p.phone, 30), address: str(p.address, 160), city: str(p.city, 80) },
      recipient: { company: str(r.company, 120), contact: str(r.contact, 120), service: str(r.service, 120), address: str(r.address, 160), city: str(r.city, 80) },
      place: str(d.place, 60), date: str(d.date, 40), object: str(d.object, 200), ref: str(d.ref, 80), ps: str(d.ps, 400), pj: str(d.pj, 120),
      sign: { mode: pick(d.sign?.mode, ['typed', 'drawn', 'image'], 'typed'), image: cleanImage(d.sign?.image, 120000) },
      show, order: cleanOrder(d.order, LETTER_BLOCKS.map(b => b.id)), blocks
    };
  }

  // Textes de la lettre (pour le correcteur et le compteur de mots).
  const words = text => (String(text || '').match(/[\p{L}\p{N}’'-]+/gu) || []).length;
  function letterWords(d) { return d.order.filter(id => d.blocks[id].on).reduce((n, id) => n + words(d.blocks[id].text), 0); }
  // Score de complétude du CV (0 à 100) et conseils.
  function cvScore(d) {
    const tips = [];
    let score = 0;
    const p = d.person;
    if (p.first && p.last) score += 10; else tips.push('Indiquez votre prénom et votre nom.');
    if (p.title) score += 10; else tips.push('Ajoutez un titre sous votre nom (ex. : « Électricien · recherche stage PFMP »).');
    if (p.email && p.phone) score += 10; else tips.push('Un e-mail et un téléphone sont indispensables.');
    if (/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(p.email || '') || !p.email) score += 0; else tips.push('L’adresse e-mail semble incorrecte.');
    const on = id => d.sections[id].on;
    if (on('profil') && d.sections.profil.text.trim().length > 60) score += 15; else tips.push('Rédigez un profil de 2 à 3 phrases.');
    const exp = d.sections.experiences.items.filter(i => i.title.trim());
    if (on('experiences') && exp.length) score += 15; else tips.push('Ajoutez au moins une expérience (stage, job d’été).');
    if (exp.length && exp.every(i => i.desc.trim())) score += 10; else if (exp.length) tips.push('Décrivez vos missions sous chaque expérience.');
    if (on('formation') && d.sections.formation.items.some(i => i.title.trim())) score += 10; else tips.push('Indiquez votre formation.');
    if (on('competences') && d.sections.competences.levels.filter(l => l.label.trim()).length >= 3) score += 10; else tips.push('Listez au moins 3 compétences techniques.');
    if (on('habilitations') && d.sections.habilitations.tags.filter(t => t.trim()).length) score += 5; else tips.push('Vos habilitations électriques sont un vrai atout : ajoutez-les.');
    if (d.photo || resolved(d).photo === 'none') score += 5;
    return { score: Math.min(100, score), tips: tips.slice(0, 4) };
  }

  function resolved(d) {
    const t = THEMES.find(x => x.id === d.theme) || THEMES[3];
    return {
      t, accent: d.accent || t.accent, head: FONTS[d.font || t.head], body: FONTS[d.font || t.body],
      photo: d.photoShape || t.photo
    };
  }

  // ───── Fabrication de la page ─────
  function h(tag, cls, ...children) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    for (const child of children.flat(Infinity)) {
      if (child === null || child === undefined || child === false || child === '') continue;
      node.append(typeof child === 'string' ? safe(child) : child);
    }
    return node;
  }
  const ICONS = {
    mail: 'M3 6h18v12H3z M3 6l9 7 9-7', phone: 'M6 3h4l1 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 1v4a2 2 0 0 1-2 2A17 17 0 0 1 4 5a2 2 0 0 1 2-2z',
    pin: 'M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z M12 7.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z', cake: 'M4 21h16v-8H4z M4 16c2.7 1.5 5.3 1.5 8 0s5.3-1.5 8 0 M12 13V9 M12 6.5v-2',
    link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1 M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1'
  };
  function icon(name) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('class', 'od-ico'); svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', ICONS[name]); path.setAttribute('fill', 'none'); path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '2'); path.setAttribute('stroke-linecap', 'round'); path.setAttribute('stroke-linejoin', 'round');
    svg.append(path);
    return svg;
  }
  // Texte sur plusieurs lignes : les lignes commençant par « - » ou « • » deviennent une liste à puces.
  function richText(text, cls = 'od-p') {
    const lines = String(text || '').split('\n').map(l => l.trimEnd()).filter(l => l.trim());
    const out = [];
    let list = null;
    for (const line of lines) {
      const bullet = line.match(/^\s*[-•*]\s+(.*)$/);
      if (bullet) { if (!list) { list = h('ul', 'od-ul'); out.push(list); } list.append(h('li', 'od-keep', h('span', 'od-bullet'), bullet[1])); }
      else { list = null; out.push(h('p', cls + ' od-keep', line)); }
    }
    return out;
  }
  function contactLines(p, withIcons = true) {
    const rows = [['mail', p.email], ['phone', p.phone], ['pin', [p.address, p.city].filter(Boolean).join(', ')], ['cake', p.birth], ['link', p.web]];
    return rows.filter(([, v]) => v && v.trim()).map(([k, v]) => h('div', 'od-contact', withIcons ? icon(k) : null, h('span', 'od-contact-t', v)));
  }
  function photoNode(d, shape) {
    if (!d.photo || shape === 'none') return null;
    const img = document.createElement('img');
    img.className = 'od-photo od-photo-' + shape;
    img.src = d.photo; img.alt = '';
    img.style.objectPosition = (d.photoPos?.x ?? 50) + '% ' + (d.photoPos?.y ?? 50) + '%';
    return img;
  }
  function sectionTitle(d, s) { return (d.sections[s.id].title || '').trim() || s.label; }
  function levelNode(d, l) {
    const name = l.detail || LEVEL_NAMES[l.level];
    if (d.levelStyle === 'text') return h('div', 'od-level od-keep', h('span', 'od-level-l', l.label), h('span', 'od-level-d', ' — ' + name));
    const meter = d.levelStyle === 'dots'
      ? h('div', 'od-dots', [1, 2, 3, 4, 5].map(i => h('span', 'od-dot' + (i <= l.level ? ' on' : ''))))
      : h('div', 'od-bar', h('span', 'od-bar-in'));
    if (d.levelStyle !== 'dots') meter.firstChild.style.width = (l.level * 20) + '%';
    return h('div', 'od-level od-keep', h('div', 'od-level-row', h('span', 'od-level-l', l.label), l.detail ? h('span', 'od-level-d', l.detail) : null), meter);
  }
  function dates(i) { return [i.start, i.end].filter(x => x && x.trim()).join(' – '); }
  function sectionBody(d, s, opts = {}) {
    const x = d.sections[s.id];
    if (s.type === 'text') return x.text.trim() ? richText(x.text) : null;
    if (s.type === 'tags') {
      const tags = x.tags.filter(t => t.trim());
      if (!tags.length) return null;
      if (opts.inline) return h('p', 'od-p od-keep', tags.join(' · '));
      if (s.id === 'habilitations' || s.id === 'liens' || s.id === 'permis') return h('ul', 'od-ul od-ul-side', tags.map(t => h('li', 'od-keep', h('span', 'od-bullet'), t)));
      return h('div', 'od-tags od-keep', tags.map(t => h('span', 'od-tag', t)));
    }
    if (s.type === 'levels') {
      const levels = x.levels.filter(l => l.label.trim());
      if (!levels.length) return null;
      if (opts.inline) return h('p', 'od-p od-keep', levels.map(l => l.label + ' (' + (l.detail || LEVEL_NAMES[l.level]).toLowerCase() + ')').join(' · '));
      return h('div', 'od-levels', levels.map(l => levelNode(d, l)));
    }
    if (s.type === 'refs') {
      const items = x.items.filter(i => i.name.trim());
      if (!items.length) return null;
      return h('div', 'od-refs', items.map(i => h('div', 'od-ref od-keep', h('strong', 'od-item-t', i.name), h('div', 'od-item-o', [i.role, i.org].filter(Boolean).join(' · ')), i.contact ? h('div', 'od-item-m', i.contact) : null)));
    }
    const items = x.items.filter(i => i.title.trim() || i.org.trim() || i.desc.trim());
    if (!items.length) return null;
    return h('div', 'od-items' + (opts.timeline ? ' od-timeline' : ''), items.map(i => h('div', 'od-item od-keep',
      opts.timeline ? h('div', 'od-item-date', dates(i)) : null,
      h('div', 'od-item-body', opts.timeline ? h('span', 'od-tl-dot') : null,
        h('div', 'od-item-head', h('strong', 'od-item-t', i.title), !opts.timeline && dates(i) ? h('span', 'od-item-date', dates(i)) : null),
        i.org || i.place ? h('div', 'od-item-o', [i.org, i.place].filter(x => x && x.trim()).join(' · ')) : null,
        i.desc.trim() ? h('div', 'od-item-d', richText(i.desc, 'od-p')) : null))));
  }
  function section(d, s, opts = {}) {
    const body = sectionBody(d, s, opts);
    if (!body) return null;
    const node = h('section', 'od-sec od-sec-' + s.zone + ' od-sec-' + s.id + (opts.card ? ' od-card' : ''), h('h2', 'od-h od-keep od-keep-next', resolved(d).t.title === 'code' ? h('span', 'od-code-mark', '> ') : null, sectionTitle(d, s)), body);
    return node;
  }
  function visibleSections(d, zone) {
    return d.order.map(id => CV_SECTIONS.find(s => s.id === id)).filter(s => s && d.sections[s.id].on && (!zone || s.zone === zone));
  }
  function nameBlock(p, cls = '') {
    return h('div', 'od-namebox ' + cls, h('h1', 'od-name', h('span', 'od-first', p.first), p.first && p.last ? ' ' : '', h('span', 'od-last', p.last)), p.title ? h('p', 'od-title', p.title) : null);
  }
  function applyVars(page, d, r) {
    page.style.setProperty('--a', r.accent);
    page.style.setProperty('--side', r.t.side);
    page.style.setProperty('--side-ink', r.t.sideInk);
    page.style.setProperty('--ff-h', r.head);
    page.style.setProperty('--ff-b', r.body);
    // Couleur d'accent lisible sur fond clair (titres) : le orange du thème pro devient bleu nuit pour les titres.
    page.style.setProperty('--a-ink', r.t.id === 'pro' && !d.accent ? '#0f2846' : r.accent);
    const dark = isDark(r.t.side);
    page.classList.toggle('od-side-dark', dark);
    page.classList.toggle('od-side-tinted', r.t.side !== '#ffffff');
  }
  function isDark(hex) {
    const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    return (0.299 * r + 0.587 * g + 0.114 * b) < 140;
  }
  function renderCv(d, options = {}) {
    d = clean('cv', d);
    const r = resolved(d);
    const page = h('div', 'od-page od-cv od-l-' + d.layout + ' od-t-' + r.t.id + ' od-title-' + r.t.title + (r.t.caps ? ' od-caps' : '') + ' od-lv-' + d.levelStyle + ' od-d-' + d.density);
    applyVars(page, d, r);
    page.style.setProperty('--k', String(options.scale || 1));
    const p = d.person;
    const photo = () => photoNode(d, r.photo);
    const mainSecs = (opts) => visibleSections(d, 'main').map(s => section(d, s, opts));
    const sideSecs = (opts) => visibleSections(d, 'side').map(s => section(d, s, opts));
    const L = d.layout;
    if (L === 'lateral' || L === 'lateral-d') {
      const side = h('aside', 'od-side', photo(), h('div', 'od-contacts', contactLines(p)), sideSecs());
      const main = h('main', 'od-main', nameBlock(p), mainSecs());
      page.append(h('div', 'od-grid', L === 'lateral' ? [side, main] : [main, side]));
    } else if (L === 'ats') {
      page.append(h('header', 'od-head od-head-ats', nameBlock(p, 'od-center'), h('div', 'od-contacts od-contacts-line', contactLines(p, false))),
        h('main', 'od-main od-one', mainSecs(), sideSecs({ inline: true })));
    } else if (L === 'bandeau') {
      page.append(h('header', 'od-band', photo(), h('div', 'od-band-txt', nameBlock(p), h('div', 'od-contacts od-contacts-line', contactLines(p)))),
        h('div', 'od-grid od-grid-band', h('main', 'od-main', mainSecs()), h('aside', 'od-side od-side-plain', sideSecs())));
    } else if (L === 'deux') {
      const left = visibleSections(d, 'main').filter(s => s.id !== 'formation').map(s => section(d, s));
      const right = [section(d, CV_SECTIONS.find(s => s.id === 'formation')), ...sideSecs()].filter(Boolean);
      if (!d.sections.formation.on) right.shift();
      page.append(h('header', 'od-head od-head-two', nameBlock(p), photo(), h('div', 'od-contacts od-contacts-line', contactLines(p))),
        h('div', 'od-grid od-grid-two', h('main', 'od-main', left), h('aside', 'od-side od-side-plain', d.sections.formation.on ? right : right)));
    } else if (L === 'frise') {
      page.append(h('header', 'od-head od-head-frise', photo(), nameBlock(p), h('div', 'od-contacts od-contacts-line', contactLines(p))),
        h('div', 'od-grid od-grid-frise', h('main', 'od-main', visibleSections(d, 'main').map(s => section(d, s, { timeline: s.type === 'list' }))), h('aside', 'od-side od-side-soft', sideSecs())));
    } else {
      page.append(h('header', 'od-head od-head-bento', photo(), nameBlock(p), h('div', 'od-contacts od-contacts-line', contactLines(p))),
        h('div', 'od-grid od-grid-bento', h('div', 'od-col', mainSecs({ card: true })), h('div', 'od-col', sideSecs({ card: true }))));
    }
    return page;
  }

  // ───── Lettre de motivation ─────
  function longDate(value) {
    if (value && value.trim()) return value;
    return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
  }
  function renderLetter(d, options = {}) {
    d = clean('lm', d);
    const r = resolved(d);
    const page = h('div', 'od-page od-lm od-ll-' + d.layout + ' od-t-' + r.t.id + ' od-title-' + r.t.title + (r.t.caps ? ' od-caps' : '') + (d.justify ? ' od-justify' : ''));
    applyVars(page, d, r);
    page.style.setProperty('--k', String(options.scale || 1));
    const p = d.person, rc = d.recipient, show = d.show, L = d.layout;
    const sender = () => h('div', 'od-sender od-keep', h('strong', 'od-sender-n', [p.first, p.last].filter(Boolean).join(' ')), p.address ? h('div', '', p.address) : null, p.city ? h('div', '', p.city) : null, p.phone ? h('div', '', p.phone) : null, p.email ? h('div', '', p.email) : null);
    const recipient = () => show.destinataire && (rc.company || rc.contact || rc.address) ? h('div', 'od-recipient od-keep', rc.company ? h('strong', '', rc.company) : null, rc.service ? h('div', '', rc.service) : null, rc.contact ? h('div', '', rc.contact) : null, rc.address ? h('div', '', rc.address) : null, rc.city ? h('div', '', rc.city) : null) : null;
    const date = () => show.date ? h('div', 'od-date od-keep', (d.place ? d.place + ', le ' : 'Le ') + longDate(d.date)) : null;
    const object = () => show.objet && d.object ? h('div', 'od-object od-keep', h('strong', '', 'Objet : '), d.object) : null;
    const ref = () => show.ref && d.ref ? h('div', 'od-ref-line od-keep', 'Réf. : ' + d.ref) : null;
    const body = d.order.filter(id => d.blocks[id].on && d.blocks[id].text.trim()).map(id => h('div', 'od-block od-block-' + id, richText(d.blocks[id].text, 'od-lp')));
    const fullName = [p.first, p.last].filter(Boolean).join(' ');
    let signature = null;
    if (show.signature) {
      const img = d.sign.mode !== 'typed' && d.sign.image ? Object.assign(document.createElement('img'), { className: 'od-sign-img', src: d.sign.image, alt: '' }) : null;
      signature = h('div', 'od-sign od-keep', img, h('div', 'od-sign-n' + (img ? '' : ' od-sign-typed'), fullName));
    }
    const tail = [signature, show.ps && d.ps.trim() ? h('p', 'od-ps od-keep', 'P.-S. : ' + d.ps) : null, show.pj && d.pj.trim() && L !== 'mail' ? h('p', 'od-pj od-keep', d.pj) : null];
    const contactsInline = () => h('div', 'od-contacts od-contacts-line', contactLines(p));
    if (L === 'mail') {
      page.append(h('div', 'od-mail', object() ? h('div', 'od-mail-obj od-keep', h('span', 'od-mail-k', 'Objet'), d.object) : null, ref(), h('div', 'od-body', body), tail[0], h('div', 'od-mail-sig', p.phone ? h('div', '', p.phone) : null, p.email ? h('div', '', p.email) : null), tail[1]));
      return page;
    }
    let head = null;
    if (show.expediteur) {
      if (L === 'bandeau') head = h('header', 'od-band od-band-lm', nameBlock(p), contactsInline());
      else if (L === 'cv') head = h('header', 'od-head od-head-cvlm', nameBlock(p), contactsInline());
      else if (L === 'minimal') head = h('header', 'od-head od-head-min', nameBlock(p, 'od-center'), h('div', 'od-rule'), h('div', 'od-contacts od-contacts-line od-center', contactLines(p, false)));
    }
    const letter = h('div', 'od-letter',
      L === 'fr' && show.expediteur ? sender() : null,
      recipient(), date(), object(), ref(), h('div', 'od-body', body), tail);
    if (L === 'lateral') {
      page.append(h('div', 'od-grid od-grid-lm', show.expediteur ? h('aside', 'od-side', nameBlock(p), h('div', 'od-contacts', contactLines(p))) : h('aside', 'od-side'), h('main', 'od-main', letter)));
    } else page.append(...[head, letter].filter(Boolean));
    return page;
  }

  window.MelecOutilsRendu = {
    PAGE_W, PAGE_H, FONTS, FONT_LABELS, THEMES, THEME_LEVELS, ACCENTS, LAYOUTS, CV_SECTIONS, SUGGESTIONS, LEVEL_NAMES,
    LETTER_LAYOUTS, LETTER_TYPES, LETTER_BLOCKS, LETTER_OPTIONAL,
    safe, clean, newCv, newLetter, emptyItem, letterWords, words, cvScore, resolved, renderCv, renderLetter, isDark
  };
})();
