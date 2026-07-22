/**
 * Responsive regression check: visits every route at every target viewport
 * and fails on horizontal overflow (any route) or page-level scrolling on
 * the chat workspace.
 *
 * Prereqs: backend on :8000, `npm run dev` on :5173, system chromium.
 * Run:     node scripts/responsive-check.mjs
 */
import puppeteer from "puppeteer-core";

const API = process.env.API_BASE || "http://localhost:8000";
const BASE = process.env.APP_BASE || "http://localhost:5173";
const CHROMIUM = process.env.CHROMIUM_PATH || "/usr/bin/chromium";

const viewports = [
  ["4K", 3840, 2160],
  ["2560x1600", 2560, 1600],
  ["2560x1440", 2560, 1440],
  ["1920x1200", 1920, 1200],
  ["1920x1080", 1920, 1080],
  ["1600x900", 1600, 900],
  ["1536x864", 1536, 864],
  ["1440x900", 1440, 900],
  ["1366x768", 1366, 768],
  ["1280x720", 1280, 720],
  ["tablet", 820, 1180],
  ["mobile-portrait", 390, 844],
  ["mobile-landscape", 844, 390],
];

const routes = [
  "/", "/login", "/register", "/forgot-password", "/docs", "/faq", "/about",
  "/privacy", "/terms", "/contact",
  "/app/dashboard", "/app/chat", "/app/studio", "/app/history",
  "/app/forensics", "/app/settings",
];

// Throwaway account so /app routes render authenticated.
const suffix = Date.now().toString(36);
const res = await fetch(`${API}/api/auth/register`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    username: `respcheck_${suffix}`,
    email: `respcheck_${suffix}@test.dev`,
    password: "Xk9#mQ2vLp",
  }),
});
if (!res.ok) throw new Error(`register failed: ${res.status} ${await res.text()}`);
const reg = await res.json();
const authState = JSON.stringify({
  state: {
    user: reg.user,
    accessToken: reg.tokens.access_token,
    refreshToken: reg.tokens.refresh_token,
    isAuthenticated: true,
  },
  version: 0,
});

const browser = await puppeteer.launch({
  executablePath: CHROMIUM,
  args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"],
});
const page = await browser.newPage();
await page.evaluateOnNewDocument((auth) => {
  localStorage.setItem("stego-auth", auth);
  // Disable animations so measurements are stable.
  localStorage.setItem(
    "stego-theme",
    JSON.stringify({ state: { theme: "dark", accent: "violet", animations: false }, version: 0 }),
  );
}, authState);

let failures = 0;
for (const [name, w, h] of viewports) {
  await page.setViewport({ width: w, height: h });
  for (const route of routes) {
    await page.goto(BASE + route, { waitUntil: "networkidle0", timeout: 30000 });
    await new Promise((r) => setTimeout(r, 400));
    const m = await page.evaluate(() => {
      const de = document.documentElement;
      const wide = [...document.querySelectorAll("body *")]
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return (
            r.width > 0 &&
            r.right > window.innerWidth + 1 &&
            getComputedStyle(el).position !== "fixed"
          );
        })
        .slice(0, 3)
        .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).split(" ")[0]}`);
      return {
        hScroll: de.scrollWidth > window.innerWidth + 1,
        pageScroll: de.scrollHeight > window.innerHeight + 1,
        wide,
      };
    });
    const problems = [];
    if (m.hScroll) problems.push(`horizontal overflow (${m.wide.join(", ")})`);
    if (route === "/app/chat" && m.pageScroll) problems.push("page scroll on chat");
    if (problems.length) {
      failures++;
      console.log(`FAIL ${name} ${route}: ${problems.join("; ")}`);
    }
  }
  console.log(`✓ ${name}`);
}
console.log(failures === 0 ? "ALL CLEAR" : `${failures} failures`);
await browser.close();
process.exit(failures === 0 ? 0 : 1);
