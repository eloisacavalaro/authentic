require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const pool = require("./db");
const bcrypt = require("bcrypt");
const Joi = require("joi");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const autenticar = require("./authMiddleware");
const apenasAdmin = require("./adminMiddleware");
const gateway = require("./paymentGateway");

// Verificação de ambiente mandatório
if (!process.env.JWT_SECRET) {
    console.error("ERRO FATAL: JWT_SECRET não está definido nas variáveis de ambiente!");
    process.exit(1);
}

if (process.env.NODE_ENV === "production") {
    const faltantes = ["CORS_ORIGIN", "APP_PUBLIC_URL", "MERCADO_PAGO_ACCESS_TOKEN", "MERCADO_PAGO_PUBLIC_KEY", "MERCADO_PAGO_WEBHOOK_SECRET"]
        .filter(nome => !process.env[nome]);
    if (String(process.env.JWT_SECRET).length < 32) faltantes.push("JWT_SECRET (minimo de 32 caracteres)");
    if (!/^https:\/\//i.test(process.env.APP_PUBLIC_URL || "")) faltantes.push("APP_PUBLIC_URL (HTTPS)");
    if (faltantes.length) {
        console.error(`ERRO FATAL: configuracao de producao ausente/invalida: ${faltantes.join(", ")}`);
        process.exit(1);
    }
}

const app = express();
const PORT = process.env.PORT || 3000;


// =========================================================
// CORREÇÃO: proxy confiável
// =========================================================
// Necessário para o express-rate-limit identificar o IP real
// do visitante (via X-Forwarded-For) quando a API roda atrás
// de um proxy reverso ou plataforma de hospedagem (Render,
// Heroku, Nginx, etc.). Ajuste o valor conforme sua infra —
// "1" cobre um único proxy na frente da aplicação.
app.set("trust proxy", 1);


// =========================================================
// CONFIGURAÇÃO SEGURA DO MULTER
// =========================================================
// CORREÇÃO: a extensão do arquivo salvo NUNCA vem do nome
// enviado pelo cliente. Antes, `filename()` usava
// path.extname(file.originalname) — e mesmo com o fileFilter
// checando a extensão do nome original, o regex de checagem
// não tinha "$" no final (/jpeg|jpg|png|webp/), então aceitava
// qualquer string que apenas CONTIVESSE esse trecho em algum
// lugar, não necessariamente no final do nome.
//
// Agora a extensão final vem de uma tabela fixa baseada no
// mimetype já validado. A checagem do nome original continua
// existindo (mais como filtro de usabilidade, com regex
// ancorado no fim da string), mas não decide mais qual
// extensão é gravada em disco.

const extensaoPorMimetype = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp"
};

const tiposPermitidos = Object.keys(extensaoPorMimetype);
const diretorioUploads = path.join(__dirname, "../frontend/images/produtos");
fs.mkdirSync(diretorioUploads, { recursive: true });

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, diretorioUploads);
    },
    filename: function (req, file, cb) {
        const extensao = extensaoPorMimetype[file.mimetype] || ".jpg";
        const nomeArquivo = `${Date.now()}-${Math.round(Math.random() * 1e9)}${extensao}`;
        cb(null, nomeArquivo);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
    fileFilter: function (req, file, cb) {
        const extensaoOriginal = path.extname(file.originalname).toLowerCase();

        // Regex ancorado no fim da string — não basta conter
        // "jpg" em algum lugar, precisa terminar com a extensão.
        const extensaoValida = /\.(jpe?g|png|webp)$/.test(extensaoOriginal);
        const mimetypeValido = tiposPermitidos.includes(file.mimetype);

        if (extensaoValida && mimetypeValido) {
            cb(null, true);
        } else {
            cb(new Error("Formato inválido. Apenas JPG, PNG ou WEBP são aceitos."));
        }
    }
});

// =========================================================
// MIDDLEWARES DE SEGURANÇA E PARSING
// =========================================================
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "https://sdk.mercadopago.com"],
            // Temporário até a etapa de remoção dos handlers legados onclick/onerror.
            scriptSrcAttr: ["'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "https://viacep.com.br", "https://api.mercadopago.com", "https://*.mercadopago.com", ...(process.env.CORS_ORIGIN || "").split(",").map(v => v.trim()).filter(Boolean)],
            frameSrc: ["'self'", "https://*.mercadopago.com"]
        }
    }
}));


// =========================================================
// CORREÇÃO: CORS configurável em vez de aberto para qualquer origem
// =========================================================
// cors() sem opções libera qualquer site para chamar a API.
// A lista de origens confiáveis agora vem de uma variável de
// ambiente (CORS_ORIGIN="https://seusite.com,https://admin.seusite.com").
// Sem essa variável, mantém o comportamento aberto (para não
// quebrar o ambiente atual) mas avisa no log — configure isso
// em produção.

const origensPermitidas = (process.env.CORS_ORIGIN || "")
    .split(",")
    .map(origem => origem.trim())
    .filter(Boolean);

if (origensPermitidas.length === 0) {
    console.warn(
        "AVISO: CORS_ORIGIN não definido no .env — a API está aceitando requisições de qualquer origem. Defina CORS_ORIGIN em produção."
    );
}

app.use(cors({
    origin(origem, callback) {
        if (!origem || origensPermitidas.includes(origem) || (process.env.NODE_ENV !== "production" && origensPermitidas.length === 0)) {
            return callback(null, true);
        }
        callback(new Error("Origem nao permitida por CORS."));
    }
}));


// =========================================================
// CORREÇÃO: limite de tamanho no corpo das requisições JSON
// =========================================================
// Sem limite, um payload JSON enorme e repetido pode consumir
// memória/CPU do servidor antes mesmo de qualquer validação.
app.use((req, res, next) => {
    if (process.env.NODE_ENV === "production" && !req.secure && process.env.ALLOW_INSECURE_HTTP !== "true") {
        return res.status(426).json({ erro: "HTTPS obrigatorio." });
    }
    next();
});
app.use(express.json({ limit: "50kb" }));

app.use("/frontend", express.static(path.join(__dirname, "../frontend")));
app.get("/", (req, res) => res.redirect("/frontend/pages/index.html"));

const idValido = valor => Number.isSafeInteger(Number(valor)) && Number(valor) > 0;
const dinheiroValido = valor => Number.isFinite(Number(valor)) && Number(valor) >= 0;
const quantidadeValida = valor => Number.isSafeInteger(Number(valor)) && Number(valor) >= 0;
const minutosReserva = Math.max(5, Math.min(120, Number(process.env.RESERVA_ESTOQUE_MINUTOS) || 30));

async function auditar(client, req, acao, entidade, entidadeId, dados = {}) {
    await client.query(
        "INSERT INTO auditoria(usuario_id,acao,entidade,entidade_id,dados,ip) VALUES($1,$2,$3,$4,$5,$6)",
        [req?.usuario?.id || null, acao, entidade, entidadeId || null, JSON.stringify(dados), req?.ip || null]
    );
}

async function movimentarEstoque(client, { estoqueId, usuarioId = null, tipo, quantidade, saldoAnterior, referenciaTipo, referenciaId, observacao = null }) {
    await client.query(`INSERT INTO movimentacoes_estoque
        (estoque_id,usuario_id,tipo,quantidade,saldo_anterior,saldo_posterior,referencia_tipo,referencia_id,observacao)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [estoqueId, usuarioId, tipo, quantidade, saldoAnterior, saldoAnterior + quantidade, referenciaTipo, referenciaId, observacao]);
}

async function sincronizarPagamentoMercadoPago(recurso, req = null) {
    const pedidoId = Number(recurso.external_reference || recurso.metadata?.pedido_id);
    if (!idValido(pedidoId) || !recurso.id) throw new Error("Pagamento sem referencia de pedido valida.");
    const novoStatusGateway = gateway.statusLocal(recurso.status);
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const atualRes = await client.query(`SELECT pg.*,p.status AS pedido_status,p.reserva_expira_em,p.reserva_liberada_em
            FROM pagamentos pg JOIN pedidos p ON p.id=pg.pedido_id WHERE pg.pedido_id=$1 FOR UPDATE OF pg,p`, [pedidoId]);
        if (!atualRes.rows.length) throw new Error("Pedido do pagamento nao encontrado.");
        const atual = atualRes.rows[0];
        if (Math.abs(Number(atual.valor) - Number(recurso.transaction_amount)) > 0.009) throw new Error("Valor retornado pelo gateway diverge do pedido.");

        let novoStatus = novoStatusGateway;
        if (novoStatusGateway === "pago" && (atual.pedido_status === "cancelado" || atual.reserva_liberada_em)) {
            novoStatus = "estorno_pendente";
        }
        const metodo = recurso.payment_method_id === "pix" ? "pix" :
            (["credit_card", "debit_card", "prepaid_card"].includes(recurso.payment_type_id) ? "cartao" : atual.metodo);
        await client.query(`UPDATE pagamentos SET provedor='mercado_pago',transacao_id=$1,metodo=$2,status=$3,
            status_detalhe=$4,pago_em=CASE WHEN $3='pago' THEN COALESCE(pago_em,NOW()) ELSE pago_em END,
            ultima_reconciliacao_em=NOW(),atualizado_em=NOW() WHERE id=$5`,
            [String(recurso.id), metodo, novoStatus, String(recurso.status_detail || "").slice(0,120) || null, atual.id]);

        if (novoStatus === "pago") {
            await client.query(`UPDATE pedidos SET status=CASE WHEN status='aguardando_pagamento' THEN 'processando' ELSE status END,
                reserva_expira_em=NULL,atualizado_em=NOW() WHERE id=$1`, [pedidoId]);
        }
        if (novoStatus === "estornado" && atual.status === "pago" && atual.pedido_status !== "cancelado") {
            const itens = await client.query("SELECT produto_id,tamanho,cor,quantidade FROM itens_pedido WHERE pedido_id=$1", [pedidoId]);
            for (const item of itens.rows) {
                const saldo = await client.query("SELECT id,quantidade FROM estoque WHERE produto_id=$1 AND tamanho=$2 AND cor=$3 FOR UPDATE", [item.produto_id,item.tamanho,item.cor]);
                if (saldo.rows.length) {
                    await client.query("UPDATE estoque SET quantidade=quantidade+$1,atualizado_em=NOW() WHERE id=$2", [item.quantidade,saldo.rows[0].id]);
                    await movimentarEstoque(client,{ estoqueId:saldo.rows[0].id,tipo:"cancelamento",quantidade:Number(item.quantidade),saldoAnterior:Number(saldo.rows[0].quantidade),referenciaTipo:"pedido",referenciaId:pedidoId,observacao:"Estorno confirmado pelo Mercado Pago" });
                }
            }
            await client.query("UPDATE pedidos SET status='cancelado',reserva_liberada_em=COALESCE(reserva_liberada_em,NOW()),atualizado_em=NOW() WHERE id=$1", [pedidoId]);
        }
        await auditar(client, req, "sincronizar_gateway", "pagamento", atual.id, { pedido_id: pedidoId, anterior: atual.status, novo: novoStatus, transacao_id: String(recurso.id) });
        await client.query("COMMIT");
        return { pagamento_id: atual.id, pedido_id: pedidoId, status: novoStatus };
    } catch (erro) { await client.query("ROLLBACK"); throw erro; }
    finally { client.release(); }
}

function respostaPagamentoSegura(recurso) {
    const transacao = recurso.point_of_interaction?.transaction_data || {};
    return {
        payment_id: String(recurso.id),
        status: gateway.statusLocal(recurso.status),
        status_gateway: recurso.status,
        status_detalhe: recurso.status_detail || null,
        metodo: recurso.payment_method_id === "pix" ? "pix" : "cartao",
        pix: recurso.payment_method_id === "pix" ? {
            qr_code: transacao.qr_code || null,
            qr_code_base64: transacao.qr_code_base64 || null,
            ticket_url: transacao.ticket_url || null
        } : null
    };
}

async function liberarReservasExpiradas() {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const expirados = await client.query(`
            SELECT id, cupom_id FROM pedidos
            WHERE status='aguardando_pagamento'
              AND reserva_expira_em IS NOT NULL AND reserva_expira_em <= NOW()
              AND reserva_liberada_em IS NULL
            FOR UPDATE SKIP LOCKED
        `);
        for (const pedido of expirados.rows) {
            const itens = await client.query(
                "SELECT produto_id,tamanho,cor,quantidade FROM itens_pedido WHERE pedido_id=$1", [pedido.id]
            );
            for (const item of itens.rows) {
                const saldo = await client.query("SELECT id,quantidade FROM estoque WHERE produto_id=$1 AND tamanho=$2 AND cor=$3 FOR UPDATE", [item.produto_id,item.tamanho,item.cor]);
                if (!saldo.rows.length) throw new Error(`Estoque da reserva ${pedido.id} nao encontrado.`);
                await client.query("UPDATE estoque SET quantidade=quantidade+$1, atualizado_em=NOW() WHERE id=$2", [item.quantidade,saldo.rows[0].id]);
                await movimentarEstoque(client, { estoqueId: saldo.rows[0].id, tipo: "expiracao", quantidade: Number(item.quantidade), saldoAnterior: Number(saldo.rows[0].quantidade), referenciaTipo: "pedido", referenciaId: pedido.id });
            }
            await client.query(`UPDATE pedidos SET status='cancelado', reserva_liberada_em=NOW(), atualizado_em=NOW()
                WHERE id=$1`, [pedido.id]);
            await client.query(`UPDATE pagamentos SET status='cancelado', atualizado_em=NOW()
                WHERE pedido_id=$1 AND status IN ('pendente','recusado')`, [pedido.id]);
            if (pedido.cupom_id) {
                await client.query("UPDATE cupons SET usos_atuais=GREATEST(usos_atuais-1,0) WHERE id=$1", [pedido.cupom_id]);
            }
        }
        await client.query("COMMIT");
        return expirados.rowCount;
    } catch (erro) {
        await client.query("ROLLBACK");
        throw erro;
    } finally { client.release(); }
}

const limpezaReservas = setInterval(() => {
    liberarReservasExpiradas().catch(erro => console.error("Erro ao liberar reservas:", erro.message));
}, 60_000);
limpezaReservas.unref();

// Servir imagens estáticas ANTES do rate limiting para não esgotar as requisições do usuário
app.use(
    "/images/produtos",
    express.static(path.join(__dirname, "../frontend/images/produtos"))
);

// =========================================================
// RATE LIMITERS
// =========================================================
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { erro: "Muitas requisições. Tente novamente mais tarde." }
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { erro: "Muitas tentativas de autenticação. Tente em 15 minutos." }
});

app.use(limiter);

// =========================================================
// TESTES
// =========================================================
app.get("/teste", (req, res) => {
    res.json({ mensagem: "API da AUTHENTIC online e operante!" });
});

app.get("/teste-banco", async (req, res) => {
    try {
        const resultado = await pool.query("SELECT NOW()");
        res.json({ mensagem: "Banco conectado com sucesso!", data: resultado.rows[0].now });
    } catch (erro) {
        res.status(500).json({ erro: "Falha de conexão com o banco de dados." });
    }
});

// =========================================================
// AUTENTICAÇÃO E USUÁRIOS
// =========================================================
const usuarioSchema = Joi.object({
    nome: Joi.string().min(2).max(100).required(),
    email: Joi.string().email().max(150).required(),
    telefone: Joi.string().max(20).allow(""),
    senha: Joi.string().min(8).max(100).required()
});

app.post("/usuarios", authLimiter, async (req, res) => {
    try {
        const { error, value } = usuarioSchema.validate(req.body);
        if (error) return res.status(400).json({ erro: error.details[0].message });

        const { nome, telefone, senha } = value;
        const email = value.email.trim().toLowerCase();

        // Verificar e-mail duplicado
        const existe = await pool.query("SELECT id FROM usuarios WHERE email = $1", [email]);
        if (existe.rows.length > 0) {
            return res.status(409).json({ erro: "Este e-mail já está cadastrado." });
        }

        const senhaHash = await bcrypt.hash(senha, 10);
        const resultado = await pool.query(
            `INSERT INTO usuarios (nome, email, telefone, senha)
             VALUES ($1, $2, $3, $4)
             RETURNING id, nome, email, telefone, tipo, criado_em`,
            [nome, email, telefone, senhaHash]
        );

        res.status(201).json(resultado.rows[0]);
    } catch (erro) {
        console.error(erro);
        res.status(500).json({ erro: "Erro ao cadastrar usuário." });
    }
});


// =========================================================
// CORREÇÃO: validação de formato também no login
// =========================================================
// A checagem `if (!email || !senha)` cobre campos ausentes,
// mas não formato. Adiciona uma validação leve de e-mail antes
// de consultar o banco — a consulta já é parametrizada (segura
// contra SQL injection de qualquer forma), isso é só para
// rejeitar entradas malformadas mais cedo, com uma resposta
// clara.

const loginSchema = Joi.object({
    email: Joi.string().email().max(150).required(),
    senha: Joi.string().min(1).max(100).required()
});

app.post("/login", authLimiter, async (req, res) => {
    try {
        const { email, senha } = req.body;

        const { error } = loginSchema.validate({ email, senha });
        if (error) {
            return res.status(400).json({ erro: "E-mail e senha são obrigatórios." });
        }

        const resultado = await pool.query("SELECT * FROM usuarios WHERE LOWER(email) = LOWER($1) AND ativo = true", [email]);
        if (resultado.rows.length === 0) {
            return res.status(401).json({ erro: "Credenciais inválidas." });
        }

        const usuario = resultado.rows[0];
        const senhaCorreta = await bcrypt.compare(senha, usuario.senha);
        if (!senhaCorreta) {
            return res.status(401).json({ erro: "Credenciais inválidas." });
        }

        const token = jwt.sign(
            { id: usuario.id, tipo: usuario.tipo, nome: usuario.nome, email: usuario.email },
            process.env.JWT_SECRET,
            { expiresIn: "4h" }
        );

        res.json({
            mensagem: "Login realizado com sucesso!",
            token,
            usuario: {
                id: usuario.id,
                nome: usuario.nome,
                email: usuario.email,
                tipo: usuario.tipo
            }
        });
    } catch (erro) {
        console.error(erro);
        res.status(500).json({ erro: "Erro interno no processo de login." });
    }
});

app.get("/perfil", autenticar, async (req, res) => {
    const resultado = await pool.query(
        "SELECT id, nome, email, telefone, tipo, criado_em FROM usuarios WHERE id = $1 AND ativo = true",
        [req.usuario.id]
    );
    if (!resultado.rows.length) return res.status(404).json({ erro: "Usuário não encontrado." });
    res.json({ usuario: resultado.rows[0] });
});

app.get("/api/auth/me", autenticar, async (req, res) => {
    const resultado = await pool.query(
        "SELECT id,nome,email,telefone,tipo,criado_em FROM usuarios WHERE id=$1 AND ativo=true",
        [req.usuario.id]
    );
    if (!resultado.rows.length) return res.status(401).json({ erro: "Sessao invalida." });
    res.set("Cache-Control", "no-store");
    res.json({ usuario: resultado.rows[0] });
});

app.get("/api/config/payment", (req, res) => {
    if (!process.env.MERCADO_PAGO_PUBLIC_KEY) return res.status(503).json({ erro: "Pagamento online nao configurado." });
    res.set("Cache-Control", "no-store");
    res.json({ gateway: "mercado_pago", public_key: process.env.MERCADO_PAGO_PUBLIC_KEY });
});

app.patch("/perfil", autenticar, async (req, res) => {
    const schema = Joi.object({
        nome: Joi.string().trim().min(2).max(100).required(),
        telefone: Joi.string().trim().max(20).allow("").required()
    });
    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ erro: "Nome ou telefone inválido." });
    const resultado = await pool.query(
        `UPDATE usuarios SET nome = $1, telefone = NULLIF($2, ''), atualizado_em = NOW()
         WHERE id = $3 AND ativo = true RETURNING id, nome, email, telefone, tipo`,
        [value.nome, value.telefone, req.usuario.id]
    );
    if (!resultado.rows.length) return res.status(404).json({ erro: "Usuário não encontrado." });
    res.json({ mensagem: "Dados atualizados.", usuario: resultado.rows[0] });
});

app.put("/alterar-senha", autenticar, async (req, res) => {
    try {
        const { senhaAtual, novaSenha } = req.body;
        if (!senhaAtual || !novaSenha || novaSenha.length < 8) {
            return res.status(400).json({ erro: "A nova senha deve ter no mínimo 8 caracteres." });
        }

        const resultado = await pool.query("SELECT senha FROM usuarios WHERE id = $1", [req.usuario.id]);
        if (resultado.rows.length === 0) return res.status(404).json({ erro: "Usuário inexistente." });

        const confere = await bcrypt.compare(senhaAtual, resultado.rows[0].senha);
        if (!confere) return res.status(401).json({ erro: "Senha atual incorreta." });

        const hash = await bcrypt.hash(novaSenha, 10);
        await pool.query("UPDATE usuarios SET senha = $1 WHERE id = $2", [hash, req.usuario.id]);

        res.json({ mensagem: "Senha alterada com sucesso." });
    } catch (erro) {
        res.status(500).json({ erro: "Não foi possível alterar a senha." });
    }
});

// =========================================================
// PRODUTOS
// =========================================================
app.get("/produtos", async (req, res) => {
    try {
        const resultado = await pool.query("SELECT * FROM produtos WHERE ativo = true ORDER BY id DESC");
        res.json(resultado.rows);
    } catch (erro) {
        res.status(500).json({ erro: "Erro ao listar produtos." });
    }
});

app.get("/produtos/:id", async (req, res) => {
    try {
        const resultado = await pool.query("SELECT * FROM produtos WHERE id = $1 AND ativo = true", [req.params.id]);
        if (resultado.rows.length === 0) return res.status(404).json({ erro: "Produto não encontrado." });
        res.json(resultado.rows[0]);
    } catch (erro) {
        res.status(500).json({ erro: "Erro ao buscar produto." });
    }
});

app.get("/produtos/:id/estoque", async (req, res) => {
    try {
        await liberarReservasExpiradas();
        const resultado = await pool.query(
            "SELECT id, tamanho, cor, quantidade FROM estoque WHERE produto_id = $1 AND ativo=true ORDER BY cor, tamanho",
            [req.params.id]
        );
        res.json(resultado.rows);
    } catch (erro) {
        res.status(500).json({ erro: "Erro ao buscar variações." });
    }
});

app.post("/produtos", autenticar, apenasAdmin, upload.single("imagem"), async (req, res) => {
    const { nome, descricao, preco, categoria, tamanhos, cores } = req.body;
    if (!nome || !dinheiroValido(preco) || Number(preco) <= 0) {
        return res.status(400).json({ erro: "Nome e preço válido são obrigatórios." });
    }
    let listaTamanhos, listaCores;
    try {
        listaTamanhos = Array.isArray(tamanhos) ? tamanhos : JSON.parse(tamanhos || "[]");
        listaCores = Array.isArray(cores) ? cores : JSON.parse(cores || "[]");
    } catch (_) { return res.status(400).json({ erro: "Variações inválidas." }); }
    listaTamanhos = [...new Set(listaTamanhos.map(v => String(v).trim()).filter(Boolean))];
    listaCores = [...new Set(listaCores.map(v => String(v).trim()).filter(Boolean))];
    if (!listaTamanhos.length || !listaCores.length || listaTamanhos.length * listaCores.length > 100) {
        return res.status(400).json({ erro: "Selecione tamanhos e cores válidos." });
    }
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const resultado = await client.query(
            `INSERT INTO produtos(nome,descricao,preco,categoria,imagem) VALUES($1,$2,$3,$4,$5) RETURNING *`,
            [nome.trim(), descricao || null, Number(preco), categoria || null, req.file ? req.file.filename : null]
        );
        for (const tamanho of listaTamanhos) for (const cor of listaCores) {
            await client.query("INSERT INTO estoque(produto_id,tamanho,cor,quantidade) VALUES($1,$2,$3,0)", [resultado.rows[0].id, tamanho, cor]);
        }
        await client.query("COMMIT");
        res.status(201).json(resultado.rows[0]);
    } catch (erro) {
        await client.query("ROLLBACK");
        res.status(500).json({ erro: "Erro ao cadastrar produto." });
    } finally { client.release(); }
});

// =========================================================
// ESTOQUE
// =========================================================
app.get("/estoque", autenticar, apenasAdmin, async (req, res) => {
    try {
        await liberarReservasExpiradas();
        const resultado = await pool.query(`
            SELECT e.id, e.produto_id, p.nome AS produto, e.tamanho, e.cor, e.quantidade
            FROM estoque e
            INNER JOIN produtos p ON e.produto_id = p.id
            ORDER BY e.id DESC
        `);
        res.json(resultado.rows);
    } catch (erro) {
        res.status(500).json({ erro: "Erro ao carregar estoque." });
    }
});

app.post("/estoque", autenticar, apenasAdmin, async (req, res) => {
    try {
        const { produto_id, tamanho, cor, quantidade } = req.body;
        if (!idValido(produto_id) || !tamanho || !cor || !quantidadeValida(quantidade)) {
            return res.status(400).json({ erro: "Produto, tamanho, cor e quantidade não negativa são obrigatórios." });
        }
        const resultado = await pool.query(
            `INSERT INTO estoque(produto_id,tamanho,cor,quantidade) VALUES($1,$2,$3,$4)
             ON CONFLICT(produto_id,tamanho,cor) DO UPDATE SET quantidade=estoque.quantidade+EXCLUDED.quantidade, atualizado_em=NOW()
             RETURNING *`,
            [produto_id, String(tamanho).trim(), String(cor).trim(), Number(quantidade)]
        );
        res.status(201).json(resultado.rows[0]);
    } catch (erro) {
        res.status(500).json({ erro: "Erro ao cadastrar estoque." });
    }
});

app.put("/estoque/:id", autenticar, apenasAdmin, async (req, res) => {
    try {
        const { quantidade } = req.body;
        if (!idValido(req.params.id) || !quantidadeValida(quantidade)) {
            return res.status(400).json({ erro: "ID ou quantidade inválida." });
        }
        const resultado = await pool.query(
            `UPDATE estoque SET quantidade = $1, atualizado_em = NOW() WHERE id = $2 RETURNING *`,
            [Number(quantidade), req.params.id]
        );
        if (resultado.rows.length === 0) return res.status(404).json({ erro: "Registro não encontrado." });
        res.json(resultado.rows[0]);
    } catch (erro) {
        res.status(500).json({ erro: "Erro ao atualizar estoque." });
    }
});

// =========================================================
// PEDIDOS (TRANSAÇÃO ROBUSTA COM CUPOM E LOCK DE ESTOQUE)
// =========================================================
app.post("/pedidos", autenticar, async (req, res) => {
    const chaveIdempotencia = req.get("Idempotency-Key");
    if (!chaveIdempotencia || Joi.string().guid({ version: ["uuidv4"] }).validate(chaveIdempotencia).error) {
        return res.status(400).json({ erro: "Idempotency-Key UUID v4 é obrigatório." });
    }
    const pedidoExistente = await pool.query("SELECT * FROM pedidos WHERE idempotency_key=$1 AND usuario_id=$2", [chaveIdempotencia, req.usuario.id]);
    if (pedidoExistente.rows.length) return res.status(200).json({ mensagem: "Pedido já processado.", pedido: pedidoExistente.rows[0], idempotente: true });
    const {
        itens, forma_recebimento, forma_pagamento, cupom,
        cep, endereco, numero, complemento, bairro, cidade, estado
    } = req.body;

    if (!["retirada", "entrega"].includes(forma_recebimento)) {
        return res.status(400).json({ erro: "Forma de recebimento inválida." });
    }

    if (!["pix", "cartao", "dinheiro", "pagamento_na_retirada"].includes(forma_pagamento)) {
        return res.status(400).json({ erro: "Forma de pagamento inválida." });
    }

    if (!Array.isArray(itens) || itens.length === 0) {
        return res.status(400).json({ erro: "O pedido precisa conter ao menos um item." });
    }

    // Consolida linhas iguais antes do lock. Sem isso, duas linhas da mesma
    // variação validavam isoladamente contra o mesmo saldo.
    const itensAgrupados = new Map();
    for (const item of itens) {
        const qtd = Number(item.quantidade);
        if (!idValido(item.produto_id) || !item.tamanho || !item.cor || !Number.isSafeInteger(qtd) || qtd <= 0) {
            return res.status(400).json({ erro: "Dados de itens inconsistentes." });
        }
        const chave = `${Number(item.produto_id)}|${String(item.tamanho).trim()}|${String(item.cor).trim()}`;
        const existente = itensAgrupados.get(chave);
        if (existente) existente.quantidade += qtd;
        else itensAgrupados.set(chave, {
            produto_id: Number(item.produto_id),
            tamanho: String(item.tamanho).trim(),
            cor: String(item.cor).trim(),
            quantidade: qtd
        });
    }
    const itensNormalizados = [...itensAgrupados.values()];

    if (forma_recebimento === "entrega" && (!cep || !endereco || !numero || !bairro || !cidade || !estado)) {
        return res.status(400).json({ erro: "Endereço completo é obrigatório para entrega." });
    }

    await liberarReservasExpiradas();
    const client = await pool.connect();

    try {
        await client.query("BEGIN");
        let subtotalCalculado = 0;
        const itensValidados = [];

        for (const item of itensNormalizados) {
            const qtd = Number(item.quantidade);
            if (!item.produto_id || !item.tamanho || !item.cor || !qtd || qtd <= 0) {
                throw new Error("Dados de itens inconsistentes.");
            }

            // Busca preço oficial no banco de dados
            const prodRes = await client.query(
                "SELECT nome, preco FROM produtos WHERE id = $1 AND ativo = true",
                [item.produto_id]
            );
            if (prodRes.rows.length === 0) throw new Error(`Produto #${item.produto_id} inativo ou inexistente.`);

            const preco = Number(prodRes.rows[0].preco);

            // Bloqueio de concorrência com FOR UPDATE
            const estRes = await client.query(
                `SELECT id, quantidade FROM estoque
                 WHERE produto_id = $1 AND tamanho = $2 AND cor = $3 AND ativo=true
                 FOR UPDATE`,
                [item.produto_id, item.tamanho, item.cor]
            );

            if (estRes.rows.length === 0) {
                throw new Error(`Variação ${item.cor}/${item.tamanho} não cadastrada.`);
            }

            const estoqueAtual = Number(estRes.rows[0].quantidade);
            if (estoqueAtual < qtd) {
                throw new Error(`Estoque insuficiente para ${item.cor}/${item.tamanho}. Restam: ${estoqueAtual}.`);
            }

            const subtotalItem = preco * qtd;
            subtotalCalculado += subtotalItem;

            itensValidados.push({
                produto_id: item.produto_id,
                tamanho: item.tamanho,
                cor: item.cor,
                quantidade: qtd,
                preco_unitario: preco,
                subtotal: subtotalItem,
                estoque_id: estRes.rows[0].id,
                estoque_anterior: estoqueAtual
            });
        }

        // Validação e aplicação do cupom direto no servidor
        let valorDesconto = 0;
        let cupomId = null;

        if (cupom) {
            const cupomRes = await client.query(
                `SELECT * FROM cupons 
                 WHERE UPPER(codigo) = UPPER($1) 
                   AND ativo = true 
                   AND (data_validade IS NULL OR data_validade >= CURRENT_DATE)
                 FOR UPDATE`,
                [cupom.trim()]
            );

            if (cupomRes.rows.length > 0) {
                const cupomDados = cupomRes.rows[0];
                const limiteAtingido = cupomDados.limite_usos && cupomDados.usos_atuais >= cupomDados.limite_usos;
                const atingeMinimo = subtotalCalculado >= Number(cupomDados.valor_minimo_pedido || 0);

                if (!limiteAtingido && atingeMinimo) {
                    cupomId = cupomDados.id;
                    if (cupomDados.tipo === "porcentagem") {
                        valorDesconto = (subtotalCalculado * Number(cupomDados.valor)) / 100;
                    } else {
                        valorDesconto = Number(cupomDados.valor);
                    }
                    valorDesconto = Math.min(valorDesconto, subtotalCalculado);

                    // Incrementa uso do cupom
                    await client.query(
                        "UPDATE cupons SET usos_atuais = usos_atuais + 1 WHERE id = $1",
                        [cupomId]
                    );
                }
            }
        }

        const valorTotalFinal = Math.max(0, subtotalCalculado - valorDesconto);

        // Grava o pedido
        const pedidoRes = await client.query(
            `INSERT INTO pedidos
             (usuario_id, forma_recebimento, forma_pagamento, cep, endereco, numero, complemento, bairro, cidade, estado, valor_total, cupom_id, desconto, status, reserva_expira_em, idempotency_key)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'aguardando_pagamento', NOW() + ($14 || ' minutes')::interval, $15)
             RETURNING *`,
            [
                req.usuario.id, forma_recebimento, forma_pagamento,
                forma_recebimento === "entrega" ? cep : null,
                forma_recebimento === "entrega" ? endereco : null,
                forma_recebimento === "entrega" ? numero : null,
                forma_recebimento === "entrega" ? (complemento || null) : null,
                forma_recebimento === "entrega" ? bairro : null,
                forma_recebimento === "entrega" ? cidade : null,
                forma_recebimento === "entrega" ? estado : null,
                valorTotalFinal, cupomId, valorDesconto, minutosReserva, chaveIdempotencia
            ]
        );

        const pedido = pedidoRes.rows[0];

        // Grava os itens e debita o estoque
        for (const item of itensValidados) {
            await client.query(
                `INSERT INTO itens_pedido (pedido_id, produto_id, tamanho, cor, quantidade, preco_unitario, subtotal)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [pedido.id, item.produto_id, item.tamanho, item.cor, item.quantidade, item.preco_unitario, item.subtotal]
            );

            await client.query(
                `UPDATE estoque SET quantidade = quantidade - $1, atualizado_em = NOW() WHERE id = $2`,
                [item.quantidade, item.estoque_id]
            );
            await movimentarEstoque(client, { estoqueId: item.estoque_id, usuarioId: req.usuario.id, tipo: "saida_venda", quantidade: -item.quantidade, saldoAnterior: Number(item.estoque_anterior), referenciaTipo: "pedido", referenciaId: pedido.id });
        }

            await client.query(
                `INSERT INTO pagamentos
                (pedido_id, provedor, metodo, status, valor)
                VALUES ($1, $2, $3, $4, $5)`,
                [
                    pedido.id,
                    ["dinheiro", "pagamento_na_retirada"].includes(forma_pagamento) ? "manual" : "a_definir",
                    forma_pagamento,
                    "pendente",
                    valorTotalFinal
                ]
            );

        await client.query("COMMIT");

        res.status(201).json({
            mensagem: "Pedido criado com sucesso!",
            pedido
        });

    } catch (erro) {
        await client.query("ROLLBACK");
        res.status(400).json({ erro: erro.message || "Erro no processamento do pedido." });
    } finally {
        client.release();
    }
});


app.post("/pedidos/:id/pagamento", autenticar, async (req, res) => {
    if (!idValido(req.params.id)) return res.status(400).json({ erro: "Pedido invalido." });
    const chave = req.get("Idempotency-Key");
    if (!chave || Joi.string().guid({ version: ["uuidv4"] }).validate(chave).error) {
        return res.status(400).json({ erro: "Idempotency-Key UUID v4 e obrigatorio." });
    }
    const dados = req.body || {};
    if (["cardNumber", "securityCode", "cvv", "card_number"].some(campo => Object.hasOwn(dados, campo))) {
        return res.status(400).json({ erro: "Dados brutos de cartao nao sao aceitos. Use o componente seguro do gateway." });
    }
    const identificacao = dados.payer?.identification;
    if (identificacao && (!/^[A-Z]{2,10}$/.test(String(identificacao.type || "").toUpperCase()) || !/^\d{5,20}$/.test(String(identificacao.number || "").replace(/\D/g, "")))) {
        return res.status(400).json({ erro: "Documento do pagador invalido." });
    }
    const pix = dados.payment_method_id === "pix";
    const cartao = dados.selected_payment_method === "credit_card" || (!pix && Boolean(dados.token));
    if (!pix && !cartao) return res.status(400).json({ erro: "Somente Pix ou cartao de credito sao aceitos online." });
    if (cartao && (!/^[\w-]{10,300}$/.test(String(dados.token || "")) || !/^[\w-]{2,40}$/.test(String(dados.payment_method_id || "")) || !Number.isInteger(Number(dados.installments)) || Number(dados.installments) < 1 || Number(dados.installments) > 12)) {
        return res.status(400).json({ erro: "Token ou dados tokenizados do cartao invalidos." });
    }

    const lock = await pool.connect();
    try {
        await lock.query("BEGIN");
        await lock.query("SELECT pg_advisory_xact_lock($1,$2)", [7319, Number(req.params.id)]);
        const resultado = await lock.query(`SELECT p.*,u.nome,u.email,pg.id AS pagamento_id,pg.transacao_id,pg.idempotency_key AS pagamento_idempotency_key
            FROM pedidos p JOIN usuarios u ON u.id=p.usuario_id JOIN pagamentos pg ON pg.pedido_id=p.id WHERE p.id=$1`, [req.params.id]);
        if (!resultado.rows.length) { await lock.query("ROLLBACK"); return res.status(404).json({ erro: "Pedido nao encontrado." }); }
        const pedido = resultado.rows[0];
        if (req.usuario.tipo !== "admin" && Number(pedido.usuario_id) !== Number(req.usuario.id)) { await lock.query("ROLLBACK"); return res.status(403).json({ erro: "Acesso negado." }); }
        if (pedido.status !== "aguardando_pagamento" || pedido.reserva_liberada_em) { await lock.query("ROLLBACK"); return res.status(409).json({ erro: "Este pedido nao aceita pagamento." }); }
        if (pedido.reserva_expira_em && new Date(pedido.reserva_expira_em) <= new Date()) {
            await lock.query("ROLLBACK"); await liberarReservasExpiradas();
            return res.status(409).json({ erro: "A reserva de estoque expirou." });
        }
        if (pedido.transacao_id) {
            await lock.query("COMMIT");
            const existente = await gateway.buscarPagamento(pedido.transacao_id);
            await sincronizarPagamentoMercadoPago(existente, req);
            return res.json({ ...respostaPagamentoSegura(existente), idempotente: true });
        }
        if (pedido.pagamento_idempotency_key && pedido.pagamento_idempotency_key !== chave) {
            await lock.query("ROLLBACK");
            return res.status(409).json({ erro: "Uma tentativa de pagamento deste pedido ja esta em processamento." });
        }
        await lock.query("UPDATE pagamentos SET provedor='mercado_pago',metodo=$1,idempotency_key=$2,atualizado_em=NOW() WHERE id=$3", [pix ? "pix" : "cartao",chave,pedido.pagamento_id]);
        await lock.query("COMMIT");
        const recurso = await gateway.criarPagamento({
            pedido,
            usuario: { email: pedido.email, nome: pedido.nome },
            dados: {
                token: cartao ? String(dados.token) : undefined,
                installments: cartao ? Number(dados.installments) : undefined,
                payment_method_id: pix ? "pix" : String(dados.payment_method_id),
                issuer_id: cartao && dados.issuer_id ? String(dados.issuer_id) : undefined,
                payer: identificacao ? { identification: { type: String(identificacao.type).toUpperCase(), number: String(identificacao.number).replace(/\D/g, "") } } : undefined
            },
            idempotencyKey: chave
        });
        await sincronizarPagamentoMercadoPago(recurso, req);
        const segura = respostaPagamentoSegura(recurso);
        res.status(segura.status === "recusado" ? 402 : 201).json(segura);
    } catch (erro) {
        try { await lock.query("ROLLBACK"); } catch (_) {}
        console.error("Falha ao processar pagamento Mercado Pago:", erro.message);
        res.status(erro.statusCode || 502).json({ erro: erro.statusCode ? erro.message : "Nao foi possivel processar o pagamento." });
    } finally { lock.release(); }
});

app.post("/webhooks/mercado-pago", async (req, res) => {
    const dataId = String(req.query["data.id"] || req.body?.data?.id || "");
    const tipo = String(req.query.type || req.body?.type || "");
    if (tipo !== "payment" || !dataId) return res.sendStatus(200);
    let eventoId = `${req.body?.id || req.get("x-request-id") || "sem-id"}:${req.body?.action || "payment"}:${dataId}`;
    try {
        gateway.validarWebhook(req);
        const inserido = await pool.query(`INSERT INTO eventos_webhook(provedor,evento_id,transacao_id,tipo)
            VALUES('mercado_pago',$1,$2,$3)
            ON CONFLICT(provedor,evento_id) DO UPDATE SET transacao_id=EXCLUDED.transacao_id
            RETURNING id,status`, [eventoId,dataId,tipo]);
        if (inserido.rows[0].status === "processado") return res.sendStatus(200);
        const claim = await pool.query(`UPDATE eventos_webhook SET status='processando',erro=NULL
            WHERE id=$1 AND status IN ('recebido','erro') RETURNING id`, [inserido.rows[0].id]);
        if (!claim.rows.length) return res.sendStatus(200);
        try {
            const recurso = await gateway.buscarPagamento(dataId);
            await sincronizarPagamentoMercadoPago(recurso);
            await pool.query("UPDATE eventos_webhook SET status='processado',processado_em=NOW() WHERE id=$1", [inserido.rows[0].id]);
            return res.sendStatus(200);
        } catch (erro) {
            await pool.query("UPDATE eventos_webhook SET status='erro',erro=$1 WHERE id=$2", [String(erro.message).slice(0,500),inserido.rows[0].id]);
            console.error("Erro ao processar webhook Mercado Pago:", erro.message);
            return res.sendStatus(500);
        }
    } catch (erro) {
        console.warn("Webhook Mercado Pago rejeitado:", erro.message);
        return res.sendStatus(401);
    }
});

app.post("/pagamentos/:id/reconciliar", autenticar, apenasAdmin, async (req, res) => {
    if (!idValido(req.params.id)) return res.status(400).json({ erro: "Pagamento invalido." });
    try {
        const local = await pool.query("SELECT transacao_id FROM pagamentos WHERE id=$1", [req.params.id]);
        if (!local.rows.length) return res.status(404).json({ erro: "Pagamento nao encontrado." });
        const transacaoId = local.rows[0].transacao_id || req.body?.transacao_id;
        if (!transacaoId || !/^\d{4,30}$/.test(String(transacaoId))) return res.status(409).json({ erro: "Informe um ID de transacao valido do gateway." });
        const resultado = await sincronizarPagamentoMercadoPago(await gateway.buscarPagamento(transacaoId), req);
        res.json({ mensagem: "Pagamento reconciliado.", resultado });
    } catch (erro) {
        console.error("Erro na reconciliacao:", erro.message);
        res.status(502).json({ erro: "Nao foi possivel reconciliar o pagamento." });
    }
});


app.get("/pedidos/:id/pagamento", autenticar, async (req, res) => {
    try {
        const pedidoRes = await pool.query(
            `
            SELECT usuario_id
            FROM pedidos
            WHERE id = $1
            `,
            [req.params.id]
        );

        if (pedidoRes.rows.length === 0) {
            return res.status(404).json({
                erro: "Pedido não encontrado."
            });
        }

        const pedido = pedidoRes.rows[0];

        // Cliente só pode consultar o próprio pedido.
        // Admin pode consultar qualquer pedido.
        if (
            req.usuario.tipo !== "admin" &&
            Number(pedido.usuario_id) !== Number(req.usuario.id)
        ) {
            return res.status(403).json({
                erro: "Acesso negado a este pagamento."
            });
        }

        const resultado = await pool.query(
            `
            SELECT
                id,
                pedido_id,
                provedor,
                transacao_id,
                metodo,
                status,
                valor,
                criado_em,
                atualizado_em
            FROM pagamentos
            WHERE pedido_id = $1
            ORDER BY id DESC
            LIMIT 1
            `,
            [req.params.id]
        );

        if (resultado.rows.length === 0) {
            return res.status(404).json({
                erro: "Pagamento não encontrado para este pedido."
            });
        }

        res.json({
            pagamento: resultado.rows[0]
        });

    } catch (erro) {
        console.error("Erro ao consultar pagamento:", erro.message);

        res.status(500).json({
            erro: "Erro ao consultar pagamento."
        });
    }
});




// DETALHES DE UM PEDIDO ESPECÍFICO
// Confirmacao manual para venda presencial. Pagamentos online devem ser
// confirmados futuramente por webhook autenticado do gateway.
app.patch("/pagamentos/:id/status", autenticar, apenasAdmin, async (req, res) => {
    const { status, transacao_id } = req.body;
    if (!idValido(req.params.id) || !["pago", "cancelado", "estornado"].includes(status)) {
        return res.status(400).json({ erro: "Pagamento ou status invalido." });
    }
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const atual = await client.query("SELECT * FROM pagamentos WHERE id=$1 FOR UPDATE", [req.params.id]);
        if (!atual.rows.length) { await client.query("ROLLBACK"); return res.status(404).json({ erro: "Pagamento nao encontrado." }); }
        if (atual.rows[0].provedor !== "manual") {
            await client.query("ROLLBACK");
            return res.status(409).json({ erro: "Pagamento online so pode ser atualizado pelo webhook ou reconciliacao do gateway." });
        }
        if (atual.rows[0].status === status) { await client.query("COMMIT"); return res.json({ pagamento: atual.rows[0] }); }
        if (["estornado", "cancelado"].includes(atual.rows[0].status)) {
            await client.query("ROLLBACK");
            return res.status(409).json({ erro: "Pagamento finalizado nao pode mudar de status." });
        }
        const pagamento = await client.query(
            `UPDATE pagamentos SET status=$1::varchar, transacao_id=COALESCE($2, transacao_id),
             pago_em=CASE WHEN $1::varchar='pago' THEN NOW() ELSE pago_em END, atualizado_em=NOW()
             WHERE id=$3 RETURNING *`, [status, transacao_id || null, req.params.id]
        );
        if (status === "pago") {
            const pedidoPagamento = await client.query("SELECT status,reserva_expira_em FROM pedidos WHERE id=$1 FOR UPDATE", [atual.rows[0].pedido_id]);
            if (!pedidoPagamento.rows.length || pedidoPagamento.rows[0].status === "cancelado") {
                await client.query("ROLLBACK");
                return res.status(409).json({ erro: "Pedido cancelado ou inexistente nao pode ser pago." });
            }
            if (pedidoPagamento.rows[0].reserva_expira_em && new Date(pedidoPagamento.rows[0].reserva_expira_em) <= new Date()) {
                await client.query("ROLLBACK");
                await liberarReservasExpiradas();
                return res.status(409).json({ erro: "A reserva de estoque deste pedido expirou." });
            }
            await client.query("UPDATE pedidos SET status=CASE WHEN status='aguardando_pagamento' THEN 'processando' ELSE status END, reserva_expira_em=NULL, atualizado_em=NOW() WHERE id=$1", [atual.rows[0].pedido_id]);
        }
        await auditar(client, req, "alterar_status", "pagamento", Number(req.params.id), { anterior: atual.rows[0].status, novo: status, pedido_id: atual.rows[0].pedido_id });
        await client.query("COMMIT");
        res.json({ mensagem: "Pagamento atualizado.", pagamento: pagamento.rows[0] });
    } catch (erro) {
        await client.query("ROLLBACK");
        console.error("Erro ao atualizar pagamento:", erro.message);
        res.status(500).json({ erro: "Erro ao atualizar pagamento." });
    } finally { client.release(); }
});

app.get("/pedidos/:id", autenticar, async (req, res) => {
    try {
        const pedidoRes = await pool.query(
            `SELECT p.*, u.nome AS cliente, u.email, u.telefone
             FROM pedidos p
             INNER JOIN usuarios u ON p.usuario_id = u.id
             WHERE p.id = $1`,
            [req.params.id]
        );

        if (pedidoRes.rows.length === 0) {
            return res.status(404).json({ erro: "Pedido não encontrado." });
        }

        const pedido = pedidoRes.rows[0];

        // Garante que o cliente só acesse seus próprios pedidos
        if (req.usuario.tipo !== "admin" && pedido.usuario_id !== req.usuario.id) {
            return res.status(403).json({ erro: "Acesso negado a este pedido." });
        }

        const itensRes = await pool.query(
            `SELECT ip.*, pr.nome, pr.imagem
             FROM itens_pedido ip
             INNER JOIN produtos pr ON ip.produto_id = pr.id
             WHERE ip.pedido_id = $1`,
            [pedido.id]
        );

        pedido.itens = itensRes.rows;
        res.json(pedido);
    } catch (erro) {
        res.status(500).json({ erro: "Erro ao carregar detalhes do pedido." });
    }
});


app.get("/pedidos", autenticar, async (req, res) => {
    try {
        let resultado;

        if (req.usuario.tipo === "admin") {

            // ADMIN: vê todos os pedidos
            resultado = await pool.query(`
                SELECT
                    p.*,
                    u.nome AS cliente,
                    u.email,
                    u.telefone
                FROM pedidos p
                INNER JOIN usuarios u
                    ON p.usuario_id = u.id
                ORDER BY p.criado_em DESC
            `);

        } else {

            // CLIENTE: vê somente os próprios pedidos
            resultado = await pool.query(`
                SELECT
                    p.*,
                    COALESCE(
                        json_agg(
                            json_build_object(
                                'produto_id', ip.produto_id,
                                'nome', pr.nome,
                                'imagem', pr.imagem,
                                'tamanho', ip.tamanho,
                                'cor', ip.cor,
                                'quantidade', ip.quantidade,
                                'preco_unitario', ip.preco_unitario,
                                'subtotal', ip.subtotal
                            )
                        ) FILTER (WHERE ip.id IS NOT NULL),
                        '[]'
                    ) AS itens
                FROM pedidos p
                LEFT JOIN itens_pedido ip
                    ON ip.pedido_id = p.id
                LEFT JOIN produtos pr
                    ON ip.produto_id = pr.id
                WHERE p.usuario_id = $1
                GROUP BY p.id
                ORDER BY p.criado_em DESC
            `, [req.usuario.id]);
        }

        res.json(resultado.rows);

    } catch (erro) {
        console.error("Erro ao listar pedidos:", erro.message);

        res.status(500).json({
            erro: "Erro ao consultar pedidos."
        });
    }
});



app.patch("/pedidos/:id/status", autenticar, apenasAdmin, async (req, res) => {
    const client = await pool.connect();
    try {
        const { status } = req.body;
        const permitidos = ["aguardando_pagamento", "pendente", "processando", "enviado", "concluido", "cancelado"];
        if (!permitidos.includes(status)) return res.status(400).json({ erro: "Status inválido." });

        if (!idValido(req.params.id)) return res.status(400).json({ erro: "ID invalido." });
        await client.query("BEGIN");
        const pedidoAtual = await client.query("SELECT * FROM pedidos WHERE id=$1 FOR UPDATE", [req.params.id]);
        if (!pedidoAtual.rows.length) {
            await client.query("ROLLBACK");
            return res.status(404).json({ erro: "Pedido nao encontrado." });
        }
        if (pedidoAtual.rows[0].status === "cancelado" && status !== "cancelado") {
            await client.query("ROLLBACK");
            return res.status(409).json({ erro: "Pedido cancelado nao pode ser reaberto." });
        }
        const transicoes = {
            aguardando_pagamento: ["aguardando_pagamento", "cancelado"],
            pendente: ["pendente", "processando", "cancelado"],
            processando: ["processando", "enviado", "concluido", "cancelado"],
            enviado: ["enviado", "concluido", "cancelado"],
            concluido: ["concluido"],
            cancelado: ["cancelado"]
        };
        if (!transicoes[pedidoAtual.rows[0].status]?.includes(status)) {
            await client.query("ROLLBACK");
            return res.status(409).json({ erro: `Transição de ${pedidoAtual.rows[0].status} para ${status} não permitida.` });
        }
        if (["processando", "enviado", "concluido"].includes(status)) {
            const pagamentoPago = await client.query("SELECT 1 FROM pagamentos WHERE pedido_id=$1 AND status='pago'", [req.params.id]);
            if (!pagamentoPago.rows.length) {
                await client.query("ROLLBACK");
                return res.status(409).json({ erro: "Confirme o pagamento antes de avancar o pedido." });
            }
        }
        if (status === "cancelado" && pedidoAtual.rows[0].status !== "cancelado") {
            const itensCancelados = await client.query("SELECT produto_id, tamanho, cor, quantidade FROM itens_pedido WHERE pedido_id=$1", [req.params.id]);
            for (const item of itensCancelados.rows) {
                const saldo = await client.query("SELECT id,quantidade FROM estoque WHERE produto_id=$1 AND tamanho=$2 AND cor=$3 FOR UPDATE", [item.produto_id,item.tamanho,item.cor]);
                if (!saldo.rows.length) throw new Error("Variação de estoque do pedido não encontrada.");
                await client.query("UPDATE estoque SET quantidade=quantidade+$1, atualizado_em=NOW() WHERE id=$2", [item.quantidade,saldo.rows[0].id]);
                await movimentarEstoque(client, { estoqueId: saldo.rows[0].id, usuarioId: req.usuario.id, tipo: "cancelamento", quantidade: Number(item.quantidade), saldoAnterior: Number(saldo.rows[0].quantidade), referenciaTipo: "pedido", referenciaId: Number(req.params.id) });
            }
            await client.query("UPDATE pagamentos SET status=CASE WHEN status='pago' THEN 'estorno_pendente' ELSE 'cancelado' END, atualizado_em=NOW() WHERE pedido_id=$1 AND status IN ('pendente','pago')", [req.params.id]);
            if (pedidoAtual.rows[0].cupom_id) await client.query("UPDATE cupons SET usos_atuais=GREATEST(usos_atuais-1,0) WHERE id=$1", [pedidoAtual.rows[0].cupom_id]);
        }
        const resultado = await client.query(
            "UPDATE pedidos SET status=$1::varchar, reserva_expira_em=NULL, reserva_liberada_em=CASE WHEN $1::varchar='cancelado' THEN NOW() ELSE reserva_liberada_em END, atualizado_em=NOW() WHERE id=$2 RETURNING *",
            [status, req.params.id]
        );
        await auditar(client, req, "alterar_status", "pedido", Number(req.params.id), { anterior: pedidoAtual.rows[0].status, novo: status });
        await client.query("COMMIT");
        if (resultado.rows.length === 0) return res.status(404).json({ erro: "Pedido não encontrado." });

        res.json({ mensagem: "Status atualizado.", pedido: resultado.rows[0] });
    } catch (erro) {
        await client.query("ROLLBACK");
        console.error("Erro ao atualizar status do pedido:", erro.message);
        res.status(500).json({ erro: "Erro ao atualizar status." });
    } finally { client.release(); }
});

// =========================================================
// CLIENTES — ADMIN
// =========================================================
app.get("/clientes", autenticar, apenasAdmin, async (req, res) => {
    try {
        const resultado = await pool.query(`
            SELECT u.id, u.nome, u.email, u.telefone, u.criado_em,
                   COUNT(p.id) AS total_pedidos,
                   COALESCE(SUM(CASE WHEN p.status != 'cancelado' THEN p.valor_total ELSE 0 END), 0) AS total_gasto
            FROM usuarios u
            LEFT JOIN pedidos p ON p.usuario_id = u.id
            WHERE u.tipo = 'cliente'
            GROUP BY u.id, u.nome, u.email, u.telefone, u.criado_em
            ORDER BY u.criado_em DESC
        `);
        res.json(resultado.rows);
    } catch (erro) {
        res.status(500).json({ erro: "Erro ao listar clientes." });
    }
});

// =========================================================
// FINANCEIRO — ADMIN (INTEGRADO COM DESPESAS)
// =========================================================
app.get("/dashboard", autenticar, apenasAdmin, async (req, res) => {
    const periodo = String(req.query.periodo || "30");
    const periodosPermitidos = ["hoje", "7", "30", "mes", "ano", "todos"];
    if (!periodosPermitidos.includes(periodo)) {
        return res.status(400).json({ erro: "Periodo invalido." });
    }
    const timezone = process.env.REPORT_TIMEZONE || "America/Sao_Paulo";
    try {
        const limitesSql = `WITH limites AS (
            SELECT
              CASE $1
                WHEN 'hoje' THEN date_trunc('day', NOW() AT TIME ZONE $2) AT TIME ZONE $2
                WHEN '7' THEN (date_trunc('day', NOW() AT TIME ZONE $2) - INTERVAL '6 days') AT TIME ZONE $2
                WHEN '30' THEN (date_trunc('day', NOW() AT TIME ZONE $2) - INTERVAL '29 days') AT TIME ZONE $2
                WHEN 'mes' THEN date_trunc('month', NOW() AT TIME ZONE $2) AT TIME ZONE $2
                WHEN 'ano' THEN date_trunc('year', NOW() AT TIME ZONE $2) AT TIME ZONE $2
                ELSE NULL
              END AS inicio,
              CASE WHEN $1='todos' THEN NULL
                ELSE (date_trunc('day', NOW() AT TIME ZONE $2) + INTERVAL '1 day') AT TIME ZONE $2
              END AS fim
        )`;
        const parametros = [periodo, timezone];
        const [resumo, estoqueBaixo, pedidosRecentes, grafico] = await Promise.all([
            pool.query(`${limitesSql}, vendas_periodo AS (
                SELECT pg.pedido_id,pg.valor,pg.pago_em
                FROM pagamentos pg CROSS JOIN limites l
                WHERE pg.status='pago' AND (l.inicio IS NULL OR pg.pago_em>=l.inicio) AND (l.fim IS NULL OR pg.pago_em<l.fim)
              )
              SELECT
                COALESCE((SELECT SUM(valor) FROM vendas_periodo),0) AS faturamento,
                (SELECT COUNT(*) FROM vendas_periodo) AS vendas,
                COALESCE((SELECT SUM(ip.quantidade) FROM vendas_periodo vp JOIN itens_pedido ip ON ip.pedido_id=vp.pedido_id),0) AS produtos_vendidos,
                COALESCE((SELECT SUM(d.valor) FROM despesas d CROSS JOIN limites l
                  WHERE (l.inicio IS NULL OR d.data_despesa >= (l.inicio AT TIME ZONE $2)::date)
                    AND (l.fim IS NULL OR d.data_despesa < (l.fim AT TIME ZONE $2)::date)),0) AS despesas,
                (SELECT COALESCE(SUM(quantidade),0) FROM estoque) AS itens_estoque,
                (SELECT COUNT(*) FROM produtos WHERE ativo=true) AS produtos,
                (SELECT COUNT(*) FROM usuarios WHERE tipo='cliente' AND ativo=true) AS clientes`, parametros),
            pool.query(`SELECT p.id, p.nome, e.tamanho, e.cor, e.quantidade
                FROM estoque e JOIN produtos p ON p.id=e.produto_id
                WHERE p.ativo=true AND e.quantidade <= 5 ORDER BY e.quantidade, p.nome LIMIT 8`),
            pool.query(`${limitesSql} SELECT p.id,u.nome AS cliente,p.criado_em,pg.pago_em,pg.metodo AS forma_pagamento,p.status,pg.valor AS valor_total
                FROM pagamentos pg JOIN pedidos p ON p.id=pg.pedido_id JOIN usuarios u ON u.id=p.usuario_id CROSS JOIN limites l
                WHERE pg.status='pago' AND (l.inicio IS NULL OR pg.pago_em>=l.inicio) AND (l.fim IS NULL OR pg.pago_em<l.fim)
                ORDER BY pg.pago_em DESC LIMIT 8`, parametros),
            pool.query(`${limitesSql} SELECT
                CASE WHEN $1 IN ('ano','todos') THEN date_trunc('month',pg.pago_em AT TIME ZONE $2)
                     ELSE date_trunc('day',pg.pago_em AT TIME ZONE $2) END AS data,
                COALESCE(SUM(pg.valor),0) AS faturamento,COUNT(*) AS vendas
                FROM pagamentos pg CROSS JOIN limites l
                WHERE pg.status='pago' AND (l.inicio IS NULL OR pg.pago_em>=l.inicio) AND (l.fim IS NULL OR pg.pago_em<l.fim)
                GROUP BY 1 ORDER BY 1`, parametros)
        ]);
        const dadosResumo = resumo.rows[0];
        const faturamento = Number(dadosResumo.faturamento);
        const vendas = Number(dadosResumo.vendas);
        const despesas = Number(dadosResumo.despesas);
        res.json({
            periodo,
            timezone,
            resumo: {
                ...dadosResumo,
                faturamento,
                vendas,
                produtos_vendidos: Number(dadosResumo.produtos_vendidos),
                despesas,
                lucro: faturamento - despesas,
                ticket_medio: vendas ? faturamento / vendas : 0
            },
            grafico: grafico.rows.map(item => ({ data: item.data, faturamento: Number(item.faturamento), vendas: Number(item.vendas) })),
            estoque_baixo: estoqueBaixo.rows,
            pedidos_recentes: pedidosRecentes.rows
        });
    } catch (erro) {
        console.error("Erro rota /dashboard:", erro.message);
        res.status(500).json({ erro: "Erro ao carregar dashboard." });
    }
});

app.get("/financeiro", autenticar, apenasAdmin, async (req, res) => {
    try {
        const { periodo = "30" } = req.query;

        // Monta a condição de data baseada no filtro selecionado
        let dataFiltroPedidos = "";
        let dataFiltroDespesas = "";

        if (periodo === "hoje") {
            dataFiltroPedidos = "AND p.criado_em >= CURRENT_DATE";
            dataFiltroDespesas = "WHERE criado_em >= CURRENT_DATE";
        } else if (periodo === "7") {
            dataFiltroPedidos = "AND p.criado_em >= NOW() - INTERVAL '7 days'";
            dataFiltroDespesas = "WHERE criado_em >= NOW() - INTERVAL '7 days'";
        } else if (periodo === "30") {
            dataFiltroPedidos = "AND p.criado_em >= NOW() - INTERVAL '30 days'";
            dataFiltroDespesas = "WHERE criado_em >= NOW() - INTERVAL '30 days'";
        } else if (periodo === "mes") {
            dataFiltroPedidos = "AND p.criado_em >= date_trunc('month', CURRENT_DATE)";
            dataFiltroDespesas = "WHERE criado_em >= date_trunc('month', CURRENT_DATE)";
        } else if (periodo === "ano") {
            dataFiltroPedidos = "AND p.criado_em >= date_trunc('year', CURRENT_DATE)";
            dataFiltroDespesas = "WHERE criado_em >= date_trunc('year', CURRENT_DATE)";
        }
        // Se periodo === "todos", as variáveis ficam vazias e puxa o histórico total

        // 1. Faturamento e Total de Vendas
        const vendasRes = await pool.query(
            `SELECT COUNT(*) AS total,
                    COALESCE(SUM(valor_total), 0) AS faturamento
             FROM pedidos p
             WHERE p.status = 'concluido' AND EXISTS (SELECT 1 FROM pagamentos pg WHERE pg.pedido_id=p.id AND pg.status='pago') ${dataFiltroPedidos}`
        );
        const faturamento = Number(vendasRes.rows[0].faturamento);
        const totalVendas = Number(vendasRes.rows[0].total);

        // 2. Despesas
        const despesasRes = await pool.query(
            `SELECT COALESCE(SUM(valor), 0) AS total FROM despesas ${dataFiltroDespesas}`
        );
        const totalDespesas = Number(despesasRes.rows[0].total);

        // 3. Distribuição de Pagamentos
        const pagamentosRes = await pool.query(
            `SELECT forma_pagamento,
                    COUNT(*) AS qtd,
                    COALESCE(SUM(valor_total), 0) AS valor
             FROM pedidos p
             WHERE p.status = 'concluido' AND EXISTS (SELECT 1 FROM pagamentos pg WHERE pg.pedido_id=p.id AND pg.status='pago') ${dataFiltroPedidos}
             GROUP BY forma_pagamento`
        );

        const pagamentos = {
            pix: { quantidade: 0, valor: 0 },
            cartao: { quantidade: 0, valor: 0 },
            pagamento_na_retirada: { quantidade: 0, valor: 0 }
        };

        pagamentosRes.rows.forEach(p => {
            if (pagamentos[p.forma_pagamento]) {
                pagamentos[p.forma_pagamento] = {
                    quantidade: Number(p.qtd),
                    valor: Number(p.valor)
                };
            }
        });

        // 4. Últimas Movimentações (traz as 10 mais recentes daquele período ou do histórico)
        const condicaoMovimentacoes = dataFiltroPedidos ? `WHERE 1=1 ${dataFiltroPedidos}` : "";
        const movimentacoes = await pool.query(`
            SELECT p.id, u.nome AS cliente, p.criado_em, p.forma_pagamento, p.status, p.valor_total
            FROM pedidos p
            INNER JOIN usuarios u ON p.usuario_id = u.id
            ${condicaoMovimentacoes}
            ORDER BY p.criado_em DESC LIMIT 10
        `);

        res.json({
            faturamento,
            total_vendas: totalVendas,
            ticket_medio: totalVendas > 0 ? faturamento / totalVendas : 0,
            despesas: totalDespesas,
            resultado_liquido: faturamento - totalDespesas,
            pagamentos,
            movimentacoes: movimentacoes.rows
        });
    } catch (erro) {
        console.error("Erro rota /financeiro:", erro);
        res.status(500).json({ erro: "Erro ao obter balanço financeiro." });
    }
});

// =========================================================
// DESPESAS
// =========================================================
app.get("/despesas", autenticar, apenasAdmin, async (req, res) => {
    try {
        const resultado = await pool.query("SELECT * FROM despesas ORDER BY data_despesa DESC, id DESC");
        res.json(resultado.rows);
    } catch (erro) {
        res.status(500).json({ erro: "Erro ao consultar despesas." });
    }
});

app.post("/despesas", autenticar, apenasAdmin, async (req, res) => {
    try {
        const { descricao, categoria, valor, data, data_despesa, observacoes } = req.body;
        const dataFinal = data || data_despesa;

        if (!descricao || !categoria || !valor || Number(valor) <= 0 || !dataFinal) {
            return res.status(400).json({ erro: "Dados da despesa incompletos ou inválidos." });
        }

        const resultado = await pool.query(
            `INSERT INTO despesas (descricao, categoria, valor, data_despesa, observacoes)
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [descricao.trim(), categoria, Number(valor), dataFinal, observacoes || null]
        );

        res.status(201).json(resultado.rows[0]);
    } catch (erro) {
        res.status(500).json({ erro: "Erro ao cadastrar despesa." });
    }
});

app.delete("/despesas/:id", autenticar, apenasAdmin, async (req, res) => {
    try {
        const resultado = await pool.query("DELETE FROM despesas WHERE id = $1 RETURNING *", [req.params.id]);
        if (resultado.rows.length === 0) return res.status(404).json({ erro: "Despesa não encontrada." });
        res.json({ mensagem: "Despesa excluída com sucesso." });
    } catch (erro) {
        res.status(500).json({ erro: "Erro ao excluir despesa." });
    }
});

// =========================================================
// RELATÓRIOS (CONSULTAS SQL PARAMETRIZADAS SEGURAS)
// =========================================================
app.get("/relatorios", autenticar, apenasAdmin, async (req, res) => {
    try {
        const { periodo, data_inicial, data_final } = req.query;
        let filtroPedidos = "";
        let filtroDespesas = "";
        const params = [];

        if (periodo === "personalizado") {
            if (!data_inicial || !data_final) {
                return res.status(400).json({ erro: "Data inicial e final são obrigatórias para busca personalizada." });
            }
            filtroPedidos = "AND pedidos.criado_em::date BETWEEN $1 AND $2";
            filtroDespesas = "AND despesas.data_despesa BETWEEN $1 AND $2";
            params.push(data_inicial, data_final);
        } else {
            const diasPermitidos = [7, 30, 90, 365];
            const dias = diasPermitidos.includes(Number(periodo)) ? Number(periodo) : 30;
            filtroPedidos = "AND pedidos.criado_em >= NOW() - ($1 || ' days')::INTERVAL";
            filtroDespesas = "AND despesas.data_despesa >= CURRENT_DATE - ($1 || ' days')::INTERVAL";
            params.push(dias);
        }

        const vendasRes = await pool.query(
            `SELECT COUNT(*) AS total_vendas, COALESCE(SUM(valor_total), 0) AS faturamento
             FROM pedidos WHERE status = 'concluido' AND EXISTS (SELECT 1 FROM pagamentos pg WHERE pg.pedido_id=pedidos.id AND pg.status='pago') ${filtroPedidos}`,
            params
        );

        const despesasRes = await pool.query(
            `SELECT COALESCE(SUM(valor), 0) AS total_despesas
             FROM despesas WHERE 1=1 ${filtroDespesas}`,
            params
        );

        const pagamentosRes = await pool.query(
            `SELECT forma_pagamento, COUNT(*) AS qtd
             FROM pedidos WHERE status = 'concluido' AND EXISTS (SELECT 1 FROM pagamentos pg WHERE pg.pedido_id=pedidos.id AND pg.status='pago') ${filtroPedidos}
             GROUP BY forma_pagamento`,
            params
        );

        const produtosRes = await pool.query(
            `SELECT p.nome, p.categoria, SUM(ip.quantidade) AS quantidade, COALESCE(SUM(ip.subtotal), 0) AS faturamento
             FROM itens_pedido ip
             INNER JOIN pedidos ON ip.pedido_id = pedidos.id
             INNER JOIN produtos p ON ip.produto_id = p.id
             WHERE pedidos.status = 'concluido' AND EXISTS (SELECT 1 FROM pagamentos pg WHERE pg.pedido_id=pedidos.id AND pg.status='pago') ${filtroPedidos}
             GROUP BY p.id, p.nome, p.categoria
             ORDER BY quantidade DESC LIMIT 10`,
            params
        );

        const estoqueRes = await pool.query(`
            SELECT COALESCE(SUM(quantidade), 0) AS total,
                   COUNT(CASE WHEN quantidade > 0 AND quantidade <= 5 THEN 1 END) AS baixo,
                   COUNT(CASE WHEN quantidade = 0 THEN 1 END) AS sem_estoque
            FROM estoque
        `);

        const faturamento = Number(vendasRes.rows[0].faturamento);
        const despesas = Number(despesasRes.rows[0].total_despesas);

        const pagamentos = { pix: 0, cartao: 0, retirada: 0 };
        pagamentosRes.rows.forEach(p => {
            if (p.forma_pagamento === "pix") pagamentos.pix = Number(p.qtd);
            if (p.forma_pagamento === "cartao") pagamentos.cartao = Number(p.qtd);
            if (p.forma_pagamento === "pagamento_na_retirada") pagamentos.retirada = Number(p.qtd);
        });

        res.json({
            faturamento,
            vendas: Number(vendasRes.rows[0].total_vendas),
            despesas,
            resultado_liquido: faturamento - despesas,
            pagamentos,
            produtos_mais_vendidos: produtosRes.rows.map(p => ({
                nome: p.nome,
                categoria: p.categoria,
                quantidade: Number(p.quantidade),
                faturamento: Number(p.faturamento)
            })),
            estoque: {
                total: Number(estoqueRes.rows[0].total),
                baixo: Number(estoqueRes.rows[0].baixo),
                sem_estoque: Number(estoqueRes.rows[0].sem_estoque)
            }
        });

    } catch (erro) {
        console.error("Erro em relatórios:", erro);
        res.status(500).json({ erro: "Erro ao gerar relatório." });
    }
});

// =========================================================
// CUPONS
// =========================================================
// ATENÇÃO (não corrigido aqui — depende do schema de pedidos):
// este endpoint calcula o desconto em cima do "subtotal" que
// o CLIENTE envia no corpo da requisição, sem checar contra o
// carrinho real. E, olhando /pedidos, nenhum desconto de cupom
// entra no cálculo de valorTotal ali. Ou seja, hoje o cupom só
// serve pra mostrar uma prévia — não desconta nada de fato no
// pedido gravado. Quando for ligar isso ao fechamento do
// pedido, o subtotal e o desconto precisam ser recalculados no
// servidor a partir dos itens reais (mesmo padrão já usado em
// /pedidos para o preço dos produtos), nunca aceitos prontos
// do corpo da requisição.

// VALIDAR CUPOM NO CHECKOUT (PÚBLICO/CLIENTE)
app.post("/cupons/validar", async (req, res) => {
    try {
        const { codigo, subtotal } = req.body;
        if (!codigo) return res.status(400).json({ erro: "Código não informado." });

        const query = await pool.query(
            `SELECT * FROM cupons 
             WHERE UPPER(codigo) = UPPER($1) 
               AND ativo = true 
               AND (data_validade IS NULL OR data_validade >= CURRENT_DATE)`,
            [codigo.trim()]
        );

        if (query.rows.length === 0) {
            return res.status(404).json({ erro: "Cupom inválido ou expirado." });
        }

        const cupom = query.rows[0];

        if (cupom.limite_usos && cupom.usos_atuais >= cupom.limite_usos) {
            return res.status(400).json({ erro: "Limite de uso deste cupom esgotado." });
        }

        if (subtotal < Number(cupom.valor_minimo_pedido)) {
            return res.status(400).json({ 
                erro: `Pedido mínimo para este cupom: R$ ${Number(cupom.valor_minimo_pedido).toFixed(2)}` 
            });
        }

        let desconto = 0;
        if (cupom.tipo === "porcentagem") {
            desconto = (Number(subtotal) * Number(cupom.valor)) / 100;
        } else {
            desconto = Number(cupom.valor);
        }

        res.json({
            valido: true,
            cupom_id: cupom.id,
            codigo: cupom.codigo,
            desconto: Math.min(desconto, subtotal)
        });
    } catch (erro) {
        res.status(500).json({ erro: "Erro ao validar cupom." });
    }
});

// LISTAR CUPONS (ADMIN)
app.get("/cupons", autenticar, apenasAdmin, async (req, res) => {
    try {
        const resultado = await pool.query("SELECT * FROM cupons ORDER BY id DESC");
        res.json(resultado.rows);
    } catch (erro) {
        res.status(500).json({ erro: "Erro ao carregar cupons." });
    }
});

// CADASTRAR CUPOM (ADMIN)
app.post("/cupons", autenticar, apenasAdmin, async (req, res) => {
    try {
        const { codigo, tipo, valor, valor_minimo_pedido, limite_usos, data_validade } = req.body;
        if (!codigo || !tipo || valor === undefined) {
            return res.status(400).json({ erro: "Código, tipo e valor do cupom são obrigatórios." });
        }

        const resultado = await pool.query(
            `INSERT INTO cupons (codigo, tipo, valor, valor_minimo_pedido, limite_usos, data_validade)
             VALUES (UPPER($1), $2, $3, $4, $5, $6) RETURNING *`,
            [codigo.trim(), tipo, valor, valor_minimo_pedido || 0, limite_usos || null, data_validade || null]
        );
        res.status(201).json(resultado.rows[0]);
    } catch (erro) {
        res.status(500).json({ erro: "Erro ao cadastrar cupom." });
    }
});

// LISTAR FORNECEDORES
app.get("/fornecedores", autenticar, apenasAdmin, async (req, res) => {
    try {
        const resultado = await pool.query("SELECT * FROM fornecedores ORDER BY nome ASC");
        res.json(resultado.rows);
    } catch (erro) {
        res.status(500).json({ erro: "Erro ao listar fornecedores." });
    }
});

// CADASTRAR FORNECEDOR
app.post("/fornecedores", autenticar, apenasAdmin, async (req, res) => {
    try {
        const { nome, cnpj_cpf, telefone, email, chave_pix, cidade, estado } = req.body;
        const resultado = await pool.query(
            `INSERT INTO fornecedores (nome, cnpj_cpf, telefone, email, chave_pix, cidade, estado)
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [nome, cnpj_cpf, telefone, email, chave_pix, cidade, estado]
        );
        res.status(201).json(resultado.rows[0]);
    } catch (erro) {
        res.status(500).json({ erro: "Erro ao cadastrar fornecedor." });
    }
});

// ENTRADA DE COMPRA DE MERCADORIA (SOMA ESTOQUE AUTOMATICAMENTE)
app.post("/compras", autenticar, apenasAdmin, async (req, res) => {
    const { fornecedor_id, numero_nota, data_compra, itens, observacoes } = req.body;
    if (!Array.isArray(itens) || itens.length === 0) {
        return res.status(400).json({ erro: "Informe ao menos um item comprado." });
    }
    if (itens.some(item => !idValido(item.produto_id) || !idValido(item.estoque_id) || !Number.isSafeInteger(Number(item.quantidade)) || Number(item.quantidade) <= 0 || !dinheiroValido(item.preco_custo_unitario))) {
        return res.status(400).json({ erro: "Produto, variação, quantidade e custo dos itens devem ser válidos." });
    }
    if (fornecedor_id && !idValido(fornecedor_id)) return res.status(400).json({ erro: "Fornecedor inválido." });

    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        let valorTotal = 0;

        for (const item of itens) {
            valorTotal += Number(item.preco_custo_unitario) * Number(item.quantidade);
        }

        const compraRes = await client.query(
            `INSERT INTO compras_fornecedor (fornecedor_id, numero_nota, valor_total, data_compra, observacoes)
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [fornecedor_id || null, numero_nota, valorTotal, data_compra || new Date(), observacoes]
        );
        const compraId = compraRes.rows[0].id;

        for (const item of itens) {
            const subtotal = Number(item.preco_custo_unitario) * Number(item.quantidade);
            const estoqueCompra = await client.query(
                "SELECT id,produto_id,tamanho,cor,quantidade FROM estoque WHERE id=$1 AND produto_id=$2 AND ativo=true FOR UPDATE",
                [item.estoque_id,item.produto_id]
            );
            if (!estoqueCompra.rows.length || estoqueCompra.rows[0].tamanho !== item.tamanho || estoqueCompra.rows[0].cor !== item.cor) {
                throw Object.assign(new Error("Variação não pertence ao produto informado."), { statusCode: 400 });
            }

            // 1. Grava o item da compra
            await client.query(
                `INSERT INTO itens_compra (compra_id, produto_id, estoque_id, tamanho, cor, quantidade, preco_custo_unitario, subtotal)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [compraId, item.produto_id, item.estoque_id, item.tamanho, item.cor, item.quantidade, item.preco_custo_unitario, subtotal]
            );

            // 2. SOMA as peças que chegaram diretamente no estoque
            await client.query(
                `UPDATE estoque SET quantidade = quantidade + $1, atualizado_em = NOW() WHERE id = $2`,
                [item.quantidade, item.estoque_id]
            );
            await movimentarEstoque(client, { estoqueId: item.estoque_id, usuarioId: req.usuario.id, tipo: "entrada_compra", quantidade: Number(item.quantidade), saldoAnterior: Number(estoqueCompra.rows[0].quantidade), referenciaTipo: "compra", referenciaId: compraId });

            // 3. Atualiza o preço de custo no produto
            await client.query(
                `UPDATE produtos SET preco_custo = $1 WHERE id = $2`,
                [item.preco_custo_unitario, item.produto_id]
            );
        }

        await client.query("COMMIT");
        res.status(201).json({ mensagem: "Compra registrada e estoque atualizado com sucesso!" });
    } catch (erro) {
        await client.query("ROLLBACK");
        res.status(erro.statusCode || 500).json({ erro: erro.message || "Erro ao processar compra de mercadorias." });
    } finally {
        client.release();
    }
});

// ATUALIZAR RASTREIO DE ENVIO (ADMIN)
app.patch("/pedidos/:id/rastreio", autenticar, apenasAdmin, async (req, res) => {
    try {
        const { codigo_rastreio } = req.body;
        if (!codigo_rastreio) {
            return res.status(400).json({ erro: "Informe o código de rastreio." });
        }

        const resultado = await pool.query(
            `UPDATE pedidos SET codigo_rastreio=$1,status='enviado',atualizado_em=NOW()
             WHERE id=$2 AND status='processando'
               AND EXISTS (SELECT 1 FROM pagamentos WHERE pedido_id=pedidos.id AND status='pago') RETURNING *`,
            [codigo_rastreio.trim(), req.params.id]
        );
        if (resultado.rows.length === 0) return res.status(409).json({ erro: "Pedido deve estar processando e pago antes do envio." });

        res.json({ mensagem: "Código de rastreio registrado!", pedido: resultado.rows[0] });
    } catch (erro) {
        res.status(500).json({ erro: "Erro ao salvar código de rastreio." });
    }
});

// Middleware Global de Tratamento de Erros (incluindo estouro de limites do Multer)
app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        return res.status(400).json({ erro: `Erro no upload de arquivo: ${err.message}` });
    } else if (err) {
        return res.status(400).json({ erro: err.message || "Requisição inválida." });
    }
    next();
});

app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
});

app.put("/produtos/:id", autenticar, apenasAdmin, upload.single("imagem"), async (req, res) => {
    if (!idValido(req.params.id)) return res.status(400).json({ erro: "ID inválido." });
    const { nome, descricao, preco, categoria, ativo, tamanhos, cores } = req.body;
    if (!nome || !dinheiroValido(preco) || Number(preco) <= 0) return res.status(400).json({ erro: "Nome e preço válido são obrigatórios." });
    let listaTamanhos, listaCores;
    try {
        listaTamanhos = Array.isArray(tamanhos) ? tamanhos : JSON.parse(tamanhos || "[]");
        listaCores = Array.isArray(cores) ? cores : JSON.parse(cores || "[]");
    } catch (_) { return res.status(400).json({ erro: "Variações inválidas." }); }
    listaTamanhos = [...new Set(listaTamanhos.map(v => String(v).trim()).filter(Boolean))];
    listaCores = [...new Set(listaCores.map(v => String(v).trim()).filter(Boolean))];
    if (!listaTamanhos.length || !listaCores.length || listaTamanhos.length * listaCores.length > 100) return res.status(400).json({ erro: "Selecione tamanhos e cores válidos." });
    const desejadas = new Set(listaTamanhos.flatMap(t => listaCores.map(c => `${t}|${c}`)));
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const existentes = await client.query("SELECT id,tamanho,cor,quantidade FROM estoque WHERE produto_id=$1 FOR UPDATE", [req.params.id]);
        const comSaldoRemovidas = existentes.rows.filter(v => !desejadas.has(`${v.tamanho}|${v.cor}`) && Number(v.quantidade) > 0);
        if (comSaldoRemovidas.length) {
            await client.query("ROLLBACK");
            return res.status(409).json({ erro: "Zere ou transfira o estoque das variações removidas antes de desativá-las." });
        }

        await auditar(client, req, "editar", "produto", Number(req.params.id), { nome: nome.trim() });
        const resultado = await client.query(`UPDATE produtos SET nome=$1,descricao=$2,preco=$3,categoria=$4,
            imagem=COALESCE($5,imagem),ativo=COALESCE($6::boolean,ativo),atualizado_em=NOW() WHERE id=$7 RETURNING *`,
            [nome.trim(), descricao || null, Number(preco), categoria || null, req.file ? req.file.filename : null, ativo === undefined ? null : ativo, req.params.id]);
        if (!resultado.rows.length) { await client.query("ROLLBACK"); return res.status(404).json({ erro: "Produto não encontrado." }); }
        await client.query("UPDATE estoque SET ativo=false,atualizado_em=NOW() WHERE produto_id=$1", [req.params.id]);
        for (const tamanho of listaTamanhos) for (const cor of listaCores) {
            await client.query(`INSERT INTO estoque(produto_id,tamanho,cor,quantidade,ativo) VALUES($1,$2,$3,0,true)
                ON CONFLICT(produto_id,tamanho,cor) DO UPDATE SET ativo=true,atualizado_em=NOW()`, [req.params.id,tamanho,cor]);
        }
        await client.query("COMMIT");
        res.json(resultado.rows[0]);
    } catch (erro) {
        await client.query("ROLLBACK");
        res.status(500).json({ erro: "Erro ao editar produto." });
    } finally { client.release(); }
});

app.delete("/produtos/:id", autenticar, apenasAdmin, async (req, res) => {
    if (!idValido(req.params.id)) return res.status(400).json({ erro: "ID inválido." });
    const resultado = await pool.query(
        "UPDATE produtos SET ativo=false, atualizado_em=NOW() WHERE id=$1 AND ativo=true RETURNING id",
        [req.params.id]
    );
    if (!resultado.rows.length) return res.status(404).json({ erro: "Produto não encontrado ou já inativo." });
    res.json({ mensagem: "Produto desativado com sucesso." });
});
