// Renders build/icon.png (1024px) from the Fathom mark. Run: npx electron scripts/make-icon.cjs
const { app, BrowserWindow } = require("electron");
const { writeFileSync, mkdirSync } = require("node:fs");
const { join } = require("node:path");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#1b1c1f"/><stop offset="1" stop-color="#0b0b0c"/>
    </linearGradient>
    <linearGradient id="line" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#dfe3ea"/><stop offset="1" stop-color="#7f9bb3"/>
    </linearGradient>
  </defs>
  <rect x="64" y="64" width="896" height="896" rx="200" fill="url(#bg)"/>
  <rect x="64.5" y="64.5" width="895" height="895" rx="200" fill="none" stroke="#ffffff" stroke-opacity="0.08"/>
  <g transform="translate(192 176) scale(40)" fill="none" stroke="url(#line)" stroke-width="1.25" stroke-linecap="round">
    <path d="M8 1.5v13M4.5 4.5H8M3.5 8H8M5 11.5H8"/>
  </g>
  <circle cx="512" cy="744" r="46" fill="#7f9bb3"/>
</svg>`;

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1024, height: 1024, show: false, frame: false, transparent: true, webPreferences: { offscreen: true } });
  await win.loadURL(`data:text/html,${encodeURIComponent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`)}`);
  await new Promise((r) => setTimeout(r, 300));
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: 1024, height: 1024 });
  mkdirSync(join(__dirname, "..", "build"), { recursive: true });
  writeFileSync(join(__dirname, "..", "build", "icon.png"), img.resize({ width: 1024, height: 1024 }).toPNG());
  app.quit();
});
