'use client'

import Link from 'next/link'
import Image from 'next/image'
import { ArrowLeft, ShieldAlert } from 'lucide-react'

export default function EsqueciSenhaPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-purple-900">
      <div className="w-full max-w-md px-4">
        <div className="bg-slate-800 rounded-2xl shadow-2xl p-8">
          {/* Logo */}
          <div className="flex justify-center mb-6">
            <Image
              src="/logo.png"
              alt="R.I.P. Pet"
              width={200}
              height={56}
              priority
              className="dark:invert"
            />
          </div>

          <div className="text-center space-y-4">
            <ShieldAlert className="h-12 w-12 text-amber-400 mx-auto" />
            <h1 className="text-lg font-semibold text-slate-200">
              Esqueceu sua senha?
            </h1>
            <p className="text-sm text-slate-400">
              Entre em contato com o <strong className="text-slate-300">administrador do sistema</strong> para redefinir sua senha.
            </p>
            <p className="text-xs text-slate-500">
              Ele poderá gerar uma nova senha temporária para você no painel de usuários.
            </p>

            <Link
              href="/login"
              className="inline-flex items-center gap-2 text-sm text-purple-400 hover:text-purple-300 mt-4"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar ao login
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
