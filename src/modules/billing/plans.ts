import type { BlockType, Plan } from "../../db/types";

export type PlanEntitlements = {
  maxBlocks: number | null;
  maxServices: number | null;
  maxTestimonials: number | null;
  allowedBlockTypes: BlockType[] | null;
  customTheme: boolean;
  removeBranding: boolean;
  prioritySupport: boolean;
};

export type PlanCatalogItem = {
  id: Plan;
  name: string;
  description: string;
  priceCents: number;
  currency: "BRL";
  interval: "month";
  features: string[];
  entitlements: PlanEntitlements;
};

const ALL_BLOCK_TYPES: BlockType[] = [
  "HERO",
  "CTA_BUTTON",
  "LINK_BUTTON",
  "WHATSAPP",
  "SOCIAL",
  "SERVICES",
  "TESTIMONIALS",
  "LOCATION",
];

export const PLAN_CATALOG: Record<Plan, PlanCatalogItem> = {
  FREE: {
    id: "FREE",
    name: "Free",
    description: "Comece agora: pagina publica com marca PerfilPro e limites do plano gratuito.",
    priceCents: 0,
    currency: "BRL",
    interval: "month",
    features: [
      "Pagina publica com username",
      "Ate 4 blocos (Hero, link, WhatsApp e redes)",
      "Ate 2 servicos e 2 depoimentos",
      "Marca PerfilPro na pagina",
    ],
    entitlements: {
      maxBlocks: 4,
      maxServices: 2,
      maxTestimonials: 2,
      allowedBlockTypes: ["HERO", "LINK_BUTTON", "WHATSAPP", "SOCIAL"],
      customTheme: false,
      removeBranding: false,
      prioritySupport: false,
    },
  },
  PRO: {
    id: "PRO",
    name: "Pro",
    description: "Pagina profissional com blocos, servicos e depoimentos ilimitados.",
    priceCents: 2000,
    currency: "BRL",
    interval: "month",
    features: [
      "Pagina publica profissional",
      "Blocos, servicos e depoimentos ilimitados",
      "Todos os tipos de bloco",
      "Temas e cores personalizaveis",
    ],
    entitlements: {
      maxBlocks: null,
      maxServices: null,
      maxTestimonials: null,
      allowedBlockTypes: ALL_BLOCK_TYPES,
      customTheme: true,
      removeBranding: false,
      prioritySupport: false,
    },
  },
  PREMIUM: {
    id: "PREMIUM",
    name: "Premium",
    description: "Tudo do Pro, sem marca PerfilPro e com suporte prioritario.",
    priceCents: 3900,
    currency: "BRL",
    interval: "month",
    features: [
      "Tudo do plano Pro",
      "Sem marca PerfilPro na pagina",
      "Temas avancados",
      "Suporte prioritario",
    ],
    entitlements: {
      maxBlocks: null,
      maxServices: null,
      maxTestimonials: null,
      allowedBlockTypes: ALL_BLOCK_TYPES,
      customTheme: true,
      removeBranding: true,
      prioritySupport: true,
    },
  },
};

export const PLAN_IDS = ["FREE", "PRO", "PREMIUM"] as const satisfies readonly Plan[];

export function listPlans() {
  return PLAN_IDS.map((id) => ({
    ...PLAN_CATALOG[id],
    priceFormatted: (PLAN_CATALOG[id].priceCents / 100).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    }),
  }));
}

export function getPlanCatalog(plan: Plan) {
  return PLAN_CATALOG[plan];
}
