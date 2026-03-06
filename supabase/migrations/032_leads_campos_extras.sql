-- Migration 032: Campos extras na tabela leads (árvore de conversa v2)
-- tipo_atendimento: emergencial / preventivo
-- especie_pet: cachorro / gato / exotico (só emergencial)
-- grande_porte: true/false (só cachorro)
-- protocolo ofuscado: Y1 M1 T1 SEQ T2 M2 Y2 → ex: 20E001M36

ALTER TABLE leads ADD COLUMN tipo_atendimento TEXT;
ALTER TABLE leads ADD COLUMN especie_pet TEXT;
ALTER TABLE leads ADD COLUMN grande_porte BOOLEAN;
ALTER TABLE leads ADD COLUMN protocolo TEXT;

-- RPC: insere lead e retorna protocolo gerado
-- SECURITY DEFINER pra ter permissão de SELECT (contagem) + INSERT
CREATE OR REPLACE FUNCTION public.insert_lead(lead_data JSONB)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tipo TEXT;
  v_seq INT;
  v_protocolo TEXT;
  v_yy TEXT;
  v_mm TEXT;
  v_t1 CHAR;
  v_t2 CHAR;
BEGIN
  v_tipo := lead_data->>'tipo_atendimento';
  v_yy := TO_CHAR(NOW() AT TIME ZONE 'America/Sao_Paulo', 'YY');
  v_mm := TO_CHAR(NOW() AT TIME ZONE 'America/Sao_Paulo', 'MM');

  -- Tipo: EM (emergencial) ou PV (preventivo)
  IF v_tipo = 'emergencial' THEN
    v_t1 := 'E'; v_t2 := 'M';
  ELSIF v_tipo = 'preventivo' THEN
    v_t1 := 'P'; v_t2 := 'V';
  ELSE
    v_t1 := 'X'; v_t2 := 'X';
  END IF;

  -- Sequencial no mês por tipo
  SELECT COUNT(*) + 1 INTO v_seq
  FROM leads
  WHERE tipo_atendimento = v_tipo
    AND created_at >= DATE_TRUNC('month', NOW() AT TIME ZONE 'America/Sao_Paulo')
                        AT TIME ZONE 'America/Sao_Paulo';

  -- Formato ofuscado: Y1 M1 T1 SEQ T2 M2 Y2
  -- Ex: março 2026, EM, 1o → 20E001M36
  v_protocolo := SUBSTR(v_yy, 1, 1) || SUBSTR(v_mm, 1, 1)
              || v_t1 || LPAD(v_seq::TEXT, 3, '0') || v_t2
              || SUBSTR(v_mm, 2, 1) || SUBSTR(v_yy, 2, 1);

  INSERT INTO leads (
    nome, cidade, canal, telefone_destino,
    tipo_atendimento, especie_pet, grande_porte,
    gclid, utm_source, utm_medium, utm_campaign, utm_term,
    pagina_origem, dispositivo, protocolo
  ) VALUES (
    lead_data->>'nome',
    lead_data->>'cidade',
    lead_data->>'canal',
    lead_data->>'telefone_destino',
    lead_data->>'tipo_atendimento',
    lead_data->>'especie_pet',
    (lead_data->>'grande_porte')::BOOLEAN,
    lead_data->>'gclid',
    lead_data->>'utm_source',
    lead_data->>'utm_medium',
    lead_data->>'utm_campaign',
    lead_data->>'utm_term',
    lead_data->>'pagina_origem',
    lead_data->>'dispositivo',
    v_protocolo
  );

  RETURN v_protocolo;
END;
$$;

-- Anon precisa chamar a RPC do popup da LP
GRANT EXECUTE ON FUNCTION public.insert_lead(JSONB) TO anon;
GRANT EXECUTE ON FUNCTION public.insert_lead(JSONB) TO authenticated;
