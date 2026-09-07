const { MercadoPagoConfig, Payment, WebhookSignatureValidator } = require("mercadopago");

function exigirConfiguracao() {
    if (!process.env.MERCADO_PAGO_ACCESS_TOKEN) {
        const erro = new Error("Mercado Pago nao configurado no servidor.");
        erro.statusCode = 503;
        throw erro;
    }
    return new MercadoPagoConfig({ accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN, options: { timeout: 10000 } });
}

async function buscarPagamento(id) { return new Payment(exigirConfiguracao()).get({ id: String(id) }); }

async function criarPagamento({ pedido, usuario, dados, idempotencyKey }) {
    const pagamento = new Payment(exigirConfiguracao());
    const baseUrl = String(process.env.APP_PUBLIC_URL || "").replace(/\/$/, "");
    const corpo = {
        transaction_amount: Number(pedido.valor_total),
        description: `Pedido AUTHENTIC #${pedido.id}`,
        external_reference: String(pedido.id),
        payment_method_id: dados.payment_method_id,
        payer: {
            email: usuario.email,
            identification: dados.payer?.identification
        },
        notification_url: baseUrl ? `${baseUrl}/webhooks/mercado-pago` : undefined,
        metadata: { pedido_id: String(pedido.id), usuario_id: String(pedido.usuario_id) }
    };
    if (dados.token) corpo.token = dados.token;
    if (dados.installments) corpo.installments = Number(dados.installments);
    if (dados.issuer_id) corpo.issuer_id = String(dados.issuer_id);
    return pagamento.create({ body: corpo, requestOptions: { idempotencyKey } });
}

function validarWebhook(req) {
    if (!process.env.MERCADO_PAGO_WEBHOOK_SECRET) {
        const erro = new Error("Segredo de webhook nao configurado."); erro.statusCode = 503; throw erro;
    }
    WebhookSignatureValidator.validate({
        xSignature: req.get("x-signature"), xRequestId: req.get("x-request-id"),
        dataId: req.query["data.id"] || req.body?.data?.id,
        secret: process.env.MERCADO_PAGO_WEBHOOK_SECRET, toleranceSeconds: 300
    });
}

function statusLocal(status) {
    if (status === "approved") return "pago";
    if (status === "rejected") return "recusado";
    if (status === "cancelled") return "cancelado";
    if (["refunded", "charged_back"].includes(status)) return "estornado";
    return "pendente";
}

module.exports = { criarPagamento, buscarPagamento, validarWebhook, statusLocal };
