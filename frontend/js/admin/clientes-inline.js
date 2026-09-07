document.addEventListener("DOMContentLoaded", () => {
            const btnMenu = document.getElementById("btnMenuMobile");
            const sidebar = document.querySelector(".sidebar");
            const backdrop = document.getElementById("sidebarBackdrop");

            if (btnMenu && sidebar && backdrop) {
                btnMenu.addEventListener("click", () => {
                    sidebar.classList.add("open");
                    backdrop.classList.add("active");
                });

                backdrop.addEventListener("click", () => {
                    sidebar.classList.remove("open");
                    backdrop.classList.remove("active");
                });

                sidebar.querySelectorAll(".nav-item").forEach(link => {
                    link.addEventListener("click", () => {
                        sidebar.classList.remove("open");
                        backdrop.classList.remove("active");
                    });
                });
            }
        });
