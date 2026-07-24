/**
 * Defines and checks a layout inspection for one preview.
 */
export {
  contentFits,
  define,
  inside,
  minSize,
  noOverlap,
  notClipped,
  unobscured,
  viewport,
  visible,
} from "./internal/inspection";

export type {
  Box,
  Check,
  CheckResult,
  ContainerReference,
  DefineOptions,
  ElementReference,
  Evidence,
  Finding,
  Node,
  Rect,
  Target,
  ViewportReference,
} from "./internal/inspection";

/**
 * Checks an inspection definition at runtime.
 */
export { Definition } from "./internal/inspection";

/**
 * Checks generated inspection files at runtime.
 */
export {
  Capture,
  Checks,
  EvidenceImage,
  FindingFile,
  Manifest,
  Nodes,
} from "./internal/inspection";
