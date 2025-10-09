/** @jsxImportSource react */
import { useState } from 'react';

type ReactCardProps = {
  text: string;
  href?: string;
  img?: string;
  description?: string;
};

export const ReactCard = ({ text, href, img, description }: ReactCardProps) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const MAX_LENGTH = 120;
  const shouldTruncate = description && description.length > MAX_LENGTH;
  const displayText = shouldTruncate && !isExpanded
    ? description.substring(0, MAX_LENGTH) + '...'
    : description;

  const cardContent = (
    <div
      className="rounded-lg transition-all duration-300 hover:scale-105 overflow-hidden"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        background: 'linear-gradient(135deg, var(--sl-color-accent-low) 0%, var(--sl-color-gray-6) 100%)',
        border: '1px solid var(--sl-color-gray-5)',
        cursor: href ? 'pointer' : 'default',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        boxShadow: isHovered
          ? '0 20px 25px -5px rgba(0, 0, 0, 0.4), 0 10px 10px -5px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(6, 182, 212, 0.3)'
          : '0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -1px rgba(0, 0, 0, 0.2), 0 0 0 1px rgba(6, 182, 212, 0.1)',
    }}>
      {img && (
        <div style={{
          width: '100%',
          height: '200px',
          overflow: 'hidden',
          backgroundColor: 'var(--sl-color-gray-6)',
        }}>
          <img
            src={img}
            alt={text}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
          />
        </div>
      )}
      <div className="p-4" style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
      }}>
        <h3 className="text-lg font-semibold" style={{
          color: 'var(--sl-color-white)',
          marginBottom: description ? '0.5rem' : '0',
        }}>{text}</h3>
        {description && (
          <div style={{ marginTop: '0.5rem' }}>
            <p style={{
              color: 'var(--sl-color-gray-1)',
              fontSize: '0.875rem',
              lineHeight: '1.5',
              marginBottom: shouldTruncate ? '0.5rem' : '0',
            }}>
              {displayText}
            </p>
            {shouldTruncate && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsExpanded(!isExpanded);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--sl-color-accent)',
                  fontSize: '0.875rem',
                  cursor: 'pointer',
                  padding: '0',
                  textDecoration: 'none',
                  fontWeight: '600',
                  transition: 'opacity 0.2s',
                }}
                onMouseEnter={(e) => e.currentTarget.style.opacity = '0.8'}
                onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
              >
                {isExpanded ? 'Read less' : 'Read more'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );

  if (href) {
    return (
      <a href={href} style={{ textDecoration: 'none', display: 'block', height: '100%' }}>
        {cardContent}
      </a>
    );
  }

  return cardContent;
};