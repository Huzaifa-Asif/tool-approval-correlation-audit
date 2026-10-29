import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { auditApprovalTrace as audit } from '../src/index.js';
const require = createRequire(import.meta.url);
const call = (callId = 'c', scope = 's') => ({ type: 'call', scope, callId });
const request = (approvalId = 'a', callId = 'c', scope = 's') => ({ type: 'request', scope, callId, approvalId });
const decision = (value = 'approved', approvalId = 'a', scope = 's') => ({ type: 'decision', scope, approvalId, decision: value });
const execution = (approvalId = 'a', callId = 'c', scope = 's') => ({ type: 'execution', scope, callId, approvalId });
const good = () => [call(), request(), decision(), execution()];
const codes = report => report.findings.map(f => f.code);

test('complete correlation and denied-without-execution', () => {
  const r = audit(good()); assert.equal(r.consistent, true); assert.equal(r.complete, true); assert.deepEqual(r.findings, []);
  assert.equal(audit([call(), request(), decision('denied')]).consistent, true);
});
test('empty complete trace has no declared operations', () => assert.equal(audit([]).consistent, true));
test('partial traces cannot be consistent even without findings', () => {
  assert.equal(audit(good(), { traceStart: 'partial' }).consistent, false);
  const r = audit([call(), request()], { traceEnd: 'partial' });
  assert.equal(r.complete, false); assert.equal(r.counts.unresolved, 1); assert.deepEqual(r.findings, []);
});
test('pending complete end is unresolved', () => assert.ok(codes(audit([call(), request()])).includes('unresolved-request')));
test('request before call stays ambiguous after later call', () => {
  const r = audit([request(), call(), decision(), execution()]); assert.deepEqual(codes(r), ['unknown-call', 'ambiguous-approval']);
});
test('decision before request is not applied later', () => {
  const r = audit([call(), decision(), request(), execution()]); assert.ok(codes(r).includes('decision-without-request')); assert.ok(codes(r).includes('execution-before-decision'));
});
test('execution before decision is never healed', () => {
  const r = audit([call(), request(), execution(), decision()]); assert.ok(codes(r).includes('execution-before-decision')); assert.equal(r.consistent, false);
});
test('parallel interleaving and earlier request ID work', () => {
  assert.equal(audit([call(), request(), call('d'), request('b','d'), decision('approved','b'), execution('b','d'), decision(), execution()]).consistent, true);
});
test('same IDs across scopes remain independent', () => {
  assert.equal(audit([...good(), ...good().map(e => ({ ...e, scope: 'other' }))]).consistent, true);
});
test('prototype-shaped opaque IDs are ordinary map keys', () => {
  assert.equal(audit([call('__proto__','constructor'), request('toString','__proto__','constructor'), decision('approved','toString','constructor'), execution('toString','__proto__','constructor')]).consistent, true);
});
test('duplicate call taints prior and future requests', () => {
  const a = audit([call(), request(), call(), decision(), execution()]); assert.ok(codes(a).includes('ambiguous-approval'));
  const b = audit([call(),call(),request()]); assert.ok(codes(b).includes('ambiguous-call'));
});
test('duplicate request and approval rebind cannot overwrite', () => {
  assert.ok(codes(audit([call(), request(), request(), decision(), execution()])).includes('duplicate-request'));
  const r = audit([call(),call('d'),request(),request('a','d'),decision(),execution('a','d')]);
  assert.ok(codes(r).includes('approval-rebound')); assert.ok(codes(r).includes('execution-call-mismatch'));
});
test('duplicate decisions are diagnostics and conflicting denial never upgrades', () => {
  assert.ok(codes(audit([call(),request(),decision(),decision()])).includes('duplicate-decision'));
  const r = audit([call(),request(),decision('denied'),decision(),execution()]);
  assert.ok(codes(r).includes('conflicting-decision')); assert.ok(codes(r).includes('execution-after-denial')); assert.ok(codes(r).includes('ambiguous-approval'));
});
test('execution missing request, wrong call, unknown call and repeat', () => {
  assert.deepEqual(codes(audit([call(),execution()])), ['execution-without-request']);
  const r = audit([call(),request(),decision(),execution('a','missing')]);
  assert.ok(codes(r).includes('unknown-call')); assert.ok(codes(r).includes('execution-call-mismatch'));
  assert.ok(codes(audit([...good(),execution()])).includes('duplicate-execution'));
});
test('invalid types and missing identifiers are bounded invalid evidence', () => {
  for (const event of [null, [], 1, {}, {...call(),scope:''}, {...call(),callId:0}, {...request(),approvalId:null}, {...decision(),decision:'yes'}, {...call(),type:'result'}]) {
    const r = audit([event]); assert.equal(r.complete,false); assert.deepEqual(codes(r),['invalid-event']);
  }
});
test('non-array and revoked array proxy do not throw', () => {
  for (const value of [null, {}, 'trace', new Set()]) assert.deepEqual(codes(audit(value)), ['invalid-trace']);
  const { proxy, revoke } = Proxy.revocable([], {}); revoke(); assert.deepEqual(codes(audit(proxy)), ['invalid-trace']);
});
test('sparse and throwing array access are invalid evidence', () => {
  const a = new Proxy([call()], { get(target,key) { if(key==='0') throw new Error('secret'); return Reflect.get(target,key); } });
  assert.deepEqual(codes(audit(a)), ['invalid-event']);
  assert.equal(audit(new Array(2)).counts.issues, 2);
});
test('throwing fields return fixed diagnostics without secret echo', () => {
  const raw = { get type() { throw new Error('private payload'); } };
  assert.equal(JSON.stringify(audit([raw])).includes('private'), false);
  assert.deepEqual(codes(audit([raw])), ['invalid-event']);
});
test('each required field is read once; unrelated arguments never accessed', () => {
  const n = {};
  const e = new Proxy(request(), { get(t,k) { n[k]=(n[k]??0)+1; if(n[k]>1) throw new Error('second read');return t[k]; } });
  Object.defineProperty(e,'arguments',{ get(){ throw new Error('must not read'); } });
  assert.equal(audit([call(),e,decision(),execution()]).consistent,true);
  assert.deepEqual(n,{type:1,scope:1,callId:1,approvalId:1});
});
test('event limit limits reads and marks evidence incomplete', () => {
  const a = [call(), request()]; Object.defineProperty(a,1,{get(){throw new Error('should not read');}});
  const r = audit(a,{maxEvents:1}); assert.deepEqual(codes(r),['event-limit']); assert.equal(r.counts.observed,1); assert.equal(r.complete,false);
});
test('identity cap counts scopes, calls and approvals without unbounded retention', () => {
  assert.ok(codes(audit(good(),{maxIdentities:1})).includes('identity-limit'));
  assert.ok(codes(audit(good(),{maxIdentities:2})).includes('identity-limit'));
  assert.equal(audit(good(),{maxIdentities:3}).consistent,true);
  const r = audit([call('x','a'),call('y','b')],{maxIdentities:2}); assert.equal(r.counts.identities,2);assert.ok(codes(r).includes('identity-limit'));
});
test('ID cap includes scope and does not echo values', () => {
  const secret = 'sensitive-data'; const r = audit([call(secret)],{maxIdLength:1}); assert.equal(r.complete,false);assert.equal(JSON.stringify(r).includes(secret),false);
});
test('findings cap preserves total issue count and marks truncation', () => {
  const r = audit([{}, {}, {}],{maxFindings:1}); assert.equal(r.findings.length,1); assert.equal(r.counts.issues,3); assert.equal(r.findingsTruncated,true);
});
test('options reject invalid bounds, inaccessible getters and invalid modes', () => {
  for (const opts of [null,[],1,{maxEvents:0},{maxEvents:100001},{maxIdentities:Infinity},{maxIdLength:1.2},{maxFindings:-1},{traceStart:'maybe'},{traceEnd:'yes'}, {get maxEvents(){throw new Error('secret');}}]) assert.throws(()=>audit([],opts), /^TypeError: Invalid audit options$/);
});
test('results are deeply immutable, inputs untouched and runs deterministic', () => {
  const events = good().map(Object.freeze); Object.freeze(events); const a=audit(events);assert.deepEqual(a,audit(events));
  assert.ok(Object.isFrozen(a)); assert.ok(Object.isFrozen(a.counts));assert.ok(Object.isFrozen(a.findings));
  const b = audit([{}]);assert.ok(Object.isFrozen(b.findings[0]));assert.throws(()=>{a.counts.calls=8;});
});
test('ESM and CommonJS produce equivalent reports', () => assert.deepEqual(audit(good()), require('../src/index.cjs').auditApprovalTrace(good())));

test('all 24 single-call permutations accept only causally ordered observations', () => {
  const permute = values => values.length ? values.flatMap((value, i) => permute(values.filter((_, j) => i !== j)).map(rest => [value, ...rest])) : [[]];
  let consistent = 0;
  for (const trace of permute(good())) if (audit(trace).consistent) consistent++;
  assert.equal(consistent, 1);
});
test('all 70 order-preserving interleavings of two parallel calls are consistent', () => {
  const interleave = (a, b) => !a.length ? [b] : !b.length ? [a] : [
    ...interleave(a.slice(1), b).map(rest => [a[0], ...rest]),
    ...interleave(a, b.slice(1)).map(rest => [b[0], ...rest])
  ];
  const other = [call('d'), request('b', 'd'), decision('approved', 'b'), execution('b', 'd')];
  const traces = interleave(good(), other);
  assert.equal(traces.length, 70);
  for (const trace of traces) assert.equal(audit(trace).consistent, true);
});

test('invalid proxy lengths never escape or coerce attacker values', () => {
  for (const length of [1n, Symbol('secret'), -1, NaN, Infinity, { valueOf() { throw new Error('secret'); } }]) {
    const trace = new Proxy([], { get(target, key) { return key === 'length' ? length : Reflect.get(target, key); } });
    const r = audit(trace);
    assert.deepEqual(codes(r), ['invalid-trace']);
    assert.equal(r.counts.observed, 0);
    assert.equal(r.complete, false);
  }
});
test('one call executed twice through different approval IDs remains duplicate', () => {
  const r = audit([...good(), request('second'), decision('approved', 'second'), execution('second')]);
  assert.equal(r.consistent, false);
  assert.deepEqual(r.findings, [{code:'duplicate-execution', index:6, relatedIndex:3}]);
});
