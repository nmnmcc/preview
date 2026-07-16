import type { PreviewViewport } from "./preview";

const makeViewport = (width: number, height: number): PreviewViewport =>
  Object.freeze({ width, height });

const makeGroup = <const Presets extends Record<string, PreviewViewport>>(
  presets: Presets,
): Readonly<Presets> => Object.freeze(presets);

export const Tailwind = makeGroup({
  base: makeViewport(390, 844),
  sm: makeViewport(640, 960),
  md: makeViewport(768, 1024),
  lg: makeViewport(1024, 768),
  xl: makeViewport(1280, 720),
  "2xl": makeViewport(1536, 864),
});

export const Bootstrap = makeGroup({
  xs: makeViewport(390, 844),
  sm: makeViewport(576, 864),
  md: makeViewport(768, 1024),
  lg: makeViewport(992, 744),
  xl: makeViewport(1200, 800),
  xxl: makeViewport(1400, 900),
});

export const Mui = makeGroup({
  xs: makeViewport(390, 844),
  sm: makeViewport(600, 900),
  md: makeViewport(900, 1200),
  lg: makeViewport(1200, 800),
  xl: makeViewport(1536, 864),
});

export const Antd = makeGroup({
  xs: makeViewport(390, 844),
  sm: makeViewport(576, 864),
  md: makeViewport(768, 1024),
  lg: makeViewport(992, 744),
  xl: makeViewport(1200, 800),
  xxl: makeViewport(1600, 900),
  xxxl: makeViewport(1920, 1080),
});

export const Storybook = makeGroup({
  mobile1: makeViewport(320, 568),
  mobile2: makeViewport(414, 896),
  tablet: makeViewport(834, 1112),
  desktop: makeViewport(1280, 1024),
});
