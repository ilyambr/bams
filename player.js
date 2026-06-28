const video = document.querySelector("#clipVideo");
const title = document.querySelector("#clipTitle");
const meta = document.querySelector("#clipMeta");
const statusEl = document.querySelector("#status");
const brandBug = document.querySelector("#brandBug");

const BASE = "/bams/clips/";

const params = new URLSearchParams(location.search);

const showStatus = params.has("debug");
const muted = params.get("muted") === "1";
const fit = params.get("fit");
const startDelay = Number(params.get("startDelay") || 3);

let clips = [];
let queue = [];
let index = 0;
let current = null;
let timer = null;
let needsAudio = false;


if (fit === "contain") {
    video.style.objectFit = "contain";
}

video.muted = muted;



function api(path) {
    return BASE + path.replace(/^\/+/, "");
}



function status(msg) {
    if (showStatus) {
        statusEl.textContent = msg;
    }
}



function shuffle(arr) {
    return [...arr].sort(() => Math.random() - 0.5);
}



function views(v) {
    return `${Number(v || 0).toLocaleString()} Views`;
}



function date(v) {
    if (!v) return "";

    return new Date(v).toLocaleDateString(
        "en-US",
        {
            month:"short",
            day:"numeric",
            year:"numeric"
        }
    );
}



async function playVideo() {

    try {

        video.muted = muted;

        await video.play();

    } catch {

        if (!muted) {

            video.muted = true;

            await video.play();

            needsAudio = true;

            status("click for audio");

        }

    }

}



function intro() {

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



function next() {

    if (!queue.length || index >= queue.length) {

        queue = shuffle(clips);

        index = 0;

    }


    current = queue[index++];

    loadClip(current);

}



function showInfo(clip) {

    title.textContent =
        clip.title || "";


    meta.textContent =
        `${views(clip.views)} • Clipped by ${clip.clipper || "unknown"} • ${date(clip.createdAt)}`;

}



async function loadClip(clip) {

    clearTimeout(timer);

    showInfo(clip);


    try {

        let src;


        if (clip.localVideo) {


            /*
             * IMPORTANT:
             *
             * JSON:
             * /videos/file.mp4
             *
             * becomes:
             * /bams/clips/videos/file.mp4
             */

            src = api(clip.localVideo);


        } else {


            const r = await fetch(
                api(
                    `api/source/${encodeURIComponent(clip.id)}`
                )
            );


            if (!r.ok) {

                throw new Error(
                    `source ${r.status}`
                );

            }


            const data = await r.json();

            src = data.videoUrl;

        }


        console.log(
            "VIDEO:",
            src
        );


        video.pause();

        video.src = src;

        video.load();


        await playVideo();


        const duration =
            Number(
                clip.duration || 0
            );


        if (duration) {

            timer = setTimeout(
                next,
                (duration + 1) * 1000
            );

        }


    } catch(err) {


        console.error(err);

        status(
            err.message
        );


        setTimeout(
            next,
            1000
        );

    }

}



video.onended = next;


video.onerror = () => {

    console.error(
        video.error
    );

    status(
        "video failed"
    );

    setTimeout(
        next,
        1000
    );

};



document.addEventListener(
    "pointerdown",
    () => {

        if (!needsAudio)
            return;


        video.muted = false;


        video.play()
            .then(() => {

                needsAudio = false;

            });

    }
);



async function init() {


    const r = await fetch(
        api(
            "data/clips.json?v=" + Date.now()
        )
    );


    const data = await r.json();


    clips =
        data.clips || [];


    if (!clips.length) {

        throw new Error(
            "no clips loaded"
        );

    }


    queue = shuffle(clips);


    if (startDelay) {

        status(
            `starting in ${startDelay}s`
        );


        await new Promise(
            r => setTimeout(
                r,
                startDelay * 1000
            )
        );

    }


    intro();

    next();

}



init()
.catch(err => {

    console.error(err);

    title.textContent =
        "no clips loaded";

    meta.textContent =
        err.message;

});