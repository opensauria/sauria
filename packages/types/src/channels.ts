/**
 * Channel types — platform definition and channel interface shape.
 * The full Channel interface with ProactiveAlert dependency stays in the daemon.
 * This exports only the platform-agnostic types needed by both sides.
 */

export type { Platform } from './canvas.js';
