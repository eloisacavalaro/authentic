const API_BASE_URL = window.location.hostname === "localhost" ? "http://localhost:3000" : "";

        let cupomAtivo = null;
        let descontoCalculado = 0;
        let subtotalCalculado = 0;

        function formatarPreco(valor) {
            return Number(valor).toLocaleString("pt-BR", {
                style: "currency",
                currency: "BRL"
            });
        }

        function atualizarValoresTotais() {
            const subtotalElement = document.getElementById("subtotal");
            const totalElement = document.getElementById("total");

            subtotalElement.textContent = formatarPreco(subtotalCalculado);
            const totalFinal = Math.max(0, subtotalCalculado - descontoCalculado);
            totalElement.textContent = formatarPreco(totalFinal);
        }

        // ==========================================
        // CUPOM
        // ==========================================
        document.getElementById("btnAplicarCupom").addEventListener("click", async () => {
            const codigo = document.getElementById("cupomInput").value.trim();
            const msg = document.getElementById("cupomMsg");
            if (!codigo) return;

            if (subtotalCalculado === 0) {
                msg.textContent = "Adicione itens ao carrinho antes de aplicar cupom.";
                msg.style.color = "#dc2626";
                return;
            }

            try {
                const res = await fetch(`${API_BASE_URL}/cupons/validar`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ codigo, subtotal: subtotalCalculado })
                });
                const dados = await res.json();

                if (!res.ok) {
                    msg.textContent = dados.erro || "Cupom inválido.";
                    msg.style.color = "#dc2626";
                    cupomAtivo = null;
                    descontoCalculado = 0;
                    document.getElementById("linhaDesconto").style.display = "none";
                    atualizarValoresTotais();
                    return;
                }

                cupomAtivo = dados;
                descontoCalculado = Number(dados.desconto || 0);

                msg.textContent = "Cupom aplicado!";
                msg.style.color = "#15803d";
                document.getElementById("cupomAplicadoNome").textContent = dados.codigo;
                document.getElementById("valorDesconto").textContent = `- ${formatarPreco(descontoCalculado)}`;
                document.getElementById("linhaDesconto").style.display = "flex";

                atualizarValoresTotais();
            } catch (err) {
                msg.textContent = "Erro ao conectar para validar cupom.";
                msg.style.color = "#dc2626";
            }
        });

        // ==========================================
        // RECEBIMENTO & ENDEREÇO
        // ==========================================
        const opcaoRetirada = document.getElementById("opcao-retirada");
        const opcaoEntrega = document.getElementById("opcao-entrega");
        const radioRetirada = document.getElementById("radio-retirada");
        const radioEntrega = document.getElementById("radio-entrega");
        const enderecoContainer = document.getElementById("endereco-container");
        const frete = document.getElementById("frete");
        const containerPagarRetirada = document.getElementById("container-pagar-retirada");
        const radioPagarRetirada = document.getElementById("radio-pagar-retirada");

        function selecionarRetirada() {
            radioRetirada.checked = true;
            opcaoRetirada.classList.add("selecionado");
            opcaoEntrega.classList.remove("selecionado");
            enderecoContainer.style.display = "none";
            frete.textContent = "Retirada na loja — Grátis";

            containerPagarRetirada.style.display = "flex";
        }

        function selecionarEntrega() {
            radioEntrega.checked = true;
            opcaoEntrega.classList.add("selecionado");
            opcaoRetirada.classList.remove("selecionado");
            enderecoContainer.style.display = "block";
            frete.textContent = "Frete — a confirmar";

            // Remove a opção "Pagar na retirada" quando o pedido é para entrega
            containerPagarRetirada.style.display = "none";
            if (radioPagarRetirada.checked) {
                document.querySelector('input[name="pagamento"][value="pix"]').checked = true;
            }
        }

        opcaoRetirada.addEventListener("click", selecionarRetirada);
        opcaoEntrega.addEventListener("click", selecionarEntrega);

        // ==========================================
        // PREENCHIMENTO AUTOMÁTICO DE CEP (ViaCEP)
        // ==========================================
        const cepInput = document.getElementById("cep");
        cepInput.addEventListener("input", async (e) => {
            let valor = e.target.value.replace(/\D/g, "");
            if (valor.length > 5) {
                valor = valor.substring(0, 5) + "-" + valor.substring(5, 8);
            }
            e.target.value = valor;

            const cepNumeros = valor.replace(/\D/g, "");
            if (cepNumeros.length === 8) {
                try {
                    const resposta = await fetch(`https://viacep.com.br/ws/${cepNumeros}/json/`);
                    const dados = await resposta.json();
                    if (!dados.erro) {
                        document.getElementById("endereco").value = dados.logradouro || "";
                        document.getElementById("bairro").value = dados.bairro || "";
                        document.getElementById("cidade").value = dados.localidade || "";
                        document.getElementById("estado").value = dados.uf || "";
                        document.getElementById("numero").focus();
                    }
                } catch (err) {
                    console.warn("Não foi possível consultar o CEP automaticamente.");
                }
            }
        });

        // ==========================================
        // CARREGAR RESUMO
        // ==========================================
        function carregarResumoCheckout() {
            const carrinho = JSON.parse(localStorage.getItem("carrinho")) || [];
            const container = document.getElementById("checkout-items");

            if (carrinho.length === 0) {
                container.innerHTML = `<p class="empty-cart">Seu carrinho está vazio.</p>`;
                subtotalCalculado = 0;
                atualizarValoresTotais();
                document.getElementById("finish-button").disabled = true;
                return;
            }

            subtotalCalculado = 0;
            container.innerHTML = "";

            carrinho.forEach(item => {
                const quantidade = Number(item.quantidade);
                const preco = Number(item.preco);
                const valorItem = preco * quantidade;
                subtotalCalculado += valorItem;

                const div = document.createElement("div");
                div.className = "checkout-item";
                div.innerHTML = `
                    <div class="item-info">
                        <strong>${item.nome}</strong>
                        <span class="item-details">
                            ${item.cor || ""} • ${item.tamanho || ""} • Qtd: ${quantidade}
                        </span>
                    </div>
                    <strong>${formatarPreco(valorItem)}</strong>
                `;
                container.appendChild(div);
            });

            atualizarValoresTotais();
        }

        async function iniciarPagamentoOnline(pedido, metodo, token) {
            const etapa = document.getElementById("payment-stage");
            const carregando = document.getElementById("payment-loading");
            const resultado = document.getElementById("payment-result");
            etapa.hidden = false;
            resultado.hidden = true;
            carregando.hidden = false;
            etapa.scrollIntoView({ behavior: "smooth", block: "start" });

            const configResposta = await fetch(`${API_BASE_URL}/api/config/payment`, { cache: "no-store" });
            const config = await configResposta.json();
            if (!configResposta.ok) throw new Error(config.erro || "Pagamento online não configurado.");
            if (!window.MercadoPago) throw new Error("O componente seguro do Mercado Pago não foi carregado.");

            const mp = new window.MercadoPago(config.public_key, { locale: "pt-BR" });
            const builder = mp.bricks();
            const customization = metodo === "pix"
                ? { paymentMethods: { bankTransfer: ["pix"] } }
                : { paymentMethods: { creditCard: "all" }, visual: { style: { theme: "default" } } };
            const settings = {
                initialization: { amount: Number(pedido.valor_total) },
                customization,
                callbacks: {
                    onReady: () => { carregando.hidden = true; },
                    onSubmit: ({ selectedPaymentMethod, formData }) => new Promise(async (resolve, reject) => {
                        resultado.hidden = false;
                        resultado.className = "payment-result";
                        resultado.textContent = "Processando pagamento com segurança...";
                        const chavePagamento = sessionStorage.getItem(`paymentIdempotencyKey:${pedido.id}`) || crypto.randomUUID();
                        sessionStorage.setItem(`paymentIdempotencyKey:${pedido.id}`, chavePagamento);
                        try {
                            const resposta = await fetch(`${API_BASE_URL}/pedidos/${pedido.id}/pagamento`, {
                                method: "POST",
                                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}`, "Idempotency-Key": chavePagamento },
                                body: JSON.stringify({ ...formData, selected_payment_method: selectedPaymentMethod })
                            });
                            const pagamento = await resposta.json();
                            if (!resposta.ok && resposta.status !== 402) throw new Error(pagamento.erro || "Pagamento não processado.");
                            resultado.replaceChildren();
                            if (pagamento.status === "recusado") {
                                resultado.className = "payment-result error";
                                resultado.textContent = "Pagamento recusado. Confira os dados ou utilize outra forma de pagamento.";
                                resolve();
                                return;
                            }
                            resultado.className = "payment-result success";
                            const mensagem = document.createElement("p");
                            mensagem.textContent = pagamento.status === "pago" ? "Pagamento aprovado." : "Aguardando confirmação do pagamento.";
                            resultado.appendChild(mensagem);
                            if (pagamento.metodo === "pix" && pagamento.pix) {
                                if (pagamento.pix.qr_code_base64) {
                                    const imagem = document.createElement("img"); imagem.className = "pix-qr"; imagem.alt = "QR Code Pix";
                                    imagem.src = `data:image/png;base64,${pagamento.pix.qr_code_base64}`; resultado.appendChild(imagem);
                                }
                                if (pagamento.pix.qr_code) {
                                    const codigo = document.createElement("textarea"); codigo.className = "pix-code"; codigo.readOnly = true; codigo.value = pagamento.pix.qr_code;
                                    const copiar = document.createElement("button"); copiar.type = "button"; copiar.className = "copy-pix"; copiar.textContent = "COPIAR CÓDIGO PIX";
                                    copiar.addEventListener("click", async () => { await navigator.clipboard.writeText(codigo.value); copiar.textContent = "CÓDIGO COPIADO"; });
                                    resultado.append(codigo, copiar);
                                }
                            }
                            localStorage.removeItem("carrinho");
                            sessionStorage.removeItem("checkoutIdempotencyKey");
                            resolve();
                        } catch (erro) {
                            resultado.className = "payment-result error";
                            resultado.textContent = erro.message;
                            reject(erro);
                        }
                    }),
                    onError: erro => { carregando.hidden = true; resultado.hidden = false; resultado.className = "payment-result error"; resultado.textContent = "Não foi possível carregar o pagamento seguro."; console.error(erro); }
                }
            };
            window.paymentBrickController = await builder.create("payment", "paymentBrick_container", settings);
        }

        // ==========================================
        // FINALIZAR PEDIDO
        // ==========================================
        document.getElementById("finish-button").addEventListener("click", async function () {
            const botao = document.getElementById("finish-button");
            const token = localStorage.getItem("token");

            if (!token) {
                alert("Você precisa fazer login para finalizar o pedido.");
                window.location.href = "login.html";
                return;
            }

            const carrinho = JSON.parse(localStorage.getItem("carrinho")) || [];
            if (carrinho.length === 0) {
                alert("Seu carrinho está vazio.");
                window.location.href = "carrinho.html";
                return;
            }

            const radioRecebimento = document.querySelector('input[name="recebimento"]:checked');
            if (!radioRecebimento) {
                alert("Selecione uma forma de recebimento.");
                return;
            }
            const recebimento = radioRecebimento.value;
            const pagamento = document.querySelector('input[name="pagamento"]:checked').value;

            let cep = null, endereco = null, numero = null, complemento = null, bairro = null, cidade = null, estado = null;

            if (recebimento === "entrega") {
                cep = document.getElementById("cep").value.trim();
                endereco = document.getElementById("endereco").value.trim();
                numero = document.getElementById("numero").value.trim();
                complemento = document.getElementById("complemento").value.trim();
                bairro = document.getElementById("bairro").value.trim();
                cidade = document.getElementById("cidade").value.trim();
                estado = document.getElementById("estado").value;

                if (!cep || !endereco || !numero || !bairro || !cidade || !estado) {
                    alert("Preencha todos os dados obrigatórios do endereço.");
                    return;
                }
            }

            const itens = carrinho.map(item => ({
                produto_id: item.id,
                tamanho: item.tamanho,
                cor: item.cor,
                quantidade: Number(item.quantidade)
            }));

            const dadosPedido = {
                itens,
                forma_recebimento: recebimento,
                forma_pagamento: pagamento,
                cupom: cupomAtivo ? cupomAtivo.codigo : null,
                desconto: descontoCalculado,
                cep,
                endereco,
                numero,
                complemento,
                bairro,
                cidade,
                estado
            };

            botao.disabled = true;
            botao.textContent = "PROCESSANDO...";

            try {
                const sessao = await fetch(`${API_BASE_URL}/api/auth/me`, { headers: { "Authorization": `Bearer ${token}` }, cache: "no-store" });
                if (!sessao.ok) {
                    localStorage.removeItem("token"); localStorage.removeItem("usuario");
                    const retorno = encodeURIComponent("checkout.html");
                    window.location.replace(`login.html?redirect=${retorno}`);
                    return;
                }
                const chavePedido = sessionStorage.getItem("checkoutIdempotencyKey") || crypto.randomUUID();
                sessionStorage.setItem("checkoutIdempotencyKey", chavePedido);
                const resposta = await fetch(`${API_BASE_URL}/pedidos`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${token}`,
                        "Idempotency-Key": chavePedido
                    },
                    body: JSON.stringify(dadosPedido)
                });

                const dados = await resposta.json();

                if (resposta.status === 401) {
                    alert("Sua sessão expirou. Faça login novamente.");
                    localStorage.removeItem("token");
                    localStorage.removeItem("usuario");
                    window.location.href = "login.html";
                    return;
                }

                if (!resposta.ok) {
                    alert(dados.erro || "Não foi possível criar o pedido.");
                    botao.disabled = false;
                    botao.textContent = "FINALIZAR PEDIDO";
                    return;
                }

                localStorage.setItem("ultimoPedido", JSON.stringify(dados.pedido));
                if (["pix", "cartao"].includes(pagamento)) {
                    botao.hidden = true;
                    document.querySelectorAll('input[name="pagamento"],input[name="recebimento"]').forEach(input => input.disabled = true);
                    await iniciarPagamentoOnline(dados.pedido, pagamento, token);
                    return;
                }
                localStorage.removeItem("carrinho");
                sessionStorage.removeItem("checkoutIdempotencyKey");
                window.location.href = "pedido-confirmado.html";
            } catch (erro) {
                console.error(erro);
                alert(erro.message || "Não foi possível conectar ao servidor.");
                botao.hidden = false;
                botao.disabled = false;
                botao.textContent = "FINALIZAR PEDIDO";
                document.querySelectorAll('input[name="pagamento"],input[name="recebimento"]').forEach(input => input.disabled = false);
            }
        });

        carregarResumoCheckout();
