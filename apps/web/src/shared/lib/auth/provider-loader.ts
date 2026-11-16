/**
 * Loads the sign-in provider once from the API config. Concurrent callers share one request;
 * a failed request is forgotten so the next call can try again.
 */
export function createProviderLoader<Config, Provider>(
  fetchConfig: () => Promise<Config>,
  build: (config: Config) => Provider | Promise<Provider>,
) {
  let pending: Promise<Provider> | null = null;
  let resolved: Provider | null = null;

  return {
    load(): Promise<Provider> {
      pending ??= fetchConfig()
        .then(build)
        .then((provider) => {
          resolved = provider;
          return provider;
        })
        .catch((error: unknown) => {
          pending = null;
          throw error;
        });
      return pending;
    },
    current(): Provider | null {
      return resolved;
    },
  };
}
