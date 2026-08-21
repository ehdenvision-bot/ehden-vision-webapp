import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Roles + canEdit/isClientRole derived from Security_Code.js:
// authorizedRoles = [admin, directeur, collaborateur] can edit;
// viseur is added to clientExcludedRoles (read-only, non-client);
// everything else is treated as a client (read-only) role.
const ROLES = [
  { name: "Admin", canEdit: true, isClientRole: false },
  { name: "Directeur", canEdit: true, isClientRole: false },
  { name: "Utilisateur", canEdit: true, isClientRole: false },
  { name: "Viseur", canEdit: false, isClientRole: false },
  { name: "MOA", canEdit: false, isClientRole: true },
  { name: "MOE/Architect", canEdit: false, isClientRole: true },
  { name: "MOE/BET", canEdit: false, isClientRole: true },
  { name: "BC", canEdit: false, isClientRole: true },
  { name: "SPS", canEdit: false, isClientRole: true },
  { name: "AMO", canEdit: false, isClientRole: true },
  { name: "Sous-Traitant", canEdit: false, isClientRole: true },
];

async function main() {
  const roles = {};
  for (const r of ROLES) {
    roles[r.name] = await prisma.role.upsert({
      where: { name: r.name },
      update: { canEdit: r.canEdit, isClientRole: r.isClientRole },
      create: r,
    });
  }

  const passwordHash = await bcrypt.hash("changeme123", 10);
  await prisma.user.upsert({
    where: { email: "admin@example.com" },
    update: {},
    create: {
      email: "admin@example.com",
      passwordHash,
      fullName: "Admin",
      roleId: roles.Admin.id,
    },
  });

  console.log("Seed complete. Login with admin@example.com / changeme123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
