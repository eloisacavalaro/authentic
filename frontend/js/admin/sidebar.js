document.addEventListener("DOMContentLoaded", () => {
    const usuario = JSON.parse(localStorage.getItem("usuario") || "null");
    if (!localStorage.getItem("token") || !usuario || usuario.tipo !== "admin") {
        window.location.replace("../login.html");
        return;
    }
    const btnMenu = document.getElementById("btnMenuMobile");
    const sidebar = document.querySelector(".sidebar");
    const backdrop = document.getElementById("sidebarBackdrop");

    if (btnMenu && sidebar && backdrop) {
        // Abrir Menu
        btnMenu.addEventListener("click", () => {
            sidebar.classList.add("open");
            backdrop.classList.add("active");
        });

        // Fechar ao clicar no fundo escuro
        backdrop.addEventListener("click", () => {
            sidebar.classList.remove("open");
            backdrop.classList.remove("active");
        });

        // Fechar gaveta ao clicar em qualquer link da sidebar
        const navLinks = sidebar.querySelectorAll(".nav-item");
        navLinks.forEach(link => {
            link.addEventListener("click", () => {
                sidebar.classList.remove("open");
                backdrop.classList.remove("active");
            });
        });
    }
});
