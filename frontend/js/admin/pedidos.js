const API_URL = window.AUTHENTIC_API_URL;

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
const token = window.AUTHENTIC_SESSION;

    if (!token) {
        alert("Você precisa estar logado como administrador.");
        window.location.href = "../login.html";
        return;
    }

    try {
        const resposta = await apiFetch(`${API_URL}/pedidos`, {
            headers: {
            }
        });

        if (!resposta.ok) {
            if ([401, 403].includes(resposta.status)) {
                alert("Sessão expirada. Faça login novamente.");

                window.location.href = "../login.html";
                return;
            }
            const erroApi = await resposta.json().catch(() => ({}));
            throw new Error(`Erro ${resposta.status}: ${erroApi.erro || "não foi possível buscar pedidos."}`);
        }

        const dados = await resposta.json();
        pedidos = Array.isArray(dados) ? dados : (dados.pedidos || []);

        atualizarMetricas();
        renderizarPedidos();

    } catch (erro) {
        console.error("Falha ao carregar pedidos:", erro);
        const linha = document.createElement("tr");
        const celula = document.createElement("td");
        celula.colSpan = 8;
        celula.className = "table-loading";
        celula.style.color = "#b91c1c";
        celula.textContent = erro.message || "Não foi possível carregar os pedidos.";
        linha.appendChild(celula);
        listaPedidos.replaceChildren(linha);
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
        listaPedidos.replaceChildren();
        emptyState.style.display = "block";
        return;
    }

    emptyState.style.display = "none";
    listaPedidos.replaceChildren(...pedidosFiltrados.map(criarLinhaPedido));
}

function criarCelula(texto) {
    const celula = document.createElement("td");
    celula.textContent = String(texto ?? "");
    return celula;
}

function criarTextoComClasse(tag, classe, texto) {
    const elemento = document.createElement(tag);
    elemento.className = classe;
    elemento.textContent = String(texto ?? "");
    return elemento;
}

function criarLinhaPedido(pedido) {
    const dataObj = new Date(pedido.criado_em || pedido.created_at || new Date());
    const data = dataObj.toLocaleDateString("pt-BR");
    const hora = dataObj.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

    const valor = formatarMoeda(pedido.valor_total || pedido.total || 0);
    const statusInformado = String(pedido.status || "pendente").toLowerCase();
    const status = Object.hasOwn(MAPA_STATUS, statusInformado) ? statusInformado : "pendente";
    const cliente = pedido.cliente || pedido.cliente_nome || "Cliente";

    const linha = document.createElement("tr");

    const celulaNumero = document.createElement("td");
    celulaNumero.appendChild(criarTextoComClasse("span", "order-number", `#${pedido.id}`));

    const celulaCliente = document.createElement("td");
    celulaCliente.append(
        criarTextoComClasse("span", "client-name", cliente),
        criarTextoComClasse("span", "client-email", pedido.email || "")
    );

    const celulaData = criarCelula(data);
    celulaData.appendChild(criarTextoComClasse("span", "client-email", hora));

    const celulaValor = document.createElement("td");
    celulaValor.appendChild(criarTextoComClasse("span", "order-value", valor));

    const celulaStatus = document.createElement("td");
    const seletorStatus = document.createElement("select");
    seletorStatus.classList.add("status-select", `status-${status}`);
    seletorStatus.dataset.id = String(pedido.id);
    seletorStatus.dataset.statusAtual = status;
    Object.entries(MAPA_STATUS).forEach(([valorStatus, rotulo]) => {
        const opcao = document.createElement("option");
        opcao.value = valorStatus;
        opcao.textContent = rotulo;
        opcao.selected = valorStatus === status;
        seletorStatus.appendChild(opcao);
    });
    celulaStatus.appendChild(seletorStatus);

    const celulaAcoes = document.createElement("td");
    const botaoVer = document.createElement("button");
    botaoVer.type = "button";
    botaoVer.className = "view-order";
    botaoVer.dataset.viewOrder = String(pedido.id);
    botaoVer.textContent = "VER →";
    celulaAcoes.appendChild(botaoVer);

    if (status === "aguardando_pagamento") {
        const botaoConfirmar = document.createElement("button");
        botaoConfirmar.type = "button";
        botaoConfirmar.className = "view-order";
        botaoConfirmar.dataset.confirmPayment = String(pedido.id);
        botaoConfirmar.textContent = "CONFIRMAR PAGAMENTO";
        celulaAcoes.appendChild(botaoConfirmar);
    }

    linha.append(
        celulaNumero,
        celulaCliente,
        celulaData,
        celulaValor,
        criarCelula(formatarPagamento(pedido.forma_pagamento)),
        criarCelula(formatarRecebimento(pedido.forma_recebimento)),
        celulaStatus,
        celulaAcoes
    );
    return linha;
}

async function confirmarPagamento(pedidoId) {
    if (!confirm(`Confirma que o pagamento do pedido #${pedidoId} foi realmente recebido?`)) return;
    try {
        const headers = {};
        const consulta = await apiFetch(`${API_URL}/pedidos/${pedidoId}/pagamento`, { headers });
        const dadosConsulta = await consulta.json();
        if (!consulta.ok) throw new Error(dadosConsulta.erro || "Pagamento não encontrado.");
        const resposta = await apiFetch(`${API_URL}/pagamentos/${dadosConsulta.pagamento.id}/status`, {
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

    const token = window.AUTHENTIC_SESSION;

    if (!token) {
        alert("Sua sessão expirou. Faça login novamente.");
        window.location.href = "../login.html";
        return;
    }

    try {
        select.disabled = true;

        const resposta = await apiFetch(`${API_URL}/pedidos/${pedidoId}/status`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
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
document.addEventListener("change", evento => {
    if (evento.target.matches(".status-select")) alterarStatusPedido(evento.target);
});
document.addEventListener("click", evento => {
    const ver = evento.target.closest("[data-view-order]");
    const confirmar = evento.target.closest("[data-confirm-payment]");
    if (ver) verPedido(Number(ver.dataset.viewOrder));
    if (confirmar) confirmarPagamento(Number(confirmar.dataset.confirmPayment));
});
