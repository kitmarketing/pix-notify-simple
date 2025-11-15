-- Renomear coluna pagador para info_pagador na tabela pix_recebidos
ALTER TABLE public.pix_recebidos 
RENAME COLUMN pagador TO info_pagador;