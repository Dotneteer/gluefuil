import { expect, test } from "vitest";
import * as components from "../src/index";
import { componentMetadata } from "../src/metadata";

test("components package loads", () => {
  expect(typeof components.Text).toBe("function");
});

test("every component has metadata, and the metadata entry point loads on its own", () => {
  expect(Object.keys(componentMetadata).sort()).toEqual([
    "APICall", "App", "AppHeader", "AutoComplete", "Avatar", "Badge", "Button", "CHStack", "CVStack", "Card", "Checkbox", "ColorPicker", "Column",
    "ContentSeparator", "ContextMenu", "DataSource", "DateInput", "DatePicker", "Drawer", "DropdownMenu", "ExpandableItem", "FlowLayout", "Footer",
    "Form", "H1", "H2", "H3", "H4", "H5", "H6", "HSplitter", "HStack", "Heading", "Icon", "Image", "Items", "Link", "List", "Markdown", "MenuItem",
    "MenuSeparator", "ModalDialog", "NavGroup", "NavLink", "NavPanel", "NavPanelCollapseButton", "NumberBox", "Option", "Page", "Pages", "Pagination",
    "PasswordInput", "ProgressBar", "RadioGroup", "ResponsiveBar", "ScrollViewer", "Select", "Slider", "SpaceFiller", "Spinner", "Splitter", "Stack",
    "Step", "Stepper", "StickyBox", "StickySection", "SubMenuItem", "Switch", "TabItem", "Table", "Tabs", "Text", "TextArea", "TextBox", "Theme", "TileGrid", "TimeInput",
    "Tooltip", "Tree", "VSplitter", "VStack", "Value",
  ]);
  for (const [name, metadata] of Object.entries(componentMetadata)) {
    // Aliases render another component (HStack → Stack); removed ones exist only for their migration error.
    if (metadata.alias) expect(typeof (components as Record<string, unknown>)[metadata.alias.component], name).toBe("function");
    else if (metadata.removed !== undefined) expect((components as Record<string, unknown>)[name], name).toBeUndefined();
    else expect(typeof (components as Record<string, unknown>)[name], name).toBe("function");
  }
});

test("every built-in prop declares its value type (contracts, step 15)", () => {
  for (const [name, metadata] of Object.entries(componentMetadata)) {
    for (const [prop, contract] of Object.entries(metadata.props)) {
      expect(contract.valueType, `${name}.${prop}`).toBeDefined();
    }
  }
});
