import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const session = await prisma.chatSession.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      metadata: { source: 'seed' },
      messages: {
        create: [
          {
            role: 'user',
            content: 'How long is the return window?',
          },
          {
            role: 'assistant',
            content:
              'Our return policy lasts 30 days from the delivery date as long as items are unused.',
          },
        ],
      },
    },
  });

  console.log('Seeded session', session.id);
}

main()
  .catch((err) => {
    console.error('Seed failed', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

