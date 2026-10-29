import { auditApprovalTrace } from '../src/index.js';
// Synthetic metadata only. Never provide arguments, approval tokens or personal data.
const trace = [
  { type: 'request', scope: 'run-1', callId: 'call-1', approvalId: 'approval-1' },
  { type: 'call', scope: 'run-1', callId: 'call-1' },
  { type: 'decision', scope: 'run-1', approvalId: 'approval-1', decision: 'approved' },
  { type: 'execution', scope: 'run-1', callId: 'call-1', approvalId: 'approval-1' }
];
const report = auditApprovalTrace(trace);
if (!report.findings.some(finding => finding.code === 'unknown-call')) throw new Error('Expected adapter ordering diagnostic');
console.log(JSON.stringify(report, null, 2));
