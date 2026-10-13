(function () {
  'use strict';

  const button = document.getElementById('backupDownload');
  const status = document.getElementById('backupStatus');
  if (!button || !status) return;

  button.addEventListener('click', function () {
    try {
      const raw = localStorage.getItem('melec-evaluation-v1');
      if (!raw) {
        status.textContent = 'Aucune donnée trouvée dans ce navigateur.';
        return;
      }

      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Données enregistrées non reconnues.');
      }

      const blob = new Blob([raw], { type: 'application/json;charset=utf-8' });
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = 'LAtelierMelec-sauvegarde-' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(function () { URL.revokeObjectURL(objectUrl); }, 60000);

      const studentCount = Array.isArray(parsed.students) ? parsed.students.length : 0;
      const activityCount = Array.isArray(parsed.activities) ? parsed.activities.length : 0;
      status.textContent = 'Téléchargement lancé : ' + studentCount + ' élève(s), ' + activityCount + ' activité(s). Vérifiez le dossier Téléchargements.';
    } catch (error) {
      status.textContent = 'Sauvegarde impossible. Aucune donnée n’a été modifiée. Signalez-moi le problème.';
      console.error('Sauvegarde LAtelierMelec :', error);
    }
  });
})();
