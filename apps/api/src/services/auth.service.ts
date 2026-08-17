import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { db } from '../db/sqlite.js';

export interface UserEntity {
  id: string;
  username: string;
  email: string;
  password_hash: string;
  role: 'PENDING' | 'USER' | 'ADMIN';
  status: 'ACTIVE' | 'DISABLED' | 'BANNED';
  created_at: string;
  updated_at: string;
}

export function findUserByUsername(username: string): UserEntity | undefined {
  const stmt = db.prepare('SELECT * FROM users WHERE username = ?');
  return stmt.get(username) as unknown as UserEntity | undefined;
}

export function findUserById(id: string): UserEntity | undefined {
  const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
  return stmt.get(id) as unknown as UserEntity | undefined;
}

export function getAllUsers(): Omit<UserEntity, 'password_hash'>[] {
  const stmt = db.prepare('SELECT id, username, email, role, status, created_at, updated_at FROM users ORDER BY created_at DESC');
  return stmt.all() as any;
}

export function registerUser(username: string, password: string, email?: string): UserEntity {
  // Check registration mode setting
  const settingStmt = db.prepare("SELECT value FROM system_settings WHERE key = 'registration_mode'");
  const mode = (settingStmt.get() as { value: string } | undefined)?.value || 'OPEN';

  if (mode === 'CLOSED') {
    throw new Error('当前系统已关闭新用户注册');
  }

  const existing = findUserByUsername(username);
  if (existing) {
    throw new Error('用户名已被注册');
  }

  const id = `user_${crypto.randomBytes(6).toString('hex')}`;
  const salt = bcrypt.genSaltSync(10);
  const hash = bcrypt.hashSync(password, salt);
  const now = new Date().toISOString();

  // All newly registered users are PENDING by default
  const stmt = db.prepare(`
    INSERT INTO users (id, username, email, password_hash, role, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'PENDING', 'ACTIVE', ?, ?)
  `);

  stmt.run(id, username, email || '', hash, now, now);
  return findUserById(id)!;
}

export function verifyUserPassword(user: UserEntity, password: string): boolean {
  return bcrypt.compareSync(password, user.password_hash);
}

export function changeUserPassword(userId: string, oldPassword: string, newPassword: string): void {
  const user = findUserById(userId);
  if (!user) throw new Error('用户不存在');

  if (!bcrypt.compareSync(oldPassword, user.password_hash)) {
    throw new Error('原密码不正确');
  }

  const salt = bcrypt.genSaltSync(10);
  const hash = bcrypt.hashSync(newPassword, salt);
  const now = new Date().toISOString();

  const stmt = db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?');
  stmt.run(hash, now, userId);
}

export function adminResetUserPassword(userId: string, newPassword: string): void {
  const salt = bcrypt.genSaltSync(10);
  const hash = bcrypt.hashSync(newPassword, salt);
  const now = new Date().toISOString();

  const stmt = db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?');
  stmt.run(hash, now, userId);
}

export function adminUpdateUser(userId: string, updates: { role?: string; status?: string; email?: string }): void {
  const user = findUserById(userId);
  if (!user) throw new Error('用户不存在');

  const now = new Date().toISOString();
  const stmt = db.prepare(`
    UPDATE users 
    SET role = ?, status = ?, email = ?, updated_at = ?
    WHERE id = ?
  `);

  stmt.run(
    updates.role ?? user.role,
    updates.status ?? user.status,
    updates.email ?? user.email,
    now,
    userId
  );
}

export function adminDeleteUser(userId: string): void {
  const stmt = db.prepare('DELETE FROM users WHERE id = ?');
  stmt.run(userId);
}
