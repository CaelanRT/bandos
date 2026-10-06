// Optional scripted browser smoke, using an operator-installed Playwright.
// No browser tooling is added to either application or production image.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { X509Certificate, createHash } from 'node:crypto'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const origin = process.env.VERIFY_ORIGIN
assert(origin?.startsWith('https://localhost:'), 'requires the disposable loopback TLS edge')
const cert = new X509Certificate(fs.readFileSync(process.env.VERIFY_CA))
const pin = createHash('sha256').update(cert.publicKey.export({ type: 'spki', format: 'der' })).digest('base64')
const browser = await chromium.launch({ headless: true,
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  args: [`--ignore-certificate-errors-spki-list=${pin}`] })
const context = await browser.newContext({ timezoneId: 'America/Toronto' })
const page = await context.newPage()
const errors = [], apiUrls = [], violations = []
context.on('page', p => {
  p.on('pageerror', error => errors.push(error.message))
  p.on('request', req => { if (req.url().includes('/api/v1')) apiUrls.push(req.url()) })
})
// Attach to the already-created page too.
page.on('pageerror', error => errors.push(error.message))
page.on('request', req => { if (req.url().includes('/api/v1')) apiUrls.push(req.url()) })
await context.addInitScript(() => {
  window.cspViolations = []
  document.addEventListener('securitypolicyviolation', event => window.cspViolations.push(event.violatedDirective))
})
page.on('console', message => { if (/Content Security Policy|violates.*directive/i.test(message.text())) violations.push(message.text()) })
const password = 'BrowserCheck123!'
const suffix = Date.now()
async function register(p, role) {
  await p.goto(`${origin}/register`)
  for (const [label, value] of [['First name', 'Browser'], ['Last name', role], ['Username', `browser_${role}_${suffix}`],
    ['Email', `browser_${role}_${suffix}@example.test`], ['Password', password]]) await p.getByLabel(label, { exact: true }).fill(value)
  await p.getByRole('button', { name: 'Create account', exact: true }).click()
  await p.waitForURL(origin + '/')
}
try {
  await register(page, 'leader')
  const cookies = await context.cookies()
  const cookie = cookies.find(c => c.name === 'bandos.sid')
  assert(cookie?.secure && cookie.httpOnly && cookie.sameSite === 'Lax')
  // Separate browser context so registering member cannot replace leader identity.
  const memberContext = await browser.newContext({ timezoneId: 'America/Toronto' })
  const memberPage = await memberContext.newPage()
  await register(memberPage, 'member')
  await page.goto(`${origin}/bands/new`)
  await page.getByLabel('Band name', { exact: true }).fill('Browser verification band')
  await page.getByRole('button', { name: 'Create band', exact: true }).click()
  await page.waitForURL(/\/bands\/\d+\/members$/)
  const bandUrl = page.url().replace(/\/members$/, '')
  await page.goto(`${bandUrl}/members`)
  await page.getByLabel('Add band member or user').fill(`browser_member_${suffix}`)
  await page.getByRole('button', { name: 'Add member', exact: true }).click()
  await page.getByText(`@browser_member_${suffix}`, { exact: true }).waitFor()
  await page.goto(`${bandUrl}/events/new`)
  await page.getByLabel('Name', { exact: true }).fill('Browser rehearsal')
  await page.getByLabel('Type', { exact: true }).selectOption('rehearsal')
  const date = new Date(Date.now() + 8 * 86400000).toISOString().slice(0, 10)
  await page.getByLabel('Date', { exact: true }).fill(date)
  await page.getByLabel('Start time', { exact: true }).fill('18:00')
  await page.getByLabel('End time', { exact: true }).fill('20:00')
  await page.getByLabel('Location', { exact: true }).fill('Browser studio')
  await page.getByRole('button', { name: 'Create event', exact: true }).click()
  await page.waitForURL(/\/events\/\d+$/)
  const eventUrl = page.url()
  await page.getByRole('heading', { name: 'Browser rehearsal', exact: true }).waitFor()
  await page.getByText('America/Toronto', { exact: true }).waitFor()
  assert.equal(await page.locator('time').first().getAttribute('datetime'), date)
  await page.reload()
  await page.getByRole('heading', { name: 'Browser rehearsal', exact: true }).waitFor()
  await memberPage.goto(bandUrl)
  await memberPage.getByText('Browser rehearsal', { exact: true }).waitFor()
  await memberPage.goto(eventUrl)
  await memberPage.getByRole('heading', { name: 'Browser rehearsal', exact: true }).waitFor()
  await page.goto(`${origin}/account`)
  await page.getByLabel('First name', { exact: true }).fill('Updated Browser')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.getByRole('status').filter({ hasText: /saved|updated/i }).waitFor()
  await page.reload()
  assert.equal(await page.getByLabel('First name', { exact: true }).inputValue(), 'Updated Browser')
  await page.getByRole('button', { name: 'Account menu', exact: true }).click()
  await page.getByRole('button', { name: /log out/i }).click()
  await page.waitForURL(/\/login/)
  await page.getByLabel('Email', { exact: true }).fill(`browser_leader_${suffix}@example.test`)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Log in', exact: true }).click()
  await page.waitForURL(origin + '/')
  await page.goto(`${origin}/account`)
  await page.getByRole('button', { name: 'Deactivate account', exact: true }).click()
  await page.getByLabel('Current password').fill(password)
  await page.getByRole('dialog').getByRole('button', { name: 'Deactivate account', exact: true }).click()
  await page.waitForURL(/\/login/)
  await page.goto(`${origin}/unknown-ui-route`)
  await page.getByRole('heading', { name: /not found/i }).waitFor()
  violations.push(...await page.evaluate(() => window.cspViolations))
  assert.deepEqual(errors, [])
  assert.deepEqual(violations, [])
  assert(apiUrls.length > 0 && apiUrls.every(url => url.startsWith(`${origin}/api/v1/`)))
  await memberContext.close()
  console.log('PASS Chromium HTTPS registration/login/restore/logout/update/deactivate, memberships, schedule/event timezone/deep-link refresh, cookie flags, CSP and same-origin API')
} finally { await browser.close() }
