// One-off smoke test: renders the burn-down webview's HTML in real Chrome,
// feeds it a postMessage 'update' payload built from real parsed session
// data (same shape BurndownPanel.update sends), and checks it actually
// renders instead of erroring silently. Not part of the build.
import { chromium } from "playwright";
import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

// Use tsx to import the TS modules directly and dump the payload as JSON.
execSync(`npx tsx scripts/buildSmoketestPayload.ts`, { cwd: root, stdio: "inherit" });

const payload = JSON.parse(fs.readFileSync(path.join(root, "scripts/.smoketest-payload.json"), "utf-8"));
let html = fs.readFileSync(path.join(root, "scripts/.smoketest-html.html"), "utf-8");
// Drop the CSP meta tag for this browser smoke test only — the real CSP is
// enforced by the VS Code webview host, not by this script. Inject a stub
// for VS Code's webview API, which only exists inside a real webview host,
// directly into <head> so it runs before the page's own script does.
html = html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/, "");
html = html.replace(
  "</head>",
  `<script>window.acquireVsCodeApi = () => ({ postMessage: () => {} });</script></head>`
);

const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 900, height: 500 } });

const consoleErrors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});
page.on("pageerror", (err) => consoleErrors.push(String(err)));

await page.setContent(html, { waitUntil: "load" });
await page.evaluate((data) => window.postMessage(data, "*"), payload);
await page.waitForTimeout(300);

const headlineText = await page.locator("#headline").innerText();
const canvasSize = await page.locator("#chart").evaluate((el) => ({ w: el.width, h: el.height }));
const sourceLine = await page.locator("#source-line").innerText();
const leaksCountBefore = await page.locator("#leaks-count").innerText();

const shotPath = path.join(root, "scripts/.smoketest-screenshot.png");
await page.screenshot({ path: shotPath });

// Verify the dismiss button actually removes the card (UISpec §6).
await page.locator(".dismiss-btn").first().click();
const leaksCountAfter = await page.locator("#leaks-count").innerText();
const emptyStateShown = (await page.locator(".leaks-empty").count()) > 0;

await browser.close();

console.log("=== Webview smoke test ===");
console.log("console/page errors:", consoleErrors.length ? consoleErrors : "none");
console.log("headline text:\n" + headlineText);
console.log("canvas size:", canvasSize);
console.log("source line:", sourceLine);
console.log("leaks count before/after dismiss:", leaksCountBefore, "/", leaksCountAfter, "empty state shown:", emptyStateShown);
console.log("screenshot:", shotPath);

fs.rmSync(path.join(root, "scripts/.smoketest-payload.json"), { force: true });
fs.rmSync(path.join(root, "scripts/.smoketest-html.html"), { force: true });

if (consoleErrors.length > 0) process.exit(1);
if (canvasSize.w < 10 || canvasSize.h < 10) {
  console.error("canvas did not render (too small)");
  process.exit(1);
}
if (Number(leaksCountAfter) !== Number(leaksCountBefore) - 1) {
  console.error("dismiss did not remove exactly one finding card");
  process.exit(1);
}
if (leaksCountAfter === "0" && !emptyStateShown) {
  console.error("count hit zero but empty state wasn't shown");
  process.exit(1);
}
