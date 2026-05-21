export type UnitKindId = 'melee' | 'archer';

const UNIT_COLS = 10;
const UNIT_ROWS = 10;

function validate(grid: string[]): string[] {
	if (grid.length !== UNIT_ROWS) {
		throw new Error(
			`Unit grid must have ${UNIT_ROWS} rows, got ${grid.length}`,
		);
	}
	for (let i = 0; i < grid.length; i++) {
		if (grid[i].length !== UNIT_COLS) {
			throw new Error(
				`Unit grid row ${i} length ${grid[i].length} != ${UNIT_COLS}`,
			);
		}
	}
	return grid;
}

export const UNIT_GRIDS: Record<UnitKindId, string[]> = {
	melee: validate([
		'...0000...',
		'..040040..',
		'..043340..',
		'..0433400.',
		'.00444440.',
		'.0.444440.',
		'.0.044400.',
		'...04440..',
		'...04.40..',
		'...0..0...',
	]),
	archer: validate([
		'...0000...',
		'..030030..',
		'..033330.0',
		'..033330.0',
		'..033330.0',
		'.0033330..',
		'.0.033300.',
		'...04040..',
		'...04.40..',
		'...0..0...',
	]),
};

export const UNIT_PIXEL_SIZE = 3;
