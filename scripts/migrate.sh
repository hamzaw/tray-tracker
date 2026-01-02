#!/bin/bash
# Migration script for PostgreSQL
# Uses drizzle-kit migrate or psql to apply migrations

set -e

CONNECTION_STRING="${DATABASE_URL}"
MIGRATIONS_DIR="./drizzle"

if [ -z "$CONNECTION_STRING" ]; then
  echo "Error: DATABASE_URL environment variable is required"
  exit 1
fi

# Use drizzle-kit migrate if available, otherwise use psql
if command -v drizzle-kit &> /dev/null; then
  echo "Using drizzle-kit migrate..."
  drizzle-kit migrate
else
  echo "drizzle-kit not found, using psql..."
  
  # Find all SQL migration files
  MIGRATION_FILES=$(find "$MIGRATIONS_DIR" -name "*.sql" -type f | sort)
  
  if [ -z "$MIGRATION_FILES" ]; then
    echo "No migration files found in $MIGRATIONS_DIR"
    exit 1
  fi
  
  # Apply each migration
  for migration_file in $MIGRATION_FILES; do
    echo "Applying migration: $(basename $migration_file)"
    psql "$CONNECTION_STRING" -f "$migration_file" || {
      echo "  ✗ Error applying migration: $migration_file"
      exit 1
    }
    echo "  ✓ Migration applied successfully"
  done
  
  echo "✓ All migrations applied successfully!"
fi

