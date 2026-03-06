-- Migration 034: Rate limit no insert_lead (anti-spam)
-- Limita 5 leads por IP/minuto (via headers do PostgREST)
-- Como não temos IP no RPC, limitamos por fingerprint: mesmo dispositivo+pagina em 30s

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
  v_tempo INT;
  v_scroll INT;
  v_views INT;
  v_tempo_char CHAR;
  v_scroll_char CHAR;
  v_views_char CHAR;
  v_recent INT;
BEGIN
  -- Rate limit: máx 3 leads do mesmo dispositivo+página nos últimos 60s
  SELECT COUNT(*) INTO v_recent
  FROM leads
  WHERE dispositivo = lead_data->>'dispositivo'
    AND pagina_origem = lead_data->>'pagina_origem'
    AND created_at >= NOW() - INTERVAL '60 seconds';

  IF v_recent >= 3 THEN
    RAISE EXCEPTION 'Rate limit exceeded';
  END IF;

  v_tipo := lead_data->>'tipo_atendimento';
  v_yy := TO_CHAR(NOW() AT TIME ZONE 'America/Sao_Paulo', 'YY');
  v_mm := TO_CHAR(NOW() AT TIME ZONE 'America/Sao_Paulo', 'MM');

  IF v_tipo = 'emergencial' THEN
    v_t1 := 'E'; v_t2 := 'M';
  ELSIF v_tipo = 'preventivo' THEN
    v_t1 := 'P'; v_t2 := 'V';
  ELSE
    v_t1 := 'X'; v_t2 := 'X';
  END IF;

  SELECT COUNT(*) + 1 INTO v_seq
  FROM leads
  WHERE tipo_atendimento = v_tipo
    AND created_at >= DATE_TRUNC('month', NOW() AT TIME ZONE 'America/Sao_Paulo')
                        AT TIME ZONE 'America/Sao_Paulo';

  v_tempo := COALESCE((lead_data->>'tempo_pagina_seg')::INT, 0);
  IF v_tempo >= 300 THEN v_tempo_char := 'A';
  ELSIF v_tempo >= 120 THEN v_tempo_char := 'B';
  ELSIF v_tempo >= 30 THEN v_tempo_char := 'C';
  ELSE v_tempo_char := 'D';
  END IF;

  v_scroll := COALESCE((lead_data->>'scroll_depth')::INT, 0);
  v_scroll_char := LEAST(v_scroll / 10, 9)::TEXT;

  v_views := COALESCE((lead_data->>'page_views')::INT, 1);
  v_views_char := LEAST(v_views, 9)::TEXT;

  v_protocolo := SUBSTR(v_yy, 1, 1) || SUBSTR(v_mm, 1, 1)
              || v_t1 || LPAD(v_seq::TEXT, 3, '0') || v_t2
              || SUBSTR(v_mm, 2, 1) || SUBSTR(v_yy, 2, 1)
              || v_tempo_char || v_scroll_char || v_views_char;

  INSERT INTO leads (
    nome, cidade, canal, telefone_destino,
    tipo_atendimento, especie_pet, grande_porte,
    gclid, utm_source, utm_medium, utm_campaign, utm_term,
    pagina_origem, dispositivo, protocolo,
    tempo_pagina_seg, scroll_depth, page_views, secao_clique
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
    v_protocolo,
    (lead_data->>'tempo_pagina_seg')::INT,
    (lead_data->>'scroll_depth')::INT,
    (lead_data->>'page_views')::INT,
    lead_data->>'secao_clique'
  );

  RETURN v_protocolo;
END;
$$;
