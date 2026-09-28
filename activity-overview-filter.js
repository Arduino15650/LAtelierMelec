(function () {
  'use strict';

  const root = document.getElementById('activitiesView');
  if (!root || typeof renderActivities !== 'function') return;
  const fullRender = renderActivities;
  const previousShow = show;
  let selection = '';

  function picker() {
    const section = document.createElement('section');
    section.className = 'panel activity-overview-picker';
    section.innerHTML = '<label for="activityOverviewSelection">Afficher les activités</label>' +
      '<select id="activityOverviewSelection"><option value="">Choisir les activités à afficher…</option>' +
      '<option value="all">Toutes les activités créées</option>' +
      '<option value="evaluated">Activités évaluées</option>' +
      '<option value="pending">Activités à évaluer</option></select>' +
      '<button type="button" class="button small primary" onclick="newActivity()">+ Nouvelle activité</button>';
    section.querySelector('select').value = selection;
    section.querySelector('select').addEventListener('change', function (event) {
      selection = event.target.value;
      renderActivities();
    });
    return section;
  }

  function assignedStudents(activity, groupId) {
    const pupils = state.students.filter(function (student) {
      return student.className === activity.className &&
        (activity.audience !== 'students' || (activity.studentIds || []).includes(student.id));
    });
    const groups = (state.studentGroups || []).filter(function (group) {
      return group.className === activity.className;
    });
    if (groupId) {
      const group = groups.find(function (entry) { return entry.id === groupId; });
      return group ? pupils.filter(function (student) {
        return (group.studentIds || []).includes(student.id);
      }) : [];
    }
    const grouped = new Set(groups.flatMap(function (group) { return group.studentIds || []; }));
    return pupils.filter(function (student) { return !grouped.has(student.id); });
  }

  function evaluated(activity, student) {
    return Boolean(activity.evaluationLocks && activity.evaluationLocks[student.id]) ||
      scoreResult(activity, student).count > 0;
  }

  function filterCards() {
    let visible = 0;
    root.querySelectorAll('.activity-card[data-activity-group-id]').forEach(function (card) {
      const action = card.querySelector('button[onclick^="grade("]');
      const id = action && action.getAttribute('onclick').match(/grade\('([^']+)'\)/);
      const activity = id && state.activities.find(function (entry) { return entry.id === id[1]; });
      const pupils = activity ? assignedStudents(activity, card.dataset.activityGroupId) : [];
      const shown = Boolean(activity) && (selection === 'all' ||
        (selection === 'evaluated' && pupils.some(function (student) { return evaluated(activity, student); })) ||
        (selection === 'pending' && pupils.some(function (student) {
          return !evaluated(activity, student);
        })));
      card.hidden = !shown;
      if (shown) visible++;
    });
    root.querySelectorAll('.activity-group-fold').forEach(function (fold) {
      const count = fold.querySelectorAll('.activity-card:not([hidden])').length;
      fold.hidden = count === 0;
      fold.open = false;
      const label = fold.querySelector(':scope > summary span');
      if (label) label.textContent = count + ' activité(s)';
    });
    root.querySelectorAll('.activity-class-group').forEach(function (fold) {
      const cards = Array.from(fold.querySelectorAll('.activity-card:not([hidden])'));
      const ids = new Set(cards.map(function (card) {
        const action = card.querySelector('button[onclick^="grade("]');
        return action && action.getAttribute('onclick');
      }));
      fold.hidden = ids.size === 0;
      fold.open = false;
      const label = fold.querySelector(':scope > summary span');
      if (label) label.textContent = ids.size + ' activité(s)';
    });
    const stats = root.querySelector('.bottom-stats');
    if (stats) stats.hidden = selection !== 'all';
    if (!visible) {
      const empty = document.createElement('p');
      empty.className = 'panel activity-overview-empty';
      empty.textContent = 'Aucune activité dans cette sélection.';
      root.querySelector('.activity-class-list, .panel.empty')?.after(empty);
    }
  }

  renderActivities = function () {
    if (!selection) {
      root.innerHTML = '<div class="page-head activities-page-head"><div><h1>Activités en atelier</h1><p>Choisissez les activités à afficher.</p></div></div>';
      root.appendChild(picker());
      return;
    }
    fullRender();
    root.querySelector('.page-head')?.after(picker());
    filterCards();
  };
  window.renderActivities = renderActivities;

  show = function (name) {
    if (name === 'activities') selection = '';
    return previousShow.apply(this, arguments);
  };
  window.show = show;
  renderActivities();
})();
