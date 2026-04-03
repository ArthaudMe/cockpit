import { NextResponse } from "next/server";
import { fetchAllData } from "@/lib/datasources/manager";
import { ALL_RULES } from "@/lib/background/rules";
import { processNotifications } from "@/lib/background/notifier";

export async function GET() {
  try {
    // Reuse the existing data-fetching infrastructure
    const data = await fetchAllData();

    // Run all rules against the current data
    const candidates = ALL_RULES.flatMap((rule) => {
      try {
        return rule.check(data);
      } catch {
        return [];
      }
    });

    // Dedup and store — only returns genuinely new notifications
    const newNotifications = processNotifications(candidates);

    return NextResponse.json({
      newNotifications,
      newCount: newNotifications.length,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Tick failed", newNotifications: [], newCount: 0 },
      { status: 500 },
    );
  }
}
