const API_URL = ["localhost", "127.0.0.1"].includes(location.hostname) ? "http://localhost:3000" : location.origin;

const modal = document.getElementById("modalDespesa");
const btnNovaDespesa = document.getElementById("btnNovaDespesa");
const fecharModal = document.getElementById("fecharModal");
const cancelarDespesa = document.getElementById("cancelarDespesa");

const formDespesa = document.getElementById("formDespesa");

const listaDespesas = document.getElementById("listaDespesas");
const cardTotalDespesas = document.getElementById("cardTotalDespesas");
const despesasMes = document.getElementById("despesasMes");
const totalDespesasContador = document.getElementById("totalDespesasContador");
const emptyState = document.getElementById("emptyState");

const buscarDespesa = document.getElementById("buscarDespesa");

let todasAsDespesas = [];

// =========================================================
// ABRIR / FECHAR MODAL
// =========================================================
if (btnNovaDespesa) {
    btnNovaDespesa.addEventListener("click", () => {
        modal.classList.add("active");
    });
}

if (fecharModal) fecharModal.addEventListener("click", fecharModalDespesa);
if (cancelarDespesa) cancelarDespesa.addEventListener("click", fecharModalDespesa);

function fecharModalDespesa() {
    modal.classList.remove("active");
    formDespesa.reset();
}

// =========================================================
// CARREGAR DESPESAS
// =========================================================
async function carregarDespesas() {
    const token = localStorage.getItem("token");

    if (!token) {
        window.location.href = "../login.html";
        return;
    }

    try {
        const resposta = await fetch(`${API_URL}/despesas`, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        if (!resposta.ok) {
            if (resposta.status === 401) {
                localStorage.removeItem("token");
                localStorage.removeItem("usuario");
                window.location.href = "../login.html";
                return;
            }
            throw new Error("Erro ao carregar despesas.");
        }

        const dados = await resposta.json();
        todasAsDespesas = Array.isArray(dados) ? dados : (dados.despesas || []);

        atualizarResumo();
        renderizarDespesas(todasAsDespesas);

    } catch (erro) {
        console.error("Erro ao carregar despesas:", erro);
        listaDespesas.innerHTML = `
            <tr>
                <td colspan="5" class="table-loading" style="color: #b91c1c;">
                    Não foi possível conectar ao servidor.
                </td>
            </tr>
        `;
    }
}

// =========================================================
// RESUMO
// =========================================================
function atualizarResumo() {
    const total = todasAsDespesas.reduce(
        (soma, despesa) => soma + Number(despesa.valor || 0),
        0
    );

    const agora = new Date();
    const mesAtual = agora.getMonth();
    const anoAtual = agora.getFullYear();

    const totalMes = todasAsDespesas.reduce((soma, despesa) => {
        const data = new Date(despesa.data_despesa);
        if (
            data.getMonth() === mesAtual &&
            data.getFullYear() === anoAtual
        ) {
            return soma + Number(despesa.valor || 0);
        }
        return soma;
    }, 0);

    if (cardTotalDespesas) cardTotalDespesas.textContent = formatarMoeda(total);
    if (despesasMes) despesasMes.textContent = formatarMoeda(totalMes);
}

// =========================================================
// RENDERIZAR
// =========================================================
function renderizarDespesas(despesas) {
    if (totalDespesasContador) totalDespesasContador.textContent = despesas.length;

    if (despesas.length === 0) {
        listaDespesas.innerHTML = "";
        if (emptyState) emptyState.style.display = "block";
        return;
    }

    if (emptyState) emptyState.style.display = "none";

    listaDespesas.innerHTML = despesas.map(despesa => {
        return `
            <tr>
                <td>
                    <strong>${despesa.descricao}</strong>
                </td>
                <td>${despesa.categoria}</td>
                <td>${formatarData(despesa.data_despesa)}</td>
                <td>
                    <strong>${formatarMoeda(despesa.valor)}</strong>
                </td>
                <td>
                    <button class="delete-button" onclick="excluirDespesa(${despesa.id})">
                        Excluir
                    </button>
                </td>
            </tr>
        `;
    }).join("");
}

// =========================================================
// CADASTRAR DESPESA
// =========================================================
if (formDespesa) {
    formDespesa.addEventListener("submit", async (event) => {
        event.preventDefault();

        const token = localStorage.getItem("token");

        const dados = {
            descricao: document.getElementById("descricao").value.trim(),
            categoria: document.getElementById("categoria").value,
            valor: Number(document.getElementById("valor").value),
            data_despesa: document.getElementById("dataDespesa").value,
            observacoes: document.getElementById("observacoes").value.trim()
        };

        try {
            const resposta = await fetch(`${API_URL}/despesas`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify(dados)
            });

            const resultado = await resposta.json();

            if (!resposta.ok) {
                alert(resultado.erro || "Não foi possível cadastrar a despesa.");
                return;
            }

            alert("Despesa cadastrada com sucesso!");
            fecharModalDespesa();
            carregarDespesas();

        } catch (erro) {
            console.error("Erro ao cadastrar despesa:", erro);
            alert("Não foi possível conectar ao servidor.");
        }
    });
}

// =========================================================
// EXCLUIR DESPESA
// =========================================================
async function excluirDespesa(id) {
    const confirmar = confirm("Deseja realmente excluir esta despesa?");
    if (!confirmar) return;

    const token = localStorage.getItem("token");

    try {
        const resposta = await fetch(`${API_URL}/despesas/${id}`, {
            method: "DELETE",
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        const resultado = await resposta.json();

        if (!resposta.ok) {
            alert(resultado.erro || "Não foi possível excluir a despesa.");
            return;
        }

        carregarDespesas();

    } catch (erro) {
        console.error("Erro ao excluir despesa:", erro);
        alert("Não foi possível conectar ao servidor.");
    }
}

// =========================================================
// PESQUISA
// =========================================================
if (buscarDespesa) {
    buscarDespesa.addEventListener("input", () => {
        const termo = buscarDespesa.value.trim().toLowerCase();
        const filtradas = todasAsDespesas.filter(despesa => {
            return (
                (despesa.descricao && despesa.descricao.toLowerCase().includes(termo)) ||
                (despesa.categoria && despesa.categoria.toLowerCase().includes(termo))
            );
        });
        renderizarDespesas(filtradas);
    });
}

// =========================================================
// FORMATADORES
// =========================================================
function formatarMoeda(valor) {
    return Number(valor || 0).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL"
    });
}

function formatarData(data) {
    if (!data) return "—";
    return new Date(data).toLocaleDateString("pt-BR");
}

document.addEventListener("DOMContentLoaded", carregarDespesas);
