// Step 32B: action elements inside <event> (APICall, FileUpload, FileDownload):
// what compiles, what is reported, the generated code.
// Design: .ai/plan/poc-32b-files.md § G
import { describe, expect, test } from "vitest";
import { compileModule } from "../../src/index";

const problems = (markup: string) =>
  compileModule(markup, { sourceMap: false }).diagnostics.map((d) => [d.severity ?? "error", d.code, markup.slice(d.start, d.end)]);
const code = (markup: string) => compileModule(markup, { sourceMap: false }).code;

describe("action elements in <event>", () => {
  test.each<[string, string, string[][]]>([
    ["an APICall", '<App><Button><event name="click"><APICall url="/api/x/{$param.clientX}" method="post"/></event></Button></App>', []],
    ["a FileUpload with handlers (attribute and <event>)", '<App var.n="{0}"><FileUploadDropZone><event name="upload"><FileUpload url="/u" file="{$param[0]}" onSuccess="n++"><event name="error">n--</event></FileUpload></event></FileUploadDropZone></App>', []],
    ["a FileDownload", '<App><Button><event name="click"><FileDownload url="/f" fileName="a.pdf"/></event></Button></App>', []],
    ["a FileUpload outside <event>", '<App><FileUpload url="/u"/></App>', [["error", "E037", "FileUpload"]]],
    ["an action without its required url", '<App><Button><event name="click"><FileDownload/></event></Button></App>', [["error", "E021", "FileDownload"]]],
    ["an id on an action in <event>", '<App><Button><event name="click"><APICall id="a" url="/x"/></event></Button></App>', [["error", "E002", "id"]]],
    ["an unknown prop", '<App><Button><event name="click"><FileUpload url="/u" chunkSize="5"/></event></Button></App>', [["error", "E020", "chunkSize"]]],
    ["an unknown event (progress waits for XHR)", '<App><Button><event name="click"><FileUpload url="/u" onProgress="x = 1"/></event></Button></App>', [["error", "E004", "onProgress"]]],
    ["a component that isn't an action", '<App><Button><event name="click"><Text/></event></Button></App>', [["error", "E002", "event"]]],
    ["two actions", '<App><Button><event name="click"><APICall url="/a"/><APICall url="/b"/></event></Button></App>', [["error", "E002", "event"]]],
  ])("%s", (_, markup, expected) => {
    expect(problems(markup)).toEqual(expected);
  });

  test("compiles to actionHandler with the props deferred and the handlers hoisted", () => {
    const out = code('<App var.n="{0}"><Button><event name="click"><APICall url="/api/{$param.clientX}" method="post" onSuccess="n++"/></event></Button></App>');
    expect(out).toContain("actionHandler as $$action");
    expect(out).toMatch(/"onClick": \(\$\$s\) => \$\$action\(\$\$C_APICall, \{ "url": \$\$deferred\(\$\$s, \$\$d\d+\), "method": "post" \}, \$\$e\d+, \$\$s\)/);
    expect(out).toContain('import { APICall as $$C_APICall');
  });
});
