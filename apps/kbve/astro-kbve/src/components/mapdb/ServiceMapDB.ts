// ServiceMapDB.ts
import type {
	IMapObject,
	IResource,
	IStructure,
} from '@/data/schema/IMapSchema';
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
			resource: '<2',
			structure: '<�',
		};
		return typeIcons[type] || 'S';
	}

	static getResourceTypeIcon(resourceType: string): string {
		const resourceTypeIcons: Record<string, string> = {
			wood: '>�',
			stone: '>�',
			metal: '�',
			food: '<>',
			none: 'S',
		};
		return resourceTypeIcons[resourceType] || 'S';
	}

	static getStructureTypeIcon(structureType: string): string {
		const structureTypeIcons: Record<string, string> = {
			building: '<�',
			wall: '>�',
			tower: '=�',
			decoration: '(',
		};
		return structureTypeIcons[structureType] || '<�';
	}

	// Tooltip generation functions
	static generateResourceTooltip(resource: IResource): TooltipData {
		const efficiency = (resource.amount / resource.maxAmount) * 100;
		const statusText = resource.isHarvestable ? 'Available' : 'Depleted';

		return {
			content: `${resource.name}: ${efficiency.toFixed(0)}% full, ${resource.harvestYield} yield per ${resource.harvestTime}s harvest. Status: ${statusText}`,
			ariaLabel: `Resource ${resource.name}, ${efficiency.toFixed(0)} percent full, harvest yield ${resource.harvestYield} per ${resource.harvestTime} seconds, currently ${statusText}`,
			priority: resource.isHarvestable ? 'high' : 'low',
		};
	}

	static generateStructureTooltip(structure: IStructure): TooltipData {
		const walkableText = structure.isWalkable ? 'walkable' : 'non-walkable';
		const placementText = structure.blocksPlacement
			? 'blocks placement'
			: 'allows placement';

		return {
			content: `${structure.name}: ${structure.footprintWidth}�${structure.footprintHeight} ${walkableText} structure, ${structure.maxHealth} HP, ${placementText}`,
			ariaLabel: `Structure ${structure.name}, footprint ${structure.footprintWidth} by ${structure.footprintHeight}, ${walkableText}, ${structure.maxHealth} health points, ${placementText}`,
			priority: 'medium',
		};
	}

	static generateTooltip(mapObject: IMapObject): TooltipData {
		switch (mapObject.type) {
			case 'resource':
				return this.generateResourceTooltip(mapObject);
			case 'structure':
				return this.generateStructureTooltip(mapObject);
			default:
				// Exhaustive check - this should never be reached
				const _exhaustiveCheck: never = mapObject;
				throw new Error(
					`Unhandled map object type: ${_exhaustiveCheck}`,
				);
		}
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
		resource: IResource,
	): 'abundant' | 'moderate' | 'low' | 'depleted' {
		if (!resource.isHarvestable || resource.isDepleted) return 'depleted';

		const percentage = (resource.amount / resource.maxAmount) * 100;
		if (percentage >= 75) return 'abundant';
		if (percentage >= 40) return 'moderate';
		return 'low';
	}

	static getStructureStatus(
		structure: IStructure,
	): 'healthy' | 'damaged' | 'critical' {
		// This could be extended with actual health percentage if available
		return 'healthy';
	}

	// SEO helpers
	static generateMetaDescription(mapObject: IMapObject): string {
		const tooltip = this.generateTooltip(mapObject);
		return tooltip.content;
	}

	static generateKeywords(mapObject: IMapObject): string[] {
		const keywords = [mapObject.type, mapObject.name.toLowerCase()];

		if (mapObject.type === 'resource') {
			keywords.push(
				'resource',
				mapObject.resourceType,
				'harvest',
				'yield',
			);
		} else if (mapObject.type === 'structure') {
			keywords.push(
				'structure',
				mapObject.structureType,
				'building',
				'construction',
			);
		}

		return keywords;
	}

	// Event handling methods
	static emitMapDBEvent(event: MapDBEvent): void {
		try {
			// Use predefined event types from eventEngine
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

	// Event listener registration helpers
	static registerEventListeners(): void {
		// Register MapDB-specific event listeners for each event type using mapped event names
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
					// Handle analytics, logging, or other side effects
					console.debug('MapDB Event:', event);

					// Add analytics tracking for tooltip interactions
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
		// Remove listeners for all MapDB event types using mapped event names
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
