/** @jsxImportSource react */
import { useState, useRef, useEffect } from 'react';
import { stageDefinitions } from './utils/StageStore';
import type { Stage } from './utils/StageTypes';
import { ShapePaths } from './utils/StageTypes';
import { MapAnimator } from './utils/AnimatorFactory';

export function StageAccordion() {
  const [activeStage, setActiveStage] = useState<Stage | null>(null);

  const textRef = useRef<HTMLDivElement | null>(null);
  const bgRef = useRef<HTMLDivElement | null>(null);
  const pathRefs = useRef<SVGPathElement[]>([]);
  const animatorRef = useRef<MapAnimator | null>(null);

  useEffect(() => {
    animatorRef.current = new MapAnimator({
      shapeRefs: pathRefs.current,
      textEl: textRef.current ?? undefined,
      bgContainerEl: bgRef.current ?? undefined,
    });
  }, []);

  useEffect(() => {
    if (!activeStage || !animatorRef.current) return;
    animatorRef.current.animate(activeStage);
  }, [activeStage]);

  const handleExpand = (stage: Stage) => {
    pathRefs.current = [];
    setActiveStage(activeStage === stage ? null : stage);
  };

  return (
    <div className="divide-y divide-zinc-800 max-w-3xl mx-auto mt-10 relative">
      <div ref={bgRef} className="absolute inset-0 -z-10 pointer-events-none" />

      {(Object.keys(stageDefinitions) as Stage[]).map((stage) => {
        const data = stageDefinitions[stage];
        const isActive = activeStage === stage;
        const Path = ShapePaths[data.shape];

        return (
          <div
            key={stage}
            onClick={() => handleExpand(stage)}
            className={`overflow-hidden transition-all duration-500 bg-zinc-900 rounded-lg ${
              isActive ? 'max-h-[600px] py-6' : 'max-h-[80px] py-2 cursor-pointer hover:bg-zinc-800'
            }`}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4">
              <h2 className="text-lg sm:text-xl text-white font-semibold">{data.title}</h2>
              <span className="text-cyan-400 text-sm">
                {isActive ? 'Collapse' : 'Expand'}
              </span>
            </div>

            {/* Expanded content */}
            {isActive && (
              <div className="mt-4 px-4 space-y-4">
                {/* SVG Shape */}
                <svg className="w-full h-40" viewBox="0 0 1054.9 703.6" xmlns="http://www.w3.org/2000/svg">
                  <g>
                    <Path ref={(el) => el && pathRefs.current.push(el)} stroke="#06b6d4" fill="none" strokeWidth={5} />
                  </g>
                </svg>

                {/* Info block */}
                <div ref={textRef} className="space-y-2 text-zinc-300 text-sm sm:text-base">
                  <p>{data.subtitle}</p>

                  {data.features && (
                    <ul className="list-disc pl-5 space-y-1 text-cyan-200 text-sm">
                      {data.features.map((feat, i) => <li key={i}>{feat}</li>)}
                    </ul>
                  )}
                </div>

                {/* CTA */}
                <button
                  className="bg-cyan-500 hover:bg-cyan-400 text-white font-bold py-2 px-4 rounded"
                  onClick={(e) => {
                    e.stopPropagation();
                    console.log(`[CTA] Stage: ${stage}`);
                  }}
                >
                  {data.buttonText}
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
