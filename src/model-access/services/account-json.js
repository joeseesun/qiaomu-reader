import { accountText as t } from "../i18n/accounts.js";
function accountObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(t("invalid"));
  return value;
}
function accountString(value) {
  if (typeof value !== "string" || !value) throw new Error(t("invalid"));
  return value;
}
function accountExpiry(value) {
  if (value === void 0) return Date.now() + 36e5;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) throw new Error(t("invalid"));
  return Date.now() + value * 1e3;
}
export {
  accountExpiry,
  accountObject,
  accountString
};
