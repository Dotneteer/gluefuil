import { originalPositionFor, type SourceMap } from "@gluefuil/compiler";
import { expect, test, type Locator, type Page } from "@playwright/test";

// The playground's scenarios do what their pages say (project "playground"):
// one test per scenario page. The smoke test (playground.spec.ts) opens every
// page; this one interacts and checks the results.

const open = async (page: Page, path: string) => {
  await page.goto(`/#${path}`);
  await expect(page.locator("#root[data-gfui-ready]")).toBeAttached();
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
  await expect(text(page, 'Declared before the TextBox: "gfui" (4 characters)')).toBeVisible();
  await button(page, "Upper-case").click();
  await expect(text(page, 'Declared before the TextBox: "GFUI" (4 characters)')).toBeVisible();
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
  await page.locator(".gfui-NavLink", { hasText: "Dashboard" }).first().click();
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
  await expect(page.locator("strong.gfui-Text", { hasText: "Five or more!" })).toBeVisible();
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
    await expect(page.locator(`${tag}.gfui-Text[data-variant="${variant}"]`, { hasText: "The quick brown fox" }), variant).toBeVisible();
  }
  // Styled variants differ from plain text.
  const plain = page.locator('.gfui-Text[data-variant="mono"]').first();
  expect(await style(page.locator('code.gfui-Text[data-variant="code"]', { hasText: "The quick brown fox" }), "font-family")).toMatch(/mono|Menlo|Consolas/i);
  expect(await style(page.locator('strong.gfui-Text[data-variant="strong"]', { hasText: "The quick brown fox" }), "font-weight")).toBe("700");
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
  const clamped = page.locator(".gfui-Text", { hasText: 'maxLines="2"' });
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
  const app = page.locator(".gfui-App");
  const plainButton = button(page, "Toggle tone");
  await expect(text(page, "Tone: light, theme: gfui")).toBeVisible();
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
  await expect(text(page, "Tone: dark, theme: gfui")).toBeVisible();
  expect(await style(app, "background-color")).not.toBe("rgb(255, 255, 255)");
  expect(await style(app, "color")).toBe(darkText);
  // Themes change the primary color everywhere outside scoped overrides.
  await button(page, "Green theme").click();
  await expect(text(page, "Tone: dark, theme: gfui-green")).toBeVisible();
  expect(await style(plainButton, "background-color")).toBe("rgb(22, 163, 74)");
  await button(page, "Red theme").click();
  expect(await style(plainButton, "background-color")).toBe("rgb(220, 38, 38)");
  expect(await style(button(page, "A Button in a scoped Theme"), "background-color")).toBe("rgb(217, 119, 6)");
  await button(page, "Default theme").click();
  expect(await style(plainButton, "background-color")).toBe("rgb(37, 99, 235)");
});

test("Source maps: the handler's exception resolves to its line in SourceMapsScenario.gui", async ({ page }) => {
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
      if ((event.reason === "exception" || event.reason === "promiseRejection") && description.includes("thrown in SourceMapsScenario.gui")) {
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
  expect(script.url).toMatch(/\/src\/components\/SourceMapsScenario\.gui(\?|$)/);
  const base64 = script.sourceMapURL.split("base64,")[1];
  expect(base64).toBeTruthy();
  const map = JSON.parse(Buffer.from(base64!, "base64").toString("utf8")) as SourceMap;
  const original = originalPositionFor(map, location.lineNumber, location.columnNumber);
  expect(original).toBeDefined();
  const markupLine = map.sourcesContent![0]!.split("\n")[original!.line]!;
  expect(markupLine.slice(original!.column)).toBe("throw new Error('thrown in SourceMapsScenario.gui: ' + reason);");

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
  await expect(text(page, "layouts/condensed-sticky.gui")).toBeVisible();
  await button(page, "vertical-sticky").click();
  await expect(page.locator("iframe")).toHaveAttribute("title", "Layout: vertical-sticky");
  await expect(frame.locator(".gfui-App")).toHaveAttribute("data-nav-full-height", "");
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
  await expect(page.locator("#root .gfui-App").first()).toHaveAttribute("data-nav-collapsed", "");
  expect((await nav.boundingBox())!.width).toBe(48);
  await page.getByRole("button", { name: "Expand navigation" }).click();
  await expect(button(page, "Collapse this playground's nav: false")).toBeVisible();
});

test("Layout and spacing: the demo in a frame, at desktop and phone width, with the inspector", async ({ page }) => {
  await open(page, "/layout");
  const frame = page.frameLocator('iframe[title="Layout: spacing"]');
  await expect(frame.getByRole("heading", { name: "Automatic spacing" })).toBeVisible();
  await expect(text(page, "layouts/spacing.gui")).toBeVisible();
  // One demo: no layout choice, only the widths.
  await expect(page.getByRole("group", { name: "Layout" })).toBeHidden();
  const page0 = frame.locator(".gfui-AppContent > .gfui-Theme > .gfui-Stack");
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
  const loadError = page.locator(".gfui-Text", { hasText: /Couldn't load people/ });
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
  await page.locator(".gfui-NavLink", { hasText: "Dashboard" }).first().click();
  await page.waitForTimeout(200);
  await expect(page.getByRole("heading", { name: "Forms", exact: true })).toBeVisible();
  await button(page, "Save").click();
  await expect(page.locator(".gfui-Field-messages .gfui-ValidationMessage")).toHaveText(["We don't deliver to Atlantis"]);
  await page.getByLabel("City").fill("Paris");
  await button(page, "Save").click();
  await expect(text(page, "Saved Ada Lovelace")).toBeVisible();
  await expect(text(page, "Ada Lovelace · ada@example.com · Paris")).toBeVisible();
  // Clean again: navigation works.
  await page.locator(".gfui-NavLink", { hasText: "Dashboard" }).first().click();
  await expect(page).toHaveURL(/#\/$/);
});

/** A theme variable's color as the browser computes it, from an element inside the app. */
const themeColor = (page: Page, variable: string) =>
  page.evaluate((name) => {
    const probe = document.createElement("div");
    probe.style.backgroundColor = `var(${name})`;
    document.querySelector(".gfui-AppContent")!.appendChild(probe);
    const color = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return color;
  }, variable);

test("Display: icons, a failed picture's initials, colors from the theme, the spinner's delay, cards, links, Markdown", async ({ page }) => {
  await open(page, "/display");

  // A clickable icon, by mouse and keyboard.
  const plus = page.locator('.gfui-Icon[data-icon-name="plus-circle"]');
  await plus.click();
  await plus.focus();
  await page.keyboard.press("Enter");
  await expect(text(page, "Icon clicked 2 times (click it, or Tab to it and press Enter).")).toBeVisible();
  await expect(page.locator('.gfui-Icon[data-icon-name="help"]')).toBeVisible();

  // The picture that fails to load shows its initials (the browser's error event).
  const avatars = page.locator(".gfui-Avatar");
  await expect(avatars.filter({ hasText: "AT" })).toBeVisible();
  await expect(page.getByLabel("Avatar of Landscape").locator('img[src="/sample-landscape.svg"]')).toBeVisible();

  // Badge colors follow the colorMap; the next status takes the next color.
  const badge = page.locator(".gfui-Badge").first();
  await expect(badge).toHaveText("active");
  expect(await style(badge, "background-color")).toBe(await themeColor(page, "--gfui-color-success-500"));
  await button(page, "Next status").click();
  await expect(badge).toHaveText("away");
  expect(await style(badge, "background-color")).toBe(await themeColor(page, "--gfui-color-warn-500"));

  // The progress bar takes the complete color at 100%.
  const section = page.locator(".gfui-ProgressBar .mantine-Progress-section");
  expect(await style(section, "background-color")).toBe(await themeColor(page, "--gfui-color-primary-500"));
  for (let i = 0; i < 7; i++) await button(page, "+10%").click();
  await expect(text(page, "100%")).toBeVisible();
  expect(await style(section, "background-color")).toBe(await themeColor(page, "--gfui-color-success-500"));

  // The spinner shows only after its 400 ms delay, and goes when the work is done.
  await button(page, "Work for 2 seconds").click();
  const spinner = page.locator(".gfui-Spinner");
  await page.waitForTimeout(200);
  await expect(spinner).toHaveCount(0);
  await expect(spinner).toBeVisible();
  await expect(spinner).toHaveCount(0, { timeout: 4000 });

  // A clickable card.
  await page.locator(".gfui-Card").filter({ hasText: "Clickable" }).click();
  await expect(text(page, "Clicked 1 times.")).toBeVisible();

  // Links: an external one opens a new tab; a disabled one has no href.
  const external = page.getByRole("link", { name: "External, new tab" });
  await expect(external).toHaveAttribute("target", "_blank");
  await expect(external).toHaveAttribute("rel", "noopener noreferrer");
  await expect(page.locator(".gfui-Link", { hasText: "Disabled" })).not.toHaveAttribute("href", /.*/);

  // Text overflow: one line, cut off.
  const clamped = text(page, /^maxLines="1"/);
  expect(await clamped.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);

  // Markdown: @{…} follows the variables; inline code and fences keep it; the HTML allowlist; data from the server.
  const markdown = page.locator(".gfui-Markdown").first();
  await expect(markdown.locator("strong").first()).toHaveText("Ada Lovelace");
  await expect(markdown).toContainText("the progress above is 100%");
  await expect(markdown.locator("code").filter({ hasText: "@{status}" })).toBeVisible();
  await expect(markdown.locator("em").first()).toHaveText("away");
  await expect(markdown.locator("pre code")).toContainText("@{progress}");
  await expect(markdown.locator("details summary")).toHaveText("Raw HTML (an allowlist)");
  await expect(markdown.locator("script")).toHaveCount(0);
  await expect(markdown.locator("table th")).toHaveText(["Component", "Built on"]);
  await expect(page.getByRole("heading", { name: "Loaded from the server" })).toBeVisible();
  // A Markdown link is a route.
  await markdown.getByRole("link", { name: "the Text scenario" }).click();
  await expect(page).toHaveURL(/#\/text$/);
  await expect(page.getByRole("heading", { level: 1 }).first()).toHaveText("Text and headings");
});

/** The stack whose own text child reads `caption` (a captioned item in the step 23 scenarios). */
const captioned = (page: Page, caption: string) => page.locator(`.gfui-Stack:has(> .gfui-Text:text-is("${caption}"))`);

test("Icons: every name, a filter, the size, the selection, a fallback", async ({ page }) => {
  await open(page, "/icons");
  await expect(text(page, "139 of 139 icons")).toBeVisible();
  await page.getByLabel("Filter", { exact: true }).fill("arrow");
  await expect(text(page, "4 of 139 icons")).toBeVisible();
  const grid = page.locator('.gfui-Stack[data-wrap] .gfui-Icon');
  await expect(grid).toHaveCount(4);
  await page.locator('.gfui-Stack[data-wrap] .gfui-Icon[data-icon-name="arrowleft"]').click();
  await expect(page.getByRole("heading", { name: "Selected: arrowleft" })).toBeVisible();
  await expect(text(page, '<Icon name="arrowleft" size="md"/>')).toBeVisible();
  // The size applies to the grid.
  expect((await grid.first().boundingBox())!.width).toBe(24);
  await page.getByRole("combobox", { name: "Size", exact: true }).click();
  await page.getByRole("option", { name: "lg", exact: true }).click();
  await expect.poll(async () => (await grid.first().boundingBox())!.width).toBe(32);
  await page.getByLabel("Filter", { exact: true }).fill("zzz");
  await expect(text(page, "No icon name contains “zzz”.")).toBeVisible();
  await expect(page.locator('.gfui-Icon[data-icon-name="unknownfile"]')).toBeVisible();
});

test("Images and avatars: fit, aspect ratio, grayscale, inline, lazy; initials, failures, sizes, clicks", async ({ page }) => {
  await open(page, "/media");
  const image = page.getByAltText("The sample landscape");
  await expect(image).toHaveCSS("object-fit", "contain");
  await page.getByRole("combobox", { name: "fit", exact: true }).click();
  await page.getByRole("option", { name: "cover", exact: true }).click();
  await expect(image).toHaveCSS("object-fit", "cover");
  await page.getByRole("combobox", { name: "aspectRatio", exact: true }).click();
  await page.getByRole("option", { name: "1", exact: true }).click();
  await expect.poll(async () => Math.round((await image.boundingBox())!.height)).toBe(240);
  await page.getByLabel("grayscale").check();
  await expect(image).toHaveCSS("filter", "grayscale(1)");
  await image.click();
  await expect(text(page, /clicked 1 times\.$/)).toBeVisible();
  await expect(page.getByAltText("a tiny landscape")).toHaveCSS("display", "inline");
  await expect(page.getByAltText("Loaded lazily")).toHaveAttribute("loading", "lazy");

  // Initials follow the name; a failed picture shows them; no name shows an empty avatar.
  await page.getByLabel("Name", { exact: true }).fill("Grace Brewster Hopper");
  await expect(captioned(page, "md").locator(".gfui-Avatar")).toHaveText("GBH");
  await expect(captioned(page, "a picture that fails").locator(".gfui-Avatar")).toHaveText("GBH");
  await expect(captioned(page, "a picture").locator(".gfui-Avatar img")).toHaveAttribute("src", "/sample-landscape.svg");
  await expect(captioned(page, "no name").locator(".gfui-Avatar")).toHaveAttribute("aria-label", "Avatar");
  const widths = [];
  for (const size of ["xs", "sm", "md", "lg", "64px"]) widths.push((await captioned(page, size).locator(".gfui-Avatar").boundingBox())!.width);
  expect(widths[4]).toBe(64);
  expect(widths.slice(0, 4)).toEqual([...widths.slice(0, 4)].sort((a, b) => a - b));
  await captioned(page, "clicked 0 times").locator(".gfui-Avatar").click();
  await expect(text(page, "clicked 1 times")).toBeVisible();
});

test("Status indicators: badge colors, a download, spinner delays and full screen, separators", async ({ page }) => {
  await open(page, "/status");
  const badge = (name: string) => page.locator(`.gfui-Stack:has(> .gfui-Text:text-is("${name}")) > .gfui-Badge`).first();
  const bg = (name: string) => style(badge(name), "background-color");
  expect(await bg("Build")).toBe(await themeColor(page, "--gfui-color-success-500"));
  expect(await bg("Tests")).toBe(await themeColor(page, "--gfui-color-danger-500"));
  expect(await bg("Deploy")).toBe(await themeColor(page, "--gfui-color-warn-200"));
  expect(await style(badge("Deploy"), "color")).toBe(await themeColor(page, "--gfui-color-surface-900"));
  expect(await bg("Docs")).toBe(await themeColor(page, "--gfui-backgroundColor-Badge"));
  await button(page, "Fix the tests").click();
  await expect(badge("Tests")).toHaveText("passing");
  expect(await bg("Tests")).toBe(await themeColor(page, "--gfui-color-success-500"));
  await expect(button(page, "Fix the tests")).toBeDisabled();

  // A simulated download fills the bar.
  await button(page, "Download").click();
  await expect(text(page, "100%")).toBeVisible({ timeout: 5000 });
  await expect(page.locator(".gfui-Badge", { hasText: "done" })).toBeVisible();
  const bar = (value: string) => page.locator(`.gfui-Stack:has(> .gfui-Text:text-is("value=${value}")) [role=progressbar]`);
  await expect(bar("1.5")).toHaveAttribute("aria-valuenow", "100");
  await expect(bar("-0.2")).toHaveAttribute("aria-valuenow", "0");

  // Spinners show after their delays: lower bounds only (they can't show earlier).
  const spinner = (delay: number) => captioned(page, `delay=${delay}`).locator(".gfui-Spinner");
  const start = Date.now();
  await button(page, "Spin for 2 seconds").click();
  await expect(spinner(0)).toBeVisible();
  if (Date.now() - start < 1400) await expect(spinner(1500)).toHaveCount(0);
  await expect(spinner(1500)).toBeVisible();
  expect(Date.now() - start).toBeGreaterThanOrEqual(1500);
  await expect(page.locator(".gfui-Spinner")).toHaveCount(0, { timeout: 5000 });
  await button(page, "Full-screen spinner for 1.5 seconds").click();
  await expect(page.locator(".gfui-Spinner-fullScreen .gfui-Spinner")).toBeVisible();
  await expect(page.locator(".gfui-Spinner-fullScreen")).toHaveCount(0, { timeout: 5000 });

  // Separators: thickness and length; a vertical one stretches to its row, or has a length.
  const separators = page.locator(".gfui-ContentSeparator");
  const half = separators.nth(1);
  await expect(half).toHaveCSS("border-top-width", "4px");
  const parent = (await half.evaluate((el) => el.parentElement!.clientWidth)) as number;
  expect(Math.abs((await half.boundingBox())!.width - parent / 2)).toBeLessThan(2);
  expect((await separators.nth(2).boundingBox())!.height).toBe(40);
  expect((await separators.nth(3).boundingBox())!.height).toBe(16);
});

test("Cards: selection by click and double click, title rows, a linked title, a horizontal card, nesting, a theme", async ({ page }) => {
  await open(page, "/cards");
  // A card by its own title (a card inside another must not match the outer one).
  const card = (title: string) => page.locator(`.gfui-Card:has(> .gfui-Card-header h2:text-is("${title}"))`);
  await card("Alan Turing").click();
  await expect(text(page, "Selected: Alan Turing. Opened: none.")).toBeVisible();
  expect(await style(card("Alan Turing"), "background-color")).toBe(await themeColor(page, "--gfui-color-primary-50"));
  await card("Grace Hopper").dblclick();
  await expect(text(page, "Selected: Grace Hopper. Opened: Grace Hopper.")).toBeVisible();
  await expect(card("Ada Lovelace").locator(".gfui-Avatar")).toHaveText("AL");
  await expect(card("With a picture").locator(".gfui-Avatar img")).toBeVisible();

  // A horizontal card: the children in a row, under the title row.
  const horizontal = card("Horizontal");
  const header = (await horizontal.locator(".gfui-Card-header").boundingBox())!;
  const avatar = (await horizontal.locator(":scope > .gfui-Avatar").boundingBox())!;
  const action = (await horizontal.getByRole("button", { name: "Action" }).boundingBox())!;
  expect(avatar.y).toBeGreaterThanOrEqual(header.y + header.height);
  expect(action.x).toBeGreaterThan(avatar.x + avatar.width);
  expect(Math.abs(action.y + action.height / 2 - (avatar.y + avatar.height / 2))).toBeLessThan(2);

  // Nesting: the inner card is a level deeper, with less padding.
  const outer = card("Outer card");
  const inner = card("Inner card");
  expect(Number(await inner.getAttribute("data-level"))).toBe(Number(await outer.getAttribute("data-level")) + 1);
  expect(parseFloat(await style(inner, "padding-top"))).toBeLessThan(parseFloat(await style(outer, "padding-top")));

  // Theme variables in a Theme.
  await expect(card("Themed")).toHaveCSS("border-radius", "12px");
  expect(await style(card("Themed"), "background-color")).toBe(await themeColor(page, "--gfui-color-primary-50"));

  // The linked title routes.
  await page.getByRole("link", { name: "A linked title" }).click();
  await expect(page).toHaveURL(/#\/icons$/);
});

test("Links and text: link kinds and enabled, overflow modes at a width, hasOverflow, heading anchors", async ({ page }) => {
  await open(page, "/links");
  const route = page.locator(".gfui-Link", { hasText: "A route: the Icons scenario" });
  await expect(route).toHaveAttribute("href", "#/icons");
  await expect(page.getByRole("link", { name: "A URL in a new tab" })).toHaveAttribute("target", "_blank");
  await expect(page.getByRole("link", { name: "An e-mail address" })).toHaveAttribute("href", "mailto:someone@example.com");
  await page.locator(".gfui-Link", { hasText: "No route, only a click handler" }).click();
  await expect(page.locator(".gfui-Link", { hasText: "(1 clicks)" })).toBeVisible();
  await page.getByLabel("Links enabled").uncheck();
  await expect(route).not.toHaveAttribute("href", /.*/);
  await expect(route).toHaveAttribute("aria-disabled", "true");
  await page.getByLabel("Links enabled").check();
  await expect(route).toHaveAttribute("href", "#/icons");
  await expect(page.locator(".gfui-Link:has(> .gfui-Link-icon)")).toHaveCount(7);

  // Overflow at 280px, then at 480px.
  const box = page.locator(".gfui-Stack:has(> .gfui-Text[data-overflow])").first();
  expect((await box.boundingBox())!.width).toBe(280);
  const cut = (pattern: RegExp) => text(page, pattern).evaluate((el) => el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight);
  expect(await cut(/^maxLines="1"/)).toBe(true);
  expect(await cut(/^maxLines="2"/)).toBe(true);
  await expect(text(page, /^overflowMode="scroll"/)).toHaveCSS("overflow-x", "auto");
  await expect(text(page, /^overflowMode="flow"/)).toHaveCSS("overflow-y", "auto");
  expect(await text(page, /^preserveLinebreaks/).evaluate((el) => (el as HTMLElement).innerText.split("\n").length)).toBe(3);
  await page.getByRole("combobox", { name: "Width", exact: true }).click();
  await page.getByRole("option", { name: "480px", exact: true }).click();
  await expect.poll(async () => (await box.boundingBox())!.width).toBe(480);
  await button(page, "hasOverflow()").click();
  await expect(text(page, "cut off")).toBeVisible();

  // Headings: anchors from the text; scrollIntoView.
  await expect(page.getByRole("heading", { name: /An anchored heading/ })).toHaveAttribute("id", "an-anchored-heading-hover-me");
  await button(page, "Scroll to the last heading").click();
  await expect(page.locator("#the-last-heading")).toBeInViewport();
  await route.click();
  await expect(page).toHaveURL(/#\/icons$/);
});

test("Markdown: samples from a variable, the allowlist, the flags, @{…} bindings, a data URL", async ({ page }) => {
  await open(page, "/markdown");
  const rendered = page.locator(".gfui-Card", { has: page.getByRole("heading", { name: "Rendered", exact: true }) }).locator(".gfui-Markdown");
  await expect(rendered.getByRole("heading", { name: "Basics" })).toBeVisible();
  await expect(rendered.locator("ol li")).toHaveCount(2);
  await expect(rendered.locator("pre code")).toHaveText("const answer = 42;");
  await page.getByLabel("showHeadingAnchors").check();
  await expect(rendered.getByRole("heading", { name: "Basics" })).toHaveAttribute("id", "basics");

  await button(page, "gfm").click();
  await expect(rendered.locator("th")).toHaveText(["Feature", "Status"]);
  await expect(rendered.locator("li[data-task] input")).toHaveCount(2);
  await expect(rendered.locator("li[data-task] input").first()).toBeChecked();
  await expect(rendered.locator(".gfui-Markdown-footnotes")).toContainText("Footnotes are listed at the end.");

  await button(page, "links").click();
  await expect(rendered.getByRole("link", { name: "A route" })).toHaveAttribute("href", "#/icons");
  await expect(rendered.getByRole("link", { name: "A reference link" })).toHaveAttribute("href", "#/cards");
  await expect(rendered.getByRole("img", { name: "The sample landscape" })).toBeVisible();
  await page.getByLabel("openLinkInNewTab").check();
  await expect(rendered.getByRole("link", { name: "A route" })).toHaveAttribute("target", "_blank");

  await button(page, "unsafe").click();
  await expect(rendered.locator("b")).toHaveText("bold");
  await expect(rendered.locator("details summary")).toHaveText("details");
  await expect(rendered.locator("script")).toHaveCount(0);
  await expect(rendered).toContainText('<script>alert("x")</script>');
  const img = rendered.locator("img");
  await expect(img).toHaveCount(1);
  expect(await img.evaluate((el) => [el.getAttribute("src"), el.getAttribute("onerror")])).toEqual([null, null]);
  // The javascript: link is its text only (the one link left is the heading's # anchor).
  await expect(rendered.getByRole("link", { name: "javascript: link" })).toHaveCount(0);
  await expect(rendered).toContainText("a javascript: link are made harmless");
  await expect(rendered).toContainText("@{secret} stays as written");
  await page.getByLabel("allowHtml").uncheck();
  await expect(rendered.locator("b")).toHaveCount(0);
  await expect(rendered).toContainText("<b>bold</b>");

  // @{…} in markup: compiled, reactive; code and escapes keep it.
  const greeting = page.locator(".gfui-Markdown", { hasText: "Hello," });
  await expect(greeting.locator("strong")).toHaveText("reader");
  await page.getByLabel("Your name", { exact: true }).fill("Ada");
  await expect(greeting.locator("strong")).toHaveText("Ada");
  await page.getByLabel("Your name", { exact: true }).fill("");
  await expect(greeting.locator("strong")).toHaveText("stranger");
  await button(page, "Count").click();
  await expect(greeting.locator("em")).toHaveText("1");
  await expect(greeting).toContainText('an object: {"count":1}.');
  await expect(greeting.locator("p code")).toHaveText("@{name}");
  await expect(greeting.locator("pre code")).toHaveText("@{count}");
  await expect(greeting).toContainText("An escaped @{name} is literal too.");
  await expect(page.locator(".gfui-Markdown", { hasText: "interpolateBindings" }).locator("strong")).toHaveText("@{name}");

  await expect(page.getByRole("heading", { name: "Loaded from the server" })).toBeVisible();
});

test("Text inputs: types, adornments, read-only, focus events, validation states, password toggle, TextArea, NumberBox", async ({ page }) => {
  await open(page, "/text-inputs");
  await expect(page.getByRole("searchbox", { name: "Search" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "E-mail" })).toHaveAttribute("type", "email");
  await expect(page.locator(".gfui-Adornment", { hasText: "kg" })).toBeVisible();
  const readOnly = page.getByRole("textbox", { name: "Read-only" });
  await readOnly.click();
  await page.keyboard.type("xyz");
  await expect(readOnly).toHaveValue("You can select this, not change it");
  await expect(page.getByRole("textbox", { name: "Disabled" })).toBeDisabled();

  await page.getByRole("textbox", { name: "Focus events" }).click();
  await page.getByRole("textbox", { name: "E-mail" }).click();
  await expect(text(page, "Events: got focus; lost focus;")).toBeVisible();

  // validationStatus: the border takes the state's color.
  const shown = page.getByRole("textbox", { name: "Shown without a form" });
  await page.getByRole("combobox", { name: "validationStatus" }).click();
  await page.getByRole("option", { name: "warning", exact: true }).click();
  // Mantine animates border colors (100 ms): wait for the settled value.
  const warning = await themeColor(page, "--gfui-borderColor-Input--warning");
  await expect.poll(() => style(shown, "border-top-color")).toBe(warning);
  // The select keeps the focus after a pick, and a click on it then doesn't open it: focus elsewhere first.
  await shown.focus();
  await page.getByRole("combobox", { name: "validationStatus" }).click();
  await page.getByRole("option", { name: "error", exact: true }).click();
  await expect(shown).toHaveAttribute("aria-invalid", "true");
  const error = await themeColor(page, "--gfui-borderColor-Input--error");
  await expect.poll(() => style(shown, "border-top-color")).toBe(error);

  // PasswordInput: masked; the toggle shows it.
  const password = page.locator('.gfui-PasswordInput input').first();
  await expect(password).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "Show the password" }).click();
  await expect(password).toHaveAttribute("type", "text");
  await expect(page.locator(".gfui-PasswordInput").nth(1).getByRole("button")).toHaveCount(0);

  // TextArea: insert() at the cursor; auto size grows, up to maxRows.
  const notes = page.getByRole("textbox", { name: "Notes (4 rows)" });
  await expect(notes).toHaveAttribute("rows", "4");
  await notes.click();
  await page.keyboard.press("End");
  await button(page, "Insert").click();
  await expect(notes).toHaveValue("Put the cursor somewhere and press Insert.[inserted]");
  const grows = page.getByRole("textbox", { name: "Grows with the text (2 to 6 rows)" });
  const before = (await grows.boundingBox())!.height;
  await grows.fill("1\n2\n3\n4");
  await expect.poll(async () => (await grows.boundingBox())!.height).toBeGreaterThan(before);
  await grows.fill("1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n11\n12");
  const capped = (await grows.boundingBox())!.height;
  await grows.fill("1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n11\n12\n13\n14\n15\n16");
  expect((await grows.boundingBox())!.height).toBe(capped);

  // NumberBox: arrows step; limits clamp on blur; integers only; zero or positive.
  const amount = page.getByRole("textbox", { name: "Amount (0–100, step 5)" });
  await amount.focus();
  await page.keyboard.press("ArrowUp");
  await expect(amount).toHaveValue("15");
  await expect(text(page, "Amount: 15 (number)")).toBeVisible();
  await amount.fill("500");
  await amount.blur();
  await expect(amount).toHaveValue("100");
  await amount.fill("");
  await expect(text(page, "Amount: empty (undefined)")).toBeVisible();
  await page.getByRole("textbox", { name: "Whole numbers" }).pressSequentially("1.5");
  await expect(page.getByRole("textbox", { name: "Whole numbers" })).toHaveValue("15");
  await page.getByRole("textbox", { name: "Zero or positive" }).pressSequentially("-3");
  await expect(page.getByRole("textbox", { name: "Zero or positive" })).toHaveValue("3");
});

test("Choice inputs: Space on a switch, arrows in a radio group and on sliders, a range, the color picker", async ({ page }) => {
  await open(page, "/choice-inputs");
  await expect(page.getByRole("checkbox", { name: "Indeterminate" })).toHaveAttribute("data-indeterminate", "true");
  const locked = page.getByRole("checkbox", { name: "Read-only (checked)" });
  await locked.click();
  await expect(locked).toBeChecked();

  const wifi = page.getByRole("switch", { name: "Wi-Fi" });
  await wifi.click();
  await expect(text(page, "Wi-Fi is off.")).toBeVisible();
  await page.keyboard.press("Space");
  await expect(text(page, "Wi-Fi is on.")).toBeVisible();
  const readOnlySwitch = page.getByRole("switch", { name: "Read-only" });
  await readOnlySwitch.click();
  await expect(readOnlySwitch).toBeChecked();

  // RadioGroup: click, then arrows move the selection (the disabled option is skipped).
  await page.getByRole("radio", { name: "Large", exact: true }).click();
  await expect(text(page, "Size: l")).toBeVisible();
  await page.keyboard.press("ArrowLeft");
  await expect(text(page, "Size: m")).toBeVisible();
  await expect(page.getByRole("radio", { name: "Extra large (sold out)" })).toBeDisabled();
  const delivery = page.getByRole("radiogroup", { name: "Delivery (vertical, read-only)" });
  await delivery.getByRole("radio", { name: "Express" }).click();
  await expect(delivery.getByRole("radio", { name: "Standard" })).toBeChecked();

  // Slider: arrow keys change and commit.
  const volume = page.getByRole("slider", { name: "Volume" });
  await volume.focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(volume).toHaveAttribute("aria-valuenow", "6");
  await expect(text(page, "Volume: 6 (committed: 6)")).toBeVisible();
  // A range: two thumbs, the formatted value in the tooltip.
  const thumbs = page.locator(".gfui-Slider", { hasText: "Price range" }).getByRole("slider");
  await expect(thumbs).toHaveCount(2);
  await thumbs.nth(1).focus();
  await page.keyboard.press("ArrowRight");
  await expect(text(page, "Price: $20 to $65")).toBeVisible();
  await thumbs.nth(1).hover();
  await expect(page.locator(".mantine-RangeSlider-label", { hasText: "$65" })).toBeVisible();
  // The theme's colors reach the range slider too (its class names differ from Slider's).
  expect(await style(page.locator(".mantine-RangeSlider-bar"), "background-color")).toBe(await themeColor(page, "--gfui-backgroundColor-range-Slider"));

  // ColorPicker: type a color, or pick one in the popup.
  const color = page.getByRole("textbox", { name: "Accent color", exact: true });
  await color.fill("#ff0000");
  await expect(text(page, "#ff0000")).toBeVisible();
  const swatch = page.locator('.gfui-Stack[style*="background-color"]').filter({ hasText: "" }).last();
  await expect(swatch).toHaveCSS("background-color", "rgb(255, 0, 0)");
  await color.click();
  // Inside ColorInput the picker's parts are named ColorInput's.
  const area = page.locator(".mantine-ColorInput-saturation");
  await expect(area).toBeVisible();
  const box = (await area.boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.2, box.y + box.height * 0.8);
  await expect(text(page, "#ff0000")).toHaveCount(0);
  await expect(color).not.toHaveValue("#ff0000");
});

test("Input form: every input bound; errors block the submit; values keep their types; Enter submits, Escape resets", async ({ page }) => {
  await open(page, "/input-form");
  await expect(page.getByRole("textbox", { name: "Name" })).toHaveValue("Ada Lovelace");
  await expect(page.getByRole("radio", { name: "Free" })).toBeChecked();
  await button(page, "Save").click();
  await expect(text(page, "Please accept the terms")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Submitted" })).toHaveCount(0);

  await page.locator(".gfui-PasswordInput input").fill("correct horse");
  await page.getByRole("textbox", { name: "Age" }).fill("37");
  await page.getByRole("radio", { name: "Pro" }).click();
  const volume = page.getByRole("slider", { name: "Notification volume" });
  await volume.focus();
  await page.keyboard.press("ArrowRight");
  await page.getByRole("switch", { name: "Send me the newsletter" }).click();
  await page.getByRole("checkbox", { name: "I accept the terms" }).check();
  await expect(text(page, "Dirty: yes")).toBeVisible();
  await button(page, "Save").click();
  const submitted = page.locator(".gfui-Card", { hasText: "Submitted" }).locator(".gfui-Text");
  await expect(submitted).toBeVisible();
  expect(JSON.parse((await submitted.textContent())!)).toEqual({
    name: "Ada Lovelace", password: "correct horse", bio: "", age: 37, plan: "pro", volume: 6, color: "#2563eb", newsletter: true, terms: true,
  });

  // Enter in the TextArea submits; Escape resets the form.
  const bio = page.getByRole("textbox", { name: "About you" });
  await bio.fill("Mathematician");
  await bio.press("Enter");
  await expect.poll(async () => JSON.parse((await submitted.textContent())!).bio).toBe("Mathematician");
  await bio.fill("Changed");
  await bio.press("Escape");
  await expect(bio).toHaveValue("");
  await expect(page.getByRole("radio", { name: "Free" })).toBeChecked();
  await expect(text(page, "Dirty: no")).toBeVisible();
});

test("Input APIs and theming: setValue, focus and value from code; two inputs in sync; Enter in a TextArea; icons; theme variables", async ({ page }) => {
  await open(page, "/input-apis");
  const empty = "Booking: Nowhere, no guests, no room, 1 nights, breakfast no, late check-in no, tag #64748b";
  await expect(text(page, empty)).toBeVisible();

  // setValue on every input; the summary reads their reactive values.
  await button(page, "Fill in a sample booking").click();
  await expect(text(page, "Booking: Lisbon, 2 guests, suite, 5 nights, breakfast yes, late check-in yes, tag #e11d48")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "City" })).toHaveValue("Lisbon");
  await expect(page.getByRole("textbox", { name: "Guests" })).toHaveValue("2");
  await expect(page.getByRole("radio", { name: "Suite" })).toBeChecked();
  await expect(page.getByRole("textbox", { name: "Tag color" })).toHaveValue("#e11d48");
  await expect(page.getByRole("switch", { name: "Breakfast" })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "Late check-in" })).toBeChecked();
  await expect(page.getByRole("slider", { name: "Nights" })).toHaveAttribute("aria-valuenow", "5");
  // The swatch beside the summary takes the color (the innermost stack holding the summary, then its first child).
  const bookingRow = page.locator(".gfui-Stack", { has: text(page, /^Booking:/) }).last();
  await expect(bookingRow.locator(".gfui-Stack").first()).toHaveCSS("background-color", "rgb(225, 29, 72)");

  // focus(): the room group focuses its checked option; the slider its thumb.
  await button(page, "Focus the room").click();
  await expect(page.getByRole("radio", { name: "Suite" })).toBeFocused();
  await button(page, "Focus the nights").click();
  await expect(page.getByRole("slider", { name: "Nights" })).toBeFocused();
  await button(page, "Focus the city").click();
  await expect(page.getByRole("textbox", { name: "City" })).toBeFocused();

  await button(page, "Clear").click();
  await expect(text(page, empty)).toBeVisible();
  await expect(page.getByRole("radio", { name: "Suite" })).not.toBeChecked();
  await expect(page.getByRole("textbox", { name: "Guests" })).toHaveValue("");
  // With nothing selected, focus() goes to the first option.
  await button(page, "Focus the room").click();
  await expect(page.getByRole("radio", { name: "Single" })).toBeFocused();

  // Two inputs, one value: each one's didChange sets the other.
  const widthSlider = page.getByRole("slider", { name: "Bar width" });
  const widthBox = page.getByRole("textbox", { name: "Width" });
  await widthBox.fill("25");
  await expect(widthSlider).toHaveAttribute("aria-valuenow", "25");
  await widthSlider.focus();
  await page.keyboard.press("ArrowRight");
  await expect(widthBox).toHaveValue("30");
  await expect(widthSlider).toHaveAttribute("aria-valuenow", "30");

  // Enter sends the message and the form resets; Shift+Enter is a new line; an empty message doesn't send.
  await expect(text(page, "No messages yet.")).toBeVisible();
  const message = page.getByRole("textbox", { name: "Message (Enter sends, Shift+Enter is a new line)" });
  await message.click();
  await page.keyboard.type("Hello");
  await page.keyboard.press("Enter");
  await expect(page.locator(".gfui-Card", { hasText: "Hello" })).toBeVisible();
  await expect(message).toHaveValue("");
  await expect(text(page, "No messages yet.")).toHaveCount(0);
  await page.keyboard.type("Line 1");
  await page.keyboard.press("Shift+Enter");
  await page.keyboard.type("Line 2");
  await expect(message).toHaveValue("Line 1\nLine 2");
  await page.keyboard.press("Enter");
  await expect(page.locator(".gfui-Card", { hasText: "Line 2" })).toHaveText("Line 1\nLine 2");
  await page.keyboard.press("Enter");
  await expect(text(page, "Type something first")).toBeVisible();
  await expect(page.locator(".gfui-Card")).toHaveCount(2);

  // enterSubmits="false": Enter is a new line, no submit.
  const notes = page.getByRole("textbox", { name: /^Notes \(enterSubmits=false/ });
  await notes.click();
  await page.keyboard.type("a");
  await page.keyboard.press("Enter");
  await page.keyboard.type("b");
  await expect(notes).toHaveValue("a\nb");
  await expect(text(page, "The notes form was submitted 0 times.")).toBeVisible();
  await expect(notes).toHaveCSS("resize", "vertical");

  // Icons: the password toggle's own icons; adornment icons.
  const pin = page.locator(".gfui-Label", { hasText: "PIN" });
  await expect(pin.locator("svg.lucide-lock")).toBeVisible();
  await pin.getByRole("button", { name: "Show the password" }).click();
  await expect(pin.locator("input")).toHaveAttribute("type", "text");
  await expect(pin.locator("svg.lucide-eye-off")).toBeVisible();
  const website = page.locator(".gfui-Label", { hasText: "Website" });
  await expect(website.locator("svg.lucide-globe")).toBeVisible();
  await expect(website.locator("svg.lucide-link")).toBeVisible();
  // showValues="false": no tooltip on hover.
  await page.getByRole("slider", { name: "No tooltip (showValues=false)" }).hover();
  await expect(page.locator(".gfui-Slider", { hasText: "No tooltip" }).locator(".mantine-Slider-label")).toHaveCount(0);

  // Theme variables: the themed column takes the Theme's colors, the default one keeps the theme's.
  const success = await themeColor(page, "--gfui-color-success-500");
  const warn = await themeColor(page, "--gfui-color-warn-500");
  const primary = await themeColor(page, "--gfui-color-primary-500");
  const checkbox = (title: string) => page.locator(".mantine-Checkbox-root", { hasText: `${title} checkbox` }).locator(".mantine-Checkbox-input");
  const track = (title: string) => page.locator(".gfui-Switch", { hasText: `${title} switch` }).locator(".mantine-Switch-track");
  const radio = (title: string) => page.getByRole("radiogroup", { name: `${title} radio` }).getByRole("radio", { name: "B" });
  const bar = (title: string) => page.locator(".gfui-Slider", { hasText: `${title} slider` }).locator(".mantine-Slider-bar");
  const textBox = (title: string) => page.getByRole("textbox", { name: `${title} text` });
  await expect.poll(() => style(checkbox("Default"), "background-color")).toBe(primary);
  await expect.poll(() => style(checkbox("Themed"), "background-color")).toBe(success);
  expect(await style(track("Default"), "background-color")).toBe(primary);
  expect(await style(track("Themed"), "background-color")).toBe(success);
  expect(await style(radio("Default"), "background-color")).toBe(primary);
  expect(await style(radio("Themed"), "background-color")).toBe(success);
  expect(await style(bar("Default"), "background-color")).toBe(primary);
  expect(await style(bar("Themed"), "background-color")).toBe(warn);
  await expect.poll(() => style(textBox("Themed"), "border-top-color")).toBe(warn);
  expect(await style(textBox("Themed"), "border-top-left-radius")).toBe("999px");
  expect(await style(textBox("Default"), "border-top-left-radius")).not.toBe("999px");
});

test("Select: options from children, Items and data; keys; search by keywords; several values; groups; templates; states; the API", async ({ page }) => {
  await open(page, "/select");
  const fruit = page.getByRole("combobox", { name: "Fruit", exact: true });
  await expect(fruit).toHaveText("Pick a fruit");
  await expect(page.getByRole("combobox", { name: "Country (data, valueField, labelField)" })).toHaveText("Japan");
  await expect(page.getByRole("combobox", { name: "A number value" })).toHaveText("Two");

  // Keys: ArrowDown opens on the first option, skips the disabled one; Enter picks; Escape closes.
  await fruit.focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("option", { name: "Durian (out of season)" })).toHaveAttribute("data-combobox-disabled", "true");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(text(page, "Fruit: banana")).toBeVisible();
  await expect(fruit).toHaveText("Banana");
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("option", { name: "Apple" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("option", { name: "Apple" })).toBeHidden();
  // Items: a new option appears when its data changes.
  await button(page, "Add a fruit").click();
  await fruit.click();
  await page.getByRole("option", { name: "Fig 1" }).click();
  await expect(text(page, "Fruit: Fig 1")).toBeVisible();

  // Search: keywords count; the clear button.
  const color = page.getByRole("combobox", { name: "Color (searchable, clearable)" });
  await color.fill("sea");
  await expect(page.getByRole("option")).toHaveText(["Blue"]);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(text(page, "Color: blue")).toBeVisible();
  await expect(color).toHaveValue("Blue");
  await page.locator(".gfui-Select", { has: color }).locator(".mantine-InputClearButton-root").click();
  await expect(text(page, "Color: none")).toBeVisible();

  // Several values: pills; the list stays open; Backspace removes the last; a value template's remove button.
  const toppings = page.getByRole("combobox", { name: "Toppings (multiSelect)" });
  await toppings.click();
  await page.getByRole("option", { name: "Ham" }).click();
  await page.getByRole("option", { name: "Olives" }).click();
  await expect(text(page, 'Toppings: ["cheese","ham","olives"]; tags: ["news","tech"]')).toBeVisible();
  await page.keyboard.press("Backspace");
  await expect(text(page, 'Toppings: ["cheese","ham"]; tags: ["news","tech"]')).toBeVisible();
  await page.locator(".gfui-Select", { hasText: "Tags (valueTemplate)" }).getByRole("button", { name: "×" }).first().click();
  await expect(text(page, 'Toppings: ["cheese","ham"]; tags: ["tech"]')).toBeVisible();

  // Groups: headers from the template, by name; the ungrouped first under their own header.
  await page.getByRole("combobox", { name: "Country by region (groupBy)" }).click();
  const listbox = page.getByRole("listbox").filter({ visible: true });
  await expect(listbox.locator(".mantine-Combobox-groupLabel")).toHaveText(["Americas", "Asia", "Europe"]);
  await expect(listbox.getByRole("option")).toHaveText(["Brazil", "Canada", "Japan", "Portugal", "Norway"]);
  await page.keyboard.press("Escape");
  await page.getByRole("combobox", { name: "Food (ungrouped first)" }).click();
  await expect(page.getByRole("listbox").filter({ visible: true }).locator(".mantine-Combobox-groupLabel")).toHaveText(["Other", "Fruit", "Vegetable"]);
  await page.keyboard.press("Escape");
  // Templates: the option template with $checked; an Option's own content.
  await page.getByRole("combobox", { name: "Rating (optionTemplate)" }).click();
  await expect(page.getByRole("option", { name: "★★★ Good (current)" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("combobox", { name: "Plan (an Option's own content)" }).click();
  await page.getByRole("option", { name: "Pro For teams" }).click();
  await expect(page.getByRole("combobox", { name: "Plan (an Option's own content)" })).toHaveText("Pro");

  // Empty lists and in progress; a short list scrolls.
  await page.getByRole("combobox", { name: "Nothing to pick" }).click();
  await expect(text(page, "List is empty")).toBeVisible();
  await page.getByRole("combobox", { name: "A custom empty list" }).click();
  await expect(text(page, "No options yet. Add some!")).toBeVisible();
  await page.getByRole("switch", { name: "Loading" }).click();
  await page.getByRole("combobox", { name: "Loading (inProgress)" }).click();
  await expect(text(page, "Loading the options…")).toBeVisible();
  await expect(page.getByRole("option", { name: "Loaded A" })).toBeHidden();
  await page.getByRole("combobox", { name: "dropdownHeight=120px" }).click();
  const options = page.locator(".gfui-Select-dropdown .mantine-Combobox-options").filter({ visible: true });
  expect((await options.boundingBox())!.height).toBeLessThanOrEqual(121);
  await page.keyboard.press("Escape");

  // States: disabled; read-only opens nothing; validationStatus colors the border.
  await expect(page.getByRole("combobox", { name: "Disabled" })).toBeDisabled();
  await page.getByRole("combobox", { name: "Read-only" }).click();
  await expect(page.getByRole("option", { name: "Other" })).toBeHidden();
  const status = page.getByRole("combobox", { name: "validationStatus" });
  await status.click();
  await page.getByRole("option", { name: "warning" }).click();
  // The focus border wins while it is focused (as every input's).
  await page.getByRole("combobox", { name: "Fruit", exact: true }).focus();
  const warning = await themeColor(page, "--gfui-borderColor-Input--warning");
  await expect.poll(() => style(status, "border-top-color")).toBe(warning);

  // The API: setValue fires no didChange; focus.
  await button(page, "Pick banana").click();
  await expect(fruit).toHaveText("Banana");
  await expect(text(page, "Fruit: Fig 1")).toBeVisible();
  await button(page, "Clear the fruit").click();
  await expect(fruit).toHaveText("Pick a fruit");
  await button(page, "Focus the fruit").click();
  await expect(fruit).toBeFocused();
  await button(page, "Toppings: ham and basil").click();
  await expect(text(page, 'Toppings: ["ham","basil"]; tags: ["tech"]')).toBeVisible();
});

test("AutoComplete: keywords, Enter on the only match, clearing; several values and created ones; both pickers in a Form", async ({ page }) => {
  await open(page, "/autocomplete");
  const hero = page.getByRole("combobox", { name: "Hero", exact: true });
  await hero.fill("batman");
  await expect(page.getByRole("option")).toHaveText(["Bruce Wayne"]);
  await page.keyboard.press("Enter");
  await expect(text(page, "Hero: bruce")).toBeVisible();
  await expect(hero).toHaveValue("Bruce Wayne");
  await hero.fill("");
  await hero.blur();
  await expect(text(page, "Hero: none")).toBeVisible();

  // multi: pick, the search clears and the list stays; Backspace removes the last.
  const team = page.getByRole("combobox", { name: "Team (multi)" });
  await team.fill("dia");
  await page.getByRole("option", { name: "Diana Prince" }).click();
  await expect(team).toHaveValue("");
  await expect(page.getByRole("option", { name: "Bruce Wayne" })).toBeVisible();
  await expect(text(page, /^Team: \["clark","diana"\]/)).toBeVisible();
  await page.keyboard.press("Backspace");
  await expect(text(page, /^Team: \["clark"\]/)).toBeVisible();

  // creatable: a Create item, itemCreated, the new value.
  const labels = page.getByRole("combobox", { name: "Labels (multi, creatable)" });
  await labels.fill("docs");
  await page.getByRole("option", { name: 'Create "docs"' }).click();
  await expect(text(page, 'Team: ["clark"]; labels: ["docs"]; created: docs')).toBeVisible();
  await labels.fill("bug");
  await expect(page.getByRole("option")).toHaveText(["bug"]);
  await expect(labels).toHaveAttribute("maxlength", "20");

  // The Form: required on an AutoComplete and a multi Select; submit with the values' types.
  await button(page, "Save").click();
  await expect(text(page, "Pick an owner")).toBeVisible();
  await expect(text(page, "Pick at least one reviewer")).toBeVisible();
  const owner = page.getByRole("combobox", { name: "Owner" });
  await owner.fill("grace");
  await page.keyboard.press("Enter");
  await page.getByRole("combobox", { name: "Reviewers" }).click();
  await page.getByRole("option", { name: "Ada Lovelace" }).click();
  await page.getByRole("option", { name: "Alan Turing" }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("combobox", { name: "Component" }).fill("doc");
  await page.getByRole("option", { name: "Documentation" }).click();
  await expect(text(page, "Dirty: yes")).toBeVisible();
  await button(page, "Save").click();
  const saved = page.locator(".gfui-Card", { hasText: "Saved" }).locator(".gfui-Text");
  await expect(saved).toBeVisible();
  expect(JSON.parse((await saved.textContent())!)).toEqual({ owner: "grace", reviewers: ["ada", "alan"], component: "docs" });
  // The required mark on the pickers' own labels.
  const marks = await page.locator(".gfui-Form .gfui-Label-text").evaluateAll((labels) =>
    labels.map((label) => `${label.textContent}${getComputedStyle(label, "::after").content.replace(/^none$/, "")}`),
  );
  expect(marks).toEqual(['Owner" *"', 'Reviewers" *"', "Component"]);
});

/** The text fields of a date or time input, by its label (Mantine's own label). */
const dateFields = (page: Page, label: string) =>
  page.locator(".mantine-InputWrapper-root", { has: page.locator(`label:text-is("${label}")`) }).first().locator("input:not([type=hidden])");

test("Date and time inputs: typing moves through the fields; formats; limits; clearing; 12-hour time; invalidTime; the API", async ({ page }) => {
  await open(page, "/date-time");
  await expect(text(page, /^Born: 05\/25\/1990 \(iso 1990-05-25\)/)).toBeVisible();

  // Typing fills a field and moves to the next one.
  const born = dateFields(page, "Born (MM/dd/yyyy)");
  await born.first().click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("12312001");
  await expect(text(page, /^Born: 12\/31\/2001 \(iso 2001-12-31\)/)).toBeVisible();
  await expect(text(page, "Last change: born: 12/31/2001")).toBeVisible();

  // Another format: the fields' order and separator.
  const start = dateFields(page, "Start (dd-MM-yyyy, clearable)");
  await start.first().click();
  await page.keyboard.type("03022026");
  await expect(text(page, /; start: 03-02-2026;/)).toBeVisible();
  await page.locator(".gfui-DateInput", { has: page.locator('label:text-is("Start (dd-MM-yyyy, clearable)")') }).locator("button").click();
  await expect(text(page, /; start: none;/)).toBeVisible();
  // clearToInitialValue: back to the initial value.
  await dateFields(page, "ISO (yyyy-MM-dd)").nth(2).fill("20");
  await expect(text(page, /; ISO: 2026-01-20$/)).toBeVisible();
  await page.locator(".gfui-DateInput", { has: page.locator('label:text-is("ISO (yyyy-MM-dd)")') }).locator("button").click();
  await expect(text(page, /; ISO: 2026-01-15$/)).toBeVisible();

  // Limits: a date outside 2026 is invalid, with no value.
  const limited = dateFields(page, "In 2026 only (minValue, maxValue)");
  await limited.first().click();
  await page.keyboard.type("05052025");
  await expect(text(page, "In 2026: none")).toBeVisible();
  await expect(page.locator(".gfui-DateInput .mantine-Input-input[data-error]")).toHaveCount(1);
  await limited.nth(2).fill("2026");
  await expect(text(page, "In 2026: 05/05/2026")).toBeVisible();
  await expect(page.locator(".gfui-DateInput .mantine-Input-input[data-error]")).toHaveCount(0);
  // The empty character, the read-only input.
  await expect(dateFields(page, "With adornments").first()).toHaveAttribute("placeholder", "__");
  // Read-only: Mantine's fields ignore typing (without the attribute).
  const readOnly = dateFields(page, "Read-only").first();
  await readOnly.click();
  await page.keyboard.type("01");
  await expect(readOnly).toHaveValue("12");

  // TimeInput: 24-hour and 12-hour values, isoValue().
  await expect(text(page, /^Alarm: 07:30; meeting: 02:15:00 pm \(iso 14:15:00\)/)).toBeVisible();
  const meeting = dateFields(page, "Meeting (12-hour, seconds)");
  await meeting.first().click();
  await page.keyboard.type("091500");
  await page.locator(".gfui-TimeInput", { has: page.locator('label:text-is("Meeting (12-hour, seconds)")') }).locator("select").selectOption({ label: "AM" });
  await expect(text(page, /meeting: 09:15:00 am \(iso 09:15:00\)/)).toBeVisible();
  // minTime/maxTime: invalidTime fires; the time is clamped when the focus leaves.
  const office = dateFields(page, "Office hours (09:00–17:00)");
  await office.first().click();
  await page.keyboard.type("1830");
  await expect(text(page, "Last invalid time: 18:30")).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(text(page, /; office: 17:00$/)).toBeVisible();

  // The API: setValue (no didChange), focus.
  await button(page, "Born: 1 Jan 2000").click();
  await button(page, "Alarm: 06:45").click();
  await expect(text(page, /^Born: 01\/01\/2000 \(iso 2000-01-01\)/)).toBeVisible();
  await expect(text(page, /^Alarm: 06:45;/)).toBeVisible();
  await expect(text(page, "Last change: born: 12/31/2001")).toBeVisible();
  await button(page, "Clear both").click();
  await expect(text(page, /^Born: none \(iso none\)/)).toBeVisible();
  await button(page, "Focus the alarm").click();
  await expect(dateFields(page, "Alarm (24-hour)").first()).toBeFocused();
});

test("DatePicker: typed fields and the popup; a range in two clicks and presets; inline with limits, disabled days, locale; a Form", async ({ page }) => {
  await open(page, "/date-picker");
  await expect(text(page, "Due: 06/15/2026; trip: none")).toBeVisible();

  // The popup: the toggle opens the calendar on the value's month; a day picks and closes it.
  const toggle = page.getByRole("button", { name: "Open the calendar" }).first();
  await toggle.click();
  const popup = page.locator(".gfui-DatePicker-dropdown");
  await expect(popup.getByRole("button", { name: "June 20, 2026" })).toBeVisible();
  await popup.getByRole("button", { name: "June 20, 2026" }).click();
  await expect(text(page, "Due: 06/20/2026; trip: none")).toBeVisible();
  await expect(popup.getByRole("button", { name: "June 21, 2026" })).toBeHidden();
  // Typing into the fields works too.
  await dateFields(page, "Due date").nth(1).fill("25");
  await expect(text(page, "Due: 06/25/2026; trip: none")).toBeVisible();

  // A range: the value changes when both ends are set; presets.
  await page.getByRole("button", { name: "Open the calendar" }).nth(1).click();
  const presets = page.locator(".mantine-DatePicker-presetButton");
  await expect(presets).toHaveText(["Last 7 days", "Last 30 days", "This month", "Last month"]);
  const first = page.locator(".gfui-DatePicker-dropdown .mantine-DatePicker-day:not([data-outside]):not([disabled])").first();
  const firstLabel = (await first.getAttribute("aria-label"))!;
  await first.click();
  await expect(text(page, "Due: 06/25/2026; trip: none")).toBeVisible();
  await page.locator(".gfui-DatePicker-dropdown .mantine-DatePicker-day:not([data-outside]):not([disabled])").nth(2).click();
  await expect(text(page, /^Due: 06\/25\/2026; trip: \d\d\/\d\d\/\d{4} to \d\d\/\d\d\/\d{4}$/)).toBeVisible();
  expect(firstLabel).toMatch(/, \d{4}$/);
  await page.getByRole("button", { name: "Open the calendar" }).nth(1).click();
  await presets.filter({ hasText: "Last 7 days" }).click();
  const range = (await text(page, /^Due: .* trip: /).textContent())!.match(/trip: (\S+) to (\S+)/)!;
  const days = (Date.parse(range[2]!) - Date.parse(range[1]!)) / 86_400_000;
  expect(days).toBe(6);

  // Inline: limits to June, disabled weekends and 19 June, Monday first; a click picks.
  const workday = page.locator(".gfui-DatePicker", { hasText: "A workday in June 2026" });
  await expect(workday.locator(".mantine-DatePicker-weekday").first()).toHaveText("Mon");
  await expect(workday.getByRole("button", { name: "June 19, 2026" })).toBeDisabled();
  await expect(workday.getByRole("button", { name: "June 20, 2026" })).toBeDisabled();
  await expect(workday.locator(".mantine-DatePicker-calendarHeaderControl[data-direction=next]")).toBeDisabled();
  await expect(text(page, "Workday: 06/10/2026")).toBeVisible();
  await workday.getByRole("button", { name: "June 17, 2026" }).click();
  await expect(text(page, "Workday: 06/17/2026")).toBeVisible();
  // The locale and week numbers.
  const german = page.locator(".gfui-DatePicker", { hasText: "Week numbers, German" });
  await expect(german.getByText("März 2026")).toBeVisible();
  // The first header cell is the week numbers' (#).
  await expect(german.locator(".mantine-DatePicker-weekday").nth(1)).toHaveText("Mo");
  await expect(german.locator(".mantine-DatePicker-weekNumber").first()).toHaveText("9");

  // The Form: required, typed values, the range's { from, to }.
  await button(page, "Save").click();
  await expect(text(page, "Enter the arrival date")).toBeVisible();
  await dateFields(page, "Arrival").first().click();
  await page.keyboard.type("07012026");
  await dateFields(page, "Check-in").first().fill("16");
  await button(page, "Save").click();
  const saved = page.locator(".gfui-Card", { hasText: "Saved" }).locator(".gfui-Text");
  await expect(saved).toBeVisible();
  expect(JSON.parse((await saved.textContent())!)).toEqual({ arrival: "07/01/2026", checkIn: "16:00", nights: { from: "07/01/2026", to: "07/05/2026" } });
});

// Step 27: the overlay scenarios. e2e/overlays.spec.ts covers them in depth (focus, Escape, placement).
test("Dialogs and drawers: a dialog with $param and a Form, the help dialog by `when`, a drawer", async ({ page }) => {
  await open(page, "/dialogs");
  await button(page, "Edit Ann").click();
  const editor = page.getByRole("dialog", { name: "Edit Ann" });
  await expect(editor.getByLabel("Age")).toHaveValue("34");
  await editor.getByRole("button", { name: "Save" }).click();
  await expect(editor).toBeHidden();
  await expect(text(page, "log: saved Ann (34), closed")).toBeVisible();
  await button(page, "Show help").click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Help" })).toBeHidden();
  await button(page, "Bottom drawer").click();
  await expect(page.getByText("From the bottom edge.", { exact: true })).toBeVisible();
});

test("Menus and tooltips: an item, a submenu item, a custom trigger; a context menu; a tooltip", async ({ page }) => {
  await open(page, "/menus");
  await button(page, "Actions").click();
  await page.getByRole("menuitem", { name: "Duplicate" }).click();
  await expect(text(page, "log: duplicate")).toBeVisible();
  await button(page, "Actions").click();
  await page.getByRole("menuitem", { name: "Export" }).hover();
  await page.getByRole("menuitem", { name: "CSV" }).click();
  await expect(text(page, "log: export csv")).toBeVisible();
  await button(page, "Custom trigger").click();
  await page.getByRole("menuitem", { name: "From a custom trigger" }).click();
  await expect(text(page, "log: custom")).toBeVisible();
  const card = page.locator(".gfui-Card").filter({ has: page.getByRole("heading", { name: "Notes.md", exact: true }) }).last();
  await card.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Rename Notes.md" }).click();
  await expect(text(page, "log: rename Notes.md")).toBeVisible();
  await button(page, "Markdown").hover();
  await expect(page.getByRole("tooltip").locator("code")).toHaveText("code");
});

test("Toasts and confirm: a success toast; confirm() both ways; an APICall that asks first", async ({ page }) => {
  await open(page, "/notifications");
  await button(page, "Success").click();
  await expect(page.locator(".gfui-Toast[data-kind=success]", { hasText: "Saved" })).toBeVisible();
  await button(page, "Ask (positional)").click();
  await page.getByRole("dialog", { name: "Delete the file" }).getByRole("button", { name: "Delete" }).click();
  await expect(text(page, "answer: confirmed")).toBeVisible();
  await button(page, "Add Zoe").click();
  await page.getByRole("dialog", { name: "Add a person" }).getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("dialog", { name: "Add a person" })).toBeHidden();
  await expect(page.locator(".gfui-Toast", { hasText: "Adding Zoe" })).toHaveCount(0);
});

// Step 28: the structure scenarios. e2e/structure.spec.ts covers them in depth (dragging, sticking, overflow).
test("Tabs and steppers: tabs and their API, accordion tabs, expandable items, a stepper with states", async ({ page }) => {
  await open(page, "/tabs");
  await button(page, "Next tab").click();
  await expect(page.getByRole("tab", { name: "Settings", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(text(page, "log: tab 1 (Settings)")).toBeVisible();
  await page.getByRole("button", { name: "Returns", exact: true }).click();
  await expect(page.getByText("Returns within 30 days.", { exact: true })).toBeVisible();
  await button(page, "Toggle the first").click();
  await expect(page.getByText("A re-invention of XMLUI.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "What is gluefuil?" })).toHaveAttribute("aria-expanded", "true");
  await button(page, "Continue").click();
  await button(page, "Continue").click();
  await expect(page.locator(".gfui-Step-header", { hasText: "Plan" }).first()).toHaveAttribute("data-state", "error");
  await button(page, "Start over").click();
  await expect(page.locator(".gfui-Step-header", { hasText: "Account" }).first()).toHaveAttribute("data-state", "completed");
});

test("Splitters and scrolling: the bar by keyboard reports its size; scroll styles; a hidden pane", async ({ page }) => {
  await open(page, "/splitters");
  await page.getByRole("separator").first().focus();
  await page.keyboard.press("ArrowRight");
  await expect(text(page, /^Primary size: \d+px$/)).toBeVisible();
  await button(page, "Hide the second pane").click();
  await expect(button(page, "Show the second pane")).toBeVisible();
  await expect(page.locator(".gfui-ScrollViewer .mantine-ScrollArea-root")).toHaveCount(4);
});

test("Responsive bars: a narrow toolbar puts the rest into its menu", async ({ page }) => {
  await open(page, "/responsive-bar");
  await page.getByRole("slider").focus();
  await page.keyboard.press("Home");
  await expect(text(page, "Overflow: true")).toBeVisible();
  await page.locator(".gfui-ResponsiveBar").first().getByRole("button", { name: "More options" }).click();
  await expect(page.getByRole("button", { name: "Help (in the menu)" })).toBeVisible();
});

test("Long lists: Row 5000 jumps there and reports the visible rows", async ({ page }) => {
  await open(page, "/long-lists");
  await button(page, "Row 5000").click();
  await expect(text(page, /^Visible rows: 5000–\d+$/)).toBeVisible();
  await expect(page.locator(".gfui-List-row").getByText("Row 5000", { exact: true })).toBeInViewport();
});

test("Chat feed: a sent message shows at the bottom", async ({ page }) => {
  await open(page, "/chat-feed");
  await expect(page.getByText("Message 129", { exact: true })).toBeInViewport();
  await button(page, "Send").click();
  await expect(page.getByText("Message 130", { exact: true })).toBeInViewport();
});

test("Grouped and selectable lists: a group folds; a clicked row is selected", async ({ page }) => {
  await open(page, "/grouped-lists");
  await button(page, "Fold Design").click();
  await expect(page.getByText("Margaret (Designer)")).toHaveCount(0);
  await page.getByRole("option").filter({ hasText: "Grace" }).click();
  await expect(text(page, "Selected ids: 2")).toBeVisible();
});

test("Tables: a header click sorts and reports it", async ({ page }) => {
  await open(page, "/tables");
  await page.getByRole("columnheader").filter({ hasText: "City" }).getByRole("button").click();
  await expect(text(page, "Sorting: city ascending")).toBeVisible();
});

test("Table columns and types: the inferred columns' headers", async ({ page }) => {
  await open(page, "/table-types");
  await expect(page.getByRole("columnheader", { name: /^email/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "grace@example.com" })).toBeVisible();
});

test("Editable and paged tables: a checkbox cell saves through the variable", async ({ page }) => {
  await open(page, "/editable-tables");
  await page.getByRole("row").filter({ hasText: "Search" }).getByRole("checkbox", { name: "Reviewed" }).check();
  await expect(text(page, "Last change: reviewed of Search: true")).toBeVisible();
});

test("Trees: the selection follows a variable and its path opens; Level 1 closes the rest", async ({ page }) => {
  await open(page, "/trees");
  const tree = page.getByRole("tree").first();
  await expect(tree.getByRole("treeitem", { name: "Q1 report.pdf" })).toHaveAttribute("aria-selected", "true");
  await button(page, "Select Invoice 001").click();
  await expect(tree.getByRole("treeitem", { name: "Invoice 001.pdf" })).toHaveAttribute("aria-selected", "true");
  await expect(text(page, "Selected: inv1")).toBeVisible();
  await button(page, "Level 1").click();
  await expect(tree.getByRole("treeitem")).toHaveText(["My files(3)", "Documents(2)", "Projects(1)", "System (not selectable)"]);
});

test("Lazy trees: a folder loads its children when opened", async ({ page }) => {
  await open(page, "/lazy-trees");
  const tree = page.getByRole("tree").first();
  await tree.getByRole("treeitem", { name: "Projects", exact: true }).locator(".gfui-Tree-gutter").click();
  await expect(tree.getByRole("treeitem", { name: "Projects item 2 (load 1)" })).toBeVisible();
  await expect(text(page, "Loads: 1")).toBeVisible();
});

test("Tile grids: a click selects a tile and the small grid shows the same selection", async ({ page }) => {
  await open(page, "/tile-grids");
  const grids = page.getByRole("grid", { name: "Tile grid" });
  await grids.first().getByRole("gridcell").filter({ hasText: "Photo 4" }).first().click();
  await expect(text(page, "Selected: 1 (p4)")).toBeVisible();
  await expect(grids.nth(1).getByRole("gridcell").filter({ hasText: "Photo 4" })).toHaveAttribute("aria-selected", "true");
});

test("Embeds and media: the frame answers a message; the QR code follows the level", async ({ page }) => {
  await open(page, "/embeds");
  await expect(text(page, "Loaded: true")).toBeVisible();
  await button(page, "Send hello").click();
  await expect(text(page, "Replies: ready (from null); echo hello (from null);")).toBeVisible();
  const modules = () => page.locator(".gfui-QRCode svg").first().getAttribute("data-modules");
  const before = await modules();
  await button(page, "H").click();
  await expect(text(page, "Level: H")).toBeVisible();
  expect(Number(await modules())).toBeGreaterThan(Number(before));
});

test("Table of contents: a link focuses its heading; the tab title", async ({ page }) => {
  await open(page, "/contents");
  await page.getByRole("navigation", { name: "Table of Contents" }).getByRole("link", { name: "Markup" }).click();
  await expect(page.getByRole("heading", { name: "Markup", exact: true })).toBeFocused();
  await expect(page).toHaveTitle("Table of contents | gfui playground");
});

test("Timers, queues and listeners: named sources and the queue's result", async ({ page }) => {
  await open(page, "/timers");
  await button(page, "a + 1").click();
  await expect(text(page, "Changed: a")).toBeVisible();
  await button(page, "Add one").click();
  await expect(text(page, "Processed: extra")).toBeVisible();
  await expect(page.locator(".gfui-Toast").filter({ hasText: "All done: 1 processed" })).toBeVisible();
});

test("Focus, tone and announcements: the live region, the box and the empty state", async ({ page }) => {
  await open(page, "/focus-tone");
  await button(page, "Announce saving").click();
  await expect(page.getByRole("status").filter({ hasText: /^Saved at / })).toHaveCount(1);
  await button(page, "Open the box").click();
  await expect(page.getByRole("textbox", { name: "Name" })).toBeFocused();
  await button(page, "Close the box").click();
  await expect(button(page, "Open the box")).toBeFocused();
  await button(page, "Find something").click();
  await expect(text(page, "result 1")).toBeVisible();
});

test("Files and uploads: a picked file goes to the server as multipart", async ({ page }) => {
  await open(page, "/files");
  const form = page.locator(".gfui-Card").filter({ has: page.getByRole("heading", { name: "A form with an attachment", exact: true }) });
  await form.locator('input[type="file"]').setInputFiles({ name: "a.txt", mimeType: "text/plain", buffer: Buffer.from("hi") });
  await form.getByRole("button", { name: "Save" }).click();
  await expect(form.getByText(/^Server received: multipart\/form-data: .*"name":"a\.txt","size":2/)).toBeVisible();
});
