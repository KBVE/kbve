import { memo } from 'react';
import { AppCard } from './cards/AppCard';
import { MenuItem } from './menus/MenuItem';
import type { UIEntity } from './models';

export const EntityRenderer = memo(function EntityRenderer({
	entity,
}: {
	entity: UIEntity;
}) {
	switch (entity.kind) {
		case 'card':
			return <AppCard model={entity} />;
		case 'menu-item':
			return <MenuItem model={entity} />;
		default:
			return null;
	}
});
