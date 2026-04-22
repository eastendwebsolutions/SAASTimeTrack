import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ["user", "company_admin", "super_admin"]);
export const entryStatusEnum = pgEnum("entry_status", ["draft", "submitted", "approved", "rejected"]);
export const timesheetStatusEnum = pgEnum("timesheet_status", ["draft", "submitted", "approved", "rejected"]);
export const ppSessionStatusEnum = pgEnum("pp_session_status", ["draft", "active", "completed", "archived"]);
export const ppWritebackModeEnum = pgEnum("pp_writeback_mode", ["immediate", "on_sprint_completion"]);
export const ppRestartScopeEnum = pgEnum("pp_restart_scope", ["full", "stories"]);
export const ppParticipantRoleEnum = pgEnum("pp_participant_role", ["facilitator", "participant"]);
export const ppStoryStatusEnum = pgEnum("pp_story_status", ["pending", "voting", "revealed", "finalized"]);
export const ppRoundStateEnum = pgEnum("pp_round_state", ["open", "revealed", "closed"]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
};

export const companies = pgTable("companies", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  asanaWorkspaceId: varchar("asana_workspace_id", { length: 100 }),
  timezone: varchar("timezone", { length: 100 }).notNull().default("UTC"),
  ...timestamps,
});

export const companySettings = pgTable("company_settings", {
  companyId: uuid("company_id").primaryKey().references(() => companies.id, { onDelete: "cascade" }),
  allowAdminOverrideLockedEntries: boolean("allow_admin_override_locked_entries").notNull().default(false),
  asanaSprintFieldGid: varchar("asana_sprint_field_gid", { length: 100 }),
  asanaSprintFieldName: varchar("asana_sprint_field_name", { length: 255 }),
  asanaStoryPointsFieldGid: varchar("asana_story_points_field_gid", { length: 100 }),
  asanaStoryPointsFieldName: varchar("asana_story_points_field_name", { length: 255 }),
  ...timestamps,
});

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  clerkUserId: varchar("clerk_user_id", { length: 255 }).notNull().unique(),
  email: varchar("email", { length: 255 }).notNull(),
  asanaUserId: varchar("asana_user_id", { length: 100 }),
  role: roleEnum("role").notNull().default("user"),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  timezone: varchar("timezone", { length: 100 }),
  ...timestamps,
}, (table) => ({
  companyIdx: index("users_company_idx").on(table.companyId),
}));

export const projects = pgTable("projects", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  /** Asana data is cached per user OAuth — no org-wide Asana install required. */
  syncedByUserId: uuid("synced_by_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  asanaProjectId: varchar("asana_project_id", { length: 100 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  ...timestamps,
}, (table) => ({
  companyActiveIdx: index("projects_company_active_idx").on(table.companyId, table.isActive),
  userActiveIdx: index("projects_user_active_idx").on(table.syncedByUserId, table.isActive),
  /** Same Asana project may appear once per user who synced it. */
  asanaProjectPerUserUnique: uniqueIndex("projects_user_asana_unique").on(table.syncedByUserId, table.asanaProjectId),
}));

export const tasks = pgTable("tasks", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  asanaTaskId: varchar("asana_task_id", { length: 100 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  assignedUserId: uuid("assigned_user_id").references(() => users.id),
  parentTaskId: uuid("parent_task_id"),
  isActive: boolean("is_active").notNull().default(true),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  ...timestamps,
}, (table) => ({
  assignedIdx: index("tasks_assigned_active_idx").on(table.assignedUserId, table.isActive),
  projectAsanaUnique: uniqueIndex("tasks_project_asana_unique").on(table.projectId, table.asanaTaskId),
}));

export const timesheets = pgTable("timesheets", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  weekStart: timestamp("week_start", { withTimezone: false }).notNull(),
  status: timesheetStatusEnum("status").notNull().default("draft"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  submittedFromIp: varchar("submitted_from_ip", { length: 100 }),
  approvedBy: uuid("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  rejectedAt: timestamp("rejected_at", { withTimezone: true }),
  comments: text("comments"),
  ...timestamps,
}, (table) => ({
  userWeekUnique: uniqueIndex("timesheets_user_week_unique").on(table.userId, table.weekStart),
}));

export const timeEntries = pgTable("time_entries", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  taskId: uuid("task_id").notNull().references(() => tasks.id),
  subtaskId: uuid("subtask_id").references(() => tasks.id),
  timesheetId: uuid("timesheet_id").references(() => timesheets.id, { onDelete: "set null" }),
  entryDate: timestamp("entry_date", { withTimezone: false }).notNull(),
  timeIn: timestamp("time_in", { withTimezone: true }).notNull(),
  timeOut: timestamp("time_out", { withTimezone: true }).notNull(),
  durationMinutes: integer("duration_minutes").notNull(),
  summary: text("summary").notNull(),
  status: entryStatusEnum("status").notNull().default("draft"),
  lockedAt: timestamp("locked_at", { withTimezone: true }),
  approvedBy: uuid("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  ...timestamps,
}, (table) => ({
  userDateIdx: index("time_entries_company_user_date_idx").on(table.companyId, table.userId, table.entryDate),
  statusIdx: index("time_entries_company_status_date_idx").on(table.companyId, table.status, table.entryDate),
}));

export const entryComments = pgTable("entry_comments", {
  id: uuid("id").defaultRandom().primaryKey(),
  timeEntryId: uuid("time_entry_id").notNull().references(() => timeEntries.id, { onDelete: "cascade" }),
  authorUserId: uuid("author_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  ...timestamps,
});

export const adminNotifications = pgTable("admin_notifications", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  recipientUserId: uuid("recipient_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 50 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  body: text("body").notNull(),
  timesheetId: uuid("timesheet_id").references(() => timesheets.id, { onDelete: "set null" }),
  readAt: timestamp("read_at", { withTimezone: true }),
  ...timestamps,
}, (table) => ({
  recipientCreatedIdx: index("admin_notifications_recipient_created_idx").on(table.recipientUserId, table.createdAt),
}));

export const asanaConnections = pgTable("asana_connections", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  asanaUserId: varchar("asana_user_id", { length: 100 }).notNull(),
  accessTokenEncrypted: text("access_token_encrypted").notNull(),
  refreshTokenEncrypted: text("refresh_token_encrypted"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  scopes: text("scopes"),
  connectedAt: timestamp("connected_at", { withTimezone: true }).defaultNow().notNull(),
  ...timestamps,
});

export const syncRuns = pgTable("sync_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => users.id),
  type: varchar("type", { length: 20 }).notNull(),
  status: varchar("status", { length: 20 }).notNull(),
  projectsSynced: integer("projects_synced").notNull().default(0),
  tasksSynced: integer("tasks_synced").notNull().default(0),
  subtasksSynced: integer("subtasks_synced").notNull().default(0),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  error: text("error"),
});

export const timesheetEntries = pgTable("timesheet_entries", {
  timesheetId: uuid("timesheet_id").notNull().references(() => timesheets.id, { onDelete: "cascade" }),
  timeEntryId: uuid("time_entry_id").notNull().references(() => timeEntries.id, { onDelete: "cascade" }),
}, (table) => ({
  pk: primaryKey({ columns: [table.timesheetId, table.timeEntryId] }),
}));

export const ppSessions = pgTable("pp_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 255 }).notNull(),
  status: ppSessionStatusEnum("status").notNull().default("draft"),
  asanaWorkspaceId: varchar("asana_workspace_id", { length: 100 }),
  asanaProjectId: varchar("asana_project_id", { length: 100 }),
  sprintFieldGid: varchar("sprint_field_gid", { length: 100 }).notNull(),
  sprintFieldName: varchar("sprint_field_name", { length: 255 }).notNull(),
  selectedSprintValueGid: varchar("selected_sprint_value_gid", { length: 100 }).notNull(),
  selectedSprintValueName: varchar("selected_sprint_value_name", { length: 255 }).notNull(),
  currentVersion: integer("current_version").notNull().default(1),
  writebackMode: ppWritebackModeEnum("writeback_mode").notNull().default("immediate"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  ...timestamps,
}, (table) => ({
  companyStatusIdx: index("pp_sessions_company_status_idx").on(table.companyId, table.status),
}));

export const ppSessionVersions = pgTable("pp_session_versions", {
  id: uuid("id").defaultRandom().primaryKey(),
  sessionId: uuid("session_id").notNull().references(() => ppSessions.id, { onDelete: "cascade" }),
  versionNumber: integer("version_number").notNull(),
  parentVersionNumber: integer("parent_version_number"),
  createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  restartReason: text("restart_reason"),
  restartScope: ppRestartScopeEnum("restart_scope"),
  isActiveVersion: boolean("is_active_version").notNull().default(true),
  ...timestamps,
}, (table) => ({
  sessionVersionUnique: uniqueIndex("pp_session_versions_session_version_unique").on(table.sessionId, table.versionNumber),
  activeVersionIdx: index("pp_session_versions_active_idx").on(table.sessionId, table.isActiveVersion),
}));

export const ppSessionParticipants = pgTable("pp_session_participants", {
  sessionId: uuid("session_id").notNull().references(() => ppSessions.id, { onDelete: "cascade" }),
  versionId: uuid("version_id").notNull().references(() => ppSessionVersions.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: ppParticipantRoleEnum("role").notNull().default("participant"),
  joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow().notNull(),
  ...timestamps,
}, (table) => ({
  pk: primaryKey({ columns: [table.sessionId, table.versionId, table.userId] }),
  versionMembersIdx: index("pp_session_participants_version_idx").on(table.versionId, table.userId),
}));

export const ppStories = pgTable("pp_stories", {
  id: uuid("id").defaultRandom().primaryKey(),
  sessionId: uuid("session_id").notNull().references(() => ppSessions.id, { onDelete: "cascade" }),
  versionId: uuid("version_id").notNull().references(() => ppSessionVersions.id, { onDelete: "cascade" }),
  asanaTaskGid: varchar("asana_task_gid", { length: 100 }).notNull(),
  asanaParentTaskGid: varchar("asana_parent_task_gid", { length: 100 }),
  name: varchar("name", { length: 255 }).notNull(),
  isSubtask: boolean("is_subtask").notNull().default(false),
  ordering: integer("ordering").notNull().default(0),
  status: ppStoryStatusEnum("status").notNull().default("pending"),
  finalEstimate: integer("final_estimate"),
  finalizedAt: timestamp("finalized_at", { withTimezone: true }),
  finalizedBy: uuid("finalized_by").references(() => users.id),
  ...timestamps,
}, (table) => ({
  versionOrderIdx: index("pp_stories_version_order_idx").on(table.versionId, table.ordering),
  versionTaskUnique: uniqueIndex("pp_stories_version_task_unique").on(table.versionId, table.asanaTaskGid),
}));

export const ppVoteRounds = pgTable("pp_vote_rounds", {
  id: uuid("id").defaultRandom().primaryKey(),
  sessionId: uuid("session_id").notNull().references(() => ppSessions.id, { onDelete: "cascade" }),
  versionId: uuid("version_id").notNull().references(() => ppSessionVersions.id, { onDelete: "cascade" }),
  storyId: uuid("story_id").notNull().references(() => ppStories.id, { onDelete: "cascade" }),
  roundNumber: integer("round_number").notNull(),
  state: ppRoundStateEnum("state").notNull().default("open"),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  revealedAt: timestamp("revealed_at", { withTimezone: true }),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  revoteOfRoundId: uuid("revote_of_round_id"),
  ...timestamps,
}, (table) => ({
  storyRoundUnique: uniqueIndex("pp_vote_rounds_story_round_unique").on(table.storyId, table.roundNumber),
  storyStateIdx: index("pp_vote_rounds_story_state_idx").on(table.storyId, table.state),
}));

export const ppVotes = pgTable("pp_votes", {
  id: uuid("id").defaultRandom().primaryKey(),
  sessionId: uuid("session_id").notNull().references(() => ppSessions.id, { onDelete: "cascade" }),
  versionId: uuid("version_id").notNull().references(() => ppSessionVersions.id, { onDelete: "cascade" }),
  storyId: uuid("story_id").notNull().references(() => ppStories.id, { onDelete: "cascade" }),
  roundId: uuid("round_id").notNull().references(() => ppVoteRounds.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  voteValue: varchar("vote_value", { length: 20 }).notNull(),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).defaultNow().notNull(),
  ...timestamps,
}, (table) => ({
  roundUserUnique: uniqueIndex("pp_votes_round_user_unique").on(table.roundId, table.userId),
  storyRoundIdx: index("pp_votes_story_round_idx").on(table.storyId, table.roundId),
}));

export const ppHistoryLog = pgTable("pp_history_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  sessionId: uuid("session_id").notNull().references(() => ppSessions.id, { onDelete: "cascade" }),
  versionId: uuid("version_id").notNull().references(() => ppSessionVersions.id, { onDelete: "cascade" }),
  actorUserId: uuid("actor_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  actionType: varchar("action_type", { length: 80 }).notNull(),
  targetType: varchar("target_type", { length: 80 }),
  targetId: uuid("target_id"),
  payloadJson: jsonb("payload_json"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  sessionCreatedIdx: index("pp_history_log_session_created_idx").on(table.sessionId, table.createdAt),
}));
