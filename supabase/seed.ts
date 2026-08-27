import { createClient } from "@supabase/supabase-js";

async function main() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const users = [
    { email: "hr@hirelens.demo", password: process.env.SEED_HR_PASSWORD!, full_name: "Harper Reed", role: "HR_RECRUITER" },
    { email: "interviewer@hirelens.demo", password: process.env.SEED_INTERVIEWER_PASSWORD!, full_name: "Ira Patel", role: "INTERVIEWER" },
    { email: "management@hirelens.demo", password: process.env.SEED_MANAGEMENT_PASSWORD!, full_name: "Morgan Lee", role: "MANAGEMENT" }
  ] as const;
  for (const item of users) {
    if (!item.password) throw new Error(`Missing seed password for ${item.email}`);
    const { data, error } = await supabase.auth.admin.createUser({ email: item.email, password: item.password, email_confirm: true });
    if (error) throw error;
    const { error: profileError } = await supabase.from("user_profiles").insert({ authentication_user_id: data.user.id, full_name: item.full_name, role: item.role });
    if (profileError) throw profileError;
  }
}

main().catch((error) => {
  console.error("Seed failed:", error);
  process.exit(1);
});
