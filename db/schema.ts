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

export const uploadedExams = sqliteTable(
  "uploaded_exams",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    sourceFileName: text("source_file_name").notNull(),
    sourceObjectKey: text("source_object_key").notNull(),
    questionCount: integer("question_count").notNull(),
    questionsJson: text("questions_json").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index("idx_uploaded_exams_created_at").on(table.createdAt)],
);
