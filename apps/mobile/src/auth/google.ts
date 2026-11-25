// Web preview never loads native authentication code.
import { ClientFailure } from "./transport";
export const googleConfigured = () => false;
export async function googleProof(): Promise<string | null> {
  throw new ClientFailure("configuration");
}
