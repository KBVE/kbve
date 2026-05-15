import { describe, it, expect, beforeAll } from 'vitest';
import { BASE_URL, waitForReady } from './helpers/http';

describe('Recently added pages', () => {
	beforeAll(async () => {
		await waitForReady();
	});

	describe('/donate/', () => {
		it('serves 200 with HTML', async () => {
			const res = await fetch(`${BASE_URL}/donate/`);
			expect(res.status).toBe(200);
			const ct = res.headers.get('content-type') ?? '';
			expect(ct).toContain('text/html');
		});

		it('renders the hero badge and CTA copy', async () => {
			const body = await (await fetch(`${BASE_URL}/donate/`)).text();
			expect(body).toContain('Support KBVE');
			expect(body).toContain('Sponsor on GitHub');
			expect(body).toContain('Back on Patreon');
		});

		it('hero CTA points at github sponsors + patreon', async () => {
			const body = await (await fetch(`${BASE_URL}/donate/`)).text();
			expect(body).toContain('github.com/sponsors/kbve');
			expect(body).toContain('patreon.com/KBVE');
		});
	});

	describe('/discord/', () => {
		it('serves 200 with HTML', async () => {
			const res = await fetch(`${BASE_URL}/discord/`);
			expect(res.status).toBe(200);
			expect(res.headers.get('content-type') ?? '').toContain(
				'text/html',
			);
		});

		it('renders the hero badge and CTA', async () => {
			const body = await (await fetch(`${BASE_URL}/discord/`)).text();
			expect(body).toContain('KBVE Community');
			expect(body).toContain('Join the server');
		});

		it('Join button points at the working sSyHAxJY invite', async () => {
			const body = await (await fetch(`${BASE_URL}/discord/`)).text();
			expect(body).toContain('discord.com/invite/sSyHAxJY');
		});
	});

	describe('/gaming/', () => {
		it('serves the splash page', async () => {
			const res = await fetch(`${BASE_URL}/gaming/`);
			expect(res.status).toBe(200);
		});

		it('hub auto-lists every game in the gaming collection', async () => {
			const body = await (await fetch(`${BASE_URL}/gaming/`)).text();
			for (const slug of [
				'/gaming/bitcraft/',
				'/gaming/lol/',
				'/gaming/rimworld/',
				'/gaming/titanfall/',
				'/gaming/wow/',
			]) {
				expect(body).toContain(slug);
			}
		});

		it('contributor steps section is present', async () => {
			const body = await (await fetch(`${BASE_URL}/gaming/`)).text();
			expect(body).toContain('Add your own');
		});
	});

	describe('/profile/account/', () => {
		it('serves the account page for anon visitors', async () => {
			const res = await fetch(`${BASE_URL}/profile/account/`);
			expect(res.status).toBe(200);
		});

		it('mounts the wallet card shell + sign-in fallback', async () => {
			const body = await (
				await fetch(`${BASE_URL}/profile/account/`)
			).text();
			expect(body).toContain('data-kbve-wallet-shell');
			expect(body).toContain('Sign in to view your wallet');
		});
	});
});
