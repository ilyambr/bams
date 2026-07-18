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


const R2_BUCKET = process.env.R2_BUCKET;


const r2 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials:{
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
  }
});


const mime = {
  ".html":"text/html; charset=utf-8",
  ".css":"text/css; charset=utf-8",
  ".js":"application/javascript; charset=utf-8",
  ".json":"application/json; charset=utf-8",
  ".png":"image/png",
  ".jpg":"image/jpeg",
  ".jpeg":"image/jpeg",
  ".svg":"image/svg+xml",
  ".mp4":"video/mp4",
  ".webm":"video/webm"
};


const TWITCH_CLIENT =
"kimne78kx3ncx6brgo4mv6wki5h1ko";



function send(
  res,
  status,
  body,
  type="text/plain; charset=utf-8"
){

  res.writeHead(status,{
    "Content-Type":type,
    "Cache-Control":"no-store"
  });

  res.end(body);

}




function sendFile(res,file){

  const ext =
    path.extname(file).toLowerCase();


  res.writeHead(200,{
    "Content-Type":
      mime[ext] ||
      "application/octet-stream",

    "Cache-Control":
      "public,max-age=3600"
  });


  fs.createReadStream(file)
    .pipe(res);

}





async function twitchClip(slug){

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
variables:{slug}
})

});


const json =
await response.json();


if(
!response.ok ||
json.errors ||
!json.data?.clip
){

throw Error(
JSON.stringify(json.errors || json)
);

}


const clip =
json.data.clip;


const video =
[...(clip.videoQualities || [])]
.sort(
(a,b)=>
Number(b.quality || 0) -
Number(a.quality || 0)
)[0];


return {

id:clip.slug,

title:clip.title,

videoUrl:
video?.sourceURL,

views:
clip.viewCount,

clipper:
clip.curator?.displayName ||
"unknown",

broadcaster:
clip.broadcaster?.displayName ||
"bams",

createdAt:
clip.createdAt,

duration:
clip.durationSeconds

};

}








async function streamVideo(req,res,file){

const key =
`clips/${file}`;


try{


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


if(match[2]){
end =
Number(match[2]);
}

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


}else{


res.writeHead(
200,
headers
);


}



if(req.method !== "HEAD"){

object.Body.pipe(res);

}else{

res.end();

}



}
catch(err){

console.error(
"R2 VIDEO ERROR",
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





//
// redirect missing slash
//

if(pathname === "/bams/clips"){

res.writeHead(301,{
Location:"/bams/clips/"
});

return res.end();

}


if (pathname.includes("/api/youtube-proxy")) {
  const targetUrl = url.searchParams.get("url");
  if (!targetUrl) {
    return send(res, 400, "Missing url parameter");
  }

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "*");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  try {
    let body;
    if (req.method === "POST") {
      const buffers = [];
      for await (const chunk of req) {
        buffers.push(chunk);
      }
      body = Buffer.concat(buffers);
    }

    const initHeaders = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Referer": "https://www.youtube.com"
    };

    const headersToForward = [
      "content-type",
      "x-youtube-client-name",
      "x-youtube-client-version",
      "x-goog-visitor-id"
    ];
    for (const h of headersToForward) {
      if (req.headers[h]) {
        initHeaders[h] = req.headers[h];
      }
    }

    const response = await fetch(targetUrl, {
      method: req.method,
      headers: initHeaders,
      body: body
    });

    const responseHeaders = {};
    const headersToCopy = ["content-type", "content-encoding", "cache-control"];
    for (const h of headersToCopy) {
      const val = response.headers.get(h);
      if (val) {
        responseHeaders[h] = val;
      }
    }
    responseHeaders["Access-Control-Allow-Origin"] = "*";

    res.writeHead(response.status, responseHeaders);
    const responseBody = await response.arrayBuffer();
    return res.end(Buffer.from(responseBody));
  } catch (err) {
    return send(res, 500, "Proxy error: " + err.message);
  }
}







//
// Twitch source API
//

if(
pathname.includes("/api/source/")
){

const slug =
pathname.split("/api/source/")[1];


try{


return send(
res,
200,
JSON.stringify(
await twitchClip(slug)
),
"application/json; charset=utf-8"
);



}catch(err){


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







//
// R2 videos
//

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








//
// STATIC FILES
//

let clean = pathname;


// remove app prefix

if(
clean.startsWith("/bams/clips")
){

clean =
clean.slice(
"/bams/clips".length
);

}


// remove /

clean =
clean.replace(/^\/+/,"");



if(!clean){

clean="index.html";

}




const file =
path.resolve(
root,
clean
);



console.log(
"REQUEST:",
pathname,
"=>",
file
);



if(
!file.startsWith(
path.resolve(root)
)
){

return send(
res,
403,
"forbidden"
);

}



if(
!fs.existsSync(file)
){

return send(
res,
404,
"not found"
);

}



if(
fs.statSync(file).isDirectory()
){

return send(
res,
404,
"directory"
);

}



sendFile(
res,
file
);



})
.listen(
port,
()=>{

console.log(
`clip player running at http://localhost:${port}`
);

});