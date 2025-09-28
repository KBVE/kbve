import { atom } from 'nanostores';

import type { DeployableMessage } from './schemas';

export const $deployable = atom<DeployableMessage | null>(null);
