BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE IF NOT EXISTS usuarios (
  id BIGSERIAL PRIMARY KEY,
  nome VARCHAR(100) NOT NULL,
  email VARCHAR(150) NOT NULL,
  telefone VARCHAR(20),
  senha VARCHAR(255) NOT NULL,
  tipo VARCHAR(20) NOT NULL DEFAULT 'cliente' CHECK (tipo IN ('cliente','admin')),
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS usuarios_email_unique ON usuarios (LOWER(email));

CREATE TABLE IF NOT EXISTS produtos (
  id BIGSERIAL PRIMARY KEY,
  nome VARCHAR(150) NOT NULL,
  descricao TEXT,
  preco NUMERIC(12,2) NOT NULL CHECK (preco > 0),
  preco_custo NUMERIC(12,2) CHECK (preco_custo IS NULL OR preco_custo >= 0),
  categoria VARCHAR(80),
  imagem VARCHAR(255),
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS estoque (
  id BIGSERIAL PRIMARY KEY,
  produto_id BIGINT NOT NULL REFERENCES produtos(id) ON DELETE RESTRICT,
  tamanho VARCHAR(20) NOT NULL,
  cor VARCHAR(60) NOT NULL,
  quantidade INTEGER NOT NULL DEFAULT 0 CHECK (quantidade >= 0),
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (produto_id, tamanho, cor)
);

CREATE TABLE IF NOT EXISTS cupons (
  id BIGSERIAL PRIMARY KEY,
  codigo VARCHAR(50) NOT NULL UNIQUE,
  tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('porcentagem','fixo')),
  valor NUMERIC(12,2) NOT NULL CHECK (valor > 0),
  valor_minimo_pedido NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (valor_minimo_pedido >= 0),
  limite_usos INTEGER CHECK (limite_usos IS NULL OR limite_usos > 0),
  usos_atuais INTEGER NOT NULL DEFAULT 0 CHECK (usos_atuais >= 0),
  data_validade DATE,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pedidos (
  id BIGSERIAL PRIMARY KEY,
  usuario_id BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  forma_recebimento VARCHAR(20) NOT NULL CHECK (forma_recebimento IN ('retirada','entrega')),
  forma_pagamento VARCHAR(30) NOT NULL CHECK (forma_pagamento IN ('pix','cartao','dinheiro','pagamento_na_retirada')),
  status VARCHAR(30) NOT NULL DEFAULT 'aguardando_pagamento' CHECK (status IN ('aguardando_pagamento','pendente','processando','enviado','concluido','cancelado')),
  valor_total NUMERIC(12,2) NOT NULL CHECK (valor_total >= 0),
  cupom_id BIGINT REFERENCES cupons(id) ON DELETE SET NULL,
  desconto NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (desconto >= 0),
  cep VARCHAR(10), endereco VARCHAR(180), numero VARCHAR(20), complemento VARCHAR(100),
  bairro VARCHAR(100), cidade VARCHAR(100), estado CHAR(2), codigo_rastreio VARCHAR(100),
  reserva_expira_em TIMESTAMPTZ,
  reserva_liberada_em TIMESTAMPTZ,
  idempotency_key UUID UNIQUE,
  origem VARCHAR(20) NOT NULL DEFAULT 'online' CHECK (origem IN ('online','presencial')),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(), atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (forma_recebimento <> 'entrega' OR (cep IS NOT NULL AND endereco IS NOT NULL AND numero IS NOT NULL AND bairro IS NOT NULL AND cidade IS NOT NULL AND estado IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS itens_pedido (
  id BIGSERIAL PRIMARY KEY,
  pedido_id BIGINT NOT NULL REFERENCES pedidos(id) ON DELETE RESTRICT,
  produto_id BIGINT NOT NULL REFERENCES produtos(id) ON DELETE RESTRICT,
  tamanho VARCHAR(20) NOT NULL, cor VARCHAR(60) NOT NULL,
  quantidade INTEGER NOT NULL CHECK (quantidade > 0),
  preco_unitario NUMERIC(12,2) NOT NULL CHECK (preco_unitario >= 0),
  subtotal NUMERIC(12,2) NOT NULL CHECK (subtotal >= 0)
);

CREATE TABLE IF NOT EXISTS pagamentos (
  id BIGSERIAL PRIMARY KEY,
  pedido_id BIGINT NOT NULL UNIQUE REFERENCES pedidos(id) ON DELETE RESTRICT,
  provedor VARCHAR(60) NOT NULL DEFAULT 'manual', transacao_id VARCHAR(150) UNIQUE,
  metodo VARCHAR(30) NOT NULL CHECK (metodo IN ('pix','cartao','dinheiro','pagamento_na_retirada')),
  status VARCHAR(20) NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','pago','recusado','cancelado','estorno_pendente','estornado')),
  valor NUMERIC(12,2) NOT NULL CHECK (valor >= 0),
  preferencia_id VARCHAR(150) UNIQUE, checkout_url TEXT, idempotency_key UUID UNIQUE,
  status_detalhe VARCHAR(120), ultima_reconciliacao_em TIMESTAMPTZ,
  pago_em TIMESTAMPTZ, criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(), atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pagamentos_pago_em_check CHECK ((status <> 'pago') OR pago_em IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS eventos_webhook (
  id BIGSERIAL PRIMARY KEY, provedor VARCHAR(60) NOT NULL, evento_id VARCHAR(180) NOT NULL,
  transacao_id VARCHAR(150), tipo VARCHAR(80), status VARCHAR(30) NOT NULL DEFAULT 'recebido',
  erro TEXT, recebido_em TIMESTAMPTZ NOT NULL DEFAULT NOW(), processado_em TIMESTAMPTZ,
  UNIQUE(provedor, evento_id)
);

CREATE TABLE IF NOT EXISTS despesas (
  id BIGSERIAL PRIMARY KEY, descricao VARCHAR(180) NOT NULL, categoria VARCHAR(80) NOT NULL,
  valor NUMERIC(12,2) NOT NULL CHECK (valor > 0), data_despesa DATE NOT NULL,
  observacoes TEXT, criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS movimentacoes_estoque (
  id BIGSERIAL PRIMARY KEY,
  estoque_id BIGINT NOT NULL REFERENCES estoque(id) ON DELETE RESTRICT,
  usuario_id BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
  tipo VARCHAR(30) NOT NULL CHECK (tipo IN ('entrada_compra','saida_venda','cancelamento','ajuste','expiracao')),
  quantidade INTEGER NOT NULL CHECK (quantidade <> 0),
  saldo_anterior INTEGER NOT NULL CHECK (saldo_anterior >= 0),
  saldo_posterior INTEGER NOT NULL CHECK (saldo_posterior >= 0),
  referencia_tipo VARCHAR(30), referencia_id BIGINT, observacao TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS auditoria (
  id BIGSERIAL PRIMARY KEY,
  usuario_id BIGINT REFERENCES usuarios(id) ON DELETE SET NULL,
  acao VARCHAR(80) NOT NULL, entidade VARCHAR(50) NOT NULL, entidade_id BIGINT,
  dados JSONB NOT NULL DEFAULT '{}'::jsonb, ip INET, criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fornecedores (
  id BIGSERIAL PRIMARY KEY, nome VARCHAR(150) NOT NULL, cnpj_cpf VARCHAR(20), telefone VARCHAR(20),
  email VARCHAR(150), chave_pix VARCHAR(150), cidade VARCHAR(100), estado CHAR(2), criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS compras_fornecedor (
  id BIGSERIAL PRIMARY KEY, fornecedor_id BIGINT REFERENCES fornecedores(id) ON DELETE SET NULL,
  numero_nota VARCHAR(80), valor_total NUMERIC(12,2) NOT NULL CHECK (valor_total >= 0),
  data_compra DATE NOT NULL DEFAULT CURRENT_DATE, observacoes TEXT, criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS itens_compra (
  id BIGSERIAL PRIMARY KEY, compra_id BIGINT NOT NULL REFERENCES compras_fornecedor(id) ON DELETE RESTRICT,
  produto_id BIGINT NOT NULL REFERENCES produtos(id) ON DELETE RESTRICT,
  estoque_id BIGINT NOT NULL REFERENCES estoque(id) ON DELETE RESTRICT,
  tamanho VARCHAR(20) NOT NULL, cor VARCHAR(60) NOT NULL, quantidade INTEGER NOT NULL CHECK (quantidade > 0),
  preco_custo_unitario NUMERIC(12,2) NOT NULL CHECK (preco_custo_unitario >= 0), subtotal NUMERIC(12,2) NOT NULL CHECK (subtotal >= 0)
);

CREATE INDEX IF NOT EXISTS pedidos_usuario_data_idx ON pedidos(usuario_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS pedidos_status_data_idx ON pedidos(status, criado_em DESC);
CREATE INDEX IF NOT EXISTS pedidos_reserva_expira_idx ON pedidos(reserva_expira_em) WHERE reserva_liberada_em IS NULL;
CREATE INDEX IF NOT EXISTS itens_pedido_pedido_idx ON itens_pedido(pedido_id);
CREATE INDEX IF NOT EXISTS estoque_produto_idx ON estoque(produto_id);
CREATE INDEX IF NOT EXISTS despesas_data_idx ON despesas(data_despesa DESC);
CREATE INDEX IF NOT EXISTS movimentacoes_estoque_ref_idx ON movimentacoes_estoque(referencia_tipo,referencia_id);
CREATE INDEX IF NOT EXISTS auditoria_entidade_idx ON auditoria(entidade,entidade_id,criado_em DESC);
CREATE INDEX IF NOT EXISTS eventos_webhook_transacao_idx ON eventos_webhook(provedor,transacao_id);

COMMIT;
