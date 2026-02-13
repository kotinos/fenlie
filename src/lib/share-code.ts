import { supabase } from "./supabase";

// ---------------------------------------------------------------------------
// Share-code generation
// ---------------------------------------------------------------------------

const CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const CODE_LENGTH = 6;

/** Generate a random 6-character uppercase alphanumeric code. */
function randomCode(): string {
  const bytes = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => CHARSET[b % CHARSET.length])
    .join("");
}

/**
 * Generate a unique share code, retrying up to 3 times on collision.
 * Returns the code string.
 */
export async function generateUniqueShareCode(): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = randomCode();
    const { data } = await supabase
      .from("sessions")
      .select("id")
      .eq("share_code", code)
      .maybeSingle();
    if (!data) return code; // no collision
  }
  throw new Error("Failed to generate unique share code after 3 attempts");
}

/** Build the full shareable join URL for a share code. */
export function buildShareUrl(shareCode: string): string {
  const base =
    typeof window !== "undefined"
      ? window.location.origin
      : process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${base}/join/${shareCode.toUpperCase()}`;
}

/** Extract a share code from a full URL, e.g. https://…/join/A3KF9X → A3KF9X */
export function extractCodeFromUrl(url: string): string | null {
  const match = url.match(/\/join\/([A-Za-z0-9]{6,8})$/);
  return match ? match[1].toUpperCase() : null;
}
