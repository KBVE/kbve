/**
 * ReactSubHero Component
 * Smaller, secondary hero section component
 * Uses Starlight theme variables and Tailwind CSS
 */

import { useEffect, useState, useRef, type FC } from 'react';
import { cn } from '@/lib/utils';
import type { SubHeroProps, SubHeroSizeConfig } from './typeSubHero';

/**
 * Size configurations for different variants
 */
const sizeConfigs: Record<'small' | 'medium' | 'large', SubHeroSizeConfig> = {
	small: {
		height: '30vh',
		titleSize: 'text-3xl md:text-4xl',
		subtitleSize: 'text-sm',
		descriptionSize: 'text-base',
		padding: 'px-8 py-8',
	},
	medium: {
		height: '50vh',
		titleSize: 'text-4xl md:text-5xl',
		subtitleSize: 'text-base',
		descriptionSize: 'text-lg',
		padding: 'px-8 py-12 md:px-16',
	},
	large: {
		height: '70vh',
		titleSize: 'text-5xl md:text-6xl',
		subtitleSize: 'text-lg',
		descriptionSize: 'text-xl',
		padding: 'px-8 py-16 md:px-16',
	},
};

/**
 * ReactSubHero Component
 */
export const ReactSubHero: FC<SubHeroProps> = ({
	title,
	subtitle,
	description,
	ctaText,
	ctaUrl,
	backgroundImage,
	backgroundGradient,
	backgroundColor,
	textColor,
	height,
	className = '',
	showDecorative = false,
	overlayOpacity = 0.3,
	alignment = 'center',
	size = 'medium',
	enableAnimation = true,
	ariaLabel,
}) => {
	const [isVisible, setIsVisible] = useState(!enableAnimation);
	const [mounted, setMounted] = useState(false);
	const heroRef = useRef<HTMLDivElement>(null);
	const isFirstRender = useRef(true);

	// Get size config
	const sizeConfig = sizeConfigs[size];
	const effectiveHeight = height || sizeConfig.height;

	// Hydration and visibility animation
	useEffect(() => {
		setMounted(true);

		// Fade out skeleton and show content
		const timer = setTimeout(() => {
			// Hide skeleton
			const skeleton = document.querySelector(
				'[data-x-kbve="sub-hero-skeleton"]',
			) as HTMLElement;
			if (skeleton) {
				skeleton.style.opacity = '0';
				skeleton.style.pointerEvents = 'none';
				setTimeout(() => {
					skeleton.style.display = 'none';
				}, 300);
			}

			// Show content
			setIsVisible(true);
			isFirstRender.current = false;
		}, 100);

		return () => clearTimeout(timer);
	}, []);

	// Intersection observer for fade-in animation
	useEffect(() => {
		if (!enableAnimation || !mounted) return;

		const observer = new IntersectionObserver(
			(entries) => {
				entries.forEach((entry) => {
					if (entry.isIntersecting && !isVisible) {
						setIsVisible(true);
						observer.disconnect();
					}
				});
			},
			{ threshold: 0.2 },
		);

		if (heroRef.current) {
			observer.observe(heroRef.current);
		}

		return () => observer.disconnect();
	}, [enableAnimation, mounted, isVisible]);

	// Alignment classes for tailwind
	const alignmentClasses = {
		left: 'items-start text-left',
		center: 'items-center text-center',
		right: 'items-end text-right',
	};

	const ctaAlignmentClasses = {
		left: 'justify-start',
		center: 'justify-center',
		right: 'justify-end',
	};

	if (!mounted) return null;

	return (
		<div
			ref={heroRef}
			data-x-kbve="sub-hero-content"
			className={cn(
				'relative w-full min-h-[250px] overflow-hidden flex flex-col justify-center',
				alignmentClasses[alignment],
				className,
			)}
			style={{ height: effectiveHeight }}
			role="region"
			aria-label={ariaLabel || title}>
			{/* Background */}
			{backgroundImage && (
				<div
					className="absolute inset-0 -z-10 bg-cover bg-center bg-no-repeat"
					style={{ backgroundImage: `url(${backgroundImage})` }}
					aria-hidden="true"
				/>
			)}

			{/* Gradient Background */}
			{!backgroundImage && backgroundGradient && (
				<div
					className="absolute inset-0 -z-10"
					style={{ background: backgroundGradient }}
					aria-hidden="true"
				/>
			)}

			{/* Color Background */}
			{!backgroundImage && !backgroundGradient && (
				<div
					className="absolute inset-0 -z-10"
					style={{
						backgroundColor:
							backgroundColor || 'var(--sl-color-bg-accent)',
					}}
					aria-hidden="true"
				/>
			)}

			{/* Overlay */}
			{(backgroundImage || backgroundGradient) && (
				<div
					className="absolute inset-0 z-0"
					style={{
						backgroundColor: `rgba(0, 0, 0, ${overlayOpacity})`,
					}}
					aria-hidden="true"
				/>
			)}

			{/* Decorative Element */}
			{showDecorative && (
				<div
					className="absolute top-0 right-0 w-48 h-48 md:w-64 md:h-64 rounded-full translate-x-1/2 -translate-y-1/2 z-0 opacity-10"
					style={{
						background:
							'linear-gradient(135deg, var(--sl-color-accent-low) 0%, var(--sl-color-accent) 100%)',
					}}
					aria-hidden="true"
				/>
			)}

			{/* Content */}
			<div
				className={cn(
					'relative z-10 max-w-screen-xl w-full',
					sizeConfig.padding,
					'transition-all duration-600 ease-out',
					isVisible
						? 'opacity-100 translate-y-0'
						: 'opacity-0 translate-y-8',
				)}
				style={{
					color: textColor || 'var(--sl-color-text)',
				}}>
				{/* Subtitle */}
				{subtitle && (
					<div
						className={cn(
							sizeConfig.subtitleSize,
							'font-medium mb-3 opacity-80 tracking-wider uppercase',
						)}
						style={{ color: 'var(--sl-color-text-accent)' }}>
						{subtitle}
					</div>
				)}

				{/* Title */}
				<h2
					className={cn(
						sizeConfig.titleSize,
						'font-bold mb-4 leading-tight',
					)}>
					{title}
				</h2>

				{/* Description */}
				{description && (
					<p
						className={cn(
							sizeConfig.descriptionSize,
							'mb-6 opacity-85 leading-relaxed max-w-3xl',
							alignment === 'center' && 'mx-auto',
						)}>
						{description}
					</p>
				)}

				{/* CTA Button */}
				{ctaText && ctaUrl && (
					<div className={cn('flex', ctaAlignmentClasses[alignment])}>
						<a
							href={ctaUrl}
							className={cn(
								'inline-block px-6 py-3 text-base font-semibold rounded-md',
								'transition-all duration-200 ease-in-out',
								'focus-ring',
								'hover:-translate-y-0.5 hover:shadow-md',
								'text-white',
							)}
							style={{
								background:
									'linear-gradient(135deg, var(--sl-color-accent) 0%, var(--sl-color-accent-high) 100%)',
								boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
							}}
							aria-label={`${ctaText} - Call to action`}>
							{ctaText}
						</a>
					</div>
				)}
			</div>
		</div>
	);
};

export default ReactSubHero;
