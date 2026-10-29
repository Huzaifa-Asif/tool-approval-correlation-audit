# tool-approval-correlation-audit

Bounded offline diagnostics for approval observation correlation. Check the npm registry for available published versions.

A small, zero-runtime-dependency diagnostic library for **saved observations** of tool calls, approval requests, decisions and explicitly approval-gated executions. It finds broken ID joins and ordering in adapter fixtures without importing a provider SDK or retaining tool arguments.

This is **not an authorization system**. A consistent trace does not prove human consent, a safe operation, a real execution, correct policy, trusted evidence or absence of omitted events. Never use this report as a permission check.

## Why it exists

An adapter can emit an approval request before it emits the related call. A UI can associate a delayed answer with the wrong message. Transcript pruning can leave a response whose request no longer exists. Each looks like an approval problem but can be a correlation problem.

Vercel AI [issue 23514](https://github.com/vercel/ai/issues/23514), opened October 17, 2026, reports the first pattern and remained open when checked October 28. The report concerns evaluation jobs, not a verified production incident. [Issue 21193](https://github.com/vercel/ai/issues/21193) and [issue 16385](https://github.com/vercel/ai/issues/16385) are **closed/merged historical examples**, not claims that today's SDK still has those bugs. Upgrade SDKs for upstream fixes first. This package diagnoses synthetic or sanitized adapter fixtures; it does not patch those frameworks.

## Quick start

Requires Node.js 20 or later. There are no runtime dependencies or lifecycle install scripts.

```sh
npm run check
node examples/audit.js
```

Import locally during evaluation:

```js
import { auditApprovalTrace } from 'tool-approval-correlation-audit';
const report = auditApprovalTrace([
  { type: 'call', scope: 'session-1', callId: 'call-1' },
  { type: 'request', scope: 'session-1', callId: 'call-1', approvalId: 'approval-1' },
  { type: 'decision', scope: 'session-1', approvalId: 'approval-1', decision: 'approved' },
  { type: 'execution', scope: 'session-1', callId: 'call-1', approvalId: 'approval-1' }
]);
console.log(report.consistent); // true: supplied complete observations correlate
```

CommonJS uses `require('tool-approval-correlation-audit')`. ESM, CommonJS and TypeScript declarations are included. To work from source, run `npm ci --ignore-scripts` and `npm run check`.

For CI fixtures, fail your *test* if a complete trace is inconsistent. Do not use that boolean to decide whether to execute a real tool.

## API

`auditApprovalTrace(events, options?) -> AuditReport`

`events` is a readonly array. Every event has a nonempty `scope`, which the caller chooses as an explicit session/run identity. IDs are compared literally, including case. Same IDs in different scopes are independent. Reuse within one scope is ambiguous. Do not truncate unrelated sessions into the same scope or put timestamps in place of identities.

| Type | Required fields besides scope/type | Meaning |
| --- | --- | --- |
| call | callId | Caller observed the tool call being registered |
| request | callId, approvalId | Caller observed an approval request for that call |
| decision | approvalId, decision | Reported label: approved or denied |
| execution | callId, approvalId | Caller observed an execution explicitly expected to be approval-gated |

There is deliberately no operation name, raw argument, result, approver name, reason, token, signature or policy field. Extra fields are ignored and not read. `approved` is merely a caller-supplied label; no authenticity is inferred. Do not fabricate execution observations from a model's claim that it ran a tool.

The API does **not** assume every tool execution requires approval. Only provide `execution` for calls whose approval requirement your adapter has independently established. Provider-executed tools and auto-approved tools can have different semantics; normalize them explicitly or leave them outside this narrow fixture. See the [AI SDK approval documentation](https://github.com/vercel/ai/blob/main/content/docs/03-ai-sdk-core/15-tools-and-tool-calling.mdx).

Repeated execution of a call is diagnosed even when the second observation uses a different approved request ID. This model allows at most one execution observation per scoped call ID; adapters that intentionally retry must assign distinct call-attempt IDs rather than reuse a call ID. Repeated execution through the same approval ID is also diagnosed.

### Options and bounds

| Option | Default | Allowed |
| --- | --- | --- |
| maxEvents | 10,000 | integer 1–100,000 |
| maxIdentities | 10,000 | integer 1–100,000 |
| maxIdLength | 256 | integer 1–4,096 UTF-16 code units |
| maxFindings | 1,000 | integer 1–10,000 |
| traceStart | complete | complete or partial |
| traceEnd | complete | complete or partial |

Identity accounting includes each distinct retained scope, call and request ID. When a new identity would exceed the limit, scanning stops. Event overflow scans only the bounded prefix. Finding overflow retains the configured number but continues counting issues within the other bounds. No IDs are evicted and reused as if they were new.

Malformed options throw a fixed `TypeError('Invalid audit options')`. Invalid events/traces yield fixed diagnostics and `complete:false`. Getters/proxies that throw while required fields are read are caught, but arbitrary JavaScript getters can run code or never return; this is not a sandbox. Prefer objects produced by parsing sanitized JSON. Each required field is read once per event. Unknown extra fields are not inspected.

### Result

- `consistent`: true only when evidence is declared complete, no limit/invalid evidence occurred and zero diagnostic issues were found. An empty complete trace is consistent because it declares no operations; this is not evidence that an operation occurred.
- `complete`: false for caller-declared partial boundaries, invalid evidence or a limit. This does not verify the caller's completeness claim.
- `findingsTruncated`: whether some diagnostics were omitted from the bounded findings array.
- `counts`: observed array entries, recognized calls/requests/decisions/executions, retained identities, unresolved requests, total issues.
- `findings`: fixed `code`, zero-based event `index`, and optional original `relatedIndex`. `invalid-trace` uses index -1; event-limit uses the first unexamined index.

All returned objects/arrays are frozen. Reports do not echo caller-controlled identifiers, values, error messages or arguments. The library does not mutate input objects, though hostile getters can mutate themselves.

### Ordering, partial evidence and ambiguity

Input array order is *observation order*, not proven real-time causality. Correctly merge parallel event streams before analysis or keep separate scopes. The library does not reorder events or use timestamps to invent causality.

A request before a call remains a finding after the call arrives. A decision before a request is not applied later. A repeated/conflicting decision never replaces the first decision. Duplicate calls or rebound request IDs taint the related records. Later clean-looking events cannot erase existing findings.

At a declared complete end, unresolved requests produce `unresolved-request`. With `traceEnd:'partial'`, unresolved requests are counted but are not issues by themselves. Missing references in partial traces are **missing-context diagnostics**, not evidence that an unauthorized action happened. A positive decision without execution is permitted: consent does not guarantee an action was attempted.

## Diagnostic codes

Input/bounds: `invalid-trace`, `invalid-event`, `event-limit`, `identity-limit`.

Correlation/order: `unknown-call`, `duplicate-call`, `ambiguous-call`, `duplicate-request`, `approval-rebound`, `decision-without-request`, `duplicate-decision`, `conflicting-decision`, `execution-without-request`, `execution-call-mismatch`, `ambiguous-approval`, `execution-before-decision`, `execution-after-denial`, `duplicate-execution`, `unresolved-request`.

A duplicate execution is a duplicate *observation*, not proof of duplicate side effects or charges. An execution-after-denial finding is contradictory reported evidence, not a verified security incident.

## Alternatives and scope

- AI SDK `toolApproval` and message helpers provide the actual framework workflow. Prefer those for runtime behavior.
- [mcp-approval](https://www.npmjs.com/package/mcp-approval) implements MCP confirmation/elicitation. Its indexed documentation was reviewed; direct page retrieval was blocked. This library neither replaces its gate nor issues tokens.
- [FrontMCP's approval plugin](https://frontmcp.dev/reference/plugins/approval) adds an approval gate/store within that framework.
- Throughline approvals and Alquimia worklog reducers integrate approval workflows into their ecosystems. They may be preferable if you already use them.
- ApprovalTests compares snapshots rather than correlating request IDs.
- `tool-call-closure` settles pending calls; `tool-execution-checkpoint` tracks execution/delivery; `tool-call-budget-audit` audits batch size/completeness. This package only joins approval observations.

No claim of first, unique, exhaustive, production-proven or security-certified technology is made. Search coverage is limited to accessible public indexed material as of October 28, 2026.

## Verification and supported runtimes

Declared support is Node 20+. Current local execution and CI configuration must be reported separately in release evidence. CI is configured for Node 20,22,24; an unrun matrix is not a passed matrix. Run `npm run check` for syntax checks, unit tests with coverage, file/export boundaries and the shipped synthetic example. Strict TypeScript consumer fixture: `tsc --strict --noEmit --module NodeNext --moduleResolution NodeNext test/types.ts test/types.cts` using an approved TypeScript toolchain.

No provider network integration, actual human approval, tool execution, persistence, cryptographic proof or browser UI is exercised by these tests. Release verification also checks the exact tarball through isolated ESM, CommonJS and strict TypeScript consumers.

## Troubleshooting

- `consistent:false` with no findings: check partial boundaries and `complete`.
- `identity-limit`: raise the bounded limit within the hard ceiling or split independent scopes; never silently discard a relevant event.
- Unknown call/request: verify all relevant earlier messages were exported and the adapter emits call registration before approval.
- Duplicate findings: inspect replay behavior and identity scope; do not delete diagnostics merely to get a green result.
- Frozen output errors: copy the result before modifying presentation state.

## Privacy, accessibility and maintenance

No network, logging, storage, environment reads, clocks or callbacks are used. Data remains in process memory for the duration of the call and is not returned except fixed codes/counts/indices. The caller remains responsible for sanitized source logs, retention and access control. The CLI example emits plain structured JSON that can be rendered accessibly; this library has no visual interface.

See CONTRIBUTING.md, SECURITY.md and CHANGELOG.md. Original code is MIT. Copyright/license notice retention is a license obligation, not a requirement to provide promotional credit.
