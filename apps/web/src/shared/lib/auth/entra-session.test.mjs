import assert from 'node:assert/strict';
import test from 'node:test';
import { createEntraSession } from './entra-session.ts';

class InteractionRequired extends Error {}
const account = { homeAccountId: 'home-1' };

function fakeMsal({ redirect, silent } = {}) {
  const state = { active: null, accounts: [account], cleared: [], silent };
  return {
    state,
    handleRedirectPromise: async () => {
      if (redirect instanceof Error) throw redirect;
      return redirect ?? null;
    },
    getActiveAccount: () => state.active,
    setActiveAccount: (value) => {
      state.active = value;
    },
    getAllAccounts: () => state.accounts,
    acquireTokenSilent: async (request) => state.silent(request),
    clearCache: async ({ account: cleared }) => {
      state.cleared.push(cleared);
      state.accounts = state.accounts.filter((item) => item !== cleared);
    },
    loginRedirect: async () => {},
    logoutRedirect: async () => {},
  };
}

async function session(msal) {
  let signedOut = 0;
  const result = await createEntraSession(msal, {
    scopes: ['api://x/access_as_user'],
    isInteractionRequired: (error) => error instanceof InteractionRequired,
    onSignedOut: () => {
      signedOut += 1;
    },
    navigate: () => {},
    redirectTarget: (state) => state ?? '/',
    currentPath: () => '/roadmap',
  });
  return { result, signedOut: () => signedOut };
}

test('an expired Microsoft session signs the user out and stays signed out after reload', async () => {
  const msal = fakeMsal({
    silent: async () => {
      throw new InteractionRequired('login required');
    },
  });
  const { result, signedOut } = await session(msal);
  assert.equal(result.provider.getSessionId(), 'home-1');

  assert.equal(await result.provider.getAccessToken(), null);
  assert.equal(result.provider.getSessionId(), null);
  assert.equal(signedOut(), 1);
  assert.deepEqual(msal.state.cleared, [account]);

  const reloaded = await session(msal);
  assert.equal(reloaded.result.provider.getSessionId(), null);
});

test('interaction required after a 401 rejects and signs out', async () => {
  let calls = 0;
  const msal = fakeMsal({
    silent: async () => {
      calls += 1;
      if (calls === 1) return { accessToken: 't1' };
      throw new InteractionRequired('consent');
    },
  });
  const { result, signedOut } = await session(msal);
  const token = await result.provider.getAccessToken();
  assert.equal(await result.provider.handleUnauthorized('home-1', token), 'rejected');
  assert.equal(result.provider.getSessionId(), null);
  assert.equal(signedOut(), 1);
  assert.deepEqual(msal.state.cleared, [account]);
});

test('a network failure while refreshing keeps the session', async () => {
  let calls = 0;
  const msal = fakeMsal({
    silent: async () => {
      calls += 1;
      if (calls === 1) return { accessToken: 't1' };
      throw new Error('network');
    },
  });
  const { result } = await session(msal);
  const token = await result.provider.getAccessToken();
  assert.equal(await result.provider.handleUnauthorized('home-1', token), 'unavailable');
  assert.equal(result.provider.getSessionId(), 'home-1');
});

test('a failed redirect sign-in is reported instead of breaking the provider', async () => {
  const failure = new Error('AADSTS65004: consent declined');
  const msal = fakeMsal({ redirect: failure });
  msal.state.accounts = [];
  const { result } = await session(msal);
  assert.equal(result.redirectError, failure);
  assert.equal(result.provider.kind, 'entra');
  assert.equal(result.provider.getSessionId(), null);
});
