
const API_URL = ["localhost", "127.0.0.1"].includes(location.hostname) ? "http://localhost:3000" : location.origin;

const listaClientes = document.getElementById("listaClientes");
const buscarCliente = document.getElementById("buscarCliente");
const emptyState = document.getElementById("emptyState");

const cardTotalClientes = document.getElementById("cardTotalClientes");
const cardCompradoresAtivos = document.getElementById("cardCompradoresAtivos");
const cardTicketMedio = document.getElementById("cardTicketMedio");

const totalClientesContador = document.getElementById("totalClientesContador");

let clientes = [];


// =========================================================
// FORMATAR MOEDA
// =========================================================

function formatarMoeda(valor) {

    return Number(valor || 0).toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL"
    });

}


// =========================================================
// FORMATAR DATA
// =========================================================

function formatarData(data) {

    if (!data) {
        return "—";
    }

    return new Date(data).toLocaleDateString("pt-BR");

}


// =========================================================
// CARREGAR CLIENTES
// =========================================================

async function carregarClientes() {

    const token = localStorage.getItem("token");

    if (!token) {

        alert("Você precisa estar logado como administrador.");

        return;
    }


    try {

        const resposta = await fetch(
            `${API_URL}/clientes`,
            {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            }
        );


        if (!resposta.ok) {

            if (resposta.status === 401) {

                alert("Sessão expirada. Faça login novamente.");

                localStorage.removeItem("token");
                localStorage.removeItem("usuario");

                return;
            }


            if (resposta.status === 403) {

                alert("Acesso permitido apenas para administradores.");

                return;
            }


            throw new Error("Erro ao buscar clientes.");
        }


        clientes = await resposta.json();


        atualizarMetricas();

        renderizarClientes();


    } catch (erro) {

        console.error("Erro ao carregar clientes:", erro);


        listaClientes.innerHTML = `
            <tr>
                <td colspan="6" class="table-loading">
                    Não foi possível carregar os clientes.
                </td>
            </tr>
        `;

    }

}


// =========================================================
// ATUALIZAR MÉTRICAS
// =========================================================

function atualizarMetricas() {

    const total = clientes.length;


    // Total de pedidos
    const totalPedidos = clientes.reduce(
        (total, cliente) => {

            return total + Number(
                cliente.quantidade_pedidos || 0
            );

        },
        0
    );


    // Total gasto por todos os clientes
    const totalGasto = clientes.reduce(
        (total, cliente) => {

            return total + Number(
                cliente.total_gasto || 0
            );

        },
        0
    );


    // Clientes que já fizeram pelo menos um pedido
    const compradoresAtivos = clientes.filter(
        cliente => Number(
            cliente.quantidade_pedidos || 0
        ) > 0
    ).length;


    // Ticket médio
    const ticketMedio =
        total > 0
            ? totalGasto / total
            : 0;


    cardTotalClientes.textContent = total;

    cardCompradoresAtivos.textContent = compradoresAtivos;

    cardTicketMedio.textContent =
        formatarMoeda(ticketMedio);

}


// =========================================================
// RENDERIZAR CLIENTES
// =========================================================

function renderizarClientes() {

    const termo =
        buscarCliente.value
            .toLowerCase()
            .trim();


    const clientesFiltrados =
        clientes.filter(cliente => {

            const nome =
                (cliente.nome || "")
                    .toLowerCase();


            const email =
                (cliente.email || "")
                    .toLowerCase();


            const telefone =
                (cliente.telefone || "")
                    .toLowerCase();


            return (
                nome.includes(termo) ||
                email.includes(termo) ||
                telefone.includes(termo)
            );

        });


    totalClientesContador.textContent =
        clientesFiltrados.length;


    // Nenhum resultado
    if (clientesFiltrados.length === 0) {

        listaClientes.innerHTML = "";

        emptyState.style.display = "block";

        return;
    }


    emptyState.style.display = "none";


    listaClientes.innerHTML =
        clientesFiltrados
            .map(criarLinhaCliente)
            .join("");

}


// =========================================================
// CRIAR LINHA DO CLIENTE
// =========================================================

function criarLinhaCliente(cliente) {

    const quantidadePedidos =
        Number(
            cliente.quantidade_pedidos || 0
        );


    const totalGasto =
        Number(
            cliente.total_gasto || 0
        );


    return `
        <tr>

            <td>

                <span class="client-name">
                    ${cliente.nome || "Cliente"}
                </span>

                <span class="client-email">
                    ${cliente.email || "Sem e-mail"}
                </span>

            </td>


            <td>

                <span class="client-phone">
                    ${cliente.telefone || "Não cadastrado"}
                </span>

            </td>


            <td>

                <span class="client-date">
                    ${formatarData(cliente.criado_em)}
                </span>

            </td>


            <td>

                <span class="client-orders">
                    ${quantidadePedidos}
                </span>

            </td>


            <td>

                <span class="client-total">
                    ${formatarMoeda(totalGasto)}
                </span>

            </td>


            <td>

                <button
                    class="view-client"
                    onclick="verCliente(${cliente.id})"
                >
                    VER →
                </button>

            </td>

        </tr>
    `;

}


// =========================================================
// VER CLIENTE
// =========================================================

function verCliente(id) {

    const cliente =
        clientes.find(
            cliente => cliente.id === id
        );


    if (!cliente) {
        return;
    }


    alert(
        `Cliente: ${cliente.nome}\n` +
        `E-mail: ${cliente.email}\n` +
        `Telefone: ${cliente.telefone || "Não cadastrado"}\n` +
        `Pedidos: ${cliente.quantidade_pedidos || 0}\n` +
        `Total gasto: ${formatarMoeda(cliente.total_gasto)}`
    );

}


// =========================================================
// BUSCA
// =========================================================

buscarCliente.addEventListener(
    "input",
    renderizarClientes
);


// =========================================================
// INICIAR
// =========================================================

carregarClientes();
