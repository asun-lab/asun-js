/**
 * ason-js — benchmark vs JSON.parse / JSON.stringify
 * Run: node examples/bench.js  (after npm run build)
 *
 * Mirrors ason-go/examples/bench and ason-py/examples/bench.
 */
import { encode, decode, encodeBinary, decodeBinary } from '../dist/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Run fn() `iters` times and return average ns per call */
function bench(fn, iters) {
  const start = performance.now();
  for (let i = 0; i < iters; i++) fn();
  const end = performance.now();
  return Math.round(((end - start) * 1e6) / iters); // ns per call
}

function fmtNs(ns) {
  if (ns >= 1_000_000) return `${(ns / 1_000_000).toFixed(2)} ms`;
  if (ns >= 1_000) return `${(ns / 1_000).toFixed(2)} µs`;
  return `${ns} ns`;
}

function printRow(label, ns, extra = '') {
  console.log(`  ${label.padEnd(30)} ${fmtNs(ns).padStart(12)}  ${extra}`);
}

function makeUsers(n) {
  return Array.from({ length: n }, (_, i) => ({
    id: i,
    name: `User${i}`,
    email: `u${i}@example.com`,
    score: i * 0.5,
    active: i % 2 === 0,
    dept: `Dept${i % 10}`,
    age: 20 + (i % 40),
    salary: 50000 + i * 100,
  }));
}

function makeAllTypes(n) {
  return Array.from({ length: n }, (_, i) => ({
    b: i % 2 === 0,
    n: -i,
    u: i,
    f: i * 1.25,
    s: `str${i}`,
    on: i % 3 === 0 ? null : i,
    of: i % 4 === 0 ? null : i * 0.5,
  }));
}

const FLAT_SCHEMA = '[{id:int, name:str, email:str, score:float, active:bool, dept:str, age:int, salary:int}]';
const ALL_SCHEMA  = '[{b:bool, n:int, u:uint, f:float, s:str, on:int?, of:float?}]';

// ---------------------------------------------------------------------------
// Section 1: Flat struct (8 fields) — various sizes
// ---------------------------------------------------------------------------
console.log('\n=== Section 1: Flat struct (8 fields) ===\n');
console.log('  ' + 'Label'.padEnd(30) + '  Time/call       Note');
console.log('  ' + '-'.repeat(65));

for (const n of [100, 500, 1000, 5000]) {
  const rows = makeUsers(n);
  const asonText = encode(rows, FLAT_SCHEMA);
  const jsonText = JSON.stringify(rows);
  const iters = n <= 1000 ? 200 : 50;

  const asonSer = bench(() => encode(rows, FLAT_SCHEMA), iters);
  const asonDe  = bench(() => decode(asonText), iters);
  const jsonSer = bench(() => JSON.stringify(rows), iters);
  const jsonDe  = bench(() => JSON.parse(jsonText), iters);

  const saving = ((1 - asonText.length / jsonText.length) * 100).toFixed(1);
  console.log(`\n  N=${n}  ASON ${asonText.length}B vs JSON ${jsonText.length}B  (${saving}% smaller)`);
  printRow('ASON serialize', asonSer, `${(jsonSer / asonSer).toFixed(2)}× vs JSON`);
  printRow('ASON deserialize', asonDe, `${(jsonDe / asonDe).toFixed(2)}× vs JSON`);
  printRow('JSON serialize', jsonSer);
  printRow('JSON deserialize', jsonDe);
}

// ---------------------------------------------------------------------------
// Section 2: All-types struct (7 fields incl. optionals)
// ---------------------------------------------------------------------------
console.log('\n=== Section 2: All-types struct (7 fields, with optionals) ===\n');
console.log('  ' + 'Label'.padEnd(30) + '  Time/call       Note');
console.log('  ' + '-'.repeat(65));

for (const n of [100, 500]) {
  const rows = makeAllTypes(n);
  const asonText = encode(rows, ALL_SCHEMA);
  const jsonText = JSON.stringify(rows);
  const iters = 200;

  const asonSer = bench(() => encode(rows, ALL_SCHEMA), iters);
  const asonDe  = bench(() => decode(asonText), iters);
  const jsonSer = bench(() => JSON.stringify(rows), iters);
  const jsonDe  = bench(() => JSON.parse(jsonText), iters);

  const saving = ((1 - asonText.length / jsonText.length) * 100).toFixed(1);
  console.log(`\n  N=${n}  ASON ${asonText.length}B vs JSON ${jsonText.length}B  (${saving}% smaller)`);
  printRow('ASON serialize', asonSer, `${(jsonSer / asonSer).toFixed(2)}× vs JSON`);
  printRow('ASON deserialize', asonDe, `${(jsonDe / asonDe).toFixed(2)}× vs JSON`);
  printRow('JSON serialize', jsonSer);
  printRow('JSON deserialize', jsonDe);
}

// ---------------------------------------------------------------------------
// Section 3: Binary vs text vs JSON
// ---------------------------------------------------------------------------
console.log('\n=== Section 3: Binary vs text vs JSON ===\n');
console.log('  ' + 'Label'.padEnd(30) + '  Time/call       Size');
console.log('  ' + '-'.repeat(65));

for (const n of [100, 1000]) {
  const rows = makeUsers(n);
  const schema = FLAT_SCHEMA;
  const asonText = encode(rows, schema);
  const binData  = encodeBinary(rows, schema);
  const jsonText = JSON.stringify(rows);
  const iters = 100;

  const binSer  = bench(() => encodeBinary(rows, schema), iters);
  const binDe   = bench(() => decodeBinary(binData, schema), iters);
  const asonSer = bench(() => encode(rows, schema), iters);
  const asonDe  = bench(() => decode(asonText), iters);
  const jsonSer = bench(() => JSON.stringify(rows), iters);
  const jsonDe  = bench(() => JSON.parse(jsonText), iters);

  console.log(`\n  N=${n}`);
  printRow('BIN serialize',   binSer,  `${binData.length} B  (${((1 - binData.length / jsonText.length) * 100).toFixed(0)}% < JSON)`);
  printRow('BIN deserialize', binDe,   `${(jsonDe / binDe).toFixed(2)}× vs JSON`);
  printRow('ASON serialize',  asonSer, `${asonText.length} B  (${((1 - asonText.length / jsonText.length) * 100).toFixed(0)}% < JSON)`);
  printRow('ASON deserialize',asonDe,  `${(jsonDe / asonDe).toFixed(2)}× vs JSON`);
  printRow('JSON serialize',  jsonSer, `${jsonText.length} B`);
  printRow('JSON deserialize',jsonDe);
}

// ---------------------------------------------------------------------------
// Section 4: Single-struct roundtrip — 10,000 iterations
// ---------------------------------------------------------------------------
console.log('\n=== Section 4: Single struct roundtrip (10 000 iters) ===\n');
{
  const obj = { id: 1, name: 'Alice', score: 9.5, active: true };
  const schema = '{id:int, name:str, score:float, active:bool}';
  const text = encode(obj, schema);
  const data = encodeBinary(obj, schema);

  const textSer = bench(() => encode(obj, schema), 10000);
  const textDe  = bench(() => decode(text), 10000);
  const binSer  = bench(() => encodeBinary(obj, schema), 10000);
  const binDe   = bench(() => decodeBinary(data, schema), 10000);

  printRow('Text serialize',  textSer);
  printRow('Text deserialize',textDe);
  printRow('Bin serialize',   binSer);
  printRow('Bin deserialize', binDe);
}

// ---------------------------------------------------------------------------
// Section 5: Large payload (10 000 records)
// ---------------------------------------------------------------------------
console.log('\n=== Section 5: Large payload (10 000 records) ===\n');
{
  const rows = makeUsers(10000);
  const schema = FLAT_SCHEMA;
  const iters = 10;

  const asonText = encode(rows, schema);
  const jsonText = JSON.stringify(rows);
  const binData  = encodeBinary(rows, schema);

  const asonSer = bench(() => encode(rows, schema), iters);
  const asonDe  = bench(() => decode(asonText), iters);
  const jsonSer = bench(() => JSON.stringify(rows), iters);
  const jsonDe  = bench(() => JSON.parse(jsonText), iters);
  const binSer  = bench(() => encodeBinary(rows, schema), iters);
  const binDe   = bench(() => decodeBinary(binData, schema), iters);

  printRow('ASON serialize',  asonSer, `${asonText.length} B`);
  printRow('ASON deserialize',asonDe);
  printRow('BIN serialize',   binSer,  `${binData.length} B`);
  printRow('BIN deserialize', binDe);
  printRow('JSON serialize',  jsonSer, `${jsonText.length} B`);
  printRow('JSON deserialize',jsonDe);
}

// ---------------------------------------------------------------------------
// Section 6: Throughput summary (text)
// ---------------------------------------------------------------------------
console.log('\n=== Section 6: Throughput summary (text) ===\n');
{
  const n = 1000;
  const rows = makeUsers(n);
  const schema = FLAT_SCHEMA;
  const text = encode(rows, schema);
  const iters = 100;

  const serNs = bench(() => encode(rows, schema), iters);
  const deNs  = bench(() => decode(text), iters);
  const jsonSer = bench(() => JSON.stringify(rows), iters);
  const jsonDe  = bench(() => JSON.parse(text.length > 0 ? JSON.stringify(rows) : '[]'), iters);

  const serRps = Math.round(n / (serNs / 1e9));
  const deRps  = Math.round(n / (deNs / 1e9));

  const jsonSerRps = Math.round(n / (jsonSer / 1e9));
  const jsonDeRps  = Math.round(n / (bench(() => JSON.parse(JSON.stringify(rows)), iters) / 1e9));

  console.log(`  Serialize:   ${(serRps / 1e6).toFixed(2)} M records/s  (${(serRps / jsonSerRps).toFixed(2)}× vs JSON)`);
  console.log(`  Deserialize: ${(deRps / 1e6).toFixed(2)} M records/s  (${(deRps / jsonDeRps).toFixed(2)}× vs JSON)`);
}

// ---------------------------------------------------------------------------
// Section 7: Binary throughput summary
// ---------------------------------------------------------------------------
console.log('\n=== Section 7: Binary throughput summary ===\n');
{
  const n = 1000;
  const rows = makeUsers(n);
  const schema = FLAT_SCHEMA;
  const data = encodeBinary(rows, schema);
  const iters = 100;

  const binSerNs = bench(() => encodeBinary(rows, schema), iters);
  const binDeNs  = bench(() => decodeBinary(data, schema), iters);

  const binSerRps = Math.round(n / (binSerNs / 1e9));
  const binDeRps  = Math.round(n / (binDeNs / 1e9));

  console.log(`  Binary serialize:   ${(binSerRps / 1e6).toFixed(2)} M records/s`);
  console.log(`  Binary deserialize: ${(binDeRps / 1e6).toFixed(2)} M records/s`);
}

console.log('\n' + '='.repeat(50));
console.log('  Benchmark Complete');
console.log('='.repeat(50) + '\n');
