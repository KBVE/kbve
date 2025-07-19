export interface NeoGlassPanelProps {
  title?: string;
  subtitle?: string;
  description?: string;
  badge?: string;
  buttonText?: string;
  buttonHref?: string;
  enableAnimations?: boolean;
  animationConfig?: Partial<AnimationConfig>;
}

export interface AnimationConfig {
  textRotation: {
    titles: string[];
    subtitles: string[];
    descriptions: string[];
    badges: string[];
    interval: number;
  };
  particles: {
    count: number;
    colors: string[];
  };
  glowEffect: {
    intensity: number;
    color: string;
  };
}

export interface NeoGlassAnimationElements {
  panel: HTMLElement | null;
  title: HTMLElement | null;
  subtitle: HTMLElement | null;
  description: HTMLElement | null;
  badge: HTMLElement | null;
  glow: HTMLElement | null;
  particles: HTMLElement | null;
  background: HTMLElement | null;
  decoration: HTMLElement | null;
  magnetic: HTMLElement | null;
}

export type AnimationState = 'idle' | 'animating' | 'paused';

export interface ParticleConfig {
  size: number;
  color: string;
  opacity: number;
  duration: number;
  delay: number;
}

export interface GlowConfig {
  intensity: number;
  color: string;
  duration: number;
  pulseDuration: number;
}
