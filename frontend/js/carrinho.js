// =========================================================
// CARRINHO & ESTADO GLOBAL — AUTHENTIC
// =========================================================

const API_BASE_URL = window.location.hostname === "localhost" ? "http://localhost:3000" : "";
let carrinho = JSON.parse(localStorage.getItem("carrinho")) || [];

function salvarCarrinho() {
    localStorage.setItem("carrinho", JSON.stringify(carrinho));
    // Invalida cupom calculado previamente caso o usuário altere o pedido
    localStorage.removeItem("cupomAtivo");
}

function formatarPreco(valor) {
    return Number(valor).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL"
    });
}

function calcularSubtotal() {
    return carrinho.reduce((acc, p) => acc + (Number(p.preco) * Number(p.quantidade)), 0);
}

function atualizarContador() {
    const contadores = document.querySelectorAll(".cart span, .cart-count");
    const totalItens = carrinho.reduce((acc, p) => acc + Number(p.quantidade), 0);
    contadores.forEach(el => {
        el.textContent = totalItens;
    });
}

function adicionarAoCarrinho(produto) {
    const itemExistente = carrinho.find(item =>
        item.id === produto.id &&
        item.tamanho === produto.tamanho &&
        item.cor === produto.cor
    );

    if (itemExistente) {
        itemExistente.quantidade += Number(produto.quantidade);
    } else {
        carrinho.push({
            ...produto,
            quantidade: Number(produto.quantidade)
        });
    }

    salvarCarrinho();
    atualizarContador();
    window.location.href = "carrinho.html";
}

function alterarQuantidade(index, novaQtd) {
    novaQtd = Number(novaQtd);

    if (novaQtd <= 0) {
        carrinho.splice(index, 1);
    } else {
        carrinho[index].quantidade = novaQtd;
    }

    salvarCarrinho();
    mostrarCarrinho();
    atualizarContador();
}

function removerProduto(index) {
    carrinho.splice(index, 1);
    salvarCarrinho();
    mostrarCarrinho();
    atualizarContador();
}

function atualizarResumo() {
    const subtotal = calcularSubtotal();
    const subtotalEl = document.getElementById("cart-subtotal");
    const totalEl = document.getElementById("cart-total");
    const shippingBanner = document.getElementById("shipping-banner");

    if (subtotalEl) subtotalEl.textContent = formatarPreco(subtotal);
    if (totalEl) totalEl.textContent = formatarPreco(subtotal);

    if (shippingBanner) {
        const metaFrete = 299;
        if (subtotal >= metaFrete) {
            shippingBanner.textContent = "🎉 Parabéns! Você atingiu o Frete Grátis.";
            shippingBanner.style.color = "#15803d";
        } else if (subtotal > 0) {
            const restante = metaFrete - subtotal;
            shippingBanner.textContent = `Faltam ${formatarPreco(restante)} para ganhar frete grátis.`;
            shippingBanner.style.color = "#666";
        } else {
            shippingBanner.textContent = "Frete grátis para compras acima de R$ 299.";
            shippingBanner.style.color = "#666";
        }
    }
}

function mostrarCarrinho() {
    const container = document.getElementById("cart-products-container");
    if (!container) return;

    if (carrinho.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 50px 0;">
                <h2 style="font-family:'Playfair Display', serif; font-size: 22px; margin-bottom: 8px;">Seu carrinho está vazio</h2>
                <p style="color: #777; margin-bottom: 25px; font-size: 13px;">Explore nossa coleção para adicionar novos itens.</p>
                <a href="produtos.html" class="checkout-btn" style="display:inline-flex; align-items:center; justify-content:center; width:auto; padding: 0 30px; text-decoration:none;">EXPLORAR PRODUTOS</a>
            </div>
        `;
        atualizarResumo();
        return;
    }

    let html = `
        <div class="cart-top">
            <span>Produto</span>
            <span>Preço</span>
        </div>
    `;

    carrinho.forEach((produto, index) => {
        const valorTotalItem = Number(produto.preco) * Number(produto.quantidade);
        const imagemSrc = produto.imagem
            ? (produto.imagem.startsWith("http") ? produto.imagem : `${API_BASE_URL}/images/produtos/${produto.imagem}`)
            : null;

        html += `
            <article class="cart-item">
                <div class="item-image">
                    ${imagemSrc
                        ? `<img src="${imagemSrc}" alt="${produto.nome}" onerror="this.onerror=null;this.parentElement.innerHTML='<span style=\\'color:#999;font-size:10px;\\'>SEM FOTO</span>';">`
                        : `<span style="color:#999; font-size:10px;">SEM FOTO</span>`
                    }
                </div>

                <div class="item-info">
                    <span class="item-category">${produto.categoria || "AUTHENTIC"}</span>
                    <h2>${produto.nome}</h2>
                    <p>Cor: ${produto.cor || "-"}</p>
                    <p>Tamanho: ${produto.tamanho || "-"}</p>

                    <div class="item-actions">
                        <div class="quantity">
                            <button type="button" onclick="alterarQuantidade(${index}, ${produto.quantidade - 1})" aria-label="Diminuir">−</button>
                            <span>${produto.quantidade}</span>
                            <button type="button" onclick="alterarQuantidade(${index}, ${produto.quantidade + 1})" aria-label="Aumentar">+</button>
                        </div>
                        <button type="button" class="remove" onclick="removerProduto(${index})">Remover</button>
                    </div>
                </div>

                <strong class="item-price">${formatarPreco(valorTotalItem)}</strong>
            </article>
        `;
    });

    html += `
        <a href="produtos.html" class="continue">
            ← Continuar comprando
        </a>
    `;

    container.innerHTML = html;
    atualizarResumo();
}

document.addEventListener("DOMContentLoaded", () => {
    atualizarContador();
    mostrarCarrinho();

    const btnCheckout = document.getElementById("btn-checkout");
    if (btnCheckout) {
        btnCheckout.addEventListener("click", () => {
            if (carrinho.length === 0) {
                alert("Seu carrinho está vazio.");
                return;
            }
            window.location.href = "checkout.html";
        });
    }

    const menuToggle = document.getElementById("menu-toggle");
    const cartNav = document.getElementById("cart-nav");
    if (menuToggle && cartNav) {
        menuToggle.addEventListener("click", () => {
            const aberto = cartNav.classList.toggle("open");
            menuToggle.setAttribute("aria-expanded", aberto);
            menuToggle.textContent = aberto ? "✕" : "☰";
        });
        cartNav.querySelectorAll("a").forEach(link => link.addEventListener("click", () => {
            cartNav.classList.remove("open");
            menuToggle.setAttribute("aria-expanded", "false");
            menuToggle.textContent = "\u2630";
        }));
    }
});
