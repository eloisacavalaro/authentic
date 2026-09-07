const API_URL = ["localhost", "127.0.0.1"].includes(location.hostname) ? "http://localhost:3000" : location.origin;
let estoque = [];
let produtos = [];

/* =========================================
   CARREGAR PRODUTOS (PARA O SELECT DO MODAL)
========================================= */
async function carregarProdutos() {
    try {
        const resposta = await fetch(`${API_URL}/produtos`);
        if (!resposta.ok) {
            throw new Error("Erro ao carregar produtos.");
        }

        produtos = await resposta.json();
        const select = document.getElementById("produto");

        select.innerHTML = `<option value="">Selecione um produto</option>`;

        produtos.forEach(produto => {
            const option = document.createElement("option");
            option.value = produto.id;
            option.textContent = produto.nome;
            select.appendChild(option);
        });

    } catch (erro) {
        console.error("Erro ao carregar produtos:", erro);
    }
}

/* =========================================
   CARREGAR ESTOQUE
========================================= */
async function carregarEstoque() {
    try {
        const resposta = await fetch(`${API_URL}/estoque`, { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } });
        if (!resposta.ok) {
            throw new Error("Erro ao carregar estoque.");
        }

        estoque = await resposta.json();
        renderizarEstoque(estoque);

    } catch (erro) {
        console.error("Erro ao carregar estoque:", erro);

        document.getElementById("stock-table-body").innerHTML = `
            <tr>
                <td colspan="6">
                    <div class="stock-empty">
                        <strong>Não foi possível carregar o estoque.</strong>
                        <p>Verifique se o servidor está funcionando.</p>
                    </div>
                </td>
            </tr>
        `;
    }
}

/* =========================================
   RENDERIZAR ESTOQUE NA TABELA
========================================= */
function renderizarEstoque(lista) {
    const tabela = document.getElementById("stock-table-body");
    const contador = document.getElementById("contador");
    const totalProdutos = document.getElementById("total-produtos");
    const totalVariacoes = document.getElementById("total-variacoes");
    const estoqueBaixo = document.getElementById("estoque-baixo");
    const semEstoque = document.getElementById("sem-estoque");

    contador.textContent = `${lista.length} ${lista.length === 1 ? "variação" : "variações"}`;

    const produtosUnicos = new Set(lista.map(item => item.produto_id));
    totalProdutos.textContent = produtosUnicos.size;
    totalVariacoes.textContent = lista.length;

    estoqueBaixo.textContent = lista.filter(
        item => Number(item.quantidade) > 0 && Number(item.quantidade) <= 5
    ).length;

    semEstoque.textContent = lista.filter(
        item => Number(item.quantidade) === 0
    ).length;

    tabela.innerHTML = "";

    if (lista.length === 0) {
        tabela.innerHTML = `
            <tr>
                <td colspan="6">
                    <div class="stock-empty">
                        <strong>Nenhuma variação encontrada.</strong>
                        <p>Adicione um item ao estoque ou altere sua busca.</p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    lista.forEach(item => {
        const quantidade = Number(item.quantidade);

        let classeQuantidade = "";
        let classeStatus = "";
        let textoStatus = "";

        if (quantidade === 0) {
            classeQuantidade = "empty";
            classeStatus = "empty";
            textoStatus = "Sem estoque";
        } else if (quantidade <= 5) {
            classeQuantidade = "low";
            classeStatus = "low";
            textoStatus = "Estoque baixo";
        } else {
            classeStatus = "normal";
            textoStatus = "Disponível";
        }

        const linha = document.createElement("tr");

        linha.innerHTML = `
            <td>
                <div class="stock-product">
                    <div class="stock-product-image">
                        ${item.imagem 
                            ? `<img src="${API_URL}/images/produtos/${item.imagem}" alt="${item.produto}">` 
                            : "IMG"}
                    </div>
                    <div class="stock-product-info">
                        <strong>${item.produto}</strong>
                        <small>Produto #${item.produto_id}</small>
                    </div>
                </div>
            </td>
            <td>${item.tamanho}</td>
            <td>${item.cor}</td>
            <td>
                <span class="stock-quantity ${classeQuantidade}">
                    ${quantidade}
                </span>
            </td>
            <td>
                <span class="stock-status ${classeStatus}">
                    ${textoStatus}
                </span>
            </td>
            <td>
                <button class="stock-action" onclick="alterarEstoque(${item.id}, ${quantidade})">
                    Editar
                </button>
            </td>
        `;

        tabela.appendChild(linha);
    });
}

/* =========================================
   BUSCA EM TEMPO REAL
========================================= */
const campoBusca = document.getElementById("busca");
if (campoBusca) {
    campoBusca.addEventListener("input", () => {
        const termo = campoBusca.value.trim().toLowerCase();
        const filtrados = estoque.filter(item => 
            (item.produto && item.produto.toLowerCase().includes(termo)) ||
            (item.cor && item.cor.toLowerCase().includes(termo)) ||
            (item.tamanho && item.tamanho.toLowerCase().includes(termo))
        );
        renderizarEstoque(filtrados);
    });
}

/* =========================================
   ADICIONAR ESTOQUE (FORMULÁRIO MODAL)
========================================= */
const formularioEstoque = document.getElementById("stock-form");

formularioEstoque.addEventListener("submit", async (event) => {
    event.preventDefault();

    const produto_id = document.getElementById("produto").value;
    const tamanho = document.getElementById("tamanho").value;
    const cor = document.getElementById("cor").value;
    const quantidade = Number(document.getElementById("quantidade").value);

    if (!produto_id || !tamanho || !cor) {
        alert("Preencha todos os campos.");
        return;
    }

    if (!Number.isInteger(quantidade) || quantidade < 0) {
        alert("Digite uma quantidade válida.");
        return;
    }

    try {
        const token = localStorage.getItem("token");

        const resposta = await fetch(`${API_URL}/estoque`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({
                produto_id: Number(produto_id),
                tamanho,
                cor,
                quantidade
            })
        });

        const dados = await resposta.json();

        if (!resposta.ok) {
            throw new Error(dados.erro || "Erro ao adicionar estoque.");
        }

        alert("Estoque adicionado com sucesso!");
        fecharModal();
        formularioEstoque.reset();
        carregarEstoque();

    } catch (erro) {
        console.error(erro);
        alert(erro.message);
    }
});

/* =========================================
   CONTROLE DO MODAL
========================================= */
const modal = document.getElementById("stock-modal");
const abrirModalBotao = document.getElementById("abrir-modal");
const fecharModalBotao = document.getElementById("botao-fechar-modal");
const cancelarModalBotao = document.getElementById("cancelar-modal");
const overlay = document.getElementById("fechar-modal");

function abrirModal() {
    modal.classList.add("active");
}

function fecharModal() {
    modal.classList.remove("active");
}

if (abrirModalBotao) {
    abrirModalBotao.addEventListener("click", () => {
        abrirModal();
        carregarProdutos();
    });
}

if (fecharModalBotao) fecharModalBotao.addEventListener("click", fecharModal);
if (cancelarModalBotao) cancelarModalBotao.addEventListener("click", fecharModal);
if (overlay) overlay.addEventListener("click", fecharModal);

/* =========================================
   ALTERAR QUANTIDADE (PROMPT SIMPLES)
========================================= */
async function alterarEstoque(id, quantidadeAtual) {
    const novaQuantidade = prompt("Digite a nova quantidade:", quantidadeAtual);

    if (novaQuantidade === null) return;

    const quantidade = Number(novaQuantidade);

    if (!Number.isInteger(quantidade) || quantidade < 0) {
        alert("Digite uma quantidade válida.");
        return;
    }

    try {
        const token = localStorage.getItem("token");

        const resposta = await fetch(`${API_URL}/estoque/${id}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({ quantidade })
        });

        const dados = await resposta.json();

        if (!resposta.ok) {
            throw new Error(dados.erro || "Erro ao atualizar estoque.");
        }

        alert("Estoque atualizado com sucesso!");
        carregarEstoque();

    } catch (erro) {
        console.error(erro);
        alert(erro.message);
    }
}

/* =========================================
   INICIALIZAÇÃO
========================================= */
document.addEventListener("DOMContentLoaded", () => {
    carregarEstoque();
    carregarProdutos();
});
