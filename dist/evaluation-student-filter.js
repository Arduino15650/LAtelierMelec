/* Un seul sélecteur d'élèves, cohérent avec le filtre de la liste des activités. */
(function () {
  'use strict';
  const renderGrade = window.grade;
  if (typeof renderGrade !== 'function') return;

  function evaluated(activity, student) {
    return Boolean(activity.evaluationLocks?.[student.id]) || scoreResult(activity, student).count > 0;
  }

  window.grade = grade = function (id) {
    const activity = state.activities.find(item => item.id === id);
    const mode = window.melecActivityEvaluationFilter;
    const matches = student => {
      const done = activity && evaluated(activity, student);
      return mode === 'pending' ? !done : mode === 'evaluated' ? done : true;
    };
    // Garder l'élève en cours de saisie jusqu'au verrouillage de sa fiche.
    const current = state.students.find(item => item.id === gradeStudent);
    if (current && mode === 'pending' && activity?.evaluationLocks?.[current.id]) gradeStudent = '';
    else if (current && mode === 'evaluated' && !matches(current)) gradeStudent = '';
    renderGrade(id);
    const pendingSelect = document.querySelector('#editorView #gradeStudent');
    if (!activity || !pendingSelect) return;
    if (mode !== 'pending' && mode !== 'evaluated') return;
    Array.from(pendingSelect.options).forEach(option => {
      if (!option.value) return;
      const student = state.students.find(item => item.id === option.value);
      if (student && !matches(student) && option.value !== gradeStudent) option.remove();
    });
    if (pendingSelect.options.length === 1) pendingSelect.options[0].textContent =
      mode === 'pending' ? 'Aucun élève à évaluer' : 'Aucune évaluation enregistrée';
    if (mode === 'evaluated') pendingSelect.closest('.field').querySelector('label').textContent = 'Élève évalué';
  };
})();
