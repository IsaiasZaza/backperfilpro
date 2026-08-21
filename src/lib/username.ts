/** Palavras que nao podem virar username porque colidem com rotas/marca. */
export const RESERVED_USERNAMES = new Set([
  "admin",
  "administrador",
  "api",
  "app",
  "auth",
  "blog",
  "checkout",
  "config",
  "contato",
  "dashboard",
  "docs",
  "help",
  "login",
  "logout",
  "me",
  "null",
  "p",
  "perfil",
  "perfilpro",
  "pricing",
  "privacy",
  "register",
  "root",
  "settings",
  "signup",
  "suporte",
  "support",
  "terms",
  "undefined",
  "user",
  "usernames",
  "www",
]);

export const USERNAME_REGEX = /^[a-z0-9][a-z0-9-_]{1,28}[a-z0-9]$/;

export const isReservedUsername = (username: string) =>
  RESERVED_USERNAMES.has(username.toLowerCase());

/** Gera um username temporario para o perfil criado no cadastro (ex.: user-a1b2c3d4). */
export const buildTemporaryUsername = (userId: string) => `user-${userId.slice(0, 8)}`;
