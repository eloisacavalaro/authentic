const fs = require("fs");
const path = require("path");

const raiz = path.resolve(__dirname, "../..");
const frontend = path.join(raiz, "frontend");
const falhas = [];
function arquivos(dir) { return fs.readdirSync(dir, { withFileTypes: true }).flatMap(item => item.isDirectory() ? arquivos(path.join(dir, item.name)) : path.join(dir, item.name)); }

for (const arquivo of arquivos(frontend)) {
  if (!/\.(?:js|html)$/.test(arquivo)) continue;
  const conteudo = fs.readFileSync(arquivo, "utf8");
  if (/\b(?:innerHTML|outerHTML|insertAdjacentHTML|document\.write)\b/.test(conteudo)) falhas.push(`${path.relative(raiz, arquivo)} contem sink HTML inseguro.`);
  if (/\son[a-z]+\s*=/i.test(conteudo)) falhas.push(`${path.relative(raiz, arquivo)} contem handler inline.`);
  if (/localStorage\.(?:getItem|setItem)\(["']token["']/.test(conteudo)) falhas.push(`${path.relative(raiz, arquivo)} acessa JWT no localStorage.`);
  if (/Authorization\s*:/.test(conteudo) && !arquivo.endsWith(`${path.sep}api.js`)) falhas.push(`${path.relative(raiz, arquivo)} envia Authorization pelo frontend.`);
  if (arquivo.endsWith(".html") && conteudo.includes("<script") && !conteudo.includes("js/api.js")) falhas.push(`${path.relative(raiz, arquivo)} nao carrega configuracao central da API.`);
}

const render = fs.readFileSync(path.join(raiz, "render.yaml"), "utf8");
if (!render.includes("source: /") || !render.includes("destination: /pages/index.html")) falhas.push("render.yaml nao redireciona a raiz para a home.");
if (!fs.existsSync(path.join(frontend, "index.html"))) falhas.push("frontend/index.html nao existe para atender a raiz do servico estatico.");
if (falhas.length) { console.error(falhas.join("\n")); process.exit(1); }
console.log("Seguranca estatica aprovada: HTML dinamico, handlers, JWT e raiz do frontend.");
