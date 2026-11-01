// null keeps translated defaults live; [] deliberately hides all suggestions.
export function readingPrompts(value, defaults) {
  if (!Array.isArray(value)) return defaults.map(item => ({ ...item }));
  return value.filter(item => item && typeof item.name === "string" && typeof item.prompt === "string")
    .filter(item => item.name.trim() && item.prompt.trim()).slice(0, 20)
    .map((item, index) => ({ id: String(item.id || `custom-${index}`), name: item.name, prompt: item.prompt }));
}

// Edits stay local until Save succeeds. Rendering uses text nodes so prompts
// containing Markdown, HTML or code remain plain editable user data.
export function renderPromptEditor(host, { value, defaults, translate: t, save, close }) {
  const doc = host.ownerDocument;
  let draft = readingPrompts(value, defaults);
  let restored = false;
  let pending = false;
  const el = (parent, tag, text, cls) => {
    const node = doc.createElement(tag);
    if (text) node.textContent = text;
    if (cls) node.className = cls;
    parent.append(node);
    return node;
  };
  const button = (parent, key, fn) => {
    const node = el(parent, "button", t(key));
    node.type = "button";
    node.addEventListener("click", fn);
    return node;
  };
  host.classList.add("qiaomu-reader-prompt-editor");
  el(host, "p", t("the-name-appears-on-the-button-the-full-prompt-is-sent-to-ai"));
  const list = el(host, "div", "", "qiaomu-reader-prompt-list");
  const error = el(host, "div", "", "qiaomu-reader-prompt-error");
  error.setAttribute("role", "alert");
  const actions = el(host, "div", "", "qiaomu-reader-prompt-actions");
  const draw = () => {
    list.replaceChildren();
    if (!draft.length) el(list, "p", t("no-quick-prompts-yet-add-one-or-restore-the-built-ins"));
    for (const item of draft) {
      const row = el(list, "div", "", "qiaomu-reader-prompt-item");
      const nameLabel = el(row, "label", t("button-label"));
      const name = el(nameLabel, "input");
      name.type = "text";
      name.value = item.name;
      name.addEventListener("input", () => { item.name = name.value; restored = false; });
      const bodyLabel = el(row, "label", t("prompt-sent-to-ai"));
      const body = el(bodyLabel, "textarea");
      body.rows = 4;
      body.value = item.prompt;
      body.addEventListener("input", () => { item.prompt = body.value; restored = false; });
      button(row, "delete", () => {
        draft = draft.filter(other => other !== item);
        restored = false;
        draw();
      });
    }
    add.disabled = draft.length >= 20;
  };
  const add = button(actions, "add-prompt", () => {
    if (draft.length >= 20) return;
    draft.push({ id: doc.defaultView.crypto.randomUUID(), name: "", prompt: "" });
    restored = false;
    draw();
    list.lastElementChild.querySelector("input").focus();
  });
  button(actions, "restore-defaults", () => {
    draft = readingPrompts(null, defaults);
    restored = true;
    error.textContent = "";
    draw();
  });
  button(actions, "cancel", () => { if (!pending) close(); });
  const submit = button(actions, "save", async () => {
    if (pending) return;
    if (draft.some(item => !item.name.trim() || !item.prompt.trim())) {
      error.textContent = t("enter-both-a-name-and-prompt-text");
      return;
    }
    pending = true;
    for (const control of host.querySelectorAll("button, input, textarea")) control.disabled = true;
    try {
      await save(restored ? null : draft.map(item => ({ ...item, name: item.name.trim(), prompt: item.prompt.trim() })));
      close();
    } catch {
      error.textContent = t("saving-failed-check-vault-permissions-and-retry");
    } finally {
      pending = false;
      for (const control of host.querySelectorAll("button, input, textarea")) control.disabled = false;
      add.disabled = draft.length >= 20;
    }
  });
  submit.classList.add("mod-cta");
  draw();
}
