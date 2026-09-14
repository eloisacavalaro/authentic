const API_URL = window.AUTHENTIC_API_URL;

async function carregarProdutos() {
    try {
        const resposta = await apiFetch(`${API_URL}/produtos`);

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

            linha.safeHTML = `
                <td>
                    <div class="product-table-name">

                        <div class="product-table-image">
                           ${
                                produto.imagem
                                    ? `<img
                                            src="${API_URL}/images/produtos/${produto.imagem}"
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
                    <span class="status-badge ativo">
                        Ativo
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

document.addEventListener("DOMContentLoaded", carregarProdutos);
document.addEventListener("click", evento => {
    const botao = evento.target.closest("[data-disable-product]");
    if (botao) desativarProduto(Number(botao.dataset.disableProduct));
});
