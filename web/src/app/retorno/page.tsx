import { Package, Map } from 'lucide-react'

export default function RetornoPage() {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Package className="h-8 w-8 text-green-500" />
          <div>
            <h1 className="text-2xl font-bold text-slate-200">Retorno</h1>
            <p className="text-sm text-slate-400">Cinzas prontas para entrega</p>
          </div>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700">
          <Map className="h-4 w-4" />
          Ver Mapa
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-yellow-900/30 border border-yellow-700 rounded-xl p-4">
          <p className="text-sm text-yellow-400">Pendencias</p>
          <p className="text-2xl font-bold text-yellow-300">3</p>
        </div>
        <div className="bg-green-900/30 border border-green-700 rounded-xl p-4">
          <p className="text-sm text-green-400">Pronto p/ entregar</p>
          <p className="text-2xl font-bold text-green-300">5</p>
        </div>
        <div className="bg-blue-900/30 border border-blue-700 rounded-xl p-4">
          <p className="text-sm text-blue-400">Em rota</p>
          <p className="text-2xl font-bold text-blue-300">2</p>
        </div>
        <div className="bg-slate-700/50 border border-slate-600 rounded-xl p-4">
          <p className="text-sm text-slate-400">Entregue (aguard. finaliz.)</p>
          <p className="text-2xl font-bold text-slate-200">4</p>
        </div>
      </div>

      <div className="bg-slate-800 rounded-xl shadow-sm border overflow-hidden">
        <div className="p-8 text-center text-slate-400">
          <p>Nenhum retorno pendente</p>
          <p className="text-sm mt-2">Conecte ao Supabase para ver dados reais</p>
        </div>
      </div>
    </div>
  )
}
