document.addEventListener("DOMContentLoaded", async () => {
    const ultimoPedido = JSON.parse(localStorage.getItem("ultimoPedido") || "null");
    const mensagem = document.querySelector(".mensagem");
    if (!ultimoPedido) {
        document.getElementById("numero-pedido").textContent = "#---";
        document.getElementById("recebimento").textContent = "Informacao nao encontrada";
        document.getElementById("pagamento").textContent = "---";
        document.getElementById("total").textContent = "R$ 0,00";
        mensagem.textContent = "Nao foi possivel identificar o pedido. Consulte seu historico de compras.";
        return;
    }
    document.getElementById("numero-pedido").textContent = `#${ultimoPedido.id}`;
    document.getElementById("recebimento").textContent = ultimoPedido.forma_recebimento === "entrega" ? "Entrega em domicilio" : "Retirada na loja";
    document.getElementById("total").textContent = Number(ultimoPedido.valor_total || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    const nomes = { pix: "Pix", cartao: "Cartao", dinheiro: "Dinheiro", pagamento_na_retirada: "Pagamento na retirada" };
    const pagamentoEl = document.getElementById("pagamento");
    pagamentoEl.textContent = `${nomes[ultimoPedido.forma_pagamento] || ultimoPedido.forma_pagamento} - verificando`;
    mensagem.textContent = "Seu pedido foi registrado. A preparacao comeca somente depois da confirmacao do pagamento.";
    const token = localStorage.getItem("token");
    if (!token) return;
    try {
        const resposta = await fetch(`/pedidos/${ultimoPedido.id}/pagamento`, { headers: { Authorization: `Bearer ${token}` } });
        if (!resposta.ok) return;
        const { pagamento } = await resposta.json();
        const status = { pago: "Pago", pendente: "Pendente", recusado: "Recusado", cancelado: "Cancelado", estorno_pendente: "Estorno pendente", estornado: "Estornado" };
        pagamentoEl.textContent = `${nomes[pagamento.metodo] || pagamento.metodo} - ${status[pagamento.status] || pagamento.status}`;
        if (pagamento.status === "pago") mensagem.textContent = "Pagamento confirmado. Seu pedido agora sera preparado pela nossa equipe.";
        else if (pagamento.status === "recusado") mensagem.textContent = "O pagamento foi recusado. Acesse seus pedidos para tentar novamente antes da reserva expirar.";
        else if (pagamento.status === "pendente") mensagem.textContent = "Pedido registrado. Aguardamos a confirmacao do pagamento pelo Mercado Pago.";
    } catch (_) {
        mensagem.textContent = "Pedido registrado. Consulte seu historico para acompanhar a confirmacao do pagamento.";
    }
});
