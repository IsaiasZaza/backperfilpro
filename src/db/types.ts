/** Tipos das tabelas do PerfilPro (substitui o Prisma Client). */

export type ProfileStatus = "DRAFT" | "PUBLISHED";

export type BlockType =
  | "HERO"
  | "CTA_BUTTON"
  | "LINK_BUTTON"
  | "WHATSAPP"
  | "SOCIAL"
  | "SERVICES"
  | "TESTIMONIALS"
  | "LOCATION";

export type Plan = "FREE" | "PRO" | "PREMIUM";

export type SubscriptionStatus =
  | "INCOMPLETE"
  | "INCOMPLETE_EXPIRED"
  | "TRIALING"
  | "ACTIVE"
  | "PAST_DUE"
  | "CANCELED"
  | "UNPAID"
  | "PAUSED";

export type User = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  emailVerifiedAt: Date | null;
  stripeCustomerId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type Subscription = {
  id: string;
  userId: string;
  plan: Plan;
  status: SubscriptionStatus;
  stripeSubscriptionId: string | null;
  stripePriceId: string | null;
  trialUsed: boolean;
  trialEndsAt: Date | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: Date | null;
  lastStripeEventCreated: number | null;
  createdAt: Date;
  updatedAt: Date;
};

export type Profile = {
  id: string;
  userId: string;
  username: string | null;
  displayName: string | null;
  headline: string | null;
  bio: string | null;
  avatarUrl: string | null;
  location: string | null;
  theme: Record<string, unknown>;
  status: ProfileStatus;
  publishedAt: Date | null;
  usernameChangesAfterPublish: number;
  createdAt: Date;
  updatedAt: Date;
};

export type Block = {
  id: string;
  profileId: string;
  type: BlockType;
  title: string | null;
  content: Record<string, unknown>;
  sortOrder: number;
  isVisible: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type ServiceItem = {
  id: string;
  profileId: string;
  name: string;
  description: string | null;
  priceCents: number;
  sortOrder: number;
  isVisible: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type Testimonial = {
  id: string;
  profileId: string;
  authorName: string;
  text: string;
  rating: number;
  sortOrder: number;
  isVisible: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type RefreshToken = {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
};

export type PasswordResetToken = {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
};
