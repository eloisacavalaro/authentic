const API_URL = ["localhost", "127.0.0.1"].includes(location.hostname) ? "http://localhost:3000" : location.origin;

const token = localStorage.getItem("token");
if (!token) {
    window.location.href = "login.html";
}

const periodoRelatorio = document.getElementById("periodoRelatorio");
const dataInicial = document.getElementById("dataInicial");
const dataFinal = document.getElementById("dataFinal");
const btnGerarRelatorio = document.getElementById("btnGerarRelatorio");
const camposPersonalizados = document.querySelectorAll(".campo-personalizado");

// =========================================================
// CONTROLE DE CAMPO PERSONALIZADO
// =========================================================
if (periodoRelatorio) {
    periodoRelatorio.addEventListener("change", () => {
        const personalizado = periodoRelatorio.value === "personalizado";
        camposPersonalizados.forEach(campo => {
            campo.style.display = personalizado ? "flex" : "none";
        });
    });
}

function formatarMoeda(valor) {
    return Number(valor || 0).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL"
    });
}

// =========================================================
// CARREGAR DADOS DO RELATÓRIO
// =========================================================
async function carregarRelatorio() {
    try {
        let url = `${API_URL}/relatorios?periodo=${periodoRelatorio ? periodoRelatorio.value : '30'}`;

        if (periodoRelatorio && periodoRelatorio.value === "personalizado") {
            if (!dataInicial.value || !dataFinal.value) {
                alert("Informe a data inicial e a data final.");
                return;
            }
            url += `&data_inicial=${dataInicial.value}&data_final=${dataFinal.value}`;
        }

        const resposta = await fetch(url, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        if (resposta.status === 401 || resposta.status === 403) {
            localStorage.removeItem("token");
            window.location.href = "login.html";
            return;
        }

        if (!resposta.ok) {
            throw new Error("Erro na rota /relatorios");
        }

        const dados = await resposta.json();

        preencherResumo(dados);
        preencherPagamentos(dados);
        preencherProdutos(dados);
        preencherEstoque(dados);

    } catch (erro) {
        console.error("Erro ao obter relatórios:", erro);
    }
}

function preencherResumo(dados) {
    const elFat = document.getElementById("relatorioFaturamento");
    const elVen = document.getElementById("relatorioVendas");
    const elDes = document.getElementById("relatorioDespesas");
    const elRes = document.getElementById("relatorioResultado");

    if (elFat) elFat.textContent = formatarMoeda(dados.faturamento);
    if (elVen) elVen.textContent = dados.vendas || 0;
    if (elDes) elDes.textContent = formatarMoeda(dados.despesas);
    if (elRes) elRes.textContent = formatarMoeda(dados.resultado_liquido);
}

function preencherPagamentos(dados) {
    const elPix = document.getElementById("relatorioPix");
    const elCar = document.getElementById("relatorioCartao");
    const elRet = document.getElementById("relatorioRetirada");

    if (elPix) elPix.textContent = dados.pagamentos?.pix || 0;
    if (elCar) elCar.textContent = dados.pagamentos?.cartao || 0;
    if (elRet) elRet.textContent = dados.pagamentos?.retirada || 0;
}

function preencherProdutos(dados) {
    const tabela = document.getElementById("produtosMaisVendidos");
    if (!tabela) return;
    
    tabela.innerHTML = "";

    if (!dados.produtos_mais_vendidos || dados.produtos_mais_vendidos.length === 0) {
        tabela.innerHTML = `
            <tr>
                <td colspan="4" class="table-loading">
                    Nenhum produto vendido no período selecionado.
                </td>
            </tr>
        `;
        return;
    }

    dados.produtos_mais_vendidos.forEach(p => {
        const linha = document.createElement("tr");
        linha.innerHTML = `
            <td><strong>${p.nome}</strong></td>
            <td>${p.categoria || "—"}</td>
            <td>${p.quantidade}</td>
            <td><strong>${formatarMoeda(p.faturamento)}</strong></td>
        `;
        tabela.appendChild(linha);
    });
}

function preencherEstoque(dados) {
    const elEst = document.getElementById("relatorioEstoque");
    const elBai = document.getElementById("relatorioEstoqueBaixo");
    const elSem = document.getElementById("relatorioSemEstoque");

    if (elEst) elEst.textContent = dados.estoque?.total || 0;
    if (elBai) elBai.textContent = dados.estoque?.baixo || 0;
    if (elSem) elSem.textContent = dados.estoque?.sem_estoque || 0;
}

if (btnGerarRelatorio) {
    btnGerarRelatorio.addEventListener("click", carregarRelatorio);
}

document.addEventListener("DOMContentLoaded", carregarRelatorio);
