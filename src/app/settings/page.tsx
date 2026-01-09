'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Key, Trash2, Eye, EyeOff, Upload, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { isServerApiKeyConfigured } from '@/lib/actions';
import { getBrowserApiKey, setBrowserApiKey, clearBrowserApiKey } from '@/lib/settings';
import { exportAllData, importData } from '@/lib/db';

export default function SettingsPage() {
  const router = useRouter();
  const [isServerConfigured, setIsServerConfigured] = useState<boolean | null>(null);
  const [browserKey, setBrowserKey] = useState('');
  const [savedKey, setSavedKey] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    checkConfig();
    const saved = getBrowserApiKey();
    if (saved) {
      setBrowserKey(saved);
      setSavedKey(saved);
    }
  }, []);

  useEffect(() => {
    if (browserKey !== savedKey && showKey) {
      setShowKey(false);
    }
  }, [browserKey, savedKey, showKey]);

  const checkConfig = async () => {
    const configured = await isServerApiKeyConfigured();
    setIsServerConfigured(configured);
  };

  const handleSaveKey = () => {
    setIsSaving(true);
    setBrowserApiKey(browserKey);
    setTimeout(() => {
      setIsSaving(false);
      setSavedKey(browserKey);
      alert('API Key saved locally in your browser.');
    }, 500);
  };

  const handleClearKey = () => {
    if (confirm('Clear the locally saved API Key?')) {
      clearBrowserApiKey();
      setBrowserKey('');
      setSavedKey('');
      setShowKey(false);
    }
  };

  const handleExport = async () => {
    const data = await exportAllData();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `yapmap-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const imported = await importData(text);
    alert(`Imported ${imported} projects.`);
    e.target.value = '';
  };

  const hasAnyKey = isServerConfigured || !!browserKey;
  const canRevealKey = !!savedKey && browserKey === savedKey;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push('/app')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-xl font-display font-bold">Settings</h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-2xl">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Key className="w-5 h-5 text-primary" />
              </div>
              <div>
                <CardTitle>AI Provider Configuration</CardTitle>
                <CardDescription>
                  Bring your own key (optional). Stored locally in your browser.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/30">
              <div className="text-lg">{hasAnyKey ? '✅' : '❌'}</div>
              <div>
                <div className="text-sm font-medium">
                  {!hasAnyKey ? 'API Key Missing' : isServerConfigured ? 'Server Key Active' : 'Browser Key Active'}
                </div>
                <div className="text-xs text-muted-foreground">
                  {isServerConfigured
                    ? 'Server key is active. You can optionally override with a browser key.'
                    : browserKey
                    ? 'Using the API key stored in your browser.'
                    : 'No API key found. AI features are disabled.'}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Bring your own key (optional)</label>
              <div className="relative">
                <Input
                  type={showKey ? 'text' : 'password'}
                  placeholder="sk-..."
                  value={browserKey}
                  onChange={(e) => setBrowserKey(e.target.value)}
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full"
                  onClick={() => {
                    if (!canRevealKey) return;
                    setShowKey(!showKey);
                  }}
                  disabled={!canRevealKey}
                >
                  {showKey ? (
                    <EyeOff className="w-4 h-4 text-muted-foreground" />
                  ) : (
                    <Eye className="w-4 h-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Stored only in your browser (local storage). Never sent to our servers except for API requests you initiate. OpenAI is supported today, with more providers coming.
              </p>
            </div>

            <div className="flex gap-2">
              <Button onClick={handleSaveKey} className="flex-1" disabled={isSaving || !browserKey}>
                {isSaving ? 'Saving...' : 'Save Browser Key'}
              </Button>
              {getBrowserApiKey() && (
                <Button variant="outline" onClick={handleClearKey}>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Clear
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">Data Management</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" onClick={handleImport}>
                <Upload className="w-4 h-4 mr-2" />
                Import
              </Button>
              <Button variant="outline" onClick={handleExport}>
                <Download className="w-4 h-4 mr-2" />
                Export
              </Button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleFileChange}
              className="hidden"
            />
            <p className="text-sm text-muted-foreground">
              Your projects are stored locally in your browser. Export to back them up or import on another device.
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
