import { spawn } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

let token = process.env.NETLIFY_AUTH_TOKEN

if (!token && existsSync('.env.local')) {
  const envContent = readFileSync('.env.local', 'utf8')
  const match = envContent.match(/NETLIFY_AUTH_TOKEN=([^\r\n]+)/)
  if (match) token = match[1].trim()
}

const env = {
  ...process.env,
  CI: '1',
  NETLIFY_SKIP_TELEMETRY: '1',
  ...(token ? { NETLIFY_AUTH_TOKEN: token } : {}),
}

const netlifyCmd = process.platform === 'win32'
  ? join(process.env.APPDATA, 'npm', 'netlify.cmd')
  : 'netlify'

console.log('Deploying KashWise to Netlify site f8d681ec-ab68-4d61-8a9a-586be62127b7 (https://kashwise.netlify.app)...')

const args = [
  'deploy',
  '--prod',
  '--dir=dist',
  '--functions=netlify/functions',
  '--site=f8d681ec-ab68-4d61-8a9a-586be62127b7',
]

if (token) {
  args.push('--auth=' + token)
}

const proc = spawn(netlifyCmd, args, {
  stdio: ['ignore', 'inherit', 'inherit'],
  env,
  shell: true,
})

proc.on('close', (code) => {
  console.log('Deploy process exited with code', code)
  process.exit(code ?? 0)
})
