import type { Page } from '@playwright/test';

/** Browsers where headless WebGL reliably initialises for the Phaser canvas. */
export const WEBGL_BROWSERS = ['chromium'];

export function supportsWebGL(browserName: string): boolean {
	return WEBGL_BROWSERS.includes(browserName);
}

export async function isMobileViewport(page: Page): Promise<boolean> {
	const width = page.viewportSize()?.width ?? 1280;
	return width < 800;
}

export async function getMeta(
	page: Page,
	name: string,
): Promise<string | null> {
	return page.locator(`meta[name="${name}"]`).first().getAttribute('content');
}

export async function getMetaProperty(
	page: Page,
	property: string,
): Promise<string | null> {
	return page
		.locator(`meta[property="${property}"]`)
		.first()
		.getAttribute('content');
}
