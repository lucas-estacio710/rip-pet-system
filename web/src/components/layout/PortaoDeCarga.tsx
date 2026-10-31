'use client'

/**
 * Portão de carga (30/10/2026): nenhuma tela monta antes de perfil, unidade e FLS prontos.
 *
 * Por quê: cada tela tirava conclusão do estado de carga. Com o perfil ainda chegando,
 * `currentUnit` é null e a /tarefas dizia "Módulo Operacional não está ativo nessa unidade",
 * as /clinicas "não está habilitada", as /admin "Acesso restrito" — e o usuário apressado
 * achava que era erro. Pior: com o FLS ainda vazio, tudo respondia 'edit' (ver UnitContext,
 * incidente da gerente de PA). Esperar aqui, num lugar só, tira das telas a chance de concluir
 * cedo demais — e quem mexer numa tela nova não precisa lembrar disso.
 *
 * Carregando ≠ erro: a mensagem diz que está carregando, e depois de alguns segundos avisa
 * que a conexão está lenta. Erro diz que vai tentar de novo (o FLS tenta sozinho) e dá o botão.
 */
import { useEffect, useState, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { Loader2, WifiOff, UserX } from 'lucide-react'
import { useUnit } from '@/contexts/UnitContext'

// Telas que funcionam sem perfil/unidade: trocar senha, conta, instalar o app.
const SEM_PORTAO = ['/minha-conta', '/redefinir-senha', '/esqueci-senha', '/instalar']

/** Depois disso carregando, a mensagem passa a dizer que a conexão está lenta. */
const LENTO_MS = 6000

export function PortaoDeCarga({ children }: { children: ReactNode }) {
  const { perfilStatus, currentUnit, flsStatus, recarregarAcesso } = useUnit()
  const pathname = usePathname()
  const [lento, setLento] = useState(false)

  const livre = SEM_PORTAO.some(r => pathname === r || pathname?.startsWith(r + '/'))
  const pronto = perfilStatus === 'pronto' && !!currentUnit && flsStatus === 'pronto'
  const erro = perfilStatus === 'erro' || (perfilStatus === 'pronto' && flsStatus === 'erro')

  useEffect(() => {
    if (pronto || erro) return
    const t = setTimeout(() => setLento(true), LENTO_MS)
    // Zera ao sair da espera: a próxima carga (troca de unidade) começa sem o "lenta".
    return () => { clearTimeout(t); setLento(false) }
  }, [pronto, erro])

  if (livre || pronto) return <>{children}</>

  if (perfilStatus === 'sem_perfil') {
    return (
      <Aviso icone={<UserX className="h-6 w-6" />} titulo="Seu usuário ainda não tem acesso a uma unidade">
        Fale com o administrador para liberar o seu perfil.
      </Aviso>
    )
  }
  if (perfilStatus === 'sem_sessao') {
    return (
      <Aviso icone={<UserX className="h-6 w-6" />} titulo="Sua sessão terminou">
        <Link href="/login" className="font-semibold underline">Entrar de novo</Link>
      </Aviso>
    )
  }
  if (erro) {
    return (
      <Aviso icone={<WifiOff className="h-6 w-6" />} titulo="Não conseguimos carregar o seu acesso">
        <span className="block">Pode ser a conexão. Estamos tentando de novo sozinhos.</span>
        <button type="button" onClick={recarregarAcesso}
          className="mt-3 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-[var(--brand-600,#7c3aed)]">
          Tentar agora
        </button>
      </Aviso>
    )
  }
  return (
    <Aviso icone={<Loader2 className="h-6 w-6 animate-spin" />} titulo="Carregando…">
      {lento ? 'A conexão está lenta. Só mais um pouquinho.' : 'Preparando suas telas.'}
    </Aviso>
  )
}

function Aviso({ icone, titulo, children }: { icone: ReactNode; titulo: string; children: ReactNode }) {
  return (
    <div role="status" className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center gap-2">
      <span style={{ color: 'var(--surface-400)' }}>{icone}</span>
      <p className="text-[15px] font-semibold" style={{ color: 'var(--surface-700)' }}>{titulo}</p>
      <div className="text-[13px]" style={{ color: 'var(--surface-500)' }}>{children}</div>
    </div>
  )
}
