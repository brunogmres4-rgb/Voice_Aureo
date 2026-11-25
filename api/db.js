// Puente seguro entre la página y Neon. Variables: DATABASE_URL, APP_TOKEN
const{post}=require("./_neon.js");
module.exports=async(req,res)=>{
  res.setHeader("Access-Control-Allow-Origin","*");res.setHeader("Access-Control-Allow-Headers","content-type,x-app-token");res.setHeader("Access-Control-Allow-Methods","POST,OPTIONS");
  if(req.method==="OPTIONS")return res.status(204).end();
  if(!process.env.APP_TOKEN||req.headers["x-app-token"]!==process.env.APP_TOKEN)return res.status(401).json({message:"Token de acceso no válido"});
  try{const b=typeof req.body==="string"?JSON.parse(req.body):req.body;res.status(200).json(await post(b))}catch(e){res.status(500).json({message:e.message})}};
