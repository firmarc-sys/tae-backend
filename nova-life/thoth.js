const SECRET_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /API_KEY\s*=\s*\S+/i,
  /PASSWORD\s*=\s*\S+/i,
  /client_secret/i,
  /credentials\.json/i,
  /SERVICE_ACCOUNT/i,
];

const PROTECTED = [
  /production deploy/i,
  /cloud run traffic/i,
  /gcloud run services update-traffic/i,
  /force-push uae/i,
  /drop table/i,
];

export function verifyContribution(build) {
  const findings = [];
  if (!build) findings.push({ code: 'MISSING_BUILD', severity: 'fail' });
  const preview = build?.preview || {};
  if (!build?.contributor_gid) findings.push({ code: 'CONTRIBUTOR_GID_MISSING', severity: 'fail' });
  if (!preview.origin_contributor_gid && !build?.origin_contributor_gid) {
    findings.push({ code: 'ORIGIN_CONTRIBUTOR_MISSING', severity: 'fail' });
  }
  if (build?.namespace === 'nova-life' && preview.scope !== 'nova-life-world') {
    findings.push({ code: 'SCOPE_MISMATCH', severity: 'fail' });
  }
  if (build?.namespace === 'nova-life' && preview.owner !== 'nova-life') {
    findings.push({ code: 'OWNER_MISMATCH', severity: 'fail' });
  }
  if (build?.namespace === 'jahorin' && preview.scope !== 'personal') {
    findings.push({ code: 'JAHORIN_SCOPE_MISMATCH', severity: 'fail' });
  }
  const serialized = JSON.stringify(build || {});
  if (SECRET_PATTERNS.some((pattern) => pattern.test(serialized))) {
    findings.push({ code: 'SECRET_MATERIAL', severity: 'fail' });
  }
  if (PROTECTED.some((pattern) => pattern.test(serialized))) {
    findings.push({ code: 'PROTECTED_SYSTEM', severity: 'fail' });
  }
  if (!preview.id || !preview.kind) findings.push({ code: 'BROKEN_ASSET', severity: 'fail' });
  if (!Array.isArray(build?.plan?.dependencies)) findings.push({ code: 'DEPENDENCIES_UNDECLARED', severity: 'fail' });
  if (preview.canon) findings.push({ code: 'CANON_OVERWRITE', severity: 'fail' });
  const passed = findings.length === 0;
  return {
    verifier: 'thoth',
    status: passed ? 'PASS' : 'FAIL',
    passed,
    findings,
    provenance: {
      contributor_gid: build?.contributor_gid || null,
      origin_contributor_gid: build?.origin_contributor_gid || preview.origin_contributor_gid || null,
      scope: preview.scope || null,
      owner: preview.owner || null,
    },
  };
}
