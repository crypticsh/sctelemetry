# SC Telemetry

Cockpit-style telemetry screens for Star Citizen that run on your phones and tablets over your local network. Data comes from the game's built-in local telemetry API (see [TELEMETRY.md in 7Hills Link](https://github.com/TheBanjolorian/7hills-link/blob/main/docs/TELEMETRY.md)).

- **Live MFD screens**: Power Management and Shields (round 1). Swipe between them or tap the tabs.
- **Configurable side panels**: status lights (CPLD, ESP, GSAF…), toggle switches, buttons, gauges and counters. You can move, rename, rebind and add them, and change what they do.
- **Flight data recorder**: samples and state changes go into SQLite. You can view them as charts and an event log, and export them as CSV.
- **Themes**: Drake is complete. Crusader, RSI and ARGO have first-pass palettes.
- **Optional in-game actions**: switches and buttons can send actions like gear, decouple and power. These are off by default.

```
 Gaming PC                                             Tablets / phones
┌──────────────────────────────────────────┐         ┌──────────────────┐
│ StarCitizen.exe ── gRPC 127.0.0.1:50051 ─┐│         │  browser          │
│                                          ▼│  Wi-Fi  │  http://PC:8420   │
│   SC Telemetry server (Node) ── WebSocket ├────────►│  Svelte app       │
│     └─ data/telemetry.db (flight log)     │         └──────────────────┘
└──────────────────────────────────────────┘
```

The game only listens on `127.0.0.1`, so the server has to run **on the gaming PC**. It reads the stream and serves the screens to your network.

## Setup (on the gaming PC)

1. Install **Node.js 22.13 or newer** (LTS from nodejs.org).
2. Turn on the game's telemetry. Add these lines to `StarCitizen\LIVE\user.cfg`:
   ```
   grpc.client.server.enabled = 1
   grpc.client.server.port = 50051
   server.game.telemetry.enabled = 1
   server.game.telemetry.trigger.actions.enabled = 1
   ```
   (The last line is only needed for actions.) Then run `setx GRPC_CLIENT_SERVER_ENABLED true` once, quit the RSI Launcher fully, and start the game again.
3. **Double-click `Start SC Telemetry.cmd`** (or `Start Simulator.cmd` for demo data without the game). On the first run, and after a `git pull`, it installs packages and builds the screens. Then it starts the server and opens the cockpit in your browser. Close the window to stop it. On macOS or Linux, run `./start.sh` (add `--sim` for demo data).

   Or do the same steps by hand:
   ```bash
   npm install
   ```
   ```bash
   npm run build
   ```
   ```bash
   npm start
   ```
   The console prints addresses such as `http://192.168.1.20:8420`. Open that address on your tablet or phone. When Windows asks, allow Node through the firewall on **private** networks.
4. If the game is not installed in the default location, set the path to `StarCitizen.exe` in **Settings → Telemetry source**. The server reads the API definitions from the exe and caches them, so it keeps working after patches.

**No game running?** Double-click `Start Simulator.cmd` (or run `npm run sim`) to use built-in demo data, or pick *Simulator* in Settings.

**Tips for tablets:** use *Add to Home Screen* to run it full screen. Screen wake-lock only works over HTTPS or on localhost; on plain HTTP, set the tablet's auto-lock to "never" while flying.

## Using it

| Where | What |
|---|---|
| Cockpit | Swipe the screen or tap the MFD tabs. Tap a light or switch to send its action (if actions are on). |
| ✎ (pencil) | Edit the layout. Drag ⠿ to move widgets or panels, tap a widget to configure it, use ⚙ for panel settings, and **Screens** to set the order and tabs. *Save & close* stores the layout for every device. |
| Flight log | Charts for any logged channel (5 min to 7 days, or step back in time), an event log of state changes, warnings and game events, and CSV export. |
| Settings | Theme, per-device layout profile, logging (interval, retention, size cap…), update rate, actions, and a **live data inspector** that shows every field the game sends. Tap a field to copy its path for a widget. |

### Layout profiles per device

Layouts are stored on the server. Make one per device in Settings (*Duplicate*, then rename it to "iPad" or "Phone"), then pick it on that device. Theme and display preferences are saved in each browser.

### What the stream does and doesn't give us

| Element on the screens | Source |
|---|---|
| CPLD / ESP / GSAF / GEAR / LOCK lights | real (`flight.settings`, `flight.state`, `weapons.settings`) |
| Velocity + G ladder | real (`instruments.speed`, `g_meter`) |
| Noise / Decoy | real (`weapons.countermeasures`) |
| Shield level, per-face arcs, hull | real (`shields.level`, `shields.faces[]`, `health`) |
| Power OUTPUT x / y and columns | real on/off per system, weapons powered, and shield level. **Pip allocation is not in the stream.** |
| IR / EM / CS signatures | **not in the stream**, so they show `---` (already wired in case CIG adds them) |
| ATMO light | shown hatched (unknown) unless the game reports an atmospheric-flight setting |

The game's exact field types are not documented. `server/telemetry/normalize.js` reads every field defensively: a value can be a number, `{current, max}`, a bool and so on. Anything else can be reached from a widget as `raw.<path>`.

## Development

```bash
npm run dev
```
This starts the server (with the simulator) and Vite with hot reload on port 5173. Add `-- --game` to use the real game instead.

```bash
npm test
```
The tests run the real gRPC path end to end. `scripts/fake-game.js` builds a stand-in telemetry server with a guessed schema, embeds its descriptors in a fake "exe", and checks extraction, streaming, normalizing and actions. You can also run it as `npm run fake-game` and point Settings at it.

| Path | What |
|---|---|
| `server/index.js` | HTTP + WebSocket server, API |
| `server/telemetry/` | exe descriptor extraction (`protoset.js`), gRPC client, simulator, normalizer |
| `server/recorder.js` | flight log (SQLite: `samples`, `events`), retention and size pruning, downsampling |
| `server/config.js` | server settings and defaults |
| `web/src/components/screens/` | MFD screens |
| `web/src/components/widgets/` | side-panel widgets |
| `web/src/lib/defaultLayout.js` | default layout, widget and screen types |
| `web/src/themes/` | theme tokens (`themes.css`), registry, badges |

Data lives in `data/`: `settings.json`, `layouts.json`, `telemetry.db` and the cached protoset. Set `SCT_DATA` or `--data=` to move it.

**Manufacturer logos:** the built-in badges are simple original emblems. To use official fan-kit artwork, put `drake.svg`, `crusader.svg`, `rsi.svg` or `argo.svg` (PNG or WebP also work) in `web/src/themes/logos/` and rebuild.
