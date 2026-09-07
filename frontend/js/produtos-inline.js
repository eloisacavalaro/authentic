const API_URL = window.location.hostname === "localhost" ? "http://localhost:3000" : "";
        const parametros = new URLSearchParams(window.location.search);
        const buscaInicial = parametros.get("buscar");
        const categoriaInicial = parametros.get("categoria");

        const searchInput = document.getElementById("searchInput");
        const sortSelect = document.getElementById("sortSelect");
        const productsGrid = document.getElementById("productsGrid");
        const productCount = document.getElementById("productCount");
        const checkboxes = document.querySelectorAll('.filters input[type="checkbox"]');

        let todosOsProdutos = [];

        // Remove acentos e plurais para comparar de forma uniforme
        function normalizarTexto(txt) {
            if (!txt) return "";
            return txt.toLowerCase()
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .trim()
                .replace(/s$/, ""); // transforma 'camisetas' em 'camiseta'
        }

        if (buscaInicial) searchInput.value = buscaInicial;

        if (categoriaInicial) {
            const catNorm = normalizarTexto(categoriaInicial);
            checkboxes.forEach(chk => {
                if (chk.name === "categoria" && normalizarTexto(chk.value) === catNorm) {
                    chk.checked = true;
                }
            });
        }

        async function carregarProdutos() {
            try {
                const resposta = await fetch(`${API_URL}/produtos`);
                if (!resposta.ok) throw new Error("Erro ao buscar catálogo.");
                todosOsProdutos = await resposta.json();
                aplicarFiltros();
            } catch (erro) {
                console.error(erro);
                productCount.textContent = "Não foi possível carregar os produtos.";
            }
        }

        function renderizarProdutos(produtos) {
            productsGrid.innerHTML = "";
            productCount.textContent = `${produtos.length} ${produtos.length === 1 ? "produto" : "produtos"}`;

            if (produtos.length === 0) {
                productsGrid.innerHTML = `
                    <div style="grid-column: 1 / -1; padding: 60px 0; text-align: center;">
                        <strong style="display:block; margin-bottom: 8px;">Nenhum produto encontrado</strong>
                        <p style="color: #777; font-size: 13px;">Tente ajustar os filtros ou pesquisar por outro termo.</p>
                    </div>
                `;
                return;
            }

            produtos.forEach(produto => {
                const card = document.createElement("article");
                card.className = "product-card";
                card.addEventListener("click", () => {
                    window.location.href = `produto.html?id=${produto.id}`;
                });

                const imagemSrc = produto.imagem
                    ? (produto.imagem.startsWith("http") ? produto.imagem : `${API_URL}/images/produtos/${produto.imagem}`)
                    : null;

                card.innerHTML = `
                    <div class="product-image">
                        ${imagemSrc
                        ? `<img src="${imagemSrc}" alt="${produto.nome}" onerror="this.onerror=null;this.parentElement.innerHTML='<span style=\\'color:#999;font-size:11px;\\'>SEM FOTO</span>';">`
                        : "<span>SEM FOTO</span>"
                    }
                    </div>
                    <div class="product-info">
                        <span class="product-category">${produto.categoria || "Coleção"}</span>
                        <h2>${produto.nome}</h2>
                        <p>R$ ${Number(produto.preco).toFixed(2).replace(".", ",")}</p>
                    </div>
                `;
                productsGrid.appendChild(card);
            });
        }

        function aplicarFiltros() {
            let resultado = [...todosOsProdutos];

            const termo = normalizarTexto(searchInput.value);
            if (termo) {
                resultado = resultado.filter(p =>
                    normalizarTexto(p.nome).includes(termo) ||
                    normalizarTexto(p.categoria).includes(termo)
                );
            }

            const categoriasMarcadas = Array.from(document.querySelectorAll('input[name="categoria"]:checked'))
                .map(c => normalizarTexto(c.value));

            if (categoriasMarcadas.length > 0) {
                resultado = resultado.filter(p => categoriasMarcadas.includes(normalizarTexto(p.categoria)));
            }

            const precosSelecionados = Array.from(document.querySelectorAll('input[name="preco"]:checked')).map(c => c.value);
            if (precosSelecionados.length > 0) {
                resultado = resultado.filter(p => {
                    const preco = Number(p.preco);
                    return precosSelecionados.some(faixa => {
                        if (faixa === "ate-150") return preco <= 150;
                        if (faixa === "150-300") return preco > 150 && preco <= 300;
                        if (faixa === "acima-300") return preco > 300;
                        return false;
                    });
                });
            }

            const ordenacao = sortSelect.value;
            if (ordenacao === "menor-preco") {
                resultado.sort((a, b) => Number(a.preco) - Number(b.preco));
            } else if (ordenacao === "maior-preco") {
                resultado.sort((a, b) => Number(b.preco) - Number(a.preco));
            } else {
                resultado.sort((a, b) => (b.id || 0) - (a.id || 0));
            }

            renderizarProdutos(resultado);
        }

        searchInput.addEventListener("input", aplicarFiltros);
        sortSelect.addEventListener("change", aplicarFiltros);
        checkboxes.forEach(chk => chk.addEventListener("change", aplicarFiltros));

        carregarProdutos();

        const menuBtn = document.querySelector(".menu-toggle");
        const mainNav = document.querySelector(".nav");
        if (menuBtn && mainNav) {
            menuBtn.addEventListener("click", () => {
                const aberto = mainNav.classList.toggle("open");
                menuBtn.setAttribute("aria-expanded", aberto);
                menuBtn.textContent = aberto ? "✕" : "☰";
            });
            mainNav.querySelectorAll("a").forEach(link => link.addEventListener("click", () => {
                mainNav.classList.remove("open");
                menuBtn.setAttribute("aria-expanded", "false");
                menuBtn.textContent = "\u2630";
            }));
        }
