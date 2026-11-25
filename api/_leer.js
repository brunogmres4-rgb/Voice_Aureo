// Lectura de respuestas en Gmail. Variables: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN (el mismo token que usa gmail.js, con gmail.send + gmail.readonly)
const tok=async()=>{const{GOOGLE_CLIENT_ID:i,GOOGLE_CLIENT_SECRET:s,GOOGLE_REFRESH_TOKEN:r}=process.env;if(!i||!s||!r)return null;
  const x=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({client_id:i,client_secret:s,refresh_token:r,grant_type:"refresh_token"})});
  const j=await x.json().catch(()=>({}));if(!x.ok)throw new Error("Google: "+(j.error_description||j.error||x.status));return j.access_token};
exports.respuestas=async emails=>{const t=await tok();if(!t)return null;const H={Authorization:"Bearer "+t},G="https://gmail.googleapis.com/gmail/v1/users/me/messages";
  const l=await fetch(G+"?maxResults=30&q="+encodeURIComponent(`from:(${emails.join(" OR ")}) newer_than:14d`),{headers:H});
  if(l.status===403)throw new Error("El token de Gmail no tiene permiso de lectura (gmail.readonly) o la API de Gmail no está activada");
  if(!l.ok)throw new Error("Gmail respondió "+l.status);
  const out=[],hd=(j,n)=>((j.payload.headers||[]).find(h=>h.name.toLowerCase()===n)||{}).value||"";
  for(const m of (await l.json()).messages||[]){const r=await fetch(`${G}/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`,{headers:H});if(!r.ok)continue;
    const j=await r.json(),f=hd(j,"from"),a=(f.match(/<([^>]+)>/)||f.match(/(\S+@\S+)/)||[])[1];out.push({id:m.id,de:(a||"").toLowerCase(),asunto:hd(j,"subject"),texto:j.snippet||""})}
  return out};
