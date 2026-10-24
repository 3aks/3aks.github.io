/**
 * 3aks.me — WebGL backgrounds powered by Paper Shaders
 * https://github.com/paper-design/shaders
 *
 * Usage: <div data-shader="mesh" data-colors="#000,#ff7a1a,..."></div>
 * The canvas fills the element. Falls back to the element's CSS background
 * when WebGL or the CDN is unavailable.
 */
import {
  ShaderMount,
  meshGradientFragmentShader,
  getShaderColorFromString,
  ShaderFitOptions
} from 'https://cdn.jsdelivr.net/npm/@paper-design/shaders@0.0.81/dist/index.js';

const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const isSmallScreen = window.matchMedia('(max-width: 720px)').matches;

function mountMesh(el) {
  const colors = (el.dataset.colors || '#000000,#1d4ed8,#ff7a1a,#0b1020').split(',');
  const speed = prefersReduced ? 0 : parseFloat(el.dataset.speed || '0.25');

  const uniforms = {
    u_colors: colors.map(getShaderColorFromString),
    u_colorsCount: colors.length,
    u_distortion: parseFloat(el.dataset.distortion || '0.8'),
    u_swirl: parseFloat(el.dataset.swirl || '0.35'),
    u_grainMixer: 0,
    u_grainOverlay: parseFloat(el.dataset.grain || '0.12'),
    u_fit: ShaderFitOptions.cover,
    u_rotation: 0,
    u_scale: 1,
    u_offsetX: 0,
    u_offsetY: 0,
    u_originX: 0.5,
    u_originY: 0.5,
    u_worldWidth: 0,
    u_worldHeight: 0
  };

  // Phones get a lower pixel budget: the gradient is soft, so it costs nothing visually
  const minPixelRatio = isSmallScreen ? 1 : 1.5;
  const maxPixelCount = isSmallScreen ? 1280 * 720 : 1920 * 1080 * 2;

  // Start part-way in so a paused (reduced motion) frame still looks composed
  const mount = new ShaderMount(el, meshGradientFragmentShader, uniforms, undefined, speed, 4000, minPixelRatio, maxPixelCount);
  el.classList.add('shader-ready');
  return mount;
}

document.querySelectorAll('[data-shader="mesh"]').forEach((el) => {
  try {
    mountMesh(el);
  } catch (err) {
    // WebGL unavailable: the CSS gradient on the element stays visible
    console.warn('Shader unavailable, using CSS fallback', err);
  }
});
