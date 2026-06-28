const video = document.querySelector("#clipVideo");
const title = document.querySelector("#clipTitle");
const meta = document.querySelector("#clipMeta");
const statusEl = document.querySelector("#status");
const brandBug = document.querySelector("#brandBug");

const BASE = window.location.pathname.endsWith("/")
  ? window.location.pathname
  : window.location.pathname.substring(
      0,
      window.location.pathname.lastIndexOf("/") + 1
    );

const api = (path) => `${BASE}${path.replace(/^\/+/, "")}`;

const params = new URLSearchParams(window.location.search);

const fit = params.get("fit");
const showStatus = params.has("debug");
const muted = params.get("muted") === "1";
const clipDuration = Number(params.get("duration") || 0);
const startDelay = Number(params.get("startDelay") ?? 3);

let clips = [];
let order = [];
let orderIndex = 0;
let current = null;
let fallbackTimer = null;
let needsAudioGesture = false;

if (fit === "contain") {
  video.style.objectFit = "contain";
}

video.muted = muted;
video.volume = Number(params.get("volume") || 1);


function shuffle(items) {
  const copy = [...items];

  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }

  return copy;
}


function formatViews(value) {
  return `${Number(value || 0).toLocaleString()} Views`;
}


function formatDate(value) {
  if (!value) return "";

  return new Date(value).toLocaleDateString(
    "en-US",
    {
      month: "short",
      day: "numeric",
      year: "numeric"
    }
  );
}


function setStatus(text) {
  statusEl.textContent = showStatus ? text : "";
}


function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}


async function startVideoPlayback() {
  const wantsAudio = !muted;

  video.muted = muted;

  try {
    await video.play();
    return;
  } catch {}

  if (!wantsAudio) return;

  try {
    video.muted = true;
    await video.play();

    needsAudioGesture = true;

    setStatus("click to enable audio");

  } catch(error) {

    setStatus(error.message);

  }
}


function startBrandIntro() {

  if (!brandBug) return;

  brandBug.classList.remove(
    "intro",
    "ready"
  );

  void brandBug.offsetWidth;

  brandBug.classList.add("intro");

  setTimeout(() => {

    brandBug.classList.remove("intro");
    brandBug.classList.add("ready");

  },1300);
}


function nextClip(){

  if(!order.length)
    order = shuffle(clips);


  if(orderIndex >= order.length){

    order = shuffle(clips);
    orderIndex = 0;

  }


  current = order[orderIndex++];

  playClip(current);

}



function playClip(clip){

  clearTimeout(fallbackTimer);


  title.textContent =
    clip.title || "";


  meta.textContent =
    `${formatViews(clip.views)} • Clipped by ${clip.clipper || "unknown"} • ${formatDate(clip.createdAt)}`;


  refreshAndPlay(clip);



  const seconds =
    clipDuration ||
    Number(clip.duration || 0);


  if(seconds > 0){

    fallbackTimer =
      setTimeout(
        nextClip,
        Math.max(4,seconds + .6) * 1000
      );

  }

}



async function refreshAndPlay(clip){

  try {

    let source =
      clip.localVideo ||
      clip.videoUrl;


    if(!clip.localVideo){

      const res =
        await fetch(
          api(
            `/api/source/${encodeURIComponent(clip.id)}?v=${Date.now()}`
          )
        );


      if(!res.ok)
        throw new Error(
          `source ${res.status}`
        );


      const fresh =
        await res.json();


      Object.assign(
        clip,
        fresh
      );


      source =
        clip.videoUrl;

    }


    video.src = source;

    video.load();

    await startVideoPlayback();


  } catch(error){

    setStatus(
      `video error: ${error.message}`
    );

    setTimeout(
      nextClip,
      1000
    );

  }

}



video.addEventListener(
  "ended",
  nextClip
);


video.addEventListener(
  "error",
  () => {

    setStatus(
      `video error ${current?.id || ""}`
    );

    setTimeout(
      nextClip,
      1000
    );

  }
);



document.addEventListener(
  "visibilitychange",
  () => {

    if(!document.hidden && video.paused)
      video.play().catch(()=>{});

  }
);



document.addEventListener(
  "pointerdown",
  ()=>{

    if(!needsAudioGesture || muted)
      return;


    video.muted=false;


    video.play()
      .then(()=>{

        needsAudioGesture=false;

      });

  }
);



async function init(){

  const res =
    await fetch(
      api(
        `data/clips.json?v=${Date.now()}`
      )
    );


  const data =
    await res.json();


  clips =
    data.clips || [];


  if(!clips.length)
    throw new Error(
      "no clips loaded"
    );


  order =
    shuffle(clips);


  setStatus(
    startDelay
      ? `starting in ${startDelay}s`
      : ""
  );


  if(startDelay)
    await sleep(
      startDelay * 1000
    );


  startBrandIntro();

  nextClip();

}



init()
.catch(error=>{

  title.textContent =
    "no clips loaded";

  meta.textContent =
    error.message;

  setStatus(
    error.message
  );

});