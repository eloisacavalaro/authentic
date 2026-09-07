const API_URL =
                window.location.hostname === "localhost" ||
                    window.location.hostname === "127.0.0.1"
                    ? "http://localhost:3000"
                    : "";
        const loginForm = document.getElementById("login-form");
        const btnEntrar = document.getElementById("btn-entrar");
        const feedback = document.getElementById("login-feedback");

        function destinoSolicitado() {
            const valor = new URLSearchParams(location.search).get("redirect");
            if (!valor || valor.includes("..") || !/^[a-z0-9/_-]+\.html(?:\?.*)?$/i.test(valor)) return null;
            return valor;
        }

        async function validarSessaoExistente() {
            const tokenExistente = localStorage.getItem("token");
            if (!tokenExistente) return;
            try {
                const resposta = await fetch(`${API_URL}/api/auth/me`, { headers: { Authorization: `Bearer ${tokenExistente}` }, cache: "no-store" });
                if (!resposta.ok) throw new Error("Sessao invalida");
                const { usuario } = await resposta.json();
                const destino = destinoSolicitado();
                window.location.replace(destino || (usuario.tipo === "admin" ? "admin/dashboard.html" : "conta.html"));
            } catch (_) {
                localStorage.removeItem("token");
                localStorage.removeItem("usuario");
            }
        }

        function exibirAviso(texto, tipo = "erro") {
            feedback.textContent = texto;
            feedback.className = `form-feedback ${tipo}`;
            feedback.style.display = "block";
        }

        loginForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            feedback.style.display = "none";

            const email = document.getElementById("email").value.trim();
            const senha = document.getElementById("senha").value;

            btnEntrar.disabled = true;
            btnEntrar.textContent = "ENTRANDO...";

            try {
                const resposta = await fetch(`${API_URL}/login`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email, senha })
                });

                const dados = await resposta.json();

                if (!resposta.ok) {
                    exibirAviso(dados.erro || "E-mail ou senha incorretos.");
                    btnEntrar.disabled = false;
                    btnEntrar.textContent = "ENTRAR";
                    return;
                }

                localStorage.setItem("token", dados.token);
                localStorage.removeItem("usuario");

                exibirAviso("Login realizado com sucesso! Redirecionando...", "sucesso");

                setTimeout(() => {
                    const destino = destinoSolicitado();
                    if (destino) {
                        window.location.href = destino;
                    } else if (dados.usuario && dados.usuario.tipo === "admin") {
                        window.location.href = "admin/dashboard.html";
                    } else {
                        // Verifica se veio do checkout antes
                        const carrinho = JSON.parse(localStorage.getItem("carrinho") || "[]");
                        if (carrinho.length > 0 && document.referrer.includes("carrinho.html")) {
                            window.location.href = "checkout.html";
                        } else {
                            window.location.href = "conta.html";
                        }
                    }
                }, 800);

            } catch (erro) {
                console.error(erro);
                exibirAviso("Não foi possível conectar ao servidor.");
                btnEntrar.disabled = false;
                btnEntrar.textContent = "ENTRAR";
            }
        });

        validarSessaoExistente();
