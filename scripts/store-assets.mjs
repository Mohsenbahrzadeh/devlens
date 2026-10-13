// Generates Chrome Web Store graphics into docs/store/ from the built popup (dist/).
//   npm run build && npm run store:assets
// Requires Chrome/Chromium (set CHROME_PATH if it is not in a standard location).
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import puppeteer from 'puppeteer-core';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const dist = join(root, 'dist');
const out = join(root, 'docs', 'store');
mkdirSync(out, { recursive: true });

const chromePath = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].find((p) => p && existsSync(p));
if (!chromePath) {
  console.error('Chrome not found. Set CHROME_PATH to your Chrome/Chromium executable.');
  process.exit(1);
}
if (!existsSync(join(dist, 'sidepanel.html'))) {
  console.error('dist/ not found. Run `npm run build` first.');
  process.exit(1);
}

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.json': 'application/json',
};
const server = createServer((req, res) => {
  const path =
    normalize(decodeURIComponent((req.url ?? '/').split('?')[0])).replace(/^([/\\])+/, '') ||
    'sidepanel.html';
  try {
    const data = readFileSync(join(dist, path));
    res.writeHead(200, { 'Content-Type': MIME[extname(path)] ?? 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;

const b64url = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const jwt = `${b64url({ alg: 'RS256', typ: 'JWT', kid: 'abc123' })}.${b64url({
  iss: 'https://identity.example.com',
  sub: '12345',
  aud: 'api',
  iat: now - 600,
  exp: now + 6120,
  scope: 'read write',
  roles: ['admin', 'dev'],
})}.c2lnbmF0dXJl`;

const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: true,
  args: ['--no-sandbox'],
});

const fill = (page, label, value) =>
  page.evaluate(
    (label, value) => {
      const el = [...document.querySelectorAll('label')].find((l) =>
        l.textContent.startsWith(label),
      );
      const ta = document.getElementById(el.htmlFor);
      const proto = ta.tagName === 'TEXTAREA' ? HTMLTextAreaElement : HTMLInputElement;
      Object.getOwnPropertyDescriptor(proto.prototype, 'value').set.call(ta, value);
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    },
    label,
    value,
  );
const clickButton = (page, text) =>
  page.evaluate(
    (text) =>
      [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === text).click(),
    text,
  );
const clickTab = (page, name) =>
  page.evaluate(
    (name) =>
      [...document.querySelectorAll('[role=tab]')]
        .find((b) => b.textContent.trim() === name)
        .click(),
    name,
  );
const settle = (ms = 400) => new Promise((r) => setTimeout(r, ms));

async function popupShot(prepare) {
  const page = await browser.newPage();
  await page.setViewport({ width: 520, height: 650, deviceScaleFactor: 2 });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  await page.goto(base, { waitUntil: 'networkidle0' });
  await prepare(page);
  await settle();
  const png = await page.screenshot({ encoding: 'base64' });
  await page.close();
  return png;
}

const scenes = [
  {
    title: 'Decode, verify and review JWTs',
    sub: 'Expiry status, claim hints, signature verification and security warnings — all local.',
    shot: (p) =>
      popupShot(async (page) => {
        await fill(page, 'JSON Web Token', jwt);
        await clickButton(page, 'Decode');
      }),
  },
  {
    title: 'Convert JSON to any language',
    sub: 'TypeScript, Zod, C#, Python, Java, Go, YAML, CSV and XML — plus JSONPath and search.',
    shot: () =>
      popupShot(async (page) => {
        await clickTab(page, 'JSON');
        await fill(
          page,
          'JSON',
          JSON.stringify({ id: 1, name: 'Mohsen', tags: ['dev'], address: { city: 'Berlin' } }),
        );
        await clickButton(page, 'Format');
        await clickTab(page, 'Convert');
        await page.select('select[aria-label="Convert to"]', 'cs');
      }),
  },
  {
    title: 'Diff JSON structurally',
    sub: 'Match array items by id, ignore noisy fields, export a Markdown report.',
    shot: () =>
      popupShot(async (page) => {
        await clickTab(page, 'Diff');
        await fill(
          page,
          'Original JSON',
          '{"name":"Mohsen","age":30,"updatedAt":1,"items":[{"id":1,"n":"a"},{"id":2,"n":"b"}]}',
        );
        await fill(
          page,
          'New JSON',
          '{"name":"Mohsen","age":31,"updatedAt":2,"email":"test@example.com","items":[{"id":2,"n":"B"},{"id":1,"n":"a"}]}',
        );
        await (await page.$('input[aria-label="Ignore paths"]')).type('updatedAt');
        await clickButton(page, 'Compare');
      }),
  },
  {
    title: 'Generate API code instantly',
    sub: 'cURL, C# (with typed models), JavaScript and Python — from a form, cURL, raw HTTP or OpenAPI.',
    shot: () =>
      popupShot(async (page) => {
        await clickTab(page, 'HTTP');
        await page.select('select[aria-label="HTTP method"]', 'POST');
        await (await page.$('input[aria-label="URL"]')).type('https://api.example.com/orders');
        await (await page.$('input[aria-label="Header 1 name"]')).type('Authorization');
        await (await page.$('input[aria-label="Header 1 value"]')).type('Bearer ***');
        await fill(page, 'Body', '{"productId":123,"quantity":2}');
        await fill(
          page,
          'Sample response',
          '{"id":"7c9e6679-7425-40de-944b-e07fc1f90ae7","status":"created","total":19.99}',
        );
        await clickButton(page, 'Generate C# models');
        await page.evaluate(() => {
          document.querySelector('main').scrollTop =
            document.querySelector('figure').offsetTop - 12;
        });
      }),
  },
  {
    title: 'Everything a developer needs',
    sub: 'Hashes, UUIDs, ULIDs, regex, Base64, timestamps and an HTTP status reference.',
    shot: () =>
      popupShot(async (page) => {
        await clickTab(page, 'Tools');
        await clickTab(page, 'Generate');
      }),
  },
];

const card = (inner) => `<!doctype html><html><head><style>
  *{box-sizing:border-box;margin:0}
  body{font-family:Inter,'Segoe UI',system-ui,sans-serif;color:#e8ebf7;
    background:radial-gradient(900px 500px at 85% -10%,rgba(99,102,241,.55),transparent 60%),
               radial-gradient(700px 420px at -5% 110%,rgba(168,85,247,.45),transparent 60%),#0b0d1a}
  ${inner.css}
</style></head><body>${inner.html}</body></html>`;

async function render(w, h, inner, file) {
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
  await page.setContent(card(inner), { waitUntil: 'load' });
  await page.screenshot({ path: join(out, file) });
  await page.close();
}

const logo = `<svg width="64" height="64" viewBox="0 0 32 32"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6366f1"/><stop offset="1" stop-color="#a855f7"/></linearGradient></defs><rect width="32" height="32" rx="9" fill="url(#g)"/><circle cx="14.5" cy="14.5" r="6.2" fill="none" stroke="#fff" stroke-width="2.6"/><path d="M19.4 19.4L25 25" stroke="#fff" stroke-width="2.8" stroke-linecap="round"/><path d="M11.6 14.5h5.8M14.5 11.6v5.8" stroke="#fff" stroke-opacity=".55" stroke-width="1.4" stroke-linecap="round"/></svg>`;

for (const [i, s] of scenes.entries()) {
  const png = await s.shot();
  await render(
    1280,
    800,
    {
      css: `body{width:1280px;height:800px;display:flex;align-items:center;padding:0 90px;gap:70px}
        .t{flex:1}.t h1{font-size:54px;line-height:1.08;font-weight:800;letter-spacing:-1px}
        .t p{margin-top:22px;font-size:24px;line-height:1.4;color:#b6bcd8}
        .badge{margin-top:34px;display:inline-flex;gap:10px;align-items:center;padding:10px 18px;border:1px solid #2a2f4a;border-radius:999px;font-size:18px;color:#9ae6b4;background:rgba(17,20,34,.7)}
        img{height:700px;border-radius:18px;box-shadow:0 30px 80px rgba(0,0,0,.55),0 0 0 1px #2a2f4a}`,
      html: `<div class="t"><h1>${s.title}</h1><p>${s.sub}</p><div class="badge">🔒 100% local · works offline · no tracking</div></div><img src="data:image/png;base64,${png}"/>`,
    },
    `screenshot-${i + 1}.png`,
  );
}

await render(
  440,
  280,
  {
    css: `body{width:440px;height:280px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;text-align:center}
      h1{font-size:44px;font-weight:800;letter-spacing:-1px}h1 span{background:linear-gradient(90deg,#818cf8,#c084fc);-webkit-background-clip:text;color:transparent}
      p{font-size:17px;color:#b6bcd8;padding:0 30px;line-height:1.35}`,
    html: `${logo}<h1>Dev<span>Lens</span></h1><p>Privacy-first toolbox for JWTs, JSON, HTTP &amp; encodings</p>`,
  },
  'promo-small.png',
);

await render(
  1400,
  560,
  {
    css: `body{width:1400px;height:560px;display:flex;align-items:center;justify-content:center;gap:50px;text-align:left}
      h1{font-size:92px;font-weight:800;letter-spacing:-2px}h1 span{background:linear-gradient(90deg,#818cf8,#c084fc);-webkit-background-clip:text;color:transparent}
      p{font-size:30px;color:#b6bcd8;margin-top:14px;max-width:700px;line-height:1.35}svg{width:150px;height:150px}`,
    html: `${logo}<div><h1>Dev<span>Lens</span></h1><p>Decode JWTs, convert JSON, diff, generate API code — 100% local.</p></div>`,
  },
  'promo-marquee.png',
);

await browser.close();
server.close();
console.log(`Store graphics written to ${out}`);
