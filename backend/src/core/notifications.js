const VALID_KINDS = new Set(['friend_request','friend_accepted','party_invite','achievement','match','level_up','tournament']);

// Database timestamps are offset aware. Query filters old events even if a cleanup job hasn't run.
export async function listNotifications(db, userId) {
  const { data, error } = await db.from('codumi_notifications')
    .select('id,kind,title,message,link,is_read,created_at,expires_at')
    .eq('user_id', userId)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return data || [];
}

export async function saveNotification(db, userId, { kind, title, message = '', link = null }) {
  if (!VALID_KINDS.has(kind) || !userId) return null;
  const { data, error } = await db.from('codumi_notifications')
    .insert({ user_id: userId, kind, title: String(title).slice(0, 100), message: String(message).slice(0, 280), link })
    .select('id,kind,title,message,link,is_read,created_at,expires_at').single();
  if (error) throw error;
  return data;
}

export async function markAllNotificationsRead(db, userId) {
  // One server-side query avoids hammering the API with dozens of PATCH requests.
  // Only notifications already present at request time are marked read.
  const now = new Date().toISOString();
  const { error } = await db.from('codumi_notifications').update({ is_read: true })
    .eq('user_id', userId).eq('is_read', false)
    .gt('expires_at', now).lte('created_at', now);
  if (error) throw error;
}

export async function markNotificationRead(db, userId, notificationId) {
  const { error } = await db.from('codumi_notifications').update({ is_read: true })
    .eq('id', notificationId).eq('user_id', userId);
  if (error) throw error;
}
