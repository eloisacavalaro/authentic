document.addEventListener("DOMContentLoaded", async () => {
            const API_URL = window.location.hostname === "localhost" ? "http://localhost:3000" : "";
            const parametros = new URLSearchParams(window.location.search);
            const id = parametros.get("id");

            let produtoAtual = null;
            let quantidade = 1;
            let corSelecionada = "Preto";
            let tamanhoSelecionado = "M";
            let estoqueProduto = [];

            const botoesCor = document.querySelectorAll(".color");
            const botoesTamanho = document.querySelectorAll(".sizes button");
            const quantidadeElemento = document.getElementById("quantity");
            const stockNotice = document.getElementById("stockNotice");
            const corSelecionadaElemento = document.getElementById("selected-color");

            if (!id) {
                alert("Produto não especificado.");
                window.location.href = "produtos.html";
                return;
            }

            async function carregarEstoque() {
                try {
                    const resposta = await fetch(`${API_URL}/produtos/${id}/estoque`);
                    if (resposta.ok) estoqueProduto = await resposta.json();
                } catch (erro) {
                    console.warn("Estoque não carregado:", erro);
                }
            }

            function verificarEstoque() {
                if (estoqueProduto.length === 0) return 99;
                const variacao = estoqueProduto.find(item =>
                    item.cor === corSelecionada && item.tamanho === tamanhoSelecionado
                );
                return variacao ? Number(variacao.quantidade) : 0;
            }

            function atualizarOpcoesEstoque() {
                if (estoqueProduto.length === 0) return;

                botoesCor.forEach(botao => {
                    const cor = botao.dataset.color;
                    const temEstoque = estoqueProduto.some(item => item.cor === cor && item.quantidade > 0);
                    botao.disabled = !temEstoque;
                });

                botoesTamanho.forEach(botao => {
                    const tamanho = botao.dataset.size;
                    const temEstoque = estoqueProduto.some(item =>
                        item.cor === corSelecionada && item.tamanho === tamanho && item.quantidade > 0
                    );
                    botao.disabled = !temEstoque;
                });

                const disponivel = verificarEstoque();
                if (disponivel <= 0) {
                    stockNotice.textContent = "Esgotado nesta variação";
                    stockNotice.style.color = "#dc2626";
                } else if (disponivel <= 3) {
                    stockNotice.textContent = `Apenas ${disponivel} peça(s) restante(s)!`;
                    stockNotice.style.color = "#ea580c";
                } else {
                    stockNotice.textContent = "Em estoque";
                    stockNotice.style.color = "#15803d";
                }
            }

            async function carregarProduto() {
                try {
                    const resposta = await fetch(`${API_URL}/produtos/${id}`);
                    if (!resposta.ok) throw new Error("Produto não localizado.");
                    produtoAtual = await resposta.json();

                    await carregarEstoque();
                    atualizarOpcoesEstoque();

                    document.getElementById("product-category").textContent = produtoAtual.categoria || "AUTHENTIC";
                    document.getElementById("product-name").textContent = produtoAtual.nome;
                    document.getElementById("product-price").textContent = `R$ ${Number(produtoAtual.preco).toFixed(2).replace(".", ",")}`;
                    document.getElementById("product-description").textContent = produtoAtual.descricao || "Peça essencial masculina contemporânea.";
                    document.getElementById("breadcrumb-product").textContent = produtoAtual.nome;
                    document.title = `${produtoAtual.nome} — AUTHENTIC`;

                    const imageContainer = document.getElementById("product-image-container");
                    if (produtoAtual.imagem) {
                        const imgUrl = produtoAtual.imagem.startsWith("http") ? produtoAtual.imagem : `${API_URL}/images/produtos/${produtoAtual.imagem}`;
                        imageContainer.innerHTML = `<img src="${imgUrl}" alt="${produtoAtual.nome}" style="width:100%;height:100%;object-fit:cover;">`;
                    } else {
                        imageContainer.innerHTML = `<span style="color:#888;">SEM IMAGEM</span>`;
                    }
                } catch (erro) {
                    console.error(erro);
                    document.getElementById("product-name").textContent = "Produto indisponível.";
                }
            }

            document.getElementById("increase").addEventListener("click", () => {
                if (quantidade < verificarEstoque()) {
                    quantidade++;
                    quantidadeElemento.textContent = quantidade;
                }
            });

            document.getElementById("decrease").addEventListener("click", () => {
                if (quantidade > 1) {
                    quantidade--;
                    quantidadeElemento.textContent = quantidade;
                }
            });

            botoesCor.forEach(botao => {
                botao.addEventListener("click", () => {
                    if (botao.disabled) return;
                    botoesCor.forEach(b => b.classList.remove("active"));
                    botao.classList.add("active");
                    corSelecionada = botao.dataset.color;
                    corSelecionadaElemento.textContent = corSelecionada;
                    quantidade = 1;
                    quantidadeElemento.textContent = quantidade;
                    atualizarOpcoesEstoque();
                });
            });

            botoesTamanho.forEach(botao => {
                botao.addEventListener("click", () => {
                    if (botao.disabled) return;
                    botoesTamanho.forEach(b => b.classList.remove("active"));
                    botao.classList.add("active");
                    tamanhoSelecionado = botao.dataset.size;
                    quantidade = 1;
                    quantidadeElemento.textContent = quantidade;
                    atualizarOpcoesEstoque();
                });
            });

            document.getElementById("add-cart").addEventListener("click", () => {
                if (!produtoAtual) return;
                if (verificarEstoque() <= 0) {
                    alert("Combinação indisponível.");
                    return;
                }

                adicionarAoCarrinho({
                    id: produtoAtual.id,
                    nome: produtoAtual.nome,
                    categoria: produtoAtual.categoria,
                    preco: Number(produtoAtual.preco),
                    imagem: produtoAtual.imagem,
                    cor: corSelecionada,
                    tamanho: tamanhoSelecionado,
                    quantidade: quantidade
                });
            });

            carregarProduto();
        });

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
