const API_URL = ["localhost", "127.0.0.1"].includes(location.hostname) ? "http://localhost:3000" : location.origin;
const token = localStorage.getItem("token");

if (!token) {
    window.location.href = "login.html";
}

const modalCupom = document.getElementById("modalCupom");
const listaCupons = document.getElementById("listaCupons");
const formCupom = document.getElementById("formCupom");

async function carregarCupons() {
    try {
        const res = await fetch(`${API_URL}/cupons`, {
            headers: { Authorization: `Bearer ${token}` }
        });

        if (!res.ok) {
            throw new Error("Erro ao buscar cupons.");
        }

        const cupons = await res.json();

        if (!cupons || cupons.length === 0) {
            listaCupons.innerHTML = `<tr><td colspan="6" class="table-loading">Nenhum cupom ativo no momento.</td></tr>`;
            return;
        }

        listaCupons.innerHTML = cupons.map(c => `
            <tr>
                <td><strong style="background:#f4f4f4; padding:4px 8px; border-radius:4px; font-family: monospace;">${c.codigo}</strong></td>
                <td>${c.tipo === 'porcentagem' ? `${Number(c.valor)}%` : `R$ ${Number(c.valor).toFixed(2).replace('.', ',')}`}</td>
                <td>${Number(c.valor_minimo_pedido) > 0 ? `R$ ${Number(c.valor_minimo_pedido).toFixed(2).replace('.', ',')}` : 'Sem mínimo'}</td>
                <td>${c.usos_atuais || 0} ${c.limite_usos ? `/ ${c.limite_usos}` : ''}</td>
                <td>${c.data_validade ? new Date(c.data_validade).toLocaleDateString("pt-BR") : 'Sem prazo'}</td>
                <td><span style="background: #eef7f2; color: #3e7b5f; padding: 4px 8px; border-radius: 4px; font-weight: 700; font-size: 10px;">ATIVO</span></td>
            </tr>
        `).join("");
    } catch (err) {
        console.error(err);
        listaCupons.innerHTML = `<tr><td colspan="6" class="table-loading" style="color:#b91c1c;">Erro ao carregar os cupons.</td></tr>`;
    }
}

if (formCupom) {
    formCupom.addEventListener("submit", async (e) => {
        e.preventDefault();

        const payload = {
            codigo: document.getElementById("cupomCodigo").value.trim().toUpperCase(),
            tipo: document.getElementById("cupomTipo").value,
            valor: Number(document.getElementById("cupomValor").value),
            valor_minimo_pedido: Number(document.getElementById("cupomMinimo").value || 0),
            limite_usos: document.getElementById("cupomLimite").value ? Number(document.getElementById("cupomLimite").value) : null,
            data_validade: document.getElementById("cupomValidade").value || null
        };

        try {
            const res = await fetch(`${API_URL}/cupons`, {
                method: "POST",
                headers: { 
                    "Content-Type": "application/json", 
                    Authorization: `Bearer ${token}` 
                },
                body: JSON.stringify(payload)
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.erro || "Erro ao criar cupom.");

            alert("Cupom ativado com sucesso!");
            modalCupom.classList.remove("active");
            formCupom.reset();
            carregarCupons();
        } catch (err) {
            alert(err.message);
        }
    });
}

// Controle do Modal
const btnNovoCupom = document.getElementById("btnNovoCupom");
const fecharModalCupom = document.getElementById("fecharModalCupom");
const cancelarCupom = document.getElementById("cancelarCupom");

if (btnNovoCupom) btnNovoCupom.onclick = () => modalCupom.classList.add("active");
if (fecharModalCupom) fecharModalCupom.onclick = () => modalCupom.classList.remove("active");
if (cancelarCupom) cancelarCupom.onclick = () => modalCupom.classList.remove("active");

document.addEventListener("DOMContentLoaded", carregarCupons);
