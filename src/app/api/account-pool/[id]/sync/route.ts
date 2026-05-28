import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { syncAccount } from "@/lib/account-pool/sync";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const result = await syncAccount(id, user);

  if (!result.success) {
    return NextResponse.json({ error: result.error || "同步失败" }, { status: 500 });
  }

  return NextResponse.json({ data: result });
}
