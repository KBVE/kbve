# DashboardNeoGlassPanel Component

A sophisticated, animated glass-morphism panel component built with Astro and React for dynamic content presentation.

## Features

- 🎨 **Glass-morphism Design**: Beautiful translucent effects with backdrop blur
- 🎭 **Dynamic Text Rotation**: Automatically cycles through different content sets
- ✨ **Particle System**: Floating animated particles for visual appeal
- 🌟 **Enhanced Glow Effects**: Dynamic lighting and shadow effects
- 🧲 **Magnetic Interactions**: Mouse-following hover effects
- 📱 **Responsive Design**: Works seamlessly across all device sizes
- ⚡ **Performance Optimized**: Smooth 60fps animations with GPU acceleration
- 🎯 **Accessibility**: Respects `prefers-reduced-motion` settings
- 🔧 **Highly Customizable**: Extensive configuration options

## File Structure

```
neoglasspanel/
├── DashboardNeoGlassPanel.astro    # Main Astro component
├── NeoGlassPanelAnimations.tsx     # React animation controller
├── types.ts                        # TypeScript definitions
├── utils.ts                        # Animation utilities
├── examples.astro                  # Usage examples
└── README.md                       # This file
```

## Basic Usage

```astro
---
import DashboardNeoGlassPanel from './path/to/DashboardNeoGlassPanel.astro';
---

<DashboardNeoGlassPanel />
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `title` | `string` | `'Tech & Gaming Excellence with KBVE'` | Main headline text |
| `subtitle` | `string` | `'Flow with serene access...'` | Subtitle text |
| `description` | `string` | `'Whether you're diving into...'` | Description paragraph |
| `badge` | `string` | `'Memes'` | Badge label |
| `buttonText` | `string` | `'Dive In'` | Call-to-action button text |
| `buttonHref` | `string` | `'#'` | Button destination URL |
| `enableAnimations` | `boolean` | `true` | Enable/disable animations |
| `animationConfig` | `Partial<AnimationConfig>` | `{}` | Custom animation configuration |

## Animation Configuration

The `animationConfig` prop accepts an object with the following structure:

```typescript
interface AnimationConfig {
  textRotation: {
    titles: string[];        // Array of titles to cycle through
    subtitles: string[];     // Array of subtitles to cycle through
    descriptions: string[];  // Array of descriptions to cycle through
    badges: string[];        // Array of badge labels to cycle through
    interval: number;        // Time between rotations (ms)
  };
  particles: {
    count: number;          // Number of particles to generate
    colors: string[];       // Array of particle colors
  };
  glowEffect: {
    intensity: number;      // Glow intensity (0-1)
    color: string;          // Glow color (hex/rgb)
  };
}
```

## Examples

### Gaming Theme

```astro
<DashboardNeoGlassPanel 
  title="Elite Gaming Hub"
  subtitle="Where champions are made"
  badge="Gaming"
  animationConfig={{
    textRotation: {
      titles: ['Elite Gaming', 'Rank Up', 'Master Games'],
      subtitles: ['Join skilled players', 'Climb the ranks', 'Dominate'],
      descriptions: ['Gaming community...', 'Pro strategies...', 'Tournament ready...'],
      badges: ['Gaming', 'Esports', 'Pro'],
      interval: 4000
    },
    particles: {
      count: 8,
      colors: ['#00ff88', '#ff0080', '#0088ff']
    },
    glowEffect: {
      intensity: 0.6,
      color: '#00ff88'
    }
  }}
/>
```

### Minimal Theme

```astro
<DashboardNeoGlassPanel 
  title="Clean Design"
  enableAnimations={true}
  animationConfig={{
    textRotation: {
      interval: 8000
    },
    particles: {
      count: 3,
      colors: ['#6b7280', '#9ca3af']
    },
    glowEffect: {
      intensity: 0.2,
      color: '#6b7280'
    }
  }}
/>
```

### Disable Animations

```astro
<DashboardNeoGlassPanel 
  title="Static Panel"
  enableAnimations={false}
/>
```

## Data Attributes

The component uses data attributes to target elements for animations:

- `data-neoglass-panel`: Main panel container
- `data-neoglass-title`: Title text element
- `data-neoglass-subtitle`: Subtitle text element
- `data-neoglass-description`: Description text element
- `data-neoglass-badge`: Badge text element
- `data-neoglass-glow`: Glow effect container
- `data-neoglass-particles`: Particle container
- `data-neoglass-bg`: Background element
- `data-neoglass-decor`: Decorative SVG element
- `data-neoglass-magnetic`: Magnetic effect element

## Animation Features

### Text Rotation
- Smooth fade transitions between text content
- Configurable timing intervals
- Synchronized updates across all text elements

### Particle System
- Dynamically generated floating particles
- Customizable colors, count, and behavior
- GPU-accelerated animations

### Glow Effects
- Dynamic intensity pulsing
- CSS custom property integration
- Smooth color transitions

### Magnetic Hover
- Mouse-following effect on hover
- Subtle parallax movement
- Smooth return to center on mouse leave

### Parallax Scrolling
- Background image parallax effect
- Decorative element rotation
- Scroll-based transformations

## Performance Considerations

- Uses `requestAnimationFrame` for smooth animations
- Implements throttling and debouncing for scroll events
- Respects `prefers-reduced-motion` accessibility setting
- GPU-accelerated transforms with `will-change` optimization
- Cleanup functions prevent memory leaks

## Browser Support

- Modern browsers with CSS backdrop-filter support
- Graceful degradation for older browsers
- Mobile-friendly touch interactions

## Accessibility

- Respects `prefers-reduced-motion` user preference
- Keyboard accessible button element
- Proper semantic HTML structure
- Screen reader friendly content

## Development

### Adding New Animation Types

1. Extend the `AnimationConfig` interface in `types.ts`
2. Add the animation logic to `NeoGlassPanelAnimations.tsx`
3. Create utility functions in `utils.ts` if needed
4. Update documentation and examples

### Customizing Styles

The component uses Tailwind CSS classes. To customize:

1. Modify classes in `DashboardNeoGlassPanel.astro`
2. Add custom CSS variables for dynamic properties
3. Update the animation utilities as needed

## Troubleshooting

### Animations Not Working
- Ensure `enableAnimations={true}` is set
- Check that React client-side hydration is working
- Verify data attributes are present in the DOM

### Performance Issues
- Reduce particle count in configuration
- Increase animation intervals
- Check for memory leaks in cleanup functions

### Styling Issues
- Verify Tailwind CSS is properly configured
- Check for CSS conflicts with backdrop-filter
- Ensure proper z-index stacking

## Contributing

1. Follow the existing code style
2. Add TypeScript types for new features
3. Include accessibility considerations
4. Update documentation and examples
5. Test across different browsers and devices
