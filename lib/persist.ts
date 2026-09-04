import { prisma } from "./prisma";
import type { CallLog, Proposal, RoofDesign, Workspace } from "./types";

export async function persistSolar(workspace: Workspace) {
  const designs = Object.values(workspace.designs || {});
  const proposals = Object.values(workspace.proposals || {});
  const logs = (workspace.callLogs || []).slice(0, 200);

  const ops = [
    ...designs.map((design) =>
      prisma.roofDesignRecord.upsert({
        where: { leadId: design.leadId },
        update: { payload: JSON.stringify(design) },
        create: { leadId: design.leadId, payload: JSON.stringify(design) },
      }),
    ),
    ...proposals.map((proposal) =>
      prisma.proposalRecord.upsert({
        where: { leadId: proposal.leadId },
        update: { payload: JSON.stringify(proposal) },
        create: { leadId: proposal.leadId, payload: JSON.stringify(proposal) },
      }),
    ),
  ];
  if (ops.length) await prisma.$transaction(ops);

  if (logs.length) {
    const existing = await prisma.callLogRecord.findMany({
      where: { id: { in: logs.map((log) => log.id) } },
      select: { id: true },
    });
    const seen = new Set(existing.map((row) => row.id));
    const fresh = logs.filter((log) => !seen.has(log.id));
    if (fresh.length) {
      await prisma.callLogRecord.createMany({
        data: fresh.map((log) => ({
          id: log.id,
          leadId: log.leadId,
          outcome: log.outcome,
          duration: log.duration,
          notes: log.notes,
          at: new Date(log.at),
        })),
      });
    }
  }
}

export async function hydrateSolar(workspace: Workspace): Promise<Workspace> {
  const [designRows, proposalRows, logRows] = await Promise.all([
    prisma.roofDesignRecord.findMany(),
    prisma.proposalRecord.findMany(),
    prisma.callLogRecord.findMany({ orderBy: { at: "desc" }, take: 200 }),
  ]);

  const designs = { ...(workspace.designs || {}) };
  for (const row of designRows) {
    try {
      designs[row.leadId] = JSON.parse(row.payload) as RoofDesign;
    } catch {
      /* keep workspace copy */
    }
  }

  const proposals = { ...(workspace.proposals || {}) };
  for (const row of proposalRows) {
    try {
      proposals[row.leadId] = JSON.parse(row.payload) as Proposal;
    } catch {
      /* keep workspace copy */
    }
  }

  const fromTable: CallLog[] = logRows.map((row) => ({
    id: row.id,
    leadId: row.leadId,
    outcome: row.outcome,
    duration: row.duration,
    notes: row.notes,
    at: row.at.toISOString(),
  }));
  const seen = new Set(fromTable.map((item) => item.id));
  const mergedLogs = [...fromTable, ...(workspace.callLogs || []).filter((item) => !seen.has(item.id))];

  return { ...workspace, designs, proposals, callLogs: mergedLogs };
}
