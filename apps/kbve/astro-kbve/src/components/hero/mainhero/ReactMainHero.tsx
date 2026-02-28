/**
 * ReactMainHero Component
 * Main hero section with multiple background options and CTAs
 * Uses Starlight theme variables and Tailwind CSS
 */

import { useEffect, useState, useRef, type FC } from 'react';
import { cn } from '@/lib/utils';
import type { MainHeroProps } from './typeMainHero';

// TODO: Nanostores integration, moving the stores out of the react to nanostores and dexie. With dexie provind us the long term seupport.
// TODO: Integrate the state management to include a core event system that can be utilized within the rest of the vanilla javascript event loop.
// TODO: Rotate out the useEffect and setTimeout with a beter eco-system that would work with vanillajs and our core event system. Similar issue to the comment above.

/**
 * ReactMainHero Component
 */
export const ReactMainHero: FC<MainHeroProps> = ({
	title,
	subtitle,
	description,
	ctaText,
	ctaUrl,
	secondaryCtaText,
	secondaryCtaUrl,
	backgroundImage,
	backgroundVideo,
	backgroundGradient,
	backgroundColor,
	textColor,
	height = '100vh',
	className = '',
	enableParallax = false,
	showScrollIndicator = true,
	overlayOpacity = 0.5,
	alignment = 'center',
	verticalAlignment = 'center',
	ariaLabel,
}) => {
	const [scrollY, setScrollY] = useState(0);
	const [isVisible, setIsVisible] = useState(false);
	const [mounted, setMounted] = useState(false);
	const heroRef = useRef<HTMLDivElement>(null);
	const videoRef = useRef<HTMLVideoElement>(null);
	const isFirstRender = useRef(true);

	// TODO: Similar to how we are using the cm , we would create a better mount system that will work with Astro and the html standard for view transitions.

	// Handle scroll for parallax effect
	useEffect(() => {
		if (!enableParallax) return;

		const handleScroll = () => {
			setScrollY(window.scrollY);
		};

		window.addEventListener('scroll', handleScroll, { passive: true });
		return () => window.removeEventListener('scroll', handleScroll);
	}, [enableParallax]);

	// Hydration and visibility animation
	useEffect(() => {
		setMounted(true);

		// Fade out skeleton and show content
		const timer = setTimeout(() => {
			// Hide skeleton
			const skeleton = document.querySelector(
				'[data-x-kbve="main-hero-skeleton"]',
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

	// Video autoplay
	useEffect(() => {
		if (videoRef.current && backgroundVideo) {
			videoRef.current.play().catch((error) => {
				console.warn('Video autoplay failed:', error);
			});
		}
	}, [backgroundVideo]);

	// Alignment classes for tailwind
	const alignmentClasses = {
		left: 'items-start text-left',
		center: 'items-center text-center',
		right: 'items-end text-right',
	};

	const verticalAlignmentClasses = {
		top: 'justify-start',
		center: 'justify-center',
		bottom: 'justify-end',
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
			data-x-kbve="main-hero-content"
			className={cn(
				'relative w-full overflow-hidden flex flex-col',
				alignmentClasses[alignment],
				verticalAlignmentClasses[verticalAlignment],
				className,
			)}
			style={{ height }}
			role="banner"
			aria-label={ariaLabel || title}>
			{/* Background */}
			{backgroundImage && (
				<div
					className="absolute inset-0 -z-10 bg-cover bg-center bg-no-repeat"
					style={{
						backgroundImage: `url(${backgroundImage})`,
						transform: enableParallax
							? `translateY(${scrollY * 0.5}px)`
							: undefined,
					}}
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
			{!backgroundImage && !backgroundGradient && backgroundColor && (
				<div
					className="absolute inset-0 -z-10"
					style={{ backgroundColor }}
					aria-hidden="true"
				/>
			)}

			{/* Video Background */}
			{backgroundVideo && (
				<video
					ref={videoRef}
					autoPlay
					loop
					muted
					playsInline
					className="absolute top-1/2 left-1/2 -z-10 min-w-full min-h-full w-auto h-auto -translate-x-1/2 -translate-y-1/2 object-cover"
					aria-hidden="true">
					<source src={backgroundVideo} type="video/mp4" />
				</video>
			)}

			{/* Overlay */}
			{(backgroundImage || backgroundVideo) && (
				<div
					className="absolute inset-0 z-0"
					style={{
						backgroundColor: `rgba(0, 0, 0, ${overlayOpacity})`,
					}}
					aria-hidden="true"
				/>
			)}

			{/* Content */}
			<div
				className={cn(
					'relative z-10 px-8 py-16 md:px-16 max-w-screen-xl w-full',
					'transition-all duration-800 ease-out',
					isVisible
						? 'opacity-100 translate-y-0'
						: 'opacity-0 translate-y-5',
				)}
				style={{ color: textColor }}>
				{/* Subtitle */}
				{subtitle && (
					<div
						className="text-lg md:text-xl font-medium mb-4 opacity-90 tracking-wider uppercase"
						style={{ color: 'var(--sl-color-text-accent)' }}>
						{subtitle}
					</div>
				)}

				{/* Title */}
				<h1
					className="text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-bold mb-6 leading-tight"
					style={{
						textShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
						color: textColor || 'var(--sl-color-white)',
					}}>
					{title}
				</h1>

				{/* Description */}
				{description && (
					<p
						className={cn(
							'text-lg md:text-xl lg:text-2xl mb-8 opacity-90 leading-relaxed max-w-3xl',
							alignment === 'center' && 'mx-auto',
						)}>
						{description}
					</p>
				)}

				{/* CTA Buttons */}
				{(ctaText || secondaryCtaText) && (
					<div
						className={cn(
							'flex gap-4 flex-wrap',
							ctaAlignmentClasses[alignment],
						)}
						role="group"
						aria-label="Hero actions">
						{ctaText && ctaUrl && (
							<a
								href={ctaUrl}
								className={cn(
									'inline-block px-8 py-4 text-lg font-semibold rounded-lg',
									'transition-all duration-200 ease-in-out',
									'focus-ring',
									'hover:-translate-y-0.5 hover:shadow-lg',
									'text-white',
								)}
								style={{
									background:
										'linear-gradient(135deg, var(--sl-color-accent) 0%, var(--sl-color-accent-high) 100%)',
									boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
								}}
								aria-label={`${ctaText} - Primary action`}>
								{ctaText}
							</a>
						)}

						{secondaryCtaText && secondaryCtaUrl && (
							<a
								href={secondaryCtaUrl}
								className={cn(
									'inline-block px-8 py-4 text-lg font-semibold rounded-lg',
									'transition-all duration-200 ease-in-out',
									'focus-ring',
									'hover:bg-opacity-20',
									'border-2',
								)}
								style={{
									color: textColor || 'var(--sl-color-white)',
									borderColor:
										textColor || 'var(--sl-color-white)',
									backgroundColor: 'rgba(255, 255, 255, 0.1)',
								}}
								aria-label={`${secondaryCtaText} - Secondary action`}>
								{secondaryCtaText}
							</a>
						)}
					</div>
				)}
			</div>

			{/* Scroll Indicator */}
			{showScrollIndicator && (
				<button
					className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 animate-bounce cursor-pointer bg-transparent border-none p-2"
					onClick={() => {
						window.scrollTo({
							top: window.innerHeight,
							behavior: 'smooth',
						});
					}}
					aria-label="Scroll to content">
					<svg
						className="w-6 h-6"
						viewBox="0 0 24 24"
						fill="none"
						stroke={textColor || 'var(--sl-color-white)'}
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
						aria-hidden="true">
						<polyline points="6 9 12 15 18 9" />
					</svg>
				</button>
			)}
		</div>
	);
};

export default ReactMainHero;
