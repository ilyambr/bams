const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const sourceList = "C:/Users/Administrator/Downloads/twitch clips.txt";
const reviewClips = path.join(root, "..", "clip-review", "data", "clips.json");
const outPath = path.join(root, "data", "clips.json");
const clientId = "kimne78kx3ncx6brgo4mv6wki5h1ko";

function slugFromUrl(url) {
  return String(url).trim().split("/clip/")[1]?.split(/[?#]/)[0];
}

function bestQuality(qualities) {
  return [...(qualities || [])]
    .filter(item => item.sourceURL)
    .sort((a, b) => Number(b.quality || 0) - Number(a.quality || 0))[0] || null;
}

async function fetchClip(slug) {
  const query = `query($slug: ID!){ clip(slug:$slug){ slug title viewCount createdAt durationSeconds broadcaster{displayName login} curator{displayName login} videoQualities{quality frameRate sourceURL} } }`;
  const res = await fetch("https://gql.twitch.tv/gql", {
    method: "POST",
    headers: {
      "Client-ID": clientId,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ query, variables: { slug } })
  });
  const json = await res.json();
  if (!res.ok || json.errors) throw new Error(`${slug}: ${JSON.stringify(json.errors || json)}`);
  return json.data.clip;
}

async function main() {
  const urls = fs.readFileSync(sourceList, "utf8").split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const metadata = fs.existsSync(reviewClips)
    ? new Map(JSON.parse(fs.readFileSync(reviewClips, "utf8")).map(clip => [clip.id, clip]))
    : new Map();
  const clips = [];
  const failures = [];

  for (let index = 0; index < urls.length; index += 1) {
    const url = urls[index];
    const slug = slugFromUrl(url);
    if (!slug) continue;

    try {
      const gql = await fetchClip(slug);
      const fallback = metadata.get(slug) || {};
      const quality = bestQuality(gql.videoQualities);
      if (!quality) throw new Error(`${slug}: no sourceURL`);
      clips.push({
        id: slug,
        title: gql.title || fallback.title || slug,
        url,
        videoUrl: quality.sourceURL,
        quality: quality.quality,
        views: gql.viewCount ?? fallback.view_count ?? 0,
        clipper: gql.curator?.displayName || fallback.creator_name || "unknown",
        broadcaster: gql.broadcaster?.displayName || fallback.broadcaster_name || "bams",
        createdAt: gql.createdAt || fallback.created_at,
        duration: gql.durationSeconds || fallback.duration || null
      });
      process.stdout.write(`\r${index + 1}/${urls.length} clips`);
      await new Promise(resolve => setTimeout(resolve, 80));
    } catch (error) {
      failures.push({ slug, error: error.message });
      console.error(`\n${error.message}`);
    }
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), clips, failures }, null, 2) + "\n");
  console.log(`\nwrote ${clips.length} clips to ${outPath}`);
  if (failures.length) console.log(`${failures.length} failures`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
