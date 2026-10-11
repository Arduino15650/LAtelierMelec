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
