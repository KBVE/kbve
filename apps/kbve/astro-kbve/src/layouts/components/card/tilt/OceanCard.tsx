/** @jsxImportSource react */
'use client';

import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useRef } from 'react'

function ShaderRing() {
  const materialRef = useRef<THREE.ShaderMaterial>(null!)

  useFrame((state) => {
    if (materialRef.current) {
      materialRef.current.uniforms.time.value = state.clock.getElapsedTime()
    }
  })

  const uniforms = {
    time: { value: 0 },
    fireColorBase: { value: new THREE.Color('#06b6d4') }, // cyan-400
    fireColorHot: { value: new THREE.Color('#a855f7') },  // purple-500
    fireColorCool: { value: new THREE.Color('#22d3ee') }, // cyan-300
  }

const vertexShader = `
  uniform float time;
  varying vec2 vUv;
  varying vec3 vPosition;

  float noise(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
  }

  void main() {
    vUv = uv;
    vPosition = position;

    vec3 newPosition = position;
    float distortionAmount = 0.02;
    float distortion = noise(vec2(position.x * 0.05 + time * 0.1, position.y * 0.05 - time * 0.15)) * distortionAmount;

    vec2 normalizedPos = normalize(position.xy);
    newPosition.x += normalizedPos.x * distortion;
    newPosition.y += normalizedPos.y * distortion;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
  }
`

const fragmentShader = `
  uniform float time;
  uniform vec3 fireColorBase;
  uniform vec3 fireColorHot;
  uniform vec3 fireColorCool;
  varying vec2 vUv;
  varying vec3 vPosition;

  float random(vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
  }

  float noise(vec2 st) {
    vec2 i = floor(st);
    vec2 f = fract(st);

    float a = random(i);
    float b = random(i + vec2(1.0, 0.0));
    float c = random(i + vec2(0.0, 1.0));
    float d = random(i + vec2(1.0, 1.0));

    vec2 u = f * f * (3.0 - 2.0 * f);

    return mix(a, b, u.x) +
           (c - a) * u.y * (1.0 - u.x) +
           (d - b) * u.x * u.y;
  }

  float fbm(vec2 st) {
    float value = 0.0;
    float amplitude = 0.5;
    float frequency = 0.0;

    for (int i = 0; i < 5; i++) {
      value += amplitude * noise(st);
      st *= 2.0;
      amplitude *= 0.5;
    }
    return value;
  }

  void main() {
    vec2 st = vUv * 3.0 - vec2(1.5);
    st.x += sin(time * 0.2 + st.y * 1.5) * 0.1;
    st.y += cos(time * 0.15 + st.x * 1.5) * 0.1;

    float wave = fbm(st + time * 0.05);
    float intensity = smoothstep(0.3, 0.9, wave);

    vec3 deepBlue = vec3(0.0, 0.2, 0.4);
    vec3 cyanGlow = fireColorBase;
    vec3 aquaPulse = fireColorCool;
    vec3 violetFoam = fireColorHot;

    vec3 color = mix(deepBlue, cyanGlow, intensity);
    color = mix(color, aquaPulse, pow(intensity, 1.5));
    color = mix(color, violetFoam, pow(intensity, 3.0));

    float alpha = intensity;
    gl_FragColor = vec4(color, alpha);
  }
`

  return (
    <mesh>
      <ringGeometry args={[1.2, 1.5, 64]} />
      <shaderMaterial
        ref={materialRef}
        uniforms={uniforms}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        transparent
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        depthTest={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}

export default function OceanCard() {
  return (
    <div className="relative flex justify-center items-center min-h-screen bg-gradient-to-b from-cyan-900 via-purple-950 to-[#0c0a09] overflow-hidden">
      <Canvas
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-0 pointer-events-none"
        orthographic
        camera={{ zoom: 100, position: [0, 0, 10] }}
      >
        <ShaderRing />
      </Canvas>

      <div className="group perspective-[1000px]">
        <div className="transition-transform duration-300 transform-style-3d group-hover:rotate-x-2 group-hover:rotate-y-2 bg-cyan-900/60 backdrop-blur-lg rounded-[28px] p-6 text-zinc-100 w-[360px] max-w-[90%] shadow-[0_12px_35px_rgba(0,0,0,0.55)] border border-cyan-400/20">
          <h2 className="text-xl font-bold text-white mb-2">Ocean Tier Access</h2>
          <p className="text-5xl font-extrabold text-white mb-1">
            <span className="text-3xl align-super text-cyan-400">$</span>29
            <span className="text-base text-cyan-200">/cycle</span>
          </p>
          <p className="text-sm text-cyan-100 mb-5">
            Immerse yourself in the Ocean Tier. Flow with serene access and deep-blue level features.
          </p>

          <ul className="space-y-3 mb-6 text-sm text-cyan-200">
            {[
              'Hydro-Elastic Storage',
              'Tidal Support System',
              'Abyssal Stream (4K)',
              'Aqua Analytics Flow',
              'Liquid Preview Modes',
            ].map((text, idx) => (
              <li key={idx} className="flex items-center">
                <svg
                  className="w-5 h-5 mr-3 animate-spin"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <circle
                    cx="12"
                    cy="12"
                    r="8"
                    stroke="#67e8f9" // cyan-300
                    strokeWidth="2"
                    strokeDasharray="10 5"
                  />
                </svg>
                {text}
              </li>
            ))}
          </ul>

          <button className="w-full py-3 rounded-xl border border-cyan-300/30 bg-cyan-500/20 text-white font-semibold uppercase tracking-wide text-sm shadow-md transition hover:bg-cyan-400/30 hover:scale-[1.02] active:scale-[0.98]">
            Dive into Ocean
          </button>
        </div>
      </div>
    </div>
  )
}
