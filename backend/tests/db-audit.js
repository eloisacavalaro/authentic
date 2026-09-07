require("dotenv").config();
const pool = require("../db");
(async () => {
  const tabelas = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name");
  const colunas = await pool.query("SELECT table_name, column_name FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name, ordinal_position");
  console.log("Tabelas:", tabelas.rows.map(r => r.table_name).join(", "));
  for (const tabela of tabelas.rows) {
    console.log(`${tabela.table_name}: ${colunas.rows.filter(c => c.table_name === tabela.table_name).map(c => c.column_name).join(", ")}`);
  }
})().catch(erro => { console.error(erro.message); process.exitCode = 1; }).finally(() => pool.end());
