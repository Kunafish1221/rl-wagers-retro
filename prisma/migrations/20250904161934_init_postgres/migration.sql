-- CreateEnum
CREATE TYPE "public"."GameMode" AS ENUM ('ONE_V_ONE', 'TWO_V_TWO', 'THREE_V_THREE');

-- CreateEnum
CREATE TYPE "public"."MatchState" AS ENUM ('OPEN', 'FULL', 'COMPLETE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."Role" AS ENUM ('PLAYER', 'REF');

-- CreateEnum
CREATE TYPE "public"."Team" AS ENUM ('A', 'B', 'NONE');

-- CreateEnum
CREATE TYPE "public"."DepositProvider" AS ENUM ('solflare', 'coinbase', 'phantom', 'other');

-- CreateEnum
CREATE TYPE "public"."DepositIntentStatus" AS ENUM ('PENDING', 'CREDITED', 'EXPIRED');

-- CreateTable
CREATE TABLE "public"."User" (
    "id" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "displayName" TEXT,
    "epicId" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "availableWT" INTEGER NOT NULL DEFAULT 0,
    "lockedWT" INTEGER NOT NULL DEFAULT 0,
    "isRef" BOOLEAN NOT NULL DEFAULT false,
    "isOwner" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Wallet" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "chain" TEXT NOT NULL DEFAULT 'solana',
    "provider" "public"."DepositProvider" NOT NULL,
    "address" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Match" (
    "id" TEXT NOT NULL,
    "mode" "public"."GameMode" NOT NULL,
    "stakeWT" INTEGER NOT NULL,
    "state" "public"."MatchState" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "refId" TEXT NOT NULL,
    "winnerUserId" TEXT,

    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MatchParticipant" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "public"."Role" NOT NULL DEFAULT 'PLAYER',
    "team" "public"."Team" NOT NULL DEFAULT 'NONE',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Deposit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "public"."DepositProvider" NOT NULL,
    "txHash" TEXT NOT NULL,
    "fromAddr" TEXT NOT NULL,
    "toAddr" TEXT NOT NULL,
    "amountUSDC" INTEGER NOT NULL,
    "amountWT" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CREDITED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Deposit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Withdrawal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "public"."DepositProvider" NOT NULL,
    "address" TEXT NOT NULL,
    "amountWT" INTEGER NOT NULL,
    "amountUSDC" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PAID',
    "txHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Withdrawal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DepositIntent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amountUSD" INTEGER NOT NULL,
    "amountWT" INTEGER NOT NULL,
    "reference" TEXT NOT NULL,
    "status" "public"."DepositIntentStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "txHash" TEXT,
    "creditedDepositId" TEXT,
    "meta" JSONB,

    CONSTRAINT "DepositIntent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."LedgerAccount" (
    "userId" TEXT NOT NULL,
    "available" INTEGER NOT NULL DEFAULT 0,
    "locked" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "LedgerAccount_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "public"."LedgerEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "refId" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Credentials" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Session" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_handle_key" ON "public"."User"("handle");

-- CreateIndex
CREATE UNIQUE INDEX "User_epicId_key" ON "public"."User"("epicId");

-- CreateIndex
CREATE INDEX "User_handle_idx" ON "public"."User"("handle");

-- CreateIndex
CREATE INDEX "User_isRef_idx" ON "public"."User"("isRef");

-- CreateIndex
CREATE INDEX "Wallet_userId_provider_idx" ON "public"."Wallet"("userId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_chain_address_key" ON "public"."Wallet"("chain", "address");

-- CreateIndex
CREATE INDEX "MatchParticipant_userId_idx" ON "public"."MatchParticipant"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MatchParticipant_matchId_userId_key" ON "public"."MatchParticipant"("matchId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Deposit_txHash_key" ON "public"."Deposit"("txHash");

-- CreateIndex
CREATE INDEX "Deposit_userId_createdAt_idx" ON "public"."Deposit"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Deposit_fromAddr_idx" ON "public"."Deposit"("fromAddr");

-- CreateIndex
CREATE INDEX "Deposit_toAddr_idx" ON "public"."Deposit"("toAddr");

-- CreateIndex
CREATE UNIQUE INDEX "Withdrawal_txHash_key" ON "public"."Withdrawal"("txHash");

-- CreateIndex
CREATE INDEX "Withdrawal_userId_createdAt_idx" ON "public"."Withdrawal"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Withdrawal_address_idx" ON "public"."Withdrawal"("address");

-- CreateIndex
CREATE UNIQUE INDEX "DepositIntent_reference_key" ON "public"."DepositIntent"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "DepositIntent_txHash_key" ON "public"."DepositIntent"("txHash");

-- CreateIndex
CREATE INDEX "DepositIntent_userId_status_expiresAt_idx" ON "public"."DepositIntent"("userId", "status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Credentials_userId_key" ON "public"."Credentials"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Credentials_email_key" ON "public"."Credentials"("email");

-- CreateIndex
CREATE INDEX "Credentials_email_idx" ON "public"."Credentials"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "public"."Session"("token");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "public"."Session"("userId");

-- AddForeignKey
ALTER TABLE "public"."Wallet" ADD CONSTRAINT "Wallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Match" ADD CONSTRAINT "Match_refId_fkey" FOREIGN KEY ("refId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Match" ADD CONSTRAINT "Match_winnerUserId_fkey" FOREIGN KEY ("winnerUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MatchParticipant" ADD CONSTRAINT "MatchParticipant_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "public"."Match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MatchParticipant" ADD CONSTRAINT "MatchParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Deposit" ADD CONSTRAINT "Deposit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Withdrawal" ADD CONSTRAINT "Withdrawal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DepositIntent" ADD CONSTRAINT "DepositIntent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DepositIntent" ADD CONSTRAINT "DepositIntent_creditedDepositId_fkey" FOREIGN KEY ("creditedDepositId") REFERENCES "public"."Deposit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LedgerAccount" ADD CONSTRAINT "LedgerAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LedgerEntry" ADD CONSTRAINT "LedgerEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Credentials" ADD CONSTRAINT "Credentials_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
