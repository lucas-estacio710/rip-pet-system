// Captura os prints mobile dos fluxos PV e Re-tutor pro manual.
// Roda com: node manual_shots.cjs (a partir de web/, onde playwright está instalado)
const { chromium } = require('C:\\Users\\kel_v\\LUCAS_ATELLIAR\\NOVO_CRM_RIP_PET\\web\\node_modules\\playwright')
const path = require('path')
const fs = require('fs')

const OUT = path.join(__dirname, 'shots')
const BASE = 'http://localhost:3000'
const USER = 'manual.shots@teste.rip'
const PASS = 'ManualShots2026!'

fs.mkdirSync(OUT, { recursive: true })

async function shot(page, nome) {
  await page.waitForTimeout(600)
  await page.screenshot({ path: path.join(OUT, nome + '.png') })
  console.log('shot:', nome)
}

;(async () => {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    locale: 'pt-BR',
  })
  const page = await ctx.newPage()
  global.__lastPage = page
  page.setDefaultTimeout(20000)

  // ============ FLUXO PÚBLICO: formulário de contratação PV ============
  await page.goto(BASE + '/preventivo/santos')
  await page.waitForSelector('text=Dados do Tutor')
  await shot(page, 'pv-01-form-tutor')

  // Passo 1 — Tutor (por placeholder/label — resiliente à ordem do DOM)
  await page.getByPlaceholder('Nome para o contrato e certificado').fill('TUTOR TESTE MANUAL PV')
  await page.getByPlaceholder('000.000.000-00').fill('52998224725')
  await page.getByPlaceholder('(11) 99999-9999').fill('13900000000')
  await page.getByPlaceholder('email@exemplo.com').fill('teste@teste.com')
  await page.getByPlaceholder('00000-000').fill('11000000')
  await page.getByPlaceholder('Av. Paulista').fill('Rua Exemplo Manual')
  await page.locator('xpath=//label[contains(., "Bairro")]/following::input[1]').fill('Centro')
  await page.locator('xpath=//label[contains(., "Cidade")]/following::input[1]').fill('Santos')
  await page.locator('select').last().selectOption('SP') // UF
  await page.getByPlaceholder('1000').fill('100')
  await shot(page, 'pv-02-form-tutor-preenchido')
  await page.getByRole('button', { name: /Continuar/ }).click()

  // Passo 2 — Pet
  await page.waitForSelector('text=Dados do Pet')
  await page.locator('xpath=//label[contains(., "Nome do Pet")]/following::input[1]').fill('REX TESTE')
  await page.getByPlaceholder('Ex: 14').fill('5')
  await page.locator('text=Canina').first().click()
  await page.locator('text=Macho').first().click()
  await page.getByPlaceholder(/Shihtzu/).fill('SRD')
  await page.getByPlaceholder('Ex: Branco').fill('Caramelo')
  await page.getByPlaceholder('Ex: 8').fill('12')
  await page.locator('text=Individual').first().click()
  await page.locator('text=Cremação').first().scrollIntoViewIfNeeded()
  await shot(page, 'pv-03-form-pet')
  await page.getByRole('button', { name: /Continuar/ }).click()

  // Passo 3 — Confirmar
  await page.waitForSelector('text=Confirmação')
  await shot(page, 'pv-04-confirmacao')
  await page.locator('text=Já utilizei a R.I.P. Pet').click()
  await page.getByRole('button', { name: /Enviar Ficha/ }).scrollIntoViewIfNeeded()
  await shot(page, 'pv-05-como-conheceu')
  await page.getByRole('button', { name: /Enviar Ficha/ }).click()
  await page.waitForSelector('text=Ficha Enviada com Sucesso', { timeout: 30000 })
  await shot(page, 'pv-06-sucesso')

  // ============ LOGIN ============
  await page.goto(BASE + '/login')
  await page.waitForSelector('input[type="email"], input[name="email"]')
  await page.locator('input[type="email"], input[name="email"]').first().fill(USER)
  await page.locator('input[type="password"]').first().fill(PASS)
  await page.getByRole('button', { name: /Entrar/i }).click()
  await page.waitForURL('**/dashboard**', { timeout: 30000 }).catch(() => {})
  await page.waitForTimeout(3000)

  // ============ /fichas — card recebido ============
  await page.goto(BASE + '/fichas')
  await page.waitForSelector('text=Fichas de Entrada')
  await page.waitForTimeout(2500)
  await shot(page, 'pv-07-fichas-recebida')

  // Abrir tratativa da ficha RECEBIDA (botão Processar do card)
  await page.getByRole('button', { name: 'Processar', exact: true }).first().click()
  await page.waitForSelector('text=Tutor existente')
  await shot(page, 'pv-08-tratativa-tutor-existente')

  // Rolar o corpo do modal até o bloco de contato
  const modalBody = page.locator('div.overflow-y-auto').last()
  await page.locator('text=CONTATO PARA CREMAÇÃO').scrollIntoViewIfNeeded()
  await shot(page, 'pv-09-contato-cremacao')
  await page.getByRole('button', { name: 'Sim, é este' }).click()
  await page.getByPlaceholder('Ex: Ana').fill('Tutor')

  // Valor do plano
  await page.locator('text=Valor do Plano').scrollIntoViewIfNeeded()
  await page.getByRole('button', { name: '1.490', exact: true }).click()
  await shot(page, 'pv-10-valor-plano')

  // Processar (marca processada; contrato só no passo seguinte)
  await page.getByRole('button', { name: 'Processar', exact: true }).last().click()
  await page.waitForSelector('text=Ficha processada!', { timeout: 20000 })
  await page.waitForTimeout(2500)
  await shot(page, 'pv-11-ficha-processada')

  // Visualizar Ficha → botão Criar Contrato (NÃO clicar em criar!)
  await page.getByRole('button', { name: /Visualizar Ficha/ }).first().click()
  await page.waitForSelector('text=Ficha Processada')
  await page.waitForSelector('text=Criar Contrato')
  await shot(page, 'pv-12-criar-contrato')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(800)

  // ============ Pipeline — card do contrato preventivo ============
  await page.goto(BASE + '/contratos?status=preventivo&busca=REX%20TESTE')
  await page.waitForTimeout(4000)
  await shot(page, 'pv-13-pipeline-preventivo')

  // ============ /preventivos — card + modal Ativar ============
  await page.goto(BASE + '/preventivos')
  await page.waitForSelector('text=Preventivos')
  await page.locator('input[placeholder*="Buscar"]').fill('REX TESTE')
  await page.waitForTimeout(2000)
  await shot(page, 'pv-14-preventivos-card')
  await page.locator('text=ATV').first().click()
  await page.waitForSelector('text=Ativar Contrato')
  await shot(page, 'pv-15-ativar-modal')
  await page.locator('text=Responsável pelo Acolhimento').scrollIntoViewIfNeeded().catch(() => {})
  await shot(page, 'pv-16-ativar-acolhimento')
  await page.getByRole('button', { name: 'Cancelar' }).click()
  await page.waitForTimeout(800)

  // ============ RE-TUTOR: /tutores ============
  await page.goto(BASE + '/tutores')
  await page.waitForSelector('text=Tutores')
  await page.locator('input[placeholder*="Buscar"]').fill('TUTOR TESTE')
  await page.waitForTimeout(2500)
  await shot(page, 'rt-01-busca-tutor')

  await page.locator('text=TUTOR TESTE MANUAL PV').first().click()
  await page.waitForSelector('text=Enviar nova contratação')
  await shot(page, 'rt-02-cadastro-tutor')

  await page.locator('text=Enviar nova contratação').click()
  await page.waitForSelector('text=Link de nova contratação')
  await shot(page, 'rt-03-link-nova-contratacao')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(500)

  await page.locator('text=Histórico de Contratos').scrollIntoViewIfNeeded()
  await shot(page, 'rt-04-historico-contratos')

  await browser.close()
  console.log('FIM — prints em', OUT)
})().catch(async err => {
  console.error('ERRO:', err.message)
  try {
    const pages = (global.__lastPage ? [global.__lastPage] : [])
    if (pages[0]) await pages[0].screenshot({ path: path.join(OUT, 'ERRO.png') })
  } catch {}
  process.exit(1)
})
