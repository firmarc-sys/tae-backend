import assert from 'node:assert/strict';
import { evaluateSensitivePersonalizationGuardrail, legalGuardrailManifest } from '../legal-guardrails.js';
import { evaluateUaeGovernance } from '../uae-governance.js';

const manifest=legalGuardrailManifest();
assert.equal(manifest.data_model.sensitive_birth_data,'local_first');
assert.equal(manifest.data_model.raw_birth_date_time_place,'do_not_persist_server_side');
assert.equal(manifest.personalization.resonance_controls.no,'disabled');
assert.equal(manifest.personalization.resonance_controls.partial,'light');

const blocked=evaluateSensitivePersonalizationGuardrail({
  capability:'novalife',
  operation:'screen_applicant',
  body:{intent:'Use the member Rahu and Ketu profile to rank candidates for a job'},
});
assert.equal(blocked.allowed,false);
assert.equal(blocked.reason_code,'SENSITIVE_PERSONALIZATION_CONSEQUENTIAL_DECISION_PROHIBITED');

const reflective=evaluateSensitivePersonalizationGuardrail({
  capability:'novalife',
  operation:'plan',
  body:{intent:'Use the member Rahu and Ketu profile to suggest reflective goals'},
});
assert.equal(reflective.allowed,true);

const governanceBlocked=evaluateUaeGovernance({
  gid:'123456789012',
  capability:'novalife',
  operation:'screen_applicant',
  body:{intent:'Use Vedic birth chart data to decide housing applicant eligibility'},
});
assert.equal(governanceBlocked.allowed,false);
assert.equal(governanceBlocked.reason_code,'SENSITIVE_PERSONALIZATION_CONSEQUENTIAL_DECISION_PROHIBITED');

console.log('legal guardrails verified');
