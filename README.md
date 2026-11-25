# SC Telemetry

Cockpit-style telemetry screens for Star Citizen that run on your phones and tablets over your local network. Data comes from the game's built-in local telemetry API (see [TELEMETRY.md in 7Hills Link](https://github.com/TheBanjolorian/7hills-link/blob/main/docs/TELEMETRY.md)).

- **Live MFD screens**: Power Management and Shields (round 1). Swipe between them or tap the tabs.
- **Configurable side panels**: status lights (CPLD, ESP, GSAF…), toggle switches, buttons, gauges and counters. You can move, rename, rebind and add them, and change what they do.
- **Gauges page**: aircraft-style instruments (airspeed, attitude, altimeter, radar altimeter, two vertical speed gauges, turn coordinator, heading, time to impact, G-meter, hull/shield, fuel, boost charge, and more). You can drag them into any order, resize and tune them, add or remove them. Calculated alerts (pull up, sink rate, gear, overspeed, G limit, fuel…) light an alert panel and can play tones and spoken callouts.
- **Where you are and play history** (from `Game.log`): your shard, the place (city or station, else planet or moon, else jurisdiction, else system), armistice, jurisdiction, quantum travel and a one-line summary such as "Flying at Cellin, 940 m above the ground". The Sessions page logs how long you play, each shard you join and leave, and where you spent your time.
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
   (The last line is only needed for actions.) **Settings → Game setup check** shows what's missing and can add these lines for you. Then run `setx GRPC_CLIENT_SERVER_ENABLED true` once, quit the RSI Launcher fully, and start the game again.

   Current LIVE builds ignore `grpc.client.server.port` and always listen on **2942**. The app tries the user.cfg port first, then 2942, and stays on whichever streams.
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
4. The server looks for `StarCitizen.exe` in the usual folders on every drive (for example `H:\StarCitizen\StarCitizen\LIVE`). If it can't find it, set the path in **Settings → Telemetry source**. `Game.log` and `user.cfg` are found next to it. The server reads the API definitions from the exe and caches them, so it keeps working after patches.

**No game running?** Double-click `Start Simulator.cmd` (or run `npm run sim`) to use built-in demo data, or pick *Simulator* in Settings.

**Tips for tablets:** use *Add to Home Screen* to run it full screen. Screen wake-lock only works over HTTPS or on localhost; on plain HTTP, set the tablet's auto-lock to "never" while flying.

## Using it

| Where | What |
|---|---|
| Cockpit | Swipe the screen or tap the MFD tabs. Tap a light or switch to send its action (if actions are on). |
| ✎ (pencil) | Edit the layout. Drag ⠿ to move widgets or panels, tap a widget to configure it, use ⚙ for panel settings, and **Screens** to set the order and tabs. *Save & close* stores the layout for every device. |
| Gauges | The instrument panel. Use the pencil to add, drag, resize, tune or remove gauges. **Alert settings** sets the thresholds and turns sound on for this device. |
| Sessions (map pin) | Where you are now, time on the current shard, play time per day, game runs with their shard sessions, where you spent time, and the location event log. **Import old logs** reads the finished logs the game keeps in `logbackups`. |
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

### Game.log, places and privacy

The server only reads `Game.log` (never writes it). It works out the shard, place, quantum trip, jurisdiction and armistice from the log, and stores only those facts and short event lines such as "Landed at Ruin Station", never the log lines. Re-reading a log replaces that game run's rows, so nothing is counted twice.

Places come from a built-in list: Stanton with its moons, cities, orbital stations and Lagrange rest stops, plus the main Pyro and Nyx places, and jump gateways worked out from their names. For a fuller list, put a `places.json` in 7Hills Link's format into `data/` (or set its path in Settings → Game.log). The simulator writes a matching fake `Game.log` into `data/sim/`, so locations and history can be tried without the game.

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
