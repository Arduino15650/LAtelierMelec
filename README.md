# LAtelierMelec

Application web BAC PRO MELEC pour créer des activités en atelier, les attribuer à des élèves et saisir leurs évaluations.

## Accès

L'application est publiée avec GitHub Pages. Ouvrez `index.html` pour une utilisation locale ou l'adresse du site publiée pour une utilisation en ligne.

## Données

Les classes, les élèves, les activités et les notes sont enregistrés dans le stockage local du navigateur utilisé. Ils ne sont pas synchronisés entre appareils. Exportez régulièrement une sauvegarde depuis l'application avant de changer d'appareil ou d'effacer les données du navigateur.

Les fichiers de listes d'élèves, documents de travail et données temporaires du dossier d'origine ne font pas partie de ce dépôt public.

## Évaluation

Les niveaux NE, N1, N2, N3 et N4 permettent d'évaluer la maîtrise globale des compétences, les tâches et les critères. NE est exclu du calcul. La note sur 20 est calculée automatiquement à partir des niveaux renseignés et des poids des compétences.

## Tests automatiques

Les tests utilisent l’outil intégré à Node.js (version 20 ou plus), sans aucune dépendance à installer :

```
npm test
```

Ils vérifient la syntaxe de chaque script, la présence des fichiers appelés par les pages, la cohérence du référentiel, le calcul de la note pondérée, l’enregistrement des appréciations, la reprise de session enseignant et la file d’envoi vers Supabase, la fin d’évaluation, la réutilisation d’activité et le téléchargement des fichiers privés. Ils s’exécutent aussi automatiquement sur GitHub à chaque proposition de modification (onglet « Actions »).

## Publication

Le code source reste du HTML, du JavaScript et du CSS classiques : on les modifie directement, sans outil particulier, et le site fonctionne tel quel en local.

À chaque envoi sur `main`, GitHub Actions (onglet « Actions » → « Publication ») lance les tests, puis `npm run build`, qui prépare le dossier `dist/` publié sur GitHub Pages :

- chaque suite de scripts ou de feuilles de style d'une page est regroupée en un fichier compressé, dans le même ordre (la page enseignant passe de 40 fichiers à 6) ;
- le nom de chaque fichier assemblé contient l'empreinte de son contenu : les navigateurs prennent automatiquement la nouvelle version. Les numéros `?v=` n'ont plus besoin d'être mis à jour à la main ;
- le cache hors ligne (`service-worker.js`) change de nom à chaque publication ;
- si un test échoue, rien n'est publié.

Pour vérifier en local : `npm ci`, `npm test`, `npm run build`, puis ouvrir `dist/index.html`.

Réglage nécessaire une seule fois : Settings → Pages → Source : « GitHub Actions ».

## Documents de TP volumineux

- **Compression automatique au dépôt** (`pdf-compress.js`, bibliothèque pdf-lib sous licence MIT chargée seulement à l'enregistrement) : les images des PDF (pages scannées, photos) sont recompressées et ramenées à environ 190 ppp. Le texte, les schémas vectoriels et les zones à remplir restent intacts. Si le gain est faible ou si le PDF ne se relit pas correctement, le fichier d'origine est envoyé. La limite de 20 Mo s'applique après compression.
- **Téléchargement des élèves** : 15 s pour que le serveur commence à répondre, puis aucune limite de durée tant que des données arrivent (abandon après 30 s sans données). La progression s'affiche sur le bouton du document.
