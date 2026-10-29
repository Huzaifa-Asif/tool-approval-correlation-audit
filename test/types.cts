import audit = require('tool-approval-correlation-audit');
const report: audit.AuditReport = audit.auditApprovalTrace([{ type: 'call', scope: 's', callId: 'c' }]);
const ok: boolean = report.consistent;
void ok;
// @ts-expect-error invalid decisions rejected
audit.auditApprovalTrace([{type:'decision',scope:'s',approvalId:'a',decision:'yes'}]);
// @ts-expect-error immutable result
report.counts.calls = 8;
