(function configurarApi(global) {
    "use strict";

    const local = ["localhost", "127.0.0.1"].includes(global.location.hostname);
    const API_URL = local ? "http://localhost:3000" : "https://authentic-api-h42a.onrender.com";

    async function apiFetch(recurso, opcoes = {}) {
        const url = typeof recurso === "string" && recurso.startsWith("/") ? `${API_URL}${recurso}` : recurso;
        const destino = new URL(typeof url === "string" ? url : url.url, global.location.href);
        const configuracao = { ...opcoes, headers: { ...(opcoes.headers || {}) } };
        delete configuracao.headers.Authorization;
        delete configuracao.headers.authorization;
        if (destino.origin === API_URL) configuracao.credentials = "include";
        return global.fetch(url, configuracao);
    }

    const tagsPermitidas = new Set(["A", "ARTICLE", "BUTTON", "DIV", "H2", "H3", "IMG", "OPTION", "P", "SMALL", "SPAN", "STRONG", "TD", "TR"]);
    const atributosPermitidos = new Set(["alt", "aria-label", "class", "colspan", "data-cart-action", "data-confirm-payment", "data-delete-expense", "data-disable-product", "data-edit-stock", "data-id", "data-index", "data-preco", "data-quantity", "data-status-atual", "data-view-client", "data-view-order", "disabled", "href", "id", "selected", "src", "style", "title", "type", "value"]);
    function fragmentoHtmlSeguro(html) {
        const documento = new DOMParser().parseFromString(`<body>${String(html ?? "")}</body>`, "text/html");
        for (const elemento of [...documento.body.querySelectorAll("*")]) {
            if (!tagsPermitidas.has(elemento.tagName)) { elemento.replaceWith(...elemento.childNodes); continue; }
            for (const atributo of [...elemento.attributes]) {
                const nome = atributo.name.toLowerCase();
                if (nome.startsWith("on") || !atributosPermitidos.has(nome)) elemento.removeAttribute(atributo.name);
            }
            for (const atributo of ["href", "src"]) {
                const valor = elemento.getAttribute(atributo);
                if (valor && !/^(?:https?:|\/|\.\.?\/|#)/i.test(valor)) elemento.removeAttribute(atributo);
            }
        }
        const fragmento = document.createDocumentFragment();
        fragmento.append(...documento.body.childNodes);
        return fragmento;
    }

    Object.defineProperty(Element.prototype, "safeHTML", {
        configurable: false,
        set(html) { this.replaceChildren(fragmentoHtmlSeguro(html)); }
    });

    global.AUTHENTIC_API_URL = API_URL;
    global.AUTHENTIC_SESSION = true;
    global.apiFetch = apiFetch;
})(window);
