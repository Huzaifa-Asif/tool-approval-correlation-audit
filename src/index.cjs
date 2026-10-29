'use strict';

const DEFAULTS = Object.freeze({ maxEvents: 10000, maxIdentities: 10000, maxIdLength: 256, maxFindings: 1000 });
const CEILINGS = Object.freeze({ maxEvents: 100000, maxIdentities: 100000, maxIdLength: 4096, maxFindings: 10000 });

/** Audit caller-supplied observations, never authorize an operation. */
function auditApprovalTrace(events, options = {}) {
  let config;
  try {
    if (options === null || typeof options !== 'object' || Array.isArray(options)) throw 0;
    config = {};
    for (const key of Object.keys(DEFAULTS)) {
      const value = options[key];
      config[key] = value === undefined ? DEFAULTS[key] : value;
      if (!Number.isSafeInteger(config[key]) || config[key] < 1 || config[key] > CEILINGS[key]) throw 0;
    }
    for (const key of ['traceStart', 'traceEnd']) {
      const value = options[key];
      config[key] = value === undefined ? 'complete' : value;
      if (config[key] !== 'complete' && config[key] !== 'partial') throw 0;
    }
  } catch { throw new TypeError('Invalid audit options'); }

  const findings = [];
  const counts = { observed: 0, calls: 0, requests: 0, decisions: 0, executions: 0, identities: 0, unresolved: 0, issues: 0 };
  let complete = config.traceStart === 'complete' && config.traceEnd === 'complete';
  let findingsTruncated = false;
  const scopes = new Map();
  const issue = (code, index, relatedIndex) => {
    counts.issues++;
    if (findings.length < config.maxFindings) findings.push(Object.freeze(relatedIndex === undefined ? { code, index } : { code, index, relatedIndex }));
    else { findingsTruncated = true; complete = false; }
  };
  const id = value => typeof value === 'string' && value.length > 0 && value.length <= config.maxIdLength;
  const allocate = index => {
    if (counts.identities >= config.maxIdentities) { complete = false; issue('identity-limit', index); return false; }
    counts.identities++;
    return true;
  };
  let length = 0;
  try {
    if (!Array.isArray(events)) throw 0;
    const observedLength = events.length;
    if (!Number.isSafeInteger(observedLength) || observedLength < 0) throw 0;
    length = observedLength;
  } catch { complete = false; issue('invalid-trace', -1); }
  const readLength = Math.min(length, config.maxEvents);
  if (length > readLength) { complete = false; issue('event-limit', readLength); }
  for (let index = 0; index < readLength; index++) {
    counts.observed++;
    let event;
    try {
      const raw = events[index];
      if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) throw 0;
      const type = raw.type;
      const scope = raw.scope;
      if (!id(scope) || !['call', 'request', 'decision', 'execution'].includes(type)) throw 0;
      event = { type, scope };
      if (type !== 'decision') { event.callId = raw.callId; if (!id(event.callId)) throw 0; }
      if (type !== 'call') { event.approvalId = raw.approvalId; if (!id(event.approvalId)) throw 0; }
      if (type === 'decision') { event.decision = raw.decision; if (!['approved', 'denied'].includes(event.decision)) throw 0; }
    } catch { complete = false; issue('invalid-event', index); continue; }
    let scope = scopes.get(event.scope);
    if (!scope) {
      if (!allocate(index)) break;
      scope = { calls: new Map(), approvals: new Map() };
      scopes.set(event.scope, scope);
    }
    const call = scope.calls.get(event.callId);
    const approval = scope.approvals.get(event.approvalId);
    if (event.type === 'call') {
      counts.calls++;
      if (call) { call.tainted = true; issue('duplicate-call', index, call.index); }
      else {
        if (!allocate(index)) break;
        scope.calls.set(event.callId, { index, tainted: false, executions: 0, executionIndex: null });
      }
    } else if (event.type === 'request') {
      counts.requests++;
      if (approval) {
        approval.tainted = true;
        issue(approval.callId === event.callId ? 'duplicate-request' : 'approval-rebound', index, approval.index);
      } else {
        if (!allocate(index)) break;
        const missing = !call;
        if (missing) issue('unknown-call', index);
        if (call && call.tainted) issue('ambiguous-call', index, call.index);
        scope.approvals.set(event.approvalId, { index, callId: event.callId, tainted: missing || Boolean(call?.tainted), decision: null, decisionIndex: null, executions: 0 });
      }
    } else if (event.type === 'decision') {
      counts.decisions++;
      if (!approval) issue('decision-without-request', index);
      else if (approval.decision !== null) {
        approval.tainted = true;
        issue(approval.decision === event.decision ? 'duplicate-decision' : 'conflicting-decision', index, approval.decisionIndex);
      } else {
        approval.decision = event.decision;
        approval.decisionIndex = index;
      }
    } else {
      counts.executions++;
      const repeatedCall = Boolean(call && call.executions > 0);
      if (call) {
        if (repeatedCall) issue('duplicate-execution', index, call.executionIndex);
        else call.executionIndex = index;
        call.executions++;
      }
      if (!approval) { issue('execution-without-request', index); continue; }
      if (approval.callId !== event.callId) { approval.tainted = true; issue('execution-call-mismatch', index, approval.index); }
      if (!call) issue('unknown-call', index);
      if (approval.tainted || call?.tainted) issue('ambiguous-approval', index, approval.index);
      if (approval.decision === null) issue('execution-before-decision', index, approval.index);
      else if (approval.decision === 'denied') issue('execution-after-denial', index, approval.decisionIndex);
      if (approval.executions++ && !repeatedCall) issue('duplicate-execution', index, approval.index);
    }
  }
  for (const scope of scopes.values()) {
    for (const approval of scope.approvals.values()) {
      if (approval.decision === null) {
        counts.unresolved++;
        if (config.traceEnd === 'complete') issue('unresolved-request', approval.index);
      }
    }
  }
  return Object.freeze({ consistent: complete && counts.issues === 0, complete, findingsTruncated, counts: Object.freeze(counts), findings: Object.freeze(findings) });
}
module.exports = { auditApprovalTrace };
