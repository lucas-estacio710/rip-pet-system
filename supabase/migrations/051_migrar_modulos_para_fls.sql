-- ============================================
-- 051: Migrar modulos_ativos → field_permissions
-- Converte o sistema legado on/off por unidade para FLS por unidade+role
-- Lógica: itens AUSENTES de modulos_ativos → insert como 'hidden' para gerente E operador
-- Itens PRESENTES = default 'edit' = nenhuma row necessária
-- ============================================

DO $$
DECLARE
  all_items TEXT[] := ARRAY[
    'tela_dashboard', 'tela_leads', 'tela_fichas', 'tela_preventivos',
    'tela_pipeline', 'tela_entregas', 'tela_estoque', 'tela_tutores', 'tela_gc',
    'func_tutores', 'func_gc',
    'cb_padronizacao_clinicas'
  ];
  roles TEXT[] := ARRAY['gerente', 'operador'];
  u RECORD;
  item TEXT;
  r TEXT;
BEGIN
  FOR u IN SELECT id, modulos_ativos FROM unidades LOOP
    FOREACH item IN ARRAY all_items LOOP
      -- Se o item NÃO está em modulos_ativos → hidden para ambos os roles
      IF NOT (COALESCE(u.modulos_ativos, '{}') @> ARRAY[item]) THEN
        FOREACH r IN ARRAY roles LOOP
          INSERT INTO field_permissions (unidade_id, tela, campo, role, permissao)
          VALUES (u.id, 'global', item, r, 'hidden')
          ON CONFLICT (unidade_id, tela, campo, role) DO NOTHING;
        END LOOP;
      END IF;
    END LOOP;
  END LOOP;

  RAISE NOTICE 'Migração modulos_ativos → field_permissions concluída';
END $$;
