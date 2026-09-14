# Produção — AUTHENTIC

## Pagamentos

O checkout online usa Mercado Pago Payment Brick. Os campos de cartão são renderizados e tokenizados pelo componente oficial do Mercado Pago; o projeto recebe somente o token e não recebe nem armazena PAN ou CVV. Para Pix, o backend cria o pagamento e devolve apenas QR Code e código copia e cola.

Configure no backend:

```env
NODE_ENV=production
APP_PUBLIC_URL=https://www.seudominio.com.br
CORS_ORIGIN=https://www.seudominio.com.br
JWT_SECRET=gere-um-segredo-criptograficamente-aleatorio-com-32-ou-mais-caracteres
MERCADO_PAGO_ACCESS_TOKEN=APP_USR_...
MERCADO_PAGO_PUBLIC_KEY=APP_USR_...
MERCADO_PAGO_WEBHOOK_SECRET=...
DB_SSL=true
DB_SSL_REJECT_UNAUTHORIZED=true
ALLOW_INSECURE_HTTP=false
```

Nunca inclua barra final em `CORS_ORIGIN`. No deploy atual, use:

```env
APP_PUBLIC_URL=https://authentic-api-h42a.onrender.com
CORS_ORIGIN=https://authentic-f8nd.onrender.com
```

O frontend centraliza a API em `frontend/js/api.js`. As chamadas autenticadas usam `credentials: "include"`; o JWT fica em cookie `HttpOnly`, `Secure` e `SameSite=None` em produção. Como frontend e API usam hosts Render distintos, o bloqueio de cookies de terceiros em alguns navegadores ainda pode impedir a sessão. Para produção real, prefira domínio próprio com frontend e API no mesmo site ou sirva o frontend pelo mesmo serviço do backend.

O `render.yaml` inclui o redirecionamento da raiz estática para `/pages/index.html`. Se o serviço já existir fora de Blueprint, replique essa regra no painel Render.

No painel Mercado Pago, crie uma aplicação Checkout Bricks, cadastre `https://www.seudominio.com.br/webhooks/mercado-pago`, selecione o evento **Pagamentos**, copie a assinatura secreta para `MERCADO_PAGO_WEBHOOK_SECRET` e faça a simulação de webhook. O Access Token é exclusivo do backend; somente a Public Key é entregue ao navegador.

Antes do deploy, aplique:

```sh
cd backend
npm ci --omit=dev
npm run migrate
npm test
```

O proxy reverso deve terminar TLS e enviar `X-Forwarded-Proto: https`. Configure backup automático do PostgreSQL, retenção, restauração testada, monitoramento do endpoint e alertas para registros `eventos_webhook.status='erro'` e pagamentos `estorno_pendente`.

## Limites atuais

- Estornos online ainda exigem execução no painel do Mercado Pago e reconciliação; não publique cancelamento automático ao cliente até a API de refund estar integrada.
- Um pagamento sem webhook pode ser reconciliado por administrador em `POST /pagamentos/:id/reconciliar`, informando `transaction_id` quando ele ainda não estiver salvo.
- Credenciais reais, HTTPS, webhook público, entrega de e-mail e política de backup só podem ser validados no ambiente de hospedagem.
