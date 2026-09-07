const homeProducts = document.getElementById("home-products");
const newArrivals = document.getElementById("new-arrivals");

// Configuração de URL base (evita falhas ao rodar em produção)
const API_BASE_URL = window.location.hostname === "localhost" 
  ? "http://localhost:3000" 
  : "";

// =========================================
// CRIAR CARD DO PRODUTO
// =========================================
function criarProduto(produto) {
  const card = document.createElement("a");
  card.href = `produto.html?id=${produto.id}`;
  card.className = "product";
  card.style.textDecoration = "none";
  card.style.color = "inherit";

  card.innerHTML = `
    <div class="product-image">
      <button type="button" class="heart" aria-label="Adicionar aos favoritos" data-id="${produto.id}">
        ♡
      </button>

      ${
        produto.imagem
          ? `<img src="${API_BASE_URL}/images/produtos/${produto.imagem}" alt="${produto.nome}">`
          : `<span>IMAGEM</span>`
      }
    </div>

    <div class="product-info">
      <p class="product-category">
        ${produto.categoria || "Produto"}
      </p>

      <h3>
        ${produto.nome}
      </h3>

      <p>
        R$ ${Number(produto.preco).toFixed(2).replace(".", ",")}
      </p>
    </div>
  `;

  // Intercepta o clique para não navegar para a página do produto
  const heartBtn = card.querySelector(".heart");
  heartBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();

    heartBtn.classList.toggle("favorited");
    const isFavorited = heartBtn.classList.contains("favorited");
    heartBtn.textContent = isFavorited ? "♥" : "♡";

    salvarFavorito(produto.id, isFavorited);
  });

  return card;
}

function salvarFavorito(id, status) {
  try {
    const favoritos = JSON.parse(localStorage.getItem("authentic_favoritos") || "[]");
    const index = favoritos.indexOf(id);

    if (status && index === -1) {
      favoritos.push(id);
    } else if (!status && index !== -1) {
      favoritos.splice(index, 1);
    }

    localStorage.setItem("authentic_favoritos", JSON.stringify(favoritos));
  } catch (err) {
    console.warn("Não foi possível salvar os favoritos localmente.", err);
  }
}

// =========================================
// CARREGAR PRODUTOS
// =========================================
async function carregarProdutos() {
  try {
    const resposta = await fetch(`${API_BASE_URL}/produtos`);

    if (!resposta.ok) {
      throw new Error("Erro ao carregar produtos.");
    }

    const produtos = await resposta.json();

    // Mais vendidos: primeiros 4 itens
    if (homeProducts) {
      homeProducts.innerHTML = "";
      produtos.slice(0, 4).forEach((produto) => {
        homeProducts.appendChild(criarProduto(produto));
      });
    }

    // New Arrivals: próximos 4 itens (ou produtos recentes)
    if (newArrivals) {
      newArrivals.innerHTML = "";
      const novidades = produtos.length > 4 ? produtos.slice(4, 8) : produtos.slice(0, 4);
      novidades.forEach((produto) => {
        newArrivals.appendChild(criarProduto(produto));
      });
    }
  } catch (erro) {
    console.error(erro);

    const mensagemErro = `<p class="error-state">Não foi possível carregar os produtos no momento.</p>`;
    if (homeProducts) homeProducts.innerHTML = mensagemErro;
    if (newArrivals) newArrivals.innerHTML = mensagemErro;
  }
}

// =========================================
// MENU MOBILE & BUSCA
// =========================================
document.addEventListener("DOMContentLoaded", () => {
  carregarProdutos();

  const menuToggle = document.querySelector(".menu-toggle");
  const mainNav = document.getElementById("main-nav");
  const searchLink = document.querySelector(".search-link");

  if (menuToggle && mainNav) {
    menuToggle.addEventListener("click", () => {
      const isOpen = mainNav.classList.toggle("open");
      menuToggle.setAttribute("aria-expanded", isOpen);
      menuToggle.innerHTML = isOpen ? "✕" : "☰";
    });
    mainNav.querySelectorAll("a").forEach(link => link.addEventListener("click", () => {
      mainNav.classList.remove("open");
      menuToggle.setAttribute("aria-expanded", "false");
      menuToggle.innerHTML = "&#9776;";
    }));

    // Fecha ao clicar fora
    document.addEventListener("click", (e) => {
      if (!mainNav.contains(e.target) && !menuToggle.contains(e.target)) {
        mainNav.classList.remove("open");
        menuToggle.setAttribute("aria-expanded", "false");
        menuToggle.innerHTML = "☰";
      }
    });
  }

  if (searchLink) {
    searchLink.addEventListener("click", (event) => {
      event.preventDefault();
      window.location.href = "produtos.html?buscar=";
    });
  }
});
