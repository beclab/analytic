import { Auth } from './types';

export async function canViewWebsite(
  { user, shareToken }: Auth,
  websiteId: string,
) {
  return true;
}
