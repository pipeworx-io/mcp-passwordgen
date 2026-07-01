interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface McpToolExport {
  tools: McpToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  meter?: { credits: number };
  cost?: Record<string, unknown>;
  provider?: string;
}

/**
 * Secure password generator MCP.
 *
 * Keyless, offline: generate cryptographically-random passwords and numeric
 * PINs using the platform CSPRNG (crypto.getRandomValues) with unbiased
 * rejection sampling. No API, no key; nothing is stored. Complements the
 * `password` pack (which analyzes strength).
 */


// Unbiased index in [0, n) via rejection sampling on a Uint32.
function randIndex(n: number): number {
  const max = Math.floor(0xffffffff / n) * n;
  const buf = new Uint32Array(1);
  let x: number;
  do { crypto.getRandomValues(buf); x = buf[0]; } while (x >= max);
  return x % n;
}
function pick(pool: string, len: number): string {
  let out = '';
  for (let i = 0; i < len; i++) out += pool[randIndex(pool.length)];
  return out;
}

const tools: McpToolExport['tools'] = [
  {
    name: 'generate_password',
    description: 'Generate cryptographically-random password(s) (keyless, offline, CSPRNG). Control the character sets and length; returns the password(s) and their entropy in bits.',
    inputSchema: {
      type: 'object',
      properties: {
        length: { type: 'number', description: 'Password length (4-256, default 20).' },
        uppercase: { type: 'boolean', description: 'Include A-Z (default true).' },
        lowercase: { type: 'boolean', description: 'Include a-z (default true).' },
        digits: { type: 'boolean', description: 'Include 0-9 (default true).' },
        symbols: { type: 'boolean', description: 'Include punctuation (default true).' },
        exclude_ambiguous: { type: 'boolean', description: 'Exclude look-alikes (0/O, 1/l/I) (default false).' },
        count: { type: 'number', description: 'How many to generate (1-50, default 1).' },
      },
    },
  },
  {
    name: 'generate_pin',
    description: 'Generate a cryptographically-random numeric PIN (keyless, offline).',
    inputSchema: {
      type: 'object',
      properties: {
        length: { type: 'number', description: 'PIN length (3-32, default 6).' },
        count: { type: 'number', description: 'How many (1-50, default 1).' },
      },
    },
  },
];

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'generate_password': {
      const length = clamp(numArg(args.length, 20), 4, 256);
      const bool = (k: string, d: boolean) => (typeof args[k] === 'boolean' ? (args[k] as boolean) : d);
      let upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', lower = 'abcdefghijklmnopqrstuvwxyz', dig = '0123456789';
      const sym = '!@#$%^&*()-_=+[]{};:,.<>?';
      let pool = '';
      if (bool('uppercase', true)) pool += upper;
      if (bool('lowercase', true)) pool += lower;
      if (bool('digits', true)) pool += dig;
      if (bool('symbols', true)) pool += sym;
      if (!pool) return { error: 'At least one character set must be enabled.' };
      if (bool('exclude_ambiguous', false)) pool = pool.replace(/[0O1lI|]/g, '');
      const count = clamp(numArg(args.count, 1), 1, 50);
      const list = Array.from({ length: count }, () => pick(pool, length));
      const entropy = +(length * Math.log2(pool.length)).toFixed(1);
      return count === 1 ? { password: list[0], length, pool_size: pool.length, entropy_bits: entropy } : { count, length, pool_size: pool.length, entropy_bits: entropy, passwords: list };
    }
    case 'generate_pin': {
      const length = clamp(numArg(args.length, 6), 3, 32);
      const count = clamp(numArg(args.count, 1), 1, 50);
      const list = Array.from({ length: count }, () => pick('0123456789', length));
      return count === 1 ? { pin: list[0], length } : { count, length, pins: list };
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

function numArg(v: unknown, d: number): number { const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN; return Number.isFinite(n) ? n : d; }
function clamp(n: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, Math.trunc(n))); }

export default { tools, callTool, meter: { credits: 1 } } satisfies McpToolExport;
