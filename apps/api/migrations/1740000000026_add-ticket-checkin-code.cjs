/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE tickets
      ADD COLUMN IF NOT EXISTS checkin_code VARCHAR(9);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_tickets_checkin_code
      ON tickets(checkin_code);

    -- Backfill existing rows (unique index allows multiple NULLs in Postgres)
    DO $$
    DECLARE
      r RECORD;
      alphabet TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      candidate TEXT;
      i INT;
      done BOOLEAN;
    BEGIN
      FOR r IN SELECT id FROM tickets WHERE checkin_code IS NULL LOOP
        done := FALSE;
        WHILE NOT done LOOP
          candidate := '';
          FOR i IN 1..9 LOOP
            candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
          END LOOP;
          BEGIN
            UPDATE tickets SET checkin_code = candidate WHERE id = r.id;
            done := TRUE;
          EXCEPTION WHEN unique_violation THEN
            done := FALSE;
          END;
        END LOOP;
      END LOOP;
    END $$;

    ALTER TABLE tickets
      ALTER COLUMN checkin_code SET NOT NULL;

    -- Allow backup-code check-ins in the audit log
    ALTER TABLE checkins DROP CONSTRAINT IF EXISTS checkins_scan_method_check;
    ALTER TABLE checkins
      ADD CONSTRAINT checkins_scan_method_check
      CHECK (scan_method IN ('qr', 'nfc', 'manual', 'code'));
  `);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS idx_tickets_checkin_code;
    ALTER TABLE tickets DROP COLUMN IF EXISTS checkin_code;
  `);
};
