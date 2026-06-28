const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const dataPath = path.join(root, "data", "clips.json");
const videoDir = path.join(root, "videos");
const limitArg = process.argv.find(arg => arg.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.split("=")[1]) : 0;

function safeName(value) {
  return String(value).replace(/[^a-z0-9._-]/gi, "_");
}

function findExisting(id) {
  if (!fs.existsSync(videoDir)) return null;
  const prefix = `${safeName(id)}.`;
  const file = fs.readdirSync(videoDir).find(name => name.startsWith(prefix) && /\.(mp4|webm|mkv|mov)$/i.test(name));
  return file ? `/videos/${file}` : null;
}

function download(clip) {
  fs.mkdirSync(videoDir, { recursive: true });
  const output = path.join(videoDir, `${safeName(clip.id)}.%(ext)s`);
  const result = spawnSync(
    "python",
    [
      "-m",
      "yt_dlp",
      "--no-playlist",
      "--no-part",
      "--no-progress",
      "--restrict-filenames",
      "-f",
      "best[ext=mp4]/best",
      "-o",
      output,
      clip.url
    ],
    { stdio: "inherit" }
  );
  if (result.status !== 0) {
    throw new Error(`yt-dlp failed for ${clip.id}`);
  }
  return findExisting(clip.id);
}

const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
const clips = data.clips || [];
let downloaded = 0;
let checked = 0;

for (const clip of clips) {
  if (limit && checked >= limit) break;
  checked += 1;

  const existing = findExisting(clip.id);
  if (existing) {
    clip.localVideo = existing;
    console.log(`skip ${checked}/${clips.length}: ${clip.id}`);
    continue;
  }

  console.log(`download ${checked}/${clips.length}: ${clip.id}`);
  const localVideo = download(clip);
  if (!localVideo) throw new Error(`download finished but no file found for ${clip.id}`);
  clip.localVideo = localVideo;
  downloaded += 1;
}

data.localVideosUpdatedAt = new Date().toISOString();
fs.writeFileSync(dataPath, `${JSON.stringify(data, null, 2)}\n`);

console.log(`done. checked=${checked} downloaded=${downloaded} local=${clips.filter(clip => clip.localVideo).length}`);
