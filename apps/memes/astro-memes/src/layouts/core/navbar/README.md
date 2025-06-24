# NavigationBar Component for Meme.sh

A modern, responsive navigation bar component built with React, Nanostores, and Tailwind CSS for the Meme.sh website.

## Features

- 🎭 **Modern Design**: Beautiful gradient branding with dark emerald/green theme
- 📱 **Responsive**: Works perfectly on desktop and mobile devices
- 🔐 **Authentication**: GitHub OAuth integration with Supabase
- 🗂️ **State Management**: Uses React Nanostores for global state
- 🎨 **Smooth Animations**: Hover effects and transitions
- ♿ **Accessible**: Proper ARIA labels and keyboard navigation
- 🌙 **Dark Theme**: Consistent with zinc-950 background and emerald accents

## Components

### NavigationBar (`NavigationBar.tsx`)
The main React component that renders the navigation bar.

**Props:**
- `className?: string` - Optional CSS classes to apply

### Navigation Store (`navigationStore.ts`)
Manages global navigation state using Nanostores:

- `isMenuOpen` - Controls mobile menu visibility
- `isAuthenticated` - User authentication status
- `userProfile` - User profile data
- `theme` - Theme preference (persistent)
- `navigationActions` - Action functions for state management

### Astro Integration (`Nav.astro`)
Astro component that renders the React NavigationBar with client-side hydration.

## Navigation Items

The navigation includes the following sections:
- 🏠 Home (`/`)
- 😂 Memes (`/memes`)
- ✨ Create (`/create`)
- 🔥 Trending (`/trending`)
- ℹ️ About (`/about`)

## Authentication

- **Sign In**: GitHub OAuth through Supabase
- **Sign Out**: Clears session and redirects
- **Profile Display**: Shows user avatar and username/email
- **Callback Handler**: `/auth/callback` page handles OAuth responses

## Usage

### In an Astro Layout

```astro
---
import Layouts from './core/Layouts.astro';
---

<Layouts title="My Page" Nav={true}>
  <h1>Welcome to Meme.sh</h1>
  <!-- Your content -->
</Layouts>
```

### Direct React Usage

```tsx
import { NavigationBar } from './layouts/core/navbar/NavigationBar';

function App() {
  return (
    <div className="bg-zinc-950 min-h-screen">
      <NavigationBar />
      {/* Your content */}
    </div>
  );
}
```

## State Management

Access navigation state anywhere in your React components:

```tsx
import { useStore } from '@nanostores/react';
import { isMenuOpen, navigationActions } from './stores/navigationStore';

function MyComponent() {
  const menuOpen = useStore(isMenuOpen);
  
  const handleToggle = () => {
    navigationActions.toggleMenu();
  };
  
  return (
    <button onClick={handleToggle}>
      Menu is {menuOpen ? 'open' : 'closed'}
    </button>
  );
}
```

## Styling

The component uses Tailwind CSS classes and includes:
- Dark theme with zinc-950/900 backgrounds
- Backdrop blur effect (`backdrop-blur-md`)
- Emerald/green gradient text and buttons
- Smooth transitions with emerald hover states
- Responsive breakpoints
- Custom glass-morphism effect

## Dependencies

- `@nanostores/react` - React hooks for Nanostores
- `@nanostores/persistent` - Persistent storage for theme
- `@supabase/supabase-js` - Authentication
- `clsx` & `tailwind-merge` - Conditional styling
- `react` - Component framework

## File Structure

```
src/layouts/core/
├── navbar/
│   ├── NavigationBar.tsx    # Main React component
│   └── Nav.astro           # Astro wrapper
├── stores/
│   └── navigationStore.ts  # Nanostores state management
├── supabaseClient.ts       # Supabase configuration
└── tw.ts                   # Tailwind utilities
```

## Customization

You can customize the navigation by:

1. **Adding new navigation items**: Modify the `navItems` array in `NavigationBar.tsx`
2. **Changing colors**: Update the Tailwind classes (emerald/green theme)
3. **Modifying authentication**: Update the `handleSignIn` and `handleSignOut` functions
4. **Adding new state**: Extend the `navigationStore.ts` with additional atoms

## Authentication Setup

Ensure your Supabase project is configured for GitHub OAuth:

1. Enable GitHub provider in Supabase Auth settings
2. Set up GitHub OAuth app with callback URL: `your-domain.com/auth/callback`
3. Add GitHub OAuth credentials to Supabase

The callback page at `/auth/callback` handles the OAuth flow automatically.
