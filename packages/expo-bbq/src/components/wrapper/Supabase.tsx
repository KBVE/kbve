import { Platform, AppState } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'

let supabaseClient: ReturnType<typeof createClient> | null = null

// Conditionally apply the polyfill only in React Native/Expo
if (Platform.OS !== 'web') {
  require('react-native-url-polyfill/auto') // Polyfill for React Native
}

// Function to create the client based on platform
export const createSupabaseClient = (supabaseUrl: string, supabaseAnonKey: string) => {
  if (Platform.OS === 'web') {
    if (!supabaseClient) {
      supabaseClient = createClient(supabaseUrl, supabaseAnonKey)
    }
    return supabaseClient
  } else {
    // React Native / Expo version with AsyncStorage
    return createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  }
}

// Optional: Function to manage app state changes for React Native/Expo only
export const setupAppStateListener = (supabase: ReturnType<typeof createClient>) => {
  if (Platform.OS !== 'web') {
    AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        supabase.auth.startAutoRefresh()
      } else {
        supabase.auth.stopAutoRefresh()
      }
    })
  }
}
