// Step 27 in jsdom: ModalDialog, Drawer, the menus, ContextMenu, toast() and
// confirm(), a Form in a dialog, APICall's confirmation and notifications.
// jsdom runs no CSS transitions: Mantine mounts an overlay's content a moment
// after it opens, so the tests wait with findBy*; queries pass `hidden: true`
// where Mantine keeps an element at display: none. Focus trapping, Escape,
// outside clicks and placement are proven in a real browser (e2e/overlays.spec.ts).
import { compileModule } from "@gluefuil/compiler";
import { defineBackend, status } from "@gluefuil/mock-backend";
import { startTestServer } from "@gluefuil/mock-backend/node";
import { confirmQueue, loadModule, resetDataState, resetOverlayState, resetRouter, setDataDefaults, setErrorReporter, toasts } from "@gluefuil/runtime";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ComponentType } from "react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "vitest";
import * as components from "../src/index";

let errors: unknown[];
let restore: () => void;
beforeEach(() => {
  errors = [];
  restore = setErrorReporter((error) => errors.push(error));
});
afterEach(() => {
  cleanup();
  restore();
  resetOverlayState();
  resetRouter();
});

function show(markup: string) {
  const { code, diagnostics } = compileModule(markup, { format: "function" });
  expect(diagnostics).toEqual([]);
  const Main = loadModule(code, { components }) as ComponentType;
  return render(<Main />);
}

const settle = (ms = 0) => act(() => new Promise((resolve) => setTimeout(resolve, ms)));
const click = (name: string) => act(async () => fireEvent.click(screen.getByRole("button", { name })));
const clickIn = async (name: string) => {
  const button = await screen.findByRole("button", { name, hidden: true });
  await act(async () => fireEvent.click(button));
};
const text = (prefix: string) => [...document.querySelectorAll(".gfui-Text")].find((e) => e.textContent?.startsWith(prefix))?.textContent;
/** Clicks a button of the confirm() dialog (its "Close" action would clash with a dialog's close button). */
const answer = async (name: string) => {
  await waitFor(() => expect(confirmDialog()?.querySelector(".gfui-Confirm-buttons")).toBeTruthy());
  const row = confirmDialog()!.querySelector<HTMLElement>(".gfui-Confirm-buttons")!;
  const button = await within(row).findByRole("button", { name, hidden: true });
  await act(async () => fireEvent.click(button));
};
const dialog = () => document.querySelector<HTMLElement>('.gfui-ModalDialog:not(.gfui-Confirm) [role="dialog"]');
const confirmDialog = () => document.querySelector<HTMLElement>('.gfui-Confirm [role="dialog"]');

describe("ModalDialog", () => {
  test("imperative: open(...params) shows it with $param and $params; close() closes it; open and close events", async () => {
    show(`
      <App var.log="">
        <Button label="Open" onClick="dlg.open('Ann', 42)"/>
        <ModalDialog id="dlg" title="Edit {$param}" onOpen="(name) => log += 'open ' + name + ';'" onClose="log += 'close;'">
          <Text>param: {$param} {$params.length} {$params[1]}</Text>
          <Button label="Done" onClick="dlg.close()"/>
        </ModalDialog>
        <Text>log: {log}</Text>
        <Text>open: {dlg.isOpen}</Text>
      </App>`);
    expect(dialog()).toBeNull();
    await click("Open");
    await screen.findByText("param: Ann 2 42");
    expect(dialog()!.getAttribute("aria-modal")).toBe("true");
    expect(screen.getByText("Edit Ann", { selector: "h2" })).toBeTruthy();
    expect(text("open:")).toBe("open: true");
    // Rendered in the App's overlay layer, not where the element is.
    expect(dialog()!.closest(".gfui-Overlays")).not.toBeNull();
    await clickIn("Done");
    await waitFor(() => expect(text("log:")).toBe("log: open Ann;close;"));
    expect(text("open:")).toBe("open: false");
  });

  test("a button inside sees the dialog's $param (a click declares none of its own)", async () => {
    show(`
      <App var.saved="">
        <Button label="Open" onClick="dlg.open('id-7')"/>
        <ModalDialog id="dlg">
          <Button label="Save" onClick="saved = $param; dlg.close()"/>
        </ModalDialog>
        <Text>saved: {saved}</Text>
      </App>`);
    await click("Open");
    await clickIn("Save");
    await waitFor(() => expect(text("saved:")).toBe("saved: id-7"));
  });

  test("declarative: `when` mounts it open; the close button fires close, which resets the condition", async () => {
    show(`
      <App var.shown="{false}" var.closed="{0}">
        <Button label="Show" onClick="shown = true"/>
        <ModalDialog when="{shown}" title="Declared" onClose="shown = false; closed++">
          <Text>inside</Text>
        </ModalDialog>
        <Text>closed: {closed}</Text>
      </App>`);
    expect(dialog()).toBeNull();
    await click("Show");
    await screen.findByText("inside");
    await clickIn("Close");
    await waitFor(() => expect(text("closed:")).toBe("closed: 1"));
    await waitFor(() => expect(dialog()).toBeNull());
  });

  test("willClose returning false keeps it open", async () => {
    show(`
      <App var.allow="{false}">
        <Button label="Open" onClick="dlg.open()"/>
        <ModalDialog id="dlg" onWillClose="return allow">
          <Button label="Allow" onClick="allow = true"/>
          <Text>open: {dlg.isOpen}</Text>
        </ModalDialog>
      </App>`);
    await click("Open");
    await clickIn("Close");
    await settle(20);
    expect(screen.getByText("open: true")).toBeTruthy();
    await clickIn("Allow");
    await clickIn("Close");
    await waitFor(() => expect(dialog()).toBeNull());
  });

  test("dirty: setDirty(true) asks before closing (XMLUI's texts); Cancel keeps it, the action closes it; dirtyChanged", async () => {
    show(`
      <App var.log="">
        <Button label="Open" onClick="dlg.open()"/>
        <ModalDialog id="dlg" confirmCloseLabel="Discard" onDirtyChanged="(d) => log += d + ';'">
          <Button label="Touch" onClick="dlg.setDirty(true)"/>
          <Text>dirty: {dlg.getDirty()}</Text>
        </ModalDialog>
        <Text>log: {log}</Text>
      </App>`);
    await click("Open");
    await clickIn("Touch");
    await waitFor(() => expect(text("log:")).toBe("log: true;"));
    await clickIn("Close");
    await waitFor(() => expect(confirmQueue.get()).toHaveLength(1));
    expect(confirmQueue.get()[0]).toMatchObject({
      title: "Unsaved changes",
      message: "You have unsaved changes. Are you sure you want to close this dialog?",
      actionLabel: "Discard",
      cancelLabel: "Cancel",
    });
    await answer("Cancel");
    await settle(20);
    expect(dialog()).not.toBeNull();
    await clickIn("Close");
    await answer("Discard");
    await waitFor(() => expect(text("log:")).toBe("log: true;false;"));
    await waitFor(() => expect(dialog()).toBeNull());
  });

  test("a closed dialog unmounts its content: local state starts fresh on the next open", async () => {
    show(`
      <App>
        <Button label="Open" onClick="dlg.open()"/>
        <ModalDialog id="dlg">
          <Stack var.n="{0}"><Button label="Inc" onClick="n++"/><Text>n: {n}</Text></Stack>
        </ModalDialog>
      </App>`);
    await click("Open");
    await clickIn("Inc");
    await screen.findByText("n: 1");
    await clickIn("Close");
    await waitFor(() => expect(dialog()).toBeNull());
    await click("Open");
    await screen.findByText("n: 0");
  });

  test("a Theme around the dialog: it renders in the Theme's own layer, so the Theme's variables apply", async () => {
    show(`
      <App>
        <Theme backgroundColor-ModalDialog="rgb(1, 2, 3)">
          <Button label="Open" onClick="dlg.open()"/>
          <ModalDialog id="dlg"><Text>themed</Text></ModalDialog>
        </Theme>
      </App>`);
    await click("Open");
    await screen.findByText("themed");
    expect(dialog()!.closest(".gfui-Theme")).not.toBeNull();
  });
});

describe("a Form in a ModalDialog", () => {
  test("Cancel closes the dialog; a successful submit closes it; keepModalOpenOnSubmit keeps it", async () => {
    show(`
      <App var.log="">
        <Button label="Open" onClick="dlg.open()"/>
        <ModalDialog id="dlg" onClose="log += 'closed;'">
          <Form data="{{ name: 'Ann' }}" onSubmit="(d) => log += 'saved ' + d.name + ';'">
            <TextBox bindTo="name" label="Name"/>
          </Form>
        </ModalDialog>
        <Button label="Open kept" onClick="kept.open()"/>
        <ModalDialog id="kept">
          <Form keepModalOpenOnSubmit="true" onSubmit="log += 'kept;'"><TextBox bindTo="x" label="X"/></Form>
        </ModalDialog>
        <Text>log: {log}</Text>
      </App>`);
    await click("Open");
    await clickIn("Cancel");
    await waitFor(() => expect(text("log:")).toBe("log: closed;"));
    await click("Open");
    await clickIn("Save");
    await waitFor(() => expect(text("log:")).toBe("log: closed;saved Ann;closed;"));
    await waitFor(() => expect(dialog()).toBeNull());
    await click("Open kept");
    await clickIn("Save");
    await waitFor(() => expect(text("log:")).toBe("log: closed;saved Ann;closed;kept;"));
    await settle(20);
    expect(dialog()).not.toBeNull();
  });

  test("the form's edits make the dialog dirty: closing asks first", async () => {
    show(`
      <App>
        <Button label="Open" onClick="dlg.open()"/>
        <ModalDialog id="dlg">
          <Form data="{{ name: 'Ann' }}" hideButtonRow="true"><TextBox bindTo="name" label="Name"/></Form>
          <Text>dirty: {dlg.getDirty()}</Text>
        </ModalDialog>
      </App>`);
    await click("Open");
    const input = (await screen.findByLabelText("Name")) as HTMLInputElement;
    await act(async () => fireEvent.change(input, { target: { value: "Bob" } }));
    await waitFor(() => expect(screen.getByText("dirty: true")).toBeTruthy());
    await clickIn("Close");
    await waitFor(() => expect(confirmQueue.get()).toHaveLength(1));
    await answer("Close");
    await waitFor(() => expect(dialog()).toBeNull());
  });
});

describe("Drawer", () => {
  test("open(), close(), isOpen; the header template; open and close events; initiallyOpen", async () => {
    show(`
      <App var.log="">
        <Button label="Open" onClick="drawer.open()"/>
        <Drawer id="drawer" position="right" onOpen="log += 'open;'" onClose="log += 'close;'">
          <property name="headerTemplate"><Text>Filters</Text></property>
          <Button label="Shut" onClick="drawer.close()"/>
        </Drawer>
        <Drawer initiallyOpen="true" hasBackdrop="false"><Text>at start</Text></Drawer>
        <Text>log: {log}</Text>
        <Text>state: {drawer.isOpen}</Text>
      </App>`);
    await screen.findByText("at start");
    await click("Open");
    await screen.findByText("Filters");
    expect(text("state:")).toBe("state: true");
    await clickIn("Shut");
    await waitFor(() => expect(text("log:")).toBe("log: open;close;"));
    expect(text("state:")).toBe("state: false");
  });
});

describe("menus", () => {
  test("DropdownMenu: the trigger opens it; an item's click runs its handler and closes the menu; SubMenuItem; separators", async () => {
    show(`
      <App var.log="">
        <DropdownMenu label="Actions">
          <MenuItem icon="pencil" onClick="log += 'edit;'">Edit</MenuItem>
          <MenuSeparator/>
          <SubMenuItem label="Export">
            <MenuItem onClick="log += 'csv;'">CSV</MenuItem>
          </SubMenuItem>
          <MenuItem enabled="false">Disabled</MenuItem>
        </DropdownMenu>
        <Text>log: {log}</Text>
      </App>`);
    await click("Actions");
    const edit = await screen.findByRole("menuitem", { name: "Edit", hidden: true });
    expect(document.querySelector(".gfui-MenuSeparator")).not.toBeNull();
    expect(screen.getByRole("menuitem", { name: "Disabled", hidden: true }).hasAttribute("disabled") || screen.getByRole("menuitem", { name: "Disabled", hidden: true }).getAttribute("data-disabled") !== null).toBe(true);
    await act(async () => fireEvent.click(edit));
    await waitFor(() => expect(text("log:")).toBe("log: edit;"));
    await waitFor(() => expect(screen.queryByRole("menuitem", { name: "Edit" })).toBeNull());
  });

  test("willOpen returning false keeps it closed; MenuItem `to` navigates", async () => {
    show(`
      <App var.allow="{false}">
        <DropdownMenu label="Guarded" onWillOpen="return allow"><MenuItem to="/next">Next</MenuItem></DropdownMenu>
        <Button label="Allow" onClick="allow = true"/>
        <Text>path: {$pathname}</Text>
      </App>`);
    await click("Guarded");
    await settle(20);
    expect(screen.queryByRole("menuitem", { name: "Next", hidden: true })).toBeNull();
    await click("Allow");
    await click("Guarded");
    await act(async () => fireEvent.click(await screen.findByRole("menuitem", { name: "Next", hidden: true })));
    await waitFor(() => expect(text("path:")).toBe("path: /next"));
  });

  test("ContextMenu: onContextMenu's pointer opens it at the pointer, with $context", async () => {
    show(`
      <App var.log="">
        <Card title="File A" onContextMenu="ev => menu.openAt(ev, { file: 'a.txt' })"/>
        <ContextMenu id="menu" menuWidth="200px">
          <MenuItem onClick="log += 'rename ' + $context.file + ';'">Rename {$context.file}</MenuItem>
        </ContextMenu>
        <Text>log: {log}</Text>
      </App>`);
    const card = screen.getByText("File A").closest(".gfui-Card")!;
    const event = fireEvent.contextMenu(card, { clientX: 120, clientY: 80, button: 2 });
    expect(event).toBe(false);
    const item = await screen.findByRole("menuitem", { name: "Rename a.txt", hidden: true });
    const anchor = document.querySelector<HTMLElement>(".gfui-ContextMenu-anchor")!;
    expect([anchor.style.left, anchor.style.top]).toEqual(["120px", "80px"]);
    await act(async () => fireEvent.click(item));
    await waitFor(() => expect(text("log:")).toBe("log: rename a.txt;"));
  });
});

describe("toast() and confirm()", () => {
  test("toasts render in the App, by kind; toast.remove(id) removes one", async () => {
    show(`
      <App var.id="">
        <Button label="Toast" onClick="toast('Hello'); toast.success('Saved'); id = toast.loading('Working')"/>
        <Button label="Remove" onClick="toast.remove(id)"/>
      </App>`);
    await click("Toast");
    await waitFor(() => expect([...document.querySelectorAll(".gfui-Toast")].map((t) => `${t.getAttribute("data-kind")}:${t.textContent}`)).toEqual(["default:Hello", "success:Saved", "loading:Working"]));
    expect(document.querySelector(".gfui-Toast")!.closest(".gfui-Overlays")).not.toBeNull();
    await click("Remove");
    await waitFor(() => expect(toasts.get().map((t) => t.message)).toEqual(["Hello", "Saved"]));
  });

  test("confirm() from a handler: the dialog's texts and buttons; the answer reaches the handler", async () => {
    show(`
      <App var.answer="none">
        <Button label="Ask" onClick="answer = String(await confirm('Delete', 'Really delete?', 'Delete'))"/>
        <Text>answer: {answer}</Text>
      </App>`);
    await click("Ask");
    await screen.findByText("Really delete?");
    expect(confirmDialog()!.querySelector("h2")!.textContent).toBe("Delete");
    await clickIn("Delete");
    await waitFor(() => expect(text("answer:")).toBe("answer: true"));
    await click("Ask");
    await clickIn("Cancel");
    await waitFor(() => expect(text("answer:")).toBe("answer: false"));
  });
});

describe("APICall: confirmation and notifications", () => {
  const backend = defineBackend({
    seed: { users: [] },
    routes: {
      "POST /api/users": ({ body }) => ({ id: 1, ...(body as object) }),
      "GET /api/missing/:id": () => status(404, { message: "No such thing" }),
    },
  });
  let server: ReturnType<typeof startTestServer>;
  beforeAll(() => {
    server = startTestServer(backend);
  });
  afterAll(() => server.close());
  beforeEach(() => setDataDefaults({ jitter: false }));
  afterEach(() => {
    resetDataState();
    backend.reset();
  });

  test("confirmMessage asks first: Cancel skips the request; the notification messages show with $result and $error", async () => {
    show(`
      <App var.log="">
        <APICall id="save" method="post" url="/api/users" body="{{ name: $param }}"
                 confirmTitle="Create" confirmMessage="Create {$param}?" confirmButtonLabel="Create"
                 completedNotificationMessage="Created {$result.name}"
                 onSuccess="log += 'ok;'"/>
        <APICall id="fail" method="get" url="/api/missing/1" errorNotificationMessage="Failed: {$error.status}"/>
        <Button label="Save" onClick="save.execute('Zed')"/>
        <Button label="Fail" onClick="fail.execute()"/>
        <Text>log: {log}</Text>
      </App>`);
    await click("Save");
    await waitFor(() => expect(confirmQueue.get()[0]).toMatchObject({ title: "Create", message: "Create Zed?", actionLabel: "Create" }));
    await answer("Cancel");
    await settle(30);
    expect(text("log:")).toBe("log: ");
    expect(backend.log()).toEqual([]);
    await click("Save");
    await answer("Create");
    await waitFor(() => expect(text("log:")).toBe("log: ok;"));
    await waitFor(() => expect(toasts.get().map((t) => `${t.kind}:${t.message}`)).toContain("success:Created Zed"));
    await click("Fail");
    await waitFor(() => expect(toasts.get().map((t) => `${t.kind}:${t.message}`)).toContain("error:Failed: 404"));
    expect(errors).toEqual([]);
  });
});
