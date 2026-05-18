import jwt from 'jsonwebtoken'
import type { User } from '../models/UserModel'

const SECRET     = process.env.JWT_SECRET     || 'dev_secret_change_me'
const EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d'

export interface JwtPayload {
  sub:    number
  email:  string
  type:   'admin' | 'casher'
  shopId: string | null   // UUID string
}

export function signToken(user: Pick<User, 'id' | 'email' | 'type' | 'shopId'>): string {
  const payload: JwtPayload = {
    sub:    user.id,
    email:  user.email,
    type:   user.type,
    shopId: user.shopId,
  }
  return jwt.sign(payload, SECRET, { expiresIn: EXPIRES_IN } as jwt.SignOptions)
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, SECRET) as JwtPayload
}