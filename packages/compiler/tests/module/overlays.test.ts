// Step 27: the compiler's part of overlays and menus: where menu items may be
// (E037), a ModalDialog opened by `when` ($$whenOpen), the dialog's and the
// context menu's context variables, and which handlers declare $param.
// Design: .ai/plan/poc-27-overlays.md
import { describe, expect, test } from "vitest";
import { compileModule } from "../../src/index";

const problems = (markup: string) => {
  const result = compileModule(markup, { sourceMap: false });
  return result.diagnostics.map((d) => [d.code, markup.slice(d.start, d.end)]);
};
const code = (markup: string) => compileModule(markup, { sourceMap: false }).code;

describe("menu items belong in a menu (E037)", () => {
  test.each<[label: string, markup: string, expected: string[][]]>([
    ["items, a submenu and a separator in a DropdownMenu", '<App><DropdownMenu label="m"><MenuItem>a</MenuItem><MenuSeparator/><SubMenuItem label="s"><MenuItem>b</MenuItem></SubMenuItem></DropdownMenu></App>', []],
    ["items in a ContextMenu", '<App><ContextMenu><MenuItem>a</MenuItem></ContextMenu></App>', []],
    ["an Items of MenuItems in a menu", '<App><DropdownMenu label="m"><Items data="{[1, 2]}"><MenuItem>{$item}</MenuItem></Items></DropdownMenu></App>', []],
    ["a MenuItem with when and variables", '<App><DropdownMenu label="m"><MenuItem when="{true}" var.x="1">{x}</MenuItem></DropdownMenu></App>', []],
    ["a MenuItem in the App", "<App><MenuItem>a</MenuItem></App>", [["E037", "MenuItem"]]],
    ["a MenuSeparator in a Stack inside a menu", '<App><DropdownMenu label="m"><Stack><MenuSeparator/></Stack></DropdownMenu></App>', [["E037", "MenuSeparator"]]],
    ["a SubMenuItem in an Items outside a menu", '<App><Items data="{[1]}"><SubMenuItem label="s"/></Items></App>', [["E037", "SubMenuItem"]]],
    ["the root of a <Component> (its use site decides)", '<Component name="Extra"><MenuItem>x</MenuItem></Component>', []],
    ["slot content of a user component", '<Component name="Box"><Slot/></Component>\n<App><Box><MenuItem>x</MenuItem></Box></App>', []],
    ["other content in a menu is fine (XMLUI renders it)", '<App><DropdownMenu label="m"><Text>note</Text></DropdownMenu></App>', []],
  ])("%s", (_label, markup, expected) => {
    expect(problems(markup)).toEqual(expected);
  });

  test("the message names the menus", () => {
    const [diagnostic] = compileModule("<App><MenuItem>a</MenuItem></App>").diagnostics;
    expect(diagnostic!.message).toBe("'<MenuItem>' must be inside <DropdownMenu>, <ContextMenu> or <SubMenuItem>");
  });
});

describe("ModalDialog", () => {
  test("with `when` it gets $$whenOpen (open as it mounts); without, it doesn't", () => {
    expect(code('<App var.s="{false}"><ModalDialog when="{s}"/></App>')).toContain('"$$whenOpen": true');
    expect(code('<App><ModalDialog id="d"/></App>')).not.toContain("$$whenOpen");
  });

  test.each<[label: string, markup: string, expected: string[][]]>([
    ["$param and $params inside, in attributes and children", '<App><ModalDialog id="d" title="{$param}"><Text>{$params.length}</Text></ModalDialog></App>', []],
    ["a click handler inside sees the dialog's $param", '<App var.x=""><ModalDialog id="d"><Button onClick="x = $param"/></ModalDialog></App>', []],
    ["$param outside the dialog", '<App><ModalDialog id="d"/><Text>{$param}</Text></App>', [["C014", "$param"]]],
    ["the open event declares its own $param (open's arguments)", '<App var.x=""><ModalDialog id="d" onOpen="x = $param"/></App>', []],
    ["$context inside a ContextMenu", '<App><ContextMenu id="m"><MenuItem>{$context.name}</MenuItem></ContextMenu></App>', []],
    ["$context outside", '<App><Text>{$context}</Text></App>', [["C014", "$context"]]],
    ["toast and confirm are app globals", '<App><Button onClick="toast.success(\'ok\'); confirm(\'sure?\')"/></App>', []],
  ])("%s", (_label, markup, expected) => {
    expect(problems(markup)).toEqual(expected);
  });
});
