const API_URL = ["localhost", "127.0.0.1"].includes(location.hostname) ? "http://localhost:3000" : location.origin;
const moeda = valor => Number(valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
let requisicaoAtual = null;

function texto(elemento, valor) { if (elemento) elemento.textContent = valor; }

function renderizarVendas(vendas) {
    const tbody = document.querySelector(".orders-card tbody");
    if (!tbody) return;
    tbody.replaceChildren();
    if (!vendas.length) {
        const linha = tbody.insertRow();
        const celula = linha.insertCell();
        celula.colSpan = 6;
        celula.textContent = "Nenhuma venda paga encontrada neste período.";
        return;
    }
    vendas.forEach(venda => {
        const linha = tbody.insertRow();
        [
            `#${venda.id}`,
            venda.cliente,
            new Date(venda.pago_em).toLocaleDateString("pt-BR"),
            String(venda.forma_pagamento).replaceAll("_", " "),
            String(venda.status).replaceAll("_", " "),
            moeda(venda.valor_total)
        ].forEach(valor => linha.insertCell().textContent = valor);
    });
}

function renderizarEstoqueBaixo(itens) {
    const container = document.querySelector(".dashboard-columns .dashboard-card:nth-child(2) .empty-state");
    if (!container) return;
    container.replaceChildren();
    if (!itens.length) {
        const icone = document.createElement("div"); icone.className = "empty-icon"; icone.textContent = "✓";
        const titulo = document.createElement("strong"); titulo.textContent = "Tudo certo por aqui";
        const descricao = document.createElement("p"); descricao.textContent = "Nenhum produto com estoque baixo.";
        container.append(icone, titulo, descricao);
        return;
    }
    const lista = document.createElement("ul"); lista.className = "low-stock-list";
    itens.forEach(item => {
        const linha = document.createElement("li");
        const nome = document.createElement("strong"); nome.textContent = item.nome;
        linha.append(nome, document.createTextNode(` ${item.cor}/${item.tamanho}: ${item.quantidade}`));
        lista.appendChild(linha);
    });
    container.appendChild(lista);
}

function renderizarGrafico(pontos) {
    const container = document.getElementById("dashboardChart");
    if (!container) return;
    container.replaceChildren();
    if (!pontos.length) {
        const vazio = document.createElement("p"); vazio.className = "chart-empty"; vazio.textContent = "Sem vendas pagas no período.";
        container.appendChild(vazio);
        return;
    }
    const maximo = Math.max(...pontos.map(ponto => Number(ponto.faturamento)), 1);
    pontos.forEach(ponto => {
        const coluna = document.createElement("div"); coluna.className = "chart-column";
        coluna.title = `${new Date(ponto.data).toLocaleDateString("pt-BR", { timeZone: "UTC" })}: ${moeda(ponto.faturamento)}`;
        const barra = document.createElement("div"); barra.className = "chart-bar";
        barra.style.height = `${Math.max(4, (Number(ponto.faturamento) / maximo) * 100)}%`;
        const rotulo = document.createElement("span");
        rotulo.textContent = new Date(ponto.data).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
        coluna.append(barra, rotulo); container.appendChild(coluna);
    });
}

async function carregarDashboard(periodo) {
    const token = localStorage.getItem("token");
    if (!token) return window.location.replace("../login.html");
    if (requisicaoAtual) requisicaoAtual.abort();
    requisicaoAtual = new AbortController();
    const seletor = document.getElementById("filtroPeriodoDashboard");
    if (seletor) seletor.disabled = true;
    try {
        const resposta = await fetch(`${API_URL}/dashboard?periodo=${encodeURIComponent(periodo)}`, {
            headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: requisicaoAtual.signal
        });
        if ([401, 403].includes(resposta.status)) return window.location.replace("../login.html");
        if (!resposta.ok) throw new Error("Falha ao carregar dashboard");
        const dados = await resposta.json();
        texto(document.getElementById("dashboardFaturamento"), moeda(dados.resumo.faturamento));
        texto(document.getElementById("dashboardVendas"), Number(dados.resumo.vendas));
        texto(document.getElementById("dashboardDespesas"), moeda(dados.resumo.despesas));
        texto(document.getElementById("dashboardLucro"), moeda(dados.resumo.lucro));
        texto(document.getElementById("dashboardProdutosVendidos"), Number(dados.resumo.produtos_vendidos));
        texto(document.getElementById("dashboardTicketMedio"), moeda(dados.resumo.ticket_medio));
        texto(document.getElementById("dashboardEstoque"), `${Number(dados.resumo.itens_estoque)} itens`);
        texto(document.getElementById("dashboardClientes"), Number(dados.resumo.clientes));
        texto(document.getElementById("dashboardChartTotal"), moeda(dados.resumo.faturamento));
        const nomePeriodo = seletor?.options[seletor.selectedIndex]?.text || "Período";
        document.querySelectorAll(".dashboard-period-label,.card-period").forEach(el => el.textContent = nomePeriodo);
        renderizarVendas(dados.pedidos_recentes || []);
        renderizarEstoqueBaixo(dados.estoque_baixo || []);
        renderizarGrafico(dados.grafico || []);
    } catch (erro) {
        if (erro.name !== "AbortError") {
            const tbody = document.querySelector(".orders-card tbody");
            if (tbody) { tbody.replaceChildren(); const linha = tbody.insertRow(); const celula = linha.insertCell(); celula.colSpan = 6; celula.textContent = "Não foi possível carregar o dashboard."; }
        }
    } finally {
        if (seletor) seletor.disabled = false;
    }
}

document.addEventListener("DOMContentLoaded", () => {
    const seletor = document.getElementById("filtroPeriodoDashboard");
    if (!seletor) return;
    seletor.addEventListener("change", () => carregarDashboard(seletor.value));
    carregarDashboard(seletor.value);
});
