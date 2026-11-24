// Steps 19D–19E: the layout system in jsdom. Which level each container gets
// (the nesting, the wrapper rule, Pages and Items, user components, density,
// bars), what the layout props become, and the rule that every spacing value
// is a multiple of space-base. The CSS that turns levels into gaps runs only
// in a browser: e2e/layout.spec.ts measures it. See .ai/plan/poc-19d-layout.md.
import { compileModule } from "@patchfuil/compiler";
import { loadModule } from "@patchfuil/runtime";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import * as components from "../src/index";
import { layoutStyle, type LayoutContextValue } from "../src/layout";
import { componentMetadata } from "../src/metadata";
import { BASE_STYLESHEET } from "../src/styles";
import { ROOT_THEME } from "../src/theming/themes";

afterEach(cleanup);

function mount(markup: string): HTMLElement {
  const { code, diagnostics } = compileModule(markup, { format: "function" });
  expect(diagnostics).toEqual([]);
  const Main = loadModule(code, { components });
  return render(<Main />).container;
}

/** Each stack, in document order: its level and orientation ("1h", "0v"). */
function levels(markup: string): string[] {
  return [...mount(markup).querySelectorAll(".pfui-Stack")].map((s) => `${s.getAttribute("data-level")}${s.getAttribute("data-orientation")![0]}`);
}

describe("levels", () => {
  test.each<[name: string, markup: string, expected: string[]]>([
    ["a page's only root is a wrapper: level 0", "<App><VStack><Text>a</Text><HStack/></VStack></App>", ["0v", "1h"]],
    ["siblings in the page: level 1", "<App><VStack/><VStack/></App>", ["1v", "1v"]],
    [
      "each level deeper; past 3 it stays 3",
      "<App><VStack><Text/><VStack><Text/><VStack><Text/><VStack><Text/><HStack/></VStack></VStack></VStack></VStack></App>",
      ["0v", "1v", "2v", "3v", "3h"],
    ],
    ["a wrapper inside a wrapper", "<App><VStack><VStack><HStack/><Text/></VStack></VStack></App>", ["0v", "0v", "1h"]],
    ["no App: the first stack is the page", "<VStack><HStack/><Text/></VStack>", ["0v", "1h"]],
    [
      "a Page's only root is a wrapper",
      '<App><Pages><Page url="/"><VStack><HStack/><Text/></VStack></Page></Pages></App>',
      ["0v", "1h"],
    ],
    ["a Page with two roots", '<App><Pages><Page url="/"><VStack/><VStack/></Page></Pages></App>', ["1v", "1v"]],
    ["Items: never a wrapper, even with one item", "<App><VStack><Items data=\"{[1]}\"><HStack/></Items></VStack></App>", ["0v", "1h"]],
    ["a `when` sibling counts", '<App><VStack><HStack when="{false}"/><HStack/></VStack></App>', ["0v", "1h"]],
    [
      "user components: the root is one level below the stack holding the tags",
      '<App><VStack><Card/><Card/></VStack></App>\n<Component name="Card"><VStack><HStack/><Text/></VStack></Component>',
      ["0v", "1v", "2h", "1v", "2h"],
    ],
    ["bars: a stack in the header is level 3", "<App><AppHeader><HStack/></AppHeader></App>", ["3h"]],
    ["bars: in the footer too", "<App><Footer><HStack><Text/></HStack></Footer></App>", ["3h"]],
    ["density compact: one step tighter, inherited", '<App><VStack density="compact"><VStack/><Text/></VStack></App>', ["1v", "2v"]],
    [
      "density comfortable: one step looser",
      '<App><VStack><VStack density="comfortable"><HStack/><Text/></VStack><Text/></VStack></App>',
      ["0v", "0v", "1h"],
    ],
    [
      "density normal: back to the default",
      '<App><VStack density="compact"><VStack density="normal"><HStack/><Text/></VStack><Text/></VStack></App>',
      ["1v", "1v", "2h"],
    ],
    ["density never goes below 0", '<App><VStack density="comfortable"><HStack/><Text/></VStack></App>', ["0v", "0h"]],
  ])("%s", (_, markup, expected) => {
    expect(levels(markup)).toEqual(expected);
  });
});

describe("stack attributes", () => {
  test("a background or a border makes a surface", () => {
    const root = mount('<App><VStack backgroundColor="red"/><VStack border="1px solid $borderColor"/><VStack/></App>');
    expect([...root.querySelectorAll(".pfui-Stack")].map((s) => s.hasAttribute("data-surface"))).toEqual([true, true, false]);
  });

  test("an explicit gap is inline, so it wins over the ladder", () => {
    const stack = mount('<App><VStack gap="$gap-tight"/></App>').querySelector<HTMLElement>(".pfui-Stack")!;
    expect(stack.style.getPropertyValue("--pfui-gap")).toBe("var(--pfui-gap-tight)");
  });

  test("alignment, reverse and wrapping", () => {
    const stack = mount('<App><HStack horizontalAlignment="end" verticalAlignment="center" reverse="true" wrapContent="true" itemWidth="25%"/></App>').querySelector<HTMLElement>(".pfui-Stack")!;
    expect(stack.style.flexDirection).toBe("row-reverse");
    expect(stack.style.justifyContent).toBe("flex-end");
    expect(stack.style.alignItems).toBe("center");
    expect(stack.hasAttribute("data-wrap")).toBe(true);
    expect(stack.getAttribute("data-item-width")).toBe("%");
    expect(stack.style.getPropertyValue("--pfui-item-fraction")).toBe("0.25");
  });

  test("CHStack centers on both axes", () => {
    const stack = mount("<App><CHStack/></App>").querySelector<HTMLElement>(".pfui-Stack")!;
    expect([stack.style.justifyContent, stack.style.alignItems]).toEqual(["center", "center"]);
  });

  test("a user component's root gets the layout props of its tag; they win over its own", () => {
    const root = mount('<App><Card width="40%"/></App>\n<Component name="Card"><VStack width="10%" backgroundColor="red"><Text>x</Text></VStack></Component>');
    const stack = root.querySelector<HTMLElement>(".pfui-Stack")!;
    expect(stack.style.width).toBe("40%");
    expect(stack.style.backgroundColor).toBe("red");
  });

  test("layout props reach Text, headings, links and Mantine components", () => {
    const root = mount('<App><Text width="10px">t</Text><H2 width="20px">h</H2><Link to="/" width="30px">l</Link><Button label="b" width="40px"/><TextBox width="50px"/></App>');
    const width = (selector: string) => root.querySelector<HTMLElement>(selector)!.style.width;
    expect([width(".pfui-Text"), width(".pfui-Heading"), width(".pfui-Link"), width(".pfui-Button"), width(".pfui-TextBox")]).toEqual(["10px", "20px", "30px", "40px", "50px"]);
  });
});

const HORIZONTAL: LayoutContextValue = { level: 1, single: false, shift: 0, orientation: "horizontal", wrap: false };
const VERTICAL: LayoutContextValue = { ...HORIZONTAL, orientation: "vertical" };
const FLOW: LayoutContextValue = { ...HORIZONTAL, wrap: true };

describe("layoutStyle", () => {
  test.each<[props: Record<string, unknown>, parent: LayoutContextValue, style: Record<string, unknown> | undefined, attributes?: Record<string, string>]>([
    // Star sizes: shares of the free space on the main axis, stretched on the other.
    [{ width: "*" }, HORIZONTAL, { flex: "1 1 0px", minWidth: 0 }],
    [{ width: "2*" }, HORIZONTAL, { flex: "2 1 0px", minWidth: 0 }],
    [{ width: "*" }, VERTICAL, { alignSelf: "stretch" }],
    [{ height: "3*" }, VERTICAL, { flex: "3 1 0px", minHeight: 0 }],
    // Fixed sizes keep their size on the main axis; percentages may shrink.
    [{ width: "200px" }, HORIZONTAL, { width: "200px", flexShrink: 0 }],
    [{ width: "200px" }, VERTICAL, { width: "200px" }],
    [{ width: "50%" }, HORIZONTAL, { width: "50%" }],
    [{ width: 16 }, HORIZONTAL, { width: "16px", flexShrink: 0 }],
    [{ width: "16" }, VERTICAL, { width: "16px" }],
    // In a flow, a percentage is gap-aware (CSS) and 100% on phones.
    [
      { width: "25%" },
      FLOW,
      { width: "calc((25% - var(--pfui-flow-gap) * 0.75) * var(--pfui-flow-wide) + 100% * (1 - var(--pfui-flow-wide)))", flexShrink: 0 },
    ],
    [{ width: "120px" }, FLOW, { width: "120px", flexShrink: 0 }],
    // Spacing and theme variables.
    [{ padding: "$space-4" }, VERTICAL, { padding: "var(--pfui-space-4)" }],
    [{ padding: "8 16" }, VERTICAL, { padding: "8px 16px" }],
    [{ paddingHorizontal: "8" }, VERTICAL, { paddingLeft: "8px", paddingRight: "8px" }],
    [{ paddingVertical: "$space-2" }, VERTICAL, { paddingTop: "var(--pfui-space-2)", paddingBottom: "var(--pfui-space-2)" }],
    [{ maxWidth: "40rem", minHeight: "0" }, VERTICAL, { maxWidth: "40rem", minHeight: "0" }],
    // Surfaces.
    [{ backgroundColor: "$color-surface-50" }, VERTICAL, { backgroundColor: "var(--pfui-color-surface-50)" }, { "data-surface": "" }],
    [{ border: "1px solid $borderColor" }, VERTICAL, { border: "1px solid var(--pfui-borderColor)" }, { "data-surface": "" }],
    // Nothing set: nothing.
    [{}, VERTICAL, undefined],
    [{ width: "", height: null }, VERTICAL, undefined],
    // A user component's tag wins over its root's own.
    [{ width: "10px", $$layoutFrom: { width: "20px", height: undefined } }, VERTICAL, { width: "20px" }],
  ])("%o in %o", (props, parent, style, attributes = {}) => {
    const result = layoutStyle(props, parent);
    expect(result.style).toEqual(style);
    expect(result.attributes).toEqual(attributes);
  });
});

describe("every spacing value is a multiple of space-base", () => {
  const FIXED = /(?<![\w.-])-?\d*\.?\d+(px|rem)\b/;

  test("no fixed length in a gap, padding or margin of the stylesheet", () => {
    const offenders: string[] = [];
    for (const match of BASE_STYLESHEET.matchAll(/(?:^|[;{\s])((?:gap|row-gap|column-gap|padding[\w-]*|margin[\w-]*)\s*:\s*([^;}]+))/g)) {
      if (FIXED.test(match[2]!)) offenders.push(match[1]!.trim());
    }
    expect(offenders).toEqual([]);
  });

  test("no fixed length in the spacing theme variables' defaults", () => {
    const spacing = /^(gap|padding|margin|space)/;
    const offenders: string[] = [];
    const check = (name: string, value: string) => {
      if (spacing.test(name) && name !== "space-base" && FIXED.test(value)) offenders.push(`${name}: ${value}`);
    };
    for (const component of Object.values(componentMetadata)) for (const [name, value] of Object.entries(component.themeVars ?? {})) check(name, value);
    for (const [name, value] of Object.entries(ROOT_THEME.themeVars ?? {})) check(name, value);
    expect(offenders).toEqual([]);
  });

  test("the ladder is in steps of space-base; the shell's heights too", () => {
    const vars = ROOT_THEME.themeVars!;
    expect([vars["space-level0"], vars["space-level0-phone"], vars["space-level1"], vars["space-level2"], vars["space-level3"]]).toEqual([
      "$space-6",
      "$space-4",
      "$space-4",
      "$space-3",
      "$space-2",
    ]);
    expect(componentMetadata.AppHeader!.themeVars!["height-AppHeader"]).toBe("$space-14");
    expect(componentMetadata.Footer!.themeVars!["height-Footer"]).toBe("$space-12");
  });
});
