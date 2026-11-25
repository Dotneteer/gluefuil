import { originalPositionFor, type SourceMap } from "@patchfuil/compiler";
import { expect, test, type Locator, type Page } from "@playwright/test";

// The playground's scenarios do what their pages say (project "playground"):
// one test per scenario page. The smoke test (playground.spec.ts) opens every
// page; this one interacts and checks the results.

const open = async (page: Page, path: string) => {
  await page.goto(`/#${path}`);
  await expect(page.locator("#root[data-pfui-ready]")).toBeAttached();
};
const button = (page: Page, name: string | RegExp) => page.getByRole("button", { name, exact: typeof name === "string" });
// Exact for strings: the page also shows its source, which contains the same phrases.
const text = (page: Page, value: string | RegExp) => page.getByText(value, { exact: typeof value === "string" });
const style = (locator: Locator, property: string) => locator.evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), property);

test("Markup: entities, CDATA, whitespace, escaped braces", async ({ page }) => {
  await open(page, "/markup");
  await expect(text(page, "Entities: a < b && c > d, \"double\" and 'single' quotes")).toBeVisible();
  await expect(text(page, "Numeric references stay literal (as in XMLUI, only named entities decode): &#169;")).toBeVisible();
  await expect(text(page, "Non-breaking\u00a0\u00a0\u00a0spaces are kept.")).toBeVisible();
  await expect(text(page, "CDATA is literal: <b>{not an expression}</b> & no entities")).toBeVisible();
  await expect(text(page, "Whitespace runs in text collapse to one space.")).toBeVisible();
  await expect(text(page, "Escaped braces: {not interpolated}, and interpolated.")).toBeVisible();
  await expect(text(page, "Attribute values decode entities too: <tag>")).toBeVisible();
});

test("Expressions: operators, optional chaining, array methods, globals", async ({ page }) => {
  await open(page, "/expressions");
  await expect(text(page, /^Arithmetic: 1 \+ 2 \* 3 = 7; 7 % 3 = 1; \(1 \+ 2\) \* 3 = 9$/)).toBeVisible();
  await expect(text(page, "Template literal: Hello, Ada from London!")).toBeVisible();
  await expect(text(page, /user\.phone\.number is missing, no error/)).toBeVisible();
  await expect(text(page, /^Array methods: sorted 1, 2, 3; doubled 6, 2, 4; sum 6$/)).toBeVisible();
  await expect(text(page, /Math\.max = 3; Number\.isInteger\(2\) = true; new Date\(0\) = 1970-01-01T00:00:00\.000Z/)).toBeVisible();
  await expect(text(page, "typeof, in, instanceof: object, true, true")).toBeVisible();
});

test("Reactivity: the diamond invariant holds through batched writes", async ({ page }) => {
  await open(page, "/reactivity");
  await button(page, "a++ three times in one handler").click();
  await expect(text(page, "a = 4; b = 2a = 8; c = a + 1 = 5; d = b + c = 13")).toBeVisible();
  await expect(text(page, /invariant d = 3a \+ 1: holds/)).toBeVisible();
});

test("Variables: follow until assigned, deep writes, array mutations", async ({ page }) => {
  await open(page, "/variables");
  await button(page, "source++").click();
  await expect(text(page, "source = 2, mirror = 20")).toBeVisible();
  await button(page, "Assign mirror = 0 (stops following)").click();
  await button(page, "source++").click();
  await expect(text(page, "source = 3, mirror = 0")).toBeVisible();
  await button(page, "Move to Paris").click();
  await expect(text(page, "Ada lives in Paris.")).toBeVisible();
  await button(page, "sort").click();
  await expect(text(page, "apple, banana, cherry")).toBeVisible();
  await button(page, "push").click();
  await expect(text(page, "apple, banana, cherry, item 4")).toBeVisible();
  await expect(text(page, "declared with a variable tag")).toBeVisible();
});

test("Async handlers: implicit await, the queue policy, a timeout", async ({ page }) => {
  await open(page, "/async");
  await button(page, "Save (1 s)").click();
  await expect(text(page, "Status: Saving…")).toBeVisible();
  await expect(text(page, /^Status: Saved at /)).toBeVisible({ timeout: 3000 });
  await button(page, "queue").click();
  await button(page, "queue").click();
  await expect(text(page, "q0 start · q0 end · q2 start · q2 end")).toBeVisible({ timeout: 4000 });
  await button(page, "A 3 s job with a 1 s timeout").click();
  await expect(text(page, "Timed job: started")).toBeVisible();
  await page.waitForTimeout(3300);
  await expect(text(page, "Timed job: started")).toBeVisible();
});

test("Component IDs: reading before the declaration, setValue, checkbox API", async ({ page }) => {
  await open(page, "/ids");
  await expect(text(page, 'Declared before the TextBox: "pfui" (4 characters)')).toBeVisible();
  await button(page, "Upper-case").click();
  await expect(text(page, 'Declared before the TextBox: "PFUI" (4 characters)')).toBeVisible();
  await button(page, "Toggle the checkbox from a handler").click();
  await expect(text(page, "flag.value = true")).toBeVisible();
});

test("Conditionals: when unmounts, lifecycle handlers run", async ({ page }) => {
  await open(page, "/conditionals");
  await expect(text(page, "Lifecycle log: mounted")).toBeVisible();
  await button(page, "Hide the panel").click();
  await expect(text(page, /^The panel/)).toHaveCount(0);
  await expect(text(page, "Lifecycle log: mounted, unmounted")).toBeVisible();
});

test("Items: context variables, reverse, and an id per row", async ({ page }) => {
  await open(page, "/templates");
  await expect(text(page, "#1 (first): Write tests")).toBeVisible();
  await expect(text(page, "#3 (last): Ship it")).toBeVisible();
  await page.getByPlaceholder("A note for this row").nth(1).fill("urgent");
  await expect(text(page, "note: urgent")).toHaveCount(1);
  await button(page, "Reverse").click();
  await expect(text(page, "#1 (first): Ship it")).toBeVisible();
  await expect(text(page, "Hello, Grace!")).toBeVisible();
});

test("User-defined components: props and events, methods, slots", async ({ page }) => {
  await open(page, "/user-components");
  await button(page, "★").or(button(page, "☆")).nth(4).click();
  await expect(text(page, "stars = 5")).toBeVisible();
  await button(page, "Click me").click();
  await expect(text(page, "Last event: changed to 1")).toBeVisible();
  await button(page, "Reset from outside (counter.reset())").click();
  await expect(text(page, "Last event: changed to 0")).toBeVisible();
  await button(page, "Like").click();
  await expect(text(page, "A custom header — 1 like(s), from the slot props")).toBeVisible();
  await page.getByPlaceholder("An id inside slot content").fill("slot id works");
  await expect(text(page, "Typed: slot id works")).toBeVisible();
  // The fallback of the default slot: the "custom header" card (header only) and the empty card.
  await expect(text(page, "(no content given)")).toHaveCount(2);
});

test("Live compiler: a working example renders and runs; the others show their diagnostics", async ({ page }) => {
  await open(page, "/live");
  await button(page, "Clicked 0 times").click();
  await expect(text(page, "count is 1")).toBeVisible();
  const statuses = page.getByRole("status");
  await expect(statuses.filter({ hasText: "error C002" })).toHaveCount(1);
  await expect(statuses.filter({ hasText: "error E020: 'Text' has no prop 'valu'. Did you mean 'value'?" })).toHaveCount(1);
  await expect(statuses.filter({ hasText: "error C015: 'box' (TextBox) has no member 'valeu'. Did you mean 'value'?" })).toHaveCount(1);
  await expect(statuses.filter({ hasText: "error E001: Unknown component 'Buton'. Did you mean 'Button'?" })).toHaveCount(1);
  // Editing recompiles: fix the C001 example.
  const editor = page.getByRole("textbox", { name: "Markup: Scoping: unknown names (C001) and read-only names (C012)" });
  await editor.fill('<Stack var.n="{1}"><Text>n is {n}</Text></Stack>');
  await expect(text(page, "n is 1")).toBeVisible();
});

test("Inputs: Select with an option template; a button enabled by the checkbox", async ({ page }) => {
  await open(page, "/inputs");
  await page.getByPlaceholder("Pick a fruit").click();
  await page.getByText("Banana (b)").click();
  await expect(text(page, "Fruit: b")).toBeVisible();
  await expect(button(page, "Only enabled when you agree")).toBeDisabled();
  await page.getByLabel("I agree").check();
  await expect(button(page, "Only enabled when you agree")).toBeEnabled();
});

test("Behaviors: tooltip, label, variant", async ({ page }) => {
  await open(page, "/behaviors");
  await button(page, "Hover me").hover();
  await expect(page.getByRole("tooltip")).toHaveText("A tooltip, from the tooltip behavior");
  await expect(page.getByLabel("A labeled input (click the label to focus)")).toBeVisible();
  const danger = await button(page, "variant=danger").evaluate((el) => getComputedStyle(el).backgroundColor);
  const fallback = await button(page, "variant=nothing (falls back)").evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(danger).not.toBe(fallback);
});

test("Routing: route and query parameters, replace, back to the scenario", async ({ page }) => {
  await open(page, "/routing");
  await button(page, "Item 42 with a query").click();
  await expect(text(page, "$routeParams.item = 42")).toBeVisible();
  await expect(text(page, '$queryParams = {"color":"green","size":"L"}')).toBeVisible();
  await button(page, "Next item (pushes history)").click();
  await expect(text(page, "$routeParams.item = 43")).toBeVisible();
  await page.goBack();
  await expect(text(page, "$routeParams.item = 42")).toBeVisible();
  await page.getByRole("link", { name: "A link with an encoded segment" }).isVisible();
  await button(page, "Back to the routing scenario").click();
  await page.getByRole("link", { name: "A link with an encoded segment" }).click();
  await expect(text(page, "$routeParams.item = hello world")).toBeVisible();
});

test("Routing: the unsaved-changes guard blocks buttons, links, the nav and back; the log shows the moves", async ({ page }) => {
  await open(page, "/routing");
  await button(page, "Item 1").click();
  await expect(text(page, "$routeParams.item = 1")).toBeVisible();
  await button(page, "Back to the routing scenario").click();
  await expect(page.getByText(/^Last navigations/)).toHaveText("Last navigations (App onDidNavigate): /routing ← /routing/1");

  await page.getByLabel("Unsaved changes: block every navigation").check();
  await button(page, "Item 1").click();
  await page.getByRole("link", { name: "A link with an encoded segment" }).click();
  await page.locator(".pfui-NavLink", { hasText: "Dashboard" }).first().click();
  await page.goBack();
  await page.waitForTimeout(200);
  await expect(page.getByRole("heading", { name: "Routing", exact: true })).toBeVisible();
  await expect(page).toHaveURL(/#\/routing$/);

  await page.getByLabel("Unsaved changes: block every navigation").uncheck();
  await button(page, "Item 1").click();
  await expect(text(page, "$routeParams.item = 1")).toBeVisible();
});

test("Counter: the texts follow the variable; a conditional text appears at five", async ({ page }) => {
  await open(page, "/counter");
  await expect(text(page, "Count: 0")).toBeVisible();
  for (let i = 0; i < 5; i++) await button(page, "Increment").click();
  await expect(text(page, "Count: 5")).toBeVisible();
  await expect(text(page, "Doubled: 10")).toBeVisible();
  await expect(page.locator("strong.pfui-Text", { hasText: "Five or more!" })).toBeVisible();
  await button(page, "Reset").click();
  await expect(text(page, "Count: 0")).toBeVisible();
  await expect(text(page, "Five or more!")).toHaveCount(0);
});

test("Text and headings: each variant renders its element; headings; maxLines clamps", async ({ page }) => {
  await open(page, "/text");
  const elements: [variant: string, tag: string][] = [
    ["strong", "strong"], ["em", "em"], ["code", "code"], ["keyboard", "kbd"], ["marked", "mark"], ["deleted", "del"],
    ["inserted", "ins"], ["sample", "samp"], ["var", "var"], ["abbr", "abbr"], ["cite", "cite"], ["small", "small"],
    ["sub", "sub"], ["sup", "sup"], ["paragraph", "p"], ["secondary", "span"], ["title", "span"], ["mono", "span"],
  ];
  for (const [variant, tag] of elements) {
    await expect(page.locator(`${tag}.pfui-Text[data-variant="${variant}"]`, { hasText: "The quick brown fox" }), variant).toBeVisible();
  }
  // Styled variants differ from plain text.
  const plain = page.locator('.pfui-Text[data-variant="mono"]').first();
  expect(await style(page.locator('code.pfui-Text[data-variant="code"]', { hasText: "The quick brown fox" }), "font-family")).toMatch(/mono|Menlo|Consolas/i);
  expect(await style(page.locator('strong.pfui-Text[data-variant="strong"]', { hasText: "The quick brown fox" }), "font-weight")).toBe("700");
  expect(await style(plain, "font-family")).toMatch(/mono|Menlo|Consolas/i);
  for (let level = 1; level <= 6; level++) {
    await expect(page.getByRole("heading", { level, name: `H${level} heading` })).toBeVisible();
  }
  await expect(page.getByRole("heading", { level: 3, name: "Heading level=3" })).toBeVisible();
  // Sizes decrease with the level.
  const h1 = parseFloat(await style(page.getByRole("heading", { level: 1, name: "H1 heading" }), "font-size"));
  const h6 = parseFloat(await style(page.getByRole("heading", { level: 6, name: "H6 heading" }), "font-size"));
  expect(h1).toBeGreaterThan(h6);
  // maxLines="2": the text is clipped to two lines.
  const clamped = page.locator(".pfui-Text", { hasText: 'maxLines="2"' });
  expect(await style(clamped, "-webkit-line-clamp")).toBe("2");
  // The same text without the clamp is taller: some of it is cut off.
  const heights = await clamped.evaluate((el) => {
    const clone = el.cloneNode(true) as HTMLElement;
    clone.removeAttribute("style");
    el.parentElement!.appendChild(clone);
    const full = clone.getBoundingClientRect().height;
    clone.remove();
    return { clamped: el.getBoundingClientRect().height, full };
  });
  expect(heights.full).toBeGreaterThan(heights.clamped);
});

test("Theming: the tone toggle, theme switching, a scoped Theme, a dark region, a variant", async ({ page }) => {
  await open(page, "/theming");
  const app = page.locator(".pfui-App");
  const plainButton = button(page, "Toggle tone");
  await expect(text(page, "Tone: light, theme: pfui")).toBeVisible();
  expect(await style(app, "background-color")).toBe("rgb(255, 255, 255)");
  expect(await style(plainButton, "background-color")).toBe("rgb(37, 99, 235)");
  // A scoped Theme: only its subtree.
  expect(await style(button(page, "A Button in a scoped Theme"), "background-color")).toBe("rgb(217, 119, 6)");
  // A variant defined by its enclosing Theme.
  expect(await style(button(page, "variant=danger"), "background-color")).not.toBe("rgb(37, 99, 235)");
  // The dark region differs from the light app; after the toggle, the app matches it.
  const darkText = await style(text(page, "This text is in a dark-tone region."), "color");
  expect(await style(app, "color")).not.toBe(darkText);
  await plainButton.click();
  await expect(text(page, "Tone: dark, theme: pfui")).toBeVisible();
  expect(await style(app, "background-color")).not.toBe("rgb(255, 255, 255)");
  expect(await style(app, "color")).toBe(darkText);
  // Themes change the primary color everywhere outside scoped overrides.
  await button(page, "Green theme").click();
  await expect(text(page, "Tone: dark, theme: pfui-green")).toBeVisible();
  expect(await style(plainButton, "background-color")).toBe("rgb(22, 163, 74)");
  await button(page, "Red theme").click();
  expect(await style(plainButton, "background-color")).toBe("rgb(220, 38, 38)");
  expect(await style(button(page, "A Button in a scoped Theme"), "background-color")).toBe("rgb(217, 119, 6)");
  await button(page, "Default theme").click();
  expect(await style(plainButton, "background-color")).toBe("rgb(37, 99, 235)");
});

test("Source maps: the handler's exception resolves to its line in SourceMapsScenario.pfui", async ({ page }) => {
  // Through the Chrome DevTools Protocol (as e2e/source-maps.spec.ts does for the hello app).
  const cdp = await page.context().newCDPSession(page);
  const scripts = new Map<string, { url: string; sourceMapURL: string }>();
  cdp.on("Debugger.scriptParsed", (event) => scripts.set(event.scriptId, { url: event.url, sourceMapURL: event.sourceMapURL ?? "" }));
  await cdp.send("Debugger.enable");
  await open(page, "/source-maps");
  await cdp.send("Debugger.setPauseOnExceptions", { state: "all" });
  const paused = new Promise<{ scriptId: string; lineNumber: number; columnNumber: number }>((resolve) => {
    cdp.on("Debugger.paused", (event) => {
      const description = String((event.data as { description?: string } | undefined)?.description ?? "");
      if ((event.reason === "exception" || event.reason === "promiseRejection") && description.includes("thrown in SourceMapsScenario.pfui")) {
        const location = event.callFrames[0]!.location;
        resolve({ scriptId: location.scriptId, lineNumber: location.lineNumber, columnNumber: location.columnNumber ?? 0 });
      } else {
        void cdp.send("Debugger.resume");
      }
    });
  });
  // Not awaited: the page is paused until we resume.
  void button(page, "Throw an error in a handler").click();
  const location = await paused;

  const script = scripts.get(location.scriptId)!;
  expect(script.url).toMatch(/\/src\/components\/SourceMapsScenario\.pfui(\?|$)/);
  const base64 = script.sourceMapURL.split("base64,")[1];
  expect(base64).toBeTruthy();
  const map = JSON.parse(Buffer.from(base64!, "base64").toString("utf8")) as SourceMap;
  const original = originalPositionFor(map, location.lineNumber, location.columnNumber);
  expect(original).toBeDefined();
  const markupLine = map.sourcesContent![0]!.split("\n")[original!.line]!;
  expect(markupLine.slice(original!.column)).toBe("throw new Error('thrown in SourceMapsScenario.pfui: ' + reason);");

  await cdp.send("Debugger.setPauseOnExceptions", { state: "none" });
  await cdp.send("Debugger.resume");
});

test("App shell: the preview frames each layout; the playground's own nav collapses", async ({ page }) => {
  // The frame is as wide as the content: at 1280px (minus the nav and the page gutter) it would be below lg, a drawer.
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, "/app-shell");
  const frame = page.frameLocator('iframe[title^="Layout:"]');
  // Each layout runs as its own page in the frame.
  await expect(page.locator("iframe")).toHaveAttribute("title", "Layout: condensed-sticky");
  await expect(frame.getByRole("heading", { name: "Home" })).toBeVisible();
  await expect(text(page, "layouts/condensed-sticky.pfui")).toBeVisible();
  await button(page, "vertical-sticky").click();
  await expect(page.locator("iframe")).toHaveAttribute("title", "Layout: vertical-sticky");
  await expect(frame.locator(".pfui-App")).toHaveAttribute("data-nav-full-height", "");
  await frame.getByRole("link", { name: "Orders" }).click();
  await expect(frame.getByRole("heading", { name: "Orders" })).toBeVisible();
  // At phone width the frame's nav is a drawer.
  await button(page, "Phone").click();
  await expect(frame.getByRole("navigation", { name: "Main" })).toBeHidden();
  await frame.getByRole("button", { name: "Open navigation" }).click();
  await expect(frame.getByRole("navigation", { name: "Main" })).toBeVisible();
  // The scenario's button drives this playground's own shell through setNavPanelCollapsed.
  const nav = page.getByRole("navigation", { name: "Main" });
  await button(page, "Collapse this playground's nav: false").click();
  await expect(page.locator("#root .pfui-App").first()).toHaveAttribute("data-nav-collapsed", "");
  expect((await nav.boundingBox())!.width).toBe(48);
  await page.getByRole("button", { name: "Expand navigation" }).click();
  await expect(button(page, "Collapse this playground's nav: false")).toBeVisible();
});

test("Layout and spacing: the demo in a frame, at desktop and phone width, with the inspector", async ({ page }) => {
  await open(page, "/layout");
  const frame = page.frameLocator('iframe[title="Layout: spacing"]');
  await expect(frame.getByRole("heading", { name: "Automatic spacing" })).toBeVisible();
  await expect(text(page, "layouts/spacing.pfui")).toBeVisible();
  // One demo: no layout choice, only the widths.
  await expect(page.getByRole("group", { name: "Layout" })).toBeHidden();
  const page0 = frame.locator(".pfui-AppContent > .pfui-Theme > .pfui-Stack");
  await expect(page0).toHaveAttribute("data-level", "0");
  await expect(page0).toHaveCSS("row-gap", "24px");
  await button(page, "Phone").click();
  await expect(page0).toHaveCSS("row-gap", "16px");
  // The inspector labels the stacks inside the frame; space-base rescales them.
  await frame.getByRole("button", { name: "Spacing inspector: off" }).click();
  await expect(page0).toHaveAttribute("data-inspect", "L0 v · gap 16px");
  await frame.getByRole("button", { name: "5px", exact: true }).click();
  await expect(page0).toHaveAttribute("data-inspect", "L0 v · gap 20px");
});

test("Data: the list from the mock backend; failures from the network panel; renaming", async ({ page }) => {
  await open(page, "/data");
  await expect(button(page, "Ada Lovelace")).toBeVisible();
  const log = page.getByText(/^GET \/api\/people/).first();
  // Rendered text only: the page's source listing contains the same words.
  const loadError = page.locator(".pfui-Text", { hasText: /Couldn't load people/ });
  // 503 twice, then fine: the page retries; the backend's log shows it.
  // Each panel button reports when the backend has its new setting; only then reload.
  await button(page, "503 twice, then fine").click();
  await expect(text(page, "Fault 1 added")).toBeVisible();
  await button(page, "Reload").click();
  await expect(page.getByText(/^GET \/api\/people\?q= → fault 503/)).toHaveCount(2);
  await expect(loadError).toBeHidden();
  await expect(log).toBeVisible();
  // Offline: the error, after three attempts; the list stays.
  await button(page, "Offline").click();
  await expect(text(page, "Fault 2 added")).toBeVisible();
  await button(page, "Reload").click();
  // (The text spans lines in the markup: a collapsed space at each end.)
  await expect(loadError).toHaveText(/Couldn't load people: .* \(network, 3 attempts, retryable: true\)/);
  await expect(button(page, "Ada Lovelace")).toBeVisible();
  await button(page, "Clear faults").click();
  await expect(text(page, "Faults cleared")).toBeVisible();
  await button(page, "Reload").click();
  await expect(loadError).toBeHidden();
  // Rename a field: the PUT, then the list and the details refetch.
  await button(page, "Emmy Noether").click();
  await expect(text(page, "Field: Mathematics")).toBeVisible();
  await page.getByPlaceholder("New field").fill("Algebra");
  await button(page, "Save").click();
  await expect(text(page, "Saved: Emmy Noether, Algebra")).toBeVisible();
  await expect(text(page, "Field: Algebra")).toBeVisible();
});

test("Forms: load, a server 422 on the inputs, save and refresh; unsaved changes block navigation", async ({ page }) => {
  await page.request.post("/__mock/reset").catch(() => undefined);
  await open(page, "/forms");
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Ada Lovelace");
  await page.getByLabel("City").fill("Atlantis");
  // Unsaved: leaving the page is blocked.
  await page.locator(".pfui-NavLink", { hasText: "Dashboard" }).first().click();
  await page.waitForTimeout(200);
  await expect(page.getByRole("heading", { name: "Forms", exact: true })).toBeVisible();
  await button(page, "Save").click();
  await expect(page.locator(".pfui-Field-messages .pfui-ValidationMessage")).toHaveText(["We don't deliver to Atlantis"]);
  await page.getByLabel("City").fill("Paris");
  await button(page, "Save").click();
  await expect(text(page, "Saved Ada Lovelace")).toBeVisible();
  await expect(text(page, "Ada Lovelace · ada@example.com · Paris")).toBeVisible();
  // Clean again: navigation works.
  await page.locator(".pfui-NavLink", { hasText: "Dashboard" }).first().click();
  await expect(page).toHaveURL(/#\/$/);
});
