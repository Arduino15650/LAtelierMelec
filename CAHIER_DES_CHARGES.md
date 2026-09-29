# Cahier des charges et guide d’utilisation — L’Atelier MELEC

Version du 29 septembre 2026. Périmètre : site BAC PRO MELEC hébergé sur GitHub Pages, espace enseignant, espace élève et services Supabase associés. Ce document décrit le fonctionnement observable dans les fichiers de cette version et les règles attendues. Il ne vaut pas certification de l’état des données de production.

## 1. Objet et publics

L’Atelier MELEC sert à préparer des ressources pédagogiques, organiser des travaux pratiques en atelier, suivre les élèves et consulter les évaluations CCF. Il s’adresse à un enseignant administrateur et aux élèves disposant d’un compte validé. Le site public est accessible depuis `https://arduino15650.github.io/LAtelierMelec/` ; les entrées principales sont `enseignant.html` et `eleve.html`.

Le site est une application web responsive : le code HTML, CSS et JavaScript est publié sur GitHub Pages ; les comptes, les autorisations, les contenus structurés et les fichiers privés relèvent de Supabase. Les courriels de confirmation dépendent de la configuration SMTP du projet Supabase. Aucun serveur d’édition OnlyOffice ou Collabora n’est inclus à ce stade. Les documents bureautiques peuvent être joints, mais ils ne sont pas modifiés directement dans une suite bureautique intégrée.

## 2. Parcours de connexion et rôles

### Enseignant

1. Ouvrir l’espace enseignant et se connecter avec le compte autorisé.
2. Choisir une rubrique dans la navigation principale : Accueil, Activités, Liste des activités, Élèves, Résultats, Récap des CCF, Référentiel ou Manuel numérique · TD · TP.
3. Choisir la classe avant de créer ou consulter des contenus dépendant d’une classe.
4. Utiliser « Actualiser les données » si des modifications faites ailleurs doivent être rechargées.
5. Se déconnecter à la fin de la session. La déconnexion doit ramener à l’accueil sans faire apparaître brièvement un ancien écran de connexion.

Le compte enseignant doit être reconnu côté base (`teacher_accounts`) ; cacher un bouton dans l’interface ne constitue pas une autorisation suffisante.

### Élève

1. Dans l’espace élève, choisir « Inscription » et saisir nom, prénom, classe demandée, adresse e-mail et mot de passe.
2. Confirmer l’adresse à l’aide du message reçu, puis attendre la validation et l’attribution de classe par l’enseignant. En cas de non-réception, vérifier les indésirables et contacter l’enseignant ; ne pas recréer ou supprimer un compte pour contourner le problème sans diagnostic.
3. Se connecter. Les rubriques ne deviennent accessibles qu’après validation du profil et de la classe.
4. Consulter Manuel numérique, Travaux dirigés, TP en atelier, Référentiel, CCF formatif et CCF certificatif selon les droits et l’état du TP.
5. Utiliser « Actualiser » pour récupérer les contenus récents, « Contacter l’enseignant » pour envoyer un message et « Déconnexion » pour quitter l’espace.

Les demandes non validées, comptes bloqués ou dépourvus de classe ne doivent pas accéder aux ressources de la classe. Le compte et son adresse e-mail sont individuels ; un élève ne doit voir ni les données privées ni les évaluations d’un autre élève.

## 3. Gestion des classes, élèves et accès

L’enseignant crée et consulte les classes et leurs listes d’élèves. L’espace « Accès élèves » regroupe les demandes d’inscription, les alertes et les comptes rattachés ; l’enseignant valide la classe et peut gérer un compte bloqué ou révoqué selon les commandes présentes. Une inscription confirmée par e-mail n’équivaut pas à une attribution de classe validée.

La liste ne doit pas ouvrir toutes les classes ni tous les comptes par défaut lorsqu’aucune sélection n’a été faite. Les compteurs doivent être explicitement définis : « compte rattaché » et « élève de la liste sans compte » ne représentent pas automatiquement deux sous-ensembles d’un même effectif. Un compteur ambigu ou calculé sur des sources différentes doit être masqué ou reformulé, et non additionné.

Deux opérations doivent rester distinctes : retirer ou révoquer l’accès de connexion d’un élève, sans détruire ses évaluations ; supprimer définitivement l’élève de la liste d’une classe, avec confirmation et information claire sur les conséquences. La seconde est une opération destructive. Toute automatisation du renvoi de confirmation doit être limitée au compte concerné, traçable et protégée contre les envois répétés. Ce renvoi était une demande fonctionnelle antérieure ; sa disponibilité dans l’interface n’est pas attestée par ce document.

## 4. Activités et évaluations en atelier

L’enseignant crée une activité, la rattache à une classe ou un groupe, sélectionne les élèves concernés et définit les compétences évaluées. Les vues « Toutes les activités créées », « Activités à évaluer » et « Activités évaluées » ont des significations différentes. Une fois un élève évalué sur une activité, il ne doit plus apparaître comme élève restant à évaluer pour cette activité ; l’évaluation doit rester consultable/corrigeable dans la vue des activités évaluées. Ne pas créer une troisième liste redondante « élèves déjà évalués ».

L’évaluation peut comprendre des niveaux de compétence, une note sur 20 et une appréciation. Les résultats et le récapitulatif CCF affichent les compétences avec une couleur de niveau lisible. Le Récap CCF est réservé à l’espace enseignant. Côté élève, seuls CCF formatif et CCF certificatif sont proposés et seules ses propres évaluations doivent être visibles. La consultation enseignant doit distinguer clairement activités, classe, groupe, élève, date, type de CCF et bilan.

Les grands tableaux CCF doivent pouvoir défiler horizontalement sans imposer de descendre tout en bas de la page : un moyen de défilement doit rester disponible au milieu de la page. Les listes déroulantes d’élèves doivent rester au premier plan et ne pas être masquées derrière les tableaux.

## 5. Manuel numérique et travaux dirigés

### Organisation et création côté enseignant

Le constructeur est organisé par **classe → thème → chapitre → leçon**. Une leçon possède des sections distinctes :

| Rubrique enseignant | Section créée | Rubrique élève |
| --- | --- | --- |
| Manuel numérique | Cours | Manuel numérique |
| Travaux dirigés | Travaux dirigés | Travaux dirigés |
| Travaux dirigés → Correction des TD | Correction | Travaux dirigés → Correction des TD |

L’ancien menu autonome « Cours et TD » n’est pas le point d’entrée du constructeur actuel. Les TD et exercices appartiennent à la même famille pédagogique. Le cours ne doit pas se mélanger aux TD dans la présentation élève.

À l’ouverture des capsules Manuel numérique et Travaux dirigés, l’écran invite à « Choisir un thème » ; il ne sélectionne pas automatiquement le premier thème. L’enseignant peut créer autant de thèmes, chapitres et leçons que nécessaire dans les limites de capacité du service. Le choix d’un autre élément lorsque l’éditeur comporte des modifications non enregistrées doit donner lieu à un avertissement.

La palette d’édition permet la saisie et la mise en forme de texte, des listes, titres, alignements, couleurs, surlignage, tableaux dimensionnés en lignes/colonnes, vidéos et images intégrées dans le texte. Des PDF et fichiers bureautiques peuvent être joints. Les images doivent s’afficher dans la leçon et dans sa prévisualisation, y compris lorsqu’elles sont au format PNG. L’éditeur et la prévisualisation doivent utiliser toute la largeur utile et laisser le texte revenir naturellement à la ligne.

Le flux de publication comporte plusieurs niveaux : enregistrer la leçon, publier les sections concernées, puis vérifier que thème, chapitre et leçon sont publiés. Une section « brouillon » ne doit pas être visible côté élève. Publier un cours ne publie pas implicitement un TD ou sa correction ; la publication des corrections est un choix distinct. La prévisualisation doit montrer le rendu avant publication, sans exposer le brouillon aux élèves.

### Consultation côté élève

Le manuel et les TD sont séparés en deux capsules et deux vues. Chaque vue comprend un sommaire permanent organisé en thèmes, chapitres et leçons. Une leçon est une page logique autonome, avec navigation vers la précédente et la suivante. Dans Travaux dirigés, l’élève peut passer de « Travaux dirigés » à « Correction des TD » lorsque cette dernière est publiée et autorisée. Les pièces intégrées au manuel sont présentées en lecture ; l’interface élève ne doit pas proposer de bouton de téléchargement des ressources du manuel.

La sélection, la copie et les téléchargements sont freinés dans l’interface du manuel/TD. Cette protection est dissuasive uniquement : elle ne peut pas empêcher les captures d’écran, l’inspection du navigateur ou la copie par un autre appareil. Les droits de lecture réels doivent être assurés côté Supabase, pas seulement par du CSS ou du JavaScript.

## 6. Travaux pratiques en atelier et chronomètre

L’enseignant crée un TP, joint son PDF et éventuellement un dossier technique, publie le TP puis associe les comptes élèves autorisés. La liste des TP reste non sélectionnée par défaut. L’enseignant peut consulter, modifier, masquer, supprimer et gérer les associations. Une suppression de TP doit être confirmée, car elle peut retirer des fichiers et des réponses liés.

Dans l’espace élève, ouvrir la capsule « TP en atelier » **ne démarre pas** l’épreuve. Un TP attribué présente un bouton explicite « Ouvrir le TP et démarrer 3 h 30 ». C’est cette action qui fixe l’heure de début. Avant ce démarrage, Manuel numérique, TD, Référentiel et CCF restent accessibles. Lorsqu’un TP est effectivement en cours, ces autres rubriques deviennent indisponibles jusqu’à l’échéance. Après les 210 minutes initiales, le TP est verrouillé ; l’enseignant peut accorder une prolongation. Le verrouillage doit être appliqué à la fois dans l’interface et dans les règles d’accès aux données/fichiers. Un simple clic sur la capsule TP ou l’absence de TP attribué ne doit jamais désactiver les autres menus.

Pendant le temps autorisé, l’élève consulte le PDF et peut utiliser les outils de réponse/annotation prévus. La logique d’ouverture, du chronomètre, des réponses et de la prolongation est indépendante du constructeur de manuel et ne doit pas être modifiée par les changements de mise en page.

## 7. Référentiel et CCF côté élève

Le référentiel BAC PRO MELEC présente les blocs professionnels, activités/tâches, compétences et critères. Il doit utiliser des couleurs cohérentes et des contrastes suffisants. Les volets CCF formatif et certificatif affichent exclusivement les résultats de l’élève connecté, les compétences évaluées, leur niveau/valeur, la note et l’appréciation lorsqu’elles existent. Le Récap CCF global n’existe pas dans la navigation élève. Ces trois rubriques ne sont bloquées que par un TP réellement actif, pas par l’ouverture de la page TP.

## 8. Interface, accessibilité et adaptation aux écrans

La navigation repose sur des capsules colorées ; chaque vue reprend une nuance de la capsule active. Les cartes utilisent des couleurs différenciées, avec contraste élevé pour les textes, états actifs clairement visibles et tailles de police homogènes. Le fond illustré de l’espace élève reste derrière le contenu : il ne doit pas réduire la lisibilité des formulaires, messages ou leçons. Les blocs de lecture doivent être suffisamment opaques et dimensionnés pour PC, tablette et smartphone.

Le site doit rester utilisable au clavier : focus visible, boutons clairement nommés, formulaires étiquetés, ordre de tabulation cohérent. Les images informatives reçoivent un texte alternatif. Les tableaux et documents larges disposent d’un défilement horizontal contrôlé ; les menus déroulants ne doivent pas être coupés. À 320 px, aucune commande essentielle ne doit sortir de l’écran. Le zoom du navigateur modifie naturellement la taille perçue ; un changement de zoom ne doit pas être confondu avec une régression de CSS.

## 9. Données, sécurité et architecture technique

L’application frontale est statique. Supabase Auth gère la connexion ; Postgres conserve notamment comptes enseignants, profils élèves, classes, contenus, affectations de TP et données d’évaluation. Les fichiers privés sont conservés dans Supabase Storage, notamment dans le bucket `melec-private` pour les ressources du manuel. Les tables du manuel (`manual_themes`, `manual_chapters`, `manual_lessons`, `manual_sections`, `manual_assets`) sont séparées des anciens contenus `learning_*`. La sécurité attendue est l’activation de la Row Level Security sur les tables concernées, avec accès enseignant limité aux opérations autorisées et accès élève limité à sa classe, aux contenus publiés, à ses propres résultats et à l’état du TP.

Une clé publique utilisable par le navigateur peut se trouver dans le client ; aucune clé `service_role`, mot de passe SMTP ou autre secret ne doit être publié sur GitHub Pages. Les emails de confirmation dépendent de l’authentification et du SMTP configuré dans Supabase ; la délivrabilité doit être vérifiée avec les journaux de courrier et les adresses des élèves, sans exposer leurs données personnelles dans les dépôts publics.

Le service worker améliore le chargement des ressources statiques. À chaque livraison de scripts modifiés, son numéro de cache et les paramètres de version des scripts doivent être cohérents, afin d’éviter un mélange d’ancienne et de nouvelle interface. Une erreur réseau, un délai dépassé dans Supabase ou une session expirée doit produire un message compréhensible et une possibilité de relancer le chargement ; l’écran ne doit pas rester indéfiniment sur « Chargement des contenus… ».

## 10. Exploitation et publication

Une livraison comporte un dossier daté `FICHIERS_GITHUB`, une liste précise des fichiers à déposer à la racine du dépôt et, si nécessaire, un script SQL séparé. Le travail local n’est pas automatiquement publié. Pour une modification de la base, sauvegarder avant toute suppression, examiner les effets des clés étrangères et exécuter le SQL dans le projet Supabase correct. Une publication GitHub Pages ne remplace pas une migration SQL.

Procédure de recette après livraison : vérifier l’URL déployée et la version du service worker ; ouvrir l’espace enseignant ; contrôler la navigation et les listes sans écrire de données réelles ; ouvrir l’espace élève avec un compte de test approuvé ; vérifier les rubriques hors TP ; publier/masquer une leçon de test seulement si un environnement de test ou des données jetables ont été expressément prévus ; enfin contrôler le rendu sur PC, tablette et smartphone. Ne pas démarrer un TP réel ni modifier une évaluation d’élève dans le seul but de tester une interface.

## 11. Critères de recette fonctionnelle

| ID | Scénario | Résultat attendu |
| --- | --- | --- |
| R1 | Ouvrir la capsule TP sans TP attribué | Référentiel et deux CCF restent actifs ; aucun chronomètre ne démarre. |
| R2 | Ouvrir la capsule TP avec TP attribué, sans cliquer sur le bouton de démarrage | Les autres rubriques restent accessibles. |
| R3 | Démarrer un TP de test | Heure de début enregistrée ; manuel, TD, référentiel et CCF deviennent indisponibles jusqu’à l’échéance. |
| R4 | Publier thème + chapitre + leçon + cours | Le cours apparaît seulement dans Manuel numérique de la classe autorisée. |
| R5 | Publier un TD sans publier sa correction | Le TD apparaît dans Travaux dirigés ; la correction reste cachée. |
| R6 | Prévisualiser une leçon avec PNG, tableau et texte long | Image visible, tableau lisible, texte fluide sur les trois tailles d’écran. |
| R7 | Changer de thème ou de leçon avec une saisie non enregistrée | Avertissement avant perte des modifications. |
| R8 | Charger une vue élève après actualisation ou reconnexion | Pas de page de connexion fugitive ni de chargement bloqué ; message d’erreur explicite en cas de panne. |
| R9 | Consulter un CCF depuis un compte élève de test | Seules les notes et appréciations de ce compte sont affichées. |
| R10 | Ouvrir les listes d’élèves ou grands tableaux CCF | Aucun menu caché ; défilement horizontal accessible au milieu de la page. |

## 12. Limites et évolutions distinctes

L’édition Word/Excel directement dans la page avec OnlyOffice ou Collabora exigerait un serveur supplémentaire : elle est hors périmètre de cette version GitHub Pages. Une fonction de renvoi du lien de confirmation, la gestion fine de suppression/révocation de compte, les mesures chiffrées de performance et la restauration automatique de données doivent être réceptionnées séparément avant d’être déclarées disponibles. Les essais visuels en production ne remplacent ni une campagne de sécurité, ni un audit des politiques RLS, ni une sauvegarde vérifiée.

Ce document doit être révisé après toute modification majeure des flux d’inscription, des évaluations, du chronomètre TP, de la structure des contenus ou des règles Supabase.

