// Тест калькулятора: все комбинации «тип × локация × доп. услуги × трансфер» в настоящем браузере.
//
// Ожидаемый итог считается из prices.json по правилам сайта, поэтому тест не зависит от конкретных цен
// (изменения цен через бота его не ломают) и сразу ловит поломку логики или привязки новых позиций.
//
//   npm i --no-save playwright-core && npx playwright-core install chromium   (один раз)
//   node .github/tests/calc.test.mjs
// Локально без загрузки браузера можно взять установленный: PW_CHANNEL=msedge (или chrome).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const prices = JSON.parse(fs.readFileSync(path.join(ROOT, 'prices.json'), 'utf8'));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.xml': 'application/xml' };

const server = http.createServer((req, res) => {
  const file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/`;

const browser = await chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {});
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const jsErrors = [];
page.on('pageerror', (e) => jsErrors.push(e.message));
await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(500);

const types = Object.keys(prices.types);
const locs = Object.keys(prices.locations);
const extras = Object.keys(prices.extras);

function expected(t, l, mask) {
  const type = prices.types[t], loc = prices.locations[l];
  let total = type.price + loc.surcharge;
  const labels = [];
  if (type.dress_included_at && !type.dress_included_at.includes(l)) { total += prices.extras.dress.price; labels.push('auto-dress'); }
  extras.forEach((e, i) => { if (mask & (1 << i)) total += prices.extras[e].price; });
  if (mask & (1 << extras.length)) total += loc.transfer; // последний бит — трансфер
  return total;
}

let checked = 0;
const failures = [];
const combos = 1 << (extras.length + 1);
for (const t of types) for (const l of locs) for (let mask = 0; mask < combos; mask++) {
  const got = await page.evaluate(({ t, l, mask, extras }) => {
    document.querySelector(`#calc-type-grid [data-type="${t}"]`).click();
    document.querySelector(`#calc-loc-grid [data-loc="${l}"]`).click();
    const boxes = [...extras.map((e) => document.querySelector(`input[data-extra="${e}"]`)), document.getElementById('opt-transfer')];
    boxes.forEach((el, i) => { const want = !!(mask & (1 << i)); if (el.checked !== want) el.click(); });
    const msg = decodeURIComponent(document.getElementById('btn-book-telegram').href.split('?text=')[1] || '');
    return { total: document.getElementById('sum-total').textContent, msg };
  }, { t, l, mask, extras });
  const want = expected(t, l, mask);
  checked++;
  if (got.total !== `$${want}` || !got.msg.includes(`$${want}`)) failures.push(`${t}|${l}|${mask}: ожидали $${want}, получили ${got.total}`);
}

// Цены на странице совпадают с prices.json (всё, что помечено data-p)
const shown = await page.evaluate(() => [...document.querySelectorAll('[data-p]')].map((e) => [e.getAttribute('data-p'), e.getAttribute('data-pf') || '', e.textContent]));
for (const [p, mode, text] of shown) {
  const v = p.split('.').reduce((o, k) => o[k], prices);
  const want = mode === 'plus' ? `+$${v}` : mode === 'tag' ? (v ? ` (+$${v})` : '') : `$${v}`;
  if (text !== want) failures.push(`data-p="${p}": на странице «${text}», ожидали «${want}»`);
}

await browser.close();
server.close();

if (jsErrors.length) failures.push(`ошибки JS на странице: ${jsErrors.join('; ')}`);
if (failures.length) {
  console.log(`ПРОВАЛ: ${failures.length} расхождений (проверено комбинаций: ${checked})`);
  failures.slice(0, 15).forEach((f) => console.log('  ✗', f));
  process.exit(1);
}
console.log(`Калькулятор: ${checked} комбинаций совпали с prices.json, ${shown.length} цен на странице актуальны, ошибок JS нет.`);
assert.ok(checked > 0);
