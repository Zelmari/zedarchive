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
const page = await ctx.newPage();
await page.goto(`${BASE}/dashboard`);
await page.waitForTimeout(1200);

async function inspect(label) {
  const d = await page.evaluate(() => {
    const dlg = document.querySelector('[role="dialog"]');
    if (!dlg) return 'NO DIALOG';
    const cs = getComputedStyle(dlg);
    // find a padded inner section + any statCard-ish element
    const inner =
      dlg.querySelector('.px-\\[var\\(--za-space-6\\)\\]') ||
      dlg.querySelector('form') ||
      dlg.firstElementChild;
    const ics = inner ? getComputedStyle(inner) : null;
    return {
      bg: cs.backgroundColor,
      border: cs.borderTopWidth + ' ' + cs.borderTopStyle + ' ' + cs.borderTopColor,
      radius: cs.borderRadius,
      shadow: cs.boxShadow.slice(0, 60),
      maxWidth: cs.maxWidth,
      innerPadding: ics ? ics.padding : 'n/a',
      innerText: (dlg.textContent || '').slice(0, 40),
    };
  });
  console.log(label, JSON.stringify(d));
  const esc = await page.evaluate(() => {
    const b = document.querySelector('[role="dialog"]');
    return !!b;
  });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(350);
}

// STATS via S
await page.keyboard.press('s');
await page.waitForTimeout(700);
await inspect('STATS');
// BACKUP via B (+switch to import tab later if needed)
await page.keyboard.press('b');
await page.waitForTimeout(700);
await inspect('BACKUP');
// THEME via T
await page.keyboard.press('t');
await page.waitForTimeout(700);
await inspect('THEME');
// SHORTCUTS via ?
await page.keyboard.press('?');
await page.waitForTimeout(500);
await inspect('SHORTCUTS');
// ACTIVITY: click button
await page.getByTitle('View Activity Log & Streaks').click();
await page.waitForTimeout(800);
await inspect('ACTIVITY');
// SHARE
await page.getByTitle('Public Share Profile').click();
await page.waitForTimeout(600);
await inspect('SHARE');

// generic utility sanity
const sanity = await page.evaluate(() => {
  const t = document.createElement('div');
  t.className = 'hidden';
  document.body.appendChild(t);
  const hidden = getComputedStyle(t).display === 'none';
  t.className = 'p-4';
  const p4 = getComputedStyle(t).padding;
  t.className = 'rounded-control';
  const rc = getComputedStyle(t).borderRadius;
  t.remove();
  let layerInfo = '';
  for (const sh of document.styleSheets) {
    try {
      for (const r of sh.cssRules) {
        if (r instanceof CSSLayerBlockRule && r.name === 'utilities') {
          layerInfo = 'utilities layer rules: ' + r.cssRules.length;
          const sample = [...r.cssRules].find((x) => x.selectorText === '.bg-surface');
          layerInfo += ' | .bg-surface found: ' + !!sample;
        }
      }
    } catch {}
  }
  return `hidden works:${hidden} p-4:${p4} rounded-control:${rc} ${layerInfo}`;
});
console.log(sanity);
await b.close();
