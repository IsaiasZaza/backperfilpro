import { env } from "../../config/env";
import type { Plan } from "../../db/types";

export type PlanEntitlements = {
  maxBlocks: number | null;
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
  trialDays: number;
  features: string[];
  entitlements: PlanEntitlements;
};

export const PLAN_CATALOG: Record<Plan, PlanCatalogItem> = {
  PRO: {
    id: "PRO",
    name: "Pro",
    description: "Pagina profissional com blocos, servicos e depoimentos.",
    priceCents: 2000,
    currency: "BRL",
    interval: "month",
    trialDays: env.STRIPE_TRIAL_DAYS,
    features: [
      "Pagina publica profissional",
      "Blocos, servicos e depoimentos ilimitados",
      "Temas e cores personalizaveis",
      `${env.STRIPE_TRIAL_DAYS} dias gratis`,
    ],
    entitlements: {
      maxBlocks: null,
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
    trialDays: env.STRIPE_TRIAL_DAYS,
    features: [
      "Tudo do plano Pro",
      "Sem marca PerfilPro na pagina",
      "Temas avancados",
      "Suporte prioritario",
      `${env.STRIPE_TRIAL_DAYS} dias gratis`,
    ],
    entitlements: {
      maxBlocks: null,
      customTheme: true,
      removeBranding: true,
      prioritySupport: true,
    },
  },
};

export const PLAN_IDS = ["PRO", "PREMIUM"] as const satisfies readonly Plan[];

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
