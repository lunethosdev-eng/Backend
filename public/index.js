"use strict";

const form = document.getElementById("sj-form");
const address = document.getElementById("sj-address");
const searchEngine = document.getElementById("sj-search-engine");
const error = document.getElementById("sj-error");
const errorCode = document.getElementById("sj-error-code");
const homeView = document.getElementById("home-view");
const iframesContainer = document.getElementById("iframes-container");
const tabsContainer = document.getElementById("tabs-container");

const SEARCH_ENGINES = {
    google: { name: "Google", url: "https://www.google.com/search?q=%s" },
    bing: { name: "Bing", url: "https://www.bing.com/search?q=%s" },
    yahoo: { name: "Yahoo", url: "https://search.yahoo.com/search?p=%s" },
    ddg: { name: "DuckDuckGo", url: "https://duckduckgo.com/?q=%s" },
    brave: { name: "Brave Search", url: "https://search.brave.com/search?q=%s" },
    qwant: { name: "Qwant", url: "https://www.qwant.com/?q=%s" },
    ecosia: { name: "Ecosia", url: "https://www.ecosia.org/search?q=%s" },
    startpage: { name: "Startpage", url: "https://www.startpage.com/do/search?query=%s" },
    baidu: { name: "Baidu", url: "https://www.baidu.com/s?wd=%s" },
    yandex: { name: "Yandex", url: "https://yandex.com/search/?text=%s" },
    youtube: { name: "YouTube", url: "https://www.youtube.com/results?search_query=%s" },
    github: { name: "GitHub Code", url: "https://github.com/search?q=%s&type=code" },
    stackoverflow: { name: "StackOverflow", url: "https://stackoverflow.com/search?q=%s" },
    mdn: { name: "MDN Web Docs", url: "https://developer.mozilla.org/en-US/search?q=%s" },
    wikipedia: { name: "Wikipedia", url: "https://en.wikipedia.org/wiki/Special:Search?search=%s" },
    scholar: { name: "Google Scholar", url: "https://scholar.google.com/scholar?q=%s" },
    wolfram: { name: "WolframAlpha", url: "https://www.wolframalpha.com/input?i=%s" },
    searxng: { name: "SearXNG", url: "https://searxng.site/search?q=%s" },
    reddit: { name: "Reddit", url: "https://www.reddit.com/search/?q=%s" },
    twitter: { name: "Twitter / X", url: "https://x.com/search?q=%s" },
    twitch: { name: "Twitch", url: "https://www.twitch.org/search?term=%s" },
    pinterest: { name: "Pinterest", url: "https://www.pinterest.com/search/pins/?q=%s" },
    perplexity: { name: "Perplexity IA", url: "https://www.perplexity.ai/?q=%s" },
    phind: { name: "Phind IA", url: "https://www.phind.com/search?q=%s" },
    archive: { name: "Internet Archive", url: "https://archive.org/search.php?query=%s" },
    urban: { name: "Urban Dictionary", url: "https://www.urbandictionary.com/define.php?term=%s" }
};

function initEngineSelect() {
    searchEngine.innerHTML = "";
    Object.keys(SEARCH_ENGINES).forEach(key => {
        const opt = document.createElement("option");
        opt.value = SEARCH_ENGINES[key].url;
        opt.textContent = SEARCH_ENGINES[key].name;
        opt.setAttribute("data-id", key);
        searchEngine.appendChild(opt);
    });
}
initEngineSelect();

searchEngine.addEventListener("change", () => {
    const selectedOption = searchEngine.options[searchEngine.selectedIndex];
    const themeId = selectedOption.getAttribute("data-id");
    document.body.setAttribute("data-theme", themeId);
});

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playClickSound() {
    const soundToggle = document.getElementById("sound-toggle");
    const soundEnabled = soundToggle && soundToggle.checked;
    if (!soundEnabled) return;
    if (audioCtx.state === "suspended") audioCtx.resume();

    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(800, audioCtx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(300, audioCtx.currentTime + 0.05);
    gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.05);
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    oscillator.start();
    oscillator.stop(audioCtx.currentTime + 0.05);
}

document.addEventListener("click", (e) => {
    if (e.target.closest(".clickable") || e.target.closest("button") || e.target.closest("a") || e.target.closest(".wall-card")) {
        playClickSound();
    }
});

const canvas = document.getElementById("starfield");
if (canvas) {
    const ctx = canvas.getContext("2d");
    let stars = [];
    let mouse = { x: -1000, y: -1000 };

    function initStars() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        const numStars = window.innerWidth < 768 ? 80 : 150;
        stars = Array.from({ length: numStars }, () => ({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            size: Math.random() * 1.5 + 0.5,
            vx: (Math.random() - 0.5) * 0.2,
            vy: (Math.random() - 0.5) * 0.2,
            glow: Math.random()
        }));
    }

    window.addEventListener("mousemove", e => { mouse.x = e.clientX; mouse.y = e.clientY; });
    window.addEventListener("touchmove", e => { mouse.x = e.touches[0].clientX; mouse.y = e.touches[0].clientY; });

    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        stars.forEach(s => {
            s.x += s.vx; s.y += s.vy;
            let dist = Math.hypot(s.x - mouse.x, s.y - mouse.y);
            if (dist < 120) {
                ctx.strokeStyle = `rgba(74, 144, 226, ${1 - dist / 120})`;
                ctx.lineWidth = 0.5;
                ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(mouse.x, mouse.y); ctx.stroke();
            }
            if (s.x < 0) s.x = canvas.width; if (s.x > canvas.width) s.x = 0;
            if (s.y < 0) s.y = canvas.height; if (s.y > canvas.height) s.y = 0;
            s.glow += 0.05;
            ctx.fillStyle = `rgba(255, 255, 255, ${0.5 + Math.sin(s.glow) * 0.5})`;
            ctx.beginPath(); ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2); ctx.fill();
        });
        requestAnimationFrame(animate);
    }
    window.addEventListener("resize", initStars);
    initStars();
    animate();
}

const phrases = [
    "Navigating the void...",
    "Igniting Scramjet Engine...",
    "Where curiosity meets the stars...",
    "Bypassing the local cluster..."
];
let currentPhraseIndex = 0;
let currentCharIndex = 0;
let isDeleting = false;
const typewriterText = document.getElementById("typewriter-text");

function typeEffect() {
    if (!typewriterText) return;
    const currentPhrase = phrases[currentPhraseIndex];
    if (isDeleting) {
        typewriterText.textContent = currentPhrase.substring(0, currentCharIndex - 1);
        currentCharIndex--;
    } else {
        typewriterText.textContent = currentPhrase.substring(0, currentCharIndex + 1);
        currentCharIndex++;
    }
    let typeSpeed = isDeleting ? 30 : 70;
    if (!isDeleting && currentCharIndex === currentPhrase.length) {
        typeSpeed = 2000;
        isDeleting = true;
    } else if (isDeleting && currentCharIndex === 0) {
        isDeleting = false;
        currentPhraseIndex = (currentPhraseIndex + 1) % phrases.length;
        typeSpeed = 500;
    }
    setTimeout(typeEffect, typeSpeed);
}
if (typewriterText) typeEffect();

let tabs = [];
let activeTabId = null;
let tabCounter = 0;

function createNewTab(url = "", title = "New Tab", groupColor = "") {
    const tabId = "tab-" + tabCounter++;
    const colors = ["#4a90e2", "#e24a4a", "#4ae26f", "#e2b94a", "#b94ae2"];
    const tabColor = groupColor || colors[tabs.length % colors.length];
    const tabObj = { id: tabId, title: title, url: url, frame: null, color: tabColor };
    tabs.push(tabObj);
    renderTabs();
    switchToTab(tabId);
    if (url === "") {
        address.value = "";
        address.focus();
    } else {
        address.value = url;
    }
    return tabId;
}

function renderTabs() {
    const tabsHtml = Array.from(tabsContainer.children).filter(el => !el.classList.contains("new-tab-btn"));
    tabsHtml.forEach(el => el.remove());

    tabs.forEach(tab => {
        const tabEl = document.createElement("div");
        tabEl.className = `tab ${tab.id === activeTabId ? "active liquid-glass bouncy" : ""}`;
        tabEl.style.borderTopColor = tab.id === activeTabId ? tab.color : "transparent";
        tabEl.onclick = (e) => {
            if (!e.target.classList.contains("tab-close")) switchToTab(tab.id);
        };

        const titleSpan = document.createElement("span");
        titleSpan.className = "tab-title";
        titleSpan.textContent = tab.title;

        const closeBtn = document.createElement("button");
        closeBtn.className = "tab-close clickable";
        closeBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';
        closeBtn.onclick = (e) => { e.stopPropagation(); closeTab(tab.id); };

        tabEl.appendChild(titleSpan);
        tabEl.appendChild(closeBtn);
        tabsContainer.insertBefore(tabEl, tabsContainer.lastElementChild);
    });
}

function switchToTab(tabId) {
    activeTabId = tabId;
    const tab = tabs.find(t => t.id === tabId);
    renderTabs();
    address.value = tab.url;

    document.querySelectorAll(".proxy-frame").forEach(f => f.classList.remove("active"));
    if (tab.frame) {
        homeView.style.display = "none";
        tab.frame.frame.classList.add("active");
        iframesContainer.style.pointerEvents = "auto";
    } else {
        homeView.style.display = "flex";
        iframesContainer.style.pointerEvents = "none";
    }
}

function closeTab(tabId) {
    const tabIndex = tabs.findIndex(t => t.id === tabId);
    const tab = tabs[tabIndex];
    if (tab.frame) tab.frame.frame.remove();
    tabs.splice(tabIndex, 1);

    if (tabs.length === 0) {
        createNewTab();
    } else if (activeTabId === tabId) {
        const nextIndex = Math.max(0, tabIndex - 1);
        switchToTab(tabs[nextIndex].id);
    } else {
        renderTabs();
    }
}

function goHome() {
    const tab = tabs.find(t => t.id === activeTabId);
    if (tab) {
        tab.url = "";
        address.value = "";
        tab.title = "Home";
        if (tab.frame) {
            tab.frame.frame.remove();
            tab.frame = null;
        }
        switchToTab(tab.id);
    }
}

function go(url) {
    address.value = url;
    form.dispatchEvent(new Event("submit"));
}

createNewTab();

const { ScramjetController } = $scramjetLoadController();
const scramjet = new ScramjetController({
    files: { wasm: "/scram/scramjet.wasm.wasm", all: "/scram/scramjet.all.js", sync: "/scram/scramjet.sync.js" },
});
scramjet.init();
const connection = new BareMux.BareMuxConnection("/baremux/worker.js");

setTimeout(() => {
    const bootloader = document.getElementById("bootloader");
    if (bootloader) {
        bootloader.style.opacity = "0";
        bootloader.style.pointerEvents = "none";
        setTimeout(() => bootloader.style.display = "none", 1000);
    }
}, 3000);

form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!address.value.trim()) return;

    try { await registerSW(); } catch (err) {
        error.textContent = "Engine Fail: " + err.message;
        return;
    }

    const url = search(address.value, searchEngine.value);
    let wispUrl = (location.protocol === "https:" ? "wss" : "ws") + "://" + location.host + "/wisp/";

    if ((await connection.getTransport()) !== "/libcurl/index.mjs") {
        await connection.setTransport("/libcurl/index.mjs", [{ websocket: wispUrl }]);
    }

    const currentTab = tabs.find(t => t.id === activeTabId);
    currentTab.url = address.value;

    try {
        const urlObj = new URL(url.startsWith("http") ? url : "https://" + url);
        currentTab.title = urlObj.hostname.replace("www.", "");
    } catch (e) {
        currentTab.title = address.value;
    }

    if (!currentTab.frame) {
        const frame = scramjet.createFrame();
        frame.frame.className = "proxy-frame active";
        iframesContainer.appendChild(frame.frame);
        currentTab.frame = frame;
    }

    homeView.style.display = "none";
    iframesContainer.style.pointerEvents = "auto";
    currentTab.frame.go(url);
    renderTabs();
});

/* ============================================================
   PRISM OS — deep link
   Ejemplo:
   https://hoshiooo-1jjj.onrender.com/?go=https://www.youtube.com/watch?v=VIDEO_ID
   ============================================================ */
(function prismDeepLink() {
    function readGo() {
        try {
            const params = new URLSearchParams(location.search);
            let v = params.get("go") || params.get("url") || params.get("q");
            if (v) return v;
            if (location.hash && location.hash.indexOf("go=") >= 0) {
                const h = new URLSearchParams(location.hash.replace(/^#/, ""));
                v = h.get("go") || h.get("url");
            }
            return v;
        } catch (e) {
            return null;
        }
    }

    async function run() {
        const target = readGo();
        if (!target) return;

        for (let i = 0; i < 40; i++) {
            try {
                if (typeof go === "function" && typeof registerSW === "function") {
                    await registerSW().catch(function () {});
                    go(target);
                    try { history.replaceState(null, "", location.pathname); } catch (e) {}
                    return;
                }
            } catch (e) {}
            await new Promise(function (r) { setTimeout(r, 250); });
        }
        try { go(target); } catch (e) {}
    }

    setTimeout(run, 1200);
    setTimeout(run, 3200);
})();

const WALLPAPERS = {
    "62516": { name: "GTA V Rain", type: "gif", url: "https://raw.githubusercontent.com/alexis2003martinezz-blip/komaos-wallpapers-code/main/Grand%20Theft%20Auto%20V%20Rain%20GIF.gif" },
    "78015": { name: "Manga", type: "gif", url: "https://raw.githubusercontent.com/alexis2003martinezz-blip/komaos-wallpapers-code/main/Manga%20Wallpaper%20GIF%20(6).gif" },
    "62872": { name: "Black Hole", type: "video", url: "https://raw.githubusercontent.com/alexis2003martinezz-blip/komaos-wallpapers-code/main/black-hole.3840x2160.mp4" },
    "47028": { name: "Hunt Showdown", type: "video", url: "https://raw.githubusercontent.com/alexis2003martinezz-blip/komaos-wallpapers-code/main/%E3%80%90Hunt-%20Showdown%E3%80%91Trait%20Icon%20Animation%E2%80%94%E2%80%94Hundred_Hands%23huntshowdow%20%23wallpaper%20%23steam%20%23animationart.mp4" },
    "57297": { name: "Minecraft Fox", type: "gif", url: "https://raw.githubusercontent.com/alexis2003martinezz-blip/komaos-wallpapers-code/main/Wallpaper%20GIF.gif" },
    "89013": { name: "Death Roots", type: "video", url: "https://raw.githubusercontent.com/alexis2003martinezz-blip/komaos-wallpapers-code/main/hunt-showdown-death-roots3840x21%20(1).mp4" },
    "98106": { name: "Hollow Knight", type: "gif", url: "https://raw.githubusercontent.com/alexis2003martinezz-blip/komaos-wallpapers-code/main/Wallpaper%20GIF%20(3).gif" },
    "67429": { name: "Arknights", type: "video", url: "https://raw.githubusercontent.com/alexis2003martinezz-blip/komaos-wallpapers-code/main/platinum-arknights.1920x1080.mp4" },
    "78000": { name: "Mikami", type: "video", url: "https://raw.githubusercontent.com/alexis2003martinezz-blip/komaos-wallpapers-code/main/mikami-death-note3840x2160.mp4" },
    "36148": { name: "Supra Edit", type: "video", url: "https://raw.githubusercontent.com/alexis2003martinezz-blip/komaos-wallpapers-code/main/ssstik.io_%40drvnx1_1774939471973.mp4" },
    "24317": { name: "Mazda RX-7", type: "video", url: "https://raw.githubusercontent.com/alexis2003martinezz-blip/komaos-wallpapers-code/main/ssstik.io_%40moren_228_1774939403411.mp4" },
    "09162": { name: "Super Cars", type: "video", url: "https://raw.githubusercontent.com/alexis2003martinezz-blip/komaos-wallpapers-code/main/ssstik.io_%40micrpt_1774939563415.mp4" },
    "64278": { name: "Sunset Pink", type: "image", url: "https://raw.githubusercontent.com/alexis2003martinezz-blip/Miku-station-images-/main/IMG_1092.webp" },
    "46288": { name: "Orange Sunset", type: "image", url: "https://raw.githubusercontent.com/alexis2003martinezz-blip/Miku-station-images-/main/IMG_1083.jpg" },
    "28000": { name: "Teto Dancing", type: "video", url: "https://raw.githubusercontent.com/alexis2003martinezz-blip/Miku-station-music-storage1/main/teto-dancing-wallpaper.mp4" },
    "98989": { name: "Miku Dancing", type: "video", url: "https://raw.githubusercontent.com/alexis2003martinezz-blip/Miku-station-music-storage1/main/miku-dancing-wallpaper.mp4" },
    "23234": { name: "Yuta Okkotsu 1", type: "video", url: "https://raw.githubusercontent.com/alexis2003martinezz-blip/Miku-station-music-storage1/main/yuta-okkotsu-calm-danger.3840x2160.mp4" },
    "45678": { name: "Yuta Okkotsu 2", type: "video", url: "https://raw.githubusercontent.com/alexis2003martinezz-blip/Miku-station-music-storage1/main/yuta-okkotsu-curse-spirit.1920x1080.mp4" },
    "87905": { name: "Miku Star Eyes", type: "video", url: "https://raw.githubusercontent.com/alexis2003martinezz-blip/Miku-station-music-storage1/main/hatsune-miku-star-eyes.1920x1080.mp4" },
    "67372": { name: "Gojo", type: "video", url: "https://raw.githubusercontent.com/alexis2003martinezz-blip/Miku-station-music-storage1/main/gojo-wallpaper.mov" },
    "35627": { name: "Kira", type: "video", url: "https://raw.githubusercontent.com/alexis2003martinezz-blip/Miku-station-music-storage1/main/kira-deathnote-edit-wallpaper.mov" }
};

const settingsModal = document.getElementById("settings-modal");
const dynamicBg = document.getElementById("dynamic-bg");

function toggleSettings() {
    if (settingsModal) settingsModal.classList.toggle("open");
}

function applyBackground(type, url) {
    if (!dynamicBg) return;
    dynamicBg.innerHTML = "";
    if (type === "video" || url.endsWith(".mp4") || url.endsWith(".mov")) {
        const vid = document.createElement("video");
        vid.src = url;
        vid.autoplay = true;
        vid.loop = true;
        vid.muted = true;
        dynamicBg.appendChild(vid);
    } else {
        dynamicBg.style.backgroundImage = `url('${url}')`;
    }
}

function setCustomBg() {
    const el = document.getElementById("custom-bg-url");
    const url = el && el.value;
    if (url) applyBackground("image", url);
}

const grid = document.getElementById("wallpaper-grid");
if (grid) {
    Object.values(WALLPAPERS).forEach(wp => {
        const card = document.createElement("div");
        card.className = "wall-card bouncy liquid-glass";
        card.onclick = () => applyBackground(wp.type, wp.url);

        if (wp.type === "video") {
            const v = document.createElement("video");
            v.src = wp.url;
            v.muted = true;
            v.loop = true;
            card.onmouseenter = () => v.play();
            card.onmouseleave = () => v.pause();
            card.appendChild(v);
        } else {
            const img = document.createElement("img");
            img.src = wp.url;
            card.appendChild(img);
        }

        const label = document.createElement("div");
        label.className = "label";
        label.textContent = wp.name;
        card.appendChild(label);
        grid.appendChild(card);
    });
}
