import { auditApprovalTrace, type ApprovalEvent, type AuditReport } from 'tool-approval-correlation-audit';
const events: readonly ApprovalEvent[] = [{ type: 'call', scope: 's', callId: 'c' }] as const;
const result: AuditReport = auditApprovalTrace(events, {traceEnd:'partial'});
const consistent: boolean = result.consistent;
void consistent;
// @ts-expect-error output is readonly
result.counts.calls = 3;
// @ts-expect-error decisions are fixed labels
const invalid: ApprovalEvent = {type:'decision',scope:'s',approvalId:'a',decision:'yes'};
void invalid;
