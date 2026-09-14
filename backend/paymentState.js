const TRANSICOES_PAGAMENTO = Object.freeze({
    pendente: new Set(["pendente", "pago", "recusado", "cancelado", "estorno_pendente", "estornado"]),
    recusado: new Set(["recusado", "pago", "cancelado", "estorno_pendente", "estornado"]),
    cancelado: new Set(["cancelado", "estorno_pendente", "estornado"]),
    pago: new Set(["pago", "estorno_pendente", "estornado"]),
    estorno_pendente: new Set(["estorno_pendente", "estornado"]),
    estornado: new Set(["estornado"])
});

function podeTransicionarStatus(statusAtual, novoStatus) {
    return Boolean(TRANSICOES_PAGAMENTO[statusAtual]?.has(novoStatus));
}

function decidirStatusPagamento({ statusAtual, statusGateway, pedidoCancelado = false, reservaLiberada = false }) {
    const pagamentoTardio = statusGateway === "pago" && (pedidoCancelado || reservaLiberada);
    const statusDesejado = pagamentoTardio ? "estorno_pendente" : statusGateway;
    return podeTransicionarStatus(statusAtual, statusDesejado) ? statusDesejado : statusAtual;
}

module.exports = { TRANSICOES_PAGAMENTO, podeTransicionarStatus, decidirStatusPagamento };
