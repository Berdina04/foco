// Prueba el pedido a la IA contra un servidor falso local (no gasta ni necesita una key real).
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const PLAN = {
  working_on: 'Escribir la intro del informe',
  likely_block: 'No sabe cómo arrancar el primer párrafo',
  question: '¿Te trabaste con la intro?',
  flow: 'stuck',
  reflection: 'Arrancar es lo más difícil.',
  strategies: [
    { title: 'a', how: 'b' },
    { title: 'c', how: 'd' },
    { title: 'e', how: 'f' },
    { title: 'g', how: 'h' },
  ],
  micro_step: 'Escribir 3 bullets',
  sprint_minutes: 12,
  reward_idea: 'Un café',
};

function fakeServer(respond) {
  const seen = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      seen.push({ url: req.url, headers: req.headers, body: JSON.parse(body) });
      const [status, payload] = respond();
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(payload));
    });
  });
  return new Promise((resolve) => server.listen(0, () => resolve({ server, seen, port: server.address().port })));
}

const message = (text, stop_reason = 'end_turn') => ({
  id: 'msg_1',
  type: 'message',
  role: 'assistant',
  model: 'claude-opus-5-5',
  content: [{ type: 'text', text }],
  stop_reason,
  stop_details: null,
  usage: { input_tokens: 10, output_tokens: 10 },
});

async function withServer(respond, fn) {
  const { server, seen, port } = await fakeServer(respond);
  const prev = process.env.ANTHROPIC_BASE_URL;
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${port}`;
  delete require.cache[require.resolve('../src/ai-coach')];
  try {
    await fn(require('../src/ai-coach'), seen);
  } finally {
    process.env.ANTHROPIC_BASE_URL = prev;
    if (prev === undefined) delete process.env.ANTHROPIC_BASE_URL;
    server.close();
  }
}

test('ia: manda capturas, formato JSON y fallback, y lee el plan', async () => {
  await withServer(
    () => [200, message(JSON.stringify(PLAN))],
    async ({ aiCoach }, seen) => {
      const res = await aiCoach({
        apiKey: 'sk-ant-falsa',
        input: { trigger: { type: 'site', label: 'instagram.com' }, workSummary: ['Docs — Informe'] },
        images: [Buffer.from('jpeg-falso')],
      });
      assert.equal(res.error, undefined);
      assert.equal(res.plan.working_on, PLAN.working_on);
      assert.equal(res.plan.strategies.length, 3);
      assert.equal(res.plan.sprint_minutes, 15); // 12 no es válido → 15

      const req = seen[0];
      assert.match(req.url, /\/v1\/messages/);
      assert.match(req.headers['anthropic-beta'], /server-side-fallback-2026-07-01/);
      assert.equal(req.body.model, 'claude-opus-5-5');
      assert.equal(req.body.fallbacks, 'default');
      assert.equal(req.body.output_config.format.type, 'json_schema');
      assert.equal(req.body.output_config.effort, 'low');
      const blocks = req.body.messages[0].content;
      const img = blocks.find((b) => b.type === 'image');
      assert.equal(img.source.media_type, 'image/jpeg');
      assert.equal(img.source.data, Buffer.from('jpeg-falso').toString('base64'));
      assert.match(blocks.at(-1).text, /instagram\.com/);
    }
  );
});

test('ia: sin fallback en modelos que no lo aceptan', async () => {
  await withServer(
    () => [200, message(JSON.stringify(PLAN))],
    async ({ aiCoach }, seen) => {
      await aiCoach({ apiKey: 'sk-ant-falsa', model: 'claude-haiku-5-5', input: {} });
      assert.equal(seen[0].body.fallbacks, undefined);
      assert.doesNotMatch(seen[0].headers['anthropic-beta'] || '', /fallback/);
    }
  );
});

test('ia: errores con mensajes claros', async () => {
  await withServer(
    () => [401, { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }],
    async ({ aiCoach }) => {
      const res = await aiCoach({ apiKey: 'sk-ant-falsa', input: {} });
      assert.equal(res.error, 'La API key no es válida.');
    }
  );
  await withServer(
    () => [200, message('', 'refusal')],
    async ({ aiCoach }) => {
      const res = await aiCoach({ apiKey: 'sk-ant-falsa', input: {} });
      assert.equal(res.error, 'La IA no pudo responder esta vez.');
    }
  );
});
