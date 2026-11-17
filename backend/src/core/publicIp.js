import { isIP } from 'node:net';

// Only publicly routable addresses may be linked to users or used for IP bans.
// In particular, reverse-proxy addresses (10/8, 172.16/12, 192.168/16,
// link-local, loopback and shared carrier NAT space) must never be recorded.
const BLOCKED_V4_RANGES = [
  [0x00000000, 8],      // Current network / unspecified
  [0x0a000000, 8],      // Private 10/8
  [0x64400000, 10],     // Shared CGNAT 100.64/10
  [0x7f000000, 8],      // Loopback
  [0xa9fe0000, 16],     // Link-local
  [0xac100000, 12],     // Private 172.16/12
  [0xc0000000, 24],     // IETF assignments 192.0.0/24
  [0xc0000200, 24],     // Documentation 192.0.2/24
  [0xc0586300, 24],     // 6to4 relay anycast 192.88.99/24
  [0xc0a80000, 16],     // Private 192.168/16
  [0xc6120000, 15],     // Benchmarking 198.18/15
  [0xc6336400, 24],     // Documentation 198.51.100/24
  [0xcb007100, 24],     // Documentation 203.0.113/24
  [0xe0000000, 4],      // Multicast
  [0xf0000000, 4],      // Reserved and limited broadcast
];

function v4AsNumber(ip) {
  return ip.split('.').reduce((value, octet) => ((value << 8) | Number(octet)) >>> 0, 0);
}

export function normalizePublicIp(value) {
  if (typeof value !== 'string') return null;
  let ip = value.trim();
  // IPv4-mapped IPv6 appears on some Node/Socket.IO connections.
  if (/^::ffff:/i.test(ip) && isIP(ip.slice(7)) === 4) ip = ip.slice(7);
  const kind = isIP(ip);
  if (kind === 4) {
    const address = v4AsNumber(ip);
    for (const [network, bits] of BLOCKED_V4_RANGES) {
      const mask = (0xffffffff << (32 - bits)) >>> 0;
      if ((address & mask) >>> 0 === (network & mask) >>> 0) return null;
    }
    return ip;
  }
  if (kind !== 6) return null;
  ip = ip.toLowerCase();
  // IPv6 global unicast is in 2000::/3. Do not show local, multicast,
  // unspecified, loopback, ULA, link-local or documentation addresses.
  if (!/^[23][0-9a-f]{3}:/u.test(ip) && !/^[23][0-9a-f]{0,2}:/u.test(ip)) return null;
  if (/^2001:0?db8:/u.test(ip)) return null;
  return ip;
}

// For a Render-hosted backend, Cloudflare/Render provide the real visitor IP
// in CF-Connecting-IP. X-Forwarded-For may contain user-provided entries AND
// several private proxy hops; never select an arbitrary "first public" IP
// from that header for a security decision such as an IP ban.
//
// For a separately configured, trusted SINGLE reverse proxy, the rightmost
// X-Forwarded-For value is the immediate client's address. Without a trusted
// proxy, only the TCP peer address is reliable.
export function publicIpFromRequest(request, { onRender = false, trustProxy = false } = {}) {
  const headers = request?.headers || {};
  if (onRender) {
    const cfIp = headers['cf-connecting-ip'];
    const cfRay = headers['cf-ray'];
    // If either edge header is absent, fail closed rather than recording or
    // banning a proxy address (or trusting a spoofable forwarded value).
    return typeof cfRay === 'string' && cfRay.length > 0
      ? normalizePublicIp(cfIp) : null;
  }
  if (trustProxy) {
    const forwarded = headers['x-forwarded-for'];
    const lastHop = typeof forwarded === 'string' ? forwarded.split(',').at(-1)?.trim() : null;
    if (lastHop) return normalizePublicIp(lastHop);
  }
  return normalizePublicIp(request?.socket?.remoteAddress || request?.connection?.remoteAddress);
}
