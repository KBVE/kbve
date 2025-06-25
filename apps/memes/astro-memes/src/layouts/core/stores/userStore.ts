import { atom } from 'nanostores';
import { persistentAtom } from '@nanostores/persistent';
import type { User, Session } from '@supabase/supabase-js';

// Enhanced User Profile Interface
export interface UserProfile {
  // Core identity
  id: string;
  uuid: string;
  email: string;
  username?: string;
  
  // Profile details
  avatar_url?: string;
  full_name?: string;
  display_name?: string;
  bio?: string;
  website?: string;
  location?: string;
  
  // User metadata from auth
  user_metadata?: {
    username?: string;
    avatar_url?: string;
    full_name?: string;
    [key: string]: any;
  };
  
  // App metadata
  app_metadata?: {
    provider?: string;
    providers?: string[];
    [key: string]: any;
  };
  
  // Account status
  email_verified?: boolean;
  phone_verified?: boolean;
  is_premium?: boolean;
  is_creator?: boolean;
  is_admin?: boolean;
  
  // User preferences
  preferences?: {
    theme: 'dark' | 'light';
    language: string;
    timezone: string;
    email_notifications: boolean;
    push_notifications: boolean;
    content_filter: 'none' | 'mild' | 'strict';
    autoplay_videos: boolean;
    show_nsfw: boolean;
  };
  
  // Social stats
  stats?: {
    memes_created: number;
    memes_liked: number;
    followers_count: number;
    following_count: number;
    total_views: number;
    total_likes_received: number;
    join_date: string;
    last_active: string;
  };
  
  // Timestamps
  created_at?: string;
  updated_at?: string;
  last_sign_in_at?: string;
}

// Authentication state (persistent)
export const isAuthenticated = persistentAtom<boolean>(
  'user-authenticated', 
  false,
  {
    encode: (value) => String(value),
    decode: (value) => value === 'true',
  }
);
export const isLoading = atom<boolean>(false);
export const authError = atom<string | null>(null);

// User session (persistent)
export const userSession = persistentAtom<Session | null>(
  'user-session', 
  null,
  {
    encode: JSON.stringify,
    decode: (value) => value ? JSON.parse(value) : null,
  }
);

// Enhanced user profile with all data (persistent)
export const userProfile = persistentAtom<UserProfile | null>(
  'user-profile',
  null,
  {
    encode: JSON.stringify,
    decode: (value) => value ? JSON.parse(value) : null,
  }
);

// User preferences (persistent)
export const userPreferences = persistentAtom<UserProfile['preferences']>(
  'user-preferences',
  {
    theme: 'dark',
    language: 'en',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    email_notifications: true,
    push_notifications: false,
    content_filter: 'mild',
    autoplay_videos: true,
    show_nsfw: false,
  },
  {
    encode: JSON.stringify,
    decode: (value) => value ? JSON.parse(value) : undefined,
  }
);

// User activity state
export const userActivity = atom<{
  liked_memes: Set<string>;
  viewed_memes: Set<string>;
  shared_memes: Set<string>;
  recently_viewed: string[];
  bookmarked_memes: Set<string>;
}>({
  liked_memes: new Set(),
  viewed_memes: new Set(),
  shared_memes: new Set(),
  recently_viewed: [],
  bookmarked_memes: new Set(),
});

// User creation/upload state
export const userCreations = atom<{
  drafts: any[];
  uploaded_memes: string[];
  upload_history: any[];
}>({
  drafts: [],
  uploaded_memes: [],
  upload_history: [],
});

// Social connections
export const userConnections = atom<{
  followers: string[];
  following: string[];
  blocked_users: string[];
  muted_users: string[];
}>({
  followers: [],
  following: [],
  blocked_users: [],
  muted_users: [],
});

// User actions and utilities
export const userActions = {
  // Authentication actions
  setAuth: (session: Session | null, profile?: Partial<UserProfile>) => {
    isAuthenticated.set(!!session);
    userSession.set(session);
    
    if (session?.user && profile) {
      const enhancedProfile: UserProfile = {
        id: session.user.id,
        uuid: session.user.id,
        email: session.user.email!,
        username: session.user.user_metadata?.username || profile.username,
        avatar_url: session.user.user_metadata?.avatar_url || profile.avatar_url,
        full_name: session.user.user_metadata?.full_name || profile.full_name,
        display_name: profile.display_name || session.user.user_metadata?.username || profile.username,
        bio: profile.bio,
        website: profile.website,
        location: profile.location,
        user_metadata: session.user.user_metadata,
        app_metadata: session.user.app_metadata,
        email_verified: session.user.email_confirmed_at ? true : false,
        phone_verified: session.user.phone_confirmed_at ? true : false,
        is_premium: profile.is_premium || false,
        is_creator: profile.is_creator || false,
        is_admin: profile.is_admin || false,
        created_at: session.user.created_at,
        updated_at: session.user.updated_at,
        last_sign_in_at: session.user.last_sign_in_at,
        preferences: {
          theme: profile.preferences && profile.preferences.theme !== undefined ? profile.preferences.theme : (userPreferences.get()?.theme ?? 'dark'),
          language: profile.preferences && profile.preferences.language !== undefined ? profile.preferences.language : (userPreferences.get()?.language ?? 'en'),
          timezone: profile.preferences && profile.preferences.timezone !== undefined ? profile.preferences.timezone : (userPreferences.get()?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone),
          email_notifications: profile.preferences && profile.preferences.email_notifications !== undefined ? profile.preferences.email_notifications : (userPreferences.get()?.email_notifications ?? true),
          push_notifications: profile.preferences && profile.preferences.push_notifications !== undefined ? profile.preferences.push_notifications : (userPreferences.get()?.push_notifications ?? false),
          content_filter: profile.preferences && profile.preferences.content_filter !== undefined ? profile.preferences.content_filter : (userPreferences.get()?.content_filter ?? 'mild'),
          autoplay_videos: profile.preferences && profile.preferences.autoplay_videos !== undefined ? profile.preferences.autoplay_videos : (userPreferences.get()?.autoplay_videos ?? true),
          show_nsfw: profile.preferences && profile.preferences.show_nsfw !== undefined ? profile.preferences.show_nsfw : (userPreferences.get()?.show_nsfw ?? false),
        },
        stats: profile.stats || {
          memes_created: 0,
          memes_liked: 0,
          followers_count: 0,
          following_count: 0,
          total_views: 0,
          total_likes_received: 0,
          join_date: session.user.created_at,
          last_active: new Date().toISOString(),
        },
      };
      
      userProfile.set(enhancedProfile);
    }
  },

  logout: () => {
    isAuthenticated.set(false);
    userSession.set(null);
    userProfile.set(null);
    authError.set(null);
    // Reset activity but keep preferences
    userActivity.set({
      liked_memes: new Set(),
      viewed_memes: new Set(),
      shared_memes: new Set(),
      recently_viewed: [],
      bookmarked_memes: new Set(),
    });
  },

  setLoading: (loading: boolean) => {
    isLoading.set(loading);
  },

  setError: (error: string | null) => {
    authError.set(error);
  },

  // Profile update actions
  updateProfile: (updates: Partial<UserProfile>) => {
    const current = userProfile.get();
    if (current) {
      userProfile.set({
        ...current,
        ...updates,
        updated_at: new Date().toISOString(),
      });
    }
  },

  updatePreferences: (newPreferences: Partial<UserProfile['preferences']>) => {
    const current = userPreferences.get();
    const updated = { ...current, ...newPreferences };
    // Ensure all required fields are present and not undefined
    const safePreferences = {
      theme: updated.theme ?? 'dark',
      language: updated.language ?? 'en',
      timezone: updated.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
      email_notifications: updated.email_notifications ?? true,
      push_notifications: updated.push_notifications ?? false,
      content_filter: updated.content_filter ?? 'mild',
      autoplay_videos: updated.autoplay_videos ?? true,
      show_nsfw: updated.show_nsfw ?? false,
    };
    userPreferences.set(safePreferences);

    // Also update in main profile
    const profile = userProfile.get();
    if (profile) {
      userProfile.set({
        ...profile,
        preferences: safePreferences,
        updated_at: new Date().toISOString(),
      });
    }
  },

  updateStats: (statUpdates: Partial<UserProfile['stats']>) => {
    const current = userProfile.get();
    if (current?.stats) {
      userProfile.set({
        ...current,
        stats: {
          ...current.stats,
          ...statUpdates,
          last_active: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      });
    }
  },

  // Activity tracking actions
  likeMeme: (memeId: string) => {
    const current = userActivity.get();
    const newLiked = new Set(current.liked_memes);
    newLiked.add(memeId);
    
    userActivity.set({
      ...current,
      liked_memes: newLiked,
    });

    // Update stats
    const profile = userProfile.get();
    if (profile?.stats) {
      userActions.updateStats({
        memes_liked: profile.stats.memes_liked + 1,
      });
    }
  },

  unlikeMeme: (memeId: string) => {
    const current = userActivity.get();
    const newLiked = new Set(current.liked_memes);
    newLiked.delete(memeId);
    
    userActivity.set({
      ...current,
      liked_memes: newLiked,
    });

    // Update stats
    const profile = userProfile.get();
    if (profile?.stats) {
      userActions.updateStats({
        memes_liked: Math.max(0, profile.stats.memes_liked - 1),
      });
    }
  },

  viewMeme: (memeId: string) => {
    const current = userActivity.get();
    const newViewed = new Set(current.viewed_memes);
    newViewed.add(memeId);
    
    // Add to recently viewed (keep only last 50)
    const newRecentlyViewed = [memeId, ...current.recently_viewed.filter(id => id !== memeId)].slice(0, 50);
    
    userActivity.set({
      ...current,
      viewed_memes: newViewed,
      recently_viewed: newRecentlyViewed,
    });
  },

  bookmarkMeme: (memeId: string) => {
    const current = userActivity.get();
    const newBookmarked = new Set(current.bookmarked_memes);
    
    if (newBookmarked.has(memeId)) {
      newBookmarked.delete(memeId);
    } else {
      newBookmarked.add(memeId);
    }
    
    userActivity.set({
      ...current,
      bookmarked_memes: newBookmarked,
    });
  },

  shareMeme: (memeId: string) => {
    const current = userActivity.get();
    const newShared = new Set(current.shared_memes);
    newShared.add(memeId);
    
    userActivity.set({
      ...current,
      shared_memes: newShared,
    });
  },

  // Social actions
  followUser: (userId: string) => {
    const current = userConnections.get();
    const newFollowing = [...current.following];
    if (!newFollowing.includes(userId)) {
      newFollowing.push(userId);
      userConnections.set({
        ...current,
        following: newFollowing,
      });

      // Update stats
      const profile = userProfile.get();
      if (profile?.stats) {
        userActions.updateStats({
          following_count: profile.stats.following_count + 1,
        });
      }
    }
  },

  unfollowUser: (userId: string) => {
    const current = userConnections.get();
    const newFollowing = current.following.filter(id => id !== userId);
    userConnections.set({
      ...current,
      following: newFollowing,
    });

    // Update stats
    const profile = userProfile.get();
    if (profile?.stats) {
      userActions.updateStats({
        following_count: Math.max(0, profile.stats.following_count - 1),
      });
    }
  },

  blockUser: (userId: string) => {
    const current = userConnections.get();
    const newBlocked = [...current.blocked_users];
    if (!newBlocked.includes(userId)) {
      newBlocked.push(userId);
      // Remove from following if blocked
      const newFollowing = current.following.filter(id => id !== userId);
      userConnections.set({
        ...current,
        blocked_users: newBlocked,
        following: newFollowing,
      });
    }
  },

  unblockUser: (userId: string) => {
    const current = userConnections.get();
    const newBlocked = current.blocked_users.filter(id => id !== userId);
    userConnections.set({
      ...current,
      blocked_users: newBlocked,
    });
  },

  // Utility functions
  isLiked: (memeId: string): boolean => {
    return userActivity.get().liked_memes.has(memeId);
  },

  isBookmarked: (memeId: string): boolean => {
    return userActivity.get().bookmarked_memes.has(memeId);
  },

  isFollowing: (userId: string): boolean => {
    return userConnections.get().following.includes(userId);
  },

  isBlocked: (userId: string): boolean => {
    return userConnections.get().blocked_users.includes(userId);
  },

  getDisplayName: (): string => {
    const profile = userProfile.get();
    return profile?.display_name || 
           profile?.username || 
           profile?.full_name || 
           profile?.email?.split('@')[0] || 
           'Anonymous User';
  },

  getAvatarUrl: (): string => {
    const profile = userProfile.get();
    return profile?.avatar_url || 
           `https://api.dicebear.com/7.x/avataaars/svg?seed=${profile?.email || 'default'}`;
  },

  // Reset all user data (for debugging/testing)
  resetUserData: () => {
    userActions.logout();
    userPreferences.set({
      theme: 'dark',
      language: 'en',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      email_notifications: true,
      push_notifications: false,
      content_filter: 'mild',
      autoplay_videos: true,
      show_nsfw: false,
    });
    userCreations.set({
      drafts: [],
      uploaded_memes: [],
      upload_history: [],
    });
    userConnections.set({
      followers: [],
      following: [],
      blocked_users: [],
      muted_users: [],
    });
  },
};

// Authentication initialization
export const initAuth = async () => {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseAnonKey) {
      console.warn('Supabase configuration missing');
      return;
    }
    
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    
    // Check if we already have a persisted session
    const persistedSession = userSession.get();
    const persistedAuth = isAuthenticated.get();
    
    // If we have persisted auth state, validate it with Supabase
    if (persistedAuth && persistedSession) {
      try {
        // Set the session in Supabase to validate it
        const { data, error } = await supabase.auth.setSession(persistedSession);
        
        if (error || !data.session) {
          // Session is invalid, clear persisted state
          console.log('Persisted session invalid, clearing state');
          userActions.logout();
        } else {
          // Session is still valid, update with fresh data
          console.log('Persisted session valid, updating profile');
          userActions.setAuth(data.session, {
            id: data.session.user.id,
            email: data.session.user.email!,
            username: data.session.user.user_metadata?.username || data.session.user.user_metadata?.user_name || data.session.user.user_metadata?.name,
            avatar_url: data.session.user.user_metadata?.avatar_url,
            full_name: data.session.user.user_metadata?.full_name,
          });
        }
      } catch (sessionError) {
        console.log('Error validating persisted session:', sessionError);
        userActions.logout();
      }
    } else {
      // No persisted session, check for fresh session
      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (error) {
        console.error('Error getting session:', error);
        return;
      }
      
      if (session?.user) {
        // Fresh session found, update state
        userActions.setAuth(session, {
          id: session.user.id,
          email: session.user.email!,
          username: session.user.user_metadata?.username || session.user.user_metadata?.user_name || session.user.user_metadata?.name,
          avatar_url: session.user.user_metadata?.avatar_url,
          full_name: session.user.user_metadata?.full_name,
        });
      }
    }
    
    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('Auth state change:', event, session?.user?.email);
      
      if (event === 'SIGNED_IN' && session?.user) {
        userActions.setAuth(session, {
          id: session.user.id,
          email: session.user.email!,
          username: session.user.user_metadata?.username || session.user.user_metadata?.user_name || session.user.user_metadata?.name,
          avatar_url: session.user.user_metadata?.avatar_url,
          full_name: session.user.user_metadata?.full_name,
        });
      } else if (event === 'SIGNED_OUT') {
        userActions.logout();
      }
    });
    
    // Store subscription for cleanup if needed
    return subscription;
  } catch (error) {
    console.error('Auth initialization failed:', error);
  }
};

// Auto-initialize auth when the module loads (in browser environment)
if (typeof window !== 'undefined') {
  initAuth();
}

// Computed values (derived stores)
export const userDisplayName = atom<string>('');
export const userAvatarUrl = atom<string>('');

// Update computed values when profile changes
userProfile.subscribe((profile) => {
  userDisplayName.set(userActions.getDisplayName());
  userAvatarUrl.set(userActions.getAvatarUrl());
});
