import { prisma } from "@/app/server/prisma";

async function main() {
  let house = await prisma.user.findUnique({ where: { handle: "house" } });
  if (!house) {
    house = await prisma.user.create({
      data: {
        handle: "house",
        epicId: "HOUSE_SYSTEM",
        displayName: "House",
        isOwner: true,
      },
    });
    console.log("Created house user:", house.id);
  } else {
    console.log("House user already exists:", house.id);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => process.exit(0));