// Step 23 in jsdom: Icon, Image, Avatar, Badge, ProgressBar, Spinner,
// ContentSeparator, Card, and what Text, Heading and Link gained.
import { compileModule } from "@gluefuil/compiler";
import { loadModule, resetRouter } from "@gluefuil/runtime";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { SVGProps } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import * as components from "../src/index";
import { ICON_NAMES, initials, isExternalUrl, registeredIconNames, registerIcon, textOverflow } from "../src/index";

afterEach(() => {
  cleanup();
  resetRouter();
  vi.useRealTimers();
});

function mount(markup: string) {
  const { code, diagnostics } = compileModule(markup, { format: "function" });
  expect(diagnostics).toEqual([]);
  const Main = loadModule(code, { components });
  return render(<Main />).container;
}

const one = (markup: string, selector: string) => mount(`<App>${markup}</App>`).querySelector(selector) as HTMLElement | null;
const codes = (markup: string) => compileModule(markup).diagnostics.map((d) => [d.code, d.severity]);

describe("Icon", () => {
  test("the registry has exactly the names the compiler knows (icon-names.ts)", () => {
    expect(registeredIconNames().sort()).toEqual([...ICON_NAMES].sort());
    expect(ICON_NAMES).toHaveLength(139);
  });

  test("an icon by name: an svg, hidden from screen readers", () => {
    const icon = one('<Icon name="trash"/>', ".gfui-Icon")!;
    expect(icon.tagName).toBe("svg");
    expect(icon.getAttribute("data-icon-name")).toBe("trash");
    expect(icon.getAttribute("aria-hidden")).toBe("true");
  });

  test("an unknown name shows the fallback, or nothing", () => {
    expect(one('<Icon name="{\'nope\'}" fallback="home"/>', ".gfui-Icon")!.getAttribute("data-icon-name")).toBe("home");
    expect(one("<Icon name=\"{'nope'}\"/>", ".gfui-Icon")).toBeNull();
  });

  test.each<[size: string, css: string]>([
    ["xs", "12px"],
    ["lg", "32px"],
    ["40px", "40px"],
    ["$space-4", "var(--gfui-space-4)"],
  ])("size %s", (size, css) => {
    expect(one(`<Icon name="home" size="${size}"/>`, ".gfui-Icon")!.style.getPropertyValue("--gfui-icon-size")).toBe(css);
  });

  test("clickable: a button for the mouse and the keyboard; the handler gets the pointer snapshot (step 27)", () => {
    const container = mount('<App var.args="{[]}"><Icon name="plus" onClick="(...a) => args = [...args, a.length + \':\' + a[0].button]"/><Text>{args.join(",")}</Text></App>');
    const icon = container.querySelector(".gfui-Icon")!;
    expect(icon.getAttribute("role")).toBe("button");
    expect(icon.getAttribute("tabindex")).toBe("0");
    fireEvent.click(icon, { clientX: 5, clientY: 6, detail: 1 });
    fireEvent.keyDown(icon, { key: "Enter" });
    fireEvent.keyDown(icon, { key: "x" });
    // A mouse click (button 0) and Enter (a keyboard activation: -1).
    expect(screen.getByText("1:0,1:-1")).toBeTruthy();
  });

  test("registerIcon adds a name every icon prop can use", () => {
    registerIcon("my-logo", (props: SVGProps<SVGSVGElement>) => <svg {...props} data-custom="" />);
    expect(one("<Icon name=\"{'my-logo'}\"/>", "[data-custom]")).not.toBeNull();
  });

  test("an unknown literal name is a warning (E033: an app may register it), with a suggestion", () => {
    const result = compileModule('<App><Icon name="trsh"/></App>');
    expect(result.diagnostics.map((d) => [d.code, d.severity])).toEqual([["E033", "warning"]]);
    expect(result.diagnostics[0]!.message).toContain("trash");
    expect(codes('<App><NavLink to="/" icon="nope"/></App>')).toEqual([["E033", "warning"]]);
  });
});

describe("Image", () => {
  test("src, alt, fit, lazyLoad, aspectRatio, grayscale, inline", () => {
    const img = one('<Image src="/a.png" alt="A" fit="cover" lazyLoad="true" aspectRatio="16/9" grayscale="true" inline="true"/>', ".gfui-Image")!;
    expect(img.tagName).toBe("IMG");
    expect(img.getAttribute("src")).toBe("/a.png");
    expect(img.getAttribute("alt")).toBe("A");
    expect(img.getAttribute("loading")).toBe("lazy");
    expect(img.style.aspectRatio).toBe("16 / 9");
    expect(img.style.getPropertyValue("--image-object-fit")).toBe("cover");
    expect(img.hasAttribute("data-grayscale")).toBe(true);
    expect(img.hasAttribute("data-inline")).toBe(true);
  });

  test("no src: nothing; an invalid aspect ratio is ignored", () => {
    expect(one("<Image/>", ".gfui-Image")).toBeNull();
    expect(one('<Image src="/a.png" aspectRatio="wide"/>', ".gfui-Image")!.style.aspectRatio).toBe("");
  });
});

describe("Avatar", () => {
  test.each<[name: unknown, expected: string | undefined]>([
    ["Ada Lovelace", "AL"],
    ["  ada  byron lovelace king ", "ABL"],
    ["", undefined],
    [undefined, undefined],
  ])("initials(%j) = %j", (name, expected) => {
    expect(initials(name)).toBe(expected);
  });

  test("initials without a url; the accessible label names the person", () => {
    const avatar = one('<Avatar name="Ada Lovelace"/>', ".gfui-Avatar")!;
    expect(avatar.textContent).toBe("AL");
    expect(avatar.getAttribute("aria-label")).toBe("Avatar of Ada Lovelace");
    expect(avatar.getAttribute("data-size")).toBe("sm");
  });

  test("the picture with a url; the initials when it fails to load", () => {
    const container = mount('<App><Avatar name="Ada Lovelace" url="/broken.png"/></App>');
    const img = container.querySelector(".gfui-Avatar img")!;
    expect(img.getAttribute("src")).toBe("/broken.png");
    fireEvent.error(img);
    expect(container.querySelector(".gfui-Avatar")!.textContent).toBe("AL");
  });

  test("sizes: named, or a CSS size", () => {
    expect(one('<Avatar name="A" size="lg"/>', ".gfui-Avatar")!.getAttribute("data-size")).toBe("lg");
    const custom = one('<Avatar name="A" size="48px"/>', ".gfui-Avatar")!;
    expect(custom.getAttribute("data-size")).toBe("custom");
    expect(custom.style.getPropertyValue("--gfui-avatar-size")).toBe("48px");
  });
});

describe("Badge", () => {
  test("value or children; the shape", () => {
    expect(one('<Badge value="new"/>', ".gfui-Badge")!.textContent).toBe("new");
    expect(one("<Badge>kids</Badge>", ".gfui-Badge")!.textContent).toBe("kids");
    expect(one('<Badge value="p" variant="pill"/>', ".gfui-Badge")!.getAttribute("data-shape")).toBe("pill");
    expect(one("<Badge/>", ".gfui-Badge")!.textContent).toBe(" ");
  });

  test("colorMap: a color is the background; { label, background } both; an unmapped value neither", () => {
    const container = mount(`<App var.map="{{ active: '$color-success-500', away: { label: 'black', background: '#ff0' } }}">
      <Badge value="active" colorMap="{map}"/><Badge value="away" colorMap="{map}"/><Badge value="gone" colorMap="{map}"/></App>`);
    const [active, away, gone] = [...container.querySelectorAll<HTMLElement>(".gfui-Badge")];
    expect(active!.style.getPropertyValue("--gfui-badge-bg")).toBe("var(--gfui-color-success-500)");
    expect(away!.style.getPropertyValue("--gfui-badge-bg")).toBe("#ff0");
    expect(away!.style.getPropertyValue("--gfui-badge-color")).toBe("black");
    expect(gone!.style.getPropertyValue("--gfui-badge-bg")).toBe("");
  });
});

describe("ProgressBar", () => {
  test.each<[value: string, percent: string, complete: boolean]>([
    ["0.25", "25", false],
    ["{-1}", "0", false],
    ["{2}", "100", true],
    ["1", "100", true],
  ])("value %s → %s%%", (value, percent, complete) => {
    const bar = one(`<ProgressBar value="${value}"/>`, ".gfui-ProgressBar")!;
    expect(bar.querySelector("[role=progressbar]")!.getAttribute("aria-valuenow")).toBe(percent);
    expect(bar.hasAttribute("data-complete")).toBe(complete);
  });
});

describe("Spinner", () => {
  test("shows after the delay (400 ms by default)", () => {
    vi.useFakeTimers();
    const container = mount("<App><Spinner/></App>");
    expect(container.querySelector(".gfui-Spinner")).toBeNull();
    act(() => vi.advanceTimersByTime(399));
    expect(container.querySelector(".gfui-Spinner")).toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(container.querySelector(".gfui-Spinner")!.getAttribute("role")).toBe("status");
  });

  test('delay="0" shows it at once; fullScreen wraps it in an overlay', () => {
    expect(one('<Spinner delay="0"/>', ".gfui-Spinner")).not.toBeNull();
    expect(one('<Spinner delay="0" fullScreen="true"/>', ".gfui-Spinner-fullScreen > .gfui-Spinner")).not.toBeNull();
  });
});

describe("ContentSeparator", () => {
  test("orientation, thickness, length", () => {
    const line = one('<ContentSeparator orientation="vertical" thickness="3px" length="40px"/>', ".gfui-ContentSeparator")!;
    expect(line.getAttribute("data-orientation")).toBe("vertical");
    expect(line.style.getPropertyValue("--gfui-separator-thickness")).toBe("3px");
    expect(line.style.getPropertyValue("--gfui-separator-length")).toBe("40px");
    expect(line.hasAttribute("data-length")).toBe(true);
    expect(one("<ContentSeparator/>", ".gfui-ContentSeparator")!.getAttribute("data-orientation")).toBe("horizontal");
  });

  test("a literal thickness is checked as a size (E031)", () => {
    expect(codes('<App><ContentSeparator thickness="thick"/></App>')).toEqual([["E031", "error"]]);
  });
});

describe("Card", () => {
  test("a Stack that is a surface, one level below its container (the App's lone VStack is a wrapper: level 0)", () => {
    const card = one("<VStack><Card><Text>a</Text><Text>b</Text></Card><Text>c</Text></VStack>", ".gfui-Card")!;
    expect(card.classList.contains("gfui-Stack")).toBe(true);
    expect(card.hasAttribute("data-surface")).toBe(true);
    expect(card.getAttribute("data-level")).toBe("1");
    expect(card.getAttribute("data-orientation")).toBe("vertical");
  });

  test("the title row: an h2 title, the subtitle, and an avatar with the title's initials", () => {
    const card = one('<Card title="Ada Lovelace" subtitle="Analyst" showAvatar="true"><Text>body</Text></Card>', ".gfui-Card")!;
    const header = card.firstElementChild!;
    expect(header.className).toBe("gfui-Card-header");
    expect(header.querySelector(".gfui-Avatar")!.textContent).toBe("AL");
    expect(header.querySelector("h2")!.textContent).toBe("Ada Lovelace");
    expect(header.querySelector(".gfui-Text")!.textContent).toBe("Analyst");
    expect(one('<Card title="T"/>', ".gfui-Card .gfui-Avatar")).toBeNull();
    expect(one('<Card title="T" avatarUrl="/a.png"/>', ".gfui-Card .gfui-Avatar img")).not.toBeNull();
  });

  test("with a title row, a lone child is not a wrapper: it goes one level deeper", () => {
    const level = (markup: string) => [one(markup, ".gfui-Card")!, one(markup, ".gfui-Card .gfui-Stack")!].map((e) => Number(e.getAttribute("data-level")));
    expect(level('<Card title="T"><VStack><Text>x</Text></VStack></Card>')).toEqual([0, 1]);
    expect(level("<Card><VStack><Text>x</Text></VStack></Card>")).toEqual([0, 0]);
  });

  test("linkTo makes the title a link", () => {
    expect(one('<Card title="T" linkTo="/people/1"/>', ".gfui-Card a.gfui-Link")!.getAttribute("href")).toBe("#/people/1");
  });

  test("click and double click: the second click of a double click is not a click", () => {
    const container = mount('<App var.log=""><Card onClick="log += \'c\'" onDoubleClick="log += \'d\'"><Text>{log}</Text></Card></App>');
    const card = container.querySelector(".gfui-Card")!;
    expect(card.hasAttribute("data-clickable")).toBe(true);
    fireEvent.click(card, { detail: 1 });
    fireEvent.click(card, { detail: 2 });
    fireEvent.doubleClick(card);
    expect(card.textContent).toBe("cd");
  });

  test("the scroll methods", () => {
    const scrollTo = vi.fn();
    Element.prototype.scrollTo = scrollTo;
    const container = mount('<App><Card id="card" height="40px"><Text>x</Text></Card><Button label="go" onClick="card.scrollToBottom(\'smooth\'); card.scrollToTop()"/></App>');
    fireEvent.click(screen.getByText("go"));
    expect(scrollTo.mock.calls.map(([options]) => options)).toEqual([{ top: 0, behavior: "smooth" }, { top: 0, behavior: "auto" }]);
    expect(container.querySelector(".gfui-Card")).not.toBeNull();
  });
});

describe("Link (step 23 additions)", () => {
  test.each<[to: string, external: boolean]>([
    ["/route", false],
    ["route", false],
    ["https://e.com", true],
    ["mailto:a@b.c", true],
    ["//cdn.example.com/x", true],
  ])("isExternalUrl(%j) = %s", (to, external) => {
    expect(isExternalUrl(to)).toBe(external);
  });

  test("an external URL is the href as given; a target opens a new context, with rel", () => {
    const link = one('<Link to="https://e.com" target="_blank">e</Link>', ".gfui-Link")!;
    expect(link.getAttribute("href")).toBe("https://e.com");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  test("click runs before the navigation; enabled=false neither navigates nor clicks", async () => {
    const container = mount(`<App var.n="{0}"><Link to="/a" onClick="n++">go</Link><Link to="/b" enabled="false" onClick="n++">no</Link><Text>{n} {$pathname}</Text></App>`);
    const [go, no] = [...container.querySelectorAll(".gfui-Link")];
    expect(no!.hasAttribute("href")).toBe(false);
    expect(no!.getAttribute("aria-disabled")).toBe("true");
    await act(async () => fireEvent.click(no!));
    expect(screen.getByText("0 /")).toBeTruthy();
    await act(async () => fireEvent.click(go!));
    expect(screen.getByText("1 /a")).toBeTruthy();
  });

  test("without `to`: a clickable button-like link", () => {
    const link = one('<Link onClick="x = 1" var.x="{0}">act</Link>', ".gfui-Link")!;
    expect(link.hasAttribute("href")).toBe(false);
    expect(link.getAttribute("role")).toBe("button");
  });

  test("icon, active, noIndicator", () => {
    const link = one('<Link to="/" icon="home" active="true" noIndicator="true">Home</Link>', ".gfui-Link")!;
    expect(link.querySelector(".gfui-Link-icon")!.tagName).toBe("svg");
    expect(link.querySelector(".gfui-Link-text")!.textContent).toBe("Home");
    expect(link.hasAttribute("data-active")).toBe(true);
    expect(link.hasAttribute("data-no-indicator")).toBe(true);
  });
});

describe("text overflow (Text, Heading, Link)", () => {
  test.each<[props: Record<string, unknown>, attributes: Record<string, string>, clamp?: number]>([
    [{}, {}],
    [{ maxLines: 1 }, { "data-overflow": "truncate" }],
    [{ maxLines: "3" }, { "data-overflow": "clamp" }, 3],
    [{ maxLines: 0 }, {}],
    [{ overflowMode: "ellipsis" }, { "data-overflow": "truncate" }],
    [{ overflowMode: "ellipsis", maxLines: 2, ellipses: false }, { "data-overflow": "clamp", "data-clip": "" }, 2],
    [{ overflowMode: "none", maxLines: 2 }, { "data-overflow": "none" }],
    [{ overflowMode: "scroll" }, { "data-overflow": "scroll" }],
    [{ overflowMode: "flow", maxLines: 2 }, { "data-overflow": "flow" }],
    [{ inline: true, maxLines: 2, breakMode: "word" }, { "data-inline": "", "data-break": "word" }],
    [{ breakMode: "anywhere", preserveLinebreaks: "true" }, { "data-break": "anywhere", "data-preserve-linebreaks": "" }],
    [{ breakMode: "nope" }, {}],
  ])("%j", (props, attributes, clamp) => {
    const result = textOverflow(props);
    expect(result.attributes).toEqual(attributes);
    expect(result.style?.WebkitLineClamp).toBe(clamp);
  });

  test("on the elements", () => {
    expect(one('<Text overflowMode="scroll">x</Text>', ".gfui-Text")!.getAttribute("data-overflow")).toBe("scroll");
    expect(one('<H2 maxLines="1">x</H2>', ".gfui-Heading")!.getAttribute("data-overflow")).toBe("truncate");
    expect(one('<Link to="/" breakMode="keep">x</Link>', ".gfui-Link")!.getAttribute("data-break")).toBe("keep");
  });

  test("preserveLinebreaks keeps the value's line breaks", () => {
    const text = one("<Text preserveLinebreaks=\"true\" value=\"{'a\\nb'}\"/>", ".gfui-Text")!;
    expect(text.textContent).toBe("a\nb");
    expect(text.hasAttribute("data-preserve-linebreaks")).toBe(true);
  });
});

describe("Text and Heading APIs; Heading anchors", () => {
  test("hasOverflow() compares the scroll size with the box", () => {
    const container = mount('<App var.r=""><Text id="t" maxLines="1">long</Text><Button label="check" onClick="r = String(t.hasOverflow())"/><H3>{r}</H3></App>');
    const text = container.querySelector(".gfui-Text")!;
    Object.defineProperty(text, "scrollWidth", { value: 200 });
    Object.defineProperty(text, "clientWidth", { value: 100 });
    fireEvent.click(screen.getByText("check"));
    expect(container.querySelector("h3")!.textContent).toBe("true");
  });

  test("scrollIntoView() on a heading", () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    mount('<App><H2 id="h">Section</H2><Button label="go" onClick="h.scrollIntoView()"/></App>');
    fireEvent.click(screen.getByText("go"));
    expect(scroll).toHaveBeenCalledTimes(1);
  });

  test("showAnchor: an id from the text and a # link that scrolls instead of changing the route", () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    const heading = one('<H2 showAnchor="true">Getting Started, now!</H2>', ".gfui-Heading")!;
    expect(heading.id).toBe("getting-started-now");
    const anchor = heading.querySelector(".gfui-Heading-anchor")!;
    expect(anchor.getAttribute("href")).toBe("#getting-started-now");
    fireEvent.click(anchor);
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(window.location.hash).not.toBe("#getting-started-now");
  });

  test("contextMenu replaces the browser's menu; the handler gets a frozen pointer snapshot, not the DOM event (step 27)", () => {
    const container = mount(
      '<App var.n="{-1}"><Text onContextMenu="(...a) => n = a.length + \':\' + a[0].clientX + \':\' + a[0].clientY + \':\' + a[0].button + \':\' + Object.isFrozen(a[0]) + \':\' + (a[0].target === undefined)">t</Text><H4>{n}</H4></App>',
    );
    const event = fireEvent.contextMenu(container.querySelector(".gfui-Text")!, { clientX: 30, clientY: 40, button: 2 });
    expect(event).toBe(false);
    expect(container.querySelector("h4")!.textContent).toBe("1:30:40:2:true:true");
  });
});
