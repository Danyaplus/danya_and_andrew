// Separated profile API. All validation and database writes live in AuthStore.
export function registerProfileLanguageRoute(app, { authStore, requireUser, emitToUser, authErrorResponse, limit }) {
  app.patch('/api/profile/language', limit, async (req, res) => {
    const user = requireUser(req, res);
    if (!user) return;
    try {
      const updated = await authStore.updateLanguage(user.id, req.body?.language);
      emitToUser(user.id, 'profile:updated', { user: updated });
      res.json({ ok: true, user: updated });
    } catch (error) {
      authErrorResponse(res, error);
    }
  });
}
