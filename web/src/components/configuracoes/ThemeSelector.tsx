'use client'

import { Check } from 'lucide-react'
import { useTheme } from '@/hooks/useTheme'
import { THEMES, THEME_META, type Theme } from '@/lib/theme'

const PREVIEW_COLORS: Record<Theme, { shell: string; content: string; shellText: string; contentText: string }> = {
  dark:         { shell: '#1e293b', content: '#1e293b', shellText: '#94a3b8', contentText: '#94a3b8' },
  white:        { shell: '#f8fafc', content: '#ffffff', shellText: '#64748b', contentText: '#64748b' },
  'half-white': { shell: '#f8fafc', content: '#1e293b', shellText: '#64748b', contentText: '#94a3b8' },
  'half-dark':  { shell: '#1e293b', content: '#ffffff', shellText: '#94a3b8', contentText: '#64748b' },
}

function ThemePreview({ themeId, active, onClick }: { themeId: Theme; active: boolean; onClick: () => void }) {
  const colors = PREVIEW_COLORS[themeId]
  const meta = THEME_META[themeId]
  const sidebarColor = '#0f172a'

  return (
    <button
      onClick={onClick}
      className={`relative flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all duration-200 cursor-pointer ${
        active
          ? 'border-purple-500 bg-purple-500/10 shadow-md'
          : 'border-slate-600 hover:border-slate-400 bg-slate-800/50 hover:bg-slate-700/50'
      }`}
    >
      {/* Active checkmark */}
      {active && (
        <div className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-purple-500 flex items-center justify-center shadow-sm">
          <Check className="h-3 w-3 text-white" />
        </div>
      )}

      {/* Mini preview */}
      <div
        className="w-full aspect-[4/3] rounded-lg overflow-hidden flex border border-slate-600/50"
        style={{ minHeight: 72 }}
      >
        {/* Sidebar strip (always dark) */}
        <div
          className="w-[18%] flex-shrink-0 flex flex-col items-center gap-1 pt-2"
          style={{ backgroundColor: sidebarColor }}
        >
          <div className="w-2.5 h-2.5 rounded-sm bg-slate-600" />
          <div className="w-2.5 h-2.5 rounded-sm bg-purple-500" />
          <div className="w-2.5 h-2.5 rounded-sm bg-slate-700" />
        </div>

        {/* Shell area */}
        <div
          className="flex-1 p-1.5 flex flex-col gap-1"
          style={{ backgroundColor: colors.shell }}
        >
          {/* Top bar */}
          <div
            className="h-1.5 w-8 rounded-full"
            style={{ backgroundColor: colors.shellText }}
          />

          {/* Content cards */}
          <div className="flex-1 flex flex-col gap-1">
            <div
              className="flex-1 rounded-sm p-1"
              style={{ backgroundColor: colors.content }}
            >
              <div
                className="h-1 w-6 rounded-full mb-0.5"
                style={{ backgroundColor: colors.contentText }}
              />
              <div
                className="h-1 w-10 rounded-full opacity-50"
                style={{ backgroundColor: colors.contentText }}
              />
            </div>
            <div
              className="h-4 rounded-sm"
              style={{ backgroundColor: colors.content }}
            />
          </div>
        </div>
      </div>

      {/* Label */}
      <div className="text-center">
        <p className={`text-sm font-semibold ${active ? 'text-purple-400' : 'text-slate-200'}`}>
          {meta.label}
        </p>
        <p className="text-xs text-slate-500">{meta.description}</p>
      </div>
    </button>
  )
}

export default function ThemeSelector() {
  const { theme, setTheme } = useTheme()

  return (
    <div className="max-w-2xl">
      <div className="bg-slate-800 rounded-xl shadow-md p-6 border border-slate-700">
        <h2 className="text-lg font-semibold text-slate-200 mb-1">Aparência</h2>
        <p className="text-sm text-slate-400 mb-6">
          Escolha a combinação de cores para o shell (fundo) e conteúdo (cards).
          A sidebar permanece escura em todos os temas.
        </p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {THEMES.map((t) => (
            <ThemePreview
              key={t}
              themeId={t}
              active={theme === t}
              onClick={() => setTheme(t)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
