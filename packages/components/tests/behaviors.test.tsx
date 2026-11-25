// Step 18 in jsdom: label, tooltip and variant behaviors on compiled markup.
import { compileModule } from "@gluefuil/compiler";
import { loadModule } from "@gluefuil/runtime";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { variantVariable } from "../src/behaviors";
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

test("tooltip: shown on hover and focus, hidden on leave and blur, linked with aria-describedby; bound text follows", async () => {
  show('<App var.tip="Saves the file"><Button label="Save" tooltip="{tip}" onClick="tip = \'Saved!\'"/></App>');
  const anchor = screen.getByRole("button", { name: "Save" }).closest(".gfui-TooltipAnchor")!;
  expect(screen.queryByRole("tooltip")).toBeNull();
  act(() => fireEvent.mouseEnter(anchor));
  const tooltip = screen.getByRole("tooltip");
  expect(tooltip.textContent).toBe("Saves the file");
  expect(anchor.getAttribute("aria-describedby")).toBe(tooltip.id);
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save" })));
  expect(screen.getByRole("tooltip").textContent).toBe("Saved!");
  act(() => fireEvent.mouseLeave(anchor));
  expect(screen.queryByRole("tooltip")).toBeNull();
  act(() => fireEvent.focus(screen.getByRole("button", { name: "Save" })));
  expect(screen.getByRole("tooltip")).toBeTruthy();
  act(() => fireEvent.blur(screen.getByRole("button", { name: "Save" })));
  expect(screen.queryByRole("tooltip")).toBeNull();
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

test("behaviors on a user-defined component tag; the component does not receive the prop", () => {
  show(`
    <Component name="InfoCard"><Text>card: {$props.title} {JSON.stringify(Object.keys($props))}</Text></Component>
    <App><InfoCard title="x" tooltip="about the card"/></App>`);
  expect(screen.getByText('card: x ["title"]')).toBeTruthy();
  act(() => fireEvent.mouseEnter(screen.getByText(/^card:/).closest(".gfui-TooltipAnchor")!));
  expect(screen.getByRole("tooltip").textContent).toBe("about the card");
});

test("order: label innermost, then tooltip, then variant outermost", () => {
  show('<App><TextBox label="Name" tooltip="t" variant="v"/></App>');
  const input = screen.getByLabelText("Name");
  const label = input.closest(".gfui-Label")!;
  const anchor = label.parentElement!;
  expect(anchor.className).toBe("gfui-TooltipAnchor");
  expect(anchor.parentElement!.className).toBe("gfui-Variant");
});
