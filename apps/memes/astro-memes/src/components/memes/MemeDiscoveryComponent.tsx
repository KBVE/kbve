import React, { useState, useEffect } from 'react';
import { clsx, twMerge } from '../../layouts/core/tw';

// Hardcoded JSON data for memes
const MOCK_MEMES = [
  {
    id: "1",
    type: "image" as const,
    url: "https://picsum.photos/400/600?random=1",
    title: "When you realize it's Monday again",
    tags: ["relatable", "monday", "mood"],
    author: {
      username: "meme_master_2024",
      avatar: "https://picsum.photos/40/40?random=10"
    },
    stats: {
      likes: 12400,
      views: 45600,
      shares: 890
    },
    createdAt: "2024-01-15T10:30:00Z"
  },
  {
    id: "2", 
    type: "video" as const,
    url: "https://sample-videos.com/zip/10/mp4/SampleVideo_1280x720_1mb.mp4",
    thumbnail: "https://picsum.photos/400/600?random=2",
    title: "Cat discovers antigravity",
    tags: ["cats", "funny", "physics"],
    author: {
      username: "cat_physics_pro",
      avatar: "https://picsum.photos/40/40?random=11"
    },
    stats: {
      likes: 8900,
      views: 32100,
      shares: 567
    },
    createdAt: "2024-01-14T15:45:00Z"
  },
  {
    id: "3",
    type: "image" as const, 
    url: "https://picsum.photos/400/600?random=3",
    title: "Programmer vs. Code at 3 AM",
    tags: ["programming", "relatable", "coding"],
    author: {
      username: "code_comedian",
      avatar: "https://picsum.photos/40/40?random=12"
    },
    stats: {
      likes: 15600,
      views: 67800,
      shares: 1200
    },
    createdAt: "2024-01-13T22:15:00Z"
  },
  {
    id: "4",
    type: "image" as const,
    url: "https://picsum.photos/400/600?random=4", 
    title: "When someone says 'It works on my machine'",
    tags: ["programming", "bugs", "testing"],
    author: {
      username: "debug_master",
      avatar: "https://picsum.photos/40/40?random=13"
    },
    stats: {
      likes: 9800,
      views: 28900,
      shares: 445
    },
    createdAt: "2024-01-12T09:20:00Z"
  },
  {
    id: "5",
    type: "video" as const,
    url: "https://sample-videos.com/zip/10/mp4/SampleVideo_1280x720_2mb.mp4",
    thumbnail: "https://picsum.photos/400/600?random=5",
    title: "Dog learns to code better than humans",
    tags: ["dogs", "coding", "ai"],
    author: {
      username: "ai_doggo",
      avatar: "https://picsum.photos/40/40?random=14"
    },
    stats: {
      likes: 22100,
      views: 89400,
      shares: 1800
    },
    createdAt: "2024-01-11T14:30:00Z"
  }
];

type MemeType = typeof MOCK_MEMES[0];
type ViewMode = 'stack' | 'vertical' | 'stories';

export const MemeDiscoveryComponent: React.FC = () => {
  const [currentMode, setCurrentMode] = useState<ViewMode>('stack');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [likedMemes, setLikedMemes] = useState<Set<string>>(new Set());

  useEffect(() => {
    // Signal that the component has mounted
    const skeleton = document.getElementById('meme-discovery-skeleton-loader');
    const content = document.getElementById('meme-discovery-content');
    
    if (skeleton && content) {
      setTimeout(() => {
        skeleton.style.opacity = '0';
        content.style.opacity = '1';
        
        setTimeout(() => {
          skeleton.remove();
        }, 500);
      }, 100);
    }
  }, []);

  const formatNumber = (num: number): string => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  };

  const handleLike = (memeId: string) => {
    setLikedMemes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(memeId)) {
        newSet.delete(memeId);
      } else {
        newSet.add(memeId);
      }
      return newSet;
    });
  };

  const nextStory = () => {
    if (currentIndex < MOCK_MEMES.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const previousStory = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const MemeCard: React.FC<{ meme: MemeType; mode: ViewMode; className?: string }> = ({ 
    meme, 
    mode, 
    className 
  }) => {
    const isLiked = likedMemes.has(meme.id);
    
    return (
      <div className={twMerge(
        "bg-zinc-900 border border-zinc-700 rounded-2xl overflow-hidden aspect-[3/4] relative group",
        "transition-all duration-300 hover:scale-[1.02] hover:shadow-xl hover:shadow-emerald-500/10",
        className
      )}>
        {/* Media */}
        <div className="relative h-full">
          {meme.type === 'video' ? (
            <video 
              className="w-full h-full object-cover" 
              poster={meme.thumbnail} 
              controls 
              playsInline
            >
              <source src={meme.url} type="video/mp4" />
            </video>
          ) : (
            <img 
              src={meme.url} 
              alt={meme.title} 
              className="w-full h-full object-cover"
              loading="lazy"
            />
          )}
          
          {/* Overlay gradient */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
          
          {/* Content overlay */}
          <div className="absolute bottom-0 left-0 right-0 p-6 text-white">
            <h3 className="font-bold text-lg mb-2 line-clamp-2">{meme.title}</h3>
            
            {/* Author */}
            <div className="flex items-center space-x-2 mb-4">
              <img 
                src={meme.author.avatar} 
                alt={meme.author.username} 
                className="w-8 h-8 rounded-full border-2 border-emerald-400/50"
              />
              <span className="text-sm text-neutral-300">@{meme.author.username}</span>
            </div>
            
            {/* Tags */}
            <div className="flex flex-wrap gap-2 mb-4">
              {meme.tags.slice(0, 3).map(tag => (
                <span 
                  key={tag}
                  className="px-2 py-1 bg-emerald-500/20 text-emerald-300 text-xs rounded-full backdrop-blur-sm"
                >
                  #{tag}
                </span>
              ))}
            </div>
            
            {/* Stats */}
            <div className="flex items-center space-x-4 text-sm text-neutral-400">
              <span className="flex items-center space-x-1">
                <span className={isLiked ? '❤️' : '🤍'}>
                  {isLiked ? '❤️' : '🤍'}
                </span>
                <span>{formatNumber(meme.stats.likes + (isLiked ? 1 : 0))}</span>
              </span>
              <span className="flex items-center space-x-1">
                <span>👁️</span>
                <span>{formatNumber(meme.stats.views)}</span>
              </span>
              <span className="flex items-center space-x-1">
                <span>🔄</span>
                <span>{formatNumber(meme.stats.shares)}</span>
              </span>
            </div>
          </div>
          
          {/* Action buttons (not for stories mode) */}
          {mode !== 'stories' && (
            <div className="absolute top-4 right-4 flex flex-col space-y-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
              <button 
                onClick={() => handleLike(meme.id)}
                className={clsx(
                  "p-3 backdrop-blur-sm text-white rounded-full transition-all duration-300 hover:scale-110",
                  isLiked 
                    ? "bg-red-500/80 hover:bg-red-400/80" 
                    : "bg-black/50 hover:bg-emerald-500/50"
                )}
              >
                {isLiked ? '❤️' : '🤍'}
              </button>
              <button className="p-3 bg-black/50 backdrop-blur-sm text-white rounded-full hover:bg-blue-500/50 transition-all duration-300 hover:scale-110">
                💬
              </button>
              <button className="p-3 bg-black/50 backdrop-blur-sm text-white rounded-full hover:bg-purple-500/50 transition-all duration-300 hover:scale-110">
                🔄
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  const StackMode = () => (
    <div className="relative h-screen flex items-center justify-center p-4">
      <div className="relative w-full max-w-sm">
        {MOCK_MEMES.slice(0, 3).map((meme, index) => (
          <div 
            key={meme.id}
            className="absolute inset-0 transition-all duration-500" 
            style={{
              zIndex: 10 - index,
              transform: `translateY(${index * 8}px) scale(${1 - index * 0.05})`,
            }}
          >
            <MemeCard meme={meme} mode="stack" />
          </div>
        ))}
      </div>
      
      {/* Swipe Actions */}
      <div className="absolute bottom-20 left-1/2 transform -translate-x-1/2 flex space-x-8">
        <button className="p-4 bg-red-500 hover:bg-red-400 text-white rounded-full transition-all duration-300 hover:scale-110 shadow-lg">
          ❌
        </button>
        <button 
          onClick={() => handleLike(MOCK_MEMES[0].id)}
          className="p-4 bg-emerald-500 hover:bg-emerald-400 text-white rounded-full transition-all duration-300 hover:scale-110 shadow-lg"
        >
          ❤️
        </button>
      </div>
    </div>
  );

  const VerticalMode = () => (
    <div className="space-y-6 p-4 max-w-md mx-auto">
      {MOCK_MEMES.map(meme => (
        <div key={meme.id} className="snap-center">
          <MemeCard meme={meme} mode="vertical" />
        </div>
      ))}
    </div>
  );

  const StoriesMode = () => {
    const currentMeme = MOCK_MEMES[currentIndex];
    
    return (
      <div className="relative h-screen flex items-center justify-center">
        <div className="relative w-full max-w-sm">
          {/* Progress bars */}
          <div className="absolute top-4 left-4 right-4 z-20 flex space-x-1">
            {MOCK_MEMES.map((_, index) => (
              <div key={index} className="flex-1 h-1 bg-white/30 rounded-full overflow-hidden">
                <div 
                  className={clsx(
                    "h-full bg-white transition-all duration-300",
                    index === currentIndex ? 'w-full' : index < currentIndex ? 'w-full' : 'w-0'
                  )}
                />
              </div>
            ))}
          </div>
          
          {/* Current meme */}
          <MemeCard meme={currentMeme} mode="stories" />
          
          {/* Tap zones */}
          <div className="absolute inset-0 z-10 flex">
            <div className="flex-1" onClick={previousStory} />
            <div className="flex-1" onClick={nextStory} />
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="relative min-h-screen">
      {/* Main content based on mode */}
      <div className="min-h-screen">
        {currentMode === 'stack' && <StackMode />}
        {currentMode === 'vertical' && <VerticalMode />}
        {currentMode === 'stories' && <StoriesMode />}
      </div>

      {/* Floating Navigation */}
      <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50">
        <div className="flex items-center space-x-2 bg-zinc-900/90 backdrop-blur-md border border-zinc-700 rounded-full px-4 py-2 shadow-xl">
          <button
            onClick={() => setCurrentMode('stack')}
            className={clsx(
              "p-3 rounded-full transition-all duration-300",
              currentMode === 'stack'
                ? "bg-emerald-500 text-white shadow-lg"
                : "text-neutral-400 hover:text-emerald-400 hover:bg-emerald-500/10"
            )}
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path d="M7 3a1 1 0 000 2h6a1 1 0 100-2H7zM4 7a1 1 0 011-1h10a1 1 0 110 2H5a1 1 0 01-1-1zM2 11a2 2 0 012-2h12a2 2 0 012 2v4a2 2 0 01-2 2H4a2 2 0 01-2-2v-4z"/>
            </svg>
          </button>
          <button
            onClick={() => setCurrentMode('vertical')}
            className={clsx(
              "p-3 rounded-full transition-all duration-300",
              currentMode === 'vertical'
                ? "bg-emerald-500 text-white shadow-lg"
                : "text-neutral-400 hover:text-emerald-400 hover:bg-emerald-500/10"
            )}
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h6a1 1 0 110 2H4a1 1 0 01-1-1zM3 16a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z"/>
            </svg>
          </button>
          <button
            onClick={() => setCurrentMode('stories')}
            className={clsx(
              "p-3 rounded-full transition-all duration-300",
              currentMode === 'stories'
                ? "bg-emerald-500 text-white shadow-lg"
                : "text-neutral-400 hover:text-emerald-400 hover:bg-emerald-500/10"
            )}
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h6a1 1 0 110 2H4a1 1 0 01-1-1zM14 16a1 1 0 01-1-1v-6a1 1 0 112 0v6a1 1 0 01-1 1z"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};
