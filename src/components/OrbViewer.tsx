import { useRef, useMemo, useEffect, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

// ── GLSL: Liquid Chrome vertex with advanced breathing ────────
const VS = /* glsl */`
  uniform float uTime;
  uniform float uBreath;
  uniform float uDistort;
  uniform float uTension;
  uniform int uState;
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  varying vec2 vUv;
  varying float vPressure;

  float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x*p.y*p.z*(p.x+p.y+p.z));
  }
  float noise(vec3 p) {
    vec3 i = floor(p); vec3 f = fract(p);
    f = f*f*(3.0-2.0*f);
    return mix(
      mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
      mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z
    );
  }

  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    vec3 pos = position;
    
    // Multi-frequency breathing: primary (slow deep), secondary (mid-tone), tertiary (micro-ripple)
    float breathePrimary = sin(uTime * 0.42) * 0.036;        // slow, deep (1.5s period)
    float breatheSecondary = sin(uTime * 0.95) * 0.018;      // medium (1.2s period) 
    float breatheTertiary = sin(uTime * 2.1) * 0.008;        // fast, micro (0.8s period)
    float breathe = (breathePrimary + breatheSecondary + breatheTertiary) * uBreath;
    
    // Internal liquid movement: multi-octave swirling
    float n1 = noise(pos * 2.2 + uTime * 0.18) * 0.07;
    float n2 = noise(pos * 4.4 - uTime * 0.31) * 0.035;      // counter-rotating octave
    float n3 = noise(pos * 1.1 + uTime * 0.08) * 0.012;      // deep liquid drift
    float n = (n1 + n2 + n3) * uDistort;
    
    // Pressure deformation: polar bulging/compression
    float theta = atan(pos.y, length(pos.xz));
    float pressureWave = sin(uTime * 0.55 + theta * 3.0) * 0.015;
    
    // State-driven tension buildup
    float tension = uTension;
    if (uState == 2) tension *= 1.3;  // listening: tightens
    if (uState == 4) tension *= 2.0;  // generating: maximal buildup
    
    pos += normal * (breathe + n + pressureWave * tension);
    
    // Capture pressure for fragment shader
    vPressure = breathePrimary * 0.5 + breatheSecondary * 0.3;
    vWorldPos = (modelMatrix * vec4(pos,1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos,1.0);
  }
`;

// ── GLSL: Liquid Chrome fragment with state & tier awareness + viscosity ──
const FS = /* glsl */`
  uniform float uTime;
  uniform float uBreath;
  uniform float uIntensity;
  uniform float uGlowPulse;
  uniform vec3 uCamPos;
  uniform int uState;      // 0=dormant, 1=idle, 2=listening, 3=thinking, 4=generating, 5=owner
  uniform int uTier;       // 0=free, 1=beta, 2=alpha, 3=owner
  uniform float uTension;
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  varying float vPressure;

  void main() {
    vec3 N = normalize(vNormal);
    vec3 V = normalize(uCamPos - vWorldPos);

    // Fresnel rim with pressure-driven edge bloom
    float fr = pow(1.0 - max(dot(N,V), 0.0), 2.8);
    float edgeBloom = smoothstep(1.0, 0.0, fr) * fr * vPressure * 0.4;

    // Rotating light sources for chrome band (3 independent rotations for viscous flow)
    float t = uTime * 0.18;
    float t2 = uTime * 0.12;  // slower secondary rotation
    float t3 = uTime * 0.25;  // faster tertiary rotation
    
    vec3 L1 = normalize(vec3(sin(t)*1.6, 1.4+cos(t*0.4)*0.3, cos(t)));
    vec3 L2 = normalize(vec3(-0.8 + sin(t2)*0.3, 0.6 + cos(t2)*0.2, 0.5));
    vec3 L3 = normalize(vec3(0.4 + cos(t3)*0.25, -0.5 + sin(t3)*0.15, 0.8));

    float s1 = pow(max(dot(reflect(-L1,N),V),0.0), 130.0);
    float s2 = pow(max(dot(reflect(-L2,N),V),0.0), 55.0);
    float s3 = pow(max(dot(reflect(-L3,N),V),0.0), 30.0);
    float d1 = max(dot(N,L1),0.0);

    // State-based rim color + environmental shimmer
    vec3 rimBase = vec3(0.18, 0.52, 1.00);  // default cyan
    float rimIntensity = 1.0;
    float specularBoost = 1.0;
    float viscosityShift = 0.0;
    
    if (uState == 0) { // dormant: muted, deep
      rimBase = vec3(0.10, 0.25, 0.65);
      rimIntensity = 0.6;
      specularBoost = 0.5;
    } else if (uState == 1) { // idle: calm settling
      rimBase = vec3(0.18, 0.52, 1.00);
      rimIntensity = 0.85;
      specularBoost = 0.95;
    } else if (uState == 2) { // listening: tightening, instability
      rimBase = vec3(0.35, 0.68, 1.00);
      rimIntensity = 1.2;
      specularBoost = 1.35;
      viscosityShift = 0.12;  // highlight micro-ripples
    } else if (uState == 3) { // thinking: internal currents amplify
      rimBase = vec3(0.15, 0.40, 0.90);
      rimIntensity = 0.95;
      specularBoost = 1.2;
      s1 *= 1.2; s2 *= 1.3; s3 *= 1.05;
      viscosityShift = 0.08;
    } else if (uState == 4) { // generating: full bloom, energy release
      rimBase = vec3(0.45, 0.80, 1.00);
      rimIntensity = 1.6;
      specularBoost = 2.0;
      s1 *= 1.8; s2 *= 1.6; s3 *= 1.3;
      viscosityShift = 0.20;  // maximum internal movement visibility
    } else if (uState == 5) { // owner_mode: refined, premium power
      rimBase = vec3(0.50, 0.85, 1.00);
      rimIntensity = 1.4;
      specularBoost = 2.2;
      s1 *= 2.0; s2 *= 1.9; s3 *= 1.4;
      viscosityShift = 0.15;
    }

    // Tier-based intensity boost
    float tierBoost = 0.7; // free
    if (uTier == 1) tierBoost = 0.85;  // beta
    if (uTier == 2) tierBoost = 1.0;   // alpha
    if (uTier == 3) tierBoost = 1.15;  // owner

    // Chrome palette with state-driven depth
    vec3 dark   = mix(vec3(0.008, 0.012, 0.028), vec3(0.02, 0.015, 0.035), viscosityShift);
    vec3 mid    = mix(vec3(0.04,  0.07,  0.18), vec3(0.06, 0.10, 0.24), viscosityShift);
    vec3 hi     = vec3(0.82,  0.90,  1.00);
    vec3 rim    = rimBase;
    vec3 warm   = vec3(0.95,  0.97,  1.00);

    // Base surface blending
    vec3 col = mix(dark, mid, d1 * (0.65 + viscosityShift * 0.35));
    col += hi   * s1 * 2.2 * tierBoost * specularBoost;
    col += warm * s2 * 0.85 * tierBoost * (0.8 + viscosityShift * 0.4);
    col += mid  * s3 * 0.4 * (0.7 + viscosityShift * 0.3);
    col += rim  * fr * 1.3 * tierBoost * rimIntensity;
    
    // Edge bloom from pressure
    col += rim * edgeBloom * 1.8 * tierBoost;

    // Breathing glow with state + tension
    float pulse = sin(uTime * 1.15) * 0.5 + 0.5;
    float microPulse = sin(uTime * 2.8) * 0.3 + 0.7;  // rapid micro-glow for listening/generating
    float glowIntensity = 0.12 * uBreath * uGlowPulse;
    
    if (uState == 2) glowIntensity *= 1.8 * microPulse;      // listening: micro-ripple glow
    if (uState == 3) glowIntensity *= 1.4;                  // thinking: steady buildup
    if (uState == 4) glowIntensity *= 2.3 * microPulse;      // generating: pulsing bloom
    if (uState == 5) glowIntensity *= 2.0;                  // owner: refined shimmer
    
    col += rim * glowIntensity * pulse * tierBoost;
    
    // Tension-driven internal highlight
    float tensionGlow = uTension * 0.3 * sin(uTime * 1.8);
    col += mix(vec3(0.0), rimBase * 0.6, tensionGlow) * glowIntensity * 0.5;

    gl_FragColor = vec4(col * uIntensity, 1.0);
  }
`;

// ── Ripple pool shader with micro-ripple response ─────────────
const POOL_VS = `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
`;
const POOL_FS = `
  uniform float uTime;
  uniform int uState;
  varying vec2 vUv;
  void main() {
    vec2 uv = vUv - 0.5;
    float d = length(uv * vec2(1.0, 0.5));
    
    // Multi-frequency ripples for viscous response
    float r1 = sin(d * 28.0 - uTime * 2.2) * 0.5 + 0.5;
    float r2 = sin(d * 22.0 - uTime * 1.7 + 1.5) * 0.5 + 0.5;
    
    // State-responsive micro-ripples (tight during listening/generating)
    float microFreq = 18.0 + float(uState == 2) * 8.0 + float(uState == 4) * 12.0;  // increases during listening/generating
    float r3 = sin(d * microFreq - uTime * 3.5) * 0.3 + 0.7;
    
    float ring = r1 * r2 * r3;
    
    // State-driven fade behavior: sharper ripples when active
    float fadeIn = smoothstep(0.48, 0.0, d);
    float fadeOut = smoothstep(0.015, 0.07, d);
    float fade = fadeIn * fadeOut;
    
    // State-responsive color intensity
    float intensity = 0.45;
    if (uState == 2) intensity = 0.65;  // listening sharpens ripples
    if (uState == 4) intensity = 0.80;  // generating amplifies
    
    vec3 col = vec3(0.08, 0.3, 0.9) * ring * intensity;
    gl_FragColor = vec4(col, ring * fade * (0.35 + float(uState == 2) * 0.15 + float(uState == 4) * 0.25));
  }
`;

interface ChromeOrbProps {
  breath?: number;
  distort?: number;
  intensity?: number;
  glowPulse?: number;
  state?: 'dormant' | 'idle' | 'listening' | 'thinking' | 'generating' | 'owner_mode';
  tier?: 'free' | 'beta' | 'alpha' | 'owner';
}

function ChromeOrb({ breath = 1, distort = 1, intensity = 1, glowPulse = 1, state = 'idle', tier = 'free' }: ChromeOrbProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const poolRef = useRef<THREE.ShaderMaterial>(null);
  const { camera } = useThree();
  const stateIndex = ['dormant', 'idle', 'listening', 'thinking', 'generating', 'owner_mode'].indexOf(state);
  
  // Tension buildup: peaks during listening/generating, settles during idle
  const [tension, setTension] = useState(0);
  
  const orbMat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: VS,
    fragmentShader: FS,
    uniforms: {
      uTime: { value: 0 },
      uBreath: { value: breath },
      uDistort: { value: distort },
      uIntensity: { value: intensity },
      uGlowPulse: { value: glowPulse },
      uCamPos: { value: new THREE.Vector3() },
      uState: { value: stateIndex },
      uTier: { value: ['free', 'beta', 'alpha', 'owner'].indexOf(tier) },
      uTension: { value: 0 },
    },
  }), [state, tier]);

  const poolMat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: POOL_VS,
    fragmentShader: POOL_FS,
    uniforms: { 
      uTime: { value: 0 },
      uState: { value: stateIndex },
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  }), [state]);

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    
    // Cinematic tension interpolation
    // Target: high during listening/generating, low during idle/dormant
    const targetTension = 
      stateIndex === 2 ? 1.8 :  // listening: maximum instability
      stateIndex === 3 ? 1.2 :  // thinking: building tension
      stateIndex === 4 ? 2.0 :  // generating: peak energy
      stateIndex === 5 ? 1.5 :  // owner: controlled power
      0.2;                      // idle/dormant: settled
    
    // Smooth inertia-based transition (not instant)
    setTension(prev => {
      const eased = prev + (targetTension - prev) * Math.min(delta * 2.2, 1);
      return eased;
    });
    
    if (matRef.current) {
      matRef.current.uniforms.uTime.value = t;
      matRef.current.uniforms.uBreath.value = breath;
      matRef.current.uniforms.uIntensity.value = intensity;
      matRef.current.uniforms.uGlowPulse.value = glowPulse;
      matRef.current.uniforms.uCamPos.value.copy(camera.position);
      matRef.current.uniforms.uState.value = stateIndex;
      matRef.current.uniforms.uTier.value = ['free', 'beta', 'alpha', 'owner'].indexOf(tier);
      matRef.current.uniforms.uTension.value = tension;
    }
    if (poolRef.current) {
      poolRef.current.uniforms.uTime.value = t;
      poolRef.current.uniforms.uState.value = stateIndex;
    }
    if (meshRef.current) {
      // Orbital rotation: slower during idle/dormant, faster during active states
      const rotationSpeed = 0.05 + tension * 0.08;
      meshRef.current.rotation.y += delta * rotationSpeed;
    }
  });

  // Mercury drip geometry: thin tapering cylinders
  const dripPositions = [-0.22, -0.05, 0.1, 0.28];

  return (
    <>
      {/* Main liquid chrome orb */}
      <mesh ref={meshRef}>
        <icosahedronGeometry args={[1.8, 160]} />
        <primitive ref={matRef} object={orbMat} attach="material" />
      </mesh>

      {/* Faint bottom drip stems */}
      {dripPositions.map((x, i) => (
        <mesh key={i} position={[x, -1.8 - (i === 1 ? 0.8 : 0.3 + i * 0.15), 0]}>
          <cylinderGeometry args={[0.012, 0.006, 0.5 + (i === 1 ? 0.9 : 0.3), 6]} />
          <meshStandardMaterial
            color="#8ab8ff"
            emissive="#3060ff"
            emissiveIntensity={0.6}
            transparent opacity={0.55}
          />
        </mesh>
      ))}

      {/* Reflective ripple pool */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2.65, 0]}>
        <planeGeometry args={[8, 8, 1, 1]} />
        <primitive ref={poolRef} object={poolMat} attach="material" />
      </mesh>

      {/* Pool point light */}
      <pointLight position={[0, -2.5, 0]} color="#2050ff" intensity={1.5} distance={3} />
    </>
  );
}

// ── CSS Fallback Chrome Orb ──────────────────────────────────
function CSSOrb({ size = 220 }: { size?: number }) {
  return (
    <div className="flex flex-col items-center">
      <div className="css-orb relative" style={{ width: size, height: size }}>
        <div className="drip-container" style={{ height: size * 0.6 }}>
          {[1, 2, 3, 4, 5].map(i => <div key={i} className="drip" />)}
        </div>
      </div>
      {/* Pool */}
      <div className="pool-glow" style={{ width: size * 1.4, height: size * 0.3, marginTop: -size * 0.08 }}>
        <div className="ripple-pool" style={{ width: size * 1.4, height: size * 0.3 }}>
          {[1, 2, 3].map(i => <div key={i} className="ripple-ring" style={{ width: 20, height: 20 }} />)}
        </div>
      </div>
    </div>
  );
}

// ── Main exported component ──────────────────────────────────
interface OrbProps {
  size?: number;
  breath?: number;
  distort?: number;
  intensity?: number;
  glowPulse?: number;
  state?: 'dormant' | 'idle' | 'listening' | 'thinking' | 'generating' | 'owner_mode';
  tier?: 'free' | 'beta' | 'alpha' | 'owner';
  className?: string;
}

export function OrbViewer({ 
  size = 220, 
  breath = 1, 
  distort = 1, 
  intensity = 1, 
  glowPulse = 1,
  state = 'idle',
  tier = 'free',
  className = "" 
}: OrbProps) {
  const [webglFailed, setWebglFailed] = useState(false);

  // Quick WebGL capability check
  useEffect(() => {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      if (!gl) setWebglFailed(true);
    } catch { setWebglFailed(true); }
  }, []);

  if (webglFailed) return <CSSOrb size={size} />;

  return (
    <div className={className} style={{ width: size, height: size * 1.45 }}>
      <Canvas
        camera={{ position: [0, 0.3, 5.5], fov: 38 }}
        gl={{ antialias: true, alpha: true }}
        style={{ background: 'transparent' }}
        onCreated={({ gl }) => {
          gl.setClearColor(0x000000, 0);
        }}
      >
        <ambientLight intensity={0.05} color="#1030ff" />
        <spotLight position={[3, 5, 4]} angle={0.4} penumbra={0.9} intensity={1.5} color="#a0c8ff" />
        <spotLight position={[-3, 2, -2]} angle={0.5} penumbra={1} intensity={0.8} color="#2040ff" />
        <ChromeOrb breath={breath} distort={distort} intensity={intensity} glowPulse={glowPulse} state={state} tier={tier} />
      </Canvas>
    </div>
  );
}
