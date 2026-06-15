// Headless smoke: load the dev/preview URL, capture console + page errors,
// report whether the app actually mounted. Usage: node scripts/smoke.mjs <url>
import { chromium } from 'playwright';

const url = process.argv[2] || 'http://127.0.0.1:5401/';
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('console', (m) => {
	if (m.type() === 'error') errors.push(`console.error: ${m.text()}`);
});
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

await page.goto(url, { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(2500);

const rootText = (await page.locator('#root').innerText().catch(() => '')) || '';
const html = await page.locator('#root').innerHTML().catch(() => '');

console.log('mounted:', html.length > 0);
console.log('root text:', JSON.stringify(rootText.slice(0, 200)));
console.log('errors:', errors.length);
for (const e of errors) console.log('  -', e.slice(0, 300));

await browser.close();
process.exit(errors.length > 0 ? 1 : 0);
