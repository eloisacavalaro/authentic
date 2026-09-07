require("dotenv").config();
const fs = require("fs");
const path = require("path");
const pool = require("../db");
const arquivo = process.argv[2] || "migrate-existing.sql";
const caminho = path.resolve(__dirname, "..", arquivo);
pool.query(fs.readFileSync(caminho, "utf8"))
  .then(() => console.log(`Migracao aplicada: ${path.basename(caminho)}`))
  .catch(erro => { console.error(`Falha na migracao: ${erro.message}`); process.exitCode = 1; })
  .finally(() => pool.end());
