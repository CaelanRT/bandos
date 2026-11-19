const { randomBytes, createCipheriv, createDecipheriv } = require('node:crypto');
const { z } = require('zod');

// The provider request has only these fixed fields. Preserve byte order when
// PostgreSQL JSONB returns the frozen object's keys in a different order.
function serializeMail(payload) {
  const { from, to, subject, text, html } = payload;
  return JSON.stringify({ from, to, subject, text, html });
}

// Tokens and frozen security requests are never stored in ordinary JSON columns.
function encrypt(value, key) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return Buffer.concat([nonce, cipher.getAuthTag(), ciphertext]);
}
function decrypt(value, key) {
  const cipher = createDecipheriv('aes-256-gcm', key, value.subarray(0, 12));
  cipher.setAuthTag(value.subarray(12, 28));
  return JSON.parse(Buffer.concat([cipher.update(value.subarray(28)), cipher.final()]).toString('utf8'));
}
const contentSchema = z.strictObject({
  subject: z.string().min(1).max(200).regex(/^[^\r\n]*$/),
  text: z.string().max(20000), path: z.string().max(2000).optional(),
});
function escapeHtml(value) {
  return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}
function render(payload, { origin, from, address, token }) {
  const content = contentSchema.parse(payload);
  let link;
  if (content.path) {
    if (!content.path.startsWith('/') || content.path.startsWith('//') || /[\\\r\n]/.test(content.path)) throw new Error('Invalid application path');
    link = new URL(content.path, origin);
    if (link.origin !== origin || link.username || link.password) throw new Error('Invalid application origin');
    if (token) link.searchParams.set('token', token);
  } else if (token) throw new Error('Token requires application path');
  return { from, to: [address], subject: content.subject,
    text: content.text + (link ? `\n\n${link.href}` : ''),
    html: `<p>${escapeHtml(content.text).replaceAll('\n', '<br>')}</p>`
      + (link ? `<p><a href="${escapeHtml(link.href)}">Open bandOS</a></p>` : '') };
}

// Only sanitized classes/timing escape the adapter; provider bodies may contain PII.
function createResendAdapter(apiKey, fetcher = fetch) {
  return { async send(payload, key) {
    try {
      const response = await fetcher('https://api.resend.com/emails', {
        method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': key },
        body: serializeMail(payload), signal: AbortSignal.timeout(10000),
      });
      if (response.ok) {
        const body = await response.json();
        if (typeof body.id === 'string' && /^[a-zA-Z0-9_-]{1,200}$/.test(body.id)) return { status: 'accepted', id: body.id };
        return { status: 'transient' };
      }
      const retry = response.headers.get('retry-after');
      const seconds = Number(retry);
      const retryAt = retry ? (Number.isFinite(seconds) ? Date.now() + Math.max(0, seconds) * 1000 : Date.parse(retry)) : undefined;
      return { status: [400, 404, 413, 422].includes(response.status) ? 'permanent' : 'transient', retryAt };
    } catch {
      return { status: 'transient' };
    }
  } };
}
module.exports = { encrypt, decrypt, render, contentSchema, serializeMail, createResendAdapter };
