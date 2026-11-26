// Step 18 in jsdom: label, tooltip and variant behaviors on compiled markup.
import { compileModule } from "@gluefuil/compiler";
import { loadModule } from "@gluefuil/runtime";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { variantVariable } from "../src/behaviors";
import { parseTooltipOptions } from "../src/overlays";
import * as components from "../src/index";

afterEach(cleanup);

function show(markup: string) {
  const { code, diagnostics } = compileModule(markup, { format: "function" });
  expect(diagnostics).toEqual([]);
  const Main = loadModule(code, { components });
  return render(<Main />);
}

test("label: a <label> around the component gives an input its accessible name", () => {
  show('<App><TextBox label="Your name" placeholder="p"/><TextBox label="City" labelPosition="start"/></App>');
  const input = screen.getByLabelText("Your name");
  expect(input.tagName).toBe("INPUT");
  expect(input.getAttribute("placeholder")).toBe("p");
  expect(screen.getByLabelText("City").closest(".gfui-Label")!.getAttribute("data-position")).toBe("start");
});

// Step 27: the tooltip is Mantine's. jsdom runs no CSS transitions, so Mantine keeps it at
// display: none there: these tests check its content, place and links; showing and hiding
// (hover, focus, the delay, Escape) are proven in a real browser (e2e/overlays.spec.ts).
const tooltipOf = () => screen.queryByRole("tooltip", { hidden: true });
const hover = (text: string) => act(() => fireEvent.mouseEnter(screen.getByText(text).closest(".gfui-TooltipAnchor")!));

test("tooltip: on hover, in the App's overlay layer, linked with aria-describedby; the bound text follows", async () => {
  show('<App var.tip="Saves the file"><Button label="Save" tooltip="{tip}" tooltipOptions="delayDuration: 0" onClick="tip = \'Saved!\'"/></App>');
  const button = screen.getByRole("button", { name: "Save" });
  const anchor = button.closest(".gfui-TooltipAnchor")!;
  act(() => fireEvent.mouseEnter(anchor));
  const tooltip = await screen.findByRole("tooltip", { hidden: true });
  expect(tooltip.textContent).toBe("Saves the file");
  expect(anchor.getAttribute("aria-describedby")).toBe(tooltip.id);
  expect(tooltip.closest(".gfui-Overlays")).not.toBeNull();
  expect(anchor.contains(tooltip)).toBe(false);
  await act(async () => fireEvent.click(button));
  await waitFor(() => expect(tooltipOf()!.textContent).toBe("Saved!"));
});

test("tooltipOptions showArrow: the tooltip has an arrow", async () => {
  show('<App><Button label="Save" tooltip="t" tooltipOptions="bottom; showArrow; delayDuration: 0"/></App>');
  hover("Save");
  const tooltip = await screen.findByRole("tooltip", { hidden: true });
  expect(tooltip.querySelector(".gfui-Tooltip-arrow")).not.toBeNull();
});

test.each<[input: unknown, expected: Record<string, unknown>]>([
  ["left; delayDuration: 800; !showArrow", { side: "left", delayDuration: 800, showArrow: false }],
  ["bottom; start; showArrow; sideOffset: 28", { side: "bottom", align: "start", showArrow: true, sideOffset: 28 }],
  [{ side: "right" }, { side: "right" }],
  [undefined, {}],
])("parseTooltipOptions(%j)", (input, expected) => {
  expect(parseTooltipOptions(input)).toEqual(expected);
});

test("tooltipMarkdown: Markdown content", async () => {
  show('<App><Button label="Save" tooltipMarkdown="**bold** tip" tooltipOptions="delayDuration: 0"/></App>');
  hover("Save");
  await waitFor(() => expect(tooltipOf()!.querySelector("strong")?.textContent).toBe("bold"));
});

test("the Tooltip component: one tooltip for several children; a template", async () => {
  show(`
    <App>
      <Tooltip text="both" delayDuration="0"><Text>one</Text><Text>two</Text></Tooltip>
      <Tooltip delayDuration="0"><property name="tooltipTemplate"><Text variant="strong">templated</Text></property><Text>three</Text></Tooltip>
    </App>`);
  const anchor = screen.getByText("one").closest(".gfui-TooltipAnchor")!;
  expect(anchor.contains(screen.getByText("two"))).toBe(true);
  act(() => fireEvent.mouseEnter(anchor));
  await waitFor(() => expect(screen.getAllByRole("tooltip", { hidden: true }).some((t) => t.textContent === "both")).toBe(true));
  hover("three");
  await waitFor(() => expect(screen.getAllByRole("tooltip", { hidden: true }).some((t) => t.querySelector("strong")?.textContent === "templated")).toBe(true));
});

test("variant: the component's variables read their variant values, falling back to the defaults", () => {
  show('<App><Button label="Delete" variant="danger"/></App>');
  const wrapper = screen.getByRole("button", { name: "Delete" }).closest<HTMLElement>(".gfui-Variant")!;
  expect(wrapper.dataset.variant).toBe("danger");
  expect(wrapper.style.display).toBe("contents");
  expect(wrapper.style.getPropertyValue("--gfui-backgroundColor-Button")).toBe("var(--gfui-backgroundColor-Button-danger, var(--gfui-color-primary-500))");
  expect(wrapper.style.getPropertyValue("--gfui-backgroundColor-Button--hover")).toBe("var(--gfui-backgroundColor-Button-danger--hover, var(--gfui-color-primary-600))");
});

test.each([
  ["backgroundColor-Button", "danger", "backgroundColor-Button-danger"],
  ["backgroundColor-Button--hover", "danger", "backgroundColor-Button-danger--hover"],
])("variantVariable(%s, %s)", (name, variant, expected) => {
  expect(variantVariable(name, variant)).toBe(expected);
});

test("behaviors on a user-defined component tag; the component does not receive the prop", async () => {
  show(`
    <Component name="InfoCard"><Text>card: {$props.title} {JSON.stringify(Object.keys($props))}</Text></Component>
    <App><InfoCard title="x" tooltip="about the card"/></App>`);
  expect(screen.getByText('card: x ["title"]')).toBeTruthy();
  act(() => fireEvent.mouseEnter(screen.getByText(/^card:/).closest(".gfui-TooltipAnchor")!));
  await waitFor(() => expect(tooltipOf()!.textContent).toBe("about the card"), { timeout: 1500 });
});

test("order: label innermost, then tooltip, then variant outermost", () => {
  show('<App><TextBox label="Name" tooltip="t" variant="v"/></App>');
  const input = screen.getByLabelText("Name");
  const label = input.closest(".gfui-Label")!;
  const anchor = label.parentElement!;
  expect(anchor.className).toBe("gfui-TooltipAnchor");
  expect(anchor.parentElement!.className).toBe("gfui-Variant");
});
