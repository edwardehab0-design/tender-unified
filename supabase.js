// ── Supabase client ──────────────────────────────────────────
// القيم تُحقن من config.js الذي يُولَّد من متغيرات البيئة
// في Cloudflare Pages (SUPABASE_URL, SUPABASE_ANON_KEY)

const SUPABASE_URL  = window.APP_CONFIG?.supabaseUrl  || "";
const SUPABASE_KEY  = window.APP_CONFIG?.supabaseKey  || "";

// نستخدم Supabase JS v2 المحمّل من CDN في الـ HTML
const _sb = window.supabase?.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true }
});

if (!_sb) console.error("[supabase.js] Supabase client failed — check SUPABASE_URL / SUPABASE_KEY in config.js");

// ── Auth ──────────────────────────────────────────────────────

export async function signIn(email, password) {
  const { data, error } = await _sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.session;
}

export async function signOut() {
  await _sb.auth.signOut();
  window.location.href = "/login.html";
}

export async function getSession() {
  const { data } = await _sb.auth.getSession();
  return data?.session ?? null;
}

export async function requireAuth() {
  const session = await getSession();
  if (!session) { window.location.href = "/login.html"; return null; }
  return session;
}

export async function getProfile(userId) {
  const { data, error } = await _sb
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();
  if (error) throw error;
  return data;
}

// ── Tenders ──────────────────────────────────────────────────

export async function fetchTenders() {
  const { data, error } = await _sb
    .from("tenders")
    .select("*")
    .order("submit_date", { ascending: true });
  if (error) throw error;
  return data;
}

export async function upsertTender(tender) {
  const { error } = await _sb.from("tenders").upsert(tender);
  if (error) throw error;
}

// ── Dept Status ──────────────────────────────────────────────

export async function fetchAllDeptStatuses() {
  const { data, error } = await _sb.from("tender_dept_status").select("*");
  if (error) throw error;
  return data;                     // [{tender_id, dept_key, status, completed_at}]
}

export async function setDeptStatus(tenderId, deptKey, status) {
  const { error } = await _sb.from("tender_dept_status").upsert({
    tender_id: tenderId,
    dept_key: deptKey,
    status,
    completed_at: status === "completed" ? new Date().toISOString() : null,
    updated_by: (await getSession())?.user?.id,
    updated_at: new Date().toISOString()
  });
  if (error) throw error;
}

// ── Assignments ──────────────────────────────────────────────

export async function fetchAllAssignments() {
  const { data, error } = await _sb.from("tender_assignments").select("*");
  if (error) throw error;
  return data;                     // [{tender_id, dept_key, engineer_name}]
}

export async function setAssignments(tenderId, deptKey, names) {
  const userId = (await getSession())?.user?.id;
  await _sb.from("tender_assignments")
    .delete().eq("tender_id", tenderId).eq("dept_key", deptKey);
  if (names.length) {
    const { error } = await _sb.from("tender_assignments").insert(
      names.map((n) => ({ tender_id: tenderId, dept_key: deptKey, engineer_name: n, assigned_by: userId }))
    );
    if (error) throw error;
  }
}

// ── Stage Overrides ──────────────────────────────────────────

export async function fetchAllStageOverrides() {
  const { data, error } = await _sb.from("tender_stage_override").select("*");
  if (error) throw error;
  return data;
}

export async function setStageOverride(tenderId, stage) {
  if (!stage) {
    await _sb.from("tender_stage_override").delete().eq("tender_id", tenderId);
    return;
  }
  const { error } = await _sb.from("tender_stage_override").upsert({
    tender_id: tenderId, stage,
    set_at: new Date().toISOString(),
    set_by: (await getSession())?.user?.id
  });
  if (error) throw error;
}

// ── Approvals ────────────────────────────────────────────────

export async function fetchAllApprovals() {
  const { data, error } = await _sb.from("tender_approvals").select("*");
  if (error) throw error;
  return data;
}

export async function setApprovalDb(tenderId, decision) {
  const { error } = await _sb.from("tender_approvals").upsert({
    tender_id: tenderId, decision,
    decided_at: new Date().toISOString(),
    decided_by: (await getSession())?.user?.id
  });
  if (error) throw error;
}

// ── Comments ─────────────────────────────────────────────────

export async function fetchComments(tenderId, deptKey) {
  const { data, error } = await _sb.from("tender_comments")
    .select("*")
    .eq("tender_id", tenderId)
    .eq("dept_key", deptKey)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data;
}

export async function addComment(tenderId, deptKey, body) {
  const session = await getSession();
  const { error } = await _sb.from("tender_comments").insert({
    tender_id: tenderId, dept_key: deptKey, body,
    author_id: session?.user?.id,
    author_name: session?.user?.user_metadata?.full_name || session?.user?.email
  });
  if (error) throw error;
}

// ── Activity Log ─────────────────────────────────────────────

export async function logActivity(tenderId, tenderTitle, action, note) {
  const session = await getSession();
  const { error } = await _sb.from("activity_log").insert({
    tender_id: tenderId, tender_title: tenderTitle,
    action, note,
    user_id: session?.user?.id,
    user_name: session?.user?.user_metadata?.full_name || session?.user?.email
  });
  if (error) console.warn("[logActivity]", error.message);
}

export async function fetchActivityLog(tenderId) {
  const q = _sb.from("activity_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);
  if (tenderId) q.eq("tender_id", tenderId);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

// ── Real-time subscription ────────────────────────────────────
// استدعِ هذه الدالة مرة واحدة لتلقي التحديثات الفورية على الـ board
export function subscribeToChanges(onUpdate) {
  return _sb.channel("portal-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "tender_dept_status" }, onUpdate)
    .on("postgres_changes", { event: "*", schema: "public", table: "tender_assignments" }, onUpdate)
    .on("postgres_changes", { event: "*", schema: "public", table: "tender_approvals" }, onUpdate)
    .on("postgres_changes", { event: "*", schema: "public", table: "tender_stage_override" }, onUpdate)
    .subscribe();
}
