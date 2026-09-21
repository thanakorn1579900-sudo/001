import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const studentProfiles = sqliteTable(
  "student_profiles",
  {
    userId: text("user_id").primaryKey(),
    name: text("name").notNull(),
    classLevel: text("class_level").notNull(),
    studentId: text("student_id").notNull(),
    email: text("email").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [uniqueIndex("uq_student_profiles_student_id").on(table.studentId)],
);

export const adminUsers = sqliteTable("admin_users", {
  userId: text("user_id").primaryKey(),
  email: text("email").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const teacherAccounts = sqliteTable(
  "teacher_accounts",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    passwordSalt: text("password_salt").notNull(),
    status: text("status").notNull().default("pending"),
    examEnabled: integer("exam_enabled", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    approvedAt: text("approved_at"),
  },
  (table) => [
    uniqueIndex("uq_teacher_accounts_email").on(table.email),
    index("idx_teacher_accounts_status").on(table.status),
    index("idx_teacher_accounts_public").on(table.status, table.examEnabled),
  ],
);

export const uploadedExams = sqliteTable(
  "uploaded_exams",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    sourceFileName: text("source_file_name").notNull(),
    sourceObjectKey: text("source_object_key").notNull(),
    teacherId: text("teacher_id").notNull().default("system"),
    questionCount: integer("question_count").notNull(),
    questionsJson: text("questions_json").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_uploaded_exams_created_at").on(table.createdAt),
    index("idx_uploaded_exams_teacher_created").on(table.teacherId, table.createdAt),
  ],
);

export const catalogExamOverrides = sqliteTable(
  "catalog_exam_overrides",
  {
    subjectId: text("subject_id").primaryKey(),
    teacherId: text("teacher_id").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    questionsJson: text("questions_json").notNull(),
    isVisible: integer("is_visible", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("idx_catalog_exam_overrides_teacher_visible").on(table.teacherId, table.isVisible)],
);
