#!/bin/bash
# Migration script that uses sqlite3 CLI instead of drizzle-kit migrate
# This avoids the better-sqlite3 native bindings issue

set -e

DB_PATH="${DATABASE_URL:-./database.sqlite}"
MIGRATIONS_DIR="./drizzle"

# Find all SQL migration files
MIGRATION_FILES=$(find "$MIGRATIONS_DIR" -name "*.sql" -type f | sort)

if [ -z "$MIGRATION_FILES" ]; then
  echo "No migration files found in $MIGRATIONS_DIR"
  exit 1
fi

# Create database if it doesn't exist
if [ ! -f "$DB_PATH" ]; then
  echo "Creating database at $DB_PATH"
  touch "$DB_PATH"
fi

# Apply each migration
for migration_file in $MIGRATION_FILES; do
  echo "Applying migration: $(basename $migration_file)"
  # Capture output and check for errors
  if output=$(sqlite3 "$DB_PATH" < "$migration_file" 2>&1); then
    echo "  ✓ Migration applied successfully"
  else
    if echo "$output" | grep -q "already exists"; then
      echo "  ⚠ Tables already exist, skipping"
    else
      echo "  ✗ Error applying migration:"
      echo "$output" | head -5
      exit 1
    fi
  fi
done

echo "✓ All migrations applied successfully!"

