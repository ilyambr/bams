const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");

const sourceList =
  "C:/Users/Administrator/Downloads/twitch clips.txt";

const outPath =
  path.join(root, "data", "clips.json");

const clientId =
  "kimne78kx3ncx6brgo4mv6wki5h1ko";


const R2_URL =
  "https://pub-2338fa951f8543d9a8e7c06bf364710f.r2.dev";


function slugFromUrl(url) {
  return String(url)
    .trim()
    .split("/clip/")[1]
    ?.split(/[?#]/)[0];
}



function cleanText(value) {

  if (!value)
    return "";

  return String(value)
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .trim();

}



function findPart(index) {

  const part =
    Math.floor(index / 1000) + 1;

  return `part-${String(part).padStart(2, "0")}`;

}



function bestQuality(list) {

  return [...(list || [])]
    .filter(x => x.sourceURL)
    .sort(
      (a, b) =>
        Number(b.quality || 0) -
        Number(a.quality || 0)
    )[0];

}



async function fetchClip(slug) {

  const query = `
query($slug: ID!){
 clip(slug:$slug){

  slug
  title
  viewCount
  createdAt
  durationSeconds

  broadcaster{
    displayName
  }

  curator{
    displayName
  }

  videoQualities{
    quality
    sourceURL
  }

 }
}
`;


  const res =
    await fetch(
      "https://gql.twitch.tv/gql",
      {
        method: "POST",

        headers: {
          "Client-ID": clientId,
          "Content-Type": "application/json"
        },

        body: JSON.stringify({
          query,
          variables: {
            slug
          }
        })
      }
    );


  const json =
    await res.json();


  if (
    !res.ok ||
    json.errors ||
    !json.data?.clip
  ) {

    throw new Error(
      JSON.stringify(json.errors || json)
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



  const clips = [];
  const failures = [];



  for (
    let i = 0;
    i < urls.length;
    i++
  ) {


    const url =
      urls[i];


    const slug =
      slugFromUrl(url);



    if (!slug)
      continue;



    try {


      const twitch =
        await fetchClip(slug);



      const quality =
        bestQuality(
          twitch.videoQualities
        );



      const part =
        findPart(i);



      const file =
        `${slug}.mp4`;



      clips.push({

        id: slug,


        title:
          cleanText(
            twitch.title
          ),


        url,


        // PLAYER USES THIS
        // VIDEO COMES FROM R2
        localVideo:
          `${R2_URL}/${part}/${file}`,


        quality:
          quality?.quality || null,


        views:
          twitch.viewCount || 0,


        clipper:
          cleanText(
            twitch.curator?.displayName
          ),


        broadcaster:
          cleanText(
            twitch.broadcaster?.displayName
          ),


        createdAt:
          twitch.createdAt,


        duration:
          twitch.durationSeconds || null

      });



      process.stdout.write(
        `\r${i + 1}/${urls.length}`
      );



      await new Promise(
        r => setTimeout(r, 100)
      );


    }
    catch (err) {


      failures.push({

        slug,

        error:
          err.message

      });


      console.log(
        "\nFAILED",
        slug,
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

    "utf8"
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