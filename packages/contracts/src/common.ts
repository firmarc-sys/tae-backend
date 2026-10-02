export type ISODateTime = string & { readonly __brand: "ISODateTime" };
export type TenantId = string & { readonly __brand: "TenantId" };
export type UserId = string & { readonly __brand: "UserId" };
export type TaskId = string & { readonly __brand: "TaskId" };
export type CorrelationId = string & { readonly __brand: "CorrelationId" };

export interface RequestContext {
  requestId: string;
  correlationId: string;
  tenantId: TenantId;
  actorId: UserId;
}
export type TaskStatus = "queued" | "running" | "waiting_approval" | "succeeded" | "failed" | "cancel_requested" | "cancelled";
export interface TaskEvent<TPayload = unknown> {
  eventId: string; taskId: TaskId; tenantId: TenantId; type: string;
  occurredAt: ISODateTime; schemaVersion: 1; payload: TPayload;
}