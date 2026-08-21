import type { Block, Profile, Plan, ServiceItem, Testimonial } from "../../db/types";

type FullProfile = Profile & {
  blocks: Block[];
  services: ServiceItem[];
  testimonials: Testimonial[];
  plan?: Plan | null;
  showBranding?: boolean;
};

export const presentBlock = (block: Block) => ({
  id: block.id,
  type: block.type,
  title: block.title,
  content: block.content,
  sortOrder: block.sortOrder,
  isVisible: block.isVisible,
});

export const presentService = (service: ServiceItem) => ({
  id: service.id,
  name: service.name,
  description: service.description,
  priceCents: service.priceCents,
  // conveniencia para o FE nao precisar formatar preco na mao
  priceFormatted: (service.priceCents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  }),
  sortOrder: service.sortOrder,
  isVisible: service.isVisible,
});

export const presentTestimonial = (testimonial: Testimonial) => ({
  id: testimonial.id,
  authorName: testimonial.authorName,
  text: testimonial.text,
  rating: testimonial.rating,
  sortOrder: testimonial.sortOrder,
  isVisible: testimonial.isVisible,
});

/** Shape enxuto do perfil usado no painel do usuario logado. */
export const presentProfile = (profile: Profile) => ({
  id: profile.id,
  username: profile.username,
  displayName: profile.displayName,
  headline: profile.headline,
  bio: profile.bio,
  avatarUrl: profile.avatarUrl,
  location: profile.location,
  theme: profile.theme,
  status: profile.status,
  publishedAt: profile.publishedAt,
  canChangeUsername: profile.status === "DRAFT" || profile.usernameChangesAfterPublish < 1,
  createdAt: profile.createdAt,
  updatedAt: profile.updatedAt,
});

/**
 * Shape da pagina publica (GET /p/:username e GET /me/profile/preview).
 * `onlyVisible` = false no preview, para o dono ver tambem os blocos ocultos.
 */
export function presentPublicPage(profile: FullProfile, onlyVisible = true) {
  function ordered<T extends { isVisible: boolean; sortOrder: number }>(items: T[]): T[] {
    const list = onlyVisible ? items.filter((item) => item.isVisible) : items;
    return [...list].sort((a, b) => a.sortOrder - b.sortOrder);
  }

  return {
    username: profile.username,
    displayName: profile.displayName,
    headline: profile.headline,
    bio: profile.bio,
    avatarUrl: profile.avatarUrl,
    location: profile.location,
    theme: profile.theme,
    status: profile.status,
    publishedAt: profile.publishedAt,
    plan: profile.plan ?? null,
    showBranding: profile.showBranding ?? profile.plan !== "PREMIUM",
    blocks: ordered(profile.blocks).map(presentBlock),
    services: ordered(profile.services).map(presentService),
    testimonials: ordered(profile.testimonials).map(presentTestimonial),
  };
}
