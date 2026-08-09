"use strict";

const form = document.getElementById("sj-form");
const address = document.getElementById("sj-address");
const searchEngine = document.getElementById("sj-search-engine");
const error = document.getElementById("sj-error");
const errorCode = document.getElementById("sj-error-code");
const homeView = document.getElementById("home-view");
const iframesContainer = document.getElementById("iframes-container");
const logEl = document.getElementById("term-log");

const pillApi = document.getElementById("pill-api");
const pillSw = document.getElementById("pill-sw");
const pillTransport = document.getElementById("pill-transport");

const SEARCH_ENGINES = {
  google: { name: "Google", url: "https://www.google.com/search?q=%s" },
  bing: { name: "Bing", url: "https://www.bing.com/search?q=%s" },
  ddg: { name: "DuckDuckGo", url: "https://duckduckgo.com/?q=%s" },
  brave: { name: "Brave", url: "https://search.brave.com/search?q=%s" },
  startpage: { name: "Startpage", url: "https://www.startpage.com/do/search?query=%s" },
  youtube: { name: "YouTube", url: "https://www.youtube.com/results?search_query=%s" },
  github: { name: "GitHub", url: "https://github.com/search?q=%s" },
  reddit: { name: "Reddit", url: "https://www.reddit.com/search/?q=%s" },
  wikipedia: { name: "Wikipedia", url: "https://en.wikipedia.org/wiki/Special:Search?search=%s" },
  searxng: { name: "SearXNG", url: "https://searx.be/search?q=%s" }
};

function initEngineSelect() {
  searchEngine.innerHTML = "";
  Object.keys(SEARCH_ENGINES).forEach((key) => {
    const opt = document.createElement("option");
    opt.value = SEARCH_ENGINES[key].url;
    opt.textContent = SEARCH_ENGINES[key].name;
    searchEngine.appendChild(opt);
  });
}
initEngineSelect();

/* ---------- terminal log ---------- */
function ts() {
  return new Date().toISOString().slice(11, 19);
}

function log(level, msg, detail) {
  const line = document.createElement("div");
  line.className = "log-" + (level || "info");
  let text = "[" + ts() + "] " + String(msg || "");
  if (detail) text += "\n  → " + String(detail);
  line.textContent = text;
  logEl.appendChild(line);
  logEl.scrollTop = logEl.scrollHeight;

  // also mirror to hidden fields for compatibility
  if (level === "err") {
    if (error) error.textContent = String(msg || "");
    if (errorCode) errorCode.textContent = String(detail || "");
  }
}

function setPill(el, text, state) {
  if (!el) return;
  el.textContent = text;
  el.classList.remove("ok", "err", "warn");
  if (state) el.classList.add(state);
}

document.getElementById("btn-clear").onclick = function () {
  logEl.textContent = "";
  log("info", "log cleared");
};

/* ---------- tabs (minimal, 1 active frame) ---------- */
let tabs = [];
let activeTabId = null;
let tabCounter = 0;

function createNewTab(url, title) {
  const tabId = "tab-" + tabCounter++;
  const tabObj = { id: tabId, title: title || "view", url: url || "", frame: null };
  tabs = [tabObj];
  activeTabId = tabId;
  return tabId;
}
createNewTab();

function goHome() {
  const tab = tabs.find((t) => t.id === activeTabId);
  if (!tab) return;
  tab.url = "";
  address.value = "";
  if (tab.frame) {
    try { tab.frame.frame.remove(); } catch (e) {}
    tab.frame = null;
  }
  iframesContainer.classList.remove("active");
  homeView.style.display = "block";
  log("info", "home");
}

window.goHome = goHome;

function go(url) {
  address.value = url;
  form.dispatchEvent(new Event("submit"));
}
window.go = go;

/* ---------- scramjet ---------- */
let scramjet = null;
let connection = null;

try {
  const { ScramjetController } = $scramjetLoadController();
  scramjet = new ScramjetController({
    files: {
      wasm: "/scram/scramjet.wasm.wasm",
      all: "/scram/scramjet.all.js",
      sync: "/scram/scramjet.sync.js"
    }
  });
  scramjet.init();
  connection = new BareMux.BareMuxConnection("/baremux/worker.js");
  log("ok", "Scramjet controller init");
} catch (err) {
  log("err", "Scramjet init failed", err && err.message ? err.message : err);
  setPill(pillTransport, "Transport: fail", "err");
}

/* ---------- health / proxy API ---------- */
async function checkHealth() {
  setPill(pillApi, "API: checking…", "warn");
  try {
    const res = await fetch("/api/health", { method: "GET" });
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch (e) {}
    if (!res.ok) {
      setPill(pillApi, "API: HTTP " + res.status, "err");
      log("err", "health failed", "HTTP " + res.status + " " + text.slice(0, 200));
      return false;
    }
    setPill(pillApi, "API: ok", "ok");
    log("ok", "health ok", data ? JSON.stringify(data) : text.slice(0, 120));
    return true;
  } catch (err) {
    setPill(pillApi, "API: down", "err");
    log("err", "health network error", err && err.message ? err.message : err);
    log("warn", "hint", "¿Subiste /api/health y /api/proxy al server? ¿Redeploy?");
    return false;
  }
}

async function proxyTest() {
  const target = (address.value || "https://example.com").trim();
  const url = "/api/proxy?url=" + encodeURIComponent(
    /^https?:\/\//i.test(target) ? target : "https://" + target
  );
  log("info", "proxy test…", url);
  try {
    const res = await fetch(url, { method: "GET" });
    const ctype = res.headers.get("content-type") || "";
    const finalUrl = res.headers.get("x-final-url") || "";
    const proxyStatus = res.headers.get("x-proxy-status") || String(res.status);
    const body = await res.text();

    if (ctype.indexOf("application/json") >= 0) {
      let j = null;
      try { j = JSON.parse(body); } catch (e) {}
      if (j && (j.error || j.ok === false)) {
        log("err", "proxy JSON error", (j.code || "") + " · " + (j.message || body.slice(0, 200)));
        if (j.hint) log("warn", "hint", j.hint);
        return;
      }
    }

    log(
      res.ok ? "ok" : "warn",
      "proxy response HTTP " + res.status + " (dest status " + proxyStatus + ")",
      (finalUrl ? finalUrl + " · " : "") + ctype + " · " + body.length + " bytes"
    );
    if (!res.ok) log("err", "proxy not ok", body.slice(0, 300));
  } catch (err) {
    log("err", "proxy test failed", err && err.message ? err.message : err);
  }
}

document.getElementById("btn-health").onclick = function () { checkHealth(); };
document.getElementById("btn-proxy-test").onclick = function () { proxyTest(); };

/* ---------- run (Scramjet navigate) ---------- */
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!address.value.trim()) {
    log("warn", "empty input");
    return;
  }

  if (!scramjet || !connection) {
    log("err", "engine missing", "Scramjet/BareMux no inicializó");
    return;
  }

  try {
    await registerSW();
    setPill(pillSw, "SW: ok", "ok");
    log("ok", "service worker ready");
  } catch (err) {
    setPill(pillSw, "SW: fail", "err");
    log("err", "Service Worker fail", err && err.message ? err.message : err);
    return;
  }

  let url;
  try {
    url = search(address.value, searchEngine.value);
  } catch (err) {
    log("err", "search() fail", err && err.message ? err.message : err);
    return;
  }

  const wispUrl =
    (location.protocol === "https:" ? "wss" : "ws") +
    "://" + location.host + "/wisp/";

  try {
    if ((await connection.getTransport()) !== "/libcurl/index.mjs") {
      await connection.setTransport("/libcurl/index.mjs", [{ websocket: wispUrl }]);
    }
    setPill(pillTransport, "Transport: ok", "ok");
    log("ok", "transport libcurl", wispUrl);
  } catch (err) {
    setPill(pillTransport, "Transport: fail", "err");
    log("err", "transport fail", (err && err.message ? err.message : err) + " | " + wispUrl);
    return;
  }

  const currentTab = tabs.find((t) => t.id === activeTabId) || tabs[0];
  currentTab.url = address.value;
  try {
    const urlObj = new URL(url.startsWith("http") ? url : "https://" + url);
    currentTab.title = urlObj.hostname.replace("www.", "");
  } catch (e) {
    currentTab.title = address.value;
  }

  try {
    if (!currentTab.frame) {
      const frame = scramjet.createFrame();
      frame.frame.className = "proxy-frame active";
      iframesContainer.appendChild(frame.frame);
      currentTab.frame = frame;
    }
    homeView.style.display = "none";
    iframesContainer.classList.add("active");
    currentTab.frame.go(url);
    log("ok", "navigating", url);
  } catch (err) {
    log("err", "frame.go fail", err && err.message ? err.message : err);
  }
});

/* deep link for Prism: /?go=URL */
(function prismDeepLink() {
  try {
    const params = new URLSearchParams(location.search);
    const target = params.get("go") || params.get("url");
    if (!target) return;
    log("info", "deep link", target);
    setTimeout(function () {
      address.value = target;
      form.dispatchEvent(new Event("submit"));
      try { history.replaceState(null, "", location.pathname); } catch (e) {}
    }, 600);
  } catch (e) {}
})();

/* boot checks (no splash) */
setPill(pillSw, "SW: …", "warn");
setPill(pillTransport, "Transport: …", "warn");
log("info", "Hoshi terminal ready (no boot screen)");
checkHealth();
