const video = document.querySelector("#clipVideo");
const title = document.querySelector("#clipTitle");
const meta = document.querySelector("#clipMeta");
const statusEl = document.querySelector("#status");
const brandBug = document.querySelector("#brandBug");

const BASE = "/bams/clips/";

const params = new URLSearchParams(location.search);

const debug = params.has("debug");
const fit = params.get("fit");

let clips = [];
let queue = [];
let index = 0;
let current = null;
let timer = null;

// OBS autoplay setup
video.autoplay = true;
video.playsInline = true;
video.controls = false;
video.muted = false;

if (fit === "contain") {
    video.style.objectFit = "contain";
}

function api(path) {
    return BASE + path.replace(/^\/+/, "");
}

function log(msg) {
    if (debug) {
        statusEl.textContent = msg;
    }

    console.log(msg);
}

function shuffle(arr) {
    const copy = [...arr];

    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }

    return copy;
}

function weightedShuffle(arr) {
    const copy = [...arr];
    const weighted = [];

    // Create weighted array where higher view count = more chances
    for (const clip of copy) {
        const views = Number(clip.views || 0);
        // Clips under 100 views get 1 chance, over 100 get a slight boost
        const weight = views < 100 ? 1 : 1 + Math.log(views / 100) * 0.15;
        
        // Add clip multiple times based on weight
        const copies = Math.max(1, Math.round(weight));
        for (let i = 0; i < copies; i++) {
            weighted.push(clip);
        }
    }

    // Standard shuffle on weighted array
    for (let i = weighted.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [weighted[i], weighted[j]] = [weighted[j], weighted[i]];
    }

    // Remove duplicates while preserving order
    const seen = new Set();
    return weighted.filter(clip => {
        if (seen.has(clip.id)) return false;
        seen.add(clip.id);
        return true;
    });
}

function formatViews(v) {
    return `${Number(v || 0).toLocaleString()} Views`;
}

function formatDate(v) {
    if (!v) return "";

    return new Date(v).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric"
    });
}

function showInfo(clip) {
    title.textContent = clip.title || "";

    meta.textContent =
        `${formatViews(clip.views)} • Clipped by ${clip.clipper || "unknown"} • ${formatDate(clip.createdAt)}`;
}

function brandIntro() {
    if (!brandBug) return;

    brandBug.classList.remove("intro", "ready");

    void brandBug.offsetWidth;

    brandBug.classList.add("intro");

    setTimeout(() => {
        brandBug.classList.remove("intro");
        brandBug.classList.add("ready");
    }, 1300);
}

async function startPlayback() {
    try {
        video.muted = false;

        await video.play();

        log("playing with audio");
    } catch (err) {
        console.warn("Autoplay blocked", err);

        video.muted = true;

        await video.play();

        log("playing muted - browser blocked audio");
    }
}

function nextClip() {
    clearTimeout(timer);

    if (!queue.length || index >= queue.length) {
        queue = weightedShuffle(clips);
        index = 0;
    }

    current = queue[index++];

    loadClip(current);
}

async function loadClip(clip) {
    showInfo(clip);

    try {
        let source;

        if (clip.videoUrl) {
            source = clip.videoUrl;
        } else if (clip.localVideo) {
            source = api(clip.localVideo);
        } else {
            const response = await fetch(
                api(`api/source/${encodeURIComponent(clip.id)}`)
            );

            if (!response.ok) {
                throw new Error(`source ${response.status}`);
            }

            const data = await response.json();

            source = data.videoUrl;
        }

        log("VIDEO: " + source);

        video.pause();
        video.removeAttribute("src");

        video.src = source;
        video.load();

        await startPlayback();

        const duration = Number(clip.duration || 0);

        if (duration) {
            timer = setTimeout(nextClip, (duration + 1) * 1000);
        }
    } catch (err) {
        console.error(err);

        log("ERROR: " + err.message);

        setTimeout(nextClip, 1000);
    }
}

video.addEventListener("ended", nextClip);

video.addEventListener("error", () => {
    console.error(video.error);

    log("VIDEO ERROR");

    setTimeout(nextClip, 1000);
});

async function init() {
    const response = await fetch(
        api("data/clips.json?v=" + Date.now())
    );

    const data = await response.json();

    clips = data.clips || [];

    if (!clips.length) {
        throw new Error("no clips loaded");
    }

    queue = weightedShuffle(clips);

    brandIntro();

    nextClip();
}

init().catch(err => {
    console.error(err);

    title.textContent = "no clips loaded";
    meta.textContent = err.message;

    log(err.message);
});
