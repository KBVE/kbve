# Hero Components

This directory contains hero components for the BugWars website. Hero components are large, prominent sections typically used at the top of pages to capture attention and communicate key messages.

## Structure

The hero components are organized into two main types:

```
hero/
├── mainhero/          # Main, full-featured hero component
│   ├── AstroMainHero.astro
│   ├── ReactMainHero.tsx
│   ├── typeMainHero.ts
│   └── index.ts
├── subhero/           # Smaller, secondary hero component
│   ├── AstroSubHero.astro
│   ├── ReactSubHero.tsx
│   ├── typeSubHero.ts
│   └── index.ts
├── index.ts           # Main exports
└── README.md          # This file
```

## Components

### Main Hero (`mainhero`)

A full-featured, attention-grabbing hero component designed for landing pages and main sections.

**Features:**

- Full viewport height (customizable)
- Multiple background options (image, video, gradient, color)
- Parallax effect (optional)
- Primary and secondary CTA buttons
- Scroll indicator
- Customizable alignment and positioning
- Responsive design
- Accessibility features

**Usage:**

```astro
---
import AstroMainHero from '@/components/hero/mainhero/AstroMainHero.astro';
---

<AstroMainHero
	title="Welcome to BugWars"
	subtitle="Epic Bug Battles"
	description="Enter the arena and fight bugs in epic multiplayer battles"
	ctaText="Play Now"
	ctaUrl="/play"
	secondaryCtaText="Learn More"
	secondaryCtaUrl="/about"
	backgroundImage="/images/hero-bg.jpg"
	height="100vh"
	enableParallax={true}
	showScrollIndicator={true}
/>
```

**Props:**

- `title` (required): Main hero title
- `subtitle` (optional): Subtitle text
- `description` (optional): Description text
- `ctaText` (optional): Primary CTA button text
- `ctaUrl` (optional): Primary CTA button URL
- `secondaryCtaText` (optional): Secondary CTA button text
- `secondaryCtaUrl` (optional): Secondary CTA button URL
- `backgroundImage` (optional): Background image URL
- `backgroundVideo` (optional): Background video URL
- `backgroundGradient` (optional): CSS gradient string
- `backgroundColor` (optional): Background color (default: 'transparent')
- `textColor` (optional): Text color (default: 'white')
- `height` (optional): Hero height (default: '100vh')
- `className` (optional): Additional CSS classes
- `enableParallax` (optional): Enable parallax effect (default: false)
- `showScrollIndicator` (optional): Show scroll indicator (default: true)
- `overlayOpacity` (optional): Background overlay opacity 0-1 (default: 0.5)
- `alignment` (optional): Content alignment: 'left', 'center', 'right' (default: 'center')
- `verticalAlignment` (optional): Vertical alignment: 'top', 'center', 'bottom' (default: 'center')

### Sub Hero (`subhero`)

A smaller, more compact hero component designed for section headers and secondary pages.

**Features:**

- Customizable height (default: 50vh)
- Size variants (small, medium, large)
- Background options (image, gradient, color)
- Single CTA button
- Fade-in animation on scroll
- Decorative elements (optional)
- Responsive design
- Accessibility features

**Usage:**

```astro
---
import AstroSubHero from '@/components/hero/subhero/AstroSubHero.astro';
---

<AstroSubHero
	title="Our Features"
	subtitle="What We Offer"
	description="Discover the amazing features that make BugWars unique"
	ctaText="Explore"
	ctaUrl="/features"
	backgroundGradient="linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
	size="medium"
	alignment="center"
	showDecorative={true}
/>
```

**Props:**

- `title` (required): Hero title
- `subtitle` (optional): Subtitle text
- `description` (optional): Description text
- `ctaText` (optional): CTA button text
- `ctaUrl` (optional): CTA button URL
- `backgroundImage` (optional): Background image URL
- `backgroundGradient` (optional): CSS gradient string
- `backgroundColor` (optional): Background color (default: '#f8f9fa')
- `textColor` (optional): Text color (default: '#333')
- `height` (optional): Hero height (overrides size variant)
- `className` (optional): Additional CSS classes
- `showDecorative` (optional): Show decorative element (default: false)
- `overlayOpacity` (optional): Background overlay opacity 0-1 (default: 0.3)
- `alignment` (optional): Content alignment: 'left', 'center', 'right' (default: 'center')
- `size` (optional): Size variant: 'small', 'medium', 'large' (default: 'medium')
- `enableAnimation` (optional): Enable fade-in animation (default: true)

## React Components

Both hero components are also available as React components for use in React-based pages or components:

```tsx
import { ReactMainHero } from '@/components/hero/mainhero';
import { ReactSubHero } from '@/components/hero/subhero';

// Or import from the main index
import { ReactMainHero, ReactSubHero } from '@/components/hero';
```

## Hydration Strategies

Both Astro components support different hydration strategies:

- `load`: Hydrate immediately on page load (default for MainHero)
- `idle`: Hydrate when the browser is idle
- `visible`: Hydrate when the component enters the viewport (default for SubHero)

```astro
<AstroMainHero {...props} hydrationStrategy="idle" />
```

## Styling and Customization

### Custom Styles

You can add custom CSS classes to further customize the hero components:

```astro
<AstroMainHero className="my-custom-hero" {...props} />
```

```css
/* In your stylesheet */
.my-custom-hero {
	/* Your custom styles */
}
```

### Background Options

1. **Image Background:**

```astro
<AstroMainHero
	backgroundImage="/images/hero.jpg"
	overlayOpacity={0.6}
	{...props}
/>
```

2. **Video Background:**

```astro
<AstroMainHero
	backgroundVideo="/videos/hero.mp4"
	overlayOpacity={0.4}
	{...props}
/>
```

3. **Gradient Background:**

```astro
<AstroMainHero
	backgroundGradient="linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
	{...props}
/>
```

4. **Color Background:**

```astro
<AstroMainHero backgroundColor="#1a202c" {...props} />
```

## Accessibility

Both hero components include:

- Semantic HTML structure
- ARIA labels where appropriate
- Keyboard navigation support
- Reduced motion support for users with motion sensitivity
- High contrast mode support
- Screen reader friendly content

## Responsive Design

The hero components are fully responsive and adapt to different screen sizes:

- Mobile: Adjusted padding and font sizes, stacked CTA buttons
- Tablet: Medium sizing and spacing
- Desktop: Full features and optimal spacing

## Performance Considerations

- Images are lazy-loaded when possible
- Video backgrounds are optimized for autoplay
- Parallax effects use CSS transforms for better performance
- Animations respect user's motion preferences
- Client-side hydration is optimized based on component visibility

## Examples

### Landing Page Hero

```astro
<AstroMainHero
	title="BugWars Arena"
	subtitle="Battle Royale"
	description="Enter the ultimate bug battle arena. Fight, survive, and conquer!"
	ctaText="Start Playing"
	ctaUrl="/play"
	secondaryCtaText="Watch Trailer"
	secondaryCtaUrl="#trailer"
	backgroundVideo="/videos/arena.mp4"
	height="100vh"
	enableParallax={false}
	showScrollIndicator={true}
	alignment="center"
	verticalAlignment="center"
/>
```

### Features Section Hero

```astro
<AstroSubHero
	title="Powerful Features"
	subtitle="Built for Performance"
	description="Discover what makes our platform the best choice for bug battles"
	ctaText="View All Features"
	ctaUrl="/features"
	backgroundGradient="linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
	textColor="white"
	size="medium"
	alignment="center"
/>
```

### About Page Hero

```astro
<AstroSubHero
	title="About BugWars"
	subtitle="Our Story"
	description="Learn about our journey and mission"
	backgroundImage="/images/about-hero.jpg"
	size="large"
	alignment="left"
	overlayOpacity={0.5}
/>
```

## Future Enhancements

Potential additions to the hero component system:

- Additional hero variants (e.g., `minihero`, `splithero`)
- More animation options
- Built-in particle effects
- Carousel/slider support for multiple hero slides
- A/B testing capabilities
- Analytics integration

## Contributing

When adding new hero components or variants:

1. Follow the existing structure (subfolder with Astro, React, types, and index files)
2. Update this README with usage examples
3. Ensure accessibility compliance
4. Add responsive design support
5. Test across different browsers and devices
6. Document all props and features

## Related Components

- `@/components/realtime` - Real-time component system
- `@/components/providers` - Provider components (SupaProvider, etc.)

## Support

For questions or issues with hero components, please refer to:

- Project documentation
- Component source code and inline comments
- BugWars development team
