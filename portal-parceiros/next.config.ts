import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // O portal é público-facing e roda em domínio próprio (parceiro.rippet.com.br).
  // Cabeçalhos de segurança básicos — o CRM fica noutro host, então nada de iframe.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ]
  },
}

export default nextConfig
