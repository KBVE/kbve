/** @jsxImportSource react */
import { useEffect, useRef, useCallback, memo, useState } from 'react';
import { useStore } from '@nanostores/react';
import { createLandingCardService, type LandingCardConfig, type LandingCardIconAction } from './ServiceLandingCard';
import { eventEngine } from '@kbve/astropad';
import { VariableSizeGrid as Grid, type GridChildComponentProps } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';
import {
  Heart,
  Share2,
  Flag,
  Bookmark,
  MoreHorizontal,
  Star,
  Download,
  ExternalLink,
  Eye,
  MessageCircle
} from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

const cn = (...inputs: any[]) => {
  return twMerge(clsx(inputs));
};

// Icon mapper for string to component mapping
const iconMap = {
  heart: Heart,
  share: Share2,
  flag: Flag,
  bookmark: Bookmark,
  more: MoreHorizontal,
  star: Star,
  download: Download,
  external: ExternalLink,
  view: Eye,
  comment: MessageCircle,
} as const;

type ReactCardProps = LandingCardConfig;

export const ReactCard = (props: ReactCardProps) => {
  const serviceRef = useRef(createLandingCardService(props));
  const service = serviceRef.current;
  const state = useStore(service.getStateAtom());

  // Destructure state for cleaner code
  const { text, href, img, description, icons, isHovered, isExpanded } = state;

  const MAX_LENGTH = 120;
  const shouldTruncate = service.shouldTruncateDescription(MAX_LENGTH);
  const displayText = service.getDisplayText(MAX_LENGTH);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      service.destroy();
    };
  }, [service]);

  const cardContent = (
    <div
      className={cn(
        "rounded-lg transition-all duration-300 hover:scale-105 overflow-hidden flex flex-col h-full relative",
        href ? "cursor-pointer" : "cursor-default"
      )}
      onMouseEnter={() => service.setHovered(true)}
      onMouseLeave={() => service.setHovered(false)}
      style={{
        background: 'linear-gradient(135deg, var(--sl-color-accent-low) 0%, var(--sl-color-gray-6) 100%)',
        border: '1px solid var(--sl-color-gray-5)',
        boxShadow: isHovered
          ? '0 20px 25px -5px rgba(0, 0, 0, 0.4), 0 10px 10px -5px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(6, 182, 212, 0.3)'
          : '0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -1px rgba(0, 0, 0, 0.2), 0 0 0 1px rgba(6, 182, 212, 0.1)',
      }}>
      {/* Icons positioned over the image */}


      {img && (
        <div
          className="w-full h-40 sm:h-44 md:h-48 lg:h-52 overflow-hidden relative"
          style={{ backgroundColor: 'var(--sl-color-gray-6)' }}
        >
          <img
            src={img}
            alt={text}
            className="w-full h-full object-cover"
          />

          {icons && icons.length > 0 && img && (
            <div
              className="z-30"
              style={{
                position: 'absolute',
                top: '8px',
                right: '8px',
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 2.5rem)',
                gap: '8px',
                alignItems: 'center',
                justifyItems: 'center',
                zIndex: 30,
                marginTop: '0px',
              }}
            >
              {icons.map((iconAction, index) => {
                const IconComponent = iconMap[iconAction.icon as keyof typeof iconMap];
                return IconComponent ? (
                  <div
                    key={index}
                    style={{
                      width: '2.5rem',
                      height: '2.5rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginTop: '0px',
                    }}
                  >
                    <button
                      className={cn(
                        "rounded-full flex items-center justify-center transition-all duration-200 text-white cursor-pointer backdrop-blur-sm w-full h-full"
                      )}
                      style={{
                        width: '100%',
                        height: '100%',
                        padding: 0,
                        margin: 0,
                        lineHeight: 1,
                        fontSize: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                         background: 'rgba(0, 0, 0, 0.7)',
                      }}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();

                        // Add click animation
                        const button = e.currentTarget;
                        button.style.transform = 'scale(0.9)';
                        setTimeout(() => {
                          button.style.transform = 'scale(1.1)';
                          setTimeout(() => {
                            button.style.transform = 'scale(1)';
                          }, 100);
                        }, 100);

                        service.handleIconClick(iconAction.action, { icon: iconAction.icon });
                      }}
                      aria-label={iconAction.label}
                      title={iconAction.tooltip || iconAction.label}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = 'var(--sl-color-accent)';
                        e.currentTarget.style.color = 'white';
                        e.currentTarget.style.transform = 'scale(1.1)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
                        e.currentTarget.style.color = 'white';
                        e.currentTarget.style.transform = 'scale(1)';
                      }}
                    >
                      <IconComponent size={14} className="sm:w-4 sm:h-4" />
                    </button>
                  </div>
                ) : null;
              })}
            </div>

          )}

          {/* Title positioned over bottom of image */}
          <div className="absolute bottom-0 left-0 right-0 z-10 pointer-events-none">
            <h3
              className="text-white text-lg font-semibold m-0 p-3 leading-tight break-words"
              style={{
                textShadow: '2px 2px 4px rgba(0, 0, 0, 0.8), 0 0 8px rgba(0, 0, 0, 0.6), -1px -1px 0 rgba(0, 0, 0, 0.8), 1px -1px 0 rgba(0, 0, 0, 0.8), -1px 1px 0 rgba(0, 0, 0, 0.8), 1px 1px 0 rgba(0, 0, 0, 0.8)',
                background: 'linear-gradient(to top, rgba(0, 0, 0, 0.8), rgba(0, 0, 0, 0.4), transparent)',
              }}
            >
              {text}
            </h3>
          </div>
        </div>
      )}
      <div className="p-4 flex-1 flex flex-col">
        {description && (
          <div className="mt-0">
            <p
              className={cn(
                "text-sm leading-6",
                shouldTruncate ? "mb-2" : "mb-0"
              )}
              style={{
                color: 'var(--sl-color-gray-1)',
              }}
            >
              {displayText}
            </p>
            {shouldTruncate && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  service.toggleExpanded();
                }}
                className={cn(
                  "relative px-3 py-2 overflow-hidden border rounded-lg shadow-inner group text-xs cursor-pointer font-medium"
                )}
                style={{
                  background: 'var(--sl-color-gray-6)',
                  color: 'var(--sl-color-text)',
                  border: '1px solid var(--sl-color-gray-5)',
                }}
              >
                <span
                  className="absolute top-0 left-0 w-0 h-0 transition-all duration-200 border-t-2 group-hover:w-full ease"
                  style={{ borderColor: 'var(--sl-color-accent)' }}
                ></span>
                <span
                  className="absolute bottom-0 right-0 w-0 h-0 transition-all duration-200 border-b-2 group-hover:w-full ease"
                  style={{ borderColor: 'var(--sl-color-accent)' }}
                ></span>
                <span
                  className="absolute top-0 left-0 w-full h-0 transition-all duration-300 delay-200 group-hover:h-full ease"
                  style={{ backgroundColor: 'var(--sl-color-accent)' }}
                ></span>
                <span
                  className="absolute bottom-0 left-0 w-full h-0 transition-all duration-300 delay-200 group-hover:h-full ease"
                  style={{ backgroundColor: 'var(--sl-color-accent)' }}
                ></span>
                <span
                  className="absolute inset-0 w-full h-full duration-300 delay-300 opacity-0 group-hover:opacity-100"
                  style={{ backgroundColor: 'var(--sl-color-accent-high)' }}
                ></span>
                <span className="relative transition-colors duration-300 delay-200 group-hover:text-white ease">
                  {isExpanded ? 'Read less' : 'Read more'}
                </span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );

  if (href) {
    return (
      <a
        href={href}
        onClick={(e) => {
          e.preventDefault();
          service.handleClick();
        }}
        style={{ textDecoration: 'none', display: 'block', height: '100%' }}
      >
        {cardContent}
      </a>
    );
  }

  return (
    <div  onClick={() => service.handleClick()}>
      {cardContent}
    </div>
  );
};

// Virtualized Card Grid Component
interface VirtualizedCardGridProps {
  cards: LandingCardConfig[];
  minCardWidth?: number;
  cardHeight?: number;
  gap?: number;
  overscanCount?: number;
  loadMore?: () => void;
  hasMore?: boolean;
  isLoading?: boolean;
  containerHeight?: string;
}

interface CardCellProps extends GridChildComponentProps {
  data: {
    cards: LandingCardConfig[];
    columnsPerRow: number;
    cardWidth: number;
    cardHeight: number;
    gap: number;
  };
}

// Memoized card cell component for optimal performance
const CardCell = memo(({ columnIndex, rowIndex, style, data }: CardCellProps) => {
  const { cards, columnsPerRow, cardWidth, cardHeight, gap } = data;
  const cardIndex = rowIndex * columnsPerRow + columnIndex;
  const card = cards[cardIndex];

  if (!card) {
    // Empty cell or loading placeholder
    return (
      <div
        style={{
          ...style,
          padding: gap / 2,
        }}
      >
        <div
          className="animate-pulse rounded-lg opacity-30"
          style={{
            width: cardWidth,
            height: cardHeight,
            backgroundColor: 'var(--sl-color-gray-6)',
            border: '1px solid var(--sl-color-gray-5)',
          }}
        />
      </div>
    );
  }

  return (
    <div
      style={{
        ...style,
        padding: gap / 2,
        marginTop: '0px',
      }}
    >
      <div style={{ width: cardWidth, height: cardHeight }}>
        <ReactCard
          {...card}
          key={card.id || `card-${cardIndex}`}
        />
      </div>
    </div>
  );
});

CardCell.displayName = 'CardCell';

export const VirtualizedCardGrid = memo(({
  cards,
  minCardWidth = 300,
  cardHeight = 400,
  gap = 16,
  overscanCount = 3,
  loadMore,
  hasMore = false,
  isLoading = false,
  containerHeight = '600px',
}: VirtualizedCardGridProps) => {
  const gridRef = useRef<Grid>(null);
  const loadMoreTriggered = useRef(false);

  // Calculate grid dimensions
  const calculateGridLayout = useCallback((containerWidth: number) => {
    const effectiveWidth = containerWidth - gap;
    const columnsPerRow = Math.max(1, Math.floor(effectiveWidth / (minCardWidth + gap)));
    const cardWidth = Math.floor((effectiveWidth - (columnsPerRow - 1) * gap) / columnsPerRow);
    const totalRows = Math.ceil(cards.length / columnsPerRow);

    return {
      columnsPerRow,
      cardWidth,
      totalRows,
      cellWidth: cardWidth + gap,
      cellHeight: cardHeight + gap,
    };
  }, [cards.length, minCardWidth, cardHeight, gap]);

  // Handle scroll to trigger infinite loading
  const handleScroll = useCallback(({
    scrollTop,
    scrollHeight,
    clientHeight,
  }: {
    scrollTop: number;
    scrollHeight: number;
    clientHeight: number;
  }) => {
    const scrollPercentage = (scrollTop + clientHeight) / scrollHeight;

    // Trigger load more when 80% scrolled and not already loading
    if (scrollPercentage > 0.8 && hasMore && !isLoading && !loadMoreTriggered.current && loadMore) {
      loadMoreTriggered.current = true;
      loadMore();

      // Reset trigger after delay
      setTimeout(() => {
        loadMoreTriggered.current = false;
      }, 1000);
    }
  }, [hasMore, isLoading, loadMore]);

  // Reset load trigger when new cards are loaded
  useEffect(() => {
    loadMoreTriggered.current = false;
  }, [cards.length]);

  return (
    <div style={{ width: '100%', height: containerHeight, position: 'relative' }}>
      <AutoSizer>
        {({ height, width }) => {
          const layout = calculateGridLayout(width);

          return (
            <Grid
              ref={gridRef}
              height={height}
              width={width}
              columnCount={layout.columnsPerRow}
              rowCount={layout.totalRows}
              columnWidth={() => layout.cellWidth}
              rowHeight={() => layout.cellHeight}
              itemData={{
                cards,
                columnsPerRow: layout.columnsPerRow,
                cardWidth: layout.cardWidth,
                cardHeight,
                gap,
              }}
              onScroll={handleScroll}
              overscanRowCount={overscanCount}
              overscanColumnCount={overscanCount}
              style={{
                scrollbarWidth: 'thin',
                scrollbarColor: 'var(--sl-color-gray-4) transparent',
              }}
            >
              {CardCell}
            </Grid>
          );
        }}
      </AutoSizer>

      {/* Loading indicator */}
      {isLoading && (
        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-10">
          <div
            className="flex items-center gap-2 px-4 py-2 backdrop-blur-lg rounded-3xl text-sm"
            style={{
              backgroundColor: 'var(--sl-color-gray-6)',
              border: '1px solid var(--sl-color-gray-5)',
              color: 'var(--sl-color-text)',
            }}
          >
            <div
              className="w-4 h-4 rounded-full animate-spin"
              style={{
                border: '2px solid var(--sl-color-gray-4)',
                borderTopColor: 'var(--sl-color-accent)',
              }}
            />
            Loading more cards...
          </div>
        </div>
      )}

      {/* End of results indicator */}
      {!hasMore && cards.length > 0 && (
        <div className="text-center py-8">
          <div
            className="inline-flex items-center gap-2 px-4 py-2 rounded-3xl text-sm"
            style={{
              backgroundColor: 'var(--sl-color-gray-6)',
              border: '1px solid var(--sl-color-gray-5)',
              color: 'var(--sl-color-text-accent)',
            }}
          >
            You've reached the end
          </div>
        </div>
      )}
    </div>
  );
});

VirtualizedCardGrid.displayName = 'VirtualizedCardGrid';

// Loading Skeleton Component
export const CardSkeleton = memo(() => {
  return (
    <div
      className="rounded-lg overflow-hidden animate-pulse h-full flex flex-col mt-0"
      style={{
        background: 'linear-gradient(135deg, var(--sl-color-accent-low) 0%, var(--sl-color-gray-6) 100%)',
        border: '1px solid var(--sl-color-gray-5)',
        marginTop: '0px',
      }}
    >
      {/* Image skeleton */}
      <div
        className="w-full h-48 opacity-70"
        style={{ backgroundColor: 'var(--sl-color-gray-5)' }}
      />

      {/* Content skeleton */}
      <div className="p-4 flex-1 flex flex-col">
        {/* Title skeleton */}
        <div
          className="h-6 rounded mb-3 w-4/5 opacity-80"
          style={{ backgroundColor: 'var(--sl-color-gray-5)' }}
        />

        {/* Description skeleton */}
        <div className="flex-1 mb-4">
          <div
            className="h-4 rounded mb-2 w-full opacity-60"
            style={{ backgroundColor: 'var(--sl-color-gray-5)' }}
          />
          <div
            className="h-4 rounded mb-2 w-4/5 opacity-60"
            style={{ backgroundColor: 'var(--sl-color-gray-5)' }}
          />
          <div
            className="h-4 rounded w-3/5 opacity-60"
            style={{ backgroundColor: 'var(--sl-color-gray-5)' }}
          />
        </div>

        {/* Icons skeleton */}
        <div className="flex gap-3 justify-end">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="w-8 h-8 rounded-md opacity-50"
              style={{ backgroundColor: 'var(--sl-color-gray-5)' }}
            />
          ))}
        </div>
      </div>
    </div>
  );
});

CardSkeleton.displayName = 'CardSkeleton';

// Grid Loading Skeleton Component
interface GridSkeletonProps {
  containerHeight: string;
  minCardWidth?: number;
  cardHeight?: number;
  gap?: number;
  skeletonCount?: number;
}

export const GridSkeleton = memo(({
  containerHeight,
  minCardWidth = 300,
  cardHeight = 400,
  gap = 16,
  skeletonCount = 12,
}: GridSkeletonProps) => {
  return (
    <div className="w-full relative overflow-hidden" style={{ height: containerHeight }}>
      <AutoSizer>
        {({ width }) => {
          const effectiveWidth = width - gap;
          const columnsPerRow = Math.max(1, Math.floor(effectiveWidth / (minCardWidth + gap)));
          const cardWidth = Math.floor((effectiveWidth - (columnsPerRow - 1) * gap) / columnsPerRow);

          return (
            <div
              className="grid h-full overflow-y-auto"
              style={{
                gridTemplateColumns: `repeat(${columnsPerRow}, 1fr)`,
                gap: `${gap}px`,
                padding: `${gap / 2}px`,
              }}
            >
              {Array.from({ length: skeletonCount }, (_, i) => (
                <div
                  key={i}
                  style={{
                    width: cardWidth,
                    height: cardHeight,
                  }}
                >
                  <CardSkeleton />
                </div>
              ))}
            </div>
          );
        }}
      </AutoSizer>
    </div>
  );
});

GridSkeleton.displayName = 'GridSkeleton';

// Client-side wrapper that handles loading state
interface ClientCardGridProps {
  url: string;
  collectionKey?: string;
  virtualized?: boolean;
  containerHeight?: string;
  minCardWidth?: number;
  cardHeight?: number;
  skeletonCount?: number;
  filter?: (entry: any) => boolean;
  limit?: number;
  sortBy?: 'title' | 'date' | 'slug';
  sortOrder?: 'asc' | 'desc';
}

export const ClientCardGrid = memo(({
  url,
  collectionKey = 'applications',
  virtualized = false,
  containerHeight = virtualized ? '600px' : 'auto',
  minCardWidth = 300,
  cardHeight = 400,
  skeletonCount = 12,
  filter,
  limit,
  sortBy = 'title',
  sortOrder = 'asc',
}: ClientCardGridProps) => {
  const [cards, setCards] = useState<LandingCardConfig[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  // Add event listeners for icon actions
  useEffect(() => {
    const handleIconAction = (eventData: any) => {
      console.log('Landing card icon action:', eventData);
      // Here you can add specific handling for each action
      switch (eventData.iconAction) {
        case 'like':
          console.log('Like action triggered for card:', eventData.cardId);
          break;
        case 'comment':
          console.log('Comment action triggered for card:', eventData.cardId);
          break;
        case 'share':
          console.log('Share action triggered for card:', eventData.cardId);
          break;
        case 'bookmark':
          console.log('Bookmark action triggered for card:', eventData.cardId);
          break;
        default:
          console.log('Unknown action:', eventData.iconAction);
      }
    };

    // Register event listeners for each icon action
    const engineInstance = (typeof window !== 'undefined' && window.eventEngine) || eventEngine;

    if (engineInstance) {
      engineInstance.on('landingcard:icon:like', handleIconAction);
      engineInstance.on('landingcard:icon:comment', handleIconAction);
      engineInstance.on('landingcard:icon:share', handleIconAction);
      engineInstance.on('landingcard:icon:bookmark', handleIconAction);
    }

    return () => {
      // Cleanup event listeners
      if (engineInstance && typeof engineInstance.off === 'function') {
        try {
          engineInstance.off('landingcard:icon:like', handleIconAction);
          engineInstance.off('landingcard:icon:comment', handleIconAction);
          engineInstance.off('landingcard:icon:share', handleIconAction);
          engineInstance.off('landingcard:icon:bookmark', handleIconAction);
        } catch (error) {
          console.warn('Error cleaning up event listeners:', error);
        }
      }
    };
  }, []);

  useEffect(() => {
    const fetchCards = async () => {
      try {
        setIsLoading(true);
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        let fetchedData = data[collectionKey] || data || [];

        if (!Array.isArray(fetchedData)) {
          console.warn(`Expected array from ${url}[${collectionKey}], got:`, typeof fetchedData);
          fetchedData = [];
        }

        // Apply default filter
        const defaultFilter = (entry: any) => entry.title && entry.title !== "";
        const filteredEntries = fetchedData.filter(filter || defaultFilter);

        // Transform entries to card data format
        const transformedCards = filteredEntries.map((entry: any, index: number) => ({
          ...entry,
          id: entry.id || entry.slug?.replace(/^\//, '').replace(/\/$/, '') || `card-${index}`,
          slug: entry.slug || `#${entry.id || index}`,
        }));

        // Sort cards if requested
        if (sortBy) {
          transformedCards.sort((a: any, b: any) => {
            let aValue = a[sortBy];
            let bValue = b[sortBy];

            if (sortBy === 'date') {
              aValue = new Date(aValue).getTime();
              bValue = new Date(bValue).getTime();
            }

            if (typeof aValue === 'string' && typeof bValue === 'string') {
              aValue = aValue.toLowerCase();
              bValue = bValue.toLowerCase();
            }

            const comparison = aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
            return sortOrder === 'desc' ? -comparison : comparison;
          });
        }

        // Apply limit if specified
        const finalCards = limit ? transformedCards.slice(0, limit) : transformedCards;

        setCards(finalCards);
        setError(null);
      } catch (error) {
        console.error(`Failed to fetch data from "${url}":`, error);
        setError(error instanceof Error ? error.message : 'Failed to fetch data');
        setCards([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchCards();
  }, [url, collectionKey, filter, limit, sortBy, sortOrder]);

  // Handle fade in/out transition
  useEffect(() => {
    if (!isLoading) {
      // Hide static skeleton and show React content
      const staticSkeleton = document.getElementById('static-skeleton');
      if (staticSkeleton) {
        staticSkeleton.style.opacity = '0';
        setTimeout(() => {
          staticSkeleton.style.display = 'none';
          setIsVisible(true);
        }, 500); // Match the CSS transition duration
      } else {
        setIsVisible(true);
      }
    }
  }, [isLoading]);

  // Don't render anything while loading (static skeleton is shown)
  if (isLoading || !isVisible) {
    return null;
  }

  // Show error state
  if (error) {
    return (
      <div
        className="p-8 text-center rounded-lg flex items-center justify-center flex-col gap-4"
        style={{
          color: 'var(--sl-color-text-accent)',
          backgroundColor: 'var(--sl-color-gray-6)',
          border: '1px solid var(--sl-color-gray-5)',
          minHeight: containerHeight !== 'auto' ? containerHeight : '200px',
        }}
      >
        <div className="text-xl font-semibold">Failed to load cards</div>
        <div className="text-sm opacity-70">{error}</div>
      </div>
    );
  }

  // Default icons for landing cards
  const defaultIcons: LandingCardIconAction[] = [
    {
      icon: 'heart',
      label: 'Like',
      action: 'like',
      tooltip: 'Like this item'
    },
    {
      icon: 'comment',
      label: 'Comment',
      action: 'comment',
      tooltip: 'Add a comment'
    },
    {
      icon: 'share',
      label: 'Share',
      action: 'share',
      tooltip: 'Share this item'
    },
    {
      icon: 'bookmark',
      label: 'Bookmark',
      action: 'bookmark',
      tooltip: 'Bookmark this item'
    }
  ];

  // Transform cards for rendering
  const renderCards = cards.map((card: any) => {
    const cleanSlug = card.slug?.includes('index')
      ? card.slug.replace(/index(\.mdx)?$/, '/').replace(/\/\/$/, '/')
      : card.slug;

    return {
      ...card,
      href: cleanSlug,
      text: card.title || 'Untitled',
      icons: card.icons || defaultIcons, // Use provided icons or default ones
    };
  });

  // Render virtualized or standard grid with fade-in animation
  const containerClasses = cn(
    "w-full h-full transition-opacity duration-500 ease-in-out",
    containerHeight !== 'auto' && "overflow-y-auto",
    isVisible ? "opacity-100" : "opacity-0"
  );

  const containerStyle = {
    ...(containerHeight !== 'auto' ? {
      scrollBehavior: 'smooth' as const,
      scrollbarWidth: 'thin' as const,
      scrollbarColor: 'var(--sl-color-gray-4) transparent',
    } : {}),
  };

  if (virtualized) {
    return (
      <div className={containerClasses} style={containerStyle}>
        <VirtualizedCardGrid
          cards={renderCards}
          containerHeight={containerHeight}
          minCardWidth={minCardWidth}
          cardHeight={cardHeight}
        />
      </div>
    );
  }

  // Standard grid with fade-in animation
  return (
    <div className={containerClasses} style={containerStyle}>
      <section className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-4 h-full">
        {renderCards.map((card: any, index: number) => (
          <ReactCard
            key={card.id || `card-${index}`}
            {...card}
          />
        ))}
      </section>
    </div>
  );
});

ClientCardGrid.displayName = 'ClientCardGrid';

// Hook for managing virtualized card grid state
export const useVirtualizedCardGrid = (
  initialCards: LandingCardConfig[] = [],
  fetchMore?: (page: number) => Promise<LandingCardConfig[]>
) => {
  const [cards, setCards] = useState<LandingCardConfig[]>(initialCards);
  const [page, setPage] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const loadMore = useCallback(async () => {
    if (!fetchMore || isLoading || !hasMore) return;

    setIsLoading(true);
    try {
      const newCards = await fetchMore(page);
      if (newCards.length === 0) {
        setHasMore(false);
      } else {
        setCards(prev => [...prev, ...newCards]);
        setPage(prev => prev + 1);
      }
    } catch (error) {
      console.error('Failed to load more cards:', error);
    } finally {
      setIsLoading(false);
    }
  }, [fetchMore, page, isLoading, hasMore]);

  const reset = useCallback((newCards: LandingCardConfig[] = []) => {
    setCards(newCards);
    setPage(0);
    setHasMore(true);
    setIsLoading(false);
  }, []);

  return {
    cards,
    isLoading,
    hasMore,
    loadMore,
    reset,
    setCards,
  };
};