import { hashPassword } from "../src/lib/password";
import { closeDb, query, queryOne } from "../src/db/client";
import type { Profile, User } from "../src/db/types";

/**
 * Popula o banco com a Maria (mesmos dados do mock do frontend).
 * Rode com: npm run db:seed
 */
async function main() {
  const email = "maria@demo.com";

  await query(`DELETE FROM users WHERE email = $1`, [email]);

  const user = await queryOne<User>(
    `INSERT INTO users (name, email, "passwordHash", "emailVerifiedAt")
     VALUES ($1, $2, $3, NOW())
     RETURNING *`,
    ["Maria Oliveira", email, await hashPassword("Demo1234!")],
  );

  const theme = {
    primaryColor: "#7C3AED",
    backgroundColor: "#0F172A",
    textColor: "#F8FAFC",
    buttonStyle: "pill",
    font: "sans",
  };

  const profile = await queryOne<Profile>(
    `INSERT INTO profiles (
       "userId", username, "displayName", headline, bio, "avatarUrl",
       location, theme, status, "publishedAt"
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,'PUBLISHED',NOW())
     RETURNING *`,
    [
      user!.id,
      "maria-oliveira",
      "Maria Oliveira",
      "Lash Designer & Nail Artist",
      "Realco a sua beleza natural com tecnicas modernas e atendimento humanizado. Atendo com hora marcada em Brasilia.",
      "https://i.pravatar.cc/300?img=47",
      "Asa Norte, Brasilia - DF",
      JSON.stringify(theme),
    ],
  );

  const profileId = profile!.id;

  const blocks = [
    {
      type: "HERO",
      title: null,
      content: {
        name: "Maria Oliveira",
        headline: "Lash Designer & Nail Artist",
        bio: "Realco a sua beleza natural com tecnicas modernas e atendimento humanizado.",
        avatarUrl: "https://i.pravatar.cc/300?img=47",
        location: "Asa Norte, Brasilia - DF",
      },
      sortOrder: 0,
    },
    {
      type: "CTA_BUTTON",
      title: "Agendamento",
      content: {
        label: "Agendar horario",
        url: "https://calendly.com/maria-oliveira/atendimento",
        style: "primary",
      },
      sortOrder: 1,
    },
    {
      type: "WHATSAPP",
      title: null,
      content: {
        phone: "5561999999999",
        message: "Oi Maria! Vi seu perfil e quero agendar um horario.",
        label: "Chamar no WhatsApp",
      },
      sortOrder: 2,
    },
    {
      type: "SOCIAL",
      title: null,
      content: {
        items: [
          { network: "instagram", url: "https://instagram.com/maria.lashdesigner" },
          { network: "tiktok", url: "https://tiktok.com/@maria.lashdesigner" },
        ],
      },
      sortOrder: 3,
    },
    {
      type: "SERVICES",
      title: "Servicos",
      content: { heading: "Servicos" },
      sortOrder: 4,
    },
    {
      type: "TESTIMONIALS",
      title: "Depoimentos",
      content: { heading: "O que dizem sobre mim" },
      sortOrder: 5,
    },
    {
      type: "LOCATION",
      title: "Onde me encontrar",
      content: {
        address: "SCLN 210, Bloco B - Asa Norte, Brasilia - DF",
        mapsUrl: "https://maps.google.com/?q=SCLN+210+Bloco+B+Brasilia",
        label: "Ver no mapa",
      },
      sortOrder: 6,
    },
  ];

  for (const block of blocks) {
    await query(
      `INSERT INTO blocks ("profileId", type, title, content, "sortOrder")
       VALUES ($1, $2, $3, $4::jsonb, $5)`,
      [profileId, block.type, block.title, JSON.stringify(block.content), block.sortOrder],
    );
  }

  const services = [
    {
      name: "Volume Brasileiro",
      description: "Extensao de cilios fio a fio com efeito natural. Duracao: 2h",
      priceCents: 18000,
      sortOrder: 0,
    },
    {
      name: "Volume Russo",
      description: "Efeito marcante e cheio, para quem ama um olhar poderoso. Duracao: 2h30",
      priceCents: 24000,
      sortOrder: 1,
    },
    {
      name: "Manutencao de cilios",
      description: "Ate 21 dias depois da aplicacao.",
      priceCents: 9000,
      sortOrder: 2,
    },
  ];

  for (const service of services) {
    await query(
      `INSERT INTO service_items ("profileId", name, description, "priceCents", "sortOrder")
       VALUES ($1, $2, $3, $4, $5)`,
      [profileId, service.name, service.description, service.priceCents, service.sortOrder],
    );
  }

  await query(
    `INSERT INTO testimonials ("profileId", "authorName", text, rating, "sortOrder")
     VALUES
       ($1, 'Juliana Prado', 'Atendimento impecavel e resultado lindo demais! Ja virei cliente fixa.', 5, 0),
       ($1, 'Carol Menezes', 'A Maria tem uma mao leve, dormi durante todo o procedimento. Recomendo!', 5, 1)`,
    [profileId],
  );

  console.log("Seed concluido:");
  console.log("  login:  maria@demo.com / Demo1234!");
  console.log("  pagina: GET /p/maria-oliveira");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => closeDb());
