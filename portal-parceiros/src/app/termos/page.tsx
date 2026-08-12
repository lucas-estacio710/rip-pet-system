export const metadata = { title: 'Termos de Uso e Privacidade — RIP Pet Parceiros' }

/**
 * ⚠️ Texto provisório, baseado em docs/PORTAL_PARCEIROS_TERMOS_DRAFT.md.
 * PRECISA de revisão jurídica antes do primeiro cadastro real — em especial a parte
 * de sorteio (Lei 5.768/71 trata promoção comercial) e os dados da controladora.
 */
export default function TermosPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-10">
      <h1 className="text-2xl font-semibold text-[var(--surface-900)]">
        Termos de Uso e Privacidade
      </h1>
      <p className="mt-2 text-sm text-[var(--surface-400)]">Versão 1.0</p>

      <div className="mt-8 space-y-6 text-sm leading-relaxed text-[var(--surface-600)]">
        <section>
          <h2 className="mb-2 font-semibold text-[var(--surface-800)]">O programa</h2>
          <p>
            O RIP Pet Parceiros é um programa de relacionamento destinado a profissionais
            de clínicas veterinárias e pet shops. O acesso é por convite e o cadastro é
            pessoal e intransferível.
          </p>
        </section>

        <section>
          <h2 className="mb-2 font-semibold text-[var(--surface-800)]">Comissões e benefícios</h2>
          <p>
            A cada indicação concretizada você pode optar por comissão em dinheiro,
            desconto ao tutor ou item de cortesia. Os valores vigentes são os exibidos no
            portal na data da indicação e podem mudar, sem efeito retroativo sobre
            indicações já concretizadas. O pagamento é feito por pix, na chave que você
            cadastrou, com comprovante disponível no seu extrato.
          </p>
          <p className="mt-3">
            As comissões são uma liberalidade do programa e{' '}
            <strong className="text-[var(--surface-800)]">
              não criam vínculo empregatício, societário ou de representação
            </strong>{' '}
            entre você e a RIP Pet.
          </p>
        </section>

        <section>
          <h2 className="mb-2 font-semibold text-[var(--surface-800)]">Seus dados</h2>
          <p>
            Coletamos nome, cargo, CRMV (quando aplicável), contato, cidade de atuação,
            estabelecimento e chave pix — o necessário para operar o programa e pagar suas
            comissões. Registramos também o uso do portal (acessos, orçamentos e
            indicações) para o funcionamento do próprio programa.
          </p>
          <p className="mt-3">
            Não vendemos seus dados. Eles são tratados por provedores necessários à
            operação (hospedagem, banco de dados e envio de e-mails). Você pode pedir
            acesso, correção ou exclusão a qualquer momento — dados ligados a obrigações
            fiscais podem precisar ser mantidos pelo prazo legal.
          </p>
        </section>

        <section>
          <h2 className="mb-2 font-semibold text-[var(--surface-800)]">Dados do tutor</h2>
          <p>
            Ao preencher um orçamento em nome de um tutor, você declara ter a autorização
            dele para nos informar os dados de contato.
          </p>
        </section>

        <section>
          <h2 className="mb-2 font-semibold text-[var(--surface-800)]">Sorteios</h2>
          <p>
            Indicações concretizadas no mês geram bilhetes para o sorteio da sua região,
            conforme as regras exibidas no portal. O prêmio é pessoal e intransferível,
            sem conversão em dinheiro.
          </p>
        </section>

        <section>
          <h2 className="mb-2 font-semibold text-[var(--surface-800)]">Encerramento</h2>
          <p>
            Você pode sair do programa quando quiser, pedindo a exclusão da sua conta.
            Comissões de indicações já concretizadas continuam devidas.
          </p>
        </section>
      </div>
    </main>
  )
}
