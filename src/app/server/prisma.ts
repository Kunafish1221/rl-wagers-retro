// src/app/server/prisma.ts
import { PrismaClient } from '@prisma/client'

// Prevent multiple PrismaClient instances in dev (hot reload safe)
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient
}

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['warn', 'error'], // add 'query' if you want SQL logs
  })

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}