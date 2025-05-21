/** @jsxImportSource react */
'use client';

import OceanCard from './OceanCard'


export default function OceanDeck() {
  return (
    <div className="relative z-0 w-full min-h-screen bg-stone-950 overflow-hidden">
      {/* Canvas background waves */}
      <div className="absolute inset-0 z-0">
        {/* Optional: BackgroundShaderCanvas here (animated waves or ripples) */}
      </div>

      {/* Cards container */}
      <div className="relative z-10 px-4 py-20 flex flex-col items-center gap-8 
                      sm:flex-row sm:flex-wrap sm:justify-center
                      lg:flex-nowrap lg:gap-12">
        <OceanCard />
        <OceanCard />
        <OceanCard />
      </div>
    </div>
  )
}