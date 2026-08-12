// Parte 2 — /preventivos (AtivarModal) e /tutores (re-tutor)
const { chromium } = require('C:\\Users\\kel_v\\LUCAS_ATELLIAR\\NOVO_CRM_RIP_PET\\web\\node_modules\\playwright')
const path = require('path')
const fs = require('fs')

const OUT = path.join(__dirname, 'shots')
const BASE = 'http://localhost:3000'
fs.mkdirSync(OUT, { recursive: true })

async function shot(page, nome) {
  await page.waitForTimeout(600)
  await page.screenshot({ path: path.join(OUT, nome + '.png') })
  console.log('shot:', nome)
}

;(async () => {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'pt-BR' })
  const page = await ctx.newPage()
  global.__lastPage = page
  page.setDefaultTimeout(20000)

  // Login
  await page.goto(BASE + '/login')
  await page.locator('input[type="email"], input[name="email"]').first().fill('manual.shots@teste.rip')
  await page.locator('input[type="password"]').first().fill('ManualShots2026!')
  await page.getByRole('button', { name: /Entrar/i }).click()
  await page.waitForURL('**/dashboard**', { timeout: 30000 }).catch(() => {})
  await page.waitForTimeout(3000)

  // /preventivos — card + modal Ativar
  await page.goto(BASE + '/preventivos')
  await page.locator('h1:has-text("Preventivos")').waitFor()
  await page.locator('input[placeholder*="Buscar"]').fill('REX TESTE')
  await page.waitForTimeout(2500)
  await shot(page, 'pv-14-preventivos-card')
  await page.locator('text=ATV').first().click()
  await page.locator('text=Ativar Contrato').first().waitFor()
  await shot(page, 'pv-15-ativar-modal')
  await page.locator('text=Responsável pelo Acolhimento').scrollIntoViewIfNeeded().catch(() => {})
  await page.waitForTimeout(500)
  await shot(page, 'pv-16-ativar-acolhimento')
  await page.getByRole('button', { name: 'Cancelar' }).click().catch(() => page.keyboard.press('Escape'))
  await page.waitForTimeout(800)

  // RE-TUTOR
  await page.goto(BASE + '/tutores')
  await page.locator('h1:has-text("Tutores")').waitFor()
  await page.locator('input[placeholder*="Buscar"]').fill('TUTOR TESTE')
  await page.waitForTimeout(2500)
  await shot(page, 'rt-01-busca-tutor')

  await page.locator('text=TUTOR TESTE MANUAL PV').first().click()
  await page.locator('text=Enviar nova contratação').waitFor()
  await shot(page, 'rt-02-cadastro-tutor')

  await page.locator('text=Enviar nova contratação').click()
  await page.locator('text=Link de nova contratação').waitFor()
  await shot(page, 'rt-03-link-nova-contratacao')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(500)

  await page.locator('text=Histórico de Contratos').scrollIntoViewIfNeeded()
  await page.waitForTimeout(500)
  await shot(page, 'rt-04-historico-contratos')

  await browser.close()
  console.log('FIM parte 2')
})().catch(async err => {
  console.error('ERRO:', err.message)
  try { if (global.__lastPage) await global.__lastPage.screenshot({ path: path.join(OUT, 'ERRO2.png') }) } catch {}
  process.exit(1)
})
