const API_URL = window.AUTHENTIC_API_URL;

async function carregarProdutos() {
    try {
        const resposta = await apiFetch(`${API_URL}/admin/produtos`, { cache: "no-store" });

        if (!resposta.ok) {
            throw new Error("Erro ao carregar produtos.");
        }

        const produtos = await resposta.json();

        const tabela = document.querySelector(".products-table tbody");
        const contador = document.querySelector(".products-card-header span");

        contador.textContent =
            `${produtos.length} ${produtos.length === 1 ? "produto" : "produtos"}`;

        tabela.safeHTML = "";

        if (produtos.length === 0) {
            tabela.safeHTML = `
                <tr>
                    <td colspan="6">
                        <div class="products-empty">

                            <div class="products-empty-icon">
                                □
                            </div>

                            <strong>
                                Nenhum produto cadastrado
                            </strong>

                            <p>
                                Comece adicionando o primeiro produto da sua loja.
                            </p>

                            <a href="novo-produto.html" class="empty-button">
                                + Adicionar produto
                            </a>

                        </div>
                    </td>
                </tr>
            `;

            return;
        }

        produtos.forEach(produto => {

            const linha = document.createElement("tr");
            linha.dataset.nome = String(produto.nome || "").toLocaleLowerCase("pt-BR");
            linha.dataset.categoria = String(produto.categoria || "").toLocaleLowerCase("pt-BR");
            linha.dataset.status = produto.ativo ? "ativo" : "inativo";

            linha.safeHTML = `
                <td>
                    <div class="product-table-name">

                        <div class="product-table-image">
                           ${
                                produto.imagem
                                    ? `<img
                                            src="${window.AUTHENTIC_PRODUCT_IMAGE_URL(produto.imagem)}"
                                            alt="${produto.nome}"
                                    >`
                                    : "IMG"
                            }
                        </div>

                        <div>
                            <strong>${produto.nome}</strong>
                            <small>#${produto.id}</small>
                        </div>

                    </div>
                </td>

                <td>
                    ${produto.categoria || "-"}
                </td>

                <td>
                    R$ ${Number(produto.preco)
                        .toFixed(2)
                        .replace(".", ",")}
                </td>

                <td>
                    <span class="stock-value">
                        —
                    </span>
                </td>

                <td>
                    <span class="status-badge ${produto.ativo ? "ativo" : "inativo"}">
                        ${produto.ativo ? "Ativo" : "Inativo"}
                    </span>
                </td>

                <td>
                    <a class="action-button" href="novo-produto.html?id=${produto.id}">Editar</a>
                    <button class="action-button" type="button" data-disable-product="${produto.id}" title="Desativar produto">
                        ⋮
                    </button>
                </td>
            `;

            tabela.appendChild(linha);
        });
        aplicarFiltrosProdutos();

    } catch (erro) {

        console.error("Erro ao carregar produtos:", erro);

        const tabela = document.querySelector(".products-table tbody");

        tabela.safeHTML = `
            <tr>
                <td colspan="6">
                    <div class="products-empty">
                        <strong>
                            Não foi possível carregar os produtos.
                        </strong>

                        <p>
                            Verifique se o servidor está funcionando.
                        </p>
                    </div>
                </td>
            </tr>
        `;
    }
}

async function desativarProduto(id) {
    if (!confirm("Deseja desativar este produto?")) return;
    const resposta = await apiFetch(`${API_URL}/produtos/${id}`, { method: "DELETE", headers: {} });
    const dados = await resposta.json();
    if (!resposta.ok) return alert(dados.erro || "Não foi possível desativar.");
    carregarProdutos();
}

function categoriaEquivalente(valor) {
    const categoria = String(valor || "").toLocaleLowerCase("pt-BR")
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/s$/, "");
    return categoria === "camisa" ? "camiseta" : categoria;
}

function aplicarFiltrosProdutos() {
    const tabela = document.querySelector(".products-table tbody");
    if (!tabela) return;
    const busca = String(document.getElementById("buscaProduto")?.value || "").trim().toLocaleLowerCase("pt-BR");
    const categoria = categoriaEquivalente(document.getElementById("filtroCategoria")?.value);
    const status = document.getElementById("filtroStatus")?.value || "";
    let visiveis = 0;
    tabela.querySelectorAll("tr[data-status]").forEach(linha => {
        const correspondeBusca = !busca || linha.dataset.nome.includes(busca);
        const correspondeCategoria = !categoria || categoriaEquivalente(linha.dataset.categoria) === categoria;
        const correspondeStatus = !status || linha.dataset.status === status;
        linha.hidden = !(correspondeBusca && correspondeCategoria && correspondeStatus);
        if (!linha.hidden) visiveis++;
    });
    const contador = document.querySelector(".products-card-header span");
    if (contador) contador.textContent = `${visiveis} ${visiveis === 1 ? "produto" : "produtos"}`;
}

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("buscaProduto")?.addEventListener("input", aplicarFiltrosProdutos);
    document.getElementById("filtroCategoria")?.addEventListener("change", aplicarFiltrosProdutos);
    document.getElementById("filtroStatus")?.addEventListener("change", aplicarFiltrosProdutos);
    carregarProdutos();
});
document.addEventListener("click", evento => {
    const botao = evento.target.closest("[data-disable-product]");
    if (botao) desativarProduto(Number(botao.dataset.disableProduct));
});
