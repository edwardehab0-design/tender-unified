// ── db.js ─────────────────────────────────────────────────────
// طبقة الوصول إلى Supabase للوحة العمليات (سكربت كلاسيكي، يعمل قبل app.js).
// تُحوّل بيانات الجداول إلى/من نفس شكل savedState المستخدم في app.js،
// بحيث لا يتغيّر منطق العرض. إن لم تكن Supabase مهيّأة يعمل التطبيق
// تلقائياً على data.json + localStorage كما كان.
(function () {
  const cfg = window.APP_CONFIG || {};
  const configured = !!(
    cfg.supabaseUrl && cfg.supabaseKey &&
    !cfg.supabaseUrl.includes("__") && !cfg.supabaseKey.includes("__")
  );

  let client = null;
  function sb() {
    if (!configured || !window.supabase) return null;
    if (!client) {
      client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, {
        auth: { persistSession: true, autoRefreshToken: true }
      });
    }
    return client;
  }

  async function currentUserId() {
    const c = sb();
    if (!c) return null;
    const { data } = await c.auth.getSession();
    return data?.session?.user?.id || null;
  }

  // ── القراءة ──────────────────────────────────────────────────

  // المناقصات الجارية فقط (هي ما يظهر على اللوحة)؛ نُعيدها بمفاتيح عربية
  // ليعالجها normalizeTender في app.js بنفس مسار data.json.
  async function fetchTenders() {
    const c = sb();
    if (!c) return null;
    const { data, error } = await c.from("tenders")
      .select("id,title,client,sector,submit_date,external_status")
      .eq("external_status", "جارية")
      .order("submit_date", { ascending: true });
    if (error) { console.warn("[db] fetchTenders:", error.message); return null; }
    return (data || []).map((r) => ({
      tender_id: r.id,
      "اسم المناقصة": r.title,
      "المالك": r.client,
      "القطاع": r.sector,
      "تاريخ التقديم": r.submit_date,
      "الحالة": r.external_status
    }));
  }

  // يبني كائناً بنفس شكل savedState من جداول الحالة الخمسة.
  async function fetchState() {
    const c = sb();
    if (!c) return null;
    const state = {};
    const ensure = (id) => (state[id] = state[id] || {});

    const [ds, asg, ap, ov, cm] = await Promise.all([
      c.from("tender_dept_status").select("*"),
      c.from("tender_assignments").select("*"),
      c.from("tender_approvals").select("*"),
      c.from("tender_stage_override").select("*"),
      c.from("tender_comments").select("*").order("created_at", { ascending: false })
    ]);

    (ds.data || []).forEach((r) => {
      const s = ensure(r.tender_id);
      s.departments = s.departments || {};
      s.departments[r.dept_key] = r.status;
      if (r.completed_at) {
        s.timing = s.timing || {};
        s.timing[r.dept_key] = s.timing[r.dept_key] || {};
        s.timing[r.dept_key].completedAt = r.completed_at;
      }
    });
    (asg.data || []).forEach((r) => {
      const s = ensure(r.tender_id);
      s.assignments = s.assignments || {};
      s.assignments[r.dept_key] = s.assignments[r.dept_key] || [];
      s.assignments[r.dept_key].push(r.engineer_name);
      if (r.assigned_at) {
        s.timing = s.timing || {};
        s.timing[r.dept_key] = s.timing[r.dept_key] || {};
        s.timing[r.dept_key].assignedAt = r.assigned_at;
      }
    });
    (ap.data || []).forEach((r) => { ensure(r.tender_id).approval = r.decision; });
    (ov.data || []).forEach((r) => { ensure(r.tender_id).stage = r.stage; });
    (cm.data || []).forEach((r) => {
      const s = ensure(r.tender_id);
      s.comments = s.comments || {};
      s.comments[r.dept_key] = s.comments[r.dept_key] || [];
      s.comments[r.dept_key].push({ text: r.body, at: r.created_at, by: r.author_name || "" });
    });
    return state;
  }

  // ── الكتابة (write-through، أخطاؤها لا توقف الواجهة) ──────────

  async function setDeptStatus(tenderId, deptKey, status) {
    const c = sb();
    if (!c) return;
    const { error } = await c.from("tender_dept_status").upsert({
      tender_id: tenderId, dept_key: deptKey, status,
      completed_at: status === "completed" ? new Date().toISOString() : null,
      updated_by: await currentUserId(), updated_at: new Date().toISOString()
    }, { onConflict: "tender_id,dept_key" });
    if (error) console.warn("[db] setDeptStatus:", error.message);
  }

  async function setApproval(tenderId, decision) {
    const c = sb();
    if (!c) return;
    if (!decision) {
      await c.from("tender_approvals").delete().eq("tender_id", tenderId);
      return;
    }
    const { error } = await c.from("tender_approvals").upsert({
      tender_id: tenderId, decision,
      decided_at: new Date().toISOString(), decided_by: await currentUserId()
    }, { onConflict: "tender_id" });
    if (error) console.warn("[db] setApproval:", error.message);
  }

  async function setAssignments(tenderId, deptKey, names) {
    const c = sb();
    if (!c) return;
    const u = await currentUserId();
    await c.from("tender_assignments").delete().eq("tender_id", tenderId).eq("dept_key", deptKey);
    if (names && names.length) {
      const { error } = await c.from("tender_assignments").insert(
        names.map((n) => ({ tender_id: tenderId, dept_key: deptKey, engineer_name: n, assigned_by: u }))
      );
      if (error) console.warn("[db] setAssignments:", error.message);
    }
  }

  async function addComment(tenderId, deptKey, body) {
    const c = sb();
    if (!c) return;
    const { data } = await c.auth.getSession();
    const sess = data?.session;
    const { error } = await c.from("tender_comments").insert({
      tender_id: tenderId, dept_key: deptKey, body,
      author_id: sess?.user?.id,
      author_name: sess?.user?.user_metadata?.full_name || sess?.user?.email
    });
    if (error) console.warn("[db] addComment:", error.message);
  }

  async function setStageOverride(tenderId, stage) {
    const c = sb();
    if (!c) return;
    if (!stage) {
      await c.from("tender_stage_override").delete().eq("tender_id", tenderId);
      return;
    }
    const { error } = await c.from("tender_stage_override").upsert({
      tender_id: tenderId, stage,
      set_at: new Date().toISOString(), set_by: await currentUserId()
    }, { onConflict: "tender_id" });
    if (error) console.warn("[db] setStageOverride:", error.message);
  }

  // ── التحديثات الفورية (best-effort) ──────────────────────────
  function subscribe(onChange) {
    const c = sb();
    if (!c) return null;
    return c.channel("ops-board")
      .on("postgres_changes", { event: "*", schema: "public", table: "tender_dept_status" }, onChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "tender_assignments" }, onChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "tender_approvals" }, onChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "tender_stage_override" }, onChange)
      .on("postgres_changes", { event: "*", schema: "public", table: "tender_comments" }, onChange)
      .subscribe();
  }

  window.SB = {
    get enabled() { return configured; },
    client: sb,
    fetchTenders, fetchState,
    setDeptStatus, setApproval, setAssignments, addComment, setStageOverride,
    subscribe
  };
})();
