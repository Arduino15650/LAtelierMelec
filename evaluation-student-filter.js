/* Sépare les élèves encore à évaluer des évaluations déjà commencées ou verrouillées. */
(function () {
  'use strict';
  const renderGrade = window.grade;
  if (typeof renderGrade !== 'function') return;

  function evaluated(activity, student) {
    return Boolean(activity.evaluationLocks?.[student.id]) || scoreResult(activity, student).count > 0;
  }

  window.grade = grade = function (id) {
    renderGrade(id);
    const activity = state.activities.find(item => item.id === id);
    const pendingSelect = document.querySelector('#editorView #gradeStudent');
    if (!activity || !pendingSelect) return;

    const completed = [];
    Array.from(pendingSelect.options).forEach(option => {
      if (!option.value) return;
      const student = state.students.find(item => item.id === option.value);
      if (student && evaluated(activity, student)) {
        completed.push({id: student.id, name: student.name});
        option.remove();
      }
    });

    if (pendingSelect.options.length === 1 && completed.length) {
      pendingSelect.options[0].textContent = 'Tous les élèves sont déjà évalués';
    }

    if (!completed.length) return;
    const field = document.createElement('div');
    field.className = 'field grade-completed-picker';
    const label = document.createElement('label');
    label.htmlFor = 'gradeCompletedStudent';
    label.textContent = 'Évaluations déjà faites';
    const select = document.createElement('select');
    select.id = 'gradeCompletedStudent';
    select.append(new Option('Consulter ou corriger une évaluation…', ''));
    completed.forEach(student => select.append(new Option(student.name, student.id)));
    select.value = completed.some(student => student.id === gradeStudent) ? gradeStudent : '';
    select.addEventListener('change', event => changeGradeStudent(event.target.value));
    field.append(label, select);
    pendingSelect.closest('.field').after(field);
  };
})();
