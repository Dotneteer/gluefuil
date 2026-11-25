// Step 17 in jsdom: App applies the active theme and tone, <Theme> scopes
// variables, the tone and theme app globals switch them. (jsdom does not
// resolve var(); the E2E tests check computed styles in a real browser.)
import { compileModule } from "@gluefuil/compiler";
import { loadModule, resetThemeState } from "@gluefuil/runtime";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import * as components from "../src/index";

afterEach(() => {
  cleanup();
  act(() => resetThemeState());
});

function show(markup: string) {
  const { code, diagnostics } = compileModule(markup, { format: "function" });
  expect(diagnostics).toEqual([]);
  const Main = loadModule(code, { components });
  return render(<Main />);
}

const app = () => document.querySelector<HTMLElement>(".gfui-App")!;
const themes = () => [...document.querySelectorAll<HTMLElement>(".gfui-Theme")];
const cssVar = (element: HTMLElement, name: string) => element.style.getPropertyValue(`--gfui-${name}`);

test("App: the active theme's variables on the app element, and the stylesheet once in the head", () => {
  show("<App><Text>hi</Text></App>");
  expect(app().dataset.tone).toBe("light");
  expect(cssVar(app(), "color-primary")).toBe("#2563eb");
  expect(cssVar(app(), "backgroundColor-Button")).toBe("var(--gfui-color-primary-500)");
  expect(cssVar(app(), "backgroundColor")).toBe("#ffffff");
  expect(document.head.querySelectorAll('style[data-href="gfui-base"]')).toHaveLength(1);
});

test("App defaultTone and defaultTheme", () => {
  show('<App defaultTone="dark" defaultTheme="gfui-green"><Text>{activeThemeId} / {activeThemeTone}</Text></App>');
  expect(app().dataset.tone).toBe("dark");
  expect(cssVar(app(), "backgroundColor")).toBe("var(--gfui-color-surface-950)");
  expect(cssVar(app(), "color-primary")).toBe("#16a34a");
  expect(screen.getByText("gfui-green / dark")).toBeTruthy();
});

test("toggleThemeTone, setThemeTone and setTheme switch the app; bindings follow", () => {
  show(`
    <App>
      <Button label="Toggle" onClick="toggleThemeTone()"/>
      <Button label="Light" onClick="setThemeTone('light')"/>
      <Button label="Red" onClick="setTheme('gfui-red')"/>
      <Text>{activeThemeTone}</Text>
    </App>`);
  act(() => fireEvent.click(screen.getByText("Toggle")));
  expect(app().dataset.tone).toBe("dark");
  expect(screen.getByText("dark")).toBeTruthy();
  act(() => fireEvent.click(screen.getByText("Toggle")));
  expect(app().dataset.tone).toBe("light");
  act(() => fireEvent.click(screen.getByText("Toggle")));
  act(() => fireEvent.click(screen.getByText("Light")));
  expect(app().dataset.tone).toBe("light");
  act(() => fireEvent.click(screen.getByText("Red")));
  expect(cssVar(app(), "color-primary")).toBe("#dc2626");
});

test("Theme with component variables: only the overrides, references resolved; bound values follow", () => {
  show(`
    <App var.color="red">
      <Theme backgroundColor-Button="{color}" borderColor-Button="$color-danger-700">
        <Button label="Inside"/>
      </Theme>
      <Button label="Recolor" onClick="color = 'green'"/>
    </App>`);
  const [theme] = themes();
  expect(theme!.style.display).toBe("contents");
  expect(cssVar(theme!, "backgroundColor-Button")).toBe("red");
  expect(cssVar(theme!, "borderColor-Button")).toBe("var(--gfui-color-danger-700)");
  expect(cssVar(theme!, "color-primary")).toBe("");
  act(() => fireEvent.click(screen.getByText("Recolor")));
  expect(cssVar(theme!, "backgroundColor-Button")).toBe("green");
});

test("Theme tone and themeId: the full set, recomputed for the scope; it keeps its tone when the app toggles", () => {
  show(`
    <App>
      <Theme tone="dark"><Text>dark region</Text></Theme>
      <Theme themeId="gfui-green"><Text>green region</Text></Theme>
      <Theme color-primary="purple"><Text>base override</Text></Theme>
      <Button label="Toggle" onClick="toggleThemeTone()"/>
    </App>`);
  const [dark, green, base] = themes();
  expect(dark!.dataset.tone).toBe("dark");
  expect(cssVar(dark!, "backgroundColor")).toBe("var(--gfui-color-surface-950)");
  expect(cssVar(green!, "color-primary")).toBe("#16a34a");
  expect(cssVar(base!, "color-primary")).toBe("purple");
  expect(cssVar(base!, "backgroundColor-Button")).toBe("var(--gfui-color-primary-500)");
  act(() => fireEvent.click(screen.getByText("Toggle")));
  expect(app().dataset.tone).toBe("dark");
  expect(cssVar(dark!, "backgroundColor")).toBe("var(--gfui-color-surface-950)");
  // Without its own tone, a Theme follows the app's.
  expect(cssVar(green!, "backgroundColor")).toBe("var(--gfui-color-surface-950)");
});
