// Acceso a Neon por HTTP desde el servidor. Variable de entorno: DATABASE_URL
const post=async b=>{const N=process.env.DATABASE_URL;if(!N)throw new Error("Falta DATABASE_URL en Vercel");const u=new URL(N);
  const r=await fetch("https://"+u.hostname.replace(/^(ep-[^.]*?)(-pooler)?\./,"$1-pooler.")+"/sql",{method:"POST",headers:{"Content-Type":"application/json","Neon-Connection-String":N},body:JSON.stringify(b)});
  const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.message||"Neon respondió "+r.status);return j};
exports.post=post;
exports.sql=async(q,p)=>(await post({query:q,params:p||[]})).rows||[];
exports.sqlb=async a=>(await post({queries:a.map(q=>({query:q,params:[]}))})).results;
exports.SCHEMA=["create table if not exists prospectos(id serial primary key,empresa text not null,contacto text,cargo text,ciudad text,email text,nota text,origen text default 'Manual',etapa text default 'Detectado',afinidad int default 70,ultimo timestamptz,creado timestamptz default now())",
"create unique index if not exists prospectos_email on prospectos(lower(email))",
"create unique index if not exists prospectos_emp on prospectos(lower(empresa),lower(coalesce(ciudad,'')))",
"create table if not exists bandeja(id serial primary key,prospecto_id int references prospectos(id) on delete cascade,tipo text,asunto text,cuerpo text,evidencias jsonb default '[]',estado text default 'pendiente',hasta timestamptz,enviado timestamptz,creado timestamptz default now())",
"create table if not exists registro(id serial primary key,hora timestamptz default now(),texto text)",
"create table if not exists fuentes(id serial primary key,tipo text,texto text,frec text default 'cada 12 h',hallazgos int default 0,activa boolean default true)",
"alter table fuentes add column if not exists ultima timestamptz","create table if not exists config(k text primary key,v text)","create table if not exists leidos(id text primary key)"];
