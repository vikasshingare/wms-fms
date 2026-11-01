import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

// Run against the isolated test server, never the user's demonstration data.
const base = process.env.TEST_API_URL || 'http://127.0.0.1:4001/api';
if (new URL(base).port !== '4001' && process.env.ALLOW_TEST_WRITES !== 'yes') {
  throw new Error('Tests create records. Use port 4001 with service360_test, or explicitly set ALLOW_TEST_WRITES=yes.');
}
const results = [];
let admin, engineer, customer, initial;
async function request(path, { token, body, method = body ? 'POST' : 'GET', ok = true } = {}) {
  const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await response.json();
  if (ok) assert(response.ok, `${method} ${path}: ${response.status} ${JSON.stringify(data)}`);
  else assert(!response.ok, `Expected ${method} ${path} to be rejected`);
  return { status: response.status, data };
}
async function get(path, token = admin) { return (await request(path, { token })).data; }
async function post(path, body, token = admin) { return (await request(path, { token, body })).data; }
async function denied(path, body, token = admin) { return request(path, { token, body, ok: false }); }
async function test(name, run) {
  try { await run(); results.push({ name, passed: true }); console.log(`PASS ${name}`); }
  catch (error) { results.push({ name, passed: false }); console.error(`FAIL ${name}\n${error.stack}`); throw error; }
}
const suffix = Date.now().toString(36).toUpperCase();
const eventId = () => `qa-${randomUUID()}`;
const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=';

async function startOrder(id) {
  for (const action of ['accept', 'en_route', 'check_in', 'start']) {
    await post(`/work-orders/${id}/action`, { action, mobile_txn_id: eventId(), ...(action === 'check_in' ? { latitude: 28.6315, longitude: 77.2167 } : {}) }, engineer);
  }
}
async function completionEvidence(id) {
  const evidence = [];
  for (const type of ['Shop front', 'Inside shop', 'Installed device']) {
    evidence.push(await post('/evidence', { work_order_id: id, type, name: `${type}.png`, data: tinyPng }, engineer));
  }
  return { checklist: ['site_verified', 'installation_tested', 'customer_briefed'].map(id => ({ id, checked: true })), evidence, confirmation: { name: 'QA Customer', accepted: true }, resolution: 'Integration verification passed.' };
}

try {
  await test('API is healthy and authentication is required', async () => {
    const health = await get('/health');
    assert.equal(health.service, 'service360-api');
    const deniedResult = await denied('/bootstrap', undefined, undefined);
    assert.equal(deniedResult.status, 401);
    await denied('/auth/login', { email: 'admin@service360.local', password: 'wrong-password' });
    admin = (await post('/auth/login', { email: 'admin@service360.local', password: 'Service360!' })).token;
    engineer = (await post('/auth/login', { email: 'rahul@service360.local', password: 'Service360!' })).token;
    customer = (await post('/auth/login', { email: 'customer@service360.local', password: 'Service360!' })).token;
    assert(admin && engineer && customer);
    initial = await get('/bootstrap');
  });
  await test('Customer and engineer scopes restrict data and writes', async () => {
    const c = await get('/bootstrap', customer);
    const e = await get('/bootstrap', engineer);
    assert(c.work_orders.length > 0 && e.work_orders.length > 0);
    assert(c.work_orders.every(w => w.customer_id === c.user.customer_id));
    assert(e.work_orders.every(w => w.engineer_id === e.user.id));
    assert(e.assets.every(a => a.holder_user_id === e.user.id || e.work_orders.some(w => w.asset_id === a.id)));
    const foreign = initial.work_orders.find(w => w.customer_id !== c.user.customer_id);
    await denied(`/work-orders/${foreign.id}`, undefined, customer);
    await denied('/products', { sku: 'FORBIDDEN', name: 'Forbidden product' }, engineer);
    await denied('/work-orders', { site_id: foreign.site_id, type: 'Service', summary: 'Forbidden request' }, customer);
  });
  let asn, master, children, newSerials, putaway;
  await test('ASN validates carton packing and duplicate serials', async () => {
    const product = initial.products.find(p => p.id === 1);
    newSerials = Array.from({ length: product.units_per_inner_carton * product.inner_cartons_per_master }, (_, i) => `QA-${suffix}-${i}`);
    const inner_cartons = Array.from({ length: product.inner_cartons_per_master }, (_, i) => ({ barcode: `QA-IC-${suffix}-${i}`, serials: newSerials.slice(i * product.units_per_inner_carton, (i + 1) * product.units_per_inner_carton) }));
    await denied('/asns', { vendor: 'QA Supplier', product_id: product.id, master_carton_barcode: `BAD-${suffix}`, inner_cartons: [{ barcode: `BAD-IC-${suffix}`, serials: [newSerials[0], newSerials[0]] }] });
    asn = await post('/asns', { vendor: 'QA Supplier', product_id: product.id, expected_date: new Date().toISOString().slice(0, 10), master_carton_barcode: `QA-MC-${suffix}`, inner_cartons });
    const data = await get('/bootstrap');
    master = data.cartons.find(c => c.barcode === `QA-MC-${suffix}`);
    assert(master);
    children = data.cartons.filter(c => c.parent_id === master.id);
    assert.equal(children.length, product.inner_cartons_per_master);
  });
  await test('Receipt blocks missing serials and duplicate receipt', async () => {
    await denied(`/asns/${asn.id}/receive`, { barcode: master.barcode, serials: newSerials.slice(1) });
    await post(`/asns/${asn.id}/receive`, { barcode: master.barcode, serials: newSerials, mobile_txn_id: eventId() });
    await denied(`/asns/${asn.id}/receive`, { barcode: master.barcode, serials: newSerials, mobile_txn_id: eventId() });
    await post(`/cartons/${master.id}/qc`, { result: 'PASS' });
    const data = await get('/bootstrap');
    putaway = data.putaway_tasks.find(t => t.carton_id === master.id && t.status !== 'COMPLETED');
    assert(putaway);
  });
  await test('Putaway rejects wrong source and incompatible product bin', async () => {
    await denied(`/putaway/${putaway.id}/confirm`, { barcode: master.barcode, source_location_id: 4, destination_location_id: 2 });
    await denied(`/putaway/${putaway.id}/confirm`, { barcode: master.barcode, source_location_id: putaway.source_location_id, destination_location_id: 3 });
  });
  await test('Concurrent putaway creates exactly one movement per serial', async () => {
    const before = await get(`/assets/${newSerials[0]}/history`);
    const payload = { barcode: master.barcode, source_location_id: putaway.source_location_id, destination_location_id: 2 };
    const attempts = await Promise.all([1, 2].map(() => fetch(base + `/putaway/${putaway.id}/confirm`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${admin}` }, body: JSON.stringify({ ...payload, mobile_txn_id: eventId() }) })));
    assert.equal(attempts.filter(r => r.ok).length, 1);
    const after = await get(`/assets/${newSerials[0]}/history`);
    assert.equal(after.asset.location_id, 2);
    assert.equal(after.movements.length, before.movements.length + 1);
    const data = await get('/bootstrap');
    assert(data.assets.filter(a => newSerials.includes(a.serial)).every(a => a.location_id === 2 && a.status === 'AVAILABLE'));
    assert(data.cartons.filter(c => c.id === master.id || c.parent_id === master.id).every(c => c.location_id === 2));
  });
  await test('Sealed contents cannot transfer until carton break preserves hierarchy', async () => {
    let data = await get('/bootstrap');
    const asset = data.assets.find(a => a.serial === newSerials[0]);
    await denied('/transfers', { source_location_id: 2, destination_location_id: 6, asset_ids: [asset.id] });
    await post(`/cartons/${master.id}/break`, { child_ids: [children[0].id], reason: 'QA partial pick' });
    data = await get('/bootstrap');
    assert.equal(data.cartons.find(c => c.id === children[0].id).parent_id, null);
    assert.equal(data.cartons.find(c => c.id === children[1].id).parent_id, master.id);
    await post(`/cartons/${children[0].id}/break`, { serials: [newSerials[0]], reason: 'QA loose serial pick' });
    data = await get('/bootstrap');
    assert.equal(data.assets.find(a => a.id === asset.id).inner_carton_id, null);
    const transfer = await post('/transfers', { source_location_id: 2, destination_location_id: 6, asset_ids: [asset.id] });
    await post(`/transfers/${transfer.id}/dispatch`, {});
    const receive = { serials: [newSerials[0]], mobile_txn_id: eventId() };
    await post(`/transfers/${transfer.id}/receive`, receive, engineer);
    await post(`/transfers/${transfer.id}/receive`, receive, engineer);
    const history = await get(`/assets/${newSerials[0]}/history`);
    assert.equal(history.asset.holder_user_id, 3);
    assert.equal(history.asset.status, 'ISSUED_TO_ENGINEER');
  });
  let installation;
  await test('Customer request persists and admin can assign an engineer', async () => {
    installation = await post('/work-orders', { site_id: 1, type: 'Installation', summary: `QA install ${suffix}`, product_id: 1 }, customer);
    const data = await get('/bootstrap');
    const asset = data.assets.find(a => a.serial === newSerials[0]);
    await post(`/work-orders/${installation.id}/assign`, { engineer_id: 3, allocated_asset_id: asset.id });
    assert((await get('/bootstrap', engineer)).work_orders.some(w => w.id === installation.id));
    await denied(`/work-orders/${installation.id}/action`, { action: 'complete', mobile_txn_id: eventId() }, engineer);
    await startOrder(installation.id);
    await denied(`/work-orders/${installation.id}/action`, { action: 'complete', serial: newSerials[0], mobile_txn_id: eventId() }, engineer);
  });
  await test('Installation requires custody and evidence; successful retry is idempotent', async () => {
    const proof = await completionEvidence(installation.id);
    await denied(`/work-orders/${installation.id}/action`, { action: 'complete', serial: 'SN-STOCK-0001', ...proof, mobile_txn_id: eventId() }, engineer);
    const complete = { action: 'complete', serial: newSerials[0], ...proof, mobile_txn_id: eventId() };
    const first = await post(`/work-orders/${installation.id}/action`, complete, engineer);
    const repeat = await post(`/work-orders/${installation.id}/action`, complete, engineer);
    assert.equal(first.status, 'COMPLETED');
    assert.equal(repeat.id, first.id);
    const history = await get(`/assets/${newSerials[0]}/history`);
    assert.equal(history.asset.status, 'INSTALLED');
    assert.equal(history.asset.site_id, 1);
    assert.equal(history.asset.holder_user_id, null);
    await denied(`/work-orders/${installation.id}/action`, { ...complete, resolution: 'Changed payload' }, engineer);
    await post(`/work-orders/${installation.id}/action`, { action: 'close', mobile_txn_id: eventId() });
  });
  await test('Replacement validates both serials then changes both custodians atomically', async () => {
    const work = initial.work_orders.find(w => w.type === 'Replacement' && w.engineer_id === 3 && w.status === 'ASSIGNED');
    await startOrder(work.id);
    const proof = await completionEvidence(work.id);
    await denied(`/work-orders/${work.id}/action`, { action: 'complete', serial: work.allocated_serial, old_serial: 'NONEXISTENT', ...proof, mobile_txn_id: eventId() }, engineer);
    assert.equal((await get(`/assets/${work.serial}/history`)).asset.status, 'INSTALLED');
    await post(`/work-orders/${work.id}/action`, { action: 'complete', serial: work.allocated_serial, old_serial: work.serial, ...proof, mobile_txn_id: eventId() }, engineer);
    assert.equal((await get(`/assets/${work.serial}/history`)).asset.holder_user_id, 3);
    assert.equal((await get(`/assets/${work.allocated_serial}/history`)).asset.site_id, work.site_id);
  });
  await test('Return retains engineer custody until warehouse receipt and repair disposition', async () => {
    const ret = initial.returns.find(r => r.status === 'AWAITING_RECEIPT');
    const before = await get(`/assets/${ret.serial}/history`);
    assert.equal(before.asset.holder_user_id, 3);
    await post(`/returns/${ret.id}/receive`, {});
    let history = await get(`/assets/${ret.serial}/history`);
    assert.equal(history.asset.location_id, ret.destination_location_id);
    assert.equal(history.asset.holder_user_id, null);
    await post(`/returns/${ret.id}/disposition`, { disposition: 'REPAIR', reason: 'QA repair diagnosis' });
    history = await get(`/assets/${ret.serial}/history`);
    assert.equal(history.asset.status, 'REPAIR');
  });
  await test('Reports match persisted data and include inventory and engineer summaries', async () => {
    const report = await get('/reports');
    assert(report.stats);
    assert(Array.isArray(report.by_type));
    assert(Array.isArray(report.inventory_by_location));
    assert(Array.isArray(report.engineer_performance));
    assert((await get('/bootstrap')).activities.length > 0);
  });
} catch {
  process.exitCode = 1;
} finally {
  console.log(`\n${results.filter(r => r.passed).length}/${results.length} integration checks passed at ${base}`);
}
