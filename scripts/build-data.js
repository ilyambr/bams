const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");

const sourceList = "C:/Users/Administrator/Downloads/twitch clips.txt";
const reviewClips = path.join(root, "..", "clip-review", "data", "clips.json");
const outPath = path.join(root, "data", "clips.json");

const clientId = "kimne78kx3ncx6brgo4mv6wki5h1ko";


function slugFromUrl(url) {
  return String(url)
    .trim()
    .split("/clip/")[1]
    ?.split(/[?#]/)[0];
}


// Removes broken UTF-8 / emoji garbage
function cleanText(value) {

  if (!value) return "";

  let text = String(value);


  // Fix common bad encoding leftovers
  text = text
    .replace(/ðŸ./g, "")
    .replace(/â..?/g, "")
    .replace(/Ã./g, "")
    .replace(/≡ƒ./g, "")
    .replace(/Γ./g, "")
    .replace(/[╬ƒ£Å¿]/g, "");


  // Remove replacement chars
  text = text.replace(/\uFFFD/g, "");


  // Remove emojis and unsupported symbols
  text = text.replace(/[^\x20-\x7E]/g, "");


  // Normalize spaces
  text = text
    .replace(/\s+/g, " ")
    .trim();


  return text.normalize("NFC");
}



function bestQuality(list) {

  return [...(list || [])]
    .filter(x => x.sourceURL)
    .sort(
      (a,b) =>
        Number(b.quality || 0) -
        Number(a.quality || 0)
    )[0];

}



async function fetchClip(slug) {

  const query = `
query($slug: ID!) {
 clip(slug:$slug) {

  slug
  title
  viewCount
  createdAt
  durationSeconds

  broadcaster {
    displayName
    login
  }

  curator {
    displayName
    login
  }

  videoQualities {
    quality
    frameRate
    sourceURL
  }

 }
}
`;


  const res = await fetch(
    "https://gql.twitch.tv/gql",
    {
      method:"POST",

      headers:{
        "Client-ID":clientId,
        "Content-Type":"application/json; charset=utf-8"
      },

      body:JSON.stringify({
        query,
        variables:{slug}
      })
    }
  );


  const json = await res.json();


  if (!res.ok || json.errors) {

    throw new Error(
      `${slug}: ${JSON.stringify(json.errors || json)}`
    );

  }


  return json.data.clip;

}





async function main() {


  const urls =
    fs.readFileSync(
      sourceList,
      "utf8"
    )
    .split(/\r?\n/)
    .map(x => x.trim())
    .filter(Boolean);



  let oldClips = [];


  if (fs.existsSync(reviewClips)) {

    try {

      oldClips =
        JSON.parse(
          fs.readFileSync(
            reviewClips,
            "utf8"
          )
        );

    } catch {

      oldClips = [];

    }

  }



  const metadata =
    new Map(
      oldClips.map(
        clip => [
          clip.id,
          clip
        ]
      )
    );



  const clips = [];
  const failures = [];



  for (
    let i = 0;
    i < urls.length;
    i++
  ) {


    const url = urls[i];

    const slug = slugFromUrl(url);


    if (!slug)
      continue;



    try {


      const gql =
        await fetchClip(slug);



      const old =
        metadata.get(slug) || {};



      const quality =
        bestQuality(
          gql.videoQualities
        );



      if (!quality)
        throw new Error(
          "no video source"
        );



      clips.push({

        id: slug,


        title:
          cleanText(
            gql.title ||
            old.title ||
            slug
          ),


        url,


        videoUrl:
          quality.sourceURL,


        quality:
          quality.quality,


        views:
          gql.viewCount ??
          old.view_count ??
          0,


        clipper:
          cleanText(
            gql.curator?.displayName ||
            old.creator_name ||
            "unknown"
          ),


        broadcaster:
          cleanText(
            gql.broadcaster?.displayName ||
            old.broadcaster_name ||
            "bams"
          ),


        createdAt:
          gql.createdAt ||
          old.created_at ||
          null,


        duration:
          gql.durationSeconds ||
          old.duration ||
          null

      });



      process.stdout.write(
        `\r${i + 1}/${urls.length}`
      );


      await new Promise(
        r => setTimeout(r,100)
      );



    } catch(err) {


      failures.push({

        slug,

        error:
          err.message

      });


      console.log(
        "\nFAILED:",
        err.message
      );

    }

  }



  fs.mkdirSync(
    path.dirname(outPath),
    {
      recursive:true
    }
  );



  fs.writeFileSync(
    outPath,

    JSON.stringify(
      {
        generatedAt:
          new Date().toISOString(),

        clips,

        failures

      },
      null,
      2
    ),

    {
      encoding:"utf8"
    }
  );



  console.log(
    `\nSaved ${clips.length} clips`
  );

}



main()
.catch(err => {

  console.error(err);

  process.exit(1);

});