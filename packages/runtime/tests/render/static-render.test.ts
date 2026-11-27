// Step 32: the static render's passes (what a TableOfContents relies on) and the title.
import { describe, expect, test } from "vitest";
import { noteServerLoad, requestServerRender, takeServerLoads } from "../../src/render/lazy";
import { inStaticRender, setStaticTitle, staticRenderInfo, staticTitle } from "../../src/render/static-render";

describe("static render passes", () => {
  test("outside a static render there is no info; inside, the pass and the path", () => {
    expect(staticRenderInfo()).toBeUndefined();
    const info = inStaticRender("/a", "app", () => staticRenderInfo());
    expect(info?.path).toBe("/a");
    expect(staticRenderInfo()).toBeUndefined();
  });

  test.each([
    ["the same app and path again", "/x", "A", "/x", "A", true],
    ["another path", "/x", "A", "/y", "A", false],
    ["another app (a new render, not the loop)", "/x", "A", "/x", "B", false],
  ])("previous is set for %s", (_, path1, app1, path2, app2, continues) => {
    const first = inStaticRender(path1, app1, () => staticRenderInfo()!);
    const second = inStaticRender(path2, app2, () => staticRenderInfo()!);
    expect(second.previous !== undefined).toBe(continues);
    if (continues) expect(second.previous!.pass).toBe(first.pass);
  });

  test("a pass that recorded a code load waited; requestServerRender is not one", () => {
    takeServerLoads();
    inStaticRender("/w", "W", () => requestServerRender());
    const afterRequest = inStaticRender("/w", "W", () => {
      noteServerLoad(Promise.resolve());
      return staticRenderInfo()!;
    });
    expect(afterRequest.previous?.waited).toBe(false);
    const afterLoad = inStaticRender("/w", "W", () => staticRenderInfo()!);
    expect(afterLoad.previous?.waited).toBe(true);
    expect(takeServerLoads()).toHaveLength(2);
  });

  test("the title a pass set; reset by the next pass; ignored outside one", () => {
    inStaticRender("/t", "T", () => setStaticTitle("Home | Shop"));
    expect(staticTitle()).toBe("Home | Shop");
    inStaticRender("/t", "T", () => {});
    expect(staticTitle()).toBeUndefined();
    setStaticTitle("ignored");
    expect(staticTitle()).toBeUndefined();
  });
});
