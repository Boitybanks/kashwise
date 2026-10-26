import { chromium } from '@playwright/test'
import { join } from 'node:path'
import { copyFileSync } from 'node:fs'

async function exportPdf() {
  console.log('Launching Chromium to render PDF slide deck...')
  const browser = await chromium.launch()
  const page = await browser.newPage()
  
  const htmlPath = join(process.cwd(), 'kashwise-deck-printable.html')
  await page.goto(`file:///${htmlPath.replace(/\\/g, '/')}`)
  
  const outputPath = join(process.cwd(), 'kashwise-pitch-deck.pdf')
  await page.pdf({
    path: outputPath,
    printBackground: true,
    width: '16in',
    height: '9in',
  })
  
  await browser.close()
  console.log('✅ Generated PDF:', outputPath)
}

exportPdf().catch(console.error)

