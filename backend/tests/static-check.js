const fs = require("fs");
const path = require("path");

const raiz = path.resolve(__dirname, "../..");
const frontend = path.join(raiz, "frontend");
const falhas = [];

function arquivos(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(item =>
    item.isDirectory() ? arquivos(path.join(dir, item.name)) : path.join(dir, item.name));
}

for (const arquivo of arquivos(frontend)) {
  if (arquivo.endsWith(".js")) {
    try { new Function(fs.readFileSync(arquivo, "utf8")); }
    catch (erro) { falhas.push(`${path.relative(raiz, arquivo)}: JavaScript invalido (${erro.message})`); }
  }
  if (!arquivo.endsWith(".html")) continue;
  const html = fs.readFileSync(arquivo, "utf8");
  for (const match of html.matchAll(/(?:src|href)=["']([^"'#?]+)["']/g)) {
    const referencia = match[1];
    if (/^(?:https?:|mailto:|tel:)/.test(referencia) || referencia.includes("${")) continue;
    const destino = referencia.startsWith("/frontend/")
      ? path.join(raiz, referencia.slice(1))
      : path.resolve(path.dirname(arquivo), referencia);
    if (!fs.existsSync(destino)) falhas.push(`${path.relative(raiz, arquivo)} -> ${referencia} inexistente`);
  }
}

const checkoutHtml = fs.readFileSync(path.join(frontend, "pages", "checkout.html"), "utf8");
const checkoutJs = fs.readFileSync(path.join(frontend, "js", "checkout-inline.js"), "utf8");
const apiJs = fs.readFileSync(path.join(frontend, "js", "api.js"), "utf8");
const carrinhoJs = fs.readFileSync(path.join(frontend, "js", "carrinho.js"), "utf8");
if ((checkoutHtml.match(/https:\/\/sdk\.mercadopago\.com\/js\/v2/g) || []).length !== 1) {
  falhas.push("checkout.html deve carregar exatamente uma instancia do SDK Mercado Pago v2.");
}
if ((checkoutHtml.match(/id=["']paymentBrick_container["']/g) || []).length !== 1) {
  falhas.push("checkout.html deve conter exatamente um container do Payment Brick.");
}
if (!checkoutJs.includes('builder.create("payment", "paymentBrick_container", settings)')) {
  falhas.push("Payment Brick nao usa o tipo ou container esperado.");
}
if (!checkoutJs.includes("public_key.trim()") || !checkoutJs.includes("paymentBrickController.unmount()")) {
  falhas.push("Inicializacao do Payment Brick nao valida a Public Key ou nao desmonta a instancia anterior.");
}
if (!checkoutJs.includes("TENTAR NOVAMENTE") || !checkoutJs.includes("finally")) {
  falhas.push("Falha do Payment Brick pode deixar o checkout sem retry ou preso em loading.");
}
if (!apiJs.includes("new URL(valor, global.location.href)") || !carrinhoJs.includes('href="/pages/produtos.html"')) {
  falhas.push("Links relativos seguros ou a navegacao do carrinho para produtos nao estao preservados.");
}
if (!apiJs.includes('tagContexto === "TBODY"') || !apiJs.includes('<table><tbody id="safe-root">')) {
  falhas.push("Sanitizador nao preserva a estrutura de linhas e celulas inseridas em tbody.");
}
const pedidosAdminJs = fs.readFileSync(path.join(frontend, "js", "admin", "pedidos.js"), "utf8");
const linhaPedido = pedidosAdminJs.match(/function criarLinhaPedido[\s\S]*?async function confirmarPagamento/)?.[0] || "";
if ((linhaPedido.match(/<td>/g) || []).length !== 8 || !linhaPedido.includes("<tr>")) {
  falhas.push("Linha administrativa de pedido nao corresponde as oito colunas do cabecalho.");
}
for (const arquivo of arquivos(path.join(frontend, "js", "admin"))) {
  if (!arquivo.endsWith(".js")) continue;
  const js = fs.readFileSync(arquivo, "utf8");
  if (/window\.location\.(?:href|replace)\s*=\s*["']login\.html/.test(js)) {
    falhas.push(`${path.relative(raiz, arquivo)} redireciona para login inexistente dentro de /pages/admin.`);
  }
}

if (falhas.length) {
  console.error(falhas.join("\n"));
  process.exit(1);
}
console.log("Sintaxe JavaScript e referencias locais verificadas com sucesso.");
