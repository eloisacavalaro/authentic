const API_URL = ["localhost", "127.0.0.1"].includes(location.hostname) ? "http://localhost:3000" : location.origin;

const faturamento = document.getElementById("faturamento");
const totalVendas = document.getElementById("totalVendas");
const ticketMedio = document.getElementById("ticketMedio");
const totalDespesas = document.getElementById("totalDespesas");

const resultadoReceitas = document.getElementById("resultadoReceitas");
const resultadoDespesas = document.getElementById("resultadoDespesas");
const resultadoLiquido = document.getElementById("resultadoLiquido");

const pixQuantidade = document.getElementById("pixQuantidade");
const pixValor = document.getElementById("pixValor");

const cartaoQuantidade = document.getElementById("cartaoQuantidade");
const cartaoValor = document.getElementById("cartaoValor");

const retiradaQuantidade = document.getElementById("retiradaQuantidade");
const retiradaValor = document.getElementById("retiradaValor");

const listaMovimentacoes = document.getElementById("listaMovimentacoes");
const filtroPeriodo = document.getElementById("filtroPeriodo");

// =========================================================
// FORMATAR MOEDA
// =========================================================
function formatarMoeda(valor) {
    return Number(valor || 0).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL"
    });
}

// =========================================================
// FORMATAR STATUS
// =========================================================
function formatarStatus(status) {
    const nomes = {
        aguardando_pagamento: "Aguardando pagamento",
        pendente: "Pendente",
        processando: "Processando",
        enviado: "Enviado",
        concluido: "Concluído",
        cancelado: "Cancelado"
    };

    return nomes[status] || status;
}

// =========================================================
// FORMATAR PAGAMENTO
// =========================================================
function formatarPagamento(pagamento) {
    const nomes = {
        pix: "Pix",
        cartao: "Cartão",
        pagamento_na_retirada: "Pagamento na retirada"
    };

    return nomes[pagamento] || pagamento;
}

// =========================================================
// FORMATAR DATA
// =========================================================
function formatarData(data) {
    if (!data) return "—";
    return new Date(data).toLocaleDateString("pt-BR");
}

// =========================================================
// CARREGAR FINANCEIRO
// =========================================================
async function carregarFinanceiro(periodo = "30") {
    const token = localStorage.getItem("token");

    if (!token) {
        alert("Você precisa estar logado como administrador.");
        window.location.href = "../login.html";
        return;
    }

    try {
        const url = periodo 
            ? `${API_URL}/financeiro?periodo=${encodeURIComponent(periodo)}` 
            : `${API_URL}/financeiro`;

        const resposta = await fetch(url, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        if (!resposta.ok) {
            if (resposta.status === 401) {
                alert("Sessão expirada. Faça login novamente.");
                localStorage.removeItem("token");
                localStorage.removeItem("usuario");
                window.location.href = "../login.html";
                return;
            }

            if (resposta.status === 403) {
                alert("Acesso permitido apenas para administradores.");
                return;
            }

            throw new Error("Erro ao buscar dados financeiros.");
        }

        const dados = await resposta.json();

        // Atualiza a legenda dos cards de período
        if (filtroPeriodo && filtroPeriodo.tagName === "SELECT") {
            const textoPeriodo = filtroPeriodo.options[filtroPeriodo.selectedIndex].text;
            document.querySelectorAll(".card-period").forEach(el => {
                el.textContent = textoPeriodo;
            });
        }

        // CARDS
        faturamento.textContent = formatarMoeda(dados.faturamento);
        totalVendas.textContent = dados.total_vendas;
        ticketMedio.textContent = formatarMoeda(dados.ticket_medio);
        totalDespesas.textContent = formatarMoeda(dados.despesas);

        // RESULTADO FINANCEIRO
        resultadoReceitas.textContent = formatarMoeda(dados.faturamento);
        resultadoDespesas.textContent = formatarMoeda(dados.despesas);
        resultadoLiquido.textContent = formatarMoeda(dados.resultado_liquido);

        // PAGAMENTOS
        const pagamentos = dados.pagamentos || {};
        const pix = pagamentos.pix || { quantidade: 0, valor: 0 };
        const cartao = pagamentos.cartao || { quantidade: 0, valor: 0 };
        const retirada = pagamentos.pagamento_na_retirada || { quantidade: 0, valor: 0 };

        pixQuantidade.textContent = `${pix.quantidade} ${pix.quantidade === 1 ? "venda" : "vendas"}`;
        pixValor.textContent = formatarMoeda(pix.valor);

        cartaoQuantidade.textContent = `${cartao.quantidade} ${cartao.quantidade === 1 ? "venda" : "vendas"}`;
        cartaoValor.textContent = formatarMoeda(cartao.valor);

        retiradaQuantidade.textContent = `${retirada.quantidade} ${retirada.quantidade === 1 ? "venda" : "vendas"}`;
        retiradaValor.textContent = formatarMoeda(retirada.valor);

        // MOVIMENTAÇÕES
        renderizarMovimentacoes(dados.movimentacoes || []);

    } catch (erro) {
        console.error("Erro ao carregar financeiro:", erro);

        listaMovimentacoes.innerHTML = `
            <tr class="empty-row">
                <td colspan="6">
                    <div class="table-empty">
                        <div>!</div>
                        <strong>Não foi possível carregar os dados</strong>
                        <p>Verifique se o servidor está funcionando.</p>
                    </div>
                </td>
            </tr>
        `;
    }
}

// =========================================================
// RENDERIZAR MOVIMENTAÇÕES
// =========================================================
function renderizarMovimentacoes(movimentacoes) {
    if (movimentacoes.length === 0) {
        listaMovimentacoes.innerHTML = `
            <tr class="empty-row">
                <td colspan="6">
                    <div class="table-empty">
                        <div>R$</div>
                        <strong>Nenhuma movimentação</strong>
                        <p>As vendas realizadas aparecerão aqui.</p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    listaMovimentacoes.innerHTML = movimentacoes.map(movimentacao => {
        return `
            <tr>
                <td>#${movimentacao.id}</td>
                <td>${movimentacao.cliente}</td>
                <td>${formatarData(movimentacao.criado_em)}</td>
                <td>${formatarPagamento(movimentacao.forma_pagamento)}</td>
                <td>${formatarStatus(movimentacao.status)}</td>
                <td>
                    <strong>
                        ${formatarMoeda(movimentacao.valor_total)}
                    </strong>
                </td>
            </tr>
        `;
    }).join("");
}

// =========================================================
// LISTENERS & INÍCIO
// =========================================================
if (filtroPeriodo) {
    filtroPeriodo.addEventListener("change", (e) => {
        carregarFinanceiro(e.target.value);
    });
}

carregarFinanceiro(filtroPeriodo ? filtroPeriodo.value : "30");
