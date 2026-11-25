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
