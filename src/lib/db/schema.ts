import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
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
export const integrationProviderEnum = pgEnum("integration_provider", ["asana", "jira", "monday"]);
export const reportingSprintStatusEnum = pgEnum("reporting_sprint_status", ["planned", "active", "completed", "archived"]);
export const mappingScopeTypeEnum = pgEnum("integration_mapping_scope_type", ["company", "workspace", "project"]);
export const teamStatusEventTypeEnum = pgEnum("team_status_event_type", ["DAY_IN", "DAY_OUT", "BREAK_IN", "BREAK_OUT"]);
export const billingSubmissionStatusEnum = pgEnum("billing_submission_status", [
  "submitted",
  "accepted",
  "needs_resubmission",
  "failed",
]);
export const billingEmailStatusEnum = pgEnum("billing_email_status", ["pending", "sent", "failed"]);
export const aiInsightScopeEnum = pgEnum("ai_insight_scope", ["user", "team", "company"]);
export const aiInsightRunStatusEnum = pgEnum("ai_insight_run_status", ["pending", "running", "completed", "failed"]);

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
  teamStatusTeamsEnabled: boolean("team_status_teams_enabled").notNull().default(false),
  teamStatusTeamsDeliveryMethod: varchar("team_status_teams_delivery_method", { length: 20 }).notNull().default("email"),
  teamStatusTeamsChannelLabel: varchar("team_status_teams_channel_label", { length: 255 }),
  teamStatusTeamsDestinationEncrypted: text("team_status_teams_destination_encrypted"),
  teamStatusTeamsLastTestedAt: timestamp("team_status_teams_last_tested_at", { withTimezone: true }),
  teamStatusTeamsLastError: text("team_status_teams_last_error"),
  ...timestamps,
});

export const billingSettings = pgTable("billing_settings", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id")
    .notNull()
    .unique()
    .references(() => companies.id, { onDelete: "cascade" }),
  toRecipientsJson: jsonb("to_recipients_json").notNull().default([]),
  ccRecipientsJson: jsonb("cc_recipients_json").notNull().default([]),
  defaultBodyFooter: text("default_body_footer"),
  submissionInstructions: text("submission_instructions"),
  overdueBannerEnabled: boolean("overdue_banner_enabled").notNull().default(true),
  expectedSubmissionCutoffTime: varchar("expected_submission_cutoff_time", { length: 20 }),
  updatedByUserId: uuid("updated_by_user_id"),
  ...timestamps,
});

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  clerkUserId: varchar("clerk_user_id", { length: 255 }).notNull().unique(),
  email: varchar("email", { length: 255 }).notNull(),
  displayName: varchar("display_name", { length: 255 }),
  /** Optional discipline label for analytics filters (separate from Clerk/app role). */
  reportingJobRole: varchar("reporting_job_role", { length: 120 }),
  asanaUserId: varchar("asana_user_id", { length: 100 }),
  role: roleEnum("role").notNull().default("user"),
  activeIntegrationProvider: integrationProviderEnum("active_integration_provider").notNull().default("asana"),
  isPokerPlanningAdmin: boolean("is_poker_planning_admin").notNull().default(false),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  timezone: varchar("timezone", { length: 100 }),
  ...timestamps,
}, (table) => ({
  companyIdx: index("users_company_idx").on(table.companyId),
}));

export const billingPeriods = pgTable(
  "billing_periods",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    periodStartDate: timestamp("period_start_date", { withTimezone: false }).notNull(),
    periodEndDate: timestamp("period_end_date", { withTimezone: false }).notNull(),
    timezone: varchar("timezone", { length: 100 }).notNull().default("America/New_York"),
    label: varchar("label", { length: 255 }).notNull(),
    ...timestamps,
  },
  (table) => ({
    companyPeriodUnique: uniqueIndex("billing_periods_company_start_end_unique").on(
      table.companyId,
      table.periodStartDate,
      table.periodEndDate,
    ),
    companyPeriodLookupIdx: index("billing_periods_company_period_lookup_idx").on(table.companyId, table.periodStartDate, table.periodEndDate),
  }),
);

export const billingSubmissions = pgTable(
  "billing_submissions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    billingPeriodId: uuid("billing_period_id")
      .notNull()
      .references(() => billingPeriods.id, { onDelete: "cascade" }),
    subject: varchar("subject", { length: 255 }).notNull(),
    bodyContent: text("body_content"),
    status: billingSubmissionStatusEnum("status").notNull().default("submitted"),
    submissionAttemptNumber: integer("submission_attempt_number").notNull().default(1),
    submittedAtUtc: timestamp("submitted_at_utc", { withTimezone: true }).notNull(),
    submittedAtLocalLabel: varchar("submitted_at_local_label", { length: 120 }),
    emailToJson: jsonb("email_to_json").notNull().default([]),
    emailCcJson: jsonb("email_cc_json").notNull().default([]),
    emailStatus: billingEmailStatusEnum("email_status").notNull().default("pending"),
    emailErrorMessage: text("email_error_message"),
    adminNote: text("admin_note"),
    resubmissionRequestedByUserId: uuid("resubmission_requested_by_user_id").references(() => users.id, { onDelete: "set null" }),
    resubmissionRequestedAtUtc: timestamp("resubmission_requested_at_utc", { withTimezone: true }),
    resubmissionDueAtUtc: timestamp("resubmission_due_at_utc", { withTimezone: true }),
    acceptedByUserId: uuid("accepted_by_user_id").references(() => users.id, { onDelete: "set null" }),
    acceptedAtUtc: timestamp("accepted_at_utc", { withTimezone: true }),
    ...timestamps,
  },
  (table) => ({
    companyUserPeriodCreatedIdx: index("billing_submissions_company_user_period_created_idx").on(
      table.companyId,
      table.userId,
      table.billingPeriodId,
      table.createdAt,
    ),
    periodStatusIdx: index("billing_submissions_period_status_idx").on(table.billingPeriodId, table.status, table.createdAt),
  }),
);

export const billingSubmissionFiles = pgTable(
  "billing_submission_files",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    billingSubmissionId: uuid("billing_submission_id")
      .notNull()
      .references(() => billingSubmissions.id, { onDelete: "cascade" }),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    originalFileName: varchar("original_file_name", { length: 255 }).notNull(),
    storedFileName: varchar("stored_file_name", { length: 255 }).notNull(),
    fileMimeType: varchar("file_mime_type", { length: 120 }).notNull(),
    fileSizeBytes: integer("file_size_bytes").notNull(),
    storagePath: text("storage_path").notNull(),
    uploadedAtUtc: timestamp("uploaded_at_utc", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    submissionIdx: index("billing_submission_files_submission_idx").on(table.billingSubmissionId),
  }),
);

export const projects = pgTable("projects", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  /** Asana data is cached per user OAuth — no org-wide Asana install required. */
  syncedByUserId: uuid("synced_by_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  provider: integrationProviderEnum("provider").notNull().default("asana"),
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
  integrationType: integrationProviderEnum("integration_type").notNull().default("asana"),
  externalWorkspaceId: varchar("external_workspace_id", { length: 120 }),
  externalProjectId: varchar("external_project_id", { length: 120 }),
  externalTaskId: varchar("external_task_id", { length: 120 }),
  externalSubtaskId: varchar("external_subtask_id", { length: 120 }),
  lockedAt: timestamp("locked_at", { withTimezone: true }),
  approvedBy: uuid("approved_by").references(() => users.id),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  ...timestamps,
}, (table) => ({
  userDateIdx: index("time_entries_company_user_date_idx").on(table.companyId, table.userId, table.entryDate),
  statusIdx: index("time_entries_company_status_date_idx").on(table.companyId, table.status, table.entryDate),
  reportLookupIdx: index("time_entries_reporting_lookup_idx").on(
    table.companyId,
    table.integrationType,
    table.externalWorkspaceId,
    table.entryDate,
    table.userId,
  ),
}));

export const reportingWorkspaces = pgTable("reporting_workspaces", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  integrationType: integrationProviderEnum("integration_type").notNull(),
  externalWorkspaceId: varchar("external_workspace_id", { length: 120 }).notNull(),
  workspaceName: varchar("workspace_name", { length: 255 }).notNull(),
  ...timestamps,
}, (table) => ({
  uniqueWorkspaceIdx: uniqueIndex("reporting_workspaces_company_integration_external_unique").on(
    table.companyId,
    table.integrationType,
    table.externalWorkspaceId,
  ),
  companyWorkspaceIdx: index("reporting_workspaces_company_workspace_idx").on(table.companyId, table.integrationType),
}));

export const reportingSprints = pgTable("reporting_sprints", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  integrationType: integrationProviderEnum("integration_type").notNull(),
  externalWorkspaceId: varchar("external_workspace_id", { length: 120 }).notNull(),
  externalSprintId: varchar("external_sprint_id", { length: 120 }).notNull(),
  sprintName: varchar("sprint_name", { length: 255 }).notNull(),
  startDate: timestamp("start_date", { withTimezone: false }).notNull(),
  endDate: timestamp("end_date", { withTimezone: false }).notNull(),
  status: reportingSprintStatusEnum("status").notNull().default("planned"),
  ...timestamps,
}, (table) => ({
  uniqueSprintIdx: uniqueIndex("reporting_sprints_company_integration_external_unique").on(
    table.companyId,
    table.integrationType,
    table.externalWorkspaceId,
    table.externalSprintId,
  ),
  periodLookupIdx: index("reporting_sprints_period_lookup_idx").on(
    table.companyId,
    table.integrationType,
    table.externalWorkspaceId,
    table.startDate,
    table.endDate,
  ),
}));

export const reportingTasks = pgTable("reporting_tasks", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  integrationType: integrationProviderEnum("integration_type").notNull(),
  externalWorkspaceId: varchar("external_workspace_id", { length: 120 }).notNull(),
  externalProjectId: varchar("external_project_id", { length: 120 }),
  externalSprintId: varchar("external_sprint_id", { length: 120 }),
  externalTaskId: varchar("external_task_id", { length: 120 }).notNull(),
  externalParentTaskId: varchar("external_parent_task_id", { length: 120 }),
  taskName: varchar("task_name", { length: 255 }).notNull(),
  projectName: varchar("project_name", { length: 255 }),
  assigneeExternalId: varchar("assignee_external_id", { length: 120 }),
  assigneeUserId: uuid("assignee_user_id").references(() => users.id, { onDelete: "set null" }),
  estimateHours: numeric("estimate_hours", { precision: 10, scale: 2 }),
  storyPoints: numeric("story_points", { precision: 10, scale: 2 }),
  actualPoints: numeric("actual_points", { precision: 10, scale: 2 }),
  taskStatus: varchar("task_status", { length: 100 }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  syncedAt: timestamp("synced_at", { withTimezone: true }).defaultNow().notNull(),
  ...timestamps,
}, (table) => ({
  uniqueTaskIdx: uniqueIndex("reporting_tasks_company_integration_external_unique").on(
    table.companyId,
    table.integrationType,
    table.externalWorkspaceId,
    table.externalTaskId,
  ),
  sprintLookupIdx: index("reporting_tasks_sprint_lookup_idx").on(
    table.companyId,
    table.integrationType,
    table.externalWorkspaceId,
    table.externalSprintId,
    table.assigneeUserId,
  ),
  statusLookupIdx: index("reporting_tasks_status_lookup_idx").on(table.companyId, table.taskStatus, table.completedAt),
}));

export const integrationFieldMappings = pgTable("integration_field_mappings", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  integrationType: integrationProviderEnum("integration_type").notNull(),
  scopeType: mappingScopeTypeEnum("scope_type").notNull().default("company"),
  scopeExternalId: varchar("scope_external_id", { length: 120 }),
  mappingKey: varchar("mapping_key", { length: 120 }).notNull(),
  externalFieldId: varchar("external_field_id", { length: 120 }),
  externalFieldName: varchar("external_field_name", { length: 255 }),
  externalFieldType: varchar("external_field_type", { length: 100 }),
  isActive: boolean("is_active").notNull().default(true),
  metadataJson: jsonb("metadata_json"),
  createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
  ...timestamps,
}, (table) => ({
  activeMappingLookupIdx: index("integration_field_mappings_company_provider_key_active_idx").on(
    table.companyId,
    table.integrationType,
    table.mappingKey,
    table.isActive,
  ),
  scopeLookupIdx: index("integration_field_mappings_scope_lookup_idx").on(
    table.companyId,
    table.integrationType,
    table.scopeType,
    table.scopeExternalId,
  ),
  uniqueActiveScopeMappingIdx: uniqueIndex("integration_field_mappings_active_scope_unique").on(
    table.companyId,
    table.integrationType,
    table.scopeType,
    table.scopeExternalId,
    table.mappingKey,
    table.isActive,
  ),
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

export const jiraConnections = pgTable("jira_connections", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  jiraAccountId: varchar("jira_account_id", { length: 120 }).notNull(),
  jiraCloudId: varchar("jira_cloud_id", { length: 120 }).notNull(),
  jiraSiteName: varchar("jira_site_name", { length: 255 }),
  accessTokenEncrypted: text("access_token_encrypted").notNull(),
  refreshTokenEncrypted: text("refresh_token_encrypted"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  scopes: text("scopes"),
  connectedAt: timestamp("connected_at", { withTimezone: true }).defaultNow().notNull(),
  ...timestamps,
});

export const mondayConnections = pgTable("monday_connections", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  mondayUserId: varchar("monday_user_id", { length: 120 }).notNull(),
  mondayAccountId: varchar("monday_account_id", { length: 120 }),
  mondayAccountSlug: varchar("monday_account_slug", { length: 255 }),
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

export const ppWorkspaceAdmins = pgTable("pp_workspace_admins", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  asanaWorkspaceId: varchar("asana_workspace_id", { length: 100 }).notNull(),
  createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  ...timestamps,
}, (table) => ({
  companyWorkspaceUserUnique: uniqueIndex("pp_workspace_admins_company_workspace_user_unique").on(
    table.companyId,
    table.asanaWorkspaceId,
    table.userId,
  ),
  userWorkspaceIdx: index("pp_workspace_admins_user_workspace_idx").on(table.userId, table.asanaWorkspaceId),
}));

export const auditChangeLog = pgTable("audit_change_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  pageKey: varchar("page_key", { length: 100 }).notNull(),
  contextKey: varchar("context_key", { length: 160 }),
  entityType: varchar("entity_type", { length: 80 }).notNull(),
  entityId: varchar("entity_id", { length: 100 }),
  fieldName: varchar("field_name", { length: 120 }).notNull(),
  beforeValue: text("before_value"),
  afterValue: text("after_value"),
  actorUserId: uuid("actor_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  metadataJson: jsonb("metadata_json"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  companyPageCreatedIdx: index("audit_change_log_company_page_created_idx").on(table.companyId, table.pageKey, table.createdAt),
  companyPageContextCreatedIdx: index("audit_change_log_company_page_context_created_idx").on(
    table.companyId,
    table.pageKey,
    table.contextKey,
    table.createdAt,
  ),
}));

export const teamStatusEvents = pgTable("team_status_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  eventType: teamStatusEventTypeEnum("event_type").notNull(),
  eventTimestampUtc: timestamp("event_timestamp_utc", { withTimezone: true }).notNull(),
  eventTimezone: varchar("event_timezone", { length: 100 }).notNull().default("America/New_York"),
  eventLocalDate: timestamp("event_local_date", { withTimezone: false }).notNull(),
  eventLocalTimeLabel: varchar("event_local_time_label", { length: 80 }),
  source: varchar("source", { length: 50 }).notNull().default("web_dashboard"),
  note: text("note"),
  createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  ...timestamps,
}, (table) => ({
  companyIdx: index("team_status_events_company_idx").on(table.companyId),
  userIdx: index("team_status_events_user_idx").on(table.userId),
  localDateIdx: index("team_status_events_local_date_idx").on(table.eventLocalDate),
  eventTypeIdx: index("team_status_events_event_type_idx").on(table.eventType),
  eventTimestampIdx: index("team_status_events_event_timestamp_utc_idx").on(table.eventTimestampUtc),
  companyDateIdx: index("team_status_events_company_local_date_idx").on(table.companyId, table.eventLocalDate),
  userDateIdx: index("team_status_events_user_local_date_idx").on(table.userId, table.eventLocalDate),
}));

/** Per-company Cursor Team / Enterprise analytics API credentials. */
export const cursorTeamConnections = pgTable(
  "cursor_team_connections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .unique()
      .references(() => companies.id, { onDelete: "cascade" }),
    apiKeyEncrypted: text("api_key_encrypted").notNull(),
    cursorTeamId: varchar("cursor_team_id", { length: 160 }),
    lastSyncStartedAt: timestamp("last_sync_started_at", { withTimezone: true }),
    lastSyncSuccessAt: timestamp("last_sync_success_at", { withTimezone: true }),
    lastSyncError: text("last_sync_error"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (table) => ({
    companyIdx: index("cursor_team_connections_company_idx").on(table.companyId),
  }),
);

export const cursorUserIdentities = pgTable(
  "cursor_user_identities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    cursorExternalUserId: varchar("cursor_external_user_id", { length: 160 }).notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    sourceEmail: varchar("source_email", { length: 255 }),
    ...timestamps,
  },
  (table) => ({
    companyCursorUnique: uniqueIndex("cursor_user_identities_company_cursor_unique").on(
      table.companyId,
      table.cursorExternalUserId,
    ),
    companyUserIdx: index("cursor_user_identities_company_user_idx").on(table.companyId, table.userId),
  }),
);

export const cursorUsageDaily = pgTable(
  "cursor_usage_daily",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    usageDate: timestamp("usage_date", { withTimezone: false }).notNull(),
    totalRequests: integer("total_requests").notNull().default(0),
    acceptedCompletions: integer("accepted_completions").notNull().default(0),
    aiLinesAdded: integer("ai_lines_added").notNull().default(0),
    aiLinesDeleted: integer("ai_lines_deleted").notNull().default(0),
    manualLinesAdded: integer("manual_lines_added").notNull().default(0),
    manualLinesDeleted: integer("manual_lines_deleted").notNull().default(0),
    sessionCount: integer("session_count").notNull().default(0),
    modelUsageJson: jsonb("model_usage_json").notNull().default({}),
    ingestionSource: varchar("ingestion_source", { length: 20 }).notNull().default("api"),
    computedAt: timestamp("computed_at", { withTimezone: true }).defaultNow().notNull(),
    ...timestamps,
  },
  (table) => ({
    companyUserDateSourceUnique: uniqueIndex("cursor_usage_daily_company_user_date_source_unique").on(
      table.companyId,
      table.userId,
      table.usageDate,
      table.ingestionSource,
    ),
    companyDateIdx: index("cursor_usage_daily_company_date_idx").on(table.companyId, table.usageDate),
  }),
);

/** Daily snapshot of PM tasks for reopened / aging metrics (append-only per day). */
export const taskDeliverySnapshots = pgTable(
  "task_delivery_snapshots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    integrationType: integrationProviderEnum("integration_type").notNull(),
    externalWorkspaceId: varchar("external_workspace_id", { length: 120 }).notNull(),
    externalTaskId: varchar("external_task_id", { length: 120 }).notNull(),
    snapshotDate: timestamp("snapshot_date", { withTimezone: false }).notNull(),
    taskStatus: varchar("task_status", { length: 100 }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    assigneeUserId: uuid("assignee_user_id").references(() => users.id, { onDelete: "set null" }),
    storyPoints: numeric("story_points", { precision: 10, scale: 2 }),
    capturedAt: timestamp("captured_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    uniqueDayTask: uniqueIndex("task_delivery_snapshots_company_integration_task_day_unique").on(
      table.companyId,
      table.integrationType,
      table.externalWorkspaceId,
      table.externalTaskId,
      table.snapshotDate,
    ),
    companyDayIdx: index("task_delivery_snapshots_company_day_idx").on(
      table.companyId,
      table.integrationType,
      table.snapshotDate,
    ),
  }),
);

export const taskDeliveryMetricsDaily = pgTable(
  "task_delivery_metrics_daily",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    integrationType: integrationProviderEnum("integration_type").notNull(),
    externalWorkspaceId: varchar("external_workspace_id", { length: 120 }).notNull(),
    assigneeUserId: uuid("assignee_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    metricDate: timestamp("metric_date", { withTimezone: false }).notNull(),
    tasksCompleted: integer("tasks_completed").notNull().default(0),
    tasksReopened: integer("tasks_reopened").notNull().default(0),
    storyPointsCompleted: numeric("story_points_completed", { precision: 12, scale: 2 }).notNull().default("0"),
    tasksActiveEndOfDay: integer("tasks_active_end_of_day").notNull().default(0),
    computedAt: timestamp("computed_at", { withTimezone: true }).defaultNow().notNull(),
    ...timestamps,
  },
  (table) => ({
    uniqueGrain: uniqueIndex("task_delivery_metrics_daily_unique_grain").on(
      table.companyId,
      table.integrationType,
      table.externalWorkspaceId,
      table.assigneeUserId,
      table.metricDate,
    ),
    companyDateIdx: index("task_delivery_metrics_daily_company_date_idx").on(
      table.companyId,
      table.integrationType,
      table.metricDate,
    ),
  }),
);

export const timesheetDeliveryMetricsDaily = pgTable(
  "timesheet_delivery_metrics_daily",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    metricDate: timestamp("metric_date", { withTimezone: false }).notNull(),
    loggedDevMinutes: integer("logged_dev_minutes").notNull().default(0),
    entryCount: integer("entry_count").notNull().default(0),
    approvedEntryCount: integer("approved_entry_count").notNull().default(0),
    breakMinutesEstimate: integer("break_minutes_estimate").notNull().default(0),
    timesheetSubmittedForWeek: boolean("timesheet_submitted_for_week").notNull().default(false),
    computedAt: timestamp("computed_at", { withTimezone: true }).defaultNow().notNull(),
    ...timestamps,
  },
  (table) => ({
    uniqueGrain: uniqueIndex("timesheet_delivery_metrics_daily_unique_grain").on(
      table.companyId,
      table.userId,
      table.metricDate,
    ),
    companyDateIdx: index("timesheet_delivery_metrics_daily_company_date_idx").on(table.companyId, table.metricDate),
  }),
);

export const scoreWeightProfiles = pgTable(
  "score_weight_profiles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** When null, row is the global template (seeded). */
    companyId: uuid("company_id").references(() => companies.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull().default("Default"),
    isDefault: boolean("is_default").notNull().default(false),
    weightsJson: jsonb("weights_json").notNull(),
    schemaVersion: integer("schema_version").notNull().default(1),
    ...timestamps,
  },
  (table) => ({
    companyDefaultIdx: index("score_weight_profiles_company_default_idx").on(table.companyId, table.isDefault),
  }),
);

export const developerEffectivenessDaily = pgTable(
  "developer_effectiveness_daily",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    integrationType: integrationProviderEnum("integration_type").notNull(),
    externalWorkspaceId: varchar("external_workspace_id", { length: 120 }).notNull(),
    metricDate: timestamp("metric_date", { withTimezone: false }).notNull(),
    deliveryEffectivenessScore: numeric("delivery_effectiveness_score", { precision: 5, scale: 2 }),
    aiAdoptionScore: numeric("ai_adoption_score", { precision: 5, scale: 2 }),
    effectivenessBand: varchar("effectiveness_band", { length: 40 }),
    componentScoresJson: jsonb("component_scores_json"),
    weightProfileId: uuid("weight_profile_id").references(() => scoreWeightProfiles.id, { onDelete: "set null" }),
    ingestionBatchId: uuid("ingestion_batch_id"),
    computedAt: timestamp("computed_at", { withTimezone: true }).defaultNow().notNull(),
    ...timestamps,
  },
  (table) => ({
    uniqueGrain: uniqueIndex("developer_effectiveness_daily_unique_grain").on(
      table.companyId,
      table.userId,
      table.integrationType,
      table.externalWorkspaceId,
      table.metricDate,
    ),
    companyDateIdx: index("developer_effectiveness_daily_company_date_idx").on(
      table.companyId,
      table.integrationType,
      table.metricDate,
    ),
  }),
);

export const developerEffectivenessSprint = pgTable(
  "developer_effectiveness_sprint",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    integrationType: integrationProviderEnum("integration_type").notNull(),
    externalWorkspaceId: varchar("external_workspace_id", { length: 120 }).notNull(),
    externalSprintId: varchar("external_sprint_id", { length: 120 }).notNull(),
    periodStart: timestamp("period_start", { withTimezone: false }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: false }).notNull(),
    deliveryEffectivenessScore: numeric("delivery_effectiveness_score", { precision: 5, scale: 2 }),
    aiAdoptionScore: numeric("ai_adoption_score", { precision: 5, scale: 2 }),
    effectivenessBand: varchar("effectiveness_band", { length: 40 }),
    componentScoresJson: jsonb("component_scores_json"),
    weightProfileId: uuid("weight_profile_id").references(() => scoreWeightProfiles.id, { onDelete: "set null" }),
    ingestionBatchId: uuid("ingestion_batch_id"),
    computedAt: timestamp("computed_at", { withTimezone: true }).defaultNow().notNull(),
    ...timestamps,
  },
  (table) => ({
    uniqueGrain: uniqueIndex("developer_effectiveness_sprint_unique_grain").on(
      table.companyId,
      table.userId,
      table.integrationType,
      table.externalWorkspaceId,
      table.externalSprintId,
    ),
  }),
);

/** Append-only scored periods for historical report stability. */
export const developerScores = pgTable(
  "developer_scores",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    integrationType: integrationProviderEnum("integration_type").notNull(),
    externalWorkspaceId: varchar("external_workspace_id", { length: 120 }).notNull(),
    periodStart: timestamp("period_start", { withTimezone: false }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: false }).notNull(),
    weightProfileId: uuid("weight_profile_id").references(() => scoreWeightProfiles.id, { onDelete: "set null" }),
    deliveryEffectivenessScore: numeric("delivery_effectiveness_score", { precision: 5, scale: 2 }).notNull(),
    aiAdoptionScore: numeric("ai_adoption_score", { precision: 5, scale: 2 }).notNull(),
    effectivenessBand: varchar("effectiveness_band", { length: 40 }).notNull(),
    componentScoresJson: jsonb("component_scores_json").notNull(),
    ingestionBatchId: uuid("ingestion_batch_id").notNull(),
    computedAt: timestamp("computed_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    companyUserPeriodIdx: index("developer_scores_company_user_period_idx").on(
      table.companyId,
      table.userId,
      table.periodEnd,
    ),
  }),
);

export const aiInsightRuns = pgTable(
  "ai_insight_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    scopeType: aiInsightScopeEnum("scope_type").notNull(),
    subjectUserId: uuid("subject_user_id").references(() => users.id, { onDelete: "set null" }),
    periodStart: timestamp("period_start", { withTimezone: false }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: false }).notNull(),
    model: varchar("model", { length: 80 }),
    promptVersion: varchar("prompt_version", { length: 40 }),
    status: aiInsightRunStatusEnum("status").notNull().default("pending"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (table) => ({
    companyCreatedIdx: index("ai_insight_runs_company_created_idx").on(table.companyId, table.createdAt),
  }),
);

export const aiInsightOutputs = pgTable(
  "ai_insight_outputs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    runId: uuid("run_id").notNull().references(() => aiInsightRuns.id, { onDelete: "cascade" }),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    summaryText: text("summary_text"),
    panelsJson: jsonb("panels_json"),
    provenanceJson: jsonb("provenance_json"),
    timeRangeLabel: varchar("time_range_label", { length: 160 }),
    groundingHash: varchar("grounding_hash", { length: 128 }),
    confidenceNote: varchar("confidence_note", { length: 255 }),
    ...timestamps,
  },
  (table) => ({
    runIdx: index("ai_insight_outputs_run_idx").on(table.runId),
  }),
);
