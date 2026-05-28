import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const TASK_PROMPTS: Record<string, string> = {
  analyze: "Analyze the following code or text. Identify issues, patterns, and provide insights.",
  review: "Review this code for bugs, security issues, performance problems, and best practice violations.",
  plan: "Create a detailed architecture and implementation plan for the following.",
  refactor: "Analyze this code and provide a refactoring plan with specific improvements.",
  bug_diagnosis: "Diagnose the bug described below. Identify the root cause and propose fixes.",
  test_generation: "Generate comprehensive tests for the following code.",
  security_review: "Perform a security review of the following. Identify vulnerabilities and suggest mitigations.",
  performance_analysis: "Analyze the performance of the following. Identify bottlenecks and suggest optimizations.",
  pr_description: "Generate a PR description based on the following changes.",
  commit_message: "Generate a concise, conventional commit message for the following changes.",
  requirement_breakdown: "Break down the following requirements into actionable tasks and user stories.",
};

export async function POST(request: Request, { params }: { params: Promise<{ task: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { task } = await params;
  const taskPrompt = TASK_PROMPTS[task];
  if (!taskPrompt) {
    return NextResponse.json({ error: `Unknown task: ${task}. Available: ${Object.keys(TASK_PROMPTS).join(", ")}` }, { status: 400 });
  }

  const body = await request.json();
  const { messages: rawMessages, model_endpoint_id, strategy = "balanced", temperature, max_tokens } = body;

  if (!rawMessages || rawMessages.length === 0) {
    return NextResponse.json({ error: "Messages are required" }, { status: 400 });
  }

  const messages = [
    { role: "system" as const, content: taskPrompt },
    ...rawMessages,
  ];

  const res = await fetch(new URL("/api/chat", request.url).toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages,
      model_endpoint_id,
      strategy,
      task_type: task,
      temperature: temperature ?? 0.3,
      max_tokens,
      scan_sensitive: true,
    }),
  });

  return res;
}
