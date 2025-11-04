
import bcryptjs from "bcryptjs";

export async function hashPassword(password: string): Promise<string> {
  return bcryptjs.hash(password, 10);
}

export async function comparePassword(password: string, hashed: string): Promise<boolean> {
  return bcryptjs.compare(password, hashed);
}
