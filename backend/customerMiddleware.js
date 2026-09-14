function apenasCliente(req, res, next) {
    if (!req.usuario) return res.status(401).json({ erro: "Nao autenticado." });
    if (req.usuario.tipo !== "cliente") {
        return res.status(403).json({ erro: "Use uma conta de cliente para realizar compras." });
    }
    next();
}

module.exports = apenasCliente;
