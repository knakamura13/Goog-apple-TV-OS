// Development-time materials. Navigation on the TV only displays these JPEGs.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { openPreview, root } from './browser.mjs';

const catalogue = JSON.parse(readFileSync(root + 'app/assets/wallpapers/SOURCES.json', 'utf8'));
const requested = process.argv[2] ? process.argv[2].split(',') : catalogue.map(w => w.id);
if (requested.some(id => !catalogue.some(w => w.id === id))) throw Error('Unknown wallpaper');
const destination = root + '.local/materials/builder/';
mkdirSync(destination, { recursive: true });
const report = { recipe: 1, size: [1920, 1080], assets: [], errors: [] };
const preview = await openPreview();
try {
  const page = await preview.browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on('pageerror', error => report.errors.push(error.message));
  await page.goto(preview.baseURL + '/build/dock.html');
  for (const id of requested) {
    const result = await page.evaluate(async ({ id }) => {
      const W = 1920, H = 1080, P = 96;
      const canvas = (w = W, h = H) => Object.assign(document.createElement('canvas'), { width: w, height: h });
      const image = new Image(); image.src = '/home/assets/wallpapers/' + id + '.jpg'; await image.decode();
      const photo = canvas(), pc = photo.getContext('2d'), scale = Math.max(W / image.width, H / image.height);
      pc.drawImage(image, (W - image.width * scale) / 2, (H - image.height * scale) / 2, image.width * scale, image.height * scale);
      const padded = canvas(W + 2 * P, H + 2 * P), pad = padded.getContext('2d');
      for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) {
        pad.save(); pad.translate(P + (x === 1 ? 2 * W : 0), P + (y === 1 ? 2 * H : 0));
        pad.scale(x === 0 ? 1 : -1, y === 0 ? 1 : -1); pad.drawImage(photo, 0, 0); pad.restore();
      }
      const linear = Array.from({ length: 256 }, (_, v) => { v /= 255; return v <= .04045 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); });
      const encode = v => 255 * (v <= .0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - .055);
      const files = {};
      for (const [suffix, blur, saturation, quality] of [['field-blur', 28, .92, .82], ['field-frost', 42, .92, .82], ['field-clear', 2, 1.06, .86]]) {
        const filtered = canvas(W + 2 * P, H + 2 * P), fc = filtered.getContext('2d');
        fc.filter = 'blur(' + blur + 'px) saturate(' + saturation + ')'; fc.drawImage(padded, 0, 0);
        const output = canvas(), out = output.getContext('2d'); out.drawImage(filtered, P, P, W, H, 0, 0, W, H);
        if (suffix !== 'field-clear') {
          const pixels = out.getImageData(0, 0, W, H), data = pixels.data;
          for (let i = 0; i < data.length; i += 4) {
            const r = linear[data[i]], g = linear[data[i + 1]], b = linear[data[i + 2]], l = .2126 * r + .7152 * g + .0722 * b;
            if (l > .82) { const ratio = (.82 + .4 * (l - .82)) / l; data[i] = encode(r * ratio); data[i + 1] = encode(g * ratio); data[i + 2] = encode(b * ratio); }
            data[i + 3] = 255;
          }
          out.putImageData(pixels, 0, 0);
        }
        files[suffix] = output.toDataURL('image/jpeg', quality).split(',')[1];
      }
      return { files };
    }, { id });
    for (const [suffix, base64] of Object.entries(result.files)) {
      const bytes = Buffer.from(base64, 'base64');
      writeFileSync(destination + id + '-' + suffix + '.jpg', bytes);
      report.assets.push({ id, suffix, bytes: bytes.length });
    }
    console.log(id + ': three registered materials prepared');
  }
  writeFileSync(destination + 'report.json', JSON.stringify(report, null, 2) + '\n');
  if (report.errors.length) throw Error(report.errors.join('\n'));
} finally { await preview.close(); }
