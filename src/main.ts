import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";
import { CurrentLocale, IsRightToLeft, Translate } from "./I18n";

type Account = { id: string; displayName: string; issuer: string; label: string; secret: string };

const StorageKey = "2fa-easy:accounts";
const Accounts: Account[] = LoadAccounts();
const AccountDialog = document.querySelector<HTMLDialogElement>("#account-dialog");
const AccountForm = document.querySelector<HTMLFormElement>("#account-form");
const AccountsGrid = document.querySelector<HTMLElement>("#accounts-grid");
const EmptyState = document.querySelector<HTMLElement>("#empty-state");
const Toast = document.querySelector<HTMLElement>("#toast");
const AccountCount = document.querySelector<HTMLElement>("#account-count");
const DisplayNameInput = document.querySelector<HTMLInputElement>("#display-name-input");
const IssuerInput = document.querySelector<HTMLInputElement>("#issuer-input");
const LabelInput = document.querySelector<HTMLInputElement>("#label-input");
const SecretInput = document.querySelector<HTMLInputElement>("#secret-input");
const DialogEyebrow = document.querySelector<HTMLElement>("#dialog-eyebrow");
const DialogTitle = document.querySelector<HTMLElement>("#dialog-title");
const SaveAccountButton = document.querySelector<HTMLButtonElement>("#save-account-button");
const ToggleSecretButton = document.querySelector<HTMLButtonElement>("#toggle-secret-button");
let ToastTimeout: number | undefined;
let EditingAccountId: string | undefined;

function ApplyStaticTranslations(): void {
  document.documentElement.lang = CurrentLocale;
  document.documentElement.dir = IsRightToLeft ? "rtl" : "ltr";
  document.body.classList.toggle("is-rtl", IsRightToLeft);
  document.querySelectorAll<HTMLElement>("[data-i18n]").forEach((Element) => {
    Element.textContent = Translate(Element.dataset.i18n as Parameters<typeof Translate>[0]);
  });
  document.querySelectorAll<HTMLInputElement>("[data-i18n-placeholder]").forEach((Element) => {
    Element.placeholder = Translate(Element.dataset.i18nPlaceholder as Parameters<typeof Translate>[0]);
  });
  document.querySelectorAll<HTMLElement>("[data-i18n-aria]").forEach((Element) => {
    const Label = Translate(Element.dataset.i18nAria as Parameters<typeof Translate>[0]);
    Element.setAttribute("aria-label", Label);
    Element.setAttribute("title", Label);
  });
}

function LoadAccounts(): Account[] {
  try {
    const StoredAccounts = window.localStorage.getItem(StorageKey);
    if (!StoredAccounts) return [];
    const ParsedAccounts: unknown = JSON.parse(StoredAccounts);
    if (!Array.isArray(ParsedAccounts)) return [];
    return ParsedAccounts.filter((Account): Account is Account => typeof Account?.id === "string" && typeof Account.displayName === "string" && typeof Account.issuer === "string" && typeof Account.label === "string" && typeof Account.secret === "string");
  } catch { return []; }
}

function SaveAccounts(): void { window.localStorage.setItem(StorageKey, JSON.stringify(Accounts)); }

function ShowToast(Message: string): void {
  if (!Toast) return;
  Toast.textContent = Message;
  Toast.classList.add("is-visible");
  window.clearTimeout(ToastTimeout);
  ToastTimeout = window.setTimeout(() => Toast.classList.remove("is-visible"), 2600);
}

function DecodeBase32(Secret: string): Uint8Array {
  const Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const NormalizedSecret = Secret.toUpperCase().replace(/[^A-Z2-7]/g, "");
  if (!NormalizedSecret) throw new Error(Translate("invalidSecret"));
  let Bits = "";
  for (const Character of NormalizedSecret) {
    const Value = Alphabet.indexOf(Character);
    if (Value === -1) throw new Error(Translate("invalidSecret"));
    Bits += Value.toString(2).padStart(5, "0");
  }
  const Bytes: number[] = [];
  for (let Index = 0; Index + 8 <= Bits.length; Index += 8) Bytes.push(Number.parseInt(Bits.slice(Index, Index + 8), 2));
  return new Uint8Array(Bytes);
}

async function GetTotpCode(Secret: string, Timestamp = Date.now()): Promise<string> {
  const Counter = Math.floor(Timestamp / 1000 / 30);
  const CounterBytes = new Uint8Array(8);
  let RemainingCounter = Counter;
  for (let Index = 7; Index >= 0; Index -= 1) { CounterBytes[Index] = RemainingCounter & 0xff; RemainingCounter = Math.floor(RemainingCounter / 256); }
  const SecretBytes = DecodeBase32(Secret);
  const SecretBuffer = new ArrayBuffer(SecretBytes.byteLength);
  new Uint8Array(SecretBuffer).set(SecretBytes);
  const CounterBuffer = new ArrayBuffer(CounterBytes.byteLength);
  new Uint8Array(CounterBuffer).set(CounterBytes);
  const Key = await crypto.subtle.importKey("raw", SecretBuffer, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const Signature = new Uint8Array(await crypto.subtle.sign("HMAC", Key, CounterBuffer));
  const Offset = Signature[Signature.length - 1] & 0x0f;
  const Value = ((Signature[Offset] & 0x7f) << 24) | (Signature[Offset + 1] << 16) | (Signature[Offset + 2] << 8) | Signature[Offset + 3];
  return String(Value % 1_000_000).padStart(6, "0");
}

function GetSecondsRemaining(): number { return 30 - Math.floor((Date.now() / 1000) % 30); }

async function CopyText(Text: string): Promise<void> {
  try { await navigator.clipboard.writeText(Text); } catch {
    const TemporaryInput = document.createElement("textarea");
    TemporaryInput.value = Text;
    TemporaryInput.style.position = "fixed";
    TemporaryInput.style.opacity = "0";
    document.body.append(TemporaryInput);
    TemporaryInput.select();
    document.execCommand("copy");
    TemporaryInput.remove();
  }
}

function CreateElement<TagName extends keyof HTMLElementTagNameMap>(TagName: TagName, ClassName?: string): HTMLElementTagNameMap[TagName] {
  const Element = document.createElement(TagName);
  if (ClassName) Element.className = ClassName;
  return Element;
}

function SetCode(Card: HTMLElement, Code: string): void {
  const CodeElement = Card.querySelector<HTMLElement>(".totp-code");
  const CountdownElement = Card.querySelector<HTMLElement>(".totp-countdown");
  if (CodeElement) CodeElement.textContent = `${Code.slice(0, 3)} ${Code.slice(3)}`;
  if (CountdownElement) CountdownElement.textContent = Translate("expiresIn", { seconds: GetSecondsRemaining() });
}

async function RefreshCode(Account: Account, Card: HTMLElement): Promise<string> {
  const Code = await GetTotpCode(Account.secret);
  SetCode(Card, Code);
  return Code;
}

function RenderAccounts(): void {
  if (!AccountsGrid || !EmptyState) return;
  AccountsGrid.replaceChildren();
  EmptyState.hidden = Accounts.length > 0;
  if (AccountCount) AccountCount.textContent = `${Accounts.length} ${Accounts.length === 1 ? Translate("account") : Translate("accounts")}`;
  Accounts.forEach((Account, Index) => {
    const Card = CreateElement("article", "account-card");
    Card.dataset.accountId = Account.id;
    Card.style.setProperty("--card-index", String(Index));
    const Details = CreateElement("div", "account-details");
    const Issuer = CreateElement("p", "account-issuer"); Issuer.textContent = Account.issuer;
    const Name = CreateElement("h3"); Name.textContent = Account.displayName;
    const Label = CreateElement("p", "account-label"); Label.textContent = Account.label;
    Details.append(Issuer, Name, Label);
    const CodePanel = CreateElement("div", "totp-panel");
    const CodeCaption = CreateElement("span", "totp-caption"); CodeCaption.textContent = Translate("currentCode");
    const Code = CreateElement("strong", "totp-code"); Code.textContent = "------";
    const Countdown = CreateElement("span", "totp-countdown");
    CodePanel.append(CodeCaption, Code, Countdown);
    const Actions = CreateElement("div", "account-actions");
    const CopyButton = CreateElement("button", "copy-code-button");
    CopyButton.type = "button"; CopyButton.textContent = Translate("copyCode");
    CopyButton.addEventListener("click", async () => {
      try { await CopyText(await RefreshCode(Account, Card)); ShowToast(Translate("codeCopied", { name: Account.displayName })); }
      catch (Error) { ShowToast(`${Translate("error")}: ${String(Error)}`); }
    });
    const EditButton = CreateElement("button", "edit-account-button");
    EditButton.type = "button"; EditButton.title = Translate("editAccount"); EditButton.setAttribute("aria-label", `${Translate("editAccount")}: ${Account.displayName}`);
    EditButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 16.5-.8 4.3 4.3-.8L18.7 8.8 15.2 5.3 4 16.5Z" /><path d="m13.8 6.7 3.5 3.5" /></svg>';
    EditButton.addEventListener("click", () => OpenAccountDialog(Account));
    const DeleteButton = CreateElement("button", "delete-account-button");
    DeleteButton.type = "button"; DeleteButton.title = Translate("deleteAccount"); DeleteButton.setAttribute("aria-label", `${Translate("deleteAccount")}: ${Account.displayName}`);
    DeleteButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M9 7l1-3h4l1 3M6 7l1 13h10l1-13" /></svg>';
    DeleteButton.addEventListener("click", () => {
      if (!window.confirm(Translate("deleteConfirmation", { name: Account.displayName }))) return;
      Accounts.splice(Index, 1); SaveAccounts(); RenderAccounts(); ShowToast(Translate("accountDeleted", { name: Account.displayName }));
    });
    Actions.append(CopyButton, EditButton, DeleteButton);
    Card.append(Details, CodePanel, Actions);
    AccountsGrid.append(Card);
    void RefreshCode(Account, Card).catch(() => { Code.textContent = Translate("error"); Countdown.textContent = Translate("invalidSecret"); });
  });
}

function UpdateVisibleCodes(): void {
  document.querySelectorAll<HTMLElement>(".account-card").forEach((Card) => {
    const Account = Accounts.find((Item) => Item.id === Card.dataset.accountId);
    if (Account) void RefreshCode(Account, Card).catch(() => undefined);
  });
}

function SetSecretVisibility(IsVisible: boolean): void {
  if (!SecretInput || !ToggleSecretButton) return;
  SecretInput.type = IsVisible ? "text" : "password";
  const Label = Translate(IsVisible ? "hideSecret" : "showSecret");
  ToggleSecretButton.title = Label;
  ToggleSecretButton.setAttribute("aria-label", Label);
}

function OpenAccountDialog(AccountToEdit?: Account): void {
  EditingAccountId = AccountToEdit?.id;
  if (AccountToEdit) {
    if (DisplayNameInput) DisplayNameInput.value = AccountToEdit.displayName;
    if (IssuerInput) IssuerInput.value = AccountToEdit.issuer;
    if (LabelInput) LabelInput.value = AccountToEdit.label;
    if (SecretInput) SecretInput.value = AccountToEdit.secret;
    if (DialogEyebrow) DialogEyebrow.textContent = Translate("editAccountEyebrow");
    if (DialogTitle) DialogTitle.textContent = Translate("updateAccount");
    if (SaveAccountButton) SaveAccountButton.textContent = Translate("saveChanges");
  } else {
    AccountForm?.reset();
    if (DialogEyebrow) DialogEyebrow.textContent = Translate("addAccountEyebrow");
    if (DialogTitle) DialogTitle.textContent = Translate("addToVault");
    if (SaveAccountButton) SaveAccountButton.textContent = Translate("saveAccount");
  }
  SetSecretVisibility(false);
  AccountDialog?.showModal();
  DisplayNameInput?.focus();
}

function CloseAccountDialog(): void { AccountDialog?.close(); AccountForm?.reset(); EditingAccountId = undefined; }

async function CheckForUpdates(): Promise<void> {
  if (import.meta.env.DEV) return;
  try { const Update = await check(); if (!Update) return; ShowToast(Translate("updatingTo", { version: Update.version })); await Update.downloadAndInstall(); await relaunch(); } catch { /* Updates must never block access to codes */ }
}

document.querySelector("#add-account-button")?.addEventListener("click", () => OpenAccountDialog());
document.querySelector("#empty-add-account-button")?.addEventListener("click", () => OpenAccountDialog());
document.querySelector("#close-dialog-button")?.addEventListener("click", CloseAccountDialog);
document.querySelector("#cancel-dialog-button")?.addEventListener("click", CloseAccountDialog);
ToggleSecretButton?.addEventListener("click", () => SetSecretVisibility(SecretInput?.type === "password"));
AccountForm?.addEventListener("submit", async (Event) => {
  Event.preventDefault();
  const SubmittedData = new FormData(AccountForm);
  const FormAccount = { displayName: String(SubmittedData.get("displayName") ?? "").trim(), issuer: String(SubmittedData.get("issuer") ?? "").trim(), label: String(SubmittedData.get("label") ?? "").trim(), secret: String(SubmittedData.get("secret") ?? "").trim() };
  if (!FormAccount.displayName || !FormAccount.issuer || !FormAccount.label || !FormAccount.secret) return;
  try {
    await GetTotpCode(FormAccount.secret);
    const ExistingAccount = Accounts.find((Account) => Account.id === EditingAccountId);
    if (ExistingAccount) Object.assign(ExistingAccount, FormAccount); else Accounts.push({ id: crypto.randomUUID(), ...FormAccount });
    SaveAccounts(); RenderAccounts(); CloseAccountDialog(); ShowToast(Translate(ExistingAccount ? "accountUpdated" : "accountSaved", { name: FormAccount.displayName }));
  } catch (Error) { ShowToast(`${Translate("error")}: ${String(Error)}`); }
});
AccountDialog?.addEventListener("click", (Event) => { if (Event.target === AccountDialog) CloseAccountDialog(); });
ApplyStaticTranslations();
RenderAccounts();
window.setInterval(UpdateVisibleCodes, 1000);
void CheckForUpdates();
