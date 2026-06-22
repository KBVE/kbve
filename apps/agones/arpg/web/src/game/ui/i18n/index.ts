import { laserI18n } from '@kbve/laser';
import { en } from './en';

let registered = false;

export function registerArpgI18n(): void {
	if (registered) return;
	laserI18n.add('en', en);
	registered = true;
}

export { en };
