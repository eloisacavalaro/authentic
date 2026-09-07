require("dotenv").config();
const pool = require("../db");
const timeout = setTimeout(() => {
  console.error("PostgreSQL nao respondeu em 8 segundos.");
  process.exit(2);
}, 8000);
pool.query(`SELECT pid, state, wait_event_type, wait_event, LEFT(query, 120) AS query
  FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() ORDER BY pid`)
  .then(resultado => {
    console.log("PostgreSQL acessivel.");
    console.table(resultado.rows);
  })
  .catch(erro => { console.error(`PostgreSQL indisponivel: ${erro.message}`); process.exitCode = 1; })
  .finally(async () => { clearTimeout(timeout); await pool.end(); });
