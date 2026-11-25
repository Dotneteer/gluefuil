// Step 26 in jsdom: the date and time formats (date-format.ts), and DateInput,
// TimeInput and DatePicker through compiled markup (their lazy chunk), alone,
// in a Form, and prerendered.
import { compileModule } from "@gluefuil/compiler";
import { loadModule } from "@gluefuil/runtime";
import { renderStatic, resetServerState, takeServerLoads } from "@gluefuil/runtime/server";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, test } from "vitest";
import * as components from "../src/index";
import { preloadDates } from "../src/index";
import {
  dateToIso,
  formatDate,
  formatShape,
  formatTime,
  isDisabledDate,
  isoToDate,
  parseDate,
  parseTime,
  presetRange,
  resolvePresets,
  withinLimits,
} from "../src/date-format";

afterEach(cleanup);
beforeAll(() => preloadDates());

function load(markup: string) {
  const { code, diagnostics } = compileModule(markup, { format: "function" });
  expect(diagnostics).toEqual([]);
  return loadModule(code, { components });
}
async function show(markup: string) {
  const Main = load(markup);
  const result = render(<Main />);
  await act(async () => {});
  return result.container;
}
const text = (pattern: RegExp) => screen.getByText(pattern).textContent;
const click = (element: Element) => act(async () => fireEvent.click(element));
const type = (element: Element, value: string) => act(async () => fireEvent.change(element, { target: { value } }));

describe("date-format", () => {
  test.each<[format: string, text: string, iso: string | null]>([
    ["MM/dd/yyyy", "05/25/2024", "2024-05-25"],
    ["MM/dd/yyyy", "5/7/2024", "2024-05-07"],
    ["MM-dd-yyyy", "05-25-2024", "2024-05-25"],
    ["yyyy/MM/dd", "2024/05/25", "2024-05-25"],
    ["yyyy-MM-dd", "2024-05-25", "2024-05-25"],
    ["dd/MM/yyyy", "25/05/2024", "2024-05-25"],
    ["dd-MM-yyyy", "25-05-2024", "2024-05-25"],
    ["yyyyMMdd", "20240525", "2024-05-25"],
    ["MMddyyyy", "05252024", "2024-05-25"],
    ["MM/dd/yyyy", "2024-05-25", "2024-05-25"],
    ["MM/dd/yyyy", "02/30/2024", null],
    ["MM/dd/yyyy", "02/29/2023", null],
    ["MM/dd/yyyy", "02/29/2024", "2024-02-29"],
    ["MM/dd/yyyy", "25/05/2024", null],
    ["MM/dd/yyyy", "nonsense", null],
    ["unknown", "05/25/2024", "2024-05-25"],
  ])("%s: %s → %s", (format, value, iso) => {
    expect(dateToIso(value, format)).toBe(iso);
    if (iso && format !== "unknown") expect(isoToDate(iso, format)).toBe(formatDate(parseDate(value, format)!, format));
  });

  test("formatShape and formatDate: the order and the separator", () => {
    expect(formatShape("dd-MM-yyyy")).toEqual({ order: ["dd", "MM", "yyyy"], separator: "-" });
    expect(formatShape("yyyyMMdd")).toEqual({ order: ["yyyy", "MM", "dd"], separator: "" });
    expect(formatDate({ year: 2024, month: 5, day: 7 }, "dd/MM/yyyy")).toBe("07/05/2024");
    expect(isoToDate("2024-05-07", undefined)).toBe("05/07/2024");
  });

  test("withinLimits and isDisabledDate (XMLUI's matchers)", () => {
    expect(withinLimits("2024-05-25", "05/01/2024", "05/31/2024", "MM/dd/yyyy")).toBe(true);
    expect(withinLimits("2024-06-01", undefined, "05/31/2024", "MM/dd/yyyy")).toBe(false);
    const f = "MM/dd/yyyy";
    expect(isDisabledDate("2024-05-25", "05/25/2024", f)).toBe(true);
    expect(isDisabledDate("2024-05-25", ["05/24/2024", "05/25/2024"], f)).toBe(true);
    expect(isDisabledDate("2024-05-25", { from: "05/20/2024", to: "05/25/2024" }, f)).toBe(true);
    expect(isDisabledDate("2024-05-26", { from: "05/20/2024", to: "05/25/2024" }, f)).toBe(false);
    expect(isDisabledDate("2024-05-19", { before: "05/20/2024" }, f)).toBe(true);
    expect(isDisabledDate("2024-05-20", { before: "05/20/2024" }, f)).toBe(false);
    expect(isDisabledDate("2024-05-21", { after: "05/20/2024" }, f)).toBe(true);
    expect(isDisabledDate("2024-05-15", { after: "05/10/2024", before: "05/20/2024" }, f)).toBe(true);
    expect(isDisabledDate("2024-05-10", { after: "05/10/2024", before: "05/20/2024" }, f)).toBe(false);
    expect(isDisabledDate("2024-05-25", { dayOfWeek: [0, 6] }, f)).toBe(true); // a Saturday
    expect(isDisabledDate("2024-05-24", { dayOfWeek: 6 }, f)).toBe(false);
    expect(isDisabledDate("2024-05-24", true, f)).toBe(true);
  });

  test("presets: XMLUI's (zag.js) ranges relative to today; keys, labels, custom ranges", () => {
    const today = "2024-05-15"; // a Wednesday
    expect(presetRange("last7Days", today)).toEqual(["2024-05-09", "2024-05-15"]);
    expect(presetRange("last30Days", today)).toEqual(["2024-04-16", "2024-05-15"]);
    expect(presetRange("thisMonth", today)).toEqual(["2024-05-01", "2024-05-15"]);
    expect(presetRange("lastMonth", today)).toEqual(["2024-04-01", "2024-04-30"]);
    expect(presetRange("thisWeek", today)).toEqual(["2024-05-12", "2024-05-18"]);
    expect(presetRange("thisWeek", today, 1)).toEqual(["2024-05-13", "2024-05-19"]);
    expect(presetRange("lastWeek", today)).toEqual(["2024-05-05", "2024-05-11"]);
    expect(presetRange("thisQuarter", today)).toEqual(["2024-04-01", "2024-05-15"]);
    expect(presetRange("lastQuarter", today)).toEqual(["2024-01-01", "2024-03-31"]);
    expect(presetRange("lastYear", today)).toEqual(["2023-01-01", "2023-12-31"]);
    expect(resolvePresets(undefined, undefined, today)).toEqual([]);
    expect(resolvePresets(undefined, true, today).map((p) => p.label)).toEqual(["Last 7 days", "Last 30 days", "This month", "Last month"]);
    expect(resolvePresets("last 3 days, thisYear", undefined, today).map((p) => p.label)).toEqual(["Last 3 days", "This year"]);
    expect(resolvePresets([{ value: "last7Days", label: "A week" }, { label: "May", from: "05/01/2024", to: "05/31/2024" }], undefined, today)).toEqual([
      { label: "A week", value: ["2024-05-09", "2024-05-15"] },
      { label: "May", value: ["2024-05-01", "2024-05-31"] },
    ]);
    expect(resolvePresets(["thisWeek"], false, today)).toEqual([]);
  });

  test("times: 24-hour and 12-hour, seconds; invalid times", () => {
    expect(parseTime("14:05")).toEqual({ hours: 14, minutes: 5, seconds: 0 });
    expect(parseTime("02:05:09 pm")).toEqual({ hours: 14, minutes: 5, seconds: 9 });
    expect(parseTime("12:00 am")).toEqual({ hours: 0, minutes: 0, seconds: 0 });
    expect(["25:00", "12:60", "13:00 pm", "x"].map(parseTime)).toEqual([undefined, undefined, undefined, undefined]);
    expect(formatTime({ hours: 14, minutes: 5, seconds: 9 }, true, false)).toBe("14:05");
    expect(formatTime({ hours: 14, minutes: 5, seconds: 9 }, true, true)).toBe("14:05:09");
    expect(formatTime({ hours: 0, minutes: 5, seconds: 0 }, false, false)).toBe("12:05 am");
    expect(formatTime({ hours: 14, minutes: 5, seconds: 0 }, false, false)).toBe("02:05 pm");
  });
});

/** The fields of a date input, in their order. */
const fields = (container: Element, label: string) => {
  const root = [...container.querySelectorAll(".mantine-InputWrapper-root")].find((r) => r.querySelector("label")?.textContent === label)!;
  return [...root.querySelectorAll("input:not([type=hidden])")] as HTMLInputElement[];
};

describe("DateInput", () => {
  test("the fields follow dateFormat; initialValue; typing a full date gives the value in dateFormat; isoValue()", async () => {
    const container = await show(`
      <App var.log="">
        <DateInput id="d" label="Born" dateFormat="dd/MM/yyyy" initialValue="25/05/2024" onDidChange="(v) => log = v"/>
        <Text>value: {d.value} iso: {d.isoValue()} log: {log}</Text>
      </App>`);
    const [day, month, year] = fields(container, "Born");
    expect([day!.value, month!.value, year!.value]).toEqual(["25", "05", "2024"]);
    expect(text(/^value:/)).toBe("value: 25/05/2024 iso: 2024-05-25 log: ");
    await type(day!, "07");
    expect(text(/^value:/)).toBe("value: 07/05/2024 iso: 2024-05-07 log: 07/05/2024");
  });
});

describe("DateInput, more", () => {
  test("an ISO initialValue and setValue are normalized to dateFormat; setValue fires no didChange", async () => {
    await show(`
      <App var.log="none">
        <DateInput id="d" label="D" initialValue="2024-05-25" onDidChange="log = 'changed'"/>
        <Button label="Set" onClick="d.setValue('2025-01-02')"/>
        <Text>value: {d.value} log: {log}</Text>
      </App>`);
    expect(text(/^value:/)).toBe("value: 05/25/2024 log: none");
    await click(screen.getByRole("button", { name: "Set" }));
    expect(text(/^value:/)).toBe("value: 01/02/2025 log: none");
  });

  test("minValue/maxValue are dates: outside them the input is in error and the value is null", async () => {
    const container = await show(`
      <App>
        <DateInput id="d" label="In 2026" minValue="01/01/2026" maxValue="12/31/2026"/>
        <Text>value: {d.value === null ? 'null' : d.value}</Text>
      </App>`);
    const [month, day, year] = fields(container, "In 2026");
    await type(month!, "03");
    await type(day!, "04");
    await type(year!, "2025");
    expect(text(/^value:/)).toBe("value: null");
    expect(container.querySelector(".gfui-DateInput .mantine-Input-input[data-error]")).not.toBeNull();
    await type(year!, "2026");
    expect(text(/^value:/)).toBe("value: 03/04/2026");
    expect(container.querySelector(".gfui-DateInput .mantine-Input-input[data-error]")).toBeNull();
  });
});

describe("TimeInput", () => {
  test("24-hour: HH:mm; 12-hour with seconds: hh:mm:ss am; isoValue(); the fields", async () => {
    const container = await show(`
      <App>
        <TimeInput id="a" label="A" initialValue="07:30"/>
        <TimeInput id="b" label="B" hour24="false" seconds="true" initialValue="14:15:05"/>
        <Text>a: {a.value} b: {b.value} iso: {b.isoValue()}</Text>
      </App>`);
    expect(text(/^a:/)).toBe("a: 07:30 b: 02:15:05 pm iso: 14:15:05");
    const [hours, minutes] = fields(container, "A");
    expect([hours!.value, minutes!.value]).toEqual(["07", "30"]);
    await type(minutes!, "45");
    expect(text(/^a:/)).toBe("a: 07:45 b: 02:15:05 pm iso: 14:15:05");
  });

  test("minTime/maxTime: a typed time outside them fires invalidTime", async () => {
    const container = await show(`
      <App var.invalid="none">
        <TimeInput id="t" label="Office" minTime="09:00" maxTime="17:00" onInvalidTime="(v) => invalid = v"/>
        <Text>invalid: {invalid}</Text>
      </App>`);
    const [hours, minutes] = fields(container, "Office");
    await type(hours!, "18");
    await type(minutes!, "30");
    expect(text(/^invalid:/)).toBe("invalid: 18:30");
  });
});

describe("DatePicker", () => {
  // `hidden`: in jsdom the popup's dropdown is display: none (Floating UI sees a zero-size target).
  const day = (name: string, hidden = false) => screen.getAllByRole("button", { name, hidden }).find((b) => !b.hasAttribute("data-outside"))!;

  test("inline: the calendar opens on the value's month; a click picks a day (in dateFormat); disabledDates and weekStartsOn", async () => {
    await show(`
      <App var.log="none">
        <DatePicker id="p" label="Day" inline="true" initialValue="2026-06-10" dateFormat="dd/MM/yyyy"
          disabledDates="{[{ dayOfWeek: [0, 6] }, '19/06/2026']}" weekStartsOn="1" onDidChange="(v) => log = v"/>
        <Text>value: {p.value} log: {log}</Text>
      </App>`);
    expect(text(/^value:/)).toBe("value: 10/06/2026 log: none");
    expect(screen.getByText("June 2026")).toBeTruthy();
    expect([...document.querySelectorAll(".mantine-DatePicker-weekday")].map((e) => e.textContent)[0]).toBe("Mon");
    expect(day("June 19, 2026").hasAttribute("disabled") || day("June 19, 2026").getAttribute("data-disabled") === "true").toBe(true);
    expect(day("June 20, 2026").hasAttribute("disabled") || day("June 20, 2026").getAttribute("data-disabled") === "true").toBe(true);
    await click(day("June 17, 2026"));
    expect(text(/^value:/)).toBe("value: 17/06/2026 log: 17/06/2026");
  });

  test("range: the value changes when both ends are set; { from, to }; presets", async () => {
    await show(`
      <App var.log="none">
        <DatePicker id="r" label="Trip" inline="true" mode="range" initialValue="{{ from: '2026-06-01', to: '2026-06-03' }}" onDidChange="(v) => log = JSON.stringify(v)"
          presets="{[{ label: 'June', from: '06/01/2026', to: '06/30/2026' }]}"/>
        <Text>value: {JSON.stringify(r.value)} log: {log}</Text>
      </App>`);
    expect(text(/^value:/)).toBe('value: {"from":"06/01/2026","to":"06/03/2026"} log: none');
    await click(day("June 10, 2026"));
    expect(text(/^value:/)).toBe('value: {"from":"06/01/2026","to":"06/03/2026"} log: none');
    await click(day("June 12, 2026"));
    expect(text(/^value:/)).toBe('value: {"from":"06/10/2026","to":"06/12/2026"} log: {"from":"06/10/2026","to":"06/12/2026"}');
    await click(screen.getByRole("button", { name: "June" }));
    expect(text(/^value:/)).toBe('value: {"from":"06/01/2026","to":"06/30/2026"} log: {"from":"06/01/2026","to":"06/30/2026"}');
  });

  test("in a popup: typed fields, a button opens the calendar; a picked day closes it", async () => {
    const container = await show(`
      <App>
        <DatePicker id="p" label="Due" initialValue="06/15/2026"/>
        <Text>value: {p.value}</Text>
      </App>`);
    const [month] = fields(container, "Due");
    expect(month!.value).toBe("06");
    const toggle = screen.getByRole("button", { name: "Open the calendar" });
    await click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    // The popover mounts its dropdown after its transition starts.
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    await click(day("June 20, 2026", true));
    expect(text(/^value:/)).toBe("value: 06/20/2026");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });

  test("locale: month and weekday names from Intl", async () => {
    await show(`<App><DatePicker label="DE" inline="true" locale="de-DE" initialValue="2026-03-02"/></App>`);
    expect(screen.getByText("März 2026")).toBeTruthy();
  });
});

describe("in a Form", () => {
  test("bindTo: the form's values in XMLUI's strings; required; submit", async () => {
    await show(`
      <App var.saved="">
        <Form data="{{ arrival: '', checkIn: '15:00', nights: { from: '07/01/2026', to: '07/05/2026' } }}" onSubmit="(d) => saved = JSON.stringify(d)">
          <DateInput bindTo="arrival" label="Arrival" required="true" requiredInvalidMessage="Enter the arrival date"/>
          <TimeInput bindTo="checkIn" label="Check-in"/>
          <DatePicker bindTo="nights" label="Nights" mode="range"/>
        </Form>
        <Text>saved: {saved}</Text>
      </App>`);
    await click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText("Enter the arrival date")).toBeTruthy();
    const [month, dayField, year] = fields(document.body, "Arrival");
    await type(month!, "07");
    await type(dayField!, "01");
    await type(year!, "2026");
    await click(screen.getByRole("button", { name: "Save" }));
    expect(text(/^saved:/)).toBe('saved: {"arrival":"07/01/2026","checkIn":"15:00","nights":{"from":"07/01/2026","to":"07/05/2026"}}');
  });
});

describe("the prerender", () => {
  test("the chunk's components render statically (the fields' values, an inline calendar)", () => {
    resetServerState();
    const Main = load(`
      <App>
        <DateInput label="D" initialValue="05/25/2024"/>
        <TimeInput label="T" initialValue="07:30"/>
        <DatePicker label="P" inline="true" initialValue="2026-06-10"/>
      </App>`);
    const { html } = renderStatic(<Main />);
    expect(takeServerLoads()).toEqual([]);
    expect(html).toContain('value="2024"');
    expect(html).toContain('value="30"');
    expect(html).toContain("June 2026");
  });
});
