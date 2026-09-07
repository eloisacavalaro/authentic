require("dotenv").config();
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcrypt");
const pool = require("../db");

const porta = 32000 + Math.floor(Math.random() * 1000);
const base = `http://127.0.0.1:${porta}`;
const marca = `e2e-${Date.now()}`;
let servidor, adminId, clienteId, produtoId, imagem;
const pedidos = [];
const assert = (condicao, mensagem) => { if (!condicao) throw new Error(mensagem); };
async function api(url, opcoes = {}) {
  const resposta = await fetch(base + url, opcoes);
  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok) throw new Error(`${opcoes.method || "GET"} ${url}: ${resposta.status} ${dados.erro || ""}`);
  return dados;
}
async function login(email, senha) {
  return (await api("/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, senha }) })).token;
}
async function criarPedido(token) {
  const dados = await api("/pedidos", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify({
    itens: [{ produto_id: produtoId, tamanho: "M", cor: "Preto", quantidade: 1 }], forma_recebimento: "retirada", forma_pagamento: "dinheiro"
  }) });
  pedidos.push(dados.pedido.id); return dados.pedido;
}

(async () => {
  const usuariosAntigos = (await pool.query("SELECT id FROM usuarios WHERE nome LIKE 'e2e-%'")).rows.map(r => r.id);
  const produtosAntigos = (await pool.query("SELECT id FROM produtos WHERE nome LIKE 'e2e-%'")).rows.map(r => r.id);
  if (usuariosAntigos.length) {
    const pedidosAntigos = (await pool.query("SELECT id FROM pedidos WHERE usuario_id=ANY($1)", [usuariosAntigos])).rows.map(r => r.id);
    if (pedidosAntigos.length) {
      await pool.query("DELETE FROM auditoria WHERE entidade_id=ANY($1) AND entidade IN ('pedido','pagamento')", [pedidosAntigos]);
      await pool.query("DELETE FROM movimentacoes_estoque WHERE referencia_tipo='pedido' AND referencia_id=ANY($1)", [pedidosAntigos]);
      await pool.query("DELETE FROM pagamentos WHERE pedido_id=ANY($1)", [pedidosAntigos]);
      await pool.query("DELETE FROM itens_pedido WHERE pedido_id=ANY($1)", [pedidosAntigos]);
      await pool.query("DELETE FROM pedidos WHERE id=ANY($1)", [pedidosAntigos]);
    }
  }
  if (produtosAntigos.length) {
    await pool.query("DELETE FROM movimentacoes_estoque WHERE estoque_id IN (SELECT id FROM estoque WHERE produto_id=ANY($1))", [produtosAntigos]);
    await pool.query("DELETE FROM estoque WHERE produto_id=ANY($1)", [produtosAntigos]);
    await pool.query("DELETE FROM produtos WHERE id=ANY($1)", [produtosAntigos]);
  }
  if (usuariosAntigos.length) await pool.query("DELETE FROM usuarios WHERE id=ANY($1)", [usuariosAntigos]);
  const senha = "Teste-forte-123!";
  const hash = await bcrypt.hash(senha, 10);
  adminId = (await pool.query("INSERT INTO usuarios(nome,email,senha,tipo) VALUES($1,$2,$3,'admin') RETURNING id", [marca, `${marca}-admin@example.com`, hash])).rows[0].id;
  const cadastro = await pool.query("INSERT INTO usuarios(nome,email,senha,tipo) VALUES($1,$2,$3,'cliente') RETURNING id", [marca, `${marca}-cliente@example.com`, hash]);
  clienteId = cadastro.rows[0].id;
  servidor = spawn(process.execPath, ["server.js"], { cwd: path.resolve(__dirname, ".."), env: { ...process.env, PORT: String(porta), NODE_ENV: "test", RESERVA_ESTOQUE_MINUTOS: "5" }, stdio: "inherit" });
  for (let tentativa = 0; tentativa < 30; tentativa++) {
    try { if ((await fetch(`${base}/teste`)).ok) break; } catch (_) {}
    await new Promise(resolve => setTimeout(resolve, 200));
    if (tentativa === 29) throw new Error("Servidor de teste nao iniciou.");
  }
  const tokenAdmin = await login(`${marca}-admin@example.com`, senha);
  const tokenCliente = await login(`${marca}-cliente@example.com`, senha);
  const paginaLogin = await fetch(`${base}/frontend/pages/login.html`);
  const csp = paginaLogin.headers.get("content-security-policy") || "";
  assert(paginaLogin.ok && csp.includes("script-src 'self'") && !csp.includes("script-src 'self' 'unsafe-inline'"), "CSP de scripts nao esta restritiva.");

  const form = new FormData();
  form.append("nome", marca); form.append("preco", "99.90"); form.append("categoria", "camisas");
  form.append("tamanhos", JSON.stringify(["M"])); form.append("cores", JSON.stringify(["Preto"]));
  form.append("imagem", new Blob([Buffer.from("89504e470d0a1a0a", "hex")], { type: "image/png" }), "teste.png");
  const produto = await api("/produtos", { method: "POST", headers: { Authorization: `Bearer ${tokenAdmin}` }, body: form });
  produtoId = produto.id; imagem = produto.imagem;
  const variacoes = await api(`/produtos/${produtoId}/estoque`);
  assert(variacoes.length === 1, "Cadastro nao criou a variacao.");
  await api("/estoque", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenAdmin}` }, body: JSON.stringify({ produto_id: produtoId, tamanho: "M", cor: "Preto", quantidade: 3 }) });

  const primeiro = await criarPedido(tokenCliente);
  assert(primeiro.reserva_expira_em, "Pedido nao recebeu validade da reserva.");
  await api(`/pedidos/${primeiro.id}/status`, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenAdmin}` }, body: JSON.stringify({ status: "cancelado" }) });
  let saldo = Number((await pool.query("SELECT quantidade FROM estoque WHERE produto_id=$1", [produtoId])).rows[0].quantidade);
  assert(saldo === 3, "Cancelamento nao devolveu o estoque.");

  const segundo = await criarPedido(tokenCliente);
  const pagamento = (await api(`/pedidos/${segundo.id}/pagamento`, { headers: { Authorization: `Bearer ${tokenAdmin}` } })).pagamento;
  await api(`/pagamentos/${pagamento.id}/status`, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenAdmin}` }, body: JSON.stringify({ status: "pago" }) });
  await api(`/pedidos/${segundo.id}/status`, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokenAdmin}` }, body: JSON.stringify({ status: "cancelado" }) });
  const statusPagamento = (await pool.query("SELECT status FROM pagamentos WHERE id=$1", [pagamento.id])).rows[0].status;
  assert(statusPagamento === "estorno_pendente", "Cancelamento registrou estorno sem confirmacao.");

  const terceiro = await criarPedido(tokenCliente);
  await pool.query("UPDATE pedidos SET reserva_expira_em=NOW()-INTERVAL '1 minute' WHERE id=$1", [terceiro.id]);
  await api(`/produtos/${produtoId}/estoque`);
  const expirado = (await pool.query("SELECT status,reserva_liberada_em FROM pedidos WHERE id=$1", [terceiro.id])).rows[0];
  assert(expirado.status === "cancelado" && expirado.reserva_liberada_em, "Reserva expirada nao foi liberada.");
  console.log("E2E crítico aprovado: CSP/assets, upload, variações, reserva, cancelamento e estorno pendente.");
})().catch(erro => { console.error(erro.message); process.exitCode = 1; }).finally(async () => {
  if (servidor) servidor.kill();
  try {
    if (pedidos.length) await pool.query("DELETE FROM auditoria WHERE entidade IN ('pedido','pagamento') AND (entidade_id=ANY($1) OR (dados->>'pedido_id')::bigint=ANY($1))", [pedidos]);
    if (pedidos.length) await pool.query("DELETE FROM movimentacoes_estoque WHERE referencia_tipo='pedido' AND referencia_id=ANY($1)", [pedidos]);
    if (pedidos.length) { await pool.query("DELETE FROM pagamentos WHERE pedido_id=ANY($1)", [pedidos]); await pool.query("DELETE FROM itens_pedido WHERE pedido_id=ANY($1)", [pedidos]); await pool.query("DELETE FROM pedidos WHERE id=ANY($1)", [pedidos]); }
    if (produtoId) { await pool.query("DELETE FROM estoque WHERE produto_id=$1", [produtoId]); await pool.query("DELETE FROM produtos WHERE id=$1", [produtoId]); }
    if (clienteId || adminId) await pool.query("DELETE FROM usuarios WHERE id=ANY($1)", [[clienteId, adminId].filter(Boolean)]);
    if (imagem) fs.rmSync(path.resolve(__dirname, "../../frontend/images/produtos", imagem), { force: true });
  } finally { await pool.end(); }
});
