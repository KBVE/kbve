import { cn } from '../../../cn';
import React from 'react';

import { BentoGrid, BentoGridItem } from './bento-grid';

import {
	IconArrowWaveRightUp,
	IconBoxAlignRightFilled,
	IconBoxAlignTopLeft,
	IconClipboardCopy,
	IconFileBroken,
	IconSignature,
	IconTableColumn,
} from '@tabler/icons-react';

export interface IAstroItem {
	title: string;
	description: string;
	slug: string;
	header: React.ReactNode;
	icon: React.ReactNode;
}

export interface BentoAstroContentProps {
	entry: IAstroItem[];
}

const options = {
	htmlparser2: {
		lowerCaseTags: false,
	},
};

export function BentoAstroContent({ entry }: BentoAstroContentProps) {
	return (
		<BentoGrid className="mx-auto bg-zinc-800 p-4">
			{entry.map((item, i) => (
				<BentoGridItem
					key={i}
					title={item.title}
					description={item.description}
					slug={item.slug}
					header={item.header}
					icon={item.icon}
					className={i === 3 || i === 6 ? 'md:col-span-2' : ''}
				/>
			))}
		</BentoGrid>
	);
}

const Skeleton = () => (
	<div className="flex flex-1 w-full h-full min-h-[6rem] rounded-xl bg-gradient-to-br from-neutral-200  to-neutral-100"></div>
);
