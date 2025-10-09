import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';

interface AnimatedCircleProps {
  cx: number;
  cy: number;
  rotation: number;
  strokeColor: string;
  strokeDasharray: string;
  duration: number;
  delay: number;
  isVisible: boolean;
}

// Memoized AnimatedCircle component for better performance
const AnimatedCircle = React.memo<AnimatedCircleProps>(({
  cx,
  cy,
  rotation,
  strokeColor,
  strokeDasharray,
  duration,
  delay,
  isVisible,
}) => {
  const [radius, setRadius] = useState(0);
  const animationRef = useRef<number | undefined>(undefined);
  const startTimeRef = useRef<number | null>(null);

  // Memoize the animation function to prevent unnecessary recreations
  const animate = useCallback(() => {
    if (!isVisible) return;
    
    const now = performance.now();
    
    if (startTimeRef.current === null) {
      startTimeRef.current = now + delay * 1000;
    }
    
    const elapsed = now - startTimeRef.current;
    const progress = Math.max(0, (elapsed % (duration * 1000)) / (duration * 1000));
    const currentRadius = progress * 60;
    
    setRadius(currentRadius);
    
    if (isVisible) {
      animationRef.current = requestAnimationFrame(animate);
    }
  }, [isVisible, delay, duration]);

  useEffect(() => {
    if (!isVisible) {
      setRadius(0);
      startTimeRef.current = null;
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = undefined;
      }
      return;
    }

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = undefined;
      }
    };
  }, [isVisible, animate]);

  // Memoize the transform string to prevent unnecessary recalculations
  const transform = useMemo(() => `rotate(${rotation} 50 50)`, [rotation]);

  return (
    <g transform={transform}>
      <circle
        cx={cx}
        cy={cy}
        r={radius}
        stroke={strokeColor}
        strokeDasharray={strokeDasharray}
        fill="none"
        strokeWidth="0.5"
      />
    </g>
  );
});

AnimatedCircle.displayName = 'AnimatedCircle';

const ReactQuadPanel: React.FC = () => {
  const containerRef = useRef<SVGSVGElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  // Memoize observer options to prevent recreation
  const observerOptions = useMemo(() => ({
    threshold: 0.1,
    rootMargin: '50px',
  }), []);

  // Memoize the intersection callback
  const handleIntersection = useCallback(([entry]: IntersectionObserverEntry[]) => {
    setIsVisible(entry.isIntersecting);
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(handleIntersection, observerOptions);

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => {
      if (containerRef.current) {
        observer.unobserve(containerRef.current);
      }
    };
  }, [handleIntersection, observerOptions]);

  // Memoize circle configurations to prevent recreation on every render
  const circleConfigs = useMemo(() => [
    {
      cx: 50,
      cy: 50,
      rotation: 0,
      strokeColor: "#22d3ee",
      strokeDasharray: "3 7 5 3",
      duration: 20,
      delay: 0,
    },
    {
      cx: 50,
      cy: 50,
      rotation: 45,
      strokeColor: "#67e8f9",
      strokeDasharray: "2 6 8 4",
      duration: 22,
      delay: -4,
    },
    {
      cx: 50,
      cy: 50,
      rotation: 90,
      strokeColor: "#a5f3fc",
      strokeDasharray: "6 4 3 9",
      duration: 24,
      delay: -6,
    },
    {
      cx: 50,
      cy: 50,
      rotation: 135,
      strokeColor: "#bae6fd",
      strokeDasharray: "4 6 2 8",
      duration: 26,
      delay: -8,
    },
  ], []);

  return (
    <svg 
      ref={containerRef}
      viewBox="0 0 100 100" 
      className="absolute inset-0 mx-auto my-auto w-full max-w-sm opacity-30 z-0 pointer-events-none" 
      aria-hidden="true"
    >
      {circleConfigs.map((config, index) => (
        <AnimatedCircle
          key={index}
          {...config}
          isVisible={isVisible}
        />
      ))}
    </svg>
  );
};

export default ReactQuadPanel;
