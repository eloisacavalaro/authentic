require("dotenv").config();
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcrypt");
const pool = require("../db");
const porta = 34100 + Math.floor(Math.random() * 400);
const base = `http://127.0.0.1:${porta}`;
const marca = `auth-e2e-${Date.now()}`;
let servidor, usuarioId, outroId, pedidoId;
const assert = (ok,msg) => { if(!ok) throw new Error(msg); };
async function request(url, options={}) { const resposta=await fetch(base+url,options); return {resposta,body:await resposta.json().catch(()=>({}))}; }

(async()=>{
  const hash=await bcrypt.hash("Senha-forte-123!",10);
  usuarioId=(await pool.query("INSERT INTO usuarios(nome,email,senha,tipo) VALUES($1,$2,$3,'cliente') RETURNING id",[marca,`${marca}@example.com`,hash])).rows[0].id;
  outroId=(await pool.query("INSERT INTO usuarios(nome,email,senha,tipo) VALUES($1,$2,$3,'cliente') RETURNING id",[`${marca}-outro`,`${marca}-outro@example.com`,hash])).rows[0].id;
  pedidoId=(await pool.query("INSERT INTO pedidos(usuario_id,forma_recebimento,forma_pagamento,status,valor_total) VALUES($1,'retirada','dinheiro','aguardando_pagamento',10) RETURNING id",[outroId])).rows[0].id;
  servidor=spawn(process.execPath,["server.js"],{cwd:path.resolve(__dirname,".."),env:{...process.env,PORT:String(porta),NODE_ENV:"test"},stdio:"inherit"});
  for(let i=0;i<30;i++){try{if((await fetch(`${base}/teste`)).ok)break;}catch(_){}await new Promise(r=>setTimeout(r,150));if(i===29)throw new Error("Servidor nao iniciou.");}
  assert((await request("/api/auth/me")).resposta.status===401,"/auth/me aceitou usuario anonimo.");
  assert((await request("/api/auth/me",{headers:{Authorization:"Bearer token-invalido"}})).resposta.status===401,"Token invalido foi aceito.");
  const errado=await request("/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:`${marca}@example.com`,senha:"errada"})});
  assert(errado.resposta.status===401,"Senha incorreta foi aceita.");
  const login=await request("/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:`${marca}@example.com`,senha:"Senha-forte-123!"})});
  assert(login.resposta.status===200 && login.body.token,"Login correto falhou.");
  const me=await request("/api/auth/me",{headers:{Authorization:`Bearer ${login.body.token}`}});
  assert(me.resposta.status===200 && Number(me.body.usuario.id)===Number(usuarioId) && !Object.hasOwn(me.body.usuario,"senha"),"/auth/me retornou usuario incorreto ou dado sensivel.");
  assert((await request(`/pedidos/${pedidoId}`,{headers:{Authorization:`Bearer ${login.body.token}`}})).resposta.status===403,"IDOR permitiu consultar pedido de outro usuario.");
  await pool.query("UPDATE usuarios SET ativo=false WHERE id=$1",[usuarioId]);
  assert((await request("/api/auth/me",{headers:{Authorization:`Bearer ${login.body.token}`}})).resposta.status===401,"Token de usuario desativado continuou valido.");
  const loginJs=fs.readFileSync(path.resolve(__dirname,"../../frontend/js/login-inline.js"),"utf8");
  const contaJs=fs.readFileSync(path.resolve(__dirname,"../../frontend/js/conta.js"),"utf8");
  assert(loginJs.includes("/api/auth/me") && contaJs.includes("/api/auth/me"),"Frontend nao valida sessao no backend.");
  console.log("Autenticacao E2E aprovada: anonimo, credenciais, /auth/me, expiracao logica e IDOR.");
})().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(async()=>{
  if(servidor)servidor.kill();
  try{if(pedidoId)await pool.query("DELETE FROM pedidos WHERE id=$1",[pedidoId]);if(usuarioId||outroId)await pool.query("DELETE FROM usuarios WHERE id=ANY($1)",[[usuarioId,outroId].filter(Boolean)]);}finally{await pool.end();}
});
