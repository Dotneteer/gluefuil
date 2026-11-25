import { expect, test } from "@playwright/test";

// Build-time compilation (step 12): the production build of test-apps/hello,
// served under `Content-Security-Policy: script-src 'self'`. Anything that
// needs eval (`new Function`) would be blocked and reported as a violation.
// The shared hello specs also run against this build (project hello-build).
test("the built app runs under a strict CSP, fetching no markup", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (request) => requests.push(new URL(request.url()).pathname));
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.addInitScript(() => {
    (window as unknown as { cspViolations: string[] }).cspViolations = [];
    document.addEventListener("securitypolicyviolation", (event) =>
      (window as unknown as { cspViolations: string[] }).cspViolations.push(`${event.violatedDirective}: ${event.blockedURI}`),
    );
  });

  const response = await page.goto("/");
  expect(response!.headers()["content-security-policy"]).toBe("script-src 'self'");

  // The app is interactive: compiled handlers and bindings run.
  const count = page.getByText(/^Count: \d+$/);
  await expect(count).toHaveText("Count: 0");
  await page.getByRole("button", { name: "Increment", exact: true }).click();
  await expect(count).toHaveText("Count: 1");

  // Nothing the app did violated the policy.
  const violations = () => page.evaluate(() => (window as unknown as { cspViolations: string[] }).cspViolations);
  expect(await violations()).toEqual([]);
  expect(errors).toEqual([]);

  // The control: the policy really is enforced. A string timer is eval run by
  // the page itself (page.evaluate goes through DevTools, which CSP exempts).
  await page.evaluate(() => {
    (setTimeout as (code: string) => void)("window.evalRan = true");
  });
  await expect.poll(violations).toEqual([expect.stringMatching(/^script-src/)]);
  expect(await page.evaluate(() => (window as unknown as { evalRan?: boolean }).evalRan)).toBeUndefined();

  // Only built assets: no .gui source, no compiler.
  expect(requests.filter((path) => path.endsWith(".gui") || path.includes("/packages/"))).toEqual([]);
  expect(requests.some((path) => /^\/assets\/index-[\w-]+\.js$/.test(path))).toBe(true);
});
