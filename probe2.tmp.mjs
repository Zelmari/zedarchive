import { chromium } from '@playwright/test';
const BASE = process.argv[2] || 'http://127.0.0.1:3100';
const email = `probe-${Date.now().toString(36)}@zedarchive.test`;
const res = await fetch(`${BASE}/api/auth/sign-up/email`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: BASE },
  body: JSON.stringify({ name: 'Probe', email, password: 'e2e-Password123!' }),
});
if (!res.ok) {
  console.log('signup failed', res.status);
  process.exit(1);
}
const cookies = res.headers.getSetCookie().map((h) => {
  const [pair] = h.split(';');
  const i = pair.indexOf('=');
  return {
    name: pair.slice(0, i),
    value: pair.slice(i + 1),
    domain: new URL(BASE).hostname,
    path: '/',
    secure: true,
  };
});
const b = await chromium.launch();
const ctx = await b.newContext();
await ctx.addCookies(cookies);
const p = await ctx.newPage();
await p.goto(`${BASE}/dashboard`);
await p.waitForTimeout(1500);
const out = await p.evaluate(() => {
  const g = (label, el, props) =>
    el
      ? label + ': ' + props.map((k) => `${k}=${getComputedStyle(el)[k]}`).join(' ')
      : label + ': NOT FOUND';
  const pill = Array.from(document.querySelectorAll('button')).find((x) =>
    x.textContent.trim().startsWith('All ('),
  );
  const masthead = document.querySelector('h1')?.parentElement;
  const results = [
    g('pill[All]', pill, ['padding', 'borderRadius', 'backgroundColor']),
    g('mastheadDiv', masthead, [
      'padding',
      'marginBottom',
      'borderRadius',
      'boxShadow',
      'backgroundColor',
    ]),
    g(
      'addBtn',
      Array.from(document.querySelectorAll('button')).find((x) => x.textContent.includes('Add')),
      ['padding', 'minHeight'],
    ),
    'sheets: ' +
      Array.from(document.styleSheets)
        .map((s) => {
          try {
            return s.cssRules.length;
          } catch {
            return 'X';
          }
        })
        .join(','),
  ];
  // open theme modal
  return results;
});
console.log(out.join('\n'));
// theme modal probe
await p
  .getByTitle('Change Theme (Press T)')
  .click()
  .catch(() => p.keyboard.press('t'));
await p.waitForTimeout(600);
const modal = await p.evaluate(() => {
  const dlg = document.querySelector('[role="dialog"]');
  if (!dlg) return 'no dialog';
  const inner = dlg.querySelector('div > div') || dlg;
  const cs = getComputedStyle(inner);
  const firstPara = dlg.querySelector('p');
  return g2();
  function g2() {
    return [
      'dialog padding-inner:' + cs.padding,
      'dialog maxWidth:' + cs.maxWidth,
      firstPara
        ? 'para fontSize:' +
          getComputedStyle(firstPara).fontSize +
          ' mb:' +
          getComputedStyle(firstPara).marginBottom
        : 'para missing',
    ].join(' | ');
  }
});
console.log(modal);
await b.close();
