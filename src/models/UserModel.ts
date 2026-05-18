import { randomUUID } from 'crypto'
import pool from '../db/pool'
import { RowDataPacket, ResultSetHeader } from 'mysql2'

export interface User {
  id:       number
  name:     string
  type:     'admin' | 'casher'
  password: string | null
  login:    string | null
  email:    string
  shopId:   string | null   // UUID string, generated on first Google login
}

type UserRow = User & RowDataPacket

export const UserModel = {

  async findByEmail(email: string): Promise<User | null> {
    const [rows] = await pool.execute<UserRow[]>(
      'SELECT * FROM user WHERE email = ? LIMIT 1', [email]
    )
    return rows[0] ?? null
  },

  async findById(id: number): Promise<User | null> {
    const [rows] = await pool.execute<UserRow[]>(
      'SELECT * FROM user WHERE id = ? LIMIT 1', [id]
    )
    return rows[0] ?? null
  },

  async findByLogin(login: string): Promise<User | null> {
    const [rows] = await pool.execute<UserRow[]>(
      'SELECT * FROM user WHERE login = ? LIMIT 1', [login]
    )
    return rows[0] ?? null
  },

  async create(data: Omit<User, 'id'>): Promise<number> {
    const [result] = await pool.execute<ResultSetHeader>(
      'INSERT INTO user (name, type, password, login, email, shopId) VALUES (?,?,?,?,?,?)',
      [data.name, data.type, data.password, data.login, data.email, data.shopId ?? null]
    )
    return result.insertId
  },

  /**
   * Upsert a Google admin user.
   *
   * - NEW user  → generate a UUID shopId, persist it, return the full user.
   * - EXISTING  → return the user as-is (shopId already set from first login).
   */
  async upsertGoogleUser(data: { name: string; email: string }): Promise<User> {
    const existing = await UserModel.findByEmail(data.email)

    if (existing) {
      // Update name in case it changed in Google profile
      await pool.execute(
        'UPDATE user SET name = ? WHERE email = ?',
        [data.name, data.email]
      )
      return { ...existing, name: data.name }
    }

    // First login — generate a UUID that will identify this admin's shop
    const shopId = randomUUID()

    const id = await UserModel.create({
      name:     data.name,
      type:     'admin',
      password: null,
      login:    null,
      email:    data.email,
      shopId,
    })

    return {
      id,
      name:     data.name,
      type:     'admin',
      password: null,
      login:    null,
      email:    data.email,
      shopId,
    }
  },

  /** Strip the password before sending to the client. */
  sanitize(user: User): Omit<User, 'password'> {
    const { password: _, ...safe } = user
    return safe
  },
}

export default UserModel