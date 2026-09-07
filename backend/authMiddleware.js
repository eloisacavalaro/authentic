const jwt = require("jsonwebtoken");
const pool = require("./db");

async function autenticar(req, res, next) {
    const autorizacao = req.headers.authorization;

    if (!autorizacao) {
        return res.status(401).json({
            erro: "Token não informado."
        });
    }

    const partes = autorizacao.trim().split(/\s+/);

    if (partes.length !== 2 || partes[0] !== "Bearer" || !partes[1]) {
        return res.status(401).json({
            erro: "Formato de token inválido."
        });
    }

    try {
        const usuario = jwt.verify(
            partes[1],
            process.env.JWT_SECRET,
            {
                algorithms: ["HS256"]
            }
        );

        if (!usuario.id || !usuario.tipo) {
            return res.status(401).json({
                erro: "Token inválido."
            });
        }

        const atual = await pool.query("SELECT id,nome,email,tipo FROM usuarios WHERE id=$1 AND ativo=true", [usuario.id]);
        if (!atual.rows.length) return res.status(401).json({ erro: "Usuário inativo ou inexistente." });
        req.usuario = atual.rows[0];
        next();

    } catch (erro) {
        return res.status(401).json({
            erro: "Token inválido ou expirado."
        });
    }
}

module.exports = autenticar;
