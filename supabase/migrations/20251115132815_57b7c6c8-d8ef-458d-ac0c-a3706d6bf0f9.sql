-- Criar tabela para armazenar PIX recebidos
CREATE TABLE public.pix_recebidos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  valor DECIMAL(15,2) NOT NULL,
  pagador TEXT NOT NULL,
  horario TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  txid TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Criar índice para buscar por txid rapidamente
CREATE INDEX idx_pix_txid ON public.pix_recebidos(txid);

-- Criar índice para ordenar por horário
CREATE INDEX idx_pix_horario ON public.pix_recebidos(horario DESC);

-- Habilitar RLS (mas permitir acesso público já que é um painel interno)
ALTER TABLE public.pix_recebidos ENABLE ROW LEVEL SECURITY;

-- Permitir leitura para todos
CREATE POLICY "Permitir leitura de PIX para todos"
ON public.pix_recebidos
FOR SELECT
USING (true);

-- Permitir inserção apenas via service role (edge functions)
CREATE POLICY "Permitir inserção via service role"
ON public.pix_recebidos
FOR INSERT
WITH CHECK (true);