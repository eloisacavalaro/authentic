// Utilitario idempotente para reparar texto UTF-8 que foi salvo como mojibake.
const fs = require("fs");
const path = require("path");
const { TextDecoder } = require("util");
const decoder = new TextDecoder("utf-8", { fatal: false });
const raiz = path.resolve(__dirname, "../..");
const extensoes = new Set([".js", ".html", ".css", ".json", ".sql"]);
const reverso1252 = new Map();
for (let byte = 0; byte < 256; byte++) {
  const caractere = new TextDecoder("windows-1252").decode(Uint8Array.of(byte));
  reverso1252.set(caractere, byte);
}

function suspeitas(texto) { return (texto.match(/[ÃÂâð]/g) || []).length; }
function repararLinha(linha) {
  if (!suspeitas(linha)) return linha;
  const bytes = [];
  for (const caractere of linha) {
    const byte = reverso1252.get(caractere);
    if (byte === undefined) return linha;
    bytes.push(byte);
  }
  const candidata = decoder.decode(Uint8Array.from(bytes));
  return !candidata.includes("�") && suspeitas(candidata) < suspeitas(linha) ? candidata : linha;
}
function visitar(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", ".git"].includes(item.name)) continue;
    const arquivo = path.join(dir, item.name);
    if (item.isDirectory()) visitar(arquivo);
    else if (extensoes.has(path.extname(item.name))) {
      const antes = fs.readFileSync(arquivo, "utf8");
      const depois = antes.split(/(\r?\n)/).map(parte => /\r?\n/.test(parte) ? parte : repararLinha(parte)).join("");
      if (depois !== antes) fs.writeFileSync(arquivo, depois, "utf8");
    }
  }
}
visitar(path.join(raiz, "frontend"));
visitar(path.join(raiz, "backend"));
