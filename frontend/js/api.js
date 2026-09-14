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

    const tagsPermitidas = new Set(["A", "ARTICLE", "BUTTON", "DIV", "H2", "H3", "IMG", "LI", "OPTION", "P", "SELECT", "SMALL", "SPAN", "STRONG", "TD", "TH", "TR", "UL"]);
    const atributosPermitidos = new Set(["alt", "aria-label", "class", "colspan", "data-cart-action", "data-confirm-payment", "data-delete-expense", "data-disable-product", "data-edit-stock", "data-id", "data-index", "data-preco", "data-quantity", "data-status-atual", "data-view-client", "data-view-order", "disabled", "href", "id", "selected", "src", "style", "title", "type", "value"]);
    function fragmentoHtmlSeguro(html, contexto) {
        const conteudo = String(html ?? "");
        const tagContexto = contexto?.tagName;
        const envoltorio = tagContexto === "TBODY"
            ? `<table><tbody id="safe-root">${conteudo}</tbody></table>`
            : tagContexto === "TR"
                ? `<table><tbody><tr id="safe-root">${conteudo}</tr></tbody></table>`
                : tagContexto === "SELECT"
                    ? `<select id="safe-root">${conteudo}</select>`
                    : `<div id="safe-root">${conteudo}</div>`;
        const documento = new DOMParser().parseFromString(envoltorio, "text/html");
        const raiz = documento.getElementById("safe-root");
        if (!raiz) return document.createDocumentFragment();
        for (const elemento of [...raiz.querySelectorAll("*")]) {
            if (!tagsPermitidas.has(elemento.tagName)) { elemento.replaceWith(...elemento.childNodes); continue; }
            for (const atributo of [...elemento.attributes]) {
                const nome = atributo.name.toLowerCase();
                if (nome.startsWith("on") || !atributosPermitidos.has(nome)) elemento.removeAttribute(atributo.name);
            }
            for (const atributo of ["href", "src"]) {
                const valor = elemento.getAttribute(atributo);
                if (!valor) continue;
                const dataImagemSegura = atributo === "src" && elemento.tagName === "IMG" && /^data:image\/(?:png|jpe?g|webp);base64,/i.test(valor);
                let protocoloSeguro = false;
                try {
                    const url = new URL(valor, global.location.href);
                    protocoloSeguro = ["http:", "https:", "mailto:", "tel:"].includes(url.protocol);
                } catch (_) {}
                if (!dataImagemSegura && !protocoloSeguro && !valor.startsWith("#")) elemento.removeAttribute(atributo);
            }
        }
        const fragmento = document.createDocumentFragment();
        fragmento.append(...raiz.childNodes);
        return fragmento;
    }

    Object.defineProperty(Element.prototype, "safeHTML", {
        configurable: false,
        set(html) { this.replaceChildren(fragmentoHtmlSeguro(html, this)); }
    });

    global.AUTHENTIC_API_URL = API_URL;
    global.AUTHENTIC_PRODUCT_IMAGE_URL = nome => {
        const referencia = String(nome || "").trim();
        if (!referencia) return "";
        if (/^https?:\/\//i.test(referencia)) return referencia;
        return `${API_URL}/images/produtos/${encodeURIComponent(referencia)}`;
    };
    global.AUTHENTIC_SESSION = true;
    global.apiFetch = apiFetch;
})(window);
