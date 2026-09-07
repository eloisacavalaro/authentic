
const { Pool } = require("pg");

const usarSsl = process.env.DB_SSL === "true";
const pool = new Pool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: usarSsl ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== "false" } : false,

    // Limites para evitar conexões excessivas.
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    query_timeout: 30000
});

pool.on("error", (erro) => {
    console.error("Erro inesperado no pool do PostgreSQL:", erro.message);
});

module.exports = pool;

