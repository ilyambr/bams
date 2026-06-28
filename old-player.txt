const video = document.querySelector("#clipVideo");
const title = document.querySelector("#clipTitle");
const meta = document.querySelector("#clipMeta");
const statusEl = document.querySelector("#status");
const brandBug = document.querySelector("#brandBug");


const BASE = "/bams/clips/";


const params = new URLSearchParams(location.search);

const debug = params.has("debug");
const fit = params.get("fit");
const startDelay = Number(params.get("startDelay") || 3);



let clips = [];
let queue = [];
let index = 0;
let current = null;
let timer = null;
let loading = false;
let failedAttempts = 0;



video.autoplay = true;
video.playsInline = true;
video.controls = false;
video.preload = "auto";



// OBS prefers this
video.muted = false;



if (fit === "contain") {
    video.style.objectFit = "contain";
}



function api(path) {

    return BASE + String(path)
        .replace(/^\/+/, "");

}



function log(msg) {

    console.log(msg);

    if (debug) {
        statusEl.textContent = msg;
    }

}



function sleep(ms) {

    return new Promise(
        r => setTimeout(r, ms)
    );

}



function shuffle(array) {

    return [...array].sort(
        () => Math.random() - .5
    );

}



function formatViews(value) {

    return `${Number(value || 0).toLocaleString()} Views`;

}



function formatDate(value) {

    if (!value)
        return "";

    return new Date(value)
        .toLocaleDateString(
            "en-US",
            {
                month:"short",
                day:"numeric",
                year:"numeric"
            }
        );

}



function showInfo(clip) {

    title.textContent =
        clip.title || "";

    meta.textContent =
        `${formatViews(clip.views)} • Clipped by ${clip.clipper || "unknown"} • ${formatDate(clip.createdAt)}`;

}



function intro() {

    if (!brandBug)
        return;


    brandBug.classList.remove(
        "intro",
        "ready"
    );


    void brandBug.offsetWidth;


    brandBug.classList.add(
        "intro"
    );


    setTimeout(() => {

        brandBug.classList.remove(
            "intro"
        );

        brandBug.classList.add(
            "ready"
        );

    },1300);

}





function nextClip() {

    clearTimeout(timer);


    if (
        !queue.length ||
        index >= queue.length
    ) {

        queue = shuffle(clips);
        index = 0;

    }


    current =
        queue[index++];


    playClip(current);

}





async function getVideoSource(clip) {


    /*
       Local videos:
       /videos/file.mp4

       becomes:

       /bams/clips/videos/file.mp4
    */


    if (clip.localVideo) {

        return api(
            clip.localVideo
        );

    }



    /*
       Only fallback to Twitch if
       there is no local copy
    */


    const response =
        await fetch(
            api(
                `api/source/${encodeURIComponent(clip.id)}`
            )
        );


    if (!response.ok) {

        throw Error(
            `source ${response.status}`
        );

    }


    const data =
        await response.json();


    return data.videoUrl;

}





async function playClip(clip) {


    if (loading)
        return;


    loading = true;


    clearTimeout(timer);


    showInfo(clip);



    try {


        const source =
            await getVideoSource(
                clip
            );


        log(
            "Loading: " + source
        );



        video.pause();


        video.removeAttribute(
            "src"
        );


        video.src =
            source;


        video.load();



        await video.play();



        log(
            "Playing"
        );



        failedAttempts = 0;



        timer =
            setTimeout(
                nextClip,
                (
                    Number(
                        clip.duration || 20
                    )
                    + 1
                ) * 1000
            );



    }
    catch(err) {


        console.error(
            err
        );


        failedAttempts++;


        log(
            "Failed: " + err.message
        );



        /*
          prevent request explosion
        */

        await sleep(
            Math.min(
                failedAttempts * 2000,
                10000
            )
        );


        nextClip();

    }


    finally {

        loading = false;

    }

}





video.addEventListener(
    "ended",
    nextClip
);



video.addEventListener(
    "error",
    () => {


        console.error(
            video.error
        );


        log(
            "video element error"
        );


        clearTimeout(timer);



        setTimeout(
            nextClip,
            3000
        );

    }
);







async function init() {


    const response =
        await fetch(
            api(
                "data/clips.json?v=" + Date.now()
            )
        );


    if (!response.ok)
        throw Error(
            "clips.json failed"
        );



    const data =
        await response.json();



    clips =
        data.clips || [];



    if (!clips.length)
        throw Error(
            "no clips"
        );



    queue =
        shuffle(
            clips
        );



    if (startDelay) {

        log(
            `starting in ${startDelay}s`
        );


        await sleep(
            startDelay * 1000
        );

    }



    intro();


    nextClip();

}





init()
.catch(err => {

    console.error(
        err
    );


    title.textContent =
        "player error";


    meta.textContent =
        err.message;


    log(
        err.message
    );

});