import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { Places } from '../server/gamelog/places.js';
import { Tracker } from '../server/gamelog/tracker.js';
import { Sessions } from '../server/gamelog/sessions.js';
import { describe, stateOf } from '../server/gamelog/situation.js';
import { channelDir, applyCfg, readCfg, missing } from '../server/gamefiles.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const places = Places.load();
const L = (t, rest) => `<2026-11-21T${t}Z> ${rest}\r`;
const N = (t, text) => L(t, `[Notice] <SHUDEvent_OnNotification> Added notification "${text}: " [4] to queue.`);
const HEAD = [
  L('18:50:00.000', 'Log started on Sat Nov 21 18:50:00 2026'),
  L('18:50:00.000', 'FileVersion: 4.10.201.48085'),
  L('18:50:00.001', 'Branch: sc-alpha-4.10.0'),
  L('18:50:00.002', '[CIG] build_version[13220821]'),
  L('18:50:00.003', 'Executable: H:\\StarCitizen\\StarCitizen\\LIVE\\Bin64\\StarCitizen.exe'),
  L('18:55:00.560', '[Notice] <Legacy login response> [CIG-net] User Login Success - Handle[Me] - Time[1] [Login]'),
];
const JOIN = (t, shard) => L(t, `[Notice] <Join PU> address[1.2.3.4] port[64366] shard[${shard}] locationId[-1] [Matchmaking]`);
const LAND_NO = L('18:56:30.040', '[Notice] <Update Inventory Location> Player [Me] is changing location. Landing [0] -> [3184339241]. Location [0] -> [3184339241]. Pending [0] [Inventory]');
const LAND_RUIN = L('18:56:30.046', '[Notice] <RequestLocationInventory> Player[Me] requested inventory for Location[RR_P6_LEO] [Inventory]');
const SELECT = L('18:57:51.414', '[Notice] <Player Selected Quantum Target - Local> [ItemNavigation] | Player has selected point rs_ext_pyro-stan_jp1 as their destination, routing locally [QuantumTravel]');
const ROUTE = L('18:57:51.415', '[Notice] <Calculate Route> [ItemNavigation] | Projected Start Location is Ruin Station for route to destination rs_ext_pyro-stan_jp1 [QuantumTravel]');
const ARRIVED = L('19:02:51.906', '[Notice] <Quantum Drive Arrived - Arrived at Final Destination> | Quantum Drive has arrived at final destination [QuantumTravel]');
const GATE = L('19:02:53.672', '[Notice] <RequestLocationInventory> Player[Me] requested inventory for Location[RR_JP_PyroStanton] [Inventory]');

const run = (lines) => { const t = new Tracker(places); for (const l of lines) t.feed(l); return t; };

test('landing-area name puts you at the station', () => {
  const s = run([...HEAD, JOIN('18:56:05.455', 'pub_euw1b_1_320'), LAND_NO, LAND_RUIN]).snapshot();
  assert.equal(s.place, 'pyro/terminus/ruin-station');
  assert.equal(s.confidence, 'exact');
  assert.equal(s.event.text, 'Landed at Ruin Station');
  assert.equal(s.shard, 'pub_euw1b_1_320');
  assert.equal(s.run.channel, 'LIVE');
  assert.equal(s.run.version, '4.10.201.48085');
});

test('gateway names map to the jump point of that system', () => {
  assert.equal(places.namedPlace('RR_JP_PyroStanton'), 'pyro/jump-stanton');
  assert.equal(places.nameOf('pyro/jump-stanton'), 'Stanton Gateway');
  assert.equal(places.namedPlace('rs_ext_pyro-stan_jp1'), 'pyro/jump-stanton');
  assert.equal(places.namedPlace('OOC_Stanton_4_Microtech'), 'stanton/microtech');
});

test('quantum trip: plotted is not travel; calibration, passenger, arrival', () => {
  const t = run([...HEAD, JOIN('18:56:05.455', 's1'), LAND_NO, LAND_RUIN, SELECT, ROUTE]);
  assert.equal(t.snapshot().transit, null);
  t.feed(N('18:58:00.000', 'Quantum Travel Calibration Started By Echoo3'));
  const tr = t.snapshot().transit;
  assert.equal(tr.state, 'spool');
  assert.equal(tr.from, 'pyro/terminus/ruin-station');
  assert.equal(tr.to, 'pyro/jump-stanton');
  assert.equal(t.snapshot().event.text, 'Quantum calibrating to Stanton Gateway (pilot Echoo3)');
  t.feed(N('18:58:06.000', 'Quantum Travel Calibration Complete By Me'));
  assert.equal(t.snapshot().transit.state, 'travel');
  t.feed(N('19:02:50.009', 'Entered UEE Jurisdiction'));
  for (const l of [ARRIVED, GATE]) t.feed(l);
  const s = t.snapshot();
  assert.equal(s.transit, null);
  assert.equal(s.place, 'pyro/jump-stanton');
  assert.equal(s.jurisdiction, 'UEE');
  assert.equal(s.event.text, 'Landed at Stanton Gateway');
});

test('lone planet load and jurisdiction', () => {
  const burst = ['OOC_Stanton_1d_Ita', 'pyro5a', 'Nyx1'].map((n, i) => L(`19:10:00.00${i}`, `[Notice] <Planet CPU Maps Loaded> Planet '${n}' (entity 1) CPU maps: x [Planet]`));
  const t = run([...HEAD, JOIN('19:09:00.000', 's1'), ...burst]);
  assert.equal(t.snapshot().place, null);
  t.feed(L('19:20:00.000', "[Notice] <Planet CPU Maps Loaded> Planet 'OOC_Stanton_2a_Cellin' (entity 1) CPU maps: x [Planet]"));
  t.feed(L('19:20:10.000', '[Notice] <Population Manager Stats> NPCs 0'));
  assert.equal(t.snapshot().place, 'stanton/crusader/cellin');
  t.feed(N('19:30:00.000', 'Entered Hurston Dynamics Jurisdiction'));
  assert.equal(t.snapshot().place, 'stanton/hurston');
  assert.equal(t.snapshot().confidence, 'area');
});

test('play history: runs, shard switches and places are recorded once', () => {
  const db = new DatabaseSync(':memory:');
  const ses = new Sessions(db);
  const lines = [...HEAD, JOIN('19:00:00.000', 'shard_a'), LAND_NO, LAND_RUIN,
    L('19:30:00.000', 'Requesting game mode Frontend_Main/SC_Frontend'),
    JOIN('19:31:00.000', 'shard_b'), L('20:31:00.000', '[CIG] CCIGBroker::FastShutdown')].join('\n');
  ses.importText(lines, places);
  ses.importText(lines, places); // reading the same log again replaces, never doubles
  const tot = ses.totals();
  assert.equal(tot.runs, 1);
  assert.equal(tot.shardSessions, 2);
  assert.equal(tot.distinctShards, 2);
  assert.equal(Math.round(tot.shardSecs), 30 * 60 + 60 * 60);
  assert.equal(Math.round(tot.playSecs), 101 * 60);
  const [r] = ses.history(0, 2e9);
  assert.equal(r.channel, 'LIVE');
  assert.deepEqual(r.shards.map((x) => x.shard), ['shard_a', 'shard_b']);
  assert.ok(ses.topPlaces(0, 2e9).some((p) => p.place_id === 'pyro/terminus/ruin-station'));
});

test('situation line', () => {
  const n = { player: { locomotion: 'ACTOR_LOCOMOTION_STATE_SEATED' }, ship: { present: true, className: 'DRAK_Cutlass', landed: false, altitude: 940 } };
  assert.equal(stateOf(n), 'flying');
  assert.equal(describe('flying', 'near', 'Cellin', 940), 'Flying at Cellin, 940 m above the ground');
  assert.equal(describe('landed', 'exact', 'Ruin Station'), 'Landed at Ruin Station');
});

test('user.cfg: channel folder, missing lines, non-destructive write', () => {
  assert.equal(channelDir('H:\\StarCitizen\\StarCitizen\\LIVE\\Bin64\\StarCitizen.exe'), 'H:\\StarCitizen\\StarCitizen\\LIVE');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfg-'));
  const f = path.join(dir, 'user.cfg');
  fs.writeFileSync(f, '-- my settings\r\nr_DisplayInfo = 2\r\ngrpc.client.server.enabled = 0\r\n');
  const m = missing(f);
  assert.deepEqual(Object.keys(m).sort(), ['grpc.client.server.enabled', 'grpc.client.server.port', 'server.game.telemetry.enabled']);
  applyCfg(f, m);
  const c = readCfg(f);
  assert.equal(c['r_displayinfo'], '2');
  assert.equal(c['grpc.client.server.enabled'], '1');
  assert.ok(fs.readFileSync(f, 'utf8').startsWith('-- my settings\r\n'));
  assert.deepEqual(missing(f), {});
});

test('shops, commodity orders, freight elevator and ship from 4.10 lines', () => {
  const P = (t, rest) => L(t, rest);
  const lines = [
    ...HEAD, JOIN('18:25:23.572', 'pub_use1b_1_250'),
    P('18:26:25.697', '[Notice] <RequestLocationInventory> Player[Me] requested inventory for Location[Stanton4_NewBabbage] [Inventory]'),
    P('18:28:27.059', '[Notice] <CEntityComponentShopUIProvider::SendShopBuyRequest> Sending SShopBuyRequest - playerId[1] shopId[42] shopName[SCShop_Hospital_Pharmacy_NewBab_01] kioskId[43] client_price[265.000000] itemClassGUID[x] itemName[crlf_consumable_healing_01] quantity[1]  [Shops][UI]'),
    P('18:28:27.692', '[Notice] <CEntityComponentShopUIProvider::RmShopFlowResponse> Received ShopFlowResponse - playerId[1] shopId[42] shopName[SCShop_Hospital_Pharmacy_NewBab_01] kioskId[43] kioskState[BuyRequestProcessing] result[Success] type[Buying] [Shops][UI]'),
    P('18:33:53.255', '[Notice] <CEntityComponentCommodityUIProvider::SendCommoditySellRequest> Sending SShopCommoditySellRequest - playerId[1] shopId[77] shopName[SCShop_CommEx_TDD_NewBabbage] kioskId[78] amount[416.000000] resourceGUID[3e5fdc37-cb59-4fd3-8168-e3c538ab9722] autoLoading[0] quantity[1] transactionMode[Entities] Cargo Box Data:  [Shops][UI]'),
    P('18:46:29.140', '[Notice] <Player Selected Quantum Target - Local> [ItemNavigation][CL][1] | NOT AUTH | ANVL_Liberator_954853409385[954853409385]|CSCItemNavigation::OnPlayerSelectedQuantumTarget|Player has selected point NewBabbage_LOC as their destination, routing locally [QuantumTravel]'),
    P('18:46:29.141', '[Notice] <Calculate Route> [ItemNavigation][CL][1] | NOT AUTH | ANVL_Liberator_954853409385[954853409385]|CSCItemNavigation::CalculateRoute|Successfully calculated route to NewBabbage_LOC fuel estimate 239551.531250 [QuantumTravel]'),
    P('18:50:53.473', '[Notice] <Quantum Drive Arrived - Arrived at Final Destination> [ItemNavigation][CL][1] | NOT AUTH | ANVL_Liberator_954853409385[954853409385]|CSCItemNavigation::OnQuantumDriveArrived|Quantum Drive has arrived at final destination [QuantumTravel]'),
    P('18:57:30.117', '[Notice] <CEntityComponentFreightElevatorUIProvider::FillUnstowRequest> [FreightElevatorKioskUIProvider] FreightElevatorKiosk_FreightElevator_HT_HangarLarge[9] - Processed bindings into transfer request - Entities: 2, Location: 3170699229 - RequestId: 2, ItemBank: 0 [Cargo]'),
    P('18:57:46.071', '[Notice] <CSCLoadingPlatformManager::OnLoadingPlatformStateChanged> [Loading Platform] Loading Platform Manager [LoadingPlatformManager_FreightElevator_HT_HangarLarge] Platform state changed to LoweringPlatform [Cargo]'),
    P('18:57:51.448', '[Notice] <CSCLoadingPlatformManager::OnLoadingPlatformStateChanged> [Loading Platform] Loading Platform Manager [LoadingPlatformManager_FreightElevator_HT_HangarLarge] Platform state changed to ClosedIdle [Cargo]'),
    P('18:58:22.669', '[Notice] <SystemQuit> CSystem::Quit invoked with - cause=30016, reason=Quit via console command, exitCode=0'),
  ].join('\n');
  const db = new DatabaseSync(':memory:');
  const ses = new Sessions(db);
  const got = [];
  ses.hooks = { onOrder: (o, key) => got.push(o) };
  ses.importText(lines, places);
  const [trade] = ses.trades(0, 2e9);
  assert.equal(trade.name, 'MedPen (Hemozal)');
  assert.equal(trade.price, 265);
  assert.equal(trade.result, 'ok');
  assert.equal(trade.shop, 'Hospital Pharmacy New Babbage');
  assert.equal(got.length, 1);
  assert.equal(got[0].amount, 416);
  assert.equal(got[0].place, 'stanton/microtech/new-babbage');
  const [trip] = ses.trips(0, 2e9);
  assert.equal(trip.to_id, 'stanton/microtech/new-babbage');
  assert.equal(trip.ship, 'Anvil Liberator');
  assert.equal(Math.round(trip.fuel), 239552);
  const texts = ses.events(0, 2e9).map((e) => e.text);
  assert.ok(texts.includes('Freight elevator request: 2 items'));
  assert.ok(texts.includes('Freight elevator back down'));
  assert.ok(texts.includes('Bought MedPen (Hemozal) for 265 aUEC'));
});

test('orders from the log: named by id, never added twice, naming is remembered', async () => {
  const { Orders } = await import('../server/orders.js');
  const db = new DatabaseSync(':memory:');
  const orders = new Orders(db);
  const o = { at: 100, kind: 'sell', amount: 416, guid: '3e5fdc37-cb59-4fd3-8168-e3c538ab9722', shop: 'CommEx', place: null };
  assert.equal(orders.addFromLog(o, 'run1', 'New Babbage'), true);
  assert.equal(orders.addFromLog(o, 'run1', 'New Babbage'), false);
  assert.equal(orders.list()[0].item, 'Hadanite');
  orders.addFromLog({ ...o, at: 200, guid: 'new-guid' }, 'run1', 'New Babbage');
  const unknown = orders.list().find((x) => x.guid === 'new-guid');
  assert.equal(unknown.item, 'Unknown commodity');
  orders.update(unknown.id, { item: 'Laranite' });
  orders.addFromLog({ ...o, at: 300, guid: 'new-guid' }, 'run2', 'Area18');
  assert.deepEqual(orders.list().filter((x) => x.guid === 'new-guid').map((x) => x.item), ['Laranite', 'Laranite']);
});
