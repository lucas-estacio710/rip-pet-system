import { Truck } from 'lucide-react'

export default function PindaPage() {
  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Truck className="h-8 w-8 text-orange-500" />
        <div>
          <h1 className="text-2xl font-bold text-slate-200">Pinda</h1>
          <p className="text-sm text-slate-400">Pets no crematório aguardando cremação</p>
        </div>
      </div>

      <div className="bg-slate-800 rounded-xl shadow-sm border overflow-hidden">
        <div className="p-8 text-center text-slate-400">
          <p>Nenhum pet em Pinda no momento</p>
          <p className="text-sm mt-2">Conecte ao Supabase para ver dados reais</p>
        </div>
      </div>
    </div>
  )
}
