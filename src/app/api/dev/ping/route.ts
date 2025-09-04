// src/app/api/_dev/ping/route.ts
import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    ok: true,
    env: process.env.NODE_ENV ?? 'unknown',
    time: new Date().toISOString(),
  });
}