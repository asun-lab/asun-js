/**
 * ason-js — basic usage examples
 * Run: node examples/basic.js  (after npm run build)
 */
import { encode, decode, encodePretty, encodeBinary, decodeBinary } from '../dist/index.js';

let passed = 0;
function check(label, got, expected) {
  const ok = JSON.stringify(got) === JSON.stringify(expected);
  console.log(`  [${ok ? 'OK' : 'FAIL'}] ${label}`);
  if (!ok) { console.log('    got:     ', got); console.log('    expected:', expected); }
  if (ok) passed++;
}

console.log('\n=== ason-js basic examples ===\n');

// ---------------------------------------------------------------------------
// 1. Single struct encode/decode
// ---------------------------------------------------------------------------
console.log('1. Single struct');
{
  const user = { id: 1, name: 'Alice', active: true };
  const schema = '{id:int, name:str, active:bool}';
  const text = encode(user, schema);
  console.log('   encoded:', JSON.stringify(text));
  check('roundtrip', decode(text), user);
}

// ---------------------------------------------------------------------------
// 2. Slice encode/decode
// ---------------------------------------------------------------------------
console.log('2. Slice of structs');
{
  const users = [
    { id: 1, name: 'Alice', active: true },
    { id: 2, name: 'Bob',   active: false },
    { id: 3, name: 'Carol', active: true },
  ];
  const schema = '[{id:int, name:str, active:bool}]';
  const text = encode(users, schema);
  console.log('   encoded:\n' + text);
  check('slice roundtrip', decode(text), users);
}

// ---------------------------------------------------------------------------
// 3. Float and negative numbers
// ---------------------------------------------------------------------------
console.log('3. Float and negative integers');
{
  const rec = { score: 9.5, delta: -0.25, count: -42 };
  const schema = '{score:float, delta:float, count:int}';
  check('float/neg roundtrip', decode(encode(rec, schema)), rec);
}

// ---------------------------------------------------------------------------
// 4. Optional fields
// ---------------------------------------------------------------------------
console.log('4. Optional fields');
{
  const schema = '{id:int, tag:str?, rating:float?}';
  const a = { id: 1, tag: 'hello', rating: 4.5 };
  const b = { id: 2, tag: null,    rating: null };
  check('optional present', decode(encode(a, schema)), a);
  check('optional null',    decode(encode(b, schema)), b);
}

// ---------------------------------------------------------------------------
// 5. String quoting
// ---------------------------------------------------------------------------
console.log('5. String quoting');
{
  const schema = '{name:str}';
  for (const name of ['Alice', 'Smith, John', 'f(x)', '', 'true', '42', 'C:\\path']) {
    check(`quote: ${JSON.stringify(name)}`, decode(encode({ name }, schema)), { name });
  }
}

// ---------------------------------------------------------------------------
// 6. encodePretty
// ---------------------------------------------------------------------------
console.log('6. encodePretty');
{
  const rows = [
    { id: 1, name: 'Alice', score: 9.5 },
    { id: 2, name: 'Bob',   score: 7.2 },
  ];
  const schema = '[{id:int, name:str, score:float}]';
  const pretty = encodePretty(rows, schema);
  console.log('   pretty:\n' + pretty);
  check('pretty roundtrip', decode(pretty), rows);
}

// ---------------------------------------------------------------------------
// 7. encodeBinary / decodeBinary
// ---------------------------------------------------------------------------
console.log('7. Binary encode/decode');
{
  const rows = [
    { id: 1, name: 'Alice', score: 9.5,  active: true  },
    { id: 2, name: 'Bob',   score: 7.125, active: false },
  ];
  const schema = '[{id:int, name:str, score:float, active:bool}]';
  const data = encodeBinary(rows, schema);
  console.log(`   binary size: ${data.length} bytes`);
  check('binary roundtrip', decodeBinary(data, schema), rows);
}

// ---------------------------------------------------------------------------
// 8. uint field
// ---------------------------------------------------------------------------
console.log('8. uint field');
{
  const obj = { n: 9007199254740991 }; // Number.MAX_SAFE_INTEGER
  check('uint roundtrip', decode(encode(obj, '{n:uint}')), obj);
  check('uint binary roundtrip', decodeBinary(encodeBinary(obj, '{n:uint}'), '{n:uint}'), obj);
}

// ---------------------------------------------------------------------------
// 9. Size comparison vs JSON
// ---------------------------------------------------------------------------
console.log('9. Size comparison vs JSON');
{
  const rows = Array.from({ length: 100 }, (_, i) => ({
    id: i, name: `User${i}`, score: i * 0.5, active: i % 2 === 0,
  }));
  const schema = '[{id:int, name:str, score:float, active:bool}]';
  const asonText = encode(rows, schema);
  const json = JSON.stringify(rows);
  const saving = (1 - asonText.length / json.length) * 100;
  console.log(`   ASON: ${asonText.length} bytes, JSON: ${json.length} bytes, saving: ${saving.toFixed(1)}%`);
  check('size saving > 20%', saving > 20, true);
}

console.log(`\nResult: ${passed} passed`);
