import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import { useStore } from '@nanostores/react';
import { footerService } from './serviceFooter';
import type { FooterLink } from './serviceFooter';

/**
 * Fade out the static skeleton when React content is ready
 */
const fadeOutSkeleton = () => {
	const skeleton = document.querySelector(
		'[data-skeleton="footer-quicklinks"]',
	);
	if (skeleton instanceof HTMLElement) {
		skeleton.style.transition = 'opacity 0.3s ease';
		skeleton.style.opacity = '0';
		skeleton.style.pointerEvents = 'none';
	}
};

/**
 * FooterLinkItem - Individual link component
 */
const FooterLinkItem: React.FC<{ link: FooterLink }> = ({ link }) => {
	const [isHovered, setIsHovered] = useState(false);

	return (
		<li
			style={{
				transform: isHovered ? 'translateX(4px)' : 'translateX(0)',
				transition: 'transform 0.2s ease',
			}}>
			<a
				href={link.href}
				target={link.external ? '_blank' : undefined}
				rel={link.external ? 'noopener noreferrer' : undefined}
				style={{
					fontSize: '0.875rem',
					color: isHovered
						? 'var(--sl-color-accent)'
						: 'var(--sl-color-gray-2)',
					textDecoration: 'none',
					transition: 'color 0.2s ease',
					display: 'inline-flex',
					alignItems: 'center',
					gap: '0.25rem',
				}}
				onMouseEnter={() => setIsHovered(true)}
				onMouseLeave={() => setIsHovered(false)}>
				{link.label}
				{link.external && (
					<svg
						width="12"
						height="12"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round">
						<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
						<polyline points="15 3 21 3 21 9" />
						<line x1="10" y1="14" x2="21" y2="3" />
					</svg>
				)}
			</a>
		</li>
	);
};

/**
 * ReactFooter - Handles dynamic Quick Links based on auth state
 */
export default function ReactFooter() {
	const [mounted, setMounted] = useState(false);
	const [isReady, setIsReady] = useState(false);
	const quickLinks = useStore(footerService.getQuickLinks());

	useEffect(() => {
		if (typeof window === 'undefined') return;

		setMounted(true);

		// Check for user authentication via global service
		const checkAuth = () => {
			try {
				const userService = (window as any).userClientService;
				if (userService?.userAtom) {
					const user = userService.userAtom.get?.();
					if (user) {
						footerService.setUserAuthenticated(true);
						footerService.updateLinksForUser(true);
					}
				}
			} catch {
				// Auth check failed, use default links
			}
		};

		// Delay to ensure DOM is ready and auth state is available
		const timer = setTimeout(() => {
			checkAuth();
			fadeOutSkeleton();
			setIsReady(true);
		}, 150);

		return () => {
			clearTimeout(timer);
			setMounted(false);
		};
	}, []);

	if (!mounted) return null;

	const container = document.getElementById('footer-quicklinks-content');
	if (!container) return null;

	return ReactDOM.createPortal(
		<ul
			style={{
				listStyle: 'none',
				padding: 0,
				margin: 0,
				display: 'flex',
				flexDirection: 'column',
				gap: '0.5rem',
				opacity: isReady ? 1 : 0,
				transition: 'opacity 0.3s ease',
			}}>
			{quickLinks.map((link) => (
				<FooterLinkItem key={link.href} link={link} />
			))}
		</ul>,
		container,
	);
}
