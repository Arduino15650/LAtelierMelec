/* L'Atelier MELEC : réseau de conducteurs en arrière-plan des espaces enseignant et élève
   (même dessin que la page d'accueil).
   Fluidité : le réseau est dessiné une seule fois, avec ses impulsions figées, puis plus rien ne
   bouge. L'ancienne animation (20 images par seconde sur tout l'écran) occupait à elle seule plus
   de la moitié d'un cœur de processeur en permanence sur les postes sans accélération graphique,
   ce qui ralentissait la saisie, le défilement et l'ouverture des pages. */
(function () {
  'use strict';
  if (window.__melecCircuit) return;
  window.__melecCircuit = true;

  var cv = document.createElement('canvas');
  cv.className = 'melec-circuit';
  cv.setAttribute('aria-hidden', 'true');
  var ctx = cv.getContext && cv.getContext('2d');
  if (!ctx) return;

  function rnd(a, b) { return a + Math.random() * (b - a); }

  function pointAt(p, d) {
    var a0 = 0, P = p.pts;
    for (var i = 1; i < P.length; i++) {
      var a = P[i - 1], b = P[i], s = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (a0 + s >= d) { var k = (d - a0) / s; return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, i]; }
      a0 += s;
    }
    var l = P[P.length - 1]; return [l[0], l[1], P.length - 1];
  }

  function draw() {
    var dpr = Math.min(1.25, window.devicePixelRatio || 1);
    var W = window.innerWidth, H = window.innerHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    var g = 24, cols = Math.floor(W / g), rows = Math.floor(H / g);
    var n = Math.round(Math.min(34, Math.max(10, W * H / 34000)));
    var paths = [];
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
    // Conducteurs et bornes.
    ctx.lineWidth = 1.3; ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(79,179,255,.16)'; ctx.fillStyle = 'rgba(79,179,255,.38)';
    paths.forEach(function (p) {
      ctx.beginPath();
      p.pts.forEach(function (q, k) { if (k) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); });
      ctx.stroke();
      var end = p.pts[p.pts.length - 1]; ctx.beginPath(); ctx.arc(end[0], end[1], 2.4, 0, 6.3); ctx.fill();
    });
    // Impulsions figées : une sur deux conducteurs, à une position au hasard.
    paths.forEach(function (p, index) {
      if (index % 2) return;
      var t = rnd(p.len * 0.3, p.len), tail = 54, col = p.hot ? '255,138,30' : '120,200,255';
      ctx.lineWidth = 2;
      for (var k = 0; k < 5; k++) {
        var d0 = Math.max(0, t - tail * (k + 1) / 5), d1 = Math.max(0, t - tail * k / 5);
        if (d1 <= 0) continue;
        var a = pointAt(p, d0), b = pointAt(p, d1);
        ctx.strokeStyle = 'rgba(' + col + ',' + ((1 - k / 5) * 0.75) + ')';
        ctx.beginPath(); ctx.moveTo(a[0], a[1]);
        for (var j = a[2]; j < b[2]; j++) ctx.lineTo(p.pts[j][0], p.pts[j][1]);
        ctx.lineTo(b[0], b[1]); ctx.stroke();
      }
      var h = pointAt(p, t);
      ctx.fillStyle = 'rgba(' + col + ',.22)'; ctx.beginPath(); ctx.arc(h[0], h[1], 6, 0, 6.3); ctx.fill();
      ctx.fillStyle = 'rgba(' + col + ',1)'; ctx.beginPath(); ctx.arc(h[0], h[1], 2.2, 0, 6.3); ctx.fill();
    });
  }

  function init() {
    document.body.insertBefore(cv, document.body.firstChild);
    draw();
    // Redessiné seulement quand la largeur change (pas à chaque apparition de la barre d'adresse sur mobile).
    var rT, width = window.innerWidth;
    window.addEventListener('resize', function () {
      clearTimeout(rT);
      rT = setTimeout(function () {
        if (Math.abs(window.innerWidth - width) < 2 && cv.height >= window.innerHeight) return;
        width = window.innerWidth; draw();
      }, 250);
    });
  }
  if (document.body) init(); else document.addEventListener('DOMContentLoaded', init);
})();
