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
        if (req.url && req.url.startsWith("/api/")) {
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS,HEAD");
          res.setHeader("Access-Control-Allow-Headers", "*");
          res.setHeader("Access-Control-Expose-Headers", "*");
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
    .header("Access-Control-Allow-Methods", "GET,OPTIONS,HEAD")
    .header("Access-Control-Allow-Headers", "*")
    .code(204)
    .send();
});

fastify.get("/api/health", async (req, reply) => {
  return reply.header("Access-Control-Allow-Origin", "*").send({
    ok: true,
    service: "hoshi-backend",
    proxy: "/api/proxy?url=",
    ytAudio: "/api/yt-audio?id=VIDEO_ID",
    ytStream: "/api/yt-stream?id=VIDEO_ID",
    time: new Date().toISOString(),
  });
});

fastify.get("/api/proxy", async (req, reply) => {
  const target = String(req.query.url || "").trim();

  if (!target) {
    return sendError(reply, 400, "MISSING_URL", "Falta ?url= en la peticion");
  }

  let parsed;
  try {
    parsed = new URL(target);
  } catch {
    return sendError(reply, 400, "INVALID_URL", "URL invalida", { target });
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
          ? "No se resolvio el dominio destino"
          : code === "TIMEOUT"
            ? "El destino tardo demasiado"
            : "El server no pudo descargar la URL",
    });
  }
});

/* ===================== YOUTUBE AUDIO (SIMPMUSIC) ===================== */
const YT_PIPED = [
  "https://api.piped.private.coffee",
  "https://pipedapi.leptons.xyz",
  "https://pipedapi.reallyaweso.me",
  "https://pipedapi.drgns.space",
  "https://pipedapi.orangenet.cc",
  "https://pipedapi.ducks.party",
];

async function fetchJsonServer(url, ms) {
  if (!ms) ms = 9000;
  const ctrl = new AbortController();
  const t = setTimeout(function () {
    ctrl.abort();
  }, ms);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept: "application/json",
      },
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

function pickFromPiped(data) {
  var streams = data.audioStreams || [];
  if (streams.length) {
    var sorted = streams.slice().sort(function (a, b) {
      return (b.bitrate || 0) - (a.bitrate || 0);
    });
    var best = null;
    for (var i = 0; i < sorted.length; i++) {
      var m = sorted[i].mimeType || "";
      if (/mp4|m4a/i.test(m)) {
        best = sorted[i];
        break;
      }
    }
    if (!best) best = sorted[0];
    if (best && best.url) {
      return {
        url: best.url,
        mime: best.mimeType || "audio/mp4",
        quality: best.quality || best.bitrate,
        kind: "audio",
      };
    }
  }

  var videos = data.videoStreams || [];
  var withAudio = videos.filter(function (v) {
    return v && v.url && v.videoOnly === false;
  });
  if (withAudio.length) {
    withAudio.sort(function (a, b) {
      var qa = parseInt(String(a.quality || "999"), 10) || 999;
      var qb = parseInt(String(b.quality || "999"), 10) || 999;
      return qa - qb;
    });
    var v = withAudio[0];
    return {
      url: v.url,
      mime: v.mimeType || "video/mp4",
      quality: v.quality || "mixed",
      kind: "video+audio",
    };
  }

  return null;
}

async function resolveYoutubeAudio(videoId) {
  var i, base, data, picked;

  for (i = 0; i < YT_PIPED.length; i++) {
    base = YT_PIPED[i];
    try {
      data = await fetchJsonServer(base + "/streams/" + videoId);
      picked = pickFromPiped(data);
      if (picked && picked.url) {
        return {
          url: picked.url,
          mime: picked.mime,
          quality: picked.quality,
          kind: picked.kind,
          source: "piped",
          instance: base,
          title: data.title || null,
        };
      }
    } catch (e) {}
  }

  return null;
}

fastify.options("/api/yt-audio", async function (req, reply) {
  return reply
    .header("Access-Control-Allow-Origin", "*")
    .header("Access-Control-Allow-Methods", "GET,OPTIONS,HEAD")
    .header("Access-Control-Allow-Headers", "*")
    .code(204)
    .send();
});

fastify.get("/api/yt-audio", async function (req, reply) {
  var id = String(req.query.id || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "");
  if (!id || id.length < 6) {
    return sendError(reply, 400, "MISSING_ID", "Falta ?id=VIDEO_ID");
  }

  var started = Date.now();
  try {
    var audio = await resolveYoutubeAudio(id);
    if (!audio) {
      return sendError(reply, 404, "NO_AUDIO", "No se encontro stream de audio", {
        id: id,
        ms: Date.now() - started,
      });
    }
    return reply.header("Access-Control-Allow-Origin", "*").send({
      ok: true,
      id: id,
      url: audio.url,
      // URL lista para el player: pasa por este backend (CORS ok)
      streamUrl: "https://backend-1-k2na.onrender.com/api/yt-stream?id=" + id,
      mime: audio.mime,
      quality: audio.quality,
      kind: audio.kind,
      source: audio.source,
      instance: audio.instance,
      title: audio.title,
      ms: Date.now() - started,
    });
  } catch (err) {
    return sendError(reply, 502, "YT_AUDIO_FAIL", String(err.message || err), {
      id: id,
      ms: Date.now() - started,
    });
  }
});

// Stream proxy: el navegador reproduce desde TU dominio (sin CORS roto)
fastify.options("/api/yt-stream", async function (req, reply) {
  return reply
    .header("Access-Control-Allow-Origin", "*")
    .header("Access-Control-Allow-Methods", "GET,OPTIONS,HEAD")
    .header("Access-Control-Allow-Headers", "*")
    .header("Access-Control-Expose-Headers", "Content-Type,Content-Length,Accept-Ranges,Content-Range")
    .code(204)
    .send();
});

fastify.get("/api/yt-stream", async function (req, reply) {
  var id = String(req.query.id || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "");
  if (!id || id.length < 6) {
    return sendError(reply, 400, "MISSING_ID", "Falta ?id=VIDEO_ID");
  }

  try {
    var audio = await resolveYoutubeAudio(id);
    if (!audio || !audio.url) {
      return sendError(reply, 404, "NO_AUDIO", "No se encontro stream");
    }

    var headers = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      Accept: "*/*",
    };
    // Support range requests for seeking
    if (req.headers.range) {
      headers.Range = req.headers.range;
    }

    var upstream = await fetch(audio.url, {
      headers: headers,
      redirect: "follow",
    });

    if (!upstream.ok && upstream.status !== 206) {
      return sendError(reply, 502, "UPSTREAM_FAIL", "Stream upstream " + upstream.status);
    }

    var contentType = upstream.headers.get("content-type") || audio.mime || "video/mp4";
    var buf = Buffer.from(await upstream.arrayBuffer());

    var replyHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Expose-Headers":
        "Content-Type,Content-Length,Accept-Ranges,Content-Range",
      "Content-Type": contentType,
      "Cache-Control": "no-store",
      "Accept-Ranges": "bytes",
    };

    var contentRange = upstream.headers.get("content-range");
    if (contentRange) replyHeaders["Content-Range"] = contentRange;
    var contentLength = upstream.headers.get("content-length");
    if (contentLength) replyHeaders["Content-Length"] = contentLength;
    else replyHeaders["Content-Length"] = String(buf.length);

    return reply
      .headers(replyHeaders)
      .code(upstream.status === 206 ? 206 : 200)
      .send(buf);
  } catch (err) {
    return sendError(reply, 502, "STREAM_FAIL", String(err.message || err));
  }
});
/* =================== END YOUTUBE AUDIO =================== */

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
  console.log("\thttp://localhost:" + address.port);
  console.log("\thttp://" + hostname() + ":" + address.port);
  console.log("\tAPI health: /api/health");
  console.log("\tAPI proxy:  /api/proxy?url=");
  console.log("\tAPI yt-audio: /api/yt-audio?id=");
  console.log("\tAPI yt-stream: /api/yt-stream?id=");
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

