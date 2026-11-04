# Macle Mini Program Simulator (Linux & Web)

This repository contains the runtime assets and launcher utilities for the **Macle Mini Program Simulator** (Huawei / Ethio Telecom platform).

---

## 🚀 Running the Simulators

### 1. Web Simulator (Recommended: Pure Node.js, Headless & Cross-Platform)
Runs the Macle simulator server on Node.js without needing Electron GUI dependencies or display servers. Serves a full interactive phone preview in your web browser.

```bash
node macle-web-simulator.js -s /path/to/sample-project/dist -r /path/to/sample-project
```

- **Browser URL**: `http://localhost:30002/__web/index.html?project=dist&port=30002`
- **Options**:
  - `-s, --source <path>`: Path to compiled mini program `dist/` directory *(required)*.
  - `-r, --root <path>`: Path to project root directory.
  - `-o, --only-server`: Run server without auto-opening a browser window.
  - `-m, --mode <mode>`: Mode: `debug` (default) or `preview`.

---

### 2. Desktop Simulator (Linux Electron GUI)
Runs the desktop simulator window using the native Linux Electron runtime.

```bash
./macle-simulator -s /path/to/sample-project/dist -r /path/to/sample-project
```

---

## 📁 Repository Structure

- `macle-web-simulator.js`: Pure Node.js Web Simulator runner.
- `macle-simulator`: Shell script wrapper for the Linux desktop simulator.
- `resources/app/`: The Macle simulator logic, Exparser runtime, JSSDK, and Webview bridge assets.
- `.gitignore`: Configured to ignore precompiled Electron binary blobs (`macle-simulator-bin`, `*.pak`, `*.so`, `locales/`) to keep Git history lightweight.

