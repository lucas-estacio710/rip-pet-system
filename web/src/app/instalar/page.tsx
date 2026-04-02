"use client"

import { useState, useEffect } from "react"
import Image from "next/image"
import { Download, Smartphone, Monitor, ChevronRight, Check, Share, MoreVertical, PlusSquare, ArrowLeft } from "lucide-react"
import Link from "next/link"

type Platform = "android" | "ios" | "desktop" | null

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return null
  const ua = navigator.userAgent.toLowerCase()
  if (/iphone|ipad|ipod/.test(ua)) return "ios"
  if (/android/.test(ua)) return "android"
  return "desktop"
}

const steps = {
  android: [
    {
      title: "Abra o site no Chrome",
      desc: "Acesse o CRM pelo navegador Google Chrome no seu celular.",
      icon: Monitor,
    },
    {
      title: 'Toque no menu (3 pontinhos)',
      desc: "No canto superior direito do Chrome, toque nos 3 pontinhos verticais para abrir o menu.",
      icon: MoreVertical,
    },
    {
      title: '"Adicionar à tela inicial"',
      desc: 'Role o menu e toque em "Adicionar à tela inicial" ou "Instalar aplicativo".',
      icon: PlusSquare,
    },
    {
      title: "Confirme a instalação",
      desc: 'Toque em "Adicionar" ou "Instalar" na janela que aparecer. O ícone do R.I.P. Pet será adicionado à sua tela inicial.',
      icon: Check,
    },
  ],
  ios: [
    {
      title: "Abra o site no Safari",
      desc: "Acesse o CRM pelo navegador Safari no seu iPhone. Importante: use o Safari, outros navegadores não permitem instalação.",
      icon: Monitor,
    },
    {
      title: "Toque no botão Compartilhar",
      desc: "Na barra inferior do Safari, toque no ícone de compartilhar (quadrado com seta para cima).",
      icon: Share,
    },
    {
      title: '"Adicionar à Tela de Início"',
      desc: 'Role as opções e toque em "Adicionar à Tela de Início".',
      icon: PlusSquare,
    },
    {
      title: "Confirme",
      desc: 'Toque em "Adicionar" no canto superior direito. O ícone aparecerá na sua tela inicial como um app.',
      icon: Check,
    },
  ],
  desktop: [
    {
      title: "Abra o site no Chrome",
      desc: "Acesse o CRM pelo Google Chrome no computador.",
      icon: Monitor,
    },
    {
      title: "Clique no ícone de instalar",
      desc: "Na barra de endereço (URL), procure o ícone de instalação (monitor com seta) no lado direito. Ou use o menu (3 pontinhos) > Instalar R.I.P. Pet.",
      icon: Download,
    },
    {
      title: "Confirme a instalação",
      desc: 'Clique em "Instalar" na janela que aparecer. O app será instalado e abrirá em sua própria janela.',
      icon: Check,
    },
  ],
}

export default function InstalarPage() {
  const [platform, setPlatform] = useState<Platform>(null)
  const [detected, setDetected] = useState<Platform>(null)

  useEffect(() => {
    const p = detectPlatform()
    setDetected(p)
    setPlatform(p)
  }, [])

  const currentSteps = platform ? steps[platform] : []

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg, #1a1614 0%, #2d2420 50%, #1a1614 100%)",
        color: "#f1f5f9",
        fontFamily: "var(--font-dm-sans, 'DM Sans', sans-serif)",
      }}
    >
      {/* Header */}
      <div
        style={{
          maxWidth: 540,
          margin: "0 auto",
          padding: "40px 20px 20px",
          textAlign: "center",
        }}
      >
        <Image
          src="/logo_rounded.png"
          alt="R.I.P. Pet"
          width={80}
          height={80}
          style={{ margin: "0 auto 16px", borderRadius: "20px" }}
        />
        <h1
          style={{
            fontSize: 24,
            fontWeight: 700,
            margin: "0 0 8px",
            letterSpacing: "-0.02em",
          }}
        >
          Instalar o R.I.P. Pet
        </h1>
        <p style={{ fontSize: 15, color: "#94a3b8", margin: 0, lineHeight: 1.5 }}>
          Adicione o CRM na tela inicial do seu celular para acesso rápido — sem precisar baixar pela loja de apps.
        </p>
      </div>

      {/* Platform selector */}
      <div style={{ maxWidth: 540, margin: "0 auto", padding: "0 20px" }}>
        <div
          style={{
            display: "flex",
            gap: 8,
            marginBottom: 24,
            justifyContent: "center",
          }}
        >
          {(["android", "ios", "desktop"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPlatform(p)}
              style={{
                padding: "10px 20px",
                borderRadius: 10,
                border: "none",
                background: platform === p ? "#7c3aed" : "rgba(255,255,255,0.08)",
                color: platform === p ? "#fff" : "#94a3b8",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.2s",
                fontFamily: "inherit",
              }}
            >
              {p === "android" ? "Android" : p === "ios" ? "iPhone" : "Computador"}
              {detected === p && (
                <span style={{ fontSize: 11, marginLeft: 4, opacity: 0.7 }}>
                  (seu)
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Steps */}
        {platform && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {currentSteps.map((step, i) => {
              const Icon = step.icon
              return (
                <div
                  key={i}
                  style={{
                    background: "rgba(255,255,255,0.06)",
                    borderRadius: 14,
                    padding: "20px",
                    display: "flex",
                    gap: 16,
                    alignItems: "flex-start",
                  }}
                >
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 12,
                      background: "rgba(124,58,237,0.15)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 18,
                        fontWeight: 700,
                        color: "#a78bfa",
                        fontFamily: "var(--font-jetbrains-mono, monospace)",
                      }}
                    >
                      {i + 1}
                    </span>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        marginBottom: 4,
                      }}
                    >
                      <Icon size={16} style={{ color: "#a78bfa", flexShrink: 0 }} />
                      <h3
                        style={{
                          fontSize: 16,
                          fontWeight: 600,
                          margin: 0,
                          color: "#f1f5f9",
                        }}
                      >
                        {step.title}
                      </h3>
                    </div>
                    <p
                      style={{
                        fontSize: 14,
                        color: "#94a3b8",
                        margin: 0,
                        lineHeight: 1.5,
                      }}
                    >
                      {step.desc}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Dica */}
        <div
          style={{
            marginTop: 24,
            padding: "16px 20px",
            background: "rgba(124,58,237,0.1)",
            borderRadius: 12,
            border: "1px solid rgba(124,58,237,0.2)",
          }}
        >
          <p
            style={{
              fontSize: 14,
              color: "#c4b5fd",
              margin: 0,
              lineHeight: 1.5,
            }}
          >
            <strong>Dica:</strong> Depois de instalado, o app abre em tela cheia (sem barra do navegador) e fica acessível como qualquer outro app do seu celular.
          </p>
        </div>

        {/* CTA */}
        <div style={{ textAlign: "center", marginTop: 32, paddingBottom: 40 }}>
          <Link
            href="/login"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "14px 28px",
              background: "#7c3aed",
              color: "#fff",
              borderRadius: 12,
              fontSize: 15,
              fontWeight: 600,
              textDecoration: "none",
              fontFamily: "inherit",
            }}
          >
            <ArrowLeft size={18} />
            Ir para o Login
          </Link>
        </div>
      </div>
    </div>
  )
}
