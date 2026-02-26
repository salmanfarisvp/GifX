import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const TOTAL_KEY = "gifx:total_visits";
const UNIQUE_KEY = "gifx:unique_visitors";

async function hashIP(ip: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(ip + (process.env.IP_SALT || "gifx-salt"));
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function GET(request: NextRequest) {
  try {
    const forwarded = request.headers.get("x-forwarded-for");
    const ip = forwarded?.split(",")[0]?.trim() || "unknown";
    const hashedIP = await hashIP(ip);

    const [total, isNew] = await Promise.all([
      redis.incr(TOTAL_KEY),
      redis.sadd(UNIQUE_KEY, hashedIP),
    ]);

    const unique = await redis.scard(UNIQUE_KEY);

    return NextResponse.json({
      total,
      unique,
      isNewVisitor: isNew === 1,
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch visitor stats" },
      { status: 500 },
    );
  }
}
