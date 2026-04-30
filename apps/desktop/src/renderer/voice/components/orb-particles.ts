import { PARTICLE_COUNT, LCG_SEED, LCG_MULTIPLIER, LCG_INCREMENT, BAND_COUNT } from '../constants.js';

export interface Particle {
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly phase: number;
  readonly band: number;
}

export function generateParticles(count: number = PARTICLE_COUNT): readonly Particle[] {
  let seed = LCG_SEED;

  function next(): number {
    seed = (seed * LCG_MULTIPLIER + LCG_INCREMENT) & 0xffff_ffff_ffff_ffffn;
    return Number(seed >> 33n) / (1 << 31);
  }

  const particles: Particle[] = [];
  for (let i = 0; i < count; i++) {
    const angle = next() * 2 * Math.PI;
    const r = Math.sqrt(next()) * 0.95;
    particles.push({
      x: r * Math.cos(angle),
      y: r * Math.sin(angle),
      size: 1.0 + next() * 2.5,
      phase: next() * Math.PI * 2,
      band: i % BAND_COUNT,
    });
  }
  return particles;
}
