/** @jsxImportSource react */
import React, { useState, useEffect, useMemo } from 'react';
import { Virtuoso } from 'react-virtuoso';
import { z } from 'zod';
import { useStore } from '@nanostores/react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { AlertCircle, RefreshCw } from 'lucide-react';

const cn = (...inputs: any[]) => {
	return twMerge(clsx(inputs));
};

// Generic interface for any data item
export interface VirtuosoDataItem {
	[key: string]: any;
}

// Generic props interface that accepts any schema
export interface ReactVirtuosoProps<T extends VirtuosoDataItem> {
	/** API endpoint to fetch JSON data from */
	apiEndpoint: string;
	/** Zod schema for data validation */
	dataSchema: z.ZodSchema<T[]> | z.ZodSchema<{ [key: string]: any }>;
	/** Function to extract array from API response (for nested data) */
	dataExtractor?: (response: any) => T[];
	/** Height of the virtualized container */
	height?: number;
	/** Number of items to display per page for pagination */
	itemsPerPage?: number;
	/** Filter function for items */
	filter?: (item: T) => boolean;
	/** Sort function for items */
	sortBy?: (a: T, b: T) => number;
	/** Custom item renderer */
	renderItem: (item: T, index: number) => React.ReactNode;
	/** Loading state component */
	loadingComponent?: React.ReactNode;
	/** Error state component */
	errorComponent?: (error: string) => React.ReactNode;
	/** Empty state component */
	emptyComponent?: React.ReactNode;
	/** Additional fetch options */
	fetchOptions?: RequestInit;
	/** Container class name */
	className?: string;
	/** Custom container styles */
	containerStyle?: React.CSSProperties;
}

// Default components using Starlight CSS variables and cn utility
const DefaultLoadingComponent = () => (
	<div className={cn("flex items-center justify-center p-8")}>
		<RefreshCw 
			className={cn("w-6 h-6 animate-spin mr-2")} 
			style={{ color: 'var(--sl-color-accent)' }} 
		/>
		<span className={cn("text-sm")} style={{ color: 'var(--sl-color-text)' }}>
			Loading data...
		</span>
	</div>
);

const DefaultErrorComponent = (error: string) => (
	<div className={cn("flex items-center justify-center p-8")} style={{ color: 'var(--sl-color-red)' }}>
		<AlertCircle className={cn("w-6 h-6 mr-2")} />
		<span className={cn("text-sm")}>Error: {error}</span>
	</div>
);

const DefaultEmptyComponent = () => (
	<div className={cn("flex items-center justify-center p-8 opacity-60")}>
		<span className={cn("text-sm")} style={{ color: 'var(--sl-color-gray-2)' }}>
			No data found
		</span>
	</div>
);

export const ReactVirtuoso = <T extends VirtuosoDataItem>({
	apiEndpoint,
	dataSchema,
	dataExtractor,
	height = 600,
	itemsPerPage = 100,
	filter,
	sortBy,
	renderItem,
	loadingComponent = <DefaultLoadingComponent />,
	errorComponent = DefaultErrorComponent,
	emptyComponent = <DefaultEmptyComponent />,
	fetchOptions = {},
	className = '',
	containerStyle = {},
}: ReactVirtuosoProps<T>): React.ReactElement => {
	const [data, setData] = useState<T[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [retryCount, setRetryCount] = useState(0);

	// Client-side data fetching and validation
	useEffect(() => {
		// Ensure we're running in the browser (client-side only)
		if (typeof window === 'undefined') {
			console.warn('ReactVirtuoso: Component should only be used client-side');
			return;
		}

		const fetchData = async () => {
			try {
				setLoading(true);
				setError(null);

				const response = await fetch(apiEndpoint, {
					headers: {
						'Content-Type': 'application/json',
						...fetchOptions.headers,
					},
					...fetchOptions,
				});

				if (!response.ok) {
					throw new Error(`HTTP error! status: ${response.status}`);
				}

				const rawData = await response.json();
				
				// Extract data array from response
				let dataArray: T[];
				if (dataExtractor) {
					dataArray = dataExtractor(rawData);
				} else if (Array.isArray(rawData)) {
					dataArray = rawData;
				} else {
					// Try to find an array in the response object
					const possibleArrays = Object.values(rawData).filter(Array.isArray);
					if (possibleArrays.length === 1) {
						dataArray = possibleArrays[0] as T[];
					} else {
						throw new Error('Could not extract data array from response. Please provide a dataExtractor function.');
					}
				}

				// Validate data with Zod schema
				const validatedData = dataSchema.parse(dataArray);
				
				setData(Array.isArray(validatedData) ? validatedData : [validatedData]);
			} catch (err) {
				const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
				setError(errorMessage);
				console.error('[ReactVirtuoso] Failed to fetch data:', err);
			} finally {
				setLoading(false);
			}
		};

		fetchData();
	}, [apiEndpoint, dataSchema, dataExtractor, fetchOptions, retryCount]);

	// Process data with filtering and sorting
	const processedData = useMemo(() => {
		let result = [...data];

		// Apply filter if provided
		if (filter) {
			result = result.filter(filter);
		}

		// Apply sorting if provided
		if (sortBy) {
			result.sort(sortBy);
		}

		return result;
	}, [data, filter, sortBy]);

	// Pagination
	const paginatedData = useMemo(() => {
		return processedData.slice(0, itemsPerPage);
	}, [processedData, itemsPerPage]);

	const handleRetry = () => {
		setRetryCount(prev => prev + 1);
	};

	if (loading) {
		return (
			<div className={cn("w-full max-w-4xl mx-auto", className)} style={containerStyle}>
				{loadingComponent}
			</div>
		);
	}

	if (error) {
		return (
			<div className={cn("w-full max-w-4xl mx-auto", className)} style={containerStyle}>
				<div className={cn("text-center")}>
					{errorComponent(error)}
					<button
						onClick={handleRetry}
						className={cn("mt-4 px-4 py-2 rounded-lg transition-colors hover:opacity-80")}
						style={{
							backgroundColor: 'var(--sl-color-accent)',
							color: 'var(--sl-color-white)',
						}}
					>
						Retry
					</button>
				</div>
			</div>
		);
	}

	if (paginatedData.length === 0) {
		return (
			<div className={cn("w-full max-w-4xl mx-auto", className)} style={containerStyle}>
				{emptyComponent}
			</div>
		);
	}

	return (
		<div className={cn("w-full max-w-4xl mx-auto", className)} style={containerStyle}>
			<div
				className={cn("rounded-xl p-4 border")}
				style={{
					backgroundColor: 'color-mix(in srgb, var(--sl-color-gray-6) 60%, transparent)',
					borderColor: 'color-mix(in srgb, var(--sl-color-gray-5) 30%, transparent)',
				}}
			>
				<div 
					className={cn("mb-4 text-sm opacity-60")}
					style={{ color: 'var(--sl-color-gray-2)' }}
				>
					Showing {paginatedData.length} of {processedData.length} items
				</div>
				
				<div className={cn("virtuoso-container")}>
					<Virtuoso
						style={{ 
							height: `${height}px`,
							backgroundColor: 'var(--sl-color-bg)',
							color: 'var(--sl-color-text)',
						}}
						data={paginatedData}
						itemContent={(index, item) => (
							<div className={cn("virtuoso-item")} key={`item-${index}`}>
								{renderItem(item, index)}
							</div>
						)}
						overscan={5}
						components={{
							Scroller: React.forwardRef<HTMLDivElement>((props, ref) => (
								<div
									{...props}
									ref={ref}
									className={cn("virtuoso-scroller", (props as any).className)}
								/>
							)),
						}}
					/>
				</div>
			</div>
		</div>
	);
}

// Export the component for use in static client-side applications
export default ReactVirtuoso;