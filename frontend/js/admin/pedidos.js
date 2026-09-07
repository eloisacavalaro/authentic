const API_URL = ["localhost", "127.0.0.1"].includes(location.hostname) ? "http://localhost:3000" : location.origin;

const listaPedidos = document.getElementById("listaPedidos");
const totalPedidos = document.getElementById("totalPedidos");
const emptyState = document.getElementById("emptyState");
const buscarPedido = document.getElementById("buscarPedido");
const botoesFiltro = document.querySelectorAll(".filter-btn");

const elFaturamentoTotal = document.getElementById("faturamentoTotal");
const elTotalAguardando = document.getElementById("totalAguardando");
const elTotalProcessando = document.getElementById("totalProcessando");
const elTotalConcluidos = document.getElementById("totalConcluidos");

let pedidos = [];
let filtroAtual = "todos";

const MAPA_STATUS = {
    aguardando_pagamento: "Aguardando pagamento",
    pendente: "Pendente",
    processando: "Processando",
    enviado: "Enviado",
    concluido: "Concluído",
    cancelado: "Cancelado"
};

const MAPA_PAGAMENTO = {
    pix: "Pix",
    cartao: "Cartão",
    pagamento_na_retirada: "Na retirada"
};

const MAPA_RECEBIMENTO = {
    retirada: "Retirada",
    entrega: "Entrega"
};

function formatarStatus(status) {
    return MAPA_STATUS[status] || status || "Pendente";
}

function formatarPagamento(pagamento) {
    return MAPA_PAGAMENTO[pagamento] || pagamento || "—";
}

function formatarRecebimento(recebimento) {
    return MAPA_RECEBIMENTO[recebimento] || recebimento || "—";
}

function formatarMoeda(valor) {
    return Number(valor || 0).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL"
    });
}

async function carregarPedidos() {
const token = localStorage.getItem("token");
const escaparHtml = valor => String(valor ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);

    if (!token) {
        alert("Você precisa estar logado como administrador.");
        window.location.href = "login.html";
        return;
    }

    try {
        const resposta = await fetch(`${API_URL}/pedidos`, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        if (!resposta.ok) {
            if (resposta.status === 401) {
                alert("Sessão expirada. Faça login novamente.");
                localStorage.removeItem("token");
                window.location.href = "login.html";
                return;
            }
            throw new Error("Erro ao buscar pedidos.");
        }

        const dados = await resposta.json();
        pedidos = Array.isArray(dados) ? dados : (dados.pedidos || []);

        atualizarMetricas();
        renderizarPedidos();

    } catch (erro) {
        console.error(erro);
        listaPedidos.innerHTML = `
            <tr>
                <td colspan="8" class="table-loading" style="color: #b91c1c;">
                    Não foi possível conectar ao servidor.
                </td>
            </tr>
        `;
    }
}

function atualizarMetricas() {
    const totalFaturado = pedidos.reduce((acc, p) => acc + Number(p.valor_total || p.total || 0), 0);
    const aguardando = pedidos.filter(p => p.status === "aguardando_pagamento" || p.status === "pendente").length;
    const processando = pedidos.filter(p => p.status === "processando" || p.status === "enviado").length;
    const concluidos = pedidos.filter(p => p.status === "concluido").length;

    if (elFaturamentoTotal) elFaturamentoTotal.textContent = formatarMoeda(totalFaturado);
    if (elTotalAguardando) elTotalAguardando.textContent = aguardando;
    if (elTotalProcessando) elTotalProcessando.textContent = processando;
    if (elTotalConcluidos) elTotalConcluidos.textContent = concluidos;
}

function renderizarPedidos() {
    const busca = (buscarPedido.value || "").toLowerCase().trim();

    const pedidosFiltrados = pedidos.filter(pedido => {
        const correspondeStatus =
            filtroAtual === "todos" || pedido.status === filtroAtual;

        const nomeCliente = (pedido.cliente || pedido.cliente_nome || "").toLowerCase();
        const emailCliente = (pedido.email || "").toLowerCase();
        const idStr = String(pedido.id || "");

        const correspondeBusca =
            idStr.includes(busca) ||
            nomeCliente.includes(busca) ||
            emailCliente.includes(busca);

        return correspondeStatus && correspondeBusca;
    });

    totalPedidos.textContent = pedidosFiltrados.length;

    if (pedidosFiltrados.length === 0) {
        listaPedidos.innerHTML = "";
        emptyState.style.display = "block";
        return;
    }

    emptyState.style.display = "none";
    listaPedidos.innerHTML = pedidosFiltrados.map(criarLinhaPedido).join("");
}

function criarLinhaPedido(pedido) {
    const dataObj = new Date(pedido.criado_em || pedido.created_at || new Date());
    const data = dataObj.toLocaleDateString("pt-BR");
    const hora = dataObj.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

    const valor = formatarMoeda(pedido.valor_total || pedido.total || 0);
    const status = (pedido.status || "pendente").toLowerCase();
    const cliente = pedido.cliente || pedido.cliente_nome || "Cliente";

    return `
        <tr>
            <td><span class="order-number">#${pedido.id}</span></td>
            <td>
                <span class="client-name">${escaparHtml(cliente)}</span>
                <span class="client-email">${escaparHtml(pedido.email || "")}</span>
            </td>
            <td>
                ${data}
                <span class="client-email">${hora}</span>
            </td>
            <td><span class="order-value">${valor}</span></td>
            <td>${formatarPagamento(pedido.forma_pagamento)}</td>
            <td>${formatarRecebimento(pedido.forma_recebimento)}</td>
            <td>
                <select
                    class="status-select status-${status}"
                    data-id="${pedido.id}"
                    data-status-atual="${status}"
                    onchange="alterarStatusPedido(this)"
                >
                    <option value="aguardando_pagamento" ${status === "aguardando_pagamento" ? "selected" : ""}>Aguardando pagamento</option>
                    <option value="pendente" ${status === "pendente" ? "selected" : ""}>Pendente</option>
                    <option value="processando" ${status === "processando" ? "selected" : ""}>Processando</option>
                    <option value="enviado" ${status === "enviado" ? "selected" : ""}>Enviado</option>
                    <option value="concluido" ${status === "concluido" ? "selected" : ""}>Concluído</option>
                    <option value="cancelado" ${status === "cancelado" ? "selected" : ""}>Cancelado</option>
                </select>
            </td>
            <td>
                <button class="view-order" onclick="verPedido(${pedido.id})">
                    VER →
                </button>
                ${status === "aguardando_pagamento" ? `<button class="view-order" onclick="confirmarPagamento(${pedido.id})">CONFIRMAR PAGAMENTO</button>` : ""}
            </td>
        </tr>
    `;
}

async function confirmarPagamento(pedidoId) {
    if (!confirm(`Confirma que o pagamento do pedido #${pedidoId} foi realmente recebido?`)) return;
    try {
        const headers = { Authorization: `Bearer ${localStorage.getItem("token")}` };
        const consulta = await fetch(`${API_URL}/pedidos/${pedidoId}/pagamento`, { headers });
        const dadosConsulta = await consulta.json();
        if (!consulta.ok) throw new Error(dadosConsulta.erro || "Pagamento não encontrado.");
        const resposta = await fetch(`${API_URL}/pagamentos/${dadosConsulta.pagamento.id}/status`, {
            method: "PATCH", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ status: "pago" })
        });
        const dados = await resposta.json();
        if (!resposta.ok) throw new Error(dados.erro || "Não foi possível confirmar.");
        await carregarPedidos();
    } catch (erro) { alert(erro.message); }
}

function verPedido(id) {
    const pedido = pedidos.find(p => p.id === id);
    if (!pedido) return;
    alert(`Pedido #${pedido.id}\nCliente: ${pedido.cliente || pedido.cliente_nome || 'Cliente'}\nStatus: ${formatarStatus(pedido.status)}\nTotal: ${formatarMoeda(pedido.valor_total || pedido.total)}`);
}

buscarPedido.addEventListener("input", renderizarPedidos);

botoesFiltro.forEach(botao => {
    botao.addEventListener("click", () => {
        botoesFiltro.forEach(b => b.classList.remove("active"));
        botao.classList.add("active");
        filtroAtual = botao.dataset.status;
        renderizarPedidos();
    });
});

async function alterarStatusPedido(select) {
    const pedidoId = select.dataset.id;
    const novoStatus = select.value;
    const statusAnterior = select.dataset.statusAtual;

    if (novoStatus === statusAnterior) return;

    const confirmar = confirm(`Deseja alterar o pedido #${pedidoId} para "${formatarStatus(novoStatus)}"?`);

    if (!confirmar) {
        select.value = statusAnterior;
        return;
    }

    const token = localStorage.getItem("token");

    if (!token) {
        alert("Sua sessão expirou. Faça login novamente.");
        window.location.href = "../login.html";
        return;
    }

    try {
        select.disabled = true;

        const resposta = await fetch(`${API_URL}/pedidos/${pedidoId}/status`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({ status: novoStatus })
        });

        const dados = await resposta.json();

        if (!resposta.ok) {
            throw new Error(dados.erro || "Não foi possível alterar o status.");
        }

        const pedido = pedidos.find(p => p.id === Number(pedidoId));
        if (pedido) pedido.status = novoStatus;

        select.dataset.statusAtual = novoStatus;
        alert("Status atualizado com sucesso!");

        atualizarMetricas();
        renderizarPedidos();

    } catch (erro) {
        console.error("Erro ao alterar status:", erro);
        alert(erro.message || "Erro ao atualizar o status.");
        select.value = statusAnterior;
        select.disabled = false;
    }
}

document.addEventListener("DOMContentLoaded", carregarPedidos);
