import crypto from 'crypto';

/**
 * Hashes a plain text password using PBKDF2 with a random salt.
 * @param {string} password - The plain text password.
 * @returns {string} - The stored password string in format "salt:hash".
 */
export const hashPassword = (password) => {
  if (!password) return '';
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
};

/**
 * Verifies a plain text password against a stored hashed password string.
 * @param {string} password - The plain text password.
 * @param {string} storedPassword - The stored password string ("salt:hash").
 * @returns {boolean} - True if password matches, false otherwise.
 */
export const verifyPassword = (password, storedPassword) => {
  if (!password || !storedPassword || !storedPassword.includes(':')) {
    return false;
  }
  const [salt, hash] = storedPassword.split(':');
  const verifyHash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return hash === verifyHash;
};
