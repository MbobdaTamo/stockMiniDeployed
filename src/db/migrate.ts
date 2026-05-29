/**
 * Run once to create the database schema.
 *   npm run db:migrate
 */
import pool from './pool'

async function migrate(): Promise<void> {
  const conn = await pool.getConnection()
  try {
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS user (
        id       INT           NOT NULL AUTO_INCREMENT,
        name     VARCHAR(120)  NOT NULL,
        type     ENUM('admin','casher', 'superAdmin') NOT NULL DEFAULT 'casher',
        password VARCHAR(255)  NULL     COMMENT 'NULL for Google-only accounts',
        login    VARCHAR(80)   NULL     UNIQUE,
        email    VARCHAR(180)  NOT NULL UNIQUE,
        shopId   VARCHAR(36)   NULL     COMMENT 'UUID generated on first Google login',
        PRIMARY KEY (id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `)

    console.log('✅  Table `user` is ready.')

    await conn.execute(`
      ALTER TABLE user
      ADD COLUMN IF NOT EXISTS premiumExpireAt DATETIME NULL;
    `)

    // Set default for existing users who don't have it yet
    await conn.execute(`
      UPDATE user
      SET premiumExpireAt = DATE_ADD(NOW(), INTERVAL 1 MONTH)
      WHERE premiumExpireAt IS NULL;
    `)
    // Add super admin ----------------------
    await conn.execute(`
      ALTER TABLE user
      MODIFY COLUMN type ENUM('admin', 'casher', 'superAdmin') NOT NULL DEFAULT 'casher';
    `)
    // Create super admin manually ----------------------
    await conn.execute(`
      INSERT INTO user (name, type, login, email, password, shopId, premiumExpireAt)
        VALUES (
          'Super Admin',
          'superAdmin',
          'superadmin',
          'superadmin@stockware.app',
          '$2a$12$ek0W1Q9JUolHsqTB479nDev2jZxjfEEAck7Sl6ZsK69LAOX.O/udO',
          NULL,
          NULL
        );
    `)
    // generate hash password:  node -e "require('bcryptjs').hash('dembele2000', 12).then(console.log)"

  } finally {
    conn.release()
    await pool.end()
  }
}


migrate().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})