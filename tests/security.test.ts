import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const initialSql = readFileSync(resolve("supabase/migrations/202608020001_sprint1.sql"), "utf8");
const correctionSql = readFileSync(resolve("supabase/migrations/202608070001_protect_candidate_workflow.sql"), "utf8");

describe("database security contract", () => {
  it("enables RLS on every recruitment table", () => {
    for (const table of ["user_profiles", "vacancies", "vacancy_stages", "candidates", "candidate_documents", "candidate_stage_history", "activity_logs"])
      expect(initialSql).toContain(`alter table public.${table} enable row level security`);
  });
  it("restricts writes to HR", () => expect(initialSql.match(/public\.is_hr\(\)/g)?.length).toBeGreaterThan(8));
  it("keeps CV storage private", () => expect(initialSql).toContain("'candidate-cvs','candidate-cvs',false"));
  it("allows HR to remove replaced CV objects", () => expect(initialSql).toContain("create policy cv_hr_delete on storage.objects for delete to authenticated"));
  it("makes history append-only for authenticated users", () => {
    expect(initialSql).toContain("revoke update, delete on public.activity_logs");
    expect(initialSql).toContain("revoke update, delete on public.candidate_stage_history");
  });
  it("validates sequential movement inside the database", () => expect(initialSql).toContain("target_order <> current_order + 1"));
  it("protects workflow-owned candidate columns from direct authenticated updates", () => {
    for (const sql of [initialSql, correctionSql]) {
      expect(sql).toContain("revoke update on public.candidates from authenticated");
      expect(sql).toContain("grant update (full_name, email, phone, source, notes) on public.candidates to authenticated");
    }
  });
  it("rejects stage movement for closed candidates", () => {
    expect(initialSql).toContain("Closed candidates cannot change stage");
    expect(correctionSql).toContain("Closed candidates cannot change stage");
  });
});
