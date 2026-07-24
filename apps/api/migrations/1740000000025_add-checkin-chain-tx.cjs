/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE checkins
      ADD COLUMN IF NOT EXISTS transaction_hash VARCHAR(66),
      ADD COLUMN IF NOT EXISTS chain_status VARCHAR(20)
        CHECK (chain_status IS NULL OR chain_status IN ('pending', 'confirmed', 'failed'));

    CREATE INDEX IF NOT EXISTS idx_checkins_chain_pending
      ON checkins(chain_status)
      WHERE verification_success = TRUE AND (chain_status IS NULL OR chain_status = 'pending');
  `);
};

/** @param {import('node-pg-migrate').MigrationBuilder} pgm */
exports.down = (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS idx_checkins_chain_pending;
    ALTER TABLE checkins
      DROP COLUMN IF EXISTS transaction_hash,
      DROP COLUMN IF EXISTS chain_status;
  `);
};
