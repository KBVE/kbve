/**
 * LazyAvatar - Accessible avatar component with lazy loading
 * Features:
 * - Native lazy loading with loading="lazy"
 * - Skeleton placeholder during load
 * - Fallback to first letter on error or missing src
 * - Multiple size variants
 * - Proper ARIA attributes for accessibility
 * - Askama-compatible: can receive avatarUrl from server-side template
 */
import { useState } from 'react';

export interface LazyAvatarProps {
	/** Avatar image URL */
	src?: string | null;
	/** Alt text for the image (required for a11y) */
	alt: string;
	/** Fallback letter to display if no image */
	fallback: string;
	/** Size variant */
	size?: 'sm' | 'md' | 'lg' | 'xl';
	/** Additional CSS classes */
	className?: string;
	/** Border color (CSS value) */
	borderColor?: string;
}

const sizeConfig = {
	sm: { dimension: 48, fontSize: '1.25rem' },
	md: { dimension: 64, fontSize: '1.5rem' },
	lg: { dimension: 96, fontSize: '2rem' },
	xl: { dimension: 140, fontSize: '3rem' },
};

export function LazyAvatar({
	src,
	alt,
	fallback,
	size = 'lg',
	className = '',
	borderColor = 'var(--sl-color-bg, #0a0a0a)',
}: LazyAvatarProps) {
	const [isLoaded, setIsLoaded] = useState(false);
	const [hasError, setHasError] = useState(false);

	const { dimension, fontSize } = sizeConfig[size];
	const showImage = src && !hasError;
	const fallbackLetter = (fallback || 'U').charAt(0).toUpperCase();

	return (
		<figure
			className={`lazy-avatar lazy-avatar--${size} ${className}`}
			role="img"
			aria-label={alt}
			style={
				{
					'--avatar-size': `${dimension}px`,
					'--avatar-font-size': fontSize,
					'--avatar-border-color': borderColor,
				} as React.CSSProperties
			}>
			<div className="lazy-avatar__container">
				{showImage ? (
					<>
						{/* Skeleton loader - visible until image loads */}
						{!isLoaded && (
							<div
								className="lazy-avatar__skeleton"
								aria-hidden="true"
							/>
						)}
						<img
							src={src}
							alt={alt}
							loading="lazy"
							decoding="async"
							onLoad={() => setIsLoaded(true)}
							onError={() => setHasError(true)}
							className={`lazy-avatar__image ${isLoaded ? 'lazy-avatar__image--loaded' : ''}`}
						/>
					</>
				) : (
					<span className="lazy-avatar__fallback" aria-hidden="true">
						{fallbackLetter}
					</span>
				)}
			</div>

			<style>{`
        .lazy-avatar {
          margin: 0;
          flex-shrink: 0;
        }

        .lazy-avatar__container {
          width: var(--avatar-size, 96px);
          height: var(--avatar-size, 96px);
          border-radius: 50%;
          overflow: hidden;
          background: linear-gradient(135deg, var(--sl-color-accent, #a78bfa) 0%, #8b5cf6 100%);
          border: 4px solid var(--avatar-border-color, var(--sl-color-bg, #0a0a0a));
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.1);
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .lazy-avatar__skeleton {
          position: absolute;
          inset: 0;
          background: linear-gradient(
            90deg,
            var(--sl-color-gray-5, #262626) 25%,
            var(--sl-color-gray-6, #1a1a1a) 50%,
            var(--sl-color-gray-5, #262626) 75%
          );
          background-size: 200% 100%;
          animation: avatar-shimmer 1.5s ease-in-out infinite;
        }

        @keyframes avatar-shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }

        .lazy-avatar__image {
          width: 100%;
          height: 100%;
          object-fit: cover;
          opacity: 0;
          transition: opacity 300ms ease-out;
        }

        .lazy-avatar__image--loaded {
          opacity: 1;
        }

        .lazy-avatar__fallback {
          font-size: var(--avatar-font-size, 2rem);
          font-weight: 700;
          color: white;
          text-transform: uppercase;
          user-select: none;
        }

        /* Size-specific adjustments */
        .lazy-avatar--sm .lazy-avatar__container {
          border-width: 2px;
        }

        .lazy-avatar--md .lazy-avatar__container {
          border-width: 3px;
        }

        .lazy-avatar--xl .lazy-avatar__container {
          border-width: 5px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.1);
        }

        /* Reduced motion */
        @media (prefers-reduced-motion: reduce) {
          .lazy-avatar__skeleton {
            animation: none;
          }
          .lazy-avatar__image {
            transition: none;
          }
        }
      `}</style>
		</figure>
	);
}

export default LazyAvatar;
