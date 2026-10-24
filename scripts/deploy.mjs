import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const configPath = join(process.env.APPDATA, 'netlify', 'Config', 'config.json')
const cfg = JSON.parse(readFileSync(configPath, 'utf8'))
const token = cfg.users[cfg.userId]?.auth?.token

const env = {
  ...process.env,
  CI: '1',
  NETLIFY_SKIP_TELEMETRY: '1',
  NETLIFY_AUTH_TOKEN: token,
}

const netlifyCmd = process.platform === 'win32'
  ? join(process.env.APPDATA, 'npm', 'netlify.cmd')
  : 'netlify'

console.log('Deploying KashWise to Netlify (site 6a145d38-80a4-4a47-93d7-7357cf53e8aa)...')

const proc = spawn(netlifyCmd, [
  'deploy',
  '--prod',
  '--dir=dist',
  '--functions=netlify/functions',
  '--site=6a145d38-80a4-4a47-93d7-7357cf53e8aa'
], {
  stdio: 'inherit',
  env,
  shell: true,
})

proc.on('close', (code) => {
  console.log('Deploy process exited with code', code)
  process.exit(code ?? 0)
})
