// A stand-in for the game's gRPC server, for testing without Star Citizen.
//
// It builds a *guessed* telemetry schema (the real one is only inside
// StarCitizen.exe), writes a fake "exe" that embeds its descriptors the way
// the game does, and serves TelemetryStream with simulator data. Point the
// server at it to exercise the real path end to end:
//
//   npm run fake-game            (prints the fake exe path and port)
//   then set Settings → Telemetry → exe path to that file, port 50052.

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createSimState, stepSim, SIM_ACTIONS } from '../server/telemetry/simSource.js';

const require = createRequire(import.meta.url);
const protobuf = require('protobufjs');
const descriptor = require('protobufjs/ext/descriptor');
const grpc = require('@grpc/grpc-js');

export const GUESSED_PROTO = `
syntax = "proto3";
package sc.game.telemetry.v1;

message Meter { float current = 1; float max = 2; }
message ActorState { string locomotion = 1; string seat_name = 2; string crew_role = 3; int64 uec_balance = 4; }
message Vitals { Meter health = 1; Meter oxygen = 2; Meter hunger = 3; Meter thirst = 4; Meter body_temperature = 5;
  float heart_rate = 6; float pressure = 7; float gravity = 8; float intoxication_level = 9; }
message Environment { float external_temperature = 1; bool breathable_atmosphere = 2; float ambient_radiation_rate = 3; }
message Actor { ActorState state = 1; Vitals vitals = 2; Environment environment = 3; }
message MasterMode { string mode = 1; bool spooled = 2; }
message ShieldFace { float level = 1; }
message Shields { float level = 1; repeated ShieldFace faces = 2; }
message Power { bool power_plants = 1; bool engines = 2; bool weapons = 3; bool coolers = 4; bool life_support = 5;
  bool sensors = 6; bool gravity_generators = 7; bool shield_generators = 8; bool shield_emitters = 9; }
message Annunciators { bool master_warning = 1; bool master_caution = 2; bool fuel_low = 3; }
message FlightState { bool gear = 1; bool vtol = 2; bool is_landed = 3; }
message FlightSettings { bool decoupled = 1; bool esp = 2; bool gsafe = 3; bool proximity_assist = 4; }
message Boost { float reserves = 1; bool engaged = 2; float output = 3; bool critical = 4; }
message Instruments { float speed = 1; float altitude = 2; float radar_altitude = 3; float heading = 4;
  float vertical_speed_indicator = 5; Meter g_meter = 6; float hydrogen_fuel = 7; float quantum_fuel = 8; Boost boost = 9; }
message Flight { FlightState state = 1; FlightSettings settings = 2; Instruments instruments = 3; }
message VehicleState { string name = 1; string class_name = 2; string manufacturer = 3; string type = 4; float health = 5;
  bool lights_enabled = 6; MasterMode master_mode = 7; Shields shields = 8; Power power = 9; Annunciators annunciators = 10; Flight flight = 11; }
message Vehicle { VehicleState state = 1; }
message Weapon { string name = 1; bool powered = 2; bool ready_to_fire = 3; bool in_active_group = 4; }
message Countermeasure { string type = 1; int32 count = 2; }
message WeaponSettings { bool gimbals_locked = 1; }
message Weapons { int32 preset_index = 1; string preset_name = 2; WeaponSettings settings = 3; repeated Weapon weapons = 4; repeated Countermeasure countermeasures = 5; }
message GameEvent { string type = 1; }
message Events { repeated GameEvent events = 1; }
message Turret { }
message ForceFeedback { }
message TelemetryStreamRequest { }
message TelemetryStreamResponse { Actor actor = 1; Vehicle vehicle = 2; Weapons weapons = 3; Events events = 4; Turret turret = 5; ForceFeedback force_feedback = 6; }
message ListTriggerableActionsRequest { }
message TriggerableAction { string action_name = 1; string category = 2; bool holdable = 3; }
message ListTriggerableActionsResponse { repeated TriggerableAction actions = 1; }
message TriggerGameActionRequest { string action_name = 1; uint32 hold_ms = 2; }
message TriggerGameActionResponse { bool success = 1; }

service GameTelemetryService {
  rpc TelemetryStream(TelemetryStreamRequest) returns (stream TelemetryStreamResponse);
  rpc ListTriggerableActions(ListTriggerableActionsRequest) returns (ListTriggerableActionsResponse);
  rpc TriggerGameAction(TriggerGameActionRequest) returns (TriggerGameActionResponse);
}
`;

/** Build the guessed schema and a fake exe blob that embeds its FileDescriptorProto. */
export function buildFake() {
  const root = protobuf.parse(GUESSED_PROTO, { keepCase: true }).root;
  root.resolveAll();
  const set = root.toDescriptor('proto3');
  set.file[0].name = 'sc/game/telemetry/v1/telemetry.proto';
  const fdp = descriptor.FileDescriptorProto.encode(set.file[0]).finish();
  const junk = (n) => Buffer.from(Array.from({ length: n }, (_, i) => (i * 37 + 11) & 0xff));
  // Also drop a decoy string, like the real exe has plenty of.
  const exe = Buffer.concat([Buffer.from('MZ'), junk(4096), Buffer.from('path sc/game/telemetry/v1 log'), junk(2048), Buffer.from(fdp), junk(4096)]);
  return { root, exe };
}

export function startFakeGame(port = 50052) {
  const { root, exe } = buildFake();
  const svcName = 'sc.game.telemetry.v1.GameTelemetryService';
  const T = (n) => root.lookupType(`sc.game.telemetry.v1.${n}`);
  const ser = (type) => (obj) => Buffer.from(type.encode(type.fromObject(obj)).finish());
  const des = (type) => (buf) => type.toObject(type.decode(buf), { defaults: true });
  const sim = createSimState();
  const server = new grpc.Server();
  server.addService({
    TelemetryStream: { path: `/${svcName}/TelemetryStream`, requestStream: false, responseStream: true, requestSerialize: ser(T('TelemetryStreamRequest')), requestDeserialize: des(T('TelemetryStreamRequest')), responseSerialize: ser(T('TelemetryStreamResponse')), responseDeserialize: des(T('TelemetryStreamResponse')) },
    ListTriggerableActions: { path: `/${svcName}/ListTriggerableActions`, requestStream: false, responseStream: false, requestSerialize: ser(T('ListTriggerableActionsRequest')), requestDeserialize: des(T('ListTriggerableActionsRequest')), responseSerialize: ser(T('ListTriggerableActionsResponse')), responseDeserialize: des(T('ListTriggerableActionsResponse')) },
    TriggerGameAction: { path: `/${svcName}/TriggerGameAction`, requestStream: false, responseStream: false, requestSerialize: ser(T('TriggerGameActionRequest')), requestDeserialize: des(T('TriggerGameActionRequest')), responseSerialize: ser(T('TriggerGameActionResponse')), responseDeserialize: des(T('TriggerGameActionResponse')) },
  }, {
    TelemetryStream(call) {
      const iv = setInterval(() => { call.write(stepSim(sim)); sim.logOut.length = 0; sim.logSched.length = 0; }, 1000 / 17);
      call.on('cancelled', () => clearInterval(iv));
      call.on('close', () => clearInterval(iv));
    },
    ListTriggerableActions(_call, cb) {
      cb(null, { actions: SIM_ACTIONS.map((action_name) => ({ action_name, category: 'fake', holdable: false })) });
    },
    TriggerGameAction(call, cb) {
      cb(null, { success: true });
      console.log('action:', call.request.action_name);
    },
  });
  return new Promise((resolve, reject) => {
    server.bindAsync(`127.0.0.1:${port}`, grpc.ServerCredentials.createInsecure(), (err, p) => (err ? reject(err) : resolve({ server, port: p, exe })));
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const port = +(process.argv[2] || 50052);
  const { exe } = await startFakeGame(port);
  const out = path.resolve('data', 'FakeStarCitizen.exe');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, exe);
  console.log(`Fake game telemetry on 127.0.0.1:${port}`);
  console.log(`Fake exe written to ${out}`);
  console.log('In Settings → Telemetry: source "Game", port', port, ', exe path above.');
}
