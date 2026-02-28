/**
 * UnsplashBanner - Sticky parallax hero with Unsplash background
 * Features:
 * - Full-viewport sticky parallax that stays as you scroll
 * - Profile capsule card floating at the bottom
 * - Lazy loading with IntersectionObserver
 * - LQIP (Low-Quality Image Placeholder) for smooth loading
 * - JavaScript-based parallax effect (disabled for reduced motion)
 * - Gradient overlay for content readability
 */
import {
	useState,
	useEffect,
	useRef,
	useCallback,
	type ReactNode,
} from 'react';

export interface UnsplashBannerProps {
	/** Unsplash photo ID (e.g., '1594671581654-cc7ed83167bb') */
	photoId?: string;
	/** Additional CSS classes */
	className?: string;
	/** Alt text for accessibility */
	altText?: string;
	/** Children to render in the capsule area (e.g., ProfileHero content) */
	children?: ReactNode;
}

const DEFAULT_PHOTO_ID = '1594671581654-cc7ed83167bb';

/**
 * Build Unsplash URL with responsive parameters
 */
function buildUnsplashUrl(id: string, width: number, quality = 80): string {
	return `https://images.unsplash.com/photo-${id}?q=${quality}&w=${width}&auto=format&fit=crop&fm=webp`;
}

export function UnsplashBanner({
	photoId = DEFAULT_PHOTO_ID,
	className = '',
	altText = 'Profile banner image',
	children,
}: UnsplashBannerProps) {
	const [isLoaded, setIsLoaded] = useState(false);
	const [isInView, setIsInView] = useState(false);
	const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
	const bannerRef = useRef<HTMLDivElement>(null);
	const bgRef = useRef<HTMLDivElement>(null);
	const tickingRef = useRef(false);

	// LQIP - tiny blurred version for instant display
	const placeholderUrl = buildUnsplashUrl(photoId, 20, 10);
	const fullUrl = buildUnsplashUrl(photoId, 1920, 80);

	// Check reduced motion preference
	useEffect(() => {
		const mediaQuery = window.matchMedia(
			'(prefers-reduced-motion: reduce)',
		);
		setPrefersReducedMotion(mediaQuery.matches);

		const handler = (e: MediaQueryListEvent) =>
			setPrefersReducedMotion(e.matches);
		mediaQuery.addEventListener('change', handler);
		return () => mediaQuery.removeEventListener('change', handler);
	}, []);

	// Parallax scroll effect
	const updateParallax = useCallback(() => {
		if (prefersReducedMotion || !bgRef.current) return;

		const scrolled = window.pageYOffset;
		const rate = scrolled * 0.3; // Parallax speed (0.3 = slower than scroll)
		bgRef.current.style.transform = `translateY(${rate}px)`;
		tickingRef.current = false;
	}, [prefersReducedMotion]);

	useEffect(() => {
		if (prefersReducedMotion) return;

		const handleScroll = () => {
			if (!tickingRef.current) {
				window.requestAnimationFrame(updateParallax);
				tickingRef.current = true;
			}
		};

		window.addEventListener('scroll', handleScroll, { passive: true });
		return () => window.removeEventListener('scroll', handleScroll);
	}, [prefersReducedMotion, updateParallax]);

	// IntersectionObserver for lazy loading
	useEffect(() => {
		const observer = new IntersectionObserver(
			([entry]) => {
				if (entry.isIntersecting) {
					setIsInView(true);
					observer.disconnect();
				}
			},
			{ rootMargin: '100px' },
		);

		if (bannerRef.current) {
			observer.observe(bannerRef.current);
		}

		return () => observer.disconnect();
	}, []);

	// Preload the full image when in view
	useEffect(() => {
		if (!isInView) return;

		const img = new Image();
		img.src = fullUrl;
		img.onload = () => setIsLoaded(true);
	}, [isInView, fullUrl]);

	return (
		<div
			ref={bannerRef}
			className={`parallax-hero ${className}`}
			role="img"
			aria-label={altText}>
			{/* LQIP Placeholder */}
			<div
				className="parallax-hero__placeholder"
				style={{
					backgroundImage: `url(${placeholderUrl})`,
					opacity: isLoaded ? 0 : 1,
				}}
				aria-hidden="true"
			/>

			{/* Full resolution parallax background */}
			{isInView && (
				<div
					ref={bgRef}
					className="parallax-hero__bg"
					style={{
						backgroundImage: `url(${fullUrl})`,
						opacity: isLoaded ? 1 : 0,
					}}
					aria-hidden="true"
				/>
			)}

			{/* Gradient overlay */}
			<div className="parallax-hero__overlay" aria-hidden="true" />

			{/* Profile capsule area - children rendered here */}
			{children && <div className="profile-capsule">{children}</div>}

			<style>{`
        .parallax-hero {
          position: sticky;
          top: 0;
          height: 100vh;
          width: 100vw;
          z-index: 0;
          overflow: hidden;
        }

        .parallax-hero__placeholder {
          position: absolute;
          inset: -10%;
          width: 120%;
          height: 120%;
          background-size: cover;
          background-position: center;
          filter: blur(20px);
          transition: opacity 500ms ease-out;
        }

        .parallax-hero__bg {
          position: absolute;
          inset: -10%;
          width: 120%;
          height: 120%;
          background-size: cover;
          background-position: center;
          will-change: transform;
          transition: opacity 500ms ease-out;
        }

        .parallax-hero__overlay {
          position: absolute;
          inset: 0;
          background: linear-gradient(
            to bottom,
            rgba(10, 10, 10, 0.3) 0%,
            rgba(10, 10, 10, 0.4) 30%,
            rgba(10, 10, 10, 0.4) 70%,
            rgba(10, 10, 10, 0.8) 100%
          );
        }

        .profile-capsule {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 100%;
          max-width: 1200px;
          padding: 0 1rem;
          z-index: 10;
        }

        @media (min-width: 768px) {
          .profile-capsule {
            padding: 0 1.5rem;
          }
        }

        /* Reduced motion */
        @media (prefers-reduced-motion: reduce) {
          .parallax-hero__placeholder,
          .parallax-hero__bg {
            transition: none;
            inset: 0;
            width: 100%;
            height: 100%;
          }
        }
      `}</style>
		</div>
	);
}

export default UnsplashBanner;
