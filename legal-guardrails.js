export const LEGAL_GUARDRAIL_VERSION = 'jahorin-legal-guardrails-2026-10-12';

const PERSONALIZATION_TERMS = [
  'rahu','ketu','vedic','astrology','birth chart','birth-chart','birth data','birth_data',
  'numerology','lunar node','lunar_nodes','personalization_profile','derived_profile',
];

const SIGNIFICANT_DECISION_TERMS = [
  'employment','hire','hiring','fire','firing','promotion','demotion','job eligibility','candidate ranking',
  'housing','tenant','rental','mortgage','credit','loan','lending','insurance','coverage','premium',
  'healthcare','medical eligibility','treatment eligibility','education','admission','admissions','school eligibility',
  'benefits eligibility','government benefit','eligibility decision','approve applicant','deny applicant','screen applicant',
];

const DECISION_VERBS = [
  'decide','determine','rank','screen','score','approve','deny','reject','select','exclude','recommend whether',
  'eligible','eligibility','qualify','qualification','hire','fire','admit','cover','insure','lend','loan',
];

function flatten(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value); } catch { return String(value); }
}

function hasAny(text, terms) {
  const value = String(text || '').toLowerCase();
  return terms.some((term) => value.includes(term));
}

export function detectsSensitivePersonalization(value) {
  return hasAny(flatten(value), PERSONALIZATION_TERMS);
}

export function detectsSignificantDecision(value) {
  const text = flatten(value).toLowerCase();
  return hasAny(text, SIGNIFICANT_DECISION_TERMS) && hasAny(text, DECISION_VERBS);
}

export function evaluateSensitivePersonalizationGuardrail({ capability = '', operation = '', body = {} } = {}) {
  const combined = { capability, operation, body };
  const usesSensitivePersonalization = detectsSensitivePersonalization(combined);
  const significantDecision = detectsSignificantDecision(combined);
  if (usesSensitivePersonalization && significantDecision) {
    return {
      allowed: false,
      reason_code: 'SENSITIVE_PERSONALIZATION_CONSEQUENTIAL_DECISION_PROHIBITED',
      message: 'Rahu/Ketu, Vedic, numerology, birth-derived, or similar sensitive personalization may not determine or influence a consequential eligibility decision.',
      guardrail_version: LEGAL_GUARDRAIL_VERSION,
    };
  }
  return {
    allowed: true,
    reason_code: 'LEGAL_GUARDRAIL_ALLOW',
    guardrail_version: LEGAL_GUARDRAIL_VERSION,
  };
}

export function legalGuardrailManifest() {
  return {
    version: LEGAL_GUARDRAIL_VERSION,
    data_model: {
      sensitive_birth_data: 'local_first',
      backend_retention: 'minimum_derived_state_only',
      raw_birth_date_time_place: 'do_not_persist_server_side',
      deletion: 'user_controlled',
    },
    personalization: {
      permitted: ['tone','reflection','suggestions','prioritization','user-directed workflow assistance'],
      prohibited: ['consequential eligibility decisions'],
      resonance_controls: { yes: 'standard', partial: 'light', no: 'disabled' },
    },
    consequential_actions: {
      human_confirmation_required: ['spend_money','send_external_message','deploy_production','merge_main','delete_data','change_iam'],
      self_authorization: 'prohibited',
    },
    notices: {
      ai_identity_disclosure: true,
      interpretive_not_predictive: true,
      professional_advice_disclaimer: true,
      age_floor: 18,
    },
  };
}
