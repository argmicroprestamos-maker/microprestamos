const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const vm = require('node:vm');

const workflow = JSON.parse(fs.readFileSync('n8n/workflows/whatsapp-intake-production.json', 'utf8'));
const adapterCode = workflow.nodes.find((node) => node.name === 'Adaptar y firmar').parameters.jsCode;
const noticeCode = workflow.nodes.find((node) => node.name === 'Preparar aviso de validacion').parameters.jsCode;

async function runAdapter(body, suppliedSecret = 'webhook-secret') {
  const context = {
    $json: { headers: { 'x-webhook-secret': suppliedSecret }, body },
    $env: {
      CUSTOM_WA_WEBHOOK_SECRET: 'webhook-secret',
      N8N_SHARED_SECRET: 'integration-secret',
    },
    Buffer,
    require,
  };
  return vm.runInNewContext(`(async () => { ${adapterCode} })()`, context);
}

async function runNotice(requestBody) {
  const context = {
    $: () => ({ first: () => ({ json: { requestBody } }) }),
  };
  return vm.runInNewContext(`(async () => { ${noticeCode} })()`, context);
}

(async () => {
  const textResult = await runAdapter({ message: { id: 'm-1', from: '5491100000000', type: 'text', text: 'hola' } });
  assert.equal(textResult[0].json.requestBody.message_type, 'text');
  assert.equal(textResult[0].json.requestBody.text, 'hola');
  assert.match(textResult[0].json.headers.signature, /^[a-f0-9]{64}$/);

  const fileResult = await runAdapter({ data: { message_id: 'm-2', sender: '5491100000000', type: 'file', file: { file_id: 'file-7', base64: 'cGRm', mimetype: 'application/pdf', filename: 'cbu.pdf', analysis_base64: '/9g=', analysis_mime_type: 'image/jpeg', analysis_file_name: 'cbu-vista.jpg', analysis_page_count: 2 } } });
  assert.equal(fileResult[0].json.requestBody.message_type, 'document');
  assert.equal(fileResult[0].json.requestBody.media_id, 'file-7');
  assert.equal(fileResult[0].json.requestBody.file_name, 'cbu.pdf');
  assert.equal(fileResult[0].json.requestBody.media_base64, 'cGRm');
  assert.equal(fileResult[0].json.requestBody.analysis_media_base64, '/9g=');
  assert.equal(fileResult[0].json.requestBody.analysis_mime_type, 'image/jpeg');
  assert.equal(fileResult[0].json.requestBody.analysis_page_count, 2);

  const noticeResult = await runNotice({ wa_id: '5491100000000', reply_to: '123@lid', message_id: 'm-2', message_type: 'image' });
  const noticeBody = JSON.parse(noticeResult[0].json.rawBody);
  assert.equal(noticeBody.to, '123@lid');
  assert.match(noticeBody.text, /archivo.+momento.+valido/i);
  assert.equal(noticeBody.idempotency_key, 'processing:m-2');

  const audioResult = await runAdapter({ id: 'm-3', phone: '5491100000000', type: 'audio', audio: 'http://api.local/media/m-3' });
  assert.equal(audioResult[0].json.requestBody.message_type, 'unknown');
  assert.equal(audioResult[0].json.requestBody.provider_message_type, 'audio');
  assert.equal(audioResult[0].json.requestBody.media_id, 'http://api.local/media/m-3');

  await assert.rejects(() => runAdapter({ id: 'm-4', from: '5491100000000', type: 'text', text: 'hola' }, 'wrong-secret'), /no autorizado/);
  console.log('custom WhatsApp adapter: 5 tests passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
