/* L'Atelier MELEC : réseau de conducteurs animé en arrière-plan des espaces
   enseignant et élève (même effet que la page d'accueil).
   Allègement sans changer l'aspect :
   - les conducteurs fixes sont dessinés une seule fois sur un calque qui ne change plus ;
   - seules les impulsions sont redessinées, à 14 images par seconde, en n'effaçant que les petites
     zones qu'elles occupaient ;
   - pause quand l'onglet est caché, pendant le défilement et pendant la saisie ;
   - si l'ordinateur peine (images très en retard), le réseau reste affiché sans mouvement ;
     aucune animation si l'utilisateur a demandé moins de mouvement ou sur 2 cœurs ou moins. */
(function () {
  'use strict';
  if (window.__melecCircuit) return;
  window.__melecCircuit = true;

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if ((navigator.hardwareConcurrency || 4) <= 2) reduce = true;

  var base = document.createElement('canvas');
  base.className = 'melec-circuit';
  base.setAttribute('aria-hidden', 'true');
  var bctx = base.getContext && base.getContext('2d');
  if (!bctx) return;
  // Calque des impulsions, au-dessus des conducteurs.
  var layer = document.createElement('canvas');
  layer.className = 'melec-circuit';
  layer.setAttribute('aria-hidden', 'true');
  var ctx = layer.getContext('2d');

  var FPS = 14;
  var W = 0, H = 0, dpr = 1, paths = [], pulses = [], dirty = [];
  var raf = 0, timer = 0, last = 0, pausedUntil = 0, slowFrames = 0, measured = 0;
  function rnd(a, b) { return a + Math.random() * (b - a); }

  function build() {
    dpr = Math.min(1.25, window.devicePixelRatio || 1);
    W = window.innerWidth; H = window.innerHeight;
    base.width = Math.round(W * dpr); base.height = Math.round(H * dpr);
    bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var g = 24, gc = Math.floor(W / g), gr = Math.floor(H / g);
    var n = Math.round(Math.min(34, Math.max(10, W * H / 34000)));
    paths = [];
    for (var i = 0; i < n; i++) {
      var x, y, dir, e = i % 4;
      if (e === 0) { x = 0; y = Math.floor(rnd(1, gr - 1)); dir = 0; }
      else if (e === 1) { x = gc; y = Math.floor(rnd(1, gr - 1)); dir = 2; }
      else if (e === 2) { x = Math.floor(rnd(1, gc - 1)); y = 0; dir = 1; }
      else { x = Math.floor(rnd(1, gc - 1)); y = gr; dir = 3; }
      var pts = [[x * g, y * g]], len = 0, segs = Math.floor(rnd(4, 10));
      for (var s = 0; s < segs; s++) {
        var L = Math.floor(rnd(2, 8)), dx = [1, 0, -1, 0][dir], dy = [0, 1, 0, -1][dir];
        var nx = Math.max(0, Math.min(gc, x + dx * L)), ny = Math.max(0, Math.min(gr, y + dy * L));
        if (nx === x && ny === y) break;
        len += Math.hypot(nx - x, ny - y) * g; x = nx; y = ny; pts.push([x * g, y * g]);
        dir = (dir + (Math.random() < 0.5 ? 1 : 3)) % 4;
      }
      if (pts.length > 1) paths.push({ pts: pts, len: len, hot: Math.random() < 0.28 });
    }
    pulses = paths.map(function (p) { return { p: p, t: rnd(0, p.len), v: rnd(60, 150), box: null }; });
    // Conducteurs fixes : dessinés une fois pour toutes.
    bctx.clearRect(0, 0, W, H);
    bctx.lineWidth = 1.3; bctx.lineJoin = 'round'; bctx.strokeStyle = 'rgba(79,179,255,.16)'; bctx.fillStyle = 'rgba(79,179,255,.38)';
    paths.forEach(function (p) {
      bctx.beginPath();
      p.pts.forEach(function (q, k) { if (k) bctx.lineTo(q[0], q[1]); else bctx.moveTo(q[0], q[1]); });
      bctx.stroke();
      var end = p.pts[p.pts.length - 1]; bctx.beginPath(); bctx.arc(end[0], end[1], 2.4, 0, 6.3); bctx.fill();
    });
    layer.width = base.width; layer.height = base.height;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.lineJoin = 'round';
    ctx.clearRect(0, 0, W, H); dirty = [];
    advance(0); paint();
  }

  function pointAt(p, d) {
    var a0 = 0, P = p.pts;
    for (var i = 1; i < P.length; i++) {
      var a = P[i - 1], b = P[i], s = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (a0 + s >= d) { var k = (d - a0) / s; return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, i]; }
      a0 += s;
    }
    var l = P[P.length - 1]; return [l[0], l[1], P.length - 1];
  }

  // Avance les impulsions et prépare leur tracé (segments de traîne et tête) avec leur cadre.
  function advance(dt) {
    pulses.forEach(function (u) {
      if (!reduce) { u.t += u.v * dt; if (u.t > u.p.len + 60) u.t = -rnd(0, 320); }
      u.parts = null; u.box = null;
      if (u.t < 0) return;
      var tail = 54, parts = [], minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      function grow(q) { if (q[0] < minX) minX = q[0]; if (q[0] > maxX) maxX = q[0]; if (q[1] < minY) minY = q[1]; if (q[1] > maxY) maxY = q[1]; }
      for (var k = 0; k < 5; k++) {
        var d0 = Math.max(0, u.t - tail * (k + 1) / 5), d1 = Math.max(0, u.t - tail * k / 5);
        if (d1 <= 0 || d0 > u.p.len) continue;
        var a = pointAt(u.p, Math.min(d0, u.p.len)), b = pointAt(u.p, Math.min(d1, u.p.len)), line = [a];
        for (var i = a[2]; i < b[2]; i++) line.push(u.p.pts[i]);
        line.push(b); line.forEach(grow);
        parts.push({ line: line, alpha: (1 - k / 5) * 0.75 });
      }
      var head = u.t <= u.p.len ? pointAt(u.p, u.t) : null;
      if (head) grow(head);
      if (minX === Infinity) return;
      u.parts = parts; u.head = head;
      u.box = [minX - 8, minY - 8, maxX + 8, maxY + 8];
    });
  }

  function drawPulse(c, u) {
    var col = u.p.hot ? '255,138,30' : '120,200,255';
    c.lineWidth = 2;
    u.parts.forEach(function (part) {
      c.strokeStyle = 'rgba(' + col + ',' + part.alpha + ')';
      c.beginPath(); c.moveTo(part.line[0][0], part.line[0][1]);
      for (var i = 1; i < part.line.length; i++) c.lineTo(part.line[i][0], part.line[i][1]);
      c.stroke();
    });
    if (u.head) {
      c.fillStyle = 'rgba(' + col + ',.22)'; c.beginPath(); c.arc(u.head[0], u.head[1], 6, 0, 6.3); c.fill();
      c.fillStyle = 'rgba(' + col + ',1)'; c.beginPath(); c.arc(u.head[0], u.head[1], 2.2, 0, 6.3); c.fill();
    }
  }

  // Efface les zones de l'image précédente, puis dessine les impulsions à leur nouvelle place.
  function paint() {
    dirty.forEach(function (box) { ctx.clearRect(box[0], box[1], box[2] - box[0], box[3] - box[1]); });
    dirty = [];
    pulses.forEach(function (u) { if (u.box) { drawPulse(ctx, u); dirty.push(u.box); } });
  }

  // Une image toutes les 1/FPS s, calée sur l'affichage : rien n'est calculé entre deux images.
  function next() { timer = setTimeout(function () { timer = 0; raf = requestAnimationFrame(loop); }, 1000 / FPS); }
  function loop(ts) {
    raf = 0;
    if (document.hidden || reduce) return;
    if (performance.now() < pausedUntil) { last = 0; next(); return; }
    var gap = last ? ts - last : 0;
    var dt = last ? Math.min(0.2, gap / 1000) : 0; last = ts;
    // Ordinateur à la peine : plus de 60 % d'images très en retard sur une minute → réseau figé.
    if (gap) {
      measured++; if (gap > 1000 / FPS * 3) slowFrames++;
      if (measured >= FPS * 60) {
        if (slowFrames > measured * 0.6) { reduce = true; return; }
        measured = 0; slowFrames = 0;
      }
    }
    advance(dt); paint();
    next();
  }
  function start() { if (!raf && !timer && !reduce && !document.hidden) { last = 0; raf = requestAnimationFrame(loop); } }
  function stop() { if (raf) cancelAnimationFrame(raf); if (timer) clearTimeout(timer); raf = 0; timer = 0; }
  // Pendant le défilement ou la saisie, le processeur va d'abord au travail de l'utilisateur.
  function pause() { pausedUntil = performance.now() + 900; }

  function init() {
    document.body.insertBefore(layer, document.body.firstChild);
    document.body.insertBefore(base, layer);
    build(); start();
    var rT, width = window.innerWidth;
    window.addEventListener('resize', function () {
      clearTimeout(rT);
      rT = setTimeout(function () {
        if (Math.abs(window.innerWidth - width) < 2 && H >= window.innerHeight) return;
        width = window.innerWidth; build();
      }, 200);
    });
    window.addEventListener('scroll', pause, { passive: true, capture: true });
    document.addEventListener('keydown', pause, true);
    document.addEventListener('input', pause, true);
    document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); else start(); });
  }
  if (document.body) init(); else document.addEventListener('DOMContentLoaded', init);
})();
