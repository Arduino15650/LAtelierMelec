(function () {
  'use strict';
  const tabs = document.getElementById('studentContentTabs');
  const dashboard = document.getElementById('studentDashboard');
  const manual = document.getElementById('studentManualPane');
  const td = document.getElementById('studentTdPane');
  const tp = document.getElementById('studentTpPane');
  if (!tabs || !dashboard || !window.MelecPortal || !window.MELEC) return;

  const labels = {
    reference: 'Référentiel',
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
    if(tabs.dataset.tpActive==='true'||!tp.hidden)return;
    window.MelecManualStudent?.clear();
    manual.hidden = true;
    td.hidden = true;
    tp.hidden = true;
    pane.hidden = false;
    buttons.forEach((button, name) => button.classList.toggle('active', name === key));
    tabs.querySelector('#studentManualTab')?.classList.remove('active');
    tabs.querySelector('#studentTdTab')?.classList.remove('active');
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
  tabs.querySelectorAll('#studentManualTab, #studentTdTab, #studentTpTab').forEach(button => {
    button.addEventListener('click', closeOwnPane, true);
  });
  const watchMainPanes = new MutationObserver(() => {
    const locked=tabs.dataset.tpActive==='true'||!tp.hidden;
    buttons.forEach(button=>{button.disabled=locked;});
    if (locked || !manual.hidden || !td.hidden) { requestId++;closeOwnPane();content.replaceChildren(); }
  });
  watchMainPanes.observe(manual, { attributes: true, attributeFilter: ['hidden'] });
  watchMainPanes.observe(td, { attributes: true, attributeFilter: ['hidden'] });
  watchMainPanes.observe(tp, { attributes: true, attributeFilter: ['hidden'] });
  new MutationObserver(()=>{
    const locked=tabs.dataset.tpActive==='true';
    buttons.forEach(button=>{button.disabled=locked;});
    if(locked){requestId++;closeOwnPane();content.replaceChildren();}
  }).observe(tabs,{attributes:true,attributeFilter:['data-tp-active']});
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

  const levelFactors = { N1: 0, N2: 1 / 3, N3: 2 / 3, N4: 1 };
  function levelFactor(value) {
    if (Object.prototype.hasOwnProperty.call(levelFactors, value)) return levelFactors[value];
    const legacy = { 0: 0, 1: 0, 2: 1 / 3, 3: 2 / 3, 4: 1 };
    return Object.prototype.hasOwnProperty.call(legacy, value) ? legacy[value] : null;
  }
  function score(activity) {
    const scores = activity.scores || {};
    const competencies = (Array.isArray(activity.competencies) ? activity.competencies : []).map(id => {
      const masteryKey = `mastery:${id}`;
      if (scores[masteryKey] === 'NE') return { id, factor: null };
      const tasks = Array.isArray(activity.taskSelections?.[id])
        ? activity.taskSelections[id] : (Array.isArray(activity.tasks) ? activity.tasks : []);
      const criteria = (Array.isArray(activity.criteria) ? activity.criteria : [])
        .filter(key => String(key).split(':')[0] === id);
      const keys = [masteryKey, ...tasks.map(task => `task:${id}:${task}`), ...criteria];
      const factors = keys.map(key => levelFactor(scores[key])).filter(value => value !== null);
      return { id, factor: factors.length
        ? factors.reduce((sum, value) => sum + value, 0) / factors.length : null };
    });
    let sum = 0, weightSum = 0;
    competencies.forEach(item => {
      if (item.factor === null) return;
      const weight = Number(activity.weights?.[item.id]) || 1;
      sum += item.factor * weight;
      weightSum += weight;
    });
    return { note: weightSum ? 20 * sum / weightSum : null, competencies };
  }
  function tone(activity) {
    const key = String(activity.id || activity.title || '');
    let hash = 0;
    for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) | 0;
    return 'student-ccf-tone-' + (Math.abs(hash) % 6);
  }
  function competenceBadge(item) {
    const value = item.factor;
    const level = value === null ? 'none' : value < .25 ? 'red' :
      value < .5 ? 'orange' : value < .75 ? 'green' : 'darkgreen';
    const badge = element('span', 'student-ccf-pill ' + level);
    badge.append(element('strong', '', item.id));
    badge.append(element('small', '', value === null ? '—' : (value * 20).toFixed(1)));
    badge.title = item.id + ' : ' + (value === null ? 'non évaluée' : (value * 20).toFixed(2) + ' / 20');
    return badge;
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
    const list = results.filter(activity => {
      const evaluated = score(activity).note !== null;
      return evaluated && String(activity.situation || '').trim().toLocaleLowerCase('fr') === key;
    });
    message.textContent = list.length ? list.length + ' activité(s) évaluée(s).' :
      'Aucune évaluation personnelle dans cette rubrique.';
    list.forEach(activity => {
      const fold = element('details', 'student-ccf-card ' + tone(activity));
      const result = score(activity);
      const summary = element('summary');
      summary.append(element('strong', '', activity.title || 'Activité sans titre'));
      summary.append(element('span', 'student-ccf-note', result.note.toFixed(2) + ' / 20'));
      fold.append(summary);
      const body = element('div', 'student-ccf-body');
      body.append(element('p', '', [activity.date, activity.situation].filter(Boolean).join(' · ')));
      const chips = element('div', 'student-ccf-competencies');
      result.competencies.forEach(item => chips.append(competenceBadge(item)));
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
