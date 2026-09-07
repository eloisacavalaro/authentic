// =========================================================
// CONFIGURAÇÃO & SELETORES
// =========================================================

const API_URL = window.location.hostname === "localhost" ? "http://localhost:3000" : "";
const formulario = document.getElementById("register-form");
const telefoneInput = document.getElementById("telefone");
const submitButton = formulario.querySelector(".auth-button");

// Cria elemento para feedback de mensagem de erro/sucesso
let feedbackMsg = document.getElementById("form-feedback");
if (!feedbackMsg) {
    feedbackMsg = document.createElement("div");
    feedbackMsg.id = "form-feedback";
    feedbackMsg.className = "form-feedback";
    formulario.prepend(feedbackMsg);
}

function exibirMensagem(texto, tipo = "erro") {
    feedbackMsg.textContent = texto;
    feedbackMsg.className = `form-feedback ${tipo}`;
    feedbackMsg.style.display = "block";
    feedbackMsg.scrollIntoView({ behavior: "smooth", block: "center" });
}

function limparMensagem() {
    feedbackMsg.textContent = "";
    feedbackMsg.style.display = "none";
}

// =========================================================
// MÁSCARA DE TELEFONE
// =========================================================

if (telefoneInput) {
    telefoneInput.addEventListener("input", (e) => {
        let valor = e.target.value.replace(/\D/g, "");

        if (valor.length > 11) valor = valor.substring(0, 11);

        if (valor.length > 10) {
            // Celular (11 dígitos): (XX) XXXXX-XXXX
            valor = valor.replace(/^(\d{2})(\d{5})(\d{4})$/, "($1) $2-$3");
        } else if (valor.length > 5) {
            // Fixo ou celular digitando: (XX) XXXX-XXXX
            valor = valor.replace(/^(\d{2})(\d{4})(\d{0,4})$/, "($1) $2-$3");
        } else if (valor.length > 2) {
            valor = valor.replace(/^(\d{2})(\d{0,5})$/, "($1) $2");
        }

        e.target.value = valor;
    });
}

// =========================================================
// SUBMIT DO FORMULÁRIO
// =========================================================

formulario.addEventListener("submit", async (event) => {
    event.preventDefault();
    limparMensagem();

    const nome = document.getElementById("nome").value.trim();
    const email = document.getElementById("email").value.trim();
    const telefone = document.getElementById("telefone").value.trim();
    const senha = document.getElementById("senha").value;
    const confirmarSenha = document.getElementById("confirmar-senha").value;

    // 1. Validação de senha idêntica
    if (senha !== confirmarSenha) {
        exibirMensagem("As senhas digitadas não coincidem.");
        document.getElementById("confirmar-senha").focus();
        return;
    }

    // 2. Validação de comprimento de senha
    if (senha.length < 8) {
        exibirMensagem("A senha deve conter no mínimo 8 caracteres.");
        document.getElementById("senha").focus();
        return;
    }

    // Bloqueia botão durante envio
    submitButton.disabled = true;
    submitButton.textContent = "CRIANDO CONTA...";

    try {
        const resposta = await fetch(`${API_URL}/usuarios`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                nome,
                email,
                telefone,
                senha
            })
        });

        const dados = await resposta.json();

        if (!resposta.ok) {
            exibirMensagem(dados.erro || "Não foi possível criar sua conta.");
            submitButton.disabled = false;
            submitButton.textContent = "CRIAR CONTA";
            return;
        }

        exibirMensagem("Conta criada com sucesso! Redirecionando...", "sucesso");

        setTimeout(() => {
            window.location.href = "login.html";
        }, 1200);

    } catch (erro) {
        console.error("Erro ao cadastrar:", erro);
        exibirMensagem("Não foi possível conectar ao servidor. Tente novamente mais tarde.");
        submitButton.disabled = false;
        submitButton.textContent = "CRIAR CONTA";
    }
});