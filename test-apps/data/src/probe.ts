// A page without gfui: plain fetch calls, so the E2E test can see what the
// browser does with the backend's answers in each host (data-hosts.spec.ts).
const out = document.getElementById("out")!;
const results: Record<string, unknown> = {};
const users = await fetch("/api/users");
results.users = { status: users.status, body: await users.json() };
out.textContent = JSON.stringify(results);
out.dataset.ready = "";
export {};
