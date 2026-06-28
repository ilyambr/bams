const http = require("http");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const port = Number(process.env.PORT || 4567);
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
    body: JSON.stringify({ query, variables: { slug } })
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
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(body);
}

function sendFile(req, res, file) {
  const type = mime[path.extname(file)] || "application/octet-stream";
  const stat = fs.statSync(file);

  if (type.startsWith("video/")) {
    const streamFile = (status, headers, options = {}) => {
      res.writeHead(status, headers);
      if (req.method === "HEAD") {
        res.end();
        return;
      }
      const stream = fs.createReadStream(file, options);
      stream.on("error", error => {
        if (!res.headersSent) {
          send(res, 500, error.message);
        } else {
          res.destroy(error);
        }
      });
      stream.pipe(res);
    };

    const range = req.headers.range;
    if (range) {
      const match = range.match(/bytes=(\d*)-(\d*)/);
      if (!match) {
        res.writeHead(416, { "Content-Range": `bytes */${stat.size}` });
        res.end();
        return;
      }

      const start = match[1] ? Number(match[1]) : 0;
      const end = match[2] ? Number(match[2]) : stat.size - 1;
      if (start >= stat.size || end >= stat.size || start > end) {
        res.writeHead(416, { "Content-Range": `bytes */${stat.size}` });
        res.end();
        return;
      }

      streamFile(206, {
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-store",
        "Content-Length": end - start + 1,
        "Content-Range": `bytes ${start}-${end}/${stat.size}`,
        "Content-Type": type
      }, { start, end });
      return;
    }

    streamFile(200, {
      "Accept-Ranges": "bytes",
      "Cache-Control": "no-store",
      "Content-Length": stat.size,
      "Content-Type": type
    });
    return;
  }

  send(res, 200, fs.readFileSync(file), type);
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname.startsWith("/api/source/")) {
    const slug = decodeURIComponent(url.pathname.split("/").pop() || "");
    try {
      send(res, 200, JSON.stringify(await twitchClip(slug)), "application/json; charset=utf-8");
    } catch (error) {
      send(res, 502, JSON.stringify({ error: error.message }), "application/json; charset=utf-8");
    }
    return;
  }

  const clean = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname).replace(/^\/+/, "");
  const file = path.resolve(root, clean);
  const inRoot = file === root || file.startsWith(`${root}${path.sep}`);
  if (!inRoot || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    send(res, 404, "not found");
    return;
  }
  sendFile(req, res, file);
}).listen(port, () => {
  console.log(`clip player running at http://localhost:${port}`);
});
