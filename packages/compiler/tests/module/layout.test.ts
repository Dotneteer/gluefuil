// Steps 19D–19E: the layout system in the compiler. Aliases (HStack → Stack),
// layout props on every visual component, their literal checks (E031),
// removed components (E032), and a user component's root receiving the
// layout props of its tag. See .ai/plan/poc-19d-layout.md.
import { describe, expect, test } from "vitest";
import { compileModule } from "../../src/module/compile-module";

const compile = (markup: string) => compileModule(markup, { sourceMap: false });

type Found = [code: string, span: string, severity?: "warning"];
function check(markup: string): Found[] {
  return compile(markup).diagnostics.map((d) => {
    const found: Found = [d.code, markup.slice(d.start, d.end)];
    if (d.severity === "warning") found.push("warning");
    return found;
  });
}

function ok(markup: string): string {
  const { code, diagnostics } = compile(markup);
  expect(diagnostics).toEqual([]);
  return code;
}

describe("aliases render Stack with fixed props", () => {
  test.each<[markup: string, element: string]>([
    ["<HStack/>", '$$h($$C_Stack, { "orientation": "horizontal" })'],
    ["<VStack/>", '$$h($$C_Stack, { "orientation": "vertical" })'],
    ["<CHStack/>", '$$h($$C_Stack, { "orientation": "horizontal", "horizontalAlignment": "center", "verticalAlignment": "center" })'],
    ["<CVStack/>", '$$h($$C_Stack, { "orientation": "vertical", "horizontalAlignment": "center", "verticalAlignment": "center" })'],
    // A markup value wins over the alias's.
    ['<CHStack verticalAlignment="start"/>', '$$h($$C_Stack, { "orientation": "horizontal", "horizontalAlignment": "center", "verticalAlignment": "start" })'],
    ['<HStack gap="0" wrapContent="true"/>', '$$h($$C_Stack, { "orientation": "horizontal", "gap": "0", "wrapContent": "true" })'],
  ])("%s", (markup, element) => {
    const code = ok(markup);
    expect(code).toContain(element);
    // Only Stack is imported: the alias is a compile-time name.
    expect(code).toMatch(/import \{ Stack as \$\$C_Stack \}/);
  });

  test("an alias has no orientation prop (E020)", () => {
    expect(check('<HStack orientation="vertical"/>')).toEqual([["E020", "orientation"]]);
  });
});

describe("layout props on every visual component", () => {
  test.each<string>([
    '<Text width="50%">x</Text>',
    '<Button label="x" width="*"/>',
    '<H1 maxWidth="40rem">x</H1>',
    '<Stack padding="$space-4" backgroundColor="$color-surface-50" border="1px solid $borderColor" borderRadius="$borderRadius"/>',
    '<TextBox paddingHorizontal="8" height="2*"/>',
    '<Link to="/" minHeight="44px"/>',
    '<SpaceFiller width="16px"/>',
    '<Stack gap="$gap-tight"/>',
    '<Stack gap="8px 16px"/>',
    '<HStack wrapContent="true" itemWidth="25%"/>',
    '<VStack density="compact"/>',
    '<Text width="{w}" var.w="10px">x</Text>',
  ])("%s", (markup) => {
    ok(markup);
  });

  test("a bound layout prop is a binding like any other", () => {
    const code = ok('<Stack var.w="{100}"><Text width="{w + \'px\'}">x</Text></Stack>');
    expect(code).toMatch(/"width": \(\$\$s\) =>/);
  });

  test.each<[markup: string, found: Found[]]>([
    // The shell and the non-visual components take none.
    ['<App width="50%"/>', [["E020", "width"]]],
    ['<App><Items data="{[]}" padding="8px"/></App>', [["E020", "padding"]]],
    ['<App><AppHeader height="80px"/></App>', [["E020", "height"]]],
    ['<App><NavPanel><NavLink to="/" label="x" width="10px"/></NavPanel></App>', [["E020", "width"]]],
  ])("not accepted: %s", (markup, found) => {
    expect(check(markup)).toEqual(found);
  });
});

describe("E031: literal layout values", () => {
  test.each<[markup: string, found: Found[]]>([
    ['<Text width="wide">x</Text>', [["E031", '"wide"']]],
    ['<Text minWidth="*">x</Text>', [["E031", '"*"']]],
    ['<Stack padding="1px 2px 3px 4px 5px"/>', [["E031", '"1px 2px 3px 4px 5px"']]],
    ['<Stack padding="big"/>', [["E031", '"big"']]],
    ['<Stack gap="$space-forty"/>', [["E031", '"$space-forty"']]],
    ['<Stack backgroundColor="$colour-primary"/>', [["E031", '"$colour-primary"']]],
    ['<HStack itemWidth="quarter"/>', [["E031", '"quarter"']]],
    // Enums and booleans of the stack props are the usual contract checks.
    ['<VStack density="dense"/>', [["E023", '"dense"']]],
    ['<HStack wrapContent="yes"/>', [["E022", '"yes"']]],
    ['<VStack horizontalAlignment="left"/>', [["E023", '"left"']]],
  ])("%s", (markup, found) => {
    expect(check(markup)).toEqual(found);
  });

  test("the message names the problem", () => {
    const [diagnostic] = compile('<Stack gap="$space-forty"/>').diagnostics;
    expect(diagnostic!.message).toBe("'$space-forty' is not a valid value for 'gap': '$space-forty' is not a theme variable");
  });

  test("a warning with strictContracts: false", () => {
    const { diagnostics } = compileModule('<Text width="wide">x</Text>', { sourceMap: false, strictContracts: false });
    expect(diagnostics.map((d) => [d.code, d.severity])).toEqual([["E031", "warning"]]);
  });
});

describe("E032: FlowLayout is removed", () => {
  test("at the tag, with the replacement", () => {
    const markup = "<App><FlowLayout><Text>x</Text></FlowLayout></App>";
    expect(check(markup)).toEqual([["E032", "FlowLayout"]]);
    expect(compile(markup).diagnostics[0]!.message).toContain('use <HStack wrapContent="true">');
  });
});

describe("a user component's root applies the layout props of its tag", () => {
  test("the root reads them from $props ($$layoutFrom)", () => {
    const code = ok('<App><InfoCard width="50%"/></App>\n<Component name="InfoCard"><VStack><Text>x</Text></VStack></Component>');
    expect(code).toMatch(/"\$\$layoutFrom": \(\$\$s\) =>/);
    expect(code).toContain('"width": "50%"');
  });

  test("not when the component has several roots, or a root that takes no layout props", () => {
    expect(ok('<App/>\n<Component name="Two"><Text>a</Text><Text>b</Text></Component>')).not.toContain("$$layoutFrom");
    expect(ok('<App/>\n<Component name="Roster"><Items data="{[]}"><Text>x</Text></Items></Component>')).not.toContain("$$layoutFrom");
  });

  test("only the root: nested elements don't", () => {
    const code = ok('<App/>\n<Component name="InfoCard"><VStack><Text>x</Text></VStack></Component>');
    expect(code.match(/\$\$layoutFrom/g)).toHaveLength(1);
  });
});
