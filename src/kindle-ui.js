import { Modal, Notice, Platform } from "obsidian";

function errorText(t, error) {
  const code = error?.code;
  if (code === "cancelled" || error?.name === "AbortError") return t("kindle.cancelled");
  if (code === "address") return t("kindle.error-address");
  if (code === "not-found") return t("kindle.not-found");
  if (code === "host-key") return t("kindle.error-host");
  if (["usb", "usb-settings"].includes(code)) return t("kindle.error-usb");
  if (["key", "save", "auth"].includes(code)) return t("kindle.error-key");
  if (["file", "format", "size", "changed"].includes(code)) return t("kindle.error-file");
  if (code === "verify") return t("kindle.error-verify");
  if (code === "busy") return t("kindle.busy");
  return t("kindle.error-network");
}
async function chooseUsbRoot(controller) {
  const roots = await controller.findUsb();
  if (roots.length === 1) return roots[0];
  const dialog = (() => {
    try { return window.require("@electron/remote").dialog; } catch { /* Older desktop hosts expose remote on electron. */ }
    try { return window.require("electron").remote?.dialog; } catch { return null; }
  })();
  if (!dialog) throw Object.assign(new Error("usb"), { code: "usb" });
  const result = await dialog.showOpenDialog({ properties: ["openDirectory"] });
  return result.canceled ? null : result.filePaths?.[0] || null;
}

export class KindlePairingModal extends Modal {
  constructor(plugin, t, file = null) {
    super(plugin.app); this.plugin = plugin; this.t = t; this.file = file;
    this.controller = plugin.kindle; this.abortController = new AbortController(); this.closed = false;
  }
  onOpen() {
    this.controller.trackModal(this, true);
    this.modalEl.addClass("qiaomu-reader-kindle-modal");
    this.setTitle(this.t("kindle.title"));
    const body = this.contentEl; body.addClass("qiaomu-reader-kindle-body");
    this.intro = body.createEl("p", { cls: "qiaomu-reader-kindle-intro" });
    const pair = body.createDiv({ cls: "qiaomu-reader-kindle-pair" });
    this.usbHeading = pair.createEl("h3");
    this.usbHelp = pair.createEl("p", { text: this.t("kindle.usb-description") });
    this.pairButton = pair.createEl("button", { text: this.t(this.controller.isPaired() ? "kindle.repair" : "kindle.pair"), attr: { type: "button" } });
    this.pairButton.addEventListener("click", () => void this.pair());
    const config = this.controller.config(), id = `kindle-host-${body.ownerDocument.defaultView.crypto.randomUUID()}`;
    this.wifi = body.createDiv({ cls: "qiaomu-reader-kindle-wifi" });
    this.wifi.createEl("h3", { text: this.t("kindle.step-wifi") });
    this.wifi.createEl("p", { cls: "qiaomu-reader-kindle-help", text: this.t("kindle.address-help") });
    const field = this.wifi.createDiv({ cls: "qiaomu-reader-kindle-field" });
    field.createEl("label", { text: this.t("kindle.address"), attr: { for: id } });
    const addressRow = field.createDiv({ cls: "qiaomu-reader-kindle-address-row" });
    this.host = addressRow.createEl("input", { attr: { id, type: "text", placeholder: "192.168.1.100", autocomplete: "off", spellcheck: "false" } });
    this.host.value = config.host || "";
    this.findButton = addressRow.createEl("button", { text: this.t("kindle.find"), attr: { type: "button" } });
    this.findButton.addEventListener("click", () => void this.discover());
    this.status = body.createDiv({ cls: "qiaomu-reader-kindle-status", attr: { role: "status", "aria-live": "polite" } });
    const footer = body.createDiv({ cls: "qiaomu-reader-kindle-footer" });
    this.closeButton = footer.createEl("button", { text: this.t("kindle.close"), attr: { type: "button" } });
    this.closeButton.addEventListener("click", () => this.close());
    this.testButton = footer.createEl("button", { cls: "qiaomu-reader-kindle-primary", text: this.t(this.file ? "kindle.connect-send" : "kindle.test"), attr: { type: "button" } });
    this.testButton.addEventListener("click", () => void this.connect());
    this.host.addEventListener("keydown", event => { if (event.key === "Enter" && !event.isComposing) { event.preventDefault(); void this.connect(); } });
    this.updateSteps();
  }
  updateSteps() {
    const paired = this.controller.isPaired();
    this.intro.textContent = this.t(paired ? "kindle.ready-intro" : "kindle.setup-intro");
    this.pairButton.textContent = this.t(paired ? "kindle.repair" : "kindle.pair");
    this.usbHeading.textContent = this.t(paired ? "kindle.usb-complete" : "kindle.step-usb");
    this.usbHeading.parentElement.classList.toggle("qiaomu-reader-kindle-pair-complete", paired);
    this.usbHelp.hidden = paired;
    this.wifi.hidden = !paired;
    this.testButton.hidden = !paired;
  }
  setBusy(busy) {
    this.busy = busy;
    for (const button of [this.pairButton, this.testButton, this.findButton]) button.disabled = busy;
    this.host.disabled = busy;
  }
  async pair() {
    if (this.busy) return; this.setBusy(true);
    this.status.textContent = this.t("kindle.pairing");
    try {
      const root = await chooseUsbRoot(this.controller);
      if (!root || this.closed) return;
      await this.controller.pairUsb(root, this.abortController.signal);
      if (this.closed) return;
      this.status.textContent = this.t("kindle.usb-done");
      this.pairButton.textContent = this.t("kindle.repair");
      this.updateSteps();
    } catch (error) { if (!this.closed) this.status.textContent = errorText(this.t, error); }
    finally { if (!this.closed) { this.setBusy(false); this.host.focus(); } }
  }
  async discover() {
    if (this.busy) return; this.setBusy(true);
    this.status.textContent = this.t("kindle.finding");
    try {
      const result = await this.controller.discover(this.abortController.signal);
      if (this.closed) return;
      this.host.value = result.host;
      this.status.textContent = this.t("kindle.found");
    } catch (error) { if (!this.closed) this.status.textContent = errorText(this.t, error); }
    finally { if (!this.closed) { this.setBusy(false); this.host.focus(); } }
  }
  async connect() {
    if (this.busy) return; this.setBusy(true);
    this.status.textContent = this.t("kindle.connecting");
    try {
      await this.controller.test({ ...this.controller.config(), host: this.host.value.trim() }, this.abortController.signal);
      if (this.closed) return;
      this.status.textContent = this.t("kindle.connected");
      if (this.file) { const file = this.file; this.close(); void sendBookToKindle(this.plugin, file, this.t); }
    } catch (error) { if (!this.closed) this.status.textContent = errorText(this.t, error); }
    finally { if (!this.closed) this.setBusy(false); }
  }
  onClose() {
    this.closed = true; this.abortController.abort();
    this.controller.trackModal(this, false); this.contentEl.empty();
  }
}

export function openKindlePairing(plugin, t, file = null) {
  if (!Platform.isDesktopApp) return;
  new KindlePairingModal(plugin, t, file).open();
}
export async function sendBookToKindle(plugin, file, t) {
  if (!Platform.isDesktopApp || !plugin.kindle?.isBook(file)) return;
  if (!plugin.kindle.isPaired() || !plugin.kindle.config().host) { openKindlePairing(plugin, t, file); return; }
  // The controller also deduplicates protocol calls. One progress notice per task.
  if (plugin._kindleSending) { new Notice(t("kindle.busy")); return; }
  plugin._kindleSending = true;
  const aborter = new AbortController();
  const content = document.createElement("div"); content.className = "qiaomu-reader-kindle-notice";
  const status = content.createSpan({ text: t("kindle.connecting") });
  const cancel = content.createEl("button", { text: t("kindle.cancel"), attr: { type: "button" } });
  cancel.addEventListener("click", () => { aborter.abort(); cancel.disabled = true; });
  const notice = new Notice(content, 0);
  let last = 0, lastPhase = "";
  try {
    await plugin.kindle.send(file, progress => {
      if (plugin._unloading) return;
      const now = Date.now();
      if (now - last < 200 && lastPhase === progress.phase) return;
      last = now; lastPhase = progress.phase;
      status.textContent = progress.phase === "verify" ? t("kindle.verifying") : t("kindle.sending", Math.min(100, Math.floor(progress.sent / progress.total * 100)));
    }, aborter.signal);
    if (!plugin._unloading) new Notice(t("kindle.sent", file.basename || file.name), 7000);
  } catch (error) {
    if (!plugin._unloading) new Notice(errorText(t, error), 9000);
  } finally { plugin._kindleSending = false; notice.hide(); }
}
