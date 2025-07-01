import React, { useEffect, useRef, useState } from 'react';
import { HeartHandshake, SwatchBook, BookMarked, PenTool } from 'lucide-react';

interface Feature {
  title: string;
  desc: string;
  Icon: React.ComponentType<{ className?: string }>;
}

const features: Feature[] = [
  {
    title: "Dedicated Teams",
    desc: "Benefit from our committed teams who ensure your gaming or tech project's success is personal. Count on expert guidance and exceptional results throughout your development journey.",
    Icon: HeartHandshake,
  },
  {
    title: "Simplicity and Affordability", 
    desc: "Discover easy-to-use, affordable solutions with KBVE's array of software and gaming tools. Our products streamline user experience and keep development costs within budget.",
    Icon: SwatchBook,
  },
  {
    title: "Comprehensive Documentation",
    desc: "Integrate with ease using KBVE's exhaustive guides and libraries. Achieve seamless adoption of our technologies with our full suite of documentation designed to empower your success.",
    Icon: BookMarked,
  },
  {
    title: "User-Centric Design",
    desc: "Experience the difference with KBVE's user-focused design — where functionality meets creativity for an enhanced digital experience.",
    Icon: PenTool,
  },
];

interface AnimatedCircleProps {
  cx: number;
  cy: number;
  rotation: number;
  strokeColor: string;
  strokeDasharray: string;
  duration: string;
  delay: string;
  isVisible: boolean;
}

const AnimatedCircle: React.FC<AnimatedCircleProps> = ({
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
  const animationRef = useRef<number | undefined>();

  useEffect(() => {
    if (!isVisible) {
      setRadius(0);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      return;
    }

    const startTime = Date.now() - parseFloat(delay) * 1000;
    const durationMs = parseFloat(duration) * 1000;

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = (elapsed % durationMs) / durationMs;
      const currentRadius = progress * 60;
      
      setRadius(currentRadius);
      
      if (isVisible) {
        animationRef.current = requestAnimationFrame(animate);
      }
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isVisible, delay, duration]);

  return (
    <g transform={`rotate(${rotation} 50 50)`}>
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
};

const ReactQuadPanel: React.FC = () => {
  const containerRef = useRef<HTMLElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting);
      },
      {
        threshold: 0.1,
        rootMargin: '50px',
      }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => {
      if (containerRef.current) {
        observer.unobserve(containerRef.current);
      }
    };
  }, []);

  return (
    <section ref={containerRef} className="relative px-6 py-12 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-7xl relative rounded-3xl bg-white/5 backdrop-blur-md ring-1 ring-white/10 shadow-[inset_0_0_0.5px_rgba(255,255,255,0.15),inset_0_1px_0_rgba(255,255,255,0.08),0_20px_40px_rgba(0,0,0,0.4)] hover:shadow-[inset_0_0_1px_rgba(255,255,255,0.2),inset_0_2px_1px_rgba(255,255,255,0.1),0_30px_60px_rgba(0,0,0,0.5)] transition-all duration-300 overflow-hidden ring-offset-1 ring-offset-white/5 p-10 sm:p-12">
        
        {/* Inner Glow Border */}
        <div className="absolute inset-[14px] rounded-[1.375rem] pointer-events-none z-10 border border-[rgba(34,211,238,0.1)] shadow-[inset_0.5px_0.5px_1.5px_rgba(186,230,253,0.6),inset_-1px_-1px_1px_rgba(21,94,117,0.5),inset_3px_3px_6px_rgba(0,0,0,0.25)] translate-z-[30px] transform-style-3d" />

        {/* Animated SVG Background */}
        <svg 
          viewBox="0 0 100 100" 
          className="absolute inset-0 mx-auto my-auto w-full max-w-sm opacity-30 z-0 pointer-events-none" 
          aria-hidden="true"
        >
          <AnimatedCircle
            cx={50}
            cy={50}
            rotation={0}
            strokeColor="#22d3ee"
            strokeDasharray="3 7 5 3"
            duration="20"
            delay="0"
            isVisible={isVisible}
          />
          <AnimatedCircle
            cx={50}
            cy={50}
            rotation={45}
            strokeColor="#67e8f9"
            strokeDasharray="2 6 8 4"
            duration="22"
            delay="-4"
            isVisible={isVisible}
          />
          <AnimatedCircle
            cx={50}
            cy={50}
            rotation={90}
            strokeColor="#a5f3fc"
            strokeDasharray="6 4 3 9"
            duration="24"
            delay="-6"
            isVisible={isVisible}
          />
          <AnimatedCircle
            cx={50}
            cy={50}
            rotation={135}
            strokeColor="#bae6fd"
            strokeDasharray="4 6 2 8"
            duration="26"
            delay="-8"
            isVisible={isVisible}
          />
        </svg>

        {/* Features Grid */}
        <div className="relative grid grid-cols-1 sm:grid-cols-2 gap-10 md:gap-12 z-20">
          {features.map(({ title, desc, Icon }) => (
            <div key={title} className="flex gap-x-5 items-start">
              <Icon className="mt-1 h-9 w-9 flex-shrink-0 fill-cyan-400 dark:fill-cyan-300 stroke-current" />
              <div className="grow">
                <h3 className="text-lg font-bold text-white">{title}</h3>
                <p className="mt-1 text-sm text-zinc-300 leading-relaxed">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default ReactQuadPanel;
