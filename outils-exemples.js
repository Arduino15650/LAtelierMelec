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
      id: 'pfmp-batiment', name: 'Stage PFMP · électricien bâtiment', who: '1re Bac Pro MELEC', theme: 'pro', layout: 'lateral', cat: 'Profil',
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
      id: 'apprentissage-bts', cat: 'Profil', name: 'Apprentissage · BTS Électrotechnique', who: 'Terminale Bac Pro', theme: 'corporate', layout: 'bandeau',
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
      id: 'premier-emploi-industrie', cat: 'Métier', name: 'Premier emploi · électricien industriel', who: 'Bac Pro obtenu', theme: 'technique', layout: 'deux',
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
      id: 'domotique-reseaux', cat: 'Métier', name: 'Domotique et réseaux (KNX, VDI)', who: 'Profil connecté', theme: 'electro', layout: 'frise',
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
      id: 'photovoltaique-irve', cat: 'Métier', name: 'Photovoltaïque et bornes de recharge', who: 'Transition énergétique', theme: 'foret', layout: 'bento',
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
      id: 'maintenance', cat: 'Métier', name: 'Électricien de maintenance', who: 'Version ATS', theme: 'executif', layout: 'ats',
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
      id: 'parcoursup', cat: 'Profil', name: 'Poursuite d’études · BTS', who: 'Parcoursup', theme: 'classique', layout: 'lateral-d',
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
    ,
    {
      id: 'lyceen', name: 'Lycéen sans expérience', who: '2de Bac Pro MELEC', theme: 'pastel', layout: 'hybride', cat: 'Débutant',
      desc: 'Premier CV : qualités, activités et projet mis en avant à la place de l’expérience.',
      title: 'Élève de seconde Bac Pro MELEC · recherche premier stage',
      profil: 'Élève de seconde Bac Pro MELEC, curieux et appliqué, je découvre le métier d’électricien et je recherche une entreprise pour mon premier stage. J’aime comprendre comment fonctionnent les installations et travailler de mes mains.',
      experiences: [item('Stage d’observation de 3e', 'Électricité Générale du Plateau', 'Mont-Saint-Aignan', 'déc. 2024', '', '- Observation de 5 chantiers de rénovation en maison individuelle\n- Aide à la préparation du matériel et au rangement du dépôt')],
      formation: [item('Bac Pro MELEC (seconde)', 'Lycée professionnel', 'Rouen', '2025', 'en cours', '- Premiers montages : simple allumage, va-et-vient, prise de courant'), item('Diplôme national du brevet', 'Collège', 'Rouen', '2025', '', '')],
      habilitations: ['Habilitation électrique B0 (en cours)', 'Sauveteur secouriste du travail (SST) en cours'],
      competences: [lv('Montages d’éclairage simples', 2), lv('Lecture de schémas simples', 2), lv('Utilisation de l’outillage', 3)],
      savoiretre: ['Curiosité', 'Ponctualité', 'Envie d’apprendre', 'Soin'],
      langues: [FR, lv('Anglais', 2, 'A2')], interets: ['Handball en club', 'Montage d’ordinateurs', 'Aide aux travaux de la maison'],
      on: { projets: true, engagement: true },
      projets: [item('Réparation d’une lampe de bureau', 'Projet personnel', '', '2025', '', '- Remplacement de l’interrupteur et du câble, test avant remise en service')],
      engagement: [item('Bénévole', 'Banque alimentaire de quartier', '', '2024', '', '- Collecte et tri des dons deux samedis par mois')]
    },
    {
      id: 'stage-3e', name: 'Stage de 3e (prépa-métiers)', who: 'Collégien', theme: 'foret', layout: 'centre', cat: 'Débutant',
      desc: 'Un CV court et clair pour trouver un stage d’observation de trois à cinq jours.',
      title: 'Élève de 3e prépa-métiers · recherche un stage d’observation',
      profil: 'Élève de 3e prépa-métiers, je souhaite découvrir le métier d’électricien avant de choisir ma formation. Je suis sérieux, à l’écoute et disponible du 9 au 13 décembre.',
      experiences: [item('Bénévole au tournoi annuel', 'Club de football du quartier', 'Rouen', 'juin 2025', '', '- Installation des buts et du matériel avec les éducateurs\n- Tenue de la buvette avec deux adultes')],
      formation: [item('Classe de 3e prépa-métiers', 'Collège', 'Rouen', '2025', 'en cours', ''), item('Attestation scolaire de sécurité routière (ASSR 2)', 'Collège', '', '2025', '', '')],
      habilitations: [], competences: [lv('Bricolage et petits montages', 2), lv('Utilisation d’outils à main', 2), lv('Travail en équipe', 3)],
      savoiretre: ['Sérieux', 'Politesse', 'Écoute', 'Curiosité'],
      langues: [FR, lv('Anglais', 2, 'A2'), lv('Espagnol', 1, 'A1')], interets: ['Football', 'Construction de maquettes', 'Jeux de logique'],
      on: { habilitations: false, projets: true },
      projets: [item('Maquette de maison éclairée', 'Cours de technologie', '', '2025', '', '- Câblage de 4 LED avec un interrupteur et une pile')]
    },
    {
      id: 'job-ete', name: 'Job d’été ou job étudiant', who: 'Lycéen ou étudiant', theme: 'ocean', layout: 'lateral', cat: 'Débutant',
      desc: 'Pour un emploi saisonnier : disponibilités, polyvalence et fiabilité au premier plan.',
      title: 'Lycéen disponible en juillet et août · job d’été',
      profil: 'Lycéen en Bac Pro MELEC, polyvalent et fiable, je recherche un emploi saisonnier du 1er juillet au 22 août. J’ai déjà travaillé en équipe et je m’adapte vite à un nouveau poste.',
      experiences: [item('Employé polyvalent (job d’été)', 'Supermarché de quartier', 'Rouen', 'juil. 2025', 'août 2025', '- Mise en rayon et réception de 2 livraisons par jour\n- Accueil et renseignement des clients'), item('Aide aux vendanges', 'Domaine viticole', 'Saumur', 'sept. 2024', '', '- Cueillette et transport des caisses dans une équipe de 12 personnes')],
      formation: [item('Bac Pro MELEC', 'Lycée professionnel', 'Rouen', '2024', 'en cours', '')],
      habilitations: ['Sauveteur secouriste du travail (SST)'],
      competences: [lv('Manutention et rangement', 4), lv('Accueil des clients', 3), lv('Petits travaux électriques', 3)],
      savoiretre: ['Fiabilité', 'Endurance', 'Bonne humeur'],
      langues: [FR, lv('Anglais', 3, 'B1')], interets: ['Natation', 'Cuisine'],
      on: { permis: true }, permis: ['Permis AM (scooter)', 'Disponible du 1er juillet au 22 août']
    },
    {
      id: 'interim', name: 'Intérim · missions courtes', who: 'Bac Pro ou CAP', theme: 'chantier', layout: 'competences', cat: 'Métier',
      desc: 'Pour une agence d’intérim : missions courtes regroupées, compétences et habilitations en premier.',
      title: 'Électricien · disponible pour missions d’intérim',
      profil: 'Électricien titulaire du Bac Pro MELEC, habitué aux missions courtes, je m’intègre rapidement dans une équipe et sur un nouveau chantier. Disponible immédiatement, véhiculé.',
      experiences: [item('Électricien (intérim, 3 semaines)', 'Chantier de logements collectifs', 'Le Havre', 'oct. 2026', '', '- Tirage de câbles et pose d’appareillage dans 24 appartements'), item('Aide-électricien (intérim, 2 semaines)', 'Entrepôt logistique', 'Rouen', 'sept. 2026', '', '- Pose de 80 luminaires LED en hauteur, sur nacelle'), item('Électricien stagiaire (PFMP)', 'Entreprise Martin Bâtiment', 'Rouen', 'janv. 2026', 'févr. 2026', '- Installation électrique de 3 maisons individuelles')],
      formation: [item('Bac Pro MELEC', 'Lycée professionnel', 'Rouen', '2023', '2026', '')],
      habilitations: ['Habilitation électrique B1V', 'Habilitation électrique BR', 'CACES R486 (nacelle) catégorie A', 'Travail en hauteur'],
      competences: [lv('Tirage de câbles et appareillage', 4), lv('Éclairage LED', 4), lv('Lecture de plans', 3)],
      savoiretre: ['Adaptabilité', 'Ponctualité', 'Esprit d’équipe'],
      langues: [FR], interets: ['Boxe', 'Mécanique'],
      on: { permis: true }, permis: ['Permis B', 'Véhiculé', 'Mobile sur toute la Normandie']
    },
    {
      id: 'cap', name: 'CAP électricien · premier CV', who: 'CAP électricien', theme: 'sobre', layout: 'lateral-d', cat: 'Débutant',
      desc: 'Simple et direct : formation, stages et savoir-faire de base, sans fioritures.',
      title: 'Titulaire du CAP électricien · recherche premier emploi',
      profil: 'Titulaire du CAP électricien, je recherche un premier poste d’aide-électricien ou d’électricien en bâtiment. Mes stages m’ont appris à travailler proprement et en sécurité.',
      experiences: [item('Électricien stagiaire', 'Entreprise Lefèvre Électricité', 'Évreux', 'mars 2026', 'avril 2026', '- Pose de gaines et de boîtes d’encastrement dans 4 logements\n- Raccordement de prises et d’interrupteurs'), item('Électricien stagiaire', 'Artisan électricien', 'Évreux', 'nov. 2025', 'déc. 2025', '- Remplacement de 3 tableaux électriques anciens')],
      formation: [item('CAP Électricien', 'Lycée professionnel', 'Évreux', '2024', '2026', '')],
      habilitations: ['Habilitation électrique B1V', 'Habilitation électrique BR'],
      competences: [lv('Pose de gaines et d’appareillage', 4), lv('Raccordement de tableaux', 3), lv('Lecture de schémas', 3)],
      savoiretre: ['Soin', 'Ponctualité', 'Respect des consignes'],
      langues: [FR], interets: ['Football', 'Pêche'],
      on: { permis: true }, permis: ['Permis B en cours']
    },
    {
      id: 'reconversion', name: 'Reconversion vers l’électricité', who: 'Adulte en formation', theme: 'ardoise', layout: 'hybride', cat: 'Profil',
      desc: 'Valorise les compétences transférables d’un premier métier et la nouvelle formation.',
      title: 'Électricien en reconversion · ancien technicien logistique',
      profil: 'Après 6 ans dans la logistique, je me reconvertis dans l’électricité, un métier concret qui me passionne. Ma formation récente et mon expérience de la sécurité et du travail en équipe sont des atouts immédiats.',
      experiences: [item('Électricien stagiaire', 'Entreprise de rénovation énergétique', 'Rouen', 'sept. 2026', 'oct. 2026', '- Rénovation électrique complète de 2 appartements\n- Installation de 6 radiateurs à inertie'), item('Chef d’équipe logistique', 'Plateforme de distribution', 'Rouen', '2019', '2025', '- Encadrement de 8 préparateurs de commandes\n- Responsable sécurité de l’équipe : 0 accident en 3 ans')],
      formation: [item('Titre professionnel Électricien d’équipement du bâtiment', 'Centre de formation pour adultes', 'Rouen', '2026', 'en cours', ''), item('Bac Pro Logistique', 'Lycée professionnel', 'Rouen', '2017', '', '')],
      habilitations: ['Habilitation électrique B1V', 'Habilitation électrique BR', 'CACES R489 catégorie 3', 'Sauveteur secouriste du travail (SST)'],
      competences: [lv('Installation électrique résidentielle', 3), lv('Encadrement d’équipe', 4), lv('Organisation et planification', 4), lv('Prévention des risques', 4)],
      savoiretre: ['Maturité', 'Organisation', 'Sens des responsabilités'],
      langues: [FR, lv('Anglais', 3, 'B1')], interets: ['Rénovation de mobilier', 'Course à pied'],
      on: { permis: true }, permis: ['Permis B', 'Véhiculé']
    },
    {
      id: 'france-travail', name: 'Recherche d’emploi · format sobre', who: 'Demandeur d’emploi', theme: 'harvard', layout: 'ats', cat: 'Profil',
      desc: 'Une seule colonne, sans couleur : parfait pour un conseiller France Travail et les plateformes en ligne.',
      title: 'Électricien du bâtiment · recherche CDI ou CDD · disponible',
      profil: 'Électricien du bâtiment diplômé, je recherche un poste en CDI ou CDD dans l’installation ou la rénovation. Disponible immédiatement, mobile sur l’agglomération.',
      experiences: [item('Électricien (CDD de 6 mois)', 'Entreprise générale du bâtiment', 'Rouen', 'janv. 2026', 'juin 2026', '- Installation électrique de 18 logements sociaux\n- Mise en service et autocontrôles avant réception'), item('Électricien stagiaire (PFMP)', 'Entreprise Dupont Électricité', 'Rouen', '2025', '', '- Câblage de tableaux et pose d’appareillage')],
      formation: [item('Bac Pro MELEC', 'Lycée professionnel', 'Rouen', '2022', '2025', '')],
      habilitations: ['Habilitation électrique B2V', 'Habilitation électrique BR'],
      competences: [lv('Installation résidentielle', 4), lv('Mise en service', 3), lv('Lecture de plans', 4)],
      savoiretre: ['Fiabilité', 'Autonomie'], langues: [FR], interets: ['Cyclisme'],
      on: { permis: true }, permis: ['Permis B', 'Véhiculé'], levelStyle: 'text'
    },
    {
      id: 'anglais', name: 'CV en anglais (Resume)', who: 'Candidature à l’étranger', theme: 'executif', layout: 'minimal', cat: 'Pays', lang: 'en', country: 'uk',
      desc: 'Titres en anglais, sans photo ni âge : le format attendu au Royaume-Uni et aux États-Unis.',
      title: 'Electrician · Vocational Baccalaureate in Electrical Engineering',
      profil: 'Motivated electrician with three work placements in residential and industrial installations. Safety-minded, reliable and eager to gain international experience.',
      experiences: [item('Trainee electrician (work placement)', 'Société Industrielle Seine Électrique', 'Rouen, France', 'Jan 2026', 'Feb 2026', '- Wired and labelled 2 control cabinets (PLC, drives)\n- Took part in commissioning a conveyor line'), item('Trainee electrician (work placement)', 'Entreprise Martin Bâtiment', 'Rouen, France', 'May 2025', 'Jun 2025', '- Complete electrical installation of 3 houses\n- Insulation and continuity testing before handover')],
      formation: [item('Vocational Baccalaureate in Electrical Engineering (Bac Pro MELEC)', 'Vocational high school', 'Rouen, France', '2023', '2026', '')],
      habilitations: ['French electrical safety clearance B1V / BR', 'First aid at work (SST)'],
      competences: [lv('Control cabinet wiring', 4), lv('Reading wiring diagrams', 4), lv('Testing and commissioning', 3)],
      savoiretre: ['Reliability', 'Teamwork', 'Safety awareness'],
      langues: [lv('French', 5, 'Native'), lv('English', 3, 'B1')], interets: ['Football', 'Electronics'],
      noPhoto: true
    },
    {
      id: 'canadien', name: 'CV canadien', who: 'Candidature au Québec', theme: 'corporate', layout: 'ats', cat: 'Pays', country: 'ca',
      desc: 'Sans photo ni âge, réalisations chiffrées et section « Compétences clés » : les attentes au Canada.',
      title: 'Électricien · titulaire d’un baccalauréat professionnel français',
      profil: 'Électricien formé en France, je souhaite m’établir au Québec et rejoindre une entreprise en construction résidentielle. J’apporte rigueur, sens de la sécurité et capacité d’adaptation.',
      experiences: [item('Électricien stagiaire', 'Entreprise Martin Bâtiment', 'Rouen (France)', 'mai 2025', 'juin 2025', '- Installation électrique complète de 3 maisons\n- Essais d’isolement et de continuité avant remise des clés'), item('Électricien stagiaire', 'Société Industrielle Seine Électrique', 'Grand-Couronne (France)', 'janv. 2026', 'févr. 2026', '- Câblage de 2 armoires de commande')],
      formation: [item('Baccalauréat professionnel MELEC (équivalence à faire évaluer)', 'Lycée professionnel', 'Rouen (France)', '2023', '2026', '')],
      habilitations: ['Habilitations électriques françaises B1V et BR', 'Secourisme en milieu de travail (SST)'],
      competences: [lv('Câblage résidentiel', 4), lv('Lecture de plans', 4), lv('Essais et mise en service', 3)],
      savoiretre: ['Adaptabilité', 'Esprit d’équipe'],
      langues: [FR, lv('Anglais', 3, 'Intermédiaire')], interets: ['Hockey', 'Randonnée'],
      noPhoto: true, levelStyle: 'text', on: { references: true }, references: [{ name: 'M. Dubois', role: 'Chef de chantier', org: 'Entreprise Martin Bâtiment', contact: 'Disponible sur demande' }]
    },
    {
      id: 'suisse', name: 'CV suisse', who: 'Candidature en Suisse', theme: 'suisse', layout: 'deux', cat: 'Pays', country: 'ch',
      desc: 'Photo, âge, nationalité et permis de travail, certificats cités : les habitudes suisses.',
      title: 'Électricien de montage · Bac Pro MELEC (France)',
      profil: 'Électricien de montage formé en France, je souhaite rejoindre une entreprise en Suisse romande. Précis et fiable, je respecte les normes et les délais.',
      experiences: [item('Électricien stagiaire', 'Entreprise Martin Bâtiment', 'Rouen (France)', '05.2025', '06.2025', '- Installation complète de 3 maisons individuelles'), item('Électricien stagiaire', 'Société Industrielle Seine Électrique', 'Grand-Couronne (France)', '01.2026', '02.2026', '- Câblage de 2 armoires de commande')],
      formation: [item('Baccalauréat professionnel MELEC', 'Lycée professionnel', 'Rouen (France)', '2023', '2026', '- Certificats de stage disponibles sur demande')],
      habilitations: ['Habilitations électriques françaises B1V et BR'],
      competences: [lv('Installations intérieures', 4), lv('Lecture de schémas', 4), lv('Mise en service', 3)],
      savoiretre: ['Précision', 'Ponctualité'],
      langues: [FR, lv('Allemand', 2, 'A2'), lv('Anglais', 3, 'B1')], interets: ['Ski', 'VTT'],
      birth: '19 ans · nationalité française · permis G à demander', on: { permis: true }, permis: ['Permis B']
    },
    {
      id: 'europass', name: 'CV Europass', who: 'Mobilité européenne', theme: 'pastel', layout: 'europass', cat: 'Pays', country: 'eu',
      desc: 'La structure européenne : titres à gauche, niveaux de langue du cadre européen (A1 à C2).',
      title: 'Électricien · Bac Pro MELEC · mobilité Erasmus+',
      profil: 'Électricien en fin de formation, je prépare une mobilité Erasmus+ de 4 semaines dans une entreprise d’électricité en Europe pour découvrir d’autres méthodes de travail.',
      experiences: [item('Électricien stagiaire (PFMP)', 'Entreprise Dupont Électricité', 'Rouen (France)', 'nov. 2025', 'déc. 2025', '- Câblage de 8 tableaux de logements neufs\n- Consignation et essais avant mise sous tension')],
      formation: [item('Baccalauréat professionnel MELEC (niveau 4 du cadre européen)', 'Lycée professionnel', 'Rouen (France)', '2023', '2026', '')],
      habilitations: ['Habilitations électriques B1V et BR', 'Sauveteur secouriste du travail'],
      competences: [lv('Installations électriques', 4), lv('Lecture de schémas', 4), lv('Domotique', 3)],
      savoiretre: ['Ouverture d’esprit', 'Autonomie'],
      langues: [lv('Français', 5, 'Langue maternelle'), lv('Anglais', 3, 'B1'), lv('Espagnol', 2, 'A2')], interets: ['Voyages', 'Photographie'],
      levelStyle: 'text'
    },
    {
      id: 'courants-faibles', name: 'Courants faibles et fibre optique', who: 'Métier', theme: 'electro', layout: 'infographie', cat: 'Métier',
      desc: 'Pour les réseaux, la fibre, la vidéoprotection et le contrôle d’accès.',
      title: 'Technicien courants faibles · fibre optique et réseaux',
      profil: 'Passionné par les réseaux et les systèmes de sécurité, je recherche un poste de technicien courants faibles. Je maîtrise le raccordement fibre et les tests de liaisons.',
      experiences: [item('Technicien fibre (alternance)', 'Opérateur de raccordement fibre', 'Rouen', 'sept. 2025', 'en cours', '- Raccordement de 150 abonnés en fibre optique\n- Soudure et mesures au réflectomètre'), item('Électricien stagiaire (PFMP)', 'Installateur de sécurité', 'Rouen', '2025', '', '- Pose de 12 caméras et d’un contrôle d’accès')],
      formation: [item('Bac Pro MELEC', 'Lycée professionnel', 'Rouen', '2023', '2026', '')],
      habilitations: ['Habilitation électrique B1V', 'Habilitation électrique BR', 'Travail en hauteur', 'Formation fibre optique (FTTH)'],
      competences: [lv('Raccordement fibre et soudure', 4), lv('Réseaux VDI et baies', 4), lv('Vidéoprotection', 3), lv('Contrôle d’accès', 3)],
      savoiretre: ['Minutie', 'Autonomie', 'Sens du client'],
      langues: [FR, lv('Anglais', 3, 'B1')], interets: ['Informatique', 'Escalade'],
      on: { logiciels: true, permis: true }, logiciels: [lv('Réflectomètre et photomètre', 4), lv('Configuration de caméras IP', 3)], permis: ['Permis B']
    },
    {
      id: 'genie-climatique', name: 'Génie climatique et pompes à chaleur', who: 'Métier', theme: 'cuivre', layout: 'asym', cat: 'Métier',
      desc: 'Pour les installateurs de pompes à chaleur, climatisation et chauffage électrique.',
      title: 'Électricien · pompes à chaleur et climatisation',
      profil: 'Électricien intéressé par la transition énergétique, je souhaite me spécialiser dans les pompes à chaleur et la climatisation. Je réalise les raccordements électriques et la mise en service des équipements.',
      experiences: [item('Électricien stagiaire (PFMP)', 'Installateur de pompes à chaleur', 'Caen', 'mars 2026', 'avril 2026', '- Raccordement électrique de 6 pompes à chaleur air-eau\n- Participation aux mises en service et réglages'), item('Électricien stagiaire (PFMP)', 'Entreprise Martin Bâtiment', 'Rouen', '2025', '', '- Installation de radiateurs et de thermostats connectés')],
      formation: [item('Bac Pro MELEC', 'Lycée professionnel', 'Rouen', '2023', '2026', '')],
      habilitations: ['Habilitation électrique B1V', 'Habilitation électrique BR', 'Attestation fluides frigorigènes (en préparation)'],
      competences: [lv('Raccordement de pompes à chaleur', 3), lv('Régulation et thermostats', 3), lv('Chauffage électrique', 4)],
      savoiretre: ['Rigueur', 'Sens du service'],
      langues: [FR, lv('Anglais', 2, 'A2')], interets: ['Bricolage', 'Environnement'],
      on: { permis: true }, permis: ['Permis B en cours']
    }
  ];

  // Exemples de lettres de motivation complètes (entreprises fictives, à adapter).
  const LETTERS = [
    { id: 'l-pfmp', name: 'Stage PFMP', type: 'pfmp', layout: 'fr', theme: 'pro', company: 'Entreprise Dupont Électricité', object: 'Demande de stage (PFMP) du 4 mai au 12 juin',
      accroche: 'Élève en première Bac Pro MELEC, je recherche une entreprise d’accueil pour ma période de formation en milieu professionnel de six semaines, du 4 mai au 12 juin.',
      vous: 'Votre entreprise réalise des installations électriques dans le logement neuf et la rénovation, avec une forte exigence de qualité : c’est exactement l’environnement dans lequel je veux progresser. J’ai notamment remarqué vos chantiers de rénovation de logements anciens, qui demandent méthode et sens du diagnostic.',
      moi: 'Lors de ma première PFMP, j’ai câblé huit tableaux de logements neufs, contrôlés sans réserve. Je suis titulaire des habilitations B1V et BR, je sais lire un schéma et je respecte les règles de consignation. J’ai aussi appris à travailler proprement : repérage des circuits, rangement du chantier et compte rendu à mon tuteur en fin de journée. Au lycée, je réalise actuellement un tableau de répartition complet, du schéma jusqu’aux essais, ce qui m’a appris à vérifier chaque étape avant la mise sous tension.',
      nous: 'Ce stage me permettrait de progresser en mise en service et en domotique, tout en vous apportant mon sérieux, ma ponctualité et mon envie d’apprendre. Je suis prêt à m’adapter à vos horaires et à me déplacer sur vos différents chantiers de l’agglomération.',
      dispo: 'Je suis disponible du 4 mai au 12 juin et je peux me rendre sur vos chantiers en transports en commun ou en scooter. Mon professeur référent se tient à votre disposition pour la convention de stage.',
      conclusion: 'Je serais heureux de vous présenter ma motivation lors d’un entretien, à la date qui vous conviendra.' },
    { id: 'l-3e', name: 'Stage de 3e', type: 'pfmp', layout: 'minimal', theme: 'foret', company: 'Électricité Générale du Plateau', object: 'Demande de stage d’observation du 9 au 13 décembre',
      accroche: 'Élève de 3e prépa-métiers, je dois effectuer un stage d’observation de cinq jours, du 9 au 13 décembre, et je souhaiterais le réaliser dans votre entreprise. Je suis actuellement en classe de 3e prépa-métiers, une classe qui permet de découvrir plusieurs métiers avant de choisir une formation professionnelle.',
      vous: 'Le métier d’électricien m’attire depuis longtemps, et votre entreprise intervient sur des chantiers variés près de chez moi. J’ai lu sur votre site que vous accueillez régulièrement des jeunes en stage, et j’apprécie votre volonté de transmettre votre métier.',
      moi: 'Je suis curieux, poli et à l’écoute. Au collège, j’ai réalisé une maquette de maison éclairée qui m’a donné envie de découvrir le métier en vrai. En technologie, j’ai câblé quatre LED commandées par un interrupteur, et j’aide souvent mon oncle pour de petits travaux à la maison. Je sais écouter les consignes, poser des questions et respecter les règles de sécurité qu’on m’explique.',
      nous: 'Ce stage m’aiderait à confirmer mon choix d’orientation vers un Bac Pro MELEC. Je souhaite observer le travail d’une équipe, comprendre l’organisation d’un chantier et découvrir les outils de l’électricien. Ce que j’apprendrai pendant cette semaine m’aidera à préparer mon dossier d’orientation.',
      dispo: 'Je suis disponible du lundi 9 au vendredi 13 décembre, aux horaires de votre entreprise. Mon collège vous enverra la convention de stage dès votre accord.',
      conclusion: 'Je vous remercie de l’attention portée à ma demande et reste à votre disposition pour vous rencontrer. Je vous remercie par avance pour votre réponse, quelle qu’elle soit.' },
    { id: 'l-ete', name: 'Job d’été', type: 'spontanee', layout: 'bandeau', theme: 'ocean', company: 'Supermarché de quartier', object: 'Candidature pour un emploi saisonnier en juillet et août',
      accroche: 'Lycéen disponible du 1er juillet au 22 août, je vous propose ma candidature pour un emploi saisonnier dans votre magasin. Je recherche un emploi qui me permette de financer mon permis de conduire et de gagner en expérience professionnelle avant ma dernière année de lycée.',
      vous: 'Votre magasin accueille beaucoup de clients l’été et a besoin de renforts fiables : je souhaite en faire partie. Je connais bien votre enseigne, où je fais moi-même mes courses, et j’apprécie l’accueil de vos équipes.',
      moi: 'L’été dernier, j’ai travaillé deux mois comme employé polyvalent : mise en rayon, réception des livraisons et accueil des clients. Je suis ponctuel, endurant et je m’adapte vite. J’ai l’habitude de porter des charges, de travailler debout plusieurs heures et de respecter les consignes d’hygiène et de sécurité. Mes stages en électricité m’ont aussi appris la rigueur et le travail en équipe. Je suis titulaire du certificat de sauveteur secouriste du travail.',
      nous: 'Je peux occuper différents postes selon vos besoins, y compris en horaires décalés. Vous pouvez compter sur ma ponctualité et ma bonne humeur, même pendant les périodes de forte affluence.',
      dispo: 'Je suis disponible du 1er juillet au 22 août, y compris le samedi, et j’habite à dix minutes du magasin.',
      conclusion: 'Je reste à votre disposition pour un entretien et vous remercie de votre attention. Je peux passer au magasin pour vous rencontrer à l’heure qui vous conviendra. Je vous remercie de l’attention portée à ma demande.' },
    { id: 'l-alternance', name: 'Alternance BTS', type: 'apprentissage', layout: 'cv', theme: 'corporate', company: 'Société Industrielle Seine Électrique', object: 'Candidature à un contrat d’apprentissage · BTS Électrotechnique',
      accroche: 'Titulaire du Bac Pro MELEC en juin, je souhaite préparer le BTS Électrotechnique en alternance au sein de votre entreprise, à partir de septembre. Ce projet est mûrement réfléchi : mes stages m’ont confirmé que je voulais devenir technicien en automatisme industriel.',
      vous: 'J’ai découvert votre activité lors de ma PFMP : vos équipes conçoivent et mettent en service des armoires d’automatisme pour l’industrie, un domaine qui me passionne. Votre entreprise forme régulièrement des apprentis et leur confie de vraies responsabilités, ce qui correspond à ma façon d’apprendre.',
      moi: 'J’y ai câblé et repéré deux armoires de commande et participé à la mise en service d’une ligne de convoyage. Je maîtrise la lecture de schémas et je suis titulaire des habilitations B1V, B2V et BR. J’ai mis à jour les schémas après les modifications et appris à suivre une procédure de consignation avant chaque intervention. Au lycée, mon chef-d’œuvre portait sur l’armoire de commande d’un portail automatique, de la conception au câblage.',
      nous: 'L’alternance me permettrait de monter en compétences en automatisme et en distribution d’énergie, tout en devenant rapidement opérationnel dans vos équipes. Je suis motivé pour suivre le rythme de l’alternance et m’investir pleinement dans les projets que vous me confierez.',
      dispo: 'Le rythme de la formation est de deux semaines en entreprise et deux semaines à l’école. Je suis mobile sur toute la zone industrielle et je prépare mon permis B.',
      conclusion: 'Je serais ravi d’échanger avec vous sur ce projet lors d’un entretien. Je vous remercie par avance de l’attention que vous porterez à ma candidature.' },
    { id: 'l-interim', name: 'Agence d’intérim', type: 'spontanee', layout: 'mail', theme: 'chantier', company: 'Agence d’intérim BTP', object: 'Inscription pour des missions d’électricien',
      accroche: 'Électricien titulaire du Bac Pro MELEC, je souhaite m’inscrire dans votre agence pour des missions dans le bâtiment et l’industrie. Je recherche des missions variées pour enrichir mon expérience et découvrir différents types de chantiers.',
      vous: 'Votre agence est reconnue dans le secteur du BTP, et vos missions correspondent à mon profil. Je sais que vos clients attendent des intérimaires opérationnels dès le premier jour, et c’est ce que je souhaite leur apporter.',
      moi: 'J’ai déjà réalisé deux missions d’intérim : tirage de câbles dans 24 appartements et pose de 80 luminaires LED sur nacelle. Je suis titulaire des habilitations B1V et BR et du CACES nacelle. Je m’intègre rapidement dans une nouvelle équipe et je respecte les consignes de chaque chantier : port des équipements de protection, consignation et rangement. Mes PFMP m’ont aussi permis de réaliser l’installation électrique complète de trois maisons individuelles.',
      nous: 'Disponible immédiatement et véhiculé, je peux intervenir sur toute la Normandie. Je suis prêt à accepter des missions courtes comme des missions plus longues, en bâtiment comme en industrie. Je m’engage à respecter les délais de chaque mission et à vous transmettre mes relevés d’heures sans retard.',
      dispo: 'Je suis disponible immédiatement, véhiculé et titulaire du permis B. Je peux vous transmettre rapidement mes attestations d’habilitation et mon CACES.',
      conclusion: 'Je me tiens à votre disposition pour un rendez-vous et vous joins mon CV. Je vous remercie de l’attention portée à ma candidature et reste joignable à tout moment par téléphone.' },
    { id: 'l-emploi', name: 'Premier emploi', type: 'emploi', layout: 'fr', theme: 'executif', company: 'Entreprise générale du bâtiment', object: 'Candidature au poste d’électricien du bâtiment',
      accroche: 'Diplômé du Bac Pro MELEC, je souhaite rejoindre votre entreprise comme électricien du bâtiment. J’ai obtenu mon diplôme en juin et je souhaite désormais mettre en pratique, au quotidien, tout ce que j’ai appris au lycée et en entreprise.',
      vous: 'Vos chantiers de logements collectifs et votre attention portée à la sécurité correspondent à ma façon de travailler. J’ai pu constater, lors d’une visite de chantier avec mon lycée, le sérieux et l’organisation de vos équipes.',
      moi: 'Lors de mes trois PFMP, j’ai installé l’électricité de plusieurs logements, réalisé les autocontrôles avant réception et travaillé en équipe sous la responsabilité d’un chef de chantier. J’ai appris à lire les plans, à réaliser la mise en service et à remplir les fiches d’autocontrôle. Je suis titulaire des habilitations B2V et BR, et j’ai l’habitude de travailler en sécurité sur des chantiers occupés par d’autres corps de métier.',
      nous: 'Je souhaite m’investir durablement dans une entreprise où je pourrai évoluer vers plus de responsabilités. Je suis prêt à suivre les formations nécessaires pour me spécialiser, par exemple en bornes de recharge ou en photovoltaïque. Mon objectif est de devenir chef d’équipe dans quelques années, en m’appuyant sur l’expérience de vos électriciens confirmés.',
      dispo: 'Je suis disponible dès maintenant, mobile sur l’agglomération et titulaire du permis B.',
      conclusion: 'Je serais heureux de vous rencontrer pour vous présenter mon parcours plus en détail. Je vous remercie de l’attention que vous porterez à ma candidature et reste disponible pour un essai sur chantier si vous le souhaitez.' },
    { id: 'l-spontanee', name: 'Candidature spontanée', type: 'spontanee', layout: 'lateral', theme: 'moderne', company: 'Domotique Habitat Services', object: 'Candidature spontanée · électricien domotique',
      accroche: 'Passionné par les maisons connectées, je me permets de vous proposer ma candidature, même si aucun poste n’est publié aujourd’hui. Je termine mon Bac Pro MELEC cette année et je souhaite me spécialiser dans les installations connectées.',
      vous: 'Vos réalisations en domotique KNX m’ont impressionné : c’est la spécialité dans laquelle je souhaite construire ma carrière. J’ai suivi plusieurs de vos réalisations présentées sur votre site : pilotage de l’éclairage, des volets et du chauffage depuis une tablette.',
      moi: 'J’ai programmé une installation KNX de quatorze fonctions pour mon chef-d’œuvre et réalisé le câblage VDI de plusieurs logements en stage. Lors de mon stage, j’ai brassé et testé trois baies VDI et paramétré une supervision avec le client. Je suis curieux, patient avec les clients et à l’aise avec les outils numériques, ce qui est précieux pour expliquer une installation connectée.',
      nous: 'Je peux vous apporter des compétences en domotique et en réseaux, et je suis prêt à me former à vos méthodes. Je souhaite m’investir sur la durée dans une entreprise spécialisée, pour devenir rapidement autonome sur vos chantiers. Je suis également à l’aise pour accompagner les clients dans la prise en main de leur installation, une étape importante pour leur satisfaction.',
      dispo: 'Je suis disponible à partir du mois de juillet, pour un emploi ou un contrat d’apprentissage.',
      conclusion: 'Je reste à votre disposition pour un entretien et vous remercie de l’attention portée à ma candidature. Je peux également vous montrer une vidéo de mon installation KNX si vous le souhaitez.' },
    { id: 'l-offre', name: 'Réponse à une offre', type: 'offre', layout: 'cv', theme: 'ardoise', company: 'Installateur de pompes à chaleur', object: 'Réponse à votre offre « Électricien H/F – génie climatique »', ref: 'Offre n° 2026-118',
      accroche: 'Votre offre d’électricien en génie climatique, publiée le 18 novembre, a retenu toute mon attention : mon profil correspond à vos attentes. Je termine actuellement un contrat dans le bâtiment et je souhaite évoluer vers le génie climatique.',
      vous: 'Vous recherchez un électricien capable de raccorder et de mettre en service des pompes à chaleur : c’est précisément ce que j’ai fait lors de ma dernière PFMP. Votre engagement dans les énergies renouvelables et la qualité de vos installations m’ont convaincu de vous écrire.',
      moi: 'J’ai raccordé six pompes à chaleur air-eau et participé à leurs réglages. Je suis titulaire des habilitations B1V et BR et je prépare l’attestation fluides frigorigènes. J’ai aussi installé des radiateurs et des thermostats connectés, ce qui m’a appris les bases de la régulation. Rigoureux, je vérifie chaque raccordement et je prends le temps d’expliquer le fonctionnement de l’équipement au client.',
      nous: 'Rejoindre votre équipe me permettrait de me spécialiser dans un secteur d’avenir, en vous apportant rigueur et sens du service. Je suis prêt à me former aux spécificités de vos équipements et à passer l’attestation de manipulation des fluides frigorigènes. Je partage aussi votre souci du travail bien fait : un équipement bien raccordé et bien expliqué, c’est un client satisfait.',
      dispo: 'Je suis disponible dès la fin de mon contrat actuel et je peux me déplacer sur l’ensemble de votre secteur d’intervention.',
      conclusion: 'Je serais heureux de vous présenter ma motivation lors d’un entretien. Je vous remercie de l’attention portée à ma candidature.' },
    { id: 'l-etudes', name: 'Poursuite d’études', type: 'etudes', layout: 'minimal', theme: 'classique', company: 'Lycée – section BTS Électrotechnique', object: 'Candidature en BTS Électrotechnique',
      accroche: 'Élève de terminale Bac Pro MELEC, je souhaite intégrer votre section de BTS Électrotechnique à la rentrée prochaine. Ce choix s’inscrit dans un projet professionnel précis, construit au fil de mes stages et de mes échanges avec des techniciens.',
      vous: 'Votre BTS est réputé pour ses projets industriels et ses partenariats avec les entreprises de la région. J’ai assisté à la journée portes ouvertes et les projets présentés par les étudiants m’ont donné envie de rejoindre votre section.',
      moi: 'Mes résultats en enseignement professionnel (16 sur 20) et mon chef-d’œuvre sur un éclairage solaire autonome montrent ma motivation pour la conception d’installations. Mes trois PFMP en bâtiment et en industrie m’ont appris à travailler en équipe et en sécurité. J’ai aussi été délégué de classe pendant deux ans, ce qui m’a appris à m’organiser et à prendre la parole.',
      nous: 'Je suis prêt à fournir le travail nécessaire pour réussir en BTS, notamment en mathématiques et en sciences physiques. Je souhaite à terme devenir technicien en bureau d’études, et votre formation est la meilleure étape pour y parvenir. Je sais que le BTS demande beaucoup d’autonomie, et je m’y prépare déjà en approfondissant les mathématiques chaque semaine.',
      dispo: 'Je joins à ce dossier mes bulletins de première et de terminale ainsi que l’avis de mon professeur principal.',
      conclusion: 'Je vous remercie de l’attention que vous porterez à ma candidature. Je serais heureux de vous présenter mon projet lors d’un entretien si votre procédure de recrutement le prévoit.' },
    { id: 'l-reconversion', name: 'Reconversion', type: 'emploi', layout: 'fr', theme: 'ardoise', company: 'Entreprise de rénovation énergétique', object: 'Candidature au poste d’électricien en rénovation',
      accroche: 'Après six années dans la logistique, je me reconvertis dans l’électricité et termine un titre professionnel d’électricien d’équipement du bâtiment. Ce changement de métier est l’aboutissement d’un projet construit pendant deux ans, avec un bilan de compétences et plusieurs stages d’immersion.',
      vous: 'Votre entreprise accompagne les particuliers dans la rénovation énergétique, un domaine utile et concret qui me motive. Vos chantiers chez les particuliers demandent écoute et explication, deux qualités que j’ai développées dans mon premier métier.',
      moi: 'J’apporte une solide expérience de l’encadrement et de la sécurité, et ma formation m’a permis de rénover entièrement deux appartements. Pendant six ans, j’ai encadré une équipe de huit personnes et veillé au respect des règles de sécurité, sans aucun accident en trois ans. Pendant ma formation, j’ai rénové l’installation électrique de deux appartements et posé six radiateurs à inertie.',
      nous: 'Je souhaite mettre ma maturité et mon organisation au service de vos chantiers. Ma reconversion est un choix réfléchi : je souhaite m’engager durablement et évoluer dans votre entreprise. Mon expérience de l’encadrement me permettra, à terme, d’accompagner les apprentis et de coordonner les interventions sur vos chantiers.',
      dispo: 'Je termine ma formation fin octobre et je serai disponible dès novembre. Je suis titulaire du permis B et véhiculé. Je peux vous transmettre mes attestations de formation sur simple demande.',
      conclusion: 'Je serais heureux de vous rencontrer pour en discuter. Je vous remercie par avance de l’attention que vous porterez à ma candidature, et reste disponible pour un essai sur chantier.' },
    { id: 'l-anglais', name: 'Cover letter (anglais)', type: 'spontanee', layout: 'minimal', theme: 'executif', lang: 'en', company: 'Bright Spark Electrical Ltd', object: 'Application for a trainee electrician position',
      appel: 'Dear Sir or Madam,',
      accroche: 'I am writing to apply for a trainee electrician position in your company. I am completing a vocational baccalaureate in electrical engineering in France. I will complete my diploma in June and I would like to gain my first professional experience in the United Kingdom.',
      vous: 'Your company is well known for high-quality residential installations, and I would love to learn your working methods. I have read about your recent projects in new-build housing and I admire your focus on quality and safety.',
      moi: 'During my work placements, I wired control cabinets, completed house installations and carried out insulation tests. I am reliable, safety-minded and a good team player. I am trained in reading wiring diagrams, safe isolation procedures and testing before energising a circuit. I hold French electrical safety clearances B1V and BR, and a first aid at work certificate.',
      nous: 'Working with you would help me improve my English and my technical skills, while bringing motivation and care to your team. I am ready to adapt to British wiring regulations and to learn from experienced electricians in your team. I am also keen to discover how electrical work is organised on British sites and to share what I have learnt in France.',
      dispo: 'I am available from July for a period of up to three months, and I can provide references from my placement supervisors.',
      conclusion: 'I would welcome the opportunity to discuss my application with you. Thank you for considering my application. I look forward to hearing from you.', politesse: 'Yours faithfully,' }
  ];
  function letterFromExample(id, person = {}, base) {
    const ex = LETTERS.find(l => l.id === id) || LETTERS[0];
    const d = R.newLetter(person, ex.type);
    d.layout = ex.layout; d.theme = ex.theme; d.lang = ex.lang || 'fr';
    if (base) Object.assign(d.person, Object.fromEntries(Object.entries(base.person || {}).filter(([k, v]) => v && k in d.person)));
    d.recipient.company = ex.company; d.object = ex.object;
    if (ex.ref) { d.ref = ex.ref; d.show.ref = true; }
    if (ex.dispo) d.blocks.dispo.on = true;
    for (const key of ['appel', 'accroche', 'vous', 'moi', 'nous', 'dispo', 'conclusion', 'politesse']) {
      const block = R.LETTER_BLOCKS.find(b => b.id === key);
      d.blocks[key].text = ex[key] || block.model || '';
    }
    if (ex.lang === 'en') d.pj = 'Enclosure: CV';
    return R.clean('lm', d);
  }
  function sampleLetter(id) {
    const d = letterFromExample(id, { first: 'Lucas', last: 'Martin', email: 'lucas.martin@exemple.fr' });
    Object.assign(d.person, { phone: '06 12 34 56 78', address: '12 rue des Lilas', city: '76000 Rouen' });
    d.recipient.city = '76000 Rouen'; d.place = 'Rouen';
    return d;
  }

  // Crée les données d'un CV à partir d'un exemple, avec l'identité de l'élève.
  function cvFromExample(id, person = {}) {
    const ex = EXAMPLES.find(e => e.id === id) || EXAMPLES[0];
    const d = R.newCv(person);
    d.theme = ex.theme; d.layout = ex.layout; d.person.title = ex.title; d.lang = ex.lang || 'fr'; d.country = ex.country || 'fr';
    if (ex.birth) d.person.birth = ex.birth;
    if (ex.noPhoto) d.photoShape = 'none';
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
  // Galerie de modèles : chaque organisation déclinée en 16 styles originaux (thème, palette, polices).
  const STYLES = [
    { id: 'atelier', name: 'Atelier', cat: 'Professionnel', theme: 'pro' },
    { id: 'marine', name: 'Marine et doré', cat: 'Classique', theme: 'corporate', palette: 'marine-dore', head: 'playfair', body: 'sourcesans' },
    { id: 'sobre', name: 'Sobre', cat: 'Simple', theme: 'sobre' },
    { id: 'nordique', name: 'Nordique', cat: 'Moderne', theme: 'nordique' },
    { id: 'sarcelle', name: 'Sarcelle', cat: 'Moderne', theme: 'moderne', head: 'montserrat', body: 'opensans' },
    { id: 'corail', name: 'Graphite et corail', cat: 'Original', theme: 'graphite' },
    { id: 'securite', name: 'Jaune sécurité', cat: 'Original', theme: 'chantier' },
    { id: 'electro', name: 'Électro', cat: 'Original', theme: 'electro' },
    { id: 'elegant', name: 'Élégant', cat: 'Classique', theme: 'elegant', head: 'lora', body: 'opensans' },
    { id: 'bordeaux', name: 'Bordeaux', cat: 'Classique', theme: 'bordeaux' },
    { id: 'foret', name: 'Forêt', cat: 'Moderne', theme: 'foret' },
    { id: 'ocean', name: 'Océan', cat: 'Moderne', theme: 'ocean' },
    { id: 'cuivre', name: 'Cuivre', cat: 'Professionnel', theme: 'cuivre' },
    { id: 'executif', name: 'Exécutif', cat: 'Classique', theme: 'executif' },
    { id: 'minuit', name: 'Minuit', cat: 'Original', theme: 'minuit' },
    { id: 'pastel', name: 'Pastel', cat: 'Simple', theme: 'pastel', head: 'poppins', body: 'roboto' }
  ];
  const MODEL_CATS = ['Moderne', 'Simple', 'Classique', 'Professionnel', 'Original'];
  // « Optimisé ATS » : thème sobre ET une seule colonne (lecture sûre par les logiciels de tri).
  const ATS_LAYOUTS = ['ats', 'europass', 'minimal', 'hybride', 'competences'];
  const MODELS = [];
  for (const layout of R.LAYOUTS) for (const style of STYLES) {
    const theme = R.THEMES.find(t => t.id === style.theme);
    const pal = style.palette ? R.PALETTES.find(p => p.id === style.palette) : null;
    MODELS.push({
      id: layout.id + '-' + style.id, name: style.name + ' · ' + layout.name, cat: style.cat, layout: layout.id, ats: Boolean(theme?.ats) && ATS_LAYOUTS.includes(layout.id),
      style: { layout: layout.id, theme: style.theme, accent: pal?.accent || '', sideColor: pal?.side || '', titleColor: pal?.title || '', palette: pal?.id || '', headFont: style.head || '', bodyFont: style.body || '' }
    });
  }
  window.MelecOutilsExemples = { STYLES, MODELS, MODEL_CATS, EXAMPLES, LETTERS, cvFromExample, sampleCv, letterFromExample, sampleLetter };
})();
