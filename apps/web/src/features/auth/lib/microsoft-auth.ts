'use client';

/**
 * Microsoft / Entra ID (MSAL) sign-in entry point.
 * Wire @azure/msal-browser here when tenant + clientId are configured.
 */
export function isMicrosoftAuthConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_AZURE_CLIENT_ID && process.env.NEXT_PUBLIC_AZURE_TENANT_ID,
  );
}

export async function loginWithMicrosoft(): Promise<void> {
  if (!isMicrosoftAuthConfigured()) {
    throw new Error(
      'Вход через Microsoft пока не настроен. Задайте NEXT_PUBLIC_AZURE_CLIENT_ID и NEXT_PUBLIC_AZURE_TENANT_ID.',
    );
  }

  // TODO: PublicClientApplication.loginRedirect / loginPopup + exchange token with API
  throw new Error('MSAL ещё не подключён');
}
