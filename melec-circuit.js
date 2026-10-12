/* L'Atelier MELEC : réseau de conducteurs animé en arrière-plan des espaces
   enseignant et élève (même effet que la page d'accueil).
   Léger : 20 images par seconde au plus, conducteurs fixes mis en cache, pause quand l'onglet est caché,
   aucune animation si l'utilisateur a demandé moins de mouvement. */
(function () {
  'use strict';
  if (window.__melecCircuit) return;
  window.__melecCircuit = true;

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var cv = document.createElement('canvas');
  cv.className = 'melec-circuit';
  cv.setAttribute('aria-hidden', 'true');
  var ctx = cv.getContext && cv.getContext('2d');
  if (!ctx) return;

  var W = 0, H = 0, dpr = 1, paths = [], pulses = [], raf = 0, last = 0, acc = 0, layer = null;
  // Machines modestes (2 cœurs ou moins) : réseau fixe, sans animation.
  if ((navigator.hardwareConcurrency || 4) <= 2) reduce = true;
  var FPS = 20;
  function rnd(a, b) { return a + Math.random() * (b - a); }

  function build() {
    dpr = Math.min(1.25, window.devicePixelRatio || 1);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var g = 24, cols = Math.floor(W / g), rows = Math.floor(H / g);
    var n = Math.round(Math.min(34, Math.max(10, W * H / 34000)));
    paths = [];
    for (var i = 0; i < n; i++) {
      var x, y, dir, e = i % 4;
      if (e === 0) { x = 0; y = Math.floor(rnd(1, rows - 1)); dir = 0; }
      else if (e === 1) { x = cols; y = Math.floor(rnd(1, rows - 1)); dir = 2; }
      else if (e === 2) { x = Math.floor(rnd(1, cols - 1)); y = 0; dir = 1; }
      else { x = Math.floor(rnd(1, cols - 1)); y = rows; dir = 3; }
      var pts = [[x * g, y * g]], len = 0, segs = Math.floor(rnd(4, 10));
      for (var s = 0; s < segs; s++) {
        var L = Math.floor(rnd(2, 8)), dx = [1, 0, -1, 0][dir], dy = [0, 1, 0, -1][dir];
        var nx = Math.max(0, Math.min(cols, x + dx * L)), ny = Math.max(0, Math.min(rows, y + dy * L));
        if (nx === x && ny === y) break;
        len += Math.hypot(nx - x, ny - y) * g; x = nx; y = ny; pts.push([x * g, y * g]);
        dir = (dir + (Math.random() < 0.5 ? 1 : 3)) % 4;
      }
      if (pts.length > 1) paths.push({ pts: pts, len: len, hot: Math.random() < 0.28 });
    }
    pulses = paths.map(function (p) { return { p: p, t: rnd(0, p.len), v: rnd(60, 150) }; });
    // Les conducteurs fixes sont dessinés une seule fois dans un calque mis en cache.
    layer = document.createElement('canvas'); layer.width = cv.width; layer.height = cv.height;
    var lc = layer.getContext('2d'); lc.setTransform(dpr, 0, 0, dpr, 0, 0);
    lc.lineWidth = 1.3; lc.lineJoin = 'round'; lc.strokeStyle = 'rgba(79,179,255,.16)'; lc.fillStyle = 'rgba(79,179,255,.38)';
    paths.forEach(function (p) {
      lc.beginPath();
      p.pts.forEach(function (q, i) { if (i) lc.lineTo(q[0], q[1]); else lc.moveTo(q[0], q[1]); });
      lc.stroke();
      var e = p.pts[p.pts.length - 1]; lc.beginPath(); lc.arc(e[0], e[1], 2.4, 0, 6.3); lc.fill();
    });
    draw(0);
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

  function draw(dt) {
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
    if (layer) ctx.drawImage(layer, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineJoin = 'round';
    if (reduce) return;
    pulses.forEach(function (u) {
      u.t += u.v * dt; if (u.t > u.p.len + 60) u.t = -rnd(0, 320);
      if (u.t < 0) return;
      var tail = 54, col = u.p.hot ? '255,138,30' : '120,200,255';
      ctx.lineWidth = 2;
      for (var k = 0; k < 5; k++) {
        var d0 = Math.max(0, u.t - tail * (k + 1) / 5), d1 = Math.max(0, u.t - tail * k / 5);
        if (d1 <= 0 || d0 > u.p.len) continue;
        var a = pointAt(u.p, Math.min(d0, u.p.len)), b = pointAt(u.p, Math.min(d1, u.p.len));
        ctx.strokeStyle = 'rgba(' + col + ',' + ((1 - k / 5) * 0.75) + ')';
        ctx.beginPath(); ctx.moveTo(a[0], a[1]);
        for (var i = a[2]; i < b[2]; i++) ctx.lineTo(u.p.pts[i][0], u.p.pts[i][1]);
        ctx.lineTo(b[0], b[1]); ctx.stroke();
      }
      if (u.t <= u.p.len) {
        var h = pointAt(u.p, u.t);
        ctx.fillStyle = 'rgba(' + col + ',.22)'; ctx.beginPath(); ctx.arc(h[0], h[1], 6, 0, 6.3); ctx.fill();
        ctx.fillStyle = 'rgba(' + col + ',1)'; ctx.beginPath(); ctx.arc(h[0], h[1], 2.2, 0, 6.3); ctx.fill();
      }
    });
  }

  function loop(ts) {
    var dt = last ? Math.min(0.1, (ts - last) / 1000) : 0; last = ts; acc += dt;
    if (acc >= 1 / FPS || !dt) { draw(acc); acc = 0; }
    raf = requestAnimationFrame(loop);
  }
  function start() { if (!raf && !reduce && !document.hidden) { last = 0; acc = 0; raf = requestAnimationFrame(loop); } }
  function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; }

  function init() {
    document.body.insertBefore(cv, document.body.firstChild);
    build(); start();
    var rT; window.addEventListener('resize', function () { clearTimeout(rT); rT = setTimeout(build, 200); });
    document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); else start(); });
  }
  if (document.body) init(); else document.addEventListener('DOMContentLoaded', init);
})();
