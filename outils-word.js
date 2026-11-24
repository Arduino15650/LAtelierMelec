// L'Atelier MELEC · Mes outils : export Word (.docx) du CV et de la lettre de motivation.
// Le fichier reprend les textes, les couleurs, les polices (intégrées au fichier), la photo
// et l'organisation générale du document, pour être modifié dans Word, LibreOffice ou Google Docs.
// La bibliothèque docx (licence MIT, fichier docx.min.js) n'est chargée qu'au premier export.
(() => {
  'use strict';
  const R = () => window.MelecOutilsRendu;
  let lib = null;
  function loadDocx() {
    if (window.docx?.Document) return Promise.resolve(window.docx);
    if (!lib) lib = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = './docx.min.js?v=20261124-4';
      script.onload = () => window.docx?.Document ? resolve(window.docx) : reject(new Error('module Word indisponible'));
      script.onerror = () => { lib = null; script.remove(); reject(new Error('module Word indisponible (vérifiez la connexion)')); };
      document.head.append(script);
    });
    return lib;
  }

  // ───── Polices : nom affiché dans Word et fichier intégré ─────
  const WORD_NAMES = { arial: 'Arial', times: 'Times New Roman', courier: 'Courier New' };
  function fontName(key) {
    if (WORD_NAMES[key]) return WORD_NAMES[key];
    const f = R().FONT_LIST.find(x => x[0] === key);
    return f ? f[1].replace(/\s*\(.*\)$/, '') : 'Arial';
  }
  const fontCache = new Map();
  function fontData(key) {
    const f = R().FONT_LIST.find(x => x[0] === key);
    if (!f || !f[3]) return Promise.resolve(null);
    if (!fontCache.has(key)) fontCache.set(key, fetch('./fonts/' + key + '-r.ttf').then(r => (r.ok ? r.arrayBuffer() : null)).then(b => (b ? new Uint8Array(b) : null)).catch(() => null));
    return fontCache.get(key);
  }

  // ───── Images : photo recadrée à la forme choisie, signature ─────
  function loadImage(src) {
    return new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error('image illisible')); img.src = src; });
  }
  function dataBytes(url) {
    const bin = atob(url.split(',')[1]);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  async function photoPng(d, shape, px, border) {
    const img = await loadImage(d.photo);
    const size = 360, c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    g.save();
    g.beginPath();
    if (shape === 'round') g.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    else if (shape === 'rounded' && g.roundRect) g.roundRect(0, 0, size, size, size * 0.075);
    else g.rect(0, 0, size, size);
    g.clip();
    // object-fit: cover avec la position choisie par l'élève.
    const scale = Math.max(size / img.width, size / img.height), w = img.width * scale, h = img.height * scale;
    const px0 = (d.photoPos?.x ?? 50) / 100, py0 = (d.photoPos?.y ?? 50) / 100;
    g.drawImage(img, (size - w) * px0, (size - h) * py0, w, h);
    g.restore();
    if (border) {
      g.lineWidth = size * 0.045; g.strokeStyle = border;
      g.beginPath();
      const m = g.lineWidth / 2;
      if (shape === 'round') g.arc(size / 2, size / 2, size / 2 - m, 0, Math.PI * 2);
      else if (shape === 'rounded' && g.roundRect) g.roundRect(m, m, size - 2 * m, size - 2 * m, size * 0.07);
      else g.rect(m, m, size - 2 * m, size - 2 * m);
      g.stroke();
    }
    const blob = await new Promise(res => c.toBlob(res, 'image/png'));
    return { data: new Uint8Array(await blob.arrayBuffer()), px };
  }
  async function imagePng(src) {
    const img = await loadImage(src);
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    c.getContext('2d').drawImage(img, 0, 0);
    const blob = await new Promise(res => c.toBlob(res, 'image/png'));
    return { data: new Uint8Array(await blob.arrayBuffer()), w: img.width, h: img.height };
  }

  // ───── Construction ─────
  const hex = c => String(c || '#000000').replace('#', '').toUpperCase();
  const INK = '1D2530', MUTED = '5A6573';
  const SIZE = { s: 0.94, m: 1, l: 1.07 }, NAME = { s: 0.82, m: 1, l: 1.18 }, PHOTO = { s: 0.8, m: 1, l: 1.2 };
  const half = pt => Math.round(pt * 2);
  const PAGE = { width: 11906, height: 16838 };

  function makeKit(D, d, r) {
    const k = SIZE[d.textSize] || 1;
    const fonts = { head: fontName(r.headKey), body: fontName(r.bodyKey) };
    const t = R().tr(d);
    const { Paragraph, TextRun, AlignmentType, BorderStyle, ShadingType, TabStopType } = D;
    const run = (text, o = {}) => new TextRun({ text: String(text ?? ''), font: o.font || fonts.body, size: half((o.pt || 10) * k), bold: o.bold, italics: o.italics, color: o.color || INK, allCaps: o.caps, characterSpacing: o.spacing });
    const para = (children, o = {}) => new Paragraph({ children: Array.isArray(children) ? children : [children], alignment: o.align, spacing: { before: o.before ?? 0, after: o.after ?? 60, line: o.line }, indent: o.indent, numbering: o.bullet ? { reference: 'puces', level: 0 } : undefined, tabStops: o.tabs, border: o.border, shading: o.shading, keepNext: o.keepNext, keepLines: true });
    function heading(text, o = {}) {
      const style = r.titleStyle, color = o.dark ? 'FFFFFF' : hex(style === 'caps' ? r.accent : r.title);
      const caps = style !== 'code';
      const runs = [];
      if (style === 'code') runs.push(run('> ', { font: fonts.head, pt: 11.5, bold: true, color: hex(r.accent) }));
      runs.push(run(text, { font: fonts.head, pt: style === 'caps' ? 10.5 : 11, bold: true, color: style === 'pill' ? (o.dark ? hex(r.side) : 'FFFFFF') : color, caps, spacing: style === 'caps' ? 40 : 10 }));
      const line = o.dark ? 'FFFFFF' : hex(r.accent);
      const border = style === 'rule' ? { bottom: { style: BorderStyle.SINGLE, size: 10, color: line, space: 2 } }
        : style === 'caps' && !o.side ? { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'C9CED6', space: 2 } }
          : style === 'bar' ? { left: { style: BorderStyle.SINGLE, size: 24, color: line, space: 6 } } : undefined;
      const shading = style === 'pill' ? { type: ShadingType.CLEAR, color: 'auto', fill: o.dark ? 'FFFFFF' : hex(r.accent) } : undefined;
      return para(runs, { before: o.first ? 0 : 200, after: 100, border, shading, keepNext: true });
    }
    function rich(text, o = {}) {
      const out = [];
      for (const raw of String(text || '').split('\n')) {
        const line = raw.trimEnd();
        if (!line.trim()) continue;
        const b = line.match(/^\s*[-•*]\s+(.*)$/);
        out.push(para(run(b ? b[1] : line, { pt: o.pt || 10, color: o.color }), { bullet: Boolean(b), after: 40, align: o.justify && !b ? AlignmentType.JUSTIFIED : undefined }));
      }
      return out;
    }
    return { D, d, r, t, k, fonts, run, para, heading, rich, TabStopType, AlignmentType };
  }

  // Corps d'une rubrique du CV (liste de paragraphes), selon son type.
  function sectionBody(kit, s, o = {}) {
    const { d, r, t, run, para, rich } = kit;
    const x = d.sections[s.id];
    const ink = o.dark ? hex(r.sideInk) : INK, muted = o.dark ? hex(r.sideInk) : MUTED;
    if (s.type === 'text') return x.text.trim() ? rich(x.text, { color: ink, justify: !o.narrow }) : [];
    if (s.type === 'tags') {
      const tags = x.tags.filter(v => v.trim());
      if (!tags.length) return [];
      if (o.inline || !['habilitations', 'liens', 'permis'].includes(s.id)) return [para(run(tags.join(' · '), { color: ink }), { after: 60 })];
      return tags.map(v => para(run(v, { color: ink }), { bullet: true, after: 30 }));
    }
    if (s.type === 'levels') {
      const levels = x.levels.filter(l => l.label.trim());
      if (!levels.length) return [];
      const name = l => l.detail || t.levels[l.level] || '';
      if (o.inline) return [para(run(levels.map(l => l.label + ' (' + name(l).toLowerCase() + ')').join(' · '), { color: ink }))];
      const color = o.dark ? hex(r.sideInk) : hex(r.level || r.accent);
      return levels.map(l => {
        if (d.levelStyle === 'text') return para([run(l.label, { bold: true, color: ink }), run(' — ' + name(l), { color: muted })], { after: 40 });
        const on = '●'.repeat(Math.max(0, Math.min(5, l.level))), off = '○'.repeat(5 - on.length);
        return para([run(l.label + '  ', { color: ink }), run(on, { color, font: 'Arial' }), run(off, { color: o.dark ? hex(r.sideInk) : 'B9C1CB', font: 'Arial' }), l.detail ? run('  ' + l.detail, { pt: 9, color: muted }) : null].filter(Boolean), { after: 40 });
      });
    }
    if (s.type === 'refs') {
      return x.items.filter(i => i.name.trim()).flatMap(i => [
        para(run(i.name, { bold: true, color: ink }), { after: 0, keepNext: true }),
        [i.role, i.org].filter(Boolean).length ? para(run([i.role, i.org].filter(Boolean).join(' · '), { color: muted, pt: 9.5 }), { after: 0 }) : null,
        i.contact ? para(run(i.contact, { color: muted, pt: 9.5 }), { after: 80 }) : null].filter(Boolean));
    }
    const items = x.items.filter(i => i.title.trim() || i.org.trim() || i.desc.trim());
    const out = [];
    for (const i of items) {
      const dates = [i.start, i.end].filter(v => v && v.trim()).join(' – ');
      const org = [i.org, i.place].filter(v => v && v.trim()).join(' · ');
      out.push(para([run(i.title, { bold: true, color: ink }), dates ? run('\t' + dates, { pt: 9, color: muted }) : null].filter(Boolean), { after: 0, keepNext: true, tabs: o.width ? [{ type: kit.TabStopType.RIGHT, position: o.width }] : undefined }));
      if (org) out.push(para(run(org, { italics: true, pt: 9.5, color: muted }), { after: 20, keepNext: Boolean(i.desc.trim()) }));
      if (!o.compact) out.push(...rich(i.desc, { pt: 9.5, color: ink }));
      out.push(para(run(''), { after: 40 }));
    }
    return out;
  }
  function section(kit, s, o = {}) {
    const body = sectionBody(kit, s, o);
    if (!body.length) return [];
    return [kit.heading(R().sectionTitle(kit.d, s), o), ...body];
  }

  // En-tête : nom et titre, puis coordonnées (en ligne ou empilées).
  function nameParas(kit, o = {}) {
    const { d, r, run, para, fonts, AlignmentType } = kit;
    const p = d.person, align = o.center ? AlignmentType.CENTER : undefined;
    const nameK = NAME[d.nameSize] || 1, color = o.ink ? hex(o.ink) : hex(r.title);
    const out = [para([run(p.first + (p.first && p.last ? ' ' : ''), { font: fonts.head, pt: 24 * nameK, color, caps: r.t.caps }), run(p.last, { font: fonts.head, pt: 24 * nameK, bold: true, color, caps: r.t.caps })], { align, after: 40 })];
    if (p.title) out.push(para(run(p.title, { pt: 12, bold: true, color: o.ink ? hex(o.ink) : MUTED }), { align, after: 120 }));
    return out;
  }
  function contactParas(kit, o = {}) {
    const { d, run, para, AlignmentType } = kit;
    const p = d.person, align = o.center ? AlignmentType.CENTER : undefined, color = o.ink ? hex(o.ink) : INK;
    const contacts = [p.email, p.phone, [p.address, p.city].filter(Boolean).join(', '), p.birth, p.web].filter(v => v && v.trim());
    if (o.stack) return contacts.map((c, i) => para(run(c, { pt: 9.5, color }), { align, after: i === contacts.length - 1 ? 200 : 30 }));
    return contacts.length ? [para(run(contacts.join('  ·  '), { pt: 9.5, color }), { align, after: 160 })] : [];
  }
  const identity = (kit, o = {}) => [...nameParas(kit, o), ...contactParas(kit, o)];

  const noBorders = D => { const n = { style: D.BorderStyle.NONE, size: 0, color: 'FFFFFF' }; return { top: n, bottom: n, left: n, right: n, insideHorizontal: n, insideVertical: n }; };
  function table(D, widths, cells, o = {}) {
    return new D.Table({
      width: { size: widths.reduce((a, b) => a + b, 0), type: D.WidthType.DXA }, columnWidths: widths, layout: D.TableLayoutType.FIXED, borders: noBorders(D),
      rows: [new D.TableRow({ cantSplit: false, children: cells.map((c, i) => new D.TableCell({
        width: { size: widths[i], type: D.WidthType.DXA }, children: c.children.length ? c.children : [new D.Paragraph('')], verticalAlign: c.valign,
        shading: c.fill ? { type: D.ShadingType.CLEAR, color: 'auto', fill: c.fill } : undefined,
        margins: { top: c.pad ?? 120, bottom: c.pad ?? 120, left: c.padX ?? 160, right: c.padX ?? 160 }, borders: noBorders(D)
      })) })], ...o
    });
  }

  async function cvDoc(D, d, options) {
    const r = R().resolved(d);
    const kit = makeKit(D, d, r);
    const { para, run } = kit;
    const margin = 680, content = PAGE.width - 2 * margin;
    const vis = zone => R().visibleSections(d, zone);
    const photoK = PHOTO[d.photoSize] || 1;
    let photo = null;
    if (d.photo && options.photo !== false && r.photo !== 'none') {
      try { const png = await photoPng(d, r.photo, Math.round(110 * photoK), d.photoBorder ? r.accent : ''); photo = new D.ImageRun({ type: 'png', data: png.data, transformation: { width: png.px, height: png.px } }); } catch { photo = null; }
    }
    const photoPara = (align) => photo ? [para(photo, { align, after: 160 })] : [];
    const L = d.layout, side = r.side, dark = R().isDark(side);
    const children = [];
    const twoCols = (mainNodes, sideNodes, o = {}) => {
      const sideW = Math.round(content * (o.sideRatio || 0.34)), mainW = content - sideW;
      const cells = [{ children: mainNodes, padX: 120 }, { children: sideNodes, fill: o.fill, padX: 200 }];
      return table(D, o.left ? [sideW, mainW] : [mainW, sideW], o.left ? [cells[1], cells[0]] : cells);
    };
    const mainOf = (o = {}) => vis('main').flatMap((s, i) => section(kit, s, { width: Math.round(content * (1 - (o.sideRatio ?? 0.34))) - 240, first: i === 0, ...o }));
    const sideOf = (o = {}) => vis('side').flatMap((s, i) => section(kit, s, { side: true, narrow: true, first: i === 0, ...o }));
    if (L === 'lateral' || L === 'lateral-d') {
      const tinted = side !== '#ffffff';
      // Comme à l'écran : photo, coordonnées et atouts dans la colonne ; nom et parcours à côté.
      const sideNodes = [...photoPara(D.AlignmentType.CENTER), ...contactParas(kit, { stack: true, ink: dark ? r.sideInk : null }), ...sideOf({ dark })];
      const mainNodes = [...nameParas(kit), para(run(''), { after: 60 }), ...mainOf()];
      children.push(twoCols(mainNodes, sideNodes, { left: L === 'lateral', fill: tinted ? hex(side) : undefined }));
    } else if (L === 'ats') {
      children.push(...identity(kit, { center: true }), ...vis('main').flatMap((s, i) => section(kit, s, { width: content, first: i === 0 })), ...vis('side').flatMap(s => section(kit, s, { inline: true })));
    } else if (L === 'europass') {
      const head = table(D, [Math.round(content * 0.28), content - Math.round(content * 0.28)], [{ children: photoPara(D.AlignmentType.CENTER) }, { children: identity(kit, { stack: true }) }]);
      children.push(head);
      for (const s of [...vis('main'), ...vis('side')]) {
        const body = sectionBody(kit, s, { inline: s.zone === 'side' && s.type !== 'levels', width: Math.round(content * 0.72) - 320 });
        if (!body.length) continue;
        const left = Math.round(content * 0.28);
        children.push(table(D, [left, content - left], [{ children: [para(run(R().sectionTitle(d, s), { font: kit.fonts.head, bold: true, pt: 10.5, color: hex(r.title), caps: true }), { align: D.AlignmentType.RIGHT })], pad: 60 }, { children: body, pad: 60 }]));
      }
    } else if (['hybride', 'competences', 'minimal'].includes(L)) {
      const header = photo && L !== 'minimal' ? table(D, [content - 1900, 1900], [{ children: identity(kit), padX: 0 }, { children: photoPara(D.AlignmentType.RIGHT), padX: 0 }])
        : photo ? table(D, [content - 1700, 1700], [{ children: identity(kit), padX: 0 }, { children: photoPara(D.AlignmentType.RIGHT), padX: 0 }]) : null;
      children.push(...(header ? [header] : identity(kit)));
      const keyIds = L === 'hybride' ? ['competences', 'habilitations'] : L === 'competences' ? ['competences', 'habilitations', 'logiciels', 'savoiretre'] : [];
      if (L === 'competences' && d.sections.profil.on) children.push(...section(kit, R().CV_SECTIONS[0], { width: content }));
      const key = vis('side').filter(s => keyIds.includes(s.id));
      if (key.length) {
        const half = Math.round(content / 2), cols = [[], []];
        key.forEach((s, i) => cols[i % 2].push(...section(kit, s, { side: true, narrow: true, first: i < 2 })));
        children.push(table(D, [half, content - half], [{ children: cols[0], fill: 'F3F5F8' }, { children: cols[1], fill: 'F3F5F8' }]));
      }
      children.push(...vis('main').filter(s => !(L === 'competences' && s.id === 'profil')).flatMap(s => section(kit, s, { width: content, compact: L === 'competences' })));
      const rest = vis('side').filter(s => !keyIds.includes(s.id));
      if (L === 'minimal' && rest.length) {
        // Minimaliste : atouts sur deux colonnes, comme à l'écran.
        const half = Math.round(content / 2), cols = [[], []];
        rest.forEach((s, i) => cols[i % 2].push(...section(kit, s, { side: true, narrow: true, first: i < 2 })));
        children.push(para(run(''), { after: 60 }), table(D, [half, content - half], [{ children: cols[0], padX: 0 }, { children: cols[1], padX: 120 }]));
      } else children.push(...rest.flatMap(s => section(kit, s, { inline: true })));
    } else {
      // Bandeau, frise, deux colonnes, infographie, en-tête centré, asymétrique, cartes.
      const band = ['bandeau', 'infographie'].includes(L);
      const bandFill = dark ? hex(side) : side !== '#ffffff' ? hex(r.accent) : null;
      const bandInk = dark ? r.sideInk : side !== '#ffffff' ? '#ffffff' : null;
      const center = L === 'centre';
      const id = identity(kit, { center, ink: band && bandFill ? bandInk : null });
      if (band || photo) {
        const pw = 1900;
        const cells = center ? null : [{ children: photoPara(D.AlignmentType.CENTER), fill: band ? bandFill : undefined, pad: 200 }, { children: id, fill: band ? bandFill : undefined, pad: 200, valign: D.VerticalAlign.CENTER }];
        if (center) children.push(...photoPara(D.AlignmentType.CENTER), ...id);
        else children.push(table(D, photo ? [pw, content - pw] : [1, content - 1], photo ? cells : [{ children: [], fill: cells[1].fill }, cells[1]]));
      } else children.push(...id);
      if (L === 'infographie') {
        const S = d.sections, t = kit.t, count = (sid, f) => (S[sid].on ? f(S[sid]) : 0);
        const figs = [[count('experiences', x => x.items.filter(i => i.title.trim()).length), t.keys[1]], [count('habilitations', x => x.tags.filter(v => v.trim()).length), t.keys[2]], [count('competences', x => x.levels.filter(v => v.label.trim()).length), t.keys[3]], [count('langues', x => x.levels.filter(v => v.label.trim()).length), t.keys[4]]].filter(([n]) => n > 0);
        if (figs.length) {
          const w = Math.floor(content / figs.length);
          children.push(para(run(''), { after: 80 }), table(D, figs.map(() => w), figs.map(([n, label]) => ({ children: [para(run(String(n), { font: kit.fonts.head, pt: 22, bold: true, color: hex(r.accent) }), { align: D.AlignmentType.CENTER, after: 0 }), para(run(label, { pt: 9, color: MUTED }), { align: D.AlignmentType.CENTER, after: 0 })], fill: 'F3F5F8' }))));
        }
      }
      children.push(para(run(''), { after: 120 }));
      let mainNodes, sideNodes;
      if (L === 'deux') {
        mainNodes = vis('main').filter(s => s.id !== 'formation').flatMap((s, i) => section(kit, s, { width: Math.round(content * 0.5) - 240, first: i === 0 }));
        sideNodes = [...(d.sections.formation.on ? section(kit, R().CV_SECTIONS.find(s => s.id === 'formation'), { width: Math.round(content * 0.5) - 400, first: true }) : []), ...sideOf({ first: !d.sections.formation.on })];
        children.push(twoCols(mainNodes, sideNodes, { sideRatio: 0.5 }));
      } else {
        const soft = ['frise', 'asym'].includes(L) ? 'F3F5F8' : undefined;
        children.push(twoCols(mainOf(), sideOf(), { fill: soft }));
      }
    }
    return { children, margin };
  }

  async function letterDoc(D, d) {
    const r = R().resolved(d);
    const kit = makeKit(D, d, r);
    const { para, run, fonts, t } = kit;
    const p = d.person, rc = d.recipient, show = d.show, L = d.layout;
    const margin = 1134, content = PAGE.width - 2 * margin, indent = { left: Math.round(content * 0.55) };
    const children = [];
    const full = [p.first, p.last].filter(Boolean).join(' ');
    const contacts = [p.address, p.city, p.phone, p.email].filter(v => v && v.trim());
    if (show.expediteur && L !== 'mail') {
      if (L === 'fr') {
        children.push(para(run(full, { bold: true }), { after: 0 }));
        contacts.forEach(c => children.push(para(run(c), { after: 0 })));
        children.push(para(run(''), { after: 120 }));
      } else if (L === 'bandeau' || L === 'lateral') {
        const darkSide = R().isDark(r.side);
        children.push(table(D, [content], [{ children: identity(kit, { ink: darkSide ? r.sideInk : '#ffffff' }), fill: darkSide ? hex(r.side) : hex(r.accent), pad: 220, padX: 280 }]), para(run(''), { after: 160 }));
      } else children.push(...identity(kit, { center: L === 'minimal' }));
    }
    if (show.destinataire && (rc.company || rc.contact || rc.address) && L !== 'mail') {
      [[rc.company, true], [rc.service], [rc.contact], [rc.address], [rc.city]].filter(([v]) => v && v.trim()).forEach(([v, b]) => children.push(para(run(v, { bold: b }), { indent, after: 0 })));
      children.push(para(run(''), { after: 120 }));
    }
    if (show.date && L !== 'mail') {
      const text = d.lang === 'fr' ? (d.place ? d.place + ', le ' : 'Le ') + R().longDate(d.date) : (d.place ? d.place + ', ' : '') + R().longDate(d.date, t.date);
      children.push(para(run(text), { indent, after: 240 }));
    }
    if (show.objet && d.object) children.push(para([run(t.object, { bold: true }), run(d.object, { bold: true })], { after: 60 }));
    if (show.ref && d.ref) children.push(para(run(t.ref + d.ref), { after: 60 }));
    children.push(para(run(''), { after: 120 }));
    for (const id of d.order) {
      const b = d.blocks[id];
      if (!b.on || !b.text.trim()) continue;
      for (const line of b.text.split('\n').map(l => l.trimEnd()).filter(l => l.trim())) {
        const bullet = line.match(/^\s*[-•*]\s+(.*)$/);
        children.push(para(run(bullet ? bullet[1] : line, { pt: 10.5 }), { bullet: Boolean(bullet), after: 140, line: 288, align: d.justify && !bullet ? D.AlignmentType.JUSTIFIED : undefined }));
      }
    }
    if (show.signature) {
      children.push(para(run(''), { after: 120 }));
      if (d.sign.mode !== 'typed' && d.sign.image) {
        try { const img = await imagePng(d.sign.image); const w = 150, h = Math.round(w * img.h / img.w); children.push(para(new D.ImageRun({ type: 'png', data: img.data, transformation: { width: w, height: Math.min(h, 90) } }), { indent, after: 0 })); } catch { /* signature illisible */ }
      }
      children.push(para(run(full, { bold: true }), { indent, after: 200 }));
    }
    if (show.ps && d.ps.trim()) children.push(para(run(t.ps + d.ps, { italics: true }), { after: 80 }));
    if (show.pj && d.pj.trim() && L !== 'mail') children.push(para(run(d.pj, { pt: 9.5, color: MUTED }), { after: 0 }));
    if (L === 'mail') contacts.forEach(c => children.push(para(run(c, { pt: 9.5, color: MUTED }), { after: 0 })));
    return { children, margin };
  }

  // items : [{ kind: 'cv' | 'lm', data }] → un seul fichier .docx (une section par document).
  async function build(items, options = {}) {
    const D = await loadDocx();
    const sections = [], keys = new Set();
    for (const item of items) {
      const data = R().clean(item.kind, JSON.parse(JSON.stringify(item.data)));
      const r = R().resolved(data);
      keys.add(r.headKey); keys.add(r.bodyKey);
      const { children, margin } = item.kind === 'cv' ? await cvDoc(D, data, options) : await letterDoc(D, data);
      sections.push({ properties: { page: { size: PAGE, margin: { top: margin, bottom: margin, left: margin, right: margin } } }, children });
    }
    const fonts = [];
    for (const key of keys) {
      const bytes = await fontData(key);
      if (bytes) fonts.push({ name: fontName(key), data: bytes, characterSet: D.CharacterSet?.ANSI });
    }
    const first = R().clean(items[0].kind, items[0].data), rr = R().resolved(first);
    const doc = new D.Document({
      creator: options.author || '', title: items.length > 1 ? 'CV et lettre de motivation' : items[0].kind === 'cv' ? 'Curriculum vitae' : 'Lettre de motivation',
      description: 'Créé avec L’Atelier MELEC', fonts,
      styles: { default: { document: { run: { font: fontName(rr.bodyKey), size: 20, color: INK } } } },
      numbering: { config: [{ reference: 'puces', levels: [{ level: 0, format: D.LevelFormat.BULLET, text: '•', alignment: D.AlignmentType.LEFT, style: { paragraph: { indent: { left: 300, hanging: 200 } } } }] }] },
      sections
    });
    const blob = await D.Packer.toBlob(doc);
    return { blob, pages: items.length };
  }

  window.MelecOutilsWord = { build, loadDocx, fontName };
})();
