import { chromium } from '@playwright/test';
const BASE = 'https://zedarchive.com';
const email = `probe-${Date.now().toString(36)}@zedarchive.test`;
const res = await fetch(`${BASE}/api/auth/sign-up/email`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: BASE },
  body: JSON.stringify({ name: 'P', email, password: 'e2e-Password123!' }),
});
console.log('signup:', res.status);
const cookies = res.headers.getSetCookie().map((h) => {
  const [p] = h.split(';');
  const i = p.indexOf('=');
  return {
    name: p.slice(0, i),
    value: p.slice(i + 1),
    domain: new URL(BASE).hostname,
    path: '/',
    secure: true,
  };
});
const { config } = await import('dotenv');
config({ path: '.env.local' });
const postgres = (await import('postgres')).default;
const sql = postgres(process.env.DATABASE_URL, { max: 1 });
const uid = (await sql`SELECT id FROM "user" WHERE email=${email}`)[0].id;
await sql`INSERT INTO media_entries (id,user_id,title,category,status,primary_unit_current,primary_unit_total,secondary_unit_current,structure,tags,notes,created_at,updated_at)
VALUES (${crypto.randomUUID()},${uid},'Probe Manga','manga','in_progress',3,6,40,'[{"number":1,"name":"V1","total":null},{"number":2,"name":"V2","total":null},{"number":3,"name":"V3","total":null},{"number":4,"name":"V4","total":null},{"number":5,"name":"V5","total":null},{"number":6,"name":"V6","total":null}]'::jsonb,'[]','note',now(),now())`;
await sql.end();
const b = await chromium.launch();
const ctx = await b.newContext();
await ctx.addCookies(cookies);
const p = await ctx.newPage();
await p.goto(`${BASE}/dashboard`);
await p.waitForTimeout(2000);
console.log(
  await p.evaluate(() => {
    const row = [...document.querySelectorAll('div')].find(
      (x) => /^Volume \d+ of \d+$/.test(x.textContent.trim()) && x.querySelector('button'),
    );
    if (!row) return 'ROW NOT FOUND';
    const c = getComputedStyle(row);
    const sheets = [...document.styleSheets]
      .map((s) => {
        try {
          return s.cssRules.length;
        } catch {
          return 'X';
        }
      })
      .join(',');
    return `borders T:${c.borderTopWidth} ${c.borderTopStyle} | R:${c.borderRightWidth} ${c.borderRightStyle} | B:${c.borderBottomWidth} ${c.borderBottomStyle} | L:${c.borderLeftWidth} ${c.borderLeftStyle}\npadding:${c.padding}\nsheets rules:[${sheets}]`;
  }),
);
// cleanup
const { config: cfg2 } = await import('dotenv');
cfg2({ path: '.env.local' });
const sql2 = (await import('postgres')).default(process.env.DATABASE_URL, { max: 1 });
await sql2`DELETE FROM "user" WHERE email=${email}`;
await sql2.end();
await b.close();
