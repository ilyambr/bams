const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const dataPath = path.join(root, "data", "clips.json");
const videoRoot = path.join(root, "videos");
const batchSize = 99;

function mustStayInside(parent, child) {
  const relative = path.relative(parent, child);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`refusing path outside ${parent}: ${child}`);
  }
}

const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
const clips = data.clips || [];
const rootReal = fs.realpathSync(videoRoot);

clips.forEach((clip, index) => {
  if (!clip.localVideo) throw new Error(`missing localVideo for ${clip.id}`);

  const oldName = path.basename(clip.localVideo);
  const folderName = `batch-${String(Math.floor(index / batchSize) + 1).padStart(2, "0")}`;
  const folder = path.join(videoRoot, folderName);
  const destination = path.join(folder, oldName);

  fs.mkdirSync(folder, { recursive: true });
  mustStayInside(rootReal, fs.realpathSync(folder));

  const current = path.join(videoRoot, oldName);
  if (fs.existsSync(current) && path.resolve(current) !== path.resolve(destination)) {
    fs.renameSync(current, destination);
  } else if (!fs.existsSync(destination)) {
    throw new Error(`missing video file for ${clip.id}: ${oldName}`);
  }

  clip.localVideo = `/videos/${folderName}/${oldName}`;
});

data.localVideosSplitAt = new Date().toISOString();
fs.writeFileSync(dataPath, `${JSON.stringify(data, null, 2)}\n`);

console.log(`split ${clips.length} videos into ${Math.ceil(clips.length / batchSize)} folders`);
