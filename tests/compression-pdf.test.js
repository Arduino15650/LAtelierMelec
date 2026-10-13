// Compression automatique des PDF déposés : images allégées, le reste du document intact.
const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const path = require('node:path');
const PDFLib = require(path.join(__dirname, '..', 'pdf-lib.min.js'));
const { compressPdfBytes, unpredict, decodeAscii85 } = require(path.join(__dirname, '..', 'pdf-compress.js'));
const { PDFName, PDFNumber } = PDFLib;

const aleatoire = taille => Uint8Array.from({ length: taille }, (_, i) => (i * 2654435761) >>> 24);
// Codec de test : « encode » une image en un petit JPEG factice dont la taille dépend des dimensions demandées.
const codec = (taille = null) => ({
  inflate: octets => new Uint8Array(zlib.inflateSync(Buffer.from(octets))),
  rasterToJpeg: (raster, largeur, hauteur) => new Uint8Array(taille ?? Math.ceil(largeur * hauteur / 40)),
  jpegToJpeg: (octets, largeur, hauteur) => new Uint8Array(taille ?? Math.ceil(largeur * hauteur / 40))
});

async function pdfDeTest() {
  const doc = await PDFLib.PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const ctx = doc.context;
  const image = (contenu, dict) => ctx.register(ctx.stream(contenu, { Type: 'XObject', Subtype: 'Image', BitsPerComponent: 8, ...dict }));
  const scan = image(aleatoire(900 * 1024), { Width: 2480, Height: 3508, ColorSpace: 'DeviceRGB', Filter: 'DCTDecode' });
  const masque = image(zlib.deflateSync(Buffer.from(aleatoire(600 * 400))), { Width: 600, Height: 400, ColorSpace: 'DeviceGray', Filter: 'FlateDecode' });
  const photo = image(zlib.deflateSync(Buffer.from(aleatoire(600 * 400 * 3))), { Width: 600, Height: 400, ColorSpace: 'DeviceRGB', Filter: 'FlateDecode', SMask: masque });
  const cmjn = image(aleatoire(300 * 1024), { Width: 2000, Height: 2000, ColorSpace: 'DeviceCMYK', Filter: 'DCTDecode' });
  page.node.setXObject(PDFName.of('Scan'), scan);
  page.node.setXObject(PDFName.of('Photo'), photo);
  page.node.setXObject(PDFName.of('Cmjn'), cmjn);
  page.drawText('Dossier technique', { x: 50, y: 800, size: 14 });
  doc.getForm().createTextField('reponse1').addToPage(page, { x: 50, y: 50, width: 200, height: 24 });
  return { octets: await doc.save({ useObjectStreams: false }), refs: { scan, masque, photo, cmjn } };
}
const flux = (doc, ref) => doc.context.lookup(ref);
const largeur = (doc, ref) => flux(doc, ref).dict.get(PDFName.of('Width')).asNumber();

test('les grosses images sont réduites, le reste du document est intact', async () => {
  const { octets, refs } = await pdfDeTest();
  const resultat = await compressPdfBytes(octets, { PDFLib, codec: codec() });
  assert.ok(resultat.changed, 'le PDF est compressé');
  assert.ok(resultat.after < resultat.before * 0.5, `gain attendu (${resultat.before} → ${resultat.after})`);
  const avant = await PDFLib.PDFDocument.load(octets), apres = await PDFLib.PDFDocument.load(resultat.bytes);
  assert.equal(apres.getPageCount(), 1);
  assert.ok(largeur(apres, refs.scan) <= 2200 && largeur(apres, refs.scan) >= 1500, 'scan ramené à 2200 px au plus');
  assert.equal(flux(apres, refs.scan).dict.get(PDFName.of('Filter')).toString(), '/DCTDecode');
  assert.deepEqual(flux(apres, refs.masque).contents, flux(avant, refs.masque).contents, 'masque de transparence intact');
  assert.equal(flux(apres, refs.photo).dict.get(PDFName.of('SMask')).toString(), refs.masque.toString(), 'lien vers le masque conservé');
  assert.deepEqual(flux(apres, refs.cmjn).contents, flux(avant, refs.cmjn).contents, 'image CMJN laissée telle quelle');
  assert.deepEqual(apres.getForm().getFields().map(champ => champ.getName()), ['reponse1'], 'zone à remplir conservée');
});

test('si la compression n’apporte rien, le fichier d’origine est conservé', async () => {
  const { octets } = await pdfDeTest();
  const resultat = await compressPdfBytes(octets, { PDFLib, codec: codec(5 * 1024 * 1024) });
  assert.equal(resultat.changed, false);
  assert.deepEqual(Buffer.from(resultat.bytes), Buffer.from(octets), 'octets d’origine renvoyés');
  assert.equal(resultat.after, octets.length);
});

test('un PDF illisible est envoyé tel quel', async () => {
  const faux = new TextEncoder().encode('ceci n’est pas un PDF');
  const resultat = await compressPdfBytes(faux, { PDFLib, codec: codec() });
  assert.equal(resultat.changed, false);
  assert.equal(resultat.bytes.length, faux.length);
});

test('les lignes d’image PNG (prédicteurs) sont correctement reconstituées', () => {
  // 2 pixels gris par ligne, 3 lignes : filtres None, Sub, Up.
  const filtre = Uint8Array.from([0, 10, 20, 1, 5, 5, 2, 1, 1]);
  assert.deepEqual([...unpredict(filtre, 2, 3, 1)], [10, 20, 5, 10, 6, 11]);
});

test('les images enveloppées en ASCII85 sont décodées', () => {
  assert.equal(new TextDecoder().decode(decodeAscii85(new TextEncoder().encode('87cURD]i,"Ebo80~>'))), 'Hello World!');
});
