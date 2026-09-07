// Migração mecânica e idempotente de blocos inline para assets compatíveis com CSP.
const fs = require("fs");
const path = require("path");
const raiz = path.resolve(__dirname, "../..");
const paginas = path.join(raiz, "frontend", "pages");

function processar(arquivo) {
  let html = fs.readFileSync(arquivo, "utf8");
  const admin = path.basename(path.dirname(arquivo)) === "admin";
  const nome = path.basename(arquivo, ".html");
  const prefixo = admin ? "../../" : "../";
  let alterado = false;

  const estilos = [];
  html = html.replace(/<style>([\s\S]*?)<\/style>/gi, (_, conteudo) => {
    estilos.push(conteudo.trim()); alterado = true; return "";
  });
  if (estilos.length) {
    const destino = path.join(raiz, "frontend", "css", admin ? "admin" : "", `${nome}-inline.css`);
    fs.writeFileSync(destino, estilos.join("\n\n") + "\n", "utf8");
    html = html.replace("</head>", `    <link rel="stylesheet" href="${prefixo}css/${admin ? "admin/" : ""}${nome}-inline.css">\n</head>`);
  }

  const scripts = [];
  html = html.replace(/<script\s*>([\s\S]*?)<\/script>/gi, (_, conteudo) => {
    scripts.push(conteudo.trim()); alterado = true; return "";
  });
  if (scripts.length) {
    const destino = path.join(raiz, "frontend", "js", admin ? "admin" : "", `${nome}-inline.js`);
    fs.writeFileSync(destino, scripts.join("\n\n") + "\n", "utf8");
    html = html.replace("</body>", `    <script src="${prefixo}js/${admin ? "admin/" : ""}${nome}-inline.js"></script>\n</body>`);
  }
  if (alterado) fs.writeFileSync(arquivo, html, "utf8");
}

for (const dir of [paginas, path.join(paginas, "admin")]) {
  for (const nome of fs.readdirSync(dir)) if (nome.endsWith(".html")) processar(path.join(dir, nome));
}
