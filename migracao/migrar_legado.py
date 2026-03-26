"""
================================================================================
R.I.P. PET - SCRIPT DE MIGRAÇÃO DO LEGADO
================================================================================
Autor: Claude + Lucas
Data: Janeiro/2026
Descrição: Transforma os CSVs do Google Sheets para o formato do novo Supabase

COMO USAR:
    1. Coloque os CSVs atualizados na pasta Bases_legado/
    2. Execute: python migrar_legado.py
    3. Os arquivos prontos estarão em migracao/output/
    4. Importe no Supabase via Dashboard > Table Editor > Import CSV

ORDEM DE IMPORTAÇÃO NO SUPABASE:
    1. indicadores.csv
    2. funcionarios.csv
    3. fontes_conhecimento.csv
    4. supindas.csv
    5. produtos.csv
    6. contas.csv
    7. tutores.csv          # NOVO
    8. contratos.csv
    9. pagamentos.csv
    10. contrato_produtos.csv
    11. tarefas.csv

================================================================================
"""

import pandas as pd
import os
import sys
import uuid
from datetime import datetime
import re
from mapa_normalizacao_clinicas import normalizar_clinica

# Fix encoding para Windows
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

# =============================================================================
# CONFIGURAÇÃO
# =============================================================================

# Caminhos
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LEGADO_DIR = os.path.join(BASE_DIR, 'Bases_legado')
OUTPUT_DIR = os.path.join(BASE_DIR, 'migracao', 'output')

# Criar pasta de output se não existir
os.makedirs(OUTPUT_DIR, exist_ok=True)

# UUID da unidade Santos (chumbado do Supabase)
UNIDADE_SANTOS_ID = '94278414-ad10-4463-ba49-274474adb271'

# =============================================================================
# MAPEAMENTOS
# =============================================================================

# Status do atendimento: legado -> novo
STATUS_MAP = {
    '0 - Preventivo': 'preventivo',
    '1 - Ativo': 'ativo',
    '2 - Pinda': 'pinda',
    '3 - Retorno': 'retorno',
    '4 - Pendente': 'pendente',
    '5 - Finalizado': 'finalizado',
    # Variações
    'Preventivo': 'preventivo',
    'Ativo': 'ativo',
    'Pinda': 'pinda',
    'Retorno': 'retorno',
    'Pendente': 'pendente',
    'Finalizado': 'finalizado',
}

# Tipo de cremação
TIPO_CREMACAO_MAP = {
    'Individual': 'individual',
    'Coletiva': 'coletiva',
    'IND': 'individual',
    'COL': 'coletiva',
}

# Tipo de plano
TIPO_PLANO_MAP = {
    'EM': 'emergencial',
    'PV': 'preventivo',
    'Emergencial': 'emergencial',
    'Preventivo': 'preventivo',
}

# Espécie
ESPECIE_MAP = {
    'Canina': 'canina',
    'Canina ': 'canina',
    'Felina': 'felina',
    'Felina ': 'felina',
    'Exótica': 'exotica',
    'Exotica': 'exotica',
}

# Gênero
GENERO_MAP = {
    'Macho': 'macho',
    'Fêmea': 'femea',
    'Fêmea ': 'femea',
    'Femea': 'femea',
}

# Método de pagamento
METODO_PAGAMENTO_MAP = {
    'Pix': 'pix',
    'PIX': 'pix',
    'Dinheiro': 'dinheiro',
    'Crédito': 'credito',
    'Credito': 'credito',
    'Débito': 'debito',
    'Debito': 'debito',
}

# Taxas de cartão Granito - Mapeamento reverso (taxa% -> bandeira)
# Usado para inferir bandeira de pagamentos legados com id_transacao
TAXA_PARA_BANDEIRA = {
    # Débito
    1.01: 'master',   # master_debito
    1.28: 'visa',     # visa_debito
    1.59: 'elo',      # elo_debito
    # Crédito à Vista
    2.20: 'hiper',    # hiper_1x
    2.31: 'master',   # master_1x
    2.41: 'visa',     # visa_1x
    2.67: 'elo',      # elo_1x
    3.39: 'amex',     # amex_1x
    # Crédito 2x-6x
    3.18: 'visa',     # visa_2x a 6x
    3.20: 'master',   # master_2x a 6x
    3.71: 'hiper',    # hiper_2x a 6x
    3.73: 'elo',      # elo_2x a 6x
    4.23: 'amex',     # amex_2x a 6x
    # Crédito 7x-12x
    3.86: 'master',   # master_7x a 12x
    4.11: 'visa',     # visa_7x a 12x
    4.35: 'hiper',    # hiper_7x a 12x
    4.41: 'elo',      # elo_7x a 12x
    4.55: 'amex',     # amex_7x a 12x
}

def inferir_bandeira(taxa_percentual: float) -> str:
    """Infere a bandeira do cartão baseado no percentual da taxa.
    Retorna a bandeira mais próxima se não encontrar exata."""
    if taxa_percentual is None or taxa_percentual <= 0:
        return None

    # Arredondar para 2 casas
    taxa_arredondada = round(taxa_percentual, 2)

    # Busca exata
    if taxa_arredondada in TAXA_PARA_BANDEIRA:
        return TAXA_PARA_BANDEIRA[taxa_arredondada]

    # Busca aproximada (tolerância de 0.1%)
    for taxa, bandeira in TAXA_PARA_BANDEIRA.items():
        if abs(taxa - taxa_arredondada) <= 0.1:
            return bandeira

    # Se não encontrou, retorna a mais comum (master)
    return 'master'

# Rescaldo tipo por código de produto
RESCALDO_TIPO_MAP = {
    '0003': 'molde_patinha',
    '1401': 'molde_patinha', '1402': 'molde_patinha', '1403': 'molde_patinha',
    '1404': 'molde_patinha', '1405': 'molde_patinha', '1406': 'molde_patinha',
    '1406p': 'molde_patinha', '1408b': 'molde_patinha', '1408p': 'molde_patinha',
    '0401': 'molde_patinha', '0402': 'molde_patinha', '0403': 'molde_patinha',
    '1407': 'carimbo',
    '0007': 'pelo_extra',
    '2005b': 'pelo_extra', '2003b': 'pelo_extra', '2005': 'pelo_extra',
    '1810b': 'pelo_extra', '1810a': 'pelo_extra', '2005a': 'pelo_extra',
    '2005aaa': 'pelo_extra', '2005AA': 'pelo_extra', '2003a': 'pelo_extra',
    '2003aaa': 'pelo_extra', '2003AA': 'pelo_extra',
    '2008': 'pelo_extra', '2007': 'pelo_extra', '2010': 'pelo_extra', '2011': 'pelo_extra',
    # '0006' removido — "Protocolo de Retorno" agora tratado fora do estoque (processamento de fichas)
}

# Tipo de produto
TIPO_PRODUTO_MAP = {
    'Urna': 'urna',
    'Acessórios': 'acessorio',
    'Acessorios': 'acessorio',
    'Inclusos': 'incluso',
}

# =============================================================================
# CATEGORIZAÇÃO DE PRODUTOS (por Estilo/Formato)
# =============================================================================

def categorizar_produto(nome: str, tipo: str) -> str:
    """Categoriza produto baseado no nome e tipo

    Categorias de URNAS:
    - Sleeping: Pet Sleeping + Cestinha + Dog Heart Plano + Cat Heart Plano
    - Avulsos Legado RIP: Tudo com "Avulso" no nome
    - High Prices: Porta Objetos, Com Foto, Bau, Arca, Amigos de Coração, Imperial,
                   Pote Ceramica, Inox, Marmore, Petbox, Pietra, Pine, Tower
    - Low Prices: Todo o resto (Plano, MDF, Figurativo, etc.)
    """
    if not nome:
        return None

    nome_upper = nome.upper()

    # URNAS
    if tipo == 'urna':
        # 1. AVULSOS LEGADO RIP - Verificar primeiro (prioridade)
        if 'AVULSO' in nome_upper:
            return 'Avulsos Legado RIP'

        # 2. ARCA/SLEEPING - Arca + Sleeping + Cestinha + Heart Plano
        if 'ARCA' in nome_upper:
            return 'Arca/Sleeping'
        if 'SLEEPING' in nome_upper:
            return 'Arca/Sleeping'
        if 'CESTINHA' in nome_upper:
            return 'Arca/Sleeping'
        if ('DOG HEART' in nome_upper or 'CAT HEART' in nome_upper) and 'PLANO' in nome_upper:
            return 'Arca/Sleeping'

        # 4. PORTA/BOX - Petbox + Porta Objetos + Baú + Urna Porta-Retrato + Com Foto
        if 'PETBOX' in nome_upper:
            return 'Porta/Box'
        if 'PORTA OBJETOS' in nome_upper or 'PORTA-OBJETOS' in nome_upper:
            return 'Porta/Box'
        if 'BAÚ' in nome_upper or 'BAU' in nome_upper:
            return 'Porta/Box'
        if 'PORTA-RETRATO' in nome_upper:
            return 'Porta/Box'

        # 5. PEDRAS - Mármore, Granito, Carrara, Travertino, Tower, Amigos de Coração, Pine, Pietra, Biossolúvel
        if 'NA AREIA' in nome_upper:
            return 'Pedras'
        if 'MÁRMORE' in nome_upper or 'MARMORE' in nome_upper or 'CARRARA' in nome_upper or 'TRAVERTINO' in nome_upper or 'GRANITO' in nome_upper:
            return 'Pedras'
        if 'TOWER' in nome_upper:
            return 'Pedras'
        if 'AMIGOS DE CORAÇÃO' in nome_upper:
            return 'Pedras'
        if 'PINE' in nome_upper:
            return 'Pedras'
        if 'PIETRA' in nome_upper:
            return 'Pedras'

        # 6. HIGH PRICES - Restante dos premium
        # Imperial
        if 'IMPERIAL' in nome_upper:
            return 'High Prices'
        # Pote Ceramica
        if 'CERÂMICA' in nome_upper or 'CERAMICA' in nome_upper or 'POTE' in nome_upper:
            return 'High Prices'
        # Inox
        if 'INOX' in nome_upper:
            return 'High Prices'
        # Niquelada
        if 'NIQUELADA' in nome_upper:
            return 'High Prices'
        # PetMemory
        if 'PETMEMORY' in nome_upper:
            return 'High Prices'

        # 4. LOW PRICES - Todo o resto
        return 'Low Prices'

    # ACESSORIOS
    # Categorias: Chaveiros Cinzas, Porta-Pelos, Porta-Cinzas, Porta-Retratos, Miniaturas, Outros
    if tipo == 'acessorio':
        # 1. CHAVEIROS CINZAS - Chaveiros e cápsulas para cinzas
        if 'CHAVEIRO' in nome_upper and ('CINZAS' in nome_upper or 'PORTA-CINZAS' in nome_upper):
            return 'Chaveiros Cinzas'
        if 'CÁPSULA' in nome_upper and 'CINZAS' in nome_upper:
            return 'Chaveiros Cinzas'

        # 2. PORTA-PELOS - Pingentes com visor para pelo + Foto Dentro do Pingente
        if 'PORTA PELO' in nome_upper or 'PORTA-PELO' in nome_upper:
            return 'Porta-Pelos'
        if 'FOTO DENTRO DO PINGENTE' in nome_upper:
            return 'Porta-Pelos'

        # 3. PORTA-CINZAS - Pingentes porta cinzas (exceto chaveiros)
        if 'PORTA CINZAS' in nome_upper or 'PORTA-CINZAS' in nome_upper:
            return 'Porta-Cinzas'
        if 'CORAÇÃO COM PEGADAS' in nome_upper:
            return 'Porta-Cinzas'

        # 4. PORTA-RETRATOS
        if 'PORTA-RETRATO' in nome_upper:
            return 'Porta-Retratos'

        # 5. MINIATURAS
        if 'MINIATURA' in nome_upper:
            return 'Miniaturas'

        # 6. OUTROS - Todo o resto
        return 'Outros'

    # INCLUSOS
    if tipo == 'incluso':
        return 'Incluso'

    return None

# Fontes de conhecimento (serão criadas automaticamente)
FONTES_CONHECIMENTO = [
    'Google',
    'Instagram/Facebook',
    'Parente/Amigo',
    'Indicação em Clínica',
    'Ponto',
    'Cliente',
    'Seguradora',
]

# Contas bancárias (IDs fixos para manter consistência entre migrações)
CONTAS = {
    'BB': 'c4789ba9-59b6-4c34-8dc6-54655b39249a',
    'Inter': '1124d3d0-f525-450c-92d7-739e70a42cb0',
    'Granito': 'c102eed4-5318-492a-a6c5-f794483f9639',
    'Dinheiro': 'e4b0636c-2241-4911-b444-359e83e39674',
}

# =============================================================================
# FUNÇÕES AUXILIARES
# =============================================================================

def gerar_uuid():
    """Gera um UUID v4"""
    return str(uuid.uuid4())

def converter_caminho_imagem(caminho):
    """Converte caminho legado 'Estoque_Images//file.png' para '/estoque/file.png'"""
    if not caminho:
        return None
    # Remove prefixo legado (com // ou /)
    caminho = caminho.replace('Estoque_Images//', '/estoque/')
    caminho = caminho.replace('Estoque_Images/', '/estoque/')
    return caminho

def limpar_valor(valor):
    """Converte 'R$ 1.234,56' para 1234.56"""
    if pd.isna(valor) or valor == '' or valor == 'N/I':
        return None
    if isinstance(valor, (int, float)):
        return float(valor)
    # Remove R$, espaços, pontos de milhar e troca vírgula por ponto
    valor = str(valor).replace('R$', '').replace(' ', '').replace('.', '').replace(',', '.')
    try:
        return float(valor)
    except:
        return None

def limpar_peso(valor):
    """Converte peso em kg (ex: '35.8' ou '35,8') para float.
    Diferente de limpar_valor, preserva o ponto como decimal."""
    if pd.isna(valor) or valor == '' or valor == 'N/I':
        return None
    if isinstance(valor, (int, float)):
        return float(valor)
    valor = str(valor).replace(' ', '').replace(',', '.')
    try:
        return float(valor)
    except:
        return None

def limpar_data(data):
    """Converte data brasileira para ISO"""
    if pd.isna(data) or data == '' or data == 'N/I':
        return None
    try:
        data_str = str(data).strip()
        # Tenta DD/MM/YYYY HH:MM:SS (com segundos)
        if ' ' in data_str:
            # Tenta com segundos primeiro
            try:
                dt = datetime.strptime(data_str, '%d/%m/%Y %H:%M:%S')
                return dt.isoformat()
            except:
                # Tenta sem segundos
                dt = datetime.strptime(data_str, '%d/%m/%Y %H:%M')
                return dt.isoformat()
        # Tenta DD/MM/YYYY
        dt = datetime.strptime(data_str, '%d/%m/%Y')
        return dt.date().isoformat()
    except:
        return None

def limpar_data_simples(data):
    """Converte data brasileira para YYYY-MM-DD"""
    if pd.isna(data) or data == '' or data == 'N/I':
        return None
    try:
        dt = datetime.strptime(str(data).split(' ')[0], '%d/%m/%Y')
        return dt.date().isoformat()
    except:
        return None

def limpar_texto(texto):
    """Limpa texto, retorna None se vazio"""
    if pd.isna(texto) or texto == '' or texto == 'N/I':
        return None
    resultado = str(texto).strip()
    # Remove .0 de números que vieram como float (ex: 1542418102.0 -> 1542418102)
    if resultado.endswith('.0') and resultado[:-2].isdigit():
        resultado = resultado[:-2]
    return resultado

def limpar_telefone(tel):
    """Limpa telefone"""
    if pd.isna(tel) or tel == '' or tel == 'N/I':
        return None
    # Remove caracteres não numéricos exceto +
    return re.sub(r'[^\d+]', '', str(tel))

def extrair_numero_supinda(leva_pinda):
    """Extrai número da supinda (ignora lotes virtuais p1, p2...)"""
    if pd.isna(leva_pinda) or leva_pinda == '':
        return None
    leva = str(leva_pinda).strip().lower()
    if leva.startswith('p'):
        return None  # Lote virtual, ignorar
    try:
        return int(leva)
    except:
        return None

def extrair_seguradora(nome_whatsapp):
    """Extrai nome da seguradora do campo nome_whatsapp.

    Padrão: "25Jan13 Mauro EM Pretinha (Oi Pet) COL"
    A seguradora fica entre parênteses antes do sufixo IND/COL.

    Exemplos:
    - "25Jan13 Mauro EM Pretinha (Oi Pet) COL" → "Oi Pet"
    - "25Jul02 Luiz Carlos EM Puppy (Ossel) COL" → "Ossel"
    - "26Jan13 Vandressa EM Pitthy (Incluir) IND" → "Incluir"
    """
    if pd.isna(nome_whatsapp) or nome_whatsapp == '':
        return None

    # Regex: captura texto entre parênteses seguido de espaço e IND ou COL no final
    match = re.search(r'\(([^)]+)\)\s*(IND|COL)\s*$', str(nome_whatsapp), re.IGNORECASE)
    if match:
        return match.group(1).strip()
    return None

def processar_local_coleta(local):
    """Processa local de coleta.

    - Residência ou Unidade: mantém como está
    - Qualquer outro valor (nome de clínica): local_coleta = 'Clínica', clinica_coleta = valor original
    """
    local_limpo = limpar_texto(local)

    if local_limpo is None:
        return {'local_coleta': None, 'clinica_coleta': None}

    # Normaliza para comparação
    local_upper = local_limpo.upper().strip()

    if local_upper in ['RESIDÊNCIA', 'RESIDENCIA', 'RES', 'CASA']:
        return {'local_coleta': 'Residência', 'clinica_coleta': None}
    elif local_upper in ['UNIDADE', 'UNI', 'CANAL 6', 'CANAL6']:
        return {'local_coleta': 'Unidade', 'clinica_coleta': None}
    else:
        # É uma clínica - nome vai para clinica_coleta (normalizado)
        return {'local_coleta': 'Clínica', 'clinica_coleta': normalizar_clinica(local_limpo)}

def buscar_tutor_id(row):
    """Busca o ID do tutor no mapa de tutores

    Usa a mesma lógica de chave que processar_tutores():
    1. CPF (preferencial)
    2. Telefone (fallback)
    3. Nome+cidade (último recurso)
    """
    cpf = limpar_texto(row['CPF'])
    telefone = limpar_telefone(row['Telefone Contrato'])
    nome = limpar_texto(row['Tutor'])

    if not nome:
        return None

    # Tentar buscar por CPF primeiro
    if cpf:
        chave = f"cpf:{cpf}"
        if chave in tutores_map:
            return tutores_map[chave]

    # Senão, tentar por telefone
    if telefone:
        chave = f"tel:{telefone}"
        if chave in tutores_map:
            return tutores_map[chave]

    # Último recurso: nome+cidade
    cidade = limpar_texto(row['Cidade']) or ''
    chave = f"nome:{nome}|{cidade}"
    return tutores_map.get(chave)

# =============================================================================
# DICIONÁRIOS DE LOOKUP (preenchidos durante processamento)
# =============================================================================

# Mapeamento de IDs legados para UUIDs novos
indicadores_map = {}  # nome -> uuid
funcionarios_map = {}  # nome -> uuid
fontes_map = {}  # nome -> uuid
supindas_map = {}  # numero -> uuid
produtos_map = {}  # cod_prod -> uuid
contas_map = {}  # nome -> uuid
contratos_map = {}  # id_contrato_legado -> uuid
contratos_data_map = {}  # id_contrato_legado -> data_acolhimento (para preencher created_at em contrato_produtos)
contratos_status_map = {}  # id_contrato_legado -> status (para rescaldo_feito em contrato_produtos)
tutores_map = {}  # cpf:XXX ou tel:XXX ou nome:XXX|cidade -> uuid (CPF é chave principal)
pelinhos_map = {}  # id_contrato_legado -> quantidade de pelinhos
descontos_pagamentos_map = {}  # id_contrato_legado -> { 'plano': valor, 'acessorios': valor }

# =============================================================================
# PROCESSAMENTO DAS TABELAS
# =============================================================================

def pre_processar_descontos_pagamentos():
    """Pré-processa descontos dos pagamentos para somar por contrato e tipo"""
    print("📋 Pré-processando descontos dos pagamentos...")

    arquivo = os.path.join(LEGADO_DIR, 'Planilha Gerencial R.I.P. Pet Santos - Entradas_FIN.csv')
    df = pd.read_csv(arquivo, encoding='utf-8')

    for _, row in df.iterrows():
        id_contrato = limpar_texto(row['IDContrato'])
        if not id_contrato:
            continue

        # Tipo: Planos ou Catálogo
        tipo = row['TIpo']  # Planos ou Catálogo
        desconto = limpar_valor(row['DescontoReal']) or 0

        if desconto <= 0:
            continue

        # Inicializar se não existe
        if id_contrato not in descontos_pagamentos_map:
            descontos_pagamentos_map[id_contrato] = {'plano': 0, 'acessorios': 0}

        # Somar ao tipo correto
        if tipo == 'Planos':
            descontos_pagamentos_map[id_contrato]['plano'] += desconto
        else:  # Catálogo
            descontos_pagamentos_map[id_contrato]['acessorios'] += desconto

    # Contar contratos com desconto
    contratos_com_desconto = len(descontos_pagamentos_map)
    total_desconto_plano = sum(d['plano'] for d in descontos_pagamentos_map.values())
    total_desconto_acessorios = sum(d['acessorios'] for d in descontos_pagamentos_map.values())

    print(f"   ✅ {contratos_com_desconto} contratos com desconto identificados")
    print(f"      Desconto plano: R$ {total_desconto_plano:,.2f}")
    print(f"      Desconto acessórios: R$ {total_desconto_acessorios:,.2f}")

def pre_processar_pelinhos():
    """Pré-processa pelinhos para identificar quais contratos têm pelinho"""
    print("📋 Pré-processando pelinhos...")

    arquivo = os.path.join(LEGADO_DIR, 'Planilha Gerencial R.I.P. Pet Santos - Saídas_PROD.csv')
    df = pd.read_csv(arquivo, encoding='utf-8')

    # Pelinho é o produto com código '0004'
    # Cada linha no CSV = 1 unidade (conceito: 1 linha = 1 produto físico)
    for _, row in df.iterrows():
        cod_prod = limpar_texto(row['Cod_Prod'])
        if cod_prod == '0004':  # Código do pelinho
            id_contrato = limpar_texto(row['IDContrato'])
            if id_contrato:
                # Conta linhas (cada linha = 1 garrafinha)
                pelinhos_map[id_contrato] = pelinhos_map.get(id_contrato, 0) + 1

    print(f"   ✅ {len(pelinhos_map)} contratos com pelinho identificados")

def processar_indicadores():
    """Processa a tabela de clínicas/indicadores"""
    print("📋 Processando indicadores...")

    arquivo = os.path.join(LEGADO_DIR, 'Planilha Gerencial R.I.P. Pet Santos - Indicadores.csv')
    df = pd.read_csv(arquivo, encoding='utf-8')

    registros = []
    for _, row in df.iterrows():
        nome = limpar_texto(row['Colab Indic.'])
        if nome and nome not in indicadores_map:
            id_uuid = gerar_uuid()
            indicadores_map[nome] = id_uuid
            registros.append({
                'id': id_uuid,
                'unidade_id': UNIDADE_SANTOS_ID,
                'nome': nome,
                'ativo': True,
            })

    df_out = pd.DataFrame(registros)
    df_out.to_csv(os.path.join(OUTPUT_DIR, 'indicadores.csv'), index=False)
    print(f"   ✅ {len(registros)} indicadores exportados")
    return df_out

def processar_funcionarios():
    """Extrai funcionários únicos da tabela de cremações"""
    print("📋 Processando funcionários...")

    arquivo = os.path.join(LEGADO_DIR, 'Planilha Gerencial R.I.P. Pet Santos - Cremações.csv')
    df = pd.read_csv(arquivo, encoding='utf-8')

    funcionarios_unicos = df['Responsável pelo Acolhimento'].dropna().unique()

    registros = []
    for nome in funcionarios_unicos:
        nome = limpar_texto(nome)
        if nome and nome not in funcionarios_map:
            id_uuid = gerar_uuid()
            funcionarios_map[nome] = id_uuid
            registros.append({
                'id': id_uuid,
                'unidade_id': UNIDADE_SANTOS_ID,
                'nome': nome,
                'ativo': True,
            })

    df_out = pd.DataFrame(registros)
    df_out.to_csv(os.path.join(OUTPUT_DIR, 'funcionarios.csv'), index=False)
    print(f"   ✅ {len(registros)} funcionários exportados")
    return df_out

def processar_fontes_conhecimento():
    """Cria tabela de fontes de conhecimento"""
    print("📋 Processando fontes de conhecimento...")

    # Ler valores únicos do legado
    arquivo = os.path.join(LEGADO_DIR, 'Planilha Gerencial R.I.P. Pet Santos - Cremações.csv')
    df = pd.read_csv(arquivo, encoding='utf-8')

    fontes_legado = df['Conhecimento'].dropna().unique()

    registros = []
    for fonte in fontes_legado:
        fonte = limpar_texto(fonte)
        if fonte and fonte not in fontes_map:
            id_uuid = gerar_uuid()
            fontes_map[fonte] = id_uuid
            registros.append({
                'id': id_uuid,
                'nome': fonte,
            })

    df_out = pd.DataFrame(registros)
    df_out.to_csv(os.path.join(OUTPUT_DIR, 'fontes_conhecimento.csv'), index=False)
    print(f"   ✅ {len(registros)} fontes exportadas")
    return df_out

def processar_supindas():
    """Processa tabela de supindas (viagens)"""
    print("📋 Processando supindas...")

    arquivo = os.path.join(LEGADO_DIR, 'Planilha Gerencial R.I.P. Pet Santos - Supindas.csv')
    df = pd.read_csv(arquivo, encoding='utf-8')

    registros = []
    for _, row in df.iterrows():
        leva = str(row['Nº Leva']).strip()

        # Ignorar lotes virtuais (p1, p2, p3...)
        if leva.lower().startswith('p'):
            continue

        try:
            numero = int(leva)
        except:
            continue

        id_uuid = gerar_uuid()
        supindas_map[numero] = id_uuid

        # Último número = planejada, penúltimo = em_andamento, restante = retornada
        # (será ajustado no final com base no max)
        registros.append({
            'id': id_uuid,
            'unidade_id': UNIDADE_SANTOS_ID,
            'numero': numero,
            'data': limpar_data_simples(row['Data']),
            'responsavel': limpar_texto(row['Responsável']),
            'peso_total': limpar_peso(row['Peso']),
            'quantidade_pets': int(row['Nº Pets']) if pd.notna(row['Nº Pets']) else None,
            'observacoes': None,  # Coluna não existe no legado
        })

    # Definir status: última = planejada, penúltima = em_andamento, resto = retornada
    if registros:
        max_num = max(r['numero'] for r in registros)
        for r in registros:
            if r['numero'] == max_num:
                r['status'] = 'planejada'
            elif r['numero'] == max_num - 1:
                r['status'] = 'em_andamento'
            else:
                r['status'] = 'retornada'

    df_out = pd.DataFrame(registros)
    df_out.to_csv(os.path.join(OUTPUT_DIR, 'supindas.csv'), index=False)
    print(f"   ✅ {len(registros)} supindas exportadas")
    return df_out

def processar_produtos():
    """Processa catálogo de produtos"""
    print("📋 Processando produtos...")

    arquivo = os.path.join(LEGADO_DIR, 'Planilha Gerencial R.I.P. Pet Santos - Estoque.csv')
    df = pd.read_csv(arquivo, encoding='utf-8')

    # Produtos ignorados na importação (tratados fora do estoque)
    PRODUTOS_IGNORAR = ['0006']  # Protocolo de Retorno → tratado no processamento de fichas

    # Produtos com estoque infinito (serviços/lembretes, não precisam controle de estoque)
    ESTOQUE_INFINITO_KEYWORDS = [
        'nenhuma urna',
        'nenhum rescaldo',
        'molde de patinha',
        'pelo extra',
        'retorno de itens pessoais',
        'foto dentro do pingente',
    ]

    registros = []
    for _, row in df.iterrows():
        cod = limpar_texto(row['Cod_Prod'])
        if not cod:
            continue

        # Pular produtos que não fazem mais parte do estoque
        if cod in PRODUTOS_IGNORAR:
            continue

        id_uuid = gerar_uuid()
        produtos_map[cod] = id_uuid

        tipo = TIPO_PRODUTO_MAP.get(limpar_texto(row['Tipo']), 'acessorio')
        nome = limpar_texto(row['Nome Comercial'])
        categoria = categorizar_produto(nome, tipo)

        # Catálogo = "n" → ativo = false, vazio → ativo = true
        catalogo = limpar_texto(row['Catálogo'])
        ativo = 'false' if catalogo and catalogo.lower() == 'n' else 'true'

        # FOTO = "TRUE" → precisa_foto = true, vazio → precisa_foto = false
        foto = limpar_texto(row['FOTO'])
        precisa_foto = 'true' if foto and foto.upper() == 'TRUE' else 'false'

        # Verificar se é produto com estoque infinito
        nome_lower = nome.lower() if nome else ''
        estoque_infinito = any(kw in nome_lower for kw in ESTOQUE_INFINITO_KEYWORDS)

        registros.append({
            'id': id_uuid,
            'codigo': cod,
            'nome': nome,
            'tipo': tipo,
            'categoria': categoria,
            'custo': limpar_valor(row['Ref. Custo']),
            'preco': limpar_valor(row['Valor']),
            'estoque_atual': int(row['Estoque']) if pd.notna(row['Estoque']) else 0,
            'estoque_minimo': int(row['Ideal']) if pd.notna(row['Ideal']) else 0,
            'qtde_vendida': int(row['Consumido']) if pd.notna(row['Consumido']) else 0,
            'imagem_url': converter_caminho_imagem(limpar_texto(row['Imagem'])),
            'precisa_foto': precisa_foto,
            'ativo': ativo,
            'estoque_infinito': estoque_infinito,
            'rescaldo_tipo': RESCALDO_TIPO_MAP.get(cod, ''),
        })

    df_out = pd.DataFrame(registros)
    df_out.to_csv(os.path.join(OUTPUT_DIR, 'produtos.csv'), index=False)
    print(f"   ✅ {len(registros)} produtos exportados")
    return df_out

def processar_contas():
    """Cria tabela de contas bancárias (com IDs fixos)"""
    print("📋 Processando contas...")

    registros = []
    for nome, id_fixo in CONTAS.items():
        contas_map[nome] = id_fixo
        registros.append({
            'id': id_fixo,
            'nome': nome,
            'ativo': True,
        })

    df_out = pd.DataFrame(registros)
    df_out.to_csv(os.path.join(OUTPUT_DIR, 'contas.csv'), index=False)
    print(f"   ✅ {len(registros)} contas exportadas")
    return df_out

def processar_tutores():
    """Processa e extrai tutores únicos dos contratos

    Lógica de deduplicação:
    1. CPF é a chave principal (nunca muda)
    2. Se não tem CPF, usa telefone como fallback
    3. Se não tem telefone, usa nome+cidade

    Para dados do tutor: usa o contrato MAIS RECENTE (dados mais atualizados)
    """
    print("📋 Processando tutores...")

    arquivo = os.path.join(LEGADO_DIR, 'Planilha Gerencial R.I.P. Pet Santos - Cremações.csv')
    df = pd.read_csv(arquivo, encoding='utf-8')

    # Ordenar por data decrescente (mais recente primeiro)
    # Assim, quando encontrar um CPF pela primeira vez, será o contrato mais novo
    df['_data_sort'] = pd.to_datetime(df['Data e Hora'], format='%d/%m/%Y %H:%M', errors='coerce')
    df = df.sort_values('_data_sort', ascending=False)

    registros = []
    tutores_vistos = {}  # chave -> dados do tutor (guarda o primeiro = mais recente)

    for _, row in df.iterrows():
        cpf = limpar_texto(row['CPF'])
        telefone = limpar_telefone(row['Telefone Contrato'])
        nome = limpar_texto(row['Tutor'])

        if not nome:
            continue

        # Chave de deduplicação: CPF (preferencial), depois telefone, depois nome+cidade
        if cpf:
            chave = f"cpf:{cpf}"
        elif telefone:
            chave = f"tel:{telefone}"
        else:
            cidade = limpar_texto(row['Cidade']) or ''
            chave = f"nome:{nome}|{cidade}"

        # Se já vimos este tutor, pular (já temos os dados mais recentes)
        if chave in tutores_vistos:
            continue

        id_uuid = gerar_uuid()
        tutores_vistos[chave] = id_uuid
        tutores_map[chave] = id_uuid

        registros.append({
            'id': id_uuid,
            'nome': nome,
            'cpf': cpf,
            'telefone': telefone,
            'telefone2': limpar_telefone(row['Telefone 2']),
            'email': limpar_texto(row['e-mail']),
            'cep': limpar_texto(row['CEP']),
            'endereco': limpar_texto(row['Endereço']),
            'numero': None,  # Não existe separado no legado
            'complemento': None,  # Não existe separado no legado
            'bairro': limpar_texto(row['Bairro']),
            'cidade': limpar_texto(row['Cidade']),
            'estado': None,  # Não existe no legado
            'observacoes': None,
            'ativo': True,
        })

    df_out = pd.DataFrame(registros)
    df_out.to_csv(os.path.join(OUTPUT_DIR, 'tutores.csv'), index=False)
    print(f"   ✅ {len(registros)} tutores exportados (de {len(df)} contratos)")
    return df_out

def processar_contratos():
    """Processa tabela principal de contratos (cremações)"""
    print("📋 Processando contratos...")

    arquivo = os.path.join(LEGADO_DIR, 'Planilha Gerencial R.I.P. Pet Santos - Cremações.csv')
    df = pd.read_csv(arquivo, encoding='utf-8')

    registros = []
    for _, row in df.iterrows():
        id_legado = limpar_texto(row['IDContrato'])
        if not id_legado:
            continue

        id_uuid = gerar_uuid()
        contratos_map[id_legado] = id_uuid

        # Guardar data de acolhimento para usar em contrato_produtos
        data_acolhimento = limpar_data(row['Data e Hora'])
        contratos_data_map[id_legado] = data_acolhimento

        # Mapear status
        status_legado = limpar_texto(row['Status'])
        status = STATUS_MAP.get(status_legado, 'ativo')
        contratos_status_map[id_legado] = status

        # Mapear tipo cremação
        tipo_crem = limpar_texto(row['Tipo'])
        tipo_cremacao = TIPO_CREMACAO_MAP.get(tipo_crem, 'individual')

        # Mapear tipo plano
        plano = limpar_texto(row['Plano'])
        tipo_plano = TIPO_PLANO_MAP.get(plano, 'emergencial')

        # Mapear espécie
        especie = limpar_texto(row['Espécie'])
        pet_especie = ESPECIE_MAP.get(especie, 'canina')

        # Mapear gênero
        genero = limpar_texto(row['Gênero'])
        pet_genero = GENERO_MAP.get(genero) if genero else None

        # Buscar IDs relacionados
        indicador_nome = limpar_texto(row['Colab Indic.'])
        indicador_id = indicadores_map.get(indicador_nome) if indicador_nome else None

        funcionario_nome = limpar_texto(row['Responsável pelo Acolhimento'])
        funcionario_id = funcionarios_map.get(funcionario_nome) if funcionario_nome else None

        fonte_nome = limpar_texto(row['Conhecimento'])
        fonte_id = fontes_map.get(fonte_nome) if fonte_nome else None

        # Buscar supinda
        leva_pinda = extrair_numero_supinda(row['Leva Pinda'])
        supinda_id = supindas_map.get(leva_pinda) if leva_pinda else None

        # Calcular custo de cremação (padrão)
        custo_cremacao = 500 if tipo_cremacao == 'individual' else 300

        # Pelinho: verificar se tem no mapa de pelinhos
        pelinho_qtd = pelinhos_map.get(id_legado, 0)
        if pelinho_qtd > 0:
            # Tem pelinho registrado = quis e já foi feito
            pelinho_quer = True
            pelinho_feito = True
            pelinho_quantidade = pelinho_qtd
        elif status in ['retorno', 'pendente', 'finalizado']:
            # Não tem pelinho e já passou da etapa = não quis
            pelinho_quer = False
            pelinho_feito = False
            pelinho_quantidade = 1
        else:
            # Não definido ainda (preventivo, ativo, pinda)
            pelinho_quer = None
            pelinho_feito = False
            pelinho_quantidade = 1

        registros.append({
            'id': id_uuid,
            'unidade_id': UNIDADE_SANTOS_ID,
            'codigo': id_legado,
            'status': status,
            'tipo_cremacao': tipo_cremacao,
            'tipo_plano': tipo_plano,

            # Pet
            'pet_nome': limpar_texto(row['Pet']),
            'pet_especie': pet_especie,
            'pet_raca': limpar_texto(row['Raça']),
            'pet_genero': pet_genero,
            'pet_peso': limpar_peso(row['Peso (kg)']),
            'pet_idade_anos': int(float(str(row['Anos Completos']).replace(',', '.'))) if pd.notna(row['Anos Completos']) and str(row['Anos Completos']).strip() != '' else None,
            'pet_cor': limpar_texto(row['Cor']),

            # Tutor - buscar ID na tabela de tutores
            'tutor_id': buscar_tutor_id(row),
            # Campos legados mantidos para compatibilidade (serão removidos futuramente)
            'tutor_nome': limpar_texto(row['Tutor']),
            'tutor_cpf': limpar_texto(row['CPF']),
            'tutor_email': limpar_texto(row['e-mail']),
            'tutor_telefone': limpar_telefone(row['Telefone Contrato']),
            'tutor_telefone2': limpar_telefone(row['Telefone 2']),
            'tutor_cidade': limpar_texto(row['Cidade']),
            'tutor_bairro': limpar_texto(row['Bairro']),
            'tutor_endereco': limpar_texto(row['Endereço']),
            'tutor_cep': limpar_texto(row['CEP']),

            # Endereço de remoção (onde o pet foi coletado) - para estatísticas
            # Na migração, copia do cadastral. No TO-BE será preenchido separadamente
            'remocao_cidade': limpar_texto(row['Cidade']),
            'remocao_bairro': limpar_texto(row['Bairro']),
            'remocao_endereco': limpar_texto(row['Endereço']),
            'remocao_cep': limpar_texto(row['CEP']),

            # Relacionamentos
            # Local de coleta: se não for Residência/Unidade, é Clínica
            **processar_local_coleta(row['Local']),
            'indicador_id': indicador_id,
            'fonte_conhecimento_id': fonte_id,
            'funcionario_id': funcionario_id,
            'supinda_id': supinda_id,

            # Datas
            'data_contrato': limpar_data_simples(row['Data Contrato PV']) or limpar_data_simples(row['Data e Hora']),
            'data_acolhimento': limpar_data(row['Data e Hora']),
            'data_leva_pinda': limpar_data_simples(row['Data Leva']),
            'data_cremacao': limpar_data_simples(row['Data Cremação']),
            'data_retorno': limpar_data_simples(row['Data Retorno']),
            'data_entrega': None,  # Não existe no legado

            # Valores
            # Descontos PRÉ-VENDA: zerados na migração (só existirão com o novo fluxo de cadastro)
            # Os descontos do legado são PÓS-VENDA (ficam na tabela pagamentos.desconto)
            'valor_plano': limpar_valor(row['Valor Plano']),
            'desconto_plano': 0,
            'valor_acessorios': limpar_valor(row['Valor Acessórios']) or 0,
            'desconto_acessorios': 0,
            'custo_cremacao': custo_cremacao,

            # Outros
            'numero_lacre': str(int(float(row['Lacre']))) if pd.notna(row['Lacre']) and str(row['Lacre']).strip() != '' else None,
            'velorio_deseja': None,
            'velorio_agendado_para': None,
            'velorio_realizado': False,
            'acompanhamento_online': False,
            'acompanhamento_presencial': False,
            'tutor_vet_segmento': False,
            'observacoes': limpar_texto(row['Observaões']),
            'latitude': None,
            'longitude': None,

            # Pelinho (rescaldo padrão)
            'pelinho_quer': pelinho_quer,
            'pelinho_feito': pelinho_feito,
            'pelinho_quantidade': pelinho_quantidade,

            # Seguradora (extraída do nome_whatsapp quando conhecimento = Seguradora)
            'seguradora': extrair_seguradora(row['Nome Whatsapp']),
        })

    df_out = pd.DataFrame(registros)
    df_out.to_csv(os.path.join(OUTPUT_DIR, 'contratos.csv'), index=False)
    print(f"   ✅ {len(registros)} contratos exportados")
    return df_out

def processar_pagamentos():
    """Processa pagamentos (Entradas_FIN)"""
    print("📋 Processando pagamentos...")

    arquivo = os.path.join(LEGADO_DIR, 'Planilha Gerencial R.I.P. Pet Santos - Entradas_FIN.csv')
    # Forçar IDTransação como string para evitar conversão para float
    df = pd.read_csv(arquivo, encoding='utf-8', dtype={'IDTransação': str})

    registros = []
    for _, row in df.iterrows():
        id_contrato_legado = limpar_texto(row['IDContrato'])
        contrato_id = contratos_map.get(id_contrato_legado)

        if not contrato_id:
            continue  # Contrato não encontrado

        # Tipo: Planos ou Catálogo
        tipo = 'plano' if row['TIpo'] == 'Planos' else 'catalogo'

        # Método de pagamento
        metodo_legado = limpar_texto(row['Método'])
        metodo = METODO_PAGAMENTO_MAP.get(metodo_legado, 'pix')

        # Conta
        cc_legado = limpar_texto(row['CC'])
        conta_id = contas_map.get(cc_legado)

        # Mês competência: "08/2023" -> "2023/08"
        mes_comp = limpar_texto(row['Mês Competência'])
        if mes_comp and '/' in mes_comp:
            partes = mes_comp.split('/')
            if len(partes) == 2:
                mes_comp = f"{partes[1]}/{partes[0]}"

        valor = limpar_valor(row['Valor']) or 0
        desconto = limpar_valor(row['DescontoReal']) or 0
        taxa = limpar_valor(row['TaxaReal']) or 0
        valor_liquido_sem_taxa = valor - desconto  # O que o cliente pagou
        valor_liquido = valor - desconto - taxa    # O que entrou na conta

        # ID da transação (número da maquininha)
        id_transacao = None
        if 'IDTransação' in row and pd.notna(row['IDTransação']) and str(row['IDTransação']).strip():
            id_transacao = str(row['IDTransação']).strip()

        # Inferir bandeira do cartão pela taxa (só se tiver id_transacao e taxa > 0)
        bandeira = None
        if id_transacao and taxa > 0 and valor_liquido_sem_taxa > 0:
            taxa_percentual = (taxa / valor_liquido_sem_taxa) * 100
            bandeira = inferir_bandeira(taxa_percentual)

        registros.append({
            'id': gerar_uuid(),
            'contrato_id': contrato_id,
            'tipo': tipo,
            'metodo': metodo,
            'conta_id': conta_id,
            'valor': valor,
            'desconto': desconto,
            'taxa': taxa,
            'valor_liquido_sem_taxa': valor_liquido_sem_taxa,
            'valor_liquido': valor_liquido,
            'parcelas': int(row['Parcelamento']) if pd.notna(row['Parcelamento']) and str(row['Parcelamento']).isdigit() else 1,
            'id_transacao': id_transacao,
            'bandeira': bandeira,
            'is_seguradora': False,  # Não existe no legado
            'data_pagamento': limpar_data_simples(row['Data e Hora']),
            'mes_competencia': mes_comp,
        })

    df_out = pd.DataFrame(registros)

    # Formatar valores numéricos: inteiros ficam sem decimal, decimais com 2 casas
    def formatar_numero(x):
        if pd.isna(x):
            return ''
        if float(x) == int(float(x)):
            return str(int(float(x)))
        return f"{float(x):.2f}"

    colunas_decimais = ['valor', 'desconto', 'taxa', 'valor_liquido_sem_taxa', 'valor_liquido']
    for col in colunas_decimais:
        df_out[col] = df_out[col].apply(formatar_numero)

    # quoting=1 (QUOTE_ALL) força aspas em tudo, evita Supabase detectar como número
    import csv
    df_out.to_csv(os.path.join(OUTPUT_DIR, 'pagamentos.csv'), index=False, quoting=csv.QUOTE_NONNUMERIC)

    # Estatísticas de bandeira
    com_bandeira = sum(1 for r in registros if r['bandeira'])
    bandeiras = {}
    for r in registros:
        if r['bandeira']:
            bandeiras[r['bandeira']] = bandeiras.get(r['bandeira'], 0) + 1

    print(f"   ✅ {len(registros)} pagamentos exportados")
    print(f"   💳 {com_bandeira} com bandeira inferida: {bandeiras}")
    return df_out

def processar_contrato_produtos():
    """Processa produtos dos contratos (Saídas_PROD)

    CONCEITO: 1 linha = 1 produto físico
    - Se cliente quer 2 pelinhos, terá 2 linhas na tabela
    - Campo 'separado' é individual por linha
    - Contagem é feita somando linhas, não campo quantidade
    """
    print("📋 Processando produtos dos contratos...")

    arquivo = os.path.join(LEGADO_DIR, 'Planilha Gerencial R.I.P. Pet Santos - Saídas_PROD.csv')
    df = pd.read_csv(arquivo, encoding='utf-8')

    registros = []
    for _, row in df.iterrows():
        id_contrato_legado = limpar_texto(row['IDContrato'])
        contrato_id = contratos_map.get(id_contrato_legado)

        cod_prod = limpar_texto(row['Cod_Prod'])
        produto_id = produtos_map.get(cod_prod)

        if not contrato_id or not produto_id:
            continue

        separado = limpar_texto(row['Separado']) == '(Ok)'
        foto = limpar_texto(row['FOTO'])

        # Usar data_acolhimento do contrato como created_at (aproximação)
        created_at = contratos_data_map.get(id_contrato_legado)

        # Rescaldo feito: se produto tem rescaldo_tipo E contrato já passou do ativo
        rescaldo_tipo = RESCALDO_TIPO_MAP.get(cod_prod, '')
        status_contrato = contratos_status_map.get(id_contrato_legado, 'ativo')
        rescaldo_feito = bool(rescaldo_tipo and status_contrato in ('pinda', 'retorno', 'pendente', 'finalizado'))

        # 1 linha = 1 produto físico (quantidade sempre 1)
        registros.append({
            'id': gerar_uuid(),
            'contrato_id': contrato_id,
            'produto_id': produto_id,
            'quantidade': 1,  # Sempre 1 (cada linha = 1 unidade)
            'valor': limpar_valor(row['Valor']),
            'desconto': limpar_valor(row['Desconto']) or 0,
            'is_reserva_pv': False,
            'separado': separado,
            'foto_recebida': foto == 'TRUE',
            'foto_url': None,
            'rescaldo_feito': rescaldo_feito,
            'created_at': created_at,  # Data de acolhimento do contrato
        })

    df_out = pd.DataFrame(registros)
    df_out.to_csv(os.path.join(OUTPUT_DIR, 'contrato_produtos.csv'), index=False)
    print(f"   ✅ {len(registros)} produtos de contratos exportados")
    return df_out

def processar_tarefas():
    """Processa observações/tarefas"""
    print("📋 Processando tarefas...")

    arquivo = os.path.join(LEGADO_DIR, 'Planilha Gerencial R.I.P. Pet Santos - Observações.csv')
    df = pd.read_csv(arquivo, encoding='utf-8')

    registros = []
    for _, row in df.iterrows():
        id_contrato_legado = limpar_texto(row['IDContrato'])
        contrato_id = contratos_map.get(id_contrato_legado)

        if not contrato_id:
            continue

        resolvido = limpar_texto(row['Resolvido']) == '(Ok)'
        importancia = limpar_texto(row['Importancia'])
        importante = 'Importante' in str(importancia) if importancia else False

        registros.append({
            'id': gerar_uuid(),
            'unidade_id': UNIDADE_SANTOS_ID,
            'contrato_id': contrato_id,
            'tipo_id': None,  # TODO: criar tipos de tarefa
            'descricao': f"[{limpar_texto(row['Tipo'])}] {limpar_texto(row['Nota'])}",
            'resolvido': resolvido,
            'importante': importante,
        })

    df_out = pd.DataFrame(registros)
    df_out.to_csv(os.path.join(OUTPUT_DIR, 'tarefas.csv'), index=False)
    print(f"   ✅ {len(registros)} tarefas exportadas")
    return df_out

def processar_estoque_entradas():
    """Processa entradas de estoque (Entradas_PROD)"""
    print("📋 Processando entradas de estoque...")

    arquivo = os.path.join(LEGADO_DIR, 'Planilha Gerencial R.I.P. Pet Santos - Entradas_PROD.csv')
    df = pd.read_csv(arquivo, encoding='utf-8')

    registros = []
    for _, row in df.iterrows():
        cod_prod = limpar_texto(row['Cod_Prod'])
        produto_id = produtos_map.get(cod_prod)

        if not produto_id:
            continue  # Produto não encontrado

        quantidade = int(row['Qtde']) if pd.notna(row['Qtde']) else 1
        custo = limpar_valor(row['Custo'])
        data_entrada = limpar_data_simples(row['Data Entrada'])
        remessa = limpar_texto(row['Remessa'])

        registros.append({
            'id': gerar_uuid(),
            'unidade_id': UNIDADE_SANTOS_ID,
            'produto_id': produto_id,
            'quantidade': quantidade,
            'custo_unitario': custo,
            'data_entrada': data_entrada,
            'remessa': remessa,
        })

    df_out = pd.DataFrame(registros)
    df_out.to_csv(os.path.join(OUTPUT_DIR, 'estoque_entradas.csv'), index=False)
    print(f"   ✅ {len(registros)} entradas de estoque exportadas")
    return df_out

# =============================================================================
# EXECUÇÃO PRINCIPAL
# =============================================================================

def main():
    print("""
================================================================================
    R.I.P. PET - MIGRAÇÃO DO LEGADO
================================================================================
    """)

    # Processar na ordem correta (dependências primeiro)
    processar_indicadores()
    processar_funcionarios()
    processar_fontes_conhecimento()
    processar_supindas()
    processar_produtos()
    processar_contas()
    processar_tutores()  # Tutores antes de contratos
    pre_processar_pelinhos()  # Identificar pelinhos antes de contratos
    pre_processar_descontos_pagamentos()  # Identificar descontos dos pagamentos
    processar_contratos()
    processar_pagamentos()
    processar_contrato_produtos()
    processar_tarefas()
    processar_estoque_entradas()

    print(f"""
================================================================================
    MIGRAÇÃO CONCLUÍDA!
================================================================================

📁 Arquivos gerados em: {OUTPUT_DIR}

📋 ORDEM DE IMPORTAÇÃO NO SUPABASE:
   1. indicadores.csv
   2. funcionarios.csv
   3. fontes_conhecimento.csv
   4. supindas.csv
   5. produtos.csv
   6. contas.csv
   7. contratos.csv
   8. pagamentos.csv
   9. contrato_produtos.csv
   10. tarefas.csv

⚠️  IMPORTANTE:
   - Importe na ordem acima (dependências primeiro)
   - Use: Supabase Dashboard > Table Editor > Import CSV
   - Marque "First row is header"

================================================================================
    """)

if __name__ == '__main__':
    main()
