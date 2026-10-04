// Small, deterministic, side-effect-free adapter for exercising the real dispatch path.
// This is a probe adapter, not evidence that Interweb/Ptah/Optics/etc. are implemented.
export const installedSkillAdapters = new Map([
  ["tae.context.write", async ({ input, identity, task_id }) => ({
    accepted: true,
    gid: identity.gid,
    session_id: identity.session_id,
    task_id,
    context: input.context,
    content_type: input.content_type || "text/plain",
  })],
]);
