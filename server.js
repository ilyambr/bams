const http = require("http");
const fs = require("fs");
const path = require("path");

const {
  S3Client,
  GetObjectCommand,
  HeadObjectCommand
} = require("@aws-sdk/client-s3");


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
  ".html":"text/html; charset=utf-8",
  ".css":"text/css; charset=utf-8",
  ".js":"application/javascript; charset=utf-8",
  ".json":"application/json; charset=utf-8",
  ".mp4":"video/mp4",
  ".webm":"video/webm",
  ".png":"image/png",
  ".jpg":"image/jpeg",
  ".svg":"image/svg+xml"
};



const TWITCH_CLIENT =
"kimne78kx3ncx6brgo4mv6wki5h1ko";





function send(res,status,body,type="text/plain; charset=utf-8") {

  res.writeHead(status,{
    "Content-Type":type,
    "Cache-Control":"no-store"
  });

  res.end(body);

}






function sendFile(res,file){

  const ext =
    path.extname(file)
      .toLowerCase();


  res.writeHead(200,{
    "Content-Type":
      mime[ext] ||
      "application/octet-stream"
  });


  fs.createReadStream(file)
    .pipe(res);

}







async function twitchClip(slug){

  const query = `
query($slug: ID!) {
 clip(slug:$slug){
  slug
  title
  viewCount
  createdAt
  durationSeconds

  broadcaster {
    displayName
  }

  curator {
    displayName
  }

  videoQualities {
    quality
    sourceURL
  }
 }
}
`;


  const response =
    await fetch(
      "https://gql.twitch.tv/gql",
      {
        method:"POST",
        headers:{
          "Client-ID":TWITCH_CLIENT,
          "Content-Type":"application/json"
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
    await response.json();


  if(!response.ok || json.errors)
    throw Error(
      JSON.stringify(json.errors || json)
    );


  const clip =
    json.data.clip;


  const quality =
    [...clip.videoQualities]
      .sort(
        (a,b)=>
          Number(b.quality)-Number(a.quality)
      )[0];


  return {
    id:clip.slug,
    title:clip.title,
    videoUrl:quality.sourceURL,
    views:clip.viewCount,
    clipper:
      clip.curator?.displayName ||
      "unknown",
    broadcaster:
      clip.broadcaster?.displayName ||
      "bams",
    createdAt:clip.createdAt,
    duration:clip.durationSeconds
  };

}









async function streamVideo(req,res,file){

  const key =
    `clips/${file}`;


  try {


    const head =
      await r2.send(
        new HeadObjectCommand({
          Bucket:R2_BUCKET,
          Key:key
        })
      );


    const size =
      Number(head.ContentLength);



    let start = 0;
    let end = size - 1;


    const range =
      req.headers.range;



    if(range){

      const match =
        range.match(
          /bytes=(\d+)-(\d*)/
        );


      if(match){

        start =
          Number(match[1]);

        if(match[2])
          end =
            Number(match[2]);

      }


    }



    const object =
      await r2.send(
        new GetObjectCommand({
          Bucket:R2_BUCKET,
          Key:key,
          Range:
            `bytes=${start}-${end}`
        })
      );



    const headers = {

      "Content-Type":
        "video/mp4",

      "Accept-Ranges":
        "bytes",

      "Content-Length":
        end-start+1,

      "Cache-Control":
        "public,max-age=3600"

    };



    if(range){

      headers["Content-Range"] =
        `bytes ${start}-${end}/${size}`;


      res.writeHead(
        206,
        headers
      );

    }
    else{

      res.writeHead(
        200,
        headers
      );

    }



    if(req.method !== "HEAD")
      object.Body.pipe(res);
    else
      res.end();



  }
  catch(err){

    console.error(
      "VIDEO ERROR",
      err
    );

    send(
      res,
      404,
      "video missing"
    );

  }

}









http.createServer(async(req,res)=>{


  const url =
    new URL(
      req.url,
      `http://${req.headers.host}`
    );


  let pathname =
    decodeURIComponent(
      url.pathname
    );





  /*
    FIX:
    /bams/clips
    -> /bams/clips/
  */


  if(
    pathname === "/bams/clips"
  ){

    res.writeHead(
      301,
      {
        Location:
        "/bams/clips/"
      }
    );

    return res.end();

  }








  /*
    Twitch fallback
  */


  if(
    pathname.startsWith(
      "/bams/clips/api/source/"
    )
  ){

    const slug =
      pathname.split("/").pop();


    try{

      return send(
        res,
        200,
        JSON.stringify(
          await twitchClip(slug)
        ),
        "application/json; charset=utf-8"
      );


    }
    catch(err){

      return send(
        res,
        502,
        JSON.stringify({
          error:err.message
        }),
        "application/json; charset=utf-8"
      );

    }

  }








  /*
    VIDEO ROUTES

    supports:

    /videos/file.mp4

    /bams/clips/videos/file.mp4

  */


  if(
    pathname.includes("/videos/")
  ){

    const file =
      pathname.split("/videos/")[1];


    return streamVideo(
      req,
      res,
      file
    );

  }









  /*
    STATIC FILES
  */


  let clean =
    pathname
      .replace(/^\/bams\/clips\/?/,"");


  if(!clean)
    clean="index.html";



  const file =
    path.join(
      root,
      clean
    );



  if(
    !file.startsWith(root)
  )
    return send(
      res,
      403,
      "forbidden"
    );



  if(
    !fs.existsSync(file)
  )
    return send(
      res,
      404,
      "not found"
    );



  if(
    fs.statSync(file).isDirectory()
  )
    return send(
      res,
      404,
      "directory"
    );



  sendFile(
    res,
    file
  );



})
.listen(
  port,
  ()=>{
    console.log(
      `running on ${port}`
    );
  }
);