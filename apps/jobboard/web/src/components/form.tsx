import type { FieldError } from 'react-hook-form';

// Shared field chrome so every RHF + zod form looks identical. Import these
// instead of re-declaring the Tailwind strings per form.
const fieldBase =
	'rounded-lg border border-zinc-700 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-quest-500 focus:outline-none';

// Default block field — full width.
export const fieldCls = `w-full ${fieldBase}`;

// Same chrome WITHOUT a width, for fields inside a flex row where the parent
// controls sizing (e.g. select + input pairs). Using fieldCls there makes
// `w-full` collide with the sibling's width and one steals the whole row.
export const fieldClsRow = fieldBase;

export const labelCls =
	'mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-400';

// Red border when a field has a validation error.
export const errBorder = (e?: unknown) => (e ? 'border-red-500' : '');

// Inline message under a field. Accepts RHF's FieldError (or anything with a
// .message) so it works for nested/array fields too.
export function FieldMessage({
	error,
}: {
	error?: FieldError | { message?: string };
}) {
	if (!error?.message) return null;
	return <p className="mt-1 text-xs text-red-400">{error.message}</p>;
}
