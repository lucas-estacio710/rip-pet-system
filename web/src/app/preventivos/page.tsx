import { Clock } from 'lucide-react'

export default function PreventivosPage() {
  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Clock className="h-8 w-8 text-blue-500" />
        <div>
          <h1 className="text-2xl font-bold text-slate-200">Preventivos</h1>
          <p className="text-sm text-slate-400">Vidas ativas - pets com contrato aguardando acionamento</p>
        </div>
      </div>

      <div className="bg-slate-800 rounded-xl shadow-sm border overflow-hidden">
        <div className="p-8 text-center text-slate-400">
          <p>Nenhum preventivo cadastrado</p>
          <p className="text-sm mt-2">Conecte ao Supabase para ver dados reais</p>
        </div>
      </div>
    </div>
  )
}
