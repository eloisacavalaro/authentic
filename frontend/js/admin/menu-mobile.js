document.addEventListener("DOMContentLoaded", async () => {
    try {
        const resposta = await apiFetch("/api/auth/me", { cache: "no-store" });
        const dados = await resposta.json().catch(() => ({}));
        if (!resposta.ok || dados.usuario?.tipo !== "admin") throw new Error("Acesso negado");
        localStorage.setItem("usuario", JSON.stringify(dados.usuario));
    } catch (_) {
        window.location.replace("../login.html");
        return;
    }
    const botao = document.getElementById("btnMenuMobile");
    const sidebar = document.querySelector(".sidebar");
    if (!botao || !sidebar) return;
    const backdrop = document.createElement("div");
    backdrop.className = "sidebar-backdrop";
    document.body.appendChild(backdrop);
    const definirAberto = aberto => {
        sidebar.classList.toggle("open", aberto);
        backdrop.classList.toggle("active", aberto);
        botao.setAttribute("aria-expanded", String(aberto));
        document.body.classList.toggle("menu-open", aberto);
    };
    botao.addEventListener("click", () => definirAberto(!sidebar.classList.contains("open")));
    backdrop.addEventListener("click", () => definirAberto(false));
    sidebar.querySelectorAll("a").forEach(link => link.addEventListener("click", () => definirAberto(false)));
    document.addEventListener("keydown", evento => { if (evento.key === "Escape") definirAberto(false); });
    window.addEventListener("resize", () => { if (window.innerWidth > 768) definirAberto(false); });
});
