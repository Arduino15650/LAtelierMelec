/* L'Atelier MELEC : compression automatique des PDF déposés par l'enseignant.
   Seules les images du PDF (pages scannées, photos) sont recompressées en JPEG et ramenées
   à une résolution suffisante pour la lecture à l'écran (2200 pixels au plus sur le grand côté,
   soit environ 190 ppp pour une page A4 entière). Le texte, les schémas vectoriels et les zones
   à remplir par les élèves ne sont pas modifiés.
   Prudence : une image qui ne gagne pas au moins 10 % est laissée telle quelle, et si le PDF
   final n'est pas nettement plus léger, ou ne se relit pas correctement, le fichier d'origine
   est envoyé sans changement. Bibliothèque pdf-lib (licence MIT) chargée seulement au besoin. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MelecPdfCompress = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const MIN_FILE_BYTES = 1024 * 1024;   // en dessous de 1 Mo, la compression ne vaut pas la peine
  const MIN_IMAGE_BYTES = 60 * 1024;    // petites images (logos, icônes) laissées telles quelles
  const DEFAULTS = { maxSide: 2200, quality: 0.75 };

  const name = value => (value && typeof value.toString === 'function' ? value.toString() : '');
  const num = value => (value && typeof value.asNumber === 'function' ? value.asNumber() : undefined);

  // Lecture de la description d'une image : null si son format n'est pas pris en charge sans risque.
  function describeImage(PDFLib, context, stream) {
    const { PDFName, PDFArray, PDFDict } = PDFLib;
    const dict = stream.dict;
    if (name(dict.get(PDFName.of('Subtype'))) !== '/Image') return null;
    if (dict.get(PDFName.of('ImageMask')) || dict.get(PDFName.of('Mask'))) return null;
    // Un tableau Decode qui inverse les couleurs n'est pas pris en charge ; [0 1 …] (neutre) l'est.
    const decode = context.lookup(dict.get(PDFName.of('Decode')));
    if (decode) {
      if (!(decode instanceof PDFArray)) return null;
      for (let i = 0; i < decode.size(); i++) if (num(context.lookup(decode.get(i))) !== i % 2) return null;
    }
    if (num(context.lookup(dict.get(PDFName.of('BitsPerComponent')))) !== 8) return null;
    const width = num(context.lookup(dict.get(PDFName.of('Width'))));
    const height = num(context.lookup(dict.get(PDFName.of('Height'))));
    if (!width || !height) return null;
    // Filtres : DCT (JPEG) ou Flate, éventuellement précédés d'un encodage texte ASCII85 ou ASCIIHex.
    const rawFilter = context.lookup(dict.get(PDFName.of('Filter')));
    const filters = rawFilter instanceof PDFArray
      ? Array.from({ length: rawFilter.size() }, (_, i) => name(context.lookup(rawFilter.get(i))))
      : [name(rawFilter)];
    const text = filters.length === 2 && ['/ASCII85Decode', '/A85', '/ASCIIHexDecode', '/AHx'].includes(filters[0]) ? filters[0] : null;
    if (filters.length !== (text ? 2 : 1)) return null;
    const filter = filters[filters.length - 1];
    if (filter !== '/DCTDecode' && filter !== '/FlateDecode') return null;
    // Espace de couleur : gris ou RVB uniquement (les images CMJN ou indexées sont laissées telles quelles).
    let colorSpace = context.lookup(dict.get(PDFName.of('ColorSpace')));
    let channels = 0;
    if (name(colorSpace) === '/DeviceGray') channels = 1;
    else if (name(colorSpace) === '/DeviceRGB') channels = 3;
    else if (colorSpace instanceof PDFArray && name(context.lookup(colorSpace.get(0))) === '/ICCBased') {
      const profile = context.lookup(colorSpace.get(1));
      const n = profile && profile.dict ? num(context.lookup(profile.dict.get(PDFName.of('N')))) : undefined;
      if (n === 1 || n === 3) channels = n;
    }
    if (!channels) return null;
    let predictor = 1, columns = width, colors = channels;
    let parms = context.lookup(dict.get(PDFName.of('DecodeParms')));
    if (parms instanceof PDFArray) parms = parms.size() === filters.length ? context.lookup(parms.get(filters.length - 1)) : null;
    if (parms instanceof PDFDict) {
      predictor = num(context.lookup(parms.get(PDFName.of('Predictor')))) || 1;
      columns = num(context.lookup(parms.get(PDFName.of('Columns')))) || 1;
      colors = num(context.lookup(parms.get(PDFName.of('Colors')))) || 1;
      const bits = num(context.lookup(parms.get(PDFName.of('BitsPerComponent')))) || 8;
      if (bits !== 8) return null;
    }
    if (filter === '/FlateDecode' && predictor !== 1 && (predictor < 10 || columns !== width || colors !== channels)) return null;
    return { width, height, channels, filter, predictor, text: text ? (text.includes('85') ? 'ascii85' : 'hex') : null };
  }

  // Encodages texte qui enveloppent parfois les images (25 % à 100 % plus lourds que le binaire).
  function decodeAscii85(bytes) {
    const out = [];
    let group = [], i = 0;
    if (bytes[0] === 60 && bytes[1] === 126) i = 2; // « <~ »
    for (; i < bytes.length; i++) {
      const c = bytes[i];
      if (c === 126) break; // « ~> »
      if (c <= 32) continue;
      if (c === 122 && !group.length) { out.push(0, 0, 0, 0); continue; } // « z »
      if (c < 33 || c > 117) throw new Error('ASCII85 invalide');
      group.push(c - 33);
      if (group.length === 5) {
        let value = 0;
        for (const digit of group) value = value * 85 + digit;
        out.push((value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255);
        group = [];
      }
    }
    if (group.length) {
      const count = group.length - 1;
      while (group.length < 5) group.push(84);
      let value = 0;
      for (const digit of group) value = value * 85 + digit;
      const tail = [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255];
      out.push(...tail.slice(0, count));
    }
    return Uint8Array.from(out);
  }
  function decodeHex(bytes) {
    const digits = [];
    for (const c of bytes) {
      if (c === 62) break; // « > »
      const v = c >= 48 && c <= 57 ? c - 48 : c >= 65 && c <= 70 ? c - 55 : c >= 97 && c <= 102 ? c - 87 : -1;
      if (v >= 0) digits.push(v);
    }
    if (digits.length % 2) digits.push(0);
    const out = new Uint8Array(digits.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = digits[2 * i] * 16 + digits[2 * i + 1];
    return out;
  }

  // Filtres de lignes PNG (prédicteurs 10 à 15) appliqués avant la compression Flate.
  function unpredict(data, width, height, channels) {
    const row = width * channels, out = new Uint8Array(row * height);
    if (data.length < (row + 1) * height) throw new Error('Image incomplète');
    for (let y = 0; y < height; y++) {
      const type = data[y * (row + 1)], src = y * (row + 1) + 1, dst = y * row;
      for (let x = 0; x < row; x++) {
        const raw = data[src + x];
        const left = x >= channels ? out[dst + x - channels] : 0;
        const up = y ? out[dst - row + x] : 0;
        const upLeft = y && x >= channels ? out[dst - row + x - channels] : 0;
        let value;
        if (type === 0) value = raw;
        else if (type === 1) value = raw + left;
        else if (type === 2) value = raw + up;
        else if (type === 3) value = raw + ((left + up) >> 1);
        else if (type === 4) {
          const p = left + up - upLeft, pa = Math.abs(p - left), pb = Math.abs(p - up), pc = Math.abs(p - upLeft);
          value = raw + (pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft);
        } else throw new Error('Filtre PNG inconnu');
        out[dst + x] = value & 255;
      }
    }
    return out;
  }

  // Cœur de la compression, indépendant du navigateur (testé avec Node).
  // codec : inflate(octets), rasterToJpeg({pixels,width,height,channels}, largeur, hauteur, qualité),
  //         jpegToJpeg(octets, largeur, hauteur, qualité). Chaque fonction peut renvoyer une promesse.
  async function compressPdfBytes(bytes, { PDFLib, codec, maxSide = DEFAULTS.maxSide, quality = DEFAULTS.quality, onProgress } = {}) {
    const original = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const result = { bytes: original, changed: false, imagesCompressed: 0, imagesFound: 0, before: original.length, after: original.length };
    let doc;
    try { doc = await PDFLib.PDFDocument.load(original, { updateMetadata: false }); }
    catch { return result; } // PDF chiffré ou illisible : envoyé tel quel
    const context = doc.context;
    const pages = doc.getPageCount();
    const images = context.enumerateIndirectObjects().filter(([, object]) => object instanceof PDFLib.PDFRawStream
      && name(object.dict.get(PDFLib.PDFName.of('Subtype'))) === '/Image');
    result.imagesFound = images.length;
    // Les masques de transparence (SMask) restent intacts : ils doivent rester en gris et sans perte.
    const masks = new Set();
    for (const [, stream] of images) {
      const mask = stream.dict.get(PDFLib.PDFName.of('SMask'));
      if (mask instanceof PDFLib.PDFRef) masks.add(mask.toString());
    }
    let index = 0;
    for (const [ref, stream] of images) {
      index++;
      if (onProgress) onProgress(index, images.length);
      if (masks.has(ref.toString()) || stream.contents.length < MIN_IMAGE_BYTES) continue;
      const info = describeImage(PDFLib, context, stream);
      if (!info) continue;
      const scale = Math.min(1, maxSide / Math.max(info.width, info.height));
      const width = Math.max(1, Math.round(info.width * scale)), height = Math.max(1, Math.round(info.height * scale));
      let jpeg;
      try {
        const data = info.text === 'ascii85' ? decodeAscii85(stream.contents) : info.text === 'hex' ? decodeHex(stream.contents) : stream.contents;
        if (info.filter === '/DCTDecode') jpeg = await codec.jpegToJpeg(data, width, height, quality);
        else {
          let pixels = await codec.inflate(data);
          if (info.predictor >= 10) pixels = unpredict(pixels, info.width, info.height, info.channels);
          if (pixels.length < info.width * info.height * info.channels) continue;
          jpeg = await codec.rasterToJpeg({ pixels, width: info.width, height: info.height, channels: info.channels }, width, height, quality);
        }
      } catch { continue; } // image non décodable : laissée telle quelle
      if (!jpeg || jpeg.length >= stream.contents.length * 0.9) continue;
      const dict = stream.dict.clone(context);
      const { PDFName, PDFNumber } = PDFLib;
      dict.set(PDFName.of('Filter'), PDFName.of('DCTDecode'));
      dict.delete(PDFName.of('DecodeParms'));
      dict.set(PDFName.of('Width'), PDFNumber.of(width));
      dict.set(PDFName.of('Height'), PDFNumber.of(height));
      dict.set(PDFName.of('BitsPerComponent'), PDFNumber.of(8));
      dict.set(PDFName.of('ColorSpace'), PDFName.of('DeviceRGB'));
      dict.set(PDFName.of('Length'), PDFNumber.of(jpeg.length));
      context.assign(ref, PDFLib.PDFRawStream.of(dict, jpeg));
      result.imagesCompressed++;
    }
    const saved = await doc.save({ useObjectStreams: true, updateFieldAppearances: false });
    if (saved.length >= original.length * 0.95) return result;
    // Contrôle : le PDF compressé doit se relire avec le même nombre de pages.
    try {
      const check = await PDFLib.PDFDocument.load(saved, { updateMetadata: false });
      if (check.getPageCount() !== pages) return result;
    } catch { return result; }
    return { ...result, bytes: saved, changed: true, after: saved.length };
  }

  // ---- Navigateur ---------------------------------------------------------
  let libraryLoading = null;
  function loadPdfLib() {
    if (typeof window === 'undefined') return Promise.reject(new Error('Navigateur requis'));
    if (window.PDFLib) return Promise.resolve(window.PDFLib);
    if (libraryLoading) return libraryLoading;
    libraryLoading = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'pdf-lib.min.js';
      script.onload = () => window.PDFLib ? resolve(window.PDFLib) : reject(new Error('Outil de compression indisponible'));
      script.onerror = () => { libraryLoading = null; reject(new Error('Outil de compression indisponible')); };
      document.head.appendChild(script);
    });
    return libraryLoading;
  }
  function canvas(width, height) {
    if (typeof OffscreenCanvas === 'function') return new OffscreenCanvas(width, height);
    const element = document.createElement('canvas'); element.width = width; element.height = height; return element;
  }
  async function toJpeg(target, quality) {
    const blob = typeof target.convertToBlob === 'function'
      ? await target.convertToBlob({ type: 'image/jpeg', quality })
      : await new Promise(resolve => target.toBlob(resolve, 'image/jpeg', quality));
    if (!blob) throw new Error('Encodage impossible');
    return new Uint8Array(await blob.arrayBuffer());
  }
  function drawScaled(source, width, height) {
    const target = canvas(width, height), ctx = target.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, width, height);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, 0, 0, width, height);
    return target;
  }
  const browserCodec = {
    async inflate(bytes) {
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    },
    async rasterToJpeg({ pixels, width, height, channels }, targetWidth, targetHeight, quality) {
      const source = canvas(width, height), ctx = source.getContext('2d');
      const image = ctx.createImageData(width, height), rgba = image.data;
      for (let i = 0, j = 0; i < width * height; i++, j += channels) {
        const k = i * 4;
        if (channels === 1) { rgba[k] = rgba[k + 1] = rgba[k + 2] = pixels[j]; }
        else { rgba[k] = pixels[j]; rgba[k + 1] = pixels[j + 1]; rgba[k + 2] = pixels[j + 2]; }
        rgba[k + 3] = 255;
      }
      ctx.putImageData(image, 0, 0);
      return toJpeg(drawScaled(source, targetWidth, targetHeight), quality);
    },
    async jpegToJpeg(bytes, targetWidth, targetHeight, quality) {
      const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/jpeg' }));
      try { return await toJpeg(drawScaled(bitmap, targetWidth, targetHeight), quality); }
      finally { bitmap.close?.(); }
    }
  };
  const isPdf = file => file && (file.type === 'application/pdf' || /\.pdf$/i.test(file.name || ''));
  const megabytes = bytes => (bytes / 1024 / 1024).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' Mo';

  // Renvoie le fichier compressé, ou le fichier d'origine si la compression n'apporte rien.
  async function compress(file, onStatus = () => {}) {
    if (!isPdf(file) || file.size < MIN_FILE_BYTES || typeof DecompressionStream !== 'function') return file;
    try {
      onStatus('Compression de « ' + file.name + ' »…');
      const PDFLib = await loadPdfLib();
      const result = await compressPdfBytes(new Uint8Array(await file.arrayBuffer()), {
        PDFLib, codec: browserCodec,
        onProgress: (done, total) => onStatus('Compression de « ' + file.name + ' » : image ' + done + ' / ' + total + '…')
      });
      if (!result.changed) { onStatus('« ' + file.name + ' » : déjà optimisé (' + megabytes(file.size) + ').'); return file; }
      onStatus('« ' + file.name + ' » compressé : ' + megabytes(result.before) + ' → ' + megabytes(result.after) + '.');
      return new File([result.bytes], file.name, { type: 'application/pdf', lastModified: file.lastModified });
    } catch {
      return file; // en cas de souci, le fichier d'origine est conservé
    }
  }

  return { compress, compressPdfBytes, unpredict, describeImage, decodeAscii85, decodeHex, isPdf };
});
