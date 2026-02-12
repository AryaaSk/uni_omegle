import { NextResponse } from "next/server";

export async function GET() {
  const keyId = process.env.CLOUDFLARE_TURN_KEY_ID;
  const apiToken = process.env.CLOUDFLARE_TURN_API_TOKEN;

  if (!keyId || !apiToken) {
    return NextResponse.json(
      { error: "TURN server not configured" },
      { status: 503 }
    );
  }

  try {
    const res = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${keyId}/credentials/generate-ice-servers`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ttl: 86400 }),
      }
    );

    if (!res.ok) {
      const text = await res.text();
      console.error("Cloudflare TURN API error:", res.status, text);
      return NextResponse.json(
        { error: "Failed to generate TURN credentials" },
        { status: 502 }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    console.error("TURN credential fetch error:", err);
    return NextResponse.json(
      { error: "Failed to generate TURN credentials" },
      { status: 500 }
    );
  }
}
