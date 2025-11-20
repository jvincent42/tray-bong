import { useCallback, useEffect, useState } from 'react';

import type { ModelInfo, Provider, ProviderSettings } from '@/settings-data';

type SettingsAPI = {
  openPromptsFile: () => Promise<void>;
  getSettings: () => Promise<ProviderSettings>;
  saveSettings: (settings: ProviderSettings) => Promise<void>;
  getModels: (provider: Provider) => Promise<ModelInfo[]>;
};

declare global {
  var settingsAPI: SettingsAPI;
}

function handleOpenPromptsFile(): void {
  void settingsAPI.openPromptsFile();
}

function maskApiKey(key: string): string {
  if (key.length <= 8) {
    return '***';
  }
  const first = key.slice(0, 4);
  const last = key.slice(-4);
  return `${first}***${last}`;
}

export default function App() {
  const [provider, setProvider] = useState<Provider>('anthropic');
  const [model, setModel] = useState<string>('');
  const [apiKey, setApiKey] = useState<string>('');
  const [originalApiKey, setOriginalApiKey] = useState<string>('');
  const [apiKeyEdited, setApiKeyEdited] = useState<boolean>(false);
  const [apiKeyFocused, setApiKeyFocused] = useState<boolean>(false);
  const [ollamaEndpoint, setOllamaEndpoint] = useState<string>(
    'http://localhost:11434',
  );
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [saved, setSaved] = useState<boolean>(false);

  useEffect(() => {
    async function load(): Promise<void> {
      const settings = await settingsAPI.getSettings();
      setProvider(settings.provider);
      setModel(settings.model);
      setApiKey(settings.apiKey);
      setOriginalApiKey(settings.apiKey);
      setApiKeyEdited(false);
      setApiKeyFocused(false);
      setOllamaEndpoint(settings.ollamaEndpoint ?? 'http://localhost:11434');
      const providerModels = await settingsAPI.getModels(settings.provider);
      setModels(providerModels);
    }

    void load();
  }, []);

  useEffect(() => {
    async function updateModels(): Promise<void> {
      const providerModels = await settingsAPI.getModels(provider);
      setModels(providerModels);
      // Default to first model when switching provider
      if (providerModels.length > 0) {
        setModel(providerModels[0].id);
      } else {
        // Ollama - allow free text input
        setModel('');
      }
    }

    void updateModels();
  }, [provider]);

  async function handleSave(): Promise<void> {
    // Use the edited API key if user was editing, otherwise keep original
    const keyToSave = apiKeyEdited ? apiKey : originalApiKey;
    await settingsAPI.saveSettings({
      provider,
      model,
      apiKey: keyToSave,
      ollamaEndpoint: provider === 'ollama' ? ollamaEndpoint : undefined,
    });
    // Update original key after save
    setOriginalApiKey(keyToSave);
    setApiKey(keyToSave);
    setApiKeyEdited(false);
    setApiKeyFocused(false);
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
    }, 2000);
  }

  const handleApiKeyFocus = useCallback(() => {
    setApiKeyFocused(true);
    // On focus, reset the text input to empty
    setApiKey('');
    setApiKeyEdited(false);
  }, []);

  const handleApiKeyBlur = useCallback(() => {
    setApiKeyFocused(false);
    // On blur: if user has typed, keep typed key; otherwise restore masked key
    if (!apiKeyEdited) {
      // User didn't type anything, restore masked key
      setApiKey(originalApiKey);
    }
    // If apiKeyEdited is true, keep the typed value (already in apiKey state)
  }, [apiKeyEdited, originalApiKey]);

  const handleApiKeyChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      // On type, replace original API key
      if (!apiKeyEdited) {
        setApiKeyEdited(true);
      }
      setApiKey(e.target.value);
    },
    [apiKeyEdited],
  );

  const isOllama = provider === 'ollama';
  const needsApiKey = !isOllama;

  return (
    <div
      className="flex h-full flex-col p-6"
      style={{ backgroundColor: 'var(--color-bg-primary)' }}
    >
      <h1
        className="mb-6 text-2xl font-bold"
        style={{ color: 'var(--color-text-primary)' }}
      >
        Settings
      </h1>

      <div className="flex flex-1 flex-col gap-4">
        <div>
          <label
            className="mb-2 block text-sm font-medium"
            htmlFor="provider"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            Provider
          </label>
          <select
            className="w-full rounded-md px-3 py-2 text-base shadow-sm focus:ring-1 focus:outline-none"
            id="provider"
            style={{
              border: '1px solid var(--color-border)',
              backgroundColor: 'var(--color-bg-input)',
              color: 'var(--color-text-primary)',
            }}
            value={provider}
            onChange={(e) => {
              setProvider(e.target.value as Provider);
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = 'var(--color-border-focus)';
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = 'var(--color-border)';
            }}
          >
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
            <option value="google">Google</option>
            <option value="ollama">Ollama</option>
          </select>
        </div>

        {isOllama ? (
          <div>
            <label
              className="mb-2 block text-sm font-medium"
              htmlFor="model"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              Model
            </label>
            <input
              className="w-full rounded-md px-3 py-2 text-base shadow-sm focus:ring-1 focus:outline-none"
              id="model"
              placeholder="e.g., llama3.2:1b"
              style={{
                border: '1px solid var(--color-border)',
                backgroundColor: 'var(--color-bg-input)',
                color: 'var(--color-text-primary)',
              }}
              type="text"
              value={model}
              onChange={(e) => {
                setModel(e.target.value);
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = 'var(--color-border-focus)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'var(--color-border)';
              }}
            />
            <p
              className="mt-1 text-xs"
              style={{ color: 'var(--color-text-muted)' }}
            >
              Tip: Run{' '}
              <code
                className="rounded px-1"
                style={{ backgroundColor: 'var(--color-bg-secondary)' }}
              >
                ollama pull llama3.2:1b
              </code>{' '}
              in a shell to download models
            </p>
          </div>
        ) : (
          <div>
            <label
              className="mb-2 block text-sm font-medium"
              htmlFor="model"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              Model
            </label>
            <select
              className="w-full rounded-md px-3 py-2 text-base shadow-sm focus:ring-1 focus:outline-none"
              id="model"
              style={{
                border: '1px solid var(--color-border)',
                backgroundColor: 'var(--color-bg-input)',
                color: 'var(--color-text-primary)',
              }}
              value={model}
              onChange={(e) => {
                setModel(e.target.value);
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = 'var(--color-border-focus)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'var(--color-border)';
              }}
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.displayName}
                </option>
              ))}
            </select>
          </div>
        )}

        {needsApiKey && (
          <div>
            <label
              className="mb-2 block text-sm font-medium"
              htmlFor="apiKey"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              API Key
            </label>
            <input
              className="w-full rounded-md px-3 py-2 text-base shadow-sm focus:ring-1 focus:outline-none"
              id="apiKey"
              placeholder="Enter API key"
              style={{
                border: '1px solid var(--color-border)',
                backgroundColor: 'var(--color-bg-input)',
                color: 'var(--color-text-primary)',
              }}
              type="text"
              value={
                apiKeyFocused || apiKeyEdited
                  ? apiKey
                  : maskApiKey(originalApiKey)
              }
              onBlur={(e) => {
                handleApiKeyBlur();
                e.currentTarget.style.borderColor = 'var(--color-border)';
              }}
              onChange={handleApiKeyChange}
              onFocus={(e) => {
                handleApiKeyFocus();
                e.currentTarget.style.borderColor = 'var(--color-border-focus)';
              }}
            />
          </div>
        )}

        {isOllama && (
          <div>
            <label
              className="mb-2 block text-sm font-medium"
              htmlFor="ollamaEndpoint"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              Ollama Endpoint
            </label>
            <input
              className="w-full rounded-md px-3 py-2 text-base shadow-sm focus:ring-1 focus:outline-none"
              id="ollamaEndpoint"
              placeholder="http://localhost:11434"
              style={{
                border: '1px solid var(--color-border)',
                backgroundColor: 'var(--color-bg-input)',
                color: 'var(--color-text-primary)',
              }}
              type="text"
              value={ollamaEndpoint}
              onChange={(e) => {
                setOllamaEndpoint(e.target.value);
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = 'var(--color-border-focus)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'var(--color-border)';
              }}
            />
          </div>
        )}

        <div className="mt-4 flex items-center justify-between">
          <button
            className="rounded-md px-4 py-2 text-base shadow-sm transition-colors"
            style={{
              border: '1px solid var(--color-button-secondary-border)',
              backgroundColor: 'var(--color-button-secondary)',
              color: 'var(--color-button-secondary-text)',
            }}
            onClick={handleOpenPromptsFile}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor =
                'var(--color-button-secondary-hover)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor =
                'var(--color-button-secondary)';
            }}
          >
            Reveal Prompts File
          </button>
          <button
            className="rounded-md px-6 py-2 text-base shadow-sm transition-colors"
            style={{
              backgroundColor: 'var(--color-button-primary)',
              color: 'white',
            }}
            onClick={handleSave}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor =
                'var(--color-button-primary-hover)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor =
                'var(--color-button-primary)';
            }}
          >
            {saved ? 'Saved!' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
