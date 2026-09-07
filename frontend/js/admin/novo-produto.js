const formulario = document.getElementById("product-form");
const imagemInput = document.getElementById("imagem");
const imageUploadBox = document.querySelector(".image-upload");
const API_URL = ["localhost", "127.0.0.1"].includes(location.hostname) ? "http://localhost:3000" : location.origin;
const produtoId = new URLSearchParams(location.search).get("id");

if (produtoId) Promise.all([
    fetch(`${API_URL}/produtos/${produtoId}`).then(r => r.ok ? r.json() : Promise.reject()),
    fetch(`${API_URL}/produtos/${produtoId}/estoque`).then(r => r.ok ? r.json() : Promise.reject())
]).then(([produto, variacoes]) => {
    document.getElementById("nome").value = produto.nome || "";
    document.getElementById("descricao").value = produto.descricao || "";
    document.getElementById("preco").value = produto.preco || "";
    document.getElementById("categoria").value = produto.categoria || "";
    const tamanhos = new Set(variacoes.map(v => v.tamanho));
    const cores = new Set(variacoes.map(v => v.cor));
    document.querySelectorAll("input[name='tamanho']").forEach(input => { input.checked = tamanhos.has(input.value); });
    document.querySelectorAll("input[name='cor']").forEach(input => { input.checked = cores.has(input.value); });
}).catch(() => alert("Não foi possível carregar o produto."));

// Preview da imagem ao selecionar
imagemInput.addEventListener("change", () => {
    const file = imagemInput.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            imageUploadBox.innerHTML = `
                <img src="${e.target.result}" style="max-height: 180px; max-width: 100%; border-radius: 4px; object-fit: contain;">
                <span style="margin-top: 8px; font-size: 10px; color: #666;">Clique para trocar a imagem</span>
            `;
        };
        reader.readAsDataURL(file);
    }
});

// Envio com variações e imagem
formulario.addEventListener("submit", async (event) => {
    event.preventDefault();

    const nome = document.getElementById("nome").value.trim();
    const descricao = document.getElementById("descricao").value.trim();
    const preco = document.getElementById("preco").value;
    const categoria = document.getElementById("categoria").value;
    const status = document.querySelector("input[name='status']:checked")?.value || "ativo";

    // Captura tamanhos e cores selecionados
    const tamanhos = Array.from(document.querySelectorAll("input[name='tamanho']:checked")).map(el => el.value);
    const cores = Array.from(document.querySelectorAll("input[name='cor']:checked")).map(el => el.value);

    const formData = new FormData();
    formData.append("nome", nome);
    formData.append("descricao", descricao);
    formData.append("preco", preco);
    formData.append("categoria", categoria);
    formData.append("status", status);
    formData.append("ativo", String(status === "ativo"));
    formData.append("tamanhos", JSON.stringify(tamanhos));
    formData.append("cores", JSON.stringify(cores));

    if (imagemInput.files.length > 0) {
        formData.append("imagem", imagemInput.files[0]);
    }

    try {
        const token = localStorage.getItem("token");

        const resposta = await fetch(produtoId ? `${API_URL}/produtos/${produtoId}` : `${API_URL}/produtos`, {
            method: produtoId ? "PUT" : "POST",
            headers: {
                Authorization: `Bearer ${token}`
            },
            body: formData
        });

        const dados = await resposta.json();

        if (!resposta.ok) {
            throw new Error(dados.erro || "Erro ao cadastrar produto.");
        }

        alert("Produto cadastrado com sucesso!");
        window.location.href = "produtos.html";

    } catch (erro) {
        console.error(erro);
        alert(erro.message);
    }
});
