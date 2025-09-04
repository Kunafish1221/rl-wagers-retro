/* eslint-disable no-console */
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

/**
 * Required ENV:
 * - WAGER_HOUSE_USER_ID   -> fixed id for the house user
 * - OWNER_HANDLE          -> your handle (used to locate or create your user)
 * - OWNER_EPIC_ID         -> required because User.epicId is non-null & unique
 *
 * Optional ENV:
 * - OWNER_DISPLAY_NAME
 * - OWNER_AVATAR_URL
 * - OWNER_IS_REF=true|false (default false)
 * - OWNER_EMAIL           (if you want to also seed login Credentials)
 * - OWNER_PASSWORD_HASH   (bcrypt or argon hash you generate separately)
 * - HOUSE_HANDLE          (default "house")
 * - HOUSE_DISPLAY_NAME    (default "House")
 * - HOUSE_AVATAR_URL
 * - HOUSE_EPIC_ID         (default "HOUSE_EPIC")
 */

function req(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Missing required env: ${name}`)
  return v
}

async function ensureLedgerAccount(userId: string) {
  const acc = await prisma.ledgerAccount.findUnique({ where: { userId } })
  if (!acc) {
    await prisma.ledgerAccount.create({
      data: { userId, available: 0, locked: 0 },
    })
    console.log(`  • LedgerAccount created for ${userId}`)
  }
}

async function main() {
  const HOUSE_USER_ID = req('WAGER_HOUSE_USER_ID')
  const OWNER_HANDLE = req('OWNER_HANDLE')
  const OWNER_EPIC_ID = req('OWNER_EPIC_ID')

  const OWNER_DISPLAY_NAME = process.env.OWNER_DISPLAY_NAME ?? null
  const OWNER_AVATAR_URL = process.env.OWNER_AVATAR_URL ?? null
  const OWNER_IS_REF = (process.env.OWNER_IS_REF ?? 'false').toLowerCase() === 'true'

  const OWNER_EMAIL = process.env.OWNER_EMAIL ?? null
  const OWNER_PASSWORD_HASH = process.env.OWNER_PASSWORD_HASH ?? null

  const HOUSE_HANDLE = process.env.HOUSE_HANDLE ?? 'house'
  const HOUSE_DISPLAY_NAME = process.env.HOUSE_DISPLAY_NAME ?? 'House'
  const HOUSE_AVATAR_URL = process.env.HOUSE_AVATAR_URL ?? null
  const HOUSE_EPIC_ID = process.env.HOUSE_EPIC_ID ?? 'HOUSE_EPIC'

  console.log('Seeding: house user & owner…')

  // 1) Upsert HOUSE user with fixed id
  const house = await prisma.user.upsert({
    where: { id: HOUSE_USER_ID },
    update: {
      handle: HOUSE_HANDLE,
      displayName: HOUSE_DISPLAY_NAME,
      epicId: HOUSE_EPIC_ID,
      avatarUrl: HOUSE_AVATAR_URL,
      isOwner: false,
      isRef: false,
    },
    create: {
      id: HOUSE_USER_ID,
      handle: HOUSE_HANDLE,
      displayName: HOUSE_DISPLAY_NAME,
      epicId: HOUSE_EPIC_ID, // unique non-null
      avatarUrl: HOUSE_AVATAR_URL,
      isOwner: false,
      isRef: false,
    },
  })
  console.log(`✔ HOUSE user ready: ${house.id} (@${house.handle})`)
  await ensureLedgerAccount(house.id)

  // 2) Upsert OWNER by handle (unique). If user exists, only set flags/fields.
  const owner = await prisma.user.upsert({
    where: { handle: OWNER_HANDLE },
    update: {
      displayName: OWNER_DISPLAY_NAME,
      avatarUrl: OWNER_AVATAR_URL,
      isOwner: true,
      isRef: OWNER_IS_REF,
      // epicId is unique; only set it if it’s missing
    },
    create: {
      handle: OWNER_HANDLE,
      displayName: OWNER_DISPLAY_NAME,
      epicId: OWNER_EPIC_ID, // required on create
      avatarUrl: OWNER_AVATAR_URL,
      isOwner: true,
      isRef: OWNER_IS_REF,
    },
  })

  // If owner exists but had no epicId (shouldn’t happen with current schema), you’d adjust here.
  console.log(`✔ OWNER ready: ${owner.id} (@${owner.handle})  isOwner=${owner.isOwner} isRef=${owner.isRef}`)
  await ensureLedgerAccount(owner.id)

  // 3) (Optional) seed credentials for owner if email & hash provided
  if (OWNER_EMAIL && OWNER_PASSWORD_HASH) {
    await prisma.credentials.upsert({
      where: { userId: owner.id },
      update: {
        email: OWNER_EMAIL,
        passwordHash: OWNER_PASSWORD_HASH,
      },
      create: {
        userId: owner.id,
        email: OWNER_EMAIL,
        passwordHash: OWNER_PASSWORD_HASH,
      },
    })
    console.log(`✔ OWNER credentials seeded for ${OWNER_EMAIL}`)
  } else {
    console.log('ℹ Skipping OWNER credentials (provide OWNER_EMAIL and OWNER_PASSWORD_HASH to seed).')
  }

  console.log('✅ Seed complete.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })