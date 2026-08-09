import { createServer } from "node:http";
import { fileURLToPath } from "url";
import { hostname } from "node:os";
import { server as wisp, logging } from "@mercuryworkshop/wisp-js/server";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";

import { scramjetPath } from "@mercuryworkshop/scramjet/path";
import { libcurlPath } from "@mercuryworkshop/libcurl-transport";
import { baremuxPath } from "@mercuryworkshop/bare-mux/node";

const publicPath = fileURLToPath(new URL("../public/", import.meta.url));

logging.set_level(logging.NONE);
Object.assign(wisp.options, {
  allow_udp_streams: false,
  hostname_blacklist: [/example\.com/],
  dns_servers: ["1.1.1.3", "1.0.0.3"],
});

const fastify = Fastify({
  serverFactory: (handler) => {
    return createServer()
      .on("request", (req, res) => {
        // API para Prism (CORS). El resto sigue con COOP/COEP para Scramjet.
        if (req.url && req.url.startsWith("/api/")) {
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
          res.setHeader("Access-Control-Allow-Headers", "*");
        } else {
          res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
          res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
        }
        handler(req, res);
      })
      .on("upgrade", (req, socket, head) => {
        if (req.url.endsWith("/wisp/")) wisp.routeRequest(req, socket, head);
        else socket.end();
      });
  },
});

/* ===================== PRISM BACKEND ===================== */
function sendError(reply, status, code, message, extra = {}) {
  return reply
    .header("Access-Control-Allow-Origin", "*")
    .header("Content-Type", "application/json; charset=utf-8")
    .code(status)
    .send({
      ok: false,
      error: true,
      code,
      message,
      ...extra,
    });
}

fastify.options("/api/proxy", async (req, reply) => {
  return reply
    .header("Access-Control-Allow-Origin", "*")
    .header("Access-Control-Allow-Methods", "GET,OPTIONS")
    .header("Access-Control-Allow-Headers", "*")
    .code(204)
    .send();
});

fastify.get("/api/health", async (req, reply) => {
  return reply.header("Access-Control-Allow-Origin", "*").send({
    ok: true,
    service: "hoshi-backend",
    proxy: "/api/proxy?url=",
    time: new Date().toISOString(),
  });
});

fastify.get("/api/proxy", async (req, reply) => {
  const target = String(req.query.url || "").trim();

  if (!target) {
    return sendError(reply, 400, "MISSING_URL", "Falta ?url= en la petición");
  }

  let parsed;
  try {
    parsed = new URL(target);
  } catch {
    return sendError(reply, 400, "INVALID_URL", "URL inválida", { target });
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    return sendError(reply, 400, "BAD_PROTOCOL", "Solo http/https", {
      protocol: parsed.protocol,
    });
  }

  const started = Date.now();
  try {
    const res = await fetch(parsed.href, {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/*,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9,es;q=0.8",
      },
    });

    const contentType =
      res.headers.get("content-type") || "application/octet-stream";
    const buf = Buffer.from(await res.arrayBuffer());
    const ms = Date.now() - started;

    return reply
      .header("Access-Control-Allow-Origin", "*")
      .header(
        "Access-Control-Expose-Headers",
        "x-final-url,x-proxy-status,x-proxy-ms,content-type"
      )
      .header("X-Final-Url", res.url || parsed.href)
      .header("X-Proxy-Status", String(res.status))
      .header("X-Proxy-Ms", String(ms))
      .header("Content-Type", contentType)
      .header("Cache-Control", "no-store")
      .code(res.status >= 400 ? 200 : res.status)
      .send(buf);
  } catch (err) {
    const msg = String(err && err.message ? err.message : err);
    let code = "FETCH_FAILED";
    if (/ENOTFOUND|getaddrinfo/i.test(msg)) code = "DNS_FAILED";
    if (/ECONNREFUSED/i.test(msg)) code = "CONN_REFUSED";
    if (/timeout|ETIMEDOUT|AbortError/i.test(msg)) code = "TIMEOUT";
    if (/certificate|SSL|TLS/i.test(msg)) code = "SSL_ERROR";

    return sendError(reply, 502, code, msg, {
      target: parsed.href,
      ms: Date.now() - started,
      hint:
        code === "DNS_FAILED"
          ? "No se resolvió el dominio destino"
          : code === "TIMEOUT"
          ? "El destino tardó demasiado"
          : "El server no pudo descargar la URL",
    });
  }
});
/* =================== END PRISM BACKEND =================== */

fastify.register(fastifyStatic, {
  root: publicPath,
  decorateReply: true,
});

fastify.register(fastifyStatic, {
  root: scramjetPath,
  prefix: "/scram/",
  decorateReply: false,
});

fastify.register(fastifyStatic, {
  root: libcurlPath,
  prefix: "/libcurl/",
  decorateReply: false,
});

fastify.register(fastifyStatic, {
  root: baremuxPath,
  prefix: "/baremux/",
  decorateReply: false,
});

fastify.setNotFoundHandler((req, reply) => {
  if (req.url && req.url.startsWith("/api/")) {
    return sendError(reply, 404, "API_NOT_FOUND", "Ruta API no existe", {
      path: req.url,
    });
  }
  return reply.code(404).type("text/html").sendFile("404.html");
});

fastify.server.on("listening", () => {
  const address = fastify.server.address();
  console.log("Listening on:");
  console.log(`\thttp://localhost:${address.port}`);
  console.log(`\thttp://\( {hostname()}: \){address.port}`);
  console.log(`\tAPI health: /api/health`);
  console.log(`\tAPI proxy:  /api/proxy?url=https://example.com`);
});

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

function shutdown() {
  console.log("SIGTERM signal received: closing HTTP server");
  fastify.close();
  process.exit(0);
}

let port = parseInt(process.env.PORT || "");
if (isNaN(port)) port = 8080;

fastify.listen({
  port: port,
  host: "0.0.0.0",
});
