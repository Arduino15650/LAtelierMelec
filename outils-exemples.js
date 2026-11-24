/* L'Atelier MELEC · Mes outils : exemples de CV professionnels, prêts à adapter.
   Les entreprises et les parcours sont fictifs : l'élève part d'un exemple, puis remplace
   chaque élément par sa propre expérience (un avertissement le rappelle à l'ouverture). */
(function () {
  'use strict';
  const R = window.MelecOutilsRendu;
  if (!R) return;
  const item = (title, org, place, start, end, desc) => ({ title, org, place, start, end, desc });
  const lv = (label, level, detail = '') => ({ label, level, detail });
  const FR = lv('Français', 5, 'Langue maternelle');

  const EXAMPLES = [
    {
      id: 'pfmp-batiment', name: 'Stage PFMP · électricien bâtiment', who: '1re Bac Pro MELEC', theme: 'pro', layout: 'lateral',
      desc: 'Le CV type pour chercher une entreprise de PFMP : stages précédents mis en avant, habilitations bien visibles.',
      title: 'Élève en 1re Bac Pro MELEC · recherche PFMP de 6 semaines',
      profil: 'Élève en première Bac Pro MELEC, rigoureux et à l’aise sur chantier, je recherche une entreprise d’accueil pour ma PFMP du 4 mai au 12 juin. Je souhaite progresser en installation résidentielle et en mise en service.',
      experiences: [
        item('Électricien stagiaire (PFMP)', 'Entreprise Dupont Électricité', 'Rouen', 'nov. 2025', 'déc. 2025', '- Câblage de 8 tableaux de logements neufs, contrôlés sans réserve\n- Pose de gaines ICTA et tirage de câbles sur 2 chantiers\n- Consignation et essais avant mise sous tension avec le chef d’équipe'),
        item('Stage d’observation', 'Normandie Énergies Services', 'Le Havre', 'juin 2025', '', '- Découverte du dépannage chez les particuliers (12 interventions)\n- Préparation du matériel et rangement du véhicule atelier')
      ],
      formation: [item('Bac Pro MELEC', 'Lycée professionnel', 'Rouen', '2025', 'en cours', ''), item('Diplôme national du brevet', 'Collège', 'Rouen', '2025', '', '')],
      habilitations: ['Habilitation électrique B1V', 'Habilitation électrique BR', 'Sauveteur secouriste du travail (SST)'],
      competences: [lv('Câblage d’armoires et de tableaux', 4), lv('Lecture de schémas électriques', 4), lv('Consignation et mise en sécurité', 3), lv('Mesures électriques', 3)],
      savoiretre: ['Rigueur', 'Ponctualité', 'Esprit d’équipe', 'Sens de la sécurité'],
      langues: [FR, lv('Anglais', 2, 'A2')], interets: ['Football en club depuis 6 ans', 'Bricolage électronique'],
      on: { permis: true }, permis: ['Permis AM', 'Mobile sur l’agglomération en transports']
    },
    {
      id: 'apprentissage-bts', name: 'Apprentissage · BTS Électrotechnique', who: 'Terminale Bac Pro', theme: 'corporate', layout: 'bandeau',
      desc: 'Pour décrocher un contrat d’alternance : projet professionnel clair, réalisations chiffrées, sobriété.',
      title: 'Futur apprenti en BTS Électrotechnique · rentrée de septembre',
      profil: 'Titulaire du Bac Pro MELEC en juin, je recherche une entreprise pour préparer le BTS Électrotechnique en alternance (rythme 2 semaines / 2 semaines). Motivé par l’automatisme et la distribution d’énergie, j’apporte trois expériences de terrain et un vrai sens des responsabilités.',
      experiences: [
        item('Électricien stagiaire (PFMP)', 'Société Industrielle Seine Électrique', 'Grand-Couronne', 'janv. 2026', 'févr. 2026', '- Câblage et repérage de 2 armoires de commande (automate, variateurs)\n- Participation aux essais et à la mise en service d’une ligne de convoyage\n- Mise à jour des schémas après modification'),
        item('Électricien stagiaire (PFMP)', 'Entreprise Martin Bâtiment', 'Rouen', 'mai 2025', 'juin 2025', '- Installation électrique complète de 3 maisons individuelles\n- Contrôles de continuité et d’isolement avant réception'),
        item('Job d’été · magasinier', 'Grossiste en matériel électrique', 'Rouen', 'juil. 2025', 'août 2025', '- Préparation de 40 commandes par jour pour les artisans\n- Conseil comptoir sur les références de disjoncteurs et de câbles')
      ],
      formation: [item('Bac Pro MELEC', 'Lycée professionnel', 'Rouen', '2023', '2026', '- Chef-d’œuvre : armoire de commande d’un portail automatique')],
      habilitations: ['Habilitation électrique B1V', 'Habilitation électrique B2V', 'Habilitation électrique BR', 'Sauveteur secouriste du travail (SST)'],
      competences: [lv('Câblage d’armoires industrielles', 4), lv('Automatismes (API, variateurs)', 3), lv('Lecture et mise à jour de schémas', 4), lv('Mise en service et essais', 3)],
      savoiretre: ['Autonomie', 'Rigueur', 'Curiosité', 'Organisation'],
      langues: [FR, lv('Anglais', 3, 'B1')], interets: ['Robotique (club du lycée)', 'Course à pied'],
      on: { logiciels: true, permis: true }, logiciels: [lv('SEE Electrical', 3), lv('TIA Portal (bases)', 2), lv('Word, Excel', 4)], permis: ['Permis B en cours']
    },
    {
      id: 'premier-emploi-industrie', name: 'Premier emploi · électricien industriel', who: 'Bac Pro obtenu', theme: 'technique', layout: 'deux',
      desc: 'Un CV de diplômé, lisible par les logiciels de recrutement, centré sur les résultats.',
      title: 'Électricien industriel · Bac Pro MELEC · disponible immédiatement',
      profil: 'Diplômé du Bac Pro MELEC, je recherche un poste d’électricien en maintenance ou en travaux neufs industriels. Trois PFMP en industrie m’ont appris à intervenir en sécurité sur des installations en production.',
      experiences: [
        item('Électricien (contrat saisonnier)', 'Atelier Électro Normandie', 'Évreux', 'juil. 2026', 'août 2026', '- Remplacement de 25 luminaires et de leurs protections dans un entrepôt\n- Dépannage de moteurs et de départs moteurs (diagnostic, remplacement)\n- Rédaction des comptes rendus d’intervention'),
        item('Électricien stagiaire (PFMP)', 'Usine agroalimentaire', 'Yvetot', 'janv. 2026', 'févr. 2026', '- Maintenance préventive de 12 armoires électriques\n- Thermographie et resserrage des connexions avec le technicien')
      ],
      formation: [item('Bac Pro MELEC, mention bien', 'Lycée professionnel', 'Rouen', '2023', '2026', '')],
      habilitations: ['Habilitation électrique B2V', 'Habilitation électrique BR', 'Habilitation électrique BC', 'CACES R489 cat. 3', 'Travail en hauteur'],
      competences: [lv('Dépannage et diagnostic', 4), lv('Variateurs de vitesse', 3), lv('Maintenance préventive', 4), lv('Lecture de schémas industriels', 4)],
      savoiretre: ['Rigueur', 'Réactivité', 'Sens de la sécurité'],
      langues: [FR, lv('Anglais', 3, 'B1 technique')], interets: ['Mécanique automobile', 'Basket-ball'],
      on: { permis: true, references: true }, permis: ['Permis B', 'Véhiculé'],
      references: [{ name: 'M. Leroy', role: 'Responsable maintenance', org: 'Usine agroalimentaire', contact: 'Coordonnées sur demande' }]
    },
    {
      id: 'domotique-reseaux', name: 'Domotique et réseaux (KNX, VDI)', who: 'Profil connecté', theme: 'electro', layout: 'frise',
      desc: 'Pour les entreprises de bâtiment intelligent : compétences numériques et réalisations en avant.',
      title: 'Électricien · domotique KNX et réseaux VDI',
      profil: 'Passionné par les bâtiments connectés, je recherche une entreprise spécialisée en domotique et réseaux. J’ai programmé une installation KNX complète lors de mon chef-d’œuvre et réalisé le câblage VDI de plusieurs logements.',
      experiences: [
        item('Électricien stagiaire (PFMP)', 'Domotique Habitat Services', 'Caen', 'mars 2026', 'avril 2026', '- Câblage et programmation KNX de 4 pièces (éclairage, volets, chauffage)\n- Brassage et tests de 3 baies VDI grade 3\n- Paramétrage de la supervision sur tablette avec le client'),
        item('Électricien stagiaire (PFMP)', 'Entreprise Dupont Électricité', 'Rouen', 'nov. 2025', 'déc. 2025', '- Installation de prises RJ45 et d’un tableau de communication dans 6 logements')
      ],
      formation: [item('Bac Pro MELEC', 'Lycée professionnel', 'Rouen', '2023', '2026', '- Chef-d’œuvre : maison connectée KNX pilotée par tablette')],
      habilitations: ['Habilitation électrique B1V', 'Habilitation électrique BR'],
      competences: [lv('Domotique KNX', 4), lv('Réseaux VDI', 4), lv('Câblage résidentiel', 4), lv('Paramétrage d’objets connectés', 3)],
      savoiretre: ['Curiosité', 'Patience', 'Sens du contact'],
      langues: [FR, lv('Anglais', 3, 'B1')], interets: ['Programmation Arduino', 'Jeux vidéo de stratégie'],
      on: { logiciels: true, projets: true }, logiciels: [lv('ETS (KNX)', 4), lv('Testeur réseau', 3)],
      projets: [item('Maison connectée KNX', 'Atelier du lycée', '', '2026', '', '- 14 fonctions programmées (éclairage, volets, scénarios)\n- Présentation devant un jury de 3 professionnels')]
    },
    {
      id: 'photovoltaique-irve', name: 'Photovoltaïque et bornes de recharge', who: 'Transition énergétique', theme: 'foret', layout: 'bento',
      desc: 'Pour les métiers des énergies renouvelables : chantiers photovoltaïques et IRVE mis en valeur.',
      title: 'Électricien · photovoltaïque et bornes de recharge (IRVE)',
      profil: 'Attiré par la transition énergétique, je souhaite rejoindre une entreprise spécialisée dans le photovoltaïque et la recharge des véhicules électriques. Je suis à l’aise en hauteur et attentif aux règles de sécurité.',
      experiences: [
        item('Électricien stagiaire (PFMP)', 'Soleil Normand Énergies', 'Dieppe', 'avril 2026', 'mai 2026', '- Pose de 3 installations photovoltaïques de 3 à 9 kWc en toiture\n- Raccordement des onduleurs et des protections côté courant continu\n- Mise en service et explication du suivi de production aux clients'),
        item('Électricien stagiaire (PFMP)', 'Électricité Générale du Littoral', 'Fécamp', 'janv. 2026', 'févr. 2026', '- Installation de 5 bornes de recharge en maison individuelle\n- Création des lignes dédiées et des protections')
      ],
      formation: [item('Bac Pro MELEC', 'Lycée professionnel', 'Rouen', '2023', '2026', '')],
      habilitations: ['Habilitation électrique B1V', 'Habilitation électrique BR', 'Habilitation photovoltaïque BP', 'Travail en hauteur'],
      competences: [lv('Installations photovoltaïques', 4), lv('Bornes de recharge (IRVE)', 3), lv('Protections courant continu', 3), lv('Mesures et mise en service', 4)],
      savoiretre: ['Sens de la sécurité', 'Esprit d’équipe', 'Endurance'],
      langues: [FR, lv('Espagnol', 2, 'A2')], interets: ['Vélo électrique', 'Environnement'],
      on: { permis: true }, permis: ['Permis B', 'Mobile sur la région']
    },
    {
      id: 'maintenance', name: 'Électricien de maintenance', who: 'Version ATS', theme: 'executif', layout: 'ats',
      desc: 'Une seule colonne, sans couleur : le format le plus sûr pour les grandes entreprises et les plateformes.',
      title: 'Électricien de maintenance · Bac Pro MELEC',
      profil: 'Électricien rigoureux, formé à la maintenance préventive et curative des installations industrielles et tertiaires. Je recherche un poste en équipe de maintenance, avec astreintes possibles.',
      experiences: [
        item('Électricien de maintenance (intérim)', 'Agence d’intérim · site logistique', 'Rouen', 'sept. 2026', 'en cours', '- Maintenance de 40 portes sectionnelles et niveleurs de quai\n- Diagnostic de pannes sur automatismes et éclairage\n- Respect du plan de prévention et des consignations'),
        item('Électricien stagiaire (PFMP)', 'Centre hospitalier', 'Rouen', 'janv. 2026', 'févr. 2026', '- Contrôles périodiques des tableaux et des blocs de secours\n- Remplacement de 60 points lumineux par des LED')
      ],
      formation: [item('Bac Pro MELEC', 'Lycée professionnel', 'Rouen', '2023', '2026', '')],
      habilitations: ['Habilitation électrique B2V', 'Habilitation électrique BR', 'Habilitation électrique BC', 'Sauveteur secouriste du travail (SST)'],
      competences: [lv('Maintenance préventive et curative', 4), lv('Diagnostic de pannes', 4), lv('Automatismes', 3), lv('Éclairage de sécurité', 3)],
      savoiretre: ['Réactivité', 'Fiabilité', 'Autonomie'],
      langues: [FR, lv('Anglais', 2, 'A2')], interets: ['Rugby', 'Restauration de scooters'],
      on: { permis: true }, permis: ['Permis B', 'Véhiculé'], levelStyle: 'text'
    },
    {
      id: 'parcoursup', name: 'Poursuite d’études · BTS', who: 'Parcoursup', theme: 'classique', layout: 'lateral-d',
      desc: 'Pour un dossier de poursuite d’études : résultats scolaires, projets et engagements.',
      title: 'Élève de terminale Bac Pro MELEC · candidat en BTS Électrotechnique',
      profil: 'Élève de terminale sérieux et motivé, je souhaite poursuivre en BTS Électrotechnique pour devenir technicien. Mes stages et mon chef-d’œuvre m’ont donné le goût de la conception d’installations.',
      experiences: [item('Électricien stagiaire (PFMP)', 'Entreprise Martin Bâtiment', 'Rouen', 'janv. 2026', 'févr. 2026', '- Réalisation de l’installation d’un local commercial de 120 m²\n- Établissement du métré et de la liste de matériel avec le chef d’équipe')],
      formation: [item('Bac Pro MELEC', 'Lycée professionnel', 'Rouen', '2023', '2026', '- Moyenne générale : 14,5 / 20 · enseignement professionnel : 16 / 20\n- Félicitations du conseil de classe au 1er trimestre')],
      habilitations: ['Habilitation électrique B1V', 'Habilitation électrique BR'],
      competences: [lv('Lecture de schémas', 4), lv('Chiffrage de matériel', 3), lv('Câblage résidentiel et tertiaire', 4)],
      savoiretre: ['Persévérance', 'Organisation', 'Curiosité'],
      langues: [FR, lv('Anglais', 3, 'B1')], interets: ['Échecs', 'Bénévolat aux Restos du cœur'],
      on: { engagement: true, projets: true },
      engagement: [item('Délégué de classe', 'Lycée professionnel', '', '2024', '2026', '- Porte-parole de 24 élèves aux conseils de classe')],
      projets: [item('Chef-d’œuvre : éclairage solaire autonome', 'Atelier du lycée', '', '2025', '2026', '- Dimensionnement du panneau et de la batterie, réalisation et essais')]
    }
  ];

  // Crée les données d'un CV à partir d'un exemple, avec l'identité de l'élève.
  function cvFromExample(id, person = {}) {
    const ex = EXAMPLES.find(e => e.id === id) || EXAMPLES[0];
    const d = R.newCv(person);
    d.theme = ex.theme; d.layout = ex.layout; d.person.title = ex.title;
    if (ex.levelStyle) d.levelStyle = ex.levelStyle;
    const S = d.sections;
    const listOf = items => items.map(i => ({ id: Math.random().toString(36).slice(2, 10), ...i }));
    S.profil.text = ex.profil;
    S.experiences.items = listOf(ex.experiences);
    S.formation.items = listOf(ex.formation);
    S.habilitations.tags = [...ex.habilitations];
    S.competences.levels = ex.competences.map(l => ({ ...l }));
    S.savoiretre.tags = [...ex.savoiretre];
    S.langues.levels = ex.langues.map(l => ({ ...l }));
    S.interets.tags = [...ex.interets];
    for (const [key, on] of Object.entries(ex.on || {})) S[key].on = on;
    if (ex.permis) S.permis.tags = [...ex.permis];
    if (ex.logiciels) S.logiciels.levels = ex.logiciels.map(l => ({ ...l }));
    if (ex.projets) S.projets.items = listOf(ex.projets);
    if (ex.engagement) S.engagement.items = listOf(ex.engagement);
    if (ex.references) S.references.items = ex.references.map(r => ({ id: 'r' + Math.random().toString(36).slice(2, 8), ...r }));
    return R.clean('cv', d);
  }
  // Données d'aperçu (bibliothèque) : un exemple complet avec un nom fictif.
  function sampleCv(id) {
    const d = cvFromExample(id, { first: 'Lucas', last: 'Martin', email: 'lucas.martin@exemple.fr' });
    Object.assign(d.person, { phone: '06 12 34 56 78', city: '76000 Rouen' });
    return d;
  }
  window.MelecOutilsExemples = { EXAMPLES, cvFromExample, sampleCv };
})();
