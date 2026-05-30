import { NextResponse } from "next/server";
import { withAuthParams } from "@/lib/api-handler";
import { syncAccount } from "@/lib/account-pool/sync";

export const POST = withAuthParams(async ({ user }, _req, { id }) => {
  const result = await syncAccount(id, user);

  if (!result.success) {
    return NextResponse.json({ error: result.error || "Sync failed" }, { status: 500 });
  }

  return NextResponse.json({ data: result });
});
