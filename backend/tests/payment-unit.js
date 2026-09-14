const crypto = require("crypto");
const { WebhookSignatureValidator } = require("mercadopago");
const { statusLocal } = require("../paymentGateway");
const { podeTransicionarStatus, decidirStatusPagamento } = require("../paymentState");
const esperado = { approved: "pago", pending: "pendente", in_process: "pendente", rejected: "recusado", cancelled: "cancelado", refunded: "estornado", charged_back: "estornado" };
for (const [entrada, saida] of Object.entries(esperado)) if (statusLocal(entrada) !== saida) throw new Error(`Mapeamento incorreto: ${entrada}`);
const secret = "segredo-de-teste", dataId = "123456", requestId = "req-abc", ts = String(Math.floor(Date.now() / 1000));
const hash = crypto.createHmac("sha256", secret).update(`id:${dataId};request-id:${requestId};ts:${ts};`).digest("hex");
WebhookSignatureValidator.validate({ xSignature: `ts=${ts},v1=${hash}`, xRequestId: requestId, dataId, secret, toleranceSeconds: 300 });
let rejeitou = false;
try { WebhookSignatureValidator.validate({ xSignature: `ts=${ts},v1=00`, xRequestId: requestId, dataId, secret }); } catch (_) { rejeitou = true; }
if (!rejeitou) throw new Error("Assinatura adulterada foi aceita.");
const casos = [
  ["pendente", "pago", true], ["pago", "pendente", false], ["pago", "recusado", false],
  ["pago", "estornado", true], ["estornado", "pendente", false], ["cancelado", "pendente", false]
];
for (const [atual, novo, permitido] of casos) if (podeTransicionarStatus(atual, novo) !== permitido) throw new Error(`Transicao incorreta: ${atual} -> ${novo}`);
if (decidirStatusPagamento({statusAtual:"pago",statusGateway:"pendente"}) !== "pago") throw new Error("Webhook fora de ordem regrediu pagamento aprovado.");
if (decidirStatusPagamento({statusAtual:"pago",statusGateway:"pago"}) !== "pago") throw new Error("Webhook duplicado nao foi idempotente.");
if (decidirStatusPagamento({statusAtual:"estornado",statusGateway:"estornado"}) !== "estornado") throw new Error("Estorno duplicado nao foi idempotente.");
if (decidirStatusPagamento({statusAtual:"pendente",statusGateway:"pago",reservaLiberada:true}) !== "estorno_pendente") throw new Error("Aprovacao tardia nao solicitou estorno.");
console.log("Pagamento: estados e assinatura de webhook validados.");
