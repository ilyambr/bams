const http = require("http");
const fs = require("fs");
const path = require("path");
const { S3Client, GetObjectCommand, HeadObjectCommand } = require("@aws-sdk/client-s3");

const root = __dirname;
const port = Number(process.env.PORT || 4567);

const r2 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
  }
});

const R2_BUCKET = process.env.R2_BUCKET;

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml"
};

const twitchClientId = "kimne78kx3ncx6brgo4mv6wki5h1ko";

async function twitchClip(slug) {
  const query = `query($slug: ID!){ clip(slug:$slug){ slug title viewCount createdAt durationSeconds broadcaster{displayName login} curator{displayName login} videoQualities{quality frameRate sourceURL} } }`;

  const response = await fetch("https://gql.twitch.tv/gql", {
    method: "POST",
    headers: {
      "Client-ID": twitchClientId,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      query,
      variables: { slug }
    })
  });

  const json = await response.json();

  if (!response.ok || json.errors || !json.data?.clip) {
    throw new Error(JSON.stringify(json.errors || json));
  }

  const clip = json.data.clip;

  const quality = [...(clip.videoQualities || [])]
    .filter(item => item.sourceURL)
    .sort((a, b) => Number(b.quality || 0) - Number(a.quality || 0))[0];

  if (!quality) throw new Error("no video source");

  return {
    id: clip.slug,
    title: clip.title,
    videoUrl: quality.sourceURL,
    quality: quality.quality,
    views: clip.viewCount,
    clipper: clip.curator?.displayName || "unknown",
    broadcaster: clip.broadcaster?.displayName || "bams",
    createdAt: clip.createdAt,
    duration: clip.durationSeconds || null
  };
}


function send(res, status, body, type = "text/plain; charset=utf-8") {
  res.writeHead(status, {
    "Content-Type": type,
    "Cache-Control": "no-store"
  });
  res.end(body);
}


// Stream video from Cloudflare R2
async function sendR2Video(req, res, filename) {
  const key = `clips/${filename}`;

  try {
    const head = await r2.send(
      new HeadObjectCommand({
        Bucket: R2_BUCKET,
        Key: key
      })
    );

    const size = Number(head.ContentLength);
    const range = req.headers.range;

    let start = 0;
    let end = size - 1;

    if (range) {
      const match = range.match(/bytes=(\d*)-(\d*)/);

      if (match) {
        if (match[1]) start = Number(match[1]);
        if (match[2]) end = Number(match[2]);
      }

      if (start >= size) {
        res.writeHead(416);
        return res.end();
      }
    }

    const object = await r2.send(
      new GetObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        Range: `bytes=${start}-${end}`
      })
    );

    const headers = {
      "Content-Type": "video/mp4",
      "Accept-Ranges": "bytes",
      "Content-Length": end - start + 1,
      "Cache-Control": "no-store"
    };

    if (range) {
      headers["Content-Range"] = `bytes ${start}-${end}/${size}`;
      res.writeHead(206, headers);
    } else {
      res.writeHead(200, headers);
    }

    if (req.method !== "HEAD") {
      object.Body.pipe(res);
    } else {
      res.end();
    }

  } catch (error) {
    console.error("R2 error:", error);
    send(res, 404, "video not found");
  }
}


function sendLocalFile(res, file) {
  const type = mime[path.extname(file)] || "application/octet-stream";

  send(
    res,
    200,
    fs.readFileSync(file),
    type
  );
}


http.createServer(async (req, res) => {

  const url = new URL(req.url, `http://${req.headers.host}`);


  // Twitch API
  if (url.pathname.startsWith("/api/source/")) {

    const slug = decodeURIComponent(
      url.pathname.split("/").pop() || ""
    );

    try {
      send(
        res,
        200,
        JSON.stringify(await twitchClip(slug)),
        "application/json; charset=utf-8"
      );

    } catch(error) {
      send(
        res,
        502,
        JSON.stringify({
          error: error.message
        }),
        "application/json; charset=utf-8"
      );
    }

    return;
  }


  // R2 video route
  if (url.pathname.startsWith("/videos/")) {

    const filename = decodeURIComponent(
      url.pathname.replace("/videos/", "")
    );

    return sendR2Video(req, res, filename);
  }


  // Website files
  const clean =
    url.pathname === "/"
      ? "index.html"
      : decodeURIComponent(url.pathname).replace(/^\/+/, "");


  const file = path.resolve(root, clean);

  const inRoot =
    file === root ||
    file.startsWith(`${root}${path.sep}`);


  if (
    !inRoot ||
    !fs.existsSync(file) ||
    fs.statSync(file).isDirectory()
  ) {
    return send(res,404,"not found");
  }


  sendLocalFile(res,file);


}).listen(port, () => {
  console.log(`clip player running at http://localhost:${port}`);
});