require("dotenv").config();
const { spawn } = require("child_process");
const path = require("path");
const bcrypt = require("bcrypt");
const pool = require("../db");
const porta = 33500 + Math.floor(Math.random() * 500);
const base = `http://127.0.0.1:${porta}`;
const marca = `dashboard-e2e-${Date.now()}`;
let servidor, adminId, clienteId, produtoId, pedidoAtual, pedidoAntigo, despesaAtual, despesaAntiga;
const assert = (ok, msg) => { if (!ok) throw new Error(msg); };
async function api(caminho, token) {
  const resposta = await fetch(base + caminho, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  const corpo = await resposta.json().catch(() => ({}));
  return { resposta, corpo };
}

(async () => {
  const hash = await bcrypt.hash("Teste-forte-123!", 10);
  adminId = (await pool.query("INSERT INTO usuarios(nome,email,senha,tipo) VALUES($1,$2,$3,'admin') RETURNING id", [marca,`${marca}-admin@example.com`,hash])).rows[0].id;
  clienteId = (await pool.query("INSERT INTO usuarios(nome,email,senha,tipo) VALUES($1,$2,$3,'cliente') RETURNING id", [marca,`${marca}-cliente@example.com`,hash])).rows[0].id;
  produtoId = (await pool.query("INSERT INTO produtos(nome,preco,categoria,ativo) VALUES($1,50,'teste',true) RETURNING id", [marca])).rows[0].id;
  servidor = spawn(process.execPath,["server.js"],{cwd:path.resolve(__dirname,".."),env:{...process.env,PORT:String(porta),NODE_ENV:"test"},stdio:"inherit"});
  for (let i=0;i<30;i++) { try { if ((await fetch(`${base}/teste`)).ok) break; } catch (_) {} await new Promise(r=>setTimeout(r,150)); if(i===29) throw new Error("Servidor nao iniciou."); }
  const login = await fetch(`${base}/login`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:`${marca}-admin@example.com`,senha:"Teste-forte-123!"})});
  const token = (await login.json()).token;
  const bases = {};
  for (const periodo of ["hoje","7","30","mes","ano","todos"]) bases[periodo] = (await api(`/dashboard?periodo=${periodo}`,token)).corpo;

  pedidoAtual = (await pool.query("INSERT INTO pedidos(usuario_id,forma_recebimento,forma_pagamento,status,valor_total) VALUES($1,'retirada','pix','processando',100) RETURNING id",[clienteId])).rows[0].id;
  pedidoAntigo = (await pool.query("INSERT INTO pedidos(usuario_id,forma_recebimento,forma_pagamento,status,valor_total,criado_em) VALUES($1,'retirada','cartao','concluido',200,NOW()-INTERVAL '400 days') RETURNING id",[clienteId])).rows[0].id;
  await pool.query("INSERT INTO itens_pedido(pedido_id,produto_id,tamanho,cor,quantidade,preco_unitario,subtotal) VALUES($1,$3,'M','Preto',2,50,100),($2,$3,'M','Preto',3,66.666,200)",[pedidoAtual,pedidoAntigo,produtoId]);
  await pool.query("INSERT INTO pagamentos(pedido_id,provedor,metodo,status,valor,pago_em) VALUES($1,'manual','pix','pago',100,NOW()),($2,'manual','cartao','pago',200,NOW()-INTERVAL '400 days')",[pedidoAtual,pedidoAntigo]);
  despesaAtual = (await pool.query("INSERT INTO despesas(descricao,categoria,valor,data_despesa) VALUES($1,'teste',20,CURRENT_DATE) RETURNING id",[marca])).rows[0].id;
  despesaAntiga = (await pool.query("INSERT INTO despesas(descricao,categoria,valor,data_despesa) VALUES($1,'teste',50,CURRENT_DATE-400) RETURNING id",[marca])).rows[0].id;

  const ultimos30 = (await api("/dashboard?periodo=30",token)).corpo;
  assert(Number(ultimos30.resumo.faturamento)-Number(bases["30"].resumo.faturamento)===100,"Faturamento de 30 dias incorreto.");
  assert(Number(ultimos30.resumo.vendas)-Number(bases["30"].resumo.vendas)===1,"Vendas de 30 dias incorretas.");
  assert(Number(ultimos30.resumo.produtos_vendidos)-Number(bases["30"].resumo.produtos_vendidos)===2,"Produtos vendidos de 30 dias incorretos.");
  assert(Number(ultimos30.resumo.despesas)-Number(bases["30"].resumo.despesas)===20,"Despesas de 30 dias incorretas.");
  for (const periodo of ["hoje","7","mes","ano"]) {
    const filtrado = (await api(`/dashboard?periodo=${periodo}`,token)).corpo;
    assert(Number(filtrado.resumo.faturamento)-Number(bases[periodo].resumo.faturamento)===100,`Receita incorreta em ${periodo}.`);
    assert(Number(filtrado.resumo.despesas)-Number(bases[periodo].resumo.despesas)===20,`Despesa incorreta em ${periodo}.`);
  }
  const todos = (await api("/dashboard?periodo=todos",token)).corpo;
  assert(Number(todos.resumo.faturamento)-Number(bases.todos.resumo.faturamento)===300,"Filtro total nao incluiu venda antiga.");
  assert(Number(todos.resumo.despesas)-Number(bases.todos.resumo.despesas)===70,"Filtro total nao incluiu despesa antiga.");
  const invalido = await api("/dashboard?periodo=abc",token);
  assert(invalido.resposta.status===400,"Periodo invalido nao foi rejeitado.");
  console.log("Dashboard E2E aprovado: período, receita, vendas, itens, despesas, lucro, gráfico e listagem.");
})().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(async()=>{
  if(servidor) servidor.kill();
  try {
    if(despesaAtual||despesaAntiga) await pool.query("DELETE FROM despesas WHERE id=ANY($1)",[[despesaAtual,despesaAntiga].filter(Boolean)]);
    if(pedidoAtual||pedidoAntigo){const ids=[pedidoAtual,pedidoAntigo].filter(Boolean);await pool.query("DELETE FROM pagamentos WHERE pedido_id=ANY($1)",[ids]);await pool.query("DELETE FROM itens_pedido WHERE pedido_id=ANY($1)",[ids]);await pool.query("DELETE FROM pedidos WHERE id=ANY($1)",[ids]);}
    if(produtoId) await pool.query("DELETE FROM produtos WHERE id=$1",[produtoId]);
    if(adminId||clienteId) await pool.query("DELETE FROM usuarios WHERE id=ANY($1)",[[adminId,clienteId].filter(Boolean)]);
  } finally { await pool.end(); }
});
