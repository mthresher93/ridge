import { NextResponse } from "next/server";
import { azimuthToConduit, mergeConduitIntoAzimuth } from "@/lib/conduit-bridge";
import { loadAzimuth, loadConduitProduct, saveAzimuth, saveConduitProduct } from "@/lib/workspace-io";

export async function GET() {
  const { workspace, updatedAt } = await loadAzimuth();
  const product = await loadConduitProduct();
  return NextResponse.json({
    workspace: {
      crm: azimuthToConduit(workspace),
      product,
    },
    updatedAt,
  });
}

export async function PUT(request: Request) {
  const body = (await request.json()) as {
    workspace?: { crm?: unknown; product?: unknown };
    crm?: unknown;
    product?: unknown;
  };
  const crm = body.crm ?? body.workspace?.crm;
  const product = body.product ?? body.workspace?.product;
  if (product) await saveConduitProduct(product);
  if (crm && typeof crm === "object") {
    const record = crm as { leads?: unknown[] };
    if (Array.isArray(record.leads) && record.leads.length) {
      const { workspace } = await loadAzimuth();
      await saveAzimuth(mergeConduitIntoAzimuth(workspace, crm));
    }
  }
  return NextResponse.json({ ok: true });
}
