// Base commune de l'espace enseignant.
//
// La liste « Élèves par classe » de L'Atelier MELEC est la référence unique des classes et des élèves.
// Ce module la relie aux autres rubriques pour ne jamais avoir à recharger un fichier :
//  - les classes de la liste sont créées automatiquement dans les classes en ligne (TP, PFMP, Magasin, comptes élèves) ;
//  - SUIVI&PFMP reçoit les élèves et classes de la liste (événement « melec-roster-change ») ;
//  - un élève ajouté depuis SUIVI&PFMP rejoint aussi la liste de référence.
(function () {
  'use strict';
  const norm = v => String(v ?? '').trim().toLocaleLowerCase('fr').normalize('NFD').replace(/[̀-ͯ]/g, '');
  const roster = () => (typeof state !== 'undefined' && Array.isArray(state?.students)) ? state.students : [];
  const classNames = () => [...new Map(roster().map(s => String(s.className || '').trim()).filter(Boolean).map(n => [norm(n), n])).values()]
    .sort((a, b) => a.localeCompare(b, 'fr', { numeric: true }));
  const fingerprint = () => roster().map(s => s.id + '|' + s.name + '|' + s.className).join('\n');
  const isOwner = () => !document.body.classList.contains('team-mode') && !document.body.classList.contains('cloud-locked');

  // ───────── Classes en ligne ─────────
  let ensuring = null, ensuredFor = '';
  function ensureClasses(force) {
    const api = window.MelecPortal, wanted = classNames(), key = wanted.map(norm).join('|');
    if (!api || !isOwner() || !wanted.length || (!force && key === ensuredFor)) return Promise.resolve(0);
    return ensuring ||= (async () => {
      try {
        const existing = new Set((await api.rest('teaching_classes?select=name')).map(c => norm(c.name)));
        const missing = wanted.filter(n => !existing.has(norm(n)));
        if (missing.length) await api.rest('teaching_classes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(missing.map(name => ({ name }))) });
        ensuredFor = key;
        if (missing.length) window.dispatchEvent(new CustomEvent('melec-classes-change', { detail: { added: missing } }));
        return missing.length;
      } catch { return 0; } // Hors connexion ou compte sans droit : nouvel essai à la prochaine modification.
      finally { ensuring = null; }
    })();
  }

  // ───────── Élèves venus d'une autre rubrique ─────────
  // students : [{ lastName, firstName, className }] ; renvoie le nombre d'élèves ajoutés à la liste.
  function addStudents(students) {
    if (typeof state === 'undefined' || !Array.isArray(state?.students) || typeof save !== 'function' || !isOwner()) return 0;
    const known = new Set(state.students.map(s => norm(s.name).replace(/[\s'’-]+/g, ' ') + '|' + norm(s.className).replace(/\s+/g, '')));
    let added = 0;
    for (const s of students || []) {
      const className = String(s.className || '').trim(), last = String(s.lastName || '').trim(), first = String(s.firstName || '').trim();
      if (!className || !last) continue;
      const name = (last.toLocaleUpperCase('fr') + ' ' + first).trim(), key = norm(name).replace(/[\s'’-]+/g, ' ') + '|' + norm(className).replace(/\s+/g, '');
      if (known.has(key)) continue;
      known.add(key);
      state.students.push({ id: typeof createId === 'function' ? createId() : 'melec-' + Date.now().toString(36) + Math.random().toString(36).slice(2), name, className });
      added++;
    }
    if (added) save();
    return added;
  }

  // ───────── Détection des changements de la liste ─────────
  let last = '', timer = 0;
  function check() {
    const now = fingerprint();
    if (now === last) return;
    last = now;
    clearTimeout(timer);
    timer = setTimeout(() => { ensureClasses(); window.dispatchEvent(new CustomEvent('melec-roster-change')); }, 400);
  }
  if (typeof save === 'function') {
    const previous = save;
    save = function () { const result = previous.apply(this, arguments); check(); return result; };
  }
  // Données rechargées depuis le cloud (autre poste) : même vérification.
  window.addEventListener('storage', check);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
  setInterval(() => { check(); if (!ensuredFor) ensureClasses(); }, 15000);

  window.MelecRegistre = { roster, classNames, ensureClasses, addStudents, check, norm };
})();
