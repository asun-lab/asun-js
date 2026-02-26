/**
 * ason-js — complex examples (20 scenarios)
 * Run: node examples/complex.js  (after npm run build)
 *
 * Mirrors ason-go/examples/complex and ason-rs/examples/complex.
 */
import { encode, decode, encodePretty, encodeBinary, decodeBinary, AsonError } from '../dist/index.js';

let passed = 0, failed = 0;
function ok(label, condition, extra = '') {
  if (condition) {
    console.log(`  [OK]   ${label}`);
    passed++;
  } else {
    console.log(`  [FAIL] ${label}${extra ? ': ' + extra : ''}`);
    failed++;
  }
}
function eq(label, got, expected) {
  const g = JSON.stringify(got), e = JSON.stringify(expected);
  if (g === e) { console.log(`  [OK]   ${label}`); passed++; }
  else { console.log(`  [FAIL] ${label}`); console.log('    got:     ', g); console.log('    expected:', e); failed++; }
}
function throws(label, fn) {
  try { fn(); console.log(`  [FAIL] ${label} — expected error but none thrown`); failed++; }
  catch (e) { console.log(`  [OK]   ${label}`); passed++; }
}

console.log('\n=== ason-js complex examples (20 scenarios) ===\n');

// ---------------------------------------------------------------------------
// Example 1: Basic single-struct encode/decode
// ---------------------------------------------------------------------------
console.log('1. Basic single-struct encode/decode');
{
  const user = { id: 1, name: 'Alice', active: true };
  const schema = '{id:int, name:str, active:bool}';
  eq('roundtrip', decode(encode(user, schema)), user);
}

// ---------------------------------------------------------------------------
// Example 2: Slice of structs
// ---------------------------------------------------------------------------
console.log('2. Slice of structs');
{
  const rows = [
    { id: 1, name: 'Alice', active: true },
    { id: 2, name: 'Bob',   active: false },
  ];
  eq('slice roundtrip', decode(encode(rows, '[{id:int, name:str, active:bool}]')), rows);
}

// ---------------------------------------------------------------------------
// Example 3: Optional fields — null and present
// ---------------------------------------------------------------------------
console.log('3. Optional fields');
{
  const schema = '[{id:int, tag:str?, score:float?}]';
  const rows = [
    { id: 1, tag: 'hello', score: 9.5 },
    { id: 2, tag: null,    score: null },
    { id: 3, tag: 'bye',   score: null },
  ];
  eq('optional roundtrip', decode(encode(rows, schema)), rows);
}

// ---------------------------------------------------------------------------
// Example 4: Escaped strings — 7 cases
// ---------------------------------------------------------------------------
console.log('4. Escaped strings');
{
  const schema = '{name:str}';
  const cases = [
    '"quoted"',
    'Smith, John',
    'f(x) = y',
    'C:\\Users\\Bob',
    '[first, last]',
    '',
    'true',
  ];
  let allOk = true;
  for (const name of cases) {
    const got = (decode(encode({ name }, schema)));
    if (got.name !== name) { allOk = false; console.log(`    FAIL: ${JSON.stringify(name)}`); }
  }
  ok('7 escape cases', allOk);
}

// ---------------------------------------------------------------------------
// Example 5: Float fields
// ---------------------------------------------------------------------------
console.log('5. Float fields');
{
  const obj = { a: 1.0, b: 3.14, c: -0.001, d: 1e10 };
  const schema = '{a:float, b:float, c:float, d:float}';
  const rt = decode(encode(obj, schema));
  ok('float roundtrip', Math.abs(rt.a - obj.a) < 1e-10 && Math.abs(rt.b - obj.b) < 1e-10);
}

// ---------------------------------------------------------------------------
// Example 6: Negative numbers and integer limits
// ---------------------------------------------------------------------------
console.log('6. Negative numbers');
{
  const obj = { a: -1, b: -999999, c: -(2 ** 31), d: -3.14 };
  const schema = '{a:int, b:int, c:int, d:float}';
  eq('negative roundtrip', decode(encode(obj, schema)), obj);
}

// ---------------------------------------------------------------------------
// Example 7: All supported types in one struct
// ---------------------------------------------------------------------------
console.log('7. All types in one struct');
{
  const obj = {
    b: true, n: -42, u: 9007199254740991, f: 3.14,
    s: 'hello', on: null, of: 1.5,
  };
  const schema = '{b:bool, n:int, u:uint, f:float, s:str, on:int?, of:float?}';
  eq('all-types roundtrip', decode(encode(obj, schema)), obj);
}

// ---------------------------------------------------------------------------
// Example 8: Large flat slice (1000 records)
// ---------------------------------------------------------------------------
console.log('8. Large flat slice (1000 records)');
{
  const rows = Array.from({ length: 1000 }, (_, i) => ({
    id: i, name: `User${i}`, email: `u${i}@example.com`,
    score: i * 0.1, active: i % 2 === 0, dept: `Dept${i % 10}`,
    age: 20 + (i % 40), salary: 50000 + i * 100,
  }));
  const schema = '[{id:int, name:str, email:str, score:float, active:bool, dept:str, age:int, salary:int}]';
  const text = encode(rows, schema);
  const json = JSON.stringify(rows);
  const saving = (1 - text.length / json.length) * 100;
  console.log(`   ASON: ${text.length} B, JSON: ${json.length} B, saving: ${saving.toFixed(1)}%`);
  const decoded = decode(text);
  eq('1000-record roundtrip', decoded[999], rows[999]);
  ok('size saving > 40%', saving > 40);
}

// ---------------------------------------------------------------------------
// Example 9: encodePretty roundtrip — slice
// ---------------------------------------------------------------------------
console.log('9. encodePretty slice');
{
  const rows = [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }];
  const schema = '[{id:int, name:str}]';
  const pretty = encodePretty(rows, schema);
  ok('pretty contains newlines', pretty.includes('\n'));
  eq('pretty roundtrip', decode(pretty), rows);
}

// ---------------------------------------------------------------------------
// Example 10: encodePretty roundtrip — single struct
// ---------------------------------------------------------------------------
console.log('10. encodePretty single');
{
  const obj = { id: 1, name: 'Alice', score: 9.5, active: true };
  const pretty = encodePretty(obj, '{id:int, name:str, score:float, active:bool}');
  ok('single pretty contains newline', pretty.includes('\n'));
  eq('single pretty roundtrip', decode(pretty), obj);
}

// ---------------------------------------------------------------------------
// Example 11: encodeBinary / decodeBinary — single struct
// ---------------------------------------------------------------------------
console.log('11. Binary single struct');
{
  const obj = { id: 1, name: 'Alice', score: 9.5, active: true };
  const schema = '{id:int, name:str, score:float, active:bool}';
  const data = encodeBinary(obj, schema);
  ok('is Uint8Array', data instanceof Uint8Array);
  eq('binary single roundtrip', decodeBinary(data, schema), obj);
}

// ---------------------------------------------------------------------------
// Example 12: encodeBinary / decodeBinary — slice (500 records)
// ---------------------------------------------------------------------------
console.log('12. Binary slice (500 records)');
{
  const rows = Array.from({ length: 500 }, (_, i) => ({
    id: i, name: `U${i}`, score: i * 0.2,
  }));
  const schema = '[{id:int, name:str, score:float}]';
  const data = encodeBinary(rows, schema);
  const text = encode(rows, schema);
  console.log(`   Binary: ${data.length} B, Text: ${text.length} B`);
  eq('binary slice roundtrip last', decodeBinary(data, schema)[499], rows[499]);
}

// ---------------------------------------------------------------------------
// Example 13: Binary trailing data rejected
// ---------------------------------------------------------------------------
console.log('13. Binary trailing data rejected');
{
  const data = encodeBinary({ x: 1 }, '{x:int}');
  const padded = new Uint8Array(data.length + 1);
  padded.set(data);
  throws('trailing bytes rejected', () => decodeBinary(padded, '{x:int}'));
}

// ---------------------------------------------------------------------------
// Example 14: Invalid format rejected
// ---------------------------------------------------------------------------
console.log('14. Invalid schema rejected');
{
  throws('unknown type rejected', () => encode({ x: 1 }, '{x:bignum}'));
  throws('missing { rejected', () => encode({ x: 1 }, 'x:int'));
}

// ---------------------------------------------------------------------------
// Example 15: Binary optional fields
// ---------------------------------------------------------------------------
console.log('15. Binary optional fields');
{
  const schema = '{id:int, tag:str?, score:float?}';
  const a = { id: 1, tag: 'hello', score: 3.14 };
  const b = { id: 2, tag: null,    score: null  };
  eq('optional present binary', decodeBinary(encodeBinary(a, schema), schema), a);
  eq('optional null binary',    decodeBinary(encodeBinary(b, schema), schema), b);
}

// ---------------------------------------------------------------------------
// Example 16: Large binary slice (100 records)
// ---------------------------------------------------------------------------
console.log('16. Large binary slice (100 records)');
{
  const rows = Array.from({ length: 100 }, (_, i) => ({
    id: i, name: `User${i}`, active: i % 3 === 0,
    score: i * 1.5, dept: `D${i % 5}`,
  }));
  const schema = '[{id:int, name:str, active:bool, score:float, dept:str}]';
  const data = encodeBinary(rows, schema);
  const rt = decodeBinary(data, schema);
  eq('100-record binary last', rt[99], rows[99]);
}

// ---------------------------------------------------------------------------
// Example 17: Comments in ASON text
// ---------------------------------------------------------------------------
console.log('17. Block comments');
{
  const text = '/* user list */\n[{id:int, name:str}]:\n(1,Alice),\n(2,Bob)\n';
  const rows = decode(text);
  eq('comments decoded', rows, [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }]);
}

// ---------------------------------------------------------------------------
// Example 18: Empty slice
// ---------------------------------------------------------------------------
console.log('18. Empty slice');
{
  const schema = '[{id:int, name:str}]';
  const text = encode([], schema);
  eq('empty slice text', decode(text), []);
  const data = encodeBinary([], schema);
  eq('empty slice binary', decodeBinary(data, schema), []);
}

// ---------------------------------------------------------------------------
// Example 19: Zero-field struct (edge case)
// ---------------------------------------------------------------------------
console.log('19. Zero-field struct');
{
  const obj = {};
  const text = encode(obj, '{}');
  ok('zero-field encodes', text.includes('()'));
  eq('zero-field decode', decode(text), {});
}

// ---------------------------------------------------------------------------
// Example 20: Text/binary parity for 10 records
// ---------------------------------------------------------------------------
console.log('20. Text/binary result parity');
{
  const rows = Array.from({ length: 10 }, (_, i) => ({
    id: i, name: `N${i}`, score: i * 0.5,
  }));
  const schema = '[{id:int, name:str, score:float}]';
  const fromText = decode(encode(rows, schema));
  const fromBin  = decodeBinary(encodeBinary(rows, schema), schema);
  eq('text==binary results', fromText, fromBin);
}

// ---------------------------------------------------------------------------
console.log(`\nResult: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
else console.log('All 20 complex examples passed!');
