const PROTECTED_ACTIONS = new Set([
  'spend_money',
  'external_message',
  'production_deploy',
  'destructive_delete_major_shared_asset',
  'permission_escalation',
  'protected_infrastructure',
  'sensitive_disclosure',
]);

export function classifyAction(action = '') {
  const value = String(action || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (PROTECTED_ACTIONS.has(value)) return value;
  if (/spend|charge|billing|stripe/.test(value)) return 'spend_money';
  if (/email|sms|slack|message/.test(value) && /send|external/.test(value)) return 'external_message';
  if (/deploy|traffic|dns/.test(value)) return 'production_deploy';
  if (/grant|escalat|allowlist/.test(value)) return 'permission_escalation';
  if (/secret|credential|disclose/.test(value)) return 'sensitive_disclosure';
  if (/delete.*(canon|landmark|region|world)/.test(value)) return 'destructive_delete_major_shared_asset';
  return 'creative_sandbox';
}

export function evaluateMaat({ action, confirmed = false, approvalId = null } = {}) {
  const classified = classifyAction(action);
  if (classified === 'creative_sandbox') {
    return {
      governor: 'maat',
      action: classified,
      allowed: true,
      approval_required: false,
      reason: 'CREATIVE_SANDBOX',
    };
  }
  if (!confirmed || !approvalId) {
    return {
      governor: 'maat',
      action: classified,
      allowed: false,
      approval_required: true,
      reason: 'HUMAN_APPROVAL_REQUIRED',
    };
  }
  return {
    governor: 'maat',
    action: classified,
    allowed: true,
    approval_required: true,
    approval_id: approvalId,
    reason: 'HUMAN_APPROVAL_RECORDED',
  };
}
