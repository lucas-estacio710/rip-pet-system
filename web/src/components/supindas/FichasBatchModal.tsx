'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { X, Download, Share2, RefreshCw, FileImage, Check, AlertCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import FichaRemocao, { type FichaContratoData } from '@/components/fichas/FichaRemocao'
import { captureElementAsBlob, fichaFilename, type FichaProgress } from '@/lib/ficha-generator'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'

type FichaResult = {
  codigo: string
  petNome: string
  filename: string
  blob: Blob
  thumbnailUrl: string
  storageUrl?: string
  uploaded: boolean
}

type Props = {
  supindaId: string
  supindaNumero: number
  onClose: () => void
}

export default function FichasBatchModal({ supindaId, supindaNumero, onClose }: Props) {
  const [contratos, setContratos] = useState<FichaContratoData[]>([])
  const [loading, setLoading] = useState(true)
  const [fichas, setFichas] = useState<FichaResult[]>([])
  const [progress, setProgress] = useState<FichaProgress | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const fichaRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  const supabase = createClient()

  useEffect(() => {
    carregarContratos()
  }, [supindaId])

  async function carregarContratos() {
    setLoading(true)
    const { data, error } = await supabase
      .from('contratos')
      .select(`
        id, codigo, numero_lacre, tipo_cremacao, data_acolhimento,
        pet_nome, pet_especie, pet_raca, pet_cor, pet_idade_anos, pet_peso, pet_genero,
        tutor_nome, tutor_bairro, tutor_cidade, local_coleta, observacoes,
        tutor:tutor_id ( nome, bairro, cidade )
      `)
      .eq('supinda_id', supindaId)
      .order('pet_nome')

    if (error) {
      console.error('Erro ao carregar contratos:', error)
      setErro('Erro ao carregar contratos da supinda')
    } else {
      setContratos((data || []) as FichaContratoData[])
    }
    setLoading(false)
  }

  const setFichaRef = useCallback((codigo: string, el: HTMLDivElement | null) => {
    if (el) {
      fichaRefs.current.set(codigo, el)
    } else {
      fichaRefs.current.delete(codigo)
    }
  }, [])

  async function gerarFichas() {
    if (contratos.length === 0) return

    setFichas([])
    setErro(null)
    const total = contratos.length
    const results: FichaResult[] = []

    // Fase 1: Capturar imagens
    for (let i = 0; i < contratos.length; i++) {
      const contrato = contratos[i]
      setProgress({
        fase: 'capturando',
        atual: i + 1,
        total,
        mensagem: `Capturando ${contrato.pet_nome}...`,
      })

      // Aguarda o DOM renderizar
      await new Promise(r => setTimeout(r, 300))

      const el = fichaRefs.current.get(contrato.codigo)
      if (!el) {
        console.warn(`Ref nao encontrada para ${contrato.codigo}`)
        continue
      }

      try {
        const blob = await captureElementAsBlob(el)
        const filename = fichaFilename(contrato.codigo, contrato.pet_nome)
        const thumbnailUrl = URL.createObjectURL(blob)

        results.push({
          codigo: contrato.codigo,
          petNome: contrato.pet_nome,
          filename,
          blob,
          thumbnailUrl,
          uploaded: false,
        })
      } catch (err) {
        console.error(`Erro ao capturar ficha ${contrato.codigo}:`, err)
      }
    }

    // Fase 2: Upload ao Storage
    for (let i = 0; i < results.length; i++) {
      const ficha = results[i]
      setProgress({
        fase: 'enviando',
        atual: i + 1,
        total: results.length,
        mensagem: `Enviando ${ficha.petNome}...`,
      })

      try {
        const storagePath = `supinda_${supindaNumero}/${ficha.filename}`
        const { error } = await supabase.storage
          .from('fichas')
          .upload(storagePath, ficha.blob, {
            contentType: 'image/png',
            upsert: true,
          })

        if (error) {
          console.error(`Erro upload ${ficha.filename}:`, error)
        } else {
          const { data: urlData } = supabase.storage
            .from('fichas')
            .getPublicUrl(storagePath)
          ficha.storageUrl = urlData.publicUrl
          ficha.uploaded = true
        }
      } catch (err) {
        console.error(`Erro upload ${ficha.filename}:`, err)
      }
    }

    setFichas(results)
    setProgress({
      fase: 'concluido',
      atual: total,
      total,
      mensagem: `${results.length} fichas geradas!`,
    })
  }

  async function baixarZip() {
    if (fichas.length === 0) return

    const zip = new JSZip()
    const pasta = zip.folder(`fichas_supinda_${supindaNumero}`)!

    for (const ficha of fichas) {
      pasta.file(ficha.filename, ficha.blob)
    }

    const zipBlob = await zip.generateAsync({ type: 'blob' })
    saveAs(zipBlob, `fichas_supinda_${supindaNumero}.zip`)
  }

  async function compartilharFicha(ficha: FichaResult) {
    const canShare = typeof navigator.share === 'function' && typeof navigator.canShare === 'function'

    if (canShare) {
      const file = new File([ficha.blob], ficha.filename, { type: 'image/png' })
      const shareData = { files: [file], title: `Ficha - ${ficha.petNome}` }
      try {
        if (navigator.canShare && navigator.canShare(shareData)) {
          await navigator.share(shareData)
          return
        }
      } catch {
        // fallback
      }
    }

    // Fallback: download individual
    saveAs(ficha.blob, ficha.filename)
  }

  const gerada = fichas.length > 0
  const gerando = progress !== null && progress.fase !== 'concluido' && progress.fase !== 'erro'

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-slate-800 rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-700 sticky top-0 bg-slate-800 z-10">
          <div>
            <h3 className="text-lg font-semibold text-slate-200">
              <FileImage className="h-5 w-5 inline mr-2 text-orange-400" />
              Fichas de Remocao - Supinda #{supindaNumero}
            </h3>
            {contratos.length > 0 && (
              <p className="text-sm text-slate-400 mt-0.5">{contratos.length} contrato(s)</p>
            )}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 p-1">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4">
          {/* Loading */}
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500" />
            </div>
          )}

          {/* Sem contratos */}
          {!loading && contratos.length === 0 && (
            <div className="text-center py-12 text-slate-400">
              <FileImage className="h-12 w-12 mx-auto mb-3 text-slate-500" />
              <p>Nenhum contrato vinculado a esta supinda</p>
            </div>
          )}

          {/* Erro */}
          {erro && (
            <div className="flex items-center gap-2 p-3 bg-red-900/30 border border-red-500/30 rounded-lg mb-4 text-sm text-red-300">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {erro}
            </div>
          )}

          {/* Botoes de acao */}
          {!loading && contratos.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              <button
                onClick={gerarFichas}
                disabled={gerando}
                className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 transition-colors"
              >
                {gerando ? (
                  <>
                    <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                    Gerando...
                  </>
                ) : gerada ? (
                  <>
                    <RefreshCw className="h-4 w-4" />
                    Regenerar
                  </>
                ) : (
                  <>
                    <FileImage className="h-4 w-4" />
                    Gerar Fichas ({contratos.length})
                  </>
                )}
              </button>

              {gerada && (
                <button
                  onClick={baixarZip}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                >
                  <Download className="h-4 w-4" />
                  Baixar ZIP
                </button>
              )}
            </div>
          )}

          {/* Progress bar */}
          {gerando && progress && (
            <div className="mb-4">
              <div className="flex items-center justify-between text-sm text-slate-400 mb-1">
                <span>{progress.mensagem}</span>
                <span>{progress.atual}/{progress.total}</span>
              </div>
              <div className="w-full bg-slate-700 rounded-full h-2 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${(progress.atual / progress.total) * 100}%`,
                    background: progress.fase === 'capturando' ? '#f97316' : '#3b82f6',
                  }}
                />
              </div>
            </div>
          )}

          {/* Concluido */}
          {progress?.fase === 'concluido' && (
            <div className="flex items-center gap-2 p-3 bg-green-900/30 border border-green-500/30 rounded-lg mb-4 text-sm text-green-300">
              <Check className="h-4 w-4 flex-shrink-0" />
              {progress.mensagem}
            </div>
          )}

          {/* Galeria de thumbnails */}
          {gerada && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
              {fichas.map(ficha => (
                <div
                  key={ficha.codigo}
                  className="group relative bg-slate-700 rounded-lg overflow-hidden border border-slate-600 hover:border-orange-500/50 transition-colors"
                >
                  <img
                    src={ficha.thumbnailUrl}
                    alt={`Ficha ${ficha.petNome}`}
                    className="w-full h-auto"
                  />
                  {/* Overlay com acoes */}
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <button
                      onClick={() => saveAs(ficha.blob, ficha.filename)}
                      className="p-2 bg-white/20 rounded-full hover:bg-white/30 transition-colors"
                      title="Baixar"
                    >
                      <Download className="h-4 w-4 text-white" />
                    </button>
                    <button
                      onClick={() => compartilharFicha(ficha)}
                      className="p-2 bg-white/20 rounded-full hover:bg-white/30 transition-colors"
                      title="Compartilhar"
                    >
                      <Share2 className="h-4 w-4 text-white" />
                    </button>
                  </div>
                  {/* Label */}
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                    <p className="text-xs font-medium text-white truncate">{ficha.petNome}</p>
                    <p className="text-[10px] text-slate-300">{ficha.codigo}</p>
                  </div>
                  {/* Upload badge */}
                  {ficha.uploaded && (
                    <div className="absolute top-1.5 right-1.5 bg-green-500 rounded-full p-0.5">
                      <Check className="h-3 w-3 text-white" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

        </div>
      </div>

      {/* Fichas offscreen para captura - fora do modal scroll para nao ser clipado */}
      <div
        style={{ position: 'fixed', left: '-9999px', top: 0, overflow: 'visible', zIndex: -1 }}
        aria-hidden="true"
      >
        {contratos.map(contrato => (
          <div key={contrato.codigo} style={{ marginBottom: 16 }}>
            <FichaRemocao
              ref={(el) => setFichaRef(contrato.codigo, el)}
              contrato={contrato}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
