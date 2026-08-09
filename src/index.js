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
          res.setHeader(
            "Access-Control-Allow-Methods",
            "GET,POST,OPTIONS,HEAD"
          );
          res.setHeader(
            "Access-Control-Allow-Headers",
            "Content-Type, Cookie, X-Prism-Cookie, X-Requested-With, Accept, Accept-Language, Authorization"
          );
          res.setHeader(
            "Access-Control-Expose-Headers",
            "x-final-url,x-proxy-status,x-proxy-ms,content-type,set-cookie,x-set-cookie"
          );
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

/** Recoge todas las cabeceras Set-Cookie (Node/fetch a veces solo da una). */
function collectSetCookies(headers) {
  const out = [];
  if (typeof headers.getSetCookie === "function") {
    try {
      const list = headers.getSetCookie();
      if (Array.isArray(list)) out.push(...list.filter(Boolean));
    } catch (_) {}
  }
  if (!out.length) {
    const single = headers.get("set-cookie");
    if (single) out.push(single);
  }
  // raw Headers iteration (algunos runtimes)
  if (!out.length && headers.raw && typeof headers.raw === "function") {
    try {
      const raw = headers.raw();
      if (raw && raw["set-cookie"]) {
        const v = raw["set-cookie"];
        if (Array.isArray(v)) out.push(...v);
        else if (v) out.push(v);
      }
    } catch (_) {}
  }
  return out;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS,HEAD",
  "Access-Control-Allow-Headers":
    "Content-Type, Cookie, X-Prism-Cookie, X-Requested-With, Accept, Accept-Language, Authorization",
  "Access-Control-Expose-Headers":
    "x-final-url,x-proxy-status,x-proxy-ms,content-type,set-cookie,x-set-cookie",
};

fastify.options("/api/proxy", async (req, reply) => {
  return reply.headers(CORS_HEADERS).code(204).send();
});

fastify.get("/api/health", async (req, reply) => {
  return reply.header("Access-Control-Allow-Origin", "*").send({
    ok: true,
    service: "hoshi-backend",
    proxy: "/api/proxy?url=",
    cookies: true,
    features: ["cookies", "set-cookie-forward", "x-prism-cookie", "roblox-ready"],
    time: new Date().toISOString(),
  });
});

/**
 * Proxy con soporte de cookies para Prism OS / Roblox / otras apps.
 *
 * Uso:
 *   GET  /api/proxy?url=https://www.roblox.com
 *   Headers opcionales del cliente:
 *     Cookie: ...                    (cookies del dominio)
 *     X-Prism-Cookie: name=value; …  (alternativa, útil si el navegador bloquea Cookie en CORS)
 *
 * Respuesta:
 *   - Body = contenido del sitio
 *   - X-Final-Url, X-Proxy-Status, X-Proxy-Ms
 *   - X-Set-Cookie: cookie1|||cookie2|||…  (todas las Set-Cookie unidas, fácil de parsear en el browser)
 *   - set-cookie también se reenvía cuando el runtime lo permite
 */
async function handleProxy(req, reply) {
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

  // Cookies que envía el cliente (Prism Browser cookie jar)
  const clientCookie =
    (req.headers["x-prism-cookie"] || req.headers["cookie"] || "").toString().trim();

  const method = (req.method || "GET").toUpperCase();
  const started = Date.now();

  try {
    const fetchHeaders = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9,es;q=0.8",
      "Accept-Encoding": "identity",
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "none",
      "Upgrade-Insecure-Requests": "1",
    };

    if (clientCookie) {
      fetchHeaders["Cookie"] = clientCookie;
    }

    // Referer / Origin útiles para Roblox y sitios que lo comprueban
    try {
      fetchHeaders["Referer"] = parsed.origin + "/";
      fetchHeaders["Origin"] = parsed.origin;
    } catch (_) {}

    const fetchOpts = {
      method: method === "HEAD" ? "GET" : method,
      redirect: "follow",
      headers: fetchHeaders,
    };

    // POST opcional (forms, login) — body en texto
    if (method === "POST" && req.body != null) {
      const bodyStr =
        typeof req.body === "string"
          ? req.body
          : typeof req.body === "object"
            ? new URLSearchParams(req.body).toString()
            : String(req.body);
      fetchOpts.body = bodyStr;
      if (!fetchHeaders["Content-Type"]) {
        fetchHeaders["Content-Type"] = "application/x-www-form-urlencoded";
      }
    }

    const res = await fetch(parsed.href, fetchOpts);

    const contentType =
      res.headers.get("content-type") || "application/octet-stream";
    const buf = Buffer.from(await res.arrayBuffer());
    const ms = Date.now() - started;

    const setCookies = collectSetCookies(res.headers);

    // Cabeceras de respuesta al cliente Prism
    const replyHeaders = {
      ...CORS_HEADERS,
      "X-Final-Url": res.url || parsed.href,
      "X-Proxy-Status": String(res.status),
      "X-Proxy-Ms": String(ms),
      "Content-Type": contentType,
      "Cache-Control": "no-store",
    };

    // Todas las cookies en una sola cabecera fácil de leer (||| separador)
    if (setCookies.length) {
      replyHeaders["X-Set-Cookie"] = setCookies.join("|||");
      try {
        replyHeaders["Set-Cookie"] = setCookies[0];
      } catch (_) {}
    }

    return reply
      .headers(replyHeaders)
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
}

fastify.get("/api/proxy", handleProxy);
fastify.post("/api/proxy", handleProxy);
fastify.head("/api/proxy", handleProxy);

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
  console.log(`\thttp://${hostname()}:${address.port}`);
  console.log(`\tAPI health: /api/health`);
  console.log(`\tAPI proxy:  /api/proxy?url=https://example.com`);
  console.log(`\tCookies:    X-Prism-Cookie / Cookie + X-Set-Cookie`);
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
