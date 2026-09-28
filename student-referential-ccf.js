(function () {
  'use strict';
  const tabs = document.getElementById('studentContentTabs');
  const dashboard = document.getElementById('studentDashboard');
  const lessons = document.getElementById('studentLessonsPane');
  const tp = document.getElementById('studentTpPane');
  if (!tabs || !dashboard || !window.MelecPortal || !window.MELEC) return;

  const labels = {
    reference: 'Référentiel', all: 'Récap CCF',
    formative: 'CCF formatif', certificative: 'CCF certificatif'
  };
  const buttons = new Map();
  const pane = document.createElement('section');
  pane.id = 'studentLearningReferencePane';
  pane.className = 'student-pane';
  pane.hidden = true;
  const title = document.createElement('h2');
  const message = document.createElement('p');
  message.className = 'portal-small';
  message.setAttribute('role', 'status');
  const content = document.createElement('div');
  pane.append(title, message, content);
  dashboard.append(pane);
  let results = null;
  let requestId = 0;

  function element(tag, className, value) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value !== undefined) node.textContent = String(value);
    return node;
  }
  function closeOwnPane() {
    pane.hidden = true;
    buttons.forEach(button => button.classList.remove('active'));
  }
  function view(key) {
    lessons.hidden = true;
    tp.hidden = true;
    pane.hidden = false;
    buttons.forEach((button, name) => button.classList.toggle('active', name === key));
    tabs.querySelector('#studentCoursesTab')?.classList.remove('active');
    tabs.querySelector('#studentTpTab')?.classList.remove('active');
    title.textContent = labels[key];
    message.textContent = '';
    content.replaceChildren();
    if (key === 'reference') renderReference();
    else loadResults(key);
  }

  Object.entries(labels).forEach(([key, label]) => {
    const button = element('button', '', label);
    button.type = 'button';
    button.addEventListener('click', () => view(key));
    tabs.append(button);
    buttons.set(key, button);
  });
  tabs.querySelectorAll('#studentCoursesTab, #studentTpTab').forEach(button => {
    button.addEventListener('click', closeOwnPane, true);
  });
  const watchMainPanes = new MutationObserver(() => {
    if (!lessons.hidden || !tp.hidden) closeOwnPane();
  });
  watchMainPanes.observe(lessons, { attributes: true, attributeFilter: ['hidden'] });
  watchMainPanes.observe(tp, { attributes: true, attributeFilter: ['hidden'] });
  document.getElementById('studentRefresh')?.addEventListener('click', () => {
    results = null;
    closeOwnPane();
  }, true);
  new MutationObserver(() => {
    if (dashboard.hidden || tabs.hidden) {
      requestId++;
      results = null;
      closeOwnPane();
      content.replaceChildren();
    }
  }).observe(dashboard, { attributes: true, attributeFilter: ['hidden'] });

  function renderReference() {
    message.textContent = MELEC.source.title + ' · ' + MELEC.source.publication;
    const blocks = element('details', 'student-reference-fold');
    blocks.append(element('summary', '', 'Blocs professionnels et unités'));
    const blockList = element('div', 'student-reference-grid');
    MELEC.blocks.forEach(block => {
      const card = element('article', 'student-reference-card');
      card.append(element('h3', '', block.id + ' · ' + block.unit + ' — ' + block.label));
      card.append(element('p', '', block.competencies.join(' · ')));
      blockList.append(card);
    });
    blocks.append(blockList);
    content.append(blocks);

    const activities = element('details', 'student-reference-fold');
    activities.append(element('summary', '', 'Activités et tâches professionnelles'));
    MELEC.activities.forEach(activity => {
      const fold = element('details', 'student-reference-subfold');
      fold.append(element('summary', '', activity.id + ' — ' + activity.label));
      const list = element('ul');
      MELEC.tasks.filter(task => task.activity === activity.id).forEach(task => {
        list.append(element('li', '', task.id + ' — ' + task.label));
      });
      fold.append(list);
      activities.append(fold);
    });
    content.append(activities);

    const competencies = element('details', 'student-reference-fold');
    competencies.append(element('summary', '', 'Compétences et critères d’évaluation'));
    MELEC.competencies.forEach(competence => {
      const fold = element('details', 'student-reference-subfold');
      fold.append(element('summary', '', competence.id + ' — ' + competence.label + ' · ' + competence.unit));
      const list = element('ul');
      competence.criteria.forEach(criterion => list.append(element('li', '', criterion)));
      const knowledge = (competence.knowledge || []).map(key => MELEC.knowledge[key]).filter(Boolean);
      if (knowledge.length) fold.append(element('p', 'student-reference-detail', 'Connaissances associées : ' + knowledge.join(' · ')));
      const attitudes = (competence.attitudes || []).map(key => key + ' — ' + (MELEC.attitudes[key] || '')).filter(Boolean);
      if (attitudes.length) fold.append(element('p', 'student-reference-detail', 'Attitudes professionnelles : ' + attitudes.join(' · ')));
      fold.append(list);
      competencies.append(fold);
    });
    content.append(competencies);
    const domains = element('details', 'student-reference-fold');
    domains.append(element('summary', '', 'Domaines de connaissances du BO'));
    const domainList = element('ul');
    Object.values(MELEC.knowledge).forEach(value => domainList.append(element('li', '', value)));
    domains.append(domainList);
    content.append(domains);
  }

  function score(activity) {
    let sum = 0, maximum = 0;
    const perCompetence = new Map();
    (Array.isArray(activity.criteria) ? activity.criteria : []).forEach(key => {
      const value = Number(activity.scores?.[key]);
      if (!Object.prototype.hasOwnProperty.call(activity.scores || {}, key) ||
          !Number.isFinite(value) || value < 0 || value > 4) return;
      const id = String(key).split(':')[0];
      const weight = Number(activity.weights?.[id]) || 1;
      sum += value * weight;
      maximum += 4 * weight;
      const item = perCompetence.get(id) || { sum: 0, maximum: 0 };
      item.sum += value * weight;
      item.maximum += 4 * weight;
      perCompetence.set(id, item);
    });
    return { note: maximum ? 20 * sum / maximum : null, perCompetence };
  }
  async function loadResults(key) {
    const current = ++requestId;
    message.textContent = 'Chargement de vos évaluations…';
    try {
      if (!results) {
        const loaded = await MelecPortal.rest('rpc/melec_own_ccf');
        if (current !== requestId || pane.hidden || dashboard.hidden) return;
        if (!Array.isArray(loaded)) throw new Error('Réponse invalide du serveur.');
        results = loaded;
      }
      if (current !== requestId || pane.hidden) return;
      renderResults(key);
    } catch (error) {
      if (current === requestId) message.textContent =
        'Évaluations indisponibles. Vérifiez que la requête SQL a été installée. ' + error.message;
    }
  }
  function renderResults(key) {
    content.replaceChildren();
    const list = results.filter(activity => key === 'all' ||
      String(activity.situation || '').toLocaleLowerCase('fr') === key);
    message.textContent = list.length ? list.length + ' activité(s) évaluée(s).' :
      'Aucune évaluation personnelle dans cette rubrique.';
    list.forEach(activity => {
      const fold = element('details', 'student-ccf-card');
      const result = score(activity);
      const summary = element('summary');
      summary.append(element('strong', '', activity.title || 'Activité sans titre'));
      summary.append(element('span', '', result.note === null ? '—' : result.note.toFixed(2) + ' / 20'));
      fold.append(summary);
      const body = element('div', 'student-ccf-body');
      body.append(element('p', '', [activity.date, activity.situation].filter(Boolean).join(' · ')));
      const chips = element('div', 'student-ccf-competencies');
      result.perCompetence.forEach((value, id) => {
        chips.append(element('span', '', id + ' · ' + (20 * value.sum / value.maximum).toFixed(1) + ' / 20'));
      });
      body.append(chips);
      ['comment', 'remark', 'appreciation'].forEach((field, index) => {
        const value = activity.feedback?.[field];
        if (value) body.append(element('p', '', ['Commentaire', 'Remarque', 'Appréciation'][index] + ' : ' + value));
      });
      fold.append(body);
      content.append(fold);
    });
  }
})();
