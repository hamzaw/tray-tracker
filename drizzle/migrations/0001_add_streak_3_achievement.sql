-- Add 'streak_3' value to achievement_type enum
-- Note: ALTER TYPE ... ADD VALUE must be run in a separate transaction
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'streak_3' 
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'achievement_type')
    ) THEN
        ALTER TYPE "achievement_type" ADD VALUE 'streak_3';
    END IF;
END $$;

