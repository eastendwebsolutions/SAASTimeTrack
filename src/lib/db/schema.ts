import {
  boolean,
  index,
  integer,
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
