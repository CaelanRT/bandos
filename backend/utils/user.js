function serializeUser(row) {
  return {
    id: row.user_id,
    username: row.username,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    plan: row.plan,
    isActive: row.is_active,
    createdAt: row.created_at,
  };
}

module.exports = { serializeUser };
