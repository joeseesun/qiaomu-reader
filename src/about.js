import { setIcon } from "obsidian";
import { ABOUT_QR } from "./about-qr.js";

export function renderReaderAbout(container, { version, t, icon, onGuide, onUpdates }) {
  const repo = "https://github.com/joeseesun/qiaomu-reader";
  const external = { target: "_blank", rel: "noopener noreferrer" };
  const root = container.createDiv("qiaomu-reader-about");
  const hero = root.createDiv("qiaomu-reader-about-hero");
  icon(hero.createDiv({ cls: "qiaomu-reader-about-logo", attr: { "aria-hidden": "true" } }), "qiaomu-library");
  const intro = hero.createDiv("qiaomu-reader-about-intro");
  intro.createEl("h3", { text: "Qiaomu Reader" });
  intro.createEl("p", { text: t("about.tagline") });
  const release = hero.createDiv("qiaomu-reader-about-release");
  release.createSpan({ cls: "qiaomu-reader-about-label", text: t("about.version") });
  release.createSpan({ cls: "qiaomu-reader-about-version", text: `v${version}` });
  const actions = hero.createDiv("qiaomu-reader-about-actions");
  for (const [name, label, run] of [
    ["history", t("about.changelog"), onUpdates],
    ["book-open", t("about.guide"), onGuide],
  ]) {
    const button = actions.createEl("button", { cls: "qiaomu-reader-about-action", attr: { type: "button" } });
    setIcon(button.createSpan({ attr: { "aria-hidden": "true" } }), name);
    button.createSpan({ text: label });
    button.addEventListener("click", run);
  }
  const feedback = actions.createEl("a", { cls: "qiaomu-reader-about-action", href: `${repo}/issues`, attr: external });
  setIcon(feedback.createSpan({ attr: { "aria-hidden": "true" } }), "message-circle");
  feedback.createSpan({ text: t("about.feedback") });

  const support = root.createDiv("qiaomu-reader-about-support");
  support.createEl("h4", { text: t("about.support") });
  support.createEl("p", { cls: "qiaomu-reader-about-description", text: t("about.support-description") });
  const grid = support.createDiv("qiaomu-reader-about-grid");
  for (const [name, key, src] of [["newspaper", "follow", ABOUT_QR.wechat], ["coffee", "tip", ABOUT_QR.reward]]) {
    const card = grid.createEl("figure", { cls: "qiaomu-reader-about-qr" });
    card.createDiv("qiaomu-reader-about-qr-image").createEl("img", {
      attr: { src, alt: t(`about.${key}-alt`), width: "164", height: "164" },
    });
    const caption = card.createEl("figcaption");
    const title = caption.createDiv("qiaomu-reader-about-qr-title");
    setIcon(title.createSpan({ attr: { "aria-hidden": "true" } }), name);
    title.createSpan({ text: t(`about.${key}`) });
    caption.createDiv({ cls: "qiaomu-reader-about-qr-hint", text: t(`about.${key}-hint`) });
  }
  const footer = root.createDiv("qiaomu-reader-about-footer");
  const links = footer.createDiv("qiaomu-reader-about-links");
  for (const [label, href] of [["qiaomu.ai", "https://qiaomu.ai/"], [t("about.blog"), "https://blog.qiaomu.ai/"], ["X", "https://x.com/vista8"], ["GitHub", repo], [t("about.email"), "mailto:vista8@gmail.com"]]) {
    links.createEl("a", { text: label, href, attr: external });
  }
  footer.createEl("p", { text: t("about.credit") });
}
