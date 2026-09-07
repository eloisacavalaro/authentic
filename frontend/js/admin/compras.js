const API_URL = ["localhost", "127.0.0.1"].includes(location.hostname) ? "http://localhost:3000" : location.origin;
const token = localStorage.getItem("token");

if (!token) {
    window.location.href = "login.html";
}

let fornecedores = [];
let produtos = [];

const modalCompra = document.getElementById("modalCompra");
const modalFornecedor = document.getElementById("modalFornecedor");
const listaCompras = document.getElementById("listaCompras");

function formatarMoeda(val) {
    return Number(val || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

async function carregarDados() {
    try {
        const [resFornecedores, resProdutos] = await Promise.all([
            fetch(`${API_URL}/fornecedores`, { headers: { Authorization: `Bearer ${token}` } }),
            fetch(`${API_URL}/produtos`)
        ]);

        if (resFornecedores.ok) fornecedores = await resFornecedores.json();
        if (resProdutos.ok) produtos = await resProdutos.json();

        popularSelects();
        carregarMetricasECompras();
    } catch (err) {
        console.error("Erro ao carregar dados:", err);
    }
}

function popularSelects() {
    const selFornecedor = document.getElementById("compraFornecedor");
    if (selFornecedor) {
        selFornecedor.innerHTML = '<option value="">Selecione...</option>' + 
            fornecedores.map(f => `<option value="${f.id}">${f.nome}</option>`).join("");
    }

    const selProduto = document.getElementById("compraProduto");
    if (selProduto) {
        selProduto.innerHTML = '<option value="">Selecione o produto...</option>' + 
            produtos.map(p => `<option value="${p.id}" data-preco="${p.preco}">${p.nome} (Venda: ${formatarMoeda(p.preco)})</option>`).join("");
    }
}

async function carregarMetricasECompras() {
    const cardFornec = document.getElementById("cardTotalFornecedores");
    if (cardFornec) cardFornec.textContent = fornecedores.length;

    listaCompras.innerHTML = `
        <tr>
            <td><strong>#LOTE-INICIAL</strong></td>
            <td>Confecção Primária</td>
            <td>05/09/2026</td>
            <td><strong>R$ 1.450,00</strong></td>
            <td><span style="background: #eef7f2; color: #3e7b5f; padding: 4px 8px; border-radius: 4px; font-weight: 700; font-size: 10px;">RECEBIDO</span></td>
        </tr>
    `;
    document.getElementById("cardTotalCompras").textContent = "R$ 1.450,00";
    document.getElementById("cardTotalNotas").textContent = "1";
}

// Cálculo do Markup na tela
const inputCusto = document.getElementById("compraCustoUnitario");
if (inputCusto) {
    inputCusto.addEventListener("input", function() {
        const custo = Number(this.value);
        const selProd = document.getElementById("compraProduto");
        const precoVenda = Number(selProd.options[selProd.selectedIndex]?.dataset?.preco || 0);

        const box = document.getElementById("markupBox");
        if (custo > 0 && precoVenda > 0) {
            box.style.display = "block";
            const margem = precoVenda - custo;
            const perc = ((margem / precoVenda) * 100).toFixed(1);
            document.getElementById("markupTxt").textContent = `Lucro de ${formatarMoeda(margem)} por peça (${perc}% de margem bruta)`;
        } else {
            box.style.display = "none";
        }
    });
}

// Envio de nova compra (Alimenta Estoque)
const formCompra = document.getElementById("formCompra");
if (formCompra) {
    formCompra.addEventListener("submit", async (e) => {
        e.preventDefault();
        const produtoId = Number(document.getElementById("compraProduto").value);
        const tamanho = document.getElementById("compraTamanho").value.trim().toUpperCase();
        const cor = document.getElementById("compraCor").value.trim();
        const qtd = Number(document.getElementById("compraQtd").value);
        const custo = Number(document.getElementById("compraCustoUnitario").value);

        try {
            const resEstoque = await fetch(`${API_URL}/estoque`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ produto_id: produtoId, tamanho, cor, quantidade: 0 })
            });
            const est = await resEstoque.json();

            const payload = {
                fornecedor_id: Number(document.getElementById("compraFornecedor").value),
                numero_nota: document.getElementById("compraNota").value.trim(),
                itens: [{
                    produto_id: produtoId,
                    estoque_id: est.id,
                    tamanho,
                    cor,
                    quantidade: qtd,
                    preco_custo_unitario: custo
                }]
            };

            const res = await fetch(`${API_URL}/compras`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify(payload)
            });

            if (!res.ok) throw new Error("Falha ao processar compra.");

            alert("Mercadoria lançada com sucesso! O estoque foi atualizado.");
            modalCompra.classList.remove("active");
            formCompra.reset();
            carregarDados();
        } catch (err) {
            alert(err.message);
        }
    });
}

// Cadastro de Fornecedor
const formFornecedor = document.getElementById("formFornecedor");
if (formFornecedor) {
    formFornecedor.addEventListener("submit", async (e) => {
        e.preventDefault();
        const payload = {
            nome: document.getElementById("fornecedorNome").value.trim(),
            cnpj_cpf: document.getElementById("fornecedorDoc").value.trim(),
            telefone: document.getElementById("fornecedorTel").value.trim(),
            chave_pix: document.getElementById("fornecedorPix").value.trim()
        };

        try {
            const res = await fetch(`${API_URL}/fornecedores`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify(payload)
            });
            if (!res.ok) throw new Error("Erro ao salvar.");
            alert("Fornecedor cadastrado!");
            modalFornecedor.classList.remove("active");
            formFornecedor.reset();
            carregarDados();
        } catch (err) {
            alert(err.message);
        }
    });
}

// Modais
document.getElementById("btnNovaCompra").onclick = () => modalCompra.classList.add("active");
document.getElementById("fecharModalCompra").onclick = () => modalCompra.classList.remove("active");
document.getElementById("cancelarCompra").onclick = () => modalCompra.classList.remove("active");

document.getElementById("btnNovoFornecedor").onclick = () => modalFornecedor.classList.add("active");
document.getElementById("fecharModalFornecedor").onclick = () => modalFornecedor.classList.remove("active");
document.getElementById("cancelarFornecedor").onclick = () => modalFornecedor.classList.remove("active");

document.addEventListener("DOMContentLoaded", carregarDados);
