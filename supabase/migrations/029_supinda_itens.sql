-- 029: Itens avulsos de supinda (checklist livre)

CREATE TABLE supinda_itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supinda_id UUID NOT NULL REFERENCES supindas(id) ON DELETE CASCADE,
  descricao TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'levar' CHECK (tipo IN ('levar', 'retornar')),
  feito BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE supinda_itens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "supinda_itens_all" ON supinda_itens FOR ALL USING (true) WITH CHECK (true);
