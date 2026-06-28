const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");

const sourceList =
  "C:/Users/Administrator/Downloads/twitch clips.txt";

const reviewClips =
  path.join(
    root,
    "..",
    "clip-review",
    "data",
    "clips.json"
  );

const outPath =
  path.join(
    root,
    "data",
    "clips.json"
  );


const clientId =
  "kimne78kx3ncx6brgo4mv6wki5h1ko";



function slugFromUrl(url){

  return String(url)
    .trim()
    .split("/clip/")[1]
    ?.split(/[?#]/)[0];

}




function cleanText(value){

  if(!value)
    return "";


  let text =
    String(value);


  // remove broken emoji encoding
  text =
    text
    .replace(/ð.{0,2}/g,"")
    .replace(/Ã.{0,2}/g,"")
    .replace(/â.{0,3}/g,"")
    .replace(/≡ƒ.{0,3}/g,"")
    .replace(/Γ.{0,3}/g,"");


  // remove unsupported characters
  text =
    text.replace(/[^\x20-\x7E]/g,"");


  return text
    .replace(/\s+/g," ")
    .trim()
    .normalize("NFC");

}




function bestQuality(list){

  return [...(list || [])]
    .filter(
      x => x.sourceURL
    )
    .sort(
      (a,b)=>
        Number(b.quality || 0)
        -
        Number(a.quality || 0)
    )[0];

}




async function fetchClip(slug){

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
    frameRate
    sourceURL
  }

 }
}
`;



const res =
await fetch(
  "https://gql.twitch.tv/gql",
  {
    method:"POST",

    headers:{
      "Client-ID":clientId,
      "Content-Type":
        "application/json"
    },

    body:JSON.stringify({
      query,
      variables:{
        slug
      }
    })
  }
);



const json =
await res.json();



if(
  !res.ok ||
  json.errors ||
  !json.data?.clip
){

 throw new Error(
   `${slug}: ${JSON.stringify(json.errors || json)}`
 );

}


return json.data.clip;

}





async function main(){


const urls =
fs.readFileSync(
  sourceList,
  "utf8"
)
.split(/\r?\n/)
.map(x=>x.trim())
.filter(Boolean);



let oldClips=[];



if(
  fs.existsSync(reviewClips)
){

try{

oldClips =
JSON.parse(
  fs.readFileSync(
    reviewClips,
    "utf8"
  )
);


}catch{

oldClips=[];

}

}



const oldMap =
new Map(
 oldClips.map(
  clip=>[
    clip.id,
    clip
  ]
 )
);



const clips=[];
const failures=[];



for(
 let i=0;
 i<urls.length;
 i++
){


const url =
urls[i];


const slug =
slugFromUrl(url);



if(!slug)
 continue;



try{


const twitch =
await fetchClip(slug);



const old =
oldMap.get(slug) || {};



const quality =
bestQuality(
 twitch.videoQualities
);



if(!quality)
 throw new Error(
  "no twitch quality"
 );




clips.push({

id:slug,


title:
cleanText(
 twitch.title ||
 old.title ||
 slug
),



url,



// IMPORTANT
// THIS POINTS TO R2
localVideo:
`videos/${slug}.mp4`,



quality:
quality.quality,



views:
twitch.viewCount ??
old.view_count ??
0,



clipper:
cleanText(
 twitch.curator?.displayName ||
 old.creator_name ||
 "unknown"
),



broadcaster:
cleanText(
 twitch.broadcaster?.displayName ||
 old.broadcaster_name ||
 "bams"
),



createdAt:
twitch.createdAt ||
old.created_at ||
null,



duration:
twitch.durationSeconds ||
old.duration ||
null


});



process.stdout.write(
`\r${i+1}/${urls.length}`
);



await new Promise(
 r=>setTimeout(r,100)
);



}
catch(err){


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

"utf8"

);



console.log(
`\nSaved ${clips.length} clips`
);


}




main()
.catch(err=>{

console.error(err);

process.exit(1);

});