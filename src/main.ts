import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";

type Account = {
  id: string;
  displayName: string;
  issuer: string;
  label: string;
  secret: string;
};

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

function LoadAccounts(): Account[] {
  try {
    const StoredAccounts = window.localStorage.getItem(StorageKey);
    if (!StoredAccounts) return [];
    const ParsedAccounts: unknown = JSON.parse(StoredAccounts);
    if (!Array.isArray(ParsedAccounts)) return [];
    return ParsedAccounts.filter((Account): Account is Account => (
      typeof Account?.id === "string"
      && typeof Account.displayName === "string"
      && typeof Account.issuer === "string"
      && typeof Account.label === "string"
      && typeof Account.secret === "string"
    ));
  } catch {
    return [];
  }
}

function SaveAccounts(): void {
  window.localStorage.setItem(StorageKey, JSON.stringify(Accounts));
}

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
  if (!NormalizedSecret) throw new Error("Chave TOTP vazia");

  let Bits = "";
  for (const Character of NormalizedSecret) {
    const Value = Alphabet.indexOf(Character);
    if (Value === -1) throw new Error("Chave TOTP inválida");
    Bits += Value.toString(2).padStart(5, "0");
  }

  const Bytes: number[] = [];
  for (let Index = 0; Index + 8 <= Bits.length; Index += 8) {
    Bytes.push(Number.parseInt(Bits.slice(Index, Index + 8), 2));
  }
  return new Uint8Array(Bytes);
}

async function GetTotpCode(Secret: string, Timestamp = Date.now()): Promise<string> {
  const Counter = Math.floor(Timestamp / 1000 / 30);
  const CounterBytes = new Uint8Array(8);
  let RemainingCounter = Counter;
  for (let Index = 7; Index >= 0; Index -= 1) {
    CounterBytes[Index] = RemainingCounter & 0xff;
    RemainingCounter = Math.floor(RemainingCounter / 256);
  }

  const SecretBytes = DecodeBase32(Secret);
  const SecretBuffer = new ArrayBuffer(SecretBytes.byteLength);
  new Uint8Array(SecretBuffer).set(SecretBytes);
  const CounterBuffer = new ArrayBuffer(CounterBytes.byteLength);
  new Uint8Array(CounterBuffer).set(CounterBytes);
  const Key = await crypto.subtle.importKey("raw", SecretBuffer, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const Signature = new Uint8Array(await crypto.subtle.sign("HMAC", Key, CounterBuffer));
  const Offset = Signature[Signature.length - 1] & 0x0f;
  const Value = ((Signature[Offset] & 0x7f) << 24)
    | (Signature[Offset + 1] << 16)
    | (Signature[Offset + 2] << 8)
    | Signature[Offset + 3];
  return String(Value % 1_000_000).padStart(6, "0");
}

function GetSecondsRemaining(): number {
  return 30 - Math.floor((Date.now() / 1000) % 30);
}

async function CopyText(Text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(Text);
  } catch {
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
  if (CountdownElement) CountdownElement.textContent = `Expira em ${GetSecondsRemaining()}s`;
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
  if (AccountCount) {
    AccountCount.textContent = `${Accounts.length} ${Accounts.length === 1 ? "conta" : "contas"}`;
  }

  Accounts.forEach((Account, Index) => {
    const Card = CreateElement("article", "account-card");
    Card.dataset.accountId = Account.id;
    Card.style.setProperty("--card-index", String(Index));

    const Details = CreateElement("div", "account-details");
    const Issuer = CreateElement("p", "account-issuer");
    Issuer.textContent = Account.issuer;
    const Name = CreateElement("h3");
    Name.textContent = Account.displayName;
    const Label = CreateElement("p", "account-label");
    Label.textContent = Account.label;
    Details.append(Issuer, Name, Label);

    const CodePanel = CreateElement("div", "totp-panel");
    const CodeCaption = CreateElement("span", "totp-caption");
    CodeCaption.textContent = "CÓDIGO ATUAL";
    const Code = CreateElement("strong", "totp-code");
    Code.textContent = "------";
    const Countdown = CreateElement("span", "totp-countdown");
    CodePanel.append(CodeCaption, Code, Countdown);

    const Actions = CreateElement("div", "account-actions");
    const CopyButton = CreateElement("button", "copy-code-button");
    CopyButton.type = "button";
    CopyButton.textContent = "Copiar código";
    CopyButton.addEventListener("click", async () => {
      try {
        const CurrentCode = await RefreshCode(Account, Card);
        await CopyText(CurrentCode);
        ShowToast(`Código de ${Account.displayName} copiado`);
      } catch (Error) {
        ShowToast(`Não foi possível gerar o código: ${String(Error)}`);
      }
    });

    const EditButton = CreateElement("button", "edit-account-button");
    EditButton.type = "button";
    EditButton.title = "Editar conta";
    EditButton.setAttribute("aria-label", `Editar ${Account.displayName}`);
    EditButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 16.5-.8 4.3 4.3-.8L18.7 8.8 15.2 5.3 4 16.5Z" /><path d="m13.8 6.7 3.5 3.5" /></svg>';
    EditButton.addEventListener("click", () => OpenAccountDialog(Account));

    const DeleteButton = CreateElement("button", "delete-account-button");
    DeleteButton.type = "button";
    DeleteButton.title = "Excluir conta";
    DeleteButton.setAttribute("aria-label", `Excluir ${Account.displayName}`);
    DeleteButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M9 7l1-3h4l1 3M6 7l1 13h10l1-13" /></svg>';
    DeleteButton.addEventListener("click", () => {
      if (!window.confirm(`Excluir a conta \"${Account.displayName}\"?`)) return;
      Accounts.splice(Index, 1);
      SaveAccounts();
      RenderAccounts();
      ShowToast(`${Account.displayName} foi excluída`);
    });

    Actions.append(CopyButton, EditButton, DeleteButton);
    Card.append(Details, CodePanel, Actions);
    AccountsGrid.append(Card);
    void RefreshCode(Account, Card).catch(() => {
      Code.textContent = "ERRO";
      Countdown.textContent = "Chave inválida";
    });
  });
}

function UpdateVisibleCodes(): void {
  document.querySelectorAll<HTMLElement>(".account-card").forEach((Card) => {
    const Account = Accounts.find((Item) => Item.id === Card.dataset.accountId);
    if (!Account) return;
    void RefreshCode(Account, Card).catch(() => undefined);
  });
}

function OpenAccountDialog(AccountToEdit?: Account): void {
  EditingAccountId = AccountToEdit?.id;
  if (AccountToEdit) {
    if (DisplayNameInput) DisplayNameInput.value = AccountToEdit.displayName;
    if (IssuerInput) IssuerInput.value = AccountToEdit.issuer;
    if (LabelInput) LabelInput.value = AccountToEdit.label;
    if (SecretInput) SecretInput.value = AccountToEdit.secret;
    if (DialogEyebrow) DialogEyebrow.textContent = "EDITAR CONTA";
    if (DialogTitle) DialogTitle.textContent = "Atualizar dados";
    if (SaveAccountButton) SaveAccountButton.textContent = "Salvar alterações";
  } else {
    AccountForm?.reset();
    if (DialogEyebrow) DialogEyebrow.textContent = "NOVA CONTA";
    if (DialogTitle) DialogTitle.textContent = "Adicionar ao cofre";
    if (SaveAccountButton) SaveAccountButton.textContent = "Salvar conta";
  }
  if (SecretInput) SecretInput.type = "password";
  if (ToggleSecretButton) {
    ToggleSecretButton.title = "Mostrar chave secreta";
    ToggleSecretButton.setAttribute("aria-label", "Mostrar chave secreta");
  }
  AccountDialog?.showModal();
  DisplayNameInput?.focus();
}

function CloseAccountDialog(): void {
  AccountDialog?.close();
  AccountForm?.reset();
  EditingAccountId = undefined;
}

async function CheckForUpdates(): Promise<void> {
  if (import.meta.env.DEV) return;

  try {
    const Update = await check();
    if (!Update) return;
    ShowToast(`Atualizando para a versão ${Update.version}`);
    await Update.downloadAndInstall();
    await relaunch();
  } catch {
    // An unavailable update server must not prevent access to 2FA codes.
  }
}

document.querySelector("#add-account-button")?.addEventListener("click", () => OpenAccountDialog());
document.querySelector("#empty-add-account-button")?.addEventListener("click", () => OpenAccountDialog());
document.querySelector("#close-dialog-button")?.addEventListener("click", CloseAccountDialog);
document.querySelector("#cancel-dialog-button")?.addEventListener("click", CloseAccountDialog);
ToggleSecretButton?.addEventListener("click", () => {
  if (!SecretInput) return;
  const ShouldReveal = SecretInput.type === "password";
  SecretInput.type = ShouldReveal ? "text" : "password";
  const Label = ShouldReveal ? "Ocultar chave secreta" : "Mostrar chave secreta";
  ToggleSecretButton.title = Label;
  ToggleSecretButton.setAttribute("aria-label", Label);
});
AccountForm?.addEventListener("submit", async (Event) => {
  Event.preventDefault();
  const SubmittedData = new FormData(AccountForm);
  const FormAccount = {
    displayName: String(SubmittedData.get("displayName") ?? "").trim(),
    issuer: String(SubmittedData.get("issuer") ?? "").trim(),
    label: String(SubmittedData.get("label") ?? "").trim(),
    secret: String(SubmittedData.get("secret") ?? "").trim(),
  };
  if (!FormAccount.displayName || !FormAccount.issuer || !FormAccount.label || !FormAccount.secret) return;

  try {
    await GetTotpCode(FormAccount.secret);
    const ExistingAccount = Accounts.find((Account) => Account.id === EditingAccountId);
    if (ExistingAccount) {
      Object.assign(ExistingAccount, FormAccount);
    } else {
      Accounts.push({ id: crypto.randomUUID(), ...FormAccount });
    }
    SaveAccounts();
    RenderAccounts();
    CloseAccountDialog();
    ShowToast(`${FormAccount.displayName} foi ${ExistingAccount ? "atualizada" : "adicionada"}`);
  } catch (Error) {
    ShowToast(`Não foi possível salvar a conta: ${String(Error)}`);
  }
});
AccountDialog?.addEventListener("click", (Event) => { if (Event.target === AccountDialog) CloseAccountDialog(); });
RenderAccounts();
window.setInterval(UpdateVisibleCodes, 1000);
void CheckForUpdates();
