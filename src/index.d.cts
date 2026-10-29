export type ApprovalEvent =
  | Readonly<{ type: 'call'; scope: string; callId: string }>
  | Readonly<{ type: 'request'; scope: string; callId: string; approvalId: string }>
  | Readonly<{ type: 'decision'; scope: string; approvalId: string; decision: 'approved' | 'denied' }>
  | Readonly<{ type: 'execution'; scope: string; callId: string; approvalId: string }>;
export interface AuditOptions {
  readonly maxEvents?: number;
  readonly maxIdentities?: number;
  readonly maxIdLength?: number;
  readonly maxFindings?: number;
  readonly traceStart?: 'complete' | 'partial';
  readonly traceEnd?: 'complete' | 'partial';
}
export type FindingCode = 'invalid-trace' | 'invalid-event' | 'event-limit' | 'identity-limit' | 'duplicate-call' | 'duplicate-request' | 'approval-rebound' | 'unknown-call' | 'ambiguous-call' | 'decision-without-request' | 'duplicate-decision' | 'conflicting-decision' | 'execution-without-request' | 'execution-call-mismatch' | 'ambiguous-approval' | 'execution-before-decision' | 'execution-after-denial' | 'duplicate-execution' | 'unresolved-request';
export interface AuditReport {
  readonly consistent: boolean;
  readonly complete: boolean;
  readonly findingsTruncated: boolean;
  readonly counts: Readonly<{ observed: number; calls: number; requests: number; decisions: number; executions: number; identities: number; unresolved: number; issues: number }>;
  readonly findings: readonly Readonly<{ code: FindingCode; index: number; relatedIndex?: number }>[];
}
export declare function auditApprovalTrace(events: readonly ApprovalEvent[], options?: AuditOptions): AuditReport;
