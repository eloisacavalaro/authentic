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

if (falhas.length) {
  console.error(falhas.join("\n"));
  process.exit(1);
}
console.log("Sintaxe JavaScript e referencias locais verificadas com sucesso.");
