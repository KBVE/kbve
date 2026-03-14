// ServiceMapDB.ts
import type { IMapObject } from '@/data/schema/IMapSchema';
import { eventEngine } from '@/lib/eventEngine';

export interface TooltipData {
	content: string;
	ariaLabel: string;
	priority: 'low' | 'medium' | 'high';
}

export interface MapDBEvent {
	type:
		| 'tooltip_show'
		| 'tooltip_hide'
		| 'object_focus'
		| 'object_interact'
		| 'accessibility_action';
	mapObject: IMapObject;
	data?: any;
	timestamp: number;
}

export class ServiceMapDB {
	// Format key utility
	static formatKey(key: string): string {
		return key
			.replace(/_/g, ' ')
			.replace(/([a-z])([A-Z])/g, '$1 $2')
			.replace(/\b\w/g, (char) => char.toUpperCase());
	}

	// Type-specific icons
	static getTypeIcon(type: string): string {
		const typeIcons: Record<string, string> = {
			tree: '\u{1F332}',
			rock: '\u{1FAA8}',
			crystal: '\u{1F48E}',
			flower: '\u{1F33B}',
			mushroom: '\u{1F344}',
			chest: '\u{1F4E6}',
			campfire: '\u{1F525}',
			portal: '\u{1F300}',
		};
		return typeIcons[type] || '\u{2753}';
	}

	static getSubKindIcon(subKind: string): string {
		const icons: Record<string, string> = {
			oak: '\u{1F333}',
			redwood: '\u{1F332}',
			copper_ore: '\u{1F7E0}',
			iron_ore: '\u{26D3}\u{FE0F}',
			gold_ore: '\u{1F4B0}',
			silver_ore: '\u{1FA99}',
			mithril_ore: '\u{1F535}',
			adamantine_ore: '\u{1F48E}',
			cobalt_ore: '\u{1F537}',
			uranium_ore: '\u{2622}\u{FE0F}',
			coal: '\u{26AB}',
			salt: '\u{1F9C2}',
			jade: '\u{1F49A}',
			ruby: '\u{2764}\u{FE0F}',
			sapphire: '\u{1F499}',
		};
		return icons[subKind] || '\u{2753}';
	}

	// Tooltip generation
	static generateTooltip(mapObject: IMapObject): TooltipData {
		const amount = mapObject.initial_amount ?? mapObject.max_amount ?? 0;
		const maxAmount = mapObject.max_amount ?? 0;
		const efficiency = maxAmount > 0 ? (amount / maxAmount) * 100 : 0;
		const statusText = mapObject.interactable ? 'Available' : 'Unavailable';
		const harvestTimeSecs = mapObject.harvest_time_ms
			? (mapObject.harvest_time_ms / 1000).toFixed(1)
			: '?';

		return {
			content: `${mapObject.name}: ${efficiency.toFixed(0)}% full, ${mapObject.harvest_yield ?? 0} yield per ${harvestTimeSecs}s harvest. Status: ${statusText}`,
			ariaLabel: `${mapObject.type} ${mapObject.name}, ${efficiency.toFixed(0)} percent full, harvest yield ${mapObject.harvest_yield ?? 0} per ${harvestTimeSecs} seconds, currently ${statusText}`,
			priority: mapObject.interactable ? 'high' : 'low',
		};
	}

	// Accessibility helpers
	static generateAriaLabel(mapObject: IMapObject): string {
		const tooltip = this.generateTooltip(mapObject);
		return tooltip.ariaLabel;
	}

	static generateDescription(mapObject: IMapObject): string {
		return mapObject.description || `${mapObject.type} type map object`;
	}

	// Status helpers for styling
	static getResourceStatus(
		mapObject: IMapObject,
	): 'abundant' | 'moderate' | 'low' | 'depleted' {
		if (!mapObject.interactable) return 'depleted';

		const amount = mapObject.initial_amount ?? mapObject.max_amount ?? 0;
		const maxAmount = mapObject.max_amount ?? 1;
		const percentage = (amount / maxAmount) * 100;
		if (percentage >= 75) return 'abundant';
		if (percentage >= 40) return 'moderate';
		return 'low';
	}

	// SEO helpers
	static generateMetaDescription(mapObject: IMapObject): string {
		const tooltip = this.generateTooltip(mapObject);
		return tooltip.content;
	}

	static generateKeywords(mapObject: IMapObject): string[] {
		const keywords = [mapObject.type, mapObject.name.toLowerCase()];
		if (mapObject.sub_kind) {
			keywords.push(mapObject.sub_kind);
		}
		keywords.push('harvest', 'resource');
		return keywords;
	}

	// Event handling methods
	static emitMapDBEvent(event: MapDBEvent): void {
		try {
			const eventTypeMap = {
				tooltip_show: 'ui:tooltip:show',
				tooltip_hide: 'ui:tooltip:hide',
				object_focus: 'mapdb:object:focus',
				object_interact: 'mapdb:object:interact',
				accessibility_action: 'mapdb:accessibility:action',
			};

			const mappedEventType = eventTypeMap[event.type] || event.type;
			eventEngine.emit(mappedEventType, 'mapdb', event);
		} catch (error) {
			console.warn('Failed to emit MapDB event:', error);
		}
	}

	static onTooltipShow(
		mapObject: IMapObject,
		tooltipData?: TooltipData,
	): void {
		this.emitMapDBEvent({
			type: 'tooltip_show',
			mapObject,
			data: tooltipData,
			timestamp: Date.now(),
		});
	}

	static onTooltipHide(mapObject: IMapObject): void {
		this.emitMapDBEvent({
			type: 'tooltip_hide',
			mapObject,
			timestamp: Date.now(),
		});
	}

	static onObjectFocus(
		mapObject: IMapObject,
		focusMethod: 'mouse' | 'keyboard' | 'programmatic',
	): void {
		this.emitMapDBEvent({
			type: 'object_focus',
			mapObject,
			data: { focusMethod },
			timestamp: Date.now(),
		});
	}

	static onObjectInteract(
		mapObject: IMapObject,
		interactionType: 'click' | 'keyboard' | 'touch',
	): void {
		this.emitMapDBEvent({
			type: 'object_interact',
			mapObject,
			data: { interactionType },
			timestamp: Date.now(),
		});
	}

	static onAccessibilityAction(
		mapObject: IMapObject,
		action: string,
		details?: any,
	): void {
		this.emitMapDBEvent({
			type: 'accessibility_action',
			mapObject,
			data: { action, details },
			timestamp: Date.now(),
		});
	}

	static registerEventListeners(): void {
		const eventTypeMap = {
			tooltip_show: 'ui:tooltip:show',
			tooltip_hide: 'ui:tooltip:hide',
			object_focus: 'mapdb:object:focus',
			object_interact: 'mapdb:object:interact',
			accessibility_action: 'mapdb:accessibility:action',
		};

		Object.values(eventTypeMap).forEach((eventType) => {
			eventEngine.on(eventType, (event) => {
				if (event.source === 'mapdb') {
					console.debug('MapDB Event:', event);
					if (eventType.includes('tooltip')) {
						console.info(
							`Tooltip ${eventType.includes('show') ? 'shown' : 'hidden'} for:`,
							event.data?.mapObject?.name,
						);
					}
				}
			});
		});
	}

	static unregisterEventListeners(): void {
		const eventTypeMap = {
			tooltip_show: 'ui:tooltip:show',
			tooltip_hide: 'ui:tooltip:hide',
			object_focus: 'mapdb:object:focus',
			object_interact: 'mapdb:object:interact',
			accessibility_action: 'mapdb:accessibility:action',
		};

		Object.values(eventTypeMap).forEach((eventType) => {
			eventEngine.off(eventType);
		});
	}
}
