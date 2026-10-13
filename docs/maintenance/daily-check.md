# Contrôle quotidien de LAtelierMelec

Le workflow [Lecture quotidienne Supabase](https://github.com/Arduino15650/LAtelierMelec/actions/workflows/supabase-daily.yml) est programmé chaque jour à **08:19 (Europe/Paris)**. GitHub peut décaler l'heure d'exécution. Il est aussi lançable avec **Run workflow**.

## Base concernée

- Projet Supabase : **bcvhuziwdwaorkxqsrch**.
- URL : https://bcvhuziwdwaorkxqsrch.supabase.co
- Une requête GET appelle uniquement `public.github_daily_health()`, qui renvoie `ok`.
- La clé utilisée est la clé publique du projet. Aucun mot de passe, secret de service ou compte utilisateur n'est nécessaire.

La migration [github_daily_health](../../supabase/migrations/20261013183717_github_daily_health.sql) crée une fonction SQL stable, à droits de l'appelant, sans lecture de table ni écriture. Les fonctions métier, les données, les règles RLS et l'authentification restent inchangées. La migration a été appliquée à cette base lors de l'installation du workflow.

## Étape Réactiver

À chaque exécution, même si la lecture échoue, GitHub reçoit une demande d'activation de ce même workflow et son état `active` est vérifié. Le jeton temporaire GitHub dispose uniquement de `actions: write`. La tâche ne crée aucun commit et ne modifie aucun fichier du site.

Cette mesure est préventive : la documentation GitHub ne garantit pas qu'une activation quotidienne remet à zéro le délai d'inactivité de 60 jours des dépôts publics. Une tâche déjà désactivée ne peut pas se relancer elle-même ; il faut cliquer **Enable workflow**, puis **Run workflow**. De même, une requête par jour ne garantit pas l'absence de mise en pause d'un projet Supabase gratuit ; une base déjà en pause doit être restaurée depuis Supabase.

Documentation : [planification GitHub](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule), [API d'activation](https://docs.github.com/en/rest/actions/workflows#enable-a-workflow), [mise en pause Supabase](https://supabase.com/docs/guides/platform/free-project-pausing).
