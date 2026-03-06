'use client'

import { useEffect, useState } from 'react'
import { Settings, Upload, Check, AlertTriangle, FileText, Eye, EyeOff, Tag, Palette } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import NomeRetorno from '@/components/configuracoes/NomeRetorno'
import ThemeSelector from '@/components/configuracoes/ThemeSelector'

interface ConfigNfse {
  cnpj: string
  inscricaoMunicipal: string
  certificadoBase64: string
  senhaCertificado: string
  proximoRps: number
  ambiente: 'producao' | 'homologacao'
}

type Aba = 'nfse' | 'nome-retorno' | 'tema'

export default function ConfiguracoesPage() {
  const [abaAtiva, setAbaAtiva] = useState<Aba>('nfse')
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [mensagem, setMensagem] = useState<{ tipo: 'sucesso' | 'erro'; texto: string } | null>(null)
  const [mostrarSenha, setMostrarSenha] = useState(false)

  const [config, setConfig] = useState<ConfigNfse>({
    cnpj: '',
    inscricaoMunicipal: '',
    certificadoBase64: '',
    senhaCertificado: '',
    proximoRps: 1,
    ambiente: 'homologacao'
  })

  const [certificadoInfo, setCertificadoInfo] = useState<{
    nome: string
    tamanho: number
    carregado: boolean
  } | null>(null)

  const supabase = createClient()

  useEffect(() => {
    carregarConfiguracoes()
  }, [])

  async function carregarConfiguracoes() {
    setLoading(true)
    const resultado = await supabase
      .from('configuracoes')
      .select('*')
      .eq('chave', 'nfse')
      .single()

    const data = resultado.data as { valor: ConfigNfse } | null
    const error = resultado.error

    if (!error && data?.valor) {
      const valor = data.valor
      setConfig(valor)
      if (valor.certificadoBase64) {
        setCertificadoInfo({
          nome: 'certificado.pfx',
          tamanho: Math.round(valor.certificadoBase64.length * 0.75 / 1024),
          carregado: true
        })
      }
    }
    setLoading(false)
  }

  async function handleCertificadoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.name.endsWith('.pfx') && !file.name.endsWith('.p12')) {
      setMensagem({ tipo: 'erro', texto: 'Selecione um arquivo .pfx ou .p12' })
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1]
      setConfig({ ...config, certificadoBase64: base64 })
      setCertificadoInfo({
        nome: file.name,
        tamanho: Math.round(file.size / 1024),
        carregado: true
      })
      setMensagem({ tipo: 'sucesso', texto: 'Certificado carregado! Não esqueça de salvar.' })
    }
    reader.readAsDataURL(file)
  }

  async function salvarConfiguracoes() {
    setSalvando(true)
    setMensagem(null)

    if (!config.cnpj || config.cnpj.replace(/\D/g, '').length !== 14) {
      setMensagem({ tipo: 'erro', texto: 'CNPJ inválido' })
      setSalvando(false)
      return
    }

    if (!config.inscricaoMunicipal) {
      setMensagem({ tipo: 'erro', texto: 'Inscrição Municipal é obrigatória' })
      setSalvando(false)
      return
    }

    if (!config.certificadoBase64) {
      setMensagem({ tipo: 'erro', texto: 'Faça upload do certificado digital' })
      setSalvando(false)
      return
    }

    if (!config.senhaCertificado) {
      setMensagem({ tipo: 'erro', texto: 'Senha do certificado é obrigatória' })
      setSalvando(false)
      return
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('configuracoes')
      .upsert({
        chave: 'nfse',
        valor: config,
        descricao: 'Configurações para emissão de NFS-e via GISS Online'
      }, {
        onConflict: 'chave'
      })

    if (error) {
      setMensagem({ tipo: 'erro', texto: `Erro ao salvar: ${error.message}` })
    } else {
      setMensagem({ tipo: 'sucesso', texto: 'Configurações salvas com sucesso!' })
    }

    setSalvando(false)
  }

  function formatarCnpj(valor: string): string {
    const numeros = valor.replace(/\D/g, '').slice(0, 14)
    return numeros
      .replace(/^(\d{2})(\d)/, '$1.$2')
      .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d)/, '.$1/$2')
      .replace(/(\d{4})(\d)/, '$1-$2')
  }

  const abas: { id: Aba; label: string; icon: React.ReactNode }[] = [
    { id: 'nfse', label: 'NFS-e', icon: <FileText className="h-4 w-4" /> },
    { id: 'nome-retorno', label: 'Nome Retorno', icon: <Tag className="h-4 w-4" /> },
    { id: 'tema', label: 'Tema', icon: <Palette className="h-4 w-4" /> },
  ]

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-pulse text-slate-400">Carregando...</div>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="hidden md:flex w-10 h-10 rounded-[var(--radius-md)] bg-[var(--shell-icon-bg)] items-center justify-center">
          <Settings className="h-5 w-5 text-[var(--shell-icon)]" />
        </div>
        <div>
          <h1 className="text-title text-[var(--shell-text)]">Configurações</h1>
          <p className="text-small text-[var(--shell-text-muted)]">NFS-e, produtos e integrações</p>
        </div>
      </div>

      {/* Abas */}
      <div className="flex gap-1 mb-6 border-b border-slate-200">
        {abas.map((aba) => (
          <button
            key={aba.id}
            onClick={() => setAbaAtiva(aba.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              abaAtiva === aba.id
                ? 'border-purple-600 text-purple-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            {aba.icon}
            {aba.label}
          </button>
        ))}
      </div>

      {/* Conteúdo da aba */}
      {abaAtiva === 'nfse' && (
        <div className="max-w-2xl">
          {/* Card NFS-e */}
          <div className="bg-slate-800 rounded-xl shadow-md p-6 border">
            <div className="flex items-center gap-2 mb-6">
              <FileText className="h-5 w-5 text-blue-400" />
              <h2 className="text-lg font-semibold text-slate-200">Nota Fiscal de Serviço (NFS-e)</h2>
            </div>

            {/* Mensagem */}
            {mensagem && (
              <div className={`mb-4 p-3 rounded-lg flex items-center gap-2 ${
                mensagem.tipo === 'sucesso' ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'
              }`}>
                {mensagem.tipo === 'sucesso' ? <Check className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                {mensagem.texto}
              </div>
            )}

            <div className="space-y-4">
              {/* Ambiente */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Ambiente</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="ambiente"
                      value="homologacao"
                      checked={config.ambiente === 'homologacao'}
                      onChange={() => setConfig({ ...config, ambiente: 'homologacao' })}
                      className="w-4 h-4 text-blue-400"
                    />
                    <span className="text-sm">Homologação (testes)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="ambiente"
                      value="producao"
                      checked={config.ambiente === 'producao'}
                      onChange={() => setConfig({ ...config, ambiente: 'producao' })}
                      className="w-4 h-4 text-blue-400"
                    />
                    <span className="text-sm">Produção</span>
                  </label>
                </div>
                {config.ambiente === 'homologacao' && (
                  <p className="text-xs text-amber-400 mt-1">
                    Em homologação, as notas não são válidas. Use para testes.
                  </p>
                )}
              </div>

              {/* CNPJ */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">CNPJ da Empresa</label>
                <input
                  type="text"
                  value={config.cnpj}
                  onChange={(e) => setConfig({ ...config, cnpj: formatarCnpj(e.target.value) })}
                  placeholder="00.000.000/0000-00"
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Inscrição Municipal */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Inscrição Municipal</label>
                <input
                  type="text"
                  value={config.inscricaoMunicipal}
                  onChange={(e) => setConfig({ ...config, inscricaoMunicipal: e.target.value })}
                  placeholder="Número da IM"
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Certificado Digital */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Certificado Digital A1</label>
                <div className="border-2 border-dashed rounded-lg p-4">
                  {certificadoInfo?.carregado ? (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-green-400">
                        <Check className="h-5 w-5" />
                        <span className="font-medium">{certificadoInfo.nome}</span>
                        <span className="text-sm text-slate-400">({certificadoInfo.tamanho} KB)</span>
                      </div>
                      <label className="text-sm text-blue-400 hover:underline cursor-pointer">
                        Trocar
                        <input
                          type="file"
                          accept=".pfx,.p12"
                          onChange={handleCertificadoUpload}
                          className="hidden"
                        />
                      </label>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center cursor-pointer">
                      <Upload className="h-8 w-8 text-slate-400 mb-2" />
                      <span className="text-sm text-slate-400">Clique para selecionar o arquivo .pfx</span>
                      <span className="text-xs text-slate-400 mt-1">Certificado digital tipo A1</span>
                      <input
                        type="file"
                        accept=".pfx,.p12"
                        onChange={handleCertificadoUpload}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>
              </div>

              {/* Senha do Certificado */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Senha do Certificado</label>
                <div className="relative">
                  <input
                    type={mostrarSenha ? 'text' : 'password'}
                    value={config.senhaCertificado}
                    onChange={(e) => setConfig({ ...config, senhaCertificado: e.target.value })}
                    placeholder="••••••••"
                    className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setMostrarSenha(!mostrarSenha)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-400"
                  >
                    {mostrarSenha ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              {/* Próximo RPS */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Próximo Número de RPS</label>
                <input
                  type="number"
                  min="1"
                  value={config.proximoRps}
                  onChange={(e) => setConfig({ ...config, proximoRps: parseInt(e.target.value) || 1 })}
                  className="w-32 px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-slate-400 mt-1">
                  Sequencial do RPS. Consulte o último número usado no GISS Online.
                </p>
              </div>

              {/* Botão Salvar */}
              <div className="pt-4 border-t">
                <button
                  onClick={salvarConfiguracoes}
                  disabled={salvando}
                  className="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {salvando ? (
                    <>Salvando...</>
                  ) : (
                    <>
                      <Check className="h-4 w-4" />
                      Salvar Configurações
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Info */}
          <div className="mt-4 p-4 bg-blue-900/30 rounded-lg text-sm text-blue-400">
            <p className="font-medium mb-1">Sobre a integração</p>
            <ul className="list-disc list-inside space-y-1 text-blue-400">
              <li>Integração direta com GISS Online (Prefeitura de Santos)</li>
              <li>Padrão ABRASF 2.04</li>
              <li>Necessário certificado digital A1 (e-CNPJ)</li>
              <li>Teste primeiro em homologação antes de produção</li>
            </ul>
          </div>
        </div>
      )}

      {abaAtiva === 'nome-retorno' && (
        <NomeRetorno />
      )}

      {abaAtiva === 'tema' && (
        <ThemeSelector />
      )}
    </div>
  )
}
