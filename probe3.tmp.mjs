import { chromium } from '@playwright/test';
const BASE = 'http://localhost:8787';
const email = `probe-${Date.now().toString(36)}@zedarchive.test`;
const res = await fetch(`${BASE}/api/auth/sign-up/email`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: BASE },
  body: JSON.stringify({ name: 'P', email, password: 'e2e-Password123!' }),
});
const cookies = res.headers.getSetCookie().map((h) => {
  const [p] = h.split(';');
  const i = p.indexOf('=');
  return { name: p.slice(0, i), value: p.slice(i + 1), domain: new URL(BASE).hostname, path: '/' };
});
const b = await chromium.launch();
const ctx = await b.newContext();
await ctx.addCookies(cookies);
const p = await ctx.newPage();
await p.goto(`${BASE}/dashboard`);
await p.waitForTimeout(1200);
console.log(
  await p.evaluate(() => {
    const g = (el, props) =>
      el ? props.map((k) => `${k}=${getComputedStyle(el)[k]}`).join(' ') : 'NOT FOUND';
    const h1 = document.querySelector('h1');
    const mast = h1?.closest('main')?.querySelector('.za-container > div');
    const pill = [...document.querySelectorAll('button')].find((x) =>
      x.textContent.trim().startsWith('All ('),
    );
    return [
      'MASTHEAD ' +
        g(mast, [
          'padding',
          'marginBottom',
          'borderRadius',
          'boxShadow',
          'backgroundColor',
          'border',
        ]),
      'PILL ' + g(pill, ['padding', 'fontSize']),
      'ADD ' +
        g(
          [...document.querySelectorAll('button')].find((x) => x.textContent.includes('Add')),
          ['padding', 'minHeight', 'fontSize'],
        ),
    ].join('\n');
  }),
);
await b.close();
