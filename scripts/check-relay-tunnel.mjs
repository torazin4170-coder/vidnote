/**
 * Health-check a Cloudflare quick tunnel without relying on the OS DNS resolver.
 * Some Windows networks fail to resolve *.trycloudflare.com via the system resolver
 * even though public DNS (1.1.1.1) and Vercel can reach the tunnel.
 */
import { Resolver } from "node:dns/promises";
import https from "node:https";

const urlArg = process.argv[2]?.trim();
if (!urlArg) {
  console.error("Usage: node scripts/check-relay-tunnel.mjs <tunnel-url>");
  process.exit(2);
}

const target = new URL(urlArg.endsWith("/health") ? urlArg : `${urlArg.replace(/\/$/, "")}/health`);
const host = target.hostname;
const path = `${target.pathname}${target.search}`;

const resolver = new Resolver();
resolver.setServers(["1.1.1.1", "8.8.8.8"]);

let ips;
try {
  ips = await resolver.resolve4(host);
} catch (err) {
  console.error(`DNS resolve failed for ${host}: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
}

const ip = ips[0];
if (!ip) {
  console.error(`No A records for ${host}`);
  process.exit(1);
}

const statusCode = await new Promise((resolve, reject) => {
  const req = https.request(
    {
      host: ip,
      servername: host,
      path,
      method: "GET",
      headers: { Host: host, Accept: "application/json" },
      timeout: 15_000,
    },
    (res) => {
      let body = "";
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => {
        if (res.statusCode === 200 && body.includes('"ok"')) {
          resolve(res.statusCode);
          return;
        }
        reject(
          new Error(
            `Unexpected response HTTP ${res.statusCode}: ${body.slice(0, 200)}`,
          ),
        );
      });
    },
  );
  req.on("timeout", () => {
    req.destroy(new Error("timeout"));
  });
  req.on("error", reject);
  req.end();
}).catch((err) => {
  console.error(`Health check failed: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});

console.log(`OK ${host} -> ${ip} (HTTP ${statusCode})`);
