/// <reference path=".astro/types.d.ts" />
/// <reference types="astro/client" />
/// <reference path="../../../../packages/npm/astro/src/starlight-virtual.d.ts" />

declare namespace App {
	interface Locals {
		kbveSection?: import('@/components/dashboard/sectionNav').SectionShell;
	}
}
