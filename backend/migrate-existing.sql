BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS ativo BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS preco_custo NUMERIC(12,2);
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS ativo BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE estoque ADD COLUMN IF NOT EXISTS ativo BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS cupom_id BIGINT REFERENCES cupons(id) ON DELETE SET NULL;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS desconto NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS codigo_rastreio VARCHAR(100);
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS reserva_expira_em TIMESTAMPTZ;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS reserva_liberada_em TIMESTAMPTZ;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS idempotency_key UUID;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS origem VARCHAR(20) NOT NULL DEFAULT 'online';
ALTER TABLE pagamentos ADD COLUMN IF NOT EXISTS provedor VARCHAR(60) NOT NULL DEFAULT 'manual';
ALTER TABLE pagamentos ADD COLUMN IF NOT EXISTS transacao_id VARCHAR(150);
ALTER TABLE pagamentos ADD COLUMN IF NOT EXISTS pago_em TIMESTAMPTZ;
ALTER TABLE pagamentos ADD COLUMN IF NOT EXISTS atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE pagamentos ADD COLUMN IF NOT EXISTS preferencia_id VARCHAR(150);
ALTER TABLE pagamentos ADD COLUMN IF NOT EXISTS checkout_url TEXT;
ALTER TABLE pagamentos ADD COLUMN IF NOT EXISTS idempotency_key UUID;
ALTER TABLE pagamentos ADD COLUMN IF NOT EXISTS status_detalhe VARCHAR(120);
ALTER TABLE pagamentos ADD COLUMN IF NOT EXISTS ultima_reconciliacao_em TIMESTAMPTZ;

DO $$
DECLARE restricao RECORD;
BEGIN
  FOR restricao IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'pagamentos'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE pagamentos DROP CONSTRAINT %I', restricao.conname);
  END LOOP;
END $$;
ALTER TABLE pagamentos DROP CONSTRAINT IF EXISTS pagamentos_status_check;
ALTER TABLE pagamentos ADD CONSTRAINT pagamentos_status_check
  CHECK (status IN ('pendente','pago','recusado','cancelado','estorno_pendente','estornado'));
UPDATE pagamentos SET pago_em=COALESCE(pago_em,atualizado_em,criado_em,NOW()) WHERE status='pago' AND pago_em IS NULL;
ALTER TABLE pagamentos DROP CONSTRAINT IF EXISTS pagamentos_pago_em_check;
ALTER TABLE pagamentos ADD CONSTRAINT pagamentos_pago_em_check CHECK (status<>'pago' OR pago_em IS NOT NULL);

CREATE UNIQUE INDEX IF NOT EXISTS usuarios_email_unique ON usuarios (LOWER(email));
CREATE UNIQUE INDEX IF NOT EXISTS estoque_variacao_unique ON estoque(produto_id, tamanho, cor);
CREATE UNIQUE INDEX IF NOT EXISTS pagamentos_pedido_unique ON pagamentos(pedido_id);
CREATE UNIQUE INDEX IF NOT EXISTS pagamentos_transacao_unique ON pagamentos(transacao_id) WHERE transacao_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS pagamentos_preferencia_unique ON pagamentos(preferencia_id) WHERE preferencia_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS pagamentos_idempotency_unique ON pagamentos(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS pedidos_usuario_data_idx ON pedidos(usuario_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS pedidos_status_data_idx ON pedidos(status, criado_em DESC);
CREATE INDEX IF NOT EXISTS pedidos_reserva_expira_idx ON pedidos(reserva_expira_em) WHERE reserva_liberada_em IS NULL;
CREATE INDEX IF NOT EXISTS itens_pedido_pedido_idx ON itens_pedido(pedido_id);
CREATE UNIQUE INDEX IF NOT EXISTS pedidos_idempotency_unique ON pedidos(idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS movimentacoes_estoque (
  id BIGSERIAL PRIMARY KEY, estoque_id BIGINT NOT NULL REFERENCES estoque(id) ON DELETE RESTRICT,
  usuario_id BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
  tipo VARCHAR(30) NOT NULL CHECK (tipo IN ('entrada_compra','saida_venda','cancelamento','ajuste','expiracao')),
  quantidade INTEGER NOT NULL CHECK (quantidade <> 0), saldo_anterior INTEGER NOT NULL CHECK (saldo_anterior >= 0),
  saldo_posterior INTEGER NOT NULL CHECK (saldo_posterior >= 0), referencia_tipo VARCHAR(30), referencia_id BIGINT,
  observacao TEXT, criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS auditoria (
  id BIGSERIAL PRIMARY KEY, usuario_id BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
  acao VARCHAR(80) NOT NULL, entidade VARCHAR(50) NOT NULL, entidade_id BIGINT,
  dados JSONB NOT NULL DEFAULT '{}'::jsonb, ip INET, criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS eventos_webhook (
  id BIGSERIAL PRIMARY KEY, provedor VARCHAR(60) NOT NULL, evento_id VARCHAR(180) NOT NULL,
  transacao_id VARCHAR(150), tipo VARCHAR(80), status VARCHAR(30) NOT NULL DEFAULT 'recebido', erro TEXT,
  recebido_em TIMESTAMPTZ NOT NULL DEFAULT NOW(), processado_em TIMESTAMPTZ,
  UNIQUE(provedor,evento_id)
);
CREATE INDEX IF NOT EXISTS movimentacoes_estoque_ref_idx ON movimentacoes_estoque(referencia_tipo,referencia_id);
CREATE INDEX IF NOT EXISTS auditoria_entidade_idx ON auditoria(entidade,entidade_id,criado_em DESC);
CREATE INDEX IF NOT EXISTS eventos_webhook_transacao_idx ON eventos_webhook(provedor,transacao_id);

COMMIT;
