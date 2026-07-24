import * as React from "react";

const MOBILE_BREAKPOINT = 768;

export type ViewportMode = "desktop" | "mobile";

export function useViewportMode() {
  const [viewportMode, setViewportMode] = React.useState<
    ViewportMode | undefined
  >(undefined);

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => {
      setViewportMode(
        window.innerWidth < MOBILE_BREAKPOINT ? "mobile" : "desktop",
      );
    };
    mql.addEventListener("change", onChange);
    onChange();
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return viewportMode;
}

export function useIsMobile() {
  return useViewportMode() === "mobile";
}
