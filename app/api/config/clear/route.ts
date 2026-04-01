import { NextResponse } from "next/server";
import { clearAllSyncData } from "../../_syncStoreSqlServer";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const result = await clearAllSyncData();
    return NextResponse.json({
      success: true,
      message: `Cancellazione completata: ${result.deletedJobs} job rimossi, ${result.deletedRows} righe database eliminate`,
      ...result,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Errore durante la cancellazione" },
      { status: 500 }
    );
  }
}