const ALLOWED_TABLES = ['users', 'posts', 'comments', 'settings', 'blocked_devices', 'quizzes', 'scores', 'progress', 'attempts'];
const ALLOWED_COLUMNS = ['id', 'name', 'email', 'created_at', 'device_id', 'status', 'quiz_id', 'user_id', 'score'];

function validateTableName(tableName) {
  if (!ALLOWED_TABLES.includes(tableName)) {
    throw new Error(`Invalid table name: ${tableName}`);
  }
  return tableName;
}

function validateColumnName(columnName) {
  if (!ALLOWED_COLUMNS.includes(columnName)) {
    throw new Error(`Invalid column name: ${columnName}`);
  }
  return columnName;
}

module.exports = { validateTableName, validateColumnName };
