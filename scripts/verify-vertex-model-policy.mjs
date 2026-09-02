import fs from 'node:fs';
import {
  MODEL_QUALITY_RANK,
  VERTEX_CAPABILITY_REGISTRY,
  VERTEX_MODEL_CATALOG,
  VERTEX_PROVIDER,
  modelChainForCapability,
} from '../vertex-model-registry.js';

const fail = (message) => { throw new Error(message); };
const ids = new Set();

for (const [key, model] of Object.entries(VERTEX_MODEL_CATALOG)) {
  if (model.provider !== VERTEX_PROVIDER) fail(`${key} is not Vertex-only`);
  if (!/^(gemini|veo|lyria)-/.test(model.id)) fail(`${key} is not an approved Google first-party model family`);
  if (ids.has(model.id)) fail(`duplicate model id ${model.id}`);
  ids.add(model.id);
}

for (const [name, policy] of Object.entries(VERTEX_CAPABILITY_REGISTRY)) {
  for (const field of [
    'capability',
    'provider',
    'primary_model',
    'minimum_model_class',
    'required_modalities',
    'required_features',
    'context_requirement',
    'region_policy',
    'stability_class',
    'enabled',
    'reason_for_selection',
  ]) {
    if (policy[field] === undefined || policy[field] === null) fail(`${name} missing registry field ${field}`);
  }
  if (policy.provider !== VERTEX_PROVIDER) fail(`${name} provider drifted`);
  const chain = modelChainForCapability(name);
  if (!chain.length) fail(`${name} has no model chain`);
  if (chain[0].lifecycle === 'PREVIEW' && !policy.preview_primary_approval_key) fail(`${name} has unapproved preview primary`);
  const floor = MODEL_QUALITY_RANK[policy.minimum_model_class] || 0;
  for (const model of chain) {
    if ((MODEL_QUALITY_RANK[model.qualityClass] || 0) < floor) fail(`${name}/${model.id} falls below quality floor`);
    for (const modality of policy.required_modalities) {
      if (!model.inputModalities.includes(modality)) fail(`${name}/${model.id} loses input modality ${modality}`);
    }
    for (const modality of policy.required_output_modalities) {
      if (!model.outputModalities.includes(modality)) fail(`${name}/${model.id} loses output modality ${modality}`);
    }
    for (const feature of policy.required_features) {
      if (!model.features.includes(feature)) fail(`${name}/${model.id} loses feature ${feature}`);
    }
    if (policy.context_requirement > 0 && model.contextWindow > 0 && model.contextWindow < policy.context_requirement) {
      fail(`${name}/${model.id} violates context floor`);
    }
  }
}

for (const path of ['server.js', 'vertex-model-router.js', 'thoth-voice.js', 'control-plane-gateway.js', '.env.example']) {
  const source = fs.readFileSync(path, 'utf8');
  for (const id of ids) {
    if (source.includes(id)) fail(`authoritative model id leaked outside registry: ${path}`);
  }
}

const router = fs.readFileSync('vertex-model-router.js', 'utf8');
if (!router.includes('VERTEX_MODEL_SUBSTITUTION')) fail('substitution observability missing');
if (!router.includes('VERTEX_MODEL_RETRY')) fail('same-model retry observability missing');
if (!router.includes('VERTEX_CAPABILITY_UNAVAILABLE')) fail('fail-closed capability path missing');
if (/google-gemini-api|generativelanguage\.googleapis\.com|OpenAI|Anthropic/i.test(router)) fail('forbidden provider path in router');

console.log(`PASS Vertex model policy: ${Object.keys(VERTEX_CAPABILITY_REGISTRY).length} capabilities, ${ids.size} Google first-party models, one authoritative registry`);
