import React, { useEffect, useState, useMemo } from 'react';
import { userClientService } from '@kbve/astropad';
// React DOM for portal rendering
import ReactDOM from 'react-dom';

import {
	Home,
	BookOpen,
	Search,
	User,
	Settings,
	LogIn,
	UserPlus,
	HelpCircle,
	Code,
	Terminal,
	Gamepad2,
	MessageCircle,
	Award,
} from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useStore } from '@nanostores/react';

// Footer service singleton for state management
import { footerService } from './serviceFooter';
// Type definitions
import type { FooterLink, FooterStatus, SocialLink } from './serviceFooter';

// Use global userClientService if available, else fallback to import
const userClientServiceRef =
  typeof window !== 'undefined' && (window as any).userClientService
    ? (window as any).userClientService
    : userClientService;

const cn = (...inputs: any[]) => {
	return twMerge(clsx(inputs));
};

/**
 * Utility function to execute a callback on the next animation frame with an optional delay
 * @param callback - Function to execute
 * @param delay - Optional delay in milliseconds (default: 0)
 */
const nextFrame = (callback: () => void, delay: number = 0) => {
	requestAnimationFrame(() => {
		if (delay > 0) {
			setTimeout(callback, delay);
		} else {
			callback();
		}
	});
};

/**
 * Fade out Quick Links skeleton without removing from layout
 * Keeps skeleton in document flow to prevent layout shifts
 */
const fadeOutQuickLinksSkeleton = () => {
	const skeleton = document.querySelector('[data-skeleton="footer-quicklinks"]');

	if (skeleton instanceof HTMLElement) {
		// Apply smooth fade transition
		skeleton.style.transition = 'opacity 0.5s cubic-bezier(0.4, 0, 0.2, 1)';
		skeleton.style.opacity = '0';
		// Disable pointer events but keep in layout flow
		skeleton.style.pointerEvents = 'none';
	}
};

/**
 * Status color mapping based on operational status
 */
const statusColors = {
	operational: 'bg-green-400',
	degraded: 'bg-yellow-400',
	outage: 'bg-red-400',
	maintenance: 'bg-blue-400'
} as const;

/**
 * FooterLink Component - Renders individual footer links
 */
const FooterLinkItem: React.FC<{ link: FooterLink; index: number }> = ({ link, index }) => {
	return (
		<li
			className={cn(
				'transform transition-all duration-300',
				'hover:translate-x-1'
			)}
			style={{ animationDelay: `${index * 50}ms` }}
		>
			<a
				href={link.href}
				data-astro-prefetch={link.prefetch}
				target={link.external ? '_blank' : undefined}
				rel={link.external ? 'noopener noreferrer' : undefined}
				className={cn(
					'transition-colors duration-200 text-sm',
					'flex items-center gap-1'
				)}
				style={{
					color: 'var(--sl-color-gray-2)',
				}}
				onMouseEnter={(e) => {
					e.currentTarget.style.color = 'var(--sl-color-accent)';
				}}
				onMouseLeave={(e) => {
					e.currentTarget.style.color = 'var(--sl-color-gray-2)';
				}}
			>
				{link.label}
				{link.external && (
					<svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
					</svg>
				)}
			</a>
		</li>
	);
};

/**
 * StatusIndicator Component - Displays system status
 */
const StatusIndicator: React.FC<{ status: FooterStatus }> = ({ status }) => {
	const colorClass = statusColors[status.status];

	return (
		<div
			className={cn(
				'flex items-center space-x-2 px-3 py-1',
				'rounded-full transition-all duration-300'
			)}
			style={{
				backgroundColor: 'var(--sl-color-gray-6)',
				borderColor: 'var(--sl-color-gray-5)',
				border: '1px solid var(--sl-color-gray-5)'
			}}
			onMouseEnter={(e) => {
				e.currentTarget.style.borderColor = 'var(--sl-color-gray-4)';
			}}
			onMouseLeave={(e) => {
				e.currentTarget.style.borderColor = 'var(--sl-color-gray-5)';
			}}
		>
			<div className={cn(
				'w-2 h-2 rounded-full',
				colorClass,
				status.status === 'operational' && 'animate-pulse'
			)} />
			<span
				className="text-xs font-medium"
				style={{ color: 'var(--sl-color-gray-2)' }}
			>
				{status.message}
			</span>
		</div>
	);
};

/**
 * ReactFooter Component
 * Handles dynamic footer content with smooth skeleton replacement
 */
export const ReactFooter: React.FC = () => {
	const [isLoading, setIsLoading] = useState(true);
	const [isMounted, setIsMounted] = useState(false);

	// Subscribe to reactive stores - only Quick Links need React
	const quickLinks = useStore(footerService.getQuickLinks());

	// Subscribe to userClientService atoms
	const isReady = useStore(userClientServiceRef.userClientServiceReadyAtom);
	const userAtomValue = useStore(userClientServiceRef.userAtom);
	const username = useStore(userClientServiceRef.usernameAtom);
	const isAuthenticated = useStore(footerService.getUserAuthenticated());
	const userData = useStore(footerService.getUserData());

	useEffect(() => {
		// Set mounted flag
		setIsMounted(true);

		// Check user authentication status using atoms
		if (isReady && userAtomValue) {
			footerService.setUserAuthenticated(true);
			footerService.updateUserData({
				username: username || userAtomValue?.user_metadata?.username,
				email: userAtomValue?.email,
				role: userAtomValue?.user_metadata?.role
			});
			footerService.updateLinksForUser(true);
		}

		// Smooth skeleton fading after mount
		nextFrame(() => {
			fadeOutQuickLinksSkeleton();
			setIsLoading(false);
		}, 100);

		// Fetch dynamic content (if needed)
		footerService.fetchDynamicLinks();

		// Cleanup
		return () => {
			setIsMounted(false);
		};
	}, []);

	// Don't render until mounted to avoid hydration issues
	if (!isMounted) {
		return null;
	}

	return (
		<>
			{/* Quick Links Dynamic Content */}
			<div
				id="footer-quicklinks-react"
				className={cn(
					'absolute inset-0 top-6 transition-opacity duration-500',
					!isLoading ? 'opacity-100' : 'opacity-0'
				)}
				style={{
					pointerEvents: !isLoading ? 'auto' : 'none',
					position: 'absolute',
					left: 0,
					right: 0
				}}
			>
				<ul className="space-y-3">
					{quickLinks.map((link, index) => (
						<FooterLinkItem key={link.href} link={link} index={index} />
					))}
				</ul>
			</div>

			{/* Resources Dynamic Content */}
			<div
				id="footer-resources-react"
				className={cn(
					'absolute inset-0 top-6 transition-opacity duration-500',
					!isLoading ? 'opacity-100' : 'opacity-0'
				)}
				style={{
					pointerEvents: !isLoading ? 'auto' : 'none',
					position: 'absolute',
					left: 0,
					right: 0
				}}
			>
				<ul className="space-y-3">
					{resources.map((link, index) => (
						<FooterLinkItem key={link.href} link={link} index={index} />
					))}
				</ul>
			</div>

			{/* Status Indicator Dynamic Content */}
			<div
				id="footer-status-react"
				className={cn(
					'absolute inset-0 transition-opacity duration-500',
					!isLoading ? 'opacity-100' : 'opacity-0'
				)}
				style={{
					pointerEvents: !isLoading ? 'auto' : 'none',
					position: 'absolute',
					left: 0,
					right: 0
				}}
			>
				<StatusIndicator status={status} />
			</div>
		</>
	);
};

/**
 * Main export - Simple component that uses portals to render in correct locations
 */
export default function ReactFooterWrapper() {
	const [mounted, setMounted] = useState(false);
	const [isLoading, setIsLoading] = useState(true);
	const [servicesReady, setServicesReady] = useState(false);

	// Subscribe to reactive stores - only Quick Links need React
	const quickLinks = useStore(footerService.getQuickLinks());

	// Subscribe to userClientService atoms
	const isReady = useStore(userClientServiceRef.userClientServiceReadyAtom);
	const userAtomValue = useStore(userClientServiceRef.userAtom);
	const username = useStore(userClientServiceRef.usernameAtom);

	useEffect(() => {
		// Ensure we're in browser environment and services are ready
		if (typeof window === 'undefined') return;

		setMounted(true);

		// Small delay to ensure all services are initialized
		setTimeout(() => {
			setServicesReady(true);

			// Check user authentication status using atoms
			if (isReady && userAtomValue) {
				footerService.setUserAuthenticated(true);
				footerService.updateUserData({
					username: username || userAtomValue?.user_metadata?.username,
					email: userAtomValue?.email,
					role: userAtomValue?.user_metadata?.role
				});
				footerService.updateLinksForUser(true);
			}

			// Wait for everything to be ready before fading skeletons
			nextFrame(() => {
				fadeOutQuickLinksSkeleton();
				// Add a delay to ensure containers are ready
				setTimeout(() => {
					setIsLoading(false);
				}, 200);
			}, 300);

			// Fetch dynamic content
			footerService.fetchDynamicLinks();
		}, 100);

		return () => {
			setMounted(false);
			setServicesReady(false);
		};
	}, []);

	// Only render when everything is properly mounted and ready
	if (!mounted || !servicesReady) return null;

	// Find the container elements - only Quick Links need React
	const quickLinksContainer = document.getElementById('footer-quicklinks-content');

	return (
		<>
			{/* Render quick links in their container */}
			{quickLinksContainer && ReactDOM.createPortal(
				<ul className={cn(
					'space-y-3 transition-opacity duration-500',
					!isLoading ? 'opacity-100' : 'opacity-0'
				)}>
					{quickLinks.map((link, index) => (
						<FooterLinkItem key={link.href} link={link} index={index} />
					))}
				</ul>,
				quickLinksContainer
			)}

		</>
	);
}