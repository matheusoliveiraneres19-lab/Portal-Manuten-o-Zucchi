/**
 * Gestão de usuários do portal (área de ADMIN).
 *
 * Senhas nunca são gravadas em texto puro — sempre hash bcrypt. Usuários criados
 * aqui recebem senha temporária e `mustChangePassword = true` (troca obrigatória
 * no primeiro acesso). Nenhuma função retorna passwordHash.
 */
import { Prisma, Role, UserStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";

const TEMP_PASSWORD_TTL_DAYS = 7;

export type AdminUserRow = {
  id: string;
  name: string;
  login: string;
  email: string | null;
  role: Role;
  status: UserStatus;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
};

const SELECT = {
  id: true,
  name: true,
  login: true,
  email: true,
  role: true,
  status: true,
  mustChangePassword: true,
  lastLoginAt: true,
  createdAt: true
} satisfies Prisma.UserSelect;

function toRow(user: Prisma.UserGetPayload<{ select: typeof SELECT }>): AdminUserRow {
  return {
    id: user.id,
    name: user.name,
    login: user.login,
    email: user.email,
    role: user.role,
    status: user.status,
    mustChangePassword: user.mustChangePassword,
    lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
    createdAt: user.createdAt.toISOString()
  };
}

/** Lista os usuários do portal (ativos primeiro, por nome). Sem hash de senha. */
export async function listUsers(): Promise<AdminUserRow[]> {
  const users = await prisma.user.findMany({
    orderBy: [{ status: "asc" }, { name: "asc" }],
    select: SELECT
  });
  return users.map(toRow);
}

export type CreateUserInput = {
  name: string;
  login: string;
  email?: string;
  role: string;
  temporaryPassword: string;
  /** Padrão true: exige troca de senha no primeiro acesso. */
  requirePasswordChange?: boolean;
};

export type ServiceResult<T> = { ok: true; data: T } | { ok: false; status: number; message: string; field?: string };

function isValidRole(value: string): value is Role {
  return (Object.values(Role) as string[]).includes(value);
}

/** Regras mínimas da senha temporária (iguais às da troca de senha). */
function validatePassword(password: string): string | null {
  if (!password) return "Informe a senha temporária.";
  if (password.length < 8) return "A senha deve ter no mínimo 8 caracteres.";
  if (!/[A-Za-z]/.test(password)) return "A senha deve conter pelo menos 1 letra.";
  if (!/\d/.test(password)) return "A senha deve conter pelo menos 1 número.";
  return null;
}

/** Cria um usuário com senha temporária (hash) e troca obrigatória no 1º acesso. */
export async function createUser(input: CreateUserInput): Promise<ServiceResult<AdminUserRow>> {
  const name = input.name?.trim();
  const login = input.login?.trim().toLowerCase();
  const email = input.email?.trim() || undefined;
  const role = input.role?.trim();

  if (!name) return { ok: false, status: 400, message: "Informe o nome.", field: "name" };
  if (!login) return { ok: false, status: 400, message: "Informe o login.", field: "login" };
  if (!/^[a-z0-9._-]{3,}$/.test(login)) {
    return { ok: false, status: 400, message: "Login: mín. 3 caracteres (letras, números, ponto, hífen).", field: "login" };
  }
  if (!role || !isValidRole(role)) return { ok: false, status: 400, message: "Papel inválido.", field: "role" };
  const passwordError = validatePassword(input.temporaryPassword);
  if (passwordError) return { ok: false, status: 400, message: passwordError, field: "temporaryPassword" };

  // Login/e-mail únicos: checa antes para devolver mensagem amigável.
  const existing = await prisma.user.findFirst({
    where: { OR: [{ login }, ...(email ? [{ email }] : [])] },
    select: { login: true, email: true }
  });
  if (existing) {
    if (existing.login === login) return { ok: false, status: 409, message: "Já existe um usuário com este login.", field: "login" };
    return { ok: false, status: 409, message: "Já existe um usuário com este e-mail.", field: "email" };
  }

  const now = new Date();
  const requireChange = input.requirePasswordChange !== false;

  try {
    const created = await prisma.user.create({
      data: {
        name,
        login,
        email,
        passwordHash: await hashPassword(input.temporaryPassword),
        role: role as Role,
        status: UserStatus.ATIVO,
        mustChangePassword: requireChange,
        ...(requireChange
          ? {
              temporaryPasswordCreatedAt: now,
              temporaryPasswordExpiresAt: new Date(now.getTime() + TEMP_PASSWORD_TTL_DAYS * 24 * 60 * 60 * 1000)
            }
          : {})
      },
      select: SELECT
    });
    return { ok: true, data: toRow(created) };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, status: 409, message: "Login ou e-mail já cadastrado.", field: "login" };
    }
    throw error;
  }
}

export type UpdateUserFlags = {
  /** Força (ou desativa) a troca de senha no próximo acesso. */
  mustChangePassword?: boolean;
  status?: UserStatus;
};

/** Atualiza flags administrativas de um usuário (sem tocar na senha). */
export async function updateUserFlags(id: string, flags: UpdateUserFlags): Promise<ServiceResult<AdminUserRow>> {
  const data: Prisma.UserUpdateInput = {};
  if (typeof flags.mustChangePassword === "boolean") {
    data.mustChangePassword = flags.mustChangePassword;
    if (flags.mustChangePassword) {
      data.temporaryPasswordCreatedAt = new Date();
    }
  }
  if (flags.status && (Object.values(UserStatus) as string[]).includes(flags.status)) {
    data.status = flags.status;
  }
  if (Object.keys(data).length === 0) {
    return { ok: false, status: 400, message: "Nada para atualizar." };
  }

  try {
    const updated = await prisma.user.update({ where: { id }, data, select: SELECT });
    return { ok: true, data: toRow(updated) };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return { ok: false, status: 404, message: "Usuário não encontrado." };
    }
    throw error;
  }
}
