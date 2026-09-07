const API_URL = ["localhost", "127.0.0.1"].includes(location.hostname) ? "http://localhost:3000" : location.origin;

const token = localStorage.getItem("token");
const usuarioSalvo = localStorage.getItem("usuario");

// =========================================================
// VERIFICAR LOGIN
// =========================================================
if (!token) {
    window.location.href = "../login.html";
}

// =========================================================
// ELEMENTOS
// =========================================================
const nomeAdmin = document.getElementById("nomeAdmin");
const emailAdmin = document.getElementById("emailAdmin");

const senhaAtual = document.getElementById("senhaAtual");
const novaSenha = document.getElementById("novaSenha");
const confirmarSenha = document.getElementById("confirmarSenha");

const btnSalvarPerfil = document.getElementById("btnSalvarPerfil");
const btnAlterarSenha = document.getElementById("btnAlterarSenha");
const btnSalvarLoja = document.getElementById("btnSalvarLoja");
const btnSalvarPedidos = document.getElementById("btnSalvarPedidos");
const btnSalvarEstoque = document.getElementById("btnSalvarEstoque");
const btnSair = document.getElementById("btnSair");

// =========================================================
// CARREGAR DADOS DO ADMINISTRADOR
// =========================================================
function carregarPerfil() {
    if (!usuarioSalvo) return;

    try {
        const usuario = JSON.parse(usuarioSalvo);
        if (nomeAdmin) nomeAdmin.value = usuario.nome || "";
        if (emailAdmin) emailAdmin.value = usuario.email || "";
    } catch (erro) {
        console.error("Erro ao carregar usuário:", erro);
    }
}

// =========================================================
// SALVAR PERFIL
// =========================================================
if (btnSalvarPerfil) {
    btnSalvarPerfil.addEventListener("click", () => {
        const nome = nomeAdmin.value.trim();
        const email = emailAdmin.value.trim();

        if (!nome || !email) {
            alert("Preencha o nome e o e-mail.");
            return;
        }

        if (!email.includes("@")) {
            alert("Informe um e-mail válido.");
            return;
        }

        let usuario = {};
        try {
            usuario = JSON.parse(localStorage.getItem("usuario") || "{}");
        } catch (erro) {
            console.error(erro);
        }

        usuario.nome = nome;
        usuario.email = email;

        localStorage.setItem("usuario", JSON.stringify(usuario));
        alert("Dados do perfil atualizados com sucesso.");
    });
}

// =========================================================
// ALTERAR SENHA
// =========================================================
if (btnAlterarSenha) {
    btnAlterarSenha.addEventListener("click", async () => {
        const senhaAtualValor = senhaAtual.value;
        const novaSenhaValor = novaSenha.value;
        const confirmarSenhaValor = confirmarSenha.value;

        if (!senhaAtualValor || !novaSenhaValor || !confirmarSenhaValor) {
            alert("Preencha todos os campos de senha.");
            return;
        }

        if (novaSenhaValor.length < 8) {
            alert("A nova senha deve ter pelo menos 8 caracteres.");
            return;
        }

        if (novaSenhaValor !== confirmarSenhaValor) {
            alert("A confirmação da nova senha não corresponde.");
            return;
        }

        try {
            const resposta = await fetch(`${API_URL}/alterar-senha`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({
                    senhaAtual: senhaAtualValor,
                    novaSenha: novaSenhaValor
                })
            });

            const dados = await resposta.json();

            if (!resposta.ok) {
                alert(dados.erro || "Não foi possível alterar a senha.");
                return;
            }

            alert("Senha alterada com sucesso!");
            senhaAtual.value = "";
            novaSenha.value = "";
            confirmarSenha.value = "";

        } catch (erro) {
            console.error(erro);
            alert("Não foi possível conectar ao servidor.");
        }
    });
}

// =========================================================
// SALVAR & CARREGAR DADOS DA LOJA
// =========================================================
if (btnSalvarLoja) {
    btnSalvarLoja.addEventListener("click", () => {
        const nomeLoja = document.getElementById("nomeLoja").value.trim();
        const emailLoja = document.getElementById("emailLoja").value.trim();
        const telefoneLoja = document.getElementById("telefoneLoja").value.trim();
        const enderecoLoja = document.getElementById("enderecoLoja").value.trim();

        if (!nomeLoja) {
            alert("Informe o nome da loja.");
            return;
        }

        const dadosLoja = {
            nome: nomeLoja,
            email: emailLoja,
            telefone: telefoneLoja,
            endereco: enderecoLoja
        };

        localStorage.setItem("dadosLoja", JSON.stringify(dadosLoja));
        alert("Dados da loja salvos com sucesso.");
    });
}

function carregarDadosLoja() {
    const dadosSalvos = localStorage.getItem("dadosLoja");
    if (!dadosSalvos) return;

    try {
        const dados = JSON.parse(dadosSalvos);
        document.getElementById("nomeLoja").value = dados.nome || "AUTHENTIC";
        document.getElementById("emailLoja").value = dados.email || "";
        document.getElementById("telefoneLoja").value = dados.telefone || "";
        document.getElementById("enderecoLoja").value = dados.endereco || "";
    } catch (erro) {
        console.error("Erro ao carregar dados da loja:", erro);
    }
}

// =========================================================
// SALVAR & CARREGAR CONFIGURAÇÕES DE PEDIDOS
// =========================================================
if (btnSalvarPedidos) {
    btnSalvarPedidos.addEventListener("click", () => {
        const configuracoes = {
            pagamentoRetirada: document.getElementById("pagamentoRetirada").checked,
            retiradaLoja: document.getElementById("retiradaLoja").checked,
            entregaPedidos: document.getElementById("entregaPedidos").checked
        };

        localStorage.setItem("configuracoesPedidos", JSON.stringify(configuracoes));
        alert("Configurações de pedidos salvas.");
    });
}

function carregarConfiguracoesPedidos() {
    const dadosSalvos = localStorage.getItem("configuracoesPedidos");
    if (!dadosSalvos) return;

    try {
        const dados = JSON.parse(dadosSalvos);
        document.getElementById("pagamentoRetirada").checked = dados.pagamentoRetirada ?? true;
        document.getElementById("retiradaLoja").checked = dados.retiradaLoja ?? true;
        document.getElementById("entregaPedidos").checked = dados.entregaPedidos ?? true;
    } catch (erro) {
        console.error(erro);
    }
}

// =========================================================
// SALVAR & CARREGAR CONFIGURAÇÃO DE ESTOQUE
// =========================================================
if (btnSalvarEstoque) {
    btnSalvarEstoque.addEventListener("click", () => {
        const estoqueMinimo = Number(document.getElementById("estoqueMinimo").value);

        if (estoqueMinimo < 0) {
            alert("O estoque mínimo não pode ser negativo.");
            return;
        }

        localStorage.setItem("estoqueMinimo", estoqueMinimo);
        alert("Configuração de estoque salva com sucesso.");
    });
}

function carregarConfiguracaoEstoque() {
    const estoqueSalvo = localStorage.getItem("estoqueMinimo");
    if (estoqueSalvo !== null) {
        document.getElementById("estoqueMinimo").value = estoqueSalvo;
    }
}

// =========================================================
// SAIR DA CONTA
// =========================================================
if (btnSair) {
    btnSair.addEventListener("click", () => {
        const confirmar = confirm("Deseja realmente sair da sua conta?");
        if (!confirmar) return;

        localStorage.removeItem("token");
        localStorage.removeItem("usuario");
        window.location.href = "../login.html";
    });
}

// =========================================================
// INICIAR
// =========================================================
document.addEventListener("DOMContentLoaded", () => {
    carregarPerfil();
    carregarDadosLoja();
    carregarConfiguracoesPedidos();
    carregarConfiguracaoEstoque();
});
