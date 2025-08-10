/** @jsxImportSource react */
import React from 'react';
import { z } from 'zod';
import ReactVirtuoso from './ReactVirtuoso';
import { ExternalLink, Calendar, Tag } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

const cn = (...inputs: any[]) => {
	return twMerge(clsx(inputs));
};

// Application schema
const ApplicationSchema = z.object({
	title: z.string(),
	description: z.string().optional(),
	slug: z.string(),
	category: z.string().optional(),
	tags: z.array(z.string()).optional(),
	image: z.string().optional(),
	date: z.string().optional(),
	featured: z.boolean().optional(),
	status: z.enum(['active', 'deprecated', 'beta', 'coming-soon']).optional(),
});

const ApplicationsResponseSchema = z.object({
	applications: z.array(ApplicationSchema),
	key: z.record(z.string(), z.number()),
});

type Application = z.infer<typeof ApplicationSchema>;

interface ApplicationsVirtuosoProps {
	apiEndpoint?: string;
	height?: number;
	itemsPerPage?: number;
	className?: string;
	filter?: (app: Application) => boolean;
	sortBy?: (a: Application, b: Application) => number;
}

// Default application item renderer
const renderApplicationItem = (app: Application, index: number) => (
	<div
		key={`${app.slug}-${index}`}
		className={cn("group p-6 mb-4 rounded-xl border transition-all duration-300 hover:shadow-lg hover:scale-[1.01] active:scale-[0.99]")}
		style={{
			backgroundColor: 'var(--sl-color-gray-6)',
			borderColor: 'var(--sl-color-gray-5)',
		}}
	>
		<div className={cn("flex items-start justify-between mb-4")}>
			<div className={cn("flex-1")}>
				<h3 className={cn("text-lg font-semibold mb-2 group-hover:text-accent transition-colors")}>
					{app.title}
				</h3>
				{app.description && (
					<p className={cn("text-sm opacity-80 mb-3 leading-relaxed")}>
						{app.description}
					</p>
				)}
			</div>
			{app.status && (
				<span
					className={cn(
						"px-2 py-1 text-xs rounded-full font-medium",
						{
							'bg-green-500/20 text-green-400': app.status === 'active',
							'bg-blue-500/20 text-blue-400': app.status === 'beta',
							'bg-yellow-500/20 text-yellow-400': app.status === 'coming-soon',
							'bg-red-500/20 text-red-400': app.status === 'deprecated',
						}
					)}
				>
					{app.status}
				</span>
			)}
		</div>
		
		<div className={cn("flex items-center justify-between")}>
			<div className={cn("flex items-center space-x-4 text-xs opacity-60")}>
				{app.category && (
					<div className={cn("flex items-center space-x-1")}>
						<Tag className={cn("w-3 h-3")} />
						<span>{app.category}</span>
					</div>
				)}
				{app.date && (
					<div className={cn("flex items-center space-x-1")}>
						<Calendar className={cn("w-3 h-3")} />
						<span>{new Date(app.date).toLocaleDateString()}</span>
					</div>
				)}
			</div>
			<a
				href={app.slug}
				className={cn("flex items-center space-x-1 text-sm opacity-80 hover:opacity-100 transition-opacity")}
				style={{ color: 'var(--sl-color-accent)' }}
			>
				<span>View</span>
				<ExternalLink className={cn("w-3 h-3")} />
			</a>
		</div>
		
		{app.tags && app.tags.length > 0 && (
			<div className={cn("flex flex-wrap gap-1 mt-3")}>
				{app.tags.slice(0, 5).map((tag, idx) => (
					<span
						key={idx}
						className={cn("px-2 py-1 text-xs rounded opacity-60")}
						style={{
							backgroundColor: 'var(--sl-color-gray-5)',
							color: 'var(--sl-color-gray-1)',
						}}
					>
						{tag}
					</span>
				))}
				{app.tags.length > 5 && (
					<span className={cn("px-2 py-1 text-xs rounded opacity-60")}>
						+{app.tags.length - 5} more
					</span>
				)}
			</div>
		)}
	</div>
);

export const ApplicationsVirtuoso: React.FC<ApplicationsVirtuosoProps> = ({
	apiEndpoint = '/api/applications.json',
	height = 600,
	itemsPerPage = 50,
	className = '',
	filter,
	sortBy,
}) => {
	return (
		<ReactVirtuoso<Application>
			apiEndpoint={apiEndpoint}
			dataSchema={z.array(ApplicationSchema)}
			dataExtractor={(response) => response.applications || response}
			height={height}
			itemsPerPage={itemsPerPage}
			filter={filter}
			sortBy={sortBy}
			renderItem={renderApplicationItem}
			className={className}
		/>
	);
};

export default ApplicationsVirtuoso;