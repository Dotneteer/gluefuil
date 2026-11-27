// Step 32: the mock backend's worker script lets media and range requests go to the network.
import { expect, test } from "vitest";
import { MEDIA_BYPASS, workerScript } from "../src/mock";

test("the worker script registers the media bypass before MSW's own listener", () => {
  const script = workerScript();
  expect(script.startsWith(MEDIA_BYPASS)).toBe(true);
  const bypass = script.indexOf("stopImmediatePropagation");
  const msw = script.indexOf("addEventListener('fetch'");
  expect(bypass).toBeGreaterThan(0);
  expect(msw).toBeGreaterThan(bypass);
});

test.each([
  ["a video", { destination: "video", range: false }, true],
  ["audio", { destination: "audio", range: false }, true],
  ["a range request", { destination: "", range: true }, true],
  ["an API call", { destination: "", range: false }, false],
  ["an image", { destination: "image", range: false }, false],
])("%s skips MSW: %s", (_, request, skips) => {
  let listener: ((event: unknown) => void) | undefined;
  new Function("self", MEDIA_BYPASS)({ addEventListener: (_: string, l: (event: unknown) => void) => (listener = l) });
  let stopped = false;
  listener!({ request: { destination: request.destination, headers: { has: (name: string) => name === "range" && request.range } }, stopImmediatePropagation: () => (stopped = true) });
  expect(stopped).toBe(skips);
});
