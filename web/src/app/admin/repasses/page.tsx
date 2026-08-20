// O Repasse virou uma ABA do Financeiro (`/financeiro`), junto com Lançamentos e
// DRE. Esta rota fica de pé só para não quebrar link salvo ou favorito de quem já
// usava a tela antiga.

import { redirect } from 'next/navigation'

export default function RepassesRedirect() {
  redirect('/financeiro')
}
