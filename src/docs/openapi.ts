import { env } from "../config/env";

/**
 * Documento OpenAPI 3.0 escrito na mao (sem gerador) para ficar facil de ler e ajustar.
 * Ele e servido em /docs (Swagger UI) e em /openapi.json.
 */

const errorResponse = {
  type: "object",
  properties: {
    data: { type: "object", nullable: true, example: null },
    error: {
      type: "object",
      properties: {
        code: { type: "string", example: "VALIDATION_ERROR" },
        message: { type: "string", example: "Dados invalidos" },
        details: { type: "array", items: { type: "object" } },
      },
    },
  },
} as const;

/** Envelope padrao de sucesso: { data: <schema>, error: null }. */
const success = (schema: object) => ({
  type: "object",
  properties: {
    data: schema,
    error: { type: "object", nullable: true, example: null },
  },
});

const json = (description: string, schema: object) => ({
  description,
  content: { "application/json": { schema } },
});

const errors = {
  400: json("Requisicao invalida", errorResponse),
  401: json("Nao autenticado", errorResponse),
  403: json("Sem permissao", errorResponse),
  404: json("Nao encontrado", errorResponse),
  409: json("Conflito", errorResponse),
  422: json("Erro de validacao", errorResponse),
  429: json("Muitas requisicoes", errorResponse),
};

const userSchema = {
  type: "object",
  properties: {
    id: { type: "string", format: "uuid" },
    name: { type: "string", example: "Maria Oliveira" },
    email: { type: "string", example: "maria@demo.com" },
    emailVerifiedAt: { type: "string", format: "date-time", nullable: true },
    createdAt: { type: "string", format: "date-time" },
  },
};

const profileSchema = {
  type: "object",
  properties: {
    id: { type: "string", format: "uuid" },
    username: { type: "string", nullable: true, example: "maria-oliveira" },
    displayName: { type: "string", nullable: true, example: "Maria Oliveira" },
    headline: { type: "string", nullable: true, example: "Lash Designer" },
    bio: { type: "string", nullable: true },
    avatarUrl: { type: "string", nullable: true },
    location: { type: "string", nullable: true, example: "Brasilia - DF" },
    theme: { type: "object", example: { primaryColor: "#7C3AED", buttonStyle: "pill" } },
    status: { type: "string", enum: ["DRAFT", "PUBLISHED"] },
    publishedAt: { type: "string", format: "date-time", nullable: true },
    canChangeUsername: { type: "boolean" },
  },
};

const blockSchema = {
  type: "object",
  properties: {
    id: { type: "string", format: "uuid" },
    type: {
      type: "string",
      enum: [
        "HERO",
        "CTA_BUTTON",
        "LINK_BUTTON",
        "WHATSAPP",
        "SOCIAL",
        "SERVICES",
        "TESTIMONIALS",
        "LOCATION",
      ],
    },
    title: { type: "string", nullable: true },
    content: {
      type: "object",
      description: "Formato varia conforme o `type`. Veja a descricao da rota POST /me/profile/blocks.",
      example: { label: "Agendar horario", url: "https://wa.me/5561999999999", style: "primary" },
    },
    sortOrder: { type: "integer", example: 0 },
    isVisible: { type: "boolean", example: true },
  },
};

const serviceSchema = {
  type: "object",
  properties: {
    id: { type: "string", format: "uuid" },
    name: { type: "string", example: "Volume Brasileiro" },
    description: { type: "string", nullable: true },
    priceCents: { type: "integer", example: 18000 },
    priceFormatted: { type: "string", example: "R$ 180,00" },
    sortOrder: { type: "integer" },
    isVisible: { type: "boolean" },
  },
};

const testimonialSchema = {
  type: "object",
  properties: {
    id: { type: "string", format: "uuid" },
    authorName: { type: "string", example: "Juliana Prado" },
    text: { type: "string" },
    rating: { type: "integer", minimum: 1, maximum: 5 },
    sortOrder: { type: "integer" },
    isVisible: { type: "boolean" },
  },
};

const publicPageSchema = {
  type: "object",
  properties: {
    username: { type: "string" },
    displayName: { type: "string", nullable: true },
    headline: { type: "string", nullable: true },
    bio: { type: "string", nullable: true },
    avatarUrl: { type: "string", nullable: true },
    location: { type: "string", nullable: true },
    theme: { type: "object" },
    status: { type: "string", enum: ["DRAFT", "PUBLISHED"] },
    publishedAt: { type: "string", format: "date-time", nullable: true },
    blocks: { type: "array", items: blockSchema },
    services: { type: "array", items: serviceSchema },
    testimonials: { type: "array", items: testimonialSchema },
  },
};

const authSuccess = success({
  type: "object",
  properties: { user: userSchema, accessToken: { type: "string" } },
});

const body = (schema: object, required = true) => ({
  required,
  content: { "application/json": { schema } },
});

const idParam = {
  name: "id",
  in: "path",
  required: true,
  schema: { type: "string", format: "uuid" },
};

export const openapiDocument = {
  openapi: "3.0.3",
  info: {
    title: "PerfilPro API",
    version: "1.0.0",
    description: [
      "API do PerfilPro: autenticacao, builder de pagina (blocos) e pagina publica estilo Linktree.",
      "",
      "**Formato das respostas**: sempre `{ \"data\": ..., \"error\": null }` ou `{ \"data\": null, \"error\": { \"code\": \"...\", \"message\": \"...\" } }`.",
      "",
      "**Autenticacao**: apos login/registro a API devolve `accessToken` no corpo e grava os cookies httpOnly `pp_access_token` e `pp_refresh_token`.",
      "No Swagger, clique em *Authorize* e cole o `accessToken`.",
      "",
      "**Usuario de demonstracao (seed)**: `maria@demo.com` / `Demo1234!` - pagina publica em `/p/maria-oliveira`.",
    ].join("\n"),
  },
  servers: [{ url: env.APP_URL }],
  tags: [
    { name: "Auth", description: "Cadastro, login, sessao e recuperacao de senha" },
    { name: "Perfil", description: "Dados da pagina do usuario logado" },
    { name: "Blocos", description: "Builder estilo WordPress: blocos da pagina" },
    { name: "Servicos" },
    { name: "Depoimentos" },
    { name: "Publico", description: "Rotas abertas, sem autenticacao" },
  ],
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      cookieAuth: { type: "apiKey", in: "cookie", name: "pp_access_token" },
    },
  },
  security: [{ bearerAuth: [] }, { cookieAuth: [] }],
  paths: {
    "/health": {
      get: {
        tags: ["Publico"],
        summary: "Healthcheck",
        security: [],
        responses: { 200: json("API no ar", success({ type: "object" })) },
      },
    },

    "/auth/register": {
      post: {
        tags: ["Auth"],
        summary: "Cria a conta e ja gera um perfil DRAFT",
        security: [],
        requestBody: body({
          type: "object",
          required: ["name", "email", "password", "confirmPassword"],
          properties: {
            name: { type: "string", example: "Maria Oliveira" },
            email: { type: "string", example: "maria@demo.com" },
            password: { type: "string", minLength: 8, example: "Demo1234!" },
            confirmPassword: { type: "string", example: "Demo1234!" },
          },
        }),
        responses: { 201: json("Conta criada", authSuccess), 409: errors[409], 422: errors[422] },
      },
    },

    "/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "Login com e-mail e senha",
        security: [],
        requestBody: body({
          type: "object",
          required: ["email", "password"],
          properties: {
            email: { type: "string", example: "maria@demo.com" },
            password: { type: "string", example: "Demo1234!" },
          },
        }),
        responses: { 200: json("Autenticado", authSuccess), 401: errors[401], 429: errors[429] },
      },
    },

    "/auth/refresh": {
      post: {
        tags: ["Auth"],
        summary: "Gera novo access token a partir do refresh token (cookie ou body)",
        security: [],
        requestBody: body(
          {
            type: "object",
            properties: { refreshToken: { type: "string", description: "Opcional se o cookie estiver presente" } },
          },
          false,
        ),
        responses: { 200: json("Novo par de tokens", authSuccess), 401: errors[401] },
      },
    },

    "/auth/logout": {
      post: {
        tags: ["Auth"],
        summary: "Revoga o refresh token e limpa os cookies",
        responses: { 200: json("Sessao encerrada", success({ type: "object" })) },
      },
    },

    "/auth/forgot-password": {
      post: {
        tags: ["Auth"],
        summary: "Envia o link de recuperacao (em dev, o link aparece no terminal)",
        security: [],
        requestBody: body({
          type: "object",
          required: ["email"],
          properties: { email: { type: "string", example: "maria@demo.com" } },
        }),
        responses: { 200: json("Mensagem generica", success({ type: "object" })), 429: errors[429] },
      },
    },

    "/auth/reset-password": {
      post: {
        tags: ["Auth"],
        summary: "Troca a senha usando o token recebido por e-mail",
        security: [],
        requestBody: body({
          type: "object",
          required: ["token", "password", "confirmPassword"],
          properties: {
            token: { type: "string" },
            password: { type: "string", minLength: 8 },
            confirmPassword: { type: "string" },
          },
        }),
        responses: { 200: json("Senha alterada", success({ type: "object" })), 401: errors[401] },
      },
    },

    "/auth/me": {
      get: {
        tags: ["Auth"],
        summary: "Dados do usuario logado",
        responses: { 200: json("Usuario", success(userSchema)), 401: errors[401] },
      },
    },

    "/me/profile": {
      get: {
        tags: ["Perfil"],
        summary: "Perfil do usuario logado",
        responses: { 200: json("Perfil", success(profileSchema)), 401: errors[401] },
      },
      put: {
        tags: ["Perfil"],
        summary: "Atualiza dados do perfil",
        description:
          "Regra do username: livre enquanto DRAFT; depois de publicado permite no maximo 1 troca.",
        requestBody: body({
          type: "object",
          properties: {
            username: { type: "string", example: "maria-oliveira" },
            displayName: { type: "string", example: "Maria Oliveira" },
            headline: { type: "string", example: "Lash Designer & Nail Artist" },
            bio: { type: "string" },
            avatarUrl: { type: "string" },
            location: { type: "string", example: "Brasilia - DF" },
            theme: {
              type: "object",
              example: { primaryColor: "#7C3AED", buttonStyle: "pill", font: "sans" },
            },
          },
        }),
        responses: {
          200: json("Perfil atualizado", success(profileSchema)),
          403: errors[403],
          409: errors[409],
          422: errors[422],
        },
      },
    },

    "/me/profile/publish": {
      post: {
        tags: ["Perfil"],
        summary: "Publica a pagina",
        description: "Exige username definitivo, displayName e pelo menos 1 bloco visivel.",
        responses: { 200: json("Publicado", success(profileSchema)), 400: errors[400] },
      },
    },

    "/me/profile/unpublish": {
      post: {
        tags: ["Perfil"],
        summary: "Volta a pagina para rascunho",
        responses: { 200: json("Despublicado", success(profileSchema)) },
      },
    },

    "/me/profile/preview": {
      get: {
        tags: ["Perfil"],
        summary: "Preview da pagina (mesmo shape da publica, inclui blocos ocultos)",
        responses: { 200: json("Preview", success(publicPageSchema)) },
      },
    },

    "/me/profile/avatar": {
      post: {
        tags: ["Perfil"],
        summary: "Upload da foto de perfil (multipart, campo `file`)",
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                properties: { file: { type: "string", format: "binary" } },
              },
            },
          },
        },
        responses: { 201: json("Avatar salvo", success({ type: "object" })), 400: errors[400] },
      },
    },

    "/me/profile/blocks": {
      get: {
        tags: ["Blocos"],
        summary: "Lista os blocos na ordem do builder",
        responses: { 200: json("Blocos", success({ type: "array", items: blockSchema })) },
      },
      post: {
        tags: ["Blocos"],
        summary: "Cria um bloco",
        description: [
          "Formato do `content` por tipo:",
          "- `HERO`: { name, headline, bio, avatarUrl, location }",
          "- `CTA_BUTTON`: { label, url, style: primary|secondary|outline }",
          "- `LINK_BUTTON`: { label, url, icon? }",
          "- `WHATSAPP`: { phone: '5561999999999', message?, label? }",
          "- `SOCIAL`: { items: [{ network: instagram|facebook|tiktok|youtube|linkedin|x|site, url }] }",
          "- `SERVICES`: { heading } (os itens vem de /me/profile/services)",
          "- `TESTIMONIALS`: { heading } (os itens vem de /me/profile/testimonials)",
          "- `LOCATION`: { address, mapsUrl?, label? }",
        ].join("\n"),
        requestBody: body({
          type: "object",
          required: ["type"],
          properties: {
            type: blockSchema.properties.type,
            title: { type: "string", nullable: true },
            content: { type: "object" },
            sortOrder: { type: "integer" },
            isVisible: { type: "boolean" },
          },
        }),
        responses: { 201: json("Bloco criado", success(blockSchema)), 422: errors[422] },
      },
    },

    "/me/profile/blocks/reorder": {
      put: {
        tags: ["Blocos"],
        summary: "Reordena os blocos (drag and drop)",
        requestBody: body({
          type: "array",
          items: {
            type: "object",
            required: ["id", "sortOrder"],
            properties: {
              id: { type: "string", format: "uuid" },
              sortOrder: { type: "integer" },
            },
          },
        }),
        responses: { 200: json("Nova ordem", success({ type: "array", items: blockSchema })) },
      },
    },

    "/me/profile/blocks/{id}": {
      patch: {
        tags: ["Blocos"],
        summary: "Atualiza um bloco (autosave do editor)",
        description: "O campo `content` e substituido por inteiro, nao e merge parcial.",
        parameters: [idParam],
        requestBody: body({
          type: "object",
          properties: {
            title: { type: "string", nullable: true },
            content: { type: "object" },
            sortOrder: { type: "integer" },
            isVisible: { type: "boolean" },
          },
        }),
        responses: { 200: json("Bloco atualizado", success(blockSchema)), 404: errors[404] },
      },
      delete: {
        tags: ["Blocos"],
        summary: "Remove um bloco",
        parameters: [idParam],
        responses: { 200: json("Removido", success({ type: "object" })), 404: errors[404] },
      },
    },

    "/me/profile/services": {
      get: {
        tags: ["Servicos"],
        summary: "Lista os servicos",
        responses: { 200: json("Servicos", success({ type: "array", items: serviceSchema })) },
      },
      post: {
        tags: ["Servicos"],
        summary: "Cria um servico",
        requestBody: body({
          type: "object",
          required: ["name", "priceCents"],
          properties: {
            name: { type: "string", example: "Volume Brasileiro" },
            description: { type: "string", nullable: true },
            priceCents: { type: "integer", example: 18000 },
            sortOrder: { type: "integer" },
            isVisible: { type: "boolean" },
          },
        }),
        responses: { 201: json("Servico criado", success(serviceSchema)), 422: errors[422] },
      },
    },

    "/me/profile/services/{id}": {
      patch: {
        tags: ["Servicos"],
        summary: "Atualiza um servico",
        parameters: [idParam],
        requestBody: body({ type: "object" }),
        responses: { 200: json("Atualizado", success(serviceSchema)), 404: errors[404] },
      },
      delete: {
        tags: ["Servicos"],
        summary: "Remove um servico",
        parameters: [idParam],
        responses: { 200: json("Removido", success({ type: "object" })), 404: errors[404] },
      },
    },

    "/me/profile/testimonials": {
      get: {
        tags: ["Depoimentos"],
        summary: "Lista os depoimentos",
        responses: {
          200: json("Depoimentos", success({ type: "array", items: testimonialSchema })),
        },
      },
      post: {
        tags: ["Depoimentos"],
        summary: "Cria um depoimento",
        requestBody: body({
          type: "object",
          required: ["authorName", "text"],
          properties: {
            authorName: { type: "string", example: "Juliana Prado" },
            text: { type: "string", example: "Atendimento impecavel!" },
            rating: { type: "integer", minimum: 1, maximum: 5, example: 5 },
            sortOrder: { type: "integer" },
            isVisible: { type: "boolean" },
          },
        }),
        responses: { 201: json("Depoimento criado", success(testimonialSchema)) },
      },
    },

    "/me/profile/testimonials/{id}": {
      patch: {
        tags: ["Depoimentos"],
        summary: "Atualiza um depoimento",
        parameters: [idParam],
        requestBody: body({ type: "object" }),
        responses: { 200: json("Atualizado", success(testimonialSchema)), 404: errors[404] },
      },
      delete: {
        tags: ["Depoimentos"],
        summary: "Remove um depoimento",
        parameters: [idParam],
        responses: { 200: json("Removido", success({ type: "object" })), 404: errors[404] },
      },
    },

    "/p/{username}": {
      get: {
        tags: ["Publico"],
        summary: "Pagina publica pelo username",
        description: "Retorna 404 se o perfil nao existir ou ainda estiver em DRAFT.",
        security: [],
        parameters: [
          {
            name: "username",
            in: "path",
            required: true,
            schema: { type: "string" },
            example: "maria-oliveira",
          },
        ],
        responses: { 200: json("Pagina publica", success(publicPageSchema)), 404: errors[404] },
      },
    },

    "/usernames/check": {
      get: {
        tags: ["Publico"],
        summary: "Verifica se um username esta disponivel",
        security: [],
        parameters: [
          {
            name: "username",
            in: "query",
            required: true,
            schema: { type: "string" },
            example: "maria-oliveira",
          },
        ],
        responses: {
          200: json(
            "Resultado",
            success({
              type: "object",
              properties: {
                available: { type: "boolean" },
                reason: {
                  type: "string",
                  nullable: true,
                  enum: ["INVALID_FORMAT", "RESERVED", "TAKEN", null],
                },
                message: { type: "string" },
              },
            }),
          ),
        },
      },
    },
  },
};
