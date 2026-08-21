let currentUser = null;
let activeTab = "projects";
let cache = { projects: [], buildings: [], units: {} };

function $(sel, root = document) { return root.querySelector(sel); }
function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "text") node.textContent = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const child of [].concat(children)) {
    if (child) node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return node;
}

async function api(path, opts = {}) {
  const res = await fetch(`/api${path}`, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* no body */ }
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}

function toast(message, isError = false) {
  const t = el("div", { class: `toast${isError ? " error" : ""}`, text: message });
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

// ---- Auth ----

async function boot() {
  try {
    currentUser = await api("/auth/me");
    showApp();
  } catch {
    showLogin();
  }
}

function showLogin() {
  $("#login-screen").hidden = false;
  $("#app-screen").hidden = true;
}

function showApp() {
  $("#login-screen").hidden = true;
  $("#app-screen").hidden = false;
  $("#who-name").textContent = currentUser.fullName;
  $("#who-role").textContent = currentUser.role || "—";
  $("#users-tab").hidden = currentUser.role !== "Admin";
  renderTab();
}

$("#login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("#login-error").textContent = "";
  try {
    const body = { email: $("#login-email").value, password: $("#login-password").value };
    const { user } = await api("/auth/login", { method: "POST", body });
    currentUser = user;
    showApp();
  } catch (err) {
    $("#login-error").textContent = err.message;
  }
});

$("#logout-btn").addEventListener("click", async () => {
  await api("/auth/logout", { method: "POST" });
  currentUser = null;
  showLogin();
});

// ---- Tabs ----

document.querySelectorAll(".tab").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    activeTab = btn.dataset.tab;
    renderTab();
  });
});

async function renderTab() {
  const content = $("#content");
  content.innerHTML = "<p class='muted'>Loading…</p>";
  try {
    if (activeTab === "projects") return renderProjects(content);
    if (activeTab === "buildings") return renderBuildings(content);
    if (activeTab === "reserves") return renderReserves(content);
    if (activeTab === "edl") return renderEdl(content);
    if (activeTab === "users") return renderUsers(content);
    if (activeTab === "logs") return renderLogs(content);
  } catch (err) {
    content.innerHTML = "";
    content.appendChild(el("p", { class: "error", text: err.message }));
  }
}

// ---- Projects ----

async function renderProjects(content) {
  const projects = await api("/projects");
  cache.projects = projects;
  content.innerHTML = "";

  const panel = el("div", { class: "panel" });
  panel.appendChild(el("h2", { text: "Projects" }));

  if (currentUser.canEdit) {
    const form = el("form", { class: "form-row" });
    const code = el("input", { placeholder: "Code (e.g. 2602-0001)", required: "true" });
    const name = el("input", { placeholder: "Name", required: "true" });
    const city = el("input", { placeholder: "City" });
    const country = el("input", { placeholder: "Country" });
    form.append(
      el("label", {}, ["Code", code]),
      el("label", {}, ["Name", name]),
      el("label", {}, ["City", city]),
      el("label", {}, ["Country", country]),
      el("button", { type: "submit", text: "Add project" })
    );
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        await api("/projects", { method: "POST", body: { code: code.value, name: name.value, city: city.value, country: country.value } });
        toast("Project created");
        renderTab();
      } catch (err) { toast(err.message, true); }
    });
    panel.appendChild(form);
  }

  const table = el("table");
  table.appendChild(el("tr", {}, ["Code", "Name", "Status", "City", "Units", "Progress"].map((h) => el("th", { text: h }))));
  for (const p of projects) {
    table.appendChild(el("tr", {}, [
      el("td", { text: p.code }),
      el("td", { text: p.name }),
      el("td", {}, [el("span", { class: "status-pill", text: p.status })]),
      el("td", { text: p.city || "—" }),
      el("td", { text: p.units ?? "—" }),
      el("td", { text: p.progressPct != null ? `${p.progressPct}%` : "—" }),
    ]));
  }
  panel.appendChild(table);
  content.appendChild(panel);
}

// ---- Buildings / Units ----

async function renderBuildings(content) {
  content.innerHTML = "";
  const projects = cache.projects.length ? cache.projects : (cache.projects = await api("/projects"));

  const panel = el("div", { class: "panel" });
  panel.appendChild(el("h2", { text: "Buildings" }));

  const select = el("select");
  select.appendChild(el("option", { value: "", text: "Select a project…" }));
  for (const p of projects) select.appendChild(el("option", { value: p.id, text: `${p.code} — ${p.name}` }));
  panel.appendChild(el("div", { class: "form-row" }, [el("label", {}, ["Project", select])]));

  const buildingsBox = el("div");
  panel.appendChild(buildingsBox);
  content.appendChild(panel);

  select.addEventListener("change", () => loadBuildings(select.value, buildingsBox));
}

async function loadBuildings(projectId, box) {
  box.innerHTML = "";
  if (!projectId) return;
  const buildings = await api(`/buildings?projectId=${projectId}`);
  cache.buildings = buildings;

  if (currentUser.canEdit) {
    const form = el("form", { class: "form-row" });
    const code = el("input", { placeholder: "Building code (e.g. A)", required: "true" });
    form.append(el("label", {}, ["New building", code]), el("button", { type: "submit", text: "Add" }));
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        await api("/buildings", { method: "POST", body: { projectId, code: code.value } });
        toast("Building created");
        loadBuildings(projectId, box);
      } catch (err) { toast(err.message, true); }
    });
    box.appendChild(form);
  }

  for (const b of buildings) {
    const section = el("div", { class: "panel" });
    section.appendChild(el("h2", { text: `Building ${b.code}` }));
    const unitsTable = el("table");
    unitsTable.appendChild(el("tr", {}, ["Identifiant", "Hall", "Floor", "Type", "Surface m²"].map((h) => el("th", { text: h }))));
    for (const u of b.units) {
      unitsTable.appendChild(el("tr", {}, [
        el("td", { text: u.identifiant }),
        el("td", { text: u.hall || "—" }),
        el("td", { text: u.floor || "—" }),
        el("td", { text: u.type || "—" }),
        el("td", { text: u.surfaceM2 || "—" }),
      ]));
    }
    section.appendChild(unitsTable);

    if (currentUser.canEdit) {
      const uform = el("form", { class: "form-row" });
      const identifiant = el("input", { placeholder: "Identifiant (1-A-B01-01-100)", required: "true" });
      const hall = el("input", { placeholder: "Hall" });
      const floor = el("input", { placeholder: "Floor" });
      uform.append(
        el("label", {}, ["Identifiant", identifiant]),
        el("label", {}, ["Hall", hall]),
        el("label", {}, ["Floor", floor]),
        el("button", { type: "submit", text: "Add unit" })
      );
      uform.addEventListener("submit", async (e) => {
        e.preventDefault();
        try {
          await api(`/buildings/${b.id}/units`, { method: "POST", body: { identifiant: identifiant.value, hall: hall.value, floor: floor.value } });
          toast("Unit created");
          loadBuildings(projectId, box);
        } catch (err) { toast(err.message, true); }
      });
      section.appendChild(uform);
    }
    box.appendChild(section);
  }
}

// ---- Reserves ----

async function renderReserves(content) {
  content.innerHTML = "";
  const projects = cache.projects.length ? cache.projects : (cache.projects = await api("/projects"));

  const panel = el("div", { class: "panel" });
  panel.appendChild(el("h2", { text: "Reserves" }));

  const select = el("select");
  select.appendChild(el("option", { value: "", text: "All projects" }));
  for (const p of projects) select.appendChild(el("option", { value: p.id, text: `${p.code} — ${p.name}` }));
  panel.appendChild(el("div", { class: "form-row" }, [el("label", {}, ["Project", select])]));

  const box = el("div");
  panel.appendChild(box);
  content.appendChild(panel);

  const load = async () => {
    box.innerHTML = "";
    const qs = select.value ? `?projectId=${select.value}` : "";
    const reserves = await api(`/reserves${qs}`);
    const table = el("table");
    table.appendChild(el("tr", {}, ["Code", "Kind", "Unit", "Description", "Status", "Cleared"].map((h) => el("th", { text: h }))));
    for (const r of reserves) {
      table.appendChild(el("tr", {}, [
        el("td", { text: r.code }),
        el("td", { text: r.kind }),
        el("td", { text: r.unit?.identifiant || r.commonArea?.identifiant || r.facade?.identifiant || "—" }),
        el("td", { text: r.description || "—" }),
        el("td", {}, [el("span", { class: "status-pill", text: r.status })]),
        el("td", { text: r.cleared ? "Yes" : "No" }),
      ]));
    }
    box.appendChild(table);
  };
  select.addEventListener("change", load);
  load();
}

// ---- EDL ----

async function renderEdl(content) {
  content.innerHTML = "";
  const panel = el("div", { class: "panel" });
  panel.appendChild(el("h2", { text: "EDL — Unit notes & photos" }));
  panel.appendChild(el("p", { class: "muted", text: "Enter a unit ID (see Buildings tab) to view/edit its EDL notes and photos." }));

  const idInput = el("input", { placeholder: "Unit ID" });
  const loadBtn = el("button", { type: "button", text: "Load" });
  panel.appendChild(el("div", { class: "form-row" }, [el("label", {}, ["Unit ID", idInput]), loadBtn]));

  const box = el("div");
  panel.appendChild(box);
  content.appendChild(panel);

  loadBtn.addEventListener("click", async () => {
    box.innerHTML = "";
    const unitId = idInput.value.trim();
    if (!unitId) return;
    try {
      const notes = await api(`/edl/notes/${unitId}`);
      const notesTable = el("table");
      notesTable.appendChild(el("tr", {}, ["Room", "Public note", "Private note"].map((h) => el("th", { text: h }))));
      for (const n of notes) {
        notesTable.appendChild(el("tr", {}, [el("td", { text: n.room }), el("td", { text: n.notePublic || "—" }), el("td", { text: n.notePrivate || "—" })]));
      }
      box.appendChild(notesTable);

      if (currentUser.canEdit) {
        const form = el("form", { class: "form-row" });
        const room = el("input", { placeholder: "Room", required: "true" });
        const pub = el("input", { placeholder: "Public note" });
        const priv = el("input", { placeholder: "Private note" });
        form.append(
          el("label", {}, ["Room", room]),
          el("label", {}, ["Public", pub]),
          el("label", {}, ["Private", priv]),
          el("button", { type: "submit", text: "Save note" })
        );
        form.addEventListener("submit", async (e) => {
          e.preventDefault();
          try {
            await api(`/edl/notes/${unitId}/${encodeURIComponent(room.value)}`, { method: "PUT", body: { notePublic: pub.value, notePrivate: priv.value } });
            toast("Note saved");
            loadBtn.click();
          } catch (err) { toast(err.message, true); }
        });
        box.appendChild(form);
      }
    } catch (err) {
      box.appendChild(el("p", { class: "error", text: err.message }));
    }
  });
}

// ---- Users (admin) ----

async function renderUsers(content) {
  content.innerHTML = "";
  const users = await api("/users");
  const panel = el("div", { class: "panel" });
  panel.appendChild(el("h2", { text: "Users" }));
  const table = el("table");
  table.appendChild(el("tr", {}, ["Name", "Email", "Role", "Team", "Status"].map((h) => el("th", { text: h }))));
  for (const u of users) {
    table.appendChild(el("tr", {}, [
      el("td", { text: u.fullName }),
      el("td", { text: u.email }),
      el("td", { text: u.role || "—" }),
      el("td", { text: u.team || "—" }),
      el("td", {}, [el("span", { class: "status-pill", text: u.status })]),
    ]));
  }
  panel.appendChild(table);
  content.appendChild(panel);
}

// ---- Logs ----

async function renderLogs(content) {
  content.innerHTML = "";
  const logs = await api("/logs");
  const panel = el("div", { class: "panel" });
  panel.appendChild(el("h2", { text: "Activity log" }));
  if (!logs.length) {
    panel.appendChild(el("p", { class: "muted", text: "No activity logged yet." }));
  } else {
    const table = el("table");
    table.appendChild(el("tr", {}, ["When", "User", "Action", "Entity"].map((h) => el("th", { text: h }))));
    for (const l of logs) {
      table.appendChild(el("tr", {}, [
        el("td", { text: new Date(l.createdAt).toLocaleString() }),
        el("td", { text: l.userEmail || "—" }),
        el("td", { text: l.action }),
        el("td", { text: l.entityKind }),
      ]));
    }
    panel.appendChild(table);
  }
  content.appendChild(panel);
}

boot();
