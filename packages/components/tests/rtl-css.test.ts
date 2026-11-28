// Step 34: the stylesheet uses logical properties, so an RTL locale mirrors the
// layout (XMLUI's lint-physical-css script, as a test). A physical property
// needs a reason, listed here.
import { expect, test } from "vitest";
import { BASE_STYLESHEET } from "../src/styles";

const PHYSICAL = /(^|[\s;{])((margin|padding|border)-(left|right)(-[a-z]+)?|left|right)\s*:|text-align:\s*(left|right)|translateX\(/;

/** Declarations that may stay physical, and why. */
const ALLOWED: [RegExp, string][] = [
  [/transform: translateX\(-100%\);/, "the drawer's slide; [dir=rtl] has the mirror rule"],
  [/\[dir="rtl"\] \.gfui-NavPanel \{ transform: translateX\(100%\); \}/, "the drawer's RTL mirror"],
  [/^\s*left: 0;$/, "the overlay layer's fixed origin (portals position themselves)"],
  [/data-anchor\$="-left"\] \{ left:/, "a List checkbox anchored to the left by its prop (an explicit side)"],
  [/data-anchor\$="-right"\] \{ right:/, "a List checkbox anchored to the right by its prop"],
  [/^\s*left: 50%;$/, "the SkipLink, centred"],
  [/^\s*transform: translateX\(-50%\);$/, "the SkipLink, centred"],
  [/ToneSwitch-thumb \{ transform: translateX\(-?1\.45em\)/, "the ToneSwitch thumb; [dir=rtl] has the mirror rule"],
];

test("no physical property without a reason", () => {
  const unexplained = BASE_STYLESHEET.split("\n").filter((line) => PHYSICAL.test(line) && !ALLOWED.some(([pattern]) => pattern.test(line)));
  expect(unexplained).toEqual([]);
});

test("each allowed exception still exists (the list stays honest)", () => {
  const lines = BASE_STYLESHEET.split("\n");
  for (const [pattern, why] of ALLOWED) expect(lines.some((line) => pattern.test(line)), why).toBe(true);
});
