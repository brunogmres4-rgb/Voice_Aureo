// Trabajador autónomo: envía lo aprobado, prepara seguimientos y busca prospectos.
// Variables: DATABASE_URL, APP_TOKEN, GEMINI_API_KEY, CRON_SECRET (opcional), BASE_URL (opcional), GEMINI_MODEL (opcional)
const{sql,sqlb,SCHEMA}=require("./_neon.js"),{respuestas}=require("./_leer.js");
const GM=process.env.GEMINI_MODEL||"gemini-3.5-flash-lite",EM=/^[^\s@<>,;"']+@[^\s@<>,;"']+\.[^\s@<>,;"']+$/,
BAJA="\n\n—\nSi prefieres no recibir más correos míos, responde BAJA y no volveré a escribirte.",
TD="(select count(*) from bandeja where estado='enviado' and (enviado at time zone 'Europe/Madrid')::date=(now() at time zone 'Europe/Madrid')::date)";
async function gj(p,web){if(!process.env.GEMINI_API_KEY)throw new Error("Falta GEMINI_API_KEY en Vercel");
  const b={contents:[{role:"user",parts:[{text:p}]}],generationConfig:{maxOutputTokens:4096,...(web?{}:{responseMimeType:"application/json"})}};if(web)b.tools=[{google_search:{}}];
  const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GM}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(b)});
  if(!r.ok)throw new Error("Gemini respondió "+r.status);const j=await r.json(),t=(((j.candidates||[])[0]||{}).content||{parts:[]}).parts.filter(x=>!x.thought).map(x=>x.text||"").join(""),m=t.match(/[\[{][\s\S]*[\]}]/);
  if(!m)throw new Error("Gemini devolvió un formato inesperado");try{return JSON.parse(m[0])}catch(e){throw new Error("Gemini devolvió un formato inesperado")}}
async function redactar(p,tipo){
  const o=await gj(`Eres Martina, comercial que vende automatización con IA a pymes del sur de España (reserva online, recordatorios por WhatsApp, asistente que atiende llamadas, presupuestos y documentación automáticos). Escribe un correo en español, cercano y profesional, de ${tipo==="Correo inicial"?"primer contacto":tipo==="Seguimiento"?"seguimiento (el primero no tuvo respuesta; menciónalo sin presionar)":tipo==="Último aviso"?"cierre amable (último mensaje, sin presión)":tipo==="Reactivación"?"reactivación tras más de 60 días sin hablar: una pregunta sencilla o una idea basada solo en las notas, sin presión":"respuesta a alguien que mostró interés: propón una demostración de 20 minutos y pregunta qué día le encaja"}.
Datos del prospecto: empresa ${p.empresa}; contacto ${p.contacto||"desconocido"}; cargo ${p.cargo||"?"}; ciudad ${p.ciudad||"?"}; notas: ${p.nota||"ninguna"}.
Reglas: usa SOLO estos datos, no inventes reseñas, cifras, noticias ni casos de éxito; máximo 110 palabras; una sola pregunta final; empieza con "Hola, Nombre:" (o "Hola:" si no hay nombre); termina con "Un saludo,\nMartina"; sin markdown.
Devuelve SOLO JSON: {"a":"asunto breve","c":"cuerpo completo","e":["hasta 3 motivos de por qué este mensaje, basados en los datos"],"s":afinidad entera entre 40 y 99}`);
  const c=String(o.c||"").trim();if(!c)throw new Error("Gemini no devolvió el borrador");
  await sql("insert into bandeja(prospecto_id,tipo,asunto,cuerpo,evidencias) values($1,$2,$3,$4,$5)",[p.id,tipo,String(o.a||"Una idea para "+p.empresa).replace(/\s+/g," ").trim().slice(0,150),c+BAJA,JSON.stringify((Array.isArray(o.e)?o.e:[]).slice(0,3).map(String))]);
  await sql("update prospectos set afinidad=$1 where id=$2",[Math.max(40,Math.min(99,Math.round(+o.s||70))),p.id])}
const base=()=>process.env.BASE_URL||"https://"+process.env.VERCEL_PROJECT_PRODUCTION_URL;
async function enviar(para,asunto,texto){const r=await fetch(base()+"/api/gmail",{method:"POST",headers:{"Content-Type":"application/json","x-app-token":process.env.APP_TOKEN||""},body:JSON.stringify({para,asunto,texto})});if(!r.ok)throw new Error("Gmail respondió "+r.status)}
async function mandar(b){await enviar(b.email,b.asunto,b.cuerpo);
  await sql("update bandeja set estado='enviado',enviado=now() where id=$1",[b.id]);
  await sql("update prospectos set etapa=case when etapa='Detectado' then 'Contactado' else etapa end,ultimo=now() where id=$1",[b.prospecto_id])}
async function permitido(email){const[c]=await sql(`select ${TD} d,(select count(*) from bandeja b join prospectos p on p.id=b.prospecto_id where b.estado='enviado' and b.enviado>now()-interval '7 days' and lower(split_part(p.email,'@',2))=$1) w`,[email.split("@")[1].toLowerCase()]);return +c.d<80&&+c.w<12}
async function revisarRespuestas(out){
  const ps=await sql("select id,email,empresa,contacto,cargo,ciudad,nota from prospectos where email is not null and ultimo is not null and etapa in('Contactado','Detectado','Respondió') order by ultimo desc limit 40");
  if(!ps.length)return;const ms=await respuestas(ps.map(p=>p.email));if(!ms)return;
  const vistos=new Set((await sql("select id from leidos")).map(x=>x.id));
  for(const m of ms){if(vistos.has(m.id))continue;const p=ps.find(x=>x.email.toLowerCase()===m.de);if(!p)continue;
    const c=await gj(`Clasifica esta respuesta a un correo comercial. Asunto: ${m.asunto}\nTexto: ${m.texto}\nDevuelve SOLO JSON {"t":"interes"|"baja"|"rechazo"|"automatica"|"otro","r":"resumen de máximo 12 palabras"}`);
    await sql("insert into leidos(id) values($1) on conflict do nothing",[m.id]);
    const t=String(c.t||"otro");if(t==="automatica")continue;const baja=t==="baja"||t==="rechazo";
    await sql("update prospectos set etapa=$1 where id=$2",[baja?"Baja":"Respondió",p.id]);
    await sql("update bandeja set estado='descartado' where prospecto_id=$1 and estado in('pendiente','pospuesto','aprobado')",[p.id]);
    await sql("insert into registro(texto) values($1)",[`Respuesta de ${p.empresa} (${t}): ${String(c.r||"").slice(0,120)}`]);out.respuestas++;
    if(t==="interes")await redactar(p,"Respuesta")}}
async function resumen(cfg){const to=process.env.OWNER_EMAIL,hoy=new Date().toLocaleDateString("sv-SE",{timeZone:"Europe/Madrid"});if(!to||cfg.resumen===hoy)return;
  const[c]=await sql("select (select count(*) from bandeja where estado='pendiente') pend,(select count(*) from bandeja where estado='enviado' and enviado>now()-interval '24 hours') env,(select count(*) from prospectos where creado>now()-interval '24 hours') nue"),
  rs=await sql("select texto from registro where texto like 'Respuesta de %' and hora>now()-interval '24 hours' order by id desc limit 10");
  if(!(+c.pend||+c.env||+c.nue||rs.length))return;
  await enviar(to,"Resumen del operador",`Buenos días:\n\nEsperan tu visto bueno: ${c.pend}\nCorreos enviados en 24 h: ${c.env}\nProspectos nuevos: ${c.nue}\nRespuestas recibidas: ${rs.length}${rs.length?"\n\n"+rs.map(r=>"· "+r.texto).join("\n"):""}${process.env.APP_URL?"\n\nRevisa la bandeja: "+process.env.APP_URL:""}`);
  await sql("insert into config(k,v) values('resumen',$1) on conflict(k) do update set v=excluded.v",[hoy])}
async function buscar(f,vivo,out){
  await sql("update fuentes set ultima=now() where id=$1",[f.id]);
  const a=await gj(`Eres un investigador comercial. El usuario busca clientes potenciales con esta descripción: "${f.texto}".
Usa la búsqueda de Google para encontrar hasta 6 empresas o profesionales REALES y ACTIVOS que encajen como CLIENTE POTENCIAL: gente que podría comprar lo que ofrece el usuario o que ha mostrado esa necesidad. Interpreta la descripción como "quién necesita o compraría esto", no como el tema en sí.
Ejemplo: si la descripción es "gente que quiera dibujos", busca quien encarga o necesita ilustraciones (editoriales, marcas, agencias, negocios que buscan ilustradores, particulares que los piden), NO galerías, museos, escuelas de arte ni tiendas de material.
Excluye siempre museos, galerías, administraciones públicas, universidades, medios de comunicación, directorios, redes sociales, marketplaces y cualquier organización que solo trate el tema sin ser compradora.
Cada resultado DEBE tener un correo electrónico público que hayas visto escrito en una página web (su web, su ficha o su perfil). Si no encuentras correo, descarta ese resultado. No inventes ni deduzcas correos.
Devuelve SOLO un array JSON de objetos con las claves: empresa, contacto (la persona si aparece, si no vacío), cargo, ciudad, email, fuente (URL exacta de la página donde aparece el correo), nota (una frase: por qué encaja como cliente, con un dato concreto y verificable).
Si no encuentras ninguno que cumpla todo, devuelve [].`,1);
  if(!Array.isArray(a))return;let n=0;
  for(const x of a.slice(0,8)){if(!x||!x.empresa)continue;const em=String(x.email||"").trim().toLowerCase(),s=v=>v?String(v).slice(0,200):null;if(!EM.test(em)||!x.fuente)continue;
    const[p]=await sql("insert into prospectos(empresa,contacto,cargo,ciudad,email,nota,origen) values($1,$2,$3,$4,$5,$6,$7) on conflict do nothing returning *",[s(x.empresa),s(x.contacto),s(x.cargo),s(x.ciudad),EM.test(em)?em:null,s([x.nota,"Fuente: "+x.fuente].filter(Boolean).join(" · ")),f.tipo]);
    if(!p)continue;n++;out.nuevos++;if(p.email&&vivo()){try{await redactar(p,"Correo inicial");out.borradores++}catch(e){out.errores.push(e.message)}}}
  await sql("update fuentes set hallazgos=hallazgos+$1 where id=$2",[n,f.id]);await sql("insert into registro(texto) values($1)",[`Radar (automático): ${n} prospectos nuevos de «${f.texto}»`])}
module.exports=async(req,res)=>{
  const a=req.headers.authorization||"";
  if(!((process.env.CRON_SECRET&&a==="Bearer "+process.env.CRON_SECRET)||(process.env.APP_TOKEN&&req.headers["x-app-token"]===process.env.APP_TOKEN)))return res.status(401).json({error:"No autorizado"});
  const t0=Date.now(),vivo=()=>Date.now()-t0<40000,out={respuestas:0,enviados:0,borradores:0,nuevos:0,errores:[]};
  try{
    await sqlb(SCHEMA);
    const cfg=Object.fromEntries((await sql("select k,v from config")).map(x=>[x.k,x.v]));
    if(cfg.pausa==="1")return res.json({pausa:true});
    const h=+new Date().toLocaleString("en-GB",{timeZone:"Europe/Madrid",hour:"numeric",hour12:false});
    try{await revisarRespuestas(out)}catch(e){out.errores.push(e.message)}
    if(h>=9&&h<19){
      const q=await sql("select b.*,p.email from bandeja b join prospectos p on p.id=b.prospecto_id where p.etapa<>'Baja' and p.email is not null and (b.estado='aprobado' or ($1::text='aut' and b.estado='pendiente' and b.tipo in('Seguimiento','Último aviso'))) order by b.id limit 10",[cfg.modo||"man"]);
      for(const b of q){if(!vivo()||!(await permitido(b.email)))break;
        try{await mandar(b);out.enviados++;await sql("insert into registro(texto) values($1)",["Enviado a "+b.email+(b.estado==="aprobado"?"":" (automático)")])}catch(e){out.errores.push(e.message);break}}}
    const seg=(await sql("select p.*,(select count(*) from bandeja b where b.prospecto_id=p.id and b.estado='enviado') n from prospectos p where p.etapa='Contactado' and p.email is not null and p.ultimo<now()-interval '3 days' and not exists(select 1 from bandeja b where b.prospecto_id=p.id and b.estado in('pendiente','pospuesto','aprobado')) limit 5")).filter(x=>+x.n<3);
    for(const p of seg){if(!vivo())break;try{await redactar(p,+p.n>1?"Último aviso":"Seguimiento");out.borradores++}catch(e){out.errores.push(e.message);break}}
    const rea=await sql("select p.* from prospectos p where p.etapa='Contactado' and p.email is not null and p.ultimo<now()-interval '60 days' and not exists(select 1 from bandeja b where b.prospecto_id=p.id and (b.estado in('pendiente','pospuesto','aprobado') or b.tipo='Reactivación')) limit 3");
    for(const p of rea){if(!vivo())break;try{await redactar(p,"Reactivación");out.borradores++}catch(e){out.errores.push(e.message);break}}
    if(h>=9&&h<19)try{await resumen(cfg)}catch(e){out.errores.push(e.message)}
    if(vivo()){const[f]=await sql("select * from fuentes where activa and tipo='Búsqueda web' and (ultima is null or ultima<now()-interval '12 hours') order by ultima nulls first limit 1");
      if(f)try{await buscar(f,vivo,out)}catch(e){out.errores.push(e.message);await sql("insert into registro(texto) values($1)",["Radar (automático): error en «"+f.texto+"»: "+e.message]).catch(()=>{})}}
    res.json(out)}catch(e){res.status(500).json({error:e.message,...out})}};
