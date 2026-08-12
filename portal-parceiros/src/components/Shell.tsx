import { getParceiroSessao, SessaoInvalida } from '@/lib/sessao'
import NavInferior from './NavInferior'

/**
 * Envolve as páginas autenticadas com a barra inferior, já respeitando as features
 * ligadas na unidade. Resolvido no servidor pra não piscar itens que somem depois.
 */
export default async function Shell({ children }: { children: React.ReactNode }) {
  let features = { sorteio: false, materiais: false }
  try {
    const s = await getParceiroSessao()
    features = {
      sorteio: s.config.sorteio_ativo,
      materiais: s.config.materiais_ativos,
    }
  } catch (e) {
    if (!(e instanceof SessaoInvalida)) throw e
    // Sem sessão válida: a própria página cuida do redirecionamento.
  }

  return (
    <>
      <div className="pb-20">{children}</div>
      <NavInferior features={features} />
    </>
  )
}
