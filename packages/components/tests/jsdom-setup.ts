// jsdom setup for tests that render Mantine components (step 16): jsdom has no
// matchMedia or ResizeObserver, which Mantine uses (as Mantine's testing guide
// recommends, minimal stubs). Also used by the standalone tests.

if (typeof window !== "undefined") {
  if (!window.matchMedia) {
    window.matchMedia = (query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList;
  }
  if (!("ResizeObserver" in window)) {
    (window as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  // Mantine's Combobox scrolls options into view.
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
}
