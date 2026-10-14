// Keykeeper expiration dates. Any item can expire on a date, stored on the item
// as a text custom field named EXPIRES_FIELD_NAME holding an ISO date
// (YYYY-MM-DD). It is a text field, not hidden, because a date isn't secret and
// list views only carry text fields' values, so lists can show badges without
// decrypting every item. Cards also expire on their own expiry month.

import { FieldType } from "@bitwarden/common/vault/enums";
import { FieldView } from "@bitwarden/common/vault/models/view/field.view";

export const EXPIRES_FIELD_NAME = "keykeeper.expires";

/** Items count as expiring soon this many days ahead. */
export const EXPIRING_SOON_DAYS = 30;

type FieldLike = { name?: string | null; value?: string | null };
type CardLike = { expMonth?: string | null; expYear?: string | null };
export type ItemWithExpiration = { fields?: FieldLike[] | null; card?: CardLike | null };

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Reads "YYYY-MM-DD" as local midnight, or null when it isn't a real date. */
export function parseIsoDate(value: string | null | undefined): Date | null {
  const match = ISO_DATE.exec(value ?? "");
  if (!match) {
    return null;
  }
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    ? date
    : null;
}

/** The date stored on the item, as "YYYY-MM-DD", when there is a valid one. */
export function storedExpiration(item: ItemWithExpiration): string | null {
  const value = (item.fields ?? []).find((f) => f.name === EXPIRES_FIELD_NAME)?.value ?? null;
  return parseIsoDate(value) ? value : null;
}

/** Sets or clears the stored date. The caller saves the item. */
export function setStoredExpiration(
  cipher: { fields?: FieldView[] },
  isoDate: string | null,
): void {
  const others = (cipher.fields ?? []).filter((f) => f.name !== EXPIRES_FIELD_NAME);
  if (!parseIsoDate(isoDate)) {
    cipher.fields = others;
    return;
  }
  const field = new FieldView();
  field.name = EXPIRES_FIELD_NAME;
  field.type = FieldType.Text;
  field.value = isoDate!;
  cipher.fields = [...others, field];
}

/** A card expires at the end of its expiry month. */
export function cardExpiration(card: CardLike | null | undefined): Date | null {
  const month = Number(card?.expMonth);
  let year = Number(card?.expYear);
  if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year) || year <= 0) {
    return null;
  }
  if (year < 100) {
    year += 2000;
  }
  return new Date(year, month, 0); // day 0 of the next month: the last day of this one
}

/** When the item expires: its stored date, else a card's expiry, else never. */
export function itemExpiration(item: ItemWithExpiration | null | undefined): Date | null {
  if (!item) {
    return null;
  }
  return parseIsoDate(storedExpiration(item)) ?? cardExpiration(item.card);
}

export type ExpirationStatus = {
  state: "expired" | "today" | "soon" | "later";
  /** Whole days from today to the expiry date; negative once expired. */
  days: number;
};

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

export function expirationStatus(expires: Date, today: Date = new Date()): ExpirationStatus {
  const days = Math.round(
    (startOfDay(expires).getTime() - startOfDay(today).getTime()) / (24 * 60 * 60 * 1000),
  );
  const state =
    days < 0 ? "expired" : days === 0 ? "today" : days <= EXPIRING_SOON_DAYS ? "soon" : "later";
  return { state, days };
}

// English until Keykeeper's own strings are translated.
export function expirationLabel({ state, days }: ExpirationStatus): string {
  switch (state) {
    case "expired":
      return days === -1 ? "Expired yesterday" : `Expired ${-days} days ago`;
    case "today":
      return "Expires today";
    default:
      return days === 1 ? "Expires tomorrow" : `Expires in ${days} days`;
  }
}

/** Badge colors for a status, in the component library's variants. */
export function expirationBadgeVariant(status: ExpirationStatus): "danger" | "warning" | "subtle" {
  return status.state === "expired" ? "danger" : status.state === "later" ? "subtle" : "warning";
}
