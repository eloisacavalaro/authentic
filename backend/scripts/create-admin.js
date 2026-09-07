require("dotenv").config();
const bcrypt = require("bcrypt");
const pool = require("../db");

const [nome, email, senha] = process.argv.slice(2);
if (!nome || !email || !senha || senha.length < 12) {
  console.error('Uso: node scripts/create-admin.js "Nome" email@dominio.com "senha-com-12-ou-mais"');
  process.exit(1);
}
(async () => {
  const hash = await bcrypt.hash(senha, 12);
  await pool.query(
    `INSERT INTO usuarios(nome,email,senha,tipo,ativo) VALUES($1,LOWER($2),$3,'admin',true)
     ON CONFLICT (LOWER(email)) DO UPDATE SET nome=EXCLUDED.nome, senha=EXCLUDED.senha, tipo='admin', ativo=true, atualizado_em=NOW()`,
    [nome.trim(), email.trim(), hash]
  );
  console.log("Administrador criado/atualizado com sucesso.");
})().catch(erro => { console.error(erro.message); process.exitCode = 1; }).finally(() => pool.end());
