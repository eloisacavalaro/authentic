// =========================================================
// CONFIGURAÇÃO & AUTENTICAÇÃO
// =========================================================

const API_URL = window.location.hostname === "localhost" ? "http://localhost:3000" : "";
const token = localStorage.getItem("token");
const escaparHtml = valor => String(valor ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);

function redirecionarLogin() {
    window.location.replace("login.html?redirect=conta.html");
}

// =========================================================
// CONTROLE DE ABAS (SIDEBAR)
// =========================================================

const tabButtons = document.querySelectorAll(".sidebar-nav .tab-btn[data-target]");
const tabPanes = document.querySelectorAll(".tab-pane");

tabButtons.forEach(btn => {
    btn.addEventListener("click", () => {
        const targetId = btn.getAttribute("data-target");

        tabButtons.forEach(b => b.classList.remove("active"));
        tabPanes.forEach(p => p.classList.remove("active"));

        btn.classList.add("active");
        const targetPane = document.getElementById(targetId);
        if (targetPane) {
            targetPane.classList.add("active");
        }
    });
});

// =========================================================
// CARREGAR PERFIL
// =========================================================

async function carregarPerfil() {
    try {
        const resposta = await fetch(`${API_URL}/perfil`, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        if (resposta.status === 401 || resposta.status === 403) {
            fazerLogout();
            return;
        }

        if (!resposta.ok) throw new Error("Erro ao carregar perfil.");

        const dados = await resposta.json();
        const usuario = dados.usuario || dados;

        const nome = usuario.nome || "Cliente";
        const email = usuario.email || "—";
        const telefone = usuario.telefone || "—";

        document.getElementById("nomeCliente").textContent = nome;
        document.getElementById("emailCliente").textContent = email;
        document.getElementById("telefoneCliente").textContent = telefone;

        document.getElementById("sidebarNome").textContent = nome;
        document.getElementById("sidebarEmail").textContent = email;
        document.getElementById("avatarLetra").textContent = nome.charAt(0).toUpperCase();
        const editarNome = document.getElementById("editarNome");
        const editarTelefone = document.getElementById("editarTelefone");
        if (editarNome) editarNome.value = usuario.nome || "";
        if (editarTelefone) editarTelefone.value = usuario.telefone || "";

    } catch (erro) {
        console.error("Erro no perfil:", erro);
    }
}

// =========================================================
// CARREGAR PEDIDOS
// =========================================================

function formatarMoeda(valor) {
    return Number(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatarData(dataIso) {
    if (!dataIso) return "—";
    return new Date(dataIso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

async function carregarPedidos() {
    const ordersContainer = document.getElementById("ordersContainer");
    if (!ordersContainer) return;

    try {
        const resposta = await fetch(`${API_URL}/pedidos`, {
            headers: { Authorization: `Bearer ${token}` }
        });

        if (resposta.status === 401) {
            fazerLogout();
            return;
        }

        const pedidos = await resposta.json();

        const enderecos = [...new Map(pedidos.filter(p => p.forma_recebimento === "entrega" && p.endereco).map(p => {
            const chave = [p.cep,p.endereco,p.numero,p.complemento,p.bairro,p.cidade,p.estado].join("|");
            return [chave, p];
        })).values()];
        const addressContainer = document.getElementById("addressContainer");
        if (addressContainer) addressContainer.innerHTML = enderecos.length
            ? enderecos.map(p => `<div class="account-info-box"><strong>${escaparHtml(p.endereco)}, ${escaparHtml(p.numero)}</strong><p>${escaparHtml(p.complemento || "")} ${escaparHtml(p.bairro)} — ${escaparHtml(p.cidade)}/${escaparHtml(p.estado)} — CEP ${escaparHtml(p.cep)}</p></div>`).join("")
            : `<p class="empty-notice">Nenhum endereço de entrega utilizado.</p>`;

        if (!Array.isArray(pedidos) || pedidos.length === 0) {
            ordersContainer.innerHTML = `
                <div style="text-align:center; padding: 40px 10px;">
                    <span style="font-size: 24px; color:#bbb; display:block; margin-bottom:8px;">—</span>
                    <h3 style="font-family:'Playfair Display', serif; font-size:18px; margin-bottom:6px;">Nenhum pedido realizado</h3>
                    <p style="color:#777; font-size:12px; margin-bottom:18px;">Quando você fizer uma compra, o acompanhamento aparecerá aqui.</p>
                    <a href="produtos.html" class="btn-primary" style="display:inline-flex; align-items:center; justify-content:center; padding: 0 20px; text-decoration:none;">VER PRODUTOS</a>
                </div>
            `;
            return;
        }

        let html = `<div class="orders-list">`;

        pedidos.forEach(p => {
            const dataPedido = formatarData(p.criado_em);
            const statusTexto = p.status ? p.status.replace(/_/g, " ").toUpperCase() : "PROCESSANDO";
            const itens = Array.isArray(p.itens) ? p.itens : [];

            html += `
                <article class="order-item">
                    <div class="order-header">
                        <div>
                            <span class="order-number">PEDIDO #${p.id}</span>
                            <span class="order-date">${dataPedido}</span>
                        </div>
                        <span class="order-status">${statusTexto}</span>
                    </div>

                    ${itens.length > 0 ? `
                        <ul class="order-products-summary">
                            ${itens.map(i => `<li>${Number(i.quantidade)}x ${escaparHtml(i.nome)} (${escaparHtml(i.tamanho || "-")} / ${escaparHtml(i.cor || "-")})</li>`).join("")}
                        </ul>
                    ` : ""}

                    <div class="order-footer">
                        <span>${p.forma_recebimento === "entrega" ? "🚚 Entrega em domicílio" : "📍 Retirada na loja"}</span>
                        <strong>${formatarMoeda(p.valor_total)}</strong>
                    </div>
                </article>
            `;
        });

        html += `</div>`;
        ordersContainer.innerHTML = html;

    } catch (erro) {
        console.error("Erro ao carregar pedidos:", erro);
        ordersContainer.innerHTML = `<p class="empty-notice">Não foi possível carregar seus pedidos no momento.</p>`;
    }
}

// =========================================================
// ALTERAR SENHA
// =========================================================

const formAlterarSenha = document.getElementById("form-alterar-senha");

const formDados = document.getElementById("form-dados");
if (formDados) formDados.addEventListener("submit", async event => {
    event.preventDefault();
    const botao = formDados.querySelector("button");
    botao.disabled = true;
    try {
        const resposta = await fetch(`${API_URL}/perfil`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ nome: document.getElementById("editarNome").value.trim(), telefone: document.getElementById("editarTelefone").value.trim() })
        });
        const dados = await resposta.json();
        if (!resposta.ok) throw new Error(dados.erro || "Não foi possível salvar.");
        localStorage.setItem("usuario", JSON.stringify(dados.usuario));
        await carregarPerfil();
        alert("Dados atualizados com sucesso.");
    } catch (erro) { alert(erro.message); }
    finally { botao.disabled = false; }
});

if (formAlterarSenha) {
    formAlterarSenha.addEventListener("submit", async (e) => {
        e.preventDefault();
        const senhaAtual = document.getElementById("senhaAtual").value;
        const novaSenha = document.getElementById("novaSenha").value;
        const btnSubmit = formAlterarSenha.querySelector("button[type='submit']");

        if (novaSenha.length < 8) {
            alert("A nova senha deve ter no mínimo 8 caracteres.");
            return;
        }

        btnSubmit.disabled = true;
        btnSubmit.textContent = "ATUALIZANDO...";

        try {
            const res = await fetch(`${API_URL}/alterar-senha`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ senhaAtual, novaSenha })
            });

            const data = await res.json();

            if (!res.ok) {
                alert(data.erro || "Não foi possível atualizar a senha.");
            } else {
                alert("Senha atualizada com sucesso!");
                formAlterarSenha.reset();
            }
        } catch (err) {
            alert("Erro ao conectar ao servidor.");
        } finally {
            btnSubmit.disabled = false;
            btnSubmit.textContent = "ATUALIZAR SENHA";
        }
    });
}

// =========================================================
// LOGOUT
// =========================================================

function fazerLogout() {
    localStorage.removeItem("token");
    localStorage.removeItem("usuario");
    window.location.replace("login.html");
}

const btnLogout = document.getElementById("btnSairSidebar");
if (btnLogout) {
    btnLogout.addEventListener("click", fazerLogout);
}

async function iniciarConta() {
    if (!token) return redirecionarLogin();
    try {
        const resposta = await fetch(`${API_URL}/api/auth/me`, {
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store"
        });
        if (!resposta.ok) {
            localStorage.removeItem("token");
            localStorage.removeItem("usuario");
            return redirecionarLogin();
        }
        const { usuario } = await resposta.json();
        if (!usuario || usuario.tipo !== "cliente") return redirecionarLogin();
        document.body.classList.remove("auth-pending");
        await Promise.all([carregarPerfil(), carregarPedidos()]);
    } catch (_) {
        localStorage.removeItem("token");
        localStorage.removeItem("usuario");
        redirecionarLogin();
    }
}

iniciarConta();
