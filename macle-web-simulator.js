#!/usr/bin/env node
/**
 * Macle MiniProgram Standalone Web Simulator
 * Runs on pure Node.js (no Electron GUI dependencies needed)
 * Compatible with Linux, macOS, and Windows
 */

const path = require("path");
const fs = require("fs");
const EventEmitter = require("events");
const Module = require("module");

// Locate resources/app
const possibleAppDirs = [
  path.join(__dirname, "Macle_25.9.0_DevSuite_Simulator_Linux/resources/app"),
  path.join(__dirname, "Macle_25.9.0_DevSuite_Simulator_Win/resources/app"),
  path.join(__dirname, "resources/app")
];

let appDir = possibleAppDirs.find(d => fs.existsSync(d));
if (!appDir) {
  console.error("Error: Could not find Macle simulator resources/app directory.");
  process.exit(1);
}

const mainJsPath = path.join(appDir, "out/main.js");

// Electron Mock for pure Node.js execution
const app = new EventEmitter();
app.commandLine = { appendSwitch: () => {} };
app.dock = { hide: () => {} };
app.quit = () => process.exit(0);
app.whenReady = () => Promise.resolve();

class MockWebContents extends EventEmitter {
  constructor() {
    super();
    this.session = {
      webRequest: { onHeadersReceived: () => {} }
    };
  }
  send() {}
}

class MockBrowserWindow extends EventEmitter {
  constructor() {
    super();
    this.webContents = new MockWebContents();
  }
  loadURL() {}
  hide() {}
  show() {}
  removeAllListeners() {}
  setMenuBarVisibility() {}
  setContentSize() {}
  getContentSize() { return [375, 667]; }
}

const mockElectron = {
  app,
  protocol: { registerFileProtocol: () => {} },
  BrowserWindow: MockBrowserWindow,
  BrowserView: class {},
  ipcMain: new EventEmitter(),
  webContents: { fromId: () => null },
  globalShortcut: { register: () => {}, unregister: () => {} },
  screen: { getPrimaryDisplay: () => ({ size: { width: 1920, height: 1080 } }) }
};

// Hook require("electron")
const origRequire = Module.prototype.require;
Module.prototype.require = function(modPath) {
  if (modPath === "electron") return mockElectron;
  return origRequire.apply(this, arguments);
};

// Help command
if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(`
Macle MiniProgram Web Simulator
Usage:
  node macle-web-simulator.js [options]

Options:
  -s, --source <path>   Path to compiled macle code (e.g. sample-project/dist) [required]
  -r, --root <path>     Path to project root directory
  -m, --mode <mode>     Mode: debug or preview (default: debug)
  -o, --only-server     Start server only, do not open browser
  -w, --web             Start web simulator (default: true)
  -h, --help            Show this help message
`);
  process.exit(0);
}

// Add --web if not present
if (!process.argv.includes("--web") && !process.argv.includes("-w")) {
  process.argv.push("--web");
}

// If no source path provided, search for nearest project or sample-project
const hasSource = process.argv.includes("-s") || process.argv.includes("--source");
if (!hasSource) {
  const candidate = path.resolve(__dirname, "../../sample-project/dist");
  if (fs.existsSync(candidate)) {
    console.log(`[Simulator] Auto-detected source directory: ${candidate}`);
    process.argv.push("-s", candidate);
  }
}

const hasRoot = process.argv.includes("-r") || process.argv.includes("--root");
if (!hasRoot) {
  const candidate = path.resolve(__dirname, "../../sample-project");
  if (fs.existsSync(candidate)) {
    process.argv.push("-r", candidate);
  }
}

// Execute main.js
try {
  require(mainJsPath);
  app.emit("ready");
} catch (err) {
  console.error("Failed to start Macle simulator:", err);
  process.exit(1);
}
