import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  ppHistoryLog,
  ppSessionParticipants,
  ppSessions,
  ppSessionVersions,
  ppStories,
  ppVoteRounds,
  ppVotes,
  users,
} from "@/lib/db/schema";
import { fetchSprintStoriesForSession, getCompanyPokerAsanaMapping, writeStoryPointsToAsana } from "./asana";

type RestartScope = "full" | "stories";

async function logHistory(args: {
  sessionId: string;
  versionId: string;
  actorUserId: string;
  actionType: string;
  targetType?: string;
  targetId?: string;
  payloadJson?: Record<string, unknown>;
}) {
  await db.insert(ppHistoryLog).values({
    sessionId: args.sessionId,
    versionId: args.versionId,
    actorUserId: args.actorUserId,
    actionType: args.actionType,
    targetType: args.targetType ?? null,
    targetId: args.targetId ?? null,
    payloadJson: args.payloadJson ?? null,
  });
}

export async function getSessionWithVersion(sessionId: string, companyId: string) {
  const session = await db.query.ppSessions.findFirst({
    where: and(eq(ppSessions.id, sessionId), eq(ppSessions.companyId, companyId)),
  });
  if (!session) {
    throw new Error("Session not found");
  }
  const version = await db.query.ppSessionVersions.findFirst({
    where: and(eq(ppSessionVersions.sessionId, session.id), eq(ppSessionVersions.versionNumber, session.currentVersion)),
  });
  if (!version) {
    throw new Error("Session version not found");
  }
  return { session, version };
}

export async function createSession(args: {
  companyId: string;
  actorUserId: string;
  title: string;
  asanaWorkspaceId: string;
  asanaProjectId: string;
  sprintFieldGid: string;
  sprintFieldName: string;
  selectedSprintValueGid: string;
  selectedSprintValueName: string;
  writebackMode: "immediate" | "on_sprint_completion";
  participantUserIds: string[];
}) {
  const [session] = await db
    .insert(ppSessions)
    .values({
      companyId: args.companyId,
      createdByUserId: args.actorUserId,
      title: args.title,
      asanaWorkspaceId: args.asanaWorkspaceId,
      asanaProjectId: args.asanaProjectId,
      sprintFieldGid: args.sprintFieldGid,
      sprintFieldName: args.sprintFieldName,
      selectedSprintValueGid: args.selectedSprintValueGid,
      selectedSprintValueName: args.selectedSprintValueName,
      writebackMode: args.writebackMode,
      status: "draft",
    })
    .returning();

  const [version] = await db
    .insert(ppSessionVersions)
    .values({
      sessionId: session.id,
      versionNumber: 1,
      createdByUserId: args.actorUserId,
      isActiveVersion: true,
    })
    .returning();

  const distinctParticipantIds = [...new Set([args.actorUserId, ...args.participantUserIds])];
  if (distinctParticipantIds.length) {
    await db.insert(ppSessionParticipants).values(
      distinctParticipantIds.map((userId) => ({
        sessionId: session.id,
        versionId: version.id,
        userId,
        role: userId === args.actorUserId ? ("facilitator" as const) : ("participant" as const),
      })),
    );
  }

  await logHistory({
    sessionId: session.id,
    versionId: version.id,
    actorUserId: args.actorUserId,
    actionType: "session_created",
    payloadJson: { participantCount: distinctParticipantIds.length },
  });
  return { session, version };
}

export async function startSession(args: { sessionId: string; actorUserId: string; companyId: string }) {
  const { session, version } = await getSessionWithVersion(args.sessionId, args.companyId);
  if (session.status !== "draft") {
    return { session, version };
  }

  const participants = await db.query.ppSessionParticipants.findMany({
    where: and(eq(ppSessionParticipants.sessionId, session.id), eq(ppSessionParticipants.versionId, version.id)),
  });
  if (!participants.length) {
    throw new Error("Participants must be added before starting");
  }

  const stories = await fetchSprintStoriesForSession({
    userId: args.actorUserId,
    projectGid: session.asanaProjectId ?? "",
    sprintFieldGid: session.sprintFieldGid,
    sprintValueGid: session.selectedSprintValueGid,
  });

  if (stories.length) {
    await db.insert(ppStories).values(
      stories.map((story) => ({
        sessionId: session.id,
        versionId: version.id,
        asanaTaskGid: story.asanaTaskGid,
        asanaParentTaskGid: story.asanaParentTaskGid,
        name: story.name,
        isSubtask: story.isSubtask,
        ordering: story.ordering,
      })),
    );
  }

  await db
    .update(ppSessions)
    .set({
      status: "active",
      startedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(ppSessions.id, session.id));

  const firstStory = await db.query.ppStories.findFirst({
    where: and(eq(ppStories.sessionId, session.id), eq(ppStories.versionId, version.id)),
    orderBy: (table) => [asc(table.ordering)],
  });

  if (firstStory) {
    await db.update(ppStories).set({ status: "voting", updatedAt: new Date() }).where(eq(ppStories.id, firstStory.id));
    await db.insert(ppVoteRounds).values({
      sessionId: session.id,
      versionId: version.id,
      storyId: firstStory.id,
      roundNumber: 1,
    });
  }

  await logHistory({
    sessionId: session.id,
    versionId: version.id,
    actorUserId: args.actorUserId,
    actionType: "session_started",
  });
}

export async function assignParticipants(args: {
  sessionId: string;
  actorUserId: string;
  companyId: string;
  participantUserIds: string[];
}) {
  const { session, version } = await getSessionWithVersion(args.sessionId, args.companyId);
  if (session.status !== "draft") {
    throw new Error("Participants can only be changed before session start");
  }
  await db
    .delete(ppSessionParticipants)
    .where(and(eq(ppSessionParticipants.sessionId, session.id), eq(ppSessionParticipants.versionId, version.id)));

  const allUsers = [...new Set([args.actorUserId, ...args.participantUserIds])];
  if (allUsers.length) {
    await db.insert(ppSessionParticipants).values(
      allUsers.map((userId) => ({
        sessionId: session.id,
        versionId: version.id,
        userId,
        role: userId === args.actorUserId ? ("facilitator" as const) : ("participant" as const),
      })),
    );
  }

  await logHistory({
    sessionId: session.id,
    versionId: version.id,
    actorUserId: args.actorUserId,
    actionType: "participant_added",
    payloadJson: { participantCount: allUsers.length },
  });
}

export async function submitVote(args: {
  sessionId: string;
  storyId: string;
  voterUserId: string;
  companyId: string;
  voteValue: string;
}) {
  const { session, version } = await getSessionWithVersion(args.sessionId, args.companyId);
  const [round] = await db
    .select()
    .from(ppVoteRounds)
    .where(and(eq(ppVoteRounds.storyId, args.storyId), eq(ppVoteRounds.state, "open")))
    .orderBy(desc(ppVoteRounds.roundNumber))
    .limit(1);
  if (!round) {
    throw new Error("No active round for this story");
  }

  await db
    .insert(ppVotes)
    .values({
      sessionId: session.id,
      versionId: version.id,
      storyId: args.storyId,
      roundId: round.id,
      userId: args.voterUserId,
      voteValue: args.voteValue,
      submittedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [ppVotes.roundId, ppVotes.userId],
      set: {
        voteValue: args.voteValue,
        submittedAt: new Date(),
        updatedAt: new Date(),
      },
    });

  await logHistory({
    sessionId: session.id,
    versionId: version.id,
    actorUserId: args.voterUserId,
    actionType: "vote_submitted",
    targetType: "story",
    targetId: args.storyId,
  });
}

export async function revealVotes(args: { sessionId: string; storyId: string; actorUserId: string; companyId: string }) {
  const { session, version } = await getSessionWithVersion(args.sessionId, args.companyId);
  const [round] = await db
    .select()
    .from(ppVoteRounds)
    .where(and(eq(ppVoteRounds.storyId, args.storyId), eq(ppVoteRounds.state, "open")))
    .orderBy(desc(ppVoteRounds.roundNumber))
    .limit(1);
  if (!round) throw new Error("No active round");

  await db
    .update(ppVoteRounds)
    .set({
      state: "revealed",
      revealedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(ppVoteRounds.id, round.id));

  await db.update(ppStories).set({ status: "revealed", updatedAt: new Date() }).where(eq(ppStories.id, args.storyId));

  await logHistory({
    sessionId: session.id,
    versionId: version.id,
    actorUserId: args.actorUserId,
    actionType: "votes_revealed",
    targetType: "story",
    targetId: args.storyId,
  });
}

export async function startRevote(args: { sessionId: string; storyId: string; actorUserId: string; companyId: string }) {
  const { session, version } = await getSessionWithVersion(args.sessionId, args.companyId);
  const [latestRound] = await db
    .select()
    .from(ppVoteRounds)
    .where(eq(ppVoteRounds.storyId, args.storyId))
    .orderBy(desc(ppVoteRounds.roundNumber))
    .limit(1);
  if (!latestRound) throw new Error("No round found");

  await db
    .update(ppVoteRounds)
    .set({
      state: "closed",
      closedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(ppVoteRounds.id, latestRound.id));

  await db.insert(ppVoteRounds).values({
    sessionId: session.id,
    versionId: version.id,
    storyId: args.storyId,
    roundNumber: latestRound.roundNumber + 1,
    state: "open",
    revoteOfRoundId: latestRound.id,
  });

  await db.update(ppStories).set({ status: "voting", updatedAt: new Date() }).where(eq(ppStories.id, args.storyId));

  await logHistory({
    sessionId: session.id,
    versionId: version.id,
    actorUserId: args.actorUserId,
    actionType: "revote_started",
    targetType: "story",
    targetId: args.storyId,
  });
}

export async function finalizeStory(args: {
  sessionId: string;
  storyId: string;
  actorUserId: string;
  companyId: string;
  estimate: number;
}) {
  const { session, version } = await getSessionWithVersion(args.sessionId, args.companyId);
  const story = await db.query.ppStories.findFirst({
    where: and(eq(ppStories.id, args.storyId), eq(ppStories.versionId, version.id)),
  });
  if (!story) throw new Error("Story not found");

  await db
    .update(ppStories)
    .set({
      status: "finalized",
      finalEstimate: args.estimate,
      finalizedAt: new Date(),
      finalizedBy: args.actorUserId,
      updatedAt: new Date(),
    })
    .where(eq(ppStories.id, story.id));

  const openRounds = await db
    .select({ id: ppVoteRounds.id })
    .from(ppVoteRounds)
    .where(and(eq(ppVoteRounds.storyId, story.id), eq(ppVoteRounds.state, "open")));
  if (openRounds.length) {
    await db
      .update(ppVoteRounds)
      .set({ state: "closed", closedAt: new Date(), updatedAt: new Date() })
      .where(inArray(ppVoteRounds.id, openRounds.map((row) => row.id)));
  }

  await logHistory({
    sessionId: session.id,
    versionId: version.id,
    actorUserId: args.actorUserId,
    actionType: "story_finalized",
    targetType: "story",
    targetId: story.id,
    payloadJson: { estimate: args.estimate },
  });

  if (session.writebackMode === "immediate") {
    const mapping = await getCompanyPokerAsanaMapping(session.companyId);
    if (mapping.storyPointsFieldGid) {
      await writeStoryPointsToAsana({
        userId: args.actorUserId,
        asanaTaskGid: story.asanaTaskGid,
        storyPointsFieldGid: mapping.storyPointsFieldGid,
        estimate: args.estimate,
      });
      await logHistory({
        sessionId: session.id,
        versionId: version.id,
        actorUserId: args.actorUserId,
        actionType: "writeback_succeeded",
        targetType: "story",
        targetId: story.id,
      });
    }
  }
}

export async function completeSession(args: { sessionId: string; actorUserId: string; companyId: string }) {
  const { session, version } = await getSessionWithVersion(args.sessionId, args.companyId);
  await db.update(ppSessions).set({ status: "completed", completedAt: new Date(), updatedAt: new Date() }).where(eq(ppSessions.id, session.id));
  await logHistory({
    sessionId: session.id,
    versionId: version.id,
    actorUserId: args.actorUserId,
    actionType: "session_completed",
  });

  if (session.writebackMode !== "on_sprint_completion") return;
  const mapping = await getCompanyPokerAsanaMapping(session.companyId);
  if (!mapping.storyPointsFieldGid) return;
  const stories = await db.query.ppStories.findMany({
    where: and(eq(ppStories.sessionId, session.id), eq(ppStories.versionId, version.id), eq(ppStories.status, "finalized")),
  });
  for (const story of stories) {
    if (story.finalEstimate === null) continue;
    await writeStoryPointsToAsana({
      userId: args.actorUserId,
      asanaTaskGid: story.asanaTaskGid,
      storyPointsFieldGid: mapping.storyPointsFieldGid,
      estimate: story.finalEstimate,
    });
  }
  await logHistory({
    sessionId: session.id,
    versionId: version.id,
    actorUserId: args.actorUserId,
    actionType: "writeback_succeeded",
    payloadJson: { mode: "on_sprint_completion" },
  });
}

export async function restartSession(args: {
  sessionId: string;
  actorUserId: string;
  companyId: string;
  restartScope: RestartScope;
  storyIds?: string[];
  reason?: string;
}) {
  const { session, version } = await getSessionWithVersion(args.sessionId, args.companyId);
  const nextVersion = session.currentVersion + 1;
  await db.update(ppSessionVersions).set({ isActiveVersion: false, updatedAt: new Date() }).where(eq(ppSessionVersions.id, version.id));

  const [newVersion] = await db
    .insert(ppSessionVersions)
    .values({
      sessionId: session.id,
      versionNumber: nextVersion,
      parentVersionNumber: version.versionNumber,
      createdByUserId: args.actorUserId,
      restartReason: args.reason ?? null,
      restartScope: args.restartScope,
      isActiveVersion: true,
    })
    .returning();

  const participants = await db.query.ppSessionParticipants.findMany({
    where: and(eq(ppSessionParticipants.sessionId, session.id), eq(ppSessionParticipants.versionId, version.id)),
  });
  if (participants.length) {
    await db.insert(ppSessionParticipants).values(
      participants.map((participant) => ({
        sessionId: participant.sessionId,
        versionId: newVersion.id,
        userId: participant.userId,
        role: participant.role,
      })),
    );
  }

  const stories = await db.query.ppStories.findMany({
    where: and(eq(ppStories.sessionId, session.id), eq(ppStories.versionId, version.id)),
    orderBy: (table) => [asc(table.ordering)],
  });

  const selectedStoryIds = new Set(args.storyIds ?? []);
  await db.insert(ppStories).values(
    stories.map((story) => {
      const shouldReset = args.restartScope === "full" || selectedStoryIds.has(story.id);
      return {
        sessionId: story.sessionId,
        versionId: newVersion.id,
        asanaTaskGid: story.asanaTaskGid,
        asanaParentTaskGid: story.asanaParentTaskGid,
        name: story.name,
        isSubtask: story.isSubtask,
        ordering: story.ordering,
        status: shouldReset ? "pending" : story.status,
        finalEstimate: shouldReset ? null : story.finalEstimate,
        finalizedAt: shouldReset ? null : story.finalizedAt,
        finalizedBy: shouldReset ? null : story.finalizedBy,
      };
    }),
  );

  await db
    .update(ppSessions)
    .set({
      status: "active",
      currentVersion: nextVersion,
      completedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(ppSessions.id, session.id));

  await logHistory({
    sessionId: session.id,
    versionId: newVersion.id,
    actorUserId: args.actorUserId,
    actionType: args.restartScope === "full" ? "session_restarted" : "stories_restarted",
    payloadJson: {
      parentVersion: version.versionNumber,
      newVersion: nextVersion,
      storyIds: args.storyIds ?? [],
    },
  });
}

export async function getSessionDetail(args: { sessionId: string; companyId: string; versionNumber?: number }) {
  const session = await db.query.ppSessions.findFirst({
    where: and(eq(ppSessions.id, args.sessionId), eq(ppSessions.companyId, args.companyId)),
  });
  if (!session) {
    throw new Error("Session not found");
  }
  const desiredVersionNumber = args.versionNumber ?? session.currentVersion;
  const version = await db.query.ppSessionVersions.findFirst({
    where: and(eq(ppSessionVersions.sessionId, session.id), eq(ppSessionVersions.versionNumber, desiredVersionNumber)),
  });
  if (!version) throw new Error("Version not found");

  const [stories, participants, rounds, votes, history] = await Promise.all([
    db.query.ppStories.findMany({
      where: and(eq(ppStories.sessionId, session.id), eq(ppStories.versionId, version.id)),
      orderBy: (table) => [asc(table.ordering)],
    }),
    db
      .select({
        userId: users.id,
        email: users.email,
        role: ppSessionParticipants.role,
      })
      .from(ppSessionParticipants)
      .innerJoin(users, eq(users.id, ppSessionParticipants.userId))
      .where(and(eq(ppSessionParticipants.sessionId, session.id), eq(ppSessionParticipants.versionId, version.id))),
    db.query.ppVoteRounds.findMany({
      where: and(eq(ppVoteRounds.sessionId, session.id), eq(ppVoteRounds.versionId, version.id)),
      orderBy: (table) => [asc(table.roundNumber)],
    }),
    db.query.ppVotes.findMany({
      where: and(eq(ppVotes.sessionId, session.id), eq(ppVotes.versionId, version.id)),
      orderBy: (table) => [desc(table.submittedAt)],
    }),
    db.query.ppHistoryLog.findMany({
      where: and(eq(ppHistoryLog.sessionId, session.id), eq(ppHistoryLog.versionId, version.id)),
      orderBy: (table) => [desc(table.createdAt)],
    }),
  ]);

  return { session, version, stories, participants, rounds, votes, history };
}

export async function listSessions(companyId: string, includeCompleted = true) {
  return db.query.ppSessions.findMany({
    where: includeCompleted ? eq(ppSessions.companyId, companyId) : and(eq(ppSessions.companyId, companyId), sql`${ppSessions.status} <> 'completed'`),
    orderBy: (table) => [desc(table.createdAt)],
  });
}
