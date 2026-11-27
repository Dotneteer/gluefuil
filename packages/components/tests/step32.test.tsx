// Step 32 in jsdom: QRCode (decoded with jsQR), IFrame, MediaPlayer,
// TableOfContents and Bookmark (also prerendered and taken over), SkipLink,
// LiveRegion, FocusScope, Logo, NoResult, ToneSwitch, ToneChangerButton,
// PageMetaTitle, Redirect, ChangeListener, Timer, Queue, MessageListener,
// AppState. Scrolling, real focus order and media playback are E2E tests
// (e2e/step32.spec.ts). Design: .ai/plan/poc-32-remaining.md
import { compileModule } from "@gluefuil/compiler";
import { currentLocation, loadModule, mountApp, resetOverlayState, resetRouter, resetThemeState, setErrorReporter, toasts } from "@gluefuil/runtime";
import { renderStatic, resetServerState, takeServerLoads } from "@gluefuil/runtime/server";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import jsQR from "jsqr";
import { StrictMode, type ComponentType } from "react";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import * as components from "../src/index";
import { qrPath } from "../src/media";

let errors: unknown[];
let restore: () => void;
beforeEach(() => {
  errors = [];
  restore = setErrorReporter((error) => errors.push(error));
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  cleanup();
  restore();
  resetRouter();
  resetOverlayState();
  resetThemeState();
});

function compile(markup: string) {
  return compileModule(markup, { format: "function" });
}
function compiled(markup: string): ComponentType {
  const { code, diagnostics } = compile(markup);
  expect(diagnostics.filter((d) => d.severity !== "warning")).toEqual([]);
  return loadModule(code, { components }) as ComponentType;
}
const show = (markup: string) => {
  const Main = compiled(markup);
  return render(<Main />);
};
const settle = (ms = 0) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
const click = (label: string) => act(async () => fireEvent.click(screen.getByRole("button", { name: label })));
const text = (prefix: string) => [...document.querySelectorAll(".gfui-Text")].find((e) => e.textContent?.startsWith(prefix))?.textContent?.slice(prefix.length);

// --- QRCode ------------------------------------------------------------------------

/** Rasterizes a QR path (module rectangles) with a 4-module quiet zone, `scale` px a module. */
function rasterize(value: string, level: "L" | "M" | "Q" | "H", scale = 4) {
  const { d, size } = qrPath(value, level);
  const n = (size + 8) * scale;
  const pixels = new Uint8ClampedArray(n * n * 4).fill(255);
  for (const [, x, y, w] of d.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) {
    for (let dy = 0; dy < scale; dy++) {
      for (let dx = 0; dx < Number(w) * scale; dx++) {
        const px = (Number(x) + 4) * scale + dx;
        const py = (Number(y) + 4) * scale + dy;
        const i = (py * n + px) * 4;
        pixels[i] = pixels[i + 1] = pixels[i + 2] = 0;
      }
    }
  }
  return { pixels, n, size };
}

describe("QRCode", () => {
  test.each([
    ["https://example.com/orders/42", "L"],
    ["https://example.com/orders/42", "H"],
    ["0123456789".repeat(12), "M"],
    ["Grüße, 世界 🎉", "Q"],
  ] as const)("%s at %s decodes back to the value", (value, level) => {
    const { pixels, n } = rasterize(value, level);
    expect(jsQR(pixels, n, n)?.data).toBe(value);
  });

  test("one path, a version by length and level; title; size; colors", () => {
    show(`<App><QRCode value="hi" title="A greeting" size="120" color="red" backgroundColor="#eee"/><QRCode value="hi" level="H"/></App>`);
    const [first, second] = [...document.querySelectorAll(".gfui-QRCode")];
    const svg = first!.querySelector("svg")!;
    expect(svg.querySelectorAll("path")).toHaveLength(1);
    expect(svg.getAttribute("data-modules")).toBe("21");
    expect(screen.getByRole("img", { name: "A greeting" })).toBe(svg);
    expect(svg.querySelector("title")?.textContent).toBe("A greeting");
    expect((first as HTMLElement).style.getPropertyValue("--gfui-qr-size")).toBe("120px");
    expect((first as HTMLElement).style.getPropertyValue("--gfui-qr-color")).toBe("red");
    expect((first as HTMLElement).style.getPropertyValue("--gfui-qr-bg")).toBe("#eee");
    expect(second!.querySelector("svg")!.getAttribute("aria-label")).toBe("QR code");
  });

  test("a value too long for a QR code renders a placeholder; init fires once", async () => {
    show(`<App var.inits="{0}"><QRCode value="${"x".repeat(3000)}" onInit="inits++"/><Text>inits: {inits}</Text></App>`);
    expect(screen.getByRole("img", { name: "The value is too long for a QR code" })).toBeTruthy();
    await settle();
    expect(text("inits: ")).toBe("1");
  });

  test("prerendered: the static HTML has the code", () => {
    const { html } = renderStatic(compiled(`<App><QRCode value="hello"/></App>`));
    expect(html).toMatch(/<svg viewBox="0 0 21 21"[^>]*><path d="M0 0h7v1h-7z/);
  });
});

// --- IFrame and MediaPlayer ----------------------------------------------------------

describe("IFrame", () => {
  test("the native element with its attributes; load fires; postMessage reaches the frame", async () => {
    show(`<App var.loaded="{false}">
      <IFrame id="frame" srcdoc="<p>hi</p>" name="embed" sandbox="allow-scripts" referrerPolicy="no-referrer" allow="fullscreen" onLoad="loaded = true"/>
      <Button label="Send" onClick="frame.postMessage({ n: 1 }, 'https://x.test')"/>
      <Text>loaded: {loaded}</Text>
    </App>`);
    const frame = document.querySelector("iframe")!;
    expect(frame.getAttribute("srcdoc")).toBe("<p>hi</p>");
    expect(frame.getAttribute("sandbox")).toBe("allow-scripts");
    expect(frame.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(frame.getAttribute("title")).toBe("embed");
    await act(async () => fireEvent.load(frame));
    expect(text("loaded: ")).toBe("true");
    const post = vi.spyOn(frame.contentWindow!, "postMessage");
    await click("Send");
    expect(post).toHaveBeenCalledWith({ n: 1 }, "https://x.test");
  });

  test.each(["getContentWindow", "getContentDocument"])("%s is a compile error that says why", (member) => {
    const { diagnostics } = compile(`<App><IFrame id="frame"/><Button onClick="frame.${member}()"/></App>`);
    expect(diagnostics.map((d) => `${d.code}: ${d.message}`)).toEqual([expect.stringMatching(new RegExp(`^C015: 'frame' \\(IFrame\\) has no member '${member}'\\. gfui gives script no (window|document) object`))]);
  });
});

describe("MediaPlayer", () => {
  test("video by default with controls; audio by kind; attributes", () => {
    show(`<App><MediaPlayer src="/a.mp4" poster="/p.png" loop="true" muted="true" preload="metadata"/><MediaPlayer kind="audio" src="/a.mp3" controls="false"/></App>`);
    const video = document.querySelector("video")!;
    expect(video.getAttribute("src")).toBe("/a.mp4");
    expect(video.getAttribute("poster")).toBe("/p.png");
    expect(video.hasAttribute("controls")).toBe(true);
    expect(video.hasAttribute("loop")).toBe(true);
    expect(video.getAttribute("preload")).toBe("metadata");
    const audio = document.querySelector("audio")!;
    expect(audio.hasAttribute("controls")).toBe(false);
  });

  test("events get a frozen state snapshot, never the DOM event; paused and ended are reactive", async () => {
    show(`<App var.log="">
      <MediaPlayer id="player" src="/a.mp4" onPlay="s => log += 'play@' + s.currentTime + (Object.isFrozen(s) ? ' frozen' : '') + (s.target === undefined ? ' plain;' : ';')" onEnded="s => log += 'end;'"/>
      <Text>log: {log}</Text>
      <Text>state: {player.paused} {player.ended}</Text>
    </App>`);
    const video = document.querySelector("video")!;
    expect(text("state: ")).toBe("true false");
    await act(async () => fireEvent.play(video));
    expect(text("log: ")).toBe("play@0 frozen plain;");
    expect(text("state: ")).toBe("false false");
    await act(async () => fireEvent.ended(video));
    expect(text("state: ")).toBe("true true");
    expect(text("log: ")).toBe("play@0 frozen plain;end;");
  });
});

// --- TableOfContents and Bookmark ----------------------------------------------------------

const PAGE = `<App>
  <TableOfContents/>
  <H1>Guide</H1>
  <H2>Install</H2>
  <Text>…</Text>
  <H3>From npm</H3>
  <Bookmark id="faq" title="FAQ" level="2"><Text>Questions</Text></Bookmark>
  <H2 omitFromToc="true">Hidden</H2>
  <H4>Deep</H4>
</App>`;

const tocLinks = (root: ParentNode = document) =>
  [...root.querySelectorAll<HTMLAnchorElement>(".gfui-TableOfContents a")].map((a) => `${a.dataset.level}:${a.textContent}#${a.getAttribute("href")!.slice(1)}`);

describe("TableOfContents and Bookmark", () => {
  test("lists the headings and bookmarks in document order, with levels and anchors", () => {
    show(PAGE);
    expect(tocLinks()).toEqual(["1:Guide#guide", "2:Install#install", "3:From npm#from-npm", "2:FAQ#faq", "4:Deep#deep"]);
    expect(document.getElementById("faq")!.textContent).toBe("Questions");
    expect(screen.getByRole("navigation", { name: "Table of Contents" })).toBeTruthy();
  });

  test("maxHeadingLevel and omitH1", () => {
    show(PAGE.replace("<TableOfContents/>", `<TableOfContents maxHeadingLevel="2" omitH1="true"/>`));
    expect(tocLinks()).toEqual(["2:Install#install", "2:FAQ#faq"]);
  });

  test("headings that come and go follow (when)", async () => {
    show(`<App var.more="{false}"><TableOfContents/><H2>One</H2><H2 when="{more}">Two</H2><Button label="More" onClick="more = !more"/></App>`);
    expect(tocLinks()).toEqual(["2:One#one"]);
    await click("More");
    expect(tocLinks()).toEqual(["2:One#one", "2:Two#two"]);
    await click("More");
    expect(tocLinks()).toEqual(["2:One#one"]);
  });

  test("a click scrolls to the heading, moves focus there and marks the item", async () => {
    show(PAGE.replace("<TableOfContents/>", `<TableOfContents smoothScrolling="true"/>`));
    const link = screen.getByRole("link", { name: "From npm" });
    await act(async () => fireEvent.click(link));
    const heading = document.getElementById("from-npm")!;
    expect(heading.scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
    expect(document.activeElement).toBe(heading);
    expect(heading.getAttribute("tabindex")).toBe("-1");
    expect(link.getAttribute("aria-current")).toBe("location");
  });

  test("Bookmark's scrollIntoView; a bookmark without a title uses its text, then its id", async () => {
    show(`<App><TableOfContents/><Bookmark id="a"/><Bookmark id="b">Bee</Bookmark><Button label="Go" onClick="a.scrollIntoView()"/></App>`);
    expect(tocLinks()).toEqual(["1:a#a", "1:Bee#b"]);
    await click("Go");
    expect(document.getElementById("a")!.scrollIntoView).toHaveBeenCalled();
  });

  test("prerendered: the first pass asks for another; the second lists every heading (also those after it)", () => {
    const Main = compiled(PAGE);
    resetServerState();
    const first = renderStatic(<Main />);
    expect(tocLinks(Object.assign(document.createElement("div"), { innerHTML: first.html }))).toEqual([]);
    expect(takeServerLoads()).toHaveLength(1);
    resetServerState();
    const second = renderStatic(<Main />);
    expect(takeServerLoads()).toHaveLength(0);
    expect(tocLinks(Object.assign(document.createElement("div"), { innerHTML: second.html }))).toEqual(["1:Guide#guide", "2:Install#install", "3:From npm#from-npm", "2:FAQ#faq", "4:Deep#deep"]);
  });

  test("takeover keeps the prerendered list without a mismatch, then follows the live headings", async () => {
    const Main = compiled(PAGE);
    resetServerState();
    renderStatic(<Main />);
    takeServerLoads();
    resetServerState();
    const { html, attributes } = renderStatic(<Main />);
    const container = document.createElement("div");
    document.body.appendChild(container);
    container.innerHTML = html;
    for (const [name, value] of Object.entries(attributes)) container.setAttribute(name, value);
    const links = [...container.querySelectorAll(".gfui-TableOfContents a")];
    const recoverable: unknown[] = [];
    let root: Root | undefined;
    await act(async () => {
      root = mountApp(container, <StrictMode><Main /></StrictMode>, { onRecoverableError: (e) => recoverable.push(e) });
    });
    expect(recoverable).toEqual([]);
    expect(tocLinks(container)).toEqual(["1:Guide#guide", "2:Install#install", "3:From npm#from-npm", "2:FAQ#faq", "4:Deep#deep"]);
    // The same nodes: the live list reuses them.
    expect([...container.querySelectorAll(".gfui-TableOfContents a")]).toEqual(links);
    act(() => root!.unmount());
    container.remove();
  });
});

// --- SkipLink, LiveRegion, FocusScope ---------------------------------------------------------

describe("SkipLink, LiveRegion, FocusScope", () => {
  test("SkipLink moves focus to the main region's first focusable element", async () => {
    show(`<App><SkipLink/><Button label="Inside"/></App>`);
    const link = screen.getByRole("link", { name: "Skip to main content" });
    expect(link.getAttribute("href")).toBe("#main");
    await act(async () => fireEvent.click(link));
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Inside" }));
  });

  test("SkipLink to an id without focusable content focuses the target itself", async () => {
    show(`<App><SkipLink target="faq" label="Skip"/><Bookmark id="faq">FAQ</Bookmark></App>`);
    await act(async () => fireEvent.click(screen.getByRole("link", { name: "Skip" })));
    expect(document.activeElement).toBe(document.getElementById("faq"));
  });

  test("LiveRegion: polite as a status, assertive as an alert; the message follows", async () => {
    show(`<App var.msg="Saved"><LiveRegion message="{msg}"/><LiveRegion politeness="assertive" message="Failed"/><Button label="Change" onClick="msg = 'Saved again'"/></App>`);
    const status = screen.getByRole("status");
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(status.textContent).toBe("Saved");
    expect(screen.getByRole("alert").getAttribute("aria-live")).toBe("assertive");
    await click("Change");
    expect(status.textContent).toBe("Saved again");
  });

  test("FocusScope: Tab cycles inside; autoFocus; focus returns when it unmounts", async () => {
    show(`<App var.open="{false}">
      <Button label="Open" onClick="open = true"/>
      <FocusScope when="{open}" autoFocus="true">
        <Button label="First"/>
        <Button label="Last" onClick="open = false"/>
      </FocusScope>
    </App>`);
    const opener = screen.getByRole("button", { name: "Open" });
    opener.focus();
    await click("Open");
    const first = screen.getByRole("button", { name: "First" });
    const last = screen.getByRole("button", { name: "Last" });
    expect(document.activeElement).toBe(first);
    last.focus();
    fireEvent.keyDown(last, { key: "Tab" });
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
    await act(async () => fireEvent.click(last));
    expect(document.activeElement).toBe(opener);
  });
});

// --- Logo, NoResult, ToneSwitch, ToneChangerButton --------------------------------------------

describe("Logo, NoResult, ToneSwitch, ToneChangerButton", () => {
  test("Logo shows the App's logo for the tone; nothing without one", () => {
    show(`<App logo="/l.svg" logo-dark="/d.svg"><Logo alt="Shop"/></App>`);
    expect(screen.getByRole("img", { name: "Shop" }).getAttribute("src")).toBe("/l.svg");
    cleanup();
    show(`<App><Logo/></App>`);
    expect(document.querySelector(".gfui-Logo")).toBeNull();
  });

  test("NoResult: the icon and the label; hideIcon", () => {
    show(`<App><NoResult label="Nothing here"/><NoResult label="Bare" hideIcon="true"/></App>`);
    const [a, b] = [...document.querySelectorAll(".gfui-NoResult")];
    expect(a!.querySelector(".gfui-Icon")?.getAttribute("data-icon-name")).toBe("noresult");
    expect(a!.textContent).toBe("Nothing here");
    expect(b!.querySelector(".gfui-Icon")).toBeNull();
  });

  test("ToneSwitch switches the App's tone and reports it", async () => {
    show(`<App var.log=""><ToneSwitch onDidChange="t => log += t + ';'"/><Text>log: {log}</Text></App>`);
    const toggle = screen.getByRole("switch", { name: "Dark mode" });
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    await act(async () => fireEvent.click(toggle));
    expect(document.querySelector(".gfui-App")!.getAttribute("data-tone")).toBe("dark");
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    expect(toggle.querySelector(".gfui-Icon")!.getAttribute("data-icon-name")).toBe("moon");
    await act(async () => fireEvent.click(toggle));
    expect(text("log: ")).toBe("dark;light;");
  });

  test("ToneChangerButton switches the tone; using it is a deprecation warning", async () => {
    const markup = `<App var.log=""><ToneChangerButton onClick="t => log += t"/><Text>log: {log}</Text></App>`;
    expect(compile(markup).diagnostics.map((d) => `${d.severity} ${d.code}`)).toEqual(["warning E024"]);
    show(markup);
    await click("Toggle color mode");
    expect(document.querySelector(".gfui-App")!.getAttribute("data-tone")).toBe("dark");
    expect(text("log: ")).toBe("dark");
  });
});

// --- PageMetaTitle, Redirect ----------------------------------------------------------------

describe("PageMetaTitle and Redirect", () => {
  test("PageMetaTitle sets the tab's title with the App's name; noSuffix; the text inside", async () => {
    show(`<App name="Shop" var.n="{3}"><PageMetaTitle value="Orders ({n})"/><Button label="More" onClick="n++"/></App>`);
    expect(document.title).toBe("Orders (3) | Shop");
    await click("More");
    expect(document.title).toBe("Orders (4) | Shop");
    cleanup();
    show(`<App name="Shop"><PageMetaTitle noSuffix="true">Plain</PageMetaTitle></App>`);
    expect(document.title).toBe("Plain");
  });

  test("a static render returns the title for <title>", () => {
    const result = renderStatic(compiled(`<App name="Shop"><PageMetaTitle value="Home"/></App>`));
    expect(result.title).toBe("Home | Shop");
    expect(result.html).not.toContain("<title");
    expect(renderStatic(compiled(`<App/>`)).title).toBeUndefined();
  });

  test("Redirect navigates when it becomes visible, through willNavigate; replace", async () => {
    show(`<App var.go="{false}" var.log="" onWillNavigate="to => log += to + ';'">
      <Pages>
        <Page url="/"><Button label="Go" onClick="go = true"/><Redirect when="{go}" to="/done" replace="true"/></Page>
        <Page url="/done"><Text>done</Text></Page>
      </Pages>
      <Text>log: {log}</Text>
    </App>`);
    expect(currentLocation().pathname).toBe("/");
    const before = history.length;
    await click("Go");
    await settle();
    expect(currentLocation().pathname).toBe("/done");
    expect(text("log: ")).toBe("/done;");
    expect(history.length).toBe(before);
    expect(screen.getByText("done")).toBeTruthy();
  });
});

// --- ChangeListener, Timer, Queue, MessageListener -------------------------------------------------

describe("ChangeListener", () => {
  test("fires on a structural change, not on the first value or an equal one", async () => {
    show(`<App var.v="{{ a: 1 }}" var.log="">
      <ChangeListener listenTo="{v}" onDidChange="c => log += c.prevValue.a + '>' + c.newValue.a + ';'"/>
      <Button label="Same" onClick="v = { a: v.a }"/>
      <Button label="Next" onClick="v = { a: v.a + 1 }"/>
      <Text>log: {log}</Text>
    </App>`);
    await settle();
    expect(text("log: ")).toBe("");
    await click("Same");
    expect(text("log: ")).toBe("");
    await click("Next");
    await click("Next");
    expect(text("log: ")).toBe("1>2;2>3;");
  });

  test("listenToSources: changedSources and changes", async () => {
    show(`<App var.a="{1}" var.b="{'x'}" var.log="">
      <ChangeListener listenToSources="{{ a, b }}" onDidChange="c => log += c.changedSources.join(',') + ':' + c.changes.b.newValue + ';'"/>
      <Button label="B" onClick="b = 'y'"/>
      <Text>log: {log}</Text>
    </App>`);
    await click("B");
    expect(text("log: ")).toBe("b:y;");
  });

  test("debounceWaitInMs fires once, after the value is still", async () => {
    show(`<App var.n="{0}" var.log="">
      <ChangeListener listenTo="{n}" debounceWaitInMs="40" onDidChange="c => log += c.newValue + ';'"/>
      <Button label="Up" onClick="n++"/>
      <Text>log: {log}</Text>
    </App>`);
    await click("Up");
    await click("Up");
    await click("Up");
    expect(text("log: ")).toBe("");
    await settle(80);
    expect(text("log: ")).toBe("3;");
  });

  test("throttleWaitInMs fires at once, then at most once per period (with the last value)", async () => {
    show(`<App var.n="{0}" var.log="">
      <ChangeListener listenTo="{n}" throttleWaitInMs="60" onDidChange="c => log += c.newValue + ';'"/>
      <Button label="Up" onClick="n++"/>
      <Text>log: {log}</Text>
    </App>`);
    await click("Up");
    await click("Up");
    await click("Up");
    expect(text("log: ")).toBe("1;");
    await settle(100);
    expect(text("log: ")).toBe("1;3;");
  });
});

describe("Timer", () => {
  test("ticks every interval; once; pause and resume; disabled does nothing", async () => {
    show(`<App var.n="{0}" var.m="{0}" var.z="{0}">
      <Timer id="t" interval="20" onTick="n++"/>
      <Timer interval="10" once="true" onTick="m++"/>
      <Timer interval="10" enabled="false" onTick="z++"/>
      <Button label="Pause" onClick="t.pause()"/>
      <Text>ticks: {n} {m} {z} {t.isPaused()}</Text>
    </App>`);
    await settle(110);
    const [n, m, z] = text("ticks: ")!.split(" ").map(Number);
    expect(n).toBeGreaterThanOrEqual(3);
    expect(m).toBe(1);
    expect(z).toBe(0);
    await click("Pause");
    expect(text("ticks: ")!.endsWith("true")).toBe(true);
    const paused = Number(text("ticks: ")!.split(" ")[0]);
    await settle(80);
    expect(Number(text("ticks: ")!.split(" ")[0])).toBe(paused);
  });

  test("a tick is skipped while the previous handler runs; initialDelay delays the first", async () => {
    show(`<App var.n="{0}"><Timer interval="10" initialDelay="40" onTick="n++; delay(60)"/><Text>ticks: {n}</Text></App>`);
    await settle(35);
    expect(text("ticks: ")).toBe("0");
    await settle(100);
    const n = Number(text("ticks: "));
    // About 140 ms in, 100 of them ticking, each tick held for 60 ms: two ticks, not ten.
    expect(n).toBeGreaterThanOrEqual(1);
    expect(n).toBeLessThanOrEqual(3);
  });
});

describe("Queue", () => {
  test("processes in order; willProcess false skips; complete; the length is reactive", async () => {
    show(`<App var.done="{[]}" var.completes="{0}">
      <Queue id="jobs"
        onWillProcess="p => p.item !== 2"
        onProcess="p => { delay(5); done = [...done, p.item]; return p.item * 10 }"
        onDidProcess="p => done = [...done, 'r' + p.processItemContext.processResult]"
        onComplete="completes++"/>
      <Button label="Add" onClick="jobs.enqueueItems([1, 2, 3])"/>
      <Text>done: {done.join(',')} / {completes} / {jobs.getQueueLength()}</Text>
    </App>`);
    await click("Add");
    expect(text("done: ")!.endsWith(" / 0 / 2") || text("done: ")!.endsWith(" / 0 / 3")).toBe(true);
    await settle(60);
    expect(text("done: ")).toBe("1,r10,3,r30 / 1 / 0");
  });

  test("a thrown error goes to processError (false hides it); the item records it", async () => {
    show(`<App var.log="">
      <Queue id="jobs"
        onProcess="p => { if (p.item === 'bad') throw 'Conflict'; log += 'ok:' + p.item + ';' }"
        onProcessError="(e, p) => { log += 'err:' + e.message + ':' + p.item + ';'; return false }"/>
      <Button label="Add" onClick="jobs.enqueueItem('a'); jobs.enqueueItem('bad'); jobs.enqueueItem('b')"/>
      <Text>log: {log}</Text>
      <Text>statuses: {jobs.getQueuedItems().map(i => i.status).join(',')}</Text>
    </App>`);
    await click("Add");
    await settle(30);
    expect(text("log: ")).toBe("ok:a;err:Conflict:bad;ok:b;");
    expect(text("statuses: ")).toBe("completed,error,completed");
    expect(errors).toEqual([]);
  });

  test("an error without processError is reported and shown; clearAfterFinish empties the list", async () => {
    show(`<App>
      <Queue id="jobs" clearAfterFinish="true" onProcess="p => { throw 'Nope' }"/>
      <Button label="Add" onClick="jobs.enqueueItem(1)"/>
      <Text>items: {jobs.getQueuedItems().length}</Text>
    </App>`);
    await click("Add");
    await settle(30);
    expect(errors).toHaveLength(1);
    expect(toasts.get().map((t) => `${t.kind}:${t.message}`)).toEqual(["error:Nope"]);
    expect(text("items: ")).toBe("0");
  });

  test("progressFeedback shows as a toast while processing; resultFeedback replaces it at the end", async () => {
    show(`<App>
      <Queue id="jobs" onProcess="p => delay(20)">
        <property name="progressFeedback"><Text>Progress {$completedItems.length}/{$queuedItems.length}</Text></property>
        <property name="resultFeedback"><Text>Finished {$completedItems.length}</Text></property>
      </Queue>
      <Button label="Add" onClick="jobs.enqueueItems(['a', 'b'])"/>
    </App>`);
    await click("Add");
    await settle(5);
    expect(toasts.get().map((t) => t.kind)).toEqual(["loading"]);
    expect(toasts.get()[0]!.content).toBeTypeOf("function");
    await settle(80);
    const list = toasts.get();
    expect(list.map((t) => t.kind)).toEqual(["success"]);
    const shown = render(<>{list[0]!.content!() as never}</>);
    expect(shown.container.textContent).toBe("Finished 2");
  });
});

describe("MessageListener", () => {
  test("messageReceived gets the data and a frozen { data, origin }, not the event; children render", async () => {
    show(`<App var.log="">
      <MessageListener onMessageReceived="(data, m) => log += data.n + '|' + m.origin + '|' + Object.isFrozen(m) + '|' + (m.source === undefined)">
        <Text>inside</Text>
      </MessageListener>
      <Text>log: {log}</Text>
    </App>`);
    expect(screen.getByText("inside")).toBeTruthy();
    await act(async () => {
      window.dispatchEvent(new MessageEvent("message", { data: { n: 7 }, origin: "https://other.test", source: window }));
    });
    expect(text("log: ")).toBe("7|https://other.test|true|true");
  });
});

describe("AppState", () => {
  test("is E032 with a pointer to reactive globals", () => {
    const { diagnostics } = compile(`<App><AppState id="s"/></App>`);
    expect(diagnostics.map((d) => `${d.code}: ${d.message}`)).toEqual([expect.stringMatching(/^E032: 'AppState' is not a component any more: declare a reactive global/)]);
  });
});
