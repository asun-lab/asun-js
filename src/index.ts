/**
 * ASON (Array-Schema Object Notation) — JavaScript/TypeScript library.
 *
 * Zero dependencies. Works in browsers, Node.js, Deno, Bun.
 * Compatible with Vue, React, Svelte, SolidJS, and any JS framework.
 *
 * API:
 *   encode(obj, schema)            → string
 *   decode(text)                   → object | object[]
 *   encodePretty(obj, schema)      → string
 *   encodeBinary(obj, schema)      → Uint8Array
 *   decodeBinary(data, schema)     → object | object[]
 *
 * Schema strings:
 *   Single:  "{id:int, name:str, active:bool}"
 *   Slice:   "[{id:int, name:str, active:bool}]"
 *   Types:   int  uint  float  bool  str  (+ ? suffix for optional)
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type AsonObj = Record<string, unknown>;
export type AsonResult = AsonObj | AsonObj[];

type BaseType = 'int' | 'uint' | 'float' | 'bool' | 'str';
type FieldType = BaseType | `${BaseType}?`;

interface Field {
  name: string;
  base: BaseType;
  optional: boolean;
}

interface ParsedSchema {
  fields: Field[];
  isSlice: boolean;
}

// ---------------------------------------------------------------------------
// Character tables
// ---------------------------------------------------------------------------

// Bytes that force string to be wrapped in "..."
const NEEDS_QUOTE = new Uint8Array(256);
for (let i = 0; i < 32; i++) NEEDS_QUOTE[i] = 1;
for (const ch of [',', '(', ')', '[', ']', '"', '\\']) {
  NEEDS_QUOTE[ch.charCodeAt(0)] = 1;
}

// ---------------------------------------------------------------------------
// Schema parsing
// ---------------------------------------------------------------------------

// Schema cache — avoid reparsing the same schema string
const _schemaCache = new Map<string, ParsedSchema>();

/** Parse a schema string like "{id:int, name:str}" or "[{id:int}]". */
function parseSchema(schema: string): ParsedSchema {
  const cached = _schemaCache.get(schema);
  if (cached) return cached;
  const result = parseSchemaInner(schema);
  _schemaCache.set(schema, result);
  return result;
}

function parseSchemaInner(schema: string): ParsedSchema {
  let pos = 0;
  const n = schema.length;

  const skip = () => { while (pos < n && (schema[pos] === ' ' || schema[pos] === '\t')) pos++; };

  skip();
  let isSlice = false;
  if (pos < n && schema[pos] === '[') { isSlice = true; pos++; }

  skip();
  if (pos >= n || schema[pos] !== '{') throw new AsonError(`expected '{' in schema`);
  pos++; // consume '{'

  const fields: Field[] = [];
  while (pos < n) {
    skip();
    if (pos >= n) throw new AsonError('unexpected end in schema');
    if (schema[pos] === '}') { pos++; break; }
    if (fields.length > 0) {
      if (schema[pos] !== ',') throw new AsonError(`expected ',' in schema`);
      pos++;
      skip();
    }

    // Field name
    const ns = pos;
    while (pos < n && schema[pos] !== ':' && schema[pos] !== ',' && schema[pos] !== '}' && schema[pos] !== ' ' && schema[pos] !== '\t') pos++;
    const name = schema.slice(ns, pos);
    if (!name) throw new AsonError('empty field name in schema');

    skip();

    // Optional type annotation
    let typePart: FieldType = 'str';
    if (pos < n && schema[pos] === ':') {
      pos++; // consume ':'
      skip();
      // Skip nested braces/brackets (not used in flat schema but tolerated)
      if (pos < n && (schema[pos] === '{' || schema[pos] === '[')) {
        const open = schema[pos]; const close = open === '{' ? '}' : ']';
        let depth = 0;
        while (pos < n) {
          if (schema[pos] === open) depth++;
          else if (schema[pos] === close) { depth--; if (depth === 0) { pos++; break; } }
          pos++;
        }
      } else {
        const ts = pos;
        while (pos < n && schema[pos] !== ',' && schema[pos] !== '}' && schema[pos] !== ' ' && schema[pos] !== '\t') pos++;
        typePart = schema.slice(ts, pos) as FieldType;
      }
    }

    const optional = typePart.endsWith('?');
    const base = (optional ? typePart.slice(0, -1) : typePart) as BaseType;
    if (!['int', 'uint', 'float', 'bool', 'str'].includes(base)) {
      throw new AsonError(`unknown type '${base}' in schema`);
    }
    fields.push({ name, base, optional });
  }

  if (isSlice) {
    skip();
    if (pos >= n || schema[pos] !== ']') throw new AsonError(`expected ']' after schema`);
    pos++;
  }

  return { fields, isSlice };
}

// ---------------------------------------------------------------------------
// String quoting helpers
// ---------------------------------------------------------------------------

function needsQuoting(s: string): boolean {
  if (s.length === 0) return true;
  if (s.length <= 5 && (s === 'true' || s === 'false')) return true;
  if (s[0] === ' ' || s[s.length - 1] === ' ') return true;
  let couldBeNum = true;
  const numStart = s[0] === '-' ? 1 : 0;
  if (numStart >= s.length) couldBeNum = false;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (NEEDS_QUOTE[c]) return true;
    if (couldBeNum && i >= numStart && !((c >= 48 && c <= 57) || c === 46)) couldBeNum = false;
  }
  return couldBeNum && s.length > numStart;
}

function quoteStr(s: string): string {
  const parts: string[] = ['"'];
  let i = 0;
  while (i < s.length) {
    const run = i;
    while (i < s.length && s[i] !== '"' && s[i] !== '\\' && s[i] !== '\n' && s[i] !== '\t') i++;
    if (i > run) parts.push(s.slice(run, i));
    if (i >= s.length) break;
    const c = s[i++];
    if (c === '"') parts.push('\\"');
    else if (c === '\\') parts.push('\\\\');
    else if (c === '\n') parts.push('\\n');
    else if (c === '\t') parts.push('\\t');
  }
  parts.push('"');
  return parts.join('');
}

function encodeStr(s: string): string {
  return needsQuoting(s) ? quoteStr(s) : s;
}

function formatFloat(v: number): string {
  if (!isFinite(v)) return '0'; // nan/inf → 0 (ASON convention)
  if (Object.is(v, -0)) return '0';
  // Integer-valued float → append ".0"
  if (Number.isInteger(v)) return v.toFixed(1);
  // Up to 15 significant digits, trim trailing zeros
  let s = v.toPrecision(15).replace(/\.?0+$/, '');
  // Ensure there's a decimal point for floats
  if (!s.includes('.')) s += '.0';
  return s;
}

// ---------------------------------------------------------------------------
// Encode value according to field type
// ---------------------------------------------------------------------------

function encodeValue(val: unknown, base: BaseType, optional: boolean): string {
  if (optional && (val === null || val === undefined)) return '';
  switch (base) {
    case 'bool':   return val ? 'true' : 'false';
    case 'int':
    case 'uint':   return String(typeof val === 'bigint' ? val : Math.trunc(Number(val)));
    case 'float':  return formatFloat(Number(val));
    case 'str':    return encodeStr(String(val));
  }
}

// ---------------------------------------------------------------------------
// Encode tuple (one row)
// ---------------------------------------------------------------------------

function encodeTuple(obj: AsonObj, fields: Field[]): string {
  let s = '(';
  for (let i = 0; i < fields.length; i++) {
    if (i > 0) s += ',';
    const f = fields[i];
    s += encodeValue(obj[f.name], f.base, f.optional);
  }
  return s + ')';
}

// ---------------------------------------------------------------------------
// Build schema header string (always typed — schema is the user input)
// ---------------------------------------------------------------------------

function schemaHeader(schema: string, isSlice: boolean): string {
  // We emit the schema as given, normalised (no extra spaces)
  return schema.trim();
}

// ---------------------------------------------------------------------------
// encode(obj, schema) → string
// ---------------------------------------------------------------------------

export function encode(obj: AsonResult, schema: string): string {
  const parsed = parseSchema(schema);
  const { fields, isSlice: schemaIsSlice } = parsed;

  if (Array.isArray(obj)) {
    const hdr = schemaIsSlice ? schema.trim() : `[${schema.trim()}]`;
    let out = hdr + ':\n';
    for (let i = 0; i < obj.length; i++) {
      out += encodeTuple(obj[i]!, fields);
      if (i < obj.length - 1) out += ',\n';
    }
    out += '\n';
    return out;
  } else {
    const hdr = !schemaIsSlice ? schema.trim() : schema.trim().slice(1, -1); // strip [] if slice schema given
    return hdr + ':\n' + encodeTuple(obj, fields) + '\n';
  }
}

// ---------------------------------------------------------------------------
// encodePretty(obj, schema) → string
// ---------------------------------------------------------------------------

export function encodePretty(obj: AsonResult, schema: string): string {
  const compact = encode(obj, schema);
  return prettyFormat(compact);
}

// ---------------------------------------------------------------------------
// Pretty formatter — smart indentation
// ---------------------------------------------------------------------------

const PRETTY_MAX_WIDTH = 100;

function prettyFormat(src: string): string {
  // Build matching bracket lookup
  const match = buildMatchTable(src);
  const f = new PrettyFmt(src, match);
  f.writeTop();
  return f.out;
}

function buildMatchTable(src: string): Int32Array {
  const n = src.length;
  const match = new Int32Array(n).fill(-1);
  const stack: number[] = [];
  let inQuote = false;
  for (let i = 0; i < n; i++) {
    if (inQuote) {
      if (src[i] === '\\') { i++; continue; }
      if (src[i] === '"') inQuote = false;
      continue;
    }
    if (src[i] === '"') { inQuote = true; continue; }
    if (src[i] === '(' || src[i] === '[' || src[i] === '{') {
      stack.push(i);
    } else if (src[i] === ')' || src[i] === ']' || src[i] === '}') {
      if (stack.length > 0) {
        const open = stack.pop()!;
        match[open] = i;
        match[i] = open;
      }
    }
  }
  return match;
}

class PrettyFmt {
  src: string; match: Int32Array; out = ''; pos = 0; depth = 0;
  constructor(src: string, match: Int32Array) { this.src = src; this.match = match; }

  indent(): string { return '  '.repeat(this.depth); }

  isSimple(start: number, end: number): boolean {
    return end - start <= PRETTY_MAX_WIDTH && !this.src.slice(start, end + 1).includes('\n');
  }

  writeTop(): void {
    const src = this.src;
    const n = src.length;
    // Find the ':' that separates schema from data:
    // it is the first ':' at bracket-depth 0 (colons inside {}/{} are at depth ≥ 1).
    let depth = 0;
    let sepIdx = -1;
    let inQ = false;
    for (let i = 0; i < n; i++) {
      const c = src[i];
      if (inQ) { if (c === '\\') { i++; continue; } if (c === '"') inQ = false; continue; }
      if (c === '"') { inQ = true; continue; }
      if (c === '{' || c === '[') depth++;
      else if (c === '}' || c === ']') depth--;
      else if (c === ':' && depth === 0) { sepIdx = i; break; }
    }
    if (sepIdx === -1) { this.out = src; return; }
    this.out += src.slice(0, sepIdx + 1); // schema header + ':'
    this.pos = sepIdx + 1;
    this.skipNewlines();
    this.out += '\n';
    // Write rows
    while (this.pos < n) {
      this.skipWhitespaceAndCommas();
      if (this.pos >= n) break;
      if (src[this.pos] === '(') {
        const close = this.match[this.pos];
        if (close === -1 || this.isSimple(this.pos, close)) {
          while (this.pos <= close) this.out += src[this.pos++];
        } else {
          this.writeTuple();
        }
        this.skipWhitespace();
        if (this.pos < n && src[this.pos] === ',') { this.out += ',\n'; this.pos++; }
        else this.out += '\n';
      } else {
        this.out += src[this.pos++];
      }
    }
  }

  writeTuple(): void {
    this.out += '(\n';
    this.pos++; // '('
    this.depth++;
    let first = true;
    while (this.pos < this.src.length && this.src[this.pos] !== ')') {
      this.skipWhitespace();
      if (this.src[this.pos] === ',') { this.pos++; this.skipWhitespace(); continue; }
      if (!first) this.out += ',\n';
      first = false;
      this.out += this.indent();
      this.writeValue();
    }
    this.depth--;
    this.out += '\n' + this.indent() + ')';
    if (this.pos < this.src.length) this.pos++; // ')'
  }

  writeValue(): void {
    const src = this.src;
    if (this.pos >= src.length) return;
    const c = src[this.pos];
    if (c === '(' || c === '[') {
      const close = this.match[this.pos];
      if (close === -1 || this.isSimple(this.pos, close)) {
        while (this.pos <= close) this.out += src[this.pos++];
      } else {
        if (c === '(') this.writeTuple();
        else this.writeList();
      }
    } else if (c === '"') {
      // quoted string - copy verbatim
      this.out += src[this.pos++];
      while (this.pos < src.length) {
        const ch = src[this.pos];
        this.out += ch;
        this.pos++;
        if (ch === '\\') { this.out += src[this.pos++]; continue; }
        if (ch === '"') break;
      }
    } else {
      // plain value
      while (this.pos < src.length && src[this.pos] !== ',' && src[this.pos] !== ')' && src[this.pos] !== ']') {
        this.out += src[this.pos++];
      }
    }
  }

  writeList(): void {
    this.out += '[\n';
    this.pos++; // '['
    this.depth++;
    let first = true;
    while (this.pos < this.src.length && this.src[this.pos] !== ']') {
      this.skipWhitespace();
      if (this.src[this.pos] === ',') { this.pos++; this.skipWhitespace(); continue; }
      if (!first) this.out += ',\n';
      first = false;
      this.out += this.indent();
      this.writeValue();
    }
    this.depth--;
    this.out += '\n' + this.indent() + ']';
    if (this.pos < this.src.length) this.pos++; // ']'
  }

  skipWhitespace(): void {
    while (this.pos < this.src.length && (this.src[this.pos] === ' ' || this.src[this.pos] === '\t' || this.src[this.pos] === '\n' || this.src[this.pos] === '\r')) this.pos++;
  }
  skipNewlines(): void {
    while (this.pos < this.src.length && (this.src[this.pos] === '\n' || this.src[this.pos] === '\r')) this.pos++;
  }
  skipWhitespaceAndCommas(): void {
    while (this.pos < this.src.length) {
      const c = this.src[this.pos];
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === ',') this.pos++;
      else break;
    }
  }
}

// ---------------------------------------------------------------------------
// decode(text) → AsonResult
// Parses the schema embedded in the ASON text itself.
// ---------------------------------------------------------------------------

export function decode(text: string): AsonResult {
  const dec = new Decoder(text);
  return dec.decodeTop();
}

class Decoder {
  src: string; pos: number;
  constructor(src: string) { this.src = src; this.pos = 0; }

  err(msg: string): never { throw new AsonError(`${msg} at pos ${this.pos}`); }

  skip(): void {
    const s = this.src;
    while (this.pos < s.length) {
      const c = s[this.pos];
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { this.pos++; continue; }
      // Block comment
      if (c === '/' && this.pos + 1 < s.length && s[this.pos + 1] === '*') {
        this.pos += 2;
        while (this.pos + 1 < s.length && !(s[this.pos] === '*' && s[this.pos + 1] === '/')) this.pos++;
        this.pos += 2;
        continue;
      }
      break;
    }
  }

  decodeTop(): AsonResult {
    this.skip();
    const s = this.src;
    const isSlice = s[this.pos] === '[' && this.pos + 1 < s.length && s[this.pos + 1] === '{';

    if (isSlice) {
      this.pos++; // skip '['
    }

    if (this.pos >= s.length || s[this.pos] !== '{') this.err('expected {');
    const fields = this.parseSchemaFields();

    this.skip();
    if (isSlice) {
      if (this.pos >= s.length || s[this.pos] !== ']') this.err('expected ]');
      this.pos++;
    }
    this.skip();
    if (this.pos >= s.length || s[this.pos] !== ':') this.err('expected :');
    this.pos++;

    if (isSlice) {
      const results: AsonObj[] = [];
      while (true) {
        this.skip();
        if (this.pos >= s.length || s[this.pos] !== '(') break;
        results.push(this.parseTuple(fields));
        this.skip();
        if (this.pos < s.length && s[this.pos] === ',') { this.pos++; }
      }
      return results;
    } else {
      this.skip();
      const obj = this.parseTuple(fields);
      this.skip();
      if (this.pos < s.length) this.err('trailing content after decoded value');
      return obj;
    }
  }

  /** Parse {field:type, ...} and return Field array */
  parseSchemaFields(): Field[] {
    const s = this.src;
    if (s[this.pos] !== '{') this.err('expected {');
    this.pos++;
    const fields: Field[] = [];
    while (this.pos < s.length) {
      this.skip();
      if (s[this.pos] === '}') { this.pos++; break; }
      if (fields.length > 0) {
        if (s[this.pos] !== ',') this.err('expected , in schema');
        this.pos++;
        this.skip();
      }
      // Field name
      const ns = this.pos;
      while (this.pos < s.length && s[this.pos] !== ':' && s[this.pos] !== ',' && s[this.pos] !== '}' && s[this.pos] !== ' ' && s[this.pos] !== '\t') this.pos++;
      const name = s.slice(ns, this.pos);
      if (!name) this.err('empty field name');
      this.skip();
      let typePart: FieldType = 'str';
      if (this.pos < s.length && s[this.pos] === ':') {
        this.pos++;
        this.skip();
        // Skip nested structures
        if (this.pos < s.length && (s[this.pos] === '{' || s[this.pos] === '[')) {
          const open = s[this.pos]; const close = open === '{' ? '}' : ']';
          let depth = 0;
          while (this.pos < s.length) {
            if (s[this.pos] === open) depth++;
            else if (s[this.pos] === close) { depth--; if (depth === 0) { this.pos++; break; } }
            this.pos++;
          }
        } else {
          const ts = this.pos;
          while (this.pos < s.length && s[this.pos] !== ',' && s[this.pos] !== '}' && s[this.pos] !== ' ' && s[this.pos] !== '\t') this.pos++;
          typePart = s.slice(ts, this.pos) as FieldType;
        }
      }
      const optional = typePart.endsWith('?');
      const base = (optional ? typePart.slice(0, -1) : typePart) as BaseType;
      fields.push({ name, base, optional });
    }
    return fields;
  }

  parseTuple(fields: Field[]): AsonObj {
    const s = this.src;
    if (s[this.pos] !== '(') this.err('expected (');
    this.pos++;
    const obj: AsonObj = {};
    for (let i = 0; i < fields.length; i++) {
      this.skip();
      // End of tuple (source has fewer fields than schema)
      if (this.pos >= s.length || s[this.pos] === ')') {
        // Set remaining optional fields to null
        for (let j = i; j < fields.length; j++) {
          if (fields[j]!.optional) obj[fields[j]!.name] = null;
        }
        break;
      }
      if (i > 0) {
        if (s[this.pos] !== ',') this.err('expected ,');
        this.pos++;
        this.skip();
      }
      const f = fields[i]!;
      // Optional: if at ',' or ')' the value is absent → null
      if (f.optional && (this.pos >= s.length || s[this.pos] === ',' || s[this.pos] === ')')) {
        obj[f.name] = null;
        continue;
      }
      obj[f.name] = this.parseValue(f.base);
    }
    this.skip();
    if (this.pos < s.length && s[this.pos] === ')') this.pos++;
    return obj;
  }

  parseValue(base: BaseType): unknown {
    const s = this.src;
    this.skip();
    switch (base) {
      case 'bool': return this.parseBool();
      case 'int':  return this.parseInt();
      case 'uint': return this.parseUint();
      case 'float': return this.parseFloat();
      case 'str':  return this.parseString();
    }
  }

  parseBool(): boolean {
    const s = this.src;
    if (s.startsWith('true', this.pos)) { this.pos += 4; return true; }
    if (s.startsWith('false', this.pos)) { this.pos += 5; return false; }
    this.err('invalid bool');
  }

  parseInt(): number {
    const s = this.src;
    let neg = false;
    if (s[this.pos] === '-') { neg = true; this.pos++; }
    const start = this.pos;
    let v = 0;
    while (this.pos < s.length) {
      const c = s.charCodeAt(this.pos);
      if (c < 48 || c > 57) break;
      v = v * 10 + (c - 48);
      this.pos++;
    }
    if (this.pos === start) this.err('invalid int');
    return neg ? -v : v;
  }

  parseUint(): number {
    const s = this.src;
    const start = this.pos;
    let v = 0;
    while (this.pos < s.length) {
      const c = s.charCodeAt(this.pos);
      if (c < 48 || c > 57) break;
      v = v * 10 + (c - 48);
      this.pos++;
    }
    if (this.pos === start) this.err('invalid uint');
    return v;
  }

  parseFloat(): number {
    const s = this.src;
    const start = this.pos;
    if (s[this.pos] === '-') this.pos++;
    while (this.pos < s.length && s[this.pos] >= '0' && s[this.pos] <= '9') this.pos++;
    if (this.pos < s.length && s[this.pos] === '.') {
      this.pos++;
      while (this.pos < s.length && s[this.pos] >= '0' && s[this.pos] <= '9') this.pos++;
    }
    if (this.pos === start) this.err('invalid float');
    return parseFloat(s.slice(start, this.pos));
  }

  parseString(): string {
    const s = this.src;
    if (s[this.pos] === '"') return this.parseQuotedString();
    // Plain value: read until delimiter
    const start = this.pos;
    while (this.pos < s.length && s[this.pos] !== ',' && s[this.pos] !== ')' && s[this.pos] !== ']') {
      if (s[this.pos] === '\\') this.pos += 2;
      else this.pos++;
    }
    // Handle escape sequences in plain string
    const raw = s.slice(start, this.pos);
    if (raw.includes('\\')) return unescapePlain(raw);
    return raw;
  }

  parseQuotedString(): string {
    this.pos++; // skip opening '"'
    const s = this.src;
    const start = this.pos;
    // Fast path: scan for closing " with no escape
    let scan = this.pos;
    while (scan < s.length && s[scan] !== '"' && s[scan] !== '\\') scan++;
    if (scan < s.length && s[scan] === '"') {
      this.pos = scan + 1;
      return s.slice(start, scan);
    }
    // Slow path: has escapes — collect segments
    const parts: string[] = [];
    if (scan > start) parts.push(s.slice(start, scan));
    this.pos = scan;
    while (this.pos < s.length) {
      const c = s[this.pos];
      if (c === '"') { this.pos++; break; }
      if (c === '\\') {
        this.pos++;
        const e = s[this.pos++];
        if (e === 'n') parts.push('\n');
        else if (e === 't') parts.push('\t');
        else parts.push(e);
      } else {
        // Batch non-escape run
        const rs = this.pos;
        while (this.pos < s.length && s[this.pos] !== '"' && s[this.pos] !== '\\') this.pos++;
        parts.push(s.slice(rs, this.pos));
      }
    }
    return parts.join('');
  }
}

function unescapePlain(s: string): string {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\') {
      i++;
      if (s[i] === 'n') out += '\n';
      else if (s[i] === 't') out += '\t';
      else out += s[i];
    } else out += s[i];
  }
  return out;
}

// ---------------------------------------------------------------------------
// Binary encode/decode
// Schema-driven; layout matches ason-rs and ason-go.
//
// int   → 8 bytes i64 LE
// uint  → 8 bytes u64 LE
// float → 8 bytes f64 LE
// bool  → 1 byte (0/1)
// str   → 4-byte length LE + UTF-8 bytes
// opt?  → 1-byte tag (0=null, 1=present) + value if present
// slice → 4-byte count LE + each element
// ---------------------------------------------------------------------------

const encoder = new TextEncoder();
const decoder_utf8 = new TextDecoder();

// Reusable ArrayBuffer + DataView for float encoding (avoids per-float allocation)
const _f64Buf = new ArrayBuffer(8);
const _f64View = new DataView(_f64Buf);
const _f64Bytes = new Uint8Array(_f64Buf);

// Growable binary buffer — avoids number[] + per-element push
class BinWriter {
  buf: Uint8Array;
  len: number;
  constructor(cap: number) {
    this.buf = new Uint8Array(cap);
    this.len = 0;
  }
  private grow(need: number): void {
    if (this.len + need <= this.buf.length) return;
    let nc = this.buf.length;
    while (nc < this.len + need) nc = nc * 2;
    const nb = new Uint8Array(nc);
    nb.set(this.buf.subarray(0, this.len));
    this.buf = nb;
  }
  push(b: number): void {
    if (this.len >= this.buf.length) this.grow(1);
    this.buf[this.len++] = b;
  }
  pushU32LE(v: number): void {
    this.grow(4);
    this.buf[this.len++] = v & 0xFF;
    this.buf[this.len++] = (v >> 8) & 0xFF;
    this.buf[this.len++] = (v >> 16) & 0xFF;
    this.buf[this.len++] = (v >> 24) & 0xFF;
  }
  pushI64LE(v: number | bigint): void {
    this.grow(8);
    if (typeof v === 'number' && v >= -2147483648 && v <= 2147483647) {
      // Safe 32-bit int fast path — avoid BigInt
      const iv = v | 0;
      this.buf[this.len++] = iv & 0xFF;
      this.buf[this.len++] = (iv >> 8) & 0xFF;
      this.buf[this.len++] = (iv >> 16) & 0xFF;
      this.buf[this.len++] = (iv >> 24) & 0xFF;
      // sign-extend high 4 bytes
      const sign = iv < 0 ? 0xFF : 0;
      this.buf[this.len++] = sign;
      this.buf[this.len++] = sign;
      this.buf[this.len++] = sign;
      this.buf[this.len++] = sign;
      return;
    }
    const big = typeof v === 'bigint' ? v : BigInt(Math.trunc(Number(v)));
    const lo = Number(big & 0xFFFFFFFFn);
    const hi = Number((big >> 32n) & 0xFFFFFFFFn);
    this.buf[this.len++] = lo & 0xFF;
    this.buf[this.len++] = (lo >> 8) & 0xFF;
    this.buf[this.len++] = (lo >> 16) & 0xFF;
    this.buf[this.len++] = (lo >> 24) & 0xFF;
    this.buf[this.len++] = hi & 0xFF;
    this.buf[this.len++] = (hi >> 8) & 0xFF;
    this.buf[this.len++] = (hi >> 16) & 0xFF;
    this.buf[this.len++] = (hi >> 24) & 0xFF;
  }
  pushF64LE(v: number): void {
    this.grow(8);
    _f64View.setFloat64(0, v, true);
    this.buf.set(_f64Bytes, this.len);
    this.len += 8;
  }
  pushBytes(data: Uint8Array): void {
    this.grow(data.length);
    this.buf.set(data, this.len);
    this.len += data.length;
  }
  finish(): Uint8Array {
    return this.buf.slice(0, this.len);
  }
}

function writeBinValueW(w: BinWriter, val: unknown, f: Field): void {
  if (f.optional) {
    if (val === null || val === undefined) { w.push(0); return; }
    w.push(1);
  }
  switch (f.base) {
    case 'bool':  w.push(val ? 1 : 0); break;
    case 'int':   w.pushI64LE(val as number | bigint); break;
    case 'uint':  w.pushI64LE(val as number | bigint); break;
    case 'float': w.pushF64LE(Number(val)); break;
    case 'str': {
      const bytes = encoder.encode(String(val));
      w.pushU32LE(bytes.length);
      w.pushBytes(bytes);
      break;
    }
  }
}

export function encodeBinary(obj: AsonResult, schema: string): Uint8Array {
  const { fields, isSlice } = parseSchema(schema);
  const rows = Array.isArray(obj) ? obj.length : 1;
  const w = new BinWriter(rows * fields.length * 16 + 16);

  if (Array.isArray(obj)) {
    w.pushU32LE(obj.length);
    for (const row of obj) {
      for (const f of fields) writeBinValueW(w, row[f.name], f);
    }
  } else {
    for (const f of fields) writeBinValueW(w, (obj as AsonObj)[f.name], f);
  }

  return w.finish();
}

// Read helpers
function readI64LE(dv: DataView, pos: number): number {
  const lo = dv.getUint32(pos, true);
  const hi = dv.getInt32(pos + 4, true);
  const big = (BigInt(hi) << 32n) | BigInt(lo);
  // Return as number if fits in safe range, else bigint cast
  if (big >= BigInt(Number.MIN_SAFE_INTEGER) && big <= BigInt(Number.MAX_SAFE_INTEGER)) {
    return Number(big);
  }
  return Number(big); // best effort for large values; for exactness use BigInt
}

function readU64LE(dv: DataView, pos: number): number {
  const lo = dv.getUint32(pos, true);
  const hi = dv.getUint32(pos + 4, true);
  const big = (BigInt(hi) << 32n) | BigInt(lo);
  if (big <= BigInt(Number.MAX_SAFE_INTEGER)) return Number(big);
  return Number(big);
}

function readF64LE(dv: DataView, pos: number): number {
  return dv.getFloat64(pos, true);
}

function readU32LE(dv: DataView, pos: number): number {
  return dv.getUint32(pos, true);
}

class BinDecoder {
  dv: DataView; pos: number;
  constructor(data: Uint8Array) { this.dv = new DataView(data.buffer, data.byteOffset, data.byteLength); this.pos = 0; }
  err(msg: string): never { throw new AsonError(`binary decode: ${msg} at byte ${this.pos}`); }

  readStruct(fields: Field[]): AsonObj {
    const obj: AsonObj = {};
    for (const f of fields) obj[f.name] = this.readField(f);
    return obj;
  }

  readField(f: Field): unknown {
    if (f.optional) {
      const tag = this.dv.getUint8(this.pos++);
      if (tag === 0) return null;
    }
    switch (f.base) {
      case 'bool':  return this.dv.getUint8(this.pos++) !== 0;
      case 'int':   { const v = readI64LE(this.dv, this.pos); this.pos += 8; return v; }
      case 'uint':  { const v = readU64LE(this.dv, this.pos); this.pos += 8; return v; }
      case 'float': { const v = readF64LE(this.dv, this.pos); this.pos += 8; return v; }
      case 'str': {
        const len = readU32LE(this.dv, this.pos); this.pos += 4;
        const bytes = new Uint8Array(this.dv.buffer, this.dv.byteOffset + this.pos, len);
        this.pos += len;
        return decoder_utf8.decode(bytes);
      }
    }
  }
}

export function decodeBinary(data: Uint8Array, schema: string): AsonResult {
  const { fields, isSlice } = parseSchema(schema);
  const bd = new BinDecoder(data);

  let result: AsonResult;
  if (isSlice) {
    const count = readU32LE(bd.dv, bd.pos); bd.pos += 4;
    const rows: AsonObj[] = [];
    for (let i = 0; i < count; i++) rows.push(bd.readStruct(fields));
    result = rows;
  } else {
    result = bd.readStruct(fields);
  }

  if (bd.pos !== data.length) throw new AsonError(`binary decode: trailing bytes (read ${bd.pos}, total ${data.length})`);
  return result;
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class AsonError extends Error {
  constructor(msg: string) { super(`ASON: ${msg}`); this.name = 'AsonError'; }
}
